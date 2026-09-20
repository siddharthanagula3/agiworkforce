//! Running the typed Git API as agent tools.
//!
//! The class on the tool's spec decides what happens before the operation
//! runs: a read goes straight through, a write follows the session's approval
//! flow, a destructive operation always asks, and a push is answered only by
//! `safety::push_consent::request_push_consent`.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use anyhow::Result;
use async_trait::async_trait;
use dialoguer::Confirm;
use serde_json::{json, Value};

use super::super::{approval_allows, request_approval, ApprovalCallback, ToolResult};
use crate::platform::runtime::git::{
    GitApi, GitOperation, MergeOutcome, PushForce, PushPlan, StashOutcome,
};
use crate::platform::runtime::git_tools::{
    git_operation_for, git_tool_spec, push_force, remote_of, GitToolClass,
};
use crate::safety::push_consent::{
    request_push_consent, PushApprovalPrompt, PushApprover, PushConsent,
};
use crate::tui::approval_broker::{ApprovalDecision, ApprovalRequest, ApprovalRequestKind};

fn failed(tool_name: &str, output: impl Into<String>) -> ToolResult {
    ToolResult {
        tool_name: tool_name.to_string(),
        success: false,
        output: output.into(),
    }
}

fn succeeded(tool_name: &str, output: Value) -> ToolResult {
    ToolResult {
        tool_name: tool_name.to_string(),
        success: true,
        output: output.to_string(),
    }
}

fn display(paths: &[PathBuf]) -> Vec<String> {
    paths
        .iter()
        .map(|path| path.display().to_string())
        .collect()
}

/// Asks through whatever the surface gave this call: the approval overlay when
/// a callback is wired, the terminal when the user is at one. When neither can
/// answer, nothing is approved.
struct SurfaceApprover<'a> {
    callback: Option<&'a ApprovalCallback>,
    interactive: bool,
}

impl SurfaceApprover<'_> {
    async fn ask(&self, request: ApprovalRequest) -> ApprovalDecision {
        if let Some(decision) = request_approval(self.callback, request.clone()).await {
            return decision;
        }
        if !self.interactive {
            return ApprovalDecision::Deny;
        }
        let mut prompt = request.summary.clone();
        for line in &request.detail {
            prompt.push('\n');
            prompt.push_str(line);
        }
        if Confirm::new()
            .with_prompt(prompt)
            .default(false)
            .interact()
            .unwrap_or(false)
        {
            ApprovalDecision::AllowOnce
        } else {
            ApprovalDecision::Deny
        }
    }
}

#[async_trait]
impl PushApprover for SurfaceApprover<'_> {
    async fn ask(&self, prompt: &PushApprovalPrompt) -> ApprovalDecision {
        SurfaceApprover::ask(
            self,
            ApprovalRequest::new(
                ApprovalRequestKind::GitPush {
                    remote: prompt.remote().to_string(),
                    branch: prompt.branch().to_string(),
                    force: prompt.force() == PushForce::WithLease,
                },
                prompt.summary(),
                prompt.detail().to_vec(),
            ),
        )
        .await
    }
}

fn repository_root(workspace_root: Option<&Path>) -> PathBuf {
    workspace_root
        .map(Path::to_path_buf)
        .or_else(|| std::env::current_dir().ok())
        .unwrap_or_else(|| PathBuf::from("."))
}

pub(crate) async fn execute_git_tool(
    tool_name: &str,
    args: &HashMap<String, String>,
    workspace_root: Option<&Path>,
    require_confirmation: bool,
    interactive: bool,
    approval_callback: Option<&ApprovalCallback>,
) -> Result<ToolResult> {
    let Some(spec) = git_tool_spec(tool_name) else {
        return Ok(failed(tool_name, format!("{tool_name} is not a git tool")));
    };
    let root = repository_root(workspace_root);
    let git = GitApi::at(&root);
    let approver = SurfaceApprover {
        callback: approval_callback,
        interactive,
    };

    if spec.class == GitToolClass::Push {
        return run_push(tool_name, args, &git, &root, &approver).await;
    }

    let operation = match git_operation_for(tool_name, args) {
        Ok(operation) => operation,
        Err(error) => return Ok(failed(tool_name, error.to_string())),
    };
    if let Err(error) = operation.argv() {
        return Ok(failed(tool_name, error.to_string()));
    }

    if let Some(denial) = consent_for_operation(
        tool_name,
        spec.class,
        require_confirmation,
        &operation,
        &git,
        &approver,
    )
    .await
    {
        return Ok(denial);
    }

    run_operation(tool_name, args, operation, &git, &root).await
}

