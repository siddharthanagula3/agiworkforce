//! Wire protocol of Anthropic's `computer_toolset_20260801` client toolset:
//! member names, call parsing, input mapping, screenshot sizing and batch
//! results. Nothing here touches the screen, the pointer or the keyboard.

use std::collections::BTreeMap;
use std::future::Future;

use serde_json::Value;

use crate::core::llm::server_tools::{ToolsetMemberConfig, COMPUTER_TOOLSET_NAME};
use crate::core::llm::{ImageInput, ToolResultInput};

use super::action_executor::parse_key;
use super::types::{
    ComputerUseAction, Coordinate, ElementBounds, HotkeyModifier, MouseButton, ScrollDirection,
    WaitCondition,
};

/// Anthropic requires exactly this text on every block that follows a failed
/// one in the same turn.
pub const BATCH_HALT_TEXT: &str = "Not executed: an earlier computer action in this turn failed.";

const ACKNOWLEDGEMENT: &str = "OK";

const VISUAL_TOKEN_PATCH_PX: u32 = 28;
const HIGH_RESOLUTION_MAX_EDGE_PX: u32 = 2576;
const HIGH_RESOLUTION_MAX_VISUAL_TOKENS: u32 = 4784;

/// A request carrying more than 20 images holds every one of them to 2000 px
/// per side, and the loop resends each screenshot it has returned.
const MAX_SCREENSHOT_SIDE_PX: u32 = 2000;

const MAX_KEY_REPEAT: u64 = 100;
const MAX_WAIT_SECS: f64 = 300.0;
const TYPING_DELAY_MS: u64 = 12;
const DRAG_DURATION_MS: u32 = 500;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ComputerMember {
    Screenshot,
    Zoom,
    LeftClick,
    RightClick,
    MiddleClick,
    DoubleClick,
    TripleClick,
    LeftClickDrag,
    MouseMove,
    LeftMouseDown,
    LeftMouseUp,
    CursorPosition,
    Scroll,
    Type,
    Key,
    HoldKey,
    Wait,
}

impl ComputerMember {
    pub const ALL: [Self; 17] = [
        Self::Screenshot,
        Self::Zoom,
        Self::LeftClick,
        Self::RightClick,
        Self::MiddleClick,
        Self::DoubleClick,
        Self::TripleClick,
        Self::LeftClickDrag,
        Self::MouseMove,
        Self::LeftMouseDown,
        Self::LeftMouseUp,
        Self::CursorPosition,
        Self::Scroll,
        Self::Type,
        Self::Key,
        Self::HoldKey,
        Self::Wait,
    ];

    pub const fn name(self) -> &'static str {
        match self {
            Self::Screenshot => "screenshot",
            Self::Zoom => "zoom",
            Self::LeftClick => "left_click",
            Self::RightClick => "right_click",
            Self::MiddleClick => "middle_click",
            Self::DoubleClick => "double_click",
            Self::TripleClick => "triple_click",
            Self::LeftClickDrag => "left_click_drag",
            Self::MouseMove => "mouse_move",
            Self::LeftMouseDown => "left_mouse_down",
            Self::LeftMouseUp => "left_mouse_up",
            Self::CursorPosition => "cursor_position",
            Self::Scroll => "scroll",
            Self::Type => "type",
            Self::Key => "key",
            Self::HoldKey => "hold_key",
            Self::Wait => "wait",
        }
    }

    pub fn from_name(name: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|member| member.name() == name)
    }

    /// Whether the desktop can carry this member out faithfully. The executor
    /// has no press-and-hold for a key or a mouse button, and the cursor
    /// position it reads is a constant on Linux.
    pub const fn has_executor(self) -> bool {
        !matches!(
            self,
            Self::LeftMouseDown | Self::LeftMouseUp | Self::CursorPosition | Self::HoldKey
        )
    }
}

/// The `configs` that withhold every member without an executor, so Claude is
/// never offered a member that could only answer with an error.
pub fn withheld_member_configs() -> BTreeMap<String, ToolsetMemberConfig> {
    ComputerMember::ALL
        .into_iter()
        .filter(|member| !member.has_executor())
        .map(|member| {
            (
                member.name().to_string(),
                ToolsetMemberConfig {
                    enabled: Some(false),
                    defer_loading: None,
                },
            )
        })
        .collect()
}

#[derive(Debug, Clone, PartialEq)]
pub struct MemberCall {
    pub id: String,
    pub name: String,
    pub toolset_name: Option<String>,
    pub input: Value,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Dispatch {
    Member(ComputerMember),
    /// A computer action this desktop cannot run: a member it withholds, or a
    /// name this toolset version does not define.
    Unavailable(String),
    /// Not a computer action at all. A custom tool may share a member's name,
    /// so the name alone never selects a member.
    Foreign,
}

impl MemberCall {
    pub fn dispatch(&self) -> Dispatch {
        if self.toolset_name.as_deref() != Some(COMPUTER_TOOLSET_NAME) {
            return Dispatch::Foreign;
        }
        match ComputerMember::from_name(&self.name) {
            Some(member) if member.has_executor() => Dispatch::Member(member),
            Some(member) => Dispatch::Unavailable(format!(
                "The {} action is not available in this environment",
                member.name()
            )),
            None => Dispatch::Unavailable(format!("Unknown computer action: {}", self.name)),
        }
    }
}

/// Every `tool_use` block of an assistant turn, in the order Claude wrote them.
pub fn tool_use_calls(content_blocks: &[Value]) -> Vec<MemberCall> {
    content_blocks
        .iter()
        .filter(|block| block["type"] == "tool_use")
        .filter_map(|block| {
            Some(MemberCall {
                id: block["id"].as_str()?.to_string(),
                name: block["name"].as_str()?.to_string(),
                toolset_name: block["toolset_name"].as_str().map(str::to_string),
                input: block.get("input").cloned().unwrap_or(Value::Null),
            })
        })
        .collect()
}

/// The size of the screenshot Claude sees against the size of the capture it
/// was resized from. Claude's coordinates are pixels of the former; the action
/// executor takes pixels of the latter.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ScreenshotFrame {
    pub width: u32,
    pub height: u32,
    pub capture_width: u32,
    pub capture_height: u32,
}

