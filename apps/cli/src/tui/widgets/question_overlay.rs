use std::cell::Cell;
use std::ops::Range;

use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Clear, Paragraph};

use super::approval_overlay::wrap_cols;
use super::interactive::{InteractiveView, KeyAction, ViewAction};
use super::scroll_gate::{draw_too_small, ScrollGate};
use crate::terminal_text::sanitize_terminal_text;
use crate::tui::pad_to_cols;
use crate::tui::terminal_palette::{ui_accent, ui_muted, ui_on_light, ui_surface_elevated};

const OWN_ANSWER: &str = "Type your own answer";
const MAX_BOX_WIDTH: u16 = 82;

const AGENT_QUESTION_TITLE: &str = "Question from the agent";

/// The blank row above the question, the gaps around the choices and the hint.
const CHROME_ROWS: usize = 4;

/// How many rows of the inner box the question and the choices each get. The
/// choices and the answer being typed are kept in view first; a question
/// longer than what is left scrolls in its own window.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Arrangement {
    question_view: usize,
    question_scrolls: bool,
    choice_view: usize,
}

fn arrange(question_lines: usize, choice_lines: usize, inner_rows: usize) -> Option<Arrangement> {
    let budget = inner_rows.checked_sub(CHROME_ROWS)?;
    if question_lines + choice_lines <= budget {
        return Some(Arrangement {
            question_view: question_lines,
            question_scrolls: false,
            choice_view: choice_lines,
        });
    }
    if choice_lines + 2 <= budget {
        return Some(Arrangement {
            question_view: budget - choice_lines - 1,
            question_scrolls: true,
            choice_view: choice_lines,
        });
    }
    let question_view = question_lines.min(1);
    let question_scrolls = question_lines > question_view;
    let choice_view = budget.checked_sub(question_view + usize::from(question_scrolls))?;
    (choice_view > 0).then_some(Arrangement {
        question_view,
        question_scrolls,
        choice_view,
    })
}

/// A question whose answer completes a slash command: the picked option's
/// argument, or the typed text, is appended to `command` and the command runs.
struct CommandAnswer {
    command: String,
    arguments: Vec<String>,
}

pub struct QuestionOverlayState {
    pub question: String,
    pub options: Vec<String>,
    pub cursor: usize,
    pub typed: String,
    pub answer: Option<String>,
    pub dismissed: bool,
    title: String,
    completes: Option<CommandAnswer>,
    question_scroll: ScrollGate,
    choice_scroll: ScrollGate,
    /// The choice rows the latest `render_into` painted whole, as
    /// `start..end`. `None` until it draws: the text render shows every row.
    painted_rows: Cell<Option<(usize, usize)>>,
}

impl QuestionOverlayState {
    pub fn new(question: &str, options: &[String]) -> Self {
        Self {
            question: sanitize_terminal_text(question).into_owned(),
            options: options
                .iter()
                .map(|option| sanitize_terminal_text(option).into_owned())
                .collect(),
            cursor: 0,
            typed: String::new(),
            answer: None,
            dismissed: false,
            title: AGENT_QUESTION_TITLE.to_string(),
            completes: None,
            question_scroll: ScrollGate::default(),
            choice_scroll: ScrollGate::default(),
            painted_rows: Cell::new(None),
        }
    }

    /// An answer is taken only from a row the person could read in full.
    fn row_was_painted(&self, row: usize) -> bool {
        self.painted_rows
            .get()
            .is_none_or(|(start, end)| (start..end).contains(&row))
    }

    /// Ask `question` before running `/command`; each choice pairs the label
    /// shown with the argument the command receives.
    pub fn for_command(
        command: &str,
        title: &str,
        question: &str,
        choices: &[(&str, &str)],
    ) -> Self {
        let labels: Vec<String> = choices
            .iter()
            .map(|(label, _)| (*label).to_string())
            .collect();
        let mut state = Self::new(question, &labels);
        state.title = sanitize_terminal_text(title).into_owned();
        state.completes = Some(CommandAnswer {
            command: command.trim_start_matches('/').to_string(),
            arguments: choices
                .iter()
                .map(|(_, argument)| (*argument).to_string())
                .collect(),
        });
        state
    }

