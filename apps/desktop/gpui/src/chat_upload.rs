use agiworkforce_protocol::{account_cloud::CloudHistoryAttachment, cloud_uploads::*};
use anyhow::{ensure, Context, Result};

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentLimits {
    pub max_bytes: u64,
    pub max_message_bytes: u64,
    pub max_count: usize,
}
pub fn limits() -> Result<AttachmentLimits> {
    serde_json::from_str(include_str!(
        "../../../../packages/contracts/cloud-contracts/src/chat-attachment-policy.json"
    ))
    .context("The compiled chat attachment limits are invalid")
}

#[derive(Default)]
pub struct ChatUpload {
    pub selection: uuid::Uuid,
    pub generation: u64,
    pub target: Option<CloudChatTarget>,
    pub workspace_name: String,
    pub snapshot: Option<CloudUploadSnapshot>,
    pub files: Vec<CloudHistoryAttachment>,
    pub operation: Option<uuid::Uuid>,
    pub preparation_unknown: bool,
    pub error: Option<String>,
}
impl ChatUpload {
    pub fn pending(&self) -> bool {
        self.snapshot.is_some() || self.operation.is_some() || self.preparation_unknown
    }
    pub fn retains_selection(&self) -> bool {
        self.target.is_some() && (self.pending() || !self.files.is_empty() || self.error.is_some())
    }
    pub fn files_for(&self, target: &CloudChatTarget) -> Result<Vec<CloudHistoryAttachment>> {
        ensure!(
            !self.pending(),
            "Finish or close the file-upload review before sending"
        );
        ensure!(
            self.files.is_empty() || self.target.as_ref() == Some(target),
            "The attachments belong to another account, workspace or conversation"
        );
        Ok(self.files.clone())
    }
    pub fn can_add(&self, byte_count: u64) -> Result<()> {
        let limits = limits()?;
        ensure!(
            byte_count > 0 && byte_count <= limits.max_bytes,
            "This file exceeds the chat upload size limit"
        );
        ensure!(
            self.files.len() < limits.max_count,
            "The message already has its maximum number of attachments"
        );
        let total = self.files.iter().try_fold(byte_count, |total, file| {
            total
                .checked_add(file.size.context("The attachment has no byte count")?)
                .context("The attachment byte count overflowed")
        })?;
        ensure!(
            total <= limits.max_message_bytes,
            "These files exceed the total attachment size for one message"
        );
        Ok(())
    }
    pub fn accept(
        &mut self,
        target: &CloudChatTarget,
        expected_id: Option<&str>,
        snapshot: CloudUploadSnapshot,
    ) -> Result<()> {
        let review = &snapshot.review;
        ensure!(
            self.target.as_ref() == Some(target)
                && review.upload.target
                    == (CloudUploadTarget::Chat {
                        chat: target.clone()
                    })
                && expected_id.is_none_or(|id| id == review.upload.id),
            "The upload changed account, workspace, conversation or review identity"
        );
        ensure!(
            uuid::Uuid::parse_str(&review.upload.id).is_ok()
                && review.byte_count > 0
                && snapshot.uploaded_bytes <= review.byte_count
                && review.checksum_sha256.len() == 64
                && review
                    .checksum_sha256
                    .bytes()
                    .all(|byte| byte.is_ascii_hexdigit()),
            "The upload returned invalid review metadata or progress"
        );
        if let Some(previous) = &self.snapshot {
            ensure!(
                previous.review == *review,
                "The upload changed its reviewed file"
            );
            ensure!(
                previous.phase != CloudUploadPhase::Succeeded || previous == &snapshot,
                "A completed upload changed or regressed"
            );
        }
        if snapshot.phase == CloudUploadPhase::Succeeded {
            let Some(CloudUploadedFile::Chat { attachment }) = &snapshot.file else {
                anyhow::bail!("Upload completion has no chat attachment");
            };
            ensure!(
                attachment.name == review.file_name
                    && attachment.mime_type.as_ref() == Some(&review.mime_type)
                    && attachment.size == Some(review.byte_count)
                    && snapshot.uploaded_bytes == review.byte_count
                    && uuid::Uuid::parse_str(&attachment.asset_id).is_ok(),
                "The stored attachment differs from the reviewed upload"
            );
        } else {
            ensure!(
                snapshot.file.is_none(),
                "An unfinished upload returned a stored file"
            );
        }
        self.snapshot = Some(snapshot);
        self.error = None;
        Ok(())
    }
    pub fn finish(&mut self) -> Result<()> {
        let snapshot = self
            .snapshot
            .as_ref()
            .context("No chat upload is available")?;
        ensure!(
            snapshot.phase == CloudUploadPhase::Succeeded,
            "The file upload is not complete"
        );
        let Some(CloudUploadedFile::Chat { attachment }) = &snapshot.file else {
            anyhow::bail!("No uploaded attachment is available");
        };
        self.can_add(snapshot.review.byte_count)?;
        ensure!(
            !self
                .files
                .iter()
                .any(|file| file.asset_id == attachment.asset_id),
            "This file is already attached to the message"
        );
        self.files.push(attachment.clone());
        self.snapshot = None;
        self.error = None;
        Ok(())
    }
    pub fn remove(&mut self, id: &str) {
        if self.pending() {
            return;
        }
        self.files.retain(|file| file.asset_id != id);
        if self.files.is_empty() {
            *self = Self::default();
        }
    }
    pub fn sent(&mut self, files: &[CloudHistoryAttachment]) {
        self.files
            .retain(|file| !files.iter().any(|sent| sent == file));
        if !self.retains_selection() {
            *self = Self::default();
        }
    }
}
