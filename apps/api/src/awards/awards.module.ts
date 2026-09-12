import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AwardCategory } from './entities/award-category.entity';
import { AwardVote } from './entities/award-vote.entity';
import { User } from '../users/entities/user.entity';
import { Match } from '../matches/entities/match.entity';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';
import { AwardsService } from './awards.service';
import { AwardsController } from './awards.controller';
import { AwardsScheduler } from './awards.scheduler';
import { MonthlyAwardScheduler } from './monthly-award.scheduler';

@Module({
  imports: [TypeOrmModule.forFeature([AwardCategory, AwardVote, User, Match]), PushNotificationsModule],
  controllers: [AwardsController],
  providers: [AwardsService, AwardsScheduler, MonthlyAwardScheduler],
})
export class AwardsModule {}
