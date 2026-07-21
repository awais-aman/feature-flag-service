import { CallHandler, ExecutionContext } from '@nestjs/common';
import { SSE_METADATA } from '@nestjs/common/constants';
import { Logger } from 'nestjs-pino';
import { lastValueFrom, of } from 'rxjs';
import { LoggingInterceptor } from '../../src/common/interceptors/logging.interceptor';
import { MetricsService } from '../../src/metrics/metrics.service';

function contextFor(handler: () => void): ExecutionContext {
  const request = {
    method: 'GET',
    path: '/x',
    route: { path: '/x' },
    tenant: { id: 't1' },
    correlationId: 'c1',
  };
  return {
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({ statusCode: 200 }) }),
  } as unknown as ExecutionContext;
}

describe('LoggingInterceptor', () => {
  const logger = { log: jest.fn() } as unknown as Logger;
  const metrics = { recordHttpRequest: jest.fn() } as unknown as MetricsService;
  const interceptor = new LoggingInterceptor(logger, metrics);
  const threeEvents: CallHandler = { handle: () => of(1, 2, 3) };

  beforeEach(() => jest.clearAllMocks());

  it('records an SSE stream once when it opens, not once per pushed event', async () => {
    const stream = () => undefined;
    Reflect.defineMetadata(SSE_METADATA, true, stream);

    await lastValueFrom(interceptor.intercept(contextFor(stream), threeEvents));

    expect(metrics.recordHttpRequest).toHaveBeenCalledTimes(1);
    expect(metrics.recordHttpRequest).toHaveBeenCalledWith('t1', 'GET /x', 200);
  });

  it('records a regular handler when its response is produced', async () => {
    const regular: CallHandler = { handle: () => of({ ok: true }) };
    await lastValueFrom(
      interceptor.intercept(
        contextFor(() => undefined),
        regular,
      ),
    );

    expect(metrics.recordHttpRequest).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 200, tenantId: 't1' }));
  });
});
