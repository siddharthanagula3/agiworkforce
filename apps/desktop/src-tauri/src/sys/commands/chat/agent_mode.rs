use super::types::{IntentResult, UserIntent};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Emitter;

/// Check if the user explicitly selected a specific model (not auto-routing).
/// When a concrete model is selected, skip intent-based agent detection.
pub(super) fn is_explicit_model_selection(model_override: Option<&str>) -> bool {
    matches!(
        model_override.map(str::trim),
        Some(model) if !model.is_empty()
            && model != "auto"
            && !model.starts_with("auto-")
    )
}

static ACCESSIBILITY_ADVISORY_SHOWN: AtomicBool = AtomicBool::new(false);

/// Whether this message runs in agent mode. Accessibility is not needed to
/// start: a step that controls another app gets the named permission error
/// from `automation::shared_service` when it runs. Without the grant the user
/// is told once per launch, and nothing is opened or blocked.
pub(super) fn detect_agent_mode<R: tauri::Runtime>(
    request_enable_agent_mode: Option<bool>,
    content: &str,
    app_handle: &tauri::AppHandle<R>,
) -> bool {
    let agent_mode = agent_mode_requested(request_enable_agent_mode, content);

    #[cfg(target_os = "macos")]
    let has_accessibility = accessibility_permission_granted();
    #[cfg(not(target_os = "macos"))]
    let has_accessibility = true;

    if agent_mode
        && !has_accessibility
        && !ACCESSIBILITY_ADVISORY_SHOWN.swap(true, Ordering::Relaxed)
    {
        let _ = app_handle.emit(
            "automation:permission_required",
            serde_json::json!({
                "reason": "accessibility",
                "message": "Agent mode is on. Steps that control other apps need the Accessibility permission.",
                "graceful": true
            }),
        );
    }

    agent_mode
}

fn agent_mode_requested(request_enable_agent_mode: Option<bool>, content: &str) -> bool {
    request_enable_agent_mode.unwrap_or_else(|| detect_agentic_intent(content))
}

/// Check whether the macOS Accessibility permission has been granted.
/// `AXUIElementCreateSystemWide()` always succeeds (even without permission),
/// so we use `AXIsProcessTrusted()` which reads the actual TCC grant.
#[cfg(target_os = "macos")]
#[allow(unsafe_code)]
fn accessibility_permission_granted() -> bool {
    use accessibility_sys::AXIsProcessTrusted;
    unsafe { AXIsProcessTrusted() }
}

const STOP_PATTERNS: &[&str] = &[
    "stop",
    "wait",
    "hold on",
    "cancel",
    "pause",
    "abort",
    "halt",
    "nevermind",
    "never mind",
    "don't",
    "dont",
    "no wait",
    "stop that",
    "cancel that",
    "forget it",
    "scratch that",
];

/// Action verbs that indicate user wants something done
const ACTION_VERBS: &[&str] = &[
    "open",
    "close",
    "create",
    "delete",
    "remove",
    "rename",
    "move",
    "copy",
    "save",
    "download",
    "upload",
    "edit",
    "modify",
    "write",
    "read",
    "send",
    "email",
    "message",
    "reply",
    "forward",
    "post",
    "share",
    "tweet",
    "slack",
    "browse",
    "search",
    "google",
    "navigate",
    "go to",
    "visit",
    "click",
    "scroll",
    "fill",
    "submit",
    "login",
    "sign in",
    "logout",
    "run",
    "execute",
    "launch",
    "start",
    "install",
    "uninstall",
    "update",
    "restart",
    "shutdown",
    "build",
    "compile",
    "deploy",
    "commit",
    "push",
    "pull",
    "merge",
    "checkout",
    "clone",
    "test",
    "debug",
    "refactor",
    "fetch",
    "get",
    "find",
    "look up",
    "lookup",
    "check",
    "analyze",
    "calculate",
    "convert",
    "generate",
    "summarize",
    "schedule",
    "book",
    "reserve",
    "set up",
    "configure",
    "organize",
    "sort",
    "filter",
    "archive",
];

