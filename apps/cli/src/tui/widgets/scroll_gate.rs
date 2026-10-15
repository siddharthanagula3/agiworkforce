//! Scroll position for content a person is asked to approve, and whether its
//! end has been on screen since it opened.
//!
//! The draw decides how many rows fit, so the draw is what records them: a
//! view asks [`ScrollGate::window`] for the rows to paint, and an approving
//! key is taken only once [`ScrollGate::end_was_shown`] says the last of them
//! was painted. A view that has not been drawn has shown nothing.

use std::cell::Cell;
use std::ops::Range;

use ratatui::layout::Rect;
use ratatui::style::{Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Clear, Paragraph};

use super::interactive::KeyAction;
use crate::tui::terminal_palette::ui_warning;

/// Say that `area` cannot hold the request, in place of drawing a part of it
/// that someone could then answer.
pub fn draw_too_small(frame: &mut ratatui::Frame, area: Rect, title: &str, way_out: &str) {
    frame.render_widget(Clear, area);
    let lines = vec![
        Line::from(Span::styled(
            title.to_string(),
            Style::default()
                .fg(ui_warning())
                .add_modifier(Modifier::BOLD),
        )),
        Line::from("This window is too small to show the request."),
        Line::from(format!("Enlarge it to answer, or press {way_out}.")),
    ];
    frame.render_widget(Paragraph::new(lines), area);
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Drawn {
    total: usize,
    viewport: usize,
}

#[derive(Debug, Default)]
pub struct ScrollGate {
    offset: Cell<usize>,
    drawn: Cell<Option<Drawn>>,
    end_shown: Cell<bool>,
}

impl ScrollGate {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    /// The rows to paint now, out of `total`, in `viewport` rows. Call it from
    /// the draw that paints them.
    pub fn window(&self, total: usize, viewport: usize) -> Range<usize> {
        let start = self.offset.get().min(total.saturating_sub(viewport));
        let end = (start + viewport).min(total);
        self.offset.set(start);
        self.drawn.set(Some(Drawn { total, viewport }));
        if end == total && (viewport > 0 || total == 0) {
            self.end_shown.set(true);
        }
        start..end
    }

    /// The draw could not hold the request at all.
    pub fn nothing_drawn(&self) {
        self.drawn.set(None);
    }

    /// Move the window so `rows` are inside it at the next draw of `viewport`
    /// rows.
    pub fn reveal(&self, rows: Range<usize>, viewport: usize) {
        let offset = self.offset.get();
        if rows.start < offset {
            self.offset.set(rows.start);
        } else if rows.end > offset + viewport {
            self.offset.set(rows.end.saturating_sub(viewport));
        }
    }

    pub fn overflows(&self) -> bool {
        self.drawn
            .get()
            .is_some_and(|drawn| drawn.total > drawn.viewport)
    }

    /// Whether an approving answer may be taken: the latest draw held the
    /// request, and its last row has been painted since it opened.
    pub fn end_was_shown(&self) -> bool {
        self.drawn.get().is_some() && self.end_shown.get()
    }

    /// `lines 1-15 of 212`, when the latest draw could not hold every row.
    pub fn position_label(&self) -> Option<String> {
        let drawn = self
            .drawn
            .get()
            .filter(|drawn| drawn.total > drawn.viewport)?;
        let first = self.offset.get() + 1;
        let last = (self.offset.get() + drawn.viewport).min(drawn.total);
        Some(format!("lines {first}-{last} of {}", drawn.total))
    }

    /// Scroll on Up, Down, PageUp, PageDown, Home and End. Returns whether
    /// `key` was one of them.
    pub fn scroll_key(&mut self, key: KeyAction) -> bool {
        if !matches!(
            key,
            KeyAction::Up
                | KeyAction::Down
                | KeyAction::PageUp
                | KeyAction::PageDown
                | KeyAction::Home
                | KeyAction::End
        ) {
            return false;
        }
        let Some(Drawn { total, viewport }) = self.drawn.get() else {
            return true;
        };
        let last_offset = total.saturating_sub(viewport);
        let page = viewport.saturating_sub(1).max(1);
        let offset = self.offset.get();
        let next = match key {
            KeyAction::Up => offset.saturating_sub(1),
            KeyAction::Down => offset.saturating_add(1),
            KeyAction::PageUp => offset.saturating_sub(page),
            KeyAction::PageDown => offset.saturating_add(page),
            KeyAction::Home => 0,
            _ => last_offset,
        };
        self.offset.set(next.min(last_offset));
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nothing_is_shown_before_the_first_draw() {
        let gate = ScrollGate::default();
        assert!(!gate.end_was_shown());
        assert!(!gate.overflows());
        assert_eq!(gate.position_label(), None);
    }

    #[test]
    fn content_that_fits_is_shown_whole_by_its_first_draw() {
        let gate = ScrollGate::default();
        assert_eq!(gate.window(3, 10), 0..3);
        assert!(gate.end_was_shown());
        assert!(!gate.overflows());
        assert_eq!(gate.position_label(), None);

        let empty = ScrollGate::default();
        assert_eq!(empty.window(0, 0), 0..0);
        assert!(empty.end_was_shown());
    }

    #[test]
    fn the_end_counts_only_once_a_draw_has_painted_it() {
        let mut gate = ScrollGate::default();
        assert_eq!(gate.window(212, 15), 0..15);
        assert!(gate.overflows());
        assert!(!gate.end_was_shown());
        assert_eq!(gate.position_label().as_deref(), Some("lines 1-15 of 212"));

        assert!(gate.scroll_key(KeyAction::End));
        assert!(
            !gate.end_was_shown(),
            "the key moved the window; no draw has painted the end yet"
        );
        assert_eq!(gate.window(212, 15), 197..212);
        assert!(gate.end_was_shown());
        assert_eq!(
            gate.position_label().as_deref(),
            Some("lines 198-212 of 212")
        );

        assert!(gate.scroll_key(KeyAction::Home));
        assert_eq!(gate.window(212, 15), 0..15);
        assert!(gate.end_was_shown(), "shown once is enough");
    }

    #[test]
    fn each_key_moves_by_its_own_step_and_stops_at_the_ends() {
        let mut gate = ScrollGate::default();
        gate.window(100, 10);
        gate.scroll_key(KeyAction::Down);
        assert_eq!(gate.window(100, 10), 1..11);
        gate.scroll_key(KeyAction::PageDown);
        assert_eq!(gate.window(100, 10), 10..20);
        gate.scroll_key(KeyAction::PageUp);
        assert_eq!(gate.window(100, 10), 1..11);
        gate.scroll_key(KeyAction::Up);
        gate.scroll_key(KeyAction::Up);
        assert_eq!(gate.window(100, 10), 0..10);
        for _ in 0..20 {
            gate.scroll_key(KeyAction::PageDown);
        }
        assert_eq!(gate.window(100, 10), 90..100);
        assert!(!gate.scroll_key(KeyAction::Enter));
        assert!(!gate.scroll_key(KeyAction::Char('y')));
    }

    #[test]
    fn a_draw_with_no_room_for_the_content_shows_none_of_it() {
        let gate = ScrollGate::default();
        assert_eq!(gate.window(5, 0), 0..0);
        assert!(!gate.end_was_shown());

        let shown = ScrollGate::default();
        shown.window(5, 5);
        shown.nothing_drawn();
        assert!(
            !shown.end_was_shown(),
            "a window too small to draw the request takes no approving answer"
        );
        shown.window(5, 5);
        assert!(shown.end_was_shown());
    }

    #[test]
    fn a_smaller_window_keeps_the_offset_inside_the_content() {
        let mut gate = ScrollGate::default();
        gate.window(50, 10);
        gate.scroll_key(KeyAction::End);
        assert_eq!(gate.window(50, 10), 40..50);
        assert_eq!(gate.window(50, 30), 20..50);
        assert_eq!(gate.window(12, 30), 0..12);
    }

    #[test]
    fn reveal_brings_rows_outside_the_window_into_it() {
        let gate = ScrollGate::default();
        gate.window(40, 10);
        gate.reveal(25..27, 10);
        assert_eq!(gate.window(40, 10), 17..27);
        gate.reveal(3..4, 10);
        assert_eq!(gate.window(40, 10), 3..13);
        gate.reveal(5..6, 10);
        assert_eq!(gate.window(40, 10), 3..13);
    }

    #[test]
    fn reset_forgets_what_was_shown() {
        let mut gate = ScrollGate::default();
        gate.window(3, 10);
        assert!(gate.end_was_shown());
        gate.reset();
        assert!(!gate.end_was_shown());
    }
}
