# Use Node.js 22 (Active LTS) based on Debian Bookworm (slim version)
FROM node:22-bookworm-slim

# 1. Enable Corepack
# Corepack comes with Node.js and manages package managers like pnpm
# This ensures you use the exact pnpm version defined in your package.json
RUN corepack enable

# 2. Set Environment Variables
ENV PNPM_HOME="/pnpm" \
    PATH="$PNPM_HOME:$PATH"

# 3. Set Working Directory
WORKDIR /app

# 4. Configure pnpm Store
# We point the store to the path we mounted in docker-compose (/pnpm/store)
RUN pnpm config set store-dir /pnpm/store

# 5. Copy Dependency Manifests
COPY package.json pnpm-lock.yaml ./

# 6. Install Dependencies
# --no-frozen-lockfile: Allows lockfile to be updated during install (handles pnpm version differences)
RUN pnpm install --no-frozen-lockfile

# 7. Copy Application Code
# (Note: In your docker-compose, this is shadowed by the volume mount,
# but strictly necessary for the initial build and node_modules population)
COPY . .

# 8. Expose the port (matches docker-compose)
EXPOSE 5173

# 9. Start the Development Server
# --host 0.0.0.0 is MANDATORY to allow access from outside the container
CMD ["sh", "-c", "pnpm install && pnpm dev -- --host 0.0.0.0"]
