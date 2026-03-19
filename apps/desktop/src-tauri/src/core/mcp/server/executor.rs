use async_trait::async_trait;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::time::Duration;
use tauri::{AppHandle, Manager};

use crate::sys::commands::agi::{self, SpawnAgentRequest};
use crate::sys::commands::chat::ChatSendMessageRequest;
use crate::sys::commands::research::{ResearchModeInput, ResearchRequest};

const MCP_SERVER_USER_ID: &str = "mcp-server";
const DEFAULT_BASH_TIMEOUT_SECS: u64 = 30;
const MAX_BASH_TIMEOUT_SECS: u64 = 300;
const DEFAULT_AGENT_TIMEOUT_SECS: u64 = 300;

#[derive(Debug, Clone)]
pub struct McpServerToolOutcome {
    pub text: String,
    pub structured_content: Option<Value>,
    pub is_error: bool,
}

impl McpServerToolOutcome {
    pub fn success(text: String, structured_content: Option<Value>) -> Self {
        Self {
            text,
            structured_content,
            is_error: false,
        }
    }

    pub fn error(text: String, structured_content: Option<Value>) -> Self {
        Self {
            text,
            structured_content,
            is_error: true,
        }
    }

    pub fn into_json(self) -> Value {
        let mut result = json!({
            "content": [{
                "type": "text",
                "text": self.text
            }],
            "isError": self.is_error
        });

        if let Some(structured_content) = self.structured_content {
            result["structuredContent"] = structured_content;
        }

        result
    }
}

#[async_trait]
pub trait McpServerExecutor: Send + Sync {
    async fn execute_tool(
        &self,
        tool_name: &str,
        arguments: HashMap<String, Value>,
    ) -> Result<McpServerToolOutcome, String>;
}

pub struct DesktopMcpServerExecutor {
    app_handle: AppHandle,
}

impl DesktopMcpServerExecutor {
    pub fn new(app_handle: AppHandle) -> Self {
        Self { app_handle }
    }

    fn serialization_value<T: Serialize>(&self, value: &T) -> Value {
        serde_json::to_value(value).unwrap_or_else(|_| json!({}))
    }

    fn outcome_from_error(&self, message: impl Into<String>) -> McpServerToolOutcome {
        McpServerToolOutcome::error(message.into(), None)
    }

    fn require_string_argument(
        &self,
        arguments: &HashMap<String, Value>,
        key: &str,
    ) -> Result<String, McpServerToolOutcome> {
        let value = arguments
            .get(key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned);

        value.ok_or_else(|| {
            self.outcome_from_error(format!("Missing required string argument '{}'.", key))
        })
    }

