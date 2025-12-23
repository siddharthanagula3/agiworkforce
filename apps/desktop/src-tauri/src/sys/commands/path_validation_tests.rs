#[cfg(test)]
mod tests {
    use crate::sys::commands::file_ops::file_exists;

    #[tokio::test]
    async fn test_path_traversal_detection() {
        let result = file_exists("../etc/passwd".to_string()).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("directory traversal"));

        let result = file_exists("foo/bar/../../baz".to_string()).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("directory traversal"));
    }

    #[tokio::test]
    async fn test_null_byte_detection() {
        let result = file_exists("safe_path.txt\0.exe".to_string()).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("null bytes"));
    }

    #[tokio::test]
    async fn test_valid_path() {
        let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or(".".to_string());
        let result = file_exists(manifest_dir).await;
        assert!(result.is_ok());
    }
}
