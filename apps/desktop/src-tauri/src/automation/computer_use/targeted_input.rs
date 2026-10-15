//! Clicks, typing and toggles aimed at one named app. Every caller outside
//! the observe-plan-act loop goes through here, so each action passes the
//! consent and per-app gates, brings the app forward, and is held to that
//! app's process before any input is sent.

use std::collections::HashMap;
use std::sync::Arc;

use serde_json::Value;

use super::run_start::FrontAppState;
use super::target_app::{
    bring_to_front, ensure_element_in_target, ensure_point_in_target, frontmost_app,
    resolve_target_app, same_app, TargetApp,
};
use crate::automation::input::{KeyboardSimulator, MouseButton};
use crate::automation::types::ElementQuery;
use crate::automation::AutomationService;

pub const TARGET_APP_PARAMETER: &str = "The app to use, by its name as shown in the Dock (\"Notes\") or its bundle id (\"com.apple.Notes\"). It must be running; it is brought to the front, and the user must have allowed it for computer use.";

pub const APP_REQUIRED: &str = "Name the app to use in `app`, as it appears in the Dock or by bundle id. It is brought to the front before anything is clicked or typed.";

const MIN_COORDINATE: i64 = -16_000;
const MAX_COORDINATE: i64 = 32_000;
const FOCUS_SETTLE: std::time::Duration = std::time::Duration::from_millis(100);
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum UiTarget {
    Coordinates {
        x: i32,
        y: i32,
    },
    ElementId(String),
    Text(String),
    /// Whatever already has keyboard focus in the app; never parsed from a
    /// model's arguments, only used by a replayed script step with no target.
    Focused,
}

impl UiTarget {
    /// Reads `{"coordinates":{"x","y"}}`, `{"x","y"}`, `{"element_id"}` or
    /// `{"text"}`, in that order.
    pub fn parse(target: &Value) -> Result<Self, String> {
        let coordinate_source = target.get("coordinates").unwrap_or(target);
        if let Some(x) = coordinate_source.get("x").and_then(Value::as_i64) {
            let y = coordinate_source
                .get("y")
                .and_then(Value::as_i64)
                .ok_or_else(|| "Target coordinates must include both x and y".to_string())?;
            if !(MIN_COORDINATE..=MAX_COORDINATE).contains(&x)
                || !(MIN_COORDINATE..=MAX_COORDINATE).contains(&y)
            {
                return Err(format!(
                    "Target coordinates out of bounds: ({x}, {y}). Must be between {MIN_COORDINATE} and {MAX_COORDINATE}"
                ));
            }
            return Ok(Self::Coordinates {
                x: x as i32,
                y: y as i32,
            });
        }
        if let Some(element_id) = target.get("element_id").and_then(Value::as_str) {
            return Ok(Self::ElementId(element_id.to_string()));
        }
        if let Some(text) = target.get("text").and_then(Value::as_str) {
            return Ok(Self::Text(text.to_string()));
        }
        Err("Target needs coordinates, element_id, or text".to_string())
    }

    pub fn kind(&self) -> &'static str {
        match self {
            Self::Coordinates { .. } => "coordinates",
            Self::ElementId(_) => "element_id",
            Self::Text(_) => "text",
            Self::Focused => "focused",
        }
    }
}

/// What an action landed on, for the caller to report.
#[derive(Debug, Clone)]
pub struct ActedOn {
    pub app: String,
    pub target_kind: &'static str,
    pub element_id: Option<String>,
}

/// The `app` argument, trimmed, or `None` when it is missing or blank.
pub fn app_argument(arguments: &HashMap<String, Value>) -> Option<&str> {
    arguments
        .get("app")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|query| !query.is_empty())
}

