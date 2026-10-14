import logging
import smtplib

from django.conf import settings
from django.core.mail import EmailMultiAlternatives, get_connection
from django.template.loader import render_to_string
from django.utils import translation
from rest_framework import permissions, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.user.mail import build_mail_context

from .email_backend import (
    PREVIEW_BACKENDS,
    SmtpNotConfiguredError,
    delivery_mode,
    smtp_configuration,
    smtp_is_configured,
)
from .models import SmtpSettings
from .security import (
    IsActivePlatformAdmin, mfa_status, require_recent_authentication
)
from .serializers import SmtpSettingsSerializer, SmtpTestSerializer

logger = logging.getLogger(__name__)


def smtp_response(request: Request, config: SmtpSettings | None = None) -> dict[str, object]:
    if config is None:
        data = {
            "host": "",
            "port": 587,
            "username": "",
            "password_set": False,
            "use_tls": True,
            "use_ssl": False,
            "from_email": "",
            "is_configured": smtp_is_configured(),
            "updated_at": None,
        }
        if data["is_configured"]:
            environment = smtp_configuration(decrypt=False)
            data.update(
                host=environment.host,
                port=environment.port,
                username=environment.username,
                password_set=bool(environment.password),
                use_tls=environment.use_tls,
                use_ssl=environment.use_ssl,
                from_email=environment.from_email,
            )
    else:
        data = dict(SmtpSettingsSerializer(config).data)
        data["is_configured"] = smtp_is_configured()
    data.update(delivery_mode=delivery_mode(), **mfa_status(request))
    return data


class SmtpSettingsView(APIView):
    permission_classes = [IsActivePlatformAdmin]

    def get(self, request: Request) -> Response:
        return Response(smtp_response(request, SmtpSettings.load()))

    def put(self, request: Request) -> Response:
        require_recent_authentication(request)
        config = SmtpSettings.load()
        serializer = SmtpSettingsSerializer(
            config, data=request.data, partial=config is not None
        )
        serializer.is_valid(raise_exception=True)
        config = serializer.save()
        return Response(smtp_response(request, config))


class SmtpTestView(APIView):
    permission_classes = [IsActivePlatformAdmin]

    def post(self, request: Request) -> Response:
        require_recent_authentication(request)
        serializer = SmtpTestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            config = smtp_configuration()
            language = request.user.preferred_language
            with translation.override(language):
                title = (
                    "E-posta bağlantı testi" if language == "tr"
                    else "Email connection test"
                )
                message = (
                    "Bu ileti, GİSAS envanter platformunun e-posta ayarlarını kontrol etmek için oluşturuldu."
                    if language == "tr" else
                    "This message checks the email settings for the GİSAS inventory platform."
                )
                context = build_mail_context(
                    user=request.user, title=title, message=message
                )
                email = EmailMultiAlternatives(
                    subject=title,
                    body=render_to_string("mail/smtp_test_message.txt", context),
                    from_email=config.from_email,
                    to=[serializer.validated_data["email"]],
                )
                email.attach_alternative(
                    render_to_string("mail/smtp_test_message.html", context), "text/html"
                )
                if (
                    getattr(settings, "DEMO_MODE", False)
                    and settings.EMAIL_BACKEND not in PREVIEW_BACKENDS
                ):
                    email.connection = get_connection(
                        backend="django.core.mail.backends.console.EmailBackend"
                    )
                sent = email.send(fail_silently=False)
            mode = delivery_mode()
            if mode == "smtp" and sent < 1:
                raise RuntimeError("Email backend did not accept the message.")
            detail = (
                "Preview only. No external email was sent."
                if mode == "preview" else "Test email submitted to the mail server."
            )
            return Response({"detail": detail, "delivery_mode": mode})
        except SmtpNotConfiguredError:
            return Response(
                {
                    "code": "smtp_not_configured",
                    "detail": "Configure the mail server before sending a test.",
                }, status=status.HTTP_400_BAD_REQUEST,
            )
        except smtplib.SMTPAuthenticationError:
            return Response(
                {
                    "code": "smtp_auth_failed",
                    "detail": "The mail server rejected the login credentials.",
                }, status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception:
            logger.error("SMTP test failed.")
            return Response(
                {
                    "code": "smtp_connection_failed",
                    "detail": "The email test failed. Check the server settings and try again.",
                }, status=status.HTTP_400_BAD_REQUEST,
            )


class SmtpStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request: Request) -> Response:
        return Response({
            "is_configured": smtp_is_configured(), "delivery_mode": delivery_mode()
        })
