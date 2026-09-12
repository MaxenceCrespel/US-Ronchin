import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { UserRole } from '../users/entities/user.entity';
import { StandingsService } from './standings.service';
import { ImportStandingsDto } from './dto/import-standings.dto';
import { SyncApiKeyGuard } from '../fff-sync/guards/sync-api-key.guard';

@Controller('standings')
export class StandingsController {
  constructor(private readonly standingsService: StandingsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll() {
    return this.standingsService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Get('logs')
  getLogs(@Query('limit') limit?: string) {
    return this.standingsService.getRecentLogs(limit ? Number(limit) : 5);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.COACH)
  @Post('sync')
  sync(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.standingsService.sync(currentUser.id);
  }

  /** Fed by the local sync script (apps/api/src/local-fff-sync.ts) — see
   * FffSyncController.importScraped's own doc comment for why this exists instead of the
   * server scraping itself, and SyncApiKeyGuard's for why a shared secret rather than a real
   * user account. */
  @UseGuards(SyncApiKeyGuard)
  @Post('import')
  importScraped(@Body() dto: ImportStandingsDto) {
    return this.standingsService.importScraped(dto.standings, null);
  }
}
