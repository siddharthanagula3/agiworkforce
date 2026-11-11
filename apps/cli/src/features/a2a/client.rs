//! A2A client: fetch cards and delegate tasks.

use std::time::Instant;

use anyhow::{bail, Context, Result};

use super::protocol::{AgentCard, TaskRequest, TaskResponse, TaskResponseStatus};
use super::security::{a2a_pinned_client, peer_token};
use super::server::DEFAULT_TASK_TIMEOUT_SECONDS;

/// Fetch a single agent's card from its network endpoint, presenting the
/// bearer token remembered for that endpoint when there is one.
pub async fn fetch_agent_card(endpoint: &str) -> Result<AgentCard> {
    let url = format!("{}/a2a/card", endpoint.trim_end_matches('/'));
    // Validates the endpoint AND pins the connection to the checked IP so DNS
    // cannot rebind to a private address between the check and the connect.
    let client = a2a_pinned_client(&url, 10)?;

    fetch_card_with(&client, &url, peer_token(endpoint).as_deref()).await
}

async fn fetch_card_with(
    client: &reqwest::Client,
    url: &str,
    auth_token: Option<&str>,
) -> Result<AgentCard> {
    let mut request = client.get(url);
    if let Some(token) = auth_token {
        request = request.bearer_auth(token);
    }

    let resp = request
        .send()
        .await
        .context("Failed to reach agent endpoint")?;

    let status = resp.status();
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        bail!(
            "Agent endpoint requires a bearer token (HTTP {}): {}. Run /a2a auth <endpoint-url> to provide the token the server printed.",
            status.as_u16(),
            url
        );
    }
    if !status.is_success() {
        bail!("Agent endpoint returned HTTP {}: {}", status.as_u16(), url);
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
    // One pinned client for the whole exchange: submit and poll share the same
    // host, so pinning to the validated IP also covers the poll loop below.
    let client = a2a_pinned_client(&submit_url, 10)?;
    let remembered = peer_token(&target.endpoint);
    let auth_token = auth_token.or(remembered.as_deref());

    delegate_with(&client, base, request, auth_token).await
}

async fn delegate_with(
    client: &reqwest::Client,
    base: &str,
    request: TaskRequest,
    auth_token: Option<&str>,
) -> Result<TaskResponse> {
    let submit_url = format!("{}/a2a/task", base);
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
        if status == 401 || status == 403 {
            bail!(
                "Task submission was refused (HTTP {}): {}. Run /a2a auth {} to provide the bearer token the server printed.",
                status,
                body,
                base
            );
        }
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
    // poll_url shares submit_url's host; the pinned client already enforces the
    // validated IP, so no separate (re-resolving) validation is needed here.
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::a2a::protocol::TaskPriority;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    const PEER_TOKEN: &str = "peer-secret-token";

    async fn read_request(stream: &mut tokio::net::TcpStream) -> String {
        let mut received = Vec::new();
        let mut chunk = [0u8; 4096];
        loop {
            let read = stream.read(&mut chunk).await.unwrap_or(0);
            if read == 0 {
                break;
            }
            received.extend_from_slice(&chunk[..read]);
            let text = String::from_utf8_lossy(&received).to_lowercase();
            let Some(header_end) = text.find("\r\n\r\n") else {
                continue;
            };
            let content_length = text[..header_end]
                .lines()
                .find_map(|line| line.strip_prefix("content-length:"))
                .and_then(|value| value.trim().parse::<usize>().ok())
                .unwrap_or(0);
            if received.len() >= header_end + 4 + content_length {
                break;
            }
        }
        String::from_utf8_lossy(&received).to_lowercase()
    }

    async fn serve_behind_bearer(body: String) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = format!("http://{}", listener.local_addr().unwrap());
        tokio::spawn(async move {
            while let Ok((mut stream, _)) = listener.accept().await {
                let body = body.clone();
                tokio::spawn(async move {
                    let request = read_request(&mut stream).await;
                    let authorized =
                        request.contains(&format!("authorization: bearer {PEER_TOKEN}"));
                    let response = if authorized {
                        format!(
                            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                            body.len(),
                            body
                        )
                    } else {
                        "HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                            .to_string()
                    };
                    let _ = stream.write_all(response.as_bytes()).await;
                    let _ = stream.shutdown().await;
                });
            }
        });
        endpoint
    }

    fn loopback_client() -> reqwest::Client {
        reqwest::Client::builder().no_proxy().build().unwrap()
    }

    fn card_json(endpoint: &str) -> String {
        serde_json::to_string(&AgentCard {
            agent_id: "agent-peer".to_string(),
            name: "peer".to_string(),
            version: "0.1.0".to_string(),
            capabilities: Vec::new(),
            supported_models: Vec::new(),
            endpoint: endpoint.to_string(),
            auth_required: true,
            metadata: Default::default(),
        })
        .unwrap()
    }

    fn task_request() -> TaskRequest {
        TaskRequest {
            request_id: "req-peer-1".to_string(),
            from_agent: "agent-self".to_string(),
            task_description: "summarize".to_string(),
            context: None,
            timeout_seconds: Some(5),
            priority: TaskPriority::Normal,
        }
    }

    #[tokio::test]
    async fn a_card_behind_a_bearer_token_is_fetched_only_with_that_token() {
        let endpoint = serve_behind_bearer(card_json("http://peer")).await;
        let url = format!("{endpoint}/a2a/card");
        let client = loopback_client();

        let refused = fetch_card_with(&client, &url, None).await.unwrap_err();
        assert!(
            refused.to_string().contains("/a2a auth"),
            "the refusal names the command that supplies the token: {refused}"
        );

        let card = fetch_card_with(&client, &url, Some(PEER_TOKEN))
            .await
            .unwrap();
        assert_eq!(card.agent_id, "agent-peer");
    }

    #[tokio::test]
    async fn a_task_is_submitted_to_a_bearer_peer_only_with_its_token() {
        let body = serde_json::json!({
            "request_id": "req-peer-1",
            "status": "completed",
            "result": "done",
            "error": null,
            "duration_ms": 3,
        })
        .to_string();
        let endpoint = serve_behind_bearer(body).await;
        let client = loopback_client();

        let refused = delegate_with(&client, &endpoint, task_request(), None)
            .await
            .unwrap_err();
        assert!(refused.to_string().contains("/a2a auth"), "{refused}");

        let response = delegate_with(&client, &endpoint, task_request(), Some(PEER_TOKEN))
            .await
            .unwrap();
        assert_eq!(response.status, TaskResponseStatus::Completed);
        assert_eq!(response.result.as_deref(), Some("done"));
    }
}
