use indicatif::{ProgressBar, ProgressStyle};
use std::borrow::Cow;
use std::env;
use std::time::Duration;

use crate::markdown::MarkdownRenderer;
use crate::model_catalog;
use crate::terminal_style as ts;
use crate::terminal_text::sanitize_terminal_text;

// ---------------------------------------------------------------------------
// Color depth detection
// ---------------------------------------------------------------------------

/// Terminal color capability level.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ColorLevel {
    /// No color support (e.g. `NO_COLOR` set, dumb terminal, piped output).
    None,
    /// Basic 16-color ANSI support.
    Ansi16,
    /// 256-color xterm palette.
    Ansi256,
    /// 24-bit RGB ("truecolor") support.
    TrueColor,
}

/// Detect the terminal's color capability from environment variables.
///
/// Checks (in order):
/// 1. `NO_COLOR`: if set (any value), returns `None`.
/// 2. `COLORTERM`: `truecolor` or `24bit` → `TrueColor`.
/// 3. `TERM`: contains `256color` → `Ansi256`.
/// 4. Fallback: `Ansi16`.
pub fn detect_color_level() -> ColorLevel {
    // NO_COLOR spec: https://no-color.org/, presence means disable color
    if env::var("NO_COLOR").is_ok() {
        return ColorLevel::None;
    }

    if let Ok(ct) = env::var("COLORTERM") {
        let ct_lower = ct.to_lowercase();
        if ct_lower == "truecolor" || ct_lower == "24bit" {
            return ColorLevel::TrueColor;
        }
    }

    if let Ok(term) = env::var("TERM") {
        if term.contains("256color") {
            return ColorLevel::Ansi256;
        }
    }

    ColorLevel::Ansi16
}

// ---------------------------------------------------------------------------
// Token & duration formatting
// ---------------------------------------------------------------------------

const MILLION: f64 = 1_000_000.0;
const THOUSAND: f64 = 1_000.0;
const MS_PER_SECOND: u64 = 1_000;
const MS_PER_MINUTE: u64 = 60_000;

/// Format a token count with human-readable K/M suffix.
///
/// Examples: `842` → `"842"`, `12500` → `"12.5K"`, `2400000` → `"2.4M"`.
#[allow(dead_code)]
pub fn format_tokens(count: u32) -> String {
    if count as f64 >= MILLION {
        format!("{:.1}M", count as f64 / MILLION)
    } else if count as f64 >= THOUSAND {
        format!("{:.1}K", count as f64 / THOUSAND)
    } else {
        count.to_string()
    }
}

/// Format a duration in milliseconds to a human-readable string.
///
/// Examples: `250` → `"250ms"`, `3400` → `"3.4s"`, `125000` → `"2m 5s"`.
#[allow(dead_code)]
pub fn format_duration_ms(ms: u64) -> String {
    if ms < MS_PER_SECOND {
        format!("{}ms", ms)
    } else if ms < MS_PER_MINUTE {
        format!("{:.1}s", ms as f64 / THOUSAND)
    } else {
        format!(
            "{}m {}s",
            ms / MS_PER_MINUTE,
            (ms % MS_PER_MINUTE) / MS_PER_SECOND
        )
    }
}

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

/// Create a progress bar with the shared terminal progress style.
///
/// Useful for file downloads, bulk operations, or any task with a known total.
#[allow(dead_code)]
pub fn create_progress_bar(total: u64, message: &str) -> ProgressBar {
    let pb = ProgressBar::new(total);
    pb.set_style(
        ProgressStyle::default_bar()
            .template(ts::PROGRESS_BAR_TEMPLATE)
            .expect("valid bar template"),
    );
    pb.set_message(message.to_string());
    pb
}

// ---------------------------------------------------------------------------
// Table formatting
// ---------------------------------------------------------------------------

/// Format tabular data with aligned columns and a header separator.
///
/// Returns an empty string when `headers` is empty.
///
/// Example output:
/// ```text
/// Model             Provider   Cost
/// ─────────────────────────────────
/// fixture-model-a   provider-a  $5.00
/// fixture-model-b   provider-b  $2.00
/// ```
#[allow(dead_code)]
pub fn format_table(headers: &[&str], rows: &[Vec<String>]) -> String {
    if headers.is_empty() {
        return String::new();
    }

    let headers: Vec<Cow<'_, str>> = headers.iter().map(|h| sanitize_terminal_text(h)).collect();
    let rows: Vec<Vec<Cow<'_, str>>> = rows
        .iter()
        .map(|row| row.iter().map(|c| sanitize_terminal_text(c)).collect())
        .collect();

    // Compute column widths, max of header and all cell widths.
    let col_count = headers.len();
    let mut widths: Vec<usize> = headers.iter().map(|h| h.len()).collect();

    for row in &rows {
        for (i, cell) in row.iter().enumerate() {
            if i < col_count {
                widths[i] = widths[i].max(cell.len());
            }
        }
    }

    let mut out = String::new();

    // Header row
    let header_line: Vec<String> = headers
        .iter()
        .enumerate()
        .map(|(i, h)| format!("{:<width$}", h, width = widths[i]))
        .collect();
    out.push_str(&header_line.join("  "));
    out.push('\n');

    // Separator, sum of widths plus 2-space gaps between columns
    let sep_len: usize = widths.iter().sum::<usize>() + (col_count.saturating_sub(1)) * 2;
    for _ in 0..sep_len {
        out.push('\u{2500}'); // ─
    }
    out.push('\n');

    // Data rows
    for row in &rows {
        let cells: Vec<String> = (0..col_count)
            .map(|i| {
                let cell: &str = row.get(i).map(|s| s.as_ref()).unwrap_or("");
                format!("{:<width$}", cell, width = widths[i])
            })
            .collect();
        out.push_str(&cells.join("  "));
        out.push('\n');
    }

    out
}

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

