//! Interactive approval overlay for the AGI Workforce TUI.
//!
//! Replaces `dialoguer::Confirm` with a full keyboard-navigable overlay that
//! slots into the `InteractiveView` event-loop contract. The overlay is shown
//! whenever the agent needs explicit user permission for a tool call (file
//! write, shell exec, etc.) while running inside the TUI.
//!
//! Layout (80-col reference):
//!
//! ```text
//! ┌─ Tool Approval ─────────────────────────────────────────────────────────────┐
//! │  Apply this patch?                                                           │
//! │    src/main.rs                                                               │
//! │    src/lib.rs                                                                │
//! │    @@ -1,3 +1,5 @@                                                           │
//! │    +fn added() {}                                                            │
//! │  lines 1-2 of 212 · scroll to the end before allowing                        │
//! │  [ Yes ]  [ No ]  [ Allow Session ]  [ Always Allow ]  [ Deny All ]          │
//! │  [ Allow All ]                                                               │
//! │  Run it this once. Tab adds a note for the agent.                            │
//! │  ↑/↓ PgUp/PgDn Home/End scroll   ←/→ move   Enter confirm   Esc = No         │
//! └──────────────────────────────────────────────────────────────────────────────┘
//! ```
//!
//! The title, the question, the targets and the buttons are always drawn. The
//! detail scrolls between them, and an answer that allows the call is taken
//! only after the last row of the detail has been drawn.

#![allow(dead_code)]

use ratatui::layout::Rect;
use ratatui::style::{Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Clear, Paragraph};

use super::interactive::{InteractiveView, KeyAction, ViewAction};
use super::scroll_gate::{draw_too_small, ScrollGate};
use crate::terminal_text::sanitize_terminal_text;
use crate::tui::approval_broker::ApprovalRequestKind;
use crate::tui::terminal_palette::{
    ui_danger, ui_muted, ui_on_light, ui_surface_elevated, ui_warning,
};
use crate::tui::{display_width, pad_to_cols, truncate_cols};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// The user's decision after the overlay resolves.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApprovalChoice {
    /// Allow this single tool call.
    Yes,
    /// Deny this single tool call.
    No,
    /// Allow this tool for the remainder of the session (no further prompts).
    AllowSession,
    /// Always allow this tool in future sessions where the permission store applies.
    AlwaysAllow,
    /// Deny all remaining tool calls and stop the agentic loop.
    DenyAll,
    AllowAll,
}

impl ApprovalChoice {
    /// Index of this choice in the button strip (matches `CHOICES` order).
    pub fn index(self) -> usize {
        match self {
            Self::Yes => 0,
            Self::No => 1,
            Self::AllowSession => 2,
            Self::AlwaysAllow => 3,
            Self::DenyAll => 4,
            Self::AllowAll => 5,
        }
    }

    /// Whether this answer lets the tool call run.
    pub fn approves(self) -> bool {
        matches!(
            self,
            Self::Yes | Self::AllowSession | Self::AlwaysAllow | Self::AllowAll
        )
    }

    /// Human-readable button label.
    pub fn label(self) -> &'static str {
        match self {
            Self::Yes => " Yes ",
            Self::No => " No ",
            Self::AllowSession => " Allow Session ",
            Self::AlwaysAllow => " Always Allow ",
            Self::DenyAll => " Deny All ",
            Self::AllowAll => " Allow All ",
        }
    }

    pub fn description(self) -> &'static str {
        match self {
            Self::Yes => "Run it this once. Tab adds a note for the agent.",
            Self::No => {
                "Skip this call; the agent carries on. Tab adds a note saying what to do instead."
            }
            Self::AllowSession => "Allow it without asking again until this session ends.",
            Self::AlwaysAllow => "Save a rule so it is always allowed.",
            Self::DenyAll => "Refuse this and everything else the agent asks this turn.",
            Self::AllowAll => {
                "Allow this and the rest of this turn's requests, except high-risk ones."
            }
        }
    }

    fn takes_note(self) -> bool {
        matches!(self, Self::Yes | Self::No)
    }
}

const CHOICES: [ApprovalChoice; 6] = [
    ApprovalChoice::Yes,
    ApprovalChoice::No,
    ApprovalChoice::AllowSession,
    ApprovalChoice::AlwaysAllow,
    ApprovalChoice::DenyAll,
    ApprovalChoice::AllowAll,
];

/// Matches Claude Code and Codex: the allowing choice is preselected and
/// Enter confirms whatever is highlighted, so the fail-safe against an
/// unread prompt is Esc, not the cursor position. Esc always answers No
/// (see `handle_key`), independent of `cursor`.
const DEFAULT_CURSOR: usize = 0;
const _: () = assert!(matches!(CHOICES[DEFAULT_CURSOR], ApprovalChoice::Yes));

const MAX_BOX_WIDTH: u16 = 82;
/// The narrowest box that still holds the widest button and the shortest hint.
const MIN_INNER_COLS: usize = 24;

const HINTS: [&str; 2] = [
    "  \u{2190}/\u{2192} move   Enter confirm   Tab note   Esc = No",
    "  Enter confirm   Esc = No",
];
const SCROLL_HINTS: [&str; 3] = [
    "  \u{2191}/\u{2193} PgUp/PgDn Home/End scroll   \u{2190}/\u{2192} move   Enter confirm   Esc = No",
    "  \u{2191}/\u{2193} PgUp/PgDn scroll   \u{2190}/\u{2192} move   Esc = No",
    "  \u{2191}/\u{2193} scroll   Esc = No",
];
const NOTE_HINT: &str = "  Enter answers with the note   Tab or Esc closes the note";

/// What the request acts on, for the rows that stay in view while the detail
/// scrolls.
pub(crate) fn targets_for(kind: &ApprovalRequestKind) -> Vec<String> {
    match kind {
        ApprovalRequestKind::FileWrite { path }
        | ApprovalRequestKind::FileEdit { path }
        | ApprovalRequestKind::TrustDirectory { path } => vec![path.display().to_string()],
        ApprovalRequestKind::Patch { files } => files
            .iter()
            .map(|file| file.display().to_string())
            .collect(),
        ApprovalRequestKind::Network { destination, .. } => vec![destination.clone()],
        ApprovalRequestKind::Git { target, .. } => vec![target.clone()],
        ApprovalRequestKind::GitPush {
            remote,
            branch,
            force,
        } => vec![format!(
            "{remote} {branch}{}",
            if *force { " (force)" } else { "" }
        )],
        ApprovalRequestKind::McpTool {
            server_name,
            tool_name,
        } => vec![format!("{server_name}: {tool_name}")],
        ApprovalRequestKind::ComputerUse { target, .. } => vec![target.clone()],
        ApprovalRequestKind::WorkspacePolicy {
            primary_argument, ..
        } => vec![primary_argument.clone()],
        _ => Vec::new(),
    }
}

