# Production image for the Ronchin US App API (NestJS). The final stage is
# Debian-based rather than Alpine because the FFF calendar sync module
# (fff-sync) launches a real headless Chromium via Playwright at runtime —
# Alpine's musl libc has a long history of Chromium compatibility issues,
# Debian doesn't.
#
# npm workspaces monorepo, single root package-lock.json — but `npm ci`
# doesn't require every workspace's package.json to be present, it just
# installs whatever workspaces it can see. Deliberately NOT copying
# apps/web/package.json here: including it would pull the entire frontend
# dependency tree (react, react-router...) into this image for nothing,
# widening both the image size and the surface Trivy scans. Built from the
# repo root as context (see docker-compose.yml's `context: .`).

FROM node:22-alpine AS api-build
WORKDIR /build
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
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

# The npm version bundled with the base image vendors its own (occasionally
# vulnerable) copies of tar/picomatch/sigstore/brace-expansion — irrelevant
# to our app code, but still part of the image Trivy scans, and `npx` below
# invokes this npm at build time. Upgrading it keeps that surface current
# without waiting on a base image rebuild.
RUN npm install -g npm@latest
# npm@latest still vendors a frozen, exact-pinned tar version — its own
# package.json declares a semver range that a patched release would satisfy,
# but the actual shipped bundle isn't re-resolved against it, so
# `npm install -g npm@latest` alone doesn't pick up the fix. Surgically swap
# just the vendored tar/ directory for the patched release (verified this
# doesn't break npm: a real `npm install` still works fine against it) rather
# than waiting on an upstream npm release that bumps its own bundle.
RUN npm pack tar@7.5.21 --pack-destination /tmp --silent \
  && rm -rf /usr/local/lib/node_modules/npm/node_modules/tar \
  && mkdir -p /usr/local/lib/node_modules/npm/node_modules/tar \
  && tar -xzf /tmp/tar-7.5.21.tgz -C /usr/local/lib/node_modules/npm/node_modules/tar --strip-components=1 \
  && rm /tmp/tar-7.5.21.tgz

# Chromium, matching whatever playwright version is in node_modules —
# required at runtime by the FFF calendar scraper (cron job + manual POST
# /fff-sync/run), not by the rest of the API. Debian's own packages drift
# out of date on the pinned base image the same way Alpine's do — patch
# them too before installing anything else.
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*

# `playwright install --with-deps` pulls Playwright's full recommended
# package set, which includes a lot the FFF scraper never touches — a
# virtual X server (Xvfb), Perl compression/socket tooling, ncurses,
# util-linux mount utilities... none of it reachable since the scraper
# always launches Chromium in pure headless mode (no display, ever). That
# bloat was showing up as a wall of unrelated, unfixable CVEs in scans for
# packages the app never runs. Installing only the actual shared libraries
# headless Chromium links against keeps the same real functionality with a
# much smaller, much more honest attack surface.
# Fixed, explicit install path — otherwise Playwright installs to
# $HOME/.cache/ms-playwright (root's $HOME at build time), but the
# container runs as the unprivileged `app` user below whose $HOME
# (/nonexistent) it can never read from, and the browser silently "goes
# missing" at runtime.
# fff-scraper.service.ts requests `channel: 'chrome'` specifically (real
# Google Chrome, not the open-source Chromium build) — installing the
# wrong one leaves a browser present but unusable at runtime
# ("Chromium distribution 'chrome' is not found").
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx playwright install chrome
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libgbm1 \
    libglib2.0-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxkbcommon0 \
    libxshmfence1 \
    libxtst6 \
  && rm -rf /var/lib/apt/lists/*

# --home /home/app rather than the default /nonexistent — Chrome's crash
# reporter (crashpad) needs a real, writable $HOME to set up its database
# and fails to launch at all without one.
RUN addgroup --system app && adduser --system --home /home/app --ingroup app app \
  && mkdir -p /home/app && chown -R app:app /app /ms-playwright /home/app
USER app

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3001)+'/api').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
