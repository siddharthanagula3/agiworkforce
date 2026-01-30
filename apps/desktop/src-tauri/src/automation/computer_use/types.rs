//! Core types for Computer Use capability.
//!
//! This module defines all the fundamental types used throughout the Computer Use
//! system, including actions, coordinates, screen elements, and task definitions.

use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Represents a coordinate on the screen in absolute pixels.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Coordinate {
    pub x: i32,
    pub y: i32,
}

impl Coordinate {
    /// Creates a new coordinate.
    pub const fn new(x: i32, y: i32) -> Self {
        Self { x, y }
    }

    /// Returns the center point between two coordinates.
    pub fn midpoint(self, other: Self) -> Self {
        Self {
            x: (self.x + other.x) / 2,
            y: (self.y + other.y) / 2,
        }
    }

    /// Calculates the Euclidean distance to another coordinate.
    pub fn distance_to(self, other: Self) -> f64 {
        let dx = (self.x - other.x) as f64;
        let dy = (self.y - other.y) as f64;
        (dx * dx + dy * dy).sqrt()
    }
}

impl From<(i32, i32)> for Coordinate {
    fn from((x, y): (i32, i32)) -> Self {
        Self { x, y }
    }
}

/// Bounding rectangle for a screen element.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct ElementBounds {
    pub left: i32,
    pub top: i32,
    pub width: u32,
    pub height: u32,
}

impl ElementBounds {
    /// Creates a new bounding rectangle.
    pub const fn new(left: i32, top: i32, width: u32, height: u32) -> Self {
        Self {
            left,
            top,
            width,
            height,
        }
    }

    /// Returns the center point of this bounding rectangle.
    pub fn center(&self) -> Coordinate {
        Coordinate {
            x: self.left + (self.width as i32 / 2),
            y: self.top + (self.height as i32 / 2),
        }
    }

    /// Checks if a coordinate is within this bounding rectangle.
    pub fn contains(&self, coord: Coordinate) -> bool {
        coord.x >= self.left
            && coord.x < self.left + self.width as i32
            && coord.y >= self.top
            && coord.y < self.top + self.height as i32
    }

    /// Returns the right edge x-coordinate.
    pub fn right(&self) -> i32 {
        self.left + self.width as i32
    }

    /// Returns the bottom edge y-coordinate.
    pub fn bottom(&self) -> i32 {
        self.top + self.height as i32
    }

    /// Expands the bounds by a margin on all sides.
    pub fn expand(&self, margin: i32) -> Self {
        Self {
            left: self.left - margin,
            top: self.top - margin,
            width: self.width + (margin * 2) as u32,
            height: self.height + (margin * 2) as u32,
        }
    }
}

/// Mouse button for click actions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MouseButton {
    Left,
    Right,
    Middle,
}

impl Default for MouseButton {
    fn default() -> Self {
        Self::Left
    }
}

/// Scroll direction for scroll actions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScrollDirection {
    Up,
    Down,
    Left,
    Right,
}

/// Hotkey modifier keys.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HotkeyModifier {
    Ctrl,
    Alt,
    Shift,
    Meta, // Windows key / Command key
}

/// Condition to wait for before proceeding.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WaitCondition {
    /// Wait for a fixed duration.
    Duration { ms: u64 },
    /// Wait for specific text to appear on screen.
    TextAppears { text: String, timeout_ms: u64 },
    /// Wait for specific text to disappear from screen.
    TextDisappears { text: String, timeout_ms: u64 },
    /// Wait for a visual element matching the description.
    ElementAppears {
        description: String,
        timeout_ms: u64,
    },
    /// Wait for screen to stabilize (no significant changes).
    ScreenStable {
        threshold_percent: f32,
        duration_ms: u64,
    },
    /// Wait for a window with specific title.
    WindowAppears {
        title_contains: String,
        timeout_ms: u64,
    },
}

impl WaitCondition {
    /// Returns the maximum time this condition could take.
    pub fn max_duration(&self) -> Duration {
        match self {
            WaitCondition::Duration { ms } => Duration::from_millis(*ms),
            WaitCondition::TextAppears { timeout_ms, .. }
            | WaitCondition::TextDisappears { timeout_ms, .. }
            | WaitCondition::ElementAppears { timeout_ms, .. }
            | WaitCondition::ScreenStable {
                duration_ms: timeout_ms,
                ..
            }
            | WaitCondition::WindowAppears { timeout_ms, .. } => Duration::from_millis(*timeout_ms),
        }
    }
}

