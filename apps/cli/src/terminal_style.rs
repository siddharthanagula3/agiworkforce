//! Semantic ANSI styles for non-TUI terminal output.
//!
//! Keep literal terminal color choices here so command output, onboarding, and
//! print-mode rendering do not scatter visual policy across feature modules.
//!
//! Every helper strips terminal escapes from its argument first: these
//! wrappers are the shared last step before model, tool, MCP, and checkout
//! text reaches the real terminal, so an OSC 52 clipboard write or a cursor
//! move smuggled through any caller dies here rather than at 20-odd sinks.

use colored::{ColoredString, Colorize};

use crate::terminal_text::sanitize_terminal_text;

pub const PROGRESS_BAR_TEMPLATE: &str = "{msg} [{bar:30.cyan/dim}] {pos}/{len}";
pub const SPINNER_TEMPLATE: &str = "{spinner:.cyan} {msg}";

fn clean(text: impl Into<String>) -> String {
    sanitize_terminal_text(&text.into()).into_owned()
}

pub fn muted(text: impl Into<String>) -> ColoredString {
    clean(text).dimmed()
}

pub fn accent(text: impl Into<String>) -> ColoredString {
    clean(text).cyan()
}

pub fn accent_header(text: impl Into<String>) -> ColoredString {
    clean(text).cyan().bold()
}

pub fn brand(text: impl Into<String>) -> ColoredString {
    clean(text).magenta()
}

pub fn brand_header(text: impl Into<String>) -> ColoredString {
    clean(text).magenta().bold()
}

pub fn success(text: impl Into<String>) -> ColoredString {
    clean(text).green()
}

pub fn success_header(text: impl Into<String>) -> ColoredString {
    clean(text).green().bold()
}

pub fn warning(text: impl Into<String>) -> ColoredString {
    clean(text).yellow()
}

pub fn warning_header(text: impl Into<String>) -> ColoredString {
    clean(text).yellow().bold()
}

pub fn danger(text: impl Into<String>) -> ColoredString {
    clean(text).red()
}

pub fn danger_header(text: impl Into<String>) -> ColoredString {
    clean(text).red().bold()
}

pub fn header(text: impl Into<String>) -> ColoredString {
    clean(text).bold()
}

pub fn prompt(text: impl Into<String>) -> ColoredString {
    clean(text).cyan().bold()
}

pub fn link(text: impl Into<String>) -> ColoredString {
    clean(text).cyan().underline()
}

pub fn code(text: impl Into<String>) -> ColoredString {
    clean(text).bold()
}

pub fn addition(text: impl Into<String>) -> ColoredString {
    success(text)
}

pub fn deletion(text: impl Into<String>) -> ColoredString {
    danger(text)
}

pub fn info_label() -> ColoredString {
    accent_header("info:")
}

pub fn warn_label() -> ColoredString {
    warning_header("warn:")
}

pub fn error_label() -> ColoredString {
    danger_header("error:")
}

#[cfg(test)]
mod tests {
    use super::*;

    const OSC52: &str = "run \u{1b}]52;c;cm0gLXJmIC8=\u{7}now";

    #[test]
    fn every_style_helper_strips_escapes_from_its_argument() {
        let cases: Vec<(&str, ColoredString)> = vec![
            ("muted", muted(OSC52)),
            ("accent", accent(OSC52)),
            ("accent_header", accent_header(OSC52)),
            ("brand", brand(OSC52)),
            ("brand_header", brand_header(OSC52)),
            ("success", success(OSC52)),
            ("success_header", success_header(OSC52)),
            ("warning", warning(OSC52)),
            ("warning_header", warning_header(OSC52)),
            ("danger", danger(OSC52)),
            ("danger_header", danger_header(OSC52)),
            ("header", header(OSC52)),
            ("prompt", prompt(OSC52)),
            ("link", link(OSC52)),
            ("code", code(OSC52)),
            ("addition", addition(OSC52)),
            ("deletion", deletion(OSC52)),
        ];
        for (name, styled) in cases {
            assert_eq!(&*styled, "run now", "{name} passed the payload through");
        }
    }

    #[test]
    fn style_helpers_strip_cursor_moves_and_carriage_returns() {
        assert_eq!(&*danger("\u{1b}[2J\u{1b}[1;1HAPPROVED"), "APPROVED");
        assert_eq!(&*muted("rm -rf /\rsafe"), "rm -rf /safe");
        assert_eq!(&*header("x\u{9b}31mred"), "xred");
    }

    #[test]
    fn style_helpers_keep_ordinary_text_intact() {
        assert_eq!(
            &*accent("plain — ünïcødé ✅\n\tindented"),
            "plain — ünïcødé ✅\n\tindented"
        );
    }
}
