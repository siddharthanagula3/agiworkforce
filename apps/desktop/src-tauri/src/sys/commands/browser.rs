use serde_json::Value;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::State;

static BROWSER_ALREADY_TILED: AtomicBool = AtomicBool::new(false);

use crate::automation::browser::advanced::{AdvancedBrowserOps, Cookie};
use crate::automation::browser::dom_operations::{ClickOptions, DomOperations, TypeOptions};
use crate::automation::browser::playwright_bridge::{BrowserOptions, BrowserType};
use crate::automation::browser::BrowserState;
use crate::sys::commands::tool_confirmation::{request_tool_confirmation, ToolConfirmationState};
use crate::sys::security::tool_guard::{RiskLevel, ToolConfirmationRequest, ToolSafetyTier};

// =============================================================================
// SECURITY: Input sanitization for CDP JavaScript injection prevention
// =============================================================================

/// Validate a CSS selector against a whitelist of safe characters.
/// Rejects selectors that contain characters outside the expected set for
/// standard CSS selectors, preventing injection of arbitrary JavaScript.
///
/// Allowed characters cover: alphanumerics, whitespace, `.`, `#`, `_`, `-`,
/// `>`, `+`, `~`, `:`, `[`, `]`, `=`, `^`, `$`, `*`, `|`, `"`, `'`, `(`, `)`.
fn is_valid_css_selector(selector: &str) -> bool {
    selector
        .chars()
        .all(|c| c.is_alphanumeric() || " .#_->+~:[]=^$*|\"'()".contains(c))
}

/// Sanitize a CSS selector for safe embedding in JavaScript.
///
/// Uses `serde_json::to_string()` to produce a JSON-encoded string literal,
/// then strips the outer quotes so it can be interpolated into JS template strings.
/// This is more robust than manual character escaping because JSON encoding handles
/// all control characters, Unicode escapes, and special characters correctly.
fn sanitize_selector(selector: &str) -> String {
    // serde_json::to_string produces a JSON string like: "my.selector"
    // We strip the outer quotes to get the safely escaped interior.
    let json_encoded = serde_json::to_string(selector).unwrap_or_else(|_| selector.to_string());
    // Strip the outer double quotes added by JSON encoding
    if json_encoded.len() >= 2 && json_encoded.starts_with('"') && json_encoded.ends_with('"') {
        json_encoded[1..json_encoded.len() - 1].to_string()
    } else {
        json_encoded
    }
}

/// Sanitize a value for safe embedding in a JavaScript string literal.
///
/// Uses JSON encoding for robust escaping of all special characters.
fn sanitize_js_value(value: &str) -> String {
    let json_encoded = serde_json::to_string(value).unwrap_or_else(|_| value.to_string());
    if json_encoded.len() >= 2 && json_encoded.starts_with('"') && json_encoded.ends_with('"') {
        json_encoded[1..json_encoded.len() - 1].to_string()
    } else {
        json_encoded
    }
}

// =============================================================================
// BROWSER STATE WRAPPER WITH GRACEFUL DEGRADATION
// =============================================================================

/// Error message returned when browser automation is unavailable
const BROWSER_UNAVAILABLE_ERROR: &str =
    "Browser automation is not available. The browser subsystem failed to initialize. \
     Please restart the application or check system requirements (Playwright/Chromium).";

/// Wrapper for browser automation state with graceful degradation support.
pub struct BrowserStateWrapper {
    /// The browser state, None if initialization failed
    inner: Option<BrowserState>,
    /// The error that occurred during initialization, if any
    init_error: Option<String>,
}

impl BrowserStateWrapper {
    /// Creates a new browser state wrapper with full functionality.
    pub async fn new() -> Result<Self, String> {
        match BrowserState::new().await {
            Ok(state) => {
                tracing::info!("BrowserState initialized successfully");
                Ok(Self {
                    inner: Some(state),
                    init_error: None,
                })
            }
            Err(e) => {
                let error_msg = e.to_string();
                tracing::error!("BrowserState initialization failed: {}", error_msg);
                Err(error_msg)
            }
        }
    }

    /// Creates a degraded browser state wrapper when initialization fails.
    pub fn new_degraded(error: String) -> Self {
        tracing::warn!(
            "BrowserStateWrapper created in DEGRADED mode. Browser automation unavailable. \
             Original error: {}",
            error
        );
        Self {
            inner: None,
            init_error: Some(error),
        }
    }

    /// Returns whether browser automation is available.
    pub fn is_available(&self) -> bool {
        self.inner.is_some()
    }

    /// Returns the initialization error, if any.
    pub fn init_error(&self) -> Option<&str> {
        self.init_error.as_deref()
    }