/// Represents a single computer action that can be executed.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum ComputerUseAction {
    /// Single left click at coordinates.
    Click {
        x: i32,
        y: i32,
        #[serde(default)]
        button: MouseButton,
    },

    /// Double-click at coordinates.
    DoubleClick { x: i32, y: i32 },

    /// Triple-click to select entire line/paragraph.
    TripleClick { x: i32, y: i32 },

    /// Right-click to open context menu.
    RightClick { x: i32, y: i32 },

    /// Type text character by character.
    Type {
        text: String,
        /// Delay between keystrokes in milliseconds (default: 10).
        #[serde(default = "default_typing_delay")]
        delay_ms: u64,
    },

    /// Press and release a single key.
    KeyPress { key: String },

    /// Execute a keyboard hotkey combination.
    Hotkey {
        modifiers: Vec<HotkeyModifier>,
        key: String,
    },

    /// Scroll the mouse wheel.
    Scroll {
        direction: ScrollDirection,
        /// Number of scroll units (default: 3).
        #[serde(default = "default_scroll_amount")]
        amount: i32,
        /// Optional position to scroll at (uses current position if not specified).
        #[serde(skip_serializing_if = "Option::is_none")]
        at: Option<Coordinate>,
    },

    /// Drag from one point to another.
    Drag {
        from: Coordinate,
        to: Coordinate,
        /// Duration of the drag in milliseconds.
        #[serde(default = "default_drag_duration")]
        duration_ms: u32,
    },

    /// Move mouse to a position without clicking.
    MoveMouse {
        x: i32,
        y: i32,
        /// Whether to move smoothly or instantly.
        #[serde(default)]
        smooth: bool,
    },

    /// Wait for a condition before continuing.
    Wait { condition: WaitCondition },

    /// Take a screenshot and save it to a path.
    Screenshot {
        #[serde(skip_serializing_if = "Option::is_none")]
        region: Option<ElementBounds>,
        #[serde(skip_serializing_if = "Option::is_none")]
        save_path: Option<String>,
    },

    /// Focus a window by title or process name.
    FocusWindow { title: String },

    /// Open an application by name.
    LaunchApplication { name: String },

    /// Copy current selection to clipboard.
    Copy,

    /// Paste from clipboard.
    Paste,

    /// Select all content.
    SelectAll,

    /// Undo last action.
    Undo,

    /// Redo last undone action.
    Redo,

    /// Zoom into a region for detailed inspection.
    /// Used when elements are too small or unclear for accurate detection.
    Zoom {
        /// Region to zoom into (x, y, width, height).
        region: ElementBounds,
        /// Zoom level (2.0 = 2x, 4.0 = 4x, 8.0 = 8x).
        #[serde(default = "default_zoom_level")]
        zoom_level: f32,
        /// Whether to return the zoomed screenshot.
        #[serde(default = "default_capture_zoom")]
        capture_screenshot: bool,
    },
}

fn default_typing_delay() -> u64 {
    10
}

fn default_scroll_amount() -> i32 {
    3
}

fn default_drag_duration() -> u32 {
    500
}

fn default_zoom_level() -> f32 {
    2.0
}

fn default_capture_zoom() -> bool {
    true
}

impl ComputerUseAction {
    /// Returns a human-readable description of this action.
    pub fn description(&self) -> String {
        match self {
            ComputerUseAction::Click { x, y, button } => {
                format!("{:?} click at ({}, {})", button, x, y)
            }
            ComputerUseAction::DoubleClick { x, y } => format!("Double-click at ({}, {})", x, y),
            ComputerUseAction::TripleClick { x, y } => format!("Triple-click at ({}, {})", x, y),
            ComputerUseAction::RightClick { x, y } => format!("Right-click at ({}, {})", x, y),
            ComputerUseAction::Type { text, .. } => {
                let preview = if text.len() > 50 {
                    format!("{}...", &text[..50])
                } else {
                    text.clone()
                };
                format!("Type: \"{}\"", preview)
            }
            ComputerUseAction::KeyPress { key } => format!("Press key: {}", key),
            ComputerUseAction::Hotkey { modifiers, key } => {
                let mods: Vec<_> = modifiers.iter().map(|m| format!("{:?}", m)).collect();
                format!("Hotkey: {}+{}", mods.join("+"), key)
            }
            ComputerUseAction::Scroll {
                direction, amount, ..
            } => {
                format!("Scroll {:?} {} units", direction, amount)
            }
            ComputerUseAction::Drag { from, to, .. } => {
                format!("Drag from ({}, {}) to ({}, {})", from.x, from.y, to.x, to.y)
            }
            ComputerUseAction::MoveMouse { x, y, smooth } => {
                let style = if *smooth { "smoothly" } else { "instantly" };
                format!("Move mouse {} to ({}, {})", style, x, y)
            }
            ComputerUseAction::Wait { condition } => match condition {
                WaitCondition::Duration { ms } => format!("Wait {} ms", ms),
                WaitCondition::TextAppears { text, .. } => format!("Wait for text: \"{}\"", text),
                WaitCondition::TextDisappears { text, .. } => {
                    format!("Wait for text to disappear: \"{}\"", text)
                }
                WaitCondition::ElementAppears { description, .. } => {
                    format!("Wait for element: {}", description)
                }
                WaitCondition::ScreenStable { .. } => "Wait for screen to stabilize".to_string(),
                WaitCondition::WindowAppears { title_contains, .. } => {
                    format!("Wait for window: \"{}\"", title_contains)
                }
            },
            ComputerUseAction::Screenshot { region, .. } => {
                if region.is_some() {
                    "Take screenshot of region".to_string()
                } else {
                    "Take full screenshot".to_string()
                }
            }
            ComputerUseAction::FocusWindow { title } => format!("Focus window: \"{}\"", title),
            ComputerUseAction::LaunchApplication { name } => {
                format!("Launch application: {}", name)
            }
            ComputerUseAction::Copy => "Copy selection".to_string(),
            ComputerUseAction::Paste => "Paste from clipboard".to_string(),
            ComputerUseAction::SelectAll => "Select all".to_string(),
            ComputerUseAction::Undo => "Undo".to_string(),
            ComputerUseAction::Redo => "Redo".to_string(),
            ComputerUseAction::Zoom {
                region, zoom_level, ..
            } => {
                format!(
                    "Zoom {}x into region at ({}, {}) size {}x{}",
                    zoom_level, region.left, region.top, region.width, region.height
                )
            }
        }
    }

