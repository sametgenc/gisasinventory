from django.apps import apps
from django.contrib.admin.models import ADDITION, CHANGE, DELETION, LogEntry
from django.contrib.auth.signals import user_logged_in, user_logged_out, user_login_failed
from django.db.models.signals import m2m_changed, post_save, pre_delete, pre_save

from .services import record_event

AUDITED_MODELS = (
    "user.User", "tenants.Tenant", "assets.Asset", "assets.AssetType", "assets.SharedUsageRequest", "settings.SmtpSettings",
    "platform_feedback.PlatformFeedback", "platform_feedback.PlatformFeedbackAttachment",
    "account.EmailAddress", "mfa.Authenticator", "auth.Group",
)


def target_tenant(instance):
    if instance._meta.label_lower == "tenants.tenant":
        return instance.pk
    return getattr(instance, "tenant_id", getattr(instance, "owner_tenant_id", None))


def before_save(sender, instance, raw=False, using="default", update_fields=None, **kwargs):
    if raw:
        return
    fields = [field for field in sender._meta.concrete_fields if not field.primary_key]
    if update_fields is not None:
        fields = [field for field in fields if field.name in update_fields or field.attname in update_fields]
    old = sender._base_manager.using(using).filter(pk=instance.pk).values(*[field.attname for field in fields]).first() if instance.pk else None
    changed = [field.name for field in fields if old is None or old[field.attname] != getattr(instance, field.attname)]
    instance._audit_field_names = changed
    instance._audit_action = "model.create" if old is None else "model.update"
    record_event(instance._audit_action, outcome="attempted", object_type=sender._meta.label_lower,
                 object_id=instance.pk, target_tenant_id=target_tenant(instance), field_names=changed)


def after_save(sender, instance, created, raw=False, **kwargs):
    if raw:
        return
    record_event("model.create" if created else "model.update", object_type=sender._meta.label_lower,
                 object_id=instance.pk, target_tenant_id=target_tenant(instance),
                 field_names=getattr(instance, "_audit_field_names", ()))


def before_delete(sender, instance, **kwargs):
    record_event("model.delete", object_type=sender._meta.label_lower, object_id=instance.pk,
                 target_tenant_id=target_tenant(instance))


def membership_changed(sender, instance, action, **kwargs):
    if action.startswith(("pre_", "post_")):
        field = "groups" if sender == apps.get_model("user", "User").groups.through else "user_permissions"
        record_event("model.membership", outcome="attempted" if action.startswith("pre_") else "success",
                     object_type=instance._meta.label_lower, object_id=instance.pk,
                     target_tenant_id=target_tenant(instance), field_names=[field])


def login(sender, request, user, **kwargs):
    record_event("auth.login", request=request, actor=user, object_type="user.user", object_id=user.pk)


def logout(sender, request, user, **kwargs):
    record_event("auth.logout", request=request, actor=user, object_type="user.user", object_id=getattr(user, "pk", None))


def login_failed(sender, request=None, **kwargs):
    # Signal credentials may contain passwords, tokens, email and usernames. Never inspect them.
    record_event("auth.login_failed", request=request, outcome="denied")


def admin_action(sender, instance, created, **kwargs):
    if not created:
        return
    action = {ADDITION: "admin.add", CHANGE: "admin.change", DELETION: "admin.delete"}.get(instance.action_flag)
    if action:
        content_type = instance.content_type
        label = f"{content_type.app_label}.{content_type.model}" if content_type else ""
        record_event(action, actor=instance.user, object_type=label, object_id=instance.object_id)


def install_signals():
    for label in AUDITED_MODELS:
        model = apps.get_model(label)
        for signal, receiver, suffix in ((pre_save, before_save, "before_save"), (post_save, after_save, "after_save"),
                                         (pre_delete, before_delete, "before_delete")):
            signal.connect(receiver, sender=model, weak=False, dispatch_uid=f"security.audit.{label}.{suffix}")
    user = apps.get_model("user", "User")
    for field in (user.groups, user.user_permissions):
        m2m_changed.connect(membership_changed, sender=field.through, weak=False,
                            dispatch_uid=f"security.audit.{field.through._meta.label_lower}")
    for signal, receiver in ((user_logged_in, login), (user_logged_out, logout), (user_login_failed, login_failed)):
        signal.connect(receiver, weak=False, dispatch_uid=f"security.audit.{receiver.__name__}")
    post_save.connect(admin_action, sender=LogEntry, weak=False, dispatch_uid="security.audit.admin_action")