/// One draw of the prompt, sized for the area it was given.
struct Arrangement {
    box_width: u16,
    box_height: u16,
    padded: bool,
    prompt: String,
    targets: Vec<String>,
    body: Vec<String>,
    viewport: usize,
    button_rows: Vec<Vec<usize>>,
    note_line: Option<String>,
    inner_cols: usize,
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/// All mutable state owned by the host `TuiApp`.
pub struct ApprovalOverlayState {
    /// True while the overlay is intercepting key events.
    pub visible: bool,
    /// Primary prompt line, e.g. `"Allow write_file to modify:"`.
    pub prompt: String,
    /// Optional detail lines (file path, diff stat, command preview, …).
    pub detail: Vec<String>,
    /// Index into `CHOICES` (0 = Yes, 1 = No, 2 = Allow Session, 3 = Always Allow, 4 = Deny All).
    /// Starts on `Yes`; Enter confirms whichever button is highlighted, Esc
    /// always answers No regardless of where `cursor` is.
    pub cursor: usize,
    /// Set once the user confirms; `None` while the overlay is active.
    pub result: Option<ApprovalChoice>,
    pub note: String,
    pub note_choice: Option<ApprovalChoice>,
    pub editing_note: bool,
    pub always_allow_unavailable: bool,
    /// What the request acts on. Drawn above the detail and never scrolled away.
    targets: Vec<String>,
    scroll: ScrollGate,
    /// An allowing answer was pressed before the end of the detail was drawn.
    refused_unread: bool,
}

impl Default for ApprovalOverlayState {
    fn default() -> Self {
        Self {
            visible: false,
            prompt: String::new(),
            detail: Vec::new(),
            cursor: DEFAULT_CURSOR,
            result: None,
            note: String::new(),
            note_choice: None,
            editing_note: false,
            always_allow_unavailable: false,
            targets: Vec::new(),
            scroll: ScrollGate::default(),
            refused_unread: false,
        }
    }
}

impl ApprovalOverlayState {
    /// Open the overlay with a fresh prompt. Clears any previous result.
    ///
    /// The prompt and detail lines quote the tool name, path, and argument
    /// preview the model supplied. They are stripped of terminal escapes here
    /// so neither render path can let a crafted argument repaint the consent
    /// text the operator is about to answer.
    pub fn open(&mut self, prompt: impl Into<String>, detail: Vec<String>) {
        self.prompt = sanitize_terminal_text(&prompt.into()).into_owned();
        self.detail = detail
            .into_iter()
            .map(|line| sanitize_terminal_text(&line).into_owned())
            .collect();
        self.cursor = DEFAULT_CURSOR;
        self.result = None;
        self.note.clear();
        self.note_choice = None;
        self.editing_note = false;
        self.always_allow_unavailable = false;
        self.targets = Vec::new();
        self.scroll.reset();
        self.refused_unread = false;
        self.visible = true;
    }

    /// Name what the prompt now open acts on. These rows stay in view while
    /// the detail scrolls; the ones that do not fit are listed in the detail.
    pub fn set_targets(&mut self, targets: Vec<String>) {
        self.targets = targets
            .into_iter()
            .map(|target| sanitize_terminal_text(&target).into_owned())
            .filter(|target| !target.trim().is_empty())
            .collect();
    }

    pub fn note(&self) -> Option<String> {
        let note = self.note.trim();
        (!note.is_empty() && self.result.is_some() && self.result == self.note_choice)
            .then(|| note.to_string())
    }

    pub fn insert_note_text(&mut self, text: &str) {
        if self.editing_note {
            self.note
                .extend(text.chars().filter(|character| !character.is_control()));
        }
    }

    fn offered(&self, index: usize) -> bool {
        !(self.always_allow_unavailable && CHOICES[index] == ApprovalChoice::AlwaysAllow)
    }

    fn step(&mut self, forward: bool, wrap: bool) {
        let mut next = self.cursor;
        for _ in 0..CHOICES.len() {
            next = match (forward, wrap) {
                (true, _) if next + 1 < CHOICES.len() => next + 1,
                (true, true) => 0,
                (false, _) if next > 0 => next - 1,
                (false, true) => CHOICES.len() - 1,
                _ => return,
            };
            if self.offered(next) {
                self.cursor = next;
                return;
            }
        }
    }

    fn submit(&mut self, choice: ApprovalChoice) -> ViewAction {
        if choice.approves() && !self.scroll.end_was_shown() {
            self.refused_unread = true;
            return ViewAction::Continue;
        }
        self.cursor = choice.index();
        self.result = Some(choice);
        self.editing_note = false;
        self.visible = false;
        ViewAction::Submit(self.cursor)
    }

    fn handle_note_key(&mut self, key: KeyAction) -> ViewAction {
        match key {
            KeyAction::Char(character) => self.note.push(character),
            KeyAction::Backspace => {
                self.note.pop();
            }
            KeyAction::Enter => {
                let choice = self.note_choice.unwrap_or(CHOICES[self.cursor]);
                return self.submit(choice);
            }
            KeyAction::Tab | KeyAction::Esc => self.editing_note = false,
            _ => {}
        }
        ViewAction::Continue
    }

    /// Close and clear state.
    pub fn close(&mut self) {
        self.visible = false;
    }

    /// True when the user has confirmed a choice.
    pub fn is_resolved(&self) -> bool {
        self.result.is_some()
    }

    fn button_rows(&self, max_cols: usize) -> Vec<Vec<usize>> {
        let mut rows: Vec<Vec<usize>> = vec![Vec::new()];
        let mut width = 2;
        for (index, choice) in CHOICES
            .iter()
            .enumerate()
            .filter(|(index, _)| self.offered(*index))
        {
            let cell = display_width(choice.label()) + 4;
            let row_is_empty = rows.last().is_none_or(Vec::is_empty);
            if width + cell > max_cols && !row_is_empty {
                rows.push(Vec::new());
                width = 2;
            }
            if let Some(row) = rows.last_mut() {
                row.push(index);
            }
            width += cell;
        }
        rows
    }

