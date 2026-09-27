import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { SeniorityTier, UserRole } from '../entities/user.entity';
import { UpdateProfileDto } from './update-profile.dto';
import { Transform } from 'class-transformer';

export class AdminUpdateUserDto extends UpdateProfileDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  firstName?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  lastName?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsBoolean()
  isPlayingCoach?: boolean;

  @IsOptional()
  @IsBoolean()
  isLicensed?: boolean;

  @IsOptional()
  @IsString()
  licenseNumber?: string;

  @IsOptional()
  @IsEnum(SeniorityTier)
  seniorityTier?: SeniorityTier | null;
}
