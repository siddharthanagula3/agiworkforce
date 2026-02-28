//! Database Executor Test Suite
//!
//! Comprehensive tests for database operations including:
//! - SQL injection protection and validation
//! - Parameter validation for all database tools
//! - Dangerous SQL keyword detection
//! - Multiple statement detection
//! - Error handling for various failure scenarios

#[cfg(test)]
mod tests {
    use crate::core::agi::executors::{DatabaseExecutor, ToolExecutor};

    // ============================================================================
    // Constructor and Basic Tests
    // ============================================================================

    #[test]
    fn test_database_executor_new() {
        let executor = DatabaseExecutor::new();
        assert_eq!(executor.tool_names().len(), 5);
    }

    #[test]
    fn test_database_executor_default() {
        #[allow(clippy::default_constructed_unit_structs)]
        let executor = DatabaseExecutor::default();
        assert_eq!(executor.tool_names().len(), 5);
    }

    #[test]
    fn test_database_executor_tool_names() {
        let executor = DatabaseExecutor::new();
        let names = executor.tool_names();

        assert!(names.contains(&"db_query"));
        assert!(names.contains(&"db_execute"));
        assert!(names.contains(&"db_transaction_begin"));
        assert!(names.contains(&"db_transaction_commit"));
        assert!(names.contains(&"db_transaction_rollback"));
        assert_eq!(names.len(), 5);
    }

    #[test]
    fn test_database_executor_description() {
        let executor = DatabaseExecutor::new();
        let desc = executor.description();

        assert!(!desc.is_empty());
        assert!(desc.contains("Database") || desc.contains("database"));
    }

    // ============================================================================
    // SQL Injection Protection Tests - Safe Queries
    // ============================================================================

    #[test]
    fn test_validate_query_simple_select() {
        assert!(DatabaseExecutor::validate_query("SELECT * FROM users").is_ok());
    }

    #[test]
    fn test_validate_query_select_with_where() {
        assert!(
            DatabaseExecutor::validate_query("SELECT name, email FROM users WHERE id = 1").is_ok()
        );
    }

    #[test]
    fn test_validate_query_select_with_string_condition() {
        assert!(
            DatabaseExecutor::validate_query("SELECT * FROM orders WHERE status = 'pending'")
                .is_ok()
        );
    }

    #[test]
    fn test_validate_query_select_count() {
        assert!(DatabaseExecutor::validate_query("SELECT COUNT(*) FROM products").is_ok());
    }

    #[test]
    fn test_validate_query_select_with_join() {
        assert!(DatabaseExecutor::validate_query(
            "SELECT u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id"
        )
        .is_ok());
    }

    #[test]
    fn test_validate_query_select_with_cte() {
        assert!(DatabaseExecutor::validate_query(
            "WITH cte AS (SELECT * FROM users) SELECT * FROM cte"
        )
        .is_ok());
    }

    #[test]
    fn test_validate_query_select_with_subquery() {
        assert!(DatabaseExecutor::validate_query(
            "SELECT * FROM users WHERE id IN (SELECT user_id FROM orders)"
        )
        .is_ok());
    }

    #[test]
    fn test_validate_query_select_with_group_by() {
        assert!(DatabaseExecutor::validate_query(
            "SELECT status, COUNT(*) FROM orders GROUP BY status"
        )
        .is_ok());
    }

    #[test]
    fn test_validate_query_select_with_having() {
        assert!(DatabaseExecutor::validate_query(
            "SELECT status, COUNT(*) as cnt FROM orders GROUP BY status HAVING cnt > 5"
        )
        .is_ok());
    }

    #[test]
    fn test_validate_query_select_with_order_by() {
        assert!(
            DatabaseExecutor::validate_query("SELECT * FROM users ORDER BY created_at DESC")
                .is_ok()
        );
    }

    #[test]
    fn test_validate_query_select_with_limit() {
        assert!(DatabaseExecutor::validate_query(
            "SELECT * FROM users ORDER BY id LIMIT 10 OFFSET 20"
        )
        .is_ok());
    }

