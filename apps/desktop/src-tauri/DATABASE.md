# Database Architecture

> SQLite schema documentation and migration system

## Table of Contents

- [Overview](#overview)
- [Configuration](#configuration)
- [Migration System](#migration-system)
- [Core Tables](#core-tables)
- [Security Tables](#security-tables)
- [Workflow Tables](#workflow-tables)
- [Analytics Tables](#analytics-tables)
- [Query Patterns](#query-patterns)
- [Performance Optimization](#performance-optimization)
- [Backup and Recovery](#backup-and-recovery)

## Overview

AGI Workforce uses SQLite as its local database with the following characteristics:

**Database Location**: `~/.config/agiworkforce/agiworkforce.db` (macOS/Linux) or `%APPDATA%/agiworkforce/agiworkforce.db` (Windows)

**Current Schema Version**: 45

**Key Features**:
- Write-Ahead Logging (WAL) for concurrency
- Foreign key constraints enabled
- Automatic migrations on startup
- Tamper-proof audit logging
- Encrypted secret storage

## Configuration

### SQLite Pragmas

Set on every connection in `lib.rs`:

```sql
PRAGMA busy_timeout = 5000;      -- Wait up to 5 seconds for locks
PRAGMA journal_mode = WAL;        -- Write-Ahead Logging mode
PRAGMA synchronous = NORMAL;      -- Balance safety and performance
PRAGMA foreign_keys = ON;         -- Enforce referential integrity
PRAGMA cache_size = -64000;       -- 64MB cache
```

**WAL Mode Benefits**:
- Readers don't block writers
- Writers don't block readers
- Better concurrency for desktop app
- Faster writes

**Synchronous = NORMAL**:
- Still durable (writes are persisted)
- Allows OS to batch fsync calls
- Good balance for desktop applications

## Migration System

**Location**: `src/data/db/migrations.rs`

### How Migrations Work

Migrations run automatically on application startup:

```rust
// In lib.rs setup()
let conn = Connection::open(&db_path)?;

if let Err(e) = migrations::run_migrations(&conn) {
    tracing::error!("Failed to run migrations: {}", e);
    return Err(anyhow::anyhow!("Failed to run migrations: {}", e).into());
}
```

### Migration Structure

Each migration is a struct implementing the `Migration` trait:

```rust
struct Migration01CreateTables;

impl Migration for Migration01CreateTables {
    fn version(&self) -> i32 {
        1
    }

    fn up(&self, conn: &Connection) -> Result<()> {
        conn.execute_batch("
            CREATE TABLE schema_version (
                version INTEGER PRIMARY KEY
            );

            CREATE TABLE conversations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
        ")?;

        Ok(())
    }
}
```

### Adding a New Migration

1. Create migration struct at the end of `migrations.rs`
2. Increment `CURRENT_VERSION` constant
3. Add to `MIGRATIONS` array
4. Test migration on clean database
5. Test migration on existing database

**Example**:
```rust
// At top of file
const CURRENT_VERSION: i32 = 46; // Increment from 45

// At bottom of file
struct Migration46AddNewFeature;

impl Migration for Migration46AddNewFeature {
    fn version(&self) -> i32 {
        46
    }

    fn up(&self, conn: &Connection) -> Result<()> {
        conn.execute_batch("
            CREATE TABLE new_feature (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE INDEX idx_new_feature_created
            ON new_feature(created_at);
        ")?;

        Ok(())
    }
}

// Add to MIGRATIONS array
static MIGRATIONS: &[&dyn Migration] = &[
    // ... existing migrations ...
    &Migration46AddNewFeature,
];
```

### Schema Versioning

Current version stored in `schema_version` table:

```sql
CREATE TABLE schema_version (
    version INTEGER PRIMARY KEY
);
```

Migration runner tracks version and only runs new migrations:

```rust
pub fn run_migrations(conn: &Connection) -> Result<()> {
    let current_version = get_current_version(conn)?;

    for migration in &MIGRATIONS[current_version as usize..] {
        migration.up(conn)?;
        update_version(conn, migration.version())?;
    }

    Ok(())
}
```

### SQL Injection Prevention

Table names are validated against a whitelist:

```rust
static ALLOWED_TABLES: LazyLock<HashSet<&'static str>> = LazyLock::new(|| {
    HashSet::from([
        "conversations",
        "messages",
        "settings_v2",
        // ... all valid tables ...
    ])
});

fn ensure_column(conn: &Connection, table: &str, column: &str, def: &str) -> Result<()> {
    if !ALLOWED_TABLES.contains(table) {
        return Err(anyhow!("Invalid table name: {}", table));
    }

    // Safe to use table name in SQL since it's whitelisted
    let sql = format!("ALTER TABLE {} ADD COLUMN {} {}", table, column, def);
    conn.execute(&sql, [])?;
    Ok(())
}
```

## Core Tables

### Conversations

Chat conversations.

```sql
CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    model TEXT,
    system_prompt TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    archived BOOLEAN DEFAULT 0
);

CREATE INDEX idx_conversations_created ON conversations(created_at DESC);
CREATE INDEX idx_conversations_archived ON conversations(archived, updated_at DESC);
```

**Queries**:
```rust
// List recent conversations
conn.query_row(
    "SELECT id, title, created_at FROM conversations
     WHERE archived = 0
     ORDER BY updated_at DESC
     LIMIT ?1",
    [limit],
    |row| {
        Ok(Conversation {
            id: row.get(0)?,
            title: row.get(1)?,
            created_at: row.get(2)?,
        })
    }
)?;
```

### Messages

Messages within conversations.

```sql
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    model TEXT,
    tokens_prompt INTEGER,
    tokens_completion INTEGER,
    cost REAL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX idx_messages_created ON messages(created_at);
```

**Foreign Key Cascade**: When a conversation is deleted, all its messages are automatically deleted.

### Settings V2

Key-value settings storage with categories.

```sql
CREATE TABLE settings_v2 (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    value_type TEXT NOT NULL CHECK(value_type IN ('string', 'number', 'boolean', 'json')),
    category TEXT,
    description TEXT,
    updated_at INTEGER NOT NULL
);

CREATE INDEX idx_settings_category ON settings_v2(category);
```

**Usage**:
```rust
// Store setting
conn.execute(
    "INSERT OR REPLACE INTO settings_v2 (key, value, value_type, category, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5)",
    params![key, value, "string", category, now()],
)?;

// Retrieve setting
let value: String = conn.query_row(
    "SELECT value FROM settings_v2 WHERE key = ?1",
    [key],
    |row| row.get(0),
)?;

// Get all settings in category
let settings = conn.prepare(
    "SELECT key, value FROM settings_v2 WHERE category = ?1"
)?
.query_map([category], |row| {
    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
})?
.collect::<Result<Vec<_>, _>>()?;
```

### Codebase Cache

Cache for file trees and symbol information.

```sql
CREATE TABLE codebase_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    cache_type TEXT NOT NULL CHECK(cache_type IN ('file_tree', 'symbols', 'dependencies')),
    cache_key TEXT NOT NULL,
    cache_value TEXT NOT NULL,
    content_hash TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER,
    UNIQUE(project_id, cache_type, cache_key)
);

CREATE INDEX idx_codebase_cache_project ON codebase_cache(project_id, cache_type);
CREATE INDEX idx_codebase_cache_expires ON codebase_cache(expires_at);
```

**Cache Invalidation**:
```rust
// Invalidate on file change
conn.execute(
    "DELETE FROM codebase_cache
     WHERE project_id = ?1 AND cache_key LIKE ?2",
    params![project_id, format!("%{}%", file_path)],
)?;

// Expire old entries
conn.execute(
    "DELETE FROM codebase_cache
     WHERE expires_at IS NOT NULL AND expires_at < ?1",
    [now()],
)?;
```

## Security Tables

### Audit Events

Tamper-proof audit log with hash chain.

```sql
CREATE TABLE audit_events (
    id TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    resource TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    status TEXT NOT NULL CHECK(status IN ('success', 'failure')),
    ip_address TEXT,
    user_agent TEXT,
    previous_hash TEXT,
    event_hash TEXT NOT NULL
);

CREATE INDEX idx_audit_timestamp ON audit_events(timestamp DESC);
CREATE INDEX idx_audit_user ON audit_events(user_id, timestamp DESC);
CREATE INDEX idx_audit_type ON audit_events(event_type, timestamp DESC);
```

**Hash Chain**:
Each event includes hash of previous event to detect tampering:

```rust
fn create_audit_event(
    conn: &Connection,
    event: AuditEvent,
) -> Result<()> {
    // Get previous hash
    let previous_hash: Option<String> = conn.query_row(
        "SELECT event_hash FROM audit_events
         ORDER BY timestamp DESC LIMIT 1",
        [],
        |row| row.get(0),
    ).ok();

    // Calculate event hash
    let event_hash = calculate_hash(&event, &previous_hash);

    // Insert event
    conn.execute(
        "INSERT INTO audit_events
         (id, timestamp, user_id, event_type, resource, action,
          details, status, previous_hash, event_hash)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            event.id,
            event.timestamp,
            event.user_id,
            event.event_type,
            event.resource,
            event.action,
            event.details,
            event.status,
            previous_hash,
            event_hash,
        ],
    )?;

    Ok(())
}
```

### Approval Requests

Human-in-the-loop approvals for risky operations.

```sql
CREATE TABLE approval_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    context TEXT NOT NULL,
    risk_level TEXT NOT NULL CHECK(risk_level IN ('Low', 'Medium', 'High', 'Critical')),
    status TEXT NOT NULL CHECK(status IN ('Pending', 'Approved', 'Rejected', 'Expired')),
    created_at INTEGER NOT NULL,
    expires_at INTEGER,
    approved_by TEXT,
    approved_at INTEGER,
    rejection_reason TEXT
);

CREATE INDEX idx_approval_status ON approval_requests(status, created_at DESC);
CREATE INDEX idx_approval_user ON approval_requests(user_id, created_at DESC);
```

**Workflow**:
```rust
// Create approval request
let request_id = Uuid::new_v4().to_string();
conn.execute(
    "INSERT INTO approval_requests
     (id, user_id, action, context, risk_level, status, created_at, expires_at)
     VALUES (?1, ?2, ?3, ?4, ?5, 'Pending', ?6, ?7)",
    params![
        request_id,
        user_id,
        action,
        serde_json::to_string(&context)?,
        risk_level,
        now(),
        now() + 300, // 5 minute expiry
    ],
)?;

// Check for approval
let status: String = conn.query_row(
    "SELECT status FROM approval_requests WHERE id = ?1",
    [request_id],
    |row| row.get(0),
)?;

// Approve
conn.execute(
    "UPDATE approval_requests
     SET status = 'Approved', approved_by = ?2, approved_at = ?3
     WHERE id = ?1",
    params![request_id, approver_id, now()],
)?;
```

### Secrets

Encrypted storage for API keys and credentials.

```sql
CREATE TABLE secrets (
    service TEXT NOT NULL,
    key TEXT NOT NULL,
    encrypted_value BLOB NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (service, key)
);

CREATE INDEX idx_secrets_updated ON secrets(updated_at);
```

**Encryption**: Values are encrypted using AES-256-GCM with machine-derived key before storage.

```rust
// Store secret (encrypted)
let encrypted = encrypt_value(&value, &machine_key)?;
conn.execute(
    "INSERT OR REPLACE INTO secrets (service, key, encrypted_value, updated_at)
     VALUES (?1, ?2, ?3, ?4)",
    params![service, key, encrypted, now()],
)?;

// Retrieve secret (decrypted)
let encrypted: Vec<u8> = conn.query_row(
    "SELECT encrypted_value FROM secrets WHERE service = ?1 AND key = ?2",
    params![service, key],
    |row| row.get(0),
)?;

let value = decrypt_value(&encrypted, &machine_key)?;
```

## Workflow Tables

### Workflow Definitions

User-created workflows.

```sql
CREATE TABLE workflow_definitions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    definition TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    tags TEXT
);

CREATE INDEX idx_workflows_user ON workflow_definitions(user_id, created_at DESC);
```

### Workflow Executions

Execution history.

```sql
CREATE TABLE workflow_executions (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('Running', 'Completed', 'Failed', 'Cancelled')),
    input TEXT,
    output TEXT,
    error TEXT,
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    FOREIGN KEY (workflow_id) REFERENCES workflow_definitions(id) ON DELETE CASCADE
);

CREATE INDEX idx_executions_workflow ON workflow_executions(workflow_id, started_at DESC);
CREATE INDEX idx_executions_status ON workflow_executions(status, started_at DESC);
```

### Workflow Execution Logs

Detailed execution logs.

```sql
CREATE TABLE workflow_execution_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    execution_id TEXT NOT NULL,
    step_index INTEGER NOT NULL,
    step_name TEXT NOT NULL,
    status TEXT NOT NULL,
    output TEXT,
    error TEXT,
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    FOREIGN KEY (execution_id) REFERENCES workflow_executions(id) ON DELETE CASCADE
);

CREATE INDEX idx_execution_logs_execution ON workflow_execution_logs(execution_id, step_index);
```

## Analytics Tables

### Realtime Metrics

Real-time performance metrics.

```sql
CREATE TABLE realtime_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_type TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    value REAL NOT NULL,
    metadata TEXT,
    timestamp INTEGER NOT NULL
);

CREATE INDEX idx_metrics_type_time ON realtime_metrics(metric_type, timestamp DESC);
CREATE INDEX idx_metrics_name_time ON realtime_metrics(metric_name, timestamp DESC);
```

### Analytics Snapshots

Periodic snapshots for trending.

```sql
CREATE TABLE analytics_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_type TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE INDEX idx_snapshots_type_created ON analytics_snapshots(snapshot_type, created_at DESC);
```

### User Milestones

Achievement tracking.

```sql
CREATE TABLE user_milestones (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    milestone_type TEXT NOT NULL,
    milestone_data TEXT NOT NULL,
    achieved_at INTEGER NOT NULL,
    acknowledged BOOLEAN DEFAULT 0
);

CREATE INDEX idx_milestones_user ON user_milestones(user_id, achieved_at DESC);
CREATE INDEX idx_milestones_acknowledged ON user_milestones(acknowledged, achieved_at DESC);
```

## Query Patterns

### Prepared Statements

Use prepared statements for repeated queries:

```rust
// Cache prepared statement
let mut stmt = conn.prepare_cached(
    "SELECT id, title FROM conversations WHERE user_id = ?1"
)?;

// Reuse for multiple queries
let conversations = stmt.query_map([user_id], |row| {
    Ok(Conversation {
        id: row.get(0)?,
        title: row.get(1)?,
    })
})?;
```

### Transactions

Use transactions for multiple related operations:

```rust
let tx = conn.transaction()?;

// Multiple operations
tx.execute("INSERT INTO ...", params![...])?;
tx.execute("UPDATE ...", params![...])?;
tx.execute("DELETE FROM ...", params![...])?;

// Commit all or rollback on error
tx.commit()?;
```

### Pagination

Efficient pagination with LIMIT and OFFSET:

```rust
let page_size = 20;
let page = 2;
let offset = (page - 1) * page_size;

let items = conn.prepare(
    "SELECT * FROM items
     ORDER BY created_at DESC
     LIMIT ?1 OFFSET ?2"
)?
.query_map(params![page_size, offset], |row| {
    // Map row to item
})?;

// Get total count
let total: i64 = conn.query_row(
    "SELECT COUNT(*) FROM items",
    [],
    |row| row.get(0),
)?;
```

### Full-Text Search

Using LIKE for simple searches:

```rust
let results = conn.prepare(
    "SELECT * FROM documents
     WHERE content LIKE ?1
     ORDER BY relevance DESC"
)?
.query_map([format!("%{}%", query)], |row| {
    // Map results
})?;
```

For complex searches, consider FTS5:

```sql
CREATE VIRTUAL TABLE documents_fts USING fts5(
    title,
    content,
    content=documents
);

-- Search
SELECT * FROM documents_fts
WHERE documents_fts MATCH ?1
ORDER BY rank;
```

### Aggregations

Common aggregate queries:

```rust
// Count by category
let stats = conn.prepare(
    "SELECT category, COUNT(*) as count
     FROM items
     GROUP BY category
     ORDER BY count DESC"
)?
.query_map([], |row| {
    Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
})?;

// Sum with time range
let total: f64 = conn.query_row(
    "SELECT SUM(amount) FROM transactions
     WHERE timestamp >= ?1 AND timestamp < ?2",
    params![start_time, end_time],
    |row| row.get(0),
)?;

// Average by group
let averages = conn.prepare(
    "SELECT group_name, AVG(value) as avg_value
     FROM metrics
     GROUP BY group_name
     HAVING COUNT(*) > 10"
)?;
```

## Performance Optimization

### Indexes

Create indexes for frequently queried columns:

```sql
-- Single column index
CREATE INDEX idx_messages_conversation ON messages(conversation_id);

-- Composite index (order matters!)
CREATE INDEX idx_messages_conv_time ON messages(conversation_id, created_at);

-- Covering index (includes all needed columns)
CREATE INDEX idx_messages_full ON messages(
    conversation_id,
    role,
    created_at
) WHERE archived = 0;

-- Partial index (smaller, faster)
CREATE INDEX idx_messages_recent ON messages(created_at)
WHERE created_at > 1640000000;
```

**Index Guidelines**:
- Index foreign keys
- Index columns in WHERE clauses
- Index columns in ORDER BY
- Index columns in JOIN conditions
- Don't over-index (slows writes)

### Query Optimization

**Use EXPLAIN QUERY PLAN**:
```sql
EXPLAIN QUERY PLAN
SELECT * FROM messages
WHERE conversation_id = ?
ORDER BY created_at DESC;
```

Look for:
- `SCAN TABLE` (bad - full table scan)
- `SEARCH TABLE USING INDEX` (good - using index)

**Optimize Queries**:
```rust
// Bad: Loads all rows into memory
let all_rows: Vec<_> = stmt.query_map([], |row| {
    // Process all rows
})?.collect();

// Good: Process row by row
let mut rows = stmt.query([])?;
while let Some(row) = rows.next()? {
    // Process one row at a time
}

// Better: Limit results
let recent = stmt.query_map(
    params![limit],
    |row| { /* process */ }
)?;
```

### Connection Pooling

For async operations, use tokio-rusqlite:

```rust
use tokio_rusqlite::Connection as AsyncConnection;

let conn = AsyncConnection::open(&db_path).await?;

// Async query
let result = conn.call(|conn| {
    conn.query_row("SELECT * FROM ...", [], |row| {
        // Process
    })
}).await?;
```

### Vacuuming

Periodically vacuum to reclaim space:

```rust
// Manual vacuum
conn.execute("VACUUM", [])?;

// Auto-vacuum (set once)
conn.execute("PRAGMA auto_vacuum = FULL", [])?;
```

### Cache Size

Increase cache for better performance:

```rust
// 64MB cache (set on connection open)
conn.execute("PRAGMA cache_size = -64000", [])?;
```

## Backup and Recovery

### Database Backup

**Manual Backup**:
```rust
use rusqlite::backup::Backup;

fn backup_database(
    from: &Connection,
    to_path: &Path,
) -> Result<()> {
    let mut to = Connection::open(to_path)?;

    let backup = Backup::new(from, &mut to)?;
    backup.run_to_completion(
        5,      // pages per step
        Duration::from_millis(250), // sleep between steps
        None,   // progress callback
    )?;

    Ok(())
}
```

**Automatic Backups**:
```rust
// Daily backup
async fn daily_backup_task(db_path: PathBuf) {
    loop {
        tokio::time::sleep(Duration::from_secs(86400)).await;

        let backup_path = format!(
            "{}.backup-{}",
            db_path.display(),
            chrono::Utc::now().format("%Y%m%d")
        );

        if let Err(e) = backup_database(&db_path, &backup_path) {
            tracing::error!("Backup failed: {}", e);
        }
    }
}
```

### Restore

```rust
fn restore_database(
    backup_path: &Path,
    target_path: &Path,
) -> Result<()> {
    std::fs::copy(backup_path, target_path)?;

    // Verify integrity
    let conn = Connection::open(target_path)?;
    conn.execute("PRAGMA integrity_check", [])?;

    Ok(())
}
```

### Data Export

**Export to JSON**:
```rust
fn export_to_json(
    conn: &Connection,
    output_path: &Path,
) -> Result<()> {
    let mut export = HashMap::new();

    // Export each table
    for table in &["conversations", "messages", "settings_v2"] {
        let data = export_table(conn, table)?;
        export.insert(table.to_string(), data);
    }

    let json = serde_json::to_string_pretty(&export)?;
    std::fs::write(output_path, json)?;

    Ok(())
}
```

## Troubleshooting

### Database Locked

If you see "database is locked" errors:

1. Check `busy_timeout` is set
2. Ensure WAL mode is enabled
3. Close connections promptly
4. Use transactions for multiple operations

```rust
// Set busy timeout
conn.execute("PRAGMA busy_timeout = 5000", [])?;

// Enable WAL mode
conn.execute("PRAGMA journal_mode = WAL", [])?;
```

### Corruption Recovery

If database is corrupted:

```rust
// 1. Check integrity
let result: String = conn.query_row(
    "PRAGMA integrity_check",
    [],
    |row| row.get(0),
)?;

if result != "ok" {
    tracing::error!("Database corrupted: {}", result);

    // 2. Try to recover
    conn.execute("PRAGMA wal_checkpoint(TRUNCATE)", [])?;

    // 3. Last resort: restore from backup
}
```

### Performance Issues

If queries are slow:

1. Run ANALYZE to update statistics
2. Check query plans with EXPLAIN
3. Add missing indexes
4. Vacuum to defragment

```sql
ANALYZE;

EXPLAIN QUERY PLAN SELECT ...;

CREATE INDEX IF NOT EXISTS idx_name ON table(column);

VACUUM;
```

## Best Practices

1. **Always use parameterized queries** to prevent SQL injection
2. **Enable foreign keys** for referential integrity
3. **Use transactions** for related operations
4. **Index frequently queried columns**
5. **Validate table names** against whitelist
6. **Set appropriate pragmas** on connection open
7. **Handle errors gracefully**
8. **Backup regularly**
9. **Monitor database size**
10. **Test migrations** on copy of production data

## Further Reading

- [SQLite Documentation](https://www.sqlite.org/docs.html)
- [rusqlite Crate Docs](https://docs.rs/rusqlite/)
- [Migration System Code](./src/data/db/migrations.rs)
