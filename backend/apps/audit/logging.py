import json
import logging


PAYLOAD_FIELDS = {
    "schema_version", "event_id", "occurred_at", "action", "outcome", "actor_id", "actor_uuid",
    "actor_role", "actor_is_admin", "actor_type", "actor_tenant_id", "target_tenant_id", "object_type",
    "object_id", "field_names", "request_id", "method", "route", "status_code", "reason_code", "peer_ip",
}
DELIVERY_CODES = {
    "audit_persistence_unavailable", "siem_configuration_error", "siem_transport_error",
    "siem_redirect_rejected", "siem_http_rejected", "siem_delivery_interrupted",
}


class AuditJSONFormatter(logging.Formatter):
    """Dedicated security output never interpolates messages, exceptions or extra keys."""

    def format(self, record):
        payload = getattr(record, "audit_event", None)
        if isinstance(payload, dict):
            data = {key: value for key, value in payload.items() if key in PAYLOAD_FIELDS}
        else:
            code = getattr(record, "audit_code", "")
            data = {"schema_version": 1, "event": "audit_delivery_status",
                    "code": code if code in DELIVERY_CODES else "audit_status", "level": record.levelname}
        return json.dumps(data, ensure_ascii=True, separators=(",", ":"), default=str)
