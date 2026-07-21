import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDefined,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class VariantDto {
  // Without a decorator the global ValidationPipe (whitelist +
  // forbidNonWhitelisted) rejects `value` as an unknown property, which made
  // variants impossible to set. Its type is checked against the flag type in
  // FlagsService.
  @IsDefined()
  value: string | number | boolean;

  @IsInt()
  @Min(0)
  weight: number;
}

export class UpdateFlagDto {
  // --- flag-definition-level fields (apply across all environments) ---
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  defaultValue?: unknown;

  // --- environment-scoped fields (require ?environment= query param) ---
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  rolloutPercentage?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantDto)
  variants?: VariantDto[];

  @IsOptional()
  @IsObject()
  targetingRules?: Record<string, unknown>;
}
