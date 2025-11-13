/// Test utilities and mock implementations for testing
pub mod mocks;

use rusqlite::Connection;
use std::sync::{Arc, Mutex};

/// Creates an in-memory SQLite database for testing
pub fn create_test_database() -> Arc<Mutex<Connection>> {
    let conn = Connection::open_in_memory().expect("Failed to create in-memory database");

    // Run basic schema initialization
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS goals (
            id TEXT PRIMARY KEY,
            description TEXT NOT NULL,
            priority INTEGER NOT NULL,
            status TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS steps (
            id TEXT PRIMARY KEY,
            goal_id TEXT NOT NULL,
            description TEXT NOT NULL,
            status TEXT NOT NULL,
            result TEXT,
            FOREIGN KEY (goal_id) REFERENCES goals(id)
        );

        CREATE TABLE IF NOT EXISTS knowledge (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            metadata TEXT
        );

        CREATE TABLE IF NOT EXISTS experiences (
            id TEXT PRIMARY KEY,
            goal_id TEXT NOT NULL,
            success BOOLEAN NOT NULL,
            execution_time_ms INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            lessons TEXT
        );

        CREATE TABLE IF NOT EXISTS outcomes (
            id TEXT PRIMARY KEY,
            process_id TEXT NOT NULL,
            description TEXT NOT NULL,
            expected_value REAL NOT NULL,
            actual_value REAL NOT NULL,
            achieved BOOLEAN NOT NULL,
            timestamp INTEGER NOT NULL,
            metadata TEXT
        );
        "#,
    )
    .expect("Failed to initialize test database schema");

    Arc::new(Mutex::new(conn))
}

/// Creates a temporary directory for file testing
pub fn create_test_directory() -> std::io::Result<tempfile::TempDir> {
    tempfile::tempdir()
}

/// Creates a test file with content
pub fn create_test_file(
    dir: &std::path::Path,
    name: &str,
    content: &str,
) -> std::io::Result<std::path::PathBuf> {
    use std::io::Write;

    let file_path = dir.join(name);
    let mut file = std::fs::File::create(&file_path)?;
    file.write_all(content.as_bytes())?;
    Ok(file_path)
}

/// Waits for a condition to be true with timeout
pub async fn wait_for_condition<F>(mut condition: F, timeout_ms: u64) -> bool
where
    F: FnMut() -> bool,
{
    use tokio::time::{sleep, Duration};

    let start = std::time::Instant::now();
    let timeout = Duration::from_millis(timeout_ms);

    while start.elapsed() < timeout {
        if condition() {
            return true;
        }
        sleep(Duration::from_millis(100)).await;
    }

    false
}

/// Generates random test data
pub fn generate_test_id() -> String {
    use uuid::Uuid;
    format!("test-{}", Uuid::new_v4())
}

/// Test fixture for common test setup
pub struct TestFixture {
    pub db: Arc<Mutex<Connection>>,
    pub temp_dir: tempfile::TempDir,
}

impl TestFixture {
    pub fn new() -> Self {
        Self {
            db: create_test_database(),
            temp_dir: create_test_directory().expect("Failed to create temp directory"),
        }
    }

    pub fn temp_path(&self) -> &std::path::Path {
        self.temp_dir.path()
    }

    pub fn create_file(&self, name: &str, content: &str) -> std::io::Result<std::path::PathBuf> {
        create_test_file(self.temp_path(), name, content)
    }
}

impl Default for TestFixture {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_test_database() {
        let db = create_test_database();
        let conn = db.lock().unwrap();

        // Verify tables exist
        let table_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table'",
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert!(table_count >= 5);
    }

    #[test]
    fn test_create_test_directory() {
        let temp_dir = create_test_directory().unwrap();
        assert!(temp_dir.path().exists());
    }

    #[test]
    fn test_create_test_file() {
        let temp_dir = create_test_directory().unwrap();
        let file_path = create_test_file(temp_dir.path(), "test.txt", "test content").unwrap();

        assert!(file_path.exists());
        let content = std::fs::read_to_string(&file_path).unwrap();
        assert_eq!(content, "test content");
    }

    #[test]
    fn test_generate_test_id() {
        let id1 = generate_test_id();
        let id2 = generate_test_id();

        assert_ne!(id1, id2);
        assert!(id1.starts_with("test-"));
    }

    #[test]
    fn test_fixture_creation() {
        let fixture = TestFixture::new();

        assert!(fixture.temp_path().exists());

        let db = fixture.db.lock().unwrap();
        let table_count: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table'",
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert!(table_count >= 5);
    }

    #[tokio::test]
    async fn test_wait_for_condition() {
        let mut counter = 0;
        let result = wait_for_condition(
            || {
                counter += 1;
                counter >= 3
            },
            1000,
        )
        .await;

        assert!(result);
        assert!(counter >= 3);
    }

    #[tokio::test]
    async fn test_wait_for_condition_timeout() {
        let result = wait_for_condition(|| false, 500).await;
        assert!(!result);
    }
}
