use rusqlite::{Connection, Result};

/// Current schema version
const CURRENT_VERSION: i32 = 40;

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

    if current_version < 16 {
        apply_migration_v16(conn)?;
        conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [16])?;
    }

    if current_version < 17 {
        apply_migration_v17(conn)?;
        conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [17])?;
    }

    if current_version < 18 {
        apply_migration_v18(conn)?;
        conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [18])?;
    }

    if current_version < 19 {
        apply_migration_v19(conn)?;
        conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [19])?;
    }

    if current_version < 20 {
        apply_migration_v20(conn)?;
        conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [20])?;
    }

    if current_version < 21 {
        apply_migration_v21(conn)?;
        conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [21])?;
    }

    if current_version < 22 {
        apply_migration_v22(conn)?;
        conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [22])?;
    }

    if current_version < 23 {
        apply_migration_v23(conn)?;
        conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [23])?;
    }

    if current_version < 24 {
        apply_migration_v24(conn)?;
        conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [24])?;
    }

    if current_version < 25 {
        apply_migration_v25(conn)?;
        conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [25])?;
    }

    if current_version < 26 {
        apply_migration_v26(conn)?;
        conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [26])?;
    }

    if current_version < 27 {
        apply_migration_v27(conn)?;
        conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [27])?;
    }

    if current_version < 28 {
        apply_migration_v28(conn)?;
        conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [28])?;
    }

    if current_version < 29 {
        apply_migration_v29(conn)?;
        conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [29])?;
    }

    if current_version < 30 {
        apply_migration_v30(conn)?;
        conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [30])?;
    }

    if current_version < 31 {
        apply_migration_v31(conn)?;
        conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [31])?;
    }

    if current_version < 32 {
        apply_migration_v32(conn)?;
        conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [32])?;
    }

    if current_version < 33 {
        apply_migration_v33(conn)?;
        conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [33])?;
    }

    if current_version < 34 {
        apply_migration_v34(conn)?;
        conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [34])?;
    }

    if current_version < 35 {
        apply_migration_v35(conn)?;
        conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [35])?;
    }

    if current_version < 36 {
        apply_migration_v36(conn)?;
        conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [36])?;
    }

    if current_version < 37 {
        apply_migration_v37(conn)?;
        conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [37])?;
    }

    if current_version < 38 {
        apply_migration_v38(conn)?;
        conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [38])?;
    }

    if current_version < 39 {
        apply_migration_v39(conn)?;
        conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [39])?;
    }

    if current_version < 40 {
        apply_migration_v40(conn)?;
        conn.execute("INSERT INTO schema_version (version) VALUES (?1)", [40])?;
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

/// Migration v16: Enhanced LLM response cache with statistics tracking
fn apply_migration_v16(conn: &Connection) -> Result<()> {
    // Add hit_count column to track cache hits
    ensure_column(
        conn,
        "cache_entries",
        "hit_count",
        "hit_count INTEGER NOT NULL DEFAULT 0",
    )?;

    // Add tokens_saved column to track cumulative token savings
    ensure_column(
        conn,
        "cache_entries",
        "tokens_saved",
        "tokens_saved INTEGER NOT NULL DEFAULT 0",
    )?;

    // Add cost_saved column to track cumulative cost savings
    ensure_column(
        conn,
        "cache_entries",
        "cost_saved",
        "cost_saved REAL NOT NULL DEFAULT 0.0",
    )?;

    // Add temperature column for temperature-aware TTL
    ensure_column(conn, "cache_entries", "temperature", "temperature REAL")?;

    // Add max_tokens column for better cache key differentiation
    ensure_column(conn, "cache_entries", "max_tokens", "max_tokens INTEGER")?;

    // Create index on hit_count for analytics queries
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_cache_entries_hit_count
         ON cache_entries(hit_count DESC)",
        [],
    )?;

    // Create index on cost_saved for savings analytics
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_cache_entries_cost_saved
         ON cache_entries(cost_saved DESC)",
        [],
    )?;

    // Create index on temperature for temperature-based queries
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_cache_entries_temperature
         ON cache_entries(temperature)
         WHERE temperature IS NOT NULL",
        [],
    )?;

    // Cache statistics summary view (virtual table would be better, but view is simpler)
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

