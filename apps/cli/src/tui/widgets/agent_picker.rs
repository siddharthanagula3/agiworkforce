//! Interactive agent picker overlay for the AGI Workforce TUI.
//!
//! Triggered by `/agents` (no arg). Layout:
//!
//! ```text
//! ┌─ Agents  2 agent(s) ──────────────────────────────────────────────────────┐
//! │/ type to filter agents...                                                 │
//! │───────────────────────────────────────────────────────────────────────────│
//! │   researcher          Search and synthesize technical material… [project]│
//! │ ❯ planner             Plan and break down complex tasks        [global] │
//! │───────────────────────────────────────────────────────────────────────────│
//! │ model: default   tools: all                                               │
//! └───────────────────────────────────────────────────────────────────────────┘
//! ```

use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Clear, List, ListItem, Paragraph};

use crate::agents::AgentDefinition;
use crate::tui::pad_to_cols;
use crate::tui::terminal_palette::{ui_accent, ui_muted, ui_on_light};

// ---------------------------------------------------------------------------
// Public state
// ---------------------------------------------------------------------------

/// All mutable state owned by the host `TuiApp`.
#[derive(Default)]
pub struct AgentPickerState {
    /// True while the overlay is visible.
    pub visible: bool,
    /// Current search text (filters name and description).
    pub search: String,
    /// Cursor index into `filtered` list.
    pub cursor: usize,
    /// Whether the search input has keyboard focus.
    pub search_focused: bool,
    /// All discovered agents (loaded on `open()`).
    agents: Vec<AgentDefinition>,
    /// Filtered view (rebuilt on every search change).
    filtered: Vec<usize>,
}

impl AgentPickerState {
    /// Open the picker, loading agents from disk.
    pub fn open(&mut self) {
        self.visible = true;
        self.search.clear();
        self.search_focused = false;
        self.cursor = 0;
        self.agents = crate::agents::discover_agents();
        self.rebuild_filtered();
    }

    /// Close and reset.
    pub fn close(&mut self) {
        self.visible = false;
        self.search.clear();
        self.search_focused = false;
    }

    /// Rebuild `filtered` from search text.
    fn rebuild_filtered(&mut self) {
        let q = self.search.to_lowercase();
        self.filtered = self
            .agents
            .iter()
            .enumerate()
            .filter(|(_, a)| {
                q.is_empty()
                    || a.name.to_lowercase().contains(&q)
                    || a.description.to_lowercase().contains(&q)
            })
            .map(|(i, _)| i)
            .collect();

        // Clamp cursor
        if !self.filtered.is_empty() && self.cursor >= self.filtered.len() {
            self.cursor = self.filtered.len() - 1;
        }
        if self.filtered.is_empty() {
            self.cursor = 0;
        }
    }

    fn move_up(&mut self) {
        if self.cursor > 0 {
            self.cursor -= 1;
        }
    }

    fn move_down(&mut self) {
        if !self.filtered.is_empty() && self.cursor + 1 < self.filtered.len() {
            self.cursor += 1;
        }
    }

