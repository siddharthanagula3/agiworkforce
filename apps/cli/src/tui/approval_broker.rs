//! TUI approval broker.
//!
//! This module is the async bridge between agent/tool execution tasks and the
//! Ratatui event loop. Tool code requests approval through the broker, the TUI
//! drains pending requests into an overlay, then completes the request with the
//! user's decision.

#![allow(dead_code)]

use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::Arc;

use agiworkforce_protocol::agent_events::AgentEventApprovalRiskLevel;
use tokio::sync::{oneshot, Mutex, Notify};
use uuid::Uuid;

use crate::safety::{filesystem_effect::FilesystemEffect, CommandSafety};

/// The specific action category that needs user approval.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ApprovalRequestKind {
    Exec {
        command: String,
    },
    FileWrite {
        path: PathBuf,
    },
    FileEdit {
        path: PathBuf,
    },
    Patch {
        files: Vec<PathBuf>,
    },
    LoopDetection {
        repeated_action: String,
    },
    McpTool {
        server_name: String,
        tool_name: String,
    },
    McpElicitation {
        server_name: String,
    },
    AskUser {
        question: String,
    },
    Hook {
        hook_name: String,
    },
    Subagent {
        name: String,
    },
    TrustDirectory {
        path: PathBuf,
    },
    WorkspacePolicy {
        tool_name: String,
        primary_argument: String,
    },
    ComputerUse {
        action: String,
        target: String,
    },
    Network {
        tool_name: String,
        destination: String,
    },
    /// A typed git operation that changes the repository. `target` is what it
    /// acts on: the ref, the paths, or the remote.
    Git {
        tool_name: String,
        target: String,
    },
    /// A push, which is the only operation that can put work somewhere the
    /// user cannot take it back from. Answered through
    /// `safety::push_consent::request_push_consent` and nowhere else.
    GitPush {
        remote: String,
        branch: String,
        force: bool,
    },
}

/// How hard the user should think before allowing an action, and whether they
/// can take it back afterwards.
///
/// The CLI works both of these out anyway to decide whether to prompt at all,
/// through [`crate::safety::classify_command`] and the filesystem effect
/// taxonomy beside it. Until they were carried they stayed inside the
/// terminal, so an editor showing the same prompt had to leave the user to
/// judge `rm -rf build` and `ls` by eye.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ApprovalRisk {
    pub level: AgentEventApprovalRiskLevel,
    /// Whether allowing this leaves the user able to put things back with what
    /// is on this machine. A command that only reads is reversible because it
    /// changed nothing; anything that leaves the machine is not, because
    /// nothing here can recall it.
    pub reversible: bool,
}

impl ApprovalRequestKind {
    pub fn risk(&self) -> ApprovalRisk {
        use AgentEventApprovalRiskLevel as Level;
        let (level, reversible) = match self {
            Self::Exec { command } => {
                let level = match crate::safety::classify_command(command) {
                    CommandSafety::Safe => Level::Low,
                    CommandSafety::Unknown => Level::Medium,
                    CommandSafety::Dangerous => Level::High,
                };
                let effect = crate::safety::classify_filesystem_effect(command);
                (
                    level,
                    matches!(effect, FilesystemEffect::None | FilesystemEffect::Read),
                )
            }
            // Nothing outside the conversation moves, so there is nothing to
            // put back.
            Self::LoopDetection { .. } | Self::AskUser { .. } | Self::McpElicitation { .. } => {
                (Level::Low, true)
            }
            // A trust grant widens what may run without asking again, and the
            // user withdraws it the same way they gave it.
            Self::TrustDirectory { .. } => (Level::Medium, true),
            // AGI keeps no copy of what a file held before it wrote to it, so
            // it cannot offer to put the file back.
            Self::FileWrite { .. } | Self::FileEdit { .. } | Self::Patch { .. } => {
                (Level::Medium, false)
            }
            // Whatever these reach is outside this machine's control: a remote
            // tool, a hook's own side effects, a branch someone else may
            // already have pulled.
            Self::McpTool { .. }
            | Self::Hook { .. }
            | Self::Subagent { .. }
            | Self::WorkspacePolicy { .. }
            | Self::Network { .. }
            | Self::Git { .. } => (Level::Medium, false),
            Self::ComputerUse { .. } => (Level::High, false),
            Self::GitPush { force, .. } => {
                (if *force { Level::High } else { Level::Medium }, false)
            }
        };
        ApprovalRisk { level, reversible }
    }
}

