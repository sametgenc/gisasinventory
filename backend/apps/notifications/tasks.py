from celery import shared_task
from django.contrib.auth import get_user_model
from .utils import send_notifications

User = get_user_model()


@shared_task
def broadcast_heartbeat_notification():
    """
    Sends a heartbeat message to all registered users every 10 seconds.
    """
    from django.utils import timezone

    user_data = list(User.objects.values_list("uuid", flat=True))

    import uuid

    payload = {
        "uuid": str(uuid.uuid4()),
        "type": "heartbeat",
        "message": "System heartbeat: Still connected!",
        "created_at": str(timezone.now()),
    }

    user_uuids = [str(u) for u in user_data]
    count = len(user_uuids)

    send_notifications(user_uuids, payload, persist=True)

    msg = f"Broadcasted to {count} users."
    print(f"Celery: {msg}")
    return msg


@shared_task
def send_notification_task(user_uuid, data, persist=False):
    """
    Background task to send a notification to a single user.
    """
    send_notifications([str(user_uuid)], data, persist=persist)


@shared_task
def send_bulk_notification_task(user_uuids, data, persist=False):
    """
    Background task to send a notification to multiple users.
    """
    send_notifications([str(u) for u in user_uuids], data, persist=persist)
