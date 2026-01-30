//! Type definitions for intent detection and tool routing.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;

/// Categories of user intents.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IntentCategory {
    /// File system operations (read, write, delete, search files).
    FileOperation,

    /// Web search and information retrieval.
    WebSearch,

    /// Code-related tasks (write, analyze, execute code).
    CodeTask,

    /// Email operations (read, send, search emails).
    Email,

    /// Calendar operations (create events, check schedule).
    Calendar,

    /// Document operations (create, read, edit documents).
    Document,

    /// UI/browser automation tasks.
    Automation,

    /// Database operations.
    Database,

    /// API calls and integrations.
    ApiIntegration,

    /// Image processing and generation.
    ImageProcessing,

    /// Git and version control.
    VersionControl,

    /// System commands and terminal operations.
    SystemCommand,

    /// Memory and context operations.
    Memory,

    /// Scheduling and reminders.
    Scheduling,

    /// General conversation or unclear intent.
    Conversation,

    /// Media generation (images, videos).
    MediaGeneration,

    /// Cloud storage operations.
    CloudStorage,

    /// Productivity tools (tasks, notes).
    Productivity,
}

impl IntentCategory {
    /// Returns all intent categories.
    #[must_use]
    pub fn all() -> Vec<Self> {
        vec![
            Self::FileOperation,
            Self::WebSearch,
            Self::CodeTask,
            Self::Email,
            Self::Calendar,
            Self::Document,
            Self::Automation,
            Self::Database,
            Self::ApiIntegration,
            Self::ImageProcessing,
            Self::VersionControl,
            Self::SystemCommand,
            Self::Memory,
            Self::Scheduling,
            Self::Conversation,
            Self::MediaGeneration,
            Self::CloudStorage,
            Self::Productivity,
        ]
    }

    /// Returns a human-readable description of the intent category.
    #[must_use]
    pub fn description(&self) -> &'static str {
        match self {
            Self::FileOperation => "File system operations",
            Self::WebSearch => "Web search and research",
            Self::CodeTask => "Code writing and analysis",
            Self::Email => "Email operations",
            Self::Calendar => "Calendar and scheduling",
            Self::Document => "Document creation and editing",
            Self::Automation => "UI and browser automation",
            Self::Database => "Database operations",
            Self::ApiIntegration => "API calls and integrations",
            Self::ImageProcessing => "Image processing",
            Self::VersionControl => "Git and version control",
            Self::SystemCommand => "System commands",
            Self::Memory => "Memory and context",
            Self::Scheduling => "Reminders and scheduled tasks",
            Self::Conversation => "General conversation",
            Self::MediaGeneration => "Image and video generation",
            Self::CloudStorage => "Cloud storage operations",
            Self::Productivity => "Task and note management",
        }
    }
}

/// Complexity level of a task.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Complexity {
    /// Simple, single-step task (< 5 seconds).
    QuickWin,

    /// Simple task requiring 1-3 steps (5-30 seconds).
    Simple,

    /// Moderate task requiring multiple steps (30 seconds - 2 minutes).
    Moderate,

    /// Complex task requiring many steps and planning (2-5 minutes).
    Complex,

    /// Long-running task requiring extensive work (> 5 minutes).
    LongRunning,
}

impl Complexity {
    /// Returns the estimated duration range for this complexity level.
    #[must_use]
    pub fn estimated_duration(&self) -> (Duration, Duration) {
        match self {
            Self::QuickWin => (Duration::from_secs(0), Duration::from_secs(5)),
            Self::Simple => (Duration::from_secs(5), Duration::from_secs(30)),
            Self::Moderate => (Duration::from_secs(30), Duration::from_secs(120)),
            Self::Complex => (Duration::from_secs(120), Duration::from_secs(300)),
            Self::LongRunning => (Duration::from_secs(300), Duration::from_secs(3600)),
        }
    }

    /// Returns the maximum number of steps typically needed.
    #[must_use]
    pub fn max_steps(&self) -> usize {
        match self {
            Self::QuickWin => 1,
            Self::Simple => 3,
            Self::Moderate => 7,
            Self::Complex => 15,
            Self::LongRunning => 50,
        }
    }
}

/// Confidence level for intent detection.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct IntentConfidence {
    /// Overall confidence score (0.0 to 1.0).
    pub score: f64,

    /// Confidence in the detected category.
    pub category_confidence: f64,

    /// Confidence in the tool selection.
    pub tool_confidence: f64,

    /// Confidence in complexity estimation.
    pub complexity_confidence: f64,
}

impl IntentConfidence {
    /// Creates a new confidence with the given scores.
    #[must_use]
    pub fn new(category_confidence: f64, tool_confidence: f64, complexity_confidence: f64) -> Self {
        let score = (category_confidence + tool_confidence + complexity_confidence) / 3.0;
        Self {
            score,
            category_confidence,
            tool_confidence,
            complexity_confidence,
        }
    }

    /// Returns true if the confidence is high enough for automatic execution.
    #[must_use]
    pub fn is_high(&self) -> bool {
        self.score >= 0.7
    }

    /// Returns true if the confidence is too low for reliable detection.
    #[must_use]
    pub fn is_low(&self) -> bool {
        self.score < 0.4
    }
}

impl Default for IntentConfidence {
    fn default() -> Self {
        Self {
            score: 0.5,
            category_confidence: 0.5,
            tool_confidence: 0.5,
            complexity_confidence: 0.5,
        }
    }
}