/// Conversation patterns - questions or discussion
const CONVERSATION_PATTERNS: &[&str] = &[
    "what is",
    "what's",
    "what are",
    "how does",
    "how do",
    "how is",
    "how can i",
    "why does",
    "why is",
    "why do",
    "when does",
    "when is",
    "where is",
    "where does",
    "who is",
    "who does",
    "which is",
    "can you explain",
    "tell me about",
    "describe",
    "what do you think",
    "is it possible",
    "should i",
    "would it be",
    "could you tell",
    "i'm wondering",
    "i wonder",
    "do you know",
    "have you heard",
    "what's the difference",
    "compare",
    "pros and cons",
];

/// Clarification patterns - follow-up questions
const CLARIFICATION_PATTERNS: &[&str] = &[
    "what did you",
    "what was that",
    "can you repeat",
    "say that again",
    "what happened",
    "did it work",
    "is it done",
    "was it successful",
    "show me",
    "let me see",
    "what's the status",
    "how far",
    "are you done",
    "what's next",
    "and then",
    "what else",
];

/// Detect user intent with confidence scoring.
fn detect_user_intent(content: &str) -> IntentResult {
    let content_lower = content.to_lowercase().trim().to_string();

    if content_lower.is_empty() {
        return IntentResult {
            intent: UserIntent::Conversation,
            confidence: 1.0,
            action_verbs: vec![],
            should_auto_execute: false,
        };
    }

    if matches_stop_intent(&content_lower) {
        return IntentResult {
            intent: UserIntent::Stop,
            confidence: 0.95,
            action_verbs: vec![],
            should_auto_execute: true,
        };
    }

    let detected_actions = detect_action_verbs(&content_lower);
    let action_score = calculate_action_score(&content_lower, &detected_actions);
    let conversation_score = calculate_conversation_score(&content_lower);

    if matches_clarification(&content_lower) && detected_actions.is_empty() {
        return IntentResult {
            intent: UserIntent::Clarification,
            confidence: 0.8,
            action_verbs: vec![],
            should_auto_execute: false,
        };
    }

    if action_score > conversation_score && action_score > 0.3 {
        IntentResult {
            intent: UserIntent::ActionRequest,
            confidence: action_score.min(1.0),
            action_verbs: detected_actions,
            should_auto_execute: action_score > 0.6,
        }
    } else {
        IntentResult {
            intent: UserIntent::Conversation,
            confidence: conversation_score.max(0.5),
            action_verbs: detected_actions,
            should_auto_execute: false,
        }
    }
}

/// Check if message matches stop intent.
fn matches_stop_intent(content: &str) -> bool {
    for pattern in STOP_PATTERNS {
        if content == *pattern
            || content.starts_with(&format!("{} ", pattern))
            || content.starts_with(&format!("{}!", pattern))
            || content.starts_with(&format!("{}.", pattern))
        {
            return true;
        }
    }
    false
}

fn matches_clarification(content: &str) -> bool {
    CLARIFICATION_PATTERNS
        .iter()
        .any(|pattern| content.contains(pattern))
}

fn detect_action_verbs(content: &str) -> Vec<String> {
    let words: Vec<&str> = content.split_whitespace().collect();
    let mut detected = Vec::new();

    for verb in ACTION_VERBS {
        if content.starts_with(verb)
            || content.starts_with(&format!("please {}", verb))
            || content.starts_with(&format!("can you {}", verb))
            || content.starts_with(&format!("could you {}", verb))
            || content.starts_with(&format!("would you {}", verb))
            || content.starts_with(&format!("i want to {}", verb))
            || content.starts_with(&format!("i need to {}", verb))
            || content.starts_with(&format!("i'd like to {}", verb))
            || content.starts_with(&format!("let's {}", verb))
            || content.starts_with(&format!("go {}", verb))
            || content.contains(&format!(" {} ", verb))
        {
            detected.push(verb.to_string());
        }
    }

    if let Some(first_word) = words.first() {
        if ACTION_VERBS.contains(first_word) && !detected.contains(&first_word.to_string()) {
            detected.push(first_word.to_string());
        }
    }

    detected
}

