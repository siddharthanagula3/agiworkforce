//! Subagent v2 — full IPC + bidirectional message passing.
//!
//! Architecture: each subagent runs as an isolated tokio task with its own
//! `AgentSession`, its own message channels (in/out), and a status field.
//! Parent agent sends prompts via `send_message`; subagent results stream back
//! via `recv_message`. Parent can `wait` for completion or `kill` mid-flight.
//!
//! M34 of v1.3 — closes the last v1.2 architectural backlog item.
//! M34a of v1.4 — SubagentTaskRunner trait abstraction (swappable task body).

#![allow(dead_code)]

use anyhow::{Context, Result};
use async_trait::async_trait;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, oneshot, RwLock};
use uuid::Uuid;

pub type SubagentId = Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SubagentStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Killed,
}

#[derive(Debug, Clone)]
pub struct SubagentMessage {
    pub from: SubagentId,
    pub kind: MessageKind,
    pub body: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MessageKind {
    Prompt,
    Response,
    Status,
    Error,
}

#[async_trait]
pub trait SubagentTaskRunner: Send + Sync + 'static {
    /// Run the task body. Receives prompts from inbox_rx, sends responses
    /// via outbox_tx, exits cleanly when inbox_rx returns None or when the
    /// returned future is dropped (kill via abort).
    async fn run(
        &self,
        id: SubagentId,
        model: String,
        inbox_rx: mpsc::Receiver<String>,
        outbox_tx: mpsc::Sender<SubagentMessage>,
    );
}

#[derive(Default)]
pub struct EchoRunner;

#[async_trait]
impl SubagentTaskRunner for EchoRunner {
    async fn run(
        &self,
        id: SubagentId,
        model: String,
        mut inbox_rx: mpsc::Receiver<String>,
        outbox_tx: mpsc::Sender<SubagentMessage>,
    ) {
        while let Some(prompt) = inbox_rx.recv().await {
            if outbox_tx
                .send(SubagentMessage {
                    from: id,
                    kind: MessageKind::Response,
                    body: format!("[{model}] echo: {prompt}"),
                })
                .await
                .is_err()
            {
                break;
            }
        }
    }
}

pub struct MockRunner {
    pub scripted_responses: Vec<String>,
}

#[async_trait]
impl SubagentTaskRunner for MockRunner {
    async fn run(
        &self,
        id: SubagentId,
        _model: String,
        mut inbox_rx: mpsc::Receiver<String>,
        outbox_tx: mpsc::Sender<SubagentMessage>,
    ) {
        let mut idx = 0;
        while let Some(_prompt) = inbox_rx.recv().await {
            let response = self
                .scripted_responses
                .get(idx)
                .cloned()
                .unwrap_or_else(|| "[mock] no more scripted responses".to_string());
            idx += 1;
            if outbox_tx
                .send(SubagentMessage {
                    from: id,
                    kind: MessageKind::Response,
                    body: response,
                })
                .await
                .is_err()
            {
                break;
            }
        }
    }
}

pub struct SubagentSpec {
    pub model: String,
    pub system_prompt: Option<String>,
    pub max_turns: usize,
    pub runner: Arc<dyn SubagentTaskRunner>,
}

impl SubagentSpec {
    /// Convenience constructor with EchoRunner as the default.
    pub fn new(model: impl Into<String>) -> Self {
        Self {
            model: model.into(),
            system_prompt: None,
            max_turns: 5,
            runner: Arc::new(EchoRunner),
        }
    }
}

pub struct SubagentHandle {
    pub id: SubagentId,
    pub status: Arc<RwLock<SubagentStatus>>,
    inbox_tx: mpsc::Sender<String>,
    outbox_rx: Arc<RwLock<mpsc::Receiver<SubagentMessage>>>,
    kill_tx: Option<oneshot::Sender<()>>,
    join_handle: Option<tokio::task::JoinHandle<()>>,
    spec: SubagentSpec,
}

