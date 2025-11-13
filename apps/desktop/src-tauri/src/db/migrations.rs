use rusqlite::{Connection, Result};

/// Current schema version
const CURRENT_VERSION: i32 = 15;

/// Initialize database and run migrations
pub fn run_migrations(conn: &Connection) -> Result<()> {
    // Enable foreign keys
    conn.execute("PRAGMA foreign_keys = ON", [])?;

    // Create version table if not exists
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // Get current version
    let current_version: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_version",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    // Apply migrations
    if current_version > CURRENT_VERSION {
        return Ok(());
    }
    if current_version < 1 {
        apply_migration_v1(conn)?;
        conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [1])?;
    }

    if current_version < 2 {
        apply_migration_v2(conn)?;
        conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [2])?;
    }

    if current_version < 3 {
        apply_migration_v3(conn)?;
        conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [3])?;
    }

    if current_version < 4 {
        apply_migration_v4(conn)?;
        conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [4])?;
    }

    if current_version < 5 {
        apply_migration_v5(conn)?;
        conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [5])?;
    }

    if current_version < 6 {
        apply_migration_v6(conn)?;
        conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [6])?;
    }

    if current_version < 7 {
        apply_migration_v7(conn)?;
        conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [7])?;
    }

    if current_version < 8 {
        apply_migration_v8(conn)?;
        conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [8])?;
    }

    if current_version < 9 {
        apply_migration_v9(conn)?;
        conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [9])?;
    }

    if current_version < 10 {
        apply_migration_v10(conn)?;
        conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [10])?;
    }

    if current_version < 11 {
        apply_migration_v11(conn)?;
        conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [11])?;
    }

    if current_version < 12 {
        apply_migration_v12(conn)?;
        conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [12])?;
    }

    if current_version < 13 {
        apply_migration_v13(conn)?;
        conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [13])?;
    }

    if current_version < 14 {
        apply_migration_v14(conn)?;
        conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [14])?;
    }

    if current_version < 15 {
        apply_migration_v15(conn)?;
        conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [15])?;
    }

    Ok(())
}

/// Migration v1: Initial schema
fn apply_migration_v1(conn: &Connection) -> Result<()> {
    // Conversations table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // Create index for conversation sorting
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_conversations_updated
         ON conversations(updated_at DESC)",
        [],
    )?;

    // Messages table
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

    // Create index for message retrieval
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_messages_conversation
         ON messages(conversation_id, created_at)",
        [],
    )?;

    // Settings table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            encrypted INTEGER NOT NULL DEFAULT 0 CHECK(encrypted IN (0, 1))
        )",
        [],
    )?;

    // Automation history table
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

    // Create index for automation history queries
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

    // Overlay events table
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

    // Create index for overlay event replay
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_overlay_events_timestamp
         ON overlay_events(timestamp)",
        [],
    )?;

    Ok(())
}

/// Migration v8: Calendar accounts storage
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

/// Migration v2: Screen capture and OCR tables
fn apply_migration_v2(conn: &Connection) -> Result<()> {
    // Captures table
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

    // Create indexes for capture queries
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

    // OCR results table
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

    // Create index for OCR result queries
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_ocr_results_capture
         ON ocr_results(capture_id)",
        [],
    )?;

    // Full-text search on OCR text
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

/// Migration v3: System automation permissions and audit logging
fn apply_migration_v3(conn: &Connection) -> Result<()> {
    // Permissions table
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

    // Create unique index on permission_type and pattern
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_permissions_type_pattern
         ON permissions(permission_type, pattern)",
        [],
    )?;

    // Audit log table
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

    // Create indexes for audit log queries
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

    // Command history table
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

    // Create index for command history queries
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_command_history_created
         ON command_history(created_at DESC)",
        [],
    )?;

    // Clipboard history table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS clipboard_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            content_type TEXT NOT NULL DEFAULT 'text',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // Create index for clipboard history queries
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_clipboard_history_created
         ON clipboard_history(created_at DESC)",
        [],
    )?;

    // Insert default permissions
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

/// Migration v4: Enhanced settings table with categories and timestamps
fn apply_migration_v4(conn: &Connection) -> Result<()> {
    // Create new settings table with enhanced schema
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

    // Create indexes for efficient queries
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

    // Migrate data from old settings table if it exists
    let table_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='settings'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(false);

    if table_exists {
        // Migrate existing settings (best effort - categorize as 'system')
        conn.execute(
            "INSERT OR IGNORE INTO settings_v2 (key, value, category, encrypted, created_at, updated_at)
             SELECT key, value, 'system', encrypted, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
             FROM settings",
            [],
        )?;
    }

    Ok(())
}

/// Migration v5: add provider/model metadata and cache table
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

