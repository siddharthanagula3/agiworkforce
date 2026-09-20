use chrono::Utc;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use super::session::{
    activity_text, push_bounded, ManagedSession, ManagedSessionApproval,
    ManagedSessionApprovalOutcome, ManagedSessionFileChange, ManagedSessionFileChangeKind,
    ManagedSessionValidation, ManagedSessionValidationOutcome, MANAGED_SESSION_MAX_APPROVALS,
    MANAGED_SESSION_MAX_FILE_CHANGES, MANAGED_SESSION_MAX_VALIDATIONS,
};
use super::validation_run::{classify_validation, ValidationKind};
use crate::tui::approval_broker::{ApprovalDecision, ApprovalRequest};

const PATH_ARGUMENT_TOOLS: [&str; 4] = ["write_file", "edit_file", "multiedit", "notebook_edit"];

/// A file larger than this is named in the turn diff but not diffed: holding
/// two copies of every file a long turn touches is what would make this
/// unaffordable, and a surface renders a header it can act on either way.
const MAX_DIFFED_FILE_BYTES: u64 = 512 * 1024;

/// How much unified diff one turn may carry. Past it the diff is truncated and
/// the remaining paths still appear in `paths`.
const MAX_TURN_DIFF_BYTES: usize = 256 * 1024;

#[derive(Debug)]
struct PendingWrite {
    tool: String,
    targets: Vec<(PathBuf, bool)>,
    before: HashMap<PathBuf, String>,
}

/// A check that has started and not yet reported. Until it does, the session
/// holds it as interrupted, because that is what it is if the turn ends here.
#[derive(Debug)]
struct PendingValidation {
    command: String,
    kind: ValidationKind,
}

/// What a session did that its transcript does not say on its own: the
/// approvals decided and the files written. Shared, because approvals are
/// decided inside a tool call while the session itself is borrowed by the turn.
#[derive(Debug, Default)]
pub struct SessionActivity {
    approvals: Vec<ManagedSessionApproval>,
    file_changes: Vec<ManagedSessionFileChange>,
    validations: Vec<ManagedSessionValidation>,
    pending_writes: HashMap<String, PendingWrite>,
    pending_validations: HashMap<String, PendingValidation>,
    turn_diff: Vec<(PathBuf, String)>,
    commit: Option<String>,
}

pub type SharedSessionActivity = Arc<Mutex<SessionActivity>>;

impl SessionActivity {
    pub fn from_session(session: &ManagedSession) -> Self {
        Self {
            approvals: session.approvals.clone(),
            file_changes: session.file_changes.clone(),
            validations: session.validations.clone(),
            pending_writes: HashMap::new(),
            pending_validations: HashMap::new(),
            turn_diff: Vec::new(),
            commit: session
                .code
                .as_ref()
                .and_then(|code| code.git.as_ref())
                .and_then(|git| git.head_commit.clone()),
        }
    }

    pub fn write_to(&self, session: &mut ManagedSession) {
        session.approvals = self.approvals.clone();
        session.file_changes = self.file_changes.clone();
        session.validations = self.validations.clone();
    }

    pub fn file_changes(&self) -> &[ManagedSessionFileChange] {
        &self.file_changes
    }

    pub fn validations(&self) -> &[ManagedSessionValidation] {
        &self.validations
    }

    /// The unified diff of everything written since the last call, and the
    /// paths it covers. Taking it clears it, so one turn's diff is never
    /// reported again by the next.
    pub fn take_turn_diff(&mut self) -> Option<(String, Vec<String>)> {
        if self.turn_diff.is_empty() {
            return None;
        }
        let mut unified = String::new();
        let mut paths = Vec::new();
        for (path, body) in std::mem::take(&mut self.turn_diff) {
            let display = path.display().to_string();
            paths.push(display.clone());
            if unified.len() >= MAX_TURN_DIFF_BYTES {
                continue;
            }
            unified.push_str(&format!("--- a/{display}\n+++ b/{display}\n"));
            unified.push_str(body.as_str());
            unified.push('\n');
        }
        Some((unified, paths))
    }

    pub fn record_approval(
        &mut self,
        request: &ApprovalRequest,
        requested_at: chrono::DateTime<Utc>,
        decision: ApprovalDecision,
    ) {
        push_bounded(
            &mut self.approvals,
            ManagedSessionApproval {
                request_id: request.id.to_string(),
                kind: activity_text(&format!("{:?}", request.kind)),
                summary: activity_text(&request.summary),
                outcome: approval_outcome(decision),
                requested_at,
                decided_at: Utc::now(),
            },
            MANAGED_SESSION_MAX_APPROVALS,
        );
    }

