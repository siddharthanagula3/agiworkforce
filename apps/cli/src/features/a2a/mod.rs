//! A2A (Agent-to-Agent) protocol for inter-agent communication, discovery,
//! and task delegation between AGI Workforce CLI instances.
//!
//! This module implements:
//! - **Agent Card**: Capability advertisement for peer discovery.
//! - **Task Delegation**: Request/response protocol for delegating work.
//! - **Discovery**: Local file + network-based agent discovery.
//! - **A2A Server**: Lightweight HTTP server exposing card, task, and handoff endpoints.
//! - **A2A Client**: Functions to delegate tasks and hand off conversations.

pub mod client;
pub mod jsonrpc;
pub mod protocol;
pub mod registry;
pub mod security;
pub mod server;

// Re-export the public surface that callers outside this module depend on.
pub use client::{delegate_task, fetch_agent_card, handoff_conversation};
pub use protocol::{
    A2aState, AgentCard, HandoffRequest, InFlightTask, TaskPriority, TaskRequest, TaskResponse,
    TaskResponseStatus,
};
pub use registry::{
    discover_agents, format_agent_list, load_local_registry, save_local_registry,
};
pub use security::{constant_time_eq_str, generate_random_token};
pub use server::{
    build_a2a_state, http_json_response, http_response, serve_a2a, DEFAULT_A2A_PORT,
    DEFAULT_TASK_TIMEOUT_SECONDS,
};

use anyhow::{bail, Context, Result};
use colored::Colorize;
use std::collections::HashMap;

use crate::config::CliConfig;

// ---------------------------------------------------------------------------
// Agent ID helper
// ---------------------------------------------------------------------------

/// Generate a new unique agent ID using UUID v4.
pub fn generate_agent_id() -> String {
    format!("agent-{}", uuid::Uuid::new_v4())
}

// ---------------------------------------------------------------------------
// CLI Integration Helpers
// ---------------------------------------------------------------------------

