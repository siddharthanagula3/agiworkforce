use agiworkforce_app_server::DeveloperSessionHostError;
use agiworkforce_protocol::account_cloud::*;
use serde::Deserialize;

use super::{account_cloud, TRANSCRIPT_JSON_BUDGET};
use crate::cloud::CloudClient;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Entry {
    id: String,
    kind: String,
    organization_id: Option<String>,
    name: String,
    slug: String,
    role: Option<String>,
    is_primary: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Workspaces {
    account_id: Option<String>,
    workspaces: Vec<Entry>,
    active_workspace_id: Option<String>,
    active_organization_id: Option<String>,
    scope: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Selection {
    workspace_id: Option<String>,
    active_organization_id: Option<String>,
    scope: String,
}

fn personal_selector() -> &'static str {
    static CONFIG: std::sync::LazyLock<serde_json::Value> = std::sync::LazyLock::new(|| {
        serde_json::from_str(include_str!(
            "../../../../packages/contracts/types/src/workspace-contract.json"
        ))
        .expect("the compiled workspace contract must be valid")
    });
    CONFIG["personalSelector"]
        .as_str()
        .expect("the compiled workspace selector must be a string")
}

async fn projection(
    client: &CloudClient,
    scope: String,
) -> Result<CloudWorkspacesListResponse, DeveloperSessionHostError> {
    let body: Workspaces = client
        .get_bounded(
            crate::cloud::workspaces_path(),
            &[],
            TRANSCRIPT_JSON_BUDGET * 2,
        )
        .await
        .map_err(account_cloud::failure)?;
    project(body, client.owner(), scope)
}

fn project(
    body: Workspaces,
    owner: &str,
    scope: String,
) -> Result<CloudWorkspacesListResponse, DeveloperSessionHostError> {
    if body.account_id.as_deref() != Some(owner) {
        return Err(DeveloperSessionHostError::unavailable(
            "The workspace list did not prove the current account",
        ));
    }
    let personal = body
        .workspaces
        .iter()
        .filter(|row| row.kind == "personal")
        .max_by_key(|row| row.is_primary);
    let mut choices = vec![CloudWorkspaceSummary {
        id: personal_selector().into(),
        name: personal
            .map(|row| row.name.clone())
            .filter(|name| !name.trim().is_empty())
            .unwrap_or_else(|| "Personal".into()),
        slug: personal.map(|row| row.slug.clone()).unwrap_or_default(),
        selector: CloudConversationWorkspace::Personal,
        role: None,
    }];
    let mut seen = std::collections::HashSet::new();
    for entry in body.workspaces {
        if uuid::Uuid::parse_str(&entry.id).is_err()
            || !seen.insert(entry.id.clone())
            || entry.name.trim().is_empty()
        {
            return Err(DeveloperSessionHostError::unavailable(
                "The account returned invalid or duplicate workspaces",
            ));
        }
        match entry.kind.as_str() {
            "personal" if entry.organization_id.is_none() => {}
            "organization" => {
                let id = entry
                    .organization_id
                    .filter(|id| uuid::Uuid::parse_str(id).is_ok())
                    .ok_or_else(|| {
                        DeveloperSessionHostError::unavailable(
                            "The organization workspace has no valid organization identity",
                        )
                    })?;
                choices.push(CloudWorkspaceSummary {
                    id: entry.id,
                    name: entry.name,
                    slug: entry.slug,
                    selector: CloudConversationWorkspace::Organization { id },
                    role: entry.role,
                });
            }
            _ => {
                return Err(DeveloperSessionHostError::unavailable(
                    "The account returned an unknown workspace kind",
                ))
            }
        }
    }
    let selected = match (body.scope.as_str(), body.active_organization_id) {
        ("personal", None) => choices[0].clone(),
        ("organization", Some(organization)) => choices
            .iter()
            .find(|row| {
                Some(&row.id) == body.active_workspace_id.as_ref()
                    && row.selector
                        == (CloudConversationWorkspace::Organization {
                            id: organization.clone(),
                        })
            })
            .cloned()
            .ok_or_else(|| {
                DeveloperSessionHostError::unavailable(
                    "The active workspace is not in this account's memberships",
                )
            })?,
        _ => {
            return Err(DeveloperSessionHostError::unavailable(
                "The active workspace could not be proven",
            ))
        }
    };
    let response = CloudWorkspacesListResponse {
        scope,
        workspaces: choices,
        selected,
    };
    if serde_json::to_vec(&response)
        .map_err(|error| DeveloperSessionHostError::unavailable(error.to_string()))?
        .len()
        > TRANSCRIPT_JSON_BUDGET
    {
        return Err(DeveloperSessionHostError::unavailable(
            "The workspace list exceeds the native message budget",
        ));
    }
    Ok(response)
}

pub(super) async fn list(
    params: CloudWorkspacesListParams,
) -> Result<CloudWorkspacesListResponse, DeveloperSessionHostError> {
    let (client, context, scope) = account_cloud::connect(params.scope.as_deref())?;
    if !context.is_current() {
        return Err(account_cloud::changed());
    }
    let response = projection(&client, scope).await?;
    if !context.is_current() {
        return Err(account_cloud::changed());
    }
    Ok(response)
}

pub(super) async fn select(
    params: CloudWorkspaceSelectParams,
) -> Result<CloudWorkspaceSelectResponse, DeveloperSessionHostError> {
    let (client, context, scope) = account_cloud::connect(Some(&params.scope))?;
    if !context.is_current() {
        return Err(account_cloud::changed());
    }
    let current = projection(&client, scope.clone()).await?;
    let selected = current
        .workspaces
        .into_iter()
        .find(|workspace| workspace.id == params.id)
        .ok_or_else(|| {
            DeveloperSessionHostError::invalid_request(
                "That workspace is not available to this account. Reload workspaces.",
            )
        })?;
    if !context.is_current() {
        return Err(account_cloud::changed());
    }
    let response: Selection = client
        .call(
            &crate::cloud::Route::put(crate::cloud::workspaces_path()),
            &[],
            Some(&serde_json::json!({"workspaceId": selected.id})),
        )
        .await
        .map_err(account_cloud::failure)?;
    let expected = match &selected.selector {
        CloudConversationWorkspace::Personal => {
            response.scope == "personal"
                && response.active_organization_id.is_none()
                && response.workspace_id.is_none()
        }
        CloudConversationWorkspace::Organization { id } => {
            response.scope == "organization"
                && response.active_organization_id.as_ref() == Some(id)
                && response.workspace_id.as_ref() == Some(&selected.id)
        }
    };
    if !expected {
        return Err(DeveloperSessionHostError::unavailable("The account did not confirm the selected workspace. Reload workspaces before continuing."));
    }
    if !context.is_current() {
        return Err(account_cloud::changed());
    }
    Ok(CloudWorkspaceSelectResponse { scope, selected })
}

#[cfg(test)]
#[path = "cloud_workspaces_tests.rs"]
mod tests;
