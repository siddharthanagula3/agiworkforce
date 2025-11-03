use std::sync::Arc;
use tauri::async_runtime::block_on;
use tauri::State;
use tokio::sync::Mutex;

use crate::browser::{
    BrowserOptions, BrowserState, BrowserType, ClickOptions, DomOperations, ImageFormat,
    NavigationOptions, ScreenshotOptions, TypeOptions,
};

/// Browser state wrapper for Tauri
pub struct BrowserStateWrapper(pub Arc<Mutex<BrowserState>>);

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
            *state.0.lock().await = browser_state;
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

    let browser_state = state.0.lock().await;

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

    let browser_state = state.0.lock().await;
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

    let browser_state = state.0.lock().await;
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

    let browser_state = state.0.lock().await;
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

    let browser_state = state.0.lock().await;
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

    let browser_state = state.0.lock().await;
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

    let browser_state = state.0.lock().await;
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

    let browser_state = state.0.lock().await;
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
    let browser_state = state.0.lock().await;
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
    let browser_state = state.0.lock().await;
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

    let browser_state = state.0.lock().await;
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

    let browser_state = state.0.lock().await;
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
