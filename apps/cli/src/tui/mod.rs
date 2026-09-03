
pub(crate) mod app_event;
pub(crate) mod approval_broker;
#[allow(dead_code, unused_imports)]
mod color;
mod cost_hud;
pub(crate) mod fuzzy;
pub(crate) mod icons;
pub(crate) mod pane_view;
#[allow(dead_code, unused_imports)]
mod shimmer;
#[allow(dead_code, unused_imports)]
pub(crate) mod terminal_palette;
pub(crate) mod transcript_cell;

mod markdown_renderer;
mod tui_app;
pub mod widgets;
pub use tui_app::run;

use std::sync::atomic::{AtomicBool, Ordering};

use ratatui::text::Line;

/// True while the full-screen ratatui TUI owns the terminal (alternate screen +
/// raw mode). Lower layers (e.g. the streaming dispatcher) check this to avoid
/// writing raw `eprintln!` notices that would corrupt the display. In exec /
/// non-TUI mode the flag stays false and stderr warnings render normally.
static TUI_ACTIVE: AtomicBool = AtomicBool::new(false);

pub(crate) fn set_tui_active(active: bool) {
    TUI_ACTIVE.store(active, Ordering::Relaxed);
}

pub(crate) fn tui_active() -> bool {
    TUI_ACTIVE.load(Ordering::Relaxed)
}

/// Out-of-band notices raised by lower layers (e.g. the streaming dispatcher
/// dropping tool support for a local model) while the TUI owns the terminal.
/// The event loop drains these into the transcript as system messages, so such
/// events are visible instead of silently swallowed (raw `eprintln!` would
/// corrupt the alternate screen). In non-TUI mode lower layers use stderr and
/// this stays empty.
static TUI_NOTICES: std::sync::OnceLock<std::sync::Mutex<Vec<String>>> = std::sync::OnceLock::new();

/// Queue a notice for the TUI to surface on its next event-loop tick.
pub(crate) fn push_tui_notice(message: String) {
    if let Ok(mut q) = TUI_NOTICES
        .get_or_init(|| std::sync::Mutex::new(Vec::new()))
        .lock()
    {
        q.push(message);
    }
}

/// Drain all pending TUI notices, clearing the queue.
pub(crate) fn drain_tui_notices() -> Vec<String> {
    TUI_NOTICES
        .get()
        .and_then(|q| q.lock().ok().map(|mut g| std::mem::take(&mut *g)))
        .unwrap_or_default()
}

/// Terminal display width in columns, including double-width CJK/emoji and
/// zero-width combining marks, using the same measurement as ratatui.
pub(crate) fn display_width(s: &str) -> usize {
    Line::from(s).width()
}

/// Truncate a row to at most `max` terminal columns, appending `…` when it
/// would otherwise overflow a fixed-width box and break the right border.
pub(crate) fn truncate_cols(s: &str, max: usize) -> String {
    if display_width(s) <= max {
        s.to_string()
    } else if max == 0 {
        String::new()
    } else {
        let ellipsis = '…';
        let target_width = max.saturating_sub(display_width("…"));
        let mut width = 0usize;
        let mut truncated = String::new();
        for ch in s.chars() {
            let ch_width = display_width(&ch.to_string());
            if width + ch_width > target_width {
                break;
            }
            truncated.push(ch);
            width += ch_width;
        }
        truncated.push(ellipsis);
        truncated
    }
}

/// Truncate and right-pad a value to exactly `width` terminal columns.
pub(crate) fn pad_to_cols(s: &str, width: usize) -> String {
    let mut padded = truncate_cols(s, width);
    padded.push_str(&" ".repeat(width.saturating_sub(display_width(&padded))));
    padded
}

#[cfg(test)]
mod tests {
    use super::{display_width, pad_to_cols, truncate_cols};

    #[test]
    fn short_strings_pass_through_unchanged() {
        assert_eq!(truncate_cols("hi", 58), "hi");
        // Exactly at the limit is left intact.
        let exact = "x".repeat(58);
        assert_eq!(truncate_cols(&exact, 58), exact);
    }

    #[test]
    fn overlong_strings_are_ellipsized_to_max() {
        let out = truncate_cols(&"x".repeat(120), 58);
        // The ellipsis counts as one column, so the result fits the box width.
        assert_eq!(display_width(&out), 58);
        assert!(out.ends_with('…'));
    }

    #[test]
    fn truncation_counts_terminal_columns_for_cjk() {
        let out = truncate_cols("界界界", 5);
        assert_eq!(out, "界界…");
        assert_eq!(display_width(&out), 5);
        assert!(out.ends_with('…'));
    }

    #[test]
    fn padding_uses_display_columns_instead_of_scalar_count() {
        let out = pad_to_cols("界", 4);
        assert_eq!(out, "界  ");
        assert_eq!(display_width(&out), 4);
    }
}