    fn answered(&mut self, row: usize, text: String) -> ViewAction {
        let Some(completes) = &self.completes else {
            self.answer = Some(text);
            return ViewAction::Submit(row);
        };
        let argument = completes.arguments.get(row).cloned().unwrap_or(text);
        let tag = format!("slash:{} {argument}", completes.command);
        self.answer = Some(argument);
        ViewAction::SideAction(tag)
    }

    fn own_row(&self) -> usize {
        self.options.len()
    }

    fn on_own_row(&self) -> bool {
        self.cursor == self.own_row()
    }

    pub fn insert_text(&mut self, text: &str) {
        if self.on_own_row() {
            self.typed
                .extend(text.chars().filter(|character| !character.is_control()));
        }
    }

    fn row_text(&self, row: usize) -> String {
        if row == self.own_row() {
            let cursor = if self.on_own_row() { "\u{258f}" } else { "" };
            if self.typed.is_empty() && !self.on_own_row() {
                format!("{}. {OWN_ANSWER}", row + 1)
            } else {
                format!("{}. {OWN_ANSWER}: {}{cursor}", row + 1, self.typed)
            }
        } else {
            format!("{}. {}", row + 1, self.options[row])
        }
    }

    fn hint(&self) -> &'static str {
        if self.on_own_row() {
            "Type, then Enter to answer   \u{2191} back to the choices   Esc skip"
        } else {
            "\u{2191}/\u{2193} choose   Enter or a number answers   Esc skip"
        }
    }

    pub fn render_into(&self, frame: &mut ratatui::Frame, area: Rect) {
        let box_width = area.width.min(MAX_BOX_WIDTH);
        let text_cols = usize::from(box_width.saturating_sub(6)).max(8);
        let question = wrap_cols(&self.question, text_cols);
        let mut choice_lines: Vec<(usize, bool, String)> = Vec::new();
        let mut row_spans: Vec<Range<usize>> = Vec::new();
        for row in 0..=self.own_row() {
            let start = choice_lines.len();
            for (index, text) in wrap_cols(&self.row_text(row), text_cols)
                .into_iter()
                .enumerate()
            {
                choice_lines.push((row, index == 0, text));
            }
            row_spans.push(start..choice_lines.len());
        }

        let inner_rows = usize::from(area.height.saturating_sub(2));
        let Some(shape) = arrange(question.len(), choice_lines.len(), inner_rows) else {
            self.question_scroll.nothing_drawn();
            self.choice_scroll.nothing_drawn();
            self.painted_rows.set(Some((0, 0)));
            draw_too_small(frame, area, &self.title, "Esc to skip");
            return;
        };
        let question_window = self
            .question_scroll
            .window(question.len(), shape.question_view);
        if let Some(span) = row_spans.get(self.cursor) {
            self.choice_scroll.reveal(span.clone(), shape.choice_view);
        }
        let choice_window = self
            .choice_scroll
            .window(choice_lines.len(), shape.choice_view);
        let whole_rows: Vec<usize> = row_spans
            .iter()
            .enumerate()
            .filter(|(_, span)| span.start >= choice_window.start && span.end <= choice_window.end)
            .map(|(row, _)| row)
            .collect();
        self.painted_rows
            .set(Some(match (whole_rows.first(), whole_rows.last()) {
                (Some(first), Some(last)) => (*first, last + 1),
                _ => (0, 0),
            }));

        let inner_height = 1
            + shape.question_view
            + usize::from(shape.question_scrolls)
            + 1
            + shape.choice_view
            + 1
            + 1;
        let box_height = (inner_height as u16 + 2).min(area.height);

        let vertical = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(area.height.saturating_sub(box_height) / 2),
                Constraint::Length(box_height),
                Constraint::Min(0),
            ])
            .split(area);
        let horizontal = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([
                Constraint::Length(area.width.saturating_sub(box_width) / 2),
                Constraint::Length(box_width),
                Constraint::Min(0),
            ])
            .split(vertical[1]);
        let box_area = horizontal[1];
        frame.render_widget(Clear, box_area);

        let block = Block::default()
            .title(format!(" {} ", self.title))
            .borders(Borders::ALL)
            .border_style(Style::default().fg(ui_accent()))
            .style(Style::default().bg(ui_surface_elevated()));
        let inner = block.inner(box_area);
        frame.render_widget(block, box_area);

        let mut lines: Vec<Line> = vec![Line::from("")];
        for line in &question[question_window] {
            lines.push(Line::from(vec![
                Span::raw("  "),
                Span::styled(line.clone(), Style::default().add_modifier(Modifier::BOLD)),
            ]));
        }
        if shape.question_scrolls {
            if let Some(position) = self.question_scroll.position_label() {
                lines.push(Line::from(Span::styled(
                    format!("  {position} \u{b7} PgUp/PgDn scroll the question"),
                    Style::default().fg(ui_muted()),
                )));
            }
        }
        lines.push(Line::from(""));
        for (row, first, text) in &choice_lines[choice_window] {
            let selected = *row == self.cursor;
            let style = if selected {
                Style::default()
                    .fg(ui_on_light())
                    .bg(ui_accent())
                    .add_modifier(Modifier::BOLD)
            } else {
                Style::default()
            };
            let marker = if selected && *first {
                "\u{276f} "
            } else {
                "  "
            };
            lines.push(Line::from(vec![
                Span::raw(format!("  {marker}")),
                Span::styled(text.clone(), style),
            ]));
        }
        lines.push(Line::from(""));
        lines.push(Line::from(vec![Span::styled(
            format!("  {}", self.hint()),
            Style::default().fg(ui_muted()),
        )]));
        frame.render_widget(Paragraph::new(lines), inner);
    }
}

