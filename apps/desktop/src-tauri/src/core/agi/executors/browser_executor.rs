//! Browser automation executor.
//!
//! Handles browser automation operations including navigation, clicking,
//! and extracting content from web pages.
//!
//! # Tools
//!
//! - `browser_navigate` - Navigate to a URL, opening a new tab if needed
//! - `browser_click` - Click an element using a CSS selector
//! - `browser_extract` - Extract text, attributes, or all elements matching a selector
//!
//! # Extension Bridge Fallback
//!
//! Each tool first attempts to dispatch the action through the CDP path (Chrome
//! DevTools Protocol via `CdpClient`). If no CDP-connected tabs are available, the
//! executor falls back to the `ExtensionBridge` which routes actions through the
//! browser extension's native messaging / realtime WebSocket channel. This allows
//! the AGI planner to automate any tab that has the AGI Workforce extension installed,
//! even without an explicit remote-debugging port.

use super::{ExecutorContext, ToolExecutor};
use crate::automation::browser::{AdvancedBrowserOps, ExecuteOptions};
use crate::automation::AutomationService;
use crate::core::agi::ExecutionContext;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;

/// Executor for browser automation operations.
///
/// This executor provides browser automation capabilities through the
/// Tauri browser state wrapper, supporting navigation, clicking, and
/// content extraction.
pub struct BrowserExecutor {
    _automation: Arc<AutomationService>,
}

impl BrowserExecutor {
    /// Create a new browser executor with the given automation service.
    ///
    /// # Arguments
    ///
    /// * `automation` - Shared automation service for cross-platform operations.
    ///   Reserved for future use as fallback when CDP is unavailable.
    pub fn new(automation: Arc<AutomationService>) -> Self {
        Self {
            _automation: automation,
        }
    }
}

#[async_trait]
impl ToolExecutor for BrowserExecutor {
    fn tool_names(&self) -> Vec<&'static str> {
        vec![
            "browser_navigate",
            "browser_click",
            "browser_extract",
            "browser_type",
            "browser_wait_for_selector",
            "browser_get_text",
            "browser_get_attribute",
            "browser_screenshot",
            "browser_hover",
            "browser_focus",
            "browser_scroll_into_view",
            "browser_query_all",
            "browser_execute_async_js",
            "browser_get_element_state",
            "browser_wait_for_interactive",
            "browser_select_option",
            "browser_check",
            "browser_uncheck",
            "browser_get_url",
            "browser_get_title",
            "browser_go_back",
            "browser_go_forward",
            "browser_reload",
            "browser_wait_for_navigation",
            "browser_get_dom_snapshot",
        ]
    }

    fn description(&self) -> &'static str {
        "Browser automation executor for navigation, clicking, and content extraction"
    }

    async fn execute(
        &self,
        tool_name: &str,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
        _execution_context: &ExecutionContext,
    ) -> Result<Value> {
        match tool_name {
            "browser_navigate" => execute_navigate(parameters, context).await,
            "browser_click" => execute_click(parameters, context).await,
            "browser_extract" => execute_extract(parameters, context).await,
            "browser_type" => execute_type(parameters, context).await,
            "browser_wait_for_selector" => execute_wait_for_selector(parameters, context).await,
            "browser_get_text" => execute_get_text(parameters, context).await,
            "browser_get_attribute" => execute_get_attribute(parameters, context).await,
            "browser_screenshot" => execute_screenshot(parameters, context).await,
            "browser_hover" => execute_hover(parameters, context).await,
            "browser_focus" => execute_focus(parameters, context).await,
            "browser_scroll_into_view" => execute_scroll_into_view(parameters, context).await,
            "browser_query_all" => execute_query_all(parameters, context).await,
            "browser_execute_async_js" => execute_async_js(parameters, context).await,
            "browser_get_element_state" => execute_get_element_state(parameters, context).await,
            "browser_wait_for_interactive" => {
                execute_wait_for_interactive(parameters, context).await
            }
            "browser_select_option" => execute_select_option(parameters, context).await,
            "browser_check" => execute_check(parameters, context).await,
            "browser_uncheck" => execute_uncheck(parameters, context).await,
            "browser_get_url" => execute_get_url(parameters, context).await,
            "browser_get_title" => execute_get_title(parameters, context).await,
            "browser_go_back" => execute_go_back(parameters, context).await,
            "browser_go_forward" => execute_go_forward(parameters, context).await,
            "browser_reload" => execute_reload(parameters, context).await,
            "browser_wait_for_navigation" => execute_wait_for_navigation(parameters, context).await,
            "browser_get_dom_snapshot" => execute_get_dom_snapshot(parameters, context).await,
            _ => Err(anyhow!("Unknown browser tool: {}", tool_name)),
        }
    }
}

async fn resolve_tab_id(
    app: &tauri::AppHandle,
    requested_tab_id: Option<&str>,
    allow_create: bool,
    initial_url: Option<&str>,
) -> Result<String> {
    use crate::sys::commands::BrowserStateWrapper;
    use tauri::Manager;

    let browser_state = app.state::<BrowserStateWrapper>();
    browser_state
        .resolve_cdp_tab(requested_tab_id, allow_create, initial_url)
        .await
        .map_err(|e| anyhow!("Could not resolve browser tab: {}", e))
}

