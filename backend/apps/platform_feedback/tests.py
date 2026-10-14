from tempfile import TemporaryDirectory
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework.test import APITestCase
from apps.user.models import User
from .models import PlatformFeedback, PlatformFeedbackAttachment


class FeedbackAttachmentTests(APITestCase):
    def test_download_works_with_debug_disabled_and_requires_superuser(self):
        admin = User.objects.create(username="admin", is_superuser=True)
        ordinary = User.objects.create(username="ordinary")
        with TemporaryDirectory() as directory, override_settings(MEDIA_ROOT=directory, DEBUG=False):
            feedback = PlatformFeedback.objects.create(subject="Example", description="Details", submitted_by=admin)
            attachment = PlatformFeedbackAttachment.objects.create(
                feedback=feedback, file=SimpleUploadedFile("proof.txt", b"proof"), original_name="proof.txt",
            )
            self.client.force_authenticate(admin)
            detail = self.client.get(f"/api/platform-feedback/{feedback.pk}/")
            url = detail.data["attachments"][0]["url"]
            self.assertIn("/download/", url)
            response = self.client.get(url)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(b"".join(response.streaming_content), b"proof")
            self.assertIn("attachment", response["Content-Disposition"])
            response.close()
            self.client.force_authenticate(ordinary)
            self.assertEqual(self.client.get(url).status_code, 403)
            self.client.force_authenticate(None)
            self.assertIn(self.client.get(url).status_code, (401, 403))
            attachment.file.delete()
