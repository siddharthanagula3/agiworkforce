//! Chat Tool Support
//!
//! This module provides tool definitions and execution for chat messages,
//! enabling the LLM to use tools like Claude Desktop/Code.

use crate::core::agi::tools::{ParameterType, Tool, ToolRegistry};
use crate::core::llm::ToolDefinition;
use crate::sys::commands::mcp::McpState;
use anyhow::Result;
use serde_json::json;
use std::sync::Arc;

/// Default tools available in chat mode.
/// These are safe, commonly-used tools that enable Claude Desktop-like functionality.
const DEFAULT_CHAT_TOOLS: &[&str] = &[
    // File operations
    "file_read",
    "file_write",
    "file_delete",
    // Directory operations
    "file_list",
    // Screenshot and UI
    "ui_screenshot",
    // Web search
    "search_web",
    // Terminal
    "terminal_execute",
    // Browser
    "browser_navigate",
    "browser_click",
    "browser_extract",
];

/// Build tool definitions for chat.
/// Returns a list of tools the LLM can call during conversation.
pub fn build_chat_tools(
    tool_registry: Option<&Arc<ToolRegistry>>,
    mcp_state: Option<&McpState>,
) -> Vec<ToolDefinition> {
    let mut tools = Vec::new();

    // Add core tools from registry
    if let Some(registry) = tool_registry {
        for tool_id in DEFAULT_CHAT_TOOLS {
            if let Some(tool) = registry.get_tool(tool_id) {
                tools.push(convert_tool_to_definition(&tool));
            }
        }
    } else {
        // Fallback: create basic tool definitions manually
        tools.extend(create_builtin_tool_definitions());
    }

    // Add MCP tools if available
    if let Some(mcp) = mcp_state {
        let mcp_tools = mcp.registry.get_all_tool_definitions();
        tools.extend(mcp_tools);
    }

    tools
}

/// Convert a Tool struct to ToolDefinition for LLM
fn convert_tool_to_definition(tool: &Tool) -> ToolDefinition {
    let mut properties = json!({});
    let mut required = Vec::new();

    for param in &tool.parameters {
        properties[&param.name] = json!({
            "type": get_json_schema_type(&param.parameter_type),
            "description": param.description,
        });

        if param.required {
            required.push(param.name.clone());
        }
    }

    let parameters = json!({
        "type": "object",
        "properties": properties,
        "required": required,
    });

    ToolDefinition {
        name: tool.id.clone(),
        description: tool.description.clone(),
        parameters,
    }
}

fn get_json_schema_type(param_type: &ParameterType) -> &'static str {
    match param_type {
        ParameterType::String => "string",
        ParameterType::Integer => "integer",
        ParameterType::Float => "number",
        ParameterType::Boolean => "boolean",
        ParameterType::Object => "object",
        ParameterType::Array => "array",
        ParameterType::FilePath => "string",
        ParameterType::URL => "string",
    }
}

/// Create built-in tool definitions without requiring ToolRegistry.
/// This ensures basic tools are always available even if the AGI system isn't initialized.
fn create_builtin_tool_definitions() -> Vec<ToolDefinition> {
    vec![
        // File Read
        ToolDefinition {
            name: "file_read".to_string(),
            description: "Read the contents of a file. Use this when the user asks to read, view, show, or look at a file.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "The absolute or relative path to the file to read"
                    }
                },
                "required": ["path"]
            }),
        },
        // File Write
        ToolDefinition {
            name: "file_write".to_string(),
            description: "Write content to a file. Creates the file if it doesn't exist, overwrites if it does.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "The absolute or relative path to the file to write"
                    },
                    "content": {
                        "type": "string",
                        "description": "The content to write to the file"
                    }
                },
                "required": ["path", "content"]
            }),
        },
        // File List (Directory listing)
        ToolDefinition {
            name: "file_list".to_string(),
            description: "List files and directories in a folder. Use this when the user asks what's in a folder or to list files.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "The path to the directory to list"
                    }
                },
                "required": ["path"]
            }),
        },
        // Screenshot
        ToolDefinition {
            name: "ui_screenshot".to_string(),
            description: "Take a screenshot of the current screen. Use this when the user asks to see their screen or what's displayed.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
        },
        // Web Search
        ToolDefinition {
            name: "search_web".to_string(),
            description: "Search the web for information. Use this when the user asks to search, look up, or find information online.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query"
                    },
                    "num_results": {
                        "type": "integer",
                        "description": "Number of results to return (default: 5, max: 10)"
                    }
                },
                "required": ["query"]
            }),
        },
        // Terminal Execute
        ToolDefinition {
            name: "terminal_execute".to_string(),
            description: "Execute a shell command. Use this when the user asks to run a command, script, or terminal operation.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "The shell command to execute"
                    },
                    "cwd": {
                        "type": "string",
                        "description": "Working directory for the command (optional)"
                    }
                },
                "required": ["command"]
            }),
        },
        // Browser Navigate
        ToolDefinition {
            name: "browser_navigate".to_string(),
            description: "Navigate to a URL in the browser. Use this when the user asks to open a website or go to a URL.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "The URL to navigate to"
                    }
                },
                "required": ["url"]
            }),
        },
    ]
}