async fn get_cdp_client(
    app: &tauri::AppHandle,
    requested_tab_id: Option<&str>,
    allow_create: bool,
    initial_url: Option<&str>,
) -> Result<(Arc<crate::automation::browser::CdpClient>, String)> {
    use crate::sys::commands::BrowserStateWrapper;
    use tauri::Manager;

    let tab_id = resolve_tab_id(app, requested_tab_id, allow_create, initial_url).await?;

    let browser_state = app.state::<BrowserStateWrapper>();
    let client = browser_state
        .get_cdp_client_for_tab(&tab_id)
        .await
        .map_err(|e| anyhow!("Could not connect to browser tab: {}", e))?;

    Ok((client, tab_id))
}

/// Obtain a clone of the `ExtensionBridge` `Arc<Mutex>` from app state.
///
/// Callers lock the returned value themselves so the lock is not held across
/// await points in the helper's caller.
fn get_extension_bridge_arc(
    app: &tauri::AppHandle,
) -> Result<Arc<tokio::sync::Mutex<crate::automation::browser::ExtensionBridge>>> {
    use crate::sys::commands::BrowserStateWrapper;
    use tauri::Manager;

    let browser_state = app.state::<BrowserStateWrapper>();
    let arc = browser_state
        .get_extension_bridge()
        .map_err(|e| anyhow!("Extension bridge unavailable: {}", e))?;
    Ok(Arc::clone(arc))
}

/// Execute browser_navigate operation.
///
/// Navigates the browser to the specified URL. If no tabs are open, opens a new
/// tab first. Otherwise, navigates the first available tab.
///
/// Primary path: CDP via CdpClient.
/// Fallback: ExtensionBridge when CDP tabs are unavailable.
///
/// # Parameters
///
/// - `url` (required): The URL to navigate to
///
/// # Returns
///
/// JSON object with:
/// - `success`: boolean indicating success
/// - `url`: the URL navigated to
/// - `tab_id`: the ID of the tab used (CDP) or "extension" (extension bridge)
async fn execute_navigate(
    parameters: &HashMap<String, Value>,
    context: &ExecutorContext,
) -> Result<Value> {
    let url = parameters["url"]
        .as_str()
        .ok_or_else(|| anyhow!("Missing url parameter"))?;

    let Some(ref app) = context.app_handle else {
        return Err(anyhow!(
            "Could not navigate to the page. Browser automation is not available."
        ));
    };

    // Try CDP path first.
    match get_cdp_client(
        app,
        parameters.get("tab_id").and_then(|v| v.as_str()),
        true,
        Some(url),
    )
    .await
    {
        Ok((cdp_client, tab_id)) => {
            cdp_client
                .navigate(url)
                .await
                .map_err(|e| anyhow!("Could not navigate to '{}': {}", url, e))?;

            Ok(json!({
                "success": true,
                "url": url,
                "tab_id": tab_id
            }))
        }
        Err(cdp_err) => {
            // Fallback: dispatch through the extension bridge.
            tracing::warn!(
                "[BrowserExecutor] CDP navigate failed ({}); trying extension bridge",
                cdp_err
            );
            let bridge_arc = get_extension_bridge_arc(app).map_err(|ext_err| {
                anyhow!(
                    "Could not navigate to '{}'. CDP: {}. Extension bridge: {}",
                    url,
                    cdp_err,
                    ext_err
                )
            })?;
            bridge_arc
                .lock()
                .await
                .navigate(url)
                .await
                .map_err(|e| anyhow!("Extension bridge navigate to '{}' failed: {}", url, e))?;

            Ok(json!({
                "success": true,
                "url": url,
                "tab_id": "extension"
            }))
        }
    }
}

/// Execute browser_click operation.
///
/// Clicks on an element in the browser using a CSS selector. Uses CDP (Chrome
/// DevTools Protocol) for reliable element interaction.
///
/// # Parameters
///
/// - `selector` (required): CSS selector for the element to click
/// - `tab_id` (optional): Specific tab to use; defaults to first tab
///
/// # Returns
///
/// JSON object with:
/// - `success`: boolean indicating success
/// - `action`: "clicked"
/// - `selector`: the selector used
/// - `tab_id`: the ID of the tab used
async fn execute_click(
    parameters: &HashMap<String, Value>,
    context: &ExecutorContext,
) -> Result<Value> {
    let selector = parameters
        .get("selector")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing selector parameter"))?;
    let Some(ref app) = context.app_handle else {
        return Err(anyhow!(
            "Could not click the element. Browser automation is not available."
        ));
    };

    match get_cdp_client(
        app,
        parameters.get("tab_id").and_then(|v| v.as_str()),
        false,
        None,
    )
    .await
    {
        Ok((cdp_client, target_tab_id)) => {
            cdp_client
                .click_element(selector)
                .await
                .map_err(|e| anyhow!("Could not click element '{}': {}", selector, e))?;

            Ok(json!({
                "success": true,
                "action": "clicked",
                "selector": selector,
                "tab_id": target_tab_id
            }))
        }
        Err(cdp_err) => {
            tracing::warn!(
                "[BrowserExecutor] CDP click failed ({}); trying extension bridge",
                cdp_err
            );
            let bridge_arc = get_extension_bridge_arc(app).map_err(|ext_err| {
                anyhow!(
                    "Could not click '{}'. CDP: {}. Extension bridge: {}",
                    selector,
                    cdp_err,
                    ext_err
                )
            })?;
            bridge_arc
                .lock()
                .await
                .click(selector)
                .await
                .map_err(|e| anyhow!("Extension bridge click '{}' failed: {}", selector, e))?;

            Ok(json!({
                "success": true,
                "action": "clicked",
                "selector": selector,
                "tab_id": "extension"
            }))
        }
    }
}

