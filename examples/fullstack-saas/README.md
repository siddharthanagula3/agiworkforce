# Full-Stack SaaS Reference

Assumptions: Next.js App Router, Supabase Auth/Postgres/Storage with RLS, Redis for rate limiting and cache, AWS ECS Fargate behind an ALB, CloudFront CDN, and GitHub Actions CI/CD.

## Local Run

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

Apply `supabase/migrations/20260516000000_init.sql` to a Supabase project, then configure email/password or OAuth providers in Supabase Auth.

## Production

1. Push the container image built by `.github/workflows/ci.yml` to ECR.
2. Apply `infra/terraform` with the image tag and secret ARNs.
3. Point DNS at the CloudFront distribution output.