impl ScreenshotFrame {
    pub fn for_capture(capture_width: u32, capture_height: u32, scale_factor: f32) -> Self {
        let capture_width = capture_width.max(1);
        let capture_height = capture_height.max(1);
        let density = if scale_factor.is_finite() && scale_factor > 1.0 {
            f64::from(scale_factor)
        } else {
            1.0
        };
        let logical_width = ((f64::from(capture_width) / density).round() as u32).max(1);
        let logical_height = ((f64::from(capture_height) / density).round() as u32).max(1);

        let (width, height) = cap_sides(logical_width, logical_height, MAX_SCREENSHOT_SIDE_PX);
        let (width, height) = resized_size(
            width,
            height,
            HIGH_RESOLUTION_MAX_EDGE_PX,
            HIGH_RESOLUTION_MAX_VISUAL_TOKENS,
        );

        Self {
            width,
            height,
            capture_width,
            capture_height,
        }
    }

    fn point_to_capture(&self, x: i64, y: i64) -> Result<(i32, i32), String> {
        if x < 0 || y < 0 || x >= i64::from(self.width) || y >= i64::from(self.height) {
            return Err(format!(
                "Coordinate ({x}, {y}) is outside the {}x{} screenshot",
                self.width, self.height
            ));
        }
        Ok((
            scale_axis(x, self.width, self.capture_width).min(self.capture_width as i32 - 1),
            scale_axis(y, self.height, self.capture_height).min(self.capture_height as i32 - 1),
        ))
    }

    fn region_to_capture(&self, region: [i64; 4]) -> Result<ElementBounds, String> {
        let [x0, y0, x1, y1] = region;
        let inside =
            x0 >= 0 && y0 >= 0 && x1 <= i64::from(self.width) && y1 <= i64::from(self.height);
        if !inside || x1 <= x0 || y1 <= y0 {
            return Err(format!(
                "Region [{x0}, {y0}, {x1}, {y1}] is not a non-empty area inside the {}x{} screenshot",
                self.width, self.height
            ));
        }
        let left = scale_axis(x0, self.width, self.capture_width);
        let top = scale_axis(y0, self.height, self.capture_height);
        let right = scale_axis(x1, self.width, self.capture_width);
        let bottom = scale_axis(y1, self.height, self.capture_height);
        Ok(ElementBounds::new(
            left,
            top,
            (right - left).max(1) as u32,
            (bottom - top).max(1) as u32,
        ))
    }
}

fn scale_axis(value: i64, screenshot_extent: u32, capture_extent: u32) -> i32 {
    (value as f64 * f64::from(capture_extent) / f64::from(screenshot_extent)).round() as i32
}

fn cap_sides(width: u32, height: u32, max_side: u32) -> (u32, u32) {
    let longest = width.max(height);
    if longest <= max_side {
        return (width, height);
    }
    let scale = f64::from(max_side) / f64::from(longest);
    (
        ((f64::from(width) * scale).floor() as u32).clamp(1, max_side),
        ((f64::from(height) * scale).floor() as u32).clamp(1, max_side),
    )
}

pub fn visual_tokens(width: u32, height: u32) -> u32 {
    width.div_ceil(VISUAL_TOKEN_PATCH_PX) * height.div_ceil(VISUAL_TOKEN_PATCH_PX)
}