/// Execute browser_extract operation.
///
/// Extracts content from the browser page using CSS selectors. Supports multiple
/// extraction types for different use cases.
///
/// # Parameters
///
/// - `selector` (optional): CSS selector for elements; defaults to "body"
/// - `tab_id` (optional): Specific tab to use; defaults to first tab
/// - `extract_type` (optional): Type of extraction, one of:
///   - "text" (default): Extract text content
///   - "attribute": Extract a specific attribute (requires `attribute` parameter)
///   - "all": Extract all matching elements with their properties
/// - `attribute` (required if extract_type is "attribute"): Attribute name to extract
///
/// # Returns
///
/// JSON object with:
/// - `success`: boolean indicating success
/// - `selector`: the selector used
/// - `tab_id`: the ID of the tab used
/// - `data`: extraction result object containing:
///   - For "text": `{ type: "text", content: string }`
///   - For "attribute": `{ type: "attribute", attribute: string, content: string }`
///   - For "all": `{ type: "all_elements", count: number, elements: array }`
async fn execute_extract(
    parameters: &HashMap<String, Value>,
    context: &ExecutorContext,
) -> Result<Value> {
    let selector = parameters
        .get("selector")
        .and_then(|v| v.as_str())
        .unwrap_or("body");
    let extract_type = parameters
        .get("extract_type")
        .and_then(|v| v.as_str())
        .unwrap_or("text");

    let Some(ref app) = context.app_handle else {
        return Err(anyhow!(
            "Could not extract content. Browser automation is not available."
        ));
    };

    let (cdp_client, target_tab_id) = get_cdp_client(
        app,
        parameters.get("tab_id").and_then(|v| v.as_str()),
        false,
        None,
    )
    .await?;

    // Perform extraction based on type
    let result = match extract_type {
        "text" => {
            let text = cdp_client
                .get_text(selector)
                .await
                .map_err(|e| anyhow!("Could not extract text from '{}': {}", selector, e))?;
            json!({ "type": "text", "content": text })
        }
        "attribute" => {
            let attribute_name = parameters
                .get("attribute")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing attribute parameter for attribute extraction"))?;

            let attr_value = cdp_client
                .get_attribute(selector, attribute_name)
                .await
                .map_err(|e| {
                    anyhow!(
                        "Could not get attribute '{}' from '{}': {}",
                        attribute_name,
                        selector,
                        e
                    )
                })?;

            json!({
                "type": "attribute",
                "attribute": attribute_name,
                "content": attr_value
            })
        }
        "all" => {
            let elements = cdp_client
                .query_all(selector)
                .await
                .map_err(|e| anyhow!("Could not query elements '{}': {}", selector, e))?;

            let elements_json = serde_json::to_value(&elements)
                .map_err(|e| anyhow!("Could not serialize elements: {}", e))?;

            json!({
                "type": "all_elements",
                "count": elements.len(),
                "elements": elements_json
            })
        }
        _ => {
            // Default to text extraction for unknown types
            let text = cdp_client
                .get_text(selector)
                .await
                .map_err(|e| anyhow!("Could not extract text from '{}': {}", selector, e))?;
            json!({ "type": "text", "content": text })
        }
    };

    Ok(json!({
        "success": true,
        "selector": selector,
        "tab_id": target_tab_id,
        "data": result
    }))
}

async fn execute_type(
    parameters: &HashMap<String, Value>,
    context: &ExecutorContext,
) -> Result<Value> {
    let selector = parameters
        .get("selector")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing selector parameter"))?;
    let text = parameters
        .get("text")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing text parameter"))?;
    let clear_first = parameters
        .get("clear_first")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    let Some(ref app) = context.app_handle else {
        return Err(anyhow!(
            "Could not type into the element. Browser automation is not available."
        ));
    };

    match get_cdp_client(
        app,
        parameters.get("tab_id").and_then(|v| v.as_str()),
        false,
        None,
    )
    .await
    {
        Ok((cdp_client, target_tab_id)) => {
            cdp_client
                .type_into_element(selector, text, clear_first)
                .await
                .map_err(|e| anyhow!("Could not type into '{}': {}", selector, e))?;

            Ok(json!({
                "success": true,
                "action": "typed",
                "selector": selector,
                "tab_id": target_tab_id
            }))
        }
        Err(cdp_err) => {
            tracing::warn!(
                "[BrowserExecutor] CDP type failed ({}); trying extension bridge",
                cdp_err
            );
            let bridge_arc = get_extension_bridge_arc(app).map_err(|ext_err| {
                anyhow!(
                    "Could not type into '{}'. CDP: {}. Extension bridge: {}",
                    selector,
                    cdp_err,
                    ext_err
                )
            })?;
            bridge_arc
                .lock()
                .await
                .type_text(selector, text)
                .await
                .map_err(|e| anyhow!("Extension bridge type into '{}' failed: {}", selector, e))?;

            Ok(json!({
                "success": true,
                "action": "typed",
                "selector": selector,
                "tab_id": "extension"
            }))
        }
    }
}

