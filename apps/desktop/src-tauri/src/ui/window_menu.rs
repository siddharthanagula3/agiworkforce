use anyhow::Result;
use tauri::{
    menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu},
    App, AppHandle, Emitter, Manager,
};

pub fn build_window_menu(app: &mut App) -> Result<()> {
    // File menu
    let new_conversation = MenuItem::with_id(
        app,
        "menu_new_conversation",
        "New Conversation",
        true,
        Some("CmdOrCtrl+N"),
    )?;
    let sep_file = PredefinedMenuItem::separator(app)?;
    let close = PredefinedMenuItem::close_window(app, Some("Close Window"))?;
    let file_menu =
        Submenu::with_items(app, "File", true, &[&new_conversation, &sep_file, &close])?;

    // Edit menu
    let find = MenuItem::with_id(app, "menu_find", "Find", true, Some("CmdOrCtrl+F"))?;
    let sep_edit_std = PredefinedMenuItem::separator(app)?;
    let undo = PredefinedMenuItem::undo(app, None)?;
    let redo = PredefinedMenuItem::redo(app, None)?;
    let sep_edit_clip = PredefinedMenuItem::separator(app)?;
    let cut = PredefinedMenuItem::cut(app, None)?;
    let copy = PredefinedMenuItem::copy(app, None)?;
    let paste = PredefinedMenuItem::paste(app, None)?;
    let select_all = PredefinedMenuItem::select_all(app, None)?;
    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &undo,
            &redo,
            &sep_edit_clip,
            &cut,
            &copy,
            &paste,
            &select_all,
            &sep_edit_std,
            &find,
        ],
    )?;

    // View menu
    let reload = MenuItem::with_id(app, "menu_reload", "Reload", true, Some("CmdOrCtrl+R"))?;
    let zoom_in = MenuItem::with_id(app, "menu_zoom_in", "Zoom In", true, Some("CmdOrCtrl+Plus"))?;
    let zoom_out = MenuItem::with_id(
        app,
        "menu_zoom_out",
        "Zoom Out",
        true,
        Some("CmdOrCtrl+Minus"),
    )?;
    let actual_size = MenuItem::with_id(
        app,
        "menu_actual_size",
        "Actual Size",
        true,
        Some("CmdOrCtrl+0"),
    )?;
    let sep_view = PredefinedMenuItem::separator(app)?;
    let fullscreen = PredefinedMenuItem::fullscreen(app, None)?;
    let view_menu = Submenu::with_items(
        app,
        "View",
        true,
        &[
            &reload,
            &sep_view,
            &zoom_in,
            &zoom_out,
            &actual_size,
            &fullscreen,
        ],
    )?;

    // Help menu
    let agi_help = MenuItem::with_id(app, "menu_help", "AGI Help", true, None::<&str>)?;
    let troubleshoot = MenuItem::with_id(
        app,
        "menu_troubleshoot",
        "Troubleshooting",
        true,
        None::<&str>,
    )?;
    let get_support = MenuItem::with_id(app, "menu_support", "Get Support", true, None::<&str>)?;
    let sep_help_update = PredefinedMenuItem::separator(app)?;
    let restart_to_update = MenuItem::with_id(
        app,
        "menu_restart_to_update",
        "Check for Updates\u{2026}",
        true,
        None::<&str>,
    )?;
    let help_menu = Submenu::with_items(
        app,
        "Help",
        true,
        &[
            &agi_help,
            &troubleshoot,
            &get_support,
            &sep_help_update,
            &restart_to_update,
        ],
    )?;

    // App menu (macOS "AGI Workforce" menu)
    let settings = MenuItem::with_id(
        app,
        "menu_settings",
        "Settings\u{2026}",
        true,
        Some("CmdOrCtrl+,"),
    )?;
    let sep_app = PredefinedMenuItem::separator(app)?;
    let hide = PredefinedMenuItem::hide(app, None)?;
    let hide_others = PredefinedMenuItem::hide_others(app, None)?;
    let show_all = PredefinedMenuItem::show_all(app, None)?;
    let sep_app2 = PredefinedMenuItem::separator(app)?;
    let quit = PredefinedMenuItem::quit(app, None)?;
    let app_menu = Submenu::with_items(
        app,
        "AGI Workforce",
        true,
        &[
            &settings,
            &sep_app,
            &hide,
            &hide_others,
            &show_all,
            &sep_app2,
            &quit,
        ],
    )?;

    let menu = Menu::with_items(
        app,
        &[&app_menu, &file_menu, &edit_menu, &view_menu, &help_menu],
    )?;

    app.set_menu(menu)?;
    app.on_menu_event(handle_window_menu_event);

    Ok(())
}

fn handle_window_menu_event(app: &AppHandle, event: MenuEvent) {
    let id = event.id.0.as_ref();
    match id {
        "menu_new_conversation" => {
            let _ = app.emit("shortcut_action", "new_composer");
        }
        "menu_find" => {
            let _ = app.emit("menu_action", "find");
        }
        "menu_reload" => {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.eval("window.location.reload()");
            }
        }
        "menu_zoom_in" => {
            let _ = app.emit("menu_action", "zoom_in");
        }
        "menu_zoom_out" => {
            let _ = app.emit("menu_action", "zoom_out");
        }
        "menu_actual_size" => {
            let _ = app.emit("menu_action", "actual_size");
        }
        "menu_settings" => {
            let _ = app.emit("menu_action", "open_settings");
        }
        "menu_help" | "menu_troubleshoot" | "menu_support" => {
            let _ = app.emit("menu_action", id);
        }
        "menu_restart_to_update" => {
            let _ = app.emit("menu_action", "restart_to_update");
        }
        _ => {}
    }
}
