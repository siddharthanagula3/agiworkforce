use super::*;

#[derive(Default)]
pub(super) struct Extensions {
    pub(super) settings: ext_settings::State,
    pub(super) notifications: ext_notifications::State,
    pub(super) integration: ext_integration::State,
    pub(super) capture: ext_capture::State,
    pub(super) updates: ext_updates::State,
}

#[derive(Clone, Debug)]
pub(super) enum ExtensionAction {
    Settings(ext_settings::Action),
    Integration(ext_integration::Action),
    Capture(ext_capture::Action),
    Updates(ext_updates::Action),
}

pub(super) fn install_extensions(cx: &mut App) {
    for (name, result) in [
        ("settings", ext_settings::settings_install(cx)),
        (
            "notifications",
            ext_notifications::notifications_install(cx),
        ),
        ("integration", ext_integration::integration_install(cx)),
        ("capture", ext_capture::capture_install(cx)),
        ("updates", ext_updates::updates_install(cx)),
    ] {
        if let Err(error) = result {
            eprintln!("Desktop {name} integration is unavailable: {error:#}");
        }
    }
}

impl Desktop {
    pub(super) fn dispatch_extension(
        &mut self,
        action: ExtensionAction,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.hide_extensions();
        match action {
            ExtensionAction::Settings(action) => self.settings_dispatch(action, window, cx),
            ExtensionAction::Integration(action) => self.integration_dispatch(action, window, cx),
            ExtensionAction::Capture(action) => self.capture_dispatch(action, window, cx),
            ExtensionAction::Updates(action) => self.updates_dispatch(action, window, cx),
        }
        cx.notify();
    }

    pub(super) fn hide_extensions(&mut self) {
        self.settings_hide();
        self.notifications_hide();
        self.integration_hide();
        self.capture_hide();
        self.updates_hide();
    }

    pub(super) fn render_extension(
        &mut self,
        palette: Palette,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Option<gpui::AnyElement> {
        if let Some(panel) = self.settings_render(palette, window, cx) {
            return Some(panel);
        }
        if let Some(panel) = self.notifications_render(palette, window, cx) {
            return Some(panel);
        }
        if let Some(panel) = self.integration_render(palette, window, cx) {
            return Some(panel);
        }
        if let Some(panel) = self.capture_render(palette, window, cx) {
            return Some(panel);
        }
        self.updates_render(palette, window, cx)
    }

    pub(super) fn extension_nav(
        &self,
        sidebar: gpui::Stateful<gpui::Div>,
        palette: Palette,
        cx: &mut Context<Self>,
    ) -> gpui::Stateful<gpui::Div> {
        let sidebar = self.settings_nav(sidebar, palette, cx);
        let sidebar = self.notifications_nav(sidebar, palette, cx);
        let sidebar = self.integration_nav(sidebar, palette, cx);
        let sidebar = self.capture_nav(sidebar, palette, cx);
        self.updates_nav(sidebar, palette, cx)
    }

    pub(super) fn observe_extensions(
        &mut self,
        notification: &AppServerNotification,
        cx: &mut Context<Self>,
    ) {
        self.settings_observe(notification, cx);
        self.notifications_observe(notification, cx);
        self.integration_observe(notification, cx);
        self.capture_observe(notification, cx);
        self.updates_observe(notification, cx);
    }

    pub(super) fn attach_extensions(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.settings_attach(window, cx);
        self.notifications_attach(window, cx);
        self.integration_attach(window, cx);
        self.capture_attach(window, cx);
        self.updates_attach(window, cx);
    }

    pub(super) fn preferences_changed(
        &mut self,
        previous: &crate::preferences::Preferences,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.settings_preferences_changed(previous, window, cx);
        self.notifications_preferences_changed(previous, window, cx);
        self.integration_preferences_changed(previous, window, cx);
        self.capture_preferences_changed(previous, window, cx);
        self.updates_preferences_changed(previous, window, cx);
        cx.notify();
    }
}
