//! Chat Tool Support
//!
//! This module provides tool definitions and execution for chat messages,
//! enabling the LLM to use tools like Claude Desktop/Code.

use crate::core::agi::tools::{ParameterType, Tool, ToolRegistry};
use crate::core::llm::ToolDefinition;
use crate::sys::commands::chat::prompt_context::escape_xml;
use crate::sys::commands::mcp::McpState;
use crate::sys::security::{ToolExecutionGuard, ToolSafetyTier};
use anyhow::{anyhow, Result};
use serde_json::json;
use std::collections::HashSet;
use std::sync::Arc;

/// Excluded tools for chat schema generation.
/// We intentionally hide legacy aliases to reduce duplicate tool choices.
const CHAT_TOOL_SCHEMA_EXCLUSIONS: &[&str] = &["media_generate_image", "media_generate_video"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct ChatToolExposure {
    pub execution_source: &'static str,
    pub safety_tier: &'static str,
    pub requires_confirmation: bool,
    pub model_capability: Option<&'static str>,
}

fn safety_tier_label(tier: ToolSafetyTier) -> &'static str {
    match tier {
        ToolSafetyTier::Safe => "safe",
        ToolSafetyTier::RequiresNotification => "notify",
        ToolSafetyTier::RequiresConfirmation => "confirm",
        ToolSafetyTier::RequiresExplicitApproval => "explicit_approval",
    }
}

fn required_model_capability(tool_name: &str) -> Option<&'static str> {
    let normalized = tool_name.to_lowercase();

    if normalized.starts_with("browser_")
        || normalized.starts_with("ui_")
        || normalized.starts_with("computer_use_")
    {
        return Some("computer_use");
    }

    // Only the Anthropic-native `web_search` server tool needs the native `search`
    // capability. The generic `search_web` client tool is backed by the keyless
    // SearchExecutor (Perplexity if configured, else DuckDuckGo + Brave HTML fallback),
    // so it works for ANY tool-capable model and is intentionally NOT gated here —
    // gating it turned the web-search toggle into a silent no-op (fake availability) on
    // every non-native-search model. `search_web` falls through to the tools-only gate.
    if normalized == "web_search" {
        return Some("search");
    }

    if normalized == "image_generate" || normalized == "video_generate" {
        return Some("image_gen");
    }

    if normalized == "image_ocr" || normalized == "image_analyze" {
        return Some("vision");
    }

    if normalized == "terminal_execute"
        || normalized == "code_execute"
        || normalized == "test_run"
        || normalized.starts_with("git_")
        || normalized.starts_with("undo_")
        || normalized.starts_with("coding_checkpoint_")
    {
        return Some("code_execution");
    }

    None
}

