environment = "dev"
region      = "us-central1"

cloud_run_min_instances = 0
cloud_run_max_instances = 3

cloud_sql_tier       = "db-f1-micro"
redis_memory_size_gb = 1

# project_id, alert_notification_email, github_repository, and
# container_image are passed via -var on the CLI or CI secrets, not
# committed here — see README "Infrastructure" for the exact commands.
