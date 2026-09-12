import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { AwardCategory } from './entities/award-category.entity';
import { FIXED_MONTHLY_AWARD_CATEGORIES, MONTHLY_AWARD_KEYS } from './monthly-award.constant';
import { monthBounds, monthLabel, monthLabelDisplay, previousMonthLabel } from './month.util';
import { parisToday } from '../common/utils/paris-time';
import { User, UserRole, UserStatus } from '../users/entities/user.entity';
import { Match } from '../matches/entities/match.entity';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';

/** Same rule as the frontend's isRosterPlayer / AwardsService's own local copy — only
 * active regular players and playing coaches are forced to vote, so only they get pinged
 * about it. */
function isRosterPlayer(user: User): boolean {
  return user.status === UserStatus.ACTIVE && (user.role === UserRole.PLAYER || user.isPlayingCoach);
}

// Voting on a month opens the 1st of the following month (once there's a full month of
// stats to judge it on) and force-closes on the 6th — AwardsService.maybeCloseSeasonEarly
// already closes it sooner the instant the whole roster has voted in every one of that
// month's categories, same mechanism the season awards use (it only cares about the
// arbitrary-string `season` column having no other active category left unvoted-in). A week
// is plenty even with three categories open together.
const VOTE_CLOSE_DAY = 6;

@Injectable()
export class MonthlyAwardScheduler {
  private readonly logger = new Logger(MonthlyAwardScheduler.name);

  constructor(
    @InjectRepository(AwardCategory)
    private readonly categoriesRepository: Repository<AwardCategory>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Match)
    private readonly matchesRepository: Repository<Match>,
    private readonly pushNotificationsService: PushNotificationsService,
  ) {}

  @Cron('0 10 * * *', { timeZone: 'Europe/Paris' })
  async handleMonthlyAwardWindow() {
    const today = parisToday();
    const day = Number(today.slice(8, 10));
    const monthBeingVotedOn = previousMonthLabel(monthLabel(today));

    try {
      if (day === 1) {
        await this.openIfNeeded(monthBeingVotedOn);
      } else if (day === VOTE_CLOSE_DAY) {
        await this.closeIfNeeded(monthBeingVotedOn);
      }
    } catch (error) {
      this.logger.warn(
        `Échec de la gestion des votes du mois (${monthBeingVotedOn}): ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /** Idempotent per category — a month that already has some (but not all) of the fixed
   * categories, e.g. after a mid-list deploy adding a new one, only creates the missing
   * rows rather than skipping the whole month because *something* already exists for it.
   * Skips the month entirely if the club had no match at all in it — "Joueur du mois" of a
   * month with nothing to judge performance on isn't worth voting for (a summer-break month
   * being the obvious real case). Left permanently un-opened rather than opened-then-closed-
   * empty, so it never shows up anywhere as "0 votes, nobody won". */
  private async openIfNeeded(month: string) {
    const { start, end } = monthBounds(month);
    const matchCount = await this.matchesRepository.count({ where: { date: Between(start, end) } });
    if (matchCount === 0) return;

    const existing = await this.categoriesRepository.find({
      where: { season: month },
    });
    const existingKeys = new Set(existing.map((c) => c.key));
    const missing = FIXED_MONTHLY_AWARD_CATEGORIES.filter((c) => !existingKeys.has(c.key));
    if (missing.length === 0) return;

    await this.categoriesRepository.save(
      missing.map((c) =>
        this.categoriesRepository.create({
          key: c.key,
          title: c.title,
          season: month,
          isActive: true,
          closedAt: null,
        }),
      ),
    );
    this.logger.log(`Votes du mois ouverts pour ${month}: ${missing.map((c) => c.key).join(', ')}`);
    await this.notifyRoster({
      title: 'Joueur du mois',
      body: `Le vote « Joueur du mois » de ${monthLabelDisplay(month)} est ouvert — à toi de voter !`,
      url: '/',
    });
  }

  private async closeIfNeeded(month: string) {
    const active = await this.categoriesRepository.find({
      where: MONTHLY_AWARD_KEYS.map((key) => ({ key, season: month, isActive: true })),
    });
    if (active.length === 0) return;

    const now = new Date();
    for (const category of active) {
      category.isActive = false;
      category.closedAt = now;
    }
    await this.categoriesRepository.save(active);
    this.logger.log(`Votes du mois clôturés pour ${month}: ${active.map((c) => c.key).join(', ')}`);
    await this.notifyRoster({
      title: 'Joueur du mois dévoilé',
      body: `Viens découvrir si tu as été élu Joueur du mois de ${monthLabelDisplay(month)} !`,
      url: '/',
    });
  }

  /** Same idea as AwardsScheduler's own notifyRoster — kept as its own small copy rather
   * than shared, same reasoning as this file's isRosterPlayer duplicate (see that comment). */
  private async notifyRoster(payload: { title: string; body: string; url: string }) {
    const users = await this.usersRepository.find();
    const recipientIds = users.filter(isRosterPlayer).map((u) => u.id);
    if (recipientIds.length === 0) return;
    await this.pushNotificationsService.sendToUsers(recipientIds, payload);
  }
}
