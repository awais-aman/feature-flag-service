import { get, IncomingMessage } from 'http';
import { AddressInfo } from 'net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Flag lifecycle (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(app.getHttpServer());

  async function tenantWithFlag(name: string, flag: Record<string, unknown>) {
    const tenant = (await api().post('/api/v1/tenants').send({ name }).expect(201)).body as {
      id: string;
      apiKey: string;
    };
    await api()
      .post(`/api/v1/tenants/${tenant.id}/flags`)
      .set('X-API-Key', tenant.apiKey)
      .send(flag)
      .expect(201);
    return tenant;
  }

  function evaluate(tenant: { id: string; apiKey: string }, flagKey: string, environment = 'production') {
    return api()
      .post('/api/v1/evaluate')
      .set('X-API-Key', tenant.apiKey)
      .send({ tenant_id: tenant.id, environment, user_id: 'user-1', flag_key: flagKey });
  }

  it('stops serving an archived flag from the single-flag endpoint, even when cached', async () => {
    const tenant = await tenantWithFlag('Archive Co', {
      key: 'old-banner',
      name: 'Old Banner',
      type: 'BOOLEAN',
      defaultValue: false,
    });

    await evaluate(tenant, 'old-banner').expect(200);
    await api()
      .delete(`/api/v1/tenants/${tenant.id}/flags/old-banner`)
      .set('X-API-Key', tenant.apiKey)
      .expect(200);

    await evaluate(tenant, 'old-banner').expect(404);
    const bulk = await api()
      .post('/api/v1/evaluate/bulk')
      .set('X-API-Key', tenant.apiKey)
      .send({ tenant_id: tenant.id, environment: 'production', user_id: 'user-1' })
      .expect(200);
    expect(bulk.body.flags).toEqual({});
  });

  it('invalidates every environment when defaultValue changes alongside ?environment=', async () => {
    const tenant = await tenantWithFlag('Default Co', {
      key: 'page-size',
      name: 'Page size',
      type: 'NUMBER',
      defaultValue: 20,
    });

    expect((await evaluate(tenant, 'page-size', 'staging').expect(200)).body.value).toBe(20);

    await api()
      .put(`/api/v1/tenants/${tenant.id}/flags/page-size?environment=production`)
      .set('X-API-Key', tenant.apiKey)
      .send({ defaultValue: 50, enabled: true })
      .expect(200);

    expect((await evaluate(tenant, 'page-size', 'staging').expect(200)).body.value).toBe(50);
  });

  it('accepts weighted variants on a STRING flag and serves one of them', async () => {
    const tenant = await tenantWithFlag('Variant Co', {
      key: 'checkout-copy',
      name: 'Checkout copy',
      type: 'STRING',
      defaultValue: 'control',
    });

    await api()
      .put(`/api/v1/tenants/${tenant.id}/flags/checkout-copy?environment=production`)
      .set('X-API-Key', tenant.apiKey)
      .send({
        enabled: true,
        rolloutPercentage: 100,
        variants: [
          { value: 'short', weight: 1 },
          { value: 'long', weight: 1 },
        ],
      })
      .expect(200);

    const result = (await evaluate(tenant, 'checkout-copy').expect(200)).body;
    expect(['short', 'long']).toContain(result.value);
    expect(result.reason).toBe('percentage_rollout');
  });

  it('rejects variants on a non-STRING flag and variant values of the wrong type', async () => {
    const tenant = await tenantWithFlag('Bad Variant Co', {
      key: 'dark-mode',
      name: 'Dark mode',
      type: 'BOOLEAN',
      defaultValue: false,
    });
    await api()
      .put(`/api/v1/tenants/${tenant.id}/flags/dark-mode?environment=production`)
      .set('X-API-Key', tenant.apiKey)
      .send({ variants: [{ value: 'on', weight: 1 }] })
      .expect(400);

    await api()
      .post(`/api/v1/tenants/${tenant.id}/flags`)
      .set('X-API-Key', tenant.apiKey)
      .send({ key: 'headline', name: 'Headline', type: 'STRING', defaultValue: 'a' })
      .expect(201);
    await api()
      .put(`/api/v1/tenants/${tenant.id}/flags/headline?environment=production`)
      .set('X-API-Key', tenant.apiKey)
      .send({ variants: [{ value: 42, weight: 1 }] })
      .expect(400);
  });

  it('rejects an unknown environment instead of reporting a missing flag', async () => {
    const tenant = await tenantWithFlag('Env Typo Co', {
      key: 'beta',
      name: 'Beta',
      type: 'BOOLEAN',
      defaultValue: false,
    });
    await api()
      .put(`/api/v1/tenants/${tenant.id}/flags/beta?environment=prod`)
      .set('X-API-Key', tenant.apiKey)
      .send({ enabled: true })
      .expect(400);
    await api()
      .get(`/api/v1/tenants/${tenant.id}/environments/prod/stream`)
      .set('X-API-Key', tenant.apiKey)
      .expect(400);
  });

  it('answers a duplicate flag key with 409, including concurrent creates', async () => {
    const tenant = await tenantWithFlag('Dup Co', {
      key: 'dup',
      name: 'Dup',
      type: 'BOOLEAN',
      defaultValue: false,
    });
    const body = { key: 'race', name: 'Race', type: 'BOOLEAN', defaultValue: false };
    const create = () =>
      api().post(`/api/v1/tenants/${tenant.id}/flags`).set('X-API-Key', tenant.apiKey).send(body);

    const statuses = (await Promise.all([create(), create(), create()])).map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409, 409]);
  });

  it('pushes a change event to SSE subscribers of the affected environment only', async () => {
    const tenant = await tenantWithFlag('Stream Co', {
      key: 'live-flag',
      name: 'Live flag',
      type: 'BOOLEAN',
      defaultValue: false,
    });
    await app.listen(0);
    const { port } = app.getHttpServer().address() as AddressInfo;

    const subscribe = (environment: string) =>
      new Promise<IncomingMessage>((resolve) =>
        get(
          {
            port,
            path: `/api/v1/tenants/${tenant.id}/environments/${environment}/stream`,
            headers: { 'X-API-Key': tenant.apiKey },
          },
          resolve,
        ),
      );
    const [production, staging] = await Promise.all([subscribe('production'), subscribe('staging')]);
    const received: Record<string, string> = { production: '', staging: '' };
    production.on('data', (chunk) => (received.production += chunk));
    staging.on('data', (chunk) => (received.staging += chunk));

    await api()
      .put(`/api/v1/tenants/${tenant.id}/flags/live-flag?environment=production`)
      .set('X-API-Key', tenant.apiKey)
      .send({ enabled: true, rolloutPercentage: 25 })
      .expect(200);
    await new Promise((resolve) => setTimeout(resolve, 200));
    production.destroy();
    staging.destroy();

    expect(received.production).toContain('data: {"flagKey":"live-flag","environment":"production"}');
    expect(received.staging).not.toContain('live-flag');
  });
});
