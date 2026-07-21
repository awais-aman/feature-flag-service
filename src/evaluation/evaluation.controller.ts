import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { EvaluateTenantMatchGuard } from '../common/guards/evaluate-tenant-match.guard';
import { TenantThrottlerGuard } from '../common/guards/tenant-throttler.guard';
import { EvaluationService } from './evaluation.service';
import { EvaluateBulkDto, EvaluateDto } from './dto/evaluate.dto';

@Controller('api/v1/evaluate')
@UseGuards(ApiKeyGuard, EvaluateTenantMatchGuard, TenantThrottlerGuard)
// Only the 'evaluate' named limit applies here — see FlagsController for the
// mirrored @SkipThrottle and AppModule for where both limits are registered.
@SkipThrottle({ flags: true })
export class EvaluationController {
  constructor(private readonly evaluationService: EvaluationService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  evaluate(@Body() dto: EvaluateDto) {
    return this.evaluationService.evaluateOne(dto.tenant_id, dto.environment, dto.user_id, dto.flag_key);
  }

  @Post('bulk')
  @HttpCode(HttpStatus.OK)
  async evaluateBulk(@Body() dto: EvaluateBulkDto) {
    const results = await this.evaluationService.evaluateBulk(dto.tenant_id, dto.environment, dto.user_id);
    return {
      environment: dto.environment,
      flags: Object.fromEntries(
        results.map((r) => [r.flagKey, { type: r.type, value: r.value, reason: r.reason }]),
      ),
    };
  }
}
