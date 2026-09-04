use super::*;

/// Maximum number of rows returned from db_query to prevent data exfiltration
const MAX_QUERY_ROWS: usize = 1000;

/// Maximum SQL query length to prevent abuse
const MAX_QUERY_LENGTH: usize = 10_000;

const ALLOWED_QUERY_TABLES: &[&str] = &[
    "conversations",
    "messages",
    "automation_history",
    "overlay_events",
    "context_items",
    "workflow_definitions",
    "workflow_executions",
    "workflow_execution_logs",
    "published_workflows",
    "workflow_clones",
    "workflow_ratings",
    "workflow_favorites",
    "workflow_comments",
    "scheduled_jobs",
    "job_executions",
    "browser_sessions",
    "browser_tabs",
    "browser_automation_history",
    "calendar_accounts",
    "mcp_servers",
    "mcp_tools_cache",
    "projects",
    "project_settings",
    "project_memories",
    "user_memory",
    "daily_logs",
    "agent_templates",
    "template_installs",
    "analytics_snapshots",
    "user_milestones",
    "metrics_daily_cache",
    "realtime_metrics",
    "automation_benchmarks",
    "process_benchmarks",
    "roi_configurations",
    "background_agents",
    "agi_tasks",
    "agi_task_checkpoints",
    "conversation_branches",
    "autonomous_sessions",
    "autonomous_task_logs",
];

fn sql_identifier_tokens(query_upper: &str) -> Vec<SqlToken> {
    let mut tokens: Vec<SqlToken> = Vec::new();
    let mut depth: usize = 0;

    for piece in sql_pieces(query_upper) {
        match piece {
            SqlPiece::OpenParen => depth += 1,
            SqlPiece::CloseParen => depth = depth.saturating_sub(1),
            SqlPiece::Comma => tokens.push(SqlToken::comma(depth)),
            SqlPiece::Word(word) => tokens.push(SqlToken::word(word, depth)),
            SqlPiece::Quoted(text) => tokens.push(SqlToken::name(quoted_name(text), depth)),
        }
    }

    tokens
}

/// Stands in for a table reference that carries no identifier at all
/// (`FROM ''`). It is in no allowlist, so the scanners refuse it instead of
/// reading past it to an alias.
const UNRESOLVED_IDENTIFIER: &str = "?";

/// SQLite takes the WHOLE contents of a quoted run as one name, so the guards
/// compare the whole run too. Splitting it into words made `'%SETTINGS%'` carry
/// the name `SETTINGS`, which is a value, not the table.
fn quoted_name(text: String) -> String {
    if text.is_empty() {
        UNRESOLVED_IDENTIFIER.to_string()
    } else {
        text
    }
}

/// A token plus the two properties the guards must not lose.
///
/// KIND. Quoting decides whether SQLite can read a run as a KEYWORD. `"where"`,
/// `[where]` and `` `where` `` are identifiers and are legal table aliases,
/// while a bare `where` cannot be an alias and ends the FROM clause. Collapsing
/// both into the same bare string let a quoted alias impersonate a
/// clause-ending keyword and hide the comma that followed it.
///
/// DEPTH. A `WHERE`, `GROUP` or `LIMIT` inside a subquery belongs to that
/// subquery. Reading one as the end of the ENCLOSING FROM clause is what let a
/// comma-separated table list hide behind an ON constraint.
#[derive(Clone, Debug, PartialEq, Eq)]
struct SqlToken {
    text: String,
    kind: TokenKind,
    depth: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum TokenKind {
    /// Bare text: the only kind that can be a keyword.
    Word,
    /// Came out of a quoted run, so it names something and is never a keyword.
    Name,
    Comma,
}

impl SqlToken {
    fn word(text: impl Into<String>, depth: usize) -> Self {
        Self {
            text: text.into(),
            kind: TokenKind::Word,
            depth,
        }
    }

    fn name(text: impl Into<String>, depth: usize) -> Self {
        Self {
            text: text.into(),
            kind: TokenKind::Name,
            depth,
        }
    }

    fn comma(depth: usize) -> Self {
        Self {
            text: ",".to_string(),
            kind: TokenKind::Comma,
            depth,
        }
    }

    fn keyword(&self, keyword: &str) -> bool {
        self.kind == TokenKind::Word && self.text == keyword
    }

    fn is_comma(&self) -> bool {
        self.kind == TokenKind::Comma
    }

    fn ends_from_clause(&self) -> bool {
        self.kind == TokenKind::Word && FROM_CLAUSE_END.contains(&self.text.as_str())
    }

    /// The name this token can denote, or `None` for punctuation.
    fn as_name(&self) -> Option<&str> {
        match self.kind {
            TokenKind::Comma => None,
            _ => Some(&self.text),
        }
    }
}

enum SqlPiece {
    Word(String),
    Comma,
    OpenParen,
    CloseParen,
    Quoted(String),
}

fn sql_pieces(query_upper: &str) -> Vec<SqlPiece> {
    let chars: Vec<char> = query_upper.chars().collect();
    let mut pieces: Vec<SqlPiece> = Vec::new();
    let mut i = 0;

    while i < chars.len() {
        let c = chars[i];

        if c == '/' && chars.get(i + 1) == Some(&'*') {
            i += 2;
            while i < chars.len() && !(chars[i] == '*' && chars.get(i + 1) == Some(&'/')) {
                i += 1;
            }
            i = i.saturating_add(2).min(chars.len());
            continue;
        }

        if c == '-' && chars.get(i + 1) == Some(&'-') {
            while i < chars.len() && chars[i] != '\n' {
                i += 1;
            }
            continue;
        }

        if c == '\'' || c == '"' || c == '`' {
            let (text, next) = quoted_run(&chars, i, c);
            pieces.push(SqlPiece::Quoted(text));
            i = next;
            continue;
        }

        if c == '[' {
            // Bracket quoting has no escape: the run ends at the first `]`.
            let start = i + 1;
            let mut end = start;
            while end < chars.len() && chars[end] != ']' {
                end += 1;
            }
            pieces.push(SqlPiece::Quoted(chars[start..end].iter().collect()));
            i = end.saturating_add(1).min(chars.len());
            continue;
        }

        if c == ',' {
            // The comma SURVIVES as its own token. `FROM messages, command_history c`
            // is a cross join: the second table is read exactly as if it had been
            // named after FROM, but the scanner only ever reads the token that
            // follows the keyword. Erasing the comma made that second table
            // invisible to the allowlist while leaving it live for the engine.
            pieces.push(SqlPiece::Comma);
            i += 1;
            continue;
        }

        if c == '(' {
            pieces.push(SqlPiece::OpenParen);
            i += 1;
            continue;
        }

        if c == ')' {
            pieces.push(SqlPiece::CloseParen);
            i += 1;
            continue;
        }

        if c.is_alphanumeric() || c == '_' {
            let start = i;
            // `$` is an identifier character to SQLite, so a name carrying one is
            // a single token here too rather than two halves that match nothing.
            while i < chars.len()
                && (chars[i].is_alphanumeric() || chars[i] == '_' || chars[i] == '$')
            {
                i += 1;
            }
            pieces.push(SqlPiece::Word(chars[start..i].iter().collect()));
            continue;
        }

        i += 1;
    }

    pieces
}

/// Consume a `quote`-delimited run, in which a doubled quote is an escaped
/// quote rather than the close. An unterminated run consumes the rest of the
/// input, so nothing after it can be read as a table reference.
fn quoted_run(chars: &[char], open: usize, quote: char) -> (String, usize) {
    let mut text = String::new();
    let mut i = open + 1;

    while i < chars.len() {
        if chars[i] == quote {
            if chars.get(i + 1) == Some(&quote) {
                text.push(quote);
                i += 2;
                continue;
            }
            return (text, i + 1);
        }
        text.push(chars[i]);
        i += 1;
    }

    (text, chars.len())
}

/// Why a query is refused by the FROM/JOIN scan.
enum TableRefusal {
    NotAllowed(String),
    ImplicitJoin,
}

const IMPLICIT_JOIN_REFUSAL: &str = "Comma-separated table lists are not permitted; use an explicit JOIN so every table is checked against the allowlist.";

impl TableRefusal {
    fn message(&self, in_subquery: bool) -> String {
        match self {
            TableRefusal::NotAllowed(table) if in_subquery => {
                format!("Access to table '{}' is not permitted in subquery.", table)
            }
            TableRefusal::NotAllowed(table) => {
                format!("Access to table '{}' is not permitted.", table)
            }
            TableRefusal::ImplicitJoin => IMPLICIT_JOIN_REFUSAL.to_string(),
        }
    }
}

fn scan_table_refs(tokens: &[SqlToken], allowed: impl Fn(&str) -> bool) -> Option<TableRefusal> {
    for (i, token) in tokens.iter().enumerate() {
        if !token.keyword("FROM") && !token.keyword("JOIN") {
            continue;
        }

        // FAIL CLOSED on an unresolvable target. Previously an absent or empty
        // identifier after FROM/JOIN skipped the allowlist check entirely -- so
        // any divergence between this tokenizer and the SQL engine became a
        // BYPASS rather than a denial. Rejecting instead caps the blast radius
        // of the whole class: a future tokenizer bug can at worst refuse a
        // legitimate query, never admit a forbidden table.
        let table = tokens
            .get(i + 1)
            .and_then(SqlToken::as_name)
            .unwrap_or_default();
        if table.is_empty() || !allowed(&table.to_lowercase()) {
            return Some(TableRefusal::NotAllowed(table.to_string()));
        }

        let depth = token.depth;
        let inside_clause =
            |t: &SqlToken| t.depth >= depth && !(t.depth == depth && t.ends_from_clause());
        if tokens[i + 1..]
            .iter()
            .take_while(|t| inside_clause(t))
            .any(|t| t.is_comma())
        {
            return Some(TableRefusal::ImplicitJoin);
        }
    }

    None
}

const FROM_CLAUSE_END: &[&str] = &[
    "WHERE",
    "GROUP",
    "HAVING",
    "ORDER",
    "LIMIT",
    "UNION",
    "INTERSECT",
    "EXCEPT",
    "RETURNING",
    "VALUES",
    "SET",
];

fn first_forbidden_mention(
    conn: &rusqlite::Connection,
    tokens: &[SqlToken],
    allowed: impl Fn(&str) -> bool,
) -> std::result::Result<Option<String>, String> {
    let mut stmt = conn
        .prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view')")
        .map_err(|e| format!("Schema lookup error: {}", e))?;
    let existing: std::collections::HashSet<String> = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| format!("Schema lookup error: {}", e))?
        .filter_map(|name| name.ok())
        .map(|name| name.to_lowercase())
        .collect();

