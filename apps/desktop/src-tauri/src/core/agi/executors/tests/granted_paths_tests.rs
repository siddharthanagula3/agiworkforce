//! Granted-folder checks on every executor path parameter, and the shared
//! `GrantedFolders::readable_path` and `GrantedFolders::writable_new_path`.

#[cfg(test)]
mod tests {
    use crate::core::agi::executors::{
        ExecutorContext, GrantedFolders, ToolExecutor, UiExecutor, NO_GRANTED_FOLDER,
    };
    use crate::core::agi::{ExecutionContext, Goal, Priority, ResourceState};
    use serde_json::{json, Value};
    use std::collections::HashMap;
    use std::path::PathBuf;
    use std::sync::Arc;
    use tempfile::TempDir;

    fn context(granted_directories: Vec<PathBuf>) -> ExecutorContext {
        ExecutorContext {
            app_handle: None,
            router: Arc::new(tokio::sync::RwLock::new(crate::core::llm::LLMRouter::new())),
            tool_cache: Arc::new(crate::data::cache::ToolResultCache::new()),
            security_guard: Arc::new(crate::sys::security::ToolExecutionGuard::new()),
            change_tracker: None,
            session_id: "granted_paths_session".to_string(),
            tool_id: "granted_paths_test".to_string(),
            granted_directories,
        }
    }

    fn execution_context() -> ExecutionContext {
        ExecutionContext {
            goal: Goal {
                id: "granted_paths_goal".to_string(),
                description: "Granted path checks".to_string(),
                priority: Priority::Medium,
                deadline: None,
                constraints: vec![],
                success_criteria: vec![],
                trust_mode: None,
            },
            current_state: HashMap::new(),
            available_resources: ResourceState {
                cpu_usage_percent: 0.0,
                memory_usage_mb: 0,
                network_usage_mbps: 0.0,
                storage_usage_mb: 0,
                available_tools: vec![],
            },
            tool_results: vec![],
            context_memory: vec![],
        }
    }

    fn params(pairs: &[(&str, Value)]) -> HashMap<String, Value> {
        pairs
            .iter()
            .map(|(key, value)| (key.to_string(), value.clone()))
            .collect()
    }

    fn file_in(folder: &TempDir, name: &str) -> PathBuf {
        let file = folder.path().join(name);
        std::fs::write(&file, "data").unwrap();
        file
    }

    async fn run(
        executor: &dyn ToolExecutor,
        tool: &str,
        parameters: &HashMap<String, Value>,
        granted: Vec<PathBuf>,
    ) -> String {
        executor
            .execute(tool, parameters, &context(granted), &execution_context())
            .await
            .unwrap_err()
            .to_string()
    }

    fn assert_refused(error: &str) {
        assert!(
            error.contains(NO_GRANTED_FOLDER) || error.contains("Access denied"),
            "expected a refusal, got: {error}"
        );
    }

    fn assert_not_refused(error: &str) {
        assert!(
            !error.contains(NO_GRANTED_FOLDER) && !error.contains("Access denied"),
            "expected the granted path to be allowed, got: {error}"
        );
    }

    #[test]
    fn writable_new_path_allows_missing_folders_inside_a_grant() {
        let folder = TempDir::new().unwrap();
        let granted = GrantedFolders::verify(vec![(folder.path().to_path_buf(), true)]);
        let target = folder.path().join("a").join("b").join("c.txt");

        let resolved = granted.writable_new_path(&target, "test").unwrap();

        assert_eq!(
            resolved,
            std::fs::canonicalize(folder.path())
                .unwrap()
                .join("a")
                .join("b")
                .join("c.txt")
        );
    }

    #[test]
    fn writable_new_path_refuses_outside_read_only_and_parent_names() {
        let folder = TempDir::new().unwrap();
        let outside = TempDir::new().unwrap();
        let granted = GrantedFolders::verify(vec![(folder.path().to_path_buf(), true)]);
        let read_only = GrantedFolders::verify(vec![(folder.path().to_path_buf(), false)]);

        assert!(granted
            .writable_new_path(&outside.path().join("x.txt"), "test")
            .unwrap_err()
            .to_string()
            .contains("outside allowed directories"));
        assert!(read_only
            .writable_new_path(&folder.path().join("x.txt"), "test")
            .unwrap_err()
            .to_string()
            .contains("granted for reading only"));
        for parent_named in [
            folder.path().join("new").join("..").join("x.txt"),
            folder.path().join("..").join("x.txt"),
        ] {
            assert!(granted
                .writable_new_path(&parent_named, "test")
                .unwrap_err()
                .to_string()
                .contains("names a parent folder"));
        }
    }

