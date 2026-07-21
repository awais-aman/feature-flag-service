# Memorystore has no public-IP mode at all — it's reachable only from
# within the VPC, which is why the Serverless VPC Access connector in the
# networking module isn't optional for Cloud Run to use this cache.

resource "google_redis_instance" "cache" {
  project        = var.project_id
  name           = "flags-${var.environment}-cache"
  region         = var.region
  memory_size_gb = var.memory_size_gb
  redis_version  = "REDIS_7_2"

  # BASIC (single node) is enough for a cache we treat as disposable — a
  # Redis restart just means the next few evaluations are cache misses that
  # fall through to Postgres, not an outage. Production still steps up to
  # HA since a cold cache under peak prod traffic means a real latency spike.
  tier               = var.environment == "production" ? "STANDARD_HA" : "BASIC"
  authorized_network = var.vpc_id
  connect_mode       = "PRIVATE_SERVICE_ACCESS"

  depends_on = [var.private_vpc_connection]
}
