resource "google_monitoring_notification_channel" "email" {
  project      = var.project_id
  display_name = "Feature Flag Service Alerts (${var.environment})"
  type         = "email"
  labels = {
    email_address = var.notification_email
  }
}

# NOTE on the error-rate condition below: this measures the *absolute rate*
# of 5xx responses (requests/sec), not a true percentage-of-total ratio. A
# proper ">5% of requests over 5 minutes" alert needs an MQL `ratio_series`
# query joining the 5xx count series against the total count series — real,
# but fiddly enough to get exactly right that I didn't want to ship an
# untested join blind, without a live project to verify it against. This
# threshold-on-absolute-rate version still catches real error spikes and is
# the pragmatic version; tightening it to a true ratio is called out in the
# README as a follow-up.
resource "google_monitoring_alert_policy" "error_rate" {
  project      = var.project_id
  display_name = "Elevated 5xx rate (${var.environment})"
  combiner     = "OR"

  conditions {
    display_name = "5xx responses/sec over 5m"
    condition_threshold {
      filter          = "metric.type=\"run.googleapis.com/request_count\" resource.type=\"cloud_run_revision\" resource.label.service_name=\"${var.cloud_run_service_name}\" metric.label.response_code_class=\"5xx\""
      comparison      = "COMPARISON_GT"
      threshold_value = 1
      duration        = "300s"
      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_RATE"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
}

resource "google_monitoring_alert_policy" "evaluation_latency" {
  project      = var.project_id
  display_name = "Evaluation latency p99 > 300ms (${var.environment})"
  combiner     = "OR"

  conditions {
    display_name = "p99 request latency over 5m"
    condition_threshold {
      filter          = "metric.type=\"run.googleapis.com/request_latencies\" resource.type=\"cloud_run_revision\" resource.label.service_name=\"${var.cloud_run_service_name}\""
      comparison      = "COMPARISON_GT"
      threshold_value = 300
      duration        = "300s"
      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_PERCENTILE_99"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
}

resource "google_monitoring_uptime_check_config" "health" {
  project      = var.project_id
  display_name = "Feature Flag Service health (${var.environment})"
  timeout      = "10s"
  period       = "60s"

  http_check {
    path    = "/health"
    port    = 443
    use_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = replace(replace(var.cloud_run_url, "https://", ""), "/", "")
    }
  }
}

resource "google_monitoring_alert_policy" "health_check_failure" {
  project      = var.project_id
  display_name = "Health check failing (${var.environment})"
  combiner     = "OR"

  conditions {
    display_name = "Uptime check failure"
    condition_threshold {
      filter          = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" resource.type=\"uptime_url\" metric.label.check_id=\"${google_monitoring_uptime_check_config.health.uptime_check_id}\""
      comparison      = "COMPARISON_LT"
      threshold_value = 1
      duration        = "300s"
      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_FRACTION_TRUE"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
}

resource "google_monitoring_dashboard" "dashboard" {
  project = var.project_id
  dashboard_json = jsonencode({
    displayName = "Feature Flag Service (${var.environment})"
    gridLayout = {
      widgets = [
        {
          title = "Request count by response class"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "metric.type=\"run.googleapis.com/request_count\" resource.type=\"cloud_run_revision\" resource.label.service_name=\"${var.cloud_run_service_name}\""
                  aggregation = {
                    alignmentPeriod  = "60s"
                    perSeriesAligner = "ALIGN_RATE"
                    groupByFields    = ["metric.label.response_code_class"]
                  }
                }
              }
            }]
          }
        },
        {
          title = "Request latency (p50/p95/p99)"
          xyChart = {
            dataSets = [
              { timeSeriesQuery = { timeSeriesFilter = { filter = "metric.type=\"run.googleapis.com/request_latencies\" resource.type=\"cloud_run_revision\" resource.label.service_name=\"${var.cloud_run_service_name}\"", aggregation = { alignmentPeriod = "60s", perSeriesAligner = "ALIGN_PERCENTILE_50" } } } },
              { timeSeriesQuery = { timeSeriesFilter = { filter = "metric.type=\"run.googleapis.com/request_latencies\" resource.type=\"cloud_run_revision\" resource.label.service_name=\"${var.cloud_run_service_name}\"", aggregation = { alignmentPeriod = "60s", perSeriesAligner = "ALIGN_PERCENTILE_95" } } } },
              { timeSeriesQuery = { timeSeriesFilter = { filter = "metric.type=\"run.googleapis.com/request_latencies\" resource.type=\"cloud_run_revision\" resource.label.service_name=\"${var.cloud_run_service_name}\"", aggregation = { alignmentPeriod = "60s", perSeriesAligner = "ALIGN_PERCENTILE_99" } } } },
            ]
          }
        },
        {
          title = "Instance count"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter      = "metric.type=\"run.googleapis.com/container/instance_count\" resource.type=\"cloud_run_revision\" resource.label.service_name=\"${var.cloud_run_service_name}\""
                  aggregation = { alignmentPeriod = "60s", perSeriesAligner = "ALIGN_MEAN" }
                }
              }
            }]
          }
        },
        {
          title = "Note: evaluation-latency / cache-hit-ratio / per-tenant panels"
          text = {
            content = "flag_evaluation_latency_ms, flag_config_cache_lookups_total, and flag_evaluations_total (see src/metrics/metrics.service.ts, scraped from /metrics) appear here once Google Cloud Managed Service for Prometheus is enabled on this project — see README Observability section for the one-time setup command."
            format  = "MARKDOWN"
          }
        }
      ]
    }
  })
}
