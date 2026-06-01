//! Structured transcript cell contract.
//!
//! The current TUI stores rendered conversation entries as simple role/text
//! messages. These cells are the foundation for Codex/Gemini-style timelines:
//! tool progress, approvals, patches, subagents, and streamed assistant deltas
//! can become first-class rows with stable rendering and snapshot coverage.

#![allow(dead_code)]

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TranscriptCellKind {
    User,
    Assistant,
    Reasoning,
    Exec,
    Tool,
    Patch,
    Approval,
    Task,
    Subagent,
    Warning,
    Error,
    SystemNotice,
    Plan,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TranscriptCellState {
    Pending,
    Running,
    Complete,
    Failed,
    Cancelled,
}

pub trait TranscriptCell: Send + Sync {
    fn kind(&self) -> TranscriptCellKind;

    fn state(&self) -> TranscriptCellState;

    fn render_text(&self, width: u16) -> Vec<String>;

    fn desired_height(&self, width: u16) -> u16 {
        self.render_text(width).len() as u16
    }

    fn is_expandable(&self) -> bool {
        false
    }

    fn is_expanded(&self) -> bool {
        false
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlainTranscriptCell {
    kind: TranscriptCellKind,
    state: TranscriptCellState,
    lines: Vec<String>,
}

impl PlainTranscriptCell {
    pub fn new(kind: TranscriptCellKind, text: impl Into<String>) -> Self {
        Self {
            kind,
            state: TranscriptCellState::Complete,
            lines: text.into().lines().map(str::to_string).collect(),
        }
    }

    pub fn with_state(
        kind: TranscriptCellKind,
        state: TranscriptCellState,
        lines: Vec<String>,
    ) -> Self {
        Self { kind, state, lines }
    }
}

impl TranscriptCell for PlainTranscriptCell {
    fn kind(&self) -> TranscriptCellKind {
        self.kind
    }

    fn state(&self) -> TranscriptCellState {
        self.state
    }

    fn render_text(&self, width: u16) -> Vec<String> {
        let max_width = width.max(1) as usize;
        if self.lines.is_empty() {
            return vec![String::new()];
        }

        self.lines
            .iter()
            .flat_map(|line| wrap_line(line, max_width))
            .collect()
    }
}

fn wrap_line(line: &str, width: usize) -> Vec<String> {
    if line.is_empty() {
        return vec![String::new()];
    }

    let mut out = Vec::new();
    let mut current = String::new();
    for ch in line.chars() {
        if current.chars().count() == width {
            out.push(current);
            current = String::new();
        }
        current.push(ch);
    }
    if !current.is_empty() {
        out.push(current);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_cell_reports_kind_and_state() {
        let cell = PlainTranscriptCell::new(TranscriptCellKind::Assistant, "hello");
        assert_eq!(cell.kind(), TranscriptCellKind::Assistant);
        assert_eq!(cell.state(), TranscriptCellState::Complete);
        assert_eq!(cell.desired_height(80), 1);
    }

    #[test]
    fn render_wraps_long_lines() {
        let cell = PlainTranscriptCell::new(TranscriptCellKind::SystemNotice, "abcdef");
        assert_eq!(cell.render_text(2), vec!["ab", "cd", "ef"]);
        assert_eq!(cell.desired_height(2), 3);
    }

    #[test]
    fn render_preserves_empty_lines() {
        let cell = PlainTranscriptCell::new(TranscriptCellKind::User, "a\n\nb");
        assert_eq!(cell.render_text(80), vec!["a", "", "b"]);
    }
}
