use std::collections::VecDeque;
use std::time::Instant;

use global_hotkey::hotkey::HotKey;
use global_hotkey::{GlobalHotKeyEvent, GlobalHotKeyManager, HotKeyState};

use super::*;
use crate::integration::{
    self as links, DeepLinkContract, DeepLinkQueue, DeepLinkRoute, InboxEvent, MenuBarStatus,
    QuickAskShortcut, ShortcutStatus, TrayCommand,
};

#[cfg(any(target_os = "macos", target_os = "windows"))]
const TRAY_ICON_PNG: &[u8] = include_bytes!("../../../electron/assets/trayTemplate@2x.png");

const LINK_NOT_OPENED: &str = "Link not opened";
const NEW_CHAT_NOT_STARTED: &str = "New chat not started";

#[derive(Clone, Debug)]
enum Target {
    Conversation(String),
    Project(String),
    Session(String),
    NewChat,
}

struct PendingTarget {
    target: Target,
    deadline: Instant,
}

#[derive(Default)]
pub(super) struct State {
    pending: VecDeque<PendingTarget>,
    flushing: bool,
    flush_task: Option<gpui::Task<()>>,
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    tray: Option<tray_icon::TrayIcon>,
    hotkeys: Option<GlobalHotKeyManager>,
    quick_ask: Option<HotKey>,
    pub(super) shortcut_status: ShortcutStatus,
    pub(super) menu_bar_status: MenuBarStatus,
}

#[derive(Clone, Debug)]
pub(super) enum Action {
    OpenLink(String),
    QuickAsk,
    Tray(TrayCommand),
}

#[derive(Default)]
struct Hub {
    links: DeepLinkQueue,
    target: Option<(gpui::WeakEntity<Desktop>, gpui::AnyWindowHandle)>,
}

impl gpui::Global for Hub {}

fn integration_action(action: Action) -> UiAction {
    UiAction::Extension(extensions::ExtensionAction::Integration(action))
}

impl Desktop {
    pub(super) fn integration_dispatch(
        &mut self,
        action: Action,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        match action {
            Action::OpenLink(url) => self.integration_open_link(&url, window, cx),
            Action::QuickAsk => {
                self.integration_surface(window, cx);
                self.integration_queue(Target::NewChat, window, cx);
            }
            Action::Tray(TrayCommand::Open) => self.integration_surface(window, cx),
            Action::Tray(TrayCommand::Hide) => integration_hide_window(window, cx),
            Action::Tray(TrayCommand::NewChat) => {
                self.integration_surface(window, cx);
                self.integration_queue(Target::NewChat, window, cx);
            }
            Action::Tray(TrayCommand::Quit) => {
                self.integration_surface(window, cx);
                self.request_close(true, window, cx);
            }
        }
    }

    pub(super) fn integration_hide(&mut self) {}

    pub(super) fn integration_render(
        &mut self,
        _palette: Palette,
        _window: &mut Window,
        _cx: &mut Context<Self>,
    ) -> Option<gpui::AnyElement> {
        None
    }

    pub(super) fn integration_nav(
        &self,
        sidebar: gpui::Stateful<gpui::Div>,
        _palette: Palette,
        _cx: &mut Context<Self>,
    ) -> gpui::Stateful<gpui::Div> {
        sidebar
    }

    pub(super) fn integration_observe(
        &mut self,
        _notification: &AppServerNotification,
        _cx: &mut Context<Self>,
    ) {
    }

    pub(super) fn integration_attach(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.integration_sync_menu_bar(cx);
        self.integration_sync_shortcut(false, window, cx);
        let view = cx.entity().downgrade();
        let handle = window.window_handle();
        let waiting = {
            let hub = cx.default_global::<Hub>();
            hub.target = Some((view, handle));
            hub.links.drain_fresh(Instant::now())
        };
        for url in waiting {
            self.dispatch(integration_action(Action::OpenLink(url)), window, cx);
        }
    }

    pub(super) fn integration_preferences_changed(
        &mut self,
        previous: &crate::preferences::Preferences,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if previous.show_in_menu_bar != self.preferences.show_in_menu_bar {
            self.integration_sync_menu_bar(cx);
        }
        if previous.quick_ask_shortcut != self.preferences.quick_ask_shortcut {
            self.integration_sync_shortcut(true, window, cx);
        }
    }

