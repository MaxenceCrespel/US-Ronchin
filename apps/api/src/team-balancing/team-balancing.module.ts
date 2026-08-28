import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrainingTeamAssignment } from './entities/training-team-assignment.entity';
import { TrainingSession } from '../trainings/entities/training-session.entity';
import { Attendance } from '../attendances/entities/attendance.entity';
import { AttendanceGuest } from '../attendances/entities/attendance-guest.entity';
import { StatsModule } from '../stats/stats.module';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';
import { TeamBalancingService } from './team-balancing.service';
import { TeamBalancingController, TrainingRankingController } from './team-balancing.controller';
import { TeamBalancingScheduler } from './team-balancing.scheduler';

@Module({
  imports: [
    TypeOrmModule.forFeature([TrainingTeamAssignment, TrainingSession, Attendance, AttendanceGuest]),
    StatsModule,
    PushNotificationsModule,
  ],
  controllers: [TeamBalancingController, TrainingRankingController],
  providers: [TeamBalancingService, TeamBalancingScheduler],
})
export class TeamBalancingModule {}
