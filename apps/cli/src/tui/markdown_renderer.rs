// Markdown → ratatui rendering with syntax highlighting
// Markdown rendering with syntax highlighting

use pulldown_cmark::{CodeBlockKind, Event, Options, Parser, Tag, TagEnd};
use ratatui::style::{Modifier, Style};
use ratatui::text::{Line, Span};
use std::str::FromStr;
use std::sync::{Arc, Mutex, OnceLock};
use syntect::easy::HighlightLines;
use syntect::highlighting::{
    Color as SyntectColor, ScopeSelectors, StyleModifier, Theme, ThemeItem, ThemeSettings,
};
use syntect::parsing::SyntaxSet;
use syntect::util::LinesWithEndings;

use crate::terminal_text::sanitize_terminal_text;
use crate::tui::terminal_palette::{
    best_color, palette_version, syntax_palette, ui_accent, ui_muted, ui_success, SyntaxPalette,
};
use crate::tui::{display_width, pad_to_cols};

static SYNTAX_SET: OnceLock<SyntaxSet> = OnceLock::new();
static THEME: Mutex<Option<(u64, Arc<Theme>)>> = Mutex::new(None);

const TERMINAL_FOREGROUND: SyntectColor = SyntectColor {
    r: 0,
    g: 0,
    b: 0,
    a: 0,
};

fn syntax_set() -> &'static SyntaxSet {
    SYNTAX_SET.get_or_init(two_face::syntax::extra_newlines)
}

fn theme() -> Arc<Theme> {
    let version = palette_version();
    let mut cached = THEME
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some((built_for, theme)) = cached.as_ref() {
        if *built_for == version {
            return Arc::clone(theme);
        }
    }
    let theme = Arc::new(code_theme(syntax_palette()));
    *cached = Some((version, Arc::clone(&theme)));
    theme
}

fn code_theme(palette: SyntaxPalette) -> Theme {
    let rule = |selectors: &str, (r, g, b): (u8, u8, u8)| ThemeItem {
        scope: ScopeSelectors::from_str(selectors).unwrap_or_default(),
        style: StyleModifier {
            foreground: Some(SyntectColor { r, g, b, a: 0xff }),
            ..StyleModifier::default()
        },
    };
    Theme {
        settings: ThemeSettings {
            foreground: Some(TERMINAL_FOREGROUND),
            ..ThemeSettings::default()
        },
        scopes: vec![
            rule("comment", palette.comment),
            rule("string", palette.string),
            rule(
                "constant.numeric, constant.language, constant.character",
                palette.constant,
            ),
            rule("keyword, storage", palette.keyword),
            rule("entity.name.function, support.function", palette.function),
            rule("invalid", palette.invalid),
        ],
        ..Theme::default()
    }
}

fn ansi_color(color: ratatui::style::Color, foreground: bool) -> Option<String> {
    use ratatui::style::Color;
    let base = if foreground { 30 } else { 40 };
    let named =
        |offset: u8, bright: bool| Some(format!("{}", base + offset + if bright { 60 } else { 0 }));
    match color {
        Color::Reset => None,
        Color::Black => named(0, false),
        Color::Red => named(1, false),
        Color::Green => named(2, false),
        Color::Yellow => named(3, false),
        Color::Blue => named(4, false),
        Color::Magenta => named(5, false),
        Color::Cyan => named(6, false),
        Color::Gray => named(7, false),
        Color::DarkGray => named(0, true),
        Color::LightRed => named(1, true),
        Color::LightGreen => named(2, true),
        Color::LightYellow => named(3, true),
        Color::LightBlue => named(4, true),
        Color::LightMagenta => named(5, true),
        Color::LightCyan => named(6, true),
        Color::White => named(7, true),
        Color::Rgb(red, green, blue) => Some(format!("{};2;{red};{green};{blue}", base + 8)),
        Color::Indexed(index) => Some(format!("{};5;{index}", base + 8)),
    }
}

