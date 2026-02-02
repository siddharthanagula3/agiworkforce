//! Error Translation Layer for AGI Workforce
//!
//! This module provides user-friendly error message translation following the product principle:
//! "Never show stack traces or technical codes to users"
//!
//! Key features:
//! - Translates technical error codes to plain English messages
//! - Hides MCP terminology from users (MCP is invisible to end users)
//! - Provides contextual recovery suggestions
//! - Categorizes errors for appropriate UI treatment

use super::{AGIError, ErrorCategory, LLMError, ResourceError, ToolError};
use serde::{Deserialize, Serialize};
use std::borrow::Cow;

/// User-friendly error message with recovery suggestion
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FriendlyError {
    /// The user-facing message (plain English, no jargon)
    pub message: String,
    /// A suggested action the user can take
    pub suggestion: String,
    /// Error category for UI treatment
    pub category: FriendlyErrorCategory,
    /// Whether the system will automatically retry
    pub will_auto_retry: bool,
    /// Estimated wait time if retrying (in seconds)
    pub retry_wait_seconds: Option<u32>,
    /// Whether the user can take action to fix this
    pub user_actionable: bool,
}

/// User-facing error categories (simplified from internal categories)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FriendlyErrorCategory {
    /// Temporary issue, will resolve itself
    Temporary,
    /// User needs to take action (permissions, credentials, etc.)
    NeedsAction,
    /// Something is misconfigured
    Configuration,
    /// Resource limit reached
    Limit,
    /// Permanent error that cannot be automatically fixed
    Error,
}

impl From<ErrorCategory> for FriendlyErrorCategory {
    fn from(cat: ErrorCategory) -> Self {
        match cat {
            ErrorCategory::Transient => FriendlyErrorCategory::Temporary,
            ErrorCategory::Permission => FriendlyErrorCategory::NeedsAction,
            ErrorCategory::Configuration => FriendlyErrorCategory::Configuration,
            ErrorCategory::ResourceLimit => FriendlyErrorCategory::Limit,
            ErrorCategory::Permanent | ErrorCategory::Unknown => FriendlyErrorCategory::Error,
        }
    }
}

/// Error translator that converts technical errors to user-friendly messages
pub struct ErrorTranslator {
    /// Context about what the user was trying to do
    user_intent: Option<String>,
}

impl ErrorTranslator {
    /// Create a new error translator
    pub fn new() -> Self {
        Self { user_intent: None }
    }

    /// Set context about what the user was trying to accomplish
    pub fn with_intent(mut self, intent: impl Into<String>) -> Self {
        self.user_intent = Some(intent.into());
        self
    }

    /// Translate an AGI error to a user-friendly message
    pub fn translate(&self, error: &AGIError) -> FriendlyError {
        match error {
            AGIError::ToolError(tool_err) => self.translate_tool_error(tool_err),
            AGIError::LLMError(llm_err) => self.translate_llm_error(llm_err),
            AGIError::ResourceError(res_err) => self.translate_resource_error(res_err),
            AGIError::TransientError(msg) => self.translate_transient_error(msg),
            AGIError::TimeoutError(msg) => self.translate_timeout_error(msg),
            AGIError::PermissionError(msg) => self.translate_permission_error(msg),
            AGIError::ConfigurationError(msg) | AGIError::Config(msg) => {
                self.translate_config_error(msg)
            }
            AGIError::FatalError(msg) => self.translate_fatal_error(msg),
            AGIError::PlanningError(msg) => self.translate_planning_error(msg),
            AGIError::Database(msg) => self.translate_database_error(msg),
            AGIError::CommandTimeout(msg) => self.translate_command_timeout(msg),
            AGIError::EmailSend(msg) => self.translate_email_send_error(msg),
            AGIError::EmailParse(msg) => self.translate_email_parse_error(msg),
            AGIError::InvalidPath(msg) => self.translate_invalid_path_error(msg),
            AGIError::Provider(msg) => self.translate_provider_error(msg),
            AGIError::Http(msg) => self.translate_http_error(msg),
            AGIError::Generic(msg) | AGIError::Other(msg) => self.translate_generic_error(msg),
        }
    }

    /// Translate tool errors to friendly messages
    /// IMPORTANT: Never expose "MCP" in user-facing messages
    fn translate_tool_error(&self, error: &ToolError) -> FriendlyError {
        match error {
            ToolError::BrowserError(msg) => self.translate_browser_error(msg),
            ToolError::FileSystemError(msg) => self.translate_filesystem_error(msg),
            ToolError::DatabaseError(msg) => self.translate_database_error(msg),
            ToolError::ApiError(msg) => self.translate_api_error(msg),
            ToolError::UIAutomationError(msg) => self.translate_ui_automation_error(msg),
            ToolError::EmailError(msg) => self.translate_email_tool_error(msg),
            ToolError::CalendarError(msg) => self.translate_calendar_error(msg),
            ToolError::CloudError(msg) => self.translate_cloud_error(msg),
            ToolError::CodeExecutionError(msg) => self.translate_code_execution_error(msg),
            ToolError::OCRError(msg) => self.translate_ocr_error(msg),
            ToolError::NotFound(tool) => self.translate_tool_not_found(tool),
            ToolError::InvalidParameters(msg) => self.translate_invalid_params(msg),
        }
    }

