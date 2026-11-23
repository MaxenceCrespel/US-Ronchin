import { IsOptional, IsUrl, Matches } from 'class-validator';
import { COMPETITION_URL_EXAMPLE, COMPETITION_URL_PATTERN } from '../../fff-sync/fff-competition';

export class UpdateSettingsDto {
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  // Only the team's base page ("/equipe/{code}") actually matters — the scraper strips
  // whatever tab suffix the coach happened to copy the link from (/resultat-calendrier,
  // /statistiques, /saison, /classement, none at all, ...) and appends the specific one each
  // scrape needs itself (see deriveMatchesUrl/deriveStandingsUrl in fff-scraper.service.ts), so
  // this just needs to confirm a club+equipe URL is in there at all, not any particular suffix.
  @Matches(/^https:\/\/epreuves\.fff\.fr\/competition\/club\/\d+-[^/]+\/equipe\/[^/]+/, {
    message:
      "L'URL doit être celle de la page de l'équipe sur epreuves.fff.fr, du genre https://epreuves.fff.fr/competition/club/{id}-{slug}/equipe/{code} (peu importe l'onglet précis à la fin).",
  })
  fffTeamUrl?: string;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  // The championship's page on epreuves.fff.fr — competition, phase and poule are read from the
  // path, whatever tab follows (see parseCompetitionUrl).
  @Matches(COMPETITION_URL_PATTERN, {
    message: `Le lien doit être celui de la page du championnat sur epreuves.fff.fr (ex : ${COMPETITION_URL_EXAMPLE}).`,
  })
  fffChampionshipUrl?: string;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @Matches(COMPETITION_URL_PATTERN, {
    message:
      'Le lien doit être celui de la page de la coupe sur epreuves.fff.fr (ex : https://epreuves.fff.fr/competition/engagement/459041-coupe-des-flandres-reserve/phase/1/1/accueil).',
  })
  fffCupUrl?: string;
}
