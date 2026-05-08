#![allow(dead_code)]
//! Phase E (W2-W6): Tool search and on-demand schema loader.
//!
//! Translates Claude Code's `ToolSearchTool.ts` / `shouldDefer` / `shouldDefer`
//! pattern into Rust. The model receives only the ~11 core tool schemas in its
//! initial context; niche tools (apply_patch, update_plan, glob, batch,
//! multiedit, todo_*, ask_user, read_many_files) are deferred and loaded here
//! on demand.
//!
//! Query syntax:
//!   - `select:tool1,tool2`  — load exact schemas for named tools
//!   - `"file edit"`          — fuzzy keyword search across name + description
//!   - `"patch"`              — same, returns up to max_results matches

use crate::models::ToolDefinition;
use crate::plugins::DiscoverableTool;
use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Simple name+description search result (used by plugin discovery flow)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolSearchResult {
    pub name: String,
    pub description: String,
    pub relevance: f64,
}

/// Keyword search across a slice of DiscoverableTool entries.
/// Used by the plugin discovery flow (`plugins::build_discoverable_tools`).
pub fn search_tools(
    query: &str,
    all_tools: &[DiscoverableTool],
    max_results: usize,
) -> Vec<ToolSearchResult> {
    let ql = query.to_lowercase();
    let terms: Vec<&str> = ql.split_whitespace().collect();
    let mut scored: Vec<(f64, &DiscoverableTool)> = all_tools
        .iter()
        .filter_map(|t| {
            let nl = t.name.to_lowercase();
            let dl = t.description.to_lowercase();
            let mut s = 0.0;
            for term in &terms {
                if nl == *term {
                    s += 10.0;
                } else if nl.contains(term) {
                    s += 5.0;
                }
                if dl.contains(term) {
                    s += 2.0;
                }
            }
            if s > 0.0 {
                Some((s, t))
            } else {
                None
            }
        })
        .collect();
    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    scored
        .into_iter()
        .take(max_results)
        .map(|(s, t)| ToolSearchResult {
            name: t.name.clone(),
            description: t.description.clone(),
            relevance: s,
        })
        .collect()
}

pub fn format_search_results(results: &[ToolSearchResult]) -> String {
    if results.is_empty() {
        return "No matching tools.".into();
    }
    results
        .iter()
        .map(|r| format!("  {} — {}", r.name, r.description))
        .collect::<Vec<_>>()
        .join("\n")
}

// ---------------------------------------------------------------------------
// Phase E: schema-rendering search over ToolDefinition catalog
// ---------------------------------------------------------------------------

/// Result of a schema-level tool search. Contains the full JSON schema so the
/// model can call the tool immediately without a second round-trip.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolSchemaResult {
    pub name: String,
    pub description: String,
    /// JSON Schema exactly as the model expects it (same structure as the
    /// initial tool-list entry).
    pub input_schema: serde_json::Value,
    /// True when this tool was loaded on-demand (deferred). False when it was
    /// already in the initial schema list.
    pub was_deferred: bool,
}

/// Parse the query string and return matching `ToolSchemaResult` entries.
///
/// Query formats:
/// - `"select:apply_patch,glob"` — exact names, comma-separated after `select:`
/// - `"patch"` / `"file edit"` — keyword fuzzy search (space-separated terms)
///
/// `catalog` should be the full built-in catalog including deferred tools
/// (use `all_builtin_tool_definitions()`).
pub fn search_tool_schemas(
    query: &str,
    catalog: &[ToolDefinition],
    max_results: usize,
) -> Vec<ToolSchemaResult> {
    let trimmed = query.trim();

    if let Some(names_str) = trimmed.strip_prefix("select:") {
        // Exact select — return full schemas for explicitly named tools.
        let names: Vec<&str> = names_str
            .split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .collect();
        catalog
            .iter()
            .filter(|t| names.contains(&t.name.as_str()))
            .map(|t| ToolSchemaResult {
                name: t.name.clone(),
                description: t.description.clone(),
                input_schema: t.input_schema.clone(),
                was_deferred: t.should_defer,
            })
            .collect()
    } else {
        // Keyword fuzzy search over name + description.
        let ql = trimmed.to_lowercase();
        let terms: Vec<&str> = ql.split_whitespace().collect();
        if terms.is_empty() {
            return vec![];
        }
        let mut scored: Vec<(f64, &ToolDefinition)> = catalog
            .iter()
            .filter_map(|t| {
                let nl = t.name.to_lowercase();
                let dl = t.description.to_lowercase();
                let mut s = 0.0_f64;
                for term in &terms {
                    if nl == *term {
                        s += 10.0;
                    } else if nl.contains(term) {
                        s += 5.0;
                    }
                    if dl.contains(term) {
                        s += 2.0;
                    }
                }
                if s > 0.0 {
                    Some((s, t))
                } else {
                    None
                }
            })
            .collect();
        scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
        scored
            .into_iter()
            .take(max_results)
            .map(|(_, t)| ToolSchemaResult {
                name: t.name.clone(),
                description: t.description.clone(),
                input_schema: t.input_schema.clone(),
                was_deferred: t.should_defer,
            })
            .collect()
    }
}