    fn translate_browser_error(&self, msg: &str) -> FriendlyError {
        let msg_lower = msg.to_lowercase();

        if msg_lower.contains("element not found") || msg_lower.contains("no such element") {
            FriendlyError {
                message: "I couldn't find the button or link I was looking for on the page."
                    .to_string(),
                suggestion: "The page might have changed. Let me try a different approach."
                    .to_string(),
                category: FriendlyErrorCategory::Temporary,
                will_auto_retry: true,
                retry_wait_seconds: Some(2),
                user_actionable: false,
            }
        } else if msg_lower.contains("timeout") || msg_lower.contains("timed out") {
            FriendlyError {
                message: "The page is taking too long to respond.".to_string(),
                suggestion:
                    "This might be due to a slow internet connection. I'll wait and try again."
                        .to_string(),
                category: FriendlyErrorCategory::Temporary,
                will_auto_retry: true,
                retry_wait_seconds: Some(5),
                user_actionable: false,
            }
        } else if msg_lower.contains("crash") || msg_lower.contains("disconnected") {
            FriendlyError {
                message: "The browser window closed unexpectedly.".to_string(),
                suggestion: "I'll restart it and continue where I left off.".to_string(),
                category: FriendlyErrorCategory::Temporary,
                will_auto_retry: true,
                retry_wait_seconds: Some(3),
                user_actionable: false,
            }
        } else if msg_lower.contains("navigation") || msg_lower.contains("failed to navigate") {
            FriendlyError {
                message: "I couldn't open that webpage.".to_string(),
                suggestion:
                    "Please check if the website address is correct and the site is accessible."
                        .to_string(),
                category: FriendlyErrorCategory::NeedsAction,
                will_auto_retry: false,
                retry_wait_seconds: None,
                user_actionable: true,
            }
        } else if msg_lower.contains("blocked") || msg_lower.contains("captcha") {
            FriendlyError {
                message: "The website is asking for human verification.".to_string(),
                suggestion: "You may need to complete a captcha or verification on the website."
                    .to_string(),
                category: FriendlyErrorCategory::NeedsAction,
                will_auto_retry: false,
                retry_wait_seconds: None,
                user_actionable: true,
            }
        } else {
            FriendlyError {
                message: "Something went wrong while browsing.".to_string(),
                suggestion: "I'll try again in a moment.".to_string(),
                category: FriendlyErrorCategory::Temporary,
                will_auto_retry: true,
                retry_wait_seconds: Some(2),
                user_actionable: false,
            }
        }
    }

    fn translate_filesystem_error(&self, msg: &str) -> FriendlyError {
        let msg_lower = msg.to_lowercase();

        if msg_lower.contains("not found") || msg_lower.contains("no such file") {
            FriendlyError {
                message: "I couldn't find that file or folder.".to_string(),
                suggestion: "Please check the file path and make sure it exists.".to_string(),
                category: FriendlyErrorCategory::NeedsAction,
                will_auto_retry: false,
                retry_wait_seconds: None,
                user_actionable: true,
            }
        } else if msg_lower.contains("permission denied") || msg_lower.contains("access denied") {
            FriendlyError {
                message: "I don't have permission to access that file or folder.".to_string(),
                suggestion:
                    "Please grant file access in System Settings, or choose a different location."
                        .to_string(),
                category: FriendlyErrorCategory::NeedsAction,
                will_auto_retry: false,
                retry_wait_seconds: None,
                user_actionable: true,
            }
        } else if msg_lower.contains("disk full")
            || msg_lower.contains("no space")
            || msg_lower.contains("storage")
        {
            FriendlyError {
                message: "Your disk is full.".to_string(),
                suggestion: "Please free up some space and try again.".to_string(),
                category: FriendlyErrorCategory::NeedsAction,
                will_auto_retry: false,
                retry_wait_seconds: None,
                user_actionable: true,
            }
        } else if msg_lower.contains("in use") || msg_lower.contains("locked") {
            FriendlyError {
                message: "That file is currently open in another application.".to_string(),
                suggestion: "Please close the file in other apps and try again.".to_string(),
                category: FriendlyErrorCategory::NeedsAction,
                will_auto_retry: false,
                retry_wait_seconds: None,
                user_actionable: true,
            }
        } else if msg_lower.contains("read only") || msg_lower.contains("readonly") {
            FriendlyError {
                message: "That file or location is read-only.".to_string(),
                suggestion: "Please choose a different location or check file permissions."
                    .to_string(),
                category: FriendlyErrorCategory::NeedsAction,
                will_auto_retry: false,
                retry_wait_seconds: None,
                user_actionable: true,
            }
        } else {
            FriendlyError {
                message: "Something went wrong with file access.".to_string(),
                suggestion: "Please check the file path and permissions.".to_string(),
                category: FriendlyErrorCategory::Error,
                will_auto_retry: false,
                retry_wait_seconds: None,
                user_actionable: true,
            }
        }
    }

    fn translate_database_error(&self, msg: &str) -> FriendlyError {
        let msg_lower = msg.to_lowercase();

        if msg_lower.contains("locked") || msg_lower.contains("busy") {
            FriendlyError {
                message: "I'm waiting for another operation to complete.".to_string(),
                suggestion: "This should resolve automatically in a moment.".to_string(),
                category: FriendlyErrorCategory::Temporary,
                will_auto_retry: true,
                retry_wait_seconds: Some(2),
                user_actionable: false,
            }
        } else if msg_lower.contains("corrupt") {
            FriendlyError {
                message: "There's an issue with the app's data storage.".to_string(),
                suggestion: "You may need to reset the app data. Your cloud-synced data is safe."
                    .to_string(),
                category: FriendlyErrorCategory::Error,
                will_auto_retry: false,
                retry_wait_seconds: None,
                user_actionable: true,
            }
        } else {
            FriendlyError {
                message: "Something went wrong saving data locally.".to_string(),
                suggestion: "I'll try again. If this keeps happening, try restarting the app."
                    .to_string(),
                category: FriendlyErrorCategory::Temporary,
                will_auto_retry: true,
                retry_wait_seconds: Some(1),
                user_actionable: false,
            }
        }
    }

