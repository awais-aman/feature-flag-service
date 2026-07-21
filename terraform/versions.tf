terraform {
  required_version = ">= 1.6.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Remote state with locking, per environment. Bucket/prefix are supplied
  # per-environment via `-backend-config` (see environments/*-backend.hcl and
  # README "Infrastructure" for the exact init command) rather than hardcoded
  # here, so the same config targets dev/staging/prod state files without
  # editing this file.
  backend "gcs" {}
}