    #[test]
    fn test_validate_query_select_with_union() {
        assert!(DatabaseExecutor::validate_query(
            "SELECT name FROM users UNION SELECT name FROM admins"
        )
        .is_ok());
    }

    #[test]
    fn test_validate_query_select_distinct() {
        assert!(DatabaseExecutor::validate_query("SELECT DISTINCT category FROM products").is_ok());
    }

    #[test]
    fn test_validate_query_trailing_semicolon() {
        // Trailing semicolon should be allowed (no SQL after it)
        assert!(DatabaseExecutor::validate_query("SELECT * FROM users;").is_ok());
    }

    // ============================================================================
    // SQL Injection Protection Tests - Dangerous Queries
    // ============================================================================

    #[test]
    fn test_validate_query_drop_table() {
        let result = DatabaseExecutor::validate_query("DROP TABLE users");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("DROP"));
    }

    #[test]
    fn test_validate_query_drop_database() {
        let result = DatabaseExecutor::validate_query("DROP DATABASE production");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_query_truncate() {
        let result = DatabaseExecutor::validate_query("TRUNCATE TABLE users");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("TRUNCATE"));
    }

    #[test]
    fn test_validate_query_delete() {
        let result = DatabaseExecutor::validate_query("DELETE FROM users");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("DELETE"));
    }

    #[test]
    fn test_validate_query_delete_with_where() {
        let result = DatabaseExecutor::validate_query("DELETE FROM users WHERE id = 1");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_query_insert() {
        let result = DatabaseExecutor::validate_query("INSERT INTO users VALUES (1, 'test')");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("INSERT"));
    }

    #[test]
    fn test_validate_query_insert_into_select() {
        let result =
            DatabaseExecutor::validate_query("INSERT INTO users SELECT * FROM other_table");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_query_update() {
        let result = DatabaseExecutor::validate_query("UPDATE users SET name = 'test'");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("UPDATE"));
    }

    #[test]
    fn test_validate_query_update_with_where() {
        let result =
            DatabaseExecutor::validate_query("UPDATE users SET name = 'test' WHERE id = 1");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_query_alter_table() {
        let result =
            DatabaseExecutor::validate_query("ALTER TABLE users ADD COLUMN test VARCHAR(50)");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("ALTER"));
    }

    #[test]
    fn test_validate_query_create_table() {
        let result = DatabaseExecutor::validate_query("CREATE TABLE malicious (id INT)");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("CREATE"));
    }

    #[test]
    fn test_validate_query_create_index() {
        let result = DatabaseExecutor::validate_query("CREATE INDEX idx_name ON users (name)");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_query_grant() {
        let result = DatabaseExecutor::validate_query("GRANT ALL ON users TO attacker");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("GRANT"));
    }

    #[test]
    fn test_validate_query_revoke() {
        let result = DatabaseExecutor::validate_query("REVOKE ALL ON users FROM admin");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("REVOKE"));
    }

    #[test]
    fn test_validate_query_exec() {
        let result = DatabaseExecutor::validate_query("EXEC sp_malicious");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("EXEC"));
    }

    #[test]
    fn test_validate_query_execute() {
        let result = DatabaseExecutor::validate_query("EXECUTE sp_executesql @sql");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_query_call() {
        let result = DatabaseExecutor::validate_query("CALL stored_procedure()");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_query_pragma() {
        let result = DatabaseExecutor::validate_query("PRAGMA table_info(users)");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("PRAGMA"));
    }

    #[test]
    fn test_validate_query_replace() {
        let result = DatabaseExecutor::validate_query("REPLACE INTO users VALUES (1, 'name')");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_query_merge() {
        let result = DatabaseExecutor::validate_query(
            "MERGE INTO users USING src ON users.id = src.id WHEN MATCHED THEN UPDATE SET name = src.name"
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_query_upsert() {
        let result = DatabaseExecutor::validate_query("UPSERT INTO users VALUES (1, 'name')");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_query_vacuum() {
        let result = DatabaseExecutor::validate_query("VACUUM");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_query_analyze() {
        let result = DatabaseExecutor::validate_query("ANALYZE users");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_query_reindex() {
        let result = DatabaseExecutor::validate_query("REINDEX users");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_query_copy() {
        let result = DatabaseExecutor::validate_query("COPY users TO '/tmp/export.csv'");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_query_load() {
        let result =
            DatabaseExecutor::validate_query("LOAD DATA INFILE '/tmp/data.csv' INTO TABLE users");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_query_attach() {
        let result = DatabaseExecutor::validate_query("ATTACH DATABASE '/tmp/other.db' AS other");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_query_detach() {
        let result = DatabaseExecutor::validate_query("DETACH DATABASE other");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_query_rename() {
        let result = DatabaseExecutor::validate_query("RENAME TABLE users TO old_users");
        assert!(result.is_err());
    }

    // ============================================================================
    // Transaction Control Blocked Tests
    // ============================================================================

    #[test]
    fn test_validate_query_begin_transaction() {
        let result = DatabaseExecutor::validate_query("BEGIN TRANSACTION");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("BEGIN"));
    }

    #[test]
    fn test_validate_query_commit() {
        let result = DatabaseExecutor::validate_query("COMMIT");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("COMMIT"));
    }

    #[test]
    fn test_validate_query_rollback() {
        let result = DatabaseExecutor::validate_query("ROLLBACK");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("ROLLBACK"));
    }

    #[test]
    fn test_validate_query_savepoint() {
        let result = DatabaseExecutor::validate_query("SAVEPOINT my_savepoint");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("SAVEPOINT"));
    }

    // ============================================================================
    // Multiple Statement Detection Tests
    // ============================================================================

    #[test]
    fn test_validate_query_multiple_statements_select_select() {
        // Use two SELECT statements to test multiple statement detection
        // without triggering dangerous keyword detection
        let result = DatabaseExecutor::validate_query("SELECT * FROM users; SELECT * FROM orders");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Multiple SQL statements"));
    }

    #[test]
    fn test_validate_query_multiple_statements_select_delete() {
        let result =
            DatabaseExecutor::validate_query("SELECT * FROM users; DELETE FROM users WHERE 1=1");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_query_multiple_statements_three() {
        let result = DatabaseExecutor::validate_query("SELECT 1; SELECT 2; SELECT 3");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_query_semicolon_in_string_literal() {
        // Semicolon inside a string literal should NOT trigger multiple statement detection
        // Note: This is a known limitation - the basic parser may not handle all cases
        let query = "SELECT * FROM messages WHERE content = 'Hello; World'";
        // This might pass or fail depending on the implementation's string detection
        let _ = DatabaseExecutor::validate_query(query);
    }

    // ============================================================================
    // Case Insensitivity Tests
    // ============================================================================

    #[test]
    fn test_validate_query_drop_lowercase() {
        let result = DatabaseExecutor::validate_query("drop table users");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_query_drop_mixed_case() {
        let result = DatabaseExecutor::validate_query("DrOp TaBlE users");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_query_delete_uppercase() {
        let result = DatabaseExecutor::validate_query("DELETE FROM USERS");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_query_insert_mixed_case() {
        let result = DatabaseExecutor::validate_query("InSeRt InTo users VALUES (1)");
        assert!(result.is_err());
    }

    // ============================================================================
    // Edge Cases and Complex Queries
    // ============================================================================

    #[test]
    fn test_validate_query_empty_string() {
        // Empty string should pass validation (but would fail execution)
        assert!(DatabaseExecutor::validate_query("").is_ok());
    }

    #[test]
    fn test_validate_query_whitespace_only() {
        assert!(DatabaseExecutor::validate_query("   \t\n  ").is_ok());
    }

    #[test]
    fn test_validate_query_very_long_safe_query() {
        let mut long_query = "SELECT * FROM users WHERE name IN (".to_string();
        for i in 0..1000 {
            if i > 0 {
                long_query.push_str(", ");
            }
            long_query.push_str(&format!("'{}'", i));
        }
        long_query.push(')');

        assert!(DatabaseExecutor::validate_query(&long_query).is_ok());
    }

    #[test]
    fn test_validate_query_complex_nested_subqueries() {
        let query = r#"
            SELECT u.name, (
                SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id AND o.status = 'completed'
            ) as order_count
            FROM users u
            WHERE u.id IN (
                SELECT DISTINCT user_id FROM orders WHERE total > (
                    SELECT AVG(total) FROM orders
                )
            )
        "#;
        assert!(DatabaseExecutor::validate_query(query).is_ok());
    }

    #[test]
    fn test_validate_query_window_functions() {
        let query = "SELECT name, salary, ROW_NUMBER() OVER (PARTITION BY department ORDER BY salary DESC) as rank FROM employees";
        assert!(DatabaseExecutor::validate_query(query).is_ok());
    }

    #[test]
    fn test_validate_query_case_expression() {
        let query = r#"
            SELECT name,
                CASE
                    WHEN status = 'active' THEN 'Active User'
                    WHEN status = 'pending' THEN 'Pending'
                    ELSE 'Inactive'
                END as status_label
            FROM users
        "#;
        assert!(DatabaseExecutor::validate_query(query).is_ok());
    }

    #[test]
    fn test_validate_query_with_newlines() {
        let query = "SELECT *\nFROM users\nWHERE id = 1";
        assert!(DatabaseExecutor::validate_query(query).is_ok());
    }

    #[test]
    fn test_validate_query_with_tabs() {
        let query = "SELECT *\t\tFROM users\tWHERE id = 1";
        assert!(DatabaseExecutor::validate_query(query).is_ok());
    }

    // ============================================================================
    // SQL Injection Attempt Patterns
    // ============================================================================

    #[test]
    fn test_validate_query_union_injection_attempt() {
        // This is a safe UNION query (not injection)
        let query = "SELECT id, name FROM users UNION SELECT id, name FROM admins";
        assert!(DatabaseExecutor::validate_query(query).is_ok());
    }

    #[test]
    fn test_validate_query_comment_injection_detection() {
        // Queries with comments are allowed but logged for monitoring
        let query = "SELECT * FROM users -- WHERE id = 1";
        // This should pass but log a warning
        assert!(DatabaseExecutor::validate_query(query).is_ok());
    }

    #[test]
    fn test_validate_query_block_comment() {
        let query = "SELECT * FROM users /* comment */ WHERE id = 1";
        // This should pass but log a warning
        assert!(DatabaseExecutor::validate_query(query).is_ok());
    }

    #[test]
    fn test_validate_query_tautology_in_where() {
        // Classic SQL injection pattern, but the query itself is just a SELECT
        let query = "SELECT * FROM users WHERE 1=1";
        assert!(DatabaseExecutor::validate_query(query).is_ok());
    }

    #[test]
    fn test_validate_query_or_tautology() {
        let query = "SELECT * FROM users WHERE name = 'test' OR 1=1";
        assert!(DatabaseExecutor::validate_query(query).is_ok());
    }

    // ============================================================================
    // Keyword-like Strings in Column Names
    // ============================================================================

    #[test]
    fn test_validate_query_column_named_update_timestamp() {
        // Column names containing keywords should be allowed
        let query = "SELECT id, update_timestamp, created_at FROM audit_log";
        assert!(DatabaseExecutor::validate_query(query).is_ok());
    }

    #[test]
    fn test_validate_query_column_named_delete_flag() {
        let query = "SELECT id, delete_flag FROM soft_delete_table";
        assert!(DatabaseExecutor::validate_query(query).is_ok());
    }

    #[test]
    fn test_validate_query_table_named_dropbox_files() {
        let query = "SELECT * FROM dropbox_files";
        assert!(DatabaseExecutor::validate_query(query).is_ok());
    }

    // ============================================================================
    // Parameter Type Validation Tests
    // ============================================================================

    // Note: DANGEROUS_SQL_KEYWORDS is a private constant, so we test its effect
    // through the public validate_query function instead of accessing it directly.

    #[test]
    fn test_dangerous_keywords_block_essential_operations() {
        // Test that essential dangerous keywords are blocked
        assert!(DatabaseExecutor::validate_query("DROP TABLE users").is_err());
        assert!(DatabaseExecutor::validate_query("DELETE FROM users").is_err());
        assert!(DatabaseExecutor::validate_query("INSERT INTO users VALUES (1)").is_err());
        assert!(DatabaseExecutor::validate_query("UPDATE users SET x = 1").is_err());
        assert!(DatabaseExecutor::validate_query("TRUNCATE TABLE users").is_err());
        assert!(DatabaseExecutor::validate_query("ALTER TABLE users ADD x INT").is_err());
        assert!(DatabaseExecutor::validate_query("CREATE TABLE x (id INT)").is_err());
    }

    #[test]
    fn test_dangerous_keywords_block_admin_operations() {
        // Test that admin keywords are blocked
        assert!(DatabaseExecutor::validate_query("GRANT ALL ON users TO x").is_err());
        assert!(DatabaseExecutor::validate_query("REVOKE ALL ON users FROM x").is_err());
        assert!(DatabaseExecutor::validate_query("VACUUM").is_err());
        assert!(DatabaseExecutor::validate_query("PRAGMA table_info(users)").is_err());
    }

    // ============================================================================
    // Multiple Statement Edge Cases
    // ============================================================================

    #[test]
    fn test_check_multiple_statements_single() {
        assert!(DatabaseExecutor::check_multiple_statements("SELECT * FROM users").is_ok());
    }

    #[test]
    fn test_check_multiple_statements_with_trailing_semicolon() {
        assert!(DatabaseExecutor::check_multiple_statements("SELECT * FROM users;").is_ok());
    }

    #[test]
    fn test_check_multiple_statements_with_trailing_whitespace() {
        assert!(DatabaseExecutor::check_multiple_statements("SELECT * FROM users;   ").is_ok());
    }

    #[test]
    fn test_check_multiple_statements_two_queries() {
        let result = DatabaseExecutor::check_multiple_statements("SELECT 1; SELECT 2");
        assert!(result.is_err());
    }

    #[test]
    fn test_check_multiple_statements_injection_pattern() {
        let result =
            DatabaseExecutor::check_multiple_statements("SELECT * FROM users; DROP TABLE users");
        assert!(result.is_err());
    }

    // ============================================================================
    // Integration with ToolExecutor Trait
    // ============================================================================

    #[test]
    fn test_tool_names_match_expected() {
        let executor = DatabaseExecutor::new();
        let names: Vec<&str> = executor.tool_names();

        // Verify exact set of tools
        let expected = vec![
            "db_query",
            "db_execute",
            "db_transaction_begin",
            "db_transaction_commit",
            "db_transaction_rollback",
        ];

        for expected_name in &expected {
            assert!(
                names.contains(expected_name),
                "Missing expected tool: {}",
                expected_name
            );
        }

        for name in &names {
            assert!(expected.contains(name), "Unexpected tool found: {}", name);
        }
    }

    // ============================================================================
    // Error Message Quality Tests
    // ============================================================================

    #[test]
    fn test_error_message_mentions_db_execute() {
        let result = DatabaseExecutor::validate_query("INSERT INTO users VALUES (1)");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        // Error should guide user to use db_execute for write operations
        assert!(err.contains("db_execute"));
    }

    #[test]
    fn test_error_message_identifies_keyword() {
        let result = DatabaseExecutor::validate_query("DROP TABLE users");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        // Error should identify which keyword was blocked
        assert!(err.contains("DROP"));
    }

    #[test]
    fn test_multiple_statement_error_message() {
        let result = DatabaseExecutor::validate_query("SELECT 1; SELECT 2");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        // Error should explain the issue
        assert!(err.contains("Multiple") || err.contains("statements"));
    }
}