async fn execute_wait_for_selector(
    parameters: &HashMap<String, Value>,
    context: &ExecutorContext,
) -> Result<Value> {
    let selector = parameters
        .get("selector")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing selector parameter"))?;
    let timeout_ms = parameters
        .get("timeout_ms")
        .and_then(|v| v.as_u64())
        .unwrap_or(30_000);

    let Some(ref app) = context.app_handle else {
        return Err(anyhow!(
            "Could not wait for selector. Browser automation is not available."
        ));
    };

    match get_cdp_client(
        app,
        parameters.get("tab_id").and_then(|v| v.as_str()),
        false,
        None,
    )
    .await
    {
        Ok((cdp_client, target_tab_id)) => {
            cdp_client
                .wait_for_selector(selector, timeout_ms)
                .await
                .map_err(|e| anyhow!("Selector '{}' did not appear: {}", selector, e))?;

            Ok(json!({
                "success": true,
                "selector": selector,
                "tab_id": target_tab_id
            }))
        }
        Err(cdp_err) => {
            tracing::warn!(
                "[BrowserExecutor] CDP wait_for_selector failed ({}); trying extension bridge",
                cdp_err
            );
            let bridge_arc = get_extension_bridge_arc(app).map_err(|ext_err| {
                anyhow!(
                    "Could not wait for selector '{}'. CDP: {}. Extension bridge: {}",
                    selector,
                    cdp_err,
                    ext_err
                )
            })?;
            bridge_arc
                .lock()
                .await
                .wait_for_selector(selector, timeout_ms)
                .await
                .map_err(|e| {
                    anyhow!(
                        "Extension bridge wait_for_selector '{}' failed: {}",
                        selector,
                        e
                    )
                })?;

            Ok(json!({
                "success": true,
                "selector": selector,
                "tab_id": "extension"
            }))
        }
    }
}

async fn execute_get_text(
    parameters: &HashMap<String, Value>,
    context: &ExecutorContext,
) -> Result<Value> {
    let selector = parameters
        .get("selector")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing selector parameter"))?;

    let Some(ref app) = context.app_handle else {
        return Err(anyhow!(
            "Could not get text. Browser automation is not available."
        ));
    };

    let (cdp_client, target_tab_id) = get_cdp_client(
        app,
        parameters.get("tab_id").and_then(|v| v.as_str()),
        false,
        None,
    )
    .await?;

    let text = cdp_client
        .get_text(selector)
        .await
        .map_err(|e| anyhow!("Could not get text from '{}': {}", selector, e))?;

    Ok(json!({
        "success": true,
        "selector": selector,
        "tab_id": target_tab_id,
        "text": text
    }))
}

async fn execute_get_attribute(
    parameters: &HashMap<String, Value>,
    context: &ExecutorContext,
) -> Result<Value> {
    let selector = parameters
        .get("selector")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing selector parameter"))?;
    let attribute = parameters
        .get("attribute")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing attribute parameter"))?;

    let Some(ref app) = context.app_handle else {
        return Err(anyhow!(
            "Could not get attribute. Browser automation is not available."
        ));
    };

    let (cdp_client, target_tab_id) = get_cdp_client(
        app,
        parameters.get("tab_id").and_then(|v| v.as_str()),
        false,
        None,
    )
    .await?;

    let value = cdp_client
        .get_attribute(selector, attribute)
        .await
        .map_err(|e| {
            anyhow!(
                "Could not get attribute '{}' from '{}': {}",
                attribute,
                selector,
                e
            )
        })?;

    Ok(json!({
        "success": true,
        "selector": selector,
        "attribute": attribute,
        "tab_id": target_tab_id,
        "value": value
    }))
}

async fn execute_screenshot(
    parameters: &HashMap<String, Value>,
    context: &ExecutorContext,
) -> Result<Value> {
    let full_page = parameters
        .get("full_page")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let Some(ref app) = context.app_handle else {
        return Err(anyhow!(
            "Could not take screenshot. Browser automation is not available."
        ));
    };

    match get_cdp_client(
        app,
        parameters.get("tab_id").and_then(|v| v.as_str()),
        false,
        None,
    )
    .await
    {
        Ok((cdp_client, target_tab_id)) => {
            let bytes = cdp_client
                .capture_screenshot(full_page)
                .await
                .map_err(|e| anyhow!("Could not capture screenshot: {}", e))?;

            let encoded = STANDARD.encode(bytes);

            Ok(json!({
                "success": true,
                "tab_id": target_tab_id,
                "format": "png",
                "image_base64": encoded
            }))
        }
        Err(cdp_err) => {
            tracing::warn!(
                "[BrowserExecutor] CDP screenshot failed ({}); trying extension bridge",
                cdp_err
            );
            let bridge_arc = get_extension_bridge_arc(app).map_err(|ext_err| {
                anyhow!(
                    "Could not capture screenshot. CDP: {}. Extension bridge: {}",
                    cdp_err,
                    ext_err
                )
            })?;
            let bytes = bridge_arc
                .lock()
                .await
                .capture_screenshot("png", 90)
                .await
                .map_err(|e| anyhow!("Extension bridge screenshot failed: {}", e))?;

            let encoded = STANDARD.encode(bytes);

            Ok(json!({
                "success": true,
                "tab_id": "extension",
                "format": "png",
                "image_base64": encoded
            }))
        }
    }
}

