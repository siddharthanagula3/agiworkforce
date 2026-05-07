use colored::Colorize;
use indicatif::{ProgressBar, ProgressStyle};
use std::env;
use std::time::Duration;

use crate::markdown::MarkdownRenderer;
use crate::provider;

// ---------------------------------------------------------------------------
// Color depth detection
// ---------------------------------------------------------------------------

/// Terminal color capability level.
#[derive(Debug, Clone, Copy, PartialEq)]
#[allow(dead_code)]
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
/// 1. `NO_COLOR` — if set (any value), returns `None`.
/// 2. `COLORTERM` — `truecolor` or `24bit` → `TrueColor`.
/// 3. `TERM` — contains `256color` → `Ansi256`.
/// 4. Fallback: `Ansi16`.
#[allow(dead_code)]
pub fn detect_color_level() -> ColorLevel {
    // NO_COLOR spec: https://no-color.org/ — presence means disable color
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

/// Create a progress bar with a cyan bar style.
///
/// Useful for file downloads, bulk operations, or any task with a known total.
#[allow(dead_code)]
pub fn create_progress_bar(total: u64, message: &str) -> ProgressBar {
    let pb = ProgressBar::new(total);
    pb.set_style(
        ProgressStyle::default_bar()
            .template("{msg} [{bar:30.cyan/dim}] {pos}/{len}")
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
/// claude-opus-4-6   anthropic  $15.00
/// gpt-5.5           openai     $1.25
/// ```
#[allow(dead_code)]
pub fn format_table(headers: &[&str], rows: &[Vec<String>]) -> String {
    if headers.is_empty() {
        return String::new();
    }

    // Compute column widths — max of header and all cell widths.
    let col_count = headers.len();
    let mut widths: Vec<usize> = headers.iter().map(|h| h.len()).collect();

    for row in rows {
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

    // Separator — sum of widths plus 2-space gaps between columns
    let sep_len: usize = widths.iter().sum::<usize>() + (col_count.saturating_sub(1)) * 2;
    for _ in 0..sep_len {
        out.push('\u{2500}'); // ─
    }
    out.push('\n');

    // Data rows
    for row in rows {
        let cells: Vec<String> = (0..col_count)
            .map(|i| {
                let cell = row.get(i).map(|s| s.as_str()).unwrap_or("");
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
            .template("{spinner:.cyan} {msg}")
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
    eprint!("{}", "> ".green().bold());
}

/// Print assistant text chunk. Called incrementally during streaming (raw mode).
pub fn print_assistant_chunk(text: &str) {
    print!("{}", text);
}

/// Print a newline after assistant response completes.
pub fn print_assistant_end() {
    println!();
}

/// Print a system/info message.
pub fn print_info(message: &str) {
    eprintln!("{} {}", "info:".cyan().bold(), message);
}

/// Print a warning message.
pub fn print_warn(message: &str) {
    eprintln!("{} {}", "warn:".yellow().bold(), message);
}

/// Print an error message.
pub fn print_error(message: &str) {
    eprintln!("{} {}", "error:".red().bold(), message);
}

// ---------------------------------------------------------------------------
// Cost display
// ---------------------------------------------------------------------------

/// Rough cost estimation per 1M tokens (USD) for well-known models.
/// Returns (input_cost_per_1m, output_cost_per_1m).
pub fn model_pricing(model: &str) -> (f64, f64) {
    provider::find_model(model)
        .map(|info| (info.input_price_per_1m, info.output_price_per_1m))
        .unwrap_or((0.0, 0.0))
}

/// Format a cost summary string.
pub fn format_cost(model: &str, input_tokens: u32, output_tokens: u32) -> String {
    let (input_rate, output_rate) = model_pricing(model);
    let input_cost = (input_tokens as f64 / 1_000_000.0) * input_rate;
    let output_cost = (output_tokens as f64 / 1_000_000.0) * output_rate;
    let total = input_cost + output_cost;

    if total == 0.0 {
        format!(
            "Tokens: {} in / {} out (no cost — local model)",
            input_tokens, output_tokens
        )
    } else {
        format!(
            "Tokens: {} in / {} out | Cost: ${:.4} (${:.4} in + ${:.4} out)",
            input_tokens, output_tokens, total, input_cost, output_cost
        )
    }
}

/// Format a cost summary for subscription-routed requests ($0.00).
pub fn format_subscription_cost(input_tokens: u32, output_tokens: u32) -> String {
    format!(
        "Tokens: {} in / {} out | Cost: $0.00 (subscription — included in plan)",
        input_tokens, output_tokens
    )
}

/// Print a cost summary line.
pub fn print_cost(model: &str, input_tokens: u32, output_tokens: u32) {
    let summary = format_cost(model, input_tokens, output_tokens);
    eprintln!("{} {}", "cost:".dimmed(), summary.dimmed());
}

/// Print a cost summary line for a subscription-routed request.
pub fn print_subscription_cost(input_tokens: u32, output_tokens: u32) {
    let summary = format_subscription_cost(input_tokens, output_tokens);
    eprintln!("{} {}", "cost:".dimmed(), summary.dimmed());
}

/// Print a session total cost.
pub fn print_session_cost(model: &str, total_input: u32, total_output: u32, turn_count: u32) {
    let summary = format_cost(model, total_input, total_output);
    eprintln!(
        "\n{}\n  {} turns | {} in / {} out\n  {}",
        "Session Summary".cyan().bold(),
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
        "OK".green().bold()
    } else {
        "FAIL".red().bold()
    };
    let duration = format!("{}ms", duration_ms).dimmed();
    eprintln!(
        "  {} {} {} {}",
        "tool:".dimmed(),
        tool_name.cyan(),
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
            "{} Context window {} ({}) — consider compacting",
            "warn:".red().bold(),
            pct_display.red().bold(),
            detail.dimmed()
        );
    } else if usage_pct >= 75.0 {
        eprintln!(
            "{} Context window {} ({})",
            "warn:".yellow().bold(),
            pct_display.yellow().bold(),
            detail.dimmed()
        );
    } else {
        eprintln!(
            "{} Context window {} ({})",
            "info:".cyan().bold(),
            pct_display,
            detail.dimmed()
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
        "mcp:".dimmed(),
        server_name.cyan(),
        tools_display.dimmed()
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
        "{} Resumed session {} — {} ({})",
        "info:".cyan().bold(),
        id.dimmed(),
        msgs,
        model.dimmed()
    );
}

/// Print a horizontal divider.
#[allow(dead_code)]
pub fn print_divider() {
    eprintln!("{}", "─".repeat(50).dimmed());
}

// ---------------------------------------------------------------------------
// Splash / branding
// ---------------------------------------------------------------------------

/// Print a one-line compact header shown on every interactive launch.
///
/// Format: `agiworkforce 0.1.0 · provider: anthropic · ~/.agiworkforce/auth.json`
pub fn print_compact_header(provider: &str) {
    let version = env!("CARGO_PKG_VERSION");
    // Resolve auth.json path — fall back to a tilde-prefixed literal if
    // config_dir() is unavailable (e.g., $HOME not set).
    let auth_path = crate::config::CliConfig::config_dir()
        .map(|d| {
            let p = d.join("auth.json");
            // Prefer the tilde-abbreviated form for readability.
            if let Ok(home) = std::env::var("HOME") {
                let home_path = std::path::Path::new(&home);
                if let Ok(rel) = p.strip_prefix(home_path) {
                    return format!("~/{}", rel.display());
                }
            }
            p.display().to_string()
        })
        .unwrap_or_else(|_| "~/.agiworkforce/auth.json".to_string());

    eprintln!(
        "{}",
        format!(
            "agiworkforce {} · provider: {} · {}",
            version, provider, auth_path
        )
        .dimmed()
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
        "AGI Workforce CLI".bold(),
        format!("v{}", env!("CARGO_PKG_VERSION")).dimmed(),
        format!("({} via {})", model, provider).dimmed(),
        color_info.dimmed()
    );
    eprintln!("{}", "Type /help for commands, /exit to quit.".dimmed());
    eprintln!();
}

/// Print the user's tier and token usage to stderr if available from the
/// on-disk cache.  This is a best-effort display — it is silently skipped when
/// no cache entry exists (e.g. first-run, BYOK, or local mode).
///
/// Example output: `  Hobby · 1.3M/2.0M tokens`
pub fn print_tier_status() {
    if let Some(cached) = crate::tier_cache::read_tier_cache() {
        eprintln!("{}", format!("  {}", cached.status_label()).dimmed());
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
    }
}

/// Flush any remaining buffered markdown content.
/// Call this at the end of a response to emit any trailing text.
pub fn flush_markdown(renderer: &mut MarkdownRenderer) {
    let remaining = renderer.flush();
    if !remaining.is_empty() {
        print!("{}", remaining);
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, MutexGuard, OnceLock};

    fn env_test_lock() -> MutexGuard<'static, ()> {
        static ENV_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        ENV_LOCK
            .get_or_init(|| Mutex::new(()))
            .lock()
            .expect("env test lock")
    }

    // -- model_pricing tests ------------------------------------------------

    #[test]
    fn test_model_pricing_anthropic_opus() {
        let (i, o) = model_pricing("claude-opus-4-6");
        assert_eq!(i, 5.0);
        assert_eq!(o, 25.0);
    }

    #[test]
    fn test_model_pricing_anthropic_sonnet() {
        let (i, o) = model_pricing("claude-sonnet-4-6");
        assert_eq!(i, 3.0);
        assert_eq!(o, 15.0);
    }

    #[test]
    fn test_model_pricing_anthropic_haiku() {
        let (i, o) = model_pricing("claude-haiku-4-5-20251001");
        assert_eq!(i, 1.0);
        assert_eq!(o, 5.0);
    }

    #[test]
    fn test_model_pricing_openai_gpt54() {
        let (i, o) = model_pricing("gpt-5.4");
        assert_eq!(i, 2.50);
        assert_eq!(o, 15.0);
    }

    #[test]
    fn test_model_pricing_openai_gpt54_mini() {
        let (i, o) = model_pricing("gpt-5.4-mini");
        assert_eq!(i, 0.75);
        assert_eq!(o, 4.50);
    }

    #[test]
    fn test_model_pricing_openai_gpt54_pro() {
        let (i, o) = model_pricing("gpt-5.4-pro");
        assert_eq!(i, 30.0);
        assert_eq!(o, 180.0);
    }

    #[test]
    fn test_model_pricing_deepseek_reasoner() {
        let (i, o) = model_pricing("deepseek-reasoner");
        assert_eq!(i, 0.28);
        assert_eq!(o, 0.42);
    }

    #[test]
    fn test_model_pricing_unknown_returns_zero() {
        let (i, o) = model_pricing("llama3.1:8b");
        assert_eq!(i, 0.0);
        assert_eq!(o, 0.0);
    }

    #[test]
    fn test_model_pricing_case_insensitive() {
        let (i1, o1) = model_pricing("Claude-Opus-4-6");
        let (i2, o2) = model_pricing("claude-opus-4-6");
        assert_eq!(i1, i2);
        assert_eq!(o1, o2);
    }

    // -- format_cost tests --------------------------------------------------

    #[test]
    fn test_format_cost_with_known_model() {
        let result = format_cost("claude-sonnet-4-6", 1_000_000, 500_000);
        // Input: 1M * $3.0/1M = $3.0000
        // Output: 500K * $15.0/1M = $7.5000
        // Total: $10.5000
        assert!(result.contains("1000000 in"));
        assert!(result.contains("500000 out"));
        assert!(result.contains("$10.5000"));
        assert!(result.contains("$3.0000 in"));
        assert!(result.contains("$7.5000 out"));
    }

    #[test]
    fn test_format_cost_local_model_zero() {
        let result = format_cost("llama3.1:8b", 5000, 2000);
        assert!(result.contains("no cost"));
        assert!(result.contains("local model"));
        assert!(result.contains("5000 in"));
        assert!(result.contains("2000 out"));
    }

    #[test]
    fn test_format_cost_zero_tokens() {
        let result = format_cost("gpt-5.4", 0, 0);
        // 0 tokens of anything is $0.00 — treated as local/zero
        assert!(result.contains("no cost"));
    }

    #[test]
    fn test_format_cost_small_token_counts() {
        let result = format_cost("claude-opus-4-6", 100, 50);
        // Input: 100/1M * 15 = $0.0015
        // Output: 50/1M * 75 = $0.00375
        // Total: ~$0.00525
        assert!(result.contains("Cost:"));
        assert!(result.contains("100 in"));
        assert!(result.contains("50 out"));
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
        let models = [
            "claude-opus-4-6",
            "claude-sonnet-4-6",
            "claude-haiku-4-5-20251001",
            "gpt-5.4-mini",
            "gpt-5.4",
            "gpt-5.4-pro",
            "gemini-3.1-flash-lite",
            "gemini-3.1-pro-preview",
            "mistral-large-2512",
            "mistral-medium-2508",
            "grok-4-0709",
            "deepseek-reasoner",
            "deepseek-chat",
            "unknown-local-model",
        ];

        for model in &models {
            let (i, o) = model_pricing(model);
            assert!(i >= 0.0, "negative input rate for {}", model);
            assert!(o >= 0.0, "negative output rate for {}", model);
        }
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
            vec!["gpt-5.4".to_string(), "$2.50".to_string()],
            vec!["claude-opus-4".to_string(), "$15.00".to_string()],
        ];
        let result = format_table(headers, &rows);
        let lines: Vec<&str> = result.lines().collect();
        assert_eq!(lines.len(), 4); // header + separator + 2 data rows

        // Widest cell in col 0 is "claude-opus-4" (13 chars), so all rows
        // in col 0 should be padded to at least that width.
        assert!(lines[0].starts_with("Model"));
        assert!(lines[2].starts_with("gpt-5.4"));
        assert!(lines[3].starts_with("claude-opus-4"));
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

    // -- create_progress_bar tests -----------------------------------------

    #[test]
    fn test_create_progress_bar_returns_bar() {
        let pb = create_progress_bar(100, "Downloading");
        assert_eq!(pb.length(), Some(100));
        assert_eq!(pb.position(), 0);
        pb.finish_and_clear();
    }
}
