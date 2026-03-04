use rusqlite::{Connection, Result};
use std::collections::HashSet;
use std::sync::LazyLock;

const CURRENT_VERSION: i32 = 56;

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
        // Autonomous & AI
        "autonomous_sessions",
        "autonomous_task_logs",
        "ai_employees",
        "user_employees",
        "employee_tasks",
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
fn run_migration_in_transaction<F>(conn: &Connection, version: i32, migration_fn: F) -> Result<()>
where
    F: FnOnce(&Connection) -> Result<()>,
{
    // SQLite doesn't support nested transactions, so we use SAVEPOINT for safety
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
        "CREATE TABLE IF NOT EXISTS ai_employees (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            role TEXT NOT NULL,
            description TEXT NOT NULL,
            capabilities TEXT NOT NULL,
            estimated_time_saved INTEGER NOT NULL,
            estimated_cost_saved REAL NOT NULL,
            demo_workflow TEXT,
            required_integrations TEXT,
            template_id TEXT,
            is_verified INTEGER DEFAULT 0 CHECK(is_verified IN (0, 1)),
            usage_count INTEGER DEFAULT 0,
            avg_rating REAL DEFAULT 0.0,
            created_at INTEGER NOT NULL,
            creator_id TEXT,
            tags TEXT NOT NULL DEFAULT '[]'
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_employees_role
         ON ai_employees(role)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_employees_verified
         ON ai_employees(is_verified, avg_rating DESC)",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS user_employees (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            employee_id TEXT NOT NULL,
            hired_at INTEGER NOT NULL,
            tasks_completed INTEGER DEFAULT 0,
            time_saved_minutes INTEGER DEFAULT 0,
            cost_saved_usd REAL DEFAULT 0.0,
            is_active INTEGER DEFAULT 1 CHECK(is_active IN (0, 1)),
            custom_config TEXT,
            FOREIGN KEY(employee_id) REFERENCES ai_employees(id)
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_user_employees_user
         ON user_employees(user_id, hired_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_user_employees_active
         ON user_employees(user_id, is_active)
         WHERE is_active = 1",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS employee_tasks (
            id TEXT PRIMARY KEY,
            user_employee_id TEXT NOT NULL,
            task_type TEXT NOT NULL,
            input_data TEXT NOT NULL,
            output_data TEXT,
            time_saved_minutes INTEGER,
            cost_saved_usd REAL,
            started_at INTEGER NOT NULL,
            completed_at INTEGER,
            status TEXT NOT NULL CHECK(status IN ('Pending', 'Running', 'Completed', 'Failed', 'Cancelled')),
            FOREIGN KEY(user_employee_id) REFERENCES user_employees(id)
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_employee_tasks_user_employee
         ON employee_tasks(user_employee_id, started_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_employee_tasks_status
         ON employee_tasks(status, started_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS realtime_metrics (
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
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_metrics_user_time
         ON realtime_metrics(user_id, timestamp DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_metrics_employee
         ON realtime_metrics(employee_id, timestamp DESC)
         WHERE employee_id IS NOT NULL",
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
            recommended_employees TEXT NOT NULL,
            selected_employee_id TEXT,
            demo_results TEXT,
            time_to_value_seconds INTEGER NOT NULL DEFAULT 0,
            hired_employee INTEGER NOT NULL DEFAULT 0 CHECK(hired_employee IN (0, 1)),
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
        "CREATE INDEX IF NOT EXISTS idx_first_run_hired
         ON first_run_sessions(hired_employee)
         WHERE hired_employee = 1",
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
            employee_id TEXT NOT NULL,
            ran_at INTEGER NOT NULL,
            results TEXT NOT NULL,
            led_to_hire INTEGER NOT NULL DEFAULT 0 CHECK(led_to_hire IN (0, 1))
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
        "CREATE INDEX IF NOT EXISTS idx_demo_runs_employee
         ON demo_runs(employee_id, ran_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_demo_runs_conversion
         ON demo_runs(led_to_hire)
         WHERE led_to_hire = 1",
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
        "CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_auth_sessions_access_token ON auth_sessions(access_token)",
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
    // Add branching columns to messages
    conn.execute(
        "ALTER TABLE messages ADD COLUMN parent_message_id INTEGER DEFAULT NULL",
        [],
    )?;

    conn.execute(
        "ALTER TABLE messages ADD COLUMN branch_id TEXT DEFAULT 'main'",
        [],
    )?;

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

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

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
}
