import { IsUUID } from 'class-validator';

export class VoteDefenseBossDto {
  @IsUUID()
  votedForId: string;
}
