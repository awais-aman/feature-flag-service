import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisLifecycleService } from './redis-lifecycle.service';
// Token lives in its own file (redis.constants.ts) so RedisLifecycleService
// can import it without a circular dependency on this module.
import { REDIS_CLIENT } from './redis.constants';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return new Redis(config.get<string>('REDIS_URL', 'redis://localhost:6379'), {
          maxRetriesPerRequest: 3,
          lazyConnect: false,
        });
      },
    },
    RedisLifecycleService,
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
