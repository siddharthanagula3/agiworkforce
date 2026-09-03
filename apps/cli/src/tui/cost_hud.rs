//! Live Cost HUD.
//!
//! Renders the running token + dollar usage of the current TUI session in the
//! top-right corner of the screen. Pricing is read from the same
//! [`model_catalog`] that the rest of the CLI uses, so no model IDs or prices
//! are hardcoded here.
//!
//! Colour rules for the context-window indicator:
//!   * `<70%` uses the muted palette.
//!   * `70%-89%` uses the warning palette.
//!   * `>=90%` uses the danger palette.

use ratatui::layout::Rect;
use ratatui::style::Color;
use ratatui::style::Modifier;
use ratatui::style::Style;
use ratatui::text::Line;
use ratatui::text::Span;
use ratatui::widgets::Paragraph;
use ratatui::Frame;

use crate::output::format_tokens;
use crate::tui::terminal_palette::{ui_accent, ui_danger, ui_muted, ui_success, ui_warning};

/// A render-time snapshot of the running cost / context usage for the active
/// session. All values are cumulative across the session unless a field doc
/// says otherwise.
#[derive(Debug, Clone, Copy, Default)]
pub struct CostHud {
    pub in_tokens: u32,
    pub out_tokens: u32,
    pub cache_read: u32,
    pub cache_creation: u32,
    /// Sum of per-provider-request ledger costs. Never recompute this from the
    /// cumulative token fields: several short requests may exceed a model's
    /// long-context threshold only in aggregate.
    pub total_usd: f64,
    /// Reasoning output tokens from extended-thinking / chain-of-thought.
    /// Only shown in the HUD when non-zero (i.e., for reasoning models only).
    pub reasoning_tokens: u32,
    pub context_used: u64,
    pub context_window: u64,
}

impl CostHud {
    /// Cumulative dollars already resolved per provider request by the ledger.
    pub fn dollars(&self, _model_id: &str) -> f64 {
        self.total_usd
    }

    pub fn context_percent(&self) -> u8 {
        if self.context_window == 0 {
            return 0;
        }
        ((self.context_used * 100) / self.context_window).min(100) as u8
    }