    Ok(tokens.iter().find_map(|token| {
        let name = token.as_name()?;
        let lowered = name.to_lowercase();
        if existing.contains(&lowered) && !allowed(&lowered) {
            Some(name.to_string())
        } else {
            None
        }
    }))
}

const ALLOWED_WRITE_TABLES: &[&str] = &[
    "conversations",
    "messages",
    "user_memory",
    "daily_logs",
    "workflow_executions",
    "workflow_execution_logs",
    "background_agents",
    "agi_tasks",
    "agi_task_checkpoints",
    "scheduled_jobs",
    "job_executions",
    "automation_history",
];

fn query_table_allowed(table: &str) -> bool {
    ALLOWED_QUERY_TABLES.contains(&table)
}

fn write_table_allowed(table: &str) -> bool {
    ALLOWED_WRITE_TABLES.contains(&table) || ALLOWED_QUERY_TABLES.contains(&table)
}

/// Operations refused inside a `db_query`. Matched as a WORD, never a substring:
/// `created_at`, `updated_at` and `deleted_at` are ordinary columns of the
/// allowlisted tables, and a substring scan refused every query naming one.
const BLOCKED_QUERY_KEYWORDS: &[&str] = &[
    "DROP",
    "TRUNCATE",
    "DELETE",
    "ALTER",
    "CREATE",
    "INSERT",
    "UPDATE",
    "GRANT",
    "REVOKE",
    "ATTACH",
    "DETACH",
    "PRAGMA",
    "LOAD_EXTENSION",
];

const BLOCKED_WRITE_KEYWORDS: &[&str] = &[
    "DROP",
    "TRUNCATE",
    "ALTER",
    "CREATE",
    "GRANT",
    "REVOKE",
    "ATTACH",
    "DETACH",
    "PRAGMA",
    "LOAD_EXTENSION",
    "WITH",
];

fn db_query_refusal(query: &str, conn: Option<&rusqlite::Connection>) -> Option<String> {
    if query.len() > MAX_QUERY_LENGTH {
        tracing::warn!(
            "[SECURITY] db_query rejected: query exceeds max length ({} > {})",
            query.len(),
            MAX_QUERY_LENGTH
        );
        return Some(format!(
            "Query too long ({} chars). Maximum allowed: {} chars.",
            query.len(),
            MAX_QUERY_LENGTH
        ));
    }

    let query_upper = query.trim().to_uppercase();
    let tokens = sql_identifier_tokens(&query_upper);

    if !query_upper.starts_with("SELECT") {
        return Some(
            "db_query only supports SELECT statements. Use db_execute for modifications."
                .to_string(),
        );
    }

    if tokens.iter().any(|t| t.keyword("WITH")) {
        return Some("CTE (WITH) queries are not supported for security reasons. Please rewrite without WITH clauses.".to_string());
    }

    if query.contains(';') {
        return Some("Multiple SQL statements (semicolons) are not allowed.".to_string());
    }

    if query.contains("--") || query.contains("/*") {
        return Some("SQL comments are not allowed in queries.".to_string());
    }

    for keyword in BLOCKED_QUERY_KEYWORDS {
        if tokens.iter().any(|t| t.keyword(keyword)) {
            return Some(format!(
                "SQL operation '{}' is not allowed in db_query.",
                keyword
            ));
        }
    }

    if let Some(refusal) = scan_table_refs(&tokens, query_table_allowed) {
        return Some(refusal.message(false));
    }

    if let Some(conn) = conn {
        match first_forbidden_mention(conn, &tokens, query_table_allowed) {
            Ok(Some(table)) => {
                return Some(format!("Access to table '{}' is not permitted.", table))
            }
            Ok(None) => {}
            Err(e) => return Some(e),
        }
    }

    None
}

fn db_execute_refusal(query: &str, conn: Option<&rusqlite::Connection>) -> Option<String> {
    if query.len() > MAX_QUERY_LENGTH {
        tracing::warn!(
            "[SECURITY] db_execute rejected: query exceeds max length ({} > {})",
            query.len(),
            MAX_QUERY_LENGTH
        );
        return Some(format!(
            "Query too long ({} chars). Maximum allowed: {} chars.",
            query.len(),
            MAX_QUERY_LENGTH
        ));
    }

    if query.contains(';') {
        return Some("Multiple SQL statements (semicolons) are not allowed.".to_string());
    }

    if query.contains("--") || query.contains("/*") {
        return Some("SQL comments are not allowed in queries.".to_string());
    }

    let query_upper = query.trim().to_uppercase();
    let tokens = sql_identifier_tokens(&query_upper);

    let is_modification = query_upper.starts_with("INSERT")
        || query_upper.starts_with("UPDATE")
        || query_upper.starts_with("DELETE");
    if !is_modification {
        return Some("db_execute only supports INSERT, UPDATE, or DELETE statements. Use db_query for SELECT.".to_string());
    }

    for keyword in BLOCKED_WRITE_KEYWORDS {
        if tokens.iter().any(|t| t.keyword(keyword)) {
            return Some(format!(
                "SQL operation '{}' is not allowed. Only INSERT, UPDATE, DELETE are permitted.",
                keyword
            ));
        }
    }

    let target = if query_upper.starts_with("INSERT") {
        tokens
            .iter()
            .position(|t| t.keyword("INTO"))
            .and_then(|p| tokens.get(p + 1))
    } else if query_upper.starts_with("UPDATE") {
        tokens.get(1)
    } else {
        tokens
            .iter()
            .position(|t| t.keyword("FROM"))
            .and_then(|p| tokens.get(p + 1))
    };
    // FAIL CLOSED on a target this tokenizer cannot resolve: skipping the check
    // whenever the name came out empty is the same skip-instead-of-refuse shape
    // that every bypass so far has attacked.
    let target = target.and_then(SqlToken::as_name).unwrap_or_default();
    if !ALLOWED_WRITE_TABLES.contains(&target.to_lowercase().as_str()) {
        return Some(format!(
            "Write access to table '{}' is not permitted.",
            target
        ));
    }

    if let Some(refusal) = scan_table_refs(&tokens, write_table_allowed) {
        return Some(refusal.message(true));
    }

    if let Some(conn) = conn {
        match first_forbidden_mention(conn, &tokens, write_table_allowed) {
            Ok(Some(table)) => {
                return Some(format!("Access to table '{}' is not permitted.", table))
            }
            Ok(None) => {}
            Err(e) => return Some(e),
        }
    }

    None
}

