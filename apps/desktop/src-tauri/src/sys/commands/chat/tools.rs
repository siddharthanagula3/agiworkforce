//! Chat Tool Support
//!
//! This module provides tool definitions and execution for chat messages,
//! enabling the LLM to use tools like Claude Desktop/Code.

use crate::core::agi::tools::{ParameterType, Tool, ToolRegistry};
use crate::core::llm::ToolDefinition;
use crate::sys::commands::mcp::McpState;
use anyhow::{anyhow, Result};
use serde_json::json;
use std::collections::HashSet;
use std::sync::Arc;

/// Excluded tools for chat schema generation.
/// We intentionally hide legacy aliases to reduce duplicate tool choices.
const CHAT_TOOL_SCHEMA_EXCLUSIONS: &[&str] = &["media_generate_image", "media_generate_video"];

fn build_registry_tool_definitions(registry: &ToolRegistry) -> Vec<ToolDefinition> {
    let mut tools: Vec<ToolDefinition> = registry
        .list_tools()
        .into_iter()
        .filter(|tool| !CHAT_TOOL_SCHEMA_EXCLUSIONS.contains(&tool.id.as_str()))
        .map(|tool| convert_tool_to_definition(&tool))
        .collect();

    // Deterministic order keeps prompt/tool schema stable across runs.
    tools.sort_by(|a, b| a.name.cmp(&b.name));
    tools
}

/// Build tool definitions for chat.
/// Returns a list of tools the LLM can call during conversation.
/// If `capabilities` is provided, tools are filtered to only include those
/// the model can actually use (e.g. no browser tools for models without
/// `computerUse`).
///
/// AUDIT-TOOLS-048 fix: When no registry is provided, create one internally
/// to ensure schema/runtime consistency. This prevents drift between the
/// tool definitions sent to the LLM and the actual execution behavior.
pub fn build_chat_tools(
    tool_registry: Option<&Arc<ToolRegistry>>,
    mcp_state: Option<&McpState>,
) -> Vec<ToolDefinition> {
    let mut tools = Vec::new();

    // Add core tools from registry
    if let Some(registry) = tool_registry {
        tools.extend(build_registry_tool_definitions(registry));
    } else {
        // Create a fresh registry to ensure schema/runtime consistency.
        if let Ok(registry) = create_tool_registry_for_schema() {
            tools.extend(build_registry_tool_definitions(&registry));
        } else {
            // Fallback: create basic tool definitions manually if registry creation fails
            tools.extend(create_builtin_tool_definitions());
        }
    }

    // Add MCP tools if available
    if let Some(mcp) = mcp_state {
        let mcp_tools = mcp.registry.get_all_tool_definitions();
        tools.extend(mcp_tools);
    }

    // Ensure unique tool names after merging built-in + MCP tool definitions.
    let mut seen = HashSet::new();
    tools.retain(|tool| seen.insert(tool.name.clone()));

    tools
}

/// Create a ToolRegistry specifically for schema generation.
/// This ensures the tool definitions sent to the LLM match what's executed at runtime.
fn create_tool_registry_for_schema() -> Result<Arc<ToolRegistry>> {
    let registry = Arc::new(ToolRegistry::new()?);
    registry.register_all_tools()?;
    Ok(registry)
}

