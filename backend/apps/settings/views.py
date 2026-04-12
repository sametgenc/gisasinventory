from django.core.mail import EmailMessage
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.tenants.permissions import IsPlatformAdmin

from .models import SmtpSettings
from .serializers import SmtpSettingsSerializer


class SmtpSettingsView(APIView):
    """GET / PUT the singleton SMTP configuration."""

    permission_classes = [IsPlatformAdmin]

    def get(self, request):
        config = SmtpSettings.load()
        if config is None:
            return Response(
                {
                    "host": "",
                    "port": 587,
                    "username": "",
                    "password_set": False,
                    "use_tls": True,
                    "use_ssl": False,
                    "from_email": "",
                    "is_configured": False,
                    "updated_at": None,
                }
            )
        serializer = SmtpSettingsSerializer(config)
        return Response(serializer.data)

    def put(self, request):
        config = SmtpSettings.load()
        if config is None:
            serializer = SmtpSettingsSerializer(data=request.data)
        else:
            serializer = SmtpSettingsSerializer(config, data=request.data, partial=True)

        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class SmtpTestView(APIView):
    """Send a test email using current SMTP configuration."""

    permission_classes = [IsPlatformAdmin]

    def post(self, request):
        recipient = request.data.get("email")
        if not recipient:
            return Response(
                {"detail": "Email address is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        config = SmtpSettings.load()
        if config is None or not config.is_configured:
            return Response(
                {"detail": "SMTP settings are not configured."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            email = EmailMessage(
                subject="SMTP Test - LearnWithAI",
                body="This is a test email to verify your SMTP configuration is working correctly.",
                from_email=config.from_email,
                to=[recipient],
            )
            email.send(fail_silently=False)
            return Response({"detail": "Test email sent successfully."})
        except Exception as e:
            return Response(
                {"detail": f"Failed to send test email: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )


class SmtpStatusView(APIView):
    """Quick check whether SMTP is configured. Accessible to any authenticated user."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        config = SmtpSettings.load()
        is_configured = config is not None and config.is_configured
        return Response({"is_configured": is_configured})