pub fn render_markdown_ansi(text: &str) -> String {
    let mut output = String::new();
    for line in render_markdown(text) {
        for span in line.spans {
            let mut codes = Vec::new();
            if let Some(code) = span.style.fg.and_then(|color| ansi_color(color, true)) {
                codes.push(code);
            }
            if let Some(code) = span.style.bg.and_then(|color| ansi_color(color, false)) {
                codes.push(code);
            }
            let modifiers = span.style.add_modifier;
            for (modifier, code) in [
                (Modifier::BOLD, "1"),
                (Modifier::DIM, "2"),
                (Modifier::ITALIC, "3"),
                (Modifier::UNDERLINED, "4"),
                (Modifier::CROSSED_OUT, "9"),
            ] {
                if modifiers.contains(modifier) {
                    codes.push(code.to_string());
                }
            }
            if codes.is_empty() {
                output.push_str(&span.content);
            } else {
                output.push_str(&format!("\x1b[{}m{}\x1b[0m", codes.join(";"), span.content));
            }
        }
        output.push('\n');
    }
    output
}

/// Render markdown text into styled ratatui Lines with syntax highlighting.
pub fn render_markdown(text: &str) -> Vec<Line<'static>> {
    let mut lines: Vec<Line<'static>> = Vec::new();
    let mut current_spans: Vec<Span<'static>> = Vec::new();

    let text = sanitize_terminal_text(text);
    let parser = Parser::new_ext(
        text.as_ref(),
        Options::ENABLE_TABLES | Options::ENABLE_STRIKETHROUGH,
    );

    let mut in_code_block = false;
    let mut in_table_cell = false;
    let mut current_cell = String::new();
    let mut current_row: Vec<String> = Vec::new();
    let mut table_rows: Vec<Vec<String>> = Vec::new();
    let mut table_header_rows = 0usize;
    let mut code_lang = String::new();
    let mut code_content = String::new();
    let mut in_heading = false;
    let mut heading_level = 0u8;
    let mut in_bold = false;
    let mut in_italic = false;
    let mut in_strike = false;
    let mut in_link = false;
    let mut link_url = String::new();
    let mut link_text = String::new();
    let mut lists: Vec<ListLevel> = Vec::new();
    let mut item_fresh = false;
    let mut block_gap = false;
    let mut in_blockquote = false;

    for event in parser {
        match event {
            Event::Start(Tag::CodeBlock(kind)) => {
                open_block(&mut lines, &mut current_spans, &mut block_gap);
                item_fresh = false;
                in_code_block = true;
                code_content.clear();
                code_lang = match kind {
                    CodeBlockKind::Fenced(lang) => lang.to_string(),
                    CodeBlockKind::Indented => String::new(),
                };
                // Code block header
                let lang_display = if code_lang.is_empty() {
                    "code"
                } else {
                    &code_lang
                };
                lines.push(Line::from(Span::styled(
                    format!("    ┌─ {lang_display} ─"),
                    Style::default().fg(ui_muted()),
                )));
            }
            Event::End(TagEnd::CodeBlock) => {
                // Syntax highlight the code block
                let highlighted = highlight_code(&code_content, &code_lang);
                lines.extend(highlighted);
                lines.push(Line::from(Span::styled(
                    "    └──────────",
                    Style::default().fg(ui_muted()),
                )));
                in_code_block = false;
                block_gap = true;
            }
            Event::Start(Tag::Heading { level, .. }) => {
                open_block(&mut lines, &mut current_spans, &mut block_gap);
                in_heading = true;
                heading_level = level as u8;
            }
            Event::End(TagEnd::Heading(_)) => {
                // Style the heading
                let style = match heading_level {
                    1 => Style::default()
                        .fg(ui_accent())
                        .add_modifier(Modifier::BOLD | Modifier::UNDERLINED),
                    2 => Style::default()
                        .fg(ui_accent())
                        .add_modifier(Modifier::BOLD),
                    _ => Style::default().add_modifier(Modifier::ITALIC),
                };
                let prefix = "#".repeat(heading_level as usize);
                let heading_text: String = current_spans
                    .iter()
                    .map(|s| s.content.to_string())
                    .collect();
                current_spans.clear();
                current_spans.push(Span::styled(format!("    {prefix} {heading_text}"), style));
                flush_line(&mut lines, &mut current_spans);
                in_heading = false;
                block_gap = true;
            }
            Event::Start(Tag::Strong) => {
                in_bold = true;
            }
            Event::End(TagEnd::Strong) => {
                in_bold = false;
            }
            Event::Start(Tag::Emphasis) => {
                in_italic = true;
            }
            Event::End(TagEnd::Emphasis) => {
                in_italic = false;
            }
            Event::Start(Tag::Strikethrough) => {
                in_strike = true;
            }
            Event::End(TagEnd::Strikethrough) => {
                in_strike = false;
            }
            Event::Code(code) => {
                if in_link {
                    link_text.push_str(&code);
                }
                if in_table_cell {
                    current_cell.push_str(&code);
                } else {
                    push_prefix(&mut current_spans, in_blockquote, in_heading, &lists);
                    current_spans.push(Span::styled(
                        code.to_string(),
                        Style::default().fg(ui_accent()),
                    ));
                }
            }
            Event::Start(Tag::Link { dest_url, .. }) => {
                in_link = true;
                link_url = dest_url.to_string();
                link_text.clear();
            }
            Event::End(TagEnd::Link) => {
                in_link = false;
                let text = link_text.trim();
                let shown = !link_url.is_empty()
                    && text != link_url
                    && text != link_url.trim_start_matches("mailto:");
                if shown {
                    let suffix = format!(" ({link_url})");
                    if in_table_cell {
                        current_cell.push_str(&suffix);
                    } else {
                        current_spans.push(Span::styled(suffix, Style::default().fg(ui_muted())));
                    }
                }
            }
            Event::Start(Tag::List(start)) => {
                if lists.is_empty() {
                    open_block(&mut lines, &mut current_spans, &mut block_gap);
                } else {
                    flush_line(&mut lines, &mut current_spans);
                }
                item_fresh = false;
                lists.push(ListLevel {
                    next: start,
                    content: 0,
                });
            }
            Event::End(TagEnd::List(_)) => {
                flush_line(&mut lines, &mut current_spans);
                lists.pop();
                if lists.is_empty() {
                    block_gap = true;
                }
            }
            Event::Start(Tag::Item) => {
                open_block(&mut lines, &mut current_spans, &mut block_gap);
                let indent = " ".repeat(4 + 2 * lists.len().saturating_sub(1));
                let bullet = match lists.last_mut() {
                    Some(level) => {
                        let bullet = match level.next.as_mut() {
                            Some(n) => {
                                let s = format!("{indent}{n}. ");
                                *n += 1;
                                s
                            }
                            None => format!("{indent}• "),
                        };
                        level.content = display_width(&bullet);
                        bullet
                    }
                    None => format!("{indent}• "),
                };
                current_spans.push(Span::styled(bullet, Style::default().fg(ui_accent())));
                item_fresh = true;
            }
            Event::End(TagEnd::Item) => {
                flush_line(&mut lines, &mut current_spans);
                item_fresh = false;
            }
            Event::Start(Tag::BlockQuote(_)) => {
                open_block(&mut lines, &mut current_spans, &mut block_gap);
                in_blockquote = true;
            }
            Event::End(TagEnd::BlockQuote(_)) => {
                flush_line(&mut lines, &mut current_spans);
                in_blockquote = false;
                block_gap = true;
            }
            Event::Start(Tag::Paragraph) => {
                if item_fresh {
                    item_fresh = false;
                } else {
                    open_block(&mut lines, &mut current_spans, &mut block_gap);
                }
            }
            Event::End(TagEnd::Paragraph) => {
                flush_line(&mut lines, &mut current_spans);
                block_gap = true;
            }
            Event::Text(text) => {
                item_fresh = false;
                if in_link {
                    link_text.push_str(&text);
                }
                if in_table_cell {
                    current_cell.push_str(&text);
                } else if in_code_block {
                    code_content.push_str(&text);
                } else {
                    let mut style = Style::default();
                    if in_blockquote {
                        style = style.fg(ui_success()).add_modifier(Modifier::ITALIC);
                    }
                    if in_link {
                        style = style.fg(ui_accent()).add_modifier(Modifier::UNDERLINED);
                    }
                    if in_bold {
                        style = style.add_modifier(Modifier::BOLD);
                    }
                    if in_italic {
                        style = style.add_modifier(Modifier::ITALIC);
                    }
                    if in_strike {
                        style = style.add_modifier(Modifier::CROSSED_OUT);
                    }
                    push_prefix(&mut current_spans, in_blockquote, in_heading, &lists);
                    current_spans.push(Span::styled(text.to_string(), style));
                }
            }
            Event::SoftBreak => {
                flush_line(&mut lines, &mut current_spans);
            }
            Event::HardBreak => {
                flush_line(&mut lines, &mut current_spans);
                lines.push(Line::from(""));
            }
            Event::Rule => {
                open_block(&mut lines, &mut current_spans, &mut block_gap);
                lines.push(Line::from(Span::styled(
                    "    ────────────────────────────────",
                    Style::default().fg(ui_muted()),
                )));
                block_gap = true;
            }
            Event::Start(Tag::Table(_)) => {
                open_block(&mut lines, &mut current_spans, &mut block_gap);
                table_rows.clear();
                current_row.clear();
                table_header_rows = 0;
            }
            Event::Start(Tag::TableHead) | Event::Start(Tag::TableRow) => {
                current_row.clear();
            }
            Event::End(TagEnd::TableHead) => {
                if !current_row.is_empty() {
                    table_rows.push(std::mem::take(&mut current_row));
                    table_header_rows = table_rows.len();
                }
            }
            Event::End(TagEnd::TableRow) => {
                if !current_row.is_empty() {
                    table_rows.push(std::mem::take(&mut current_row));
                }
            }
            Event::Start(Tag::TableCell) => {
                in_table_cell = true;
                current_cell.clear();
            }
            Event::End(TagEnd::TableCell) => {
                in_table_cell = false;
                current_row.push(current_cell.trim().to_string());
            }
            Event::End(TagEnd::Table) => {
                lines.extend(render_table(&table_rows, table_header_rows));
                block_gap = true;
            }
            _ => {}
        }
    }

    flush_line(&mut lines, &mut current_spans);
    lines
}