pub(super) fn describe_chat_tool_exposure(tool_name: &str) -> ChatToolExposure {
    let normalized = tool_name.to_lowercase();

    if normalized.starts_with("__server__") {
        return ChatToolExposure {
            execution_source: "provider_server",
            safety_tier: "provider_controlled",
            requires_confirmation: false,
            model_capability: required_model_capability(tool_name),
        };
    }

    if normalized.starts_with("mcp__") {
        return ChatToolExposure {
            execution_source: "mcp_server",
            safety_tier: "mcp_policy",
            requires_confirmation: true,
            model_capability: None,
        };
    }

    let guard = ToolExecutionGuard::new();
    let safety_tier = guard.get_safety_tier(tool_name);

    ChatToolExposure {
        execution_source: "desktop_local",
        safety_tier: safety_tier_label(safety_tier),
        requires_confirmation: safety_tier.requires_user_action(),
        model_capability: required_model_capability(tool_name),
    }
}

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
/// `pub(crate)` so callers (e.g. `mod.rs`) can pre-build the registry and reuse it.
pub(crate) fn create_tool_registry_for_schema() -> Result<Arc<ToolRegistry>> {
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

            match required_model_capability(name) {
                Some("computer_use") => capabilities.computer_use,
                Some("search") => capabilities.search,
                Some("image_gen") => capabilities.image_gen,
                Some("vision") => capabilities.vision,
                Some("code_execution") => capabilities.code_execution,
                Some(_) => false,
                None => true,
            }
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

        if matches!(param.parameter_type, ParameterType::Array) {
            prop["items"] = json!({});
        }

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
        strict: None,
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
            description: "Read the contents of a file. Use this when the user asks to read, view, show, or look at a file. Returns file_version.sha256; pass that value as expected_sha256 before editing or overwriting an existing file.".to_string(),
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
            strict: None,
        },
        // File Write
        ToolDefinition {
            name: "file_write".to_string(),
            description: "Write content to a file. Creates the file if it does not exist. For an existing file, expected_sha256 is required and must match file_version.sha256 returned by file_read or file_read_range.".to_string(),
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
                    },
                    "expected_sha256": {
                        "type": "string",
                        "description": "Required for existing files: file_version.sha256 from the latest read of the file"
                    }
                },
                "required": ["path", "content"]
            }),
            strict: None,
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
            strict: None,
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
            strict: None,
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
            strict: None,
        },
        // UI Click
        ToolDefinition {
            name: "ui_click".to_string(),
            description: "Click on a desktop UI target by coordinates, native element_id, or visible text.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "target": {
                        "type": "object",
                        "description": "Target object: {\"coordinates\":{\"x\":number,\"y\":number}}, {\"x\":number,\"y\":number}, {\"element_id\":\"...\"}, or {\"text\":\"...\"}."
                    },
                    "button": {
                        "type": "string",
                        "description": "Mouse button (left, right, middle)",
                        "default": "left"
                    }
                },
                "required": ["target"]
            }),
            strict: None,
        },
        // UI Type
        ToolDefinition {
            name: "ui_type".to_string(),
            description: "Type text into a desktop UI target by coordinates, native element_id, or visible text.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "target": {
                        "type": "object",
                        "description": "Target object: {\"coordinates\":{\"x\":number,\"y\":number}}, {\"x\":number,\"y\":number}, {\"element_id\":\"...\"}, or {\"text\":\"...\"}."
                    },
                    "text": {
                        "type": "string",
                        "description": "Text to type."
                    }
                },
                "required": ["target", "text"]
            }),
            strict: None,
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
            strict: None,
        },
        // Terminal Execute
        ToolDefinition {
            name: "terminal_execute".to_string(),
            description: "Execute a shell command in the user's system default shell. Use this when the user asks to run a command, script, or terminal operation.".to_string(),
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
                    "timeout_ms": {
                        "type": "integer",
                        "description": "Timeout in milliseconds for command execution (default: 60000, max: 300000)"
                    },
                    "max_output_bytes": {
                        "type": "integer",
                        "description": "Maximum stdout/stderr bytes captured and returned (default: 30000, max: 150000)"
                    }
                },
                "required": ["command"]
            }),
            strict: None,
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
            strict: None,
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
            strict: None,
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
            strict: None,
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
            strict: None,
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
            strict: None,
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
            strict: None,
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
            strict: None,
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
            strict: None,
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
            strict: None,
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
            strict: None,
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
            strict: None,
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
            strict: None,
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
            strict: None,
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
            strict: None,
        },
        // Browser Execute Async JS
        ToolDefinition {
            name: "browser_execute_async_js".to_string(),
            description: "Execute JavaScript in the browser and return the result. The script runs as an async function body, so use return to send a value back.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "script": {
                        "type": "string",
                        "description": "JavaScript to execute"
                    },
                    "timeout_ms": {
                        "type": "integer",
                        "description": "Timeout in milliseconds (default: 30000, max: 120000)"
                    },
                    "tab_id": {
                        "type": "string",
                        "description": "Tab ID (optional)"
                    }
                },
                "required": ["script"]
            }),
            strict: None,
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
            strict: None,
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
            strict: None,
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
            strict: None,
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
            strict: None,
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
            strict: None,
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
            strict: None,
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
            strict: None,
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
            strict: None,
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
            strict: None,
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
            strict: None,
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
            strict: None,
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
            strict: None,
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
            strict: None,
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
            strict: None,
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
            strict: None,
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
            strict: None,
        },

        // ── grep_search — regex content search ────────────────────────────────
        ToolDefinition {
            name: "grep_search".to_string(),
            description: "Search file contents using a regular expression. Returns file path, \
                line number, and the matching line. Use `include_pattern` to restrict file types \
                (e.g. \"*.ts\", \"*.rs\"). Skips node_modules, target, .git, and binary files \
                automatically. Prefer this over reading many files manually.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "pattern": {
                        "type": "string",
                        "description": "Regular expression pattern to search for"
                    },
                    "root": {
                        "type": "string",
                        "description": "Root directory to search in (defaults to project folder)"
                    },
                    "include_pattern": {
                        "type": "string",
                        "description": "Glob to restrict file types, e.g. \"*.rs\" or \"*.ts\""
                    },
                    "case_insensitive": {
                        "type": "boolean",
                        "description": "Case-insensitive search (default false)",
                        "default": false
                    },
                    "output_mode": {
                        "type": "string",
                        "description": "Output mode: content, files_with_matches, or count (default content)"
                    },
                    "context_lines": {
                        "type": "integer",
                        "description": "Lines of context before and after each content match"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum entries to return (default 250, max 1000)",
                        "default": 250
                    },
                    "offset": {
                        "type": "integer",
                        "description": "Number of matching entries to skip before returning results (default 0)",
                        "default": 0
                    }
                },
                "required": ["pattern"]
            }),
            strict: None,
        },

        // ── glob_search — file pattern search ─────────────────────────────────
        ToolDefinition {
            name: "glob_search".to_string(),
            description: "Find files matching a glob pattern. Examples: \"**/*.ts\", \
                \"src/**/*.rs\", \"*.json\". Results sorted by modification time (newest first). \
                Skips node_modules, target, .git automatically. Use this to discover \
                which files exist before reading them.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "pattern": {
                        "type": "string",
                        "description": "Glob pattern, e.g. \"**/*.ts\" or \"src/**/*.rs\""
                    },
                    "root": {
                        "type": "string",
                        "description": "Root directory (defaults to project folder)"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max results (default 200, max 1000)",
                        "default": 200
                    },
                    "offset": {
                        "type": "integer",
                        "description": "Number of matches to skip before returning results (default 0)",
                        "default": 0
                    }
                },
                "required": ["pattern"]
            }),
            strict: None,
        },

        // ── file_read_range — read with line offset ────────────────────────────
        ToolDefinition {
            name: "file_read_range".to_string(),
            description: "Read a file starting from a specific line number. Each line is \
                prefixed with its 1-based line number, e.g. \"42: content\". Use `offset` to \
                start from a specific line and `limit` to control how many lines to return \
                (default 2000). Essential for navigating large files. When a file has more \
                lines, set has_more=true so you should call again with a higher offset. Returns \
                file_version.sha256; pass the latest hash as expected_sha256 before editing or \
                overwriting the file.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Absolute or relative path to the file"
                    },
                    "offset": {
                        "type": "integer",
                        "description": "1-indexed line to start from (default 1)",
                        "default": 1
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max lines to return (default 2000, max 5000)",
                        "default": 2000
                    }
                },
                "required": ["path"]
            }),
            strict: None,
        },

        // ── format_file — auto-formatter ───────────────────────────────────────
        ToolDefinition {
            name: "format_file".to_string(),
            description: "Run the code formatter appropriate for the file extension after \
                writing or editing a file. Detects prettier, biome, rustfmt, ruff, black, \
                gofmt, clang-format, shfmt, and more. Always call this after editing code.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Absolute path to the file to format"
                    },
                    "project_root": {
                        "type": "string",
                        "description": "Project root for detecting project-local formatters (optional)"
                    }
                },
                "required": ["path"]
            }),
            strict: None,
        },

        // ── test_run — run tests and get structured results ────────────────────
        ToolDefinition {
            name: "test_run".to_string(),
            description: "Run the project's test suite and return structured pass/fail results. \
                Auto-detects runner (cargo test, pytest, jest, vitest, go test, rspec, bun). \
                Returns pass_count, fail_count, and a list of failures with name + message. \
                Use `filter` to run a specific test. Iterate: fix failures → call again → repeat \
                until all pass.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "project_root": {
                        "type": "string",
                        "description": "Project root directory (defaults to active project folder)"
                    },
                    "runner": {
                        "type": "string",
                        "description": "Force runner: cargo, pytest, jest, vitest, go, rspec, bun"
                    },
                    "filter": {
                        "type": "string",
                        "description": "Test name filter (runs a subset of tests)"
                    },
                    "timeout_secs": {
                        "type": "integer",
                        "description": "Timeout in seconds (default 120)",
                        "default": 120
                    }
                },
                "required": []
            }),
            strict: None,
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
            escape_xml(&self.content)
        } else {
            format!(
                "Error: {}",
                escape_xml(self.error.as_deref().unwrap_or("Unknown error"))
            )
        }
    }
}

