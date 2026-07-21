provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

locals {
  required_apis = [
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "redis.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
    "servicenetworking.googleapis.com",
    "vpcaccess.googleapis.com",
    "monitoring.googleapis.com",
    "logging.googleapis.com",
    "compute.googleapis.com",
    "iam.googleapis.com",
  ]
}

resource "google_project_service" "apis" {
  for_each           = toset(local.required_apis)
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

module "networking" {
  source = "./modules/networking"

  project_id  = var.project_id
  region      = var.region
  environment = var.environment

  depends_on = [google_project_service.apis]
}

module "cloud_sql" {
  source = "./modules/cloud_sql"

  project_id             = var.project_id
  region                 = var.region
  environment            = var.environment
  tier                   = var.cloud_sql_tier
  vpc_id                 = module.networking.vpc_id
  private_vpc_connection = module.networking.private_vpc_connection
}

module "memorystore" {
  source = "./modules/memorystore"

  project_id             = var.project_id
  region                 = var.region
  environment            = var.environment
  memory_size_gb         = var.redis_memory_size_gb
  vpc_id                 = module.networking.vpc_id
  private_vpc_connection = module.networking.private_vpc_connection
}

module "iam" {
  source = "./modules/iam"

  project_id  = var.project_id
  environment = var.environment
}

module "secret_manager" {
  source = "./modules/secret_manager"

  project_id                    = var.project_id
  environment                   = var.environment
  database_url                  = module.cloud_sql.database_url
  redis_url                     = module.memorystore.redis_url
  runtime_service_account_email = module.iam.service_account_email
}

module "cloud_run" {
  source = "./modules/cloud_run"

  project_id            = var.project_id
  region                = var.region
  environment           = var.environment
  container_image       = var.container_image
  service_account_email = module.iam.service_account_email
  vpc_network           = module.networking.vpc_id
  vpc_subnet            = module.networking.subnet_id
  secret_ids            = module.secret_manager.secret_ids
  min_instances         = var.cloud_run_min_instances
  max_instances         = var.cloud_run_max_instances
}

module "monitoring" {
  source = "./modules/monitoring"

  project_id             = var.project_id
  environment            = var.environment
  cloud_run_service_name = module.cloud_run.service_name
  cloud_run_url          = module.cloud_run.url
  notification_email     = var.alert_notification_email
}
