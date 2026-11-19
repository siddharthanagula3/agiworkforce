use agiworkforce_protocol::instruction_settings::*;
use anyhow::{ensure, Context, Result};

#[derive(Default)]
pub struct CodeSettings {
    pub visible: bool,
    pub snapshot: Option<InstructionSettingsSnapshot>,
    pub conflict: Option<InstructionSettingsSnapshot>,
    pub operation: Option<uuid::Uuid>,
    pub writing: bool,
    pub error: Option<String>,
    pub notice: Option<String>,
    pub sources: Option<agiworkforce_protocol::developer_session::ContextInstructionsResponse>,
}

pub fn validate(
    params: &InstructionSettingsReadParams,
    snapshot: &InstructionSettingsSnapshot,
) -> Result<()> {
    ensure!(
        snapshot.root_key == params.root_key
            && snapshot.scope == params.scope
            && !snapshot.root_key.is_empty(),
        "Instruction settings belong to a different coding folder or scope"
    );
    let expected = match params.scope {
        InstructionSettingsScope::User => &snapshot.profile.user_instructions_path,
        InstructionSettingsScope::Project => &snapshot.profile.project_instructions_path,
    };
    ensure!(
        !expected.is_empty()
            && snapshot.path == *expected
            && !snapshot.profile.config_path.is_empty(),
        "The instruction settings path changed"
    );
    ensure!(
        snapshot.text.len() <= MAX_INSTRUCTION_EDIT_BYTES
            && !snapshot.text.contains('\0')
            && (snapshot.revision.is_some() || snapshot.text.is_empty())
            && snapshot
                .revision
                .as_ref()
                .is_none_or(|revision| !revision.is_empty()),
        "The instruction settings text or revision is invalid"
    );
    ensure!(
        snapshot.profile.user_instructions.is_none()
            && snapshot.profile.project_instructions.is_none(),
        "The settings profile unexpectedly included unreviewed instruction text"
    );
    Ok(())
}

impl CodeSettings {
    pub fn dirty(&self, text: &str) -> bool {
        self.snapshot
            .as_ref()
            .is_some_and(|snapshot| snapshot.text != text)
    }
    pub fn begin(&mut self) -> uuid::Uuid {
        let id = uuid::Uuid::new_v4();
        self.operation = Some(id);
        self.error = None;
        self.notice = None;
        id
    }
    pub fn replace(
        &mut self,
        params: &InstructionSettingsReadParams,
        snapshot: InstructionSettingsSnapshot,
    ) -> Result<String> {
        validate(params, &snapshot)?;
        let text = snapshot.text.clone();
        self.snapshot = Some(snapshot);
        self.conflict = None;
        self.error = None;
        Ok(text)
    }
    pub fn refresh(
        &mut self,
        params: &InstructionSettingsReadParams,
        snapshot: InstructionSettingsSnapshot,
        text: &str,
    ) -> Result<Option<String>> {
        validate(params, &snapshot)?;
        let previous = self
            .snapshot
            .as_ref()
            .context("Load instruction settings before refreshing them")?;
        ensure!(
            previous.root_key == snapshot.root_key
                && previous.scope == snapshot.scope
                && previous.path == snapshot.path
                && previous.profile.config_path == snapshot.profile.config_path,
            "Reload returned a different instruction target"
        );
        if !self.dirty(text) || snapshot.text == text {
            return self.replace(params, snapshot).map(Some);
        }
        if snapshot.revision != previous.revision || snapshot.text != previous.text {
            self.conflict = Some(snapshot);
        } else {
            self.snapshot = Some(snapshot);
            self.conflict = None;
        }
        self.error = None;
        Ok(None)
    }
    pub fn write_params(&self, text: String) -> Result<InstructionSettingsWriteParams> {
        ensure!(
            self.operation.is_none(),
            "Wait for the current settings operation"
        );
        ensure!(
            self.conflict.is_none() && self.error.is_none(),
            "Reload and resolve stored instructions before saving"
        );
        ensure!(
            text.len() <= MAX_INSTRUCTION_EDIT_BYTES && !text.contains('\0'),
            "Instruction edits exceed the text limit or contain unsupported content"
        );
        let snapshot = self
            .snapshot
            .as_ref()
            .context("Load instruction settings before saving")?;
        Ok(InstructionSettingsWriteParams {
            root_key: snapshot.root_key.clone(),
            scope: snapshot.scope,
            revision: snapshot.revision.clone(),
            text,
        })
    }
    pub fn finish(
        &mut self,
        params: &InstructionSettingsWriteParams,
        response: InstructionSettingsWriteResponse,
    ) -> Result<()> {
        let expected = InstructionSettingsReadParams {
            root_key: params.root_key.clone(),
            scope: params.scope,
        };
        validate(&expected, &response.current)?;
        let previous = self
            .snapshot
            .as_ref()
            .context("The saved settings are no longer open")?;
        ensure!(
            previous.root_key == params.root_key
                && previous.scope == params.scope
                && previous.revision == params.revision
                && previous.path == response.current.path
                && previous.profile.config_path == response.current.profile.config_path,
            "The instruction target changed while saving"
        );
        if response.saved {
            ensure!(
                response.current.text == params.text,
                "The host acknowledged different instruction text"
            );
            self.snapshot = Some(response.current);
            self.conflict = None;
            self.notice = Some("Instructions saved to this file.".into());
        } else {
            self.conflict = Some(response.current);
        }
        self.error = None;
        Ok(())
    }
    pub fn keep_edits(&mut self) -> Result<()> {
        let current = self
            .conflict
            .take()
            .context("There is no stored version to review")?;
        self.snapshot = Some(current);
        self.error = None;
        self.notice = Some("Your edits are still unsaved. Save to replace the stored text.".into());
        Ok(())
    }
}

pub fn error_message(error: &anyhow::Error) -> String {
    match error.downcast_ref::<agiworkforce_app_server::DeveloperSessionClientError>() {
        Some(agiworkforce_app_server::DeveloperSessionClientError::Remote { message, .. }) => message.clone(),
        Some(_) => "The coding runtime could not confirm the operation. Keep your edits, reconnect and reload stored settings before retrying.".into(),
        None => error.to_string(),
    }
}
