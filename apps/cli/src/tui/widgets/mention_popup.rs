//! `MentionPopup`: the `@file` picker the composer opens on `@`.
//!
//! Same box chrome, key handling and fuzzy ranking as the slash-command popup
//! next door, over workspace files instead of commands. Char keys extend the
//! query, Backspace shortens it (and closes the popup once the `@` itself is
//! deleted), ↑↓ move, Enter emits `mention:<path>` for the host to splice into
//! the composer, Esc dismisses.

use super::command_popup::{popup_header, popup_row, POPUP_INNER_WIDTH};
use super::interactive::{InteractiveView, KeyAction, SelectionState, ViewAction};
use crate::mentions::{rank_mention_candidates, MentionCandidate};

/// Rows of the candidate list the popup draws. The ranker is asked for exactly
/// this many, so a huge workspace costs one bounded sort, not a full render.
const VISIBLE_ROWS: usize = 8;

pub struct MentionPopup {
    all: Vec<MentionCandidate>,
    pub query: String,
    state: SelectionState,
    done: bool,
    /// The path the user chose, once Enter lands on a row.
    pub selected_path: Option<String>,
}

impl MentionPopup {
    pub fn new(candidates: Vec<MentionCandidate>) -> Self {
        let len = candidates.len().min(VISIBLE_ROWS);
        Self {
            all: candidates,
            query: String::new(),
            state: SelectionState::new(len),
            done: false,
            selected_path: None,
        }
    }

    pub fn filtered(&self) -> Vec<&MentionCandidate> {
        rank_mention_candidates(&self.query, &self.all, VISIBLE_ROWS)
    }

    fn sync_state_len(&mut self) {
        let len = self.filtered().len();
        self.state.set_len(len);
    }
}

impl InteractiveView for MentionPopup {
    fn render(&self) -> String {
        let mut out = popup_header("Files");
        out.push_str(&popup_row(&format!("  @{}", self.query)));
        out.push_str(&popup_row(&"─".repeat(POPUP_INNER_WIDTH - 1)));

        let items = self.filtered();
        if items.is_empty() {
            out.push_str(&popup_row(" (no matching file)"));
        } else {
            for (i, candidate) in items.iter().enumerate() {
                let cursor = if i == self.state.cursor() {
                    "❯ "
                } else {
                    "  "
                };
                out.push_str(&popup_row(&format!("{cursor}{}", candidate.path)));
            }
        }

        out.push_str(&popup_row(""));
        out.push_str(&popup_row(
            " Type to filter · ↑↓ to move · Enter to insert · Esc to cancel",
        ));
        out.push_str(&format!("└{}┘\n", "─".repeat(POPUP_INNER_WIDTH + 1)));
        out
    }

    fn handle_key(&mut self, key: KeyAction) -> ViewAction {
        match key {
            // A space ends the mention: the user moved on to prose, so the
            // popup gets out of the way rather than matching across the space.
            KeyAction::Char(' ') => {
                self.done = true;
                ViewAction::Close
            }
            KeyAction::Char(c) => {
                self.query.push(c);
                self.sync_state_len();
                ViewAction::Continue
            }
            KeyAction::Backspace => {
                // Backspacing over the `@` that opened the popup closes it, and
                // the host deletes that character, so the composer and the
                // popup agree about what is on screen.
                if self.query.is_empty() {
                    self.done = true;
                    return ViewAction::SideAction("mention-cancel-at".to_string());
                }
                self.query.pop();
                self.sync_state_len();
                ViewAction::Continue
            }
            KeyAction::Enter => {
                let path = self
                    .filtered()
                    .get(self.state.cursor())
                    .map(|candidate| candidate.path.clone());
                match path {
                    Some(path) => {
                        self.selected_path = Some(path.clone());
                        self.done = true;
                        ViewAction::SideAction(format!("mention:{path}"))
                    }
                    None => ViewAction::Continue,
                }
            }
            KeyAction::Esc => {
                self.done = true;
                ViewAction::Close
            }
            other => match other {
                KeyAction::Up
                | KeyAction::Down
                | KeyAction::PageUp
                | KeyAction::PageDown
                | KeyAction::Home
                | KeyAction::End => self
                    .state
                    .handle_list_key(other)
                    .unwrap_or(ViewAction::Continue),
                _ => ViewAction::Continue,
            },
        }
    }

    fn is_done(&self) -> bool {
        self.done
    }

    fn title(&self) -> Option<&str> {
        Some("Files")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tui::display_width;

    fn popup() -> MentionPopup {
        MentionPopup::new(
            ["src/lib.rs", "src/agent/chat.rs", "README.md", "Cargo.toml"]
                .iter()
                .map(|p| MentionCandidate::new(*p))
                .collect(),
        )
    }

    #[test]
    fn an_empty_query_lists_every_candidate() {
        assert_eq!(popup().filtered().len(), 4);
    }

    #[test]
    fn typing_narrows_to_the_matching_file() {
        let mut view = popup();
        for c in "chat".chars() {
            view.handle_key(KeyAction::Char(c));
        }
        let items = view.filtered();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].path, "src/agent/chat.rs");
    }

    #[test]
    fn enter_emits_the_selected_path() {
        let mut view = popup();
        for c in "readme".chars() {
            view.handle_key(KeyAction::Char(c));
        }
        let action = view.handle_key(KeyAction::Enter);
        assert_eq!(
            action,
            ViewAction::SideAction("mention:README.md".to_string())
        );
        assert_eq!(view.selected_path.as_deref(), Some("README.md"));
        assert!(view.is_done());
    }

    #[test]
    fn backspacing_past_the_at_asks_the_host_to_delete_it() {
        let mut view = popup();
        view.handle_key(KeyAction::Char('r'));
        view.handle_key(KeyAction::Backspace);
        assert_eq!(view.query, "");
        let action = view.handle_key(KeyAction::Backspace);
        assert_eq!(
            action,
            ViewAction::SideAction("mention-cancel-at".to_string())
        );
        assert!(view.is_done());
    }

    #[test]
    fn a_space_ends_the_mention() {
        let mut view = popup();
        let action = view.handle_key(KeyAction::Char(' '));
        assert_eq!(action, ViewAction::Close);
        assert!(view.is_done());
    }

    #[test]
    fn esc_closes_without_choosing() {
        let mut view = popup();
        assert_eq!(view.handle_key(KeyAction::Esc), ViewAction::Close);
        assert!(view.selected_path.is_none());
    }

    #[test]
    fn enter_with_no_match_does_nothing() {
        let mut view = popup();
        view.handle_key(KeyAction::Char('z'));
        view.handle_key(KeyAction::Char('q'));
        assert_eq!(view.handle_key(KeyAction::Enter), ViewAction::Continue);
        assert!(!view.is_done());
    }

    #[test]
    fn a_long_path_never_breaks_the_popup_border() {
        let long = format!("apps/cli/{}/deeply/nested/module.rs", "segment".repeat(12));
        let view = MentionPopup::new(vec![MentionCandidate::new(long)]);
        let text = view.render();
        for line in text.lines() {
            assert_eq!(
                display_width(line),
                POPUP_INNER_WIDTH + 3,
                "row breaks the popup box: {line:?}"
            );
        }
    }

    #[test]
    fn the_list_is_capped_at_the_visible_rows() {
        let many: Vec<MentionCandidate> = (0..200)
            .map(|i| MentionCandidate::new(format!("src/file{i}.rs")))
            .collect();
        let view = MentionPopup::new(many);
        assert_eq!(view.filtered().len(), VISIBLE_ROWS);
    }
}
