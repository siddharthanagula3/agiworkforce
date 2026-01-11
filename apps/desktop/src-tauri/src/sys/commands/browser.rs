use serde_json::Value;
use tauri::{command, State};

use crate::automation::browser::playwright_bridge::{BrowserOptions, BrowserType};
use crate::automation::browser::BrowserState;

// =============================================================================
// BROWSER STATE WRAPPER WITH GRACEFUL DEGRADATION
// =============================================================================
// This wrapper handles the case where browser automation initialization fails.
// Instead of leaving no state managed (which would cause panics), we manage
// a degraded state that returns clear error messages to the frontend.

/// Error message returned when browser automation is unavailable
const BROWSER_UNAVAILABLE_ERROR: &str =
    "Browser automation is not available. The browser subsystem failed to initialize. \
     Please restart the application or check system requirements (Playwright/Chromium).";

/// Wrapper for browser automation state with graceful degradation support.
///
/// # Design
/// - Wraps `Option<BrowserState>` to handle initialization failures
/// - Commands that need browser access call `get()` and receive clear errors
/// - Commands that are stubs (don't use state) continue to work in degraded mode
/// - Initialization error is captured for diagnostics
pub struct BrowserStateWrapper {
    /// The browser state, None if initialization failed
    inner: Option<BrowserState>,
    /// The error that occurred during initialization, if any
    init_error: Option<String>,
}

impl BrowserStateWrapper {
    /// Creates a new browser state wrapper with full functionality.
    ///
    /// # Errors
    /// Returns an error if BrowserState::new() fails, but this error
    /// should be caught and `new_degraded()` should be used instead.
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
    ///
    /// This ensures Tauri always has a state to manage, preventing panics
    /// when commands try to access State<'_, BrowserStateWrapper>.
    ///
    /// # Arguments
    /// * `error` - The error message from the failed initialization
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
    ///
    /// # Errors
    /// Returns an error with a descriptive message if browser automation
    /// is not available due to initialization failure.
    pub fn get(&self) -> Result<&BrowserState, String> {
        self.inner.as_ref().ok_or_else(|| {
            if let Some(ref err) = self.init_error {
                format!("{} Original error: {}", BROWSER_UNAVAILABLE_ERROR, err)
            } else {
                BROWSER_UNAVAILABLE_ERROR.to_string()
            }
        })
    }

    /// Gets a reference to the BrowserState for operations that can gracefully
    /// handle missing browser functionality.
    ///
    /// Returns None if browser is unavailable, allowing commands to return
    /// default/empty values instead of errors.
    pub fn get_optional(&self) -> Option<&BrowserState> {
        self.inner.as_ref()
    }

    /// Returns the error message for when browser is unavailable.
    /// Use this instead of `get().unwrap_err()` to avoid Debug trait requirements.
    pub fn get_error_message(&self) -> String {
        if let Some(ref err) = self.init_error {
            format!("{} Original error: {}", BROWSER_UNAVAILABLE_ERROR, err)
        } else {
            BROWSER_UNAVAILABLE_ERROR.to_string()
        }
    }

    /// Gets the tab manager, returning an error if browser is unavailable.
    ///
    /// This is a convenience method that provides access to the tab_manager
    /// with proper error handling for graceful degradation.
    pub fn get_tab_manager(
        &self,
    ) -> Result<&std::sync::Arc<tokio::sync::Mutex<crate::automation::browser::TabManager>>, String>
    {
        self.get().map(|state| &state.tab_manager)
    }

    /// Gets the CDP client for a specific tab, returning an error if browser is unavailable.
    ///
    /// This is a convenience method that provides access to CDP client creation
    /// with proper error handling for graceful degradation.
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
}

// Browser Automation Commands

/// Initialize browser automation and return status.
/// Returns Ok(()) if browser automation is available, Err with details if not.
#[command]
pub async fn browser_init(state: State<'_, BrowserStateWrapper>) -> Result<(), String> {
    if state.is_available() {
        Ok(())
    } else {
        Err(state.get_error_message())
    }
}

/// Check if browser automation is available without throwing an error.
/// Returns a JSON object with availability status and any error message.
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
    // Get browser state, returning clear error if unavailable
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
    _state: State<'_, BrowserStateWrapper>,
    _url: Option<String>,
) -> Result<String, String> {
    Ok("tab_id".to_string())
}

