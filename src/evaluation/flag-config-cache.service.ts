import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import Redis from 'ioredis';
import { EnvironmentName, FlagType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { FlagChangedEvent, FLAG_CHANGED_EVENT } from '../common/events/flag-changed.event';

const ALL_ENVIRONMENTS = Object.values(EnvironmentName);
const CACHE_TTL_SECONDS = 30;
const CACHE_KEY_VERSION = 'v1';

export interface ResolvedFlagConfig {
  flagId: string;
  key: string;
  type: FlagType;
  defaultValue: Prisma.JsonValue;
  archivedAt: string | null;
  environmentId: string;
  enabled: boolean;
  rolloutPercentage: number;
  variants: Prisma.JsonValue;
  targetingRules: Prisma.JsonValue;
}

function cacheKey(tenantId: string, environment: EnvironmentName, flagKey: string): string {
  return `flagconfig:${CACHE_KEY_VERSION}:${tenantId}:${environment}:${flagKey}`;
}

/**
 * Caches the *resolved flag+environment config* (not per-user evaluation
 * results) in Redis. The keyspace here is bounded by (tenants x flags x
 * environments) — small and cheap to keep warm and to invalidate precisely.
 * Caching per-user evaluation results instead would mean an unbounded
 * keyspace (tenants x flags x environments x users) with the same staleness
 * problem, for a bucket computation that's already sub-microsecond — the
 * actual cost we're saving is the DB round trip to fetch config, not the hash
 * math, so this is what we cache. See README "Caching Strategy".
 */
@Injectable()
export class FlagConfigCacheService {
  private readonly logger = new Logger(FlagConfigCacheService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async get(
    tenantId: string,
    environment: EnvironmentName,
    flagKey: string,
  ): Promise<{ config: ResolvedFlagConfig | null; cacheHit: boolean }> {
    const key = cacheKey(tenantId, environment, flagKey);

    const cached = await this.redis.get(key);
    if (cached) {
      return { config: JSON.parse(cached) as ResolvedFlagConfig, cacheHit: true };
    }

    const flag = await this.prisma.featureFlag.findUnique({
      where: { tenantId_key: { tenantId, key: flagKey } },
      include: { environmentConfigs: { include: { environment: true } } },
    });

    if (!flag) {
      return { config: null, cacheHit: false };
    }

    const envConfig = flag.environmentConfigs.find((c) => c.environment.name === environment);
    if (!envConfig) {
      return { config: null, cacheHit: false };
    }

    const resolved: ResolvedFlagConfig = {
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

    await this.redis.set(key, JSON.stringify(resolved), 'EX', CACHE_TTL_SECONDS);
    return { config: resolved, cacheHit: false };
  }

  /**
   * Invalidates every environment's cache entry for a flag when a
   * flag-definition-level field changes (defaultValue/type affect resolved
   * config in all environments); pass a single environment to invalidate
   * just that one when only its rollout config changed.
   */
  @OnEvent(FLAG_CHANGED_EVENT)
  async handleFlagChanged(event: FlagChangedEvent): Promise<void> {
    const environments = event.environment ? [event.environment] : ALL_ENVIRONMENTS;
    const keys = environments.map((env) => cacheKey(event.tenantId, env, event.flagKey));
    await this.redis.del(...keys);
    this.logger.debug(`Invalidated cache for ${keys.join(', ')}`);
  }
}
