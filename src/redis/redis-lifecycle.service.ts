import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

/**
 * ioredis isn't a Nest-managed class, so nothing closes its socket when the
 * app shuts down unless we hook it in explicitly. Without this, `app.close()`
 * (both in tests and in the real SIGTERM path Cloud Run uses during a
 * blue-green cutover — see main.ts's enableShutdownHooks) leaves an open
 * connection behind.
 */
@Injectable()
export class RedisLifecycleService implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onModuleDestroy() {
    await this.redis.quit();
  }
}
