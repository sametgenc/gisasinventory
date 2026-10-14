"""Real allauth session, TOTP and recovery flows with isolated local mail."""
import json
import time

from allauth.account.models import EmailAddress
from allauth.mfa.models import Authenticator
from allauth.mfa.recovery_codes.internal.auth import RecoveryCodes
from allauth.mfa.totp.internal.auth import TOTP, format_hotp_value, generate_totp_secret, hotp_value
from django.core.cache import cache
from django.test import Client, TestCase

from apps.tenants.models import Tenant
from .models import User


class MFAFlowTests(TestCase):
    def setUp(self):
        cache.clear()
        self.tenant = Tenant.objects.create(name='MFA test yard')
        self.user = User.objects.create_user(username='mfa-user', email='mfa-user@example.test', password='MfaTest!2026', tenant=self.tenant, role='tenant_admin')
        EmailAddress.objects.create(user=self.user, email=self.user.email, verified=True, primary=True)
        self.client.force_login(self.user)
        session = self.client.session
        session['account_authentication_methods'] = [{'method': 'password', 'at': time.time()}]
        session.save()

    def post(self, path, data, client=None):
        return (client or self.client).post(path, json.dumps(data), content_type='application/json')

    def code(self, secret):
        return format_hotp_value(hotp_value(secret, int(time.time()) // 30))

    def test_setup_checks_code_encrypts_secret_and_provides_recovery_codes(self):
        response = self.client.get('/_allauth/browser/v1/account/authenticators/totp')
        self.assertEqual(response.status_code, 404, response.content)
        secret = response.json()['meta']['secret']
        response = self.post('/_allauth/browser/v1/account/authenticators/totp', {'code': 'invalid'})
        self.assertEqual(response.status_code, 400, response.content)
        self.assertFalse(Authenticator.objects.filter(user=self.user, type='totp').exists())
        response = self.post('/_allauth/browser/v1/account/authenticators/totp', {'code': self.code(secret)})
        self.assertEqual(response.status_code, 200, response.content)
        factor = Authenticator.objects.get(user=self.user, type='totp')
        self.assertNotEqual(factor.data['secret'], secret)
        self.assertTrue(factor.data['secret'].startswith('fernet:v1:'))
        self.assertTrue(Authenticator.objects.filter(user=self.user, type='recovery_codes').exists())
        response = self.client.get('/_allauth/browser/v1/account/authenticators/recovery-codes')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertGreater(len(response.json()['data']['unused_codes']), 0)

    def test_enabled_mfa_blocks_private_api_until_login_challenge_completes(self):
        secret = generate_totp_secret()
        TOTP.activate(self.user, secret)
        browser = Client()
        response = self.post('/_allauth/browser/v1/auth/login', {'email': self.user.email, 'password': 'MfaTest!2026'}, browser)
        self.assertEqual(response.status_code, 401, response.content)
        self.assertTrue(any(flow['id'] == 'mfa_authenticate' and flow.get('is_pending') for flow in response.json()['data']['flows']))
        self.assertIn(browser.get('/api/assets/items/').status_code, [401, 403])
        response = self.post('/_allauth/browser/v1/auth/2fa/authenticate', {'code': self.code(secret)}, browser)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(browser.get('/api/assets/items/').status_code, 200)

    def test_recovery_code_works_once_and_cannot_reenter(self):
        TOTP.activate(self.user, generate_totp_secret())
        recovery = RecoveryCodes.activate(self.user)
        code = recovery.get_unused_codes()[0]
        for attempt in range(2):
            browser = Client()
            response = self.post('/_allauth/browser/v1/auth/login', {'email': self.user.email, 'password': 'MfaTest!2026'}, browser)
            self.assertEqual(response.status_code, 401, response.content)
            response = self.post('/_allauth/browser/v1/auth/2fa/authenticate', {'code': code}, browser)
            self.assertEqual(response.status_code, 200 if attempt == 0 else 400, response.content)
            if attempt:
                self.assertIn(browser.get('/api/assets/items/').status_code, [401, 403])

    def test_totp_reauthentication_records_actual_factor_and_removal_requires_recent_auth(self):
        secret = generate_totp_secret()
        factor = TOTP.activate(self.user, secret).instance
        session = self.client.session
        session['account_authentication_methods'] = [{'method': 'password', 'at': time.time() - 600}]
        session.save()
        response = self.client.delete('/_allauth/browser/v1/account/authenticators/totp')
        self.assertEqual(response.status_code, 401, response.content)
        self.assertTrue(Authenticator.objects.filter(pk=factor.pk).exists())
        response = self.post('/_allauth/browser/v1/auth/2fa/reauthenticate', {'code': self.code(secret)})
        self.assertEqual(response.status_code, 200, response.content)
        records = self.client.session.get('account_authentication_methods', [])
        self.assertTrue(any(record.get('method') == 'mfa' and record.get('id') == factor.pk for record in records))
        response = self.client.delete('/_allauth/browser/v1/account/authenticators/totp')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertFalse(Authenticator.objects.filter(pk=factor.pk).exists())