    fn integration_receive(
        &mut self,
        event: InboxEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let action = match event {
            InboxEvent::OpenUrls(urls) => {
                for url in urls {
                    self.dispatch(integration_action(Action::OpenLink(url)), window, cx);
                }
                return;
            }
            InboxEvent::HotKey(id) => {
                if self
                    .extensions
                    .integration
                    .quick_ask
                    .map(|hotkey| hotkey.id())
                    != Some(id)
                {
                    return;
                }
                Action::QuickAsk
            }
            InboxEvent::TrayMenu(id) => match TrayCommand::from_id(&id) {
                Some(command) => Action::Tray(command),
                None => return,
            },
            InboxEvent::TrayActivated => Action::Tray(TrayCommand::Open),
        };
        self.dispatch(integration_action(action), window, cx);
    }

    fn integration_surface(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        cx.activate(true);
        window.activate_window();
    }

    fn integration_notice(
        &self,
        title: &str,
        message: String,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let answer = window.prompt(PromptLevel::Info, title, Some(&message), &["OK"], cx);
        cx.spawn(async move |_, _| {
            let _ = answer.await;
        })
        .detach();
    }

    fn integration_open_link(&mut self, url: &str, window: &mut Window, cx: &mut Context<Self>) {
        self.integration_surface(window, cx);
        let route = match DeepLinkContract::load() {
            Ok(contract) => contract.parse(url),
            Err(error) => {
                self.integration_notice(
                    LINK_NOT_OPENED,
                    format!("Links cannot be opened in this build: {error:#}"),
                    window,
                    cx,
                );
                return;
            }
        };
        let route = match route {
            Ok(route) => route,
            Err(rejection) => {
                self.integration_notice(LINK_NOT_OPENED, rejection.message(), window, cx);
                return;
            }
        };
        match route {
            DeepLinkRoute::Conversation(id) => {
                self.integration_queue(Target::Conversation(id), window, cx)
            }
            DeepLinkRoute::Project(id) => self.integration_queue(Target::Project(id), window, cx),
            DeepLinkRoute::CodeHome => self.dispatch(UiAction::Code, window, cx),
            DeepLinkRoute::LocalSession { thread_id, folder } => {
                let open = self
                    .workspace
                    .as_ref()
                    .and_then(|workspace| workspace.canonicalize().ok());
                if open.is_some() && folder.canonicalize().ok() == open {
                    self.integration_queue(Target::Session(thread_id), window, cx);
                } else {
                    self.dispatch(UiAction::Code, window, cx);
                    self.integration_notice(
                        LINK_NOT_OPENED,
                        format!(
                            "This session runs in {}, which is not the folder open in Code. Open that folder with Open Folder, then open the link again.",
                            folder.display()
                        ),
                        window,
                        cx,
                    );
                }
            }
            DeepLinkRoute::SignIn => {
                self.dispatch(UiAction::Account, window, cx);
                self.integration_notice(
                    LINK_NOT_OPENED,
                    "This app signs in with the code shown in Account, not with a browser link, so this sign-in link was not used.".into(),
                    window,
                    cx,
                );
            }
        }
    }

    fn integration_queue(&mut self, target: Target, window: &mut Window, cx: &mut Context<Self>) {
        self.extensions
            .integration
            .pending
            .push_back(PendingTarget {
                target,
                deadline: Instant::now() + links::LINK_READY_TIMEOUT,
            });
        self.integration_schedule_flush(window, cx);
    }

    fn integration_schedule_flush(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.extensions.integration.flushing || !self.integration_flush(window, cx) {
            return;
        }
        self.extensions.integration.flushing = true;
        self.extensions.integration.flush_task =
            Some(cx.spawn_in(window, async move |view, cx| {
                loop {
                    cx.background_executor()
                        .timer(links::LINK_READY_POLL_INTERVAL)
                        .await;
                    let more = view.update_in(cx, Self::integration_flush).unwrap_or(false);
                    if !more {
                        break;
                    }
                }
                let _ = view.update(cx, |view, _| view.extensions.integration.flushing = false);
            }));
    }

    fn integration_flush(&mut self, window: &mut Window, cx: &mut Context<Self>) -> bool {
        while let Some(front) = self.extensions.integration.pending.front() {
            let target = front.target.clone();
            if self.integration_ready(&target, cx) {
                self.extensions.integration.pending.pop_front();
                self.integration_deliver(target, window, cx);
                continue;
            }
            if Instant::now() >= front.deadline {
                self.extensions.integration.pending.pop_front();
                let (title, message) = self.integration_timeout_notice(&target);
                self.integration_notice(title, message, window, cx);
                continue;
            }
            if matches!(target, Target::Conversation(_) | Target::Project(_))
                && self.account.pending.is_none()
                && self.account_client().is_ok()
            {
                self.require_cloud_workspace(cx);
            }
            return true;
        }
        false
    }

