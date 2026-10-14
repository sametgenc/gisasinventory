"""Startup checks run in isolated processes without a database or live services."""

import os
from pathlib import Path
import subprocess
import sys
import unittest


BACKEND_DIR = Path(__file__).resolve().parent.parent
IMPORT_SETTINGS = """
import importlib
import os
import sys
from django.core.exceptions import ImproperlyConfigured

try:
    settings = importlib.import_module(sys.argv[1])
except ImproperlyConfigured:
    sys.exit(78)

assert settings.SECRET_KEY.strip()
if os.environ.get("CHECK_CONFIGURED_KEY") == "1":
    assert settings.SECRET_KEY == os.environ["DJANGO_SECRET_KEY"]
if os.environ.get("CHECK_DEMO_MAIL") == "1":
    assert settings.EMAIL_BACKEND == "django.core.mail.backends.console.EmailBackend"
    assert settings.EMAIL_HOST == settings.EMAIL_HOST_USER == settings.EMAIL_HOST_PASSWORD == ""
    assert settings.SMTP_CREDENTIAL_KEY == settings.MFA_CREDENTIAL_KEY == ""
"""


class SecretKeyStartupTests(unittest.TestCase):
    def import_settings(self, module="config.settings", **overrides):
        # Do not inherit database URLs, service addresses, or actual credentials.
        env = {
            "PATH": os.environ.get("PATH", ""),
            "PYTHONDONTWRITEBYTECODE": "1",
            "DJANGO_SETTINGS_MODULE": module,
        }
        env.update(overrides)
        return subprocess.run(
            [sys.executable, "-c", IMPORT_SETTINGS, module],
            cwd=BACKEND_DIR,
            env=env,
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )

    def assert_startup(self, result, expected_code):
        self.assertEqual(result.returncode, expected_code, result.stderr)
        self.assertEqual(result.stdout, "")

    def test_production_requires_a_secret_key(self):
        self.assert_startup(self.import_settings(), 78)

    def test_production_rejects_empty_and_whitespace_keys(self):
        for key in ("", " ", "\t\n"):
            with self.subTest(key_kind="empty" if not key else "whitespace"):
                self.assert_startup(self.import_settings(DJANGO_SECRET_KEY=key), 78)

    def test_production_rejects_known_insecure_prefix(self):
        for key in ("django-insecure-test-placeholder", "  django-insecure-test-placeholder"):
            with self.subTest(leading_whitespace=key.startswith(" ")):
                self.assert_startup(self.import_settings(DJANGO_SECRET_KEY=key), 78)

    def test_production_preserves_configured_key(self):
        self.assert_startup(
            self.import_settings(
                DJANGO_SECRET_KEY=" configured-key-placeholder-for-startup-test ",
                CHECK_CONFIGURED_KEY="1",
            ),
            0,
        )

    def test_development_works_without_production_key(self):
        self.assert_startup(self.import_settings(DJANGO_DEBUG="True"), 0)

    def test_only_explicit_local_settings_can_use_fallback(self):
        for module in ("config.demo_settings", "config.test_settings"):
            with self.subTest(module=module):
                self.assert_startup(self.import_settings(module), 0)

    def test_other_settings_module_does_not_bypass_guard(self):
        result = self.import_settings(DJANGO_SETTINGS_MODULE="config.custom_settings")
        self.assert_startup(result, 78)

    def test_demo_does_not_inherit_production_mail_credentials(self):
        result = self.import_settings(
            'config.demo_settings', CHECK_DEMO_MAIL='1',
            EMAIL_BACKEND='django.core.mail.backends.smtp.EmailBackend',
            EMAIL_HOST='smtp.external.example.test', EMAIL_HOST_USER='external-test-user',
            EMAIL_HOST_PASSWORD='ExternalTestPassword', SMTP_CREDENTIAL_KEY='ExternalTestKey',
            MFA_CREDENTIAL_KEY='ExternalTestMfaKey',
        )
        self.assert_startup(result, 0)