async fn execute_hover(
    parameters: &HashMap<String, Value>,
    context: &ExecutorContext,
) -> Result<Value> {
    let selector = parameters
        .get("selector")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing selector parameter"))?;

    let Some(ref app) = context.app_handle else {
        return Err(anyhow!(
            "Could not hover element. Browser automation is not available."
        ));
    };

    match get_cdp_client(
        app,
        parameters.get("tab_id").and_then(|v| v.as_str()),
        false,
        None,
    )
    .await
    {
        Ok((cdp_client, target_tab_id)) => {
            cdp_client
                .hover_element(selector)
                .await
                .map_err(|e| anyhow!("Could not hover element '{}': {}", selector, e))?;

            Ok(json!({
                "success": true,
                "selector": selector,
                "tab_id": target_tab_id
            }))
        }
        Err(cdp_err) => {
            tracing::warn!(
                "[BrowserExecutor] CDP hover failed ({}); trying extension bridge",
                cdp_err
            );
            let bridge_arc = get_extension_bridge_arc(app).map_err(|ext_err| {
                anyhow!(
                    "Could not hover '{}'. CDP: {}. Extension bridge: {}",
                    selector,
                    cdp_err,
                    ext_err
                )
            })?;
            bridge_arc
                .lock()
                .await
                .hover(selector)
                .await
                .map_err(|e| anyhow!("Extension bridge hover '{}' failed: {}", selector, e))?;

            Ok(json!({
                "success": true,
                "selector": selector,
                "tab_id": "extension"
            }))
        }
    }
}

async fn execute_focus(
    parameters: &HashMap<String, Value>,
    context: &ExecutorContext,
) -> Result<Value> {
    let selector = parameters
        .get("selector")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing selector parameter"))?;

    let Some(ref app) = context.app_handle else {
        return Err(anyhow!(
            "Could not focus element. Browser automation is not available."
        ));
    };

    match get_cdp_client(
        app,
        parameters.get("tab_id").and_then(|v| v.as_str()),
        false,
        None,
    )
    .await
    {
        Ok((cdp_client, target_tab_id)) => {
            cdp_client
                .focus_element(selector)
                .await
                .map_err(|e| anyhow!("Could not focus element '{}': {}", selector, e))?;

            Ok(json!({
                "success": true,
                "selector": selector,
                "tab_id": target_tab_id
            }))
        }
        Err(cdp_err) => {
            tracing::warn!(
                "[BrowserExecutor] CDP focus failed ({}); trying extension bridge",
                cdp_err
            );
            let bridge_arc = get_extension_bridge_arc(app).map_err(|ext_err| {
                anyhow!(
                    "Could not focus '{}'. CDP: {}. Extension bridge: {}",
                    selector,
                    cdp_err,
                    ext_err
                )
            })?;
            bridge_arc
                .lock()
                .await
                .focus(selector)
                .await
                .map_err(|e| anyhow!("Extension bridge focus '{}' failed: {}", selector, e))?;

            Ok(json!({
                "success": true,
                "selector": selector,
                "tab_id": "extension"
            }))
        }
    }
}

async fn execute_scroll_into_view(
    parameters: &HashMap<String, Value>,
    context: &ExecutorContext,
) -> Result<Value> {
    let selector = parameters
        .get("selector")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing selector parameter"))?;

    let Some(ref app) = context.app_handle else {
        return Err(anyhow!(
            "Could not scroll element into view. Browser automation is not available."
        ));
    };

    match get_cdp_client(
        app,
        parameters.get("tab_id").and_then(|v| v.as_str()),
        false,
        None,
    )
    .await
    {
        Ok((cdp_client, target_tab_id)) => {
            cdp_client
                .scroll_into_view(selector)
                .await
                .map_err(|e| anyhow!("Could not scroll element '{}': {}", selector, e))?;

            Ok(json!({
                "success": true,
                "selector": selector,
                "tab_id": target_tab_id
            }))
        }
        Err(cdp_err) => {
            tracing::warn!(
                "[BrowserExecutor] CDP scroll_into_view failed ({}); trying extension bridge",
                cdp_err
            );
            let bridge_arc = get_extension_bridge_arc(app).map_err(|ext_err| {
                anyhow!(
                    "Could not scroll '{}' into view. CDP: {}. Extension bridge: {}",
                    selector,
                    cdp_err,
                    ext_err
                )
            })?;
            bridge_arc
                .lock()
                .await
                .scroll_into_view(selector)
                .await
                .map_err(|e| {
                    anyhow!(
                        "Extension bridge scroll_into_view '{}' failed: {}",
                        selector,
                        e
                    )
                })?;

            Ok(json!({
                "success": true,
                "selector": selector,
                "tab_id": "extension"
            }))
        }
    }
}

async fn execute_query_all(
    parameters: &HashMap<String, Value>,
    context: &ExecutorContext,
) -> Result<Value> {
    let selector = parameters
        .get("selector")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing selector parameter"))?;

    let Some(ref app) = context.app_handle else {
        return Err(anyhow!(
            "Could not query elements. Browser automation is not available."
        ));
    };

    let (cdp_client, target_tab_id) = get_cdp_client(
        app,
        parameters.get("tab_id").and_then(|v| v.as_str()),
        false,
        None,
    )
    .await?;

    let elements = cdp_client
        .query_all(selector)
        .await
        .map_err(|e| anyhow!("Could not query elements '{}': {}", selector, e))?;

    Ok(json!({
        "success": true,
        "selector": selector,
        "tab_id": target_tab_id,
        "elements": elements
    }))
}