/// Create a spinner with a message, suitable for "thinking" states.
pub fn create_spinner(message: &str) -> ProgressBar {
    let spinner = ProgressBar::new_spinner();
    spinner.set_style(
        ProgressStyle::default_spinner()
            .tick_strings(&[
                "\u{2840}", "\u{28c0}", "\u{28c4}", "\u{28e4}", "\u{28f0}", "\u{28b0}", "\u{2830}",
                "\u{2810}",
            ])
            .template(ts::SPINNER_TEMPLATE)
            .expect("valid spinner template"),
    );
    spinner.set_message(message.to_string());
    spinner.enable_steady_tick(Duration::from_millis(80));
    spinner
}

// ---------------------------------------------------------------------------
// Message formatting
// ---------------------------------------------------------------------------

/// Format and print a user prompt line.
pub fn print_user_prompt() {
    eprint!("{}", ts::prompt("> "));
}

/// Print assistant text chunk. Called incrementally during streaming (raw mode).
pub fn print_assistant_chunk(text: &str) {
    print!("{}", sanitize_terminal_text(text));
    flush_stdout();
}

/// Push buffered stdout out now.
///
/// Rust line-buffers stdout, so a `print!` with no trailing newline sits in the
/// buffer. Streaming assistant text is exactly that: partial lines. Two things
/// break without this flush. Streaming stops looking like streaming, a
/// paragraph appears all at once when its newline finally arrives. Worse, the
/// agent loop's progress banners go to stderr, which is unbuffered, so they
/// overtake the buffered text and the transcript comes out in the wrong order:
/// "Running `echo alpha` first" printed *after* the `[run_command]` line it was
/// written to introduce, and two turns' text fused with no break between them.
fn flush_stdout() {
    use std::io::Write;
    let _ = std::io::stdout().flush();
}

/// Print a newline after assistant response completes.
pub fn print_assistant_end() {
    println!();
}

/// Print a system/info message.
pub fn print_info(message: &str) {
    eprintln!("{} {}", ts::info_label(), sanitize_terminal_text(message));
}

/// Print a warning message.
pub fn print_warn(message: &str) {
    eprintln!("{} {}", ts::warn_label(), sanitize_terminal_text(message));
}

/// Print an error message.
pub fn print_error(message: &str) {
    eprintln!("{} {}", ts::error_label(), sanitize_terminal_text(message));
}

/// Print an already-rendered block (a table, a listing, a raw payload) whose
/// text came from outside this process, the model, a tool, an MCP server, or
/// files in the checkout, with terminal escapes stripped.
pub fn print_block(text: &str) {
    eprintln!("{}", sanitize_terminal_text(text));
}

// ---------------------------------------------------------------------------
// Cost display
// ---------------------------------------------------------------------------

/// Catalog cost per 1M tokens (USD) for known models.
/// Returns (input_cost_per_1m, output_cost_per_1m).
pub fn model_pricing(model: &str) -> (f64, f64) {
    model_catalog::pricing(model)
}

fn format_per_million_rate(rate: f64) -> String {
    if rate >= 1.0 {
        format!("{rate:.2}")
    } else if rate >= 0.01 {
        format!("{rate:.4}")
    } else {
        format!("{rate:.6}")
    }
}

fn pricing_band(label: &str, pricing: model_catalog::TokenPricing) -> String {
    format!(
        "  {label}:\n    Input:       ${}/1M tokens\n    Output:      ${}/1M tokens\n    Cache read:  ${}/1M tokens\n    Cache write: ${}/1M tokens",
        format_per_million_rate(pricing.input_price_per_1m),
        format_per_million_rate(pricing.output_price_per_1m),
        format_per_million_rate(pricing.cache_read_price_per_1m),
        format_per_million_rate(pricing.cache_write_price_per_1m),
    )
}

