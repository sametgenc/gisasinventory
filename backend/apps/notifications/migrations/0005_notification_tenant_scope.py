from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("notifications", "0004_notification_security_recipient"),
        ("tenants", "0002_remove_tenant_name_i18n_tenant_address_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="notification", name="tenant",
            field=models.ForeignKey(blank=True, editable=False, null=True,
                                    on_delete=django.db.models.deletion.CASCADE,
                                    related_name="notifications", to="tenants.tenant"),
        ),
        # Historical membership was not recorded. Fail closed without deleting history.
        migrations.AddField(
            model_name="notification", name="tenant_scope_known",
            field=models.BooleanField(default=False, editable=False),
        ),
        migrations.AlterField(
            model_name="notification", name="tenant_scope_known",
            field=models.BooleanField(default=True, editable=False),
        ),
    ]
