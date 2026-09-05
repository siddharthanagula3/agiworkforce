//! `CommandPopup`: fuzzy slash-command picker overlay.
//!
//! Char keys append to an inline filter; Backspace removes the last char;
//! ↑↓ navigate the filtered set; Enter fills the canonical slash command name.
//! A space separates the command name from its arguments, fuzzy matching runs
//! on the name token only (text before the first space), and Enter carries any
//! typed arguments through so `/privacy-mode local` fills as typed rather than
//! silently matching nothing.
//! The render shows `/name, description` rows with `❯ ` bolding the cursor row.

use super::i18n::{keys, t};
use super::interactive::{InteractiveView, KeyAction, SelectionState, ViewAction};
use crate::tui::{display_width, pad_to_cols, truncate_cols};

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

/// Inner content width of the popup box (chars between the `│ ` and `│` borders).
const POPUP_INNER_WIDTH: usize = 59;

/// Columns between the `┌`/`└` and `┐`/`┘` corners: the content width plus the
/// single space that separates content from the left border.
const POPUP_BORDER_WIDTH: usize = POPUP_INNER_WIDTH + 1;

/// Top border with the title inlaid, `┌─ Title ──…──┐`. The dash run is
/// measured rather than typed so a translated title keeps the box rectangular;
/// the previous fixed literal only lined up for the word "Commands".
fn popup_header(title: &str) -> String {
    let inlay = format!("─ {} ", truncate_cols(title, POPUP_BORDER_WIDTH - 3));
    let fill = POPUP_BORDER_WIDTH.saturating_sub(display_width(&inlay));
    format!("┌{inlay}{}┐\n", "─".repeat(fill))
}

/// One content row: `│ `, exactly `POPUP_INNER_WIDTH` columns, `│`.
fn popup_row(content: &str) -> String {
    format!("│ {}│\n", pad_to_cols(content, POPUP_INNER_WIDTH))
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

    /// The command-name portion of the filter, text before the first space.
    /// Everything after the first space is treated as command arguments and
    /// must not influence which command the fuzzy matcher selects.
    fn name_query(&self) -> &str {
        match self.filter.split_once(' ') {
            Some((head, _)) => head,
            None => &self.filter,
        }
    }

    fn filtered(&self) -> Vec<&RegistryCommand> {
        let q = self.name_query();
        if q.is_empty() {
            return self.all.iter().collect();
        }
        // Fuzzy match + rank (best-first). Name matches outrank description-only
        // matches; ties break by shorter, then alphabetical name.
        let mut scored: Vec<(i32, &RegistryCommand)> = self
            .all
            .iter()
            .filter_map(|c| {
                let name = crate::tui::fuzzy::fuzzy_score(q, &c.name);
                let desc = crate::tui::fuzzy::fuzzy_score(q, &c.description).map(|s| s - 50);
                match (name, desc) {
                    (Some(a), Some(b)) => Some((a.max(b), c)),
                    (Some(a), None) => Some((a, c)),
                    (None, Some(b)) => Some((b, c)),
                    (None, None) => None,
                }
            })
            .collect();
        scored.sort_by(|a, b| {
            b.0.cmp(&a.0)
                .then_with(|| a.1.name.len().cmp(&b.1.name.len()))
                .then_with(|| a.1.name.cmp(&b.1.name))
        });
        scored.into_iter().map(|(_, c)| c).collect()
    }

    fn sync_state_len(&mut self) {
        let len = self.filtered().len();
        self.state.set_len(len);
    }
}

impl InteractiveView for CommandPopup {
    fn render(&self) -> String {
        let mut out = popup_header(t(keys::COMMAND_POPUP_TITLE));
        out.push_str(&popup_row(&format!("  /{}", self.filter)));
        out.push_str(&popup_row(&"─".repeat(POPUP_INNER_WIDTH - 1)));

        let items = self.filtered();
        if items.is_empty() {
            out.push_str(&popup_row(&format!(" {}", t(keys::COMMAND_POPUP_EMPTY))));
        } else {
            for (i, cmd) in items.iter().enumerate() {
                let cursor = if i == self.state.cursor() {
                    "❯ "
                } else {
                    "  "
                };
                out.push_str(&popup_row(&format!(
                    "{cursor}/{}, {}",
                    cmd.name, cmd.description
                )));
            }
        }

        out.push_str(&popup_row(""));
        out.push_str(&popup_row(&format!(" {}", t(keys::COMMAND_POPUP_HINT))));
        out.push_str(&format!("└{}┘\n", "─".repeat(POPUP_BORDER_WIDTH)));
        out
    }

    fn handle_key(&mut self, key: KeyAction) -> ViewAction {
        match key {
            KeyAction::Char(c) => {
                // A space separates the command name from its arguments. Ignore a
                // leading space (no command name typed yet); otherwise accept it so
                // `/privacy-mode local` keeps the args while matching on the name.
                if c == ' ' && self.filter.is_empty() {
                    return ViewAction::Continue;
                }
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
                let name = self
                    .filtered()
                    .get(self.state.cursor())
                    .map(|cmd| cmd.name.clone());
                if let Some(name) = name {
                    // Carry any typed arguments (text after the first space) through
                    // so the input fills as `/name args`, not just `/name`.
                    let args = self
                        .filter
                        .split_once(' ')
                        .map(|(_, rest)| rest.trim())
                        .filter(|a| !a.is_empty());
                    self.selected_command = Some(name.clone());
                    self.done = true;
                    let payload = match args {
                        Some(a) => format!("slash:{name} {a}"),
                        None => format!("slash:{name}"),
                    };
                    ViewAction::SideAction(payload)
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
                }
            }
        }
    }

