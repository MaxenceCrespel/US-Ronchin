import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { TrainingsModule } from './trainings/trainings.module';
import { AttendancesModule } from './attendances/attendances.module';
import { MatchesModule } from './matches/matches.module';
import { StatsModule } from './stats/stats.module';
import { TeamBalancingModule } from './team-balancing/team-balancing.module';
import { PdfImportModule } from './pdf-import/pdf-import.module';
import { SettingsModule } from './settings/settings.module';
import { FffSyncModule } from './fff-sync/fff-sync.module';
import { StandingsModule } from './standings/standings.module';
import { AwardsModule } from './awards/awards.module';
import { BadgesModule } from './badges/badges.module';
import { PushNotificationsModule } from './push-notifications/push-notifications.module';
import { ActivityTrackingModule } from './activity-tracking/activity-tracking.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.getOrThrow<string>('DB_HOST'),
        port: configService.getOrThrow<number>('DB_PORT'),
        username: configService.getOrThrow<string>('DB_USER'),
        password: configService.getOrThrow<string>('DB_PASSWORD'),
        database: configService.getOrThrow<string>('DB_NAME'),
        autoLoadEntities: true,
        synchronize: true,
      }),
    }),
    UsersModule,
    AuthModule,
    TrainingsModule,
    AttendancesModule,
    MatchesModule,
    StatsModule,
    TeamBalancingModule,
    PdfImportModule,
    SettingsModule,
    FffSyncModule,
    StandingsModule,
    AwardsModule,
    BadgesModule,
    PushNotificationsModule,
    ActivityTrackingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
