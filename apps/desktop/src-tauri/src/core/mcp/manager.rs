use crate::core::mcp::{McpClient, McpError, McpResult, McpServerConfig};
use parking_lot::RwLock;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ServerStatus {
    Stopped,
    Starting,
    Running,
    Stopping,
    Error,
}

pub struct ManagedServer {
    pub name: String,
    pub config: McpServerConfig,
    pub status: ServerStatus,
    pub started_at: Option<u64>,
    pub error_message: Option<String>,
    pub restart_count: u32,
    pub logs: Vec<String>,
}

impl ManagedServer {
    pub fn new(name: String, config: McpServerConfig) -> Self {
        Self {
            name,
            config,
            status: ServerStatus::Stopped,
            started_at: None,
            error_message: None,
            restart_count: 0,
            logs: Vec::new(),
        }
    }

    pub fn uptime_seconds(&self) -> Option<u64> {
        self.started_at.map(|start| {
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs()
                - start
        })
    }

    pub fn add_log(&mut self, message: String) {
        let timestamp = chrono::Utc::now().format("%H:%M:%S");
        self.logs.push(format!("[{}] {}", timestamp, message));

        if self.logs.len() > 1000 {
            self.logs.drain(0..self.logs.len() - 1000);
        }
    }
}

pub struct McpServerManager {
    client: Arc<McpClient>,
    servers: Arc<RwLock<HashMap<String, ManagedServer>>>,
}

