use super::*;
use regex::Regex;
use std::sync::LazyLock;

/// Regex to match <script>...</script> blocks (including content)
static SCRIPT_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?is)<script[^>]*>.*?</script>").expect("valid script regex"));
/// Regex to match <style>...</style> blocks (including content)
static STYLE_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?is)<style[^>]*>.*?</style>").expect("valid style regex"));
/// Regex to match HTML comments
static COMMENT_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?s)<!--.*?-->").expect("valid comment regex"));
/// Regex to match any HTML tag
static TAG_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?is)<[^>]+>").expect("valid tag regex"));

/// Check if a string looks like HTML content
pub(super) fn looks_like_html(text: &str) -> bool {
    let trimmed = text.trim_start();
    trimmed.starts_with("<!doctype")
        || trimmed.starts_with("<!DOCTYPE")
        || trimmed.starts_with("<html")
        || trimmed.starts_with("<HTML")
        || (trimmed.starts_with('<') && trimmed.contains("</"))
}

/// Decode common HTML entities to their text equivalents
fn decode_html_entities(text: &str) -> String {
    text.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
        .replace("&apos;", "'")
        .replace("&nbsp;", " ")
        .replace("&mdash;", "—")
        .replace("&ndash;", "–")
        .replace("&hellip;", "…")
        .replace("&copy;", "©")
        .replace("&reg;", "®")
        .replace("&trade;", "™")
}

/// Extract the page title from HTML
pub(super) fn extract_title(html: &str) -> Option<String> {
    let lower = html.to_lowercase();
    if let Some(start) = lower.find("<title>") {
        if let Some(end) = lower[start..].find("</title>") {
            let title_start = start + 7;
            let title_end = start + end;
            if title_end > title_start {
                let title = html[title_start..title_end].trim().to_string();
                if !title.is_empty() {
                    return Some(decode_html_entities(&title));
                }
            }
        }
    }
    None
}

/// Extract readable text content from HTML, stripping scripts, styles, tags,
/// and normalizing whitespace. Returns a clean text representation suitable
/// for LLM consumption.
fn extract_text_from_html(html: &str, max_chars: usize) -> String {
    // Remove scripts, styles, and comments first
    let no_scripts = SCRIPT_RE.replace_all(html, " ");
    let no_styles = STYLE_RE.replace_all(&no_scripts, " ");
    let no_comments = COMMENT_RE.replace_all(&no_styles, " ");

    // Replace block-level tags with newlines for readability
    let with_breaks = no_comments
        .replace("<br>", "\n")
        .replace("<br/>", "\n")
        .replace("<br />", "\n")
        .replace("</p>", "\n")
        .replace("</div>", "\n")
        .replace("</li>", "\n")
        .replace("</h1>", "\n")
        .replace("</h2>", "\n")
        .replace("</h3>", "\n")
        .replace("</h4>", "\n")
        .replace("</h5>", "\n")
        .replace("</h6>", "\n")
        .replace("</tr>", "\n");

    // Strip all remaining HTML tags
    let text = TAG_RE.replace_all(&with_breaks, " ");

    // Decode HTML entities
    let decoded = decode_html_entities(text.as_ref());

    // Normalize whitespace: collapse multiple spaces, preserve single newlines
    let mut result = String::new();
    let mut prev_newline = false;
    let mut prev_space = false;
    for ch in decoded.chars() {
        if ch == '\n' {
            if !prev_newline {
                result.push('\n');
            }
            prev_newline = true;
            prev_space = false;
        } else if ch.is_whitespace() {
            if !prev_space && !prev_newline {
                result.push(' ');
            }
            prev_space = true;
        } else {
            result.push(ch);
            prev_newline = false;
            prev_space = false;
        }
        if result.len() >= max_chars {
            break;
        }
    }

    result.trim().to_string()
}

/// Process an HTTP response body: if it looks like HTML, extract readable text.
/// Otherwise return as-is (truncated to max_chars).
pub(super) fn process_response_body(body: &str, max_chars: usize) -> (String, bool) {
    if looks_like_html(body) {
        let text = extract_text_from_html(body, max_chars);
        (text, true)
    } else if body.len() > max_chars {
        (body[..max_chars].to_string(), false)
    } else {
        (body.to_string(), false)
    }
}

