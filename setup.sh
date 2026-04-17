#!/usr/bin/env bash
set -euo pipefail

# ============================================================
#  LearnWithAI / GisasInventory - Setup Script
#  Usage:
#    ./setup.sh          # interactive (asks local or prod)
#    ./setup.sh --local  # local development setup
#    ./setup.sh --prod   # production server setup
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ----------------------------------------------------------
#  Determine mode
# ----------------------------------------------------------
MODE=""
if [[ "${1:-}" == "--local" ]]; then
    MODE="local"
elif [[ "${1:-}" == "--prod" ]]; then
    MODE="prod"
fi

if [[ -z "$MODE" ]]; then
    echo ""
    echo "=========================================="
    echo "  LearnWithAI - Setup"
    echo "=========================================="
    echo ""
    echo "  1) Local Development"
    echo "  2) Production Server"
    echo ""
    read -rp "Select mode [1/2]: " mode_choice
    case "$mode_choice" in
        1) MODE="local" ;;
        2) MODE="prod" ;;
        *) error "Invalid choice. Use 1 or 2." ;;
    esac
fi

info "Mode: $MODE"
echo ""

# ----------------------------------------------------------
#  Check prerequisites
# ----------------------------------------------------------
check_command() {
    if ! command -v "$1" &>/dev/null; then
        error "'$1' is not installed. $2"
    fi
    ok "$1 found: $(command -v "$1")"
}

info "Checking prerequisites..."
check_command "docker" "Install Docker: https://docs.docker.com/engine/install/"
check_command "openssl" "Install openssl: sudo apt install openssl"

if ! docker compose version &>/dev/null; then
    error "'docker compose' (v2) is not available. Install Docker Compose v2 plugin."
fi
ok "docker compose v2 found"

if [[ "$MODE" == "local" ]]; then
    if command -v mkcert &>/dev/null; then
        ok "mkcert found (will use for local SSL)"
        HAS_MKCERT=true
    else
        warn "mkcert not found. Will generate self-signed certificate with openssl."
        HAS_MKCERT=false
    fi
fi

echo ""

# ----------------------------------------------------------
#  Collect configuration
# ----------------------------------------------------------
info "Enter configuration values (press Enter for defaults):"
echo ""

read -rp "Domain [localhost]: " DOMAIN
DOMAIN="${DOMAIN:-localhost}"

read -rp "PostgreSQL database name [learnwithai]: " DB_NAME
DB_NAME="${DB_NAME:-learnwithai}"

read -rp "PostgreSQL user [learnwithai_user]: " DB_USER
DB_USER="${DB_USER:-learnwithai_user}"

read -rp "PostgreSQL password [auto-generate]: " DB_PASSWORD
if [[ -z "$DB_PASSWORD" ]]; then
    DB_PASSWORD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
    info "Generated DB password: $DB_PASSWORD"
fi

DJANGO_SECRET_KEY=$(openssl rand -base64 50 | tr -dc 'a-zA-Z0-9' | head -c 50)
info "Generated Django secret key"

LETS_ENCRYPT_EMAIL=""
if [[ "$MODE" == "prod" ]]; then
    echo ""
    read -rp "Let's Encrypt email (for SSL certificates): " LETS_ENCRYPT_EMAIL
    while [[ -z "$LETS_ENCRYPT_EMAIL" ]]; do
        warn "Email is required for Let's Encrypt SSL."
        read -rp "Let's Encrypt email: " LETS_ENCRYPT_EMAIL
    done
fi

echo ""

# ----------------------------------------------------------
#  Create directories
# ----------------------------------------------------------
info "Creating directories..."
mkdir -p .envs
mkdir -p traefik/certs
mkdir -p traefik/acme
mkdir -p backend/resources/public/static
mkdir -p backend/resources/public/media

# ----------------------------------------------------------
#  Generate .envs/.env.postgres
# ----------------------------------------------------------
info "Writing .envs/.env.postgres..."
cat > .envs/.env.postgres <<EOF
POSTGRES_DB=${DB_NAME}
POSTGRES_USER=${DB_USER}
POSTGRES_PASSWORD=${DB_PASSWORD}
EOF
ok ".envs/.env.postgres created"

# ----------------------------------------------------------
#  Generate .envs/.env.traefik
# ----------------------------------------------------------
info "Writing .envs/.env.traefik..."
cat > .envs/.env.traefik <<EOF
DOMAIN=${DOMAIN}
LETS_ENCRYPT_EMAIL=${LETS_ENCRYPT_EMAIL}
EOF
ok ".envs/.env.traefik created"

# ----------------------------------------------------------
#  Generate .envs/.env.local
# ----------------------------------------------------------
info "Writing .envs/.env.local..."

if [[ "$MODE" == "local" ]]; then
    cat > .envs/.env.local <<EOF
DATABASE_URL=postgres://${DB_USER}:${DB_PASSWORD}@postgres:5432/${DB_NAME}
DJANGO_SECRET_KEY=${DJANGO_SECRET_KEY}
DJANGO_DEBUG=True
DOMAIN=${DOMAIN}

EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=mailpit
EMAIL_PORT=1025
EMAIL_USE_TLS=False
EMAIL_USE_SSL=False

REDIS_URL=redis://redis:6379/0
EOF
else
    cat > .envs/.env.local <<EOF
