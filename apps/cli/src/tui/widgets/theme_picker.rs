//! Standalone `/theme` picker overlay for the AGI Workforce TUI.
//!
//! Triggered by `/theme` (no arg). Layout:
//!
//! ```text
//! ┌─ Select Theme (↑↓ navigate  Enter select  Esc close) ────────────────┐
//! │                                                                        │
//! │  ● Dark              Neutral dark background                           │
//! │    Light             Light background for bright terminals             │
//! │    Ansi              Pure 16-color ANSI compatible                     │
//! │    Solarized Dark    Solarized palette, dark variant                   │
//! │    Solarized Light   Solarized palette, light variant                  │
//! │    Colorblind        High-contrast deuteranopia-friendly               │
//! │                                                                        │
//! │  Preview:                                                              │
//! │    fn hello() -> &'static str {                                        │
//! │        "world"  // returns a greeting                                  │
//! │    }                                                                   │
//! └────────────────────────────────────────────────────────────────────────┘
//! ```

use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Clear, List, ListItem, Paragraph};

// ---------------------------------------------------------------------------
// Theme definitions
// ---------------------------------------------------------------------------

/// The six canonical themes exposed by the picker.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ThemeChoice {
    Dark,
    Light,
    Ansi,
    SolarizedDark,
    SolarizedLight,
    Colorblind,
}

impl ThemeChoice {
    pub const ALL: &'static [ThemeChoice] = &[
        ThemeChoice::Dark,
        ThemeChoice::Light,
        ThemeChoice::Ansi,
        ThemeChoice::SolarizedDark,
        ThemeChoice::SolarizedLight,
        ThemeChoice::Colorblind,
    ];

    /// Short display name.
    pub fn label(self) -> &'static str {
        match self {
            ThemeChoice::Dark => "Dark",
            ThemeChoice::Light => "Light",
            ThemeChoice::Ansi => "Ansi",
            ThemeChoice::SolarizedDark => "Solarized Dark",
            ThemeChoice::SolarizedLight => "Solarized Light",
            ThemeChoice::Colorblind => "Colorblind",
        }
    }

    /// One-line description shown in the picker.
    pub fn description(self) -> &'static str {
        match self {
            ThemeChoice::Dark => "Neutral dark background",
            ThemeChoice::Light => "Light background for bright terminals",
            ThemeChoice::Ansi => "Pure 16-color ANSI compatible",
            ThemeChoice::SolarizedDark => "Solarized palette, dark variant",
            ThemeChoice::SolarizedLight => "Solarized palette, light variant",
            ThemeChoice::Colorblind => "High-contrast deuteranopia-friendly",
        }
    }

    /// Parse from a case-insensitive string (used by `/theme <name>` direct-set).
    pub fn from_arg(s: &str) -> Option<ThemeChoice> {
        match s.to_lowercase().as_str() {
            "dark" => Some(ThemeChoice::Dark),
            "light" => Some(ThemeChoice::Light),
            "ansi" => Some(ThemeChoice::Ansi),
            "solarized-dark" | "solarized_dark" | "solarizeddark" => {
                Some(ThemeChoice::SolarizedDark)
            }
            "solarized-light" | "solarized_light" | "solarizedlight" => {
                Some(ThemeChoice::SolarizedLight)
            }
            "colorblind" | "colour-blind" | "color-blind" => Some(ThemeChoice::Colorblind),
            _ => None,
        }
    }

    /// Accent color used by the picker row highlight for this theme.
    fn accent(self) -> Color {
        match self {
            ThemeChoice::Dark => Color::Blue,
            ThemeChoice::Light => Color::Yellow,
            ThemeChoice::Ansi => Color::White,
            ThemeChoice::SolarizedDark => Color::Cyan,
            ThemeChoice::SolarizedLight => Color::Green,
            ThemeChoice::Colorblind => Color::Magenta,
        }
    }
}

// ---------------------------------------------------------------------------
// Public state
// ---------------------------------------------------------------------------

/// All mutable state owned by the host `TuiApp`.
pub struct ThemePickerState {
    /// True while the overlay is visible.
    pub visible: bool,
    /// Cursor into `ThemeChoice::ALL`.
    pub cursor: usize,
    /// Currently applied theme (shown with bullet).
    pub current: ThemeChoice,
}

impl Default for ThemePickerState {
    fn default() -> Self {
        Self {
            visible: false,
            cursor: 0,
            current: ThemeChoice::Dark,
        }
    }
}

impl ThemePickerState {
    /// Open the picker, pre-selecting `current`.
    pub fn open(&mut self, current: ThemeChoice) {
        self.visible = true;
        self.current = current;
        self.cursor = ThemeChoice::ALL
            .iter()
            .position(|&t| t == current)
            .unwrap_or(0);
    }

