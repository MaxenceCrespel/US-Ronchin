import { IsBoolean } from 'class-validator';

export class SetCategoryActiveDto {
  @IsBoolean()
  isActive: boolean;
}