    /// Note the files a mutating tool is about to write, and whether each
    /// already exists, before it runs.
    pub fn tool_started(
        &mut self,
        call_id: &str,
        tool: &str,
        args: &serde_json::Value,
        workspace_root: Option<&Path>,
    ) {
        if let Some((command, kind)) = validation_target(args) {
            // Read HEAD now rather than when the session opened: the agent
            // commits mid-turn, and a check recorded against the commit it did
            // not run on is worse than no record at all.
            if let Some(root) = workspace_root {
                if let Some(commit) = workspace_commit(root) {
                    self.commit = Some(commit);
                }
            }
            self.record_validation(&command, kind, ManagedSessionValidationOutcome::Interrupted);
            self.pending_validations
                .insert(call_id.to_string(), PendingValidation { command, kind });
        }
        let targets = write_targets(tool, args)
            .into_iter()
            .map(|target| {
                let path = match workspace_root {
                    Some(root) if target.is_relative() => root.join(target),
                    _ => target,
                };
                let existed = path.exists();
                (path, existed)
            })
            .collect::<Vec<_>>();
        if targets.is_empty() {
            return;
        }
        let mut before = HashMap::new();
        for (path, existed) in &targets {
            if !existed {
                continue;
            }
            if let Some(text) = readable_text(path) {
                before.insert(path.clone(), text);
            }
        }
        self.pending_writes.insert(
            call_id.to_string(),
            PendingWrite {
                tool: tool.to_string(),
                targets,
                before,
            },
        );
    }

    /// Record the writes of a tool that succeeded. Returns what was recorded.
    pub fn tool_finished(&mut self, call_id: &str, ok: bool) -> Vec<ManagedSessionFileChange> {
        if let Some(pending) = self.pending_validations.remove(call_id) {
            let outcome = if ok {
                ManagedSessionValidationOutcome::Passed
            } else {
                ManagedSessionValidationOutcome::Failed
            };
            self.settle_validation(&pending.command, pending.kind, outcome);
        }
        let Some(pending) = self.pending_writes.remove(call_id) else {
            return Vec::new();
        };
        if !ok {
            return Vec::new();
        }
        let changed_at = Utc::now();
        let mut recorded = Vec::new();
        for (path, existed) in pending.targets {
            if !path.exists() {
                continue;
            }
            if let Some(after) = readable_text(&path) {
                let before = pending.before.get(&path).cloned().unwrap_or_default();
                if before != after {
                    self.turn_diff.push((
                        path.clone(),
                        crate::tools::generate_simple_diff(&before, &after),
                    ));
                }
            }
            let change = ManagedSessionFileChange {
                path,
                kind: if existed {
                    ManagedSessionFileChangeKind::Modified
                } else {
                    ManagedSessionFileChangeKind::Created
                },
                tool: pending.tool.clone(),
                tool_call_id: activity_text(call_id),
                changed_at,
            };
            recorded.push(change.clone());
            push_bounded(
                &mut self.file_changes,
                change,
                MANAGED_SESSION_MAX_FILE_CHANGES,
            );
        }
        recorded
    }

    fn record_validation(
        &mut self,
        command: &str,
        kind: ValidationKind,
        outcome: ManagedSessionValidationOutcome,
    ) {
        push_bounded(
            &mut self.validations,
            ManagedSessionValidation {
                command: activity_text(command),
                kind,
                outcome,
                ran_at: Utc::now(),
                commit: self.commit.clone(),
            },
            MANAGED_SESSION_MAX_VALIDATIONS,
        );
    }

    /// Replace the interrupted entry a started check left behind, so one run
    /// is one entry whichever way the turn ends.
    fn settle_validation(
        &mut self,
        command: &str,
        kind: ValidationKind,
        outcome: ManagedSessionValidationOutcome,
    ) {
        let command = activity_text(command);
        let settled = self.validations.iter_mut().rev().find(|validation| {
            validation.command == command
                && validation.outcome == ManagedSessionValidationOutcome::Interrupted
        });
        match settled {
            Some(validation) => {
                validation.outcome = outcome;
                validation.ran_at = Utc::now();
            }
            None => self.record_validation(&command, kind, outcome),
        }
    }

    /// The commit checks are recorded against, as the workspace moves.
    pub fn set_commit(&mut self, commit: Option<String>) {
        self.commit = commit;
    }
}

