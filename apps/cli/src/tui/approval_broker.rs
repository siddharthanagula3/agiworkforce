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

use tokio::sync::{oneshot, Mutex, Notify};
use uuid::Uuid;

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
}
