from rest_framework.routers import DefaultRouter

from .views import PlatformFeedbackViewSet

router = DefaultRouter()
router.register(r"", PlatformFeedbackViewSet, basename="platform-feedback")

urlpatterns = router.urls
