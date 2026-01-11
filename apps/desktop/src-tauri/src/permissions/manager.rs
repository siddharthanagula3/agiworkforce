use anyhow::Result;
use rusqlite::{params, Connection};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

use super::audit::{AuditLogger, PermissionRequest, ToolExecution};
use super::policy::{PermissionLevel, ToolPermissionPolicy};

pub struct PermissionManager {
    db_path: PathBuf,
    audit_logger: Arc<AuditLogger>,
    policies: Arc<RwLock<std::collections::HashMap<String, ToolPermissionPolicy>>>,
}

impl PermissionManager {
    pub fn new(db_path: PathBuf, audit_db_path: PathBuf) -> Result<Self> {
        let manager = Self {
            db_path: db_path.clone(),
            audit_logger: Arc::new(AuditLogger::new(audit_db_path)?),
            policies: Arc::new(RwLock::new(std::collections::HashMap::new())),
        };

        manager.init_database()?;
        manager.load_policies_async()?;

        Ok(manager)
    }

    fn init_database(&self) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS tool_permissions (
                tool_id TEXT PRIMARY KEY,
                tool_name TEXT NOT NULL,
                permission_level TEXT NOT NULL,
                file_permissions TEXT,
                network_permissions TEXT,
                resource_limits TEXT,
                allow_system_commands BOOLEAN DEFAULT 0,
                allow_ui_automation BOOLEAN DEFAULT 0,
                require_approval BOOLEAN DEFAULT 1,
                auto_approve_after_first BOOLEAN DEFAULT 0,
                expires_at TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;

        Ok(())
    }

    fn load_policies_async(&self) -> Result<()> {
        // This would be async in production, but for now load synchronously
        let conn = Connection::open(&self.db_path)?;

        let mut stmt = conn.prepare(
            "SELECT tool_id, tool_name, permission_level, file_permissions, network_permissions,
                    resource_limits, allow_system_commands, allow_ui_automation, require_approval,
                    auto_approve_after_first, expires_at, created_at, updated_at
             FROM tool_permissions",
        )?;

        let policies = stmt.query_map([], |row| {
            let tool_id: String = row.get(0)?;
            let file_permissions_json: Option<String> = row.get(3)?;
            let network_permissions_json: Option<String> = row.get(4)?;
            let resource_limits_json: Option<String> = row.get(5)?;

            Ok((
                tool_id.clone(),
                ToolPermissionPolicy {
                    tool_id,
                    tool_name: row.get(1)?,
                    permission_level: match row.get::<_, String>(2)?.as_str() {
                        "Allow" => PermissionLevel::Allow,
                        "Deny" => PermissionLevel::Deny,
                        "AskOnce" => PermissionLevel::AskOnce,
                        _ => PermissionLevel::AskEveryTime,
                    },
                    file_permissions: file_permissions_json
                        .and_then(|j| serde_json::from_str(&j).ok())
                        .unwrap_or_default(),
                    network_permissions: network_permissions_json
                        .and_then(|j| serde_json::from_str(&j).ok())
                        .unwrap_or_default(),
                    resource_limits: resource_limits_json
                        .and_then(|j| serde_json::from_str(&j).ok())
                        .unwrap_or_default(),
                    allow_system_commands: row.get(6)?,
                    allow_ui_automation: row.get(7)?,
                    require_approval: row.get(8)?,
                    auto_approve_after_first: row.get(9)?,
                    expires_at: row.get(10)?,
                    created_at: row.get(11)?,
                    updated_at: row.get(12)?,
                },
            ))
        })?;

        // This is a simplified sync version - in production use tokio::task::spawn_blocking
        let mut map = std::collections::HashMap::new();
        for policy in policies {
            let (tool_id, policy_obj) = policy?;
            map.insert(tool_id, policy_obj);
        }

        Ok(())
    }

    pub async fn get_policy(&self, tool_id: &str) -> Option<ToolPermissionPolicy> {
        let policies = self.policies.read().await;
        policies.get(tool_id).cloned()
    }

