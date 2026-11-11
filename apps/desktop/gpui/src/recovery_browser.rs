use agiworkforce_protocol::workspace_files::*;
use anyhow::{ensure, Context, Result};

pub fn recovery_error_message(error: &anyhow::Error) -> String {
    match error.downcast_ref::<agiworkforce_app_server::DeveloperSessionClientError>() {
        Some(agiworkforce_app_server::DeveloperSessionClientError::Remote { message, .. }) => message.clone(),
        Some(_) => "The coding runtime could not confirm the operation. Keep the recovered text and reconnect before retrying.".into(),
        None => error.to_string(),
    }
}

pub fn copy_error_message(
    params: &WorkspaceFileRecoveryRestoreParams,
    error: &anyhow::Error,
) -> String {
    if let Some(agiworkforce_app_server::DeveloperSessionClientError::Remote {
        message,
        data: Some(data),
        ..
    }) = error.downcast_ref::<agiworkforce_app_server::DeveloperSessionClientError>()
    {
        if let Ok(failure) =
            serde_json::from_value::<WorkspaceFileRecoveryRestoreFailure>(data.clone())
        {
            if failure.root_key == params.root_key
                && failure.path == params.path
                && failure.destination == params.destination
                && !failure.uncertain
            {
                return format!("File creation was refused. {message}");
            }
        }
    }
    format!("File creation could not be confirmed. Retained edits remain available. Inspect {:?} before trying again.", params.destination)
}

#[derive(Default)]
pub struct RecoveryBrowser {
    pub visible: bool,
    pub list: Option<WorkspaceFileRecoveryListResponse>,
    pub selected: Option<WorkspaceFileRecoverySnapshot>,
    pub saved: Option<WorkspaceFileRecoveryRestoreResponse>,
    pub attempted: Option<WorkspaceFileRecoveryRestoreParams>,
    pub operation: Option<uuid::Uuid>,
    pub mutating: bool,
    pub error: Option<String>,
}

fn relative(path: &str) -> bool {
    !path.is_empty()
        && !path.contains(['\\', '\0'])
        && path
            .split('/')
            .all(|part| !part.is_empty() && !matches!(part, "." | ".."))
}

impl RecoveryBrowser {
    pub fn begin(&mut self) -> uuid::Uuid {
        let id = uuid::Uuid::new_v4();
        self.operation = Some(id);
        self.error = None;
        id
    }

    pub fn accept_list(
        &mut self,
        root: &str,
        page: WorkspaceFileRecoveryListResponse,
    ) -> Result<()> {
        ensure!(
            page.root_key == root && !root.is_empty(),
            "Recovered edits belong to a different coding folder"
        );
        uuid::Uuid::parse_str(&page.epoch)?;
        ensure!(
            page.entries
                .len()
                .checked_add(page.unavailable)
                .is_some_and(|total| total <= MAX_EDITOR_RECOVERY_FILES),
            "The recovered file list exceeds its limit"
        );
        let mut previous: Option<&str> = None;
        for entry in &page.entries {
            ensure!(
                relative(&entry.path)
                    && previous.is_none_or(|previous| previous < entry.path.as_str())
                    && entry.byte_count <= MAX_EDITOR_TEXT_BYTES,
                "The recovered file list contains an invalid or repeated path"
            );
            uuid::Uuid::parse_str(&entry.revision)?;
            previous = Some(&entry.path);
        }
        self.list = Some(page);
        self.selected = None;
        self.saved = None;
        self.attempted = None;
        Ok(())
    }

    pub fn accept_snapshot(
        &mut self,
        root: &str,
        path: &str,
        snapshot: WorkspaceFileRecoverySnapshot,
    ) -> Result<()> {
        ensure!(
            self.list
                .as_ref()
                .is_some_and(|page| page.root_key == root
                    && page.entries.iter().any(|entry| entry.path == path)),
            "Refresh the recovered file list before opening these edits"
        );
        crate::editor_recovery::validate_recovery_target(root, path, &snapshot)?;
        ensure!(
            snapshot.recovery.is_some(),
            "The recovered edits are no longer available; refresh the list"
        );
        self.selected = Some(snapshot);
        self.saved = None;
        self.attempted = None;
        Ok(())
    }

    pub fn copy_params(&self, destination: String) -> Result<WorkspaceFileRecoveryRestoreParams> {
        let snapshot = self
            .selected
            .as_ref()
            .context("Select recovered edits before creating a file")?;
        ensure!(
            relative(&destination),
            "Choose an unambiguous relative path inside the coding folder"
        );
        ensure!(
            self.list
                .as_ref()
                .is_some_and(|page| page.root_key == snapshot.root_key),
            "The coding folder changed during recovery"
        );
        ensure!(
            snapshot.recovery.is_some(),
            "There is no retained text to copy"
        );
        Ok(WorkspaceFileRecoveryRestoreParams {
            root_key: snapshot.root_key.clone(),
            path: snapshot.path.clone(),
            epoch: snapshot.epoch.clone(),
            revision: snapshot
                .revision
                .clone()
                .context("The recovery receipt is missing")?,
            destination,
        })
    }

    pub fn accept_copy(
        &mut self,
        params: &WorkspaceFileRecoveryRestoreParams,
        response: WorkspaceFileRecoveryRestoreResponse,
    ) -> Result<()> {
        ensure!(
            self.selected
                .as_ref()
                .is_some_and(|snapshot| snapshot.root_key == params.root_key
                    && snapshot.path == params.path
                    && snapshot.epoch == params.epoch
                    && snapshot.revision.as_deref() == Some(params.revision.as_str())),
            "The recovered edits changed while their copy was being saved"
        );
        ensure!(
            response.root_key == params.root_key
                && response.path == params.path
                && response.source_revision == params.revision
                && response.destination == params.destination
                && !response.revision.is_empty(),
            "The runtime did not confirm the selected recovery copy"
        );
        self.saved = Some(response);
        Ok(())
    }

    pub fn clear_params(&self) -> Result<WorkspaceFileRecoveryWriteParams> {
        let snapshot = self
            .selected
            .as_ref()
            .context("Select recovered edits before discarding them")?;
        ensure!(
            snapshot.recovery.is_some() && snapshot.revision.is_some(),
            "The recovery receipt is unavailable"
        );
        Ok(WorkspaceFileRecoveryWriteParams {
            root_key: snapshot.root_key.clone(),
            path: snapshot.path.clone(),
            epoch: snapshot.epoch.clone(),
            revision: snapshot.revision.clone(),
            change: WorkspaceFileRecoveryChange::Clear,
        })
    }
}
