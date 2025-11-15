use std::sync::Arc;
use tauri::async_runtime::block_on;
use tauri::State;
use tokio::sync::Mutex;

use crate::browser::advanced::Cookie;
use crate::browser::{
    AdvancedBrowserOps, BrowserOptions, BrowserState, BrowserType, ClickOptions, DomOperations,
    ElementState, ExecuteOptions, FormField, ImageFormat, NavigationOptions, ScreenshotOptions,
    TypeOptions,
};

/// Browser state wrapper for Tauri
pub struct BrowserStateWrapper(pub Arc<Mutex<BrowserState>>);

impl Default for BrowserStateWrapper {
    fn default() -> Self {
        Self::new()
    }
}

impl BrowserStateWrapper {
    pub fn new() -> Self {
        let initial_state =
            block_on(BrowserState::new()).expect("Failed to initialize browser automation state");
        Self(Arc::new(Mutex::new(initial_state)))
    }
}

/// Initialize browser automation system
#[tauri::command]
pub async fn browser_init(state: State<'_, BrowserStateWrapper>) -> Result<String, String> {
    tracing::info!("Initializing browser automation");

    match BrowserState::new().await {
        Ok(browser_state) => {
            *state.inner().lock().await = browser_state;
            Ok("Browser automation initialized".to_string())
        }
        Err(e) => Err(format!("Failed to initialize browser automation: {}", e)),
    }
}

/// Launch a browser
#[tauri::command]
pub async fn browser_launch(
    browser_type: String,
    headless: bool,
    state: State<'_, BrowserStateWrapper>,
) -> Result<String, String> {
    tracing::info!(
        "Launching {} browser (headless: {})",
        browser_type,
        headless
    );

    let browser_state = state.inner().lock().await;

    let browser_type_enum = match browser_type.to_lowercase().as_str() {
        "chromium" | "chrome" => BrowserType::Chromium,
        "firefox" => BrowserType::Firefox,
        "webkit" | "safari" => BrowserType::Webkit,
        _ => return Err(format!("Unsupported browser type: {}", browser_type)),
    };

    let options = BrowserOptions {
        headless,
        ..Default::default()
    };

    let playwright = browser_state.playwright.lock().await;

    match playwright.launch_browser(browser_type_enum, options).await {
        Ok(handle) => {
            tracing::info!("Browser launched with ID: {}", handle.id);
            Ok(handle.id)
        }
        Err(e) => Err(format!("Failed to launch browser: {}", e)),
    }
}

/// Open a new tab
#[tauri::command]
pub async fn browser_open_tab(
    url: String,
    state: State<'_, BrowserStateWrapper>,
) -> Result<String, String> {
    tracing::info!("Opening tab: {}", url);

    let browser_state = state.inner().lock().await;
    let tab_manager = browser_state.tab_manager.lock().await;

    match tab_manager.open_tab(&url).await {
        Ok(tab_id) => {
            tracing::info!("Tab opened with ID: {}", tab_id);
            Ok(tab_id)
        }
        Err(e) => Err(format!("Failed to open tab: {}", e)),
    }
}

/// Close a tab
#[tauri::command]
pub async fn browser_close_tab(
    tab_id: String,
    state: State<'_, BrowserStateWrapper>,
) -> Result<(), String> {
    tracing::info!("Closing tab: {}", tab_id);

    let browser_state = state.inner().lock().await;
    let tab_manager = browser_state.tab_manager.lock().await;

    tab_manager
        .close_tab(&tab_id)
        .await
        .map_err(|e| format!("Failed to close tab: {}", e))
}

/// List all open tabs
#[tauri::command]
pub async fn browser_list_tabs(
    state: State<'_, BrowserStateWrapper>,
) -> Result<Vec<serde_json::Value>, String> {
    tracing::info!("Listing all tabs");

    let browser_state = state.inner().lock().await;
    let tab_manager = browser_state.tab_manager.lock().await;

    match tab_manager.list_tabs().await {
        Ok(tabs) => {
            let tabs_json: Vec<serde_json::Value> = tabs
                .iter()
                .map(|tab| serde_json::to_value(tab).unwrap_or(serde_json::json!({})))
                .collect();
            Ok(tabs_json)
        }
        Err(e) => Err(format!("Failed to list tabs: {}", e)),
    }
}

/// Navigate to URL
#[tauri::command]
pub async fn browser_navigate(
    tab_id: String,
    url: String,
    state: State<'_, BrowserStateWrapper>,
) -> Result<(), String> {
    tracing::info!("Navigating tab {} to {}", tab_id, url);

    let browser_state = state.inner().lock().await;
    let tab_manager = browser_state.tab_manager.lock().await;

    let options = NavigationOptions::default();

    tab_manager
        .navigate(&tab_id, &url, options)
        .await
        .map_err(|e| format!("Failed to navigate: {}", e))
}