/// Execute a chat tool by name.
///
/// `prebuilt_registry` is an optional `Arc<ToolRegistry>` from `build_tool_definitions`.
/// When provided it is reused directly, avoiding the cost of constructing and registering
/// all tools again for every tool call within a loop (Fix 4 — registry caching per request).
/// When absent (e.g. called outside the main chat flow) a fresh registry is created.
pub async fn execute_chat_tool(
    tool_name: &str,
    arguments_json: &str,
    app_handle: Option<&tauri::AppHandle>,
    project_folder: Option<String>,
    conversation_mode: Option<String>,
    persist_internal_resources: bool,
    tool_call_id: Option<&str>,
    prebuilt_registry: Option<Arc<ToolRegistry>>,
    conversation_id: Option<i64>,
    frontend_message_id: Option<String>,
) -> Result<String> {
    use crate::core::llm::tool_executor::ToolExecutor;
    use crate::core::llm::ToolCall;

    let handle =
        app_handle.ok_or_else(|| anyhow::anyhow!("Tool execution requires desktop app context"))?;

    let resolved_tool_name = match tool_name {
        "document_create_docx" => "document_create_word",
        "document_create_xlsx" => "document_create_excel",
        _ => tool_name,
    };

    // Reuse the pre-built registry when available; otherwise build one now.
    let registry = match prebuilt_registry {
        Some(r) => r,
        None => {
            let r = Arc::new(ToolRegistry::new()?);
            r.register_all_tools()?;
            r
        }
    };

    let mut executor = ToolExecutor::with_app_handle(registry, handle.clone());
    executor.set_project_folder(project_folder);
    executor.set_conversation_mode(conversation_mode);
    executor.set_conversation_id(conversation_id);
    executor.set_frontend_message_id(frontend_message_id);
    executor.set_persist_internal_resources(persist_internal_resources);

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
            strict: None,
        }
    }

    #[test]
    fn filter_hides_terminal_when_code_execution_disabled() {
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

        assert!(!names.contains(&"terminal_execute"));
        assert!(names.contains(&"file_read"));
        // search_web is the generic keyless client tool — offered to any tool-capable
        // model regardless of the native `search` capability (no fake-availability toggle).
        assert!(names.contains(&"search_web"));
    }

    #[test]
    fn generic_search_web_reaches_models_without_native_search() {
        // The keyless search_web tool must be offered even when capabilities.search is
        // false, otherwise the web-search toggle is a silent no-op (fake availability) on
        // the ~38 non-native-search models. The Anthropic-native web_search stays gated.
        let tools = vec![test_tool("search_web"), test_tool("web_search")];
        let caps = ModelCapabilitiesDto {
            tools: true,
            search: false,
            ..Default::default()
        };

        let filtered = filter_tools_by_capabilities(tools, &caps);
        let names: Vec<&str> = filtered.iter().map(|tool| tool.name.as_str()).collect();

        assert!(
            names.contains(&"search_web"),
            "generic keyless search_web must reach non-native-search models"
        );
        assert!(
            !names.contains(&"web_search"),
            "native web_search stays gated on the search capability"
        );
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
    fn build_chat_tools_terminal_schema_has_no_shell_override() {
        let tools = build_chat_tools(None, None);
        let terminal = tools
            .iter()
            .find(|tool| tool.name == "terminal_execute")
            .expect("terminal_execute should be present");
        let properties = terminal
            .parameters
            .get("properties")
            .and_then(|value| value.as_object())
            .expect("terminal schema should expose properties");

        assert!(properties.contains_key("command"));
        assert!(properties.contains_key("cwd"));
        assert!(properties.contains_key("timeout_ms"));
        assert!(properties.contains_key("max_output_bytes"));
        assert!(!properties.contains_key("shell"));
    }

    #[test]
    fn build_chat_tools_search_schemas_expose_pagination() {
        let tools = build_chat_tools(None, None);
        let grep = tools
            .iter()
            .find(|tool| tool.name == "grep_search")
            .expect("grep_search should be present");
        let grep_properties = grep
            .parameters
            .get("properties")
            .and_then(|value| value.as_object())
            .expect("grep schema should expose properties");
        assert!(grep_properties.contains_key("limit"));
        assert!(grep_properties.contains_key("offset"));

        let glob = tools
            .iter()
            .find(|tool| tool.name == "glob_search")
            .expect("glob_search should be present");
        let glob_properties = glob
            .parameters
            .get("properties")
            .and_then(|value| value.as_object())
            .expect("glob schema should expose properties");
        assert!(glob_properties.contains_key("limit"));
        assert!(glob_properties.contains_key("offset"));
    }

    #[test]
    fn build_chat_tools_browser_ui_schemas_match_desktop_executor() {
        let tools = build_chat_tools(None, None);
        let js_tool = tools
            .iter()
            .find(|tool| tool.name == "browser_execute_async_js")
            .expect("browser_execute_async_js should be present");
        let js_properties = js_tool
            .parameters
            .get("properties")
            .and_then(|value| value.as_object())
            .expect("browser_execute_async_js schema should expose properties");

        assert!(js_properties.contains_key("script"));
        assert!(js_properties.contains_key("timeout_ms"));
        assert!(js_properties.contains_key("tab_id"));
        assert!(!js_properties.contains_key("args"));
        assert!(!js_properties.contains_key("retry_count"));
        assert!(!js_properties.contains_key("retry_delay_ms"));
        assert!(!js_properties.contains_key("await_promise"));

        let ui_click = tools
            .iter()
            .find(|tool| tool.name == "ui_click")
            .expect("ui_click should be present");
        assert!(ui_click.description.contains("coordinates"));
        assert!(ui_click.description.contains("element_id"));
        assert!(ui_click.description.contains("visible text"));
        assert!(!ui_click.description.contains("image matching"));
    }

    #[test]
    fn filter_hides_media_generation_when_image_gen_disabled() {
        let tools = vec![test_tool("image_generate"), test_tool("video_generate")];
        let caps = ModelCapabilitiesDto {
            tools: true,
            image_gen: false,
            ..Default::default()
        };

        let filtered = filter_tools_by_capabilities(tools, &caps);
        let names: HashSet<&str> = filtered.iter().map(|t| t.name.as_str()).collect();
        assert!(!names.contains("image_generate"));
        assert!(!names.contains("video_generate"));
    }

    #[test]
    fn filter_hides_browser_and_ui_tools_without_computer_use() {
        let tools = vec![test_tool("browser_navigate"), test_tool("ui_click")];
        let caps = ModelCapabilitiesDto {
            tools: true,
            computer_use: false,
            ..Default::default()
        };

        let filtered = filter_tools_by_capabilities(tools, &caps);
        let names: HashSet<&str> = filtered.iter().map(|tool| tool.name.as_str()).collect();

        assert!(!names.contains("browser_navigate"));
        assert!(!names.contains("ui_click"));
    }

    #[test]
    fn filter_hides_vision_tools_without_vision_capability() {
        let tools = vec![test_tool("image_ocr"), test_tool("image_analyze")];
        let caps = ModelCapabilitiesDto {
            tools: true,
            vision: false,
            ..Default::default()
        };

        let filtered = filter_tools_by_capabilities(tools, &caps);
        assert!(filtered.is_empty());
    }

    #[test]
    fn filter_hides_git_and_test_tools_without_code_execution() {
        let tools = vec![
            test_tool("git_status"),
            test_tool("git_diff"),
            test_tool("git_log"),
            test_tool("git_list_branches"),
            test_tool("git_commit"),
            test_tool("test_run"),
            test_tool("file_read"),
        ];
        let caps = ModelCapabilitiesDto {
            tools: true,
            code_execution: false,
            ..Default::default()
        };

        let filtered = filter_tools_by_capabilities(tools, &caps);
        let names: HashSet<&str> = filtered.iter().map(|tool| tool.name.as_str()).collect();

        assert!(!names.contains("git_status"));
        assert!(!names.contains("git_diff"));
        assert!(!names.contains("git_log"));
        assert!(!names.contains("git_list_branches"));
        assert!(!names.contains("git_commit"));
        assert!(!names.contains("test_run"));
        assert!(names.contains("file_read"));
    }

    #[test]
    fn tool_exposure_metadata_distinguishes_sources_and_safety() {
        let file_read = describe_chat_tool_exposure("file_read");
        assert_eq!(file_read.execution_source, "desktop_local");
        assert_eq!(file_read.safety_tier, "safe");
        assert!(!file_read.requires_confirmation);

        let file_write = describe_chat_tool_exposure("file_write");
        assert_eq!(file_write.execution_source, "desktop_local");
        assert_eq!(file_write.safety_tier, "confirm");
        assert!(file_write.requires_confirmation);

        let mcp_tool = describe_chat_tool_exposure("mcp__filesystem__read_text_file");
        assert_eq!(mcp_tool.execution_source, "mcp_server");
        assert_eq!(mcp_tool.safety_tier, "mcp_policy");
        assert!(mcp_tool.requires_confirmation);

        let server_tool = describe_chat_tool_exposure("__server__web_search");
        assert_eq!(server_tool.execution_source, "provider_server");
        assert_eq!(server_tool.safety_tier, "provider_controlled");
    }

    #[test]
    fn builtin_file_tools_expose_stale_read_contract() {
        let tools = create_builtin_tool_definitions();
        let file_read = tools
            .iter()
            .find(|tool| tool.name == "file_read")
            .expect("file_read built-in");
        assert!(file_read.description.contains("file_version.sha256"));

        let file_write = tools
            .iter()
            .find(|tool| tool.name == "file_write")
            .expect("file_write built-in");
        assert!(file_write.description.contains("expected_sha256"));
        assert!(file_write.parameters["properties"]
            .as_object()
            .expect("properties object")
            .contains_key("expected_sha256"));
    }

    #[test]
    fn default_chat_tools_have_exposure_metadata() {
        let tools = build_chat_tools(None, None);
        assert!(!tools.is_empty());

        for tool in tools {
            let exposure = describe_chat_tool_exposure(&tool.name);
            assert!(
                matches!(
                    exposure.execution_source,
                    "desktop_local" | "mcp_server" | "provider_server"
                ),
                "tool '{}' has unknown execution source: {:?}",
                tool.name,
                exposure
            );
            assert!(
                !exposure.safety_tier.is_empty(),
                "tool '{}' should have a safety tier label",
                tool.name
            );
        }
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

    #[test]
    fn build_chat_tools_includes_tool_search_with_valid_array_schemas() {
        let tools = build_chat_tools(None, None);
        let names: HashSet<&str> = tools.iter().map(|tool| tool.name.as_str()).collect();
        assert!(names.contains("tool_search"));

        let todo_write = tools
            .iter()
            .find(|tool| tool.name == "todo_write")
            .expect("todo_write should be present");
        assert!(
            todo_write.parameters["properties"]["todos"]["items"].is_object(),
            "array parameters exposed from the registry must include JSON Schema items"
        );

        let multi_edit = tools
            .iter()
            .find(|tool| tool.name == "multi_edit")
            .expect("multi_edit should be present");
        assert!(
            multi_edit.parameters["properties"]["edits"]["items"].is_object(),
            "multi_edit.edits must include JSON Schema items"
        );
    }
}
