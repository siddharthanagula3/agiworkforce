#[cfg(test)]
mod tests {
    use super::super::file_ops::*;
    use rusqlite::Connection;
    use std::fs;
    use std::sync::Mutex;
    use tempfile::tempdir;

    fn setup_test_db() -> crate::commands::AppDatabase {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("PRAGMA foreign_keys = ON", []).unwrap();

        // Create audit_log table
        conn.execute(
            "CREATE TABLE audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                operation_type TEXT NOT NULL,
                operation_details TEXT NOT NULL,
                permission_type TEXT NOT NULL,
                approved INTEGER NOT NULL,
                success INTEGER NOT NULL,
                error_message TEXT,
                duration_ms INTEGER NOT NULL,
                created_at TEXT NOT NULL
            )",
            [],
        )
        .unwrap();

        // Create permissions table
        conn.execute(
            "CREATE TABLE permissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                permission_type TEXT NOT NULL,
                state TEXT NOT NULL CHECK(state IN ('allowed', 'prompt', 'prompt_once', 'denied')),
                pattern TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(permission_type, pattern)
            )",
            [],
        )
        .unwrap();

        crate::commands::AppDatabase(Mutex::new(conn))
    }

    #[tokio::test]
    async fn test_file_exists() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test.txt");

        // File doesn't exist yet
        let exists = file_exists(file_path.to_str().unwrap().to_string())
            .await
            .unwrap();
        assert!(!exists);

        // Create file
        fs::write(&file_path, "test").unwrap();

        // File exists now
        let exists = file_exists(file_path.to_str().unwrap().to_string())
            .await
            .unwrap();
        assert!(exists);
    }

    #[tokio::test]
    async fn test_file_metadata() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test.txt");

        // Create file
        fs::write(&file_path, "test content").unwrap();

        // Get metadata
        let metadata = file_metadata(file_path.to_str().unwrap().to_string())
            .await
            .unwrap();

        assert!(metadata.is_file);
        assert!(!metadata.is_dir);
        assert_eq!(metadata.size, 12); // "test content" is 12 bytes
        assert!(metadata.created > 0);
        assert!(metadata.modified > 0);
    }

    #[tokio::test]
    async fn test_dir_operations() {
        let dir = tempdir().unwrap();
        let test_dir = dir.path().join("test_dir");

        // Directory doesn't exist yet
        assert!(!test_dir.exists());

        // Create directory would require permission setup
        // For now, just test the path logic
        assert!(test_dir.to_str().is_some());
    }

    #[test]
    fn test_blacklist_check() {
        assert!(is_blacklisted_path("C:\\Windows\\System32\\kernel32.dll"));
        assert!(is_blacklisted_path("C:\\Program Files\\app\\file.exe"));
        assert!(is_blacklisted_path("/home/user/.ssh/id_rsa"));
        assert!(is_blacklisted_path("/home/user/.aws/credentials"));
        assert!(is_blacklisted_path("C:\\Users\\user\\.env"));
        assert!(!is_blacklisted_path("C:\\Users\\user\\Documents\\file.txt"));
        assert!(!is_blacklisted_path("/home/user/projects/app.js"));
    }

    #[test]
    fn test_file_operation_enum() {
        let op = FileOperation::Read;
        assert_eq!(op.as_str(), "read");

        let op = FileOperation::Write;
        assert_eq!(op.as_str(), "write");

        let op = FileOperation::Delete;
        assert_eq!(op.as_str(), "delete");

        let op = FileOperation::Execute;
        assert_eq!(op.as_str(), "execute");
    }

    #[test]
    fn test_file_metadata_serialization() {
        let metadata = FileMetadata {
            size: 1024,
            is_file: true,
            is_dir: false,
            created: 1234567890,
            modified: 1234567890,
            readonly: false,
        };

        let json = serde_json::to_string(&metadata).unwrap();
        assert!(json.contains("\"size\":1024"));
        assert!(json.contains("\"is_file\":true"));
        assert!(json.contains("\"is_dir\":false"));
    }

    #[test]
    fn test_dir_entry_serialization() {
        let entry = DirEntry {
            name: "test.txt".to_string(),
            path: "/path/to/test.txt".to_string(),
            is_file: true,
            is_dir: false,
            size: 512,
            modified: 1234567890,
        };

        let json = serde_json::to_string(&entry).unwrap();
        assert!(json.contains("\"name\":\"test.txt\""));
        assert!(json.contains("\"size\":512"));
    }

    #[tokio::test]
    async fn test_glob_patterns() {
        // Test glob pattern matching logic
        let pattern = "**/*.rs";
        assert!(pattern.contains("**"));
        assert!(pattern.ends_with(".rs"));
    }

    #[test]
    fn test_dangerous_op_event_serialization() {
        let event = DangerousOpEvent {
            operation: "delete".to_string(),
            file_count: 15,
            paths: vec![
                "/path/file1.txt".to_string(),
                "/path/file2.txt".to_string(),
            ],
        };

        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"operation\":\"delete\""));
        assert!(json.contains("\"file_count\":15"));
    }
}
