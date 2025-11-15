use crate::db::Database;
use crate::error::Result;
use crate::security::audit_logger::AuditFilters;
use crate::security::{
    create_tool_execution_event, create_workflow_execution_event, ApprovalAction, ApprovalDecision,
    ApprovalRequest, ApprovalStatistics, ApprovalWorkflow, AuditEvent,
    AuditIntegrityReport, AuditStatus, EnhancedAuditLogger,
};
use tauri::State;

/// Get audit events with filtering
#[tauri::command]
pub async fn get_audit_events(
    filters: AuditFilters,
    db: State<'_, Database>,
) -> Result<Vec<AuditEvent>> {
    let conn = db.get_connection();
    let logger = EnhancedAuditLogger::new(conn)?;

    logger.get_events(filters)
}

/// Verify audit event integrity
#[tauri::command]
pub async fn verify_audit_event(event_id: String, db: State<'_, Database>) -> Result<bool> {
    let conn = db.get_connection();
    let logger = EnhancedAuditLogger::new(conn)?;

    logger.verify_event(&event_id)
}

/// Verify all audit events integrity (for compliance audits)
#[tauri::command]
pub async fn verify_audit_integrity(db: State<'_, Database>) -> Result<AuditIntegrityReport> {
    let conn = db.get_connection();
    let logger = EnhancedAuditLogger::new(conn)?;

    logger.verify_all_events()
}

/// Log a tool execution audit event
#[tauri::command]
pub async fn log_tool_execution(
    user_id: Option<String>,
    team_id: Option<String>,
    tool_name: String,
    success: bool,
    metadata: Option<serde_json::Value>,
    db: State<'_, Database>,
) -> Result<()> {
    let conn = db.get_connection();
    let logger = EnhancedAuditLogger::new(conn)?;

    let event = create_tool_execution_event(user_id, team_id, tool_name, success, metadata);

    logger.log(event)
}

/// Log a workflow execution audit event
#[tauri::command]
pub async fn log_workflow_execution(
    user_id: Option<String>,
    team_id: Option<String>,
    workflow_id: String,
    status: String,
    metadata: Option<serde_json::Value>,
    db: State<'_, Database>,
) -> Result<()> {
    let conn = db.get_connection();
    let logger = EnhancedAuditLogger::new(conn)?;

    let audit_status = match status.as_str() {
        "success" => AuditStatus::Success,
        "failure" => AuditStatus::Failure,
        "blocked" => AuditStatus::Blocked,
        "pending" => AuditStatus::Pending,
        _ => AuditStatus::Pending,
    };

    let event =
        create_workflow_execution_event(user_id, team_id, workflow_id, audit_status, metadata);

    logger.log(event)
}

/// Create an approval request
#[tauri::command]
pub async fn create_approval_request(
    app_handle: tauri::AppHandle,
    requester_id: String,
    team_id: Option<String>,
    action: ApprovalAction,
    risk_level: String,
    justification: Option<String>,
    timeout_minutes: i64,
    db: State<'_, Database>,
) -> Result<String> {
    let conn = db.get_connection();
    let workflow = ApprovalWorkflow::new(conn);

    let risk = match risk_level.as_str() {
        "low" => crate::security::ApprovalRiskLevel::Low,
        "medium" => crate::security::ApprovalRiskLevel::Medium,
        "high" => crate::security::ApprovalRiskLevel::High,
        "critical" => crate::security::ApprovalRiskLevel::Critical,
        _ => crate::security::ApprovalRiskLevel::Medium,
    };

    let request_id = workflow.create_approval_request(
        requester_id,
        team_id,
        action.clone(),
        risk,
        justification.clone(),
        timeout_minutes,
    )?;

    // Emit frontend event for approval request
    let created_at = chrono::Utc::now();
    let approval_payload = crate::events::ApprovalRequestPayload {
        id: request_id.clone(),
        request_type: action.action_type.clone(),
        description: format!(
            "{} on {}",
            action.action_type,
            action
                .resource_id
                .as_ref()
                .unwrap_or(&"unknown resource".to_string())
        ),
        impact: justification.clone(),
        risk_level: risk_level.to_lowercase(),
        status: "pending".to_string(),
        created_at: created_at.to_rfc3339(),
        approved_at: None,
        rejected_at: None,
        rejection_reason: None,
        timeout_seconds: Some(timeout_minutes * 60),
        details: Some(serde_json::to_value(&action).unwrap_or(serde_json::json!({}))),
    };

    crate::events::emit_approval_request(&app_handle, approval_payload);

    Ok(request_id)
}

/// Get pending approval requests
#[tauri::command]
pub async fn get_pending_approvals(
    team_id: Option<String>,
    db: State<'_, Database>,
) -> Result<Vec<ApprovalRequest>> {
    let conn = db.get_connection();
    let workflow = ApprovalWorkflow::new(conn);

    workflow.get_pending_approvals(team_id)
}

/// Get approval request by ID
#[tauri::command]
pub async fn get_approval_request(
    request_id: String,
    db: State<'_, Database>,
) -> Result<ApprovalRequest> {
    let conn = db.get_connection();
    let workflow = ApprovalWorkflow::new(conn);

    workflow.get_request(&request_id)
}

/// Approve a request
#[tauri::command]
pub async fn approve_request(
    request_id: String,
    reviewer_id: String,
    reason: Option<String>,
    db: State<'_, Database>,
) -> Result<()> {
    let conn = db.get_connection();
    let workflow = ApprovalWorkflow::new(conn);

    let decision = ApprovalDecision::Approved { reason };

    workflow.approve_request(&request_id, &reviewer_id, decision)
}

/// Reject a request
#[tauri::command]
pub async fn reject_request(
    request_id: String,
    reviewer_id: String,
    reason: String,
    db: State<'_, Database>,
) -> Result<()> {
    let conn = db.get_connection();
    let workflow = ApprovalWorkflow::new(conn);

    let decision = ApprovalDecision::Rejected { reason };

    workflow.approve_request(&request_id, &reviewer_id, decision)
}

/// Check if action requires approval
#[tauri::command]
pub async fn requires_approval(action: ApprovalAction, db: State<'_, Database>) -> Result<bool> {
    let conn = db.get_connection();
    let workflow = ApprovalWorkflow::new(conn);

    Ok(workflow.requires_approval(&action))
}

/// Calculate risk level for an action
#[tauri::command]
pub async fn calculate_risk_level(
    action: ApprovalAction,
    db: State<'_, Database>,
) -> Result<String> {
    let conn = db.get_connection();
    let workflow = ApprovalWorkflow::new(conn);

    let risk = workflow.calculate_risk_level(&action);

    Ok(risk.as_str().to_string())
}

/// Get approval statistics
#[tauri::command]
pub async fn get_approval_statistics(
    team_id: Option<String>,
    db: State<'_, Database>,
) -> Result<ApprovalStatistics> {
    let conn = db.get_connection();
    let workflow = ApprovalWorkflow::new(conn);

    workflow.get_statistics(team_id)
}

/// Expire timed-out approval requests
#[tauri::command]
pub async fn expire_timed_out_requests(db: State<'_, Database>) -> Result<usize> {
    let conn = db.get_connection();
    let workflow = ApprovalWorkflow::new(conn);

    workflow.expire_timed_out_requests()
}
