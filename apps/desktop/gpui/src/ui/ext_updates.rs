use std::path::PathBuf;
use std::time::Duration;

use anyhow::anyhow;

use super::extensions::ExtensionAction;
use super::*;
use crate::updates::{
    self, AvailableUpdate, CheckOutcome, MacArchitecture, ReleaseFeed, UpdateClient, Version,
};

#[derive(Clone, Default)]
enum Phase {
    #[default]
    Idle,
    Checking,
    UpToDate(Option<String>),
    Available(AvailableUpdate),
    Downloading(AvailableUpdate),
    Ready(AvailableUpdate, PathBuf),
    Failed(String, Option<AvailableUpdate>),
}

#[derive(Default)]
pub(super) struct State {
    visible: bool,
    phase: Phase,
    automatic: bool,
    operation: Option<uuid::Uuid>,
    task: Option<gpui::Task<()>>,
    notices_task: Option<gpui::Task<()>>,
    notice: Option<String>,
    runtime: Option<String>,
}

#[derive(Clone, Debug)]
pub(super) enum Action {
    Open,
    Check,
    Download,
    OpenInstaller,
    RevealInstaller,
    OpenNotices,
}

fn update_client(timeout: Duration) -> anyhow::Result<UpdateClient> {
    let architecture = MacArchitecture::current()
        .ok_or_else(|| anyhow!("Updates for this platform are not published yet."))?;
    Ok(UpdateClient::new(
        ReleaseFeed::production()?,
        Version::current(),
        architecture,
        timeout,
    ))
}

fn notices_path() -> anyhow::Result<PathBuf> {
    let executable = std::env::current_exe()?;
    if let Some(path) = updates::bundled_notices(&executable) {
        return Ok(path);
    }
    let output = std::process::Command::new(&executable)
        .arg("--licenses")
        .stdin(std::process::Stdio::null())
        .output()?;
    anyhow::ensure!(
        output.status.success(),
        "The open-source notices could not be generated"
    );
    updates::write_notices(
        &std::env::temp_dir().join(uuid::Uuid::new_v4().to_string()),
        &output.stdout,
    )
}

impl Desktop {
    pub(super) fn updates_dispatch(
        &mut self,
        action: Action,
        _window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.extensions.updates.visible = true;
        self.extensions.updates.notice = None;
        match action {
            Action::Open => {
                if self.extensions.updates.runtime.is_none() {
                    self.extensions.updates.runtime = Some(self.updates_runtime_label());
                }
            }
            Action::Check => self.updates_check(false, cx),
            Action::Download => self.updates_download(cx),
            Action::OpenInstaller => {
                if let Phase::Ready(_, path) = &self.extensions.updates.phase {
                    cx.open_with_system(path);
                }
            }
            Action::RevealInstaller => {
                if let Phase::Ready(_, path) = &self.extensions.updates.phase {
                    cx.reveal_path(path);
                }
            }
            Action::OpenNotices => self.updates_open_notices(cx),
        }
    }

    fn updates_runtime_label(&self) -> String {
        std::env::current_exe()
            .ok()
            .as_deref()
            .and_then(updates::bundled_runtime_version)
            .map(|version| format!("Runtime CLI version {version}"))
            .unwrap_or_else(|| {
                format!(
                    "Runtime CLI: {} (development build; version not recorded)",
                    self.binary.display()
                )
            })
    }

    fn updates_open_notices(&mut self, cx: &mut Context<Self>) {
        if self.extensions.updates.notices_task.is_some() {
            return;
        }
        let task = self.executor.spawn_blocking(notices_path);
        self.extensions.updates.notices_task = Some(cx.spawn(async move |view, cx| {
            let result = task
                .await
                .unwrap_or_else(|error| Err(anyhow!("Opening the notices stopped: {error}")));
            let _ = view.update(cx, |view, cx| {
                view.extensions.updates.notices_task = None;
                match result {
                    Ok(path) => cx.open_with_system(&path),
                    Err(error) => {
                        view.extensions.updates.notice = Some(format!(
                            "The open-source notices could not be opened. {error:#}"
                        ));
                    }
                }
                cx.notify();
            });
        }));
    }

    pub(super) fn updates_hide(&mut self) {
        self.extensions.updates.visible = false;
    }

    fn updates_busy(&self) -> bool {
        matches!(
            self.extensions.updates.phase,
            Phase::Checking | Phase::Downloading(_)
        )
    }