fn refusal_result(message: String) -> ToolResult {
    ToolResult {
        success: false,
        data: json!({ "error": message.clone(), "success": false }),
        error: Some(message),
        metadata: HashMap::new(),
    }
}

impl ToolExecutor {
    pub(crate) async fn execute_db_query_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let query = args
            .get("query")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing query parameter"))?;

        let Some(app) = self.app_handle.as_ref() else {
            // The guards still run without a database so a hostile query is
            // refused as such rather than reported as an unavailable database.
            return Ok(refusal_result(
                db_query_refusal(query, None)
                    .unwrap_or_else(|| "Database not available".to_string()),
            ));
        };

        use crate::sys::commands::chat::AppDatabase;
        use tauri::Manager;

        let db = app.state::<AppDatabase>();
        let conn = match db.conn.lock() {
            Ok(c) => c,
            Err(e) => return Ok(refusal_result(format!("Database lock error: {}", e))),
        };

        if let Some(message) = db_query_refusal(query, Some(&conn)) {
            return Ok(refusal_result(message));
        }

        // SECURITY: Audit log for AI-constructed queries.
        // SEV-DESK-17 fix: demoted from `info!` to `debug!`. The full query text
        // can include user-pasted content via WHERE filters and surfaces in
        // Console.app on macOS at INFO level. DEBUG keeps the audit trail
        // available when troubleshooting without bleeding into default-level
        // log streams. Truncate to 200 chars to bound a misbehaving model.
        let trimmed_query = if query.len() > 200 {
            format!(
                "{}…",
                &query[..crate::core::agi::floor_char_boundary(query, 200)]
            )
        } else {
            query.to_string()
        };
        tracing::debug!(
            "[SECURITY][db_query] AI executing SELECT query: {}",
            trimmed_query
        );

        // Execute query and collect results - using a closure to manage lifetimes
        let query_result: Result<(Vec<String>, Vec<serde_json::Value>, bool), String> = (|| {
            let mut stmt = conn
                .prepare(query)
                .map_err(|e| format!("Query preparation error: {}", e))?;
            let column_names: Vec<String> =
                stmt.column_names().iter().map(|s| s.to_string()).collect();

            let mut rows_iter = stmt
                .query([])
                .map_err(|e| format!("Query execution error: {}", e))?;
            let mut rows: Vec<serde_json::Value> = Vec::new();
            let mut truncated = false;

            while let Some(row) = rows_iter
                .next()
                .map_err(|e| format!("Row fetch error: {}", e))?
            {
                // SECURITY: Enforce row limit to prevent data exfiltration
                if rows.len() >= MAX_QUERY_ROWS {
                    truncated = true;
                    break;
                }

                let mut obj = serde_json::Map::new();
                for (idx, col_name) in column_names.iter().enumerate() {
                    let value: rusqlite::types::Value = row
                        .get(idx)
                        .map_err(|e| format!("Column read error: {}", e))?;
                    obj.insert(
                        col_name.clone(),
                        match value {
                            rusqlite::types::Value::Null => json!(null),
                            rusqlite::types::Value::Integer(n) => json!(n),
                            rusqlite::types::Value::Real(f) => json!(f),
                            rusqlite::types::Value::Text(s) => json!(s),
                            rusqlite::types::Value::Blob(b) => {
                                json!(format!("<blob {} bytes>", b.len()))
                            }
                        },
                    );
                }
                rows.push(serde_json::Value::Object(obj));
            }

            Ok((column_names, rows, truncated))
        })(
        );

        match query_result {
            Ok((column_names, rows, truncated)) => {
                let row_count = rows.len();
                if truncated {
                    tracing::warn!(
                        "[SECURITY][db_query] Result truncated to {} rows (limit: {})",
                        row_count,
                        MAX_QUERY_ROWS
                    );
                }
                Ok(ToolResult {
                    success: true,
                    data: json!({
                        "columns": column_names,
                        "rows": rows,
                        "row_count": row_count,
                        "truncated": truncated,
                        "max_rows": MAX_QUERY_ROWS
                    }),
                    error: None,
                    metadata: HashMap::from([("query".to_string(), json!(query))]),
                })
            }
            Err(e) => Ok(ToolResult {
                success: false,
                data: json!({ "error": e.clone(), "success": false }),
                error: Some(e),
                metadata: HashMap::from([("query".to_string(), json!(query))]),
            }),
        }
    }

    pub(crate) async fn execute_db_execute_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let query = args
            .get("query")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing query parameter"))?;

        let Some(app) = self.app_handle.as_ref() else {
            return Ok(refusal_result(
                db_execute_refusal(query, None)
                    .unwrap_or_else(|| "Database not available".to_string()),
            ));
        };

        use crate::sys::commands::chat::AppDatabase;
        use tauri::Manager;

        let db = app.state::<AppDatabase>();
        let conn = match db.conn.lock() {
            Ok(c) => c,
            Err(e) => return Ok(refusal_result(format!("Database lock error: {}", e))),
        };

        if let Some(message) = db_execute_refusal(query, Some(&conn)) {
            return Ok(refusal_result(message));
        }

        // SECURITY: Audit log for AI-constructed mutations (elevated risk)
        tracing::warn!(
            "[SECURITY][db_execute] AI executing mutation query: {}",
            query
        );

        match conn.execute(query, []) {
            Ok(rows_affected) => Ok(ToolResult {
                success: true,
                data: json!({
                    "rows_affected": rows_affected,
                    "query": query
                }),
                error: None,
                metadata: HashMap::from([("query".to_string(), json!(query))]),
            }),
            Err(e) => Ok(ToolResult {
                success: false,
                data: json!({ "error": format!("Query execution error: {}", e), "success": false }),
                error: Some(format!("Query execution error: {}", e)),
                metadata: HashMap::from([("query".to_string(), json!(query))]),
            }),
        }
    }

    pub(crate) async fn execute_db_transaction_begin_tool(
        &self,
        _args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::sys::commands::chat::AppDatabase;
            use tauri::Manager;

            let db = app.state::<AppDatabase>();
            let conn = match db.conn.lock() {
                Ok(c) => c,
                Err(e) => {
                    let err_msg = format!("Database lock error: {}", e);
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::new(),
                    });
                }
            };

            match conn.execute("BEGIN TRANSACTION", []) {
                Ok(_) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "message": "Transaction started",
                        "status": "active"
                    }),
                    error: None,
                    metadata: HashMap::new(),
                }),
                Err(e) => {
                    let err_msg = format!("Failed to begin transaction: {}", e);
                    Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::new(),
                    })
                }
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "Database not available", "success": false }),
                error: Some("Database not available".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    pub(crate) async fn execute_db_transaction_commit_tool(
        &self,
        _args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::sys::commands::chat::AppDatabase;
            use tauri::Manager;

            let db = app.state::<AppDatabase>();
            let conn = match db.conn.lock() {
                Ok(c) => c,
                Err(e) => {
                    let err_msg = format!("Database lock error: {}", e);
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::new(),
                    });
                }
            };

            match conn.execute("COMMIT", []) {
                Ok(_) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "message": "Transaction committed",
                        "status": "committed"
                    }),
                    error: None,
                    metadata: HashMap::new(),
                }),
                Err(e) => {
                    let err_msg = format!("Failed to commit transaction: {}", e);
                    Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::new(),
                    })
                }
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "Database not available", "success": false }),
                error: Some("Database not available".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    pub(crate) async fn execute_db_transaction_rollback_tool(
        &self,
        _args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::sys::commands::chat::AppDatabase;
            use tauri::Manager;

            let db = app.state::<AppDatabase>();
            let conn = match db.conn.lock() {
                Ok(c) => c,
                Err(e) => {
                    let err_msg = format!("Database lock error: {}", e);
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::new(),
                    });
                }
            };

            match conn.execute("ROLLBACK", []) {
                Ok(_) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "message": "Transaction rolled back",
                        "status": "rolled_back"
                    }),
                    error: None,
                    metadata: HashMap::new(),
                }),
                Err(e) => {
                    let err_msg = format!("Failed to rollback transaction: {}", e);
                    Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::new(),
                    })
                }
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "Database not available", "success": false }),
                error: Some("Database not available".to_string()),
                metadata: HashMap::new(),
            })
        }
    }
}