/// The commit the workspace is on, read from git's own files rather than a
/// subprocess: this runs on the turn's event path, where a process spawn per
/// check would be paid on every command the agent runs.
pub fn workspace_commit(root: &Path) -> Option<String> {
    let pointer = root.join(".git");
    let git_dir = if pointer.is_file() {
        let contents = std::fs::read_to_string(&pointer).ok()?;
        let target = contents.trim().strip_prefix("gitdir:")?.trim();
        let target = PathBuf::from(target);
        if target.is_absolute() {
            target
        } else {
            root.join(target)
        }
    } else {
        pointer
    };

    let head = std::fs::read_to_string(git_dir.join("HEAD")).ok()?;
    let head = head.trim();
    let Some(reference) = head.strip_prefix("ref: ") else {
        return (head.len() >= 40).then(|| head.to_string());
    };
    let loose = std::fs::read_to_string(git_dir.join(reference))
        .ok()
        .map(|commit| commit.trim().to_string())
        .filter(|commit| !commit.is_empty());
    loose.or_else(|| packed_commit(&git_dir, reference))
}

/// A ref git has packed away has no file of its own.
fn packed_commit(git_dir: &Path, reference: &str) -> Option<String> {
    let packed = std::fs::read_to_string(git_dir.join("packed-refs")).ok()?;
    packed.lines().find_map(|line| {
        let (commit, name) = line.split_once(' ')?;
        (name.trim() == reference).then(|| commit.trim().to_string())
    })
}

/// The command a tool call would run, when it is a check on the work.
fn validation_target(args: &serde_json::Value) -> Option<(String, ValidationKind)> {
    let command = args.get("command").and_then(serde_json::Value::as_str)?;
    classify_validation(command).map(|kind| (command.to_string(), kind))
}

/// Wrap an approval callback so every decision it returns is recorded on the
/// session before the tool sees it.
pub fn recording_approval_callback(
    activity: SharedSessionActivity,
    inner: crate::tools::ApprovalCallback,
) -> crate::tools::ApprovalCallback {
    Arc::new(move |request: ApprovalRequest| {
        let activity = activity.clone();
        let inner = inner.clone();
        Box::pin(async move {
            let requested_at = Utc::now();
            let recorded = ApprovalRequest {
                id: request.id,
                kind: request.kind.clone(),
                summary: request.summary.clone(),
                detail: Vec::new(),
            };
            let decision = inner(request).await;
            if let Ok(mut activity) = activity.lock() {
                activity.record_approval(&recorded, requested_at, decision);
            }
            decision
        })
    })
}

/// The file's text, when it is small enough to hold two copies of and is not
/// binary. `None` means the turn diff names the path without diffing it.
fn readable_text(path: &Path) -> Option<String> {
    let metadata = std::fs::metadata(path).ok()?;
    if !metadata.is_file() || metadata.len() > MAX_DIFFED_FILE_BYTES {
        return None;
    }
    std::fs::read_to_string(path).ok()
}

fn approval_outcome(decision: ApprovalDecision) -> ManagedSessionApprovalOutcome {
    match decision {
        ApprovalDecision::AllowOnce => ManagedSessionApprovalOutcome::AllowOnce,
        ApprovalDecision::AllowSession => ManagedSessionApprovalOutcome::AllowSession,
        ApprovalDecision::AlwaysAllow => ManagedSessionApprovalOutcome::AlwaysAllow,
        ApprovalDecision::Deny => ManagedSessionApprovalOutcome::Deny,
        ApprovalDecision::Cancel => ManagedSessionApprovalOutcome::Cancel,
        ApprovalDecision::Timeout => ManagedSessionApprovalOutcome::Timeout,
    }
}

