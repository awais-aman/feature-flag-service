import { Injectable, NestMiddleware } from '@nestjs/common';
import { Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { RequestWithTenant } from '../types/request-with-tenant';

const HEADER = 'x-correlation-id';

/**
 * Assigns a correlation ID to every request — reused from the incoming
 * `X-Correlation-Id` header if the caller supplied one (so a request can be
 * traced across service boundaries), or generated fresh otherwise. Echoed
 * back on the response and threaded into every log line for that request via
 * nestjs-pino's request-scoped logger.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: RequestWithTenant, res: Response, next: NextFunction) {
    const incoming = req.headers[HEADER];
    const correlationId = (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID();
    req.correlationId = correlationId;
    res.setHeader('X-Correlation-Id', correlationId);
    next();
  }
}
