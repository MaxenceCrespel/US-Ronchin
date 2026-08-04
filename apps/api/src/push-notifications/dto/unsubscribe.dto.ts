import { IsUrl } from 'class-validator';

export class UnsubscribeDto {
  @IsUrl()
  endpoint: string;
}
