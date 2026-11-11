use agiworkforce_desktop_gpui::{
    changes::{validate_outcome, Changes},
    config::{NativeContracts, Settings},
    runtime::{consent_timestamp_ms, RuntimeSession},
};
use agiworkforce_protocol::developer_session::*;
use agiworkforce_worktree::{
    checkpoint::{Checkpoints, Phase, Workspace},
    TokioCommandRunner,
};
use std::path::{Path, PathBuf};

fn git(root: &Path, args: &[&str]) -> String {
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
    String::from_utf8(output.stdout).unwrap()
}

#[cfg(unix)]
#[tokio::test]
#[ignore = "run through the isolated packaged local review runner"]
async fn real_local_changes_reviewed_worktree_apply_is_scoped_versioned_and_idempotent() {
    use agiworkforce_protocol::worktree_apply::*;
    assert_eq!(
        std::env::var("AGI_GPUI_CHANGES_FIXTURE").as_deref(),
        Ok("1")
    );
    let binary = PathBuf::from(std::env::var_os("AGI_GPUI_TEST_RUNTIME").unwrap());
    let repo = tempfile::tempdir().unwrap();
    git(repo.path(), &["init", "--initial-branch=main"]);
    git(repo.path(), &["config", "user.name", "Fixture"]);
    git(
        repo.path(),
        &["config", "user.email", "fixture@example.invalid"],
    );
    std::fs::write(repo.path().join("source.txt"), "original\n").unwrap();
    std::fs::write(repo.path().join("delete.txt"), "delete me\n").unwrap();
    git(repo.path(), &["add", "."]);
    git(
        repo.path(),
        &["-c", "core.hooksPath=/dev/null", "commit", "-m", "fixture"],
    );
    let contracts = NativeContracts::load().unwrap();
    let session = RuntimeSession::connect(
        &binary,
        repo.path(),
        consent_timestamp_ms().unwrap(),
        &contracts,
        Settings::load().unwrap(),
    )
    .await
    .unwrap();
    assert!(session.capabilities().worktree_apply_review);
    let client = session.client();
    let root: DeveloperWorkspaceIdentity = client
        .request(method::WORKSPACE_IDENTITY, serde_json::json!({}))
        .await
        .unwrap();
    let created: WorktreeCreateResponse = client
        .request(
            method::MANAGED_WORKTREE_CREATE,
            ManagedWorktreeCreateParams {
                start: WorktreeStartPoint::Ref {
                    name: "HEAD".into(),
                },
                label: None,
            },
        )
        .await
        .unwrap();
    let checkout = PathBuf::from(&created.worktree.path);
    std::fs::write(checkout.join("source.txt"), "incoming 東京\r\n").unwrap();
    std::fs::write(checkout.join("image.bin"), b"\0\xffbinary").unwrap();
    std::fs::create_dir_all(checkout.join("new/nested")).unwrap();
    std::fs::write(checkout.join("new/nested/file.txt"), "created\n").unwrap();
    std::fs::remove_file(checkout.join("delete.txt")).unwrap();
    let list: ManagedWorktreeListResponse = client
        .request(method::MANAGED_WORKTREE_LIST, serde_json::json!({}))
        .await
        .unwrap();
    let mut panel = agiworkforce_desktop_gpui::code_worktrees::CodeWorktrees::default();
    panel.accept_list(root.clone(), list).unwrap();
    let params = panel.apply_review_params(&created.worktree.id).unwrap();
    let first: WorktreeApplyPlan = client
        .request(method::WORKTREE_APPLY_PLAN, params.clone())
        .await
        .unwrap();
    panel.accept_apply_plan(&params, first.clone()).unwrap();
    assert_eq!(
        std::fs::read(repo.path().join("source.txt")).unwrap(),
        b"original\n"
    );
    assert!(!repo.path().join("new").exists());
    std::fs::write(repo.path().join("source.txt"), "external original edits").unwrap();
    let refused = client
        .request::<WorktreeApplyResult>(
            method::WORKTREE_APPLY_COMMIT,
            panel.apply_commit_params().unwrap(),
        )
        .await
        .unwrap_err();
    assert!(
        agiworkforce_desktop_gpui::code_worktree_apply::clean_refusal(
            &panel.apply_commit_params().unwrap(),
            &anyhow::Error::new(refused)
        )
    );
    assert!(!repo.path().join("image.bin").exists() && !repo.path().join("new").exists());
    assert!(repo.path().join("delete.txt").exists());
    std::fs::write(repo.path().join("source.txt"), "original\n").unwrap();
    let second: WorktreeApplyPlan = client
        .request(method::WORKTREE_APPLY_PLAN, params.clone())
        .await
        .unwrap();
    assert_ne!(second.plan_id, first.plan_id);
    panel.accept_apply_plan(&params, second).unwrap();
    let second_commit = panel.apply_commit_params().unwrap();
    std::fs::write(checkout.join("source.txt"), "later source 🦀\n").unwrap();
    let refused = client
        .request::<WorktreeApplyResult>(method::WORKTREE_APPLY_COMMIT, second_commit.clone())
        .await
        .unwrap_err();
    assert!(
        agiworkforce_desktop_gpui::code_worktree_apply::clean_refusal(
            &second_commit,
            &anyhow::Error::new(refused)
        )
    );
    assert_eq!(
        std::fs::read(repo.path().join("source.txt")).unwrap(),
        b"original\n"
    );
    let final_plan: WorktreeApplyPlan = client
        .request(method::WORKTREE_APPLY_PLAN, params.clone())
        .await
        .unwrap();
    panel
        .accept_apply_plan(&params, final_plan.clone())
        .unwrap();
    let commit = panel.apply_commit_params().unwrap();
    let first_page: WorktreeApplyResultPage = client
        .request(method::WORKTREE_APPLY_COMMIT, commit.clone())
        .await
        .unwrap();
    let receipt = agiworkforce_desktop_gpui::code_worktree_apply::collect_apply_receipt(
        &client,
        &commit,
        &final_plan,
        Some(first_page),
    )
    .await
    .unwrap();
    panel.accept_apply_result(&commit, receipt.clone()).unwrap();
    assert!(receipt
        .files
        .iter()
        .all(|file| file.outcome == WorktreeApplyOutcome::Applied));
    assert_eq!(
        std::fs::read(repo.path().join("source.txt")).unwrap(),
        "later source 🦀\n".as_bytes()
    );
    assert_eq!(
        std::fs::read(repo.path().join("image.bin")).unwrap(),
        b"\0\xffbinary"
    );
    assert_eq!(
        std::fs::read(repo.path().join("new/nested/file.txt")).unwrap(),
        b"created\n"
    );
    assert!(!repo.path().join("delete.txt").exists());
    assert_eq!(git(repo.path(), &["diff", "--cached", "--name-only"]), "");
    std::fs::write(repo.path().join("source.txt"), "after accepted operation").unwrap();
    let first_page: WorktreeApplyResultPage = client
        .request(method::WORKTREE_APPLY_COMMIT, commit.clone())
        .await
        .unwrap();
    let replay = agiworkforce_desktop_gpui::code_worktree_apply::collect_apply_receipt(
        &client,
        &commit,
        &final_plan,
        Some(first_page),
    )
    .await
    .unwrap();
    assert_eq!(replay, receipt);
    let observed = agiworkforce_desktop_gpui::code_worktree_apply::collect_apply_receipt(
        &client,
        &commit,
        &final_plan,
        None,
    )
    .await
    .unwrap();
    assert_eq!(observed, receipt);
    assert_eq!(
        std::fs::read(repo.path().join("source.txt")).unwrap(),
        b"after accepted operation"
    );
    let mut foreign = params.clone();
    foreign.root_key = "foreign".into();
    assert!(client
        .request::<WorktreeApplyPlan>(method::WORKTREE_APPLY_PLAN, foreign)
        .await
        .is_err());
    session.shutdown().await.unwrap();
    let restarted = RuntimeSession::connect(
        &binary,
        repo.path(),
        consent_timestamp_ms().unwrap(),
        &contracts,
        Settings::load().unwrap(),
    )
    .await
    .unwrap();
    assert!(restarted
        .client()
        .request::<WorktreeApplyResult>(method::WORKTREE_APPLY_COMMIT, commit.clone())
        .await
        .is_err());
    assert_eq!(
        std::fs::read(repo.path().join("source.txt")).unwrap(),
        b"after accepted operation"
    );
    restarted.shutdown().await.unwrap();
    let child = RuntimeSession::connect(
        &binary,
        &checkout,
        consent_timestamp_ms().unwrap(),
        &contracts,
        Settings::load().unwrap(),
    )
    .await
    .unwrap();
    let child_root: DeveloperWorkspaceIdentity = child
        .client()
        .request(method::WORKSPACE_IDENTITY, serde_json::json!({}))
        .await
        .unwrap();
    let child_refusal = child
        .client()
        .request::<WorktreeApplyPlan>(
            method::WORKTREE_APPLY_PLAN,
            WorktreeApplyPlanParams {
                root_key: child_root.root_key,
                worktree_id: params.worktree_id.clone(),
            },
        )
        .await
        .unwrap_err();
    assert!(child_refusal.to_string().contains("original repository"));
    assert!(child
        .client()
        .request::<WorktreeApplyPlan>(method::WORKTREE_APPLY_PLAN, params.clone())
        .await
        .is_err());
    child.shutdown().await.unwrap();
    let account = RuntimeSession::connect_account(&binary, &contracts, Settings::load().unwrap())
        .await
        .unwrap();
    assert!(!account.capabilities().worktree_apply_review);
    assert!(account
        .client()
        .request::<WorktreeApplyPlan>(method::WORKTREE_APPLY_PLAN, params)
        .await
        .is_err());
    assert!(account
        .client()
        .request::<WorktreeApplyResultPage>(method::WORKTREE_APPLY_COMMIT, commit.clone())
        .await
        .is_err());
    assert!(account
        .client()
        .request::<WorktreeApplyResultPage>(
            method::WORKTREE_APPLY_RESULT,
            WorktreeApplyResultParams {
                root_key: commit.root_key,
                worktree_id: commit.worktree_id,
                plan_id: commit.plan_id,
                after: None
            }
        )
        .await
        .is_err());
    account.shutdown().await.unwrap();
}

