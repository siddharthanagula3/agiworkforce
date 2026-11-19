use std::time::Duration;

use super::*;
use crate::notifications::{self, KeepAwake, Notice, Platform, Policy, Tracker};

const RECONCILE_INTERVAL: Duration = Duration::from_secs(15);

#[derive(Default)]
pub(super) struct State {
    tracker: Tracker,
    awake: Option<KeepAwake>,
    hold_failed: bool,
    watch: Option<gpui::Task<()>>,
    cloud_watch: Option<gpui::Task<()>>,
    subscriptions: Vec<gpui::Subscription>,
    window_inactive: bool,
    generation: u64,
}

impl Desktop {
    pub(super) fn notifications_hide(&mut self) {}

    pub(super) fn notifications_render(
        &mut self,
        _palette: Palette,
        _window: &mut Window,
        _cx: &mut Context<Self>,
    ) -> Option<gpui::AnyElement> {
        None
    }

    pub(super) fn notifications_nav(
        &self,
        sidebar: gpui::Stateful<gpui::Div>,
        _palette: Palette,
        _cx: &mut Context<Self>,
    ) -> gpui::Stateful<gpui::Div> {
        sidebar
    }

    pub(super) fn notifications_observe(
        &mut self,
        notification: &AppServerNotification,
        cx: &mut Context<Self>,
    ) {
        self.notifications_follow_generation();
        let policy = self.notifications_policy();
        let notice = self.extensions.notifications.tracker.observe(
            notification,
            &self.contracts.desktop_name,
            policy,
        );
        if let Some(notice) = notice {
            self.notifications_deliver(notice);
        }
        self.notifications_sync_hold(cx);
    }

    pub(super) fn notifications_attach(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.extensions.notifications.window_inactive = !window.is_window_active();
        let activation = cx.observe_window_activation(window, |view, window, _| {
            view.extensions.notifications.window_inactive = !window.is_window_active();
        });
        let release = cx.on_release(|view, _| view.notifications_release());
        let quit = cx.on_app_quit(|view, _| {
            view.notifications_release();
            std::future::ready(())
        });
        self.extensions
            .notifications
            .subscriptions
            .extend([activation, release, quit]);
        let interval = Duration::from_millis(self.settings.cloud_poll_interval_ms);
        self.extensions.notifications.cloud_watch = Some(cx.spawn(async move |view, cx| loop {
            cx.background_executor().timer(interval).await;
            if view
                .update(cx, |view, _| view.notifications_sample_cloud())
                .is_err()
            {
                return;
            }
        }));
    }

    fn notifications_sample_cloud(&mut self) {
        let policy = self.notifications_policy();
        let observed = self
            .cloud
            .turn
            .as_ref()
            .map(|turn| (turn.request_id.clone(), turn.state));
        let tracker = &mut self.extensions.notifications.tracker;
        let notice = match observed {
            Some((request_id, state)) => {
                tracker.observe_cloud(&request_id, state, &self.contracts.desktop_name, policy)
            }
            None => {
                tracker.forget_cloud();
                None
            }
        };
        if let Some(notice) = notice {
            self.notifications_deliver(notice);
        }
    }

    pub(super) fn notifications_preferences_changed(
        &mut self,
        previous: &crate::preferences::Preferences,
        _window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if previous.keep_awake_while_working != self.preferences.keep_awake_while_working {
            self.notifications_sync_hold(cx);
        }
    }

    fn notifications_policy(&self) -> Policy {
        Policy::new(
            &self.preferences,
            !self.extensions.notifications.window_inactive,
        )
    }

    fn notifications_follow_generation(&mut self) {
        let state = &mut self.extensions.notifications;
        if state.generation != self.generation {
            state.generation = self.generation;
            state.tracker.reset_local();
        }
    }

    fn notifications_deliver(&self, notice: Notice) {
        let product = self.contracts.desktop_name.clone();
        drop(self.executor.spawn_blocking(move || {
            if let Err(error) = notifications::deliver(&product, &notice) {
                eprintln!("Desktop notification could not be shown: {error}");
            }
        }));
    }

    fn notifications_release(&mut self) {
        let state = &mut self.extensions.notifications;
        state.watch = None;
        state.cloud_watch = None;
        state.awake = None;
    }

    fn notifications_sync_hold(&mut self, cx: &mut Context<Self>) {
        let wanted = self.preferences.keep_awake_while_working
            && self.extensions.notifications.tracker.working();
        let state = &mut self.extensions.notifications;
        if !wanted {
            state.hold_failed = false;
            if state.awake.is_some() {
                state.watch = None;
                state.awake = None;
            }
            return;
        }
        if state.awake.is_some() || state.hold_failed {
            return;
        }
        let Some(plan) = notifications::hold_plan(
            Platform::current(),
            std::process::id(),
            &self.contracts.desktop_name,
        ) else {
            state.hold_failed = true;
            return;
        };
        match KeepAwake::start(&plan) {
            Ok(guard) => {
                state.awake = Some(guard);
                state.watch = Some(Self::notifications_watch(cx));
            }
            Err(error) => {
                state.hold_failed = true;
                eprintln!(
                    "Keeping the computer awake failed: {}: {error}",
                    plan.program
                );
            }
        }
    }

    fn notifications_watch(cx: &mut Context<Self>) -> gpui::Task<()> {
        cx.spawn(async move |view, cx| loop {
            cx.background_executor().timer(RECONCILE_INTERVAL).await;
            if view.update(cx, Self::notifications_reconcile).is_err() {
                return;
            }
        })
    }

    fn notifications_reconcile(&mut self, cx: &mut Context<Self>) {
        self.notifications_follow_generation();
        let connected = self
            .connection_client
            .as_ref()
            .is_some_and(BackgroundDeveloperSessionClient::is_connected);
        let state = &mut self.extensions.notifications;
        if !connected {
            state.tracker.reset_local();
        }
        if let Some(awake) = state.awake.as_mut() {
            if !awake.alive() {
                state.awake = None;
                state.watch = None;
                state.hold_failed = true;
                eprintln!(
                    "The keep-awake helper stopped; the computer may sleep during this work."
                );
                return;
            }
        }
        self.notifications_sync_hold(cx);
    }
}

pub(super) fn notifications_install(_cx: &mut App) -> Result<()> {
    Ok(())
}