/// Filter tools based on model capabilities.
/// This prevents sending tools that the model can't use (e.g. browser tools
/// to models without computerUse, search tools to models without search).
pub fn filter_tools_by_capabilities(
    tools: Vec<ToolDefinition>,
    capabilities: &super::types::ModelCapabilitiesDto,
) -> Vec<ToolDefinition> {
    // If the model doesn't support tools at all, return empty
    if !capabilities.tools {
        return Vec::new();
    }

    tools
        .into_iter()
        .filter(|tool| {
            let name = tool.name.as_str();

            // Local browser/UI automation tools run through desktop tool calling.
            // They should stay available whenever function calling is enabled,
            // even if the provider model does not advertise native "computer use".
            if name.starts_with("browser_")
                || name.starts_with("ui_")
                || name.starts_with("computer_use_")
            {
                return true;
            }

            // Search tools require search capability
            if name == "search_web" {
                return capabilities.search;
            }

            // Image/video generation tools: available to any function-calling model.
            // The actual generation is done via the web API (MediaExecutor), not natively
            // by the LLM. Models with native image gen (imageGen: true) have tools: false
            // and never reach this filter, so this gate would always exclude the tool.
            if name == "image_generate" || name == "video_generate" {
                return true;
            }

            // Terminal execution is an app-side tool. It should remain available
            // whenever model-level tool calling is enabled, even if the model
            // doesn't advertise built-in sandboxed code execution.
            if name == "terminal_execute" {
                return true;
            }

            // Document generation requires tools (already checked above)
            // File operations are always allowed if tools is true

            true
        })
        .collect()
}

