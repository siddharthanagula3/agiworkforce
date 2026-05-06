//! Standalone `/effort` picker overlay for the AGI Workforce TUI.
//!
//! Triggered by `/effort` (no arg) or programmatically. Layout:
//!
//! ```text
//! ┌─ Set Effort (↑↓ navigate  Enter select  Esc close) ──────────────┐
//! │                                                                    │
//! │  ● Low     Minimal thinking. Fastest response. (~4K tokens)       │
//! │    Medium  Balanced thinking. Default.         (~16K tokens)      │
//! │    High    Extended thinking. More accurate.   (~32K tokens)      │
//! │    Max     Maximum thinking. Best accuracy.    (~64K tokens)      │
//! │                                                                    │
//! └────────────────────────────────────────────────────────────────────┘
//! ```

use ratatui::layout::Rect;
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Clear, List, ListItem};

use crate::design_system::Effort;

// ---------------------------------------------------------------------------
// Public state
// ---------------------------------------------------------------------------

/// All mutable state owned by the host `TuiApp`.
pub struct EffortPickerState {
    /// True while the overlay is visible.
    pub visible: bool,
    /// Cursor into `Effort::ALL`.
    pub cursor: usize,
    /// Currently applied effort (shown with bullet).
    pub current: Effort,
}

impl Default for EffortPickerState {
    fn default() -> Self {
        Self {
            visible: false,
            cursor: 1, // Medium
            current: Effort::Medium,
        }
    }
}

impl EffortPickerState {
    /// Open the picker, pre-selecting the currently active effort.
    pub fn open(&mut self, current: Effort) {
        self.visible = true;
        self.current = current;
        self.cursor = Effort::ALL
            .iter()
            .position(|&e| e == current)
            .unwrap_or(1);
    }

    pub fn close(&mut self) {
        self.visible = false;
    }

    /// Move cursor up (wraps).
    pub fn cursor_up(&mut self) {
        if self.cursor == 0 {
            self.cursor = Effort::ALL.len() - 1;
        } else {
            self.cursor -= 1;
        }
    }

    /// Move cursor down (wraps).
    pub fn cursor_down(&mut self) {
        self.cursor = (self.cursor + 1) % Effort::ALL.len();
    }

    /// Return the effort under the cursor.
    pub fn selected(&self) -> Effort {
        Effort::ALL
            .get(self.cursor)
            .copied()
            .unwrap_or(Effort::Medium)
    }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PickerAction {
    Nothing,
    Close,
    /// User confirmed a selection.
    Select(Effort),
}

/// Handle a key event while the effort picker is open.
pub fn handle_key(
    state: &mut EffortPickerState,
    key: crossterm::event::KeyEvent,
) -> PickerAction {
    use crossterm::event::KeyCode;
    match key.code {
        KeyCode::Esc => {
            state.close();
            PickerAction::Close
        }
        KeyCode::Up | KeyCode::Char('k') => {
            state.cursor_up();
            PickerAction::Nothing
        }
        KeyCode::Down | KeyCode::Char('j') => {
            state.cursor_down();
            PickerAction::Nothing
        }
        KeyCode::Enter => {
            let effort = state.selected();
            state.close();
            PickerAction::Select(effort)
        }
        _ => PickerAction::Nothing,
    }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

static EFFORT_DESCRIPTIONS: &[&str] = &[
    "Minimal thinking. Fastest response.",
    "Balanced thinking. Default.",
    "Extended thinking. More accurate.",
    "Maximum thinking. Best accuracy.",
];

/// Render the effort picker overlay into `frame`.
///
/// `area` is the parent chat area; the picker is a small centred floating
/// overlay.
pub fn render(
    frame: &mut ratatui::Frame,
    area: Rect,
    state: &EffortPickerState,
) {
    if !state.visible {
        return;
    }

    let popup_height: u16 = 8; // border(2) + blank(1) + rows(4) + blank(1)
    let popup_width: u16 = 66.min(area.width.saturating_sub(4));

    let popup_area = Rect {
        x: area.x + (area.width.saturating_sub(popup_width)) / 2,
        y: area.y + area.height.saturating_sub(popup_height).saturating_sub(1),
        width: popup_width,
        height: popup_height,
    };

    frame.render_widget(Clear, popup_area);

    let block = Block::default()
        .borders(Borders::ALL)
        .border_style(Style::default().fg(Color::Cyan))
        .title(" Set Effort  (↑↓ navigate  Enter select  Esc close) ");
    frame.render_widget(block, popup_area);

    let inner = Rect {
        x: popup_area.x + 2,
        y: popup_area.y + 2, // top blank line
        width: popup_area.width.saturating_sub(4),
        height: Effort::ALL.len() as u16,
    };

    let items: Vec<ListItem> = Effort::ALL
        .iter()
        .enumerate()
        .map(|(i, &effort)| {
            let is_cursor = i == state.cursor;
            let is_active = effort == state.current;

            let bullet = if is_active { "●" } else { " " };
            let budget = effort.anthropic_budget_tokens();
            let budget_str = if budget >= 1_000 {
                format!("~{}K tokens", budget / 1_000)
            } else {
                format!("~{} tokens", budget)
            };
            let desc = EFFORT_DESCRIPTIONS.get(i).copied().unwrap_or("");
            let label = format!(
                "{}  {:<8}  {:<38}  ({})",
                bullet,
                effort.label(),
                desc,
                budget_str,
            );

            let style = if is_cursor {
                Style::default()
                    .fg(Color::Black)
                    .bg(Color::Cyan)
                    .add_modifier(Modifier::BOLD)
            } else if is_active {
                Style::default()
                    .fg(Color::Cyan)
                    .add_modifier(Modifier::BOLD)
            } else {
                Style::default().fg(Color::White)
            };

            ListItem::new(Line::from(Span::styled(label, style)))
        })
        .collect();

    frame.render_widget(List::new(items), inner);
}
