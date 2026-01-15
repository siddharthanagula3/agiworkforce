# DevOps Documentation Suite

Complete DevOps, Infrastructure, and Operations documentation for AGI Workforce.

## Overview

This documentation suite provides comprehensive guidance for deploying, monitoring, scaling, and maintaining the AGI Workforce platform across all environments.

## Documentation Structure

### Core Documentation (174 KB Total)

| Document                                           | Size  | Description                              | Primary Audience   |
| -------------------------------------------------- | ----- | ---------------------------------------- | ------------------ |
| **[DEVOPS.md](./DEVOPS.md)**                       | 12 KB | Overview and quick start guide           | All team members   |
| **[DEPLOYMENT.md](./DEPLOYMENT.md)**               | 23 KB | Deployment strategies and procedures     | DevOps, Developers |
| **[INFRASTRUCTURE.md](./INFRASTRUCTURE.md)**       | 31 KB | Infrastructure architecture and services | DevOps, Architects |
| **[MONITORING.md](./MONITORING.md)**               | 31 KB | Logging, metrics, and observability      | DevOps, SRE        |
| **[SCALING.md](./SCALING.md)**                     | 30 KB | Performance tuning and scaling           | DevOps, Engineers  |
| **[CICD.md](./CICD.md)**                           | 27 KB | CI/CD pipelines and automation           | DevOps, Developers |
| **[DISASTER_RECOVERY.md](./DISASTER_RECOVERY.md)** | 20 KB | Backup and disaster recovery             | DevOps, Management |

### Supporting Documentation

| Document                     | Description                                 |
| ---------------------------- | ------------------------------------------- |
| **[CLAUDE.md](./CLAUDE.md)** | Project overview and development guide      |
| **.env.example files**       | Environment variable templates for all apps |
| **GitHub Workflows**         | CI/CD automation in `.github/workflows/`    |

## Quick Navigation

### By Role

**DevOps Engineers:**

1. Start with [DEVOPS.md](./DEVOPS.md) for overview
2. Review [INFRASTRUCTURE.md](./INFRASTRUCTURE.md) for architecture
3. Reference [DEPLOYMENT.md](./DEPLOYMENT.md) for deployment procedures
4. Setup monitoring per [MONITORING.md](./MONITORING.md)
5. Plan capacity using [SCALING.md](./SCALING.md)

**Developers:**

1. Read [CLAUDE.md](./CLAUDE.md) for project overview
2. Learn deployment process from [DEPLOYMENT.md](./DEPLOYMENT.md)
3. Understand CI/CD from [CICD.md](./CICD.md)
4. Reference [MONITORING.md](./MONITORING.md) for logging

**Site Reliability Engineers (SRE):**

1. Study [MONITORING.md](./MONITORING.md) for observability
2. Review [SCALING.md](./SCALING.md) for performance
3. Master [DISASTER_RECOVERY.md](./DISASTER_RECOVERY.md) for incidents
4. Understand [INFRASTRUCTURE.md](./INFRASTRUCTURE.md) for architecture

**Management:**

1. Review [DEVOPS.md](./DEVOPS.md) for overview
2. Understand costs in [INFRASTRUCTURE.md](./INFRASTRUCTURE.md)
3. Review SLAs in [MONITORING.md](./MONITORING.md)
4. Review DR plan in [DISASTER_RECOVERY.md](./DISASTER_RECOVERY.md)

### By Task

**Deploying:**