/// Handle `/a2a` slash commands from the REPL.
///
/// Returns a human-readable result string, or an error.
pub async fn handle_a2a_command(
    cmd: &str,
    arg: &str,
    config: &CliConfig,
    session_model: &str,
) -> Result<String> {
    match cmd {
        "discover" => {
            let agents = discover_agents(config).await?;
            Ok(format_agent_list(&agents))
        }
        "delegate" => {
            let parts: Vec<&str> = arg.splitn(2, ' ').collect();
            if parts.len() < 2 {
                bail!("Usage: /a2a delegate <agent-name> <task description>");
            }
            let target_name = parts[0];
            let task_desc = parts[1];

            let agents = load_local_registry();
            let target = agents
                .iter()
                .find(|a| a.name == target_name || a.agent_id == target_name)
                .or_else(|| agents.iter().find(|a| a.endpoint.contains(target_name)));

            let target = match target {
                Some(t) => t.clone(),
                None => {
                    if target_name.starts_with("http") {
                        fetch_agent_card(target_name).await?
                    } else {
                        bail!(
                            "Agent '{}' not found in registry. Use /a2a discover to list known agents, or provide a URL.",
                            target_name
                        );
                    }
                }
            };

            let request_id = generate_agent_id();
            let request = TaskRequest {
                request_id,
                from_agent: generate_agent_id(),
                task_description: task_desc.to_string(),
                context: None,
                timeout_seconds: Some(DEFAULT_TASK_TIMEOUT_SECONDS),
                priority: TaskPriority::Normal,
            };

            eprintln!(
                "  {} Delegating task to {} ({})",
                "[a2a]".cyan().bold(),
                target.name.bold(),
                target.endpoint.dimmed()
            );

            let response = delegate_task(&target, request, None).await?;

            let mut result = "Task delegation result:\n".to_string();
            result.push_str(&format!("  Status: {}\n", response.status));
            result.push_str(&format!("  Duration: {}ms\n", response.duration_ms));
            if let Some(ref output) = response.result {
                result.push_str(&format!("  Result: {}\n", output));
            }
            if let Some(ref error) = response.error {
                result.push_str(&format!("  Error: {}\n", error));
            }

            Ok(result)
        }
        "serve" => {
            let port = if arg.is_empty() {
                DEFAULT_A2A_PORT
            } else {
                arg.parse::<u16>().context("Port must be a valid number")?
            };

            let auth_token = generate_random_token(32);
            eprintln!(
                "  {} A2A auth token (use as Bearer token): {}",
                "[a2a]".cyan().bold(),
                auth_token
            );

            let card = AgentCard {
                agent_id: generate_agent_id(),
                name: format!("agiworkforce-{}", std::process::id()),
                version: env!("CARGO_PKG_VERSION").to_string(),
                capabilities: vec![
                    "code".to_string(),
                    "research".to_string(),
                    "web_search".to_string(),
                    "file_operations".to_string(),
                ],
                supported_models: vec![session_model.to_string()],
                endpoint: format!("http://127.0.0.1:{}", port),
                auth_required: true,
                metadata: HashMap::new(),
            };

            let state = build_a2a_state(card, Some(auth_token), config.clone());

            let mut registry = load_local_registry();
            registry.retain(|c| c.endpoint != state.card.endpoint);
            registry.push(state.card.clone());
            if let Err(e) = save_local_registry(&registry) {
                eprintln!(
                    "  {} Failed to update agent registry: {}",
                    "Warning:".yellow(),
                    e
                );
            }

            serve_a2a(state, port).await?;

            Ok("A2A server stopped.".to_string())
        }
        "register" => {
            if arg.is_empty() {
                bail!("Usage: /a2a register <endpoint-url>");
            }

            let card = fetch_agent_card(arg).await?;
            let mut registry = load_local_registry();
            registry.retain(|c| c.agent_id != card.agent_id);
            registry.push(card.clone());
            save_local_registry(&registry)?;

            Ok(format!(
                "Registered agent '{}' ({}) at {}",
                card.name, card.agent_id, card.endpoint
            ))
        }
        "card" => {
            let card = AgentCard {
                agent_id: generate_agent_id(),
                name: format!("agiworkforce-{}", std::process::id()),
                version: env!("CARGO_PKG_VERSION").to_string(),
                capabilities: vec![
                    "code".to_string(),
                    "research".to_string(),
                    "web_search".to_string(),
                    "file_operations".to_string(),
                ],
                supported_models: vec![session_model.to_string()],
                endpoint: format!("http://127.0.0.1:{}", DEFAULT_A2A_PORT),
                auth_required: false,
                metadata: HashMap::new(),
            };

            match serde_json::to_string_pretty(&card) {
                Ok(json) => Ok(json),
                Err(e) => bail!("Failed to serialize card: {}", e),
            }
        }
        _ => {
            bail!(
                "Unknown A2A subcommand: '{}'. Available: discover, delegate, serve, register, card",
                cmd
            );
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_agent_card_serialization_roundtrip() {
        let card = AgentCard {
            agent_id: "agent-test-1".to_string(),
            name: "test-agent".to_string(),
            version: "0.1.0".to_string(),
            capabilities: vec!["code".to_string(), "research".to_string()],
            supported_models: vec!["claude-opus-4-6".to_string()],
            endpoint: "http://localhost:7892".to_string(),
            auth_required: false,
            metadata: HashMap::new(),
        };

        let json = serde_json::to_string(&card).unwrap();
        let parsed: AgentCard = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.agent_id, "agent-test-1");
        assert_eq!(parsed.name, "test-agent");
        assert_eq!(parsed.capabilities.len(), 2);
        assert!(!parsed.auth_required);
    }

    #[test]
    fn test_task_request_serialization() {
        let req = TaskRequest {
            request_id: "req-123".to_string(),
            from_agent: "agent-1".to_string(),
            task_description: "Refactor the auth module".to_string(),
            context: Some("Focus on error handling".to_string()),
            timeout_seconds: Some(120),
            priority: TaskPriority::High,
        };

        let json = serde_json::to_string(&req).unwrap();
        assert!(json.contains("\"priority\":\"high\""));
        assert!(json.contains("\"request_id\":\"req-123\""));

        let parsed: TaskRequest = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.request_id, "req-123");
        assert_eq!(parsed.priority, TaskPriority::High);
        assert_eq!(parsed.context.as_deref(), Some("Focus on error handling"));
    }

    #[test]
    fn test_task_response_serialization() {
        let resp = TaskResponse {
            request_id: "req-123".to_string(),
            status: TaskResponseStatus::Completed,
            result: Some("Task done.".to_string()),
            error: None,
            duration_ms: 5432,
        };

        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("\"status\":\"completed\""));

        let parsed: TaskResponse = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.status, TaskResponseStatus::Completed);
        assert_eq!(parsed.duration_ms, 5432);
        assert_eq!(parsed.result.as_deref(), Some("Task done."));
        assert!(parsed.error.is_none());
    }

    #[test]
    fn test_task_response_status_display() {
        assert_eq!(TaskResponseStatus::Accepted.to_string(), "accepted");
        assert_eq!(TaskResponseStatus::Completed.to_string(), "completed");
        assert_eq!(TaskResponseStatus::Failed.to_string(), "failed");
        assert_eq!(TaskResponseStatus::Rejected.to_string(), "rejected");
    }

    #[test]
    fn test_task_priority_display() {
        assert_eq!(TaskPriority::Low.to_string(), "low");
        assert_eq!(TaskPriority::Normal.to_string(), "normal");
        assert_eq!(TaskPriority::High.to_string(), "high");
        assert_eq!(TaskPriority::Critical.to_string(), "critical");
    }

    #[test]
    fn test_task_priority_default() {
        let priority = TaskPriority::default();
        assert_eq!(priority, TaskPriority::Normal);
    }

    #[test]
    fn test_handoff_request_serialization() {
        use crate::models::Message;
        let handoff = HandoffRequest {
            from_agent: "agent-1".to_string(),
            messages: vec![Message::text("user", "Hello")],
            instructions: Some("Continue the conversation".to_string()),
        };

        let json = serde_json::to_string(&handoff).unwrap();
        assert!(json.contains("from_agent"));
        assert!(json.contains("messages"));

        let parsed: HandoffRequest = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.from_agent, "agent-1");
        assert_eq!(parsed.messages.len(), 1);
        assert_eq!(
            parsed.instructions.as_deref(),
            Some("Continue the conversation")
        );
    }

    #[test]
    fn test_generate_agent_id_uniqueness() {
        let id1 = generate_agent_id();
        std::thread::sleep(std::time::Duration::from_millis(2));
        let id2 = generate_agent_id();
        assert_ne!(id1, id2);
        assert!(id1.starts_with("agent-"));
        assert!(id2.starts_with("agent-"));
    }

    #[test]
    fn test_format_agent_list_empty() {
        let output = format_agent_list(&[]);
        assert_eq!(output, "No agents discovered.");
    }

    #[test]
    fn test_format_agent_list_single() {
        let cards = vec![AgentCard {
            agent_id: "agent-1".to_string(),
            name: "test-agent".to_string(),
            version: "0.1.0".to_string(),
            capabilities: vec!["code".to_string()],
            supported_models: vec!["claude-opus-4-6".to_string()],
            endpoint: "http://localhost:7892".to_string(),
            auth_required: false,
            metadata: HashMap::new(),
        }];

        let output = format_agent_list(&cards);
        assert!(output.contains("test-agent"));
        assert!(output.contains("agent-1"));
        assert!(output.contains("http://localhost:7892"));
        assert!(output.contains("code"));
    }

    #[test]
    fn test_format_agent_list_offline() {
        let mut metadata = HashMap::new();
        metadata.insert("online".to_string(), serde_json::json!(false));

        let cards = vec![AgentCard {
            agent_id: "agent-2".to_string(),
            name: "offline-agent".to_string(),
            version: "0.1.0".to_string(),
            capabilities: vec![],
            supported_models: vec![],
            endpoint: "http://localhost:9999".to_string(),
            auth_required: false,
            metadata,
        }];

        let output = format_agent_list(&cards);
        assert!(output.contains("offline-agent"));
        assert!(output.contains("http://localhost:9999"));
    }

    #[test]
    fn test_http_response_format() {
        let resp = http_response(200, r#"{"ok":true}"#);
        assert!(resp.starts_with("HTTP/1.1 200 OK\r\n"));
        assert!(resp.contains("Content-Type: application/json"));
        assert!(resp.contains("Content-Length: 11"));
        assert!(resp.ends_with(r#"{"ok":true}"#));
    }

    #[test]
    fn test_http_response_404() {
        let resp = http_response(404, "not found");
        assert!(resp.starts_with("HTTP/1.1 404 Not Found\r\n"));
    }

    #[test]
    fn test_http_response_401() {
        let resp = http_response(401, "unauthorized");
        assert!(resp.starts_with("HTTP/1.1 401 Unauthorized\r\n"));
    }

    #[test]
    fn test_load_local_registry_no_file() {
        let cards = load_local_registry();
        let _ = cards;
    }

    #[test]
    fn test_default_a2a_port() {
        assert_eq!(DEFAULT_A2A_PORT, 7892);
    }

    #[test]
    fn test_default_task_timeout() {
        assert_eq!(DEFAULT_TASK_TIMEOUT_SECONDS, 300);
    }

    #[test]
    fn test_agent_card_with_metadata() {
        let mut metadata = HashMap::new();
        metadata.insert("region".to_string(), serde_json::json!("us-east-1"));
        metadata.insert("online".to_string(), serde_json::json!(true));

        let card = AgentCard {
            agent_id: "agent-meta".to_string(),
            name: "meta-agent".to_string(),
            version: "1.0.0".to_string(),
            capabilities: vec![],
            supported_models: vec![],
            endpoint: "http://localhost:7892".to_string(),
            auth_required: true,
            metadata,
        };

        let json = serde_json::to_string(&card).unwrap();
        let parsed: AgentCard = serde_json::from_str(&json).unwrap();
        assert!(parsed.auth_required);
        assert_eq!(
            parsed.metadata.get("region").and_then(|v| v.as_str()),
            Some("us-east-1")
        );
        assert_eq!(
            parsed.metadata.get("online").and_then(|v| v.as_bool()),
            Some(true)
        );
    }

    #[test]
    fn test_task_request_without_optional_fields() {
        let req = TaskRequest {
            request_id: "req-minimal".to_string(),
            from_agent: "agent-x".to_string(),
            task_description: "Simple task".to_string(),
            context: None,
            timeout_seconds: None,
            priority: TaskPriority::Low,
        };

        let json = serde_json::to_string(&req).unwrap();
        let parsed: TaskRequest = serde_json::from_str(&json).unwrap();
        assert!(parsed.context.is_none());
        assert!(parsed.timeout_seconds.is_none());
        assert_eq!(parsed.priority, TaskPriority::Low);
    }

    // SSRF allowlist tests
    #[test]
    fn test_ssrf_deny_loopback_ipv4() {
        let err = security::validate_a2a_endpoint("http://127.0.0.1:7892/a2a/card").unwrap_err();
        assert!(err.to_string().contains("private/restricted"), "{err}");
    }

    #[test]
    fn test_ssrf_deny_private_10_block() {
        let err = security::validate_a2a_endpoint("http://10.0.0.1/a2a/task").unwrap_err();
        assert!(err.to_string().contains("private/restricted"), "{err}");
    }

    #[test]
    fn test_ssrf_deny_private_172_block() {
        let err = security::validate_a2a_endpoint("http://172.16.5.20/a2a/task").unwrap_err();
        assert!(err.to_string().contains("private/restricted"), "{err}");
    }

    #[test]
    fn test_ssrf_deny_private_192_168() {
        let err = security::validate_a2a_endpoint("http://192.168.1.100/a2a/task").unwrap_err();
        assert!(err.to_string().contains("private/restricted"), "{err}");
    }

    #[test]
    fn test_ssrf_deny_imds() {
        let err = security::validate_a2a_endpoint("http://169.254.169.254/latest/meta-data/").unwrap_err();
        assert!(err.to_string().contains("private/restricted"), "{err}");
    }

    #[test]
    fn test_ssrf_deny_bad_scheme() {
        let err = security::validate_a2a_endpoint("ftp://example.com/a2a/task").unwrap_err();
        assert!(err.to_string().contains("scheme"), "{err}");
    }

    #[test]
    fn test_ssrf_allow_public_ip() {
        let result = security::validate_a2a_endpoint("https://1.1.1.1/a2a/card");
        assert!(result.is_ok(), "expected public IP to be allowed: {result:?}");
    }

    #[test]
    fn test_ssrf_private_ip_classification() {
        use std::net::IpAddr;
        use std::str::FromStr;
        assert!(security::is_private_ip(&IpAddr::from_str("127.0.0.1").unwrap()));
        assert!(security::is_private_ip(&IpAddr::from_str("10.1.2.3").unwrap()));
        assert!(security::is_private_ip(&IpAddr::from_str("172.20.0.1").unwrap()));
        assert!(security::is_private_ip(&IpAddr::from_str("192.168.0.1").unwrap()));
        assert!(security::is_private_ip(&IpAddr::from_str("169.254.169.254").unwrap()));
        assert!(!security::is_private_ip(&IpAddr::from_str("1.1.1.1").unwrap()));
        assert!(!security::is_private_ip(&IpAddr::from_str("8.8.8.8").unwrap()));
    }
}
