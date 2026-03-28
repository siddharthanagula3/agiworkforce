// Markdown → ratatui rendering with syntax highlighting
// Markdown rendering with syntax highlighting

use pulldown_cmark::{CodeBlockKind, Event, Parser, Tag, TagEnd};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use std::sync::OnceLock;
use syntect::easy::HighlightLines;
use syntect::highlighting::{Theme, ThemeSet};
use syntect::parsing::SyntaxSet;
use syntect::util::LinesWithEndings;

static SYNTAX_SET: OnceLock<SyntaxSet> = OnceLock::new();
static THEME: OnceLock<Theme> = OnceLock::new();

fn syntax_set() -> &'static SyntaxSet {
    SYNTAX_SET.get_or_init(|| two_face::syntax::extra_newlines())
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

    let parser = Parser::new(text);

    let mut in_code_block = false;
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
                    Style::default().fg(Color::DarkGray),
                )));
            }
            Event::End(TagEnd::CodeBlock) => {
                // Syntax highlight the code block
                let highlighted = highlight_code(&code_content, &code_lang);
                lines.extend(highlighted);
                lines.push(Line::from(Span::styled(
                    "    └──────────",
                    Style::default().fg(Color::DarkGray),
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
                        .fg(Color::Cyan)
                        .add_modifier(Modifier::BOLD | Modifier::UNDERLINED),
                    2 => Style::default()
                        .fg(Color::Cyan)
                        .add_modifier(Modifier::BOLD),
                    _ => Style::default()
                        .fg(Color::White)
                        .add_modifier(Modifier::ITALIC),
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
                    Style::default().fg(Color::Yellow),
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
                current_spans.push(Span::styled(bullet, Style::default().fg(Color::LightBlue)));
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
                if in_code_block {
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
                            .fg(Color::Cyan)
                            .add_modifier(Modifier::UNDERLINED)
                    } else if in_blockquote {
                        Style::default()
                            .fg(Color::Green)
                            .add_modifier(Modifier::ITALIC)
                    } else {
                        Style::default().fg(Color::White)
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
                            Style::default().fg(Color::DarkGray),
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
                    Style::default().fg(Color::DarkGray),
                )));
            }
            _ => {}
        }
    }

    flush_line(&mut lines, &mut current_spans);
    lines
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
                spans.push(Span::styled("    │ ", Style::default().fg(Color::DarkGray)));

                for (style, text) in ranges {
                    let fg = Color::Rgb(style.foreground.r, style.foreground.g, style.foreground.b);
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
                    Span::styled("    │ ", Style::default().fg(Color::DarkGray)),
                    Span::styled(
                        line_text.trim_end().to_string(),
                        Style::default().fg(Color::White),
                    ),
                ]));
            }
        }
    }

    result
}
