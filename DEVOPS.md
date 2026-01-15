# DevOps Documentation Overview

Complete DevOps and infrastructure documentation for AGI Workforce.

## Documentation Index

This document provides an overview and quick navigation to all DevOps-related documentation.

### Core Documentation

| Document                                 | Description                               | Use When                                      |
| ---------------------------------------- | ----------------------------------------- | --------------------------------------------- |
| [DEPLOYMENT.md](./DEPLOYMENT.md)         | Deployment strategies and procedures      | Deploying any application or service          |
| [INFRASTRUCTURE.md](./INFRASTRUCTURE.md) | Infrastructure architecture and services  | Understanding or configuring infrastructure   |
| [MONITORING.md](./MONITORING.md)         | Logging, metrics, and observability       | Setting up monitoring or investigating issues |
| [SCALING.md](./SCALING.md)               | Performance tuning and scaling strategies | Planning capacity or optimizing performance   |
| [CICD.md](./CICD.md)                     | CI/CD pipelines and automation            | Modifying workflows or troubleshooting builds |
| [CLAUDE.md](./CLAUDE.md)                 | Project overview and development guide    | Understanding project structure               |

## Quick Start Guide

### For New Team Members

1. **Understand the Architecture**
   - Read [INFRASTRUCTURE.md](./INFRASTRUCTURE.md) → Architecture Overview
   - Review [CLAUDE.md](./CLAUDE.md) → Project Overview

2. **Set Up Development Environment**

   ```bash
   # Clone repository
   git clone https://github.com/your-org/agiworkforce.git
   cd agiworkforce

   # Install dependencies
   pnpm install

   # Copy environment variables
   cp apps/web/.env.example apps/web/.env.local
   cp apps/desktop/.env.example apps/desktop/.env.local
   cp services/api-gateway/.env.example services/api-gateway/.env
   cp services/signaling-server/.env.example services/signaling-server/.env

   # Start development
   pnpm dev:desktop  # Desktop app
   # OR
   cd apps/web && pnpm dev  # Web app
   ```

3. **Learn Deployment Process**
   - Read [DEPLOYMENT.md](./DEPLOYMENT.md) → Deployment Checklist
   - Review [CICD.md](./CICD.md) → Pipeline Architecture

4. **Configure Monitoring**
   - Read [MONITORING.md](./MONITORING.md) → Setup guides
   - Access monitoring dashboards (Sentry, Vercel, Supabase)

### For DevOps Engineers

**Infrastructure Setup:**

