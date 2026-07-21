import http from 'k6/http';
import { check } from 'k6';
import { Trend } from 'k6/metrics';

// Usage:
//   k6 run test/load/evaluate-load-test.js
//   k6 run -e BASE_URL=https://<cloud-run-url> test/load/evaluate-load-test.js
//
// Exercises the hot path a client SDK actually hammers: POST /evaluate for a
// single boolean flag under a 50%-ish rollout, across many distinct user ids
// so the deterministic hashing does real work rather than hitting one cached
// bucket over and over.
//
// Traffic is spread across TENANT_COUNT tenants (round-robined by VU), not
// hammered against a single tenant. /evaluate is rate-limited per tenant
// (see TenantThrottlerGuard) specifically to stop one noisy tenant from
// starving others — a single-tenant benchmark would mostly measure that
// limiter kicking in rather than the evaluation engine's real capacity. This
// mirrors how the service is actually used: many tenants, each within their
// own fair-use budget, adding up to the aggregate load below.

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TENANT_COUNT = Number(__ENV.TENANT_COUNT || 20);

const evaluationLatency = new Trend('evaluation_latency_ms', true);

export const options = {
  scenarios: {
    ramping_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },
        { duration: '1m', target: 100 },
        { duration: '2m', target: 100 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    evaluation_latency_ms: ['p(50)<50', 'p(95)<150', 'p(99)<300'],
  },
};

export function setup() {
  const tenants = [];

  for (let i = 0; i < TENANT_COUNT; i++) {
    const tenantRes = http.post(
      `${BASE_URL}/api/v1/tenants`,
      JSON.stringify({ name: `k6-load-test-${Date.now()}-${i}` }),
      { headers: { 'Content-Type': 'application/json' } },
    );
    check(tenantRes, { 'tenant created': (r) => r.status === 201 });
    const tenant = tenantRes.json();

    const flagRes = http.post(
      `${BASE_URL}/api/v1/tenants/${tenant.id}/flags`,
      JSON.stringify({
        key: 'load-test-flag',
        name: 'Load Test Flag',
        type: 'BOOLEAN',
        defaultValue: false,
      }),
      { headers: { 'Content-Type': 'application/json', 'X-API-Key': tenant.apiKey } },
    );
    check(flagRes, { 'flag created': (r) => r.status === 201 });

    const enableRes = http.put(
      `${BASE_URL}/api/v1/tenants/${tenant.id}/flags/load-test-flag?environment=production`,
      JSON.stringify({ enabled: true, rolloutPercentage: 50 }),
      { headers: { 'Content-Type': 'application/json', 'X-API-Key': tenant.apiKey } },
    );
    check(enableRes, { 'flag enabled': (r) => r.status === 200 });

    tenants.push({ tenantId: tenant.id, apiKey: tenant.apiKey });
  }

  return { tenants };
}

export default function (data) {
  const tenant = data.tenants[__VU % data.tenants.length];
  const userId = `k6-user-${__VU}-${__ITER}`;
  const res = http.post(
    `${BASE_URL}/api/v1/evaluate`,
    JSON.stringify({
      tenant_id: tenant.tenantId,
      environment: 'production',
      user_id: userId,
      flag_key: 'load-test-flag',
    }),
    { headers: { 'Content-Type': 'application/json', 'X-API-Key': tenant.apiKey } },
  );

  evaluationLatency.add(res.timings.duration);
  check(res, {
    'status is 200': (r) => r.status === 200,
    'has boolean value': (r) => typeof r.json('value') === 'boolean',
  });
}
