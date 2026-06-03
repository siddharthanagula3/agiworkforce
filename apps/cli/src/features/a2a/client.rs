//! A2A client: fetch cards and delegate tasks.

use std::time::Instant;

use anyhow::{bail, Context, Result};

use crate::models::Message;

use super::protocol::{AgentCard, TaskRequest, TaskResponse, TaskResponseStatus};
use super::security::validate_a2a_endpoint;
use super::server::DEFAULT_TASK_TIMEOUT_SECONDS;

/// Fetch a single agent's card from its network endpoint.
pub async fn fetch_agent_card(endpoint: &str) -> Result<AgentCard> {
    let url = format!("{}/a2a/card", endpoint.trim_end_matches('/'));
    validate_a2a_endpoint(&url)?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()?;

    let resp = client
        .get(&url)
        .send()
        .await
        .context("Failed to reach agent endpoint")?;

    if !resp.status().is_success() {
        bail!(
            "Agent endpoint returned HTTP {}: {}",
            resp.status().as_u16(),
            url
        );
    }

    let card = resp
        .json::<AgentCard>()
        .await
        .context("Failed to parse AgentCard from response")?;

    Ok(card)
}

/// Delegate a task to a remote agent and wait for the response.
///
/// Sends a POST to `target.endpoint/a2a/task` with the TaskRequest body.
/// Polls `GET /a2a/task/{id}` until the task completes or times out.
pub async fn delegate_task(
    target: &AgentCard,
    request: TaskRequest,
    auth_token: Option<&str>,
) -> Result<TaskResponse> {
    let base = target.endpoint.trim_end_matches('/');
    let submit_url = format!("{}/a2a/task", base);
    validate_a2a_endpoint(&submit_url)?;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()?;

    let mut req_builder = client.post(&submit_url).json(&request);
    if let Some(token) = auth_token {
        req_builder = req_builder.bearer_auth(token);
    }

    let resp = req_builder
        .send()
        .await
        .context("Failed to submit task to remote agent")?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let body = resp.text().await.unwrap_or_default();
        bail!("Task submission failed (HTTP {}): {}", status, body);
    }

    let initial: TaskResponse = resp
        .json()
        .await
        .context("Failed to parse task submission response")?;

    if initial.status != TaskResponseStatus::Accepted {
        return Ok(initial);
    }

    let timeout_secs = request
        .timeout_seconds
        .unwrap_or(DEFAULT_TASK_TIMEOUT_SECONDS);
    let deadline = Instant::now() + std::time::Duration::from_secs(timeout_secs);
    let poll_url = format!("{}/a2a/task/{}", base, request.request_id);
    validate_a2a_endpoint(&poll_url)?;
    let mut last_poll_error: Option<String> = None;

    loop {
        if Instant::now() > deadline {
            match last_poll_error {
                Some(error) => bail!(
                    "Task {} timed out after {}s; last poll error: {}",
                    request.request_id,
                    timeout_secs,
                    error
                ),
                None => bail!(
                    "Task {} timed out after {}s",
                    request.request_id,
                    timeout_secs
                ),
            }
        }

        tokio::time::sleep(std::time::Duration::from_secs(2)).await;

        let mut poll_req = client.get(&poll_url);
        if let Some(token) = auth_token {
            poll_req = poll_req.bearer_auth(token);
        }

        let poll_resp = match poll_req.send().await {
            Ok(r) => r,
            Err(error) => {
                last_poll_error = Some(format!("request failed: {error}"));
                continue;
            }
        };

        if !poll_resp.status().is_success() {
            let status = poll_resp.status();
            let body = poll_resp.text().await.unwrap_or_default();
            last_poll_error = Some(format!("HTTP {}: {}", status.as_u16(), body));
            continue;
        }

        let task_resp: TaskResponse = match poll_resp.json().await {
            Ok(r) => r,
            Err(error) => {
                last_poll_error = Some(format!("invalid task response JSON: {error}"));
                continue;
            }
        };

        if task_resp.status != TaskResponseStatus::Accepted {
            return Ok(task_resp);
        }
    }
}

/// Hand off a conversation to another agent.
#[allow(dead_code)]
pub async fn handoff_conversation(
    target: &AgentCard,
    messages: Vec<Message>,
    instructions: Option<String>,
    auth_token: Option<&str>,
) -> Result<()> {
    let _ = (target, messages, instructions, auth_token);
    bail!(
        "A2A conversation handoff is not supported in this CLI build; use task delegation instead"
    )
}
