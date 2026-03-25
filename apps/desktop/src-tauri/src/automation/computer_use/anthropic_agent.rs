//! Anthropic-native Computer Use Agent.
//!
//! Implements the computer use protocol using Anthropic's `computer_20251124`
//! tool type. Sends screenshots as base64 images, receives structured actions,
//! and executes them via the shared `ActionExecutor`.
//!
//! Uses the `LLMRouter` for all API calls. The router normalizes Anthropic
//! responses into `LLMResponse` with `finish_reason` and `tool_calls`.
//! Image-based tool results are sent via `ToolResultInput.image_base64`,
//! which the Anthropic adapter serializes as content arrays with image blocks.

use anyhow::{Context, Result};
use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter as _};
use tokio::sync::RwLock;
use tokio::time::sleep;

use crate::automation::screen::{capture_primary_screen, list_displays};
use crate::core::llm::llm_router::{LLMRouter, RouterContext, RouterPreferences};
use crate::core::llm::{
    ChatMessage, ContentPart, ImageDetail, ImageFormat, ImageInput, LLMRequest, LLMResponse,
    Provider, ToolDefinition, ToolResultInput,
};

use super::action_executor::ActionExecutor;
use super::app_permissions::AppPermissionManager;
use super::safety::{ComputerUseSafetyLayer, SafetyConfig};
use super::session::SessionConfig;
use super::types::{
    ComputerUseAction, Coordinate, ElementBounds, HotkeyModifier, MouseButton, ScrollDirection,
    WaitCondition,
};
use super::window_manager::{WindowCoordinator, WindowManagerConfig};

/// Configuration for the Anthropic computer use agent.
#[derive(Debug, Clone)]
pub struct AnthropicComputerUseConfig {
    /// Maximum agent loop iterations.
    pub max_iterations: u32,
    /// Maximum total duration for the task.
    pub max_duration: Duration,
    /// Delay after each action before capturing screenshot.
    pub post_action_delay: Duration,
    /// Display width to report to Anthropic (logical pixels).
    pub display_width_px: u32,
    /// Display height to report to Anthropic (logical pixels).
    pub display_height_px: u32,
    /// Safety configuration.
    pub safety: SafetyConfig,
    /// Session configuration.
    pub session: SessionConfig,
    /// Window manager configuration.
    pub window: WindowManagerConfig,
    /// Model to use (empty = let router decide).
    pub model: String,
    /// Max tokens for each LLM call.
    pub max_tokens: u32,
}

impl Default for AnthropicComputerUseConfig {
    fn default() -> Self {
        let (width, height) = detect_logical_display_size().unwrap_or((1280, 800));

        Self {
            max_iterations: 100,
            max_duration: Duration::from_secs(300),
            post_action_delay: Duration::from_millis(500),
            display_width_px: width,
            display_height_px: height,
            safety: SafetyConfig::default(),
            session: SessionConfig::default(),
            window: WindowManagerConfig::default(),
            model: String::new(),
            max_tokens: 4096,
        }
    }
}

/// Result of an Anthropic computer use session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComputerUseResult {
    /// Whether the task completed successfully.
    pub success: bool,
    /// Final text response from Claude.
    pub response: String,
    /// Total actions executed.
    pub actions_executed: u32,
    /// Total LLM calls made.
    pub llm_calls: u32,
    /// Total duration in milliseconds.
    pub duration_ms: u64,
    /// Reason for completion.
    pub completion_reason: String,
}

/// The Anthropic Computer Use Agent.
///
/// Drives the computer use agent loop using the `LLMRouter`:
/// 1. Capture screenshot → build `ChatMessage` with `ContentPart::Image`
/// 2. Send via router → get `LLMResponse`
/// 3. Check `finish_reason` and `tool_calls`
/// 4. Parse actions from `ToolCall.arguments` → execute via `ActionExecutor`
/// 5. Build tool result `ChatMessage` with `ToolResultInput.image_base64`
/// 6. Loop until no more tool calls
pub struct AnthropicComputerUseAgent {
    llm_router: Arc<RwLock<LLMRouter>>,
    config: AnthropicComputerUseConfig,
    safety_layer: ComputerUseSafetyLayer,
    action_executor: ActionExecutor,
    app_permissions: Arc<AppPermissionManager>,
    app_handle: Option<AppHandle>,
}

