import { IsBoolean, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class JoinDto {
  @IsString()
  token: string;

  @IsEmail()
  email: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsOptional()
  @IsBoolean()
  isLicensed?: boolean;

  @IsString()
  @MinLength(8)
  password: string;
}
