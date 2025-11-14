use crate::hooks::{global_hooks, Hook, HookConfig, HookRegistry};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;

/// Hook registry state wrapper for Tauri
pub struct HookRegistryState(pub Arc<RwLock<Option<Arc<HookRegistry>>>>);

impl HookRegistryState {
    pub fn new() -> Self {
        Self(Arc::new(RwLock::new(None)))
    }

    pub async fn get(&self) -> Option<Arc<HookRegistry>> {
        self.0.read().await.clone()
    }

    pub async fn set(&self, registry: Arc<HookRegistry>) {
        let mut guard = self.0.write().await;
        *guard = Some(registry);
    }
}

/// Initialize the hook registry
#[tauri::command]
pub async fn hooks_initialize(state: State<'_, HookRegistryState>) -> Result<String, String> {
    // Check if already initialized
    if state.get().await.is_some() {
        return Ok("Hook registry already initialized".to_string());
    }

    // Create and initialize registry
    let registry = Arc::new(
        HookRegistry::new().map_err(|e| format!("Failed to create hook registry: {}", e))?,
    );

    registry
        .initialize()
        .await
        .map_err(|e| format!("Failed to initialize hook registry: {}", e))?;

    // Store in state
    state.set(registry).await;

    // Also initialize global registry
    global_hooks()
        .initialize()
        .await
        .map_err(|e| format!("Failed to initialize global hook registry: {}", e))?;

    Ok("Hook registry initialized successfully".to_string())
}

/// List all hooks
#[tauri::command]
pub async fn hooks_list(state: State<'_, HookRegistryState>) -> Result<Vec<Hook>, String> {
    let registry = state
        .get()
        .await
        .ok_or_else(|| "Hook registry not initialized".to_string())?;

    Ok(registry.list_hooks().await)
}

/// Add a new hook
#[tauri::command]
pub async fn hooks_add(state: State<'_, HookRegistryState>, hook: Hook) -> Result<String, String> {
    let registry = state
        .get()
        .await
        .ok_or_else(|| "Hook registry not initialized".to_string())?;

    registry
        .add_hook(hook.clone())
        .await
        .map_err(|e| format!("Failed to add hook: {}", e))?;

    Ok(format!("Hook '{}' added successfully", hook.name))
}

/// Remove a hook
#[tauri::command]
pub async fn hooks_remove(
    state: State<'_, HookRegistryState>,
    name: String,
) -> Result<String, String> {
    let registry = state
        .get()
        .await
        .ok_or_else(|| "Hook registry not initialized".to_string())?;

    registry
        .remove_hook(&name)
        .await
        .map_err(|e| format!("Failed to remove hook: {}", e))?;

    Ok(format!("Hook '{}' removed successfully", name))
}

/// Toggle a hook's enabled status
#[tauri::command]
pub async fn hooks_toggle(
    state: State<'_, HookRegistryState>,
    name: String,
    enabled: bool,
) -> Result<String, String> {
    let registry = state
        .get()
        .await
        .ok_or_else(|| "Hook registry not initialized".to_string())?;

    registry
        .toggle_hook(&name, enabled)
        .await
        .map_err(|e| format!("Failed to toggle hook: {}", e))?;

    Ok(format!(
        "Hook '{}' {}",
        name,
        if enabled { "enabled" } else { "disabled" }
    ))
}

/// Update a hook
#[tauri::command]
pub async fn hooks_update(
    state: State<'_, HookRegistryState>,
    hook: Hook,
) -> Result<String, String> {
    let registry = state
        .get()
        .await
        .ok_or_else(|| "Hook registry not initialized".to_string())?;

    registry
        .update_hook(hook.clone())
        .await
        .map_err(|e| format!("Failed to update hook: {}", e))?;

    Ok(format!("Hook '{}' updated successfully", hook.name))
}

/// Get hook configuration path
#[tauri::command]
pub async fn hooks_get_config_path() -> Result<String, String> {
    HookConfig::default_config_path()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| format!("Failed to get config path: {}", e))
}

/// Create example hooks configuration
#[tauri::command]
pub async fn hooks_create_example() -> Result<String, String> {
    let config = HookConfig::create_example();

    config
        .save_default()
        .map_err(|e| format!("Failed to save example configuration: {}", e))?;

    Ok("Example hooks configuration created successfully".to_string())
}

/// Export hooks configuration as YAML
#[tauri::command]
pub async fn hooks_export(state: State<'_, HookRegistryState>) -> Result<String, String> {
    let registry = state
        .get()
        .await
        .ok_or_else(|| "Hook registry not initialized".to_string())?;

    let hooks = registry.list_hooks().await;
    let config = HookConfig { hooks };

    serde_yaml::to_string(&config).map_err(|e| format!("Failed to export hooks: {}", e))
}

/// Import hooks configuration from YAML
#[tauri::command]
pub async fn hooks_import(
    state: State<'_, HookRegistryState>,
    yaml: String,
) -> Result<String, String> {
    let registry = state
        .get()
        .await
        .ok_or_else(|| "Hook registry not initialized".to_string())?;

    let config: HookConfig =
        serde_yaml::from_str(&yaml).map_err(|e| format!("Failed to parse YAML: {}", e))?;

    // Load hooks into registry
    registry.executor().load_hooks(config.hooks.clone()).await;

    // Save to default location
    config
        .save_default()
        .map_err(|e| format!("Failed to save configuration: {}", e))?;

    Ok(format!(
        "Imported {} hooks successfully",
        config.hooks.len()
    ))
}

/// Reload hooks from configuration file
#[tauri::command]
pub async fn hooks_reload(state: State<'_, HookRegistryState>) -> Result<String, String> {
    let registry = state
        .get()
        .await
        .ok_or_else(|| "Hook registry not initialized".to_string())?;

    let config =
        HookConfig::load_default().map_err(|e| format!("Failed to load configuration: {}", e))?;

    registry.executor().load_hooks(config.hooks.clone()).await;

    Ok(format!(
        "Reloaded {} hooks successfully",
        config.hooks.len()
    ))
}

/// Get all available event types
#[tauri::command]
pub async fn hooks_get_event_types() -> Result<Vec<String>, String> {
    use crate::hooks::HookEventType;

    Ok(HookEventType::all()
        .into_iter()
        .map(|e| e.as_str().to_string())
        .collect())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HookStats {
    pub total_executions: u64,
    pub successful_executions: u64,
    pub failed_executions: u64,
    pub average_execution_time_ms: f64,
    pub last_execution: Option<String>,
}

/// Get execution statistics for a hook
#[tauri::command]
pub async fn hooks_get_stats(
    state: State<'_, HookRegistryState>,
    name: String,
) -> Result<Option<HookStats>, String> {
    let registry = state
        .get()
        .await
        .ok_or_else(|| "Hook registry not initialized".to_string())?;

    // Note: This is a placeholder - the actual stats implementation is internal to the executor
    // You would need to expose a stats API in the HookExecutor to make this fully functional
    Ok(None)
}
