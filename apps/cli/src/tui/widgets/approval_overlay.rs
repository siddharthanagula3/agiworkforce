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
//! │                                                                              │
//! │  Allow write_file to modify:                                                 │
//! │    src/main.rs  (+42 / -3 lines)                                             │
//! │                                                                              │
//! │  [ Yes ]  [ No ]  [ Allow Session ]  [ Always Allow ]  [ Deny All ]          │
//! │    ↑                                                                         │
//! │  ←/→ or h/l to move   Enter to confirm   Esc = No                           │
//! └──────────────────────────────────────────────────────────────────────────────┘
//! ```
//!
//! Event-loop wiring (`TuiApp` slot) is a follow-up milestone (M-future).
//! Until then the overlay is a pure state machine exercised under unit tests;
//! `#[allow(dead_code)]` covers the public ratatui render path.

#![allow(dead_code)]

use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Clear, Paragraph};

use super::interactive::{InteractiveView, KeyAction, ViewAction};
use crate::terminal_text::sanitize_terminal_text;
use crate::tui::terminal_palette::{
    ui_danger, ui_muted, ui_on_light, ui_surface_elevated, ui_warning,
};
use crate::tui::{display_width, pad_to_cols};

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
        self.visible = true;
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

    fn submit(&mut self, choice: ApprovalChoice) -> ViewAction {
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

    /// Render the overlay into the given terminal frame area.
    pub fn render_into(&self, frame: &mut ratatui::Frame, area: Rect) {
        if !self.visible {
            return;
        }

        // Centre a fixed-height box inside `area`. A detail longer than the
        // box wraps rather than clipping, so the whole command is readable
        // before it is approved.
        let box_width = area.width.min(82);
        let detail_cols = usize::from(box_width.saturating_sub(2 + 4)).max(8);
        let detail: Vec<String> = self
            .detail
            .iter()
            .flat_map(|d| wrap_cols(d, detail_cols))
            .collect();
        let detail_lines = detail.len() as u16;
        let button_rows = self.button_rows(usize::from(box_width.saturating_sub(4)).max(8));
        let note_line = self.note_line();
        let inner_height = 2
            + detail_lines.max(1)
            + 1
            + button_rows.len() as u16
            + 1
            + u16::from(note_line.is_some())
            + 1
            + 1;
        let box_height = inner_height + 2;

        let vert = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length((area.height.saturating_sub(box_height)) / 2),
                Constraint::Length(box_height),
                Constraint::Min(0),
            ])
            .split(area);

        let horiz = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([
                Constraint::Length((area.width.saturating_sub(box_width)) / 2),
                Constraint::Length(box_width),
                Constraint::Min(0),
            ])
            .split(vert[1]);

        let box_area = horiz[1];
        frame.render_widget(Clear, box_area);

        let block = Block::default()
            .title(" Tool Approval ")
            .borders(Borders::ALL)
            .border_style(Style::default().fg(ui_warning()))
            .style(Style::default().bg(ui_surface_elevated()));

        let inner = block.inner(box_area);
        frame.render_widget(block, box_area);

        // Build text lines.
        let mut lines: Vec<Line> = Vec::new();
        lines.push(Line::from("")); // top padding

        // Prompt line
        lines.push(Line::from(vec![
            Span::raw("  "),
            Span::styled(
                self.prompt.as_str(),
                Style::default().add_modifier(Modifier::BOLD),
            ),
        ]));

        // Detail lines
        if detail.is_empty() {
            lines.push(Line::from(""));
        } else {
            for d in &detail {
                lines.push(Line::from(vec![
                    Span::raw("    "),
                    Span::styled(d.as_str(), Style::default().fg(ui_muted())),
                ]));
            }
        }

        lines.push(Line::from("")); // spacer before buttons

        for row in button_rows {
            let mut spans: Vec<Span> = vec![Span::raw("  ")];
            for index in row {
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
                    (false, false) => Style::default(),
                };
                spans.push(Span::styled(format!("[{}]", choice.label()), style));
                spans.push(Span::raw("  "));
            }
            lines.push(Line::from(spans));
        }

        lines.push(Line::from(vec![Span::styled(
            format!("  {}", CHOICES[self.cursor].description()),
            Style::default().fg(ui_muted()),
        )]));

        if let Some(note_line) = note_line {
            lines.push(Line::from(vec![Span::styled(
                note_line,
                Style::default().add_modifier(Modifier::BOLD),
            )]));
        }

        lines.push(Line::from(vec![Span::styled(
            if self.editing_note {
                "  Enter answers with the note   Tab or Esc closes the note"
            } else {
                "  \u{2190}/\u{2192} move   Enter confirm   Tab note   Esc = No"
            },
            Style::default().fg(ui_muted()),
        )]));

        let para = Paragraph::new(lines);
        frame.render_widget(para, inner);
    }

    fn button_rows(&self, max_cols: usize) -> Vec<Vec<usize>> {
        let mut rows: Vec<Vec<usize>> = vec![Vec::new()];
        let mut width = 2;
        for (index, choice) in CHOICES.iter().enumerate() {
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

        for d in &self.detail {
            out.push_str(&format!("│{}│\n", pad_to_cols(&format!("    {d}"), 78)));
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
                if self.cursor > 0 {
                    self.cursor -= 1;
                }
                ViewAction::Continue
            }
            KeyAction::Right | KeyAction::Char('l') => {
                if self.cursor + 1 < CHOICES.len() {
                    self.cursor += 1;
                }
                ViewAction::Continue
            }
            KeyAction::Tab => {
                self.cursor = (self.cursor + 1) % CHOICES.len();
                ViewAction::Continue
            }
            KeyAction::ShiftTab => {
                if self.cursor == 0 {
                    self.cursor = CHOICES.len() - 1;
                } else {
                    self.cursor -= 1;
                }
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
            KeyAction::Char('y') | KeyAction::Char('Y') => {
                self.cursor = ApprovalChoice::Yes.index();
                self.result = Some(ApprovalChoice::Yes);
                self.visible = false;
                ViewAction::Submit(self.cursor)
            }
            KeyAction::Char('n') | KeyAction::Char('N') => {
                self.cursor = ApprovalChoice::No.index();
                self.result = Some(ApprovalChoice::No);
                self.visible = false;
                ViewAction::Submit(self.cursor)
            }
            KeyAction::Char('s') | KeyAction::Char('S') => {
                self.cursor = ApprovalChoice::AllowSession.index();
                self.result = Some(ApprovalChoice::AllowSession);
                self.visible = false;
                ViewAction::Submit(self.cursor)
            }
            KeyAction::Char('a') | KeyAction::Char('A') => {
                self.cursor = ApprovalChoice::AlwaysAllow.index();
                self.result = Some(ApprovalChoice::AlwaysAllow);
                self.visible = false;
                ViewAction::Submit(self.cursor)
            }
            KeyAction::Char('d') | KeyAction::Char('D') => {
                self.cursor = ApprovalChoice::DenyAll.index();
                self.result = Some(ApprovalChoice::DenyAll);
                self.visible = false;
                ViewAction::Submit(self.cursor)
            }
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

    fn open_overlay() -> ApprovalOverlayState {
        let mut s = ApprovalOverlayState::default();
        s.open(
            "Allow write_file to modify:",
            vec!["src/main.rs  (+42 / -3 lines)".to_string()],
        );
        s
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
    fn approval_choice_labels_and_indices_are_consistent() {
        for (i, choice) in CHOICES.iter().enumerate() {
            assert_eq!(choice.index(), i);
            assert!(!choice.label().trim().is_empty());
        }
    }
}
