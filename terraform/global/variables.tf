variable "project_id" {
  type = string
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "github_repository" {
  description = "GitHub repo allowed to assume the deployer identity, as 'owner/repo'"
  type        = string
}