/// `run_id` names the observe-plan-act run an action belongs to, if any, so a
/// run's own routed steps are not refused as a second owner of the desktop.
pub async fn click_in_app(
    handle: &tauri::AppHandle,
    app_query: &str,
    target: &UiTarget,
    button: MouseButton,
    run_id: Option<&str>,
) -> Result<ActedOn, String> {
    let (automation, app) = take_desktop_target(handle, app_query, run_id).await?;
    if let UiTarget::Coordinates { x, y } = *target {
        ensure_point_in_target(&automation, &app, x, y)?;
        click_point(&automation, x, y, button).await?;
        return Ok(acted_on(&app, target, None));
    }
    if !matches!(button, MouseButton::Left) {
        return Err(
            "element_id and text targets support only left-button invocation; use coordinates for right or middle click"
                .to_string(),
        );
    }
    let element_id = element_in_target(&automation, &app, target)?;
    automation
        .native
        .invoke(&element_id)
        .map_err(|e| format!("Failed to invoke element: {e}"))?;
    Ok(acted_on(&app, target, Some(element_id)))
}

pub async fn type_in_app(
    handle: &tauri::AppHandle,
    app_query: &str,
    target: &UiTarget,
    text: &str,
    run_id: Option<&str>,
) -> Result<ActedOn, String> {
    if text.is_empty() {
        return Err("Text must not be empty".to_string());
    }
    let (automation, app) = take_desktop_target(handle, app_query, run_id).await?;
    let element_id = if let UiTarget::Coordinates { x, y } = *target {
        ensure_point_in_target(&automation, &app, x, y)?;
        click_point(&automation, x, y, MouseButton::Left)
            .await
            .map_err(|e| format!("Failed to focus coordinates before typing: {e}"))?;
        None
    } else if *target == UiTarget::Focused {
        None
    } else {
        let element_id = element_in_target(&automation, &app, target)?;
        automation
            .native
            .set_focus(&element_id)
            .map_err(|e| format!("Failed to focus element: {e}"))?;
        Some(element_id)
    };
    tokio::time::sleep(FOCUS_SETTLE).await;

    let mut typing = NamedAppTyping {
        handle,
        automation: &automation,
        app: &app,
    };
    type_in_chunks(&mut typing, text, TYPING_CHUNK_CHARS)
        .await
        .map_err(|stopped| stopped.to_string())?;
    Ok(acted_on(&app, target, element_id))
}

pub async fn toggle_in_app(
    handle: &tauri::AppHandle,
    app_query: &str,
    element_id: &str,
    run_id: Option<&str>,
) -> Result<ActedOn, String> {
    let (automation, app) = take_desktop_target(handle, app_query, run_id).await?;
    let target = UiTarget::ElementId(element_id.to_string());
    let element_id = element_in_target(&automation, &app, &target)?;
    automation
        .native
        .toggle(&element_id)
        .map_err(|e| format!("Failed to toggle element: {e}"))?;
    Ok(acted_on(&app, &target, Some(element_id)))
}

/// Raises one of the named app's windows, chosen by title. A window of the
/// same name in another app is never the one raised.
pub async fn focus_window_in_app(
    handle: &tauri::AppHandle,
    app_query: &str,
    window: &str,
    run_id: Option<&str>,
) -> Result<ActedOn, String> {
    let (automation, app) = take_desktop_target(handle, app_query, run_id).await?;
    let wanted = window.to_lowercase();
    let found = automation
        .native
        .list_windows()
        .map_err(|e| format!("Failed to list windows: {e}"))?
        .into_iter()
        .find(|candidate| {
            (candidate.id == window || candidate.name.to_lowercase().contains(&wanted))
                && ensure_element_in_target(&automation, &app, &candidate.id).is_ok()
        })
        .ok_or_else(|| format!("No window named '{window}' in '{}'", app.name))?;
    automation
        .native
        .set_focus(&found.id)
        .map_err(|e| format!("Failed to focus window: {e}"))?;
    Ok(acted_on(
        &app,
        &UiTarget::ElementId(found.id.clone()),
        Some(found.id),
    ))
}

