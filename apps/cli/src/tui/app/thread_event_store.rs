//! Thread-event buffering and snapshot types for multi-agent session replay.
//!
//! A `ThreadEventChannel` wraps a tokio mpsc channel together with a `ThreadEventStore` that
//! buffers the last N events for a thread. When the user switches agents, the store is snapshotted
//! into a `ThreadEventSnapshot` and replayed into a freshly-constructed `ChatWidget`.

use super::pending_interactive_replay::PendingInteractiveReplayState;
use crate::chatwidget::ThreadInputState;
use agiworkforce_protocol::protocol::Event;
use agiworkforce_protocol::protocol::EventMsg;
use agiworkforce_protocol::protocol::Op;
use agiworkforce_protocol::protocol::TurnItem;
use std::collections::HashSet;
use std::collections::VecDeque;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::sync::mpsc;

#[derive(Debug, Clone)]
pub(super) struct ThreadEventSnapshot {
    pub(super) session_configured: Option<Event>,
    pub(super) events: Vec<Event>,
    pub(super) input_state: Option<ThreadInputState>,
}

#[derive(Debug)]
pub(super) struct ThreadEventStore {
    pub(super) session_configured: Option<Event>,
    buffer: VecDeque<Event>,
    user_message_ids: HashSet<String>,
    pending_interactive_replay: PendingInteractiveReplayState,
    pub(super) input_state: Option<ThreadInputState>,
    capacity: usize,
    pub(super) active: bool,
}

impl ThreadEventStore {
    pub(super) fn new(capacity: usize) -> Self {
        Self {
            session_configured: None,
            buffer: VecDeque::new(),
            user_message_ids: HashSet::new(),
            pending_interactive_replay: PendingInteractiveReplayState::default(),
            input_state: None,
            capacity,
            active: false,
        }
    }

    pub(super) fn new_with_session_configured(capacity: usize, event: Event) -> Self {
        let mut store = Self::new(capacity);
        store.session_configured = Some(event);
        store
    }

    pub(super) fn push_event(&mut self, event: Event) {
        self.pending_interactive_replay.note_event(&event);
        match &event.msg {
            EventMsg::SessionConfigured(_) => {
                self.session_configured = Some(event);
                return;
            }
            EventMsg::ItemCompleted(completed) => {
                if let TurnItem::UserMessage(item) = &completed.item {
                    if !event.id.is_empty() && self.user_message_ids.contains(&event.id) {
                        return;
                    }
                    let legacy = Event {
                        id: event.id,
                        msg: item.as_legacy_event(),
                    };
                    self.push_legacy_event(legacy);
                    return;
                }
            }
            _ => {}
        }

        self.push_legacy_event(event);
    }

    pub(super) fn push_legacy_event(&mut self, event: Event) {
        if let EventMsg::UserMessage(_) = &event.msg
            && !event.id.is_empty()
            && !self.user_message_ids.insert(event.id.clone())
        {
            return;
        }
        self.buffer.push_back(event);
        if self.buffer.len() > self.capacity
            && let Some(removed) = self.buffer.pop_front()
        {
            self.pending_interactive_replay.note_evicted_event(&removed);
            if matches!(removed.msg, EventMsg::UserMessage(_)) && !removed.id.is_empty() {
                self.user_message_ids.remove(&removed.id);
            }
        }
    }

    pub(super) fn snapshot(&self) -> ThreadEventSnapshot {
        ThreadEventSnapshot {
            session_configured: self.session_configured.clone(),
            // Thread switches replay buffered events into a rebuilt ChatWidget. Only replay
            // interactive prompts that are still pending, or answered approvals/input will reappear.
            events: self
                .buffer
                .iter()
                .filter(|event| {
                    self.pending_interactive_replay
                        .should_replay_snapshot_event(event)
                })
                .cloned()
                .collect(),
            input_state: self.input_state.clone(),
        }
    }

    pub(super) fn note_outbound_op(&mut self, op: &Op) {
        self.pending_interactive_replay.note_outbound_op(op);
    }

    pub(super) fn op_can_change_pending_replay_state(op: &Op) -> bool {
        PendingInteractiveReplayState::op_can_change_state(op)
    }

    pub(super) fn event_can_change_pending_thread_approvals(event: &Event) -> bool {
        PendingInteractiveReplayState::event_can_change_pending_thread_approvals(event)
    }

    pub(super) fn has_pending_thread_approvals(&self) -> bool {
        self.pending_interactive_replay
            .has_pending_thread_approvals()
    }
}

#[derive(Debug)]
pub(super) struct ThreadEventChannel {
    pub(super) sender: mpsc::Sender<Event>,
    pub(super) receiver: Option<mpsc::Receiver<Event>>,
    pub(super) store: Arc<Mutex<ThreadEventStore>>,
}

impl ThreadEventChannel {
    pub(super) fn new(capacity: usize) -> Self {
        let (sender, receiver) = mpsc::channel(capacity);
        Self {
            sender,
            receiver: Some(receiver),
            store: Arc::new(Mutex::new(ThreadEventStore::new(capacity))),
        }
    }

    pub(super) fn new_with_session_configured(capacity: usize, event: Event) -> Self {
        let (sender, receiver) = mpsc::channel(capacity);
        Self {
            sender,
            receiver: Some(receiver),
            store: Arc::new(Mutex::new(ThreadEventStore::new_with_session_configured(
                capacity, event,
            ))),
        }
    }
}