fn calculate_action_score(content: &str, detected_verbs: &[String]) -> f32 {
    let mut score = 0.0;

    score += (detected_verbs.len() as f32) * 0.3;

    let first_word = content.split_whitespace().next().unwrap_or("");
    if ACTION_VERBS.contains(&first_word) {
        score += 0.4;
    }

    if content.starts_with("please")
        || content.starts_with("can you")
        || content.starts_with("could you")
    {
        score += 0.2;
    }

    if content.contains("i want") || content.contains("i need") || content.contains("i'd like") {
        score += 0.25;
    }

    let multi_step_patterns = ["and then", "after that", "then", "followed by", "next"];
    for pattern in multi_step_patterns {
        if content.contains(pattern) {
            score += 0.15;
            break;
        }
    }

    if content.contains("the file")
        || content.contains("this file")
        || content.contains("the email")
        || content.contains("this email")
        || content.contains("the browser")
        || content.contains("chrome")
        || content.contains("the app")
        || content.contains("this app")
    {
        score += 0.15;
    }

    score.min(1.0)
}

fn calculate_conversation_score(content: &str) -> f32 {
    let mut score: f32 = 0.3;

    for pattern in CONVERSATION_PATTERNS {
        if content.contains(pattern) {
            score += 0.3;
            break;
        }
    }

    if content.contains('?') {
        score += 0.2;
    }

    if content.starts_with("i think")
        || content.starts_with("in my opinion")
        || content.starts_with("it seems")
        || content.starts_with("maybe")
    {
        score += 0.2;
    }

    score.min(1.0)
}

/// True when the message reads as a request to act that should start the agent
/// without asking.
fn detect_agentic_intent(content: &str) -> bool {
    let result = detect_user_intent(content);
    result.intent == UserIntent::ActionRequest && result.should_auto_execute
}

#[cfg(test)]
mod tests {
    use super::is_explicit_model_selection;

    #[test]
    fn explicit_model_selection_ignores_auto_routes() {
        assert!(!is_explicit_model_selection(None));
        assert!(!is_explicit_model_selection(Some("")));
        assert!(!is_explicit_model_selection(Some("auto")));
        assert!(!is_explicit_model_selection(Some("auto-fast")));
        assert!(is_explicit_model_selection(Some("fixture-explicit-model")));
    }
}

#[cfg(test)]
mod agent_mode_tests {
    use super::*;

    const ACTION_REQUEST: &str = "please open the file and then summarize it";

    #[test]
    fn agent_mode_starts_with_no_automation_service_and_no_grant() {
        let app = tauri::test::mock_app();

        assert!(detect_agent_mode(Some(true), "", app.handle()));
        assert!(detect_agent_mode(None, ACTION_REQUEST, app.handle()));
    }

    #[test]
    fn agent_mode_stays_off_when_declined_or_not_asked_for() {
        let app = tauri::test::mock_app();

        assert!(!detect_agent_mode(
            Some(false),
            ACTION_REQUEST,
            app.handle()
        ));
        assert!(!detect_agent_mode(None, "", app.handle()));
    }
}

#[cfg(test)]
mod intent_tests {
    use super::*;

    #[test]
    fn stop_intent_has_priority() {
        let result = detect_user_intent("stop that");
        assert_eq!(result.intent, UserIntent::Stop);
        assert!(result.should_auto_execute);
    }

    #[test]
    fn action_request_detects_verb_and_auto_executes() {
        let result = detect_user_intent("please open the file and then summarize it");
        assert_eq!(result.intent, UserIntent::ActionRequest);
        assert!(result.should_auto_execute);
        assert!(result.action_verbs.iter().any(|verb| verb == "open"));
        assert!(result.action_verbs.iter().any(|verb| verb == "summarize"));
    }
}