/// Render a parsed GFM table as bordered, column-aligned terminal lines with a
/// styled header row and a divider. Column widths are capped so a wide table
/// fits the pane, and longer cells wrap onto extra lines within their column.
fn render_table(rows: &[Vec<String>], header_rows: usize) -> Vec<Line<'static>> {
    if rows.is_empty() {
        return Vec::new();
    }
    let ncols = rows.iter().map(Vec::len).max().unwrap_or(0);
    if ncols == 0 {
        return Vec::new();
    }
    const MAX_COL: usize = 40;
    const MIN_COL: usize = 8;
    const TABLE_BUDGET: usize = 96;
    let cap = (TABLE_BUDGET / ncols).clamp(MIN_COL, MAX_COL);
    let mut widths = vec![0usize; ncols];
    for row in rows {
        for (i, cell) in row.iter().enumerate() {
            let w = display_width(cell).min(cap);
            if w > widths[i] {
                widths[i] = w;
            }
        }
    }

    let border = Style::default().fg(ui_muted());
    let cell_lines = |row: &[String], bold: bool| -> Vec<Line<'static>> {
        let wrapped: Vec<Vec<String>> = widths
            .iter()
            .enumerate()
            .map(|(i, w)| wrap_cols(row.get(i).map(String::as_str).unwrap_or(""), *w))
            .collect();
        let height = wrapped.iter().map(Vec::len).max().unwrap_or(1);
        let style = if bold {
            Style::default().add_modifier(Modifier::BOLD)
        } else {
            Style::default()
        };
        (0..height)
            .map(|line_idx| {
                let mut spans: Vec<Span<'static>> =
                    vec![Span::styled("    │ ".to_string(), border)];
                for (i, w) in widths.iter().enumerate() {
                    let part = wrapped[i].get(line_idx).map(String::as_str).unwrap_or("");
                    spans.push(Span::styled(pad_to_cols(part, *w), style));
                    let separator = if i + 1 == widths.len() {
                        " │"
                    } else {
                        " │ "
                    };
                    spans.push(Span::styled(separator.to_string(), border));
                }
                Line::from(spans)
            })
            .collect()
    };
    let rule = |left: &str, mid: &str, right: &str| -> Line<'static> {
        let mut s = format!("    {left}");
        for (i, w) in widths.iter().enumerate() {
            s.push_str(&"─".repeat(w + 2));
            s.push_str(if i + 1 == widths.len() { right } else { mid });
        }
        Line::from(Span::styled(s, border))
    };

    let mut out: Vec<Line<'static>> = vec![rule("┌", "┬", "┐")];
    for (idx, row) in rows.iter().enumerate() {
        out.extend(cell_lines(row, idx < header_rows));
        if idx + 1 == header_rows {
            out.push(rule("├", "┼", "┤"));
        }
    }
    out.push(rule("└", "┴", "┘"));
    out
}

