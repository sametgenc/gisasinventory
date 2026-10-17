from django.urls import path

from . import views
from .storage import StorageMetricsView

urlpatterns = [
    path("storage/", StorageMetricsView.as_view(), name="storage-metrics"),
    path("smtp/", views.SmtpSettingsView.as_view(), name="smtp-settings"),
    path("smtp/test/", views.SmtpTestView.as_view(), name="smtp-test"),
    path("smtp/status/", views.SmtpStatusView.as_view(), name="smtp-status"),
]
