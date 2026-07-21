# All runtime secrets live here — none are ever passed as plain environment
# variables in the Cloud Run service definition (see the cloud_run module,
# which mounts these via `env { value_source { secret_key_ref { ... } } }`).

resource "random_password" "api_key_pepper" {
  length  = 48
  special = false
}

locals {
  secrets = {
    database-url   = var.database_url
    redis-url      = var.redis_url
    api-key-pepper = random_password.api_key_pepper.result
  }
}

resource "google_secret_manager_secret" "secret" {
  for_each  = local.secrets
  project   = var.project_id
  secret_id = "flags-${var.environment}-${each.key}"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "version" {
  for_each    = local.secrets
  secret      = google_secret_manager_secret.secret[each.key].id
  secret_data = each.value
}

# Least-privilege: each secret grants access only to this environment's
# Cloud Run runtime SA, individually — not a project-wide secretAccessor
# role, which would let it read every other environment's secrets too.
resource "google_secret_manager_secret_iam_member" "accessor" {
  for_each  = local.secrets
  project   = var.project_id
  secret_id = google_secret_manager_secret.secret[each.key].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.runtime_service_account_email}"
}
