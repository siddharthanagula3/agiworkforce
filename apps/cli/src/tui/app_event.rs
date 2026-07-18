//! Internal TUI event contract.
//!
//! Widgets and background tasks should communicate with the top-level TUI by
//! sending these events instead of mutating `TuiApp` directly. This mirrors the
//! event-bus shape used by mature agent CLIs while keeping the concrete AGI
//! runtime unchanged for now.

#![allow(dead_code)]

use std::path::PathBuf;

use tokio::sync::mpsc;
use uuid::Uuid;

use super::approval_broker::{ApprovalDecision, ApprovalRequest};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NoticeLevel {
    Info,
    Warn,
    Error,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ToolStatus {
    Pending,
    Running,
    Succeeded,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TuiAppEvent {
    InputSubmitted {
        text: String,
    },
    InputQueued {
        text: String,
    },
    AgentDelta {
        text: String,
    },
    ToolStarted {
        call_id: String,
        name: String,
        summary: String,
        input: serde_json::Value,
    },
    ToolUpdated {
        call_id: String,
        status: ToolStatus,
        output_delta: Option<String>,
    },
    ToolCompleted {
        call_id: String,
        name: String,
        status: ToolStatus,
        output: String,
        duration_ms: u64,
    },
    ApprovalRequested(ApprovalRequest),
    ApprovalResolved {
        request_id: Uuid,
        decision: ApprovalDecision,
    },
    PanelOpened {
        view_id: String,
    },
    PanelClosed {
        view_id: String,
    },
    SessionChanged {
        session_id: Option<String>,
    },
    SettingsChanged {
        key: String,
    },
    FileReferenceInserted {
        path: PathBuf,
    },
    Notification {
        level: NoticeLevel,
        message: String,
    },
    FatalError {
        message: String,
    },
    RequestFrame,
}

#[derive(Clone)]
pub struct TuiAppEventSender {
    tx: mpsc::UnboundedSender<TuiAppEvent>,
}

impl TuiAppEventSender {
    pub fn new(tx: mpsc::UnboundedSender<TuiAppEvent>) -> Self {
        Self { tx }
    }

    pub fn send(&self, event: TuiAppEvent) -> bool {
        self.tx.send(event).is_ok()
    }

    pub fn input_submitted(&self, text: impl Into<String>) -> bool {
        self.send(TuiAppEvent::InputSubmitted { text: text.into() })
    }

    pub fn notify(&self, level: NoticeLevel, message: impl Into<String>) -> bool {
        self.send(TuiAppEvent::Notification {
            level,
            message: message.into(),
        })
    }

    pub fn request_frame(&self) -> bool {
        self.send(TuiAppEvent::RequestFrame)
    }
}

pub fn channel() -> (TuiAppEventSender, mpsc::UnboundedReceiver<TuiAppEvent>) {
    let (tx, rx) = mpsc::unbounded_channel();
    (TuiAppEventSender::new(tx), rx)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sender_forwards_events() {
        let (sender, mut rx) = channel();

        assert!(sender.input_submitted("hello"));
        assert!(sender.notify(NoticeLevel::Info, "ready"));
        assert!(sender.request_frame());

        assert_eq!(
            rx.try_recv().expect("input"),
            TuiAppEvent::InputSubmitted {
                text: "hello".into()
            }
        );
        assert_eq!(
            rx.try_recv().expect("notice"),
            TuiAppEvent::Notification {
                level: NoticeLevel::Info,
                message: "ready".into()
            }
        );
        assert_eq!(rx.try_recv().expect("frame"), TuiAppEvent::RequestFrame);
    }

    #[test]
    fn sender_reports_closed_channel() {
        let (sender, rx) = channel();
        drop(rx);
        assert!(!sender.request_frame());
    }
}
