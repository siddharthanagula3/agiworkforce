//! `message_queue` — Rust port of the TypeScript `messageQueueManager`.
//!
//! Provides a priority-lane (`now > next > later`), FIFO-within-lane send
//! pipeline shared by the CLI's REPL and SDK paths. The TypeScript surfaces
//! (desktop, web, mobile, Chrome ext, VS Code ext) use the canonical
//! implementation in `packages/runtime/src/queue/messageQueueManager.ts`;
//! this module is the Rust analog so the CLI participates in the same
//! send-pipeline contract.
//!
//! Design invariants:
//!  - Three lanes — `Now`, `Next`, `Later` — totally ordered by priority class.
//!  - FIFO within a lane (oldest enqueue wins).
//!  - Per-lane cap of 100 (matches TS `LANE_CAP`); over-cap enqueue returns
//!    `Err(QueueError::Full)`.
//!  - Atomic compare-and-swap dequeue via `dequeue_if(expected_id)`.
//!  - Mutex-guarded internal storage so multiple async tasks can share one
//!    queue safely.
//!
//! Reference: `tasks/research/deep/u2-utils-direct-h-n.md` §2.5.

use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

/// Priority lane for a queued command.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum QueuePriority {
    /// Urgent system messages (interrupts, plan-mode confirmations).
    Now,
    /// Default for user input. Highest priority a human gets.
    Next,
    /// Task notifications, scheduled tasks, dispatch echoes.
    Later,
}

impl QueuePriority {
    fn ordinal(self) -> u8 {
        match self {
            QueuePriority::Now => 0,
            QueuePriority::Next => 1,
            QueuePriority::Later => 2,
        }
    }
}

/// Per-lane cap — matches `LANE_CAP` in the TypeScript implementation.
pub const LANE_CAP: usize = 100;

/// Discriminator for the input mode of a queued command.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PromptInputMode {
    /// User-typed text — round-trips through `pop_all_editable`.
    Prompt,
    /// Shell-like command — also editable.
    Bash,
    /// System notification (subagent ticks, scheduled tasks). Not editable.
    TaskNotification,
    /// Channel message — visible but not editable.
    ChannelMessage,
}

impl PromptInputMode {
    fn is_editable(self) -> bool {
        matches!(self, PromptInputMode::Prompt | PromptInputMode::Bash)
    }
}

/// A queued command awaiting dispatch into the agent loop.
#[derive(Debug, Clone)]
pub struct QueuedCommand {
    pub id: String,
    pub value: String,
    pub mode: PromptInputMode,
    pub priority: QueuePriority,
    pub enqueued_at_ms: u128,
    pub is_meta: bool,
    pub origin: Option<String>,
    pub uuid: Option<String>,
}

/// Errors the queue can return to a caller.
#[derive(Debug)]
pub enum QueueError {
    /// The lane is at `LANE_CAP` (or the configured override) — caller must
    /// drop, retry later, or surface backpressure.
    Full { lane: QueuePriority, cap: usize },
    /// Atomic compare-and-swap dequeue lost the race — another consumer
    /// already removed the command. Caller should refresh its snapshot.
    Race { id: String },
}

impl std::fmt::Display for QueueError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            QueueError::Full { lane, cap } => {
                write!(f, "queue lane {:?} is full (cap={})", lane, cap)
            }
            QueueError::Race { id } => write!(
                f,
                "compare-and-swap dequeue lost the race for command {}",
                id
            ),
        }
    }
}

impl std::error::Error for QueueError {}

/// Result of `pop_all_editable` — combined input text + cursor offset.
/// Image / pasted-content reconstruction is intentionally omitted from the
/// CLI port (the TUI does not currently embed images in the prompt buffer).
#[derive(Debug, Clone)]
pub struct PopAllEditableResult {
    pub text: String,
    pub cursor_offset: usize,
}

/// Per-surface message queue — wrap with `Arc<MessageQueue>` to share between
/// async tasks.
pub struct MessageQueue {
    inner: Mutex<Inner>,
    lane_cap: usize,
}

struct Inner {
    items: Vec<QueuedCommand>,
}

impl MessageQueue {
    /// Create a new queue with the default per-lane cap (`LANE_CAP`).
    pub fn new() -> Arc<Self> {
        Self::with_cap(LANE_CAP)
    }