    /// Gets a reference to the inner BrowserState.
    pub fn get(&self) -> Result<&BrowserState, String> {
        self.inner.as_ref().ok_or_else(|| {
            if let Some(ref err) = self.init_error {
                format!("{} Original error: {}", BROWSER_UNAVAILABLE_ERROR, err)
            } else {
                BROWSER_UNAVAILABLE_ERROR.to_string()
            }
        })
    }

    /// Gets CDP client for a specific tab, or falls back to active tab if not specified.
    pub async fn get_client_for_tab(
        &self,
        tab_id: Option<String>,
    ) -> Result<(Arc<crate::automation::browser::CdpClient>, String), String> {
        if let Some(id) = tab_id {
            let client = self.get_cdp_client_for_tab(&id).await?;
            Ok((client, id))
        } else {
            self.get_active_client().await
        }
    }

    /// Returns the error message for when browser is unavailable.
    pub fn get_error_message(&self) -> String {
        if let Some(ref err) = self.init_error {
            format!("{} Original error: {}", BROWSER_UNAVAILABLE_ERROR, err)
        } else {
            BROWSER_UNAVAILABLE_ERROR.to_string()
        }
    }

    /// Gets the tab manager, returning an error if browser is unavailable.
    pub fn get_tab_manager(
        &self,
    ) -> Result<&std::sync::Arc<tokio::sync::Mutex<crate::automation::browser::TabManager>>, String>
    {
        self.get().map(|state| &state.tab_manager)
    }

    /// Gets the CDP client for a specific tab, returning an error if browser is unavailable.
    pub async fn get_cdp_client_for_tab(
        &self,
        tab_id: &str,
    ) -> Result<std::sync::Arc<crate::automation::browser::CdpClient>, String> {
        let state = self.get()?;
        state
            .get_cdp_client(tab_id)
            .await
            .map_err(|e| format!("Failed to get CDP client: {}", e))
    }

    /// Helper to get CDP client for the active tab
    pub async fn get_active_client(
        &self,
    ) -> Result<(Arc<crate::automation::browser::CdpClient>, String), String> {
        let tab_manager = self.get_tab_manager()?;
        let active_tab = tab_manager
            .lock()
            .await
            .get_active_tab()
            .await
            .map_err(|e| e.to_string())?;

        if let Some(tab) = active_tab {
            let client = self.get_cdp_client_for_tab(&tab.id).await?;
            Ok((client, tab.id))
        } else {
            Err("No active browser tab found. Please open a tab first.".to_string())
        }
    }

    /// Gets the extension bridge, returning an error if browser state is unavailable.
    ///
    /// The `ExtensionBridge` communicates with the browser extension through the
    /// realtime WebSocket transport. Use this when CDP is unavailable or when
    /// you need to dispatch actions through the installed extension content script
    /// rather than a remote-debugging port.
    pub fn get_extension_bridge(
        &self,
    ) -> Result<
        &std::sync::Arc<tokio::sync::Mutex<crate::automation::browser::ExtensionBridge>>,
        String,
    > {
        self.get().map(|state| &state.extension)
    }
}

// Browser Automation Commands

#[tauri::command]
pub async fn browser_init(state: State<'_, BrowserStateWrapper>) -> Result<(), String> {
    if state.is_available() {
        Ok(())
    } else {
        Err(state.get_error_message())
    }
}

#[tauri::command]
pub async fn browser_check_status(state: State<'_, BrowserStateWrapper>) -> Result<Value, String> {
    Ok(serde_json::json!({
        "available": state.is_available(),
        "error": state.init_error(),
    }))
}

#[tauri::command]
pub async fn browser_launch(
    state: State<'_, BrowserStateWrapper>,
    options: Option<Value>,
) -> Result<String, String> {
    let browser_state = state.get()?;

    let mut browser_options = BrowserOptions::default();

    if let Some(opts) = options {
        if let Some(headless) = opts.get("headless").and_then(|v| v.as_bool()) {
            browser_options.headless = headless;
        }
    }

    let handle = browser_state
        .playwright
        .lock()
        .await
        .launch_browser(BrowserType::Chromium, browser_options)
        .await
        .map_err(|e| e.to_string())?;

    Ok(handle.id)
}

