environment = "production"
region      = "us-central1"

# >=1 avoids a cold start hitting real member traffic; scale-to-zero is fine
# for dev/staging where idle time between demos is the common case.
cloud_run_min_instances = 1
cloud_run_max_instances = 20

cloud_sql_tier       = "db-custom-2-4096"
redis_memory_size_gb = 2

# project_id, alert_notification_email and container_image are passed via
# -var on the CLI, not committed here — see README "Infrastructure".
