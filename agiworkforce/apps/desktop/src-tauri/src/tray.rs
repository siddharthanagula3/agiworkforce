use crate::{
    state::{AppState, DockPosition},
    window,
};
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
    let dock_left = MenuItem::with_id(app, "dock_left", "Dock Left", true, None::<&str>)?;
    let dock_right = MenuItem::with_id(app, "dock_right", "Dock Right", true, None::<&str>)?;
    let undock = MenuItem::with_id(app, "undock", "Undock", true, None::<&str>)?;
    let sep3 = PredefinedMenuItem::separator(app)?;
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
            &dock_left,
            &dock_right,
            &undock,
            &sep3,
            &quit,
        ],
    )?;

    let _tray = TrayIconBuilder::new()
        .menu(&menu)
        .on_menu_event(handle_menu_event)
        .on_tray_icon_event(handle_tray_icon_event)
        .build(app)?;

    Ok(())
}

fn handle_menu_event(app: &AppHandle, event: MenuEvent) {
    let id = event.id.0.as_ref();
    if let Err(err) = handle_menu_click(app, id) {
        eprintln!("[tray] menu event error: {err:?}");
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
                        eprintln!("[tray] hide error: {err:?}");
                    }
                }
                Ok(false) => {
                    if let Err(err) = window::show_window(&window) {
                        eprintln!("[tray] show error: {err:?}");
                    }
                }
                Err(err) => {
                    eprintln!("[tray] visibility check error: {err:?}");
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
        "dock_left" => {
            let state = app.state::<AppState>().clone();
            if let Some(window) = app.get_webview_window("main") {
                window::apply_dock(&window, &state, DockPosition::Left)?;
            }
        }
        "dock_right" => {
            let state = app.state::<AppState>().clone();
            if let Some(window) = app.get_webview_window("main") {
                window::apply_dock(&window, &state, DockPosition::Right)?;
            }
        }
        "undock" => {
            let state = app.state::<AppState>().clone();
            if let Some(window) = app.get_webview_window("main") {
                window::undock(&window, &state)?;
            }
        }
        "new_conversation" => {
            if let Some(window) = app.get_webview_window("main") {
                window::show_window(&window)?;
                window.emit("tray://new-conversation", ())?;
            }
        }
        "open_settings" => {
            if let Some(window) = app.get_webview_window("main") {
                window::show_window(&window)?;
                window.emit("tray://open-settings", ())?;
            }
        }
        "quit" => {
            app.exit(0);
        }
        _ => {}
    }
    Ok(())
}
