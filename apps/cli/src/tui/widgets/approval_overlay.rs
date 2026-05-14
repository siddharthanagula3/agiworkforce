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
//! │  [ Yes ]  [ No ]  [ Always Allow ]  [ Deny All ]                            │
//! │     ↑                                                                        │
//! │  ←/→ or h/l to move   Enter to confirm   Esc = No                           │
//! └──────────────────────────────────────────────────────────────────────────────┘
//! ```
//!
//! Event-loop wiring (`TuiApp` slot) is a follow-up milestone (M-future).
//! Until then the overlay is a pure state machine exercised under unit tests;
//! `#[allow(dead_code)]` covers the public ratatui render path.

#![allow(dead_code)]

use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Clear, Paragraph};

use super::interactive::{InteractiveView, KeyAction, ViewAction};

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
    AlwaysAllow,
    /// Deny all remaining tool calls and stop the agentic loop.
    DenyAll,
}

impl ApprovalChoice {
    /// Index of this choice in the button strip (matches `CHOICES` order).
    pub fn index(self) -> usize {
        match self {
            Self::Yes => 0,
            Self::No => 1,
            Self::AlwaysAllow => 2,
            Self::DenyAll => 3,
        }
    }

    /// Human-readable button label.
    pub fn label(self) -> &'static str {
        match self {
            Self::Yes => " Yes ",
            Self::No => " No ",
            Self::AlwaysAllow => " Always Allow ",
            Self::DenyAll => " Deny All ",
        }
    }
}

const CHOICES: [ApprovalChoice; 4] = [
    ApprovalChoice::Yes,
    ApprovalChoice::No,
    ApprovalChoice::AlwaysAllow,
    ApprovalChoice::DenyAll,
];

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
    /// Index into `CHOICES` (0 = Yes, 1 = No, 2 = Always Allow, 3 = Deny All).
    pub cursor: usize,
    /// Set once the user confirms; `None` while the overlay is active.
    pub result: Option<ApprovalChoice>,
}

impl Default for ApprovalOverlayState {
    fn default() -> Self {
        Self {
            visible: false,
            prompt: String::new(),
            detail: Vec::new(),
            cursor: 0,
            result: None,
        }
    }
}

