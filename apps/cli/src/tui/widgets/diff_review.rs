//! `DiffReviewView`: per-file diff review overlay.
//!
//! `y/n/s` keys record Approve/Reject/Skip decisions per file; ↑↓ move the
//! cursor across files; Enter finalizes and returns Submit(approved_count).
//!
//! The file under the cursor is shown with its whole path and its whole
//! diff, which PageUp, PageDown, Home and End scroll. ←→ step through its
//! hunks, and `y/n/s` then decide the hunk shown. `y` approves a file or a
//! hunk only after the end of what is shown has been drawn.

#![allow(dead_code)]

use std::cell::Cell;
use std::collections::HashMap;
use std::ops::Range;
use std::path::PathBuf;

use super::approval_overlay::wrap_cols;
use super::interactive::{InteractiveView, KeyAction, ViewAction};
use super::scroll_gate::ScrollGate;
use crate::diff_model::FileChangeKind;
use crate::terminal_text::sanitize_terminal_text;
use crate::tui::pad_to_cols;

const INNER_COLS: usize = 60;
const TEXT_COLS: usize = 58;
const FILE_COLS: usize = 57;
/// The rows a draw is laid out for until the host says how many it has.
const DEFAULT_ROWS: usize = 24;
/// Both borders, the rule under the file list, the blank row and the two
/// rows of hints.
const CHROME_ROWS: usize = 6;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Mark {
    Path,
    Added,
    Removed,
    Hunk,
    Context,
}

impl Mark {
    fn of(line: &str) -> Self {
        if line.starts_with("@@") {
            Self::Hunk
        } else if line.starts_with('+') {
            Self::Added
        } else if line.starts_with('-') {
            Self::Removed
        } else {
            Self::Context
        }
    }
}

enum Row {
    Border(String),
    File { index: usize, text: String },
    Diff(Mark, String),
    Note(String),
    Status(String),
    Warning(String),
}

/// One draw: the files listed, and the file under the cursor in full with
/// the number of its rows that fit.
struct Shape {
    listed: Range<usize>,
    body: Vec<(Mark, String)>,
    viewport: usize,
}

fn top_border() -> String {
    let title = "─ Diff Review ";
    format!(
        "┌{title}{}┐",
        "─".repeat(INNER_COLS - title.chars().count())
    )
}

fn bottom_border() -> String {
    format!("└{}┘", "─".repeat(INNER_COLS))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReviewDecision {
    Approve,
    Reject,
    Skip,
    Discard,
}

impl ReviewDecision {
    fn label(&self) -> &'static str {
        match self {
            Self::Approve => "[y] Approved",
            Self::Reject => "[n] Rejected",
            Self::Skip => "[s] Skipped ",
            Self::Discard => "[d] Discard ",
        }
    }
}

#[derive(Debug, Clone)]
pub struct FileDiff {
    pub path: PathBuf,
    pub kind: FileChangeKind,
    pub hunks: Vec<String>,
    pub additions: usize,
    pub deletions: usize,
    pub hunk_previews: Vec<Vec<String>>,
    pub hunk_patches: Vec<String>,
    pub hunk_staged: Vec<bool>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct DiffReviewOutcome {
    pub approved: Vec<PathBuf>,
    pub unstage_files: Vec<PathBuf>,
    pub stage_hunks: Vec<String>,
    pub unstage_hunks: Vec<String>,
    pub discard_hunks: Vec<String>,
}

impl DiffReviewOutcome {
    pub fn only_approved_files(&self) -> bool {
        self.unstage_files.is_empty()
            && self.stage_hunks.is_empty()
            && self.unstage_hunks.is_empty()
            && self.discard_hunks.is_empty()
    }
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
            kind: FileChangeKind::Modified,
            hunks,
            additions,
            deletions,
            hunk_previews: Vec::new(),
            hunk_patches: Vec::new(),
            hunk_staged: Vec::new(),
        }
    }

    pub fn with_hunks(mut self, hunks: Vec<(Vec<String>, String, bool)>) -> Self {
        self.hunk_previews = Vec::with_capacity(hunks.len());
        self.hunk_patches = Vec::with_capacity(hunks.len());
        self.hunk_staged = Vec::with_capacity(hunks.len());
        for (preview, patch, staged) in hunks {
            self.hunk_previews.push(preview);
            self.hunk_patches.push(patch);
            self.hunk_staged.push(staged);
        }
        self
    }

    /// Counts and status come from the parsed model, so the overlay cannot
    /// disagree with the diff it is showing.
    pub fn from_model(file: &crate::diff_model::FileDiff) -> Self {
        let mut preview = Vec::new();
        let mut hunk_previews = Vec::new();
        for hunk in &file.hunks {
            let mut lines = vec![hunk.header()];
            lines.extend(hunk.lines.iter().map(crate::diff_model::DiffLine::render));
            preview.extend(lines.iter().cloned());
            hunk_previews.push(lines);
        }
        Self {
            path: file.path().to_path_buf(),
            kind: file.kind,
            hunks: preview,
            additions: file.additions(),
            deletions: file.deletions(),
            hunk_previews,
            hunk_patches: Vec::new(),
            hunk_staged: Vec::new(),
        }
    }
}

