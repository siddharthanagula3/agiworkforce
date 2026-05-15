//! A2A client: fetch cards, delegate tasks, handoff conversations.

use std::time::Instant;

use anyhow::{bail, Context, Result};

use crate::models::Message;

use super::protocol::{
    AgentCard, HandoffRequest, TaskRequest, TaskResponse, TaskResponseStatus,
};
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

    loop {
        if Instant::now() > deadline {
            bail!(
                "Task {} timed out after {}s",
                request.request_id,
                timeout_secs
            );
        }

        tokio::time::sleep(std::time::Duration::from_secs(2)).await;

        let mut poll_req = client.get(&poll_url);
        if let Some(token) = auth_token {
            poll_req = poll_req.bearer_auth(token);
        }

        let poll_resp = match poll_req.send().await {
            Ok(r) => r,
            Err(_) => continue,
        };

        if !poll_resp.status().is_success() {
            continue;
        }

        let task_resp: TaskResponse = match poll_resp.json().await {
            Ok(r) => r,
            Err(_) => continue,
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
    let base = target.endpoint.trim_end_matches('/');
    let url = format!("{}/a2a/handoff", base);
    validate_a2a_endpoint(&url)?;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()?;

    let handoff = HandoffRequest {
        from_agent: "self".to_string(),
        messages,
        instructions,
    };

    let mut req = client.post(&url).json(&handoff);
    if let Some(token) = auth_token {
        req = req.bearer_auth(token);
    }

    let resp = req
        .send()
        .await
        .context("Failed to send handoff to remote agent")?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let body = resp.text().await.unwrap_or_default();
        bail!("Handoff failed (HTTP {}): {}", status, body);
    }

    Ok(())
}
