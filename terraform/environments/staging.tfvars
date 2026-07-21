environment = "staging"
region      = "us-central1"

cloud_run_min_instances = 0
cloud_run_max_instances = 5

cloud_sql_tier       = "db-f1-micro"
redis_memory_size_gb = 1

# project_id, alert_notification_email and container_image are passed via
# -var on the CLI, not committed here — see README "Infrastructure".