    fn translate_api_error(&self, msg: &str) -> FriendlyError {
        let msg_lower = msg.to_lowercase();

        if msg_lower.contains("rate limit") || msg_lower.contains("429") {
            FriendlyError {
                message: "I've made too many requests too quickly.".to_string(),
                suggestion: "I'll wait a moment before trying again.".to_string(),
                category: FriendlyErrorCategory::Limit,
                will_auto_retry: true,
                retry_wait_seconds: Some(60),
                user_actionable: false,
            }
        } else if msg_lower.contains("401") || msg_lower.contains("unauthorized") {
            FriendlyError {
                message: "The service requires authentication.".to_string(),
                suggestion: "Please check your login credentials or reconnect your account."
                    .to_string(),
                category: FriendlyErrorCategory::NeedsAction,
                will_auto_retry: false,
                retry_wait_seconds: None,
                user_actionable: true,
            }
        } else if msg_lower.contains("403") || msg_lower.contains("forbidden") {
            FriendlyError {
                message: "You don't have permission to access this service.".to_string(),
                suggestion: "Please check your account permissions or subscription.".to_string(),
                category: FriendlyErrorCategory::NeedsAction,
                will_auto_retry: false,
                retry_wait_seconds: None,
                user_actionable: true,
            }
        } else if msg_lower.contains("404") || msg_lower.contains("not found") {
            FriendlyError {
                message: "The requested resource doesn't exist.".to_string(),
                suggestion: "Please check if the information you provided is correct.".to_string(),
                category: FriendlyErrorCategory::Error,
                will_auto_retry: false,
                retry_wait_seconds: None,
                user_actionable: true,
            }
        } else if msg_lower.contains("500")
            || msg_lower.contains("502")
            || msg_lower.contains("503")
        {
            FriendlyError {
                message: "The service is temporarily unavailable.".to_string(),
                suggestion: "I'll try again in a moment.".to_string(),
                category: FriendlyErrorCategory::Temporary,
                will_auto_retry: true,
                retry_wait_seconds: Some(30),
                user_actionable: false,
            }
        } else if msg_lower.contains("timeout") {
            FriendlyError {
                message: "The service is taking too long to respond.".to_string(),
                suggestion: "I'll try again. This might be a temporary slowdown.".to_string(),
                category: FriendlyErrorCategory::Temporary,
                will_auto_retry: true,
                retry_wait_seconds: Some(5),
                user_actionable: false,
            }
        } else if msg_lower.contains("connection refused")
            || msg_lower.contains("econnrefused")
            || msg_lower.contains("network")
        {
            FriendlyError {
                message: "I couldn't connect to the service.".to_string(),
                suggestion: "Please check your internet connection.".to_string(),
                category: FriendlyErrorCategory::NeedsAction,
                will_auto_retry: true,
                retry_wait_seconds: Some(5),
                user_actionable: true,
            }
        } else {
            FriendlyError {
                message: "Something went wrong connecting to the service.".to_string(),
                suggestion: "I'll try again in a moment.".to_string(),
                category: FriendlyErrorCategory::Temporary,
                will_auto_retry: true,
                retry_wait_seconds: Some(3),
                user_actionable: false,
            }
        }
    }

    fn translate_ui_automation_error(&self, msg: &str) -> FriendlyError {
        let msg_lower = msg.to_lowercase();

        if msg_lower.contains("permission") || msg_lower.contains("accessibility") {
            FriendlyError {
                message: "I need permission to control the screen.".to_string(),
                suggestion: "Please enable Accessibility access in System Settings > Privacy & Security > Accessibility.".to_string(),
                category: FriendlyErrorCategory::NeedsAction,
                will_auto_retry: false,
                retry_wait_seconds: None,
                user_actionable: true,
            }
        } else if msg_lower.contains("not found") || msg_lower.contains("element") {
            FriendlyError {
                message: "I couldn't find what I was looking for on the screen.".to_string(),
                suggestion: "The application layout might have changed. Let me try again."
                    .to_string(),
                category: FriendlyErrorCategory::Temporary,
                will_auto_retry: true,
                retry_wait_seconds: Some(2),
                user_actionable: false,
            }
        } else {
            FriendlyError {
                message: "Something went wrong while interacting with the application.".to_string(),
                suggestion: "I'll try a different approach.".to_string(),
                category: FriendlyErrorCategory::Temporary,
                will_auto_retry: true,
                retry_wait_seconds: Some(2),
                user_actionable: false,
            }
        }
    }

    fn translate_email_tool_error(&self, msg: &str) -> FriendlyError {
        let msg_lower = msg.to_lowercase();

        if msg_lower.contains("auth") || msg_lower.contains("credential") {
            FriendlyError {
                message: "I couldn't access your email account.".to_string(),
                suggestion: "Please reconnect your email account in settings.".to_string(),
                category: FriendlyErrorCategory::NeedsAction,
                will_auto_retry: false,
                retry_wait_seconds: None,
                user_actionable: true,
            }
        } else if msg_lower.contains("send") || msg_lower.contains("delivery") {
            FriendlyError {
                message: "The email couldn't be sent.".to_string(),
                suggestion: "Please check the recipient address and try again.".to_string(),
                category: FriendlyErrorCategory::Error,
                will_auto_retry: false,
                retry_wait_seconds: None,
                user_actionable: true,
            }
        } else {
            FriendlyError {
                message: "Something went wrong with the email operation.".to_string(),
                suggestion: "Please try again or check your email settings.".to_string(),
                category: FriendlyErrorCategory::Temporary,
                will_auto_retry: true,
                retry_wait_seconds: Some(5),
                user_actionable: true,
            }
        }
    }

    fn translate_calendar_error(&self, msg: &str) -> FriendlyError {
        let msg_lower = msg.to_lowercase();

        if msg_lower.contains("auth") || msg_lower.contains("permission") {
            FriendlyError {
                message: "I couldn't access your calendar.".to_string(),
                suggestion: "Please reconnect your calendar account in settings.".to_string(),
                category: FriendlyErrorCategory::NeedsAction,
                will_auto_retry: false,
                retry_wait_seconds: None,
                user_actionable: true,
            }
        } else if msg_lower.contains("conflict") || msg_lower.contains("overlap") {
            FriendlyError {
                message: "There's a scheduling conflict.".to_string(),
                suggestion: "That time slot might already be taken. Would you like to choose a different time?".to_string(),
                category: FriendlyErrorCategory::NeedsAction,
                will_auto_retry: false,
                retry_wait_seconds: None,
                user_actionable: true,
            }
        } else {
            FriendlyError {
                message: "Something went wrong with the calendar operation.".to_string(),
                suggestion: "Please try again or check your calendar settings.".to_string(),
                category: FriendlyErrorCategory::Temporary,
                will_auto_retry: true,
                retry_wait_seconds: Some(3),
                user_actionable: true,
            }
        }
    }

