import { MetricsService } from '../../src/metrics/metrics.service';

describe('MetricsService exposition', () => {
  it('renders every documented series in Prometheus text format', async () => {
    const metrics = new MetricsService();
    metrics.recordEvaluation('tenant-1', 'evaluate', 3.2);
    metrics.recordCacheLookup(true);
    metrics.recordCacheLookup(false);
    metrics.recordHttpRequest(undefined, 'POST /api/v1/tenants', 201);

    const text = await metrics.registry.metrics();

    expect(text).toContain('# TYPE flag_evaluation_latency_ms histogram');
    expect(text).toContain(
      'flag_evaluation_latency_ms_bucket{le="5",tenant_id="tenant-1",endpoint="evaluate"} 1',
    );
    expect(text).toContain('flag_evaluations_total{tenant_id="tenant-1"} 1');
    expect(text).toContain('flag_config_cache_lookups_total{result="hit"} 1');
    expect(text).toContain('flag_config_cache_lookups_total{result="miss"} 1');
    expect(text).toContain(
      'http_requests_total{tenant_id="unauthenticated",endpoint="POST /api/v1/tenants",status_class="2xx"} 1',
    );
  });

  it('keeps registries separate per instance so tests and app modules do not collide', async () => {
    const a = new MetricsService();
    const b = new MetricsService();
    a.recordCacheLookup(true);
    expect(await b.registry.metrics()).not.toContain('result="hit"} 1');
  });
});