/// Migration v17: Codebase analysis cache for AGI system
fn apply_migration_v17(conn: &Connection) -> Result<()> {
    // Codebase cache table - stores file trees, symbols, and dependency graphs
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

    // Index for efficient project-based queries
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_codebase_cache_project
         ON codebase_cache(project_path, cache_type)",
        [],
    )?;

    // Index for cache type filtering
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_codebase_cache_type
         ON codebase_cache(cache_type)",
        [],
    )?;

    // Index for expiration cleanup
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_codebase_cache_expires
         ON codebase_cache(expires_at)",
        [],
    )?;

    // Index for file hash-based invalidation
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_codebase_cache_file_hash
         ON codebase_cache(file_hash)
         WHERE file_hash IS NOT NULL AND file_hash != ''",
        [],
    )?;

    // Composite index for common query pattern (project + type + hash)
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_codebase_cache_lookup
         ON codebase_cache(project_path, cache_type, file_hash)",
        [],
    )?;

    Ok(())
}

/// Migration v18: Billing and subscription management (Stripe integration)
fn apply_migration_v18(conn: &Connection) -> Result<()> {
    // Customers table - stores Stripe customer information
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

    // Subscriptions table - stores active and past subscriptions
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

    // Invoices table - stores billing history
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

    // Usage tracking table - tracks feature usage for billing limits
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

    // Usage summary view for quick lookups
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

    // Payment methods table - stores customer payment methods
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
        "CREATE INDEX IF NOT EXISTS idx_billing_payment_methods_default
         ON billing_payment_methods(customer_id, is_default)
         WHERE is_default = 1",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_billing_payment_methods_stripe_id
         ON billing_payment_methods(stripe_payment_method_id)",
        [],
    )?;

    // Webhook events table - tracks processed Stripe webhooks for idempotency
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

/// Migration v19: Workflow definitions table
fn apply_migration_v19(conn: &Connection) -> Result<()> {
    // Workflow definitions table - stores workflow structure and metadata
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

/// Migration v20: Workflow executions table
fn apply_migration_v20(conn: &Connection) -> Result<()> {
    // Workflow executions table - stores workflow execution instances
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

/// Migration v21: Workflow execution logs table
fn apply_migration_v21(conn: &Connection) -> Result<()> {
    // Workflow execution logs table - stores detailed execution logs
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

/// Migration v22: Process Reasoning (Process-Aware Planning Layer / Outcome Engine)
fn apply_migration_v22(conn: &Connection) -> Result<()> {
    // Process templates table - stores business process templates with steps, criteria, and best practices
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

    // Index for process type lookup
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_process_templates_type
         ON process_templates(process_type)",
        [],
    )?;

    // Outcome tracking table - stores measurable outcomes for each goal execution
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

    // Index for goal lookup
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_outcome_tracking_goal
         ON outcome_tracking(goal_id)",
        [],
    )?;

    // Index for process type analytics
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_outcome_tracking_process
         ON outcome_tracking(process_type)",
        [],
    )?;

    // Index for time-based queries
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_outcome_tracking_tracked_at
         ON outcome_tracking(tracked_at DESC)",
        [],
    )?;

    // Index for metric analysis
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_outcome_tracking_metric
         ON outcome_tracking(metric_name, achieved)",
        [],
    )?;

    // Composite index for process success rate queries
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_outcome_tracking_process_achieved
         ON outcome_tracking(process_type, achieved, tracked_at DESC)",
        [],
    )?;

    Ok(())
}

