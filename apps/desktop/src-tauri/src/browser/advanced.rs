/**
 * Advanced Browser Automation
 * Enhanced capabilities for complex browser interactions
 */
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::Duration;

use crate::error::{Error, Result};

use super::cdp_client::CdpClient;

/// Execute JavaScript with timeout and retry logic
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecuteOptions {
    pub timeout_ms: u64,
    pub retry_count: u32,
    pub retry_delay_ms: u64,
    pub await_promise: bool,
}

impl Default for ExecuteOptions {
    fn default() -> Self {
        Self {
            timeout_ms: 30000,
            retry_count: 3,
            retry_delay_ms: 1000,
            await_promise: true,
        }
    }
}

/// Element state information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElementState {
    pub exists: bool,
    pub visible: bool,
    pub enabled: bool,
    pub focused: bool,
    pub interactive: bool,
    pub bounds: Option<ElementBounds>,
    pub computed_styles: Option<ComputedStyles>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElementBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComputedStyles {
    pub display: String,
    pub visibility: String,
    pub opacity: String,
    pub pointer_events: String,
}

/// Frame context for iframe handling
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrameContext {
    pub frame_id: String,
    pub parent_frame_id: Option<String>,
    pub name: String,
    pub url: String,
}

/// Advanced browser automation operations
pub struct AdvancedBrowserOps;

impl AdvancedBrowserOps {
    /// Execute async JavaScript with full promise support
    pub async fn execute_async_js(
        cdp: Arc<CdpClient>,
        script: &str,
        args: Option<Vec<Value>>,
        options: ExecuteOptions,
    ) -> Result<Value> {
        let mut last_error = None;

        for attempt in 0..=options.retry_count {
            if attempt > 0 {
                tracing::debug!("Retry attempt {} for JS execution", attempt);
                tokio::time::sleep(Duration::from_millis(options.retry_delay_ms)).await;
            }

            // Build expression with arguments
            let full_script = if let Some(ref args_vec) = args {
                let args_json = serde_json::to_string(args_vec)
                    .map_err(|e| Error::Other(format!("Failed to serialize args: {}", e)))?;
                format!(
                    "(async function(...args) {{ {} }})(...{})",
                    script, args_json
                )
            } else {
                format!("(async function() {{ {} }})()", script)
            };

            // Execute with timeout
            let result = tokio::time::timeout(
                Duration::from_millis(options.timeout_ms),
                cdp.evaluate(&full_script),
            )
            .await;

            match result {
                Ok(Ok(value)) => return Ok(value),
                Ok(Err(e)) => {
                    last_error = Some(e);
                }
                Err(_) => {
                    last_error = Some(Error::CommandTimeout(format!(
                        "Script execution timed out after {}ms",
                        options.timeout_ms
                    )));
                }
            }
        }

        Err(last_error.unwrap_or_else(|| Error::Other("JS execution failed".to_string())))
    }

    /// Get comprehensive element state
    pub async fn get_element_state(cdp: Arc<CdpClient>, selector: &str) -> Result<ElementState> {
        let script = format!(
            r#"
            const el = document.querySelector('{}');
            if (!el) {{
                return {{ exists: false }};
            }}

            const rect = el.getBoundingClientRect();
            const styles = window.getComputedStyle(el);

            // Check if element is visible
            const isVisible = rect.width > 0 && rect.height > 0
                && styles.visibility !== 'hidden'
                && styles.display !== 'none'
                && parseFloat(styles.opacity) > 0;

            // Check if element is interactive
            const isInteractive = !el.disabled
                && styles.pointerEvents !== 'none'
                && isVisible;

            return {{
                exists: true,
                visible: isVisible,
                enabled: !el.disabled,
                focused: document.activeElement === el,
                interactive: isInteractive,
                bounds: {{
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height
                }},
                computedStyles: {{
                    display: styles.display,
                    visibility: styles.visibility,
                    opacity: styles.opacity,
                    pointerEvents: styles.pointerEvents
                }}
            }};
            "#,
            selector.replace('\'', "\\'")
        );

        let result = cdp.evaluate(&script).await?;

        serde_json::from_value(result)
            .map_err(|e| Error::Other(format!("Failed to parse element state: {}", e)))
    }

    /// Wait for element to be interactive (visible, enabled, etc.)
    pub async fn wait_for_interactive(
        cdp: Arc<CdpClient>,
        selector: &str,
        timeout_ms: u64,
    ) -> Result<()> {
        let start = std::time::Instant::now();
        let check_interval = Duration::from_millis(100);

        loop {
            let state = Self::get_element_state(Arc::clone(&cdp), selector).await?;

            if state.interactive {
                tracing::info!("Element is interactive: {}", selector);
                return Ok(());
            }

            if start.elapsed().as_millis() > timeout_ms as u128 {
                return Err(Error::CommandTimeout(format!(
                    "Element not interactive after {}ms: {} (exists: {}, visible: {}, enabled: {})",
                    timeout_ms, selector, state.exists, state.visible, state.enabled
                )));
            }

            tokio::time::sleep(check_interval).await;
        }
    }

