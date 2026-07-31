import { IsBoolean, IsEmail, IsOptional, IsString } from 'class-validator';

export class CreateInvitationDto {
  @IsEmail()
  email: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsOptional()
  @IsBoolean()
  isLicensed?: boolean;
}