#[cfg(test)]
mod sql_tokenizer_tests {
    use super::{sql_identifier_tokens, SqlToken, TokenKind};

    fn table_after_keyword(query: &str, keyword: &str) -> Option<String> {
        let tokens = sql_identifier_tokens(&query.to_uppercase());
        tokens
            .iter()
            .position(|t| t.keyword(keyword))
            .and_then(|p| tokens.get(p + 1))
            .and_then(SqlToken::as_name)
            .map(str::to_string)
    }

    fn token_texts(query: &str) -> Vec<String> {
        sql_identifier_tokens(&query.to_uppercase())
            .iter()
            .map(|t| t.text.clone())
            .collect()
    }

    #[test]
    fn finds_the_table_when_no_space_precedes_from() {
        assert_eq!(
            table_after_keyword("SELECT*FROM auth_sessions", "FROM"),
            Some("AUTH_SESSIONS".to_string())
        );
    }

    #[test]
    fn finds_the_table_when_it_is_quoted() {
        assert_eq!(
            table_after_keyword("SELECT * FROM\"settings\"", "FROM"),
            Some("SETTINGS".to_string())
        );
    }

    #[test]
    fn finds_the_table_through_a_block_comment() {
        assert_eq!(
            table_after_keyword("SELECT * FROM/*evade*/users", "FROM"),
            Some("USERS".to_string())
        );
    }

    #[test]
    fn finds_the_table_through_a_line_comment() {
        assert_eq!(
            table_after_keyword("SELECT * FROM users -- trailing", "FROM"),
            Some("USERS".to_string())
        );
    }

    #[test]
    fn still_finds_the_table_in_ordinary_sql() {
        // The rewrite must not break the normal path it protects.
        assert_eq!(
            table_after_keyword("SELECT id FROM conversations WHERE id = 1", "FROM"),
            Some("CONVERSATIONS".to_string())
        );
        assert_eq!(
            table_after_keyword("SELECT * FROM messages JOIN conversations ON 1=1", "JOIN"),
            Some("CONVERSATIONS".to_string())
        );
    }

    #[test]
    fn a_qualified_name_resolves_to_the_schema_so_it_fails_closed() {
        assert_eq!(
            table_after_keyword("SELECT * FROM main.auth_sessions", "FROM"),
            Some("MAIN".to_string())
        );
    }

    #[test]
    fn a_nested_block_comment_does_not_hide_the_table() {
        assert_eq!(
            table_after_keyword("SELECT * FROM /* a /* b */ auth_sessions", "FROM"),
            Some("AUTH_SESSIONS".to_string())
        );
    }

    /// The structural half of the fix: when the target cannot be resolved the
    /// scanners now REJECT rather than skip, so any future divergence between
    /// this tokenizer and the engine is a denial instead of a bypass.
    #[test]
    fn a_trailing_from_resolves_to_nothing_so_callers_must_reject() {
        assert_eq!(table_after_keyword("SELECT * FROM", "FROM"), None);
        assert_eq!(
            table_after_keyword("SELECT * FROM /* unterminated", "FROM"),
            None
        );
    }

    #[test]
    fn a_comma_survives_tokenization_so_a_table_list_is_visible() {
        assert_eq!(
            token_texts("SELECT C.COMMAND FROM MESSAGES, COMMAND_HISTORY C"),
            vec![
                "SELECT",
                "C",
                "COMMAND",
                "FROM",
                "MESSAGES",
                ",",
                "COMMAND_HISTORY",
                "C"
            ]
        );
    }

    #[test]
    fn a_quoted_run_is_kept_whole_and_is_never_erased() {
        assert_eq!(
            token_texts("SELECT ID FROM MESSAGES WHERE CONTENT LIKE '%SETTINGS%'"),
            vec![
                "SELECT",
                "ID",
                "FROM",
                "MESSAGES",
                "WHERE",
                "CONTENT",
                "LIKE",
                "%SETTINGS%"
            ]
        );
        assert_eq!(
            table_after_keyword(
                "SELECT * FROM messages WHERE a = 'it''s from users'",
                "FROM"
            ),
            Some("MESSAGES".to_string())
        );
    }

    #[test]
    fn newlines_and_tabs_are_still_separators() {
        assert_eq!(
            table_after_keyword("SELECT *\n\tFROM\n\tconversations", "FROM"),
            Some("CONVERSATIONS".to_string())
        );
    }

    #[test]
    fn a_quoted_table_name_is_read_as_an_identifier() {
        for sql in [
            "SELECT messages.command FROM 'command_history' messages LIMIT 20",
            "SELECT command FROM \"command_history\"",
            "SELECT command FROM [command_history]",
            "SELECT command FROM `command_history`",
            "SELECT * FROM ('command_history')",
        ] {
            assert_eq!(
                table_after_keyword(sql, "FROM"),
                Some("COMMAND_HISTORY".to_string()),
                "expected {:?} to resolve to the quoted table",
                sql
            );
        }

        assert_eq!(
            table_after_keyword(
                "SELECT h.command FROM messages m JOIN 'command_history' h ON 1=1",
                "JOIN"
            ),
            Some("COMMAND_HISTORY".to_string())
        );
        assert_eq!(
            table_after_keyword("INSERT INTO 'users' (messages) VALUES ('x')", "INTO"),
            Some("USERS".to_string())
        );
        assert_eq!(
            token_texts("UPDATE 'USERS' SET PASSWORD_HASH = 'X'")
                .get(1)
                .cloned(),
            Some("USERS".to_string())
        );
    }

    /// The tokenizer no longer judges where a literal sits, so one in a value
    /// position reaches the stream too and the schema check gets to see it.
    /// That judgement is precisely what four bypasses in a row attacked.
    #[test]
    fn a_literal_in_a_value_position_reaches_the_token_stream() {
        assert_eq!(
            token_texts("SELECT ID FROM CONVERSATIONS WHERE TITLE IN ('USERS', 'SETTINGS')"),
            vec![
                "SELECT",
                "ID",
                "FROM",
                "CONVERSATIONS",
                "WHERE",
                "TITLE",
                "IN",
                "USERS",
                ",",
                "SETTINGS"
            ]
        );
        assert_eq!(
            token_texts("SELECT ID, 'USERS' FROM CONVERSATIONS"),
            vec!["SELECT", "ID", ",", "USERS", "FROM", "CONVERSATIONS"]
        );
    }

    #[test]
    fn a_quoted_run_is_a_name_and_never_a_keyword() {
        let tokens =
            sql_identifier_tokens("SELECT C.COMMAND FROM MESSAGES \"WHERE\", 'COMMAND_HISTORY' C");

        let alias = tokens
            .iter()
            .find(|t| t.text == "WHERE")
            .expect("the quoted alias is kept as a token");
        assert_eq!(alias.kind, TokenKind::Name);
        assert!(!alias.ends_from_clause());
        assert!(!alias.keyword("WHERE"));

        assert!(
            tokens.iter().any(|t| t.text == "COMMAND_HISTORY"),
            "the table named after the comma must reach the token stream: {:?}",
            tokens
        );
    }

    #[test]
    fn a_literal_after_in_keeps_its_name_with_or_without_a_value_list() {
        assert!(
            token_texts("SELECT ID FROM MESSAGES WHERE X IN 'COMMAND_HISTORY'")
                .contains(&"COMMAND_HISTORY".to_string())
        );
        assert!(
            token_texts("SELECT ID FROM MESSAGES WHERE X IN ('COMMAND_HISTORY')")
                .contains(&"COMMAND_HISTORY".to_string())
        );
    }

