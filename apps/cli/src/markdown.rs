use colored::Colorize;

// ---------------------------------------------------------------------------
// Streaming Markdown Renderer
// ---------------------------------------------------------------------------

/// A streaming-capable markdown renderer that processes text chunk by chunk.
///
/// Designed for SSE streaming where text arrives in arbitrary fragments.
/// Buffers incomplete lines and renders complete lines with terminal formatting.
pub struct MarkdownRenderer {
    /// Buffered text waiting for a complete line
    buffer: String,
    /// Whether we are currently inside a fenced code block
    in_code_block: bool,
    /// Language tag for the current code block
    code_lang: String,
    /// Accumulated code content for the current block
    code_content: String,
    /// Whether we are currently inside a markdown table
    in_table: bool,
    /// Accumulated rows for the current table
    table_rows: Vec<Vec<String>>,
    /// Terminal width for horizontal rules (default 80)
    terminal_width: usize,
}

impl MarkdownRenderer {
    pub fn new() -> Self {
        let width = terminal_width();
        Self {
            buffer: String::new(),
            in_code_block: false,
            code_lang: String::new(),
            code_content: String::new(),
            in_table: false,
            table_rows: Vec::new(),
            terminal_width: width,
        }
    }

    /// Process a streaming chunk. Returns formatted text to print immediately.
    /// Buffers incomplete lines until a newline arrives.
    pub fn process_chunk(&mut self, chunk: &str) -> String {
        self.buffer.push_str(chunk);

        let mut output = String::new();

        // Process all complete lines (ending with \n)
        while let Some(newline_pos) = self.buffer.find('\n') {
            let line = self.buffer[..newline_pos].to_string();
            self.buffer = self.buffer[newline_pos + 1..].to_string();

            let rendered = self.process_line(&line);
            output.push_str(&rendered);
        }

        output
    }

    /// Flush any remaining buffered content (call at end of response).
    pub fn flush(&mut self) -> String {
        let mut output = String::new();

        // Flush any accumulated table
        if self.in_table {
            output.push_str(&self.render_table());
            self.in_table = false;
            self.table_rows.clear();
        }

        // If we're in a code block with remaining buffer, add it to code content
        if self.in_code_block {
            if !self.buffer.is_empty() {
                self.code_content.push_str(&self.buffer);
                self.buffer.clear();
            }
            // Force-close the unclosed code block
            output.push_str(&self.render_code_block());
            self.in_code_block = false;
            self.code_lang.clear();
            self.code_content.clear();
        } else if !self.buffer.is_empty() {
            // Render remaining text as inline
            let line = std::mem::take(&mut self.buffer);
            output.push_str(&self.render_inline(&line));
            output.push('\n');
        }

        output
    }

    /// Process a single complete line.
    fn process_line(&mut self, line: &str) -> String {
        let trimmed = line.trim_end();

        // Check for code fence boundaries
        if let Some(after_fence) = trimmed.strip_prefix("```") {
            if self.in_code_block {
                // Closing fence -- render the accumulated code block
                let rendered = self.render_code_block();
                self.in_code_block = false;
                self.code_lang.clear();
                self.code_content.clear();
                return rendered;
            } else {
                // Opening fence -- extract language and start accumulating
                self.in_code_block = true;
                self.code_lang = after_fence.trim().to_string();
                self.code_content.clear();
                return String::new(); // Don't output anything yet
            }
        }

        // If inside a code block, accumulate content
        if self.in_code_block {
            self.code_content.push_str(line);
            self.code_content.push('\n');
            return String::new();
        }

        // Table handling: detect lines starting with |
        if is_table_row(trimmed) {
            if is_table_separator(trimmed) {
                // Separator row -- don't store it as data
                return String::new();
            }
            self.in_table = true;
            self.table_rows.push(parse_table_row(trimmed));
            return String::new();
        } else if self.in_table {
            // Non-table line after table rows -- flush the table
            let mut output = self.render_table();
            self.in_table = false;
            self.table_rows.clear();
            output.push_str(&self.render_line(trimmed));
            return output;
        }

        // Regular line -- apply markdown formatting
        self.render_line(trimmed)
    }

