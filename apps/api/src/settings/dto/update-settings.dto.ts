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

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  // The district's own competition page — ".fff.fr" since each district has its own
  // subdomain (flandres.fff.fr for us, something else elsewhere), "/competitions" with a
  // "type=ch" (championnat) query param; poule/phase/tab vary and don't matter here, the
  // scraper forces tab=calendar itself.
  @Matches(/^https:\/\/[a-z0-9-]+\.fff\.fr\/competitions\?.*[?&]type=ch(&|$)/, {
    message:
      "L'URL doit être celle de la compétition championnat sur le site du district (ex: https://flandres.fff.fr/competitions?id=...&type=ch).",
  })
  fffChampionshipUrl?: string;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @Matches(/^https:\/\/[a-z0-9-]+\.fff\.fr\/competitions\?.*[?&]type=cp(&|$)/, {
    message:
      "L'URL doit être celle de la compétition coupe sur le site du district (ex: https://flandres.fff.fr/competitions?id=...&type=cp).",
  })
  fffCupUrl?: string;
}