    fn note_line(&self) -> Option<String> {
        let choice = self.note_choice?;
        if !self.editing_note && self.note.is_empty() {
            return None;
        }
        Some(format!(
            "  Note with {}: {}{}",
            choice.label().trim(),
            self.note,
            if self.editing_note { "\u{258f}" } else { "" }
        ))
    }

    fn pinned_targets(&self, rows: usize, cols: usize) -> Vec<String> {
        let total = self.targets.len();
        let named = if total > rows {
            rows.saturating_sub(1)
        } else {
            rows
        };
        let mut pinned: Vec<String> = self
            .targets
            .iter()
            .take(named)
            .map(|target| truncate_cols(target, cols))
            .collect();
        if named == 0 {
            pinned.push(format!("{total} targets, all listed below"));
        } else if total > named {
            pinned.push(format!(
                "and {} more, all {total} are listed below",
                total - named
            ));
        }
        pinned
    }

    /// Lay the prompt out for an area of `width` by `height`. `None` when
    /// the area cannot hold the question, one row of the detail and the
    /// buttons together.
    fn arrange(&self, width: u16, height: u16) -> Option<Arrangement> {
        let box_width = width.min(MAX_BOX_WIDTH);
        let inner_cols = usize::from(box_width.saturating_sub(2));
        let inner_rows = usize::from(height.saturating_sub(2));
        if inner_cols < MIN_INNER_COLS {
            return None;
        }
        let prompt_cols = inner_cols - 2;
        let detail_cols = inner_cols - 4;
        let wrap = |lines: &[String]| -> Vec<String> {
            lines
                .iter()
                .flat_map(|line| wrap_cols(line, detail_cols))
                .collect()
        };

        let button_rows = self.button_rows(inner_cols - 2);
        let note_line = self.note_line();
        let fixed_rows = 1 + button_rows.len() + 1 + usize::from(note_line.is_some()) + 1;
        let prompt = truncate_cols(&self.prompt, prompt_cols);
        let mut body: Vec<String> = Vec::new();
        if display_width(&self.prompt) > prompt_cols {
            body.extend(wrap_cols(&self.prompt, detail_cols));
            body.push(String::new());
        }
        let detail = wrap(self.detail.as_slice());
        let targets_fit_a_row = self
            .targets
            .iter()
            .all(|target| display_width(target) <= detail_cols);

        if targets_fit_a_row {
            let blank_detail_row =
                usize::from(self.targets.is_empty() && body.is_empty() && detail.is_empty());
            let rows =
                fixed_rows + 3 + self.targets.len() + body.len() + detail.len() + blank_detail_row;
            if rows <= inner_rows {
                body.extend(detail);
                return Some(Arrangement {
                    box_width,
                    box_height: u16::try_from(rows + 2).ok()?,
                    padded: true,
                    prompt,
                    targets: self.targets.clone(),
                    viewport: body.len(),
                    body,
                    button_rows,
                    note_line,
                    inner_cols,
                });
            }
        }

        let available = inner_rows.checked_sub(fixed_rows)?;
        let pinned_rows = if self.targets.is_empty() {
            0
        } else {
            self.targets.len().min((available / 3).max(1))
        };
        let every_target_pinned = targets_fit_a_row && pinned_rows == self.targets.len();
        let targets = if every_target_pinned {
            self.targets.clone()
        } else {
            body.push(format!("Every target ({}):", self.targets.len()));
            body.extend(wrap(self.targets.as_slice()));
            body.push(String::new());
            self.pinned_targets(pinned_rows, detail_cols)
        };
        body.extend(detail);

        let room = available.checked_sub(pinned_rows)?;
        let viewport = if body.len() <= room {
            body.len()
        } else {
            room.checked_sub(1).filter(|rows| *rows > 0)?
        };
        let position_row = usize::from(body.len() > viewport);
        let rows = fixed_rows + pinned_rows + viewport + position_row;
        Some(Arrangement {
            box_width,
            box_height: u16::try_from(rows + 2).ok()?,
            padded: false,
            prompt,
            targets,
            body,
            viewport,
            button_rows,
            note_line,
            inner_cols,
        })
    }

