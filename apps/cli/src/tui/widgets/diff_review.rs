//! `DiffReviewView` — per-file diff review overlay.
//!
//! `y/n/s` keys record Approve/Reject/Skip decisions per file; ↑↓ move the
//! cursor across files; Enter finalizes and returns Submit(approved_count).

#![allow(dead_code)]

use std::collections::HashMap;
use std::path::PathBuf;

use super::interactive::{InteractiveView, KeyAction, ViewAction};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReviewDecision {
    Approve,
    Reject,
    Skip,
}

impl ReviewDecision {
    fn label(&self) -> &'static str {
        match self {
            Self::Approve => "[y] Approved",
            Self::Reject => "[n] Rejected",
            Self::Skip => "[s] Skipped ",
        }
    }
}

#[derive(Debug, Clone)]
pub struct FileDiff {
    pub path: PathBuf,
    pub hunks: Vec<String>,
    pub additions: usize,
    pub deletions: usize,
}

impl FileDiff {
    pub fn new(
        path: impl Into<PathBuf>,
        hunks: Vec<String>,
        additions: usize,
        deletions: usize,
    ) -> Self {
        Self {
            path: path.into(),
            hunks,
            additions,
            deletions,
        }
    }
}

pub struct DiffReviewView {
    pub files: Vec<FileDiff>,
    pub cursor: usize,
    pub decisions: HashMap<PathBuf, ReviewDecision>,
    done: bool,
}

impl DiffReviewView {
    pub fn new(files: Vec<FileDiff>) -> Self {
        Self {
            decisions: HashMap::new(),
            cursor: 0,
            files,
            done: false,
        }
    }

    fn move_up(&mut self) {
        if self.cursor > 0 {
            self.cursor -= 1;
        }
    }

    fn move_down(&mut self) {
        if self.cursor + 1 < self.files.len() {
            self.cursor += 1;
        }
    }

    fn set_decision(&mut self, decision: ReviewDecision) {
        if let Some(file) = self.files.get(self.cursor) {
            self.decisions.insert(file.path.clone(), decision);
        }
    }

    fn approved_count(&self) -> usize {
        self.decisions
            .values()
            .filter(|d| **d == ReviewDecision::Approve)
            .count()
    }

    fn current_hunks(&self) -> &[String] {
        self.files
            .get(self.cursor)
            .map(|f| f.hunks.as_slice())
            .unwrap_or_default()
    }
}

impl InteractiveView for DiffReviewView {
    fn render(&self) -> String {
        let mut out =
            String::from("┌─ Diff Review ─────────────────────────────────────────────┐\n");

        if self.files.is_empty() {
            out.push_str("│  (no files to review)                                      │\n");
            out.push_str("│                                                            │\n");
            out.push_str("│  Enter finalize   Esc cancel                               │\n");
            out.push_str("└────────────────────────────────────────────────────────────┘\n");
            return out;
        }

        // File list
        for (i, file) in self.files.iter().enumerate() {
            let cursor = if i == self.cursor { "❯" } else { " " };
            let decision_str = self
                .decisions
                .get(&file.path)
                .map(|d| d.label())
                .unwrap_or("[ ] Pending   ");
            let name = file
                .path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("?");
            let stat = format!("+{} -{}", file.additions, file.deletions);
            let row = format!("{decision_str}  {name}  {stat}");
            out.push_str(&format!("│ {cursor} {row:<58}│\n"));
        }

        out.push_str("│ ──────────────────────────────────────────────────────────  │\n");

        // Hunk preview for current file
        for hunk in self.current_hunks().iter().take(3) {
            out.push_str(&format!("│  {hunk:<58}│\n"));
        }

        out.push_str("│                                                            │\n");
        out.push_str("│  y approve   n reject   s skip   ↑↓ navigate   Enter done  │\n");
        out.push_str("└────────────────────────────────────────────────────────────┘\n");
        out
    }

