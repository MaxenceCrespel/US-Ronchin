# Production image for the Ronchin US App frontend: a static Vite/React
# build served by nginx, which also reverse-proxies /api/* to the `api`
# service — mirrors exactly what Vite's dev server proxy already does
# (see vite.config.ts), so the app code needs zero changes for prod.
#
# npm workspaces monorepo (single root package-lock.json) — `npm ci` needs
# both workspaces' package.json files present. Built from the repo root as
# context (see docker-compose.yml's `context: .`).

FROM node:22-alpine AS web-build
WORKDIR /build
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY apps/web/ apps/web/
RUN npm run build --workspace=web

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /build/apps/web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