/// Complete catalog pricing report for `agi --cost` with no prompt.
pub fn format_model_pricing_report(model: &str) -> String {
    let Some(base) = model_catalog::token_pricing(model, 0) else {
        return format!("Model '{model}', no cost (local/unknown model)");
    };
    let tiers = model_catalog::input_token_pricing_tiers(model);
    let has_paid_rate = [
        base.input_price_per_1m,
        base.output_price_per_1m,
        base.cache_read_price_per_1m,
        base.cache_write_price_per_1m,
    ]
    .into_iter()
    .chain(tiers.iter().flat_map(|tier| {
        [
            tier.pricing.input_price_per_1m,
            tier.pricing.output_price_per_1m,
            tier.pricing.cache_read_price_per_1m,
            tier.pricing.cache_write_price_per_1m,
        ]
    }))
    .any(|rate| rate > 0.0);
    if !has_paid_rate {
        return format!("Model '{model}', no cost (local/unknown model)");
    }

    let base_label = tiers.first().map_or_else(
        || "Base".to_string(),
        |tier| {
            format!(
                "Base (input tokens ≤ {})",
                tier.first_billable_token().saturating_sub(1)
            )
        },
    );
    let mut bands = vec![pricing_band(&base_label, base)];
    for (index, tier) in tiers.iter().enumerate() {
        let start = tier.first_billable_token();
        let label = tiers.get(index + 1).map_or_else(
            || format!("Input tokens ≥ {start}"),
            |next| {
                format!(
                    "Input tokens {start}–{}",
                    next.first_billable_token().saturating_sub(1)
                )
            },
        );
        bands.push(pricing_band(&label, tier.pricing));
    }
    format!("Model '{model}' pricing:\n{}", bands.join("\n"))
}

/// Format a cost summary string.
pub fn format_cost(model: &str, input_tokens: u32, output_tokens: u32) -> String {
    let rates = crate::cost_ledger::rates_for_input(model, input_tokens);
    let input_cost = (input_tokens as f64 / 1_000_000.0) * rates.input_per_mtok;
    let output_cost = (output_tokens as f64 / 1_000_000.0) * rates.output_per_mtok;
    let total = input_cost + output_cost;

    if total == 0.0 {
        format!(
            "Tokens: {} in / {} out (no cost, local model)",
            input_tokens, output_tokens
        )
    } else {
        format!(
            "Tokens: {} in / {} out | Cost: ${:.4} (${:.4} in + ${:.4} out)",
            input_tokens, output_tokens, total, input_cost, output_cost
        )
    }
}

/// Format tokens alongside a cost already resolved per provider request. Never
/// recompute `recorded_usd` from the aggregate token fields: a tool loop may
/// contain several requests on different models or pricing tiers.
pub fn format_recorded_cost(
    total_input_tokens: u32,
    total_output_tokens: u32,
    recorded_usd: f64,
) -> String {
    if recorded_usd == 0.0 {
        format!(
            "Tokens: {} in / {} out (no cost, local model)",
            total_input_tokens, total_output_tokens
        )
    } else {
        format!(
            "Tokens: {} in / {} out | Cost: ${:.4}",
            total_input_tokens, total_output_tokens, recorded_usd
        )
    }
}

/// Format cumulative session cost from the per-request ledger total.
pub fn format_accumulated_cost(
    total_input_tokens: u32,
    total_output_tokens: u32,
    total_usd: f64,
) -> String {
    format_recorded_cost(total_input_tokens, total_output_tokens, total_usd)
}

/// Format a cost summary for subscription-routed requests ($0.00).
pub fn format_subscription_cost(input_tokens: u32, output_tokens: u32) -> String {
    format!(
        "Tokens: {} in / {} out | Cost: $0.00 (subscription, included in plan)",
        input_tokens, output_tokens
    )
}

/// Print a cost summary line.
pub fn print_cost(model: &str, input_tokens: u32, output_tokens: u32) {
    let summary = format_cost(model, input_tokens, output_tokens);
    eprintln!("{} {}", ts::muted("cost:"), ts::muted(summary));
}

/// Print a turn cost already resolved per provider request by the ledger.
pub fn print_recorded_cost(input_tokens: u32, output_tokens: u32, recorded_usd: f64) {
    let summary = format_recorded_cost(input_tokens, output_tokens, recorded_usd);
    eprintln!("{} {}", ts::muted("cost:"), ts::muted(summary));
}

/// Print a cost summary line for a subscription-routed request.
pub fn print_subscription_cost(input_tokens: u32, output_tokens: u32) {
    let summary = format_subscription_cost(input_tokens, output_tokens);
    eprintln!("{} {}", ts::muted("cost:"), ts::muted(summary));
}

/// Print a session total cost.
pub fn print_session_cost(total_input: u32, total_output: u32, turn_count: u32, total_usd: f64) {
    let summary = format_accumulated_cost(total_input, total_output, total_usd);
    eprintln!(
        "\n{}\n  {} turns | {} in / {} out\n  {}",
        ts::accent_header("Session Summary"),
        turn_count,
        format_tokens(total_input),
        format_tokens(total_output),
        summary
    );
}

