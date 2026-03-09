//! Smart intent detection system — automatically determines user intent without explicit commands.

use tracing::info;

use super::types::{IntentResult, UserIntent};

// ============================================================================
// Pattern constants
// ============================================================================

/// Stop patterns - user wants to halt current operation
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
    // File operations
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
    // Communication
    "send",
    "email",
    "message",
    "reply",
    "forward",
    "post",
    "share",
    "tweet",
    "slack",
    // Browser/Web
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
    // System
    "run",
    "execute",
    "launch",
    "start",
    "install",
    "uninstall",
    "update",
    "restart",
    "shutdown",
    // Development
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
    // Data
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
    // Organization
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

// ============================================================================
// Intent detection functions
// ============================================================================

/// Detect user intent with confidence scoring
pub fn detect_user_intent(content: &str) -> IntentResult {
    let content_lower = content.to_lowercase().trim().to_string();

    // Early return for empty content
    if content_lower.is_empty() {
        return IntentResult {
            intent: UserIntent::Conversation,
            confidence: 1.0,
            action_verbs: vec![],
            should_auto_execute: false,
        };
    }

    // Check for stop intent first (highest priority)
    if matches_stop_intent(&content_lower) {
        return IntentResult {
            intent: UserIntent::Stop,
            confidence: 0.95,
            action_verbs: vec![],
            should_auto_execute: true,
        };
    }

    // Check for clarification patterns
    if matches_clarification(&content_lower) {
        return IntentResult {
            intent: UserIntent::Clarification,
            confidence: 0.8,
            action_verbs: vec![],
            should_auto_execute: false,
        };
    }

    // Detect action verbs
    let detected_actions = detect_action_verbs(&content_lower);
    let action_score = calculate_action_score(&content_lower, &detected_actions);
    let conversation_score = calculate_conversation_score(&content_lower);

    // Determine intent based on scores
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

/// Check if message matches stop intent
pub(crate) fn matches_stop_intent(content: &str) -> bool {
    // Check for exact matches or patterns at start
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

/// Check if message is a clarification question
fn matches_clarification(content: &str) -> bool {
    CLARIFICATION_PATTERNS
        .iter()
        .any(|pattern| content.contains(pattern))
}

/// Detect action verbs in the content
fn detect_action_verbs(content: &str) -> Vec<String> {
    let words: Vec<&str> = content.split_whitespace().collect();
    let mut detected = Vec::new();

    for verb in ACTION_VERBS {
        // Check if verb appears at start or after common prefixes
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

    // Also check for imperative form (verb at start)
    if let Some(first_word) = words.first() {
        if ACTION_VERBS.contains(first_word) && !detected.contains(&first_word.to_string()) {
            detected.push(first_word.to_string());
        }
    }

    detected
}

/// Calculate action intent score
fn calculate_action_score(content: &str, detected_verbs: &[String]) -> f32 {
    let mut score = 0.0;

    // Base score from detected verbs
    score += (detected_verbs.len() as f32) * 0.3;

    // Boost for imperative form (starts with verb)
    let first_word = content.split_whitespace().next().unwrap_or("");
    if ACTION_VERBS.contains(&first_word) {
        score += 0.4;
    }

    // Boost for polite requests
    if content.starts_with("please")
        || content.starts_with("can you")
        || content.starts_with("could you")
    {
        score += 0.2;
    }

    // Boost for desire expressions
    if content.contains("i want") || content.contains("i need") || content.contains("i'd like") {
        score += 0.25;
    }

    // Boost for multi-step indicators
    let multi_step_patterns = ["and then", "after that", "then", "followed by", "next"];
    for pattern in multi_step_patterns {
        if content.contains(pattern) {
            score += 0.15;
            break;
        }
    }

    // Boost for specific targets
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

/// Calculate conversation intent score
fn calculate_conversation_score(content: &str) -> f32 {
    let mut score: f32 = 0.3; // Base score for any message

    // Boost for question patterns
    for pattern in CONVERSATION_PATTERNS {
        if content.contains(pattern) {
            score += 0.3;
            break;
        }
    }

    // Boost for question marks
    if content.contains('?') {
        score += 0.2;
    }

    // Boost for discussion starters
    if content.starts_with("i think")
        || content.starts_with("in my opinion")
        || content.starts_with("it seems")
        || content.starts_with("maybe")
    {
        score += 0.2;
    }

    score.min(1.0)
}

/// Detect if the user is asking about what is visible on their screen.
pub(crate) fn should_attach_screen_context(content: &str) -> bool {
    let content_lower = content.to_lowercase();
    let patterns = [
        "what is on my screen",
        "what's on my screen",
        "what is on the screen",
        "what's on the screen",
        "see my screen",
        "look at my screen",
        "what's visible",
        "what is visible",
        "screenshot",
        "screen capture",
    ];

    patterns.iter().any(|p| content_lower.contains(p))
}

/// Legacy function for backward compatibility
/// Returns true if the message has action intent
pub(crate) fn detect_agentic_intent(content: &str) -> bool {
    let result = detect_user_intent(content);
    result.intent == UserIntent::ActionRequest && result.should_auto_execute
}

// ============================================================================
// Tauri command handlers
// ============================================================================

/// Detect intent from a user message
/// Returns the intent type, confidence score, and detected action verbs
#[tauri::command]
pub fn chat_detect_intent(content: String) -> IntentResult {
    info!(
        "[Chat] Detecting intent for: {}",
        &content.chars().take(50).collect::<String>()
    );
    let result = detect_user_intent(&content);
    info!(
        "[Chat] Intent detected: {:?} (confidence: {:.2}, auto_execute: {})",
        result.intent, result.confidence, result.should_auto_execute
    );
    result
}

/// Quick check if message is a stop command
/// Returns true if user wants to stop/cancel current operation
#[tauri::command]
pub fn chat_is_stop_command(content: String) -> bool {
    let content_lower = content.to_lowercase().trim().to_string();
    let is_stop = matches_stop_intent(&content_lower);
    if is_stop {
        info!("[Chat] Stop command detected: {}", content);
    }
    is_stop
}
