# One shared repo across dev/staging/production, not one per environment:
# the point of build-once-promote-everywhere is that the exact same image
# digest that was tested and ran in staging is what gets promoted to production — a
# per-environment repo would invite rebuilding (and therefore re-testing a
# *different* artifact) at each stage. This is provisioned once from the
# `terraform/global` stack, not per-environment.

resource "google_artifact_registry_repository" "docker_repo" {
  project       = var.project_id
  location      = var.region
  repository_id = "feature-flag-service"
  format        = "DOCKER"
  description   = "Feature flag service container images, promoted across environments by tag"

  cleanup_policies {
    id     = "keep-last-20"
    action = "KEEP"
    most_recent_versions {
      keep_count = 20
    }
  }
}