/// A single approval prompt waiting for the user.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApprovalRequest {
    pub id: Uuid,
    pub kind: ApprovalRequestKind,
    pub summary: String,
    pub detail: Vec<String>,
}

impl ApprovalRequest {
    pub fn new(kind: ApprovalRequestKind, summary: impl Into<String>, detail: Vec<String>) -> Self {
        Self {
            id: Uuid::new_v4(),
            kind,
            summary: summary.into(),
            detail,
        }
    }
}

/// The user's answer to an approval request.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApprovalDecision {
    AllowOnce,
    AllowSession,
    AlwaysAllow,
    Deny,
    Cancel,
    Timeout,
}

impl ApprovalDecision {
    pub fn is_allowing(self) -> bool {
        matches!(
            self,
            Self::AllowOnce | Self::AllowSession | Self::AlwaysAllow
        )
    }
}

#[derive(Default)]
struct ApprovalBrokerState {
    pending: VecDeque<ApprovalRequest>,
    responders: HashMap<Uuid, oneshot::Sender<ApprovalDecision>>,
    /// Once set, every new (and currently pending) request resolves to
    /// `Cancel` without prompting. Used for "Deny All" within a single turn.
    deny_all: bool,
}

/// Shared broker handle. Clone it freely between the TUI and worker tasks.
#[derive(Clone, Default)]
pub struct ApprovalBroker {
    state: Arc<Mutex<ApprovalBrokerState>>,
    /// Wakes the TUI event loop when a request is enqueued, so it can drain
    /// pending requests without busy-polling. `notify_one` stores a permit if
    /// no waiter is parked, so a request enqueued between drains is not lost.
    notify: Arc<Notify>,
}

impl ApprovalBroker {
    pub fn new() -> Self {
        Self::default()
    }

    /// Worker-side: enqueue a request and wait for the TUI decision.
    ///
    /// If "Deny All" was previously selected this turn, resolves immediately to
    /// `Cancel` without enqueueing or prompting.
    pub async fn request(&self, request: ApprovalRequest) -> ApprovalDecision {
        let id = request.id;
        let (tx, rx) = oneshot::channel();
        {
            let mut state = self.state.lock().await;
            if state.deny_all {
                return ApprovalDecision::Cancel;
            }
            state.pending.push_back(request);
            state.responders.insert(id, tx);
        }
        self.notify.notify_one();
        rx.await.unwrap_or(ApprovalDecision::Cancel)
    }

    /// TUI-side: park until a request may be pending. Pairs with `drain_pending`
    /// in a `tokio::select!` against the agent turn future.
    pub async fn notified(&self) {
        self.notify.notified().await;
    }

    /// TUI-side: pop the next pending request, FIFO.
    pub async fn drain_pending(&self) -> Option<ApprovalRequest> {
        self.state.lock().await.pending.pop_front()
    }

    /// TUI-side: resolve a pending request and wake the waiting worker task.
    pub async fn complete(&self, id: Uuid, decision: ApprovalDecision) -> bool {
        let mut state = self.state.lock().await;
        if let Some(tx) = state.responders.remove(&id) {
            let _ = tx.send(decision);
            true
        } else {
            false
        }
    }

    pub async fn pending_count(&self) -> usize {
        self.state.lock().await.pending.len()
    }

    /// Cancel every request that has not received a decision yet.
    pub async fn cancel_all(&self) {
        let mut state = self.state.lock().await;
        state.pending.clear();
        let responders = std::mem::take(&mut state.responders);
        for (_, tx) in responders {
            let _ = tx.send(ApprovalDecision::Cancel);
        }
    }

