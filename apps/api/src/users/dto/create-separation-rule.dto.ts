import { IsUUID } from 'class-validator';

export class CreateSeparationRuleDto {
  @IsUUID()
  userAId: string;

  @IsUUID()
  userBId: string;
}
