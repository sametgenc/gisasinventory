import json

from django.core.management.base import BaseCommand
from django.db.models import Count

from apps.audit.models import SiemDelivery


class Command(BaseCommand):
    help = "Show safe SIEM backlog counts and oldest unsent event timestamp."

    def handle(self, *args, **options):
        counts = {row["status"]: row["count"] for row in SiemDelivery.objects.values("status").annotate(count=Count("pk"))}
        oldest = SiemDelivery.objects.exclude(status=SiemDelivery.Status.SENT).order_by("event__occurred_at").values_list("event__occurred_at", flat=True).first()
        self.stdout.write(json.dumps({"counts": counts, "oldest_unsent_at": oldest.isoformat() if oldest else None}))