/// The largest aspect-preserving size within a model's image limits. A port of
/// the reference implementation Anthropic publishes; the toolset rejects a
/// larger screenshot instead of downscaling it.
pub fn resized_size(width: u32, height: u32, max_edge: u32, max_tokens: u32) -> (u32, u32) {
    let fits = |w: u32, h: u32| {
        w.div_ceil(VISUAL_TOKEN_PATCH_PX) * VISUAL_TOKEN_PATCH_PX <= max_edge
            && h.div_ceil(VISUAL_TOKEN_PATCH_PX) * VISUAL_TOKEN_PATCH_PX <= max_edge
            && visual_tokens(w, h) <= max_tokens
    };

    if fits(width, height) {
        return (width, height);
    }
    if height > width {
        let (resized_height, resized_width) = resized_size(height, width, max_edge, max_tokens);
        return (resized_width, resized_height);
    }

    let aspect_ratio = f64::from(width) / f64::from(height);
    let short_side = |long_side: u32| ((f64::from(long_side) / aspect_ratio).round() as u32).max(1);
    let (mut lo, mut hi) = (1, width);
    while lo + 1 < hi {
        let mid = lo + (hi - lo) / 2;
        if fits(mid, short_side(mid)) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    (lo, short_side(lo))
}

/// The size a zoomed region is returned at: its captured pixels, shrunk only as
/// far as needed to fit inside the usual screenshot.
pub fn zoom_size(region_width: u32, region_height: u32, frame: &ScreenshotFrame) -> (u32, u32) {
    let scale = (f64::from(frame.width) / f64::from(region_width.max(1)))
        .min(f64::from(frame.height) / f64::from(region_height.max(1)))
        .min(1.0);
    (
        ((f64::from(region_width) * scale).floor() as u32).clamp(1, frame.width),
        ((f64::from(region_height) * scale).floor() as u32).clamp(1, frame.height),
    )
}

#[derive(Debug, Clone)]
pub enum MemberRequest {
    Screenshot,
    /// A region of the capture, in capture pixels.
    Zoom {
        region: ElementBounds,
    },
    Input {
        action: ComputerUseAction,
        repeat: u32,
    },
}

impl MemberRequest {
    /// The action the safety layer judges before this request runs.
    pub fn safety_action(&self) -> ComputerUseAction {
        match self {
            Self::Screenshot => ComputerUseAction::Screenshot {
                region: None,
                save_path: None,
            },
            Self::Zoom { region } => ComputerUseAction::Zoom {
                region: *region,
                zoom_level: 1.0,
                capture_screenshot: true,
            },
            Self::Input { action, .. } => action.clone(),
        }
    }

    pub const fn moves_the_pointer_or_keyboard(&self) -> bool {
        matches!(self, Self::Input { .. })
    }
}

/// Turns one member call into the request the desktop runs, with every
/// coordinate moved from screenshot pixels to capture pixels. Anything the
/// executor cannot honour is an error rather than a quietly different action.
pub fn member_request(
    member: ComputerMember,
    input: &Value,
    frame: &ScreenshotFrame,
) -> Result<MemberRequest, String> {
    let name = member.name();
    let input_action = |action| MemberRequest::Input { action, repeat: 1 };

    match member {
        ComputerMember::Screenshot => Ok(MemberRequest::Screenshot),

        ComputerMember::Zoom => {
            let region = integer_array::<4>(input, "region")
                .ok_or_else(|| "zoom needs a region of [x0, y0, x1, y1]".to_string())?;
            Ok(MemberRequest::Zoom {
                region: frame.region_to_capture(region)?,
            })
        }

        ComputerMember::LeftClick
        | ComputerMember::RightClick
        | ComputerMember::MiddleClick
        | ComputerMember::DoubleClick
        | ComputerMember::TripleClick => {
            reject_modifiers(name, input)?;
            let (x, y) = required_point(name, input, "coordinate", frame)?;
            Ok(input_action(match member {
                ComputerMember::RightClick => ComputerUseAction::RightClick { x, y },
                ComputerMember::DoubleClick => ComputerUseAction::DoubleClick { x, y },
                ComputerMember::TripleClick => ComputerUseAction::TripleClick { x, y },
                ComputerMember::MiddleClick => ComputerUseAction::Click {
                    x,
                    y,
                    button: MouseButton::Middle,
                },
                _ => ComputerUseAction::Click {
                    x,
                    y,
                    button: MouseButton::Left,
                },
            }))
        }

        ComputerMember::LeftClickDrag => {
            reject_modifiers(name, input)?;
            let (from_x, from_y) = required_point(name, input, "start_coordinate", frame)?;
            let (to_x, to_y) = required_point(name, input, "coordinate", frame)?;
            Ok(input_action(ComputerUseAction::Drag {
                from: Coordinate::new(from_x, from_y),
                to: Coordinate::new(to_x, to_y),
                duration_ms: DRAG_DURATION_MS,
            }))
        }

        ComputerMember::MouseMove => {
            let (x, y) = required_point(name, input, "coordinate", frame)?;
            Ok(input_action(ComputerUseAction::MoveMouse {
                x,
                y,
                smooth: false,
            }))
        }

        ComputerMember::Scroll => {
            reject_modifiers(name, input)?;
            let direction = match input.get("scroll_direction").and_then(Value::as_str) {
                Some("up") => ScrollDirection::Up,
                Some("down") => ScrollDirection::Down,
                Some("left") => ScrollDirection::Left,
                Some("right") => ScrollDirection::Right,
                _ => {
                    return Err(
                        "scroll needs a scroll_direction of up, down, left or right".to_string()
                    )
                }
            };
            let amount = input
                .get("scroll_amount")
                .and_then(integer)
                .and_then(|amount| i32::try_from(amount).ok())
                .filter(|amount| *amount >= 0)
                .ok_or_else(|| "scroll needs a non-negative scroll_amount".to_string())?;
            let at = match input.get("coordinate") {
                None | Some(Value::Null) => None,
                Some(_) => {
                    let (x, y) = required_point(name, input, "coordinate", frame)?;
                    Some(Coordinate::new(x, y))
                }
            };
            Ok(input_action(ComputerUseAction::Scroll {
                direction,
                amount,
                at,
            }))
        }

        ComputerMember::Type => {
            let text = input
                .get("text")
                .and_then(Value::as_str)
                .ok_or_else(|| "type needs text".to_string())?;
            Ok(input_action(ComputerUseAction::Type {
                text: text.to_string(),
                delay_ms: TYPING_DELAY_MS,
            }))
        }

        ComputerMember::Key => {
            let text = input
                .get("text")
                .and_then(Value::as_str)
                .ok_or_else(|| "key needs text".to_string())?;
            let repeat = match input.get("repeat") {
                None | Some(Value::Null) => 1,
                Some(value) => value
                    .as_u64()
                    .filter(|repeat| (1..=MAX_KEY_REPEAT).contains(repeat))
                    .ok_or_else(|| format!("key repeat must be from 1 to {MAX_KEY_REPEAT}"))?
                    as u32,
            };
            Ok(MemberRequest::Input {
                action: key_action(text)?,
                repeat,
            })
        }

        ComputerMember::Wait => {
            let seconds = input
                .get("duration")
                .and_then(Value::as_f64)
                .filter(|seconds| (0.0..=MAX_WAIT_SECS).contains(seconds))
                .ok_or_else(|| {
                    format!("wait needs a duration from 0 to {MAX_WAIT_SECS} seconds")
                })?;
            Ok(input_action(ComputerUseAction::Wait {
                condition: WaitCondition::Duration {
                    ms: (seconds * 1000.0).round() as u64,
                },
            }))
        }

        ComputerMember::LeftMouseDown
        | ComputerMember::LeftMouseUp
        | ComputerMember::CursorPosition
        | ComputerMember::HoldKey => Err(format!(
            "The {name} action is not available in this environment"
        )),
    }
}

fn integer(value: &Value) -> Option<i64> {
    value.as_i64().or_else(|| {
        value
            .as_f64()
            .filter(|number| number.is_finite())
            .map(|number| number.round() as i64)
    })
}

fn integer_array<const N: usize>(input: &Value, field: &str) -> Option<[i64; N]> {
    let values = input.get(field)?.as_array()?;
    if values.len() != N {
        return None;
    }
    let mut out = [0; N];
    for (slot, value) in out.iter_mut().zip(values) {
        *slot = integer(value)?;
    }
    Some(out)
}

fn required_point(
    member: &str,
    input: &Value,
    field: &str,
    frame: &ScreenshotFrame,
) -> Result<(i32, i32), String> {
    let [x, y] = integer_array::<2>(input, field).ok_or_else(|| {
        format!("{member} needs {field} as [x, y]; this environment cannot act at the current cursor position")
    })?;
    frame.point_to_capture(x, y)
}

fn reject_modifiers(member: &str, input: &Value) -> Result<(), String> {
    match input.get("text") {
        None | Some(Value::Null) => Ok(()),
        Some(Value::String(text)) if text.is_empty() => Ok(()),
        Some(_) => Err(format!(
            "{member} cannot hold modifier keys in this environment; the action was not run"
        )),
    }
}

fn modifier(name: &str) -> Option<HotkeyModifier> {
    match name.to_ascii_lowercase().as_str() {
        "ctrl" | "control" => Some(HotkeyModifier::Ctrl),
        "alt" | "option" => Some(HotkeyModifier::Alt),
        "shift" => Some(HotkeyModifier::Shift),
        "super" | "cmd" | "command" | "meta" | "win" | "windows" => Some(HotkeyModifier::Meta),
        _ => None,
    }
}

fn executor_key_name(key: &str) -> Result<String, String> {
    let normalized = if key == "_" {
        key.to_string()
    } else {
        key.to_lowercase().replace('_', "")
    };
    if parse_key(&normalized).is_none() {
        return Err(format!("Unsupported key: {key}"));
    }
    Ok(normalized)
}

/// The safety layer compares a hotkey against its blocked list as written, so
/// modifiers go out in one fixed order whatever order Claude named them in.
const MODIFIER_ORDER: [HotkeyModifier; 4] = [
    HotkeyModifier::Ctrl,
    HotkeyModifier::Alt,
    HotkeyModifier::Shift,
    HotkeyModifier::Meta,
];

fn key_action(text: &str) -> Result<ComputerUseAction, String> {
    let (modifier_names, key) = if text == "+" {
        ("", "+")
    } else if let Some(modifier_names) = text.strip_suffix("++") {
        (modifier_names, "+")
    } else {
        text.rsplit_once('+').unwrap_or(("", text))
    };
    if key.is_empty() {
        return Err(format!("Unsupported key: {text}"));
    }
    let key = executor_key_name(key)?;

    if modifier_names.is_empty() {
        return Ok(ComputerUseAction::KeyPress { key });
    }

    let mut named = Vec::new();
    for name in modifier_names.split('+') {
        named.push(modifier(name).ok_or_else(|| format!("Unsupported modifier key: {name}"))?);
    }
    let modifiers = MODIFIER_ORDER
        .into_iter()
        .filter(|candidate| named.contains(candidate))
        .collect();
    Ok(ComputerUseAction::Hotkey { modifiers, key })
}

#[derive(Debug, Clone)]
pub struct MemberOutput {
    pub text: String,
    pub image: Option<ImageInput>,
    /// Set when the image is a full screenshot, which becomes the frame
    /// Claude's next coordinates are read against.
    pub frame: Option<ScreenshotFrame>,
}

impl MemberOutput {
    pub fn acknowledged() -> Self {
        Self {
            text: ACKNOWLEDGEMENT.to_string(),
            image: None,
            frame: None,
        }
    }

    pub fn screenshot(image: ImageInput, frame: ScreenshotFrame) -> Self {
        Self {
            text: String::new(),
            image: Some(image),
            frame: Some(frame),
        }
    }

    pub fn zoomed(image: ImageInput) -> Self {
        Self {
            text: String::new(),
            image: Some(image),
            frame: None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct BatchReport {
    /// One result per call, in call order.
    pub results: Vec<ToolResultInput>,
    pub frame: Option<ScreenshotFrame>,
    pub ended_with_screenshot: bool,
}

fn error_result(call: &MemberCall, reason: impl Into<String>) -> ToolResultInput {
    ToolResultInput {
        tool_use_id: call.id.clone(),
        content: reason.into(),
        is_error: true,
        toolset_name: call.toolset_name.clone(),
        images: Vec::new(),
    }
}

/// Runs the calls of one assistant turn in order and stops at the first
/// computer action that fails. Every call is answered, because Anthropic
/// rejects a request that leaves a `tool_use` block without a result, and each
/// result echoes the `toolset_name` of the call it answers.
pub async fn run_batch<F, Fut>(calls: &[MemberCall], mut run: F) -> BatchReport
where
    F: FnMut(ComputerMember, MemberCall) -> Fut,
    Fut: Future<Output = Result<MemberOutput, String>>,
{
    let mut report = BatchReport {
        results: Vec::with_capacity(calls.len()),
        frame: None,
        ended_with_screenshot: false,
    };
    let mut failed = false;

    for call in calls {
        report.ended_with_screenshot = false;

        let dispatch = call.dispatch();
        if dispatch == Dispatch::Foreign {
            report.results.push(error_result(
                call,
                format!("Tool '{}' is not available in this environment", call.name),
            ));
            continue;
        }
        if failed {
            report.results.push(error_result(call, BATCH_HALT_TEXT));
            continue;
        }

        let outcome = match dispatch {
            Dispatch::Member(member) => run(member, call.clone())
                .await
                .map(|output| (member, output)),
            Dispatch::Unavailable(reason) => Err(reason),
            Dispatch::Foreign => continue,
        };

        match outcome {
            Ok((member, output)) => {
                report.ended_with_screenshot = member == ComputerMember::Screenshot;
                if output.frame.is_some() {
                    report.frame = output.frame;
                }
                report.results.push(ToolResultInput {
                    tool_use_id: call.id.clone(),
                    content: output.text,
                    is_error: false,
                    toolset_name: call.toolset_name.clone(),
                    images: output.image.into_iter().collect(),
                });
            }
            Err(reason) => {
                failed = true;
                report.results.push(error_result(call, reason));
            }
        }
    }

    report
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::llm::{ImageDetail, ImageFormat};
    use serde_json::json;
    use std::sync::Mutex;

    const FRAME: ScreenshotFrame = ScreenshotFrame {
        width: 1512,
        height: 982,
        capture_width: 3024,
        capture_height: 1964,
    };

    fn png() -> ImageInput {
        ImageInput {
            data: vec![0x89, b'P', b'N', b'G'],
            format: ImageFormat::Png,
            detail: ImageDetail::High,
        }
    }

    fn request(member: ComputerMember, input: Value) -> Result<MemberRequest, String> {
        member_request(member, &input, &FRAME)
    }

    fn input_action(member: ComputerMember, input: Value) -> ComputerUseAction {
        match request(member, input) {
            Ok(MemberRequest::Input { action, .. }) => action,
            other => panic!("expected an input action, got {other:?}"),
        }
    }

    // Fixture: "A response with a three-action batch looks like this", under
    // "Batch actions" in
    // platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool.
    fn documented_batch() -> Vec<Value> {
        json!([
            {
                "type": "tool_use",
                "id": "toolu_01HqCF3nJ4Vzr8sTkPZ2wxYA",
                "name": "left_click",
                "toolset_name": "computer",
                "input": { "coordinate": [640, 60] }
            },
            {
                "type": "tool_use",
                "id": "toolu_01Ppr3sZ3TnE9m6VUu4RyH2K",
                "name": "type",
                "toolset_name": "computer",
                "input": { "text": "pictures of cats" }
            },
            {
                "type": "tool_use",
                "id": "toolu_01Xf5W1sD8Q9aBcJ7kLmN2pQ",
                "name": "screenshot",
                "toolset_name": "computer",
                "input": {}
            }
        ])
        .as_array()
        .cloned()
        .expect("fixture is an array")
    }

    async fn run_recording(
        calls: &[MemberCall],
        failing: Option<&'static str>,
    ) -> (BatchReport, Vec<String>) {
        let ran = Mutex::new(Vec::new());
        let report = run_batch(calls, |member, call| {
            ran.lock().expect("recorder lock").push(call.name.clone());
            async move {
                if failing == Some(member.name()) {
                    return Err(format!("Action failed: {} could not run", member.name()));
                }
                Ok(match member {
                    ComputerMember::Screenshot => MemberOutput::screenshot(png(), FRAME),
                    ComputerMember::Zoom => MemberOutput::zoomed(png()),
                    _ => MemberOutput::acknowledged(),
                })
            }
        })
        .await;
        (report, ran.into_inner().expect("recorder lock"))
    }

    #[test]
    fn the_toolset_has_the_seventeen_documented_members() {
        // The "Available actions" table on the same page lists these 17 names.
        let names: Vec<&str> = ComputerMember::ALL.iter().map(|m| m.name()).collect();
        assert_eq!(
            names,
            [
                "screenshot",
                "zoom",
                "left_click",
                "right_click",
                "middle_click",
                "double_click",
                "triple_click",
                "left_click_drag",
                "mouse_move",
                "left_mouse_down",
                "left_mouse_up",
                "cursor_position",
                "scroll",
                "type",
                "key",
                "hold_key",
                "wait",
            ]
        );
        for member in ComputerMember::ALL {
            assert_eq!(ComputerMember::from_name(member.name()), Some(member));
        }
        assert_eq!(ComputerMember::from_name("computer"), None);
    }

    #[test]
    fn members_without_an_executor_are_withheld_and_no_others() {
        let configs = serde_json::to_value(withheld_member_configs()).expect("configs serialise");
        assert_eq!(
            configs,
            json!({
                "cursor_position": { "enabled": false },
                "hold_key": { "enabled": false },
                "left_mouse_down": { "enabled": false },
                "left_mouse_up": { "enabled": false }
            })
        );
    }

    #[test]
    fn member_calls_are_parsed_in_order_with_their_toolset_name() {
        let calls = tool_use_calls(&documented_batch());
        assert_eq!(
            calls,
            vec![
                MemberCall {
                    id: "toolu_01HqCF3nJ4Vzr8sTkPZ2wxYA".to_string(),
                    name: "left_click".to_string(),
                    toolset_name: Some("computer".to_string()),
                    input: json!({ "coordinate": [640, 60] }),
                },
                MemberCall {
                    id: "toolu_01Ppr3sZ3TnE9m6VUu4RyH2K".to_string(),
                    name: "type".to_string(),
                    toolset_name: Some("computer".to_string()),
                    input: json!({ "text": "pictures of cats" }),
                },
                MemberCall {
                    id: "toolu_01Xf5W1sD8Q9aBcJ7kLmN2pQ".to_string(),
                    name: "screenshot".to_string(),
                    toolset_name: Some("computer".to_string()),
                    input: json!({}),
                },
            ]
        );
    }

    #[test]
    fn thinking_and_text_blocks_are_not_calls() {
        let blocks = vec![
            json!({ "type": "thinking", "thinking": "", "signature": "sig" }),
            json!({ "type": "text", "text": "Opening the settings." }),
            documented_batch().remove(2),
        ];
        let calls = tool_use_calls(&blocks);
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].name, "screenshot");
    }

    #[test]
    fn dispatch_needs_the_toolset_name_and_the_member_name_together() {
        let call = |name: &str, toolset_name: Option<&str>| MemberCall {
            id: "toolu_1".to_string(),
            name: name.to_string(),
            toolset_name: toolset_name.map(str::to_string),
            input: json!({}),
        };

        assert_eq!(
            call("screenshot", Some("computer")).dispatch(),
            Dispatch::Member(ComputerMember::Screenshot)
        );
        // A custom tool, or the browser toolset, can share a member's name.
        assert_eq!(call("screenshot", None).dispatch(), Dispatch::Foreign);
        assert_eq!(
            call("screenshot", Some("browser")).dispatch(),
            Dispatch::Foreign
        );
        assert!(matches!(
            call("hold_key", Some("computer")).dispatch(),
            Dispatch::Unavailable(_)
        ));
        assert!(matches!(
            call("teleport", Some("computer")).dispatch(),
            Dispatch::Unavailable(_)
        ));
    }

    #[tokio::test]
    async fn a_batch_runs_in_order_and_answers_every_call() {
        let calls = tool_use_calls(&documented_batch());
        let (report, ran) = run_recording(&calls, None).await;

        assert_eq!(ran, ["left_click", "type", "screenshot"]);
        assert_eq!(report.results.len(), 3);
        for (call, result) in calls.iter().zip(&report.results) {
            assert_eq!(result.tool_use_id, call.id);
            assert_eq!(result.toolset_name.as_deref(), Some("computer"));
            assert!(!result.is_error);
        }
        assert_eq!(report.results[0].content, "OK");
        assert!(report.results[0].images.is_empty());
        assert_eq!(report.results[1].content, "OK");
        assert_eq!(report.results[2].content, "");
        assert_eq!(report.results[2].images.len(), 1);
        assert!(report.ended_with_screenshot);
        assert_eq!(report.frame, Some(FRAME));
    }

    #[tokio::test]
    async fn a_failure_stops_the_batch_and_later_calls_get_the_halt_text() {
        let calls = tool_use_calls(&documented_batch());
        let (report, ran) = run_recording(&calls, Some("left_click")).await;

        assert_eq!(ran, ["left_click"]);
        assert_eq!(report.results.len(), 3);
        assert!(report.results[0].is_error);
        assert_eq!(
            report.results[0].content,
            "Action failed: left_click could not run"
        );
        for result in &report.results[1..] {
            assert!(result.is_error);
            assert_eq!(
                result.content,
                "Not executed: an earlier computer action in this turn failed."
            );
            assert_eq!(result.toolset_name.as_deref(), Some("computer"));
            assert!(result.images.is_empty());
        }
        assert!(!report.ended_with_screenshot);
        assert_eq!(report.frame, None);
    }

    #[tokio::test]
    async fn a_failure_in_the_middle_keeps_earlier_results() {
        let calls = tool_use_calls(&documented_batch());
        let (report, ran) = run_recording(&calls, Some("type")).await;

        assert_eq!(ran, ["left_click", "type"]);
        assert!(!report.results[0].is_error);
        assert_eq!(report.results[0].content, "OK");
        assert!(report.results[1].is_error);
        assert!(report.results[2].is_error);
        assert_eq!(report.results[2].content, BATCH_HALT_TEXT);
    }

    #[tokio::test]
    async fn a_withheld_or_unknown_member_is_an_error_and_never_runs() {
        for name in ["hold_key", "left_mouse_down", "cursor_position", "teleport"] {
            let calls = vec![
                MemberCall {
                    id: "toolu_first".to_string(),
                    name: name.to_string(),
                    toolset_name: Some("computer".to_string()),
                    input: json!({ "text": "shift", "duration": 2 }),
                },
                MemberCall {
                    id: "toolu_second".to_string(),
                    name: "left_click".to_string(),
                    toolset_name: Some("computer".to_string()),
                    input: json!({ "coordinate": [10, 10] }),
                },
            ];
            let (report, ran) = run_recording(&calls, None).await;

            assert!(ran.is_empty(), "{name} must not reach the executor");
            assert!(report.results[0].is_error);
            assert_eq!(report.results[0].toolset_name.as_deref(), Some("computer"));
            assert_eq!(report.results[1].content, BATCH_HALT_TEXT);
        }
    }

    #[tokio::test]
    async fn a_same_named_custom_tool_is_refused_without_a_toolset_name() {
        let calls = vec![
            MemberCall {
                id: "toolu_custom".to_string(),
                name: "screenshot".to_string(),
                toolset_name: None,
                input: json!({}),
            },
            MemberCall {
                id: "toolu_member".to_string(),
                name: "screenshot".to_string(),
                toolset_name: Some("computer".to_string()),
                input: json!({}),
            },
        ];
        let (report, ran) = run_recording(&calls, None).await;

        assert_eq!(ran, ["screenshot"]);
        assert!(report.results[0].is_error);
        assert_eq!(report.results[0].toolset_name, None);
        assert!(!report.results[1].is_error);
        assert_eq!(report.results[1].toolset_name.as_deref(), Some("computer"));
    }

    #[test]
    fn member_inputs_carry_no_action_field_and_map_to_executor_actions() {
        // Fixtures: the "Example actions" accordion on the same page.
        assert!(matches!(
            input_action(
                ComputerMember::LeftClick,
                json!({ "coordinate": [500, 300] })
            ),
            ComputerUseAction::Click {
                x: 1000,
                y: 600,
                button: MouseButton::Left
            }
        ));
        assert!(matches!(
            input_action(
                ComputerMember::LeftClickDrag,
                json!({ "start_coordinate": [200, 300], "coordinate": [600, 300] })
            ),
            ComputerUseAction::Drag {
                from: Coordinate { x: 400, y: 600 },
                to: Coordinate { x: 1200, y: 600 },
                ..
            }
        ));
        assert!(matches!(
            input_action(
                ComputerMember::Scroll,
                json!({ "coordinate": [500, 400], "scroll_direction": "down", "scroll_amount": 3 })
            ),
            ComputerUseAction::Scroll {
                direction: ScrollDirection::Down,
                amount: 3,
                at: Some(Coordinate { x: 1000, y: 800 })
            }
        ));
        assert!(matches!(
            input_action(ComputerMember::RightClick, json!({ "coordinate": [1, 2] })),
            ComputerUseAction::RightClick { x: 2, y: 4 }
        ));
        assert!(matches!(
            input_action(ComputerMember::MiddleClick, json!({ "coordinate": [1, 2] })),
            ComputerUseAction::Click {
                button: MouseButton::Middle,
                ..
            }
        ));
        assert!(matches!(
            input_action(ComputerMember::DoubleClick, json!({ "coordinate": [1, 2] })),
            ComputerUseAction::DoubleClick { x: 2, y: 4 }
        ));
        assert!(matches!(
            input_action(ComputerMember::TripleClick, json!({ "coordinate": [1, 2] })),
            ComputerUseAction::TripleClick { x: 2, y: 4 }
        ));
        assert!(matches!(
            input_action(ComputerMember::MouseMove, json!({ "coordinate": [1, 2] })),
            ComputerUseAction::MoveMouse {
                x: 2,
                y: 4,
                smooth: false
            }
        ));
        assert!(matches!(
            input_action(ComputerMember::Type, json!({ "text": "pictures of cats" })),
            ComputerUseAction::Type { ref text, .. } if text == "pictures of cats"
        ));
        assert!(matches!(
            input_action(ComputerMember::Wait, json!({ "duration": 1.5 })),
            ComputerUseAction::Wait {
                condition: WaitCondition::Duration { ms: 1500 }
            }
        ));
        assert!(matches!(
            request(ComputerMember::Screenshot, json!({})),
            Ok(MemberRequest::Screenshot)
        ));
    }

    #[test]
    fn scroll_without_a_coordinate_scrolls_where_the_cursor_is() {
        assert!(matches!(
            input_action(
                ComputerMember::Scroll,
                json!({ "scroll_direction": "up", "scroll_amount": 2 })
            ),
            ComputerUseAction::Scroll {
                direction: ScrollDirection::Up,
                amount: 2,
                at: None
            }
        ));
    }

    #[test]
    fn key_honours_repeat() {
        // Fixture: "Press Tab four times" in the same accordion.
        match request(ComputerMember::Key, json!({ "text": "Tab", "repeat": 4 })) {
            Ok(MemberRequest::Input {
                action: ComputerUseAction::KeyPress { key },
                repeat,
            }) => {
                assert_eq!(key, "tab");
                assert_eq!(repeat, 4);
            }
            other => panic!("unexpected request: {other:?}"),
        }
        assert!(matches!(
            request(ComputerMember::Key, json!({ "text": "Tab" })),
            Ok(MemberRequest::Input { repeat: 1, .. })
        ));
        for repeat in [json!(0), json!(101), json!(-1), json!("4")] {
            assert!(request(
                ComputerMember::Key,
                json!({ "text": "Tab", "repeat": repeat })
            )
            .is_err());
        }
    }

    #[test]
    fn key_combinations_become_hotkeys_in_a_fixed_modifier_order() {
        match input_action(ComputerMember::Key, json!({ "text": "ctrl+s" })) {
            ComputerUseAction::Hotkey { modifiers, key } => {
                assert_eq!(modifiers, [HotkeyModifier::Ctrl]);
                assert_eq!(key, "s");
            }
            other => panic!("unexpected action: {other:?}"),
        }
        match input_action(ComputerMember::Key, json!({ "text": "alt+ctrl+Delete" })) {
            ComputerUseAction::Hotkey { modifiers, key } => {
                assert_eq!(modifiers, [HotkeyModifier::Ctrl, HotkeyModifier::Alt]);
                assert_eq!(key, "delete");
            }
            other => panic!("unexpected action: {other:?}"),
        }
        match input_action(
            ComputerMember::Key,
            json!({ "text": "super+shift+Page_Down" }),
        ) {
            ComputerUseAction::Hotkey { modifiers, key } => {
                assert_eq!(modifiers, [HotkeyModifier::Shift, HotkeyModifier::Meta]);
                assert_eq!(key, "pagedown");
            }
            other => panic!("unexpected action: {other:?}"),
        }
        assert!(matches!(
            input_action(ComputerMember::Key, json!({ "text": "Return" })),
            ComputerUseAction::KeyPress { ref key } if key == "return"
        ));
        assert!(matches!(
            input_action(ComputerMember::Key, json!({ "text": "ctrl++" })),
            ComputerUseAction::Hotkey { ref key, .. } if key == "+"
        ));
    }

    #[test]
    fn what_the_executor_cannot_honour_is_an_error_not_a_different_action() {
        let refused = [
            (ComputerMember::Key, json!({ "text": "hyper+s" })),
            (ComputerMember::Key, json!({ "text": "XF86AudioMute" })),
            (ComputerMember::Key, json!({ "text": "shift" })),
            (ComputerMember::Key, json!({ "text": "ctrl+" })),
            (ComputerMember::Key, json!({})),
            (ComputerMember::Type, json!({})),
            (ComputerMember::LeftClick, json!({})),
            (
                ComputerMember::LeftClick,
                json!({ "coordinate": [500, 300], "text": "shift" }),
            ),
            (
                ComputerMember::Scroll,
                json!({ "scroll_direction": "down", "scroll_amount": 3, "text": "ctrl" }),
            ),
            (ComputerMember::Scroll, json!({ "scroll_amount": 3 })),
            (
                ComputerMember::Scroll,
                json!({ "scroll_direction": "diagonal", "scroll_amount": 3 }),
            ),
            (
                ComputerMember::Scroll,
                json!({ "scroll_direction": "down" }),
            ),
            (
                ComputerMember::LeftClickDrag,
                json!({ "coordinate": [600, 300] }),
            ),
            (ComputerMember::MouseMove, json!({ "coordinate": [1] })),
            (ComputerMember::Wait, json!({ "duration": 301 })),
            (ComputerMember::Wait, json!({ "duration": -1 })),
            (ComputerMember::Wait, json!({})),
            (ComputerMember::Zoom, json!({})),
            (
                ComputerMember::HoldKey,
                json!({ "text": "shift", "duration": 1 }),
            ),
            (ComputerMember::LeftMouseDown, json!({})),
            (ComputerMember::LeftMouseUp, json!({})),
            (ComputerMember::CursorPosition, json!({})),
        ];
        for (member, input) in refused {
            assert!(
                request(member, input.clone()).is_err(),
                "{} accepted {input}",
                member.name()
            );
        }
    }

    #[test]
    fn coordinates_outside_the_screenshot_are_refused() {
        for coordinate in [json!([1512, 10]), json!([10, 982]), json!([-1, 10])] {
            assert!(request(
                ComputerMember::LeftClick,
                json!({ "coordinate": coordinate })
            )
            .is_err());
        }
        assert!(matches!(
            input_action(
                ComputerMember::LeftClick,
                json!({ "coordinate": [1511, 981] })
            ),
            ComputerUseAction::Click {
                x: 3022,
                y: 1962,
                ..
            }
        ));
    }

    #[test]
    fn zoom_regions_move_to_capture_pixels() {
        // Fixture: "Zoom in to inspect a region at full resolution".
        match request(
            ComputerMember::Zoom,
            json!({ "region": [100, 200, 400, 350] }),
        ) {
            Ok(MemberRequest::Zoom { region }) => {
                assert_eq!(
                    (region.left, region.top, region.width, region.height),
                    (200, 400, 600, 300)
                );
            }
            other => panic!("unexpected request: {other:?}"),
        }
        for region in [
            json!([400, 200, 100, 350]),
            json!([100, 200, 100, 350]),
            json!([0, 0, 1513, 982]),
            json!([0, 0, 10]),
        ] {
            assert!(request(ComputerMember::Zoom, json!({ "region": region })).is_err());
        }
    }

    #[test]
    fn a_zoomed_region_keeps_its_pixels_unless_it_outgrows_the_screenshot() {
        assert_eq!(zoom_size(600, 300, &FRAME), (600, 300));
        assert_eq!(zoom_size(3024, 1964, &FRAME), (1512, 982));
        assert_eq!(zoom_size(3024, 200, &FRAME), (1512, 100));
    }

    // Fixtures: the table under "Resolution and token cost" in
    // platform.claude.com/docs/en/build-with-claude/vision, and the A4 example
    // in platform.claude.com/docs/en/build-with-claude/vision-coordinates.
    #[test]
    fn resizing_matches_the_published_sizes() {
        assert_eq!(resized_size(3840, 2160, 2576, 4784), (2576, 1449));
        assert_eq!(visual_tokens(2576, 1449), 4784);
        assert_eq!(resized_size(1920, 1080, 2576, 4784), (1920, 1080));
        assert_eq!(visual_tokens(1920, 1080), 2691);
        assert_eq!(resized_size(2000, 1500, 2576, 4784), (2000, 1500));
        assert_eq!(visual_tokens(2000, 1500), 3888);
        assert_eq!(resized_size(1920, 1080, 1568, 1568), (1456, 819));
        assert_eq!(resized_size(2000, 1500, 1568, 1568), (1269, 952));
        assert_eq!(resized_size(1075, 1520, 1568, 1568), (924, 1307));
        assert_eq!(resized_size(1000, 1000, 1568, 1568), (1000, 1000));
    }

    #[test]
    fn screenshots_are_sized_in_logical_pixels_and_inside_every_limit() {
        assert_eq!(
            ScreenshotFrame::for_capture(3024, 1964, 2.0),
            ScreenshotFrame {
                width: 1512,
                height: 982,
                capture_width: 3024,
                capture_height: 1964,
            }
        );
        assert_eq!(
            ScreenshotFrame::for_capture(1920, 1080, 1.0),
            ScreenshotFrame {
                width: 1920,
                height: 1080,
                capture_width: 1920,
                capture_height: 1080,
            }
        );

        for (width, height, scale) in [
            (5120, 2880, 2.0),
            (5120, 2880, 1.0),
            (3840, 2160, 1.0),
            (2880, 5120, 1.0),
            (7680, 1080, 1.0),
            (1, 1, 0.0),
        ] {
            let frame = ScreenshotFrame::for_capture(width, height, scale);
            assert!(frame.width >= 1 && frame.height >= 1);
            assert!(
                frame.width <= MAX_SCREENSHOT_SIDE_PX && frame.height <= MAX_SCREENSHOT_SIDE_PX
            );
            assert!(frame.width <= frame.capture_width && frame.height <= frame.capture_height);
            assert!(
                visual_tokens(frame.width, frame.height) <= HIGH_RESOLUTION_MAX_VISUAL_TOKENS,
                "{width}x{height}@{scale} became {}x{}",
                frame.width,
                frame.height
            );
        }
    }
}