    /// Returns the estimated time this action will take in milliseconds.
    pub fn estimated_duration_ms(&self) -> u64 {
        match self {
            ComputerUseAction::Click { .. }
            | ComputerUseAction::RightClick { .. }
            | ComputerUseAction::Copy
            | ComputerUseAction::Paste
            | ComputerUseAction::SelectAll
            | ComputerUseAction::Undo
            | ComputerUseAction::Redo => 50,
            ComputerUseAction::DoubleClick { .. } => 100,
            ComputerUseAction::TripleClick { .. } => 150,
            ComputerUseAction::Type { text, delay_ms } => text.len() as u64 * delay_ms + 50,
            ComputerUseAction::KeyPress { .. } => 30,
            ComputerUseAction::Hotkey { .. } => 50,
            ComputerUseAction::Scroll { .. } => 100,
            ComputerUseAction::Drag { duration_ms, .. } => *duration_ms as u64 + 50,
            ComputerUseAction::MoveMouse { smooth, .. } => {
                if *smooth {
                    200
                } else {
                    10
                }
            }
            ComputerUseAction::Wait { condition } => condition.max_duration().as_millis() as u64,
            ComputerUseAction::Screenshot { .. } => 200,
            ComputerUseAction::FocusWindow { .. } => 100,
            ComputerUseAction::LaunchApplication { .. } => 2000,
            ComputerUseAction::Zoom { .. } => 300, // Capture + scale + encode
        }
    }
}

/// A detected UI element on the screen.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenElement {
    /// Unique identifier for this element in the current observation.
    pub id: String,

    /// Type of element (button, text_field, link, icon, etc.).
    pub element_type: String,

    /// Human-readable label or text content.
    pub label: Option<String>,

    /// Bounding rectangle in screen coordinates.
    pub bounds: ElementBounds,

    /// Confidence score from visual detection (0.0 to 1.0).
    pub confidence: f32,

    /// Whether the element appears to be interactive.
    pub is_interactive: bool,

    /// Whether the element appears focused/selected.
    pub is_focused: bool,

    /// Additional properties detected.
    #[serde(default)]
    pub properties: std::collections::HashMap<String, String>,
}

impl ScreenElement {
    /// Returns the clickable center point for this element.
    pub fn click_target(&self) -> Coordinate {
        self.bounds.center()
    }
}

/// Analysis of the current screen state.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenAnalysis {
    /// List of detected UI elements.
    pub elements: Vec<ScreenElement>,

    /// OCR-extracted text content organized by region.
    pub text_regions: Vec<TextRegion>,

    /// Overall description of what's visible on screen.
    pub screen_description: String,

    /// Detected active application/window.
    pub active_window: Option<String>,

    /// Whether a modal dialog is blocking interaction.
    pub has_modal: bool,

    /// Detected loading indicators.
    pub is_loading: bool,

    /// Any error messages detected on screen.
    pub error_messages: Vec<String>,

    /// Timestamp when analysis was performed.
    pub timestamp_ms: u64,
}

/// A region of text extracted via OCR.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextRegion {
    pub text: String,
    pub bounds: ElementBounds,
    pub confidence: f32,
}

