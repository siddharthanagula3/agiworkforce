use crate::error::{Error, Result};
use chrono::Utc;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use uuid::Uuid;

/// Risk levels for approval workflow
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum RiskLevel {
    Low,      // Auto-approve
    Medium,   // Require editor+ approval
    High,     // Require admin+ approval
    Critical, // Require owner approval
}

impl RiskLevel {
    pub fn as_str(&self) -> &str {
        match self {
            Self::Low => "low",
            Self::Medium => "medium",
            Self::High => "high",
            Self::Critical => "critical",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "low" => Self::Low,
            "medium" => Self::Medium,
            "high" => Self::High,
            "critical" => Self::Critical,
            _ => Self::Medium,
        }
    }
}

/// Approval request status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ApprovalStatus {
    Pending,
    Approved,
    Rejected,
    TimedOut,
}

impl ApprovalStatus {
    pub fn as_str(&self) -> &str {
        match self {
            Self::Pending => "pending",
            Self::Approved => "approved",
            Self::Rejected => "rejected",
            Self::TimedOut => "timed_out",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "pending" => Self::Pending,
            "approved" => Self::Approved,
            "rejected" => Self::Rejected,
            "timed_out" => Self::TimedOut,
            _ => Self::Pending,
        }
    }
}

/// Approval action description
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApprovalAction {
    pub action_type: String,
    pub resource_type: Option<String>,
    pub resource_id: Option<String>,
    pub parameters: serde_json::Value,
}

/// Approval decision
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum ApprovalDecision {
    Approved { reason: Option<String> },
    Rejected { reason: String },
}

/// Approval request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApprovalRequest {
    pub id: String,
    pub requester_id: String,
    pub team_id: Option<String>,
    pub action: ApprovalAction,
    pub risk_level: RiskLevel,
    pub justification: Option<String>,
    pub status: ApprovalStatus,
    pub created_at: i64,
    pub reviewed_by: Option<String>,
    pub reviewed_at: Option<i64>,
    pub decision_reason: Option<String>,
    pub expires_at: i64,
}

/// Approval workflow system
pub struct ApprovalWorkflow {
    db: Arc<Mutex<Connection>>,
}

impl ApprovalWorkflow {
    pub fn new(db: Arc<Mutex<Connection>>) -> Self {
        Self { db }
    }

