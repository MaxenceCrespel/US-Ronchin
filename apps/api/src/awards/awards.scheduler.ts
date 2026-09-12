import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AwardCategory } from './entities/award-category.entity';
import { FIXED_AWARD_CATEGORIES } from './fixed-categories';
import { getCurrentSeasonLabel } from '../stats/season.util';
import { User, UserRole, UserStatus } from '../users/entities/user.entity';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';

// The vote window opens every 1st of June and force-closes on the 16th — AwardsService
// itself closes it earlier the instant the whole roster has voted everywhere, so this is
// only the "at the latest" backstop, same idea as the old hardcoded 1–15 June display
// window this replaces.
const VOTE_OPEN_MONTH_INDEX = 5; // June, 0-indexed
const VOTE_CLOSE_DAY = 16;

/** Same rule as the frontend's isRosterPlayer / AwardsService's own local copy — only
 * active regular players and playing coaches are forced to vote, so only they get pinged
 * about it. */
function isRosterPlayer(user: User): boolean {
  return user.status === UserStatus.ACTIVE && (user.role === UserRole.PLAYER || user.isPlayingCoach);
}

@Injectable()
export class AwardsScheduler {
  private readonly logger = new Logger(AwardsScheduler.name);

  constructor(
    @InjectRepository(AwardCategory)
    private readonly categoriesRepository: Repository<AwardCategory>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly pushNotificationsService: PushNotificationsService,
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
    await this.notifyRoster({
      title: 'Trophées de fin de saison',
      body: `Le vote pour les 5 récompenses de la saison ${season} est ouvert — à toi de voter !`,
      url: '/',
    });
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
    await this.notifyRoster({
      title: 'Trophées de la saison dévoilés',
      body: `Les résultats des trophées de fin de saison ${season} sont prêts — viens découvrir qui a gagné !`,
      url: '/',
    });
  }

  /** Shared by the June-16 backstop close above and AwardsService's own early-close (the
   * instant the whole roster has voted everywhere) — both are genuine "results are in"
   * moments and both should announce it, so this stays a plain public-ish helper other
   * award services can reuse rather than each re-implementing the roster lookup. */
  async notifyRoster(payload: { title: string; body: string; url: string }) {
    const users = await this.usersRepository.find();
    const recipientIds = users.filter(isRosterPlayer).map((u) => u.id);
    if (recipientIds.length === 0) return;
    await this.pushNotificationsService.sendToUsers(recipientIds, payload);
  }
}
