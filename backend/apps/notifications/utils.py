import json
import redis
import redis.asyncio as async_redis
from django.conf import settings


_redis_client = None
_async_redis_client = None


def get_redis_client():
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.Redis.from_url(settings.REDIS_URL)
    return _redis_client


def get_async_redis_client():
    global _async_redis_client
    if _async_redis_client is None:
        _async_redis_client = async_redis.Redis.from_url(
            settings.REDIS_URL, decode_responses=False
        )
    return _async_redis_client


def send_notification(user_id, data):
    """
    Publishes a notification to a single user's Redis channel.
    """
    send_notifications([user_id], data)


def send_notifications(user_uuids, data, persist=False):
    """
    Publishes a notification to multiple users' Redis channels (sync).
    """
    from apps.notifications.models import Notification
    from apps.user.models import User

    client = get_redis_client()
    payload = json.dumps(data)

    # Optional: Persist to database
    if persist:
        users = User.objects.filter(uuid__in=user_uuids)
        notifications = [Notification(user=user, content=data) for user in users]
        Notification.objects.bulk_create(notifications)

    for user_uuid in user_uuids:
        channel = f"user_notifications_{str(user_uuid)}"
        client.publish(channel, payload)


async def async_send_notification(user_id, data):
    """
    Publishes a notification to a single user's Redis channel (async).
    """
    await async_send_notifications([user_id], data)


async def async_send_notifications(user_uuids, data, persist=False):
    """
    Publishes a notification to multiple users' Redis channels (async).
    """
    from asgiref.sync import sync_to_async
    from apps.notifications.models import Notification
    from apps.user.models import User

    # Optional: Persist to database
    if persist:

        def _persist():
            users = User.objects.filter(uuid__in=user_uuids)
            notifications = [Notification(user=user, content=data) for user in users]
            Notification.objects.bulk_create(notifications)

        await sync_to_async(_persist)()

    notifications = [(user_uuid, data) for user_uuid in user_uuids]
    await async_send_bulk_notifications(notifications)


def send_bulk_notifications(notifications):
    """
    Publishes multiple different notifications using a Redis pipeline.
    notifications: list of (user_uuid, data) tuples
    """
    client = get_redis_client()
    pipe = client.pipeline()
    for user_uuid, data in notifications:
        channel = f"user_notifications_{str(user_uuid)}"
        pipe.publish(channel, json.dumps(data))
    pipe.execute()


async def async_send_bulk_notifications(notifications):
    """
    Publishes multiple different notifications using an async Redis pipeline.
    notifications: list of (user_uuid, data) tuples
    """
    client = get_async_redis_client()
    async with client.pipeline() as pipe:
        for user_uuid, data in notifications:
            channel = f"user_notifications_{str(user_uuid)}"
            await pipe.publish(channel, json.dumps(data))
        await pipe.execute()
