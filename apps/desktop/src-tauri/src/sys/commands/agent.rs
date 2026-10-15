use crate::core::agent::approval::{ApprovalController, ApprovalResolution};
use serde_json::json;
use tauri::{Emitter, State};

#[tauri::command]
pub async fn agent_resolve_approval(
    app_handle: tauri::AppHandle,
    approval_state: State<'_, ApprovalController>,
    approval_id: String,
    decision: String,
    reason: Option<String>,
) -> Result<(), String> {
    let normalized = decision.to_lowercase();
    let resolution = match normalized.as_str() {
        "approve" | "approved" => ApprovalResolution::Approved,
        "reject" | "rejected" => ApprovalResolution::Rejected { reason },
        other => return Err(format!("Invalid approval decision: {}", other)),
    };

    approval_state
        .resolve(&approval_id, resolution.clone())
        .await
        .map_err(|e| format!("Failed to resolve approval: {}", e))?;

    match &resolution {
        ApprovalResolution::Approved => {
            let _ = app_handle.emit(
                "agi:approval_granted",
                json!({
                    "approval": {
                        "id": approval_id,
                    }
                }),
            );
            let _ = app_handle.emit(
                "agent:action_update",
                json!({
                    "action": {
                        "id": approval_id,
                        "status": "running",
                        "requiresApproval": false
                    }
                }),
            );
        }
        ApprovalResolution::Rejected { reason } => {
            let rejection_reason = reason
                .clone()
                .unwrap_or_else(|| "Rejected by user".to_string());
            let _ = app_handle.emit(
                "agi:approval_denied",
                json!({
                    "approval": {
                        "id": approval_id,
                        "rejectionReason": rejection_reason
                    }
                }),
            );
            let _ = app_handle.emit(
                "agent:action_update",
                json!({
                    "action": {
                        "id": approval_id,
                        "status": "failed",
                        "requiresApproval": false,
                        "error": reason.clone().unwrap_or_else(|| "Rejected".to_string())
                    }
                }),
            );
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn agent_set_workflow_hash(
    approval_state: State<'_, ApprovalController>,
    workflow_hash: Option<String>,
) -> Result<(), String> {
    approval_state.set_current_hash(workflow_hash).await;
    Ok(())
}