impl AnthropicComputerUseAgent {
    /// Creates a new Anthropic computer use agent.
    pub fn new(
        llm_router: Arc<RwLock<LLMRouter>>,
        app_permissions: Arc<AppPermissionManager>,
        config: AnthropicComputerUseConfig,
    ) -> Self {
        let safety_layer = ComputerUseSafetyLayer::new(config.safety.clone());
        let window_coordinator = WindowCoordinator::new(config.window.clone());
        let action_executor = ActionExecutor::new(window_coordinator);

        Self {
            llm_router,
            config,
            safety_layer,
            action_executor,
            app_permissions,
            app_handle: None,
        }
    }

    /// Sets the app handle for event emission.
    pub fn with_app_handle(mut self, app_handle: AppHandle) -> Self {
        self.app_handle = Some(app_handle);
        self
    }

    /// Executes a computer use task using the Anthropic agent loop.
    pub async fn execute(&self, user_prompt: &str) -> Result<ComputerUseResult> {
        let start = Instant::now();
        let mut actions_executed: u32 = 0;
        let mut llm_calls: u32 = 0;
        let mut messages: Vec<ChatMessage> = Vec::new();

        self.emit_event(
            "computer_use:session_started",
            &serde_json::json!({
                "prompt": user_prompt,
                "display_width": self.config.display_width_px,
                "display_height": self.config.display_height_px,
            }),
        );

        // Capture initial screenshot
        let screenshot_b64 = self.capture_screenshot_base64()?;
        let screenshot_bytes = general_purpose::STANDARD
            .decode(&screenshot_b64)
            .context("Failed to decode initial screenshot")?;

        // Build initial user message with text + screenshot
        messages.push(ChatMessage {
            role: "user".to_string(),
            content: user_prompt.to_string(),
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: Some(vec![
                ContentPart::Text {
                    text: user_prompt.to_string(),
                },
                ContentPart::Image {
                    image: ImageInput {
                        data: screenshot_bytes,
                        format: ImageFormat::Png,
                        detail: ImageDetail::High,
                    },
                },
            ]),
        });

        // Agent loop
        loop {
            // Check termination conditions
            if llm_calls >= self.config.max_iterations {
                return Ok(self.build_result(
                    false,
                    "Maximum iterations reached".to_string(),
                    actions_executed,
                    llm_calls,
                    start,
                    "max_iterations",
                ));
            }

            if start.elapsed() > self.config.max_duration {
                return Ok(self.build_result(
                    false,
                    "Task timed out".to_string(),
                    actions_executed,
                    llm_calls,
                    start,
                    "timeout",
                ));
            }

            // Call Claude via the router
            llm_calls += 1;
            let response = self.call_anthropic(&messages).await?;

            let finish_reason = response
                .finish_reason
                .as_deref()
                .unwrap_or("end_turn");

            // Build assistant message from response for conversation history
            let assistant_msg = ChatMessage {
                role: "assistant".to_string(),
                content: response.content.clone(),
                tool_calls: response.tool_calls.clone(),
                tool_call_id: None,
                multimodal_content: None,
            };
            messages.push(assistant_msg);

            // Check if there are tool calls to process
            let tool_calls = match &response.tool_calls {
                Some(tc) if !tc.is_empty() => tc.clone(),
                _ => {
                    // No tool calls — task is complete (or pause_turn with no tools)
                    if finish_reason == "pause_turn" {
                        // Continue the loop to let Claude resume
                        continue;
                    }

                    self.emit_event(
                        "computer_use:session_completed",
                        &serde_json::json!({
                            "success": true,
                            "actions_executed": actions_executed,
                            "llm_calls": llm_calls,
                            "duration_ms": start.elapsed().as_millis() as u64,
                        }),
                    );

                    return Ok(self.build_result(
                        true,
                        response.content,
                        actions_executed,
                        llm_calls,
                        start,
                        "task_complete",
                    ));
                }
            };

            // Process each tool call
            let mut tool_result_parts: Vec<ContentPart> = Vec::new();

            for tool_call in &tool_calls {
                // Only handle "computer" tool calls
                if tool_call.name != "computer" {
                    tool_result_parts.push(ContentPart::ToolResult {
                        tool_result: ToolResultInput {
                            tool_use_id: tool_call.id.clone(),
                            content: format!(
                                "Tool '{}' is not available in this environment",
                                tool_call.name
                            ),
                            is_error: true,
                            image_base64: None,
                        },
                    });
                    continue;
                }

                // Parse the action from tool_call.arguments (JSON string)
                let input: serde_json::Value =
                    serde_json::from_str(&tool_call.arguments).unwrap_or_default();

                let action_type = input
                    .get("action")
                    .and_then(|a| a.as_str())
                    .unwrap_or("screenshot");

                // Map to ComputerUseAction
                let action = match self.parse_anthropic_action(action_type, &input) {
                    Ok(a) => a,
                    Err(e) => {
                        tool_result_parts.push(ContentPart::ToolResult {
                            tool_result: ToolResultInput {
                                tool_use_id: tool_call.id.clone(),
                                content: format!("Failed to parse action: {}", e),
                                is_error: true,
                                image_base64: None,
                            },
                        });
                        continue;
                    }
                };

                // Safety check
                let decision = self
                    .safety_layer
                    .evaluate_with_session_context(&action, actions_executed);

                if !decision.allowed {
                    let reason = decision
                        .reason
                        .map(|r| {
                            serde_json::to_string(&r).unwrap_or_else(|_| format!("{r:?}"))
                        })
                        .unwrap_or_else(|| "Action blocked by safety layer".to_string());

                    tool_result_parts.push(ContentPart::ToolResult {
                        tool_result: ToolResultInput {
                            tool_use_id: tool_call.id.clone(),
                            content: format!("Action blocked: {}", reason),
                            is_error: true,
                            image_base64: None,
                        },
                    });
                    continue;
                }

                // Check app permissions for non-screenshot actions
                if action_type != "screenshot" && action_type != "zoom" {
                    if let Some(block_reason) = self.check_app_permission().await {
                        tool_result_parts.push(ContentPart::ToolResult {
                            tool_result: ToolResultInput {
                                tool_use_id: tool_call.id.clone(),
                                content: format!("Action blocked: {}", block_reason),
                                is_error: true,
                                image_base64: None,
                            },
                        });
                        continue;
                    }
                }

                // Emit action event
                self.emit_event(
                    "computer_use:action_started",
                    &serde_json::json!({
                        "action": action_type,
                        "input": input,
                        "action_number": actions_executed + 1,
                    }),
                );

                // Execute the action (screenshot actions just capture, no execution needed)
                if action_type != "screenshot" {
                    if let Err(e) = self.action_executor.execute(&action).await {
                        actions_executed += 1;
                        self.emit_event(
                            "computer_use:action_completed",
                            &serde_json::json!({
                                "action": action_type,
                                "success": false,
                                "error": e.to_string(),
                                "action_number": actions_executed,
                            }),
                        );

                        tool_result_parts.push(ContentPart::ToolResult {
                            tool_result: ToolResultInput {
                                tool_use_id: tool_call.id.clone(),
                                content: format!("Action failed: {}", e),
                                is_error: true,
                                image_base64: None,
                            },
                        });
                        continue;
                    }
                }

                actions_executed += 1;

                // Wait for UI to settle
                sleep(self.config.post_action_delay).await;

                // Capture post-action screenshot
                let post_screenshot_b64 = self.capture_screenshot_base64()?;

                self.emit_event(
                    "computer_use:action_completed",
                    &serde_json::json!({
                        "action": action_type,
                        "success": true,
                        "action_number": actions_executed,
                    }),
                );

                // Build tool result with screenshot image
                tool_result_parts.push(ContentPart::ToolResult {
                    tool_result: ToolResultInput {
                        tool_use_id: tool_call.id.clone(),
                        content: String::new(),
                        is_error: false,
                        image_base64: Some(post_screenshot_b64),
                    },
                });
            }

            // Add all tool results as a single user message
            if !tool_result_parts.is_empty() {
                messages.push(ChatMessage {
                    role: "user".to_string(),
                    content: String::new(),
                    tool_calls: None,
                    tool_call_id: None,
                    multimodal_content: Some(tool_result_parts),
                });
            }
        }
    }

