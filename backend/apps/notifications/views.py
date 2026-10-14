import asyncio
import json
import logging

from asgiref.sync import sync_to_async
from django.http import StreamingHttpResponse
from django.db.models import Q
from django.db import transaction
from django.utils import timezone
from redis.exceptions import ConnectionError as RedisConnectionError
from rest_framework import mixins, permissions, viewsets
from rest_framework.pagination import LimitOffsetPagination
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Notification
from .serializers import NotificationSerializer, NotificationPreferencesSerializer
from .permissions import visible_notifications
from apps.user.models import User
from apps.tenants.models import Tenant

logger = logging.getLogger(__name__)


class NotificationPagination(LimitOffsetPagination):
    default_limit = 50
    max_limit = 100


class IsActiveNotificationUser(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_active


class NotificationViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin,
                          mixins.DestroyModelMixin, viewsets.GenericViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated, IsActiveNotificationUser]
    pagination_class = NotificationPagination

    def get_queryset(self):
        return visible_notifications(self.request.user).filter(
            Q(content__type__isnull=True) | ~Q(content__type__in=["heartbeat", "ping"])
        ).order_by("-created_at", "-pk")

    @action(detail=True, methods=["post"])
    def mark_as_read(self, request, pk=None):
        notification = self.get_object()
        notification.read_at = timezone.now()
        notification.save(update_fields=["read_at"])
        return Response({"status": "notification marked as read"})

    @action(detail=False, methods=["post"])
    def mark_all_as_read(self, request):
        self.get_queryset().filter(read_at__isnull=True).update(read_at=timezone.now())
        return Response({"status": "all notifications marked as read"})

    @action(detail=False, methods=["post"])
    def clear_all(self, request):
        self.get_queryset().update(deleted_at=timezone.now())
        return Response({"status": "all notifications hidden"})

    @action(detail=False, methods=["get"])
    def unread_count(self, request):
        count = self.get_queryset().filter(read_at__isnull=True).count()
        return Response({"unread_count": count})

    @action(detail=False, methods=["get", "patch"])
    def preferences(self, request):
        user = request.user
        if request.method == "PATCH":
            serializer = NotificationPreferencesSerializer(data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            for name, value in serializer.validated_data.items():
                setattr(user, name, value)
            if serializer.validated_data:
                user.save(update_fields=list(serializer.validated_data))
        return Response(NotificationPreferencesSerializer(user).data)


def stream_user(user_id, tenant_id, session_auth_hash=None):
    """End live connections after account deactivation or shipyard reassignment."""
    user = User.objects.select_related("tenant").filter(pk=user_id, is_active=True).first()
    if user is None or user.tenant_id != tenant_id:
        return None
    if session_auth_hash is not None and user.get_session_auth_hash() != session_auth_hash:
        return None
    if user.tenant_id is not None and not user.tenant.is_active:
        return None
    return user


def stream_notification_payload(user, raw_data):
    """Redis only wakes the stream; private content comes from an authorized row."""
    try:
        data = json.loads(raw_data)
        notification_id = data.get("notification_id")
    except (ValueError, TypeError, AttributeError):
        return None
    if (isinstance(notification_id, bool) or not isinstance(notification_id, int)
            or not 0 < notification_id < 2**63):
        return None
    with transaction.atomic():
        current = User.objects.select_for_update(no_key=True).filter(pk=user.pk, is_active=True).first()
        if (current is None or current.tenant_id != user.tenant_id
                or current.get_session_auth_hash() != user.get_session_auth_hash()):
            return None
        if current.tenant_id is not None:
            tenant = Tenant.objects.select_for_update(no_key=True).get(pk=current.tenant_id)
            if not tenant.is_active:
                return None
            current.tenant = tenant
        notification = visible_notifications(current).select_for_update().filter(pk=notification_id).first()
        if notification is None:
            return None
        return {**notification.content, "uuid": str(notification.event_id),
                "created_at": notification.created_at.isoformat(), "notification_id": notification.pk}


async def stream_notifications(request):
    """
    Streams notifications to the client using Server-Sent Events.
    Tracks user presence with a Redis key (TTL 30s, refresh 20s).
    """
    is_authenticated = await sync_to_async(lambda: request.user.is_authenticated and request.user.is_active)()
    if not is_authenticated:
        return StreamingHttpResponse("Unauthorized", status=401)
    user_uuid = await sync_to_async(lambda: str(request.user.uuid))()
    user_id, tenant_id, session_auth_hash = await sync_to_async(
        lambda: (request.user.pk, request.user.tenant_id, request.user.get_session_auth_hash())
    )()
    if await sync_to_async(stream_user)(user_id, tenant_id, session_auth_hash) is None:
        return StreamingHttpResponse("Unauthorized", status=401)

    async def event_stream():
        from .utils import get_async_redis_client

        client = get_async_redis_client()
        pubsub = client.pubsub()
        channel = f"user_notifications_{user_uuid}"
        presence_key = f"user_presence_{user_uuid}"

        async def update_presence():
            """Sets user presence with 30s TTL"""
            try:
                await client.set(presence_key, "online", ex=30)
            except (RedisConnectionError, OSError):
                logger.debug("Live notification presence is unavailable")

        try:
            # Padding for immediate flush
            yield f": {' ' * 2048}\n\n"
            await pubsub.subscribe(channel)
            await update_presence()
            ping_data = json.dumps({"type": "ping", "message": "Connected"})
            yield f"data: {ping_data}\n\n"

            while True:
                # Use the Redis client's internal timeout to block until a message arrives
                # This prevents the previous "busy loop" that caused high CPU usage
                message = await pubsub.get_message(
                    ignore_subscribe_messages=True, timeout=15.0
                )

                user = await sync_to_async(stream_user)(user_id, tenant_id, session_auth_hash)
                if user is None:
                    break

                if message:
                    if message["type"] == "message":
                        data = await sync_to_async(stream_notification_payload)(user, message["data"])
                        if data is not None:
                            yield f"data: {json.dumps(data)}\n\n"

                    # Refresh presence on activity
                    await update_presence()
                else:
                    # If message is None, it means the 15s timeout was reached
                    # Send heartbeat and refresh presence
                    await update_presence()
                    yield ": keep-alive\n\n"

        except asyncio.CancelledError:
            logger.debug("Live notification connection closed")
        except Exception:
            logger.warning("Live notification connection unavailable; clients can read database history")
        finally:
            try:
                # Use a separate task for cleanup to avoid blocking if Redis is slow
                # but for simplicity here we just try-except
                await client.delete(presence_key)
                await pubsub.unsubscribe(channel)
                await pubsub.aclose()
            except Exception:
                pass

    response = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
    response["Cache-Control"] = "no-cache, no-transform"
    response["X-Accel-Buffering"] = "no"
    response["Content-Encoding"] = "none"
    return response
