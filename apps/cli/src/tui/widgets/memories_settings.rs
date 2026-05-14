//! `MemoriesSettingsView` — overlay for configuring the auto-memory system.
//!
//! Three settings: Auto-memory toggle, decay threshold, and max facts cap.
//! Each item is a (label, value) pair; Enter toggles boolean fields and cycles
//! numeric presets. Esc closes without saving; Enter on a boolean item saves
//! immediately (stateless — the caller reads `settings()` on Submit).

#![allow(dead_code)]

use super::interactive::{InteractiveView, KeyAction, SelectionState, ViewAction};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MemorySettings {
    pub auto_memory: bool,
    /// Days before a memory fact is considered stale and eligible for decay.
    pub decay_threshold_days: u32,
    /// Hard cap on the number of stored facts.
    pub max_facts: u32,
}

impl Default for MemorySettings {
    fn default() -> Self {
        Self {
            auto_memory: true,
            decay_threshold_days: 30,
            max_facts: 500,
        }
    }
}

const DECAY_PRESETS: &[u32] = &[7, 14, 30, 60, 90];
const MAX_FACTS_PRESETS: &[u32] = &[100, 250, 500, 1000, 2000];

pub struct MemoriesSettingsView {
    pub settings: MemorySettings,
    state: SelectionState,
    done: bool,
    saved: bool,
}

impl MemoriesSettingsView {
    pub fn new(settings: MemorySettings) -> Self {
        Self {
            state: SelectionState::new(3),
            settings,
            done: false,
            saved: false,
        }
    }

    pub fn was_saved(&self) -> bool {
        self.saved
    }

    fn toggle_current(&mut self) {
        match self.state.cursor() {
            0 => self.settings.auto_memory = !self.settings.auto_memory,
            1 => {
                let pos = DECAY_PRESETS
                    .iter()
                    .position(|&v| v == self.settings.decay_threshold_days)
                    .unwrap_or(2);
                self.settings.decay_threshold_days = DECAY_PRESETS[(pos + 1) % DECAY_PRESETS.len()];
            }
            2 => {
                let pos = MAX_FACTS_PRESETS
                    .iter()
                    .position(|&v| v == self.settings.max_facts)
                    .unwrap_or(2);
                self.settings.max_facts = MAX_FACTS_PRESETS[(pos + 1) % MAX_FACTS_PRESETS.len()];
            }
            _ => {}
        }
    }

    fn item_text(&self, idx: usize) -> String {
        match idx {
            0 => {
                let val = if self.settings.auto_memory { "ON " } else { "OFF" };
                format!("Auto-memory                          [{val}]")
            }
            1 => format!(
                "Decay threshold                      [{} days]",
                self.settings.decay_threshold_days
            ),
            2 => format!(
                "Max facts                            [{} facts]",
                self.settings.max_facts
            ),
            _ => String::new(),
        }
    }
}

impl InteractiveView for MemoriesSettingsView {
    fn render(&self) -> String {
        let mut out =
            String::from("┌─ Memory Settings ─────────────────────────────────────────┐\n");
        for i in 0..3 {
            let cursor = if i == self.state.cursor() { "❯" } else { " " };
            let text = self.item_text(i);
            out.push_str(&format!("│ {cursor} {text:<58}│\n"));
        }
        out.push_str("│                                                            │\n");
        out.push_str("│  ↑↓ navigate   Enter toggle/cycle   Esc cancel             │\n");
        out.push_str("└────────────────────────────────────────────────────────────┘\n");
        out
    }

    fn handle_key(&mut self, key: KeyAction) -> ViewAction {
        match key {
            KeyAction::Enter => {
                self.toggle_current();
                ViewAction::Continue
            }
            KeyAction::Char('s') | KeyAction::Char('S') => {
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
        Some("Memory Settings")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_view() -> MemoriesSettingsView {
        MemoriesSettingsView::new(MemorySettings::default())
    }

    #[test]
    fn default_settings_have_expected_values() {
        let v = make_view();
        assert!(v.settings.auto_memory);
        assert_eq!(v.settings.decay_threshold_days, 30);
        assert_eq!(v.settings.max_facts, 500);
        assert!(!v.is_done());
    }

    #[test]
    fn enter_toggles_auto_memory() {
        let mut v = make_view();
        // cursor starts at row 0 (auto-memory)
        v.handle_key(KeyAction::Enter);
        assert!(!v.settings.auto_memory);
        v.handle_key(KeyAction::Enter);
        assert!(v.settings.auto_memory);
    }

    #[test]
    fn enter_cycles_decay_threshold() {
        let mut v = make_view();
        v.handle_key(KeyAction::Down); // move to row 1
        v.handle_key(KeyAction::Enter); // cycles 30 → 60
        assert_eq!(v.settings.decay_threshold_days, 60);
    }

    #[test]
    fn enter_cycles_max_facts() {
        let mut v = make_view();
        v.handle_key(KeyAction::Down);
        v.handle_key(KeyAction::Down); // row 2
        v.handle_key(KeyAction::Enter); // cycles 500 → 1000
        assert_eq!(v.settings.max_facts, 1000);
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
    fn s_key_saves_and_submits() {
        let mut v = make_view();
        let action = v.handle_key(KeyAction::Char('s'));
        assert!(matches!(action, ViewAction::Submit(_)));
        assert!(v.is_done());
        assert!(v.was_saved());
    }

    #[test]
    fn render_shows_current_values() {
        let v = make_view();
        let text = v.render();
        assert!(text.contains("Memory Settings"));
        assert!(text.contains("ON"));
        assert!(text.contains("30 days"));
        assert!(text.contains("500 facts"));
    }

    #[test]
    fn navigation_moves_cursor() {
        let mut v = make_view();
        v.handle_key(KeyAction::Down);
        assert_eq!(v.state.cursor(), 1);
        v.handle_key(KeyAction::Up);
        assert_eq!(v.state.cursor(), 0);
    }
}
