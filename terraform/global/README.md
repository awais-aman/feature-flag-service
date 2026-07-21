# Global / bootstrap stack

Resources here are shared across every environment and applied **once**,
from their own Terraform state — separate from `terraform/` (the
per-environment stack applied once per dev/staging/production).

Why split them out: Artifact Registry holds one image promoted across all
three environments (see `.github/workflows/*` — build once, deploy
everywhere), and the GitHub Actions deployer identity isn't scoped to any
single environment either. If these lived in the per-environment stack,
applying dev/staging/prod from three separate state files would each try to
create the *same* GCP resource and collide.

## What's here

- Artifact Registry Docker repository
- Workload Identity Federation pool + provider for GitHub Actions (no
  long-lived JSON service account keys)
- The deployer service account GitHub Actions assumes, scoped to exactly
  what a deploy needs: push images, deploy Cloud Run revisions, shift
  traffic — nothing else (see `main.tf` for the exact role list)

## Apply

```bash
cd terraform/global
terraform init -backend-config="bucket=<your-tfstate-bucket>" -backend-config="prefix=global"
terraform apply -var="project_id=<your-project>" -var="github_repository=<owner/repo>"
```
