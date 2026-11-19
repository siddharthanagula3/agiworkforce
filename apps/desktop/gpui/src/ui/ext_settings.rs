use super::*;
use crate::preferences::{normalize_accelerator, Appearance, Preferences};
use anyhow::anyhow;
use gpui_component::{switch::Switch, Disableable as _};

type LoginDone = Box<dyn FnOnce(&mut Desktop, Result<()>, &mut Window, &mut Context<Desktop>)>;

#[derive(Default)]
pub(super) struct State {
    visible: bool,
    error: Option<String>,
    shortcut_error: Option<String>,
    shortcut: Option<gpui::Entity<InputState>>,
    login: Option<uuid::Uuid>,
}

#[derive(Clone, Debug)]
pub(super) enum Action {
    Open,
    Close,
    Appearance(Appearance),
    NotifyWhenWorkFinishes(bool),
    NotifyWhenApprovalNeeded(bool),
    KeepAwakeWhileWorking(bool),
    LaunchAtLogin(bool),
    ShowInMenuBar(bool),
    CheckForUpdates(bool),
    SaveShortcut,
    TurnOffShortcut,
    DefaultShortcut,
}

#[derive(Clone, Copy)]
enum ShortcutChoice {
    Typed,
    Off,
    Default,
}

fn settings_action(action: Action) -> UiAction {
    UiAction::Extension(extensions::ExtensionAction::Settings(action))
}

fn login_item(name: &str, enabled: bool) -> Result<()> {
    let executable = std::env::current_exe().context("The app location is unknown")?;
    let target = executable
        .ancestors()
        .find(|path| path.extension().is_some_and(|extension| extension == "app"))
        .unwrap_or(&executable);
    let launch = auto_launch::AutoLaunchBuilder::new()
        .set_app_name(name)
        .set_app_path(
            target
                .to_str()
                .ok_or_else(|| anyhow!("The app location is not valid text"))?,
        )
        .set_windows_enable_mode(auto_launch::WindowsEnableMode::CurrentUser)
        .build()
        .context("Login items are unavailable on this computer")?;
    let current = launch
        .is_enabled()
        .context("The current login item could not be read")?;
    if current == enabled {
        return Ok(());
    }
    if enabled {
        launch.enable().context("The login item could not be added")
    } else {
        launch
            .disable()
            .context("The login item could not be removed")
    }
}

fn switch_state(enabled: bool) -> &'static str {
    if enabled {
        "on"
    } else {
        "off"
    }
}

impl Desktop {
    pub(super) fn settings_dispatch(
        &mut self,
        action: Action,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.extensions.settings.visible = true;
        self.focus.focus(window, cx);
        match action {
            Action::Open => {}
            Action::Close => self.extensions.settings.visible = false,
            Action::Appearance(appearance) => {
                self.settings_update(
                    |preferences| preferences.appearance = appearance,
                    window,
                    cx,
                );
            }
            Action::NotifyWhenWorkFinishes(value) => {
                self.settings_update(
                    |preferences| preferences.notify_when_work_finishes = value,
                    window,
                    cx,
                );
            }
            Action::NotifyWhenApprovalNeeded(value) => {
                self.settings_update(
                    |preferences| preferences.notify_when_approval_needed = value,
                    window,
                    cx,
                );
            }
            Action::KeepAwakeWhileWorking(value) => {
                self.settings_update(
                    |preferences| preferences.keep_awake_while_working = value,
                    window,
                    cx,
                );
            }
            Action::ShowInMenuBar(value) => {
                self.settings_update(
                    |preferences| preferences.show_in_menu_bar = value,
                    window,
                    cx,
                );
            }
            Action::CheckForUpdates(value) => {
                self.settings_update(
                    |preferences| preferences.check_for_updates = value,
                    window,
                    cx,
                );
            }
            Action::LaunchAtLogin(enabled) => self.settings_set_login(enabled, window, cx),
            Action::SaveShortcut => self.settings_save_shortcut(ShortcutChoice::Typed, window, cx),
            Action::TurnOffShortcut => self.settings_save_shortcut(ShortcutChoice::Off, window, cx),
            Action::DefaultShortcut => {
                self.settings_save_shortcut(ShortcutChoice::Default, window, cx)
            }
        }
    }