    /// Create a new approval request
    pub fn create_approval_request(
        &self,
        requester_id: String,
        team_id: Option<String>,
        action: ApprovalAction,
        risk_level: RiskLevel,
        justification: Option<String>,
        timeout_minutes: i64,
    ) -> Result<String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| Error::Other(format!("Failed to acquire database lock: {}", e)))?;

        let id = Uuid::new_v4().to_string();
        let now = Utc::now().timestamp();
        let expires_at = now + (timeout_minutes * 60);

        conn.execute(
            "INSERT INTO approval_requests (
                id, requester_id, team_id, action_type,
                resource_type, resource_id, risk_level,
                justification, status, created_at, expires_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![
                id,
                requester_id,
                team_id,
                action.action_type,
                action.resource_type,
                action.resource_id,
                risk_level.as_str(),
                justification,
                ApprovalStatus::Pending.as_str(),
                now,
                expires_at,
            ],
        )?;

        Ok(id)
    }

    /// Approve a request
    pub fn approve_request(
        &self,
        request_id: &str,
        reviewer_id: &str,
        decision: ApprovalDecision,
    ) -> Result<()> {
        let conn = self
            .db
            .lock()
            .map_err(|e| Error::Other(format!("Failed to acquire database lock: {}", e)))?;

        let now = Utc::now().timestamp();

        match decision {
            ApprovalDecision::Approved { reason } => {
                conn.execute(
                    "UPDATE approval_requests
                     SET status = ?1, reviewed_by = ?2, reviewed_at = ?3, decision_reason = ?4
                     WHERE id = ?5 AND status = 'pending'",
                    rusqlite::params![
                        ApprovalStatus::Approved.as_str(),
                        reviewer_id,
                        now,
                        reason,
                        request_id,
                    ],
                )?;
            }
            ApprovalDecision::Rejected { reason } => {
                conn.execute(
                    "UPDATE approval_requests
                     SET status = ?1, reviewed_by = ?2, reviewed_at = ?3, decision_reason = ?4
                     WHERE id = ?5 AND status = 'pending'",
                    rusqlite::params![
                        ApprovalStatus::Rejected.as_str(),
                        reviewer_id,
                        now,
                        reason,
                        request_id,
                    ],
                )?;
            }
        }

        Ok(())
    }

    /// Get approval request by ID
    pub fn get_request(&self, request_id: &str) -> Result<ApprovalRequest> {
        let conn = self
            .db
            .lock()
            .map_err(|e| Error::Other(format!("Failed to acquire database lock: {}", e)))?;

        let request = conn.query_row(
            "SELECT id, requester_id, team_id, action_type, resource_type,
                    resource_id, risk_level, justification, status,
                    created_at, reviewed_by, reviewed_at, decision_reason, expires_at
             FROM approval_requests WHERE id = ?1",
            [request_id],
            |row| {
                Ok(ApprovalRequest {
                    id: row.get(0)?,
                    requester_id: row.get(1)?,
                    team_id: row.get(2)?,
                    action: ApprovalAction {
                        action_type: row.get(3)?,
                        resource_type: row.get(4)?,
                        resource_id: row.get(5)?,
                        parameters: serde_json::json!({}),
                    },
                    risk_level: RiskLevel::from_str(&row.get::<_, String>(6)?),
                    justification: row.get(7)?,
                    status: ApprovalStatus::from_str(&row.get::<_, String>(8)?),
                    created_at: row.get(9)?,
                    reviewed_by: row.get(10)?,
                    reviewed_at: row.get(11)?,
                    decision_reason: row.get(12)?,
                    expires_at: row.get(13)?,
                })
            },
        )?;

        Ok(request)
    }

    /// Get pending approval requests
    pub fn get_pending_approvals(&self, team_id: Option<String>) -> Result<Vec<ApprovalRequest>> {
        let conn = self
            .db
            .lock()
            .map_err(|e| Error::Other(format!("Failed to acquire database lock: {}", e)))?;

        let mut query = String::from(
            "SELECT id, requester_id, team_id, action_type, resource_type,
                    resource_id, risk_level, justification, status,
                    created_at, reviewed_by, reviewed_at, decision_reason, expires_at
             FROM approval_requests WHERE status = 'pending'",
        );

        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(team_id) = team_id {
            query.push_str(" AND team_id = ?");
            params.push(Box::new(team_id));
        }

        query.push_str(" ORDER BY created_at DESC");

        let mut stmt = conn.prepare(&query)?;
        let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();

        let requests = stmt
            .query_map(param_refs.as_slice(), |row| {
                Ok(ApprovalRequest {
                    id: row.get(0)?,
                    requester_id: row.get(1)?,
                    team_id: row.get(2)?,
                    action: ApprovalAction {
                        action_type: row.get(3)?,
                        resource_type: row.get(4)?,
                        resource_id: row.get(5)?,
                        parameters: serde_json::json!({}),
                    },
                    risk_level: RiskLevel::from_str(&row.get::<_, String>(6)?),
                    justification: row.get(7)?,
                    status: ApprovalStatus::from_str(&row.get::<_, String>(8)?),
                    created_at: row.get(9)?,
                    reviewed_by: row.get(10)?,
                    reviewed_at: row.get(11)?,
                    decision_reason: row.get(12)?,
                    expires_at: row.get(13)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(requests)
    }

    /// Calculate risk level based on action
    pub fn calculate_risk_level(&self, action: &ApprovalAction) -> RiskLevel {
        // Risk calculation logic based on action type
        match action.action_type.as_str() {
            // Low risk - read-only operations
            "file_read" | "ui_screenshot" | "db_query_read" => RiskLevel::Low,

            // Medium risk - write operations with limited scope
            "file_write" | "ui_click" | "ui_type" => RiskLevel::Medium,

            // High risk - destructive operations
            "file_delete" | "db_query_write" | "api_call_delete" => RiskLevel::High,

            // Critical risk - system-level operations
            "system_command" | "process_terminate" | "config_change" => RiskLevel::Critical,

            // Default to medium for unknown actions
            _ => RiskLevel::Medium,
        }
    }

    /// Check if an action requires approval
    pub fn requires_approval(&self, action: &ApprovalAction) -> bool {
        let risk_level = self.calculate_risk_level(action);

        // Low risk actions can be auto-approved
        risk_level != RiskLevel::Low
    }

    /// Expire timed-out requests
    pub fn expire_timed_out_requests(&self) -> Result<usize> {
        let conn = self
            .db
            .lock()
            .map_err(|e| Error::Other(format!("Failed to acquire database lock: {}", e)))?;

        let now = Utc::now().timestamp();

        let updated = conn.execute(
            "UPDATE approval_requests
             SET status = ?1
             WHERE status = 'pending' AND expires_at < ?2",
            rusqlite::params![ApprovalStatus::TimedOut.as_str(), now],
        )?;

        Ok(updated)
    }

    /// Get approval statistics
    pub fn get_statistics(&self, team_id: Option<String>) -> Result<ApprovalStatistics> {
        let conn = self
            .db
            .lock()
            .map_err(|e| Error::Other(format!("Failed to acquire database lock: {}", e)))?;

        let mut query = String::from(
            "SELECT
                COUNT(*) as total,
                SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
                SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'timed_out' THEN 1 ELSE 0 END) as timed_out
             FROM approval_requests WHERE 1=1",
        );

        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(team_id) = team_id {
            query.push_str(" AND team_id = ?");
            params.push(Box::new(team_id));
        }

        let mut stmt = conn.prepare(&query)?;
        let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();

        let stats = stmt.query_row(param_refs.as_slice(), |row| {
            Ok(ApprovalStatistics {
                total_requests: row.get(0)?,
                approved: row.get(1)?,
                rejected: row.get(2)?,
                pending: row.get(3)?,
                timed_out: row.get(4)?,
            })
        })?;

        Ok(stats)
    }
}

/// Approval statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApprovalStatistics {
    pub total_requests: i64,
    pub approved: i64,
    pub rejected: i64,
    pub pending: i64,
    pub timed_out: i64,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_test_db() -> Arc<Mutex<Connection>> {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("PRAGMA foreign_keys = ON", []).unwrap();

        // Create approval_requests table
        conn.execute(
            "CREATE TABLE approval_requests (
                id TEXT PRIMARY KEY,
                requester_id TEXT NOT NULL,
                team_id TEXT,
                action_type TEXT NOT NULL,
                resource_type TEXT,
                resource_id TEXT,
                risk_level TEXT NOT NULL,
                justification TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at INTEGER NOT NULL,
                reviewed_by TEXT,
                reviewed_at INTEGER,
                decision_reason TEXT,
                expires_at INTEGER NOT NULL
            )",
            [],
        )
        .unwrap();

        Arc::new(Mutex::new(conn))
    }

    #[test]
    fn test_create_approval_request() {
        let db = setup_test_db();
        let workflow = ApprovalWorkflow::new(db);

        let action = ApprovalAction {
            action_type: "file_delete".to_string(),
            resource_type: Some("file".to_string()),
            resource_id: Some("/test.txt".to_string()),
            parameters: serde_json::json!({}),
        };

        let request_id = workflow
            .create_approval_request(
                "user123".to_string(),
                Some("team456".to_string()),
                action,
                RiskLevel::High,
                Some("Need to delete test file".to_string()),
                30,
            )
            .unwrap();

        assert!(!request_id.is_empty());
    }

    #[test]
    fn test_approve_request() {
        let db = setup_test_db();
        let workflow = ApprovalWorkflow::new(db);

        let action = ApprovalAction {
            action_type: "file_delete".to_string(),
            resource_type: Some("file".to_string()),
            resource_id: Some("/test.txt".to_string()),
            parameters: serde_json::json!({}),
        };

        let request_id = workflow
            .create_approval_request(
                "user123".to_string(),
                Some("team456".to_string()),
                action,
                RiskLevel::High,
                None,
                30,
            )
            .unwrap();

        // Approve the request
        workflow
            .approve_request(
                &request_id,
                "admin789",
                ApprovalDecision::Approved {
                    reason: Some("Looks good".to_string()),
                },
            )
            .unwrap();

        // Check status
        let request = workflow.get_request(&request_id).unwrap();
        assert_eq!(request.status, ApprovalStatus::Approved);
        assert_eq!(request.reviewed_by, Some("admin789".to_string()));
    }

    #[test]
    fn test_get_pending_approvals() {
        let db = setup_test_db();
        let workflow = ApprovalWorkflow::new(db);

        // Create multiple requests
        for i in 0..3 {
            let action = ApprovalAction {
                action_type: "file_delete".to_string(),
                resource_type: Some("file".to_string()),
                resource_id: Some(format!("/test{}.txt", i)),
                parameters: serde_json::json!({}),
            };

            workflow
                .create_approval_request(
                    format!("user{}", i),
                    Some("team456".to_string()),
                    action,
                    RiskLevel::High,
                    None,
                    30,
                )
                .unwrap();
        }

        let pending = workflow
            .get_pending_approvals(Some("team456".to_string()))
            .unwrap();
        assert_eq!(pending.len(), 3);
    }

    #[test]
    fn test_calculate_risk_level() {
        let db = setup_test_db();
        let workflow = ApprovalWorkflow::new(db);

        // Test low risk
        let action = ApprovalAction {
            action_type: "file_read".to_string(),
            resource_type: None,
            resource_id: None,
            parameters: serde_json::json!({}),
        };
        assert_eq!(workflow.calculate_risk_level(&action), RiskLevel::Low);

        // Test high risk
        let action = ApprovalAction {
            action_type: "file_delete".to_string(),
            resource_type: None,
            resource_id: None,
            parameters: serde_json::json!({}),
        };
        assert_eq!(workflow.calculate_risk_level(&action), RiskLevel::High);

        // Test critical risk
        let action = ApprovalAction {
            action_type: "system_command".to_string(),
            resource_type: None,
            resource_id: None,
            parameters: serde_json::json!({}),
        };
        assert_eq!(workflow.calculate_risk_level(&action), RiskLevel::Critical);
    }

    #[test]
    fn test_requires_approval() {
        let db = setup_test_db();
        let workflow = ApprovalWorkflow::new(db);

        // Low risk should not require approval
        let action = ApprovalAction {
            action_type: "file_read".to_string(),
            resource_type: None,
            resource_id: None,
            parameters: serde_json::json!({}),
        };
        assert!(!workflow.requires_approval(&action));

        // High risk should require approval
        let action = ApprovalAction {
            action_type: "file_delete".to_string(),
            resource_type: None,
            resource_id: None,
            parameters: serde_json::json!({}),
        };
        assert!(workflow.requires_approval(&action));
    }

    #[test]
    fn test_get_statistics() {
        let db = setup_test_db();
        let workflow = ApprovalWorkflow::new(db);

        // Create and approve some requests
        for i in 0..5 {
            let action = ApprovalAction {
                action_type: "file_delete".to_string(),
                resource_type: Some("file".to_string()),
                resource_id: Some(format!("/test{}.txt", i)),
                parameters: serde_json::json!({}),
            };

            let request_id = workflow
                .create_approval_request(
                    format!("user{}", i),
                    Some("team456".to_string()),
                    action,
                    RiskLevel::High,
                    None,
                    30,
                )
                .unwrap();

            if i < 2 {
                workflow
                    .approve_request(
                        &request_id,
                        "admin",
                        ApprovalDecision::Approved { reason: None },
                    )
                    .unwrap();
            } else if i == 2 {
                workflow
                    .approve_request(
                        &request_id,
                        "admin",
                        ApprovalDecision::Rejected {
                            reason: "Not approved".to_string(),
                        },
                    )
                    .unwrap();
            }
        }

        let stats = workflow
            .get_statistics(Some("team456".to_string()))
            .unwrap();
        assert_eq!(stats.total_requests, 5);
        assert_eq!(stats.approved, 2);
        assert_eq!(stats.rejected, 1);
        assert_eq!(stats.pending, 2);
    }
}