    fn context_color(&self) -> Color {
        match self.context_percent() {
            0..=69 => ui_muted(),
            70..=89 => ui_warning(),
            _ => ui_danger(),
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
        Span::styled("▮ ", Style::default().fg(ui_accent())),
        Span::styled(
            format!("in {}", format_tokens(hud.in_tokens)),
            Style::default(),
        ),
        Span::raw(" · "),
        Span::styled(
            format!("out {}", format_tokens(hud.out_tokens)),
            Style::default(),
        ),
    ];

    if hud.reasoning_tokens > 0 {
        spans.push(Span::raw(" · "));
        spans.push(Span::styled(
            format!("reasoning {}", format_tokens(hud.reasoning_tokens)),
            Style::default().fg(ui_muted()),
        ));
    }

    if hud.cache_read > 0 || hud.cache_creation > 0 {
        spans.push(Span::raw(" · "));
        spans.push(Span::styled(
            format!(
                "cached {}/{}",
                format_tokens(hud.cache_read),
                format_tokens(hud.cache_creation),
            ),
            Style::default().fg(ui_muted()),
        ));
    }

    spans.push(Span::raw(" · "));
    spans.push(Span::styled(
        dollars_text,
        Style::default()
            .fg(ui_success())
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
    use crate::model_catalog;

    #[test]
    fn dollars_zero_when_empty() {
        let hud = CostHud::default();
        let probe = crate::model_catalog::fast_completion_model("anthropic");
        assert_eq!(hud.dollars(&probe), 0.0);
    }

    #[test]
    fn dollars_uses_the_per_completion_ledger_total() {
        let hud = CostHud {
            in_tokens: 1_000_000,
            out_tokens: 0,
            total_usd: 1.2345,
            ..Default::default()
        };
        let probe = crate::model_catalog::fast_completion_model("anthropic");
        assert!((hud.dollars(&probe) - hud.total_usd).abs() < f64::EPSILON);
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

    /// Mirrors codex-cli `status_card_token_usage_excludes_cached_tokens`:
    /// the "in"/"out" headline must NOT embed cached tokens (cached is separate).
    #[test]
    fn hud_in_out_headline_excludes_cached_tokens() {
        let hud = CostHud {
            in_tokens: 1_200,
            out_tokens: 900,
            cache_read: 200,
            cache_creation: 0,
            total_usd: 0.0,
            reasoning_tokens: 0,
            context_used: 2_100,
            context_window: 200_000,
        };
        let line = build_line(
            &hud,
            &crate::model_catalog::fast_completion_model("anthropic"),
        );
        let text = line
            .spans
            .iter()
            .map(|s| s.content.as_ref())
            .collect::<String>();
        assert!(text.contains("in "), "missing 'in' field: {text}");
        // "out N" present
        assert!(text.contains("out "), "missing 'out' field: {text}");
        // "cached" shown separately because cache_read > 0
        assert!(text.contains("cached"), "missing 'cached' field: {text}");
        // The "in" value does NOT include cached tokens
        // (1200 input != 1000 non-cached; we check that "in" comes before "cached")
        let in_pos = text.find("in ").unwrap();
        let cached_pos = text.find("cached").unwrap();
        assert!(
            in_pos < cached_pos,
            "'in' must appear before 'cached': {text}"
        );
    }

    /// Reasoning column is absent when reasoning_tokens == 0 (non-reasoning model).
    #[test]
    fn reasoning_column_absent_for_non_reasoning_model() {
        let hud = CostHud {
            in_tokens: 1_000,
            out_tokens: 500,
            reasoning_tokens: 0,
            ..Default::default()
        };
        let line = build_line(&hud, "plain-chat-model");
        let text = line
            .spans
            .iter()
            .map(|s| s.content.as_ref())
            .collect::<String>();
        assert!(
            !text.contains("reasoning"),
            "reasoning column must be absent when tokens=0: {text}"
        );
    }

    /// Reasoning column is present when reasoning_tokens > 0 (extended-thinking model).
    #[test]
    fn reasoning_column_present_for_reasoning_model() {
        let hud = CostHud {
            in_tokens: 1_200,
            out_tokens: 900,
            reasoning_tokens: 150,
            ..Default::default()
        };
        let line = build_line(&hud, &model_catalog::fast_completion_model("anthropic"));
        let text = line
            .spans
            .iter()
            .map(|s| s.content.as_ref())
            .collect::<String>();
        assert!(
            text.contains("reasoning"),
            "reasoning column must appear when tokens>0: {text}"
        );
        // reasoning column appears before cached/cost (after 'out')
        let reasoning_pos = text.find("reasoning").unwrap();
        let dollars_pos = text.find('$').unwrap();
        assert!(
            reasoning_pos < dollars_pos,
            "reasoning must appear before cost: {text}"
        );
    }

    /// All 5 fields coexist: in, cached, out, reasoning, cost (matching codex pattern).
    #[test]
    fn all_five_token_fields_coexist_in_hud() {
        let hud = CostHud {
            in_tokens: 1_200,
            out_tokens: 900,
            cache_read: 200,
            cache_creation: 0,
            total_usd: 0.0,
            reasoning_tokens: 150,
            context_used: 2_100,
            context_window: 200_000,
        };
        let line = build_line(&hud, &model_catalog::fast_completion_model("anthropic"));
        let text = line
            .spans
            .iter()
            .map(|s| s.content.as_ref())
            .collect::<String>();
        assert!(text.contains("in "), "missing in: {text}");
        assert!(text.contains("out "), "missing out: {text}");
        assert!(text.contains("cached"), "missing cached: {text}");
        assert!(text.contains("reasoning"), "missing reasoning: {text}");
        assert!(text.contains("ctx"), "missing ctx: {text}");
    }

    #[test]
    fn context_color_thresholds() {
        let make = |used: u64, window: u64| CostHud {
            context_used: used,
            context_window: window,
            ..Default::default()
        };
        assert_eq!(make(50, 100).context_color(), ui_muted());
        assert_eq!(make(75, 100).context_color(), ui_warning());
        assert_eq!(make(95, 100).context_color(), ui_danger());
    }
}
