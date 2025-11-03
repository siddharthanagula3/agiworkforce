// Database integration tests for automation history and related tables

use rusqlite::{Connection, Result};

fn setup_test_db() -> Result<Connection> {
    let conn = Connection::open_in_memory()?;

    // Run migrations
    agiworkforce_desktop::db::migrations::run_migrations(&conn)?;

    Ok(conn)
}

#[test]
fn test_migrations_run_successfully() {
    let result = setup_test_db();
    assert!(result.is_ok(), "Database migrations should succeed");
}

#[test]
fn test_automation_history_table_exists() {
    let conn = setup_test_db().expect("Failed to setup test db");

    // Verify automation_history table exists
    let table_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='automation_history'",
            [],
            |row| row.get(0),
        )
        .expect("Failed to check table existence");

    assert!(table_exists, "automation_history table should exist");
}

#[test]
fn test_insert_automation_history() {
    let conn = setup_test_db().expect("Failed to setup test db");

    // Insert test automation task
    let result = conn.execute(
        "INSERT INTO automation_history (task_type, success, duration_ms, cost, error)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params!["windows_automation", 1, 150, 0.0001, rusqlite::types::Null],
    );

    assert!(result.is_ok(), "Insert should succeed");
    assert_eq!(result.unwrap(), 1, "Should insert 1 row");

    // Verify insertion
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM automation_history", [], |row| {
            row.get(0)
        })
        .expect("Failed to count rows");

    assert_eq!(count, 1, "Should have 1 row in automation_history");
}

#[test]
fn test_automation_history_task_types() {
    let conn = setup_test_db().expect("Failed to setup test db");

    let valid_task_types = vec![
        "windows_automation",
        "browser_automation",
        "file_operation",
        "terminal_command",
        "code_editing",
        "database_query",
        "api_call",
        "other",
    ];

    for task_type in valid_task_types {
        let result = conn.execute(
            "INSERT INTO automation_history (task_type, success, duration_ms)
             VALUES (?1, ?2, ?3)",
            rusqlite::params![task_type, 1, 100],
        );

        assert!(result.is_ok(), "Should accept task_type: {}", task_type);
    }

    // Invalid task type should fail
    let result = conn.execute(
        "INSERT INTO automation_history (task_type, success, duration_ms)
         VALUES (?1, ?2, ?3)",
        rusqlite::params!["invalid_type", 1, 100],
    );

    assert!(result.is_err(), "Should reject invalid task_type");
}

#[test]
fn test_automation_history_success_values() {
    let conn = setup_test_db().expect("Failed to setup test db");

    // success = 1 should work
    let result = conn.execute(
        "INSERT INTO automation_history (task_type, success, duration_ms)
         VALUES (?1, ?2, ?3)",
        rusqlite::params!["windows_automation", 1, 100],
    );
    assert!(result.is_ok(), "success=1 should be valid");

    // success = 0 should work
    let result = conn.execute(
        "INSERT INTO automation_history (task_type, success, duration_ms, error)
         VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params!["windows_automation", 0, 100, "Test error message"],
    );
    assert!(result.is_ok(), "success=0 should be valid");

    // success = 2 should fail (CHECK constraint)
    let result = conn.execute(
        "INSERT INTO automation_history (task_type, success, duration_ms)
         VALUES (?1, ?2, ?3)",
        rusqlite::params!["windows_automation", 2, 100],
    );
    assert!(result.is_err(), "success=2 should be invalid");
}

#[test]
fn test_captures_table_exists() {
    let conn = setup_test_db().expect("Failed to setup test db");

    let table_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='captures'",
            [],
            |row| row.get(0),
        )
        .expect("Failed to check table existence");

    assert!(table_exists, "captures table should exist");
}

#[test]
fn test_insert_capture_metadata() {
    let conn = setup_test_db().expect("Failed to setup test db");

    use uuid::Uuid;

    let capture_id = Uuid::new_v4().to_string();
    let timestamp = chrono::Utc::now().timestamp();

    let result = conn.execute(
        "INSERT INTO captures (id, capture_type, file_path, thumbnail_path, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![
            capture_id,
            "fullscreen",
            "/path/to/screenshot.png",
            "/path/to/thumbnail.png",
            timestamp
        ],
    );

    assert!(result.is_ok(), "Insert capture should succeed");

    // Verify insertion
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM captures", [], |row| row.get(0))
        .expect("Failed to count rows");

    assert_eq!(count, 1, "Should have 1 capture");
}

