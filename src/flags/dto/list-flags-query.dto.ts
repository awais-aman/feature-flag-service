import { IsEnum, IsOptional } from 'class-validator';
import { EnvironmentName } from '@prisma/client';

export enum FlagStatusFilter {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

export class ListFlagsQueryDto {
  @IsOptional()
  @IsEnum(EnvironmentName)
  environment?: EnvironmentName;

  @IsOptional()
  @IsEnum(FlagStatusFilter)
  status?: FlagStatusFilter;
}
