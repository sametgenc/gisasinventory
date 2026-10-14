"""Demo-only readiness and fixed sample downloads."""

from pathlib import Path

from django.conf import settings
from django.http import FileResponse, HttpResponse, HttpResponseNotFound, JsonResponse
from django.urls import path

from .urls import urlpatterns as application_urls

SAMPLE_FILES = frozenset({
    "katalog-gecerli.xlsx",
    "katalog-hatali.xlsx",
    "katalog-guncelleme.xlsx",
    "envanter-forklift.xlsx",
    "envanter-forklift-hatali.xlsx",
})


def health(request):
    return JsonResponse({"demo": True, "status": "ready"})


def sample_download(request, filename):
    if filename not in SAMPLE_FILES:
        return HttpResponseNotFound()
    file_path = Path(settings.DEMO_FILES_DIR) / filename
    if not file_path.is_file():
        return HttpResponseNotFound("Örnek dosyalar için demo verilerini hazırlayın.")
    response = FileResponse(
        file_path.open("rb"),
        as_attachment=True,
        filename=filename,
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    response["X-Content-Type-Options"] = "nosniff"
    response["Cache-Control"] = "no-store"
    return response


def local_notification_stream(request):
    # Demo uses ordinary notification reads; it must never connect to Redis.
    return HttpResponse(status=204)


urlpatterns = [
    path("demo/health/", health),
    path("demo/downloads/<str:filename>", sample_download),
    path("api/notifications/stream/", local_notification_stream),
    *application_urls,
]