    #[test]
    fn a_refused_filesystem_root_never_claims_a_denied_path() {
        let folder = TempDir::new().unwrap();
        let outside = TempDir::new().unwrap();
        let root = folder.path().ancestors().last().unwrap().to_path_buf();
        let depth = std::fs::canonicalize(folder.path())
            .unwrap()
            .components()
            .count()
            - 1;
        let root_alias = (0..depth).fold(folder.path().to_path_buf(), |alias, _| alias.join(".."));
        let granted = GrantedFolders::verify(vec![
            (root, true),
            (root_alias, true),
            (folder.path().to_path_buf(), true),
        ]);

        let error = granted
            .denial(
                &std::fs::canonicalize(outside.path()).unwrap(),
                "outside".to_string(),
            )
            .to_string();

        assert_eq!(error, "outside");
        assert!(!granted.contains(outside.path()));
    }

    #[test]
    fn readable_path_refuses_outside_the_grant() {
        let folder = TempDir::new().unwrap();
        let outside = TempDir::new().unwrap();
        let inside_file = file_in(&folder, "in.txt");
        let outside_file = file_in(&outside, "out.txt");
        let granted = GrantedFolders::verify(vec![(folder.path().to_path_buf(), false)]);

        assert_eq!(
            granted.readable_path(&inside_file, "test").unwrap(),
            std::fs::canonicalize(&inside_file).unwrap()
        );
        assert!(granted
            .readable_path(&outside_file, "test")
            .unwrap_err()
            .to_string()
            .contains("outside allowed directories"));
    }

    #[cfg(unix)]
    #[test]
    fn writable_new_path_refuses_a_link_to_a_missing_target() {
        let folder = TempDir::new().unwrap();
        let outside = TempDir::new().unwrap();
        let escaped = outside.path().join("escaped.txt");
        let link = folder.path().join("x");
        std::os::unix::fs::symlink(&escaped, &link).unwrap();
        let missing_dir = folder.path().join("dir");
        std::os::unix::fs::symlink(outside.path().join("missing"), &missing_dir).unwrap();
        let granted = GrantedFolders::verify(vec![(folder.path().to_path_buf(), true)]);

        for path in [link.clone(), missing_dir.join("file.txt")] {
            let error = granted
                .writable_new_path(&path, "test")
                .unwrap_err()
                .to_string();
            assert!(error.contains("is a link to a missing target"), "{error}");
        }
        assert!(!escaped.exists());
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn ui_image_ocr_needs_a_granted_folder() {
        let folder = TempDir::new().unwrap();
        let image = file_in(&folder, "image.png");
        let ocr = params(&[("image_path", json!(image.to_string_lossy()))]);
        let executor = UiExecutor::new();

        assert_refused(&run(&executor, "image_ocr", &ocr, vec![]).await);
        if let Err(error) = executor
            .execute(
                "image_ocr",
                &ocr,
                &context(vec![folder.path().to_path_buf()]),
                &execution_context(),
            )
            .await
        {
            assert_not_refused(&error.to_string());
        }
    }

    #[test]
    fn prune_agent_artifacts_deletes_only_old_files() {
        let artifacts = TempDir::new().unwrap();
        let outside = TempDir::new().unwrap();
        let old = file_in(&artifacts, "old.png");
        let fresh = file_in(&artifacts, "fresh.png");
        let folder = artifacts.path().join("folder");
        std::fs::create_dir(&folder).unwrap();
        let two_weeks_ago =
            std::time::SystemTime::now() - std::time::Duration::from_secs(14 * 24 * 60 * 60);
        std::fs::File::options()
            .write(true)
            .open(&old)
            .unwrap()
            .set_modified(two_weeks_ago)
            .unwrap();
        let target = file_in(&outside, "target.txt");
        std::fs::File::options()
            .write(true)
            .open(&target)
            .unwrap()
            .set_modified(two_weeks_ago)
            .unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(&target, artifacts.path().join("link")).unwrap();

        crate::core::agi::executors::prune_agent_artifacts(
            artifacts.path(),
            std::time::Duration::from_secs(7 * 24 * 60 * 60),
        );

        assert!(!old.exists());
        assert!(fresh.exists());
        assert!(folder.exists());
        assert!(target.exists());
    }
}
