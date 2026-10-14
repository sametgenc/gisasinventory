"""Mail content and MFA secrets without external services or real recipients."""
from unittest.mock import patch

from allauth.account.adapter import get_adapter
from allauth.core.context import request_context
from django.core import mail
from django.core.exceptions import ImproperlyConfigured
from django.template.loader import render_to_string
from django.test import RequestFactory, TestCase, override_settings

from .adapters import CustomMFAAdapter
from .mail import ACCOUNT_MESSAGES, build_mail_context, safe_action_url
from .models import User


class AccountMailTests(TestCase):
    def setUp(self):
        self.user = User.objects.create(username='mail-user', email='mail-user@example.test', preferred_language='tr')
        self.request = RequestFactory().get('/')
        self.request.user = self.user
        self.request.session = {}

    def render(self, prefix, **context):
        return get_adapter().render_mail(prefix, self.user.email, {'user': self.user, **context})

    def html(self, message):
        return message.alternatives[0].content

    def test_login_mail_has_branded_plain_and_html_code(self):
        message = self.render('account/email/login_code', code='123456')
        self.assertIn('Giriş kodunuz', message.subject)
        self.assertIn('GİSAŞ', message.body)
        self.assertIn('123456', message.body)
        self.assertIn('123456', self.html(message))
        self.assertIn('lang="tr"', self.html(message))
        self.assertNotIn('example.com', message.body)
        self.assertNotIn('href=', self.html(message))

    def test_actual_password_reset_code_template_preserves_eight_characters(self):
        message = self.render('account/email/password_reset_code', code='AB12CD34')
        self.assertIn('Parola sıfırlama kodunuz', message.subject)
        self.assertIn('AB12CD34', message.body)
        self.assertIn('AB12CD34', self.html(message))
        self.assertNotIn('6 hane', message.body)

    @override_settings(ACCOUNT_LOGIN_BY_CODE_TIMEOUT=1800)
    def test_expiry_text_comes_from_real_timeout(self):
        message = self.render('account/email/login_code', code='123456')
        self.assertIn('30 dakika', message.body)
        self.assertNotIn('15 dakika', message.body)

    def test_recipient_language_controls_text_and_html(self):
        self.user.preferred_language = 'en'
        message = self.render('account/email/login_code', code='123456')
        self.assertIn('Your sign-in code', message.subject)
        self.assertIn('lang="en"', self.html(message))
        self.assertIn('Never share this code', message.body)

    def test_security_messages_never_include_secret_or_recovery_codes(self):
        prefixes = {'account/email': ['password_changed', 'password_set', 'password_reset', 'email_changed', 'email_deleted'],
                    'mfa/email': ['totp_activated', 'totp_deactivated', 'recovery_codes_generated', 'webauthn_added', 'webauthn_removed'],
                    'socialaccount/email': ['account_connected', 'account_disconnected']}
        for folder, keys in prefixes.items():
            for key in keys:
                with self.subTest(key=key):
                    self.assertIn(key, ACCOUNT_MESSAGES)
                    message = self.render(f'{folder}/{key}', code='PRIVATE-CODE', secret='PRIVATE-SECRET', recovery_codes=['PRIVATE-RECOVERY'])
                    self.assertIn('GİSAŞ', message.body)
                    self.assertIn('/account/authenticators', message.body)
                    for secret in ['PRIVATE-CODE', 'PRIVATE-SECRET', 'PRIVATE-RECOVERY']:
                        self.assertNotIn(secret, message.body + self.html(message))

    def test_security_mail_flag_is_enabled_and_uses_default_request_context(self):
        from apps.notifications.models import Notification
        with request_context(self.request):
            get_adapter().send_notification_mail('mfa/email/totp_activated', self.user, email=self.user.email)
        notification = Notification.objects.get()
        self.assertTrue(notification.is_security)
        self.assertEqual(notification.email_recipient, self.user.email)
        self.assertEqual(notification.email_status, 'queued')
        self.assertEqual(len(mail.outbox), 0)
        from apps.notifications.tasks import deliver_notification_email
        deliver_notification_email(notification.pk)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('İki faktörlü giriş açıldı', mail.outbox[0].subject)
        self.assertIn('text/html', [alternative.mimetype for alternative in mail.outbox[0].alternatives])

    def test_unaccepted_account_mail_is_reported(self):
        with patch('django.core.mail.message.EmailMultiAlternatives.send', return_value=0):
            with self.assertRaisesMessage(RuntimeError, 'did not accept'):
                get_adapter().send_mail('account/email/login_code', self.user.email, {'code': '123456'})

    def test_html_escapes_user_supplied_text(self):
        context = build_mail_context(title='<script>title</script>', message='<img src=x onerror=alert(1)>', user=self.user)
        html = render_to_string('mail/message.html', context)
        self.assertNotIn('<script>', html)
        self.assertNotIn('<img src=x', html)
        self.assertIn('&lt;script&gt;', html)
        self.assertIn('&lt;img', html)

    def test_application_links_stay_on_configured_frontend(self):
        with override_settings(HEADLESS_FRONTEND_URLS={'browser': 'https://inventory.example.test{path}'}):
            self.assertEqual(safe_action_url('/assets'), 'https://inventory.example.test/assets')
            for invalid in ['https://evil.example/', '//evil.example/', '/\\evil.example', '/assets\nInjected']:
                self.assertEqual(safe_action_url(invalid), 'https://inventory.example.test/notifications')
            message = self.render('account/email/email_confirmation', activate_url='https://evil.example/activation')
            self.assertNotIn('evil.example', message.body + self.html(message))
            valid = self.render('account/email/email_confirmation', activate_url='https://inventory.example.test/auth/email/confirm/key')
            self.assertIn('https://inventory.example.test/auth/email/confirm/key', valid.body)

    def test_mfa_secret_encryption_keeps_legacy_accounts_readable(self):
        adapter = CustomMFAAdapter()
        encrypted = adapter.encrypt('EXAMPLE-TOTP-SECRET')
        self.assertNotIn('EXAMPLE-TOTP-SECRET', encrypted)
        self.assertEqual(adapter.decrypt(encrypted), 'EXAMPLE-TOTP-SECRET')
        self.assertEqual(adapter.decrypt('EXAMPLE-LEGACY-SECRET'), 'EXAMPLE-LEGACY-SECRET')
        with override_settings(SECRET_KEY='different-test-key'):
            with self.assertRaises(ImproperlyConfigured):
                adapter.decrypt(encrypted)