    fn updates_check(&mut self, automatic: bool, cx: &mut Context<Self>) {
        if self.updates_busy() || matches!(self.extensions.updates.phase, Phase::Ready(..)) {
            return;
        }
        let client = match update_client(Duration::from_millis(self.settings.request_timeout_ms)) {
            Ok(client) => client,
            Err(error) => {
                self.extensions.updates.phase = Phase::Failed(format!("{error:#}"), None);
                cx.notify();
                return;
            }
        };
        let id = uuid::Uuid::new_v4();
        let state = &mut self.extensions.updates;
        state.operation = Some(id);
        state.automatic = automatic;
        state.phase = Phase::Checking;
        let task = self.executor.spawn_blocking(move || client.check());
        self.extensions.updates.task = Some(cx.spawn(async move |view, cx| {
            let result = task
                .await
                .unwrap_or_else(|error| Err(anyhow!("The update check stopped: {error}")));
            let _ = view.update(cx, |view, cx| {
                let state = &mut view.extensions.updates;
                if state.operation != Some(id) {
                    return;
                }
                state.operation = None;
                state.phase = match result {
                    Ok(CheckOutcome::UpToDate { latest }) => Phase::UpToDate(latest),
                    Ok(CheckOutcome::Available(update)) => Phase::Available(update),
                    Err(error) => Phase::Failed(format!("{error:#}"), None),
                };
                cx.notify();
            });
        }));
        cx.notify();
    }

    fn updates_download(&mut self, cx: &mut Context<Self>) {
        let update = match &self.extensions.updates.phase {
            Phase::Available(update) | Phase::Failed(_, Some(update)) => update.clone(),
            _ => return,
        };
        let client = update_client(Duration::from_millis(self.settings.request_timeout_ms));
        let directory = updates::downloads_directory(std::env::var_os("HOME"));
        let (client, directory) = match (client, directory) {
            (Ok(client), Ok(directory)) => (client, directory),
            (Err(error), _) | (_, Err(error)) => {
                self.extensions.updates.phase = Phase::Failed(format!("{error:#}"), Some(update));
                cx.notify();
                return;
            }
        };
        let running_bundle = std::env::current_exe()
            .ok()
            .and_then(|executable| updates::bundle_path(&executable));
        let id = uuid::Uuid::new_v4();
        let state = &mut self.extensions.updates;
        state.operation = Some(id);
        state.automatic = false;
        state.phase = Phase::Downloading(update.clone());
        let requested = update.clone();
        let task = self.executor.spawn_blocking(move || {
            client.download(
                &requested,
                &directory,
                updates::gatekeeper_gate(running_bundle),
            )
        });
        self.extensions.updates.task = Some(cx.spawn(async move |view, cx| {
            let result = task
                .await
                .unwrap_or_else(|error| Err(anyhow!("The update download stopped: {error}")));
            let _ = view.update(cx, |view, cx| {
                let state = &mut view.extensions.updates;
                if state.operation != Some(id) {
                    return;
                }
                state.operation = None;
                state.phase = match result {
                    Ok(path) => Phase::Ready(update, path),
                    Err(error) => Phase::Failed(format!("{error:#}"), Some(update)),
                };
                cx.notify();
            });
        }));
        cx.notify();
    }

    fn updates_status(&self) -> Vec<String> {
        let name = &self.contracts.desktop_name;
        let current = Version::current();
        match &self.extensions.updates.phase {
            Phase::Idle => vec![if self.preferences.check_for_updates {
                "Updates are checked when the app starts.".to_owned()
            } else {
                "Automatic update checks are off. You can still check now.".to_owned()
            }],
            Phase::Checking => vec!["Checking for updates…".to_owned()],
            Phase::UpToDate(latest) => vec![
                format!("{name} is up to date."),
                match latest {
                    Some(latest) if *latest != current.to_string() => {
                        format!("Installed: {current}. Latest published: {latest}.")
                    }
                    _ => format!("Installed: {current}. No newer version is available."),
                },
            ],
            Phase::Available(update) => vec![
                format!("{name} {} is available.", update.version),
                format!(
                    "You have {current}. The installer is downloaded to your Downloads folder and opened only after its published checksum and Apple notarization are verified."
                ),
            ],
            Phase::Downloading(update) => vec![format!(
                "Downloading and verifying {name} {}…",
                update.version
            )],
            Phase::Ready(update, path) => vec![
                format!("{name} {} is downloaded and verified.", update.version),
                format!("Saved to {}.", path.display()),
                format!("Open the installer, then replace {name} in Applications and reopen it."),
            ],
            Phase::Failed(message, _) => vec![
                "Couldn’t update.".to_owned(),
                message.clone(),
            ],
        }
    }

