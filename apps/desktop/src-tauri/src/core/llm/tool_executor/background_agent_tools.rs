use super::*;
use crate::core::agent::{BackgroundAgent, BackgroundAgentContext, BackgroundAgentManagerState};
use tokio::time::{sleep, Duration};

const MAX_BACKGROUND_AGENT_GOAL_CHARS: usize = 20_000;
const MAX_BACKGROUND_AGENT_INSTRUCTIONS_CHARS: usize = 12_000;
const MAX_BACKGROUND_AGENT_ID_CHARS: usize = 256;
const BACKGROUND_AGENT_POLL_INTERVAL_MS: u64 = 250;
const MAX_BACKGROUND_AGENT_BLOCK_MS: u64 = 55_000;

impl ToolExecutor {
    pub(super) async fn execute_background_agent_start_tool(
        &self,
        args: &HashMap<String, Value>,
        action_id: &str,
    ) -> Result<ToolResult> {
        let app = self
            .app_handle
            .as_ref()
            .ok_or_else(|| anyhow!("App handle not available for background agents"))?;
        let state = app
            .try_state::<BackgroundAgentManagerState>()
            .ok_or_else(|| anyhow!("Background agent manager is not initialized"))?;

        let goal = required_bounded_string(args, "goal", MAX_BACKGROUND_AGENT_GOAL_CHARS)?;
        let priority = parse_priority(args.get("priority"))?;
        let working_directory = match optional_bounded_string(args, "working_directory", 4096)? {
            Some(path) => {
                let resolved = self.resolve_path(&path);
                self.validate_path(&resolved).await?;
                if !std::path::Path::new(&resolved).is_dir() {
                    return Err(anyhow!("working_directory must be an existing directory"));
                }
                Some(resolved)
            }
            None => self.project_folder.clone(),
        };
        let custom_instructions = optional_bounded_string(
            args,
            "custom_instructions",
            MAX_BACKGROUND_AGENT_INSTRUCTIONS_CHARS,
        )?;
        let conversation_id =
            optional_bounded_string(args, "conversation_id", MAX_BACKGROUND_AGENT_ID_CHARS)?
                .unwrap_or_else(|| format!("tool:{action_id}"));

        let context = BackgroundAgentContext {
            working_directory,
            environment: HashMap::new(),
            conversation_snapshot: Vec::new(),
            active_mcp_servers: Vec::new(),
            custom_instructions,
        };

        let manager = state.0.read().await;
        let agent_id = manager
            .push_to_background(conversation_id, goal.clone(), context, priority)
            .await?;
        let agent = manager.get_agent(&agent_id).await;
        let started = agent
            .as_ref()
            .is_some_and(|agent| agent.status.to_string() == "running");
        let queue_position = if started {
            None
        } else {
            manager
                .list_active_agents()
                .await
                .iter()
                .position(|agent| agent.id == agent_id)
                .map(|position| position.saturating_add(1))
        };

        Ok(ToolResult {
            success: true,
            data: json!({
                "agentId": agent_id,
                "status": agent
                    .as_ref()
                    .map(|agent| agent.status.to_string())
                    .unwrap_or_else(|| "unknown".to_string()),
                "started": started,
                "queuePosition": queue_position,
                "goal": goal,
                "conversationSnapshotCount": 0
            }),
            error: None,
            metadata: HashMap::from([("tool_name".to_string(), json!("background_agent_start"))]),
        })
    }

    pub(super) async fn execute_background_agent_get_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let app = self
            .app_handle
            .as_ref()
            .ok_or_else(|| anyhow!("App handle not available for background agents"))?;
        let state = app
            .try_state::<BackgroundAgentManagerState>()
            .ok_or_else(|| anyhow!("Background agent manager is not initialized"))?;

        let agent_id = required_bounded_string(args, "agent_id", MAX_BACKGROUND_AGENT_ID_CHARS)?;
        let block = args.get("block").and_then(Value::as_bool).unwrap_or(false);
        let timeout_ms = args
            .get("timeout_ms")
            .and_then(Value::as_u64)
            .unwrap_or(30_000)
            .min(MAX_BACKGROUND_AGENT_BLOCK_MS);

        let manager = state.0.read().await;
        let mut agent = manager.get_agent(&agent_id).await;
        if block {
            let deadline = std::time::Instant::now() + Duration::from_millis(timeout_ms);
            while agent.as_ref().is_some_and(|agent| !agent.is_terminal())
                && std::time::Instant::now() < deadline
            {
                sleep(Duration::from_millis(BACKGROUND_AGENT_POLL_INTERVAL_MS)).await;
                agent = manager.get_agent(&agent_id).await;
            }
        }

