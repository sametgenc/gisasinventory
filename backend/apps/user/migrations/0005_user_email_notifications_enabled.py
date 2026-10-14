from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("user", "0004_alter_user_options_user_preferred_language_user_role_and_more")]
    operations = [migrations.AddField(model_name="user", name="email_notifications_enabled", field=models.BooleanField(default=True))]
