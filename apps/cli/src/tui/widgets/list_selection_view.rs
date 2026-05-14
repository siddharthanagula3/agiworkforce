//! Generic `ListSelectionView<T>` — reusable vertical-list base widget.
//!
//! Four of the overlay modules in this package (`memories_settings`,
//! `skills_toggle`, `statusline_setup`, `terminal_title_setup`) build on this
//! base rather than duplicating list semantics. The type parameter `T` must be
//! `Clone + Display` so that render can format items without additional context.
//!
//! Wiring into `tui_app.rs` is a follow-up milestone.

#![allow(dead_code)]

use std::fmt;

use super::interactive::{InteractiveView, KeyAction, SelectionState, ViewAction};

/// A generic vertical-list overlay that supports ↑↓ Enter Esc navigation.
pub struct ListSelectionView<T: Clone + fmt::Display> {
    pub items: Vec<T>,
    pub state: SelectionState,
    pub title: String,
    pub done: bool,
    pub last_selected: Option<usize>,
}

impl<T: Clone + fmt::Display + Send> ListSelectionView<T> {
    pub fn new(title: impl Into<String>, items: Vec<T>) -> Self {
        let len = items.len();
        Self {
            items,
            state: SelectionState::new(len),
            title: title.into(),
            done: false,
            last_selected: None,
        }
    }

    /// The currently highlighted item, if any.
    pub fn selected(&self) -> Option<&T> {
        if self.items.is_empty() {
            None
        } else {
            self.items.get(self.state.cursor())
        }
    }
}

impl<T: Clone + fmt::Display + Send> InteractiveView for ListSelectionView<T> {
    fn render(&self) -> String {
        let header = format!("─ {} ", self.title);
        let width = 60usize;
        let bar = "─".repeat(width.saturating_sub(header.chars().count()));
        let mut out = format!("┌{header}{bar}┐\n");

        if self.items.is_empty() {
            out.push_str("│  (no items)                                              │\n");
        } else {
            for (i, item) in self.items.iter().enumerate() {
                let cursor = if i == self.state.cursor() { "❯" } else { " " };
                let row = format!("{cursor} {item}");
                out.push_str(&format!("│  {row:<58}│\n"));
            }
        }

        out.push_str("│                                                            │\n");
        out.push_str("│  ↑↓ navigate   Enter select   Esc cancel                  │\n");
        out.push_str("└────────────────────────────────────────────────────────────┘\n");
        out
    }

    fn handle_key(&mut self, key: KeyAction) -> ViewAction {
        match self.state.handle_list_key(key) {
            Some(ViewAction::Submit(idx)) => {
                self.last_selected = Some(idx);
                self.done = true;
                ViewAction::Submit(idx)
            }
            Some(ViewAction::Close) => {
                self.done = true;
                ViewAction::Close
            }
            Some(other) => other,
            None => ViewAction::Continue,
        }
    }

    fn is_done(&self) -> bool {
        self.done
    }

    fn title(&self) -> Option<&str> {
        Some(&self.title)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_view() -> ListSelectionView<String> {
        ListSelectionView::new("Test", vec!["alpha".into(), "beta".into(), "gamma".into()])
    }

    #[test]
    fn empty_state_renders_placeholder() {
        let view: ListSelectionView<String> = ListSelectionView::new("Empty", vec![]);
        assert!(view.render().contains("(no items)"));
        assert!(view.selected().is_none());
        assert!(!view.is_done());
    }

    #[test]
    fn initial_cursor_at_first_item() {
        let view = make_view();
        assert_eq!(view.state.cursor(), 0);
        assert_eq!(view.selected().map(|s| s.as_str()), Some("alpha"));
        assert!(view.render().contains("❯ alpha"));
    }

    #[test]
    fn navigate_down_and_up() {
        let mut view = make_view();
        assert_eq!(view.handle_key(KeyAction::Down), ViewAction::Continue);
        assert_eq!(view.state.cursor(), 1);
        assert!(view.render().contains("❯ beta"));
        assert_eq!(view.handle_key(KeyAction::Up), ViewAction::Continue);
        assert_eq!(view.state.cursor(), 0);
    }

    #[test]
    fn enter_submits_and_marks_done() {
        let mut view = make_view();
        view.handle_key(KeyAction::Down); // move to beta (idx 1)
        let action = view.handle_key(KeyAction::Enter);
        assert_eq!(action, ViewAction::Submit(1));
        assert!(view.is_done());
        assert_eq!(view.last_selected, Some(1));
    }

    #[test]
    fn esc_closes_without_selection() {
        let mut view = make_view();
        let action = view.handle_key(KeyAction::Esc);
        assert_eq!(action, ViewAction::Close);
        assert!(view.is_done());
        assert_eq!(view.last_selected, None);
    }

    #[test]
    fn title_from_trait() {
        let view = make_view();
        assert_eq!(view.title(), Some("Test"));
    }

    #[test]
    fn down_does_not_overflow_at_end() {
        let mut view = make_view();
        for _ in 0..10 {
            view.handle_key(KeyAction::Down);
        }
        assert_eq!(view.state.cursor(), 2); // clamped at last index
    }
}