    /// Render a non-code-block line with markdown formatting.
    fn render_line(&mut self, line: &str) -> String {
        // Empty line
        if line.is_empty() {
            return "\n".to_string();
        }

        // Horizontal rule: --- or *** or ___ (3+ chars)
        if is_horizontal_rule(line) {
            let width = self.terminal_width.min(80);
            let rule = "\u{2500}".repeat(width);
            return format!("{}\n", rule.cyan().dimmed());
        }

        // Headers: # ## ### etc.
        if let Some(header) = parse_header(line) {
            return format!(
                "{} {}\n",
                header.prefix.dimmed(),
                header.text.cyan().bold()
            );
        }

        // Blockquote: > text
        if let Some(text) = line.strip_prefix("> ") {
            let rendered_text = self.render_inline(text);
            return format!("{} {}\n", "\u{2502}".dimmed(), rendered_text);
        }
        if line == ">" {
            return format!("{}\n", "\u{2502}".dimmed());
        }

        // Nested list handling -- check before top-level lists
        if let Some((depth, marker, text)) = parse_nested_list(line) {
            let rendered = self.render_inline(text);
            let indent = "  ".repeat(depth + 1);
            let bullet = nested_bullet_marker(depth);
            return match marker {
                ListMarker::Unordered => {
                    format!("{}{} {}\n", indent, bullet.cyan(), rendered)
                }
                ListMarker::Ordered(num) => {
                    // Right-align numbers within 3 chars
                    format!("{}{} {}\n", indent, format!("{:>3}.", num).cyan(), rendered)
                }
            };
        }

        // Top-level unordered list: - item or * item (but not ** which is bold)
        if let Some(text) = line.strip_prefix("- ") {
            let rendered = self.render_inline(text);
            return format!("  {} {}\n", "\u{2022}".cyan(), rendered);
        }
        if line.starts_with("* ") && !line.starts_with("**") {
            let text = &line[2..];
            let rendered = self.render_inline(text);
            return format!("  {} {}\n", "\u{2022}".cyan(), rendered);
        }

        // Top-level numbered list: 1. item, 2. item, etc.
        if let Some((num, text)) = parse_numbered_list(line) {
            let rendered = self.render_inline(text);
            return format!("  {} {}\n", format!("{:>3}.", num).cyan(), rendered);
        }

        // Regular text with inline formatting
        let rendered = self.render_inline(line);
        format!("{}\n", rendered)
    }

    /// Render a code block with box-drawing borders and language label.
    fn render_code_block(&self) -> String {
        let mut output = String::new();

        let lang_display = if self.code_lang.is_empty() {
            String::new()
        } else {
            let canonical = canonicalize_language(&self.code_lang);
            format!(" {} ", canonical)
        };

        let border_width = 50;
        let tag_len = lang_display.len();
        let dash_count = if border_width > tag_len + 2 {
            border_width - tag_len - 2
        } else {
            4
        };

        if lang_display.is_empty() {
            output.push_str(&format!(
                "{}{}\n",
                "\u{250c}\u{2500}".dimmed(),
                "\u{2500}".repeat(border_width - 2).dimmed()
            ));
        } else {
            // Language label line: ---- rust ----
            let label_line = format!(
                "{} {} {}",
                "\u{2500}".repeat(4).dimmed(),
                lang_display.trim().cyan().bold(),
                "\u{2500}".repeat(dash_count.saturating_sub(4)).dimmed()
            );
            output.push_str(&format!("{}\n", label_line));
            // Top border
            output.push_str(&format!(
                "{}{}\n",
                "\u{250c}\u{2500}".dimmed(),
                "\u{2500}".repeat(border_width - 2).dimmed()
            ));
        }

        // Code content in green
        let content = self.code_content.trim_end_matches('\n');
        for code_line in content.split('\n') {
            output.push_str(&format!(
                "{} {}\n",
                "\u{2502}".dimmed(),
                code_line.green()
            ));
        }

        // Bottom border
        output.push_str(&format!(
            "{}{}\n",
            "\u{2514}".dimmed(),
            "\u{2500}".repeat(border_width - 1).dimmed()
        ));

        output
    }

    /// Render a markdown table with box-drawing borders.
    fn render_table(&self) -> String {
        if self.table_rows.is_empty() {
            return String::new();
        }

        // Determine column count and max widths
        let col_count = self.table_rows.iter().map(|r| r.len()).max().unwrap_or(0);
        if col_count == 0 {
            return String::new();
        }

        let mut col_widths = vec![0usize; col_count];
        for row in &self.table_rows {
            for (i, cell) in row.iter().enumerate() {
                if i < col_count {
                    col_widths[i] = col_widths[i].max(cell.len());
                }
            }
        }

        // Enforce minimum width of 3 per column
        for w in &mut col_widths {
            *w = (*w).max(3);
        }

        let mut output = String::new();

        // Top border: ┌─────┬─────┐
        output.push_str(&build_table_border(&col_widths, "\u{250c}", "\u{252c}", "\u{2510}"));

        for (row_idx, row) in self.table_rows.iter().enumerate() {
            // Data row: │ cell │ cell │
            let mut line = String::new();
            line.push_str(&"\u{2502}".dimmed().to_string());
            for (i, width) in col_widths.iter().enumerate() {
                let cell = row.get(i).map(|s| s.as_str()).unwrap_or("");
                line.push_str(&format!(
                    " {:<width$} {}",
                    cell,
                    "\u{2502}".dimmed(),
                    width = width
                ));
            }
            line.push('\n');
            output.push_str(&line);

            // After header row (first row), draw separator: ├─────┼─────┤
            if row_idx == 0 && self.table_rows.len() > 1 {
                output.push_str(&build_table_border(&col_widths, "\u{251c}", "\u{253c}", "\u{2524}"));
            }
        }

        // Bottom border: └─────┴─────┘
        output.push_str(&build_table_border(&col_widths, "\u{2514}", "\u{2534}", "\u{2518}"));

        output
    }