    fn is_done(&self) -> bool {
        self.done
    }

    fn title(&self) -> Option<&str> {
        Some(t(keys::COMMAND_POPUP_TITLE))
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
        assert_eq!(action, ViewAction::SideAction("slash:exec".to_string()));
        assert_eq!(popup.selected_command.as_deref(), Some("exec"));
        assert!(popup.is_done());
    }

    #[test]
    fn space_separates_name_from_args_and_still_matches() {
        // Regression: typing `/privacy-mode local` used to drop the space, making
        // the filter `privacy-modelocal` match nothing. Now the args after the
        // first space don't affect which command matches.
        let mut popup = make_popup();
        for c in "exec ls".chars() {
            popup.handle_key(KeyAction::Char(c));
        }
        assert_eq!(popup.filter, "exec ls");
        let filtered = popup.filtered();
        assert_eq!(filtered.len(), 1, "args must not break name matching");
        assert_eq!(filtered[0].name, "exec");
    }

    #[test]
    fn enter_carries_typed_arguments_through() {
        let mut popup = make_popup();
        for c in "exec git status".chars() {
            popup.handle_key(KeyAction::Char(c));
        }
        let action = popup.handle_key(KeyAction::Enter);
        // The caller fills the input from this payload: `/exec git status`.
        assert_eq!(
            action,
            ViewAction::SideAction("slash:exec git status".to_string())
        );
    }

    #[test]
    fn leading_space_is_ignored() {
        let mut popup = make_popup();
        popup.handle_key(KeyAction::Char(' '));
        assert_eq!(
            popup.filter, "",
            "a leading space (no command yet) is dropped"
        );
    }

    #[test]
    fn enter_without_args_is_unchanged() {
        let mut popup = make_popup();
        for c in "plan".chars() {
            popup.handle_key(KeyAction::Char(c));
        }
        let action = popup.handle_key(KeyAction::Enter);
        assert_eq!(action, ViewAction::SideAction("slash:plan".to_string()));
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
        // narrow filter so only 1 result, cursor should clamp
        popup.handle_key(KeyAction::Char('h')); // "help"
        assert!(popup.state.cursor() < popup.filtered().len());
    }

    #[test]
    fn render_shows_cursor_marker_on_selected_row() {
        let popup = make_popup();
        let text = popup.render();
        assert!(text.contains("❯ /plan"), "expected cursor on first item");
    }

    #[test]
    fn long_description_is_truncated_so_the_box_border_stays_intact() {
        let popup = CommandPopup::new(vec![RegistryCommand::new(
            "sandbox",
            "Show or toggle sandbox mode (read-only / contained / unrestricted)",
        )]);
        let text = popup.render();
        // The command row (│ {row:<59}│) is 62 cols. No line may exceed the box
        // width, or it pushes past the right border like the original bug did.
        for line in text.lines() {
            assert!(
                crate::tui::display_width(line) <= 62,
                "row overflows the popup box ({} cols): {line:?}",
                crate::tui::display_width(line)
            );
        }
        let sandbox_row = text
            .lines()
            .find(|l| l.contains("/sandbox"))
            .expect("sandbox row present");
        assert!(
            sandbox_row.ends_with("…│"),
            "long row should be ellipsized: {sandbox_row:?}"
        );
    }

    #[test]
    fn cjk_command_rows_preserve_the_popup_border() {
        let popup = CommandPopup::new(vec![RegistryCommand::new(
            "模型管理",
            "检查中文命令说明是否按照终端显示列安全截断而不破坏右侧边框".repeat(3),
        )]);
        let text = popup.render();
        for line in text.lines() {
            assert_eq!(
                crate::tui::display_width(line),
                POPUP_OUTER_WIDTH,
                "CJK row breaks the popup box: {line:?}"
            );
        }
        // A double-width alphabet cannot always land on the last content column,
        // so the ellipsis is the last thing before the pad, not before the border.
        let cjk_row = text
            .lines()
            .find(|line| line.contains('…'))
            .expect("the overlong cjk description must be ellipsized");
        assert!(
            cjk_row.trim_end_matches('│').trim_end().ends_with('…'),
            "the ellipsis must be the last content column: {cjk_row:?}"
        );
    }

    /// Total columns of a rendered row: the two corner/border glyphs plus the
    /// span between them.
    const POPUP_OUTER_WIDTH: usize = POPUP_BORDER_WIDTH + 2;

    #[test]
    fn chrome_is_translated_and_the_box_stays_rectangular() {
        let popup = make_popup();
        for (locale, title, hint_fragment) in [
            ("es", "Comandos", "Escribe para filtrar"),
            // Japanese is the width test: the title is half the characters and
            // twice the columns of the English one.
            ("ja", "コマンド", "入力して絞り込み"),
        ] {
            let text = super::super::i18n::with_locale(locale, || popup.render());
            assert!(
                text.contains(&format!("┌─ {title} ─")),
                "{locale}: expected the translated title inlaid in the top border:\n{text}"
            );
            assert!(
                text.contains(hint_fragment),
                "{locale}: expected the translated hint bar:\n{text}"
            );
            for line in text.lines() {
                assert_eq!(
                    display_width(line),
                    POPUP_OUTER_WIDTH,
                    "{locale}: row breaks the border: {line:?}"
                );
            }
        }
    }

    #[test]
    fn empty_state_is_translated() {
        let mut popup = make_popup();
        popup.handle_key(KeyAction::Char('z')); // matches nothing
        let text = super::super::i18n::with_locale("fr", || popup.render());
        assert!(
            text.contains("(aucune commande correspondante)"),
            "expected the translated empty state:\n{text}"
        );
    }
}