    /// Create a queue with an explicit per-lane cap.
    pub fn with_cap(lane_cap: usize) -> Arc<Self> {
        Arc::new(Self {
            inner: Mutex::new(Inner { items: Vec::new() }),
            lane_cap: lane_cap.max(1),
        })
    }

    /// Number of commands across all lanes.
    pub fn size(&self) -> usize {
        self.inner.lock().expect("queue mutex poisoned").items.len()
    }

    /// Number of commands in a specific lane.
    pub fn lane_size(&self, lane: QueuePriority) -> usize {
        let inner = self.inner.lock().expect("queue mutex poisoned");
        inner.items.iter().filter(|c| c.priority == lane).count()
    }

    /// Snapshot of the queue contents (clone — callers cannot mutate).
    pub fn snapshot(&self) -> Vec<QueuedCommand> {
        self.inner
            .lock()
            .expect("queue mutex poisoned")
            .items
            .clone()
    }

    /// Add a command. Returns the stored command (with generated id and
    /// timestamp) or `Err(QueueError::Full)` if the lane is at cap.
    pub fn enqueue(
        &self,
        value: String,
        mode: PromptInputMode,
        priority: QueuePriority,
    ) -> Result<QueuedCommand, QueueError> {
        let mut inner = self.inner.lock().expect("queue mutex poisoned");
        let lane_count = inner.items.iter().filter(|c| c.priority == priority).count();
        if lane_count >= self.lane_cap {
            return Err(QueueError::Full {
                lane: priority,
                cap: self.lane_cap,
            });
        }
        let cmd = QueuedCommand {
            id: gen_id(),
            value,
            mode,
            priority,
            enqueued_at_ms: now_millis(),
            is_meta: false,
            origin: None,
            uuid: None,
        };
        inner.items.push(cmd.clone());
        Ok(cmd)
    }

    /// Convenience: enqueue a notification (defaults priority to `Later`).
    pub fn enqueue_notification(&self, value: String) -> Result<QueuedCommand, QueueError> {
        self.enqueue(value, PromptInputMode::TaskNotification, QueuePriority::Later)
    }

    /// Remove and return the highest-priority command. Returns `None` if empty.
    pub fn dequeue(&self) -> Option<QueuedCommand> {
        let mut inner = self.inner.lock().expect("queue mutex poisoned");
        let idx = best_idx(&inner.items, &|_| true)?;
        Some(inner.items.remove(idx))
    }

    /// Remove and return the highest-priority command matching `predicate`.
    /// Non-matching commands stay in the queue.
    pub fn dequeue_with<F>(&self, predicate: F) -> Option<QueuedCommand>
    where
        F: Fn(&QueuedCommand) -> bool,
    {
        let mut inner = self.inner.lock().expect("queue mutex poisoned");
        let idx = best_idx(&inner.items, &predicate)?;
        Some(inner.items.remove(idx))
    }

    /// Atomic compare-and-swap dequeue.
    /// Succeeds only when the highest-priority command's `id` matches
    /// `expected_id`; otherwise returns `Err(QueueError::Race)`.
    pub fn dequeue_if(&self, expected_id: &str) -> Result<QueuedCommand, QueueError> {
        let mut inner = self.inner.lock().expect("queue mutex poisoned");
        let idx = best_idx(&inner.items, &|_| true).ok_or(QueueError::Race {
            id: expected_id.to_string(),
        })?;
        if inner.items[idx].id != expected_id {
            return Err(QueueError::Race {
                id: expected_id.to_string(),
            });
        }
        Ok(inner.items.remove(idx))
    }

    /// Remove and return all commands.
    pub fn dequeue_all(&self) -> Vec<QueuedCommand> {
        let mut inner = self.inner.lock().expect("queue mutex poisoned");
        std::mem::take(&mut inner.items)
    }

