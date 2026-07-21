import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { TenantsModule } from './tenants/tenants.module';
import { FlagsModule } from './flags/flags.module';
import { EvaluationModule } from './evaluation/evaluation.module';
import { RealtimeModule } from './realtime/realtime.module';
import { MetricsModule } from './metrics/metrics.module';
import { HealthController } from './health/health.controller';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          // Request/response logging is handled by our own LoggingInterceptor
          // (it runs after guards, so it can attach tenantId) — pino here is
          // just the structured JSON writer.
          autoLogging: false,
          // nestjs-pino attaches the serialized request to every line, and
          // the raw tenant API key travels in a header.
          redact: { paths: ['req.headers["x-api-key"]', 'req.headers.authorization'], censor: '[REDACTED]' },
          level: config.get<string>('LOG_LEVEL', 'info'),
          transport:
            config.get<string>('NODE_ENV') !== 'production'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
    EventEmitterModule.forRoot(),
    // Registered once, app-wide, with both named limits. A single guard
    // class resolved from two separate per-module ThrottlerModule
    // registrations was found to collide (the /evaluate endpoint was
    // silently enforcing the /flags limit) — one registration with
    // @SkipThrottle() per controller (see FlagsController/EvaluationController)
    // is the documented, collision-free way to run multiple named throttlers.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        { name: 'flags', ttl: 60_000, limit: Number(config.get('FLAGS_RATE_LIMIT_PER_MIN', 120)) },
        { name: 'evaluate', ttl: 60_000, limit: Number(config.get('EVALUATE_RATE_LIMIT_PER_MIN', 3000)) },
      ],
    }),
    PrismaModule,
    RedisModule,
    MetricsModule,
    TenantsModule,
    FlagsModule,
    EvaluationModule,
    RealtimeModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: LoggingInterceptor }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('{*splat}');
  }
}