#[command]
pub async fn browser_close_tab(
    state: State<'_, BrowserStateWrapper>,
    tab_id: Option<String>,
) -> Result<(), String> {
    // If no tab_id provided, nothing to close
    let Some(id) = tab_id else {
        return Ok(());
    };

    // Get browser state, returning clear error if unavailable
    let browser_state = state.get()?;

    // Close the browser/tab by ID
    let playwright = browser_state.playwright.lock().await;
    playwright
        .close_browser_by_id(&id)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[command]
pub async fn browser_list_tabs(
    _state: State<'_, BrowserStateWrapper>,
) -> Result<Vec<String>, String> {
    Ok(vec![])
}

#[command]
pub async fn browser_navigate(
    _state: State<'_, BrowserStateWrapper>,
    _url: String,
) -> Result<(), String> {
    Ok(())
}

#[command]
pub async fn browser_go_back(_state: State<'_, BrowserStateWrapper>) -> Result<(), String> {
    Ok(())
}

#[command]
pub async fn browser_go_forward(_state: State<'_, BrowserStateWrapper>) -> Result<(), String> {
    Ok(())
}

#[command]
pub async fn browser_reload(_state: State<'_, BrowserStateWrapper>) -> Result<(), String> {
    Ok(())
}

#[command]
pub async fn browser_get_url(_state: State<'_, BrowserStateWrapper>) -> Result<String, String> {
    Ok("https://example.com".to_string())
}

#[command]
pub async fn browser_get_title(_state: State<'_, BrowserStateWrapper>) -> Result<String, String> {
    Ok("Page Title".to_string())
}

#[command]
pub async fn browser_click(
    _state: State<'_, BrowserStateWrapper>,
    _selector: String,
) -> Result<(), String> {
    Ok(())
}

#[command]
pub async fn browser_type(
    _state: State<'_, BrowserStateWrapper>,
    _selector: String,
    _text: String,
) -> Result<(), String> {
    Ok(())
}

#[command]
pub async fn browser_get_text(
    _state: State<'_, BrowserStateWrapper>,
    _selector: String,
) -> Result<String, String> {
    Ok("text".to_string())
}

#[command]
pub async fn browser_get_attribute(
    _state: State<'_, BrowserStateWrapper>,
    _selector: String,
    _attribute: String,
) -> Result<Option<String>, String> {
    Ok(None)
}

#[command]
pub async fn browser_wait_for_selector(
    _state: State<'_, BrowserStateWrapper>,
    _selector: String,
    _timeout: Option<u64>,
) -> Result<(), String> {
    Ok(())
}

#[command]
pub async fn browser_select_option(
    _state: State<'_, BrowserStateWrapper>,
    _selector: String,
    _value: String,
) -> Result<(), String> {
    Ok(())
}

#[command]
pub async fn browser_check(
    _state: State<'_, BrowserStateWrapper>,
    _selector: String,
) -> Result<(), String> {
    Ok(())
}

#[command]
pub async fn browser_uncheck(
    _state: State<'_, BrowserStateWrapper>,
    _selector: String,
) -> Result<(), String> {
    Ok(())
}

#[command]
pub async fn browser_screenshot(
    _state: State<'_, BrowserStateWrapper>,
    _selector: Option<String>,
) -> Result<String, String> {
    Ok("base64_image".to_string())
}

#[command]
pub async fn browser_evaluate(
    _state: State<'_, BrowserStateWrapper>,
    _script: String,
) -> Result<Value, String> {
    Ok(Value::Null)
}

#[command]
pub async fn browser_hover(
    _state: State<'_, BrowserStateWrapper>,
    _selector: String,
) -> Result<(), String> {
    Ok(())
}

#[command]
pub async fn browser_focus(
    _state: State<'_, BrowserStateWrapper>,
    _selector: String,
) -> Result<(), String> {
    Ok(())
}

#[command]
pub async fn browser_query_all(
    _state: State<'_, BrowserStateWrapper>,
    _selector: String,
) -> Result<Vec<String>, String> {
    Ok(vec![])
}

#[command]
pub async fn browser_scroll_into_view(
    _state: State<'_, BrowserStateWrapper>,
    _selector: String,
) -> Result<(), String> {
    Ok(())
}

#[command]
pub async fn browser_execute_async_js(
    _state: State<'_, BrowserStateWrapper>,
    _script: String,
) -> Result<Value, String> {
    Ok(Value::Null)
}

#[command]
pub async fn browser_get_element_state(
    _state: State<'_, BrowserStateWrapper>,
    _selector: String,
) -> Result<Value, String> {
    Ok(Value::Null)
}

#[command]
pub async fn browser_wait_for_interactive(
    _state: State<'_, BrowserStateWrapper>,
    _selector: String,
) -> Result<(), String> {
    Ok(())
}

#[command]
pub async fn browser_fill_form(
    _state: State<'_, BrowserStateWrapper>,
    _selector: String,
    _data: Value,
) -> Result<(), String> {
    Ok(())
}

#[command]
pub async fn browser_drag_and_drop(
    _state: State<'_, BrowserStateWrapper>,
    _source: String,
    _target: String,
) -> Result<(), String> {
    Ok(())
}

#[command]
pub async fn browser_upload_file(
    _state: State<'_, BrowserStateWrapper>,
    _selector: String,
    _paths: Vec<String>,
) -> Result<(), String> {
    Ok(())
}

#[command]
pub async fn browser_get_cookies(
    _state: State<'_, BrowserStateWrapper>,
) -> Result<Vec<Value>, String> {
    Ok(vec![])
}

#[command]
pub async fn browser_set_cookie(
    _state: State<'_, BrowserStateWrapper>,
    _cookie: Value,
) -> Result<(), String> {
    Ok(())
}

#[command]
pub async fn browser_clear_cookies(_state: State<'_, BrowserStateWrapper>) -> Result<(), String> {
    Ok(())
}

#[command]
pub async fn browser_get_performance_metrics(
    _state: State<'_, BrowserStateWrapper>,
) -> Result<Value, String> {
    Ok(Value::Null)
}

#[command]
pub async fn browser_wait_for_navigation(
    _state: State<'_, BrowserStateWrapper>,
) -> Result<(), String> {
    Ok(())
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
