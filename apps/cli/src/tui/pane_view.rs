//! Bottom-pane view contract.
//!
//! This is the richer successor to the current `InteractiveView` overlay slot.
//! It gives the TUI enough metadata to stack panels, route paste/key events,
//! track selection for tests, and let an active panel consume incoming approval
//! requests before the app opens a separate approval overlay.

#![allow(dead_code)]

use super::approval_broker::ApprovalRequest;
use super::widgets::interactive::KeyAction;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PaneCompletion {
    Cancelled,
    Submitted { value: String },
    Selected { index: usize },
    Dismissed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PaneAction {
    Continue,
    Close(PaneCompletion),
    Push(String),
    RequestFrame,
}

/// A keyboard-navigable surface in the bottom pane or modal stack.
pub trait PaneView: Send {
    fn view_id(&self) -> &'static str;

    fn title(&self) -> &str;

    fn render_text(&self, width: u16, height: u16) -> String;

    fn handle_key(&mut self, key: KeyAction) -> PaneAction;

    fn handle_paste(&mut self, _text: &str) -> PaneAction {
        PaneAction::Continue
    }

    fn is_complete(&self) -> Option<PaneCompletion> {
        None
    }

    fn selected_index(&self) -> Option<usize> {
        None
    }

    fn can_consume_approval(&self, _request: &ApprovalRequest) -> bool {
        false
    }

    fn requires_attention(&self) -> bool {
        false
    }
}

/// A minimal view stack for routing input to the active pane.
#[derive(Default)]
pub struct PaneStack {
    views: Vec<Box<dyn PaneView>>,
}

impl PaneStack {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn push(&mut self, view: Box<dyn PaneView>) {
        self.views.push(view);
    }

    pub fn pop(&mut self) -> Option<Box<dyn PaneView>> {
        self.views.pop()
    }

    pub fn active(&self) -> Option<&dyn PaneView> {
        self.views.last().map(|view| view.as_ref())
    }

    pub fn active_mut(&mut self) -> Option<&mut (dyn PaneView + '_)> {
        if let Some(view) = self.views.last_mut() {
            Some(view.as_mut())
        } else {
            None
        }
    }

    pub fn len(&self) -> usize {
        self.views.len()
    }

    pub fn is_empty(&self) -> bool {
        self.views.is_empty()
    }

    pub fn handle_key(&mut self, key: KeyAction) -> Option<PaneAction> {
        let action = self.active_mut()?.handle_key(key);
        if matches!(action, PaneAction::Close(_)) {
            self.pop();
        }
        Some(action)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct StubPane {
        done: bool,
    }

    impl PaneView for StubPane {
        fn view_id(&self) -> &'static str {
            "stub"
        }

        fn title(&self) -> &str {
            "Stub"
        }

        fn render_text(&self, _width: u16, _height: u16) -> String {
            "stub".into()
        }

        fn handle_key(&mut self, key: KeyAction) -> PaneAction {
            match key {
                KeyAction::Enter => {
                    self.done = true;
                    PaneAction::Close(PaneCompletion::Selected { index: 0 })
                }
                _ => PaneAction::Continue,
            }
        }

        fn is_complete(&self) -> Option<PaneCompletion> {
            self.done
                .then_some(PaneCompletion::Selected { index: 0 })
        }
    }

    #[test]
    fn stack_routes_to_active_view() {
        let mut stack = PaneStack::new();
        stack.push(Box::new(StubPane { done: false }));

        assert_eq!(stack.len(), 1);
        assert_eq!(stack.active().map(|view| view.view_id()), Some("stub"));
        assert_eq!(stack.handle_key(KeyAction::Down), Some(PaneAction::Continue));
        assert_eq!(stack.len(), 1);
    }

    #[test]
    fn close_action_pops_view() {
        let mut stack = PaneStack::new();
        stack.push(Box::new(StubPane { done: false }));

        assert_eq!(
            stack.handle_key(KeyAction::Enter),
            Some(PaneAction::Close(PaneCompletion::Selected { index: 0 }))
        );
        assert!(stack.is_empty());
    }
}