DATABASE_URL=postgres://${DB_USER}:${DB_PASSWORD}@postgres:5432/${DB_NAME}
DJANGO_SECRET_KEY=${DJANGO_SECRET_KEY}
DJANGO_DEBUG=False
DOMAIN=${DOMAIN}

EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_USE_SSL=False

REDIS_URL=redis://redis:6379/0
EOF
fi
ok ".envs/.env.local created"

# ----------------------------------------------------------
#  SSL Certificates (local mode only)
# ----------------------------------------------------------
if [[ "$MODE" == "local" ]]; then
    info "Generating SSL certificates for local development..."

    if [[ "$HAS_MKCERT" == true ]]; then
        mkcert -install 2>/dev/null || true
        mkcert \
            -cert-file ./traefik/certs/local-cert.pem \
            -key-file ./traefik/certs/local-key.pem \
            "$DOMAIN" "*.$DOMAIN" localhost 127.0.0.1
        ok "SSL certificates generated with mkcert"
    else
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout ./traefik/certs/local-key.pem \
            -out ./traefik/certs/local-cert.pem \
            -subj "/CN=${DOMAIN}" \
            -addext "subjectAltName=DNS:${DOMAIN},DNS:*.${DOMAIN},DNS:localhost,IP:127.0.0.1" \
            2>/dev/null
        ok "Self-signed SSL certificates generated with openssl"
    fi
fi

# ----------------------------------------------------------
#  ACME setup + Traefik prod config render (prod mode only)
# ----------------------------------------------------------
if [[ "$MODE" == "prod" ]]; then
    info "Setting up Let's Encrypt ACME storage..."
    rm -f ./traefik/acme/acme.json
    touch ./traefik/acme/acme.json
    chmod 600 ./traefik/acme/acme.json
    ok "traefik/acme/acme.json created with correct permissions"

    info "Injecting Let's Encrypt email into traefik/compose/production/traefik.yml..."
    ESCAPED_EMAIL=$(printf '%s\n' "$LETS_ENCRYPT_EMAIL" | sed -e 's/[\/&]/\\&/g')
    if grep -q "__LETS_ENCRYPT_EMAIL__" ./traefik/compose/production/traefik.yml; then
        sed -i.bak "s/__LETS_ENCRYPT_EMAIL__/${ESCAPED_EMAIL}/g" ./traefik/compose/production/traefik.yml
        rm -f ./traefik/compose/production/traefik.yml.bak
        ok "traefik.yml rendered with email: $LETS_ENCRYPT_EMAIL"
    else
        warn "Placeholder __LETS_ENCRYPT_EMAIL__ not found in traefik.yml; assuming it's already configured."
    fi
fi

# ----------------------------------------------------------
#  Done - print next steps
# ----------------------------------------------------------
echo ""
echo "=========================================="
echo -e "${GREEN}  Setup complete!${NC}"
echo "=========================================="
echo ""

if [[ "$MODE" == "local" ]]; then
    echo "  Next steps:"
    echo ""
    echo "  1. Add domain to /etc/hosts:"
    echo -e "     ${CYAN}echo '127.0.0.1 ${DOMAIN} mail.${DOMAIN}' | sudo tee -a /etc/hosts${NC}"
    echo ""
    echo "  2. Start the services:"
    echo -e "     ${CYAN}docker compose up -d --build${NC}"
    echo ""
    echo "  3. Wait for containers to be ready:"
    echo -e "     ${CYAN}docker compose ps${NC}"
    echo ""
    echo "  4. Access the application:"
    echo -e "     App:     ${CYAN}https://${DOMAIN}${NC}"
    echo -e "     API:     ${CYAN}https://${DOMAIN}/api/${NC}"
    echo -e "     Admin:   ${CYAN}https://${DOMAIN}/admin/${NC}"
    echo -e "     Mailpit: ${CYAN}https://mail.${DOMAIN}${NC}"
    echo ""
else
    echo "  Next steps:"
    echo ""
    echo "  1. Point your domain's DNS A record to this server's IP address."
    echo "     Go to your domain registrar and add:"
    echo -e "       ${CYAN}A record:  ${DOMAIN} -> YOUR_SERVER_IP${NC}"
    echo ""
    echo "     Verify propagation before continuing:"
    echo -e "       ${CYAN}dig +short ${DOMAIN}${NC}"
    echo ""
    echo "  2. Make sure ports 80 and 443 are open in your firewall:"
    echo -e "     ${CYAN}sudo ufw allow 80/tcp && sudo ufw allow 443/tcp${NC}"
    echo ""
    echo "  3. Start the services:"
    echo -e "     ${CYAN}docker compose -f docker-compose.prod.yml up -d --build${NC}"
    echo ""
    echo "  4. Traefik will automatically obtain SSL certificates from Let's Encrypt."
    echo "     Check Traefik logs:"
    echo -e "     ${CYAN}docker compose -f docker-compose.prod.yml logs -f traefik${NC}"
    echo ""
    echo "  5. Verify all services are running:"
    echo -e "     ${CYAN}docker compose -f docker-compose.prod.yml ps${NC}"
    echo ""
    echo "  6. Access the application:"
    echo -e "     App:   ${CYAN}https://${DOMAIN}${NC}"
    echo -e "     API:   ${CYAN}https://${DOMAIN}/api/${NC}"
    echo -e "     Admin: ${CYAN}https://${DOMAIN}/admin/${NC}"
    echo ""
fi
