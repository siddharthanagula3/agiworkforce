use anyhow::Result;
use std::io::IsTerminal;

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

/// Check if a tool name is a team tool.
pub(super) fn is_team_tool(name: &str) -> bool {
    TEAM_TOOL_NAMES.contains(&name)
}

/// Execute a team tool, routing to the appropriate handler in teams.rs.
pub(super) async fn execute_team_tool(
    team_manager: &Option<teams::TeamManager>,
    name: &str,
    args: &std::collections::HashMap<String, String>,
    // The authenticated identity of the executing teammate, when known. Forces
    // the message sender so a turn cannot forge a message "from" another
    // teammate. `None` in today's single-orchestrator session (single trust
    // boundary); wire the executing teammate's name here once teammate-scoped
    // sessions exist.
    acting_sender: Option<&str>,
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
        "send_message" => teams::execute_send_message(tm, args, acting_sender).await,
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
    privacy_mode: super::PrivacyMode,
    require_confirmation: bool,
    approval_callback: Option<tools::ApprovalCallback>,
) -> Result<tools::ToolResult> {
    match mcp_manager {
        Some(ref mut mgr) => {
            let (server_name, tool_name) = match mgr.tool_identity(name, privacy_mode) {
                Ok(identity) => identity,
                Err(error) => {
                    return Ok(tools::ToolResult {
                        tool_name: name.to_string(),
                        success: false,
                        output: format!("MCP tool error: {error:#}"),
                    });
                }
            };
            if require_confirmation
                && !request_mcp_tool_approval(
                    approval_callback.as_ref(),
                    &server_name,
                    &tool_name,
                    &arguments,
                )
                .await
            {
                return Ok(tools::ToolResult {
                    tool_name: name.to_string(),
                    success: false,
                    output: format!(
                        "MCP tool '{tool_name}' from server '{server_name}' was not approved."
                    ),
                });
            }

            match mgr.execute_tool(name, arguments, privacy_mode).await {
                Ok(output) => Ok(tools::ToolResult {
                    tool_name: name.to_string(),
                    success: true,
                    output,
                }),
                Err(e) => Ok(tools::ToolResult {
                    tool_name: name.to_string(),
                    success: false,
                    output: format!("MCP tool error: {e:#}"),
                }),
            }
        }
        None => Ok(tools::ToolResult {
            tool_name: name.to_string(),
            success: false,
            output: "No MCP connection available for this tool".to_string(),
        }),
    }
}

async fn request_mcp_tool_approval(
    approval_callback: Option<&tools::ApprovalCallback>,
    server_name: &str,
    tool_name: &str,
    arguments: &serde_json::Value,
) -> bool {
    let mut argument_preview = serde_json::to_string_pretty(arguments)
        .unwrap_or_else(|_| "<arguments unavailable>".to_string());
    const MAX_ARGUMENT_PREVIEW_CHARS: usize = 4_000;
    if argument_preview.chars().count() > MAX_ARGUMENT_PREVIEW_CHARS {
        argument_preview = argument_preview
            .chars()
            .take(MAX_ARGUMENT_PREVIEW_CHARS)
            .collect::<String>();
        argument_preview.push_str("\n… truncated");
    }

    let request = crate::tui::approval_broker::ApprovalRequest::new(
        crate::tui::approval_broker::ApprovalRequestKind::McpTool {
            server_name: server_name.to_string(),
            tool_name: tool_name.to_string(),
        },
        format!("Allow MCP tool '{tool_name}' from server '{server_name}'?"),
        vec![argument_preview],
    );

    if let Some(decision) = tools::request_approval(approval_callback, request).await {
        return tools::approval_allows(decision);
    }

    if !std::io::stdin().is_terminal() || !std::io::stderr().is_terminal() {
        return false;
    }

    dialoguer::Confirm::new()
        .with_prompt(format!(
            "Allow MCP tool '{tool_name}' from server '{server_name}'?"
        ))
        .default(false)
        .interact()
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeSet;

    #[tokio::test]
    async fn mcp_tool_approval_denial_is_fail_closed() {
        let callback: crate::tools::ApprovalCallback = std::sync::Arc::new(|request| {
            Box::pin(async move {
                assert!(matches!(
                    request.kind,
                    crate::tui::approval_broker::ApprovalRequestKind::McpTool {
                        ref server_name,
                        ref tool_name,
                    } if server_name == "docs" && tool_name == "search"
                ));
                crate::tui::approval_broker::ApprovalDecision::Deny
            })
        });

        let allowed = request_mcp_tool_approval(
            Some(&callback),
            "docs",
            "search",
            &serde_json::json!({"query": "private source"}),
        )
        .await;

        assert!(!allowed);
    }

    #[tokio::test]
    async fn mcp_dispatch_does_not_reach_the_server_after_denial() {
        let callback: crate::tools::ApprovalCallback = std::sync::Arc::new(|_| {
            Box::pin(async { crate::tui::approval_broker::ApprovalDecision::Deny })
        });
        let mut manager = Some(mcp::McpManager::with_discovered_stdio_tool_for_test(
            "docs", "search",
        ));

        let result = execute_mcp_tool(
            &mut manager,
            "mcp_docs_search",
            serde_json::json!({"query": "private source"}),
            crate::agent::PrivacyMode::Local,
            true,
            Some(callback),
        )
        .await
        .expect("denial is a structured tool result");

        assert!(!result.success);
        assert!(result.output.contains("was not approved"));
        assert!(!result.output.contains("server not connected"));
    }

    #[test]
    fn team_tool_catalog_matches_team_dispatchers() {
        let catalog_names: BTreeSet<String> = crate::runtime::tool_catalog::team_tool_definitions()
            .into_iter()
            .map(|tool| tool.name)
            .collect();
        let dispatcher_names: BTreeSet<String> = TEAM_TOOL_NAMES
            .iter()
            .map(|name| name.to_string())
            .collect();

        assert_eq!(catalog_names, dispatcher_names);
    }
}