/// Go back
#[tauri::command]
pub async fn browser_go_back(
    tab_id: String,
    state: State<'_, BrowserStateWrapper>,
) -> Result<(), String> {
    tracing::info!("Going back in tab: {}", tab_id);

    let browser_state = state.inner().lock().await;
    let tab_manager = browser_state.tab_manager.lock().await;

    tab_manager
        .go_back(&tab_id)
        .await
        .map_err(|e| format!("Failed to go back: {}", e))
}

/// Go forward
#[tauri::command]
pub async fn browser_go_forward(
    tab_id: String,
    state: State<'_, BrowserStateWrapper>,
) -> Result<(), String> {
    tracing::info!("Going forward in tab: {}", tab_id);

    let browser_state = state.inner().lock().await;
    let tab_manager = browser_state.tab_manager.lock().await;

    tab_manager
        .go_forward(&tab_id)
        .await
        .map_err(|e| format!("Failed to go forward: {}", e))
}

/// Reload page
#[tauri::command]
pub async fn browser_reload(
    tab_id: String,
    state: State<'_, BrowserStateWrapper>,
) -> Result<(), String> {
    tracing::info!("Reloading tab: {}", tab_id);

    let browser_state = state.inner().lock().await;
    let tab_manager = browser_state.tab_manager.lock().await;

    tab_manager
        .reload(&tab_id)
        .await
        .map_err(|e| format!("Failed to reload: {}", e))
}

/// Get current URL
#[tauri::command]
pub async fn browser_get_url(
    tab_id: String,
    state: State<'_, BrowserStateWrapper>,
) -> Result<String, String> {
    let browser_state = state.inner().lock().await;
    let tab_manager = browser_state.tab_manager.lock().await;

    tab_manager
        .get_url(&tab_id)
        .await
        .map_err(|e| format!("Failed to get URL: {}", e))
}

/// Get page title
#[tauri::command]
pub async fn browser_get_title(
    tab_id: String,
    state: State<'_, BrowserStateWrapper>,
) -> Result<String, String> {
    let browser_state = state.inner().lock().await;
    let tab_manager = browser_state.tab_manager.lock().await;

    tab_manager
        .get_title(&tab_id)
        .await
        .map_err(|e| format!("Failed to get title: {}", e))
}

/// Click element
#[tauri::command]
pub async fn browser_click(
    tab_id: String,
    selector: String,
    state: State<'_, BrowserStateWrapper>,
) -> Result<(), String> {
    tracing::info!("Clicking element {} in tab {}", selector, tab_id);

    let browser_state = state.inner().lock().await;
    let cdp_client = browser_state
        .get_cdp_client(&tab_id)
        .await
        .map_err(|e| format!("Failed to get CDP client: {}", e))?;

    let options = ClickOptions::default();

    DomOperations::click_with_cdp(cdp_client, &selector, options)
        .await
        .map_err(|e| format!("Failed to click: {}", e))
}

/// Type text
#[tauri::command]
pub async fn browser_type(
    tab_id: String,
    selector: String,
    text: String,
    _state: State<'_, BrowserStateWrapper>,
) -> Result<(), String> {
    tracing::info!("Typing text into {} in tab {}", selector, tab_id);

    let options = TypeOptions::default();

    DomOperations::type_text(&tab_id, &selector, &text, options)
        .await
        .map_err(|e| format!("Failed to type: {}", e))
}

/// Get text content
#[tauri::command]
pub async fn browser_get_text(
    tab_id: String,
    selector: String,
    _state: State<'_, BrowserStateWrapper>,
) -> Result<String, String> {
    DomOperations::get_text(&tab_id, &selector)
        .await
        .map_err(|e| format!("Failed to get text: {}", e))
}

/// Get attribute
#[tauri::command]
pub async fn browser_get_attribute(
    tab_id: String,
    selector: String,
    attribute: String,
    _state: State<'_, BrowserStateWrapper>,
) -> Result<Option<String>, String> {
    DomOperations::get_attribute(&tab_id, &selector, &attribute)
        .await
        .map_err(|e| format!("Failed to get attribute: {}", e))
}

/// Wait for selector
#[tauri::command]
pub async fn browser_wait_for_selector(
    tab_id: String,
    selector: String,
    timeout_ms: u64,
    _state: State<'_, BrowserStateWrapper>,
) -> Result<(), String> {
    DomOperations::wait_for_selector(&tab_id, &selector, timeout_ms)
        .await
        .map_err(|e| format!("Failed to wait for selector: {}", e))
}

/// Select dropdown option
#[tauri::command]
pub async fn browser_select_option(
    tab_id: String,
    selector: String,
    value: String,
    _state: State<'_, BrowserStateWrapper>,
) -> Result<(), String> {
    DomOperations::select_option(&tab_id, &selector, &value)
        .await
        .map_err(|e| format!("Failed to select option: {}", e))
}

