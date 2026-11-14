use super::account_cloud::{changed, connect, failure};
use crate::cloud::projects::api;
use agiworkforce_app_server::DeveloperSessionHostError;
use agiworkforce_protocol::account_cloud::*;

pub(super) async fn list(
    params: CloudProjectListParams,
) -> Result<CloudProjectListResponse, DeveloperSessionHostError> {
    let (client, context, _) = connect(Some(&params.scope))?;
    if !context.is_current() {
        return Err(changed());
    }
    let response = api::list(&client, params).await.map_err(failure)?;
    if !context.is_current() {
        return Err(changed());
    }
    Ok(response)
}
pub(super) async fn read(
    params: CloudProjectTarget,
) -> Result<CloudProjectResponse, DeveloperSessionHostError> {
    let (client, context, _) = connect(Some(&params.scope))?;
    if !context.is_current() {
        return Err(changed());
    }
    let response = api::read(&client, &params).await.map_err(failure)?;
    if !context.is_current() {
        return Err(changed());
    }
    Ok(response)
}
pub(super) async fn create(
    params: CloudProjectCreateParams,
) -> Result<CloudProjectResponse, DeveloperSessionHostError> {
    api::validate_workspace(&params.workspace)
        .map_err(DeveloperSessionHostError::invalid_request)?;
    api::validate_details(&params.details).map_err(DeveloperSessionHostError::invalid_request)?;
    let (client, context, _) = connect(Some(&params.scope))?;
    if !context.is_current() {
        return Err(changed());
    }
    let response = api::create(&client, params).await.map_err(failure)?;
    if !context.is_current() {
        return Err(changed());
    }
    Ok(response)
}
pub(super) async fn update(
    params: CloudProjectUpdateParams,
) -> Result<CloudProjectResponse, DeveloperSessionHostError> {
    let (client, context, _) = connect(Some(&params.target.scope))?;
    if !context.is_current() {
        return Err(changed());
    }
    let response = api::update(&client, params)
        .await
        .map_err(|error| match error {
            crate::cloud::CloudError::Api { status: 412, .. } => {
                DeveloperSessionHostError::conflict(
                    "This project changed. Review its latest details before saving again.",
                )
            }
            other => failure(other),
        })?;
    if !context.is_current() {
        return Err(changed());
    }
    Ok(response)
}

pub(super) async fn files(
    params: CloudProjectTarget,
) -> Result<
    agiworkforce_protocol::project_files::CloudProjectFilesResponse,
    DeveloperSessionHostError,
> {
    let (client, context, _) = connect(Some(&params.scope))?;
    if !context.is_current() {
        return Err(changed());
    }
    let response = crate::cloud::project_files::list(&client, params)
        .await
        .map_err(failure)?;
    if !context.is_current() {
        return Err(changed());
    }
    Ok(response)
}
pub(super) async fn preview(
    params: agiworkforce_protocol::project_files::CloudProjectFileTarget,
) -> Result<agiworkforce_protocol::project_files::CloudProjectFilePreview, DeveloperSessionHostError>
{
    let (client, context, _) = connect(Some(&params.project.scope))?;
    if !context.is_current() {
        return Err(changed());
    }
    let response = crate::cloud::project_files::preview(&client, params)
        .await
        .map_err(failure)?;
    if !context.is_current() {
        return Err(changed());
    }
    Ok(response)
}

pub(super) async fn reindex(
    params: agiworkforce_protocol::project_files::CloudProjectFileVersion,
) -> Result<
    agiworkforce_protocol::project_files::CloudProjectFileReindexResponse,
    DeveloperSessionHostError,
> {
    let (client, context, _) = connect(Some(&params.target.project.scope))?;
    if !context.is_current() {
        return Err(changed());
    }
    let response = crate::cloud::project_files::reindex(&client, params)
        .await
        .map_err(failure)?;
    if !context.is_current() {
        return Err(changed());
    }
    Ok(response)
}
