from rest_framework.routers import DefaultRouter

from .views import PlatformReleaseViewSet

router = DefaultRouter()
router.register(r"", PlatformReleaseViewSet, basename="platform-release")

urlpatterns = router.urls
