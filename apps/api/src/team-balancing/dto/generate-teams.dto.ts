import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class GenerateTeamsDto {
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(6)
  teamCount?: number;
}
