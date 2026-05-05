//! Interactive model picker overlay for the AGI Workforce TUI.
//!
//! Triggered by `/model` (no arg). Layout:
//!
//! ```text
//! ┌─ Select Model (/ search, ↑↓ navigate, Enter select, Esc close) ───────────┐
//! │ Search: █                                                                   │
//! ├─────────────────────────────────────────────────────────────────────────────┤
//! │ ▶ Anthropic                                                                 │
//! │   ● claude-opus-4-7            Most capable   200K ctx  $15/$75            │
//! │     claude-sonnet-4-6          Balanced        200K ctx  $3/$15            │
//! │     claude-haiku-4-5           Fastest         200K ctx  $0.25/$1.25       │
//! │                                                                             │
//! │   OpenAI                                                                    │
//! │     gpt-5.5                    Balanced        128K ctx  $10/$30           │
//! │     gpt-5.5-mini               Fastest         128K ctx  $1/$3             │
//! │  ...                                                                        │
//! │                                                                             │
//! │  [Thinking: ON] [Effort: Medium ◀▶]                                        │
//! └─────────────────────────────────────────────────────────────────────────────┘
//! ```

use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Clear, List, ListItem, Paragraph};

use crate::design_system::{
    capability_for_model, capability_label, provider_display, Effort, ProviderId,
};
use crate::model_catalog::Model;

// ---------------------------------------------------------------------------
// Public state
// ---------------------------------------------------------------------------

/// One focusable item in the flat navigation list.
#[derive(Debug, Clone)]
pub enum PickerRow {
    /// Provider section header (collapsible in future; expanded for MVP).
    ProviderHeader { provider_id: ProviderId },
    /// A selectable model row.
    ModelRow {
        provider_id: ProviderId,
        model: Model,
    },
}

/// All mutable state owned by the host `TuiApp`.
pub struct ModelPickerState {
    /// True while the overlay is visible.
    pub visible: bool,
    /// Current search text (filters both name and provider label).
    pub search: String,
    /// Flat cursor into `rows` (skips provider headers).
    pub cursor: usize,
    /// Whether the search input has keyboard focus (vs. model list).
    pub search_focused: bool,
    /// Effort selection for the currently highlighted model (only shown when
    /// provider `supports_effort == true`).
    pub effort: Effort,
    /// Computed rows; rebuilt on every search change.
    pub rows: Vec<PickerRow>,
}

impl Default for ModelPickerState {
    fn default() -> Self {
        Self {
            visible: false,
            search: String::new(),
            cursor: 0,
            search_focused: false,
            effort: Effort::Medium,
            rows: Vec::new(),
        }
    }
}

impl ModelPickerState {
    /// Rebuild `rows` from the catalog, filtered by `search`.
    pub fn rebuild_rows(&mut self, all_models: &[Model]) {
        let query = self.search.to_lowercase();
        self.rows.clear();

        for &pid in ProviderId::ALL {
            let disp = provider_display(pid);
            // Collect models matching this provider and search query.
            let matching: Vec<Model> = all_models
                .iter()
                .filter(|m| {
                    let catalog_pid = ProviderId::from_catalog_name(&m.provider);
                    let pid_match = catalog_pid == Some(pid);
                    if !pid_match {
                        return false;
                    }
                    if query.is_empty() {
                        return true;
                    }
                    m.id.to_lowercase().contains(&query)
                        || disp.label.to_lowercase().contains(&query)
                        || m.display_name.to_lowercase().contains(&query)
                })
                .cloned()
                .collect();

            if matching.is_empty() {
                continue;
            }

            self.rows.push(PickerRow::ProviderHeader { provider_id: pid });
            for m in matching {
                self.rows.push(PickerRow::ModelRow {
                    provider_id: pid,
                    model: m,
                });
            }
        }
    }

    /// Return only selectable (non-header) row indices.
    fn selectable_indices(&self) -> Vec<usize> {
        self.rows
            .iter()
            .enumerate()
            .filter_map(|(i, r)| match r {
                PickerRow::ModelRow { .. } => Some(i),
                PickerRow::ProviderHeader { .. } => None,
            })
            .collect()
    }

    /// Move cursor down (skipping headers).
    pub fn cursor_down(&mut self) {
        let sel = self.selectable_indices();
        if sel.is_empty() {
            return;
        }
        // Find next selectable index after current cursor.
        let next = sel
            .iter()
            .find(|&&idx| idx > self.cursor)
            .copied()
            .unwrap_or(sel[0]); // wrap to first
        self.cursor = next;
    }

