use crate::sys::error::Result;
use crate::sys::security::{
    ApprovalDecision, ApprovalRequest, ApprovalStatistics, ApprovalWorkflow, AuditEvent,
    AuditFilters, AuditIntegrityReport, AuditLogger,
};
use tauri::State;

use super::AppDatabase;

#[tauri::command]
pub async fn get_audit_events(
    filters: AuditFilters,
    db: State<'_, AppDatabase>,
) -> Result<Vec<AuditEvent>> {
    let conn = db.conn.clone();
    let logger = AuditLogger::new(conn)?;

    logger.get_events(filters)
}

#[tauri::command]
pub async fn verify_audit_integrity(db: State<'_, AppDatabase>) -> Result<AuditIntegrityReport> {
    let conn = db.conn.clone();
    let logger = AuditLogger::new(conn)?;

    logger.verify_all_events()
}

#[tauri::command]
pub async fn get_pending_approvals(
    team_id: Option<String>,
    db: State<'_, AppDatabase>,
) -> Result<Vec<ApprovalRequest>> {
    let conn = db.conn.clone();
    let workflow = ApprovalWorkflow::new(conn);

    workflow.get_pending_approvals(team_id)
}

#[tauri::command]
pub async fn approve_request(
    request_id: String,
    reviewer_id: String,
    reason: Option<String>,
    db: State<'_, AppDatabase>,
) -> Result<()> {
    let conn = db.conn.clone();
    let workflow = ApprovalWorkflow::new(conn);

    let decision = ApprovalDecision::Approved { reason };

    workflow.approve_request(&request_id, &reviewer_id, decision)
}

#[tauri::command]
pub async fn reject_request(
    request_id: String,
    reviewer_id: String,
    reason: String,
    db: State<'_, AppDatabase>,
) -> Result<()> {
    let conn = db.conn.clone();
    let workflow = ApprovalWorkflow::new(conn);

    let decision = ApprovalDecision::Rejected { reason };

    workflow.approve_request(&request_id, &reviewer_id, decision)
}

#[tauri::command]
pub async fn get_approval_statistics(
    team_id: Option<String>,
    db: State<'_, AppDatabase>,
) -> Result<ApprovalStatistics> {
    let conn = db.conn.clone();
    let workflow = ApprovalWorkflow::new(conn);

    workflow.get_statistics(team_id)
}

#[tauri::command]
pub async fn expire_timed_out_requests(db: State<'_, AppDatabase>) -> Result<usize> {
    let conn = db.conn.clone();
    let workflow = ApprovalWorkflow::new(conn);

    workflow.expire_timed_out_requests()
}