    /// Pop all editable commands and rebuild an input buffer.
    /// Non-editable commands stay in the queue.
    pub fn pop_all_editable(
        &self,
        current_input: &str,
        current_cursor_offset: usize,
    ) -> Option<PopAllEditableResult> {
        let mut inner = self.inner.lock().expect("queue mutex poisoned");
        if inner.items.is_empty() {
            return None;
        }
        let mut editable: Vec<QueuedCommand> = Vec::new();
        let mut remaining: Vec<QueuedCommand> = Vec::new();
        for cmd in inner.items.drain(..) {
            if cmd.mode.is_editable() && !cmd.is_meta {
                editable.push(cmd);
            } else {
                remaining.push(cmd);
            }
        }
        if editable.is_empty() {
            inner.items = remaining;
            return None;
        }

        let queued_texts: Vec<String> = editable.iter().map(|c| c.value.clone()).collect();
        let mut joined = queued_texts.join("\n");
        let cursor_offset = joined.len() + 1 + current_cursor_offset;
        if !current_input.is_empty() {
            joined.push('\n');
            joined.push_str(current_input);
        }
        inner.items = remaining;

        Some(PopAllEditableResult {
            text: joined,
            cursor_offset,
        })
    }

    /// Clear all commands.
    pub fn clear(&self) {
        let mut inner = self.inner.lock().expect("queue mutex poisoned");
        inner.items.clear();
    }
}

fn best_idx<F>(items: &[QueuedCommand], filter: &F) -> Option<usize>
where
    F: Fn(&QueuedCommand) -> bool,
{
    let mut best: Option<(usize, u8)> = None;
    for (i, cmd) in items.iter().enumerate() {
        if !filter(cmd) {
            continue;
        }
        let pri = cmd.priority.ordinal();
        match best {
            None => best = Some((i, pri)),
            Some((_, b_pri)) if pri < b_pri => best = Some((i, pri)),
            _ => {}
        }
    }
    best.map(|(i, _)| i)
}