    /// The round-4 bypass, at the tokenizer. A clause-ending keyword inside a
    /// subquery belongs to THAT subquery: reading the `WHERE` of an ON
    /// constraint as the end of the enclosing FROM clause hid the comma that
    /// followed it, and with the comma the second table of a cross join.
    /// Verified by an independent reviewer against sqlite3 3.50.6, which
    /// returned the terminal history for this query.
    #[test]
    fn a_nested_clause_keyword_belongs_to_its_own_subquery() {
        let tokens = sql_identifier_tokens(
            "SELECT C.COMMAND FROM MESSAGES M JOIN MESSAGES N ON N.ID = (SELECT MAX(ID) FROM MESSAGES WHERE ID > 0), 'COMMAND_HISTORY' C LIMIT 5",
        );

        let nested_where = tokens
            .iter()
            .find(|t| t.text == "WHERE")
            .expect("the subquery keeps its WHERE");
        assert_eq!(nested_where.depth, 1);

        let comma = tokens
            .iter()
            .find(|t| t.is_comma())
            .expect("the outer table list keeps its comma");
        assert_eq!(comma.depth, 0);

        assert!(
            tokens.iter().any(|t| t.text == "COMMAND_HISTORY"),
            "the table named after the comma must reach the token stream: {:?}",
            tokens
        );
    }

    #[test]
    fn an_apostrophe_inside_a_quoted_identifier_does_not_erase_the_query() {
        for sql in [
            "SELECT command AS [x'] FROM command_history",
            "SELECT command AS `y'` FROM command_history",
            "SELECT command AS \"z'\" FROM command_history",
        ] {
            assert_eq!(
                table_after_keyword(sql, "FROM"),
                Some("COMMAND_HISTORY".to_string()),
                "expected {:?} to still expose its FROM clause",
                sql
            );
        }
    }

    /// A table reference carrying no identifier resolves to a name no allowlist
    /// holds, so the scanners refuse instead of reading past it to the alias.
    #[test]
    fn an_empty_quoted_table_reference_resolves_to_nothing_usable() {
        assert_eq!(
            table_after_keyword("SELECT * FROM '' messages", "FROM"),
            Some("?".to_string())
        );
    }
}

#[cfg(test)]
mod query_allowlist_tests {
    use super::*;
    use crate::core::agi::tools::ToolRegistry;
    use std::sync::Arc;

    fn executor() -> ToolExecutor {
        ToolExecutor::new(Arc::new(ToolRegistry::new().expect("registry")))
    }

    fn query(sql: &str) -> HashMap<String, Value> {
        let mut args = HashMap::new();
        args.insert("query".to_string(), json!(sql));
        args
    }

    /// F26: terminal history is written by SessionManager::send_input and its
    /// secret scrubber is pattern-based, so the table can hold live credentials.
    /// The tool is reachable by indirect prompt injection and its output goes to
    /// the configured provider, so the read must be refused outright.
    #[tokio::test]
    async fn db_query_refuses_command_history() {
        let result = executor()
            .execute_db_query_tool(&query("SELECT command FROM command_history"))
            .await
            .expect("guard returns a tool result, not an error");

        assert!(!result.success);
        assert!(result
            .error
            .unwrap_or_default()
            .contains("Access to table 'COMMAND_HISTORY' is not permitted"));
    }

    #[tokio::test]
    async fn db_query_refuses_settings() {
        let result = executor()
            .execute_db_query_tool(&query("SELECT value FROM settings"))
            .await
            .expect("guard returns a tool result, not an error");

        assert!(!result.success);
        assert!(result
            .error
            .unwrap_or_default()
            .contains("Access to table 'SETTINGS' is not permitted"));
    }

    /// A db_execute subquery used a second, stale copy of the allowlist that
    /// still carried both tables; both paths now read the one const.
    #[tokio::test]
    async fn db_execute_subquery_refuses_command_history() {
        let result = executor()
            .execute_db_execute_tool(&query(
                "INSERT INTO messages (content) SELECT command FROM command_history",
            ))
            .await
            .expect("guard returns a tool result, not an error");

        assert!(!result.success);
        assert!(result.error.unwrap_or_default().contains("not permitted"));
    }

    /// F26 residual: the allowlist removal only holds if the enforcement sees
    /// every table. A comma-separated table list put command_history back in
    /// reach of the model with one character; the direct form was refused while
    /// this one was allowed.
    #[tokio::test]
    async fn db_query_refuses_command_history_through_a_comma_join() {
        let result = executor()
            .execute_db_query_tool(&query(
                "SELECT c.command FROM messages, command_history c LIMIT 20",
            ))
            .await
            .expect("guard returns a tool result, not an error");

        assert!(!result.success);
        assert!(result
            .error
            .unwrap_or_default()
            .contains("Comma-separated table lists are not permitted"));
    }

    #[tokio::test]
    async fn db_execute_subquery_refuses_a_comma_joined_table() {
        let result = executor()
            .execute_db_execute_tool(&query(
                "INSERT INTO messages (content) SELECT c.command FROM messages, command_history c",
            ))
            .await
            .expect("guard returns a tool result, not an error");

        assert!(!result.success);
        assert!(result
            .error
            .unwrap_or_default()
            .contains("Comma-separated table lists are not permitted"));
    }

    #[tokio::test]
    async fn db_query_refuses_a_comma_list_hidden_behind_a_keyword_alias() {
        for sql in [
            "SELECT c.command FROM messages offset, command_history c",
            "SELECT c.command FROM messages window, command_history c",
        ] {
            let result = executor()
                .execute_db_query_tool(&query(sql))
                .await
                .expect("guard returns a tool result, not an error");

            assert!(!result.success);
            assert!(
                result
                    .error
                    .unwrap_or_default()
                    .contains("Comma-separated table lists are not permitted"),
                "expected {:?} to be refused",
                sql
            );
        }
    }

    #[tokio::test]
    async fn db_query_refuses_a_comma_list_hidden_behind_a_quoted_alias() {
        for sql in [
            "SELECT c.command FROM messages \"where\", 'command_history' c LIMIT 20",
            "SELECT c.command FROM messages [group], 'command_history' c",
            "SELECT c.command FROM messages `limit`, 'command_history' c",
            "SELECT c.command FROM messages AS \"limit\", 'command_history' c",
            "SELECT * FROM messages \"where\", 'command_history'",
            "SELECT c.command FROM messages \"where\", \"command_history\" c",
            "SELECT u.password_hash FROM messages \"where\", 'users' u",
            "SELECT s.v FROM conversations \"limit\", 'settings' s",
            "SELECT c.command FROM messages 'where', 'command_history' c",
            "SELECT c.command FROM (messages, 'command_history' c)",
        ] {
            let result = executor()
                .execute_db_query_tool(&query(sql))
                .await
                .expect("guard returns a tool result, not an error");

            assert!(!result.success, "expected {:?} to be refused", sql);
            assert!(
                result
                    .error
                    .unwrap_or_default()
                    .contains("Comma-separated table lists are not permitted"),
                "expected {:?} to be refused as a table list",
                sql
            );
        }
    }

    /// The write path shares the tokenizer, so the same quoted alias let the
    /// model copy the history into an allowlisted table and read it back.
    #[tokio::test]
    async fn db_execute_refuses_a_comma_list_hidden_behind_a_quoted_alias() {
        let result = executor()
            .execute_db_execute_tool(&query(
                "INSERT INTO messages (content) SELECT c.command FROM messages \"where\", 'command_history' c",
            ))
            .await
            .expect("guard returns a tool result, not an error");

        assert!(!result.success);
        assert!(result
            .error
            .unwrap_or_default()
            .contains("Comma-separated table lists are not permitted"));
    }

