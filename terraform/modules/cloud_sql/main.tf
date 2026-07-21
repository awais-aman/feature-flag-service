resource "random_password" "db_password" {
  length  = 32
  special = false # avoid characters that need URL-encoding in DATABASE_URL
}

resource "google_sql_database_instance" "instance" {
  project             = var.project_id
  name                = "flags-${var.environment}"
  region              = var.region
  database_version    = "POSTGRES_16"
  deletion_protection = var.environment == "production"

  settings {
    tier              = var.tier
    edition           = "ENTERPRISE" # db-f1-micro (shared-core) isn't valid under the newer ENTERPRISE_PLUS default edition
    availability_type = var.environment == "production" ? "REGIONAL" : "ZONAL"

    ip_configuration {
      ipv4_enabled    = false # no public IP — reachable only via the VPC connector
      private_network = var.vpc_id
    }

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = var.environment == "production"
      start_time                     = "03:00"
    }
  }

  depends_on = [var.private_vpc_connection]
}

resource "google_sql_database" "database" {
  project  = var.project_id
  name     = "feature_flags"
  instance = google_sql_database_instance.instance.name
}

resource "google_sql_user" "app_user" {
  project  = var.project_id
  name     = "flags_app"
  instance = google_sql_database_instance.instance.name
  password = random_password.db_password.result
}