fn gen_id() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let now = now_millis();
    format!("q_{:x}_{:x}", now, n)
}

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn empty_queue_returns_none() {
        let q = MessageQueue::new();
        assert_eq!(q.size(), 0);
        assert!(q.dequeue().is_none());
    }

    #[test]
    fn fifo_within_lane() {
        let q = MessageQueue::new();
        for v in &["a", "b", "c"] {
            q.enqueue((*v).to_string(), PromptInputMode::Prompt, QueuePriority::Next)
                .unwrap();
        }
        assert_eq!(q.dequeue().unwrap().value, "a");
        assert_eq!(q.dequeue().unwrap().value, "b");
        assert_eq!(q.dequeue().unwrap().value, "c");
    }

    #[test]
    fn priority_order_now_next_later() {
        let q = MessageQueue::new();
        q.enqueue("later".to_string(), PromptInputMode::Prompt, QueuePriority::Later)
            .unwrap();
        q.enqueue("next".to_string(), PromptInputMode::Prompt, QueuePriority::Next)
            .unwrap();
        q.enqueue("now".to_string(), PromptInputMode::Prompt, QueuePriority::Now)
            .unwrap();
        assert_eq!(q.dequeue().unwrap().value, "now");
        assert_eq!(q.dequeue().unwrap().value, "next");
        assert_eq!(q.dequeue().unwrap().value, "later");
    }

    #[test]
    fn lane_cap_rejects_overflow() {
        let q = MessageQueue::with_cap(2);
        q.enqueue("a".into(), PromptInputMode::Prompt, QueuePriority::Next)
            .unwrap();
        q.enqueue("b".into(), PromptInputMode::Prompt, QueuePriority::Next)
            .unwrap();
        let err = q
            .enqueue("c".into(), PromptInputMode::Prompt, QueuePriority::Next)
            .unwrap_err();
        match err {
            QueueError::Full { lane, cap } => {
                assert_eq!(lane, QueuePriority::Next);
                assert_eq!(cap, 2);
            }
            _ => panic!("expected Full"),
        }
    }

    #[test]
    fn dequeue_if_succeeds_for_head() {
        let q = MessageQueue::new();
        let a = q.enqueue("a".into(), PromptInputMode::Prompt, QueuePriority::Next).unwrap();
        q.enqueue("b".into(), PromptInputMode::Prompt, QueuePriority::Next).unwrap();
        let taken = q.dequeue_if(&a.id).unwrap();
        assert_eq!(taken.value, "a");
    }

    #[test]
    fn dequeue_if_races_when_head_changes() {
        let q = MessageQueue::new();
        let a = q.enqueue("a".into(), PromptInputMode::Prompt, QueuePriority::Next).unwrap();
        q.enqueue("urgent".into(), PromptInputMode::Prompt, QueuePriority::Now).unwrap();
        let err = q.dequeue_if(&a.id).unwrap_err();
        assert!(matches!(err, QueueError::Race { .. }));
    }

    #[test]
    fn pop_all_editable_combines_with_input() {
        let q = MessageQueue::new();
        q.enqueue("first".into(), PromptInputMode::Prompt, QueuePriority::Next).unwrap();
        q.enqueue("second".into(), PromptInputMode::Prompt, QueuePriority::Next).unwrap();
        let r = q.pop_all_editable("typing", 7).unwrap();
        assert_eq!(r.text, "first\nsecond\ntyping");
        // cursor_offset = "first\nsecond".len() + 1 + 7 = 12 + 1 + 7
        assert_eq!(r.cursor_offset, 20);
        assert_eq!(q.size(), 0);
    }

    #[test]
    fn pop_all_editable_leaves_non_editable() {
        let q = MessageQueue::new();
        q.enqueue("editable".into(), PromptInputMode::Prompt, QueuePriority::Next).unwrap();
        q.enqueue(
            "note".into(),
            PromptInputMode::TaskNotification,
            QueuePriority::Later,
        )
        .unwrap();
        let r = q.pop_all_editable("", 0).unwrap();
        assert_eq!(r.text, "editable");
        assert_eq!(q.size(), 1);
        assert_eq!(q.snapshot()[0].mode, PromptInputMode::TaskNotification);
    }

    #[test]
    fn lane_size_tracks_independently() {
        let q = MessageQueue::new();
        q.enqueue("1".into(), PromptInputMode::Prompt, QueuePriority::Now).unwrap();
        q.enqueue("2".into(), PromptInputMode::Prompt, QueuePriority::Now).unwrap();
        q.enqueue("3".into(), PromptInputMode::Prompt, QueuePriority::Next).unwrap();
        assert_eq!(q.lane_size(QueuePriority::Now), 2);
        assert_eq!(q.lane_size(QueuePriority::Next), 1);
        assert_eq!(q.lane_size(QueuePriority::Later), 0);
    }

    #[test]
    fn property_test_1000_random_messages_preserves_order() {
        // FIFO-within-priority + total order across priority classes.
        // The pseudo-random sequence is deterministic — uses xorshift over a
        // fixed seed so the test is reproducible.
        let q = MessageQueue::with_cap(2_000);
        let mut seed: u64 = 0xDEAD_BEEF_CAFE_BABE;
        let lanes = [QueuePriority::Now, QueuePriority::Next, QueuePriority::Later];
        let mut inserted: HashMap<String, (QueuePriority, usize)> = HashMap::new();

        for i in 0..1000usize {
            seed ^= seed << 13;
            seed ^= seed >> 7;
            seed ^= seed << 17;
            let pri = lanes[(seed as usize) % 3];
            let cmd = q
                .enqueue(format!("m{}", i), PromptInputMode::Prompt, pri)
                .unwrap();
            inserted.insert(cmd.id, (pri, i));
        }

        let mut last_priority = -1i32;
        let mut last_ordinal_in_lane: HashMap<QueuePriority, isize> = HashMap::new();
        last_ordinal_in_lane.insert(QueuePriority::Now, -1);
        last_ordinal_in_lane.insert(QueuePriority::Next, -1);
        last_ordinal_in_lane.insert(QueuePriority::Later, -1);

        for _ in 0..1000 {
            let popped = q.dequeue().expect("queue empty before all drained");
            let pri = popped.priority.ordinal() as i32;
            assert!(
                pri >= last_priority,
                "total order broken: {pri} < {last_priority}"
            );
            let (insert_pri, ordinal) = inserted[&popped.id];
            assert_eq!(insert_pri, popped.priority);
            let prev = last_ordinal_in_lane[&popped.priority];
            assert!(
                ordinal as isize > prev,
                "FIFO broken in {:?}: {} <= {}",
                popped.priority,
                ordinal,
                prev
            );
            last_ordinal_in_lane.insert(popped.priority, ordinal as isize);
            last_priority = pri;
        }

        assert_eq!(q.size(), 0);
    }

    #[test]
    fn clear_empties() {
        let q = MessageQueue::new();
        q.enqueue("a".into(), PromptInputMode::Prompt, QueuePriority::Next).unwrap();
        q.enqueue("b".into(), PromptInputMode::Prompt, QueuePriority::Next).unwrap();
        q.clear();
        assert_eq!(q.size(), 0);
    }
}
