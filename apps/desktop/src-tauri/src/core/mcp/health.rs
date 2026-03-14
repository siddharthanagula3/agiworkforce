use crate::core::mcp::client::McpClient;
use chrono::{DateTime, Utc};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Duration;
use tauri::Emitter;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum HealthStatus {
    Healthy,
    Degraded,
    Unhealthy,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerHealth {
    pub server_name: String,
    pub status: HealthStatus,
    pub last_check: DateTime<Utc>,
    pub response_time_ms: Option<u64>,
    pub error_message: Option<String>,
    pub tool_count: usize,
    pub consecutive_failures: u32,
}

pub struct McpHealthMonitor {
    client: Arc<McpClient>,
    health_records: Arc<Mutex<HashMap<String, ServerHealth>>>,
}

impl McpHealthMonitor {
    pub fn new(client: Arc<McpClient>) -> Self {
        Self {
            client,
            health_records: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn check_server_health(&self, server_name: &str) -> ServerHealth {
        let start = std::time::Instant::now();

        let (status, error_message, tool_count) = match self.client.list_server_tools(server_name) {
            Ok(tools) => {
                if tools.is_empty() {
                    (
                        HealthStatus::Degraded,
                        Some("No tools available".to_string()),
                        0,
                    )
                } else {
                    (HealthStatus::Healthy, None, tools.len())
                }
            }
            Err(e) => {
                tracing::warn!(
                    "[MCP Health] Server {} health check failed: {}",
                    server_name,
                    e
                );
                (HealthStatus::Unhealthy, Some(e.to_string()), 0)
            }
        };

        let response_time_ms = start.elapsed().as_millis() as u64;

        let mut records = self.health_records.lock();
        let consecutive_failures = if status == HealthStatus::Unhealthy {
            records
                .get(server_name)
                .map(|h| h.consecutive_failures + 1)
                .unwrap_or(1)
        } else {
            0
        };

        let health = ServerHealth {
            server_name: server_name.to_string(),
            status,
            last_check: Utc::now(),
            response_time_ms: Some(response_time_ms),
            error_message,
            tool_count,
            consecutive_failures,
        };

        records.insert(server_name.to_string(), health.clone());
        health
    }

    pub fn get_all_health(&self) -> Vec<ServerHealth> {
        let records = self.health_records.lock();
        records.values().cloned().collect()
    }

    pub fn get_server_health(&self, server_name: &str) -> Option<ServerHealth> {
        let records = self.health_records.lock();
        records.get(server_name).cloned()
    }

    pub async fn refresh_connected_health(&self) -> Vec<ServerHealth> {
        let connected_servers = self.client.get_connected_servers();
        let connected_names: HashSet<String> = connected_servers.iter().cloned().collect();

        {
            let mut records = self.health_records.lock();
            records.retain(|server_name, _| connected_names.contains(server_name));
        }

        let mut health_rows = Vec::with_capacity(connected_servers.len());
        for server_name in connected_servers {
            health_rows.push(self.check_server_health(&server_name).await);
        }

        health_rows.sort_by(|left, right| left.server_name.cmp(&right.server_name));
        health_rows
    }

    pub fn start_monitoring(
        self: Arc<Self>,
        interval: Duration,
        app_handle: tauri::AppHandle,
    ) -> tokio::task::JoinHandle<()> {
        tokio::spawn(async move {
            let mut interval_timer = tokio::time::interval(interval);
            loop {
                interval_timer.tick().await;

                let servers = self.client.get_connected_servers();
                for server_name in servers.iter() {
                    let health = self.check_server_health(server_name).await;

                    if health.status == HealthStatus::Unhealthy {
                        tracing::warn!(
                            "[MCP Health] Server {} is unhealthy: {:?}",
                            server_name,
                            health.error_message
                        );

                        if let Err(e) = app_handle.emit("mcp:server_unhealthy", &health) {
                            tracing::error!("[MCP Health] Failed to emit unhealthy event: {}", e);
                        }
                    }
                }
            }
        })
    }

    pub fn clear(&self) {
        self.health_records.lock().clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_health_status_serialization() {
        let status = HealthStatus::Healthy;
        let json = serde_json::to_string(&status).unwrap();
        assert_eq!(json, "\"healthy\"");
    }
}