    /// "Deny All": resolve every currently queued request as `Cancel` and make
    /// all *future* requests this turn resolve to `Cancel` without prompting.
    /// The broker is per-turn, so this state is naturally discarded when the
    /// turn ends and a fresh broker is created.
    pub async fn deny_all_remaining(&self) {
        let responders = {
            let mut state = self.state.lock().await;
            state.deny_all = true;
            state.pending.clear();
            std::mem::take(&mut state.responders)
        };
        for (_, tx) in responders {
            let _ = tx.send(ApprovalDecision::Cancel);
        }
    }

    /// Whether "Deny All" is currently latched.
    pub async fn is_deny_all(&self) -> bool {
        self.state.lock().await.deny_all
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn exec_request(command: &str) -> ApprovalRequest {
        ApprovalRequest::new(
            ApprovalRequestKind::Exec {
                command: command.to_string(),
            },
            "Allow command?",
            vec![command.to_string()],
        )
    }

    #[tokio::test]
    async fn queues_and_completes_request() {
        let broker = ApprovalBroker::new();
        let worker = broker.clone();
        let task = tokio::spawn(async move { worker.request(exec_request("pwd")).await });

        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        assert_eq!(broker.pending_count().await, 1);

        let pending = broker.drain_pending().await.expect("pending request");
        assert_eq!(pending.summary, "Allow command?");
        assert!(
            broker
                .complete(pending.id, ApprovalDecision::AllowOnce)
                .await
        );

        assert_eq!(task.await.expect("join"), ApprovalDecision::AllowOnce);
        assert_eq!(broker.pending_count().await, 0);
    }

    #[tokio::test]
    async fn drains_requests_fifo() {
        let broker = ApprovalBroker::new();
        let worker_a = broker.clone();
        let worker_b = broker.clone();
        let task_a = tokio::spawn(async move { worker_a.request(exec_request("one")).await });
        let task_b = tokio::spawn(async move { worker_b.request(exec_request("two")).await });

        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        let first = broker.drain_pending().await.expect("first request");
        let second = broker.drain_pending().await.expect("second request");

        assert_eq!(first.detail, vec!["one"]);
        assert_eq!(second.detail, vec!["two"]);

        broker.complete(first.id, ApprovalDecision::Deny).await;
        broker
            .complete(second.id, ApprovalDecision::AllowSession)
            .await;

        assert_eq!(task_a.await.expect("join"), ApprovalDecision::Deny);
        assert_eq!(task_b.await.expect("join"), ApprovalDecision::AllowSession);
    }

    #[tokio::test]
    async fn cancel_all_resolves_waiters() {
        let broker = ApprovalBroker::new();
        let worker = broker.clone();
        let task = tokio::spawn(async move { worker.request(exec_request("sleep 1")).await });

        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        broker.cancel_all().await;

        assert_eq!(task.await.expect("join"), ApprovalDecision::Cancel);
        assert_eq!(broker.pending_count().await, 0);
    }

    #[test]
    fn decision_allowing_helper() {
        assert!(ApprovalDecision::AllowOnce.is_allowing());
        assert!(ApprovalDecision::AllowSession.is_allowing());
        assert!(ApprovalDecision::AlwaysAllow.is_allowing());
        assert!(!ApprovalDecision::Deny.is_allowing());
    }

    #[tokio::test]
    async fn notify_wakes_a_waiter_after_request() {
        let broker = ApprovalBroker::new();
        let worker = broker.clone();
        let _task = tokio::spawn(async move { worker.request(exec_request("ls")).await });

        // notify_one stores a permit even though we park slightly after the
        // request is enqueued, so this resolves rather than hanging forever.
        tokio::time::timeout(std::time::Duration::from_secs(1), broker.notified())
            .await
            .expect("notified should fire once a request is enqueued");

        let pending = broker.drain_pending().await.expect("pending request");
        broker
            .complete(pending.id, ApprovalDecision::AllowOnce)
            .await;
    }

    #[tokio::test]
    async fn deny_all_resolves_future_requests_without_prompt() {
        let broker = ApprovalBroker::new();
        broker.deny_all_remaining().await;
        assert!(broker.is_deny_all().await);

        // A request issued after deny-all returns immediately as Cancel and is
        // never enqueued (so the TUI never has to prompt for it).
        let decision = broker.request(exec_request("rm -rf /")).await;
        assert_eq!(decision, ApprovalDecision::Cancel);
        assert_eq!(broker.pending_count().await, 0);
    }

    #[tokio::test]
    async fn deny_all_cancels_currently_pending_request() {
        let broker = ApprovalBroker::new();
        let worker = broker.clone();
        let task = tokio::spawn(async move { worker.request(exec_request("sleep 5")).await });

        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        assert_eq!(broker.pending_count().await, 1);

        broker.deny_all_remaining().await;
        assert_eq!(task.await.expect("join"), ApprovalDecision::Cancel);
        assert_eq!(broker.pending_count().await, 0);
    }

    fn exec(command: &str) -> ApprovalRisk {
        ApprovalRequestKind::Exec {
            command: command.to_string(),
        }
        .risk()
    }

    /// The rating a prompt shows is the CLI's own classification of the
    /// command, not a fixed value per prompt kind: a reader who is told the
    /// same thing about `ls` and `rm -rf build` has been told nothing.
    #[test]
    fn a_command_is_rated_by_what_it_would_actually_do() {
        assert_eq!(exec("ls -la").level, AgentEventApprovalRiskLevel::Low);
        assert_eq!(
            exec("rm -rf build").level,
            AgentEventApprovalRiskLevel::High
        );
        assert_eq!(
            exec("some-tool --apply").level,
            AgentEventApprovalRiskLevel::Medium,
            "a command nobody modelled is not a safe one"
        );
    }

    /// Reversible means this machine can put things back, so it follows the
    /// filesystem effect rather than the risk rating: reading changes nothing
    /// to undo, and AGI keeps no copy of a file it overwrote.
    #[test]
    fn reversibility_follows_what_the_command_touches() {
        assert!(exec("cat README.md").reversible);
        assert!(exec("echo hello").reversible);
        assert!(!exec("tee out.txt").reversible);
        assert!(!exec("rm build/app").reversible);
    }

    /// A push is the one operation that can put work somewhere the user
    /// cannot take it back from, and a forced one is worse than a plain one.
    #[test]
    fn work_that_leaves_this_machine_is_never_reported_as_reversible() {
        let push = ApprovalRequestKind::GitPush {
            remote: "origin".to_string(),
            branch: "main".to_string(),
            force: false,
        }
        .risk();
        assert_eq!(push.level, AgentEventApprovalRiskLevel::Medium);
        assert!(!push.reversible);

        let forced = ApprovalRequestKind::GitPush {
            remote: "origin".to_string(),
            branch: "main".to_string(),
            force: true,
        }
        .risk();
        assert_eq!(forced.level, AgentEventApprovalRiskLevel::High);
        assert!(!forced.reversible);

        let remote_tool = ApprovalRequestKind::McpTool {
            server_name: "issues".to_string(),
            tool_name: "close_issue".to_string(),
        }
        .risk();
        assert!(!remote_tool.reversible);

        let driving = ApprovalRequestKind::ComputerUse {
            action: "click".to_string(),
            target: "Send".to_string(),
        }
        .risk();
        assert_eq!(driving.level, AgentEventApprovalRiskLevel::High);
        assert!(!driving.reversible);
    }

    /// A prompt that only asks the user something moves nothing, so it is the
    /// one shape that is both low risk and reversible.
    #[test]
    fn asking_the_user_something_moves_nothing() {
        let question = ApprovalRequestKind::AskUser {
            question: "Which branch?".to_string(),
        }
        .risk();
        assert_eq!(question.level, AgentEventApprovalRiskLevel::Low);
        assert!(question.reversible);
    }
}