pub struct DiffReviewView {
    pub files: Vec<FileDiff>,
    pub cursor: usize,
    pub decisions: HashMap<PathBuf, ReviewDecision>,
    pub hunk: Option<usize>,
    pub hunk_decisions: HashMap<(PathBuf, usize), ReviewDecision>,
    pending_discard: Option<(PathBuf, usize)>,
    done: bool,
    /// For each file, where its diff is scrolled to and whether its end has
    /// been drawn.
    previews: Vec<ScrollGate>,
    /// The same for each hunk of each file, for the hunk shown on its own.
    hunk_gates: Vec<Vec<ScrollGate>>,
    rows: Cell<u16>,
    /// `y` was pressed on a diff that had not been drawn to its end.
    refused_unread: bool,
}

impl DiffReviewView {
    pub fn new(files: Vec<FileDiff>) -> Self {
        Self {
            decisions: HashMap::new(),
            cursor: 0,
            previews: files.iter().map(|_| ScrollGate::default()).collect(),
            hunk_gates: files
                .iter()
                .map(|file| {
                    file.hunk_patches
                        .iter()
                        .map(|_| ScrollGate::default())
                        .collect()
                })
                .collect(),
            files,
            hunk: None,
            hunk_decisions: HashMap::new(),
            pending_discard: None,
            done: false,
            rows: Cell::new(0),
            refused_unread: false,
        }
    }

    fn move_up(&mut self) {
        if self.cursor > 0 {
            self.cursor -= 1;
            self.hunk = None;
            self.refused_unread = false;
        }
    }

    fn move_down(&mut self) {
        if self.cursor + 1 < self.files.len() {
            self.cursor += 1;
            self.hunk = None;
            self.refused_unread = false;
        }
    }

    fn selectable_hunks(&self) -> usize {
        self.files
            .get(self.cursor)
            .map(|file| file.hunk_patches.len())
            .unwrap_or(0)
    }

    fn next_hunk(&mut self) {
        let count = self.selectable_hunks();
        if count == 0 {
            return;
        }
        self.hunk = Some(match self.hunk {
            None => 0,
            Some(index) => (index + 1).min(count - 1),
        });
        self.refused_unread = false;
    }

    fn previous_hunk(&mut self) {
        self.hunk = match self.hunk {
            None | Some(0) => None,
            Some(index) => Some(index - 1),
        };
        self.refused_unread = false;
    }

    fn set_decision(&mut self, decision: ReviewDecision) {
        let Some(path) = self.files.get(self.cursor).map(|file| file.path.clone()) else {
            return;
        };
        match self.hunk {
            Some(index) => {
                self.decisions.remove(&path);
                self.hunk_decisions.insert((path, index), decision);
            }
            None => {
                self.hunk_decisions
                    .retain(|(hunk_path, _), _| *hunk_path != path);
                self.decisions.insert(path, decision);
            }
        }
    }