/// Migration v23: Agent templates and template installs
fn apply_migration_v23(conn: &Connection) -> Result<()> {
    // Agent templates table - stores pre-built agent templates
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

    // Create indexes for agent templates
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_agent_templates_category
         ON agent_templates(category)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_agent_templates_install_count
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

    // Template installs table - tracks which templates users have installed
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

    // Create indexes for template installs
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

    // Full-text search on template names and descriptions
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

/// Migration v24: Team collaboration tables
fn apply_migration_v24(conn: &Connection) -> Result<()> {
    // Teams table - stores team information
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

    // Team members table - stores team membership information
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

    // Team invitations table - stores pending team invitations
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

    // Team resources table - stores shared team resources
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

    // Team activity table - stores team activity log
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

    // Team billing table - stores team billing and subscription information
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

/// Migration v25: Governance and audit system for enterprise compliance
fn apply_migration_v25(conn: &Connection) -> Result<()> {
    // Audit events table - comprehensive tamper-resistant audit logging
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

    // Approval requests table - workflow approval system
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
        "CREATE INDEX IF NOT EXISTS idx_approval_expires_at
         ON approval_requests(expires_at)",
        [],
    )?;

    // Approval workflow rules table - configurable approval rules
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

/// Migration v26: ROI Analytics - Snapshots table
fn apply_migration_v26(conn: &Connection) -> Result<()> {
    // Analytics snapshots table - stores periodic ROI snapshots
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

/// Migration v27: ROI Analytics - Enhanced automation tracking
fn apply_migration_v27(conn: &Connection) -> Result<()> {
    // Add cost tracking to automation_history
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

    // Create index for time-based ROI queries
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_automation_history_time_saved
         ON automation_history(time_saved_ms DESC)
         WHERE time_saved_ms IS NOT NULL",
        [],
    )?;

    // Create index for cost-based ROI queries
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_automation_history_cost_savings
         ON automation_history(cost_savings_usd DESC)
         WHERE cost_savings_usd IS NOT NULL",
        [],
    )?;

    Ok(())
}

/// Migration v28: ROI Analytics - Process benchmarks and best practices
fn apply_migration_v28(conn: &Connection) -> Result<()> {
    // Process benchmarks table - stores performance benchmarks for each process type
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

    // ROI configurations table - customizable ROI calculation parameters
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

    // Insert default configuration
    conn.execute(
        "INSERT OR IGNORE INTO roi_configurations
         (id, user_id, team_id, avg_hourly_rate, baseline_error_rate, avg_error_cost, currency, created_at, updated_at)
         VALUES ('default', 'default', NULL, 50.0, 0.15, 100.0, 'USD', strftime('%s', 'now'), strftime('%s', 'now'))",
        [],
    )?;

    Ok(())
}

/// Migration v29: Enhanced tutorial and onboarding system
fn apply_migration_v29(conn: &Connection) -> Result<()> {
    // Tutorial progress tracking table - comprehensive progress tracking per user per tutorial
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

    // Tutorial step views for analytics - track which steps users view
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

    // User rewards tracking - badges, feature unlocks, credits earned
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

    // Sample data marker - tracks if sample/demo data has been populated for a user
    conn.execute(
        "CREATE TABLE IF NOT EXISTS sample_data_marker (
            user_id TEXT PRIMARY KEY,
            created_at INTEGER NOT NULL
        )",
        [],
    )?;

    // Tutorial feedback table - collect user feedback on tutorials
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

    // Interactive help sessions - track context-sensitive help usage
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
        "CREATE INDEX IF NOT EXISTS idx_help_sessions_context
         ON help_sessions(context, created_at DESC)",
        [],
    )?;

    // Full-text search on tutorial feedback
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

/// Migration v30: Real-time collaboration tables
fn apply_migration_v30(conn: &Connection) -> Result<()> {
    // User presence tracking
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

    // Collaboration sessions
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

    // Index for active sessions
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_collaboration_active
         ON collaboration_sessions(resource_type, resource_id)
         WHERE ended_at IS NULL",
        [],
    )?;

    // Index for user presence lookup
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_user_presence_status
         ON user_presence(status, last_seen)",
        [],
    )?;

    Ok(())
}

