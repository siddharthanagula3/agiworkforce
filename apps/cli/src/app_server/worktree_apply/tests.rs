use super::*;
use agiworkforce_worktree::{checkpoint::Workspace, managed::StartPoint, TokioCommandRunner};
use std::{
    os::unix::fs::PermissionsExt,
    path::{Path, PathBuf},
};

fn git(root: &Path, args: &[&str]) -> Vec<u8> {
    let output = std::process::Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    output.stdout
}

struct Fixture {
    repo: tempfile::TempDir,
    trees: tempfile::TempDir,
    id: String,
    checkout: PathBuf,
    authority: WorkspaceFileAuthority,
}
impl Fixture {
    async fn new() -> Self {
        let repo = tempfile::tempdir().unwrap();
        git(repo.path(), &["init", "--initial-branch=main"]);
        git(repo.path(), &["config", "user.name", "Fixture"]);
        git(
            repo.path(),
            &["config", "user.email", "fixture@example.invalid"],
        );
        for (name, bytes) in [
            ("source.txt", b"original\n".as_slice()),
            ("removed.txt", b"remove later\n".as_slice()),
            ("exec.sh", b"echo fixture\n".as_slice()),
            (".env", b"PRIVATE_FIXTURE=original\n".as_slice()),
        ] {
            std::fs::write(repo.path().join(name), bytes).unwrap();
        }
        std::fs::set_permissions(
            repo.path().join("exec.sh"),
            std::fs::Permissions::from_mode(0o600),
        )
        .unwrap();
        git(repo.path(), &["add", "."]);
        git(
            repo.path(),
            &["-c", "core.hooksPath=/dev/null", "commit", "-m", "fixture"],
        );
        let trees = tempfile::tempdir().unwrap();
        let workspace = Workspace::discover(&TokioCommandRunner, repo.path())
            .await
            .unwrap()
            .unwrap();
        let manager = WorktreeManager::open(&TokioCommandRunner, trees.path(), &workspace);
        let created = manager
            .create(
                StartPoint::Ref {
                    name: "HEAD".into(),
                },
                None,
            )
            .await
            .unwrap();
        let authority = WorkspaceFileAuthority::new(repo.path()).unwrap();
        Self {
            repo,
            trees,
            id: created.worktree.marker.id,
            checkout: created.worktree.checkout,
            authority,
        }
    }
    async fn manager(&self) -> WorktreeManager<'static> {
        let workspace = Workspace::discover(&TokioCommandRunner, self.repo.path())
            .await
            .unwrap()
            .unwrap();
        WorktreeManager::open(&TokioCommandRunner, self.trees.path(), &workspace)
    }
    fn params(&self) -> WorktreeApplyPlanParams {
        WorktreeApplyPlanParams {
            root_key: self.authority.identity().unwrap(),
            worktree_id: self.id.clone(),
        }
    }
    fn commit(&self, plan: &WorktreeApplyPlan) -> WorktreeApplyCommitParams {
        WorktreeApplyCommitParams {
            root_key: plan.root_key.clone(),
            worktree_id: plan.worktree_id.clone(),
            plan_id: plan.plan_id.clone(),
        }
    }
}