#[test]
fn test_capture_types_validation() {
    let conn = setup_test_db().expect("Failed to setup test db");

    use uuid::Uuid;

    let valid_types = vec!["fullscreen", "window", "region"];

    for capture_type in valid_types {
        let capture_id = Uuid::new_v4().to_string();
        let timestamp = chrono::Utc::now().timestamp();

        let result = conn.execute(
            "INSERT INTO captures (id, capture_type, file_path, created_at)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![capture_id, capture_type, "/test/path.png", timestamp],
        );

        assert!(
            result.is_ok(),
            "Should accept capture_type: {}",
            capture_type
        );
    }

    // Invalid capture type should fail
    let capture_id = Uuid::new_v4().to_string();
    let timestamp = chrono::Utc::now().timestamp();

    let result = conn.execute(
        "INSERT INTO captures (id, capture_type, file_path, created_at)
         VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![capture_id, "invalid_type", "/test/path.png", timestamp],
    );

    assert!(result.is_err(), "Should reject invalid capture_type");
}

#[test]
fn test_ocr_results_table_exists() {
    let conn = setup_test_db().expect("Failed to setup test db");

    let table_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='ocr_results'",
            [],
            |row| row.get(0),
        )
        .expect("Failed to check table existence");

    assert!(table_exists, "ocr_results table should exist");
}

#[test]
fn test_insert_ocr_result() {
    let conn = setup_test_db().expect("Failed to setup test db");

    use uuid::Uuid;

    // First insert a capture
    let capture_id = Uuid::new_v4().to_string();
    let timestamp = chrono::Utc::now().timestamp();

    conn.execute(
        "INSERT INTO captures (id, capture_type, file_path, created_at)
         VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![capture_id, "fullscreen", "/test/path.png", timestamp],
    )
    .expect("Failed to insert capture");

    // Now insert OCR result
    let ocr_id = Uuid::new_v4().to_string();

    let result = conn.execute(
        "INSERT INTO ocr_results (id, capture_id, language, text, confidence, processing_time_ms, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![
            ocr_id,
            capture_id,
            "eng",
            "Sample OCR text",
            95.5,
            1500,
            timestamp
        ],
    );

    assert!(result.is_ok(), "Insert OCR result should succeed");

    // Verify insertion
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM ocr_results", [], |row| row.get(0))
        .expect("Failed to count rows");

    assert_eq!(count, 1, "Should have 1 OCR result");
}

#[test]
fn test_ocr_foreign_key_constraint() {
    let conn = setup_test_db().expect("Failed to setup test db");

    use uuid::Uuid;

    let ocr_id = Uuid::new_v4().to_string();
    let non_existent_capture_id = Uuid::new_v4().to_string();
    let timestamp = chrono::Utc::now().timestamp();

    // Try to insert OCR result with non-existent capture_id
    let result = conn.execute(
        "INSERT INTO ocr_results (id, capture_id, language, text, confidence, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![
            ocr_id,
            non_existent_capture_id,
            "eng",
            "Test text",
            90.0,
            timestamp
        ],
    );

    assert!(result.is_err(), "Should fail due to foreign key constraint");
}

#[test]
fn test_overlay_events_table_exists() {
    let conn = setup_test_db().expect("Failed to setup test db");

    let table_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='overlay_events'",
            [],
            |row| row.get(0),
        )
        .expect("Failed to check table existence");

    assert!(table_exists, "overlay_events table should exist");
}

#[test]
fn test_insert_overlay_event() {
    let conn = setup_test_db().expect("Failed to setup test db");

    let result = conn.execute(
        "INSERT INTO overlay_events (event_type, x, y, data)
         VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params!["click", 100, 200, "{\"button\": \"left\"}"],
    );

    assert!(result.is_ok(), "Insert overlay event should succeed");

    // Verify insertion
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM overlay_events", [], |row| row.get(0))
        .expect("Failed to count rows");

    assert_eq!(count, 1, "Should have 1 overlay event");
}

