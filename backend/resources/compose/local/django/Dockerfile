# Use Python 3.12 (Bookworm is the current stable Debian release)
FROM python:3.12-slim-bookworm

# 1. Set Environment Variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    # Configure uv to use the volume we defined in docker-compose
    UV_CACHE_DIR=/uv-cache \
    # Compile bytecode for faster startup
    UV_COMPILE_BYTECODE=1 \
    # Store the virtual environment outside the project root to satisfy volume mounts
    UV_PROJECT_ENVIRONMENT="/venv" \
    PATH="/venv/bin:$PATH"

# 2. Set Work Directory
WORKDIR /app

# 3. Install System Dependencies
# We install build-essential and libpq-dev for Postgres driver compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    git \
    && apt-get purge -y --auto-remove -o APT::AutoRemove::RecommendsImportant=false \
    && rm -rf /var/lib/apt/lists/*

# 4. Install uv
# We copy the binary directly from the official image (fastest & safest method)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# 5. Install Python Dependencies
# We copy only the requirement files first to leverage Docker layer caching.
# If pyproject.toml hasn't changed, this step (and the install) is cached.
COPY pyproject.toml uv.lock ./

# Sync dependencies:
# --frozen: fails if the lockfile is out of date (ensures reproducibility)
# --no-install-project: installs dependencies but not your actual app code yet
RUN uv sync --no-install-project

# 6. Copy Application Code
COPY . .

# 7. Install the Project
# Now we install the project itself. Since dependencies are already there, this is fast.
RUN uv sync

# 8. Entrypoint Configuration
# We copy a script to handle startup tasks (like migrations)
COPY ./resources/compose/local/django/start /start
RUN sed -i 's/\r$//g' /start && chmod +x /start

ENTRYPOINT ["/start"]
