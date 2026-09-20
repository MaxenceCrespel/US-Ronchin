import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Training } from './entities/training.entity';
import { TrainingSession } from './entities/training-session.entity';
import { AttendancesModule } from '../attendances/attendances.module';
import { TrainingsService } from './trainings.service';
import { TrainingsController } from './trainings.controller';
import { TrainingsScheduler } from './trainings.scheduler';

@Module({
  imports: [TypeOrmModule.forFeature([Training, TrainingSession]), AttendancesModule],
  controllers: [TrainingsController],
  providers: [TrainingsService, TrainingsScheduler],
  exports: [TrainingsService],
})
export class TrainingsModule {}
