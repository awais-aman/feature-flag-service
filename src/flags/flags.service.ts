import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditAction, EnvironmentName, FlagType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FlagChangedEvent, FLAG_CHANGED_EVENT } from '../common/events/flag-changed.event';
import { CreateFlagDto } from './dto/create-flag.dto';
import { UpdateFlagDto } from './dto/update-flag.dto';
import { FlagStatusFilter, ListFlagsQueryDto } from './dto/list-flags-query.dto';

function assertDefaultValueMatchesType(type: FlagType, value: unknown) {
  if (type === FlagType.BOOLEAN && typeof value !== 'boolean') {
    throw new BadRequestException('defaultValue must be a boolean for type BOOLEAN');
  }
  if (type === FlagType.NUMBER && typeof value !== 'number') {
    throw new BadRequestException('defaultValue must be a number for type NUMBER');
  }
  if (type === FlagType.STRING && typeof value !== 'string') {
    throw new BadRequestException('defaultValue must be a string for type STRING');
  }
}

@Injectable()
export class FlagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  async create(tenantId: string, dto: CreateFlagDto, changedBy: string) {
    assertDefaultValueMatchesType(dto.type, dto.defaultValue);

    const environments = await this.prisma.environment.findMany({ where: { tenantId } });
    if (environments.length === 0) {
      throw new NotFoundException('Tenant has no environments provisioned');
    }

    const existing = await this.prisma.featureFlag.findUnique({
      where: { tenantId_key: { tenantId, key: dto.key } },
    });
    if (existing) {
      throw new ConflictException(`Flag with key "${dto.key}" already exists for this tenant`);
    }

    const flag = await this.prisma.$transaction(async (tx) => {
      const created = await tx.featureFlag.create({
        data: {
          tenantId,
          key: dto.key,
          name: dto.name,
          description: dto.description,
          type: dto.type,
          defaultValue: dto.defaultValue as Prisma.InputJsonValue,
          environmentConfigs: {
            // Every flag starts disabled/0% in every environment — an
            // explicit opt-in step is always required before a flag can
            // affect real users, in any environment including production.
            create: environments.map((env) => ({ environmentId: env.id })),
          },
        },
        include: { environmentConfigs: true },
      });

      await this.audit.record(
        {
          tenantId,
          flagId: created.id,
          action: AuditAction.FLAG_CREATE,
          changedBy,
          newValue: {
            key: created.key,
            name: created.name,
            type: created.type,
            defaultValue: dto.defaultValue as Prisma.InputJsonValue,
          },
        },
        tx,
      );

      return created;
    });

