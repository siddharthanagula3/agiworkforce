use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};

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
    if !api_key.to_lowercase().contains("lovable") {
        return Err("Lovable API key invalid.".into());
    }

    let slug = request.workspace_slug.trim();
    if slug.is_empty() {
        return Err("Workspace slug cannot be empty.".into());
    }

    let workspace_name = slug
        .split(['-', '_'])
        .map(|segment| {
            let mut chars = segment.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ");

    Ok(LovableConnectionCommandResponse {
        workspace_name: if workspace_name.is_empty() {
            "Lovable Workspace".to_string()
        } else {
            workspace_name
        },
        total_workflows: 42,
        beta_access: true,
    })
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
    let now = Utc::now();
    let makeshift_seed = workspace_slug.len() as i64;
    let candidates = vec![
        LovableWorkflowItem {
            id: "wf-accural".into(),
            name: "Monthly Accrual Journal".into(),
            owner: "Finance Ops".into(),
            last_run: (now - Duration::minutes(90))
                .format("%b %d • %H:%M")
                .to_string(),
            status: "healthy".into(),
            estimated_minutes: 6,
        },
        LovableWorkflowItem {
            id: "wf-ticket-routing".into(),
            name: "CS Ticket Routing".into(),
            owner: "Support Automation".into(),
            last_run: (now - Duration::minutes(240 + makeshift_seed))
                .format("%b %d • %H:%M")
                .to_string(),
            status: "healthy".into(),
            estimated_minutes: 4,
        },
        LovableWorkflowItem {
            id: "wf-salesforce-sync".into(),
            name: "Salesforce → HubSpot Sync".into(),
            owner: "RevOps".into(),
            last_run: (now - Duration::minutes(720))
                .format("%b %d • %H:%M")
                .to_string(),
            status: "broken".into(),
            estimated_minutes: 12,
        },
        LovableWorkflowItem {
            id: "wf-google-sheets".into(),
            name: "Daily Metrics Sheet".into(),
            owner: "Analytics".into(),
            last_run: (now - Duration::minutes(960))
                .format("%b %d • %H:%M")
                .to_string(),
            status: "deprecated".into(),
            estimated_minutes: 3,
        },
    ];

    Ok(LovableWorkflowListResponse {
        workflows: candidates,
    })
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

    let estimate = (request.workflow_ids.len() as u32 * 5).max(5);

    tracing::info!(
        workspace = %request.workspace_slug,
        target = %request.target_workspace,
        workflows = %request.workflow_ids.len(),
        auto_enable = request.auto_enable_schedules,
        include_audit = request.include_audit_logs,
        "Queued Lovable workflows for migration"
    );

    Ok(LovableMigrationLaunchResponse {
        queued: request.workflow_ids.len(),
        estimate_minutes: estimate,
    })
}
