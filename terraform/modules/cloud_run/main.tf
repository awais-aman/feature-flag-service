# Terraform provisions the Cloud Run *service* (compute shape, secrets,
# networking, IAM) — it does not own individual deploys or traffic splits.
# The CI/CD pipeline (.github/workflows/deploy-*.yml) calls `gcloud run
# deploy --no-traffic` to publish a new revision and `gcloud run services
# update-traffic` to shift traffic during a blue-green/canary rollout. If
# Terraform also tracked `image`/`traffic` here, every `terraform apply` for
# an unrelated infra change (e.g. bumping Cloud SQL tier) would silently
# revert whatever revision/split the last deploy left in place. The
# lifecycle.ignore_changes block below is what makes that split safe.

resource "google_cloud_run_v2_service" "service" {
  project  = var.project_id
  name     = "flags-${var.environment}"
  location = var.region

  template {
    service_account = var.service_account_email

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    # Direct VPC Egress — attaches the service straight to the VPC/subnet
    # rather than proxying through a separate Serverless VPC Access
    # connector resource (see networking module for why).
    vpc_access {
      network_interfaces {
        network    = var.vpc_network
        subnetwork = var.vpc_subnet
      }
      egress = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = var.container_image

      resources {
        limits = {
          cpu    = var.cpu
          memory = var.memory
        }
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "ENVIRONMENT"
        value = var.environment
      }
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = var.secret_ids["database-url"]
            version = "latest"
          }
        }
      }
      env {
        name = "REDIS_URL"
        value_source {
          secret_key_ref {
            secret  = var.secret_ids["redis-url"]
            version = "latest"
          }
        }
      }
      env {
        name = "API_KEY_PEPPER"
        value_source {
          secret_key_ref {
            secret  = var.secret_ids["api-key-pepper"]
            version = "latest"
          }
        }
      }

      startup_probe {
        http_get {
          path = "/health"
        }
        initial_delay_seconds = 5
        period_seconds        = 5
        failure_threshold     = 5
      }

      liveness_probe {
        http_get {
          path = "/health"
        }
        period_seconds = 15
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      traffic,
      client,
      client_version,
    ]
  }
}

# API-key auth happens inside the app, not at the IAM layer — this service
# is meant to be called directly by other applications' backends, not routed
# through a GCP-authenticated caller.
resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.service.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