    /// Render the overlay into the given terminal frame area.
    pub fn render_into(&self, frame: &mut ratatui::Frame, area: Rect) {
        if !self.visible {
            return;
        }
        let Some(shape) = self.arrange(area.width, area.height) else {
            self.scroll.nothing_drawn();
            draw_too_small(frame, area, "Tool Approval", "Esc to refuse");
            return;
        };
        let window = self.scroll.window(shape.body.len(), shape.viewport);
        let allowing_is_open = self.scroll.end_was_shown();

        let box_area = Rect {
            x: area.x + area.width.saturating_sub(shape.box_width) / 2,
            y: area.y + area.height.saturating_sub(shape.box_height) / 2,
            width: shape.box_width,
            height: shape.box_height,
        };
        frame.render_widget(Clear, box_area);

        let block = Block::default()
            .title(" Tool Approval ")
            .borders(Borders::ALL)
            .border_style(Style::default().fg(ui_warning()))
            .style(Style::default().bg(ui_surface_elevated()));

        let inner = block.inner(box_area);
        frame.render_widget(block, box_area);

        let muted = Style::default().fg(ui_muted());
        let mut lines: Vec<Line> = Vec::new();
        if shape.padded {
            lines.push(Line::from(""));
        }

        lines.push(Line::from(vec![
            Span::raw("  "),
            Span::styled(
                shape.prompt.as_str(),
                Style::default().add_modifier(Modifier::BOLD),
            ),
        ]));

        for target in &shape.targets {
            lines.push(Line::from(vec![
                Span::raw("    "),
                Span::raw(target.as_str()),
            ]));
        }

        if shape.padded && shape.targets.is_empty() && shape.body.is_empty() {
            lines.push(Line::from(""));
        }
        for row in &shape.body[window] {
            lines.push(Line::from(vec![
                Span::raw("    "),
                Span::styled(row.as_str(), muted),
            ]));
        }

        if let Some(position) = self.scroll.position_label() {
            let (text, style) = if allowing_is_open {
                (format!("  {position}"), muted)
            } else {
                let style = if self.refused_unread {
                    Style::default()
                        .fg(ui_warning())
                        .add_modifier(Modifier::BOLD)
                } else {
                    muted
                };
                (
                    format!("  {position} \u{b7} scroll to the end before allowing"),
                    style,
                )
            };
            lines.push(Line::from(Span::styled(
                truncate_cols(&text, shape.inner_cols),
                style,
            )));
        }

        if shape.padded {
            lines.push(Line::from(""));
        }

        for row in &shape.button_rows {
            let mut spans: Vec<Span> = vec![Span::raw("  ")];
            for &index in row {
                let choice = CHOICES[index];
                let selected = index == self.cursor;
                let destructive = choice == ApprovalChoice::DenyAll;
                let style = match (selected, destructive) {
                    (true, true) => Style::default()
                        .fg(ui_on_light())
                        .bg(ui_danger())
                        .add_modifier(Modifier::BOLD),
                    (true, false) => Style::default()
                        .fg(ui_on_light())
                        .bg(ui_warning())
                        .add_modifier(Modifier::BOLD),
                    (false, true) => Style::default().fg(ui_danger()),
                    (false, false) if choice.approves() && !allowing_is_open => muted,
                    (false, false) => Style::default(),
                };
                spans.push(Span::styled(format!("[{}]", choice.label()), style));
                spans.push(Span::raw("  "));
            }
            lines.push(Line::from(spans));
        }

        lines.push(Line::from(vec![Span::styled(
            format!("  {}", CHOICES[self.cursor].description()),
            muted,
        )]));

        if let Some(note_line) = shape.note_line {
            lines.push(Line::from(vec![Span::styled(
                note_line,
                Style::default().add_modifier(Modifier::BOLD),
            )]));
        }

        let hint = if self.editing_note {
            NOTE_HINT
        } else {
            let hints: &[&str] = if self.scroll.overflows() {
                &SCROLL_HINTS
            } else {
                &HINTS
            };
            hints
                .iter()
                .copied()
                .find(|hint| display_width(hint) <= shape.inner_cols)
                .unwrap_or(hints[hints.len() - 1])
        };
        lines.push(Line::from(vec![Span::styled(hint, muted)]));

        let para = Paragraph::new(lines);
        frame.render_widget(para, inner);
    }

    /// Text-only render used when ratatui frame is unavailable (REPL / tests).
    pub fn render_text(&self) -> String {
        if !self.visible {
            return String::new();
        }

        let mut out = String::new();
        out.push_str(
            "┌─ Tool Approval ──────────────────────────────────────────────────────────────┐\n",
        );
        out.push_str(&format!(
            "│{}│\n",
            pad_to_cols(&format!("  {}", self.prompt), 78)
        ));

        for line in self.targets.iter().chain(&self.detail) {
            out.push_str(&format!("│{}│\n", pad_to_cols(&format!("    {line}"), 78)));
        }

        out.push_str(
            "│                                                                              │\n",
        );

        for row in self.button_rows(78) {
            let mut buttons = String::from("  ");
            for index in row {
                let label = CHOICES[index].label().trim();
                if index == self.cursor {
                    buttons.push_str(&format!("[{label}]"));
                } else {
                    buttons.push_str(&format!(" {label}  "));
                }
                buttons.push_str("  ");
            }
            out.push_str(&format!("│{}│\n", pad_to_cols(&buttons, 78)));
        }
        out.push_str(&format!(
            "│{}│\n",
            pad_to_cols(&format!("  {}", CHOICES[self.cursor].description()), 78)
        ));
        if let Some(note_line) = self.note_line() {
            out.push_str(&format!("│{}│\n", pad_to_cols(&note_line, 78)));
        }
        out.push_str(&format!(
            "│{}│\n",
            pad_to_cols("  ←/→ move   Enter confirm   Tab note   Esc = No", 78)
        ));
        out.push_str(
            "└──────────────────────────────────────────────────────────────────────────────┘\n",
        );
        out
    }
}

// ---------------------------------------------------------------------------
// InteractiveView implementation
// ---------------------------------------------------------------------------

impl InteractiveView for ApprovalOverlayState {
    fn render(&self) -> String {
        self.render_text()
    }

    fn handle_key(&mut self, key: KeyAction) -> ViewAction {
        if self.editing_note {
            return self.handle_note_key(key);
        }
        match key {
            KeyAction::Tab if CHOICES[self.cursor].takes_note() => {
                let choice = CHOICES[self.cursor];
                if self.note_choice != Some(choice) {
                    self.note_choice = Some(choice);
                }
                self.editing_note = true;
                ViewAction::Continue
            }
            KeyAction::Char('t') | KeyAction::Char('T') => self.submit(ApprovalChoice::AllowAll),
            KeyAction::Left | KeyAction::Char('h') => {
                self.step(false, false);
                ViewAction::Continue
            }
            KeyAction::Right | KeyAction::Char('l') => {
                self.step(true, false);
                ViewAction::Continue
            }
            KeyAction::Tab => {
                self.step(true, true);
                ViewAction::Continue
            }
            KeyAction::ShiftTab => {
                self.step(false, true);
                ViewAction::Continue
            }
            KeyAction::Up
            | KeyAction::Down
            | KeyAction::PageUp
            | KeyAction::PageDown
            | KeyAction::Home
            | KeyAction::End => {
                self.scroll.scroll_key(key);
                ViewAction::Continue
            }
            KeyAction::Char('k') => {
                self.scroll.scroll_key(KeyAction::Up);
                ViewAction::Continue
            }
            KeyAction::Char('j') => {
                self.scroll.scroll_key(KeyAction::Down);
                ViewAction::Continue
            }
            KeyAction::Enter => self.submit(CHOICES[self.cursor]),
            KeyAction::Esc => {
                // Esc = No (deny this one call, don't stop the loop)
                self.result = Some(ApprovalChoice::No);
                self.visible = false;
                ViewAction::Close
            }
            // y/n/s/a/d shortcuts
            KeyAction::Char('y') | KeyAction::Char('Y') => self.submit(ApprovalChoice::Yes),
            KeyAction::Char('n') | KeyAction::Char('N') => self.submit(ApprovalChoice::No),
            KeyAction::Char('s') | KeyAction::Char('S') => {
                self.submit(ApprovalChoice::AllowSession)
            }
            KeyAction::Char('a') | KeyAction::Char('A') if !self.always_allow_unavailable => {
                self.submit(ApprovalChoice::AlwaysAllow)
            }
            KeyAction::Char('d') | KeyAction::Char('D') => self.submit(ApprovalChoice::DenyAll),
            _ => ViewAction::Continue,
        }
    }

