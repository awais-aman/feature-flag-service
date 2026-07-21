import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { RequestWithTenant } from '../types/request-with-tenant';

/**
 * Keys rate limiting by authenticated tenant id instead of source IP. Must be
 * applied after ApiKeyGuard so `request.tenant` is populated. This is what
 * turns a shared rate limit into per-tenant isolation — without it, one
 * tenant hammering /evaluate could exhaust the limit for every tenant behind
 * the same NAT/IP (or, with IP-only limiting, one tenant's traffic wouldn't
 * be capped independently of another's at all).
 */
@Injectable()
export class TenantThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: RequestWithTenant): Promise<string> {
    return req.tenant?.id ?? req.ip ?? 'anonymous';
  }
}