fn wrap_cols(s: &str, max: usize) -> Vec<String> {
    let mut out = Vec::new();
    let mut line = String::new();
    let mut width = 0usize;
    for word in s.split_whitespace() {
        let word_width = display_width(word);
        if width > 0 && width + 1 + word_width <= max {
            line.push(' ');
            line.push_str(word);
            width += 1 + word_width;
            continue;
        }
        if width > 0 {
            out.push(std::mem::take(&mut line));
            width = 0;
        }
        if word_width <= max {
            line.push_str(word);
            width = word_width;
            continue;
        }
        for ch in word.chars() {
            let ch_width = display_width(&ch.to_string());
            if width > 0 && width + ch_width > max {
                out.push(std::mem::take(&mut line));
                width = 0;
            }
            line.push(ch);
            width += ch_width;
        }
    }
    if !line.is_empty() || out.is_empty() {
        out.push(line);
    }
    out
}

struct ListLevel {
    next: Option<u64>,
    content: usize,
}

fn push_prefix(
    spans: &mut Vec<Span<'static>>,
    in_blockquote: bool,
    in_heading: bool,
    lists: &[ListLevel],
) {
    if !spans.is_empty() || in_heading {
        return;
    }
    let prefix = if in_blockquote {
        "    │ ".to_string()
    } else if let Some(level) = lists.last() {
        " ".repeat(level.content)
    } else {
        "    ".to_string()
    };
    spans.push(Span::styled(prefix, Style::default().fg(ui_muted())));
}

