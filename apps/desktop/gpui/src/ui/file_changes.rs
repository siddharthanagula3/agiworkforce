use super::*;
use crate::file_changes::{
    create_params, delete_detail, delete_params, rename_detail, rename_params,
};
use agiworkforce_protocol::workspace_files::{
    WorkspaceFileDeleteResponse, WorkspaceFileRenameResponse, WorkspaceFileResponse,
    MAX_EDITOR_TEXT_BYTES,
};

impl Desktop {
    fn file_root(&self) -> Option<String> {
        self.editor
            .root
            .as_ref()
            .map(|root| root.root_key.clone())
            .filter(|root| !root.is_empty())
    }

    pub(super) fn create_file(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.editor.operation.is_some() || self.loading {
            return;
        }
        let Some(root) = self.file_root() else {
            return;
        };
        let path = self.editor_path.read(cx).value().to_string();
        let request = match create_params(&root, path.trim(), "", MAX_EDITOR_TEXT_BYTES) {
            Ok(request) => request,
            Err(error) => {
                self.editor.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.editor.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let operation = self.editor.begin();
        let generation = self.generation;
        let open = request.path.clone();
        let task = self.executor.spawn(async move {
            client
                .request::<WorkspaceFileResponse>(method::WORKSPACE_FILE_CREATE, request)
                .await
        });
        cx.spawn_in(window, async move |view, cx| {
            let result = task
                .await
                .context("Creating the file stopped")
                .and_then(|result| result.map_err(Into::into));
            let _ = view.update_in(cx, |view, window, cx| {
                if view.generation != generation || view.editor.operation != Some(operation) {
                    return;
                }
                view.editor.operation = None;
                match result {
                    Ok(response) if response.root_key == root && response.path == open => {
                        view.editor.notice = Some(format!("Created {open}."));
                        view.editor.error = None;
                        view.read_file(open, window, cx);
                    }
                    Ok(_) => {
                        view.editor.error =
                            Some("The created file did not match the requested path.".into())
                    }
                    Err(error) => view.editor.error = Some(error.to_string()),
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn rename_file(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.editor.operation.is_some() || self.loading {
            return;
        }
        let Some(root) = self.file_root() else {
            return;
        };
        let Some(from) = self.editor.file.as_ref().map(|file| file.path.clone()) else {
            self.editor.error = Some("Open a file before renaming it.".into());
            cx.notify();
            return;
        };
        let to = self.editor_path.read(cx).value().trim().to_string();
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.editor.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let operation = self.editor.begin();
        let generation = self.generation;
        cx.spawn_in(window, async move |view, cx| {
            let result: Result<WorkspaceFileRenameResponse> = async {
                let plain = rename_params(
                    &root,
                    &from,
                    &to,
                    &rename_detail(&from, &to, false),
                    false,
                    false,
                )?;
                let task = view.update(cx, |view, _| {
                    let request = plain.clone();
                    let sender = client.clone();
                    view.executor.spawn(async move {
                        sender
                            .request::<WorkspaceFileRenameResponse>(
                                method::WORKSPACE_FILE_RENAME,
                                request,
                            )
                            .await
                    })
                })?;
                match task.await.context("Renaming the file stopped")? {
                    Ok(response) => Ok(response),
                    Err(error) => {
                        let message = error.to_string();
                        if !message.contains("already exists") {
                            return Err(error.into());
                        }
                        let detail = rename_detail(&from, &to, true);
                        let prompt = cx.update(|window, cx| {
                            window.prompt(
                                PromptLevel::Warning,
                                "Replace the existing file?",
                                Some(detail.as_str()),
                                &["Keep both files", "Replace file"],
                                cx,
                            )
                        })?;
                        if prompt.await? != 1 {
                            anyhow::bail!("The existing file was kept");
                        }
                        let request = rename_params(&root, &from, &to, &detail, true, true)?;
                        let task = view.update(cx, |view, _| {
                            view.executor.spawn(async move {
                                client
                                    .request::<WorkspaceFileRenameResponse>(
                                        method::WORKSPACE_FILE_RENAME,
                                        request,
                                    )
                                    .await
                            })
                        })?;
                        task.await
                            .context("Replacing the file stopped")?
                            .map_err(Into::into)
                    }
                }
            }
            .await;
            let _ = view.update_in(cx, |view, window, cx| {
                if view.generation != generation || view.editor.operation != Some(operation) {
                    return;
                }
                view.editor.operation = None;
                match result {
                    Ok(response) if response.root_key == root && response.to == to => {
                        view.editor.notice = Some(format!("Moved {from} to {to}."));
                        view.editor.error = None;
                        view.read_file(to, window, cx);
                    }
                    Ok(_) => {
                        view.editor.error =
                            Some("The renamed file did not match the requested path.".into())
                    }
                    Err(error) => view.editor.error = Some(error.to_string()),
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn delete_file(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.editor.operation.is_some() || self.loading {
            return;
        }
        let Some(root) = self.file_root() else {
            return;
        };
        let Some(path) = self.editor.file.as_ref().map(|file| file.path.clone()) else {
            self.editor.error = Some("Open a file before deleting it.".into());
            cx.notify();
            return;
        };
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.editor.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let operation = self.editor.begin();
        let generation = self.generation;
        let detail = delete_detail(&path);
        cx.spawn_in(window, async move |view, cx| {
            let result: Result<WorkspaceFileDeleteResponse> = async {
                let prompt = cx.update(|window, cx| {
                    window.prompt(
                        PromptLevel::Warning,
                        "Delete this file?",
                        Some(detail.as_str()),
                        &["Keep file", "Delete file"],
                        cx,
                    )
                })?;
                if prompt.await? != 1 {
                    anyhow::bail!("The file was kept");
                }
                let request = delete_params(&root, &path, &detail, true)?;
                let task = view.update(cx, |view, _| {
                    view.executor.spawn(async move {
                        client
                            .request::<WorkspaceFileDeleteResponse>(
                                method::WORKSPACE_FILE_DELETE,
                                request,
                            )
                            .await
                    })
                })?;
                let response = task.await.context("Deleting the file stopped")??;
                anyhow::ensure!(
                    response.removed && response.path == path,
                    "The file was not removed"
                );
                Ok(response)
            }
            .await;
            let _ = view.update_in(cx, |view, window, cx| {
                if view.generation != generation || view.editor.operation != Some(operation) {
                    return;
                }
                view.editor.operation = None;
                match result {
                    Ok(_) => {
                        view.editor.file = None;
                        view.editor.notice = Some(format!("Deleted {path}."));
                        view.editor.error = None;
                        view.editor_buffer
                            .update(cx, |state, cx| state.set_value(String::new(), window, cx));
                    }
                    Err(error) => view.editor.error = Some(error.to_string()),
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }
}