/// Migration v6: Browser automation sessions and tabs
fn apply_migration_v6(conn: &Connection) -> Result<()> {
    // Browser sessions table
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

    // Create index for browser session queries
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

    // Browser tabs table
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

    // Create indexes for browser tab queries
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

    // Browser automation history table
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

    // Create index for browser automation history queries
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

/// Migration v7: Email accounts and contacts
fn apply_migration_v7(conn: &Connection) -> Result<()> {
    // Email accounts table
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

    // Create index for email account queries
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

    // Emails table
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

    // Create indexes for email queries
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_emails_account
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

    // Email attachments table
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

    // Create index for attachment queries
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_email_attachments_email
         ON email_attachments(email_id)",
        [],
    )?;

    // Contacts table
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

    // Create indexes for contact queries
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

    // Full-text search on email content
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

/// Migration v9: Enhanced messages with context items, images, tool calls, artifacts
fn apply_migration_v9(conn: &Connection) -> Result<()> {
    // Add new columns to messages table for enhanced features
    ensure_column(
        conn,
        "messages",
        "context_items",
        "context_items TEXT", // JSON array of context items
    )?;

    ensure_column(
        conn,
        "messages",
        "images",
        "images TEXT", // JSON array of image attachments
    )?;

    ensure_column(
        conn,
        "messages",
        "tool_calls",
        "tool_calls TEXT", // JSON array of tool calls
    )?;

    ensure_column(
        conn,
        "messages",
        "artifacts",
        "artifacts TEXT", // JSON array of code artifacts
    )?;

    ensure_column(
        conn,
        "messages",
        "timeline_events",
        "timeline_events TEXT", // JSON array of timeline events
    )?;

    // Context items table for detailed context tracking
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

/// Migration v10: MCP (Model Context Protocol) infrastructure
fn apply_migration_v10(conn: &Connection) -> Result<()> {
    // MCP servers configuration
    conn.execute(
        "CREATE TABLE IF NOT EXISTS mcp_servers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            command TEXT NOT NULL,
            args TEXT, -- JSON array
            env TEXT, -- JSON object
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

    // MCP tools cache for fast lookup
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

    // Full-text search on tool descriptions
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

/// Migration v11: Autonomous operations (AGI task logs and sessions)
fn apply_migration_v11(conn: &Connection) -> Result<()> {
    // Autonomous sessions tracking
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
            metadata TEXT, -- JSON object
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

    // Autonomous task execution logs
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

/// Migration v12: Performance indexes for common queries
fn apply_migration_v12(conn: &Connection) -> Result<()> {
    // Composite index for message + conversation queries
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
         ON messages(conversation_id, created_at DESC)",
        [],
    )?;

    // Index for token/cost analytics
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_messages_tokens_cost
         ON messages(created_at DESC, tokens, cost)
         WHERE tokens IS NOT NULL",
        [],
    )?;

    // Index for streaming message lookups
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_messages_role_created
         ON messages(role, created_at DESC)",
        [],
    )?;

    // Index for context item searches
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_context_items_type_created
         ON context_items(type, created_at DESC)",
        [],
    )?;

    // Index for capture lookups by conversation
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_captures_conversation
         ON captures(conversation_id, created_at DESC)",
        [],
    )?;

    // Index for OCR result searches
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_ocr_results_confidence
         ON ocr_results(confidence DESC, created_at DESC)
         WHERE confidence > 0.5",
        [],
    )?;

    // Index for command history search
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_command_history_command
         ON command_history(command, created_at DESC)",
        [],
    )?;

    // Index for clipboard history by content type
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_clipboard_history_type
         ON clipboard_history(content_type, created_at DESC)",
        [],
    )?;

    Ok(())
}

/// Migration v13: Conversation checkpoints for safe AI editing
fn apply_migration_v13(conn: &Connection) -> Result<()> {
    // Checkpoints table - stores conversation state snapshots
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

    // Index for checkpoint queries by conversation
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_checkpoints_conversation
         ON conversation_checkpoints(conversation_id, created_at DESC)",
        [],
    )?;

    // Index for checkpoint branches
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_checkpoints_branch
         ON conversation_checkpoints(branch_name, created_at DESC)
         WHERE branch_name IS NOT NULL",
        [],
    )?;

    // Index for checkpoint hierarchy (parent-child relationships)
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_checkpoints_parent
         ON conversation_checkpoints(parent_checkpoint_id)
         WHERE parent_checkpoint_id IS NOT NULL",
        [],
    )?;

    // Checkpoint restore history - track when checkpoints are restored
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

    // Index for restore history queries
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_checkpoint_restore_history
         ON checkpoint_restore_history(conversation_id, restored_at DESC)",
        [],
    )?;

    Ok(())
}

fn ensure_column(conn: &Connection, table: &str, column: &str, definition: &str) -> Result<()> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({})", table))?;
    let exists = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .filter_map(Result::ok)
        .any(|name| name == column);

    if !exists {
        conn.execute(
            &format!("ALTER TABLE {} ADD COLUMN {}", table, definition),
            [],
        )?;
    }

    Ok(())
}

/// Migration v14: Performance indexes for common queries
fn apply_migration_v14(conn: &Connection) -> Result<()> {
    // Composite index for paginated message loading (conversation_id + created_at)
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
         ON messages(conversation_id, created_at DESC)",
        [],
    )?;

    // Index for conversation searches by title
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_conversations_title
         ON conversations(title)",
        [],
    )?;

    // Index for audit log filtering by action type
    Ok(())
}

/// Migration v15: Onboarding progress tracking
fn apply_migration_v15(conn: &Connection) -> Result<()> {
    // Onboarding progress table - tracks user completion of onboarding steps
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

    // Index for onboarding step queries
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

    // Insert default onboarding steps
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

    // User preferences table for expanded settings
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

    // Session management table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS user_sessions (
            id TEXT PRIMARY KEY,
            started_at INTEGER NOT NULL,
            last_activity INTEGER NOT NULL,
            idle_timeout_minutes INTEGER NOT NULL DEFAULT 30,
            auto_lock_enabled INTEGER NOT NULL DEFAULT 0 CHECK(auto_lock_enabled IN (0, 1)),
            locked_at INTEGER,
            unlock_required INTEGER NOT NULL DEFAULT 0 CHECK(unlock_required IN (0, 1)),
            session_data TEXT, -- JSON object
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

    // Offline operations queue
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
            payload TEXT NOT NULL, -- JSON object
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

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn test_migrations() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        // Verify tables exist
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
