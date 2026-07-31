import { IsUUID } from 'class-validator';

export class CastVoteDto {
  @IsUUID()
  votedForId: string;
}
