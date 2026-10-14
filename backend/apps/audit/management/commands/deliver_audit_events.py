import json

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.audit.tasks import deliver_pending_audit_events


class Command(BaseCommand):
    help = "Deliver a bounded batch of due audit events to the configured HTTPS SIEM collector."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=None)

    def handle(self, *args, **options):
        if not getattr(settings, "AUDIT_SIEM_ENABLED", False) or getattr(settings, "DEMO_MODE", False):
            raise CommandError("SIEM delivery is disabled")
        if options["limit"] is not None and not 1 <= options["limit"] <= 1000:
            raise CommandError("--limit must be between 1 and 1000")
        result = deliver_pending_audit_events(limit=options["limit"])
        self.stdout.write(json.dumps(result))