/// The gates for an element action that needs no activation, such as reading
/// a value: what is read is another app's content, so the app is named, passes
/// consent and the per-app check, and must own the element.
pub async fn element_in_gated_app(
    handle: &tauri::AppHandle,
    app_query: &str,
    element_id: &str,
    run_id: Option<&str>,
) -> Result<(Arc<AutomationService>, TargetApp), String> {
    let automation = crate::automation::shared_service(handle)?;
    let app = resolve_target_app(app_query)?;
    crate::sys::commands::computer_use::authorize_desktop_action(handle, &app, run_id).await?;
    ensure_element_in_target(&automation, &app, element_id)?;
    Ok((automation, app))
}

/// The app in front, judged before the run loop captures the screen: an app
/// it may use, this app's own window, or one it may not touch. A frame of the
/// last two is never taken, let alone sent to a model.
pub async fn front_app_state(handle: &tauri::AppHandle) -> FrontAppState {
    judged_front_app(handle).await.0
}

/// The verdict on the app in front together with which app it was, so a frame
/// taken on an `Allowed` verdict can carry the identity of the app it shows.
pub async fn judged_front_app(handle: &tauri::AppHandle) -> (FrontAppState, Option<TargetApp>) {
    let automation = match crate::automation::shared_service(handle) {
        Ok(automation) => automation,
        Err(unavailable) => return (FrontAppState::Refused(unavailable), None),
    };
    let Some(front) = frontmost_app(&automation) else {
        return (
            FrontAppState::Refused(FRONT_APP_UNIDENTIFIED.to_string()),
            None,
        );
    };
    if crate::sys::commands::computer_use::is_own_app(handle, &front) {
        return (FrontAppState::OwnApp, Some(front));
    }
    match crate::sys::commands::computer_use::refuse_app(handle, &front).await {
        Ok(()) => (FrontAppState::Allowed, Some(front)),
        Err(refusal) => (FrontAppState::Refused(refusal), Some(front)),
    }
}

/// Before a run launches an app or raises one of its windows: judged by bundle
/// id when it is running, and by name when it is not, so neither path puts a
/// refuse-listed or unapproved app on screen for the next capture.
pub async fn ensure_app_may_be_raised(
    handle: &tauri::AppHandle,
    app_name: &str,
) -> Result<(), String> {
    match resolve_target_app(app_name) {
        Ok(app) => crate::sys::commands::computer_use::refuse_app(handle, &app).await,
        Err(_) => crate::sys::commands::computer_use::refuse_app_named(handle, app_name).await,
    }
}

const FRONT_APP_UNIDENTIFIED: &str =
    "The app in front could not be identified, so nothing was clicked or typed.";

/// The app in front is no longer the one the plan was made for. Input is
/// never redirected to the newcomer, allowed or not: the plan's coordinates
/// and text were chosen for a different screen, so the caller observes again.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FrontAppChanged {
    pub planned: String,
    pub front: String,
}

impl std::fmt::Display for FrontAppChanged {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "This step was planned for '{}', but '{}' is in front now, so nothing was sent to it.",
            self.planned, self.front
        )
    }
}

impl std::error::Error for FrontAppChanged {}

/// Why a raw event was not sent.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RawInputRefusal {
    /// Another app took focus since the frame the plan was made on.
    FrontAppChanged(FrontAppChanged),
    /// The app in front, or a point the event touches, may not be used.
    Refused(String),
}

fn front_app_still_planned(planned: &TargetApp, front: &TargetApp) -> Result<(), FrontAppChanged> {
    if same_app(planned, front) {
        Ok(())
    } else {
        Err(FrontAppChanged {
            planned: planned.name.clone(),
            front: front.name.clone(),
        })
    }
}

