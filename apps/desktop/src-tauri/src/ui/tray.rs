use crate::{data::state::AppState, ui::window};
use anyhow::Result;
use tauri::{
    menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Emitter, Manager,
};

pub fn build_system_tray(app: &mut App) -> Result<()> {
    let show = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", "Hide", true, None::<&str>)?;
    let new_conversation = MenuItem::with_id(
        app,
        "new_conversation",
        "New Conversation",
        true,
        None::<&str>,
    )?;
    let open_settings = MenuItem::with_id(app, "open_settings", "Settings", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let pin = MenuItem::with_id(app, "toggle_pin", "Pin/Unpin", true, None::<&str>)?;
    let always_on_top = MenuItem::with_id(
        app,
        "toggle_aot",
        "Toggle Always On Top",
        true,
        None::<&str>,
    )?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &show,
            &hide,
            &new_conversation,
            &open_settings,
            &sep1,
            &pin,
            &always_on_top,
            &sep2,
            &quit,
        ],
    )?;

    // Windows Credential Manager tooltip limit is 128 characters.
    // We keep the tooltip short and enforce the cap defensively.
    let raw_tooltip = "AGI Workforce — AI Desktop Platform";
    let tooltip = &raw_tooltip[..128.min(raw_tooltip.len())];

    let mut tray_builder = TrayIconBuilder::new()
        .menu(&menu)
        .tooltip(tooltip)
        .on_menu_event(handle_menu_event)
        .on_tray_icon_event(handle_tray_icon_event);

    // On Windows, use the default window icon for the system tray.
    #[cfg(windows)]
    if let Some(icon) = app.default_window_icon().cloned() {
        tray_builder = tray_builder.icon(icon);
    }

    let _tray = tray_builder.build(app)?;

    Ok(())
}

fn handle_menu_event(app: &AppHandle, event: MenuEvent) {
    let id = event.id.0.as_ref();
    if let Err(err) = handle_menu_click(app, id) {
        tracing::error!("[tray] menu event error: {err:?}");
    }
}

fn handle_tray_icon_event(tray: &tauri::tray::TrayIcon, event: TrayIconEvent) {
    if let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        ..
    } = event
    {
        let app = tray.app_handle();
        if let Some(window) = app.get_webview_window("main") {
            match window.is_visible() {
                Ok(true) => {
                    if let Err(err) = window::hide_window(&window) {
                        tracing::error!("[tray] hide error: {err:?}");
                    }
                }
                Ok(false) => {
                    if let Err(err) = window::show_window(&window) {
                        tracing::error!("[tray] show error: {err:?}");
                    }
                }
                Err(err) => {
                    tracing::error!("[tray] visibility check error: {err:?}");
                }
            }
        }
    }
}

fn handle_menu_click(app: &AppHandle, id: &str) -> Result<()> {
    match id {
        "show" => {
            if let Some(window) = app.get_webview_window("main") {
                window::show_window(&window)?;
            }
        }
        "hide" => {
            if let Some(window) = app.get_webview_window("main") {
                window::hide_window(&window)?;
            }
        }
        "toggle_pin" => {
            let state = app.state::<AppState>().clone();
            if let Some(window) = app.get_webview_window("main") {
                let current = state.with_state(|s| s.pinned);
                window::set_pinned(&window, &state, !current)?;
            }
        }
        "toggle_aot" => {
            let state = app.state::<AppState>().clone();
            if let Some(window) = app.get_webview_window("main") {
                let current = state.with_state(|s| s.always_on_top);
                window::set_always_on_top(&window, &state, !current)?;
            }
        }
        "new_conversation" => {
            if let Some(window) = app.get_webview_window("main") {
                window::show_window(&window)?;
                window.emit("tray:new_conversation", ())?;
            }
        }
        "open_settings" => {
            if let Some(window) = app.get_webview_window("main") {
                window::show_window(&window)?;
                window.emit("tray:open_settings", ())?;
            }
        }
        "quit" => {
            app.exit(0);
        }
        _ => {}
    }
    Ok(())
}
