import json
from urllib.parse import urlsplit

from django.conf import settings
import requests


class SiemTransportError(RuntimeError):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def siem_configuration():
    url = getattr(settings, "AUDIT_SIEM_URL", "")
    token = getattr(settings, "AUDIT_SIEM_TOKEN", "")
    try:
        parsed = urlsplit(url)
        valid_port = parsed.port is None or 1 <= parsed.port <= 65535
        timeout = float(getattr(settings, "AUDIT_SIEM_TIMEOUT", 5))
    except (ValueError, TypeError):
        raise SiemTransportError("siem_configuration_error") from None
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
            or parsed.query or parsed.fragment or not valid_port or not 0 < timeout <= 30
            or not isinstance(token, str) or not token.strip() or len(token) > 8192
            or any(ord(char) < 32 for char in token)):
        raise SiemTransportError("siem_configuration_error")
    return url, token, timeout


def send_event(event):
    """Generic JSON collector; collector deduplicates the immutable event UUID."""
    url, token, timeout = siem_configuration()
    try:
        with requests.Session() as session:
            # Environment proxies/netrc must never receive the collector's credential.
            session.trust_env = False
            response = session.post(
                url, data=json.dumps(event.payload(), separators=(",", ":")),
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}",
                         "Idempotency-Key": str(event.pk)},
                timeout=(min(3.0, timeout), timeout), allow_redirects=False, verify=True, stream=True,
            )
            try:
                if 300 <= response.status_code < 400:
                    raise SiemTransportError("siem_redirect_rejected")
                if not 200 <= response.status_code < 300:
                    # Response bodies can echo credentials or business data. Do not read/log them.
                    raise SiemTransportError("siem_http_rejected")
            finally:
                response.close()
    except requests.RequestException:
        raise SiemTransportError("siem_transport_error") from None