// ---------------------------------------------------------------------------
// Status display
// ---------------------------------------------------------------------------

/// Print a summary of a tool execution (name, duration, pass/fail).
#[allow(dead_code)]
pub fn print_tool_execution_summary(tool_name: &str, duration_ms: u64, success: bool) {
    let status = if success {
        ts::success_header("OK")
    } else {
        ts::danger_header("FAIL")
    };
    let duration = ts::muted(format!("{}ms", duration_ms));
    eprintln!(
        "  {} {} {} {}",
        ts::muted("tool:"),
        ts::accent(sanitize_terminal_text(tool_name)),
        duration,
        status
    );
}

/// Print a context-window usage warning.
/// `usage_pct` is 0.0..=100.0 (percentage of the window consumed).
#[allow(dead_code)]
pub fn print_context_warning(usage_pct: f64, used_tokens: usize, limit: usize) {
    let pct_display = format!("{:.1}%", usage_pct);
    let detail = format!("{}/{} tokens", used_tokens, limit);

    if usage_pct >= 90.0 {
        eprintln!(
            "{} Context window {} ({}), consider compacting",
            ts::danger_header("warn:"),
            ts::danger_header(pct_display),
            ts::muted(detail)
        );
    } else if usage_pct >= 75.0 {
        eprintln!(
            "{} Context window {} ({})",
            ts::warn_label(),
            ts::warning_header(pct_display),
            ts::muted(detail)
        );
    } else {
        eprintln!(
            "{} Context window {} ({})",
            ts::info_label(),
            pct_display,
            ts::muted(detail)
        );
    }
}

/// Print MCP server connection status.
#[allow(dead_code)]
pub fn print_mcp_status(server_name: &str, tool_count: usize) {
    let tools_display = if tool_count == 1 {
        "1 tool".to_string()
    } else {
        format!("{} tools", tool_count)
    };
    eprintln!(
        "  {} {} ({})",
        ts::muted("mcp:"),
        ts::accent(sanitize_terminal_text(server_name)),
        ts::muted(tools_display)
    );
}

/// Print a session-loaded confirmation line.
#[allow(dead_code)]
pub fn print_session_loaded(id: &str, msg_count: usize, model: &str) {
    let msgs = if msg_count == 1 {
        "1 message".to_string()
    } else {
        format!("{} messages", msg_count)
    };
    eprintln!(
        "{} Resumed session {}, {} ({})",
        ts::info_label(),
        ts::muted(sanitize_terminal_text(id)),
        msgs,
        ts::muted(sanitize_terminal_text(model))
    );
}

/// Print a horizontal divider.
#[allow(dead_code)]
pub fn print_divider() {
    eprintln!("{}", ts::muted("─".repeat(50)));
}

// ---------------------------------------------------------------------------
// Splash / branding
// ---------------------------------------------------------------------------

/// Print a one-line compact header shown on every interactive launch.
///
/// Format: `agiworkforce 0.1.0 · provider: anthropic · credentials: OS keyring`
pub fn print_compact_header(provider: &str) {
    let version = env!("CARGO_PKG_VERSION");

    eprintln!(
        "{}",
        ts::muted(format!(
            "agiworkforce {} · provider: {} · credentials: {}",
            version,
            sanitize_terminal_text(provider),
            crate::auth::credential_storage_label(),
        ))
    );
}

/// Print the CLI welcome banner.
pub fn print_banner(model: &str, provider: &str) {
    let color_info = match detect_color_level() {
        ColorLevel::TrueColor | ColorLevel::Ansi256 => "",
        ColorLevel::Ansi16 => " [basic color]",
        ColorLevel::None => " [no color]",
    };
    eprintln!(
        "{} {} {}{}",
        ts::brand_header("AGI CLI"),
        ts::muted(format!("v{}", env!("CARGO_PKG_VERSION"))),
        ts::muted(format!(
            "({} via {})",
            sanitize_terminal_text(model),
            sanitize_terminal_text(provider)
        )),
        ts::muted(color_info)
    );
    eprintln!("{}", ts::muted("Type /help for commands, /exit to quit."));
    eprintln!();
}

/// Print the user's tier to stderr if available from the on-disk cache.
/// This is a best-effort display, it is silently skipped when no cache entry
/// exists (e.g. first-run, BYOK, or local mode).
///
/// Example output: `  Pro`
pub fn print_tier_status() {
    if let Some(cached) = crate::tier_cache::read_tier_cache() {
        eprintln!("{}", ts::muted(format!("  {}", cached.status_label())));
    }
}

// ---------------------------------------------------------------------------
// Markdown-formatted streaming output
// ---------------------------------------------------------------------------

/// Print a streaming chunk through the markdown renderer.
/// Call this instead of `print_assistant_chunk` for formatted output.
pub fn print_assistant_chunk_formatted(renderer: &mut MarkdownRenderer, chunk: &str) {
    let formatted = renderer.process_chunk(chunk);
    if !formatted.is_empty() {
        print!("{}", formatted);
        flush_stdout();
    }
}

