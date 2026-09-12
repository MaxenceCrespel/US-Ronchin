import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { UserRole } from '../users/entities/user.entity';
import { FffSyncService } from './fff-sync.service';
import { ImportMatchesDto } from './dto/import-matches.dto';
import type { ScrapedMatch } from './scraped-match';
import { SyncApiKeyGuard } from './guards/sync-api-key.guard';
import { SettingsService } from '../settings/settings.service';

@Controller('fff-sync')
export class FffSyncController {
  constructor(
    private readonly fffSyncService: FffSyncService,
    private readonly settingsService: SettingsService,
  ) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.COACH)
  @Post('run')
  run(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.fffSyncService.sync(currentUser.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.COACH)
  @Get('logs')
  logs(@Query('limit') limit?: string) {
    return this.fffSyncService.getRecentLogs(limit ? Number(limit) : 5);
  }

  // Everything below is used exclusively by the local sync script
  // (apps/api/src/local-fff-sync.ts) — guarded by a shared secret rather than a real user
  // account (see SyncApiKeyGuard's own doc comment for why).

  /** The team URL configured in Paramètres — kept as the single source of truth instead of
   * duplicating it into the script's own .env, so changing it once in the app is enough. */
  @UseGuards(SyncApiKeyGuard)
  @Get('sync-target')
  async syncTarget() {
    const settings = await this.settingsService.get();
    return { fffTeamUrl: settings.fffTeamUrl };
  }

  /** What this server already knows, so the script only re-fetches a match's detail page
   * (venue/surface) the first time it's genuinely missing — same lazy behaviour `sync()` has
   * always had, just computed on the script's side instead of the server's. */
  @UseGuards(SyncApiKeyGuard)
  @Get('existing-matches')
  existingMatches() {
    return this.fffSyncService.getExistingSummaries();
  }

  /** Fed by the local sync script — epreuves.fff.fr blocks the production server's own IP, so
   * this machine can never scrape it directly (see FffSyncService.importScraped's own doc
   * comment). The coach runs the script from their own computer, which scrapes normally, then
   * POSTs the result here instead of this server fetching anything itself. */
  @UseGuards(SyncApiKeyGuard)
  @Post('import')
  importScraped(@Body() dto: ImportMatchesDto) {
    const scrapedMatches: ScrapedMatch[] = dto.matches.map((m) => ({
      fffMatchId: m.fffMatchId ?? null,
      date: m.date,
      kickOffTime: m.kickOffTime ?? null,
      opponent: m.opponent,
      homeAway: m.homeAway,
      venue: m.venue ?? null,
      competition: m.competition ?? null,
      scoreHome: m.scoreHome ?? null,
      scoreAway: m.scoreAway ?? null,
      played: m.played,
      matchDetailUrl: m.matchDetailUrl ?? null,
      surface: m.surface ?? null,
    }));
    // Not a real user — triggeredBy/createdBy are uuid columns tied to an actual account, so
    // this stays null (the log's own timing is enough to tell it apart from a coach-triggered
    // run in practice; nothing currently reads triggeredBy to distinguish the two anyway).
    return this.fffSyncService.importScraped(scrapedMatches, null);
  }
}
