use serde_json::{json, Value};

pub struct McpServerToolRegistry;

impl McpServerToolRegistry {
    pub fn is_tool_enabled(enabled_tools: &[String], tool_name: &str) -> bool {
        enabled_tools.is_empty() || enabled_tools.iter().any(|enabled| enabled == tool_name)
    }

    pub fn list_tools(enabled_tools: &[String]) -> Vec<Value> {
        let all_tools = vec![
            json!({
                "name": "agi_chat",
                "description": "Chat with any LLM provider (12 providers, auto-routing + fallback). Returns the model's response.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "message": { "type": "string", "description": "The user message to send" },
                        "model": { "type": "string", "description": "Optional model ID (e.g. 'claude-opus-4-6', 'gpt-4o'). Omit for auto-routing." },
                        "system_prompt": { "type": "string", "description": "Optional system prompt" }
                    },
                    "required": ["message"]
                }
            }),
            json!({
                "name": "agi_run_task",
                "description": "Run an autonomous multi-step agent task (up to 25 steps). Returns the final result.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "task": { "type": "string", "description": "The task description for the agent" },
                        "max_steps": { "type": "integer", "description": "Maximum steps (1-25, default 10)" }
                    },
                    "required": ["task"]
                }
            }),
            json!({
                "name": "agi_execute_skill",
                "description": "Execute one of 140+ AGI Workforce AI skills by name (e.g., 'legal-contract-review', 'code-refactor', 'email-compose').",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "skill_name": { "type": "string", "description": "The skill identifier" },
                        "input": { "type": "string", "description": "Input text for the skill" }
                    },
                    "required": ["skill_name", "input"]
                }
            }),
            json!({
                "name": "agi_bash",
                "description": "Execute a shell command on the desktop with timeout. Requires user approval via the AGI Workforce desktop app.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "command": { "type": "string", "description": "Shell command to execute" },
                        "timeout_secs": { "type": "integer", "description": "Timeout in seconds (default 30, max 300)" }
                    },
                    "required": ["command"]
                }
            }),
            json!({
                "name": "agi_research",
                "description": "Conduct web research on a topic and return a summary with citations.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "query": { "type": "string", "description": "Research topic or question" },
                        "depth": { "type": "string", "enum": ["quick", "thorough"], "description": "Research depth (default: quick)" }
                    },
                    "required": ["query"]
                }
            }),
        ];

        all_tools
            .into_iter()
            .filter(|t| {
                let name = t["name"].as_str().unwrap_or("");
                Self::is_tool_enabled(enabled_tools, name)
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::McpServerToolRegistry;

    #[test]
    fn enabled_tool_check_respects_allowlist() {
        let allowlist = vec!["agi_chat".to_string(), "agi_bash".to_string()];

        assert!(McpServerToolRegistry::is_tool_enabled(
            &allowlist, "agi_chat"
        ));
        assert!(!McpServerToolRegistry::is_tool_enabled(
            &allowlist,
            "agi_research"
        ));
        assert!(McpServerToolRegistry::is_tool_enabled(&[], "agi_research"));
    }
}