/// Migration v31: Computer Use Agent sessions and actions
fn apply_migration_v31(conn: &Connection) -> Result<()> {
    // Computer use sessions
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

    // Computer use action log
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

    // Index for session lookup
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_computer_use_sessions_user
         ON computer_use_sessions(user_id, started_at DESC)",
        [],
    )?;

    // Index for action log by session
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_computer_use_actions_session
         ON computer_use_actions(session_id, timestamp)",
        [],
    )?;

    // Index for active sessions
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_computer_use_sessions_status
         ON computer_use_sessions(status)
         WHERE status = 'running'",
        [],
    )?;

    Ok(())
}

/// Migration v32: Messaging platform integrations
fn apply_migration_v32(conn: &Connection) -> Result<()> {
    // Messaging connections table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS messaging_connections (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            platform TEXT NOT NULL CHECK(platform IN ('slack', 'whatsapp', 'teams')),
            workspace_id TEXT,
            workspace_name TEXT,
            credentials TEXT NOT NULL,
            is_active INTEGER DEFAULT 1 CHECK(is_active IN (0, 1)),
            created_at INTEGER NOT NULL,
            last_used_at INTEGER
        )",
        [],
    )?;

    // Index for user connections lookup
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_messaging_connections_user
         ON messaging_connections(user_id, platform)",
        [],
    )?;

    // Index for active connections
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_messaging_connections_active
         ON messaging_connections(user_id, is_active)
         WHERE is_active = 1",
        [],
    )?;

    // Messaging history table
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

    // Index for message history lookup
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_messaging_history_connection
         ON messaging_history(connection_id, timestamp DESC)",
        [],
    )?;

    // Index for channel history lookup
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_messaging_history_channel
         ON messaging_history(channel_id, timestamp DESC)",
        [],
    )?;

    // Index for direction-based queries
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_messaging_history_direction
         ON messaging_history(connection_id, direction, timestamp DESC)",
        [],
    )?;

    Ok(())
}

/// Migration v33: AI Employee Library and Real-time metrics tracking
fn apply_migration_v33(conn: &Connection) -> Result<()> {
    // AI Employees table - stores pre-built and custom AI employees
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

    // Index for employee search
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

    // User Employees table - tracks hired employees per user
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

    // Index for user employee queries
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

    // Employee Tasks table - tracks all tasks assigned to employees
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

    // Index for task queries
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

    // Real-time metrics table - stores immediate ROI metrics after each automation
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

    // Index for user-based queries
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_metrics_user_time
         ON realtime_metrics(user_id, timestamp DESC)",
        [],
    )?;

    // Index for employee performance queries
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_metrics_employee
         ON realtime_metrics(employee_id, timestamp DESC)
         WHERE employee_id IS NOT NULL",
        [],
    )?;

    // Index for automation-specific metrics
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_metrics_automation
         ON realtime_metrics(automation_id, timestamp DESC)
         WHERE automation_id IS NOT NULL",
        [],
    )?;

    // Index for time-based aggregations
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_metrics_timestamp
         ON realtime_metrics(timestamp DESC)",
        [],
    )?;

    Ok(())
}

/// Migration v34: User milestones tracking
fn apply_migration_v34(conn: &Connection) -> Result<()> {
    // User milestones table - tracks achievement milestones
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

    // Index for user milestone queries
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_milestones_user
         ON user_milestones(user_id, achieved_at DESC)",
        [],
    )?;

    // Index for milestone type queries
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_milestones_type
         ON user_milestones(milestone_type)",
        [],
    )?;

    // Unique constraint to prevent duplicate milestones
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_milestones_unique
         ON user_milestones(user_id, milestone_type)",
        [],
    )?;

    Ok(())
}