    pub(super) fn updates_render(
        &mut self,
        palette: Palette,
        _window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Option<gpui::AnyElement> {
        let state = &self.extensions.updates;
        if !state.visible {
            return None;
        }
        let runtime = state.runtime.clone().unwrap_or_default();
        let mut panel = div()
            .w_full()
            .min_w_0()
            .max_w(px(self.contracts.frame.content_width))
            .flex()
            .flex_col()
            .gap_3()
            .child(gpui::text!(format!(
                "About {}",
                self.contracts.desktop_name
            )))
            .child(gpui::text!(format!("Version {}", Version::current())))
            .child(gpui::text!(runtime))
            .child(self.button(
                "updates-notices",
                "Open-source notices",
                UiAction::Extension(ExtensionAction::Updates(Action::OpenNotices)),
                palette,
                cx,
            ));
        if let Some(notice) = &state.notice {
            panel = panel.child(gpui::text!(notice.clone()));
        }
        panel = panel.child(gpui::text!("Updates"));
        for line in self.updates_status() {
            panel = panel.child(gpui::text!(line));
        }
        let mut controls = div().flex().flex_wrap().gap_2();
        match &state.phase {
            Phase::Idle | Phase::UpToDate(_) | Phase::Failed(_, None) => {
                controls = controls.child(self.button(
                    "updates-check",
                    "Check for updates",
                    UiAction::Extension(ExtensionAction::Updates(Action::Check)),
                    palette,
                    cx,
                ));
            }
            Phase::Available(_) | Phase::Failed(_, Some(_)) => {
                controls = controls
                    .child(self.button(
                        "updates-download",
                        if matches!(state.phase, Phase::Failed(..)) {
                            "Try download again"
                        } else {
                            "Download update"
                        },
                        UiAction::Extension(ExtensionAction::Updates(Action::Download)),
                        palette,
                        cx,
                    ))
                    .child(self.button(
                        "updates-check",
                        "Check again",
                        UiAction::Extension(ExtensionAction::Updates(Action::Check)),
                        palette,
                        cx,
                    ));
            }
            Phase::Ready(..) => {
                controls = controls
                    .child(self.button(
                        "updates-open-installer",
                        "Open installer",
                        UiAction::Extension(ExtensionAction::Updates(Action::OpenInstaller)),
                        palette,
                        cx,
                    ))
                    .child(self.button(
                        "updates-reveal-installer",
                        "Show in Finder",
                        UiAction::Extension(ExtensionAction::Updates(Action::RevealInstaller)),
                        palette,
                        cx,
                    ));
            }
            Phase::Checking | Phase::Downloading(_) => {}
        }
        Some(panel.child(controls).into_any_element())
    }

    pub(super) fn updates_nav(
        &self,
        sidebar: gpui::Stateful<gpui::Div>,
        palette: Palette,
        cx: &mut Context<Self>,
    ) -> gpui::Stateful<gpui::Div> {
        let state = &self.extensions.updates;
        let label = match state.phase {
            Phase::Available(_) | Phase::Ready(..) => "About · update available",
            _ => "About",
        };
        let accessible = if state.visible {
            format!("{label}, current")
        } else {
            label.to_owned()
        };
        sidebar.child(
            self.compact_button(
                "updates-nav",
                label,
                UiAction::Extension(ExtensionAction::Updates(Action::Open)),
                palette,
                cx,
            )
            .w_full()
            .min_w_0()
            .truncate()
            .aria_label(accessible)
            .when(state.visible, |row| row.bg(rgb(palette.hover))),
        )
    }

    pub(super) fn updates_observe(
        &mut self,
        _notification: &AppServerNotification,
        _cx: &mut Context<Self>,
    ) {
    }

    pub(super) fn updates_attach(&mut self, _window: &mut Window, cx: &mut Context<Self>) {
        if self.preferences.check_for_updates && MacArchitecture::current().is_some() {
            self.updates_check(true, cx);
        }
    }

    pub(super) fn updates_preferences_changed(
        &mut self,
        previous: &crate::preferences::Preferences,
        _window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let enabled = self.preferences.check_for_updates;
        if enabled == previous.check_for_updates {
            return;
        }
        let state = &mut self.extensions.updates;
        if !enabled && state.automatic && matches!(state.phase, Phase::Checking) {
            state.operation = None;
            state.task = None;
            state.automatic = false;
            state.phase = Phase::Idle;
        } else if enabled && matches!(state.phase, Phase::Idle) {
            self.updates_check(true, cx);
        }
    }
}

pub(super) fn updates_install(_cx: &mut App) -> Result<()> {
    Ok(())
}
