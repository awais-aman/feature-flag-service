import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { hashApiKey } from '../utils/api-key.util';
import { RequestWithTenant } from '../types/request-with-tenant';

/**
 * Authenticates a request via the `X-API-Key` header. On success, attaches
 * the resolved Tenant to `request.tenant` for downstream guards/handlers.
 * This is the sole authentication mechanism in scope — every endpoint under
 * /api/v1 except POST /tenants (which mints the first key) requires it.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithTenant>();
    const rawKey = request.headers['x-api-key'];

    if (!rawKey || Array.isArray(rawKey)) {
      throw new UnauthorizedException('Missing X-API-Key header');
    }

    const pepper = this.config.getOrThrow<string>('API_KEY_PEPPER');
    const apiKeyHash = hashApiKey(rawKey, pepper);

    const tenant = await this.prisma.tenant.findUnique({ where: { apiKeyHash } });

    if (!tenant || tenant.archivedAt) {
      throw new UnauthorizedException('Invalid API key');
    }

    request.tenant = tenant;
    return true;
  }
}
