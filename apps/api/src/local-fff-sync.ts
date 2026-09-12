/**
 * Run this from a real computer's own connection (never from the production server, a CI
 * runner, or any other datacenter host) — epreuves.fff.fr's anti-bot WAF blocks those outright
 * (confirmed: both the production VPS and GitHub Actions' own runners get a flat 403, while
 * this exact scraping code works fine from an ordinary residential/office connection). This
 * script does the scraping locally, where it isn't blocked, then POSTs the result to the
 * production API's `/fff-sync/import` and `/standings/import` endpoints — pure persistence on
 * that end, no network call to epreuves.fff.fr from the server ever happens.
 *
 * Authenticates with a shared secret (`X-Sync-Api-Key`), not a coach login — a dedicated
 * "robot" account would show up in Effectif's roster like any real person, which nobody wants
 * for a script. See SyncApiKeyGuard for the server side of this.
 *
 * Usage: from apps/api, `npm run sync:fff:local` — reads SYNC_API_BASE_URL and SYNC_API_KEY
 * from a local .env (or the environment); the API key must match `FFF_SYNC_API_KEY` on the
 * server. Optionally SYNC_FFF_TEAM_URL to override the URL configured in the production
 * Paramètres page.
 */
import 'dotenv/config';
import { FffScraperService } from './fff-sync/fff-scraper.service';
import type { ScrapedMatch } from './fff-sync/scraped-match';

const API_BASE_URL = process.env.SYNC_API_BASE_URL;
const API_KEY = process.env.SYNC_API_KEY;
const FFF_TEAM_URL_OVERRIDE = process.env.SYNC_FFF_TEAM_URL;

interface ExistingMatch {
  fffMatchId: string | null;
  date: string;
  opponent: string;
  venue: string | null;
  surface: string | null;
}

async function apiFetch<T>(baseUrl: string, path: string, apiKey: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Sync-Api-Key': apiKey,
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${init?.method ?? 'GET'} ${path} → ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

async function main() {
  if (!API_BASE_URL || !API_KEY) {
    console.error(
      "Définis SYNC_API_BASE_URL et SYNC_API_KEY (dans apps/api/.env ou en variables d'environnement) avant de " +
        'lancer ce script. SYNC_API_KEY doit correspondre à FFF_SYNC_API_KEY côté serveur.',
    );
    process.exit(1);
  }

  console.log(`Connexion à ${API_BASE_URL}...`);
  const teamUrl =
    FFF_TEAM_URL_OVERRIDE ??
    (await apiFetch<{ fffTeamUrl: string | null }>(API_BASE_URL, '/fff-sync/sync-target', API_KEY)).fffTeamUrl;
  if (!teamUrl) {
    console.error(
      "Aucune URL FFF configurée — renseigne-la dans Paramètres en production, ou passe SYNC_FFF_TEAM_URL.",
    );
    process.exit(1);
  }

  const scraper = new FffScraperService();

  console.log('Scraping du calendrier...');
  const scrapedMatches = await scraper.scrapeMatches(teamUrl);
  console.log(`${scrapedMatches.length} match(s) trouvé(s).`);

  console.log('Récupération des matchs déjà en prod (pour ne pas re-scraper un lieu déjà connu)...');
  const existingMatches = await apiFetch<ExistingMatch[]>(API_BASE_URL, '/fff-sync/existing-matches', API_KEY);
  const existingByKey = new Map(
    existingMatches.map((m) => [m.fffMatchId ?? `${m.date}-${m.opponent}`, m]),
  );

  console.log('Résolution des lieux/pelouses manquants (une page par match concerné)...');
  const resolved: ScrapedMatch[] = [];
  for (const scraped of scrapedMatches) {
    const key = scraped.fffMatchId ?? `${scraped.date}-${scraped.opponent}`;
    const existing = existingByKey.get(key);
    const needsDetail = (!existing?.venue || !existing?.surface) && scraped.matchDetailUrl;
    if (needsDetail) {
      console.log(`  -> ${scraped.opponent} (${scraped.date})`);
      const detail = await scraper.scrapeVenue(scraped.matchDetailUrl!);
      resolved.push({
        ...scraped,
        venue: detail?.venue ?? existing?.venue ?? null,
        surface: detail?.surface ?? existing?.surface ?? null,
      });
    } else {
      resolved.push({ ...scraped, venue: existing?.venue ?? scraped.venue, surface: existing?.surface ?? null });
    }
  }

  console.log('Envoi du calendrier vers la prod...');
  const matchesLog = await apiFetch<{ status: string; matchesCreated: number; matchesUpdated: number }>(
    API_BASE_URL,
    '/fff-sync/import',
    API_KEY,
    { method: 'POST', body: JSON.stringify({ matches: resolved }) },
  );
  console.log(`Calendrier : ${matchesLog.status} — ${matchesLog.matchesCreated} créés, ${matchesLog.matchesUpdated} mis à jour.`);

  console.log('Scraping du classement...');
  const standings = await scraper.scrapeStandings(teamUrl);
  console.log(`${standings.length} équipe(s) trouvée(s).`);

  console.log('Envoi du classement vers la prod...');
  const standingsLog = await apiFetch<{ status: string; teamsFound: number }>(
    API_BASE_URL,
    '/standings/import',
    API_KEY,
    { method: 'POST', body: JSON.stringify({ standings }) },
  );
  console.log(`Classement : ${standingsLog.status} — ${standingsLog.teamsFound} équipe(s).`);
}

main().catch((error) => {
  console.error('Échec de la synchro locale :', error instanceof Error ? error.message : error);
  process.exit(1);
});
