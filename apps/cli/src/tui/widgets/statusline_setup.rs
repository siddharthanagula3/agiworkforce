//! `StatusLineSetupView` — multi-checkbox overlay for configuring statusline items.
//!
//! Items: model, tokens, cost, branch, mode. Space toggles; Enter saves; Esc cancels.

#![allow(dead_code)]

use super::interactive::{InteractiveView, KeyAction, SelectionState, ViewAction};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StatusLineConfig {
    pub show_model: bool,
    pub show_tokens: bool,
    pub show_cost: bool,
    pub show_branch: bool,
    pub show_mode: bool,
}

impl Default for StatusLineConfig {
    fn default() -> Self {
        Self {
            show_model: true,
            show_tokens: true,
            show_cost: false,
            show_branch: true,
            show_mode: true,
        }
    }
}

const ITEM_LABELS: &[&str] = &["model", "tokens", "cost", "branch", "mode"];

pub struct StatusLineSetupView {
    pub config: StatusLineConfig,
    state: SelectionState,
    done: bool,
    saved: bool,
}

impl StatusLineSetupView {
    pub fn new(config: StatusLineConfig) -> Self {
        Self {
            state: SelectionState::new(ITEM_LABELS.len()),
            config,
            done: false,
            saved: false,
        }
    }

    pub fn was_saved(&self) -> bool {
        self.saved
    }

    fn item_enabled(&self, idx: usize) -> bool {
        match idx {
            0 => self.config.show_model,
            1 => self.config.show_tokens,
            2 => self.config.show_cost,
            3 => self.config.show_branch,
            4 => self.config.show_mode,
            _ => false,
        }
    }

    fn toggle(&mut self, idx: usize) {
        match idx {
            0 => self.config.show_model = !self.config.show_model,
            1 => self.config.show_tokens = !self.config.show_tokens,
            2 => self.config.show_cost = !self.config.show_cost,
            3 => self.config.show_branch = !self.config.show_branch,
            4 => self.config.show_mode = !self.config.show_mode,
            _ => {}
        }
    }
}

impl InteractiveView for StatusLineSetupView {
    fn render(&self) -> String {
        let mut out =
            String::from("┌─ Statusline Setup ────────────────────────────────────────┐\n");
        for (i, label) in ITEM_LABELS.iter().enumerate() {
            let cursor = if i == self.state.cursor() { "❯" } else { " " };
            let check = if self.item_enabled(i) { "[x]" } else { "[ ]" };
            let row = format!("{check} {label}");
            out.push_str(&format!("│ {cursor} {row:<58}│\n"));
        }
        out.push_str("│                                                            │\n");
        out.push_str("│  ↑↓ navigate   Space toggle   Enter save   Esc cancel      │\n");
        out.push_str("└────────────────────────────────────────────────────────────┘\n");
        out
    }

    fn handle_key(&mut self, key: KeyAction) -> ViewAction {
        match key {
            KeyAction::Char(' ') => {
                let idx = self.state.cursor();
                self.toggle(idx);
                ViewAction::Continue
            }
            KeyAction::Enter => {
                self.saved = true;
                self.done = true;
                ViewAction::Submit(self.state.cursor())
            }
            KeyAction::Esc => {
                self.done = true;
                ViewAction::Close
            }
            other => self.state.handle_list_key(other).unwrap_or(ViewAction::Continue),
        }
    }

    fn is_done(&self) -> bool {
        self.done
    }

    fn title(&self) -> Option<&str> {
        Some("Statusline Setup")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_view() -> StatusLineSetupView {
        StatusLineSetupView::new(StatusLineConfig::default())
    }

    #[test]
    fn default_config_has_expected_toggles() {
        let v = make_view();
        assert!(v.config.show_model);
        assert!(v.config.show_tokens);
        assert!(!v.config.show_cost);
        assert!(v.config.show_branch);
        assert!(v.config.show_mode);
    }

    #[test]
    fn space_toggles_highlighted_item() {
        let mut v = make_view();
        // cursor at model (enabled)
        v.handle_key(KeyAction::Char(' '));
        assert!(!v.config.show_model);
        v.handle_key(KeyAction::Char(' '));
        assert!(v.config.show_model);
    }

    #[test]
    fn navigate_then_toggle_cost() {
        let mut v = make_view();
        v.handle_key(KeyAction::Down);
        v.handle_key(KeyAction::Down); // cost (idx 2)
        v.handle_key(KeyAction::Char(' '));
        assert!(v.config.show_cost);
    }

    #[test]
    fn enter_saves_and_signals_done() {
        let mut v = make_view();
        let action = v.handle_key(KeyAction::Enter);
        assert!(matches!(action, ViewAction::Submit(_)));
        assert!(v.is_done());
        assert!(v.was_saved());
    }

    #[test]
    fn esc_closes_without_saving() {
        let mut v = make_view();
        let action = v.handle_key(KeyAction::Esc);
        assert_eq!(action, ViewAction::Close);
        assert!(v.is_done());
        assert!(!v.was_saved());
    }

    #[test]
    fn render_shows_all_items() {
        let v = make_view();
        let text = v.render();
        for label in ITEM_LABELS {
            assert!(text.contains(label), "missing '{label}' in render");
        }
    }

    #[test]
    fn cursor_does_not_exceed_item_count() {
        let mut v = make_view();
        for _ in 0..20 {
            v.handle_key(KeyAction::Down);
        }
        assert!(v.state.cursor() < ITEM_LABELS.len());
    }
}
