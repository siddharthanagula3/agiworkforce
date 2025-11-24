use super::*;
use crate::automation::AutomationService;
use crate::router::LLMRouter;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

/// Tool Registry - manages all available tools
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
    pub dependencies: Vec<String>, // Other tool IDs this depends on
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
    SystemCommand, // Added for security tests
    NetworkAccess, // Added for security tests
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

    /// Register all available tools
    pub fn register_all_tools(
        &self,
        _automation: Arc<AutomationService>,
        _router: Arc<tokio::sync::Mutex<LLMRouter>>,
    ) -> Result<()> {
        // File Operations
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
            estimated_resources: ResourceUsage {
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

        // UI Automation
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

        // Browser Automation
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

        // Code Execution
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

        // Database Access
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

        // Database Execute (INSERT/UPDATE/DELETE)
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

        // Database Transaction Begin
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

        // Database Transaction Commit
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

        // Database Transaction Rollback
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

        // API Calls
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

        // Image Processing
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
                network_mb: 5.0, // API call to vision model
            },
            dependencies: vec![],
        })?;

        // Code Analysis
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

        // LLM Tool (for reasoning, planning, etc.)
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
                network_mb: 10.0, // Token usage
            },
            dependencies: vec![],
        })?;

        // Email Tools
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

        // Calendar Tools
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

        // Cloud Storage Tools
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

        // Productivity Tools
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

        // Document Tools
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

        // Document Creation Tools
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

        // Terminal Operations
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

        // Git Operations
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

        // GitHub Operations
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

        // Physical Scrape Tool (composite: browser navigate + automation select all + copy + clipboard get)
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

        Ok(())
    }

    /// Load MCP tools from connected MCP servers
    pub async fn load_mcp_tools(
        &self,
        mcp_registry: Arc<crate::mcp::McpToolRegistry>,
    ) -> Result<usize> {
        let mcp_tools = mcp_registry.get_all_tool_schemas();
        let count = mcp_tools.len();

        for tool in mcp_tools {
            self.register_tool(tool)?;
        }

        tracing::info!("Loaded {} MCP tools into AGI tool registry", count);
        Ok(count)
    }

    fn register_tool(&self, tool: Tool) -> Result<()> {
        // Index by capabilities
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

    /// Find tools by capability
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

    /// Get tool by ID
    pub fn get_tool(&self, id: &str) -> Option<Tool> {
        match self.tools.lock() {
            Ok(tools) => tools.get(id).cloned(),
            Err(e) => {
                tracing::error!("Tool registry lock poisoned: {}", e);
                None
            }
        }
    }

    /// List all tools
    pub fn list_tools(&self) -> Vec<Tool> {
        match self.tools.lock() {
            Ok(tools) => tools.values().cloned().collect(),
            Err(e) => {
                tracing::error!("Tool registry lock poisoned: {}", e);
                Vec::new()
            }
        }
    }

    /// Get tools that can help achieve a goal
    pub fn suggest_tools(&self, goal_description: &str) -> Vec<Tool> {
        // Simple heuristic-based suggestion
        // In production, use LLM to analyze goal and suggest tools
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

        // Always include LLM reasoning
        if let Some(tool) = self.get_tool("llm_reason") {
            suggested.push(tool);
        }

        // Deduplicate
        suggested.sort_by(|a, b| a.id.cmp(&b.id));
        suggested.dedup_by(|a, b| a.id == b.id);

        suggested
    }
}
