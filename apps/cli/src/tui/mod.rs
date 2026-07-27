// AGI Workforce TUI — ratatui-based full-screen terminal UI
// Built on ratatui rendering modules + AgentSession

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

/// Truncate a row to at most `max` columns, appending `…` when it would
/// otherwise overflow a fixed-width box and break the right border. Counts
/// Unicode scalar values (matches display width for the ASCII + `…` glyph used
/// in the picker/overlay rows). Shared by the box-drawing widgets.
pub(crate) fn truncate_cols(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        let mut t: String = s.chars().take(max.saturating_sub(1)).collect();
        t.push('…');
        t
    }
}

#[cfg(test)]
mod tests {
    use super::truncate_cols;

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
        assert_eq!(out.chars().count(), 58);
        assert!(out.ends_with('…'));
    }

    #[test]
    fn truncation_counts_unicode_scalars_not_bytes() {
        // Multi-byte chars must not over-truncate or panic on a char boundary.
        let out = truncate_cols(&"é".repeat(100), 10);
        assert_eq!(out.chars().count(), 10);
        assert!(out.ends_with('…'));
    }
}
