import { ArrayUnique, IsArray, IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class SetConvocationDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  calledUserIds: string[];
}

export class SetLineupDto {
  @IsString()
  @MaxLength(30)
  formation: string;

  /** Ordered user ids, index 0 = goalkeeper. */
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  slots: string[];

  @IsOptional()
  @IsBoolean()
  validate?: boolean;
}