/// Check checkbox
#[tauri::command]
pub async fn browser_check(
    tab_id: String,
    selector: String,
    _state: State<'_, BrowserStateWrapper>,
) -> Result<(), String> {
    DomOperations::check(&tab_id, &selector)
        .await
        .map_err(|e| format!("Failed to check: {}", e))
}

/// Uncheck checkbox
#[tauri::command]
pub async fn browser_uncheck(
    tab_id: String,
    selector: String,
    _state: State<'_, BrowserStateWrapper>,
) -> Result<(), String> {
    DomOperations::uncheck(&tab_id, &selector)
        .await
        .map_err(|e| format!("Failed to uncheck: {}", e))
}

/// Take screenshot
#[tauri::command]
pub async fn browser_screenshot(
    tab_id: String,
    full_page: bool,
    state: State<'_, BrowserStateWrapper>,
) -> Result<String, String> {
    tracing::info!("Taking screenshot of tab: {}", tab_id);

    let browser_state = state.inner().lock().await;
    let tab_manager = browser_state.tab_manager.lock().await;

    let options = ScreenshotOptions {
        full_page,
        format: ImageFormat::Png,
        quality: Some(80),
    };

    match tab_manager.screenshot(&tab_id, options).await {
        Ok(path) => Ok(path.to_string_lossy().to_string()),
        Err(e) => Err(format!("Failed to take screenshot: {}", e)),
    }
}

/// Execute JavaScript
#[tauri::command]
pub async fn browser_evaluate(
    tab_id: String,
    script: String,
    _state: State<'_, BrowserStateWrapper>,
) -> Result<serde_json::Value, String> {
    DomOperations::evaluate(&tab_id, &script)
        .await
        .map_err(|e| format!("Failed to evaluate script: {}", e))
}

/// Hover over element
#[tauri::command]
pub async fn browser_hover(
    tab_id: String,
    selector: String,
    _state: State<'_, BrowserStateWrapper>,
) -> Result<(), String> {
    DomOperations::hover(&tab_id, &selector)
        .await
        .map_err(|e| format!("Failed to hover: {}", e))
}

/// Focus element
#[tauri::command]
pub async fn browser_focus(
    tab_id: String,
    selector: String,
    _state: State<'_, BrowserStateWrapper>,
) -> Result<(), String> {
    DomOperations::focus(&tab_id, &selector)
        .await
        .map_err(|e| format!("Failed to focus: {}", e))
}

/// Get all matching elements
#[tauri::command]
pub async fn browser_query_all(
    tab_id: String,
    selector: String,
    _state: State<'_, BrowserStateWrapper>,
) -> Result<Vec<serde_json::Value>, String> {
    match DomOperations::query_all(&tab_id, &selector).await {
        Ok(elements) => {
            let elements_json: Vec<serde_json::Value> = elements
                .iter()
                .map(|el| serde_json::to_value(el).unwrap_or(serde_json::json!({})))
                .collect();
            Ok(elements_json)
        }
        Err(e) => Err(format!("Failed to query elements: {}", e)),
    }
}

/// Scroll element into view
#[tauri::command]
pub async fn browser_scroll_into_view(
    tab_id: String,
    selector: String,
    _state: State<'_, BrowserStateWrapper>,
) -> Result<(), String> {
    DomOperations::scroll_into_view(&tab_id, &selector)
        .await
        .map_err(|e| format!("Failed to scroll into view: {}", e))
}

// ============================================================================
// ADVANCED BROWSER AUTOMATION COMMANDS
// ============================================================================

/// Execute async JavaScript with full promise support and retry logic
#[tauri::command]
pub async fn browser_execute_async_js(
    tab_id: String,
    script: String,
    args: Option<Vec<serde_json::Value>>,
    timeout_ms: Option<u64>,
    retry_count: Option<u32>,
    state: State<'_, BrowserStateWrapper>,
) -> Result<serde_json::Value, String> {
    tracing::info!("Executing async JS in tab: {}", tab_id);

    let browser_state = state.inner().lock().await;
    let cdp_client = browser_state
        .get_cdp_client(&tab_id)
        .await
        .map_err(|e| format!("Failed to get CDP client: {}", e))?;

    let options = ExecuteOptions {
        timeout_ms: timeout_ms.unwrap_or(30000),
        retry_count: retry_count.unwrap_or(3),
        ..Default::default()
    };

    AdvancedBrowserOps::execute_async_js(cdp_client, &script, args, options)
        .await
        .map_err(|e| format!("Failed to execute async JS: {}", e))
}

/// Get comprehensive element state (visibility, interactivity, bounds, styles)
#[tauri::command]
pub async fn browser_get_element_state(
    tab_id: String,
    selector: String,
    state: State<'_, BrowserStateWrapper>,
) -> Result<ElementState, String> {
    let browser_state = state.inner().lock().await;
    let cdp_client = browser_state
        .get_cdp_client(&tab_id)
        .await
        .map_err(|e| format!("Failed to get CDP client: {}", e))?;

    AdvancedBrowserOps::get_element_state(cdp_client, &selector)
        .await
        .map_err(|e| format!("Failed to get element state: {}", e))
}

