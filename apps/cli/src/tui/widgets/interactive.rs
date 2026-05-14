//! `InteractiveView` foundation for stateful keyboard-navigable overlays.
//!
//! The Codex CLI audit (`codex-rs/tui/src/bottom_pane/bottom_pane_view.rs`)
//! identified the biggest architectural gap between AGI Workforce and Codex:
//! my current overlays are pure render functions that produce text
//! `SystemMessage`s, while Codex has stateful views that handle key events
//! directly. This module ports the trait surface so that future overlays
//! can be wired through the TUI event loop with `↑↓ Enter Esc` navigation
//! without a global rewrite.
//!
//! The trait is deliberately small: render a string, react to a key, and
//! signal completion. Concrete implementations stay in
//! `screen_renderers.rs` (the text-only path) and a future `screen_views.rs`
//! (the stateful path).
//!
//! Wiring into `tui::tui_app::run` is the next step (the event loop needs
//! a `Option<Box<dyn InteractiveView>>` slot that intercepts key events
//! before the regular input handler). Until that lands the module is a
//! pure-Rust state-machine library locked under unit tests; the
//! `#![allow(dead_code)]` covers the public surface.

#![allow(dead_code)]

/// Keys this layer cares about. We map from `crossterm::event::KeyEvent` at
/// the event-loop boundary so views stay test-friendly without a crossterm
/// dep in this module. Several variants are surface-only until the event
/// loop wiring lands in a follow-up — `#[allow(dead_code)]` lets the trait
/// stay forward-compatible.
#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KeyAction {
    Up,
    Down,
    Left,
    Right,
    Enter,
    Esc,
    Tab,
    ShiftTab,
    Backspace,
    Home,
    End,
    PageUp,
    PageDown,
    Char(char),
}

/// What the view wants the event loop to do after handling a key.
/// `SideAction` is surface-only until views start producing them.
#[allow(dead_code)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ViewAction {
    /// Keep the view open; rerender on next frame.
    Continue,
    /// Dismiss the view (user pressed Esc, finished an action, etc.).
    Close,
    /// User confirmed selection at the given item index.
    Submit(usize),
    /// User triggered a side action with an arbitrary tag (e.g. "delete",
    /// "edit", "duplicate"). The event loop interprets the tag.
    SideAction(String),
}

/// Core trait. A view renders itself, reacts to keys, and signals
/// completion. Implementations own their own state.
pub trait InteractiveView: Send {
    /// Render the view as a multi-line string. The event loop will print
    /// this in the bottom pane / overlay region.
    fn render(&self) -> String;

    /// Handle a key event. Returns the next action for the event loop.
    fn handle_key(&mut self, key: KeyAction) -> ViewAction;

    /// True when the view has terminated and the event loop may drop it.
    /// Returns `false` by default; views that own their own lifecycle can
    /// override (e.g. an animation that auto-dismisses after N frames).
    fn is_done(&self) -> bool {
        false
    }

    /// Optional title shown in the overlay frame (for debugging or status).
    fn title(&self) -> Option<&str> {
        None
    }
}

/// Bounded cursor state for a vertical list. Provides `↑↓ PageUp PageDown
/// Home End` semantics that every list view needs.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SelectionState {
    cursor: usize,
    len: usize,
    page_size: usize,
}

impl SelectionState {
    pub fn new(len: usize) -> Self {
        Self::with_page_size(len, 10)
    }

    pub fn with_page_size(len: usize, page_size: usize) -> Self {
        Self {
            cursor: 0,
            len,
            page_size: page_size.max(1),
        }
    }

    pub fn cursor(&self) -> usize {
        self.cursor
    }

    pub fn len(&self) -> usize {
        self.len
    }

    pub fn is_empty(&self) -> bool {
        self.len == 0
    }

    pub fn set_len(&mut self, len: usize) {
        self.len = len;
        if self.cursor >= len.saturating_sub(1).max(0) {
            self.cursor = len.saturating_sub(1).max(0);
        }
    }

    pub fn move_up(&mut self) {
        if self.cursor > 0 {
            self.cursor -= 1;
        }
    }

