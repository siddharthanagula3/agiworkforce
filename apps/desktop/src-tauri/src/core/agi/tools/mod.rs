pub mod skill_tool;

pub use skill_tool::{create_list_skills_tool, create_skill_use_tool, SkillTool, SkillToolInput};

use super::*;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

pub struct ToolRegistry {
    tools: Mutex<HashMap<String, Tool>>,
    capabilities_index: Mutex<HashMap<ToolCapability, Vec<String>>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tool {
    pub id: String,
    pub name: String,
    pub description: String,
    pub capabilities: Vec<ToolCapability>,
    pub parameters: Vec<ToolParameter>,
    pub estimated_resources: ResourceUsage,
    pub dependencies: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum ToolCapability {
    FileRead,
    FileWrite,
    CodeExecution,
    UIAutomation,
    BrowserAutomation,
    DatabaseAccess,
    APICall,
    ImageProcessing,
    AudioProcessing,
    CodeAnalysis,
    TextProcessing,
    DataAnalysis,
    NetworkOperation,
    SystemOperation,
    SystemCommand,
    NetworkAccess,
    Learning,
    Planning,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolParameter {
    pub name: String,
    pub parameter_type: ParameterType,
    pub required: bool,
    pub description: String,
    pub default: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ParameterType {
    String,
    Integer,
    Float,
    Boolean,
    Object,
    Array,
    FilePath,
    URL,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    pub success: bool,
    pub data: serde_json::Value,
    pub error: Option<String>,
    pub metadata: HashMap<String, serde_json::Value>,
}

impl ToolRegistry {
    pub fn new() -> Result<Self> {
        Ok(Self {
            tools: Mutex::new(HashMap::new()),
            capabilities_index: Mutex::new(HashMap::new()),
        })
    }

    pub fn register_all_tools(&self) -> Result<()> {
        self.register_tool(Tool {
            id: "file_read".to_string(),
            name: "Read File".to_string(),
            description: "Read content from a file".to_string(),
            capabilities: vec![ToolCapability::FileRead, ToolCapability::TextProcessing],
            parameters: vec![ToolParameter {
                name: "path".to_string(),
                parameter_type: ParameterType::FilePath,
                required: true,
                description: "Path to the file to read".to_string(),
                default: None,
            }],
            estimated_resources: crate::core::agi::ResourceUsage {
                cpu_percent: 1.0,
                memory_mb: 10,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "file_write".to_string(),
            name: "Write File".to_string(),
            description: "Write content to a file".to_string(),
            capabilities: vec![ToolCapability::FileWrite, ToolCapability::TextProcessing],
            parameters: vec![
                ToolParameter {
                    name: "path".to_string(),
                    parameter_type: ParameterType::FilePath,
                    required: true,
                    description: "Path to the file to write".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "content".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Content to write".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 2.0,
                memory_mb: 20,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "file_delete".to_string(),
            name: "Delete File".to_string(),
            description: "Delete a file from disk".to_string(),
            capabilities: vec![ToolCapability::FileWrite, ToolCapability::SystemOperation],
            parameters: vec![ToolParameter {
                name: "path".to_string(),
                parameter_type: ParameterType::FilePath,
                required: true,
                description: "Path to the file to delete".to_string(),
                default: None,
            }],
            estimated_resources: ResourceUsage {
                cpu_percent: 1.0,
                memory_mb: 4,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "ui_click".to_string(),
            name: "Click UI Element".to_string(),
            description: "Click on a UI element using various methods".to_string(),
            capabilities: vec![ToolCapability::UIAutomation],
            parameters: vec![
                ToolParameter {
                    name: "target".to_string(),
                    parameter_type: ParameterType::Object,
                    required: true,
                    description: "Target element (coordinates, UIA, image, or text)".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "button".to_string(),
                    parameter_type: ParameterType::String,
                    required: false,
                    description: "Mouse button (left, right, middle)".to_string(),
                    default: Some(serde_json::Value::String("left".to_string())),
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 5.0,
                memory_mb: 50,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "ui_type".to_string(),
            name: "Type Text".to_string(),
            description: "Type text into a UI element".to_string(),
            capabilities: vec![ToolCapability::UIAutomation, ToolCapability::TextProcessing],
            parameters: vec![
                ToolParameter {
                    name: "target".to_string(),
                    parameter_type: ParameterType::Object,
                    required: true,
                    description: "Target element".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "text".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Text to type".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 3.0,
                memory_mb: 30,
                network_mb: 0.0,
            },
            dependencies: vec!["ui_click".to_string()],
        })?;

        self.register_tool(Tool {
            id: "ui_screenshot".to_string(),
            name: "Take Screenshot".to_string(),
            description: "Capture screenshot of screen or region".to_string(),
            capabilities: vec![
                ToolCapability::UIAutomation,
                ToolCapability::ImageProcessing,
            ],
            parameters: vec![ToolParameter {
                name: "region".to_string(),
                parameter_type: ParameterType::Object,
                required: false,
                description: "Region to capture (x, y, width, height)".to_string(),
                default: None,
            }],
            estimated_resources: ResourceUsage {
                cpu_percent: 10.0,
                memory_mb: 100,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "browser_navigate".to_string(),
            name: "Navigate Browser".to_string(),
            description: "Navigate browser to a URL".to_string(),
            capabilities: vec![
                ToolCapability::BrowserAutomation,
                ToolCapability::NetworkOperation,
            ],
            parameters: vec![ToolParameter {
                name: "url".to_string(),
                parameter_type: ParameterType::URL,
                required: true,
                description: "URL to navigate to".to_string(),
                default: None,
            }],
            estimated_resources: ResourceUsage {
                cpu_percent: 15.0,
                memory_mb: 200,
                network_mb: 5.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "search_web".to_string(),
            name: "Web Search".to_string(),
            description: "Search the web for information and return structured results with titles, URLs, snippets, and favicons. Uses DuckDuckGo.".to_string(),
            capabilities: vec![
                ToolCapability::NetworkOperation,
                ToolCapability::DataAnalysis,
            ],
            parameters: vec![
                ToolParameter {
                    name: "query".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Search query".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "num_results".to_string(),
                    parameter_type: ParameterType::Integer,
                    required: false,
                    description: "Maximum number of results to return (default: 10, max: 20)".to_string(),
                    default: Some(serde_json::json!(10)),
                },
                ToolParameter {
                    name: "search_type".to_string(),
                    parameter_type: ParameterType::String,
                    required: false,
                    description: "Type of search: 'web' (default), 'news', or 'images'".to_string(),
                    default: Some(serde_json::json!("web")),
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 5.0,
                memory_mb: 50,
                network_mb: 2.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "browser_click".to_string(),
            name: "Click Browser Element".to_string(),
            description: "Click an element in the browser using a CSS selector".to_string(),
            capabilities: vec![ToolCapability::BrowserAutomation],
            parameters: vec![
                ToolParameter {
                    name: "selector".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "CSS selector for the element to click".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "tab_id".to_string(),
                    parameter_type: ParameterType::String,
                    required: false,
                    description: "Tab ID (uses first tab if not provided)".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 5.0,
                memory_mb: 50,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "browser_extract".to_string(),
            name: "Extract Browser Content".to_string(),
            description: "Extract text, attributes, or element data from the browser page using CSS selectors".to_string(),
            capabilities: vec![ToolCapability::BrowserAutomation, ToolCapability::TextProcessing],
            parameters: vec![
                ToolParameter {
                    name: "selector".to_string(),
                    parameter_type: ParameterType::String,
                    required: false,
                    description: "CSS selector for the element (defaults to 'body')".to_string(),
                    default: Some(serde_json::json!("body")),
                },
                ToolParameter {
                    name: "tab_id".to_string(),
                    parameter_type: ParameterType::String,
                    required: false,
                    description: "Tab ID (uses first tab if not provided)".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "extract_type".to_string(),
                    parameter_type: ParameterType::String,
                    required: false,
                    description: "Type of extraction: 'text', 'attribute', or 'all' (defaults to 'text')".to_string(),
                    default: Some(serde_json::json!("text")),
                },
                ToolParameter {
                    name: "attribute".to_string(),
                    parameter_type: ParameterType::String,
                    required: false,
                    description: "Attribute name (required when extract_type is 'attribute')".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 5.0,
                memory_mb: 50,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "browser_type".to_string(),
            name: "Type in Browser".to_string(),
            description: "Type text into a browser element using a CSS selector".to_string(),
            capabilities: vec![
                ToolCapability::BrowserAutomation,
                ToolCapability::TextProcessing,
            ],
            parameters: vec![
                ToolParameter {
                    name: "selector".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "CSS selector for the input element".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "text".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Text to type into the element".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "clear_first".to_string(),
                    parameter_type: ParameterType::Boolean,
                    required: false,
                    description: "Clear existing content before typing (default: true)".to_string(),
                    default: Some(serde_json::json!(true)),
                },
                ToolParameter {
                    name: "tab_id".to_string(),
                    parameter_type: ParameterType::String,
                    required: false,
                    description: "Tab ID (uses first tab if not provided)".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 5.0,
                memory_mb: 50,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "browser_wait_for_selector".to_string(),
            name: "Wait for Selector".to_string(),
            description: "Wait for a CSS selector to appear in the browser".to_string(),
            capabilities: vec![ToolCapability::BrowserAutomation],
            parameters: vec![
                ToolParameter {
                    name: "selector".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "CSS selector to wait for".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "timeout_ms".to_string(),
                    parameter_type: ParameterType::Integer,
                    required: false,
                    description: "Timeout in milliseconds (default: 30000)".to_string(),
                    default: Some(serde_json::json!(30000)),
                },
                ToolParameter {
                    name: "tab_id".to_string(),
                    parameter_type: ParameterType::String,
                    required: false,
                    description: "Tab ID (uses first tab if not provided)".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 2.0,
                memory_mb: 20,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "browser_get_text".to_string(),
            name: "Get Browser Text".to_string(),
            description: "Get text content from a browser element".to_string(),
            capabilities: vec![
                ToolCapability::BrowserAutomation,
                ToolCapability::TextProcessing,
            ],
            parameters: vec![
                ToolParameter {
                    name: "selector".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "CSS selector for the element".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "tab_id".to_string(),
                    parameter_type: ParameterType::String,
                    required: false,
                    description: "Tab ID (uses first tab if not provided)".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 2.0,
                memory_mb: 20,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "browser_get_attribute".to_string(),
            name: "Get Browser Attribute".to_string(),
            description: "Get an attribute from a browser element".to_string(),
            capabilities: vec![
                ToolCapability::BrowserAutomation,
                ToolCapability::TextProcessing,
            ],
            parameters: vec![
                ToolParameter {
                    name: "selector".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "CSS selector for the element".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "attribute".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Attribute name to retrieve".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "tab_id".to_string(),
                    parameter_type: ParameterType::String,
                    required: false,
                    description: "Tab ID (uses first tab if not provided)".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 2.0,
                memory_mb: 20,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "browser_screenshot".to_string(),
            name: "Browser Screenshot".to_string(),
            description: "Capture a screenshot of the current page".to_string(),
            capabilities: vec![
                ToolCapability::BrowserAutomation,
                ToolCapability::ImageProcessing,
            ],
            parameters: vec![
                ToolParameter {
                    name: "full_page".to_string(),
                    parameter_type: ParameterType::Boolean,
                    required: false,
                    description: "Capture full page (default: false)".to_string(),
                    default: Some(serde_json::json!(false)),
                },
                ToolParameter {
                    name: "tab_id".to_string(),
                    parameter_type: ParameterType::String,
                    required: false,
                    description: "Tab ID (uses first tab if not provided)".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 10.0,
                memory_mb: 100,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "browser_hover".to_string(),
            name: "Hover Browser Element".to_string(),
            description: "Hover over a browser element".to_string(),
            capabilities: vec![ToolCapability::BrowserAutomation],
            parameters: vec![
                ToolParameter {
                    name: "selector".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "CSS selector for the element".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "tab_id".to_string(),
                    parameter_type: ParameterType::String,
                    required: false,
                    description: "Tab ID (uses first tab if not provided)".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 3.0,
                memory_mb: 30,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "browser_focus".to_string(),
            name: "Focus Browser Element".to_string(),
            description: "Focus a browser element".to_string(),
            capabilities: vec![ToolCapability::BrowserAutomation],
            parameters: vec![
                ToolParameter {
                    name: "selector".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "CSS selector for the element".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "tab_id".to_string(),
                    parameter_type: ParameterType::String,
                    required: false,
                    description: "Tab ID (uses first tab if not provided)".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 3.0,
                memory_mb: 30,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "browser_scroll_into_view".to_string(),
            name: "Scroll Element Into View".to_string(),
            description: "Scroll a browser element into view".to_string(),
            capabilities: vec![ToolCapability::BrowserAutomation],
            parameters: vec![
                ToolParameter {
                    name: "selector".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "CSS selector for the element".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "tab_id".to_string(),
                    parameter_type: ParameterType::String,
                    required: false,
                    description: "Tab ID (uses first tab if not provided)".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 3.0,
                memory_mb: 30,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "browser_query_all".to_string(),
            name: "Query All Browser Elements".to_string(),
            description: "Query multiple browser elements and return their metadata".to_string(),
            capabilities: vec![
                ToolCapability::BrowserAutomation,
                ToolCapability::DataAnalysis,
            ],
            parameters: vec![
                ToolParameter {
                    name: "selector".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "CSS selector for elements".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "tab_id".to_string(),
                    parameter_type: ParameterType::String,
                    required: false,
                    description: "Tab ID (uses first tab if not provided)".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 5.0,
                memory_mb: 50,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "browser_execute_async_js".to_string(),
            name: "Execute Async JavaScript".to_string(),
            description: "Execute async JavaScript in the browser and return the result"
                .to_string(),
            capabilities: vec![
                ToolCapability::BrowserAutomation,
                ToolCapability::SystemOperation,
            ],
            parameters: vec![
                ToolParameter {
                    name: "script".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "JavaScript to execute".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "args".to_string(),
                    parameter_type: ParameterType::Array,
                    required: false,
                    description: "Arguments passed to the script".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "timeout_ms".to_string(),
                    parameter_type: ParameterType::Integer,
                    required: false,
                    description: "Execution timeout in milliseconds".to_string(),
                    default: Some(serde_json::json!(30000)),
                },
                ToolParameter {
                    name: "retry_count".to_string(),
                    parameter_type: ParameterType::Integer,
                    required: false,
                    description: "Retry attempts on failure".to_string(),
                    default: Some(serde_json::json!(3)),
                },
                ToolParameter {
                    name: "retry_delay_ms".to_string(),
                    parameter_type: ParameterType::Integer,
                    required: false,
                    description: "Delay between retries in milliseconds".to_string(),
                    default: Some(serde_json::json!(1000)),
                },
                ToolParameter {
                    name: "await_promise".to_string(),
                    parameter_type: ParameterType::Boolean,
                    required: false,
                    description: "Await promise results (default: true)".to_string(),
                    default: Some(serde_json::json!(true)),
                },
                ToolParameter {
                    name: "tab_id".to_string(),
                    parameter_type: ParameterType::String,
                    required: false,
                    description: "Tab ID (uses first tab if not provided)".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 10.0,
                memory_mb: 80,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "browser_get_element_state".to_string(),
            name: "Get Element State".to_string(),
            description: "Get visibility/interactivity state for a browser element".to_string(),
            capabilities: vec![
                ToolCapability::BrowserAutomation,
                ToolCapability::DataAnalysis,
            ],
            parameters: vec![
                ToolParameter {
                    name: "selector".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "CSS selector for the element".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "tab_id".to_string(),
                    parameter_type: ParameterType::String,
                    required: false,
                    description: "Tab ID (uses first tab if not provided)".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 3.0,
                memory_mb: 40,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "browser_wait_for_interactive".to_string(),
            name: "Wait for Interactive Element".to_string(),
            description: "Wait until an element is interactive and ready".to_string(),
            capabilities: vec![ToolCapability::BrowserAutomation],
            parameters: vec![
                ToolParameter {
                    name: "selector".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "CSS selector for the element".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "timeout_ms".to_string(),
                    parameter_type: ParameterType::Integer,
                    required: false,
                    description: "Timeout in milliseconds (default: 30000)".to_string(),
                    default: Some(serde_json::json!(30000)),
                },
                ToolParameter {
                    name: "tab_id".to_string(),
                    parameter_type: ParameterType::String,
                    required: false,
                    description: "Tab ID (uses first tab if not provided)".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 2.0,
                memory_mb: 20,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "browser_select_option".to_string(),
            name: "Select Browser Option".to_string(),
            description: "Select an option value in a browser select element".to_string(),
            capabilities: vec![ToolCapability::BrowserAutomation],
            parameters: vec![
                ToolParameter {
                    name: "selector".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "CSS selector for the select element".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "value".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Option value to select".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "tab_id".to_string(),
                    parameter_type: ParameterType::String,
                    required: false,
                    description: "Tab ID (uses first tab if not provided)".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 3.0,
                memory_mb: 30,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "browser_check".to_string(),
            name: "Check Browser Checkbox".to_string(),
            description: "Check a checkbox in the browser".to_string(),
            capabilities: vec![ToolCapability::BrowserAutomation],
            parameters: vec![
                ToolParameter {
                    name: "selector".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "CSS selector for the checkbox".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "tab_id".to_string(),
                    parameter_type: ParameterType::String,
                    required: false,
                    description: "Tab ID (uses first tab if not provided)".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 3.0,
                memory_mb: 30,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "browser_uncheck".to_string(),
            name: "Uncheck Browser Checkbox".to_string(),
            description: "Uncheck a checkbox in the browser".to_string(),
            capabilities: vec![ToolCapability::BrowserAutomation],
            parameters: vec![
                ToolParameter {
                    name: "selector".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "CSS selector for the checkbox".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "tab_id".to_string(),
                    parameter_type: ParameterType::String,
                    required: false,
                    description: "Tab ID (uses first tab if not provided)".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 3.0,
                memory_mb: 30,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "browser_get_url".to_string(),
            name: "Get Browser URL".to_string(),
            description: "Get the current page URL".to_string(),
            capabilities: vec![ToolCapability::BrowserAutomation],
            parameters: vec![ToolParameter {
                name: "tab_id".to_string(),
                parameter_type: ParameterType::String,
                required: false,
                description: "Tab ID (uses first tab if not provided)".to_string(),
                default: None,
            }],
            estimated_resources: ResourceUsage {
                cpu_percent: 1.0,
                memory_mb: 10,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "browser_get_title".to_string(),
            name: "Get Browser Title".to_string(),
            description: "Get the current page title".to_string(),
            capabilities: vec![ToolCapability::BrowserAutomation],
            parameters: vec![ToolParameter {
                name: "tab_id".to_string(),
                parameter_type: ParameterType::String,
                required: false,
                description: "Tab ID (uses first tab if not provided)".to_string(),
                default: None,
            }],
            estimated_resources: ResourceUsage {
                cpu_percent: 1.0,
                memory_mb: 10,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "browser_go_back".to_string(),
            name: "Browser Back".to_string(),
            description: "Navigate back in browser history".to_string(),
            capabilities: vec![
                ToolCapability::BrowserAutomation,
                ToolCapability::NetworkOperation,
            ],
            parameters: vec![ToolParameter {
                name: "tab_id".to_string(),
                parameter_type: ParameterType::String,
                required: false,
                description: "Tab ID (uses first tab if not provided)".to_string(),
                default: None,
            }],
            estimated_resources: ResourceUsage {
                cpu_percent: 2.0,
                memory_mb: 20,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "browser_go_forward".to_string(),
            name: "Browser Forward".to_string(),
            description: "Navigate forward in browser history".to_string(),
            capabilities: vec![
                ToolCapability::BrowserAutomation,
                ToolCapability::NetworkOperation,
            ],
            parameters: vec![ToolParameter {
                name: "tab_id".to_string(),
                parameter_type: ParameterType::String,
                required: false,
                description: "Tab ID (uses first tab if not provided)".to_string(),
                default: None,
            }],
            estimated_resources: ResourceUsage {
                cpu_percent: 2.0,
                memory_mb: 20,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "browser_reload".to_string(),
            name: "Browser Reload".to_string(),
            description: "Reload the current browser page".to_string(),
            capabilities: vec![
                ToolCapability::BrowserAutomation,
                ToolCapability::NetworkOperation,
            ],
            parameters: vec![ToolParameter {
                name: "tab_id".to_string(),
                parameter_type: ParameterType::String,
                required: false,
                description: "Tab ID (uses first tab if not provided)".to_string(),
                default: None,
            }],
            estimated_resources: ResourceUsage {
                cpu_percent: 2.0,
                memory_mb: 20,
                network_mb: 1.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "browser_wait_for_navigation".to_string(),
            name: "Wait for Navigation".to_string(),
            description: "Wait for page navigation to complete".to_string(),
            capabilities: vec![ToolCapability::BrowserAutomation],
            parameters: vec![
                ToolParameter {
                    name: "timeout_ms".to_string(),
                    parameter_type: ParameterType::Integer,
                    required: false,
                    description: "Timeout in milliseconds (default: 30000)".to_string(),
                    default: Some(serde_json::json!(30000)),
                },
                ToolParameter {
                    name: "tab_id".to_string(),
                    parameter_type: ParameterType::String,
                    required: false,
                    description: "Tab ID (uses first tab if not provided)".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 2.0,
                memory_mb: 20,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "browser_get_dom_snapshot".to_string(),
            name: "Get DOM Snapshot".to_string(),
            description: "Get the full HTML DOM snapshot of the current page".to_string(),
            capabilities: vec![
                ToolCapability::BrowserAutomation,
                ToolCapability::TextProcessing,
            ],
            parameters: vec![ToolParameter {
                name: "tab_id".to_string(),
                parameter_type: ParameterType::String,
                required: false,
                description: "Tab ID (uses first tab if not provided)".to_string(),
                default: None,
            }],
            estimated_resources: ResourceUsage {
                cpu_percent: 5.0,
                memory_mb: 60,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "code_execute".to_string(),
            name: "Execute Code".to_string(),
            description: "Execute code in various languages".to_string(),
            capabilities: vec![
                ToolCapability::CodeExecution,
                ToolCapability::SystemOperation,
            ],
            parameters: vec![
                ToolParameter {
                    name: "language".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Programming language".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "code".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Code to execute".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 20.0,
                memory_mb: 256,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "db_query".to_string(),
            name: "Database Query".to_string(),
            description: "Execute database query".to_string(),
            capabilities: vec![ToolCapability::DatabaseAccess, ToolCapability::DataAnalysis],
            parameters: vec![
                ToolParameter {
                    name: "connection_id".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Database connection ID".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "query".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "SQL query".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 5.0,
                memory_mb: 50,
                network_mb: 1.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "db_execute".to_string(),
            name: "Database Execute".to_string(),
            description: "Execute database DML operations (INSERT, UPDATE, DELETE)".to_string(),
            capabilities: vec![ToolCapability::DatabaseAccess, ToolCapability::DataAnalysis],
            parameters: vec![
                ToolParameter {
                    name: "connection_id".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Database connection ID".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "sql".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "SQL statement (INSERT, UPDATE, DELETE)".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "params".to_string(),
                    parameter_type: ParameterType::Array,
                    required: false,
                    description: "Optional parameterized query values".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 5.0,
                memory_mb: 50,
                network_mb: 1.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "db_transaction_begin".to_string(),
            name: "Begin Database Transaction".to_string(),
            description: "Start a database transaction".to_string(),
            capabilities: vec![ToolCapability::DatabaseAccess],
            parameters: vec![ToolParameter {
                name: "connection_id".to_string(),
                parameter_type: ParameterType::String,
                required: true,
                description: "Database connection ID".to_string(),
                default: None,
            }],
            estimated_resources: ResourceUsage {
                cpu_percent: 2.0,
                memory_mb: 10,
                network_mb: 0.5,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "db_transaction_commit".to_string(),
            name: "Commit Database Transaction".to_string(),
            description: "Commit a database transaction".to_string(),
            capabilities: vec![ToolCapability::DatabaseAccess],
            parameters: vec![ToolParameter {
                name: "connection_id".to_string(),
                parameter_type: ParameterType::String,
                required: true,
                description: "Database connection ID".to_string(),
                default: None,
            }],
            estimated_resources: ResourceUsage {
                cpu_percent: 2.0,
                memory_mb: 10,
                network_mb: 0.5,
            },
            dependencies: vec!["db_transaction_begin".to_string()],
        })?;

        self.register_tool(Tool {
            id: "db_transaction_rollback".to_string(),
            name: "Rollback Database Transaction".to_string(),
            description: "Rollback a database transaction".to_string(),
            capabilities: vec![ToolCapability::DatabaseAccess],
            parameters: vec![ToolParameter {
                name: "connection_id".to_string(),
                parameter_type: ParameterType::String,
                required: true,
                description: "Database connection ID".to_string(),
                default: None,
            }],
            estimated_resources: ResourceUsage {
                cpu_percent: 2.0,
                memory_mb: 10,
                network_mb: 0.5,
            },
            dependencies: vec!["db_transaction_begin".to_string()],
        })?;

        self.register_tool(Tool {
            id: "api_call".to_string(),
            name: "API Call".to_string(),
            description: "Make HTTP API call with full authentication support (bearer, basic, API key, OAuth2)".to_string(),
            capabilities: vec![ToolCapability::APICall, ToolCapability::NetworkOperation],
            parameters: vec![
                ToolParameter {
                    name: "method".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "HTTP method (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS)".to_string(),
                    default: Some(serde_json::Value::String("GET".to_string())),
                },
                ToolParameter {
                    name: "url".to_string(),
                    parameter_type: ParameterType::URL,
                    required: true,
                    description: "API endpoint URL".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "headers".to_string(),
                    parameter_type: ParameterType::Object,
                    required: false,
                    description: "HTTP headers (key-value pairs)".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "query_params".to_string(),
                    parameter_type: ParameterType::Object,
                    required: false,
                    description: "URL query parameters (key-value pairs)".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "body".to_string(),
                    parameter_type: ParameterType::Object,
                    required: false,
                    description: "Request body (JSON object or string)".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "auth".to_string(),
                    parameter_type: ParameterType::Object,
                    required: false,
                    description: "Authentication: {type: 'bearer'|'basic'|'apikey'|'oauth2', token/username/password/key/header}".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "timeout_ms".to_string(),
                    parameter_type: ParameterType::Integer,
                    required: false,
                    description: "Request timeout in milliseconds".to_string(),
                    default: Some(serde_json::Value::Number(serde_json::Number::from(30000))),
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 3.0,
                memory_mb: 30,
                network_mb: 2.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "api_upload".to_string(),
            name: "Upload File via API".to_string(),
            description: "Upload a file using multipart/form-data with authentication support".to_string(),
            capabilities: vec![ToolCapability::APICall, ToolCapability::NetworkOperation, ToolCapability::FileRead],
            parameters: vec![
                ToolParameter {
                    name: "url".to_string(),
                    parameter_type: ParameterType::URL,
                    required: true,
                    description: "Upload endpoint URL".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "file_path".to_string(),
                    parameter_type: ParameterType::FilePath,
                    required: true,
                    description: "Path to file to upload".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "field_name".to_string(),
                    parameter_type: ParameterType::String,
                    required: false,
                    description: "Form field name for the file".to_string(),
                    default: Some(serde_json::Value::String("file".to_string())),
                },
                ToolParameter {
                    name: "fields".to_string(),
                    parameter_type: ParameterType::Object,
                    required: false,
                    description: "Additional form fields (key-value pairs)".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "auth".to_string(),
                    parameter_type: ParameterType::Object,
                    required: false,
                    description: "Authentication: {type: 'bearer'|'basic'|'apikey', token/username/password/key/header}".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 5.0,
                memory_mb: 100,
                network_mb: 50.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "api_download".to_string(),
            name: "Download File via API".to_string(),
            description: "Download a file from a URL with authentication support".to_string(),
            capabilities: vec![ToolCapability::APICall, ToolCapability::NetworkOperation, ToolCapability::FileWrite],
            parameters: vec![
                ToolParameter {
                    name: "url".to_string(),
                    parameter_type: ParameterType::URL,
                    required: true,
                    description: "File download URL".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "save_path".to_string(),
                    parameter_type: ParameterType::FilePath,
                    required: true,
                    description: "Local path to save the downloaded file".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "auth".to_string(),
                    parameter_type: ParameterType::Object,
                    required: false,
                    description: "Authentication: {type: 'bearer'|'basic'|'apikey', token/username/password/key/header}".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 5.0,
                memory_mb: 100,
                network_mb: 50.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "image_ocr".to_string(),
            name: "OCR Image".to_string(),
            description: "Extract text from image using OCR".to_string(),
            capabilities: vec![
                ToolCapability::ImageProcessing,
                ToolCapability::TextProcessing,
            ],
            parameters: vec![ToolParameter {
                name: "image_path".to_string(),
                parameter_type: ParameterType::FilePath,
                required: true,
                description: "Path to image file".to_string(),
                default: None,
            }],
            estimated_resources: ResourceUsage {
                cpu_percent: 30.0,
                memory_mb: 200,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "image_analyze".to_string(),
            name: "Analyze Image with AI".to_string(),
            description: "Analyze an image using vision-capable AI models to answer questions or describe content".to_string(),
            capabilities: vec![
                ToolCapability::ImageProcessing,
                ToolCapability::Planning,
            ],
            parameters: vec![
                ToolParameter {
                    name: "image_path".to_string(),
                    parameter_type: ParameterType::FilePath,
                    required: true,
                    description: "Path to image file (PNG, JPEG, WEBP)".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "question".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Question to ask about the image or description request".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "detail".to_string(),
                    parameter_type: ParameterType::String,
                    required: false,
                    description: "Detail level: 'low', 'high', or 'auto' (default: 'auto')".to_string(),
                    default: Some(serde_json::json!("auto")),
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 20.0,
                memory_mb: 150,
                network_mb: 5.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "code_analyze".to_string(),
            name: "Analyze Code".to_string(),
            description: "Analyze code structure and semantics".to_string(),
            capabilities: vec![ToolCapability::CodeAnalysis, ToolCapability::TextProcessing],
            parameters: vec![
                ToolParameter {
                    name: "code".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Code to analyze".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "language".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Programming language".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 15.0,
                memory_mb: 150,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "llm_reason".to_string(),
            name: "LLM Reasoning".to_string(),
            description: "Use LLM for reasoning and problem solving".to_string(),
            capabilities: vec![ToolCapability::Planning, ToolCapability::Learning],
            parameters: vec![
                ToolParameter {
                    name: "prompt".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Reasoning prompt".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "context".to_string(),
                    parameter_type: ParameterType::Object,
                    required: false,
                    description: "Additional context".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 25.0,
                memory_mb: 300,
                network_mb: 10.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "image_generate".to_string(),
            name: "Generate Image".to_string(),
            description: "Generate an image using AI (DALL-E 3, Imagen 3, SDXL)".to_string(),
            capabilities: vec![ToolCapability::ImageProcessing, ToolCapability::APICall],
            parameters: vec![
                ToolParameter {
                    name: "prompt".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Detailed description of the image to generate".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "provider".to_string(),
                    parameter_type: ParameterType::String,
                    required: false,
                    description: "Provider to use: 'dalle3', 'imagen', 'sdxl' (default: auto)"
                        .to_string(),
                    default: Some(serde_json::Value::String("auto".to_string())),
                },
                ToolParameter {
                    name: "size".to_string(),
                    parameter_type: ParameterType::String,
                    required: false,
                    description:
                        "Size: '1024x1024', 'landscape', 'portrait' (default: '1024x1024')"
                            .to_string(),
                    default: Some(serde_json::Value::String("1024x1024".to_string())),
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 5.0,
                memory_mb: 50,
                network_mb: 5.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "video_generate".to_string(),
            name: "Generate Video".to_string(),
            description: "Generate a video using AI (Google Veo)".to_string(),
            capabilities: vec![ToolCapability::ImageProcessing, ToolCapability::APICall],
            parameters: vec![
                ToolParameter {
                    name: "prompt".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Detailed description of the video to generate".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "duration_seconds".to_string(),
                    parameter_type: ParameterType::Integer,
                    required: false,
                    description: "Duration in seconds (default: 5)".to_string(),
                    default: Some(serde_json::json!(5)),
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 5.0,
                memory_mb: 100,
                network_mb: 20.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "email_send".to_string(),
            name: "Send Email".to_string(),
            description: "Send an email via SMTP".to_string(),
            capabilities: vec![
                ToolCapability::NetworkOperation,
                ToolCapability::TextProcessing,
            ],
            parameters: vec![
                ToolParameter {
                    name: "to".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Recipient email address".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "subject".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Email subject".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "body".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Email body".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 2.0,
                memory_mb: 20,
                network_mb: 0.1,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "email_fetch".to_string(),
            name: "Fetch Emails".to_string(),
            description: "Fetch emails from inbox".to_string(),
            capabilities: vec![
                ToolCapability::NetworkOperation,
                ToolCapability::TextProcessing,
            ],
            parameters: vec![
                ToolParameter {
                    name: "account_id".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Email account ID".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "limit".to_string(),
                    parameter_type: ParameterType::Integer,
                    required: false,
                    description: "Maximum number of emails to fetch".to_string(),
                    default: Some(serde_json::Value::Number(serde_json::Number::from(10))),
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 3.0,
                memory_mb: 50,
                network_mb: 1.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "calendar_create_event".to_string(),
            name: "Create Calendar Event".to_string(),
            description: "Create a calendar event".to_string(),
            capabilities: vec![
                ToolCapability::NetworkOperation,
                ToolCapability::SystemOperation,
            ],
            parameters: vec![
                ToolParameter {
                    name: "account_id".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Calendar account ID".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "title".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Event title".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "start_time".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Event start time (ISO 8601)".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 2.0,
                memory_mb: 30,
                network_mb: 0.5,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "calendar_list_events".to_string(),
            name: "List Calendar Events".to_string(),
            description: "List calendar events".to_string(),
            capabilities: vec![
                ToolCapability::NetworkOperation,
                ToolCapability::DataAnalysis,
            ],
            parameters: vec![ToolParameter {
                name: "account_id".to_string(),
                parameter_type: ParameterType::String,
                required: true,
                description: "Calendar account ID".to_string(),
                default: None,
            }],
            estimated_resources: ResourceUsage {
                cpu_percent: 2.0,
                memory_mb: 30,
                network_mb: 0.5,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "cloud_upload".to_string(),
            name: "Upload to Cloud".to_string(),
            description: "Upload file to cloud storage".to_string(),
            capabilities: vec![ToolCapability::FileWrite, ToolCapability::NetworkOperation],
            parameters: vec![
                ToolParameter {
                    name: "account_id".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Cloud account ID".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "local_path".to_string(),
                    parameter_type: ParameterType::FilePath,
                    required: true,
                    description: "Local file path".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "remote_path".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Remote file path".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 10.0,
                memory_mb: 100,
                network_mb: 10.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "cloud_download".to_string(),
            name: "Download from Cloud".to_string(),
            description: "Download file from cloud storage".to_string(),
            capabilities: vec![ToolCapability::FileRead, ToolCapability::NetworkOperation],
            parameters: vec![
                ToolParameter {
                    name: "account_id".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Cloud account ID".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "remote_path".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Remote file path".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "local_path".to_string(),
                    parameter_type: ParameterType::FilePath,
                    required: true,
                    description: "Local file path".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 10.0,
                memory_mb: 100,
                network_mb: 10.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "productivity_create_task".to_string(),
            name: "Create Task".to_string(),
            description: "Create a task in productivity tool".to_string(),
            capabilities: vec![
                ToolCapability::SystemOperation,
                ToolCapability::TextProcessing,
            ],
            parameters: vec![
                ToolParameter {
                    name: "provider".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Productivity provider (notion, trello, asana)".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "title".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Task title".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 3.0,
                memory_mb: 30,
                network_mb: 0.5,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "document_read".to_string(),
            name: "Read Document".to_string(),
            description: "Read and extract content from document (Word, Excel, PDF)".to_string(),
            capabilities: vec![ToolCapability::FileRead, ToolCapability::TextProcessing],
            parameters: vec![ToolParameter {
                name: "file_path".to_string(),
                parameter_type: ParameterType::FilePath,
                required: true,
                description: "Path to document file".to_string(),
                default: None,
            }],
            estimated_resources: ResourceUsage {
                cpu_percent: 15.0,
                memory_mb: 150,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "document_search".to_string(),
            name: "Search Document".to_string(),
            description: "Search for text within a document".to_string(),
            capabilities: vec![ToolCapability::FileRead, ToolCapability::TextProcessing],
            parameters: vec![
                ToolParameter {
                    name: "file_path".to_string(),
                    parameter_type: ParameterType::FilePath,
                    required: true,
                    description: "Path to document file".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "query".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Search query".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 10.0,
                memory_mb: 100,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "document_create_word".to_string(),
            name: "Create Word Document".to_string(),
            description: "Create a Word document (DOCX) with rich content (headings, paragraphs, tables, lists)".to_string(),
            capabilities: vec![ToolCapability::FileWrite, ToolCapability::TextProcessing],
            parameters: vec![
                ToolParameter {
                    name: "output_path".to_string(),
                    parameter_type: ParameterType::FilePath,
                    required: true,
                    description: "Path where the DOCX file will be saved".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "title".to_string(),
                    parameter_type: ParameterType::String,
                    required: false,
                    description: "Document title".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "author".to_string(),
                    parameter_type: ParameterType::String,
                    required: false,
                    description: "Document author".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "paragraphs".to_string(),
                    parameter_type: ParameterType::Array,
                    required: true,
                    description: "Array of paragraph texts to include in the document".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 5.0,
                memory_mb: 50,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "document_create_excel".to_string(),
            name: "Create Excel Spreadsheet".to_string(),
            description: "Create an Excel spreadsheet (XLSX) with headers and data rows"
                .to_string(),
            capabilities: vec![ToolCapability::FileWrite, ToolCapability::DataAnalysis],
            parameters: vec![
                ToolParameter {
                    name: "output_path".to_string(),
                    parameter_type: ParameterType::FilePath,
                    required: true,
                    description: "Path where the XLSX file will be saved".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "sheet_name".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Name of the worksheet".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "headers".to_string(),
                    parameter_type: ParameterType::Array,
                    required: true,
                    description: "Array of column headers".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "rows".to_string(),
                    parameter_type: ParameterType::Array,
                    required: true,
                    description: "Array of data rows (each row is an array of cell values)"
                        .to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 5.0,
                memory_mb: 50,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "document_create_pdf".to_string(),
            name: "Create PDF Document".to_string(),
            description: "Create a PDF document with text content (headings, paragraphs, lists)"
                .to_string(),
            capabilities: vec![ToolCapability::FileWrite, ToolCapability::TextProcessing],
            parameters: vec![
                ToolParameter {
                    name: "output_path".to_string(),
                    parameter_type: ParameterType::FilePath,
                    required: true,
                    description: "Path where the PDF file will be saved".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "title".to_string(),
                    parameter_type: ParameterType::String,
                    required: false,
                    description: "Document title".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "author".to_string(),
                    parameter_type: ParameterType::String,
                    required: false,
                    description: "Document author".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "paragraphs".to_string(),
                    parameter_type: ParameterType::Array,
                    required: true,
                    description: "Array of paragraph texts to include in the PDF".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 10.0,
                memory_mb: 80,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        // Memory tools for persistent cross-session memory
        self.register_tool(Tool {
            id: "memory_remember".to_string(),
            name: "Remember Information".to_string(),
            description: "Store information in long-term memory for future sessions. Use this to remember user preferences, facts, or important decisions.".to_string(),
            capabilities: vec![ToolCapability::SystemOperation],
            parameters: vec![
                ToolParameter {
                    name: "category".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Category: preference, fact, decision, or context".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "topic".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Topic or key for this memory (e.g., 'favorite_color', 'work_hours')".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "content".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "The information to remember".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "importance".to_string(),
                    parameter_type: ParameterType::Integer,
                    required: false,
                    description: "Importance level 1-10 (higher = more important, loaded at session start)".to_string(),
                    default: Some(serde_json::json!(5)),
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 2.0,
                memory_mb: 10,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "memory_recall".to_string(),
            name: "Recall Memory".to_string(),
            description: "Retrieve a specific memory by category and topic".to_string(),
            capabilities: vec![ToolCapability::SystemOperation],
            parameters: vec![
                ToolParameter {
                    name: "category".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Category: preference, fact, decision, or context".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "topic".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Topic or key for the memory to recall".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 2.0,
                memory_mb: 10,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "memory_search".to_string(),
            name: "Search Memories".to_string(),
            description: "Search through all memories by keyword".to_string(),
            capabilities: vec![ToolCapability::SystemOperation],
            parameters: vec![
                ToolParameter {
                    name: "query".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Search query to find in memories".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "limit".to_string(),
                    parameter_type: ParameterType::Integer,
                    required: false,
                    description: "Maximum number of results to return".to_string(),
                    default: Some(serde_json::json!(10)),
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 3.0,
                memory_mb: 15,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "memory_forget".to_string(),
            name: "Forget Memory".to_string(),
            description: "Remove a memory by category and topic".to_string(),
            capabilities: vec![ToolCapability::SystemOperation],
            parameters: vec![
                ToolParameter {
                    name: "category".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Category: preference, fact, decision, or context".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "topic".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Topic or key of the memory to forget".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 2.0,
                memory_mb: 10,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        // Scheduler tools for reminders and recurring tasks
        self.register_tool(Tool {
            id: "schedule_reminder".to_string(),
            name: "Schedule Reminder".to_string(),
            description: "Set a reminder for a specific time. Examples: 'remind me in 2 hours to call mom', 'remind me tomorrow at 9am about the meeting'".to_string(),
            capabilities: vec![ToolCapability::SystemOperation],
            parameters: vec![
                ToolParameter {
                    name: "message".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "The reminder message to display when triggered".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "time".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "When to trigger the reminder (natural language like 'in 2 hours', 'tomorrow at 9am', or ISO timestamp)".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 2.0,
                memory_mb: 10,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "schedule_recurring_task".to_string(),
            name: "Schedule Recurring Task".to_string(),
            description: "Schedule a task to run on a recurring schedule. Examples: 'every morning at 8am summarize my calendar', 'every Friday at 5pm create weekly report'".to_string(),
            capabilities: vec![ToolCapability::SystemOperation],
            parameters: vec![
                ToolParameter {
                    name: "name".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Name of the recurring task".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "schedule".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "When to run the task (cron expression or natural language like 'every day at 8am', 'every Friday at 5pm')".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "task_description".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Description of what the task should do when triggered".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 2.0,
                memory_mb: 10,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "cancel_scheduled_task".to_string(),
            name: "Cancel Scheduled Task".to_string(),
            description: "Cancel a scheduled reminder or recurring task".to_string(),
            capabilities: vec![ToolCapability::SystemOperation],
            parameters: vec![ToolParameter {
                name: "task_id".to_string(),
                parameter_type: ParameterType::String,
                required: true,
                description: "The ID of the scheduled task to cancel".to_string(),
                default: None,
            }],
            estimated_resources: ResourceUsage {
                cpu_percent: 2.0,
                memory_mb: 10,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "list_scheduled_tasks".to_string(),
            name: "List Scheduled Tasks".to_string(),
            description: "Show all scheduled reminders and recurring tasks".to_string(),
            capabilities: vec![ToolCapability::SystemOperation],
            parameters: vec![],
            estimated_resources: ResourceUsage {
                cpu_percent: 2.0,
                memory_mb: 10,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "terminal_execute".to_string(),
            name: "Execute Terminal Command".to_string(),
            description: "Execute a command in the system terminal (bash/powershell/cmd)"
                .to_string(),
            capabilities: vec![
                ToolCapability::CodeExecution,
                ToolCapability::SystemOperation,
            ],
            parameters: vec![
                ToolParameter {
                    name: "command".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Command to execute".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "cwd".to_string(),
                    parameter_type: ParameterType::FilePath,
                    required: false,
                    description: "Working directory for the command".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "shell".to_string(),
                    parameter_type: ParameterType::String,
                    required: false,
                    description: "Shell to execute command in (powershell|cmd|bash)".to_string(),
                    default: Some(serde_json::json!("powershell")),
                },
                ToolParameter {
                    name: "timeout_ms".to_string(),
                    parameter_type: ParameterType::Integer,
                    required: false,
                    description: "Timeout before the command is aborted (defaults to 60s)"
                        .to_string(),
                    default: Some(serde_json::json!(60000)),
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 10.0,
                memory_mb: 50,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "git_init".to_string(),
            name: "Initialize Git Repository".to_string(),
            description: "Initialize a new Git repository in the specified directory".to_string(),
            capabilities: vec![ToolCapability::SystemOperation],
            parameters: vec![ToolParameter {
                name: "path".to_string(),
                parameter_type: ParameterType::FilePath,
                required: true,
                description: "Path to initialize repository".to_string(),
                default: None,
            }],
            estimated_resources: ResourceUsage {
                cpu_percent: 5.0,
                memory_mb: 20,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "git_add".to_string(),
            name: "Git Add Files".to_string(),
            description: "Add files to Git staging area".to_string(),
            capabilities: vec![ToolCapability::SystemOperation],
            parameters: vec![
                ToolParameter {
                    name: "path".to_string(),
                    parameter_type: ParameterType::FilePath,
                    required: true,
                    description: "Repository path".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "files".to_string(),
                    parameter_type: ParameterType::Array,
                    required: true,
                    description: "Files to add (use ['.'] for all files)".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 5.0,
                memory_mb: 30,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "git_commit".to_string(),
            name: "Git Commit".to_string(),
            description: "Create a Git commit with the staged changes".to_string(),
            capabilities: vec![ToolCapability::SystemOperation],
            parameters: vec![
                ToolParameter {
                    name: "path".to_string(),
                    parameter_type: ParameterType::FilePath,
                    required: true,
                    description: "Repository path".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "message".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Commit message".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 5.0,
                memory_mb: 30,
                network_mb: 0.0,
            },
            dependencies: vec!["git_add".to_string()],
        })?;

        self.register_tool(Tool {
            id: "git_push".to_string(),
            name: "Git Push".to_string(),
            description: "Push commits to remote repository".to_string(),
            capabilities: vec![
                ToolCapability::SystemOperation,
                ToolCapability::NetworkOperation,
            ],
            parameters: vec![
                ToolParameter {
                    name: "path".to_string(),
                    parameter_type: ParameterType::FilePath,
                    required: true,
                    description: "Repository path".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "remote".to_string(),
                    parameter_type: ParameterType::String,
                    required: false,
                    description: "Remote name (defaults to 'origin')".to_string(),
                    default: Some(serde_json::json!("origin")),
                },
                ToolParameter {
                    name: "branch".to_string(),
                    parameter_type: ParameterType::String,
                    required: false,
                    description: "Branch name (defaults to current branch)".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 10.0,
                memory_mb: 50,
                network_mb: 10.0,
            },
            dependencies: vec!["git_commit".to_string()],
        })?;

        self.register_tool(Tool {
            id: "git_status".to_string(),
            name: "Git Status".to_string(),
            description: "Get the status of a Git repository including branch, staged, modified, and untracked files".to_string(),
            capabilities: vec![ToolCapability::SystemOperation],
            parameters: vec![ToolParameter {
                name: "path".to_string(),
                parameter_type: ParameterType::FilePath,
                required: true,
                description: "Repository path".to_string(),
                default: None,
            }],
            estimated_resources: ResourceUsage {
                cpu_percent: 2.0,
                memory_mb: 20,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "git_clone".to_string(),
            name: "Git Clone".to_string(),
            description: "Clone a Git repository from a remote URL".to_string(),
            capabilities: vec![
                ToolCapability::SystemOperation,
                ToolCapability::NetworkOperation,
            ],
            parameters: vec![
                ToolParameter {
                    name: "url".to_string(),
                    parameter_type: ParameterType::URL,
                    required: true,
                    description: "Remote repository URL".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "destination".to_string(),
                    parameter_type: ParameterType::FilePath,
                    required: true,
                    description: "Local destination path".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 10.0,
                memory_mb: 100,
                network_mb: 50.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "github_create_repo".to_string(),
            name: "Create GitHub Repository".to_string(),
            description: "Create a new repository on GitHub".to_string(),
            capabilities: vec![ToolCapability::APICall, ToolCapability::NetworkOperation],
            parameters: vec![
                ToolParameter {
                    name: "name".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Repository name".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "description".to_string(),
                    parameter_type: ParameterType::String,
                    required: false,
                    description: "Repository description".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "private".to_string(),
                    parameter_type: ParameterType::Boolean,
                    required: false,
                    description: "Make repository private".to_string(),
                    default: Some(serde_json::json!(false)),
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 5.0,
                memory_mb: 30,
                network_mb: 1.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "physical_scrape".to_string(),
            name: "Physical Web Scrape".to_string(),
            description: "Physically scrape a webpage by navigating, selecting all content, and copying to clipboard. Works on sites that block normal scraping.".to_string(),
            capabilities: vec![
                ToolCapability::BrowserAutomation,
                ToolCapability::UIAutomation,
                ToolCapability::TextProcessing,
            ],
            parameters: vec![
                ToolParameter {
                    name: "url".to_string(),
                    parameter_type: ParameterType::URL,
                    required: true,
                    description: "URL to scrape".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "wait_ms".to_string(),
                    parameter_type: ParameterType::Integer,
                    required: false,
                    description: "Milliseconds to wait for page load (defaults to 3000)".to_string(),
                    default: Some(serde_json::json!(3000)),
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 20.0,
                memory_mb: 250,
                network_mb: 5.0,
            },
            dependencies: vec!["browser_navigate".to_string(), "ui_click".to_string()],
        })?;

        self.register_tool(Tool {
            id: "media_generate_image".to_string(),
            name: "Generate Image".to_string(),
            description: "Generate images using AI (DALL-E 3, Imagen 3, SDXL)".to_string(),
            capabilities: vec![ToolCapability::ImageProcessing, ToolCapability::Planning],
            parameters: vec![
                ToolParameter {
                    name: "prompt".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Image generation prompt".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "size".to_string(),
                    parameter_type: ParameterType::String,
                    required: false,
                    description: "Size: 'square', 'wide', 'portrait'".to_string(),
                    default: Some(serde_json::json!("wide")),
                },
                ToolParameter {
                    name: "style".to_string(),
                    parameter_type: ParameterType::String,
                    required: false,
                    description: "Style: 'photorealistic', 'artistic', 'anime'".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 5.0,
                memory_mb: 50,
                network_mb: 5.0,
            },
            dependencies: vec![],
        })?;

        self.register_tool(Tool {
            id: "media_generate_video".to_string(),
            name: "Generate Video".to_string(),
            description: "Generate video using AI (Veo 3.1) - Requires Pro/Max plan".to_string(),
            capabilities: vec![ToolCapability::ImageProcessing, ToolCapability::Planning],
            parameters: vec![
                ToolParameter {
                    name: "prompt".to_string(),
                    parameter_type: ParameterType::String,
                    required: true,
                    description: "Video generation prompt".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "duration_secs".to_string(),
                    parameter_type: ParameterType::Integer,
                    required: false,
                    description: "Duration in seconds (default 4-8)".to_string(),
                    default: Some(serde_json::json!(4)),
                },
                ToolParameter {
                    name: "resolution".to_string(),
                    parameter_type: ParameterType::String,
                    required: false,
                    description: "Resolution: '1080p', '4k'".to_string(),
                    default: Some(serde_json::json!("1080p")),
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 5.0,
                memory_mb: 50,
                network_mb: 20.0,
            },
            dependencies: vec![],
        })?;

        Ok(())
    }

    pub async fn load_mcp_tools(
        &self,
        mcp_registry: Arc<crate::core::mcp::McpToolRegistry>,
    ) -> Result<usize> {
        let mcp_tools = mcp_registry.get_all_tool_schemas();
        let count = mcp_tools.len();

        for tool in mcp_tools {
            self.register_tool(tool)?;
        }

        tracing::info!("Loaded {} MCP tools into AGI tool registry", count);
        Ok(count)
    }

    pub fn register_tool(&self, tool: Tool) -> Result<()> {
        let mut capabilities_index = self
            .capabilities_index
            .lock()
            .map_err(|e| anyhow::anyhow!("Tool capabilities index lock poisoned: {}", e))?;
        for capability in &tool.capabilities {
            capabilities_index
                .entry(capability.clone())
                .or_default()
                .push(tool.id.clone());
        }
        drop(capabilities_index);

        let mut tools = self
            .tools
            .lock()
            .map_err(|e| anyhow::anyhow!("Tool registry lock poisoned: {}", e))?;
        tools.insert(tool.id.clone(), tool);
        Ok(())
    }

    pub fn find_tools_by_capability(&self, capability: &ToolCapability) -> Vec<Tool> {
        let capabilities_index = match self.capabilities_index.lock() {
            Ok(index) => index,
            Err(e) => {
                tracing::error!("Tool capabilities index lock poisoned: {}", e);
                return Vec::new();
            }
        };

        let tools = match self.tools.lock() {
            Ok(t) => t,
            Err(e) => {
                tracing::error!("Tool registry lock poisoned: {}", e);
                return Vec::new();
            }
        };

        capabilities_index
            .get(capability)
            .map(|ids| ids.iter().filter_map(|id| tools.get(id).cloned()).collect())
            .unwrap_or_default()
    }

    pub fn get_tool(&self, id: &str) -> Option<Tool> {
        match self.tools.lock() {
            Ok(tools) => tools.get(id).cloned(),
            Err(e) => {
                tracing::error!("Tool registry lock poisoned: {}", e);
                None
            }
        }
    }

    pub fn list_tools(&self) -> Vec<Tool> {
        match self.tools.lock() {
            Ok(tools) => tools.values().cloned().collect(),
            Err(e) => {
                tracing::error!("Tool registry lock poisoned: {}", e);
                Vec::new()
            }
        }
    }

    pub fn suggest_tools(&self, goal_description: &str) -> Vec<Tool> {
        let mut suggested = Vec::new();

        let description_lower = goal_description.to_lowercase();

        if description_lower.contains("file")
            || description_lower.contains("read")
            || description_lower.contains("write")
        {
            suggested.extend(self.find_tools_by_capability(&ToolCapability::FileRead));
            suggested.extend(self.find_tools_by_capability(&ToolCapability::FileWrite));
        }

        if description_lower.contains("click")
            || description_lower.contains("ui")
            || description_lower.contains("automate")
        {
            suggested.extend(self.find_tools_by_capability(&ToolCapability::UIAutomation));
        }

        if description_lower.contains("browser")
            || description_lower.contains("web")
            || description_lower.contains("url")
        {
            suggested.extend(self.find_tools_by_capability(&ToolCapability::BrowserAutomation));
        }

        if description_lower.contains("code")
            || description_lower.contains("execute")
            || description_lower.contains("run")
        {
            suggested.extend(self.find_tools_by_capability(&ToolCapability::CodeExecution));
        }

        if description_lower.contains("database")
            || description_lower.contains("query")
            || description_lower.contains("sql")
        {
            suggested.extend(self.find_tools_by_capability(&ToolCapability::DatabaseAccess));
        }

        if description_lower.contains("api")
            || description_lower.contains("http")
            || description_lower.contains("request")
        {
            suggested.extend(self.find_tools_by_capability(&ToolCapability::APICall));
        }

        if let Some(tool) = self.get_tool("llm_reason") {
            suggested.push(tool);
        }

        suggested.sort_by(|a, b| a.id.cmp(&b.id));
        suggested.dedup_by(|a, b| a.id == b.id);

        suggested
    }
}