#[tokio::test]
#[ignore = "run through the isolated packaged local review runner"]
async fn real_local_changes_managed_worktrees_keep_changes_and_refuse_lossy_archive() {
    assert_eq!(
        std::env::var("AGI_GPUI_CHANGES_FIXTURE").as_deref(),
        Ok("1")
    );
    let binary = PathBuf::from(std::env::var_os("AGI_GPUI_TEST_RUNTIME").unwrap());
    let repo = tempfile::tempdir().unwrap();
    git(repo.path(), &["init", "--initial-branch=main"]);
    git(repo.path(), &["config", "user.name", "Fixture"]);
    git(
        repo.path(),
        &["config", "user.email", "fixture@example.invalid"],
    );
    std::fs::write(repo.path().join("source.txt"), "original\n").unwrap();
    std::fs::write(repo.path().join(".gitignore"), ".private\n").unwrap();
    git(repo.path(), &["add", "."]);
    git(
        repo.path(),
        &["-c", "core.hooksPath=/dev/null", "commit", "-m", "fixture"],
    );
    let contracts = NativeContracts::load().unwrap();
    let session = RuntimeSession::connect(
        &binary,
        repo.path(),
        consent_timestamp_ms().unwrap(),
        &contracts,
        Settings::load().unwrap(),
    )
    .await
    .unwrap();
    assert!(session.capabilities().managed_worktrees);
    let client = session.client();
    let identity: DeveloperWorkspaceIdentity = client
        .request(method::WORKSPACE_IDENTITY, serde_json::json!({}))
        .await
        .unwrap();
    let initial: ManagedWorktreeListResponse = client
        .request(method::MANAGED_WORKTREE_LIST, serde_json::json!({}))
        .await
        .unwrap();
    assert!(initial.worktrees.is_empty());
    std::fs::write(repo.path().join("source.txt"), "carried edits 東京\n").unwrap();
    std::fs::write(repo.path().join("new.txt"), "new file\n").unwrap();
    let created: WorktreeCreateResponse = client
        .request(
            method::MANAGED_WORKTREE_CREATE,
            ManagedWorktreeCreateParams {
                start: WorktreeStartPoint::WorkingTree,
                label: None,
            },
        )
        .await
        .unwrap();
    let mut panel = agiworkforce_desktop_gpui::code_worktrees::CodeWorktrees::default();
    panel.accept_list(identity.clone(), initial).unwrap();
    panel
        .accept_created(&WorktreeStartPoint::WorkingTree, created.clone())
        .unwrap();
    let checkout = PathBuf::from(&created.worktree.path);
    assert_eq!(
        std::fs::read(checkout.join("source.txt")).unwrap(),
        "carried edits 東京\n".as_bytes()
    );
    assert_eq!(
        std::fs::read(checkout.join("new.txt")).unwrap(),
        b"new file\n"
    );
    let listed: ManagedWorktreeListResponse = client
        .request(method::MANAGED_WORKTREE_LIST, serde_json::json!({}))
        .await
        .unwrap();
    panel.accept_list(identity, listed).unwrap();
    let pinned: ManagedWorktreeSummary = client
        .request(
            method::WORKTREE_PIN,
            WorktreePinParams {
                worktree_id: created.worktree.id.clone(),
                pinned: true,
            },
        )
        .await
        .unwrap();
    panel.accept_pin(&created.worktree, true, pinned).unwrap();
    assert!(panel.selected(&created.worktree.id).unwrap().pinned);
    let child = RuntimeSession::connect(
        &binary,
        &checkout,
        consent_timestamp_ms().unwrap(),
        &contracts,
        Settings::load().unwrap(),
    )
    .await
    .unwrap();
    let child_list: ManagedWorktreeListResponse = child
        .client()
        .request(method::MANAGED_WORKTREE_LIST, serde_json::json!({}))
        .await
        .unwrap();
    assert_eq!(child_list.worktrees.len(), 1);
    assert_eq!(child_list.worktrees[0].id, created.worktree.id);
    assert!(child_list.worktrees[0].active);
    let child_identity: DeveloperWorkspaceIdentity = child
        .client()
        .request(method::WORKSPACE_IDENTITY, serde_json::json!({}))
        .await
        .unwrap();
    let mut child_panel = agiworkforce_desktop_gpui::code_worktrees::CodeWorktrees::default();
    child_panel.accept_list(child_identity, child_list).unwrap();
    assert!(!child_panel.can_create());
    let thread: ThreadStartResponse = child
        .client()
        .request(
            method::THREAD_START,
            ThreadStartParams {
                model: Some("fixture-local".into()),
                provider: Some(LocalModelProvider::Ollama),
                cwd: None,
                title: Some("Isolated worktree".into()),
            },
        )
        .await
        .unwrap();
    let active: ManagedWorktreeListResponse = client
        .request(method::MANAGED_WORKTREE_LIST, serde_json::json!({}))
        .await
        .unwrap();
    let row = active
        .worktrees
        .iter()
        .find(|tree| tree.id == created.worktree.id)
        .unwrap();
    assert!(row.active);
    assert_eq!(row.thread_id.as_deref(), Some(thread.thread.id.as_str()));
    assert!(client
        .request::<WorktreeArchive>(
            method::WORKTREE_DELETE,
            WorktreeIdParams {
                worktree_id: created.worktree.id.clone()
            }
        )
        .await
        .is_err());
    child.shutdown().await.unwrap();
    std::fs::write(checkout.join(".private"), "private fixture only\n").unwrap();
    assert!(client
        .request::<WorktreeArchive>(
            method::WORKTREE_DELETE,
            WorktreeIdParams {
                worktree_id: created.worktree.id.clone()
            }
        )
        .await
        .is_err());
    assert_eq!(
        std::fs::read(checkout.join(".private")).unwrap(),
        b"private fixture only\n"
    );
    std::fs::remove_file(checkout.join(".private")).unwrap();
    std::fs::write(checkout.join("source.txt"), "isolated edits\n").unwrap();
    let archived: WorktreeArchive = client
        .request(
            method::WORKTREE_DELETE,
            WorktreeIdParams {
                worktree_id: created.worktree.id.clone(),
            },
        )
        .await
        .unwrap();
    agiworkforce_desktop_gpui::code_worktrees::validate_archive(&created.worktree.id, &archived)
        .unwrap();
    assert!(!checkout.exists());
    assert_eq!(
        git(
            repo.path(),
            &["show", &format!("{}:source.txt", archived.snapshot_commit)]
        ),
        "isolated edits\n"
    );
    assert_eq!(
        std::fs::read(repo.path().join("source.txt")).unwrap(),
        "carried edits 東京\n".as_bytes()
    );
    assert_eq!(git(repo.path(), &["diff", "--cached", "--name-only"]), "");
    session.shutdown().await.unwrap();
    let account = RuntimeSession::connect_account(&binary, &contracts, Settings::load().unwrap())
        .await
        .unwrap();
    assert!(!account.capabilities().managed_worktrees);
    for method in [
        method::MANAGED_WORKTREE_LIST,
        method::MANAGED_WORKTREE_CREATE,
        method::WORKTREE_PIN,
        method::WORKTREE_DELETE,
    ] {
        assert!(
            account
                .client()
                .request::<serde_json::Value>(method, serde_json::json!({}))
                .await
                .is_err(),
            "{method}"
        );
    }
    account.shutdown().await.unwrap();
}

