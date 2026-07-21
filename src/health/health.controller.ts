import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.constants';

/**
 * Backs both the Docker HEALTHCHECK and the Cloud Run liveness/readiness
 * probes used during blue-green rollout — a new revision should only receive
 * traffic once this returns 200.
 */
@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Get('health')
  async check() {
    const [dbOk, redisOk] = await Promise.all([this.pingDb(), this.pingRedis()]);

    if (!dbOk || !redisOk) {
      throw new ServiceUnavailableException({ status: 'unhealthy', db: dbOk, redis: redisOk });
    }

    return { status: 'ok', db: dbOk, redis: redisOk };
  }

  private async pingDb(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private async pingRedis(): Promise<boolean> {
    try {
      const pong = await this.redis.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }
}