- Web app → [DEPLOYMENT.md#web-application-deployment](./DEPLOYMENT.md#web-application-deployment)
- Desktop app → [DEPLOYMENT.md#desktop-application-deployment](./DEPLOYMENT.md#desktop-application-deployment)
- Backend services → [DEPLOYMENT.md#backend-services-deployment](./DEPLOYMENT.md#backend-services-deployment)

**Troubleshooting:**

- Service down → [DISASTER_RECOVERY.md#disaster-scenarios](./DISASTER_RECOVERY.md#disaster-scenarios)
- Performance issues → [SCALING.md#performance-optimization](./SCALING.md#performance-optimization)
- Build failures → [CICD.md#troubleshooting](./CICD.md#troubleshooting)
- Monitoring gaps → [MONITORING.md#troubleshooting](./MONITORING.md#troubleshooting)

**Scaling:**

- Capacity planning → [SCALING.md#capacity-planning](./SCALING.md#capacity-planning)
- Database scaling → [SCALING.md#database-scaling](./SCALING.md#database-scaling)
- Load testing → [SCALING.md#load-testing](./SCALING.md#load-testing)

**Incidents:**

- Incident response → [MONITORING.md#incident-response](./MONITORING.md#incident-response)
- Recovery procedures → [DISASTER_RECOVERY.md#recovery-procedures](./DISASTER_RECOVERY.md#recovery-procedures)
- Communication → [DISASTER_RECOVERY.md#business-continuity](./DISASTER_RECOVERY.md#business-continuity)

## Key Information at a Glance

### System Architecture

```
Production Environment
├── Web App (Next.js 16 on Vercel)
│   ├── Database: Supabase PostgreSQL
│   ├── Cache: Upstash Redis
│   └── CDN: Vercel Edge Network
│
├── Desktop App (Tauri 2.9)
│   ├── Frontend: React 19 + Vite 7
│   ├── Backend: Rust + Tokio
│   └── Database: SQLite (local)
│
└── Backend Services (Node.js)
    ├── API Gateway (Port 3000)
    └── Signaling Server (Port 4000)
```

### Service Level Objectives (SLOs)

| Metric             | Target  | Current  |
| ------------------ | ------- | -------- |
| Availability       | 99.9%   | 99.95% ✓ |
| API Response (P95) | < 500ms | ~350ms ✓ |
| Page Load (P75)    | < 2s    | ~1.5s ✓  |
| Error Rate         | < 0.5%  | ~0.2% ✓  |

### Recovery Objectives

| Service        | RTO        | RPO        |
| -------------- | ---------- | ---------- |
| Web App        | 1 hour     | 15 minutes |
| Database       | 1 hour     | 1 hour     |
| Authentication | 30 minutes | 15 minutes |
| Desktop App    | 4 hours    | 24 hours   |

### Monthly Costs

| Service   | Cost     | Purpose          |
| --------- | -------- | ---------------- |
| Vercel    | $20      | Web hosting      |
| Supabase  | $25      | Database + Auth  |
| Upstash   | $10      | Redis cache      |
| Sentry    | $26      | Error tracking   |
| **Total** | **~$90** | Excluding Stripe |

## Getting Started

### For New Team Members

**Day 1: Orientation**

```bash
# 1. Read overview
cat DEVOPS.md

# 2. Clone repository
git clone https://github.com/your-org/agiworkforce.git
cd agiworkforce

# 3. Setup environment
cp apps/web/.env.example apps/web/.env.local
cp apps/desktop/.env.example apps/desktop/.env.local
# Edit with actual values

# 4. Install dependencies
pnpm install

# 5. Start development
pnpm dev:desktop
```

**Week 1: Learning**

- Read all documentation (1-2 hours per doc)
- Setup local development environment
- Deploy to preview environment
- Join #devops Slack channel
- Shadow on-call rotation

**Month 1: Contributing**

- Deploy to production (with supervision)
- Participate in incident response
- Conduct DR drill
- Improve documentation

### Essential Commands

**Development:**

```bash
pnpm dev:desktop          # Start desktop app
cd apps/web && pnpm dev   # Start web app
pnpm test                 # Run all tests
pnpm lint                 # Lint code
pnpm typecheck:all        # Type check
```

**Deployment:**

```bash
git push origin main      # Deploy web app (auto via Vercel)
git tag v1.0.5            # Create release tag
git push origin v1.0.5    # Deploy desktop app (auto via GitHub Actions)
```

**Operations:**

```bash
vercel logs               # View web app logs
gh run watch              # Monitor CI/CD pipeline
pm2 monit                 # Monitor backend services
supabase logs db          # View database logs
```

**Monitoring:**

```bash
curl https://agiworkforce.com/api/health  # Health check
vercel inspect --wait                     # Inspect deployment
gh api /repos/org/repo/actions/runs       # Check CI status
```

## Best Practices

### Development Workflow

1. **Create feature branch**

   ```bash
   git checkout -b feature/new-feature
   ```

2. **Develop and test locally**

   ```bash
   pnpm test
   pnpm lint:fix
   pnpm typecheck:all
   ```

3. **Create pull request**
   - CI runs automatically
   - Preview deployment created
   - Request code review

4. **Merge to main**
   - Production deployment (web) automatic
   - Desktop release via tag

### Deployment Best Practices

- **Test locally first:** Build and test before deploying
- **Preview deployments:** Use Vercel preview URLs for testing
- **Deploy during low traffic:** Minimize user impact
- **Monitor after deploy:** Watch metrics for 30 minutes
- **Have rollback ready:** Know how to quickly rollback
- **Communicate:** Notify team before/after deployments

### Monitoring Best Practices

- **Set meaningful alerts:** Avoid alert fatigue
- **Track business metrics:** Not just technical metrics
- **Use dashboards:** Visualize trends
- **Regular reviews:** Weekly metric reviews
- **Document incidents:** Learn from failures
- **Test monitoring:** Ensure alerts work

### Security Best Practices

- **Never commit secrets:** Use environment variables
- **Rotate secrets regularly:** Quarterly rotation
- **Use 2FA everywhere:** Especially critical services
- **Review access regularly:** Remove unused access
- **Monitor for threats:** Watch audit logs
- **Keep dependencies updated:** Security patches

## Emergency Procedures

### Critical Incident (P1)

**Immediate Actions:**

1. Alert on-call engineer (PagerDuty)
2. Create incident channel (#incident-YYYYMMDD)
3. Update status page
4. Begin investigation

**Communication:**

- Internal: Every 30 minutes in incident channel
- External: Every hour on status page
- Escalation: After 2 hours if unresolved

**Resolution:**

1. Identify root cause
2. Apply fix or rollback
3. Verify resolution
4. Post-mortem within 48 hours

### Service Degradation (P2)

**Actions:**

1. Notify team in #devops
2. Investigate within 1 hour
3. Apply fix within 4 hours
4. Update documentation

### Quick Reference: Rollback

**Web App:**

```bash
vercel rollback <previous-url>
# Or via dashboard: Deployments → Previous → Promote
```

**Desktop App:**

```bash
gh release edit v1.0.5 --draft  # Hide problematic release
# Deploy hotfix with new tag
```

**Database:**

```
Supabase Dashboard → Database → Backups → Restore
```

## Support and Resources

### Internal Resources

- **Documentation:** This repository
- **Slack Channels:**
  - #devops - General discussion
  - #incidents - Active incidents
  - #deploys - Deployment notifications
- **Runbooks:** See individual docs
- **Monitoring Dashboards:**
  - Sentry: https://sentry.io
  - Vercel: https://vercel.com/dashboard
  - Supabase: https://supabase.com/dashboard

### External Resources

- **Vercel Docs:** https://vercel.com/docs
- **Supabase Docs:** https://supabase.com/docs
- **Next.js Docs:** https://nextjs.org/docs
- **Tauri Docs:** https://tauri.app/v2/guides/
- **Rust Docs:** https://doc.rust-lang.org/

### Status Pages

- **Vercel:** https://www.vercel-status.com/
- **Supabase:** https://status.supabase.com/
- **GitHub:** https://www.githubstatus.com/
- **Stripe:** https://status.stripe.com/

### Emergency Contacts

| Role                | Responsibility     | Contact   |
| ------------------- | ------------------ | --------- |
| On-Call             | Immediate response | PagerDuty |
| DevOps Lead         | Infrastructure     | [contact] |
| Backend Lead        | Services & DB      | [contact] |
| Security Lead       | Security incidents | [contact] |
| Engineering Manager | Escalation         | [contact] |

## Maintenance Schedule

### Daily (Automated)

- Health checks
- Backup verification
- Error monitoring
- Performance tracking

### Weekly

- Dependency updates (Dependabot)
- Cost review
- Capacity check
- Documentation updates

### Monthly

- Backup restore test
- Security audit review
- Performance optimization
- Team retrospective

### Quarterly

- Disaster recovery drill
- Infrastructure audit
- Load testing
- Documentation review

### Annually

- Full DR test
- Security penetration test
- Architecture review
- Tool evaluation

## Contributing to Documentation

### Making Updates

1. **Identify what needs updating**
   - New features
   - Process changes
   - Lessons learned
   - Feedback from team

2. **Update relevant document**

   ```bash
   vim DEPLOYMENT.md  # Edit file
   ```

3. **Test procedures**
   - Verify commands work
   - Check links
   - Validate examples

4. **Submit changes**

   ```bash
   git add DEPLOYMENT.md
   git commit -m "docs: update deployment procedures"
   git push origin main
   ```

5. **Announce changes**
   - Post in #devops
   - Update team in standup

### Documentation Standards

- **Keep it current:** Update with code changes
- **Be specific:** Include exact commands
- **Use examples:** Show, don't just tell
- **Add diagrams:** Visualize architecture
- **Version control:** Track all changes in git
- **Review regularly:** Quarterly reviews

## Version History

| Version | Date       | Changes                                          | Author      |
| ------- | ---------- | ------------------------------------------------ | ----------- |
| 1.0.0   | 2026-01-15 | Initial comprehensive DevOps documentation suite | DevOps Team |

## License

This documentation is proprietary and confidential. For internal use only.

---

**Documentation Suite Created:** 2026-01-15
**Last Updated:** 2026-01-15
**Next Review:** 2026-04-15
**Maintained By:** DevOps Team

For questions, suggestions, or issues with documentation:

- Open GitHub issue with label `documentation`
- Post in #devops Slack channel
- Contact DevOps Lead directly

**Remember:** Good documentation is living documentation. Keep it updated!