async fn execute_async_js(
    parameters: &HashMap<String, Value>,
    context: &ExecutorContext,
) -> Result<Value> {
    let script = parameters
        .get("script")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing script parameter"))?;
    let args = parameters.get("args").and_then(|v| v.as_array()).cloned();

    let timeout_ms = parameters
        .get("timeout_ms")
        .and_then(|v| v.as_u64())
        .unwrap_or(30_000);
    let retry_count = parameters
        .get("retry_count")
        .and_then(|v| v.as_u64())
        .unwrap_or(3) as u32;
    let retry_delay_ms = parameters
        .get("retry_delay_ms")
        .and_then(|v| v.as_u64())
        .unwrap_or(1000);
    let await_promise = parameters
        .get("await_promise")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    let Some(ref app) = context.app_handle else {
        return Err(anyhow!(
            "Could not execute script. Browser automation is not available."
        ));
    };

    let (cdp_client, target_tab_id) = get_cdp_client(
        app,
        parameters.get("tab_id").and_then(|v| v.as_str()),
        false,
        None,
    )
    .await?;

    let options = ExecuteOptions {
        timeout_ms,
        retry_count,
        retry_delay_ms,
        await_promise,
    };

    let result = AdvancedBrowserOps::execute_async_js(cdp_client, script, args, options)
        .await
        .map_err(|e| anyhow!("Script execution failed: {}", e))?;

    Ok(json!({
        "success": true,
        "tab_id": target_tab_id,
        "result": result
    }))
}

async fn execute_get_element_state(
    parameters: &HashMap<String, Value>,
    context: &ExecutorContext,
) -> Result<Value> {
    let selector = parameters
        .get("selector")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing selector parameter"))?;

    let Some(ref app) = context.app_handle else {
        return Err(anyhow!(
            "Could not get element state. Browser automation is not available."
        ));
    };

    let (cdp_client, target_tab_id) = get_cdp_client(
        app,
        parameters.get("tab_id").and_then(|v| v.as_str()),
        false,
        None,
    )
    .await?;

    let state = AdvancedBrowserOps::get_element_state(cdp_client, selector)
        .await
        .map_err(|e| anyhow!("Could not get element state for '{}': {}", selector, e))?;

    let state_json =
        serde_json::to_value(state).map_err(|e| anyhow!("Failed to serialize state: {}", e))?;

    Ok(json!({
        "success": true,
        "selector": selector,
        "tab_id": target_tab_id,
        "state": state_json
    }))
}

async fn execute_wait_for_interactive(
    parameters: &HashMap<String, Value>,
    context: &ExecutorContext,
) -> Result<Value> {
    let selector = parameters
        .get("selector")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing selector parameter"))?;
    let timeout_ms = parameters
        .get("timeout_ms")
        .and_then(|v| v.as_u64())
        .unwrap_or(30_000);

    let Some(ref app) = context.app_handle else {
        return Err(anyhow!(
            "Could not wait for interactive element. Browser automation is not available."
        ));
    };

    let (cdp_client, target_tab_id) = get_cdp_client(
        app,
        parameters.get("tab_id").and_then(|v| v.as_str()),
        false,
        None,
    )
    .await?;

    AdvancedBrowserOps::wait_for_interactive(cdp_client, selector, timeout_ms)
        .await
        .map_err(|e| anyhow!("Element '{}' not interactive: {}", selector, e))?;

    Ok(json!({
        "success": true,
        "selector": selector,
        "tab_id": target_tab_id
    }))
}

async fn execute_select_option(
    parameters: &HashMap<String, Value>,
    context: &ExecutorContext,
) -> Result<Value> {
    let selector = parameters
        .get("selector")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing selector parameter"))?;
    let value = parameters
        .get("value")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing value parameter"))?;

    let Some(ref app) = context.app_handle else {
        return Err(anyhow!(
            "Could not select option. Browser automation is not available."
        ));
    };

    match get_cdp_client(
        app,
        parameters.get("tab_id").and_then(|v| v.as_str()),
        false,
        None,
    )
    .await
    {
        Ok((cdp_client, target_tab_id)) => {
            cdp_client
                .select_option(selector, value)
                .await
                .map_err(|e| anyhow!("Could not select option for '{}': {}", selector, e))?;

            Ok(json!({
                "success": true,
                "selector": selector,
                "tab_id": target_tab_id
            }))
        }
        Err(cdp_err) => {
            tracing::warn!(
                "[BrowserExecutor] CDP select_option failed ({}); trying extension bridge",
                cdp_err
            );
            let bridge_arc = get_extension_bridge_arc(app).map_err(|ext_err| {
                anyhow!(
                    "Could not select option for '{}'. CDP: {}. Extension bridge: {}",
                    selector,
                    cdp_err,
                    ext_err
                )
            })?;
            bridge_arc
                .lock()
                .await
                .select_option(selector, value)
                .await
                .map_err(|e| {
                    anyhow!(
                        "Extension bridge select_option '{}' failed: {}",
                        selector,
                        e
                    )
                })?;

            Ok(json!({
                "success": true,
                "selector": selector,
                "tab_id": "extension"
            }))
        }
    }
}

async fn execute_check(
    parameters: &HashMap<String, Value>,
    context: &ExecutorContext,
) -> Result<Value> {
    let selector = parameters
        .get("selector")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing selector parameter"))?;

    let Some(ref app) = context.app_handle else {
        return Err(anyhow!(
            "Could not check element. Browser automation is not available."
        ));
    };

    match get_cdp_client(
        app,
        parameters.get("tab_id").and_then(|v| v.as_str()),
        false,
        None,
    )
    .await
    {
        Ok((cdp_client, target_tab_id)) => {
            cdp_client
                .set_checked(selector, true)
                .await
                .map_err(|e| anyhow!("Could not check '{}': {}", selector, e))?;

            Ok(json!({
                "success": true,
                "selector": selector,
                "tab_id": target_tab_id
            }))
        }
        Err(cdp_err) => {
            tracing::warn!(
                "[BrowserExecutor] CDP check failed ({}); trying extension bridge",
                cdp_err
            );
            let bridge_arc = get_extension_bridge_arc(app).map_err(|ext_err| {
                anyhow!(
                    "Could not check '{}'. CDP: {}. Extension bridge: {}",
                    selector,
                    cdp_err,
                    ext_err
                )
            })?;
            bridge_arc
                .lock()
                .await
                .set_checked(selector, true)
                .await
                .map_err(|e| anyhow!("Extension bridge check '{}' failed: {}", selector, e))?;

            Ok(json!({
                "success": true,
                "selector": selector,
                "tab_id": "extension"
            }))
        }
    }
}