fn write_targets(tool: &str, args: &serde_json::Value) -> Vec<PathBuf> {
    if PATH_ARGUMENT_TOOLS.contains(&tool) {
        return ["path", "file_path"]
            .iter()
            .find_map(|key| args.get(*key).and_then(serde_json::Value::as_str))
            .filter(|path| !path.trim().is_empty())
            .map(|path| vec![PathBuf::from(path)])
            .unwrap_or_default();
    }
    if tool == "apply_patch" {
        let Some(patch) = args.get("patch").and_then(serde_json::Value::as_str) else {
            return Vec::new();
        };
        let mut targets = Vec::new();
        for line in patch.lines() {
            let Some(target) = line.strip_prefix("+++ ") else {
                continue;
            };
            let target = target.split('\t').next().unwrap_or(target).trim();
            if target == "/dev/null" || target.is_empty() {
                continue;
            }
            let target = PathBuf::from(target.strip_prefix("b/").unwrap_or(target));
            if !targets.contains(&target) {
                targets.push(target);
            }
        }
        return targets;
    }
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tui::approval_broker::ApprovalRequestKind;
    use tempfile::tempdir;

    #[test]
    fn a_successful_write_is_recorded_as_generated_or_modified_by_what_existed_before() {
        let workspace = tempdir().expect("workspace");
        std::fs::write(workspace.path().join("existing.rs"), "old").unwrap();
        let mut activity = SessionActivity::default();

        activity.tool_started(
            "call-1",
            "write_file",
            &serde_json::json!({ "path": "generated.rs" }),
            Some(workspace.path()),
        );
        activity.tool_started(
            "call-2",
            "edit_file",
            &serde_json::json!({ "path": "existing.rs" }),
            Some(workspace.path()),
        );
        activity.tool_started(
            "call-3",
            "write_file",
            &serde_json::json!({ "path": "denied.rs" }),
            Some(workspace.path()),
        );
        activity.tool_started(
            "call-4",
            "read_file",
            &serde_json::json!({ "path": "existing.rs" }),
            Some(workspace.path()),
        );
        std::fs::write(workspace.path().join("generated.rs"), "new").unwrap();

        let generated = activity.tool_finished("call-1", true);
        assert_eq!(generated.len(), 1);
        assert_eq!(generated[0].kind, ManagedSessionFileChangeKind::Created);
        assert_eq!(generated[0].path, workspace.path().join("generated.rs"));
        assert_eq!(
            activity.tool_finished("call-2", true)[0].kind,
            ManagedSessionFileChangeKind::Modified
        );
        assert!(activity.tool_finished("call-3", false).is_empty());
        assert!(activity.tool_finished("call-4", true).is_empty());

        let mut session = ManagedSession::new("activity", Utc::now());
        activity.write_to(&mut session);
        assert_eq!(session.file_changes.len(), 2);
        assert_eq!(session.file_changes[0].tool, "write_file");
    }

    #[test]
    fn a_turns_diff_covers_every_file_it_wrote_and_is_reported_once() {
        let workspace = tempdir().expect("workspace");
        std::fs::write(workspace.path().join("kept.rs"), "one\ntwo\n").unwrap();
        let mut activity = SessionActivity::default();

        activity.tool_started(
            "call-1",
            "edit_file",
            &serde_json::json!({ "path": "kept.rs" }),
            Some(workspace.path()),
        );
        activity.tool_started(
            "call-2",
            "write_file",
            &serde_json::json!({ "path": "fresh.rs" }),
            Some(workspace.path()),
        );
        std::fs::write(workspace.path().join("kept.rs"), "one\nthree\n").unwrap();
        std::fs::write(workspace.path().join("fresh.rs"), "new\n").unwrap();
        activity.tool_finished("call-1", true);
        activity.tool_finished("call-2", true);

        let (diff, paths) = activity.take_turn_diff().expect("the turn wrote files");
        assert_eq!(paths.len(), 2);
        assert!(diff.contains("-two"));
        assert!(diff.contains("+three"));
        assert!(diff.contains("+new"));
        assert!(diff.contains("+++ b/"));
        assert!(
            activity.take_turn_diff().is_none(),
            "the next turn must not be handed this turn's diff"
        );
    }

    #[test]
    fn a_write_that_changes_nothing_contributes_no_diff() {
        let workspace = tempdir().expect("workspace");
        std::fs::write(workspace.path().join("same.rs"), "unchanged\n").unwrap();
        let mut activity = SessionActivity::default();

        activity.tool_started(
            "call-1",
            "write_file",
            &serde_json::json!({ "path": "same.rs" }),
            Some(workspace.path()),
        );
        activity.tool_finished("call-1", true);

        assert!(activity.take_turn_diff().is_none());
    }

    #[test]
    fn patch_targets_are_the_new_side_of_each_file_header() {
        let targets = write_targets(
            "apply_patch",
            &serde_json::json!({
                "patch": "--- /dev/null\n+++ b/src/new.rs\n@@ -0,0 +1 @@\n+x\n--- a/src/old.rs\n+++ b/src/old.rs\n--- a/gone.rs\n+++ /dev/null\n"
            }),
        );
        assert_eq!(
            targets,
            vec![PathBuf::from("src/new.rs"), PathBuf::from("src/old.rs")]
        );
    }

    /// The agent commits mid-turn and then runs its checks. Reading HEAD when
    /// the check starts is what keeps the record pointing at the code that was
    /// actually tested.
    #[test]
    fn a_check_is_recorded_against_the_commit_the_workspace_was_on_when_it_started() {
        let workspace = tempdir().expect("workspace");
        let run = |args: &[&str]| {
            std::process::Command::new("git")
                .current_dir(workspace.path())
                .args(args)
                .output()
                .expect("git available");
        };
        run(&["init", "-q", "-b", "main"]);
        run(&["config", "user.email", "test@example.invalid"]);
        run(&["config", "user.name", "Test"]);
        std::fs::write(workspace.path().join("a.rs"), "first").unwrap();
        run(&["add", "a.rs"]);
        run(&["commit", "-q", "-m", "first"]);
        let first = workspace_commit(workspace.path()).expect("a commit");
        assert_eq!(first.len(), 40);

        let mut activity = SessionActivity::default();
        activity.tool_started(
            "call-1",
            "run_command",
            &serde_json::json!({ "command": "cargo test -p agiworkforce-cli" }),
            Some(workspace.path()),
        );
        activity.tool_finished("call-1", true);

        std::fs::write(workspace.path().join("a.rs"), "second").unwrap();
        run(&["commit", "-qam", "second"]);
        let second = workspace_commit(workspace.path()).expect("a commit");
        assert_ne!(first, second, "the workspace moved");

        activity.tool_started(
            "call-2",
            "run_command",
            &serde_json::json!({ "command": "cargo test -p agiworkforce-cli" }),
            Some(workspace.path()),
        );
        activity.tool_finished("call-2", true);

        let mut session = ManagedSession::new("checks", Utc::now());
        activity.write_to(&mut session);
        assert_eq!(session.validations.len(), 2);
        assert_eq!(
            session.validations[0].commit.as_deref(),
            Some(first.as_str())
        );
        assert_eq!(
            session.validations[1].commit.as_deref(),
            Some(second.as_str()),
            "the second check ran on the commit the first one did not"
        );
    }

    #[test]
    fn a_workspace_with_no_repository_records_no_commit() {
        let workspace = tempdir().expect("workspace");
        assert!(workspace_commit(workspace.path()).is_none());

        let mut activity = SessionActivity::default();
        activity.tool_started(
            "call-1",
            "run_command",
            &serde_json::json!({ "command": "cargo test -p agiworkforce-cli" }),
            Some(workspace.path()),
        );
        let mut session = ManagedSession::new("checks", Utc::now());
        activity.write_to(&mut session);
        assert!(session.validations[0].commit.is_none());
    }

    #[tokio::test]
    async fn every_decision_the_callback_returns_is_recorded_on_the_session() {
        let activity: SharedSessionActivity = Arc::default();
        let inner: crate::tools::ApprovalCallback =
            Arc::new(|_request| Box::pin(async { ApprovalDecision::Deny }));
        let callback = recording_approval_callback(activity.clone(), inner);

        let decision = callback(ApprovalRequest::new(
            ApprovalRequestKind::Exec {
                command: "rm -rf build".to_string(),
            },
            "Run rm -rf build\nin the workspace",
            vec!["detail".to_string()],
        ))
        .await;

        assert_eq!(decision, ApprovalDecision::Deny);
        let mut session = ManagedSession::new("approvals", Utc::now());
        activity.lock().unwrap().write_to(&mut session);
        assert_eq!(session.approvals.len(), 1);
        assert_eq!(
            session.approvals[0].outcome,
            ManagedSessionApprovalOutcome::Deny
        );
        assert!(!session.approvals[0].summary.contains('\n'));
    }

    #[test]
    fn a_check_the_session_ran_is_kept_with_its_outcome_and_the_commit_it_ran_against() {
        let mut activity = SessionActivity::default();
        activity.set_commit(Some("abc123".to_string()));

        activity.tool_started(
            "call-1",
            "run_command",
            &serde_json::json!({ "command": "cargo test -p agiworkforce-cli" }),
            None,
        );
        assert_eq!(
            activity.validations()[0].outcome,
            ManagedSessionValidationOutcome::Interrupted,
            "a check that has not reported proves nothing"
        );

        activity.tool_finished("call-1", false);
        assert_eq!(activity.validations().len(), 1, "one run is one entry");
        let recorded = &activity.validations()[0];
        assert_eq!(recorded.outcome, ManagedSessionValidationOutcome::Failed);
        assert_eq!(recorded.kind, ValidationKind::Test);
        assert_eq!(recorded.commit.as_deref(), Some("abc123"));

        activity.tool_started(
            "call-2",
            "run_command",
            &serde_json::json!({ "command": "git push origin main" }),
            None,
        );
        activity.tool_finished("call-2", true);
        assert_eq!(
            activity.validations().len(),
            1,
            "work that changes the tree is not a check"
        );

        let mut session = ManagedSession::new("session", Utc::now());
        activity.write_to(&mut session);
        assert_eq!(session.validations.len(), 1);
    }
}
