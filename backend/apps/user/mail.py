"""Shared, escaped mail content for account security and application notifications."""
from collections.abc import Mapping
from math import ceil
from urllib.parse import urlsplit

from django.conf import settings
from django.utils.translation import get_language

from .models import User


ACCOUNT_MESSAGES = {
    'email_confirmation': ('E-posta adresinizi doğrulayın', 'Verify your email address', 'E-posta adresinizi doğrulamak için açık doğrulama ekranına bu kodu yazın.', 'Enter this code in your open verification screen to verify your email address.'),
    'email_confirmation_signup': ('Hesabınızı doğrulayın', 'Verify your account', 'Hesabınızı tamamlamak için açık doğrulama ekranına bu kodu yazın.', 'Enter this code in your open verification screen to complete your account.'),
    'login_code': ('Giriş kodunuz', 'Your sign-in code', 'Girişinizi tamamlamak için açık giriş ekranına bu kodu yazın.', 'Enter this code in your open sign-in screen to complete sign-in.'),
    'password_reset_code': ('Parola sıfırlama kodunuz', 'Your password reset code', 'Yeni parola oluşturmak için açık parola sıfırlama ekranına bu kodu yazın.', 'Enter this code in your open password reset screen to choose a new password.'),
    'password_reset_key': ('Parolanızı sıfırlayın', 'Reset your password', 'Yeni parola oluşturmak için aşağıdaki bağlantıyı açın.', 'Open the link below to choose a new password.'),
    'password_changed': ('Parolanız değiştirildi', 'Your password was changed', 'Hesabınızın parolası değiştirildi.', 'Your account password was changed.'),
    'password_set': ('Hesabınıza parola eklendi', 'A password was added to your account', 'Hesabınız için yeni bir parola oluşturuldu.', 'A password was set for your account.'),
    'password_reset': ('Parolanız sıfırlandı', 'Your password was reset', 'Hesabınızın parolası sıfırlandı.', 'Your account password was reset.'),
    'email_changed': ('E-posta adresiniz değiştirildi', 'Your email address was changed', 'Hesabınızın e-posta adresi değiştirildi.', 'Your account email address was changed.'),
    'email_deleted': ('E-posta adresi kaldırıldı', 'An email address was removed', 'Hesabınızdan bir e-posta adresi kaldırıldı.', 'An email address was removed from your account.'),
    'totp_activated': ('İki faktörlü giriş açıldı', 'Two-factor authentication was enabled', 'Hesabınızda doğrulama uygulamasıyla iki faktörlü giriş etkinleştirildi.', 'Authenticator app verification was enabled for your account.'),
    'totp_deactivated': ('İki faktörlü giriş kapatıldı', 'Two-factor authentication was disabled', 'Hesabınızda doğrulama uygulamasıyla iki faktörlü giriş kapatıldı.', 'Authenticator app verification was disabled for your account.'),
    'recovery_codes_generated': ('Kurtarma kodlarınız yenilendi', 'Your recovery codes were renewed', 'Hesabınız için yeni kurtarma kodları oluşturuldu. Önceki kodlar artık kullanılamaz.', 'New recovery codes were generated for your account. Previous codes can no longer be used.'),
    'webauthn_added': ('Yeni geçiş anahtarı eklendi', 'A new passkey was added', 'Hesabınıza yeni bir geçiş anahtarı veya güvenlik anahtarı eklendi.', 'A new passkey or security key was added to your account.'),
    'webauthn_removed': ('Geçiş anahtarı kaldırıldı', 'A passkey was removed', 'Hesabınızdan bir geçiş anahtarı veya güvenlik anahtarı kaldırıldı.', 'A passkey or security key was removed from your account.'),
    'account_connected': ('Bağlı hesap eklendi', 'A connected account was added', 'Hesabınıza yeni bir giriş hesabı bağlandı.', 'A new sign-in account was connected to your account.'),
    'account_disconnected': ('Bağlı hesap kaldırıldı', 'A connected account was removed', 'Hesabınızdan bağlı bir giriş hesabı kaldırıldı.', 'A connected sign-in account was removed from your account.'),
}
CODE_MESSAGES = {'email_confirmation', 'email_confirmation_signup', 'login_code', 'password_reset_code'}


def frontend_origin() -> str:
    browser_url = settings.HEADLESS_FRONTEND_URLS.get('browser', '')
    parsed = urlsplit(browser_url.replace('{path}', ''))
    if parsed.scheme not in {'http', 'https'} or not parsed.netloc or parsed.username or parsed.password:
        raise ValueError('Configure a valid frontend browser URL for mail links.')
    return f'{parsed.scheme}://{parsed.netloc}'


