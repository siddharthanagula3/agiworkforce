use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Clear, Paragraph};

use super::approval_overlay::wrap_cols;
use super::interactive::{InteractiveView, KeyAction, ViewAction};
use crate::terminal_text::sanitize_terminal_text;
use crate::tui::pad_to_cols;
use crate::tui::terminal_palette::{ui_accent, ui_muted, ui_on_light, ui_surface_elevated};

const OWN_ANSWER: &str = "Type your own answer";
const MAX_BOX_WIDTH: u16 = 82;

pub struct QuestionOverlayState {
    pub question: String,
    pub options: Vec<String>,
    pub cursor: usize,
    pub typed: String,
    pub answer: Option<String>,
    pub dismissed: bool,
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
        }
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
        let rows: Vec<(usize, Vec<String>)> = (0..=self.own_row())
            .map(|row| (row, wrap_cols(&self.row_text(row), text_cols)))
            .collect();
        let row_lines: usize = rows.iter().map(|(_, lines)| lines.len()).sum();
        let inner_height = 1 + question.len() + 1 + row_lines + 1 + 1 + 1;
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
            .title(" Question from the agent ")
            .borders(Borders::ALL)
            .border_style(Style::default().fg(ui_accent()))
            .style(Style::default().bg(ui_surface_elevated()));
        let inner = block.inner(box_area);
        frame.render_widget(block, box_area);

        let mut lines: Vec<Line> = vec![Line::from("")];
        for line in question {
            lines.push(Line::from(vec![
                Span::raw("  "),
                Span::styled(line, Style::default().add_modifier(Modifier::BOLD)),
            ]));
        }
        lines.push(Line::from(""));
        for (row, wrapped) in rows {
            let selected = row == self.cursor;
            let style = if selected {
                Style::default()
                    .fg(ui_on_light())
                    .bg(ui_accent())
                    .add_modifier(Modifier::BOLD)
            } else {
                Style::default()
            };
            for (index, text) in wrapped.into_iter().enumerate() {
                let marker = if selected && index == 0 {
                    "\u{276f} "
                } else {
                    "  "
                };
                lines.push(Line::from(vec![
                    Span::raw(format!("  {marker}")),
                    Span::styled(text, style),
                ]));
            }
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
            KeyAction::Enter if own => {
                let typed = self.typed.trim();
                if !typed.is_empty() {
                    self.answer = Some(typed.to_string());
                    return ViewAction::Submit(self.cursor);
                }
            }
            KeyAction::Enter => {
                self.answer = self.options.get(self.cursor).cloned();
                return ViewAction::Submit(self.cursor);
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
                if picked >= 1 && picked <= self.options.len() {
                    self.cursor = picked - 1;
                    self.answer = self.options.get(self.cursor).cloned();
                    return ViewAction::Submit(self.cursor);
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
        Some("Question from the agent")
    }
}
