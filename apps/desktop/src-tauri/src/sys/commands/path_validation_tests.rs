#[cfg(test)]
mod tests {
    use crate::sys::commands::file_ops::file_exists;

    #[test]
    fn protected_prefixes_preserve_case_insensitive_policy_and_component_boundaries() {
        use crate::sys::commands::file_ops::is_blacklisted_path;
        for path in [
            "/PRIVATE/ETC/PASSWD",
            r"C:\WINDOWS\System32\cmd.exe",
            r"\\?\C:\Windows\System32\cmd.exe",
            "C:/Windows/System32/cmd.exe",
        ] {
            assert!(is_blacklisted_path(path), "{path}");
        }
        for path in ["/etc/passwd-backup", r"C:\Windows\System32-backup\file"] {
            assert!(!is_blacklisted_path(path), "{path}");
        }
    }

    #[cfg(unix)]
    #[test]
    fn dangling_symlinks_are_rejected_and_resolved_links_keep_their_destination() {
        use crate::sys::commands::file_ops::validate_path_security;
        let temp = tempfile::tempdir().unwrap();
        let target = temp.path().join("missing.txt");
        let link = temp.path().join("link.txt");
        std::os::unix::fs::symlink(&target, &link).unwrap();
        assert!(validate_path_security(link.to_str().unwrap()).is_err());
        assert!(!target.exists());
        std::fs::write(&target, b"existing").unwrap();
        assert_eq!(
            validate_path_security(link.to_str().unwrap()).unwrap(),
            std::fs::canonicalize(&target).unwrap()
        );
    }

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
    async fn traversal_is_rejected_before_existing_directories_are_resolved() {
        let temp = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(temp.path().join("nested/deeper")).unwrap();
        let traversal = temp.path().join("nested/deeper/../../file.txt");
        let error = file_exists(traversal.to_string_lossy().into_owned())
            .await
            .unwrap_err();
        assert!(error.contains("directory traversal"));
        let benign = temp.path().join("release..txt");
        std::fs::write(&benign, b"allowed").unwrap();
        assert!(file_exists(benign.to_string_lossy().into_owned())
            .await
            .unwrap());
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
