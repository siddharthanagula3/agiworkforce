use std::collections::HashMap;
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;

/// Managed state holding the current capability toggles synced from the frontend.
/// Each key corresponds to a capability name (e.g. "fileOperations", "terminalAccess"),
/// and the value indicates whether that capability is enabled.
///
/// Capabilities default to enabled (true) — disabling is opt-in via the UI.
#[derive(Clone)]
pub struct CapabilityState {
    inner: Arc<RwLock<HashMap<String, bool>>>,
}

impl CapabilityState {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Check whether a capability is enabled. Unknown capabilities default to true
    /// (enabled) so that new features work without explicit opt-in.
    pub async fn is_enabled(&self, capability: &str) -> bool {
        let map = self.inner.read().await;
        map.get(capability).copied().unwrap_or(true)
    }

    /// Update the full capability map (called from frontend sync).
    pub async fn update(&self, capabilities: HashMap<String, bool>) {
        let mut map = self.inner.write().await;
        *map = capabilities;
    }

    /// Get a snapshot of all capabilities.
    pub async fn snapshot(&self) -> HashMap<String, bool> {
        self.inner.read().await.clone()
    }
}

impl Default for CapabilityState {
    fn default() -> Self {
        Self::new()
    }
}

/// Maps a tool name (as used in ToolExecutionGuard) to the capability key
/// that governs it. Returns `None` if the tool is not gated by any capability.
pub fn tool_to_capability(tool_name: &str) -> Option<&'static str> {
    match tool_name {
        // File operations
        "file_read" | "file_read_binary" | "file_write" | "file_delete" | "file_list" => {
            Some("fileOperations")
        }

        // Document operations
        "document_read"
        | "document_extract_text"
        | "document_get_metadata"
        | "document_detect_type"
        | "document_search"
        | "document_create_pdf"
        | "document_create_word"
        | "document_create_excel" => Some("documentCreation"),

        // Browser automation
        "browser_navigate"
        | "browser_click"
        | "browser_type"
        | "browser_extract"
        | "browser_screenshot"
        | "browser_hover"
        | "browser_focus"
        | "browser_scroll_into_view"
        | "browser_query_all"
        | "browser_execute_async_js"
        | "browser_get_element_state"
        | "browser_wait_for_interactive"
        | "browser_select_option"
        | "browser_check"
        | "browser_uncheck"
        | "browser_get_url"
        | "browser_get_title"
        | "browser_go_back"
        | "browser_go_forward"
        | "browser_wait_for_selector"
        | "browser_get_text"
        | "browser_get_attribute" => Some("browserAutomation"),

        // Computer use (mouse, keyboard, desktop)
        "ui_click" | "ui_type" => Some("computerUse"),

        // Screenshot & OCR
        "ui_screenshot" => Some("screenshotOcr"),

        // Terminal / shell access
        "terminal_execute" => Some("terminalAccess"),

        // Code execution
        "code_execute" => Some("codeExecution"),

        // Web search / API access
        "api_call" | "api_download" | "api_upload" => Some("webSearch"),

        // Git integration
        "git_clone" => Some("gitIntegration"),

        // Database operations
        "db_query" | "db_execute" => Some("dataAnalysis"),

        _ => None,
    }
}

/// Sync capability toggles from the frontend settings to the Rust backend.
/// Called whenever the user changes a capability toggle in Settings > Features & Privacy.
#[tauri::command]
pub async fn sync_capabilities(
    capabilities: HashMap<String, bool>,
    state: State<'_, CapabilityState>,
) -> Result<(), String> {
    tracing::info!(
        "[Capabilities] Syncing {} capability toggles from frontend",
        capabilities.len()
    );
    for (key, enabled) in &capabilities {
        tracing::debug!("[Capabilities] {} = {}", key, enabled);
    }
    state.update(capabilities).await;
    Ok(())
}

/// Get the current capability state (for diagnostics or frontend re-sync).
#[tauri::command]
pub async fn get_capabilities(
    state: State<'_, CapabilityState>,
) -> Result<HashMap<String, bool>, String> {
    Ok(state.snapshot().await)
}

/// Check whether a specific capability is currently enabled.
#[tauri::command]
pub async fn check_capability(
    capability: String,
    state: State<'_, CapabilityState>,
) -> Result<bool, String> {
    Ok(state.is_enabled(&capability).await)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tool_to_capability_mapping() {
        assert_eq!(tool_to_capability("file_read"), Some("fileOperations"));
        assert_eq!(tool_to_capability("file_write"), Some("fileOperations"));
        assert_eq!(
            tool_to_capability("browser_navigate"),
            Some("browserAutomation")
        );
        assert_eq!(tool_to_capability("ui_click"), Some("computerUse"));
        assert_eq!(
            tool_to_capability("terminal_execute"),
            Some("terminalAccess")
        );
        assert_eq!(tool_to_capability("code_execute"), Some("codeExecution"));
        assert_eq!(tool_to_capability("unknown_tool"), None);
    }

    #[tokio::test]
    async fn test_capability_state_defaults_to_enabled() {
        let state = CapabilityState::new();
        // Unknown capabilities default to enabled
        assert!(state.is_enabled("anything").await);
    }

    #[tokio::test]
    async fn test_capability_state_respects_disabled() {
        let state = CapabilityState::new();
        let mut caps = HashMap::new();
        caps.insert("fileOperations".to_string(), false);
        caps.insert("terminalAccess".to_string(), true);
        state.update(caps).await;

        assert!(!state.is_enabled("fileOperations").await);
        assert!(state.is_enabled("terminalAccess").await);
        // Unset capabilities still default to enabled
        assert!(state.is_enabled("codeExecution").await);
    }
}
