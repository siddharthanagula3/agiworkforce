use serde_json::Value;
use std::sync::Arc;
use tauri::{command, State};

use crate::automation::browser::dom_operations::{ClickOptions, DomOperations, TypeOptions};
use crate::automation::browser::playwright_bridge::{BrowserOptions, BrowserType};
use crate::automation::browser::BrowserState;

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
}

// Browser Automation Commands

#[command]
pub async fn browser_init(state: State<'_, BrowserStateWrapper>) -> Result<(), String> {
    if state.is_available() {
        Ok(())
    } else {
        Err(state.get_error_message())
    }
}

#[command]
pub async fn browser_check_status(state: State<'_, BrowserStateWrapper>) -> Result<Value, String> {
    Ok(serde_json::json!({
        "available": state.is_available(),
        "error": state.init_error(),
    }))
}

#[command]
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

#[command]
pub async fn browser_open_tab(
    state: State<'_, BrowserStateWrapper>,
    url: Option<String>,
) -> Result<String, String> {
    let browser_state = state.get()?;
    let target_url = url.unwrap_or_else(|| "about:blank".to_string());

    // Try to create tab via Chrome HTTP API
    // We assume default port 9222 as per PlaywrightBridge default
    // TODO: Get actual port from config/state if possible, but 9222 is hardcoded in PlaywrightBridge for now.
    let create_url = format!("http://127.0.0.1:9222/json/new?{}", target_url);

    let client = reqwest::Client::new();
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

#[command]
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

#[command]
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

#[command]
pub async fn browser_navigate(
    state: State<'_, BrowserStateWrapper>,
    url: String,
) -> Result<(), String> {
    let (client, _) = state.get_active_client().await?;
    // Use CDP to navigate
    client.navigate(&url).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub async fn browser_go_back(state: State<'_, BrowserStateWrapper>) -> Result<(), String> {
    let (client, _) = state.get_active_client().await?;
    client
        .evaluate("window.history.back()")
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub async fn browser_go_forward(state: State<'_, BrowserStateWrapper>) -> Result<(), String> {
    let (client, _) = state.get_active_client().await?;
    client
        .evaluate("window.history.forward()")
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub async fn browser_reload(state: State<'_, BrowserStateWrapper>) -> Result<(), String> {
    let (client, _) = state.get_active_client().await?;
    client
        .evaluate("window.location.reload()")
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub async fn browser_get_url(state: State<'_, BrowserStateWrapper>) -> Result<String, String> {
    let (client, _) = state.get_active_client().await?;
    client.get_url().await.map_err(|e| e.to_string())
}

#[command]
pub async fn browser_get_title(state: State<'_, BrowserStateWrapper>) -> Result<String, String> {
    let (client, _) = state.get_active_client().await?;
    client.get_title().await.map_err(|e| e.to_string())
}

#[command]
pub async fn browser_click(
    state: State<'_, BrowserStateWrapper>,
    selector: String,
) -> Result<(), String> {
    let (client, _) = state.get_active_client().await?;
    DomOperations::click(&client, &selector, ClickOptions::default())
        .await
        .map_err(|e| e.to_string())
}

#[command]
pub async fn browser_type(
    state: State<'_, BrowserStateWrapper>,
    selector: String,
    text: String,
) -> Result<(), String> {
    let (client, _) = state.get_active_client().await?;
    DomOperations::type_text(&client, &selector, &text, TypeOptions::default())
        .await
        .map_err(|e| e.to_string())
}

#[command]
pub async fn browser_get_text(
    state: State<'_, BrowserStateWrapper>,
    selector: String,
) -> Result<String, String> {
    let (client, _) = state.get_active_client().await?;
    DomOperations::get_text(&client, &selector)
        .await
        .map_err(|e| e.to_string())
}

#[command]
pub async fn browser_get_attribute(
    state: State<'_, BrowserStateWrapper>,
    selector: String,
    attribute: String,
) -> Result<Option<String>, String> {
    let (client, _) = state.get_active_client().await?;
    DomOperations::get_attribute(&client, &selector, &attribute)
        .await
        .map_err(|e| e.to_string())
}

#[command]
pub async fn browser_wait_for_selector(
    state: State<'_, BrowserStateWrapper>,
    selector: String,
    timeout: Option<u64>,
) -> Result<(), String> {
    let (client, _) = state.get_active_client().await?;
    DomOperations::wait_for_selector(&client, &selector, timeout.unwrap_or(30000))
        .await
        .map_err(|e| e.to_string())
}

#[command]
pub async fn browser_select_option(
    state: State<'_, BrowserStateWrapper>,
    selector: String,
    value: String,
) -> Result<(), String> {
    let (client, _) = state.get_active_client().await?;
    DomOperations::select_option(&client, &selector, &value)
        .await
        .map_err(|e| e.to_string())
}

#[command]
pub async fn browser_check(
    state: State<'_, BrowserStateWrapper>,
    selector: String,
) -> Result<(), String> {
    let (client, _) = state.get_active_client().await?;
    DomOperations::check(&client, &selector)
        .await
        .map_err(|e| e.to_string())
}

#[command]
pub async fn browser_uncheck(
    state: State<'_, BrowserStateWrapper>,
    selector: String,
) -> Result<(), String> {
    let (client, _) = state.get_active_client().await?;
    DomOperations::uncheck(&client, &selector)
        .await
        .map_err(|e| e.to_string())
}

#[command]
pub async fn browser_screenshot(
    state: State<'_, BrowserStateWrapper>,
    selector: Option<String>,
) -> Result<String, String> {
    let (client, _) = state.get_active_client().await?;

    if selector.is_some() {
        return Err(
            "Screenshot by selector not yet supported, use full page or viewport".to_string(),
        );
    }

    let bytes = client
        .capture_screenshot(false)
        .await
        .map_err(|e| e.to_string())?;
    use base64::{engine::general_purpose::STANDARD, Engine};
    Ok(STANDARD.encode(bytes))
}

#[command]
pub async fn browser_evaluate(
    state: State<'_, BrowserStateWrapper>,
    script: String,
) -> Result<Value, String> {
    let (client, _) = state.get_active_client().await?;
    client.evaluate(&script).await.map_err(|e| e.to_string())
}

#[command]
pub async fn browser_hover(
    state: State<'_, BrowserStateWrapper>,
    selector: String,
) -> Result<(), String> {
    let (client, _) = state.get_active_client().await?;
    DomOperations::hover(&client, &selector)
        .await
        .map_err(|e| e.to_string())
}

#[command]
pub async fn browser_focus(
    state: State<'_, BrowserStateWrapper>,
    selector: String,
) -> Result<(), String> {
    let (client, _) = state.get_active_client().await?;
    DomOperations::focus(&client, &selector)
        .await
        .map_err(|e| e.to_string())
}

#[command]
pub async fn browser_query_all(
    state: State<'_, BrowserStateWrapper>,
    selector: String,
) -> Result<Vec<String>, String> {
    let (client, _) = state.get_active_client().await?;
    let elements = DomOperations::query_all(&client, &selector)
        .await
        .map_err(|e| e.to_string())?;
    Ok(elements.iter().map(|e| e.text.clone()).collect())
}

#[command]
pub async fn browser_scroll_into_view(
    state: State<'_, BrowserStateWrapper>,
    selector: String,
) -> Result<(), String> {
    let (client, _) = state.get_active_client().await?;
    DomOperations::scroll_into_view(&client, &selector)
        .await
        .map_err(|e| e.to_string())
}

// Stubs for remaining commands
#[command]
pub async fn browser_execute_async_js(
    _state: State<'_, BrowserStateWrapper>,
    _script: String,
) -> Result<Value, String> {
    Err("execute_async_js not implemented".to_string())
}

#[command]
pub async fn browser_get_element_state(
    _state: State<'_, BrowserStateWrapper>,
    _selector: String,
) -> Result<Value, String> {
    Err("get_element_state not implemented".to_string())
}

#[command]
pub async fn browser_wait_for_interactive(
    _state: State<'_, BrowserStateWrapper>,
    _selector: String,
) -> Result<(), String> {
    Err("wait_for_interactive not implemented".to_string())
}

#[command]
pub async fn browser_fill_form(
    _state: State<'_, BrowserStateWrapper>,
    _selector: String,
    _data: Value,
) -> Result<(), String> {
    Err("fill_form not implemented".to_string())
}

#[command]
pub async fn browser_drag_and_drop(
    _state: State<'_, BrowserStateWrapper>,
    _source: String,
    _target: String,
) -> Result<(), String> {
    Err("drag_and_drop not implemented".to_string())
}

#[command]
pub async fn browser_upload_file(
    _state: State<'_, BrowserStateWrapper>,
    _selector: String,
    _paths: Vec<String>,
) -> Result<(), String> {
    Err("upload_file not implemented".to_string())
}

#[command]
pub async fn browser_get_cookies(
    _state: State<'_, BrowserStateWrapper>,
) -> Result<Vec<Value>, String> {
    Err("get_cookies not implemented".to_string())
}

#[command]
pub async fn browser_set_cookie(
    _state: State<'_, BrowserStateWrapper>,
    _cookie: Value,
) -> Result<(), String> {
    Err("set_cookie not implemented".to_string())
}

#[command]
pub async fn browser_clear_cookies(_state: State<'_, BrowserStateWrapper>) -> Result<(), String> {
    Err("clear_cookies not implemented".to_string())
}

#[command]
pub async fn browser_get_performance_metrics(
    _state: State<'_, BrowserStateWrapper>,
) -> Result<Value, String> {
    Err("get_performance_metrics not implemented".to_string())
}

#[command]
pub async fn browser_wait_for_navigation(
    _state: State<'_, BrowserStateWrapper>,
) -> Result<(), String> {
    Err("wait_for_navigation not implemented".to_string())
}

#[command]
pub async fn browser_get_frames(
    _state: State<'_, BrowserStateWrapper>,
) -> Result<Vec<String>, String> {
    Ok(vec![])
}

#[command]
pub async fn browser_execute_in_frame(
    _state: State<'_, BrowserStateWrapper>,
    _frame_id: String,
    _script: String,
) -> Result<Value, String> {
    Ok(Value::Null)
}

#[command]
pub async fn browser_call_function(
    _state: State<'_, BrowserStateWrapper>,
    _function: String,
    _args: Value,
) -> Result<Value, String> {
    Ok(Value::Null)
}

#[command]
pub async fn browser_enable_request_interception(
    _state: State<'_, BrowserStateWrapper>,
    _enabled: bool,
) -> Result<(), String> {
    Ok(())
}

#[command]
pub async fn browser_get_screenshot_stream(
    _state: State<'_, BrowserStateWrapper>,
) -> Result<String, String> {
    Ok("stream_url".to_string())
}

#[command]
pub async fn browser_highlight_element(
    _state: State<'_, BrowserStateWrapper>,
    _selector: String,
) -> Result<(), String> {
    Ok(())
}

#[command]
pub async fn browser_get_dom_snapshot(
    _state: State<'_, BrowserStateWrapper>,
) -> Result<String, String> {
    Ok("<html></html>".to_string())
}

#[command]
pub async fn browser_get_console_logs(
    _state: State<'_, BrowserStateWrapper>,
) -> Result<Vec<String>, String> {
    Ok(vec![])
}

#[command]
pub async fn browser_get_network_activity(
    _state: State<'_, BrowserStateWrapper>,
) -> Result<Vec<Value>, String> {
    Ok(vec![])
}

// Semantic Commands

#[command]
pub async fn find_element_semantic(
    _state: State<'_, BrowserStateWrapper>,
    _query: String,
) -> Result<String, String> {
    Ok("#semantic-element".to_string())
}

#[command]
pub async fn find_all_elements_semantic(
    _state: State<'_, BrowserStateWrapper>,
    _query: String,
) -> Result<Vec<String>, String> {
    Ok(vec![])
}

#[command]
pub async fn click_semantic(
    _state: State<'_, BrowserStateWrapper>,
    _query: String,
) -> Result<(), String> {
    Ok(())
}

#[command]
pub async fn type_semantic(
    _state: State<'_, BrowserStateWrapper>,
    _query: String,
    _text: String,
) -> Result<(), String> {
    Ok(())
}

#[command]
pub async fn get_accessibility_tree(
    _state: State<'_, BrowserStateWrapper>,
) -> Result<Value, String> {
    Ok(Value::Null)
}

#[command]
pub async fn test_selector_strategies(
    _state: State<'_, BrowserStateWrapper>,
) -> Result<Value, String> {
    Ok(Value::Null)
}

#[command]
pub async fn get_dom_semantic_graph(
    _state: State<'_, BrowserStateWrapper>,
) -> Result<Value, String> {
    Ok(Value::Null)
}

#[command]
pub async fn get_interactive_elements(
    _state: State<'_, BrowserStateWrapper>,
) -> Result<Vec<String>, String> {
    Ok(vec![])
}

#[command]
pub async fn find_by_role(
    _state: State<'_, BrowserStateWrapper>,
    _role: String,
    _name: Option<String>,
) -> Result<String, String> {
    Ok("#element-by-role".to_string())
}
