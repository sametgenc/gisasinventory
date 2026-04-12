import asyncio
import json

from asgiref.sync import sync_to_async
from django.http import StreamingHttpResponse
from django.utils import timezone
from redis.exceptions import ConnectionError as RedisConnectionError
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Notification
from .serializers import NotificationSerializer


class NotificationViewSet(viewsets.ModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(
            user=self.request.user, deleted_at__isnull=True
        )

    @action(detail=True, methods=["post"])
    def mark_as_read(self, request, pk=None):
        notification = self.get_object()
        notification.read_at = timezone.now()
        notification.save()
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


async def stream_notifications(request):
    """
    Streams notifications to the client using Server-Sent Events.
    Tracks user presence with a Redis key (TTL 30s, refresh 20s).
    """
    is_authenticated = await sync_to_async(lambda: request.user.is_authenticated)()
    if not is_authenticated:
        return StreamingHttpResponse("Unauthorized", status=401)
    user_uuid = await sync_to_async(lambda: str(request.user.uuid))()

    async def event_stream():
        from .utils import get_async_redis_client

        client = get_async_redis_client()
        pubsub = client.pubsub()
        channel = f"user_notifications_{user_uuid}"
        presence_key = f"user_presence_{user_uuid}"

        await pubsub.subscribe(channel)
        print(f"SSE: User {user_uuid} subscribed to {channel}")

        async def update_presence():
            """Sets user presence with 30s TTL"""
            try:
                await client.set(presence_key, "online", ex=30)
            except Exception as e:
                print(f"SSE: Presence update failed for {user_uuid}: {e}")

        # Initial presence set
        await update_presence()

        try:
            # Padding for immediate flush
            yield f": {' ' * 2048}\n\n"
            ping_data = json.dumps({"type": "ping", "message": "Connected"})
            yield f"data: {ping_data}\n\n"

            while True:
                # Use the Redis client's internal timeout to block until a message arrives
                # This prevents the previous "busy loop" that caused high CPU usage
                message = await pubsub.get_message(
                    ignore_subscribe_messages=True, timeout=15.0
                )

                if message:
                    if message["type"] == "message":
                        data = message["data"].decode("utf-8")
                        yield f"data: {data}\n\n"

                    # Refresh presence on activity
                    await update_presence()
                else:
                    # If message is None, it means the 15s timeout was reached
                    # Send heartbeat and refresh presence
                    await update_presence()
                    yield ": keep-alive\n\n"

        except asyncio.CancelledError:
            print(f"SSE: User {user_uuid} disconnected")
        except Exception as e:
            print(f"SSE: Unexpected error for user {user_uuid}: {e}")
        finally:
            try:
                # Use a separate task for cleanup to avoid blocking if Redis is slow
                # but for simplicity here we just try-except
                await client.delete(presence_key)
                await pubsub.unsubscribe(channel)
                await pubsub.close()
            except (RedisConnectionError, OSError):
                pass

    response = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
    response["Cache-Control"] = "no-cache, no-transform"
    response["X-Accel-Buffering"] = "no"
    response["Content-Encoding"] = "none"
    return response
