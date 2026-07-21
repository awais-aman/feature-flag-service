import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Registry } from 'prom-client';

/**
 * Exposes Prometheus-format metrics at GET /metrics rather than writing
 * directly to the Cloud Monitoring API from application code. In the GCP
 * deployment this endpoint is scraped by Google Cloud Managed Service for
 * Prometheus (or an OpenTelemetry Collector sidecar), which forwards the
 * series into Cloud Monitoring — the app stays cloud-agnostic and testable
 * locally with zero GCP credentials, and the dashboards/alerts described in
 * the README are built against these exact metric names. See README
 * "Observability".
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly evaluationLatencyMs = new Histogram({
    name: 'flag_evaluation_latency_ms',
    help: 'Latency of flag evaluation requests in milliseconds',
    labelNames: ['tenant_id', 'endpoint'] as const,
    buckets: [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000],
    registers: [this.registry],
  });

  readonly evaluationsTotal = new Counter({
    name: 'flag_evaluations_total',
    help: 'Total number of flag evaluations performed',
    labelNames: ['tenant_id'] as const,
    registers: [this.registry],
  });

  readonly httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests, labeled by outcome',
    labelNames: ['tenant_id', 'endpoint', 'status_class'] as const,
    registers: [this.registry],
  });

  readonly cacheLookupsTotal = new Counter({
    name: 'flag_config_cache_lookups_total',
    help: 'Flag config cache lookups, labeled by hit/miss',
    labelNames: ['result'] as const, // 'hit' | 'miss'
    registers: [this.registry],
  });

  recordCacheLookup(hit: boolean): void {
    this.cacheLookupsTotal.inc({ result: hit ? 'hit' : 'miss' });
  }

  recordEvaluation(tenantId: string, endpoint: string, durationMs: number): void {
    this.evaluationLatencyMs.observe({ tenant_id: tenantId, endpoint }, durationMs);
    this.evaluationsTotal.inc({ tenant_id: tenantId });
  }

  recordHttpRequest(tenantId: string | undefined, endpoint: string, statusCode: number): void {
    const statusClass = `${Math.floor(statusCode / 100)}xx`;
    this.httpRequestsTotal.inc({
      tenant_id: tenantId ?? 'unauthenticated',
      endpoint,
      status_class: statusClass,
    });
  }
}
