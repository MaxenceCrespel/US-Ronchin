import { Max, Min } from 'class-validator';

export class SetPlayerRatingDto {
  // Half-points allowed (e.g. 6.5) — validated as a plain number, not an enum, since the
  // half-point granularity is a UI convention (PlayerRatingScale.tsx) rather than a domain rule.
  @Min(1)
  @Max(10)
  rating: number;
}
