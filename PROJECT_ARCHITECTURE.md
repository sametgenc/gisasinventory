# LearnWithAI - Project Architecture

## High-Level Architecture

```mermaid
graph TB
    subgraph Client
        Browser[Browser]
    end

    subgraph "Reverse Proxy"
        Traefik[Traefik :80/:443]
    end

    subgraph "Frontend Container"
        Vite[Vite Dev Server :5173]
        React[React 19 App]
    end

    subgraph "Backend Containers"
        Django[Django/Uvicorn :8000]
        CeleryWorker[Celery Worker]
        CeleryBeat[Celery Beat]
    end

    subgraph "Static Files"
        Nginx[Nginx :80]
    end

    subgraph "Data Layer"
        PostgreSQL[(PostgreSQL)]
        Redis[(Redis)]
    end

    subgraph "Dev Tools"
        Mailpit[Mailpit :8025]
    end

    Browser --> Traefik
    Traefik -->|"/ (frontend)"| Vite
    Traefik -->|"/api, /admin, /_allauth"| Django
    Traefik -->|"/static, /media"| Nginx
    Traefik -->|"mail.domain"| Mailpit

    Django --> PostgreSQL
    Django --> Redis
    CeleryWorker --> Redis
    CeleryWorker --> PostgreSQL
    CeleryBeat --> Redis
    Vite --> React
```

---

## Directory Structure

```
learnwithai/
├── .envs/                          # Environment variables
│   ├── .env.local                  # Django local settings (DOMAIN, DB, etc.)
│   ├── .env.postgres               # PostgreSQL credentials
│   └── .env.traefik                # Traefik domain configuration
├── backend/                        # Django Backend
│   ├── apps/                       # Django applications
│   │   ├── user/                   # Custom User model + allauth adapters
│   │   └── notifications/          # Real-time notifications (SSE)
│   ├── config/                     # Django project config
│   │   ├── settings.py             # Main settings
│   │   ├── urls.py                 # URL routing
│   │   ├── celery.py               # Celery configuration
│   │   └── asgi.py                 # ASGI entrypoint (Uvicorn)
│   ├── resources/compose/          # Docker build files
│   └── pyproject.toml              # Python dependencies (uv)
├── frontend/                       # React Frontend
│   ├── src/
│   │   ├── api/                    # Axios client
│   │   ├── auth/                   # Auth context
│   │   ├── components/             # Reusable UI components
│   │   ├── modules/                # Feature modules (allauth, notifications)
│   │   └── routes/                 # TanStack Router pages
│   ├── compose/                    # Docker build files
│   ├── package.json                # NPM dependencies
│   └── vite.config.ts              # Vite configuration
├── traefik/                        # Reverse Proxy
│   ├── certs/                      # SSL certificates (mkcert)
│   └── compose/local/              # Traefik config files
└── docker-compose.yml              # Main orchestration
```

---

## Technology Stack

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| **Python** | 3.13+ | Runtime |
| **Django** | 5.0+ | Web framework |
| **django-allauth** | 65.13+ | Authentication (headless, MFA, WebAuthn) |
| **Django REST Framework** | 3.14+ | API endpoints |
| **Celery** | 5.4+ | Background task processing |
| **django-celery-beat** | 2.7+ | Periodic task scheduling |
| **Uvicorn** | 0.30+ | ASGI server (async support) |
| **PostgreSQL** | Latest | Primary database |
| **Redis** | 7.1+ | Cache, message broker, SSE pubsub |
| **uv** | Latest | Python package manager |

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| **React** | 19.2 | UI library |
| **TypeScript** | 5.9 | Type safety |
| **Vite** | 7.2 | Build tool & dev server |
| **TanStack Router** | 1.99 | File-based routing |
| **TanStack Query** | 5.64 | Server state management |
| **TailwindCSS** | 4.1 | Utility-first CSS |
| **Axios** | 1.7 | HTTP client |
| **Lucide React** | 0.471 | Icon library |
| **pnpm** | Latest | Package manager |

### Infrastructure

| Technology | Purpose |
|------------|---------|
| **Docker Compose** | Container orchestration |
| **Traefik** | Reverse proxy, TLS termination, routing |
| **Nginx** | Static file serving |
| **Mailpit** | Email testing (dev only) |
| **mkcert** | Local SSL certificate generation |

---