    /// Move cursor up (skipping headers).
    pub fn cursor_up(&mut self) {
        let sel = self.selectable_indices();
        if sel.is_empty() {
            return;
        }
        let prev = sel
            .iter()
            .rev()
            .find(|&&idx| idx < self.cursor)
            .copied()
            .unwrap_or(*sel.last().unwrap()); // wrap to last
        self.cursor = prev;
    }

    /// Jump cursor to the first selectable row for a given provider.
    pub fn jump_to_provider(&mut self, pid: ProviderId) {
        if let Some(idx) = self.rows.iter().position(|r| match r {
            PickerRow::ModelRow { provider_id, .. } => *provider_id == pid,
            _ => false,
        }) {
            self.cursor = idx;
        }
    }

    /// Return the model under the cursor, if any.
    pub fn selected_model(&self) -> Option<&Model> {
        match self.rows.get(self.cursor) {
            Some(PickerRow::ModelRow { model, .. }) => Some(model),
            _ => {
                // Cursor on a header — return first model below it.
                self.rows[self.cursor..].iter().find_map(|r| match r {
                    PickerRow::ModelRow { model, .. } => Some(model),
                    _ => None,
                })
            }
        }
    }

    /// Provider of the currently highlighted model (for effort bar visibility).
    pub fn selected_provider_id(&self) -> Option<ProviderId> {
        match self.rows.get(self.cursor) {
            Some(PickerRow::ModelRow { provider_id, .. }) => Some(*provider_id),
            _ => None,
        }
    }

    /// True when the effort selector should be shown (provider supports effort
    /// and we are on a model row).
    pub fn show_effort_bar(&self) -> bool {
        self.selected_provider_id()
            .map(|pid| provider_display(pid).supports_effort)
            .unwrap_or(false)
    }

    /// Reset picker to initial state (keep search, reset cursor).
    pub fn open(&mut self, all_models: &[Model], current_model: &str) {
        self.visible = true;
        self.search.clear();
        self.search_focused = false;
        self.effort = Effort::Medium;
        self.rebuild_rows(all_models);
        // Pre-select the currently active model.
        if let Some(idx) = self.rows.iter().position(|r| match r {
            PickerRow::ModelRow { model, .. } => model.id == current_model,
            _ => false,
        }) {
            self.cursor = idx;
        } else {
            // Jump to first selectable.
            self.cursor = self
                .selectable_indices()
                .into_iter()
                .next()
                .unwrap_or(0);
        }
    }

    /// Close and reset.
    pub fn close(&mut self) {
        self.visible = false;
        self.search.clear();
        self.search_focused = false;
        self.rows.clear();
    }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/// Render the model picker overlay into `frame`.
///
/// `area` is the parent chat area; the picker is rendered as a centred
/// floating overlay.  `current_model` is used to show a bullet on the active
/// model row.
pub fn render(
    frame: &mut ratatui::Frame,
    area: Rect,
    state: &ModelPickerState,
    current_model: &str,
) {
    if !state.visible || state.rows.is_empty() {
        return;
    }

    // ── overlay size ──────────────────────────────────────────────────────────
    let effort_rows: u16 = if state.show_effort_bar() { 2 } else { 0 };
    let max_list_rows: u16 = 18.min(state.rows.len() as u16);
    let popup_height = (3 + max_list_rows + effort_rows).min(area.height.saturating_sub(2));
    let popup_width = 78.min(area.width.saturating_sub(4));

    let popup_area = Rect {
        x: area.x + (area.width.saturating_sub(popup_width)) / 2,
        y: area.y + area.height.saturating_sub(popup_height).saturating_sub(1),
        width: popup_width,
        height: popup_height,
    };

    frame.render_widget(Clear, popup_area);

    // ── outer border ──────────────────────────────────────────────────────────
    let outer_block = Block::default()
        .borders(Borders::ALL)
        .border_style(Style::default().fg(Color::Green))
        .title(" Select Model  (/ search  ↑↓ navigate  Tab jump-provider  Enter select  Esc close) ");
    frame.render_widget(outer_block, popup_area);

    // ── inner layout: search bar | list | effort bar ─────────────────────────
    let inner = Rect {
        x: popup_area.x + 1,
        y: popup_area.y + 1,
        width: popup_area.width.saturating_sub(2),
        height: popup_area.height.saturating_sub(2),
    };

    let mut constraints = vec![
        Constraint::Length(1), // search bar
        Constraint::Length(1), // separator line
        Constraint::Min(3),    // model list
    ];
    if state.show_effort_bar() {
        constraints.push(Constraint::Length(1)); // effort bar
    }

    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints(constraints)
        .split(inner);

    // Search bar
    render_search(frame, chunks[0], state);
    // Divider
    render_divider(frame, chunks[1], popup_area.width.saturating_sub(2));
    // Model list
    render_list(frame, chunks[2], state, current_model);
    // Effort bar (conditional)
    if state.show_effort_bar() {
        render_effort_bar(frame, chunks[3], state);
    }
}

fn render_search(frame: &mut ratatui::Frame, area: Rect, state: &ModelPickerState) {
    let prompt = if state.search_focused {
        Span::styled("/ ", Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD))
    } else {
        Span::styled("/ ", Style::default().fg(Color::DarkGray))
    };

