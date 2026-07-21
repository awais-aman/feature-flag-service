# Cloud Run's own runtime identity — separate from the deployer identity (see terraform/global), which only ever needs to push
# images and trigger deploys, never to read application secrets.
resource "google_service_account" "cloud_run_runtime" {
  project      = var.project_id
  account_id   = "flags-${var.environment}-run-sa"
  display_name = "Feature Flag Service Cloud Run runtime (${var.environment})"
}

# Secret Manager access is granted per-secret in the secret_manager module,
# not here — a project-wide secretAccessor role would let this service
# account read every secret in the project, not just its own three.

resource "google_project_iam_member" "cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.cloud_run_runtime.email}"
}

resource "google_project_iam_member" "artifact_registry_reader" {
  project = var.project_id
  role    = "roles/artifactregistry.reader"
  member  = "serviceAccount:${google_service_account.cloud_run_runtime.email}"
}

resource "google_project_iam_member" "log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.cloud_run_runtime.email}"
}

resource "google_project_iam_member" "metric_writer" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.cloud_run_runtime.email}"
}
