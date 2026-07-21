output "cloud_run_url" {
  value = module.cloud_run.url
}

output "cloud_sql_connection_name" {
  value = module.cloud_sql.connection_name
}

output "redis_host" {
  value = module.memorystore.host
}

output "runtime_service_account" {
  value = module.iam.service_account_email
}
