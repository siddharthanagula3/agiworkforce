//! Interactive model picker overlay for the AGI Workforce TUI.
//!
//! Triggered by `/model` (no arg). Layout:
//!
//! ```text
//! ┌─ Models  Local · BYOK · Cloud ────────────────────────────────────────────┐
//! │/ type to filter by name or provider...                                    │
//! │───────────────────────────────────────────────────────────────────────────│
//! │Bring your own key · your own provider keys                                │
//! │  Anthropic                                                                │
//! │  ● claude-sonnet                 Balanced      200K ctx                   │
//! │    claude-haiku                  Fastest       200K ctx                   │
//! │ Thinking: on · Effort: ◀ Medium ▶   Tab/←→                                │
//! └───────────────────────────────────────────────────────────────────────────┘
//! ```

use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Clear, List, ListItem, Paragraph};

use crate::design_system::{
    capability_for_model, capability_label, provider_display, AccessMode, Effort, ProviderId,
};
use crate::model_catalog::Model;
use crate::tui::terminal_palette::{ui_accent, ui_muted};

// ---------------------------------------------------------------------------
// Environment-gate stub (Phase A)
// ---------------------------------------------------------------------------

/// Returns true if the named environment is configured and available for use.
///
/// Phase A stub: always returns false — any model with `requires_environment`
/// set is hidden from the picker until the environment is live.
///
/// Phase B: replace this body with a real check against the E2B SDK connection
/// state (or local-runtime presence) passed through from the session context.
fn environment_available(_env: &str) -> bool {
    // Phase B: wire real env signal here.
    false
}

// ---------------------------------------------------------------------------
// Public state
// ---------------------------------------------------------------------------

/// One focusable item in the flat navigation list.
#[derive(Debug, Clone)]
pub enum PickerRow {
    /// Top-level access-mode section header (Local / BYOK / Cloud). This is the
    /// first thing a new user sees, surfacing the AGI value proposition.
    AccessModeHeader { mode: AccessMode },
    /// Provider sub-section header within an access mode.
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