/// Flush any remaining buffered markdown content.
/// Call this at the end of a response to emit any trailing text.
pub fn flush_markdown(renderer: &mut MarkdownRenderer) {
    let remaining = renderer.flush();
    if !remaining.is_empty() {
        print!("{}", remaining);
        flush_stdout();
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, MutexGuard, OnceLock};

    /// Assistant text must only reach stdout through this module, because only
    /// this module flushes.
    ///
    /// The original defect was not a missing flush in one function, it was a
    /// *second* streaming sink. `continuation_sink` printed chunks with a bare
    /// `print!`, so the first completion streamed correctly while every
    /// follow-up completion sat in the line buffer and lost its race with the
    /// unbuffered stderr progress banners. The transcript came out reordered
    /// ("Running `echo alpha` first" printed after the `[run_command]` line it
    /// introduced) and consecutive turns fused with no break.
    ///
    /// Fixing the one call site does not stop a third sink appearing, so the
    /// guard is on the shape: no `print!` of a stream chunk outside `output`.
    #[test]
    fn no_streaming_sink_bypasses_this_module() {
        let src = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
        let mut offenders = Vec::new();
        let mut stack = vec![src.clone()];
        while let Some(dir) = stack.pop() {
            for entry in std::fs::read_dir(&dir).expect("read src dir").flatten() {
                let path = entry.path();
                if path.is_dir() {
                    stack.push(path);
                    continue;
                }
                if path.extension().and_then(|e| e.to_str()) != Some("rs") {
                    continue;
                }
                // This module is the one place allowed to print chunks: it flushes.
                if path.file_name().and_then(|n| n.to_str()) == Some("output.rs") {
                    continue;
                }
                let text = std::fs::read_to_string(&path).expect("read source");
                for (i, line) in text.lines().enumerate() {
                    let line = line.trim();
                    if line.starts_with("//") {
                        continue;
                    }
                    if line.contains("print!(\"{}\", chunk)")
                        || line.contains("print!(\"{}\", text)")
                    {
                        offenders.push(format!(
                            "{}:{}",
                            path.strip_prefix(&src).unwrap_or(&path).display(),
                            i + 1
                        ));
                    }
                }
            }
        }
        assert!(
            offenders.is_empty(),
            "streaming chunks printed outside `output` (unflushed, so they \
             reorder against stderr progress output): {offenders:?}. Call \
             `output::print_assistant_chunk` instead."
        );
    }

    fn env_test_lock() -> MutexGuard<'static, ()> {
        static ENV_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        ENV_LOCK
            .get_or_init(|| Mutex::new(()))
            .lock()
            .expect("env test lock")
    }

    fn paid_catalog_model() -> &'static crate::model_catalog::Model {
        crate::model_catalog::catalog()
            .all()
            .iter()
            .find(|model| model.input_price_per_1m > 0.0 && model.output_price_per_1m > 0.0)
            .expect("catalog must contain a paid model")
    }

    fn base_tier_input_tokens(model_id: &str) -> u32 {
        crate::model_catalog::long_context_threshold(model_id)
            .and_then(|threshold| u32::try_from(threshold).ok())
            .unwrap_or(1_000_000)
    }

    // -- model_pricing tests ------------------------------------------------

    #[test]
    fn test_model_pricing_matches_catalog() {
        for model in crate::model_catalog::catalog()
            .all()
            .iter()
            .filter(|model| model.input_price_per_1m > 0.0)
        {
            let (input, output) = model_pricing(&model.id);
            assert_eq!(input, model.input_price_per_1m);
            assert_eq!(output, model.output_price_per_1m);
        }
    }

    #[test]
    fn test_model_pricing_unknown_returns_zero() {
        let (i, o) = model_pricing("fixture-unknown-local-model");
        assert_eq!(i, 0.0);
        assert_eq!(o, 0.0);
    }

    #[test]
    fn test_model_pricing_case_insensitive() {
        // Same model, different case → identical pricing (lookup is case-insensitive).
        let model = paid_catalog_model();
        let (i1, o1) = model_pricing(&model.id.to_uppercase());
        let (i2, o2) = model_pricing(&model.id);
        assert_eq!(i1, i2);
        assert_eq!(o1, o2);
    }

    /// Every banded model in the catalog, not one hand-picked multi-band model:
    /// the report must open each band at its first billable token, close the
    /// preceding one a token earlier, and carry a cache row per band.
    #[test]
    fn pricing_report_includes_all_catalog_input_bands_and_cache_rates() {
        let banded: Vec<_> = crate::model_catalog::catalog()
            .all()
            .iter()
            .map(|model| model.id.clone())
            .filter(|id| !crate::model_catalog::input_token_pricing_tiers(id).is_empty())
            .collect();
        assert!(
            !banded.is_empty(),
            "catalog must contain a model with request-input pricing bands"
        );

        for id in banded {
            let base = crate::model_catalog::token_pricing(&id, 0)
                .expect("catalog model must expose base pricing");
            let tiers = crate::model_catalog::input_token_pricing_tiers(&id);
            let report = format_model_pricing_report(&id);

            assert!(report.contains(&format!(
                "≤ {}",
                tiers[0].first_billable_token().saturating_sub(1)
            )));
            for tier in &tiers {
                assert!(
                    report.contains(&tier.first_billable_token().to_string()),
                    "{id}"
                );
                for rate in [
                    tier.pricing.input_price_per_1m,
                    tier.pricing.output_price_per_1m,
                    tier.pricing.cache_read_price_per_1m,
                    tier.pricing.cache_write_price_per_1m,
                ] {
                    assert!(report.contains(&format_per_million_rate(rate)), "{id}");
                }
            }
            assert!(report.contains(&format_per_million_rate(base.cache_read_price_per_1m)));
            assert!(report.contains(&format_per_million_rate(base.cache_write_price_per_1m)));
            assert_eq!(
                report.matches("Cache read:").count(),
                tiers.len() + 1,
                "{id}"
            );
            assert_eq!(
                report.matches("Cache write:").count(),
                tiers.len() + 1,
                "{id}"
            );
        }
    }

    #[test]
    fn pricing_report_marks_unknown_models_as_no_cost() {
        assert!(format_model_pricing_report("fixture-unknown-local-model").contains("no cost"));
    }

    // -- format_cost tests --------------------------------------------------

    #[test]
    fn test_format_cost_with_known_model() {
        let model = paid_catalog_model();
        let input_tokens = base_tier_input_tokens(&model.id);
        let output_tokens = 500_000;
        let rates = crate::cost_ledger::rates_for(&model.id);
        let input_cost = f64::from(input_tokens) / 1_000_000.0 * rates.input_per_mtok;
        let output_cost = f64::from(output_tokens) / 1_000_000.0 * rates.output_per_mtok;
        let result = format_cost(&model.id, input_tokens, output_tokens);
        assert!(result.contains(&format!("{input_tokens} in")));
        assert!(result.contains("500000 out"));
        assert!(result.contains(&format!("${:.4}", input_cost + output_cost)));
        assert!(result.contains(&format!("${input_cost:.4} in")));
        assert!(result.contains(&format!("${output_cost:.4} out")));
    }

    #[test]
    fn test_format_cost_local_model_zero() {
        let result = format_cost("fixture-unknown-local-model", 5000, 2000);
        assert!(result.contains("no cost"));
        assert!(result.contains("local model"));
        assert!(result.contains("5000 in"));
        assert!(result.contains("2000 out"));
    }

    #[test]
    fn test_format_cost_zero_tokens() {
        let result = format_cost("unknown-local-model", 0, 0);
        // 0 tokens of anything is $0.00, treated as local/zero
        assert!(result.contains("no cost"));
    }

    #[test]
    fn test_format_cost_small_token_counts() {
        let model = paid_catalog_model();
        let result = format_cost(&model.id, 100, 50);
        assert!(result.contains("Cost:"));
        assert!(result.contains("100 in"));
        assert!(result.contains("50 out"));
    }

    #[test]
    fn recorded_turn_display_does_not_reprice_aggregate_tool_loop_tokens() {
        let (model, threshold) = crate::model_catalog::catalog()
            .all()
            .iter()
            .find_map(|model| {
                crate::model_catalog::long_context_threshold(&model.id).and_then(|threshold| {
                    let threshold = u32::try_from(threshold).ok()?;
                    let above = threshold.checked_add(1)?;
                    (crate::cost_ledger::rates_for(&model.id)
                        != crate::cost_ledger::rates_for_input(&model.id, above))
                    .then(|| (model.id.clone(), threshold))
                })
            })
            .expect("catalog must contain a model with a distinct long-context tier");
        let per_request_input = threshold / 2 + 1;
        let completions = [
            crate::cost_ledger::CompletionUsage {
                model: model.clone(),
                input_tokens: per_request_input,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                included_in_subscription: false,
            },
            crate::cost_ledger::CompletionUsage {
                model: model.clone(),
                input_tokens: per_request_input,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                included_in_subscription: false,
            },
        ];
        let aggregate_input = per_request_input * 2;
        let recorded = crate::cost_ledger::dollars_for_completions(&completions);
        let retroactively_repriced =
            crate::cost_ledger::dollars_for(&model, aggregate_input, 0, 0, 0);
        assert_ne!(recorded, retroactively_repriced);

        let result = format_recorded_cost(aggregate_input, 0, recorded);
        assert!(result.contains(&format!("${recorded:.4}")));
        assert!(!result.contains(&format!("${retroactively_repriced:.4}")));
    }

    // -- format_subscription_cost tests ------------------------------------

    #[test]
    fn test_format_subscription_cost_contains_zero() {
        let result = format_subscription_cost(10_000, 5_000);
        assert!(result.contains("$0.00"));
        assert!(result.contains("subscription"));
        assert!(result.contains("10000 in"));
        assert!(result.contains("5000 out"));
    }

    #[test]
    fn test_format_subscription_cost_zero_tokens() {
        let result = format_subscription_cost(0, 0);
        assert!(result.contains("$0.00"));
        assert!(result.contains("0 in"));
        assert!(result.contains("0 out"));
    }

    // -- pricing completeness: every provider branch returns non-negative --

    #[test]
    fn test_all_pricing_branches_non_negative() {
        for model in crate::model_catalog::catalog().all() {
            let (i, o) = model_pricing(&model.id);
            assert!(i >= 0.0, "negative input rate for {}", model.id);
            assert!(o >= 0.0, "negative output rate for {}", model.id);
        }
        assert_eq!(model_pricing("fixture-unknown-local-model"), (0.0, 0.0));
    }

    // -- detect_color_level tests ------------------------------------------

    #[test]
    fn test_color_level_no_color_env() {
        let _guard = env_test_lock();
        // Save and set NO_COLOR
        let prev_no = env::var("NO_COLOR").ok();
        let prev_ct = env::var("COLORTERM").ok();
        let prev_term = env::var("TERM").ok();

        env::set_var("NO_COLOR", "1");
        env::remove_var("COLORTERM");
        env::remove_var("TERM");

        assert_eq!(detect_color_level(), ColorLevel::None);

        // Restore
        match prev_no {
            Some(v) => env::set_var("NO_COLOR", v),
            None => env::remove_var("NO_COLOR"),
        }
        match prev_ct {
            Some(v) => env::set_var("COLORTERM", v),
            None => env::remove_var("COLORTERM"),
        }
        match prev_term {
            Some(v) => env::set_var("TERM", v),
            None => env::remove_var("TERM"),
        }
    }

    #[test]
    fn test_color_level_truecolor() {
        let _guard = env_test_lock();
        let prev_no = env::var("NO_COLOR").ok();
        let prev_ct = env::var("COLORTERM").ok();

        env::remove_var("NO_COLOR");
        env::set_var("COLORTERM", "truecolor");

        assert_eq!(detect_color_level(), ColorLevel::TrueColor);

        match prev_no {
            Some(v) => env::set_var("NO_COLOR", v),
            None => env::remove_var("NO_COLOR"),
        }
        match prev_ct {
            Some(v) => env::set_var("COLORTERM", v),
            None => env::remove_var("COLORTERM"),
        }
    }

    #[test]
    fn test_color_level_24bit() {
        let _guard = env_test_lock();
        let prev_no = env::var("NO_COLOR").ok();
        let prev_ct = env::var("COLORTERM").ok();

        env::remove_var("NO_COLOR");
        env::set_var("COLORTERM", "24bit");

        assert_eq!(detect_color_level(), ColorLevel::TrueColor);

        match prev_no {
            Some(v) => env::set_var("NO_COLOR", v),
            None => env::remove_var("NO_COLOR"),
        }
        match prev_ct {
            Some(v) => env::set_var("COLORTERM", v),
            None => env::remove_var("COLORTERM"),
        }
    }

    #[test]
    fn test_color_level_256color_term() {
        let _guard = env_test_lock();
        let prev_no = env::var("NO_COLOR").ok();
        let prev_ct = env::var("COLORTERM").ok();
        let prev_term = env::var("TERM").ok();

        env::remove_var("NO_COLOR");
        env::remove_var("COLORTERM");
        env::set_var("TERM", "xterm-256color");

        assert_eq!(detect_color_level(), ColorLevel::Ansi256);

        match prev_no {
            Some(v) => env::set_var("NO_COLOR", v),
            None => env::remove_var("NO_COLOR"),
        }
        match prev_ct {
            Some(v) => env::set_var("COLORTERM", v),
            None => env::remove_var("COLORTERM"),
        }
        match prev_term {
            Some(v) => env::set_var("TERM", v),
            None => env::remove_var("TERM"),
        }
    }

    #[test]
    fn test_color_level_fallback_ansi16() {
        let _guard = env_test_lock();
        let prev_no = env::var("NO_COLOR").ok();
        let prev_ct = env::var("COLORTERM").ok();
        let prev_term = env::var("TERM").ok();

        env::remove_var("NO_COLOR");
        env::remove_var("COLORTERM");
        env::set_var("TERM", "xterm");

        assert_eq!(detect_color_level(), ColorLevel::Ansi16);

        match prev_no {
            Some(v) => env::set_var("NO_COLOR", v),
            None => env::remove_var("NO_COLOR"),
        }
        match prev_ct {
            Some(v) => env::set_var("COLORTERM", v),
            None => env::remove_var("COLORTERM"),
        }
        match prev_term {
            Some(v) => env::set_var("TERM", v),
            None => env::remove_var("TERM"),
        }
    }

    #[test]
    fn test_color_level_no_color_takes_priority() {
        let _guard = env_test_lock();
        // NO_COLOR should override COLORTERM=truecolor
        let prev_no = env::var("NO_COLOR").ok();
        let prev_ct = env::var("COLORTERM").ok();

        env::set_var("NO_COLOR", "");
        env::set_var("COLORTERM", "truecolor");

        assert_eq!(detect_color_level(), ColorLevel::None);

        match prev_no {
            Some(v) => env::set_var("NO_COLOR", v),
            None => env::remove_var("NO_COLOR"),
        }
        match prev_ct {
            Some(v) => env::set_var("COLORTERM", v),
            None => env::remove_var("COLORTERM"),
        }
    }

    // -- format_tokens tests -----------------------------------------------

    #[test]
    fn test_format_tokens_small() {
        assert_eq!(format_tokens(0), "0");
        assert_eq!(format_tokens(1), "1");
        assert_eq!(format_tokens(999), "999");
    }

    #[test]
    fn test_format_tokens_thousands() {
        assert_eq!(format_tokens(1_000), "1.0K");
        assert_eq!(format_tokens(12_500), "12.5K");
        assert_eq!(format_tokens(999_999), "1000.0K");
    }

    #[test]
    fn test_format_tokens_millions() {
        assert_eq!(format_tokens(1_000_000), "1.0M");
        assert_eq!(format_tokens(2_400_000), "2.4M");
        assert_eq!(format_tokens(128_000_000), "128.0M");
    }

    // -- format_duration_ms tests ------------------------------------------

    #[test]
    fn test_format_duration_millis() {
        assert_eq!(format_duration_ms(0), "0ms");
        assert_eq!(format_duration_ms(1), "1ms");
        assert_eq!(format_duration_ms(250), "250ms");
        assert_eq!(format_duration_ms(999), "999ms");
    }

    #[test]
    fn test_format_duration_seconds() {
        assert_eq!(format_duration_ms(1_000), "1.0s");
        assert_eq!(format_duration_ms(3_400), "3.4s");
        assert_eq!(format_duration_ms(59_999), "60.0s");
    }

    #[test]
    fn test_format_duration_minutes() {
        assert_eq!(format_duration_ms(60_000), "1m 0s");
        assert_eq!(format_duration_ms(125_000), "2m 5s");
        assert_eq!(format_duration_ms(3_600_000), "60m 0s");
    }

    // -- format_table tests ------------------------------------------------

    #[test]
    fn test_format_table_empty_headers() {
        let result = format_table(&[], &[]);
        assert_eq!(result, "");
    }

    #[test]
    fn test_format_table_headers_only() {
        let result = format_table(&["Name", "Age"], &[]);
        let lines: Vec<&str> = result.lines().collect();
        assert_eq!(lines.len(), 2); // header + separator
        assert!(lines[0].contains("Name"));
        assert!(lines[0].contains("Age"));
        // Separator should be all ─ characters
        assert!(lines[1].chars().all(|c| c == '\u{2500}'));
    }

    #[test]
    fn test_format_table_alignment() {
        let headers = &["Model", "Cost"];
        let rows = vec![
            vec!["fixture-short".to_string(), "$2.50".to_string()],
            vec!["fixture-model-long".to_string(), "$15.00".to_string()],
        ];
        let result = format_table(headers, &rows);
        let lines: Vec<&str> = result.lines().collect();
        assert_eq!(lines.len(), 4); // header + separator + 2 data rows

        // The widest fixture cell determines the padding for every row.
        // in col 0 should be padded to at least that width.
        assert!(lines[0].starts_with("Model"));
        assert!(lines[2].starts_with("fixture-short"));
        assert!(lines[3].starts_with("fixture-model-long"));
    }

    #[test]
    fn format_table_strips_escape_sequences_from_cells() {
        let headers = &["Provider", "URL"];
        let rows = vec![vec![
            "evil\u{1b}]52;c;cm0gLXJmIC8=\u{7}corp".to_string(),
            "https://e.co\u{1b}[2J\u{1b}[31m".to_string(),
        ]];
        let result = format_table(headers, &rows);

        assert!(!result.contains('\u{1b}'), "escape survived: {result:?}");
        assert!(
            !result.contains("cm0gLXJmIC8="),
            "OSC 52 payload survived: {result:?}"
        );
        assert!(!result.contains("[2J"), "screen clear survived: {result:?}");
        assert!(result.contains("evilcorp"), "text was mangled: {result:?}");
    }

    #[test]
    fn test_format_table_missing_cells() {
        let headers = &["A", "B", "C"];
        let rows = vec![
            vec!["1".to_string()], // only 1 cell, B and C should be blank
        ];
        let result = format_table(headers, &rows);
        let lines: Vec<&str> = result.lines().collect();
        assert_eq!(lines.len(), 3); // header + sep + 1 row
                                    // Row should contain "1" and two blank-padded cells
        assert!(lines[2].starts_with('1'));
    }
}
