output "vpc_id" {
  value = google_compute_network.vpc.id
}

output "vpc_name" {
  value = google_compute_network.vpc.name
}

output "subnet_id" {
  value = google_compute_subnetwork.subnet.id
}

output "private_vpc_connection" {
  value       = google_service_networking_connection.private_vpc_connection
  description = "Depend on this output where Cloud SQL/Memorystore must wait for the peering connection to exist first"
}
