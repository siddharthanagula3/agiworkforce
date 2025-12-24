use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::sys::error::{Error, Result};

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
        if !ch.is_alphanumeric() && ch != '_' && ch != '.' && ch != '*' && ch != ' ' {
            return Err(Error::Other(format!(
                "SQL identifier contains invalid character: '{}'",
                ch
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
    let dangerous_patterns = ["--", "EXEC", "EXECUTE"];

    for pattern in &dangerous_patterns {
        if upper.contains(pattern) {
            return Err(Error::Other(format!(
                "WHERE clause contains dangerous pattern: {}",
                pattern
            )));
        }
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

    pub fn build(&self) -> Result<String> {
        match &self.query_type {
            QueryType::Select(query) => self.build_select(query),
            QueryType::Insert(query) => self.build_insert(query),
            QueryType::Update(query) => self.build_update(query),
            QueryType::Delete(query) => self.build_delete(query),
        }
    }

    fn build_select(&self, query: &SelectQuery) -> Result<String> {
        validate_sql_identifier(&query.table)?;

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

        for column in &query.columns {
            validate_sql_identifier(column)?;
        }

        let columns = query.columns.join(", ");
        let values_list: Vec<String> = query
            .values
            .iter()
            .map(|row| format!("({})", row.join(", ")))
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

        let set_clauses: Vec<String> = query
            .set_values
            .iter()
            .map(|(col, val)| {
                validate_sql_identifier(col).ok()?;
                Some(format!("{} = {}", col, val))
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

    pub fn build_with_params(&self) -> Result<(String, Vec<String>)> {
        let sql = self.build()?;
        Ok((sql, Vec::new()))
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
