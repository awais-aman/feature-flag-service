import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';

@Controller('api/v1/tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  // Intentionally unauthenticated — this is the bootstrap endpoint that mints
  // a tenant's first API key. In a real deployment this would sit behind a
  // platform-admin key or an internal-only network path; documented as a
  // scope trade-off in the README rather than built out here.
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateTenantDto) {
    return this.tenantsService.create(dto);
  }
}
