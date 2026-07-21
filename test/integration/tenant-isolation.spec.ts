import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Runs against a real Postgres + Redis (see docker-compose.yml) rather than
 * mocks — tenant isolation is exactly the kind of guarantee that's easy to
 * get right against an in-memory fake and wrong against the real row-level
 * query, so this exercises the actual Prisma queries and guards end to end.
 */
describe('Tenant isolation & environment scoping (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerTenant(name: string) {
    const res = await request(app.getHttpServer()).post('/api/v1/tenants').send({ name }).expect(201);
    return res.body as { id: string; apiKey: string };
  }

  it('rejects requests with no API key', async () => {
    const tenant = await registerTenant('No Key Co');
    await request(app.getHttpServer()).get(`/api/v1/tenants/${tenant.id}/flags`).expect(401);
  });

  it('rejects requests with an invalid API key', async () => {
    const tenant = await registerTenant('Bad Key Co');
    await request(app.getHttpServer())
      .get(`/api/v1/tenants/${tenant.id}/flags`)
      .set('X-API-Key', 'ffk_totally-invalid')
      .expect(401);
  });

  it("prevents tenant A from reading tenant B's flags via tenant B's URL", async () => {
    const tenantA = await registerTenant('Tenant A');
    const tenantB = await registerTenant('Tenant B');

    await request(app.getHttpServer())
      .post(`/api/v1/tenants/${tenantB.id}/flags`)
      .set('X-API-Key', tenantB.apiKey)
      .send({ key: 'secret-flag', name: 'Secret Flag', type: 'BOOLEAN', defaultValue: false })
      .expect(201);

    // Tenant A's key against Tenant B's tenantId in the URL must be rejected
    await request(app.getHttpServer())
      .get(`/api/v1/tenants/${tenantB.id}/flags`)
      .set('X-API-Key', tenantA.apiKey)
      .expect(403);
  });

  it("prevents tenant A from evaluating tenant B's flags by spoofing tenant_id in the body", async () => {
    const tenantA = await registerTenant('Tenant C');
    const tenantB = await registerTenant('Tenant D');

    await request(app.getHttpServer())
      .post(`/api/v1/tenants/${tenantB.id}/flags`)
      .set('X-API-Key', tenantB.apiKey)
      .send({ key: 'other-flag', name: 'Other Flag', type: 'BOOLEAN', defaultValue: true })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/evaluate')
      .set('X-API-Key', tenantA.apiKey) // tenant A's key...
      .send({
        tenant_id: tenantB.id, // ...but claiming to evaluate as tenant B
        environment: 'development',
        user_id: 'user-1',
        flag_key: 'other-flag',
      })
      .expect(403);
  });

  it('scopes a flag toggle to one environment: enabling in development does not affect production', async () => {
    const tenant = await registerTenant('Env Scoping Co');

    await request(app.getHttpServer())
      .post(`/api/v1/tenants/${tenant.id}/flags`)
      .set('X-API-Key', tenant.apiKey)
      .send({ key: 'env-scoped-flag', name: 'Env Scoped Flag', type: 'BOOLEAN', defaultValue: false })
      .expect(201);

    await request(app.getHttpServer())
      .put(`/api/v1/tenants/${tenant.id}/flags/env-scoped-flag?environment=development`)
      .set('X-API-Key', tenant.apiKey)
      .send({ enabled: true, rolloutPercentage: 100 })
      .expect(200);

    const devResult = await request(app.getHttpServer())
      .post('/api/v1/evaluate')
      .set('X-API-Key', tenant.apiKey)
      .send({
        tenant_id: tenant.id,
        environment: 'development',
        user_id: 'user-1',
        flag_key: 'env-scoped-flag',
      })
      .expect(200);
    expect(devResult.body.value).toBe(true);

    const prodResult = await request(app.getHttpServer())
      .post('/api/v1/evaluate')
      .set('X-API-Key', tenant.apiKey)
      .send({
        tenant_id: tenant.id,
        environment: 'production',
        user_id: 'user-1',
        flag_key: 'env-scoped-flag',
      })
      .expect(200);
    expect(prodResult.body.value).toBe(false);
    expect(prodResult.body.reason).toBe('flag_disabled');
  });

  it('records an immutable audit trail entry for every flag mutation', async () => {
    const tenant = await registerTenant('Audit Co');

    await request(app.getHttpServer())
      .post(`/api/v1/tenants/${tenant.id}/flags`)
      .set('X-API-Key', tenant.apiKey)
      .send({ key: 'audited-flag', name: 'Audited Flag', type: 'BOOLEAN', defaultValue: false })
      .expect(201);

    await request(app.getHttpServer())
      .put(`/api/v1/tenants/${tenant.id}/flags/audited-flag?environment=staging`)
      .set('X-API-Key', tenant.apiKey)
      .send({ enabled: true, rolloutPercentage: 50 })
      .expect(200);

    const history = await request(app.getHttpServer())
      .get(`/api/v1/tenants/${tenant.id}/flags/audited-flag/history`)
      .set('X-API-Key', tenant.apiKey)
      .expect(200);

    expect(history.body.length).toBeGreaterThanOrEqual(2);
    const actions = history.body.map((h: { action: string }) => h.action);
    expect(actions).toContain('FLAG_CREATE');
    expect(actions).toContain('ENV_CONFIG_UPDATE');

    // append-only: Prisma client has no update/delete call sites for AuditLog
    // in the codebase, and a DB-level trigger enforces it even against a
    // direct SQL client — verified here by attempting a raw UPDATE and
    // expecting the database itself to reject it.
    const firstAuditId = history.body[0].id as string;
    await expect(
      prisma.$executeRaw`UPDATE audit_logs SET "changedBy" = 'tampered' WHERE id = ${firstAuditId}`,
    ).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRaw`DELETE FROM audit_logs WHERE id = ${firstAuditId}`).rejects.toThrow(
      /append-only/,
    );
  });
});
