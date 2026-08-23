use crate::sys::security::machine_key;
use hmac::{Hmac, Mac};
use rusqlite::{params, Connection, Result};
use sha2::Sha256;
use std::collections::HashSet;
use std::sync::LazyLock;

const CURRENT_VERSION: i32 = 81;
const REDACTED_TOKEN_SENTINEL: &str = "[redacted]";
type HmacSha256 = Hmac<Sha256>;

/// FIX-002: Helper for FTS table creation with better error handling
/// Returns Ok(true) if FTS was created, Ok(false) if FTS5 is not available,
/// or an error if something else went wrong
fn create_fts_table_with_fallback(conn: &Connection, sql: &str, table_name: &str) -> Result<bool> {
    match conn.execute(sql, []) {
        Ok(_) => Ok(true),
        Err(e) => {
            let err_msg = e.to_string().to_lowercase();
            // Check if the error indicates FTS5 is not available
            if err_msg.contains("no such module: fts5")
                || err_msg.contains("fts5 is not compiled")
                || err_msg.contains("unknown tokenizer")
            {
                tracing::warn!(
                    table = table_name,
                    error = %e,
                    "FTS5 full-text search is not available on this SQLite build. \
                     Search functionality will be limited. This is not critical - \
                     the application will continue to work but text search may be slower."
                );
                Ok(false)
            } else {
                // Re-raise other errors
                Err(e)
            }
        }
    }
}

// =============================================================================
// SQL INJECTION PREVENTION
// =============================================================================
// All table names that are valid targets for schema operations.
// This whitelist prevents SQL injection via dynamic table/column names.
// Any table not in this list will be rejected by ensure_column().
static ALLOWED_TABLES: LazyLock<HashSet<&'static str>> = LazyLock::new(|| {
    HashSet::from([
        // Core tables
        "schema_version",
        "conversations",
        "messages",
        "settings",
        "settings_v2",
        // Automation & history
        "automation_history",
        "overlay_events",
        "command_history",
        "clipboard_history",
        // Calendar & email
        "calendar_accounts",
        "email_accounts",
        "emails",
        "email_attachments",
        "contacts",
        // Captures & OCR
        "captures",
        "ocr_results",
        // Security & audit
        "permissions",
        "audit_log",
        "audit_events",
        "approval_requests",
        "approval_rules",
        // Cache & browser
        "cache_entries",
        "browser_sessions",
        "browser_tabs",
        "browser_automation_history",
        // Context & MCP
        "context_items",
        "mcp_servers",
        "mcp_tools_cache",
        // Autonomous execution
        "autonomous_sessions",
        "autonomous_task_logs",
        // Checkpoints & onboarding
        "conversation_checkpoints",
        "checkpoint_restore_history",
        "onboarding_progress",
        "user_preferences",
        "user_sessions",
        // Sync & codebase
        "offline_operations_queue",
        "codebase_cache",
        // Billing
        "billing_customers",
        "billing_subscriptions",
        "billing_invoices",
        "billing_usage",
        "billing_payment_methods",
        "billing_webhook_events",
        // Workflows
        "workflow_definitions",
        "workflow_executions",
        "workflow_execution_logs",
        "published_workflows",
        "workflow_clones",
        "workflow_ratings",
        "workflow_favorites",
        "workflow_comments",
        // Templates
        "process_templates",
        "agent_templates",
        "template_installs",
        "outcome_tracking",
        // Teams
        "teams",
        "team_members",
        "team_invitations",
        "team_resources",
        "team_activity",
        "team_billing",
        // Analytics & metrics
        "analytics_snapshots",
        "process_benchmarks",
        "roi_configurations",
        "realtime_metrics",
        "user_milestones",
        "metrics_daily_cache",
        "automation_benchmarks",
        // Tutorials & help
        "tutorial_progress",
        "tutorial_step_views",
        "user_rewards",
        "tutorial_feedback",
        "help_sessions",
        // Collaboration
        "user_presence",
        "collaboration_sessions",
        // Computer use
        "computer_use_sessions",
        "computer_use_actions",
        // Messaging
        "messaging_connections",
        "messaging_history",
        // First run & demos
        "first_run_sessions",
        "demo_runs",
        // Auth (local)
        "users",
        "auth_sessions",
        "oauth_providers",
        "role_permissions",
        "user_permissions",
        "api_keys",
        "auth_audit_log",
        // Tasks
        "tasks",
        // Memory (persistent AGI memory)
        "user_memory",
        "daily_logs",
        "project_memories",
        // FTS tables (virtual)
        "messages_fts",
        "conversations_fts",
        // Scheduling
        "scheduled_jobs",
        "job_executions",
        // Background Agents
        "background_agents",
        // Master Password (SECSYS-001)
        "master_password",
        "master_password_migration",
        // AGI Task Checkpointing
        "agi_tasks",
        "agi_task_checkpoints",
        "agi_checkpoint_restore_history",
        // Conversation branching
        "conversation_branches",
        // Projects (added in v44)
        "projects",
        "project_settings",
        // Token usage tracking (added in v43)
        "token_usage",
        // First-run marker (added in v29, v37)
        "sample_data_marker",
        // Artifacts persistence (added in v60)
        "artifacts",
        "artifact_versions",
        // Cloud sync state (added in v67)
        "cloud_sync_state",
        "cloud_sync_pending_messages",
    ])
});

/// Validates that a SQL identifier (table or column name) is safe.
/// Only allows alphanumeric characters and underscores.
/// Returns an error if the identifier contains potentially dangerous characters.
fn validate_sql_identifier(identifier: &str, identifier_type: &str) -> Result<()> {
    if identifier.is_empty() {
        return Err(rusqlite::Error::InvalidParameterName(format!(
            "{} name cannot be empty",
            identifier_type
        )));
    }

    // Must start with a letter or underscore
    let first_char = match identifier.chars().next() {
        Some(c) => c,
        None => {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "{} name cannot be empty",
                identifier_type
            )))
        }
    };
    if !first_char.is_ascii_alphabetic() && first_char != '_' {
        return Err(rusqlite::Error::InvalidParameterName(format!(
            "{} name '{}' must start with a letter or underscore",
            identifier_type, identifier
        )));
    }

    // All characters must be alphanumeric or underscore
    for c in identifier.chars() {
        if !c.is_ascii_alphanumeric() && c != '_' {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "{} name '{}' contains invalid character '{}'. Only alphanumeric and underscore allowed.",
                identifier_type, identifier, c
            )));
        }
    }

    // Length check to prevent buffer issues
    if identifier.len() > 128 {
        return Err(rusqlite::Error::InvalidParameterName(format!(
            "{} name '{}' exceeds maximum length of 128 characters",
            identifier_type, identifier
        )));
    }

    Ok(())
}

/// Validates that a table name is in the allowed whitelist.
/// This provides defense-in-depth against SQL injection.
fn validate_table_name(table: &str) -> Result<()> {
    validate_sql_identifier(table, "Table")?;

    if !ALLOWED_TABLES.contains(table) {
        return Err(rusqlite::Error::InvalidParameterName(format!(
            "Table '{}' is not in the allowed tables whitelist. Add it to ALLOWED_TABLES if this is a new table.",
            table
        )));
    }

    Ok(())
}

/// Run a migration within a transaction for atomicity.
/// If the migration fails, the transaction is rolled back and the database remains unchanged.
///
/// DESK-6 (audit 2026-05-03): the previous implementation used
/// `format!("SAVEPOINT migration_v{version}")` and the matching ROLLBACK
/// TO / RELEASE statements with raw string interpolation. While `version`
/// is hard-coded today, the pattern is unsafe by construction — if any
/// future caller passed a value derived from a corrupt DB read or user
/// input the format! would produce a SQL fragment with no quoting.
/// We sanity-check the version is a positive integer (which all current
/// callers satisfy) and assert it explicitly so any future drift will
/// trip in dev rather than producing an injection vector.
fn run_migration_in_transaction<F>(conn: &Connection, version: i32, migration_fn: F) -> Result<()>
where
    F: FnOnce(&Connection) -> Result<()>,
{
    // Defence in depth: only allow positive integer versions. SAVEPOINT
    // identifier rules don't accept negative numbers anyway, but we
    // assert here so a bug surface to the caller rather than silently
    // forming a malformed identifier.
    assert!(
        (1..=10_000).contains(&version),
        "migration version {version} out of expected range — refusing to build SAVEPOINT name",
    );
    let savepoint_name = format!("migration_v{}", version);
    conn.execute(&format!("SAVEPOINT {}", savepoint_name), [])?;

    match migration_fn(conn) {
        Ok(()) => {
            // Migration succeeded - record the version and release savepoint
            conn.execute(
                "INSERT INTO schema_version (version) VALUES (?1)",
                [version],
            )?;
            conn.execute(&format!("RELEASE {}", savepoint_name), [])?;
            Ok(())
        }
        Err(e) => {
            // Migration failed - rollback to savepoint
            let _ = conn.execute(&format!("ROLLBACK TO {}", savepoint_name), []);
            let _ = conn.execute(&format!("RELEASE {}", savepoint_name), []);
            Err(e)
        }
    }
}

pub fn run_migrations(conn: &Connection) -> Result<()> {
    conn.execute("PRAGMA foreign_keys = ON", [])?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    let current_version: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_version",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    // FIX-001: Properly handle database version mismatch instead of silently ignoring
    if current_version > CURRENT_VERSION {
        tracing::warn!(
            current_db_version = current_version,
            app_schema_version = CURRENT_VERSION,
            "Database schema version is newer than application supports. \
             This may happen if you downgraded the application. \
             Some features may not work correctly."
        );
        // Return Ok to allow the app to continue, but with a warning
        // The app can still read data, but writes may fail if schema changed
        return Ok(());
    }

    // Each migration is wrapped in a transaction for atomicity
    if current_version < 1 {
        run_migration_in_transaction(conn, 1, apply_migration_v1)?;
    }

    if current_version < 2 {
        run_migration_in_transaction(conn, 2, apply_migration_v2)?;
    }

    if current_version < 3 {
        run_migration_in_transaction(conn, 3, apply_migration_v3)?;
    }

    if current_version < 4 {
        run_migration_in_transaction(conn, 4, apply_migration_v4)?;
    }

    if current_version < 5 {
        run_migration_in_transaction(conn, 5, apply_migration_v5)?;
    }

    if current_version < 6 {
        run_migration_in_transaction(conn, 6, apply_migration_v6)?;
    }

    if current_version < 7 {
        run_migration_in_transaction(conn, 7, apply_migration_v7)?;
    }

    if current_version < 8 {
        run_migration_in_transaction(conn, 8, apply_migration_v8)?;
    }

    if current_version < 9 {
        run_migration_in_transaction(conn, 9, apply_migration_v9)?;
    }

    if current_version < 10 {
        run_migration_in_transaction(conn, 10, apply_migration_v10)?;
    }

    if current_version < 11 {
        run_migration_in_transaction(conn, 11, apply_migration_v11)?;
    }

    if current_version < 12 {
        run_migration_in_transaction(conn, 12, apply_migration_v12)?;
    }

    if current_version < 13 {
        run_migration_in_transaction(conn, 13, apply_migration_v13)?;
    }

    if current_version < 14 {
        run_migration_in_transaction(conn, 14, apply_migration_v14)?;
    }

    if current_version < 15 {
        run_migration_in_transaction(conn, 15, apply_migration_v15)?;
    }

    if current_version < 16 {
        run_migration_in_transaction(conn, 16, apply_migration_v16)?;
    }

    if current_version < 17 {
        run_migration_in_transaction(conn, 17, apply_migration_v17)?;
    }

    if current_version < 18 {
        run_migration_in_transaction(conn, 18, apply_migration_v18)?;
    }

    if current_version < 19 {
        run_migration_in_transaction(conn, 19, apply_migration_v19)?;
    }

    if current_version < 20 {
        run_migration_in_transaction(conn, 20, apply_migration_v20)?;
    }

    if current_version < 21 {
        run_migration_in_transaction(conn, 21, apply_migration_v21)?;
    }

    if current_version < 22 {
        run_migration_in_transaction(conn, 22, apply_migration_v22)?;
    }

    if current_version < 23 {
        run_migration_in_transaction(conn, 23, apply_migration_v23)?;
    }

    if current_version < 24 {
        run_migration_in_transaction(conn, 24, apply_migration_v24)?;
    }

    if current_version < 25 {
        run_migration_in_transaction(conn, 25, apply_migration_v25)?;
    }

    if current_version < 26 {
        run_migration_in_transaction(conn, 26, apply_migration_v26)?;
    }

    if current_version < 27 {
        run_migration_in_transaction(conn, 27, apply_migration_v27)?;
    }

    if current_version < 28 {
        run_migration_in_transaction(conn, 28, apply_migration_v28)?;
    }

    if current_version < 29 {
        run_migration_in_transaction(conn, 29, apply_migration_v29)?;
    }

    if current_version < 30 {
        run_migration_in_transaction(conn, 30, apply_migration_v30)?;
    }

    if current_version < 31 {
        run_migration_in_transaction(conn, 31, apply_migration_v31)?;
    }

    if current_version < 32 {
        run_migration_in_transaction(conn, 32, apply_migration_v32)?;
    }

    if current_version < 33 {
        run_migration_in_transaction(conn, 33, apply_migration_v33)?;
    }

    if current_version < 34 {
        run_migration_in_transaction(conn, 34, apply_migration_v34)?;
    }

    if current_version < 35 {
        run_migration_in_transaction(conn, 35, apply_migration_v35)?;
    }

    if current_version < 36 {
        run_migration_in_transaction(conn, 36, apply_migration_v36)?;
    }

    if current_version < 37 {
        run_migration_in_transaction(conn, 37, apply_migration_v37)?;
    }

    if current_version < 38 {
        run_migration_in_transaction(conn, 38, apply_migration_v38)?;
    }

    if current_version < 39 {
        run_migration_in_transaction(conn, 39, apply_migration_v39)?;
    }

    if current_version < 40 {
        run_migration_in_transaction(conn, 40, apply_migration_v40)?;
    }

    if current_version < 41 {
        run_migration_in_transaction(conn, 41, apply_migration_v41)?;
    }

    if current_version < 42 {
        run_migration_in_transaction(conn, 42, apply_migration_v42)?;
    }

    if current_version < 43 {
        run_migration_in_transaction(conn, 43, apply_migration_v43)?;
    }

    if current_version < 44 {
        run_migration_in_transaction(conn, 44, apply_migration_v44)?;
    }

    if current_version < 45 {
        run_migration_in_transaction(conn, 45, apply_migration_v45)?;
    }

    if current_version < 46 {
        run_migration_in_transaction(conn, 46, apply_migration_v46)?;
    }

    if current_version < 47 {
        run_migration_in_transaction(conn, 47, apply_migration_v47)?;
    }

    if current_version < 48 {
        run_migration_in_transaction(conn, 48, apply_migration_v48)?;
    }

    if current_version < 49 {
        run_migration_in_transaction(conn, 49, apply_migration_v49)?;
    }

    if current_version < 50 {
        run_migration_in_transaction(conn, 50, apply_migration_v50)?;
    }

    if current_version < 51 {
        run_migration_in_transaction(conn, 51, apply_migration_v51)?;
    }

    if current_version < 52 {
        run_migration_in_transaction(conn, 52, apply_migration_v52)?;
    }

    if current_version < 53 {
        run_migration_in_transaction(conn, 53, apply_migration_v53)?;
    }

    if current_version < 54 {
        run_migration_in_transaction(conn, 54, apply_migration_v54)?;
    }

    if current_version < 55 {
        run_migration_in_transaction(conn, 55, apply_migration_v55)?;
    }

    if current_version < 56 {
        run_migration_in_transaction(conn, 56, apply_migration_v56)?;
    }

    if current_version < 57 {
        run_migration_in_transaction(conn, 57, apply_migration_v57)?;
    }

    if current_version < 58 {
        run_migration_in_transaction(conn, 58, apply_migration_v58)?;
    }

    if current_version < 59 {
        run_migration_in_transaction(conn, 59, apply_migration_v59)?;
    }

    if current_version < 60 {
        run_migration_in_transaction(conn, 60, apply_migration_v60)?;
    }

    if current_version < 61 {
        run_migration_in_transaction(conn, 61, apply_migration_v61)?;
    }

    if current_version < 62 {
        run_migration_in_transaction(conn, 62, apply_migration_v62)?;
    }

    if current_version < 63 {
        run_migration_in_transaction(conn, 63, apply_migration_v63)?;
    }

    if current_version < 64 {
        run_migration_in_transaction(conn, 64, apply_migration_v64)?;
    }

    if current_version < 65 {
        run_migration_in_transaction(conn, 65, apply_migration_v65)?;
    }

    if current_version < 66 {
        run_migration_in_transaction(conn, 66, apply_migration_v66)?;
    }

    if current_version < 67 {
        run_migration_in_transaction(conn, 67, apply_migration_v67)?;
    }

    if current_version < 68 {
        run_migration_in_transaction(conn, 68, apply_migration_v68)?;
    }

    if current_version < 69 {
        run_migration_in_transaction(conn, 69, apply_migration_v69)?;
    }

    if current_version < 70 {
        run_migration_in_transaction(conn, 70, apply_migration_v70)?;
    }

    if current_version < 71 {
        run_migration_in_transaction(conn, 71, apply_migration_v71)?;
    }

    if current_version < 72 {
        run_migration_in_transaction(conn, 72, apply_migration_v72)?;
    }

    if current_version < 73 {
        run_migration_in_transaction(conn, 73, apply_migration_v73)?;
    }

    if current_version < 74 {
        run_migration_in_transaction(conn, 74, apply_migration_v74)?;
    }

    if current_version < 75 {
        run_migration_in_transaction(conn, 75, apply_migration_v75)?;
    }

    if current_version < 76 {
        run_migration_in_transaction(conn, 76, apply_migration_v76)?;
    }

    if current_version < 77 {
        run_migration_in_transaction(conn, 77, apply_migration_v77)?;
    }

    if current_version < 78 {
        run_migration_in_transaction(conn, 78, apply_migration_v78)?;
    }

    if current_version < 79 {
        run_migration_in_transaction(conn, 79, apply_migration_v79)?;
    }

    if current_version < 80 {
        run_migration_in_transaction(conn, 80, apply_migration_v80)?;
    }

    if current_version < 81 {
        run_migration_in_transaction(conn, 81, apply_migration_v81)?;
    }

    Ok(())
}

/// Migration v45: Create FTS sync triggers for messages and conversations
/// These triggers automatically keep the FTS index in sync with the main tables
fn apply_migration_v45(conn: &Connection) -> Result<()> {
    // FIX-002: Use helper with better error handling for FTS table creation
    // First ensure the FTS tables exist (they may have been created by fts.rs)
    let messages_fts_created = create_fts_table_with_fallback(
        conn,
        "CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
            message_id UNINDEXED,
            conversation_id UNINDEXED,
            content,
            sender UNINDEXED,
            message_type UNINDEXED,
            timestamp UNINDEXED,
            tokenize = 'porter unicode61 remove_diacritics 2'
        )",
        "messages_fts",
    )?;

    let conversations_fts_created = create_fts_table_with_fallback(
        conn,
        "CREATE VIRTUAL TABLE IF NOT EXISTS conversations_fts USING fts5(
            conversation_id UNINDEXED,
            title,
            description,
            project_id UNINDEXED,
            timestamp UNINDEXED,
            tokenize = 'porter unicode61 remove_diacritics 2'
        )",
        "conversations_fts",
    )?;

    // Only create triggers if FTS tables were successfully created
    if !messages_fts_created || !conversations_fts_created {
        tracing::info!(
            "Skipping FTS trigger creation because FTS5 is not available. \
             Search will fall back to LIKE-based queries."
        );
        return Ok(());
    }

    // Triggers for messages FTS sync
    // Note: We use CAST(new.id AS TEXT) because FTS stores text values
    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS messages_fts_ai AFTER INSERT ON messages BEGIN
            INSERT INTO messages_fts(message_id, conversation_id, content, sender, message_type, timestamp)
            VALUES (CAST(new.id AS TEXT), CAST(new.conversation_id AS TEXT), new.content, new.role, 'text', new.created_at);
        END",
        [],
    )?;

    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS messages_fts_ad AFTER DELETE ON messages BEGIN
            DELETE FROM messages_fts WHERE message_id = CAST(old.id AS TEXT);
        END",
        [],
    )?;

    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS messages_fts_au AFTER UPDATE ON messages BEGIN
            DELETE FROM messages_fts WHERE message_id = CAST(old.id AS TEXT);
            INSERT INTO messages_fts(message_id, conversation_id, content, sender, message_type, timestamp)
            VALUES (CAST(new.id AS TEXT), CAST(new.conversation_id AS TEXT), new.content, new.role, 'text', new.created_at);
        END",
        [],
    )?;

    // Triggers for conversations FTS sync
    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS conversations_fts_ai AFTER INSERT ON conversations BEGIN
            INSERT INTO conversations_fts(conversation_id, title, description, project_id, timestamp)
            VALUES (CAST(new.id AS TEXT), new.title, '', NULL, new.created_at);
        END",
        [],
    )?;

    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS conversations_fts_ad AFTER DELETE ON conversations BEGIN
            DELETE FROM conversations_fts WHERE conversation_id = CAST(old.id AS TEXT);
        END",
        [],
    )?;

    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS conversations_fts_au AFTER UPDATE ON conversations BEGIN
            DELETE FROM conversations_fts WHERE conversation_id = CAST(old.id AS TEXT);
            INSERT INTO conversations_fts(conversation_id, title, description, project_id, timestamp)
            VALUES (CAST(new.id AS TEXT), new.title, '', NULL, new.created_at);
        END",
        [],
    )?;

    Ok(())
}

/// Migration v46: Create persistent memory tables for AGI
/// Based on Clawdbot's two-layer memory architecture:
/// 1. user_memory: Long-term curated memories (preferences, facts, decisions)
/// 2. daily_logs: Append-only daily context logs
fn apply_migration_v46(conn: &Connection) -> Result<()> {
    // Create user_memory table for long-term persistent memories
    conn.execute(
        "CREATE TABLE IF NOT EXISTS user_memory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT NOT NULL CHECK(category IN ('Preference', 'Fact', 'Decision', 'Context')),
            topic TEXT NOT NULL,
            content TEXT NOT NULL,
            importance INTEGER NOT NULL DEFAULT 5 CHECK(importance >= 1 AND importance <= 10),
            source TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(category, topic)
        )",
        [],
    )?;

    // Create indexes for efficient memory retrieval
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_user_memory_category ON user_memory(category)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_user_memory_importance ON user_memory(importance DESC)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_user_memory_updated ON user_memory(updated_at DESC)",
        [],
    )?;

    // Create daily_logs table for append-only daily context
    conn.execute(
        "CREATE TABLE IF NOT EXISTS daily_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            log_date TEXT NOT NULL,
            timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            entry_type TEXT NOT NULL DEFAULT 'context' CHECK(entry_type IN ('context', 'action', 'note', 'milestone')),
            content TEXT NOT NULL,
            metadata TEXT
        )",
        [],
    )?;

    // Create indexes for daily_logs
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_daily_logs_date ON daily_logs(log_date)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_daily_logs_type ON daily_logs(entry_type)",
        [],
    )?;

    Ok(())
}

/// Migration v47: Create scheduled_jobs table for task scheduling
fn apply_migration_v47(conn: &Connection) -> Result<()> {
    // Create scheduled_jobs table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS scheduled_jobs (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            schedule_type TEXT NOT NULL CHECK(schedule_type IN ('cron', 'interval', 'once')),
            cron_expression TEXT,
            interval_seconds INTEGER,
            run_at TEXT,
            timezone TEXT DEFAULT 'UTC',
            action_type TEXT NOT NULL CHECK(action_type IN ('briefing', 'reminder', 'agent_task', 'custom')),
            action_data TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            last_run TEXT,
            next_run TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // Create indexes for efficient job retrieval
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_enabled ON scheduled_jobs(enabled)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_next_run ON scheduled_jobs(next_run)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_schedule_type ON scheduled_jobs(schedule_type)",
        [],
    )?;

    Ok(())
}

