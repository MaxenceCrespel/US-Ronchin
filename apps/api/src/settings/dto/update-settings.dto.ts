import { IsOptional, IsUrl } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  fffTeamUrl?: string;
}
