"""Best-effort live notifications. Database history remains authoritative."""

import json
import logging
from collections.abc import Mapping, Sequence
from uuid import UUID

import redis
import redis.asyncio as async_redis
from django.conf import settings
from apps.assets.validation import JSONValue

logger = logging.getLogger(__name__)
_redis_client = None
_async_redis_client = None


def get_redis_client() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.Redis.from_url(settings.REDIS_URL, socket_connect_timeout=1, socket_timeout=1)
    return _redis_client


def get_async_redis_client() -> async_redis.Redis:
    global _async_redis_client
    if _async_redis_client is None:
        _async_redis_client = async_redis.Redis.from_url(
            settings.REDIS_URL, decode_responses=False, socket_connect_timeout=1, socket_timeout=1,
        )
    return _async_redis_client


def send_notification(user_id: str | UUID, data: Mapping[str, JSONValue]) -> None:
    send_notifications([user_id], data)


def send_notifications(user_uuids: Sequence[str | UUID], data: Mapping[str, JSONValue], persist: bool = False) -> None:
    if data.get("type") in ("ping", "heartbeat"):
        persist = False
    if persist:
        from apps.user.models import User
        from .services import create_notification
        event_key = data.get("uuid")
        for user in User.objects.filter(uuid__in=user_uuids):
            create_notification(user, data, event_key=f"legacy:{event_key}" if event_key else None)
        return
    send_bulk_notifications([(user_uuid, data) for user_uuid in user_uuids])


def send_bulk_notifications(notifications: Sequence[tuple[str | UUID, Mapping[str, JSONValue]]]) -> None:
    try:
        pipe = get_redis_client().pipeline()
        for user_uuid, data in notifications:
            pipe.publish(f"user_notifications_{user_uuid}", json.dumps(dict(data)))
        pipe.execute()
    except Exception:
        logger.warning("Live notification delivery unavailable; database history is preserved")


async def async_send_notification(user_id: str | UUID, data: Mapping[str, JSONValue]) -> None:
    await async_send_notifications([user_id], data)


async def async_send_notifications(user_uuids: Sequence[str | UUID], data: Mapping[str, JSONValue], persist: bool = False) -> None:
    if persist:
        from asgiref.sync import sync_to_async
        await sync_to_async(send_notifications)(user_uuids, data, persist=True)
        return
    await async_send_bulk_notifications([(user_uuid, data) for user_uuid in user_uuids])


async def async_send_bulk_notifications(notifications: Sequence[tuple[str | UUID, Mapping[str, JSONValue]]]) -> None:
    try:
        async with get_async_redis_client().pipeline() as pipe:
            for user_uuid, data in notifications:
                pipe.publish(f"user_notifications_{user_uuid}", json.dumps(dict(data)))
            await pipe.execute()
    except Exception:
        logger.warning("Live notification delivery unavailable; database history is preserved")
