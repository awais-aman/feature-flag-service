import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface RecordAuditParams {
  tenantId: string;
  flagId?: string;
  environmentId?: string;
  action: AuditAction;
  changedBy: string;
  previousValue?: Prisma.InputJsonValue | null;
  newValue?: Prisma.InputJsonValue | null;
}

type PrismaTx = Prisma.TransactionClient;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Writes an audit row. Accepts an optional transaction client so callers
   * can record the audit entry atomically with the flag mutation it
   * describes — the audit trail must never observably lag or miss a change.
   */
  async record(params: RecordAuditParams, tx: PrismaTx | PrismaService = this.prisma) {
    return tx.auditLog.create({
      data: {
        tenantId: params.tenantId,
        flagId: params.flagId,
        environmentId: params.environmentId,
        action: params.action,
        changedBy: params.changedBy,
        previousValue: params.previousValue ?? Prisma.JsonNull,
        newValue: params.newValue ?? Prisma.JsonNull,
      },
    });
  }

  async historyForFlag(tenantId: string, flagId: string) {
    return this.prisma.auditLog.findMany({
      where: { tenantId, flagId },
      orderBy: { createdAt: 'desc' },
      include: { environment: { select: { name: true } } },
    });
  }
}