/// For the observe-plan-act loop, called immediately before each raw pointer
/// or keyboard event. `planned_for` is the app that was in front in the frame
/// the plan was made on. The app in front now must be that same app; it is
/// then judged again (own window, refuse-list, per-app registry), and every
/// point the event touches must be known to lie on one of its windows.
pub async fn guard_front_app_input(
    handle: &tauri::AppHandle,
    planned_for: &TargetApp,
    points: &[(i32, i32)],
) -> Result<(), RawInputRefusal> {
    let automation = crate::automation::shared_service(handle).map_err(RawInputRefusal::Refused)?;
    let front = frontmost_app(&automation)
        .ok_or_else(|| RawInputRefusal::Refused(FRONT_APP_UNIDENTIFIED.to_string()))?;
    front_app_still_planned(planned_for, &front).map_err(RawInputRefusal::FrontAppChanged)?;
    crate::sys::commands::computer_use::confirm_target_in_front(
        handle,
        &front,
        Some(front.clone()),
    )
    .await
    .map_err(RawInputRefusal::Refused)?;
    for &(x, y) in points {
        ensure_point_in_target(&automation, &front, x, y).map_err(RawInputRefusal::Refused)?;
    }
    Ok(())
}

/// Text is typed a few characters at a time, with the front app checked
/// before each run of them, so focus moving mid-sentence costs at most this
/// many characters in the wrong place rather than the rest of the text.
pub const TYPING_CHUNK_CHARS: usize = 12;

/// Typing that stopped part-way, with how far it got.
#[derive(Debug)]
pub struct TypingStopped {
    pub typed: usize,
    pub total: usize,
    pub front_app_changed: bool,
    pub cause: String,
}

impl std::fmt::Display for TypingStopped {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "Typed {} of {} characters, then stopped. {}",
            self.typed, self.total, self.cause
        )
    }
}

impl std::error::Error for TypingStopped {}

/// What chunked typing needs: a check of the app in front, and a way to send.
#[async_trait::async_trait]
pub trait TypingSink: Send {
    async fn check_front_app(&mut self) -> Result<(), RawInputRefusal>;
    async fn send(&mut self, chunk: &str) -> Result<(), String>;
}

fn typing_chunks(text: &str, chunk_chars: usize) -> Vec<&str> {
    let chunk_chars = chunk_chars.max(1);
    let mut chunks = Vec::new();
    let mut start = 0;
    let mut count = 0;
    for (index, _) in text.char_indices() {
        if count == chunk_chars {
            chunks.push(&text[start..index]);
            start = index;
            count = 0;
        }
        count += 1;
    }
    if start < text.len() {
        chunks.push(&text[start..]);
    }
    chunks
}

/// Sends `text` in bounded chunks, checking the front app before each one. It
/// stops at the first check or send that fails and reports how much went out.
pub async fn type_in_chunks<S: TypingSink + ?Sized>(
    sink: &mut S,
    text: &str,
    chunk_chars: usize,
) -> Result<(), TypingStopped> {
    let total = text.chars().count();
    let mut typed = 0;
    for chunk in typing_chunks(text, chunk_chars) {
        if let Err(refusal) = sink.check_front_app().await {
            let (front_app_changed, cause) = match refusal {
                RawInputRefusal::FrontAppChanged(changed) => (true, changed.to_string()),
                RawInputRefusal::Refused(reason) => (false, reason),
            };
            return Err(TypingStopped {
                typed,
                total,
                front_app_changed,
                cause,
            });
        }
        sink.send(chunk).await.map_err(|cause| TypingStopped {
            typed,
            total,
            front_app_changed: false,
            cause,
        })?;
        typed += chunk.chars().count();
    }
    Ok(())
}

/// Typing aimed at a named app: before each chunk that app must still be the
/// one in front and still pass the gates it passed when it was raised.
struct NamedAppTyping<'a> {
    handle: &'a tauri::AppHandle,
    automation: &'a AutomationService,
    app: &'a TargetApp,
}