    fn is_done(&self) -> bool {
        !self.visible && self.result.is_some()
    }

    fn title(&self) -> Option<&str> {
        Some("Tool Approval")
    }
}

/// Break `text` into rows of at most `max_cols` columns, cutting nothing off.
pub(crate) fn wrap_cols(text: &str, max_cols: usize) -> Vec<String> {
    let mut lines = Vec::new();
    let mut current = String::new();
    let mut width = 0;
    for ch in text.chars() {
        let w = display_width(&ch.to_string());
        if width + w > max_cols && !current.is_empty() {
            lines.push(std::mem::take(&mut current));
            width = 0;
        }
        current.push(ch);
        width += w;
    }
    if !current.is_empty() || lines.is_empty() {
        lines.push(current);
    }
    lines
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tui::widgets::interactive::{KeyAction, ViewAction};
    use ratatui::backend::TestBackend;
    use ratatui::Terminal;

    /// Opened and drawn once: an allowing key is taken only after a draw.
    fn open_overlay() -> ApprovalOverlayState {
        let mut s = ApprovalOverlayState::default();
        s.open(
            "Allow write_file to modify:",
            vec!["src/main.rs  (+42 / -3 lines)".to_string()],
        );
        draw_overlay(&s, 88, 20);
        s
    }

    fn tall_overlay(lines: usize) -> ApprovalOverlayState {
        let mut s = ApprovalOverlayState::default();
        s.open(
            "Apply this patch?",
            (1..=lines).map(|n| format!("+ change line {n}")).collect(),
        );
        s
    }

    fn painted(state: &ApprovalOverlayState, width: u16, height: u16) -> String {
        let terminal = draw_overlay(state, width, height);
        let buffer = terminal.backend().buffer();
        (0..buffer.area.height)
            .map(|y| {
                (0..buffer.area.width)
                    .map(|x| buffer[(x, y)].symbol().to_string())
                    .collect::<String>()
            })
            .collect::<Vec<_>>()
            .join("\n")
    }

    fn draw_overlay(
        state: &ApprovalOverlayState,
        width: u16,
        height: u16,
    ) -> Terminal<TestBackend> {
        let mut terminal = Terminal::new(TestBackend::new(width, height)).expect("terminal");
        let area = Rect::new(0, 0, width, height);
        terminal.draw(|f| state.render_into(f, area)).expect("draw");
        terminal
    }

    /// The prompt and detail quote model-supplied tool arguments directly
    /// above the consent buttons, so an escape there could repaint the
    /// decision the operator is answering.
    #[test]
    fn a_long_command_wraps_inside_the_box_instead_of_clipping() {
        let command = format!(
            "cd /very/long/workspace/path/{} && printf hi > hello.txt",
            "x".repeat(70)
        );
        let mut state = ApprovalOverlayState::default();
        state.open("Allow this command?", vec![command.clone()]);

        let terminal = draw_overlay(&state, 90, 20);
        let buffer = terminal.backend().buffer();
        let rows: Vec<String> = (0..buffer.area.height)
            .map(|y| {
                (0..buffer.area.width)
                    .map(|x| buffer[(x, y)].symbol().to_string())
                    .collect::<String>()
            })
            .collect();
        let painted = rows.join("\n");
        assert!(
            painted.contains("printf hi > hello.txt"),
            "tail clipped: {painted}"
        );
        assert!(
            rows.iter().filter(|row| row.contains("xxxx")).count() >= 2,
            "no wrap: {painted}"
        );
        assert_eq!(wrap_cols("abc", 10), vec!["abc".to_string()]);
        assert_eq!(
            wrap_cols("abcdef", 4),
            vec!["abcd".to_string(), "ef".to_string()]
        );
    }

    #[test]
    fn open_strips_terminal_escapes_from_prompt_and_detail() {
        let mut state = ApprovalOverlayState::default();
        state.open(
            "Allow run_command\u{1b}[2J to run:",
            vec!["rm -rf /\u{1b}]52;c;cm0gLXJmIC8=\u{7}  (safe)".to_string()],
        );

        assert_eq!(state.prompt, "Allow run_command to run:");
        assert_eq!(state.detail[0], "rm -rf /  (safe)");

        let text = state.render_text();
        assert!(!text.contains('\u{1b}'), "escape survived: {text:?}");
        assert!(
            !text.contains("52;c"),
            "clipboard payload survived: {text:?}"
        );

        let terminal = draw_overlay(&state, 90, 14);
        let painted: String = terminal
            .backend()
            .buffer()
            .content()
            .iter()
            .map(|cell| cell.symbol())
            .collect();
        assert!(
            !painted.contains('\u{1b}'),
            "escape reached the frame buffer"
        );
    }

    #[test]
    fn default_state_is_invisible_and_unresolved() {
        let s = ApprovalOverlayState::default();
        assert!(!s.visible);
        assert_eq!(s.cursor, ApprovalChoice::Yes.index());
        assert!(s.result.is_none());
        assert!(!s.is_done());
        assert!(!s.is_resolved());
    }

    /// Matches Claude Code and Codex: the allowing choice is preselected, not
    /// the denying one. Esc, not the cursor position, is what protects an
    /// unread prompt (see `esc_resolves_as_no_and_closes`).
    #[test]
    fn open_defaults_cursor_to_yes() {
        let s = open_overlay();
        assert!(s.visible);
        assert_eq!(
            s.cursor,
            ApprovalChoice::Yes.index(),
            "a freshly opened approval prompt must preselect Yes, matching the leaders"
        );
        assert!(s.result.is_none());
        assert!(!s.is_done());
        assert!(
            s.render_text().contains("[Yes]"),
            "the highlighted button must render as the selected one"
        );
    }

    #[test]
    fn enter_without_moving_the_cursor_confirms_the_tool_call() {
        let mut s = open_overlay();
        let action = s.handle_key(KeyAction::Enter);
        assert_eq!(action, ViewAction::Submit(ApprovalChoice::Yes.index()));
        assert_eq!(
            s.result,
            Some(ApprovalChoice::Yes),
            "Enter confirms whatever is highlighted, which defaults to Yes"
        );
        assert!(!s.visible);
        assert!(s.is_done());
    }

    #[test]
    fn reopening_resets_a_moved_cursor_back_to_yes() {
        let mut s = open_overlay();
        s.handle_key(KeyAction::Right);
        s.handle_key(KeyAction::Right);
        s.open("Allow bash to run:", vec!["rm -rf /tmp/x".to_string()]);
        assert_eq!(s.cursor, ApprovalChoice::Yes.index());
        assert!(s.result.is_none());
    }

    #[test]
    fn render_approval_overlay_snapshot() {
        let mut state = open_overlay();
        state.cursor = ApprovalChoice::AllowSession.index();

        let terminal = draw_overlay(&state, 88, 20);
        insta::assert_snapshot!("approval_overlay_baseline", terminal.backend());
    }

    #[test]
    fn right_arrow_advances_cursor() {
        let mut s = open_overlay();
        assert_eq!(s.cursor, ApprovalChoice::Yes.index());
        assert_eq!(s.handle_key(KeyAction::Right), ViewAction::Continue);
        assert_eq!(s.cursor, ApprovalChoice::No.index());
        assert_eq!(s.handle_key(KeyAction::Right), ViewAction::Continue);
        assert_eq!(s.cursor, ApprovalChoice::AllowSession.index());
    }

    #[test]
    fn right_arrow_stops_at_last_button() {
        let mut s = open_overlay();
        for _ in 0..10 {
            s.handle_key(KeyAction::Right);
        }
        assert_eq!(s.cursor, CHOICES.len() - 1);
    }

    #[test]
    fn left_arrow_stops_at_first_button() {
        let mut s = open_overlay();
        for _ in 0..10 {
            s.handle_key(KeyAction::Left);
        }
        assert_eq!(s.cursor, 0);
    }

    #[test]
    fn tab_wraps_around() {
        let mut s = open_overlay();
        for _ in 0..CHOICES.len() {
            s.handle_key(KeyAction::Tab);
        }
        assert_eq!(s.cursor, ApprovalChoice::Yes.index()); // back to start
    }

    #[test]
    fn enter_submits_current_choice() {
        let mut s = open_overlay();
        s.handle_key(KeyAction::Right); // Yes -> No
        s.handle_key(KeyAction::Right); // No -> Allow Session
        let action = s.handle_key(KeyAction::Enter);
        assert_eq!(
            action,
            ViewAction::Submit(ApprovalChoice::AllowSession.index())
        );
        assert_eq!(s.result, Some(ApprovalChoice::AllowSession));
        assert!(!s.visible);
        assert!(s.is_done());
    }

    #[test]
    fn esc_resolves_as_no_and_closes() {
        let mut s = open_overlay();
        let action = s.handle_key(KeyAction::Esc);
        assert_eq!(action, ViewAction::Close);
        assert_eq!(s.result, Some(ApprovalChoice::No));
        assert!(!s.visible);
        assert!(s.is_done());
    }

    #[test]
    fn y_shortcut_resolves_yes_immediately() {
        let mut s = open_overlay();
        let action = s.handle_key(KeyAction::Char('y'));
        assert_eq!(action, ViewAction::Submit(0));
        assert_eq!(s.result, Some(ApprovalChoice::Yes));
    }

    #[test]
    fn n_shortcut_resolves_no_immediately() {
        let mut s = open_overlay();
        let action = s.handle_key(KeyAction::Char('n'));
        assert_eq!(action, ViewAction::Submit(1));
        assert_eq!(s.result, Some(ApprovalChoice::No));
    }

    #[test]
    fn a_shortcut_resolves_always_allow() {
        let mut s = open_overlay();
        let action = s.handle_key(KeyAction::Char('a'));
        assert_eq!(action, ViewAction::Submit(3));
        assert_eq!(s.result, Some(ApprovalChoice::AlwaysAllow));
    }

    #[test]
    fn s_shortcut_resolves_allow_session() {
        let mut s = open_overlay();
        let action = s.handle_key(KeyAction::Char('s'));
        assert_eq!(action, ViewAction::Submit(2));
        assert_eq!(s.result, Some(ApprovalChoice::AllowSession));
    }

    #[test]
    fn d_shortcut_resolves_deny_all() {
        let mut s = open_overlay();
        let action = s.handle_key(KeyAction::Char('d'));
        assert_eq!(action, ViewAction::Submit(4));
        assert_eq!(s.result, Some(ApprovalChoice::DenyAll));
    }

    #[test]
    fn uppercase_shortcuts_work() {
        for (key, expected) in [
            (KeyAction::Char('Y'), ApprovalChoice::Yes),
            (KeyAction::Char('N'), ApprovalChoice::No),
            (KeyAction::Char('S'), ApprovalChoice::AllowSession),
            (KeyAction::Char('A'), ApprovalChoice::AlwaysAllow),
            (KeyAction::Char('D'), ApprovalChoice::DenyAll),
            (KeyAction::Char('T'), ApprovalChoice::AllowAll),
        ] {
            let mut s = open_overlay();
            s.handle_key(key);
            assert_eq!(s.result, Some(expected));
        }
    }

    #[test]
    fn render_text_contains_prompt_and_all_buttons() {
        let s = open_overlay();
        let text = s.render_text();
        assert!(text.contains("Tool Approval"));
        assert!(text.contains("Allow write_file to modify:"));
        assert!(text.contains("src/main.rs"));
        assert!(text.contains("Yes"));
        assert!(text.contains("No"));
        assert!(text.contains("Allow Session"));
        assert!(text.contains("Always Allow"));
        assert!(text.contains("Deny All"));
        assert!(text.contains("Allow All"));
    }

    #[test]
    fn text_render_keeps_cjk_content_inside_eighty_columns() {
        let mut s = ApprovalOverlayState::default();
        s.open(
            "允许工具修改非常长的中文项目路径和配置文件吗？".repeat(4),
            vec!["详细信息包含中文字符".repeat(8)],
        );
        let text = s.render_text();
        assert!(
            text.lines()
                .all(|line| crate::tui::display_width(line) == 80),
            "approval box rows must remain exactly 80 terminal columns: {text}"
        );
        assert!(text.contains('…'));
    }

    #[test]
    fn render_text_empty_when_not_visible() {
        let s = ApprovalOverlayState::default();
        assert!(s.render_text().is_empty());
    }

    #[test]
    fn interactive_view_render_delegates_to_render_text() {
        let s = open_overlay();
        let from_trait = s.render();
        let direct = s.render_text();
        assert_eq!(from_trait, direct);
    }

    #[test]
    fn interactive_view_title_is_tool_approval() {
        let s = open_overlay();
        assert_eq!(s.title(), Some("Tool Approval"));
    }

    #[test]
    fn h_l_vim_keys_move_cursor() {
        let mut s = open_overlay();
        assert_eq!(s.cursor, ApprovalChoice::Yes.index());
        s.handle_key(KeyAction::Char('l'));
        s.handle_key(KeyAction::Char('l'));
        assert_eq!(s.cursor, ApprovalChoice::AllowSession.index());
        s.handle_key(KeyAction::Char('h'));
        assert_eq!(s.cursor, ApprovalChoice::No.index());
    }

    #[test]
    fn close_hides_overlay_without_setting_result() {
        let mut s = open_overlay();
        s.close();
        assert!(!s.visible);
        assert!(s.result.is_none());
        assert!(!s.is_done()); // result required for is_done
    }

    #[test]
    fn an_unavailable_always_allow_is_neither_shown_nor_reachable() {
        let mut s = open_overlay();
        s.always_allow_unavailable = true;

        let text = s.render_text();
        assert!(!text.contains("Always Allow"), "{text}");
        assert!(text.contains("Deny All"));

        assert_eq!(s.handle_key(KeyAction::Char('a')), ViewAction::Continue);
        assert!(s.result.is_none());
        assert!(s.visible);

        for _ in 0..10 {
            s.handle_key(KeyAction::Right);
        }
        assert_eq!(s.cursor, ApprovalChoice::AllowAll.index());
        for _ in 0..2 {
            s.handle_key(KeyAction::Left);
        }
        assert_eq!(
            s.cursor,
            ApprovalChoice::AllowSession.index(),
            "the cursor steps over the button that is not offered"
        );

        let mut s = open_overlay();
        s.always_allow_unavailable = true;
        assert_eq!(s.handle_key(KeyAction::Char('d')), ViewAction::Submit(4));
        assert_eq!(s.result, Some(ApprovalChoice::DenyAll));

        s.open("Allow this command?", Vec::new());
        assert!(
            s.render_text().contains("Always Allow"),
            "a new prompt offers it again"
        );
    }

    #[test]
    fn a_note_goes_with_the_answer_it_was_written_for() {
        let mut s = open_overlay();
        assert_eq!(s.handle_key(KeyAction::Tab), ViewAction::Continue);
        assert!(s.editing_note);
        s.insert_note_text("use the staging\u{1b} database");
        assert_eq!(s.handle_key(KeyAction::Enter), ViewAction::Submit(0));
        assert_eq!(s.result, Some(ApprovalChoice::Yes));
        assert_eq!(s.note().as_deref(), Some("use the staging database"));
    }

    #[test]
    fn a_prompt_taller_than_the_terminal_keeps_its_buttons_and_says_where_it_is() {
        let state = tall_overlay(212);
        let text = painted(&state, 90, 24);

        assert!(text.contains("Tool Approval"), "{text}");
        assert!(text.contains("Apply this patch?"), "{text}");
        for label in [
            "[ Yes ]",
            "[ No ]",
            "[ Allow Session ]",
            "[ Always Allow ]",
            "[ Deny All ]",
            "[ Allow All ]",
        ] {
            assert!(text.contains(label), "{label} is not drawn: {text}");
        }
        assert!(text.contains("Esc = No"), "{text}");
        assert!(text.contains("lines 1-16 of 212"), "{text}");
        assert!(text.contains("+ change line 16"), "{text}");
        assert!(!text.contains("+ change line 17"), "{text}");
    }

    #[test]
    fn an_allowing_key_waits_until_the_end_of_the_detail_has_been_drawn() {
        let mut state = tall_overlay(212);
        painted(&state, 90, 24);
        for key in [
            KeyAction::Char('y'),
            KeyAction::Char('s'),
            KeyAction::Char('a'),
            KeyAction::Char('t'),
            KeyAction::Enter,
        ] {
            assert_eq!(state.handle_key(key), ViewAction::Continue, "{key:?}");
            assert!(state.result.is_none() && state.visible, "{key:?}");
        }
        assert!(painted(&state, 90, 24).contains("scroll to the end before allowing"));

        state.handle_key(KeyAction::End);
        assert_eq!(
            state.handle_key(KeyAction::Char('y')),
            ViewAction::Continue,
            "End moved the window, but no draw has shown the end yet"
        );
        let text = painted(&state, 90, 24);
        assert!(text.contains("+ change line 212"), "{text}");
        assert!(text.contains("lines 197-212 of 212"), "{text}");
        assert!(!text.contains("scroll to the end"), "{text}");

        assert_eq!(
            state.handle_key(KeyAction::Char('y')),
            ViewAction::Submit(0)
        );
        assert_eq!(state.result, Some(ApprovalChoice::Yes));
    }

    #[test]
    fn the_end_shown_once_keeps_allowing_open_after_scrolling_back() {
        let mut state = tall_overlay(212);
        painted(&state, 90, 24);
        state.handle_key(KeyAction::End);
        painted(&state, 90, 24);
        state.handle_key(KeyAction::Home);
        painted(&state, 90, 24);
        assert_eq!(
            state.handle_key(KeyAction::Char('s')),
            ViewAction::Submit(2)
        );
    }

    #[test]
    fn a_refusing_key_always_answers() {
        for (key, expected) in [
            (KeyAction::Char('n'), ApprovalChoice::No),
            (KeyAction::Char('d'), ApprovalChoice::DenyAll),
            (KeyAction::Esc, ApprovalChoice::No),
        ] {
            let mut state = tall_overlay(212);
            painted(&state, 90, 24);
            state.handle_key(key);
            assert_eq!(state.result, Some(expected), "{key:?}");
        }

        let mut never_drawn = tall_overlay(3);
        assert_eq!(
            never_drawn.handle_key(KeyAction::Char('y')),
            ViewAction::Continue,
            "nothing has been shown yet"
        );
        assert_eq!(
            never_drawn.handle_key(KeyAction::Char('n')),
            ViewAction::Submit(1)
        );
    }

    #[test]
    fn arrows_pages_home_and_end_scroll_the_detail() {
        let mut state = tall_overlay(212);
        let position = |state: &ApprovalOverlayState| -> String {
            let text = painted(state, 90, 24);
            let start = text.find("lines ").expect("a position row");
            text[start..]
                .split(" of ")
                .next()
                .unwrap_or_default()
                .to_string()
        };
        assert_eq!(position(&state), "lines 1-16");
        state.handle_key(KeyAction::Down);
        assert_eq!(position(&state), "lines 2-17");
        state.handle_key(KeyAction::Char('j'));
        assert_eq!(position(&state), "lines 3-18");
        state.handle_key(KeyAction::Char('k'));
        state.handle_key(KeyAction::Up);
        assert_eq!(position(&state), "lines 1-16");
        state.handle_key(KeyAction::PageDown);
        assert_eq!(position(&state), "lines 16-31");
        state.handle_key(KeyAction::PageUp);
        assert_eq!(position(&state), "lines 1-16");
        state.handle_key(KeyAction::End);
        assert_eq!(position(&state), "lines 197-212");
        state.handle_key(KeyAction::Home);
        assert_eq!(position(&state), "lines 1-16");
        assert!(state.result.is_none() && state.visible);
    }

    #[test]
    fn targets_stay_in_view_while_the_detail_scrolls() {
        let mut state = tall_overlay(212);
        state.set_targets(vec!["src/main.rs".to_string(), "src/lib.rs".to_string()]);
        for key in [None, Some(KeyAction::PageDown), Some(KeyAction::End)] {
            if let Some(key) = key {
                state.handle_key(key);
            }
            let text = painted(&state, 90, 24);
            assert!(text.contains("src/main.rs"), "{key:?}: {text}");
            assert!(text.contains("src/lib.rs"), "{key:?}: {text}");
            assert!(text.contains("Apply this patch?"), "{key:?}: {text}");
            assert!(text.contains("[ Yes ]"), "{key:?}: {text}");
        }
    }

    #[test]
    fn targets_that_do_not_fit_are_counted_above_and_listed_in_the_detail() {
        let mut state = tall_overlay(3);
        state.set_targets((1..=40).map(|n| format!("src/file_{n}.rs")).collect());

        let text = painted(&state, 90, 24);
        assert!(text.contains("src/file_4.rs"), "{text}");
        assert!(
            text.contains("and 36 more, all 40 are listed below"),
            "{text}"
        );
        assert!(text.contains("Every target (40):"), "{text}");
        assert!(!text.contains("src/file_40.rs"), "{text}");
        assert_eq!(
            state.handle_key(KeyAction::Char('y')),
            ViewAction::Continue,
            "the list has not been shown to its end"
        );

        state.handle_key(KeyAction::End);
        let text = painted(&state, 90, 24);
        assert!(text.contains("src/file_40.rs"), "{text}");
        assert!(text.contains("+ change line 3"), "{text}");
        assert_eq!(
            state.handle_key(KeyAction::Char('y')),
            ViewAction::Submit(0)
        );
    }

    #[test]
    fn set_targets_strips_terminal_escapes_and_drops_blank_names() {
        let mut state = tall_overlay(1);
        state.set_targets(vec!["src/\u{1b}[2Jmain.rs".to_string(), "  ".to_string()]);
        assert_eq!(state.targets, vec!["src/main.rs".to_string()]);
        assert!(state.render_text().contains("src/main.rs"));
    }

    #[test]
    fn a_window_too_small_for_the_request_takes_no_allowing_answer() {
        let mut state = tall_overlay(3);
        let text = painted(&state, 90, 4);
        assert!(text.contains("too small"), "{text}");
        assert_eq!(state.handle_key(KeyAction::Char('y')), ViewAction::Continue);
        assert_eq!(state.handle_key(KeyAction::Esc), ViewAction::Close);
        assert_eq!(state.result, Some(ApprovalChoice::No));

        let mut state = tall_overlay(3);
        painted(&state, 90, 24);
        painted(&state, 20, 24);
        assert_eq!(
            state.handle_key(KeyAction::Char('y')),
            ViewAction::Continue,
            "the latest draw could not hold the buttons"
        );
        painted(&state, 90, 24);
        assert_eq!(
            state.handle_key(KeyAction::Char('y')),
            ViewAction::Submit(0)
        );
    }

    #[test]
    fn buttons_wrap_onto_more_rows_in_a_narrow_terminal() {
        let state = open_overlay();
        let text = painted(&state, 44, 20);
        for label in [
            "[ Yes ]",
            "[ No ]",
            "[ Allow Session ]",
            "[ Always Allow ]",
            "[ Deny All ]",
            "[ Allow All ]",
        ] {
            assert!(text.contains(label), "{label} is not drawn: {text}");
        }
        assert_eq!(state.button_rows(40).len(), 3);
        assert_eq!(state.button_rows(78).len(), 2);
    }

    #[test]
    fn a_question_too_long_for_its_row_is_repeated_whole_in_the_detail() {
        let mut state = ApprovalOverlayState::default();
        state.open(
            format!("{}TAIL_MARKER", "x".repeat(200)),
            vec!["detail".to_string()],
        );
        let text = painted(&state, 90, 24);
        assert!(text.contains('…'), "{text}");
        assert!(text.contains("TAIL_MARKER"), "{text}");
    }

    #[test]
    fn targets_name_what_each_kind_of_request_acts_on() {
        use std::path::PathBuf;

        assert_eq!(
            targets_for(&ApprovalRequestKind::Patch {
                files: vec![PathBuf::from("a.rs"), PathBuf::from("b.rs")],
            }),
            vec!["a.rs".to_string(), "b.rs".to_string()]
        );
        assert_eq!(
            targets_for(&ApprovalRequestKind::FileWrite {
                path: PathBuf::from("src/main.rs"),
            }),
            vec!["src/main.rs".to_string()]
        );
        assert_eq!(
            targets_for(&ApprovalRequestKind::GitPush {
                remote: "origin".to_string(),
                branch: "main".to_string(),
                force: true,
            }),
            vec!["origin main (force)".to_string()]
        );
        assert!(targets_for(&ApprovalRequestKind::Exec {
            command: "ls".to_string(),
        })
        .is_empty());
    }

    #[test]
    fn approval_choice_labels_and_indices_are_consistent() {
        for (i, choice) in CHOICES.iter().enumerate() {
            assert_eq!(choice.index(), i);
            assert!(!choice.label().trim().is_empty());
        }
    }
}
