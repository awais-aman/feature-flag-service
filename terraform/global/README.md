# Global / bootstrap stack

Resources here are shared across every environment and applied **once**,
from their own Terraform state, separate from `terraform/` (the
per-environment stack applied once per dev/staging/production).

Why split them out: Artifact Registry holds one image promoted across all
three environments (build once, deploy everywhere), and the deployer
identity isn't scoped to any single environment either. If these lived in
the per-environment stack, applying dev/staging/prod from three separate
state files would each try to create the *same* GCP resource and collide.

## What's here

- Artifact Registry Docker repository
- A Workload Identity Federation pool and OIDC provider that lets one named
  GitHub repository (`github_repository`) assume the deployer identity
  without a long-lived JSON service account key
- The deployer service account itself, scoped to exactly what a release
  needs: push images, deploy Cloud Run revisions, shift traffic, nothing
  else (see `main.tf` for the exact role list)

## Apply

```bash
cd terraform/global
terraform init -backend-config=backend.hcl
terraform apply -var="project_id=<your-project>" -var="github_repository=<owner/repo>"
```

`backend.hcl` holds a `REPLACE_WITH_YOUR_TFSTATE_BUCKET` placeholder; point it
at a real GCS bucket first.