/// Wait for element to be interactive (visible + enabled + clickable)
#[tauri::command]
pub async fn browser_wait_for_interactive(
    tab_id: String,
    selector: String,
    timeout_ms: u64,
    state: State<'_, BrowserStateWrapper>,
) -> Result<(), String> {
    tracing::info!("Waiting for element to be interactive: {}", selector);

    let browser_state = state.inner().lock().await;
    let cdp_client = browser_state
        .get_cdp_client(&tab_id)
        .await
        .map_err(|e| format!("Failed to get CDP client: {}", e))?;

    AdvancedBrowserOps::wait_for_interactive(cdp_client, &selector, timeout_ms)
        .await
        .map_err(|e| format!("Failed to wait for interactive: {}", e))
}

/// Fill entire form with multiple fields
#[tauri::command]
pub async fn browser_fill_form(
    tab_id: String,
    fields: Vec<FormField>,
    state: State<'_, BrowserStateWrapper>,
) -> Result<(), String> {
    tracing::info!("Filling form with {} fields", fields.len());

    let browser_state = state.inner().lock().await;
    let cdp_client = browser_state
        .get_cdp_client(&tab_id)
        .await
        .map_err(|e| format!("Failed to get CDP client: {}", e))?;

    AdvancedBrowserOps::fill_form(cdp_client, fields)
        .await
        .map_err(|e| format!("Failed to fill form: {}", e))
}

/// Drag and drop elements
#[tauri::command]
pub async fn browser_drag_and_drop(
    tab_id: String,
    source_selector: String,
    target_selector: String,
    state: State<'_, BrowserStateWrapper>,
) -> Result<(), String> {
    tracing::info!("Dragging {} to {}", source_selector, target_selector);

    let browser_state = state.inner().lock().await;
    let cdp_client = browser_state
        .get_cdp_client(&tab_id)
        .await
        .map_err(|e| format!("Failed to get CDP client: {}", e))?;

    AdvancedBrowserOps::drag_and_drop(cdp_client, &source_selector, &target_selector)
        .await
        .map_err(|e| format!("Failed to drag and drop: {}", e))
}

/// Upload file to file input
#[tauri::command]
pub async fn browser_upload_file(
    tab_id: String,
    selector: String,
    file_path: String,
    state: State<'_, BrowserStateWrapper>,
) -> Result<(), String> {
    tracing::info!("Uploading file {} to {}", file_path, selector);

    let browser_state = state.inner().lock().await;
    let cdp_client = browser_state
        .get_cdp_client(&tab_id)
        .await
        .map_err(|e| format!("Failed to get CDP client: {}", e))?;

    AdvancedBrowserOps::upload_file(cdp_client, &selector, &file_path)
        .await
        .map_err(|e| format!("Failed to upload file: {}", e))
}

/// Get all cookies
#[tauri::command]
pub async fn browser_get_cookies(
    tab_id: String,
    state: State<'_, BrowserStateWrapper>,
) -> Result<Vec<Cookie>, String> {
    let browser_state = state.inner().lock().await;
    let cdp_client = browser_state
        .get_cdp_client(&tab_id)
        .await
        .map_err(|e| format!("Failed to get CDP client: {}", e))?;

    AdvancedBrowserOps::get_cookies(cdp_client)
        .await
        .map_err(|e| format!("Failed to get cookies: {}", e))
}

/// Set cookie
#[tauri::command]
pub async fn browser_set_cookie(
    tab_id: String,
    cookie: Cookie,
    state: State<'_, BrowserStateWrapper>,
) -> Result<(), String> {
    let browser_state = state.inner().lock().await;
    let cdp_client = browser_state
        .get_cdp_client(&tab_id)
        .await
        .map_err(|e| format!("Failed to get CDP client: {}", e))?;

    AdvancedBrowserOps::set_cookie(cdp_client, cookie)
        .await
        .map_err(|e| format!("Failed to set cookie: {}", e))
}

/// Clear all cookies
#[tauri::command]
pub async fn browser_clear_cookies(
    tab_id: String,
    state: State<'_, BrowserStateWrapper>,
) -> Result<(), String> {
    let browser_state = state.inner().lock().await;
    let cdp_client = browser_state
        .get_cdp_client(&tab_id)
        .await
        .map_err(|e| format!("Failed to get CDP client: {}", e))?;

    AdvancedBrowserOps::clear_cookies(cdp_client)
        .await
        .map_err(|e| format!("Failed to clear cookies: {}", e))
}

/// Get performance metrics
#[tauri::command]
pub async fn browser_get_performance_metrics(
    tab_id: String,
    state: State<'_, BrowserStateWrapper>,
) -> Result<serde_json::Value, String> {
    let browser_state = state.inner().lock().await;
    let cdp_client = browser_state
        .get_cdp_client(&tab_id)
        .await
        .map_err(|e| format!("Failed to get CDP client: {}", e))?;

    let metrics = AdvancedBrowserOps::get_performance_metrics(cdp_client)
        .await
        .map_err(|e| format!("Failed to get performance metrics: {}", e))?;

    serde_json::to_value(&metrics).map_err(|e| format!("Failed to serialize metrics: {}", e))
}

