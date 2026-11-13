use crate::cloud::{
    chat::normalize_conversation_revision,
    client::{CloudClient, CloudError},
};
use agiworkforce_protocol::{
    account_cloud::*,
    projects::{ProjectPrivacyMode, ProjectProviderMode, ProjectSourceSurface},
};
use serde::Deserialize;
use std::sync::LazyLock;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectContract {
    pub path: String,
    pub knowledge_files_segment: String,
    pub name_max_length: usize,
    pub description_max_length: usize,
    pub instructions_max_length: usize,
    pub list_max_page_size: u32,
}
static CONTRACT: LazyLock<ProjectContract> = LazyLock::new(|| {
    serde_json::from_str(include_str!(
        "../../../../../packages/contracts/cloud-contracts/src/project-contract.json"
    ))
    .expect("the compiled project contract must match its schema")
});
pub fn contract() -> &'static ProjectContract {
    &CONTRACT
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ChatDefaults {
    #[serde(default)]
    code_execution: bool,
    #[serde(default)]
    research: bool,
    skill_name: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Row {
    id: String,
    owner_user_id: String,
    organization_id: Option<String>,
    name: String,
    description: Option<String>,
    instructions: Option<String>,
    server_version: Option<String>,
    is_archived: bool,
    is_org_shared: bool,
    shared_access: Option<String>,
    default_privacy_mode: ProjectPrivacyMode,
    default_provider_mode: ProjectProviderMode,
    allowed_surfaces: Vec<ProjectSourceSurface>,
    default_model_id: Option<String>,
    conversation_count: Option<u32>,
    knowledge_file_count: Option<u32>,
    chat_defaults: Option<ChatDefaults>,
    space: Option<String>,
}
impl Row {
    fn project(
        self,
        client: &CloudClient,
        workspace: &CloudConversationWorkspace,
    ) -> Result<CloudProject, CloudError> {
        if uuid::Uuid::parse_str(&self.id).is_err()
            || self.owner_user_id.trim().is_empty()
            || CloudConversationWorkspace::from_organization(self.organization_id.as_deref())
                != *workspace
            || self.default_privacy_mode != ProjectPrivacyMode::Managed
            || !matches!(
                self.default_provider_mode,
                ProjectProviderMode::ManagedGateway | ProjectProviderMode::ManagedNative
            )
            || !self
                .allowed_surfaces
                .contains(&ProjectSourceSurface::Desktop)
        {
            return Err(CloudError::Decode(
                "This project is not available on this device in the selected Cloud workspace"
                    .into(),
            ));
        }
        let owner = self.owner_user_id == client.owner();
        if !owner
            && (!self.is_org_shared
                || matches!(workspace, CloudConversationWorkspace::Personal)
                || self
                    .shared_access
                    .as_deref()
                    .is_some_and(|access| !matches!(access, "read" | "write")))
        {
            return Err(CloudError::Decode(
                "The project returned an invalid access grant".into(),
            ));
        }
        let tool_defaults = self.chat_defaults.as_ref().is_some_and(|defaults| {
            defaults.code_execution
                || defaults.research
                || defaults
                    .skill_name
                    .as_ref()
                    .is_some_and(|name| !name.trim().is_empty())
        });
        Ok(CloudProject {
            id: self.id,
            name: self.name,
            description: self.description,
            instructions: self.instructions,
            organization_id: self.organization_id,
            version: self
                .server_version
                .map(|version| {
                    normalize_conversation_revision(&version)
                        .ok_or_else(|| CloudError::Decode("The project revision is invalid".into()))
                })
                .transpose()?,
            archived: self.is_archived,
            can_edit: owner || self.shared_access.as_deref() == Some("write"),
            can_archive: owner,
            default_model_id: self.default_model_id,
            conversation_count: self.conversation_count,
            knowledge_file_count: self.knowledge_file_count,
            can_start_chat: owner && !self.is_archived && !tool_defaults && self.space.is_none(),
        })
    }
}
#[derive(Deserialize)]
struct ProjectReply {
    project: Row,
}

pub fn validate_workspace(workspace: &CloudConversationWorkspace) -> Result<(), String> {
    if matches!(workspace, CloudConversationWorkspace::Organization { id } if uuid::Uuid::parse_str(id).is_err())
    {
        return Err("The project workspace identity is invalid".into());
    }
    Ok(())
}
pub fn validate_details(details: &CloudProjectDetails) -> Result<(), String> {
    let limits = contract();
    if details.name.trim().is_empty()
        || details.name.trim().encode_utf16().count() > limits.name_max_length
        || details.description.encode_utf16().count() > limits.description_max_length
        || details.instructions.encode_utf16().count() > limits.instructions_max_length
    {
        return Err(
            "The project name, description or instructions exceed their allowed limits".into(),
        );
    }
    Ok(())
}
fn target_path(target: &CloudProjectTarget) -> Result<String, CloudError> {
    validate_workspace(&target.workspace).map_err(CloudError::Decode)?;
    if uuid::Uuid::parse_str(&target.project_id).is_err() {
        return Err(CloudError::Decode("The project identity is invalid".into()));
    }
    Ok(format!(
        "{}/{}",
        contract().path,
        urlencoding::encode(&target.project_id)
    ))
}
pub async fn list(
    client: &CloudClient,
    params: CloudProjectListParams,
) -> Result<CloudProjectListResponse, CloudError> {
    validate_workspace(&params.workspace).map_err(CloudError::Decode)?;
    if params.limit == 0 || params.limit > contract().list_max_page_size {
        return Err(CloudError::Decode(
            "The project page size is invalid".into(),
        ));
    }
    let client = client.with_workspace(Some(&params.workspace))?;
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Page {
        projects: Vec<Row>,
        has_more: bool,
        next_cursor: Option<String>,
    }
    let mut query = vec![("limit", params.limit.to_string())];
    if let Some(cursor) = &params.cursor {
        query.push(("cursor", cursor.clone()));
    }
    let page: Page = client
        .get_bounded(
            &contract().path,
            &query,
            crate::app_server::TRANSCRIPT_JSON_BUDGET,
        )
        .await?;
    if page.has_more
        && (page.projects.is_empty()
            || page.next_cursor.is_none()
            || page.next_cursor == params.cursor)
    {
        return Err(CloudError::Decode(
            "The project cursor did not advance".into(),
        ));
    }
    let projects = page
        .projects
        .into_iter()
        .filter(|row| {
            row.allowed_surfaces
                .contains(&ProjectSourceSurface::Desktop)
        })
        .map(|row| row.project(&client, &params.workspace))
        .collect::<Result<Vec<_>, _>>()?;
    let mut seen = std::collections::HashSet::new();
    if projects.iter().any(|project| !seen.insert(&project.id)) {
        return Err(CloudError::Decode(
            "The project page contains duplicate identities".into(),
        ));
    }
    Ok(CloudProjectListResponse {
        scope: params.scope,
        workspace: params.workspace,
        projects,
        has_more: page.has_more,
        next_cursor: page.next_cursor,
    })
}
pub async fn read(
    client: &CloudClient,
    target: &CloudProjectTarget,
) -> Result<CloudProjectResponse, CloudError> {
    let path = target_path(target)?;
    let client = client.with_workspace(Some(&target.workspace))?;
    let wire: ProjectReply = client
        .get_bounded(&path, &[], crate::app_server::TRANSCRIPT_JSON_BUDGET)
        .await?;
    let project = wire.project.project(&client, &target.workspace)?;
    if project.id != target.project_id {
        return Err(CloudError::Decode(
            "The account returned a different project".into(),
        ));
    }
    Ok(CloudProjectResponse {
        scope: target.scope.clone(),
        workspace: target.workspace.clone(),
        project,
    })
}
fn details_match(project: &CloudProject, details: &CloudProjectDetails) -> bool {
    project.name == details.name.trim()
        && project.description.as_deref().unwrap_or_default() == details.description.trim()
        && project.instructions.as_deref().unwrap_or_default() == details.instructions.trim()
}
pub async fn create(
    client: &CloudClient,
    params: CloudProjectCreateParams,
) -> Result<CloudProjectResponse, CloudError> {
    validate_workspace(&params.workspace).map_err(CloudError::Decode)?;
    validate_details(&params.details).map_err(CloudError::Decode)?;
    let client = client.with_workspace(Some(&params.workspace))?;
    let wire: ProjectReply = client
        .post_bounded(
            &contract().path,
            &serde_json::json!({ "name": params.details.name.trim(),
        "description": params.details.description, "instructions": params.details.instructions }),
            crate::app_server::TRANSCRIPT_JSON_BUDGET,
        )
        .await?;
    let project = wire.project.project(&client, &params.workspace)?;
    if !details_match(&project, &params.details) {
        return Err(CloudError::Decode(
            "The account did not confirm the project details. Review the saved project list."
                .into(),
        ));
    }
    read(
        &client,
        &CloudProjectTarget {
            scope: params.scope,
            workspace: params.workspace,
            project_id: project.id,
        },
    )
    .await
}
pub async fn update(
    client: &CloudClient,
    params: CloudProjectUpdateParams,
) -> Result<CloudProjectResponse, CloudError> {
    let path = target_path(&params.target)?;
    let expected = normalize_conversation_revision(&params.expected_version)
        .ok_or_else(|| CloudError::Decode("An exact project revision is required".into()))?;
    if let CloudProjectChange::Details { details } = &params.change {
        validate_details(details).map_err(CloudError::Decode)?;
    }
    let current = read(client, &params.target).await?.project;
    if !current.can_edit
        || matches!(params.change, CloudProjectChange::Archive { .. }) && !current.can_archive
    {
        return Err(CloudError::Api {
            status: 403,
            message: "This project cannot be changed with your current access".into(),
        });
    }
    let body = match &params.change {
        CloudProjectChange::Details { details } => {
            serde_json::json!({ "name": details.name.trim(), "description": details.description, "instructions": details.instructions })
        }
        CloudProjectChange::Archive { archived } => serde_json::json!({ "isArchived": archived }),
    };
    let client = client.with_workspace(Some(&params.target.workspace))?;
    let (wire, etag): (ProjectReply, _) = client
        .put_versioned(
            &path,
            &body,
            &expected,
            crate::app_server::TRANSCRIPT_JSON_BUDGET,
        )
        .await?;
    let project = wire.project.project(&client, &params.target.workspace)?;
    if project.id != params.target.project_id
        || project.version.is_none()
        || etag
            .as_ref()
            .and_then(|etag| normalize_conversation_revision(etag))
            != project.version
    {
        return Err(CloudError::Decode("The account did not confirm the updated project identity and revision. Review it before retrying.".into()));
    }
    let revision_number = |value: &str| value.trim_matches('"').parse::<u64>().ok();
    let advanced = project
        .version
        .as_deref()
        .and_then(revision_number)
        .zip(revision_number(&expected))
        .is_some_and(|(current, previous)| current > previous);
    if !advanced {
        return Err(CloudError::Decode(
            "The project revision did not advance. Review the saved project before retrying."
                .into(),
        ));
    }
    let confirmed = match &params.change {
        CloudProjectChange::Details { details } => details_match(&project, details),
        CloudProjectChange::Archive { archived } => project.archived == *archived,
    };
    if !confirmed {
        return Err(CloudError::Decode(
            "The project changed before the save could be confirmed. Review it before retrying."
                .into(),
        ));
    }
    Ok(CloudProjectResponse {
        scope: params.target.scope,
        workspace: params.target.workspace,
        project,
    })
}