impl ApprovalOverlayState {
    /// Open the overlay with a fresh prompt. Clears any previous result.
    pub fn open(&mut self, prompt: impl Into<String>, detail: Vec<String>) {
        self.prompt = prompt.into();
        self.detail = detail;
        self.cursor = 0; // default to Yes
        self.result = None;
        self.visible = true;
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
    pub fn render_into(
        &self,
        frame: &mut ratatui::Frame,
        area: Rect,
    ) {
        if !self.visible {
            return;
        }

        // Centre a fixed-height box inside `area`.
        let detail_lines = self.detail.len() as u16;
        let inner_height = 2          // top padding + prompt
            + detail_lines.max(1)     // detail or blank
            + 2                       // blank + button strip
            + 1                       // hint line
            + 1;                      // bottom padding
        let box_height = inner_height + 2; // borders
        let box_width = area.width.min(82);

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
            .border_style(Style::default().fg(Color::Yellow));

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
        if self.detail.is_empty() {
            lines.push(Line::from(""));
        } else {
            for d in &self.detail {
                lines.push(Line::from(vec![
                    Span::raw("    "),
                    Span::styled(d.as_str(), Style::default().fg(Color::DarkGray)),
                ]));
            }
        }

        lines.push(Line::from("")); // spacer before buttons

        // Button strip
        let mut button_spans: Vec<Span> = vec![Span::raw("  ")];
        for (i, choice) in CHOICES.iter().enumerate() {
            let selected = i == self.cursor;
            let style = if selected {
                Style::default()
                    .fg(Color::Black)
                    .bg(Color::Yellow)
                    .add_modifier(Modifier::BOLD)
            } else {
                Style::default().fg(Color::White)
            };
            let label = format!("[{}]", choice.label());
            button_spans.push(Span::styled(label, style));
            button_spans.push(Span::raw("  "));
        }
        lines.push(Line::from(button_spans));

        // Hint line
        lines.push(Line::from(vec![Span::styled(
            "  \u{2190}/\u{2192} move   Enter confirm   Esc = No",
            Style::default().fg(Color::DarkGray),
        )]));

        let para = Paragraph::new(lines);
        frame.render_widget(para, inner);
    }

    /// Text-only render used when ratatui frame is unavailable (REPL / tests).
    pub fn render_text(&self) -> String {
        if !self.visible {
            return String::new();
        }

        let mut out = String::new();
        out.push_str("┌─ Tool Approval ─────────────────────────────────────────────────────────────┐\n");
        out.push_str(&format!("│  {:<76} │\n", &self.prompt));

        for d in &self.detail {
            out.push_str(&format!("│    {:<74} │\n", d));
        }

        out.push_str("│                                                                              │\n");

        let mut buttons = String::from("│  ");
        for (i, choice) in CHOICES.iter().enumerate() {
            if i == self.cursor {
                buttons.push_str(&format!("[{}]", choice.label().trim()));
            } else {
                buttons.push_str(&format!(" {}  ", choice.label().trim()));
            }
            buttons.push_str("  ");
        }
        out.push_str(&format!("{:<78} │\n", buttons));
        out.push_str("│  ←/→ move   Enter confirm   Esc = No                                        │\n");
        out.push_str("└──────────────────────────────────────────────────────────────────────────────┘\n");
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
        match key {
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
            KeyAction::Enter => {
                let choice = CHOICES[self.cursor];
                self.result = Some(choice);
                self.visible = false;
                ViewAction::Submit(self.cursor)
            }
            KeyAction::Esc => {
                // Esc = No (deny this one call, don't stop the loop)
                self.result = Some(ApprovalChoice::No);
                self.visible = false;
                ViewAction::Close
            }
            // y/n/a/d shortcuts
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

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tui::widgets::interactive::{KeyAction, ViewAction};

    fn open_overlay() -> ApprovalOverlayState {
        let mut s = ApprovalOverlayState::default();
        s.open(
            "Allow write_file to modify:",
            vec!["src/main.rs  (+42 / -3 lines)".to_string()],
        );
        s
    }

    #[test]
    fn default_state_is_invisible_and_unresolved() {
        let s = ApprovalOverlayState::default();
        assert!(!s.visible);
        assert!(s.result.is_none());
        assert!(!s.is_done());
        assert!(!s.is_resolved());
    }

    #[test]
    fn open_sets_visible_and_defaults_to_yes() {
        let s = open_overlay();
        assert!(s.visible);
        assert_eq!(s.cursor, 0); // Yes
        assert!(s.result.is_none());
        assert!(!s.is_done());
    }

    #[test]
    fn right_arrow_advances_cursor() {
        let mut s = open_overlay();
        assert_eq!(s.handle_key(KeyAction::Right), ViewAction::Continue);
        assert_eq!(s.cursor, 1); // No
        assert_eq!(s.handle_key(KeyAction::Right), ViewAction::Continue);
        assert_eq!(s.cursor, 2); // Always Allow
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
        s.handle_key(KeyAction::Left);
        assert_eq!(s.cursor, 0);
    }

    #[test]
    fn tab_wraps_around() {
        let mut s = open_overlay();
        for _ in 0..CHOICES.len() {
            s.handle_key(KeyAction::Tab);
        }
        assert_eq!(s.cursor, 0); // back to start
    }

    #[test]
    fn enter_submits_current_choice() {
        let mut s = open_overlay();
        s.handle_key(KeyAction::Right); // move to No
        let action = s.handle_key(KeyAction::Enter);
        assert_eq!(action, ViewAction::Submit(1));
        assert_eq!(s.result, Some(ApprovalChoice::No));
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
        s.handle_key(KeyAction::Right); // move cursor away from Yes first
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
        assert_eq!(action, ViewAction::Submit(2));
        assert_eq!(s.result, Some(ApprovalChoice::AlwaysAllow));
    }

    #[test]
    fn d_shortcut_resolves_deny_all() {
        let mut s = open_overlay();
        let action = s.handle_key(KeyAction::Char('d'));
        assert_eq!(action, ViewAction::Submit(3));
        assert_eq!(s.result, Some(ApprovalChoice::DenyAll));
    }

    #[test]
    fn uppercase_shortcuts_work() {
        for (key, expected) in [
            (KeyAction::Char('Y'), ApprovalChoice::Yes),
            (KeyAction::Char('N'), ApprovalChoice::No),
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
        assert!(text.contains("Always Allow"));
        assert!(text.contains("Deny All"));
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
        s.handle_key(KeyAction::Char('l'));
        assert_eq!(s.cursor, 1);
        s.handle_key(KeyAction::Char('h'));
        assert_eq!(s.cursor, 0);
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
