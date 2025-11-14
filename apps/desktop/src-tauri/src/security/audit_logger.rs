use crate::error::{Error, Result};
use chrono::Utc;
use hmac::{Hmac, Mac};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::sync::{Arc, Mutex};
use uuid::Uuid;

type HmacSha256 = Hmac<Sha256>;

/// Audit event types for governance tracking
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuditEventType {
    ToolExecution,
    WorkflowExecution,
    TeamAccess,
    SecurityViolation,
    ApprovalRequest,
    ConfigChange,
    DataExport,
    DataDeletion,
    AgentCreated,
    AgentDeleted,
    PermissionGranted,
    PermissionRevoked,
    Other(String),
}

impl AuditEventType {
    pub fn as_str(&self) -> &str {
        match self {
            Self::ToolExecution => "tool_execution",
            Self::WorkflowExecution => "workflow_execution",
            Self::TeamAccess => "team_access",
            Self::SecurityViolation => "security_violation",
            Self::ApprovalRequest => "approval_request",
            Self::ConfigChange => "config_change",
            Self::DataExport => "data_export",
            Self::DataDeletion => "data_deletion",
            Self::AgentCreated => "agent_created",
            Self::AgentDeleted => "agent_deleted",
            Self::PermissionGranted => "permission_granted",
            Self::PermissionRevoked => "permission_revoked",
            Self::Other(s) => s,
        }
    }
}

/// Audit status for tracking execution outcome
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuditStatus {
    Success,
    Failure,
    Blocked,
    Pending,
}

impl AuditStatus {
    pub fn as_str(&self) -> &str {
        match self {
            Self::Success => "success",
            Self::Failure => "failure",
            Self::Blocked => "blocked",
            Self::Pending => "pending",
        }
    }
}

/// Audit event structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEvent {
    pub id: String,
    pub timestamp: i64,
    pub user_id: Option<String>,
    pub team_id: Option<String>,
    pub event_type: AuditEventType,
    pub resource_type: Option<String>,
    pub resource_id: Option<String>,
    pub action: String,
    pub status: AuditStatus,
    pub metadata: Option<serde_json::Value>,
}

/// Comprehensive audit logger with tamper detection
pub struct AuditLogger {
    db: Arc<Mutex<Connection>>,
    hmac_key: Vec<u8>,
}

impl AuditLogger {
    /// Create a new audit logger with HMAC signing
    pub fn new(db: Arc<Mutex<Connection>>) -> Result<Self> {
        // Generate or load HMAC key (in production, this should be stored securely)
        let hmac_key = Self::generate_hmac_key()?;

        Ok(Self { db, hmac_key })
    }

    /// Create audit logger with provided HMAC key
    pub fn with_key(db: Arc<Mutex<Connection>>, hmac_key: Vec<u8>) -> Self {
        Self { db, hmac_key }
    }

    /// Generate a new HMAC key
    fn generate_hmac_key() -> Result<Vec<u8>> {
        // In production, this should be:
        // 1. Generated once during installation
        // 2. Stored in Windows Credential Manager
        // 3. Never changed (changing invalidates all signatures)

        // For now, use a static key (REPLACE IN PRODUCTION)
        Ok(b"agiworkforce-audit-hmac-key-v1".to_vec())
    }

    /// Log an audit event
    pub fn log(&self, event: AuditEvent) -> Result<()> {
        let conn = self
            .db
            .lock()
            .map_err(|e| Error::Other(format!("Failed to acquire database lock: {}", e)))?;

        // Serialize event data for signing
        let event_data = serde_json::json!({
            "id": event.id,
            "timestamp": event.timestamp,
            "user_id": event.user_id,
            "team_id": event.team_id,
            "event_type": event.event_type.as_str(),
            "resource_type": event.resource_type,
            "resource_id": event.resource_id,
            "action": event.action,
            "status": event.status.as_str(),
            "metadata": event.metadata,
        });

        let event_data_str = serde_json::to_string(&event_data)?;
        let signature = self.generate_signature(&event_data_str);

        // Store in database
        conn.execute(
            "INSERT INTO audit_events (
                id, timestamp, user_id, team_id, event_type,
                resource_type, resource_id, action, status,
                metadata, hmac_signature
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![
                event.id,
                event.timestamp,
                event.user_id,
                event.team_id,
                event.event_type.as_str(),
                event.resource_type,
                event.resource_id,
                event.action,
                event.status.as_str(),
                event
                    .metadata
                    .map(|m| serde_json::to_string(&m).unwrap_or_default()),
                signature,
            ],
        )?;

        Ok(())
    }

