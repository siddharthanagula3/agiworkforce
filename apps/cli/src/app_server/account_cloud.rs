use crate::cloud::{chat, CloudClient, CloudError};
use crate::platform::runtime::session::PrivacyMode;
use agiworkforce_app_server::DeveloperSessionHostError;
use agiworkforce_protocol::account_cloud::{
    CloudHistoryListParams, CloudHistoryListResponse, CloudHistoryReadParams,
    CloudHistoryReadResponse,
};

pub(super) type Connection = (
    CloudClient,
    crate::tier_cache::ManagedRequestContext,
    String,
);

pub(super) fn connect(expected: Option<&str>) -> Result<Connection, DeveloperSessionHostError> {
    connect_under(crate::account_privacy_mode(), expected)
}

fn connect_under(
    privacy: PrivacyMode,
    expected: Option<&str>,
) -> Result<Connection, DeveloperSessionHostError> {
    CloudClient::admit(privacy).map_err(failure)?;
    let context = CloudClient::policy_context().map_err(failure)?;
    let client = CloudClient::from_managed_context(&context).map_err(failure)?;
    let scope = context
        .owner
        .clone()
        .ok_or_else(|| DeveloperSessionHostError::unavailable("The account identity is unknown"))?;
    if expected.is_some_and(|expected| expected != scope) {
        return Err(changed());
    }
    Ok((client, context, scope))
}

pub(super) fn changed() -> DeveloperSessionHostError {
    DeveloperSessionHostError::conflict(
        "The account or deployment changed. Reload Cloud history before continuing.",
    )
}

pub(super) fn failure(error: CloudError) -> DeveloperSessionHostError {
    match error {
        CloudError::Api { status: 404, .. } => DeveloperSessionHostError::not_found(
            "That Cloud conversation is unavailable in this account",
        ),
        other => DeveloperSessionHostError::unavailable(other.to_string()),
    }
}

pub(super) async fn list(
    params: CloudHistoryListParams,
) -> Result<CloudHistoryListResponse, DeveloperSessionHostError> {
    let (client, context, scope) = connect(params.scope.as_deref())?;
    let client = client
        .with_workspace(params.workspace.as_ref())
        .map_err(failure)?;
    if !context.is_current() {
        return Err(changed());
    }
    let response = chat::list_history_page(&client, params, scope)
        .await
        .map_err(failure)?;
    if !context.is_current() {
        return Err(changed());
    }
    Ok(response)
}

pub(super) async fn read(
    params: CloudHistoryReadParams,
) -> Result<CloudHistoryReadResponse, DeveloperSessionHostError> {
    let (client, context, _) = connect(Some(&params.scope))?;
    if !context.is_current() {
        return Err(changed());
    }
    let response = chat::read_history_page(&client, params)
        .await
        .map_err(failure)?;
    if !context.is_current() {
        return Err(changed());
    }
    Ok(response)
}

pub(super) async fn models(
    params: agiworkforce_protocol::account_cloud::CloudModelListParams,
) -> Result<agiworkforce_protocol::account_cloud::CloudModelListResponse, DeveloperSessionHostError>
{
    use agiworkforce_protocol::account_cloud::{CloudModelListResponse, CloudModelSummary};
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Catalogue {
        models: Vec<CloudModelSummary>,
        count: usize,
        plan_label: String,
    }
    let (client, context, scope) = connect(Some(&params.scope))?;
    if !context.is_current() {
        return Err(changed());
    }
    let catalogue: Catalogue = client
        .get_bounded(
            "/api/models/catalogue",
            &[],
            crate::app_server::TRANSCRIPT_JSON_BUDGET * 2,
        )
        .await
        .map_err(|error| DeveloperSessionHostError::unavailable(error.to_string()))?;
    if !context.is_current() {
        return Err(changed());
    }
    let mut seen = std::collections::HashSet::new();
    if catalogue.count != catalogue.models.len()
        || catalogue.plan_label.trim().is_empty()
        || catalogue.models.iter().any(|model| {
            model.id.trim().is_empty()
                || model.id != model.id.trim()
                || model.display_name.trim().is_empty()
                || model.developer_label.trim().is_empty()
                || !seen.insert(&model.id)
        })
    {
        return Err(DeveloperSessionHostError::unavailable(
            "The Cloud model catalogue is inconsistent",
        ));
    }
    let response = CloudModelListResponse {
        scope,
        models: catalogue.models,
        plan_label: catalogue.plan_label,
    };
    if serde_json::to_vec(&response)
        .map_err(|error| DeveloperSessionHostError::unavailable(error.to_string()))?
        .len()
        > crate::app_server::TRANSCRIPT_JSON_BUDGET
    {
        return Err(DeveloperSessionHostError::unavailable(
            "The Cloud model catalogue exceeds the runtime message budget",
        ));
    }
    Ok(response)
}

pub(super) async fn update(
    params: agiworkforce_protocol::account_cloud::CloudConversationUpdateParams,
) -> Result<
    agiworkforce_protocol::account_cloud::CloudConversationUpdateResponse,
    DeveloperSessionHostError,
> {
    chat::validate_conversation_update(&params)
        .map_err(DeveloperSessionHostError::invalid_request)?;
    let (client, context, _) = connect(Some(&params.scope))?;
    if !context.is_current() {
        return Err(changed());
    }
    if let agiworkforce_protocol::account_cloud::CloudConversationChange::Model { model } =
        &params.change
    {
        let catalogue = models(agiworkforce_protocol::account_cloud::CloudModelListParams {
            scope: params.scope.clone(),
        })
        .await?;
        if !catalogue
            .models
            .iter()
            .any(|entry| entry.id == *model && entry.selectable())
        {
            return Err(DeveloperSessionHostError::invalid_request(
                "The selected model is no longer available for this account. Reload the model picker.",
            ));
        }
        if !context.is_current() {
            return Err(changed());
        }
    }
    let response = chat::update_conversation(&client, params).await.map_err(|error| match error {
        CloudError::Api { status: 412, .. } => DeveloperSessionHostError::conflict("This conversation changed. Reload its latest messages and review your edit before trying again."),
        other => failure(other),
    })?;
    if !context.is_current() {
        return Err(changed());
    }
    Ok(response)
}

pub(super) async fn save_draft(
    params: agiworkforce_protocol::account_cloud::CloudDraftSaveParams,
) -> Result<agiworkforce_protocol::account_cloud::CloudDraftSaveResponse, DeveloperSessionHostError>
{
    crate::cloud::drafts::validate(&params).map_err(DeveloperSessionHostError::invalid_request)?;
    let (client, context, _) = connect(Some(&params.scope))?;
    if !context.is_current() {
        return Err(changed());
    }
    let response = crate::cloud::drafts::save(&client, params)
        .await
        .map_err(failure)?;
    if !context.is_current() {
        return Err(changed());
    }
    Ok(response)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_account_connection_outside_cloud_mode_is_refused_before_any_request() {
        for mode in [PrivacyMode::Local, PrivacyMode::Byok] {
            let Err(refused) = connect_under(mode, None) else {
                panic!("an account connection must be refused outside Cloud mode");
            };
            assert!(
                refused
                    .to_string()
                    .contains(&CloudError::NotManaged(mode).to_string()),
                "{refused}"
            );
        }
    }
}