    fn request_discard(&mut self) {
        let Some(index) = self.hunk else {
            return;
        };
        let Some(file) = self.files.get(self.cursor) else {
            return;
        };
        if file.hunk_staged.get(index).copied().unwrap_or(false) {
            self.pending_discard = None;
            return;
        }
        let key = (file.path.clone(), index);
        if self.pending_discard.as_ref() == Some(&key) {
            self.pending_discard = None;
            self.set_decision(ReviewDecision::Discard);
        } else {
            self.pending_discard = Some(key);
        }
    }

    fn file_label(&self, file: &FileDiff) -> Option<&'static str> {
        self.decisions
            .get(&file.path)
            .map(|d| d.label())
            .or_else(|| {
                self.hunk_decisions
                    .keys()
                    .any(|(path, _)| *path == file.path)
                    .then_some("[~] By hunk ")
            })
    }

    fn hunk_status(&self) -> Option<String> {
        let index = self.hunk?;
        let file = self.files.get(self.cursor)?;
        let decision = self
            .hunk_decisions
            .get(&(file.path.clone(), index))
            .map(|d| d.label())
            .unwrap_or("[ ] Pending");
        let staged = if file.hunk_staged.get(index).copied().unwrap_or(false) {
            "staged"
        } else {
            "unstaged"
        };
        if self.pending_discard.as_ref() == Some(&(file.path.clone(), index)) {
            return Some(format!(
                "hunk {} of {} ({staged})  press d again to discard it",
                index + 1,
                file.hunk_patches.len()
            ));
        }
        Some(format!(
            "hunk {} of {} ({staged})  {decision}",
            index + 1,
            file.hunk_patches.len()
        ))
    }

    pub fn outcome(&self) -> DiffReviewOutcome {
        let mut outcome = DiffReviewOutcome::default();
        for file in &self.files {
            match self.decisions.get(&file.path) {
                Some(ReviewDecision::Approve) => outcome.approved.push(file.path.clone()),
                Some(ReviewDecision::Reject) => outcome.unstage_files.push(file.path.clone()),
                _ => {}
            }
            for (index, patch) in file.hunk_patches.iter().enumerate() {
                let staged = file.hunk_staged.get(index).copied().unwrap_or(false);
                match (self.hunk_decisions.get(&(file.path.clone(), index)), staged) {
                    (Some(ReviewDecision::Approve), false) => {
                        outcome.stage_hunks.push(patch.clone())
                    }
                    (Some(ReviewDecision::Reject), true) => {
                        outcome.unstage_hunks.push(patch.clone())
                    }
                    (Some(ReviewDecision::Discard), false) => {
                        outcome.discard_hunks.push(patch.clone())
                    }
                    _ => {}
                }
            }
        }
        outcome
    }

    fn approved_count(&self) -> usize {
        self.decisions
            .values()
            .filter(|d| **d == ReviewDecision::Approve)
            .count()
    }

    fn current_hunks(&self) -> &[String] {
        let Some(file) = self.files.get(self.cursor) else {
            return &[];
        };
        match self.hunk.and_then(|index| file.hunk_previews.get(index)) {
            Some(lines) => lines.as_slice(),
            None => file.hunks.as_slice(),
        }
    }

    fn preview(&self) -> Option<&ScrollGate> {
        match self.hunk {
            Some(index) => self.hunk_gates.get(self.cursor)?.get(index),
            None => self.previews.get(self.cursor),
        }
    }

    fn preview_mut(&mut self) -> Option<&mut ScrollGate> {
        match self.hunk {
            Some(index) => self.hunk_gates.get_mut(self.cursor)?.get_mut(index),
            None => self.previews.get_mut(self.cursor),
        }
    }

    /// What is under the cursor in full: the file's path, then every line of
    /// its diff or of the hunk shown, wrapped so nothing is cut off.
    fn body(&self) -> Vec<(Mark, String)> {
        let Some(file) = self.files.get(self.cursor) else {
            return Vec::new();
        };
        let mut body: Vec<(Mark, String)> = wrap_cols(
            sanitize_terminal_text(&file.path.display().to_string()).as_ref(),
            TEXT_COLS,
        )
        .into_iter()
        .map(|row| (Mark::Path, row))
        .collect();
        for line in self.current_hunks() {
            let line = sanitize_terminal_text(line);
            let mark = Mark::of(&line);
            body.extend(
                wrap_cols(&line, TEXT_COLS)
                    .into_iter()
                    .map(|row| (mark, row)),
            );
        }
        body
    }

    fn shape(&self) -> Option<Shape> {
        let rows = match self.rows.get() {
            0 => DEFAULT_ROWS,
            rows => usize::from(rows),
        };
        let status_rows = usize::from(self.hunk_status().is_some());
        let free = rows.checked_sub(CHROME_ROWS + status_rows)?;
        let list_rows = self.files.len().min((free / 3).max(1));
        let first = self
            .cursor
            .saturating_sub(list_rows / 2)
            .min(self.files.len().saturating_sub(list_rows));
        let body = self.body();
        let room = free.checked_sub(list_rows)?;
        let viewport = if body.len() <= room {
            body.len()
        } else {
            room.checked_sub(1).filter(|rows| *rows > 0)?
        };
        Some(Shape {
            listed: first..first + list_rows,
            body,
            viewport,
        })
    }

    fn decision_label(&self, index: usize) -> &'static str {
        self.files
            .get(index)
            .and_then(|file| self.file_label(file))
            .unwrap_or("[ ] Pending   ")
    }

    fn file_row(&self, index: usize) -> String {
        let file = &self.files[index];
        let name = sanitize_terminal_text(
            file.path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("?"),
        );
        pad_to_cols(
            &format!(
                "{}  {}  {name}  +{} -{}",
                self.decision_label(index),
                file.kind.code(),
                file.additions,
                file.deletions
            ),
            FILE_COLS,
        )
    }

    fn rows(&self) -> Vec<Row> {
        let mut rows = vec![Row::Border(top_border())];
        if self.files.is_empty() {
            rows.push(Row::Note("  (no files to review)".to_string()));
            rows.push(Row::Note(String::new()));
            rows.push(Row::Note("  Enter finalize   Esc cancel".to_string()));
            rows.push(Row::Border(bottom_border()));
            return rows;
        }
        let (Some(preview), Some(shape)) = (self.preview(), self.shape()) else {
            if let Some(preview) = self.preview() {
                preview.nothing_drawn();
            }
            rows.push(Row::Warning(
                "  This window is too small to review a diff.".to_string(),
            ));
            rows.push(Row::Note(
                "  Enlarge it, or press Esc to close.".to_string(),
            ));
            rows.push(Row::Border(bottom_border()));
            return rows;
        };

        for index in shape.listed.clone() {
            rows.push(Row::File {
                index,
                text: self.file_row(index),
            });
        }
        let rule = if shape.listed.len() < self.files.len() {
            format!(
                "── files {}-{} of {} ",
                shape.listed.start + 1,
                shape.listed.end,
                self.files.len()
            )
        } else {
            String::new()
        };
        rows.push(Row::Note(format!(
            " {rule}{}",
            "─".repeat(TEXT_COLS.saturating_sub(rule.chars().count()))
        )));

        if let Some(status) = self.hunk_status() {
            rows.push(Row::Status(format!("  {status}")));
        }
        let window = preview.window(shape.body.len(), shape.viewport);
        for (mark, text) in &shape.body[window] {
            rows.push(Row::Diff(*mark, text.clone()));
        }
        if let Some(position) = preview.position_label() {
            if preview.end_was_shown() {
                rows.push(Row::Note(format!("  {position}")));
            } else {
                let text = format!("  {position} \u{b7} read to the end before approving");
                rows.push(if self.refused_unread {
                    Row::Warning(text)
                } else {
                    Row::Note(text)
                });
            }
        }

        rows.push(Row::Note(String::new()));
        rows.push(Row::Note(
            if preview.overflows() {
                "  y/n/s decide   ↑↓ file   PgUp/PgDn diff   Enter done"
            } else {
                "  y approve   n reject   s skip   ↑↓ navigate   Enter done"
            }
            .to_string(),
        ));
        rows.push(Row::Note(
            "  ←→ hunk · n unstages · d twice discards an unstaged hunk".to_string(),
        ));
        rows.push(Row::Border(bottom_border()));
        rows
    }

    fn cursor_mark(&self, index: usize) -> &'static str {
        if index == self.cursor {
            "❯"
        } else {
            " "
        }
    }
}

