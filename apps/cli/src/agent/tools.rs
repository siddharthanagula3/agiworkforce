use anyhow::Result;

use crate::mcp;
use crate::teams;
use crate::tools;

/// Team tool names handled by the team manager.
pub(super) const TEAM_TOOL_NAMES: &[&str] = &[
    "send_message",
    "team_task",
    "read_messages",
    "list_teammates",
];

/// Built-in tools considered mutating for the plan-mode gate.
pub(super) const MUTATING_TOOL_NAMES: &[&str] = &[
    "write_file",
    "edit_file",
    "run_command",
    "apply_patch",
    "multiedit",
    "task",
    "batch",
    "todo_write",
];

/// True when the named tool is considered mutating for plan-mode gating.
pub(super) fn is_mutating_tool(name: &str) -> bool {
    MUTATING_TOOL_NAMES.contains(&name) || name.starts_with("mcp_")
}

/// Check if a tool name is a team tool.
pub(super) fn is_team_tool(name: &str) -> bool {
    TEAM_TOOL_NAMES.contains(&name)
}

/// Execute a team tool, routing to the appropriate handler in teams.rs.
pub(super) async fn execute_team_tool(
    team_manager: &Option<teams::TeamManager>,
    name: &str,
    args: &std::collections::HashMap<String, String>,
) -> Result<tools::ToolResult> {
    let tm = match team_manager {
        Some(tm) => tm,
        None => {
            return Ok(tools::ToolResult {
                tool_name: name.to_string(),
                success: false,
                output: "Team mode is not enabled. Use --team flag or AGI_TEAM=1.".to_string(),
            });
        }
    };

    match name {
        "send_message" => teams::execute_send_message(tm, args).await,
        "team_task" => teams::execute_team_task(tm, args).await,
        "read_messages" => teams::execute_read_messages(tm, args).await,
        "list_teammates" => teams::execute_list_teammates(tm).await,
        _ => Ok(tools::ToolResult {
            tool_name: name.to_string(),
            success: false,
            output: format!("Unknown team tool: {}", name),
        }),
    }
}

/// Execute an MCP tool via the manager, returning a ToolResult.
pub(super) async fn execute_mcp_tool(
    mcp_manager: &mut Option<mcp::McpManager>,
    name: &str,
    arguments: serde_json::Value,
) -> Result<tools::ToolResult> {
    match mcp_manager {
        Some(ref mut mgr) => match mgr.execute_tool(name, arguments).await {
            Ok(output) => Ok(tools::ToolResult {
                tool_name: name.to_string(),
                success: true,
                output,
            }),
            Err(e) => Ok(tools::ToolResult {
                tool_name: name.to_string(),
                success: false,
                output: format!("MCP tool error: {:#}", e),
            }),
        },
        None => Ok(tools::ToolResult {
            tool_name: name.to_string(),
            success: false,
            output: "No MCP connection available for this tool".to_string(),
        }),
    }
}
