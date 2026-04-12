from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import NotificationViewSet, stream_notifications

router = DefaultRouter()
router.register(r"", NotificationViewSet, basename="notification")

urlpatterns = [
    path("stream/", stream_notifications, name="notifications_stream"),
    path("", include(router.urls)),
]
