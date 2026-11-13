use agiworkforce_protocol::{developer_session::DeveloperWorkspaceIdentity, workspace_files::*};
use anyhow::{ensure, Context, Result};

#[derive(Default)]
pub struct FileEditor {
    pub visible: bool,
    pub root: Option<DeveloperWorkspaceIdentity>,
    pub directory: Option<WorkspaceDirectoryResponse>,
    pub file: Option<WorkspaceFileResponse>,
    pub operation: Option<uuid::Uuid>,
    pub saving: bool,
    pub error: Option<String>,
    pub notice: Option<String>,
    pub recovery: crate::editor_recovery::EditorRecovery,
    pub recovery_browser: crate::recovery_browser::RecoveryBrowser,
}

#[cfg(feature = "native-ui")]
pub fn source_editor(
    state: &gpui::Entity<gpui_component::input::EditorState>,
    label: impl Into<gpui::SharedString>,
    readonly: bool,
    height: gpui::Pixels,
) -> gpui_component::input::Editor {
    gpui_component::input::Editor::new(state)
        .appearance(false)
        .aria_label(label)
        .readonly(readonly)
        .h(height)
}
impl FileEditor {
    pub fn dirty(&self, value: &str) -> bool {
        self.file.as_ref().is_some_and(|file| file.content != value)
    }
    pub fn begin(&mut self) -> uuid::Uuid {
        let id = uuid::Uuid::new_v4();
        self.operation = Some(id);
        self.error = None;
        self.notice = None;
        id
    }
    pub fn accept_directory(
        &mut self,
        params: &WorkspaceDirectoryParams,
        page: WorkspaceDirectoryResponse,
    ) -> Result<()> {
        ensure!(
            self.root
                .as_ref()
                .is_some_and(|root| root.root_key == params.root_key)
                && page.root_key == params.root_key
                && page.path == params.path,
            "The folder changed while its files were loading"
        );
        ensure!(
            page.entries.len() <= WORKSPACE_DIRECTORY_PAGE_SIZE,
            "The directory response exceeds its page limit"
        );
        let mut previous = params.after.as_deref();
        for entry in &page.entries {
            ensure!(
                !entry.name.is_empty()
                    && !entry.name.contains(['/', '\\', '\0'])
                    && !matches!(entry.name.as_str(), "." | "..")
                    && previous.is_none_or(|previous| entry.name.as_str() > previous),
                "The directory returned an invalid or repeated name"
            );
            let expected = if page.path.is_empty() {
                entry.name.clone()
            } else {
                format!("{}/{}", page.path, entry.name)
            };
            ensure!(
                entry.path == expected,
                "A file belongs to a different directory"
            );
            previous = Some(&entry.name);
        }
        ensure!(
            page.next_after
                .as_deref()
                .is_none_or(|after| page.entries.last().is_some_and(|entry| entry.name == after)),
            "The directory cursor did not describe its last file"
        );
        self.directory = Some(page);
        Ok(())
    }
    pub fn accept_file(
        &mut self,
        params: &WorkspaceFileParams,
        file: WorkspaceFileResponse,
    ) -> Result<()> {
        ensure!(
            self.root
                .as_ref()
                .is_some_and(|root| root.root_key == params.root_key)
                && file.root_key == params.root_key
                && file.path == params.path,
            "A different file was returned by the coding host"
        );
        ensure!(
            !file.revision.is_empty()
                && file.content.len() <= MAX_EDITOR_TEXT_BYTES
                && !file.content.contains('\0'),
            "This file cannot be edited as bounded UTF-8 text"
        );
        self.file = Some(file);
        Ok(())
    }
    pub fn write_params(&self, content: String) -> Result<WorkspaceFileWriteParams> {
        let file = self.file.as_ref().context("Open a file before saving")?;
        ensure!(
            self.root
                .as_ref()
                .is_some_and(|root| root.root_key == file.root_key),
            "The file belongs to a different coding folder"
        );
        ensure!(
            content.len() <= MAX_EDITOR_TEXT_BYTES && !content.contains('\0'),
            "The edited file exceeds the text limit or contains unsupported content"
        );
        Ok(WorkspaceFileWriteParams {
            root_key: file.root_key.clone(),
            path: file.path.clone(),
            revision: file.revision.clone(),
            content,
        })
    }
    pub fn accept_save(
        &mut self,
        params: WorkspaceFileWriteParams,
        response: WorkspaceFileWriteResponse,
    ) -> Result<()> {
        let file = self
            .file
            .as_mut()
            .context("The saved file is no longer open")?;
        ensure!(
            file.root_key == params.root_key
                && file.path == params.path
                && file.revision == params.revision
                && response.root_key == params.root_key
                && response.path == params.path
                && !response.revision.is_empty(),
            "Saving returned a different file or revision"
        );
        file.content = params.content;
        file.revision = response.revision;
        self.notice = Some(format!("Saved {}", file.path));
        Ok(())
    }
}
