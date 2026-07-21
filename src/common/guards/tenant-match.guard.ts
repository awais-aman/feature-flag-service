import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { RequestWithTenant } from '../types/request-with-tenant';

/**
 * Enforces tenant isolation: the authenticated tenant (from ApiKeyGuard) must
 * match the `:tenantId` route param. Without this, a valid API key for
 * tenant A could read/write tenant B's flags simply by changing the URL —
 * this guard is what turns "tenant_id is a column we filter by" into an
 * actual access-control boundary. Must run after ApiKeyGuard.
 */
@Injectable()
export class TenantMatchGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithTenant>();
    const routeTenantId = request.params.tenantId;

    if (!request.tenant || request.tenant.id !== routeTenantId) {
      throw new ForbiddenException('Tenant does not have access to this resource');
    }

    return true;
  }
}
