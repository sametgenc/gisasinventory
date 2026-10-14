"""Switching SMTP authentication must not retain an obsolete credential."""
from django.test import TestCase, override_settings

from .models import SmtpSettings
from .serializers import SmtpSettingsSerializer


class AnonymousRelayTests(TestCase):
    def setUp(self):
        self.config = SmtpSettings.objects.create(host='smtp.example.test', username='sender', password='OldTestSecret', from_email='sender@example.test', use_tls=True, is_configured=True)

    def test_explicit_empty_username_removes_retained_secret(self):
        serializer = SmtpSettingsSerializer(self.config, data={'username': '', 'password': ''}, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()
        self.config.refresh_from_db()
        self.assertEqual(self.config.username, '')
        self.assertEqual(self.config.password, '')
        self.assertFalse(serializer.data['password_set'])

    def test_blank_password_with_unchanged_username_preserves_secret(self):
        encrypted = self.config.password
        serializer = SmtpSettingsSerializer(self.config, data={'password': ''}, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()
        self.config.refresh_from_db()
        self.assertEqual(self.config.password, encrypted)

    def test_new_password_without_username_is_rejected(self):
        serializer = SmtpSettingsSerializer(self.config, data={'username': '', 'password': 'NewTestSecret'}, partial=True)
        self.assertFalse(serializer.is_valid())
        self.config.refresh_from_db()
        self.assertEqual(self.config.username, 'sender')

    @override_settings(EMAIL_HOST='smtp.example.test', EMAIL_HOST_USER='', EMAIL_HOST_PASSWORD='UnpairedEnvSecret')
    def test_anonymous_relay_does_not_reintroduce_environment_secret(self):
        serializer = SmtpSettingsSerializer(data={
            'host': 'smtp.example.test', 'username': '', 'password': '', 'port': 587,
            'from_email': 'sender@example.test', 'use_tls': True, 'use_ssl': False,
        })
        self.assertTrue(serializer.is_valid(), serializer.errors)
        config = serializer.save()
        self.assertEqual(config.password, '')
        self.assertFalse(serializer.data['password_set'])
