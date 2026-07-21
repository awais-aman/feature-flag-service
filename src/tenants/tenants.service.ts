import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentName, AuditAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { generateApiKey, hashApiKey, apiKeyPrefix } from '../common/utils/api-key.util';
import { CreateTenantDto } from './dto/create-tenant.dto';

const DEFAULT_ENVIRONMENTS: EnvironmentName[] = [
  EnvironmentName.development,
  EnvironmentName.staging,
  EnvironmentName.production,
];

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async create(dto: CreateTenantDto) {
    const rawApiKey = generateApiKey();
    const pepper = this.config.getOrThrow<string>('API_KEY_PEPPER');

    const tenant = await this.prisma.$transaction(async (tx) => {
      const created = await tx.tenant.create({
        data: {
          name: dto.name,
          slug: slugify(dto.name),
          apiKeyHash: hashApiKey(rawApiKey, pepper),
          apiKeyPrefix: apiKeyPrefix(rawApiKey),
          environments: {
            create: DEFAULT_ENVIRONMENTS.map((name) => ({ name })),
          },
        },
        include: { environments: true },
      });

      await tx.auditLog.create({
        data: {
          tenantId: created.id,
          action: AuditAction.TENANT_CREATE,
          changedBy: 'system',
          newValue: { name: created.name, slug: created.slug },
        },
      });

      return created;
    });

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      environments: tenant.environments.map((e) => e.name),
      apiKey: rawApiKey, // returned exactly once — not recoverable after this response
      createdAt: tenant.createdAt,
    };
  }

  async findByIdOrThrow(id: string) {
    return this.prisma.tenant.findUniqueOrThrow({ where: { id } });
  }
}
