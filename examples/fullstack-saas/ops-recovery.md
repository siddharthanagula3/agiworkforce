# Availability And Recovery

## Health Checks

- ALB checks `GET /api/health` every 30 seconds.
- ECS replaces unhealthy tasks automatically.
- CloudWatch alarms fire on 5xx rate, target response time, CPU, memory, and Redis CPU.

## Backups

- Supabase project backups should be enabled with PITR for production.
- Supabase Storage objects are protected by private bucket policies; replicate critical exports to the Terraform-managed recovery S3 bucket if regulatory retention is required.
- ElastiCache Redis snapshots are retained for 7 days by Terraform.
- ALB and CloudFront logs are retained in S3 with lifecycle transition to Glacier.

## Recovery

1. Restore Supabase to a point in time or a new project.
2. Update `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in Secrets Manager.
3. Re-run the ECS deployment workflow to roll tasks with the restored secrets.
4. Invalidate CloudFront if a static asset rollback is required.
