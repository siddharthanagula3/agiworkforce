use super::*;

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
                     or use the image_generate tool for AI-generated images.".to_string(),
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
        match executor.run_search(&query, search_type, num_results).await {
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
        let html = response.text().await.unwrap_or_default();

        // If selector provided, note it for the response
        // Full CSS selector parsing would require the scraper crate
        let extracted = if let Some(sel) = selector {
            format!(
                "Selector '{}' requested. Full HTML returned for client-side extraction.",
                sel
            )
        } else {
            "Full HTML content returned.".to_string()
        };

        // Truncate HTML if too large to prevent memory issues
        let content = if html.len() > 50000 {
            html[..50000].to_string()
        } else {
            html.clone()
        };

        Ok(ToolResult {
            success: (200..300).contains(&status),
            data: json!({
                "url": url,
                "status": status,
                "content": content,
                "extracted": extracted,
                "content_length": html.len(),
                "truncated": html.len() > 50000
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
