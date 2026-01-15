# Database Migration Guide

Complete guide to database migrations for AGI Workforce, covering both Supabase PostgreSQL and SQLite.

## Table of Contents

1. [Overview](#overview)
2. [Supabase Migrations](#supabase-migrations)
3. [SQLite Migrations](#sqlite-migrations)
4. [Migration Best Practices](#migration-best-practices)
5. [Common Migration Patterns](#common-migration-patterns)
6. [Rollback Strategies](#rollback-strategies)
7. [Testing Migrations](#testing-migrations)

---

## Overview

### Migration Philosophy

**Migrations are code**: Treat them with the same rigor as application code.

**Key Principles**:

1. **Sequential**: Migrations run in order, never skip versions
2. **Atomic**: Each migration is a transaction - all or nothing
3. **Idempotent**: Safe to run multiple times (use `IF NOT EXISTS`, `IF EXISTS`)
4. **Tested**: Always test on dev/staging before production
5. **Documented**: Add comments explaining the why, not just the what
6. **Backward Compatible**: Avoid breaking changes when possible

### Migration States

```
┌──────────────┐
│   Planned    │ - Migration designed, reviewed
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   Written    │ - SQL file created, tested locally
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   Applied    │ - Migration executed, tracked in schema_version
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Committed   │ - Code merged, deployed to production
└──────────────┘
```

---

## Supabase Migrations

### File Naming Convention

**Format**: `YYYYMMDDHHMMSS_descriptive_name.sql`

Examples:

```
20260101000000_consolidated_schema.sql
20260101000003_add_stripe_integration.sql
20260106000000_add_device_authorization.sql
20260110000000_add_desktop_devices.sql
```

**Why this format?**

- Lexicographic sorting = chronological order
- Timestamp prevents conflicts
- Descriptive name for quick identification

### Location

```
apps/web/supabase/migrations/
```

### Creating a New Migration

#### Step 1: Create the file

```bash
cd apps/web

# Generate timestamp
TIMESTAMP=$(date +%Y%m%d%H%M%S)

# Create migration file
touch supabase/migrations/${TIMESTAMP}_your_migration_name.sql
```

#### Step 2: Write the migration

**Template**:

```sql
-- Migration: [Brief description]
-- Purpose: [Why this change is needed]
-- Addresses: [Issue/feature reference]

-- =============================================================================
-- SECTION 1: Schema Changes
-- =============================================================================

-- Add new table
CREATE TABLE IF NOT EXISTS public.new_table (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_new_table_user_id ON public.new_table(user_id);

-- Add column to existing table (use IF NOT EXISTS pattern)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'existing_table'
      AND column_name = 'new_column'
  ) THEN
    ALTER TABLE public.existing_table ADD COLUMN new_column text;
  END IF;
END $$;

-- =============================================================================
-- SECTION 2: Data Migration
-- =============================================================================

-- Backfill data if needed
UPDATE public.existing_table
SET new_column = 'default_value'
WHERE new_column IS NULL;

-- =============================================================================
-- SECTION 3: RLS Policies
-- =============================================================================

ALTER TABLE public.new_table ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own records"
  ON public.new_table
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role has full access"
  ON public.new_table
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- SECTION 4: Functions & Triggers
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS update_new_table_updated_at ON public.new_table;
CREATE TRIGGER update_new_table_updated_at
  BEFORE UPDATE ON public.new_table
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- SECTION 5: Permissions
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.new_table TO authenticated;
GRANT ALL ON public.new_table TO service_role;

-- =============================================================================
-- SECTION 6: Comments (for documentation)
-- =============================================================================

COMMENT ON TABLE public.new_table IS
  'Brief description of table purpose and usage.';

COMMENT ON COLUMN public.new_table.data IS
  'JSON field containing [specific structure description].';
```

#### Step 3: Test Locally

```bash
# Reset local Supabase database
supabase db reset

# Verify migration applied
supabase db diff

# Check for errors
supabase db lint
```

#### Step 4: Apply to Development

```bash
# Push to development project
supabase db push --project-id dev-project-id

# Verify in Supabase Studio
# Check tables, indexes, RLS policies
```

#### Step 5: Deploy to Production

```bash
# Production deployment (be cautious!)
supabase db push --project-id prod-project-id

# Or use CI/CD pipeline (preferred)
git push origin main
```

### Migration Examples

#### Example 1: Add New Table

```sql
-- Migration: Add user_preferences table
-- Purpose: Store per-user UI and behavior preferences

CREATE TABLE IF NOT EXISTS public.user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  theme text DEFAULT 'light' CHECK (theme IN ('light', 'dark', 'auto')),
  language text DEFAULT 'en',
  timezone text DEFAULT 'UTC',
  notifications_enabled boolean DEFAULT true,
  preferences jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_user_preferences_user_id ON public.user_preferences(user_id);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own preferences"
  ON public.user_preferences
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

#### Example 2: Add Column with Backfill

```sql
-- Migration: Add stripe_customer_id to profiles
-- Purpose: Enable direct Stripe customer lookup

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'stripe_customer_id'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN stripe_customer_id text;

    CREATE INDEX idx_profiles_stripe_customer_id
      ON public.profiles(stripe_customer_id);

    RAISE NOTICE 'Added stripe_customer_id column to profiles';
  END IF;
END $$;

-- Backfill from subscriptions table
UPDATE public.profiles p
SET stripe_customer_id = s.stripe_customer_id
FROM public.subscriptions s
WHERE p.id = s.user_id
  AND p.stripe_customer_id IS NULL
  AND s.stripe_customer_id IS NOT NULL;
```

#### Example 3: Rename Column (Backward Compatible)

```sql
-- Migration: Rename 'token_usage' column to 'usage_data'
-- Strategy: Add new column, copy data, deprecate old (don't drop yet)

-- Step 1: Add new column
ALTER TABLE public.metrics
ADD COLUMN IF NOT EXISTS usage_data jsonb DEFAULT '{}';

-- Step 2: Backfill data
UPDATE public.metrics
SET usage_data = token_usage
WHERE usage_data = '{}' AND token_usage IS NOT NULL;

-- Step 3: Add comment to old column indicating deprecation
COMMENT ON COLUMN public.metrics.token_usage IS
  'DEPRECATED: Use usage_data instead. Will be removed in migration 20260201000000';

-- Note: Drop old column in a future migration after confirming no usage
-- ALTER TABLE public.metrics DROP COLUMN IF EXISTS token_usage;
```

#### Example 4: Create Function with Idempotency

```sql
-- Migration: Add credit deduction function
-- Purpose: Atomic credit operations with validation

CREATE OR REPLACE FUNCTION public.deduct_credits(
  p_user_id uuid,
  p_amount_cents integer,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account RECORD;
  v_result jsonb;
BEGIN
  -- Lock account row
  SELECT * INTO v_account
  FROM public.token_credits
  WHERE user_id = p_user_id
    AND period_end > NOW()
  ORDER BY period_end DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No active credit account found'
    );
  END IF;

  IF v_account.credits_remaining_cents < p_amount_cents THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient credits'
    );
  END IF;

  -- Deduct credits
  UPDATE public.token_credits
  SET credits_used_cents = credits_used_cents + p_amount_cents,
      credits_remaining_cents = credits_remaining_cents - p_amount_cents,
      updated_at = NOW()
  WHERE id = v_account.id;

  -- Log transaction
  INSERT INTO public.credit_transactions (
    user_id, credit_account_id, transaction_type, amount_cents, description
  ) VALUES (
    p_user_id, v_account.id, 'deduction', p_amount_cents, p_description
  );

  RETURN jsonb_build_object(
    'success', true,
    'remaining_cents', v_account.credits_remaining_cents - p_amount_cents
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.deduct_credits TO authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_credits TO service_role;
```

### Supabase CLI Commands

```bash
# List all migrations
supabase migration list

# Create new migration
supabase migration new your_migration_name

# Apply migrations locally
supabase db reset

# Check migration status
supabase db diff

# Generate migration from schema changes
supabase db diff --schema public > migration.sql

# Push to remote
supabase db push

# Pull from remote
supabase db pull
```

---

## SQLite Migrations

### Location

```
apps/desktop/src-tauri/src/data/db/migrations.rs
```

### Migration System

SQLite migrations are embedded in Rust code with version tracking.

**Current Version**: 45 (defined in `CURRENT_VERSION`)

**Schema Version Tracking**:

```sql
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### Creating a New Migration

#### Step 1: Increment CURRENT_VERSION

```rust
// In migrations.rs
const CURRENT_VERSION: i32 = 46; // Incremented from 45
```

#### Step 2: Add Migration Function

```rust
/// Migration v46: Add feature_x table
/// Purpose: [Describe what this migration does and why]
fn apply_migration_v46(conn: &Connection) -> Result<()> {
    // Create table with IF NOT EXISTS for idempotency
    conn.execute(
        "CREATE TABLE IF NOT EXISTS feature_x (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // Create indexes
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_feature_x_user_id
         ON feature_x(user_id)",
        [],
    )?;

    Ok(())
}
```

#### Step 3: Register Migration in run_migrations()

```rust
pub fn run_migrations(conn: &Connection) -> Result<()> {
    // ... existing migrations ...

    if current_version < 46 {
        run_migration_in_transaction(conn, 46, apply_migration_v46)?;
    }

    Ok(())
}
```

#### Step 4: Add Table to ALLOWED_TABLES

```rust
static ALLOWED_TABLES: LazyLock<HashSet<&'static str>> = LazyLock::new(|| {
    HashSet::from([
        // ... existing tables ...
        "feature_x",  // Add new table here
    ])
});
```

#### Step 5: Update Model (if needed)

Add corresponding struct in `models.rs`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureX {
    pub id: i64,
    pub user_id: String,
    pub data: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
```

### Migration with Savepoint Rollback

Each migration runs in a savepoint for safety:

```rust
fn run_migration_in_transaction<F>(conn: &Connection, version: i32, migration_fn: F) -> Result<()>
where
    F: FnOnce(&Connection) -> Result<()>,
{
    let savepoint_name = format!("migration_v{}", version);
    conn.execute(&format!("SAVEPOINT {}", savepoint_name), [])?;

    match migration_fn(conn) {
        Ok(()) => {
            // Success - record version
            conn.execute(
                "INSERT INTO schema_version (version) VALUES (?1)",
                [version],
            )?;
            conn.execute(&format!("RELEASE {}", savepoint_name), [])?;
            Ok(())
        }
        Err(e) => {
            // Failure - rollback
            let _ = conn.execute(&format!("ROLLBACK TO {}", savepoint_name), []);
            let _ = conn.execute(&format!("RELEASE {}", savepoint_name), []);
            Err(e)
        }
    }
}
```

### SQLite Migration Examples

#### Example 1: Add Table

```rust
fn apply_migration_v46(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS search_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            query TEXT NOT NULL,
            results_count INTEGER NOT NULL DEFAULT 0,
            search_type TEXT NOT NULL CHECK (search_type IN ('messages', 'files', 'conversations')),
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_search_history_created
         ON search_history(created_at DESC)",
        [],
    )?;

    Ok(())
}
```

#### Example 2: Add Column with Backfill

```rust
fn apply_migration_v47(conn: &Connection) -> Result<()> {
    // Add column using ALTER TABLE
    conn.execute(
        "ALTER TABLE conversations ADD COLUMN archived BOOLEAN NOT NULL DEFAULT 0",
        [],
    )?;

    // Backfill: Mark conversations older than 90 days as archived
    conn.execute(
        "UPDATE conversations
         SET archived = 1
         WHERE created_at < datetime('now', '-90 days')",
        [],
    )?;

    Ok(())
}
```

#### Example 3: Create FTS Index

```rust
fn apply_migration_v48(conn: &Connection) -> Result<()> {
    // Create FTS virtual table
    conn.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
            file_id UNINDEXED,
            file_name,
            file_path,
            content,
            tokenize = 'porter unicode61 remove_diacritics 2'
        )",
        [],
    )?;

    // Create triggers to keep FTS in sync
    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS files_fts_ai AFTER INSERT ON files BEGIN
            INSERT INTO files_fts(file_id, file_name, file_path, content)
            VALUES (new.id, new.name, new.path, new.content);
        END",
        [],
    )?;

    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS files_fts_au AFTER UPDATE ON files BEGIN
            DELETE FROM files_fts WHERE file_id = old.id;
            INSERT INTO files_fts(file_id, file_name, file_path, content)
            VALUES (new.id, new.name, new.path, new.content);
        END",
        [],
    )?;

    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS files_fts_ad AFTER DELETE ON files BEGIN
            DELETE FROM files_fts WHERE file_id = old.id;
        END",
        [],
    )?;

    Ok(())
}
```

#### Example 4: Alter Table with Data Preservation

```rust
fn apply_migration_v49(conn: &Connection) -> Result<()> {
    // SQLite doesn't support DROP COLUMN directly
    // Strategy: Create new table, copy data, rename

    // 1. Create new table with desired schema
    conn.execute(
        "CREATE TABLE IF NOT EXISTS messages_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER NOT NULL,
            user_id TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
            content TEXT NOT NULL,
            tokens INTEGER,
            cost REAL,
            provider TEXT,
            model TEXT,
            metadata TEXT,  -- New column
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // 2. Copy data
    conn.execute(
        "INSERT INTO messages_new (
            id, conversation_id, user_id, role, content,
            tokens, cost, provider, model, created_at
        )
        SELECT
            id, conversation_id, user_id, role, content,
            tokens, cost, provider, model, created_at
        FROM messages",
        [],
    )?;

    // 3. Drop old table
    conn.execute("DROP TABLE messages", [])?;

    // 4. Rename new table
    conn.execute("ALTER TABLE messages_new RENAME TO messages", [])?;

    // 5. Recreate indexes
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
         ON messages(conversation_id)",
        [],
    )?;

    Ok(())
}
```

### SQLite CLI Commands

```bash
# Open database
sqlite3 ~/.config/agiworkforce/agiworkforce.db

# Check schema version
SELECT * FROM schema_version ORDER BY version DESC LIMIT 1;

# List all tables
.tables

# Show table schema
.schema table_name

# Check integrity
PRAGMA integrity_check;

# Analyze query performance
EXPLAIN QUERY PLAN SELECT ...;
```

---

## Migration Best Practices

### 1. Always Use Transactions

**Supabase**: Migrations run in transactions automatically
**SQLite**: Use savepoints in migration functions

### 2. Make Migrations Idempotent

Use `IF NOT EXISTS` and `IF EXISTS`:

```sql
-- Good
CREATE TABLE IF NOT EXISTS users (...);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
DROP TABLE IF EXISTS old_table;

-- Bad
CREATE TABLE users (...);  -- Fails if exists
CREATE INDEX idx_users_email ON users(email);  -- Fails if exists
```

### 3. Never Modify Existing Migrations

Once a migration is deployed, it's immutable. To fix issues:

```sql
-- Wrong: Edit 20260101000000_create_users.sql
-- Right: Create 20260115000000_fix_users_table.sql
```

### 4. Test with Real Data Volumes

```sql
-- Generate test data
INSERT INTO test_table (data)
SELECT generate_series(1, 1000000);

-- Test migration performance
EXPLAIN ANALYZE
ALTER TABLE test_table ADD COLUMN new_col text DEFAULT 'value';
```

### 5. Use Comments Liberally

```sql
-- Migration: Add user preferences
-- Purpose: Store UI customization settings per user
-- Related Issue: #123
-- Breaking Change: No
-- Estimated Runtime: < 1 second

CREATE TABLE ...
```

### 6. Handle NULL Values Explicitly

```sql
-- Add column with NULL
ALTER TABLE users ADD COLUMN phone text;

-- Backfill if needed
UPDATE users SET phone = '' WHERE phone IS NULL;

-- Add NOT NULL constraint after backfill
ALTER TABLE users ALTER COLUMN phone SET NOT NULL;
```

### 7. Index After Data Load

For large tables:

```sql
-- 1. Add column
ALTER TABLE large_table ADD COLUMN new_col text;

-- 2. Backfill data
UPDATE large_table SET new_col = compute_value(old_col);

-- 3. Add index after data is populated
CREATE INDEX idx_large_table_new_col ON large_table(new_col);
```

### 8. Use CHECK Constraints for Data Integrity

```sql
CREATE TABLE orders (
  id uuid PRIMARY KEY,
  status text NOT NULL
    CHECK (status IN ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled')),
  quantity integer NOT NULL
    CHECK (quantity > 0),
  price_cents integer NOT NULL
    CHECK (price_cents >= 0)
);
```

### 9. Plan for Rollback

Include rollback SQL in comments:

```sql
-- Migration: Add notifications table
-- Rollback:
--   DROP TABLE IF EXISTS notifications;
--   DROP FUNCTION IF EXISTS notify_user;

CREATE TABLE notifications (...);
```

### 10. Coordinate with Application Changes

**Migration First** (adding columns):

```
1. Deploy migration (add column with NULL)
2. Deploy app code (uses new column)
3. Deploy migration (make column NOT NULL)
```

**Code First** (removing columns):

```
1. Deploy app code (stop using column)
2. Wait 1 deployment cycle
3. Deploy migration (drop column)
```

---

## Common Migration Patterns

### Pattern 1: Add Foreign Key to Existing Table

```sql
-- Supabase
ALTER TABLE child_table
ADD CONSTRAINT fk_parent
FOREIGN KEY (parent_id) REFERENCES parent_table(id)
ON DELETE CASCADE;

-- SQLite (requires table recreation)
-- See "Alter Table with Data Preservation" example
```

### Pattern 2: Change Column Type

```sql
-- Supabase
ALTER TABLE users
ALTER COLUMN age TYPE integer USING age::integer;

-- SQLite (requires table recreation)
CREATE TABLE users_new (...);
INSERT INTO users_new SELECT * FROM users;
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;
```

### Pattern 3: Add Unique Constraint

```sql
-- Check for duplicates first
SELECT email, COUNT(*)
FROM users
GROUP BY email
HAVING COUNT(*) > 1;

-- Remove duplicates if needed
DELETE FROM users
WHERE id NOT IN (
  SELECT MIN(id)
  FROM users
  GROUP BY email
);

-- Add constraint
ALTER TABLE users
ADD CONSTRAINT users_email_unique UNIQUE (email);

-- Or create unique index
CREATE UNIQUE INDEX idx_users_email_unique ON users(email);
```

### Pattern 4: Partition Large Table

```sql
-- Supabase: Native partitioning
CREATE TABLE measurements (
  id uuid PRIMARY KEY,
  measured_at timestamptz NOT NULL,
  value numeric
) PARTITION BY RANGE (measured_at);

CREATE TABLE measurements_2024
PARTITION OF measurements
FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');

CREATE TABLE measurements_2025
PARTITION OF measurements
FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
```

### Pattern 5: Add JSONB Column with GIN Index

```sql
-- Add column
ALTER TABLE events
ADD COLUMN metadata jsonb DEFAULT '{}';

-- Add GIN index for JSONB queries
CREATE INDEX idx_events_metadata_gin ON events USING gin(metadata);

-- Query examples
SELECT * FROM events WHERE metadata @> '{"status": "active"}';
SELECT * FROM events WHERE metadata ? 'user_id';
```

### Pattern 6: Create Materialized View

```sql
-- Supabase only
CREATE MATERIALIZED VIEW user_stats AS
SELECT
  user_id,
  COUNT(*) as message_count,
  SUM(tokens) as total_tokens,
  AVG(cost) as avg_cost,
  MAX(created_at) as last_message_at
FROM messages
GROUP BY user_id;

-- Create index on materialized view
CREATE INDEX idx_user_stats_user_id ON user_stats(user_id);

-- Refresh (schedule with pg_cron or call manually)
REFRESH MATERIALIZED VIEW CONCURRENTLY user_stats;
```

---

## Rollback Strategies

### Strategy 1: Forward-Only Migrations

**Preferred approach**: Never rollback, only roll forward.

```sql
-- Migration 001: Add column
ALTER TABLE users ADD COLUMN preferences text;

-- Migration 002: Realized column not needed
-- Don't rollback! Instead:
ALTER TABLE users DROP COLUMN preferences;
```

### Strategy 2: Reversible Migrations (Supabase)

Include both up and down migrations:

```sql
-- up.sql
CREATE TABLE feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  enabled boolean DEFAULT false
);

-- down.sql (separate file, not applied automatically)
DROP TABLE IF EXISTS feature_flags;
```

### Strategy 3: Blue-Green Deployment

For major schema changes:

1. Create new schema version alongside old
2. Dual-write to both versions
3. Migrate data
4. Switch reads to new version
5. Drop old version

### Strategy 4: Manual Rollback (Last Resort)

```sql
-- Document rollback SQL
-- ROLLBACK INSTRUCTIONS (manual execution required):
-- 1. Stop application
-- 2. Execute:
--    DROP TABLE IF EXISTS new_table;
--    ALTER TABLE old_table DROP COLUMN new_column;
-- 3. Redeploy previous application version
-- 4. Start application

CREATE TABLE new_table (...);
ALTER TABLE old_table ADD COLUMN new_column text;
```

---

## Testing Migrations

### Local Testing (Supabase)

```bash
# 1. Reset to clean state
supabase db reset

# 2. Apply migrations
supabase db push

# 3. Test with application
pnpm dev

# 4. Check data integrity
psql $DATABASE_URL -c "SELECT COUNT(*) FROM table_name;"
```

### Local Testing (SQLite)

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn test_migration_v46() {
        let conn = Connection::open_in_memory().unwrap();

        // Run all migrations up to v45
        run_migrations(&conn).unwrap();

        // Apply new migration
        apply_migration_v46(&conn).unwrap();

        // Verify table exists
        let table_exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM sqlite_master
                 WHERE type='table' AND name='new_table'",
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert!(table_exists);

        // Test insert
        conn.execute(
            "INSERT INTO new_table (user_id, data) VALUES ('test', 'data')",
            [],
        )
        .unwrap();
    }
}
```

### Staging Environment Testing

```bash
# 1. Deploy to staging
git push origin develop

# 2. Run smoke tests
pnpm test:e2e

# 3. Check database state
supabase db remote --project-id staging-project

# 4. Monitor for errors
tail -f logs/app.log | grep ERROR
```

### Production Testing Checklist

- [ ] Migration tested on development database
- [ ] Migration tested on staging with production-like data
- [ ] Estimated migration time calculated (< 30 seconds preferred)
- [ ] Rollback plan documented
- [ ] Team notified of deployment window
- [ ] Database backup created
- [ ] Application can handle migration in progress (if long-running)
- [ ] Post-migration verification queries prepared

---

## Migration Checklist

Use this checklist for every migration:

### Planning Phase

- [ ] Migration necessity justified
- [ ] Breaking changes identified
- [ ] Performance impact estimated
- [ ] Rollback strategy defined
- [ ] Dependent code changes identified

### Development Phase

- [ ] Migration file created with timestamp
- [ ] Idempotent SQL written
- [ ] Indexes added for foreign keys
- [ ] RLS policies defined (Supabase)
- [ ] Comments and documentation included
- [ ] Local testing completed

### Review Phase

- [ ] Code review completed
- [ ] Database admin review (for complex migrations)
- [ ] Performance testing on large dataset
- [ ] Backward compatibility verified

### Deployment Phase

- [ ] Staging deployment successful
- [ ] Smoke tests passed
- [ ] Production backup created
- [ ] Migration deployed to production
- [ ] Post-deployment verification completed
- [ ] Monitoring alerts configured

### Post-Deployment

- [ ] Application logs monitored for errors
- [ ] Database performance metrics normal
- [ ] User reports monitored
- [ ] Documentation updated

---

## Common Pitfalls

### 1. Forgetting to Add Index

```sql
-- Bad: Foreign key without index
ALTER TABLE child_table
ADD COLUMN parent_id uuid REFERENCES parent_table(id);

-- Good: Index for foreign key joins
ALTER TABLE child_table
ADD COLUMN parent_id uuid REFERENCES parent_table(id);

CREATE INDEX idx_child_parent_id ON child_table(parent_id);
```

### 2. Large Table Modifications

```sql
-- Bad: Blocking ALTER on 1M+ row table
ALTER TABLE large_table ADD COLUMN new_col text NOT NULL DEFAULT 'value';

-- Good: Add as NULL, backfill in batches, then add constraint
ALTER TABLE large_table ADD COLUMN new_col text;

-- Batch update (in application code or script)
UPDATE large_table SET new_col = 'value' WHERE id BETWEEN ? AND ?;

ALTER TABLE large_table ALTER COLUMN new_col SET NOT NULL;
```

### 3. Missing ON DELETE Cascade

```sql
-- Bad: Orphaned records when parent deleted
ALTER TABLE comments
ADD COLUMN post_id uuid REFERENCES posts(id);

-- Good: Automatic cleanup
ALTER TABLE comments
ADD COLUMN post_id uuid REFERENCES posts(id) ON DELETE CASCADE;
```

### 4. Case Sensitivity

```sql
-- SQLite: Case-insensitive by default
SELECT * FROM users WHERE email = 'USER@EXAMPLE.COM';  -- Finds user@example.com

-- PostgreSQL: Case-sensitive
SELECT * FROM users WHERE email = 'USER@EXAMPLE.COM';  -- No match

-- Solution: Use LOWER() or ILIKE
SELECT * FROM users WHERE LOWER(email) = LOWER('USER@EXAMPLE.COM');
```

### 5. Time Zone Issues

```sql
-- Bad: TIMESTAMP without timezone
CREATE TABLE events (
  occurred_at timestamp
);

-- Good: TIMESTAMPTZ (Supabase)
CREATE TABLE events (
  occurred_at timestamptz DEFAULT now()
);
```

---

For more information, see:

- [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) - Complete schema documentation
- [RLS_POLICIES.md](./RLS_POLICIES.md) - Row Level Security policies
- [QUERY_OPTIMIZATION.md](./QUERY_OPTIMIZATION.md) - Performance tuning