async fn execute_uncheck(
    parameters: &HashMap<String, Value>,
    context: &ExecutorContext,
) -> Result<Value> {
    let selector = parameters
        .get("selector")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing selector parameter"))?;

    let Some(ref app) = context.app_handle else {
        return Err(anyhow!(
            "Could not uncheck element. Browser automation is not available."
        ));
    };

    match get_cdp_client(
        app,
        parameters.get("tab_id").and_then(|v| v.as_str()),
        false,
        None,
    )
    .await
    {
        Ok((cdp_client, target_tab_id)) => {
            cdp_client
                .set_checked(selector, false)
                .await
                .map_err(|e| anyhow!("Could not uncheck '{}': {}", selector, e))?;

            Ok(json!({
                "success": true,
                "selector": selector,
                "tab_id": target_tab_id
            }))
        }
        Err(cdp_err) => {
            tracing::warn!(
                "[BrowserExecutor] CDP uncheck failed ({}); trying extension bridge",
                cdp_err
            );
            let bridge_arc = get_extension_bridge_arc(app).map_err(|ext_err| {
                anyhow!(
                    "Could not uncheck '{}'. CDP: {}. Extension bridge: {}",
                    selector,
                    cdp_err,
                    ext_err
                )
            })?;
            bridge_arc
                .lock()
                .await
                .set_checked(selector, false)
                .await
                .map_err(|e| anyhow!("Extension bridge uncheck '{}' failed: {}", selector, e))?;

            Ok(json!({
                "success": true,
                "selector": selector,
                "tab_id": "extension"
            }))
        }
    }
}

async fn execute_get_url(
    parameters: &HashMap<String, Value>,
    context: &ExecutorContext,
) -> Result<Value> {
    let Some(ref app) = context.app_handle else {
        return Err(anyhow!(
            "Could not get URL. Browser automation is not available."
        ));
    };

    match get_cdp_client(
        app,
        parameters.get("tab_id").and_then(|v| v.as_str()),
        false,
        None,
    )
    .await
    {
        Ok((cdp_client, target_tab_id)) => {
            let url = cdp_client
                .get_url()
                .await
                .map_err(|e| anyhow!("Could not get URL: {}", e))?;

            Ok(json!({
                "success": true,
                "tab_id": target_tab_id,
                "url": url
            }))
        }
        Err(cdp_err) => {
            tracing::warn!(
                "[BrowserExecutor] CDP get_url failed ({}); trying extension bridge",
                cdp_err
            );
            let bridge_arc = get_extension_bridge_arc(app).map_err(|ext_err| {
                anyhow!(
                    "Could not get URL. CDP: {}. Extension bridge: {}",
                    cdp_err,
                    ext_err
                )
            })?;
            let url = bridge_arc
                .lock()
                .await
                .get_url()
                .await
                .map_err(|e| anyhow!("Extension bridge get_url failed: {}", e))?;

            Ok(json!({
                "success": true,
                "tab_id": "extension",
                "url": url
            }))
        }
    }
}

async fn execute_get_title(
    parameters: &HashMap<String, Value>,
    context: &ExecutorContext,
) -> Result<Value> {
    let Some(ref app) = context.app_handle else {
        return Err(anyhow!(
            "Could not get title. Browser automation is not available."
        ));
    };

    match get_cdp_client(
        app,
        parameters.get("tab_id").and_then(|v| v.as_str()),
        false,
        None,
    )
    .await
    {
        Ok((cdp_client, target_tab_id)) => {
            let title = cdp_client
                .get_title()
                .await
                .map_err(|e| anyhow!("Could not get title: {}", e))?;

            Ok(json!({
                "success": true,
                "tab_id": target_tab_id,
                "title": title
            }))
        }
        Err(cdp_err) => {
            tracing::warn!(
                "[BrowserExecutor] CDP get_title failed ({}); trying extension bridge",
                cdp_err
            );
            let bridge_arc = get_extension_bridge_arc(app).map_err(|ext_err| {
                anyhow!(
                    "Could not get title. CDP: {}. Extension bridge: {}",
                    cdp_err,
                    ext_err
                )
            })?;
            let title = bridge_arc
                .lock()
                .await
                .get_title()
                .await
                .map_err(|e| anyhow!("Extension bridge get_title failed: {}", e))?;

            Ok(json!({
                "success": true,
                "tab_id": "extension",
                "title": title
            }))
        }
    }
}

async fn execute_go_back(
    parameters: &HashMap<String, Value>,
    context: &ExecutorContext,
) -> Result<Value> {
    let Some(ref app) = context.app_handle else {
        return Err(anyhow!(
            "Could not go back. Browser automation is not available."
        ));
    };

    let (cdp_client, target_tab_id) = get_cdp_client(
        app,
        parameters.get("tab_id").and_then(|v| v.as_str()),
        false,
        None,
    )
    .await?;

    cdp_client
        .evaluate("history.back()")
        .await
        .map_err(|e| anyhow!("Could not go back: {}", e))?;

    Ok(json!({
        "success": true,
        "tab_id": target_tab_id
    }))
}

