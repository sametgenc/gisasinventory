"""Read-only sizes visible to the application, for global administrators only."""

import shutil
from pathlib import Path

from django.conf import settings
from django.db import DatabaseError, connection
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from .security import IsActivePlatformAdmin


def disk_metrics(directory: str | Path) -> dict[str, object]:
    unavailable = {
        "status": "unavailable", "total_bytes": None, "used_bytes": None,
        "free_bytes": None, "used_percent": None,
    }
    try:
        path = Path(directory)
        if not path.is_dir():
            return unavailable
        usage = shutil.disk_usage(path)
        total, used, free = usage.total, usage.used, usage.free
        if total <= 0 or not 0 <= used <= total or not 0 <= free <= total:
            return unavailable
        percent = used * 100 / total
        state = "critical" if percent >= 95 else "warning" if percent >= 85 else "ok"
        return {
            "status": state, "total_bytes": total, "used_bytes": used,
            "free_bytes": free, "used_percent": round(percent, 1),
        }
    except (OSError, TypeError, ValueError):
        return unavailable


def database_metrics() -> dict[str, object]:
    vendor = connection.vendor
    engine = vendor if vendor in {"postgresql", "sqlite"} else "other"
    result = {
        "status": "unavailable", "engine": engine, "size_bytes": None,
        "capacity_bytes": None, "used_percent": None,
    }
    try:
        if engine == "postgresql":
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_database_size(current_database())")
                row = cursor.fetchone()
            size = row[0] if row else None
        elif engine == "sqlite":
            name = connection.settings_dict.get("NAME")
            if not name or str(name) == ":memory:" or str(name).startswith("file:"):
                return result
            path = Path(name)
            if not path.is_file():
                return result
            size = path.stat().st_size
        else:
            return result
        if isinstance(size, int) and not isinstance(size, bool) and size >= 0:
            result.update(status="ok", size_bytes=size)
    except (DatabaseError, OSError, TypeError, ValueError):
        pass
    return result


class StorageMetricsView(APIView):
    permission_classes = [IsActivePlatformAdmin]
    http_method_names = ["get", "head", "options"]

    def get(self, request) -> Response:
        response = Response({
            "checked_at": timezone.now().isoformat(),
            "application_disk": disk_metrics(settings.BASE_DIR),
            "media_disk": disk_metrics(settings.MEDIA_ROOT),
            "database": database_metrics(),
        })
        response["Cache-Control"] = "private, no-store"
        return response