def safe_action_url(path: str) -> str:
    if (not isinstance(path, str) or not path.startswith('/') or path.startswith('//')
            or '\\' in path or any(ord(char) < 32 for char in path)):
        return frontend_origin() + '/notifications'
    return frontend_origin() + path


def build_mail_context(*, title: str, message: str, user: User | None = None,
                       action_path: str = '/notifications', action_label: str | None = None,
                       language: str | None = None) -> dict[str, object]:
    language = language or getattr(user, 'preferred_language', None) or get_language() or 'tr'
    english = language.startswith('en')
    return {
        'mail_language': 'en' if english else 'tr',
        'mail_title': title,
        'mail_message': message,
        'mail_action_url': safe_action_url(action_path),
        'mail_action_label': action_label or ('Open application' if english else 'Uygulamayı aç'),
        'mail_footer': 'Shipyard inventory and shared equipment' if english else 'Tersane envanteri ve ortak ekipmanlar',
        'mail_security_hint': '',
        'mail_greeting': 'Hello,' if english else 'Merhaba,',
    }


def account_mail_context(template_prefix: str, email: str,
                         original: Mapping[str, object]) -> dict[str, object]:
    user = original.get('user')
    if not isinstance(user, User):
        user = User.objects.filter(email__iexact=email).first()
    key = template_prefix.rsplit('/', 1)[-1]
    copy = ACCOUNT_MESSAGES.get(key)
    language = getattr(user, 'preferred_language', None) or get_language() or 'tr'
    english = language.startswith('en')
    title = copy[1 if english else 0] if copy else ('Account security notification' if english else 'Hesap güvenliği bildirimi')
    message = copy[3 if english else 2] if copy else ('A security setting changed on your account.' if english else 'Hesabınızda bir güvenlik ayarı değiştirildi.')
    ctx = build_mail_context(user=user, language=language, title=title, message=message,
                             action_path='/account/authenticators',
                             action_label='Review account security' if english else 'Hesap güvenliğini incele')
    if key in CODE_MESSAGES:
        ctx['mail_code'] = original.get('code', '')
        timeout_name = ('ACCOUNT_LOGIN_BY_CODE_TIMEOUT' if key == 'login_code' else
                        'ACCOUNT_PASSWORD_RESET_BY_CODE_TIMEOUT' if key == 'password_reset_code' else
                        'ACCOUNT_EMAIL_VERIFICATION_BY_CODE_TIMEOUT')
        minutes = ceil(getattr(settings, timeout_name, 900) / 60)
        ctx['mail_expiry'] = f'This code expires in {minutes} minutes.' if english else f'Bu kod {minutes} dakika geçerlidir.'
        ctx['mail_action_url'] = ''
        ctx['mail_security_hint'] = 'If you did not request this, ignore this email. Never share this code.' if english else 'Bu işlemi siz istemediyseniz e-postayı dikkate almayın. Kodu kimseyle paylaşmayın.'
        if not ctx['mail_code'] and key.startswith('email_confirmation'):
            ctx['mail_message'] = 'Open the link below to verify your email address.' if english else 'E-posta adresinizi doğrulamak için aşağıdaki bağlantıyı açın.'
            ctx['mail_action_label'] = 'Verify email address' if english else 'E-postayı doğrula'
            ctx['mail_action_url'] = trusted_account_url(original.get('activate_url'))
    elif key == 'password_reset_key':
        ctx['mail_action_label'] = 'Reset password' if english else 'Parolayı sıfırla'
        ctx['mail_action_url'] = trusted_account_url(original.get('password_reset_url'))
        ctx['mail_security_hint'] = 'If you did not request this, ignore this email.' if english else 'Bu işlemi siz istemediyseniz e-postayı dikkate almayın.'
    else:
        ctx['mail_security_hint'] = 'If you did not make this change, review your account security immediately and contact your administrator.' if english else 'Bu değişikliği siz yapmadıysanız hesap güvenliğinizi hemen kontrol edin ve yöneticinize başvurun.'
        ctx['mail_event_time'] = original.get('timestamp')
    return ctx


def trusted_account_url(value: object) -> str:
    if not isinstance(value, str) or '\\' in value or any(ord(char) < 32 for char in value):
        return ''
    parsed = urlsplit(value)
    return value if f'{parsed.scheme}://{parsed.netloc}' == frontend_origin() else ''