/// Convert a Tool struct to ToolDefinition for LLM
fn convert_tool_to_definition(tool: &Tool) -> ToolDefinition {
    let mut properties = json!({});
    let mut required = Vec::new();

    for param in &tool.parameters {
        let mut prop = json!({
            "type": get_json_schema_type(&param.parameter_type),
            "description": param.description,
        });

        // BUG 2 FIX: Include default values so the LLM knows which parameters are optional
        // and what value to expect when they are omitted.
        if let Some(default_val) = &param.default {
            prop["default"] = default_val.clone();
        }

        properties[&param.name] = prop;

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
        // File Delete
        ToolDefinition {
            name: "file_delete".to_string(),
            description: "Delete a file. Use this when the user asks to remove or delete a file.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "The absolute or relative path to the file to delete"
                    }
                },
                "required": ["path"]
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
                        "description": "The path to the directory to list (defaults to project folder or current working directory)"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum entries to return (default 500, max 2000)"
                    },
                    "offset": {
                        "type": "integer",
                        "description": "Pagination offset for large directories (default 0)"
                    },
                    "exclude": {
                        "type": "array",
                        "description": "Optional exact-name exclude patterns (e.g. [\"node_modules\", \".git\"])",
                        "items": { "type": "string" }
                    },
                    "timeout_ms": {
                        "type": "integer",
                        "description": "Optional operation timeout in milliseconds (default 10000, max 30000)"
                    }
                },
                "required": []
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
        // UI Click
        ToolDefinition {
            name: "ui_click".to_string(),
            description: "Click on a UI element using coordinates, UIA, image matching, or text targeting.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "target": {
                        "type": "object",
                        "description": "Target element (coordinates, UIA, image, or text)."
                    },
                    "button": {
                        "type": "string",
                        "description": "Mouse button (left, right, middle)",
                        "default": "left"
                    }
                },
                "required": ["target"]
            }),
        },
        // UI Type
        ToolDefinition {
            name: "ui_type".to_string(),
            description: "Type text into a UI element specified by a target selector or coordinates.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "target": {
                        "type": "object",
                        "description": "Target element."
                    },
                    "text": {
                        "type": "string",
                        "description": "Text to type."
                    }
                },
                "required": ["target", "text"]
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
                    },
                    "search_type": {
                        "type": "string",
                        "description": "Search type: web or news (default: web)"
                    }
                },
                "required": ["query"]
            }),
        },
        // Terminal Execute
        // AUDIT-TERMINAL-055 fix: Expose timeout_ms and shell parameters to the model
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
                    },
                    "shell": {
                        "type": "string",
                        "description": "Shell to use: bash, zsh, fish, sh, powershell, cmd, wsl, gitbash (default: system default shell)"
                    },
                    "timeout_ms": {
                        "type": "integer",
                        "description": "Timeout in milliseconds for command execution (default: 60000, max: 300000)"
                    }
                },
                "required": ["command"]
            }),
        },
        // Image Generate
        ToolDefinition {
            name: "image_generate".to_string(),
            description: "Generate an image from a prompt. Use this when the user asks to create or generate an image.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "prompt": {
                        "type": "string",
                        "description": "The image prompt"
                    },
                    "provider": {
                        "type": "string",
                        "description": "Optional provider (e.g. dalle3, imagen, sdxl)"
                    },
                    "size": {
                        "type": "string",
                        "description": "Optional size (e.g. 1024x1024, landscape, portrait)"
                    }
                },
                "required": ["prompt"]
            }),
        },
        // Video Generate
        ToolDefinition {
            name: "video_generate".to_string(),
            description: "Generate a video from a prompt. Use this when the user asks to create or generate a video.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "prompt": {
                        "type": "string",
                        "description": "The video prompt"
                    },
                    "duration_seconds": {
                        "type": "integer",
                        "description": "Optional video duration in seconds"
                    }
                },
                "required": ["prompt"]
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
        // Browser Click
        ToolDefinition {
            name: "browser_click".to_string(),
            description: "Click a browser element using a CSS selector.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "selector": {
                        "type": "string",
                        "description": "CSS selector for the element to click"
                    },
                    "tab_id": {
                        "type": "string",
                        "description": "Tab ID (optional)"
                    }
                },
                "required": ["selector"]
            }),
        },
        // Browser Extract
        ToolDefinition {
            name: "browser_extract".to_string(),
            description: "Extract text, attributes, or element data from the current browser page using CSS selectors.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "selector": {
                        "type": "string",
                        "description": "CSS selector for the element (defaults to 'body')"
                    },
                    "extract_type": {
                        "type": "string",
                        "description": "Type of extraction: text, attribute, or all (default: text)"
                    },
                    "attribute": {
                        "type": "string",
                        "description": "Attribute name (required for attribute extraction)"
                    },
                    "tab_id": {
                        "type": "string",
                        "description": "Tab ID (optional)"
                    }
                },
                "required": []
            }),
        },
        // Browser Type
        ToolDefinition {
            name: "browser_type".to_string(),
            description: "Type text into a browser element using a CSS selector.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "selector": {
                        "type": "string",
                        "description": "CSS selector for the input element"
                    },
                    "text": {
                        "type": "string",
                        "description": "Text to type"
                    },
                    "clear_first": {
                        "type": "boolean",
                        "description": "Clear existing content before typing (default: true)"
                    },
                    "tab_id": {
                        "type": "string",
                        "description": "Tab ID (optional)"
                    }
                },
                "required": ["selector", "text"]
            }),
        },
        // Browser Wait For Selector
        ToolDefinition {
            name: "browser_wait_for_selector".to_string(),
            description: "Wait for a CSS selector to appear in the browser.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "selector": {
                        "type": "string",
                        "description": "CSS selector to wait for"
                    },
                    "timeout_ms": {
                        "type": "integer",
                        "description": "Timeout in milliseconds (default: 30000)"
                    },
                    "tab_id": {
                        "type": "string",
                        "description": "Tab ID (optional)"
                    }
                },
                "required": ["selector"]
            }),
        },
        // Browser Get Text
        ToolDefinition {
            name: "browser_get_text".to_string(),
            description: "Get text content from a browser element.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "selector": {
                        "type": "string",
                        "description": "CSS selector for the element"
                    },
                    "tab_id": {
                        "type": "string",
                        "description": "Tab ID (optional)"
                    }
                },
                "required": ["selector"]
            }),
        },
        // Browser Get Attribute
        ToolDefinition {
            name: "browser_get_attribute".to_string(),
            description: "Get an attribute from a browser element.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "selector": {
                        "type": "string",
                        "description": "CSS selector for the element"
                    },
                    "attribute": {
                        "type": "string",
                        "description": "Attribute name to retrieve"
                    },
                    "tab_id": {
                        "type": "string",
                        "description": "Tab ID (optional)"
                    }
                },
                "required": ["selector", "attribute"]
            }),
        },
        // Browser Screenshot
        ToolDefinition {
            name: "browser_screenshot".to_string(),
            description: "Capture a screenshot of the current page.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "full_page": {
                        "type": "boolean",
                        "description": "Capture full page (default: false)"
                    },
                    "tab_id": {
                        "type": "string",
                        "description": "Tab ID (optional)"
                    }
                },
                "required": []
            }),
        },
        // Browser Hover
        ToolDefinition {
            name: "browser_hover".to_string(),
            description: "Hover over a browser element.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "selector": {
                        "type": "string",
                        "description": "CSS selector for the element"
                    },
                    "tab_id": {
                        "type": "string",
                        "description": "Tab ID (optional)"
                    }
                },
                "required": ["selector"]
            }),
        },
        // Browser Focus
        ToolDefinition {
            name: "browser_focus".to_string(),
            description: "Focus a browser element.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "selector": {
                        "type": "string",
                        "description": "CSS selector for the element"
                    },
                    "tab_id": {
                        "type": "string",
                        "description": "Tab ID (optional)"
                    }
                },
                "required": ["selector"]
            }),
        },
        // Browser Scroll Into View
        ToolDefinition {
            name: "browser_scroll_into_view".to_string(),
            description: "Scroll a browser element into view.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "selector": {
                        "type": "string",
                        "description": "CSS selector for the element"
                    },
                    "tab_id": {
                        "type": "string",
                        "description": "Tab ID (optional)"
                    }
                },
                "required": ["selector"]
            }),
        },
        // Browser Query All
        ToolDefinition {
            name: "browser_query_all".to_string(),
            description: "Query multiple elements and return their metadata.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "selector": {
                        "type": "string",
                        "description": "CSS selector for elements"
                    },
                    "tab_id": {
                        "type": "string",
                        "description": "Tab ID (optional)"
                    }
                },
                "required": ["selector"]
            }),
        },
        // Browser Execute Async JS
        ToolDefinition {
            name: "browser_execute_async_js".to_string(),
            description: "Execute async JavaScript in the browser and return the result.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "script": {
                        "type": "string",
                        "description": "JavaScript to execute"
                    },
                    "args": {
                        "type": "array",
                        "description": "Arguments passed to the script"
                    },
                    "timeout_ms": {
                        "type": "integer",
                        "description": "Timeout in milliseconds (default: 30000)"
                    },
                    "retry_count": {
                        "type": "integer",
                        "description": "Retry attempts (default: 3)"
                    },
                    "retry_delay_ms": {
                        "type": "integer",
                        "description": "Delay between retries in milliseconds (default: 1000)"
                    },
                    "await_promise": {
                        "type": "boolean",
                        "description": "Await promise results (default: true)"
                    },
                    "tab_id": {
                        "type": "string",
                        "description": "Tab ID (optional)"
                    }
                },
                "required": ["script"]
            }),
        },
        // Browser Get Element State
        ToolDefinition {
            name: "browser_get_element_state".to_string(),
            description: "Get visibility and interactivity state for an element.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "selector": {
                        "type": "string",
                        "description": "CSS selector for the element"
                    },
                    "tab_id": {
                        "type": "string",
                        "description": "Tab ID (optional)"
                    }
                },
                "required": ["selector"]
            }),
        },
        // Browser Wait For Interactive
        ToolDefinition {
            name: "browser_wait_for_interactive".to_string(),
            description: "Wait until an element is interactive and ready.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "selector": {
                        "type": "string",
                        "description": "CSS selector for the element"
                    },
                    "timeout_ms": {
                        "type": "integer",
                        "description": "Timeout in milliseconds (default: 30000)"
                    },
                    "tab_id": {
                        "type": "string",
                        "description": "Tab ID (optional)"
                    }
                },
                "required": ["selector"]
            }),
        },
        // Browser Select Option
        ToolDefinition {
            name: "browser_select_option".to_string(),
            description: "Select an option value in a select element.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "selector": {
                        "type": "string",
                        "description": "CSS selector for the select element"
                    },
                    "value": {
                        "type": "string",
                        "description": "Option value to select"
                    },
                    "tab_id": {
                        "type": "string",
                        "description": "Tab ID (optional)"
                    }
                },
                "required": ["selector", "value"]
            }),
        },
        // Browser Check
        ToolDefinition {
            name: "browser_check".to_string(),
            description: "Check a checkbox element.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "selector": {
                        "type": "string",
                        "description": "CSS selector for the checkbox"
                    },
                    "tab_id": {
                        "type": "string",
                        "description": "Tab ID (optional)"
                    }
                },
                "required": ["selector"]
            }),
        },
        // Browser Uncheck
        ToolDefinition {
            name: "browser_uncheck".to_string(),
            description: "Uncheck a checkbox element.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "selector": {
                        "type": "string",
                        "description": "CSS selector for the checkbox"
                    },
                    "tab_id": {
                        "type": "string",
                        "description": "Tab ID (optional)"
                    }
                },
                "required": ["selector"]
            }),
        },
        // Browser Get URL
        ToolDefinition {
            name: "browser_get_url".to_string(),
            description: "Get the current page URL.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "tab_id": {
                        "type": "string",
                        "description": "Tab ID (optional)"
                    }
                },
                "required": []
            }),
        },
        // Browser Get Title
        ToolDefinition {
            name: "browser_get_title".to_string(),
            description: "Get the current page title.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "tab_id": {
                        "type": "string",
                        "description": "Tab ID (optional)"
                    }
                },
                "required": []
            }),
        },
        // Browser Back
        ToolDefinition {
            name: "browser_go_back".to_string(),
            description: "Navigate back in browser history.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "tab_id": {
                        "type": "string",
                        "description": "Tab ID (optional)"
                    }
                },
                "required": []
            }),
        },
        // Browser Forward
        ToolDefinition {
            name: "browser_go_forward".to_string(),
            description: "Navigate forward in browser history.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "tab_id": {
                        "type": "string",
                        "description": "Tab ID (optional)"
                    }
                },
                "required": []
            }),
        },
        // Browser Reload
        ToolDefinition {
            name: "browser_reload".to_string(),
            description: "Reload the current page.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "tab_id": {
                        "type": "string",
                        "description": "Tab ID (optional)"
                    }
                },
                "required": []
            }),
        },
        // Browser Get Content
        ToolDefinition {
            name: "browser_get_content".to_string(),
            description: "Get the full HTML content of the current page.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "tab_id": {
                        "type": "string",
                        "description": "Tab ID (optional)"
                    }
                },
                "required": []
            }),
        },
        // Browser Wait For Navigation
        ToolDefinition {
            name: "browser_wait_for_navigation".to_string(),
            description: "Wait for page navigation to complete.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "timeout_ms": {
                        "type": "integer",
                        "description": "Timeout in milliseconds (default: 30000)"
                    },
                    "tab_id": {
                        "type": "string",
                        "description": "Tab ID (optional)"
                    }
                },
                "required": []
            }),
        },
        // Browser Get DOM Snapshot
        ToolDefinition {
            name: "browser_get_dom_snapshot".to_string(),
            description: "Get the full HTML DOM snapshot of the current page.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "tab_id": {
                        "type": "string",
                        "description": "Tab ID (optional)"
                    }
                },
                "required": []
            }),
        },
        // Document Creation - PDF
        ToolDefinition {
            name: "document_create_pdf".to_string(),
            description: "Create a PDF document with formatted content. Use this when the user asks to create a PDF, generate a document, or export to PDF. Perfect for reports, letters, documents, and formatted text.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "output_path": {
                        "type": "string",
                        "description": "Where to save the PDF file. Can be absolute path, relative to Desktop (e.g., 'Desktop/report.pdf'), or use ~ for home directory. File extension .pdf will be added if missing."
                    },
                    "title": {
                        "type": "string",
                        "description": "Document title (optional, used in metadata and as heading)"
                    },
                    "author": {
                        "type": "string",
                        "description": "Document author (optional, used in metadata)"
                    },
                    "paragraphs": {
                        "type": "array",
                        "items": {
                            "type": "string"
                        },
                        "description": "Array of paragraph text. Each string becomes a separate paragraph in the document."
                    }
                },
                "required": ["output_path", "paragraphs"]
            }),
        },
        // Document Creation - Word
        ToolDefinition {
            name: "document_create_word".to_string(),
            description: "Create a Microsoft Word document (.docx) with formatted content. Use this when the user asks to create a Word document, DOCX file, or needs an editable document format. Ideal for documents that need further editing.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "output_path": {
                        "type": "string",
                        "description": "Where to save the Word file. Can be absolute path, relative to Desktop (e.g., 'Desktop/letter.docx'), or use ~ for home directory. File extension .docx will be added if missing."
                    },
                    "title": {
                        "type": "string",
                        "description": "Document title (optional, used in metadata and as heading)"
                    },
                    "author": {
                        "type": "string",
                        "description": "Document author (optional, used in metadata)"
                    },
                    "paragraphs": {
                        "type": "array",
                        "items": {
                            "type": "string"
                        },
                        "description": "Array of paragraph text. Each string becomes a separate paragraph in the document."
                    }
                },
                "required": ["output_path", "paragraphs"]
            }),
        },
        // Document Creation - Excel
        ToolDefinition {
            name: "document_create_excel".to_string(),
            description: "Create a Microsoft Excel spreadsheet (.xlsx) with tabular data. Use this when the user asks to create a spreadsheet, Excel file, CSV export to Excel, or organize data in rows and columns. Perfect for tables, data analysis, and structured information.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "output_path": {
                        "type": "string",
                        "description": "Where to save the Excel file. Can be absolute path, relative to Desktop (e.g., 'Desktop/data.xlsx'), or use ~ for home directory. File extension .xlsx will be added if missing."
                    },
                    "sheet_name": {
                        "type": "string",
                        "description": "Name of the worksheet tab (optional, defaults to 'Sheet1')"
                    },
                    "headers": {
                        "type": "array",
                        "items": {
                            "type": "string"
                        },
                        "description": "Column headers (first row of the spreadsheet)"
                    },
                    "rows": {
                        "type": "array",
                        "items": {
                            "type": "array",
                            "items": {
                                "type": "string"
                            }
                        },
                        "description": "Data rows. Each inner array represents one row of data, with values corresponding to the headers."
                    }
                },
                "required": ["output_path", "headers", "rows"]
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

    /// Convert to a message content string for the LLM.
    ///
    /// Tool results can contain attacker-controlled content (file contents, terminal output,
    /// web-page data). `escape_xml()` is applied to prevent XML/tag injection into the
    /// structured prompt that wraps tool results.
    pub fn to_message_content(&self) -> String {
        if self.success {
            super::escape_xml(&self.content)
        } else {
            format!(
                "Error: {}",
                super::escape_xml(self.error.as_deref().unwrap_or("Unknown error"))
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
    project_folder: Option<String>,
    conversation_mode: Option<String>,
    tool_call_id: Option<&str>,
) -> Result<String> {
    use crate::core::agi::tools::ToolRegistry;
    use crate::core::llm::tool_executor::ToolExecutor;
    use crate::core::llm::ToolCall;
    use std::sync::Arc;

    let handle =
        app_handle.ok_or_else(|| anyhow::anyhow!("Tool execution requires desktop app context"))?;

    let resolved_tool_name = match tool_name {
        "document_create_docx" => "document_create_word",
        "document_create_xlsx" => "document_create_excel",
        _ => tool_name,
    };

    let registry = Arc::new(ToolRegistry::new()?);
    registry.register_all_tools()?;

    let mut executor = ToolExecutor::with_app_handle(registry, handle.clone());
    executor.set_project_folder(project_folder);
    executor.set_conversation_mode(conversation_mode);

    let tool_call_id = tool_call_id
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string())
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    let tool_call = ToolCall {
        id: tool_call_id,
        name: resolved_tool_name.to_string(),
        arguments: arguments_json.to_string(),
    };

    let result = executor.execute_tool_call(&tool_call).await?;
    if result.success {
        Ok(executor.format_tool_result(&tool_call, &result))
    } else {
        Err(anyhow!(
            "{}",
            result
                .error
                .clone()
                .unwrap_or_else(|| "Tool execution failed".to_string())
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sys::commands::chat::types::ModelCapabilitiesDto;
    use std::collections::HashSet;

    fn test_tool(name: &str) -> ToolDefinition {
        ToolDefinition {
            name: name.to_string(),
            description: String::new(),
            parameters: json!({
                "type": "object",
                "properties": {}
            }),
        }
    }

    #[test]
    fn filter_keeps_terminal_when_tools_enabled_without_code_execution() {
        let tools = vec![
            test_tool("terminal_execute"),
            test_tool("file_read"),
            test_tool("search_web"),
        ];
        let caps = ModelCapabilitiesDto {
            tools: true,
            search: false,
            code_execution: false,
            ..Default::default()
        };

        let filtered = filter_tools_by_capabilities(tools, &caps);
        let names: Vec<&str> = filtered.iter().map(|tool| tool.name.as_str()).collect();

        assert!(names.contains(&"terminal_execute"));
        assert!(names.contains(&"file_read"));
        assert!(!names.contains(&"search_web"));
    }

    #[test]
    fn filter_removes_all_tools_when_tool_calling_is_disabled() {
        let tools = vec![test_tool("terminal_execute"), test_tool("file_read")];
        let caps = ModelCapabilitiesDto {
            tools: false,
            ..Default::default()
        };

        let filtered = filter_tools_by_capabilities(tools, &caps);
        assert!(filtered.is_empty());
    }

    #[test]
    fn filter_keeps_media_generation_for_any_tool_calling_model() {
        // image_generate/video_generate are available to any model with tools: true.
        // The actual image is generated via the external media API, not natively by the LLM.
        let tools = vec![test_tool("image_generate"), test_tool("video_generate")];
        let caps = ModelCapabilitiesDto {
            tools: true,
            image_gen: false,
            ..Default::default()
        };

        let filtered = filter_tools_by_capabilities(tools, &caps);
        let names: HashSet<&str> = filtered.iter().map(|t| t.name.as_str()).collect();
        assert!(names.contains("image_generate"));
        assert!(names.contains("video_generate"));
    }

    #[test]
    fn filter_keeps_browser_and_ui_tools_when_tools_enabled_without_computer_use() {
        let tools = vec![test_tool("browser_navigate"), test_tool("ui_click")];
        let caps = ModelCapabilitiesDto {
            tools: true,
            computer_use: false,
            ..Default::default()
        };

        let filtered = filter_tools_by_capabilities(tools, &caps);
        let names: HashSet<&str> = filtered.iter().map(|tool| tool.name.as_str()).collect();

        assert!(names.contains("browser_navigate"));
        assert!(names.contains("ui_click"));
    }

    #[test]
    fn build_chat_tools_includes_application_domains_from_registry() {
        let tools = build_chat_tools(None, None);
        let names: HashSet<&str> = tools.iter().map(|tool| tool.name.as_str()).collect();

        // Ensure cross-domain app tools are exposed to chat when available.
        assert!(names.contains("email_send"));
        assert!(names.contains("calendar_create_event"));
        assert!(names.contains("cloud_upload"));
        assert!(names.contains("productivity_create_task"));
    }
}