    /// Apply inline formatting to a line of text.
    /// Handles: **bold**, *italic*/_italic_, ~~strikethrough~~, `code`, [text](url), bare URLs
    fn render_inline(&self, text: &str) -> String {
        let chars: Vec<char> = text.chars().collect();
        let len = chars.len();
        let mut result = String::new();
        let mut i = 0;

        while i < len {
            // Inline code: `...`
            if chars[i] == '`' && !is_triple_backtick(&chars, i) {
                if let Some((code_text, end)) = extract_delimited(&chars, i, '`', '`') {
                    result.push_str(&format!(
                        "{}{}{}",
                        "`".dimmed(),
                        code_text.white().bold(),
                        "`".dimmed()
                    ));
                    i = end;
                    continue;
                }
            }

            // Strikethrough: ~~...~~
            if i + 1 < len && chars[i] == '~' && chars[i + 1] == '~' {
                if let Some((strike_text, end)) = extract_double_delimited(&chars, i, '~') {
                    result.push_str(&format!("{}", strike_text.strikethrough()));
                    i = end;
                    continue;
                }
            }

            // Bold: **...**
            if i + 1 < len && chars[i] == '*' && chars[i + 1] == '*' {
                if let Some((bold_text, end)) = extract_double_delimited(&chars, i, '*') {
                    result.push_str(&format!("{}", bold_text.bold()));
                    i = end;
                    continue;
                }
            }

            // Bold: __...__
            if i + 1 < len && chars[i] == '_' && chars[i + 1] == '_' {
                if let Some((bold_text, end)) = extract_double_delimited(&chars, i, '_') {
                    result.push_str(&format!("{}", bold_text.bold()));
                    i = end;
                    continue;
                }
            }

            // Italic: *...* (single asterisk, not at word boundary issues)
            if chars[i] == '*' && (i + 1 < len && chars[i + 1] != '*' && chars[i + 1] != ' ') {
                if let Some((italic_text, end)) = extract_delimited(&chars, i, '*', '*') {
                    result.push_str(&format!("{}", italic_text.dimmed()));
                    i = end;
                    continue;
                }
            }

            // Italic: _..._ (single underscore)
            if chars[i] == '_' && (i + 1 < len && chars[i + 1] != '_' && chars[i + 1] != ' ') {
                if let Some((italic_text, end)) = extract_delimited(&chars, i, '_', '_') {
                    result.push_str(&format!("{}", italic_text.dimmed()));
                    i = end;
                    continue;
                }
            }

            // Links: [text](url)
            if chars[i] == '[' {
                if let Some((link_text, url, end)) = extract_link(&chars, i) {
                    result.push_str(&format!(
                        "{} {}",
                        link_text.cyan().underline(),
                        format!("({})", url).dimmed()
                    ));
                    i = end;
                    continue;
                }
            }

            // Bare URLs: http:// or https://
            if chars[i] == 'h' {
                if let Some((url, end)) = extract_bare_url(&chars, i) {
                    result.push_str(&format!("{}", url.cyan()));
                    i = end;
                    continue;
                }
            }

            result.push(chars[i]);
            i += 1;
        }

        result
    }
}

// ---------------------------------------------------------------------------
// Table helpers
// ---------------------------------------------------------------------------

/// Check if a line looks like a table row (starts and ends with |, or starts with |).
fn is_table_row(line: &str) -> bool {
    let trimmed = line.trim();
    trimmed.starts_with('|') && trimmed.ends_with('|') && trimmed.len() >= 3
}

/// Check if a line is a table separator row (e.g., |---|---|).
fn is_table_separator(line: &str) -> bool {
    let trimmed = line.trim();
    if !trimmed.starts_with('|') {
        return false;
    }
    // Separator rows contain only |, -, :, and spaces
    trimmed.chars().all(|c| c == '|' || c == '-' || c == ':' || c == ' ')
}

