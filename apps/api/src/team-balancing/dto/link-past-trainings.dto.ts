import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class LinkPastTrainingsDto {
  @IsUUID()
  userId: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  assignmentIds: string[];
}