#[test]
fn test_overlay_event_types_validation() {
    let conn = setup_test_db().expect("Failed to setup test db");

    let valid_event_types = vec!["click", "type", "region_highlight", "screenshot_flash"];

    for event_type in valid_event_types {
        let result = conn.execute(
            "INSERT INTO overlay_events (event_type, x, y)
             VALUES (?1, ?2, ?3)",
            rusqlite::params![event_type, 0, 0],
        );

        assert!(result.is_ok(), "Should accept event_type: {}", event_type);
    }

    // Invalid event type should fail
    let result = conn.execute(
        "INSERT INTO overlay_events (event_type, x, y)
         VALUES (?1, ?2, ?3)",
        rusqlite::params!["invalid_event", 0, 0],
    );

    assert!(result.is_err(), "Should reject invalid event_type");
}

#[test]
fn test_automation_history_indexes() {
    let conn = setup_test_db().expect("Failed to setup test db");

    // Verify indexes exist
    let index_names: Vec<String> = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='automation_history' ORDER BY name")
        .expect("Failed to prepare statement")
        .query_map([], |row| row.get(0))
        .expect("Failed to query indexes")
        .collect::<Result<Vec<_>>>()
        .expect("Failed to collect indexes");

    assert!(
        index_names.contains(&"idx_automation_history_created".to_string()),
        "Should have idx_automation_history_created index"
    );
    assert!(
        index_names.contains(&"idx_automation_history_type".to_string()),
        "Should have idx_automation_history_type index"
    );
}

#[test]
fn test_query_automation_history_by_type() {
    let conn = setup_test_db().expect("Failed to setup test db");

    // Insert test data
    conn.execute(
        "INSERT INTO automation_history (task_type, success, duration_ms) VALUES (?1, ?2, ?3)",
        rusqlite::params!["windows_automation", 1, 100],
    )
    .expect("Failed to insert");

    conn.execute(
        "INSERT INTO automation_history (task_type, success, duration_ms) VALUES (?1, ?2, ?3)",
        rusqlite::params!["browser_automation", 1, 200],
    )
    .expect("Failed to insert");

    conn.execute(
        "INSERT INTO automation_history (task_type, success, duration_ms) VALUES (?1, ?2, ?3)",
        rusqlite::params!["windows_automation", 0, 150],
    )
    .expect("Failed to insert");

    // Query by task type
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM automation_history WHERE task_type = ?1",
            ["windows_automation"],
            |row| row.get(0),
        )
        .expect("Failed to query");

    assert_eq!(count, 2, "Should find 2 windows_automation tasks");

    // Query successful tasks
    let success_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM automation_history WHERE success = 1",
            [],
            |row| row.get(0),
        )
        .expect("Failed to query");

    assert_eq!(success_count, 2, "Should find 2 successful tasks");
}

#[test]
fn test_cascade_delete_captures() {
    let conn = setup_test_db().expect("Failed to setup test db");

    use uuid::Uuid;

    // Insert capture
    let capture_id = Uuid::new_v4().to_string();
    let timestamp = chrono::Utc::now().timestamp();

    conn.execute(
        "INSERT INTO captures (id, capture_type, file_path, created_at)
         VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![capture_id, "fullscreen", "/test/path.png", timestamp],
    )
    .expect("Failed to insert capture");

    // Insert OCR result
    let ocr_id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO ocr_results (id, capture_id, language, text, confidence, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![ocr_id, capture_id, "eng", "Test", 90.0, timestamp],
    )
    .expect("Failed to insert OCR result");

    // Verify both exist
    let capture_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM captures", [], |row| row.get(0))
        .expect("Failed to count");
    let ocr_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM ocr_results", [], |row| row.get(0))
        .expect("Failed to count");

    assert_eq!(capture_count, 1);
    assert_eq!(ocr_count, 1);

    // Delete capture
    conn.execute("DELETE FROM captures WHERE id = ?1", [&capture_id])
        .expect("Failed to delete capture");

    // Verify OCR result was cascade deleted
    let ocr_count_after: i64 = conn
        .query_row("SELECT COUNT(*) FROM ocr_results", [], |row| row.get(0))
        .expect("Failed to count");

    assert_eq!(ocr_count_after, 0, "OCR result should be cascade deleted");
}
