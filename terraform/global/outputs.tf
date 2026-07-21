output "artifact_registry_url" {
  value = module.artifact_registry.repository_url
}

output "workload_identity_provider" {
  value       = google_iam_workload_identity_pool_provider.github.name
  description = "Full resource name of the OIDC provider the deployer identity trusts"
}

output "deployer_service_account_email" {
  value       = google_service_account.deployer.email
  description = "Service account that pushes images and rolls out Cloud Run revisions"
}
