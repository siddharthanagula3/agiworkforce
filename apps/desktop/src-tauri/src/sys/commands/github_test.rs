#[cfg(test)]
mod tests {
    #[allow(unused_imports)]
    use crate::sys::commands::{github_clone_repo, GitHubState};
    use std::sync::Arc;
    use tokio::sync::Mutex as TokioMutex;

    #[tokio::test]
    async fn test_parse_github_url() {
        let _state = Arc::new(TokioMutex::new(GitHubState::new(std::path::PathBuf::from(
            "/tmp",
        ))));
    }

    #[tokio::test]
    async fn test_language_detection() {
        let temp_dir = std::env::temp_dir().join("test_repo");
        std::fs::create_dir_all(&temp_dir).unwrap();
        std::fs::write(temp_dir.join("test.rs"), "fn main() {}").unwrap();
        std::fs::write(temp_dir.join("test.ts"), "console.log('test')").unwrap();

        std::fs::remove_dir_all(&temp_dir).ok();
    }
}