1. **Cloud Services**
   - Vercel: Web app hosting ([Setup Guide](./INFRASTRUCTURE.md#vercel))
   - Supabase: Database and auth ([Setup Guide](./INFRASTRUCTURE.md#supabase))
   - Upstash: Redis caching ([Setup Guide](./INFRASTRUCTURE.md#upstash-redis))

2. **CI/CD Pipelines**
   - GitHub Actions configured ([Workflow Guide](./CICD.md))
   - Secrets configured in repository settings
   - Build caching optimized

3. **Monitoring & Alerts**
   - Sentry: Error tracking ([Setup Guide](./MONITORING.md#sentry-configuration))
   - Vercel Analytics: Performance monitoring
   - Custom alerts configured

**Operational Runbooks:**

| Task                    | Documentation                                                   | Command                             |
| ----------------------- | --------------------------------------------------------------- | ----------------------------------- |
| Deploy web app          | [DEPLOYMENT.md](./DEPLOYMENT.md#web-application-deployment)     | Automatic via Vercel                |
| Release desktop app     | [DEPLOYMENT.md](./DEPLOYMENT.md#desktop-application-deployment) | `git tag v1.0.x && git push --tags` |
| Deploy backend services | [DEPLOYMENT.md](./DEPLOYMENT.md#backend-services-deployment)    | `pm2 restart all`                   |
| Database migration      | [DEPLOYMENT.md](./DEPLOYMENT.md#database-deployment)            | `supabase db push`                  |
| Rollback deployment     | [DEPLOYMENT.md](./DEPLOYMENT.md#rollback-procedures)            | See rollback guide                  |
| Scale infrastructure    | [SCALING.md](./SCALING.md#scaling-strategies)                   | See scaling guide                   |
| Investigate incident    | [MONITORING.md](./MONITORING.md#incident-response)              | Check logs & metrics                |

### For Developers

**Pre-Deployment Checklist:**

```bash
# 1. Run tests
pnpm test

# 2. Type check
pnpm typecheck:all

# 3. Lint
pnpm lint:fix

# 4. Build locally
pnpm build

# 5. Test E2E (desktop)
pnpm --filter @agiworkforce/desktop test:e2e
```

**Common Tasks:**

```bash
# Add environment variable
# 1. Add to .env.example
# 2. Add to deployment environment (Vercel/GitHub Secrets)
# 3. Document in DEPLOYMENT.md

# Update dependencies
pnpm update --latest

# Security audit
pnpm audit
cargo audit

# Check bundle size
cd apps/web && ANALYZE=true pnpm build
```

## Architecture Summary

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    AGI Workforce System                      │
└─────────────────────────────────────────────────────────────┘

Frontend Applications:
├─ Web App (Next.js 16)
│  ├─ Deployed: Vercel
│  ├─ Database: Supabase PostgreSQL
│  └─ Cache: Upstash Redis
│
├─ Desktop App (Tauri 2.9)
│  ├─ Frontend: React 19 + Vite 7
│  ├─ Backend: Rust + Tokio
│  ├─ Database: SQLite (local)
│  └─ Distribution: GitHub Releases
│
└─ Browser Extension (Chrome/Firefox)
   └─ Distribution: Web stores

Backend Services:
├─ API Gateway (Node.js/Express)
│  ├─ Purpose: Desktop/mobile sync
│  ├─ Port: 3000
│  └─ Auth: JWT
│
└─ Signaling Server (Node.js/WebSocket)
   ├─ Purpose: Device pairing
   ├─ Port: 4000
   └─ Protocol: WebSocket

Infrastructure:
├─ Hosting: Vercel (web), GitHub Releases (desktop)
├─ Database: Supabase PostgreSQL
├─ Cache: Upstash Redis
├─ CDN: Vercel Edge Network
├─ Monitoring: Sentry, Vercel Analytics
└─ CI/CD: GitHub Actions
```

### Data Flow

```
User Request
    │
    ├─→ Web App (Vercel)
    │   ├─→ Next.js Server Components
    │   ├─→ API Routes
    │   └─→ Supabase (Database)
    │
    └─→ Desktop App (Tauri)
        ├─→ React Frontend
        ├─→ Tauri Commands (Rust)
        ├─→ SQLite (Local)
        └─→ Backend Services (Sync)
```

## Key Metrics & SLAs

### Service Level Objectives (SLOs)

| Metric                        | Target  | Measurement        |
| ----------------------------- | ------- | ------------------ |
| **Availability**              | 99.9%   | Uptime monitoring  |
| **API Response Time (P95)**   | < 500ms | Sentry performance |
| **Page Load Time (P75)**      | < 2s    | Vercel Analytics   |
| **Error Rate**                | < 0.5%  | Sentry errors      |
| **Database Query Time (P95)** | < 100ms | Supabase logs      |

### Current Performance

| Metric        | Current | Status            |
| ------------- | ------- | ----------------- |
| Active Users  | 1,000   | ✓ Within capacity |
| Requests/sec  | 500     | ✓ Within capacity |
| Database Size | 8 GB    | ✓ Within capacity |
| Uptime (30d)  | 99.95%  | ✓ Above target    |

### Capacity Limits

| Resource              | Current | Limit        | Action Needed At |
| --------------------- | ------- | ------------ | ---------------- |
| Database Connections  | 50      | 100          | 80 connections   |
| Database Size         | 8 GB    | 500 GB       | 400 GB           |
| WebSocket Connections | 100     | 500/instance | 400 connections  |
| API Rate Limit        | 100/min | Configurable | Adjust per tier  |

## Incident Response

### Severity Levels

| Level             | Response Time | Examples                |
| ----------------- | ------------- | ----------------------- |
| **P1 - Critical** | < 15 minutes  | Service completely down |
| **P2 - High**     | < 1 hour      | Major feature broken    |
| **P3 - Medium**   | < 4 hours     | Minor feature impacted  |
| **P4 - Low**      | < 1 day       | Cosmetic issues         |

### On-Call Rotation

```
Primary: DevOps Lead
Secondary: Backend Engineer
Escalation: Engineering Manager

Contact Methods:
- PagerDuty (P1 alerts)
- Slack #incidents channel
- Email alerts
```

### Incident Communication

**Internal:**

- Slack #incidents channel
- Update status page
- Post-mortem document

**External:**

- Status page updates
- Email to affected users (if significant)
- In-app notifications

## Security & Compliance

### Security Measures

- **Authentication:** Supabase Auth (JWT)
- **Authorization:** Row Level Security (RLS)
- **Encryption:** HTTPS/TLS everywhere
- **Secrets:** Environment variables, never committed
- **Rate Limiting:** Upstash Redis
- **Input Validation:** Zod schemas
- **SQL Injection:** Parameterized queries
- **CSRF:** Next.js built-in protection
- **XSS:** Content Security Policy

### Compliance

- **GDPR:** User data export/deletion
- **PCI DSS:** Stripe handles payment processing
- **SOC 2:** Audit logs, access controls

### Security Audits

**Regular Tasks:**

- Weekly: Dependency updates (Dependabot)
- Monthly: Security audit review
- Quarterly: Penetration testing
- Annual: Compliance audit

## Cost Management

### Current Monthly Costs

| Service      | Cost           | Notes                    |
| ------------ | -------------- | ------------------------ |
| Vercel Pro   | $20            | Web hosting              |
| Supabase Pro | $25            | Database + Auth          |
| Upstash      | $10            | Redis caching            |
| Stripe       | Variable       | 2.9% + $0.30/transaction |
| Sentry Team  | $26            | Error tracking           |
| GitHub       | $0-4           | Free or Pro plan         |
| **Total**    | **~$90/month** | Excluding Stripe fees    |

### Cost Optimization

**Active Measures:**

- ISR for static content
- Connection pooling
- Aggressive caching
- Bundle size optimization
- Image optimization

**Future Optimizations:**

- Read replicas (distribute load)
- Database query optimization
- Auto-scaling (scale to zero)
- Archive old data

## Maintenance Schedule

### Daily

- Monitor error rates (automated)
- Check build status (automated)
- Review API performance (automated)

### Weekly

- Review database performance
- Check backup status
- Update dependencies (Dependabot)
- Review cost reports

### Monthly

- Security audit review
- Performance optimization review
- Capacity planning check
- Update documentation

### Quarterly

- Infrastructure audit
- Disaster recovery test
- Load testing
- Security penetration test

## Troubleshooting Guide

### Common Issues

**1. Service Down**

```bash
# Check status pages
https://www.vercel-status.com/
https://status.supabase.com/
https://status.stripe.com/

# Check health endpoints
curl https://agiworkforce.com/api/health

# View recent deployments
gh run list

# Check monitoring
# → Sentry: https://sentry.io
# → Vercel: https://vercel.com/dashboard
```

**2. Slow Performance**

```bash
# Check metrics
# → Sentry Performance
# → Vercel Analytics
# → Supabase Logs

# Identify bottleneck
# → Database queries
# → API response times
# → Bundle size

# Apply optimization
# → Add database index
# → Implement caching
# → Optimize queries
```

**3. Build Failures**

```bash
# Check CI logs
gh run view <run-id>

# Reproduce locally
pnpm install --frozen-lockfile
pnpm build

# Common fixes
# → Clear cache
# → Update dependencies
# → Fix type errors
```

**4. Deployment Issues**

```bash
# Check deployment logs
vercel logs

# Rollback if needed
vercel rollback

# Verify environment variables
vercel env ls
```

## Support & Resources

### Internal Resources

- **Documentation:** This repository
- **Code:** GitHub repository
- **Issues:** GitHub Issues
- **Discussions:** GitHub Discussions

### External Resources

- **Vercel Docs:** https://vercel.com/docs
- **Supabase Docs:** https://supabase.com/docs
- **Next.js Docs:** https://nextjs.org/docs
- **Tauri Docs:** https://tauri.app/v2/guides/

### Team Contacts

| Role          | Responsibility              | Contact     |
| ------------- | --------------------------- | ----------- |
| DevOps Lead   | Infrastructure, deployments | [contact]   |
| Backend Lead  | API services, database      | [contact]   |
| Frontend Lead | Web and desktop apps        | [contact]   |
| Security Lead | Security, compliance        | [contact]   |
| On-Call       | Emergency response          | [PagerDuty] |

## Contributing

### Making Changes

1. **Documentation Updates**

   ```bash
   # Edit relevant .md file
   vim DEPLOYMENT.md

   # Commit with descriptive message
   git commit -m "docs: update deployment checklist"
   ```

2. **Infrastructure Changes**
   - Document changes in appropriate .md file
   - Update environment variable examples
   - Test changes in staging first
   - Update runbooks if needed

3. **Review Process**
   - All changes require PR review
   - DevOps team approval required for infrastructure changes
   - Security team approval for security-related changes

### Documentation Standards

- **Keep it Current:** Update docs with code changes
- **Be Specific:** Include exact commands and examples
- **Use Checklists:** For deployment and operational tasks
- **Include Diagrams:** For architecture and workflows
- **Version Everything:** Track changes in git

## Version History

| Version | Date       | Changes                                    |
| ------- | ---------- | ------------------------------------------ |
| 1.0     | 2026-01-15 | Initial comprehensive DevOps documentation |

---

**Last Updated:** 2026-01-15
**Maintained By:** DevOps Team

For questions or issues with documentation, please open a GitHub issue or contact the DevOps team.
