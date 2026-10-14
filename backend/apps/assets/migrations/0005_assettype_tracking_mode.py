from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('assets', '0004_asset_sharing'),
    ]

    operations = [
        migrations.AddField(
            model_name='assettype',
            name='tracking_mode',
            field=models.CharField(
                choices=[('individual', 'Tek tek ekipman'), ('stock', 'Adetli malzeme stoku')],
                default='individual', max_length=10,
            ),
        ),
    ]
