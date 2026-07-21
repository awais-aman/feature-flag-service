import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { EnvironmentName, Tenant } from '@prisma/client';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { TenantMatchGuard } from '../common/guards/tenant-match.guard';
import { TenantThrottlerGuard } from '../common/guards/tenant-throttler.guard';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { FlagsService } from './flags.service';
import { CreateFlagDto } from './dto/create-flag.dto';
import { UpdateFlagDto } from './dto/update-flag.dto';
import { ListFlagsQueryDto } from './dto/list-flags-query.dto';

@Controller('api/v1/tenants/:tenantId/flags')
@UseGuards(ApiKeyGuard, TenantMatchGuard, TenantThrottlerGuard)
// Only the 'flags' named limit applies here — 'evaluate' has a much higher
// budget and would otherwise also be enforced on this controller since both
// are registered in the same app-wide ThrottlerModule (see AppModule).
@SkipThrottle({ evaluate: true })
export class FlagsController {
  constructor(private readonly flagsService: FlagsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Param('tenantId') tenantId: string, @Body() dto: CreateFlagDto, @CurrentTenant() tenant: Tenant) {
    return this.flagsService.create(tenantId, dto, tenant.apiKeyPrefix);
  }

  @Get()
  list(@Param('tenantId') tenantId: string, @Query() query: ListFlagsQueryDto) {
    return this.flagsService.list(tenantId, query);
  }

  @Put(':flagKey')
  update(
    @Param('tenantId') tenantId: string,
    @Param('flagKey') flagKey: string,
    @Query('environment', new ParseEnumPipe(EnvironmentName, { optional: true }))
    environment: EnvironmentName | undefined,
    @Body() dto: UpdateFlagDto,
    @CurrentTenant() tenant: Tenant,
  ) {
    return this.flagsService.update(tenantId, flagKey, environment, dto, tenant.apiKeyPrefix);
  }

  @Delete(':flagKey')
  archive(
    @Param('tenantId') tenantId: string,
    @Param('flagKey') flagKey: string,
    @CurrentTenant() tenant: Tenant,
  ) {
    return this.flagsService.archive(tenantId, flagKey, tenant.apiKeyPrefix);
  }

  @Get(':flagKey/history')
  history(@Param('tenantId') tenantId: string, @Param('flagKey') flagKey: string) {
    return this.flagsService.history(tenantId, flagKey);
  }
}
