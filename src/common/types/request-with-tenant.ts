import { Request } from 'express';
import { Tenant } from '@prisma/client';

export interface RequestWithTenant extends Request {
  tenant: Tenant;
  correlationId: string;
}
