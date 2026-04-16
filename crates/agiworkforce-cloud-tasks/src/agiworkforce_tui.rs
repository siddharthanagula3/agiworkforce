use crossterm::event::KeyCode;
use crossterm::event::KeyEvent;
use crossterm::event::KeyModifiers;
use ratatui::buffer::Buffer;
use ratatui::layout::Rect;
use ratatui::style::Stylize;
use ratatui::text::Line;
use ratatui::text::Span;
use ratatui::text::Text;
use std::time::Duration;
use std::time::Instant;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ComposerAction {
    Submitted(String),
    None,
}

#[derive(Clone, Debug, Default)]
pub struct ComposerInput {
    text: String,
    cursor: usize,
    hint_items: Vec<(String, String)>,
    paste_burst_started_at: Option<Instant>,
    last_input_at: Option<Instant>,
}

impl ComposerInput {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn recommended_flush_delay() -> Duration {
        Duration::from_millis(75)
    }

    pub fn is_empty(&self) -> bool {
        self.text.is_empty()
    }

    pub fn clear(&mut self) {
        self.text.clear();
        self.cursor = 0;
        self.paste_burst_started_at = None;
        self.last_input_at = None;
    }

    pub fn input(&mut self, key: KeyEvent) -> ComposerAction {
        self.last_input_at = Some(Instant::now());
        match key.code {
            KeyCode::Char(ch)
                if key.modifiers.is_empty() || key.modifiers == KeyModifiers::SHIFT =>
            {
                self.insert_char(ch);
                ComposerAction::None
            }
            KeyCode::Enter if key.modifiers.contains(KeyModifiers::SHIFT) => {
                self.insert_char('\n');
                ComposerAction::None
            }
            KeyCode::Enter => {
                let submitted = std::mem::take(&mut self.text);
                self.cursor = 0;
                self.paste_burst_started_at = None;
                ComposerAction::Submitted(submitted)
            }
            KeyCode::Backspace => {
                self.backspace();
                ComposerAction::None
            }
            KeyCode::Delete => {
                self.delete();
                ComposerAction::None
            }
            KeyCode::Left => {
                self.cursor = self.cursor.saturating_sub(1);
                ComposerAction::None
            }
            KeyCode::Right => {
                self.cursor = (self.cursor + 1).min(self.text.len());
                ComposerAction::None
            }
            KeyCode::Home => {
                self.cursor = 0;
                ComposerAction::None
            }
            KeyCode::End => {
                self.cursor = self.text.len();
                ComposerAction::None
            }
            _ => ComposerAction::None,
        }
    }

    pub fn handle_paste(&mut self, pasted: String) -> bool {
        if pasted.is_empty() {
            return false;
        }
        self.text.insert_str(self.cursor, &pasted);
        self.cursor += pasted.len();
        self.paste_burst_started_at = Some(Instant::now());
        self.last_input_at = Some(Instant::now());
        true
    }

    pub fn set_hint_items(&mut self, items: Vec<(impl Into<String>, impl Into<String>)>) {
        self.hint_items = items
            .into_iter()
            .map(|(key, label)| (key.into(), label.into()))
            .collect();
    }

    pub fn clear_hint_items(&mut self) {
        self.hint_items.clear();
    }

    pub fn desired_height(&self, width: u16) -> u16 {
        let width = width.max(1) as usize;
        let text_lines = self
            .text
            .lines()
            .map(|line| {
                if line.is_empty() {
                    1usize
                } else {
                    (line.chars().count().saturating_add(width - 1)) / width
                }
            })
            .sum::<usize>()
            .max(1);
        let hint_height = if self.hint_items.is_empty() { 0 } else { 1 };
        (text_lines + hint_height).min(u16::MAX as usize) as u16
    }

    pub fn cursor_pos(&self, area: Rect) -> Option<(u16, u16)> {
        if area.width == 0 || area.height == 0 {
            return None;
        }
        let width = area.width as usize;
        let mut row = 0usize;
        let mut col = 0usize;
        for ch in self.text.chars().take(self.cursor) {
            if ch == '\n' {
                row += 1;
                col = 0;
            } else {
                col += 1;
                if col >= width {
                    row += 1;
                    col = 0;
                }
            }
        }
        Some((
            area.x + col as u16,
            area.y + row.min(area.height.saturating_sub(1) as usize) as u16,
        ))
    }

    pub fn render_ref(&self, area: Rect, buf: &mut Buffer) {
        if area.width == 0 || area.height == 0 {
            return;
        }
        for y in 0..area.height {
            for x in 0..area.width {
                buf.cell_mut((area.x + x, area.y + y))
                    .expect("cell should exist")
                    .set_symbol(" ");
            }
        }

        let content_height = if self.hint_items.is_empty() {
            area.height
        } else {
            area.height.saturating_sub(1)
        };
        let mut row = 0u16;
        let mut col = 0u16;
        for ch in self.text.chars() {
            if ch == '\n' || col >= area.width {
                row = row.saturating_add(1);
                col = 0;
                if ch == '\n' {
                    continue;
                }
            }
            if row >= content_height {
                break;
            }
            buf.cell_mut((area.x + col, area.y + row))
                .expect("cell should exist")
                .set_symbol(&ch.to_string());
            col = col.saturating_add(1);
        }

        if !self.hint_items.is_empty() && area.height > 0 {
            let footer_row = area.y + area.height - 1;
            let mut footer = String::new();
            for (idx, (key, label)) in self.hint_items.iter().enumerate() {
                if idx > 0 {
                    footer.push_str("  ");
                }
                footer.push_str(key);
                footer.push(' ');
                footer.push_str(label);
            }
            for (idx, ch) in footer.chars().enumerate().take(area.width as usize) {
                buf.cell_mut((area.x + idx as u16, footer_row))
                    .expect("cell should exist")
                    .set_symbol(&ch.to_string())
                    .set_style(ratatui::style::Style::default().dim());
            }
        }
    }

    pub fn is_in_paste_burst(&self) -> bool {
        self.paste_burst_started_at.is_some()
    }

    pub fn flush_paste_burst_if_due(&mut self) -> bool {
        if let Some(started) = self.paste_burst_started_at
            && started.elapsed() >= Self::recommended_flush_delay()
        {
            self.paste_burst_started_at = None;
        }
        false
    }

    fn insert_char(&mut self, ch: char) {
        self.text.insert(self.cursor, ch);
        self.cursor += ch.len_utf8();
    }

    fn backspace(&mut self) {
        if self.cursor == 0 {
            return;
        }
        self.cursor -= 1;
        self.text.remove(self.cursor);
    }

    fn delete(&mut self) {
        if self.cursor < self.text.len() {
            self.text.remove(self.cursor);
        }
    }
}

pub fn render_markdown_text(input: &str) -> Text<'static> {
    let lines = input
        .lines()
        .map(|line| Line::from(vec![Span::raw(line.to_string())]))
        .collect::<Vec<_>>();
    Text::from(lines)
}