impl InteractiveView for QuestionOverlayState {
    fn render(&self) -> String {
        let mut out = String::new();
        out.push_str(&format!(
            "{}\n",
            pad_to_cols(&format!("  {}", self.question), 78)
        ));
        for row in 0..=self.own_row() {
            let marker = if row == self.cursor { "\u{276f}" } else { " " };
            out.push_str(&format!(
                "{}\n",
                pad_to_cols(&format!("  {marker} {}", self.row_text(row)), 78)
            ));
        }
        out.push_str(&format!(
            "{}\n",
            pad_to_cols(&format!("  {}", self.hint()), 78)
        ));
        out
    }

    fn handle_key(&mut self, key: KeyAction) -> ViewAction {
        let own = self.on_own_row();
        match key {
            KeyAction::Esc => {
                self.dismissed = true;
                return ViewAction::Close;
            }
            KeyAction::Up | KeyAction::ShiftTab => self.cursor = self.cursor.saturating_sub(1),
            KeyAction::Down | KeyAction::Tab => {
                if self.cursor < self.own_row() {
                    self.cursor += 1;
                }
            }
            KeyAction::PageUp | KeyAction::PageDown | KeyAction::Home | KeyAction::End => {
                self.question_scroll.scroll_key(key);
            }
            KeyAction::Enter if own => {
                let typed = self.typed.trim().to_string();
                if !typed.is_empty() && self.row_was_painted(self.cursor) {
                    return self.answered(self.cursor, typed);
                }
            }
            KeyAction::Enter => {
                if self.row_was_painted(self.cursor) {
                    let chosen = self.options.get(self.cursor).cloned().unwrap_or_default();
                    return self.answered(self.cursor, chosen);
                }
            }
            KeyAction::Backspace if own => {
                self.typed.pop();
            }
            KeyAction::Char(character) if own => self.typed.push(character),
            KeyAction::Char('k') => self.cursor = self.cursor.saturating_sub(1),
            KeyAction::Char('j') => {
                if self.cursor < self.own_row() {
                    self.cursor += 1;
                }
            }
            KeyAction::Char(digit) if digit.is_ascii_digit() => {
                let picked = digit.to_digit(10).unwrap_or(0) as usize;
                if (1..=self.options.len()).contains(&picked) {
                    self.cursor = picked - 1;
                    if self.row_was_painted(self.cursor) {
                        let chosen = self.options.get(self.cursor).cloned().unwrap_or_default();
                        return self.answered(self.cursor, chosen);
                    }
                }
                if picked == self.own_row() + 1 {
                    self.cursor = self.own_row();
                }
            }
            _ => {}
        }
        ViewAction::Continue
    }

    fn is_done(&self) -> bool {
        self.answer.is_some() || self.dismissed
    }

