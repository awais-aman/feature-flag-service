import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { RequestWithTenant } from '../types/request-with-tenant';

/**
 * Same tenant-isolation purpose as TenantMatchGuard, but for the /evaluate
 * endpoints where the tenant id travels in the request body (per the spec's
 * `{ tenant_id, environment, user_id, ... }` shape) rather than the URL.
 * Must run after ApiKeyGuard.
 */
@Injectable()
export class EvaluateTenantMatchGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithTenant>();
    const bodyTenantId = request.body?.tenant_id;

    if (!request.tenant || request.tenant.id !== bodyTenantId) {
      throw new ForbiddenException('tenant_id does not match the authenticated tenant');
    }

    return true;
  }
}
