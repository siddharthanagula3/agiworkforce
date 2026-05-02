//! Live Cost HUD.
//!
//! Renders the running token + dollar usage of the current TUI session in the
//! top-right corner of the screen. Pricing is read from the same
//! [`model_catalog`] that the rest of the CLI uses, so no model IDs or prices
//! are hardcoded here.
//!
//! Colour rules for the context-window indicator:
//!   * `<70%`  → dim grey (calm)
//!   * `70%-89%` → orange (heads up)
//!   * `>=90%` → red (urgent)
//!
//! This is one of the four headline differentiators for the demo (see the
//! plan in `~/.claude/plans/even-if-it-is-bubbly-octopus.md`).

use ratatui::layout::Rect;
use ratatui::style::Color;
use ratatui::style::Modifier;
use ratatui::style::Style;
use ratatui::text::Line;
use ratatui::text::Span;
use ratatui::widgets::Paragraph;
use ratatui::Frame;

use crate::model_catalog;
use crate::output::format_tokens;

/// A render-time snapshot of the running cost / context usage for the active
/// session. All values are cumulative across the session unless a field doc
/// says otherwise.
#[derive(Debug, Clone, Copy, Default)]
pub struct CostHud {
    pub in_tokens: u32,
    pub out_tokens: u32,
    pub cache_read: u32,
    pub cache_creation: u32,
    pub context_used: u64,
    pub context_window: u64,
}

impl CostHud {
    /// Cumulative dollars spent for the supplied model. Cache creation is
    /// billed at the input rate; cache reads are conservatively billed at
    /// 1/10th the input rate (the closest thing to a public default; the
    /// per-provider value is configurable through models.json once we wire
    /// it up post-demo).
    pub fn dollars(&self, model_id: &str) -> f64 {
        let (price_in, price_out) = model_catalog::pricing(model_id);
        let billable_in = self.in_tokens as f64 + self.cache_creation as f64;
        let billable_cache_read = self.cache_read as f64;
        (billable_in * price_in + self.out_tokens as f64 * price_out
            + billable_cache_read * price_in * 0.1)
            / 1_000_000.0
    }

    pub fn context_percent(&self) -> u8 {
        if self.context_window == 0 {
            return 0;
        }
        ((self.context_used * 100) / self.context_window).min(100) as u8
    }

    fn context_color(&self) -> Color {
        match self.context_percent() {
            0..=69 => Color::DarkGray,
            70..=89 => Color::Rgb(255, 165, 0),
            _ => Color::Red,
        }
    }
}

/// Render the HUD anchored to the top-right of `screen`. Always one row tall.
pub fn render(frame: &mut Frame, screen: Rect, hud: &CostHud, model_id: &str) {
    if screen.width < 30 || screen.height == 0 {
        return;
    }

    let line = build_line(hud, model_id);
    let line_width = line.width() as u16;
    let width = line_width.min(screen.width.saturating_sub(2));

    let area = Rect {
        x: screen.x + screen.width.saturating_sub(width + 1),
        y: screen.y,
        width,
        height: 1,
    };

    frame.render_widget(Paragraph::new(line), area);
}

fn build_line<'a>(hud: &CostHud, model_id: &str) -> Line<'a> {
    let dollars = hud.dollars(model_id);
    let dollars_text = if dollars >= 1.0 {
        format!("${:.2}", dollars)
    } else {
        format!("${:.4}", dollars)
    };

    let mut spans = vec![
        Span::styled("▮ ", Style::default().fg(Color::Cyan)),
        Span::styled(
            format!("in {}", format_tokens(hud.in_tokens)),
            Style::default().fg(Color::White),
        ),
        Span::raw(" · "),
        Span::styled(
            format!("out {}", format_tokens(hud.out_tokens)),
            Style::default().fg(Color::White),
        ),
    ];

    if hud.cache_read > 0 || hud.cache_creation > 0 {
        spans.push(Span::raw(" · "));
        spans.push(Span::styled(
            format!(
                "cache {}/{}",
                format_tokens(hud.cache_read),
                format_tokens(hud.cache_creation),
            ),
            Style::default().fg(Color::DarkGray),
        ));
    }

    spans.push(Span::raw(" · "));
    spans.push(Span::styled(
        dollars_text,
        Style::default()
            .fg(Color::Green)
            .add_modifier(Modifier::BOLD),
    ));
    spans.push(Span::raw(" · "));
    spans.push(Span::styled(
        format!("ctx {}%", hud.context_percent()),
        Style::default().fg(hud.context_color()),
    ));
    spans.push(Span::raw(" "));

    Line::from(spans)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dollars_zero_when_empty() {
        let hud = CostHud::default();
        assert_eq!(hud.dollars("claude-sonnet-4-6"), 0.0);
    }

    #[test]
    fn dollars_scales_linearly_with_tokens() {
        let hud = CostHud {
            in_tokens: 1_000_000,
            out_tokens: 0,
            ..Default::default()
        };
        let (price_in, _) = model_catalog::pricing("claude-sonnet-4-6");
        assert!((hud.dollars("claude-sonnet-4-6") - price_in).abs() < 1e-6);
    }

    #[test]
    fn cache_creation_bills_at_input_rate() {
        let no_cache = CostHud {
            in_tokens: 1_000_000,
            ..Default::default()
        };
        let with_cache = CostHud {
            in_tokens: 0,
            cache_creation: 1_000_000,
            ..Default::default()
        };
        assert!(
            (no_cache.dollars("claude-sonnet-4-6")
                - with_cache.dollars("claude-sonnet-4-6"))
            .abs()
                < 1e-6
        );
    }

    #[test]
    fn context_percent_capped_at_100() {
        let hud = CostHud {
            context_used: 1_000,
            context_window: 100,
            ..Default::default()
        };
        assert_eq!(hud.context_percent(), 100);
    }

    #[test]
    fn context_color_thresholds() {
        let make = |used: u64, window: u64| CostHud {
            context_used: used,
            context_window: window,
            ..Default::default()
        };
        assert_eq!(make(50, 100).context_color(), Color::DarkGray);
        assert_eq!(make(75, 100).context_color(), Color::Rgb(255, 165, 0));
        assert_eq!(make(95, 100).context_color(), Color::Red);
    }
}
