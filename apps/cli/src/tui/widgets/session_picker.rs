//! `SessionPickerView`: the overlay behind `/history` and a bare `/resume`.
//!
//! The listing used to be printed with `eprintln!` from the REPL handler while
//! ratatui owned the terminal, which staircased down the screen in raw mode and
//! left Esc with no panel to close, so it fell through to the global quit.

use super::command_popup::{popup_header, popup_row, POPUP_INNER_WIDTH};
use super::interactive::{InteractiveView, KeyAction, SelectionState, ViewAction};
use crate::tui::truncate_cols;

const TITLE: &str = "Sessions";
const EMPTY: &str = "(no sessions to resume)";
const HINT: &str = "↑↓ navigate   Enter resume   Esc close";

/// One resumable session, already formatted for display.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionEntry {
    pub id: String,
    pub label: String,
}

/// Rows shown at once. The window scrolls with the cursor so a long history
/// stays inside the popup instead of overflowing the chat area.
const VISIBLE_ROWS: usize = 10;

pub struct SessionPickerView {
    entries: Vec<SessionEntry>,
    state: SelectionState,
    done: bool,
}

impl SessionPickerView {
    pub fn new(entries: Vec<SessionEntry>) -> Self {
        let len = entries.len();
        Self {
            entries,
            state: SelectionState::with_page_size(len, VISIBLE_ROWS),
            done: false,
        }
    }

    /// First row of the visible window, chosen so the cursor is always inside it.
    fn window_start(&self) -> usize {
        let cursor = self.state.cursor();
        if cursor < VISIBLE_ROWS {
            0
        } else {
            (cursor + 1 - VISIBLE_ROWS).min(self.entries.len().saturating_sub(VISIBLE_ROWS))
        }
    }
}

impl InteractiveView for SessionPickerView {
    fn render(&self) -> String {
        let mut out = popup_header(TITLE);

        if self.entries.is_empty() {
            out.push_str(&popup_row(&format!(" {EMPTY}")));
        } else {
            let start = self.window_start();
            for (offset, entry) in self
                .entries
                .iter()
                .skip(start)
                .take(VISIBLE_ROWS)
                .enumerate()
            {
                let index = start + offset;
                let cursor = if index == self.state.cursor() {
                    "❯ "
                } else {
                    "  "
                };
                out.push_str(&popup_row(&truncate_cols(
                    &format!("{cursor}{}", entry.label),
                    POPUP_INNER_WIDTH,
                )));
            }
            if self.entries.len() > VISIBLE_ROWS {
                out.push_str(&popup_row(&format!(
                    "  {}/{}",
                    self.state.cursor() + 1,
                    self.entries.len()
                )));
            }
        }

        out.push_str(&popup_row(""));
        out.push_str(&popup_row(&format!(" {HINT}")));
        out.push_str(&format!("└{}┘\n", "─".repeat(POPUP_INNER_WIDTH + 1)));
        out
    }

    fn handle_key(&mut self, key: KeyAction) -> ViewAction {
        match self.state.handle_list_key(key) {
            Some(ViewAction::Submit(index)) => {
                if self.entries.is_empty() {
                    return ViewAction::Continue;
                }
                self.done = true;
                let id = self.entries[index].id.clone();
                ViewAction::SideAction(format!("resume:{id}"))
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
        Some(TITLE)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tui::display_width;

    fn entries(count: usize) -> Vec<SessionEntry> {
        (0..count)
            .map(|i| SessionEntry {
                id: format!("session-{i}"),
                label: format!("session-{i} 2026-09-14 09:4{i} (3 msgs)"),
            })
            .collect()
    }

    #[test]
    fn enter_resumes_the_highlighted_session() {
        let mut view = SessionPickerView::new(entries(3));
        view.handle_key(KeyAction::Down);
        assert_eq!(
            view.handle_key(KeyAction::Enter),
            ViewAction::SideAction("resume:session-1".to_string())
        );
        assert!(view.is_done());
    }

    #[test]
    fn esc_closes_the_panel_without_choosing() {
        let mut view = SessionPickerView::new(entries(3));
        assert_eq!(view.handle_key(KeyAction::Esc), ViewAction::Close);
        assert!(view.is_done());
    }

    #[test]
    fn an_empty_history_offers_nothing_to_resume() {
        let mut view = SessionPickerView::new(Vec::new());
        assert_eq!(view.handle_key(KeyAction::Enter), ViewAction::Continue);
        assert!(!view.is_done());
        assert!(view.render().contains("no sessions"));
    }

    /// A long history must scroll inside the popup, never render 40 rows over
    /// the chat area the way the stderr listing did.
    #[test]
    fn the_window_scrolls_with_the_cursor_and_the_box_stays_rectangular() {
        let mut view = SessionPickerView::new(entries(40));
        for _ in 0..39 {
            view.handle_key(KeyAction::Down);
        }
        let text = view.render();
        assert!(text.contains("session-39"), "cursor row must be visible");
        assert!(!text.contains("session-0 "), "window must have scrolled");
        assert!(text.contains("40/40"), "position counter names the offset");
        assert!(
            text.lines().count() <= VISIBLE_ROWS + 5,
            "the popup must stay bounded:\n{text}"
        );
        for line in text.lines() {
            assert_eq!(
                display_width(line),
                POPUP_INNER_WIDTH + 3,
                "row breaks the popup box: {line:?}"
            );
        }
    }
}
