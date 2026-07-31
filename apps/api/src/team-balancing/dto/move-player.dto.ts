import { IsInt, IsUUID, Min } from 'class-validator';

export class MovePlayerDto {
  @IsUUID()
  assignmentId: string;

  @IsInt()
  @Min(0)
  teamIndex: number;
}
