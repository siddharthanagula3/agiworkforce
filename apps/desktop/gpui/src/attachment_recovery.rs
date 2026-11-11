use agiworkforce_protocol::{attachment_recovery::*, cloud_uploads::CloudChatTarget};
use anyhow::{ensure, Result};

#[derive(Default)]
pub struct AttachmentRecovery {
    pub target: Option<CloudChatTarget>,
    pub current: Option<AttachmentRecoverySnapshot>,
    pub available: bool,
    pub loaded: bool,
    pub message_cursor: Option<String>,
    pub operation: Option<uuid::Uuid>,
    pub error: Option<String>,
    pub verification_required: bool,
    pub pending_remove: Option<String>,
    pub visible: bool,
    pub list: Option<AttachmentRecoveryListResponse>,
    pub list_operation: Option<uuid::Uuid>,
}
impl AttachmentRecovery {
    pub fn busy(&self) -> bool {
        self.operation.is_some() || self.list_operation.is_some()
    }
    pub fn retained(&self, upload: &crate::chat_upload::ChatUpload) -> bool {
        !upload.pending()
            && upload.error.is_none()
            && !self.busy()
            && !self.verification_required
            && self.error.is_none()
            && self.current.as_ref().is_some_and(|snapshot| {
                upload.target.as_ref() == Some(&snapshot.target)
                    && snapshot.pending_send.is_none()
                    && upload
                        .files
                        .iter()
                        .all(|file| snapshot.files.contains(file))
            })
    }
    pub fn accept(
        &mut self,
        target: &CloudChatTarget,
        response: AttachmentRecoveryReadResponse,
    ) -> Result<()> {
        ensure!(
            response.target == *target && response.available == response.snapshot.is_some(),
            "Attachment recovery changed its target or availability"
        );
        if let Some(snapshot) = &response.snapshot {
            validate(target, snapshot)?;
        }
        self.target = Some(target.clone());
        self.current = response.snapshot;
        self.available = response.available;
        self.loaded = true;
        self.error = None;
        self.verification_required = false;
        Ok(())
    }
    pub fn accept_change(
        &mut self,
        target: &CloudChatTarget,
        response: AttachmentRecoveryChangeResponse,
    ) -> Result<bool> {
        ensure!(
            response.target == *target,
            "Attachment recovery changed account, workspace or conversation"
        );
        if let Some(snapshot) = &response.snapshot {
            validate(target, snapshot)?;
            self.current = Some(snapshot.clone());
        }
        self.verification_required = !response.accepted;
        self.error = (!response.accepted).then(|| {
            "The retained selection changed in another window. Reload it before trying again."
                .into()
        });
        Ok(response.accepted)
    }
    pub fn accept_list(
        &mut self,
        scope: &str,
        response: AttachmentRecoveryListResponse,
    ) -> Result<()> {
        ensure!(
            response.scope == scope,
            "Attachment recovery changed accounts"
        );
        uuid::Uuid::parse_str(&response.epoch)?;
        let mut seen = std::collections::HashSet::new();
        for selection in &response.selections {
            ensure!(
                selection.target.scope == scope
                    && seen.insert(selection.target.conversation_id.clone())
                    && selection.file_count > 0
                    && (selection.readable || selection.title.is_none()),
                "The recovery list contains a different account or invalid selection"
            );
            uuid::Uuid::parse_str(&selection.target.conversation_id)?;
            uuid::Uuid::parse_str(&selection.revision)?;
        }
        self.list = Some(response);
        self.error = None;
        Ok(())
    }
}
pub fn validate(target: &CloudChatTarget, snapshot: &AttachmentRecoverySnapshot) -> Result<()> {
    ensure!(
        snapshot.target == *target,
        "Attachment recovery changed accounts, workspaces or conversations"
    );
    uuid::Uuid::parse_str(&snapshot.epoch)?;
    if let Some(revision) = &snapshot.revision {
        uuid::Uuid::parse_str(revision)?;
    }
    ensure!(
        snapshot.revision.is_some() == !snapshot.files.is_empty(),
        "Attachment recovery has no valid revision"
    );
    let policy = crate::chat_upload::limits()?;
    ensure!(
        snapshot.files.len() <= policy.max_count,
        "Attachment recovery exceeds the file count limit"
    );
    let mut ids = std::collections::HashSet::new();
    let total = snapshot.files.iter().try_fold(0u64, |total, file| {
        uuid::Uuid::parse_str(&file.asset_id)?;
        ensure!(
            file.id == file.asset_id && ids.insert(file.asset_id.clone()) && !file.name.is_empty(),
            "Attachment recovery has a duplicate or invalid file identity"
        );
        let size = file
            .size
            .ok_or_else(|| anyhow::anyhow!("A recovered attachment has no byte count"))?;
        ensure!(
            size > 0 && size <= policy.max_bytes && file.mime_type.is_some(),
            "A recovered attachment has invalid metadata"
        );
        total
            .checked_add(size)
            .ok_or_else(|| anyhow::anyhow!("Attachment recovery byte count overflowed"))
    })?;
    ensure!(
        total <= policy.max_message_bytes,
        "Attachment recovery exceeds the message byte limit"
    );
    if let Some(pending) = &snapshot.pending_send {
        uuid::Uuid::parse_str(&pending.request_id)?;
        uuid::Uuid::parse_str(&pending.user_message_id)?;
        let expected = pending
            .asset_ids
            .iter()
            .collect::<std::collections::HashSet<_>>();
        ensure!(
            !expected.is_empty()
                && expected.len() == pending.asset_ids.len()
                && expected.iter().all(|id| ids.contains(*id)),
            "The pending send has invalid attachment identities"
        );
    }
    Ok(())
}
