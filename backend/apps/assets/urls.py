from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AssetTypeViewSet, AssetViewSet

router = DefaultRouter()
router.register(r'types', AssetTypeViewSet, basename='asset-type')
router.register(r'items', AssetViewSet, basename='asset')

urlpatterns = [
    path('', include(router.urls)),
]
