"""Account write limits reject requests before stored files, events, or email work."""

from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from uuid import uuid4

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework.test import APITestCase

from apps.notifications.models import Notification
from apps.tenants.models import Tenant
from apps.user.models import User
from .models import PlatformFeedback, PlatformFeedbackAttachment, PlatformFeedbackEvent
from .throttles import FeedbackWriteThrottle


class FeedbackWriteThrottleTests(APITestCase):
    def setUp(self):
        self.directory = TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        # No shared demo or other-test cache is cleared or reused.
        self.settings_override = override_settings(
            MEDIA_ROOT=self.directory.name,
            CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
                                'LOCATION': f'feedback-throttle-tests-{uuid4()}'}},
        )
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)
        clock_patcher = patch.object(FeedbackWriteThrottle, 'timer', return_value=7201.0)
        self.clock = clock_patcher.start()
        self.addCleanup(clock_patcher.stop)
        self.shipyard = Tenant.objects.create(name='Throttle example', slug='throttle-example')
        self.author = User.objects.create(username='throttle-author', tenant=self.shipyard)
        self.other = User.objects.create(username='throttle-other', tenant=self.shipyard)
        self.admin = User.objects.create(username='throttle-admin', is_superuser=True)
        self.client.force_authenticate(self.author)
        self.endpoint = '/api/platform-feedback/'

    def create_request(self, *, attachment=False):
        data = {'subject': 'Example request', 'description': 'Fictional details'}
        if attachment:
            data['files'] = [SimpleUploadedFile('proof.txt', b'proof')]
        return self.client.post(self.endpoint, data, format='multipart' if attachment else 'json')

    def state_counts(self):
        return (PlatformFeedback.objects.count(), PlatformFeedbackAttachment.objects.count(),
                PlatformFeedbackEvent.objects.count(), Notification.objects.count(),
                len([path for path in Path(self.directory.name).rglob('*') if path.is_file()]))

    def test_member_burst_last_accepted_then_rejects_without_file_event_or_outbox_writes(self):
        for _ in range(6):
            self.assertEqual(self.create_request(attachment=True).status_code, 201)
        before = self.state_counts()
        response = self.create_request(attachment=True)
        self.assertEqual(response.status_code, 429)
        self.assertIn('Retry-After', response)
        self.assertEqual(self.state_counts(), before)

    def test_create_and_messages_share_same_member_budget_and_new_minute_allows_normal_use(self):
        created = self.create_request()
        request_id = created.data['id']
        for _ in range(5):
            self.assertEqual(self.client.post(f'{self.endpoint}{request_id}/messages/', {'body': 'Fictional reply'}, format='json').status_code, 200)
        before = self.state_counts()
        self.assertEqual(self.client.post(f'{self.endpoint}{request_id}/messages/', {'body': 'Blocked'}, format='json').status_code, 429)
        self.assertEqual(self.state_counts(), before)
        self.clock.return_value = 7261.0
        self.assertEqual(self.client.post(f'{self.endpoint}{request_id}/messages/', {'body': 'Next minute'}, format='json').status_code, 200)

    def test_sustained_hour_limit_survives_new_minute_bursts(self):
        for minute in range(5):
            self.clock.return_value = 7201.0 + 60 * minute
            for _ in range(6):
                self.assertEqual(self.create_request().status_code, 201)
        self.clock.return_value = 7501.0
        before = self.state_counts()
        response = self.create_request()
        self.assertEqual(response.status_code, 429)
        self.assertGreater(int(response['Retry-After']), 60)
        self.assertEqual(self.state_counts(), before)
        self.clock.return_value = 10801.0
        self.assertEqual(self.create_request().status_code, 201)

    def test_account_identity_is_separate_and_reads_remain_unlimited_after_budget_exhaustion(self):
        first_id = None
        for _ in range(6):
            first_id = self.create_request().data['id']
        self.assertEqual(self.create_request().status_code, 429)
        for _ in range(8):
            self.assertEqual(self.client.get(self.endpoint).status_code, 200)
            self.assertEqual(self.client.get(f'{self.endpoint}{first_id}/').status_code, 200)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.create_request().status_code, 201)

    @override_settings(FEEDBACK_ADMIN_WRITE_BURST='3/minute', FEEDBACK_ADMIN_WRITE_SUSTAINED='10/hour')
    def test_global_admin_triage_patch_and_messages_share_separate_management_budget(self):
        feedback_id = self.create_request().data['id']
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(f'{self.endpoint}{feedback_id}/triage/', {'status': 'in_review'}, format='json').status_code, 200)
        self.assertEqual(self.client.patch(f'{self.endpoint}{feedback_id}/', {'priority': 'high'}, format='json').status_code, 200)
        self.assertEqual(self.client.post(f'{self.endpoint}{feedback_id}/messages/', {'body': 'Next action'}, format='json').status_code, 200)
        before = self.state_counts()
        self.assertEqual(self.client.patch(f'{self.endpoint}{feedback_id}/', {'status': 'done'}, format='json').status_code, 429)
        self.assertEqual(self.state_counts(), before)
        self.assertEqual(self.client.get(f'{self.endpoint}management_options/').status_code, 200)
        self.client.force_authenticate(self.author)
        self.assertEqual(self.client.post(f'{self.endpoint}{feedback_id}/messages/', {'body': 'Thanks'}, format='json').status_code, 200)

    def test_default_global_admin_policy_allows_staff_reviewing_more_than_six_updates(self):
        feedback_id = self.create_request().data['id']
        self.client.force_authenticate(self.admin)
        for _ in range(7):
            self.assertEqual(self.client.post(f'{self.endpoint}{feedback_id}/messages/', {'body': 'Fictional manager reply'}, format='json').status_code, 200)

    def test_shared_cache_outage_fails_closed_without_any_state_or_storage_writes(self):
        with patch('apps.platform_feedback.throttles.cache.add', side_effect=ConnectionError('Unavailable')):
            response = self.create_request(attachment=True)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(self.state_counts(), (0, 0, 0, 0, 0))
