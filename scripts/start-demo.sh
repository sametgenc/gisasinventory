#!/usr/bin/env bash
# Starts an isolated, loopback-only demo. No production database or email service.
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="$PROJECT_DIR/backend/.venv/bin/python"
DEMO_DIR="$PROJECT_DIR/var/demo"

if [[ ! -x "$PYTHON_BIN" || ! -f "$PROJECT_DIR/frontend/node_modules/vite/bin/vite.js" ]]; then
  printf '%s\n' 'Demo bağımlılıkları eksik. docs/TEST_ORTAMI.md içindeki kurulum adımlarını uygulayın.' >&2
  exit 1
fi

NODE_BIN="${DEMO_NODE_BIN:-$(command -v node || true)}"
node_is_supported() {
  [[ -n "$1" && -x "$1" ]] && "$1" -e 'const [major,minor]=process.versions.node.split(".").map(Number);process.exit(major>22||(major===22&&minor>=12)?0:1)'
}
if ! node_is_supported "$NODE_BIN"; then
  for candidate in "$HOME/.nvm/versions/node/v22.22.2/bin/node" "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"; do
    if node_is_supported "$candidate"; then
      NODE_BIN="$candidate"
      break
    fi
  done
fi
if ! node_is_supported "$NODE_BIN"; then
  printf '%s\n' 'Node.js 22.12 veya üzeri gerekli. DEMO_NODE_BIN ile uygun Node yolunu seçebilirsiniz.' >&2
  exit 1
fi

# Fail before seeding if either fixed demo port is already occupied.
"$PYTHON_BIN" -c 'import socket
for port in (8011,5190):
    with socket.socket() as probe:
        probe.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
        try: probe.bind(("127.0.0.1",port))
        except OSError: raise SystemExit(f"Demo portu {port} kullanımda. Önce mevcut demo oturumunu durdurun.")'

mkdir -p "$DEMO_DIR"
cd "$PROJECT_DIR/backend"
"$PYTHON_BIN" manage.py migrate --settings=config.demo_settings --noinput
"$PYTHON_BIN" manage.py seed_demo --settings=config.demo_settings --write-samples --model-count-demo

BACKEND_PID=""
FRONTEND_PID=""
cleanup() {
  trap - EXIT INT TERM
  if [[ -n "$FRONTEND_PID" ]]; then kill "$FRONTEND_PID" 2>/dev/null || true; fi
  if [[ -n "$BACKEND_PID" ]]; then kill "$BACKEND_PID" 2>/dev/null || true; fi
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

"$PYTHON_BIN" manage.py runserver 127.0.0.1:8011 --settings=config.demo_settings --noreload > "$DEMO_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
cd "$PROJECT_DIR/frontend"
env -u DOMAIN DEMO_API_TARGET=http://127.0.0.1:8011 VITE_API_BASE_URL= VITE_DEMO_MODE=true "$NODE_BIN" node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5190 > "$DEMO_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!

"$PYTHON_BIN" -c 'import time,urllib.request
for address in ("http://127.0.0.1:8011/demo/health/","http://127.0.0.1:5190"):
    for attempt in range(60):
        try:
            with urllib.request.urlopen(address,timeout=1) as response:
                if response.status==200: break
        except OSError: time.sleep(0.5)
    else: raise SystemExit("Demo başlatılamadı. var/demo içindeki günlükleri kontrol edin.")'

printf '\n%s\n' 'GİSAŞ demo hazır: http://127.0.0.1:5190' 'Kullanım rehberi: http://127.0.0.1:5190/help'
printf '%s\n' 'Hesaplar: admin@demo.gisas.test / yonetici@demo.gisas.test / personel@demo.gisas.test / diger@demo.gisas.test'
printf 'İlk oluşturulan hesapların demo parolası: %s\n' "${DEMO_PASSWORD:-GisasDemo!2026}"
printf '%s\n' 'Bu parola yalnız kurmaca yerel demo hesapları içindir. Yeniden başlatma mevcut parolaları değiştirmez.' 'Durdurmak için Ctrl+C. Veriler var/demo altında korunur.'

while kill -0 "$BACKEND_PID" 2>/dev/null && kill -0 "$FRONTEND_PID" 2>/dev/null; do
  sleep 2
done
printf '%s\n' 'Demo sunucularından biri durdu. var/demo günlüklerini kontrol edin.' >&2
exit 1