    fn optional_string_argument(
        &self,
        arguments: &HashMap<String, Value>,
        key: &str,
    ) -> Option<String> {
        arguments
            .get(key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
    }

    fn optional_u64_argument(
        &self,
        arguments: &HashMap<String, Value>,
        key: &str,
    ) -> Result<Option<u64>, McpServerToolOutcome> {
        let Some(value) = arguments.get(key) else {
            return Ok(None);
        };

        if let Some(integer) = value.as_u64() {
            return Ok(Some(integer));
        }

        Err(self.outcome_from_error(format!(
            "Argument '{}' must be a non-negative integer.",
            key
        )))
    }

    async fn execute_chat(
        &self,
        arguments: HashMap<String, Value>,
    ) -> Result<McpServerToolOutcome, String> {
        let message = match self.require_string_argument(&arguments, "message") {
            Ok(message) => message,
            Err(outcome) => return Ok(outcome),
        };

        let model = self
            .optional_string_argument(&arguments, "model")
            .unwrap_or_else(|| "auto".to_string());
        let system_prompt = self.optional_string_argument(&arguments, "system_prompt");
        let explicit_model_selection = model != "auto";

        let request = ChatSendMessageRequest {
            conversation_id: None,
            user_id: MCP_SERVER_USER_ID.to_string(),
            content: message,
            provider: None,
            model: Some(model),
            provider_override: None,
            model_override: None,
            strategy: None,
            stream: Some(false),
            enable_tools: Some(false),
            conversation_mode: None,
            workflow_hash: None,
            task_metadata: None,
            focus_mode: None,
            research_task_id: None,
            attachments: None,
            thinking_mode: None,
            thinking_budget: None,
            reasoning_effort: None,
            output_config: None,
            temperature: None,
            max_output_tokens: None,
            enable_agent_mode: Some(false),
            prefer_cloud_credits: false,
            frontend_message_id: None,
            custom_instructions: system_prompt,
            project_folder: None,
            model_capabilities: None,
            incognito: Some(true),
            auto_inject_skills: Some(false),
            is_explicit_model_selection: Some(explicit_model_selection),
        };

        let response = crate::sys::commands::chat_send_message(
            self.app_handle
                .try_state::<crate::sys::commands::AppDatabase>()
                .ok_or_else(|| "AppDatabase state unavailable".to_string())?,
            self.app_handle
                .try_state::<crate::sys::commands::LLMState>()
                .ok_or_else(|| "LLMState unavailable".to_string())?,
            self.app_handle
                .try_state::<crate::sys::commands::settings::SettingsState>()
                .ok_or_else(|| "SettingsState unavailable".to_string())?,
            self.app_handle
                .try_state::<crate::sys::billing::BillingStateWrapper>()
                .ok_or_else(|| "BillingState unavailable".to_string())?,
            self.app_handle
                .try_state::<crate::sys::commands::mcp::McpState>()
                .ok_or_else(|| "McpState unavailable".to_string())?,
            self.app_handle
                .try_state::<crate::sys::commands::project_context::ProjectContextState>()
                .ok_or_else(|| "ProjectContextState unavailable".to_string())?,
            self.app_handle
                .try_state::<crate::sys::commands::memory::MemoryState>()
                .ok_or_else(|| "MemoryState unavailable".to_string())?,
            self.app_handle
                .try_state::<crate::sys::commands::research::ResearchState>()
                .ok_or_else(|| "ResearchState unavailable".to_string())?,
            self.app_handle.clone(),
            request,
        )
        .await;

        match response {
            Ok(response) => {
                let structured = self.serialization_value(&response);
                let text = structured["assistant_message"]["content"]
                    .as_str()
                    .unwrap_or_default()
                    .to_string();
                Ok(McpServerToolOutcome::success(text, Some(structured)))
            }
            Err(error) => Ok(self.outcome_from_error(error)),
        }
    }

    async fn execute_skill(
        &self,
        arguments: HashMap<String, Value>,
    ) -> Result<McpServerToolOutcome, String> {
        let skill_name = match self.require_string_argument(&arguments, "skill_name") {
            Ok(skill_name) => skill_name,
            Err(outcome) => return Ok(outcome),
        };
        let input = match self.require_string_argument(&arguments, "input") {
            Ok(input) => input,
            Err(outcome) => return Ok(outcome),
        };

        let invocation = match crate::sys::commands::skill_invoke(
            self.app_handle
                .try_state::<crate::sys::commands::skills::SkillsState>()
                .ok_or_else(|| "SkillsState unavailable".to_string())?,
            skill_name.clone(),
            input.clone(),
        ) {
            Ok(invocation) => invocation,
            Err(error) => return Ok(self.outcome_from_error(error)),
        };

        let custom_instructions = format!(
            "{}\n\nSkill context mode: {}\nAllowed tools: {}",
            invocation.instructions,
            invocation.context_mode,
            if invocation.allowed_tools.is_empty() {
                "none".to_string()
            } else {
                invocation.allowed_tools.join(", ")
            }
        );

        let request = ChatSendMessageRequest {
            conversation_id: None,
            user_id: MCP_SERVER_USER_ID.to_string(),
            content: input,
            provider: None,
            model: Some("auto".to_string()),
            provider_override: None,
            model_override: None,
            strategy: None,
            stream: Some(false),
            enable_tools: Some(!invocation.allowed_tools.is_empty()),
            conversation_mode: None,
            workflow_hash: None,
            task_metadata: None,
            focus_mode: None,
            research_task_id: None,
            attachments: None,
            thinking_mode: None,
            thinking_budget: None,
            reasoning_effort: None,
            output_config: None,
            temperature: None,
            max_output_tokens: None,
            enable_agent_mode: Some(false),
            prefer_cloud_credits: false,
            frontend_message_id: None,
            custom_instructions: Some(custom_instructions),
            project_folder: None,
            model_capabilities: None,
            incognito: Some(true),
            auto_inject_skills: Some(false),
            is_explicit_model_selection: Some(false),
        };

        let response = crate::sys::commands::chat_send_message(
            self.app_handle
                .try_state::<crate::sys::commands::AppDatabase>()
                .ok_or_else(|| "AppDatabase state unavailable".to_string())?,
            self.app_handle
                .try_state::<crate::sys::commands::LLMState>()
                .ok_or_else(|| "LLMState unavailable".to_string())?,
            self.app_handle
                .try_state::<crate::sys::commands::settings::SettingsState>()
                .ok_or_else(|| "SettingsState unavailable".to_string())?,
            self.app_handle
                .try_state::<crate::sys::billing::BillingStateWrapper>()
                .ok_or_else(|| "BillingState unavailable".to_string())?,
            self.app_handle
                .try_state::<crate::sys::commands::mcp::McpState>()
                .ok_or_else(|| "McpState unavailable".to_string())?,
            self.app_handle
                .try_state::<crate::sys::commands::project_context::ProjectContextState>()
                .ok_or_else(|| "ProjectContextState unavailable".to_string())?,
            self.app_handle
                .try_state::<crate::sys::commands::memory::MemoryState>()
                .ok_or_else(|| "MemoryState unavailable".to_string())?,
            self.app_handle
                .try_state::<crate::sys::commands::research::ResearchState>()
                .ok_or_else(|| "ResearchState unavailable".to_string())?,
            self.app_handle.clone(),
            request,
        )
        .await;

        match response {
            Ok(response) => {
                let structured = json!({
                    "invocation": self.serialization_value(&invocation),
                    "response": self.serialization_value(&response),
                });
                let text = structured["response"]["assistant_message"]["content"]
                    .as_str()
                    .unwrap_or_default()
                    .to_string();
                Ok(McpServerToolOutcome::success(text, Some(structured)))
            }
            Err(error) => Ok(self.outcome_from_error(error)),
        }
    }

    async fn execute_bash(
        &self,
        arguments: HashMap<String, Value>,
    ) -> Result<McpServerToolOutcome, String> {
        let command = match self.require_string_argument(&arguments, "command") {
            Ok(command) => command,
            Err(outcome) => return Ok(outcome),
        };

        let timeout_secs = match self.optional_u64_argument(&arguments, "timeout_secs") {
            Ok(Some(timeout_secs)) => timeout_secs.min(MAX_BASH_TIMEOUT_SECS),
            Ok(None) => DEFAULT_BASH_TIMEOUT_SECS,
            Err(outcome) => return Ok(outcome),
        };

        // SECURITY: Validate command through ToolGuard before execution.
        // MCP bash commands from external clients must go through the same
        // approval workflow that protects direct user interactions.
        {
            if let Some(confirmation_state) = self
                .app_handle
                .try_state::<crate::sys::commands::tool_confirmation::ToolConfirmationState>(
                )
            {
                let guard = confirmation_state.tool_guard();
                let params = json!({"command": command});
                if let Err(e) = guard.validate_tool_call("terminal_execute", &params).await {
                    tracing::warn!(
                        "[SECURITY][MCP] ToolGuard rejected bash command: {}",
                        e
                    );
                    return Ok(self.outcome_from_error(format!(
                        "Bash command rejected by ToolGuard: {}",
                        e
                    )));
                }
            } else {
                tracing::error!(
                    "[SECURITY][MCP] ToolConfirmationState not available — \
                     DENYING bash execution. Security state must be initialized."
                );
                return Ok(self.outcome_from_error(
                    "Bash execution denied: security validation unavailable. Please restart the application.".to_string()
                ));
            }
        }

        let result = crate::sys::commands::execute_terminal_command(
            self.app_handle.clone(),
            command.clone(),
            None,
            None,
            None,
            Some(false),
            Some(timeout_secs * 1000),
        )
        .await;

        match result {
            Ok(result) => {
                let structured = self.serialization_value(&result);
                let stdout = structured["stdout"].as_str().unwrap_or_default().trim();
                let stderr = structured["stderr"].as_str().unwrap_or_default().trim();
                let exit_code = structured["exitCode"].as_i64().unwrap_or(-1);

                let text = if !stdout.is_empty() {
                    stdout.to_string()
                } else if !stderr.is_empty() {
                    stderr.to_string()
                } else {
                    format!("Command finished with exit code {}.", exit_code)
                };

                Ok(McpServerToolOutcome::success(
                    text,
                    Some(json!({
                        "command": command,
                        "timeoutSecs": timeout_secs,
                        "result": structured,
                    })),
                ))
            }
            Err(error) => Ok(self.outcome_from_error(error)),
        }
    }

    async fn execute_research(
        &self,
        arguments: HashMap<String, Value>,
    ) -> Result<McpServerToolOutcome, String> {
        let query = match self.require_string_argument(&arguments, "query") {
            Ok(query) => query,
            Err(outcome) => return Ok(outcome),
        };

        let depth = self
            .optional_string_argument(&arguments, "depth")
            .unwrap_or_else(|| "quick".to_string());
        let mode = match depth.as_str() {
            "quick" => ResearchModeInput::Quick,
            "thorough" => ResearchModeInput::Deep,
            _ => return Ok(self.outcome_from_error("depth must be either 'quick' or 'thorough'.")),
        };

        let response = crate::sys::commands::research_start(
            self.app_handle.clone(),
            self.app_handle
                .try_state::<crate::sys::commands::research::ResearchState>()
                .ok_or_else(|| "ResearchState unavailable".to_string())?,
            self.app_handle
                .try_state::<crate::sys::commands::LLMState>()
                .ok_or_else(|| "LLMState unavailable".to_string())?,
            ResearchRequest {
                query,
                mode,
                config_overrides: None,
                task_id: None,
            },
        )
        .await;

        match response {
            Ok(response) => {
                let structured = self.serialization_value(&response);
                let text = structured["summary"]
                    .as_str()
                    .unwrap_or_default()
                    .to_string();
                Ok(McpServerToolOutcome::success(text, Some(structured)))
            }
            Err(error) => Ok(self.outcome_from_error(error)),
        }
    }

    async fn execute_run_task(
        &self,
        arguments: HashMap<String, Value>,
    ) -> Result<McpServerToolOutcome, String> {
        let task = match self.require_string_argument(&arguments, "task") {
            Ok(task) => task,
            Err(outcome) => return Ok(outcome),
        };

        let max_steps = match self.optional_u64_argument(&arguments, "max_steps") {
            Ok(Some(max_steps)) if (1..=25).contains(&max_steps) => max_steps,
            Ok(Some(_)) => {
                return Ok(self.outcome_from_error("max_steps must be between 1 and 25."))
            }
            Ok(None) => 10,
            Err(outcome) => return Ok(outcome),
        };

        let spawn_request = SpawnAgentRequest {
            description: task.clone(),
            priority: Some("medium".to_string()),
            deadline: None,
            success_criteria: None,
            max_steps: Some(max_steps),
        };

        let orchestrated = crate::sys::commands::orchestrator_spawn_agent(spawn_request).await;
        match orchestrated {
            Ok(spawned) => {
                match agi::wait_for_agent_result(
                    &spawned.agent_id,
                    Duration::from_secs(DEFAULT_AGENT_TIMEOUT_SECS),
                )
                .await
                {
                    Ok(agent_result) => {
                        let structured = json!({
                            "agentId": spawned.agent_id,
                            "maxSteps": max_steps,
                            "result": self.serialization_value(&agent_result),
                            "mode": "orchestrator",
                        });
                        let text = structured["result"]["result"]
                            .as_str()
                            .unwrap_or("Agent task completed.")
                            .to_string();
                        Ok(McpServerToolOutcome::success(text, Some(structured)))
                    }
                    Err(error) => Ok(self.outcome_from_error(error)),
                }
            }
            Err(orchestrator_error) => {
                let fallback_result = crate::sys::commands::start_agent_task(
                    self.app_handle.clone(),
                    task.clone(),
                    "auto".to_string(),
                    self.app_handle
                        .try_state::<crate::sys::commands::LLMState>()
                        .ok_or_else(|| "LLMState unavailable".to_string())?,
                    self.app_handle
                        .try_state::<crate::sys::billing::BillingStateWrapper>()
                        .ok_or_else(|| "BillingState unavailable".to_string())?,
                    Some(MCP_SERVER_USER_ID.to_string()),
                )
                .await;

                match fallback_result {
                    Ok(result) => Ok(McpServerToolOutcome::success(
                        result.clone(),
                        Some(json!({
                            "task": task,
                            "maxSteps": max_steps,
                            "result": result,
                            "mode": "single_pass_fallback",
                            "fallbackReason": orchestrator_error,
                        })),
                    )),
                    Err(error) => Ok(self.outcome_from_error(format!(
                        "{}; fallback failed: {}",
                        orchestrator_error, error
                    ))),
                }
            }
        }
    }
}

#[async_trait]
impl McpServerExecutor for DesktopMcpServerExecutor {
    async fn execute_tool(
        &self,
        tool_name: &str,
        arguments: HashMap<String, Value>,
    ) -> Result<McpServerToolOutcome, String> {
        match tool_name {
            "agi_chat" => self.execute_chat(arguments).await,
            "agi_run_task" => self.execute_run_task(arguments).await,
            "agi_execute_skill" => self.execute_skill(arguments).await,
            "agi_bash" => self.execute_bash(arguments).await,
            "agi_research" => self.execute_research(arguments).await,
            _ => Err(format!("Unknown embedded MCP server tool '{}'.", tool_name)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::McpServerToolOutcome;
    use serde_json::json;

    #[test]
    fn outcome_serializes_with_structured_content() {
        let json = McpServerToolOutcome::success("ok".to_string(), Some(json!({ "value": 1 })))
            .into_json();

        assert_eq!(json["content"][0]["text"], "ok");
        assert_eq!(json["structuredContent"]["value"], 1);
        assert_eq!(json["isError"], false);
    }
}
