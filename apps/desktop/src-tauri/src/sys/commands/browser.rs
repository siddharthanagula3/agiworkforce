use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::State;

static BROWSER_ALREADY_TILED: AtomicBool = AtomicBool::new(false);

use crate::automation::browser::advanced::{AdvancedBrowserOps, Cookie};
use crate::automation::browser::dom_operations::{ClickOptions, DomOperations, TypeOptions};
use crate::automation::browser::playwright_bridge::{BrowserOptions, BrowserType, CdpEndpoint};
use crate::automation::browser::{
    AccessibilityAnalyzer, BrowserState, DOMSemanticGraph, FrameContext, SemanticElementFinder,
    TabInfo,
};
use crate::sys::commands::tool_confirmation::{request_tool_confirmation, ToolConfirmationState};
use crate::sys::security::tool_guard::{RiskLevel, ToolConfirmationRequest, ToolSafetyTier};

fn build_browser_script_confirmation_request(
    tool_name: &str,
    action_label: &str,
    script: &str,
    tab_id: &Option<String>,
    frame_id: Option<&str>,
    reason: &str,
) -> ToolConfirmationRequest {
    let mut parameters = serde_json::json!({
        "script": script,
        "tab_id": tab_id,
    });

    if let Some(frame_id) = frame_id {
        parameters["frame_id"] = serde_json::Value::String(frame_id.to_string());
    }

    ToolConfirmationRequest {
        request_id: uuid::Uuid::new_v4().to_string(),
        tool_name: tool_name.to_string(),
        tool_description: format!(
            "{action_label}: {}",
            if script.len() > 200 {
                format!("{}...", &script[..200])
            } else {
                script.to_string()
            }
        ),
        parameters,
        risk_level: RiskLevel::Critical,
        safety_tier: ToolSafetyTier::RequiresExplicitApproval,
        reason: reason.to_string(),
        reversible: false,
        undo_description: None,
    }
}

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

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrowserLaunchRequest {
    browser_type: Option<String>,
    headless: Option<bool>,
    profile_name: Option<String>,
    proxy: Option<String>,
    args: Option<Vec<String>>,
    user_data_dir: Option<String>,
    timeout: Option<u64>,
}

#[derive(Debug, PartialEq, Eq)]
enum TabResolution {
    Existing(String),
    CreateNew,
}

fn parse_browser_type(browser_type: Option<&str>) -> Result<BrowserType, String> {
    match browser_type
        .unwrap_or("chromium")
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "chromium" | "chrome" => Ok(BrowserType::Chromium),
        "firefox" => Ok(BrowserType::Firefox),
        "webkit" => Ok(BrowserType::Webkit),
        value => Err(format!("Unsupported browser type: {}", value)),
    }
}

fn resolve_profile_dir(profile_name: &str) -> Result<String, String> {
    let trimmed = profile_name.trim();
    if trimmed.is_empty() {
        return Err("Browser profile name cannot be empty".to_string());
    }

    if !trimmed
        .chars()
        .all(|char| char.is_ascii_alphanumeric() || char == '-' || char == '_')
    {
        return Err(format!(
            "Browser profile name '{}' contains unsupported characters",
            profile_name
        ));
    }

    let base_dir = dirs::data_dir()
        .ok_or_else(|| "Failed to resolve data directory for browser profile".to_string())?;

    Ok(base_dir
        .join("agiworkforce")
        .join("browser-profiles")
        .join(trimmed)
        .to_string_lossy()
        .to_string())
}

fn merge_browser_launch_request(
    browser_type: Option<String>,
    headless: Option<bool>,
    profile_name: Option<String>,
    proxy: Option<String>,
    options: Option<Value>,
) -> Result<BrowserLaunchRequest, String> {
    let mut request = options
        .map(serde_json::from_value::<BrowserLaunchRequest>)
        .transpose()
        .map_err(|error| format!("Invalid browser launch options: {}", error))?
        .unwrap_or_default();

    if browser_type.is_some() {
        request.browser_type = browser_type;
    }
    if headless.is_some() {
        request.headless = headless;
    }
    if profile_name.is_some() {
        request.profile_name = profile_name;
    }
    if proxy.is_some() {
        request.proxy = proxy;
    }

    Ok(request)
}

