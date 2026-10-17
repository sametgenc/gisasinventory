#!/usr/bin/env bash
# Exercise only disposable containers, without a database, mounts or network.
set -euo pipefail

check_image="${1:?Usage: check-production-backend.sh IMAGE}"

if docker run --rm --network none \
    -e DJANGO_DEBUG=True -e TURNSTILE_ENABLED=false \
    "$check_image" /bin/true; then
    printf '%s\n' 'Unsafe DEBUG settings were accepted by the production entrypoint.' >&2
    exit 1
fi

if docker run --rm --network none \
    -e DJANGO_DEBUG=False \
    -e DJANGO_SECRET_KEY=local-release-config-check-only-8b2c5a70d19f4860a1e42c7b65f9e3d4 \
    -e TURNSTILE_ENABLED=false \
    "$check_image" /bin/true; then
    printf '%s\n' 'Disabled CAPTCHA was accepted by the production entrypoint.' >&2
    exit 1
fi

docker run --rm --network none \
    -e DJANGO_DEBUG=False \
    -e DJANGO_SECRET_KEY=local-release-config-check-only-8b2c5a70d19f4860a1e42c7b65f9e3d4 \
    -e DOMAIN=release-check.example.test \
    -e TURNSTILE_ENABLED=true \
    -e TURNSTILE_SITE_KEY=fictional-local-check-site \
    -e TURNSTILE_SECRET_KEY=fictional-local-check-secret \
    -e TURNSTILE_ALLOWED_HOSTNAMES=release-check.example.test \
    "$check_image" /bin/true

printf '%s\n' 'Production startup checks passed: DEBUG and disabled CAPTCHA rejected; valid local test configuration accepted.'
