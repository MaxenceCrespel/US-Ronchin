import { IsUUID } from 'class-validator';

export class LinkCompositionGuestDto {
  @IsUUID()
  userId: string;
}