    let text_span = if state.search.is_empty() {
        Span::styled(
            "type to filter by name or provider...",
            Style::default().fg(Color::DarkGray).add_modifier(Modifier::ITALIC),
        )
    } else {
        Span::styled(state.search.clone(), Style::default().fg(Color::White))
    };

    let line = Line::from(vec![prompt, text_span]);
    frame.render_widget(Paragraph::new(line), area);
}

fn render_divider(frame: &mut ratatui::Frame, area: Rect, width: u16) {
    let line = "─".repeat(width as usize);
    frame.render_widget(
        Paragraph::new(Line::from(Span::styled(
            line,
            Style::default().fg(Color::DarkGray),
        ))),
        area,
    );
}

fn render_list(
    frame: &mut ratatui::Frame,
    area: Rect,
    state: &ModelPickerState,
    current_model: &str,
) {
    let visible_rows = area.height as usize;

    // Compute scroll so the cursor row is always visible.
    let scroll_offset = if state.cursor >= visible_rows {
        state.cursor - visible_rows + 1
    } else {
        0
    };

    let items: Vec<ListItem> = state
        .rows
        .iter()
        .enumerate()
        .skip(scroll_offset)
        .take(visible_rows)
        .map(|(i, row)| match row {
            PickerRow::ProviderHeader { provider_id } => {
                let disp = provider_display(*provider_id);
                let local_tag = if disp.is_local { "  LOCAL" } else { "" };
                let text = format!(" {} {}", disp.label, local_tag);
                ListItem::new(text).style(
                    Style::default()
                        .fg(Color::Cyan)
                        .add_modifier(Modifier::BOLD),
                )
            }
            PickerRow::ModelRow { model, .. } => {
                let is_cursor = i == state.cursor;
                let is_current = model.id == current_model;

                let bullet = if is_current { "●" } else { " " };
                let tier = capability_for_model(&model.id);
                let tier_label = capability_label(tier);
                let ctx_k = model.context_window / 1000;

                let text = format!(
                    "  {} {:<30}  {:<12}  {:>4}K ctx",
                    bullet, model.id, tier_label, ctx_k,
                );

                let style = if is_cursor {
                    Style::default()
                        .fg(Color::Black)
                        .bg(Color::Green)
                        .add_modifier(Modifier::BOLD)
                } else if is_current {
                    Style::default()
                        .fg(Color::Green)
                        .add_modifier(Modifier::BOLD)
                } else {
                    Style::default().fg(Color::White)
                };

                ListItem::new(text).style(style)
            }
        })
        .collect();

    frame.render_widget(List::new(items), area);
}

fn render_effort_bar(frame: &mut ratatui::Frame, area: Rect, state: &ModelPickerState) {
    let thinking_text = " [Thinking: ON] ";
    let effort_label = state.effort.label();
    let effort_text = format!("[Effort: ◀ {} ▶]  Tab/←→ to change", effort_label);

    let line = Line::from(vec![
        Span::styled(
            thinking_text,
            Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD),
        ),
        Span::styled(
            effort_text,
            Style::default().fg(Color::Cyan),
        ),
    ]);

    frame.render_widget(Paragraph::new(line), area);
}

// ---------------------------------------------------------------------------
// Key handling (pure state transitions — no I/O)
// ---------------------------------------------------------------------------