#[tokio::test]
async fn plans_apply_exact_binary_unicode_deletions_and_executable_changes_without_staging() {
    let fixture = Fixture::new().await;
    let manager = fixture.manager().await;
    let policy = WorktreeApplyConfig::default();
    std::fs::write(fixture.checkout.join("source.txt"), "updated 東京\r\n🦀\n").unwrap();
    std::fs::write(fixture.checkout.join("binary.bin"), b"\0\xffbinary").unwrap();
    std::fs::remove_file(fixture.checkout.join("removed.txt")).unwrap();
    std::fs::set_permissions(
        fixture.checkout.join("exec.sh"),
        std::fs::Permissions::from_mode(0o700),
    )
    .unwrap();
    let mut state = ApplyState::default();
    let plan = state
        .prepare(&fixture.authority, &manager, fixture.params(), &policy)
        .await
        .unwrap();
    assert_eq!(plan.files.len(), 4);
    assert!(plan
        .files
        .iter()
        .all(|file| file.state == WorktreeApplyFileState::Ready));
    assert!(
        plan.files
            .iter()
            .find(|file| file.path == "binary.bin")
            .unwrap()
            .after
            .as_ref()
            .unwrap()
            .binary
    );
    assert_eq!(
        std::fs::read(fixture.repo.path().join("source.txt")).unwrap(),
        b"original\n"
    );
    let params = fixture.commit(&plan);
    let validated = state
        .validate_source(&manager, &params, &policy)
        .await
        .unwrap();
    let result = state.commit(&fixture.authority, validated).unwrap();
    assert!(result
        .files
        .iter()
        .all(|file| file.outcome == WorktreeApplyOutcome::Applied && !file.uncertain));
    assert_eq!(
        std::fs::read(fixture.repo.path().join("source.txt")).unwrap(),
        "updated 東京\r\n🦀\n".as_bytes()
    );
    assert_eq!(
        std::fs::read(fixture.repo.path().join("binary.bin")).unwrap(),
        b"\0\xffbinary"
    );
    assert!(!fixture.repo.path().join("removed.txt").exists());
    assert_eq!(
        std::fs::metadata(fixture.repo.path().join("exec.sh"))
            .unwrap()
            .permissions()
            .mode()
            & 0o777,
        0o700
    );
    assert!(git(fixture.repo.path(), &["diff", "--cached", "--name-only"]).is_empty());
    std::fs::write(fixture.repo.path().join("source.txt"), "later edits").unwrap();
    assert_eq!(state.completed(&params), Some(&result));
    assert_eq!(
        std::fs::read(fixture.repo.path().join("source.txt")).unwrap(),
        b"later edits"
    );
}

#[tokio::test]
async fn source_and_destination_changes_refuse_before_any_file_is_applied() {
    let fixture = Fixture::new().await;
    let manager = fixture.manager().await;
    let policy = WorktreeApplyConfig::default();
    std::fs::write(fixture.checkout.join("source.txt"), "incoming").unwrap();
    std::fs::write(fixture.checkout.join("first.txt"), "new file").unwrap();
    let mut state = ApplyState::default();
    let plan = state
        .prepare(&fixture.authority, &manager, fixture.params(), &policy)
        .await
        .unwrap();
    let params = fixture.commit(&plan);
    std::fs::write(fixture.checkout.join("later.txt"), "late source").unwrap();
    let refused_source = state
        .validate_source(&manager, &params, &policy)
        .await
        .err()
        .unwrap();
    let data: WorktreeApplyCommitFailure =
        serde_json::from_value(refused_source.data().unwrap().clone()).unwrap();
    assert!(!data.uncertain);
    assert_eq!(data.plan_id, plan.plan_id);
    assert!(!fixture.repo.path().join("first.txt").exists());
    std::fs::remove_file(fixture.checkout.join("later.txt")).unwrap();
    let validated = state
        .validate_source(&manager, &params, &policy)
        .await
        .unwrap();
    std::fs::write(
        fixture.repo.path().join("source.txt"),
        "external destination",
    )
    .unwrap();
    let failed = state.commit(&fixture.authority, validated).unwrap_err();
    let data: WorktreeApplyCommitFailure =
        serde_json::from_value(failed.data().unwrap().clone()).unwrap();
    assert!(!data.uncertain);
    assert!(!fixture.repo.path().join("first.txt").exists());
    assert_eq!(
        std::fs::read(fixture.repo.path().join("source.txt")).unwrap(),
        b"external destination"
    );
}

