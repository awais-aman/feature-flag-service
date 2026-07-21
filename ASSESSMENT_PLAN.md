# Take-Home Assessment: Multi-Tenant Config & Feature Flag Service

## What We're Building

A **production-grade feature flag service** (think simplified LaunchDarkly) that:
- Manages flags across multiple applications (tenants) in isolated environments (dev/staging/prod)
- Evaluates flags deterministically for users (same user → same flag value, always)
- Uses percentage-based rollouts with consistent hashing
- Maintains immutable audit trails
- Distributes config changes in real-time (bonus)

**Split:** 50% backend engineering, 50% platform/DevOps/infrastructure

---

## Assessment Requirements Overview

### Core Functional Features

**Backend:**
1. **Tenant Management** — Register apps, manage API keys
2. **Feature Flag CRUD** — Create/read/update/delete flags with types (boolean, string, number)
3. **Flag Evaluation Engine** ⭐ (Critical)
   - Single: `/api/v1/evaluate` → return flag value for a user
   - Bulk: `/api/v1/evaluate/bulk` → evaluate all flags at once
   - **Deterministic:** `hash(flag_key + user_id) % 100` must always give same result
   - Percentage rollouts: "roll out to 30% of users"
4. **Audit Trail** — Immutable log of every flag change (who, what, when, previous value)
5. **Real-Time Delivery** (Bonus) — SSE/WebSocket push changes to clients

**Platform/DevOps:**
1. **Infrastructure-as-Code (Terraform)** — Provision all GCP resources via code (no console clicks)
2. **Containerization** — Multi-stage Docker build, docker-compose for local dev
3. **Zero-Downtime Deployment** — Blue-green or canary on Cloud Run/GKE
4. **CI/CD Pipeline (GitHub Actions)** — Lint → Test → Build → Push → Deploy with traffic splitting
5. **Observability** — Structured logging, custom metrics, dashboards, alerts
6. **Security** — API key auth, rate limiting, Secret Manager, least-privilege IAM

**Testing:**
- Unit tests for the evaluation engine (hashing, rollout math, type handling)
- Integration tests for tenant isolation
- Load tests (k6/Artillery) showing throughput + latency under concurrent load

---

## Tech Stack Recommendation

| Layer | Choice | Why |
|-------|--------|-----|
| **Backend** | Node.js/TypeScript + NestJS | Excellent for multi-tenancy (guards, interceptors); strong async/I/O; good ecosystem |
| **Database** | PostgreSQL (Cloud SQL) | Reliable, ACID guarantees for audit logs, fast for eval queries |
| **Cache** | Redis (Memorystore) | Sub-ms evaluation cache hit, ideal for flag distribution |
| **ORM** | Prisma | TypeScript-first, migrations, type-safe queries |
| **Deployment** | Cloud Run (serverless) | Auto-scaling, built-in traffic splitting, simple blue-green, cost-effective |
| **IaC** | Terraform | Modular, reusable, GCP best-practice, state locking |
| **CI/CD** | GitHub Actions | Built-in, free, easy traffic splitting config |
| **Observability** | GCP Cloud Monitoring + Winston/Pino | Structured JSON logs, custom metrics, native dashboards |
| **Testing** | Jest + k6 | Unit/integration tests + load test scripts |

**Why NOT alternatives:**
- ❌ Express over NestJS: NestJS guards/interceptors make multi-tenancy cleaner
- ❌ GKE over Cloud Run: Cloud Run is simpler, faster to deploy, still production-grade
- ❌ Lambda: GCP context, plus you'd need more orchestration
- ❌ Datastore over PostgreSQL: Need ACID for audit trail, SQL for reporting

---

## Database Schema (Preview)

```sql
-- Tenants (applications using the service)
tenants
  ├─ id (UUID)
  ├─ name (string)
  ├─ api_key_hash (hashed, searchable)
  └─ created_at, archived_at

-- Environments per tenant
environments
  ├─ id (UUID)
  ├─ tenant_id (FK)
  ├─ name (dev, staging, prod)
  └─ unique(tenant_id, name)

-- Feature flags
feature_flags
  ├─ id (UUID)
  ├─ tenant_id (FK) ← tenant isolation
  ├─ key (string, unique per tenant)
  ├─ name, description
  ├─ type (boolean, string, number)
  ├─ default_value
  ├─ enabled (boolean)
  ├─ rollout_percentage (0-100)
  └─ created_at, updated_at, archived_at

-- Immutable audit logs (append-only)
audit_logs
  ├─ id (UUID)
  ├─ tenant_id (FK)
  ├─ flag_id (FK)
  ├─ action (create, update, delete)
  ├─ changed_by (who)
  ├─ previous_value (JSON)
  ├─ new_value (JSON)
  └─ timestamp (indexed for fast history queries)

-- Cache evaluation results (optional, Redis used instead)
-- or use Redis with key: flag_eval:{tenant}:{env}:{flag_key}:{context_hash}
```