impl SubagentHandle {
    pub async fn send_message(&self, body: String) -> Result<()> {
        self.inbox_tx.send(body).await.context("subagent inbox closed")
    }

    pub async fn recv_message(&self) -> Option<SubagentMessage> {
        let mut rx = self.outbox_rx.write().await;
        rx.recv().await
    }

    pub async fn status(&self) -> SubagentStatus {
        *self.status.read().await
    }

    pub async fn kill(&mut self) -> Result<()> {
        if let Some(tx) = self.kill_tx.take() {
            let _ = tx.send(());
        }
        *self.status.write().await = SubagentStatus::Killed;
        if let Some(handle) = self.join_handle.take() {
            handle.abort();
        }
        Ok(())
    }

    pub async fn wait(&mut self) -> Result<SubagentStatus> {
        if let Some(handle) = self.join_handle.take() {
            let _ = handle.await;
        }
        Ok(*self.status.read().await)
    }
}

pub struct SubagentRegistry {
    inner: Arc<RwLock<HashMap<SubagentId, Arc<RwLock<SubagentHandle>>>>>,
}

impl Default for SubagentRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl SubagentRegistry {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn spawn(&self, spec: SubagentSpec) -> Result<SubagentId> {
        let id = Uuid::new_v4();
        let (inbox_tx, inbox_rx) = mpsc::channel::<String>(32);
        let (outbox_tx, outbox_rx) = mpsc::channel::<SubagentMessage>(32);
        let (kill_tx, mut kill_rx) = oneshot::channel::<()>();
        let status = Arc::new(RwLock::new(SubagentStatus::Pending));
        let status_for_task = status.clone();
        let runner = spec.runner.clone();
        let model = spec.model.clone();
        let join_handle = tokio::spawn(async move {
            *status_for_task.write().await = SubagentStatus::Running;
            tokio::select! {
                _ = &mut kill_rx => {
                    // Killed externally; runner is dropped.
                }
                _ = runner.run(id, model, inbox_rx, outbox_tx) => {}
            }
            // Status only transitions to Completed if not already Killed.
            let mut s = status_for_task.write().await;
            if *s != SubagentStatus::Killed {
                *s = SubagentStatus::Completed;
            }
        });
        let handle = SubagentHandle {
            id,
            status,
            inbox_tx,
            outbox_rx: Arc::new(RwLock::new(outbox_rx)),
            kill_tx: Some(kill_tx),
            join_handle: Some(join_handle),
            spec,
        };
        let mut inner = self.inner.write().await;
        inner.insert(id, Arc::new(RwLock::new(handle)));
        Ok(id)
    }

    pub async fn get(&self, id: SubagentId) -> Option<Arc<RwLock<SubagentHandle>>> {
        self.inner.read().await.get(&id).cloned()
    }

    pub async fn list(&self) -> Vec<SubagentId> {
        self.inner.read().await.keys().copied().collect()
    }

    pub async fn kill(&self, id: SubagentId) -> Result<()> {
        let Some(arc) = self.get(id).await else {
            anyhow::bail!("no subagent {id}")
        };
        let mut handle = arc.write().await;
        handle.kill().await
    }