    // Emitted after commit, not from inside the transaction, so a listener
    // (cache invalidation, SSE) never reacts to a change that later rolled back.
    this.events.emit(FLAG_CHANGED_EVENT, new FlagChangedEvent(tenantId, flag.key));
    return flag;
  }

  async list(tenantId: string, query: ListFlagsQueryDto) {
    const flags = await this.prisma.featureFlag.findMany({
      where: {
        tenantId,
        archivedAt:
          query.status === FlagStatusFilter.ARCHIVED
            ? { not: null }
            : query.status === FlagStatusFilter.ACTIVE
              ? null
              : undefined,
      },
      include: {
        environmentConfigs: {
          where: query.environment ? { environment: { name: query.environment } } : undefined,
          include: { environment: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return flags;
  }

  private async findOwnedFlagOrThrow(
    tenantId: string,
    flagKey: string,
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    const flag = await client.featureFlag.findUnique({
      where: { tenantId_key: { tenantId, key: flagKey } },
      include: { environmentConfigs: { include: { environment: true } } },
    });
    if (!flag) {
      throw new NotFoundException(`Flag "${flagKey}" not found`);
    }
    return flag;
  }

  async update(
    tenantId: string,
    flagKey: string,
    environment: EnvironmentName | undefined,
    dto: UpdateFlagDto,
    changedBy: string,
  ) {
    const flag = await this.findOwnedFlagOrThrow(tenantId, flagKey);

    const hasEnvFields =
      dto.enabled !== undefined ||
      dto.rolloutPercentage !== undefined ||
      dto.variants !== undefined ||
      dto.targetingRules !== undefined;

    if (hasEnvFields && !environment) {
      throw new BadRequestException(
        '?environment= query param is required when updating enabled, rolloutPercentage, variants, or targetingRules',
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      let updatedFlag = flag;

      const flagLevelChanges: Prisma.FeatureFlagUpdateInput = {};
      if (dto.name !== undefined) flagLevelChanges.name = dto.name;
      if (dto.description !== undefined) flagLevelChanges.description = dto.description;
      if (dto.defaultValue !== undefined) {
        assertDefaultValueMatchesType(flag.type, dto.defaultValue);
        flagLevelChanges.defaultValue = dto.defaultValue as Prisma.InputJsonValue;
      }

      if (Object.keys(flagLevelChanges).length > 0) {
        const previousValue = {
          name: flag.name,
          description: flag.description,
          defaultValue: flag.defaultValue,
        };
        updatedFlag = await tx.featureFlag.update({
          where: { id: flag.id },
          data: flagLevelChanges,
          include: { environmentConfigs: { include: { environment: true } } },
        });
        await this.audit.record(
          {
            tenantId,
            flagId: flag.id,
            action: AuditAction.FLAG_UPDATE,
            changedBy,
            previousValue,
            newValue: flagLevelChanges as Prisma.InputJsonValue,
          },
          tx,
        );
      }

      if (hasEnvFields && environment) {
        const envConfig = updatedFlag.environmentConfigs.find((c) => c.environment.name === environment);
        if (!envConfig) {
          throw new NotFoundException(`Environment "${environment}" not found for this tenant`);
        }

        const previousValue = {
          enabled: envConfig.enabled,
          rolloutPercentage: envConfig.rolloutPercentage,
          variants: envConfig.variants,
          targetingRules: envConfig.targetingRules,
        };

        const envChanges: Prisma.FlagEnvironmentConfigUpdateInput = {};
        if (dto.enabled !== undefined) envChanges.enabled = dto.enabled;
        if (dto.rolloutPercentage !== undefined) envChanges.rolloutPercentage = dto.rolloutPercentage;
        if (dto.variants !== undefined)
          envChanges.variants = dto.variants as unknown as Prisma.InputJsonValue;
        if (dto.targetingRules !== undefined)
          envChanges.targetingRules = dto.targetingRules as Prisma.InputJsonValue;

        await tx.flagEnvironmentConfig.update({
          where: { id: envConfig.id },
          data: envChanges,
        });

        await this.audit.record(
          {
            tenantId,
            flagId: flag.id,
            environmentId: envConfig.environmentId,
            action: AuditAction.ENV_CONFIG_UPDATE,
            changedBy,
            previousValue,
            newValue: envChanges as Prisma.InputJsonValue,
          },
          tx,
        );
      }

      return this.findOwnedFlagOrThrow(tenantId, flagKey, tx);
    });

    this.events.emit(FLAG_CHANGED_EVENT, new FlagChangedEvent(tenantId, flagKey, environment));
    return result;
  }

  async archive(tenantId: string, flagKey: string, changedBy: string) {
    const flag = await this.findOwnedFlagOrThrow(tenantId, flagKey);
    if (flag.archivedAt) {
      return flag;
    }

    const archived = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.featureFlag.update({
        where: { id: flag.id },
        data: { archivedAt: new Date() },
      });

      await this.audit.record(
        {
          tenantId,
          flagId: flag.id,
          action: AuditAction.FLAG_ARCHIVE,
          changedBy,
          previousValue: { archivedAt: null },
          newValue: { archivedAt: updated.archivedAt?.toISOString() },
        },
        tx,
      );

      return updated;
    });

    this.events.emit(FLAG_CHANGED_EVENT, new FlagChangedEvent(tenantId, flagKey));
    return archived;
  }

  async history(tenantId: string, flagKey: string) {
    const flag = await this.findOwnedFlagOrThrow(tenantId, flagKey);
    return this.audit.historyForFlag(tenantId, flag.id);
  }
}
