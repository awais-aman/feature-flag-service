output "connection_name" {
  value = google_sql_database_instance.instance.connection_name
}

output "private_ip_address" {
  value = google_sql_database_instance.instance.private_ip_address
}

output "database_url" {
  value       = "postgresql://${google_sql_user.app_user.name}:${random_password.db_password.result}@${google_sql_database_instance.instance.private_ip_address}:5432/${google_sql_database.database.name}?schema=public"
  sensitive   = true
  description = "Full connection string — written to Secret Manager, never to a .tfvars file or plain env var"
}