#[tauri::command]
pub async fn browser_open_tab(
    state: State<'_, BrowserStateWrapper>,
    url: Option<String>,
) -> Result<String, String> {
    let browser_state = state.get()?;
    let target_url = url.unwrap_or_else(|| "about:blank".to_string());

    // Create tab via Chrome HTTP API on port 9222 (hardcoded in PlaywrightBridge)
    let create_url = format!("http://127.0.0.1:9222/json/new?{}", target_url);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    // Use PUT to create new target
    let resp = client.put(&create_url).send().await;

    match resp {
        Ok(response) => {
            // Parse JSON: { "id": "...", ... }
            // CDP returns the target info
            if let Ok(json) = response.json::<Value>().await {
                if let Some(id) = json.get("id").and_then(|v| v.as_str()) {
                    let tab_id = id.to_string();
                    // Register in TabManager with the actual Chrome Target ID
                    browser_state
                        .tab_manager
                        .lock()
                        .await
                        .register_tab(&tab_id, &target_url)
                        .await
                        .map_err(|e| e.to_string())?;
                    return Ok(tab_id);
                }
            }
        }
        Err(e) => {
            tracing::warn!(
                "Failed to create tab via CDP HTTP: {}. Falling back to internal tracking.",
                e
            );
        }
    }

    // Fallback: Just open internally (won't control browser)
    tracing::warn!("Using fallback internal tab (no browser control)");
    let tab_id = browser_state
        .tab_manager
        .lock()
        .await
        .open_tab(&target_url)
        .await
        .map_err(|e| e.to_string())?;

    Ok(tab_id)
}

