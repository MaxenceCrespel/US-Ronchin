import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { PlayerSeparationRule } from './entities/player-separation-rule.entity';
import { CoachPlayerRating } from './entities/coach-player-rating.entity';
import { Attendance } from '../attendances/entities/attendance.entity';
import { MatchComposition } from '../matches/entities/match-composition.entity';
import { UsersService } from './users.service';
import { UserAvatarController } from './user-avatar.controller';
import { UsersController } from './users.controller';
import { PlayerSeparationRulesService } from './player-separation-rules.service';
import { PlayerSeparationRulesController } from './player-separation-rules.controller';
import { PlayerRatingsService } from './player-ratings.service';
import { PlayerRatingsController } from './player-ratings.controller';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, PlayerSeparationRule, CoachPlayerRating, Attendance, MatchComposition]),
    PushNotificationsModule,
  ],
  controllers: [
    UsersController,
    UserAvatarController,
    PlayerSeparationRulesController,
    PlayerRatingsController,
  ],
  providers: [UsersService, PlayerSeparationRulesService, PlayerRatingsService],
  exports: [UsersService, PlayerRatingsService],
})
export class UsersModule {}
