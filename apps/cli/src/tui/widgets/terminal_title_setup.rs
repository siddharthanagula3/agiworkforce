//! `TerminalTitleSetupView` — multi-checkbox overlay for terminal title content.
//!
//! Items: session-id, model, cwd, branch. Space toggles; Enter saves; Esc cancels.

#![allow(dead_code)]

use super::interactive::{InteractiveView, KeyAction, SelectionState, ViewAction};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TerminalTitleConfig {
    pub show_session_id: bool,
    pub show_model: bool,
    pub show_cwd: bool,
    pub show_branch: bool,
}

impl Default for TerminalTitleConfig {
    fn default() -> Self {
        Self {
            show_session_id: false,
            show_model: true,
            show_cwd: true,
            show_branch: true,
        }
    }
}

const ITEM_LABELS: &[&str] = &["session-id", "model", "cwd", "branch"];

pub struct TerminalTitleSetupView {
    pub config: TerminalTitleConfig,
    state: SelectionState,
    done: bool,
    saved: bool,
}

impl TerminalTitleSetupView {
    pub fn new(config: TerminalTitleConfig) -> Self {
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
            0 => self.config.show_session_id,
            1 => self.config.show_model,
            2 => self.config.show_cwd,
            3 => self.config.show_branch,
            _ => false,
        }
    }

    fn toggle(&mut self, idx: usize) {
        match idx {
            0 => self.config.show_session_id = !self.config.show_session_id,
            1 => self.config.show_model = !self.config.show_model,
            2 => self.config.show_cwd = !self.config.show_cwd,
            3 => self.config.show_branch = !self.config.show_branch,
            _ => {}
        }
    }
}

impl InteractiveView for TerminalTitleSetupView {
    fn render(&self) -> String {
        let mut out =
            String::from("┌─ Terminal Title Setup ─────────────────────────────────────┐\n");
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
        Some("Terminal Title Setup")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_view() -> TerminalTitleSetupView {
        TerminalTitleSetupView::new(TerminalTitleConfig::default())
    }

    #[test]
    fn default_config_shows_expected_items() {
        let v = make_view();
        assert!(!v.config.show_session_id);
        assert!(v.config.show_model);
        assert!(v.config.show_cwd);
        assert!(v.config.show_branch);
    }

    #[test]
    fn space_toggles_session_id() {
        let mut v = make_view();
        // cursor at 0 (session-id)
        v.handle_key(KeyAction::Char(' '));
        assert!(v.config.show_session_id);
        v.handle_key(KeyAction::Char(' '));
        assert!(!v.config.show_session_id);
    }

    #[test]
    fn navigate_and_toggle_model() {
        let mut v = make_view();
        v.handle_key(KeyAction::Down); // model (idx 1, enabled)
        v.handle_key(KeyAction::Char(' '));
        assert!(!v.config.show_model);
    }

    #[test]
    fn enter_saves_and_closes() {
        let mut v = make_view();
        let action = v.handle_key(KeyAction::Enter);
        assert!(matches!(action, ViewAction::Submit(_)));
        assert!(v.is_done());
        assert!(v.was_saved());
    }

    #[test]
    fn esc_discards_and_closes() {
        let mut v = make_view();
        let action = v.handle_key(KeyAction::Esc);
        assert_eq!(action, ViewAction::Close);
        assert!(v.is_done());
        assert!(!v.was_saved());
    }

    #[test]
    fn render_contains_all_labels() {
        let v = make_view();
        let text = v.render();
        for label in ITEM_LABELS {
            assert!(text.contains(label), "missing '{label}' in render");
        }
    }

    #[test]
    fn cursor_bounded_at_last_item() {
        let mut v = make_view();
        for _ in 0..20 {
            v.handle_key(KeyAction::Down);
        }
        assert_eq!(v.state.cursor(), ITEM_LABELS.len() - 1);
    }
}
