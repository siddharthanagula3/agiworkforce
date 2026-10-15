//! Granted-folder checks on every executor path parameter, and the shared
//! `GrantedFolders::readable_path` and `GrantedFolders::writable_new_path`.

#[cfg(test)]
mod tests {
    use crate::core::agi::executors::deploy_executor::DeployExecutor;
    use crate::core::agi::executors::{
        CloudExecutor, ExecutorContext, FileExecutor, GitExecutor, GrantedFolders, ToolExecutor,
        UiExecutor, NO_GRANTED_FOLDER,
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
        assert!(granted
            .writable_new_path(&folder.path().join("new").join("..").join("x.txt"), "test")
            .is_err());
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
    async fn file_and_git_writes_refuse_a_link_to_a_missing_target() {
        let folder = TempDir::new().unwrap();
        let outside = TempDir::new().unwrap();
        let escaped = outside.path().join("escaped");
        let link = folder.path().join("x");
        std::os::unix::fs::symlink(&escaped, &link).unwrap();
        let granted = vec![folder.path().to_path_buf()];
        let link_value = json!(link.to_string_lossy());

        let write = params(&[("path", link_value.clone()), ("content", json!("payload"))]);
        let error = run(&FileExecutor, "file_write", &write, granted.clone()).await;
        assert!(error.contains("is a link to a missing target"), "{error}");

        let init = params(&[("path", link_value.clone())]);
        let error = run(&GitExecutor::new(), "git_init", &init, granted.clone()).await;
        assert!(error.contains("is a link to a missing target"), "{error}");

        let clone = params(&[
            ("url", json!("https://github.com/example/repo.git")),
            ("destination", link_value),
        ]);
        let error = run(&GitExecutor::new(), "git_clone", &clone, granted).await;
        assert!(error.contains("is a link to a missing target"), "{error}");

        assert!(!escaped.exists());
    }

    #[tokio::test]
    async fn a_git_file_pointing_outside_the_grant_is_refused() {
        let folder = TempDir::new().unwrap();
        let outside = TempDir::new().unwrap();
        let real = git2::Repository::init(outside.path()).unwrap();
        let work_tree = folder.path().join("repo");
        std::fs::create_dir(&work_tree).unwrap();
        std::fs::write(
            work_tree.join(".git"),
            format!("gitdir: {}\n", real.path().display()),
        )
        .unwrap();
        let path = json!(work_tree.to_string_lossy());

        for (tool, parameters) in [
            ("git_status", params(&[("path", path.clone())])),
            (
                "git_add",
                params(&[("path", path.clone()), ("files", json!(["."]))]),
            ),
            (
                "git_commit",
                params(&[("path", path.clone()), ("message", json!("message"))]),
            ),
        ] {
            let error = run(
                &GitExecutor::new(),
                tool,
                &parameters,
                vec![folder.path().to_path_buf()],
            )
            .await;
            assert!(
                error.contains("outside allowed directories"),
                "{tool}: {error}"
            );
        }
    }

    #[tokio::test]
    async fn an_alternate_object_directory_outside_the_grant_is_refused() {
        let folder = TempDir::new().unwrap();
        let outside = TempDir::new().unwrap();
        let borrowed = git2::Repository::init_bare(outside.path()).unwrap();
        let repo = git2::Repository::init(folder.path().join("repo")).unwrap();
        std::fs::write(
            repo.path().join("objects").join("info").join("alternates"),
            format!("{}\n", borrowed.path().join("objects").display()),
        )
        .unwrap();
        let parameters = params(&[("path", json!(folder.path().join("repo").to_string_lossy()))]);

        let error = run(
            &GitExecutor::new(),
            "git_status",
            &parameters,
            vec![folder.path().to_path_buf()],
        )
        .await;

        assert!(error.contains("outside allowed directories"), "{error}");
    }

    #[tokio::test]
    async fn a_nested_alternate_outside_the_grant_is_refused() {
        let folder = TempDir::new().unwrap();
        let outside = TempDir::new().unwrap();
        let borrowed = git2::Repository::init_bare(outside.path()).unwrap();
        let middle = git2::Repository::init_bare(folder.path().join("middle")).unwrap();
        let repo = git2::Repository::init(folder.path().join("repo")).unwrap();
        for (from, to) in [(&repo, &middle), (&middle, &borrowed)] {
            std::fs::write(
                from.path().join("objects").join("info").join("alternates"),
                format!("{}\n", to.path().join("objects").display()),
            )
            .unwrap();
        }
        let parameters = params(&[("path", json!(folder.path().join("repo").to_string_lossy()))]);

        let error = run(
            &GitExecutor::new(),
            "git_status",
            &parameters,
            vec![folder.path().to_path_buf()],
        )
        .await;

        assert!(error.contains("outside allowed directories"), "{error}");
    }

    #[tokio::test]
    async fn an_alternate_libgit2_would_resolve_elsewhere_is_refused() {
        let folder = TempDir::new().unwrap();
        let repo = git2::Repository::init(folder.path().join("repo")).unwrap();
        let objects = repo.path().join("objects");
        std::fs::create_dir_all(objects.join("Users").join("x")).unwrap();
        let inside = git2::Repository::init_bare(folder.path().join("inside")).unwrap();
        let parameters = params(&[("path", json!(folder.path().join("repo").to_string_lossy()))]);

        for entry in [
            "Users/x".to_string(),
            format!(" {}", inside.path().join("objects").display()),
            format!("{} ", inside.path().join("objects").display()),
        ] {
            std::fs::write(
                objects.join("info").join("alternates"),
                format!("{entry}\n"),
            )
            .unwrap();
            let error = run(
                &GitExecutor::new(),
                "git_status",
                &parameters,
                vec![folder.path().to_path_buf()],
            )
            .await;
            assert!(
                error.contains("is neither an absolute path"),
                "{entry:?}: {error}"
            );
        }
    }

    #[tokio::test]
    async fn a_core_worktree_outside_the_grant_is_refused() {
        let folder = TempDir::new().unwrap();
        let outside = TempDir::new().unwrap();
        let repo = git2::Repository::init(folder.path().join("repo")).unwrap();
        repo.config()
            .unwrap()
            .set_str("core.worktree", &outside.path().to_string_lossy())
            .unwrap();
        let parameters = params(&[("path", json!(folder.path().join("repo").to_string_lossy()))]);

        let error = run(
            &GitExecutor::new(),
            "git_status",
            &parameters,
            vec![folder.path().to_path_buf()],
        )
        .await;

        assert!(error.contains("outside allowed directories"), "{error}");
    }

    #[tokio::test]
    async fn a_push_to_a_local_remote_is_refused() {
        let folder = TempDir::new().unwrap();
        let outside = TempDir::new().unwrap();
        let target = git2::Repository::init_bare(outside.path()).unwrap();
        let repo = git2::Repository::init(folder.path().join("repo")).unwrap();
        let signature = git2::Signature::now("Test", "test@example.com").unwrap();
        let tree = repo
            .find_tree(repo.index().unwrap().write_tree().unwrap())
            .unwrap();
        repo.commit(
            Some("refs/heads/feature"),
            &signature,
            &signature,
            "initial",
            &tree,
            &[],
        )
        .unwrap();
        repo.set_head("refs/heads/feature").unwrap();

        for (name, url) in [
            ("local", outside.path().to_string_lossy().to_string()),
            ("file", format!("file://{}", outside.path().display())),
        ] {
            repo.remote(name, &url).unwrap();
            let push = params(&[
                ("path", json!(folder.path().join("repo").to_string_lossy())),
                ("remote", json!(name)),
                ("branch", json!("feature")),
            ]);
            let error = run(
                &GitExecutor::new(),
                "git_push",
                &push,
                vec![folder.path().to_path_buf()],
            )
            .await;
            assert!(error.contains("is not an https://"), "{name}: {error}");
        }
        assert!(target.find_reference("refs/heads/feature").is_err());
    }

    #[tokio::test]
    async fn a_local_clone_source_is_refused() {
        let folder = TempDir::new().unwrap();
        for url in ["file:///etc", "C:\\repo", "/etc"] {
            let clone = params(&[
                ("url", json!(url)),
                (
                    "destination",
                    json!(folder.path().join("clone").to_string_lossy()),
                ),
            ]);
            let error = run(
                &GitExecutor::new(),
                "git_clone",
                &clone,
                vec![folder.path().to_path_buf()],
            )
            .await;
            assert!(error.contains("Invalid repository URL"), "{url}: {error}");
        }
    }

    #[tokio::test]
    async fn secrets_inside_a_granted_home_are_refused() {
        let home = TempDir::new().unwrap();
        let ssh = home.path().join(".ssh");
        std::fs::create_dir(&ssh).unwrap();
        let key = ssh.join("id_ed25519");
        std::fs::write(&key, "private key").unwrap();
        let granted = vec![home.path().to_path_buf()];

        let read = params(&[("path", json!(key.to_string_lossy()))]);
        let error = run(&FileExecutor, "file_read", &read, granted.clone()).await;
        assert!(error.contains("protected secrets path"), "{error}");

        let write = params(&[
            ("path", json!(ssh.join("authorized_keys").to_string_lossy())),
            ("content", json!("ssh-ed25519 AAAA")),
        ]);
        let error = run(&FileExecutor, "file_write", &write, granted).await;
        assert!(error.contains("protected secrets path"), "{error}");
        assert!(!ssh.join("authorized_keys").exists());
    }

    #[tokio::test]
    async fn cloud_paths_need_a_granted_folder() {
        let folder = TempDir::new().unwrap();
        let file = file_in(&folder, "upload.txt");
        let saved = folder.path().join("download.txt");
        let upload = params(&[
            ("account_id", json!("account")),
            ("local_path", json!(file.to_string_lossy())),
            ("remote_path", json!("/remote.txt")),
        ]);
        let download = params(&[
            ("account_id", json!("account")),
            ("remote_path", json!("/remote.txt")),
            ("local_path", json!(saved.to_string_lossy())),
        ]);

        for (tool, parameters) in [("cloud_upload", &upload), ("cloud_download", &download)] {
            assert_refused(&run(&CloudExecutor::new(), tool, parameters, vec![]).await);
            let allowed = run(
                &CloudExecutor::new(),
                tool,
                parameters,
                vec![folder.path().to_path_buf()],
            )
            .await;
            assert_not_refused(&allowed);
            assert!(allowed.contains("right now"), "{tool}: {allowed}");
        }
        assert!(!saved.exists());
    }

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

    #[tokio::test]
    async fn deploy_source_needs_a_granted_folder() {
        let folder = TempDir::new().unwrap();
        let deploy = params(&[
            ("source_path", json!(folder.path().to_string_lossy())),
            ("project_name", json!("project")),
        ]);

        assert_refused(&run(&DeployExecutor::new(), "deploy_project", &deploy, vec![]).await);
        let allowed = run(
            &DeployExecutor::new(),
            "deploy_project",
            &deploy,
            vec![folder.path().to_path_buf()],
        )
        .await;
        assert!(allowed.contains("no app handle"), "{allowed}");
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
