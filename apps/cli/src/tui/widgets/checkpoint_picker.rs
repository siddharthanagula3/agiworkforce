use super::command_popup::{popup_header, popup_row, POPUP_INNER_WIDTH};
use super::interactive::{InteractiveView, KeyAction, SelectionState, ViewAction};
use crate::tui::truncate_cols;

const TITLE: &str = "Rewind";
const VISIBLE_ROWS: usize = 10;
const EMPTY: &str = "(no checkpoints yet: each prompt you send makes one)";
const PICK_HINT: &str = "↑↓ choose a prompt   Enter pick   Esc close";
const ACT_HINT: &str = "↑↓ choose   Enter apply   Esc back";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CheckpointEntry {
    pub steps: usize,
    pub label: String,
    pub tracked_files: usize,
}

enum Stage {
    Pick,
    Act(usize),
}

pub struct CheckpointPickerView {
    entries: Vec<CheckpointEntry>,
    state: SelectionState,
    stage: Stage,
    actions: SelectionState,
    done: bool,
}

impl CheckpointPickerView {
    pub fn new(entries: Vec<CheckpointEntry>) -> Self {
        let len = entries.len();
        Self {
            entries,
            state: SelectionState::with_page_size(len, VISIBLE_ROWS),
            stage: Stage::Pick,
            actions: SelectionState::new(0),
            done: false,
        }
    }

    fn actions_for(entry: &CheckpointEntry) -> Vec<(&'static str, &'static str)> {
        if entry.tracked_files > 0 {
            vec![
                ("Restore code and conversation", "both"),
                ("Restore conversation", "conversation"),
                ("Restore code", "code"),
                ("Never mind", ""),
            ]
        } else {
            vec![("Restore conversation", "conversation"), ("Never mind", "")]
        }
    }

    fn window_start(&self) -> usize {
        let cursor = self.state.cursor();
        if cursor < VISIBLE_ROWS {
            0
        } else {
            (cursor + 1 - VISIBLE_ROWS).min(self.entries.len().saturating_sub(VISIBLE_ROWS))
        }
    }
}

impl InteractiveView for CheckpointPickerView {
    fn render(&self) -> String {
        let mut out = popup_header(TITLE);
        match self.stage {
            Stage::Pick => {
                if self.entries.is_empty() {
                    out.push_str(&popup_row(&format!(" {EMPTY}")));
                } else {
                    out.push_str(&popup_row(
                        " Go back to the moment before one of your prompts:",
                    ));
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
                }
                out.push_str(&popup_row(""));
                out.push_str(&popup_row(&format!(" {PICK_HINT}")));
            }
            Stage::Act(index) => {
                let entry = &self.entries[index];
                out.push_str(&popup_row(&truncate_cols(
                    &format!(" {}", entry.label),
                    POPUP_INNER_WIDTH,
                )));
                out.push_str(&popup_row(""));
                for (row, (label, _)) in Self::actions_for(entry).iter().enumerate() {
                    let cursor = if row == self.actions.cursor() {
                        "❯ "
                    } else {
                        "  "
                    };
                    out.push_str(&popup_row(&format!("{cursor}{label}")));
                }
                out.push_str(&popup_row(""));
                out.push_str(&popup_row(&format!(" {ACT_HINT}")));
            }
        }
        out.push_str(&format!("└{}┘\n", "─".repeat(POPUP_INNER_WIDTH + 1)));
        out
    }

    fn handle_key(&mut self, key: KeyAction) -> ViewAction {
        match self.stage {
            Stage::Pick => match self.state.handle_list_key(key) {
                Some(ViewAction::Submit(index)) => {
                    if let Some(entry) = self.entries.get(index) {
                        self.actions = SelectionState::new(Self::actions_for(entry).len());
                        self.stage = Stage::Act(index);
                    }
                    ViewAction::Continue
                }
                Some(ViewAction::Close) => {
                    self.done = true;
                    ViewAction::Close
                }
                Some(other) => other,
                None => ViewAction::Continue,
            },
            Stage::Act(index) => match self.actions.handle_list_key(key) {
                Some(ViewAction::Submit(row)) => {
                    let entry = &self.entries[index];
                    let (_, mode) = Self::actions_for(entry)[row];
                    if mode.is_empty() {
                        self.stage = Stage::Pick;
                        return ViewAction::Continue;
                    }
                    self.done = true;
                    ViewAction::SideAction(format!("rewind:{} {mode}", entry.steps))
                }
                Some(ViewAction::Close) => {
                    self.stage = Stage::Pick;
                    ViewAction::Continue
                }
                Some(other) => other,
                None => ViewAction::Continue,
            },
        }
    }

    fn is_done(&self) -> bool {
        self.done
    }

    fn title(&self) -> Option<&str> {
        Some(TITLE)
    }
}