/// Parse a table row into cells (strips leading/trailing |).
fn parse_table_row(line: &str) -> Vec<String> {
    let trimmed = line.trim();
    // Strip leading/trailing pipes
    let inner = trimmed.trim_start_matches('|').trim_end_matches('|');
    inner
        .split('|')
        .map(|cell| cell.trim().to_string())
        .collect()
}

/// Build a table border line using box-drawing characters.
fn build_table_border(col_widths: &[usize], left: &str, mid: &str, right: &str) -> String {
    let mut line = String::new();
    line.push_str(&left.dimmed().to_string());
    for (i, width) in col_widths.iter().enumerate() {
        // +2 for the spaces around cell content
        line.push_str(&"\u{2500}".repeat(width + 2).dimmed().to_string());
        if i < col_widths.len() - 1 {
            line.push_str(&mid.dimmed().to_string());
        }
    }
    line.push_str(&right.dimmed().to_string());
    line.push('\n');
    line
}

// ---------------------------------------------------------------------------
// Nested list helpers
// ---------------------------------------------------------------------------

#[derive(Debug, PartialEq)]
enum ListMarker {
    Unordered,
    Ordered(usize),
}

/// Parse a nested list item. Returns (depth, marker_type, text) if it's a nested item.
/// depth 0 = 2-space indent, depth 1 = 4-space indent, etc.
fn parse_nested_list(line: &str) -> Option<(usize, ListMarker, &str)> {
    // Must have leading whitespace
    if !line.starts_with(' ') && !line.starts_with('\t') {
        return None;
    }

    // Count leading spaces
    let leading_spaces = line.len() - line.trim_start().len();
    if leading_spaces == 0 {
        return None;
    }

    let trimmed = line.trim_start();

    // Unordered: - item or * item
    if let Some(text) = trimmed.strip_prefix("- ") {
        let depth = (leading_spaces / 2).saturating_sub(1);
        return Some((depth, ListMarker::Unordered, text));
    }
    if trimmed.starts_with("* ") && !trimmed.starts_with("**") {
        let text = &trimmed[2..];
        let depth = (leading_spaces / 2).saturating_sub(1);
        return Some((depth, ListMarker::Unordered, text));
    }

    // Ordered: 1. item, 12. item, etc.
    if let Some((num_str, text)) = parse_numbered_list(trimmed) {
        let depth = (leading_spaces / 2).saturating_sub(1);
        let num: usize = num_str.parse().unwrap_or(1);
        return Some((depth, ListMarker::Ordered(num), text));
    }

    None
}

/// Return the bullet marker for a given nesting depth.
fn nested_bullet_marker(depth: usize) -> &'static str {
    match depth % 4 {
        0 => "\u{2022}",   // bullet
        1 => "\u{25e6}",   // open bullet
        2 => "\u{25aa}",   // small filled square
        _ => "\u{25ab}",   // small open square
    }
}

// ---------------------------------------------------------------------------
// Language alias canonicalization
// ---------------------------------------------------------------------------

/// Canonicalize short language aliases to full names.
fn canonicalize_language(lang: &str) -> &str {
    match lang.to_lowercase().as_str() {
        "js" => "javascript",
        "ts" => "typescript",
        "py" => "python",
        "rb" => "ruby",
        "sh" => "bash",
        "yml" => "yaml",
        "md" => "markdown",
        "rs" => "rust",
        "kt" => "kotlin",
        "cs" => "csharp",
        "ex" => "elixir",
        "hs" => "haskell",
        _ => lang,
    }
}

// ---------------------------------------------------------------------------
// Bare URL extraction
// ---------------------------------------------------------------------------

/// Extract a bare URL starting with http:// or https:// at position i.
/// Returns (url_string, index_after_url).
fn extract_bare_url(chars: &[char], start: usize) -> Option<(String, usize)> {
    let remaining: String = chars[start..].iter().collect();

    // Must start with http:// or https://
    if !remaining.starts_with("http://") && !remaining.starts_with("https://") {
        return None;
    }

    // URL ends at whitespace, ), ], >, or end of string
    let mut end = start;
    while end < chars.len() {
        let c = chars[end];
        if c.is_whitespace() || c == ')' || c == ']' || c == '>' {
            break;
        }
        end += 1;
    }

    if end == start {
        return None;
    }

    // Trim trailing punctuation that's unlikely part of the URL
    while end > start {
        let c = chars[end - 1];
        if c == '.' || c == ',' || c == ';' || c == ':' || c == '!' || c == '?' {
            end -= 1;
        } else {
            break;
        }
    }

    let url: String = chars[start..end].iter().collect();
    if url.len() < 8 {
        return None; // Too short to be a real URL
    }

    Some((url, end))
}

// ---------------------------------------------------------------------------
// Terminal width
// ---------------------------------------------------------------------------