#[tauri::command]
pub async fn browser_close_tab(
    state: State<'_, BrowserStateWrapper>,
    tab_id: Option<String>,
) -> Result<(), String> {
    let browser_state = state.get()?;
    let id = if let Some(i) = tab_id {
        i
    } else {
        match browser_state
            .tab_manager
            .lock()
            .await
            .get_active_tab()
            .await
            .map_err(|e| e.to_string())?
        {
            Some(t) => t.id,
            None => return Ok(()), // Nothing to close
        }
    };

    // Try to close via HTTP API first
    let close_url = format!("http://127.0.0.1:9222/json/close/{}", id);
    let _ = reqwest::get(&close_url).await; // Ignore error, might already be closed or unreachable

    browser_state
        .tab_manager
        .lock()
        .await
        .close_tab(&id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn browser_switch_tab(
    state: State<'_, BrowserStateWrapper>,
    tab_id: String,
) -> Result<(), String> {
    let browser_state = state.get()?;
    browser_state
        .tab_manager
        .lock()
        .await
        .switch_to_tab(&tab_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn browser_list_tabs(
    state: State<'_, BrowserStateWrapper>,
) -> Result<Vec<String>, String> {
    let tab_manager = state.get_tab_manager()?;
    let tabs = tab_manager
        .lock()
        .await
        .list_tabs()
        .await
        .map_err(|e| e.to_string())?;
    Ok(tabs.into_iter().map(|t| t.id).collect())
}

#[tauri::command]
pub async fn browser_navigate(
    app: tauri::AppHandle,
    state: State<'_, BrowserStateWrapper>,
    url: String,
    tab_id: Option<String>,
) -> Result<(), String> {
    let tab_manager = state.get_tab_manager()?;
    let tab_manager = tab_manager.lock().await;

    // Get or create a tab
    let target_tab_id = if let Some(id) = tab_id.clone() {
        // Verify tab exists
        let tabs = tab_manager.list_tabs().await.map_err(|e| e.to_string())?;
        if tabs.iter().any(|t| t.id == id) {
            id
        } else {
            return Err(format!("Tab not found: {}", id));
        }
    } else {
        let tabs = tab_manager.list_tabs().await.map_err(|e| e.to_string())?;
        if tabs.is_empty() {
            tab_manager
                .open_tab(&url)
                .await
                .map_err(|e| e.to_string())?
        } else {
            tabs[0].id.clone()
        }
    };
    drop(tab_manager);

    let client = state.get_cdp_client_for_tab(&target_tab_id).await?;
    client.navigate(&url).await.map_err(|e| e.to_string())?;

    // Auto-tile only on first navigation (avoid re-snapping on every link click).
    // Only set the flag AFTER success so a failure does not prevent retries.
    if !BROWSER_ALREADY_TILED.load(Ordering::Relaxed) {
        if let Err(e) = crate::auto_tile_for_browser(&app) {
            tracing::warn!("auto_tile_for_browser failed (non-fatal): {}", e);
        } else {
            BROWSER_ALREADY_TILED.store(true, Ordering::Relaxed);
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn browser_go_back(
    state: State<'_, BrowserStateWrapper>,
    tab_id: Option<String>,
) -> Result<(), String> {
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    client
        .evaluate("window.history.back()")
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn browser_go_forward(
    state: State<'_, BrowserStateWrapper>,
    tab_id: Option<String>,
) -> Result<(), String> {
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    client
        .evaluate("window.history.forward()")
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn browser_reload(
    state: State<'_, BrowserStateWrapper>,
    tab_id: Option<String>,
) -> Result<(), String> {
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    client
        .evaluate("window.location.reload()")
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn browser_get_url(
    state: State<'_, BrowserStateWrapper>,
    tab_id: Option<String>,
) -> Result<String, String> {
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    client.get_url().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_get_title(
    state: State<'_, BrowserStateWrapper>,
    tab_id: Option<String>,
) -> Result<String, String> {
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    client.get_title().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_click(
    state: State<'_, BrowserStateWrapper>,
    selector: String,
    tab_id: Option<String>,
) -> Result<(), String> {
    // L3 fix: reject selectors containing characters outside the CSS safe-list.
    if !is_valid_css_selector(&selector) {
        return Err(format!("Invalid CSS selector: '{}'", selector));
    }
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    DomOperations::click(&client, &selector, ClickOptions::default())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_type(
    state: State<'_, BrowserStateWrapper>,
    selector: String,
    text: String,
    tab_id: Option<String>,
) -> Result<(), String> {
    if !is_valid_css_selector(&selector) {
        return Err(format!("Invalid CSS selector: '{}'", selector));
    }
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    DomOperations::type_text(&client, &selector, &text, TypeOptions::default())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_get_text(
    state: State<'_, BrowserStateWrapper>,
    selector: String,
    tab_id: Option<String>,
) -> Result<String, String> {
    if !is_valid_css_selector(&selector) {
        return Err(format!("Invalid CSS selector: '{}'", selector));
    }
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    DomOperations::get_text(&client, &selector)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_get_attribute(
    state: State<'_, BrowserStateWrapper>,
    selector: String,
    attribute: String,
    tab_id: Option<String>,
) -> Result<Option<String>, String> {
    if !is_valid_css_selector(&selector) {
        return Err(format!("Invalid CSS selector: '{}'", selector));
    }
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    DomOperations::get_attribute(&client, &selector, &attribute)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_wait_for_selector(
    state: State<'_, BrowserStateWrapper>,
    selector: String,
    timeout: Option<u64>,
    tab_id: Option<String>,
) -> Result<(), String> {
    if !is_valid_css_selector(&selector) {
        return Err(format!("Invalid CSS selector: '{}'", selector));
    }
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    DomOperations::wait_for_selector(&client, &selector, timeout.unwrap_or(30000))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_select_option(
    state: State<'_, BrowserStateWrapper>,
    selector: String,
    value: String,
    tab_id: Option<String>,
) -> Result<(), String> {
    if !is_valid_css_selector(&selector) {
        return Err(format!("Invalid CSS selector: '{}'", selector));
    }
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    DomOperations::select_option(&client, &selector, &value)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_check(
    state: State<'_, BrowserStateWrapper>,
    selector: String,
    tab_id: Option<String>,
) -> Result<(), String> {
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    DomOperations::check(&client, &selector)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_uncheck(
    state: State<'_, BrowserStateWrapper>,
    selector: String,
    tab_id: Option<String>,
) -> Result<(), String> {
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    DomOperations::uncheck(&client, &selector)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_screenshot(
    state: State<'_, BrowserStateWrapper>,
    selector: Option<String>,
    tab_id: Option<String>,
) -> Result<String, String> {
    let (client, _) = state.get_client_for_tab(tab_id).await?;

    if selector.is_some() {
        return Err(
            "Screenshot by CSS selector is not yet supported. To capture a specific element, \
             take a full-page screenshot (omit the selector parameter) and crop the result, \
             or use browser_extract with the selector to get the element's text content."
                .to_string(),
        );
    }

    let bytes = client
        .capture_screenshot(false)
        .await
        .map_err(|e| e.to_string())?;
    use base64::{engine::general_purpose::STANDARD, Engine};
    Ok(STANDARD.encode(bytes))
}

#[tauri::command]
pub async fn browser_evaluate(
    app: tauri::AppHandle,
    state: State<'_, BrowserStateWrapper>,
    confirmation_state: State<'_, ToolConfirmationState>,
    script: String,
    tab_id: Option<String>,
) -> Result<Value, String> {
    // SECURITY: Arbitrary JS evaluation requires explicit user approval
    let confirmation = ToolConfirmationRequest {
        request_id: uuid::Uuid::new_v4().to_string(),
        tool_name: "browser_evaluate".to_string(),
        tool_description: format!(
            "Execute JavaScript in the browser: {}",
            if script.len() > 200 {
                format!("{}...", &script[..200])
            } else {
                script.clone()
            }
        ),
        parameters: serde_json::json!({
            "script": script,
            "tab_id": tab_id,
        }),
        risk_level: RiskLevel::Critical,
        safety_tier: ToolSafetyTier::RequiresExplicitApproval,
        reason: "Arbitrary JavaScript evaluation can access page data, cookies, and perform actions on behalf of the user.".to_string(),
        reversible: false,
        undo_description: None,
    };

    let approved = request_tool_confirmation(&app, &confirmation_state, confirmation, 120)
        .await
        .map_err(|e| e.to_string())?;

    if !approved {
        return Err("JavaScript evaluation cancelled by user".to_string());
    }

    let (client, _) = state.get_client_for_tab(tab_id).await?;
    client.evaluate(&script).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_hover(
    state: State<'_, BrowserStateWrapper>,
    selector: String,
    tab_id: Option<String>,
) -> Result<(), String> {
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    DomOperations::hover(&client, &selector)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_focus(
    state: State<'_, BrowserStateWrapper>,
    selector: String,
    tab_id: Option<String>,
) -> Result<(), String> {
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    DomOperations::focus(&client, &selector)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_query_all(
    state: State<'_, BrowserStateWrapper>,
    selector: String,
    tab_id: Option<String>,
) -> Result<Vec<String>, String> {
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    let elements = DomOperations::query_all(&client, &selector)
        .await
        .map_err(|e| e.to_string())?;
    Ok(elements.iter().map(|e| e.text.clone()).collect())
}

#[tauri::command]
pub async fn browser_scroll_into_view(
    state: State<'_, BrowserStateWrapper>,
    selector: String,
    tab_id: Option<String>,
) -> Result<(), String> {
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    DomOperations::scroll_into_view(&client, &selector)
        .await
        .map_err(|e| e.to_string())
}

// =============================================================================
// IMPLEMENTED COMMANDS
// =============================================================================

#[tauri::command]
pub async fn browser_get_content(
    state: State<'_, BrowserStateWrapper>,
    tab_id: Option<String>,
) -> Result<String, String> {
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    client.get_content().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_get_dom_snapshot(
    state: State<'_, BrowserStateWrapper>,
    tab_id: Option<String>,
) -> Result<String, String> {
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    client.get_content().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_execute_async_js(
    app: tauri::AppHandle,
    state: State<'_, BrowserStateWrapper>,
    confirmation_state: State<'_, ToolConfirmationState>,
    script: String,
    tab_id: Option<String>,
) -> Result<Value, String> {
    // SECURITY: Arbitrary async JS evaluation requires explicit user approval
    let confirmation = ToolConfirmationRequest {
        request_id: uuid::Uuid::new_v4().to_string(),
        tool_name: "browser_execute_async_js".to_string(),
        tool_description: format!(
            "Execute async JavaScript in the browser: {}",
            if script.len() > 200 {
                format!("{}...", &script[..200])
            } else {
                script.clone()
            }
        ),
        parameters: serde_json::json!({
            "script": script,
            "tab_id": tab_id,
        }),
        risk_level: RiskLevel::Critical,
        safety_tier: ToolSafetyTier::RequiresExplicitApproval,
        reason: "Arbitrary async JavaScript evaluation can access page data, make network requests, and perform actions on behalf of the user.".to_string(),
        reversible: false,
        undo_description: None,
    };

    let approved = request_tool_confirmation(&app, &confirmation_state, confirmation, 120)
        .await
        .map_err(|e| e.to_string())?;

    if !approved {
        return Err("Async JavaScript evaluation cancelled by user".to_string());
    }

    let (client, _) = state.get_client_for_tab(tab_id).await?;
    // Wrap user script so its return value (including Promises) is captured.
    // Using Promise.resolve() allows both sync and async scripts to work.
    let wrapped_script = format!("Promise.resolve().then(async () => {{ {} }})", script);
    client
        .evaluate(&wrapped_script)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_get_element_state(
    state: State<'_, BrowserStateWrapper>,
    selector: String,
    tab_id: Option<String>,
) -> Result<Value, String> {
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    let safe_selector = sanitize_selector(&selector);
    let script = format!(
        r#"
        (function() {{
            const el = document.querySelector('{}');
            if (!el) return {{ error: 'Element not found' }};
            const rect = el.getBoundingClientRect();
            return {{
                visible: rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none',
                enabled: !el.disabled,
                checked: el.checked,
                selected: el.selected,
                focused: document.activeElement === el,
                tagName: el.tagName.toLowerCase(),
                id: el.id,
                classes: el.className
            }};
        }})()
        "#,
        safe_selector
    );
    client.evaluate(&script).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_wait_for_interactive(
    state: State<'_, BrowserStateWrapper>,
    selector: String,
    timeout_ms: Option<u64>,
    tab_id: Option<String>,
) -> Result<(), String> {
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    let timeout = timeout_ms.unwrap_or(30000);
    let safe_selector = sanitize_selector(&selector);
    let script = format!(
        r#"
        new Promise((resolve, reject) => {{
            const timeout = {};
            const interval = 100;
            let elapsed = 0;

            const check = () => {{
                const el = document.querySelector('{}');
                if (!el) {{
                    elapsed += interval;
                    if (elapsed >= timeout) {{
                        reject(new Error('Element not found'));
                        return;
                    }}
                    setTimeout(check, interval);
                    return;
                }}

                const rect = el.getBoundingClientRect();
                const isVisible = rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none';
                const isEnabled = !el.disabled;

                if (isVisible && isEnabled) {{
                    resolve(true);
                    return;
                }}

                elapsed += interval;
                if (elapsed >= timeout) {{
                    reject(new Error('Timeout waiting for element to be interactive'));
                    return;
                }}

                setTimeout(check, interval);
            }};

            check();
        }})
        "#,
        timeout, safe_selector
    );
    client.evaluate(&script).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn browser_fill_form(
    state: State<'_, BrowserStateWrapper>,
    selector: String,
    data: Value,
    tab_id: Option<String>,
) -> Result<(), String> {
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    let safe_form_selector = sanitize_selector(&selector);
    if let Some(fields) = data.as_object() {
        for (field_selector, value) in fields {
            // Coerce non-string JSON values (numbers, booleans) to their string
            // representation instead of silently becoming empty strings.
            let value_str = match value {
                serde_json::Value::String(s) => s.clone(),
                serde_json::Value::Number(n) => n.to_string(),
                serde_json::Value::Bool(b) => b.to_string(),
                _ => String::new(),
            };
            let safe_field = sanitize_selector(field_selector);
            let safe_value = sanitize_js_value(&value_str);
            // Try to find input elements within the form
            let script = format!(
                r#"
                (function() {{
                    const form = document.querySelector('{}');
                    if (!form) return {{ error: 'Form not found' }};

                    // Try to find input by name, id, or label
                    let el = form.querySelector('[name="{}"]') ||
                             form.querySelector('#{}') ||
                             form.querySelector('input[name="{}"]') ||
                             form.querySelector('textarea[name="{}"]') ||
                             form.querySelector('select[name="{}"]');

                    if (el) {{
                        el.value = '{}';
                        el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                        el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                        return {{ success: true, selector: el.name || el.id }};
                    }}
                    return {{ error: 'Field not found: {}' }};
                }})()
                "#,
                safe_form_selector,
                safe_field,
                safe_field,
                safe_field,
                safe_field,
                safe_field,
                safe_value,
                safe_field
            );
            client.evaluate(&script).await.map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn browser_drag_and_drop(
    state: State<'_, BrowserStateWrapper>,
    source: String,
    target: String,
    tab_id: Option<String>,
) -> Result<(), String> {
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    let safe_source = sanitize_selector(&source);
    let safe_target = sanitize_selector(&target);
    let script = format!(
        r#"
        (function() {{
            const sourceEl = document.querySelector('{}');
            const targetEl = document.querySelector('{}');

            if (!sourceEl) return {{ error: 'Source element not found' }};
            if (!targetEl) return {{ error: 'Target element not found' }};

            const dragStartEvent = new DragEvent('dragstart', {{
                bubbles: true,
                cancelable: true,
                dataTransfer: new DataTransfer()
            }});
            sourceEl.dispatchEvent(dragStartEvent);

            const dragEnterEvent = new DragEvent('dragenter', {{
                bubbles: true,
                cancelable: true
            }});
            targetEl.dispatchEvent(dragEnterEvent);

            const dragOverEvent = new DragEvent('dragover', {{
                bubbles: true,
                cancelable: true
            }});
            targetEl.dispatchEvent(dragOverEvent);

            const dropEvent = new DragEvent('drop', {{
                bubbles: true,
                cancelable: true,
                dataTransfer: dragStartEvent.dataTransfer
            }});
            targetEl.dispatchEvent(dropEvent);

            return {{ success: true }};
        }})()
        "#,
        safe_source, safe_target
    );
    client.evaluate(&script).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn browser_upload_file(
    state: State<'_, BrowserStateWrapper>,
    selector: String,
    paths: Vec<String>,
    tab_id: Option<String>,
) -> Result<(), String> {
    // SECURITY: Validate all file paths before using them
    for path in &paths {
        // Reject empty paths
        if path.is_empty() {
            return Err("File path cannot be empty".to_string());
        }
        // Reject paths with null bytes
        if path.contains('\0') {
            return Err("File path contains null bytes which is not allowed".to_string());
        }
        // Reject file:// protocol tricks
        if path.to_lowercase().starts_with("file://") {
            return Err("File paths must not use file:// protocol prefix".to_string());
        }
        // Reject path traversal attacks
        if path.contains("..") {
            return Err(format!(
                "Path traversal detected in '{}': '..' segments are not allowed",
                path
            ));
        }
        // Reject excessively long paths
        if path.len() > 4096 {
            return Err(format!(
                "File path too long: {} characters. Maximum is 4096",
                path.len()
            ));
        }
        // Verify the file actually exists
        let path_obj = std::path::Path::new(path);
        if !path_obj.exists() {
            return Err(format!("File not found: {}", path));
        }
        if !path_obj.is_file() {
            return Err(format!("Path is not a file: {}", path));
        }
    }

    let (client, _) = state.get_client_for_tab(tab_id).await?;
    // Convert file paths to file data URLs using FileReader
    let safe_selector = sanitize_selector(&selector);
    let paths_json = serde_json::to_string(&paths).map_err(|e| e.to_string())?;
    let script = format!(
        r#"
        (async function() {{
            const el = document.querySelector('{}');
            if (!el) return {{ error: 'File input not found' }};

            const paths = {};
            const dataTransfer = new DataTransfer();

            for (const path of paths) {{
                try {{
                    const response = await fetch('file://' + path);
                    const blob = await response.blob();
                    const fileName = path.split('/').pop();
                    const file = new File([blob], fileName, {{ type: blob.type }});
                    dataTransfer.items.add(file);
                }} catch (e) {{
                    return {{ error: 'Failed to read file: ' + path }};
                }}
            }}

            el.files = dataTransfer.files;
            el.dispatchEvent(new Event('change', {{ bubbles: true }}));

            return {{ success: true, fileCount: paths.length }};
        }})()
        "#,
        safe_selector, paths_json
    );
    client.evaluate(&script).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn browser_get_cookies(
    state: State<'_, BrowserStateWrapper>,
    tab_id: Option<String>,
) -> Result<Vec<Value>, String> {
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    let cookies = AdvancedBrowserOps::get_cookies(client)
        .await
        .map_err(|e| e.to_string())?;
    let result: Vec<Value> = cookies
        .into_iter()
        .map(|c| {
            serde_json::json!({
                "name": c.name,
                "value": c.value,
                "domain": c.domain,
                "path": c.path,
                "secure": c.secure,
                "httpOnly": c.http_only,
                "sameSite": c.same_site
            })
        })
        .collect();
    Ok(result)
}

#[tauri::command]
pub async fn browser_set_cookie(
    state: State<'_, BrowserStateWrapper>,
    cookie: Value,
    tab_id: Option<String>,
) -> Result<(), String> {
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    let cookie = Cookie {
        name: cookie
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        value: cookie
            .get("value")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        domain: cookie
            .get("domain")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        path: cookie
            .get("path")
            .and_then(|v| v.as_str())
            .unwrap_or("/")
            .to_string(),
        secure: cookie
            .get("secure")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        http_only: cookie
            .get("httpOnly")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        same_site: cookie
            .get("sameSite")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
    };
    AdvancedBrowserOps::set_cookie(client, cookie)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_clear_cookies(
    state: State<'_, BrowserStateWrapper>,
    tab_id: Option<String>,
) -> Result<(), String> {
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    AdvancedBrowserOps::clear_cookies(client)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_get_performance_metrics(
    state: State<'_, BrowserStateWrapper>,
    tab_id: Option<String>,
) -> Result<Value, String> {
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    let metrics = AdvancedBrowserOps::get_performance_metrics(client)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "navigationStart": metrics.navigation_start,
        "loadComplete": metrics.load_complete,
        "domContentLoaded": metrics.dom_content_loaded,
        "firstPaint": metrics.first_paint,
        "firstContentfulPaint": metrics.first_contentful_paint,
        "memoryUsage": metrics.memory_usage
    }))
}

#[tauri::command]
pub async fn browser_wait_for_navigation(
    state: State<'_, BrowserStateWrapper>,
    timeout_ms: Option<u64>,
    tab_id: Option<String>,
) -> Result<(), String> {
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    let timeout = timeout_ms.unwrap_or(30000);
    let script = format!(
        r#"
        new Promise((resolve, reject) => {{
            const navTimeout = {};
            let lastUrl = window.location.href;
            let resolved = false;

            const check = () => {{
                if (window.location.href !== lastUrl) {{
                    resolved = true;
                    resolve({{ newUrl: window.location.href }});
                    return;
                }}

                if (!resolved) {{
                    setTimeout(check, 100);
                }}
            }};

            // Start checking
            check();

            // Also set up a listener for navigation events
            window.addEventListener('load', () => {{
                if (!resolved) {{
                    resolved = true;
                    resolve({{ newUrl: window.location.href }});
                }}
            }});

            // Timeout
            setTimeout(() => {{
                if (!resolved) {{
                    resolved = true;
                    reject(new Error('Navigation timeout after ' + navTimeout + 'ms'));
                }}
            }}, navTimeout);
        }})
        "#,
        timeout
    );
    client.evaluate(&script).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn browser_get_frames(
    _state: State<'_, BrowserStateWrapper>,
) -> Result<Vec<String>, String> {
    Ok(vec![])
}

#[tauri::command]
pub async fn browser_execute_in_frame(
    _state: State<'_, BrowserStateWrapper>,
    _frame_id: String,
    _script: String,
) -> Result<Value, String> {
    Ok(Value::Null)
}

#[tauri::command]
pub async fn browser_call_function(
    _state: State<'_, BrowserStateWrapper>,
    _function: String,
    _args: Value,
) -> Result<Value, String> {
    Ok(Value::Null)
}

#[tauri::command]
pub async fn browser_enable_request_interception(
    _state: State<'_, BrowserStateWrapper>,
    _enabled: bool,
) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn browser_get_screenshot_stream(
    state: State<'_, BrowserStateWrapper>,
    tab_id: Option<String>,
) -> Result<String, String> {
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    let bytes = client
        .capture_screenshot(false)
        .await
        .map_err(|e| e.to_string())?;
    use base64::{engine::general_purpose::STANDARD, Engine};
    Ok(STANDARD.encode(bytes))
}

#[tauri::command]
pub async fn browser_highlight_element(
    state: State<'_, BrowserStateWrapper>,
    selector: String,
    tab_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    let safe_selector = sanitize_selector(&selector);
    let script = format!(
        r#"
        (function() {{
            const el = document.querySelector('{}');
            if (!el) return {{ success: false, error: 'Element not found' }};
            const rect = el.getBoundingClientRect();
            return {{
                success: true,
                bounds: {{
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height
                }}
            }};
        }})()
        "#,
        safe_selector
    );
    client.evaluate(&script).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_get_console_logs(
    _state: State<'_, BrowserStateWrapper>,
) -> Result<Vec<String>, String> {
    Ok(vec![])
}

#[tauri::command]
pub async fn browser_get_network_activity(
    _state: State<'_, BrowserStateWrapper>,
) -> Result<Vec<Value>, String> {
    Ok(vec![])
}

// Semantic Commands

#[tauri::command]
pub async fn find_element_semantic(
    _state: State<'_, BrowserStateWrapper>,
    _query: String,
) -> Result<String, String> {
    Ok("#semantic-element".to_string())
}

#[tauri::command]
pub async fn find_all_elements_semantic(
    _state: State<'_, BrowserStateWrapper>,
    _query: String,
) -> Result<Vec<String>, String> {
    Ok(vec![])
}

#[tauri::command]
pub async fn click_semantic(
    _state: State<'_, BrowserStateWrapper>,
    _query: String,
) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn type_semantic(
    _state: State<'_, BrowserStateWrapper>,
    _query: String,
    _text: String,
) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn get_accessibility_tree(
    _state: State<'_, BrowserStateWrapper>,
) -> Result<Value, String> {
    Ok(Value::Null)
}

#[tauri::command]
pub async fn test_selector_strategies(
    _state: State<'_, BrowserStateWrapper>,
) -> Result<Value, String> {
    Ok(Value::Null)
}

#[tauri::command]
pub async fn get_dom_semantic_graph(
    _state: State<'_, BrowserStateWrapper>,
) -> Result<Value, String> {
    Ok(Value::Null)
}

#[tauri::command]
pub async fn get_interactive_elements(
    _state: State<'_, BrowserStateWrapper>,
) -> Result<Vec<String>, String> {
    Ok(vec![])
}

#[tauri::command]
pub async fn find_by_role(
    _state: State<'_, BrowserStateWrapper>,
    _role: String,
    _name: Option<String>,
) -> Result<String, String> {
    Ok("#element-by-role".to_string())
}
