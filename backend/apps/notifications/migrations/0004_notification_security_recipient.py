from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("notifications", "0003_notification_email_outbox")]
    operations = [
        migrations.AddField(model_name="notification", name="is_security", field=models.BooleanField(default=False, editable=False)),
        migrations.AddField(model_name="notification", name="email_recipient", field=models.EmailField(blank=True, default="", editable=False, max_length=254)),
    ]
