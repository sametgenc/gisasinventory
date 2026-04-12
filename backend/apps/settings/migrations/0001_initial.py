from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="SmtpSettings",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("host", models.CharField(max_length=255)),
                ("port", models.IntegerField(default=587)),
                (
                    "username",
                    models.CharField(blank=True, default="", max_length=255),
                ),
                (
                    "password",
                    models.CharField(blank=True, default="", max_length=255),
                ),
                ("use_tls", models.BooleanField(default=True)),
                ("use_ssl", models.BooleanField(default=False)),
                ("from_email", models.EmailField(max_length=254)),
                ("is_configured", models.BooleanField(default=False)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "SMTP Settings",
                "verbose_name_plural": "SMTP Settings",
            },
        ),
    ]
