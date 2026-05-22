# Layer Map

Assumptions: Next.js 16 App Router, Supabase Auth/Postgres/Storage, Redis, AWS ECS Fargate, ALB, CloudFront, WAF, S3 logs, GitHub Actions, and Sentry.

| Layer                      | Files                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Frontend                   | `app/page.tsx`, `app/dashboard/page.tsx`, `app/login/page.tsx`, `components/ProjectConsole.tsx`, `app/globals.css` |
| APIs and backend logic     | `app/api/**/route.ts`, `lib/http.ts`, `lib/validation.ts`                                                          |
| Database and storage       | `supabase/migrations/20260516000000_init.sql`, `supabase/config.toml`                                              |
| Auth and permissions       | `app/login/actions.ts`, `app/auth/callback/route.ts`, `proxy.ts`, `lib/auth.ts`, `lib/permissions.ts`              |
| Hosting and deployment     | `Dockerfile`, `docker-compose.yml`, `.dockerignore`                                                                |
| Cloud and compute          | `infra/terraform/*.tf`                                                                                             |
| CI/CD and version control  | `.github/workflows/ci.yml`, `.gitignore`                                                                           |
| Security and RLS           | `next.config.mjs`, `lib/http.ts`, `supabase/migrations/20260516000000_init.sql`                                    |
| Rate limiting              | `lib/rate-limit.ts`, `infra/terraform/main.tf` WAF rule                                                            |
| Caching and CDN            | `lib/cache.ts`, Redis in Terraform, CloudFront cache behaviors in Terraform                                        |
| Load balancing and scaling | ALB, ECS service, and App Auto Scaling in `infra/terraform/main.tf`                                                |
| Error tracking and logs    | `sentry.*.config.ts`, `instrumentation.ts`, `lib/logger.ts`, CloudWatch/S3 logs in Terraform                       |
| Availability and recovery  | `app/api/health/route.ts`, Redis snapshots and alarms in Terraform, `ops-recovery.md`                              |
