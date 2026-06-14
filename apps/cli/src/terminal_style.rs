//! Semantic ANSI styles for non-TUI terminal output.
//!
//! Keep literal terminal color choices here so command output, onboarding, and
//! print-mode rendering do not scatter visual policy across feature modules.

use colored::{ColoredString, Colorize};

pub const PROGRESS_BAR_TEMPLATE: &str = "{msg} [{bar:30.cyan/dim}] {pos}/{len}";
pub const SPINNER_TEMPLATE: &str = "{spinner:.cyan} {msg}";

pub fn muted(text: impl Into<String>) -> ColoredString {
    text.into().dimmed()
}

pub fn accent(text: impl Into<String>) -> ColoredString {
    text.into().cyan()
}

pub fn accent_header(text: impl Into<String>) -> ColoredString {
    text.into().cyan().bold()
}

pub fn brand(text: impl Into<String>) -> ColoredString {
    text.into().magenta()
}

pub fn brand_header(text: impl Into<String>) -> ColoredString {
    text.into().magenta().bold()
}

pub fn success(text: impl Into<String>) -> ColoredString {
    text.into().green()
}

pub fn success_header(text: impl Into<String>) -> ColoredString {
    text.into().green().bold()
}

pub fn warning(text: impl Into<String>) -> ColoredString {
    text.into().yellow()
}

pub fn warning_header(text: impl Into<String>) -> ColoredString {
    text.into().yellow().bold()
}

pub fn danger(text: impl Into<String>) -> ColoredString {
    text.into().red()
}

pub fn danger_header(text: impl Into<String>) -> ColoredString {
    text.into().red().bold()
}

pub fn header(text: impl Into<String>) -> ColoredString {
    text.into().bold()
}

pub fn prompt(text: impl Into<String>) -> ColoredString {
    text.into().cyan().bold()
}

pub fn link(text: impl Into<String>) -> ColoredString {
    text.into().cyan().underline()
}

pub fn code(text: impl Into<String>) -> ColoredString {
    text.into().bold()
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
