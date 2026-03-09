use super::*;

pub(super) const MCP_TOOL_TIMEOUT_MS: u64 = 120_000; // 120s: MCP tool calls may involve remote APIs, I/O, and browser/runtime startup

impl ToolExecutor {
    /// Expand tilde (~) to home directory in path strings.
    /// This is needed because the MCP filesystem server doesn't expand tilde.
    pub(super) fn expand_tilde_in_args(args: &mut HashMap<String, Value>) {
        let path_fields = ["path", "file_path", "directory", "dir", "root"];
        if let Some(home) = dirs::home_dir() {
            let home_str = home.to_string_lossy().to_string();
            for field in &path_fields {
                if let Some(value) = args.get_mut(*field) {
                    if let Some(path_str) = value.as_str().map(str::trim) {
                        if path_str.starts_with('~') {
                            let expanded = path_str.trim_start_matches('~').trim_start_matches('/');
                            let new_path = if expanded.is_empty() {
                                home_str.clone()
                            } else {
                                format!("{}/{}", home_str, expanded)
                            };
                            *value = json!(new_path);
                        }
                    }
                }
            }
        }
    }

    pub(crate) async fn execute_mcp_tool(
        &self,
        tool_call: &ToolCall,
        mut args: HashMap<String, serde_json::Value>,
    ) -> Result<ToolResult> {
        use crate::sys::commands::McpState;

        // Expand tilde (~) in path arguments before calling MCP server
        // The MCP filesystem server doesn't expand tilde, so we need to do it here
        Self::expand_tilde_in_args(&mut args);

        let mcp_state = self
            .app_handle
            .as_ref()
            .and_then(|h| h.try_state::<McpState>())
            .ok_or_else(|| anyhow!("MCP state not available"))?;
        let normalization_args = args.clone();

        let timeout_ms = args
            .get("timeout_ms")
            .and_then(|v| v.as_u64())
            .unwrap_or(MCP_TOOL_TIMEOUT_MS)
            .min(300_000);
        let started = Instant::now();

        tracing::info!(
            "[ToolExecutor] MCP tool start name='{}' timeout_ms={}",
            tool_call.name,
            timeout_ms
        );

        // Debug: log the arguments
        tracing::debug!("[ToolExecutor] MCP tool arguments: {:?}", args);

        // Execute with timeout
        let result = timeout(
            TokioDuration::from_millis(timeout_ms),
            mcp_state.registry.execute_tool(&tool_call.name, args),
        )
        .await;

        match result {
            Ok(Ok(result_value)) => {
                let normalized_result = Self::normalize_mcp_tool_result(
                    &tool_call.name,
                    &normalization_args,
                    result_value,
                );
                tracing::info!(
                    "[ToolExecutor] MCP tool completed name='{}' elapsed_ms={}",
                    tool_call.name,
                    started.elapsed().as_millis()
                );
                Ok(ToolResult {
                    success: true,
                    data: normalized_result,
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            Ok(Err(e)) => {
                tracing::error!(
                    "[ToolExecutor] MCP tool failed name='{}' elapsed_ms={} error={}",
                    tool_call.name,
                    started.elapsed().as_millis(),
                    e
                );
                Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("MCP tool execution failed: {}", e), "success": false }),
                    error: Some(format!("MCP tool execution failed: {}", e)),
                    metadata: HashMap::new(),
                })
            }
            Err(_) => {
                tracing::error!(
                    "[ToolExecutor] MCP tool timeout name='{}' elapsed_ms={} timeout_ms={}",
                    tool_call.name,
                    started.elapsed().as_millis(),
                    timeout_ms
                );
                Ok(ToolResult {
                    success: false,
                    data: json!({
                        "tool_name": tool_call.name,
                        "timeout_ms": timeout_ms
                    }),
                    error: Some(format!(
                        "MCP tool '{}' timed out after {}ms. Check MCP server health/access and retry.",
                        tool_call.name, timeout_ms
                    )),
                    metadata: HashMap::new(),
                })
            }
        }
    }

    pub(super) fn extract_mcp_text_blocks(result_value: &Value) -> Vec<String> {
        result_value
            .get("content")
            .and_then(Value::as_array)
            .map(|blocks| {
                blocks
                    .iter()
                    .filter_map(|block| {
                        let block_type = block
                            .get("type")
                            .and_then(Value::as_str)
                            .unwrap_or_default();
                        if !block_type.eq_ignore_ascii_case("text") {
                            return None;
                        }
                        block
                            .get("text")
                            .and_then(Value::as_str)
                            .map(|text| text.to_string())
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default()
    }

    pub(super) fn normalize_mcp_filesystem_list_directory(
        args: &HashMap<String, Value>,
        result_value: &Value,
    ) -> Option<Value> {
        let path_hint = args.get("path").and_then(Value::as_str).map(str::trim);
        let text_blocks = Self::extract_mcp_text_blocks(result_value);
        if text_blocks.is_empty() {
            return None;
        }

        let mut entries: Vec<Value> = Vec::new();
        for text in text_blocks {
            for line in text.lines() {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }

                let (entry_type, rest) = if let Some(rest) = trimmed.strip_prefix("[DIR]") {
                    ("directory", rest.trim())
                } else if let Some(rest) = trimmed.strip_prefix("[FILE]") {
                    ("file", rest.trim())
                } else if let Some(rest) = trimmed.strip_prefix("[SYMLINK]") {
                    ("symlink", rest.trim())
                } else {
                    continue;
                };

                if rest.is_empty() {
                    continue;
                }

                let mut name = rest.to_string();
                if entry_type == "file" {
                    if let Some(size_start) = name.rfind(" (") {
                        if name.ends_with(')') {
                            name.truncate(size_start);
                            name = name.trim().to_string();
                        }
                    }
                }
                if name.is_empty() {
                    continue;
                }

                let full_path = path_hint
                    .map(|base| Path::new(base).join(&name).to_string_lossy().to_string())
                    .unwrap_or_else(|| name.clone());

                entries.push(json!({
                    "name": name,
                    "type": entry_type,
                    "path": full_path,
                    "size": 0
                }));
            }
        }

        if entries.is_empty() {
            return None;
        }

        entries.sort_by(|left, right| {
            let left_name = left
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_lowercase();
            let right_name = right
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_lowercase();
            left_name.cmp(&right_name)
        });

        let returned = entries.len();
        Some(json!({
            "entries": entries,
            "count": returned,
            "returned": returned,
            "offset": 0,
            "limit": returned,
            "has_more": false,
            "next_offset": Value::Null,
            "path": path_hint,
            "excluded": [],
            "max_depth": 1,
            "source": "mcp_filesystem_list_directory"
        }))
    }

    pub(super) fn normalize_mcp_filesystem_list_allowed_directories(result_value: &Value) -> Option<Value> {
        let text_blocks = Self::extract_mcp_text_blocks(result_value);
        if text_blocks.is_empty() {
            return None;
        }

        let mut directories: Vec<String> = Vec::new();
        for text in &text_blocks {
            if let Ok(parsed_json) = serde_json::from_str::<Value>(text) {
                if let Some(list) = parsed_json.get("directories").and_then(Value::as_array) {
                    directories.extend(
                        list.iter()
                            .filter_map(Value::as_str)
                            .map(|value| value.trim().to_string())
                            .filter(|value| !value.is_empty()),
                    );
                } else if let Some(list) = parsed_json.as_array() {
                    directories.extend(
                        list.iter()
                            .filter_map(Value::as_str)
                            .map(|value| value.trim().to_string())
                            .filter(|value| !value.is_empty()),
                    );
                }
            }

            for raw_line in text.lines() {
                let mut line = raw_line.trim();
                if line.is_empty() {
                    continue;
                }

                if let Some(rest) = line.strip_prefix("[DIR]") {
                    line = rest.trim();
                }
                if let Some(rest) = line.strip_prefix("- ") {
                    line = rest.trim();
                }
                if let Some(rest) = line.strip_prefix("* ") {
                    line = rest.trim();
                }
                if let Some((prefix, rest)) = line.split_once(':') {
                    if prefix.to_lowercase().contains("allowed director") {
                        line = rest.trim();
                    }
                }

                if line.is_empty() {
                    continue;
                }
                let looks_like_path = line.starts_with('/')
                    || line.starts_with("~/")
                    || line.starts_with("./")
                    || line.starts_with("../")
                    || line.contains(":\\");
                if looks_like_path {
                    directories.push(line.to_string());
                }
            }
        }

        directories.sort();
        directories.dedup();
        if directories.is_empty() {
            return None;
        }

        Some(json!({
            "directories": directories,
            "count": directories.len(),
            "source": "mcp_filesystem_list_allowed_directories"
        }))
    }

    pub(super) fn normalize_mcp_filesystem_read_text_file(
        args: &HashMap<String, Value>,
        result_value: &Value,
    ) -> Option<Value> {
        let text_blocks = Self::extract_mcp_text_blocks(result_value);
        if text_blocks.is_empty() {
            return None;
        }

        let content = text_blocks.join("\n");
        let path = args
            .get("path")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty());

        Some(json!({
            "path": path,
            "content": content,
            "source": "mcp_filesystem_read_text_file"
        }))
    }

    pub(super) fn normalize_mcp_tool_result(
        tool_name: &str,
        args: &HashMap<String, Value>,
        result_value: Value,
    ) -> Value {
        let normalized_tool_name = tool_name.to_lowercase();
        if !normalized_tool_name.starts_with("mcp__filesystem__") {
            return result_value;
        }

        if normalized_tool_name.ends_with("list_directory")
            || normalized_tool_name.ends_with("list_directory_with_sizes")
        {
            if let Some(normalized) =
                Self::normalize_mcp_filesystem_list_directory(args, &result_value)
            {
                return normalized;
            }
        }

        if normalized_tool_name.ends_with("list_allowed_directories") {
            if let Some(normalized) =
                Self::normalize_mcp_filesystem_list_allowed_directories(&result_value)
            {
                return normalized;
            }
        }

        if normalized_tool_name.ends_with("read_text_file") {
            if let Some(normalized) =
                Self::normalize_mcp_filesystem_read_text_file(args, &result_value)
            {
                return normalized;
            }
        }

        result_value
    }
}