    /// Execute JavaScript in specific frame
    pub async fn execute_in_frame(
        cdp: Arc<CdpClient>,
        frame_id: &str,
        script: &str,
    ) -> Result<Value> {
        // Switch to frame context
        let params = json!({
            "frameId": frame_id,
            "expression": script,
            "returnByValue": true,
            "awaitPromise": true,
        });

        let result = cdp.send_command("Runtime.evaluate", params).await?;

        if let Some(value) = result.get("result").and_then(|r| r.get("value")) {
            Ok(value.clone())
        } else {
            Ok(Value::Null)
        }
    }

    /// Get all frames in the page
    pub async fn get_frames(cdp: Arc<CdpClient>) -> Result<Vec<FrameContext>> {
        let result = cdp.send_command("Page.getFrameTree", json!({})).await?;

        let mut frames = Vec::new();

        if let Some(frame_tree) = result.get("frameTree") {
            Self::extract_frames(frame_tree, &mut frames, None);
        }

        Ok(frames)
    }

    fn extract_frames(
        frame_tree: &Value,
        frames: &mut Vec<FrameContext>,
        parent_id: Option<String>,
    ) {
        if let Some(frame) = frame_tree.get("frame") {
            let frame_id = frame
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let name = frame
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let url = frame
                .get("url")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            frames.push(FrameContext {
                frame_id: frame_id.clone(),
                parent_frame_id: parent_id.clone(),
                name,
                url,
            });

            // Process child frames
            if let Some(child_frames) = frame_tree.get("childFrames").and_then(|v| v.as_array()) {
                for child in child_frames {
                    Self::extract_frames(child, frames, Some(frame_id.clone()));
                }
            }
        }
    }

    /// Complex form interaction - fill multiple fields
    pub async fn fill_form(cdp: Arc<CdpClient>, fields: Vec<FormField>) -> Result<()> {
        for field in fields {
            // Wait for field to be interactive
            Self::wait_for_interactive(Arc::clone(&cdp), &field.selector, 5000).await?;

            match field.field_type {
                FormFieldType::Text | FormFieldType::Email | FormFieldType::Password => {
                    cdp.type_into_element(&field.selector, &field.value, true)
                        .await?;
                }
                FormFieldType::Checkbox => {
                    let checked = field.value.to_lowercase() == "true";
                    cdp.set_checked(&field.selector, checked).await?;
                }
                FormFieldType::Select => {
                    cdp.select_option(&field.selector, &field.value).await?;
                }
                FormFieldType::Radio => {
                    cdp.click_element(&field.selector).await?;
                }
                FormFieldType::Textarea => {
                    cdp.type_into_element(&field.selector, &field.value, true)
                        .await?;
                }
            }

            // Small delay between fields for stability
            tokio::time::sleep(Duration::from_millis(200)).await;
        }

        Ok(())
    }

    /// Wait for navigation to complete
    pub async fn wait_for_navigation(cdp: Arc<CdpClient>, timeout_ms: u64) -> Result<String> {
        let script = r#"
            new Promise((resolve) => {
                if (document.readyState === 'complete') {
                    resolve(window.location.href);
                } else {
                    window.addEventListener('load', () => {
                        resolve(window.location.href);
                    });
                }
            })
        "#;

        let result = tokio::time::timeout(Duration::from_millis(timeout_ms), cdp.evaluate(script))
            .await
            .map_err(|_| {
                Error::CommandTimeout(format!("Navigation timeout after {}ms", timeout_ms))
            })?
            .map_err(|e| Error::Other(format!("Navigation failed: {}", e)))?;

        match result.as_str() {
            Some(url) => Ok(url.to_string()),
            None => Err(Error::Other(
                "Failed to get URL after navigation".to_string(),
            )),
        }
    }

    /// Drag and drop simulation
    pub async fn drag_and_drop(
        cdp: Arc<CdpClient>,
        source_selector: &str,
        target_selector: &str,
    ) -> Result<()> {
        let script = format!(
            r#"
            const source = document.querySelector('{}');
            const target = document.querySelector('{}');

            if (!source || !target) {{
                throw new Error('Source or target element not found');
            }}

            // Create and dispatch drag events
            const dataTransfer = new DataTransfer();

            source.dispatchEvent(new DragEvent('dragstart', {{
                bubbles: true,
                cancelable: true,
                dataTransfer
            }}));

            target.dispatchEvent(new DragEvent('dragover', {{
                bubbles: true,
                cancelable: true,
                dataTransfer
            }}));

            target.dispatchEvent(new DragEvent('drop', {{
                bubbles: true,
                cancelable: true,
                dataTransfer
            }}));

            source.dispatchEvent(new DragEvent('dragend', {{
                bubbles: true,
                cancelable: true,
                dataTransfer
            }}));

            return true;
            "#,
            source_selector.replace('\'', "\\'"),
            target_selector.replace('\'', "\\'")
        );

        cdp.evaluate(&script).await?;
        Ok(())
    }

