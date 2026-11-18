use agiworkforce_protocol::developer_session::{
    DeveloperAgentMode, DeveloperReasoningEffort, DeveloperSessionTrustMode, HostModelSummary,
    LocalModelListResponse, SettingsReadResponse, SettingsWriteParams,
};
use anyhow::{ensure, Result};

pub fn error_message(error: &anyhow::Error) -> String {
    match error.downcast_ref::<agiworkforce_app_server::DeveloperSessionClientError>() {
        Some(agiworkforce_app_server::DeveloperSessionClientError::Remote { message, .. }) => {
            message.clone()
        }
        Some(_) => "The coding runtime could not confirm the new-session default. Reopen the folder and reload defaults before trying again.".into(),
        None => error.to_string(),
    }
}

pub fn admit_models(response: LocalModelListResponse) -> Vec<HostModelSummary> {
    let mut models = response.host_models;
    for local in response.models {
        let provider = local.provider.as_str();
        if !models
            .iter()
            .any(|model| model.id == local.id && model.provider == provider)
        {
            models.push(HostModelSummary {
                id: local.id,
                provider: provider.to_owned(),
                reachable: true,
                unreachable: None,
                trust_mode: DeveloperSessionTrustMode::Local,
            });
        }
    }
    models.sort_by(|left, right| {
        left.id
            .cmp(&right.id)
            .then(left.provider.cmp(&right.provider))
    });
    models
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DefaultChange {
    Model {
        id: String,
        provider: String,
    },
    Effort(DeveloperReasoningEffort),
    Mode {
        mode: DeveloperAgentMode,
        confirmed: bool,
    },
}

#[derive(Default)]
pub struct HostDefaults {
    pub visible: bool,
    pub snapshot: Option<SettingsReadResponse>,
    pub models: Vec<HostModelSummary>,
    pub operation: Option<uuid::Uuid>,
    pub writing: bool,
    pub error: Option<String>,
    pub notice: Option<String>,
}

impl HostDefaults {
    pub fn begin(&mut self, writing: bool) -> uuid::Uuid {
        let id = uuid::Uuid::new_v4();
        self.operation = Some(id);
        self.writing = writing;
        self.error = None;
        self.notice = None;
        id
    }
}

pub fn remembered(mut response: SettingsReadResponse) -> SettingsReadResponse {
    response.user_instructions = None;
    response.project_instructions = None;
    response
}

pub fn write_params(
    current: &SettingsReadResponse,
    change: &DefaultChange,
    admitted: &[HostModelSummary],
) -> Result<SettingsWriteParams> {
    ensure!(
        !current.config_path.is_empty(),
        "Reload session defaults before saving them"
    );
    let mut params = SettingsWriteParams::default();
    match change {
        DefaultChange::Model { id, provider } => {
            let id = id.trim();
            let provider = provider.trim();
            ensure!(
                !id.is_empty() && !id.contains('\0') && !provider.is_empty(),
                "Choose a model from this host before saving it"
            );
            let matches: Vec<_> = admitted
                .iter()
                .filter(|model| model.id == id && model.provider == provider)
                .collect();
            ensure!(
                matches.len() == 1,
                "Refresh models before saving a default. That model is not listed once."
            );
            ensure!(
                matches[0].trust_mode != DeveloperSessionTrustMode::Unknown,
                "This model has no confirmed privacy boundary"
            );
            ensure!(
                current.default_model.as_deref() != Some(id),
                "That model is already the default for new coding sessions"
            );
            params.default_model = Some(id.to_owned());
        }
        DefaultChange::Effort(effort) => {
            ensure!(
                current.default_effort != Some(*effort),
                "That effort is already the default for new coding sessions"
            );
            params.default_effort = Some(*effort);
        }
        DefaultChange::Mode { mode, confirmed } => {
            ensure!(
                *mode != DeveloperAgentMode::Bypass,
                "A saved default cannot disable every approval"
            );
            ensure!(
                *mode != DeveloperAgentMode::Auto || *confirmed,
                "Confirm automatic approval before saving it"
            );
            ensure!(
                current.permission_mode != Some(*mode),
                "That permission mode is already the default for new coding sessions"
            );
            params.permission_mode = Some(*mode);
        }
    }
    Ok(params)
}

pub fn accept_write(sent: &SettingsWriteParams, response: &SettingsReadResponse) -> Result<()> {
    ensure!(
        !response.config_path.is_empty(),
        "The saved session defaults had no configuration path"
    );
    if let Some(model) = &sent.default_model {
        ensure!(
            response.default_model.as_ref() == Some(model),
            "The saved default model did not match the request"
        );
    }
    if let Some(effort) = sent.default_effort {
        ensure!(
            response.default_effort == Some(effort),
            "The saved default effort did not match the request"
        );
    }
    if let Some(mode) = sent.permission_mode {
        ensure!(
            mode != DeveloperAgentMode::Bypass && response.permission_mode == Some(mode),
            "The saved permission mode did not match the request"
        );
    }
    ensure!(
        sent.user_instructions.is_none() && sent.project_instructions.is_none(),
        "Session defaults must not rewrite instruction files"
    );
    Ok(())
}
