output "artifact_registry_url" {
  value = module.artifact_registry.repository_url
}

output "workload_identity_provider" {
  value       = google_iam_workload_identity_pool_provider.github.name
  description = "Full resource name — set as the WORKLOAD_IDENTITY_PROVIDER GitHub secret"
}

output "deployer_service_account_email" {
  value       = google_service_account.deployer.email
  description = "Set as the DEPLOYER_SERVICE_ACCOUNT GitHub secret"
}
