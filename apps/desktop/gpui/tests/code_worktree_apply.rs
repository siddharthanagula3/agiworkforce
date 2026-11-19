use agiworkforce_desktop_gpui::{
    code_worktree_apply::clean_refusal, code_worktrees::CodeWorktrees,
};
use agiworkforce_protocol::{developer_session::*, worktree_apply::*};

fn state() -> CodeWorktrees {
    let mut state = CodeWorktrees::default();
    let root = DeveloperWorkspaceIdentity {
        cwd: "/repo".into(),
        root_key: "root".into(),
    };
    let tree = ManagedWorktreeSummary {
        id: "abcd1234".into(),
        path: "/host/tree/checkout".into(),
        repository_root: "/repo".into(),
        label: None,
        start: WorktreeStartPoint::WorkingTree,
        base_commit: "base".into(),
        head: Some("head".into()),
        created_at: "2026-11-10T00:00:00Z".into(),
        thread_id: None,
        thread: None,
        pinned: false,
        active: false,
        missing: false,
        setup_exit_code: None,
        setup_ran_at: None,
    };
    state
        .accept_list(
            root,
            ManagedWorktreeListResponse {
                worktrees: vec![tree],
                keep: 3,
                setup_script: None,
            },
        )
        .unwrap();
    state
}
fn plan() -> WorktreeApplyPlan {
    WorktreeApplyPlan {
        root_key: "root".into(),
        worktree_id: "abcd1234".into(),
        plan_id: uuid::Uuid::new_v4().to_string(),
        source_revision: "source".into(),
        files: vec![WorktreeApplyFile {
            path: "source.txt".into(),
            status: CheckpointFileStatus::Modified,
            state: WorktreeApplyFileState::Ready,
            reason: None,
            before: Some(WorktreeApplyContent {
                bytes: 3,
                revision: "aa".into(),
                text: Some("old".into()),
                truncated: false,
                binary: false,
            }),
            after: Some(WorktreeApplyContent {
                bytes: 3,
                revision: "bb".into(),
                text: Some("new".into()),
                truncated: false,
                binary: false,
            }),
            executable_before: Some(false),
            executable_after: Some(false),
        }],
    }
}
fn params() -> WorktreeApplyPlanParams {
    WorktreeApplyPlanParams {
        root_key: "root".into(),
        worktree_id: "abcd1234".into(),
    }
}
fn result(params: &WorktreeApplyCommitParams) -> WorktreeApplyResult {
    WorktreeApplyResult {
        root_key: params.root_key.clone(),
        worktree_id: params.worktree_id.clone(),
        plan_id: params.plan_id.clone(),
        files: vec![WorktreeApplyFileResult {
            path: "source.txt".into(),
            outcome: WorktreeApplyOutcome::Applied,
            reason: None,
            uncertain: false,
            recovery_paths: vec![],
        }],
    }
}

#[test]
fn apply_requests_bind_only_the_reviewed_folder_worktree_and_plan() {
    let mut state = state();
    let plan = plan();
    state.accept_apply_plan(&params(), plan.clone()).unwrap();
    let commit = state.apply_commit_params().unwrap();
    assert_eq!(
        commit,
        WorktreeApplyCommitParams {
            root_key: "root".into(),
            worktree_id: "abcd1234".into(),
            plan_id: plan.plan_id
        }
    );
    let json = serde_json::to_value(&commit).unwrap();
    assert_eq!(json.as_object().unwrap().len(), 3);
    assert!(json.get("files").is_none());
    state.operation = Some(uuid::Uuid::new_v4());
    assert!(state.apply_commit_params().is_err());
}

#[test]
fn invalid_or_repeated_file_previews_do_not_replace_the_confirmed_plan() {
    let mut state = state();
    let good = plan();
    state.accept_apply_plan(&params(), good.clone()).unwrap();
    for field in ["root", "id", "duplicate", "path", "text", "mode"] {
        let mut bad = plan();
        match field {
            "root" => bad.root_key = "foreign".into(),
            "id" => bad.plan_id.clear(),
            "duplicate" => bad.files.push(bad.files[0].clone()),
            "path" => bad.files[0].path = "../outside".into(),
            "text" => bad.files[0].after.as_mut().unwrap().bytes = 1,
            _ => bad.files[0].executable_after = None,
        }
        assert!(state.accept_apply_plan(&params(), bad).is_err(), "{field}");
        assert_eq!(state.apply_plan, Some(good.clone()));
    }
}