    pub async fn set_policy(&self, policy: ToolPermissionPolicy) -> Result<()> {
        // Save to database
        let conn = Connection::open(&self.db_path)?;

        let file_permissions_json = serde_json::to_string(&policy.file_permissions)?;
        let network_permissions_json = serde_json::to_string(&policy.network_permissions)?;
        let resource_limits_json = serde_json::to_string(&policy.resource_limits)?;

        conn.execute(
            "INSERT INTO tool_permissions
             (tool_id, tool_name, permission_level, file_permissions, network_permissions, resource_limits,
              allow_system_commands, allow_ui_automation, require_approval, auto_approve_after_first, expires_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             ON CONFLICT(tool_id) DO UPDATE SET
                tool_name = excluded.tool_name,
                permission_level = excluded.permission_level,
                file_permissions = excluded.file_permissions,
                network_permissions = excluded.network_permissions,
                resource_limits = excluded.resource_limits,
                allow_system_commands = excluded.allow_system_commands,
                allow_ui_automation = excluded.allow_ui_automation,
                require_approval = excluded.require_approval,
                auto_approve_after_first = excluded.auto_approve_after_first,
                expires_at = excluded.expires_at,
                updated_at = CURRENT_TIMESTAMP",
            params![
                &policy.tool_id,
                &policy.tool_name,
                format!("{:?}", policy.permission_level),
                file_permissions_json,
                network_permissions_json,
                resource_limits_json,
                policy.allow_system_commands,
                policy.allow_ui_automation,
                policy.require_approval,
                policy.auto_approve_after_first,
                &policy.expires_at,
            ],
        )?;

        // Update in-memory cache
        let mut policies = self.policies.write().await;
        policies.insert(policy.tool_id.clone(), policy);

        Ok(())
    }

    pub async fn check_permission(
        &self,
        tool_id: &str,
        tool_name: &str,
        action: &str,
    ) -> Result<bool> {
        let policy = self.get_policy(tool_id).await;

        match policy {
            Some(p) => {
                // Check if expired
                if p.is_expired() {
                    return Ok(false);
                }

                // Check permission level
                match p.permission_level {
                    PermissionLevel::Allow => Ok(true),
                    PermissionLevel::Deny => Ok(false),
                    _ => {
                        // Log permission request
                        let request = PermissionRequest {
                            id: uuid::Uuid::new_v4().to_string(),
                            tool_id: tool_id.to_string(),
                            tool_name: tool_name.to_string(),
                            action: action.to_string(),
                            user_id: "default".to_string(),
                            approved: false,
                            approval_method: "pending".to_string(),
                            requested_at: chrono::Utc::now().to_rfc3339(),
                            responded_at: None,
                        };

                        self.audit_logger.log_permission_request(request)?;

                        // Return false, requiring UI approval
                        Ok(false)
                    }
                }
            }
            None => {
                // No policy exists, default to deny
                let request = PermissionRequest {
                    id: uuid::Uuid::new_v4().to_string(),
                    tool_id: tool_id.to_string(),
                    tool_name: tool_name.to_string(),
                    action: action.to_string(),
                    user_id: "default".to_string(),
                    approved: false,
                    approval_method: "pending".to_string(),
                    requested_at: chrono::Utc::now().to_rfc3339(),
                    responded_at: None,
                };

                self.audit_logger.log_permission_request(request)?;
                Ok(false)
            }
        }
    }

    pub async fn grant_permission(
        &self,
        tool_id: &str,
        tool_name: &str,
        permanent: bool,
        duration_hours: Option<u32>,
    ) -> Result<()> {
        let mut policy = self.get_policy(tool_id).await.unwrap_or_else(|| {
            ToolPermissionPolicy::new(tool_id.to_string(), tool_name.to_string())
        });

        if permanent {
            policy.grant_permanent_access();
        } else if let Some(hours) = duration_hours {
            policy.grant_temporary_access(hours);
        }

        self.set_policy(policy).await
    }

    pub async fn revoke_permission(&self, tool_id: &str) -> Result<()> {
        if let Some(mut policy) = self.get_policy(tool_id).await {
            policy.revoke_access();
            self.set_policy(policy).await?;
        }
        Ok(())
    }

    pub fn log_execution(&self, execution: ToolExecution) -> Result<()> {
        self.audit_logger.log_execution(execution)
    }

    pub fn get_tool_executions(&self, tool_id: &str, limit: usize) -> Result<Vec<ToolExecution>> {
        self.audit_logger.get_tool_executions(tool_id, limit)
    }

    pub fn get_recent_executions(&self, limit: usize) -> Result<Vec<ToolExecution>> {
        self.audit_logger.get_recent_executions(limit)
    }

    pub async fn get_all_policies(&self) -> Vec<ToolPermissionPolicy> {
        let policies = self.policies.read().await;
        policies.values().cloned().collect()
    }

    pub async fn delete_policy(&self, tool_id: &str) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;
        conn.execute("DELETE FROM tool_permissions WHERE tool_id = ?1", [tool_id])?;

        let mut policies = self.policies.write().await;
        policies.remove(tool_id);

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_permission_manager_creation() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("permissions.db");
        let audit_path = dir.path().join("audit.db");

        let manager = PermissionManager::new(db_path, audit_path);
        assert!(manager.is_ok());
    }
}
