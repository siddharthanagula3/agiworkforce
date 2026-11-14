use agiworkforce_protocol::workspace_files::*;
use anyhow::{ensure, Result};

#[derive(Default)]
pub struct EditorRecovery {
    pub current: Option<WorkspaceFileRecoverySnapshot>,
    pub review: Option<WorkspaceFileRecoverySnapshot>,
    pub operation: Option<uuid::Uuid>,
    pub error: Option<String>,
    pub verification_required: bool,
}

pub fn validate_snapshot(
    file: &WorkspaceFileResponse,
    snapshot: &WorkspaceFileRecoverySnapshot,
) -> Result<()> {
    validate_recovery_target(&file.root_key, &file.path, snapshot)
}

pub fn validate_recovery_target(
    root: &str,
    path: &str,
    snapshot: &WorkspaceFileRecoverySnapshot,
) -> Result<()> {
    ensure!(
        snapshot.root_key == root && snapshot.path == path,
        "Recovery belongs to a different file or coding folder"
    );
    uuid::Uuid::parse_str(&snapshot.epoch)?;
    ensure!(
        snapshot.revision.is_some() == snapshot.recovery.is_some(),
        "The recovery revision is missing"
    );
    if let Some(revision) = &snapshot.revision {
        uuid::Uuid::parse_str(revision)?;
    }
    if let Some(value) = &snapshot.recovery {
        ensure!(
            !value.base_revision.is_empty()
                && value.content.len() <= MAX_EDITOR_TEXT_BYTES
                && !value.content.contains('\0'),
            "Recovered text exceeds the editor limit or contains unsupported content"
        );
    }
    Ok(())
}

fn desired(file: &WorkspaceFileResponse, text: &str) -> Option<WorkspaceFileRecovery> {
    (text != file.content).then(|| WorkspaceFileRecovery {
        base_revision: file.revision.clone(),
        content: text.to_owned(),
    })
}

impl EditorRecovery {
    pub fn observe(
        &mut self,
        file: &WorkspaceFileResponse,
        text: &str,
        snapshot: WorkspaceFileRecoverySnapshot,
    ) -> Result<()> {
        validate_snapshot(file, &snapshot)?;
        ensure!(
            self.operation.is_none(),
            "Wait for the recovery operation before reloading it"
        );
        let wanted = desired(file, text);
        self.review = if snapshot.recovery == wanted
            || (text == file.content
                && snapshot
                    .recovery
                    .as_ref()
                    .is_some_and(|value| value.content == file.content))
        {
            None
        } else {
            Some(snapshot.clone())
        };
        self.current = Some(snapshot);
        self.error = None;
        self.verification_required = false;
        Ok(())
    }

    pub fn retained(&self, file: &WorkspaceFileResponse, text: &str) -> bool {
        self.operation.is_none()
            && !self.verification_required
            && self.error.is_none()
            && self.review.is_none()
            && self.current.as_ref().is_some_and(|current| {
                current.root_key == file.root_key
                    && current.path == file.path
                    && current.recovery == desired(file, text)
            })
    }

    pub fn begin(
        &mut self,
        file: &WorkspaceFileResponse,
        text: &str,
    ) -> Result<Option<(uuid::Uuid, WorkspaceFileRecoveryWriteParams)>> {
        if self.operation.is_some() || self.review.is_some() || self.error.is_some() {
            return Ok(None);
        }
        ensure!(
            text.len() <= MAX_EDITOR_TEXT_BYTES && !text.contains('\0'),
            "Editor recovery exceeds its text limit"
        );
        let Some(current) = &self.current else {
            return Ok(None);
        };
        validate_snapshot(file, current)?;
        let value = desired(file, text);
        if current.recovery == value && !self.verification_required {
            return Ok(None);
        }
        let id = uuid::Uuid::new_v4();
        let params = WorkspaceFileRecoveryWriteParams {
            root_key: file.root_key.clone(),
            path: file.path.clone(),
            epoch: current.epoch.clone(),
            revision: current.revision.clone(),
            change: value.map_or(WorkspaceFileRecoveryChange::Clear, |value| {
                WorkspaceFileRecoveryChange::Set { value }
            }),
        };
        self.operation = Some(id);
        Ok(Some((id, params)))
    }

    pub fn finish(
        &mut self,
        file: &WorkspaceFileResponse,
        id: uuid::Uuid,
        params: &WorkspaceFileRecoveryWriteParams,
        response: WorkspaceFileRecoveryWriteResponse,
    ) -> Result<()> {
        ensure!(
            self.operation == Some(id)
                && params.root_key == file.root_key
                && params.path == file.path,
            "The file recovery operation changed"
        );
        validate_snapshot(file, &response.current)?;
        let expected = match &params.change {
            WorkspaceFileRecoveryChange::Set { value } => Some(value.clone()),
            WorkspaceFileRecoveryChange::Clear => None,
        };
        if response.accepted {
            if matches!(params.change, WorkspaceFileRecoveryChange::Set { .. }) {
                ensure!(
                    response.current.epoch == params.epoch,
                    "The saved recovery receipt changed"
                );
            }
            ensure!(
                response.current.recovery == expected,
                "The runtime acknowledged different recovered text"
            );
        }
        self.operation = None;
        self.error = None;
        self.review = (!response.accepted && response.current.recovery != expected)
            .then(|| response.current.clone());
        self.current = Some(response.current);
        self.verification_required = false;
        Ok(())
    }
}
