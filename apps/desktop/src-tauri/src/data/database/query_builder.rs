use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::sys::error::{Error, Result};

/// Validates a complete SQL string for dangerous patterns.
/// Returns `Err` if the SQL contains dangerous operations like DROP TABLE,
/// DELETE without WHERE, TRUNCATE, etc. This is a defense-in-depth measure
/// beyond the per-component validation performed by other functions.
fn validate_sql(sql: &str) -> Result<()> {
    let upper = sql.to_uppercase();

    // Dangerous DDL/DML patterns that should never pass through the query builder
    let dangerous_patterns = [
        ("DROP TABLE", "DROP TABLE is not allowed"),
        ("DROP DATABASE", "DROP DATABASE is not allowed"),
        ("TRUNCATE", "TRUNCATE is not allowed"),
        (
            "ALTER TABLE",
            "ALTER TABLE is not allowed through the query builder",
        ),
    ];

    for (pattern, message) in &dangerous_patterns {
        if upper.contains(pattern) {
            return Err(Error::Other(format!("Dangerous SQL rejected: {}", message)));
        }
    }

    // Detect DELETE without WHERE clause (dangerous mass deletion)
    if upper.contains("DELETE") && !upper.contains("WHERE") {
        // Only flag DELETE FROM ... without WHERE (not substrings in other contexts)
        let trimmed = upper.trim();
        if trimmed.starts_with("DELETE") {
            return Err(Error::Other(
                "Dangerous SQL rejected: DELETE without WHERE clause is not allowed".to_string(),
            ));
        }
    }

    Ok(())
}

/// Whitelist of allowed table names for extra safety.
/// Tables not in this list will still work but trigger a warning log.
const ALLOWED_TABLES: &[&str] = &[
    "users",
    "sessions",
    "chat_messages",
    "conversations",
    "agents",
    "tools",
    "workflows",
    "tasks",
    "audit_events",
    "settings",
    "credentials",
    "mcp_servers",
    "scheduled_jobs",
    "attachments",
];

/// Validates that a table name is in the whitelist.
/// Returns `Err` if the table is not in the allowlist, blocking execution.
fn validate_table_whitelist(table: &str) -> Result<()> {
    // Extract base table name (handle schema.table format)
    let base_table = table.split('.').next_back().unwrap_or(table);
    if !ALLOWED_TABLES.contains(&base_table.to_lowercase().as_str()) {
        return Err(Error::Other(format!(
            "Table '{}' is not in the allowed tables list",
            table
        )));
    }
    Ok(())
}

fn validate_sql_identifier(identifier: &str) -> Result<()> {
    if identifier.is_empty() {
        return Err(Error::Other("SQL identifier cannot be empty".to_string()));
    }

    let upper = identifier.to_uppercase();
    let dangerous_keywords = [
        "DROP", "DELETE", "TRUNCATE", "ALTER", "EXEC", "EXECUTE", "UNION", "INSERT", "UPDATE",
        "--", ";",
    ];

    for keyword in &dangerous_keywords {
        if upper.contains(keyword) {
            return Err(Error::Other(format!(
                "SQL identifier contains dangerous keyword: {}",
                keyword
            )));
        }
    }

    for ch in identifier.chars() {
        if !ch.is_alphanumeric() && ch != '_' && ch != '.' && ch != '*' {
            return Err(Error::Other(format!(
                "SQL identifier contains invalid character: '{}'",
                ch
            )));
        }
    }

    Ok(())
}

/// Escapes a string value for safe use in SQL queries.
/// This provides basic protection against SQL injection by escaping single quotes.
fn escape_sql_value(value: &str) -> String {
    // Escape single quotes by doubling them (SQL standard)
    value.replace('\'', "''")
}

/// Validates that a value doesn't contain dangerous SQL patterns.
fn validate_sql_value(value: &str) -> Result<()> {
    let upper = value.to_uppercase();

    // Check for SQL injection patterns
    let dangerous_patterns = [
        ";",
        "--",
        "/*",
        "*/",
        "xp_",
        "sp_",
        "exec",
        "execute",
        "union select",
        "drop table",
        "insert into",
        "delete from",
    ];

    for pattern in dangerous_patterns {
        if upper.contains(pattern) {
            return Err(Error::Other(format!(
                "SQL value contains dangerous pattern: {}",
                pattern
            )));
        }
    }

    Ok(())
}

