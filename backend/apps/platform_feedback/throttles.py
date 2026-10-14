"""Shared per-account write budgets protect attachment storage and the mail outbox."""

import time

from django.conf import settings
from django.core.cache import cache
from django.core.exceptions import ImproperlyConfigured
from rest_framework.exceptions import APIException
from rest_framework.throttling import BaseThrottle, SimpleRateThrottle

from apps.tenants.permissions import is_global_admin


class FeedbackThrottleUnavailable(APIException):
    status_code = 503
    default_detail = 'Talep gönderimi geçici olarak kullanılamıyor. Yeniden deneyin.'
    default_code = 'feedback_throttle_unavailable'


class FeedbackWriteThrottle(BaseThrottle):
    """Use atomic cache counters, rather than a racy read/replace request history.

    Production Redis shares these budgets between processes. Fixed windows allow
    at most twice the burst allowance at a boundary; the hourly budget bounds
    repeated traffic. Denied attempts count toward the same account budget.
    """

    window = ''
    timer = staticmethod(time.time)
    defaults = {
        ('member', 'burst'): '6/minute', ('member', 'sustained'): '30/hour',
        ('admin', 'burst'): '60/minute', ('admin', 'sustained'): '300/hour',
    }

    def allow_request(self, request, view):
        user = request.user
        if not user.is_authenticated:
            return True  # The participant permission rejects anonymous accounts.
        policy = 'admin' if is_global_admin(user) else 'member'
        setting_name = f'FEEDBACK_{policy.upper()}_WRITE_{self.window.upper()}'
        rate = getattr(settings, setting_name, self.defaults[(policy, self.window)])
        try:
            limit, duration = SimpleRateThrottle.parse_rate(self, rate)
            if not limit or limit < 1 or not duration:
                raise ValueError('A positive write limit is required')
        except (ValueError, TypeError, AttributeError, IndexError, KeyError) as exc:
            raise ImproperlyConfigured(f'{setting_name} must be a positive DRF rate, such as 6/minute.') from exc
        now = self.timer()
        bucket = int(now // duration)
        key = f'feedback-write:{policy}:{self.window}:{user.pk}:{bucket}'
        self.wait_seconds = max(1.0, (bucket + 1) * duration - now)
        try:
            cache.add(key, 0, timeout=duration + 1)
            count = cache.incr(key)
        except Exception as exc:
            # Cache outages cannot allow unbounded storage writes or mail enqueueing.
            raise FeedbackThrottleUnavailable() from exc
        return count <= limit

    def wait(self):
        return self.wait_seconds


class FeedbackBurstThrottle(FeedbackWriteThrottle):
    window = 'burst'


class FeedbackSustainedThrottle(FeedbackWriteThrottle):
    window = 'sustained'
