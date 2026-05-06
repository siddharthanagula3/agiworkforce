use serde::{Deserialize, Serialize};

/// User-visible message returned by all Lovable migration commands until the
/// feature is fully implemented.  Callers should surface this string in the UI
/// rather than an opaque technical error.
const LOVABLE_NOT_IMPLEMENTED: &str =
    "Lovable workflow migration is planned but not yet available in the desktop app. \
     Check the in-app roadmap or docs/ROADMAP.md for the expected release timeline.";

#[derive(Debug, Deserialize)]
pub struct LovableConnectionCommandRequest {
    pub api_key: String,
    pub workspace_slug: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LovableConnectionCommandResponse {
    pub workspace_name: String,
    pub total_workflows: u32,
    pub beta_access: bool,
}

#[tauri::command]
pub fn migration_test_lovable_connection(
    request: LovableConnectionCommandRequest,
) -> Result<LovableConnectionCommandResponse, String> {
    let api_key = request.api_key.trim();
    if api_key.is_empty() {
        return Err("API key cannot be empty.".into());
    }

    let slug = request.workspace_slug.trim();
    if slug.is_empty() {
        return Err("Workspace slug cannot be empty.".into());
    }
    Err(LOVABLE_NOT_IMPLEMENTED.into())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LovableWorkflowItem {
    pub id: String,
    pub name: String,
    pub owner: String,
    pub last_run: String,
    pub status: String,
    pub estimated_minutes: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LovableWorkflowListResponse {
    pub workflows: Vec<LovableWorkflowItem>,
}

#[tauri::command]
pub fn migration_list_lovable_workflows(
    workspace_slug: String,
) -> Result<LovableWorkflowListResponse, String> {
    if workspace_slug.trim().is_empty() {
        return Err("Workspace slug cannot be empty.".into());
    }

    Err(LOVABLE_NOT_IMPLEMENTED.into())
}

#[derive(Debug, Deserialize)]
pub struct LovableMigrationLaunchRequest {
    pub workspace_slug: String,
    pub target_workspace: String,
    pub naming_prefix: Option<String>,
    pub auto_enable_schedules: bool,
    pub include_audit_logs: bool,
    pub notes: Option<String>,
    pub workflow_ids: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LovableMigrationLaunchResponse {
    pub queued: usize,
    pub estimate_minutes: u32,
}

#[tauri::command]
pub fn migration_launch_lovable(
    request: LovableMigrationLaunchRequest,
) -> Result<LovableMigrationLaunchResponse, String> {
    if request.target_workspace.trim().is_empty() {
        return Err("Target workspace is required.".into());
    }

    if request.workflow_ids.is_empty() {
        return Err("Select at least one workflow to migrate.".into());
    }

    Err(LOVABLE_NOT_IMPLEMENTED.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lovable_connection_rejects_fake_success_path() {
        let error = migration_test_lovable_connection(LovableConnectionCommandRequest {
            api_key: "lovable_live_fake".to_string(),
            workspace_slug: "acme-ops".to_string(),
        })
        .unwrap_err();

        assert!(error.contains("not yet available"));
    }

    #[test]
    fn test_lovable_workflow_list_rejects_fake_data_path() {
        let error = migration_list_lovable_workflows("acme-ops".to_string()).unwrap_err();
        assert!(error.contains("not yet available"));
    }

    #[test]
    fn test_lovable_launch_rejects_fake_queue_path() {
        let error = migration_launch_lovable(LovableMigrationLaunchRequest {
            workspace_slug: "acme-ops".to_string(),
            target_workspace: "target".to_string(),
            naming_prefix: None,
            auto_enable_schedules: true,
            include_audit_logs: true,
            notes: None,
            workflow_ids: vec!["wf-1".to_string()],
        })
        .unwrap_err();

        assert!(error.contains("not yet available"));
    }
}