    fn translate_cloud_error(&self, msg: &str) -> FriendlyError {
        let msg_lower = msg.to_lowercase();

        if msg_lower.contains("auth") || msg_lower.contains("sign in") {
            FriendlyError {
                message: "I couldn't access your cloud storage.".to_string(),
                suggestion: "Please reconnect your cloud account in settings.".to_string(),
                category: FriendlyErrorCategory::NeedsAction,
                will_auto_retry: false,
                retry_wait_seconds: None,
                user_actionable: true,
            }
        } else if msg_lower.contains("quota") || msg_lower.contains("full") {
            FriendlyError {
                message: "Your cloud storage is full.".to_string(),
                suggestion: "Please free up space in your cloud storage or upgrade your plan."
                    .to_string(),
                category: FriendlyErrorCategory::NeedsAction,
                will_auto_retry: false,
                retry_wait_seconds: None,
                user_actionable: true,
            }
        } else if msg_lower.contains("not found") {
            FriendlyError {
                message: "I couldn't find that file in your cloud storage.".to_string(),
                suggestion: "Please check if the file exists and you have access to it."
                    .to_string(),
                category: FriendlyErrorCategory::Error,
                will_auto_retry: false,
                retry_wait_seconds: None,
                user_actionable: true,
            }
        } else {
            FriendlyError {
                message: "Something went wrong with cloud storage.".to_string(),
                suggestion: "I'll try again in a moment.".to_string(),
                category: FriendlyErrorCategory::Temporary,
                will_auto_retry: true,
                retry_wait_seconds: Some(5),
                user_actionable: false,
            }
        }
    }

    fn translate_code_execution_error(&self, msg: &str) -> FriendlyError {
        let msg_lower = msg.to_lowercase();

        if msg_lower.contains("syntax") {
            FriendlyError {
                message: "There was an issue with the code I tried to run.".to_string(),
                suggestion: "I'll fix the issue and try again.".to_string(),
                category: FriendlyErrorCategory::Temporary,
                will_auto_retry: true,
                retry_wait_seconds: Some(1),
                user_actionable: false,
            }
        } else if msg_lower.contains("timeout") {
            FriendlyError {
                message: "The operation took too long.".to_string(),
                suggestion: "I'll try a more efficient approach.".to_string(),
                category: FriendlyErrorCategory::Temporary,
                will_auto_retry: true,
                retry_wait_seconds: Some(2),
                user_actionable: false,
            }
        } else if msg_lower.contains("memory") {
            FriendlyError {
                message: "The operation needed too much memory.".to_string(),
                suggestion: "I'll try processing in smaller chunks.".to_string(),
                category: FriendlyErrorCategory::Temporary,
                will_auto_retry: true,
                retry_wait_seconds: Some(2),
                user_actionable: false,
            }
        } else {
            FriendlyError {
                message: "Something went wrong running the operation.".to_string(),
                suggestion: "I'll try a different approach.".to_string(),
                category: FriendlyErrorCategory::Temporary,
                will_auto_retry: true,
                retry_wait_seconds: Some(2),
                user_actionable: false,
            }
        }
    }

    fn translate_ocr_error(&self, msg: &str) -> FriendlyError {
        let msg_lower = msg.to_lowercase();

        if msg_lower.contains("image") || msg_lower.contains("format") {
            FriendlyError {
                message: "I couldn't read that image.".to_string(),
                suggestion: "Please make sure the image is clear and in a supported format (PNG, JPG, etc.).".to_string(),
                category: FriendlyErrorCategory::Error,
                will_auto_retry: false,
                retry_wait_seconds: None,
                user_actionable: true,
            }
        } else if msg_lower.contains("text") || msg_lower.contains("empty") {
            FriendlyError {
                message: "I couldn't find any readable text in the image.".to_string(),
                suggestion: "Please provide a clearer image with visible text.".to_string(),
                category: FriendlyErrorCategory::Error,
                will_auto_retry: false,
                retry_wait_seconds: None,
                user_actionable: true,
            }
        } else {
            FriendlyError {
                message: "I had trouble reading the image.".to_string(),
                suggestion: "Please try with a different or clearer image.".to_string(),
                category: FriendlyErrorCategory::Error,
                will_auto_retry: false,
                retry_wait_seconds: None,
                user_actionable: true,
            }
        }
    }

    /// Translate tool not found errors
    /// CRITICAL: Never expose "MCP" to users - translate to friendly terms
    fn translate_tool_not_found(&self, tool: &str) -> FriendlyError {
        // Sanitize tool name - remove MCP prefixes and technical identifiers
        let friendly_tool_name = sanitize_tool_name(tool);

        FriendlyError {
            message: format!(
                "I don't have the ability to {} right now.",
                friendly_tool_name
            ),
            suggestion:
                "This feature might need to be set up first. Check the integrations settings."
                    .to_string(),
            category: FriendlyErrorCategory::Configuration,
            will_auto_retry: false,
            retry_wait_seconds: None,
            user_actionable: true,
        }
    }

    fn translate_invalid_params(&self, msg: &str) -> FriendlyError {
        FriendlyError {
            message: "I need more information to complete this task.".to_string(),
            suggestion: format!(
                "Could you provide more details? {}",
                simplify_param_error(msg)
            ),
            category: FriendlyErrorCategory::NeedsAction,
            will_auto_retry: false,
            retry_wait_seconds: None,
            user_actionable: true,
        }
    }