    pub fn close(&mut self) {
        self.visible = false;
    }

    pub fn cursor_up(&mut self) {
        if self.cursor == 0 {
            self.cursor = ThemeChoice::ALL.len() - 1;
        } else {
            self.cursor -= 1;
        }
    }

    pub fn cursor_down(&mut self) {
        self.cursor = (self.cursor + 1) % ThemeChoice::ALL.len();
    }

    pub fn selected(&self) -> ThemeChoice {
        ThemeChoice::ALL
            .get(self.cursor)
            .copied()
            .unwrap_or(ThemeChoice::Dark)
    }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PickerAction {
    Nothing,
    Close,
    /// User confirmed a theme selection.
    Select(ThemeChoice),
}

/// Handle a key event while the theme picker is open.
pub fn handle_key(
    state: &mut ThemePickerState,
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
            let choice = state.selected();
            state.close();
            PickerAction::Select(choice)
        }
        _ => PickerAction::Nothing,
    }
}

// ---------------------------------------------------------------------------
// Code preview lines (static, language-agnostic Rust snippet)
// ---------------------------------------------------------------------------

static PREVIEW_LINES: &[&str] = &[
    "  fn hello() -> &'static str {",
    r#"      "world"  // returns a greeting"#,
    "  }",
];

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/// Render the theme picker overlay into `frame`.
///
/// `area` is the parent chat area; the picker is a centred floating overlay.
pub fn render(frame: &mut ratatui::Frame, area: Rect, state: &ThemePickerState) {
    if !state.visible {
        return;
    }

    // border(2) + blank(1) + rows(6) + blank(1) + "Preview:" label(1) + code(3) + blank(1)
    let popup_height: u16 = 15;
    let popup_width: u16 = 72.min(area.width.saturating_sub(4));

    let popup_area = Rect {
        x: area.x + (area.width.saturating_sub(popup_width)) / 2,
        y: area.y + area.height.saturating_sub(popup_height).saturating_sub(1),
        width: popup_width,
        height: popup_height,
    };

    frame.render_widget(Clear, popup_area);

    let block = Block::default()
        .borders(Borders::ALL)
        .border_style(Style::default().fg(Color::Magenta))
        .title(" Select Theme  (↑↓ navigate  Enter select  Esc close) ");
    frame.render_widget(block, popup_area);

    let inner = Rect {
        x: popup_area.x + 1,
        y: popup_area.y + 1,
        width: popup_area.width.saturating_sub(2),
        height: popup_area.height.saturating_sub(2),
    };

    // Layout: blank | rows | blank | preview-label | code-lines | blank
    let constraints = [
        Constraint::Length(1), // top blank
        Constraint::Length(ThemeChoice::ALL.len() as u16), // 6 theme rows
        Constraint::Length(1), // blank
        Constraint::Length(1), // "Preview:" label
        Constraint::Length(PREVIEW_LINES.len() as u16), // 3 code lines
        Constraint::Min(0),    // remainder
    ];
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints(constraints)
        .split(inner);

    // ── theme list ───────────────────────────────────────────────────────────
    let items: Vec<ListItem> = ThemeChoice::ALL
        .iter()
        .enumerate()
        .map(|(i, &choice)| {
            let is_cursor = i == state.cursor;
            let is_active = choice == state.current;

            let bullet = if is_active { "●" } else { " " };
            let label = format!(
                "{}  {:<16}  {}",
                bullet,
                choice.label(),
                choice.description(),
            );

            let style = if is_cursor {
                Style::default()
                    .fg(Color::Black)
                    .bg(choice.accent())
                    .add_modifier(Modifier::BOLD)
            } else if is_active {
                Style::default()
                    .fg(choice.accent())
                    .add_modifier(Modifier::BOLD)
            } else {
                Style::default().fg(Color::White)
            };

            ListItem::new(Line::from(Span::styled(label, style)))
        })
        .collect();

    frame.render_widget(List::new(items), chunks[1]);

    // ── preview label ─────────────────────────────────────────────────────────
    let current_choice = state.selected();
    let preview_header = Line::from(vec![
        Span::styled("  Preview: ", Style::default().fg(Color::DarkGray)),
        Span::styled(
            current_choice.label(),
            Style::default()
                .fg(current_choice.accent())
                .add_modifier(Modifier::BOLD),
        ),
    ]);
    frame.render_widget(Paragraph::new(preview_header), chunks[3]);

    // ── code preview block ────────────────────────────────────────────────────
    // Color the lines using the accent of the currently-highlighted theme.
    let accent = current_choice.accent();
    let code_lines: Vec<Line> = PREVIEW_LINES
        .iter()
        .map(|&l| Line::from(Span::styled(l, Style::default().fg(accent))))
        .collect();

    frame.render_widget(
        Paragraph::new(code_lines),
        chunks[4],
    );
}
