variable "project_id" {
  type = string
}

variable "environment" {
  type = string
}

variable "database_url" {
  type      = string
  sensitive = true
}

variable "redis_url" {
  type = string
}

variable "runtime_service_account_email" {
  description = "Cloud Run runtime SA — granted read access to these three secrets and nothing else"
  type        = string
}