impl InteractiveView for DiffReviewView {
    fn render(&self) -> String {
        self.rows()
            .iter()
            .map(|row| match row {
                Row::Border(line) => format!("{line}\n"),
                Row::File { index, text } => {
                    format!("│ {} {text}│\n", self.cursor_mark(*index))
                }
                Row::Diff(_, text) => format!("│  {}│\n", pad_to_cols(text, TEXT_COLS)),
                Row::Note(text) | Row::Status(text) | Row::Warning(text) => {
                    format!("│{}│\n", pad_to_cols(text, INNER_COLS))
                }
            })
            .collect()
    }

    fn render_styled(&self) -> Option<Vec<ratatui::text::Line<'static>>> {
        use crate::tui::terminal_palette::{
            ui_accent, ui_danger, ui_muted, ui_success, ui_warning,
        };
        use ratatui::style::Style;
        use ratatui::text::{Line, Span};

        let border = Style::default().fg(ui_muted());
        let edge = || Span::styled("│".to_string(), border);
        let lines = self
            .rows()
            .into_iter()
            .map(|row| match row {
                Row::Border(line) => Line::from(Span::styled(line, border)),
                Row::File { index, text } => {
                    let decision = self.decision_label(index);
                    let color = match self
                        .files
                        .get(index)
                        .and_then(|file| self.decisions.get(&file.path))
                    {
                        Some(ReviewDecision::Approve) => ui_success(),
                        Some(ReviewDecision::Reject) => ui_danger(),
                        Some(ReviewDecision::Skip) => ui_warning(),
                        Some(ReviewDecision::Discard) => ui_danger(),
                        None if self
                            .files
                            .get(index)
                            .and_then(|file| self.file_label(file))
                            .is_some() =>
                        {
                            ui_accent()
                        }
                        None => ui_muted(),
                    };
                    // The label is ASCII, so its byte length is its width.
                    let (label, rest) = text.split_at(decision.len().min(text.len()));
                    Line::from(vec![
                        edge(),
                        Span::raw(" ".to_string()),
                        Span::styled(
                            self.cursor_mark(index).to_string(),
                            Style::default().fg(ui_accent()),
                        ),
                        Span::raw(" ".to_string()),
                        Span::styled(label.to_string(), Style::default().fg(color)),
                        Span::raw(rest.to_string()),
                        edge(),
                    ])
                }
                Row::Diff(mark, text) => {
                    let style = match mark {
                        Mark::Added => Style::default().fg(ui_success()),
                        Mark::Removed => Style::default().fg(ui_danger()),
                        Mark::Hunk | Mark::Path => Style::default().fg(ui_accent()),
                        Mark::Context => Style::default(),
                    };
                    Line::from(vec![
                        edge(),
                        Span::raw("  ".to_string()),
                        Span::styled(pad_to_cols(&text, TEXT_COLS), style),
                        edge(),
                    ])
                }
                Row::Note(text) => Line::from(Span::styled(
                    format!("│{}│", pad_to_cols(&text, INNER_COLS)),
                    border,
                )),
                Row::Status(text) => Line::from(vec![
                    edge(),
                    Span::styled(
                        pad_to_cols(&text, INNER_COLS),
                        Style::default().fg(ui_accent()),
                    ),
                    edge(),
                ]),
                Row::Warning(text) => Line::from(vec![
                    edge(),
                    Span::styled(
                        pad_to_cols(&text, INNER_COLS),
                        Style::default().fg(ui_warning()),
                    ),
                    edge(),
                ]),
            })
            .collect();
        Some(lines)
    }

    fn fit_rows(&self, rows: u16) {
        self.rows.set(rows);
    }

    fn handle_key(&mut self, key: KeyAction) -> ViewAction {
        if !matches!(key, KeyAction::Char('d') | KeyAction::Char('D')) {
            self.pending_discard = None;
        }
        match key {
            KeyAction::Char('y') | KeyAction::Char('Y') => {
                if self.preview().is_some_and(ScrollGate::end_was_shown) {
                    self.set_decision(ReviewDecision::Approve);
                } else {
                    self.refused_unread = true;
                }
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
            KeyAction::Char('d') | KeyAction::Char('D') => {
                self.request_discard();
                ViewAction::Continue
            }
            KeyAction::Right => {
                self.next_hunk();
                ViewAction::Continue
            }
            KeyAction::Left => {
                self.previous_hunk();
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
            KeyAction::PageUp | KeyAction::PageDown | KeyAction::Home | KeyAction::End => {
                if let Some(preview) = self.preview_mut() {
                    preview.scroll_key(key);
                }
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
        let outcome = self.outcome();
        if outcome.only_approved_files() {
            return Some(super::interactive::OverlayResult::DiffApproved(
                outcome.approved,
            ));
        }
        Some(super::interactive::OverlayResult::DiffReviewed(outcome))
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
        view.render();
        view.handle_key(KeyAction::Char('y')); // approve a (cursor 0)
        view.handle_key(KeyAction::Down);
        view.handle_key(KeyAction::Char('n')); // reject b
        view.handle_key(KeyAction::Down);
        view.handle_key(KeyAction::Char('s')); // skip c
        match view.take_result() {
            Some(crate::tui::widgets::interactive::OverlayResult::DiffReviewed(outcome)) => {
                assert_eq!(outcome.approved, vec![std::path::PathBuf::from("a.rs")]);
                assert_eq!(
                    outcome.unstage_files,
                    vec![std::path::PathBuf::from("b.rs")]
                );
                assert!(outcome.discard_hunks.is_empty());
            }
            other => panic!("expected a review that stages a and unstages b, got {other:?}"),
        }
    }

    fn hunk_view() -> DiffReviewView {
        DiffReviewView::new(vec![FileDiff::new("f.rs", vec![], 2, 2).with_hunks(vec![
            (vec!["@@ -1 +1 @@".into()], "staged-patch".into(), true),
            (vec!["@@ -9 +9 @@".into()], "unstaged-patch".into(), false),
        ])])
    }

    #[test]
    fn rejecting_a_hunk_never_discards_work() {
        let mut view = hunk_view();
        view.handle_key(KeyAction::Right);
        view.handle_key(KeyAction::Char('n'));
        view.handle_key(KeyAction::Right);
        view.handle_key(KeyAction::Char('n'));
        let outcome = view.outcome();
        assert_eq!(outcome.unstage_hunks, vec!["staged-patch".to_string()]);
        assert!(outcome.discard_hunks.is_empty());
        assert!(outcome.stage_hunks.is_empty());
    }

    #[test]
    fn discarding_a_hunk_needs_a_second_press() {
        let mut view = hunk_view();
        view.handle_key(KeyAction::Right);
        view.handle_key(KeyAction::Right);
        view.handle_key(KeyAction::Char('d'));
        assert!(view.outcome().discard_hunks.is_empty());
        view.handle_key(KeyAction::Char('y'));
        view.handle_key(KeyAction::Char('d'));
        view.handle_key(KeyAction::Char('d'));
        assert_eq!(
            view.outcome().discard_hunks,
            vec!["unstaged-patch".to_string()]
        );
    }

    #[test]
    fn a_staged_hunk_cannot_be_discarded() {
        let mut view = hunk_view();
        view.handle_key(KeyAction::Right);
        view.handle_key(KeyAction::Char('d'));
        view.handle_key(KeyAction::Char('d'));
        assert!(view.outcome().discard_hunks.is_empty());
    }

    #[test]
    fn a_hunk_is_approved_only_after_it_has_been_drawn() {
        let mut view = hunk_view();
        view.handle_key(KeyAction::Right);
        view.handle_key(KeyAction::Right);
        view.handle_key(KeyAction::Char('y'));
        assert!(view.outcome().stage_hunks.is_empty(), "nothing drawn yet");

        let text = view.render();
        assert!(text.contains("hunk 2 of 2 (unstaged)"), "{text}");
        assert!(text.contains("@@ -9 +9 @@"), "{text}");
        view.handle_key(KeyAction::Char('y'));
        assert_eq!(
            view.outcome().stage_hunks,
            vec!["unstaged-patch".to_string()]
        );
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
        view.render();
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
        view.render();
        view.handle_key(KeyAction::Char('y')); // approve file 0
        view.handle_key(KeyAction::Down);
        view.render();
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

    fn long_diff(lines: usize) -> FileDiff {
        FileDiff::new(
            "src/deep/module/handler.rs",
            (1..=lines).map(|n| format!("+added line {n}")).collect(),
            lines,
            0,
        )
    }

    #[test]
    fn every_row_of_the_box_is_the_same_width() {
        for view in [
            make_view(),
            DiffReviewView::new(vec![]),
            DiffReviewView::new(vec![long_diff(200)]),
        ] {
            let text = view.render();
            for line in text.lines() {
                assert_eq!(crate::tui::display_width(line), 62, "{line:?}");
            }
        }
    }

    #[test]
    fn a_file_is_approved_only_after_its_whole_diff_has_been_drawn() {
        let mut view = DiffReviewView::new(vec![long_diff(200), long_diff(2)]);
        let path = PathBuf::from("src/deep/module/handler.rs");

        view.handle_key(KeyAction::Char('y'));
        assert!(view.decisions.is_empty(), "nothing has been drawn yet");

        view.fit_rows(24);
        let text = view.render();
        assert!(text.contains("src/deep/module/handler.rs"), "{text}");
        assert!(text.contains("lines 1-15 of 201"), "{text}");
        assert!(text.contains("Enter done"), "{text}");
        assert!(
            text.contains("+added line 14") && !text.contains("+added line 15"),
            "{text}"
        );
        assert_eq!(text.lines().count(), 24);

        view.handle_key(KeyAction::Char('y'));
        assert!(
            view.decisions.is_empty(),
            "the end of the diff was not shown"
        );
        assert!(view.render().contains("read to the end before approving"));

        view.handle_key(KeyAction::PageDown);
        assert!(view.render().contains("lines 15-29 of 201"));
        view.handle_key(KeyAction::End);
        let text = view.render();
        assert!(text.contains("+added line 200"), "{text}");
        view.handle_key(KeyAction::Char('y'));
        assert_eq!(view.decisions.get(&path), Some(&ReviewDecision::Approve));
    }

    #[test]
    fn rejecting_and_skipping_never_wait_for_the_diff() {
        let mut view = DiffReviewView::new(vec![long_diff(200)]);
        view.handle_key(KeyAction::Char('n'));
        assert_eq!(
            view.decisions
                .get(&PathBuf::from("src/deep/module/handler.rs")),
            Some(&ReviewDecision::Reject)
        );
        view.handle_key(KeyAction::Char('s'));
        assert_eq!(
            view.decisions
                .get(&PathBuf::from("src/deep/module/handler.rs")),
            Some(&ReviewDecision::Skip)
        );
    }

    #[test]
    fn a_long_line_wraps_instead_of_being_cut_short() {
        let view = DiffReviewView::new(vec![FileDiff::new(
            "a.rs",
            vec![format!("+{}TAIL_MARKER", "x".repeat(100))],
            1,
            0,
        )]);
        assert!(view.render().contains("TAIL_MARKER"));
    }

    #[test]
    fn a_long_file_list_keeps_the_cursor_and_the_controls_in_view() {
        let files: Vec<FileDiff> = (0..40)
            .map(|n| FileDiff::new(format!("file_{n:02}.rs"), vec![], 1, 0))
            .collect();
        let mut view = DiffReviewView::new(files);
        view.fit_rows(20);
        for _ in 0..30 {
            view.handle_key(KeyAction::Down);
        }
        let text = view.render();
        assert_eq!(text.lines().count(), 11, "{text}");
        assert!(text.contains("❯ [ ] Pending     M  file_30.rs"), "{text}");
        assert!(text.contains("files 29-32 of 40"), "{text}");
        assert!(text.contains("Enter done"), "{text}");
    }

    #[test]
    fn a_window_too_small_for_a_diff_approves_nothing() {
        let mut view = DiffReviewView::new(vec![long_diff(3)]);
        view.fit_rows(5);
        assert!(view.render().contains("too small"));
        view.handle_key(KeyAction::Char('y'));
        assert!(view.decisions.is_empty());

        view.fit_rows(24);
        view.render();
        view.handle_key(KeyAction::Char('y'));
        assert_eq!(view.approved_count(), 1);
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