    fn integration_timeout_notice(&self, target: &Target) -> (&'static str, String) {
        let account = self
            .account
            .notice
            .as_ref()
            .map(|notice| format!(" {notice}"))
            .unwrap_or_default();
        match target {
            Target::Conversation(_) | Target::Project(_) => (
                LINK_NOT_OPENED,
                format!("Cloud history was not ready in time. Check Account, then open the link again.{account}"),
            ),
            Target::Session(_) => (
                LINK_NOT_OPENED,
                "Code was busy with another turn. Stop it, then open the link again.".into(),
            ),
            Target::NewChat => (
                NEW_CHAT_NOT_STARTED,
                format!("Cloud chat was not ready in time. Check Account, then try again.{account}"),
            ),
        }
    }

    fn integration_ready(&self, target: &Target, cx: &mut Context<Self>) -> bool {
        let cloud_idle =
            self.account.pending.is_none() && !self.cloud.loading && !self.cloud.navigation_busy();
        match target {
            Target::Conversation(_) | Target::Project(_) => {
                cloud_idle
                    && self.account_client().is_ok()
                    && self.cloud.workspaces.selector().is_some()
                    && self.cloud.scope.is_some()
                    && !self.has_unsaved_cloud_draft(cx)
            }
            Target::NewChat => cloud_idle,
            Target::Session(_) => !self.loading && !self.code_busy(),
        }
    }

    fn integration_deliver(&mut self, target: Target, window: &mut Window, cx: &mut Context<Self>) {
        match target {
            Target::Conversation(id) => self.dispatch(UiAction::ReadCloud(id), window, cx),
            Target::Project(id) => self.dispatch(UiAction::ReadProject(id), window, cx),
            Target::Session(id) => self.dispatch(UiAction::ReadSession(id), window, cx),
            Target::NewChat => {
                self.dispatch(UiAction::NewCloud, window, cx);
                self.cloud_composer
                    .update(cx, |state, cx| state.focus(window, cx));
            }
        }
    }

    fn integration_sync_menu_bar(&mut self, cx: &mut Context<Self>) {
        let status = links::menu_bar_status(self.preferences.show_in_menu_bar);
        #[cfg(any(target_os = "macos", target_os = "windows"))]
        {
            let state = &mut self.extensions.integration;
            state.menu_bar_status = match status {
                MenuBarStatus::Shown if state.tray.is_some() => MenuBarStatus::Shown,
                MenuBarStatus::Shown => match build_tray(&self.contracts.desktop_name, cx) {
                    Ok(tray) => {
                        state.tray = Some(tray);
                        MenuBarStatus::Shown
                    }
                    Err(error) => MenuBarStatus::Failed(format!(
                        "The menu bar icon could not be shown: {error:#}"
                    )),
                },
                other => {
                    state.tray = None;
                    other
                }
            };
        }
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            let _ = cx;
            self.extensions.integration.menu_bar_status = status;
        }
        if let Some(detail) = self.extensions.integration.menu_bar_status.detail() {
            eprintln!("{detail}");
        }
    }

    fn integration_sync_shortcut(
        &mut self,
        changed: bool,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let state = &mut self.extensions.integration;
        if let (Some(manager), Some(hotkey)) = (&state.hotkeys, state.quick_ask.take()) {
            if let Err(error) = manager.unregister(hotkey) {
                eprintln!("The previous Quick Ask shortcut could not be released: {error}");
            }
        }
        let default = match DeepLinkContract::load() {
            Ok(contract) => contract.quick_ask_default().to_owned(),
            Err(error) => {
                state.shortcut_status = ShortcutStatus::Unavailable(format!(
                    "The Quick Ask shortcut contract is unavailable: {error:#}"
                ));
                return self.integration_report_shortcut(changed, window, cx);
            }
        };
        state.shortcut_status = match links::quick_ask_shortcut(
            self.preferences.quick_ask_shortcut.as_deref(),
            &default,
        ) {
            QuickAskShortcut::Off => ShortcutStatus::Off,
            QuickAskShortcut::Chord(chord) => match links::parse_accelerator(&chord) {
                Err(error) => ShortcutStatus::Malformed(chord, error),
                Ok(hotkey) => {
                    if state.hotkeys.is_none() {
                        match GlobalHotKeyManager::new() {
                            Ok(manager) => state.hotkeys = Some(manager),
                            Err(error) => {
                                state.shortcut_status = ShortcutStatus::Unavailable(format!(
                                    "Global shortcuts are unavailable on this system: {error}"
                                ));
                                return self.integration_report_shortcut(changed, window, cx);
                            }
                        }
                    }
                    match state
                        .hotkeys
                        .as_ref()
                        .map(|manager| manager.register(hotkey))
                    {
                        Some(Ok(())) => {
                            state.quick_ask = Some(hotkey);
                            ShortcutStatus::Registered(chord)
                        }
                        Some(Err(error)) => {
                            eprintln!("The Quick Ask shortcut {chord} was refused: {error}");
                            ShortcutStatus::Taken(chord)
                        }
                        None => ShortcutStatus::Unavailable(
                            "Global shortcuts are unavailable on this system.".into(),
                        ),
                    }
                }
            },
        };
        self.integration_report_shortcut(changed, window, cx);
    }

    fn integration_report_shortcut(
        &mut self,
        changed: bool,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Some(detail) = self.extensions.integration.shortcut_status.detail() else {
            return;
        };
        eprintln!("Quick Ask shortcut: {detail}");
        if changed {
            let answer = window.prompt(
                PromptLevel::Warning,
                "Shortcut not registered",
                Some(&detail),
                &["OK"],
                cx,
            );
            cx.spawn(async move |_, _| {
                let _ = answer.await;
            })
            .detach();
        }
    }
}

