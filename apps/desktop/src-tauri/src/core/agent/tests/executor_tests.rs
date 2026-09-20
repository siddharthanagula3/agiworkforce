// C11: Tests for validate_file_path and validate_write_path
#[cfg(test)]
mod tests {
    use crate::core::agent::executor::TaskExecutor;

    // -- validate_file_path tests --

    #[test]
    fn validate_file_path_null_byte_is_rejected() {
        let result = TaskExecutor::validate_file_path("/tmp/foo\0bar");
        assert!(result.is_err(), "Null byte in path should be rejected");
        let err_msg = result.unwrap_err().to_string();
        assert!(
            err_msg.contains("null bytes"),
            "Error should mention null bytes, got: {}",
            err_msg
        );
    }

    #[test]
    fn validate_file_path_ssh_dir_is_rejected() {
        if let Some(home) = dirs::home_dir() {
            let ssh_path = home.join(".ssh");
            if ssh_path.exists() {
                let result = TaskExecutor::validate_file_path(ssh_path.to_str().unwrap());
                assert!(
                    result.is_err(),
                    "~/.ssh should be rejected as a protected user path"
                );
            }
        }
    }

    #[test]
    fn validate_file_path_gnupg_dir_is_rejected() {
        if let Some(home) = dirs::home_dir() {
            let gnupg_path = home.join(".gnupg");
            if gnupg_path.exists() {
                let result = TaskExecutor::validate_file_path(gnupg_path.to_str().unwrap());
                assert!(
                    result.is_err(),
                    "~/.gnupg should be rejected as a protected user path"
                );
            }
        }
    }

    #[test]
    fn validate_file_path_valid_path_succeeds() {
        let temp = tempfile::tempdir().unwrap();
        let result = TaskExecutor::validate_file_path(temp.path().to_str().unwrap());
        assert!(
            result.is_ok(),
            "Temporary directory should be accessible, got: {:?}",
            result.err()
        );
    }

    #[test]
    fn validate_file_path_nonexistent_path_is_rejected() {
        let result = TaskExecutor::validate_file_path("/nonexistent_path_abc123xyz");
        assert!(
            result.is_err(),
            "Non-existent path should fail canonicalization"
        );
    }

    // -- validate_write_path tests --

    #[test]
    fn validate_write_path_null_byte_is_rejected() {
        let result = TaskExecutor::validate_write_path("/tmp/foo\0bar");
        assert!(
            result.is_err(),
            "Null byte in write path should be rejected"
        );
        let err_msg = result.unwrap_err().to_string();
        assert!(
            err_msg.contains("null bytes"),
            "Error should mention null bytes, got: {}",
            err_msg
        );
    }

    #[test]
    fn validate_write_path_dot_dot_traversal_is_rejected() {
        let result = TaskExecutor::validate_write_path("/tmp/../etc/passwd");
        assert!(
            result.is_err(),
            "Path traversal with '..' should be rejected"
        );
        let err_msg = result.unwrap_err().to_string();
        assert!(
            err_msg.contains("traversal") || err_msg.contains(".."),
            "Error should mention traversal, got: {}",
            err_msg
        );
    }

    #[test]
    fn validate_write_path_ssh_is_rejected() {
        if let Some(home) = dirs::home_dir() {
            let ssh_path = format!("{}/.ssh/new_key", home.display());
            let result = TaskExecutor::validate_write_path(&ssh_path);
            assert!(
                result.is_err(),
                "~/.ssh/ paths should be rejected for writes"
            );
        }
    }

    #[test]
    fn validate_write_path_config_is_rejected() {
        if let Some(home) = dirs::home_dir() {
            let config_path = format!("{}/.config/new_file", home.display());
            let result = TaskExecutor::validate_write_path(&config_path);
            assert!(
                result.is_err(),
                "~/.config/ paths should be rejected for writes"
            );
        }
    }

    #[test]
    fn validate_write_path_valid_temp_path_succeeds() {
        let temp = tempfile::tempdir().unwrap();
        let result = TaskExecutor::validate_write_path(
            temp.path().join("test_write_file.txt").to_str().unwrap(),
        );
        assert!(
            result.is_ok(),
            "Temporary file should be a valid write path, got: {:?}",
            result.err()
        );
    }
    #[cfg(unix)]
    #[test]
    fn validate_write_path_rejects_dangling_symlinks_and_preserves_resolved_links() {
        let temp = tempfile::tempdir().unwrap();
        let target = temp.path().join("missing.txt");
        let link = temp.path().join("link.txt");
        std::os::unix::fs::symlink(&target, &link).unwrap();
        assert!(TaskExecutor::validate_write_path(link.to_str().unwrap()).is_err());
        assert!(!target.exists());
        std::fs::write(&target, b"existing").unwrap();
        assert_eq!(
            TaskExecutor::validate_write_path(link.to_str().unwrap()).unwrap(),
            std::fs::canonicalize(&target).unwrap()
        );
    }

    #[cfg(windows)]
    #[test]
    fn canonical_home_secrets_are_rejected_for_nonexistent_write_targets() {
        let home = std::fs::canonicalize(dirs::home_dir().unwrap()).unwrap();
        for directory in [".ssh", ".config", ".gnupg"] {
            let target = home.join(directory).join("new-secret");
            let error = TaskExecutor::validate_write_path(target.to_str().unwrap()).unwrap_err();
            assert!(error.to_string().contains("protected user path"));
        }
    }

    #[cfg(windows)]
    #[test]
    fn canonical_system_directories_are_rejected_for_reads_and_writes() {
        let path = std::fs::canonicalize(r"C:\Windows\System32").unwrap();
        assert!(TaskExecutor::validate_file_path(path.to_str().unwrap())
            .unwrap_err()
            .to_string()
            .contains("protected system path"));
        assert!(
            TaskExecutor::validate_write_path(path.join("new-file").to_str().unwrap())
                .unwrap_err()
                .to_string()
                .contains("protected system path")
        );
    }
}
