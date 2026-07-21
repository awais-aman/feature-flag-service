# VPC + private networking so Cloud Run reaches Cloud SQL and Memorystore
# over private IPs — no public IP on the database, no public IP on Redis.
# Memorystore in particular has no public-IP option at all, so private
# connectivity from Cloud Run is a hard requirement, not a nice-to-have.
#
# Cloud Run reaches this VPC via Direct VPC Egress (configured directly on
# the service in the cloud_run module via network_interfaces), not a
# Serverless VPC Access connector. A connector is an extra always-running
# resource (small VMs) that proxies traffic and was Cloud Run's only option
# for years — Direct VPC Egress (GA since 2024) removes that hop entirely by
# attaching the Cloud Run service straight to the VPC/subnet, so there's one
# fewer resource to provision, pay for, and have fail independently.

resource "google_compute_network" "vpc" {
  project                 = var.project_id
  name                    = "flags-${var.environment}-vpc"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "subnet" {
  project       = var.project_id
  name          = "flags-${var.environment}-subnet"
  region        = var.region
  network       = google_compute_network.vpc.id
  ip_cidr_range = "10.10.0.0/24"
}

# Reserved range + peering connection Cloud SQL and Memorystore both use for
# their private-IP allocation within this VPC.
resource "google_compute_global_address" "private_service_range" {
  project       = var.project_id
  name          = "flags-${var.environment}-private-service-range"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 20
  network       = google_compute_network.vpc.id
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_service_range.name]
}

resource "google_compute_firewall" "allow_internal" {
  project = var.project_id
  name    = "flags-${var.environment}-allow-internal"
  network = google_compute_network.vpc.name

  allow {
    protocol = "tcp"
    ports    = ["0-65535"]
  }
  allow {
    protocol = "udp"
    ports    = ["0-65535"]
  }

  source_ranges = ["10.10.0.0/16"]
}
