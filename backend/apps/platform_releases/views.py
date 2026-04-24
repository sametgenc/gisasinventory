from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.tenants.permissions import IsPlatformAdmin

from .models import PlatformRelease, PlatformReleaseAttachment
from .serializers import (
    PlatformReleaseAttachmentSerializer,
    PlatformReleaseSerializer,
)

User = get_user_model()


class PlatformReleaseViewSet(viewsets.ModelViewSet):
    """
    Admin CRUD for platform releases (feature/bugfix announcements).
    Only platform admins can write. Authenticated users can read *published*
    entries via the `public` action.
    """

    serializer_class = PlatformReleaseSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    lookup_field = "id"

    def get_queryset(self):
        return (
            PlatformRelease.objects.all()
            .select_related("created_by")
            .prefetch_related("attachments")
        )

    def get_permissions(self):
        if self.action in {"public", "retrieve_public"}:
            return [permissions.IsAuthenticated()]
        return [IsPlatformAdmin()]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=False, methods=["get"], url_path="public")
    def public(self, request):
        """List published releases for all authenticated users."""
        qs = (
            self.get_queryset()
            .filter(status=PlatformRelease.STATUS_PUBLISHED)
            .order_by("-published_at", "-created_at")
        )
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="publish")
    def publish(self, request, id=None):
        release = self.get_object()
        was_draft = release.status != PlatformRelease.STATUS_PUBLISHED
        release.mark_published()

        if was_draft:
            self._broadcast_published_notification(release)

        serializer = self.get_serializer(release)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="unpublish")
    def unpublish(self, request, id=None):
        release = self.get_object()
        release.mark_draft()
        serializer = self.get_serializer(release)
        return Response(serializer.data)

    @action(
        detail=True,
        methods=["post"],
        url_path="attachments",
        parser_classes=[MultiPartParser, FormParser],
    )
    def upload_attachment(self, request, id=None):
        release = self.get_object()
        files = request.FILES.getlist("files") or (
            [request.FILES["file"]] if "file" in request.FILES else []
        )
        if not files:
            return Response(
                {"detail": "No files provided."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        created = []
        for f in files:
            attachment = PlatformReleaseAttachment.objects.create(
                release=release,
                file=f,
                original_name=f.name,
                size=f.size,
                content_type=getattr(f, "content_type", "") or "",
                uploaded_by=request.user,
            )
            created.append(attachment)

        serializer = PlatformReleaseAttachmentSerializer(
            created, many=True, context={"request": request}
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(
        detail=True,
        methods=["delete"],
        url_path=r"attachments/(?P<attachment_id>[^/.]+)",
    )
    def delete_attachment(self, request, id=None, attachment_id=None):
        release = self.get_object()
        attachment = get_object_or_404(
            PlatformReleaseAttachment, id=attachment_id, release=release
        )
        attachment.file.delete(save=False)
        attachment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def _broadcast_published_notification(self, release):
        """Fan out an in-app notification to all active users."""
        try:
            from apps.notifications.tasks import send_bulk_notification_task

            user_uuids = list(
                User.objects.filter(is_active=True).values_list("uuid", flat=True)
            )
            if not user_uuids:
                return
            payload = {
                "type": "platform_release",
                "release_id": str(release.id),
                "version": release.version,
                "release_type": release.type,
                "title": release.title,
                "message": f"{release.version} - {release.title}",
            }
            send_bulk_notification_task.delay(
                [str(u) for u in user_uuids], payload, persist=True
            )
        except Exception:
            # Never block publishing if the notification fan-out fails.
            pass
