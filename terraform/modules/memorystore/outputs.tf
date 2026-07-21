output "host" {
  value = google_redis_instance.cache.host
}

output "port" {
  value = google_redis_instance.cache.port
}

output "redis_url" {
  value       = "redis://${google_redis_instance.cache.host}:${google_redis_instance.cache.port}"
  description = "Written to Secret Manager alongside DATABASE_URL"
}
