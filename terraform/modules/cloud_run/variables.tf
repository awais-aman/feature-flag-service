variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "environment" {
  type = string
}

variable "container_image" {
  type = string
}

variable "service_account_email" {
  type = string
}

variable "vpc_network" {
  description = "VPC network self link for Direct VPC Egress"
  type        = string
}

variable "vpc_subnet" {
  description = "Subnet self link for Direct VPC Egress"
  type        = string
}

variable "secret_ids" {
  description = "Map from secret_manager module: database-url, redis-url, api-key-pepper"
  type        = map(string)
}

variable "min_instances" {
  type    = number
  default = 0
}

variable "max_instances" {
  type    = number
  default = 10
}

variable "cpu" {
  type    = string
  default = "1"
}

variable "memory" {
  type    = string
  default = "512Mi"
}