async fn execute_go_forward(
    parameters: &HashMap<String, Value>,
    context: &ExecutorContext,
) -> Result<Value> {
    let Some(ref app) = context.app_handle else {
        return Err(anyhow!(
            "Could not go forward. Browser automation is not available."
        ));
    };

    let (cdp_client, target_tab_id) = get_cdp_client(
        app,
        parameters.get("tab_id").and_then(|v| v.as_str()),
        false,
        None,
    )
    .await?;

    cdp_client
        .evaluate("history.forward()")
        .await
        .map_err(|e| anyhow!("Could not go forward: {}", e))?;

    Ok(json!({
        "success": true,
        "tab_id": target_tab_id
    }))
}

async fn execute_reload(
    parameters: &HashMap<String, Value>,
    context: &ExecutorContext,
) -> Result<Value> {
    let Some(ref app) = context.app_handle else {
        return Err(anyhow!(
            "Could not reload page. Browser automation is not available."
        ));
    };

    let (cdp_client, target_tab_id) = get_cdp_client(
        app,
        parameters.get("tab_id").and_then(|v| v.as_str()),
        false,
        None,
    )
    .await?;

    cdp_client
        .evaluate("location.reload()")
        .await
        .map_err(|e| anyhow!("Could not reload page: {}", e))?;

    Ok(json!({
        "success": true,
        "tab_id": target_tab_id
    }))
}

async fn execute_wait_for_navigation(
    parameters: &HashMap<String, Value>,
    context: &ExecutorContext,
) -> Result<Value> {
    let timeout_ms = parameters
        .get("timeout_ms")
        .and_then(|v| v.as_u64())
        .unwrap_or(30_000);

    let Some(ref app) = context.app_handle else {
        return Err(anyhow!(
            "Could not wait for navigation. Browser automation is not available."
        ));
    };

    let (cdp_client, target_tab_id) = get_cdp_client(
        app,
        parameters.get("tab_id").and_then(|v| v.as_str()),
        false,
        None,
    )
    .await?;

    let script = format!(
        r#"
        new Promise((resolve, reject) => {{
            const timeout = {};
            const interval = 100;
            let elapsed = 0;

            const check = () => {{
                if (document.readyState === 'complete') {{
                    resolve(true);
                    return;
                }}

                elapsed += interval;
                if (elapsed >= timeout) {{
                    reject(new Error('Timeout waiting for navigation'));
                    return;
                }}

                setTimeout(check, interval);
            }};

            check();
        }})
        "#,
        timeout_ms
    );

    cdp_client
        .evaluate(&script)
        .await
        .map_err(|e| anyhow!("Navigation wait failed: {}", e))?;

    Ok(json!({
        "success": true,
        "tab_id": target_tab_id
    }))
}

async fn execute_get_dom_snapshot(
    parameters: &HashMap<String, Value>,
    context: &ExecutorContext,
) -> Result<Value> {
    let Some(ref app) = context.app_handle else {
        return Err(anyhow!(
            "Could not get DOM snapshot. Browser automation is not available."
        ));
    };

    match get_cdp_client(
        app,
        parameters.get("tab_id").and_then(|v| v.as_str()),
        false,
        None,
    )
    .await
    {
        Ok((cdp_client, target_tab_id)) => {
            let html = cdp_client
                .evaluate("document.documentElement.outerHTML")
                .await
                .map_err(|e| anyhow!("Could not capture DOM snapshot: {}", e))?;

            Ok(json!({
                "success": true,
                "tab_id": target_tab_id,
                "html": html
            }))
        }
        Err(cdp_err) => {
            tracing::warn!(
                "[BrowserExecutor] CDP get_dom_snapshot failed ({}); trying extension bridge",
                cdp_err
            );
            let bridge_arc = get_extension_bridge_arc(app).map_err(|ext_err| {
                anyhow!(
                    "Could not get DOM snapshot. CDP: {}. Extension bridge: {}",
                    cdp_err,
                    ext_err
                )
            })?;
            let html = bridge_arc
                .lock()
                .await
                .get_dom_snapshot()
                .await
                .map_err(|e| anyhow!("Extension bridge get_dom_snapshot failed: {}", e))?;

            Ok(json!({
                "success": true,
                "tab_id": "extension",
                "html": html
            }))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::automation::AutomationService;

    fn create_test_automation() -> Arc<AutomationService> {
        Arc::new(
            AutomationService::new().unwrap_or_else(|e| {
                panic!("Failed to create automation service for testing: {}", e)
            }),
        )
    }

    #[test]
    fn test_browser_executor_tool_names() {
        let automation = create_test_automation();
        let executor = BrowserExecutor::new(automation);
        let names = executor.tool_names();

        assert!(names.contains(&"browser_navigate"));
        assert!(names.contains(&"browser_click"));
        assert!(names.contains(&"browser_extract"));
        assert!(names.contains(&"browser_type"));
        assert!(names.contains(&"browser_wait_for_selector"));
        assert!(names.contains(&"browser_screenshot"));
        assert!(names.contains(&"browser_execute_async_js"));
        assert!(names.contains(&"browser_get_dom_snapshot"));
    }

    #[test]
    fn test_browser_executor_description() {
        let automation = create_test_automation();
        let executor = BrowserExecutor::new(automation);

        assert!(!executor.description().is_empty());
        assert!(executor.description().contains("Browser"));
    }
}