---

## Implementation Strategy: Byte-by-Byte

### Phase 1: System Design & Setup (1.5-2 hrs)

**What:**
- Database schema finalization
- API endpoint design (request/response shapes)
- Data flow diagrams
- IaC resource planning

**Output:**
- ERD diagram
- API spec (endpoints, status codes)
- Terraform resource list

---

### Phase 2: Backend Core - Tenant & Flag CRUD (2-2.5 hrs)

**What:**
- NestJS project setup (modules, guards, interceptors)
- Database migrations (Prisma)
- Tenant management endpoints (register, API key generation)
- Feature flag CRUD endpoints
- API key auth middleware (verify tenant on every request)

**Key Decisions:**
- ✅ API key as bearer token or custom header? → Custom header `X-API-Key` for clarity
- ✅ How to hash API keys? → Bcrypt with salt (stored in DB, never plain text)
- ✅ Validate tenant_id in URL matches authenticated tenant? → Yes, in a guard

**Output:**
- POST /api/v1/tenants (register)
- POST/GET/PUT/DELETE /api/v1/tenants/{id}/flags (CRUD)
- GET /api/v1/tenants/{id}/flags (list with env/status filters)

---

### Phase 3: Flag Evaluation Engine ⭐ (1.5-2 hrs)

**What:**
- Implement the deterministic evaluation algorithm
- Bulk evaluation endpoint
- Redis caching layer

**The Core Algorithm:**
```typescript
// Consistent hashing for deterministic rollouts
function hashUser(flagKey: string, userId: string): number {
  const combined = `${flagKey}:${userId}`;
  const hash = crypto.createHash('sha256').update(combined).digest();
  return (parseInt(hash.toString('hex').slice(0, 8), 16) % 100);
  // Result: 0-99
}

function evaluateFlag(flag, userId): boolean {
  const userBucket = hashUser(flag.key, userId);
  return userBucket < flag.rolloutPercentage;
  // If rollout_percentage = 30, users in buckets 0-29 get true
}
```

**Key Points:**
- ✅ Same user_id → same hash value (deterministic)
- ✅ Percentage rollout: if rollout_percentage=30, 30% of users (uniformly distributed) get true
- ✅ Cache in Redis: key is `eval:{tenant}:{env}:{flag_key}:{user_context_hash}`, TTL 5-10 min
- ✅ Bulk evaluation: return all flags for a user in one request

**Output:**
- POST /api/v1/evaluate (single)
- POST /api/v1/evaluate/bulk (multiple)
- Cache hit/miss metrics

---

### Phase 4: Audit Logging & Observability (1 hr)

**What:**
- Automatic audit trail on flag updates
- Structured JSON logging with correlation IDs
- Custom metrics (latency, error rate, cache ratio)

**Audit Flow:**
- On PUT /flags/{flag_key}, capture previous values
- Write immutable audit log entry
- No deletes, only soft-deletes (archived_at timestamp) with audit record

**Logging:**
- Winston/Pino with JSON formatter
- Every request gets a correlation ID (UUID)
- Log: request → processing → response with latency

**Metrics (to Cloud Monitoring):**
- `flag_evaluation_latency_ms` (histogram: p50, p95, p99)
- `evaluations_per_sec` (by tenant)
- `error_rate_percent` (by endpoint, by tenant)
- `cache_hit_ratio` (%)

---

### Phase 5: Containerization & Local Development (45 min)

**What:**
- Multi-stage Dockerfile (lightweight production build)
- docker-compose with API + PostgreSQL + Redis
- Health checks

**Dockerfile strategy:**
```
Stage 1 (builder): Install dependencies, compile TypeScript
Stage 2 (runtime): Copy only compiled app, node_modules; run as non-root
```

**docker-compose:**
```yaml
services:
  api:
    build: .
    ports: [3000:3000]
    env_file: .env.local
  postgres:
    image: postgres:16-alpine
    ports: [5432:5432]
  redis:
    image: redis:7-alpine
    ports: [6379:6379]
```

---

### Phase 6: Infrastructure-as-Code (Terraform) (1-1.5 hrs)

**What:**
- Provision GCP resources
- Modular, reusable Terraform
- Environment separation (dev/staging/prod)
- Least-privilege IAM

