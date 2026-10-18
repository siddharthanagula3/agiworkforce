use super::*;

const TOOL_SEARCH_DEFAULT_LIMIT: usize = 8;
const TOOL_SEARCH_MAX_LIMIT: usize = 20;

#[derive(Debug)]
struct ToolSearchMatch {
    tool: Tool,
    score: i32,
}

impl ToolExecutor {
    pub(super) async fn execute_tool_search_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let query = args
            .get("query")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|query| !query.is_empty())
            .ok_or_else(|| anyhow!("Missing required 'query' string parameter"))?;

        let limit = args
            .get("max_results")
            .or_else(|| args.get("limit"))
            .and_then(Value::as_u64)
            .map(|value| value as usize)
            .unwrap_or(TOOL_SEARCH_DEFAULT_LIMIT)
            .clamp(1, TOOL_SEARCH_MAX_LIMIT);

        let include_schemas = args
            .get("include_schemas")
            .and_then(Value::as_bool)
            .unwrap_or(true);

        let switches = self.app_handle.as_ref().and_then(|app| {
            use tauri::Manager;
            app.try_state::<crate::sys::commands::capabilities::CapabilityState>()
        });
        let all_tools = searchable_tools(self.registry.list_tools(), switches.as_deref());
        let total_tools = all_tools.len();

        let matches = if let Some(selection) = query.strip_prefix("select:") {
            self.select_tools(selection, &all_tools)
        } else {
            self.search_tools_by_keyword(query, &all_tools, limit)
        };

        let tools = matches
            .iter()
            .take(limit)
            .map(|matched| {
                let definition = self.convert_tool_to_definition(&matched.tool);
                let capabilities = matched
                    .tool
                    .capabilities
                    .iter()
                    .map(|capability| format!("{:?}", capability))
                    .collect::<Vec<_>>();

                if include_schemas {
                    json!({
                        "name": matched.tool.id,
                        "display_name": matched.tool.name,
                        "description": matched.tool.description,
                        "capabilities": capabilities,
                        "score": matched.score,
                        "schema": definition,
                    })
                } else {
                    json!({
                        "name": matched.tool.id,
                        "display_name": matched.tool.name,
                        "description": matched.tool.description,
                        "capabilities": capabilities,
                        "score": matched.score,
                    })
                }
            })
            .collect::<Vec<_>>();

        Ok(ToolResult {
            success: true,
            data: json!({
                "success": true,
                "query": query,
                "matches": tools,
                "match_count": tools.len(),
                "total_tools": total_tools,
                "guidance": "Use select:<tool_name> for exact lookup. MCP tools are exposed separately with names like mcp__server__tool when connected."
            }),
            error: None,
            metadata: HashMap::from([
                ("tool_name".to_string(), json!("tool_search")),
                ("query".to_string(), json!(query)),
            ]),
        })
    }

    fn select_tools(&self, selection: &str, all_tools: &[Tool]) -> Vec<ToolSearchMatch> {
        let requested = selection
            .split(',')
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .collect::<Vec<_>>();

        let mut matches = Vec::new();
        for requested_name in requested {
            if let Some(tool) = all_tools
                .iter()
                .find(|tool| tool.id.eq_ignore_ascii_case(requested_name))
                .cloned()
            {
                matches.push(ToolSearchMatch { tool, score: 100 });
            }
        }
        matches
    }

    fn search_tools_by_keyword(
        &self,
        query: &str,
        all_tools: &[Tool],
        limit: usize,
    ) -> Vec<ToolSearchMatch> {
        let normalized_query = normalize_search_text(query);
        let terms = normalized_query
            .split_whitespace()
            .filter(|term| !term.is_empty())
            .collect::<Vec<_>>();

        if terms.is_empty() {
            return Vec::new();
        }

        let mut scored = all_tools
            .iter()
            .filter(|tool| tool.id != "tool_search")
            .filter_map(|tool| {
                let score = score_tool_match(tool, &terms);
                (score > 0).then(|| ToolSearchMatch {
                    tool: tool.clone(),
                    score,
                })
            })
            .collect::<Vec<_>>();

        scored.sort_by(|a, b| {
            b.score
                .cmp(&a.score)
                .then_with(|| a.tool.id.cmp(&b.tool.id))
        });
        scored.truncate(limit);
        scored
    }
}

/// The tools a search may return: what chat offers, less every tool under a
/// capability that is off, so a search never hands back a tool the next call
/// would be refused.
fn searchable_tools(
    mut tools: Vec<Tool>,
    switches: Option<&crate::sys::commands::capabilities::CapabilityState>,
) -> Vec<Tool> {
    if let Some(switches) = switches {
        tools.retain(|tool| switches.tool_refusal_now(&tool.id).is_none());
    }
    tools.sort_by(|a, b| a.id.cmp(&b.id));
    tools
}

fn score_tool_match(tool: &Tool, terms: &[&str]) -> i32 {
    let id = normalize_search_text(&tool.id);
    let name = normalize_search_text(&tool.name);
    let description = normalize_search_text(&tool.description);
    let capabilities = tool
        .capabilities
        .iter()
        .map(|capability| normalize_search_text(&format!("{:?}", capability)))
        .collect::<Vec<_>>()
        .join(" ");

    let mut score = 0;
    for term in terms {
        if id == *term {
            score += 30;
        } else if id.split_whitespace().any(|part| part == *term) {
            score += 16;
        } else if id.contains(term) {
            score += 8;
        }

        if name.split_whitespace().any(|part| part == *term) {
            score += 12;
        } else if name.contains(term) {
            score += 6;
        }

        if capabilities.contains(term) {
            score += 5;
        }

        if description.contains(term) {
            score += 3;
        }
    }

    score
}

fn normalize_search_text(value: &str) -> String {
    value
        .replace(['_', '-', '/', ':'], " ")
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sys::commands::capabilities::{tool_to_capability, CapabilityState, SavedSwitches};

    fn registry_tools() -> Vec<Tool> {
        let registry = ToolRegistry::new().expect("registry");
        registry.register_all_tools().expect("register all tools");
        registry.list_tools()
    }

    #[test]
    fn a_search_returns_no_tool_under_a_capability_that_is_off() {
        let files_off = CapabilityState::from_saved(SavedSwitches::Saved(HashMap::from([(
            "fileOperations".to_string(),
            false,
        )])));

        let found = searchable_tools(registry_tools(), Some(&files_off));
        assert!(found
            .iter()
            .all(|tool| tool_to_capability(&tool.id) != Some("fileOperations")));
        assert!(found.iter().any(|tool| tool.id == "terminal_execute"));

        let all_on = searchable_tools(registry_tools(), None);
        assert!(all_on.iter().any(|tool| tool.id == "file_read"));
    }
}