/// Migration v35: Metrics aggregation cache for dashboard performance
fn apply_migration_v35(conn: &Connection) -> Result<()> {
    // Daily aggregation cache - pre-computed daily stats for fast dashboard loading
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

    // Index for date range queries
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_daily_cache_date
         ON metrics_daily_cache(user_id, date DESC)",
        [],
    )?;

    Ok(())
}

/// Migration v36: ROI comparison benchmarks
fn apply_migration_v36(conn: &Connection) -> Result<()> {
    // Automation type benchmarks - stores industry benchmarks for comparison
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

    // Insert default benchmarks
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

/// Migration v37: First-run experience tracking
fn apply_migration_v37(conn: &Connection) -> Result<()> {
    // First-run sessions table - tracks onboarding completion
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

    // Index for user-based queries
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_first_run_user
         ON first_run_sessions(user_id, started_at DESC)",
        [],
    )?;

    // Index for completion status
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_first_run_completed
         ON first_run_sessions(completed_at DESC)
         WHERE completed_at IS NOT NULL",
        [],
    )?;

    // Index for conversion tracking
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_first_run_hired
         ON first_run_sessions(hired_employee)
         WHERE hired_employee = 1",
        [],
    )?;

    // Sample data marker table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS sample_data_marker (
            user_id TEXT PRIMARY KEY,
            created_at INTEGER NOT NULL
        )",
        [],
    )?;

    Ok(())
}

/// Migration v38: Demo runs tracking
fn apply_migration_v38(conn: &Connection) -> Result<()> {
    // Demo runs table - tracks all instant demo executions
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

    // Index for user demo history
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_demo_runs_user
         ON demo_runs(user_id, ran_at DESC)
         WHERE user_id IS NOT NULL",
        [],
    )?;

    // Index for employee performance
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_demo_runs_employee
         ON demo_runs(employee_id, ran_at DESC)",
        [],
    )?;

    // Index for conversion tracking
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_demo_runs_conversion
         ON demo_runs(led_to_hire)
         WHERE led_to_hire = 1",
        [],
    )?;

    // Index for time-based queries
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_demo_runs_time
         ON demo_runs(ran_at DESC)",
        [],
    )?;

    Ok(())
}

/// Migration v39: Public workflow marketplace
fn apply_migration_v39(conn: &Connection) -> Result<()> {
    // Published workflows table - public marketplace
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

    // Workflow clones tracking
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

    // Workflow ratings
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

    // Workflow favorites
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

    // Workflow comments
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

    // Indexes for performance

    // Search and filtering indexes
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
        "CREATE INDEX IF NOT EXISTS idx_published_workflows_recent
         ON published_workflows(created_at DESC)",
        [],
    )?;

    // Clone tracking indexes
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
        "CREATE INDEX IF NOT EXISTS idx_workflow_clones_recent
         ON workflow_clones(cloned_at DESC)",
        [],
    )?;

    // Rating indexes
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

    // Favorites indexes
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

    // Comments indexes
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

/// Migration v40: Authentication and Authorization system
fn apply_migration_v40(conn: &Connection) -> Result<()> {
    // Users table with role-based access control
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

    // Sessions table for token management
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

    // OAuth providers table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS oauth_providers (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            provider TEXT NOT NULL CHECK(provider IN ('google', 'github', 'microsoft')),
            provider_user_id TEXT NOT NULL,
            access_token TEXT,
            refresh_token TEXT,
            expires_at TEXT,
            scope TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(provider, provider_user_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // Permissions table for fine-grained access control
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

    // Role permissions mapping
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

    // User-specific permission overrides
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

    // API keys for LLM providers and external services
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

    // Audit log for authentication events
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

    // Create indexes for performance
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

    // Insert default permissions
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

    // Assign default role permissions
    // Viewer: read-only access
    let viewer_permissions = vec![
        "chat:read",
        "automation:read",
        "file:read",
        "database:read",
        "settings:read",
    ];

    // Editor: read-write access (no admin or delete)
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

    // Admin: full access
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
