from django.urls import path

from . import views

urlpatterns = [
    path("smtp/", views.SmtpSettingsView.as_view(), name="smtp-settings"),
    path("smtp/test/", views.SmtpTestView.as_view(), name="smtp-test"),
    path("smtp/status/", views.SmtpStatusView.as_view(), name="smtp-status"),
]