    /// Translate LLM errors to friendly messages
    fn translate_llm_error(&self, error: &LLMError) -> FriendlyError {
        match error {
            LLMError::RateLimitError(_) => FriendlyError {
                message: "I'm thinking too fast and need to slow down.".to_string(),
                suggestion: "I'll wait a moment and continue.".to_string(),
                category: FriendlyErrorCategory::Limit,
                will_auto_retry: true,
                retry_wait_seconds: Some(30),
                user_actionable: false,
            },
            LLMError::ContextLengthError(_) => FriendlyError {
                message: "There's too much information to process at once.".to_string(),
                suggestion: "I'll summarize and continue with the most important parts."
                    .to_string(),
                category: FriendlyErrorCategory::Temporary,
                will_auto_retry: true,
                retry_wait_seconds: Some(2),
                user_actionable: false,
            },
            LLMError::ContentFilterError(_) => FriendlyError {
                message: "I can't help with that particular request.".to_string(),
                suggestion: "Could you rephrase or try a different approach?".to_string(),
                category: FriendlyErrorCategory::Error,
                will_auto_retry: false,
                retry_wait_seconds: None,
                user_actionable: true,
            },
            LLMError::NetworkError(msg) => {
                let msg_lower = msg.to_lowercase();
                if msg_lower.contains("connection refused") || msg_lower.contains("econnrefused") {
                    FriendlyError {
                        message: "I couldn't connect to the AI service.".to_string(),
                        suggestion: "Please check your internet connection.".to_string(),
                        category: FriendlyErrorCategory::NeedsAction,
                        will_auto_retry: true,
                        retry_wait_seconds: Some(5),
                        user_actionable: true,
                    }
                } else {
                    FriendlyError {
                        message: "I'm having trouble connecting.".to_string(),
                        suggestion: "I'll try again in a moment.".to_string(),
                        category: FriendlyErrorCategory::Temporary,
                        will_auto_retry: true,
                        retry_wait_seconds: Some(3),
                        user_actionable: false,
                    }
                }
            }
            LLMError::ModelNotAvailable(_) => FriendlyError {
                message: "The AI model I need isn't available right now.".to_string(),
                suggestion: "I'll use an alternative approach.".to_string(),
                category: FriendlyErrorCategory::Temporary,
                will_auto_retry: true,
                retry_wait_seconds: Some(5),
                user_actionable: false,
            },
            LLMError::AuthenticationError(_) => FriendlyError {
                message: "There's an issue with your API access.".to_string(),
                suggestion: "Please check your subscription status or API settings.".to_string(),
                category: FriendlyErrorCategory::NeedsAction,
                will_auto_retry: false,
                retry_wait_seconds: None,
                user_actionable: true,
            },
            LLMError::Timeout(_) => FriendlyError {
                message: "My thinking took too long.".to_string(),
                suggestion: "I'll try again with a simpler approach.".to_string(),
                category: FriendlyErrorCategory::Temporary,
                will_auto_retry: true,
                retry_wait_seconds: Some(3),
                user_actionable: false,
            },
            LLMError::ApiError(msg) | LLMError::InvalidResponse(msg) => {
                self.translate_api_error(msg)
            }
        }
    }

    /// Translate resource errors to friendly messages
    fn translate_resource_error(&self, error: &ResourceError) -> FriendlyError {
        match error {
            ResourceError::CpuLimitExceeded(_) => FriendlyError {
                message: "Your computer is working hard right now.".to_string(),
                suggestion: "I'll slow down to keep things running smoothly.".to_string(),
                category: FriendlyErrorCategory::Limit,
                will_auto_retry: true,
                retry_wait_seconds: Some(10),
                user_actionable: false,
            },
            ResourceError::MemoryLimitExceeded(_) => FriendlyError {
                message: "Running low on memory.".to_string(),
                suggestion:
                    "I'll work with smaller chunks of data. Consider closing other apps if needed."
                        .to_string(),
                category: FriendlyErrorCategory::Limit,
                will_auto_retry: true,
                retry_wait_seconds: Some(5),
                user_actionable: true,
            },
            ResourceError::NetworkLimitExceeded(_) => FriendlyError {
                message: "Using a lot of network bandwidth.".to_string(),
                suggestion: "I'll pace the requests to avoid overload.".to_string(),
                category: FriendlyErrorCategory::Limit,
                will_auto_retry: true,
                retry_wait_seconds: Some(10),
                user_actionable: false,
            },
            ResourceError::StorageLimitExceeded(_) => FriendlyError {
                message: "Running out of storage space.".to_string(),
                suggestion: "Please free up some disk space to continue.".to_string(),
                category: FriendlyErrorCategory::NeedsAction,
                will_auto_retry: false,
                retry_wait_seconds: None,
                user_actionable: true,
            },
            ResourceError::ConcurrencyLimitExceeded(_) => FriendlyError {
                message: "Too many things happening at once.".to_string(),
                suggestion: "I'll wait for some tasks to complete before continuing.".to_string(),
                category: FriendlyErrorCategory::Limit,
                will_auto_retry: true,
                retry_wait_seconds: Some(3),
                user_actionable: false,
            },
        }
    }

    fn translate_transient_error(&self, msg: &str) -> FriendlyError {
        let friendly_msg = sanitize_technical_message(msg);

        FriendlyError {
            message: format!("Something temporary went wrong: {}", friendly_msg),
            suggestion: "I'll try again in a moment.".to_string(),
            category: FriendlyErrorCategory::Temporary,
            will_auto_retry: true,
            retry_wait_seconds: Some(2),
            user_actionable: false,
        }
    }

    fn translate_timeout_error(&self, _msg: &str) -> FriendlyError {
        FriendlyError {
            message: "The operation took too long.".to_string(),
            suggestion: "I'll try again. If this keeps happening, the service might be slow."
                .to_string(),
            category: FriendlyErrorCategory::Temporary,
            will_auto_retry: true,
            retry_wait_seconds: Some(5),
            user_actionable: false,
        }
    }

    fn translate_permission_error(&self, msg: &str) -> FriendlyError {
        let msg_lower = msg.to_lowercase();

        if msg_lower.contains("accessibility") {
            FriendlyError {
                message: "I need Accessibility permission to control the screen.".to_string(),
                suggestion:
                    "Please enable it in System Settings > Privacy & Security > Accessibility."
                        .to_string(),
                category: FriendlyErrorCategory::NeedsAction,
                will_auto_retry: false,
                retry_wait_seconds: None,
                user_actionable: true,
            }
        } else if msg_lower.contains("screen") || msg_lower.contains("recording") {
            FriendlyError {
                message: "I need Screen Recording permission to see what's on screen.".to_string(),
                suggestion:
                    "Please enable it in System Settings > Privacy & Security > Screen Recording."
                        .to_string(),
                category: FriendlyErrorCategory::NeedsAction,
                will_auto_retry: false,
                retry_wait_seconds: None,
                user_actionable: true,
            }
        } else if msg_lower.contains("file") || msg_lower.contains("folder") {
            FriendlyError {
                message: "I need permission to access files.".to_string(),
                suggestion: "Please grant file access when prompted.".to_string(),
                category: FriendlyErrorCategory::NeedsAction,
                will_auto_retry: false,
                retry_wait_seconds: None,
                user_actionable: true,
            }
        } else {
            FriendlyError {
                message: "I need your permission to continue.".to_string(),
                suggestion: "Please check your system permissions and try again.".to_string(),
                category: FriendlyErrorCategory::NeedsAction,
                will_auto_retry: false,
                retry_wait_seconds: None,
                user_actionable: true,
            }
        }
    }