/// A detected intent from user input.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedIntent {
    /// The original user prompt.
    pub prompt: String,

    /// Primary intent category.
    pub primary_category: IntentCategory,

    /// Secondary intent categories (if the task spans multiple domains).
    pub secondary_categories: Vec<IntentCategory>,

    /// Estimated complexity of the task.
    pub complexity: Complexity,

    /// Confidence in the detection.
    pub confidence: IntentConfidence,

    /// Required tools for this intent.
    pub required_tools: Vec<String>,

    /// Required MCP servers.
    pub required_servers: Vec<RequiredServer>,

    /// Extracted entities from the prompt (e.g., file paths, URLs, names).
    pub entities: HashMap<String, String>,

    /// Whether this is a quick-win task that can be optimized.
    pub is_quick_win: bool,

    /// Suggested action description for the user.
    pub suggested_action: String,

    /// Keywords that triggered this intent.
    pub matched_keywords: Vec<String>,
}

impl DetectedIntent {
    /// Creates a new detected intent.
    #[must_use]
    pub fn new(prompt: String, category: IntentCategory) -> Self {
        Self {
            prompt,
            primary_category: category,
            secondary_categories: Vec::new(),
            complexity: Complexity::Simple,
            confidence: IntentConfidence::default(),
            required_tools: Vec::new(),
            required_servers: Vec::new(),
            entities: HashMap::new(),
            is_quick_win: false,
            suggested_action: String::new(),
            matched_keywords: Vec::new(),
        }
    }

    /// Sets the complexity level.
    #[must_use]
    pub fn with_complexity(mut self, complexity: Complexity) -> Self {
        self.complexity = complexity;
        self.is_quick_win = complexity == Complexity::QuickWin;
        self
    }

    /// Sets the confidence.
    #[must_use]
    pub fn with_confidence(mut self, confidence: IntentConfidence) -> Self {
        self.confidence = confidence;
        self
    }

    /// Adds required tools.
    #[must_use]
    pub fn with_tools(mut self, tools: Vec<String>) -> Self {
        self.required_tools = tools;
        self
    }

    /// Adds required MCP servers.
    #[must_use]
    pub fn with_servers(mut self, servers: Vec<RequiredServer>) -> Self {
        self.required_servers = servers;
        self
    }

    /// Adds an entity.
    pub fn add_entity(&mut self, key: String, value: String) {
        self.entities.insert(key, value);
    }

    /// Sets the suggested action.
    #[must_use]
    pub fn with_action(mut self, action: String) -> Self {
        self.suggested_action = action;
        self
    }

    /// Returns true if this intent requires external services.
    #[must_use]
    pub fn requires_network(&self) -> bool {
        matches!(
            self.primary_category,
            IntentCategory::WebSearch
                | IntentCategory::Email
                | IntentCategory::ApiIntegration
                | IntentCategory::CloudStorage
        ) || !self.required_servers.is_empty()
    }
}

/// Information about a required MCP server.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequiredServer {
    /// Name of the MCP server.
    pub name: String,

    /// Whether this server is required or optional.
    pub required: bool,

    /// Priority for starting this server (lower = higher priority).
    pub priority: u8,

    /// Specific tools needed from this server.
    pub tools: Vec<String>,
}

impl RequiredServer {
    /// Creates a new required server.
    #[must_use]
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            required: true,
            priority: 50,
            tools: Vec::new(),
        }
    }

    /// Sets whether the server is optional.
    #[must_use]
    pub fn optional(mut self) -> Self {
        self.required = false;
        self
    }

    /// Sets the priority.
    #[must_use]
    pub fn with_priority(mut self, priority: u8) -> Self {
        self.priority = priority;
        self
    }

    /// Adds required tools.
    #[must_use]
    pub fn with_tools(mut self, tools: Vec<String>) -> Self {
        self.tools = tools;
        self
    }
}

/// A selected tool for execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolSelection {
    /// Tool ID.
    pub tool_id: String,

    /// Why this tool was selected.
    pub reason: String,

    /// Confidence in this selection (0.0 to 1.0).
    pub confidence: f64,

    /// Estimated execution time.
    pub estimated_time: Duration,

    /// Whether this tool is from an MCP server.
    pub is_mcp_tool: bool,

    /// The MCP server name if applicable.
    pub server_name: Option<String>,

    /// Priority for execution (lower = higher priority).
    pub priority: u8,

    /// Dependencies on other tools.
    pub dependencies: Vec<String>,
}

impl ToolSelection {
    /// Creates a new tool selection.
    #[must_use]
    pub fn new(tool_id: impl Into<String>, reason: impl Into<String>) -> Self {
        Self {
            tool_id: tool_id.into(),
            reason: reason.into(),
            confidence: 0.8,
            estimated_time: Duration::from_secs(5),
            is_mcp_tool: false,
            server_name: None,
            priority: 50,
            dependencies: Vec::new(),
        }
    }

    /// Sets this as an MCP tool.
    #[must_use]
    pub fn from_mcp(mut self, server_name: impl Into<String>) -> Self {
        self.is_mcp_tool = true;
        self.server_name = Some(server_name.into());
        self
    }

    /// Sets the confidence.
    #[must_use]
    pub fn with_confidence(mut self, confidence: f64) -> Self {
        self.confidence = confidence;
        self
    }

    /// Sets the priority.
    #[must_use]
    pub fn with_priority(mut self, priority: u8) -> Self {
        self.priority = priority;
        self
    }

    /// Adds dependencies.
    #[must_use]
    pub fn with_dependencies(mut self, deps: Vec<String>) -> Self {
        self.dependencies = deps;
        self
    }
}