impl ToolExecutor {
    pub(crate) async fn execute_search_web_tool(
        &self,
        args: &HashMap<String, Value>,
        action_id: &str,
    ) -> Result<ToolResult> {
        use crate::core::agi::executors::search_executor::{
            SearchExecutor, SearchType as ExecSearchType,
        };
        let tool_id = action_id;

        let query = args
            .get("query")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing query parameter"))?
            .to_string();

        // Emit progress: starting search
        if let Some(app_handle) = &self.app_handle {
            emit_tool_progress(
                app_handle,
                tool_id,
                0.1,
                Some(&format!("Searching: {}", &query[..query.len().min(40)])),
            );
        }

        let num_results = args
            .get("num_results")
            .and_then(|v| v.as_u64())
            .unwrap_or(10)
            .min(20) as usize;

        let search_type = args
            .get("search_type")
            .and_then(|v| v.as_str())
            .map(|s| s.to_lowercase())
            .unwrap_or_else(|| "general".to_string());

        if search_type == "images" {
            return Ok(ToolResult {
                success: false,
                data: json!({
                    "error": "Image search is not yet supported in the desktop search flow. \
                              Try using 'web' or 'news' search type instead, or use the \
                              image_generate tool to create images from a text prompt.",
                    "success": false,
                    "suggestion": "Use search_type='web' or 'news', or use the image_generate tool"
                }),
                error: Some(
                    "Image search is not yet supported. Use 'web' or 'news' search type instead, \
                     or use the image_generate tool for AI-generated images."
                        .to_string(),
                ),
                metadata: HashMap::from([
                    ("query".to_string(), json!(&query)),
                    ("search_type".to_string(), json!("images")),
                ]),
            });
        }

        let search_type = match search_type.as_str() {
            "news" => ExecSearchType::News,
            "code" | "programming" => ExecSearchType::Code,
            "academic" | "scholarly" => ExecSearchType::Academic,
            _ => ExecSearchType::General,
        };

        // Emit progress: search in progress
        if let Some(app_handle) = &self.app_handle {
            emit_tool_progress(app_handle, tool_id, 0.5, Some("Fetching results..."));
        }

        let start = Instant::now();
        let executor = SearchExecutor::new();
        match executor
            .run_search_with_app_handle(self.app_handle.as_ref(), &query, search_type, num_results)
            .await
        {
            Ok(raw) => {
                let duration_ms = start.elapsed().as_millis() as u64;
                let provider = raw
                    .get("provider")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");

                let results = raw
                    .get("results")
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();

                let access_timestamp = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0);

                let mut normalized = Vec::new();
                for (idx, item) in results.iter().enumerate() {
                    let title = item
                        .get("title")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let url = item
                        .get("url")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let snippet = item
                        .get("snippet")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();

                    if url.is_empty() && title.is_empty() {
                        continue;
                    }

                    let domain = url::Url::parse(&url)
                        .ok()
                        .and_then(|u| u.host_str().map(|h| h.to_string()));

                    let position = idx + 1;
                    normalized.push(json!({
                        "title": title,
                        "url": url,
                        "snippet": snippet,
                        "domain": domain,
                        "position": position,
                        "citation_id": format!("cite-{}", position),
                        "access_timestamp": access_timestamp,
                    }));
                }

                let count = raw
                    .get("results_count")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(normalized.len() as u64);

                if let Some(app_handle) = &self.app_handle {
                    emit_tool_progress(
                        app_handle,
                        tool_id,
                        1.0,
                        Some(&format!("Found {} results", count)),
                    );
                }

                Ok(ToolResult {
                    success: true,
                    data: json!({
                        "query": raw.get("query").and_then(|v| v.as_str()).unwrap_or(&query),
                        "results": normalized,
                        "count": count,
                        "provider": provider,
                        "duration_ms": duration_ms
                    }),
                    error: None,
                    metadata: HashMap::from([
                        ("query".to_string(), json!(query)),
                        ("provider".to_string(), json!(provider)),
                        ("result_count".to_string(), json!(count)),
                    ]),
                })
            }
            Err(e) => Ok(ToolResult {
                success: false,
                data: json!({
                    "query": query,
                    "results": [],
                    "count": 0,
                    "error": e.to_string()
                }),
                error: Some(format!("Web search failed: {}", e)),
                metadata: HashMap::from([("query".to_string(), json!(query))]),
            }),
        }
    }

    pub(crate) async fn execute_physical_scrape_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let url = args
            .get("url")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing url parameter"))?;
        let selector = args.get("selector").and_then(|v| v.as_str());

        // Use a real browser user agent to avoid bot detection
        let client = reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .build()
            .map_err(|e| anyhow!("Failed to create client: {}", e))?;

        let response = client
            .get(url)
            .header(
                "Accept",
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            )
            .header("Accept-Language", "en-US,en;q=0.5")
            .send()
            .await
            .map_err(|e| anyhow!("Scrape request failed: {}", e))?;

        let status = response.status().as_u16();
        let raw_body = response.text().await.unwrap_or_default();
        let raw_len = raw_body.len();

        // Extract readable text from HTML responses instead of returning raw HTML
        let title = if looks_like_html(&raw_body) {
            extract_title(&raw_body)
        } else {
            None
        };
        let (content, was_html) = process_response_body(&raw_body, 15000);

        let extracted = if let Some(sel) = selector {
            format!(
                "Selector '{}' requested. Text content extracted from page.",
                sel
            )
        } else if was_html {
            "Text content extracted from HTML page.".to_string()
        } else {
            "Raw content returned.".to_string()
        };

        Ok(ToolResult {
            success: (200..300).contains(&status),
            data: json!({
                "url": url,
                "status": status,
                "title": title,
                "content": content,
                "extracted": extracted,
                "content_length": raw_len,
                "was_html": was_html,
                "truncated": content.len() < raw_len
            }),
            error: if status >= 400 {
                Some(format!("HTTP {}", status))
            } else {
                None
            },
            metadata: HashMap::from([
                ("url".to_string(), json!(url)),
                ("selector".to_string(), json!(selector)),
            ]),
        })
    }
}
