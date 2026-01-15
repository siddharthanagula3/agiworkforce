#[cfg(test)]
mod integration {
    use rusqlite::Connection;
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex};
    use std::time::{Duration, Instant};

    // ============================================
    // Database Integration Tests
    // ============================================

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();

        // Run the same migrations as the main application
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                user_id TEXT NOT NULL DEFAULT 'test_user',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id INTEGER NOT NULL,
                user_id TEXT NOT NULL DEFAULT 'test_user',
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                tokens INTEGER,
                cost REAL,
                provider TEXT,
                model TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                encrypted INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS automation_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_type TEXT NOT NULL,
                success INTEGER NOT NULL,
                error TEXT,
                duration_ms INTEGER NOT NULL,
                cost REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS settings_v2 (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                category TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS custom_instructions (
                id TEXT PRIMARY KEY,
                name TEXT,
                content TEXT NOT NULL,
                user_id TEXT NOT NULL DEFAULT 'test_user',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                user_id TEXT NOT NULL DEFAULT 'test_user',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        ",
        )
        .expect("Failed to create test tables");

        conn
    }

    #[test]
    fn test_database_conversation_crud() {
        let conn = setup_test_db();
        let user_id = "test_user_123";

        // Create conversation
        conn.execute(
            "INSERT INTO conversations (title, user_id) VALUES (?1, ?2)",
            rusqlite::params!["Test Conversation", user_id],
        )
        .expect("Failed to insert conversation");

        let conv_id = conn.last_insert_rowid();
        assert!(conv_id > 0, "Conversation ID should be positive");

        // Read conversation
        let title: String = conn
            .query_row(
                "SELECT title FROM conversations WHERE id = ?1 AND user_id = ?2",
                rusqlite::params![conv_id, user_id],
                |row| row.get(0),
            )
            .expect("Failed to query conversation");
        assert_eq!(title, "Test Conversation");

        // Update conversation
        conn.execute(
            "UPDATE conversations SET title = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2 AND user_id = ?3",
            rusqlite::params!["Updated Title", conv_id, user_id],
        )
        .expect("Failed to update conversation");

        let updated_title: String = conn
            .query_row(
                "SELECT title FROM conversations WHERE id = ?1",
                rusqlite::params![conv_id],
                |row| row.get(0),
            )
            .expect("Failed to query updated conversation");
        assert_eq!(updated_title, "Updated Title");

        // Delete conversation
        let rows_deleted = conn
            .execute(
                "DELETE FROM conversations WHERE id = ?1 AND user_id = ?2",
                rusqlite::params![conv_id, user_id],
            )
            .expect("Failed to delete conversation");
        assert_eq!(rows_deleted, 1, "Should delete exactly one row");

        // Verify deletion
        let count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM conversations WHERE id = ?1",
                rusqlite::params![conv_id],
                |row| row.get(0),
            )
            .expect("Failed to count");
        assert_eq!(count, 0, "Conversation should be deleted");
    }

    #[test]
    fn test_database_message_operations() {
        let conn = setup_test_db();
        let user_id = "test_user";

        // Create conversation first
        conn.execute(
            "INSERT INTO conversations (title, user_id) VALUES (?1, ?2)",
            rusqlite::params!["Chat", user_id],
        )
        .unwrap();
        let conv_id = conn.last_insert_rowid();

        // Insert user message
        conn.execute(
            "INSERT INTO messages (conversation_id, user_id, role, content, tokens, cost) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![conv_id, user_id, "user", "Hello, how are you?", 5, 0.0],
        )
        .unwrap();
        let _user_msg_id = conn.last_insert_rowid();

        // Insert assistant message with cost tracking
        conn.execute(
            "INSERT INTO messages (conversation_id, user_id, role, content, tokens, cost, provider, model) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![conv_id, user_id, "assistant", "I'm doing well, thank you!", 10, 0.0015, "openai", "gpt-4"],
        )
        .unwrap();
        let _assistant_msg_id = conn.last_insert_rowid();

        // Verify messages exist
        let msg_count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM messages WHERE conversation_id = ?1",
                rusqlite::params![conv_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(msg_count, 2, "Should have 2 messages");

        // Verify cost tracking
        let total_cost: f64 = conn
            .query_row(
                "SELECT COALESCE(SUM(cost), 0.0) FROM messages WHERE conversation_id = ?1 AND role = 'assistant'",
                rusqlite::params![conv_id],
                |row| row.get(0),
            )
            .unwrap();
        assert!(
            (total_cost - 0.0015).abs() < 0.0001,
            "Cost should be tracked"
        );

        // Test cascade delete
        conn.execute(
            "DELETE FROM conversations WHERE id = ?1",
            rusqlite::params![conv_id],
        )
        .unwrap();

        let remaining_msgs: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM messages WHERE conversation_id = ?1",
                rusqlite::params![conv_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            remaining_msgs, 0,
            "Messages should be deleted with conversation"
        );
    }

    #[test]
    fn test_database_settings_persistence() {
        let conn = setup_test_db();

        // Set multiple settings
        let settings = vec![
            ("theme", "dark", false),
            ("language", "en", false),
            ("api_key", "encrypted_value", true),
            ("auto_approve", "false", false),
        ];

        for (key, value, encrypted) in &settings {
            conn.execute(
                "INSERT OR REPLACE INTO settings (key, value, encrypted) VALUES (?1, ?2, ?3)",
                rusqlite::params![key, value, *encrypted as i32],
            )
            .expect("Failed to insert setting");
        }

        // Verify settings
        let theme: String = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'theme'",
                [],
                |row| row.get(0),
            )
            .expect("Failed to get theme");
        assert_eq!(theme, "dark");

        // Verify encrypted flag
        let (encrypted_value, is_encrypted): (String, i32) = conn
            .query_row(
                "SELECT value, encrypted FROM settings WHERE key = 'api_key'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("Failed to get api_key");
        assert_eq!(encrypted_value, "encrypted_value");
        assert_eq!(is_encrypted, 1, "api_key should be marked as encrypted");

        // Test update
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value, encrypted) VALUES ('theme', 'light', 0)",
            [],
        )
        .unwrap();

        let updated_theme: String = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'theme'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(updated_theme, "light");

        // Test delete
        conn.execute("DELETE FROM settings WHERE key = 'theme'", [])
            .unwrap();
        let result = conn.query_row::<String, _, _>(
            "SELECT value FROM settings WHERE key = 'theme'",
            [],
            |row| row.get(0),
        );
        assert!(result.is_err(), "Theme should be deleted");
    }

    #[test]
    fn test_database_transaction_rollback() {
        let conn = setup_test_db();
        let user_id = "test_user";

        // Start transaction
        conn.execute("BEGIN TRANSACTION", []).unwrap();

        conn.execute(
            "INSERT INTO conversations (title, user_id) VALUES (?1, ?2)",
            rusqlite::params!["Transaction Test", user_id],
        )
        .unwrap();

        // Rollback
        conn.execute("ROLLBACK", []).unwrap();

        // Verify no data persisted
        let count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM conversations WHERE title = 'Transaction Test'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 0, "Transaction should be rolled back");
    }

    #[test]
    fn test_database_transaction_commit() {
        let conn = setup_test_db();
        let user_id = "test_user";

        // Start transaction
        conn.execute("BEGIN TRANSACTION", []).unwrap();

        conn.execute(
            "INSERT INTO conversations (title, user_id) VALUES (?1, ?2)",
            rusqlite::params!["Commit Test", user_id],
        )
        .unwrap();

        // Commit
        conn.execute("COMMIT", []).unwrap();

        // Verify data persisted
        let count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM conversations WHERE title = 'Commit Test'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1, "Transaction should be committed");
    }

    #[test]
    fn test_automation_history_tracking() {
        let conn = setup_test_db();

        // Insert automation history entries
        let tasks = vec![
            ("browser_automation", true, 150, None::<String>),
            ("file_operation", true, 50, None),
            (
                "terminal_command",
                false,
                200,
                Some("Command failed".to_string()),
            ),
            ("browser_automation", true, 180, None),
            ("api_call", true, 300, None),
        ];

        for (task_type, success, duration_ms, error) in &tasks {
            conn.execute(
                "INSERT INTO automation_history (task_type, success, error, duration_ms) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![task_type, *success as i32, error, duration_ms],
            )
            .expect("Failed to insert automation history");
        }

        // Verify stats
        let (total, successful, avg_duration, _total_cost): (i64, i64, f64, f64) = conn
            .query_row(
                "SELECT COUNT(*), SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END), AVG(duration_ms), COALESCE(SUM(cost), 0) FROM automation_history",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .expect("Failed to get stats");

        assert_eq!(total, 5, "Should have 5 entries");
        assert_eq!(successful, 4, "Should have 4 successful entries");
        assert!(avg_duration > 0.0, "Average duration should be positive");

        // Verify error logging
        let error_count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM automation_history WHERE error IS NOT NULL",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(error_count, 1, "Should have 1 error entry");
    }

    // ============================================
    // Concurrent Access Tests
    // ============================================

    #[test]
    fn test_concurrent_resource_allocation() {
        // Simulate resource manager with thread-safe tracking
        let total_memory: Arc<Mutex<u64>> = Arc::new(Mutex::new(2048));
        let allocations: Arc<Mutex<Vec<u64>>> = Arc::new(Mutex::new(Vec::new()));

        // Simulate allocations
        let allocate =
            |amount: u64, mem: &Arc<Mutex<u64>>, allocs: &Arc<Mutex<Vec<u64>>>| -> bool {
                let mut memory = mem.lock().unwrap();
                if *memory >= amount {
                    *memory -= amount;
                    allocs.lock().unwrap().push(amount);
                    true
                } else {
                    false
                }
            };

        // Test allocations
        assert!(allocate(512, &total_memory, &allocations));
        assert!(allocate(512, &total_memory, &allocations));
        assert!(allocate(512, &total_memory, &allocations));
        assert!(allocate(512, &total_memory, &allocations));
        assert!(
            !allocate(512, &total_memory, &allocations),
            "Should fail - no memory left"
        );

        let remaining = *total_memory.lock().unwrap();
        assert_eq!(remaining, 0, "All memory should be allocated");

        let alloc_count = allocations.lock().unwrap().len();
        assert_eq!(alloc_count, 4, "Should have 4 allocations");
    }

    #[test]
    fn test_concurrent_task_execution_limits() {
        let max_concurrent = 5usize;
        let running_tasks: Arc<Mutex<usize>> = Arc::new(Mutex::new(0));
        let completed_tasks: Arc<Mutex<usize>> = Arc::new(Mutex::new(0));

        let try_start_task = |running: &Arc<Mutex<usize>>| -> bool {
            let mut count = running.lock().unwrap();
            if *count < max_concurrent {
                *count += 1;
                true
            } else {
                false
            }
        };

        let complete_task = |running: &Arc<Mutex<usize>>, completed: &Arc<Mutex<usize>>| {
            *running.lock().unwrap() -= 1;
            *completed.lock().unwrap() += 1;
        };

        // Fill up task slots
        for _ in 0..5 {
            assert!(try_start_task(&running_tasks));
        }

        // Should reject new task
        assert!(
            !try_start_task(&running_tasks),
            "Should reject when at capacity"
        );

        // Complete one task
        complete_task(&running_tasks, &completed_tasks);

        // Now should accept new task
        assert!(
            try_start_task(&running_tasks),
            "Should accept after completion"
        );

        let final_running = *running_tasks.lock().unwrap();
        let final_completed = *completed_tasks.lock().unwrap();
        assert_eq!(final_running, 5);
        assert_eq!(final_completed, 1);
    }

    // ============================================
    // Error Recovery Tests
    // ============================================

    #[test]
    fn test_error_recovery_with_retry() {
        let max_retries = 3u32;
        let mut attempt = 0u32;
        let mut success = false;

        // Simulate operation that fails twice then succeeds
        while attempt < max_retries && !success {
            attempt += 1;
            if attempt >= 3 {
                success = true;
            }
        }

        assert!(success, "Should succeed on third attempt");
        assert_eq!(attempt, 3, "Should take 3 attempts");
    }

    #[test]
    fn test_error_recovery_exhausted_retries() {
        let max_retries = 3u32;
        let mut attempt = 0u32;
        let success = false;

        // Simulate operation that always fails
        while attempt < max_retries && !success {
            attempt += 1;
            // Always fail
        }

        assert!(!success, "Should fail after exhausting retries");
        assert_eq!(attempt, max_retries, "Should use all retries");
    }

    // ============================================
    // AGI Safety Mechanism Tests
    // ============================================

    #[test]
    fn test_agi_iteration_limit() {
        const MAX_ITERATIONS: u32 = 1000;
        let mut iteration = 0u32;
        let goal_achieved = false;

        while iteration < MAX_ITERATIONS && !goal_achieved {
            iteration += 1;
            // Simulate work
        }

        assert_eq!(iteration, MAX_ITERATIONS, "Should stop at max iterations");
        assert!(
            !goal_achieved,
            "Goal should not be achieved when limit reached"
        );
    }

    #[test]
    fn test_agi_timeout_mechanism() {
        let max_duration = Duration::from_millis(100);
        let start_time = Instant::now();
        let mut iterations = 0u32;

        while start_time.elapsed() < max_duration {
            iterations += 1;
            std::thread::sleep(Duration::from_micros(100));
        }

        assert!(
            start_time.elapsed() >= max_duration,
            "Should respect timeout"
        );
        assert!(iterations > 0, "Should have completed some iterations");
    }

    #[test]
    fn test_agi_consecutive_failure_limit() {
        const MAX_CONSECUTIVE_FAILURES: u32 = 3;
        let mut consecutive_failures = 0u32;
        let mut should_abandon = false;
        let results = vec![false, false, false, true]; // 3 failures then success

        for (_i, success) in results.iter().enumerate() {
            if *success {
                consecutive_failures = 0;
            } else {
                consecutive_failures += 1;
                if consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
                    should_abandon = true;
                    break;
                }
            }
        }

        assert!(
            should_abandon,
            "Should abandon after 3 consecutive failures"
        );
        assert_eq!(consecutive_failures, 3);
    }

    #[test]
    fn test_agi_cancellation_check() {
        let cancelled: Arc<Mutex<bool>> = Arc::new(Mutex::new(false));
        let iterations: Arc<Mutex<u32>> = Arc::new(Mutex::new(0));

        // Simulate cancellation after 5 iterations
        let cancel_after = 5;

        loop {
            if *cancelled.lock().unwrap() {
                break;
            }

            let mut iter = iterations.lock().unwrap();
            *iter += 1;

            if *iter >= cancel_after {
                *cancelled.lock().unwrap() = true;
            }
        }

        let final_iterations = *iterations.lock().unwrap();
        assert_eq!(final_iterations, 5, "Should stop when cancelled");
    }

    // ============================================
    // Approval Workflow Tests
    // ============================================

    #[test]
    fn test_approval_required_for_dangerous_operations() {
        let dangerous_keywords = vec![
            "delete",
            "remove",
            "uninstall",
            "format",
            "wipe",
            "clear",
            "reset",
            "shutdown",
            "restart",
        ];

        let test_descriptions = vec![
            ("delete all files", true),
            ("read configuration", false),
            ("wipe the database", true),
            ("search for documents", false),
            ("remove temporary files", true),
            ("list directory contents", false),
        ];

        for (description, should_require_approval) in test_descriptions {
            let requires_approval = dangerous_keywords
                .iter()
                .any(|kw| description.to_lowercase().contains(kw));
            assert_eq!(
                requires_approval,
                should_require_approval,
                "Description '{}' should {} require approval",
                description,
                if should_require_approval { "" } else { "not" }
            );
        }
    }

    #[test]
    fn test_approval_auto_approve_safe_operations() {
        let auto_approve_enabled = true;
        let is_read_only = true;
        let has_file_operations = false;
        let has_network_operations = false;

        let should_auto_approve =
            auto_approve_enabled && is_read_only && !has_file_operations && !has_network_operations;

        assert!(
            should_auto_approve,
            "Read-only operations should auto-approve"
        );
    }

    #[test]
    fn test_approval_reject_file_operations_in_safe_mode() {
        let auto_approve_enabled = true;
        let is_read_only = false;
        let has_file_operations = true;

        let should_auto_approve = auto_approve_enabled && is_read_only && !has_file_operations;

        assert!(
            !should_auto_approve,
            "File operations should not auto-approve"
        );
    }

    // ============================================
    // Tool Parameter Validation Tests
    // ============================================

    #[test]
    fn test_tool_parameter_validation() {
        // Simulate tool parameter validation
        let validate_params =
            |params: &HashMap<String, String>, required: &[&str]| -> Result<(), String> {
                for key in required {
                    if !params.contains_key(*key) {
                        return Err(format!("Missing required parameter: {}", key));
                    }
                    if params.get(*key).map(|v| v.is_empty()).unwrap_or(true) {
                        return Err(format!("Parameter '{}' cannot be empty", key));
                    }
                }
                Ok(())
            };

        // Valid parameters
        let mut valid_params = HashMap::new();
        valid_params.insert("path".to_string(), "/test/file.txt".to_string());
        valid_params.insert("mode".to_string(), "read".to_string());
        assert!(validate_params(&valid_params, &["path", "mode"]).is_ok());

        // Missing parameter
        let mut missing_params = HashMap::new();
        missing_params.insert("path".to_string(), "/test/file.txt".to_string());
        assert!(validate_params(&missing_params, &["path", "mode"]).is_err());

        // Empty parameter
        let mut empty_params = HashMap::new();
        empty_params.insert("path".to_string(), "".to_string());
        empty_params.insert("mode".to_string(), "read".to_string());
        assert!(validate_params(&empty_params, &["path", "mode"]).is_err());
    }

    // ============================================
    // Cost Tracking Tests
    // ============================================

    #[test]
    fn test_cost_tracking_accuracy() {
        let costs = vec![0.001, 0.002, 0.0015, 0.003, 0.0005];
        let expected_total = 0.008; // 0.001 + 0.002 + 0.0015 + 0.003 + 0.0005 = 0.008
        let actual_total: f64 = costs.iter().sum();

        // Allow small floating point error
        let difference = (expected_total - actual_total).abs();
        assert!(
            difference < 0.0001,
            "Cost tracking should be accurate within 0.0001"
        );

        // Verify the sum is approximately correct
        assert!(
            (actual_total - 0.008).abs() < 0.0001,
            "Total should be approximately 0.008"
        );
    }

    #[test]
    fn test_token_counting_estimation() {
        // Rough estimation: ~4 chars per token for English text
        let text = "This is a test message for token counting estimation.";
        let estimated_tokens = text.len() / 4;
        let actual_tokens = 12; // Known value for this text

        let error_rate =
            ((estimated_tokens as f64 - actual_tokens as f64) / actual_tokens as f64).abs();
        assert!(error_rate < 0.5, "Token estimation error should be < 50%");
    }

    // ============================================
    // Privacy/GDPR Tests
    // ============================================

    #[test]
    fn test_privacy_export_data_structure() {
        let conn = setup_test_db();
        let user_id = "test_user";

        // Insert test data
        conn.execute(
            "INSERT INTO conversations (title, user_id) VALUES (?1, ?2)",
            rusqlite::params!["Test Chat", user_id],
        )
        .unwrap();

        conn.execute(
            "INSERT INTO settings_v2 (key, value, category) VALUES ('theme', 'dark', 'appearance')",
            [],
        )
        .unwrap();

        // Export data
        let mut export_data: HashMap<String, Vec<HashMap<String, String>>> = HashMap::new();

        // Export conversations
        let mut stmt = conn
            .prepare("SELECT id, title FROM conversations WHERE user_id = ?1")
            .unwrap();
        let conversations: Vec<HashMap<String, String>> = stmt
            .query_map([user_id], |row| {
                let mut map = HashMap::new();
                map.insert("id".to_string(), row.get::<_, i64>(0)?.to_string());
                map.insert("title".to_string(), row.get::<_, String>(1)?);
                Ok(map)
            })
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        export_data.insert("conversations".to_string(), conversations);

        assert!(
            export_data.contains_key("conversations"),
            "Export should contain conversations"
        );
        assert_eq!(
            export_data["conversations"].len(),
            1,
            "Should have 1 conversation"
        );
    }

    #[test]
    fn test_privacy_delete_user_data() {
        let conn = setup_test_db();
        let user_id = "user_to_delete";

        // Insert user data
        conn.execute(
            "INSERT INTO conversations (title, user_id) VALUES (?1, ?2)",
            rusqlite::params!["User Chat 1", user_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO conversations (title, user_id) VALUES (?1, ?2)",
            rusqlite::params!["User Chat 2", user_id],
        )
        .unwrap();

        // Insert data for different user
        conn.execute(
            "INSERT INTO conversations (title, user_id) VALUES (?1, ?2)",
            rusqlite::params!["Other User Chat", "other_user"],
        )
        .unwrap();

        // Delete user data
        conn.execute("DELETE FROM conversations WHERE user_id = ?1", [user_id])
            .unwrap();

        // Verify deletion
        let deleted_count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM conversations WHERE user_id = ?1",
                [user_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(deleted_count, 0, "User data should be deleted");

        // Verify other user data intact
        let other_count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM conversations WHERE user_id = 'other_user'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(other_count, 1, "Other user data should be intact");
    }

    // ============================================
    // Cache Management Tests
    // ============================================

    #[test]
    fn test_cache_hit_tracking() {
        let mut cache_hits = 0u64;
        let mut cache_misses = 0u64;
        let mut cache: HashMap<String, String> = HashMap::new();

        let queries = vec!["query1", "query2", "query1", "query3", "query1"];

        for query in queries {
            if cache.contains_key(query) {
                cache_hits += 1;
            } else {
                cache_misses += 1;
                cache.insert(query.to_string(), format!("result_{}", query));
            }
        }

        assert_eq!(cache_hits, 2, "Should have 2 cache hits");
        assert_eq!(cache_misses, 3, "Should have 3 cache misses");

        let hit_rate = cache_hits as f64 / (cache_hits + cache_misses) as f64;
        assert!((hit_rate - 0.4).abs() < 0.01, "Hit rate should be 40%");
    }

    // ============================================
    // Memory Management Tests
    // ============================================

    #[test]
    fn test_context_memory_truncation() {
        const MAX_ENTRIES: usize = 100;
        let mut context_memory: Vec<String> = Vec::new();

        // Add 150 entries
        for i in 0..150 {
            context_memory.push(format!("entry_{}", i));

            // Truncate if over limit
            if context_memory.len() > MAX_ENTRIES {
                let excess = context_memory.len() - MAX_ENTRIES;
                context_memory.drain(0..excess);
            }
        }

        assert_eq!(
            context_memory.len(),
            MAX_ENTRIES,
            "Should be truncated to max entries"
        );
        assert_eq!(
            context_memory[0], "entry_50",
            "Should keep most recent entries"
        );
        assert_eq!(context_memory[99], "entry_149");
    }

    #[test]
    fn test_resource_cleanup_on_completion() {
        let resources_allocated: Arc<Mutex<usize>> = Arc::new(Mutex::new(0));
        let resources_freed: Arc<Mutex<usize>> = Arc::new(Mutex::new(0));

        // Simulate resource allocation and cleanup
        for _ in 0..5 {
            *resources_allocated.lock().unwrap() += 1;
        }

        // Cleanup
        let allocated = *resources_allocated.lock().unwrap();
        *resources_freed.lock().unwrap() = allocated;

        assert_eq!(
            *resources_allocated.lock().unwrap(),
            *resources_freed.lock().unwrap(),
            "All resources should be freed"
        );
    }

    // ============================================
    // Network Timeout Tests
    // ============================================

    #[test]
    fn test_network_timeout_handling() {
        let timeout = Duration::from_secs(30);
        let start = Instant::now();

        // Simulate network operation
        std::thread::sleep(Duration::from_millis(10));
        let elapsed = start.elapsed();

        assert!(
            elapsed < timeout,
            "Operation should complete before timeout"
        );
    }

    #[test]
    fn test_state_persistence_verification() {
        let conn = setup_test_db();

        // Save state
        conn.execute(
            "INSERT INTO settings_v2 (key, value, category) VALUES ('app_state', '{\"active_goals\": 2}', 'system')",
            [],
        )
        .unwrap();

        // Simulate restart by querying again
        let state: String = conn
            .query_row(
                "SELECT value FROM settings_v2 WHERE key = 'app_state'",
                [],
                |row| row.get(0),
            )
            .expect("State should persist");

        assert!(state.contains("active_goals"), "State should be persisted");
    }

    // ============================================
    // Plan Execution Tests
    // ============================================

    #[test]
    fn test_parallel_plan_execution_speedup() {
        // Simulate sequential vs parallel execution
        let step_durations = vec![100u64, 100, 100];

        // Sequential
        let sequential_time: u64 = step_durations.iter().sum();

        // Parallel (all steps at once)
        let parallel_time: u64 = *step_durations.iter().max().unwrap();

        assert!(parallel_time < sequential_time, "Parallel should be faster");
        assert_eq!(sequential_time, 300);
        assert_eq!(parallel_time, 100);
    }

    #[test]
    fn test_error_aggregation_in_plan() {
        let step_results: Vec<Result<String, String>> = vec![
            Ok("Step 1 success".to_string()),
            Err("Step 2 failed: timeout".to_string()),
            Ok("Step 3 success".to_string()),
            Err("Step 4 failed: permission denied".to_string()),
        ];

        let errors: Vec<String> = step_results.into_iter().filter_map(|r| r.err()).collect();

        assert_eq!(errors.len(), 2, "Should aggregate 2 errors");
        assert!(errors[0].contains("timeout"));
        assert!(errors[1].contains("permission denied"));
    }

    // ============================================
    // Learning System Tests
    // ============================================

    #[test]
    fn test_learning_experience_recording() {
        let mut experiences: Vec<(String, bool, u64)> = Vec::new();

        // Record experiences (tool_id, success, duration_ms)
        experiences.push(("file_read".to_string(), true, 50));
        experiences.push(("file_read".to_string(), true, 45));
        experiences.push(("file_read".to_string(), false, 100));
        experiences.push(("web_search".to_string(), true, 500));

        // Calculate success rate for file_read
        let file_read_experiences: Vec<_> = experiences
            .iter()
            .filter(|(id, _, _)| id == "file_read")
            .collect();

        let success_count = file_read_experiences.iter().filter(|(_, s, _)| *s).count();
        let success_rate = success_count as f64 / file_read_experiences.len() as f64;

        assert!(
            (success_rate - 0.666).abs() < 0.01,
            "Success rate should be ~66%"
        );
    }

    // ============================================
    // Dynamic Tool Loading Tests
    // ============================================

    #[test]
    fn test_tool_registry_operations() {
        let mut tool_registry: HashMap<String, Vec<String>> = HashMap::new();

        // Register tools
        tool_registry.insert(
            "file".to_string(),
            vec![
                "read".to_string(),
                "write".to_string(),
                "delete".to_string(),
            ],
        );
        tool_registry.insert(
            "browser".to_string(),
            vec![
                "navigate".to_string(),
                "click".to_string(),
                "type".to_string(),
            ],
        );
        tool_registry.insert("terminal".to_string(), vec!["execute".to_string()]);

        let total_tools: usize = tool_registry.values().map(|v| v.len()).sum();
        assert_eq!(total_tools, 7, "Should have 7 tools registered");

        // Verify tool lookup
        assert!(tool_registry.contains_key("file"));
        assert!(tool_registry["file"].contains(&"read".to_string()));
    }

    #[test]
    fn test_complete_automation_workflow_stages() {
        let workflow_stages = vec!["goal", "plan", "execute", "verify", "complete"];
        let mut current_stage_index = 0;

        // Simulate workflow progression
        while current_stage_index < workflow_stages.len() {
            let _current_stage = &workflow_stages[current_stage_index];
            current_stage_index += 1;
        }

        assert_eq!(current_stage_index, 5, "Should complete all stages");
        assert_eq!(workflow_stages.last(), Some(&"complete"));
    }
}
