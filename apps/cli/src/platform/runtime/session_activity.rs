use chrono::Utc;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use super::session::{
    activity_text, push_bounded, ManagedSession, ManagedSessionApproval,
    ManagedSessionApprovalOutcome, ManagedSessionFileChange, ManagedSessionFileChangeKind,
    MANAGED_SESSION_MAX_APPROVALS, MANAGED_SESSION_MAX_FILE_CHANGES,
};
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

/// What a session did that its transcript does not say on its own: the
/// approvals decided and the files written. Shared, because approvals are
/// decided inside a tool call while the session itself is borrowed by the turn.
#[derive(Debug, Default)]
pub struct SessionActivity {
    approvals: Vec<ManagedSessionApproval>,
    file_changes: Vec<ManagedSessionFileChange>,
    pending_writes: HashMap<String, PendingWrite>,
    turn_diff: Vec<(PathBuf, String)>,
}

pub type SharedSessionActivity = Arc<Mutex<SessionActivity>>;

impl SessionActivity {
    pub fn from_session(session: &ManagedSession) -> Self {
        Self {
            approvals: session.approvals.clone(),
            file_changes: session.file_changes.clone(),
            pending_writes: HashMap::new(),
            turn_diff: Vec::new(),
        }
    }

    pub fn write_to(&self, session: &mut ManagedSession) {
        session.approvals = self.approvals.clone();
        session.file_changes = self.file_changes.clone();
    }

    pub fn file_changes(&self) -> &[ManagedSessionFileChange] {
        &self.file_changes
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
}
