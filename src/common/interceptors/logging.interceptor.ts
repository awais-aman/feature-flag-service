import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { SSE_METADATA } from '@nestjs/common/constants';
import { Response } from 'express';
import { Logger } from 'nestjs-pino';
import { catchError, tap, throwError } from 'rxjs';
import { MetricsService } from '../../metrics/metrics.service';
import { RequestWithTenant } from '../types/request-with-tenant';

/**
 * Runs after guards (so `request.tenant` is populated when auth succeeded)
 * and logs one structured JSON line per request — method, path, tenant,
 * status, latency, correlation id — plus records the same facts into
 * Prometheus counters via MetricsService. Centralizing both here means
 * every endpoint gets consistent observability for free, without each
 * controller remembering to log or instrument itself.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    private readonly logger: Logger,
    private readonly metrics: MetricsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<RequestWithTenant>();
    const response = context.switchToHttp().getResponse<Response>();
    const start = process.hrtime.bigint();
    const endpoint = `${request.method} ${request.route?.path ?? request.path}`;

    const logOutcome = (statusCode: number, error?: unknown) => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      this.metrics.recordHttpRequest(request.tenant?.id, endpoint, statusCode);
      this.logger.log({
        correlationId: request.correlationId,
        method: request.method,
        path: request.path,
        endpoint,
        tenantId: request.tenant?.id,
        statusCode,
        durationMs: Number(durationMs.toFixed(2)),
        ...(error ? { error: error instanceof Error ? error.message : String(error) } : {}),
      });
    };

    // An SSE handler's observable emits once per pushed event, not once per
    // request, so the stream is logged and counted when it opens instead.
    if (Reflect.getMetadata(SSE_METADATA, context.getHandler())) {
      logOutcome(200);
      return next.handle();
    }

    return next.handle().pipe(
      tap(() => logOutcome(response.statusCode)),
      catchError((error) => {
        const statusCode = error?.status ?? 500;
        logOutcome(statusCode, error);
        return throwError(() => error);
      }),
    );
  }
}
