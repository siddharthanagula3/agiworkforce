// Markdown → ratatui rendering with syntax highlighting
// Markdown rendering with syntax highlighting

use pulldown_cmark::{CodeBlockKind, Event, Options, Parser, Tag, TagEnd};
use ratatui::style::{Modifier, Style};
use ratatui::text::{Line, Span};
use std::sync::OnceLock;
use syntect::easy::HighlightLines;
use syntect::highlighting::{Theme, ThemeSet};
use syntect::parsing::SyntaxSet;
use syntect::util::LinesWithEndings;

use crate::terminal_text::sanitize_terminal_text;
use crate::tui::terminal_palette::{rgb_color, ui_accent, ui_muted, ui_success};
use crate::tui::{display_width, pad_to_cols, truncate_cols};

static SYNTAX_SET: OnceLock<SyntaxSet> = OnceLock::new();
static THEME: OnceLock<Theme> = OnceLock::new();

fn syntax_set() -> &'static SyntaxSet {
    SYNTAX_SET.get_or_init(two_face::syntax::extra_newlines)
}

fn theme() -> &'static Theme {
    THEME.get_or_init(|| {
        let ts = ThemeSet::load_defaults();
        ts.themes
            .get("base16-ocean.dark")
            .cloned()
            .unwrap_or_else(|| ts.themes.values().next().unwrap().clone())
    })
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
    let mut _in_inline_code = false;
    let mut in_link = false;
    let mut in_list = false;
    let mut list_number: Option<u64> = None;
    let mut in_blockquote = false;

    for event in parser {
        match event {
            Event::Start(Tag::CodeBlock(kind)) => {
                flush_line(&mut lines, &mut current_spans);
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
            }
            Event::Start(Tag::Heading { level, .. }) => {
                flush_line(&mut lines, &mut current_spans);
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
            Event::Code(code) => {
                current_spans.push(Span::styled(
                    code.to_string(),
                    Style::default().fg(ui_accent()),
                ));
            }
            Event::Start(Tag::Link { .. }) => {
                in_link = true;
            }
            Event::End(TagEnd::Link) => {
                in_link = false;
            }
            Event::Start(Tag::List(start)) => {
                flush_line(&mut lines, &mut current_spans);
                in_list = true;
                list_number = start;
            }
            Event::End(TagEnd::List(_)) => {
                in_list = false;
                list_number = None;
            }
            Event::Start(Tag::Item) => {
                flush_line(&mut lines, &mut current_spans);
                let bullet = if let Some(ref mut n) = list_number {
                    let s = format!("    {n}. ");
                    *n += 1;
                    s
                } else {
                    "    • ".to_string()
                };
                current_spans.push(Span::styled(bullet, Style::default().fg(ui_accent())));
            }
            Event::End(TagEnd::Item) => {
                flush_line(&mut lines, &mut current_spans);
            }
            Event::Start(Tag::BlockQuote(_)) => {
                flush_line(&mut lines, &mut current_spans);
                in_blockquote = true;
            }
            Event::End(TagEnd::BlockQuote(_)) => {
                in_blockquote = false;
            }
            Event::Start(Tag::Paragraph) => {
                if !current_spans.is_empty() {
                    flush_line(&mut lines, &mut current_spans);
                }
            }
            Event::End(TagEnd::Paragraph) => {
                flush_line(&mut lines, &mut current_spans);
            }
            Event::Text(text) => {
                if in_table_cell {
                    current_cell.push_str(&text);
                } else if in_code_block {
                    code_content.push_str(&text);
                } else {
                    let style = if in_bold && in_italic {
                        Style::default().add_modifier(Modifier::BOLD | Modifier::ITALIC)
                    } else if in_bold {
                        Style::default().add_modifier(Modifier::BOLD)
                    } else if in_italic {
                        Style::default().add_modifier(Modifier::ITALIC)
                    } else if in_link {
                        Style::default()
                            .fg(ui_accent())
                            .add_modifier(Modifier::UNDERLINED)
                    } else if in_blockquote {
                        Style::default()
                            .fg(ui_success())
                            .add_modifier(Modifier::ITALIC)
                    } else {
                        Style::default()
                    };

                    let prefix = if in_blockquote && current_spans.is_empty() {
                        "    │ "
                    } else if current_spans.is_empty() && !in_list && !in_heading {
                        "    "
                    } else {
                        ""
                    };

                    if !prefix.is_empty() {
                        current_spans.push(Span::styled(
                            prefix.to_string(),
                            Style::default().fg(ui_muted()),
                        ));
                    }
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
                flush_line(&mut lines, &mut current_spans);
                lines.push(Line::from(Span::styled(
                    "    ────────────────────────────────",
                    Style::default().fg(ui_muted()),
                )));
            }
            Event::Start(Tag::Table(_)) => {
                flush_line(&mut lines, &mut current_spans);
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
            }
            _ => {}
        }
    }

    flush_line(&mut lines, &mut current_spans);
    lines
}

/// Render a parsed GFM table as bordered, column-aligned terminal lines with a
/// styled header row and a divider. Column widths are capped so a wide table
/// can't blow past the pane.
fn render_table(rows: &[Vec<String>], header_rows: usize) -> Vec<Line<'static>> {
    if rows.is_empty() {
        return Vec::new();
    }
    let ncols = rows.iter().map(Vec::len).max().unwrap_or(0);
    if ncols == 0 {
        return Vec::new();
    }
    const MAX_COL: usize = 40;
    let mut widths = vec![0usize; ncols];
    for row in rows {
        for (i, cell) in row.iter().enumerate() {
            let w = display_width(cell).min(MAX_COL);
            if w > widths[i] {
                widths[i] = w;
            }
        }
    }

    let border = Style::default().fg(ui_muted());
    let cell_line = |row: &[String], bold: bool| -> Line<'static> {
        let mut spans: Vec<Span<'static>> = vec![Span::styled("    │ ".to_string(), border)];
        for (i, w) in widths.iter().enumerate() {
            let cell = row.get(i).map(String::as_str).unwrap_or("");
            let padded = pad_to_cols(&truncate_cols(cell, *w), *w);
            let style = if bold {
                Style::default().add_modifier(Modifier::BOLD)
            } else {
                Style::default()
            };
            spans.push(Span::styled(padded, style));
            let separator = if i + 1 == widths.len() {
                " │"
            } else {
                " │ "
            };
            spans.push(Span::styled(separator.to_string(), border));
        }
        Line::from(spans)
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
        out.push(cell_line(row, idx < header_rows));
        if idx + 1 == header_rows {
            out.push(rule("├", "┼", "┤"));
        }
    }
    out.push(rule("└", "┴", "┘"));
    out
}

fn flush_line(lines: &mut Vec<Line<'static>>, spans: &mut Vec<Span<'static>>) {
    if !spans.is_empty() {
        lines.push(Line::from(std::mem::take(spans)));
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

    let mut h = HighlightLines::new(syntax, th);
    let mut result = Vec::new();

    for line_text in LinesWithEndings::from(code) {
        match h.highlight_line(line_text, ss) {
            Ok(ranges) => {
                let mut spans: Vec<Span<'static>> = Vec::new();
                spans.push(Span::styled("    │ ", Style::default().fg(ui_muted())));

                for (style, text) in ranges {
                    let fg =
                        rgb_color((style.foreground.r, style.foreground.g, style.foreground.b));
                    let mut ratatui_style = Style::default().fg(fg);
                    if style
                        .font_style
                        .contains(syntect::highlighting::FontStyle::BOLD)
                    {
                        ratatui_style = ratatui_style.add_modifier(Modifier::BOLD);
                    }
                    if style
                        .font_style
                        .contains(syntect::highlighting::FontStyle::ITALIC)
                    {
                        ratatui_style = ratatui_style.add_modifier(Modifier::ITALIC);
                    }
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
