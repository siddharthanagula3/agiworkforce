use crate::sys::security::{ApprovalDecision, ApprovalWorkflow};
use tauri::{AppHandle, Emitter, State};

use super::AppDatabase;

#[tauri::command]
pub async fn approve_operation(
    app_handle: AppHandle,
    approval_id: String,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    tracing::info!("[Commands] Approving operation: {}", approval_id);

    let workflow = ApprovalWorkflow::new(db.conn.clone());

    let decision = ApprovalDecision::Approved { reason: None };
    workflow
        .approve_request(&approval_id, "system", decision)
        .map_err(|e| format!("Failed to approve request: {}", e))?;

    tracing::info!("[Commands] Approval {} granted in workflow", approval_id);

    app_handle
        .emit(
            "agi:approval_granted",
            serde_json::json!({
                "approval": {
                    "id": approval_id,
                }
            }),
        )
        .map_err(|e| format!("Failed to emit approval event: {}", e))?;

    tracing::info!(
        "[Commands] Approval {} events emitted successfully",
        approval_id
    );

    Ok(())
}

#[tauri::command]
pub async fn reject_operation(
    app_handle: AppHandle,
    approval_id: String,
    reason: Option<String>,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    tracing::info!(
        "[Commands] Rejecting operation: {} (reason: {:?})",
        approval_id,
        reason
    );

    let rejection_reason = reason.unwrap_or_else(|| "User rejected operation".to_string());

    let workflow = ApprovalWorkflow::new(db.conn.clone());

    let decision = ApprovalDecision::Rejected {
        reason: rejection_reason.clone(),
    };
    workflow
        .approve_request(&approval_id, "system", decision)
        .map_err(|e| format!("Failed to reject request: {}", e))?;

    tracing::info!("[Commands] Approval {} rejected in workflow", approval_id);

    app_handle
        .emit(
            "agi:approval_denied",
            serde_json::json!({
                "approval": {
                    "id": approval_id,
                    "rejectionReason": rejection_reason,
                }
            }),
        )
        .map_err(|e| format!("Failed to emit rejection event: {}", e))?;

    tracing::info!(
        "[Commands] Approval {} denial events emitted successfully",
        approval_id
    );

    Ok(())
}
