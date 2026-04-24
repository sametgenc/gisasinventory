# Stage 1: Build
FROM node:20-alpine AS build-stage

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install

COPY . .
RUN pnpm build

# Stage 2: Production
FROM nginx:stable-alpine
COPY --from=build-stage /app/dist /usr/share/nginx/html
COPY compose/production/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