#[tokio::test]
async fn conflict_and_credential_paths_are_kept_while_independent_ready_files_apply() {
    let fixture = Fixture::new().await;
    let manager = fixture.manager().await;
    let policy = WorktreeApplyConfig::default();
    std::fs::write(fixture.checkout.join("source.txt"), "incoming").unwrap();
    std::fs::write(fixture.repo.path().join("source.txt"), "local edits").unwrap();
    std::fs::write(fixture.checkout.join(".env"), "PRIVATE_FIXTURE=incoming\n").unwrap();
    std::fs::write(fixture.checkout.join("new.txt"), "ready").unwrap();
    let mut state = ApplyState::default();
    let plan = state
        .prepare(&fixture.authority, &manager, fixture.params(), &policy)
        .await
        .unwrap();
    assert_eq!(
        plan.files
            .iter()
            .find(|file| file.path == "source.txt")
            .unwrap()
            .state,
        WorktreeApplyFileState::Conflict
    );
    let secret = plan.files.iter().find(|file| file.path == ".env").unwrap();
    assert_eq!(secret.state, WorktreeApplyFileState::Blocked);
    assert!(secret.before.is_none() && secret.after.is_none());
    assert!(!serde_json::to_string(&plan)
        .unwrap()
        .contains("PRIVATE_FIXTURE"));
    let validated = state
        .validate_source(&manager, &fixture.commit(&plan), &policy)
        .await
        .unwrap();
    let result = state.commit(&fixture.authority, validated).unwrap();
    assert_eq!(
        result
            .files
            .iter()
            .find(|file| file.path == "new.txt")
            .unwrap()
            .outcome,
        WorktreeApplyOutcome::Applied
    );
    assert_eq!(
        std::fs::read(fixture.repo.path().join("source.txt")).unwrap(),
        b"local edits"
    );
    assert_eq!(
        std::fs::read(fixture.repo.path().join(".env")).unwrap(),
        b"PRIVATE_FIXTURE=original\n"
    );
}

#[test]
fn response_bounds_measure_serialized_escapes_and_the_rpc_envelope() {
    let oversized = serde_json::json!({"text":"\0".repeat(1_000_000)});
    assert!(fits_frame(&oversized).is_err());
    assert!(fits_frame(&serde_json::json!({"text":"short"})).is_ok());
}

#[test]
fn apply_receipts_page_by_serialized_size_without_losing_error_or_recovery_details() {
    let files = (0..64)
        .map(|index| WorktreeApplyFileResult {
            path: format!("file-{index}"),
            outcome: WorktreeApplyOutcome::Failed,
            reason: Some("\u{1}".repeat(20_000)),
            uncertain: true,
            recovery_paths: vec![format!("/fixture/original-{index}")],
        })
        .collect::<Vec<_>>();
    let result = WorktreeApplyResult {
        root_key: "root".into(),
        worktree_id: "worktree".into(),
        plan_id: uuid::Uuid::new_v4().to_string(),
        files,
    };
    assert!(fits_frame(&result).is_err());
    let state = ApplyState {
        result: Some(result.clone()),
        ..Default::default()
    };
    let mut params = WorktreeApplyResultParams {
        root_key: result.root_key.clone(),
        worktree_id: result.worktree_id.clone(),
        plan_id: result.plan_id.clone(),
        after: None,
    };
    let mut collected = Vec::new();
    let mut page_count = 0;
    loop {
        let page = state.page(&params).unwrap();
        fits_frame(&page).unwrap();
        assert_eq!(page.total_files, 64);
        assert!(!page.files.is_empty());
        page_count += 1;
        collected.extend(page.files);
        let Some(after) = page.next_after else {
            break;
        };
        params.after = Some(after);
    }
    assert!(page_count > 1);
    assert_eq!(collected, result.files);
    params.plan_id = "foreign".into();
    assert!(state.page(&params).is_err());
}

#[tokio::test]
async fn source_hard_links_cannot_enter_the_apply_preview_or_original_folder() {
    let fixture = Fixture::new().await;
    let outside = tempfile::tempdir().unwrap();
    let secret = outside.path().join("private.txt");
    std::fs::write(&secret, "outside private fixture").unwrap();
    std::fs::remove_file(fixture.checkout.join("source.txt")).unwrap();
    std::fs::hard_link(&secret, fixture.checkout.join("source.txt")).unwrap();
    let manager = fixture.manager().await;
    let mut state = ApplyState::default();
    let plan = state
        .prepare(
            &fixture.authority,
            &manager,
            fixture.params(),
            &WorktreeApplyConfig::default(),
        )
        .await
        .unwrap();
    let source = plan
        .files
        .iter()
        .find(|file| file.path == "source.txt")
        .unwrap();
    assert_eq!(source.state, WorktreeApplyFileState::Blocked);
    assert!(source.after.is_none());
    assert!(!serde_json::to_string(&plan)
        .unwrap()
        .contains("outside private fixture"));
    assert_eq!(
        std::fs::read(fixture.repo.path().join("source.txt")).unwrap(),
        b"original\n"
    );
}