    /// Return the agent under the cursor, if any.
    pub fn selected_agent(&self) -> Option<&AgentDefinition> {
        self.filtered
            .get(self.cursor)
            .and_then(|&i| self.agents.get(i))
    }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/// Render the agent picker overlay into `frame`.
pub fn render(frame: &mut ratatui::Frame, area: Rect, state: &AgentPickerState) {
    if !state.visible {
        return;
    }

    // ── overlay size ──────────────────────────────────────────────────────────
    let list_rows = (state.filtered.len() as u16).clamp(3, 12);
    let popup_height = (3 + list_rows + 3).min(area.height.saturating_sub(2));
    let popup_width = 80.min(area.width.saturating_sub(4));

    let popup_area = Rect {
        x: area.x + (area.width.saturating_sub(popup_width)) / 2,
        y: area.y + area.height.saturating_sub(popup_height).saturating_sub(1),
        width: popup_width,
        height: popup_height,
    };

    frame.render_widget(Clear, popup_area);

    // ── outer border ──────────────────────────────────────────────────────────
    let agent_count = state.agents.len();
    let badge = format!(" {agent_count} agent(s) ");
    let hint = " Agents ";
    let title_line = Line::from(vec![
        Span::styled(hint, Style::default().add_modifier(Modifier::BOLD)),
        Span::styled(
            badge,
            Style::default().fg(ui_muted()).add_modifier(Modifier::DIM),
        ),
    ]);
    let outer_block = Block::default()
        .borders(Borders::ALL)
        .border_style(Style::default().fg(ui_muted()))
        .title(title_line);
    frame.render_widget(outer_block, popup_area);

    // ── inner layout ─────────────────────────────────────────────────────────
    let inner = Rect {
        x: popup_area.x + 1,
        y: popup_area.y + 1,
        width: popup_area.width.saturating_sub(2),
        height: popup_area.height.saturating_sub(2),
    };

    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints(vec![
            Constraint::Length(1), // search bar
            Constraint::Length(1), // separator
            Constraint::Min(2),    // agent list
            Constraint::Length(1), // separator
            Constraint::Length(1), // detail row
        ])
        .split(inner);

    render_search(frame, chunks[0], state);
    render_divider(frame, chunks[1], inner.width);
    render_list(frame, chunks[2], state);
    render_divider(frame, chunks[3], inner.width);
    render_detail(frame, chunks[4], state);
}

fn render_search(frame: &mut ratatui::Frame, area: Rect, state: &AgentPickerState) {
    let prompt_style = if state.search_focused {
        Style::default()
            .fg(ui_accent())
            .add_modifier(Modifier::BOLD)
    } else {
        Style::default().fg(ui_muted())
    };

    let prompt = Span::styled("/ ", prompt_style);
    let text = if state.search.is_empty() {
        Span::styled(
            "type to filter agents...",
            Style::default()
                .fg(ui_muted())
                .add_modifier(Modifier::ITALIC),
        )
    } else {
        Span::styled(state.search.clone(), Style::default())
    };
    frame.render_widget(Paragraph::new(Line::from(vec![prompt, text])), area);
}

fn render_divider(frame: &mut ratatui::Frame, area: Rect, width: u16) {
    let line = "\u{2500}".repeat(width as usize);
    frame.render_widget(
        Paragraph::new(Line::from(Span::styled(
            line,
            Style::default().fg(ui_muted()),
        ))),
        area,
    );
}

fn render_list(frame: &mut ratatui::Frame, area: Rect, state: &AgentPickerState) {
    if state.filtered.is_empty() {
        let msg = if state.agents.is_empty() {
            "No agents found. Create one with: /agents create <name>"
        } else {
            "No agents match filter."
        };
        frame.render_widget(
            Paragraph::new(Span::styled(msg, Style::default().fg(ui_muted()))),
            area,
        );
        return;
    }

    let visible = area.height as usize;
    let scroll = if state.cursor >= visible {
        state.cursor - visible + 1
    } else {
        0
    };

    let items: Vec<ListItem> = state
        .filtered
        .iter()
        .enumerate()
        .skip(scroll)
        .take(visible)
        .filter_map(|(i, &agent_idx)| state.agents.get(agent_idx).map(|a| (i, a)))
        .map(|(i, agent)| {
            let is_cursor = i == state.cursor;
            let cursor_marker = if is_cursor { "\u{276f}" } else { " " };
            let scope = agent_scope_label(agent);
            let desc = if agent.description.is_empty() {
                "(no description)"
            } else {
                agent.description.as_str()
            };

            let name_col = 18usize;
            let scope_col = 9usize;
            let desc_budget = (area.width as usize).saturating_sub(name_col + scope_col + 7);
            let name_short = pad_to_cols(&agent.name, name_col);
            let desc_short = pad_to_cols(desc, desc_budget);

            let text = format!(
                " {} {}  {}  [{}]",
                cursor_marker, name_short, desc_short, scope,
            );

            let style = if is_cursor {
                Style::default()
                    .fg(ui_on_light())
                    .bg(ui_accent())
                    .add_modifier(Modifier::BOLD)
            } else {
                Style::default()
            };

            ListItem::new(text).style(style)
        })
        .collect();

    frame.render_widget(List::new(items), area);
}

fn render_detail(frame: &mut ratatui::Frame, area: Rect, state: &AgentPickerState) {
    if let Some(agent) = state.selected_agent() {
        let model = agent.model.as_deref().unwrap_or("default");
        let tools = agent
            .tools
            .as_ref()
            .map(|t| {
                if t.is_empty() {
                    "all".to_string()
                } else {
                    t.join(", ")
                }
            })
            .unwrap_or_else(|| "all".to_string());
        let max_turns = agent
            .max_turns
            .map(|n| format!("  max_turns: {n}"))
            .unwrap_or_default();
        let line = format!(" model: {}   tools: {}{}", model, tools, max_turns);
        frame.render_widget(
            Paragraph::new(Span::styled(line, Style::default().fg(ui_muted()))),
            area,
        );
    } else {
        frame.render_widget(
            Paragraph::new(Span::styled(
                " (no agent selected)",
                Style::default().fg(ui_muted()),
            )),
            area,
        );
    }
}

fn agent_scope_label(agent: &AgentDefinition) -> &'static str {
    crate::agents::agent_scope_label(agent)
}

