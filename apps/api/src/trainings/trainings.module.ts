import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Training } from './entities/training.entity';
import { TrainingSession } from './entities/training-session.entity';
import { TrainingsService } from './trainings.service';
import { TrainingsController } from './trainings.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Training, TrainingSession])],
  controllers: [TrainingsController],
  providers: [TrainingsService],
  exports: [TrainingsService],
})
export class TrainingsModule {}