**Resources:**
```
GCP Project
├─ Cloud Run (API service, versioned, traffic splitting)
├─ Cloud SQL (PostgreSQL instance)
├─ Memorystore (Redis)
├─ Artifact Registry (container images)
├─ Secret Manager (API keys, DB credentials)
├─ Service Accounts (least-privilege per resource)
├─ VPC (if needed for private DB access)
└─ Cloud Monitoring (logging, metrics, dashboards)
```

**Terraform Structure:**
```
terraform/
├─ main.tf (provider, project setup)
├─ variables.tf (inputs: project_id, region, env)
├─ outputs.tf (deployed service URL, etc.)
├─ modules/
│  ├─ cloud_run/ (service deployment)
│  ├─ cloud_sql/ (PostgreSQL)
│  ├─ memorystore/ (Redis)
│  ├─ iam/ (service accounts, roles)
│  └─ monitoring/ (dashboards, alerts)
├─ environments/
│  ├─ dev.tfvars
│  ├─ staging.tfvars
│  └─ prod.tfvars
```

**Key IAM Rules:**
- Cloud Run service account: can pull from Artifact Registry, read Secret Manager, write to Cloud Logging
- Cloud SQL: can only be accessed from Cloud Run (via service account)
- Secret Manager: only Cloud Run service account can read

---

### Phase 7: CI/CD & Blue-Green Deployment (1.5 hrs)

**What:**
- GitHub Actions workflow (lint → test → build → deploy)
- Blue-green deployment strategy
- Automated rollback on health check failure

**GitHub Actions Flow:**
```
Trigger: git push to main (staging/prod branch)
  1. Lint (ESLint)
  2. Test (Jest unit + integration)
  3. Load test (k6) — optional, on-demand
  4. Build Docker image
  5. Push to Artifact Registry
  6. Deploy to Cloud Run (new revision)
  7. Health check (curl endpoint)
  8. If healthy: traffic shift (100% → new revision)
  9. If unhealthy: rollback (traffic → previous revision)
```

**Blue-Green Strategy on Cloud Run:**
```
Current state:
  Blue (v123) ← 100% traffic
  Green (v124) ← 0% traffic

Deploy:
  → Start green, run health checks
  → If healthy, shift traffic: blue ← 50%, green ← 50% (canary)
  → Monitor metrics for 2-3 min
  → If no errors, shift: blue ← 0%, green ← 100%
  → Keep blue for quick rollback
```

---

### Phase 8: Testing & Load Testing (1-1.5 hrs)

**Unit Tests (Jest):**
- ✅ Hashing algorithm: same input → same output, distribution uniform
- ✅ Rollout logic: percentage 30 → ~30% of users get true
- ✅ Type handling: boolean, string, number flags evaluate correctly
- ✅ Cache logic: hit, miss, TTL expiry

**Integration Tests (Jest):**
- ✅ Tenant isolation: tenant A cannot see tenant B's flags
- ✅ Environment scoping: dev flags don't leak to prod
- ✅ Audit trail: every update is logged, immutable
- ✅ API key auth: invalid key is rejected

**Load Test (k6):**
```javascript
// Simulate 100 concurrent users evaluating flags
// Measure: throughput (ops/sec), latency (p50, p95, p99)
import http from 'k6/http';

export const options = {
  vus: 100,          // 100 concurrent users
  duration: '5m',    // 5 minute test
};

export default function () {
  http.post('https://api.example.com/api/v1/evaluate', {
    tenant_id: '...',
    environment: 'production',
    user_id: 'user_' + __VU,
  });
}
```

**Test Coverage Target:**
- Evaluation engine: 95%+
- Audit logic: 100%
- API endpoints: 80%+
- CI integration: tests run on every push

---

### Phase 9: Observability Dashboard & Alerting (1 hr)

**Cloud Monitoring Dashboard:**
```
┌─────────────────────────────────────────┐
│ Feature Flag Service - Production       │
├─────────────────────────────────────────┤
│                                         │
│ Service Health              Error Rate  │
│ ✅ Running                   2.1%       │
│                                         │
│ Evaluation Latency (ms)  Cache Hit Rate │
│ p50:  2.1                 94.2%         │
│ p95:  8.5                              │
│ p99: 42.1                              │
│                                         │
│ Evaluations/sec    Requests by Tenant   │
│ 45.2k              Tenant-A: 32k/s      │
│                    Tenant-B: 13k/s      │
│                                         │
└─────────────────────────────────────────┘
```

**Alert Policies:**
1. Error rate > 5% for 5 min → Slack/PagerDuty
2. Evaluation latency p99 > 100ms → warn
3. Database CPU > 80% → warn
4. Deployment rollback triggered → critical alert

---

### Phase 10: Documentation & Polish (1-1.5 hrs)

