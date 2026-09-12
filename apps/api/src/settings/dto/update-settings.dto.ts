import { IsOptional, IsUrl, Matches } from 'class-validator';

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
}