/// Ask when the operation discards work, turns the repository's hooks off, or
/// writes while the session is still confirming its writes. A destructive
/// operation asks whatever the session's permission mode says, because the
/// thing it throws away is not in the repository afterwards.
async fn consent_for_operation(
    tool_name: &str,
    class: GitToolClass,
    require_confirmation: bool,
    operation: &GitOperation,
    git: &GitApi,
    approver: &SurfaceApprover<'_>,
) -> Option<ToolResult> {
    let bypasses_hooks = operation.bypasses_hooks();
    let confirming_a_write = require_confirmation && operation.is_write();
    if !class.always_asks() && !bypasses_hooks && !confirming_a_write {
        return None;
    }

    let mut detail = vec![operation
        .argv()
        .map(|argv| format!("git {}", argv.join(" ")))
        .unwrap_or_else(|_| tool_name.to_string())];
    if bypasses_hooks {
        detail.push(crate::safety::git_hook_bypass_reason().to_string());
    }
    let discarded = git.discarded_by(operation).await.unwrap_or_default();
    if !discarded.is_empty() {
        detail.push(format!(
            "{} uncommitted file(s) go with it: {}",
            discarded.len(),
            display(&discarded).join(", ")
        ));
    }

    let decision = approver
        .ask(ApprovalRequest::new(
            ApprovalRequestKind::Git {
                tool_name: tool_name.to_string(),
                target: detail[0].clone(),
            },
            format!("Run {tool_name} in {}?", git.root().display()),
            detail,
        ))
        .await;
    (!approval_allows(decision)).then(|| {
        failed(
            tool_name,
            format!("`{tool_name}` was not approved and did not run."),
        )
    })
}

