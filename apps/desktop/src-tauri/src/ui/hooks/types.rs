use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "PascalCase")]
pub enum HookEventType {
    SessionStart,
    SessionEnd,
    PreToolUse,
    PostToolUse,
    ToolError,
    StepStart,
    StepCompleted,
    StepError,
    GoalStart,
    GoalCompleted,
    GoalError,
    UserPromptSubmit,
    ApprovalRequired,
    ApprovalGranted,
    ApprovalDenied,
}

impl HookEventType {
    pub fn all() -> Vec<HookEventType> {
        vec![
            HookEventType::SessionStart,
            HookEventType::SessionEnd,
            HookEventType::PreToolUse,
            HookEventType::PostToolUse,
            HookEventType::ToolError,
            HookEventType::StepStart,
            HookEventType::StepCompleted,
            HookEventType::StepError,
            HookEventType::GoalStart,
            HookEventType::GoalCompleted,
            HookEventType::GoalError,
            HookEventType::UserPromptSubmit,
            HookEventType::ApprovalRequired,
            HookEventType::ApprovalGranted,
            HookEventType::ApprovalDenied,
        ]
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            HookEventType::SessionStart => "SessionStart",
            HookEventType::SessionEnd => "SessionEnd",
            HookEventType::PreToolUse => "PreToolUse",
            HookEventType::PostToolUse => "PostToolUse",
            HookEventType::ToolError => "ToolError",
            HookEventType::StepStart => "StepStart",
            HookEventType::StepCompleted => "StepCompleted",
            HookEventType::StepError => "StepError",
            HookEventType::GoalStart => "GoalStart",
            HookEventType::GoalCompleted => "GoalCompleted",
            HookEventType::GoalError => "GoalError",
            HookEventType::UserPromptSubmit => "UserPromptSubmit",
            HookEventType::ApprovalRequired => "ApprovalRequired",
            HookEventType::ApprovalGranted => "ApprovalGranted",
            HookEventType::ApprovalDenied => "ApprovalDenied",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Hook {
    pub name: String,

    pub events: Vec<HookEventType>,

    #[serde(default = "default_priority")]
    pub priority: u8,

    pub command: String,

    #[serde(default = "default_enabled")]
    pub enabled: bool,

    #[serde(default = "default_timeout")]
    pub timeout_secs: u64,

    #[serde(default)]
    pub env: HashMap<String, String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub working_dir: Option<String>,

    #[serde(default = "default_continue_on_error")]
    pub continue_on_error: bool,
}

fn default_priority() -> u8 {
    50
}

fn default_enabled() -> bool {
    true
}

fn default_timeout() -> u64 {
    30
}

fn default_continue_on_error() -> bool {
    true
}

impl Hook {
    pub fn handles_event(&self, event_type: &HookEventType) -> bool {
        self.enabled && self.events.contains(event_type)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HookEvent {
    pub event_type: HookEventType,

    pub timestamp: DateTime<Utc>,

    pub session_id: String,

    pub context: EventContext,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum EventContext {
    Session {
        session_id: String,
        metadata: HashMap<String, serde_json::Value>,
    },
    Tool {
        tool_name: String,
        tool_id: String,
        parameters: HashMap<String, serde_json::Value>,
        result: Option<serde_json::Value>,
        error: Option<String>,
        execution_time_ms: Option<u64>,
    },
    Step {
        step_id: String,
        step_description: String,
        goal_id: String,
        result: Option<serde_json::Value>,
        error: Option<String>,
    },
    Goal {
        goal_id: String,
        description: String,
        priority: String,
        result: Option<serde_json::Value>,
        error: Option<String>,
    },
    UserPrompt {
        prompt: String,
        conversation_id: Option<String>,
    },
    Approval {
        approval_id: String,
        action: String,
        details: HashMap<String, serde_json::Value>,
        decision: Option<bool>,
    },
}

impl HookEvent {
    pub fn session_start(session_id: String, metadata: HashMap<String, serde_json::Value>) -> Self {
        Self {
            event_type: HookEventType::SessionStart,
            timestamp: Utc::now(),
            session_id: session_id.clone(),
            context: EventContext::Session {
                session_id,
                metadata,
            },
        }
    }

    pub fn session_end(session_id: String, metadata: HashMap<String, serde_json::Value>) -> Self {
        Self {
            event_type: HookEventType::SessionEnd,
            timestamp: Utc::now(),
            session_id: session_id.clone(),
            context: EventContext::Session {
                session_id,
                metadata,
            },
        }
    }

    pub fn pre_tool_use(
        session_id: String,
        tool_name: String,
        tool_id: String,
        parameters: HashMap<String, serde_json::Value>,
    ) -> Self {
        Self {
            event_type: HookEventType::PreToolUse,
            timestamp: Utc::now(),
            session_id,
            context: EventContext::Tool {
                tool_name,
                tool_id,
                parameters,
                result: None,
                error: None,
                execution_time_ms: None,
            },
        }
    }

    pub fn post_tool_use(
        session_id: String,
        tool_name: String,
        tool_id: String,
        parameters: HashMap<String, serde_json::Value>,
        result: serde_json::Value,
        execution_time_ms: u64,
    ) -> Self {
        Self {
            event_type: HookEventType::PostToolUse,
            timestamp: Utc::now(),
            session_id,
            context: EventContext::Tool {
                tool_name,
                tool_id,
                parameters,
                result: Some(result),
                error: None,
                execution_time_ms: Some(execution_time_ms),
            },
        }
    }

    pub fn tool_error(
        session_id: String,
        tool_name: String,
        tool_id: String,
        parameters: HashMap<String, serde_json::Value>,
        error: String,
    ) -> Self {
        Self {
            event_type: HookEventType::ToolError,
            timestamp: Utc::now(),
            session_id,
            context: EventContext::Tool {
                tool_name,
                tool_id,
                parameters,
                result: None,
                error: Some(error),
                execution_time_ms: None,
            },
        }
    }

    pub fn step_start(
        session_id: String,
        step_id: String,
        step_description: String,
        goal_id: String,
    ) -> Self {
        Self {
            event_type: HookEventType::StepStart,
            timestamp: Utc::now(),
            session_id,
            context: EventContext::Step {
                step_id,
                step_description,
                goal_id,
                result: None,
                error: None,
            },
        }
    }

    pub fn step_completed(
        session_id: String,
        step_id: String,
        step_description: String,
        goal_id: String,
        result: serde_json::Value,
    ) -> Self {
        Self {
            event_type: HookEventType::StepCompleted,
            timestamp: Utc::now(),
            session_id,
            context: EventContext::Step {
                step_id,
                step_description,
                goal_id,
                result: Some(result),
                error: None,
            },
        }
    }

    pub fn step_error(
        session_id: String,
        step_id: String,
        step_description: String,
        goal_id: String,
        error: String,
    ) -> Self {
        Self {
            event_type: HookEventType::StepError,
            timestamp: Utc::now(),
            session_id,
            context: EventContext::Step {
                step_id,
                step_description,
                goal_id,
                result: None,
                error: Some(error),
            },
        }
    }

    pub fn goal_start(
        session_id: String,
        goal_id: String,
        description: String,
        priority: String,
    ) -> Self {
        Self {
            event_type: HookEventType::GoalStart,
            timestamp: Utc::now(),
            session_id,
            context: EventContext::Goal {
                goal_id,
                description,
                priority,
                result: None,
                error: None,
            },
        }
    }

    pub fn goal_completed(
        session_id: String,
        goal_id: String,
        description: String,
        priority: String,
        result: serde_json::Value,
    ) -> Self {
        Self {
            event_type: HookEventType::GoalCompleted,
            timestamp: Utc::now(),
            session_id,
            context: EventContext::Goal {
                goal_id,
                description,
                priority,
                result: Some(result),
                error: None,
            },
        }
    }

    pub fn goal_error(
        session_id: String,
        goal_id: String,
        description: String,
        priority: String,
        error: String,
    ) -> Self {
        Self {
            event_type: HookEventType::GoalError,
            timestamp: Utc::now(),
            session_id,
            context: EventContext::Goal {
                goal_id,
                description,
                priority,
                result: None,
                error: Some(error),
            },
        }
    }

    pub fn user_prompt_submit(
        session_id: String,
        prompt: String,
        conversation_id: Option<String>,
    ) -> Self {
        Self {
            event_type: HookEventType::UserPromptSubmit,
            timestamp: Utc::now(),
            session_id,
            context: EventContext::UserPrompt {
                prompt,
                conversation_id,
            },
        }
    }

    pub fn approval_required(
        session_id: String,
        approval_id: String,
        action: String,
        details: HashMap<String, serde_json::Value>,
    ) -> Self {
        Self {
            event_type: HookEventType::ApprovalRequired,
            timestamp: Utc::now(),
            session_id,
            context: EventContext::Approval {
                approval_id,
                action,
                details,
                decision: None,
            },
        }
    }

    pub fn approval_granted(
        session_id: String,
        approval_id: String,
        action: String,
        details: HashMap<String, serde_json::Value>,
    ) -> Self {
        Self {
            event_type: HookEventType::ApprovalGranted,
            timestamp: Utc::now(),
            session_id,
            context: EventContext::Approval {
                approval_id,
                action,
                details,
                decision: Some(true),
            },
        }
    }

    pub fn approval_denied(
        session_id: String,
        approval_id: String,
        action: String,
        details: HashMap<String, serde_json::Value>,
    ) -> Self {
        Self {
            event_type: HookEventType::ApprovalDenied,
            timestamp: Utc::now(),
            session_id,
            context: EventContext::Approval {
                approval_id,
                action,
                details,
                decision: Some(false),
            },
        }
    }

    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(self)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HookExecutionResult {
    pub hook_name: String,
    pub event_type: HookEventType,
    pub success: bool,
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub execution_time_ms: u64,
    pub error: Option<String>,
}
