# Ronchin US App

Application web pour l'équipe US Ronchin (D6) : entraînements, présences, matchs, statistiques, badges et gamification. Monorepo npm workspaces — `apps/api` (NestJS + TypeORM + PostgreSQL) et `apps/web` (React 19 + Vite).

## Développement local

```bash
npm install
docker compose up -d postgres   # base de données seule, pour le dev
npm run dev:api                 # apps/api sur http://localhost:3001
npm run dev:web                 # apps/web sur http://localhost:5173 (proxy /api -> 3001)
```

Créer un premier compte coach :

```bash
cd apps/api
SEED_COACH_EMAIL=toi@exemple.fr SEED_COACH_PASSWORD='...' npm run seed:coach
```

## Build & déploiement Docker

L'app tourne en deux images distinctes derrière nginx (voir `apps/api/Dockerfile`, `apps/web/Dockerfile`, `apps/web/nginx.conf`) :
- `api` — NestJS, sert `/api/*`. Inclut Chromium (Playwright) pour la synchronisation automatique du calendrier FFF (`fff-sync`).
- `web` — build statique React servi par nginx, qui reverse-proxy `/api/*` vers le service `api` (même rôle que le proxy Vite en dev).

```bash
docker compose up -d --build
```

> Les scripts CLI ponctuels (`seed:coach`, etc.) reposent sur `ts-node`, une devDependency absente de l'image de production allégée — lance-les depuis ta machine (`cd apps/api && npm run seed:coach`) plutôt que via `docker compose exec`, en pointant `DB_HOST`/`DB_PORT` vers la base exposée (`localhost:5434` en local).

## Pipeline CI/CD

Sur chaque push/PR vers `main`, `.github/workflows/main.yml` orchestre :

- **Linter & Tests** — typecheck + tests + build API, lint + build web
- **Secret Scanning** (Gitleaks), **SAST** (Semgrep), **SCA** (`npm audit`), **IaC** (Checkov sur les Dockerfiles/compose)
- **Docker Build & Scan** — build des deux images, scan Trivy (CRITICAL/HIGH bloquant, exceptions dans `.trivyignore`), SBOM, publication sur GHCR
- **Load Testing** (Siege), **DAST** (OWASP ZAP), **E2E** (Cypress — smoke test golden path : connexion, accueil, navigation Entraînements/Matchs)
- **Deploy Staging** — déploiement SSH sur le VPS (voir checklist ci-dessous)

`qodo-pr-agent.yml` (relecture IA des pull requests) tourne indépendamment du DAG principal, sur les événements de PR.

### État connu au premier run

- **SCA-Dependency-Scan** et le **scan Trivy de l'image `api`** échoueront tous les deux sur la même cause réelle : `puppeteer-extra-plugin-stealth` (utilisé par le scraper FFF) tire une chaîne `rimraf`/`glob`/`minimatch`/`brace-expansion` avec une CVE high (CVE-2026-14257). Pré-existant, pas introduit par la CI — à traiter via une mise à jour de `playwright-extra`/`puppeteer-extra-*`, volontairement pas masqué dans `.trivyignore`. Les ~38 autres CVE Debian de l'image `api` (packages X11/Xvfb installés par `playwright install --with-deps`, jamais utilisés puisque le scraper tourne en headless pur, et sans correctif Debian publié à ce jour) sont documentées et ignorées dans `.trivyignore`.
- **Deploy-Staging** est volontairement en `continue-on-error: true` tant que la checklist ci-dessous n'est pas faite — il échouera proprement sans bloquer le reste de la pipeline.
- **Qodo Merge** reste inactif tant que `OPENAI_KEY` n'est pas ajouté (voir plus bas).

## Checklist : activer le déploiement automatique sur le VPS

1. Sur le VPS : installer Docker + Docker Compose, puis cloner le repo dans `/opt/ronchin-us-app`.
2. Sur GitHub (Settings → Secrets and variables → Actions), ajouter :
   - `STAGING_SSH_HOST`, `STAGING_SSH_USER`, `STAGING_SSH_KEY` (clé privée SSH dédiée, accès en écriture sur `/opt/ronchin-us-app` uniquement)
   - `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (`openssl rand -hex 64` chacun) et `WEB_APP_URL` (URL publique réelle du site) — lus par `docker-compose.staging.yml`
3. Une fois testé et stable, retirer `continue-on-error: true` de `.github/workflows/deploy-staging.yml` pour que la pipeline échoue vraiment si le déploiement casse.

## Activer Qodo Merge (relecture IA des PR)

Ajouter le secret `OPENAI_KEY` (Settings → Secrets and variables → Actions) — `qodo-pr-agent.yml` s'active automatiquement dès qu'il est présent, sans autre changement.