fn flush_line(lines: &mut Vec<Line<'static>>, spans: &mut Vec<Span<'static>>) {
    if !spans.is_empty() {
        lines.push(Line::from(std::mem::take(spans)));
    }
}

fn open_block(lines: &mut Vec<Line<'static>>, spans: &mut Vec<Span<'static>>, gap: &mut bool) {
    flush_line(lines, spans);
    if std::mem::take(gap) && lines.last().is_some_and(|line| line.width() > 0) {
        lines.push(Line::from(""));
    }
}

/// Syntax-highlight a code block and return styled lines.
fn highlight_code(code: &str, lang: &str) -> Vec<Line<'static>> {
    let ss = syntax_set();
    let th = theme();

    // Find syntax for the language
    let syntax = if lang.is_empty() {
        ss.find_syntax_plain_text()
    } else {
        ss.find_syntax_by_token(lang)
            .or_else(|| ss.find_syntax_by_extension(lang))
            .unwrap_or_else(|| ss.find_syntax_plain_text())
    };

    let mut h = HighlightLines::new(syntax, &th);
    let mut result = Vec::new();

    for line_text in LinesWithEndings::from(code) {
        match h.highlight_line(line_text, ss) {
            Ok(ranges) => {
                let mut spans: Vec<Span<'static>> = Vec::new();
                spans.push(Span::styled("    │ ", Style::default().fg(ui_muted())));

                for (style, text) in ranges {
                    let fg = style.foreground;
                    let ratatui_style = if fg == TERMINAL_FOREGROUND {
                        Style::default()
                    } else {
                        Style::default().fg(best_color((fg.r, fg.g, fg.b)))
                    };
                    spans.push(Span::styled(
                        text.trim_end_matches('\n').to_string(),
                        ratatui_style,
                    ));
                }

                result.push(Line::from(spans));
            }
            Err(_) => {
                // Fallback: plain text
                result.push(Line::from(vec![
                    Span::styled("    │ ", Style::default().fg(ui_muted())),
                    Span::styled(line_text.trim_end().to_string(), Style::default()),
                ]));
            }
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lines_to_strings(lines: &[Line<'static>]) -> Vec<String> {
        lines
            .iter()
            .map(|l| {
                l.spans
                    .iter()
                    .map(|s| s.content.as_ref())
                    .collect::<String>()
            })
            .collect()
    }

    #[test]
    fn strips_escape_sequences_from_rendered_spans() {
        let md = "before \u{1b}]52;c;cm0gLXJmIC8=\u{7}after \u{1b}[2J\u{1b}[31mred\u{1b}[0m";
        let joined = lines_to_strings(&render_markdown(md)).join("\n");
        assert!(!joined.contains('\u{1b}'), "escape survived: {joined:?}");
        assert!(
            !joined.contains("cm0gLXJmIC8="),
            "OSC 52 payload survived: {joined:?}"
        );
        assert!(
            !joined.contains("[2J"),
            "screen-clear CSI survived: {joined:?}"
        );
        assert!(
            joined.contains("before after red"),
            "text was mangled: {joined:?}"
        );
    }

    #[test]
    fn strips_escape_sequences_inside_code_blocks() {
        let md = "```sh\necho \u{1b}]0;pwned\u{7}ok\n```";
        let joined = lines_to_strings(&render_markdown(md)).join("\n");
        assert!(!joined.contains('\u{1b}'), "escape survived: {joined:?}");
        assert!(!joined.contains("pwned"), "OSC title survived: {joined:?}");
        assert!(joined.contains("echo ok"), "code was mangled: {joined:?}");
    }

    #[test]
    fn renders_gfm_table_with_borders() {
        let md = "| Fruit | Color |\n|-------|-------|\n| Apple | Red |\n| Lime | Green |";
        let rendered = lines_to_strings(&render_markdown(md));
        for l in &rendered {
            eprintln!("{l}");
        }
        let joined = rendered.join("\n");
        assert!(joined.contains('┌') && joined.contains('┐'), "top border");
        assert!(
            joined.contains('├') && joined.contains('┤'),
            "header divider"
        );
        assert!(
            joined.contains('└') && joined.contains('┘'),
            "bottom border"
        );
        assert!(
            joined.contains("Fruit") && joined.contains("Color"),
            "header cells"
        );
        assert!(joined.contains("Apple") && joined.contains("Red"), "row 1");
        assert!(joined.contains("Lime") && joined.contains("Green"), "row 2");
    }

    #[test]
    fn cjk_table_cells_keep_all_rows_column_aligned() {
        let md = "| 名称 | Status |\n|---|---|\n| 模型 | Ready |\n| 工具调用 | Active |";
        let rendered = lines_to_strings(&render_markdown(md));
        let widths: Vec<usize> = rendered
            .iter()
            .filter(|line| line.contains('│') || line.contains('┌') || line.contains('└'))
            .map(|line| display_width(line))
            .collect();
        assert!(!widths.is_empty());
        assert!(
            widths.iter().all(|width| *width == widths[0]),
            "table rows have inconsistent terminal widths: {widths:?}"
        );
    }
}