/// Migration v44: Create projects and project_settings tables
fn apply_migration_v44(conn: &Connection) -> Result<()> {
    // Create projects table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            custom_instructions TEXT NOT NULL DEFAULT '',
            files TEXT NOT NULL DEFAULT '[]',
            conversation_ids TEXT NOT NULL DEFAULT '[]',
            color TEXT,
            icon TEXT,
            is_archived INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // Create project_settings table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS project_settings (
            project_id TEXT PRIMARY KEY NOT NULL,
            default_model TEXT,
            default_provider TEXT,
            context_window_size INTEGER,
            auto_archive_after_days INTEGER,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // Create indexes for projects
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_projects_updated ON projects(updated_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_projects_archived ON projects(is_archived)",
        [],
    )?;

    Ok(())
}

fn apply_migration_v43(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS token_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            input_tokens INTEGER NOT NULL,
            output_tokens INTEGER NOT NULL,
            total_cost REAL NOT NULL,
            model TEXT,
            provider TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_token_usage_user_created
         ON token_usage(user_id, created_at DESC)",
        [],
    )?;

    Ok(())
}

fn apply_migration_v42(conn: &Connection) -> Result<()> {
    // Add user_id column to conversations table if it doesn't exist
    ensure_column(
        conn,
        "conversations",
        "user_id",
        "user_id TEXT NOT NULL DEFAULT ''",
    )?;

    // Add user_id column to messages table if it doesn't exist
    ensure_column(
        conn,
        "messages",
        "user_id",
        "user_id TEXT NOT NULL DEFAULT ''",
    )?;

    // Create index on user_id for conversations
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_conversations_user
         ON conversations(user_id, updated_at DESC)",
        [],
    )?;

    // Create index on user_id for messages
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_messages_user
         ON messages(user_id, created_at)",
        [],
    )?;

    Ok(())
}

/// Safely adds a column to a table if it doesn't exist.
///
/// # Security
/// This function implements defense-in-depth against SQL injection:
/// 1. Table name must be in the ALLOWED_TABLES whitelist
/// 2. Column name must match safe identifier pattern (alphanumeric + underscore)
/// 3. Column definition is validated for safe characters
///
/// # Arguments
/// * `conn` - Database connection
/// * `table` - Table name (must be in ALLOWED_TABLES)
/// * `column` - Column name to add (alphanumeric + underscore only)
/// * `column_def` - Full column definition including type and constraints
///
/// # Errors
/// Returns an error if:
/// - Table name is not in the whitelist
/// - Column name contains invalid characters
/// - Column definition contains dangerous characters
/// - Database operation fails
fn ensure_column(conn: &Connection, table: &str, column: &str, column_def: &str) -> Result<()> {
    // === SECURITY VALIDATION ===
    // Validate table name against whitelist
    validate_table_name(table)?;

    // Validate column name for safe characters
    validate_sql_identifier(column, "Column")?;

    // Validate column_def doesn't contain SQL injection vectors
    // Allow: alphanumeric, underscore, space, parentheses, comma, single quotes,
    // and common SQL keywords/operators for constraints
    for c in column_def.chars() {
        if !c.is_ascii_alphanumeric()
            && c != '_'
            && c != ' '
            && c != '('
            && c != ')'
            && c != ','
            && c != '\''
            && c != '.'
        {
            // Check for semicolon which could allow statement injection
            if c == ';' || c == '-' {
                return Err(rusqlite::Error::InvalidParameterName(format!(
                    "Column definition '{}' contains potentially dangerous character '{}'. SQL injection attempt blocked.",
                    column_def, c
                )));
            }
        }
    }

    // Verify column_def starts with the column name (prevents injection via column_def)
    if !column_def.starts_with(column) {
        return Err(rusqlite::Error::InvalidParameterName(format!(
            "Column definition '{}' must start with column name '{}' for safety",
            column_def, column
        )));
    }

    // === CHECK COLUMN EXISTENCE ===
    // Now safe to use format! since table name is validated and whitelisted
    let pragma_sql = format!("PRAGMA table_info({})", table);
    let mut stmt = conn.prepare(&pragma_sql)?;

    // Check if column already exists
    let mut rows = stmt.query([])?;
    let mut column_exists = false;
    while let Some(row) = rows.next()? {
        let name: String = row.get(1)?;
        if name == column {
            column_exists = true;
            break;
        }
    }

    // === ADD COLUMN IF NEEDED ===
    if !column_exists {
        // Safe to use format! - all inputs validated
        let alter_sql = format!("ALTER TABLE {} ADD COLUMN {}", table, column_def);

        // Log the operation for debugging (in debug builds)
        #[cfg(debug_assertions)]
        tracing::debug!("Adding column: {}", alter_sql);

        conn.execute(&alter_sql, [])?;

        #[cfg(debug_assertions)]
        tracing::info!(
            "Successfully added column '{}' to table '{}'",
            column,
            table
        );
    }

    Ok(())
}