    fn title(&self) -> Option<&str> {
        Some(&self.title)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SCOPES: [(&str, &str); 2] = [
        ("Changed files", "--changes"),
        ("Whole repository", "--repo"),
    ];

    fn scope_question() -> QuestionOverlayState {
        QuestionOverlayState::for_command(
            "/security-review",
            "Security review scope",
            "Cover what?",
            &SCOPES,
        )
    }

    #[test]
    fn an_agent_question_still_submits_the_option_it_was_given() {
        let mut overlay =
            QuestionOverlayState::new("Which one?", &["alpha".to_string(), "beta".to_string()]);
        assert_eq!(overlay.title(), Some("Question from the agent"));

        assert_eq!(overlay.handle_key(KeyAction::Down), ViewAction::Continue);
        assert_eq!(overlay.handle_key(KeyAction::Enter), ViewAction::Submit(1));
        assert_eq!(overlay.answer.as_deref(), Some("beta"));

        let mut by_digit = QuestionOverlayState::new("Which one?", &["alpha".to_string()]);
        assert_eq!(
            by_digit.handle_key(KeyAction::Char('1')),
            ViewAction::Submit(0)
        );
        assert_eq!(by_digit.answer.as_deref(), Some("alpha"));
    }

    #[test]
    fn a_command_question_runs_the_command_with_the_picked_argument() {
        let mut overlay = scope_question();
        assert_eq!(overlay.title(), Some("Security review scope"));
        assert_eq!(
            overlay.handle_key(KeyAction::Enter),
            ViewAction::SideAction("slash:security-review --changes".to_string()),
            "the first option is the default"
        );

        let mut by_digit = scope_question();
        assert_eq!(
            by_digit.handle_key(KeyAction::Char('2')),
            ViewAction::SideAction("slash:security-review --repo".to_string())
        );

        let mut by_arrow = scope_question();
        by_arrow.handle_key(KeyAction::Down);
        assert_eq!(
            by_arrow.handle_key(KeyAction::Enter),
            ViewAction::SideAction("slash:security-review --repo".to_string())
        );
    }

    #[test]
    fn a_command_question_passes_typed_text_through_and_skips_on_escape() {
        let mut typed = scope_question();
        typed.handle_key(KeyAction::Char('3'));
        assert!(typed.on_own_row());
        for character in "src/auth".chars() {
            typed.handle_key(KeyAction::Char(character));
        }
        assert_eq!(
            typed.handle_key(KeyAction::Enter),
            ViewAction::SideAction("slash:security-review src/auth".to_string())
        );

        let mut empty = scope_question();
        empty.handle_key(KeyAction::Char('3'));
        assert_eq!(empty.handle_key(KeyAction::Enter), ViewAction::Continue);

        let mut skipped = scope_question();
        assert_eq!(skipped.handle_key(KeyAction::Esc), ViewAction::Close);
        assert!(skipped.dismissed);
        assert_eq!(skipped.answer, None);
    }

    fn painted(state: &QuestionOverlayState, width: u16, height: u16) -> String {
        let mut terminal =
            ratatui::Terminal::new(ratatui::backend::TestBackend::new(width, height))
                .expect("terminal");
        terminal
            .draw(|frame| state.render_into(frame, Rect::new(0, 0, width, height)))
            .expect("draw");
        let buffer = terminal.backend().buffer();
        (0..buffer.area.height)
            .map(|y| {
                (0..buffer.area.width)
                    .map(|x| buffer[(x, y)].symbol().to_string())
                    .collect::<String>()
            })
            .collect::<Vec<_>>()
            .join("\n")
    }

    fn long_question() -> QuestionOverlayState {
        QuestionOverlayState::new(
            &"a".repeat(2_400),
            &["alpha".to_string(), "beta".to_string()],
        )
    }

    fn long_choices() -> QuestionOverlayState {
        let options: Vec<String> = (1..=6)
            .map(|n| format!("choice {n} {}", "z".repeat(150)))
            .collect();
        QuestionOverlayState::new("Pick one", &options)
    }

    #[test]
    fn a_long_question_scrolls_while_the_choices_and_own_answer_stay_in_view() {
        let overlay = long_question();
        let text = painted(&overlay, 80, 20);
        for label in ["1. alpha", "2. beta", "3. Type your own answer"] {
            assert!(text.contains(label), "{label} is not drawn: {text}");
        }
        assert!(text.contains("lines 1-10 of 33"), "{text}");
        assert!(text.contains("PgUp/PgDn scroll the question"), "{text}");
    }

    #[test]
    fn page_keys_scroll_the_question_and_keep_the_choices() {
        let mut overlay = long_question();
        painted(&overlay, 80, 20);
        assert_eq!(
            overlay.handle_key(KeyAction::PageDown),
            ViewAction::Continue
        );
        let text = painted(&overlay, 80, 20);
        assert!(text.contains("lines 10-19 of 33"), "{text}");
        assert!(text.contains("2. beta"), "{text}");

        overlay.handle_key(KeyAction::End);
        assert!(painted(&overlay, 80, 20).contains("lines 24-33 of 33"));
        overlay.handle_key(KeyAction::PageUp);
        assert!(painted(&overlay, 80, 20).contains("lines 15-24 of 33"));
        overlay.handle_key(KeyAction::Home);
        assert!(painted(&overlay, 80, 20).contains("lines 1-10 of 33"));
        assert_eq!(overlay.answer, None);
    }

    #[test]
    fn enter_and_digits_answer_with_the_choice_on_screen() {
        let mut by_arrow = long_question();
        painted(&by_arrow, 80, 20);
        by_arrow.handle_key(KeyAction::Down);
        assert!(painted(&by_arrow, 80, 20).contains("\u{276f} 2. beta"));
        assert_eq!(by_arrow.handle_key(KeyAction::Enter), ViewAction::Submit(1));
        assert_eq!(by_arrow.answer.as_deref(), Some("beta"));

        let mut by_digit = long_question();
        painted(&by_digit, 80, 20);
        assert_eq!(
            by_digit.handle_key(KeyAction::Char('2')),
            ViewAction::Submit(1)
        );
        assert_eq!(by_digit.answer.as_deref(), Some("beta"));
    }

    #[test]
    fn the_answer_being_typed_is_drawn_before_it_is_sent() {
        let mut overlay = long_question();
        painted(&overlay, 80, 20);
        overlay.handle_key(KeyAction::Char('3'));
        for character in "hello".chars() {
            overlay.handle_key(KeyAction::Char(character));
        }
        let text = painted(&overlay, 80, 20);
        assert!(text.contains("3. Type your own answer: hello"), "{text}");
        assert_eq!(overlay.handle_key(KeyAction::Enter), ViewAction::Submit(2));
        assert_eq!(overlay.answer.as_deref(), Some("hello"));
    }

    #[test]
    fn a_digit_for_a_choice_off_screen_selects_it_before_it_can_answer() {
        let mut overlay = long_choices();
        let text = painted(&overlay, 80, 12);
        assert!(text.contains("1. choice 1"), "{text}");
        assert!(!text.contains("6. choice 6"), "{text}");

        assert_eq!(
            overlay.handle_key(KeyAction::Char('6')),
            ViewAction::Continue
        );
        assert_eq!(overlay.cursor, 5);
        assert_eq!(overlay.answer, None);

        let text = painted(&overlay, 80, 12);
        assert!(text.contains("\u{276f} 6. choice 6"), "{text}");
        assert_eq!(overlay.handle_key(KeyAction::Enter), ViewAction::Submit(5));
        assert_eq!(
            overlay.answer.as_deref(),
            Some(format!("choice 6 {}", "z".repeat(150)).as_str())
        );
    }

    #[test]
    fn a_window_too_small_for_any_choice_takes_no_answer_but_still_skips() {
        let mut overlay = long_question();
        let text = painted(&overlay, 80, 5);
        assert!(text.contains("too small"), "{text}");
        assert_eq!(overlay.handle_key(KeyAction::Enter), ViewAction::Continue);
        assert_eq!(
            overlay.handle_key(KeyAction::Char('1')),
            ViewAction::Continue
        );
        assert_eq!(overlay.answer, None);
        assert_eq!(overlay.handle_key(KeyAction::Esc), ViewAction::Close);
    }

    #[test]
    fn the_choices_get_the_rows_first_and_the_question_keeps_at_least_one() {
        assert_eq!(
            arrange(3, 3, 20),
            Some(Arrangement {
                question_view: 3,
                question_scrolls: false,
                choice_view: 3,
            })
        );
        assert_eq!(
            arrange(33, 3, 18),
            Some(Arrangement {
                question_view: 10,
                question_scrolls: true,
                choice_view: 3,
            })
        );
        assert_eq!(
            arrange(1, 19, 10),
            Some(Arrangement {
                question_view: 1,
                question_scrolls: false,
                choice_view: 5,
            })
        );
        assert_eq!(arrange(33, 3, 3), None);
        assert_eq!(arrange(33, 3, 6), None);
    }
}
