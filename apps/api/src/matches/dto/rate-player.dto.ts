import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class RatePlayerDto {
  @IsUUID()
  ratedUserId: string;

  @IsInt()
  @Min(0)
  @Max(10)
  rating: number;
}
