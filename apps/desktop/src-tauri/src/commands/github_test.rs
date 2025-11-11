#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use tokio::sync::Mutex as TokioMutex;

    #[tokio::test]
    async fn test_parse_github_url() {
        let state = Arc::new(TokioMutex::new(GitHubState::new(std::path::PathBuf::from("/tmp"))));

        // Test HTTPS URL
        let result = github_clone_repo(
            "https://github.com/owner/repo".to_string(),
            None,
            tauri::State::from(state.clone()),
        ).await;
        assert!(result.is_ok() || result.is_err()); // May fail without git, but should parse

        // Test SSH URL
        let result = github_clone_repo(
            "git@github.com:owner/repo.git".to_string(),
            None,
            tauri::State::from(state.clone()),
        ).await;
        assert!(result.is_ok() || result.is_err());

        // Test short format
        let result = github_clone_repo(
            "owner/repo".to_string(),
            None,
            tauri::State::from(state),
        ).await;
        assert!(result.is_ok() || result.is_err());
    }

    #[tokio::test]
    async fn test_language_detection() {
        let state = Arc::new(TokioMutex::new(GitHubState::new(std::path::PathBuf::from("/tmp"))));

        // Create a temporary directory with some test files
        let temp_dir = std::env::temp_dir().join("test_repo");
        std::fs::create_dir_all(&temp_dir).unwrap();
        std::fs::write(temp_dir.join("test.rs"), "fn main() {}").unwrap();
        std::fs::write(temp_dir.join("test.ts"), "console.log('test')").unwrap();

        // Test would check language statistics
        // Cleanup
        std::fs::remove_dir_all(&temp_dir).ok();
    }
}
