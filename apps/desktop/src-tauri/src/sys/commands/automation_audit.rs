use serde::Deserialize;
use tauri::State;

use super::AppDatabase;
use crate::automation::audit::{acknowledge_outbox, list_outbox, AutomationAuditOutboxRow};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationAuditBatchRequest {
    pub max: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationAuditAcknowledgement {
    pub ids: Vec<i64>,
}

#[tauri::command]
pub fn automation_audit_outbox_list(
    db: State<'_, AppDatabase>,
    request: AutomationAuditBatchRequest,
) -> Result<Vec<AutomationAuditOutboxRow>, String> {
    let connection = db.connection()?;
    list_outbox(&connection, request.max)
}

#[tauri::command]
pub fn automation_audit_outbox_ack(
    db: State<'_, AppDatabase>,
    request: AutomationAuditAcknowledgement,
) -> Result<usize, String> {
    let connection = db.connection()?;
    acknowledge_outbox(&connection, &request.ids)
}
