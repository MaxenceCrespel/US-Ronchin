import { IsArray, IsEnum } from 'class-validator';
import { NotificationCategory } from '../notification-category';

export class UpdatePreferencesDto {
  @IsArray()
  @IsEnum(NotificationCategory, { each: true })
  mutedCategories: NotificationCategory[];
}
