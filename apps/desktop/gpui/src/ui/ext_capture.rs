use super::*;
use crate::capture::{
    capture_root, dropped_file, screenshot_command, screenshot_name, screenshot_outcome,
    screenshot_supported, sweep_stale, CaptureDir, ScreenshotOutcome,
};
use agiworkforce_protocol::cloud_uploads::*;

const STALE_CAPTURE_AGE: std::time::Duration = std::time::Duration::from_secs(60 * 60);

#[derive(Default)]
pub(super) struct State {
    selecting: Option<uuid::Uuid>,
}

#[derive(Clone, Debug)]
pub(super) enum Action {
    Screenshot,
    Drop(Vec<PathBuf>),
}

struct Claim {
    selection: uuid::Uuid,
    generation: u64,
    target: CloudChatTarget,
    client: BackgroundDeveloperSessionClient,
}

impl Desktop {
    pub(super) fn capture_dispatch(
        &mut self,
        action: Action,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        match action {
            Action::Screenshot => self.capture_screenshot(window, cx),
            Action::Drop(paths) => self.capture_drop(paths, window, cx),
        }
    }

    pub(super) fn capture_hide(&mut self) {}

    pub(super) fn capture_render(
        &mut self,
        _palette: Palette,
        _window: &mut Window,
        _cx: &mut Context<Self>,
    ) -> Option<gpui::AnyElement> {
        None
    }

    pub(super) fn capture_nav(
        &self,
        sidebar: gpui::Stateful<gpui::Div>,
        _palette: Palette,
        _cx: &mut Context<Self>,
    ) -> gpui::Stateful<gpui::Div> {
        sidebar
    }

    pub(super) fn capture_observe(
        &mut self,
        _notification: &AppServerNotification,
        _cx: &mut Context<Self>,
    ) {
    }

    pub(super) fn capture_attach(&mut self, _window: &mut Window, _cx: &mut Context<Self>) {}

    pub(super) fn capture_preferences_changed(
        &mut self,
        _previous: &crate::preferences::Preferences,
        _window: &mut Window,
        _cx: &mut Context<Self>,
    ) {
    }

    pub(super) fn capture_composer_controls(
        &self,
        palette: Palette,
        cx: &mut Context<Self>,
    ) -> Option<gpui::AnyElement> {
        if !screenshot_supported() || !self.capture_ready() {
            return None;
        }
        Some(
            self.compact_button(
                "add-chat-screenshot",
                "Add screenshot",
                UiAction::Extension(extensions::ExtensionAction::Capture(Action::Screenshot)),
                palette,
                cx,
            )
            .into_any_element(),
        )
    }

    pub(super) fn capture_drop_target(
        &self,
        element: gpui::Div,
        palette: Palette,
        cx: &mut Context<Self>,
    ) -> gpui::Stateful<gpui::Div> {
        let element = element.id("cloud-chat-drop-target");
        if !self.capture_ready() {
            return element;
        }
        element
            .drag_over::<gpui::ExternalPaths>(move |style, _, _, _| style.bg(rgb(palette.hover)))
            .on_drop(
                cx.listener(|view, paths: &gpui::ExternalPaths, window, cx| {
                    view.dispatch(
                        UiAction::Extension(extensions::ExtensionAction::Capture(Action::Drop(
                            paths.paths().to_vec(),
                        ))),
                        window,
                        cx,
                    );
                }),
            )
    }

    fn capture_ready(&self) -> bool {
        self.extensions.capture.selecting.is_none()
            && !self.cloud.projects.visible
            && !self.cloud.work_visible
            && self.cloud.workspaces.selector().is_some()
            && self
                .cloud
                .detail
                .as_ref()
                .is_some_and(|detail| !detail.conversation.archived)
            && !self.cloud.loading
            && !self.cloud.navigation_busy()
            && !self.attachment_recovery.busy()
            && !self.attachment_recovery.verification_required
            && self.cloud.pending_turn.is_none()
            && !self.chat_upload.pending()
            && self.project_upload.target.is_none()
            && self
                .account_capabilities
                .as_ref()
                .is_some_and(|caps| caps.cloud_uploads)
    }

    fn capture_destination(
        &self,
        byte_count: u64,
    ) -> Result<(CloudChatTarget, BackgroundDeveloperSessionClient)> {
        let target = self.chat_target()?;
        anyhow::ensure!(
            self.chat_upload.files.is_empty() || self.chat_upload.target.as_ref() == Some(&target),
            "The attachments belong to another account, workspace or conversation"
        );
        let client = self.account_client()?;
        self.chat_upload.can_add(byte_count)?;
        Ok((target, client))
    }

    fn capture_claim(&mut self, byte_count: u64) -> Option<Claim> {
        if !self.capture_ready() {
            return None;
        }
        let (target, client) = match self.capture_destination(byte_count) {
            Ok(claimed) => claimed,
            Err(error) => {
                self.cloud.error = Some(error.to_string());
                return None;
            }
        };
        let selection = uuid::Uuid::new_v4();
        self.chat_upload.selection = selection;
        self.chat_upload.generation = self.account_generation;
        self.chat_upload.target = Some(target.clone());
        self.chat_upload.workspace_name = self
            .cloud
            .workspaces
            .selected
            .as_ref()
            .map(|workspace| workspace.name.clone())
            .unwrap_or_default();
        self.chat_upload.operation = Some(selection);
        self.chat_upload.error = None;
        Some(Claim {
            selection,
            generation: self.account_generation,
            target,
            client,
        })
    }

