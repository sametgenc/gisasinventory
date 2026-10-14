from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AssetTypeViewSet, AssetViewSet
from .usage_views import SharedUsageRequestViewSet
from .combined_views import WorkbookPreviewView, WorkbookCommitView, WorkbookTemplateView

router = DefaultRouter()
router.register(r'types', AssetTypeViewSet, basename='asset-type')
router.register(r'items', AssetViewSet, basename='asset')
router.register(r'usage-requests', SharedUsageRequestViewSet, basename='usage-request')

urlpatterns = [
    path('workbook/preview/', WorkbookPreviewView.as_view(), name='workbook-preview'),
    path('workbook/commit/', WorkbookCommitView.as_view(), name='workbook-commit'),
    path('workbook/template/', WorkbookTemplateView.as_view(), name='workbook-template'),
    path('', include(router.urls)),
]
