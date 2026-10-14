import uuid

from django.db import migrations, models


def assign_event_ids(apps, schema_editor):
    Notification = apps.get_model("notifications", "Notification")
    for pk in Notification.objects.using(schema_editor.connection.alias).values_list("pk", flat=True).iterator():
        Notification.objects.using(schema_editor.connection.alias).filter(pk=pk).update(event_id=uuid.uuid4())


class Migration(migrations.Migration):
    dependencies = [("notifications", "0002_notification_deleted_at")]
    operations = [
        migrations.AddField(model_name="notification", name="event_id", field=models.UUIDField(null=True, editable=False)),
        migrations.RunPython(assign_event_ids, migrations.RunPython.noop),
        migrations.AlterField(model_name="notification", name="event_id", field=models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
        migrations.AddField(model_name="notification", name="deduplication_key", field=models.CharField(blank=True, max_length=180, null=True)),
        migrations.AddField(model_name="notification", name="email_status", field=models.CharField(choices=[("queued", "Queued"), ("sending", "Sending"), ("sent", "Sent"), ("preview", "Local preview"), ("failed", "Failed"), ("skipped", "Skipped")], default="skipped", max_length=10)),
        migrations.AddField(model_name="notification", name="email_attempts", field=models.PositiveSmallIntegerField(default=0)),
        migrations.AddField(model_name="notification", name="email_error_code", field=models.CharField(blank=True, default="", max_length=40)),
        migrations.AddField(model_name="notification", name="email_next_attempt_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="notification", name="email_locked_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="notification", name="email_sent_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddConstraint(model_name="notification", constraint=models.UniqueConstraint(fields=("user", "deduplication_key"), name="notification_user_event_unique")),
        migrations.AddIndex(model_name="notification", index=models.Index(fields=["email_status", "email_next_attempt_at"], name="notification_email_due")),
    ]