    fn capture_release(&mut self, selection: uuid::Uuid, error: Option<String>) {
        if self.chat_upload.selection != selection {
            return;
        }
        self.chat_upload.operation = None;
        match error {
            Some(error) => self.chat_upload.error = Some(error),
            None if self.chat_upload.files.is_empty() => self.chat_upload = Default::default(),
            None => {}
        }
    }

    fn capture_drop(&mut self, paths: Vec<PathBuf>, window: &mut Window, cx: &mut Context<Self>) {
        if !self.capture_ready() {
            return;
        }
        let selected = consent_timestamp_ms()
            .and_then(|selected_at| Ok((dropped_file(&paths, &self.chat_upload)?, selected_at)));
        let (file, selected_at) = match selected {
            Ok(selected) => selected,
            Err(error) => {
                self.cloud.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        if let Some(claim) = self.capture_claim(file.byte_count) {
            self.capture_prepare(claim, file.path, selected_at, None, window, cx);
        }
        cx.notify();
    }

    fn capture_screenshot(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if !screenshot_supported() {
            return;
        }
        let Some(claim) = self.capture_claim(1) else {
            cx.notify();
            return;
        };
        let selection = claim.selection;
        let prepared = capture_root(&std::env::temp_dir(), &self.contracts.desktop_name)
            .and_then(|root| CaptureDir::create(&root))
            .and_then(|dir| {
                let output = dir.file(&screenshot_name(chrono::Local::now()))?;
                let path = output
                    .to_str()
                    .context("The capture folder has no Unicode path")?
                    .to_owned();
                Ok((dir, output, path))
            });
        let (dir, output, path) = match prepared {
            Ok(prepared) => prepared,
            Err(error) => {
                self.capture_release(
                    selection,
                    Some(format!("The screenshot could not start: {error:#}")),
                );
                cx.notify();
                return;
            }
        };
        self.extensions.capture.selecting = Some(selection);
        let (program, arguments) = screenshot_command(&output);
        let task = self.executor.spawn(async move {
            tokio::process::Command::new(program)
                .args(arguments)
                .stdin(std::process::Stdio::null())
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .kill_on_drop(true)
                .status()
                .await
        });
        cx.hide();
        cx.spawn_in(window, async move |view, cx| {
            let status = task.await;
            let _ = view.update_in(cx, |view, window, cx| {
                cx.activate(true);
                if view.extensions.capture.selecting == Some(selection) {
                    view.extensions.capture.selecting = None;
                }
                if view.account_generation != claim.generation
                    || view.chat_upload.selection != selection
                {
                    cx.notify();
                    return;
                }
                let outcome = match status {
                    Ok(Ok(status)) => screenshot_outcome(status.success(), &output),
                    Ok(Err(error)) => ScreenshotOutcome::Failed(format!(
                        "The screenshot tool could not start: {error}"
                    )),
                    Err(error) => {
                        ScreenshotOutcome::Failed(format!("The screenshot stopped: {error}"))
                    }
                };
                match outcome {
                    ScreenshotOutcome::Captured => match consent_timestamp_ms() {
                        Ok(selected_at) => {
                            view.capture_prepare(claim, path, selected_at, Some(dir), window, cx)
                        }
                        Err(error) => view.capture_release(selection, Some(error.to_string())),
                    },
                    ScreenshotOutcome::Cancelled => view.capture_release(selection, None),
                    ScreenshotOutcome::Failed(error) => {
                        view.capture_release(selection, Some(error))
                    }
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    fn capture_prepare(
        &mut self,
        claim: Claim,
        path: String,
        selected_at_ms: i64,
        held: Option<CaptureDir>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Claim {
            selection,
            generation,
            target,
            client,
        } = claim;
        let task = self.executor.spawn(async move {
            client
                .request::<CloudUploadSnapshot>(
                    method::CLOUD_UPLOAD_PREPARE,
                    CloudUploadPrepareParams {
                        target: CloudUploadTarget::Chat { chat: target },
                        path,
                        selected_at_ms,
                    },
                )
                .await
        });
        cx.spawn_in(window, async move |view, cx| {
            let response = task.await;
            drop(held);
            let rejected = matches!(
                &response,
                Ok(Err(agiworkforce_app_server::DeveloperSessionClientError::Remote { .. }))
            );
            let result = response
                .context("Preparing the attachment stopped")
                .and_then(|result| result.map_err(Into::into));
            let _ = view.update_in(cx, |view, window, cx| {
                if view.account_generation != generation || view.chat_upload.selection != selection
                {
                    return;
                }
                view.chat_upload.operation = None;
                let accepted = view
                    .chat_upload
                    .target
                    .clone()
                    .context("The chat upload lost its destination")
                    .and_then(|target| {
                        result.and_then(|snapshot| view.chat_upload.accept(&target, None, snapshot))
                    });
                match accepted {
                    Ok(()) => view.chat_upload_action(
                        selection,
                        chat_upload::ChatUploadAction::Review,
                        window,
                        cx,
                    ),
                    Err(error) => {
                        view.chat_upload.preparation_unknown = !rejected;
                        view.chat_upload.error = Some(format!(
                            "The file was not prepared: {error:#}. File bytes are sent only after upload review."
                        ));
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }
}

pub(super) fn capture_install(_cx: &mut App) -> Result<()> {
    let contracts = NativeContracts::load()?;
    let root = capture_root(&std::env::temp_dir(), &contracts.desktop_name)?;
    let cutoff = std::time::SystemTime::now()
        .checked_sub(STALE_CAPTURE_AGE)
        .context("The capture cleanup time is invalid")?;
    sweep_stale(&root, cutoff)?;
    Ok(())
}
