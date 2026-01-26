# Disaster Recovery Plan

Comprehensive disaster recovery procedures for AGI Workforce infrastructure and data.

## Table of Contents

- [Overview](#overview)
- [Recovery Objectives](#recovery-objectives)
- [Backup Strategy](#backup-strategy)
- [Recovery Procedures](#recovery-procedures)
- [Disaster Scenarios](#disaster-scenarios)
- [Business Continuity](#business-continuity)
- [Testing](#testing)
- [Contact Information](#contact-information)

## Overview

This document outlines procedures for recovering from infrastructure failures, data loss, and other disaster scenarios.

### Scope

**Covered Systems:**

- Web application (Vercel + Next.js)
- Desktop application (Tauri)
- Backend services (Node.js)
- Databases (Supabase PostgreSQL, SQLite)
- External integrations (Stripe, LLM providers)

**Recovery Types:**

- **Infrastructure Recovery:** Restore services after failure
- **Data Recovery:** Restore data from backups
- **Configuration Recovery:** Restore configuration and settings
- **Account Recovery:** Regain access to external services

## Recovery Objectives

### Service Level Targets

| Service              | RTO        | RPO        | Priority |
| -------------------- | ---------- | ---------- | -------- |
| **Web App**          | 1 hour     | 15 minutes | Critical |
| **Desktop App**      | 4 hours    | 24 hours   | High     |
| **API Gateway**      | 2 hours    | 1 hour     | Critical |
| **Signaling Server** | 2 hours    | 1 hour     | High     |
| **Database**         | 1 hour     | 1 hour     | Critical |
| **Authentication**   | 30 minutes | 15 minutes | Critical |

**Definitions:**

- **RTO (Recovery Time Objective):** Maximum acceptable downtime
- **RPO (Recovery Point Objective):** Maximum acceptable data loss
- **Priority:** Impact level if service is down

### Impact Analysis

**Critical Services (P1):**

- Web application (all users affected)
- Authentication (no user access)
- Database (data unavailable)
- Payment processing (revenue impact)

**High Priority Services (P2):**

- Desktop application (existing users functional)
- Backend services (sync disabled)
- Monitoring (blind to issues)

**Medium Priority Services (P3):**

- Analytics (reporting delayed)
- Email notifications (delayed alerts)
- Documentation (temporary workaround possible)

## Backup Strategy

### Automated Backups

**Supabase Database:**

```
Backup Type: Automated
Frequency: Daily
Retention: 7 days
Location: Supabase managed storage
Format: PostgreSQL dump

Point-in-time Recovery:
- Available: Last 7 days
- Granularity: Any point in time
- Restore time: ~15-30 minutes
```

**Access backups:**

1. Login to Supabase dashboard
2. Navigate to Database → Backups
3. Select backup date/time
4. Click "Restore" or "Download"

**Desktop SQLite Databases:**

```
Backup Type: User-managed
Frequency: User discretion
Location: User's device + optional cloud sync
Format: SQLite database file

Automatic backup locations:
- macOS: Time Machine (if enabled)
- Windows: File History (if enabled)
- Linux: User-configured backup solution
```

**Source Code:**

```
Backup Type: Version control
Location: GitHub (primary), local clones
Retention: Unlimited
Recovery: git clone or checkout
```

**Configuration:**

```
Backup Type: Version control + secrets management
Location:
  - Public config: GitHub
  - Secrets: Vercel dashboard, GitHub Secrets
Retention: Unlimited (code), varies (secrets)
```

### Manual Backup Procedures

**Database Manual Backup:**

```bash
# Full database backup
pg_dump -h db.yourproject.supabase.co \
        -U postgres \
        -F c \
        -f backup_$(date +%Y%m%d_%H%M%S).dump \
        postgres

# Schema only
pg_dump -h db.yourproject.supabase.co \
        -U postgres \
        -s \
        -f schema_$(date +%Y%m%d_%H%M%S).sql \
        postgres

# Data only
pg_dump -h db.yourproject.supabase.co \
        -U postgres \
        -a \
        -f data_$(date +%Y%m%d_%H%M%S).sql \
        postgres

# Specific tables
pg_dump -h db.yourproject.supabase.co \
        -U postgres \
        -t subscriptions -t profiles \
        -f critical_tables_$(date +%Y%m%d_%H%M%S).sql \
        postgres
```

**Environment Variables Backup:**

```bash
# Export from Vercel
vercel env pull .env.production

# Export from GitHub Actions (manually copy from settings)
# Settings → Secrets and variables → Actions

# Store in secure location (1Password, AWS Secrets Manager, etc.)
```

**Configuration Backup:**

```bash
# Clone entire repository
git clone --mirror https://github.com/org/agiworkforce.git agiworkforce-backup

# Backup specific configs
tar -czf configs_$(date +%Y%m%d).tar.gz \
    vercel.json \
    apps/web/vercel.json \
    apps/desktop/src-tauri/tauri.conf.json \
    .github/workflows/*.yml
```

### Backup Verification

**Regular Testing:**

```bash
# Monthly backup verification checklist

□ Download latest database backup
□ Restore to test environment
□ Verify data integrity
  - Row counts match
  - Sample queries return expected results
  - Foreign keys intact
□ Test application functionality
□ Document results
□ Update procedures if needed
```

**Automated Verification:**

```sql
-- Verify backup integrity
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
    (SELECT count(*) FROM pg_tables WHERE schemaname = 'public') as table_count
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Verify critical tables
SELECT count(*) FROM profiles;
SELECT count(*) FROM subscriptions WHERE status = 'active';
SELECT count(*) FROM processed_stripe_events;
```

## Recovery Procedures

### Database Recovery

**Scenario: Complete Database Loss**

**Steps:**

1. **Assess Situation**

   ```bash
   # Check if database is accessible
   psql -h db.yourproject.supabase.co -U postgres -d postgres -c "SELECT 1"

   # If connection fails, proceed with recovery
   ```

2. **Contact Supabase Support**

   ```
   Email: support@supabase.com
   Subject: URGENT - Database Recovery Needed
   Include: Project ID, timestamp of issue
   ```

3. **Restore from Backup**

   ```
   Via Supabase Dashboard:
   1. Login to dashboard.supabase.com
   2. Select project
   3. Database → Backups
   4. Select most recent valid backup
   5. Click "Restore"
   6. Confirm restoration (WARNING: This will overwrite current data)
   7. Wait for restoration (15-30 minutes)
   ```

4. **Verify Restoration**

   ```sql
   -- Check row counts
   SELECT 'profiles' as table, count(*) FROM profiles
   UNION ALL
   SELECT 'subscriptions', count(*) FROM subscriptions
   UNION ALL
   SELECT 'beta_invites', count(*) FROM beta_invites;

   -- Check recent data
   SELECT * FROM subscriptions ORDER BY created_at DESC LIMIT 10;

   -- Verify constraints
   SELECT conname, contype
   FROM pg_constraint
   WHERE connamespace = 'public'::regnamespace;
   ```

5. **Resume Services**

   ```bash
   # Test database connection
   curl https://agiworkforce.com/api/health

   # Monitor for errors
   # Check Sentry dashboard
   ```

**Scenario: Data Corruption**

**Steps:**

1. **Identify Corrupted Data**

   ```sql
   -- Check for anomalies
   SELECT * FROM subscriptions WHERE stripe_customer_id IS NULL;
   SELECT * FROM profiles WHERE email NOT LIKE '%@%';
   ```

2. **Stop Writes to Affected Tables**

   ```sql
   -- Revoke write permissions temporarily
   REVOKE INSERT, UPDATE, DELETE ON subscriptions FROM authenticated;
   ```

3. **Export Good Data**

   ```sql
   -- Export uncorrupted records
   COPY (
       SELECT * FROM subscriptions
       WHERE created_at < '2026-01-15 10:00:00'
   ) TO '/tmp/good_data.csv' WITH CSV HEADER;
   ```

4. **Restore from Backup**

   ```sql
   -- Restore specific table from backup
   pg_restore -h db.yourproject.supabase.co \
              -U postgres \
              -d postgres \
              -t subscriptions \
              backup.dump
   ```

5. **Merge Good Data**

   ```sql
   -- Re-insert any valid data created after backup
   -- Use transactions for safety
   BEGIN;
   INSERT INTO subscriptions SELECT * FROM temp_valid_subscriptions;
   COMMIT;
   ```

6. **Restore Permissions**
   ```sql
   GRANT INSERT, UPDATE, DELETE ON subscriptions TO authenticated;
   ```

**Scenario: Accidental Deletion**

**Steps:**

1. **Stop Further Changes**

   ```sql
   -- Immediately revoke write access
   REVOKE DELETE ON profiles FROM authenticated;
   ```

2. **Check Point-in-Time Recovery**

   ```
   Supabase Dashboard → Database → Backups → Point-in-time Recovery
   Select timestamp BEFORE deletion occurred
   ```

3. **Restore Deleted Data**

   ```sql
   -- Option 1: PITR (Point-in-time recovery)
   -- Via Supabase dashboard

   -- Option 2: If recent, use backup
   pg_restore -h db.yourproject.supabase.co \
              -U postgres \
              -d postgres \
              -t profiles \
              backup.dump
   ```

4. **Verify Recovery**

   ```sql
   SELECT count(*) FROM profiles;
   SELECT * FROM profiles WHERE id = 'deleted_user_id';
   ```

5. **Restore Permissions**
   ```sql
   GRANT DELETE ON profiles TO authenticated;
   ```

### Application Recovery

**Scenario: Web App Down**

**Steps:**

1. **Identify Issue**

   ```bash
   # Check Vercel status
   curl https://www.vercel-status.com/api/v2/status.json

   # Check deployment status
   vercel ls

   # Check logs
   vercel logs
   ```

2. **Quick Fixes**

   ```bash
   # Option 1: Rollback to previous deployment
   vercel rollback <previous-deployment-url>

   # Option 2: Redeploy
   vercel deploy --prod

   # Option 3: Rollback via git
   git revert <bad-commit>
   git push origin main
   # Vercel auto-deploys
   ```

3. **Verify Recovery**

   ```bash
   curl https://agiworkforce.com/api/health
   curl https://agiworkforce.com/
   ```

4. **Monitor**
   ```bash
   # Watch metrics in Vercel dashboard
   # Check error rate in Sentry
   # Monitor user reports
   ```

**Scenario: Desktop App Issues**

**Steps:**

1. **Identify Scope**

   ```
   - Single user issue: User support
   - Multiple users: Check GitHub releases
   - All users: Investigate release
   ```

2. **Immediate Actions**

   ```bash
   # Mark problematic release as draft
   gh release edit v1.0.5 --draft

   # Notify users via:
   # - In-app notification
   # - Email (if critical)
   # - Website banner
   ```

3. **Fix and Release**

   ```bash
   # Create hotfix
   git checkout -b hotfix/v1.0.6
   # Fix issue
   git commit -m "fix: critical bug"

   # Bump version
   # Update tauri.conf.json and Cargo.toml

   # Tag and push
   git tag v1.0.6
   git push origin v1.0.6
   ```

4. **Verify**
   ```bash
   # Test auto-updater
   # Monitor error reports
   # Check GitHub release downloads
   ```

### Infrastructure Recovery

**Scenario: Vercel Outage**

**Steps:**

1. **Check Status**

   ```bash
   # Vercel status page
   curl https://www.vercel-status.com/api/v2/status.json
   ```

2. **Communicate**

   ```
   - Update status page (if separate)
   - Notify users via:
     - Social media
     - Email
     - In-app message (if accessible)
   ```

3. **Temporary Workarounds**

   ```bash
   # Option 1: Serve from alternate hosting (if available)
   # Option 2: Static fallback page
   # Option 3: CDN cache (if configured)
   ```

4. **Wait for Resolution**
   ```
   - Monitor Vercel status updates
   - Prepare for resumption
   - Test services as soon as available
   ```

**Scenario: Supabase Outage**

**Steps:**

1. **Check Status**

   ```bash
   curl https://status.supabase.com/api/v2/status.json
   ```

2. **Enable Degraded Mode**

   ```typescript
   // Fallback to read-only mode
   if (!isDatabaseAvailable()) {
     return {
       mode: 'read-only',
       message: 'Service temporarily degraded. New changes unavailable.',
     };
   }
   ```

3. **Queue Operations**

   ```typescript
   // Queue writes for later processing
   const writeQueue = [];

   async function queueWrite(operation) {
     writeQueue.push({
       timestamp: Date.now(),
       operation,
     });
     await saveQueueToLocalStorage(writeQueue);
   }
   ```

4. **Resume Normal Operation**
   ```typescript
   // Process queued operations
   async function processQueue() {
     for (const item of writeQueue) {
       await retryOperation(item.operation);
     }
     writeQueue = [];
   }
   ```

**Scenario: Complete Infrastructure Loss**

**Steps:**

1. **Activate Disaster Recovery Team**

   ```
   Contact:
   - DevOps Lead
   - Backend Lead
   - Engineering Manager
   - Executive Team
   ```

2. **Assess Damage**

   ```
   Checklist:
   □ Web app accessible?
   □ Database accessible?
   □ Authentication working?
   □ Payment processing functional?
   □ Backend services responding?
   ```

3. **Prioritize Recovery**

   ```
   Order:
   1. Database (data integrity)
   2. Authentication (user access)
   3. Web app (user interface)
   4. Payment processing (revenue)
   5. Backend services (sync)
   6. Monitoring (visibility)
   ```

4. **Execute Recovery**

   ```bash
   # Follow procedures for each component
   # See specific scenarios above
   ```

5. **Communicate Throughout**

   ```
   Internal:
   - Hourly status updates
   - Slack #incident channel

   External:
   - Status page updates every 30 minutes
   - Email if critical/extended
   ```

## Disaster Scenarios

### Scenario 1: Account Compromise

**Threat:** Attacker gains access to Vercel, Supabase, or GitHub account

**Detection:**

- Unusual login location
- Unexpected deployments
- Configuration changes
- Billing anomalies

**Response:**

1. **Immediate Actions**

   ```
   □ Revoke all API tokens
   □ Change all passwords
   □ Enable 2FA if not already enabled
   □ Log out all sessions
   □ Review audit logs
   ```

2. **Assess Damage**

   ```
   □ Check for unauthorized deployments
   □ Review database access logs
   □ Check for data exfiltration
   □ Review code changes
   □ Check billing for abuse
   ```

3. **Remediation**

   ```
   □ Rollback unauthorized changes
   □ Restore from last known good state
   □ Rotate all secrets and API keys
   □ Update all affected services
   □ Notify affected users (if data breach)
   ```

4. **Prevention**
   ```
   □ Enforce 2FA on all accounts
   □ Use SSO where possible
   □ Regular security audits
   □ IP whitelisting (if feasible)
   □ Audit log monitoring
   ```

### Scenario 2: Data Breach

**Threat:** Unauthorized access to user data

**Detection:**

- Unusual database queries
- High data export volumes
- Security audit alerts
- User reports

**Response:**

1. **Immediate Actions**

   ```
   □ Isolate affected systems
   □ Revoke compromised credentials
   □ Block suspicious IP addresses
   □ Preserve evidence (logs)
   □ Notify security team
   ```

2. **Assess Impact**

   ```
   □ Identify compromised data
   □ Number of affected users
   □ Type of data exposed
   □ Duration of exposure
   □ Compliance implications (GDPR, etc.)
   ```

3. **Notification**

   ```
   Legal requirements (GDPR):
   - Notify supervisory authority within 72 hours
   - Notify affected users without undue delay
   - Document breach details

   User notification:
   - Email affected users
   - Detail what data was exposed
   - Actions taken to resolve
   - Recommended user actions
   ```

4. **Remediation**
   ```
   □ Patch vulnerability
   □ Force password resets (if needed)
   □ Enhanced monitoring
   □ Security audit
   □ Implement additional controls
   ```

### Scenario 3: DDoS Attack

**Threat:** Service unavailable due to traffic overload

**Detection:**

- Sudden traffic spike
- Increased error rates
- Slow response times
- Monitoring alerts

**Response:**

1. **Immediate Actions**

   ```
   □ Enable DDoS protection (if available)
   □ Rate limiting (Upstash)
   □ Block malicious IPs
   □ Contact Vercel support
   ```

2. **Mitigation**

   ```
   Vercel (automatic):
   - DDoS protection enabled by default
   - Rate limiting at edge
   - Automatic scaling

   Application-level:
   - Enable stricter rate limits
   - Implement CAPTCHA
   - Require authentication
   - Cache aggressively
   ```

3. **Monitoring**

   ```
   □ Traffic patterns
   □ Error rates
   □ Response times
   □ Resource utilization
   ```

4. **Recovery**
   ```
   □ Gradually remove restrictions
   □ Monitor for repeat attacks
   □ Implement permanent protections
   □ Document incident
   ```

### Scenario 4: Ransomware

**Threat:** Systems encrypted by ransomware

**Response:**

1. **DO NOT PAY RANSOM**

2. **Immediate Actions**

   ```
   □ Isolate infected systems
   □ Disconnect from network
   □ Preserve evidence
   □ Contact law enforcement
   □ Contact security firm
   ```

3. **Recovery**

   ```
   □ Restore from backups
   □ Rebuild infected systems
   □ Patch vulnerabilities
   □ Enhanced monitoring
   □ Security audit
   ```

4. **Prevention**
   ```
   □ Regular backups (offline)
   □ Up-to-date systems
   □ Security training
   □ Email filtering
   □ Endpoint protection
   ```

## Business Continuity

### Critical Dependencies

| Dependency       | Impact if Down             | Mitigation                     |
| ---------------- | -------------------------- | ------------------------------ |
| Vercel           | Web app unavailable        | None (rely on Vercel SLA)      |
| Supabase         | Data unavailable           | Backups + PITR                 |
| Stripe           | Payment processing stopped | Queue transactions             |
| OpenAI/Anthropic | LLM features down          | Failover to alternate provider |
| GitHub           | CI/CD stopped              | Manual deployments possible    |

### Communication Plan

**Internal Communication:**

```
Channel: Slack #incidents
Frequency: Every 30 minutes during active incident
Format:
  - Current status
  - Actions taken
  - Next steps
  - ETA (if known)
```

**External Communication:**

```
Channels:
  - Status page (status.agiworkforce.com)
  - Email (critical issues only)
  - In-app banner
  - Social media (@agiworkforce)

Frequency:
  - Initial notification: Immediate
  - Updates: Every hour
  - Resolution: Immediate

Templates:
  - Incident detected
  - Investigating
  - Mitigation in progress
  - Resolved
  - Post-mortem
```

### Alternate Contacts

```
Primary: DevOps Lead
  Phone: [REDACTED]
  Email: [REDACTED]

Secondary: Engineering Manager
  Phone: [REDACTED]
  Email: [REDACTED]

Escalation: CTO
  Phone: [REDACTED]
  Email: [REDACTED]

External Support:
  Vercel: support@vercel.com
  Supabase: support@supabase.com
  Stripe: support@stripe.com
```

## Testing

### Regular Drills

**Monthly: Backup Verification**

```
□ Download latest backup
□ Restore to test environment
□ Verify data integrity
□ Test application functionality
□ Document time taken
□ Update procedures
```

**Quarterly: Disaster Recovery Drill**

```
□ Simulate major outage
□ Execute recovery procedures
□ Time each step
□ Identify gaps/improvements
□ Update runbooks
□ Train team members
```

**Annually: Full DR Test**

```
□ Complete infrastructure recovery
□ Restore from backups
□ Test all applications
□ Verify data integrity
□ Test failover procedures
□ Document results
□ Update plan
```

### Test Checklist

```
Pre-Test:
□ Schedule test (off-hours)
□ Notify team
□ Prepare test environment
□ Backup current state
□ Document test plan

During Test:
□ Follow procedures exactly
□ Time each step
□ Document issues/blockers
□ Take screenshots
□ Note improvements

Post-Test:
□ Verify recovery successful
□ Calculate RTO/RPO achieved
□ Document lessons learned
□ Update procedures
□ Schedule next test
```

## Contact Information

### Emergency Contacts

**Internal:**

- DevOps Lead: [contact]
- Backend Lead: [contact]
- Security Lead: [contact]
- Engineering Manager: [contact]
- On-Call: [PagerDuty]

**External Support:**

- Vercel Support: support@vercel.com
- Supabase Support: support@supabase.com
- Stripe Support: support@stripe.com
- GitHub Support: support@github.com
- Security Incident: security@agiworkforce.com

### Escalation Path

```
L1 → On-Call Engineer
      ↓ (30 min)
L2 → DevOps Lead
      ↓ (1 hour)
L3 → Engineering Manager
      ↓ (2 hours)
L4 → CTO
      ↓ (4 hours)
L5 → CEO
```

---

**Last Updated:** 2026-01-15
**Version:** 1.0
**Maintained By:** DevOps Team

**Review Schedule:** Quarterly
**Next Review:** 2026-04-15

This is a living document. Update after every incident and after every DR test.
