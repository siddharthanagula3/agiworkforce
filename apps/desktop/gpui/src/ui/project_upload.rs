use super::*;
use crate::project_upload_controls::UploadAction;
use agiworkforce_protocol::{account_cloud::CloudProjectTarget, project_files::*};

impl Desktop {
    pub(super) fn choose_project_upload(
        &mut self,
        project_id: String,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.project_upload.target.is_some()
            || self.cloud.navigation_busy()
            || self.cloud.projects.edit.is_some()
            || !self
                .account_capabilities
                .as_ref()
                .is_some_and(|caps| caps.cloud_project_uploads)
        {
            return;
        }
        let Some(project) =
            self.cloud.projects.selected.as_ref().filter(|project| {
                project.id == project_id && project.can_edit && !project.archived
            })
        else {
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
        let client = match self.account_client() {
            Ok(client) => client,
            Err(error) => {
                self.cloud.projects.files.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let selection = uuid::Uuid::new_v4();
        let generation = self.account_generation;
        self.project_upload = crate::project_upload::ProjectUpload {
            selection,
            target: Some(target.clone()),
            generation,
            operation: Some(selection),
            workspace_name: self
                .cloud
                .workspaces
                .selected
                .as_ref()
                .map(|workspace| workspace.name.clone())
                .unwrap_or_default(),
            ..Default::default()
        };
        let paths = cx.prompt_for_paths(PathPromptOptions {
            files: true,
            directories: false,
            multiple: false,
            prompt: Some("Choose a file for this Cloud project".into()),
        });
        cx.spawn_in(window, async move |view, cx| {
            let picked = async { let Some(paths) = paths.await?? else { return Ok(None); }; anyhow::ensure!(paths.len() == 1, "Choose one file for review"); let path = paths.into_iter().next().context("Choose one file")?;
                let path = path.to_str().context("Choose a file with a Unicode path")?.to_owned(); Ok::<_, anyhow::Error>(Some((path, consent_timestamp_ms()?))) }.await;
            let chosen = match picked {
                Ok(Some(chosen)) => chosen,
                Ok(None) => { let _ = view.update(cx, |view, cx| { if view.project_upload.selection == selection { view.project_upload = Default::default(); cx.notify(); } }); return; },
                Err(error) => { let _ = view.update(cx, |view, cx| { if view.project_upload.selection == selection { view.project_upload.operation = None; view.project_upload.error = Some(error.to_string()); cx.notify(); } }); return; },
            };
            let prepared = view.update(cx, |view, _| {
                if view.account_generation != generation || view.project_upload.selection != selection || view.cloud.scope.as_ref() != Some(&target.scope) { return None; }
                let requested = target.clone();
                Some(view.executor.spawn(async move { client.request::<CloudProjectUploadSnapshot>(method::CLOUD_PROJECT_UPLOAD_PREPARE, CloudProjectUploadPrepareParams { target: requested, path: chosen.0, selected_at_ms: chosen.1 }).await }))
            });
            let Ok(Some(task)) = prepared else { return; };
            let result = task.await;
            let rejected = matches!(&result, Ok(Err(agiworkforce_app_server::DeveloperSessionClientError::Remote { .. })));
            let result = result.context("Preparing the selected file stopped").and_then(|result| result.map_err(Into::into));
            let _ = view.update_in(cx, |view, window, cx| {
                if view.account_generation != generation || view.project_upload.selection != selection { return; }
                view.project_upload.operation = None;
                match result.and_then(|snapshot| view.project_upload.accept(&target, None, snapshot)) {
                    Ok(()) => { if let Some(snapshot) = &view.project_upload.snapshot { view.review_project_upload(snapshot.review.upload.clone(), window, cx); } },
                    Err(error) => { view.project_upload.preparation_unknown = !rejected; view.project_upload.error = Some(format!("The file was not prepared for upload: {error:#}. No file bytes are sent before upload review.")); },
                }
                cx.notify();
            });
        }).detach();
        cx.notify();
    }
    fn review_project_upload(
        &mut self,
        id: CloudProjectUploadId,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.project_upload.operation.is_some() {
            return;
        }
        let Some(snapshot) = self
            .project_upload
            .snapshot
            .as_ref()
            .filter(|snapshot| {
                snapshot.review.upload == id && snapshot.phase == ProjectUploadPhase::Ready
            })
            .cloned()
        else {
            return;
        };
        let review = &snapshot.review;
        let detail = format!("Send {} ({} bytes, {}) to {} / {} in {}?\n\nFiles and derived text are available to people with access to this project. This uses the account's Cloud storage and upload allowance. Only the reviewed file snapshot is sent; selecting it grants no folder access.\n\nSHA-256: {}", review.file_name, review.byte_count, review.mime_type, self.project_upload.workspace_name, review.project_name, self.contracts.cloud_trust_label, review.checksum_sha256);
        let operation = uuid::Uuid::new_v4();
        self.project_upload.operation = Some(operation);
        let answer = window.prompt(
            PromptLevel::Warning,
            "Upload this file to the Cloud project?",
            Some(&detail),
            &["Cancel", "Upload file"],
            cx,
        );
        cx.spawn_in(window, async move |view, cx| {
            let answer = answer.await;
            let _ = view.update_in(cx, |view, window, cx| {
                if view.project_upload.operation != Some(operation)
                    || view.project_upload.snapshot.as_ref() != Some(&snapshot)
                {
                    return;
                }
                view.project_upload.operation = None;
                let action = if matches!(answer, Ok(1)) {
                    UploadAction::Start(id)
                } else {
                    UploadAction::Close(id)
                };
                if matches!(answer, Ok(1)) {
                    view.upload_action(action, window, cx);
                } else {
                    view.send_upload_command(action, cx);
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }
    pub(super) fn upload_action(
        &mut self,
        action: UploadAction,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        match action {
            UploadAction::Details(selection) => {
                if self.project_upload.selection != selection {
                    return;
                }
                let error = self.project_upload.error.as_ref().or_else(|| {
                    self.project_upload
                        .snapshot
                        .as_ref()
                        .and_then(|snapshot| snapshot.error.as_ref())
                });
                if let Some(error) = error {
                    let answer = window.prompt(
                        PromptLevel::Warning,
                        "File upload needs attention",
                        Some(error),
                        &["Close"],
                        cx,
                    );
                    cx.spawn(async move |_, _| {
                        let _ = answer.await;
                    })
                    .detach();
                }
            }
            UploadAction::Reconnect => self.reconnect_upload_account(window, cx),
            UploadAction::CloseSelection(selection) => {
                if self.project_upload.selection == selection
                    && self.project_upload.snapshot.is_none()
                    && self.project_upload.operation.is_none()
                    && !self.project_upload.preparation_unknown
                {
                    self.project_upload = Default::default();
                    cx.notify();
                }
            }
            UploadAction::Review(id) => self.review_project_upload(id, window, cx),
            UploadAction::Close(id) => {
                if self.project_upload.operation.is_some() {
                    return;
                }
                let Some(snapshot) = self
                    .project_upload
                    .snapshot
                    .as_ref()
                    .filter(|snapshot| snapshot.review.upload == id && !snapshot.phase.running())
                    .cloned()
                else {
                    return;
                };
                if snapshot.phase == ProjectUploadPhase::Succeeded {
                    self.send_upload_command(UploadAction::Close(id), cx);
                    return;
                }
                let detail = if snapshot.uncertain {
                    "This releases the local file snapshot. Cloud may already contain this file; refresh that project's files before selecting it again. Closing this review does not remove a stored file."
                } else {
                    "This discards the retained file snapshot and stops any partial upload. Local files remain unchanged. Partial Cloud bytes may remain if cleanup could not be confirmed."
                };
                let operation = uuid::Uuid::new_v4();
                self.project_upload.operation = Some(operation);
                let answer = window.prompt(
                    PromptLevel::Warning,
                    "Close this file-upload review?",
                    Some(detail),
                    &["Keep review", "Close review"],
                    cx,
                );
                cx.spawn(async move |view, cx| {
                    let close = matches!(answer.await, Ok(1));
                    let _ = view.update(cx, |view, cx| {
                        if view.project_upload.operation != Some(operation)
                            || view.project_upload.snapshot.as_ref() != Some(&snapshot)
                        {
                            return;
                        }
                        view.project_upload.operation = None;
                        if close {
                            view.send_upload_command(UploadAction::Close(id), cx);
                        }
                        cx.notify();
                    });
                })
                .detach();
                cx.notify();
            }
            action => self.send_upload_command(action, cx),
        }
    }
    fn send_upload_command(&mut self, action: UploadAction, cx: &mut Context<Self>) {
        if self.project_upload.operation.is_some() {
            return;
        }
        let Some(snapshot) = self.project_upload.snapshot.clone() else {
            return;
        };
        let id = match &action {
            UploadAction::Start(id)
            | UploadAction::Read(id)
            | UploadAction::Cancel(id)
            | UploadAction::Close(id) => id,
            _ => return,
        };
        if snapshot.review.upload != *id
            || self.project_upload.generation != self.account_generation
        {
            return;
        }
        if matches!(action, UploadAction::Start(_))
            && (snapshot.phase != ProjectUploadPhase::Ready
                && !(snapshot.phase == ProjectUploadPhase::Failed && snapshot.retryable))
        {
            return;
        }
        let client = match self.account_client() {
            Ok(client) => client,
            Err(error) => {
                self.project_upload.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let generation = self.account_generation;
        let selection = self.project_upload.selection;
        let operation = uuid::Uuid::new_v4();
        self.project_upload.operation = Some(operation);
        self.project_upload.error = None;
        let target = id.target.clone();
        let expected_id = id.id.clone();
        let interval = std::time::Duration::from_millis(self.settings.cloud_poll_interval_ms);
        let task = self.executor.spawn(async move {
            let result = match action {
                UploadAction::Start(id) => client.request::<CloudProjectUploadSnapshot>(method::CLOUD_PROJECT_UPLOAD_START, id).await.map(Some),
                UploadAction::Read(id) => client.request::<CloudProjectUploadSnapshot>(method::CLOUD_PROJECT_UPLOAD_READ, id).await.map(Some),
                UploadAction::Cancel(id) => client.request::<CloudProjectUploadSnapshot>(method::CLOUD_PROJECT_UPLOAD_CANCEL, id).await.map(Some),
                UploadAction::Close(id) => {
                    if snapshot.cancelable {
                        let mut stopped: CloudProjectUploadSnapshot = client.request(method::CLOUD_PROJECT_UPLOAD_CANCEL, id.clone()).await?;
                        while stopped.phase.running() {
                            tokio::time::sleep(interval).await;
                            stopped = client.request(method::CLOUD_PROJECT_UPLOAD_READ, id.clone()).await?;
                        }
                    }
                    let acknowledged: agiworkforce_protocol::developer_session::AcknowledgedResponse = client.request(method::CLOUD_PROJECT_UPLOAD_RELEASE, id).await?;
                    if !acknowledged.acknowledged { return Err(agiworkforce_app_server::DeveloperSessionClientError::InvalidResponse("The runtime did not confirm closing this upload review")); }
                    Ok(None)
                }
                _ => unreachable!(),
            }; result
        });
        cx.spawn(async move |view, cx| {
            let result = task.await.context("The file-upload command stopped").and_then(|result| result.map_err(Into::into));
            let _ = view.update(cx, |view, cx| {
                if view.account_generation != generation || view.project_upload.selection != selection || view.project_upload.operation != Some(operation) { return; }
                view.project_upload.operation = None;
                match result {
                    Ok(Some(snapshot)) => { if let Err(error) = view.project_upload.accept(&target, Some(&expected_id), snapshot) { view.project_upload.error = Some(error.to_string()); } else { view.refresh_uploaded_project(cx); view.poll_project_upload(cx); } },
                    Ok(None) => { view.project_upload = Default::default(); view.upload_poll_task = None; },
                    Err(error) => view.project_upload.error = Some(format!("Upload status is unconfirmed: {error:#}. Refresh its status before retrying.")),
                }
                cx.notify();
            });
        }).detach();
        cx.notify();
    }
    fn poll_project_upload(&mut self, cx: &mut Context<Self>) {
        let Some(snapshot) = self
            .project_upload
            .snapshot
            .as_ref()
            .filter(|snapshot| snapshot.phase.running())
        else {
            return;
        };
        let id = snapshot.review.upload.clone();
        let generation = self.account_generation;
        let selection = self.project_upload.selection;
        let interval = std::time::Duration::from_millis(self.settings.cloud_poll_interval_ms);
        self.upload_poll_task = Some(cx.spawn(async move |view, cx| {
            loop {
                cx.background_executor().timer(interval).await;
                let task = view.update(cx, |view, _| {
                    if view.account_generation != generation || view.project_upload.selection != selection || view.project_upload.snapshot.as_ref().is_none_or(|snapshot| snapshot.review.upload != id || !snapshot.phase.running()) { return None; }
                    if view.project_upload.operation.is_some() { return Some(None); }
                    let client = match view.account_client() { Ok(client) => client, Err(_) => return None };
                    let request = id.clone(); Some(Some(view.executor.spawn(async move { client.request::<CloudProjectUploadSnapshot>(method::CLOUD_PROJECT_UPLOAD_READ, request).await })))
                });
                let task = match task { Ok(Some(Some(task))) => task, Ok(Some(None)) => continue, _ => return };
                let result = task.await.context("Reading upload status stopped").and_then(|result| result.map_err(Into::into));
                let keep = view.update(cx, |view, cx| {
                    if view.account_generation != generation || view.project_upload.selection != selection || view.project_upload.snapshot.as_ref().is_none_or(|snapshot| snapshot.review.upload != id || !snapshot.phase.running()) { return false; }
                    if view.project_upload.operation.is_some() { return true; }
                    match result.and_then(|snapshot| view.project_upload.accept(&id.target, Some(&id.id), snapshot)) {
                        Ok(()) => { view.refresh_uploaded_project(cx); cx.notify(); view.project_upload.snapshot.as_ref().is_some_and(|snapshot| snapshot.phase.running()) },
                        Err(error) => { view.project_upload.error = Some(format!("Upload status is unconfirmed: {error:#}. Refresh its status before retrying.")); cx.notify(); false },
                    }
                });
                if !matches!(keep, Ok(true)) { return; }
            }
        }));
    }
    fn refresh_uploaded_project(&mut self, cx: &mut Context<Self>) {
        let Some(snapshot) = self
            .project_upload
            .snapshot
            .as_ref()
            .filter(|snapshot| snapshot.phase == ProjectUploadPhase::Succeeded)
        else {
            return;
        };
        let target = &snapshot.review.upload.target;
        if self.cloud.projects.visible
            && self.cloud.projects.scope.as_ref() == Some(&target.scope)
            && self.cloud.projects.workspace.as_ref() == Some(&target.workspace)
            && self
                .cloud
                .projects
                .selected
                .as_ref()
                .is_some_and(|project| project.id == target.project_id)
            && self.cloud.projects.files.operation.is_none()
            && self.cloud.projects.files.preview.is_none()
        {
            self.project_file_action(crate::project_file_controls::ProjectFileAction::Refresh, cx);
        }
    }
    pub(super) fn reconnect_upload_account(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if !self.chat_upload.retains_selection()
            && !self.project_upload.retains_unsaved_source()
            && !self.project_download.needs_close_confirmation()
        {
            self.project_upload = Default::default();
            self.upload_poll_task = None;
            self.project_download = Default::default();
            self.download_poll_task = None;
            self.connect_account(cx);
            return;
        }
        let selection = self.project_upload.selection;
        let chat_selection = self.chat_upload.selection;
        let download_selection = self.project_download.selection;
        let answer = window.prompt(PromptLevel::Warning, "Reconnect and close file-transfer reviews?", Some("This stops uploads and discards their local snapshots. Downloads stop before saving; a local save already in progress finishes safely. Saved local copies remain. Cloud may already contain a file whose completion was unconfirmed. Check uploaded files before selecting it again. Unsent chat attachment selections are discarded; stored Cloud files are not deleted."), &["Keep review", "Reconnect account"], cx);
        cx.spawn(async move |view, cx| {
            if !matches!(answer.await, Ok(1)) {
                return;
            }
            let _ = view.update(cx, |view, cx| {
                if view.project_upload.selection == selection
                    && view.chat_upload.selection == chat_selection
                    && view.project_download.selection == download_selection
                {
                    view.project_download = Default::default();
                    view.download_poll_task = None;
                    view.project_upload = Default::default();
                    view.upload_poll_task = None;
                    view.chat_upload = Default::default();
                    view.chat_upload_poll_task = None;
                    view.connect_account(cx);
                }
            });
        })
        .detach();
    }
}