fn apply_migration_v1(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_conversations_updated
         ON conversations(updated_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
            content TEXT NOT NULL,
            tokens INTEGER,
            cost REAL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_messages_conversation
         ON messages(conversation_id, created_at)",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            encrypted INTEGER NOT NULL DEFAULT 0 CHECK(encrypted IN (0, 1))
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS automation_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_type TEXT NOT NULL CHECK(task_type IN (
                'windows_automation',
                'browser_automation',
                'file_operation',
                'terminal_command',
                'code_editing',
                'database_query',
                'api_call',
                'other'
            )),
            success INTEGER NOT NULL CHECK(success IN (0, 1)),
            error TEXT,
            duration_ms INTEGER NOT NULL,
            cost REAL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_automation_history_created
         ON automation_history(created_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_automation_history_type
         ON automation_history(task_type, created_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS overlay_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL CHECK(event_type IN (
                'click',
                'type',
                'region_highlight',
                'screenshot_flash'
            )),
            x INTEGER NOT NULL,
            y INTEGER NOT NULL,
            data TEXT,
            timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_overlay_events_timestamp
         ON overlay_events(timestamp)",
        [],
    )?;

    Ok(())
}

fn apply_migration_v8(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS calendar_accounts (
            id TEXT PRIMARY KEY,
            provider TEXT NOT NULL,
            account_email TEXT,
            display_name TEXT,
            token_json TEXT NOT NULL,
            config_json TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_calendar_accounts_provider
         ON calendar_accounts(provider)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_calendar_accounts_email
         ON calendar_accounts(account_email)",
        [],
    )?;

    Ok(())
}

fn apply_migration_v2(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS captures (
            id TEXT PRIMARY KEY,
            conversation_id INTEGER,
            capture_type TEXT NOT NULL CHECK(capture_type IN ('fullscreen', 'window', 'region')),
            file_path TEXT NOT NULL,
            thumbnail_path TEXT,
            ocr_text TEXT,
            ocr_confidence REAL,
            metadata TEXT,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_captures_conversation
         ON captures(conversation_id, created_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_captures_created
         ON captures(created_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_captures_type
         ON captures(capture_type, created_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS ocr_results (
            id TEXT PRIMARY KEY,
            capture_id TEXT NOT NULL,
            language TEXT NOT NULL DEFAULT 'eng',
            text TEXT NOT NULL,
            confidence REAL,
            bounding_boxes TEXT,
            processing_time_ms INTEGER,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (capture_id) REFERENCES captures(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_ocr_results_capture
         ON ocr_results(capture_id)",
        [],
    )?;

    conn.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS ocr_text_fts USING fts5(
            capture_id UNINDEXED,
            text,
            content=ocr_results,
            content_rowid=rowid
        )",
        [],
    )?;

    // FTS sync triggers for ocr_text_fts (external content table requires manual sync)
    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS ocr_text_fts_ai AFTER INSERT ON ocr_results BEGIN
            INSERT INTO ocr_text_fts(rowid, text) VALUES (new.rowid, new.text);
        END",
        [],
    )?;
    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS ocr_text_fts_ad AFTER DELETE ON ocr_results BEGIN
            INSERT INTO ocr_text_fts(ocr_text_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
        END",
        [],
    )?;
    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS ocr_text_fts_au AFTER UPDATE ON ocr_results BEGIN
            INSERT INTO ocr_text_fts(ocr_text_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
            INSERT INTO ocr_text_fts(rowid, text) VALUES (new.rowid, new.text);
        END",
        [],
    )?;

    Ok(())
}

fn apply_migration_v3(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS permissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            permission_type TEXT NOT NULL,
            state TEXT NOT NULL CHECK(state IN ('allowed', 'prompt', 'prompt_once', 'denied')),
            pattern TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_permissions_type_pattern
         ON permissions(permission_type, pattern)",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            operation_type TEXT NOT NULL,
            operation_details TEXT NOT NULL,
            permission_type TEXT NOT NULL,
            approved INTEGER NOT NULL CHECK(approved IN (0, 1)),
            success INTEGER NOT NULL CHECK(success IN (0, 1)),
            error_message TEXT,
            duration_ms INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_audit_log_created
         ON audit_log(created_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_audit_log_operation_type
         ON audit_log(operation_type, created_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_audit_log_success
         ON audit_log(success, created_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS command_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            command TEXT NOT NULL,
            args TEXT,
            working_dir TEXT NOT NULL,
            exit_code INTEGER,
            stdout TEXT,
            stderr TEXT,
            duration_ms INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_command_history_created
         ON command_history(created_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS clipboard_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            content_type TEXT NOT NULL DEFAULT 'text',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_clipboard_history_created
         ON clipboard_history(created_at DESC)",
        [],
    )?;

    let default_permissions = vec![
        ("FILE_READ", "prompt"),
        ("FILE_WRITE", "prompt"),
        ("FILE_DELETE", "prompt"),
        ("FILE_EXECUTE", "prompt"),
        ("COMMAND_EXECUTE", "prompt"),
        ("APP_LAUNCH", "prompt"),
        ("APP_TERMINATE", "prompt"),
        ("CLIPBOARD_READ", "allowed"),
        ("CLIPBOARD_WRITE", "allowed"),
        ("PROCESS_LIST", "allowed"),
        ("PROCESS_TERMINATE", "prompt"),
    ];

    for (perm_type, state) in default_permissions {
        conn.execute(
            "INSERT OR IGNORE INTO permissions (permission_type, state, pattern)
             VALUES (?1, ?2, NULL)",
            [perm_type, state],
        )?;
    }

    Ok(())
}

fn apply_migration_v4(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings_v2 (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            category TEXT NOT NULL CHECK(category IN ('llm', 'ui', 'security', 'window', 'system')),
            encrypted INTEGER NOT NULL DEFAULT 0 CHECK(encrypted IN (0, 1)),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_settings_v2_category
         ON settings_v2(category)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_settings_v2_updated
         ON settings_v2(updated_at DESC)",
        [],
    )?;

    let table_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='settings'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(false);

    if table_exists {
        conn.execute(
            "INSERT OR IGNORE INTO settings_v2 (key, value, category, encrypted, created_at, updated_at)
             SELECT key, value, 'system', encrypted, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
             FROM settings",
            [],
        )?;
    }

    Ok(())
}

fn apply_migration_v5(conn: &Connection) -> Result<()> {
    ensure_column(conn, "messages", "provider", "provider TEXT")?;
    ensure_column(conn, "messages", "model", "model TEXT")?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS cache_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cache_key TEXT NOT NULL UNIQUE,
            provider TEXT NOT NULL,
            model TEXT NOT NULL,
            prompt_hash TEXT NOT NULL,
            response TEXT NOT NULL,
            tokens INTEGER,
            cost REAL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expires_at TEXT NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_cache_entries_key ON cache_entries(cache_key)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_cache_entries_expires ON cache_entries(expires_at)",
        [],
    )?;

    Ok(())
}

fn apply_migration_v6(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS browser_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            browser_type TEXT NOT NULL CHECK(browser_type IN ('chromium', 'firefox', 'webkit')),
            user_data_path TEXT,
            cookies TEXT,
            local_storage TEXT,
            session_storage TEXT,
            created_at INTEGER NOT NULL,
            last_used INTEGER NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_browser_sessions_last_used
         ON browser_sessions(last_used DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_browser_sessions_type
         ON browser_sessions(browser_type)",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS browser_tabs (
            id TEXT PRIMARY KEY,
            session_id INTEGER NOT NULL,
            url TEXT NOT NULL,
            title TEXT,
            favicon TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (session_id) REFERENCES browser_sessions(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_browser_tabs_session
         ON browser_tabs(session_id, updated_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_browser_tabs_url
         ON browser_tabs(url)",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS browser_automation_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tab_id TEXT,
            action_type TEXT NOT NULL CHECK(action_type IN (
                'navigate',
                'click',
                'type',
                'select',
                'scroll',
                'screenshot',
                'evaluate'
            )),
            selector TEXT,
            value TEXT,
            success INTEGER NOT NULL CHECK(success IN (0, 1)),
            error_message TEXT,
            duration_ms INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (tab_id) REFERENCES browser_tabs(id) ON DELETE SET NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_browser_automation_history_created
         ON browser_automation_history(created_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_browser_automation_history_tab
         ON browser_automation_history(tab_id, created_at DESC)",
        [],
    )?;

    Ok(())
}

fn apply_migration_v7(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS email_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            display_name TEXT,
            imap_host TEXT NOT NULL,
            imap_port INTEGER NOT NULL,
            imap_use_tls INTEGER NOT NULL DEFAULT 1 CHECK(imap_use_tls IN (0, 1)),
            smtp_host TEXT NOT NULL,
            smtp_port INTEGER NOT NULL,
            smtp_use_tls INTEGER NOT NULL DEFAULT 1 CHECK(smtp_use_tls IN (0, 1)),
            password_encrypted TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            last_sync INTEGER
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_email_accounts_email
         ON email_accounts(email)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_email_accounts_last_sync
         ON email_accounts(last_sync DESC)",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS emails (
            id TEXT PRIMARY KEY,
            account_id INTEGER NOT NULL,
            message_id TEXT NOT NULL,
            subject TEXT NOT NULL,
            from_email TEXT NOT NULL,
            from_name TEXT,
            to_emails TEXT NOT NULL,
            cc_emails TEXT,
            bcc_emails TEXT,
            reply_to_email TEXT,
            reply_to_name TEXT,
            date INTEGER NOT NULL,
            body_text TEXT,
            body_html TEXT,
            is_read INTEGER NOT NULL DEFAULT 0 CHECK(is_read IN (0, 1)),
            is_flagged INTEGER NOT NULL DEFAULT 0 CHECK(is_flagged IN (0, 1)),
            folder TEXT NOT NULL DEFAULT 'INBOX',
            size INTEGER NOT NULL,
            has_attachments INTEGER NOT NULL DEFAULT 0 CHECK(has_attachments IN (0, 1)),
            created_at INTEGER NOT NULL,
            FOREIGN KEY (account_id) REFERENCES email_accounts(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_emails_accoun
         ON emails(account_id, date DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_emails_folder
         ON emails(account_id, folder, date DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_emails_unread
         ON emails(account_id, is_read, date DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_emails_from
         ON emails(from_email)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_emails_message_id
         ON emails(message_id)",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS email_attachments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email_id TEXT NOT NULL,
            filename TEXT NOT NULL,
            content_type TEXT NOT NULL,
            size INTEGER NOT NULL,
            content_id TEXT,
            file_path TEXT,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_email_attachments_email
         ON email_attachments(email_id)",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            display_name TEXT,
            first_name TEXT,
            last_name TEXT,
            phone TEXT,
            company TEXT,
            notes TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_contacts_email
         ON contacts(email)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_contacts_name
         ON contacts(display_name, first_name, last_name)",
        [],
    )?;

    conn.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS emails_fts USING fts5(
            email_id UNINDEXED,
            subject,
            body_text,
            from_email UNINDEXED,
            content=emails,
            content_rowid=rowid
        )",
        [],
    )?;

    // FTS sync triggers for emails_fts (external content table requires manual sync)
    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS emails_fts_ai AFTER INSERT ON emails BEGIN
            INSERT INTO emails_fts(rowid, subject, body_text, from_email) VALUES (new.rowid, new.subject, new.body_text, new.from_email);
        END",
        [],
    )?;
    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS emails_fts_ad AFTER DELETE ON emails BEGIN
            INSERT INTO emails_fts(emails_fts, rowid, subject, body_text, from_email) VALUES ('delete', old.rowid, old.subject, old.body_text, old.from_email);
        END",
        [],
    )?;
    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS emails_fts_au AFTER UPDATE ON emails BEGIN
            INSERT INTO emails_fts(emails_fts, rowid, subject, body_text, from_email) VALUES ('delete', old.rowid, old.subject, old.body_text, old.from_email);
            INSERT INTO emails_fts(rowid, subject, body_text, from_email) VALUES (new.rowid, new.subject, new.body_text, new.from_email);
        END",
        [],
    )?;

    Ok(())
}

fn apply_migration_v9(conn: &Connection) -> Result<()> {
    ensure_column(conn, "messages", "context_items", "context_items TEXT")?;

    ensure_column(conn, "messages", "images", "images TEXT")?;

    ensure_column(conn, "messages", "tool_calls", "tool_calls TEXT")?;

    ensure_column(conn, "messages", "artifacts", "artifacts TEXT")?;

    ensure_column(conn, "messages", "timeline_events", "timeline_events TEXT")?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS context_items (
            id TEXT PRIMARY KEY,
            message_id INTEGER NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('file', 'folder', 'url', 'web', 'image', 'code-snippet')),
            name TEXT NOT NULL,
            description TEXT,
            path TEXT,
            url TEXT,
            content TEXT,
            metadata TEXT,
            tokens INTEGER,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_context_items_message
         ON context_items(message_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_context_items_type
         ON context_items(type)",
        [],
    )?;

    Ok(())
}

fn apply_migration_v10(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS mcp_servers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            command TEXT NOT NULL,
            args TEXT, -- JSON array
            env TEXT, -- JSON objec
            enabled INTEGER NOT NULL DEFAULT 1,
            auto_start INTEGER NOT NULL DEFAULT 1,
            connection_status TEXT CHECK(connection_status IN ('connected', 'disconnected', 'error')),
            last_error TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_mcp_servers_enabled
         ON mcp_servers(enabled)",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS mcp_tools_cache (
            id TEXT PRIMARY KEY,
            server_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            input_schema TEXT NOT NULL, -- JSON schema
            output_schema TEXT, -- JSON schema
            cached_at INTEGER NOT NULL,
            FOREIGN KEY (server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_mcp_tools_server
         ON mcp_tools_cache(server_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_mcp_tools_name
         ON mcp_tools_cache(name)",
        [],
    )?;

    conn.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS mcp_tools_fts USING fts5(
            tool_id UNINDEXED,
            name,
            description,
            content=mcp_tools_cache,
            content_rowid=rowid
        )",
        [],
    )?;

    Ok(())
}

fn apply_migration_v11(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS autonomous_sessions (
            id TEXT PRIMARY KEY,
            goal_id TEXT NOT NULL,
            goal_description TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('planning', 'executing', 'completed', 'failed', 'paused')),
            priority TEXT CHECK(priority IN ('low', 'medium', 'high', 'urgent')),
            progress_percent REAL NOT NULL DEFAULT 0.0,
            completed_steps INTEGER NOT NULL DEFAULT 0,
            total_steps INTEGER NOT NULL DEFAULT 0,
            started_at INTEGER NOT NULL,
            completed_at INTEGER,
            error_message TEXT,
            metadata TEXT, -- JSON objec
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_autonomous_sessions_status
         ON autonomous_sessions(status, created_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_autonomous_sessions_priority
         ON autonomous_sessions(priority, created_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS autonomous_task_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            step_number INTEGER NOT NULL,
            step_description TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('pending', 'executing', 'completed', 'failed', 'skipped')),
            tool_name TEXT,
            tool_input TEXT, -- JSON
            tool_output TEXT, -- JSON
            error_message TEXT,
            duration_ms INTEGER,
            tokens_used INTEGER,
            cost REAL,
            created_at INTEGER NOT NULL,
            completed_at INTEGER,
            FOREIGN KEY (session_id) REFERENCES autonomous_sessions(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_task_logs_session
         ON autonomous_task_logs(session_id, step_number)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_task_logs_status
         ON autonomous_task_logs(status)",
        [],
    )?;

    Ok(())
}

fn apply_migration_v12(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
         ON messages(conversation_id, created_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_messages_tokens_cos
         ON messages(created_at DESC, tokens, cost)
         WHERE tokens IS NOT NULL",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_messages_role_created
         ON messages(role, created_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_context_items_type_created
         ON context_items(type, created_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_captures_conversation
         ON captures(conversation_id, created_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_ocr_results_confidence
         ON ocr_results(confidence DESC, created_at DESC)
         WHERE confidence > 0.5",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_command_history_command
         ON command_history(command, created_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_clipboard_history_type
         ON clipboard_history(content_type, created_at DESC)",
        [],
    )?;

    Ok(())
}

fn apply_migration_v13(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS conversation_checkpoints (
            id TEXT PRIMARY KEY,
            conversation_id INTEGER NOT NULL,
            checkpoint_name TEXT NOT NULL,
            description TEXT,
            message_count INTEGER NOT NULL,
            messages_snapshot TEXT NOT NULL,
            context_snapshot TEXT,
            metadata TEXT,
            parent_checkpoint_id TEXT,
            branch_name TEXT,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
            FOREIGN KEY (parent_checkpoint_id) REFERENCES conversation_checkpoints(id) ON DELETE SET NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_checkpoints_conversation
         ON conversation_checkpoints(conversation_id, created_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_checkpoints_branch
         ON conversation_checkpoints(branch_name, created_at DESC)
         WHERE branch_name IS NOT NULL",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_checkpoints_paren
         ON conversation_checkpoints(parent_checkpoint_id)
         WHERE parent_checkpoint_id IS NOT NULL",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS checkpoint_restore_history (
            id TEXT PRIMARY KEY,
            checkpoint_id TEXT NOT NULL,
            conversation_id INTEGER NOT NULL,
            restored_at INTEGER NOT NULL,
            restored_message_count INTEGER NOT NULL,
            success INTEGER NOT NULL DEFAULT 1,
            error_message TEXT,
            FOREIGN KEY (checkpoint_id) REFERENCES conversation_checkpoints(id) ON DELETE CASCADE,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_checkpoint_restore_history
         ON checkpoint_restore_history(conversation_id, restored_at DESC)",
        [],
    )?;

    Ok(())
}

fn apply_migration_v14(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
         ON messages(conversation_id, created_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_conversations_title
         ON conversations(title)",
        [],
    )?;

    Ok(())
}

fn apply_migration_v15(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS onboarding_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            step_id TEXT NOT NULL UNIQUE,
            step_name TEXT NOT NULL,
            completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1)),
            skipped INTEGER NOT NULL DEFAULT 0 CHECK(skipped IN (0, 1)),
            completed_at INTEGER,
            data TEXT, -- JSON object for step-specific data
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_onboarding_step_id
         ON onboarding_progress(step_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_onboarding_completed
         ON onboarding_progress(completed, completed_at DESC)",
        [],
    )?;

    let steps = vec![
        ("welcome", "Welcome Screen"),
        ("api_keys", "API Keys Setup"),
        ("first_task", "First Task Tutorial"),
        ("explore_features", "Explore Features"),
    ];

    for (step_id, step_name) in steps {
        conn.execute(
            "INSERT OR IGNORE INTO onboarding_progress (step_id, step_name, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?3)",
            [
                step_id,
                step_name,
                &chrono::Utc::now().timestamp().to_string(),
            ],
        )?;
    }

    conn.execute(
        "CREATE TABLE IF NOT EXISTS user_preferences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT NOT NULL UNIQUE,
            value TEXT NOT NULL,
            category TEXT NOT NULL CHECK(category IN (
                'shortcuts',
                'notifications',
                'privacy',
                'appearance',
                'behavior',
                'advanced'
            )),
            data_type TEXT NOT NULL CHECK(data_type IN (
                'string',
                'number',
                'boolean',
                'json'
            )),
            description TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_user_preferences_category
         ON user_preferences(category)",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS user_sessions (
            id TEXT PRIMARY KEY,
            started_at INTEGER NOT NULL,
            last_activity INTEGER NOT NULL,
            idle_timeout_minutes INTEGER NOT NULL DEFAULT 30,
            auto_lock_enabled INTEGER NOT NULL DEFAULT 0 CHECK(auto_lock_enabled IN (0, 1)),
            locked_at INTEGER,
            unlock_required INTEGER NOT NULL DEFAULT 0 CHECK(unlock_required IN (0, 1)),
            session_data TEXT, -- JSON objec
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_user_sessions_activity
         ON user_sessions(last_activity DESC)",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS offline_operations_queue (
            id TEXT PRIMARY KEY,
            operation_type TEXT NOT NULL CHECK(operation_type IN (
                'message',
                'automation',
                'file_sync',
                'settings_sync',
                'other'
            )),
            payload TEXT NOT NULL, -- JSON objec
            retry_count INTEGER NOT NULL DEFAULT 0,
            max_retries INTEGER NOT NULL DEFAULT 3,
            priority INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL CHECK(status IN (
                'pending',
                'processing',
                'completed',
                'failed'
            )) DEFAULT 'pending',
            error_message TEXT,
            created_at INTEGER NOT NULL,
            scheduled_at INTEGER, -- When to process (for delayed operations)
            processed_at INTEGER
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_offline_queue_status
         ON offline_operations_queue(status, priority DESC, created_at)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_offline_queue_scheduled
         ON offline_operations_queue(scheduled_at)
         WHERE scheduled_at IS NOT NULL",
        [],
    )?;

    Ok(())
}

fn apply_migration_v16(conn: &Connection) -> Result<()> {
    ensure_column(
        conn,
        "cache_entries",
        "hit_count",
        "hit_count INTEGER NOT NULL DEFAULT 0",
    )?;

    ensure_column(
        conn,
        "cache_entries",
        "tokens_saved",
        "tokens_saved INTEGER NOT NULL DEFAULT 0",
    )?;

    ensure_column(
        conn,
        "cache_entries",
        "cost_saved",
        "cost_saved REAL NOT NULL DEFAULT 0.0",
    )?;

    ensure_column(conn, "cache_entries", "temperature", "temperature REAL")?;

    ensure_column(conn, "cache_entries", "max_tokens", "max_tokens INTEGER")?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_cache_entries_hit_coun
         ON cache_entries(hit_count DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_cache_entries_cost_saved
         ON cache_entries(cost_saved DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_cache_entries_temperature
         ON cache_entries(temperature)
         WHERE temperature IS NOT NULL",
        [],
    )?;

    conn.execute(
        "CREATE VIEW IF NOT EXISTS cache_statistics AS
         SELECT
             provider,
             model,
             COUNT(*) as entry_count,
             SUM(hit_count) as total_hits,
             SUM(tokens_saved) as total_tokens_saved,
             SUM(cost_saved) as total_cost_saved,
             AVG(CASE WHEN hit_count > 0 THEN hit_count ELSE NULL END) as avg_hits_per_entry,
             MIN(created_at) as oldest_entry,
             MAX(last_used_at) as most_recent_use
         FROM cache_entries
         GROUP BY provider, model",
        [],
    )?;

    Ok(())
}

fn apply_migration_v17(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS codebase_cache (
            id TEXT PRIMARY KEY,
            project_path TEXT NOT NULL,
            cache_type TEXT NOT NULL CHECK(cache_type IN ('file_tree', 'symbols', 'deps', 'file_metadata')),
            file_hash TEXT,
            data TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_codebase_cache_projec
         ON codebase_cache(project_path, cache_type)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_codebase_cache_type
         ON codebase_cache(cache_type)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_codebase_cache_expires
         ON codebase_cache(expires_at)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_codebase_cache_file_hash
         ON codebase_cache(file_hash)
         WHERE file_hash IS NOT NULL AND file_hash != ''",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_codebase_cache_lookup
         ON codebase_cache(project_path, cache_type, file_hash)",
        [],
    )?;

    Ok(())
}

fn apply_migration_v18(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS billing_customers (
            id TEXT PRIMARY KEY,
            stripe_customer_id TEXT NOT NULL UNIQUE,
            email TEXT NOT NULL,
            name TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_billing_customers_email
         ON billing_customers(email)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_billing_customers_stripe_id
         ON billing_customers(stripe_customer_id)",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS billing_subscriptions (
            id TEXT PRIMARY KEY,
            customer_id TEXT NOT NULL,
            stripe_subscription_id TEXT NOT NULL UNIQUE,
            stripe_price_id TEXT NOT NULL,
            plan_name TEXT NOT NULL CHECK(plan_name IN ('free', 'pro', 'proplus', 'team', 'enterprise')),
            billing_interval TEXT NOT NULL CHECK(billing_interval IN ('monthly', 'yearly')),
            status TEXT NOT NULL CHECK(status IN (
                'active',
                'trialing',
                'past_due',
                'canceled',
                'incomplete',
                'incomplete_expired',
                'unpaid'
            )),
            current_period_start INTEGER NOT NULL,
            current_period_end INTEGER NOT NULL,
            cancel_at_period_end INTEGER NOT NULL DEFAULT 0 CHECK(cancel_at_period_end IN (0, 1)),
            cancel_at INTEGER,
            canceled_at INTEGER,
            trial_start INTEGER,
            trial_end INTEGER,
            amount INTEGER NOT NULL,
            currency TEXT NOT NULL DEFAULT 'usd',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (customer_id) REFERENCES billing_customers(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_customer
         ON billing_subscriptions(customer_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_status
         ON billing_subscriptions(status)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_stripe_id
         ON billing_subscriptions(stripe_subscription_id)",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS billing_invoices (
            id TEXT PRIMARY KEY,
            customer_id TEXT NOT NULL,
            subscription_id TEXT,
            stripe_invoice_id TEXT NOT NULL UNIQUE,
            invoice_number TEXT,
            amount_due INTEGER NOT NULL,
            amount_paid INTEGER NOT NULL,
            amount_remaining INTEGER NOT NULL,
            currency TEXT NOT NULL DEFAULT 'usd',
            status TEXT NOT NULL CHECK(status IN (
                'draft',
                'open',
                'paid',
                'void',
                'uncollectible'
            )),
            invoice_pdf TEXT,
            hosted_invoice_url TEXT,
            period_start INTEGER NOT NULL,
            period_end INTEGER NOT NULL,
            due_date INTEGER,
            paid_at INTEGER,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (customer_id) REFERENCES billing_customers(id) ON DELETE CASCADE,
            FOREIGN KEY (subscription_id) REFERENCES billing_subscriptions(id) ON DELETE SET NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_billing_invoices_customer
         ON billing_invoices(customer_id, created_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_billing_invoices_subscription
         ON billing_invoices(subscription_id, created_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_billing_invoices_status
         ON billing_invoices(status)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_billing_invoices_stripe_id
         ON billing_invoices(stripe_invoice_id)",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS billing_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id TEXT NOT NULL,
            usage_type TEXT NOT NULL CHECK(usage_type IN (
                'automation_execution',
                'api_call',
                'storage_mb',
                'llm_tokens',
                'browser_session',
                'mcp_tool_call'
            )),
            usage_count INTEGER NOT NULL DEFAULT 1,
            metadata TEXT,
            billing_period_start INTEGER NOT NULL,
            billing_period_end INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (customer_id) REFERENCES billing_customers(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_billing_usage_customer
         ON billing_usage(customer_id, usage_type)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_billing_usage_period
         ON billing_usage(billing_period_start, billing_period_end)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_billing_usage_type
         ON billing_usage(usage_type, created_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE VIEW IF NOT EXISTS billing_usage_summary AS
         SELECT
             customer_id,
             usage_type,
             billing_period_start,
             billing_period_end,
             SUM(usage_count) as total_usage,
             COUNT(*) as usage_events,
             MIN(created_at) as first_usage,
             MAX(created_at) as last_usage
         FROM billing_usage
         GROUP BY customer_id, usage_type, billing_period_start, billing_period_end",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS billing_payment_methods (
            id TEXT PRIMARY KEY,
            customer_id TEXT NOT NULL,
            stripe_payment_method_id TEXT NOT NULL UNIQUE,
            type TEXT NOT NULL CHECK(type IN ('card', 'bank_account', 'other')),
            card_brand TEXT,
            card_last4 TEXT,
            card_exp_month INTEGER,
            card_exp_year INTEGER,
            is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0, 1)),
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (customer_id) REFERENCES billing_customers(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_billing_payment_methods_customer
         ON billing_payment_methods(customer_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_billing_payment_methods_defaul
         ON billing_payment_methods(customer_id, is_default)
         WHERE is_default = 1",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_billing_payment_methods_stripe_id
         ON billing_payment_methods(stripe_payment_method_id)",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS billing_webhook_events (
            id TEXT PRIMARY KEY,
            stripe_event_id TEXT NOT NULL UNIQUE,
            event_type TEXT NOT NULL,
            payload TEXT NOT NULL,
            processed INTEGER NOT NULL DEFAULT 0 CHECK(processed IN (0, 1)),
            processing_error TEXT,
            retry_count INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            processed_at INTEGER
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_billing_webhook_events_type
         ON billing_webhook_events(event_type, created_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_billing_webhook_events_processed
         ON billing_webhook_events(processed, created_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_billing_webhook_events_stripe_id
         ON billing_webhook_events(stripe_event_id)",
        [],
    )?;

    Ok(())
}

fn apply_migration_v19(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS workflow_definitions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            nodes TEXT NOT NULL,
            edges TEXT NOT NULL,
            triggers TEXT,
            metadata TEXT,
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_workflows_user
         ON workflow_definitions(user_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_workflows_created
         ON workflow_definitions(created_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_workflows_updated
         ON workflow_definitions(updated_at DESC)",
        [],
    )?;

    Ok(())
}

fn apply_migration_v20(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS workflow_executions (
            id TEXT PRIMARY KEY,
            workflow_id TEXT NOT NULL,
            status TEXT NOT NULL,
            current_node_id TEXT,
            inputs TEXT,
            outputs TEXT,
            error TEXT,
            started_at INTEGER,
            completed_at INTEGER,
            FOREIGN KEY (workflow_id) REFERENCES workflow_definitions(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_executions_workflow
         ON workflow_executions(workflow_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_executions_status
         ON workflow_executions(status)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_executions_started
         ON workflow_executions(started_at DESC)",
        [],
    )?;

    Ok(())
}

fn apply_migration_v21(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS workflow_execution_logs (
            id TEXT PRIMARY KEY,
            execution_id TEXT NOT NULL,
            node_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            data TEXT,
            timestamp INTEGER DEFAULT (strftime('%s', 'now')),
            FOREIGN KEY (execution_id) REFERENCES workflow_executions(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_execution_logs_execution
         ON workflow_execution_logs(execution_id, timestamp)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_execution_logs_node
         ON workflow_execution_logs(node_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_execution_logs_event_type
         ON workflow_execution_logs(event_type)",
        [],
    )?;

    Ok(())
}

fn apply_migration_v22(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS process_templates (
            id TEXT PRIMARY KEY,
            process_type TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            typical_steps TEXT, -- JSON array of ProcessStep objects
            success_criteria TEXT, -- JSON array of SuccessCriterion objects
            required_tools TEXT, -- JSON array of tool IDs
            expected_duration_ms INTEGER,
            risk_factors TEXT, -- JSON array of RiskFactor objects
            best_practices TEXT, -- JSON array of strings
            created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_process_templates_type
         ON process_templates(process_type)",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS outcome_tracking (
            id TEXT PRIMARY KEY,
            goal_id TEXT NOT NULL,
            process_type TEXT NOT NULL,
            metric_name TEXT NOT NULL,
            target_value REAL,
            actual_value REAL,
            achieved INTEGER DEFAULT 0,
            tracked_at INTEGER DEFAULT (strftime('%s', 'now'))
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_outcome_tracking_goal
         ON outcome_tracking(goal_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_outcome_tracking_process
         ON outcome_tracking(process_type)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_outcome_tracking_tracked_a
         ON outcome_tracking(tracked_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_outcome_tracking_metric
         ON outcome_tracking(metric_name, achieved)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_outcome_tracking_process_achieved
         ON outcome_tracking(process_type, achieved, tracked_at DESC)",
        [],
    )?;

    Ok(())
}

fn apply_migration_v23(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS agent_templates (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            description TEXT NOT NULL,
            icon TEXT NOT NULL,
            tools TEXT NOT NULL,
            workflow TEXT NOT NULL,
            default_prompts TEXT NOT NULL,
            success_criteria TEXT NOT NULL,
            estimated_duration_ms INTEGER NOT NULL,
            difficulty_level TEXT NOT NULL CHECK(difficulty_level IN ('easy', 'medium', 'hard')),
            install_count INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_agent_templates_category
         ON agent_templates(category)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_agent_templates_install_coun
         ON agent_templates(install_count DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_agent_templates_difficulty
         ON agent_templates(difficulty_level)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_agent_templates_name
         ON agent_templates(name)",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS template_installs (
            user_id TEXT NOT NULL,
            template_id TEXT NOT NULL,
            installed_at INTEGER NOT NULL,
            PRIMARY KEY (user_id, template_id),
            FOREIGN KEY (template_id) REFERENCES agent_templates(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_template_installs_user
         ON template_installs(user_id, installed_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_template_installs_template
         ON template_installs(template_id, installed_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS agent_templates_fts USING fts5(
            template_id UNINDEXED,
            name,
            description,
            content=agent_templates,
            content_rowid=rowid
        )",
        [],
    )?;

    // FTS sync triggers for agent_templates_fts (external content table requires manual sync)
    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS agent_templates_fts_ai AFTER INSERT ON agent_templates BEGIN
            INSERT INTO agent_templates_fts(rowid, name, description) VALUES (new.rowid, new.name, new.description);
        END",
        [],
    )?;
    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS agent_templates_fts_ad AFTER DELETE ON agent_templates BEGIN
            INSERT INTO agent_templates_fts(agent_templates_fts, rowid, name, description) VALUES ('delete', old.rowid, old.name, old.description);
        END",
        [],
    )?;
    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS agent_templates_fts_au AFTER UPDATE ON agent_templates BEGIN
            INSERT INTO agent_templates_fts(agent_templates_fts, rowid, name, description) VALUES ('delete', old.rowid, old.name, old.description);
            INSERT INTO agent_templates_fts(rowid, name, description) VALUES (new.rowid, new.name, new.description);
        END",
        [],
    )?;

    Ok(())
}

fn apply_migration_v24(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS teams (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            owner_id TEXT NOT NULL,
            settings TEXT,
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_teams_owner
         ON teams(owner_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_teams_created
         ON teams(created_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS team_members (
            team_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('viewer', 'editor', 'admin', 'owner')),
            joined_at INTEGER DEFAULT (strftime('%s', 'now')),
            invited_by TEXT,
            PRIMARY KEY (team_id, user_id),
            FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_team_members_user
         ON team_members(user_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_team_members_role
         ON team_members(role)",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS team_invitations (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL,
            email TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('viewer', 'editor', 'admin')),
            invited_by TEXT NOT NULL,
            token TEXT NOT NULL UNIQUE,
            expires_at INTEGER NOT NULL,
            accepted INTEGER DEFAULT 0,
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_team_invitations_email
         ON team_invitations(email)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_team_invitations_token
         ON team_invitations(token)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_team_invitations_team
         ON team_invitations(team_id, accepted)",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS team_resources (
            team_id TEXT NOT NULL,
            resource_type TEXT NOT NULL CHECK(resource_type IN ('workflow', 'template', 'knowledge', 'automation', 'document', 'dataset')),
            resource_id TEXT NOT NULL,
            resource_name TEXT NOT NULL,
            resource_description TEXT,
            shared_by TEXT NOT NULL,
            shared_at INTEGER DEFAULT (strftime('%s', 'now')),
            access_count INTEGER DEFAULT 0,
            last_accessed INTEGER,
            PRIMARY KEY (team_id, resource_type, resource_id),
            FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_team_resources_team
         ON team_resources(team_id, shared_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_team_resources_type
         ON team_resources(resource_type)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_team_resources_shared_by
         ON team_resources(shared_by)",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS team_activity (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL,
            user_id TEXT,
            action TEXT NOT NULL,
            resource_type TEXT,
            resource_id TEXT,
            metadata TEXT,
            timestamp INTEGER DEFAULT (strftime('%s', 'now')),
            FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_team_activity_team
         ON team_activity(team_id, timestamp DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_team_activity_user
         ON team_activity(user_id, timestamp DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_team_activity_action
         ON team_activity(action)",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS team_billing (
            team_id TEXT PRIMARY KEY,
            plan_tier TEXT NOT NULL CHECK(plan_tier IN ('team', 'enterprise')),
            billing_cycle TEXT NOT NULL CHECK(billing_cycle IN ('monthly', 'annual')),
            seat_count INTEGER NOT NULL DEFAULT 1,
            stripe_subscription_id TEXT,
            usage_metrics TEXT,
            next_billing_date INTEGER,
            current_period_start INTEGER,
            current_period_end INTEGER,
            FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_team_billing_subscription
         ON team_billing(stripe_subscription_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_team_billing_next_date
         ON team_billing(next_billing_date)",
        [],
    )?;

    Ok(())
}

fn apply_migration_v25(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS audit_events (
            id TEXT PRIMARY KEY,
            timestamp INTEGER NOT NULL,
            user_id TEXT,
            team_id TEXT,
            event_type TEXT NOT NULL,
            resource_type TEXT,
            resource_id TEXT,
            action TEXT NOT NULL,
            status TEXT NOT NULL,
            metadata TEXT,
            hmac_signature TEXT NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_audit_timestamp
         ON audit_events(timestamp DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_audit_user
         ON audit_events(user_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_audit_team
         ON audit_events(team_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_audit_event_type
         ON audit_events(event_type)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_audit_status
         ON audit_events(status)",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS approval_requests (
            id TEXT PRIMARY KEY,
            requester_id TEXT NOT NULL,
            team_id TEXT,
            action_type TEXT NOT NULL,
            resource_type TEXT,
            resource_id TEXT,
            risk_level TEXT NOT NULL CHECK(risk_level IN ('low', 'medium', 'high', 'critical')),
            justification TEXT,
            status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'timed_out')),
            created_at INTEGER NOT NULL,
            reviewed_by TEXT,
            reviewed_at INTEGER,
            decision_reason TEXT,
            expires_at INTEGER NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_approval_status
         ON approval_requests(status)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_approval_team
         ON approval_requests(team_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_approval_requester
         ON approval_requests(requester_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_approval_risk_level
         ON approval_requests(risk_level)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_approval_expires_a
         ON approval_requests(expires_at)",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS approval_rules (
            id TEXT PRIMARY KEY,
            team_id TEXT,
            rule_name TEXT NOT NULL,
            condition_type TEXT NOT NULL,
            condition_value TEXT NOT NULL,
            required_approvals INTEGER NOT NULL DEFAULT 1,
            approver_roles TEXT NOT NULL,
            timeout_minutes INTEGER NOT NULL DEFAULT 30,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_approval_rules_team
         ON approval_rules(team_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_approval_rules_enabled
         ON approval_rules(enabled)",
        [],
    )?;

    Ok(())
}

fn apply_migration_v26(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS analytics_snapshots (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            team_id TEXT,
            snapshot_date INTEGER NOT NULL,
            roi_data TEXT NOT NULL,
            metrics_data TEXT NOT NULL,
            created_at INTEGER NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_snapshots_date
         ON analytics_snapshots(snapshot_date DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_snapshots_user
         ON analytics_snapshots(user_id, snapshot_date DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_snapshots_team
         ON analytics_snapshots(team_id, snapshot_date DESC)
         WHERE team_id IS NOT NULL",
        [],
    )?;

    Ok(())
}

fn apply_migration_v27(conn: &Connection) -> Result<()> {
    ensure_column(
        conn,
        "automation_history",
        "estimated_manual_time_ms",
        "estimated_manual_time_ms INTEGER",
    )?;

    ensure_column(
        conn,
        "automation_history",
        "time_saved_ms",
        "time_saved_ms INTEGER",
    )?;

    ensure_column(
        conn,
        "automation_history",
        "cost_savings_usd",
        "cost_savings_usd REAL",
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_automation_history_time_saved
         ON automation_history(time_saved_ms DESC)
         WHERE time_saved_ms IS NOT NULL",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_automation_history_cost_savings
         ON automation_history(cost_savings_usd DESC)
         WHERE cost_savings_usd IS NOT NULL",
        [],
    )?;

    Ok(())
}

fn apply_migration_v28(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS process_benchmarks (
            id TEXT PRIMARY KEY,
            process_type TEXT NOT NULL UNIQUE,
            avg_duration_ms REAL NOT NULL,
            success_rate REAL NOT NULL,
            avg_cost_savings REAL NOT NULL,
            sample_size INTEGER NOT NULL,
            last_updated INTEGER NOT NULL,
            benchmark_data TEXT
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_process_benchmarks_type
         ON process_benchmarks(process_type)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_process_benchmarks_updated
         ON process_benchmarks(last_updated DESC)",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS roi_configurations (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            team_id TEXT,
            avg_hourly_rate REAL NOT NULL DEFAULT 50.0,
            baseline_error_rate REAL NOT NULL DEFAULT 0.15,
            avg_error_cost REAL NOT NULL DEFAULT 100.0,
            currency TEXT NOT NULL DEFAULT 'USD',
            custom_multipliers TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_roi_config_user
         ON roi_configurations(user_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_roi_config_team
         ON roi_configurations(team_id)
         WHERE team_id IS NOT NULL",
        [],
    )?;

    conn.execute(
        "INSERT OR IGNORE INTO roi_configurations
         (id, user_id, team_id, avg_hourly_rate, baseline_error_rate, avg_error_cost, currency, created_at, updated_at)
         VALUES ('default', 'default', NULL, 50.0, 0.15, 100.0, 'USD', strftime('%s', 'now'), strftime('%s', 'now'))",
        [],
    )?;

    Ok(())
}

fn apply_migration_v29(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS tutorial_progress (
            user_id TEXT NOT NULL,
            tutorial_id TEXT NOT NULL,
            current_step INTEGER NOT NULL DEFAULT 0,
            completed_steps TEXT NOT NULL DEFAULT '[]', -- JSON array of completed step IDs
            started_at INTEGER NOT NULL,
            completed_at INTEGER,
            last_updated INTEGER NOT NULL,
            PRIMARY KEY (user_id, tutorial_id)
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_tutorial_progress_user
         ON tutorial_progress(user_id, last_updated DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_tutorial_progress_completed
         ON tutorial_progress(completed_at DESC)
         WHERE completed_at IS NOT NULL",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS tutorial_step_views (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            tutorial_id TEXT NOT NULL,
            step_id TEXT NOT NULL,
            viewed_at INTEGER NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_tutorial_step_views_user
         ON tutorial_step_views(user_id, tutorial_id, viewed_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS user_rewards (
            user_id TEXT NOT NULL,
            reward_id TEXT NOT NULL,
            granted_at INTEGER NOT NULL,
            PRIMARY KEY (user_id, reward_id)
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_user_rewards_user
         ON user_rewards(user_id, granted_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_user_rewards_reward
         ON user_rewards(reward_id)",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS sample_data_marker (
            user_id TEXT PRIMARY KEY,
            created_at INTEGER NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS tutorial_feedback (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            tutorial_id TEXT NOT NULL,
            rating INTEGER CHECK(rating >= 1 AND rating <= 5),
            feedback_text TEXT,
            helpful INTEGER CHECK(helpful IN (0, 1)),
            reported_issues TEXT, -- JSON array
            created_at INTEGER NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_tutorial_feedback_tutorial
         ON tutorial_feedback(tutorial_id, rating DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_tutorial_feedback_user
         ON tutorial_feedback(user_id, created_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS help_sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            context TEXT NOT NULL, -- Which feature/page user was on
            query TEXT, -- User's help search query
            help_article_id TEXT, -- Which article was shown
            was_helpful INTEGER CHECK(was_helpful IN (0, 1)),
            created_at INTEGER NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_help_sessions_user
         ON help_sessions(user_id, created_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_help_sessions_contex
         ON help_sessions(context, created_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS tutorial_feedback_fts USING fts5(
            feedback_id UNINDEXED,
            feedback_text,
            content=tutorial_feedback,
            content_rowid=rowid
        )",
        [],
    )?;

    // FTS sync triggers for tutorial_feedback_fts (external content table requires manual sync)
    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS tutorial_feedback_fts_ai AFTER INSERT ON tutorial_feedback BEGIN
            INSERT INTO tutorial_feedback_fts(rowid, feedback_text) VALUES (new.rowid, new.feedback_text);
        END",
        [],
    )?;
    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS tutorial_feedback_fts_ad AFTER DELETE ON tutorial_feedback BEGIN
            INSERT INTO tutorial_feedback_fts(tutorial_feedback_fts, rowid, feedback_text) VALUES ('delete', old.rowid, old.feedback_text);
        END",
        [],
    )?;
    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS tutorial_feedback_fts_au AFTER UPDATE ON tutorial_feedback BEGIN
            INSERT INTO tutorial_feedback_fts(tutorial_feedback_fts, rowid, feedback_text) VALUES ('delete', old.rowid, old.feedback_text);
            INSERT INTO tutorial_feedback_fts(rowid, feedback_text) VALUES (new.rowid, new.feedback_text);
        END",
        [],
    )?;

    Ok(())
}

fn apply_migration_v30(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS user_presence (
            user_id TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            last_seen INTEGER NOT NULL,
            current_activity TEXT,
            updated_at INTEGER NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS collaboration_sessions (
            id TEXT PRIMARY KEY,
            resource_type TEXT NOT NULL,
            resource_id TEXT NOT NULL,
            participants TEXT NOT NULL,
            started_at INTEGER NOT NULL,
            ended_at INTEGER
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_collaboration_active
         ON collaboration_sessions(resource_type, resource_id)
         WHERE ended_at IS NULL",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_user_presence_status
         ON user_presence(status, last_seen)",
        [],
    )?;

    Ok(())
}

fn apply_migration_v31(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS computer_use_sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            task_description TEXT NOT NULL,
            started_at INTEGER NOT NULL,
            ended_at INTEGER,
            status TEXT NOT NULL,
            actions_taken INTEGER DEFAULT 0
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS computer_use_actions (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            action_type TEXT NOT NULL,
            action_data TEXT NOT NULL,
            screenshot_path TEXT,
            timestamp INTEGER NOT NULL,
            success INTEGER DEFAULT 1,
            FOREIGN KEY(session_id) REFERENCES computer_use_sessions(id)
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_computer_use_sessions_user
         ON computer_use_sessions(user_id, started_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_computer_use_actions_session
         ON computer_use_actions(session_id, timestamp)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_computer_use_sessions_status
         ON computer_use_sessions(status)
         WHERE status = 'running'",
        [],
    )?;

    Ok(())
}

fn apply_migration_v32(conn: &Connection) -> Result<()> {
    // SECURITY: credentials_encrypted column must store AES-GCM encrypted data
    // Use the encryption module in sys/security/encryption.rs before storing
    conn.execute(
        "CREATE TABLE IF NOT EXISTS messaging_connections (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            platform TEXT NOT NULL CHECK(platform IN ('slack', 'whatsapp', 'teams')),
            workspace_id TEXT,
            workspace_name TEXT,
            credentials_encrypted TEXT NOT NULL,
            is_active INTEGER DEFAULT 1 CHECK(is_active IN (0, 1)),
            created_at INTEGER NOT NULL,
            last_used_at INTEGER
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_messaging_connections_user
         ON messaging_connections(user_id, platform)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_messaging_connections_active
         ON messaging_connections(user_id, is_active)
         WHERE is_active = 1",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS messaging_history (
            id TEXT PRIMARY KEY,
            connection_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            message_id TEXT,
            direction TEXT NOT NULL CHECK(direction IN ('inbound', 'outbound')),
            sender_id TEXT,
            sender_name TEXT,
            content TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            metadata TEXT,
            FOREIGN KEY(connection_id) REFERENCES messaging_connections(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_messaging_history_connection
         ON messaging_history(connection_id, timestamp DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_messaging_history_channel
         ON messaging_history(channel_id, timestamp DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_messaging_history_direction
         ON messaging_history(connection_id, direction, timestamp DESC)",
        [],
    )?;

    Ok(())
}

fn apply_migration_v33(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS realtime_metrics (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            automation_id TEXT,
            automation_name TEXT,
            time_saved_minutes INTEGER NOT NULL,
            cost_saved_usd REAL NOT NULL,
            tasks_completed INTEGER DEFAULT 1,
            errors_prevented INTEGER DEFAULT 0,
            quality_score REAL,
            timestamp INTEGER NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_metrics_user_time
         ON realtime_metrics(user_id, timestamp DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_metrics_automation
         ON realtime_metrics(automation_id, timestamp DESC)
         WHERE automation_id IS NOT NULL",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_metrics_timestamp
         ON realtime_metrics(timestamp DESC)",
        [],
    )?;

    Ok(())
}

fn apply_migration_v34(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS user_milestones (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            milestone_type TEXT NOT NULL,
            threshold_value REAL NOT NULL,
            achieved_at INTEGER NOT NULL,
            shared INTEGER DEFAULT 0 CHECK(shared IN (0, 1))
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_milestones_user
         ON user_milestones(user_id, achieved_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_milestones_type
         ON user_milestones(milestone_type)",
        [],
    )?;

    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_milestones_unique
         ON user_milestones(user_id, milestone_type)",
        [],
    )?;

    Ok(())
}

fn apply_migration_v35(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS metrics_daily_cache (
            user_id TEXT NOT NULL,
            date TEXT NOT NULL,
            total_time_saved_minutes INTEGER NOT NULL,
            total_cost_saved_usd REAL NOT NULL,
            total_automations INTEGER NOT NULL,
            avg_time_saved_per_run REAL NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (user_id, date)
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_daily_cache_date
         ON metrics_daily_cache(user_id, date DESC)",
        [],
    )?;

    Ok(())
}

fn apply_migration_v36(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS automation_benchmarks (
            automation_type TEXT PRIMARY KEY,
            avg_manual_time_minutes INTEGER NOT NULL,
            avg_automated_time_minutes INTEGER NOT NULL,
            avg_time_saved_minutes INTEGER NOT NULL,
            avg_cost_saved_usd REAL NOT NULL,
            manual_error_rate REAL NOT NULL,
            automated_error_rate REAL NOT NULL,
            sample_size INTEGER NOT NULL,
            last_updated INTEGER NOT NULL
        )",
        [],
    )?;

    let benchmarks = vec![
        ("data_entry", 120, 5, 115, 95.83, 0.15, 0.02, 1000),
        ("report_generation", 60, 3, 57, 47.50, 0.10, 0.01, 800),
        ("email_processing", 90, 4, 86, 71.67, 0.12, 0.02, 1200),
        ("web_scraping", 180, 10, 170, 141.67, 0.20, 0.03, 600),
        ("document_processing", 150, 8, 142, 118.33, 0.18, 0.02, 500),
    ];

    for (
        automation_type,
        manual_time,
        automated_time,
        time_saved,
        cost_saved,
        manual_error,
        automated_error,
        sample_size,
    ) in benchmarks
    {
        conn.execute(
            "INSERT OR IGNORE INTO automation_benchmarks
             (automation_type, avg_manual_time_minutes, avg_automated_time_minutes,
              avg_time_saved_minutes, avg_cost_saved_usd, manual_error_rate,
              automated_error_rate, sample_size, last_updated)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![
                automation_type,
                manual_time,
                automated_time,
                time_saved,
                cost_saved,
                manual_error,
                automated_error,
                sample_size,
                chrono::Utc::now().timestamp(),
            ],
        )?;
    }

    Ok(())
}

fn apply_migration_v37(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS first_run_sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            started_at INTEGER NOT NULL,
            completed_at INTEGER,
            step TEXT NOT NULL,
            recommended_demos TEXT NOT NULL,
            selected_demo_id TEXT,
            demo_results TEXT,
            time_to_value_seconds INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_first_run_user
         ON first_run_sessions(user_id, started_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_first_run_completed
         ON first_run_sessions(completed_at DESC)
         WHERE completed_at IS NOT NULL",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS sample_data_marker (
            user_id TEXT PRIMARY KEY,
            created_at INTEGER NOT NULL
        )",
        [],
    )?;

    Ok(())
}

fn apply_migration_v38(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS demo_runs (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            demo_id TEXT NOT NULL,
            ran_at INTEGER NOT NULL,
            results TEXT NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_demo_runs_user
         ON demo_runs(user_id, ran_at DESC)
         WHERE user_id IS NOT NULL",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_demo_runs_demo
         ON demo_runs(demo_id, ran_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_demo_runs_time
         ON demo_runs(ran_at DESC)",
        [],
    )?;

    Ok(())
}

fn apply_migration_v39(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS published_workflows (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            category TEXT NOT NULL,
            creator_id TEXT NOT NULL,
            creator_name TEXT NOT NULL,
            workflow_definition TEXT NOT NULL,
            thumbnail_url TEXT,
            share_url TEXT NOT NULL UNIQUE,
            clone_count INTEGER NOT NULL DEFAULT 0,
            view_count INTEGER NOT NULL DEFAULT 0,
            favorite_count INTEGER NOT NULL DEFAULT 0,
            avg_rating REAL NOT NULL DEFAULT 0.0,
            rating_count INTEGER NOT NULL DEFAULT 0,
            tags TEXT NOT NULL,
            estimated_time_saved INTEGER NOT NULL DEFAULT 0,
            estimated_cost_saved REAL NOT NULL DEFAULT 0.0,
            is_verified INTEGER NOT NULL DEFAULT 0 CHECK(is_verified IN (0, 1)),
            is_featured INTEGER NOT NULL DEFAULT 0 CHECK(is_featured IN (0, 1)),
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS workflow_clones (
            id TEXT PRIMARY KEY,
            workflow_id TEXT NOT NULL,
            cloner_id TEXT NOT NULL,
            cloner_name TEXT NOT NULL,
            cloned_at INTEGER NOT NULL,
            FOREIGN KEY(workflow_id) REFERENCES published_workflows(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS workflow_ratings (
            workflow_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
            comment TEXT,
            created_at INTEGER NOT NULL,
            PRIMARY KEY(workflow_id, user_id),
            FOREIGN KEY(workflow_id) REFERENCES published_workflows(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS workflow_favorites (
            workflow_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            favorited_at INTEGER NOT NULL,
            PRIMARY KEY(workflow_id, user_id),
            FOREIGN KEY(workflow_id) REFERENCES published_workflows(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS workflow_comments (
            id TEXT PRIMARY KEY,
            workflow_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            user_name TEXT NOT NULL,
            comment TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            FOREIGN KEY(workflow_id) REFERENCES published_workflows(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_published_workflows_category
         ON published_workflows(category)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_published_workflows_creator
         ON published_workflows(creator_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_published_workflows_share_url
         ON published_workflows(share_url)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_published_workflows_featured
         ON published_workflows(is_featured, avg_rating DESC)
         WHERE is_featured = 1",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_published_workflows_rating
         ON published_workflows(avg_rating DESC, rating_count DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_published_workflows_popular
         ON published_workflows(clone_count DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_published_workflows_recen
         ON published_workflows(created_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_workflow_clones_workflow
         ON workflow_clones(workflow_id, cloned_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_workflow_clones_user
         ON workflow_clones(cloner_id, cloned_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_workflow_clones_recen
         ON workflow_clones(cloned_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_workflow_ratings_workflow
         ON workflow_ratings(workflow_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_workflow_ratings_user
         ON workflow_ratings(user_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_workflow_favorites_workflow
         ON workflow_favorites(workflow_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_workflow_favorites_user
         ON workflow_favorites(user_id, favorited_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_workflow_comments_workflow
         ON workflow_comments(workflow_id, created_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_workflow_comments_user
         ON workflow_comments(user_id, created_at DESC)",
        [],
    )?;

    Ok(())
}

fn apply_migration_v40(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('viewer', 'editor', 'admin')),
            created_at TEXT NOT NULL,
            last_login_at TEXT,
            failed_login_attempts INTEGER NOT NULL DEFAULT 0,
            locked_until TEXT,
            email_verified INTEGER NOT NULL DEFAULT 0,
            verification_token TEXT,
            reset_token TEXT,
            reset_token_expires_at TEXT,
            CONSTRAINT email_format CHECK (email LIKE '%@%')
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS auth_sessions (
            session_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            access_token TEXT NOT NULL UNIQUE,
            refresh_token TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            last_activity_at TEXT NOT NULL,
            ip_address TEXT,
            user_agent TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // SECURITY: OAuth tokens must be encrypted before storage
    // Use the encryption module in sys/security/encryption.rs for access_token_encrypted and refresh_token_encrypted
    conn.execute(
        "CREATE TABLE IF NOT EXISTS oauth_providers (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            provider TEXT NOT NULL CHECK(provider IN ('google', 'github', 'microsoft')),
            provider_user_id TEXT NOT NULL,
            access_token_encrypted TEXT,
            refresh_token_encrypted TEXT,
            expires_at TEXT,
            scope TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(provider, provider_user_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )",
        [],
    )?;

    if !table_has_column(conn, "permissions", "name")? {
        conn.execute("DROP TABLE IF EXISTS permissions", [])?;
    }
    conn.execute(
        "CREATE TABLE IF NOT EXISTS permissions (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            description TEXT,
            category TEXT NOT NULL,
            created_at TEXT NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS role_permissions (
            role TEXT NOT NULL CHECK(role IN ('viewer', 'editor', 'admin')),
            permission_id TEXT NOT NULL,
            granted INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            PRIMARY KEY (role, permission_id),
            FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS user_permissions (
            user_id TEXT NOT NULL,
            permission_id TEXT NOT NULL,
            granted INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            PRIMARY KEY (user_id, permission_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS api_keys (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            key_hash TEXT NOT NULL,
            provider TEXT NOT NULL,
            permissions TEXT,
            created_at TEXT NOT NULL,
            expires_at TEXT,
            last_used_at TEXT,
            revoked INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS auth_audit_log (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            event_type TEXT NOT NULL,
            event_data TEXT,
            ip_address TEXT,
            user_agent TEXT,
            success INTEGER NOT NULL,
            error_message TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token) WHERE verification_token IS NOT NULL",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token) WHERE reset_token IS NOT NULL",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_auth_sessions_access_token ON auth_sessions(access_token)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_oauth_providers_user_id ON oauth_providers(user_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash) WHERE revoked = 0",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_auth_audit_log_user_id ON auth_audit_log(user_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_auth_audit_log_created_at ON auth_audit_log(created_at)",
        [],
    )?;

    let permissions = vec![
        ("chat:read", "View chat conversations", "chat"),
        ("chat:write", "Create and send messages", "chat"),
        ("chat:delete", "Delete conversations", "chat"),
        ("automation:read", "View automations", "automation"),
        (
            "automation:write",
            "Create and edit automations",
            "automation",
        ),
        ("automation:execute", "Execute automations", "automation"),
        ("automation:delete", "Delete automations", "automation"),
        ("browser:control", "Control browser sessions", "browser"),
        ("file:read", "Read files", "filesystem"),
        ("file:write", "Write files", "filesystem"),
        ("file:delete", "Delete files", "filesystem"),
        ("terminal:execute", "Execute terminal commands", "terminal"),
        ("api:call", "Make API requests", "api"),
        ("database:read", "Read from databases", "database"),
        ("database:write", "Write to databases", "database"),
        ("settings:read", "View settings", "settings"),
        ("settings:write", "Modify settings", "settings"),
        ("llm:use", "Use LLM providers", "llm"),
        ("llm:configure", "Configure LLM settings", "llm"),
        ("admin:user_management", "Manage users", "admin"),
        ("admin:system_config", "Configure system settings", "admin"),
    ];

    for (name, description, category) in permissions {
        conn.execute(
            "INSERT OR IGNORE INTO permissions (id, name, description, category, created_at)
             VALUES (?1, ?2, ?3, ?4, datetime('now'))",
            [
                &uuid::Uuid::new_v4().to_string(),
                name,
                description,
                category,
            ],
        )?;
    }

    let viewer_permissions = vec![
        "chat:read",
        "automation:read",
        "file:read",
        "database:read",
        "settings:read",
    ];

    let editor_permissions = vec![
        "chat:read",
        "chat:write",
        "automation:read",
        "automation:write",
        "automation:execute",
        "browser:control",
        "file:read",
        "file:write",
        "terminal:execute",
        "api:call",
        "database:read",
        "database:write",
        "settings:read",
        "settings:write",
        "llm:use",
        "llm:configure",
    ];

    let admin_permissions = vec![
        "chat:read",
        "chat:write",
        "chat:delete",
        "automation:read",
        "automation:write",
        "automation:execute",
        "automation:delete",
        "browser:control",
        "file:read",
        "file:write",
        "file:delete",
        "terminal:execute",
        "api:call",
        "database:read",
        "database:write",
        "settings:read",
        "settings:write",
        "llm:use",
        "llm:configure",
        "admin:user_management",
        "admin:system_config",
    ];

    for perm_name in viewer_permissions {
        conn.execute(
            "INSERT OR IGNORE INTO role_permissions (role, permission_id, granted, created_at)
             SELECT 'viewer', id, 1, datetime('now') FROM permissions WHERE name = ?1",
            [perm_name],
        )?;
    }

    for perm_name in editor_permissions {
        conn.execute(
            "INSERT OR IGNORE INTO role_permissions (role, permission_id, granted, created_at)
             SELECT 'editor', id, 1, datetime('now') FROM permissions WHERE name = ?1",
            [perm_name],
        )?;
    }

    for perm_name in admin_permissions {
        conn.execute(
            "INSERT OR IGNORE INTO role_permissions (role, permission_id, granted, created_at)
             SELECT 'admin', id, 1, datetime('now') FROM permissions WHERE name = ?1",
            [perm_name],
        )?;
    }

    Ok(())
}

fn apply_migration_v41(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            priority INTEGER NOT NULL DEFAULT 1,
            status TEXT NOT NULL DEFAULT 'Queued',
            progress INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            started_at INTEGER,
            completed_at INTEGER,
            result TEXT,
            payload TEXT
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC)",
        [],
    )?;

    tracing::info!("Applied migration v41: Background task management system");

    Ok(())
}

fn table_has_column(conn: &Connection, table: &str, column: &str) -> Result<bool> {
    let mut stmt =
        conn.prepare("SELECT 1 FROM pragma_table_info(?1) WHERE lower(name) = lower(?2)")?;
    stmt.exists([table, column])
}

fn table_exists(conn: &Connection, table: &str) -> Result<bool> {
    let mut stmt = conn
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND lower(name) = lower(?1)")?;
    stmt.exists([table])
}

/// Migration v48: Add last_accessed column to user_memory for importance decay
/// This column tracks when a memory was last accessed, enabling time-based decay
/// of memory importance for memories that aren't frequently accessed.
fn apply_migration_v48(conn: &Connection) -> Result<()> {
    // Check if the column already exists (idempotent migration)
    if !table_has_column(conn, "user_memory", "last_accessed")? {
        // Add last_accessed column with default to current timestamp
        conn.execute(
            "ALTER TABLE user_memory ADD COLUMN last_accessed TEXT DEFAULT CURRENT_TIMESTAMP",
            [],
        )?;

        // Initialize last_accessed to created_at for existing memories
        conn.execute(
            "UPDATE user_memory SET last_accessed = created_at WHERE last_accessed IS NULL",
            [],
        )?;

        // Create index for efficient decay candidate queries
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_user_memory_last_accessed ON user_memory(last_accessed)",
            [],
        )?;
    }

    tracing::info!(
        "Applied migration v48: Added last_accessed column to user_memory for importance decay"
    );

    Ok(())
}

/// Migration v49: Create job_executions table for scheduler execution logging
/// This table tracks the execution history of scheduled jobs.
fn apply_migration_v49(conn: &Connection) -> Result<()> {
    // Create job_executions table for tracking job execution history
    conn.execute(
        "CREATE TABLE IF NOT EXISTS job_executions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id TEXT NOT NULL,
            started_at TEXT NOT NULL,
            completed_at TEXT,
            status TEXT NOT NULL CHECK(status IN ('running', 'completed', 'failed', 'cancelled')),
            error TEXT,
            duration_ms INTEGER,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // Create indexes for efficient querying
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_job_executions_job_id ON job_executions(job_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_job_executions_started_at ON job_executions(started_at DESC)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_job_executions_status ON job_executions(status)",
        [],
    )?;

    // Add foreign key constraint to scheduled_jobs table (soft constraint via trigger)
    // Note: We use a soft constraint since jobs may be deleted while executions are retained for history
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_job_executions_job_status ON job_executions(job_id, status)",
        [],
    )?;

    tracing::info!(
        "Applied migration v49: Created job_executions table for scheduler execution logging"
    );

    Ok(())
}

/// Migration v50: Create background_agents table for "&" prefix background execution
fn apply_migration_v50(conn: &Connection) -> Result<()> {
    // Create background_agents table for persistent background agent state
    conn.execute(
        "CREATE TABLE IF NOT EXISTS background_agents (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL,
            goal TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('queued', 'running', 'paused', 'completed', 'failed', 'cancelled', 'taken_over')),
            progress_json TEXT NOT NULL,
            summary_json TEXT,
            error TEXT,
            created_at TEXT NOT NULL,
            started_at TEXT,
            completed_at TEXT,
            context_json TEXT NOT NULL,
            priority INTEGER NOT NULL DEFAULT 0,
            timeout_secs INTEGER NOT NULL DEFAULT 300
        )",
        [],
    )?;

    // Create indexes for efficient querying
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_background_agents_status ON background_agents(status)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_background_agents_conversation_id ON background_agents(conversation_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_background_agents_created_at ON background_agents(created_at DESC)",
        [],
    )?;

    tracing::info!(
        "Applied migration v50: Created background_agents table for background execution"
    );

    Ok(())
}

/// Migration v51: Create master password tables for SECSYS-001 security enhancement
///
/// This migration adds:
/// - master_password: Stores password verifier hash and Argon2 parameters
/// - master_password_migration: Tracks migration progress from machine-only to password-based keys
fn apply_migration_v51(conn: &Connection) -> Result<()> {
    // Create master_password table for storing password verifier
    // Note: We never store the actual password, only the Argon2 hash for verification
    conn.execute(
        "CREATE TABLE IF NOT EXISTS master_password (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            verifier_hash TEXT NOT NULL,
            verifier_salt TEXT NOT NULL,
            argon2_params TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    )?;

    // Create migration tracking table to track transition from machine-only to password-based keys
    conn.execute(
        "CREATE TABLE IF NOT EXISTS master_password_migration (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            migration_started_at TEXT,
            migration_completed_at TEXT,
            secrets_migrated INTEGER DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'failed'))
        )",
        [],
    )?;

    tracing::info!(
        "Applied migration v51: Created master_password tables for SECSYS-001 security enhancement"
    );

    Ok(())
}

/// Migration v52: Create project_memories table for project-scoped long-term memory
/// This table stores:
/// - ProjectContext: folder path, tech stack, conventions
/// - CodingStyle: naming conventions, patterns, formatting rules
/// - ArchitecturalDecision: design decisions, rationale, timestamps
///
/// Each memory entry is associated with a specific project folder and can be
/// searched by content using keyword search, with support for semantic search
/// via TF-IDF indexing.
fn apply_migration_v52(conn: &Connection) -> Result<()> {
    // Create project_memories table for storing project-scoped memories
    conn.execute(
        "CREATE TABLE IF NOT EXISTS project_memories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_folder TEXT NOT NULL,
            memory_type TEXT NOT NULL CHECK(memory_type IN ('context', 'coding_style', 'architectural_decision')),
            content TEXT NOT NULL,
            importance INTEGER NOT NULL DEFAULT 5 CHECK(importance >= 1 AND importance <= 10),
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_accessed TEXT,
            UNIQUE(project_folder, memory_type)
        )",
        [],
    )?;

    // Create indexes for efficient querying
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_project_memories_folder ON project_memories(project_folder)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_project_memories_type ON project_memories(memory_type)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_project_memories_importance ON project_memories(importance DESC)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_project_memories_updated ON project_memories(updated_at DESC)",
        [],
    )?;

    // Create FTS table for full-text search (with fallback if FTS5 unavailable)
    let fts_sql = "CREATE VIRTUAL TABLE IF NOT EXISTS project_memories_fts USING fts5(
        content,
        project_folder UNINDEXED,
        memory_type UNINDEXED,
        content='project_memories',
        content_rowid='id'
    )";

    if let Err(e) = conn.execute(fts_sql, []) {
        let err_msg = e.to_string().to_lowercase();
        if !err_msg.contains("no such module: fts5")
            && !err_msg.contains("fts5 is not compiled")
            && !err_msg.contains("unknown tokenizer")
        {
            return Err(e);
        }
        // FTS5 not available, continue without FTS support
        tracing::warn!(
            "FTS5 full-text search not available for project_memories. Falling back to LIKE queries."
        );
    }

    // Create triggers to keep FTS index in sync
    if conn
        .execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='project_memories_fts'",
            [],
        )
        .is_ok()
    {
        conn.execute(
            "CREATE TRIGGER IF NOT EXISTS project_memories_ai AFTER INSERT ON project_memories BEGIN
              INSERT INTO project_memories_fts(rowid, content, project_folder, memory_type)
              VALUES (new.id, new.content, new.project_folder, new.memory_type);
            END",
            [],
        ).ok();

        conn.execute(
            "CREATE TRIGGER IF NOT EXISTS project_memories_ad AFTER DELETE ON project_memories BEGIN
              DELETE FROM project_memories_fts WHERE rowid = old.id;
            END",
            [],
        ).ok();

        conn.execute(
            "CREATE TRIGGER IF NOT EXISTS project_memories_au AFTER UPDATE ON project_memories BEGIN
              DELETE FROM project_memories_fts WHERE rowid = old.id;
              INSERT INTO project_memories_fts(rowid, content, project_folder, memory_type)
              VALUES (new.id, new.content, new.project_folder, new.memory_type);
            END",
            [],
        ).ok();
    }

    tracing::info!(
        "Applied migration v52: Created project_memories table for project-scoped long-term memory"
    );

    Ok(())
}

/// Migration v53: Create AGI task checkpoint tables for session persistence
fn apply_migration_v53(conn: &Connection) -> Result<()> {
    // Create agi_tasks table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS agi_tasks (
            id TEXT PRIMARY KEY,
            goal_id TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at_ms INTEGER NOT NULL,
            completed_at_ms INTEGER,
            created_at TEXT NOT NULL
        )",
        [],
    )?;

    // Create agi_task_checkpoints table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS agi_task_checkpoints (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            goal_json TEXT NOT NULL,
            current_step INTEGER NOT NULL,
            completed_steps_json TEXT NOT NULL,
            current_state_json TEXT NOT NULL,
            tool_results_json TEXT NOT NULL,
            context_memory_json TEXT NOT NULL,
            available_resources_json TEXT NOT NULL,
            checkpoint_reason TEXT NOT NULL,
            created_at_ms INTEGER NOT NULL,
            total_steps INTEGER NOT NULL,
            progress_percent REAL NOT NULL,
            elapsed_time_ms INTEGER NOT NULL,
            estimated_remaining_ms INTEGER,
            tool_calls_executed INTEGER NOT NULL DEFAULT 0,
            failure_count INTEGER NOT NULL DEFAULT 0,
            last_error_message TEXT,
            is_latest BOOLEAN NOT NULL DEFAULT 1,
            parent_checkpoint_id TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY(task_id) REFERENCES agi_tasks(id),
            FOREIGN KEY(parent_checkpoint_id) REFERENCES agi_task_checkpoints(id)
        )",
        [],
    )?;

    // Create indices for efficient queries
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_agi_checkpoints_task_id
         ON agi_task_checkpoints(task_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_agi_checkpoints_latest
         ON agi_task_checkpoints(task_id, is_latest)
         WHERE is_latest = 1",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_agi_checkpoints_created
         ON agi_task_checkpoints(created_at_ms DESC)",
        [],
    )?;

    // Create agi_checkpoint_restore_history table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS agi_checkpoint_restore_history (
            id TEXT PRIMARY KEY,
            checkpoint_id TEXT NOT NULL,
            task_id TEXT NOT NULL,
            restored_at_ms INTEGER NOT NULL,
            resumed_steps INTEGER NOT NULL DEFAULT 0,
            success BOOLEAN NOT NULL,
            error_message TEXT,
            restored_at TEXT NOT NULL,
            FOREIGN KEY(checkpoint_id) REFERENCES agi_task_checkpoints(id),
            FOREIGN KEY(task_id) REFERENCES agi_tasks(id)
        )",
        [],
    )?;

    // Create indices for restore history
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_agi_restore_history_checkpoint
         ON agi_checkpoint_restore_history(checkpoint_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_agi_restore_history_task
         ON agi_checkpoint_restore_history(task_id)",
        [],
    )?;

    tracing::info!(
        "Applied migration v53: Created AGI task checkpoint tables for session persistence"
    );

    Ok(())
}

/// Migration v54: Add session_id column to command_history for session-scoped history
/// This enables terminal command history to be scoped to specific sessions
/// instead of being global across all sessions.
fn apply_migration_v54(conn: &Connection) -> Result<()> {
    // Check if the column already exists (idempotent migration)
    let column_exists: bool = conn
        .prepare("PRAGMA table_info(command_history)")?
        .query_map([], |row| {
            let name: String = row.get(1)?;
            Ok(name == "session_id")
        })?
        .filter_map(|r| r.ok())
        .next()
        .unwrap_or(false);

    if !column_exists {
        conn.execute("ALTER TABLE command_history ADD COLUMN session_id TEXT", [])?;

        // Create index for efficient session-scoped queries
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_command_history_session_id
             ON command_history(session_id)",
            [],
        )?;

        tracing::info!(
            "Applied migration v54: Added session_id column to command_history for session-scoped history"
        );
    }

    Ok(())
}

/// Migration v55: Backfill existing messages into the FTS index.
///
/// Migration v45 created the `messages_fts` virtual table and installed
/// INSERT/UPDATE/DELETE triggers so that all *new* messages are indexed
/// automatically.  However, any messages that were written before v45 were
/// never inserted into `messages_fts`.  This migration performs a one-time
/// backfill: it inserts every row from `messages` that is not already present
/// in `messages_fts`, using the same column mapping the v45 triggers use.
///
/// The operation is idempotent: rows that were already indexed by the v45
/// triggers (because they were written after that migration ran) are skipped
/// via the `NOT EXISTS` sub-query so no duplicates are created.
///
/// FTS5 availability is checked first.  When FTS5 is not compiled into the
/// SQLite build (e.g. certain embedded or sandboxed builds) the backfill is
/// silently skipped — the same graceful-degradation behaviour applied in v45.
fn apply_migration_v55(conn: &Connection) -> Result<()> {
    // Check whether FTS5 is available by probing the virtual table.
    let fts_available: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='messages_fts'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0)
        > 0;

    if !fts_available {
        tracing::info!(
            "Migration v55: messages_fts table not found (FTS5 unavailable). \
             Skipping chat history backfill."
        );
        return Ok(());
    }

    // Insert every message that is not yet present in the FTS index.
    // The v45 triggers stored message_id as CAST(id AS TEXT) and
    // conversation_id as CAST(conversation_id AS TEXT), so we use the same
    // casting here for consistency.
    let rows_inserted = conn.execute(
        "INSERT INTO messages_fts (message_id, conversation_id, content, sender, message_type, timestamp)
         SELECT
             CAST(m.id AS TEXT),
             CAST(m.conversation_id AS TEXT),
             m.content,
             m.role,
             'text',
             m.created_at
         FROM messages m
         WHERE NOT EXISTS (
             SELECT 1 FROM messages_fts f
             WHERE f.message_id = CAST(m.id AS TEXT)
         )",
        [],
    )?;

    tracing::info!(
        rows_inserted = rows_inserted,
        "Migration v55: Backfilled existing messages into messages_fts FTS index"
    );

    Ok(())
}

/// Migration v56: Conversation branching support
/// - Adds parent_message_id and branch_id columns to messages
/// - Creates conversation_branches table
/// - Backfills existing messages with branch_id = 'main'
/// - Creates an index on messages(conversation_id, branch_id)
fn apply_migration_v56(conn: &Connection) -> Result<()> {
    // Add branching columns to messages (idempotent: guard against duplicate column errors)
    if !table_has_column(conn, "messages", "parent_message_id")? {
        conn.execute(
            "ALTER TABLE messages ADD COLUMN parent_message_id INTEGER DEFAULT NULL",
            [],
        )?;
    }

    if !table_has_column(conn, "messages", "branch_id")? {
        conn.execute(
            "ALTER TABLE messages ADD COLUMN branch_id TEXT DEFAULT 'main'",
            [],
        )?;
    }

    // Create conversation_branches table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS conversation_branches (
            id TEXT PRIMARY KEY,
            conversation_id INTEGER NOT NULL,
            parent_branch_id TEXT,
            fork_point_message_id INTEGER,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_conversation_branches_conversation
         ON conversation_branches(conversation_id)",
        [],
    )?;

    // Backfill existing messages
    conn.execute(
        "UPDATE messages SET branch_id = 'main' WHERE branch_id IS NULL",
        [],
    )?;

    // Create index on messages(conversation_id, branch_id) for branch queries
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_messages_branch
         ON messages(conversation_id, branch_id)",
        [],
    )?;

    tracing::info!("Migration v56: Conversation branching schema applied");

    Ok(())
}

/// Migration v57: Add HMAC-based lookup columns for auth_sessions tokens.
/// The existing access_token / refresh_token columns are kept for backward compatibility
/// during the migration window and will be cleared after re-encryption.
fn apply_migration_v57(conn: &Connection) -> Result<()> {
    if !table_has_column(conn, "auth_sessions", "access_token_hash")? {
        conn.execute(
            "ALTER TABLE auth_sessions ADD COLUMN access_token_hash TEXT",
            [],
        )?;
    }
    if !table_has_column(conn, "auth_sessions", "access_token_encrypted")? {
        conn.execute(
            "ALTER TABLE auth_sessions ADD COLUMN access_token_encrypted TEXT",
            [],
        )?;
    }
    if !table_has_column(conn, "auth_sessions", "refresh_token_hash")? {
        conn.execute(
            "ALTER TABLE auth_sessions ADD COLUMN refresh_token_hash TEXT",
            [],
        )?;
    }
    if !table_has_column(conn, "auth_sessions", "refresh_token_encrypted")? {
        conn.execute(
            "ALTER TABLE auth_sessions ADD COLUMN refresh_token_encrypted TEXT",
            [],
        )?;
    }

    tracing::info!("Migration v57: Added token hash/encrypted columns to auth_sessions");

    Ok(())
}

/// Migration v58: Fix project_memories UNIQUE constraint
///
/// The original UNIQUE(project_folder, memory_type) blocks storing multiple
/// architectural decisions (or coding styles) for the same project. Fix by
/// removing the unique constraint entirely -- context/coding_style rows use
/// UPSERT at the application layer, so uniqueness is enforced in code.
fn apply_migration_v58(conn: &Connection) -> Result<()> {
    // SQLite cannot ALTER constraints, so we recreate the table via rename-copy-drop.
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS project_memories_v58 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_folder TEXT NOT NULL,
            memory_type TEXT NOT NULL CHECK(memory_type IN ('context', 'coding_style', 'architectural_decision')),
            content TEXT NOT NULL,
            importance INTEGER NOT NULL DEFAULT 5 CHECK(importance >= 1 AND importance <= 10),
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_accessed TEXT
        );

        INSERT OR IGNORE INTO project_memories_v58
            (id, project_folder, memory_type, content, importance, created_at, updated_at, last_accessed)
        SELECT id, project_folder, memory_type, content, importance, created_at, updated_at, last_accessed
        FROM project_memories;

        DROP TABLE IF EXISTS project_memories;
        ALTER TABLE project_memories_v58 RENAME TO project_memories;

        CREATE INDEX IF NOT EXISTS idx_project_memories_folder ON project_memories(project_folder);
        CREATE INDEX IF NOT EXISTS idx_project_memories_type ON project_memories(memory_type);
        CREATE INDEX IF NOT EXISTS idx_project_memories_importance ON project_memories(importance DESC);
        CREATE INDEX IF NOT EXISTS idx_project_memories_updated ON project_memories(updated_at DESC);
        "
    )?;

    tracing::info!(
        "Migration v58: Removed UNIQUE(project_folder, memory_type) from project_memories \
         to allow multiple architectural decisions per project"
    );

    Ok(())
}

fn migration_security_error(message: impl Into<String>) -> rusqlite::Error {
    rusqlite::Error::ToSqlConversionFailure(std::io::Error::other(message.into()).into())
}

/// Key for the auth-session token index and ciphertext.
///
/// F12: fails closed. Deriving from machine identifiers alone would let any
/// local process recompute the token index and decrypt every stored session.
fn migration_master_key() -> Result<Vec<u8>> {
    crate::sys::security::machine_key::try_derive_key(
        crate::sys::security::machine_key::KeyPurpose::MasterEncryption,
    )
    .map_err(|error| migration_security_error(error.to_string()))
}

fn migration_hmac_token_with(key_bytes: &[u8], token: &str) -> Result<String> {
    let mut mac = HmacSha256::new_from_slice(key_bytes)
        .map_err(|e| migration_security_error(format!("HMAC init failed: {e}")))?;
    mac.update(token.as_bytes());
    Ok(hex::encode(mac.finalize().into_bytes()))
}

fn migration_hmac_token(token: &str) -> Result<String> {
    migration_hmac_token_with(&migration_master_key()?, token)
}

fn migration_encrypt_token_with(key_bytes: &[u8], token: &str) -> Result<String> {
    let encrypted = crate::sys::security::encryption::encrypt_secret(key_bytes, token)
        .map_err(migration_security_error)?;
    serde_json::to_string(&encrypted).map_err(|e| {
        migration_security_error(format!("Serialize encrypted auth session token: {e}"))
    })
}

fn migration_encrypt_token(token: &str) -> Result<String> {
    migration_encrypt_token_with(&migration_master_key()?, token)
}

fn migration_decrypt_token_with(key_bytes: &[u8], stored: &str) -> Option<String> {
    let encrypted: crate::sys::security::encryption::EncryptedSecret =
        serde_json::from_str(stored).ok()?;
    crate::sys::security::encryption::decrypt_secret_with_key(key_bytes, &encrypted).ok()
}

fn apply_migration_v59(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "ALTER TABLE auth_sessions RENAME TO auth_sessions_legacy_v59;

        CREATE TABLE auth_sessions (
            session_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            access_token TEXT NOT NULL DEFAULT '[redacted]',
            refresh_token TEXT NOT NULL DEFAULT '[redacted]',
            access_token_hash TEXT NOT NULL UNIQUE,
            access_token_encrypted TEXT NOT NULL,
            refresh_token_hash TEXT NOT NULL UNIQUE,
            refresh_token_encrypted TEXT NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            last_activity_at TEXT NOT NULL,
            ip_address TEXT,
            user_agent TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );",
    )?;

    #[derive(Debug)]
    struct LegacyAuthSessionRow {
        session_id: String,
        user_id: String,
        access_token: String,
        refresh_token: String,
        access_token_hash: Option<String>,
        access_token_encrypted: Option<String>,
        refresh_token_hash: Option<String>,
        refresh_token_encrypted: Option<String>,
        created_at: String,
        expires_at: String,
        last_activity_at: String,
        ip_address: Option<String>,
        user_agent: Option<String>,
    }

    let legacy_rows = {
        let mut stmt = conn.prepare(
            "SELECT session_id, user_id, access_token, refresh_token,
             access_token_hash, access_token_encrypted, refresh_token_hash, refresh_token_encrypted,
             created_at, expires_at, last_activity_at, ip_address, user_agent
             FROM auth_sessions_legacy_v59",
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(LegacyAuthSessionRow {
                session_id: row.get(0)?,
                user_id: row.get(1)?,
                access_token: row.get(2)?,
                refresh_token: row.get(3)?,
                access_token_hash: row.get(4)?,
                access_token_encrypted: row.get(5)?,
                refresh_token_hash: row.get(6)?,
                refresh_token_encrypted: row.get(7)?,
                created_at: row.get(8)?,
                expires_at: row.get(9)?,
                last_activity_at: row.get(10)?,
                ip_address: row.get(11)?,
                user_agent: row.get(12)?,
            })
        })?;

        rows.collect::<Result<Vec<_>>>()?
    };

    let mut migrated = 0usize;
    let mut deleted_invalid = 0usize;
    let mut skipped_duplicates = 0usize;

    for row in legacy_rows {
        let access_hash = match row.access_token_hash.filter(|value| !value.is_empty()) {
            Some(value) => Some(value),
            None if row.access_token != REDACTED_TOKEN_SENTINEL => {
                Some(migration_hmac_token(&row.access_token)?)
            }
            None => None,
        };
        let refresh_hash = match row.refresh_token_hash.filter(|value| !value.is_empty()) {
            Some(value) => Some(value),
            None if row.refresh_token != REDACTED_TOKEN_SENTINEL => {
                Some(migration_hmac_token(&row.refresh_token)?)
            }
            None => None,
        };
        let access_encrypted = match row.access_token_encrypted.filter(|value| !value.is_empty()) {
            Some(value) => Some(value),
            None if row.access_token != REDACTED_TOKEN_SENTINEL => {
                Some(migration_encrypt_token(&row.access_token)?)
            }
            None => None,
        };
        let refresh_encrypted = match row
            .refresh_token_encrypted
            .filter(|value| !value.is_empty())
        {
            Some(value) => Some(value),
            None if row.refresh_token != REDACTED_TOKEN_SENTINEL => {
                Some(migration_encrypt_token(&row.refresh_token)?)
            }
            None => None,
        };

        let (
            Some(access_hash),
            Some(access_encrypted),
            Some(refresh_hash),
            Some(refresh_encrypted),
        ) = (
            access_hash,
            access_encrypted,
            refresh_hash,
            refresh_encrypted,
        )
        else {
            deleted_invalid += 1;
            tracing::warn!(
                session_id = %row.session_id,
                "Migration v59: dropped auth session row missing recoverable encrypted/hash token data"
            );
            continue;
        };

        let inserted = conn.execute(
            "INSERT OR IGNORE INTO auth_sessions (
                session_id, user_id, access_token, refresh_token,
                access_token_hash, access_token_encrypted, refresh_token_hash, refresh_token_encrypted,
                created_at, expires_at, last_activity_at, ip_address, user_agent
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                row.session_id,
                row.user_id,
                REDACTED_TOKEN_SENTINEL,
                REDACTED_TOKEN_SENTINEL,
                access_hash,
                access_encrypted,
                refresh_hash,
                refresh_encrypted,
                row.created_at,
                row.expires_at,
                row.last_activity_at,
                row.ip_address,
                row.user_agent,
            ],
        )?;
        if inserted == 0 {
            skipped_duplicates += 1;
            tracing::warn!(
                session_id = %row.session_id,
                "Migration v59: skipped duplicate auth session hash during rebuild"
            );
            continue;
        }

        migrated += 1;
    }

    conn.execute("DROP TABLE auth_sessions_legacy_v59", [])?;
    conn.execute(
        "CREATE INDEX idx_auth_sessions_user_id ON auth_sessions(user_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX idx_auth_sessions_expires_at ON auth_sessions(expires_at)",
        [],
    )?;

    tracing::info!(
        migrated_sessions = migrated,
        dropped_invalid_sessions = deleted_invalid,
        skipped_duplicate_sessions = skipped_duplicates,
        "Migration v59: rebuilt auth_sessions to use hashed lookups, encrypted storage, and redacted legacy columns"
    );

    Ok(())
}

/// Migration v60: Create artifacts and artifact_versions tables for persistent artifact storage.
/// Moves artifact data from in-memory-only to SQLite persistence with full version history.
fn apply_migration_v60(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS artifacts (
            id TEXT PRIMARY KEY,
            artifact_type TEXT NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            language TEXT,
            metadata TEXT,
            conversation_id TEXT,
            version INTEGER NOT NULL DEFAULT 1,
            content_hash TEXT,
            status TEXT NOT NULL DEFAULT 'complete',
            is_pinned INTEGER NOT NULL DEFAULT 0,
            is_archived INTEGER NOT NULL DEFAULT 0,
            tags TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_artifacts_conversation ON artifacts(conversation_id);
        CREATE INDEX IF NOT EXISTS idx_artifacts_type ON artifacts(artifact_type);
        CREATE INDEX IF NOT EXISTS idx_artifacts_status ON artifacts(status);

        CREATE TABLE IF NOT EXISTS artifact_versions (
            id TEXT PRIMARY KEY,
            artifact_id TEXT NOT NULL,
            version INTEGER NOT NULL,
            content TEXT NOT NULL,
            content_hash TEXT,
            change_description TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_artifact_versions_artifact ON artifact_versions(artifact_id);",
    )?;

    Ok(())
}

/// Migration v61: Add `archived` column to conversations table for soft-archive support.
fn apply_migration_v61(conn: &Connection) -> Result<()> {
    ensure_column(
        conn,
        "conversations",
        "archived",
        "archived INTEGER NOT NULL DEFAULT 0",
    )?;

    Ok(())
}

fn apply_migration_v62(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS remembered_tool_choices (
            tool_name   TEXT PRIMARY KEY NOT NULL,
            approved    INTEGER NOT NULL,
            updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );",
    )?;
    Ok(())
}

/// Migration v63 (FIX-F6, audit 2026-05-19): close the
/// remember-able-privileged-transition Lies-in-the-Loop bypass.
///
/// Two changes:
/// 1. Add `never_remember INTEGER NOT NULL DEFAULT 0` column. Future entries
///    written for tools on the NEVER_REMEMBERABLE allowlist will have this
///    set to 1; the runtime check in tool_confirmation::respond_tool_-
///    confirmation rejects remember_choice=true for those tools at the
///    source so the column should always be 0 going forward — it exists
///    as a forensic flag in case any historical write slipped through.
///
/// 2. DELETE every existing row whose tool_name is in NEVER_REMEMBERABLE.
///    A prior build allowed users to check "remember this choice" for
///    set_auto_approve_all / set_agent_mode:autopilot / execute_code etc.
///    Those rows represent a live one-click bypass on every startup.
///    Wiping them at migration time invalidates the bypass even for users
///    upgrading from a vulnerable build. Wrapped in the standard
///    run_migration_in_transaction wrapper so a partial failure rolls back.
fn apply_migration_v63(conn: &Connection) -> Result<()> {
    // Step 1: add the never_remember column (idempotent via PRAGMA query
    // pattern so re-running on an environment that already has the column
    // doesn't fail).
    let has_column: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('remembered_tool_choices') \
             WHERE name = 'never_remember'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);
    if has_column == 0 {
        conn.execute_batch(
            "ALTER TABLE remembered_tool_choices \
             ADD COLUMN never_remember INTEGER NOT NULL DEFAULT 0;",
        )?;
    }

    // Step 2: purge dangerous existing rows. The list MUST stay in lockstep
    // with sys/commands/tool_confirmation::NEVER_REMEMBERABLE; a test in
    // both modules pins the alignment.
    const PURGE_TOOL_NAMES: &[&str] = &[
        "set_auto_approve_all",
        "set_agent_mode:autopilot",
        "set_tool_approval_policy",
        "execute_code",
        "code_execute",
        "file_write",
        "file_write_text",
        "file_write_binary",
        "file_open_with_default_app",
        "playwright_evaluate",
        "terminal_execute",
        "folder_access",
    ];
    for tool_name in PURGE_TOOL_NAMES {
        conn.execute(
            "DELETE FROM remembered_tool_choices WHERE tool_name = ?1",
            [tool_name],
        )?;
    }
    Ok(())
}

/// Migration v64: Add round-10 fields to the projects table.
/// icon_emoji stores a single grapheme emoji; accent_color stores one of the
/// canonical ProjectAccentColor values; default_privacy_mode stores the
/// PrivacyMode ('local'|'byok'|'managed'). All columns are nullable and
/// backward-compatible — existing rows will read as NULL.
fn apply_migration_v64(conn: &Connection) -> Result<()> {
    ensure_column(conn, "projects", "icon_emoji", "icon_emoji TEXT")?;
    ensure_column(conn, "projects", "accent_color", "accent_color TEXT")?;
    ensure_column(
        conn,
        "projects",
        "default_privacy_mode",
        "default_privacy_mode TEXT",
    )?;
    Ok(())
}

/// Migration v65: Add knowledge_base_files column to projects table.
/// Stores JSON-serialized knowledge base file metadata (with extracted text
/// content) for context injection. ADDITIVE ALTER TABLE only.
fn apply_migration_v65(conn: &Connection) -> Result<()> {
    ensure_column(
        conn,
        "projects",
        "knowledge_base_files",
        "knowledge_base_files TEXT",
    )?;
    Ok(())
}

/// Migration v66: Add app_mode column to conversations for strict Local/Cloud separation.
///
/// Each conversation belongs to exactly one mode: "local" or "cloud".
/// Queries that list conversations for the sidebar MUST filter by the active mode
/// so Local-mode conversations never appear in Cloud mode and vice-versa.
/// Existing rows default to "local" (the safest default — they were created before
/// the cloud feature existed and were never synced).
fn apply_migration_v66(conn: &Connection) -> Result<()> {
    ensure_column(
        conn,
        "conversations",
        "app_mode",
        "app_mode TEXT NOT NULL DEFAULT 'local'",
    )?;

    // A simple single-column index on app_mode is always safe regardless of
    // which other columns the conversations table has at this migration point.
    // The combined (user_id, app_mode) filtering is handled at the query level
    // by existing user_id indexes that were added in migration v42.
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_conversations_app_mode \
         ON conversations(app_mode)",
        [],
    )?;

    Ok(())
}

/// Migration v67: Cloud sync identity + bookkeeping columns.
///
/// Additive only — local INTEGER PKs and the INTEGER conversation_id FK are
/// untouched. Only the WIRE protocol uses cloud_id. SQLite cannot add a UNIQUE
/// constraint via ALTER TABLE ADD COLUMN, so uniqueness is enforced via a
/// partial unique index on non-NULL cloud_ids.
///
/// Safety: if `conversations` or `messages` do not yet exist (can happen when
/// this migration runs in a partial test schema seeded from an earlier version),
/// the column additions are skipped — the tables will be created with these
/// columns by their own earlier migrations (v1) in a real upgrade.
fn apply_migration_v67(conn: &Connection) -> Result<()> {
    // Helper: returns true if the given table exists in the schema.
    let table_exists = |table: &str| -> bool {
        conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
            [table],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0)
            > 0
    };

    // Cloud sync columns on both tables.
    for table in ["conversations", "messages"] {
        if !table_exists(table) {
            tracing::debug!(
                table = table,
                "v67: skipping cloud sync columns — table does not exist yet"
            );
            continue;
        }
        ensure_column(conn, table, "cloud_id", "cloud_id TEXT")?; // UUIDv7, NULL until synced
        ensure_column(conn, table, "server_version", "server_version TEXT")?; // bigint-string cursor
        ensure_column(conn, table, "created_at_utc", "created_at_utc TEXT")?; // UTC ISO-8601
        ensure_column(conn, table, "deleted_at_utc", "deleted_at_utc TEXT")?; // tombstone
        ensure_column(
            conn,
            table,
            "needs_push",
            "needs_push INTEGER NOT NULL DEFAULT 0",
        )?;
    }
    // messages also needs the cloud parent id so a pulled message can be FK-mapped
    // even before its parent conversation's local row is known.
    if table_exists("messages") {
        ensure_column(
            conn,
            "messages",
            "conversation_cloud_id",
            "conversation_cloud_id TEXT",
        )?;
    }

    // Partial UNIQUE indexes: uniqueness only on non-null cloud_ids.
    if table_exists("conversations") {
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_cloud_id \
             ON conversations(cloud_id) WHERE cloud_id IS NOT NULL",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_conversations_needs_push \
             ON conversations(needs_push) WHERE needs_push = 1",
            [],
        )?;
    }
    if table_exists("messages") {
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_cloud_id \
             ON messages(cloud_id) WHERE cloud_id IS NOT NULL",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_messages_needs_push \
             ON messages(needs_push) WHERE needs_push = 1",
            [],
        )?;
    }

    // Per-user sync cursor (server_version high-water mark). Own table so it
    // survives cold start independent of settings churn.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS cloud_sync_state ( \
            user_id TEXT PRIMARY KEY, \
            cursor TEXT NOT NULL DEFAULT '0', \
            last_sync_at TEXT \
        )",
        [],
    )?;

    // Orphan buffer: a pulled message whose parent conversation has not landed yet
    // (the conversation is re-versioned on every update, so it can sit ABOVE its own
    // older messages and arrive in a later pull page). Persist the message here
    // instead of dropping it, and replay once the parent's local row exists — without
    // this, such messages are lost permanently.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS cloud_sync_pending_messages ( \
            cloud_id TEXT PRIMARY KEY, \
            conversation_cloud_id TEXT NOT NULL, \
            user_id TEXT NOT NULL, \
            role TEXT, \
            content TEXT, \
            model TEXT, \
            provider TEXT, \
            created_at TEXT, \
            deleted_at TEXT, \
            server_version TEXT NOT NULL \
        )",
        [],
    )?;

    Ok(())
}

/// Migration v68: Cloud sync columns for `user_memory` (managed-cloud memory sharing).
///
/// Mirrors v66 (`app_mode`) + v67 (`cloud_id` / `needs_push` / `server_version` / UTC tombstone
/// timestamps) but applied to `user_memory` so memories sync cross-device exactly like chats.
///
/// Additive only — existing local rows (app_mode DEFAULT 'local') are untouched.
/// A separate `memory_cursor` column is added to `cloud_sync_state` so the memory HWM
/// is tracked independently of the chat cursor.
fn apply_migration_v68(conn: &Connection) -> Result<()> {
    let table_exists = |table: &str| -> bool {
        conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
            [table],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0)
            > 0
    };

    // Sync identity + bookkeeping columns on user_memory.
    if table_exists("user_memory") {
        // app_mode mirrors v66 conversations.app_mode: 'local' | 'cloud'.
        // Local/BYOK memories stay 'local' and are never pushed.
        ensure_column(
            conn,
            "user_memory",
            "app_mode",
            "app_mode TEXT NOT NULL DEFAULT 'local'",
        )?;
        // UUIDv7 cloud id — NULL until first cloud sync marks the row.
        ensure_column(conn, "user_memory", "cloud_id", "cloud_id TEXT")?;
        // Bigint-string server version from the Postgres sequence.
        ensure_column(conn, "user_memory", "server_version", "server_version TEXT")?;
        // UTC ISO-8601 counterparts (SQLite CURRENT_TIMESTAMP is space-separated; Z-suffix needed).
        ensure_column(conn, "user_memory", "created_at_utc", "created_at_utc TEXT")?;
        // Soft-delete tombstone: set when a cloud memory is deleted so the delete propagates.
        ensure_column(conn, "user_memory", "deleted_at_utc", "deleted_at_utc TEXT")?;
        // Dirty flag: 1 → row needs to be pushed to the cloud on next sync.
        ensure_column(
            conn,
            "user_memory",
            "needs_push",
            "needs_push INTEGER NOT NULL DEFAULT 0",
        )?;

        // Partial UNIQUE index: uniqueness enforced only on non-NULL cloud_ids (SQLite
        // cannot add a UNIQUE constraint via ALTER TABLE ADD COLUMN).
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_user_memory_cloud_id \
             ON user_memory(cloud_id) WHERE cloud_id IS NOT NULL",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_user_memory_needs_push \
             ON user_memory(needs_push) WHERE needs_push = 1",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_user_memory_app_mode \
             ON user_memory(app_mode)",
            [],
        )?;
    } else {
        tracing::debug!("v68: skipping user_memory columns — table does not exist yet");
    }

    // Per-user MEMORY cursor (separate from the chat cursor so the two streams
    // advance independently). cloud_sync_state may not exist yet if v67 is not
    // applied (partial test schema), so guard with IF NOT EXISTS on the table.
    if table_exists("cloud_sync_state") {
        ensure_column(
            conn,
            "cloud_sync_state",
            "memory_cursor",
            "memory_cursor TEXT NOT NULL DEFAULT '0'",
        )?;
    } else {
        // cloud_sync_state hasn't been created yet (v67 not applied), so create it
        // now with both columns. In a normal upgrade v67 runs first, but defensive.
        conn.execute(
            "CREATE TABLE IF NOT EXISTS cloud_sync_state ( \
                user_id TEXT PRIMARY KEY, \
                cursor TEXT NOT NULL DEFAULT '0', \
                memory_cursor TEXT NOT NULL DEFAULT '0', \
                last_sync_at TEXT \
            )",
            [],
        )?;
    }

    Ok(())
}

/// Migration v69: Cloud sync columns for `projects` (managed-cloud project sharing).
///
/// Mirrors v68 (`user_memory`) but applied to `projects` so projects sync cross-device
/// exactly like memories and chats.
///
/// Additive only — existing local rows (app_mode DEFAULT 'local') are untouched.
/// A separate `project_cursor` column is added to `cloud_sync_state` so the projects
/// HWM is tracked independently of chat and memory cursors.
///
/// Also adds a `metadata` TEXT column to `projects` (JSON blob) that the wire protocol
/// includes for arbitrary structured data — absent from the original v44 schema.
fn apply_migration_v69(conn: &Connection) -> Result<()> {
    let table_exists = |table: &str| -> bool {
        conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
            [table],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0)
            > 0
    };

    // Sync identity + bookkeeping columns on projects.
    if table_exists("projects") {
        // app_mode mirrors v66/v68: 'local' | 'cloud'.
        // Local/BYOK projects stay 'local' and are never pushed.
        ensure_column(
            conn,
            "projects",
            "app_mode",
            "app_mode TEXT NOT NULL DEFAULT 'local'",
        )?;
        // UUIDv7 cloud id — NULL until first cloud sync marks the row.
        ensure_column(conn, "projects", "cloud_id", "cloud_id TEXT")?;
        // Bigint-string server version from the Postgres sequence.
        ensure_column(conn, "projects", "server_version", "server_version TEXT")?;
        // UTC ISO-8601 creation timestamp (wire field `createdAt`).
        ensure_column(conn, "projects", "created_at_utc", "created_at_utc TEXT")?;
        // Soft-delete tombstone: set when a cloud project is deleted.
        ensure_column(conn, "projects", "deleted_at_utc", "deleted_at_utc TEXT")?;
        // Dirty flag: 1 → row needs to be pushed to the cloud on next sync.
        ensure_column(
            conn,
            "projects",
            "needs_push",
            "needs_push INTEGER NOT NULL DEFAULT 0",
        )?;
        // metadata JSON blob — wire field `metadata` (record<string, unknown>).
        // Not part of original v44 schema; added here so pull can store it.
        ensure_column(conn, "projects", "metadata", "metadata TEXT")?;

        // Partial UNIQUE index on cloud_id (cannot add UNIQUE via ALTER TABLE ADD COLUMN).
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_cloud_id \
             ON projects(cloud_id) WHERE cloud_id IS NOT NULL",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_projects_needs_push \
             ON projects(needs_push) WHERE needs_push = 1",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_projects_app_mode \
             ON projects(app_mode)",
            [],
        )?;
    } else {
        tracing::debug!("v69: skipping projects columns — table does not exist yet");
    }

    // Per-user PROJECTS cursor (separate from chat + memory cursors).
    if table_exists("cloud_sync_state") {
        ensure_column(
            conn,
            "cloud_sync_state",
            "project_cursor",
            "project_cursor TEXT NOT NULL DEFAULT '0'",
        )?;
    } else {
        // cloud_sync_state not yet created (v67 not applied) — create defensively.
        conn.execute(
            "CREATE TABLE IF NOT EXISTS cloud_sync_state ( \
                user_id TEXT PRIMARY KEY, \
                cursor TEXT NOT NULL DEFAULT '0', \
                memory_cursor TEXT NOT NULL DEFAULT '0', \
                project_cursor TEXT NOT NULL DEFAULT '0', \
                last_sync_at TEXT \
            )",
            [],
        )?;
    }

    Ok(())
}

/// Migration v70: add `settings_cursor` column to `cloud_sync_state`.
/// The legacy native settings-sync path persisted a per-user server version
/// cursor here so pull can skip unchanged documents.  No user-data table is
/// altered — settings live in-memory (SettingsState) not in a dedicated table.
fn apply_migration_v70(conn: &Connection) -> Result<()> {
    let table_exists = |table: &str| -> bool {
        conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
            [table],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0)
            > 0
    };

    if table_exists("cloud_sync_state") {
        ensure_column(
            conn,
            "cloud_sync_state",
            "settings_cursor",
            "settings_cursor TEXT NOT NULL DEFAULT '0'",
        )?;
    } else {
        // cloud_sync_state not yet created — create defensively with all known columns.
        conn.execute(
            "CREATE TABLE IF NOT EXISTS cloud_sync_state ( \
                user_id TEXT PRIMARY KEY, \
                cursor TEXT NOT NULL DEFAULT '0', \
                memory_cursor TEXT NOT NULL DEFAULT '0', \
                project_cursor TEXT NOT NULL DEFAULT '0', \
                settings_cursor TEXT NOT NULL DEFAULT '0', \
                last_sync_at TEXT \
            )",
            [],
        )?;
    }

    Ok(())
}

/// Migration v71: Cloud sync identity + bookkeeping columns for `artifacts`.
///
/// Mirrors v67 (conversations/messages) but applied to the `artifacts` table
/// so artifacts participate in the shared chat-cursor sync on `/api/chat/sync`.
///
/// The `artifacts` table uses a TEXT primary key (UUID generated at create time,
/// stored in `id`). We add a dedicated `cloud_id` (UUIDv7) for the wire layer so
/// the local ID (which may be a v4 UUID or other local-only format) and the cloud
/// identity are always distinct. `conversation_cloud_id` mirrors the parent
/// conversation's cloud_id so the gather JOIN can skip the conversations table.
///
/// `app_mode` defaults to 'local' — existing rows are local-only and will not be
/// pushed (safe default, same as conversations/messages/memory/projects).
/// `deleted_at_utc` is the soft-delete tombstone column (the base schema has no
/// `deleted_at`; the cloud protocol requires tombstone propagation).
///
/// Additive only — existing schema and data are untouched.
fn apply_migration_v71(conn: &Connection) -> Result<()> {
    let table_exists = |table: &str| -> bool {
        conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
            [table],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0)
            > 0
    };

    if table_exists("artifacts") {
        // app_mode: 'local' | 'cloud' — existing rows default to 'local'.
        ensure_column(
            conn,
            "artifacts",
            "app_mode",
            "app_mode TEXT NOT NULL DEFAULT 'local'",
        )?;
        // cloud_id: UUIDv7 assigned at first mint; NULL until synced.
        ensure_column(conn, "artifacts", "cloud_id", "cloud_id TEXT")?;
        // server_version: bigint-string from the Postgres sequence.
        ensure_column(conn, "artifacts", "server_version", "server_version TEXT")?;
        // conversation_cloud_id: the parent conversation's cloud_id (denormalized
        // for gather efficiency — avoids joining conversations at push time).
        ensure_column(
            conn,
            "artifacts",
            "conversation_cloud_id",
            "conversation_cloud_id TEXT",
        )?;
        // deleted_at_utc: soft-delete tombstone (base schema has no deleted_at).
        ensure_column(conn, "artifacts", "deleted_at_utc", "deleted_at_utc TEXT")?;
        // needs_push: dirty flag; 1 = push on next sync cycle.
        ensure_column(
            conn,
            "artifacts",
            "needs_push",
            "needs_push INTEGER NOT NULL DEFAULT 0",
        )?;

        // Partial UNIQUE index on non-NULL cloud_ids (SQLite does not support
        // ADD UNIQUE COLUMN via ALTER TABLE).
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_artifacts_cloud_id \
             ON artifacts(cloud_id) WHERE cloud_id IS NOT NULL",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_artifacts_needs_push \
             ON artifacts(needs_push) WHERE needs_push = 1",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_artifacts_app_mode \
             ON artifacts(app_mode)",
            [],
        )?;
    } else {
        tracing::debug!("v71: skipping artifacts columns — table does not exist yet");
    }

    Ok(())
}

/// Migration v72: Persist the immutable per-conversation execution boundary.
///
/// `app_mode` identifies the storage/workspace plane (`local` or `cloud`).
/// `execution_mode` identifies provider admission (`local_only`, `byok`, or
/// `cloud_managed`). Historical cloud rows are managed; historical local rows
/// fail closed to local-only because old data cannot prove BYOK consent.
fn apply_migration_v72(conn: &Connection) -> Result<()> {
    ensure_column(
        conn,
        "conversations",
        "execution_mode",
        "execution_mode TEXT NOT NULL DEFAULT 'local_only'",
    )?;
    conn.execute(
        "UPDATE conversations SET execution_mode = 'cloud_managed' WHERE app_mode = 'cloud'",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_conversations_execution_mode ON conversations(execution_mode)",
        [],
    )?;
    Ok(())
}

/// Migration v73: durably associate artifacts with their source message.
///
/// Artifacts are created while a tool loop is running, before the assistant
/// message receives its SQLite id. The native runtime links them when the
/// stream-end event supplies that id. Keeping the reference on the canonical
/// artifact row lets chat reload reconstruct `message.artifacts` without
/// copying artifact content into the legacy `messages.artifacts` JSON column.
fn apply_migration_v73(conn: &Connection) -> Result<()> {
    let artifacts_exists = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='artifacts'",
            [],
            |row| row.get::<_, bool>(0),
        )
        .unwrap_or(false);
    if artifacts_exists {
        ensure_column(conn, "artifacts", "message_id", "message_id INTEGER")?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_artifacts_message ON artifacts(message_id)",
            [],
        )?;
    }
    Ok(())
}

/// Migration v74: persist the cross-device identity of an artifact's source message.
///
/// `artifacts.message_id` is the local SQLite INTEGER and therefore cannot be
/// serialized or resolved on another device. `message_cloud_id` carries only
/// the managed-cloud UUID. Local and BYOK rows keep it NULL and remain outside
/// the cloud-sync gather predicate.
fn apply_migration_v74(conn: &Connection) -> Result<()> {
    let table_exists = |table: &str| -> bool {
        conn.query_row(
            "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name=?1",
            [table],
            |row| row.get::<_, bool>(0),
        )
        .unwrap_or(false)
    };
    let artifacts_exists = table_exists("artifacts");
    if artifacts_exists {
        ensure_column(
            conn,
            "artifacts",
            "message_cloud_id",
            "message_cloud_id TEXT",
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_artifacts_message_cloud_id \
             ON artifacts(message_cloud_id) WHERE message_cloud_id IS NOT NULL",
            [],
        )?;
    }
    // Durable journal for artifact deltas whose parent conversation is on a
    // later pull page. Payloads are user-scoped and keyed by cloud identity so
    // reordered/duplicate versions can collapse before replay.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS cloud_sync_pending_artifacts ( \
            cloud_id TEXT NOT NULL, \
            conversation_cloud_id TEXT NOT NULL, \
            user_id TEXT NOT NULL, \
            message_cloud_id TEXT, \
            title TEXT, \
            artifact_type TEXT NOT NULL, \
            language TEXT, \
            content TEXT NOT NULL, \
            current_version INTEGER, \
            pinned INTEGER, \
            tags TEXT NOT NULL DEFAULT '[]', \
            created_at TEXT, \
            updated_at TEXT, \
            deleted_at TEXT, \
            server_version TEXT NOT NULL, \
            buffered_at TEXT NOT NULL, \
            PRIMARY KEY (user_id, cloud_id) \
        )",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_pending_artifacts_user_version \
         ON cloud_sync_pending_artifacts(user_id, server_version)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_pending_artifacts_conversation \
         ON cloud_sync_pending_artifacts(user_id, conversation_cloud_id)",
        [],
    )?;
    // Backfill cloud artifacts linked while v73 was current. The source value
    // comes only from messages.cloud_id; the local INTEGER is never converted
    // to text or treated as a portable identity.
    if artifacts_exists && table_exists("messages") {
        conn.execute(
            "UPDATE artifacts \
             SET message_cloud_id = ( \
                 SELECT m.cloud_id FROM messages m \
                 WHERE m.id = artifacts.message_id \
                   AND m.conversation_id = CAST(artifacts.conversation_id AS INTEGER) \
             ), \
                 needs_push = CASE \
                     WHEN app_mode = 'cloud' THEN 1 \
                     ELSE needs_push \
                 END \
             WHERE app_mode = 'cloud' \
               AND message_id IS NOT NULL \
               AND message_cloud_id IS NULL \
               AND EXISTS ( \
                 SELECT 1 FROM messages m \
                 WHERE m.id = artifacts.message_id AND m.cloud_id IS NOT NULL \
                   AND m.conversation_id = CAST(artifacts.conversation_id AS INTEGER) \
               )",
            [],
        )?;
    }
    Ok(())
}

/// Migration v75: Add `project_id` to conversations for local project scoping
/// ("AGI Work"). DESKTOP-PROJECT-SCOPING-UNWIRED-01 seam A: TauriRuntime has
/// always sent `projectId` on conversation create, but there was no column to
/// persist it into. Nullable TEXT referencing `projects.id`; NULL = unscoped.
/// No FK constraint — `projects` rows are soft-deletable and a dangling scope
/// must degrade to "no project context", not block conversation reads.
fn apply_migration_v75(conn: &Connection) -> Result<()> {
    ensure_column(conn, "conversations", "project_id", "project_id TEXT")?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_conversations_project_id \
         ON conversations(project_id) WHERE project_id IS NOT NULL",
        [],
    )?;
    Ok(())
}

/// Migration v76: remove the retired employee data model.
///
/// Onboarding keeps reusable demo/session history, and ROI keeps
/// automation-oriented metrics. Existing local databases are rebuilt in place
/// so obsolete employee tables and columns do not remain as hidden product
/// concepts.
fn apply_migration_v76(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "DROP TABLE IF EXISTS employee_tasks;
         DROP TABLE IF EXISTS user_employees;
         DROP TABLE IF EXISTS ai_employees;",
    )?;

    if table_has_column(conn, "first_run_sessions", "recommended_employees")? {
        conn.execute_batch(
            "ALTER TABLE first_run_sessions RENAME TO first_run_sessions_legacy_v76;

             CREATE TABLE first_run_sessions (
                 id TEXT PRIMARY KEY,
                 user_id TEXT NOT NULL,
                 started_at INTEGER NOT NULL,
                 completed_at INTEGER,
                 step TEXT NOT NULL,
                 recommended_demos TEXT NOT NULL,
                 selected_demo_id TEXT,
                 demo_results TEXT,
                 time_to_value_seconds INTEGER NOT NULL DEFAULT 0,
                 updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
             );

             INSERT INTO first_run_sessions (
                 id, user_id, started_at, completed_at, step,
                 recommended_demos, selected_demo_id, demo_results,
                 time_to_value_seconds, updated_at
             )
             SELECT
                 id, user_id, started_at, completed_at, step,
                 recommended_employees, selected_employee_id, demo_results,
                 time_to_value_seconds, updated_at
             FROM first_run_sessions_legacy_v76;

             DROP TABLE first_run_sessions_legacy_v76;
             CREATE INDEX idx_first_run_user
                 ON first_run_sessions(user_id, started_at DESC);
             CREATE INDEX idx_first_run_completed
                 ON first_run_sessions(completed_at DESC)
                 WHERE completed_at IS NOT NULL;",
        )?;
    }

    if table_has_column(conn, "demo_runs", "employee_id")? {
        conn.execute_batch(
            "ALTER TABLE demo_runs RENAME TO demo_runs_legacy_v76;

             CREATE TABLE demo_runs (
                 id TEXT PRIMARY KEY,
                 user_id TEXT,
                 demo_id TEXT NOT NULL,
                 ran_at INTEGER NOT NULL,
                 results TEXT NOT NULL
             );

             INSERT INTO demo_runs (id, user_id, demo_id, ran_at, results)
             SELECT id, user_id, employee_id, ran_at, results
             FROM demo_runs_legacy_v76;

             DROP TABLE demo_runs_legacy_v76;
             CREATE INDEX idx_demo_runs_user
                 ON demo_runs(user_id, ran_at DESC)
                 WHERE user_id IS NOT NULL;
             CREATE INDEX idx_demo_runs_demo
                 ON demo_runs(demo_id, ran_at DESC);
             CREATE INDEX idx_demo_runs_time
                 ON demo_runs(ran_at DESC);",
        )?;
    }

    if table_has_column(conn, "realtime_metrics", "employee_id")? {
        conn.execute_batch(
            "ALTER TABLE realtime_metrics RENAME TO realtime_metrics_legacy_v76;

             CREATE TABLE realtime_metrics (
                 id TEXT PRIMARY KEY,
                 user_id TEXT NOT NULL,
                 automation_id TEXT,
                 automation_name TEXT,
                 time_saved_minutes INTEGER NOT NULL,
                 cost_saved_usd REAL NOT NULL,
                 tasks_completed INTEGER DEFAULT 1,
                 errors_prevented INTEGER DEFAULT 0,
                 quality_score REAL,
                 timestamp INTEGER NOT NULL
             );

             INSERT INTO realtime_metrics (
                 id, user_id, automation_id, automation_name,
                 time_saved_minutes, cost_saved_usd, tasks_completed,
                 errors_prevented, quality_score, timestamp
             )
             SELECT
                 id, user_id, automation_id, NULL,
                 time_saved_minutes, cost_saved_usd, tasks_completed,
                 errors_prevented, quality_score, timestamp
             FROM realtime_metrics_legacy_v76;

             DROP TABLE realtime_metrics_legacy_v76;
             CREATE INDEX idx_metrics_user_time
                 ON realtime_metrics(user_id, timestamp DESC);
             CREATE INDEX idx_metrics_automation
                 ON realtime_metrics(automation_id, timestamp DESC)
                 WHERE automation_id IS NOT NULL;
             CREATE INDEX idx_metrics_automation_name
                 ON realtime_metrics(automation_name, timestamp DESC)
                 WHERE automation_name IS NOT NULL;
             CREATE INDEX idx_metrics_timestamp
                 ON realtime_metrics(timestamp DESC);",
        )?;
    } else if table_exists(conn, "realtime_metrics")? {
        // IF NOT EXISTS guards only the index name, never the table. A database
        // that reached v58 without realtime_metrics (the baseline CREATE TABLE
        // runs only for fresh installs) must skip this index or the whole
        // migration chain aborts on "no such table".
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_metrics_automation_name
             ON realtime_metrics(automation_name, timestamp DESC)
             WHERE automation_name IS NOT NULL",
            [],
        )?;
    }

    Ok(())
}

/// Migration v77: fix the `user_memory.category` CHECK constraint.
///
/// v46 created the table with `CHECK(category IN ('Preference', 'Fact',
/// 'Decision', 'Context'))` — PascalCase. But `MemoryCategory::as_str`
/// (agiworkforce-agent-core) returns the lowercase canonical wire value
/// ("preference"/"fact"/"decision"/"context"), which `MemoryManager::remember`
/// writes. Every insert therefore failed the CHECK with
/// "CHECK constraint failed: category IN (...)", surfacing in Settings →
/// Memory as "Could not update memory" on every add/edit. SQLite cannot ALTER
/// a CHECK, so rebuild the table with a case-insensitive constraint and copy
/// existing rows, normalizing any legacy PascalCase categories to lowercase.
fn apply_migration_v77(conn: &Connection) -> Result<()> {
    // Guard: only rebuild if the table exists (fresh installs already get the
    // corrected shape below on first run of this migration).
    let table_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='user_memory'",
            [],
            |row| row.get::<_, i32>(0),
        )
        .map(|count| count > 0)
        .unwrap_or(false);

    if !table_exists {
        // Fresh install after this migration: create the corrected shape
        // directly (v46 will not have run on a DB created at >= v77).
        conn.execute(
            "CREATE TABLE user_memory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category TEXT NOT NULL CHECK(lower(category) IN ('preference', 'fact', 'decision', 'context')),
                topic TEXT NOT NULL,
                content TEXT NOT NULL,
                importance INTEGER NOT NULL DEFAULT 5 CHECK(importance >= 1 AND importance <= 10),
                source TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(category, topic)
            )",
            [],
        )?;
        return Ok(());
    }

    // Capture the live CREATE TABLE statement so the rebuild keeps every column
    // later migrations added (server_id, created_at_utc, needs_push, …) — they
    // used ALTER TABLE ADD COLUMN, which leaves the original CHECK clause
    // intact, so a text swap of just that clause is safe.
    let create_sql: String = conn.query_row(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='user_memory'",
        [],
        |row| row.get(0),
    )?;

    // Idempotent + restart-safe: if the PascalCase CHECK is already gone this
    // migration has effectively run; nothing to rebuild.
    if !create_sql.contains("'Preference'") {
        return Ok(());
    }

    // Preserve indexes: SQLite drops them with the table, and they are declared
    // in separate CREATE INDEX statements the RENAME does not restore.
    let index_sqls: Vec<String> = {
        let mut stmt = conn.prepare(
            "SELECT sql FROM sqlite_master
                 WHERE type='index' AND tbl_name='user_memory' AND sql IS NOT NULL",
        )?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        rows.filter_map(|r| r.ok()).collect()
    };

    // The full column list, so the copy keeps every column later migrations
    // added and can lowercase `category` in flight (the old CHECK forbids an
    // in-place UPDATE to lowercase, so normalization must happen during the
    // copy into the new, correctly-constrained table).
    let columns: Vec<String> = {
        let mut stmt = conn.prepare("PRAGMA table_info('user_memory')")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
        rows.filter_map(|r| r.ok()).collect()
    };
    let target_columns = columns.join(", ");
    let select_columns = columns
        .iter()
        .map(|col| {
            if col == "category" {
                "lower(category)".to_string()
            } else {
                col.clone()
            }
        })
        .collect::<Vec<_>>()
        .join(", ");

    let fixed_sql = create_sql
        .replace(
            "CHECK(category IN ('Preference', 'Fact', 'Decision', 'Context'))",
            "CHECK(lower(category) IN ('preference', 'fact', 'decision', 'context'))",
        )
        .replace("CREATE TABLE user_memory", "CREATE TABLE user_memory_v77");

    conn.execute_batch(&fixed_sql)?;
    conn.execute(
        &format!(
            "INSERT INTO user_memory_v77 ({target_columns}) SELECT {select_columns} FROM user_memory"
        ),
        [],
    )?;
    conn.execute_batch(
        "DROP TABLE user_memory;
         ALTER TABLE user_memory_v77 RENAME TO user_memory;",
    )?;
    for index_sql in index_sqls {
        // Indexes were auto-dropped with the old table; recreate them.
        conn.execute_batch(&index_sql)?;
    }

    Ok(())
}

/// Migration v78: durable storage for automation triggers. Before this the
/// trigger registry lived only in memory, so every cron schedule, webhook and
/// file watcher a user configured was gone on the next launch.
fn apply_migration_v78(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS automation_triggers (
            id TEXT PRIMARY KEY,
            payload TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    )?;
    Ok(())
}

/// Migration v79: re-wrap auth-session tokens that an older build encrypted and
/// indexed with the machine-only key.
///
/// The whole migration runs inside one savepoint, so a partial re-wrap can
/// never leave a session with a token index that no longer matches its
/// ciphertext. Rows already under the per-install key are left untouched, which
/// makes re-running the migration a no-op.
fn apply_migration_v79(conn: &Connection) -> Result<()> {
    use crate::sys::security::machine_key::{self, KeyPurpose};

    let table_exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='auth_sessions')",
        [],
        |row| row.get(0),
    )?;
    if !table_exists {
        return Ok(());
    }

    let rows: Vec<(String, String, String)> = conn
        .prepare(
            "SELECT session_id, access_token_encrypted, refresh_token_encrypted
             FROM auth_sessions",
        )?
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
        .collect::<Result<Vec<_>>>()?;

    // Deriving the legacy keys costs 600,000 PBKDF2 rounds per machine
    // identifier; a fresh install has nothing to rotate.
    if rows.is_empty() {
        return Ok(());
    }

    let current_key = match machine_key::try_derive_key(KeyPurpose::MasterEncryption) {
        Ok(key) => key,
        Err(error) => {
            // Startup fails closed before migrations when the per-install
            // secret is missing. Reaching here means some other entry point ran
            // migrations, so report the sessions as still machine-only wrapped
            // rather than destroying them.
            machine_key::record_machine_only_payload("auth_sessions");
            tracing::warn!("Skipping auth-session key rotation: {error}");
            return Ok(());
        }
    };

    let legacy_keys = machine_key::legacy_machine_only_keys(KeyPurpose::MasterEncryption);
    if legacy_keys.is_empty() {
        return Ok(());
    }

    let mut rewrapped = 0usize;
    for (session_id, access_stored, refresh_stored) in rows {
        let Some((access_token, refresh_token)) = legacy_keys.iter().find_map(|legacy| {
            let access = migration_decrypt_token_with(legacy, &access_stored)?;
            let refresh = migration_decrypt_token_with(legacy, &refresh_stored)?;
            Some((access, refresh))
        }) else {
            continue;
        };

        conn.execute(
            "UPDATE auth_sessions
             SET access_token_hash = ?1,
                 access_token_encrypted = ?2,
                 refresh_token_hash = ?3,
                 refresh_token_encrypted = ?4
             WHERE session_id = ?5",
            params![
                migration_hmac_token_with(&current_key, &access_token)?,
                migration_encrypt_token_with(&current_key, &access_token)?,
                migration_hmac_token_with(&current_key, &refresh_token)?,
                migration_encrypt_token_with(&current_key, &refresh_token)?,
                session_id,
            ],
        )?;
        rewrapped += 1;
    }

    if rewrapped > 0 {
        tracing::info!(
            "Migration v79: re-wrapped {rewrapped} auth session(s) under the per-install key"
        );
    }

    Ok(())
}

/// Migration v80: re-wrap MCP credentials and OAuth tokens an older build
/// encrypted with the machine-only key.
///
/// `settings_v2` holds every secret written through `core::mcp::config` and
/// `sys::commands::mcp_oauth`, and those readers derive one key and decrypt
/// with it directly. Without this pass the rotated key would leave every stored
/// token unreadable and overwritten on the next save. AES-GCM authentication
/// decides which rows belong to this purpose, so rows other consumers of the
/// table wrote — settings under the database key above all — are never touched.
fn apply_migration_v80(conn: &Connection) -> Result<()> {
    use crate::sys::security::machine_key::{self, KeyPurpose};
    use crate::sys::security::machine_key_rewrap;

    let table_exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='settings_v2')",
        [],
        |row| row.get(0),
    )?;
    if !table_exists {
        return Ok(());
    }

    let mut rows: Vec<(String, String)> = conn
        .prepare("SELECT key, value FROM settings_v2 WHERE typeof(value) = 'text' AND value <> ''")?
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<Result<Vec<_>>>()?;

    // Deriving the legacy keys costs 600,000 PBKDF2 rounds per machine
    // identifier; a row that cannot hold this framing must never pay for it.
    rows.retain(|(_, value)| machine_key_rewrap::looks_like_combined_payload(value));
    if rows.is_empty() {
        return Ok(());
    }

    if !machine_key::has_install_secret() {
        // Startup fails closed before migrations when the per-install secret is
        // missing. Reaching here means some other entry point ran migrations,
        // so report the credentials as still machine-only wrapped rather than
        // rewriting them under an ephemeral key nothing can read back.
        machine_key::record_machine_only_payload("settings_v2:mcp_credentials");
        tracing::warn!("Skipping MCP credential key rotation: no per-install secret is available");
        return Ok(());
    }

    let mut rewrapped = 0usize;
    for (key, value) in rows {
        let label = format!("settings_v2:{key}");
        let Ok(Some(rotated)) =
            machine_key_rewrap::rewrap_value(KeyPurpose::McpCredentials, &label, &value)
        else {
            continue;
        };

        conn.execute(
            "UPDATE settings_v2 SET value = ?1 WHERE key = ?2",
            params![rotated, key],
        )?;
        machine_key::clear_machine_only_payload(&label);
        rewrapped += 1;
    }

    if rewrapped > 0 {
        tracing::info!(
            "Migration v80: re-wrapped {rewrapped} MCP credential(s) under the per-install key"
        );
    }

    Ok(())
}

/// Columns holding a JSON [`EncryptedSecret`] an older build wrapped with the
/// machine-only key. Table and column names are compile-time constants, so the
/// statements built from them below carry no caller-supplied SQL.
const MACHINE_ONLY_SECRET_COLUMNS: [(&str, &str, machine_key::KeyPurpose); 5] = [
    (
        "email_accounts",
        "password_encrypted",
        machine_key::KeyPurpose::EmailCredentials,
    ),
    (
        "gmail_accounts",
        "token_encrypted",
        machine_key::KeyPurpose::EmailCredentials,
    ),
    (
        "gmail_accounts",
        "client_secret_encrypted",
        machine_key::KeyPurpose::EmailCredentials,
    ),
    (
        "calendar_accounts",
        "token_json",
        machine_key::KeyPurpose::CalendarCredentials,
    ),
    (
        "settings",
        "value",
        machine_key::KeyPurpose::DatabaseEncryption,
    ),
];

/// Migration v81: re-wrap the email, Gmail, calendar, and generic app secrets
/// an older build encrypted with the machine-only key.
///
/// Those readers already fall back to the legacy key, so nothing is unreadable
/// without this pass — but until each row is rewritten it stays decryptable by
/// any unprivileged local process, which is exactly what F5 reported. Rewriting
/// them on read alone would leave a credential the user never touches again
/// exposed forever.
fn apply_migration_v81(conn: &Connection) -> Result<()> {
    if !machine_key::has_install_secret() {
        machine_key::record_machine_only_payload("stored_account_credentials");
        tracing::warn!("Skipping account credential key rotation: no per-install secret available");
        return Ok(());
    }

    let mut rewrapped = 0usize;
    for (table, column, purpose) in MACHINE_ONLY_SECRET_COLUMNS {
        rewrapped += rewrap_machine_only_column(conn, table, column, purpose)?;
    }

    if rewrapped > 0 {
        tracing::info!(
            "Migration v81: re-wrapped {rewrapped} stored credential(s) under the per-install key"
        );
    }

    Ok(())
}

fn rewrap_machine_only_column(
    conn: &Connection,
    table: &str,
    column: &str,
    purpose: machine_key::KeyPurpose,
) -> Result<usize> {
    use crate::sys::security::encryption::{decrypt_secret_with_key, EncryptedSecret};

    let table_exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?1)",
        params![table],
        |row| row.get(0),
    )?;
    if !table_exists {
        return Ok(0);
    }

    let column_exists: i64 = conn.query_row(
        &format!("SELECT COUNT(*) FROM pragma_table_info('{table}') WHERE name = ?1"),
        params![column],
        |row| row.get(0),
    )?;
    if column_exists == 0 {
        return Ok(0);
    }

    // The JSON prefix keeps plaintext and legacy base64 columns from reaching
    // the 600,000-round legacy derivation below.
    let rows: Vec<(i64, String)> = conn
        .prepare(&format!(
            "SELECT rowid, {column} FROM {table} \
             WHERE typeof({column}) = 'text' AND {column} LIKE '{{%'"
        ))?
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<Result<Vec<_>>>()?;
    if rows.is_empty() {
        return Ok(0);
    }

    let current_key = match machine_key::try_derive_key(purpose) {
        Ok(key) => key,
        Err(error) => {
            machine_key::record_machine_only_payload(table);
            tracing::warn!("Skipping {table}.{column} key rotation: {error}");
            return Ok(0);
        }
    };

    let mut rewrapped = 0usize;
    for (rowid, stored) in rows {
        let Ok(encrypted) = serde_json::from_str::<EncryptedSecret>(&stored) else {
            continue;
        };

        let label = format!("{table}.{column}#{rowid}");
        let opened = machine_key::open_with_key_rotation(purpose, &label, |key| {
            decrypt_secret_with_key(key, &encrypted).ok()
        });
        let Ok(Some(opened)) = opened else {
            continue;
        };
        if !opened.rewrap_required {
            continue;
        }

        conn.execute(
            &format!("UPDATE {table} SET {column} = ?1 WHERE rowid = ?2"),
            params![
                migration_encrypt_token_with(&current_key, &opened.value)?,
                rowid
            ],
        )?;
        machine_key::clear_machine_only_payload(&label);
        rewrapped += 1;
    }

    Ok(rewrapped)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::{params, Connection};

    #[test]
    fn test_migrations() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let tables: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<Vec<_>>>()
            .unwrap();

        assert!(tables.contains(&"conversations".to_string()));
        assert!(tables.contains(&"messages".to_string()));
        assert!(tables.contains(&"settings".to_string()));
        assert!(tables.contains(&"settings_v2".to_string()));
        assert!(tables.contains(&"automation_history".to_string()));
        assert!(tables.contains(&"overlay_events".to_string()));
        assert!(tables.contains(&"captures".to_string()));
        assert!(tables.contains(&"ocr_results".to_string()));
        assert!(tables.contains(&"permissions".to_string()));
        assert!(tables.contains(&"audit_log".to_string()));
        assert!(tables.contains(&"command_history".to_string()));
        assert!(tables.contains(&"clipboard_history".to_string()));
        assert!(tables.contains(&"schema_version".to_string()));
        assert!(tables.contains(&"cache_entries".to_string()));
        assert!(tables.contains(&"calendar_accounts".to_string()));
        assert!(!tables.contains(&"ai_employees".to_string()));
        assert!(!tables.contains(&"user_employees".to_string()));
        assert!(!tables.contains(&"employee_tasks".to_string()));
    }

    #[test]
    fn migration_v75_adds_conversations_project_id_and_persists_it() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let has_column: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM pragma_table_info('conversations') WHERE name = 'project_id'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(has_column, "v75 must add conversations.project_id");

        conn.execute(
            "INSERT INTO conversations (title, user_id, project_id) VALUES
             ('scoped', 'u1', 'proj-123'), ('unscoped', 'u1', NULL)",
            [],
        )
        .unwrap();
        let scoped: Option<String> = conn
            .query_row(
                "SELECT project_id FROM conversations WHERE title = 'scoped'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let unscoped: Option<String> = conn
            .query_row(
                "SELECT project_id FROM conversations WHERE title = 'unscoped'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(scoped.as_deref(), Some("proj-123"));
        assert_eq!(unscoped, None);

        // Re-running migrations on an already-migrated db must be a no-op.
        run_migrations(&conn).unwrap();
    }

    #[test]
    fn migration_v76_removes_employee_model_and_preserves_demo_metrics() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE ai_employees (id TEXT PRIMARY KEY);
             CREATE TABLE user_employees (id TEXT PRIMARY KEY);
             CREATE TABLE employee_tasks (id TEXT PRIMARY KEY);

             CREATE TABLE first_run_sessions (
                 id TEXT PRIMARY KEY,
                 user_id TEXT NOT NULL,
                 started_at INTEGER NOT NULL,
                 completed_at INTEGER,
                 step TEXT NOT NULL,
                 recommended_employees TEXT NOT NULL,
                 selected_employee_id TEXT,
                 demo_results TEXT,
                 time_to_value_seconds INTEGER NOT NULL DEFAULT 0,
                 legacy_state INTEGER NOT NULL DEFAULT 0,
                 updated_at INTEGER NOT NULL
             );
             INSERT INTO first_run_sessions VALUES
                 ('s1', 'u1', 10, 20, '\"completed\"', '[]', 'demo-1', '{}', 10, 1, 20);

             CREATE TABLE demo_runs (
                 id TEXT PRIMARY KEY,
                 user_id TEXT,
                 employee_id TEXT NOT NULL,
                 ran_at INTEGER NOT NULL,
                 results TEXT NOT NULL,
                 legacy_outcome INTEGER NOT NULL DEFAULT 0
             );
             INSERT INTO demo_runs VALUES ('r1', 'u1', 'demo-1', 11, '{}', 1);

             CREATE TABLE realtime_metrics (
                 id TEXT PRIMARY KEY,
                 user_id TEXT NOT NULL,
                 automation_id TEXT,
                 employee_id TEXT,
                 time_saved_minutes INTEGER NOT NULL,
                 cost_saved_usd REAL NOT NULL,
                 tasks_completed INTEGER DEFAULT 1,
                 errors_prevented INTEGER DEFAULT 0,
                 quality_score REAL,
                 timestamp INTEGER NOT NULL
             );
             INSERT INTO realtime_metrics VALUES
                 ('m1', 'u1', 'run-1', 'retired-value', 5, 4.0, 1, 0, 1.0, 12);",
        )
        .unwrap();

        apply_migration_v76(&conn).unwrap();

        for table in ["ai_employees", "user_employees", "employee_tasks"] {
            let exists: bool = conn
                .query_row(
                    "SELECT EXISTS(
                         SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1
                     )",
                    [table],
                    |row| row.get(0),
                )
                .unwrap();
            assert!(!exists, "{table} must be removed");
        }

        let selected_demo: String = conn
            .query_row(
                "SELECT selected_demo_id FROM first_run_sessions WHERE id = 's1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(selected_demo, "demo-1");
        assert!(!table_has_column(&conn, "first_run_sessions", "legacy_state").unwrap());

        let demo_id: String = conn
            .query_row("SELECT demo_id FROM demo_runs WHERE id = 'r1'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(demo_id, "demo-1");
        assert!(!table_has_column(&conn, "demo_runs", "legacy_outcome").unwrap());

        let automation_name: Option<String> = conn
            .query_row(
                "SELECT automation_name FROM realtime_metrics WHERE id = 'm1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(automation_name, None);
        assert!(!table_has_column(&conn, "realtime_metrics", "employee_id").unwrap());

        apply_migration_v76(&conn).expect("v76 must remain restart-safe");
    }

    #[test]
    fn migration_v77_allows_lowercase_memory_categories() {
        let conn = Connection::open_in_memory().unwrap();
        // Reproduce the shipped v46 table with the PascalCase CHECK plus one of
        // the indexes and a legacy PascalCase row.
        conn.execute_batch(
            "CREATE TABLE user_memory (
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 category TEXT NOT NULL CHECK(category IN ('Preference', 'Fact', 'Decision', 'Context')),
                 topic TEXT NOT NULL,
                 content TEXT NOT NULL,
                 importance INTEGER NOT NULL DEFAULT 5 CHECK(importance >= 1 AND importance <= 10),
                 source TEXT,
                 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                 UNIQUE(category, topic)
             );
             CREATE INDEX idx_user_memory_category ON user_memory(category);
             INSERT INTO user_memory (category, topic, content) VALUES ('Fact', 'legacy', 'kept');",
        )
        .unwrap();

        // Before: the lowercase value MemoryManager::remember writes is rejected.
        let pre = conn.execute(
            "INSERT INTO user_memory (category, topic, content) VALUES ('fact', 't1', 'c1')",
            [],
        );
        assert!(
            pre.is_err(),
            "PascalCase CHECK must reject lowercase before v77"
        );

        apply_migration_v77(&conn).unwrap();

        // After: the lowercase canonical value inserts cleanly.
        conn.execute(
            "INSERT INTO user_memory (category, topic, content) VALUES ('fact', 't1', 'c1')",
            [],
        )
        .expect("lowercase category must insert after v77");

        // The legacy PascalCase row was normalized, not lost.
        let legacy: String = conn
            .query_row(
                "SELECT category FROM user_memory WHERE topic = 'legacy'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(legacy, "fact");

        // The index survived the table rebuild.
        let index_exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_user_memory_category')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(index_exists, "indexes must be recreated after the rebuild");

        // Restart-safe / idempotent.
        apply_migration_v77(&conn).expect("v77 must remain restart-safe");
    }

    #[test]
    fn migration_v72_backfills_explicit_execution_boundaries() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT,
                user_id TEXT,
                app_mode TEXT NOT NULL DEFAULT 'local'
            )",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO conversations (title, user_id, app_mode) VALUES
             ('private', 'u1', 'local'), ('synced', 'u1', 'cloud')",
            [],
        )
        .unwrap();

        apply_migration_v72(&conn).unwrap();

        let local: String = conn
            .query_row(
                "SELECT execution_mode FROM conversations WHERE title = 'private'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let cloud: String = conn
            .query_row(
                "SELECT execution_mode FROM conversations WHERE title = 'synced'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(local, "local_only");
        assert_eq!(cloud, "cloud_managed");
    }

    #[test]
    fn artifact_rows_have_a_durable_message_owner() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let has_message_id: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM pragma_table_info('artifacts') WHERE name = 'message_id'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(
            has_message_id,
            "artifacts.message_id is required to restore artifacts onto their source message"
        );

        let has_message_cloud_id: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM pragma_table_info('artifacts') \
                 WHERE name = 'message_cloud_id'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(
            has_message_cloud_id,
            "artifacts.message_cloud_id is required to restore cloud artifacts across devices"
        );
        let pending_table_exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master \
                 WHERE type = 'table' AND name = 'cloud_sync_pending_artifacts')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(
            pending_table_exists,
            "parentless artifact deltas require a durable cross-page replay journal"
        );
    }

    #[test]
    fn migration_v74_backfills_only_cloud_artifacts_from_message_cloud_ids() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE messages ( \
                id INTEGER PRIMARY KEY, conversation_id INTEGER NOT NULL, cloud_id TEXT \
             )",
            [],
        )
        .unwrap();
        conn.execute(
            "CREATE TABLE artifacts ( \
                id TEXT PRIMARY KEY, conversation_id TEXT, message_id INTEGER, \
                app_mode TEXT NOT NULL DEFAULT 'local', needs_push INTEGER NOT NULL DEFAULT 0 \
             )",
            [],
        )
        .unwrap();
        let cloud_message_id = "019b7ba6-6d81-7000-8000-000000000020";
        conn.execute(
            "INSERT INTO messages (id, conversation_id, cloud_id) VALUES (10, 7, ?1)",
            params![cloud_message_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO artifacts (id, conversation_id, message_id, app_mode) VALUES \
             ('cloud-artifact', '7', 10, 'cloud'), \
             ('local-artifact', '7', 10, 'local'), \
             ('wrong-conversation', '8', 10, 'cloud')",
            [],
        )
        .unwrap();

        apply_migration_v74(&conn).unwrap();
        apply_migration_v74(&conn).expect("v74 must remain restart/idempotency safe");

        let cloud: (Option<String>, i64) = conn
            .query_row(
                "SELECT message_cloud_id, needs_push FROM artifacts WHERE id = 'cloud-artifact'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(cloud.0.as_deref(), Some(cloud_message_id));
        assert_eq!(cloud.1, 1);
        let local: (Option<String>, i64) = conn
            .query_row(
                "SELECT message_cloud_id, needs_push FROM artifacts WHERE id = 'local-artifact'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(local, (None, 0));
        let wrong_conversation: Option<String> = conn
            .query_row(
                "SELECT message_cloud_id FROM artifacts WHERE id = 'wrong-conversation'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(wrong_conversation, None);
    }

    #[test]
    fn test_foreign_keys_enabled() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let fk_enabled: i32 = conn
            .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
            .unwrap();

        assert_eq!(fk_enabled, 1);
    }

    /// The real-world v67 path is an UPGRADE of an existing v66 install with live
    /// data. Build the v66-shape conversations/messages (INTEGER PK, app_mode, NO
    /// cloud sync columns), populate them, then apply v67 and assert: existing rows
    /// survive, the new columns + buffer table appear, and the INTEGER PK is intact.
    #[test]
    fn migration_v67_upgrades_populated_v66_tables_without_data_loss() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("PRAGMA foreign_keys = ON", []).unwrap();
        conn.execute(
            "CREATE TABLE conversations (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, \
             user_id TEXT, app_mode TEXT NOT NULL DEFAULT 'local')",
            [],
        )
        .unwrap();
        conn.execute(
            "CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, \
             conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE, \
             user_id TEXT, role TEXT, content TEXT)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO conversations (title, user_id, app_mode) VALUES ('Existing','u1','cloud')",
            [],
        )
        .unwrap();
        let conv_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO messages (conversation_id, user_id, role, content) VALUES (?1,'u1','user','hi')",
            params![conv_id],
        )
        .unwrap();

        // Apply v67 to the POPULATED v66 schema.
        apply_migration_v67(&conn).expect("v67 must apply cleanly to a populated v66 schema");

        // Existing data survived intact.
        let title: String = conn
            .query_row(
                "SELECT title FROM conversations WHERE id=?1",
                params![conv_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(title, "Existing");
        let msg_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM messages WHERE conversation_id=?1",
                params![conv_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(msg_count, 1);

        // New columns + buffer table exist; INTEGER PK is unchanged.
        let has_cloud_id: bool = conn
            .query_row(
                "SELECT COUNT(*)>0 FROM pragma_table_info('conversations') WHERE name='cloud_id'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(has_cloud_id, "v67 must add cloud_id to a populated table");
        let pk_type: String = conn
            .query_row(
                "SELECT type FROM pragma_table_info('conversations') WHERE pk=1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(pk_type, "INTEGER", "INTEGER PK must survive the upgrade");
        let has_buffer: bool = conn
            .query_row(
                "SELECT COUNT(*)>0 FROM sqlite_master WHERE type='table' AND name='cloud_sync_pending_messages'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(has_buffer, "v67 must create the orphan buffer table");
    }

    /// FIX-047: verify run_migrations is idempotent. The current_version
    /// guard means the second call should be a no-op (no errors, no
    /// duplicate schema_version rows for a single version, schema still
    /// at CURRENT_VERSION).
    #[test]
    fn test_migrations_idempotent() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).expect("first run_migrations should succeed");

        let version_after_first: i32 = conn
            .query_row(
                "SELECT COALESCE(MAX(version), 0) FROM schema_version",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            version_after_first, CURRENT_VERSION,
            "after first run, schema_version should equal CURRENT_VERSION"
        );

        run_migrations(&conn).expect("second run_migrations should succeed");

        let version_after_second: i32 = conn
            .query_row(
                "SELECT COALESCE(MAX(version), 0) FROM schema_version",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            version_after_second, CURRENT_VERSION,
            "after second run, schema_version still equals CURRENT_VERSION"
        );

        // No version should appear twice in schema_version after re-run.
        let dup_count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM (
                     SELECT version FROM schema_version GROUP BY version HAVING COUNT(*) > 1
                 )",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(dup_count, 0, "no version should be applied twice");
    }

    /// FIX-047: verify schema_version table records every migration that
    /// ran. After run_migrations on a fresh DB we should see 1..=CURRENT_VERSION.
    #[test]
    fn test_schema_version_records_every_migration() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let recorded: Vec<i32> = conn
            .prepare("SELECT version FROM schema_version ORDER BY version ASC")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<Vec<_>>>()
            .unwrap();

        let expected: Vec<i32> = (1..=CURRENT_VERSION).collect();
        assert_eq!(
            recorded, expected,
            "schema_version should contain exactly 1..=CURRENT_VERSION after fresh migration"
        );
    }

    /// FIX-047: smoke-test the most critical tables produced by the
    /// migration chain — conversations, messages, settings — by doing a
    /// minimal INSERT then SELECT round-trip. Catches "table exists but
    /// is the wrong shape" regressions where a later migration drops or
    /// renames a column the runtime still depends on.
    #[test]
    fn test_critical_tables_round_trip() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        // conversations
        conn.execute(
            "INSERT INTO conversations (id, user_id, title, created_at, updated_at)
             VALUES (1, 'user-test', 'hello', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        )
        .expect("insert into conversations should succeed");

        let title: String = conn
            .query_row("SELECT title FROM conversations WHERE id = 1", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(title, "hello");

        // messages — needs to FK against the conversation just inserted
        conn.execute(
            "INSERT INTO messages (id, conversation_id, role, content, created_at)
             VALUES (1, 1, 'user', 'ping', '2026-01-01T00:00:00Z')",
            [],
        )
        .expect("insert into messages should succeed");

        let role: String = conn
            .query_row("SELECT role FROM messages WHERE id = 1", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(role, "user");

        // settings_v2 — categorized KV table used by the runtime to read user prefs
        conn.execute(
            "INSERT INTO settings_v2 (key, value, category, created_at, updated_at)
             VALUES ('test_key', 'test_value', 'ui', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        )
        .expect("insert into settings_v2 should succeed");

        let value: String = conn
            .query_row(
                "SELECT value FROM settings_v2 WHERE key = 'test_key'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(value, "test_value");
    }

    #[test]
    fn test_migration_v59_rebuilds_and_redacts_auth_sessions() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("PRAGMA foreign_keys = ON", []).unwrap();

        conn.execute(
            "CREATE TABLE schema_version (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )
        .unwrap();
        conn.execute("INSERT INTO schema_version (version) VALUES (58)", [])
            .unwrap();

        conn.execute(
            "CREATE TABLE users (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL,
                created_at TEXT NOT NULL,
                last_login_at TEXT,
                failed_login_attempts INTEGER NOT NULL DEFAULT 0,
                locked_until TEXT,
                email_verified INTEGER NOT NULL DEFAULT 0
            )",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params!["user-1", "legacy@example.com", "pw", "editor", "2026-01-01T00:00:00Z"],
        )
        .unwrap();

        // Stub conversations table required by migration v61 (adds `archived` column)
        conn.execute(
            "CREATE TABLE conversations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )",
            [],
        )
        .unwrap();
        conn.execute(
            "CREATE TABLE projects (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                custom_instructions TEXT NOT NULL DEFAULT '',
                files TEXT NOT NULL DEFAULT '[]',
                conversation_ids TEXT NOT NULL DEFAULT '[]',
                color TEXT,
                icon TEXT,
                is_archived INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )
        .unwrap();

        conn.execute(
            "CREATE TABLE auth_sessions (
                session_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                access_token TEXT NOT NULL UNIQUE,
                refresh_token TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                last_activity_at TEXT NOT NULL,
                ip_address TEXT,
                user_agent TEXT,
                access_token_hash TEXT,
                access_token_encrypted TEXT,
                refresh_token_hash TEXT,
                refresh_token_encrypted TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO auth_sessions (
                session_id, user_id, access_token, refresh_token,
                created_at, expires_at, last_activity_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                "legacy-session",
                "user-1",
                "legacy-access-token",
                "legacy-refresh-token",
                "2026-01-01T00:00:00Z",
                "2026-01-02T00:00:00Z",
                "2026-01-01T00:00:00Z",
            ],
        )
        .unwrap();

        run_migrations(&conn).unwrap();

        let row = conn
            .query_row(
                "SELECT access_token, refresh_token, access_token_hash, access_token_encrypted,
                 refresh_token_hash, refresh_token_encrypted
                 FROM auth_sessions WHERE session_id = ?1",
                ["legacy-session"],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, String>(5)?,
                    ))
                },
            )
            .unwrap();

        assert_eq!(row.0, REDACTED_TOKEN_SENTINEL);
        assert_eq!(row.1, REDACTED_TOKEN_SENTINEL);
        assert!(!row.2.is_empty());
        assert!(!row.3.is_empty());
        assert!(!row.4.is_empty());
        assert!(!row.5.is_empty());

        conn.execute(
            "INSERT INTO auth_sessions (
                session_id, user_id, access_token, refresh_token,
                access_token_hash, access_token_encrypted, refresh_token_hash, refresh_token_encrypted,
                created_at, expires_at, last_activity_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                "new-session",
                "user-1",
                REDACTED_TOKEN_SENTINEL,
                REDACTED_TOKEN_SENTINEL,
                "hash-2",
                "enc-2",
                "refresh-hash-2",
                "refresh-enc-2",
                "2026-01-01T00:00:00Z",
                "2026-01-02T00:00:00Z",
                "2026-01-01T00:00:00Z",
            ],
        )
        .unwrap();
    }

    #[test]
    fn test_migration_v59_skips_duplicate_hashed_tokens() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("PRAGMA foreign_keys = ON", []).unwrap();

        conn.execute(
            "CREATE TABLE schema_version (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )
        .unwrap();
        conn.execute("INSERT INTO schema_version (version) VALUES (58)", [])
            .unwrap();

        conn.execute(
            "CREATE TABLE users (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL,
                created_at TEXT NOT NULL,
                last_login_at TEXT,
                failed_login_attempts INTEGER NOT NULL DEFAULT 0,
                locked_until TEXT,
                email_verified INTEGER NOT NULL DEFAULT 0
            )",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params!["user-1", "duplicate@example.com", "pw", "editor", "2026-01-01T00:00:00Z"],
        )
        .unwrap();

        // Stub conversations table required by migration v61 (adds `archived` column)
        conn.execute(
            "CREATE TABLE conversations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )",
            [],
        )
        .unwrap();
        conn.execute(
            "CREATE TABLE projects (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                custom_instructions TEXT NOT NULL DEFAULT '',
                files TEXT NOT NULL DEFAULT '[]',
                conversation_ids TEXT NOT NULL DEFAULT '[]',
                color TEXT,
                icon TEXT,
                is_archived INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )
        .unwrap();

        conn.execute(
            "CREATE TABLE auth_sessions (
                session_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                access_token TEXT NOT NULL UNIQUE,
                refresh_token TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                last_activity_at TEXT NOT NULL,
                ip_address TEXT,
                user_agent TEXT,
                access_token_hash TEXT,
                access_token_encrypted TEXT,
                refresh_token_hash TEXT,
                refresh_token_encrypted TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )",
            [],
        )
        .unwrap();

        for session_id in ["session-a", "session-b"] {
            conn.execute(
                "INSERT INTO auth_sessions (
                    session_id, user_id, access_token, refresh_token,
                    created_at, expires_at, last_activity_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    session_id,
                    "user-1",
                    format!("shared-access-{session_id}"),
                    format!("shared-refresh-{session_id}"),
                    "2026-01-01T00:00:00Z",
                    "2026-01-02T00:00:00Z",
                    "2026-01-01T00:00:00Z",
                ],
            )
            .unwrap();
        }

        let duplicate_hash = migration_hmac_token("shared-token").unwrap();
        let duplicate_encrypted = migration_encrypt_token("shared-token").unwrap();
        conn.execute(
            "UPDATE auth_sessions
             SET access_token_hash = ?1,
                 access_token_encrypted = ?2,
                 refresh_token_hash = ?1,
                 refresh_token_encrypted = ?2",
            params![duplicate_hash, duplicate_encrypted],
        )
        .unwrap();

        run_migrations(&conn).unwrap();

        let row_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM auth_sessions", [], |row| row.get(0))
            .unwrap();
        assert_eq!(row_count, 1);
    }

    /// FIX-F6 (audit 2026-05-19): pin the behaviour of migration v63 — it
    /// must (a) add the `never_remember` column to `remembered_tool_choices`
    /// and (b) DELETE any pre-existing row whose `tool_name` is on the
    /// never-rememberable list. The fixture seeds rows that would represent
    /// a live one-click LITL bypass on every startup if not purged.
    #[test]
    fn migration_v63_purges_dangerous_remembered_choices() {
        let conn = Connection::open_in_memory().unwrap();
        // Bring the DB to v62 schema by running migrations up to that point.
        run_migrations(&conn).unwrap();

        // Seed rows that represent a vulnerable historical state.
        let dangerous_rows = [
            ("execute_code", 1),
            ("set_auto_approve_all", 1),
            ("set_agent_mode:autopilot", 1),
            ("file_write", 1),
            ("file_open_with_default_app", 1),
            ("playwright_evaluate", 1),
        ];
        // Insert safe rows too so we know v63 only deletes the dangerous ones.
        let safe_rows = [("file_read", 1), ("browser_get_url", 1), ("git_status", 1)];

        // Re-run insertions after the migrations completed: v63 has already
        // executed once at this point, so this represents "user runs a
        // legacy binary in parallel before upgrade" - we want to verify
        // re-running migrations after such inserts cleans them up.
        for (name, approved) in dangerous_rows.iter().chain(safe_rows.iter()) {
            conn.execute(
                "INSERT OR REPLACE INTO remembered_tool_choices (tool_name, approved, updated_at) \
                 VALUES (?1, ?2, '2026-05-19T00:00:00Z')",
                params![*name, *approved],
            )
            .unwrap();
        }
        // Verify all rows are present pre-purge.
        let pre_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM remembered_tool_choices", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(pre_count, 9);

        // Re-apply v63 directly (simulates a startup-time re-run).
        apply_migration_v63(&conn).unwrap();

        // Each dangerous row must be gone.
        for (name, _) in dangerous_rows.iter() {
            let cnt: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM remembered_tool_choices WHERE tool_name = ?1",
                    params![*name],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(
                cnt, 0,
                "v63 should have purged remembered_tool_choices.{}",
                name
            );
        }
        // Safe rows must remain.
        for (name, _) in safe_rows.iter() {
            let cnt: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM remembered_tool_choices WHERE tool_name = ?1",
                    params![*name],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(
                cnt, 1,
                "v63 must not touch safe remembered_tool_choices.{}",
                name
            );
        }

        // And the never_remember column must exist.
        let column_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('remembered_tool_choices') \
                 WHERE name = 'never_remember'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(column_count, 1);
    }

    /// F12: sessions an older build indexed and encrypted with the machine-only
    /// key must be re-wrapped under the per-install key, and the rewrite must
    /// keep the token index consistent with the ciphertext.
    #[test]
    fn v79_rewraps_machine_only_auth_sessions() {
        use crate::sys::security::machine_key::{self, KeyPurpose};

        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let legacy_key = machine_key::legacy_machine_only_keys(KeyPurpose::MasterEncryption)
            .first()
            .copied()
            .expect("a legacy candidate always exists");
        let access = "legacy-access-token";
        let refresh = "legacy-refresh-token";

        conn.execute(
            "INSERT INTO users (id, email, password_hash, role, created_at)              VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                "user-79",
                "legacy@example.com",
                "pw",
                "editor",
                "2026-01-01T00:00:00Z"
            ],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO auth_sessions (
                session_id, user_id, access_token_hash, access_token_encrypted,
                refresh_token_hash, refresh_token_encrypted,
                created_at, expires_at, last_activity_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, ?7)",
            params![
                "session-79",
                "user-79",
                migration_hmac_token_with(&legacy_key, access).unwrap(),
                migration_encrypt_token_with(&legacy_key, access).unwrap(),
                migration_hmac_token_with(&legacy_key, refresh).unwrap(),
                migration_encrypt_token_with(&legacy_key, refresh).unwrap(),
                "2026-01-01T00:00:00Z"
            ],
        )
        .unwrap();

        apply_migration_v79(&conn).expect("v79 must rotate machine-only sessions");

        let current_key = machine_key::try_derive_key(KeyPurpose::MasterEncryption)
            .expect("install secret in tests");
        let (access_hash, access_blob, refresh_blob): (String, String, String) = conn
            .query_row(
                "SELECT access_token_hash, access_token_encrypted, refresh_token_encrypted                  FROM auth_sessions WHERE session_id = ?1",
                params!["session-79"],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();

        assert_eq!(
            access_hash,
            migration_hmac_token_with(&current_key, access).unwrap(),
            "the token index must be recomputed with the per-install key"
        );
        assert_eq!(
            migration_decrypt_token_with(&current_key, &access_blob),
            Some(access.to_string())
        );
        assert_eq!(
            migration_decrypt_token_with(&current_key, &refresh_blob),
            Some(refresh.to_string())
        );
        assert_eq!(
            migration_decrypt_token_with(&legacy_key, &access_blob),
            None,
            "the machine-only key must no longer open the stored token"
        );

        // Re-running the migration must leave the already-rotated row alone.
        apply_migration_v79(&conn).expect("v79 must be idempotent");
        let unchanged: String = conn
            .query_row(
                "SELECT access_token_hash FROM auth_sessions WHERE session_id = ?1",
                params!["session-79"],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(unchanged, access_hash);
    }

    /// F5/F12 migration: MCP OAuth tokens and credentials that an older build
    /// wrapped with the machine_key machine-only derivation must survive the
    /// key rotation. Their readers derive one key and decrypt with it directly,
    /// so a row left behind is unreadable and overwritten on the next save.
    #[test]
    fn v80_rewraps_machine_key_only_mcp_credentials() {
        use crate::sys::security::machine_key::{self, KeyPurpose};
        use crate::sys::security::machine_key_rewrap::{decrypt_combined, encrypt_combined};

        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let legacy_key = machine_key::legacy_machine_only_keys(KeyPurpose::McpCredentials)
            .first()
            .copied()
            .expect("a legacy candidate always exists");
        let current_key =
            machine_key::try_derive_key(KeyPurpose::McpCredentials).expect("install secret");
        let settings_key =
            machine_key::try_derive_key(KeyPurpose::DatabaseEncryption).expect("install secret");

        let insert = |key: &str, value: &str| {
            conn.execute(
                "INSERT OR REPLACE INTO settings_v2
                     (key, value, category, encrypted, created_at, updated_at)
                 VALUES (?1, ?2, 'security', 1, ?3, ?3)",
                params![key, value, "2026-01-01T00:00:00Z"],
            )
            .unwrap();
        };
        let read = |key: &str| -> String {
            conn.query_row(
                "SELECT value FROM settings_v2 WHERE key = ?1",
                params![key],
                |row| row.get(0),
            )
            .unwrap()
        };

        let token = encrypt_combined(&legacy_key, "legacy-mcp-access-token").unwrap();
        let wrapped = encrypt_combined(&legacy_key, "legacy-vercel-secret").unwrap();
        let foreign = encrypt_combined(&settings_key, "an unrelated setting").unwrap();
        insert("mcp_oauth_vercel_access_token", &token);
        insert(
            "mcp_oauth_config_vercel_client_secret",
            &format!("<enc:{wrapped}>"),
        );
        insert("some_other_setting", &foreign);

        apply_migration_v80(&conn).expect("v80 must rotate machine-only MCP credentials");

        let rotated_token = read("mcp_oauth_vercel_access_token");
        assert_eq!(
            decrypt_combined(&current_key, &rotated_token).as_deref(),
            Some("legacy-mcp-access-token")
        );
        assert_eq!(
            decrypt_combined(&legacy_key, &rotated_token),
            None,
            "the machine-only key must no longer open the stored token"
        );

        let rotated_credential = read("mcp_oauth_config_vercel_client_secret");
        let inner = rotated_credential
            .strip_prefix("<enc:")
            .and_then(|rest| rest.strip_suffix('>'))
            .expect("the encrypted-at-rest marker must be preserved");
        assert_eq!(
            decrypt_combined(&current_key, inner).as_deref(),
            Some("legacy-vercel-secret")
        );

        assert_eq!(
            read("some_other_setting"),
            foreign,
            "a row of another purpose must never be rewritten"
        );

        apply_migration_v80(&conn).expect("v80 must be idempotent");
        assert_eq!(read("mcp_oauth_vercel_access_token"), rotated_token);
    }

    /// F5: email, Gmail, calendar, and generic app secrets an older build wrote
    /// stay decryptable by any local process until the row is rewritten, so the
    /// machine_key rotation has to reach them too.
    #[test]
    fn v81_rewraps_machine_key_only_account_credentials() {
        use crate::sys::security::machine_key::KeyPurpose;

        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let legacy_key = machine_key::legacy_machine_only_keys(KeyPurpose::EmailCredentials)
            .first()
            .copied()
            .expect("a legacy candidate always exists");
        let current_key =
            machine_key::try_derive_key(KeyPurpose::EmailCredentials).expect("install secret");
        let legacy_row = migration_encrypt_token_with(&legacy_key, "hunter2-imap").unwrap();

        let insert_account = |id: i64, email: &str, password: &str| {
            conn.execute(
                "INSERT INTO email_accounts (
                     id, provider, email, imap_host, imap_port, smtp_host, smtp_port,
                     password_encrypted, created_at
                 ) VALUES (?1, 'imap', ?2, 'imap.example.com', 993, 'smtp.example.com', 465, ?3, 0)",
                params![id, email, password],
            )
            .unwrap();
        };
        insert_account(1, "legacy@example.com", &legacy_row);
        insert_account(2, "plain@example.com", "not-json-at-all");

        assert_eq!(
            rewrap_machine_only_column(
                &conn,
                "email_accounts",
                "password_encrypted",
                KeyPurpose::EmailCredentials
            )
            .expect("rotate email credentials"),
            1
        );

        let stored: String = conn
            .query_row(
                "SELECT password_encrypted FROM email_accounts WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            migration_decrypt_token_with(&current_key, &stored),
            Some("hunter2-imap".to_string())
        );
        assert_eq!(
            migration_decrypt_token_with(&legacy_key, &stored),
            None,
            "the machine-only key must no longer open the stored password"
        );

        let untouched: String = conn
            .query_row(
                "SELECT password_encrypted FROM email_accounts WHERE id = 2",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(untouched, "not-json-at-all");

        assert_eq!(
            rewrap_machine_only_column(
                &conn,
                "email_accounts",
                "password_encrypted",
                KeyPurpose::EmailCredentials
            )
            .expect("v81 must be idempotent"),
            0
        );

        // A table the schema never created must be skipped, not raise.
        assert_eq!(
            rewrap_machine_only_column(
                &conn,
                "table_that_does_not_exist",
                "value",
                KeyPurpose::EmailCredentials
            )
            .expect("a missing table is not an error"),
            0
        );
    }
}