/// Represents a tool result to be sent back to the LLM
#[derive(Debug, Clone)]
pub struct ChatToolResult {
    pub tool_call_id: String,
    pub tool_name: String,
    pub success: bool,
    pub content: String,
    pub error: Option<String>,
}

impl ChatToolResult {
    pub fn new(tool_call_id: String, tool_name: String, success: bool, content: String) -> Self {
        Self {
            tool_call_id,
            tool_name,
            success,
            content: if success {
                content.clone()
            } else {
                String::new()
            },
            error: if success { None } else { Some(content) },
        }
    }

    pub fn success(tool_call_id: String, tool_name: String, content: String) -> Self {
        Self {
            tool_call_id,
            tool_name,
            success: true,
            content,
            error: None,
        }
    }

    pub fn error(tool_call_id: String, tool_name: String, error: String) -> Self {
        Self {
            tool_call_id,
            tool_name,
            success: false,
            content: String::new(),
            error: Some(error),
        }
    }

    /// Convert to a message content string for the LLM
    pub fn to_message_content(&self) -> String {
        if self.success {
            self.content.clone()
        } else {
            format!(
                "Error: {}",
                self.error.as_deref().unwrap_or("Unknown error")
            )
        }
    }
}

/// Execute a chat tool by name.
/// This function dispatches tool calls to the appropriate executor.
pub async fn execute_chat_tool(
    tool_name: &str,
    arguments_json: &str,
    app_handle: Option<&tauri::AppHandle>,
) -> Result<String> {
    use std::path::Path;
    use tokio::fs;
    use tokio::process::Command;
    use tracing::{info, warn};

    // Parse arguments
    let args: serde_json::Value = serde_json::from_str(arguments_json)
        .map_err(|e| anyhow::anyhow!("Invalid tool arguments JSON: {}", e))?;

    match tool_name {
        "file_read" => {
            let path = args["path"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("Missing required parameter: path"))?;

            info!("[ChatTool] Reading file: {}", path);

            // Read file content
            let content = fs::read_to_string(path)
                .await
                .map_err(|e| anyhow::anyhow!("Failed to read file '{}': {}", path, e))?;

            // Truncate if too long (to avoid context overflow)
            let max_len = 50000;
            if content.len() > max_len {
                Ok(format!(
                    "{}\n\n[Truncated - file has {} characters, showing first {}]",
                    &content[..max_len],
                    content.len(),
                    max_len
                ))
            } else {
                Ok(content)
            }
        }

        "file_write" => {
            let path = args["path"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("Missing required parameter: path"))?;
            let content = args["content"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("Missing required parameter: content"))?;

            info!("[ChatTool] Writing to file: {}", path);

            // Ensure parent directory exists
            if let Some(parent) = Path::new(path).parent() {
                fs::create_dir_all(parent)
                    .await
                    .map_err(|e| anyhow::anyhow!("Failed to create directory: {}", e))?;
            }

            // Write file
            fs::write(path, content)
                .await
                .map_err(|e| anyhow::anyhow!("Failed to write file '{}': {}", path, e))?;

            Ok(format!(
                "Successfully wrote {} bytes to {}",
                content.len(),
                path
            ))
        }

        "file_list" => {
            let path = args["path"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("Missing required parameter: path"))?;

            info!("[ChatTool] Listing directory: {}", path);

            let mut entries = fs::read_dir(path)
                .await
                .map_err(|e| anyhow::anyhow!("Failed to read directory '{}': {}", path, e))?;

            let mut items = Vec::new();
            while let Some(entry) = entries
                .next_entry()
                .await
                .map_err(|e| anyhow::anyhow!("Error reading entry: {}", e))?
            {
                let file_type = entry.file_type().await.ok();
                let type_str = match file_type {
                    Some(ft) if ft.is_dir() => "[DIR]",
                    Some(ft) if ft.is_symlink() => "[LINK]",
                    _ => "[FILE]",
                };
                items.push(format!(
                    "{} {}",
                    type_str,
                    entry.file_name().to_string_lossy()
                ));
            }

            items.sort();
            Ok(items.join("\n"))
        }

        "terminal_execute" => {
            let command = args["command"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("Missing required parameter: command"))?;
            let cwd = args["cwd"].as_str();

            info!("[ChatTool] Executing command: {}", command);

            // Security: Basic command sanitization
            if command.contains("rm -rf /") || command.contains("sudo rm") {
                return Err(anyhow::anyhow!("Dangerous command blocked for safety"));
            }

            let shell = if cfg!(windows) { "cmd" } else { "sh" };
            let shell_arg = if cfg!(windows) { "/C" } else { "-c" };

            let mut cmd = Command::new(shell);
            cmd.arg(shell_arg).arg(command);

            if let Some(dir) = cwd {
                cmd.current_dir(dir);
            }

            let output = tokio::time::timeout(std::time::Duration::from_secs(30), cmd.output())
                .await
                .map_err(|_| anyhow::anyhow!("Command timed out after 30 seconds"))?
                .map_err(|e| anyhow::anyhow!("Failed to execute command: {}", e))?;

            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);

            let result = if output.status.success() {
                if stdout.is_empty() {
                    "Command completed successfully (no output)".to_string()
                } else {
                    stdout.to_string()
                }
            } else {
                format!(
                    "Command failed with exit code {:?}\nStdout: {}\nStderr: {}",
                    output.status.code(),
                    stdout,
                    stderr
                )
            };

            // Truncate if too long
            let max_len = 10000;
            if result.len() > max_len {
                Ok(format!(
                    "{}\n\n[Output truncated at {} chars]",
                    &result[..max_len],
                    max_len
                ))
            } else {
                Ok(result)
            }
        }

        "search_web" => {
            let query = args["query"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("Missing required parameter: query"))?;
            let _num_results = args["num_results"].as_i64().unwrap_or(5);

            info!("[ChatTool] Web search: {}", query);

            // For now, return a placeholder - actual web search would require API integration
            Ok(format!(
                "Web search for '{}' is not yet implemented. \
                Please ask the user to provide the information directly or suggest they search manually.",
                query
            ))
        }

        "browser_navigate" => {
            let url = args["url"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("Missing required parameter: url"))?;

            info!("[ChatTool] Browser navigation requested: {}", url);

            // Emit browser navigation event if app_handle available
            if let Some(handle) = app_handle {
                use tauri::Emitter;
                let _ = handle.emit("browser:navigate", serde_json::json!({ "url": url }));
                Ok(format!("Navigation to {} initiated", url))
            } else {
                Ok(format!(
                    "Would navigate to: {} (browser not available)",
                    url
                ))
            }
        }

        "ui_screenshot" => {
            info!("[ChatTool] Screenshot requested");

            // Emit screenshot event if app_handle available
            if let Some(handle) = app_handle {
                use tauri::Emitter;
                let _ = handle.emit("ui:screenshot:request", serde_json::json!({}));
                Ok(
                    "Screenshot capture initiated. The result will be displayed in the UI."
                        .to_string(),
                )
            } else {
                Ok("Screenshot tool requires desktop app context".to_string())
            }
        }

        _ => {
            // Check if this is an MCP tool (format: mcp__server__tool)
            if tool_name.starts_with("mcp__") {
                info!("[ChatTool] MCP tool requested: {}", tool_name);

                // MCP tool execution requires the app handle to access McpState
                if let Some(handle) = app_handle {
                    use tauri::Manager;

                    // Get MCP state from app handle
                    let mcp_state = handle.state::<crate::sys::commands::mcp::McpState>();

                    // Parse the tool name to extract server and tool
                    let parts: Vec<&str> = tool_name.split("__").collect();
                    if parts.len() >= 3 {
                        let server_name = parts[1];
                        let mcp_tool_name = parts[2..].join("__");

                        info!(
                            "[ChatTool] Executing MCP tool '{}' on server '{}'",
                            mcp_tool_name, server_name
                        );

                        // Execute the MCP tool
                        match mcp_state
                            .client
                            .call_tool(server_name, &mcp_tool_name, args.clone())
                            .await
                        {
                            Ok(result) => {
                                // Convert MCP result to string
                                let result_str = serde_json::to_string_pretty(&result)
                                    .unwrap_or_else(|_| format!("{:?}", result));

                                // Truncate if too long
                                let max_len = 30000;
                                if result_str.len() > max_len {
                                    Ok(format!(
                                        "{}\n\n[MCP result truncated at {} chars]",
                                        &result_str[..max_len],
                                        max_len
                                    ))
                                } else {
                                    Ok(result_str)
                                }
                            }
                            Err(e) => {
                                Err(anyhow::anyhow!("MCP tool '{}' failed: {}", tool_name, e))
                            }
                        }
                    } else {
                        Err(anyhow::anyhow!(
                            "Invalid MCP tool name format: {}. Expected mcp__server__tool",
                            tool_name
                        ))
                    }
                } else {
                    Err(anyhow::anyhow!(
                        "MCP tool '{}' requires app context which is not available",
                        tool_name
                    ))
                }
            } else {
                warn!("[ChatTool] Unknown tool: {}", tool_name);
                Err(anyhow::anyhow!("Unknown tool: {}", tool_name))
            }
        }
    }
}