    #[tokio::test]
    async fn db_query_refuses_a_comma_list_hidden_behind_a_nested_clause_keyword() {
        for sql in [
            "SELECT c.command FROM messages m JOIN messages n ON n.id = (SELECT max(id) FROM messages WHERE id > 0), 'command_history' c LIMIT 5",
            "SELECT c.command FROM messages m JOIN messages n ON n.id IN (SELECT id FROM messages GROUP BY id), 'command_history' c",
            "SELECT u.password_hash FROM messages m JOIN messages n ON n.id = (SELECT max(id) FROM messages WHERE id > 0), 'users' u",
            "SELECT s.value FROM messages m JOIN messages n ON n.id = (SELECT max(id) FROM messages WHERE id > 0), 'settings' s",
            "SELECT a.token FROM messages m JOIN messages n ON n.id = (SELECT max(id) FROM messages GROUP BY id), 'auth_sessions' a",
        ] {
            let result = executor()
                .execute_db_query_tool(&query(sql))
                .await
                .expect("guard returns a tool result, not an error");

            assert!(!result.success, "expected {:?} to be refused", sql);
            assert!(
                result
                    .error
                    .unwrap_or_default()
                    .contains("Comma-separated table lists are not permitted"),
                "expected {:?} to be refused as a table list",
                sql
            );
        }
    }

    #[tokio::test]
    async fn db_execute_refuses_a_comma_list_hidden_behind_a_nested_clause_keyword() {
        for sql in [
            "INSERT INTO messages (content) SELECT c.command FROM messages m JOIN messages n ON n.id = (SELECT max(id) FROM messages WHERE id > 0), 'command_history' c",
            "INSERT INTO messages (content) SELECT u.password_hash FROM messages m JOIN messages n ON n.id = (SELECT max(id) FROM messages WHERE id > 0), 'users' u",
        ] {
            let result = executor()
                .execute_db_execute_tool(&query(sql))
                .await
                .expect("guard returns a tool result, not an error");

            assert!(!result.success, "expected {:?} to be refused", sql);
            assert!(
                result
                    .error
                    .unwrap_or_default()
                    .contains("Comma-separated table lists are not permitted"),
                "expected {:?} to be refused as a table list",
                sql
            );
        }
    }

    /// Every shape this bypass has taken, in one net. The assertion is
    /// deliberately vague about WHICH guard refuses and exact about the
    /// outcome: no hostile shape may reach the engine. With no Tauri app handle
    /// an ALLOWED query stops at "Database not available", so that message is
    /// the tell that a guard let one through.
    #[tokio::test]
    async fn no_known_table_hiding_shape_reaches_the_database() {
        for sql in [
            "SELECT command FROM command_history",
            "SELECT*FROM command_history",
            "SELECT * FROM main.command_history",
            "SELECT * FROM sqlite_master",
            "SELECT * FROM 'command_history'",
            "SELECT * FROM [command_history]",
            "SELECT * FROM ('command_history')",
            "SELECT command AS [x'] FROM command_history",
            "SELECT c.command FROM messages, command_history c",
            "SELECT c.command FROM messages offset, command_history c",
            "SELECT c.command FROM messages \"where\", 'command_history' c",
            "SELECT c.command FROM messages [group], 'command_history' c",
            "SELECT id FROM messages WHERE id IN (SELECT id FROM 'command_history')",
            "SELECT * FROM pragma_table_info('users')",
            "SELECT c.command FROM messages m JOIN messages n ON n.id = (SELECT max(id) FROM messages WHERE id > 0), 'command_history' c LIMIT 5",
            "SELECT c.command FROM messages m JOIN messages n ON n.id IN (SELECT id FROM messages GROUP BY id), 'command_history' c",
            "SELECT c.command FROM messages m JOIN messages n ON n.id = (SELECT max(id) FROM messages WHERE id IN (SELECT id FROM messages WHERE id > 0)), 'command_history' c",
            "SELECT c.command FROM messages m JOIN messages n ON n.id = (SELECT max(id) FROM messages \"where\" WHERE id > 0), 'command_history' c",
            "SELECT u.password_hash FROM messages m JOIN messages n ON n.id = (SELECT max(id) FROM messages WHERE id > 0), 'users' u",
            "SELECT * FROM messages m JOIN (SELECT id FROM messages) x ON 1 = 1, 'auth_sessions' a",
        ] {
            let result = executor()
                .execute_db_query_tool(&query(sql))
                .await
                .expect("guard returns a tool result, not an error");

            assert!(!result.success, "expected {:?} to be refused", sql);
            let error = result.error.unwrap_or_default();
            assert!(
                !error.contains("Database not available"),
                "{:?} reached the database: {}",
                sql,
                error
            );
        }
    }

    /// A pragma table-valued function reaches the schema of any table named in
    /// its argument, and the blocked-keyword scan does not see it because
    /// `pragma_table_info` is one word. The FROM allowlist does.
    #[tokio::test]
    async fn db_query_refuses_a_pragma_table_function() {
        let result = executor()
            .execute_db_query_tool(&query("SELECT * FROM pragma_table_info('command_history')"))
            .await
            .expect("guard returns a tool result, not an error");

        assert!(!result.success);
        assert!(result
            .error
            .unwrap_or_default()
            .contains("Access to table 'PRAGMA_TABLE_INFO' is not permitted"));
    }

    /// A scalar subquery sits inside the select list, not the FROM clause, so
    /// the comma beside it is ordinary SQL. Delimiting the clause by depth is
    /// what tells the two apart; the previous scan refused this.
    #[tokio::test]
    async fn db_query_still_allows_a_scalar_subquery_beside_a_select_list_comma() {
        let result = executor()
            .execute_db_query_tool(&query(
                "SELECT id, (SELECT count(*) FROM messages), title FROM conversations LIMIT 5",
            ))
            .await
            .expect("guard returns a tool result, not an error");

        assert!(!result.success);
        assert!(result
            .error
            .unwrap_or_default()
            .contains("Database not available"));
    }

    #[tokio::test]
    async fn blocked_operations_match_a_word_and_not_a_column_name() {
        let readable = executor()
            .execute_db_query_tool(&query(
                "SELECT id FROM conversations WHERE created_at > 0 AND deleted_at IS NULL ORDER BY updated_at",
            ))
            .await
            .expect("guard returns a tool result, not an error");
        assert!(readable
            .error
            .unwrap_or_default()
            .contains("Database not available"));

        let writable = executor()
            .execute_db_execute_tool(&query(
                "INSERT INTO messages (content, created_at) VALUES ('hello', 0)",
            ))
            .await
            .expect("guard returns a tool result, not an error");
        assert!(writable
            .error
            .unwrap_or_default()
            .contains("Database not available"));

        let ddl = executor()
            .execute_db_query_tool(&query("SELECT id FROM conversations UNION SELECT 1 PRAGMA"))
            .await
            .expect("guard returns a tool result, not an error");
        assert!(!ddl.success);
        assert!(ddl
            .error
            .unwrap_or_default()
            .contains("SQL operation 'PRAGMA' is not allowed"));
    }

    /// The refusal must be scoped to the FROM clause: commas in the select
    /// list, in function arguments, in `IN (...)` and in `ORDER BY` are
    /// ordinary SQL and must still reach the database.
    #[tokio::test]
    async fn db_query_still_allows_commas_outside_the_from_clause() {
        let result = executor()
            .execute_db_query_tool(&query(
                "SELECT id, substr(title, 1, 5) FROM conversations WHERE id IN (1, 2) ORDER BY id, title LIMIT 5",
            ))
            .await
            .expect("guard returns a tool result, not an error");

        assert!(!result.success);
        assert!(result
            .error
            .unwrap_or_default()
            .contains("Database not available"));
    }