## Services (docker-compose.yml)

| Service | Container | Port | Description |
|---------|-----------|------|-------------|
| `traefik` | traefik_container | 80, 443, 8080 | Reverse proxy |
| `web` | django_container | 8000 (internal) | Django API |
| `frontend` | frontend_container | 5173 (internal) | Vite dev server |
| `celeryworker` | celery_worker_container | - | Background tasks |
| `celerybeat` | celery_beat_container | - | Scheduled tasks |
| `postgres` | postgres_container | 5432 (internal) | Database |
| `redis` | redis_container | 6379 (internal) | Cache/Broker |
| `nginx` | nginx_container | 80 (internal) | Static files |
| `mailpit` | mailpit_container | 8025, 1025 (internal) | Email testing |

---

## Authentication Flow

```mermaid
sequenceDiagram
    participant Browser
    participant Frontend
    participant Traefik
    participant Django
    participant allauth

    Browser->>Frontend: Visit /login
    Frontend->>Traefik: POST /_allauth/browser/v1/auth/login
    Traefik->>Django: Forward request
    Django->>allauth: Authenticate
    allauth-->>Django: Session + CSRF
    Django-->>Browser: Set-Cookie (session, csrf)
    Browser->>Frontend: Redirect to /dashboard
```

### Authentication Features
- **Email/Password Login** with email verification
- **Login by Code** (passwordless)
- **MFA Support**: TOTP, Recovery Codes, WebAuthn/Passkeys
- **Social Login**: Google OAuth2
- **Session Management** with user sessions tracking

---

## Real-Time Notifications

Uses **Server-Sent Events (SSE)** via Redis Pub/Sub:

```mermaid
sequenceDiagram
    participant Browser
    participant Django
    participant Redis
    participant Celery

    Browser->>Django: GET /api/notifications/stream/
    Django->>Redis: SUBSCRIBE user_notifications_{uuid}
    
    Celery->>Redis: PUBLISH notification
    Redis-->>Django: Message received
    Django-->>Browser: SSE data: {...}
```

---

## Environment Variables

### `.env.traefik`
```properties
DOMAIN=gisasassets.co
```

### `.env.local`
```properties
DATABASE_URL=postgres://user:password@postgres:5432/myproject
DJANGO_SECRET_KEY=...
DJANGO_DEBUG=True
DOMAIN=gisasassets.co
EMAIL_HOST=mailpit
REDIS_URL=redis://redis:6379/0
```

---

## Quick Commands

```bash
# Start all services
docker compose -f docker-compose.yml up -d

# View logs
docker compose -f docker-compose.yml logs -f web

# Django shell
docker compose -f docker-compose.yml exec web python manage.py shell

# Run migrations
docker compose -f docker-compose.yml exec web python manage.py migrate

# Restart a specific service
docker compose -f docker-compose.yml restart frontend

# Generate SSL certs
mkcert -cert-file ./traefik/certs/local-cert.pem \
       -key-file ./traefik/certs/local-key.pem \
       gisasassets.co "*.gisasassets.co" localhost
```

---

## API Endpoints

### Authentication (`/_allauth/browser/v1/`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/login` | Email/password login |
| POST | `/auth/logout` | Logout |
| POST | `/auth/signup` | Register new user |
| GET | `/auth/session` | Get current session |

### Notifications (`/api/notifications/`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List notifications |
| GET | `/stream/` | SSE stream |
| POST | `/{id}/mark_as_read/` | Mark as read |
| POST | `/mark_all_as_read/` | Mark all as read |
| POST | `/clear_all/` | Clear all |
| GET | `/unread_count/` | Get unread count |

---

## Project Plan

> **Platform**: GİSAŞ Multi-Tenant Asset Platform  
> **Target Users**: Shipyard workers, dockyard personnel  
> **Domain**: `gisasassets.co`

### Related Documents

| Document | Description |
|----------|-------------|
| [Product Requirements](./PRODUCT_REQUIREMENTS.md) | Full PRD with data models, API specs, i18n strategy |
| [Implementation Tasks](./IMPLEMENTATION_TASKS.md) | Phase-by-phase task breakdown |

### Current Phase
**Phase 1: Multi-Tenancy Foundation** - Not started

### Quick Stats
- **Estimated Total**: 20-29 days
- **Phases**: 9 phases
- **Languages**: Turkish (primary), English