    /// Verify an audit event's integrity
    pub fn verify_event(&self, event_id: &str) -> Result<bool> {
        let conn = self
            .db
            .lock()
            .map_err(|e| Error::Other(format!("Failed to acquire database lock: {}", e)))?;

        let (
            id,
            timestamp,
            user_id,
            team_id,
            event_type,
            resource_type,
            resource_id,
            action,
            status,
            metadata,
            stored_signature,
        ): (
            String,
            i64,
            Option<String>,
            Option<String>,
            String,
            Option<String>,
            Option<String>,
            String,
            String,
            Option<String>,
            String,
        ) = conn.query_row(
            "SELECT id, timestamp, user_id, team_id, event_type,
                    resource_type, resource_id, action, status,
                    metadata, hmac_signature
             FROM audit_events WHERE id = ?1",
            [event_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                    row.get(7)?,
                    row.get(8)?,
                    row.get(9)?,
                    row.get(10)?,
                ))
            },
        )?;

        // Reconstruct event data
        let event_data = serde_json::json!({
            "id": id,
            "timestamp": timestamp,
            "user_id": user_id,
            "team_id": team_id,
            "event_type": event_type,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "action": action,
            "status": status,
            "metadata": metadata.and_then(|m| serde_json::from_str::<serde_json::Value>(&m).ok()),
        });

        let event_data_str = serde_json::to_string(&event_data)?;
        let computed_signature = self.generate_signature(&event_data_str);

        Ok(computed_signature == stored_signature)
    }

    /// Generate HMAC-SHA256 signature
    fn generate_signature(&self, data: &str) -> String {
        let mut mac =
            HmacSha256::new_from_slice(&self.hmac_key).expect("HMAC can take key of any size");
        mac.update(data.as_bytes());
        let result = mac.finalize();
        hex::encode(result.into_bytes())
    }

    /// Get audit events with filtering
    pub fn get_events(&self, filters: AuditFilters) -> Result<Vec<AuditEvent>> {
        let conn = self
            .db
            .lock()
            .map_err(|e| Error::Other(format!("Failed to acquire database lock: {}", e)))?;

        let mut query = String::from(
            "SELECT id, timestamp, user_id, team_id, event_type,
                    resource_type, resource_id, action, status, metadata
             FROM audit_events WHERE 1=1",
        );

        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(user_id) = &filters.user_id {
            query.push_str(" AND user_id = ?");
            params.push(Box::new(user_id.clone()));
        }

        if let Some(team_id) = &filters.team_id {
            query.push_str(" AND team_id = ?");
            params.push(Box::new(team_id.clone()));
        }

        if let Some(event_type) = &filters.event_type {
            query.push_str(" AND event_type = ?");
            params.push(Box::new(event_type.clone()));
        }

        if let Some(status) = &filters.status {
            query.push_str(" AND status = ?");
            params.push(Box::new(status.clone()));
        }

        if let Some(start_time) = filters.start_time {
            query.push_str(" AND timestamp >= ?");
            params.push(Box::new(start_time));
        }

        if let Some(end_time) = filters.end_time {
            query.push_str(" AND timestamp <= ?");
            params.push(Box::new(end_time));
        }

        query.push_str(" ORDER BY timestamp DESC");

        if let Some(limit) = filters.limit {
            query.push_str(&format!(" LIMIT {}", limit));
        }

        let mut stmt = conn.prepare(&query)?;
        let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();

        let events = stmt
            .query_map(param_refs.as_slice(), |row| {
                let metadata_str: Option<String> = row.get(9)?;
                let metadata = metadata_str.and_then(|s| serde_json::from_str(&s).ok());

                Ok(AuditEvent {
                    id: row.get(0)?,
                    timestamp: row.get(1)?,
                    user_id: row.get(2)?,
                    team_id: row.get(3)?,
                    event_type: AuditEventType::Other(row.get(4)?),
                    resource_type: row.get(5)?,
                    resource_id: row.get(6)?,
                    action: row.get(7)?,
                    status: match row.get::<_, String>(8)?.as_str() {
                        "success" => AuditStatus::Success,
                        "failure" => AuditStatus::Failure,
                        "blocked" => AuditStatus::Blocked,
                        "pending" => AuditStatus::Pending,
                        _ => AuditStatus::Pending,
                    },
                    metadata,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(events)
    }

    /// Verify integrity of all audit events (for compliance audits)
    pub fn verify_all_events(&self) -> Result<AuditIntegrityReport> {
        let conn = self
            .db
            .lock()
            .map_err(|e| Error::Other(format!("Failed to acquire database lock: {}", e)))?;

        let mut stmt = conn.prepare("SELECT id FROM audit_events")?;
        let event_ids: Vec<String> = stmt
            .query_map([], |row| row.get(0))?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        let total_events = event_ids.len();
        let mut verified = 0;
        let mut tampered = Vec::new();

        for event_id in event_ids {
            match self.verify_event(&event_id) {
                Ok(true) => verified += 1,
                Ok(false) => tampered.push(event_id),
                Err(_) => tampered.push(event_id),
            }
        }

        Ok(AuditIntegrityReport {
            total_events,
            verified_events: verified,
            tampered_events: tampered,
        })
    }
}

/// Filters for querying audit events
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AuditFilters {
    pub user_id: Option<String>,
    pub team_id: Option<String>,
    pub event_type: Option<String>,
    pub status: Option<String>,
    pub start_time: Option<i64>,
    pub end_time: Option<i64>,
    pub limit: Option<usize>,
}

/// Audit integrity report
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditIntegrityReport {
    pub total_events: usize,
    pub verified_events: usize,
    pub tampered_events: Vec<String>,
}

/// Helper function to create audit event for tool execution
pub fn create_tool_execution_event(
    user_id: Option<String>,
    team_id: Option<String>,
    tool_name: String,
    success: bool,
    metadata: Option<serde_json::Value>,
) -> AuditEvent {
    AuditEvent {
        id: Uuid::new_v4().to_string(),
        timestamp: Utc::now().timestamp(),
        user_id,
        team_id,
        event_type: AuditEventType::ToolExecution,
        resource_type: Some("tool".to_string()),
        resource_id: Some(tool_name.clone()),
        action: format!("execute_{}", tool_name),
        status: if success {
            AuditStatus::Success
        } else {
            AuditStatus::Failure
        },
        metadata,
    }
}

/// Helper function to create audit event for workflow execution
pub fn create_workflow_execution_event(
    user_id: Option<String>,
    team_id: Option<String>,
    workflow_id: String,
    status: AuditStatus,
    metadata: Option<serde_json::Value>,
) -> AuditEvent {
    AuditEvent {
        id: Uuid::new_v4().to_string(),
        timestamp: Utc::now().timestamp(),
        user_id,
        team_id,
        event_type: AuditEventType::WorkflowExecution,
        resource_type: Some("workflow".to_string()),
        resource_id: Some(workflow_id.clone()),
        action: "execute_workflow".to_string(),
        status,
        metadata,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup_test_db() -> Arc<Mutex<Connection>> {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("PRAGMA foreign_keys = ON", []).unwrap();

        // Create audit_events table
        conn.execute(
            "CREATE TABLE audit_events (
                id TEXT PRIMARY KEY,
                timestamp INTEGER NOT NULL,
                user_id TEXT,
                team_id TEXT,
                event_type TEXT NOT NULL,
                resource_type TEXT,
                resource_id TEXT,
                action TEXT NOT NULL,
                status TEXT NOT NULL,
                metadata TEXT,
                hmac_signature TEXT NOT NULL
            )",
            [],
        )
        .unwrap();

        Arc::new(Mutex::new(conn))
    }

    #[test]
    fn test_log_and_verify_event() {
        let db = setup_test_db();
        let logger = AuditLogger::new(db).unwrap();

        let event = create_tool_execution_event(
            Some("user123".to_string()),
            Some("team456".to_string()),
            "file_read".to_string(),
            true,
            None,
        );

        let event_id = event.id.clone();
        logger.log(event).unwrap();

        // Verify event
        let is_valid = logger.verify_event(&event_id).unwrap();
        assert!(is_valid);
    }

    #[test]
    fn test_get_events_with_filters() {
        let db = setup_test_db();
        let logger = AuditLogger::new(db).unwrap();

        // Log multiple events
        for i in 0..5 {
            let event = create_tool_execution_event(
                Some(format!("user{}", i)),
                None,
                "file_read".to_string(),
                i % 2 == 0,
                None,
            );
            logger.log(event).unwrap();
        }

        // Get all events
        let events = logger.get_events(AuditFilters::default()).unwrap();
        assert_eq!(events.len(), 5);

        // Filter by status
        let events = logger
            .get_events(AuditFilters {
                status: Some("success".to_string()),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(events.len(), 3);
    }

    #[test]
    fn test_verify_all_events() {
        let db = setup_test_db();
        let logger = AuditLogger::new(db).unwrap();

        // Log multiple events
        for i in 0..3 {
            let event = create_tool_execution_event(
                Some(format!("user{}", i)),
                None,
                "file_read".to_string(),
                true,
                None,
            );
            logger.log(event).unwrap();
        }

        // Verify all
        let report = logger.verify_all_events().unwrap();
        assert_eq!(report.total_events, 3);
        assert_eq!(report.verified_events, 3);
        assert_eq!(report.tampered_events.len(), 0);
    }
}
