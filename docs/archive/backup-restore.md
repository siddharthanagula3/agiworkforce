# Database Backup and Restore Procedures

Comprehensive guide to backup strategies, disaster recovery, and data protection for AGI Workforce databases.

## Table of Contents

1. [Backup Strategy Overview](#backup-strategy-overview)
2. [Supabase PostgreSQL Backup](#supabase-postgresql-backup)
3. [SQLite Desktop Backup](#sqlite-desktop-backup)
4. [Disaster Recovery](#disaster-recovery)
5. [Data Retention Policies](#data-retention-policies)
6. [Testing and Validation](#testing-and-validation)
7. [Security Considerations](#security-considerations)

---

## Backup Strategy Overview

### Backup Types

#### Full Backup

Complete copy of entire database.

- **Frequency**: Daily
- **Retention**: 30 days
- **Use case**: Disaster recovery, complete restore

#### Incremental Backup

Only changes since last backup.

- **Frequency**: Hourly
- **Retention**: 7 days
- **Use case**: Point-in-time recovery

#### Snapshot Backup

Point-in-time copy of database state.

- **Frequency**: Before major changes
- **Retention**: 90 days
- **Use case**: Pre-deployment safety net

#### Logical Backup

SQL dump of schema and data.

- **Frequency**: Weekly
- **Retention**: 90 days
- **Use case**: Cross-version compatibility, auditing

---

### Backup Schedule

```
Daily Schedule:
00:00 UTC - Full backup (Supabase)
Every 4 hours - SQLite sync to cloud
Weekly - Schema export and validation

Manual Backups:
- Before production deployments
- Before schema migrations
- Before data migrations
- On user request (export feature)
```

---

### 3-2-1 Backup Rule

**3** copies of data:

- Production database
- Local backup
- Cloud backup

**2** different media types:

- Supabase storage (PostgreSQL)
- AWS S3 / Cloud storage (SQLite)

**1** offsite copy:

- Cross-region replication

---

## Supabase PostgreSQL Backup

### Automatic Backups

Supabase provides automatic daily backups:

```bash
# View backup status
supabase db remote --project-id your-project-id

# Backups are automatic, view in dashboard:
# https://app.supabase.com/project/your-project-id/database/backups
```

**Configuration**:

- **Frequency**: Daily at 02:00 UTC
- **Retention**: 7 days (free tier), 30 days (pro tier)
- **Type**: Physical backup (pg_basebackup)

---

### Manual Backup (pg_dump)

#### Full Database Dump

```bash
# Using Supabase CLI
supabase db dump -f backup_$(date +%Y%m%d_%H%M%S).sql

# Or using pg_dump directly
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# With compression
pg_dump $DATABASE_URL | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

#### Schema-Only Dump

```bash
# Export schema without data
pg_dump --schema-only $DATABASE_URL > schema_$(date +%Y%m%d).sql

# Useful for:
# - Documentation
# - Development environment setup
# - Schema comparison
```

#### Data-Only Dump

```bash
# Export data without schema
pg_dump --data-only $DATABASE_URL > data_$(date +%Y%m%d).sql

# Or in custom format (faster, compressed)
pg_dump --data-only -Fc $DATABASE_URL > data_$(date +%Y%m%d).dump
```

#### Specific Table Dump

```bash
# Single table
pg_dump -t public.profiles $DATABASE_URL > profiles_backup.sql

# Multiple tables
pg_dump -t public.profiles -t public.subscriptions $DATABASE_URL > user_data_backup.sql

# Exclude tables
pg_dump --exclude-table=public.audit_logs $DATABASE_URL > backup_without_logs.sql
```

---

### Point-in-Time Recovery (PITR)

**Available on**: Supabase Pro and higher

**Enable PITR**:

```bash
# Via Supabase dashboard: Settings > Database > Point in Time Recovery
# Retention: 7 days
```

**Restore to specific time**:

```bash
# Create new project from PITR
# Dashboard: New Project > Restore from existing project > Select timestamp
```

**Use cases**:

- Recover from accidental deletion
- Investigate data at specific time
- Rollback failed deployment

---

### Automated Backup Script

```bash
#!/bin/bash
# automated_backup.sh

set -e

# Configuration
PROJECT_ID="your-project-id"
BACKUP_DIR="/var/backups/supabase"
RETENTION_DAYS=30
S3_BUCKET="s3://your-backup-bucket"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Generate filename with timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup_$TIMESTAMP.sql.gz"

# Get database URL (use service_role key for full access)
DATABASE_URL="postgresql://postgres:[SERVICE_ROLE_PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres"

# Perform backup
echo "Starting backup at $(date)"
pg_dump "$DATABASE_URL" | gzip > "$BACKUP_FILE"

# Verify backup
if [ -s "$BACKUP_FILE" ]; then
    echo "Backup created successfully: $BACKUP_FILE"
    SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "Backup size: $SIZE"
else
    echo "ERROR: Backup file is empty or missing"
    exit 1
fi

# Upload to S3
echo "Uploading to S3..."
aws s3 cp "$BACKUP_FILE" "$S3_BUCKET/supabase/"

# Clean up old local backups
find "$BACKUP_DIR" -name "backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete

# Clean up old S3 backups (optional, if using S3 lifecycle policies)
# aws s3 ls "$S3_BUCKET/supabase/" | grep "backup_" | sort | head -n -$RETENTION_DAYS | \
#   awk '{print $4}' | xargs -I {} aws s3 rm "$S3_BUCKET/supabase/{}"

echo "Backup completed at $(date)"

# Send notification (optional)
# curl -X POST https://your-webhook-url \
#   -H "Content-Type: application/json" \
#   -d "{\"message\": \"Supabase backup completed\", \"size\": \"$SIZE\"}"
```

**Setup cron job**:

```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * /path/to/automated_backup.sh >> /var/log/supabase_backup.log 2>&1
```

---

### Restore from Backup

#### Full Restore

```bash
# WARNING: This will drop and recreate the database
# Always test on development first!

# Method 1: Using psql
gunzip < backup_20260115_020000.sql.gz | psql $DATABASE_URL

# Method 2: Using pg_restore (for custom format)
pg_restore -d $DATABASE_URL -c backup_20260115_020000.dump

# Method 3: Using Supabase CLI (safest)
supabase db reset --db-url $DATABASE_URL
gunzip < backup_20260115_020000.sql.gz | psql $DATABASE_URL
```

#### Selective Restore

```bash
# Restore specific table
pg_restore -d $DATABASE_URL -t profiles backup.dump

# Restore only data (preserve schema changes)
pg_restore -d $DATABASE_URL --data-only backup.dump

# Restore with transaction (rollback on error)
pg_restore -d $DATABASE_URL --single-transaction backup.dump
```

#### Pre-Restore Checklist

- [ ] Verify backup file integrity
- [ ] Test restore on development environment
- [ ] Notify users of maintenance window
- [ ] Take snapshot of current database
- [ ] Stop application (prevent writes during restore)
- [ ] Document reason for restore
- [ ] Have rollback plan ready

---

## SQLite Desktop Backup

### Automatic Backups

SQLite database location:

```
macOS:    ~/Library/Application Support/agiworkforce/agiworkforce.db
Windows:  %APPDATA%\agiworkforce\agiworkforce.db
Linux:    ~/.config/agiworkforce/agiworkforce.db
```

### Backup Methods

#### 1. File Copy (Safest)

```rust
// In Rust (Tauri)
use std::fs;
use std::path::Path;

pub fn backup_database(db_path: &Path) -> Result<PathBuf, Error> {
    // Ensure database is not being written
    let backup_path = db_path.with_extension(
        format!("db.backup.{}", chrono::Utc::now().format("%Y%m%d_%H%M%S"))
    );

    // Copy file
    fs::copy(db_path, &backup_path)?;

    // Verify backup
    if backup_path.exists() {
        Ok(backup_path)
    } else {
        Err(Error::BackupFailed)
    }
}
```

#### 2. SQLite Backup API

```rust
use rusqlite::{backup::Backup, Connection};

pub fn backup_to_file(source: &Connection, dest_path: &Path) -> Result<()> {
    let mut dest = Connection::open(dest_path)?;

    let backup = Backup::new(source, &mut dest)?;
    backup.run_to_completion(100, Duration::from_millis(250), None)?;

    Ok(())
}
```

#### 3. SQL VACUUM INTO

```rust
pub fn vacuum_backup(conn: &Connection, backup_path: &str) -> Result<()> {
    conn.execute(&format!("VACUUM INTO '{}'", backup_path), [])?;
    Ok(())
}
```

---

### Scheduled Backups

```rust
// Tauri background task
use tauri::Manager;
use std::time::Duration;

pub fn start_backup_scheduler(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        loop {
            // Wait 4 hours
            std::thread::sleep(Duration::from_secs(4 * 60 * 60));

            // Perform backup
            if let Err(e) = perform_backup(&app) {
                eprintln!("Backup failed: {}", e);
            }
        }
    });
}

fn perform_backup(app: &tauri::AppHandle) -> Result<()> {
    let db_path = app.path_resolver()
        .app_data_dir()
        .unwrap()
        .join("agiworkforce.db");

    let backup_path = db_path.with_extension(
        format!("db.backup.{}", chrono::Utc::now().format("%Y%m%d_%H%M%S"))
    );

    std::fs::copy(&db_path, &backup_path)?;

    // Upload to cloud (optional)
    upload_to_cloud(&backup_path)?;

    // Clean up old backups (keep last 10)
    cleanup_old_backups(&db_path.parent().unwrap(), 10)?;

    Ok(())
}
```

---

### Cloud Sync

```rust
// Upload to S3 (or other cloud storage)
use aws_sdk_s3::Client as S3Client;

pub async fn upload_to_s3(
    client: &S3Client,
    bucket: &str,
    file_path: &Path,
) -> Result<()> {
    let body = aws_sdk_s3::types::ByteStream::from_path(file_path).await?;

    client
        .put_object()
        .bucket(bucket)
        .key(format!("backups/desktop/{}", file_path.file_name().unwrap().to_str().unwrap()))
        .body(body)
        .send()
        .await?;

    Ok(())
}
```

---

### Restore SQLite Database

#### Manual Restore

```bash
# 1. Close desktop application

# 2. Backup current database (just in case)
cp ~/.config/agiworkforce/agiworkforce.db ~/.config/agiworkforce/agiworkforce.db.before-restore

# 3. Restore from backup
cp ~/.config/agiworkforce/agiworkforce.db.backup.20260115_020000 ~/.config/agiworkforce/agiworkforce.db

# 4. Verify integrity
sqlite3 ~/.config/agiworkforce/agiworkforce.db "PRAGMA integrity_check;"

# 5. Restart application
```

#### Programmatic Restore

```rust
#[tauri::command]
pub async fn restore_from_backup(backup_path: String) -> Result<(), String> {
    // 1. Close all database connections
    drop_all_connections().await?;

    // 2. Get paths
    let db_path = get_database_path();
    let backup_temp = db_path.with_extension("db.restoring");

    // 3. Copy backup to temp location
    std::fs::copy(&backup_path, &backup_temp)
        .map_err(|e| format!("Copy failed: {}", e))?;

    // 4. Verify backup integrity
    let test_conn = Connection::open(&backup_temp)
        .map_err(|e| format!("Cannot open backup: {}", e))?;

    test_conn.pragma_query_value(None, "integrity_check", |row| {
        let result: String = row.get(0)?;
        if result != "ok" {
            return Err(rusqlite::Error::InvalidQuery);
        }
        Ok(())
    }).map_err(|_| "Integrity check failed")?;

    drop(test_conn);

    // 5. Backup current database
    let current_backup = db_path.with_extension("db.before-restore");
    std::fs::copy(&db_path, &current_backup)
        .map_err(|e| format!("Cannot backup current: {}", e))?;

    // 6. Replace database
    std::fs::rename(&backup_temp, &db_path)
        .map_err(|e| format!("Replace failed: {}", e))?;

    // 7. Reopen connections
    reinitialize_database().await?;

    Ok(())
}
```

---

## Disaster Recovery

### Recovery Time Objective (RTO)

Target time to restore service after incident.

| Incident Type       | RTO Target   | Steps                    |
| ------------------- | ------------ | ------------------------ |
| Database corruption | < 30 minutes | Restore from last backup |
| Accidental deletion | < 15 minutes | Point-in-time recovery   |
| Data center outage  | < 2 hours    | Failover to replica      |
| Complete data loss  | < 4 hours    | Restore from S3 backup   |

### Recovery Point Objective (RPO)

Maximum acceptable data loss.

| Service             | RPO Target | Backup Frequency       |
| ------------------- | ---------- | ---------------------- |
| Supabase PostgreSQL | < 1 hour   | Incremental every hour |
| SQLite Desktop      | < 4 hours  | Sync every 4 hours     |
| User files          | < 24 hours | Daily backup           |

---

### Disaster Recovery Plan

#### Level 1: Minor Issue (Accidental Delete)

**Scenario**: User accidentally deleted data.

**Steps**:

1. Identify affected data (table, rows, timeframe)
2. Use PITR to create recovery database
3. Export affected data from recovery database
4. Import data back to production
5. Verify data integrity
6. Document incident

**Time**: 15-30 minutes

---

#### Level 2: Database Corruption

**Scenario**: Database corruption detected.

**Steps**:

1. Immediately stop application
2. Copy corrupted database for analysis
3. Restore from most recent backup
4. Verify restored database integrity
5. Restart application
6. Monitor for issues
7. Analyze root cause

**Time**: 30-60 minutes

---

#### Level 3: Complete Database Loss

**Scenario**: Database server failure, data unrecoverable.

**Steps**:

1. Declare disaster recovery mode
2. Provision new database server
3. Restore schema from version control
4. Restore data from S3 backup
5. Run integrity checks
6. Update application configuration
7. Perform smoke tests
8. Restart services
9. Notify users
10. Post-mortem analysis

**Time**: 2-4 hours

---

### Disaster Recovery Testing

**Quarterly DR Drill**:

1. Schedule maintenance window
2. Take snapshot of production
3. Perform simulated restore on staging
4. Verify data integrity
5. Test application functionality
6. Measure recovery time
7. Document issues
8. Update DR procedures

**Metrics to Track**:

- Actual RTO vs target
- Actual RPO vs target
- Data integrity (row count, checksums)
- Application functionality
- Team response time

---

## Data Retention Policies

### Production Backups

| Type                    | Retention | Storage       |
| ----------------------- | --------- | ------------- |
| Daily full backup       | 30 days   | Supabase + S3 |
| Hourly incremental      | 7 days    | Supabase      |
| Pre-deployment snapshot | 90 days   | S3            |
| Schema exports          | 1 year    | Git + S3      |

### User Data

| Data Type            | Retention  | Policy                  |
| -------------------- | ---------- | ----------------------- |
| Active user data     | Indefinite | While account active    |
| Deleted account data | 30 days    | Soft delete, then purge |
| Audit logs           | 1 year     | Compliance requirement  |
| Error logs           | 90 days    | Debugging history       |
| Credit transactions  | 7 years    | Financial records       |

### Compliance

**GDPR Right to Erasure**:

```sql
-- Delete user and all associated data
CREATE FUNCTION delete_user_data(p_user_id UUID) RETURNS void AS $$
BEGIN
  -- Delete in reverse FK order
  DELETE FROM credit_transactions WHERE user_id = p_user_id;
  DELETE FROM token_credits WHERE user_id = p_user_id;
  DELETE FROM subscriptions WHERE user_id = p_user_id;
  DELETE FROM device_authorization_codes WHERE user_id = p_user_id;
  DELETE FROM desktop_devices WHERE user_id = p_user_id;
  DELETE FROM mobile_devices WHERE user_id = p_user_id;
  DELETE FROM sync_data WHERE user_id = p_user_id;

  -- Anonymize audit logs (keep for compliance)
  UPDATE audit_logs
  SET user_id = NULL,
      ip_address = NULL,
      user_agent = NULL,
      metadata = jsonb_set(metadata, '{user_deleted}', 'true')
  WHERE user_id = p_user_id;

  -- Delete profile (cascades to auth.users)
  DELETE FROM profiles WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Testing and Validation

### Backup Verification

```bash
#!/bin/bash
# verify_backup.sh

BACKUP_FILE="$1"

# 1. Check file exists and not empty
if [ ! -s "$BACKUP_FILE" ]; then
    echo "ERROR: Backup file missing or empty"
    exit 1
fi

# 2. Extract and verify SQL syntax
gunzip -t "$BACKUP_FILE"
if [ $? -ne 0 ]; then
    echo "ERROR: Backup file corrupted (gzip test failed)"
    exit 1
fi

# 3. Create test database and restore
TEST_DB="test_restore_$(date +%s)"
createdb "$TEST_DB"

gunzip < "$BACKUP_FILE" | psql "$TEST_DB" &> /dev/null
if [ $? -ne 0 ]; then
    echo "ERROR: Backup restore failed"
    dropdb "$TEST_DB"
    exit 1
fi

# 4. Verify table counts
TABLES=$(psql "$TEST_DB" -t -c "SELECT COUNT(*) FROM pg_tables WHERE schemaname='public'")
if [ "$TABLES" -lt 10 ]; then
    echo "ERROR: Not enough tables restored ($TABLES)"
    dropdb "$TEST_DB"
    exit 1
fi

# 5. Verify row counts
ROWS=$(psql "$TEST_DB" -t -c "SELECT SUM(n_live_tup) FROM pg_stat_user_tables")
if [ "$ROWS" -lt 100 ]; then
    echo "WARNING: Low row count ($ROWS)"
fi

# 6. Cleanup
dropdb "$TEST_DB"

echo "SUCCESS: Backup verified ($BACKUP_FILE)"
echo "  Tables: $TABLES"
echo "  Rows: $ROWS"
```

---

### SQLite Integrity Check

```rust
pub fn verify_database_integrity(conn: &Connection) -> Result<bool, Error> {
    // 1. Integrity check
    let integrity: String = conn.pragma_query_value(None, "integrity_check", |row| {
        row.get(0)
    })?;

    if integrity != "ok" {
        return Err(Error::DatabaseCorrupted(integrity));
    }

    // 2. Foreign key check
    let fk_violations: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_foreign_key_check()",
        [],
        |row| row.get(0),
    )?;

    if fk_violations > 0 {
        return Err(Error::ForeignKeyViolations(fk_violations));
    }

    // 3. Schema version check
    let schema_version: i32 = conn.query_row(
        "SELECT MAX(version) FROM schema_version",
        [],
        |row| row.get(0),
    )?;

    let expected_version = CURRENT_VERSION;
    if schema_version != expected_version {
        return Err(Error::SchemaMismatch {
            found: schema_version,
            expected: expected_version,
        });
    }

    // 4. Table count check
    let table_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table'",
        [],
        |row| row.get(0),
    )?;

    if table_count < 50 {
        return Err(Error::MissingTables(table_count));
    }

    Ok(true)
}
```

---

## Security Considerations

### Backup Encryption

```bash
# Encrypt backup before upload
PASSPHRASE="your-encryption-key"

# Encrypt
pg_dump $DATABASE_URL | gzip | \
  openssl enc -aes-256-cbc -salt -pbkdf2 -pass pass:$PASSPHRASE > backup.sql.gz.enc

# Decrypt
openssl enc -d -aes-256-cbc -pbkdf2 -pass pass:$PASSPHRASE -in backup.sql.gz.enc | \
  gunzip | psql $DATABASE_URL
```

### Access Control

**Backup storage permissions**:

```bash
# S3 bucket policy
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {"AWS": "arn:aws:iam::ACCOUNT:user/backup-user"},
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::backup-bucket/supabase/*"
    },
    {
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:DeleteObject",
      "Resource": "arn:aws:s3:::backup-bucket/supabase/*",
      "Condition": {
        "NumericLessThan": {"s3:ObjectAge": "604800"}
      }
    }
  ]
}
```

### Sensitive Data Handling

```sql
-- Mask sensitive data in backups for development
CREATE FUNCTION sanitize_for_dev_backup() RETURNS void AS $$
BEGIN
  -- Anonymize emails
  UPDATE profiles SET email = 'user_' || id || '@example.com';

  -- Clear API keys
  UPDATE api_keys SET key_hash = 'redacted';

  -- Clear payment methods
  UPDATE billing_payment_methods SET card_number = '****-****-****-0000';

  -- Clear sensitive metadata
  UPDATE subscriptions SET stripe_customer_id = NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Backup Monitoring

### Monitoring Script

```bash
#!/bin/bash
# monitor_backups.sh

BACKUP_DIR="/var/backups/supabase"
ALERT_WEBHOOK="https://your-alert-webhook"
MAX_AGE_HOURS=26  # Alert if no backup in 26 hours

# Find most recent backup
LATEST_BACKUP=$(find "$BACKUP_DIR" -name "backup_*.sql.gz" -type f -printf '%T@ %p\n' | sort -n | tail -1 | cut -d' ' -f2-)

if [ -z "$LATEST_BACKUP" ]; then
    # No backups found
    curl -X POST "$ALERT_WEBHOOK" -d '{"alert":"No backups found","severity":"critical"}'
    exit 1
fi

# Check backup age
BACKUP_AGE=$(($(date +%s) - $(stat -c %Y "$LATEST_BACKUP")))
BACKUP_AGE_HOURS=$((BACKUP_AGE / 3600))

if [ "$BACKUP_AGE_HOURS" -gt "$MAX_AGE_HOURS" ]; then
    # Backup too old
    curl -X POST "$ALERT_WEBHOOK" -d "{\"alert\":\"Backup is $BACKUP_AGE_HOURS hours old\",\"severity\":\"warning\"}"
    exit 1
fi

# Check backup size
BACKUP_SIZE=$(stat -c %s "$LATEST_BACKUP")
MIN_SIZE=$((1024 * 1024 * 10))  # 10 MB minimum

if [ "$BACKUP_SIZE" -lt "$MIN_SIZE" ]; then
    # Backup too small
    curl -X POST "$ALERT_WEBHOOK" -d "{\"alert\":\"Backup size suspiciously small: $(du -h $LATEST_BACKUP | cut -f1)\",\"severity\":\"warning\"}"
    exit 1
fi

echo "Backup status OK"
echo "  Latest: $LATEST_BACKUP"
echo "  Age: $BACKUP_AGE_HOURS hours"
echo "  Size: $(du -h $LATEST_BACKUP | cut -f1)"
```

---

## Backup Checklist

### Daily Operations

- [ ] Verify automatic backup completed
- [ ] Check backup file size (not suspiciously small/large)
- [ ] Verify S3 upload successful
- [ ] Monitor backup age alerts
- [ ] Review backup logs for errors

### Weekly Tasks

- [ ] Test restore on development environment
- [ ] Verify backup integrity
- [ ] Review backup storage usage
- [ ] Clean up old backups
- [ ] Update backup documentation

### Monthly Tasks

- [ ] Full disaster recovery drill
- [ ] Review and update DR procedures
- [ ] Audit backup access logs
- [ ] Test offsite backup retrieval
- [ ] Update backup encryption keys

### Quarterly Tasks

- [ ] Comprehensive DR test with team
- [ ] Review retention policies
- [ ] Update backup automation
- [ ] Security audit of backup storage
- [ ] Capacity planning review

---

For more information, see:

- [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) - Schema reference
- [MIGRATIONS.md](./MIGRATIONS.md) - Schema version management
- [QUERY_OPTIMIZATION.md](./QUERY_OPTIMIZATION.md) - Performance best practices
