//! Applies the Settings memory policy to the chat memory injector.

use super::memory::MemoryState;
use crate::core::llm::memory_integration::MemoryInjectionConfig;
use crate::sys::error::Result;
use tauri::State;
use tracing::info;

/// Configure memory injection behavior
#[tauri::command]
pub async fn chat_configure_memory_injection(
    enabled: bool,
    max_memories: usize,
    min_importance: i32,
    allow_tool_assisted_generation: bool,
    memory_state: State<'_, MemoryState>,
    settings_state: State<'_, crate::sys::commands::settings::SettingsState>,
) -> Result<()> {
    let new_config = MemoryInjectionConfig {
        enabled,
        max_memories,
        min_importance,
        priority_categories: vec![
            crate::core::agi::memory_manager::MemoryCategory::Decision,
            crate::core::agi::memory_manager::MemoryCategory::Preference,
            crate::core::agi::memory_manager::MemoryCategory::Fact,
        ],
    };

    let mut config = memory_state.injection_config.write().await;
    *config = new_config;
    drop(config);

    // Keep the authoritative per-turn policy in lockstep with the process-local
    // injector. The frontend persists the same value through settings_save;
    // updating it here closes the interval before that disk write completes.
    let mut settings = settings_state.settings.lock().await;
    let preferences = settings
        .chat_preferences
        .get_or_insert_with(Default::default);
    preferences.memory_enabled = enabled;
    preferences.auto_save_memories = enabled;
    preferences.allow_tool_assisted_memory_generation = allow_tool_assisted_generation;

    info!(
        "[ChatMemoryIntegration] Memory injection config updated: enabled={}, max={}, min_importance={}",
        enabled, max_memories, min_importance
    );

    Ok(())
}
