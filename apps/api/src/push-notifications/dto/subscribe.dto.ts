import {
  IsDefined,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class PushSubscriptionKeysDto {
  @IsString()
  @IsNotEmpty()
  p256dh: string;

  @IsString()
  @IsNotEmpty()
  auth: string;
}

export class SubscribeDto {
  @IsUrl()
  endpoint: string;

  /** Sent by every browser as part of PushSubscription.toJSON() — usually null. Not stored,
   * only declared so the global forbidNonWhitelisted pipe doesn't reject the whole payload
   * (which it did: every activation failed with a 400). */
  @IsOptional()
  @IsNumber()
  expirationTime?: number | null;

  @IsDefined()
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys: PushSubscriptionKeysDto;
}
