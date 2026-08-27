import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';
import { CreateTrainingSessionDto } from './create-training-session.dto';

export class UpdateTrainingSessionDto extends PartialType(CreateTrainingSessionDto) {
  @IsOptional()
  @IsBoolean()
  cancelled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  scoreTeam0?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  scoreTeam1?: number;
}
