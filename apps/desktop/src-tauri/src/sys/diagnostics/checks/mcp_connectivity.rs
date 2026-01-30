//! MCP server connectivity check
//!
//! Tests MCP (Model Context Protocol) server connections and health.

use crate::sys::diagnostics::{DiagnosticCheck, DiagnosticContext, DiagnosticResult};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::Manager;

/// Tests MCP server connections
pub struct McpConnectivityCheck;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct McpServerStatus {
    name: String,
    enabled: bool,
    connected: bool,
    responding: bool,
    tool_count: usize,
    error: Option<String>,
    response_time_ms: Option<u64>,
}

#[async_trait]
impl DiagnosticCheck for McpConnectivityCheck {
    fn id(&self) -> &'static str {
        "mcp_connectivity"
    }

    fn name(&self) -> &'static str {
        "MCP Server Connectivity"
    }

    fn description(&self) -> &'static str {
        "Tests connections to configured MCP (Model Context Protocol) servers"
    }

    fn category(&self) -> &'static str {
        "integration"
    }

    fn is_critical(&self) -> bool {
        false // MCP is optional
    }

    fn estimated_duration(&self) -> Duration {
        Duration::from_secs(10)
    }

    async fn run(&self, ctx: &DiagnosticContext) -> DiagnosticResult {
        let start = std::time::Instant::now();

        let Some(ref app_handle) = ctx.app_handle else {
            return DiagnosticResult::skipped(
                self.id(),
                self.name(),
                "App handle not available for MCP state access",
            )
            .with_duration(start.elapsed());
        };

        // Get MCP state
        let mcp_state = match app_handle.try_state::<crate::sys::commands::McpState>() {
            Some(state) => state,
            None => {
                return DiagnosticResult::skipped(
                    self.id(),
                    self.name(),
                    "MCP state not initialized",
                )
                .with_duration(start.elapsed());
            }
        };

        let mut server_statuses: Vec<McpServerStatus> = Vec::new();
        let mut healthy_count = 0;
        let mut unhealthy_count = 0;
        let mut warnings: Vec<String> = Vec::new();

        // Get configured servers from config - hold lock briefly
        let server_configs: Vec<(String, bool)> = {
            let config = mcp_state.config.lock();
            config
                .mcp_servers
                .iter()
                .map(|(name, cfg)| (name.clone(), cfg.enabled))
                .collect()
        };

        if server_configs.is_empty() {
            return DiagnosticResult::ok(self.id(), self.name(), "No MCP servers configured")
                .with_duration(start.elapsed())
                .with_metadata(serde_json::json!({
                    "servers": [],
                    "total": 0,
                }));
        }

        // Check each server
        for (server_name, enabled) in &server_configs {
            if !enabled {
                server_statuses.push(McpServerStatus {
                    name: server_name.clone(),
                    enabled: false,
                    connected: false,
                    responding: false,
                    tool_count: 0,
                    error: None,
                    response_time_ms: None,
                });
                continue;
            }

            let check_start = std::time::Instant::now();

            // Check if server is connected
            let connected = mcp_state
                .client
                .get_connected_servers()
                .contains(server_name);

            if !connected {
                server_statuses.push(McpServerStatus {
                    name: server_name.clone(),
                    enabled: true,
                    connected: false,
                    responding: false,
                    tool_count: 0,
                    error: Some("Not connected".to_string()),
                    response_time_ms: None,
                });
                unhealthy_count += 1;
                warnings.push(format!("MCP server '{}' not connected", server_name));
                continue;
            }

            // Check health by listing tools
            let health = mcp_state
                .health_monitor
                .check_server_health(server_name)
                .await;
            let response_time_ms = check_start.elapsed().as_millis() as u64;

            let status = McpServerStatus {
                name: server_name.clone(),
                enabled: true,
                connected: true,
                responding: health.status == crate::core::mcp::HealthStatus::Healthy,
                tool_count: health.tool_count,
                error: health.error_message.clone(),
                response_time_ms: Some(response_time_ms),
            };

            match health.status {
                crate::core::mcp::HealthStatus::Healthy => {
                    healthy_count += 1;
                }
                crate::core::mcp::HealthStatus::Degraded => {
                    warnings.push(format!(
                        "MCP server '{}' is degraded: {}",
                        server_name,
                        health.error_message.unwrap_or_default()
                    ));
                }
                crate::core::mcp::HealthStatus::Unhealthy => {
                    unhealthy_count += 1;
                    warnings.push(format!(
                        "MCP server '{}' is unhealthy: {}",
                        server_name,
                        health.error_message.unwrap_or_default()
                    ));
                }
                crate::core::mcp::HealthStatus::Unknown => {
                    warnings.push(format!("MCP server '{}' status unknown", server_name));
                }
            }

            server_statuses.push(status);
        }

        let duration = start.elapsed();
        let total_enabled = server_statuses.iter().filter(|s| s.enabled).count();

        if unhealthy_count > 0 {
            return DiagnosticResult::warning(
                self.id(),
                self.name(),
                format!(
                    "MCP server issues: {} unhealthy, {} healthy, {} total",
                    unhealthy_count, healthy_count, total_enabled
                ),
                format!(
                    "{}. Try restarting the affected servers.",
                    warnings.join("; ")
                ),
            )
            .with_duration(duration)
            .with_metadata(serde_json::json!({
                "servers": server_statuses,
                "healthy": healthy_count,
                "unhealthy": unhealthy_count,
                "total": total_enabled,
            }));
        }

        DiagnosticResult::ok(
            self.id(),
            self.name(),
            format!("MCP servers healthy ({}/{})", healthy_count, total_enabled),
        )
        .with_duration(duration)
        .with_metadata(serde_json::json!({
            "servers": server_statuses,
            "healthy": healthy_count,
            "total": total_enabled,
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sys::diagnostics::Severity;

    #[tokio::test]
    async fn test_mcp_check_without_app_handle() {
        let check = McpConnectivityCheck;
        let ctx = DiagnosticContext::new(std::path::PathBuf::from("/tmp"));

        let result = check.run(&ctx).await;
        assert_eq!(result.severity, Severity::Skipped);
    }
}
