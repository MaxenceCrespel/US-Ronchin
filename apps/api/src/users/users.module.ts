import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Attendance } from '../attendances/entities/attendance.entity';
import { MatchComposition } from '../matches/entities/match-composition.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Attendance, MatchComposition]),
    PushNotificationsModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
