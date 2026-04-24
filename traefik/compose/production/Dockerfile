FROM traefik:v3.6.6

RUN apk add --no-cache gettext

COPY compose/production/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
