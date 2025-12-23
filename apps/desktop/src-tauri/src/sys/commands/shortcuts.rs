use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Shortcut {
    pub id: String,
    pub key: String,
    pub description: String,
    pub action: String,
    pub enabled: bool,
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
            Shortcut {
                id: "open_chat".to_string(),
                key: "CommandOrControl+K".to_string(),
                description: "Open chat interface".to_string(),
                action: "open_chat".to_string(),
                enabled: true,
            },
            Shortcut {
                id: "toggle_window".to_string(),
                key: "CommandOrControl+Shift+Space".to_string(),
                description: "Toggle main window".to_string(),
                action: "toggle_window".to_string(),
                enabled: true,
            },
            Shortcut {
                id: "new_composer".to_string(),
                key: "CommandOrControl+Shift+N".to_string(),
                description: "New composer session".to_string(),
                action: "new_composer".to_string(),
                enabled: true,
            },
            Shortcut {
                id: "voice_input".to_string(),
                key: "CommandOrControl+Shift+V".to_string(),
                description: "Start voice input".to_string(),
                action: "voice_input".to_string(),
                enabled: true,
            },
            Shortcut {
                id: "quick_capture".to_string(),
                key: "CommandOrControl+Shift+S".to_string(),
                description: "Quick screen capture".to_string(),
                action: "quick_capture".to_string(),
                enabled: true,
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

#[tauri::command]
pub async fn shortcuts_register(
    shortcut: Shortcut,
    _app: AppHandle,
    state: State<'_, Arc<Mutex<ShortcutsState>>>,
) -> Result<(), String> {
    tracing::info!(
        "Registering shortcut: {} -> {}",
        shortcut.key,
        shortcut.action
    );

    let shortcuts_state = state.lock().await;

    let mut shortcuts = shortcuts_state.shortcuts.lock().await;
    shortcuts.insert(shortcut.id.clone(), shortcut.clone());

    #[cfg(target_os = "windows")]
    {
        let app_clone = app.clone();

        let mut registered = shortcuts_state.registered_keys.lock().await;
        registered.push(shortcut.key.clone());

        app_clone
            .emit("shortcut_registered", shortcut)
            .map_err(|e| format!("Failed to emit event: {}", e))?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        tracing::warn!("Global shortcuts not yet implemented for this platform");
    }

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

    if let Some(key) = new_key {
        let mut registered = shortcuts_state.registered_keys.lock().await;
        registered.retain(|k| k != &shortcut.key);

        shortcut.key = key.clone();

        registered.push(key);
    }

    if let Some(en) = enabled {
        shortcut.enabled = en;
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

    let mut shortcuts = shortcuts_state.shortcuts.lock().await;
    shortcuts.clear();

    let defaults = ShortcutsState::with_defaults();
    let default_shortcuts = defaults.shortcuts.blocking_lock();

    for (id, shortcut) in default_shortcuts.iter() {
        shortcuts.insert(id.clone(), shortcut.clone());
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