    fn translate_config_error(&self, msg: &str) -> FriendlyError {
        let msg_lower = msg.to_lowercase();

        if msg_lower.contains("api key") || msg_lower.contains("apikey") {
            FriendlyError {
                message: "Your API key isn't working.".to_string(),
                suggestion: "Would you like to update it in settings?".to_string(),
                category: FriendlyErrorCategory::Configuration,
                will_auto_retry: false,
                retry_wait_seconds: None,
                user_actionable: true,
            }
        } else if msg_lower.contains("invalid") {
            FriendlyError {
                message: "There's a configuration issue.".to_string(),
                suggestion: "Please check your settings.".to_string(),
                category: FriendlyErrorCategory::Configuration,
                will_auto_retry: false,
                retry_wait_seconds: None,
                user_actionable: true,
            }
        } else {
            let friendly_msg = sanitize_technical_message(msg);
            FriendlyError {
                message: format!("Configuration problem: {}", friendly_msg),
                suggestion: "Please check your settings.".to_string(),
                category: FriendlyErrorCategory::Configuration,
                will_auto_retry: false,
                retry_wait_seconds: None,
                user_actionable: true,
            }
        }
    }

    fn translate_fatal_error(&self, msg: &str) -> FriendlyError {
        let friendly_msg = sanitize_technical_message(msg);

        FriendlyError {
            message: format!("Something unexpected happened: {}", friendly_msg),
            suggestion: "If this keeps happening, please restart the app or contact support."
                .to_string(),
            category: FriendlyErrorCategory::Error,
            will_auto_retry: false,
            retry_wait_seconds: None,
            user_actionable: true,
        }
    }

    fn translate_planning_error(&self, _msg: &str) -> FriendlyError {
        FriendlyError {
            message: "I'm having trouble figuring out how to do this.".to_string(),
            suggestion: "Could you try explaining what you need in a different way?".to_string(),
            category: FriendlyErrorCategory::NeedsAction,
            will_auto_retry: false,
            retry_wait_seconds: None,
            user_actionable: true,
        }
    }

    fn translate_command_timeout(&self, _msg: &str) -> FriendlyError {
        FriendlyError {
            message: "A command took too long to complete.".to_string(),
            suggestion: "I'll try a faster approach.".to_string(),
            category: FriendlyErrorCategory::Temporary,
            will_auto_retry: true,
            retry_wait_seconds: Some(3),
            user_actionable: false,
        }
    }

    fn translate_email_send_error(&self, _msg: &str) -> FriendlyError {
        FriendlyError {
            message: "The email couldn't be sent.".to_string(),
            suggestion: "Please check the recipient address and your email settings.".to_string(),
            category: FriendlyErrorCategory::Error,
            will_auto_retry: false,
            retry_wait_seconds: None,
            user_actionable: true,
        }
    }

    fn translate_email_parse_error(&self, _msg: &str) -> FriendlyError {
        FriendlyError {
            message: "I had trouble reading that email.".to_string(),
            suggestion: "The email format might be unusual. Please try a different email."
                .to_string(),
            category: FriendlyErrorCategory::Error,
            will_auto_retry: false,
            retry_wait_seconds: None,
            user_actionable: true,
        }
    }

    fn translate_invalid_path_error(&self, msg: &str) -> FriendlyError {
        let friendly_msg = sanitize_technical_message(msg);

        FriendlyError {
            message: format!("That file path isn't valid: {}", friendly_msg),
            suggestion: "Please check the path and try again.".to_string(),
            category: FriendlyErrorCategory::Error,
            will_auto_retry: false,
            retry_wait_seconds: None,
            user_actionable: true,
        }
    }

    fn translate_provider_error(&self, msg: &str) -> FriendlyError {
        let msg_lower = msg.to_lowercase();

        if msg_lower.contains("unavailable") || msg_lower.contains("down") {
            FriendlyError {
                message: "The AI service is temporarily unavailable.".to_string(),
                suggestion: "I'll try again in a moment.".to_string(),
                category: FriendlyErrorCategory::Temporary,
                will_auto_retry: true,
                retry_wait_seconds: Some(30),
                user_actionable: false,
            }
        } else {
            FriendlyError {
                message: "There's an issue with the AI service.".to_string(),
                suggestion: "I'll try an alternative or wait and retry.".to_string(),
                category: FriendlyErrorCategory::Temporary,
                will_auto_retry: true,
                retry_wait_seconds: Some(10),
                user_actionable: false,
            }
        }
    }

    fn translate_http_error(&self, msg: &str) -> FriendlyError {
        self.translate_api_error(msg)
    }

    fn translate_generic_error(&self, msg: &str) -> FriendlyError {
        let friendly_msg = sanitize_technical_message(msg);

        FriendlyError {
            message: format!("Something went wrong: {}", friendly_msg),
            suggestion: "Please try again. If the problem persists, contact support.".to_string(),
            category: FriendlyErrorCategory::Error,
            will_auto_retry: false,
            retry_wait_seconds: None,
            user_actionable: true,
        }
    }
}

impl Default for ErrorTranslator {
    fn default() -> Self {
        Self::new()
    }
}

/// Sanitize tool names to remove MCP prefixes and technical identifiers
/// CRITICAL: MCP must never be shown to users
fn sanitize_tool_name(tool: &str) -> Cow<'_, str> {
    // Remove MCP tool ID format: mcp__servername__toolname
    if tool.starts_with("mcp__") {
        if let Some(rest) = tool.strip_prefix("mcp__") {
            // Extract just the tool name (after the second __)
            if let Some((_server, tool_name)) = rest.split_once("__") {
                return Cow::Owned(humanize_tool_name(tool_name));
            }
        }
    }

    // Remove other technical prefixes
    let cleaned = tool
        .trim_start_matches("tool_")
        .trim_start_matches("mcp_")
        .trim_start_matches("internal_");

    Cow::Owned(humanize_tool_name(cleaned))
}

