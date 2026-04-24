#!/bin/sh
set -e

if [ -z "${LETS_ENCRYPT_EMAIL}" ]; then
  echo "ERROR: LETS_ENCRYPT_EMAIL env var is required" >&2
  exit 1
fi

mkdir -p /etc/traefik/generated
envsubst '${LETS_ENCRYPT_EMAIL}' < /etc/traefik/traefik.yml > /etc/traefik/generated/traefik.yml

if [ ! -f /etc/traefik/acme/acme.json ]; then
  mkdir -p /etc/traefik/acme
  touch /etc/traefik/acme/acme.json
fi
chmod 600 /etc/traefik/acme/acme.json

exec traefik --configfile=/etc/traefik/generated/traefik.yml "$@"
