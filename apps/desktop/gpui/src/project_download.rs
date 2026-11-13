use agiworkforce_protocol::project_files::*;
use anyhow::{ensure, Result};
#[derive(Default)]
pub struct ProjectDownload {
    pub selection: uuid::Uuid,
    pub target: Option<CloudProjectFileTarget>,
    pub snapshot: Option<CloudProjectDownloadSnapshot>,
    pub workspace_name: String,
    pub generation: u64,
    pub operation: Option<uuid::Uuid>,
    pub error: Option<String>,
    pub preparation_unknown: bool,
}
impl ProjectDownload {
    pub fn needs_close_confirmation(&self) -> bool {
        self.target.is_some()
            && self
                .snapshot
                .as_ref()
                .is_none_or(|snapshot| snapshot.phase.running() || snapshot.uncertain)
    }
    pub fn accept(
        &mut self,
        target: &CloudProjectFileTarget,
        expected_id: Option<&str>,
        snapshot: CloudProjectDownloadSnapshot,
    ) -> Result<()> {
        let review = &snapshot.review;
        ensure!(
            self.target.as_ref() == Some(target)
                && review.download.file == *target
                && expected_id.is_none_or(|id| id == review.download.id)
                && review.file.id == target.file_id
                && review.file.project_id == target.project.project_id,
            "The download changed account, workspace, project, file or review identity"
        );
        ensure!(
            uuid::Uuid::parse_str(&review.download.id).is_ok()
                && review.file.byte_count > 0
                && snapshot.received_bytes <= review.file.byte_count
                && std::path::Path::new(&review.destination).is_absolute()
                && review.file.checksum_sha256.len() == 64
                && review
                    .file
                    .checksum_sha256
                    .bytes()
                    .all(|byte| byte.is_ascii_hexdigit()),
            "The download returned invalid source, destination or progress metadata"
        );
        if let Some(previous) = &self.snapshot {
            ensure!(
                previous.review == *review,
                "The download changed its reviewed source or save destination"
            );
            ensure!(
                previous.phase != ProjectDownloadPhase::Succeeded || previous == &snapshot,
                "A completed download changed or regressed"
            );
        }
        ensure!(
            snapshot.phase != ProjectDownloadPhase::Succeeded
                || snapshot.received_bytes == review.file.byte_count,
            "The saved file has incomplete download progress"
        );
        self.snapshot = Some(snapshot);
        self.error = None;
        Ok(())
    }
}
