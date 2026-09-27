import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BadgesService } from './badges.service';

/** getForUser() already grants newly-earned badges and revokes stale REVOCABLE_BADGE_KEYS
 * ones (e.g. "Dernier de Cordée") — but only for whichever user's badges someone happens
 * to fetch. A player who wins MOTM and never revisits their own profile keeps a
 * now-invalid revocable badge indefinitely. Running the same sync nightly for everyone
 * closes that gap without anyone needing to look at a specific profile. See
 * BadgesService.syncAll for the same loop, callable on demand (BadgesController). */
@Injectable()
export class BadgesScheduler {
  constructor(private readonly badgesService: BadgesService) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM, { timeZone: 'Europe/Paris' })
  async handleNightlySync() {
    await this.badgesService.syncAll();
  }
}