/// Convert snake_case tool names to human-readable format
fn humanize_tool_name(name: &str) -> String {
    name.replace(['_', '-'], " ")
}

/// Remove technical jargon from error messages
/// CRITICAL: Never expose MCP, stack traces, or error codes
fn sanitize_technical_message(msg: &str) -> String {
    let mut result = msg.to_string();

    // Remove MCP references (case insensitive)
    let patterns_to_remove = [
        "MCP",
        "mcp",
        "Mcp",
        "mcp__",
        "McpError",
        "McpError::",
        "RMCP",
        "rmcp",
    ];

    for pattern in &patterns_to_remove {
        result = result.replace(pattern, "");
    }

    // Remove technical patterns
    result = remove_stack_traces(&result);
    result = remove_error_codes(&result);
    result = remove_rust_error_types(&result);

    // Clean up whitespace
    result = result
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string();

    // Ensure first letter is capitalized
    if let Some(first_char) = result.chars().next() {
        if first_char.is_lowercase() {
            result = format!(
                "{}{}",
                first_char.to_uppercase(),
                result.chars().skip(1).collect::<String>()
            );
        }
    }

    // Provide a generic message if everything was removed
    if result.is_empty() || result.len() < 5 {
        return "An issue occurred".to_string();
    }

    result
}

/// Remove stack traces from error messages
fn remove_stack_traces(msg: &str) -> String {
    let mut result = String::new();
    let mut skip_until_newline = false;

    for line in msg.lines() {
        let trimmed = line.trim();

        // Skip lines that look like stack traces
        if trimmed.starts_with("at ")
            || trimmed.starts_with("in ")
            || trimmed.contains("::main")
            || trimmed.contains("::run")
            || trimmed.contains(".rs:")
            || trimmed.starts_with("0x")
            || trimmed.starts_with("stack backtrace")
        {
            skip_until_newline = true;
            continue;
        }

        if skip_until_newline && trimmed.is_empty() {
            skip_until_newline = false;
            continue;
        }

        if !skip_until_newline {
            if !result.is_empty() {
                result.push(' ');
            }
            result.push_str(trimmed);
        }
    }

    result
}

/// Remove error codes and technical identifiers
fn remove_error_codes(msg: &str) -> String {
    // Remove common error code patterns
    let mut result = msg.to_string();

    // Remove patterns like "error[E0001]" or "(code: 123)"
    let code_patterns = [
        r"error\[E\d+\]",
        r"\(code:\s*\d+\)",
        r"errno:\s*\d+",
        r"os error \d+",
    ];

    for pattern in &code_patterns {
        if let Ok(re) = regex::Regex::new(pattern) {
            result = re.replace_all(&result, "").to_string();
        }
    }

    result
}

/// Remove Rust-specific error type names
fn remove_rust_error_types(msg: &str) -> String {
    let mut result = msg.to_string();

    let rust_patterns = [
        "std::io::Error",
        "reqwest::Error",
        "serde_json::Error",
        "tokio::time::error::Elapsed",
        "anyhow::Error",
        "Box<dyn Error>",
        "thiserror::Error",
    ];

    for pattern in &rust_patterns {
        result = result.replace(pattern, "");
    }

    result
}

/// Simplify parameter validation error messages
fn simplify_param_error(msg: &str) -> String {
    let msg_lower = msg.to_lowercase();

    if msg_lower.contains("missing") {
        if let Some(field) = extract_field_name(msg) {
            return format!("Please provide the {}.", humanize_tool_name(&field));
        }
        return "Some required information is missing.".to_string();
    }

    if msg_lower.contains("invalid") {
        if let Some(field) = extract_field_name(msg) {
            return format!("Please check the {} value.", humanize_tool_name(&field));
        }
        return "Please check the provided values.".to_string();
    }

    "Please check your input.".to_string()
}

/// Try to extract a field name from an error message
fn extract_field_name(msg: &str) -> Option<String> {
    // Look for patterns like "field `name`" or "`name` is required"
    // Only match when field name is explicitly marked with backticks or quotes
    let patterns = [
        r"missing field `([a-zA-Z_]+)`",
        r"field `([a-zA-Z_]+)`",
        r"`([a-zA-Z_]+)` is required",
        r"'([a-zA-Z_]+)' is required",
    ];

    for pattern in &patterns {
        if let Ok(re) = regex::Regex::new(pattern) {
            if let Some(caps) = re.captures(msg) {
                if let Some(m) = caps.get(1) {
                    return Some(m.as_str().to_string());
                }
            }
        }
    }

    None
}