    /// Calls the Anthropic API via the LLM router.
    async fn call_anthropic(&self, messages: &[ChatMessage]) -> Result<LLMResponse> {
        let router = self.llm_router.read().await;

        // The "computer" tool is recognized as a server tool by the adapter
        // via `is_anthropic_server_tool("computer")` and sent in the correct
        // schema-less format: {"type": "computer_20251124", "name": "computer", ...}
        let computer_tool = ToolDefinition {
            name: "computer".to_string(),
            description: "Computer use tool for desktop interaction".to_string(),
            parameters: serde_json::json!({
                "display_width_px": self.config.display_width_px,
                "display_height_px": self.config.display_height_px
            }),
            strict: None,
        };

        let request = LLMRequest {
            messages: messages.to_vec(),
            model: self.config.model.clone(),
            temperature: Some(0.1),
            max_tokens: Some(self.config.max_tokens),
            stream: false,
            tools: Some(vec![computer_tool]),
            ..Default::default()
        };

        let preferences = RouterPreferences {
            provider: Some(Provider::Anthropic),
            model: if self.config.model.is_empty() {
                None
            } else {
                Some(self.config.model.clone())
            },
            strategy: crate::core::llm::llm_router::RoutingStrategy::Auto,
            context: Some(RouterContext {
                requires_vision: true,
                ..Default::default()
            }),
            prefer_cloud_credits: false,
        };

        let candidates = router.candidates(&request, &preferences);
        if candidates.is_empty() {
            return Err(anyhow::anyhow!(
                "No Anthropic provider configured for computer use"
            ));
        }

        let outcome = router.invoke_candidate(&candidates[0], &request).await?;
        Ok(outcome.response)
    }