    /// The second layer, checked against the schema the engine actually has:
    /// it does not care where the name appears, so a syntax that hides a table
    /// from the positional scan still cannot hide it from the token stream.
    #[test]
    fn the_schema_check_flags_a_forbidden_table_wherever_it_is_named() {
        let conn = rusqlite::Connection::open_in_memory().expect("in-memory db");
        conn.execute_batch(
            "CREATE TABLE messages (id INTEGER, content TEXT);
             CREATE TABLE command_history (command TEXT);",
        )
        .expect("schema");

        let hostile = sql_identifier_tokens("SELECT C.COMMAND FROM MESSAGES, COMMAND_HISTORY C");
        assert_eq!(
            first_forbidden_mention(&conn, &hostile, |table| ALLOWED_QUERY_TABLES
                .contains(&table))
            .expect("schema lookup"),
            Some("COMMAND_HISTORY".to_string())
        );

        let quoted =
            sql_identifier_tokens("SELECT MESSAGES.COMMAND FROM 'COMMAND_HISTORY' MESSAGES");
        assert_eq!(
            first_forbidden_mention(&conn, &quoted, |table| ALLOWED_QUERY_TABLES
                .contains(&table))
            .expect("schema lookup"),
            Some("COMMAND_HISTORY".to_string())
        );

        // The second half of the round-3 bypass: the literal naming the second
        // table of a comma list was erased, so the backstop had nothing to match
        // even though SQLite read it as the table.
        let quoted_alias = sql_identifier_tokens(
            "SELECT C.COMMAND FROM MESSAGES \"WHERE\", 'COMMAND_HISTORY' C LIMIT 20",
        );
        assert_eq!(
            first_forbidden_mention(&conn, &quoted_alias, |table| ALLOWED_QUERY_TABLES
                .contains(&table))
            .expect("schema lookup"),
            Some("COMMAND_HISTORY".to_string())
        );

        // Round 4. The clause-ending keyword moved INSIDE a subquery, which
        // cleared the tokenizer's "inside a FROM clause" flag while SQLite was
        // still reading the outer table list -- so the comma read as a value
        // comma and the literal after it was erased again. sqlite3 3.50.6
        // returned the history row for exactly this query.
        let nested_clause_keyword = sql_identifier_tokens(
            "SELECT C.COMMAND FROM MESSAGES M JOIN MESSAGES N ON N.ID = (SELECT MAX(ID) FROM MESSAGES WHERE ID > 0), 'COMMAND_HISTORY' C LIMIT 5",
        );
        assert_eq!(
            first_forbidden_mention(&conn, &nested_clause_keyword, |table| ALLOWED_QUERY_TABLES
                .contains(&table))
            .expect("schema lookup"),
            Some("COMMAND_HISTORY".to_string())
        );

        let in_operand =
            sql_identifier_tokens("SELECT ID FROM MESSAGES WHERE X IN 'COMMAND_HISTORY'");
        assert_eq!(
            first_forbidden_mention(&conn, &in_operand, |table| ALLOWED_QUERY_TABLES
                .contains(&table))
            .expect("schema lookup"),
            Some("COMMAND_HISTORY".to_string())
        );

        let ordinary =
            sql_identifier_tokens("SELECT ID FROM MESSAGES WHERE CONTENT LIKE '%COMMAND_HISTORY%'");
        assert_eq!(
            first_forbidden_mention(&conn, &ordinary, |table| ALLOWED_QUERY_TABLES
                .contains(&table))
            .expect("schema lookup"),
            None
        );

        // The cost of reading no position: a value that spells a forbidden
        // table EXACTLY is refused, because `x IN 'command_history'` really is a
        // table reference in SQLite and only position tells the two apart. The
        // refusal names the table, so the model can rephrase.
        let value_list = sql_identifier_tokens(
            "SELECT ID FROM MESSAGES WHERE TITLE IN ('COMMAND_HISTORY', 'USERS')",
        );
        assert_eq!(
            first_forbidden_mention(&conn, &value_list, |table| ALLOWED_QUERY_TABLES
                .contains(&table))
            .expect("schema lookup"),
            Some("COMMAND_HISTORY".to_string())
        );
    }

    #[tokio::test]
    async fn db_query_refuses_a_table_named_by_a_quoted_string() {
        for (sql, table) in [
            (
                "SELECT messages.command FROM 'command_history' messages LIMIT 20",
                "COMMAND_HISTORY",
            ),
            (
                "SELECT conversations.password_hash FROM 'users' conversations",
                "USERS",
            ),
            ("SELECT messages.value FROM 'settings' messages", "SETTINGS"),
            ("SELECT command FROM \"command_history\"", "COMMAND_HISTORY"),
            ("SELECT command FROM [command_history]", "COMMAND_HISTORY"),
            ("SELECT command FROM `command_history`", "COMMAND_HISTORY"),
            ("SELECT * FROM ('command_history')", "COMMAND_HISTORY"),
            (
                "SELECT h.command FROM messages h JOIN 'command_history' c ON 1=1",
                "COMMAND_HISTORY",
            ),
            (
                "SELECT id FROM messages WHERE id IN (SELECT id FROM 'command_history')",
                "COMMAND_HISTORY",
            ),
        ] {
            let result = executor()
                .execute_db_query_tool(&query(sql))
                .await
                .expect("guard returns a tool result, not an error");

            assert!(!result.success, "expected {:?} to be refused", sql);
            assert!(
                result
                    .error
                    .unwrap_or_default()
                    .contains(&format!("Access to table '{}' is not permitted", table)),
                "expected {:?} to be refused for {}",
                sql,
                table
            );
        }
    }

    /// The quoted-identifier form of the same class: an apostrophe inside
    /// `[...]` desynchronized the character scan, erasing the FROM clause so no
    /// table check ran while the engine still read command_history.
    #[tokio::test]
    async fn db_query_refuses_a_from_clause_hidden_behind_a_quoted_identifier() {
        let result = executor()
            .execute_db_query_tool(&query("SELECT command AS [x'] FROM command_history"))
            .await
            .expect("guard returns a tool result, not an error");

        assert!(!result.success);
        assert!(result
            .error
            .unwrap_or_default()
            .contains("Access to table 'COMMAND_HISTORY' is not permitted"));
    }

    /// The write path shares the tokenizer, so the same shape let the model copy
    /// history into an allowlisted table and read it back from there.
    #[tokio::test]
    async fn db_execute_refuses_a_quoted_table_in_a_subquery() {
        let result = executor()
            .execute_db_execute_tool(&query(
                "INSERT INTO messages (content) SELECT messages.command FROM 'command_history' messages",
            ))
            .await
            .expect("guard returns a tool result, not an error");

        assert!(!result.success);
        assert!(result
            .error
            .unwrap_or_default()
            .contains("Access to table 'COMMAND_HISTORY' is not permitted in subquery"));
    }

    /// And the write TARGET itself: quoting it moved the name out of the token
    /// the check reads, so `INSERT INTO 'users' (messages)` was checked against
    /// the column list instead of the table.
    #[tokio::test]
    async fn db_execute_refuses_a_quoted_write_target() {
        for sql in [
            "INSERT INTO 'users' (messages) VALUES ('x')",
            "UPDATE 'users' SET password_hash = 'x'",
            "DELETE FROM 'users' WHERE id = 1",
        ] {
            let result = executor()
                .execute_db_execute_tool(&query(sql))
                .await
                .expect("guard returns a tool result, not an error");

            assert!(!result.success, "expected {:?} to be refused", sql);
            assert!(
                result
                    .error
                    .unwrap_or_default()
                    .contains("'USERS' is not permitted"),
                "expected {:?} to be refused for USERS",
                sql
            );
        }
    }

    /// The boundary refuses a value only when it spells a forbidden table
    /// EXACTLY. A value that merely contains the name is a different string and
    /// still reaches the database, so ordinary text filters keep working.
    #[tokio::test]
    async fn db_query_still_allows_a_literal_that_merely_contains_a_table_name() {
        let result = executor()
            .execute_db_query_tool(&query(
                "SELECT id FROM conversations WHERE title LIKE '%users%' AND id IN (1, 2)",
            ))
            .await
            .expect("guard returns a tool result, not an error");

        assert!(!result.success);
        assert!(result
            .error
            .unwrap_or_default()
            .contains("Database not available"));
    }

    #[tokio::test]
    async fn db_query_still_allows_an_ordinary_table() {
        let result = executor()
            .execute_db_query_tool(&query("SELECT id FROM conversations"))
            .await
            .expect("guard returns a tool result, not an error");

        // No Tauri app handle in a unit test, so the allowlist passes and the
        // call stops at the database lookup instead of the guard.
        assert!(!result.success);
        assert!(result
            .error
            .unwrap_or_default()
            .contains("Database not available"));
    }
}

