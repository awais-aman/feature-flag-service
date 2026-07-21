import { IsDefined, IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { FlagType } from '@prisma/client';

export class CreateFlagDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[a-z0-9][a-z0-9_-]*$/, {
    message: 'key must be lowercase alphanumeric with dashes/underscores only',
  })
  key: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(FlagType)
  type: FlagType;

  // Shape validated at the service layer against `type` (boolean/string/number).
  // @IsDefined (rather than a type-specific decorator) is enough to register
  // the property with class-validator so the global ValidationPipe's
  // `whitelist: true` doesn't silently strip it as an unrecognized field.
  @IsDefined()
  defaultValue: unknown;
}
