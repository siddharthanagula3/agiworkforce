use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::error::{Error, Result};

/// Query builder for SQL operations
#[derive(Debug, Clone)]
pub struct QueryBuilder {
    table: String,
    query_type: QueryType,
}

#[derive(Debug, Clone)]
enum QueryType {
    Select(SelectQuery),
    Insert(InsertQuery),
    Update(UpdateQuery),
    Delete(DeleteQuery),
}

/// SELECT query builder
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

/// INSERT query builder
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InsertQuery {
    pub table: String,
    pub columns: Vec<String>,
    pub values: Vec<Vec<String>>,
    pub returning: Option<Vec<String>>,
}

/// UPDATE query builder
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateQuery {
    pub table: String,
    pub set_values: HashMap<String, String>,
    pub where_clause: Option<String>,
    pub returning: Option<Vec<String>>,
}

/// DELETE query builder
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeleteQuery {
    pub table: String,
    pub where_clause: Option<String>,
    pub returning: Option<Vec<String>>,
}

/// Order by clause
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

/// Join clause
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
    /// Start building a SELECT query
    pub fn select(table: &str) -> Self {
        Self {
            table: table.to_string(),
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

    /// Start building an INSERT query
    pub fn insert(table: &str) -> Self {
        Self {
            table: table.to_string(),
            query_type: QueryType::Insert(InsertQuery {
                table: table.to_string(),
                columns: Vec::new(),
                values: Vec::new(),
                returning: None,
            }),
        }
    }

    /// Start building an UPDATE query
    pub fn update(table: &str) -> Self {
        Self {
            table: table.to_string(),
            query_type: QueryType::Update(UpdateQuery {
                table: table.to_string(),
                set_values: HashMap::new(),
                where_clause: None,
                returning: None,
            }),
        }
    }

    /// Start building a DELETE query
    pub fn delete(table: &str) -> Self {
        Self {
            table: table.to_string(),
            query_type: QueryType::Delete(DeleteQuery {
                table: table.to_string(),
                where_clause: None,
                returning: None,
            }),
        }
    }

    /// Specify columns for SELECT
    pub fn columns(mut self, columns: &[&str]) -> Self {
        if let QueryType::Select(ref mut query) = self.query_type {
            query.columns = columns.iter().map(|s| s.to_string()).collect();
        }
        self
    }

    /// Add WHERE clause
    pub fn where_clause(mut self, condition: &str) -> Self {
        match &mut self.query_type {
            QueryType::Select(query) => query.where_clause = Some(condition.to_string()),
            QueryType::Update(query) => query.where_clause = Some(condition.to_string()),
            QueryType::Delete(query) => query.where_clause = Some(condition.to_string()),
            _ => {}
        }
        self
    }

    /// Add ORDER BY clause
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

    /// Add LIMIT clause
    pub fn limit(mut self, limit: u32) -> Self {
        if let QueryType::Select(ref mut query) = self.query_type {
            query.limit = Some(limit);
        }
        self
    }

    /// Add OFFSET clause
    pub fn offset(mut self, offset: u32) -> Self {
        if let QueryType::Select(ref mut query) = self.query_type {
            query.offset = Some(offset);
        }
        self
    }

    /// Add JOIN clause
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

    /// Set columns for INSERT
    pub fn into_columns(mut self, columns: &[&str]) -> Self {
        if let QueryType::Insert(ref mut query) = self.query_type {
            query.columns = columns.iter().map(|s| s.to_string()).collect();
        }
        self
    }

    /// Add values for INSERT
    pub fn values(mut self, values: &[&str]) -> Self {
        if let QueryType::Insert(ref mut query) = self.query_type {
            query
                .values
                .push(values.iter().map(|s| s.to_string()).collect());
        }
        self
    }

    /// Set column-value pairs for UPDATE
    pub fn set(mut self, column: &str, value: &str) -> Self {
        if let QueryType::Update(ref mut query) = self.query_type {
            query
                .set_values
                .insert(column.to_string(), value.to_string());
        }
        self
    }

    /// Add RETURNING clause (PostgreSQL)
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

    /// Build the SQL query string
    pub fn build(&self) -> Result<String> {
        match &self.query_type {
            QueryType::Select(query) => self.build_select(query),
            QueryType::Insert(query) => self.build_insert(query),
            QueryType::Update(query) => self.build_update(query),
            QueryType::Delete(query) => self.build_delete(query),
        }
    }

    fn build_select(&self, query: &SelectQuery) -> Result<String> {
        let mut sql = format!("SELECT {} FROM {}", query.columns.join(", "), query.table);

        // Add joins
        for join in &query.joins {
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

        // Add WHERE clause
        if let Some(ref where_clause) = query.where_clause {
            sql.push_str(&format!(" WHERE {}", where_clause));
        }

        // Add ORDER BY
        if let Some(ref order_by) = query.order_by {
            let order_clauses: Vec<String> = order_by
                .iter()
                .map(|o| {
                    let dir = match o.direction {
                        OrderDirection::Asc => "ASC",
                        OrderDirection::Desc => "DESC",
                    };
                    format!("{} {}", o.column, dir)
                })
                .collect();
            sql.push_str(&format!(" ORDER BY {}", order_clauses.join(", ")));
        }

        // Add LIMIT
        if let Some(limit) = query.limit {
            sql.push_str(&format!(" LIMIT {}", limit));
        }

        // Add OFFSET
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

        // Add RETURNING clause (PostgreSQL)
        if let Some(ref returning) = query.returning {
            sql.push_str(&format!(" RETURNING {}", returning.join(", ")));
        }

        Ok(sql)
    }

    fn build_update(&self, query: &UpdateQuery) -> Result<String> {
        if query.set_values.is_empty() {
            return Err(Error::Other("UPDATE requires SET values".to_string()));
        }

        let set_clauses: Vec<String> = query
            .set_values
            .iter()
            .map(|(col, val)| format!("{} = {}", col, val))
            .collect();

        let mut sql = format!("UPDATE {} SET {}", query.table, set_clauses.join(", "));

        // Add WHERE clause
        if let Some(ref where_clause) = query.where_clause {
            sql.push_str(&format!(" WHERE {}", where_clause));
        }

        // Add RETURNING clause (PostgreSQL)
        if let Some(ref returning) = query.returning {
            sql.push_str(&format!(" RETURNING {}", returning.join(", ")));
        }

        Ok(sql)
    }

    fn build_delete(&self, query: &DeleteQuery) -> Result<String> {
        let mut sql = format!("DELETE FROM {}", query.table);

        // Add WHERE clause
        if let Some(ref where_clause) = query.where_clause {
            sql.push_str(&format!(" WHERE {}", where_clause));
        }

        // Add RETURNING clause (PostgreSQL)
        if let Some(ref returning) = query.returning {
            sql.push_str(&format!(" RETURNING {}", returning.join(", ")));
        }

        Ok(sql)
    }

    /// Build with parameter placeholders (for prepared statements)
    pub fn build_with_params(&self) -> Result<(String, Vec<String>)> {
        // For now, just return the query and empty params
        // Full parameter binding would require more sophisticated parsing
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

        // HashMap iteration order is not guaranteed, so check both possibilities
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
            .columns(&["u.id", "u.name", "COUNT(o.id) as order_count"])
            .join(JoinType::Left, "orders o", "u.id = o.user_id")
            .where_clause("u.active = true")
            .order_by("order_count", OrderDirection::Desc)
            .limit(10)
            .build()
            .unwrap();

        assert_eq!(
            query,
            "SELECT u.id, u.name, COUNT(o.id) as order_count FROM users LEFT JOIN orders o ON u.id = o.user_id WHERE u.active = true ORDER BY order_count DESC LIMIT 10"
        );
    }
}
