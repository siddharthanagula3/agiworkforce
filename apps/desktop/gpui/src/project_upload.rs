use agiworkforce_protocol::{account_cloud::CloudProjectTarget, project_files::*};
use anyhow::{ensure, Result};
#[derive(Default)]
pub struct ProjectUpload {
    pub selection: uuid::Uuid,
    pub preparation_unknown: bool,
    pub target: Option<CloudProjectTarget>,
    pub snapshot: Option<CloudProjectUploadSnapshot>,
    pub workspace_name: String,
    pub generation: u64,
    pub operation: Option<uuid::Uuid>,
    pub error: Option<String>,
}
impl ProjectUpload {
    pub fn retains_unsaved_source(&self) -> bool {
        self.target.is_some()
            && self
                .snapshot
                .as_ref()
                .is_none_or(|snapshot| snapshot.phase != ProjectUploadPhase::Succeeded)
    }

    pub fn accept(
        &mut self,
        target: &CloudProjectTarget,
        expected_id: Option<&str>,
        snapshot: CloudProjectUploadSnapshot,
    ) -> Result<()> {
        let review = &snapshot.review;
        ensure!(
            self.target.as_ref() == Some(target)
                && review.upload.target == *target
                && expected_id.is_none_or(|id| id == review.upload.id),
            "The upload changed account, workspace, project or review identity"
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
                "The upload changed its reviewed source"
            );
            ensure!(
                previous.phase != ProjectUploadPhase::Succeeded || previous == &snapshot,
                "A completed upload regressed or changed its stored file"
            );
        }
        if snapshot.phase == ProjectUploadPhase::Succeeded {
            let file = snapshot
                .file
                .as_ref()
                .ok_or_else(|| anyhow::anyhow!("Upload completion has no stored file"))?;
            ensure!(
                file.project_id == target.project_id
                    && file.file_name == review.file_name
                    && file.mime_type == review.mime_type
                    && file.byte_count == review.byte_count
                    && file.checksum_sha256 == review.checksum_sha256
                    && snapshot.uploaded_bytes == review.byte_count,
                "The completed file differs from the reviewed upload"
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
}