fn validate_where_clause(clause: &str) -> Result<()> {
    if clause.is_empty() {
        return Ok(());
    }

    let upper = clause.to_uppercase();

    // SECURITY: Comprehensive SQL injection pattern blocking (CodeRabbit H9 fix)
    // Previous version only blocked "--", "EXEC", "EXECUTE" which was insufficient
    let dangerous_patterns = [
        "--",            // SQL comment injection
        "/*",            // Block comment injection
        "*/",            // Block comment close
        "EXEC",          // Execute stored procedure
        "EXECUTE",       // Execute stored procedure
        "UNION",         // UNION-based injection
        "INTO OUTFILE",  // File write injection
        "INTO DUMPFILE", // File write injection
        "LOAD_FILE",     // File read injection
        "SLEEP(",        // Time-based blind injection
        "BENCHMARK(",    // Time-based blind injection
        "WAITFOR",       // MSSQL time-based injection
        ";",             // Statement terminator (stacked queries)
        "0x",            // Hex-encoded injection
        "CHAR(",         // Character encoding bypass
        "CONCAT(",       // String concatenation bypass
    ];

    for pattern in &dangerous_patterns {
        if upper.contains(pattern) {
            return Err(Error::Other(format!(
                "WHERE clause contains dangerous pattern: {}",
                pattern
            )));
        }
    }

    // Check for tautological conditions (OR 1=1, OR 'a'='a', etc.)
    // These are classic SQL injection patterns
    let tautology_re = regex::Regex::new(r"(?i)\bOR\b\s+\d+\s*=\s*\d+")
        .map_err(|e| Error::Other(format!("Regex error: {}", e)))?;
    if tautology_re.is_match(clause) {
        return Err(Error::Other(
            "WHERE clause contains tautological condition (OR n=n)".to_string(),
        ));
    }

    // Check for string tautology (OR 'x'='x')
    let string_tautology_re = regex::Regex::new(r"(?i)\bOR\b\s+'[^']*'\s*=\s*'[^']*'")
        .map_err(|e| Error::Other(format!("Regex error: {}", e)))?;
    if string_tautology_re.is_match(clause) {
        return Err(Error::Other(
            "WHERE clause contains tautological string condition".to_string(),
        ));
    }

    // Check for subquery injection
    let subquery_re = regex::Regex::new(r"(?i)\(\s*SELECT\b")
        .map_err(|e| Error::Other(format!("Regex error: {}", e)))?;
    if subquery_re.is_match(clause) {
        return Err(Error::Other(
            "WHERE clause contains subquery which is not allowed".to_string(),
        ));
    }

    Ok(())
}

#[derive(Debug, Clone)]
pub struct QueryBuilder {
    query_type: QueryType,
}