#[async_trait::async_trait]
impl TypingSink for NamedAppTyping<'_> {
    async fn check_front_app(&mut self) -> Result<(), RawInputRefusal> {
        let front = frontmost_app(self.automation)
            .ok_or_else(|| RawInputRefusal::Refused(FRONT_APP_UNIDENTIFIED.to_string()))?;
        front_app_still_planned(self.app, &front).map_err(RawInputRefusal::FrontAppChanged)?;
        crate::sys::commands::computer_use::confirm_target_in_front(
            self.handle,
            self.app,
            Some(front),
        )
        .await
        .map_err(RawInputRefusal::Refused)
    }

    async fn send(&mut self, chunk: &str) -> Result<(), String> {
        let automation = self.automation;
        let mut shared_keyboard = automation.keyboard.lock().await;
        let sent = match shared_keyboard.as_mut() {
            Some(keyboard) => keyboard.send_text(chunk).await,
            None => match KeyboardSimulator::new() {
                Ok(mut keyboard) => keyboard.send_text(chunk).await,
                Err(error) => Err(error),
            },
        };
        sent.map_err(|e| format!("Failed to type text: {e}"))
    }
}

/// Resolves the app, passes it through the gates an observe-plan-act step
/// passes, brings it to the front and confirms it is still the app in front.
async fn take_desktop_target(
    handle: &tauri::AppHandle,
    app_query: &str,
    run_id: Option<&str>,
) -> Result<(Arc<AutomationService>, TargetApp), String> {
    let automation = crate::automation::shared_service(handle)?;
    let app = resolve_target_app(app_query)?;
    crate::sys::commands::computer_use::authorize_desktop_action(handle, &app, run_id).await?;
    bring_to_front(&automation, &app).await?;
    confirm_in_front(handle, &automation, &app).await?;
    Ok((automation, app))
}

async fn confirm_in_front(
    handle: &tauri::AppHandle,
    automation: &AutomationService,
    app: &TargetApp,
) -> Result<(), String> {
    crate::sys::commands::computer_use::confirm_target_in_front(
        handle,
        app,
        frontmost_app(automation),
    )
    .await
}

async fn click_point(
    automation: &AutomationService,
    x: i32,
    y: i32,
    button: MouseButton,
) -> Result<(), String> {
    let mut mouse_guard = automation.mouse.lock().await;
    let mouse = mouse_guard.as_mut().ok_or_else(|| {
        "Mouse automation requires Input Monitoring permission. \
         Grant it in System Settings \u{2192} Privacy & Security \u{2192} Input Monitoring."
            .to_string()
    })?;
    mouse
        .click(x, y, button)
        .map_err(|e| format!("Failed to click: {e}"))
}

fn element_in_target(
    automation: &AutomationService,
    app: &TargetApp,
    target: &UiTarget,
) -> Result<String, String> {
    let element_id = match target {
        UiTarget::ElementId(element_id) => element_id.clone(),
        UiTarget::Text(text) => automation
            .native
            .find_elements(None, &text_query(text))
            .map_err(|e| format!("Failed to find element: {e}"))?
            .into_iter()
            .next()
            .map(|element| element.id)
            .ok_or_else(|| format!("No element with text '{text}' in '{}'", app.name))?,
        UiTarget::Coordinates { .. } | UiTarget::Focused => {
            return Err("This target has no element to use".to_string())
        }
    };
    ensure_element_in_target(automation, app, &element_id)?;
    Ok(element_id)
}

fn text_query(text: &str) -> ElementQuery {
    ElementQuery {
        window: None,
        window_class: None,
        name: Some(text.to_string()),
        class_name: None,
        automation_id: None,
        control_type: None,
        max_results: Some(1),
    }
}

