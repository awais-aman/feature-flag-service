variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "environment" {
  type = string
}

variable "tier" {
  type    = string
  default = "db-f1-micro"
}

variable "vpc_id" {
  description = "Self link of the VPC to attach Cloud SQL's private IP to"
  type        = string
}

variable "private_vpc_connection" {
  description = "The networking module's private service connection — Cloud SQL must wait for this to exist before allocating a private IP"
  type        = any
}
