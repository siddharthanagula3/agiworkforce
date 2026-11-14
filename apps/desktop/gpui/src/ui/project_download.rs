use super::*;
use crate::project_download_controls::DownloadAction;
use agiworkforce_protocol::project_files::*;

impl Desktop {
    pub(super) fn choose_project_download(
        &mut self,
        file: CloudProjectFileVersion,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.project_download.target.is_some()
            || self.cloud.projects.edit.is_some()
            || self.cloud.navigation_busy()
            || !self
                .account_capabilities
                .as_ref()
                .is_some_and(|caps| caps.cloud_project_downloads)
            || self.project_binding().ok()
                != Some((
                    file.target.project.scope.clone(),
                    file.target.project.workspace.clone(),
                ))
            || self.cloud.projects.files.target.as_ref() != Some(&file.target.project)
        {
            return;
        }
        let Some(row) = self.cloud.projects.files.rows.iter().find(|row| {
            row.id == file.target.file_id && row.checksum_sha256 == file.checksum_sha256
        }) else {
            return;
        };
        let name = std::path::Path::new(&row.file_name)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("download")
            .to_owned();
        let directory = std::env::var_os("USERPROFILE")
            .or_else(|| std::env::var_os("HOME"))
            .map(PathBuf::from)
            .filter(|path| path.is_absolute())
            .or_else(|| std::env::current_dir().ok())
            .unwrap_or_else(std::env::temp_dir);
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
        let target = file.target.clone();
        self.project_download = crate::project_download::ProjectDownload {
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
        let path = cx.prompt_for_new_path(&directory, Some(&name));
        cx.spawn_in(window, async move |view, cx| {
            let picked = async { let Some(path) = path.await?? else { return Ok(None); }; let path = path.to_str().context("Choose a destination with a Unicode path")?.to_owned(); Ok::<_,anyhow::Error>(Some((path,consent_timestamp_ms()?))) }.await;
            let chosen = match picked {
                Ok(Some(chosen)) => chosen,
                Ok(None) => { let _ = view.update(cx, |view,cx| { if view.project_download.selection == selection { view.project_download = Default::default(); cx.notify(); } }); return; },
                Err(error) => { let _ = view.update(cx, |view,cx| { if view.project_download.selection == selection { view.project_download.operation = None; view.project_download.error = Some(error.to_string()); cx.notify(); } }); return; },
            };
            let prepared = view.update(cx, |view,_| {
                if view.account_generation != generation || view.project_download.selection != selection || view.cloud.scope.as_ref() != Some(&target.project.scope) { return None; }
                Some(view.executor.spawn(async move { client.request::<CloudProjectDownloadSnapshot>(method::CLOUD_PROJECT_DOWNLOAD_PREPARE, CloudProjectDownloadPrepareParams { file, destination: chosen.0, selected_at_ms: chosen.1 }).await }))
            });
            let Ok(Some(task)) = prepared else { return; };
            let result = task.await;
            let rejected = matches!(&result, Ok(Err(agiworkforce_app_server::DeveloperSessionClientError::Remote { .. })));
            let result = result.context("Preparing the save destination stopped").and_then(|result| result.map_err(Into::into));
            let _ = view.update_in(cx, |view,window,cx| {
                if view.account_generation != generation || view.project_download.selection != selection { return; }
                view.project_download.operation = None;
                match result.and_then(|snapshot| view.project_download.accept(&target,None,snapshot)) {
                    Ok(()) => { if let Some(snapshot) = &view.project_download.snapshot { view.review_project_download(snapshot.review.download.clone(),window,cx); } },
                    Err(error) => { view.project_download.preparation_unknown = !rejected; view.project_download.error = Some(format!("The save destination was not prepared: {error:#}. The download does not write before save review.")); },
                }
                cx.notify();
            });
        }).detach();
        cx.notify();
    }
    fn review_project_download(
        &mut self,
        id: CloudProjectDownloadId,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.project_download.operation.is_some() {
            return;
        }
        let Some(snapshot) = self
            .project_download
            .snapshot
            .as_ref()
            .filter(|snapshot| {
                snapshot.review.download == id && snapshot.phase == ProjectDownloadPhase::Ready
            })
            .cloned()
        else {
            return;
        };
        let review = &snapshot.review;
        let detail = format!("Save {} ({} bytes) from {} / {} in {} to {}?\n\n{}The file is verified against its source checksum before saving. Changes to the selected destination are checked again before publication. If a replacement fails after writing starts, an original copy is retained locally and its path is shown in the error. Selecting this path grants no coding-folder access.\n\nSHA-256: {}", review.file.file_name,review.file.byte_count,self.project_download.workspace_name,review.project_name,self.contracts.cloud_trust_label,review.destination,
            if review.replaces { "This replaces the existing destination's contents. Copy anything you need before continuing. " } else { "A new file will be created; an existing file will not be overwritten. " },review.file.checksum_sha256);
        let operation = uuid::Uuid::new_v4();
        self.project_download.operation = Some(operation);
        let answer = window.prompt(
            PromptLevel::Warning,
            if review.replaces {
                "Replace this file with the Cloud source?"
            } else {
                "Save this Cloud file?"
            },
            Some(&detail),
            &[
                "Cancel",
                if review.replaces {
                    "Replace file"
                } else {
                    "Save file"
                },
            ],
            cx,
        );
        cx.spawn_in(window, async move |view, cx| {
            let answer = answer.await;
            let _ = view.update_in(cx, |view, _, cx| {
                if view.project_download.operation != Some(operation)
                    || view.project_download.snapshot.as_ref() != Some(&snapshot)
                {
                    return;
                }
                view.project_download.operation = None;
                view.send_download_command(
                    if matches!(answer, Ok(1)) {
                        DownloadAction::Start(id)
                    } else {
                        DownloadAction::Close(id)
                    },
                    cx,
                );
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }
    pub(super) fn download_action(
        &mut self,
        action: DownloadAction,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        match action {
            DownloadAction::Review(id) => self.review_project_download(id, window, cx),
            DownloadAction::Reconnect => self.reconnect_upload_account(window, cx),
            DownloadAction::CloseSelection(selection) => {
                if self.project_download.selection == selection
                    && self.project_download.snapshot.is_none()
                    && self.project_download.operation.is_none()
                    && !self.project_download.preparation_unknown
                {
                    self.project_download = Default::default();
                    cx.notify();
                }
            }
            DownloadAction::Details(selection) => {
                if self.project_download.selection != selection {
                    return;
                }
                if let Some(error) = self.project_download.error.as_ref().or_else(|| {
                    self.project_download
                        .snapshot
                        .as_ref()
                        .and_then(|snapshot| snapshot.error.as_ref())
                }) {
                    let answer = window.prompt(
                        PromptLevel::Warning,
                        "File download needs attention",
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
            DownloadAction::Reveal(id) => {
                if let Some(snapshot) = self.project_download.snapshot.as_ref().filter(|snapshot| {
                    snapshot.review.download == id
                        && snapshot.phase == ProjectDownloadPhase::Succeeded
                }) {
                    cx.reveal_path(std::path::Path::new(&snapshot.review.destination));
                }
            }
            DownloadAction::Close(id) => {
                if self.project_download.operation.is_some() {
                    return;
                }
                let Some(snapshot) = self
                    .project_download
                    .snapshot
                    .as_ref()
                    .filter(|snapshot| snapshot.review.download == id && !snapshot.phase.running())
                    .cloned()
                else {
                    return;
                };
                if !snapshot.uncertain {
                    self.send_download_command(DownloadAction::Close(id), cx);
                    return;
                }
                let operation = uuid::Uuid::new_v4();
                self.project_download.operation = Some(operation);
                let answer=window.prompt(PromptLevel::Warning,"Close this unconfirmed save review?",Some("The selected destination may already contain the downloaded file. Check it before choosing the same path again. Closing this review does not remove or restore local files."),&["Keep review","Close review"],cx);
                cx.spawn(async move |view, cx| {
                    let close = matches!(answer.await, Ok(1));
                    let _ = view.update(cx, |view, cx| {
                        if view.project_download.operation != Some(operation)
                            || view.project_download.snapshot.as_ref() != Some(&snapshot)
                        {
                            return;
                        }
                        view.project_download.operation = None;
                        if close {
                            view.send_download_command(DownloadAction::Close(id), cx);
                        }
                        cx.notify();
                    });
                })
                .detach();
                cx.notify();
            }
            action => self.send_download_command(action, cx),
        }
    }
    fn send_download_command(&mut self, action: DownloadAction, cx: &mut Context<Self>) {
        if self.project_download.operation.is_some() {
            return;
        }
        let Some(snapshot) = self.project_download.snapshot.clone() else {
            return;
        };
        let id = match &action {
            DownloadAction::Start(id)
            | DownloadAction::Read(id)
            | DownloadAction::Cancel(id)
            | DownloadAction::Close(id) => id,
            _ => return,
        };
        if snapshot.review.download != *id
            || self.project_download.generation != self.account_generation
        {
            return;
        }
        if matches!(action, DownloadAction::Start(_))
            && snapshot.phase != ProjectDownloadPhase::Ready
            && !(snapshot.phase == ProjectDownloadPhase::Failed && snapshot.retryable)
        {
            return;
        }
        let client = match self.account_client() {
            Ok(client) => client,
            Err(error) => {
                self.project_download.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let generation = self.account_generation;
        let selection = self.project_download.selection;
        let operation = uuid::Uuid::new_v4();
        self.project_download.operation = Some(operation);
        self.project_download.error = None;
        let target = id.file.clone();
        let expected = id.id.clone();
        let interval = std::time::Duration::from_millis(self.settings.cloud_poll_interval_ms);
        let task = self.executor.spawn(async move {
            match action {
                DownloadAction::Start(id) => client
                    .request::<CloudProjectDownloadSnapshot>(
                        method::CLOUD_PROJECT_DOWNLOAD_START,
                        id,
                    )
                    .await
                    .map(Some),
                DownloadAction::Read(id) => client
                    .request::<CloudProjectDownloadSnapshot>(
                        method::CLOUD_PROJECT_DOWNLOAD_READ,
                        id,
                    )
                    .await
                    .map(Some),
                DownloadAction::Cancel(id) => client
                    .request::<CloudProjectDownloadSnapshot>(
                        method::CLOUD_PROJECT_DOWNLOAD_CANCEL,
                        id,
                    )
                    .await
                    .map(Some),
                DownloadAction::Close(id) => {
                    if snapshot.cancelable {
                        let mut stopped: CloudProjectDownloadSnapshot = client
                            .request(method::CLOUD_PROJECT_DOWNLOAD_CANCEL, id.clone())
                            .await?;
                        while stopped.phase.running() {
                            tokio::time::sleep(interval).await;
                            stopped = client
                                .request(method::CLOUD_PROJECT_DOWNLOAD_READ, id.clone())
                                .await?;
                        }
                    }
                    let ack: agiworkforce_protocol::developer_session::AcknowledgedResponse =
                        client
                            .request(method::CLOUD_PROJECT_DOWNLOAD_RELEASE, id)
                            .await?;
                    if !ack.acknowledged {
                        return Err(
                            agiworkforce_app_server::DeveloperSessionClientError::InvalidResponse(
                                "The runtime did not confirm closing the download review",
                            ),
                        );
                    }
                    Ok(None)
                }
                _ => unreachable!(),
            }
        });
        cx.spawn(async move|view,cx|{let result=task.await.context("The download command stopped").and_then(|result|result.map_err(Into::into));let _=view.update(cx,|view,cx|{
            if view.account_generation!=generation||view.project_download.selection!=selection||view.project_download.operation!=Some(operation){return;}view.project_download.operation=None;
            match result{Ok(Some(snapshot))=>{if let Err(error)=view.project_download.accept(&target,Some(&expected),snapshot){view.project_download.error=Some(error.to_string());}else{view.poll_project_download(cx);}},Ok(None)=>{view.project_download=Default::default();view.download_poll_task=None;},Err(error)=>view.project_download.error=Some(format!("Download status is unconfirmed: {error:#}. Check its status before retrying.")),}cx.notify();
        });}).detach();
        cx.notify();
    }
    fn poll_project_download(&mut self, cx: &mut Context<Self>) {
        let Some(snapshot) = self
            .project_download
            .snapshot
            .as_ref()
            .filter(|snapshot| snapshot.phase.running())
        else {
            return;
        };
        let id = snapshot.review.download.clone();
        let generation = self.account_generation;
        let selection = self.project_download.selection;
        let interval = std::time::Duration::from_millis(self.settings.cloud_poll_interval_ms);
        self.download_poll_task=Some(cx.spawn(async move|view,cx|{loop{
            cx.background_executor().timer(interval).await;
            let task=view.update(cx,|view,_|{if view.account_generation!=generation||view.project_download.selection!=selection||view.project_download.snapshot.as_ref().is_none_or(|snapshot|snapshot.review.download!=id||!snapshot.phase.running()){return None;}
                    if view.project_download.operation.is_some(){return Some(None);}let client=match view.account_client(){Ok(client)=>client,Err(_)=>return None};let request=id.clone();Some(Some(view.executor.spawn(async move{client.request::<CloudProjectDownloadSnapshot>(method::CLOUD_PROJECT_DOWNLOAD_READ,request).await})))});
            let task=match task{Ok(Some(Some(task)))=>task,Ok(Some(None))=>continue,_=>return};let result=task.await.context("Reading download status stopped").and_then(|result|result.map_err(Into::into));
            let keep=view.update(cx,|view,cx|{if view.account_generation!=generation||view.project_download.selection!=selection||view.project_download.snapshot.as_ref().is_none_or(|snapshot|snapshot.review.download!=id||!snapshot.phase.running()){return false;}
                    if view.project_download.operation.is_some(){return true;}match result.and_then(|snapshot|view.project_download.accept(&id.file,Some(&id.id),snapshot)){Ok(())=>{cx.notify();view.project_download.snapshot.as_ref().is_some_and(|snapshot|snapshot.phase.running())},Err(error)=>{view.project_download.error=Some(format!("Download status is unconfirmed: {error:#}. Check its status before retrying."));cx.notify();false}}});
            if !matches!(keep,Ok(true)){return;}
        }}));
    }
}
