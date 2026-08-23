# Production image for the Ronchin US App frontend: a static Vite/React
# build served by nginx, which also reverse-proxies /api/* to the `api`
# service — mirrors exactly what Vite's dev server proxy already does
# (see vite.config.ts), so the app code needs zero changes for prod.
#
# npm workspaces monorepo, single root package-lock.json — but `npm ci`
# doesn't require every workspace's package.json to be present, it just
# installs whatever workspaces it can see. Deliberately NOT copying
# apps/api/package.json here: this build stage is discarded after `vite
# build` anyway (only dist/ makes it into the final nginx image below), but
# skipping it still avoids installing apps/api's entire dependency tree
# (Playwright et al.) for nothing. Built from the repo root as context (see
# docker-compose.yml's `context: .`).

FROM node:22-alpine AS web-build
WORKDIR /build
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY apps/web/ apps/web/
RUN npm run build --workspace=web

# nginxinc/nginx-unprivileged (not the plain nginx image) runs as a non-root
# `nginx` user out of the box and listens on 8080 instead of 80, since
# unprivileged users can't bind ports below 1024 — see nginx.conf/compose.
FROM nginxinc/nginx-unprivileged:1.27-alpine
# The pinned Alpine package snapshot bundled with this base image tag drifts
# out of date over time (openssl/libxml2/musl/zlib CVEs) — pulling latest
# patches at build time is more durable than periodically re-pinning the
# base tag. USER root is needed for apk itself; switched back below.
USER root
RUN apk update && apk upgrade --no-cache
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /build/apps/web/dist /usr/share/nginx/html

EXPOSE 8080
# Redundant with the base image's own default (it already runs as `nginx`),
# but explicit here so the Dockerfile is self-evidently non-root on its own.
USER nginx

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