/// Get terminal width, defaulting to 80 if unavailable.
fn terminal_width() -> usize {
    // Try the COLUMNS env var first
    if let Ok(cols) = std::env::var("COLUMNS") {
        if let Ok(w) = cols.parse::<usize>() {
            if w > 10 {
                return w;
            }
        }
    }
    80
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

struct HeaderMatch {
    prefix: String,
    text: String,
}

fn parse_header(line: &str) -> Option<HeaderMatch> {
    let trimmed = line.trim_start();
    if !trimmed.starts_with('#') {
        return None;
    }

    let mut level = 0;
    for ch in trimmed.chars() {
        if ch == '#' {
            level += 1;
        } else {
            break;
        }
    }

    if level > 6 {
        return None;
    }

    let rest = &trimmed[level..];
    if !rest.starts_with(' ') && !rest.is_empty() {
        return None; // Must have space after # marks (or be just #)
    }

    let text = rest.trim().to_string();
    let prefix = "#".repeat(level);

    Some(HeaderMatch { prefix, text })
}

fn is_horizontal_rule(line: &str) -> bool {
    let trimmed = line.trim();
    if trimmed.len() < 3 {
        return false;
    }
    let first = trimmed.chars().next().unwrap_or(' ');
    if first != '-' && first != '*' && first != '_' {
        return false;
    }
    // All chars must be the same (or spaces)
    trimmed.chars().all(|c| c == first || c == ' ')
}

fn parse_numbered_list(line: &str) -> Option<(&str, &str)> {
    let trimmed = line.trim_start();
    let dot_pos = trimmed.find(". ")?;
    let number_part = &trimmed[..dot_pos];

    // Verify all chars before the dot are digits
    if number_part.is_empty() || !number_part.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }

    let text = &trimmed[dot_pos + 2..];
    Some((number_part, text))
}

/// Check if position i starts a triple backtick
fn is_triple_backtick(chars: &[char], i: usize) -> bool {
    i + 2 < chars.len() && chars[i] == '`' && chars[i + 1] == '`' && chars[i + 2] == '`'
}

/// Extract text between single delimiter pairs: `code`, *italic*, _italic_
/// Returns (extracted_text, index_after_closing_delimiter)
fn extract_delimited(chars: &[char], start: usize, open: char, close: char) -> Option<(String, usize)> {
    if chars[start] != open {
        return None;
    }
    let content_start = start + 1;
    let mut i = content_start;
    while i < chars.len() {
        if chars[i] == close {
            if i == content_start {
                return None; // Empty delimited text
            }
            let text: String = chars[content_start..i].iter().collect();
            return Some((text, i + 1));
        }
        if chars[i] == '\n' {
            return None; // Don't cross line boundaries
        }
        i += 1;
    }
    None
}

/// Extract text between double delimiters: **bold**, __bold__, ~~strike~~
/// Returns (extracted_text, index_after_closing_delimiters)
fn extract_double_delimited(chars: &[char], start: usize, delim: char) -> Option<(String, usize)> {
    if start + 1 >= chars.len() || chars[start] != delim || chars[start + 1] != delim {
        return None;
    }
    let content_start = start + 2;
    let mut i = content_start;
    while i + 1 < chars.len() {
        if chars[i] == delim && chars[i + 1] == delim {
            if i == content_start {
                return None; // Empty
            }
            let text: String = chars[content_start..i].iter().collect();
            return Some((text, i + 2));
        }
        if chars[i] == '\n' {
            return None;
        }
        i += 1;
    }
    None
}

