#![allow(dead_code, unused_imports)]
use serde::{Deserialize, Serialize};
use crate::plugins::DiscoverableTool;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolSearchResult { pub name: String, pub description: String, pub relevance: f64 }

pub fn search_tools(query: &str, all_tools: &[DiscoverableTool], max_results: usize) -> Vec<ToolSearchResult> {
    let ql = query.to_lowercase();
    let terms: Vec<&str> = ql.split_whitespace().collect();
    let mut scored: Vec<(f64, &DiscoverableTool)> = all_tools.iter().filter_map(|t| {
        let nl = t.name.to_lowercase();
        let dl = t.description.to_lowercase();
        let mut s = 0.0;
        for term in &terms {
            if nl == *term { s += 10.0; } else if nl.contains(term) { s += 5.0; }
            if dl.contains(term) { s += 2.0; }
        }
        if s > 0.0 { Some((s, t)) } else { None }
    }).collect();
    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    scored.into_iter().take(max_results).map(|(s, t)| ToolSearchResult { name: t.name.clone(), description: t.description.clone(), relevance: s }).collect()
}

pub fn format_search_results(results: &[ToolSearchResult]) -> String {
    if results.is_empty() { return "No matching tools.".into(); }
    results.iter().map(|r| format!("  {} — {}", r.name, r.description)).collect::<Vec<_>>().join("\n")
}

#[derive(Debug, Clone, Default)]
pub struct FeatureFlags {
    pub shell_tool: bool, pub unified_exec: bool, pub code_mode: bool, pub js_repl: bool,
    pub artifact: bool, pub apply_patch_freeform: bool, pub collab: bool,
    pub tool_suggest: bool, pub request_permissions: bool, pub web_search: bool,
}

impl FeatureFlags {
    pub fn standard() -> Self {
        Self { shell_tool: true, unified_exec: false, code_mode: false, js_repl: false, artifact: false, apply_patch_freeform: true, collab: false, tool_suggest: true, request_permissions: true, web_search: true }
    }
}
