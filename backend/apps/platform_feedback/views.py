"""Private requests for authors; triage and assignment for global administrators."""

from collections.abc import Mapping

from django.db import transaction
from django.db.models import Prefetch, Q
from django.http import FileResponse, Http404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.generics import get_object_or_404
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.tenants.permissions import is_global_admin
from apps.user.models import User

from .models import PlatformFeedback, PlatformFeedbackAttachment, PlatformFeedbackEvent
from .permissions import IsFeedbackParticipant
from .serializers import FeedbackMessageSerializer, FeedbackTriageSerializer, PlatformFeedbackSerializer
from .services import apply_management, lock_actor, lock_feedback, notify_feedback_event, record_event
from .uploads import validate_uploads
from .throttles import FeedbackBurstThrottle, FeedbackSustainedThrottle


class FeedbackPagination(PageNumberPagination):
    page_size = 24


class PlatformFeedbackViewSet(viewsets.ModelViewSet):
    serializer_class = PlatformFeedbackSerializer
    permission_classes = [IsFeedbackParticipant]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    pagination_class = FeedbackPagination
    lookup_field = 'id'

    def get_throttles(self):
        if self.action in {'create', 'messages', 'triage', 'update', 'partial_update'}:
            return [FeedbackBurstThrottle(), FeedbackSustainedThrottle()]
        return []

    def get_queryset(self):
        queryset = PlatformFeedback.objects.select_related('submitted_by', 'assigned_to', 'tenant').prefetch_related(
            'attachments', Prefetch('history', queryset=PlatformFeedbackEvent.objects.select_related('created_by')),
        )
        user = self.request.user
        if not is_global_admin(user):
            queryset = queryset.filter(submitted_by=user, tenant_id=user.tenant_id)
        # Filters affect only collections, never authorization or action lookups.
        if self.action != 'list':
            return queryset
        filters = {
            'type': PlatformFeedback.TYPE_CHOICES, 'status': PlatformFeedback.STATUS_CHOICES,
            'area': PlatformFeedback.AREA_CHOICES, 'priority': PlatformFeedback.PRIORITY_CHOICES,
        }
        for field, choices in filters.items():
            value = self.request.query_params.get(field, '')
            if value:
                if value not in dict(choices):
                    raise ValidationError({field: 'Geçerli bir seçenek seçin.'})
                queryset = queryset.filter(**{field: value})
        assignee = self.request.query_params.get('assigned_to', '')
        if assignee:
            if assignee == 'unassigned':
                queryset = queryset.filter(assigned_to__isnull=True)
            elif assignee.isascii() and assignee.isdecimal() and len(assignee) <= 19:
                assignee_id = int(assignee)
                if not 0 < assignee_id <= 9223372036854775807:
                    raise ValidationError({'assigned_to': 'Geçerli bir sorumlu seçin.'})
                queryset = queryset.filter(assigned_to_id=assignee_id)
            else:
                raise ValidationError({'assigned_to': 'Geçerli bir sorumlu seçin.'})
        search = self.request.query_params.get('search', '').strip()
        if len(search) > 200:
            raise ValidationError({'search': 'Arama en fazla 200 karakter olabilir.'})
        if search:
            queryset = queryset.filter(Q(subject__icontains=search) | Q(description__icontains=search)
                                       | Q(proposed_solution__icontains=search) | Q(expected_benefit__icontains=search))
        return queryset

    def _data(self, request):
        if not isinstance(request.data, Mapping):
            raise ValidationError({'detail': 'Alanları içeren bir nesne gönderin.'})
        return request.data

    def _require_admin(self):
        if not is_global_admin(self.request.user):
            raise PermissionDenied('Yalnız platform yöneticisi bu değişikliği yapabilir.')

    @action(detail=False, methods=['get'])
    def management_options(self, request):
        self._require_admin()
        admins = User.objects.filter(is_active=True, is_superuser=True, tenant_id=None).order_by('email', 'pk')
        return Response({
            'assignees': [{'id': user.pk, 'email': user.email, 'name': user.get_full_name() or user.email or user.username}
                          for user in admins],
            'statuses': [{'value': value, 'label': label} for value, label in PlatformFeedback.STATUS_CHOICES],
            'priorities': [{'value': value, 'label': label} for value, label in PlatformFeedback.PRIORITY_CHOICES],
        })

    @action(detail=True, methods=['get'], url_path=r'attachments/(?P<attachment_id>[^/.]+)/download')
    def download_attachment(self, request, id=None, attachment_id=None):
        feedback = self.get_object()
        attachment = get_object_or_404(feedback.attachments.all(), pk=attachment_id)
        try:
            stream = attachment.file.open('rb')
        except FileNotFoundError as exc:
            raise Http404('Attachment file not found.') from exc
        response = FileResponse(stream, as_attachment=True, filename=attachment.original_name,
                                content_type='application/octet-stream')
        response['Cache-Control'] = 'private, no-store'
        response['X-Content-Type-Options'] = 'nosniff'
        return response

    def create(self, request, *args, **kwargs):
        incoming = self._data(request)
        forbidden = {'status', 'priority', 'assigned_to', 'tenant', 'submitted_by'} & set(incoming)
        if forbidden:
            raise ValidationError({field: 'Bu alan kayıt sırasında değiştirilemez.' for field in forbidden})
        files = validate_uploads(request.FILES.getlist('files'))
        fields = ['type', 'subject', 'description', 'proposed_solution', 'expected_benefit', 'area', 'page_url', 'user_agent']
        data = {field: incoming[field] for field in fields if field in incoming}
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        stored_files = []
        try:
            with transaction.atomic():
                actor = lock_actor(request.user)
                feedback = serializer.save(submitted_by=actor, tenant_id=actor.tenant_id)
                for upload, original_name, content_type in files:
                    attachment = PlatformFeedbackAttachment(
                        feedback=feedback, original_name=original_name, size=upload.size, content_type=content_type,
                    )
                    attachment.file.save(original_name, upload, save=False)
                    stored_files.append((attachment.file.storage, attachment.file.name))
                    attachment.save()
                event = record_event(feedback, actor, 'created')
                notify_feedback_event(feedback, event)
        except Exception:
            for storage, name in stored_files:
                storage.delete(name)
            raise
        return Response(self.get_serializer(feedback).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        self._require_admin()
        incoming = self._data(request)
        note = incoming.get('note', '')
        note_serializer = FeedbackTriageSerializer(data={'note': note})
        note_serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            actor, feedback = lock_feedback(request.user, kwargs['id'], manage=True)
            serializer = self.get_serializer(feedback, data=incoming, partial=kwargs.get('partial', False))
            serializer.is_valid(raise_exception=True)
            feedback = apply_management(feedback, actor, serializer.validated_data, note=note_serializer.validated_data.get('note', ''))
        return Response(self.get_serializer(feedback).data)

    def destroy(self, request, *args, **kwargs):
        self._require_admin()
        with transaction.atomic():
            _, feedback = lock_feedback(request.user, kwargs['id'], manage=True)
            stored_files = [(attachment.file.storage, attachment.file.name) for attachment in feedback.attachments.all()]
            feedback.delete()
            for storage, name in stored_files:
                transaction.on_commit(lambda storage=storage, name=name: storage.delete(name))
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'])
    def triage(self, request, id=None):
        self._require_admin()
        serializer = FeedbackTriageSerializer(data=self._data(request))
        serializer.is_valid(raise_exception=True)
        values = dict(serializer.validated_data)
        note = values.pop('note', '')
        with transaction.atomic():
            actor, feedback = lock_feedback(request.user, id, manage=True)
            feedback = apply_management(feedback, actor, values, note=note)
        return Response(self.get_serializer(feedback).data)

    @action(detail=True, methods=['post'])
    def messages(self, request, id=None):
        serializer = FeedbackMessageSerializer(data=self._data(request))
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            actor, feedback = lock_feedback(request.user, id)
            event = record_event(feedback, actor, 'message', body=serializer.validated_data['body'])
            feedback.save(update_fields=['updated_at'])
            notify_feedback_event(feedback, event)
        return Response(self.get_serializer(feedback).data)