/// Extract a markdown link: [text](url)
/// Returns (text, url, index_after_closing_paren)
fn extract_link(chars: &[char], start: usize) -> Option<(String, String, usize)> {
    if chars[start] != '[' {
        return None;
    }
    // Find closing ]
    let mut i = start + 1;
    while i < chars.len() && chars[i] != ']' && chars[i] != '\n' {
        i += 1;
    }
    if i >= chars.len() || chars[i] != ']' {
        return None;
    }
    let link_text: String = chars[start + 1..i].iter().collect();
    i += 1;

    // Must be followed by (
    if i >= chars.len() || chars[i] != '(' {
        return None;
    }
    i += 1;

    // Find closing )
    let url_start = i;
    while i < chars.len() && chars[i] != ')' && chars[i] != '\n' {
        i += 1;
    }
    if i >= chars.len() || chars[i] != ')' {
        return None;
    }
    let url: String = chars[url_start..i].iter().collect();
    Some((link_text, url, i + 1))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_header_rendering() {
        let mut r = MarkdownRenderer::new();
        let out = r.process_chunk("# Hello World\n");
        assert!(out.contains("Hello World"));
    }

    #[test]
    fn test_code_block_accumulation() {
        let mut r = MarkdownRenderer::new();
        // Send code block in multiple chunks
        let out1 = r.process_chunk("```rust\n");
        assert!(out1.is_empty()); // Opening fence, no output yet
        let out2 = r.process_chunk("fn main() {\n");
        assert!(out2.is_empty()); // Accumulating
        let out3 = r.process_chunk("}\n```\n");
        assert!(out3.contains("fn main()")); // Now rendered
        assert!(out3.contains("rust")); // Language tag
    }

    #[test]
    fn test_inline_code() {
        let mut r = MarkdownRenderer::new();
        let out = r.process_chunk("Use `println!` here\n");
        assert!(out.contains("println!"));
    }

    #[test]
    fn test_bullet_list() {
        let mut r = MarkdownRenderer::new();
        let out = r.process_chunk("- first item\n- second item\n");
        // Should contain bullet markers
        assert!(out.contains("first item"));
        assert!(out.contains("second item"));
    }

    #[test]
    fn test_numbered_list() {
        let mut r = MarkdownRenderer::new();
        let out = r.process_chunk("1. first\n2. second\n");
        assert!(out.contains("first"));
        assert!(out.contains("second"));
    }

    #[test]
    fn test_bold_text() {
        let mut r = MarkdownRenderer::new();
        let out = r.process_chunk("This is **bold** text\n");
        assert!(out.contains("bold"));
    }

    #[test]
    fn test_link() {
        let mut r = MarkdownRenderer::new();
        let out = r.process_chunk("[click here](https://example.com)\n");
        assert!(out.contains("click here"));
        assert!(out.contains("https://example.com"));
    }

    #[test]
    fn test_horizontal_rule() {
        let mut r = MarkdownRenderer::new();
        let out = r.process_chunk("---\n");
        assert!(out.contains("\u{2500}"));
    }

    #[test]
    fn test_blockquote() {
        let mut r = MarkdownRenderer::new();
        let out = r.process_chunk("> quoted text\n");
        assert!(out.contains("quoted text"));
        assert!(out.contains("\u{2502}"));
    }

    #[test]
    fn test_flush_remaining() {
        let mut r = MarkdownRenderer::new();
        // No newline at end -- stays in buffer
        let out = r.process_chunk("partial text");
        assert!(out.is_empty());
        // Flush should emit it
        let flushed = r.flush();
        assert!(flushed.contains("partial text"));
    }

    #[test]
    fn test_streaming_mid_word_chunks() {
        let mut r = MarkdownRenderer::new();
        let out1 = r.process_chunk("Hel");
        assert!(out1.is_empty()); // No newline yet
        let out2 = r.process_chunk("lo ");
        assert!(out2.is_empty()); // Still no newline
        let out3 = r.process_chunk("World\n");
        assert!(out3.contains("Hello World"));
    }

    #[test]
    fn test_unclosed_code_block_flush() {
        let mut r = MarkdownRenderer::new();
        let _ = r.process_chunk("```python\nprint('hi')\n");
        // Code block never closed -- flush should render it anyway
        let flushed = r.flush();
        assert!(flushed.contains("print('hi')"));
    }

    #[test]
    fn test_parse_header_levels() {
        assert!(parse_header("# H1").is_some());
        assert!(parse_header("## H2").is_some());
        assert!(parse_header("### H3").is_some());
        assert!(parse_header("Not a header").is_none());
        assert!(parse_header("#NoSpace").is_none());
    }

    #[test]
    fn test_horizontal_rule_variants() {
        assert!(is_horizontal_rule("---"));
        assert!(is_horizontal_rule("***"));
        assert!(is_horizontal_rule("___"));
        assert!(is_horizontal_rule("- - -"));
        assert!(!is_horizontal_rule("--"));
        assert!(!is_horizontal_rule("hello"));
    }

    #[test]
    fn test_numbered_list_parse() {
        assert!(parse_numbered_list("1. Item").is_some());
        assert!(parse_numbered_list("12. Item").is_some());
        assert!(parse_numbered_list("abc. Item").is_none());
        assert!(parse_numbered_list("No number here").is_none());
    }

    #[test]
    fn test_nested_bullet() {
        // parse_nested_list is the new system; old strip_nested_bullet is removed
        assert!(parse_nested_list("  - nested").is_some());
        assert!(parse_nested_list("    - deep nested").is_some());
        assert!(parse_nested_list("- top level").is_none());
    }

    // ----- New tests for the improvements -----

    #[test]
    fn test_table_rendering_basic() {
        let mut r = MarkdownRenderer::new();
        let out = r.process_chunk("| Name | Age |\n| --- | --- |\n| Alice | 30 |\n| Bob | 25 |\n\n");
        // Should contain box-drawing borders
        assert!(out.contains("\u{250c}")); // top-left corner
        assert!(out.contains("\u{2502}")); // vertical bar
        assert!(out.contains("\u{2514}")); // bottom-left corner
        assert!(out.contains("Alice"));
        assert!(out.contains("Bob"));
        assert!(out.contains("30"));
    }

    #[test]
    fn test_table_rendering_column_alignment() {
        let mut r = MarkdownRenderer::new();
        let out = r.process_chunk("| Short | LongerColumn |\n|---|---|\n| a | b |\n\n");
        // Column widths should be padded to the widest cell
        assert!(out.contains("Short"));
        assert!(out.contains("LongerColumn"));
        // Separator between header and body
        assert!(out.contains("\u{253c}")); // cross
    }

    #[test]
    fn test_table_separator_detection() {
        assert!(is_table_separator("|---|---|"));
        assert!(is_table_separator("| --- | --- |"));
        assert!(is_table_separator("|:---:|:---:|"));
        assert!(!is_table_separator("| Name | Age |"));
        assert!(!is_table_separator("not a table"));
    }

    #[test]
    fn test_table_row_parsing() {
        let cells = parse_table_row("| Name | Age | City |");
        assert_eq!(cells, vec!["Name", "Age", "City"]);
    }

    #[test]
    fn test_table_flush_at_end() {
        let mut r = MarkdownRenderer::new();
        // Table with no trailing blank line
        let out = r.process_chunk("| A | B |\n|---|---|\n| 1 | 2 |\n");
        // Table is still being accumulated (no non-table line to trigger flush)
        // Need to flush explicitly
        let flushed = r.flush();
        let combined = format!("{}{}", out, flushed);
        assert!(combined.contains("1"));
        assert!(combined.contains("2"));
    }

    #[test]
    fn test_horizontal_rule_colored() {
        let mut r = MarkdownRenderer::new();
        let out1 = r.process_chunk("---\n");
        assert!(out1.contains("\u{2500}"));

        let mut r2 = MarkdownRenderer::new();
        let out2 = r2.process_chunk("***\n");
        assert!(out2.contains("\u{2500}"));

        let mut r3 = MarkdownRenderer::new();
        let out3 = r3.process_chunk("___\n");
        assert!(out3.contains("\u{2500}"));
    }

    #[test]
    fn test_horizontal_rule_width() {
        let mut r = MarkdownRenderer::new();
        r.terminal_width = 40;
        let out = r.process_chunk("---\n");
        // Count the horizontal line chars (each is 3 bytes for the unicode char)
        let dash_count = out.matches('\u{2500}').count();
        assert_eq!(dash_count, 40);
    }

    #[test]
    fn test_link_rendering_styled() {
        let mut r = MarkdownRenderer::new();
        let out = r.process_chunk("[docs](https://docs.rs)\n");
        // Link text and URL should both appear
        assert!(out.contains("docs"));
        assert!(out.contains("https://docs.rs"));
    }

    #[test]
    fn test_bare_url_detection() {
        let mut r = MarkdownRenderer::new();
        let out = r.process_chunk("Visit https://example.com for details\n");
        assert!(out.contains("https://example.com"));
    }

    #[test]
    fn test_bare_url_extraction() {
        let chars: Vec<char> = "https://example.com rest".chars().collect();
        let result = extract_bare_url(&chars, 0);
        assert!(result.is_some());
        let (url, end) = result.unwrap();
        assert_eq!(url, "https://example.com");
        assert_eq!(end, 19);
    }

    #[test]
    fn test_bare_url_trims_trailing_punctuation() {
        let chars: Vec<char> = "https://example.com.".chars().collect();
        let result = extract_bare_url(&chars, 0);
        assert!(result.is_some());
        let (url, _end) = result.unwrap();
        assert_eq!(url, "https://example.com");
    }

    #[test]
    fn test_bare_url_not_matched_for_plain_text() {
        let chars: Vec<char> = "hello world".chars().collect();
        let result = extract_bare_url(&chars, 0);
        assert!(result.is_none());
    }

    #[test]
    fn test_nested_list_depth_markers() {
        let mut r = MarkdownRenderer::new();
        let out = r.process_chunk("- top\n  - level 1\n    - level 2\n      - level 3\n        - level 4\n");
        assert!(out.contains("\u{2022}")); // bullet (top + depth 0)
        assert!(out.contains("\u{25e6}")); // open bullet (depth 1)
        assert!(out.contains("\u{25aa}")); // small filled square (depth 2)
        assert!(out.contains("\u{25ab}")); // small open square (depth 3)
    }

    #[test]
    fn test_nested_list_parsing() {
        // 2-space indent, depth 0
        let r = parse_nested_list("  - item");
        assert!(r.is_some());
        let (depth, marker, text) = r.unwrap();
        assert_eq!(depth, 0);
        assert_eq!(marker, ListMarker::Unordered);
        assert_eq!(text, "item");

        // 4-space indent, depth 1
        let r2 = parse_nested_list("    - deeper");
        assert!(r2.is_some());
        let (depth2, _, _) = r2.unwrap();
        assert_eq!(depth2, 1);

        // No indent = not nested
        assert!(parse_nested_list("- top").is_none());
    }

    #[test]
    fn test_nested_ordered_list() {
        let r = parse_nested_list("    1. first nested");
        assert!(r.is_some());
        let (depth, marker, text) = r.unwrap();
        assert_eq!(depth, 1);
        assert_eq!(marker, ListMarker::Ordered(1));
        assert_eq!(text, "first nested");
    }

    #[test]
    fn test_nested_list_right_aligned_numbers() {
        let mut r = MarkdownRenderer::new();
        let out = r.process_chunk("  1. first\n  10. tenth\n");
        // Both should contain the numbers
        assert!(out.contains("1."));
        assert!(out.contains("10."));
    }

    #[test]
    fn test_strikethrough() {
        let mut r = MarkdownRenderer::new();
        let out = r.process_chunk("This is ~~deleted~~ text\n");
        assert!(out.contains("deleted"));
    }

    #[test]
    fn test_strikethrough_inline_extraction() {
        let chars: Vec<char> = "~~hello~~".chars().collect();
        let result = extract_double_delimited(&chars, 0, '~');
        assert!(result.is_some());
        let (text, end) = result.unwrap();
        assert_eq!(text, "hello");
        assert_eq!(end, 9);
    }

    #[test]
    fn test_strikethrough_empty_ignored() {
        let chars: Vec<char> = "~~~~".chars().collect();
        let result = extract_double_delimited(&chars, 0, '~');
        assert!(result.is_none()); // Empty strikethrough
    }

    #[test]
    fn test_language_aliases() {
        assert_eq!(canonicalize_language("js"), "javascript");
        assert_eq!(canonicalize_language("ts"), "typescript");
        assert_eq!(canonicalize_language("py"), "python");
        assert_eq!(canonicalize_language("rb"), "ruby");
        assert_eq!(canonicalize_language("sh"), "bash");
        assert_eq!(canonicalize_language("yml"), "yaml");
        assert_eq!(canonicalize_language("md"), "markdown");
        assert_eq!(canonicalize_language("rs"), "rust");
        assert_eq!(canonicalize_language("kt"), "kotlin");
        assert_eq!(canonicalize_language("cs"), "csharp");
    }

    #[test]
    fn test_language_alias_case_insensitive() {
        assert_eq!(canonicalize_language("JS"), "javascript");
        assert_eq!(canonicalize_language("Ts"), "typescript");
        assert_eq!(canonicalize_language("PY"), "python");
    }

    #[test]
    fn test_language_alias_passthrough() {
        // Full names should pass through unchanged
        assert_eq!(canonicalize_language("rust"), "rust");
        assert_eq!(canonicalize_language("python"), "python");
        assert_eq!(canonicalize_language("javascript"), "javascript");
    }

    #[test]
    fn test_code_block_language_label() {
        let mut r = MarkdownRenderer::new();
        let out = r.process_chunk("```js\nconsole.log('hi');\n```\n");
        // Should show canonicalized language name
        assert!(out.contains("javascript"));
        assert!(out.contains("console.log"));
    }

    #[test]
    fn test_code_block_no_language() {
        let mut r = MarkdownRenderer::new();
        let out = r.process_chunk("```\nsome code\n```\n");
        assert!(out.contains("some code"));
        // Should not contain language label line
        assert!(!out.contains("javascript"));
    }

    #[test]
    fn test_is_table_row() {
        assert!(is_table_row("| A | B |"));
        assert!(is_table_row("|A|B|"));
        assert!(!is_table_row("| only start"));
        assert!(!is_table_row("no pipes"));
        assert!(!is_table_row("||")); // too short
    }

    #[test]
    fn test_nested_bullet_marker_cycle() {
        assert_eq!(nested_bullet_marker(0), "\u{2022}");
        assert_eq!(nested_bullet_marker(1), "\u{25e6}");
        assert_eq!(nested_bullet_marker(2), "\u{25aa}");
        assert_eq!(nested_bullet_marker(3), "\u{25ab}");
        // Cycles back
        assert_eq!(nested_bullet_marker(4), "\u{2022}");
        assert_eq!(nested_bullet_marker(5), "\u{25e6}");
    }
}