/// A task to be executed by the Computer Use agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComputerUseTask {
    /// Unique identifier for this task.
    pub id: String,

    /// Natural language description of what to accomplish.
    pub description: String,

    /// Optional step-by-step guidance (overrides autonomous planning).
    #[serde(default)]
    pub explicit_steps: Vec<String>,

    /// Maximum time allowed for task completion.
    #[serde(default = "default_task_timeout")]
    pub timeout_ms: u64,

    /// Maximum number of actions to attempt.
    #[serde(default = "default_max_actions")]
    pub max_actions: u32,

    /// Whether to pause for confirmation before destructive actions.
    #[serde(default)]
    pub require_confirmation: bool,

    /// Application that should be focused for this task.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_application: Option<String>,

    /// Expected success indicators (text that should appear when done).
    #[serde(default)]
    pub success_indicators: Vec<String>,

    /// Context from previous tasks (for multi-step workflows).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<String>,
}

fn default_task_timeout() -> u64 {
    300_000 // 5 minutes
}

fn default_max_actions() -> u32 {
    100
}

impl Default for ComputerUseTask {
    fn default() -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            description: String::new(),
            explicit_steps: Vec::new(),
            timeout_ms: default_task_timeout(),
            max_actions: default_max_actions(),
            require_confirmation: false,
            target_application: None,
            success_indicators: Vec::new(),
            context: None,
        }
    }
}

/// Progress status for an ongoing task.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskProgress {
    /// Number of actions completed.
    pub actions_completed: u32,

    /// Current step description.
    pub current_step: String,

    /// Estimated completion percentage (0-100).
    pub estimated_percent: u8,

    /// Time elapsed since task started.
    pub elapsed_ms: u64,

    /// Whether progress is being made.
    pub making_progress: bool,

    /// Any warnings or notes about progress.
    pub warnings: Vec<String>,
}

/// Final outcome of a completed task.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskOutcome {
    /// Whether the task completed successfully.
    pub success: bool,

    /// Total actions executed.
    pub total_actions: u32,

    /// Total time taken.
    pub duration_ms: u64,

    /// Human-readable summary of what was accomplished.
    pub summary: String,

    /// Any errors encountered.
    pub errors: Vec<String>,

    /// Screenshots taken during execution (paths).
    pub screenshots: Vec<String>,

    /// Final screen state description.
    pub final_state: Option<String>,
}

impl TaskOutcome {
    /// Creates a successful outcome.
    pub fn success(total_actions: u32, duration_ms: u64, summary: String) -> Self {
        Self {
            success: true,
            total_actions,
            duration_ms,
            summary,
            errors: Vec::new(),
            screenshots: Vec::new(),
            final_state: None,
        }
    }

    /// Creates a failed outcome.
    pub fn failure(
        total_actions: u32,
        duration_ms: u64,
        summary: String,
        errors: Vec<String>,
    ) -> Self {
        Self {
            success: false,
            total_actions,
            duration_ms,
            summary,
            errors,
            screenshots: Vec::new(),
            final_state: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_coordinate_operations() {
        let c1 = Coordinate::new(0, 0);
        let c2 = Coordinate::new(100, 100);

        let mid = c1.midpoint(c2);
        assert_eq!(mid.x, 50);
        assert_eq!(mid.y, 50);

        let dist = c1.distance_to(c2);
        assert!((dist - 141.42).abs() < 0.1); // sqrt(100^2 + 100^2)
    }

    #[test]
    fn test_element_bounds() {
        let bounds = ElementBounds::new(100, 200, 50, 30);

        assert_eq!(bounds.center(), Coordinate::new(125, 215));
        assert!(bounds.contains(Coordinate::new(110, 210)));
        assert!(!bounds.contains(Coordinate::new(50, 50)));
        assert_eq!(bounds.right(), 150);
        assert_eq!(bounds.bottom(), 230);
    }

    #[test]
    fn test_action_description() {
        let click = ComputerUseAction::Click {
            x: 100,
            y: 200,
            button: MouseButton::Left,
        };
        assert!(click.description().contains("click"));
        assert!(click.description().contains("100"));

        let typ = ComputerUseAction::Type {
            text: "Hello".to_string(),
            delay_ms: 10,
        };
        assert!(typ.description().contains("Hello"));
    }

    #[test]
    fn test_wait_condition_duration() {
        let wait = WaitCondition::Duration { ms: 5000 };
        assert_eq!(wait.max_duration(), Duration::from_millis(5000));

        let text_wait = WaitCondition::TextAppears {
            text: "Loading".to_string(),
            timeout_ms: 10000,
        };
        assert_eq!(text_wait.max_duration(), Duration::from_millis(10000));
    }
}