/// The guard checked against the engine it is guarding.
///
/// Every bypass this file has shipped was a divergence between what a guard read
/// and what SQLite reads, and each was caught only when a reviewer replayed the
/// SQL against a real database by hand. These tests do that in CI: each payload
/// must first prove it really reads a forbidden table (otherwise it pins
/// nothing), and only then is the production refusal chain required to refuse
/// it. A future tokenizer change that admits one fails here with the credential
/// SQLite handed back, instead of shipping.
#[cfg(test)]
mod guard_vs_sqlite_tests {
    use super::{db_execute_refusal, db_query_refusal};

    const CANARIES: &[&str] = &[
        "CANARY-BEARER-sk-live-9931",
        "CANARY-PASSWORD-HASH",
        "CANARY-SETTINGS-BLOB",
        "CANARY-REFRESH-TOKEN",
    ];

    /// The tables the allowlist admits, plus the four it exists to exclude:
    /// terminal history (F26), password hashes, the encrypted provider-key blob
    /// (SEV-DESK-10) and session tokens.
    fn seeded_db() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().expect("in-memory db");
        conn.execute_batch(
            "CREATE TABLE messages (id INTEGER PRIMARY KEY, content TEXT, created_at INTEGER);
             CREATE TABLE conversations (id INTEGER PRIMARY KEY, title TEXT);
             CREATE TABLE command_history (id INTEGER PRIMARY KEY, command TEXT, session_id TEXT);
             CREATE TABLE users (id INTEGER PRIMARY KEY, password_hash TEXT);
             CREATE TABLE settings (key TEXT, value TEXT);
             CREATE TABLE auth_sessions (id INTEGER PRIMARY KEY, token TEXT);
             INSERT INTO messages VALUES (1, 'hello', 0);
             INSERT INTO conversations VALUES (1, 'chat');
             INSERT INTO command_history VALUES (1, 'curl -H Authorization CANARY-BEARER-sk-live-9931', 's');
             INSERT INTO users VALUES (1, 'CANARY-PASSWORD-HASH');
             INSERT INTO settings VALUES ('provider_key', 'CANARY-SETTINGS-BLOB');
             INSERT INTO auth_sessions VALUES (1, 'CANARY-REFRESH-TOKEN');",
        )
        .expect("schema");
        conn
    }

    fn canary_returned_by(conn: &rusqlite::Connection, sql: &str) -> Option<String> {
        let mut stmt = match conn.prepare(sql) {
            Ok(stmt) => stmt,
            Err(_) => return None,
        };
        let columns = stmt.column_count();
        let mut rows = match stmt.query([]) {
            Ok(rows) => rows,
            Err(_) => return None,
        };

        while let Ok(Some(row)) = rows.next() {
            for column in 0..columns {
                if let Ok(rusqlite::types::Value::Text(text)) =
                    row.get::<_, rusqlite::types::Value>(column)
                {
                    if let Some(canary) = CANARIES.iter().find(|canary| text.contains(**canary)) {
                        return Some((*canary).to_string());
                    }
                }
            }
        }

        None
    }

    /// Shapes verified against sqlite3 3.50.6 to return the seeded credential.
    const READS_A_FORBIDDEN_TABLE: &[&str] = &[
        "SELECT command FROM command_history",
        "SELECT*FROM command_history",
        "SELECT c.command FROM messages, command_history c LIMIT 20",
        "SELECT messages.command FROM 'command_history' messages LIMIT 20",
        "SELECT command FROM [command_history]",
        "SELECT * FROM ('command_history')",
        "SELECT command AS [x'] FROM command_history",
        "SELECT (SELECT command FROM command_history LIMIT 1) FROM messages",
        "SELECT c.command FROM messages offset, command_history c",
        "SELECT c.command FROM messages window, command_history c",
        "SELECT c.command FROM messages filter, 'command_history' c",
        "SELECT c.command FROM messages \"where\", 'command_history' c LIMIT 20",
        "SELECT c.command FROM messages m JOIN messages n ON n.id = (SELECT max(id) FROM messages WHERE id > 0), 'command_history' c LIMIT 5",
        "SELECT c.command FROM messages m JOIN messages n ON n.id IN (SELECT id FROM messages GROUP BY id), 'command_history' c",
        "SELECT c.command FROM messages m JOIN messages n ON n.id = (SELECT max(id) FROM messages \"where\" WHERE id > 0), 'command_history' c",
        "SELECT u.password_hash FROM messages m JOIN messages n ON n.id = (SELECT max(id) FROM messages WHERE id > 0), 'users' u",
        "SELECT s.value FROM messages m JOIN messages n ON n.id = (SELECT max(id) FROM messages WHERE id > 0), 'settings' s",
        "SELECT a.token FROM messages m JOIN messages n ON n.id = (SELECT max(id) FROM messages GROUP BY id), 'auth_sessions' a",
        "SELECT * FROM messages m JOIN (SELECT id FROM messages) x ON 1 = 1, 'auth_sessions' a",
    ];

    /// The write path stages the same rows into an allowlisted table the model
    /// then reads with an ordinary SELECT, so it needs the same net.
    const COPIES_A_FORBIDDEN_TABLE: &[&str] = &[
        "INSERT INTO messages (content) SELECT command FROM command_history",
        "INSERT INTO messages (content) SELECT c.command FROM messages, command_history c",
        "INSERT INTO messages (content) SELECT messages.command FROM 'command_history' messages",
        "INSERT INTO messages (content) SELECT c.command FROM messages \"where\", 'command_history' c",
        "INSERT INTO messages (content) SELECT c.command FROM messages filter, 'command_history' c",
        "INSERT INTO messages (content) SELECT c.command FROM messages m JOIN messages n ON n.id = (SELECT max(id) FROM messages WHERE id > 0), 'command_history' c",
        "INSERT INTO messages (content) SELECT u.password_hash FROM messages m JOIN messages n ON n.id = (SELECT max(id) FROM messages WHERE id > 0), 'users' u",
        "UPDATE messages SET content = (SELECT command FROM command_history LIMIT 1)",
    ];

    #[test]
    fn every_read_that_returns_a_credential_is_refused() {
        let conn = seeded_db();

        for sql in READS_A_FORBIDDEN_TABLE {
            let canary = canary_returned_by(&conn, sql).unwrap_or_else(|| {
                panic!(
                    "{:?} no longer reads a forbidden table, so it pins nothing, fix the payload",
                    sql
                )
            });
            assert!(
                db_query_refusal(sql, Some(&conn)).is_some(),
                "the guard admitted {:?}, which returns {} from sqlite",
                sql,
                canary
            );
        }
    }

    #[test]
    fn every_write_that_stages_a_credential_is_refused() {
        for sql in COPIES_A_FORBIDDEN_TABLE {
            let live = seeded_db();
            live.execute(sql, [])
                .unwrap_or_else(|e| panic!("{:?} is not live SQL: {}", sql, e));
            let staged = canary_returned_by(&live, "SELECT content FROM messages")
                .unwrap_or_else(|| {
                    panic!(
                        "{:?} no longer copies a forbidden table, so it pins nothing, fix the payload",
                        sql
                    )
                });

            let guarded = seeded_db();
            assert!(
                db_execute_refusal(sql, Some(&guarded)).is_some(),
                "the guard admitted {:?}, which stages {} into messages",
                sql,
                staged
            );
        }
    }

    /// The other half of the boundary: the queries the tool exists to serve must
    /// still reach the engine, or a refusal that fails closed on everything
    /// would pass the tests above while breaking the product.
    #[test]
    fn ordinary_queries_still_run() {
        let conn = seeded_db();

        for sql in [
            "SELECT id, content FROM messages WHERE created_at > 0 ORDER BY id LIMIT 5",
            "SELECT m.id, c.title FROM messages m JOIN conversations c ON c.id = m.id",
            "SELECT id, (SELECT count(*) FROM messages), title FROM conversations",
            "SELECT id, substr(content, 1, 5) FROM messages WHERE id IN (1, 2) ORDER BY id, content",
        ] {
            assert_eq!(db_query_refusal(sql, Some(&conn)), None, "refused {:?}", sql);
            conn.prepare(sql)
                .unwrap_or_else(|e| panic!("{:?} is not valid SQL: {}", sql, e));
        }

        assert_eq!(
            db_execute_refusal(
                "INSERT INTO messages (content, created_at) VALUES ('hello', 0)",
                Some(&conn)
            ),
            None
        );
    }
}