    /// Upload file to input element
    pub async fn upload_file(cdp: Arc<CdpClient>, selector: &str, file_path: &str) -> Result<()> {
        // Get node ID for the file input element
        let get_node_script = format!(
            "document.querySelector('{}')",
            selector.replace('\'', "\\'")
        );

        // Set files on the input element using CDP
        let params = json!({
            "objectId": get_node_script,
            "files": [file_path],
        });

        cdp.send_command("DOM.setFileInputFiles", params).await?;
        Ok(())
    }

    /// Execute function with arguments (type-safe)
    pub async fn call_function(
        cdp: Arc<CdpClient>,
        function_name: &str,
        args: Vec<Value>,
    ) -> Result<Value> {
        let args_json = serde_json::to_string(&args)
            .map_err(|e| Error::Other(format!("Failed to serialize arguments: {}", e)))?;

        let script = format!(
            "window['{}'](...{})",
            function_name.replace('\'', "\\'"),
            args_json
        );

        cdp.evaluate(&script).await
    }

    /// Get all cookies
    pub async fn get_cookies(cdp: Arc<CdpClient>) -> Result<Vec<Cookie>> {
        let result = cdp.send_command("Network.getCookies", json!({})).await?;

        let cookies_value = result
            .get("cookies")
            .ok_or_else(|| Error::Other("No cookies in response".to_string()))?;

        serde_json::from_value(cookies_value.clone())
            .map_err(|e| Error::Other(format!("Failed to parse cookies: {}", e)))
    }

    /// Set cookie
    pub async fn set_cookie(cdp: Arc<CdpClient>, cookie: Cookie) -> Result<()> {
        let params = json!({
            "name": cookie.name,
            "value": cookie.value,
            "domain": cookie.domain,
            "path": cookie.path,
            "secure": cookie.secure,
            "httpOnly": cookie.http_only,
            "sameSite": cookie.same_site,
        });

        cdp.send_command("Network.setCookie", params).await?;
        Ok(())
    }

    /// Clear all cookies
    pub async fn clear_cookies(cdp: Arc<CdpClient>) -> Result<()> {
        cdp.send_command("Network.clearBrowserCookies", json!({}))
            .await?;
        Ok(())
    }

    /// Intercept network requests
    pub async fn enable_request_interception(cdp: Arc<CdpClient>) -> Result<()> {
        let params = json!({
            "patterns": [{"urlPattern": "*"}]
        });

        cdp.send_command("Fetch.enable", params).await?;
        Ok(())
    }

    /// Get performance metrics
    pub async fn get_performance_metrics(cdp: Arc<CdpClient>) -> Result<PerformanceMetrics> {
        let script = r#"
            JSON.stringify({
                navigationStart: performance.timing.navigationStart,
                loadComplete: performance.timing.loadEventEnd,
                domContentLoaded: performance.timing.domContentLoadedEventEnd,
                firstPaint: performance.getEntriesByType('paint')
                    .find(e => e.name === 'first-paint')?.startTime || 0,
                firstContentfulPaint: performance.getEntriesByType('paint')
                    .find(e => e.name === 'first-contentful-paint')?.startTime || 0,
                memoryUsage: performance.memory?.usedJSHeapSize || 0
            })
        "#;

        let result = cdp.evaluate(script).await?;
        let json_str = result
            .as_str()
            .ok_or_else(|| Error::Other("Failed to get performance data".to_string()))?;

        serde_json::from_str(json_str)
            .map_err(|e| Error::Other(format!("Failed to parse performance metrics: {}", e)))
    }
}

/// Form field definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FormField {
    pub selector: String,
    pub field_type: FormFieldType,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FormFieldType {
    Text,
    Email,
    Password,
    Checkbox,
    Radio,
    Select,
    Textarea,
}

/// Cookie structure
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Cookie {
    pub name: String,
    pub value: String,
    pub domain: String,
    pub path: String,
    pub secure: bool,
    pub http_only: bool,
    pub same_site: Option<String>,
}

/// Performance metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PerformanceMetrics {
    pub navigation_start: f64,
    pub load_complete: f64,
    pub dom_content_loaded: f64,
    pub first_paint: f64,
    pub first_contentful_paint: f64,
    pub memory_usage: f64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_execute_options_default() {
        let options = ExecuteOptions::default();
        assert_eq!(options.timeout_ms, 30000);
        assert_eq!(options.retry_count, 3);
        assert!(options.await_promise);
    }

    #[test]
    fn test_form_field_creation() {
        let field = FormField {
            selector: "#email".to_string(),
            field_type: FormFieldType::Email,
            value: "test@example.com".to_string(),
        };
        assert_eq!(field.selector, "#email");
    }
}
