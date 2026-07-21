provider "google" {
  project = var.project_id
  region  = var.region
}

resource "google_project_service" "apis" {
  for_each = toset([
    "artifactregistry.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
    "run.googleapis.com",
  ])
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

module "artifact_registry" {
  source = "../modules/artifact_registry"

  project_id = var.project_id
  region     = var.region

  depends_on = [google_project_service.apis]
}

# Workload Identity Federation: GitHub Actions authenticates as this pool's
# identity and exchanges it for short-lived GCP credentials via
# google-github-actions/auth — no long-lived JSON service account key ever
# leaves GCP or sits in a GitHub secret.
resource "google_iam_workload_identity_pool" "github" {
  project                   = var.project_id
  workload_identity_pool_id = "github-actions-pool"
  display_name              = "GitHub Actions"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-actions-provider"
  display_name                       = "GitHub Actions OIDC"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
  }

  # Only this exact repo's workflows can assume the deployer identity —
  # without this condition, any repo in the GitHub org (or beyond, depending
  # on pool config) that can produce a token for this provider would qualify.
  attribute_condition = "assertion.repository == \"${var.github_repository}\""

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "deployer" {
  project      = var.project_id
  account_id   = "github-actions-deployer"
  display_name = "GitHub Actions CI/CD deployer"
}

resource "google_service_account_iam_member" "workload_identity_binding" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

# Scoped to exactly what a deploy needs: push images, deploy Cloud Run
# revisions and shift traffic, and act-as the (separate, narrower) Cloud Run
# runtime service accounts. No Cloud SQL, Secret Manager, or broad Editor/
# Owner role — the deployer never touches application data or secrets.
resource "google_project_iam_member" "deployer_run_admin" {
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_project_iam_member" "deployer_artifact_writer" {
  project = var.project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_project_iam_member" "deployer_sa_user" {
  project = var.project_id
  role    = "roles/iam.serviceAccountUser"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}