    fn handle_key(&mut self, key: KeyAction) -> ViewAction {
        match key {
            KeyAction::Char('y') | KeyAction::Char('Y') => {
                self.set_decision(ReviewDecision::Approve);
                ViewAction::Continue
            }
            KeyAction::Char('n') | KeyAction::Char('N') => {
                self.set_decision(ReviewDecision::Reject);
                ViewAction::Continue
            }
            KeyAction::Char('s') | KeyAction::Char('S') => {
                self.set_decision(ReviewDecision::Skip);
                ViewAction::Continue
            }
            KeyAction::Up => {
                self.move_up();
                ViewAction::Continue
            }
            KeyAction::Down => {
                self.move_down();
                ViewAction::Continue
            }
            KeyAction::Enter => {
                self.done = true;
                ViewAction::Submit(self.approved_count())
            }
            KeyAction::Esc => {
                self.done = true;
                ViewAction::Close
            }
            _ => ViewAction::Continue,
        }
    }

    fn is_done(&self) -> bool {
        self.done
    }

    fn title(&self) -> Option<&str> {
        Some("Diff Review")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_view() -> DiffReviewView {
        DiffReviewView::new(vec![
            FileDiff::new(
                "src/main.rs",
                vec!["@@ -1,3 +1,5 @@".into(), "+fn new_fn() {}".into()],
                2,
                0,
            ),
            FileDiff::new("src/lib.rs", vec!["@@ -10,2 +10,1 @@".into()], 0, 1),
            FileDiff::new("Cargo.toml", vec![], 1, 1),
        ])
    }

    #[test]
    fn empty_view_renders_placeholder() {
        let view = DiffReviewView::new(vec![]);
        let text = view.render();
        assert!(text.contains("(no files to review)"));
        assert_eq!(view.approved_count(), 0);
    }

    #[test]
    fn initial_state_has_no_decisions() {
        let view = make_view();
        assert!(view.decisions.is_empty());
        assert_eq!(view.cursor, 0);
        assert!(!view.is_done());
    }

    #[test]
    fn y_records_approve_for_current_file() {
        let mut view = make_view();
        let action = view.handle_key(KeyAction::Char('y'));
        assert_eq!(action, ViewAction::Continue);
        let path = PathBuf::from("src/main.rs");
        assert_eq!(view.decisions.get(&path), Some(&ReviewDecision::Approve));
    }

    #[test]
    fn n_records_reject() {
        let mut view = make_view();
        view.handle_key(KeyAction::Char('n'));
        let path = PathBuf::from("src/main.rs");
        assert_eq!(view.decisions.get(&path), Some(&ReviewDecision::Reject));
    }

    #[test]
    fn s_records_skip() {
        let mut view = make_view();
        view.handle_key(KeyAction::Char('s'));
        let path = PathBuf::from("src/main.rs");
        assert_eq!(view.decisions.get(&path), Some(&ReviewDecision::Skip));
    }

    #[test]
    fn navigate_up_down_moves_cursor() {
        let mut view = make_view();
        view.handle_key(KeyAction::Down);
        assert_eq!(view.cursor, 1);
        view.handle_key(KeyAction::Down);
        assert_eq!(view.cursor, 2);
        view.handle_key(KeyAction::Up);
        assert_eq!(view.cursor, 1);
    }

    #[test]
    fn enter_returns_approved_count_and_marks_done() {
        let mut view = make_view();
        view.handle_key(KeyAction::Char('y')); // approve file 0
        view.handle_key(KeyAction::Down);
        view.handle_key(KeyAction::Char('y')); // approve file 1
        view.handle_key(KeyAction::Down);
        view.handle_key(KeyAction::Char('n')); // reject file 2
        let action = view.handle_key(KeyAction::Enter);
        assert_eq!(action, ViewAction::Submit(2));
        assert!(view.is_done());
    }

    #[test]
    fn esc_closes_early() {
        let mut view = make_view();
        let action = view.handle_key(KeyAction::Esc);
        assert_eq!(action, ViewAction::Close);
        assert!(view.is_done());
    }

    #[test]
    fn render_shows_hunk_preview_for_current_file() {
        let view = make_view();
        let text = view.render();
        assert!(text.contains("@@ -1,3 +1,5 @@"));
    }

    #[test]
    fn cursor_does_not_overflow_at_ends() {
        let mut view = make_view();
        view.handle_key(KeyAction::Up); // at 0 already
        assert_eq!(view.cursor, 0);
        for _ in 0..10 {
            view.handle_key(KeyAction::Down);
        }
        assert_eq!(view.cursor, 2); // last index
    }
}