    /// Parses an Anthropic computer use action from a `ToolCall`.
    fn parse_anthropic_action(
        &self,
        action_type: &str,
        input: &serde_json::Value,
    ) -> Result<ComputerUseAction> {
        let coord = |input: &serde_json::Value| -> Option<(i32, i32)> {
            let arr = input.get("coordinate")?.as_array()?;
            Some((
                arr.first()?.as_i64()? as i32,
                arr.get(1)?.as_i64()? as i32,
            ))
        };

        match action_type {
            "screenshot" => Ok(ComputerUseAction::Screenshot {
                region: None,
                save_path: None,
            }),

            "left_click" => {
                let (x, y) = coord(input)
                    .ok_or_else(|| anyhow::anyhow!("Missing coordinate for left_click"))?;
                Ok(ComputerUseAction::Click {
                    x,
                    y,
                    button: MouseButton::Left,
                })
            }

            "right_click" => {
                let (x, y) = coord(input)
                    .ok_or_else(|| anyhow::anyhow!("Missing coordinate for right_click"))?;
                Ok(ComputerUseAction::RightClick { x, y })
            }

            "middle_click" => {
                let (x, y) = coord(input)
                    .ok_or_else(|| anyhow::anyhow!("Missing coordinate for middle_click"))?;
                Ok(ComputerUseAction::Click {
                    x,
                    y,
                    button: MouseButton::Middle,
                })
            }

            "double_click" => {
                let (x, y) = coord(input)
                    .ok_or_else(|| anyhow::anyhow!("Missing coordinate for double_click"))?;
                Ok(ComputerUseAction::DoubleClick { x, y })
            }

            "triple_click" => {
                let (x, y) = coord(input)
                    .ok_or_else(|| anyhow::anyhow!("Missing coordinate for triple_click"))?;
                Ok(ComputerUseAction::TripleClick { x, y })
            }

            "type" => {
                let text = input
                    .get("text")
                    .and_then(|t| t.as_str())
                    .unwrap_or("")
                    .to_string();
                Ok(ComputerUseAction::Type {
                    text,
                    delay_ms: 12,
                })
            }

            "key" => {
                let key_str = input
                    .get("text")
                    .and_then(|t| t.as_str())
                    .unwrap_or("")
                    .to_string();

                // Parse modifier+key combos like "ctrl+s", "super+a"
                if key_str.contains('+') {
                    let parts: Vec<&str> = key_str.split('+').collect();
                    let key = parts.last().unwrap_or(&"").to_string();
                    let modifiers: Vec<HotkeyModifier> = parts[..parts.len() - 1]
                        .iter()
                        .filter_map(|m| match m.to_lowercase().as_str() {
                            "ctrl" | "control" => Some(HotkeyModifier::Ctrl),
                            "alt" | "option" => Some(HotkeyModifier::Alt),
                            "shift" => Some(HotkeyModifier::Shift),
                            "meta" | "cmd" | "command" | "super" | "win" => {
                                Some(HotkeyModifier::Meta)
                            }
                            _ => None,
                        })
                        .collect();

                    Ok(ComputerUseAction::Hotkey { modifiers, key })
                } else {
                    let mapped = match key_str.as_str() {
                        "Return" => "enter".to_string(),
                        "BackSpace" => "backspace".to_string(),
                        _ => key_str,
                    };
                    Ok(ComputerUseAction::KeyPress { key: mapped })
                }
            }

            "mouse_move" => {
                let (x, y) = coord(input)
                    .ok_or_else(|| anyhow::anyhow!("Missing coordinate for mouse_move"))?;
                Ok(ComputerUseAction::MoveMouse {
                    x,
                    y,
                    smooth: false,
                })
            }

            "scroll" => {
                let (x, y) = coord(input).unwrap_or((0, 0));
                let direction = input
                    .get("scroll_direction")
                    .and_then(|d| d.as_str())
                    .map(|d| match d {
                        "up" => ScrollDirection::Up,
                        "left" => ScrollDirection::Left,
                        "right" => ScrollDirection::Right,
                        _ => ScrollDirection::Down,
                    })
                    .unwrap_or(ScrollDirection::Down);
                let amount = input
                    .get("scroll_amount")
                    .and_then(|a| a.as_i64())
                    .unwrap_or(3) as i32;

                Ok(ComputerUseAction::Scroll {
                    direction,
                    amount,
                    at: Some(Coordinate::new(x, y)),
                })
            }

            "left_click_drag" => {
                let (start_x, start_y) = coord(input)
                    .ok_or_else(|| anyhow::anyhow!("Missing coordinate for left_click_drag"))?;
                let end_coord = input
                    .get("end_coordinate")
                    .and_then(|c| c.as_array())
                    .and_then(|arr| {
                        Some((
                            arr.first()?.as_i64()? as i32,
                            arr.get(1)?.as_i64()? as i32,
                        ))
                    })
                    .ok_or_else(|| {
                        anyhow::anyhow!("Missing end_coordinate for left_click_drag")
                    })?;

                Ok(ComputerUseAction::Drag {
                    from: Coordinate::new(start_x, start_y),
                    to: Coordinate::new(end_coord.0, end_coord.1),
                    duration_ms: 500,
                })
            }

            "wait" => {
                let duration = input
                    .get("duration")
                    .and_then(|d| d.as_f64())
                    .unwrap_or(1.0);
                Ok(ComputerUseAction::Wait {
                    condition: WaitCondition::Duration {
                        ms: (duration * 1000.0) as u64,
                    },
                })
            }

            "zoom" => {
                let region = input
                    .get("region")
                    .and_then(|r| r.as_array())
                    .and_then(|arr| {
                        if arr.len() == 4 {
                            Some(ElementBounds::new(
                                arr[0].as_i64()? as i32,
                                arr[1].as_i64()? as i32,
                                (arr[2].as_i64()? - arr[0].as_i64()?) as u32,
                                (arr[3].as_i64()? - arr[1].as_i64()?) as u32,
                            ))
                        } else {
                            None
                        }
                    })
                    .ok_or_else(|| anyhow::anyhow!("Missing or invalid region for zoom"))?;

                Ok(ComputerUseAction::Zoom {
                    region,
                    zoom_level: 2.0,
                    capture_screenshot: true,
                })
            }

            "hold_key" => {
                let key = input
                    .get("text")
                    .and_then(|t| t.as_str())
                    .unwrap_or("")
                    .to_string();
                Ok(ComputerUseAction::KeyPress { key })
            }

            _ => Err(anyhow::anyhow!("Unknown Anthropic action: {}", action_type)),
        }
    }

