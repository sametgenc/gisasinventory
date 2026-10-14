"""Transactional discussion events and generic, scope-bound notifications."""

from django.db import DatabaseError, transaction
from rest_framework.exceptions import APIException, NotFound, PermissionDenied
from rest_framework.generics import get_object_or_404

from apps.notifications.services import create_notification
from apps.tenants.permissions import is_global_admin
from apps.user.models import User

from .models import PlatformFeedback, PlatformFeedbackEvent
from .permissions import can_read_feedback, can_use_feedback


class FeedbackConflict(APIException):
    status_code = 409
    default_detail = 'Hesap bilgileri güncelleniyor. Yeniden deneyin.'


def lock_actor(user):
    actor = User.objects.select_for_update(of=('self',), no_key=True).select_related('tenant').get(pk=user.pk)
    if not can_use_feedback(actor):
        raise PermissionDenied('Aktif hesabınız ve tersane üyeliğiniz gerekir.')
    return actor


def lock_feedback(user, feedback_id, *, manage=False):
    actor = lock_actor(user)
    if manage and not is_global_admin(actor):
        raise PermissionDenied('Yalnız platform yöneticisi bu değişikliği yapabilir.')
    queryset = PlatformFeedback.objects.select_for_update()
    if not is_global_admin(actor):
        queryset = queryset.filter(submitted_by=actor, tenant_id=actor.tenant_id)
    feedback = get_object_or_404(queryset, pk=feedback_id)
    if not can_read_feedback(actor, feedback):
        raise NotFound()
    return actor, feedback


def lock_assignee(user):
    if user is None:
        return None
    try:
        with transaction.atomic():
            assignee = User.objects.select_for_update(nowait=True, no_key=True).get(pk=user.pk)
    except User.DoesNotExist as exc:
        raise FeedbackConflict() from exc
    except DatabaseError as exc:
        if getattr(exc.__cause__, 'pgcode', None) == '55P03':
            raise FeedbackConflict() from exc
        raise
    if not is_global_admin(assignee):
        raise PermissionDenied('Sorumlu aktif bir platform yöneticisi olmalıdır.')
    return assignee


def record_event(feedback, actor, kind, *, body='', before=None, after=None):
    return PlatformFeedbackEvent.objects.create(
        feedback=feedback, created_by=actor, kind=kind, body=body, before=before, after=after,
    )


def _notify_user(user, feedback, event, *, admin=False):
    english = user.preferred_language == 'en'
    title = 'Development request updated' if english else 'Geliştirme talebi güncellendi'
    message = ('Open your request to review its current status and replies.' if english else
               'Güncel durumu ve yanıtları görmek için talebi açın.')
    if event.kind == 'created':
        title = 'New development request' if english else 'Yeni geliştirme talebi'
        message = ('A user submitted a request. Open the development requests page to review it.' if english else
                   'Yeni bir talep gönderildi. İncelemek için geliştirme taleplerini açın.')
    content = {
        'title': title, 'message': message, 'type': 'info', 'event_type': 'platform_feedback',
        'url': f'/development-requests?request={feedback.pk}', 'feedback_id': str(feedback.pk),
        'audience_tenant_id': str(user.tenant_id),
    }
    if admin:
        content['audience_global_admin'] = True
    create_notification(user, content, event_key=f'feedback:{event.pk}')


def notify_feedback_event(feedback, event):
    """No subjects, names, proposal text, or attachment names enter email bodies."""
    recipients = {}
    if event.kind in {'created', 'message', 'assignment'}:
        for admin in User.objects.filter(is_active=True, is_superuser=True, tenant_id=None):
            if admin.pk != event.created_by_id:
                recipients[admin.pk] = (admin, True)
    author = User.objects.select_related('tenant').filter(pk=feedback.submitted_by_id).first()
    if (author and can_read_feedback(author, feedback) and author.pk != event.created_by_id
            and event.kind != 'created'):
        recipients[author.pk] = (author, is_global_admin(author))
    for recipient, is_admin in recipients.values():
        _notify_user(recipient, feedback, event, admin=is_admin)


def apply_management(feedback, actor, values, *, note=''):
    events = []
    for field, kind in [('status', 'status'), ('priority', 'priority'), ('assigned_to', 'assignment')]:
        if field not in values:
            continue
        value = values[field]
        if field == 'assigned_to':
            value = lock_assignee(value)
            before = feedback.assigned_to_id
            after = value.pk if value else None
        else:
            before = getattr(feedback, field)
            after = value
        if before != after:
            setattr(feedback, field, value)
            events.append(record_event(feedback, actor, kind, before=before, after=after))
    ordinary_fields = ['type', 'subject', 'description', 'proposed_solution', 'expected_benefit',
                       'area', 'page_url', 'user_agent']
    for field in ordinary_fields:
        if field in values:
            setattr(feedback, field, values[field])
    if events or note or any(field in values for field in ordinary_fields):
        feedback.save()
    if note:
        events.append(record_event(feedback, actor, 'message', body=note))
    if events:
        # One summary per submission, even if status, assignment and priority changed together.
        event = next((item for item in reversed(events) if item.kind in {'message', 'assignment'}), events[0])
        notify_feedback_event(feedback, event)
    return feedback