/// What the host `TuiApp` should do after a key is handled.
pub enum PickerAction {
    /// Nothing to do.
    Nothing,
    /// Close the picker without selecting.
    Close,
    /// User confirmed a model selection.  Host should call `session.switch_model`.
    Select {
        model_id: String,
        effort: Option<Effort>,
        banner: String,
    },
    /// Re-focus search bar (returned when the host should handle cursor reset).
    #[allow(dead_code)]
    FocusSearch,
}

/// Handle a crossterm `KeyEvent` while the picker is open.
///
/// Returns the action the host should take.  State mutations happen here;
/// rebuilding `rows` is triggered when `search` changes.
pub fn handle_key(
    state: &mut ModelPickerState,
    key: crossterm::event::KeyEvent,
    all_models: &[Model],
) -> PickerAction {
    use crossterm::event::KeyCode;

    match key.code {
        KeyCode::Esc => {
            state.close();
            PickerAction::Close
        }

        // `/` re-focuses search.
        KeyCode::Char('/') if !state.search_focused => {
            state.search_focused = true;
            PickerAction::Nothing
        }

        // Tab cycles through provider sections.
        KeyCode::Tab => {
            let providers_in_rows: Vec<ProviderId> = state
                .rows
                .iter()
                .filter_map(|r| match r {
                    PickerRow::ProviderHeader { provider_id } => Some(*provider_id),
                    _ => None,
                })
                .collect();
            if !providers_in_rows.is_empty() {
                // Find which provider section the cursor is currently in.
                let current_pid = match state.rows.get(state.cursor) {
                    Some(PickerRow::ModelRow { provider_id, .. }) => Some(*provider_id),
                    Some(PickerRow::ProviderHeader { provider_id }) => Some(*provider_id),
                    None => None,
                };
                let next_pid = if let Some(cpid) = current_pid {
                    let pos = providers_in_rows.iter().position(|p| *p == cpid).unwrap_or(0);
                    providers_in_rows[(pos + 1) % providers_in_rows.len()]
                } else {
                    providers_in_rows[0]
                };
                state.jump_to_provider(next_pid);
            }
            PickerAction::Nothing
        }

        KeyCode::Up => {
            if state.search_focused {
                state.search_focused = false;
            }
            state.cursor_up();
            PickerAction::Nothing
        }

        KeyCode::Down => {
            if state.search_focused {
                state.search_focused = false;
            }
            state.cursor_down();
            PickerAction::Nothing
        }

        // Left/Right change effort level when provider supports it.
        KeyCode::Left if state.show_effort_bar() && !state.search_focused => {
            state.effort = state.effort.prev();
            PickerAction::Nothing
        }
        KeyCode::Right if state.show_effort_bar() && !state.search_focused => {
            state.effort = state.effort.next();
            PickerAction::Nothing
        }

        KeyCode::Enter => {
            if let Some(model) = state.selected_model() {
                let model_id = model.id.clone();
                let effort_opt = if state.show_effort_bar() {
                    Some(state.effort)
                } else {
                    None
                };

                let tier_label = capability_label(capability_for_model(&model_id));
                let effort_str = effort_opt
                    .map(|e| format!(", effort: {}", e.label().to_lowercase()))
                    .unwrap_or_default();
                let banner = format!("Model changed to {} ({tier_label}{effort_str})", model_id);

                state.close();
                PickerAction::Select {
                    model_id,
                    effort: effort_opt,
                    banner,
                }
            } else {
                PickerAction::Nothing
            }
        }

        // Search typing.
        KeyCode::Char(c) if state.search_focused => {
            state.search.push(c);
            state.rebuild_rows(all_models);
            // Keep cursor on a valid row after filter changes.
            if state.rows.is_empty() {
                state.cursor = 0;
            } else {
                let sel = state.selectable_indices();
                if !sel.is_empty() && !sel.contains(&state.cursor) {
                    state.cursor = sel[0];
                }
            }
            PickerAction::Nothing
        }

        KeyCode::Backspace if state.search_focused => {
            state.search.pop();
            state.rebuild_rows(all_models);
            let sel = state.selectable_indices();
            if !sel.is_empty() && !sel.contains(&state.cursor) {
                state.cursor = sel[0];
            }
            PickerAction::Nothing
        }

        _ => PickerAction::Nothing,
    }
}
