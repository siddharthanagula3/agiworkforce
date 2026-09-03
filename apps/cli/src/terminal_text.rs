use std::borrow::Cow;
use std::iter::Peekable;
use std::str::Chars;

use ratatui::text::Line;

/// Strip terminal control characters and escape sequences from text that did
/// not originate from this process's own formatting.
///
/// Model output, tool results, and fetched pages reach the user's real
/// terminal verbatim; an embedded OSC 52 payload writes to the system
/// clipboard and a CSI cursor move can repaint an approval prompt the
/// operator already answered. Newline and tab survive because the renderers
/// use them for layout.
pub fn sanitize_terminal_text(input: &str) -> Cow<'_, str> {
    if !input.chars().any(is_control_char) {
        return Cow::Borrowed(input);
    }

    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(ch) = chars.next() {
        match ch {
            '\n' | '\t' => out.push(ch),
            ESC => consume_escape(&mut chars),
            CSI_C1 => consume_csi(&mut chars),
            DCS_C1 | SOS_C1 | OSC_C1 | PM_C1 | APC_C1 => consume_string(&mut chars),
            other if is_control_char(other) => {}
            other => out.push(other),
        }
    }
    Cow::Owned(out)
}

/// Strip escapes from ratatui lines that are about to be painted.
///
/// `Paragraph` copies a grapheme into the frame buffer whenever its display
/// width is non-zero, and `unicode-width` scores ESC as one column, so an
/// escape embedded in a span survives ratatui and is written to the real
/// terminal by crossterm. This is the last gate for every transcript line and
/// overlay line built from model, tool, or MCP text.
pub fn sanitize_terminal_lines(lines: &mut [Line<'_>]) {
    for line in lines.iter_mut() {
        sanitize_terminal_line(line);
    }
}

/// Strip escapes from one ratatui line that is about to be painted.
///
/// Chrome rows (header, status bar, composer, banners) are built from a single
/// `Line`, and their fields are not all ours: the model id comes from a config
/// file the agent can write, the branch from the checkout, the fallback reason
/// from the provider.
pub fn sanitize_terminal_line(line: &mut Line<'_>) {
    for span in line.spans.iter_mut() {
        if !span.content.chars().any(is_control_char) {
            continue;
        }
        let clean = sanitize_terminal_text(span.content.as_ref()).into_owned();
        span.content = Cow::Owned(clean);
    }
}

const ESC: char = '\u{1b}';
const BEL: char = '\u{7}';
const DEL: char = '\u{7f}';
const DCS_C1: char = '\u{90}';
const SOS_C1: char = '\u{98}';
const ST_C1: char = '\u{9c}';
const CSI_C1: char = '\u{9b}';
const OSC_C1: char = '\u{9d}';
const PM_C1: char = '\u{9e}';
const APC_C1: char = '\u{9f}';

fn is_control_char(ch: char) -> bool {
    match ch {
        '\n' | '\t' => false,
        DEL => true,
        _ => {
            let code = ch as u32;
            code < 0x20 || (0x80..=0x9f).contains(&code)
        }
    }
}

fn consume_escape(chars: &mut Peekable<Chars<'_>>) {
    match chars.peek() {
        Some('[') => {
            chars.next();
            consume_csi(chars);
        }
        Some(']' | 'P' | 'X' | '^' | '_') => {
            chars.next();
            consume_string(chars);
        }
        Some(&ch) if is_escape_intermediate(ch) => consume_nf_escape(chars),
        Some(_) => {
            chars.next();
        }
        None => {}
    }
}

fn is_escape_intermediate(ch: char) -> bool {
    (0x20..=0x2f).contains(&(ch as u32))
}

fn consume_nf_escape(chars: &mut Peekable<Chars<'_>>) {
    while let Some(&ch) = chars.peek() {
        if is_escape_intermediate(ch) {
            chars.next();
            continue;
        }
        if (0x30..=0x7e).contains(&(ch as u32)) {
            chars.next();
        }
        break;
    }
}

fn consume_csi(chars: &mut Peekable<Chars<'_>>) {
    while let Some(&ch) = chars.peek() {
        let code = ch as u32;
        if (0x20..=0x3f).contains(&code) {
            chars.next();
            continue;
        }
        if (0x40..=0x7e).contains(&code) {
            chars.next();
        }
        break;
    }
}

fn consume_string(chars: &mut Peekable<Chars<'_>>) {
    while let Some(ch) = chars.next() {
        match ch {
            BEL | ST_C1 => return,
            ESC => {
                if chars.peek() == Some(&'\\') {
                    chars.next();
                }
                return;
            }
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clean_text_is_borrowed_unchanged() {
        let out = sanitize_terminal_text("plain text\nwith\ttabs");
        assert!(matches!(out, Cow::Borrowed(_)));
        assert_eq!(out, "plain text\nwith\ttabs");
    }

    #[test]
    fn strips_osc_52_clipboard_write() {
        let payload = "before\u{1b}]52;c;cm0gLXJmIC8=\u{7}after";
        let out = sanitize_terminal_text(payload);
        assert_eq!(out, "beforeafter");
        assert!(!out.contains('\u{1b}'));
        assert!(!out.contains("52;c"));
    }

    #[test]
    fn strips_osc_terminated_by_string_terminator() {
        let out = sanitize_terminal_text("a\u{1b}]0;pwned title\u{1b}\\b");
        assert_eq!(out, "ab");
    }

    #[test]
    fn strips_csi_cursor_and_color_sequences() {
        let out = sanitize_terminal_text("\u{1b}[2J\u{1b}[H\u{1b}[31mAPPROVED\u{1b}[0m");
        assert_eq!(out, "APPROVED");
    }

    #[test]
    fn strips_carriage_return_and_backspace_overwrites() {
        let out = sanitize_terminal_text("rm -rf /\r\u{8}safe");
        assert_eq!(out, "rm -rf /safe");
    }

    #[test]
    fn strips_delete_and_c1_controls() {
        let out = sanitize_terminal_text("a\u{7f}b\u{85}c");
        assert_eq!(out, "abc");
    }

    #[test]
    fn strips_bare_c1_csi_sequence() {
        let out = sanitize_terminal_text("x\u{9b}31mred");
        assert_eq!(out, "xred");
    }

    #[test]
    fn strips_dcs_apc_and_pm_strings() {
        assert_eq!(sanitize_terminal_text("a\u{1b}Pq#0;2;0;0;0\u{1b}\\b"), "ab");
        assert_eq!(sanitize_terminal_text("a\u{1b}_payload\u{1b}\\b"), "ab");
        assert_eq!(sanitize_terminal_text("a\u{1b}^payload\u{1b}\\b"), "ab");
    }

    #[test]
    fn drops_trailing_lone_escape() {
        assert_eq!(sanitize_terminal_text("tail\u{1b}"), "tail");
    }

    #[test]
    fn keeps_text_after_malformed_csi() {
        assert_eq!(sanitize_terminal_text("\u{1b}[1;2é rest"), "é rest");
    }

    #[test]
    fn strips_two_char_and_nf_escape_sequences() {
        assert_eq!(sanitize_terminal_text("a\u{1b}cb"), "ab");
        assert_eq!(sanitize_terminal_text("a\u{1b}7b\u{1b}8c"), "abc");
        assert_eq!(sanitize_terminal_text("a\u{1b}#8b"), "ab");
        assert_eq!(sanitize_terminal_text("a\u{1b}(0lqk\u{1b}(Bb"), "alqkb");
    }

    #[test]
    fn strips_bare_c1_osc_terminated_by_c1_string_terminator() {
        assert_eq!(sanitize_terminal_text("a\u{9d}0;pwned\u{9c}b"), "ab");
    }

    #[test]
    fn doubled_escape_introducer_is_inert() {
        let out = sanitize_terminal_text("a\u{1b}\u{1b}]52;c;cm0gLXJmIC8=\u{7}b");
        assert!(!out.contains('\u{1b}'), "escape survived: {out:?}");
        assert!(
            !out.chars().any(is_control_char),
            "control char survived: {out:?}"
        );
        assert_eq!(out, "a]52;c;cm0gLXJmIC8=b");
    }

    #[test]
    fn escape_split_across_calls_cannot_reassemble() {
        let mut joined = String::new();
        for chunk in ["ok \u{1b}", "]52;c;cm0gLXJmIC8=", "\u{7}done"] {
            joined.push_str(&sanitize_terminal_text(chunk));
        }
        assert!(
            !joined.contains('\u{1b}'),
            "a split escape reassembled: {joined:?}"
        );
        assert!(joined.contains("done"), "text was dropped: {joined:?}");
    }

    #[test]
    fn output_never_contains_a_terminal_control_character() {
        let payloads = [
            "\u{1b}]52;c;cm0gLXJmIC8=\u{7}",
            "\u{1b}]0;title\u{1b}\\",
            "\u{1b}[2J\u{1b}[H\u{1b}[1;1H\u{1b}[31mAPPROVED\u{1b}[0m",
            "\u{1b}[6n",
            "\u{9b}31m\u{9d}0;t\u{9c}",
            "\u{1b}P+q544e\u{1b}\\",
            "\u{1b}_G a=T\u{1b}\\",
            "\u{1b}^irrelevant\u{7}",
            "\u{1b}X sos \u{9c}",
            "line\rover\u{8}write\u{0}\u{7f}\u{85}",
            "\u{1b}",
            "\u{1b}\u{1b}[",
            "\u{1b}(0",
        ];
        for payload in payloads {
            let out = sanitize_terminal_text(payload);
            assert!(
                !out.chars().any(is_control_char),
                "control char survived {payload:?}: {out:?}"
            );
            assert!(
                !out.contains('\u{1b}'),
                "escape survived {payload:?}: {out:?}"
            );
        }
    }

    #[test]
    fn sanitize_terminal_lines_cleans_every_span_and_keeps_styles() {
        use ratatui::style::{Modifier, Style};
        use ratatui::text::Span;

        let style = Style::default().add_modifier(Modifier::BOLD);
        let mut lines = vec![
            Line::from(vec![
                Span::raw("safe "),
                Span::styled("run \u{1b}]52;c;cm0gLXJmIC8=\u{7}now".to_string(), style),
            ]),
            Line::from(Span::raw(
                "\u{1b}[2J\u{1b}[31mAPPROVED\u{1b}[0m".to_string(),
            )),
        ];

        sanitize_terminal_lines(&mut lines);

        let joined: String = lines
            .iter()
            .flat_map(|line| line.spans.iter())
            .map(|span| span.content.as_ref())
            .collect();
        assert_eq!(joined, "safe run nowAPPROVED");
        assert_eq!(lines[0].spans[1].style, style);
    }

    #[test]
    fn preserves_unicode_and_markdown_punctuation() {
        let input = "**bold** `code` [x](https://e.co), ünïcødé ✅";
        assert_eq!(sanitize_terminal_text(input), input);
    }
}
