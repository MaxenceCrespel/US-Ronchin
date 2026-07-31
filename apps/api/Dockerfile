# Production image for the Ronchin US App API (NestJS). The final stage is
# Debian-based rather than Alpine because the FFF calendar sync module
# (fff-sync) launches a real headless Chromium via Playwright at runtime —
# Alpine's musl libc has a long history of Chromium compatibility issues,
# Debian doesn't.
#
# This is an npm workspaces monorepo (single root package-lock.json for
# both apps/api and apps/web) — `npm ci` therefore needs both workspaces'
# package.json files present, and installs into one hoisted root
# node_modules rather than a per-app one. Built from the repo root as
# context (see docker-compose.yml's `context: .`).

FROM node:22-alpine AS api-build
WORKDIR /build
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
# Playwright's postinstall tries to download a browser during `npm ci` —
# skip it here, the runtime stage below installs the matching one itself.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci
COPY apps/api/ apps/api/
RUN npm run build --workspace=api
# Strip devDependencies (jest, ts-jest, supertest, @nestjs/testing, vite,
# react...) now that the build is done — none of that belongs in the
# shipped image. playwright/playwright-extra/puppeteer-extra-plugin-stealth
# are real `dependencies` of apps/api, so they survive this prune.
RUN npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

COPY --from=api-build /build/node_modules ./node_modules
COPY --from=api-build /build/apps/api/dist ./dist
COPY --from=api-build /build/apps/api/package.json ./package.json

# Chromium + its system libs, matching whatever playwright version is in
# node_modules — required at runtime by the FFF calendar scraper (cron job
# + manual POST /fff-sync/run), not by the rest of the API.
RUN npx playwright install --with-deps chromium \
  && rm -rf /var/lib/apt/lists/*

RUN addgroup --system app && adduser --system --ingroup app app \
  && chown -R app:app /app
USER app

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3001)+'/api').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
