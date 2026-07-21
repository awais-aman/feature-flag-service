variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "environment" {
  type = string
}

variable "memory_size_gb" {
  type    = number
  default = 1
}

variable "vpc_id" {
  type = string
}

variable "private_vpc_connection" {
  type = any
}