impl McpServerManager {
    pub fn new(client: Arc<McpClient>) -> Self {
        Self {
            client,
            servers: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub fn register_server(&self, name: String, config: McpServerConfig) {
        let mut servers = self.servers.write();
        servers.insert(name.clone(), ManagedServer::new(name, config));
    }

    pub async fn start_server(&self, name: &str) -> McpResult<()> {
        {
            let mut servers = self.servers.write();
            if let Some(server) = servers.get_mut(name) {
                server.status = ServerStatus::Starting;
                server.error_message = None;
                server.add_log("Starting server...".to_string());
            } else {
                return Err(McpError::ServerNotFound(name.to_string()));
            }
        }

        let config = {
            let servers = self.servers.read();
            servers
                .get(name)
                .ok_or_else(|| McpError::ServerNotFound(name.to_string()))?
                .config
                .clone()
        };

        match self.client.connect_server(name.to_string(), config).await {
            Ok(_) => {
                let mut servers = self.servers.write();
                if let Some(server) = servers.get_mut(name) {
                    server.status = ServerStatus::Running;
                    server.started_at = Some(
                        SystemTime::now()
                            .duration_since(UNIX_EPOCH)
                            .unwrap()
                            .as_secs(),
                    );
                    server.add_log("Server started successfully".to_string());
                    tracing::info!("MCP server '{}' started successfully", name);
                }
                Ok(())
            }
            Err(e) => {
                let mut servers = self.servers.write();
                if let Some(server) = servers.get_mut(name) {
                    server.status = ServerStatus::Error;
                    let msg = e.to_string();
                    server.add_log(format!("Failed to start server: {}", msg));
                    server.error_message = Some(msg);
                }
                Err(e)
            }
        }
    }

    pub async fn stop_server(&self, name: &str) -> McpResult<()> {
        {
            let mut servers = self.servers.write();
            if let Some(server) = servers.get_mut(name) {
                server.status = ServerStatus::Stopping;
                server.add_log("Stopping server...".to_string());
            } else {
                return Err(McpError::ServerNotFound(name.to_string()));
            }
        }

        match self.client.disconnect_server(name).await {
            Ok(_) => {
                let mut servers = self.servers.write();
                if let Some(server) = servers.get_mut(name) {
                    server.status = ServerStatus::Stopped;
                    server.started_at = None;
                    server.add_log("Server stopped".to_string());
                    tracing::info!("MCP server '{}' stopped successfully", name);
                }
                Ok(())
            }
            Err(e) => {
                let mut servers = self.servers.write();
                if let Some(server) = servers.get_mut(name) {
                    server.status = ServerStatus::Error;
                    let msg = e.to_string();
                    server.add_log(format!("Error stopping server: {}", msg));
                    server.error_message = Some(msg);
                }
                Err(e)
            }
        }
    }

    pub async fn restart_server(&self, name: &str) -> McpResult<()> {
        tracing::info!("Restarting MCP server '{}'", name);

        if self.is_running(name) {
            self.stop_server(name).await?;

            tokio::time::sleep(Duration::from_millis(500)).await;
        }

        {
            let mut servers = self.servers.write();
            if let Some(server) = servers.get_mut(name) {
                server.restart_count += 1;
                server.add_log("Restarting server...".to_string());
            }
        }

        self.start_server(name).awai
    }

    pub fn is_running(&self, name: &str) -> bool {
        let servers = self.servers.read();
        servers
            .get(name)
            .map(|s| s.status == ServerStatus::Running)
            .unwrap_or(false)
    }

    pub fn get_status(&self, name: &str) -> Option<ServerStatus> {
        let servers = self.servers.read();
        servers.get(name).map(|s| s.status)
    }

    pub fn list_servers(&self) -> Vec<String> {
        let servers = self.servers.read();
        servers.keys().cloned().collect()
    }

    pub fn get_server_info(&self, name: &str) -> Option<ManagedServer> {
        let servers = self.servers.read();
        servers.get(name).cloned()
    }

    pub async fn auto_restart_failed_servers(&self) -> McpResult<()> {
        let failed_servers: Vec<String> = {
            let servers = self.servers.read();
            servers
                .iter()
                .filter(|(_, s)| s.status == ServerStatus::Error && s.restart_count < 3)
                .map(|(name, _)| name.clone())
                .collect()
        };

        for server_name in failed_servers {
            tracing::warn!("Auto-restarting failed server '{}'", server_name);
            if let Err(e) = self.restart_server(&server_name).await {
                tracing::error!("Failed to auto-restart '{}': {}", server_name, e);
            }
        }

        Ok(())
    }

    pub fn get_server_logs(&self, name: &str, lines: usize) -> McpResult<Vec<String>> {
        let servers = self.servers.read();
        let server = servers
            .get(name)
            .ok_or_else(|| McpError::ServerNotFound(name.to_string()))?;

        let logs = server
            .logs
            .iter()
            .rev()
            .take(lines)
            .rev()
            .cloned()
            .collect();
        Ok(logs)
    }
}

impl Clone for ManagedServer {
    fn clone(&self) -> Self {
        Self {
            name: self.name.clone(),
            config: self.config.clone(),
            status: self.status,
            started_at: self.started_at,
            error_message: self.error_message.clone(),
            restart_count: self.restart_count,
            logs: self.logs.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_register_server() {
        let client = Arc::new(McpClient::new());
        let manager = McpServerManager::new(client);

        let config = McpServerConfig {
            command: "npx".to_string(),
            args: vec![
                "-y".to_string(),
                "@modelcontextprotocol/server-filesystem".to_string(),
            ],
            env: HashMap::new(),
            enabled: true,
        };

        manager.register_server("test".to_string(), config);

        assert!(manager.list_servers().contains(&"test".to_string()));
        assert_eq!(manager.get_status("test"), Some(ServerStatus::Stopped));
    }

    #[tokio::test]
    async fn test_server_lifecycle() {
        let client = Arc::new(McpClient::new());
        let manager = McpServerManager::new(client);

        let config = McpServerConfig {
            command: "npx".to_string(),
            args: vec![
                "-y".to_string(),
                "@modelcontextprotocol/server-filesystem".to_string(),
            ],
            env: HashMap::new(),
            enabled: true,
        };

        manager.register_server("test".to_string(), config);

        let _ = manager.start_server("test").await;

        let status = manager.get_status("test");
        assert!(status.is_some());
    }
}
