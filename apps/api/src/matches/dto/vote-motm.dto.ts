import { IsUUID } from 'class-validator';

export class VoteMotmDto {
  @IsUUID()
  votedForId: string;
}