fn build_browser_launch_config(
    request: BrowserLaunchRequest,
) -> Result<(BrowserType, BrowserOptions), String> {
    let browser_type = parse_browser_type(request.browser_type.as_deref())?;

    let user_data_dir = if let Some(path) = request.user_data_dir {
        Some(path)
    } else if let Some(profile_name) = request.profile_name {
        Some(resolve_profile_dir(&profile_name)?)
    } else {
        None
    };

    Ok((
        browser_type,
        BrowserOptions {
            headless: request.headless.unwrap_or(false),
            user_data_dir,
            args: request.args.unwrap_or_default(),
            viewport: None,
            timeout: request.timeout.or(Some(30000)),
            proxy: request.proxy,
        },
    ))
}

fn resolve_browser_tab_selection(
    requested_tab_id: Option<&str>,
    tabs: &[TabInfo],
    allow_create: bool,
) -> Result<TabResolution, String> {
    if let Some(tab_id) = requested_tab_id {
        if tabs.iter().any(|tab| tab.id == tab_id) {
            return Ok(TabResolution::Existing(tab_id.to_string()));
        }

        return Err(format!("Tab not found: {}", tab_id));
    }

    if let Some(tab) = tabs.first() {
        return Ok(TabResolution::Existing(tab.id.clone()));
    }

    if allow_create {
        Ok(TabResolution::CreateNew)
    } else {
        Err("No browser tabs available. Please open a tab first.".to_string())
    }
}

fn normalize_upload_paths(paths: &[String]) -> Result<Vec<String>, String> {
    let mut normalized_paths = Vec::with_capacity(paths.len());

    for path in paths {
        if path.is_empty() {
            return Err("File path cannot be empty".to_string());
        }
        if path.contains('\0') {
            return Err("File path contains null bytes which is not allowed".to_string());
        }
        if path.to_lowercase().starts_with("file://") {
            return Err("File paths must not use file:// protocol prefix".to_string());
        }
        if path.contains("..") {
            return Err(format!(
                "Path traversal detected in '{}': '..' segments are not allowed",
                path
            ));
        }
        if path.len() > 4096 {
            return Err(format!(
                "File path too long: {} characters. Maximum is 4096",
                path.len()
            ));
        }

        let path_obj = std::path::Path::new(path);
        if !path_obj.exists() {
            return Err(format!("File not found: {}", path));
        }
        if !path_obj.is_file() {
            return Err(format!("Path is not a file: {}", path));
        }

        let canonical_path = std::fs::canonicalize(path_obj)
            .map_err(|error| format!("Failed to canonicalize file path '{}': {}", path, error))?;

        normalized_paths.push(canonical_path.to_string_lossy().to_string());
    }

    Ok(normalized_paths)
}

async fn browser_cdp_endpoint(browser_state: &BrowserState) -> CdpEndpoint {
    let bridge = browser_state.playwright.lock().await;
    bridge.endpoint()
}

#[derive(Debug, Deserialize, Serialize)]
struct SemanticScriptElementInfo {
    selector: String,
    role: Option<String>,
    name: Option<String>,
    text: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
struct SemanticScriptResult {
    strategy: String,
    found: bool,
    element_info: Option<SemanticScriptElementInfo>,
    error: Option<String>,
}

fn first_found_semantic_selector(
    query: &str,
    results: &[SemanticScriptResult],
) -> Result<String, String> {
    results
        .iter()
        .find_map(|result| {
            if result.found {
                result
                    .element_info
                    .as_ref()
                    .map(|element| element.selector.clone())
            } else {
                None
            }
        })
        .ok_or_else(|| {
            let attempted = results
                .iter()
                .map(|result| {
                    if let Some(error) = &result.error {
                        format!("{} ({})", result.strategy, error)
                    } else {
                        result.strategy.clone()
                    }
                })
                .collect::<Vec<_>>()
                .join(", ");

            if attempted.is_empty() {
                format!("No semantic element matched query '{}'", query)
            } else {
                format!(
                    "No semantic element matched query '{}'. Strategies tried: {}",
                    query, attempted
                )
            }
        })
}

async fn evaluate_semantic_query(
    state: &BrowserStateWrapper,
    query: &str,
    tab_id: Option<String>,
) -> Result<Vec<SemanticScriptResult>, String> {
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    let selector = SemanticElementFinder::from_natural_language(query);
    let script = SemanticElementFinder::test_strategies_script(&selector);
    let result = client.evaluate(&script).await.map_err(|e| e.to_string())?;
    serde_json::from_value(result)
        .map_err(|error| format!("Failed to parse semantic selector results: {}", error))
}

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