    /// Captures a screenshot and returns it as a base64-encoded PNG string.
    fn capture_screenshot_base64(&self) -> Result<String> {
        let screenshot =
            capture_primary_screen().context("Failed to capture screen for computer use")?;

        let mut png_data: Vec<u8> = Vec::new();
        let mut cursor = std::io::Cursor::new(&mut png_data);
        screenshot
            .pixels
            .write_to(&mut cursor, image::ImageFormat::Png)
            .context("Failed to encode screenshot as PNG")?;

        Ok(general_purpose::STANDARD.encode(&png_data))
    }

    /// Checks if the current foreground app is permitted.
    /// Returns `Some(reason)` if blocked, `None` if allowed.
    async fn check_app_permission(&self) -> Option<String> {
        if !self.config.safety.check_app_permissions {
            return None;
        }

        // TODO: Integrate with WindowCoordinator::get_active_window() to detect
        // the foreground app and check against app_permissions. For now, all apps
        // are allowed until the platform-specific window detection is wired in.
        let _ = &self.app_permissions;
        None
    }

    /// Builds a `ComputerUseResult`.
    fn build_result(
        &self,
        success: bool,
        response: String,
        actions_executed: u32,
        llm_calls: u32,
        start: Instant,
        reason: &str,
    ) -> ComputerUseResult {
        let duration_ms = start.elapsed().as_millis() as u64;

        self.emit_event(
            "computer_use:session_completed",
            &serde_json::json!({
                "success": success,
                "actions_executed": actions_executed,
                "llm_calls": llm_calls,
                "duration_ms": duration_ms,
                "reason": reason,
            }),
        );

        ComputerUseResult {
            success,
            response,
            actions_executed,
            llm_calls,
            duration_ms,
            completion_reason: reason.to_string(),
        }
    }

    /// Emits an event via the Tauri app handle.
    fn emit_event(&self, event: &str, payload: &serde_json::Value) {
        if let Some(ref app) = self.app_handle {
            let _ = app.emit(event, payload.clone());
        }
    }
}

/// Detects the primary display's logical dimensions.
fn detect_logical_display_size() -> Result<(u32, u32)> {
    let displays = list_displays()?;
    let primary = displays
        .iter()
        .find(|d| d.is_primary)
        .or_else(|| displays.first())
        .ok_or_else(|| anyhow::anyhow!("No display found"))?;

    let logical_width = (primary.width as f32 / primary.scale_factor).round() as u32;
    let logical_height = (primary.height as f32 / primary.scale_factor).round() as u32;

    Ok((logical_width, logical_height))
}