#[test]
fn incomplete_or_unreviewed_apply_receipts_cannot_claim_success() {
    let mut state = state();
    state.accept_apply_plan(&params(), plan()).unwrap();
    let commit = state.apply_commit_params().unwrap();
    for field in ["root", "path", "missing", "duplicate", "recovery"] {
        let mut bad = result(&commit);
        match field {
            "root" => bad.root_key = "foreign".into(),
            "path" => bad.files[0].path = "another.txt".into(),
            "missing" => bad.files.clear(),
            "duplicate" => bad.files.push(bad.files[0].clone()),
            _ => bad.files[0].uncertain = true,
        }
        assert!(state.accept_apply_result(&commit, bad).is_err(), "{field}");
        assert!(state.apply_result.is_none());
    }
    state.accept_apply_result(&commit, result(&commit)).unwrap();
    assert!(state.apply_commit_params().is_err());
}

#[test]
fn uncertain_file_results_retain_recovery_receipts_and_block_another_change() {
    let mut state = state();
    state.accept_apply_plan(&params(), plan()).unwrap();
    let commit = state.apply_commit_params().unwrap();
    let mut receipt = result(&commit);
    receipt.files[0].outcome = WorktreeApplyOutcome::Failed;
    receipt.files[0].reason = Some("flush was not confirmed".into());
    receipt.files[0].uncertain = true;
    receipt.files[0]
        .recovery_paths
        .push("/private/recovery/original".into());
    state.accept_apply_result(&commit, receipt.clone()).unwrap();
    assert!(state.uncertain);
    assert_eq!(state.apply_result, Some(receipt));
    assert!(state.begin(true).is_err());
}

#[test]
fn clean_refusal_requires_the_hosts_scoped_typed_failure() {
    let mut state = state();
    state.accept_apply_plan(&params(), plan()).unwrap();
    let commit = state.apply_commit_params().unwrap();
    let mut failure = WorktreeApplyCommitFailure {
        root_key: commit.root_key.clone(),
        worktree_id: commit.worktree_id.clone(),
        plan_id: commit.plan_id.clone(),
        uncertain: false,
    };
    let error = |failure: &WorktreeApplyCommitFailure| {
        anyhow::Error::new(
            agiworkforce_app_server::DeveloperSessionClientError::Remote {
                code: -32009,
                message: "refused".into(),
                data: Some(serde_json::to_value(failure).unwrap()),
            },
        )
    };
    assert!(clean_refusal(&commit, &error(&failure)));
    failure.plan_id = "other".into();
    assert!(!clean_refusal(&commit, &error(&failure)));
    assert!(!clean_refusal(
        &commit,
        &anyhow::anyhow!("transport stopped")
    ));
}

#[test]
fn receipt_pages_require_progress_exact_membership_and_a_complete_final_page() {
    use agiworkforce_desktop_gpui::code_worktree_apply::ApplyReceiptPages;
    let mut review = plan();
    let mut other = review.files[0].clone();
    other.path = "other.txt".into();
    review.files.push(other);
    let commit = WorktreeApplyCommitParams {
        root_key: review.root_key.clone(),
        worktree_id: review.worktree_id.clone(),
        plan_id: review.plan_id.clone(),
    };
    let mut pages = ApplyReceiptPages::new(&commit, &review).unwrap();
    let first = WorktreeApplyResultPage {
        root_key: commit.root_key.clone(),
        worktree_id: commit.worktree_id.clone(),
        plan_id: commit.plan_id.clone(),
        files: result(&commit).files,
        total_files: 2,
        next_after: Some("1".into()),
    };
    pages.push(first.clone()).unwrap();
    assert_eq!(pages.next_params().unwrap().after.as_deref(), Some("1"));
    assert!(pages.push(first.clone()).is_err());
    let mut stalled = first.clone();
    stalled.files.clear();
    assert!(pages.push(stalled).is_err());
    let mut last = first;
    last.files[0].path = "other.txt".into();
    last.next_after = None;
    pages.push(last).unwrap();
    assert!(pages.next_params().is_none());
    assert_eq!(pages.finish().unwrap().files.len(), 2);
}

#[test]
fn reading_a_confirmed_receipt_settles_only_the_unknown_apply_it_matches() {
    let mut state = state();
    state.accept_apply_plan(&params(), plan()).unwrap();
    let commit = state.apply_commit_params().unwrap();
    state.uncertain = true;
    state.apply_uncertain = true;
    state.accept_apply_result(&commit, result(&commit)).unwrap();
    assert!(!state.uncertain && !state.apply_uncertain);
    state.uncertain = true;
    state.accept_apply_result(&commit, result(&commit)).unwrap();
    assert!(state.uncertain);
}
