//! `DiffReviewView`: per-file diff review overlay.
//!
//! `y/n/s` keys record Approve/Reject/Skip decisions per file; ↑↓ move the
//! cursor across files; Enter finalizes and returns Submit(approved_count).

#![allow(dead_code)]

use std::collections::HashMap;
use std::path::PathBuf;

use super::interactive::{InteractiveView, KeyAction, ViewAction};
use crate::terminal_text::sanitize_terminal_text;
use crate::tui::pad_to_cols;

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
            let name = sanitize_terminal_text(
                file.path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("?"),
            );
            let stat = format!("+{} -{}", file.additions, file.deletions);
            let row = pad_to_cols(&format!("{decision_str}  {name}  {stat}"), 58);
            out.push_str(&format!("│ {cursor} {row}│\n"));
        }

        out.push_str("│ ──────────────────────────────────────────────────────────  │\n");

        // Hunk preview for current file
        for hunk in self.current_hunks().iter().take(3) {
            let hunk = pad_to_cols(sanitize_terminal_text(hunk).as_ref(), 58);
            out.push_str(&format!("│  {hunk}│\n"));
        }

        out.push_str("│                                                            │\n");
        out.push_str("│  y approve   n reject   s skip   ↑↓ navigate   Enter done  │\n");
        out.push_str("└────────────────────────────────────────────────────────────┘\n");
        out
    }

    fn render_styled(&self) -> Option<Vec<ratatui::text::Line<'static>>> {
        use crate::tui::terminal_palette::{
            ui_accent, ui_danger, ui_muted, ui_success, ui_warning,
        };
        use ratatui::style::Style;
        use ratatui::text::{Line, Span};

        let border = Style::default().fg(ui_muted());
        let bs = |s: &str| Line::from(Span::styled(s.to_string(), border));
        let mut out: Vec<Line<'static>> = Vec::new();

        out.push(bs(
            "┌─ Diff Review ─────────────────────────────────────────────┐",
        ));

        if self.files.is_empty() {
            out.push(bs(
                "│  (no files to review)                                      │",
            ));
            out.push(bs(
                "│                                                            │",
            ));
            out.push(bs(
                "│  Enter finalize   Esc cancel                               │",
            ));
            out.push(bs(
                "└────────────────────────────────────────────────────────────┘",
            ));
            return Some(out);
        }

        // File list, decision label colored by outcome, cursor accented.
        for (i, file) in self.files.iter().enumerate() {
            let cursor = if i == self.cursor { "❯" } else { " " };
            let (decision_str, dec_color) = match self.decisions.get(&file.path) {
                Some(ReviewDecision::Approve) => ("[y] Approved", ui_success()),
                Some(ReviewDecision::Reject) => ("[n] Rejected", ui_danger()),
                Some(ReviewDecision::Skip) => ("[s] Skipped ", ui_warning()),
                None => ("[ ] Pending   ", ui_muted()),
            };
            let name = sanitize_terminal_text(
                file.path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("?"),
            );
            let stat = format!("+{} -{}", file.additions, file.deletions);
            let row = pad_to_cols(&format!("{decision_str}  {name}  {stat}"), 58);
            // Color just the leading decision label (ASCII → byte len == char count).
            let dlen = decision_str.len().min(row.len());
            let (dec_part, rest_part) = row.split_at(dlen);
            out.push(Line::from(vec![
                Span::styled("│ ".to_string(), border),
                Span::styled(cursor.to_string(), Style::default().fg(ui_accent())),
                Span::raw(" ".to_string()),
                Span::styled(dec_part.to_string(), Style::default().fg(dec_color)),
                Span::raw(rest_part.to_string()),
                Span::styled("│".to_string(), border),
            ]));
        }

        out.push(bs(
            "│ ──────────────────────────────────────────────────────────  │",
        ));

        // Hunk preview, +added green, -removed red, @@ headers accented.
        for hunk in self.current_hunks().iter().take(3) {
            let hunk = pad_to_cols(sanitize_terminal_text(hunk).as_ref(), 58);
            let style = if hunk.starts_with('+') {
                Style::default().fg(ui_success())
            } else if hunk.starts_with('-') {
                Style::default().fg(ui_danger())
            } else if hunk.starts_with("@@") {
                Style::default().fg(ui_accent())
            } else {
                Style::default()
            };
            out.push(Line::from(vec![
                Span::styled("│  ".to_string(), border),
                Span::styled(hunk, style),
                Span::styled("│".to_string(), border),
            ]));
        }

        out.push(bs(
            "│                                                            │",
        ));
        out.push(bs(
            "│  y approve   n reject   s skip   ↑↓ navigate   Enter done  │",
        ));
        out.push(bs(
            "└────────────────────────────────────────────────────────────┘",
        ));
        Some(out)
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

    fn take_result(&mut self) -> Option<super::interactive::OverlayResult> {
        // Only invoked on Submit (Enter). Hand back the approved paths for the host
        // to stage; rejected/skipped files are intentionally left untouched.
        let approved: Vec<std::path::PathBuf> = self
            .decisions
            .iter()
            .filter(|(_, decision)| **decision == ReviewDecision::Approve)
            .map(|(path, _)| path.clone())
            .collect();
        Some(super::interactive::OverlayResult::DiffApproved(approved))
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

    #[test]
    fn take_result_returns_only_approved_paths() {
        let files = vec![
            FileDiff::new("a.rs", vec![], 1, 0),
            FileDiff::new("b.rs", vec![], 1, 0),
            FileDiff::new("c.rs", vec![], 1, 0),
        ];
        let mut view = DiffReviewView::new(files);
        view.handle_key(KeyAction::Char('y')); // approve a (cursor 0)
        view.handle_key(KeyAction::Down);
        view.handle_key(KeyAction::Char('n')); // reject b
        view.handle_key(KeyAction::Down);
        view.handle_key(KeyAction::Char('s')); // skip c
        match view.take_result() {
            Some(crate::tui::widgets::interactive::OverlayResult::DiffApproved(paths)) => {
                assert_eq!(paths, vec![std::path::PathBuf::from("a.rs")]);
            }
            other => panic!("expected DiffApproved with only the approved path, got {other:?}"),
        }
    }

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
    fn long_hunk_and_filename_are_truncated_to_the_box() {
        let long_hunk = format!("+{}", "x".repeat(120));
        let view = DiffReviewView::new(vec![FileDiff::new(
            "src/a/very/long/path/with_an_extremely_long_filename_that_would_overflow_the_box.rs",
            vec![long_hunk],
            1,
            0,
        )]);
        let text = view.render();
        // No rendered line may blow past the box border (row line is 63 cols).
        for line in text.lines() {
            assert!(
                crate::tui::display_width(line) <= 64,
                "diff-review line overflows the box ({} cols): {line:?}",
                crate::tui::display_width(line)
            );
        }
        assert!(text.contains('…'), "overlong content should be ellipsized");
    }

    #[test]
    fn cjk_filename_and_hunk_preserve_the_diff_border() {
        let view = DiffReviewView::new(vec![FileDiff::new(
            "src/功能/非常长的中文文件名称用于验证终端宽度.rs",
            vec![format!("+{}", "新增内容".repeat(30))],
            1,
            0,
        )]);
        let text = view.render();
        for line in text.lines() {
            assert!(
                crate::tui::display_width(line) <= 64,
                "CJK diff row overflows the box: {line:?}"
            );
        }
        assert!(text.contains('…'));
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

    /// The hunks are the model's proposed edit; painting them verbatim let a
    /// crafted patch move the cursor and repaint the decision column, so the
    /// operator could read "[y] Approved" over a file they rejected.
    #[test]
    fn hunk_and_file_name_escapes_never_reach_the_terminal() {
        let payload = "\u{1b}]52;c;cm0gLXJmIC8=\u{7}\u{1b}[2J\u{1b}[1;1H\u{1b}[32m[y] Approved";
        let view = DiffReviewView::new(vec![FileDiff::new(
            format!("src/{payload}main.rs"),
            vec![format!("+ let ok = {payload};")],
            1,
            0,
        )]);

        let text = view.render();
        let styled: String = view
            .render_styled()
            .expect("styled lines")
            .iter()
            .flat_map(|line| line.spans.iter())
            .map(|span| span.content.to_string())
            .collect();

        for (what, rendered) in [("render", &text), ("render_styled", &styled)] {
            assert!(
                !rendered.contains('\u{1b}'),
                "{what} kept an escape byte: {rendered:?}"
            );
            assert!(
                !rendered.contains("52;c;cm0gLXJmIC8="),
                "{what} kept the OSC 52 payload: {rendered:?}"
            );
            assert!(
                !rendered.contains("[2J"),
                "{what} kept the screen-clear CSI: {rendered:?}"
            );
        }
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