fn integration_hide_window(window: &mut Window, cx: &mut App) {
    if cfg!(target_os = "macos") {
        cx.hide();
    } else {
        window.minimize_window();
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn build_tray(desktop_name: &str, cx: &App) -> Result<tray_icon::TrayIcon> {
    use tray_icon::menu::{Menu, MenuItem, PredefinedMenuItem};

    let image = gpui::Image::from_bytes(gpui::ImageFormat::Png, TRAY_ICON_PNG.to_vec())
        .to_image_data(cx.svg_renderer())?;
    let size = image.size(0);
    let mut pixels = image
        .as_bytes(0)
        .context("The tray icon has no image data")?
        .to_vec();
    for pixel in pixels.as_chunks_mut::<4>().0 {
        pixel.swap(0, 2);
    }
    let width = u32::try_from(size.width.0).context("The tray icon width is invalid")?;
    let height = u32::try_from(size.height.0).context("The tray icon height is invalid")?;
    let icon = tray_icon::Icon::from_rgba(pixels, width, height)?;
    let menu = Menu::new();
    for item in links::tray_menu(desktop_name) {
        match item {
            links::TrayMenuItem::Command(command, label) => {
                menu.append(&MenuItem::with_id(command.id(), label, true, None))?
            }
            links::TrayMenuItem::Separator => menu.append(&PredefinedMenuItem::separator())?,
        }
    }
    Ok(tray_icon::TrayIconBuilder::new()
        .with_icon(icon)
        .with_icon_as_template(cfg!(target_os = "macos"))
        .with_tooltip(desktop_name)
        .with_menu(Box::new(menu))
        .with_menu_on_left_click(cfg!(target_os = "macos"))
        .build()?)
}

fn integration_deliver_event(event: InboxEvent, cx: &mut App) {
    let target = cx.default_global::<Hub>().target.clone();
    let delivered = target.is_some_and(|(view, handle)| {
        let event = event.clone();
        handle
            .update(cx, |_, window, cx| {
                view.update(cx, |view, cx| view.integration_receive(event, window, cx))
            })
            .is_ok_and(|result| result.is_ok())
    });
    if delivered {
        return;
    }
    let hub = cx.default_global::<Hub>();
    hub.target = None;
    if let InboxEvent::OpenUrls(urls) = event {
        let now = Instant::now();
        for url in urls {
            hub.links.push(url, now);
        }
    }
}

pub(super) fn integration_install(cx: &mut App) -> Result<()> {
    let mut inbox =
        links::take_inbox().context("The desktop integration inbox is already in use")?;
    cx.set_global(Hub::default());
    GlobalHotKeyEvent::set_event_handler(Some(|event: GlobalHotKeyEvent| {
        if event.state() == HotKeyState::Pressed {
            links::post(InboxEvent::HotKey(event.id()));
        }
    }));
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        tray_icon::menu::MenuEvent::set_event_handler(Some(|event: tray_icon::menu::MenuEvent| {
            links::post(InboxEvent::TrayMenu(event.id.0));
        }));
        tray_icon::TrayIconEvent::set_event_handler(Some(|event: tray_icon::TrayIconEvent| {
            if cfg!(target_os = "windows")
                && matches!(
                    event,
                    tray_icon::TrayIconEvent::Click {
                        button: tray_icon::MouseButton::Left,
                        button_state: tray_icon::MouseButtonState::Up,
                        ..
                    }
                )
            {
                links::post(InboxEvent::TrayActivated);
            }
        }));
    }
    cx.spawn(async move |cx| {
        while let Some(event) = inbox.recv().await {
            cx.update(|cx| integration_deliver_event(event, cx));
        }
    })
    .detach();
    Ok(())
}
