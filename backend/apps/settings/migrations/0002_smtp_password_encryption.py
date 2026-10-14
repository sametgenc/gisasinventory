from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("settings", "0001_initial")]

    operations = [
        migrations.AlterField(
            model_name="smtpsettings",
            name="password",
            field=models.TextField(blank=True, default=""),
        ),
    ]
