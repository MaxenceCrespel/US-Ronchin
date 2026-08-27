import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { User } from '../users/entities/user.entity';
import { PushSubscription } from '../push-notifications/entities/push-subscription.entity';
import { UserActivityDay } from './entities/user-activity-day.entity';
import { ActivityTrackingService } from './activity-tracking.service';
import {
  ActivityTrackingController,
  ActivitySelfReportController,
} from './activity-tracking.controller';
import { ActivityTrackingInterceptor } from './activity-tracking.interceptor';

@Module({
  imports: [TypeOrmModule.forFeature([User, UserActivityDay, PushSubscription])],
  controllers: [ActivityTrackingController, ActivitySelfReportController],
  providers: [
    ActivityTrackingService,
    { provide: APP_INTERCEPTOR, useClass: ActivityTrackingInterceptor },
  ],
})
export class ActivityTrackingModule {}
