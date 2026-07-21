variable "project_id" {
  description = "GCP project ID to deploy into"
  type        = string
}

variable "region" {
  description = "GCP region for regional resources"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Environment name: dev, staging, or production"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "environment must be one of: dev, staging, production"
  }
}

variable "container_image" {
  description = "Full Artifact Registry image reference to deploy (e.g. us-central1-docker.pkg.dev/PROJECT/REPO/feature-flag-service:SHA). Left as a distroless placeholder until CI pushes the first real image."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "cloud_run_min_instances" {
  description = "Minimum Cloud Run instances (0 allows scale-to-zero for dev/staging; keep >=1 in prod to avoid cold starts)"
  type        = number
  default     = 0
}

variable "cloud_run_max_instances" {
  description = "Maximum Cloud Run instances — the hard ceiling autoscaling won't exceed, sized for cost control"
  type        = number
  default     = 10
}

variable "cloud_sql_tier" {
  description = "Cloud SQL machine tier"
  type        = string
  default     = "db-f1-micro"
}

variable "redis_memory_size_gb" {
  description = "Memorystore Redis instance size in GB"
  type        = number
  default     = 1
}

variable "alert_notification_email" {
  description = "Email address to receive Cloud Monitoring alert notifications"
  type        = string
}

variable "github_repository" {
  description = "GitHub repo allowed to assume the Workload Identity Federation deployer service account, in 'owner/repo' form"
  type        = string
}
