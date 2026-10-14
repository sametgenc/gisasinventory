"""Loopback-only demo with its own database, files, and local services."""

from .settings import *  # noqa: F403

DEMO_MODE = True
DEMO_ROOT = BASE_DIR.parent / "var" / "demo"  # noqa: F405
DEMO_DATABASE_PATH = DEMO_ROOT / "demo.sqlite3"
DEMO_FILES_DIR = DEMO_ROOT / "downloads"

# Deliberately ignore DATABASE_URL and every production service address.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": DEMO_DATABASE_PATH,
        "OPTIONS": {"timeout": 20},
    }
}
SECRET_KEY = "gisas-local-demo-only-not-for-deployment-2026"
DEBUG = True
ALLOWED_HOSTS = ["localhost", "127.0.0.1", "[::1]"]
DOMAIN = "localhost"
ROOT_URLCONF = "config.demo_urls"
TIME_ZONE = "Europe/Istanbul"

EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
DEFAULT_FROM_EMAIL = "demo@gisas.test"
# Never inherit production mail credentials or encryption keys into the local demo.
EMAIL_HOST = ""
EMAIL_HOST_USER = ""
EMAIL_HOST_PASSWORD = ""
SMTP_CREDENTIAL_KEY = ""
MFA_CREDENTIAL_KEY = ""
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
CELERY_BROKER_URL = "memory://"
CELERY_RESULT_BACKEND = "cache+memory://"
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True
CELERY_BEAT_SCHEDULE = {}
REDIS_URL = "redis://127.0.0.1:1/0"

SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False
SECURE_SSL_REDIRECT = False
SECURE_PROXY_SSL_HEADER = None
SESSION_COOKIE_NAME = "gisas_demo_sessionid"
CSRF_COOKIE_NAME = "csrftoken"
CORS_ALLOWED_ORIGINS = ["http://127.0.0.1:5190", "http://localhost:5190"]
CSRF_TRUSTED_ORIGINS = CORS_ALLOWED_ORIGINS
ACCOUNT_DEFAULT_HTTP_PROTOCOL = "http"
HEADLESS_FRONTEND_URLS = {
    "browser": "http://127.0.0.1:5190{path}",
    "account_confirm_email": "http://127.0.0.1:5190/auth/email/confirm/{key}",
    "account_reset_password": "http://127.0.0.1:5190/auth/reset-password",
    "account_reset_password_from_key": "http://127.0.0.1:5190/auth/password/confirm/{key}",
    "account_signup": "http://127.0.0.1:5190/register",
    "account_login": "http://127.0.0.1:5190/login",
    "account_email": "http://127.0.0.1:5190/account/email",
    "socialaccount_login_error": "http://127.0.0.1:5190/account/provider/callback",
}
MFA_WEBAUTHN_RP_ID = "localhost"
MEDIA_ROOT = DEMO_ROOT / "media"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}