#[derive(Debug, Clone)]
enum QueryType {
    Select(SelectQuery),
    Insert(InsertQuery),
    Update(UpdateQuery),
    Delete(DeleteQuery),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SelectQuery {
    pub columns: Vec<String>,
    pub table: String,
    pub where_clause: Option<String>,
    pub order_by: Option<Vec<OrderBy>>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
    pub joins: Vec<Join>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InsertQuery {
    pub table: String,
    pub columns: Vec<String>,
    pub values: Vec<Vec<String>>,
    pub returning: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateQuery {
    pub table: String,
    pub set_values: HashMap<String, String>,
    pub where_clause: Option<String>,
    pub returning: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeleteQuery {
    pub table: String,
    pub where_clause: Option<String>,
    pub returning: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderBy {
    pub column: String,
    pub direction: OrderDirection,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum OrderDirection {
    Asc,
    Desc,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Join {
    pub join_type: JoinType,
    pub table: String,
    pub on_condition: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum JoinType {
    Inner,
    Left,
    Right,
    Full,
}

impl QueryBuilder {
    pub fn select(table: &str) -> Self {
        Self {
            query_type: QueryType::Select(SelectQuery {
                columns: vec!["*".to_string()],
                table: table.to_string(),
                where_clause: None,
                order_by: None,
                limit: None,
                offset: None,
                joins: Vec::new(),
            }),
        }
    }

    pub fn insert(table: &str) -> Self {
        Self {
            query_type: QueryType::Insert(InsertQuery {
                table: table.to_string(),
                columns: Vec::new(),
                values: Vec::new(),
                returning: None,
            }),
        }
    }

    pub fn update(table: &str) -> Self {
        Self {
            query_type: QueryType::Update(UpdateQuery {
                table: table.to_string(),
                set_values: HashMap::new(),
                where_clause: None,
                returning: None,
            }),
        }
    }

    pub fn delete(table: &str) -> Self {
        Self {
            query_type: QueryType::Delete(DeleteQuery {
                table: table.to_string(),
                where_clause: None,
                returning: None,
            }),
        }
    }

    pub fn columns(mut self, columns: &[&str]) -> Self {
        if let QueryType::Select(ref mut query) = self.query_type {
            query.columns = columns.iter().map(|s| s.to_string()).collect();
        }
        self
    }

    pub fn where_clause(mut self, condition: &str) -> Self {
        match &mut self.query_type {
            QueryType::Select(query) => query.where_clause = Some(condition.to_string()),
            QueryType::Update(query) => query.where_clause = Some(condition.to_string()),
            QueryType::Delete(query) => query.where_clause = Some(condition.to_string()),
            _ => {}
        }
        self
    }

    pub fn order_by(mut self, column: &str, direction: OrderDirection) -> Self {
        if let QueryType::Select(ref mut query) = self.query_type {
            if query.order_by.is_none() {
                query.order_by = Some(Vec::new());
            }
            if let Some(ref mut order_by) = query.order_by {
                order_by.push(OrderBy {
                    column: column.to_string(),
                    direction,
                });
            }
        }
        self
    }

    pub fn limit(mut self, limit: u32) -> Self {
        if let QueryType::Select(ref mut query) = self.query_type {
            query.limit = Some(limit);
        }
        self
    }

    pub fn offset(mut self, offset: u32) -> Self {
        if let QueryType::Select(ref mut query) = self.query_type {
            query.offset = Some(offset);
        }
        self
    }

    pub fn join(mut self, join_type: JoinType, table: &str, on_condition: &str) -> Self {
        if let QueryType::Select(ref mut query) = self.query_type {
            query.joins.push(Join {
                join_type,
                table: table.to_string(),
                on_condition: on_condition.to_string(),
            });
        }
        self
    }

    pub fn into_columns(mut self, columns: &[&str]) -> Self {
        if let QueryType::Insert(ref mut query) = self.query_type {
            query.columns = columns.iter().map(|s| s.to_string()).collect();
        }
        self
    }

    pub fn values(mut self, values: &[&str]) -> Self {
        if let QueryType::Insert(ref mut query) = self.query_type {
            query
                .values
                .push(values.iter().map(|s| s.to_string()).collect());
        }
        self
    }

    pub fn set(mut self, column: &str, value: &str) -> Self {
        if let QueryType::Update(ref mut query) = self.query_type {
            query
                .set_values
                .insert(column.to_string(), value.to_string());
        }
        self
    }

    pub fn returning(mut self, columns: &[&str]) -> Self {
        match &mut self.query_type {
            QueryType::Insert(query) => {
                query.returning = Some(columns.iter().map(|s| s.to_string()).collect());
            }
            QueryType::Update(query) => {
                query.returning = Some(columns.iter().map(|s| s.to_string()).collect());
            }
            QueryType::Delete(query) => {
                query.returning = Some(columns.iter().map(|s| s.to_string()).collect());
            }
            _ => {}
        }
        self
    }

    /// Build the SQL string for the current query.
    ///
    /// # Security Warning (H5)
    /// For `INSERT` and `UPDATE` operations this method uses string interpolation
    /// via `escape_sql_value`. While values are validated and escaped, string-based
    /// escaping can be bypassed by edge-case inputs or encoding tricks.
    /// **Prefer `build_parameterized()`** for write operations, which emits
    /// `?`-placeholder SQL and returns the parameter values separately for binding
    /// by the SQLite driver — eliminating the injection surface entirely. Use this
    /// method only for `SELECT` queries or for display/logging where the result is
    /// not executed directly.
    pub fn build(&self) -> Result<String> {
        match &self.query_type {
            QueryType::Insert(query) => {
                tracing::warn!(
                    "QueryBuilder::build() called for INSERT on table '{}'. \
                     Prefer build_parameterized() to avoid string interpolation.",
                    query.table
                );
            }
            QueryType::Update(query) => {
                tracing::warn!(
                    "QueryBuilder::build() called for UPDATE on table '{}'. \
                     Prefer build_parameterized() to avoid string interpolation.",
                    query.table
                );
            }
            _ => {}
        }

        let sql = match &self.query_type {
            QueryType::Select(query) => self.build_select(query),
            QueryType::Insert(query) => self.build_insert(query),
            QueryType::Update(query) => self.build_update(query),
            QueryType::Delete(query) => self.build_delete(query),
        }?;

        // Defense-in-depth: validate the final SQL for dangerous patterns
        validate_sql(&sql)?;

        Ok(sql)
    }

    fn build_select(&self, query: &SelectQuery) -> Result<String> {
        validate_sql_identifier(&query.table)?;
        validate_table_whitelist(&query.table)?;

        for column in &query.columns {
            validate_sql_identifier(column)?;
        }

        let mut sql = format!("SELECT {} FROM {}", query.columns.join(", "), query.table);

        for join in &query.joins {
            validate_sql_identifier(&join.table)?;
            validate_where_clause(&join.on_condition)?;

            let join_keyword = match join.join_type {
                JoinType::Inner => "INNER JOIN",
                JoinType::Left => "LEFT JOIN",
                JoinType::Right => "RIGHT JOIN",
                JoinType::Full => "FULL JOIN",
            };
            sql.push_str(&format!(
                " {} {} ON {}",
                join_keyword, join.table, join.on_condition
            ));
        }

        if let Some(ref where_clause) = query.where_clause {
            validate_where_clause(where_clause)?;
            sql.push_str(&format!(" WHERE {}", where_clause));
        }

        if let Some(ref order_by) = query.order_by {
            let order_clauses: Vec<String> = order_by
                .iter()
                .map(|o| {
                    validate_sql_identifier(&o.column).ok()?;
                    let dir = match o.direction {
                        OrderDirection::Asc => "ASC",
                        OrderDirection::Desc => "DESC",
                    };
                    Some(format!("{} {}", o.column, dir))
                })
                .collect::<Option<Vec<_>>>()
                .ok_or_else(|| Error::Other("Invalid ORDER BY column".to_string()))?;
            sql.push_str(&format!(" ORDER BY {}", order_clauses.join(", ")));
        }

        if let Some(limit) = query.limit {
            sql.push_str(&format!(" LIMIT {}", limit));
        }

        if let Some(offset) = query.offset {
            sql.push_str(&format!(" OFFSET {}", offset));
        }

        Ok(sql)
    }

    fn build_insert(&self, query: &InsertQuery) -> Result<String> {
        if query.columns.is_empty() || query.values.is_empty() {
            return Err(Error::Other(
                "INSERT requires columns and values".to_string(),
            ));
        }

        validate_sql_identifier(&query.table)?;
        validate_table_whitelist(&query.table)?;

        for column in &query.columns {
            validate_sql_identifier(column)?;
        }

        // SECURITY NOTE: This method interpolates escaped values into SQL.
        // For user-controlled input, callers SHOULD use build_parameterized()
        // instead, which produces proper placeholder-based queries.
        // Validate each value to reject dangerous patterns before interpolation.
        for row in &query.values {
            for v in row {
                // Strip surrounding quotes for validation if present
                let check_val = if v.starts_with('\'') && v.ends_with('\'') && v.len() >= 2 {
                    &v[1..v.len() - 1]
                } else {
                    v.as_str()
                };
                validate_sql_value(check_val)?;
            }
        }

        let columns = query.columns.join(", ");
        let values_list: Vec<String> = query
            .values
            .iter()
            .map(|row| {
                // Escape each value in the row to prevent SQL injection
                let escaped: Vec<String> = row
                    .iter()
                    .map(|v| {
                        // Check if value looks like a literal (starts/ends with quote)
                        // or is a number - in those cases, escape appropriately
                        if v.starts_with('\'') && v.ends_with('\'') {
                            // Already quoted - just escape internal quotes
                            let inner = &v[1..v.len() - 1];
                            format!("'{}'", escape_sql_value(inner))
                        } else if v.chars().all(|c| c.is_ascii_digit() || c == '.') {
                            // Numeric value - pass through
                            v.clone()
                        } else {
                            // Treat as string literal
                            format!("'{}'", escape_sql_value(v))
                        }
                    })
                    .collect();
                format!("({})", escaped.join(", "))
            })
            .collect();

        let mut sql = format!(
            "INSERT INTO {} ({}) VALUES {}",
            query.table,
            columns,
            values_list.join(", ")
        );

        if let Some(ref returning) = query.returning {
            for col in returning {
                validate_sql_identifier(col)?;
            }
            sql.push_str(&format!(" RETURNING {}", returning.join(", ")));
        }

        Ok(sql)
    }

    fn build_update(&self, query: &UpdateQuery) -> Result<String> {
        if query.set_values.is_empty() {
            return Err(Error::Other("UPDATE requires SET values".to_string()));
        }

        validate_sql_identifier(&query.table)?;
        validate_table_whitelist(&query.table)?;

        // SECURITY NOTE: This method interpolates escaped values into SQL.
        // For user-controlled input, callers SHOULD use build_parameterized()
        // instead, which produces proper placeholder-based queries.
        // Validate each value to reject dangerous patterns before interpolation.
        for val in query.set_values.values() {
            let check_val = if val.starts_with('\'') && val.ends_with('\'') && val.len() >= 2 {
                &val[1..val.len() - 1]
            } else {
                val.as_str()
            };
            validate_sql_value(check_val)?;
        }

        let set_clauses: Vec<String> = query
            .set_values
            .iter()
            .map(|(col, val)| {
                validate_sql_identifier(col).ok()?;
                // Escape the value to prevent SQL injection
                let escaped_val = if val.starts_with('\'') && val.ends_with('\'') {
                    // Already quoted - just escape internal quotes
                    let inner = &val[1..val.len() - 1];
                    format!("'{}'", escape_sql_value(inner))
                } else if val
                    .chars()
                    .all(|c| c.is_ascii_digit() || c == '.' || c == '-')
                {
                    // Numeric value - pass through
                    val.clone()
                } else {
                    // Treat as string literal
                    format!("'{}'", escape_sql_value(val))
                };
                Some(format!("{} = {}", col, escaped_val))
            })
            .collect::<Option<Vec<_>>>()
            .ok_or_else(|| Error::Other("Invalid column name in SET clause".to_string()))?;

        let mut sql = format!("UPDATE {} SET {}", query.table, set_clauses.join(", "));

        if let Some(ref where_clause) = query.where_clause {
            validate_where_clause(where_clause)?;
            sql.push_str(&format!(" WHERE {}", where_clause));
        }

        if let Some(ref returning) = query.returning {
            for col in returning {
                validate_sql_identifier(col)?;
            }
            sql.push_str(&format!(" RETURNING {}", returning.join(", ")));
        }

        Ok(sql)
    }

    fn build_delete(&self, query: &DeleteQuery) -> Result<String> {
        validate_sql_identifier(&query.table)?;
        validate_table_whitelist(&query.table)?;

        let mut sql = format!("DELETE FROM {}", query.table);

        if let Some(ref where_clause) = query.where_clause {
            validate_where_clause(where_clause)?;
            sql.push_str(&format!(" WHERE {}", where_clause));
        }

        if let Some(ref returning) = query.returning {
            for col in returning {
                validate_sql_identifier(col)?;
            }
            sql.push_str(&format!(" RETURNING {}", returning.join(", ")));
        }

        Ok(sql)
    }

    /// Deprecated: This method does not actually extract parameters and returns
    /// an empty params vec, making it misleading. Use `build_parameterized()`
    /// instead, which correctly extracts values into parameter placeholders.
    #[deprecated(
        note = "build_with_params returns empty params, use build_parameterized() instead"
    )]
    pub fn build_with_params(&self) -> Result<(String, Vec<String>)> {
        Err(Error::Other(
            "build_with_params is deprecated: it does not extract parameters. \
             Use build_parameterized() instead for safe parameterized queries."
                .to_string(),
        ))
    }

    /// Build a parameterized INSERT query that returns (sql_with_placeholders, param_values).
    /// This is the SAFE alternative to build() for INSERT/UPDATE/DELETE operations.
    /// Callers should use execute_prepared() with the returned params instead of execute_query().
    /// (CodeRabbit C3 fix: QueryBuilder must support parameterized output)
    pub fn build_parameterized(&self) -> Result<(String, Vec<String>)> {
        match &self.query_type {
            QueryType::Select(query) => {
                // SELECT queries don't have user-provided values to parameterize
                let sql = self.build_select(query)?;
                Ok((sql, Vec::new()))
            }
            QueryType::Insert(query) => self.build_insert_parameterized(query),
            QueryType::Update(query) => self.build_update_parameterized(query),
            QueryType::Delete(query) => {
                // DELETE queries don't have SET values to parameterize
                // The where_clause is still validated via validate_where_clause
                let sql = self.build_delete(query)?;
                Ok((sql, Vec::new()))
            }
        }
    }

    fn build_insert_parameterized(&self, query: &InsertQuery) -> Result<(String, Vec<String>)> {
        if query.columns.is_empty() || query.values.is_empty() {
            return Err(Error::Other(
                "INSERT requires columns and values".to_string(),
            ));
        }

        validate_sql_identifier(&query.table)?;
        validate_table_whitelist(&query.table)?;

        for column in &query.columns {
            validate_sql_identifier(column)?;
        }

        let columns = query.columns.join(", ");
        let mut params = Vec::new();
        let mut param_index = 1;

        let values_list: Vec<String> = query
            .values
            .iter()
            .map(|row| {
                let placeholders: Vec<String> = row
                    .iter()
                    .map(|v| {
                        let placeholder = format!("${}", param_index);
                        param_index += 1;
                        params.push(v.clone());
                        placeholder
                    })
                    .collect();
                format!("({})", placeholders.join(", "))
            })
            .collect();

        let mut sql = format!(
            "INSERT INTO {} ({}) VALUES {}",
            query.table,
            columns,
            values_list.join(", ")
        );

        if let Some(ref returning) = query.returning {
            for col in returning {
                validate_sql_identifier(col)?;
            }
            sql.push_str(&format!(" RETURNING {}", returning.join(", ")));
        }

        Ok((sql, params))
    }

    fn build_update_parameterized(&self, query: &UpdateQuery) -> Result<(String, Vec<String>)> {
        if query.set_values.is_empty() {
            return Err(Error::Other("UPDATE requires SET values".to_string()));
        }

        validate_sql_identifier(&query.table)?;
        validate_table_whitelist(&query.table)?;

        let mut params = Vec::new();
        let mut param_index = 1;

        let set_clauses: Vec<String> = query
            .set_values
            .iter()
            .map(|(col, val)| {
                validate_sql_identifier(col).ok()?;
                let placeholder = format!("${}", param_index);
                param_index += 1;
                params.push(val.clone());
                Some(format!("{} = {}", col, placeholder))
            })
            .collect::<Option<Vec<_>>>()
            .ok_or_else(|| Error::Other("Invalid column name in SET clause".to_string()))?;

        let mut sql = format!("UPDATE {} SET {}", query.table, set_clauses.join(", "));

        if let Some(ref where_clause) = query.where_clause {
            validate_where_clause(where_clause)?;
            sql.push_str(&format!(" WHERE {}", where_clause));
        }

        if let Some(ref returning) = query.returning {
            for col in returning {
                validate_sql_identifier(col)?;
            }
            sql.push_str(&format!(" RETURNING {}", returning.join(", ")));
        }

        Ok((sql, params))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_select_all() {
        let query = QueryBuilder::select("users").build().unwrap();
        assert_eq!(query, "SELECT * FROM users");
    }

    #[test]
    fn test_select_columns() {
        let query = QueryBuilder::select("users")
            .columns(&["id", "name", "email"])
            .build()
            .unwrap();
        assert_eq!(query, "SELECT id, name, email FROM users");
    }

    #[test]
    fn test_select_with_where() {
        let query = QueryBuilder::select("users")
            .columns(&["id", "name"])
            .where_clause("age > 18")
            .build()
            .unwrap();
        assert_eq!(query, "SELECT id, name FROM users WHERE age > 18");
    }

    #[test]
    fn test_select_with_order_by() {
        let query = QueryBuilder::select("users")
            .columns(&["id", "name"])
            .order_by("name", OrderDirection::Asc)
            .build()
            .unwrap();
        assert_eq!(query, "SELECT id, name FROM users ORDER BY name ASC");
    }

    #[test]
    fn test_select_with_limit_offset() {
        let query = QueryBuilder::select("users")
            .limit(10)
            .offset(20)
            .build()
            .unwrap();
        assert_eq!(query, "SELECT * FROM users LIMIT 10 OFFSET 20");
    }

    #[test]
    fn test_select_with_join() {
        let query = QueryBuilder::select("users")
            .columns(&["users.id", "users.name", "orders.total"])
            .join(JoinType::Inner, "orders", "users.id = orders.user_id")
            .build()
            .unwrap();
        assert_eq!(
            query,
            "SELECT users.id, users.name, orders.total FROM users INNER JOIN orders ON users.id = orders.user_id"
        );
    }

    #[test]
    fn test_insert() {
        let query = QueryBuilder::insert("users")
            .into_columns(&["name", "email"])
            .values(&["'Alice'", "'alice@example.com'"])
            .build()
            .unwrap();
        assert_eq!(
            query,
            "INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com')"
        );
    }

    #[test]
    fn test_insert_multiple_rows() {
        let query = QueryBuilder::insert("users")
            .into_columns(&["name", "email"])
            .values(&["'Alice'", "'alice@example.com'"])
            .values(&["'Bob'", "'bob@example.com'"])
            .build()
            .unwrap();
        assert_eq!(
            query,
            "INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com'), ('Bob', 'bob@example.com')"
        );
    }

    #[test]
    fn test_update() {
        let query = QueryBuilder::update("users")
            .set("name", "'Alice Updated'")
            .set("email", "'alice_new@example.com'")
            .where_clause("id = 1")
            .build()
            .unwrap();

        assert!(
            query == "UPDATE users SET name = 'Alice Updated', email = 'alice_new@example.com' WHERE id = 1"
            || query == "UPDATE users SET email = 'alice_new@example.com', name = 'Alice Updated' WHERE id = 1"
        );
    }

    #[test]
    fn test_delete() {
        let query = QueryBuilder::delete("users")
            .where_clause("id = 1")
            .build()
            .unwrap();
        assert_eq!(query, "DELETE FROM users WHERE id = 1");
    }

    #[test]
    fn test_returning_clause() {
        let query = QueryBuilder::insert("users")
            .into_columns(&["name", "email"])
            .values(&["'Alice'", "'alice@example.com'"])
            .returning(&["id", "created_at"])
            .build()
            .unwrap();
        assert_eq!(
            query,
            "INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com') RETURNING id, created_at"
        );
    }

    #[test]
    fn test_complex_select() {
        let query = QueryBuilder::select("users")
            .columns(&["users.id", "users.name", "orders.total"])
            .join(JoinType::Left, "orders", "users.id = orders.user_id")
            .where_clause("users.active = true")
            .order_by("users.name", OrderDirection::Desc)
            .limit(10)
            .build()
            .unwrap();

        assert_eq!(
            query,
            "SELECT users.id, users.name, orders.total FROM users LEFT JOIN orders ON users.id = orders.user_id WHERE users.active = true ORDER BY users.name DESC LIMIT 10"
        );
    }
}