/// Render a list of `ToolSchemaResult` entries as the JSON string the model
/// expects — one JSON object per tool with `name`, `description`, and
/// `input_schema` fields, wrapped in a JSON array.
///
/// The model can use these schemas to call the loaded tools immediately.
pub fn render_schema_results(results: &[ToolSchemaResult]) -> String {
    if results.is_empty() {
        return "No matching tools found. Try a different keyword or check the tool name."
            .to_string();
    }
    match serde_json::to_string_pretty(results) {
        Ok(json) => format!(
            "Found {} tool(s). You can call these tools now using their schemas below:\n\n{}",
            results.len(),
            json
        ),
        Err(e) => format!("Error serializing tool schemas: {}", e),
    }
}

// ---------------------------------------------------------------------------
// Feature flags (stable — kept from original tool_search.rs)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default)]
pub struct FeatureFlags {
    pub shell_tool: bool,
    pub unified_exec: bool,
    pub code_mode: bool,
    pub js_repl: bool,
    pub artifact: bool,
    pub apply_patch_freeform: bool,
    pub collab: bool,
    pub tool_suggest: bool,
    pub request_permissions: bool,
    pub web_search: bool,
}

impl FeatureFlags {
    pub fn standard() -> Self {
        Self {
            shell_tool: true,
            unified_exec: false,
            code_mode: false,
            js_repl: false,
            artifact: false,
            apply_patch_freeform: true,
            collab: false,
            tool_suggest: true,
            request_permissions: true,
            web_search: true,
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::tool_catalog;

    fn make_tool(name: &str, description: &str, deferred: bool) -> ToolDefinition {
        ToolDefinition {
            name: name.to_string(),
            description: description.to_string(),
            input_schema: serde_json::json!({"type": "object", "properties": {}, "required": []}),
            is_read_only: false,
            is_concurrency_safe: false,
            max_result_size_chars: None,
            should_defer: deferred,
        }
    }

    // -----------------------------------------------------------------------
    // select: directive
    // -----------------------------------------------------------------------

    #[test]
    fn select_directive_returns_exact_schemas() {
        let catalog = vec![
            make_tool("apply_patch", "Apply a patch", true),
            make_tool("read_file", "Read a file", false),
            make_tool("glob", "Find files", true),
        ];
        let results = search_tool_schemas("select:apply_patch,glob", &catalog, 10);
        assert_eq!(results.len(), 2);
        let names: Vec<&str> = results.iter().map(|r| r.name.as_str()).collect();
        assert!(names.contains(&"apply_patch"));
        assert!(names.contains(&"glob"));
    }

    #[test]
    fn select_directive_returns_was_deferred_flag() {
        let catalog = vec![
            make_tool("apply_patch", "Apply a patch", true),
            make_tool("read_file", "Read a file", false),
        ];
        let results = search_tool_schemas("select:apply_patch,read_file", &catalog, 10);
        let ap = results.iter().find(|r| r.name == "apply_patch").unwrap();
        let rf = results.iter().find(|r| r.name == "read_file").unwrap();
        assert!(ap.was_deferred);
        assert!(!rf.was_deferred);
    }

    #[test]
    fn select_directive_unknown_tool_returns_empty() {
        let catalog = vec![make_tool("read_file", "Read a file", false)];
        let results = search_tool_schemas("select:nonexistent", &catalog, 10);
        assert!(results.is_empty());
    }

    #[test]
    fn select_directive_preserves_input_schema() {
        let schema = serde_json::json!({
            "type": "object",
            "properties": {
                "patch": {"type": "string"}
            },
            "required": ["patch"]
        });
        let tool = ToolDefinition {
            name: "apply_patch".to_string(),
            description: "Apply a patch".to_string(),
            input_schema: schema.clone(),
            is_read_only: false,
            is_concurrency_safe: false,
            max_result_size_chars: None,
            should_defer: true,
        };
        let results = search_tool_schemas("select:apply_patch", &[tool], 10);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].input_schema, schema);
    }

