use super::*;
use crate::project_file_controls::ProjectFileAction;
use agiworkforce_protocol::{account_cloud::CloudProjectTarget, project_files::*};

enum FileReply {
    List(CloudProjectFilesResponse),
    Preview(CloudProjectFileTarget, CloudProjectFilePreview),
    Reindex(CloudProjectFileTarget, CloudProjectFileReindexResponse),
}
impl Desktop {
    pub(super) fn project_file_action(
        &mut self,
        action: ProjectFileAction,
        cx: &mut Context<Self>,
    ) {
        if self.cloud.navigation_busy()
            || self.cloud.projects.edit.is_some()
            || !self.cloud.projects.visible
            || !self
                .account_capabilities
                .as_ref()
                .is_some_and(|caps| caps.cloud_project_files)
        {
            return;
        }
        let Some(project) = &self.cloud.projects.selected else {
            return;
        };
        let Ok((scope, workspace)) = self.project_binding() else {
            return;
        };
        let target = CloudProjectTarget {
            scope,
            workspace,
            project_id: project.id.clone(),
        };
        if matches!(action, ProjectFileAction::ClosePreview) {
            self.cloud.projects.files.preview = None;
            cx.notify();
            return;
        }
        if let ProjectFileAction::Copy(preview) = &action {
            if self.cloud.projects.files.preview.as_ref() == Some(preview)
                && preview.target.project == target
            {
                cx.write_to_clipboard(gpui::ClipboardItem::new_string(preview.text.clone()));
            }
            return;
        }
        if self.cloud.projects.files.operation.is_some() {
            return;
        }
        if let ProjectFileAction::Preview(file) = &action {
            if file.project != target
                || self.cloud.projects.files.target.as_ref() != Some(&target)
                || !self
                    .cloud
                    .projects
                    .files
                    .rows
                    .iter()
                    .any(|row| row.id == file.file_id && row.preview_kind.is_some())
            {
                return;
            }
        }
        let reindexing = matches!(action, ProjectFileAction::Reindex(_));
        if let ProjectFileAction::Reindex(file) = &action {
            if !self
                .account_capabilities
                .as_ref()
                .is_some_and(|caps| caps.cloud_project_file_reindex)
                || !project.can_archive
                || project.archived
                || self.cloud.projects.files.mutation_uncertain
                || file.target.project != target
                || self.cloud.projects.files.target.as_ref() != Some(&target)
                || !self.cloud.projects.files.rows.iter().any(|row| {
                    row.id == file.target.file_id
                        && row.checksum_sha256 == file.checksum_sha256
                        && !row.indexing.as_ref().is_some_and(|index| {
                            matches!(index.status.as_str(), "pending" | "indexing")
                        })
                })
            {
                return;
            }
        }
        let client = match self.account_client() {
            Ok(client) => client,
            Err(error) => {
                self.cloud.projects.files.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let operation = uuid::Uuid::new_v4();
        if matches!(action, ProjectFileAction::Refresh) {
            self.cloud.projects.files = Default::default();
        }
        self.cloud.projects.files.operation = Some(operation);
        self.cloud.projects.files.error = None;
        if !reindexing {
            self.cloud.projects.files.preview = None;
        }
        self.cloud.projects.files.notice = reindexing.then(|| "Requesting file indexing…".into());
        let generation = self.cloud.generation;
        let requested = target.clone();
        let task = self.executor.spawn(async move {
            match &action {
                ProjectFileAction::Refresh => client
                    .request::<CloudProjectFilesResponse>(
                        method::CLOUD_PROJECT_FILES_LIST,
                        requested,
                    )
                    .await
                    .map(FileReply::List),
                ProjectFileAction::Preview(file) => client
                    .request::<CloudProjectFilePreview>(method::CLOUD_PROJECT_FILE_PREVIEW, file)
                    .await
                    .map(|reply| FileReply::Preview(file.clone(), reply)),
                ProjectFileAction::Reindex(file) => client
                    .request::<CloudProjectFileReindexResponse>(
                        method::CLOUD_PROJECT_FILE_REINDEX,
                        file,
                    )
                    .await
                    .map(|reply| FileReply::Reindex(file.target.clone(), reply)),
                _ => unreachable!(),
            }
        });
        cx.spawn(async move |view, cx| {
            let result = task
                .await
                .context("Reading project files stopped")
                .and_then(|result| result.map_err(Into::into));
            let _ = view.update(cx, |view, cx| {
                if view.cloud.generation != generation
                    || view.cloud.projects.files.operation != Some(operation)
                {
                    return;
                }
                view.cloud.projects.files.operation = None;
                if view.project_binding().ok()
                    != Some((target.scope.clone(), target.workspace.clone()))
                    || !view.cloud.projects.visible
                    || view
                        .cloud
                        .projects
                        .selected
                        .as_ref()
                        .is_none_or(|project| project.id != target.project_id)
                {
                    return;
                }
                let result = result.and_then(|reply| match reply {
                    FileReply::List(response) => {
                        view.cloud.projects.files.accept_list(&target, response)
                    }
                    FileReply::Preview(expected, response) => view
                        .cloud
                        .projects
                        .files
                        .accept_preview(&expected, response),
                    FileReply::Reindex(expected, response) => view
                        .cloud
                        .projects
                        .files
                        .accept_reindex(&expected, response),
                });
                if let Err(error) = result {
                    view.cloud.projects.files.notice = None;
                    view.cloud.projects.files.mutation_uncertain |= reindexing;
                    view.cloud.projects.files.error =
                        Some(format!("Project files could not be read: {error:#}"));
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }
}
