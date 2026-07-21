import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';
import { EnvironmentName } from '@prisma/client';

export class EvaluateDto {
  @IsUUID()
  tenant_id: string;

  @IsEnum(EnvironmentName)
  environment: EnvironmentName;

  @IsString()
  @IsNotEmpty()
  user_id: string;

  @IsString()
  @IsNotEmpty()
  flag_key: string;

  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}

export class EvaluateBulkDto {
  @IsUUID()
  tenant_id: string;

  @IsEnum(EnvironmentName)
  environment: EnvironmentName;

  @IsString()
  @IsNotEmpty()
  user_id: string;

  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}
