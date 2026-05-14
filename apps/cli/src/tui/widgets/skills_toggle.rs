//! `SkillsToggleView` — overlay for enabling/disabling discovered skills.
//!
//! Spacebar toggles the enabled flag on the highlighted skill. Enter saves the
//! current state and closes; Esc discards changes and closes. The caller reads
//! `enabled_skills()` after a Submit action.

#![allow(dead_code)]

use super::interactive::{InteractiveView, KeyAction, SelectionState, ViewAction};

#[derive(Debug, Clone)]
pub struct Skill {
    pub name: String,
    pub description: String,
    pub enabled: bool,
}

impl Skill {
    pub fn new(name: impl Into<String>, description: impl Into<String>, enabled: bool) -> Self {
        Self {
            name: name.into(),
            description: description.into(),
            enabled,
        }
    }
}

pub struct SkillsToggleView {
    pub skills: Vec<Skill>,
    state: SelectionState,
    done: bool,
    saved: bool,
}

impl SkillsToggleView {
    pub fn new(skills: Vec<Skill>) -> Self {
        let len = skills.len();
        Self {
            state: SelectionState::new(len),
            skills,
            done: false,
            saved: false,
        }
    }

    pub fn was_saved(&self) -> bool {
        self.saved
    }

    /// Names of all currently-enabled skills.
    pub fn enabled_skills(&self) -> Vec<&str> {
        self.skills
            .iter()
            .filter(|s| s.enabled)
            .map(|s| s.name.as_str())
            .collect()
    }

    fn toggle_current(&mut self) {
        if let Some(skill) = self.skills.get_mut(self.state.cursor()) {
            skill.enabled = !skill.enabled;
        }
    }
}

impl InteractiveView for SkillsToggleView {
    fn render(&self) -> String {
        let mut out =
            String::from("┌─ Skills ───────────────────────────────────────────────────┐\n");

        if self.skills.is_empty() {
            out.push_str("│  (no skills discovered)                                    │\n");
        } else {
            for (i, skill) in self.skills.iter().enumerate() {
                let cursor = if i == self.state.cursor() { "❯" } else { " " };
                let check = if skill.enabled { "[x]" } else { "[ ]" };
                let row = format!("{check} {}", skill.name);
                out.push_str(&format!("│ {cursor} {row:<58}│\n"));
            }
        }

        out.push_str("│                                                            │\n");
        out.push_str("│  ↑↓ navigate   Space toggle   Enter save   Esc cancel      │\n");
        out.push_str("└────────────────────────────────────────────────────────────┘\n");
        out
    }

    fn handle_key(&mut self, key: KeyAction) -> ViewAction {
        match key {
            KeyAction::Char(' ') => {
                self.toggle_current();
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
        Some("Skills")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_view() -> SkillsToggleView {
        SkillsToggleView::new(vec![
            Skill::new("web-search", "Search the web", true),
            Skill::new("code-review", "Review code changes", false),
            Skill::new("summarize", "Summarize documents", true),
        ])
    }

    #[test]
    fn empty_view_renders_placeholder() {
        let view = SkillsToggleView::new(vec![]);
        assert!(view.render().contains("(no skills discovered)"));
        assert!(view.enabled_skills().is_empty());
    }

    #[test]
    fn initial_state_reflects_input() {
        let view = make_view();
        let enabled = view.enabled_skills();
        assert!(enabled.contains(&"web-search"));
        assert!(enabled.contains(&"summarize"));
        assert!(!enabled.contains(&"code-review"));
    }

    #[test]
    fn space_toggles_current_skill() {
        let mut view = make_view();
        // cursor is at web-search (enabled)
        view.handle_key(KeyAction::Char(' '));
        assert!(!view.skills[0].enabled);
        view.handle_key(KeyAction::Char(' '));
        assert!(view.skills[0].enabled);
    }

    #[test]
    fn navigate_then_toggle() {
        let mut view = make_view();
        view.handle_key(KeyAction::Down); // code-review (disabled)
        view.handle_key(KeyAction::Char(' ')); // enable it
        assert!(view.skills[1].enabled);
    }

    #[test]
    fn enter_saves_and_closes() {
        let mut view = make_view();
        let action = view.handle_key(KeyAction::Enter);
        assert!(matches!(action, ViewAction::Submit(_)));
        assert!(view.is_done());
        assert!(view.was_saved());
    }

    #[test]
    fn esc_closes_without_saving() {
        let mut view = make_view();
        let action = view.handle_key(KeyAction::Esc);
        assert_eq!(action, ViewAction::Close);
        assert!(view.is_done());
        assert!(!view.was_saved());
    }

    #[test]
    fn render_shows_checkboxes() {
        let view = make_view();
        let text = view.render();
        assert!(text.contains("[x] web-search"));
        assert!(text.contains("[ ] code-review"));
    }

    #[test]
    fn up_key_does_not_go_below_zero() {
        let mut view = make_view();
        view.handle_key(KeyAction::Up);
        assert_eq!(view.state.cursor(), 0);
    }
}
