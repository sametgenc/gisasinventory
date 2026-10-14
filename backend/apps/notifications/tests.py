from unittest.mock import patch
from rest_framework.test import APITestCase
from apps.user.models import User
from .models import Notification
from .tasks import broadcast_heartbeat_notification


class NotificationTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create(username="reader")
        self.client.force_authenticate(self.user)

    @patch("apps.notifications.tasks.send_notifications")
    def test_legacy_heartbeat_never_persists_or_triggers_ui_notifications(self, send):
        broadcast_heartbeat_notification()
        self.assertFalse(send.call_args.kwargs.get("persist", False))
        self.assertEqual(send.call_args.args[1]["type"], "ping")

    def test_list_obeys_limit_and_hides_legacy_heartbeats(self):
        Notification.objects.bulk_create([
            Notification(user=self.user, content={"message": str(i)}) for i in range(12)
        ])
        Notification.objects.create(user=self.user, content={"type": "heartbeat"})
        response = self.client.get("/api/notifications/?limit=5")
        self.assertEqual(response.data["count"], 12)
        self.assertEqual(len(response.data["results"]), 5)
        self.assertIsNotNone(response.data["next"])

    def test_clients_cannot_forge_notification_content(self):
        notification = Notification.objects.create(user=self.user, content={"message": "original"})
        response = self.client.patch(f"/api/notifications/{notification.pk}/", {"content": {"message": "forged"}}, format="json")
        self.assertEqual(response.status_code, 405)