**README Must Include:**
- Setup: `docker-compose up` → fully working locally
- Architecture: system diagram, data flow, design decisions
- API docs: example request/response for each endpoint
- Flag evaluation algorithm: explain hashing, rollout math, caching strategy
- Deployment: blue-green strategy, how to rollback, runbook
- Testing: what tests we have, load test results, coverage %
- GCP choices: why Cloud Run vs. GKE, why Memorystore for caching, etc.
- Trade-offs: what we cut for time, what we'd add with more time

---

## Deployment: YES, We Must Deploy to GCP

**Why:**
- Assessment explicitly requires: "Deployed application URL on GCP" in deliverables
- Tests your ability to provision, deploy, and operate (not just develop)
- Evaluators will actually test the live service

**Deployment Target: Cloud Run (Recommended)**
- ✅ Serverless (no VM management)
- ✅ Auto-scaling (handles traffic spikes)
- ✅ Built-in blue-green traffic splitting
- ✅ Fast deploys (minutes, not hours)
- ✅ Cost-effective (pay for execution time only)
- ✅ Integrated with GCP monitoring/logging

**GCP Free Tier:**
- $300 credits for new account
- Cloud Run: 2M free requests/month
- Cloud SQL: modest free tier
- Memorystore: ~free for small instance
- Should be able to run the entire demo on free tier

**Expected Cost for Deployment:**
- If running for 2-3 days: $0-10 (free tier + minimal charges)
- If running continuously: ~$50-100/month for this workload

---

## Time Allocation (8-10 hours total)

| Phase | Time | Notes |
|-------|------|-------|
| System Design + Setup | 1.5-2h | DB schema, API design, IaC plan |
| Backend Core (Tenant + CRUD) | 2-2.5h | NestJS modules, guards, API key auth |
| Evaluation Engine | 1.5-2h | Hashing algorithm, caching, bulk endpoint |
| Audit Logging + Observability | 1h | Immutable logs, structured logging, metrics |
| Docker + docker-compose | 45m | Multi-stage build, local dev setup |
| Terraform IaC | 1-1.5h | Modular, environment separation |
| CI/CD + Blue-Green | 1.5h | GitHub Actions, traffic splitting, rollback |
| Testing + Load Test | 1-1.5h | Unit, integration, k6 load test |
| Documentation + Polish | 1-1.5h | README, diagrams, API docs, trade-offs |
| **Total** | **~9-10h** | |

---

## What's NOT Required (Save Time)

- Real-time distribution (SSE/WebSocket) is **bonus** — skip if running out of time
- Automated database credential rotation — nice-to-have, not critical
- Load test on prod (staging is fine)
- Multi-region setup (single region is fine)
- Advanced caching strategies (Redis TTL is enough)

---

## Success Checklist

- [ ] Evaluation engine deterministic (same user → same result always)
- [ ] Tenant isolation verified (test: tenant A can't see tenant B's flags)
- [ ] Audit trail immutable (test: no updates/deletes, only inserts)
- [ ] Blue-green deployment working (health checks, traffic split, rollback)
- [ ] Terraform infrastructure reproducible (destroy + apply → working service)
- [ ] Observability dashboard shows key metrics
- [ ] Load test: 1k concurrent requests, latency < 100ms p99
- [ ] All tests pass in CI/CD
- [ ] Documentation clear enough to hand over to another engineer

---

## Key Things That Will Impress Evaluators

1. **Deterministic hashing implemented correctly** — many engineers get this wrong
2. **True multi-tenancy** — row-level security, not just a filter
3. **Observability from day 1** — correlation IDs, structured logging, not an afterthought
4. **Terraform modules** — reusable, not one big main.tf
5. **Blue-green deployment** — traffic splitting, health checks, actual rollback test
6. **Clean documentation** — show your decision-making, not just code
7. **Pragmatic trade-offs** — "I cut X to save time, here's why it's still solid"
8. **Load test results** — "We can handle 5k ops/sec, p99 latency 42ms under load"

---

## What to Do If You're Stuck

1. **Algorithm not working?** → Test with hardcoded examples first, then generalize
2. **Terraform errors?** → Smallest possible resource first (just Cloud Run), then add dependencies
3. **Load test failing?** → Start with 10 concurrent users, ramp up gradually
4. **Running out of time?** → Cut real-time distribution (SSE), focus on core eval + infra
5. **Deployment issues?** → Get Cloud SQL + API talking first, worry about Memorystore caching later

---

## Next Steps

1. ✅ Approve this plan
2. → Set up project structure + Terraform skeleton
3. → Implement database schema
4. → Build API core + evaluation engine
5. → Deploy to Cloud Run
6. → Write tests + documentation
7. → Fine-tune + ship

**Estimated total time: 8-10 hours spread over 2-3 days**

Good luck! 🚀
