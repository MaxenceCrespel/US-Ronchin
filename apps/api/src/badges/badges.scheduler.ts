import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserStatus } from '../users/entities/user.entity';
import { BadgesService } from './badges.service';

/** getForUser() already grants newly-earned badges and revokes stale REVOCABLE_BADGE_KEYS
 * ones (e.g. "Dernier de Cordée") — but only for whichever user's badges someone happens
 * to fetch. A player who wins MOTM and never revisits their own profile keeps a
 * now-invalid revocable badge indefinitely. Running the same sync nightly for everyone
 * closes that gap without anyone needing to look at a specific profile. */
@Injectable()
export class BadgesScheduler {
  private readonly logger = new Logger(BadgesScheduler.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly badgesService: BadgesService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM, { timeZone: 'Europe/Paris' })
  async handleNightlySync() {
    const users = await this.usersRepository.find({ where: { status: UserStatus.ACTIVE } });
    for (const user of users) {
      try {
        await this.badgesService.getForUser(user.id);
      } catch (err) {
        this.logger.error(`Badge sync failed for user ${user.id}`, err instanceof Error ? err.stack : err);
      }
    }
  }
}