/// Wait for navigation to complete
#[tauri::command]
pub async fn browser_wait_for_navigation(
    tab_id: String,
    timeout_ms: u64,
    state: State<'_, BrowserStateWrapper>,
) -> Result<String, String> {
    let browser_state = state.inner().lock().await;
    let cdp_client = browser_state
        .get_cdp_client(&tab_id)
        .await
        .map_err(|e| format!("Failed to get CDP client: {}", e))?;

    AdvancedBrowserOps::wait_for_navigation(cdp_client, timeout_ms)
        .await
        .map_err(|e| format!("Failed to wait for navigation: {}", e))
}

/// Get all frames in the page
#[tauri::command]
pub async fn browser_get_frames(
    tab_id: String,
    state: State<'_, BrowserStateWrapper>,
) -> Result<Vec<serde_json::Value>, String> {
    let browser_state = state.inner().lock().await;
    let cdp_client = browser_state
        .get_cdp_client(&tab_id)
        .await
        .map_err(|e| format!("Failed to get CDP client: {}", e))?;

    let frames = AdvancedBrowserOps::get_frames(cdp_client)
        .await
        .map_err(|e| format!("Failed to get frames: {}", e))?;

    frames
        .iter()
        .map(|f| serde_json::to_value(f).map_err(|e| format!("Failed to serialize frame: {}", e)))
        .collect()
}

/// Execute JavaScript in specific frame
#[tauri::command]
pub async fn browser_execute_in_frame(
    tab_id: String,
    frame_id: String,
    script: String,
    state: State<'_, BrowserStateWrapper>,
) -> Result<serde_json::Value, String> {
    let browser_state = state.inner().lock().await;
    let cdp_client = browser_state
        .get_cdp_client(&tab_id)
        .await
        .map_err(|e| format!("Failed to get CDP client: {}", e))?;

    AdvancedBrowserOps::execute_in_frame(cdp_client, &frame_id, &script)
        .await
        .map_err(|e| format!("Failed to execute in frame: {}", e))
}

/// Call window function with arguments
#[tauri::command]
pub async fn browser_call_function(
    tab_id: String,
    function_name: String,
    args: Vec<serde_json::Value>,
    state: State<'_, BrowserStateWrapper>,
) -> Result<serde_json::Value, String> {
    let browser_state = state.inner().lock().await;
    let cdp_client = browser_state
        .get_cdp_client(&tab_id)
        .await
        .map_err(|e| format!("Failed to get CDP client: {}", e))?;

    AdvancedBrowserOps::call_function(cdp_client, &function_name, args)
        .await
        .map_err(|e| format!("Failed to call function: {}", e))
}

/// Enable network request interception
#[tauri::command]
pub async fn browser_enable_request_interception(
    tab_id: String,
    state: State<'_, BrowserStateWrapper>,
) -> Result<(), String> {
    let browser_state = state.inner().lock().await;
    let cdp_client = browser_state
        .get_cdp_client(&tab_id)
        .await
        .map_err(|e| format!("Failed to get CDP client: {}", e))?;

    AdvancedBrowserOps::enable_request_interception(cdp_client)
        .await
        .map_err(|e| format!("Failed to enable request interception: {}", e))
}