    pub fn move_down(&mut self) {
        if self.len == 0 {
            return;
        }
        if self.cursor + 1 < self.len {
            self.cursor += 1;
        }
    }

    pub fn page_up(&mut self) {
        self.cursor = self.cursor.saturating_sub(self.page_size);
    }

    pub fn page_down(&mut self) {
        if self.len == 0 {
            return;
        }
        let max = self.len - 1;
        self.cursor = (self.cursor + self.page_size).min(max);
    }

    pub fn home(&mut self) {
        self.cursor = 0;
    }

    pub fn end(&mut self) {
        if self.len > 0 {
            self.cursor = self.len - 1;
        }
    }

    /// Default key handler for list-style views. Returns the matched action
    /// or `None` if the key isn't a list-navigation key.
    pub fn handle_list_key(&mut self, key: KeyAction) -> Option<ViewAction> {
        match key {
            KeyAction::Up => {
                self.move_up();
                Some(ViewAction::Continue)
            }
            KeyAction::Down => {
                self.move_down();
                Some(ViewAction::Continue)
            }
            KeyAction::PageUp => {
                self.page_up();
                Some(ViewAction::Continue)
            }
            KeyAction::PageDown => {
                self.page_down();
                Some(ViewAction::Continue)
            }
            KeyAction::Home => {
                self.home();
                Some(ViewAction::Continue)
            }
            KeyAction::End => {
                self.end();
                Some(ViewAction::Continue)
            }
            KeyAction::Enter => Some(ViewAction::Submit(self.cursor)),
            KeyAction::Esc => Some(ViewAction::Close),
            _ => None,
        }
    }
}

/// Bounded cursor for a horizontal tab strip (`←/→` switches tabs).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TabState {
    cursor: usize,
    len: usize,
}

impl TabState {
    pub fn new(len: usize) -> Self {
        Self { cursor: 0, len: len.max(1) }
    }

    pub fn cursor(&self) -> usize {
        self.cursor
    }

    pub fn move_left(&mut self) {
        if self.cursor > 0 {
            self.cursor -= 1;
        }
    }

    pub fn move_right(&mut self) {
        if self.cursor + 1 < self.len {
            self.cursor += 1;
        }
    }

