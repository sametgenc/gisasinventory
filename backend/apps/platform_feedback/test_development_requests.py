"""Behavioral checks for private improvement requests, history, and safe files."""

from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from zipfile import ZipFile

from allauth.account.models import EmailAddress
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import transaction
from django.db.migrations.executor import MigrationExecutor
from django.db import connection
from django.apps import apps
from django.test import TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.notifications.models import Notification
from apps.notifications.permissions import visible_notifications
from apps.notifications.tasks import recipient_for
from apps.tenants.models import Tenant
from apps.user.models import User, UserRole
from .models import PlatformFeedback, PlatformFeedbackAttachment, PlatformFeedbackEvent
from .services import apply_management


@override_settings(
    CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
                        'LOCATION': 'development-feedback-behavior-tests'}},
    FEEDBACK_MEMBER_WRITE_BURST='1000/minute',
    FEEDBACK_MEMBER_WRITE_SUSTAINED='10000/hour',
    FEEDBACK_ADMIN_WRITE_BURST='1000/minute',
    FEEDBACK_ADMIN_WRITE_SUSTAINED='10000/hour',
)
class DevelopmentRequestTests(APITestCase):
    def setUp(self):
        self.directory = TemporaryDirectory()
        self.settings_override = override_settings(MEDIA_ROOT=self.directory.name)
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)
        self.addCleanup(self.directory.cleanup)
        self.shipyard = Tenant.objects.create(name='Request Owner', slug='request-owner')
        self.other_shipyard = Tenant.objects.create(name='Other Owner', slug='other-owner')
        self.author = User.objects.create(username='author', email='author@example.test', tenant=self.shipyard)
        self.peer = User.objects.create(username='peer', tenant=self.shipyard)
        self.manager = User.objects.create(username='manager', tenant=self.shipyard, role=UserRole.TENANT_ADMIN)
        self.other = User.objects.create(username='other', tenant=self.other_shipyard)
        self.admin = User.objects.create(username='admin', email='admin@example.test', is_superuser=True)
        self.second_admin = User.objects.create(username='second-admin', email='second@example.test', is_superuser=True)
        self.endpoint = '/api/platform-feedback/'
        self.client.force_authenticate(self.author)

    def create_request(self, **fields):
        response = self.client.post(self.endpoint, {
            'type': 'feature', 'subject': 'Simpler import', 'description': 'Private description',
            'proposed_solution': 'Preview model quantities', 'expected_benefit': 'Reduce mistakes',
            'area': 'excel', **fields,
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return PlatformFeedback.objects.get(pk=response.data['id'])

    def test_create_captures_membership_and_optional_proposal_with_default_open(self):
        feedback = self.create_request(type='suggestion')
        self.assertEqual(feedback.submitted_by, self.author)
        self.assertEqual(feedback.tenant, self.shipyard)
        self.assertEqual(feedback.status, 'open')
        self.assertEqual(feedback.priority, 'normal')
        self.assertEqual(feedback.proposed_solution, 'Preview model quantities')
        self.assertEqual(feedback.history.get().kind, 'created')
        notices = Notification.objects.filter(content__feedback_id=str(feedback.pk))
        self.assertEqual(notices.count(), 2)
        self.assertTrue(all(item.content['audience_global_admin'] for item in notices))
        for notice in notices:
            self.assertIn('/development-requests?request=', notice.content['url'])
            self.assertNotIn('Private description', str(notice.content))
            self.assertNotIn('Simpler import', str(notice.content))

    def test_forbidden_ownership_and_management_fields_rejected_without_write(self):
        for field, value in [('tenant', self.other_shipyard.pk), ('submitted_by', self.peer.pk),
                             ('status', 'done'), ('priority', 'high'), ('assigned_to', self.admin.pk)]:
            response = self.client.post(self.endpoint, {'subject': 'Test', 'description': 'Test', field: value}, format='json')
            self.assertEqual(response.status_code, 400)
        self.assertFalse(PlatformFeedback.objects.exists())

    def test_author_only_scope_denies_same_shipyard_peer_manager_and_other_shipyard(self):
        feedback = self.create_request()
        for user in [self.peer, self.manager, self.other]:
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(self.endpoint).data['count'], 0)
            self.assertEqual(self.client.get(f'{self.endpoint}{feedback.pk}/').status_code, 404)
            self.assertEqual(self.client.post(f'{self.endpoint}{feedback.pk}/messages/', {'body': 'Hello'}, format='json').status_code, 404)

    def test_options_metadata_does_not_enumerate_private_users(self):
        response = self.client.options(self.endpoint)
        self.assertEqual(response.status_code, 200)
        self.assertNotIn(self.admin.email, str(response.data))
        self.assertNotIn(self.second_admin.username, str(response.data))
        self.assertNotIn(self.peer.username, str(response.data))

    def test_author_cannot_patch_delete_triage_or_read_options(self):
        feedback = self.create_request()
        for method, url in [('patch', f'{self.endpoint}{feedback.pk}/'), ('delete', f'{self.endpoint}{feedback.pk}/'),
                            ('post', f'{self.endpoint}{feedback.pk}/triage/')]:
            response = getattr(self.client, method)(url, {'status': 'done'}, format='json')
            self.assertEqual(response.status_code, 403)
        self.assertEqual(self.client.get(f'{self.endpoint}management_options/').status_code, 403)
        feedback.refresh_from_db()
        self.assertEqual(feedback.status, 'open')

    def test_inactive_members_and_fake_admins_do_not_gain_management(self):
        feedback = self.create_request()
        fake = User.objects.create(username='fake-global', role=UserRole.PLATFORM_ADMIN)
        tenant_superuser = User.objects.create(username='tenant-super', is_superuser=True, tenant=self.shipyard)
        self.client.force_authenticate(fake)
        self.assertEqual(self.client.get(self.endpoint).status_code, 403)
        self.client.force_authenticate(tenant_superuser)
        self.assertEqual(self.client.get(self.endpoint).data['count'], 0)
        self.assertEqual(self.client.post(f'{self.endpoint}{feedback.pk}/triage/', {'status': 'done'}, format='json').status_code, 403)
        self.author.is_active = False
        self.author.save(update_fields=['is_active'])
        self.client.force_authenticate(self.author)
        self.assertEqual(self.client.get(self.endpoint).status_code, 403)
        self.author.is_active = True
        self.author.save(update_fields=['is_active'])
        self.shipyard.is_active = False
        self.shipyard.save(update_fields=['is_active'])
        self.author.refresh_from_db()
        self.assertEqual(self.client.get(self.endpoint).status_code, 403)

    def test_transfer_hides_previous_feedback_and_author_notifications(self):
        feedback = self.create_request()
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(f'{self.endpoint}{feedback.pk}/messages/', {'body': 'Private answer'}, format='json').status_code, 200)
        self.author.tenant = self.other_shipyard
        self.author.save(update_fields=['tenant'])
        self.client.force_authenticate(self.author)
        self.assertEqual(self.client.get(self.endpoint).data['count'], 0)
        self.assertEqual(self.client.get(f'{self.endpoint}{feedback.pk}/').status_code, 404)
        self.assertFalse(visible_notifications(self.author).filter(content__feedback_id=str(feedback.pk)).exists())
        notice = Notification.objects.filter(user=self.author).get()
        notice.user = self.author
        self.assertEqual(recipient_for(notice)[1], 'tenant_membership_changed')

    def test_legacy_null_tenant_rows_are_global_only_after_author_transfer(self):
        feedback = PlatformFeedback.objects.create(subject='Legacy', description='Old', submitted_by=self.author)
        self.assertEqual(self.client.get(f'{self.endpoint}{feedback.pk}/').status_code, 404)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(f'{self.endpoint}{feedback.pk}/').status_code, 200)
        self.admin.tenant = self.shipyard
        self.admin.save(update_fields=['tenant'])
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(f'{self.endpoint}{feedback.pk}/').status_code, 404)

    def test_page_context_strips_queries_fragments_and_rejects_auth_external_paths(self):
        feedback = self.create_request(page_url='/assets?token=secret#key', user_agent='Demo user agent')
        self.assertEqual(feedback.page_url, '/assets')
        for path in ['/notifications', '/shared-equipment', '/platform/users', '/tenant/users', '/account/password']:
            feedback = self.create_request(page_url=f'{path}?code=secret#key')
            self.assertEqual(feedback.page_url, path)
        for path in ['https://example.test/assets?token=secret', '//evil.test', '/_allauth/browser/v1/auth/session',
                     '/login?code=secret', '/assets/../login', '/assets/%2fpassword', '/assets\\evil',
                     '/account/password/reset/key/private-token']:
            feedback = self.create_request(page_url=path)
            self.assertEqual(feedback.page_url, '')

    def test_text_limits_whitespace_and_invalid_payloads(self):
        for field, value in [('subject', ' '), ('description', ' '), ('description', 'x' * 10001),
                             ('proposed_solution', 'x' * 5001), ('expected_benefit', 'x' * 5001),
                             ('user_agent', 'x' * 501)]:
            response = self.client.post(self.endpoint, {'subject': 'Test', 'description': 'Test', field: value}, format='json')
            self.assertEqual(response.status_code, 400, field)
        response = self.client.post(self.endpoint, [], format='json')
        self.assertEqual(response.status_code, 400)
        feedback = self.create_request()
        for body in ['', '  ', 'x' * 5001]:
            self.assertEqual(self.client.post(f'{self.endpoint}{feedback.pk}/messages/', {'body': body}, format='json').status_code, 400)

    def test_pagination_search_filters_and_global_management_options(self):
        PlatformFeedback.objects.bulk_create([
            PlatformFeedback(subject=f'Example {index}', description='Sample', submitted_by=self.author,
                             tenant=self.shipyard, type='suggestion' if index == 0 else 'bug')
            for index in range(25)
        ])
        first = self.client.get(self.endpoint).data
        self.assertEqual(first['count'], 25)
        self.assertEqual(len(first['results']), 24)
        self.assertEqual(len(self.client.get(self.endpoint, {'page': 2}).data['results']), 1)
        self.assertEqual(self.client.get(self.endpoint, {'type': 'suggestion', 'search': 'Example'}).data['count'], 1)
        self.assertEqual(self.client.get(self.endpoint, {'status': 'invalid'}).status_code, 400)
        self.assertEqual(self.client.get(self.endpoint, {'assigned_to': 'nonsense'}).status_code, 400)
        for invalid in ['9' * 4500, '9223372036854775808']:
            self.assertEqual(self.client.get(self.endpoint, {'assigned_to': invalid}).status_code, 400)
        self.client.force_authenticate(self.admin)
        response = self.client.get(f'{self.endpoint}management_options/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual({item['id'] for item in response.data['assignees']}, {self.admin.pk, self.second_admin.pk})

    def test_triage_records_actual_changes_and_noop_has_no_duplicate_events_or_mail(self):
        feedback = self.create_request()
        self.client.force_authenticate(self.admin)
        values = {'status': 'planned', 'priority': 'high', 'assigned_to': self.second_admin.pk, 'note': 'Clear next step'}
        response = self.client.post(f'{self.endpoint}{feedback.pk}/triage/', values, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual({item['kind'] for item in response.data['history']}, {'created', 'status', 'priority', 'assignment', 'message'})
        self.assertEqual(Notification.objects.filter(user=self.author).count(), 1)
        event_count, notice_count = PlatformFeedbackEvent.objects.count(), Notification.objects.count()
        values.pop('note')
        repeat = self.client.post(f'{self.endpoint}{feedback.pk}/triage/', values, format='json')
        self.assertEqual(repeat.status_code, 200)
        self.assertEqual(PlatformFeedbackEvent.objects.count(), event_count)
        self.assertEqual(Notification.objects.count(), notice_count)
        self.client.force_authenticate(self.author)
        detail = self.client.get(f'{self.endpoint}{feedback.pk}/').data
        self.assertEqual(detail['allowed_actions'], ['message'])
        self.assertIsNone(detail['assigned_to_email'])
        self.assertIsNotNone(detail['assigned_to_display'])
        self.assertEqual(detail['submitted_by_email'], self.author.email)
        self.assertTrue(all(event['created_by_email'] is None for event in detail['history'] if event['created_by'] != self.author.pk))

    def test_malformed_ids_return_not_found_without_writes(self):
        self.client.force_authenticate(self.admin)
        for method, suffix, data in [
            ('post', 'messages/', {'body': 'Example message'}),
            ('post', 'triage/', {'status': 'planned'}),
            ('patch', '', {'status': 'done'}),
            ('delete', '', {}),
        ]:
            with self.subTest(method=method, suffix=suffix):
                response = getattr(self.client, method)(f'{self.endpoint}not-a-uuid/{suffix}', data, format='json')
                self.assertEqual(response.status_code, 404)
        self.assertFalse(PlatformFeedbackEvent.objects.exists())
        self.assertFalse(Notification.objects.exists())

    def test_feedback_history_protects_shipyard_and_empty_shipyard_can_be_deleted(self):
        feedback = self.create_request()
        self.client.force_authenticate(self.admin)
        response = self.client.delete(f'/api/tenants/{self.shipyard.slug}/')
        self.assertEqual(response.status_code, 409, response.data)
        self.assertTrue(Tenant.objects.filter(pk=self.shipyard.pk).exists())
        self.assertTrue(PlatformFeedback.objects.filter(pk=feedback.pk, tenant=self.shipyard).exists())
        empty = Tenant.objects.create(name='Empty practice yard', slug='empty-practice-yard')
        self.assertEqual(self.client.delete(f'/api/tenants/{empty.slug}/').status_code, 204)
        self.assertFalse(Tenant.objects.filter(pk=empty.pk).exists())

    def test_note_only_management_refreshes_timestamp_but_noop_does_not(self):
        feedback = self.create_request()
        earlier = timezone.now().replace(year=2025)
        PlatformFeedback.objects.filter(pk=feedback.pk).update(updated_at=earlier)
        self.client.force_authenticate(self.admin)
        response = self.client.post(f'{self.endpoint}{feedback.pk}/triage/', {'note': 'Proposed next step'}, format='json')
        self.assertEqual(response.status_code, 200)
        feedback.refresh_from_db()
        self.assertGreater(feedback.updated_at, earlier)
        self.assertEqual(feedback.history.filter(kind='message').get().body, 'Proposed next step')
        timestamp = feedback.updated_at
        self.client.post(f'{self.endpoint}{feedback.pk}/triage/', {'status': feedback.status}, format='json')
        feedback.refresh_from_db()
        self.assertEqual(feedback.updated_at, timestamp)

    def test_messages_record_author_and_privacy_notifications_in_same_transaction(self):
        feedback = self.create_request()
        response = self.client.post(f'{self.endpoint}{feedback.pk}/messages/', {'body': 'My secret reply', 'created_by': self.admin.pk}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['history'][-1]['created_by'], self.author.pk)
        notice = Notification.objects.filter(user=self.admin).first()
        self.assertNotIn('My secret reply', str(notice.content))
        before = (feedback.history.count(), Notification.objects.count())
        with self.assertRaises(RuntimeError):
            with transaction.atomic():
                apply_management(feedback, self.admin, {'status': 'done'})
                raise RuntimeError('Rollback')
        feedback.refresh_from_db()
        self.assertEqual(feedback.status, 'open')
        self.assertEqual((feedback.history.count(), Notification.objects.count()), before)

    def test_assignee_must_be_current_active_strict_global_admin(self):
        feedback = self.create_request()
        self.client.force_authenticate(self.admin)
        disabled = User.objects.create(username='disabled', is_superuser=True, is_active=False)
        tenant_superuser = User.objects.create(username='tenant-super', is_superuser=True, tenant=self.shipyard)
        for user in [self.peer, disabled, tenant_superuser]:
            response = self.client.post(f'{self.endpoint}{feedback.pk}/triage/', {'assigned_to': user.pk}, format='json')
            self.assertEqual(response.status_code, 400)
        self.second_admin.is_superuser = False
        self.second_admin.save(update_fields=['is_superuser'])
        response = self.client.patch(f'{self.endpoint}{feedback.pk}/', {'assigned_to': self.second_admin.pk}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(feedback.history.count(), 1)

    def test_global_legacy_crud_update_tracks_status_and_delete_cleans_file_after_commit(self):
        feedback = self.create_request()
        self.client.force_authenticate(self.admin)
        response = self.client.patch(f'{self.endpoint}{feedback.pk}/', {'status': 'in_progress', 'proposed_solution': 'Better workflow'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(feedback.history.filter(kind='status').exists())
        attachment = PlatformFeedbackAttachment.objects.create(
            feedback=feedback, file=SimpleUploadedFile('proof.txt', b'proof'), original_name='proof.txt',
        )
        path = Path(attachment.file.path)
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.client.delete(f'{self.endpoint}{feedback.pk}/').status_code, 204)
        self.assertFalse(path.exists())

    def test_global_audience_hidden_and_mail_blocked_after_demotion_without_role_change(self):
        feedback = self.create_request()
        notice = Notification.objects.get(user=self.admin)
        EmailAddress.objects.create(user=self.admin, email=self.admin.email, verified=True)
        self.assertTrue(visible_notifications(self.admin).filter(pk=notice.pk).exists())
        self.assertEqual(recipient_for(notice), (self.admin.email, ''))
        self.admin.is_superuser = False
        self.admin.save(update_fields=['is_superuser'])
        self.assertFalse(visible_notifications(self.admin).filter(pk=notice.pk).exists())
        notice.user = self.admin
        self.assertEqual(recipient_for(notice)[1], 'recipient_role_changed')
        self.assertIsNotNone(feedback)

    def test_existing_notifications_without_global_marker_remain_visible(self):
        notice = Notification.objects.create(user=self.author, content={'title': 'Old event'})
        self.assertTrue(visible_notifications(self.author).filter(pk=notice.pk).exists())

    def test_valid_uploads_randomize_storage_and_download_is_private(self):
        response = self.client.post(self.endpoint, {
            'subject': 'File proof', 'description': 'Private context',
            'files': [SimpleUploadedFile('../proof.txt', b'proof', content_type='text/html')],
        }, format='multipart')
        self.assertEqual(response.status_code, 201, response.data)
        attachment = PlatformFeedbackAttachment.objects.get()
        self.assertEqual(attachment.original_name, 'proof.txt')
        self.assertNotIn('proof', attachment.file.name)
        self.assertEqual(attachment.content_type, 'text/plain')
        url = response.data['attachments'][0]['url']
        result = self.client.get(url)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result['Cache-Control'], 'private, no-store')
        self.assertEqual(result['X-Content-Type-Options'], 'nosniff')
        self.assertIn('attachment', result['Content-Disposition'])
        self.assertEqual(b''.join(result.streaming_content), b'proof')
        for user in [self.peer, self.manager, self.other]:
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(url).status_code, 404)
        self.assertEqual(self.client.get(attachment.file.url).status_code, 404)

    def test_count_individual_and_aggregate_size_limits_precede_all_writes(self):
        cases = [
            [SimpleUploadedFile(f'{index}.txt', b'x') for index in range(6)],
            [SimpleUploadedFile('big.txt', b'x' * (5 * 1024 * 1024 + 1))],
            [SimpleUploadedFile(f'{index}.txt', b'x' * (4 * 1024 * 1024)) for index in range(4)],
            [SimpleUploadedFile('empty.txt', b'')],
            [SimpleUploadedFile('first.txt', b'fine'), SimpleUploadedFile('last.exe', b'invalid')],
            [SimpleUploadedFile('fake.png', b'<script>bad</script>')],
        ]
        for files in cases:
            response = self.client.post(self.endpoint, {'subject': 'Invalid', 'description': 'Invalid', 'files': files}, format='multipart')
            self.assertEqual(response.status_code, 400)
            self.assertFalse(PlatformFeedback.objects.exists())
            self.assertFalse(list(Path(self.directory.name).rglob('*')))

    def test_office_upload_content_must_match_declared_extension(self):
        buffer = BytesIO()
        with ZipFile(buffer, 'w') as archive:
            archive.writestr('[Content_Types].xml', '<Types/>')
            archive.writestr('xl/workbook.xml', '<workbook/>')
        for extension, expected in [('xlsx', 201), ('docx', 400)]:
            response = self.client.post(self.endpoint, {
                'subject': 'Office proof', 'description': 'Sample',
                'files': [SimpleUploadedFile(f'sample.{extension}', buffer.getvalue())],
            }, format='multipart')
            self.assertEqual(response.status_code, expected, response.data)

    def test_corrupt_office_archive_metadata_is_rejected_before_writes(self):
        buffer = BytesIO()
        with ZipFile(buffer, 'w') as archive:
            archive.writestr('a', 'Sample')
        damaged = bytearray(buffer.getvalue())
        central = damaged.index(b'PK\x01\x02')
        # Flag the filename as UTF-8, then supply an invalid UTF-8 byte.
        damaged[central + 9] |= 8
        damaged[central + 46] = 0xff
        for extension in ['xlsx', 'docx']:
            response = self.client.post(self.endpoint, {
                'subject': 'Invalid archive', 'description': 'Example',
                'files': [SimpleUploadedFile(f'broken.{extension}', bytes(damaged))],
            }, format='multipart')
            self.assertEqual(response.status_code, 400)
            self.assertFalse(PlatformFeedback.objects.exists())
            self.assertFalse(PlatformFeedbackAttachment.objects.exists())
            self.assertFalse(list(Path(self.directory.name).rglob('*')))

    def test_file_save_failure_rolls_back_database_and_removes_written_file(self):
        with patch.object(PlatformFeedbackAttachment, 'save', side_effect=RuntimeError('storage failure')):
            with self.assertRaises(RuntimeError):
                self.client.post(self.endpoint, {
                    'subject': 'Failure', 'description': 'Sample',
                    'files': [SimpleUploadedFile('proof.txt', b'proof')],
                }, format='multipart')
        self.assertFalse(PlatformFeedback.objects.exists())
        self.assertFalse(PlatformFeedbackAttachment.objects.exists())
        self.assertFalse(PlatformFeedbackEvent.objects.exists())
        self.assertFalse([path for path in Path(self.directory.name).rglob('*') if path.is_file()])


class DevelopmentRequestMigrationTests(TransactionTestCase):
    """Additive upgrade preserves legacy request values without ownership inference."""
    serialized_rollback = False
    available_apps = [app.name for app in apps.get_app_configs() if app.label != 'audit']

    def test_old_feedback_and_attachment_are_preserved(self):
        executor = MigrationExecutor(connection)
        leaves = executor.loader.graph.leaf_nodes()
        previous = [('platform_feedback', '0001_initial')]
        try:
            executor.migrate(previous)
            state = executor.loader.project_state(previous).apps
            old_feedback = state.get_model('platform_feedback', 'PlatformFeedback')
            old_attachment = state.get_model('platform_feedback', 'PlatformFeedbackAttachment')
            legacy = old_feedback.objects.create(type='feature', status='in_progress', subject='Original', description='Original proposal')
            attachment = old_attachment.objects.create(feedback=legacy, file='platform_feedback/old/proof.txt', original_name='proof.txt', size=12)
            executor = MigrationExecutor(connection)
            executor.migrate(leaves)
            updated = PlatformFeedback.objects.get(pk=legacy.pk)
            self.assertEqual((updated.type, updated.status, updated.subject, updated.description),
                             ('feature', 'in_progress', 'Original', 'Original proposal'))
            self.assertIsNone(updated.tenant_id)
            self.assertEqual(updated.priority, 'normal')
            self.assertEqual(updated.proposed_solution, '')
            self.assertTrue(PlatformFeedbackAttachment.objects.filter(pk=attachment.pk).exists())
            self.assertFalse(updated.history.exists())
        finally:
            MigrationExecutor(connection).migrate(leaves)
