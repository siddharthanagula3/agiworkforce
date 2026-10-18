use agiworkforce_model_registry::TrustMode;
use async_trait::async_trait;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::time::Duration;
use tauri::{AppHandle, Manager};

use crate::core::agent::unattended_turn::{run_unattended_turn, UnattendedTurn, UnattendedTurnEnd};
use crate::sys::commands::chat::ChatSendMessageRequest;
use crate::sys::commands::research::{ResearchModeInput, ResearchRequest, ResearchResponse};

const MCP_SERVER_USER_ID: &str = "mcp-server";
const DEFAULT_BASH_TIMEOUT_SECS: u64 = 30;
const MAX_BASH_TIMEOUT_SECS: u64 = 300;
const DEFAULT_AGENT_TIMEOUT_SECS: u64 = 300;
const RUN_TASK_TOOL: &str = "agi_run_task";
const RUN_TASK_APPROVAL_PROMPT: &str =
    "Another app on this computer asked AGI Workforce to run this agent task.";

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

    /// Why a tool is off for now, when a capability switch in Settings says
    /// so. A tool that is off is left out of `tools/list` and refused on call.
    fn switched_off(&self, _tool_name: &str) -> Option<String> {
        None
    }
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
        string_argument(arguments, key).ok_or_else(|| {
            self.outcome_from_error(format!("Missing required string argument '{}'.", key))
        })
    }

    fn optional_string_argument(
        &self,
        arguments: &HashMap<String, Value>,
        key: &str,
    ) -> Option<String> {
        string_argument(arguments, key)
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

    async fn validate_mcp_server_tool_policy(
        &self,
        tool_name: &str,
        arguments: &HashMap<String, Value>,
    ) -> Option<McpServerToolOutcome> {
        let Some(confirmation_state) =
            self.app_handle
                .try_state::<crate::sys::commands::tool_confirmation::ToolConfirmationState>()
        else {
            tracing::error!(
                "[SECURITY][MCP] ToolConfirmationState unavailable, denying {}",
                tool_name
            );
            return Some(self.outcome_from_error(
                "MCP tool execution denied: security validation unavailable.".to_string(),
            ));
        };

        let guard = confirmation_state.tool_guard();
        let params = serde_json::to_value(arguments).unwrap_or_else(|_| json!({}));
        if let Err(error) = guard.validate_tool_call(tool_name, &params).await {
            tracing::warn!(
                "[SECURITY][MCP] ToolGuard rejected MCP server tool {}: {}",
                tool_name,
                error
            );
            return Some(self.outcome_from_error(format!(
                "MCP tool '{}' rejected by ToolGuard: {}",
                tool_name, error
            )));
        }

        None
    }

    async fn execute_chat(
        &self,
        arguments: HashMap<String, Value>,
    ) -> Result<McpServerToolOutcome, String> {
        if let Some(outcome) = self
            .validate_mcp_server_tool_policy("agi_chat", &arguments)
            .await
        {
            return Ok(outcome);
        }

        let message = match self.require_string_argument(&arguments, "message") {
            Ok(message) => message,
            Err(outcome) => return Ok(outcome),
        };

        let model = self
            .optional_string_argument(&arguments, "model")
            .unwrap_or_else(|| "auto".to_string());
        if model != "auto" {
            return Ok(self.outcome_from_error(
                "Explicit model selection is disabled for external MCP agi_chat calls. Use auto routing or configure the desktop app model settings.".to_string(),
            ));
        }
        if self
            .optional_string_argument(&arguments, "system_prompt")
            .is_some()
        {
            return Ok(self.outcome_from_error(
                "Custom system prompts are disabled for external MCP agi_chat calls.".to_string(),
            ));
        }

        let request = ChatSendMessageRequest {
            conversation_id: None,
            user_id: MCP_SERVER_USER_ID.to_string(),
            content: message,
            provider: None,
            model: Some(model),
            provider_override: None,
            model_override: None,
            stream: Some(false),
            enable_tools: Some(false),
            tool_scope: None,
            conversation_mode: None,
            focus_mode: None,
            research_task_id: None,
            attachments: None,
            thinking_mode: None,
            thinking_budget: None,
            reasoning_effort: None,
            output_config: None,
            temperature: None,
            max_output_tokens: None,
            prefer_cloud_credits: false,
            // MCP server calls are treated as local (no ManagedCloud routing).
            active_mode: Some("local".to_string()),
            execution_mode: None,
            frontend_message_id: None,
            custom_instructions: None,
            project_folder: None,
            model_capabilities: None,
            incognito: Some(true),
            temporary_history: None,
            auto_inject_skills: Some(false),
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
                .try_state::<crate::sys::commands::mcp::McpState>()
                .ok_or_else(|| "McpState unavailable".to_string())?,
            self.app_handle
                .try_state::<crate::sys::commands::project_context::ProjectContextState>()
                .ok_or_else(|| "ProjectContextState unavailable".to_string())?,
            self.app_handle
                .try_state::<crate::sys::commands::memory::MemoryState>()
                .ok_or_else(|| "MemoryState unavailable".to_string())?,
            self.app_handle
                .try_state::<crate::sys::commands::project_memory::ProjectMemoryState>()
                .ok_or_else(|| "ProjectMemoryState unavailable".to_string())?,
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
        if let Some(outcome) = self
            .validate_mcp_server_tool_policy("agi_execute_skill", &arguments)
            .await
        {
            return Ok(outcome);
        }

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
            stream: Some(false),
            // The external MCP bridge has no typed, enforced mapping from its
            // free-form allowed-tool names to Desktop's native tool registry.
            // Keep it fail-closed until that exact allowlist contract exists.
            enable_tools: Some(false),
            tool_scope: None,
            conversation_mode: None,
            focus_mode: None,
            research_task_id: None,
            attachments: None,
            thinking_mode: None,
            thinking_budget: None,
            reasoning_effort: None,
            output_config: None,
            temperature: None,
            max_output_tokens: None,
            prefer_cloud_credits: false,
            // MCP server calls are treated as local (no ManagedCloud routing).
            active_mode: Some("local".to_string()),
            execution_mode: None,
            frontend_message_id: None,
            custom_instructions: Some(custom_instructions),
            project_folder: None,
            model_capabilities: None,
            incognito: Some(true),
            temporary_history: None,
            auto_inject_skills: Some(false),
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
                .try_state::<crate::sys::commands::mcp::McpState>()
                .ok_or_else(|| "McpState unavailable".to_string())?,
            self.app_handle
                .try_state::<crate::sys::commands::project_context::ProjectContextState>()
                .ok_or_else(|| "ProjectContextState unavailable".to_string())?,
            self.app_handle
                .try_state::<crate::sys::commands::memory::MemoryState>()
                .ok_or_else(|| "MemoryState unavailable".to_string())?,
            self.app_handle
                .try_state::<crate::sys::commands::project_memory::ProjectMemoryState>()
                .ok_or_else(|| "ProjectMemoryState unavailable".to_string())?,
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
            if let Some(confirmation_state) =
                self.app_handle
                    .try_state::<crate::sys::commands::tool_confirmation::ToolConfirmationState>()
            {
                let guard = confirmation_state.tool_guard();
                let params = json!({"command": command});
                if let Err(e) = guard.validate_tool_call("terminal_execute", &params).await {
                    tracing::warn!("[SECURITY][MCP] ToolGuard rejected bash command: {}", e);
                    return Ok(self
                        .outcome_from_error(format!("Bash command rejected by ToolGuard: {}", e)));
                }
            } else {
                tracing::error!(
                    "[SECURITY][MCP] ToolConfirmationState not available, \
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
        let research_state = self
            .app_handle
            .try_state::<crate::sys::commands::research::ResearchState>()
            .ok_or_else(|| "ResearchState unavailable".to_string())?;
        let llm_state = self
            .app_handle
            .try_state::<crate::sys::commands::LLMState>()
            .ok_or_else(|| "LLMState unavailable".to_string())?;
        let app_handle = self.app_handle.clone();

        research_outcome(
            &arguments,
            || self.validate_mcp_server_tool_policy("agi_research", &arguments),
            move |query, mode| {
                crate::sys::commands::research_start(
                    app_handle,
                    research_state,
                    llm_state,
                    ResearchRequest {
                        query,
                        mode,
                        config_overrides: None,
                        task_id: None,
                    },
                )
            },
        )
        .await
    }

    async fn execute_run_task(
        &self,
        arguments: HashMap<String, Value>,
    ) -> Result<McpServerToolOutcome, String> {
        if let Some(outcome) = self
            .validate_mcp_server_tool_policy(RUN_TASK_TOOL, &arguments)
            .await
        {
            return Ok(outcome);
        }

        let task = match self.require_string_argument(&arguments, "task") {
            Ok(task) => task,
            Err(outcome) => return Ok(outcome),
        };

        if let Err(refusal) = crate::core::agent::tool_approval::require_tool_approval(
            &self.app_handle,
            RUN_TASK_TOOL,
            &json!({ "task": task }),
            Some(RUN_TASK_APPROVAL_PROMPT),
        )
        .await
        {
            return Ok(self.outcome_from_error(refusal.to_string()));
        }

        let turn = UnattendedTurn {
            prompt: &task,
            trust_mode: TrustMode::Local,
            project_folder: None,
            time_limit: Some(Duration::from_secs(DEFAULT_AGENT_TIMEOUT_SECS)),
            conversation_id: None,
            progress: None,
        };
        let ran = run_unattended_turn(&self.app_handle, turn, std::future::pending::<()>()).await;
        match ran.end {
            UnattendedTurnEnd::Answered(answer) => {
                let structured = json!({ "result": answer.clone(), "refusedTools": ran.refusals });
                Ok(McpServerToolOutcome::success(answer, Some(structured)))
            }
            UnattendedTurnEnd::Failed(reason) => Ok(self.outcome_from_error(reason)),
            UnattendedTurnEnd::TimedOut => Ok(self.outcome_from_error(format!(
                "The task did not finish within {DEFAULT_AGENT_TIMEOUT_SECS} seconds and was stopped."
            ))),
            UnattendedTurnEnd::Stopped => Ok(self.outcome_from_error("The task was stopped.")),
        }
    }
}

fn string_argument(arguments: &HashMap<String, Value>, key: &str) -> Option<String> {
    arguments
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

/// `guard` must be awaited before `start`: the embedded MCP bridge is reachable
/// by any local process holding the bearer token, so a research run may only be
/// launched after the ToolGuard policy check clears it.
async fn research_outcome<Guard, GuardFuture, Start, StartFuture>(
    arguments: &HashMap<String, Value>,
    guard: Guard,
    start: Start,
) -> Result<McpServerToolOutcome, String>
where
    Guard: FnOnce() -> GuardFuture,
    GuardFuture: std::future::Future<Output = Option<McpServerToolOutcome>>,
    Start: FnOnce(String, ResearchModeInput) -> StartFuture,
    StartFuture: std::future::Future<Output = Result<ResearchResponse, String>>,
{
    if let Some(outcome) = guard().await {
        return Ok(outcome);
    }

    let Some(query) = string_argument(arguments, "query") else {
        return Ok(McpServerToolOutcome::error(
            "Missing required string argument 'query'.".to_string(),
            None,
        ));
    };

    let depth = string_argument(arguments, "depth").unwrap_or_else(|| "quick".to_string());
    let mode = match depth.as_str() {
        "quick" => ResearchModeInput::Quick,
        "thorough" => ResearchModeInput::Deep,
        _ => {
            return Ok(McpServerToolOutcome::error(
                "depth must be either 'quick' or 'thorough'.".to_string(),
                None,
            ))
        }
    };

    match start(query, mode).await {
        Ok(response) => {
            let structured = serde_json::to_value(&response).unwrap_or_else(|_| json!({}));
            let text = structured["summary"]
                .as_str()
                .unwrap_or_default()
                .to_string();
            Ok(McpServerToolOutcome::success(text, Some(structured)))
        }
        Err(error) => Ok(McpServerToolOutcome::error(error, None)),
    }
}

#[async_trait]
impl McpServerExecutor for DesktopMcpServerExecutor {
    fn switched_off(&self, tool_name: &str) -> Option<String> {
        crate::sys::commands::capabilities::capability_refusal_now(&self.app_handle, tool_name)
    }

    async fn execute_tool(
        &self,
        tool_name: &str,
        arguments: HashMap<String, Value>,
    ) -> Result<McpServerToolOutcome, String> {
        if let Some(off) = self.switched_off(tool_name) {
            return Ok(McpServerToolOutcome::error(off, None));
        }

        // `agi_bash` ends in the terminal command, which runs the same gate
        // under `terminal_execute`, the name a hook is written against.
        if tool_name != "agi_bash" {
            if let Err(refusal) =
                crate::ui::hooks::gate_tool_use(tool_name, arguments.clone()).await
            {
                return Ok(McpServerToolOutcome::error(refusal, None));
            }
        }

        match tool_name {
            "agi_chat" => self.execute_chat(arguments).await,
            RUN_TASK_TOOL => self.execute_run_task(arguments).await,
            "agi_execute_skill" => self.execute_skill(arguments).await,
            "agi_bash" => self.execute_bash(arguments).await,
            "agi_research" => self.execute_research(arguments).await,
            _ => Err(format!("Unknown embedded MCP server tool '{}'.", tool_name)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{research_outcome, McpServerToolOutcome};
    use crate::sys::commands::research::ResearchModeInput;
    use serde_json::{json, Value};
    use std::collections::HashMap;
    use std::sync::atomic::{AtomicBool, Ordering};

    fn research_arguments(depth: Option<&str>) -> HashMap<String, Value> {
        let mut arguments = HashMap::new();
        arguments.insert("query".to_string(), json!("who owns this machine"));
        if let Some(depth) = depth {
            arguments.insert("depth".to_string(), json!(depth));
        }
        arguments
    }

    #[tokio::test]
    async fn research_does_not_start_when_tool_guard_denies() {
        let started = AtomicBool::new(false);

        let outcome = research_outcome(
            &research_arguments(None),
            || async {
                Some(McpServerToolOutcome::error(
                    "MCP tool 'agi_research' rejected by ToolGuard: unauthorized".to_string(),
                    None,
                ))
            },
            |_query, _mode| {
                started.store(true, Ordering::SeqCst);
                async { Err("research_start must not run".to_string()) }
            },
        )
        .await
        .unwrap();

        assert!(!started.load(Ordering::SeqCst));
        assert!(outcome.is_error);
        assert!(outcome.text.contains("rejected by ToolGuard"));
    }

    #[tokio::test]
    async fn research_starts_only_after_tool_guard_approval() {
        let started = AtomicBool::new(false);

        let outcome = research_outcome(
            &research_arguments(Some("thorough")),
            || async { None },
            |query, mode| {
                started.store(true, Ordering::SeqCst);
                assert_eq!(query, "who owns this machine");
                assert!(matches!(mode, ResearchModeInput::Deep));
                async { Err("launched".to_string()) }
            },
        )
        .await
        .unwrap();

        assert!(started.load(Ordering::SeqCst));
        assert!(outcome.is_error);
        assert_eq!(outcome.text, "launched");
    }

    #[tokio::test]
    async fn every_listed_server_tool_has_a_guard_policy() {
        use crate::core::mcp::server::tools::McpServerToolRegistry;
        use crate::sys::security::ToolExecutionGuard;

        let guard = ToolExecutionGuard::new();
        for tool in McpServerToolRegistry::list_tools(&[]) {
            let name = tool["name"].as_str().expect("tool name");
            let judged_as = if name == "agi_bash" {
                "terminal_execute"
            } else {
                name
            };
            assert!(
                guard.get_risk_level(judged_as).is_some(),
                "'{name}' has no guard policy, so the guard refuses every call"
            );
        }

        guard
            .validate_tool_call("agi_chat", &json!({ "message": "hello" }))
            .await
            .expect("a chat with no tools is allowed");
        guard
            .validate_tool_call(
                "agi_execute_skill",
                &json!({ "skill_name": "summarize", "input": "text" }),
            )
            .await
            .expect("a skill run with no tools is allowed");
        guard
            .validate_tool_call(
                "agi_research",
                &json!({ "query": "rust", "depth": "quick" }),
            )
            .await
            .expect("web research is allowed");
        guard
            .validate_tool_call(super::RUN_TASK_TOOL, &json!({ "task": "tidy", "cwd": "/" }))
            .await
            .expect_err("an argument the tool does not declare is refused");
    }

    #[test]
    fn only_the_agent_run_asks_and_no_standing_grant_answers_for_it() {
        use crate::sys::commands::tool_confirmation::may_stand_on_a_prior_approval;
        use crate::sys::security::ToolExecutionGuard;

        let guard = ToolExecutionGuard::new();
        for read_only in ["agi_chat", "agi_execute_skill", "agi_research"] {
            assert!(
                !guard.get_safety_tier(read_only).requires_user_action(),
                "{read_only}"
            );
        }
        assert!(guard
            .get_safety_tier(super::RUN_TASK_TOOL)
            .requires_user_action());
        assert!(!may_stand_on_a_prior_approval(super::RUN_TASK_TOOL));
    }

    #[tokio::test]
    async fn an_agent_run_reaches_the_dialog_even_in_autopilot() {
        use crate::sys::commands::tool_confirmation::{AgentMode, ToolConfirmationState};
        use tauri::Manager;

        let app = tauri::test::mock_app();
        let state = ToolConfirmationState::new();
        state.set_agent_mode(AgentMode::Autopilot);
        state.set_auto_approve_all(true);
        state.approve_for_session(super::RUN_TASK_TOOL);
        state.remember_choice(super::RUN_TASK_TOOL, true);
        app.handle().manage(state);

        let settled = tokio::time::timeout(
            std::time::Duration::from_millis(250),
            crate::core::agent::tool_approval::require_tool_approval(
                app.handle(),
                super::RUN_TASK_TOOL,
                &json!({ "task": "tidy the desktop", "max_steps": 10 }),
                Some(super::RUN_TASK_APPROVAL_PROMPT),
            ),
        )
        .await;

        assert!(
            settled.is_err(),
            "auto-approve-all, a session approval and a stored allow must all be ignored"
        );
    }

    #[tokio::test]
    async fn an_agent_run_is_refused_outright_in_safe_mode() {
        use crate::sys::commands::tool_confirmation::{AgentMode, ToolConfirmationState};
        use tauri::Manager;

        let app = tauri::test::mock_app();
        let state = ToolConfirmationState::new();
        state.set_agent_mode(AgentMode::Safe);
        app.handle().manage(state);

        let refusal = crate::core::agent::tool_approval::require_tool_approval(
            app.handle(),
            super::RUN_TASK_TOOL,
            &json!({ "task": "tidy the desktop" }),
            None,
        )
        .await
        .expect_err("safe mode starts no agent")
        .to_string();

        assert!(refusal.contains("not permitted in safe mode"), "{refusal}");
    }

    #[test]
    fn outcome_serializes_with_structured_content() {
        let json = McpServerToolOutcome::success("ok".to_string(), Some(json!({ "value": 1 })))
            .into_json();

        assert_eq!(json["content"][0]["text"], "ok");
        assert_eq!(json["structuredContent"]["value"], 1);
        assert_eq!(json["isError"], false);
    }
}
