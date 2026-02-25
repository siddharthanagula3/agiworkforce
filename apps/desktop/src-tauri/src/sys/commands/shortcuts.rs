use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut as GlobalShortcut, ShortcutState};
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Shortcut {
    pub id: String,
    pub key: String,
    pub description: String,
    pub action: String,
    pub enabled: bool,
    #[serde(default)]
    pub is_global: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShortcutConfig {
    pub shortcuts: Vec<Shortcut>,
}

pub struct ShortcutsState {
    pub shortcuts: Arc<Mutex<HashMap<String, Shortcut>>>,
    pub registered_keys: Arc<Mutex<Vec<String>>>,
}

impl ShortcutsState {
    pub fn new() -> Self {
        Self {
            shortcuts: Arc::new(Mutex::new(HashMap::new())),
            registered_keys: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn with_defaults() -> Self {
        let mut shortcuts = HashMap::new();

        let defaults = vec![
            // Quick summon - like ChatGPT's Option+Space
            Shortcut {
                id: "quick_summon".to_string(),
                key: "Alt+Space".to_string(),
                description: "Quick summon AGI Workforce from anywhere".to_string(),
                action: "quick_summon".to_string(),
                enabled: true,
                is_global: true,
            },
            Shortcut {
                id: "open_chat".to_string(),
                key: "CommandOrControl+K".to_string(),
                description: "Open chat interface".to_string(),
                action: "open_chat".to_string(),
                enabled: true,
                is_global: false,
            },
            Shortcut {
                id: "toggle_window".to_string(),
                key: "CommandOrControl+Shift+Space".to_string(),
                description: "Quick Query — ask anything from any app".to_string(),
                action: "quick_query".to_string(),
                enabled: true,
                is_global: true,
            },
            Shortcut {
                id: "new_composer".to_string(),
                key: "CommandOrControl+Shift+N".to_string(),
                description: "New composer session".to_string(),
                action: "new_composer".to_string(),
                enabled: true,
                is_global: false,
            },
            Shortcut {
                id: "voice_input".to_string(),
                key: "CommandOrControl+Shift+V".to_string(),
                description: "Start voice input".to_string(),
                action: "voice_input".to_string(),
                enabled: true,
                is_global: false,
            },
            Shortcut {
                id: "quick_capture".to_string(),
                key: "CommandOrControl+Shift+S".to_string(),
                description: "Quick screen capture".to_string(),
                action: "quick_capture".to_string(),
                enabled: true,
                is_global: true,
            },
            // Floating window mode - like ChatGPT companion
            Shortcut {
                id: "floating_window".to_string(),
                key: "CommandOrControl+Shift+F".to_string(),
                description: "Toggle floating window mode".to_string(),
                action: "floating_window".to_string(),
                enabled: true,
                is_global: true,
            },
        ];

        for shortcut in defaults {
            shortcuts.insert(shortcut.id.clone(), shortcut);
        }

        Self {
            shortcuts: Arc::new(Mutex::new(shortcuts)),
            registered_keys: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

impl Default for ShortcutsState {
    fn default() -> Self {
        Self::with_defaults()
    }
}

/// Register a global shortcut with the system
fn register_global_shortcut(app: &AppHandle, key: &str, action: String) -> Result<(), String> {
    let shortcut: GlobalShortcut = key
        .parse()
        .map_err(|e| format!("Failed to parse shortcut '{}': {:?}", key, e))?;

    let app_clone = app.clone();
    let action_clone = action.clone();

    app.global_shortcut()
        .on_shortcut(shortcut, move |_app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                tracing::info!("Global shortcut triggered: {}", action_clone);
                if let Err(e) = _app.emit("shortcut_action", &action_clone) {
                    tracing::error!("Failed to emit shortcut action: {}", e);
                }

                // Handle specific actions
                match action_clone.as_str() {
                    "quick_summon" | "toggle_window" => {
                        if let Some(window) = _app.get_webview_window("main") {
                            match window.is_visible() {
                                Ok(true) => {
                                    let _ = window.hide();
                                }
                                Ok(false) => {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                                Err(e) => {
                                    tracing::error!("Failed to check window visibility: {}", e);
                                }
                            }
                        }
                    }
                    "quick_query" => {
                        // Always show and focus the main window, then emit
                        // `global-hotkey-triggered` so the frontend opens the
                        // Quick Query overlay on top of it.
                        if let Some(window) = _app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                        if let Err(e) = _app.emit("global-hotkey-triggered", "quick_query") {
                            tracing::error!("Failed to emit global-hotkey-triggered: {}", e);
                        }
                    }
                    "floating_window" => {
                        if let Err(e) = _app.emit("shortcut_action", "floating_window") {
                            tracing::error!("Failed to emit floating_window action: {}", e);
                        }
                    }
                    _ => {}
                }
            }
        })
        .map_err(|e| format!("Failed to register global shortcut: {:?}", e))?;

    tracing::info!(
        "Successfully registered global shortcut: {} -> {}",
        key,
        action
    );
    let _ = app_clone.emit("shortcut_registered", action);

    Ok(())
}

/// Unregister a global shortcut
fn unregister_global_shortcut(app: &AppHandle, key: &str) -> Result<(), String> {
    let shortcut: GlobalShortcut = key
        .parse()
        .map_err(|e| format!("Failed to parse shortcut '{}': {:?}", key, e))?;

    app.global_shortcut()
        .unregister(shortcut)
        .map_err(|e| format!("Failed to unregister global shortcut: {:?}", e))?;

    tracing::info!("Successfully unregistered global shortcut: {}", key);
    Ok(())
}

/// Initialize default global shortcuts on app startup
pub fn init_global_shortcuts(app: &AppHandle) -> Result<(), String> {
    tracing::info!("Initializing global shortcuts...");

    let defaults = ShortcutsState::with_defaults();
    let shortcuts = defaults.shortcuts.blocking_lock();

    for shortcut in shortcuts.values() {
        if shortcut.enabled && shortcut.is_global {
            if let Err(e) = register_global_shortcut(app, &shortcut.key, shortcut.action.clone()) {
                tracing::warn!(
                    "Failed to register default global shortcut '{}': {}",
                    shortcut.key,
                    e
                );
                // Continue with other shortcuts even if one fails
            }
        }
    }

    tracing::info!("Global shortcuts initialization complete");
    Ok(())
}

#[tauri::command]
pub async fn shortcuts_register(
    shortcut: Shortcut,
    app: AppHandle,
    state: State<'_, Arc<Mutex<ShortcutsState>>>,
) -> Result<(), String> {
    tracing::info!(
        "Registering shortcut: {} -> {} (global: {})",
        shortcut.key,
        shortcut.action,
        shortcut.is_global
    );

    let shortcuts_state = state.lock().await;

    // Register as global shortcut if marked as global
    if shortcut.is_global && shortcut.enabled {
        register_global_shortcut(&app, &shortcut.key, shortcut.action.clone())?;
    }

    let mut shortcuts = shortcuts_state.shortcuts.lock().await;
    shortcuts.insert(shortcut.id.clone(), shortcut.clone());

    let mut registered = shortcuts_state.registered_keys.lock().await;
    registered.push(shortcut.key.clone());

    app.emit("shortcut_registered", shortcut)
        .map_err(|e| format!("Failed to emit event: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn shortcuts_unregister(
    shortcut_id: String,
    app: AppHandle,
    state: State<'_, Arc<Mutex<ShortcutsState>>>,
) -> Result<(), String> {
    tracing::info!("Unregistering shortcut: {}", shortcut_id);

    let shortcuts_state = state.lock().await;
    let mut shortcuts = shortcuts_state.shortcuts.lock().await;

    if let Some(shortcut) = shortcuts.remove(&shortcut_id) {
        // Unregister from system if it was a global shortcut
        if shortcut.is_global {
            let _ = unregister_global_shortcut(&app, &shortcut.key);
        }

        let mut registered = shortcuts_state.registered_keys.lock().await;
        registered.retain(|k| k != &shortcut.key);

        app.emit("shortcut_unregistered", shortcut_id)
            .map_err(|e| format!("Failed to emit event: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn shortcuts_list(
    state: State<'_, Arc<Mutex<ShortcutsState>>>,
) -> Result<Vec<Shortcut>, String> {
    let shortcuts_state = state.lock().await;
    let shortcuts = shortcuts_state.shortcuts.lock().await;
    Ok(shortcuts.values().cloned().collect())
}

#[tauri::command]
pub async fn shortcuts_update(
    shortcut_id: String,
    new_key: Option<String>,
    enabled: Option<bool>,
    app: AppHandle,
    state: State<'_, Arc<Mutex<ShortcutsState>>>,
) -> Result<Shortcut, String> {
    tracing::info!("Updating shortcut: {}", shortcut_id);

    let shortcuts_state = state.lock().await;
    let mut shortcuts = shortcuts_state.shortcuts.lock().await;

    let shortcut = shortcuts
        .get_mut(&shortcut_id)
        .ok_or("Shortcut not found")?;

    let old_key = shortcut.key.clone();
    let was_enabled = shortcut.enabled;
    let is_global = shortcut.is_global;

    if let Some(key) = new_key {
        // Unregister old global shortcut if it was global
        if is_global && was_enabled {
            let _ = unregister_global_shortcut(&app, &old_key);
        }

        let mut registered = shortcuts_state.registered_keys.lock().await;
        registered.retain(|k| k != &shortcut.key);

        shortcut.key = key.clone();
        registered.push(key);
    }

    if let Some(en) = enabled {
        shortcut.enabled = en;
    }

    // Re-register if now enabled and is global
    if shortcut.is_global && shortcut.enabled && (!was_enabled || shortcut.key != old_key) {
        register_global_shortcut(&app, &shortcut.key, shortcut.action.clone())?;
    }

    // Unregister if disabled
    if shortcut.is_global && was_enabled && !shortcut.enabled {
        let _ = unregister_global_shortcut(&app, &shortcut.key);
    }

    let updated = shortcut.clone();

    app.emit("shortcut_updated", &updated)
        .map_err(|e| format!("Failed to emit event: {}", e))?;

    Ok(updated)
}

#[tauri::command]
pub async fn shortcuts_trigger(action: String, app: AppHandle) -> Result<(), String> {
    tracing::info!("Triggering shortcut action: {}", action);

    app.emit("shortcut_action", action)
        .map_err(|e| format!("Failed to emit event: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn shortcuts_reset(
    app: AppHandle,
    state: State<'_, Arc<Mutex<ShortcutsState>>>,
) -> Result<Vec<Shortcut>, String> {
    tracing::info!("Resetting shortcuts to defaults");

    let shortcuts_state = state.lock().await;

    // Unregister all existing global shortcuts
    {
        let shortcuts = shortcuts_state.shortcuts.lock().await;
        for shortcut in shortcuts.values() {
            if shortcut.is_global && shortcut.enabled {
                let _ = unregister_global_shortcut(&app, &shortcut.key);
            }
        }
    }

    let mut shortcuts = shortcuts_state.shortcuts.lock().await;
    shortcuts.clear();

    let defaults = ShortcutsState::with_defaults();
    let default_shortcuts = defaults.shortcuts.blocking_lock();

    for (id, shortcut) in default_shortcuts.iter() {
        shortcuts.insert(id.clone(), shortcut.clone());

        // Register global shortcuts
        if shortcut.is_global && shortcut.enabled {
            if let Err(e) = register_global_shortcut(&app, &shortcut.key, shortcut.action.clone()) {
                tracing::warn!("Failed to re-register shortcut '{}': {}", shortcut.key, e);
            }
        }
    }

    let result: Vec<Shortcut> = shortcuts.values().cloned().collect();

    app.emit("shortcuts_reset", &result)
        .map_err(|e| format!("Failed to emit event: {}", e))?;

    Ok(result)
}

#[tauri::command]
pub async fn shortcuts_check_key(
    key: String,
    state: State<'_, Arc<Mutex<ShortcutsState>>>,
) -> Result<bool, String> {
    let shortcuts_state = state.lock().await;
    let shortcuts = shortcuts_state.shortcuts.lock().await;

    let is_registered = shortcuts.values().any(|s| s.key == key);
    Ok(is_registered)
}

#[tauri::command]
pub async fn shortcuts_get_defaults() -> Result<Vec<Shortcut>, String> {
    let defaults = ShortcutsState::with_defaults();
    let shortcuts = defaults.shortcuts.blocking_lock();
    Ok(shortcuts.values().cloned().collect())
}

/// Command to register global shortcuts from frontend
#[tauri::command]
pub async fn shortcuts_register_global(
    key: String,
    action: String,
    app: AppHandle,
) -> Result<(), String> {
    register_global_shortcut(&app, &key, action)
}

/// Command to unregister global shortcuts from frontend
#[tauri::command]
pub async fn shortcuts_unregister_global(key: String, app: AppHandle) -> Result<(), String> {
    unregister_global_shortcut(&app, &key)
}