async fn run_operation(
    tool_name: &str,
    args: &HashMap<String, String>,
    operation: GitOperation,
    git: &GitApi,
    root: &Path,
) -> Result<ToolResult> {
    let outcome = match &operation {
        GitOperation::Status => git.status(repository_id(root)).await.map(|snapshot| {
            json!({
                "branch": snapshot.branch,
                "detachedHead": snapshot.detached_head,
                "headCommit": snapshot.head_commit,
                "changes": snapshot
                    .changes
                    .iter()
                    .map(|change| json!({
                        "path": change.path.display().to_string(),
                        "kind": format!("{:?}", change.kind).to_lowercase(),
                        "staged": change.staged,
                    }))
                    .collect::<Vec<_>>(),
            })
        }),
        GitOperation::Show { rev } => git.show(rev).await.map(|detail| {
            json!({
                "commit": detail.commit,
                "author": detail.author,
                "authoredAt": detail.authored_at,
                "subject": detail.subject,
                "body": detail.body,
                "files": display(&detail.files),
            })
        }),
        GitOperation::RevList { branch, exclude } => git
            .commits_not_in(branch, exclude)
            .await
            .map(|commits| json!({ "commits": commit_json(&commits) })),
        GitOperation::BranchList { include_remote } => {
            git.branches(*include_remote).await.map(|branches| {
                json!({
                    "branches": branches
                        .iter()
                        .map(|branch| json!({
                            "name": branch.name,
                            "isCurrent": branch.is_current,
                            "isRemote": branch.is_remote,
                            "commit": branch.commit,
                            "upstream": branch.upstream,
                        }))
                        .collect::<Vec<_>>()
                })
            })
        }
        GitOperation::WorktreeList => git.worktrees().await.map(|entries| {
            json!({
                "worktrees": entries
                    .iter()
                    .map(|entry| json!({
                        "path": entry.path.display().to_string(),
                        "branch": entry.branch,
                    }))
                    .collect::<Vec<_>>()
            })
        }),
        GitOperation::Stage { paths } => git
            .stage(paths)
            .await
            .map(|staged| json!({ "staged": display(&staged.paths) })),
        GitOperation::Unstage { paths } => git
            .unstage(paths)
            .await
            .map(|staged| json!({ "unstaged": display(&staged.paths) })),
        GitOperation::BranchCreate { name, base } => git
            .branch_create(name, base.as_deref())
            .await
            .map(|branch| json!({ "branch": branch.name, "commit": branch.commit })),
        GitOperation::Merge { rev, hooks } => git
            .merge(rev, *hooks)
            .await
            .map(|outcome| merge_json(&outcome)),
        GitOperation::Rebase { onto, hooks } => git
            .rebase(onto, *hooks)
            .await
            .map(|outcome| merge_json(&outcome)),
        GitOperation::CherryPick { rev } => git
            .cherry_pick(rev)
            .await
            .map(|outcome| merge_json(&outcome)),
        GitOperation::Revert { rev } => git.revert(rev).await.map(|outcome| merge_json(&outcome)),
        GitOperation::Pull { remote, branch } => git
            .pull(remote, branch.as_deref())
            .await
            .map(|outcome| merge_json(&outcome)),
        GitOperation::Fetch { remote, prune } => git
            .fetch(remote, *prune)
            .await
            .map(|()| json!({ "fetched": remote })),
        GitOperation::Stash(stash) => git.stash(stash.clone()).await.map(|outcome| match outcome {
            StashOutcome::Saved { message } => json!({ "saved": message }),
            StashOutcome::Restored => json!({ "restored": true }),
            StashOutcome::Dropped => json!({ "dropped": true }),
            StashOutcome::Listed { entries } => json!({ "entries": entries }),
            StashOutcome::NothingToStash => json!({ "nothingToStash": true }),
        }),
        GitOperation::Reset { mode, rev } => git
            .reset(*mode, rev)
            .await
            .map(|head| json!({ "mode": mode.label(), "head": head })),
        GitOperation::Clean {
            directories,
            ignored,
        } => git
            .clean(*directories, *ignored)
            .await
            .map(|removed| json!({ "removed": display(&removed) })),
        GitOperation::BranchDelete { name, force } => {
            let policy = repository_policy(root);
            git.branch_delete(name, *force, &policy)
                .await
                .map(|branch| json!({ "deleted": branch.name, "commit": branch.commit }))
        }
        other => Err(anyhow::anyhow!(
            "git {} has no tool of its own",
            other.label()
        )),
    };
    let _ = args;

    Ok(match outcome {
        Ok(value) => succeeded(tool_name, value),
        Err(error) => failed(tool_name, error.to_string()),
    })
}

fn commit_json(commits: &[crate::platform::runtime::git::CommitSummary]) -> Vec<Value> {
    commits
        .iter()
        .map(|commit| json!({ "commit": commit.commit, "subject": commit.subject }))
        .collect()
}

fn merge_json(outcome: &MergeOutcome) -> Value {
    match outcome {
        MergeOutcome::AlreadyUpToDate => json!({ "alreadyUpToDate": true }),
        MergeOutcome::Merged { head } => json!({ "merged": true, "head": head }),
        MergeOutcome::Conflicted { paths } => json!({
            "conflicted": paths
                .iter()
                .map(|conflict| json!({
                    "path": conflict.path.display().to_string(),
                    "kind": conflict.kind.label(),
                }))
                .collect::<Vec<_>>()
        }),
    }
}

fn repository_policy(root: &Path) -> agiworkforce_protocol::code_domain::RepositoryPolicy {
    crate::context::gather_repository(root)
        .map(|repository| repository.policy)
        .unwrap_or_default()
}

fn repository_id(root: &Path) -> agiworkforce_protocol::code_domain::RepositoryId {
    crate::context::gather_repository(root)
        .map(|repository| repository.id)
        .unwrap_or_else(|| agiworkforce_protocol::code_domain::RepositoryId::new("workspace"))
}

