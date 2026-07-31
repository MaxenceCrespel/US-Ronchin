import { PartialType } from '@nestjs/mapped-types';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { CreateMatchDto } from './create-match.dto';
import { MatchStatus } from '../entities/match.entity';

export class UpdateMatchDto extends PartialType(CreateMatchDto) {
  @IsOptional()
  @IsInt()
  @Min(0)
  scoreHome?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  scoreAway?: number;

  @IsOptional()
  @IsEnum(MatchStatus)
  status?: MatchStatus;
}
