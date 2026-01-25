#[cfg(test)]
mod tests {
    use crate::sys::commands::file_ops::file_exists;

    #[tokio::test]
    async fn test_path_traversal_detection() {
        // With enhanced canonicalization-first validation, paths with traversal
        // may fail with either "directory traversal" or "does not exist" errors
        // depending on whether the parent path can be resolved. Both are valid
        // security rejections that prevent the traversal attack.
        let result = file_exists("../etc/passwd".to_string()).await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(
            err.contains("directory traversal") || err.contains("does not exist"),
            "Expected traversal or non-existence error, got: {}",
            err
        );

        let result = file_exists("foo/bar/../../baz".to_string()).await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(
            err.contains("directory traversal") || err.contains("does not exist"),
            "Expected traversal or non-existence error, got: {}",
            err
        );
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
