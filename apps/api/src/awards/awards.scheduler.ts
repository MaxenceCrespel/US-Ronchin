import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AwardCategory } from './entities/award-category.entity';
import { FIXED_AWARD_CATEGORIES } from './fixed-categories';
import { getCurrentSeasonLabel } from '../stats/season.util';

// The vote window opens every 1st of June and force-closes on the 16th — AwardsService
// itself closes it earlier the instant the whole roster has voted everywhere, so this is
// only the "at the latest" backstop, same idea as the old hardcoded 1–15 June display
// window this replaces.
const VOTE_OPEN_MONTH_INDEX = 5; // June, 0-indexed
const VOTE_CLOSE_DAY = 16;

@Injectable()
export class AwardsScheduler {
  private readonly logger = new Logger(AwardsScheduler.name);

  constructor(
    @InjectRepository(AwardCategory)
    private readonly categoriesRepository: Repository<AwardCategory>,
  ) {}

  @Cron('0 0 9,21 * * *', { timeZone: 'Europe/Paris' })
  async handleSeasonVoteWindow() {
    const now = new Date();
    if (now.getMonth() !== VOTE_OPEN_MONTH_INDEX) return;

    const season = getCurrentSeasonLabel(now);
    try {
      if (now.getDate() < VOTE_CLOSE_DAY) {
        await this.openIfNeeded(season);
      } else {
        await this.closeIfNeeded(season);
      }
    } catch (error) {
      this.logger.warn(
        `Échec de la gestion de la fenêtre de vote des trophées (${season}): ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /** Idempotent: only creates the season's rows the first time this fires in the window —
   * every check after that finds them already there and does nothing. */
  private async openIfNeeded(season: string) {
    const existing = await this.categoriesRepository.find({ where: { season } });
    if (existing.length > 0) return;

    await this.categoriesRepository.save(
      FIXED_AWARD_CATEGORIES.map((c) =>
        this.categoriesRepository.create({ ...c, season, isActive: true, closedAt: null }),
      ),
    );
    this.logger.log(`Votes des trophées de fin de saison ouverts pour ${season}`);
  }

  private async closeIfNeeded(season: string) {
    const active = await this.categoriesRepository.find({ where: { season, isActive: true } });
    if (active.length === 0) return;

    const now = new Date();
    for (const category of active) {
      category.isActive = false;
      category.closedAt = now;
    }
    await this.categoriesRepository.save(active);
    this.logger.log(`Votes des trophées de fin de saison clôturés pour ${season}`);
  }
}