    pub(super) fn settings_hide(&mut self) {
        self.extensions.settings.visible = false;
    }

    fn settings_update(
        &mut self,
        change: impl FnOnce(&mut Preferences),
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> bool {
        let previous = self.preferences.clone();
        let mut next = previous.clone();
        change(&mut next);
        if next == previous {
            return true;
        }
        if let Err(error) = next.save() {
            self.extensions.settings.error =
                Some(format!("The setting was not changed. {error:#}"));
            cx.notify();
            return false;
        }
        self.extensions.settings.error = None;
        self.preferences = next;
        self.preferences_changed(&previous, window, cx);
        true
    }

    fn settings_login_task(
        &mut self,
        enabled: bool,
        done: LoginDone,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let id = uuid::Uuid::new_v4();
        self.extensions.settings.login = Some(id);
        let name = self.contracts.desktop_name.clone();
        let task = self
            .executor
            .spawn_blocking(move || login_item(&name, enabled));
        cx.spawn_in(window, async move |view, cx| {
            let result = match task.await {
                Ok(result) => result,
                Err(error) => Err(anyhow!("Changing the login item stopped: {error}")),
            };
            let _ = view.update_in(cx, |view, window, cx| {
                if view.extensions.settings.login != Some(id) {
                    return;
                }
                view.extensions.settings.login = None;
                done(view, result, window, cx);
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    fn settings_set_login(&mut self, enabled: bool, window: &mut Window, cx: &mut Context<Self>) {
        if self.extensions.settings.login.is_some() {
            return;
        }
        self.extensions.settings.error = None;
        self.settings_login_task(
            enabled,
            Box::new(move |view, result, window, cx| {
                if let Err(error) = result {
                    view.extensions.settings.error = Some(format!(
                        "Open at login stays {}. {error:#}",
                        switch_state(!enabled)
                    ));
                    return;
                }
                if view.settings_update(|preferences| preferences.launch_at_login = enabled, window, cx) {
                    return;
                }
                let saved = view.extensions.settings.error.clone().unwrap_or_default();
                view.settings_login_task(
                    !enabled,
                    Box::new(move |view, result, _, _| {
                        view.extensions.settings.error = Some(match result {
                            Ok(()) => format!("{saved} Open at login stays {}.", switch_state(!enabled)),
                            Err(error) => format!(
                                "{saved} Open at login is {} on this computer but off in these preferences. {error:#}",
                                switch_state(enabled)
                            ),
                        });
                    }),
                    window,
                    cx,
                );
            }),
            window,
            cx,
        );
    }

    fn settings_save_shortcut(
        &mut self,
        choice: ShortcutChoice,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Some(input) = self.extensions.settings.shortcut.clone() else {
            return;
        };
        let shortcut = match choice {
            ShortcutChoice::Off => Some(String::new()),
            ShortcutChoice::Default => None,
            ShortcutChoice::Typed => match normalize_accelerator(&input.read(cx).value()) {
                Ok(Some(shortcut)) => Some(shortcut),
                Ok(None) => Some(String::new()),
                Err(error) => {
                    self.extensions.settings.shortcut_error = Some(format!("{error:#}"));
                    return;
                }
            },
        };
        self.extensions.settings.shortcut_error = None;
        let saved = self.settings_update(
            |preferences| preferences.quick_ask_shortcut = shortcut.clone(),
            window,
            cx,
        );
        if saved {
            input.update(cx, |input, cx| {
                input.set_value(shortcut.unwrap_or_default(), window, cx)
            });
        }
    }

    fn settings_choice(
        &self,
        id: &'static str,
        label: &'static str,
        action: Action,
        selected: bool,
        palette: Palette,
        cx: &mut Context<Self>,
    ) -> gpui::Stateful<gpui::Div> {
        let accessible: SharedString = if selected {
            format!("{label}, selected").into()
        } else {
            label.into()
        };
        self.compact_button(id, label, settings_action(action), palette, cx)
            .aria_label(accessible)
            .when(selected, |button| button.bg(rgb(palette.hover)))
    }

    fn settings_switch(
        &self,
        id: &'static str,
        label: &'static str,
        checked: bool,
        disabled: bool,
        action: fn(bool) -> Action,
        cx: &mut Context<Self>,
    ) -> Switch {
        Switch::new(id)
            .checked(checked)
            .label(label)
            .accessibility_label(label)
            .disabled(disabled)
            .on_change(cx.listener(move |view, value: &bool, window, cx| {
                view.dispatch(settings_action(action(*value)), window, cx)
            }))
    }

    pub(super) fn settings_render(
        &mut self,
        palette: Palette,
        _window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Option<gpui::AnyElement> {
        if !self.extensions.settings.visible {
            return None;
        }
        let preferences = self.preferences.clone();
        let login_pending = self.extensions.settings.login.is_some();
        let mut panel = div()
            .w_full()
            .min_w_0()
            .max_w(px(self.contracts.frame.content_width))
            .flex()
            .flex_col()
            .gap_3()
            .child(gpui::text!("Settings"))
            .child(self.compact_button(
                "close-settings",
                "Back to conversation",
                settings_action(Action::Close),
                palette,
                cx,
            ));
        if let Some(error) = &self.extensions.settings.error {
            panel = panel.child(gpui::text!(error.clone()));
        }
        let appearance = div()
            .flex()
            .flex_col()
            .gap_1()
            .child(gpui::text!("Appearance"))
            .child(
                div()
                    .flex()
                    .gap_1()
                    .child(self.settings_choice(
                        "appearance-system",
                        "System",
                        Action::Appearance(Appearance::System),
                        preferences.appearance == Appearance::System,
                        palette,
                        cx,
                    ))
                    .child(self.settings_choice(
                        "appearance-light",
                        "Light",
                        Action::Appearance(Appearance::Light),
                        preferences.appearance == Appearance::Light,
                        palette,
                        cx,
                    ))
                    .child(self.settings_choice(
                        "appearance-dark",
                        "Dark",
                        Action::Appearance(Appearance::Dark),
                        preferences.appearance == Appearance::Dark,
                        palette,
                        cx,
                    )),
            );
        let behavior = div()
            .flex()
            .flex_col()
            .gap_2()
            .child(gpui::text!("Notifications and background work"))
            .child(self.settings_switch(
                "setting-notify-finished",
                "Notify me when work finishes",
                preferences.notify_when_work_finishes,
                false,
                Action::NotifyWhenWorkFinishes,
                cx,
            ))
            .child(self.settings_switch(
                "setting-notify-approval",
                "Notify me when approval is needed",
                preferences.notify_when_approval_needed,
                false,
                Action::NotifyWhenApprovalNeeded,
                cx,
            ))
            .child(self.settings_switch(
                "setting-keep-awake",
                "Keep this computer awake while work runs",
                preferences.keep_awake_while_working,
                false,
                Action::KeepAwakeWhileWorking,
                cx,
            ));
        let startup = div()
            .flex()
            .flex_col()
            .gap_2()
            .child(gpui::text!("Startup and updates"))
            .child(self.settings_switch(
                "setting-launch-at-login",
                "Open at login",
                preferences.launch_at_login,
                login_pending,
                Action::LaunchAtLogin,
                cx,
            ))
            .child(self.settings_switch(
                "setting-menu-bar",
                "Show in menu bar",
                preferences.show_in_menu_bar,
                false,
                Action::ShowInMenuBar,
                cx,
            ))
            .child(self.settings_switch(
                "setting-check-updates",
                "Check for updates automatically",
                preferences.check_for_updates,
                false,
                Action::CheckForUpdates,
                cx,
            ));
        panel = panel.child(appearance).child(behavior).child(startup);
        if let Some(input) = &self.extensions.settings.shortcut {
            let mut shortcut = div()
                .flex()
                .flex_col()
                .gap_1()
                .child(gpui::text!("Quick-ask shortcut"))
                .child(gpui::text!(
                    match preferences.quick_ask_shortcut.as_deref() {
                        Some("") => "The quick-ask shortcut is off".to_string(),
                        Some(shortcut) => format!("Current shortcut: {shortcut}"),
                        None => "Using the default shortcut".to_string(),
                    }
                ))
                .child(Input::new(input).aria_label("Quick-ask shortcut"));
            if let Some(error) = &self.extensions.settings.shortcut_error {
                shortcut = shortcut.child(gpui::text!(error.clone()));
            } else if let Some(detail) = self.extensions.integration.shortcut_status.detail() {
                shortcut = shortcut.child(gpui::text!(detail));
            }
            panel = panel.child(
                shortcut.child(
                    div()
                        .flex()
                        .gap_1()
                        .child(self.compact_button(
                            "save-quick-ask-shortcut",
                            "Save shortcut",
                            settings_action(Action::SaveShortcut),
                            palette,
                            cx,
                        ))
                        .child(self.compact_button(
                            "turn-off-quick-ask-shortcut",
                            "Turn off shortcut",
                            settings_action(Action::TurnOffShortcut),
                            palette,
                            cx,
                        ))
                        .child(self.compact_button(
                            "default-quick-ask-shortcut",
                            "Use default shortcut",
                            settings_action(Action::DefaultShortcut),
                            palette,
                            cx,
                        )),
                ),
            );
        }
        Some(panel.into_any_element())
    }

    pub(super) fn settings_nav(
        &self,
        sidebar: gpui::Stateful<gpui::Div>,
        palette: Palette,
        cx: &mut Context<Self>,
    ) -> gpui::Stateful<gpui::Div> {
        let selected = self.extensions.settings.visible;
        let label = if self.extensions.settings.error.is_some() {
            "Settings · needs attention"
        } else {
            "Settings"
        };
        let accessible: SharedString = if selected {
            format!("{label}, current").into()
        } else {
            label.into()
        };
        sidebar.child(
            self.compact_button(
                "settings",
                label,
                settings_action(Action::Open),
                palette,
                cx,
            )
            .w_full()
            .min_w_0()
            .truncate()
            .aria_label(accessible)
            .when(selected, |row| row.bg(rgb(palette.hover))),
        )
    }

    pub(super) fn settings_observe(
        &mut self,
        _notification: &AppServerNotification,
        _cx: &mut Context<Self>,
    ) {
    }

    pub(super) fn settings_attach(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        match Preferences::load() {
            Ok(preferences) => self.preferences = preferences,
            Err(error) => self.extensions.settings.error = Some(format!("{error:#}")),
        }
        let initial = self
            .preferences
            .quick_ask_shortcut
            .clone()
            .unwrap_or_default();
        let input = cx.new(|cx| {
            InputState::new(window, cx)
                .placeholder("For example cmd+shift+space")
                .default_value(initial)
        });
        cx.subscribe_in(
            &input,
            window,
            |view: &mut Desktop, _, event: &InputEvent, window, cx| {
                if matches!(event, InputEvent::PressEnter { .. }) {
                    view.settings_save_shortcut(ShortcutChoice::Typed, window, cx);
                }
                cx.notify();
            },
        )
        .detach();
        self.extensions.settings.shortcut = Some(input);
        if self.preferences.launch_at_login {
            self.settings_login_task(
                true,
                Box::new(|view, result, _, _| {
                    if let Err(error) = result {
                        view.extensions.settings.error =
                            Some(format!("Open at login could not be applied. {error:#}"));
                    }
                }),
                window,
                cx,
            );
        }
        cx.notify();
    }

    pub(super) fn settings_preferences_changed(
        &mut self,
        _previous: &crate::preferences::Preferences,
        _window: &mut Window,
        _cx: &mut Context<Self>,
    ) {
    }
}

pub(super) fn settings_install(_cx: &mut App) -> Result<()> {
    Ok(())
}
