from rest_framework import status, viewsets
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.tenants.permissions import IsPlatformAdmin

from .models import PlatformFeedback, PlatformFeedbackAttachment
from .serializers import PlatformFeedbackSerializer


class PlatformFeedbackViewSet(viewsets.ModelViewSet):
    """
    Platform-admin-only feedback (bug reports, feature requests) submitted
    from within the application.

    Create accepts multipart/form-data so files can be attached in a single
    request alongside the feedback fields.
    """

    serializer_class = PlatformFeedbackSerializer
    permission_classes = [IsPlatformAdmin]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    lookup_field = "id"

    def get_queryset(self):
        return (
            PlatformFeedback.objects.all()
            .select_related("submitted_by")
            .prefetch_related("attachments")
        )

    def create(self, request, *args, **kwargs):
        data = {
            "type": request.data.get("type", PlatformFeedback.TYPE_BUG),
            "subject": request.data.get("subject", ""),
            "description": request.data.get("description", ""),
            "page_url": request.data.get("page_url", ""),
            "user_agent": request.data.get("user_agent", ""),
        }
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        feedback = serializer.save(submitted_by=request.user)

        files = request.FILES.getlist("files")
        for f in files:
            PlatformFeedbackAttachment.objects.create(
                feedback=feedback,
                file=f,
                original_name=f.name,
                size=f.size,
                content_type=getattr(f, "content_type", "") or "",
            )

        output = self.get_serializer(feedback)
        return Response(output.data, status=status.HTTP_201_CREATED)