#[tokio::test]
#[ignore = "run through the isolated packaged local review runner"]
async fn real_local_changes_review_stage_revert_and_preserve_later_edits() {
    assert_eq!(
        std::env::var("AGI_GPUI_CHANGES_FIXTURE").as_deref(),
        Ok("1")
    );
    let binary = PathBuf::from(std::env::var_os("AGI_GPUI_TEST_RUNTIME").unwrap());
    let repo = tempfile::tempdir().unwrap();
    git(repo.path(), &["init", "--initial-branch=main"]);
    git(repo.path(), &["config", "user.name", "Fixture"]);
    git(
        repo.path(),
        &["config", "user.email", "fixture@example.invalid"],
    );
    let original = (0..40)
        .map(|index| format!("line-{index}\n"))
        .collect::<String>();
    std::fs::write(repo.path().join("source.txt"), &original).unwrap();
    std::fs::write(repo.path().join("removed.txt"), "old file\n").unwrap();
    git(repo.path(), &["add", "."]);
    git(
        repo.path(),
        &["-c", "core.hooksPath=/dev/null", "commit", "-m", "fixture"],
    );
    let contracts = NativeContracts::load().unwrap();
    let session = RuntimeSession::connect(
        &binary,
        repo.path(),
        consent_timestamp_ms().unwrap(),
        &contracts,
        Settings::load().unwrap(),
    )
    .await
    .unwrap();
    assert!(session.capabilities().checkpoints && session.capabilities().managed_worktrees);
    let client = session.client();
    let created: ThreadStartResponse = client
        .request(
            method::THREAD_START,
            ThreadStartParams {
                model: Some("fixture-local".into()),
                provider: Some(LocalModelProvider::Ollama),
                cwd: None,
                title: Some("Review fixture".into()),
            },
        )
        .await
        .unwrap();
    assert_eq!(created.thread.trust_mode, DeveloperSessionTrustMode::Local);
    let thread = created.thread.id;
    let workspace = Workspace::discover(&TokioCommandRunner, repo.path())
        .await
        .unwrap()
        .unwrap();
    let checkpoints = Checkpoints::open(&TokioCommandRunner, &workspace, &thread).unwrap();
    let turn = uuid::Uuid::new_v4().to_string();
    checkpoints
        .record(&turn, Phase::Before, None)
        .await
        .unwrap();
    let changed = original
        .replace("line-2\n", "first-change\n")
        .replace("line-32\n", "second-change\n");
    std::fs::write(repo.path().join("source.txt"), &changed).unwrap();
    std::fs::write(repo.path().join("added.txt"), "new file\n").unwrap();
    std::fs::write(repo.path().join("binary.dat"), b"\0binary\0").unwrap();
    std::fs::remove_file(repo.path().join("removed.txt")).unwrap();
    checkpoints.record(&turn, Phase::After, None).await.unwrap();
    let list: CheckpointListResponse = client
        .request(
            method::CHECKPOINT_LIST,
            ThreadIdParams {
                thread_id: thread.clone(),
            },
        )
        .await
        .unwrap();
    assert_eq!(list.turns.len(), 1);
    let mut review = Changes {
        thread_id: Some(thread.clone()),
        ..Default::default()
    };
    review.accept_list(list).unwrap();
    let diff: CheckpointDiffResponse = client
        .request(
            method::CHECKPOINT_DIFF,
            CheckpointTurnParams {
                thread_id: thread.clone(),
                turn_id: turn.clone(),
            },
        )
        .await
        .unwrap();
    review.accept_diff(&turn, diff).unwrap();
    let source = review
        .diff
        .as_ref()
        .unwrap()
        .files
        .iter()
        .find(|file| file.path == "source.txt")
        .unwrap();
    assert_eq!(source.hunks.len(), 2);
    let first = source.hunks[0].index;
    let second = source.hunks[1].index;
    let mut section = review.sections("source.txt", Some(first), true).unwrap();
    let preview: CheckpointSectionsResponse = client
        .request(method::CHECKPOINT_STAGE, section.clone())
        .await
        .unwrap();
    validate_outcome(&section, &preview).unwrap();
    assert_eq!(preview.applied, ["source.txt"]);
    assert!(git(repo.path(), &["diff", "--cached", "--name-only"]).is_empty());
    section.preview = false;
    let staged: CheckpointSectionsResponse = client
        .request(method::CHECKPOINT_STAGE, section.clone())
        .await
        .unwrap();
    validate_outcome(&section, &staged).unwrap();
    assert!(staged.conflicted.is_empty());
    let index = git(repo.path(), &["show", ":source.txt"]);
    assert!(index.contains("first-change"));
    assert!(!index.contains("second-change"));
    assert_eq!(
        std::fs::read_to_string(repo.path().join("source.txt")).unwrap(),
        changed
    );
    let mut revert = review.sections("source.txt", Some(second), true).unwrap();
    let preview: CheckpointSectionsResponse = client
        .request(method::CHECKPOINT_REVERT, revert.clone())
        .await
        .unwrap();
    validate_outcome(&revert, &preview).unwrap();
    assert_eq!(
        std::fs::read_to_string(repo.path().join("source.txt")).unwrap(),
        changed
    );
    revert.preview = false;
    let result: CheckpointSectionsResponse = client
        .request(method::CHECKPOINT_REVERT, revert.clone())
        .await
        .unwrap();
    validate_outcome(&revert, &result).unwrap();
    assert!(result.conflicted.is_empty());
    let reverted = original.replace("line-2\n", "first-change\n");
    assert_eq!(
        std::fs::read_to_string(repo.path().join("source.txt")).unwrap(),
        reverted
    );
    assert_eq!(git(repo.path(), &["show", ":source.txt"]), index);
    let later = reverted.replace("first-change", "later-editor-change");
    std::fs::write(repo.path().join("source.txt"), &later).unwrap();
    let conflict = review.sections("source.txt", Some(first), true).unwrap();
    let response: CheckpointSectionsResponse = client
        .request(method::CHECKPOINT_REVERT, conflict.clone())
        .await
        .unwrap();
    validate_outcome(&conflict, &response).unwrap();
    assert!(response.applied.is_empty());
    assert_eq!(response.conflicted.len(), 1);
    assert_eq!(
        std::fs::read_to_string(repo.path().join("source.txt")).unwrap(),
        later
    );
    for path in ["added.txt", "binary.dat", "removed.txt"] {
        let mut revert = review.sections(path, None, true).unwrap();
        let preview: CheckpointSectionsResponse = client
            .request(method::CHECKPOINT_REVERT, revert.clone())
            .await
            .unwrap();
        validate_outcome(&revert, &preview).unwrap();
        assert!(preview.conflicted.is_empty());
        revert.preview = false;
        let result: CheckpointSectionsResponse = client
            .request(method::CHECKPOINT_REVERT, revert.clone())
            .await
            .unwrap();
        validate_outcome(&revert, &result).unwrap();
        assert_eq!(result.applied, [path]);
    }
    assert!(!repo.path().join("added.txt").exists());
    assert!(!repo.path().join("binary.dat").exists());
    assert_eq!(
        std::fs::read_to_string(repo.path().join("removed.txt")).unwrap(),
        "old file\n"
    );
    assert!(review.sections("../outside", None, true).is_err());
    let forged = CheckpointSectionsParams {
        thread_id: thread.clone(),
        turn_id: turn.clone(),
        preview: false,
        sections: vec![CheckpointSection {
            path: "../outside".into(),
            hunks: vec![],
        }],
    };
    assert!(client
        .request::<CheckpointSectionsResponse>(method::CHECKPOINT_REVERT, forged)
        .await
        .is_err());
    assert!(client
        .request::<CheckpointDiffResponse>(
            method::CHECKPOINT_DIFF,
            CheckpointTurnParams {
                thread_id: uuid::Uuid::new_v4().to_string(),
                turn_id: turn.clone()
            }
        )
        .await
        .is_err());
    let transcript: ThreadReadResponse = client
        .request(
            method::THREAD_READ,
            ThreadIdParams {
                thread_id: thread.clone(),
            },
        )
        .await
        .unwrap();
    assert!(transcript.messages.is_empty());
    session.shutdown().await.unwrap();
    let session = RuntimeSession::connect(
        &binary,
        repo.path(),
        consent_timestamp_ms().unwrap(),
        &contracts,
        Settings::load().unwrap(),
    )
    .await
    .unwrap();
    let recovered: CheckpointListResponse = session
        .client()
        .request(
            method::CHECKPOINT_LIST,
            ThreadIdParams { thread_id: thread },
        )
        .await
        .unwrap();
    assert_eq!(recovered.turns[0].turn_id, turn);
    assert_eq!(
        std::fs::read_to_string(repo.path().join("source.txt")).unwrap(),
        later
    );
    session.shutdown().await.unwrap();

    let no_git = tempfile::tempdir().unwrap();
    let session = RuntimeSession::connect(
        &binary,
        no_git.path(),
        consent_timestamp_ms().unwrap(),
        &contracts,
        Settings::load().unwrap(),
    )
    .await
    .unwrap();
    let created: ThreadStartResponse = session
        .client()
        .request(
            method::THREAD_START,
            ThreadStartParams {
                model: Some("fixture-local".into()),
                provider: Some(LocalModelProvider::Ollama),
                cwd: None,
                title: None,
            },
        )
        .await
        .unwrap();
    let unavailable: CheckpointListResponse = session
        .client()
        .request(
            method::CHECKPOINT_LIST,
            ThreadIdParams {
                thread_id: created.thread.id,
            },
        )
        .await
        .unwrap();
    assert!(!unavailable.available);
    assert!(unavailable.turns.is_empty());
    assert!(unavailable
        .unavailable_reason
        .as_deref()
        .is_some_and(|reason| !reason.is_empty()));
    session.shutdown().await.unwrap();
}