        // Group by access mode (Local / BYOK / Cloud) first, then provider,
        // then models. An access mode with no matching models is skipped so the
        // picker never shows an empty section.
        for &mode in AccessMode::ORDER {
            let mut mode_rows: Vec<PickerRow> = Vec::new();

            for &pid in ProviderId::ALL {
                if pid.access_mode() != mode {
                    continue;
                }
                let disp = provider_display(pid);
                let matching: Vec<Model> = all_models
                    .iter()
                    .filter(|m| {
                        let catalog_pid = ProviderId::from_catalog_name(&m.provider);
                        if catalog_pid != Some(pid) {
                            return false;
                        }
                        // Phase A env-gate: skip models whose required environment
                        // is not yet available. All current models have None here,
                        // so this has zero effect on the current picker output.
                        // Phase B replaces environment_available() with a real signal.
                        if let Some(env) = &m.requires_environment {
                            if !environment_available(env) {
                                return false;
                            }
                        }
                        if query.is_empty() {
                            return true;
                        }
                        crate::tui::fuzzy::fuzzy_score(&query, &m.id).is_some()
                            || crate::tui::fuzzy::fuzzy_score(&query, disp.label).is_some()
                            || crate::tui::fuzzy::fuzzy_score(&query, &m.display_name).is_some()
                    })
                    .cloned()
                    .collect();

                if matching.is_empty() {
                    continue;
                }

                mode_rows.push(PickerRow::ProviderHeader { provider_id: pid });
                for m in matching {
                    mode_rows.push(PickerRow::ModelRow {
                        provider_id: pid,
                        model: m,
                    });
                }
            }

            if mode_rows.is_empty() {
                continue;
            }
            self.rows.push(PickerRow::AccessModeHeader { mode });
            self.rows.append(&mut mode_rows);
        }
    }

    /// Return only selectable (non-header) row indices.
    fn selectable_indices(&self) -> Vec<usize> {
        self.rows
            .iter()
            .enumerate()
            .filter_map(|(i, r)| match r {
                PickerRow::ModelRow { .. } => Some(i),
                _ => None,
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

    /// True when the effort/thinking selector should be shown: the highlighted
    /// MODEL must actually support reasoning (catalog `supports_reasoning`, from
    /// the SSOT `capabilities.thinking`) AND its provider must expose an effort
    /// knob. Gating on the provider alone wrongly showed the control for
    /// non-reasoning models such as claude-haiku-4-5.
    pub fn show_effort_bar(&self) -> bool {
        let model_reasons = self
            .selected_model()
            .is_some_and(|m| m.supports_reasoning);
        let provider_has_effort = self
            .selected_provider_id()
            .map(|pid| provider_display(pid).supports_effort)
            .unwrap_or(false);
        model_reasons && provider_has_effort
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
            self.cursor = self.selectable_indices().into_iter().next().unwrap_or(0);
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
    // Keep the title short. Long control hints clipped in 80-column terminals.
    let hint_span = Span::styled(" Models ", Style::default().add_modifier(Modifier::BOLD));
    let badge_span = Span::styled(
        " Local · BYOK · Cloud ",
        Style::default().fg(ui_muted()).add_modifier(Modifier::DIM),
    );
    let title_line = Line::from(vec![hint_span, badge_span]);
    let outer_block = Block::default()
        .borders(Borders::ALL)
        .border_style(Style::default().fg(ui_muted()))
        .title(title_line);
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
        Span::styled(
            "/ ",
            Style::default()
                .fg(ui_accent())
                .add_modifier(Modifier::BOLD),
        )
    } else {
        Span::styled(
            "/ ",
            Style::default().fg(ui_muted()).add_modifier(Modifier::DIM),
        )
    };

    let text_span = if state.search.is_empty() {
        Span::styled(
            "type to filter by name or provider...",
            Style::default()
                .fg(ui_muted())
                .add_modifier(Modifier::ITALIC),
        )
    } else {
        Span::styled(state.search.clone(), Style::default())
    };

    let line = Line::from(vec![prompt, text_span]);
    frame.render_widget(Paragraph::new(line), area);
}

fn render_divider(frame: &mut ratatui::Frame, area: Rect, width: u16) {
    let line = "─".repeat(width as usize);
    frame.render_widget(
        Paragraph::new(Line::from(Span::styled(
            line,
            Style::default().fg(ui_muted()),
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
            PickerRow::AccessModeHeader { mode } => {
                // Top-level section: the AGI value proposition, front and centre.
                let text = format!("{} · {}", mode.label(), mode.tagline());
                ListItem::new(text).style(
                    Style::default()
                        .fg(ui_accent())
                        .add_modifier(Modifier::BOLD),
                )
            }
            PickerRow::ProviderHeader { provider_id } => {
                let disp = provider_display(*provider_id);
                let text = format!("  {}", disp.label);
                ListItem::new(text).style(Style::default().add_modifier(Modifier::BOLD))
            }
            PickerRow::ModelRow { model, .. } => {
                let is_cursor = i == state.cursor;
                let is_current = model.id == current_model;

                let bullet = if is_current { "●" } else { " " };
                let tier = capability_for_model(&model.id);
                let tier_label = capability_label(tier);
                let ctx_k = model.context_window / 1000;

                let text = format_model_row(area.width, bullet, &model.id, tier_label, ctx_k);

                let style = if is_cursor {
                    Style::default()
                        .fg(ui_accent())
                        .add_modifier(Modifier::BOLD | Modifier::REVERSED)
                } else if is_current {
                    Style::default()
                        .fg(ui_accent())
                        .add_modifier(Modifier::BOLD)
                } else {
                    Style::default()
                };

                ListItem::new(text).style(style)
            }
        })
        .collect();

    frame.render_widget(List::new(items), area);
}

fn render_effort_bar(frame: &mut ratatui::Frame, area: Rect, state: &ModelPickerState) {
    let thinking_text = " Thinking: on · ";
    let effort_label = state.effort.label();
    let effort_text = format!("Effort: ◀ {} ▶   Tab/←→", effort_label);

    let line = Line::from(vec![
        Span::styled(
            thinking_text,
            Style::default()
                .fg(ui_muted())
                .add_modifier(Modifier::BOLD | Modifier::DIM),
        ),
        Span::styled(effort_text, Style::default().fg(ui_accent())),
    ]);

    frame.render_widget(Paragraph::new(line), area);
}

fn format_model_row(
    width: u16,
    bullet: &str,
    model_id: &str,
    tier_label: &str,
    ctx_k: usize,
) -> String {
    let row_width = width as usize;
    let prefix = format!("  {bullet} ");
    if row_width < 38 {
        return format!(
            "{}{}",
            prefix,
            truncate_chars(model_id, row_width.saturating_sub(prefix.chars().count()))
        );
    }

    // Local models discovered at runtime don't report a context window
    // (Ollama's /api/tags omits it), so show "—" instead of a bogus "0K ctx".
    let ctx_col = if ctx_k == 0 {
        format!("{:>9}", "—")
    } else {
        format!("{ctx_k:>4}K ctx")
    };
    let suffix = format!("  {tier_label:<12} {ctx_col}");
    let id_width = row_width
        .saturating_sub(prefix.chars().count() + suffix.chars().count())
        .clamp(12, 34);
    format!(
        "{}{:<id_width$}{}",
        prefix,
        truncate_chars(model_id, id_width),
        suffix,
        id_width = id_width
    )
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        return value.to_string();
    }
    if max_chars <= 1 {
        return "…".to_string();
    }
    let mut out: String = value.chars().take(max_chars - 1).collect();
    out.push('…');
    out
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
                    Some(PickerRow::AccessModeHeader { .. }) | None => None,
                };
                let next_pid = if let Some(cpid) = current_pid {
                    let pos = providers_in_rows
                        .iter()
                        .position(|p| *p == cpid)
                        .unwrap_or(0);
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn model(id: &str, provider: &str) -> Model {
        serde_json::from_str(&format!(
            "{{\"id\":\"{id}\",\"provider\":\"{provider}\",\"display_name\":\"{id}\",\"context_window\":8192,\"max_output_tokens\":4096,\"input_price_per_1m\":0.0,\"output_price_per_1m\":0.0,\"supports_tools\":true,\"supports_vision\":false,\"supports_reasoning\":false}}"
        ))
        .expect("model fixture")
    }

    fn mode_headers(state: &ModelPickerState) -> Vec<AccessMode> {
        state
            .rows
            .iter()
            .filter_map(|r| match r {
                PickerRow::AccessModeHeader { mode } => Some(*mode),
                _ => None,
            })
            .collect()
    }

    fn model_with_reasoning(id: &str, provider: &str, reasoning: bool) -> Model {
        serde_json::from_str(&format!(
            "{{\"id\":\"{id}\",\"provider\":\"{provider}\",\"display_name\":\"{id}\",\"context_window\":8192,\"max_output_tokens\":4096,\"input_price_per_1m\":0.0,\"output_price_per_1m\":0.0,\"supports_tools\":true,\"supports_vision\":false,\"supports_reasoning\":{reasoning}}}"
        ))
        .expect("model fixture")
    }

    #[test]
    fn effort_bar_depends_on_model_reasoning_not_just_provider() {
        // The Anthropic provider exposes an effort knob, but the bar must follow
        // the highlighted MODEL's reasoning capability: non-reasoning
        // claude-haiku-4-5 hides it, reasoning claude-sonnet-4-6 shows it.
        let models = vec![
            model_with_reasoning("claude-haiku-4-5", "anthropic", false),
            model_with_reasoning("claude-sonnet-4-6", "anthropic", true),
        ];
        let mut picker = ModelPickerState::default();
        picker.open(&models, "claude-haiku-4-5");
        assert!(
            !picker.show_effort_bar(),
            "non-reasoning haiku must not show the effort bar"
        );
        picker.open(&models, "claude-sonnet-4-6");
        assert!(
            picker.show_effort_bar(),
            "reasoning sonnet must show the effort bar"
        );
    }

    #[test]
    fn provider_access_modes_classify_correctly() {
        assert_eq!(ProviderId::Ollama.access_mode(), AccessMode::Local);
        assert_eq!(ProviderId::LMStudio.access_mode(), AccessMode::Local);
        assert_eq!(
            ProviderId::CustomOpenAICompatible.access_mode(),
            AccessMode::Local
        );
        assert_eq!(ProviderId::Anthropic.access_mode(), AccessMode::Byok);
        assert_eq!(ProviderId::OpenAI.access_mode(), AccessMode::Byok);
        assert_eq!(ProviderId::DeepSeek.access_mode(), AccessMode::Byok);
        assert_eq!(ProviderId::AGICloud.access_mode(), AccessMode::Cloud);
    }

    #[test]
    fn rebuild_lists_openrouter_models_under_byok() {
        // Mirrors the live path: catalog models + OpenRouter models (as
        // openrouter_models::load_cached_models() produces, provider="openrouter").
        let models = vec![
            model("claude-opus-4-8", "anthropic"),
            model("qwen/qwen3-max", "openrouter"),
            model("openai/gpt-4o-mini", "openrouter"),
        ];
        let mut state = ModelPickerState::default();
        state.rebuild_rows(&models);

        // OpenRouter is a BYOK provider — it must get its own provider section.
        let has_openrouter_header = state.rows.iter().any(|r| {
            matches!(r, PickerRow::ProviderHeader { provider_id } if *provider_id == ProviderId::OpenRouter)
        });
        assert!(
            has_openrouter_header,
            "picker should list an OpenRouter provider section under BYOK"
        );

        // ...with its models selectable.
        let openrouter_models: Vec<&str> = state
            .rows
            .iter()
            .filter_map(|r| match r {
                PickerRow::ModelRow {
                    provider_id: ProviderId::OpenRouter,
                    model,
                } => Some(model.id.as_str()),
                _ => None,
            })
            .collect();
        assert!(openrouter_models.contains(&"qwen/qwen3-max"));
        assert!(openrouter_models.contains(&"openai/gpt-4o-mini"));
    }

    #[test]
    fn rebuild_groups_by_access_mode_local_first() {
        let models = vec![
            model("claude-x", "anthropic"), // BYOK
            model("llama-3", "ollama"),     // Local
            model("agi-1", "agi-cloud"),    // Cloud
        ];
        let mut state = ModelPickerState::default();
        state.rebuild_rows(&models);

        assert_eq!(
            mode_headers(&state),
            vec![AccessMode::Local, AccessMode::Byok, AccessMode::Cloud]
        );
        assert!(matches!(
            state.rows.first(),
            Some(PickerRow::AccessModeHeader {
                mode: AccessMode::Local
            })
        ));
    }

    #[test]
    fn empty_access_mode_is_skipped() {
        let models = vec![model("claude-x", "anthropic")];
        let mut state = ModelPickerState::default();
        state.rebuild_rows(&models);
        assert_eq!(mode_headers(&state), vec![AccessMode::Byok]);
    }

    /// Build a model fixture with an explicit `requiresEnvironment` value.
    fn model_env_gated(id: &str, provider: &str, env: &str) -> Model {
        serde_json::from_str(&format!(
            "{{\"id\":\"{id}\",\"provider\":\"{provider}\",\"display_name\":\"{id}\",\
             \"context_window\":8192,\"max_output_tokens\":4096,\"input_price_per_1m\":0.0,\
             \"output_price_per_1m\":0.0,\"supports_tools\":true,\"supports_vision\":false,\
             \"supports_reasoning\":false,\"requiresEnvironment\":\"{env}\"}}"
        ))
        .expect("env-gated model fixture")
    }

    /// (a) Models with `requires_environment = None` are unaffected by the gate.
    ///     Existing catalog behavior: all models pass through rebuild_rows() unchanged.
    #[test]
    fn env_gate_none_models_unaffected() {
        let models = vec![
            model("claude-x", "anthropic"),
            model("gpt-y", "openai"),
        ];
        let mut state = ModelPickerState::default();
        state.rebuild_rows(&models);

        let model_ids: Vec<&str> = state
            .rows
            .iter()
            .filter_map(|r| match r {
                PickerRow::ModelRow { model, .. } => Some(model.id.as_str()),
                _ => None,
            })
            .collect();

        assert!(
            model_ids.contains(&"claude-x"),
            "None-gated model claude-x must appear in picker"
        );
        assert!(
            model_ids.contains(&"gpt-y"),
            "None-gated model gpt-y must appear in picker"
        );
    }

    /// (b) A model with `requires_environment = Some("e2b")` is filtered out
    ///     when `environment_available` returns false (Phase A stub).
    ///     A sibling model on the same provider without the gate must still appear.
    #[test]
    fn env_gate_e2b_model_filtered_when_unavailable() {
        let models = vec![
            model("claude-normal", "anthropic"),           // no env gate — must appear
            model_env_gated("claude-e2b", "anthropic", "e2b"), // e2b gate — must be hidden
        ];
        let mut state = ModelPickerState::default();
        state.rebuild_rows(&models);

        let model_ids: Vec<&str> = state
            .rows
            .iter()
            .filter_map(|r| match r {
                PickerRow::ModelRow { model, .. } => Some(model.id.as_str()),
                _ => None,
            })
            .collect();

        assert!(
            model_ids.contains(&"claude-normal"),
            "Ungated model claude-normal must appear in picker even when sibling is gated"
        );
        assert!(
            !model_ids.contains(&"claude-e2b"),
            "e2b-gated model claude-e2b must be hidden in Phase A (env unavailable)"
        );
    }

    #[test]
    fn headers_are_not_selectable_and_cursor_lands_on_models() {
        let models = vec![model("llama-3", "ollama"), model("claude-x", "anthropic")];
        let mut state = ModelPickerState::default();
        state.rebuild_rows(&models);

        for idx in state.selectable_indices() {
            assert!(matches!(state.rows[idx], PickerRow::ModelRow { .. }));
        }
        // Navigation skips both header kinds.
        state.cursor = state.selectable_indices()[0];
        state.cursor_down();
        assert!(matches!(
            state.rows[state.cursor],
            PickerRow::ModelRow { .. }
        ));
    }
}
