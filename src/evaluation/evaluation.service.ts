import { Injectable, NotFoundException } from '@nestjs/common';
import { EnvironmentName, FlagType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isInRollout, selectVariant, WeightedVariant } from '../common/utils/rollout-hash.util';
import { MetricsService } from '../metrics/metrics.service';
import { FlagConfigCacheService, ResolvedFlagConfig } from './flag-config-cache.service';

export type EvaluationReason = 'targeting_override' | 'flag_disabled' | 'percentage_rollout' | 'default';

export interface EvaluationResult {
  flagKey: string;
  type: FlagType;
  value: Prisma.JsonValue;
  reason: EvaluationReason;
}

interface TargetingRules {
  userIds?: string[];
  value?: Prisma.JsonValue;
}

/**
 * Pure resolution logic shared by the single-flag and bulk evaluation paths.
 * Behavior by type (documented in full in README "Flag Evaluation Algorithm"):
 *  - BOOLEAN: rolloutPercentage gates true/false via the deterministic bucket.
 *  - STRING: rolloutPercentage gates entry into variant selection; outside
 *    the rollout, or with no variants configured, falls back to defaultValue.
 *  - NUMBER: has no rollout concept beyond enabled/disabled — there's only
 *    ever one number to serve, so `enabled` alone decides default-vs-default.
 *    Percentage-based numeric A/B tests are out of scope; encode them as
 *    STRING variants instead.
 * Targeting overrides (a literal userIds allow-list) take priority over
 * rollout math when present, regardless of type.
 */
export function resolveValue(config: ResolvedFlagConfig, userId: string): EvaluationResult {
  const targeting = config.targetingRules as TargetingRules | null;
  if (targeting?.userIds?.includes(userId)) {
    return {
      flagKey: config.key,
      type: config.type,
      value: targeting.value ?? config.defaultValue,
      reason: 'targeting_override',
    };
  }

  if (!config.enabled) {
    return { flagKey: config.key, type: config.type, value: config.defaultValue, reason: 'flag_disabled' };
  }

  if (config.type === FlagType.BOOLEAN) {
    const inRollout = isInRollout(config.key, userId, config.rolloutPercentage);
    return {
      flagKey: config.key,
      type: config.type,
      value: inRollout,
      reason: inRollout ? 'percentage_rollout' : 'default',
    };
  }

  if (config.type === FlagType.STRING) {
    const variants = config.variants as unknown as WeightedVariant[] | null;
    const inRollout = isInRollout(config.key, userId, config.rolloutPercentage);
    if (inRollout && variants && variants.length > 0) {
      const selected = selectVariant(config.key, userId, variants);
      return { flagKey: config.key, type: config.type, value: selected.value, reason: 'percentage_rollout' };
    }
    return { flagKey: config.key, type: config.type, value: config.defaultValue, reason: 'default' };
  }

  // NUMBER
  return { flagKey: config.key, type: config.type, value: config.defaultValue, reason: 'default' };
}

@Injectable()
export class EvaluationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: FlagConfigCacheService,
    private readonly metrics: MetricsService,
  ) {}

  async evaluateOne(
    tenantId: string,
    environment: EnvironmentName,
    userId: string,
    flagKey: string,
  ): Promise<EvaluationResult> {
    const start = process.hrtime.bigint();
    const { config, cacheHit } = await this.cache.get(tenantId, environment, flagKey);
    this.metrics.recordCacheLookup(cacheHit);

    // Archived flags are excluded from bulk evaluation; the single-flag path
    // must agree, otherwise an SDK keeps receiving a value for a deleted flag.
    if (!config || config.archivedAt) {
      throw new NotFoundException(`Flag "${flagKey}" not found for this tenant/environment`);
    }

    const result = resolveValue(config, userId);
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    this.metrics.recordEvaluation(tenantId, 'evaluate', durationMs);
    return result;
  }

  /**
   * Bulk path intentionally bypasses the per-flag Redis cache and issues one
   * DB query with joins instead: it already avoids the N+1 problem the cache
   * exists to solve, and N Redis round trips per request would be slower
   * than one Postgres query for typical per-tenant flag counts.
   */
  async evaluateBulk(
    tenantId: string,
    environment: EnvironmentName,
    userId: string,
  ): Promise<EvaluationResult[]> {
    const start = process.hrtime.bigint();
    const flags = await this.prisma.featureFlag.findMany({
      where: { tenantId, archivedAt: null },
      include: {
        environmentConfigs: {
          where: { environment: { name: environment } },
        },
      },
    });

    const results = flags
      .filter((flag) => flag.environmentConfigs.length > 0)
      .map((flag) => {
        const envConfig = flag.environmentConfigs[0];
        const config: ResolvedFlagConfig = {
          flagId: flag.id,
          key: flag.key,
          type: flag.type,
          defaultValue: flag.defaultValue,
          archivedAt: flag.archivedAt?.toISOString() ?? null,
          environmentId: envConfig.environmentId,
          enabled: envConfig.enabled,
          rolloutPercentage: envConfig.rolloutPercentage,
          variants: envConfig.variants,
          targetingRules: envConfig.targetingRules,
        };
        return resolveValue(config, userId);
      });

    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    this.metrics.recordEvaluation(tenantId, 'evaluate_bulk', durationMs);
    return results;
  }
}
