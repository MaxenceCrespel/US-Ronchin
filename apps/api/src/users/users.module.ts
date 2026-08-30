import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { PlayerSeparationRule } from './entities/player-separation-rule.entity';
import { Attendance } from '../attendances/entities/attendance.entity';
import { MatchComposition } from '../matches/entities/match-composition.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PlayerSeparationRulesService } from './player-separation-rules.service';
import { PlayerSeparationRulesController } from './player-separation-rules.controller';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, PlayerSeparationRule, Attendance, MatchComposition]),
    PushNotificationsModule,
  ],
  controllers: [UsersController, PlayerSeparationRulesController],
  providers: [UsersService, PlayerSeparationRulesService],
  exports: [UsersService],
})
export class UsersModule {}