/// Plan the push, put the plan in front of the user, and run it only with the
/// consent that answer produced. There is no other way into `GitApi::push`.
async fn run_push(
    tool_name: &str,
    args: &HashMap<String, String>,
    git: &GitApi,
    root: &Path,
    approver: &SurfaceApprover<'_>,
) -> Result<ToolResult> {
    let force = match push_force(args) {
        Ok(force) => force,
        Err(error) => return Ok(failed(tool_name, error.to_string())),
    };
    let policy = repository_policy(root);
    let plan = match git.push_plan(&remote_of(args), force, &policy).await {
        Ok(plan) => plan,
        Err(error) => return Ok(failed(tool_name, error.to_string())),
    };
    if let Some(reason) = plan.blocked_by() {
        return Ok(failed(
            tool_name,
            format!("refusing to push: {}", reason.label()),
        ));
    }

    let Some(consent) = request_push_consent(approver, &plan).await else {
        return Ok(failed(
            tool_name,
            "The push was not approved and nothing left this machine.".to_string(),
        ));
    };
    run_approved_push(tool_name, git, plan, consent).await
}

async fn run_approved_push(
    tool_name: &str,
    git: &GitApi,
    plan: PushPlan,
    consent: PushConsent,
) -> Result<ToolResult> {
    let store = crate::permissions::PermissionStore::load().unwrap_or_default();
    let profile = store.code_permission_profile(None);
    let plan = plan.approved(consent);
    Ok(match git.push(&plan, &profile).await {
        Ok(outcome) => succeeded(
            tool_name,
            json!({
                "remote": outcome.remote,
                "branch": outcome.branch,
                "head": outcome.head,
                "commits": commit_json(&outcome.commits),
            }),
        ),
        Err(error) => failed(tool_name, error.to_string()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command as SyncCommand;
    use std::sync::{Arc, Mutex};

    fn args(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(key, value)| (key.to_string(), value.to_string()))
            .collect()
    }

    fn recording(
        decision: ApprovalDecision,
    ) -> (ApprovalCallback, Arc<Mutex<Vec<ApprovalRequest>>>) {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let recorder = Arc::clone(&seen);
        let callback: ApprovalCallback = Arc::new(move |request| {
            let recorder = Arc::clone(&recorder);
            Box::pin(async move {
                recorder.lock().expect("seen").push(request);
                decision
            })
        });
        (callback, seen)
    }

    fn init_repo(dir: &Path) {
        let run = |args: &[&str]| {
            SyncCommand::new("git")
                .current_dir(dir)
                .args(args)
                .output()
                .expect("git available");
        };
        run(&["init", "-q", "-b", "main"]);
        run(&["config", "user.email", "test@example.invalid"]);
        run(&["config", "user.name", "Test"]);
        std::fs::write(dir.join("README.md"), "hello\n").unwrap();
        run(&["add", "README.md"]);
        run(&["commit", "-q", "-m", "init"]);
    }

    /// A remote that is a second local repository, so a push is a real push
    /// with no network.
    fn repo_with_remote() -> (tempfile::TempDir, PathBuf, PathBuf) {
        let root = tempfile::tempdir().expect("tempdir");
        let remote = root.path().join("remote.git");
        SyncCommand::new("git")
            .args(["init", "-q", "--bare", remote.to_str().expect("path")])
            .output()
            .expect("git available");
        let work = root.path().join("work");
        std::fs::create_dir_all(&work).unwrap();
        init_repo(&work);
        SyncCommand::new("git")
            .current_dir(&work)
            .args(["remote", "add", "origin", remote.to_str().expect("path")])
            .output()
            .expect("git available");
        (root, work, remote)
    }

    fn commit(dir: &Path, name: &str) {
        std::fs::write(dir.join(name), name).unwrap();
        SyncCommand::new("git")
            .current_dir(dir)
            .args(["add", name])
            .output()
            .expect("git");
        SyncCommand::new("git")
            .current_dir(dir)
            .args(["commit", "-qm", name])
            .output()
            .expect("git");
    }

    #[tokio::test]
    async fn a_read_runs_without_asking_anyone() {
        let dir = tempfile::tempdir().expect("tempdir");
        init_repo(dir.path());
        let (callback, seen) = recording(ApprovalDecision::Deny);

        let result = execute_git_tool(
            "git_status",
            &HashMap::new(),
            Some(dir.path()),
            false,
            false,
            Some(&callback),
        )
        .await
        .expect("status");

        assert!(result.success, "{}", result.output);
        assert!(result.output.contains("\"branch\":\"main\""));
        assert!(
            seen.lock().expect("seen").is_empty(),
            "a read must not put a prompt in front of the user"
        );
    }

    #[tokio::test]
    async fn a_destructive_operation_does_not_run_when_the_user_declines() {
        let dir = tempfile::tempdir().expect("tempdir");
        init_repo(dir.path());
        std::fs::write(dir.path().join("README.md"), "the user was here\n").unwrap();
        let (callback, seen) = recording(ApprovalDecision::Deny);

        let result = execute_git_tool(
            "git_reset",
            &args(&[("rev", "HEAD"), ("mode", "hard")]),
            Some(dir.path()),
            false,
            false,
            Some(&callback),
        )
        .await
        .expect("reset");

        assert!(!result.success);
        assert_eq!(
            std::fs::read_to_string(dir.path().join("README.md")).unwrap(),
            "the user was here\n",
            "a declined reset must leave the working tree alone"
        );
        let requests = seen.lock().expect("seen");
        assert_eq!(requests.len(), 1);
        assert!(matches!(
            &requests[0].kind,
            ApprovalRequestKind::Git { tool_name, .. } if tool_name == "git_reset"
        ));
        assert!(
            requests[0]
                .detail
                .iter()
                .any(|line| line.contains("README.md")),
            "the prompt must name the file the reset would discard: {:?}",
            requests[0].detail
        );
    }

    #[tokio::test]
    async fn a_destructive_operation_with_nobody_to_ask_refuses_rather_than_assuming_yes() {
        let dir = tempfile::tempdir().expect("tempdir");
        init_repo(dir.path());
        std::fs::write(dir.path().join("untracked.txt"), "keep me\n").unwrap();

        let result = execute_git_tool(
            "git_clean",
            &args(&[("directories", "true")]),
            Some(dir.path()),
            false,
            false,
            None,
        )
        .await
        .expect("clean");

        assert!(!result.success);
        assert!(
            dir.path().join("untracked.txt").exists(),
            "a headless session must not delete untracked files unattended"
        );
    }

    #[tokio::test]
    async fn turning_the_repositorys_hooks_off_is_asked_about_on_its_own() {
        let dir = tempfile::tempdir().expect("tempdir");
        init_repo(dir.path());
        let (callback, seen) = recording(ApprovalDecision::Deny);

        let result = execute_git_tool(
            "git_merge",
            &args(&[("rev", "HEAD"), ("bypass_hooks", "true")]),
            Some(dir.path()),
            false,
            false,
            Some(&callback),
        )
        .await
        .expect("merge");

        assert!(!result.success);
        {
            let requests = seen.lock().expect("seen");
            assert_eq!(requests.len(), 1);
            assert!(requests[0]
                .detail
                .iter()
                .any(|line| line.contains("hooks turned off")));
        }

        let (allowing, respecting) = recording(ApprovalDecision::AllowOnce);
        let merged = execute_git_tool(
            "git_merge",
            &args(&[("rev", "HEAD")]),
            Some(dir.path()),
            false,
            false,
            Some(&allowing),
        )
        .await
        .expect("merge");
        assert!(merged.success, "{}", merged.output);
        assert!(
            respecting.lock().expect("seen").is_empty(),
            "a merge that respects the hooks is not a second approval category"
        );
    }

    #[tokio::test]
    async fn a_branch_the_repository_protects_is_refused_rather_than_offered() {
        let dir = tempfile::tempdir().expect("tempdir");
        init_repo(dir.path());
        SyncCommand::new("git")
            .current_dir(dir.path())
            .args(["branch", "release"])
            .output()
            .expect("git");
        let (callback, seen) = recording(ApprovalDecision::AlwaysAllow);

        let result = execute_git_tool(
            "git_branch_delete",
            &args(&[("name", "main")]),
            Some(dir.path()),
            false,
            false,
            Some(&callback),
        )
        .await
        .expect("delete");

        assert!(!result.success);
        assert!(result.output.contains("protected"), "{}", result.output);
        assert_eq!(
            seen.lock().expect("seen").len(),
            1,
            "the user is still shown what was attempted"
        );
    }

    #[tokio::test]
    async fn a_push_runs_only_on_the_consent_the_user_gave_for_that_plan() {
        let (_root, work, remote) = repo_with_remote();
        commit(&work, "feature.txt");
        let (callback, seen) = recording(ApprovalDecision::AllowOnce);

        let result = execute_git_tool(
            "git_push",
            &HashMap::new(),
            Some(&work),
            false,
            false,
            Some(&callback),
        )
        .await
        .expect("push");

        assert!(result.success, "{}", result.output);
        let requests = seen.lock().expect("seen");
        assert_eq!(requests.len(), 1);
        assert!(matches!(
            &requests[0].kind,
            ApprovalRequestKind::GitPush { branch, force, .. }
                if branch == "main" && !force
        ));
        assert!(
            requests[0].detail.iter().any(|line| line.contains("init"))
                && requests[0]
                    .detail
                    .iter()
                    .any(|line| line.contains("feature.txt")),
            "every commit the push would send is shown: {:?}",
            requests[0].detail
        );

        let landed = SyncCommand::new("git")
            .current_dir(&remote)
            .args(["rev-parse", "refs/heads/main"])
            .output()
            .expect("git");
        assert!(landed.status.success());
    }

    #[tokio::test]
    async fn a_declined_push_sends_nothing() {
        let (_root, work, remote) = repo_with_remote();
        commit(&work, "feature.txt");
        let (callback, _seen) = recording(ApprovalDecision::Deny);

        let result = execute_git_tool(
            "git_push",
            &HashMap::new(),
            Some(&work),
            false,
            false,
            Some(&callback),
        )
        .await
        .expect("push");

        assert!(!result.success);
        let landed = SyncCommand::new("git")
            .current_dir(&remote)
            .args(["rev-parse", "--verify", "refs/heads/main"])
            .output()
            .expect("git");
        assert!(
            !landed.status.success(),
            "the remote must hold nothing after a declined push"
        );
    }

    #[tokio::test]
    async fn a_headless_session_cannot_push_because_nobody_can_answer() {
        let (_root, work, remote) = repo_with_remote();
        commit(&work, "feature.txt");

        let result = execute_git_tool("git_push", &HashMap::new(), Some(&work), false, false, None)
            .await
            .expect("push");

        assert!(!result.success);
        assert!(result.output.contains("not approved"), "{}", result.output);
        let landed = SyncCommand::new("git")
            .current_dir(&remote)
            .args(["rev-parse", "--verify", "refs/heads/main"])
            .output()
            .expect("git");
        assert!(!landed.status.success());
    }

    /// The consent names the commits the user saw. A branch that moved after
    /// they answered is a different push, and `GitApi::push` re-reads the
    /// checkout rather than trusting the plan.
    #[tokio::test]
    async fn consent_given_before_the_branch_moved_does_not_carry_the_new_commit() {
        let (_root, work, remote) = repo_with_remote();
        commit(&work, "first.txt");

        let git = GitApi::at(&work);
        let policy = repository_policy(&work);
        let plan = git
            .push_plan("origin", PushForce::Never, &policy)
            .await
            .expect("plan");
        let (callback, _seen) = recording(ApprovalDecision::AllowOnce);
        let approver = SurfaceApprover {
            callback: Some(&callback),
            interactive: false,
        };
        let consent = request_push_consent(&approver, &plan)
            .await
            .expect("the user allowed the plan they were shown");

        commit(&work, "second.txt");

        let result = run_approved_push("git_push", &git, plan, consent)
            .await
            .expect("push");
        assert!(!result.success);
        assert!(result.output.contains("moved"), "{}", result.output);
        let landed = SyncCommand::new("git")
            .current_dir(&remote)
            .args(["rev-parse", "--verify", "refs/heads/main"])
            .output()
            .expect("git");
        assert!(!landed.status.success());
    }
}