fn acted_on(app: &TargetApp, target: &UiTarget, element_id: Option<String>) -> ActedOn {
    ActedOn {
        app: app.name.clone(),
        target_kind: target.kind(),
        element_id,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn planned_app(pid: i32, name: &str, bundle_id: &str) -> TargetApp {
        TargetApp {
            pid,
            name: name.to_string(),
            bundle_id: Some(bundle_id.to_string()),
        }
    }

    /// Notes was in the frame the click was planned on. Mail is allowed too,
    /// but it took focus before the click: the click is not redirected to it.
    #[test]
    fn a_click_planned_for_one_app_is_not_sent_to_another_that_took_focus() {
        let notes = planned_app(10, "Notes", "com.apple.Notes");
        let mail = planned_app(11, "Mail", "com.apple.mail");

        assert_eq!(front_app_still_planned(&notes, &notes), Ok(()));
        let changed = front_app_still_planned(&notes, &mail).expect_err("focus moved");
        assert_eq!(changed.planned, "Notes");
        assert_eq!(changed.front, "Mail");
        assert!(changed.to_string().contains("nothing was sent"));
    }

    /// A desktop where focus moves to another app after a set number of
    /// chunks have been typed.
    struct ScriptedKeyboard {
        focus_moves_after_chunks: usize,
        sent: Vec<String>,
    }

    #[async_trait::async_trait]
    impl TypingSink for ScriptedKeyboard {
        async fn check_front_app(&mut self) -> Result<(), RawInputRefusal> {
            if self.sent.len() >= self.focus_moves_after_chunks {
                return Err(RawInputRefusal::FrontAppChanged(FrontAppChanged {
                    planned: "Notes".to_string(),
                    front: "Mail".to_string(),
                }));
            }
            Ok(())
        }

        async fn send(&mut self, chunk: &str) -> Result<(), String> {
            self.sent.push(chunk.to_string());
            Ok(())
        }
    }

    #[tokio::test]
    async fn typing_stops_when_focus_moves_and_reports_how_much_was_typed() {
        let mut keyboard = ScriptedKeyboard {
            focus_moves_after_chunks: 2,
            sent: Vec::new(),
        };

        let stopped = type_in_chunks(&mut keyboard, "abcdefghijkl", 4)
            .await
            .expect_err("focus moved mid-typing");

        assert_eq!(keyboard.sent, ["abcd", "efgh"]);
        assert_eq!((stopped.typed, stopped.total), (8, 12));
        assert!(stopped.front_app_changed);
        assert!(stopped.to_string().starts_with("Typed 8 of 12 characters"));
    }

    #[tokio::test]
    async fn text_is_typed_whole_when_focus_stays() {
        let mut keyboard = ScriptedKeyboard {
            focus_moves_after_chunks: usize::MAX,
            sent: Vec::new(),
        };

        assert!(type_in_chunks(&mut keyboard, "héllo wörld", 4)
            .await
            .is_ok());
        assert_eq!(keyboard.sent, ["héll", "o wö", "rld"]);
        assert_eq!(typing_chunks("", 4), Vec::<&str>::new());
    }

    #[test]
    fn every_target_form_the_schemas_describe_parses() {
        assert_eq!(
            UiTarget::parse(&json!({ "coordinates": { "x": 10, "y": 20 } })),
            Ok(UiTarget::Coordinates { x: 10, y: 20 })
        );
        assert_eq!(
            UiTarget::parse(&json!({ "x": -5, "y": 7 })),
            Ok(UiTarget::Coordinates { x: -5, y: 7 })
        );
        assert_eq!(
            UiTarget::parse(&json!({ "element_id": "7f" })),
            Ok(UiTarget::ElementId("7f".to_string()))
        );
        assert_eq!(
            UiTarget::parse(&json!({ "text": "Send" })),
            Ok(UiTarget::Text("Send".to_string()))
        );
    }

    #[test]
    fn a_partial_or_out_of_range_target_is_refused() {
        assert!(UiTarget::parse(&json!({ "x": 10 })).is_err());
        assert!(UiTarget::parse(&json!({ "x": 40_000, "y": 0 })).is_err());
        assert!(UiTarget::parse(&json!({})).is_err());
    }

    #[test]
    fn a_blank_app_argument_counts_as_missing() {
        let named = HashMap::from([("app".to_string(), json!(" Notes "))]);
        let blank = HashMap::from([("app".to_string(), json!("  "))]);
        assert_eq!(app_argument(&named), Some("Notes"));
        assert_eq!(app_argument(&blank), None);
        assert_eq!(app_argument(&HashMap::new()), None);
    }
}