    async fn get_cdp_endpoint(&self) -> Result<CdpEndpoint, String> {
        let state = self.get()?;
        let bridge = state.playwright.lock().await;
        Ok(bridge.endpoint())
    }

    pub async fn create_cdp_tab(&self, url: &str) -> Result<String, String> {
        let state = self.get()?;
        let endpoint = self.get_cdp_endpoint().await?;
        let target = endpoint
            .create_target(url)
            .await
            .map_err(|e| format!("Failed to create browser target: {}", e))?;

        state
            .tab_manager
            .lock()
            .await
            .register_tab(&target.id, url)
            .await
            .map_err(|e| e.to_string())?;

        Ok(target.id)
    }

    pub async fn resolve_cdp_tab(
        &self,
        requested_tab_id: Option<&str>,
        allow_create: bool,
        create_url: Option<&str>,
    ) -> Result<String, String> {
        let tab_manager = self.get_tab_manager()?;
        let tabs = tab_manager
            .lock()
            .await
            .list_tabs()
            .await
            .map_err(|e| e.to_string())?;

        match resolve_browser_tab_selection(requested_tab_id, &tabs, allow_create)? {
            TabResolution::Existing(tab_id) => Ok(tab_id),
            TabResolution::CreateNew => {
                self.create_cdp_tab(create_url.unwrap_or("about:blank"))
                    .await
            }
        }
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
    browser_type: Option<String>,
    headless: Option<bool>,
    profile_name: Option<String>,
    proxy: Option<String>,
    options: Option<Value>,
) -> Result<String, String> {
    let browser_state = state.get()?;
    let launch_request =
        merge_browser_launch_request(browser_type, headless, profile_name, proxy, options)?;
    let (browser_type, browser_options) = build_browser_launch_config(launch_request)?;

    let handle = browser_state
        .playwright
        .lock()
        .await
        .launch_browser(browser_type, browser_options)
        .await
        .map_err(|e| e.to_string())?;

    Ok(handle.id)
}

#[tauri::command]
pub async fn browser_open_tab(
    state: State<'_, BrowserStateWrapper>,
    url: Option<String>,
) -> Result<String, String> {
    let target_url = url.unwrap_or_else(|| "about:blank".to_string());
    state.create_cdp_tab(&target_url).await
}

#[tauri::command]
pub async fn browser_close(
    state: State<'_, BrowserStateWrapper>,
    browser_id: String,
) -> Result<(), String> {
    if browser_id.trim().is_empty() {
        return Err("Browser id is required".to_string());
    }

    let browser_state = state.get()?;
    browser_state
        .playwright
        .lock()
        .await
        .close_browser_by_id(&browser_id)
        .await
        .map_err(|e| e.to_string())?;

    BROWSER_ALREADY_TILED.store(false, Ordering::Relaxed);
    Ok(())
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

    let endpoint = browser_cdp_endpoint(browser_state).await;
    if let Err(error) = endpoint.close_target(&id).await {
        tracing::warn!(
            "Failed to close browser tab {} via CDP on port {}: {}",
            id,
            endpoint.port(),
            error
        );
    }

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
) -> Result<Vec<TabInfo>, String> {
    let tab_manager = state.get_tab_manager()?;
    tab_manager
        .lock()
        .await
        .list_tabs()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_navigate(
    app: tauri::AppHandle,
    state: State<'_, BrowserStateWrapper>,
    url: String,
    tab_id: Option<String>,
) -> Result<(), String> {
    let target_tab_id = state
        .resolve_cdp_tab(tab_id.as_deref(), true, Some(&url))
        .await?;

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
    let confirmation = build_browser_script_confirmation_request(
        "browser_evaluate",
        "Execute JavaScript in the browser",
        &script,
        &tab_id,
        None,
        "Arbitrary JavaScript evaluation can access page data, cookies, and perform actions on behalf of the user.",
    );

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
    let confirmation = build_browser_script_confirmation_request(
        "browser_execute_async_js",
        "Execute async JavaScript in the browser",
        &script,
        &tab_id,
        None,
        "Arbitrary async JavaScript evaluation can access page data, make network requests, and perform actions on behalf of the user.",
    );

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
    let normalized_paths = normalize_upload_paths(&paths)?;
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    AdvancedBrowserOps::upload_files(client, &selector, &normalized_paths)
        .await
        .map_err(|e| e.to_string())
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
    state: State<'_, BrowserStateWrapper>,
    tab_id: Option<String>,
) -> Result<Vec<FrameContext>, String> {
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    AdvancedBrowserOps::get_frames(client)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_execute_in_frame(
    app: tauri::AppHandle,
    state: State<'_, BrowserStateWrapper>,
    confirmation_state: State<'_, ToolConfirmationState>,
    frame_id: String,
    script: String,
    tab_id: Option<String>,
) -> Result<Value, String> {
    let confirmation = build_browser_script_confirmation_request(
        "browser_execute_in_frame",
        "Execute JavaScript in a browser frame",
        &script,
        &tab_id,
        Some(&frame_id),
        "Frame-scoped JavaScript evaluation can access embedded page data and perform actions on behalf of the user.",
    );

    let approved = request_tool_confirmation(&app, &confirmation_state, confirmation, 120)
        .await
        .map_err(|e| e.to_string())?;

    if !approved {
        return Err("Frame JavaScript evaluation cancelled by user".to_string());
    }

    let (client, _) = state.get_client_for_tab(tab_id).await?;
    AdvancedBrowserOps::execute_in_frame(client, &frame_id, &script)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_call_function(
    state: State<'_, BrowserStateWrapper>,
    function_name: String,
    args: Value,
    tab_id: Option<String>,
) -> Result<Value, String> {
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    let arguments = match args {
        Value::Array(values) => values,
        Value::Null => Vec::new(),
        other => vec![other],
    };

    AdvancedBrowserOps::call_function(client, &function_name, arguments)
        .await
        .map_err(|e| e.to_string())
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

// Semantic Commands

#[tauri::command]
pub async fn find_element_semantic(
    state: State<'_, BrowserStateWrapper>,
    query: String,
    tab_id: Option<String>,
) -> Result<String, String> {
    let results = evaluate_semantic_query(&state, &query, tab_id).await?;
    first_found_semantic_selector(&query, &results)
}

#[tauri::command]
pub async fn find_all_elements_semantic(
    state: State<'_, BrowserStateWrapper>,
    query: String,
    tab_id: Option<String>,
) -> Result<Vec<String>, String> {
    let results = evaluate_semantic_query(&state, &query, tab_id).await?;
    let selectors = results
        .into_iter()
        .filter(|result| result.found)
        .filter_map(|result| result.element_info.map(|element| element.selector))
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();

    if selectors.is_empty() {
        Err(format!("No semantic elements matched query '{}'", query))
    } else {
        Ok(selectors)
    }
}

#[tauri::command]
pub async fn click_semantic(
    state: State<'_, BrowserStateWrapper>,
    query: String,
    tab_id: Option<String>,
) -> Result<(), String> {
    let results = evaluate_semantic_query(&state, &query, tab_id.clone()).await?;
    let selector = first_found_semantic_selector(&query, &results)?;
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    DomOperations::click(&client, &selector, ClickOptions::default())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn type_semantic(
    state: State<'_, BrowserStateWrapper>,
    query: String,
    text: String,
    tab_id: Option<String>,
) -> Result<(), String> {
    let results = evaluate_semantic_query(&state, &query, tab_id.clone()).await?;
    let selector = first_found_semantic_selector(&query, &results)?;
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    DomOperations::type_text(&client, &selector, &text, TypeOptions::default())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_accessibility_tree(
    state: State<'_, BrowserStateWrapper>,
    tab_id: Option<String>,
) -> Result<Value, String> {
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    client
        .evaluate(AccessibilityAnalyzer::get_accessibility_tree_script())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn test_selector_strategies(
    state: State<'_, BrowserStateWrapper>,
    query: String,
    tab_id: Option<String>,
) -> Result<Value, String> {
    let results = evaluate_semantic_query(&state, &query, tab_id).await?;
    serde_json::to_value(results)
        .map_err(|error| format!("Failed to serialize semantic selector results: {}", error))
}

#[tauri::command]
pub async fn get_dom_semantic_graph(
    state: State<'_, BrowserStateWrapper>,
    tab_id: Option<String>,
) -> Result<Value, String> {
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    client
        .evaluate(DOMSemanticGraph::build_graph_script())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_interactive_elements(
    state: State<'_, BrowserStateWrapper>,
    tab_id: Option<String>,
) -> Result<Vec<String>, String> {
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    let result = client
        .evaluate(AccessibilityAnalyzer::get_interactive_elements_script())
        .await
        .map_err(|e| e.to_string())?;

    let selectors = result
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|entry| {
            entry
                .get("selector")
                .and_then(Value::as_str)
                .map(|value| value.to_string())
        })
        .collect::<Vec<_>>();

    Ok(selectors)
}

#[tauri::command]
pub async fn find_by_role(
    state: State<'_, BrowserStateWrapper>,
    role: String,
    name: Option<String>,
    tab_id: Option<String>,
) -> Result<String, String> {
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    let script = AccessibilityAnalyzer::find_by_role_script(&role, name.as_deref());
    let result = client.evaluate(&script).await.map_err(|e| e.to_string())?;

    result
        .as_array()
        .and_then(|entries| entries.first())
        .and_then(|entry| entry.get("selector"))
        .and_then(Value::as_str)
        .map(|selector| selector.to_string())
        .ok_or_else(|| format!("No element found for role '{}'", role))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use uuid::Uuid;

    #[test]
    fn parse_browser_type_accepts_live_frontend_values() {
        assert!(matches!(
            parse_browser_type(Some("Chromium")),
            Ok(BrowserType::Chromium)
        ));
        assert!(matches!(
            parse_browser_type(Some("Firefox")),
            Ok(BrowserType::Firefox)
        ));
        assert!(matches!(
            parse_browser_type(Some("Webkit")),
            Ok(BrowserType::Webkit)
        ));
    }

    #[test]
    fn merge_browser_launch_request_prefers_explicit_fields() {
        let request = merge_browser_launch_request(
            Some("Firefox".to_string()),
            Some(true),
            None,
            Some("http://proxy.local".to_string()),
            Some(serde_json::json!({
                "browserType": "Chromium",
                "headless": false,
                "timeout": 1234
            })),
        )
        .expect("launch request should merge");

        assert_eq!(request.browser_type.as_deref(), Some("Firefox"));
        assert_eq!(request.headless, Some(true));
        assert_eq!(request.timeout, Some(1234));
        assert_eq!(request.proxy.as_deref(), Some("http://proxy.local"));
    }

    #[test]
    fn build_browser_launch_config_maps_profile_name_to_app_data_dir() {
        let (browser_type, options) = build_browser_launch_config(BrowserLaunchRequest {
            browser_type: Some("chromium".to_string()),
            headless: Some(true),
            profile_name: Some("work_profile".to_string()),
            proxy: None,
            args: Some(vec!["--disable-gpu".to_string()]),
            user_data_dir: None,
            timeout: Some(5000),
        })
        .expect("browser config should be valid");

        assert!(matches!(browser_type, BrowserType::Chromium));
        assert!(options.headless);
        assert_eq!(options.timeout, Some(5000));
        assert_eq!(options.args, vec!["--disable-gpu".to_string()]);
        assert!(options
            .user_data_dir
            .as_deref()
            .unwrap_or_default()
            .contains("work_profile"));
    }

    #[test]
    fn resolve_browser_tab_selection_creates_when_empty_and_allowed() {
        let selection = resolve_browser_tab_selection(None, &[], true).expect("selection");
        assert_eq!(selection, TabResolution::CreateNew);
    }

    #[test]
    fn resolve_browser_tab_selection_returns_existing_tab() {
        let tabs = vec![TabInfo {
            id: "tab-1".to_string(),
            url: "https://example.com".to_string(),
            title: "Example".to_string(),
            favicon: None,
            loading: false,
            created_at: 1,
        }];

        let selection = resolve_browser_tab_selection(None, &tabs, true).expect("selection");
        assert_eq!(selection, TabResolution::Existing("tab-1".to_string()));
    }

    #[test]
    fn normalize_upload_paths_rejects_file_protocol_prefix() {
        let error = normalize_upload_paths(&["file:///tmp/test.txt".to_string()]).unwrap_err();
        assert!(error.contains("file:// protocol prefix"));
    }

    #[test]
    fn normalize_upload_paths_canonicalizes_existing_files() {
        let temp_dir = std::env::temp_dir().join(format!("agi-upload-{}", Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).expect("create temp directory");
        let nested_dir = temp_dir.join("nested");
        fs::create_dir_all(&nested_dir).expect("create nested directory");
        let file_path = nested_dir.join("sample.txt");
        fs::write(&file_path, "upload").expect("write temp file");

        let normalized = normalize_upload_paths(&[file_path.to_string_lossy().to_string()])
            .expect("normalize upload path");
        let expected = fs::canonicalize(&file_path)
            .expect("canonicalize temp file")
            .to_string_lossy()
            .to_string();

        assert_eq!(normalized, vec![expected]);

        let _ = fs::remove_file(&file_path);
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn build_browser_script_confirmation_request_includes_frame_context() {
        let request = build_browser_script_confirmation_request(
            "browser_execute_in_frame",
            "Execute JavaScript in a browser frame",
            "return 1;",
            &Some("tab-1".to_string()),
            Some("frame-7"),
            "reason",
        );

        assert_eq!(request.tool_name, "browser_execute_in_frame");
        assert_eq!(
            request.parameters.get("frame_id").and_then(Value::as_str),
            Some("frame-7")
        );
        assert_eq!(
            request.parameters.get("tab_id").and_then(Value::as_str),
            Some("tab-1")
        );
    }

    #[test]
    fn first_found_semantic_selector_returns_first_matching_selector() {
        let results = vec![
            SemanticScriptResult {
                strategy: "Text(\"missing\")".to_string(),
                found: false,
                element_info: None,
                error: None,
            },
            SemanticScriptResult {
                strategy: "AriaLabel(\"submit\")".to_string(),
                found: true,
                element_info: Some(SemanticScriptElementInfo {
                    selector: "#submit-button".to_string(),
                    role: Some("button".to_string()),
                    name: Some("Submit".to_string()),
                    text: Some("Submit".to_string()),
                }),
                error: None,
            },
        ];

        let selector = first_found_semantic_selector("submit button", &results)
            .expect("semantic selector should resolve");
        assert_eq!(selector, "#submit-button");
    }

    #[test]
    fn first_found_semantic_selector_reports_attempted_strategies() {
        let results = vec![SemanticScriptResult {
            strategy: "Text(\"missing\")".to_string(),
            found: false,
            element_info: None,
            error: Some("no match".to_string()),
        }];

        let error = first_found_semantic_selector("missing button", &results).unwrap_err();
        assert!(error.contains("missing button"));
        assert!(error.contains("Text(\"missing\")"));
    }
}