class PasswordResetMailFlowTests(TestCase):
    def setUp(self):
        from allauth.account.models import EmailAddress
        from django.core.cache import cache
        cache.clear()
        self.user = User.objects.create_user(username='reset-flow', email='reset-flow@example.test', password='OldPassword!2026', preferred_language='tr')
        EmailAddress.objects.create(user=self.user, email=self.user.email, primary=True, verified=True)

    def post(self, path, data):
        import json
        return self.client.post(path, json.dumps(data), content_type='application/json')

    def request_code(self):
        import re
        response = self.post('/_allauth/browser/v1/auth/password/request', {'email': self.user.email})
        self.assertIn(response.status_code, [200, 401], response.content)
        message = mail.outbox[-1]
        self.assertIn('Parola sıfırlama kodunuz', message.subject)
        match = re.search(r'(?m)^([A-Z0-9]{8})$', message.body)
        self.assertIsNotNone(match, 'The reset email must contain the complete eight-character code.')
        return match.group(1)

    def assert_reset_finished(self, response):
        self.assertEqual(response.status_code, 401, response.content)
        payload = response.json()
        self.assertFalse(payload['meta']['is_authenticated'])
        reset_flow = next(flow for flow in payload['data']['flows'] if flow['id'] == 'password_reset_by_code')
        self.assertIs(reset_flow.get('is_pending'), False)

    def test_full_eight_character_email_code_changes_password(self):
        code = self.request_code()
        response = self.post('/_allauth/browser/v1/auth/password/reset', {'key': code, 'password': 'NewPassword!2026'})
        self.assert_reset_finished(response)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('NewPassword!2026'))
        self.assertFalse(self.user.check_password('OldPassword!2026'))
        self.assertIn(self.client.get('/api/assets/items/').status_code, [401, 403])

    def test_wrong_and_truncated_codes_keep_original_password(self):
        code = self.request_code()
        wrong = ('Q' if code[0] != 'Q' else 'R') + code[1:]
        for candidate in [wrong, code[:6]]:
            with self.subTest(length=len(candidate)):
                response = self.post('/_allauth/browser/v1/auth/password/reset', {'key': candidate, 'password': 'NewPassword!2026'})
                self.assertEqual(response.status_code, 400, response.content)
                self.user.refresh_from_db()
                self.assertTrue(self.user.check_password('OldPassword!2026'))
        response = self.post('/_allauth/browser/v1/auth/password/reset', {'key': code, 'password': 'NewPassword!2026'})
        self.assert_reset_finished(response)

    def test_password_reset_does_not_remove_enabled_second_factor(self):
        from allauth.mfa.models import Authenticator
        from allauth.mfa.totp.internal.auth import TOTP, generate_totp_secret
        factor = TOTP.activate(self.user, generate_totp_secret()).instance
        code = self.request_code()
        response = self.post('/_allauth/browser/v1/auth/password/reset', {'key': code, 'password': 'NewPassword!2026'})
        self.assert_reset_finished(response)
        self.assertTrue(Authenticator.objects.filter(pk=factor.pk).exists())
        response = self.post('/_allauth/browser/v1/auth/login', {'email': self.user.email, 'password': 'NewPassword!2026'})
        self.assertEqual(response.status_code, 401, response.content)
        self.assertTrue(any(flow['id'] == 'mfa_authenticate' and flow.get('is_pending') for flow in response.json()['data']['flows']))
        self.assertIn(self.client.get('/api/assets/items/').status_code, [401, 403])
