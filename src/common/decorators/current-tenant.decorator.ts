import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Tenant } from '@prisma/client';
import { RequestWithTenant } from '../types/request-with-tenant';

export const CurrentTenant = createParamDecorator((_data: unknown, ctx: ExecutionContext): Tenant => {
  const request = ctx.switchToHttp().getRequest<RequestWithTenant>();
  return request.tenant;
});
