import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateTrainingSessionDto } from './create-training-session.dto';

export class UpdateTrainingSessionDto extends PartialType(CreateTrainingSessionDto) {
  @IsOptional()
  @IsBoolean()
  cancelled?: boolean;
}