    pub fn handle_tab_key(&mut self, key: KeyAction) -> Option<ViewAction> {
        match key {
            KeyAction::Left | KeyAction::ShiftTab => {
                self.move_left();
                Some(ViewAction::Continue)
            }
            KeyAction::Right | KeyAction::Tab => {
                self.move_right();
                Some(ViewAction::Continue)
            }
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ---- SelectionState ----

    #[test]
    fn selection_starts_at_zero() {
        let s = SelectionState::new(5);
        assert_eq!(s.cursor(), 0);
        assert_eq!(s.len(), 5);
        assert!(!s.is_empty());
    }

    #[test]
    fn selection_empty_is_handled() {
        let mut s = SelectionState::new(0);
        assert!(s.is_empty());
        assert_eq!(s.cursor(), 0);
        s.move_down();
        s.move_up();
        s.page_up();
        s.page_down();
        s.end();
        assert_eq!(s.cursor(), 0); // no-op on empty
    }

    #[test]
    fn selection_move_up_saturates_at_zero() {
        let mut s = SelectionState::new(3);
        s.move_up();
        assert_eq!(s.cursor(), 0);
    }

    #[test]
    fn selection_move_down_stops_at_last() {
        let mut s = SelectionState::new(3);
        s.move_down();
        s.move_down();
        s.move_down(); // overshoot
        s.move_down(); // overshoot
        assert_eq!(s.cursor(), 2);
    }

    #[test]
    fn selection_page_navigation() {
        let mut s = SelectionState::with_page_size(20, 5);
        s.page_down();
        assert_eq!(s.cursor(), 5);
        s.page_down();
        assert_eq!(s.cursor(), 10);
        s.page_up();
        assert_eq!(s.cursor(), 5);
        s.end();
        assert_eq!(s.cursor(), 19);
        s.page_down();
        assert_eq!(s.cursor(), 19); // already at end
        s.home();
        assert_eq!(s.cursor(), 0);
    }

    #[test]
    fn selection_set_len_clamps_cursor() {
        let mut s = SelectionState::new(10);
        s.end();
        assert_eq!(s.cursor(), 9);
        s.set_len(3);
        assert!(s.cursor() < 3);
    }

    #[test]
    fn selection_handle_list_key_maps_arrows_and_enter_and_esc() {
        let mut s = SelectionState::new(3);
        assert_eq!(s.handle_list_key(KeyAction::Down), Some(ViewAction::Continue));
        assert_eq!(s.cursor(), 1);
        assert_eq!(s.handle_list_key(KeyAction::Up), Some(ViewAction::Continue));
        assert_eq!(s.cursor(), 0);
        assert_eq!(s.handle_list_key(KeyAction::Enter), Some(ViewAction::Submit(0)));
        assert_eq!(s.handle_list_key(KeyAction::Esc), Some(ViewAction::Close));
        assert_eq!(s.handle_list_key(KeyAction::Char('q')), None);
    }

    // ---- TabState ----

    #[test]
    fn tab_state_left_right_wrap_off() {
        let mut t = TabState::new(3);
        assert_eq!(t.cursor(), 0);
        t.move_left();
        assert_eq!(t.cursor(), 0);
        t.move_right();
        assert_eq!(t.cursor(), 1);
        t.move_right();
        assert_eq!(t.cursor(), 2);
        t.move_right();
        assert_eq!(t.cursor(), 2); // stops at last
    }

    #[test]
    fn tab_state_handle_tab_key_maps_arrows_and_tab() {
        let mut t = TabState::new(4);
        assert_eq!(t.handle_tab_key(KeyAction::Right), Some(ViewAction::Continue));
        assert_eq!(t.cursor(), 1);
        assert_eq!(t.handle_tab_key(KeyAction::Tab), Some(ViewAction::Continue));
        assert_eq!(t.cursor(), 2);
        assert_eq!(t.handle_tab_key(KeyAction::ShiftTab), Some(ViewAction::Continue));
        assert_eq!(t.cursor(), 1);
        assert_eq!(t.handle_tab_key(KeyAction::Left), Some(ViewAction::Continue));
        assert_eq!(t.cursor(), 0);
        assert_eq!(t.handle_tab_key(KeyAction::Enter), None);
    }

    // ---- Sample view implementing the trait (proves it composes) ----

    struct DemoListView {
        items: Vec<String>,
        state: SelectionState,
        done: bool,
        last_submit: Option<usize>,
    }

    impl DemoListView {
        fn new(items: Vec<String>) -> Self {
            let len = items.len();
            Self {
                items,
                state: SelectionState::new(len),
                done: false,
                last_submit: None,
            }
        }
    }

    impl InteractiveView for DemoListView {
        fn render(&self) -> String {
            self.items
                .iter()
                .enumerate()
                .map(|(i, item)| {
                    let cursor = if i == self.state.cursor() { "❯" } else { " " };
                    format!(" {cursor} {item}")
                })
                .collect::<Vec<_>>()
                .join("\n")
        }

        fn handle_key(&mut self, key: KeyAction) -> ViewAction {
            match self.state.handle_list_key(key) {
                Some(ViewAction::Submit(idx)) => {
                    self.last_submit = Some(idx);
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
            Some("Demo list")
        }
    }

    #[test]
    fn demo_view_navigates_and_submits() {
        let mut view = DemoListView::new(vec!["alpha".into(), "beta".into(), "gamma".into()]);
        assert_eq!(view.title(), Some("Demo list"));
        assert!(view.render().contains("❯ alpha"));
        assert!(!view.is_done());

        assert_eq!(view.handle_key(KeyAction::Down), ViewAction::Continue);
        assert!(view.render().contains("❯ beta"));

        assert_eq!(view.handle_key(KeyAction::Enter), ViewAction::Submit(1));
        assert!(view.is_done());
        assert_eq!(view.last_submit, Some(1));
    }

    #[test]
    fn demo_view_esc_closes_without_submit() {
        let mut view = DemoListView::new(vec!["only".into()]);
        assert_eq!(view.handle_key(KeyAction::Esc), ViewAction::Close);
        assert!(view.is_done());
        assert_eq!(view.last_submit, None);
    }
}