    // -----------------------------------------------------------------------
    // Keyword search
    // -----------------------------------------------------------------------

    #[test]
    fn keyword_search_matches_name() {
        let catalog = vec![
            make_tool("apply_patch", "Apply a unified diff", true),
            make_tool("read_file", "Read file contents", false),
        ];
        let results = search_tool_schemas("patch", &catalog, 10);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "apply_patch");
    }

    #[test]
    fn keyword_search_matches_description() {
        let catalog = vec![
            make_tool("tool_a", "Reads files from disk", false),
            make_tool("tool_b", "Writes data to network", false),
        ];
        let results = search_tool_schemas("network", &catalog, 10);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "tool_b");
    }

    #[test]
    fn keyword_search_respects_max_results() {
        let catalog: Vec<ToolDefinition> = (0..10)
            .map(|i| make_tool(&format!("file_tool_{}", i), "file operation", false))
            .collect();
        let results = search_tool_schemas("file", &catalog, 3);
        assert_eq!(results.len(), 3);
    }

    #[test]
    fn empty_query_returns_empty() {
        let catalog = vec![make_tool("read_file", "Read a file", false)];
        let results = search_tool_schemas("", &catalog, 10);
        assert!(results.is_empty());
    }

    #[test]
    fn whitespace_query_returns_empty() {
        let catalog = vec![make_tool("read_file", "Read a file", false)];
        let results = search_tool_schemas("   ", &catalog, 10);
        assert!(results.is_empty());
    }

    // -----------------------------------------------------------------------
    // render_schema_results
    // -----------------------------------------------------------------------

    #[test]
    fn render_empty_results_says_no_tools_found() {
        let output = render_schema_results(&[]);
        assert!(output.contains("No matching tools"));
    }

    #[test]
    fn render_results_includes_tool_names() {
        let catalog = vec![make_tool("apply_patch", "Apply a patch", true)];
        let results = search_tool_schemas("select:apply_patch", &catalog, 10);
        let output = render_schema_results(&results);
        assert!(output.contains("apply_patch"));
        assert!(output.contains("Found 1 tool"));
    }

    // -----------------------------------------------------------------------
    // Integration: catalog deferred flag
    // -----------------------------------------------------------------------

    #[test]
    fn builtin_catalog_deferred_tools_loadable_via_select() {
        let catalog = tool_catalog::all_builtin_tool_definitions();
        let results = search_tool_schemas("select:apply_patch", &catalog, 10);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "apply_patch");
        assert!(results[0].was_deferred);
    }

    #[test]
    fn builtin_catalog_always_loaded_tools_not_deferred() {
        let catalog = tool_catalog::all_builtin_tool_definitions();
        let always = ["read_file", "write_file", "edit_file", "run_command", "grep_files", "task", "web_search", "web_fetch", "tool_search", "search_files", "list_directory"];
        for name in &always {
            let results = search_tool_schemas(&format!("select:{}", name), &catalog, 10);
            assert_eq!(results.len(), 1, "tool {} not found in catalog", name);
            assert!(
                !results[0].was_deferred,
                "tool {} should NOT be deferred",
                name
            );
        }
    }

    #[test]
    fn builtin_catalog_niche_tools_are_deferred() {
        let catalog = tool_catalog::all_builtin_tool_definitions();
        let deferred = ["apply_patch", "update_plan", "glob", "batch", "multiedit", "todo_read", "todo_write", "ask_user", "read_many_files"];
        for name in &deferred {
            let results = search_tool_schemas(&format!("select:{}", name), &catalog, 10);
            assert_eq!(results.len(), 1, "deferred tool {} not found in catalog", name);
            assert!(
                results[0].was_deferred,
                "tool {} SHOULD be deferred",
                name
            );
        }
    }

    #[test]
    fn always_loaded_definitions_excludes_deferred() {
        let always = tool_catalog::always_loaded_tool_definitions();
        for t in &always {
            assert!(
                !t.should_defer,
                "always_loaded_tool_definitions returned a deferred tool: {}",
                t.name
            );
        }
    }

    #[test]
    fn always_loaded_includes_tool_search_itself() {
        let always = tool_catalog::always_loaded_tool_definitions();
        assert!(
            always.iter().any(|t| t.name == "tool_search"),
            "tool_search must be in always-loaded set (it is the deferred loader)"
        );
    }
}