// ---------------------------------------------------------------------------
// Key handling
// ---------------------------------------------------------------------------

/// What the host `TuiApp` should do after a key is handled.
pub enum AgentPickerAction {
    /// Keep the picker open.
    Nothing,
    /// Close without selecting.
    Close,
    /// User confirmed selection — host should invoke the agent.
    Invoke(String),
}

/// Handle a crossterm `KeyEvent` while the picker is open.
pub fn handle_key(
    state: &mut AgentPickerState,
    key: crossterm::event::KeyEvent,
) -> AgentPickerAction {
    use crossterm::event::KeyCode;

    match key.code {
        KeyCode::Esc => {
            state.close();
            AgentPickerAction::Close
        }

        KeyCode::Char('/') if !state.search_focused => {
            state.search_focused = true;
            AgentPickerAction::Nothing
        }

        KeyCode::Up => {
            state.search_focused = false;
            state.move_up();
            AgentPickerAction::Nothing
        }

        KeyCode::Down => {
            state.search_focused = false;
            state.move_down();
            AgentPickerAction::Nothing
        }

        KeyCode::Enter => {
            if let Some(agent) = state.selected_agent() {
                let name = agent.name.clone();
                state.close();
                AgentPickerAction::Invoke(name)
            } else {
                AgentPickerAction::Nothing
            }
        }

        KeyCode::Char(c) if state.search_focused => {
            state.search.push(c);
            state.rebuild_filtered();
            AgentPickerAction::Nothing
        }

        KeyCode::Backspace if state.search_focused => {
            state.search.pop();
            state.rebuild_filtered();
            AgentPickerAction::Nothing
        }

        _ => AgentPickerAction::Nothing,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agents::AgentDefinition;
    use ratatui::backend::TestBackend;
    use ratatui::layout::Rect;
    use ratatui::Terminal;
    use std::path::PathBuf;

    fn make_agent(name: &str, description: &str) -> AgentDefinition {
        AgentDefinition {
            name: name.to_string(),
            description: description.to_string(),
            model: None,
            tools: None,
            disallowed_tools: None,
            max_turns: None,
            permission_mode: None,
            system_prompt: "Body.".to_string(),
            path: PathBuf::from(format!("/tmp/.agiworkforce/agents/{name}.md")),
        }
    }

    fn picker_with_agents(agents: Vec<AgentDefinition>) -> AgentPickerState {
        let mut s = AgentPickerState {
            visible: true,
            agents,
            ..AgentPickerState::default()
        };
        s.rebuild_filtered();
        s
    }

    fn draw_picker(state: &AgentPickerState, width: u16, height: u16) -> Terminal<TestBackend> {
        let mut terminal = Terminal::new(TestBackend::new(width, height)).expect("terminal");
        let area = Rect::new(0, 0, width, height);
        terminal.draw(|f| render(f, area, state)).expect("draw");
        terminal
    }

    #[test]
    fn picker_default_is_not_visible() {
        let s = AgentPickerState::default();
        assert!(!s.visible);
        assert!(s.agents.is_empty());
    }

    #[test]
    fn picker_filters_by_name() {
        let agents = vec![
            make_agent("researcher", "deep research"),
            make_agent("coder", "write code"),
        ];
        let mut s = picker_with_agents(agents);
        assert_eq!(s.filtered.len(), 2);

        s.search = "cod".to_string();
        s.rebuild_filtered();
        assert_eq!(s.filtered.len(), 1);
        assert_eq!(s.selected_agent().map(|a| a.name.as_str()), Some("coder"));
    }

    #[test]
    fn render_agent_picker_snapshot() {
        let agents = vec![
            make_agent(
                "researcher",
                "Search and synthesize technical material with citations",
            ),
            make_agent(
                "long-agent-name-with-unicode-Δ",
                "Review implementation details, edge cases, and visual regressions",
            ),
        ];
        let mut state = picker_with_agents(agents);
        state.cursor = 1;

        let terminal = draw_picker(&state, 84, 18);
        insta::assert_snapshot!("agent_picker_overlay_baseline", terminal.backend());
    }

    #[test]
    fn picker_filters_by_description() {
        let agents = vec![
            make_agent("a1", "write tests"),
            make_agent("a2", "review code"),
        ];
        let mut s = picker_with_agents(agents);
        s.search = "review".to_string();
        s.rebuild_filtered();
        assert_eq!(s.filtered.len(), 1);
        assert_eq!(s.selected_agent().map(|a| a.name.as_str()), Some("a2"));
    }

    #[test]
    fn picker_cursor_navigation() {
        let agents = vec![
            make_agent("a", "alpha"),
            make_agent("b", "beta"),
            make_agent("c", "gamma"),
        ];
        let mut s = picker_with_agents(agents);
        assert_eq!(s.cursor, 0);
        s.move_down();
        assert_eq!(s.cursor, 1);
        s.move_down();
        assert_eq!(s.cursor, 2);
        s.move_down(); // at end, no-op
        assert_eq!(s.cursor, 2);
        s.move_up();
        assert_eq!(s.cursor, 1);
        s.move_up();
        assert_eq!(s.cursor, 0);
        s.move_up(); // at start, no-op
        assert_eq!(s.cursor, 0);
    }

    #[test]
    fn picker_selected_agent_returns_correct() {
        let agents = vec![make_agent("first", "desc"), make_agent("second", "desc2")];
        let mut s = picker_with_agents(agents);
        assert_eq!(s.selected_agent().map(|a| a.name.as_str()), Some("first"));
        s.move_down();
        assert_eq!(s.selected_agent().map(|a| a.name.as_str()), Some("second"));
    }

    #[test]
    fn picker_empty_selected_is_none() {
        let s = AgentPickerState::default();
        assert!(s.selected_agent().is_none());
    }

    #[test]
    fn picker_cursor_clamped_after_search_narrows() {
        let agents = vec![
            make_agent("alpha", ""),
            make_agent("beta", ""),
            make_agent("gamma", ""),
        ];
        let mut s = picker_with_agents(agents);
        s.cursor = 2;
        s.search = "alp".to_string();
        s.rebuild_filtered();
        // Only "alpha" matches; cursor must be 0
        assert_eq!(s.cursor, 0);
    }

    #[test]
    fn handle_key_esc_closes_picker() {
        use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
        let agents = vec![make_agent("x", "test")];
        let mut s = picker_with_agents(agents);
        let action = handle_key(&mut s, KeyEvent::new(KeyCode::Esc, KeyModifiers::NONE));
        assert!(!s.visible);
        assert!(matches!(action, AgentPickerAction::Close));
    }

    #[test]
    fn handle_key_enter_invokes_selected() {
        use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
        let agents = vec![make_agent("planner", "plan tasks")];
        let mut s = picker_with_agents(agents);
        let action = handle_key(&mut s, KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE));
        assert!(!s.visible);
        assert!(matches!(action, AgentPickerAction::Invoke(ref n) if n == "planner"));
    }

    #[test]
    fn handle_key_search_typing() {
        use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
        let agents = vec![make_agent("alpha", ""), make_agent("beta", "")];
        let mut s = picker_with_agents(agents);
        // Open search
        handle_key(
            &mut s,
            KeyEvent::new(KeyCode::Char('/'), KeyModifiers::NONE),
        );
        assert!(s.search_focused);
        handle_key(
            &mut s,
            KeyEvent::new(KeyCode::Char('b'), KeyModifiers::NONE),
        );
        handle_key(
            &mut s,
            KeyEvent::new(KeyCode::Char('e'), KeyModifiers::NONE),
        );
        assert_eq!(s.search, "be");
        assert_eq!(s.filtered.len(), 1);
        // Backspace
        handle_key(
            &mut s,
            KeyEvent::new(KeyCode::Backspace, KeyModifiers::NONE),
        );
        assert_eq!(s.search, "b");
    }
}