// ============================================================================
// BROWSER VISUALIZATION COMMANDS
// ============================================================================

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElementBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DOMSnapshot {
    pub html: String,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsoleLog {
    pub level: String,
    pub message: String,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkRequest {
    pub url: String,
    pub method: String,
    pub status: u16,
    pub duration_ms: u64,
    pub timestamp: u64,
}

/// Get screenshot stream for live visualization (returns base64 PNG)
#[tauri::command]
pub async fn browser_get_screenshot_stream(
    tab_id: String,
    state: State<'_, BrowserStateWrapper>,
) -> Result<String, String> {
    tracing::debug!("Getting screenshot stream for tab: {}", tab_id);

    let browser_state = state.inner().lock().await;
    let tab_manager = browser_state.tab_manager.lock().await;

    let options = ScreenshotOptions {
        full_page: false,
        format: ImageFormat::Png,
        quality: Some(60), // Lower quality for streaming
    };

    match tab_manager.screenshot(&tab_id, options).await {
        Ok(path) => {
            // Read the screenshot file and convert to base64
            match std::fs::read(&path) {
                Ok(bytes) => {
                    use base64::Engine;
                    let base64_str = base64::engine::general_purpose::STANDARD.encode(&bytes);

                    // Clean up temp file
                    let _ = std::fs::remove_file(&path);

                    Ok(base64_str)
                }
                Err(e) => Err(format!("Failed to read screenshot file: {}", e)),
            }
        }
        Err(e) => Err(format!("Failed to capture screenshot: {}", e)),
    }
}

/// Highlight element and return its bounds
#[tauri::command]
pub async fn browser_highlight_element(
    tab_id: String,
    selector: String,
    state: State<'_, BrowserStateWrapper>,
) -> Result<ElementBounds, String> {
    tracing::info!("Highlighting element {} in tab {}", selector, tab_id);

    let browser_state = state.inner().lock().await;
    let cdp_client = browser_state
        .get_cdp_client(&tab_id)
        .await
        .map_err(|e| format!("Failed to get CDP client: {}", e))?;

    // Get element state (includes bounds)
    let _element_state = AdvancedBrowserOps::get_element_state(cdp_client.clone(), &selector)
        .await
        .map_err(|e| format!("Failed to get element state: {}", e))?;

    // Inject highlight overlay via JavaScript
    let highlight_script = format!(
        r#"
        (function() {{
            const element = document.querySelector('{}');
            if (!element) return null;

            const rect = element.getBoundingClientRect();

            // Create or update highlight overlay
            let overlay = document.getElementById('agi-highlight-overlay');
            if (!overlay) {{
                overlay = document.createElement('div');
                overlay.id = 'agi-highlight-overlay';
                overlay.style.position = 'fixed';
                overlay.style.border = '2px solid #facc15';
                overlay.style.backgroundColor = 'rgba(250, 204, 21, 0.1)';
                overlay.style.pointerEvents = 'none';
                overlay.style.zIndex = '999999';
                overlay.style.transition = 'all 0.2s ease-out';
                document.body.appendChild(overlay);
            }}

            overlay.style.left = rect.left + 'px';
            overlay.style.top = rect.top + 'px';
            overlay.style.width = rect.width + 'px';
            overlay.style.height = rect.height + 'px';

            return {{
                x: rect.left,
                y: rect.top,
                width: rect.width,
                height: rect.height
            }};
        }})()
        "#,
        selector
    );

    let result = DomOperations::evaluate(&tab_id, &highlight_script)
        .await
        .map_err(|e| format!("Failed to highlight element: {}", e))?;

    // Parse bounds from result
    if let Some(obj) = result.as_object() {
        let bounds = ElementBounds {
            x: obj.get("x").and_then(|v| v.as_f64()).unwrap_or(0.0),
            y: obj.get("y").and_then(|v| v.as_f64()).unwrap_or(0.0),
            width: obj.get("width").and_then(|v| v.as_f64()).unwrap_or(0.0),
            height: obj.get("height").and_then(|v| v.as_f64()).unwrap_or(0.0),
        };
        Ok(bounds)
    } else {
        Err("Element not found".to_string())
    }
}

/// Get DOM snapshot (HTML)
#[tauri::command]
pub async fn browser_get_dom_snapshot(
    tab_id: String,
    _state: State<'_, BrowserStateWrapper>,
) -> Result<DOMSnapshot, String> {
    tracing::info!("Getting DOM snapshot for tab: {}", tab_id);

    let script = "document.documentElement.outerHTML";
    let html = DomOperations::evaluate(&tab_id, script)
        .await
        .map_err(|e| format!("Failed to get DOM snapshot: {}", e))?;

    let html_string = html.as_str().unwrap_or("").to_string();

    Ok(DOMSnapshot {
        html: html_string,
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64,
    })
}

/// Get console logs from browser
#[tauri::command]
pub async fn browser_get_console_logs(
    tab_id: String,
    state: State<'_, BrowserStateWrapper>,
) -> Result<Vec<ConsoleLog>, String> {
    tracing::info!("Getting console logs for tab: {}", tab_id);

    let browser_state = state.inner().lock().await;
    let _cdp_client = browser_state
        .get_cdp_client(&tab_id)
        .await
        .map_err(|e| format!("Failed to get CDP client: {}", e))?;

    // Execute JavaScript to get console logs
    // Note: This is a simplified implementation. For production, you'd want to
    // capture console.log calls via CDP Runtime.consoleAPICalled events
    let script = r#"
        (function() {
            // Return any errors from the console
            if (window.__agiConsoleLogs) {
                return window.__agiConsoleLogs;
            }
            return [];
        })()
    "#;

    let _result = DomOperations::evaluate(&tab_id, script)
        .await
        .map_err(|e| format!("Failed to get console logs: {}", e))?;

    // Parse console logs from result
    let logs: Vec<ConsoleLog> = vec![];

    // For now, return empty array. Proper implementation would:
    // 1. Enable Runtime domain via CDP
    // 2. Listen to Runtime.consoleAPICalled events
    // 3. Store logs in browser state
    // 4. Return stored logs here

    Ok(logs)
}

/// Get network activity
#[tauri::command]
pub async fn browser_get_network_activity(
    tab_id: String,
    state: State<'_, BrowserStateWrapper>,
) -> Result<Vec<NetworkRequest>, String> {
    tracing::info!("Getting network activity for tab: {}", tab_id);

    let browser_state = state.inner().lock().await;
    let _cdp_client = browser_state
        .get_cdp_client(&tab_id)
        .await
        .map_err(|e| format!("Failed to get CDP client: {}", e))?;

    // Execute JavaScript to get network requests from Performance API
    let script = r#"
        (function() {
            const entries = performance.getEntriesByType('resource');
            return entries.map(entry => ({
                url: entry.name,
                method: 'GET', // Performance API doesn't provide method
                status: 200, // Performance API doesn't provide status
                duration_ms: Math.round(entry.duration),
                timestamp: Math.round(entry.startTime + performance.timeOrigin)
            }));
        })()
    "#;

    let result = DomOperations::evaluate(&tab_id, script)
        .await
        .map_err(|e| format!("Failed to get network activity: {}", e))?;

    // Parse network requests from result
    let requests: Vec<NetworkRequest> = if let Some(arr) = result.as_array() {
        arr.iter()
            .filter_map(|v| {
                let obj = v.as_object()?;
                Some(NetworkRequest {
                    url: obj.get("url")?.as_str()?.to_string(),
                    method: obj.get("method")?.as_str()?.to_string(),
                    status: obj.get("status")?.as_u64()? as u16,
                    duration_ms: obj.get("duration_ms")?.as_u64()?,
                    timestamp: obj.get("timestamp")?.as_u64()?,
                })
            })
            .collect()
    } else {
        vec![]
    };

    Ok(requests)
}

// ============================================================================
// SEMANTIC BROWSER AUTOMATION COMMANDS
// ============================================================================

use crate::browser::semantic::{
    AccessibilityAnalyzer, AccessibilityTree, DOMSemanticGraph, SelectorResult, SelfHealingFinder,
    SemanticElementFinder,
};
use crate::browser::ElementInfo;

/// Find element using semantic natural language selector
#[tauri::command]
pub async fn find_element_semantic(
    tab_id: String,
    query: String,
    _state: State<'_, BrowserStateWrapper>,
) -> Result<ElementInfo, String> {
    tracing::info!("Finding element with semantic query: {}", query);

    // Create semantic selector from natural language
    let selector = SemanticElementFinder::from_natural_language(&query);

    // Generate JavaScript to find element with self-healing
    let script = SelfHealingFinder::find_with_healing(&selector);

    // Execute script
    let result = DomOperations::evaluate(&tab_id, &script)
        .await
        .map_err(|e| format!("Failed to find element: {}", e))?;

    // Parse result
    if let Some(obj) = result.as_object() {
        if let Some(element) = obj.get("element") {
            if element.is_null() {
                return Err(format!("Element not found: {}", query));
            }

            let strategy = obj
                .get("strategy")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();

            // Get element details
            let details_script = format!(
                r#"
                (function() {{
                    const el = {};
                    if (!el) return null;
                    return {{
                        selector: el.id ? `#${{el.id}}` : el.className ? `.${{el.className.split(' ')[0]}}` : el.tagName.toLowerCase(),
                        role: el.getAttribute('role'),
                        name: el.getAttribute('aria-label') || el.textContent?.trim(),
                        text: el.textContent?.trim()
                    }};
                }})()
                "#,
                element
            );

            let details = DomOperations::evaluate(&tab_id, &details_script)
                .await
                .map_err(|e| format!("Failed to get element details: {}", e))?;

            if let Some(details_obj) = details.as_object() {
                return Ok(ElementInfo {
                    selector: details_obj
                        .get("selector")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    strategy,
                    role: details_obj
                        .get("role")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    name: details_obj
                        .get("name")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    text: details_obj
                        .get("text")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                });
            }
        }
    }

    Err(format!("Failed to parse element result for: {}", query))
}

/// Find all elements matching semantic query
#[tauri::command]
pub async fn find_all_elements_semantic(
    tab_id: String,
    query: String,
    _state: State<'_, BrowserStateWrapper>,
) -> Result<Vec<ElementInfo>, String> {
    tracing::info!("Finding all elements with semantic query: {}", query);

    // Create semantic selector
    let selector = SemanticElementFinder::from_natural_language(&query);

    // Try each strategy and collect all found elements
    let mut all_elements = Vec::new();

    for strategy in &selector.strategies {
        let script = format!(
            r#"
            (function() {{
                const selector = {};
                const elements = selector ? (Array.isArray(selector) ? selector : [selector]) : [];
                return elements.filter(el => el != null).map(el => ({{
                    selector: el.id ? `#${{el.id}}` : el.className ? `.${{el.className.split(' ')[0]}}` : el.tagName.toLowerCase(),
                    role: el.getAttribute('role'),
                    name: el.getAttribute('aria-label') || el.textContent?.trim(),
                    text: el.textContent?.trim()
                }}));
            }})()
            "#,
            strategy.to_selector_script()
        );

        match DomOperations::evaluate(&tab_id, &script).await {
            Ok(result) => {
                if let Some(arr) = result.as_array() {
                    for elem in arr {
                        if let Some(obj) = elem.as_object() {
                            all_elements.push(ElementInfo {
                                selector: obj
                                    .get("selector")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                strategy: format!("{:?}", strategy),
                                role: obj
                                    .get("role")
                                    .and_then(|v| v.as_str())
                                    .map(|s| s.to_string()),
                                name: obj
                                    .get("name")
                                    .and_then(|v| v.as_str())
                                    .map(|s| s.to_string()),
                                text: obj
                                    .get("text")
                                    .and_then(|v| v.as_str())
                                    .map(|s| s.to_string()),
                            });
                        }
                    }
                }
            }
            Err(_) => continue,
        }
    }

    Ok(all_elements)
}

/// Click element using semantic selector
#[tauri::command]
pub async fn click_semantic(
    tab_id: String,
    query: String,
    state: State<'_, BrowserStateWrapper>,
) -> Result<(), String> {
    tracing::info!("Clicking element with semantic query: {}", query);

    // Find element first
    let element_info = find_element_semantic(tab_id.clone(), query, state.clone()).await?;

    // Click using the found selector
    browser_click(tab_id, element_info.selector, state).await
}

/// Type text into element using semantic selector
#[tauri::command]
pub async fn type_semantic(
    tab_id: String,
    query: String,
    text: String,
    state: State<'_, BrowserStateWrapper>,
) -> Result<(), String> {
    tracing::info!("Typing into element with semantic query: {}", query);

    // Find element first
    let element_info = find_element_semantic(tab_id.clone(), query, state.clone()).await?;

    // Type using the found selector
    browser_type(tab_id, element_info.selector, text, state).await
}

/// Get accessibility tree for the current page
#[tauri::command]
pub async fn get_accessibility_tree(
    tab_id: String,
    _state: State<'_, BrowserStateWrapper>,
) -> Result<AccessibilityTree, String> {
    tracing::info!("Getting accessibility tree for tab: {}", tab_id);

    let script = AccessibilityAnalyzer::get_accessibility_tree_script();

    let result = DomOperations::evaluate(&tab_id, script)
        .await
        .map_err(|e| format!("Failed to get accessibility tree: {}", e))?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse accessibility tree: {}", e))
}

/// Test all selector strategies for a semantic query
#[tauri::command]
pub async fn test_selector_strategies(
    tab_id: String,
    query: String,
    _state: State<'_, BrowserStateWrapper>,
) -> Result<Vec<SelectorResult>, String> {
    tracing::info!("Testing selector strategies for query: {}", query);

    // Create semantic selector
    let selector = SemanticElementFinder::from_natural_language(&query);

    // Generate test script
    let script = SemanticElementFinder::test_strategies_script(&selector);

    // Execute script
    let result = DomOperations::evaluate(&tab_id, &script)
        .await
        .map_err(|e| format!("Failed to test strategies: {}", e))?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse results: {}", e))
}

/// Get DOM semantic graph
#[tauri::command]
pub async fn get_dom_semantic_graph(
    tab_id: String,
    _state: State<'_, BrowserStateWrapper>,
) -> Result<DOMSemanticGraph, String> {
    tracing::info!("Getting DOM semantic graph for tab: {}", tab_id);

    let script = DOMSemanticGraph::build_graph_script();

    let result = DomOperations::evaluate(&tab_id, script)
        .await
        .map_err(|e| format!("Failed to get semantic graph: {}", e))?;

    serde_json::from_value(result).map_err(|e| format!("Failed to parse semantic graph: {}", e))
}

/// Get interactive elements from the page
#[tauri::command]
pub async fn get_interactive_elements(
    tab_id: String,
    _state: State<'_, BrowserStateWrapper>,
) -> Result<Vec<serde_json::Value>, String> {
    tracing::info!("Getting interactive elements for tab: {}", tab_id);

    let script = AccessibilityAnalyzer::get_interactive_elements_script();

    let result = DomOperations::evaluate(&tab_id, script)
        .await
        .map_err(|e| format!("Failed to get interactive elements: {}", e))?;

    result
        .as_array()
        .cloned()
        .ok_or_else(|| "Result is not an array".to_string())
}

/// Find elements by ARIA role
#[tauri::command]
pub async fn find_by_role(
    tab_id: String,
    role: String,
    name: Option<String>,
    _state: State<'_, BrowserStateWrapper>,
) -> Result<Vec<serde_json::Value>, String> {
    tracing::info!("Finding elements by role: {} (name: {:?})", role, name);

    let script = AccessibilityAnalyzer::find_by_role_script(&role, name.as_deref());

    let result = DomOperations::evaluate(&tab_id, &script)
        .await
        .map_err(|e| format!("Failed to find by role: {}", e))?;

    result
        .as_array()
        .cloned()
        .ok_or_else(|| "Result is not an array".to_string())
}