/// Translate MCP-specific errors to user-friendly messages
/// CRITICAL: Never expose "MCP" to users
pub fn translate_mcp_error(error: &str) -> FriendlyError {
    let error_lower = error.to_lowercase();

    if error_lower.contains("server not found") || error_lower.contains("servernotfound") {
        FriendlyError {
            message: "A required service isn't set up yet.".to_string(),
            suggestion: "Check your integrations in settings.".to_string(),
            category: FriendlyErrorCategory::Configuration,
            will_auto_retry: false,
            retry_wait_seconds: None,
            user_actionable: true,
        }
    } else if error_lower.contains("tool not found") || error_lower.contains("toolnotfound") {
        FriendlyError {
            message: "I don't have that capability available right now.".to_string(),
            suggestion: "This feature might need to be enabled in settings.".to_string(),
            category: FriendlyErrorCategory::Configuration,
            will_auto_retry: false,
            retry_wait_seconds: None,
            user_actionable: true,
        }
    } else if error_lower.contains("connection")
        || error_lower.contains("connect")
        || error_lower.contains("connectionerror")
    {
        FriendlyError {
            message: "A service I need couldn't be reached.".to_string(),
            suggestion: "I'll restart it automatically and try again.".to_string(),
            category: FriendlyErrorCategory::Temporary,
            will_auto_retry: true,
            retry_wait_seconds: Some(5),
            user_actionable: false,
        }
    } else if error_lower.contains("timeout") || error_lower.contains("timed out") {
        FriendlyError {
            message: "A service is taking too long to respond.".to_string(),
            suggestion: "I'll restart it and try again.".to_string(),
            category: FriendlyErrorCategory::Temporary,
            will_auto_retry: true,
            retry_wait_seconds: Some(5),
            user_actionable: false,
        }
    } else if error_lower.contains("execution")
        || error_lower.contains("toolexecutionerror")
        || error_lower.contains("crashed")
    {
        FriendlyError {
            message: "A tool stopped working unexpectedly.".to_string(),
            suggestion: "I'll restart it for you.".to_string(),
            category: FriendlyErrorCategory::Temporary,
            will_auto_retry: true,
            retry_wait_seconds: Some(3),
            user_actionable: false,
        }
    } else if error_lower.contains("invalid config") || error_lower.contains("invalidconfig") {
        FriendlyError {
            message: "There's an issue with a service configuration.".to_string(),
            suggestion: "Please check your integration settings.".to_string(),
            category: FriendlyErrorCategory::Configuration,
            will_auto_retry: false,
            retry_wait_seconds: None,
            user_actionable: true,
        }
    } else {
        // Generic MCP error - still don't expose "MCP"
        let sanitized = sanitize_technical_message(error);
        FriendlyError {
            message: format!("Something went wrong: {}", sanitized),
            suggestion: "I'll try to recover automatically.".to_string(),
            category: FriendlyErrorCategory::Temporary,
            will_auto_retry: true,
            retry_wait_seconds: Some(3),
            user_actionable: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_mcp_tool_name() {
        assert_eq!(
            sanitize_tool_name("mcp__filesystem__read_file").as_ref(),
            "read file"
        );
        assert_eq!(
            sanitize_tool_name("mcp__gmail__send_email").as_ref(),
            "send email"
        );
        assert_eq!(sanitize_tool_name("tool_browse_web").as_ref(), "browse web");
        assert_eq!(sanitize_tool_name("regular_tool").as_ref(), "regular tool");
    }

    #[test]
    fn test_sanitize_technical_message() {
        let msg = "MCP server crashed: McpError::ConnectionError";
        let result = sanitize_technical_message(msg);
        assert!(!result.contains("MCP"));
        assert!(!result.contains("McpError"));
    }

    #[test]
    fn test_translate_mcp_error_hides_mcp() {
        let error = "McpError::ServerNotFound: mcp server 'filesystem' not found";
        let friendly = translate_mcp_error(error);
        assert!(!friendly.message.contains("MCP"));
        assert!(!friendly.message.contains("mcp"));
        assert!(!friendly.suggestion.contains("MCP"));
    }

    #[test]
    fn test_translate_browser_error() {
        let translator = ErrorTranslator::new();

        let error = AGIError::ToolError(ToolError::BrowserError(
            "element not found: #submit-button".to_string(),
        ));
        let friendly = translator.translate(&error);

        assert!(friendly.message.contains("find"));
        assert!(friendly.will_auto_retry);
        assert!(!friendly.user_actionable);
    }

    #[test]
    fn test_translate_permission_error() {
        let translator = ErrorTranslator::new();

        let error = AGIError::PermissionError("Accessibility permission required".to_string());
        let friendly = translator.translate(&error);

        assert!(friendly.message.contains("Accessibility"));
        assert!(friendly.suggestion.contains("System Settings"));
        assert!(!friendly.will_auto_retry);
        assert!(friendly.user_actionable);
    }

    #[test]
    fn test_translate_rate_limit_error() {
        let translator = ErrorTranslator::new();

        let error = AGIError::LLMError(LLMError::RateLimitError(
            "429 Too Many Requests".to_string(),
        ));
        let friendly = translator.translate(&error);

        assert_eq!(friendly.category, FriendlyErrorCategory::Limit);
        assert!(friendly.will_auto_retry);
        assert!(friendly.retry_wait_seconds.is_some());
    }

    #[test]
    fn test_translate_connection_refused() {
        let translator = ErrorTranslator::new();

        let error = AGIError::LLMError(LLMError::NetworkError("Connection refused".to_string()));
        let friendly = translator.translate(&error);

        assert!(friendly.message.contains("connect"));
        assert!(friendly.suggestion.contains("internet"));
    }

    #[test]
    fn test_translate_api_key_error() {
        let translator = ErrorTranslator::new();

        let error = AGIError::ConfigurationError("Invalid API key".to_string());
        let friendly = translator.translate(&error);

        assert!(friendly.message.contains("API key"));
        assert!(friendly.user_actionable);
    }

    #[test]
    fn test_friendly_error_category_from_error_category() {
        assert_eq!(
            FriendlyErrorCategory::from(ErrorCategory::Transient),
            FriendlyErrorCategory::Temporary
        );
        assert_eq!(
            FriendlyErrorCategory::from(ErrorCategory::Permission),
            FriendlyErrorCategory::NeedsAction
        );
        assert_eq!(
            FriendlyErrorCategory::from(ErrorCategory::ResourceLimit),
            FriendlyErrorCategory::Limit
        );
    }

    #[test]
    fn test_extract_field_name() {
        assert_eq!(
            extract_field_name("field 'email' is required"),
            Some("email".to_string())
        );
        assert_eq!(
            extract_field_name("missing field `recipient`"),
            Some("recipient".to_string())
        );
        assert_eq!(extract_field_name("no field name here"), None);
    }

    #[test]
    fn test_remove_stack_traces() {
        let msg = "Error occurred\nat src/main.rs:42\nat src/lib.rs:100\nDetails here";
        let result = remove_stack_traces(msg);
        assert!(!result.contains("src/main.rs"));
        assert!(result.contains("Error occurred"));
    }

    #[test]
    fn test_tool_not_found_hides_mcp_prefix() {
        let translator = ErrorTranslator::new();

        let error = AGIError::ToolError(ToolError::NotFound(
            "mcp__filesystem__read_directory".to_string(),
        ));
        let friendly = translator.translate(&error);

        assert!(!friendly.message.contains("mcp"));
        assert!(!friendly.message.contains("MCP"));
        assert!(friendly.message.contains("read directory"));
    }
}