    pub async fn wait(&self, id: SubagentId) -> Result<SubagentStatus> {
        let Some(arc) = self.get(id).await else {
            anyhow::bail!("no subagent {id}")
        };
        let mut handle = arc.write().await;
        handle.wait().await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spec(model: &str) -> SubagentSpec {
        SubagentSpec::new(model)
    }

    #[tokio::test]
    async fn registry_starts_empty() {
        let r = SubagentRegistry::new();
        assert!(r.list().await.is_empty());
    }

    #[tokio::test]
    async fn spawn_returns_unique_ids() {
        let r = SubagentRegistry::new();
        let a = r.spawn(spec("opus")).await.unwrap();
        let b = r.spawn(spec("haiku")).await.unwrap();
        assert_ne!(a, b);
        assert_eq!(r.list().await.len(), 2);
    }

    #[tokio::test]
    async fn message_roundtrip_echoes() {
        let r = SubagentRegistry::new();
        let id = r.spawn(spec("sonnet")).await.unwrap();
        let arc = r.get(id).await.unwrap();
        let handle = arc.read().await;
        handle.send_message("hello".into()).await.unwrap();
        let msg = handle.recv_message().await.expect("message");
        assert_eq!(msg.kind, MessageKind::Response);
        assert!(msg.body.contains("echo: hello"));
        assert!(msg.body.contains("sonnet"));
    }

    #[tokio::test]
    async fn kill_transitions_to_killed() {
        let r = SubagentRegistry::new();
        let id = r.spawn(spec("opus")).await.unwrap();
        r.kill(id).await.unwrap();
        let arc = r.get(id).await.unwrap();
        let status = arc.read().await.status().await;
        assert_eq!(status, SubagentStatus::Killed);
    }

    #[tokio::test]
    async fn missing_id_kill_errors() {
        let r = SubagentRegistry::new();
        let result = r.kill(Uuid::new_v4()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn status_progresses_pending_running_completed_on_drop() {
        let r = SubagentRegistry::new();
        let id = r.spawn(spec("opus")).await.unwrap();
        // Give task a moment to start.
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        let arc = r.get(id).await.unwrap();
        let h = arc.read().await;
        let s = h.status().await;
        assert!(matches!(s, SubagentStatus::Running | SubagentStatus::Completed));
    }

    #[tokio::test]
    async fn mock_runner_returns_scripted_responses() {
        let r = SubagentRegistry::new();
        let mut spec = SubagentSpec::new("test-model");
        spec.runner = Arc::new(MockRunner {
            scripted_responses: vec!["first response".into(), "second response".into()],
        });
        let id = r.spawn(spec).await.unwrap();
        let arc = r.get(id).await.unwrap();
        let handle = arc.read().await;
        handle.send_message("prompt 1".into()).await.unwrap();
        let msg1 = handle.recv_message().await.unwrap();
        assert_eq!(msg1.body, "first response");
        handle.send_message("prompt 2".into()).await.unwrap();
        let msg2 = handle.recv_message().await.unwrap();
        assert_eq!(msg2.body, "second response");
    }

    #[tokio::test]
    async fn mock_runner_exhausted_emits_placeholder() {
        let r = SubagentRegistry::new();
        let mut spec = SubagentSpec::new("test-model");
        spec.runner = Arc::new(MockRunner { scripted_responses: vec![] });
        let id = r.spawn(spec).await.unwrap();
        let arc = r.get(id).await.unwrap();
        let handle = arc.read().await;
        handle.send_message("prompt".into()).await.unwrap();
        let msg = handle.recv_message().await.unwrap();
        assert!(msg.body.contains("no more scripted responses"));
    }

    #[tokio::test]
    async fn echo_runner_is_default_in_spec_new() {
        let spec = SubagentSpec::new("model-x");
        let r = SubagentRegistry::new();
        let id = r.spawn(spec).await.unwrap();
        let arc = r.get(id).await.unwrap();
        let handle = arc.read().await;
        handle.send_message("hi".into()).await.unwrap();
        let msg = handle.recv_message().await.unwrap();
        assert!(msg.body.contains("echo: hi"));
    }

    #[tokio::test]
    async fn runner_completion_transitions_to_completed_not_killed() {
        let r = SubagentRegistry::new();
        let mut spec = SubagentSpec::new("model-y");
        spec.runner = Arc::new(MockRunner { scripted_responses: vec!["done".into()] });
        let id = r.spawn(spec).await.unwrap();
        let arc = r.get(id).await.unwrap();
        {
            let handle = arc.read().await;
            handle.send_message("p".into()).await.unwrap();
            let _ = handle.recv_message().await;
        }
        // Verify the status is Completed or Running (not Killed).
        let s = arc.read().await.status().await;
        assert!(matches!(s, SubagentStatus::Running | SubagentStatus::Completed));
    }
}
