//! `CommandPopup` — fuzzy slash-command picker overlay.
//!
//! Char keys append to an inline filter; Backspace removes the last char;
//! ↑↓ navigate the filtered set; Enter submits the canonical slash command name.
//! The render shows `/name — description` rows with `❯ ` bolding the cursor row.

#![allow(dead_code)]

use super::interactive::{InteractiveView, KeyAction, SelectionState, ViewAction};

#[derive(Debug, Clone)]
pub struct RegistryCommand {
    /// Canonical slash name, e.g. `"plan"` (rendered as `/plan`).
    pub name: String,
    pub description: String,
}

impl RegistryCommand {
    pub fn new(name: impl Into<String>, description: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            description: description.into(),
        }
    }
}

pub struct CommandPopup {
    pub all: Vec<RegistryCommand>,
    pub filter: String,
    state: SelectionState,
    done: bool,
    /// The canonical slash name chosen by the user.
    pub selected_command: Option<String>,
}

impl CommandPopup {
    pub fn new(commands: Vec<RegistryCommand>) -> Self {
        let len = commands.len();
        Self {
            all: commands,
            filter: String::new(),
            state: SelectionState::new(len),
            done: false,
            selected_command: None,
        }
    }

    fn filtered(&self) -> Vec<&RegistryCommand> {
        if self.filter.is_empty() {
            self.all.iter().collect()
        } else {
            let q = self.filter.to_lowercase();
            self.all
                .iter()
                .filter(|c| {
                    c.name.to_lowercase().contains(&q)
                        || c.description.to_lowercase().contains(&q)
                })
                .collect()
        }
    }

    fn sync_state_len(&mut self) {
        let len = self.filtered().len();
        self.state.set_len(len);
    }
}

impl InteractiveView for CommandPopup {
    fn render(&self) -> String {
        let mut out = String::from("┌─ Commands ─────────────────────────────────────────────────┐\n");
        let filter_line = format!("  /{}", self.filter);
        out.push_str(&format!("│ {filter_line:<59}│\n"));
        out.push_str("│ ──────────────────────────────────────────────────────────  │\n");

        let items = self.filtered();
        if items.is_empty() {
            out.push_str("│  (no matching commands)                                    │\n");
        } else {
            for (i, cmd) in items.iter().enumerate() {
                let cursor = if i == self.state.cursor() { "❯ " } else { "  " };
                let row = format!("{cursor}/{} — {}", cmd.name, cmd.description);
                out.push_str(&format!("│ {row:<59}│\n"));
            }
        }

        out.push_str("│                                                            │\n");
        out.push_str("│  Type to filter   ↑↓ navigate   Enter select   Esc cancel  │\n");
        out.push_str("└────────────────────────────────────────────────────────────┘\n");
        out
    }

    fn handle_key(&mut self, key: KeyAction) -> ViewAction {
        match key {
            KeyAction::Char(c) if c != ' ' => {
                self.filter.push(c);
                self.sync_state_len();
                ViewAction::Continue
            }
            KeyAction::Backspace => {
                self.filter.pop();
                self.sync_state_len();
                ViewAction::Continue
            }
            KeyAction::Enter => {
                let items = self.filtered();
                if let Some(cmd) = items.get(self.state.cursor()) {
                    self.selected_command = Some(cmd.name.clone());
                    self.done = true;
                    ViewAction::Submit(self.state.cursor())
                } else {
                    ViewAction::Continue
                }
            }
            KeyAction::Esc => {
                self.done = true;
                ViewAction::Close
            }
            other => {
                // Only forward navigation keys; ignore others
                match other {
                    KeyAction::Up | KeyAction::Down | KeyAction::PageUp | KeyAction::PageDown
                    | KeyAction::Home | KeyAction::End => {
                        self.state.handle_list_key(other).unwrap_or(ViewAction::Continue)
                    }
                    _ => ViewAction::Continue,
                }
            }
        }
    }

    fn is_done(&self) -> bool {
        self.done
    }

    fn title(&self) -> Option<&str> {
        Some("Commands")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_popup() -> CommandPopup {
        CommandPopup::new(vec![
            RegistryCommand::new("plan", "Enter plan mode"),
            RegistryCommand::new("exec", "Execute a command"),
            RegistryCommand::new("memory", "Manage memories"),
            RegistryCommand::new("help", "Show help"),
        ])
    }

    #[test]
    fn empty_filter_shows_all_commands() {
        let popup = make_popup();
        assert_eq!(popup.filtered().len(), 4);
        let text = popup.render();
        assert!(text.contains("/plan"));
        assert!(text.contains("/exec"));
    }

    #[test]
    fn typing_narrows_filter() {
        let mut popup = make_popup();
        // "pla" uniquely matches "plan"
        popup.handle_key(KeyAction::Char('p'));
        popup.handle_key(KeyAction::Char('l'));
        popup.handle_key(KeyAction::Char('a'));
        let filtered = popup.filtered();
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].name, "plan");
    }

    #[test]
    fn backspace_removes_last_char() {
        let mut popup = make_popup();
        // "pla" → 1 result; backspace gives "pl" → still 1 result ("plan")
        popup.handle_key(KeyAction::Char('p'));
        popup.handle_key(KeyAction::Char('l'));
        popup.handle_key(KeyAction::Char('a'));
        popup.handle_key(KeyAction::Backspace);
        assert_eq!(popup.filter, "pl");
        // "pl" only matches "plan"
        assert_eq!(popup.filtered().len(), 1);
    }

    #[test]
    fn enter_submits_selected_command() {
        let mut popup = make_popup();
        popup.handle_key(KeyAction::Down); // move to "exec"
        let action = popup.handle_key(KeyAction::Enter);
        assert!(matches!(action, ViewAction::Submit(_)));
        assert_eq!(popup.selected_command.as_deref(), Some("exec"));
        assert!(popup.is_done());
    }

    #[test]
    fn esc_closes_without_selection() {
        let mut popup = make_popup();
        let action = popup.handle_key(KeyAction::Esc);
        assert_eq!(action, ViewAction::Close);
        assert!(popup.is_done());
        assert!(popup.selected_command.is_none());
    }

    #[test]
    fn enter_on_empty_filter_result_is_noop() {
        let mut popup = make_popup();
        popup.handle_key(KeyAction::Char('z')); // no match
        let action = popup.handle_key(KeyAction::Enter);
        assert_eq!(action, ViewAction::Continue);
        assert!(!popup.is_done());
    }

    #[test]
    fn cursor_resets_when_filter_shrinks_result_set() {
        let mut popup = make_popup();
        for _ in 0..3 {
            popup.handle_key(KeyAction::Down);
        }
        assert_eq!(popup.state.cursor(), 3);
        // narrow filter so only 1 result — cursor should clamp
        popup.handle_key(KeyAction::Char('h')); // "help"
        assert!(popup.state.cursor() < popup.filtered().len());
    }

    #[test]
    fn render_shows_cursor_marker_on_selected_row() {
        let popup = make_popup();
        let text = popup.render();
        assert!(text.contains("❯ /plan"), "expected cursor on first item");
    }
}
