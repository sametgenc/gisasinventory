from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('assets', '0003_assettype_catalog_code_assettype_category_code_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='asset', name='is_shared', field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='asset', name='sharing_note',
            field=models.CharField(blank=True, default='', max_length=1000),
        ),
        migrations.AddField(
            model_name='asset', name='shared_at', field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddIndex(
            model_name='asset',
            index=models.Index(fields=['is_shared', '-shared_at'], name='asset_shared_listing_idx'),
        ),
    ]