        let retrieval_status = match &agent {
            None => "not_found",
            Some(agent) if agent.is_terminal() => "success",
            Some(_) if block => "timeout",
            Some(_) => "not_ready",
        };

        Ok(ToolResult {
            success: agent.is_some(),
            data: json!({
                "retrievalStatus": retrieval_status,
                "agent": agent.as_ref().map(sanitize_background_agent),
            }),
            error: if agent.is_some() {
                None
            } else {
                Some(format!("No background agent found with ID: {agent_id}"))
            },
            metadata: HashMap::from([("tool_name".to_string(), json!("background_agent_get"))]),
        })
    }

    pub(super) async fn execute_background_agent_cancel_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let app = self
            .app_handle
            .as_ref()
            .ok_or_else(|| anyhow!("App handle not available for background agents"))?;
        let state = app
            .try_state::<BackgroundAgentManagerState>()
            .ok_or_else(|| anyhow!("Background agent manager is not initialized"))?;

        let agent_id = required_bounded_string(args, "agent_id", MAX_BACKGROUND_AGENT_ID_CHARS)?;
        let manager = state.0.read().await;
        let agent = manager
            .get_agent(&agent_id)
            .await
            .ok_or_else(|| anyhow!("No background agent found with ID: {agent_id}"))?;

        if agent.is_terminal() {
            return Ok(ToolResult {
                success: false,
                data: json!({
                    "agentId": agent_id,
                    "status": agent.status.to_string(),
                    "cancelled": false
                }),
                error: Some(format!(
                    "Background agent {agent_id} is already terminal with status {}",
                    agent.status
                )),
                metadata: HashMap::from([(
                    "tool_name".to_string(),
                    json!("background_agent_cancel"),
                )]),
            });
        }

        manager.cancel_agent(&agent_id).await?;

        Ok(ToolResult {
            success: true,
            data: json!({
                "agentId": agent_id,
                "cancelled": true
            }),
            error: None,
            metadata: HashMap::from([("tool_name".to_string(), json!("background_agent_cancel"))]),
        })
    }
}

fn required_bounded_string(
    args: &HashMap<String, Value>,
    field: &str,
    max_chars: usize,
) -> Result<String> {
    let value = args
        .get(field)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| anyhow!("Missing required '{field}' string parameter"))?;

    if value.chars().count() > max_chars {
        return Err(anyhow!(
            "Parameter '{field}' exceeds maximum length of {max_chars} characters"
        ));
    }

    Ok(value.to_string())
}

fn optional_bounded_string(
    args: &HashMap<String, Value>,
    field: &str,
    max_chars: usize,
) -> Result<Option<String>> {
    let Some(value) = args.get(field) else {
        return Ok(None);
    };
    let Some(value) = value.as_str() else {
        return Err(anyhow!("Parameter '{field}' must be a string"));
    };
    let value = value.trim();
    if value.is_empty() {
        return Ok(None);
    }
    if value.chars().count() > max_chars {
        return Err(anyhow!(
            "Parameter '{field}' exceeds maximum length of {max_chars} characters"
        ));
    }
    Ok(Some(value.to_string()))
}

fn parse_priority(value: Option<&Value>) -> Result<u8> {
    let Some(value) = value else {
        return Ok(5);
    };
    let priority = value
        .as_u64()
        .ok_or_else(|| anyhow!("Parameter 'priority' must be an integer from 0 to 255"))?;
    u8::try_from(priority)
        .map_err(|_| anyhow!("Parameter 'priority' must be an integer from 0 to 255"))
}

fn sanitize_background_agent(agent: &BackgroundAgent) -> Value {
    json!({
        "id": agent.id,
        "conversationId": agent.conversation_id,
        "goal": agent.goal,
        "status": agent.status.to_string(),
        "progress": agent.progress,
        "summary": agent.summary,
        "error": agent.error,
        "createdAt": agent.created_at,
        "startedAt": agent.started_at,
        "completedAt": agent.completed_at,
        "priority": agent.priority,
        "timeoutSecs": agent.timeout_secs,
        "workingDirectory": agent.context.working_directory,
        "activeMcpServerCount": agent.context.active_mcp_servers.len(),
        "conversationSnapshotCount": agent.context.conversation_snapshot.len(),
        "hasCustomInstructions": agent.context.custom_instructions.is_some(),
    })
}
