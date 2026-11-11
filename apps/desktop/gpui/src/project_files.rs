use agiworkforce_protocol::{account_cloud::CloudProjectTarget, project_files::*};
use anyhow::{ensure, Result};
use std::collections::HashSet;

#[derive(Default)]
pub struct ProjectFiles {
    pub target: Option<CloudProjectTarget>,
    pub rows: Vec<CloudProjectFile>,
    pub preview: Option<CloudProjectFilePreview>,
    pub operation: Option<uuid::Uuid>,
    pub loaded: bool,
    pub error: Option<String>,
    pub notice: Option<String>,
    pub mutation_uncertain: bool,
}
impl ProjectFiles {
    pub fn accept_list(
        &mut self,
        expected: &CloudProjectTarget,
        response: CloudProjectFilesResponse,
    ) -> Result<()> {
        ensure!(
            response.target == *expected,
            "The files belong to another account, workspace or project"
        );
        let mut ids = HashSet::new();
        ensure!(
            response
                .files
                .iter()
                .all(|file| file.project_id == expected.project_id && ids.insert(&file.id)),
            "The project files repeated an identity or changed project"
        );
        self.target = Some(response.target);
        self.rows = response.files;
        self.preview = None;
        self.loaded = true;
        self.mutation_uncertain = false;
        self.notice = None;
        Ok(())
    }
    pub fn accept_preview(
        &mut self,
        expected: &CloudProjectFileTarget,
        response: CloudProjectFilePreview,
    ) -> Result<()> {
        ensure!(
            response.target == *expected && self.target.as_ref() == Some(&expected.project),
            "The preview belongs to another account, workspace or project"
        );
        let file = self
            .rows
            .iter()
            .find(|file| file.id == expected.file_id)
            .ok_or_else(|| anyhow::anyhow!("Refresh project files before opening this preview"))?;
        ensure!(
            (file.preview_kind == Some(ProjectFilePreviewKind::Office)
                || file.preview_kind == Some(response.kind))
                && file.checksum_sha256 == response.checksum_sha256
                && response.kind != ProjectFilePreviewKind::Office,
            "The preview changed source. Refresh project files before opening it again."
        );
        self.preview = Some(response);
        Ok(())
    }
    pub fn accept_reindex(
        &mut self,
        expected: &CloudProjectFileTarget,
        response: CloudProjectFileReindexResponse,
    ) -> Result<()> {
        ensure!(
            response.target == *expected && self.target.as_ref() == Some(&expected.project),
            "The index request changed file or workspace"
        );
        let file = self
            .rows
            .iter_mut()
            .find(|file| file.id == expected.file_id)
            .ok_or_else(|| {
                anyhow::anyhow!("Refresh project files before requesting this index again")
            })?;
        file.indexing = response.indexing;
        self.notice = Some(if !response.new_request { "This file is already queued or being indexed. Refresh files to check progress." } else if response.dispatched { "Index request accepted. Refresh files to check progress." } else { "Index request accepted; processing has not been confirmed. Refresh files to check progress." }.into());
        self.mutation_uncertain = false;
        Ok(())
    }
}
