use super::llm::LLMState;

use crate::core::llm::{ContentPart, ImageDetail, ImageFormat, ImageInput, ToolChoice};
use crate::data::db::models::{Conversation, Message, MessageRole};
use crate::data::db::repository;
use base64::Engine;
use chrono::{Datelike, Duration as ChronoDuration, TimeZone, Utc};
use rusqlite::Connection;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, State};

use tracing::{debug, error, info, warn};

pub mod memory_handler;
pub mod tools;
pub mod types;
pub use types::*;

use once_cell::sync::Lazy;

static STOP_GENERATION: AtomicBool = AtomicBool::new(false);

// Pending messages queue for mid-task user input
static PENDING_MESSAGES: Lazy<Mutex<Vec<PendingUserMessage>>> =
    Lazy::new(|| Mutex::new(Vec::new()));

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PendingUserMessage {
    pub id: String,
    pub content: String,
    pub timestamp: chrono::DateTime<Utc>,
    pub conversation_id: Option<i64>,
}

// === Smart Intent Detection System ===
// Automatically determines user intent without explicit commands

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
fn matches_stop_intent(content: &str) -> bool {
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

/// Legacy function for backward compatibility
/// Returns true if the message has action intent
fn detect_agentic_intent(content: &str) -> bool {
    let result = detect_user_intent(content);
    result.intent == UserIntent::ActionRequest && result.should_auto_execute
}

/// Extract text content from document attachments (non-image files).
/// This enables full document support similar to ChatGPT, Claude, and Gemini.
/// Supported formats: .txt, .md, .json, .js, .ts, .py, .rs, .html, .css, .xml, .yaml, .toml, .csv, .log
/// PDF support requires the pdf-extract crate (text extraction only).
fn extract_text_from_attachments(attachments: &[ChatAttachment]) -> Vec<(String, String)> {
    let mut extracted: Vec<(String, String)> = Vec::new();

    // Text file extensions that can be read directly
    let text_extensions = [
        ".txt",
        ".md",
        ".markdown",
        ".json",
        ".jsonl",
        ".js",
        ".jsx",
        ".ts",
        ".tsx",
        ".py",
        ".pyw",
        ".rs",
        ".go",
        ".java",
        ".kt",
        ".swift",
        ".c",
        ".cpp",
        ".h",
        ".hpp",
        ".cs",
        ".rb",
        ".php",
        ".html",
        ".htm",
        ".css",
        ".scss",
        ".sass",
        ".less",
        ".xml",
        ".yaml",
        ".yml",
        ".toml",
        ".ini",
        ".cfg",
        ".conf",
        ".env",
        ".csv",
        ".tsv",
        ".log",
        ".sh",
        ".bash",
        ".zsh",
        ".fish",
        ".ps1",
        ".sql",
        ".graphql",
        ".gql",
        ".vue",
        ".svelte",
        ".astro",
        ".dockerfile",
        ".gitignore",
        ".gitattributes",
        ".editorconfig",
        ".eslintrc",
        ".prettierrc",
        ".babelrc",
        ".npmrc",
        ".nvmrc",
    ];

    for attachment in attachments {
        // Skip images - they're handled separately as multimodal content
        if attachment.attachment_type == "image" {
            continue;
        }

        let content = match &attachment.content {
            Some(c) if !c.is_empty() => c,
            _ => {
                debug!(
                    "[Chat] Skipping attachment '{}' - no content provided",
                    attachment.name
                );
                continue;
            }
        };

        // Check if it's a text-based file
        let name_lower = attachment.name.to_lowercase();
        let is_text_file = text_extensions.iter().any(|ext| name_lower.ends_with(ext))
            || attachment.mime_type.as_deref().map_or(false, |mime| {
                mime.starts_with("text/")
                    || mime == "application/json"
                    || mime == "application/xml"
                    || mime == "application/javascript"
                    || mime == "application/typescript"
            });

        if is_text_file {
            // Decode base64 content to text
            let base64_data = if content.starts_with("data:") {
                content.split(',').nth(1).unwrap_or(content)
            } else {
                content
            };

            match base64::engine::general_purpose::STANDARD.decode(base64_data) {
                Ok(bytes) => {
                    match String::from_utf8(bytes) {
                        Ok(text) => {
                            // Truncate very large files to prevent context overflow
                            let max_chars = 100_000; // ~100KB of text
                            let truncated = if text.len() > max_chars {
                                format!(
                                    "{}\n\n... [File truncated - showing first {} characters of {}]",
                                    &text[..max_chars],
                                    max_chars,
                                    text.len()
                                )
                            } else {
                                text
                            };
                            info!(
                                "[Chat] Extracted text from '{}' ({} chars)",
                                attachment.name,
                                truncated.len()
                            );
                            extracted.push((attachment.name.clone(), truncated));
                        }
                        Err(e) => {
                            warn!(
                                "[Chat] File '{}' is not valid UTF-8 text: {}",
                                attachment.name, e
                            );
                        }
                    }
                }
                Err(e) => {
                    warn!(
                        "[Chat] Failed to decode base64 content for '{}': {}",
                        attachment.name, e
                    );
                }
            }
        } else if name_lower.ends_with(".pdf") {
            // PDF extraction - attempt basic text extraction
            let base64_data = if content.starts_with("data:") {
                content.split(',').nth(1).unwrap_or(content)
            } else {
                content
            };

            match base64::engine::general_purpose::STANDARD.decode(base64_data) {
                Ok(bytes) => {
                    // Try to extract text from PDF using pdf-extract or similar
                    // For now, we'll use a basic approach or note that PDF support is limited
                    match extract_pdf_text(&bytes) {
                        Ok(text) if !text.trim().is_empty() => {
                            let max_chars = 100_000;
                            let truncated = if text.len() > max_chars {
                                format!(
                                    "{}\n\n... [PDF truncated - showing first {} characters]",
                                    &text[..max_chars],
                                    max_chars
                                )
                            } else {
                                text
                            };
                            info!(
                                "[Chat] Extracted text from PDF '{}' ({} chars)",
                                attachment.name,
                                truncated.len()
                            );
                            extracted.push((attachment.name.clone(), truncated));
                        }
                        Ok(_) => {
                            warn!(
                                "[Chat] PDF '{}' appears to be empty or image-based (no extractable text)",
                                attachment.name
                            );
                            extracted.push((
                                attachment.name.clone(),
                                "[PDF attached but no text could be extracted - may be image-based or scanned]".to_string(),
                            ));
                        }
                        Err(e) => {
                            warn!(
                                "[Chat] Failed to extract text from PDF '{}': {}",
                                attachment.name, e
                            );
                            extracted.push((
                                attachment.name.clone(),
                                format!("[PDF attached but text extraction failed: {}]", e),
                            ));
                        }
                    }
                }
                Err(e) => {
                    warn!("[Chat] Failed to decode PDF '{}': {}", attachment.name, e);
                }
            }
        } else {
            // Unsupported file type - note it for the user
            debug!(
                "[Chat] Unsupported file type for text extraction: '{}' (type: {})",
                attachment.name, attachment.attachment_type
            );
            extracted.push((
                attachment.name.clone(),
                format!(
                    "[File '{}' attached but content extraction not supported for this file type]",
                    attachment.name
                ),
            ));
        }
    }

    extracted
}

/// Extract text from PDF bytes using pdf-extract crate
fn extract_pdf_text(pdf_bytes: &[u8]) -> Result<String, String> {
    // Use pdf-extract crate if available, otherwise return an error
    // Note: This requires adding pdf-extract to Cargo.toml
    #[cfg(feature = "pdf-extract")]
    {
        use pdf_extract::extract_text_from_mem;
        extract_text_from_mem(pdf_bytes).map_err(|e| e.to_string())
    }

    #[cfg(not(feature = "pdf-extract"))]
    {
        // Fallback: try basic PDF text extraction without external crate
        // Look for text streams in PDF
        let content = String::from_utf8_lossy(pdf_bytes);

        // Very basic extraction - look for text between BT and ET markers
        let mut extracted = String::new();
        let mut in_text = false;

        for line in content.lines() {
            if line.contains("BT") {
                in_text = true;
            } else if line.contains("ET") {
                in_text = false;
            } else if in_text {
                // Try to extract text from Tj or TJ operators
                if let Some(start) = line.find('(') {
                    if let Some(end) = line.rfind(')') {
                        if start < end {
                            let text = &line[start + 1..end];
                            if !text.is_empty() {
                                extracted.push_str(text);
                                extracted.push(' ');
                            }
                        }
                    }
                }
            }
        }

        if extracted.trim().is_empty() {
            Err("PDF text extraction not available - consider using a vision model to analyze the PDF as images".to_string())
        } else {
            Ok(extracted)
        }
    }
}

/// Convert ChatAttachments to ContentPart for multimodal messages.
/// Returns a Vec of ContentPart if any valid image attachments are found.
fn convert_attachments_to_content_parts(attachments: &[ChatAttachment]) -> Vec<ContentPart> {
    let mut parts = Vec::new();

    for attachment in attachments {
        // Only process image attachments with content
        if attachment.attachment_type != "image" {
            debug!(
                "[Chat] Skipping non-image attachment: {} (type: {})",
                attachment.name, attachment.attachment_type
            );
            continue;
        }

        let content = match &attachment.content {
            Some(c) if !c.is_empty() => c,
            _ => {
                warn!(
                    "[Chat] Skipping image attachment '{}' - no content provided",
                    attachment.name
                );
                continue;
            }
        };

        // Determine the image format from mime_type
        let format = match attachment.mime_type.as_deref() {
            Some("image/png") => ImageFormat::Png,
            Some("image/jpeg") | Some("image/jpg") => ImageFormat::Jpeg,
            Some("image/webp") => ImageFormat::Webp,
            Some(other) => {
                warn!(
                    "[Chat] Unsupported image mime type '{}' for attachment '{}', defaulting to PNG",
                    other, attachment.name
                );
                ImageFormat::Png
            }
            None => {
                // Try to infer from file extension
                let name_lower = attachment.name.to_lowercase();
                if name_lower.ends_with(".png") {
                    ImageFormat::Png
                } else if name_lower.ends_with(".jpg") || name_lower.ends_with(".jpeg") {
                    ImageFormat::Jpeg
                } else if name_lower.ends_with(".webp") {
                    ImageFormat::Webp
                } else {
                    debug!(
                        "[Chat] Could not determine image format for '{}', defaulting to PNG",
                        attachment.name
                    );
                    ImageFormat::Png
                }
            }
        };

        // Decode base64 content
        // Handle both with and without data URL prefix
        let base64_data = if content.starts_with("data:") {
            // Extract base64 part after the comma
            content.split(',').nth(1).unwrap_or(content)
        } else {
            content
        };

        match base64::engine::general_purpose::STANDARD.decode(base64_data) {
            Ok(image_data) => {
                debug!(
                    "[Chat] Successfully decoded image attachment '{}' ({} bytes, format: {:?})",
                    attachment.name,
                    image_data.len(),
                    format
                );

                parts.push(ContentPart::Image {
                    image: ImageInput {
                        data: image_data,
                        format,
                        detail: ImageDetail::Auto,
                    },
                });
            }
            Err(e) => {
                warn!(
                    "[Chat] Failed to decode base64 content for attachment '{}': {}",
                    attachment.name, e
                );
            }
        }
    }

    if !parts.is_empty() {
        info!(
            "[Chat] Converted {} image attachment(s) to multimodal content",
            parts.len()
        );
    }

    parts
}

/// Check if a model is likely to support vision based on its name.
/// This is a heuristic check - providers should also implement supports_vision().
fn model_likely_supports_vision(model: &str) -> bool {
    let model_lower = model.to_lowercase();

    // Models that typically support vision
    let vision_models = [
        // OpenAI GPT-4+ models support vision
        "gpt-4",
        "gpt-5",
        "o1",
        "o3",
        // Anthropic Claude 3+ models support vision
        "claude-3",
        "claude-sonnet",
        "claude-opus",
        "claude-haiku",
        // Google Gemini models support vision
        "gemini",
        // Other vision-capable models
        "llava",
        "bakllava",
        "cogvlm",
        "qwen-vl",
        "qwen2-vl",
        "vision",
    ];

    // Check if the model contains any vision-supporting pattern
    vision_models
        .iter()
        .any(|pattern| model_lower.contains(pattern))
}

#[derive(Clone)]
pub struct AppDatabase {
    pub conn: Arc<Mutex<Connection>>,
}

impl AppDatabase {
    pub fn connection(&self) -> Result<std::sync::MutexGuard<'_, Connection>, String> {
        self.conn.lock().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn clear_local_database(db: State<'_, AppDatabase>) -> Result<(), String> {
    let conn = db.connection()?;
    // Delete user-specific data from tables
    conn.execute("DELETE FROM messages", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM conversations", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM automation_history", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM command_history", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM clipboard_history", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM overlay_events", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM settings", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM settings_v2", [])
        .map_err(|e| e.to_string())?;

    // Clear in-memory pending messages
    if let Ok(mut queue) = PENDING_MESSAGES.lock() {
        queue.clear();
    }

    Ok(())
}

#[tauri::command]
pub fn chat_create_conversation(
    db: State<'_, AppDatabase>,
    request: CreateConversationRequest,
) -> Result<Conversation, String> {
    let trimmed_title = request.title.trim();
    if trimmed_title.is_empty() {
        return Err("Conversation title cannot be empty".to_string());
    }
    if trimmed_title.len() > 500 {
        return Err("Conversation title cannot exceed 500 characters".to_string());
    }
    if request.user_id.is_empty() {
        return Err("User ID cannot be empty".to_string());
    }

    let conn = db.connection()?;
    let id =
        repository::create_conversation(&conn, trimmed_title.to_string(), request.user_id.clone())
            .map_err(|e| format!("Failed to create conversation: {e}"))?;
    repository::get_conversation(&conn, id, &request.user_id)
        .map_err(|e| format!("Failed to retrieve conversation {}: {e}", id))
}

#[tauri::command]
pub fn chat_get_conversations(
    db: State<'_, AppDatabase>,
    user_id: String,
) -> Result<Vec<Conversation>, String> {
    if user_id.is_empty() {
        return Err("User ID cannot be empty".to_string());
    }
    let conn = db.connection()?;
    repository::list_conversations(&conn, 1000, 0, &user_id)
        .map_err(|e| format!("Failed to list conversations: {e}"))
}

#[tauri::command]
pub fn chat_get_conversation(
    db: State<'_, AppDatabase>,
    id: i64,
    user_id: String,
) -> Result<Conversation, String> {
    if id <= 0 {
        return Err(format!(
            "Invalid conversation ID: {}. ID must be positive",
            id
        ));
    }
    if user_id.is_empty() {
        return Err("User ID cannot be empty".to_string());
    }

    let conn = db.connection()?;
    repository::get_conversation(&conn, id, &user_id)
        .map_err(|e| format!("Failed to get conversation {}: {e}", id))
}

#[tauri::command]
pub fn chat_update_conversation(
    db: State<'_, AppDatabase>,
    id: i64,
    request: UpdateConversationRequest,
) -> Result<(), String> {
    if id <= 0 {
        return Err(format!(
            "Invalid conversation ID: {}. ID must be positive",
            id
        ));
    }

    let trimmed_title = request.title.trim();
    if trimmed_title.is_empty() {
        return Err("Conversation title cannot be empty".to_string());
    }
    if trimmed_title.len() > 500 {
        return Err("Conversation title cannot exceed 500 characters".to_string());
    }

    if request.user_id.is_empty() {
        return Err("User ID cannot be empty".to_string());
    }
    // Verify ownership implicitly via update query check?
    // Actually update_conversation_title now takes user_id and adds it to WHERE clause.
    // However, Tauri command arguments are separate.
    // The previous implementation had `request: UpdateConversationRequest` which now has `user_id`.
    // And usually we might also accept `user_id` as a separate arg if we want to be consistent with get_conversations.
    // But `UpdateConversationRequest` fields are sufficient.

    // Wait, the signature of the command in mod.rs:
    // pub fn chat_update_conversation(db: State<'_, AppDatabase>, id: i64, request: UpdateConversationRequest)
    // The implementation plan says "Update your Tauri commands to require the user_id".
    // I can just use request.user_id.

    let conn = db.connection()?;
    // Check existence/ownership first? Or just try update.
    // repository::update_conversation_title uses user_id in WHERE.
    repository::update_conversation_title(&conn, id, &request.user_id, trimmed_title.to_string())
        .map_err(|e| format!("Failed to update conversation {}: {e}", id))
}

#[tauri::command]
pub fn chat_delete_conversation(
    db: State<'_, AppDatabase>,
    id: i64,
    user_id: String,
) -> Result<(), String> {
    if id <= 0 {
        return Err(format!(
            "Invalid conversation ID: {}. ID must be positive",
            id
        ));
    }
    if user_id.is_empty() {
        return Err("User ID cannot be empty".to_string());
    }

    let conn = db.connection()?;
    repository::delete_conversation(&conn, id, &user_id)
        .map(|_| ())
        .map_err(|e| format!("Failed to delete conversation {}: {e}", id))
}

#[tauri::command]
pub fn chat_create_message(
    db: State<'_, AppDatabase>,
    request: CreateMessageRequest,
) -> Result<Message, String> {
    if request.conversation_id <= 0 {
        return Err(format!(
            "Invalid conversation ID: {}. ID must be positive",
            request.conversation_id
        ));
    }

    let trimmed_content = request.content.trim();
    if trimmed_content.is_empty() {
        return Err("Message content cannot be empty".to_string());
    }
    if trimmed_content.len() > 1_000_000 {
        return Err("Message content cannot exceed 1,000,000 characters".to_string());
    }

    if let Some(tokens) = request.tokens {
        if tokens < 0 {
            return Err(format!(
                "Invalid tokens value: {}. Tokens must be non-negative",
                tokens
            ));
        }
    }

    if let Some(cost) = request.cost {
        if cost < 0.0 {
            return Err(format!(
                "Invalid cost value: {}. Cost must be non-negative",
                cost
            ));
        }
    }

    let conn = db.connection()?;

    let message = Message {
        id: 0,
        conversation_id: request.conversation_id,
        user_id: request.user_id.clone(),
        role: request.role,
        content: trimmed_content.to_string(),
        tokens: request.tokens,
        cost: request.cost,
        provider: None,
        model: None,
        created_at: Utc::now(),
    };

    let id = repository::create_message(&conn, &message).map_err(|e| {
        format!(
            "Failed to create message in conversation {}: {e}",
            request.conversation_id
        )
    })?;
    repository::get_message(&conn, id)
        .map_err(|e| format!("Failed to retrieve message {}: {e}", id))
}

#[tauri::command]
pub fn chat_get_messages(
    db: State<'_, AppDatabase>,
    conversation_id: i64,
    user_id: String,
) -> Result<Vec<Message>, String> {
    if conversation_id <= 0 {
        return Err(format!(
            "Invalid conversation ID: {}. ID must be positive",
            conversation_id
        ));
    }
    if user_id.is_empty() {
        return Err("User ID cannot be empty".to_string());
    }

    let conn = db.connection()?;

    // Verify conversation ownership first
    repository::get_conversation(&conn, conversation_id, &user_id)
        .map_err(|e| format!("Access denied or conversation not found: {e}"))?;

    repository::list_messages(&conn, conversation_id).map_err(|e| {
        format!(
            "Failed to list messages for conversation {}: {e}",
            conversation_id
        )
    })
}

#[tauri::command]
pub fn chat_update_message(
    db: State<'_, AppDatabase>,
    id: i64,
    content: String,
) -> Result<Message, String> {
    if id <= 0 {
        return Err(format!("Invalid message ID: {}. ID must be positive", id));
    }

    let trimmed_content = content.trim();
    if trimmed_content.is_empty() {
        return Err("Message content cannot be empty".to_string());
    }
    if trimmed_content.len() > 1_000_000 {
        return Err("Message content cannot exceed 1,000,000 characters".to_string());
    }

    let conn = db.connection()?;
    repository::update_message_content(&conn, id, trimmed_content.to_string())
        .map_err(|e| format!("Failed to update message {}: {e}", id))
}

#[tauri::command]
pub fn chat_delete_message(db: State<'_, AppDatabase>, id: i64) -> Result<(), String> {
    if id <= 0 {
        return Err(format!("Invalid message ID: {}. ID must be positive", id));
    }

    let conn = db.connection()?;
    repository::delete_message(&conn, id)
        .map_err(|e| format!("Failed to delete message {}: {e}", id))
}

#[tauri::command]
pub fn chat_get_conversation_stats(
    db: State<'_, AppDatabase>,
    conversation_id: i64,
) -> Result<ConversationStats, String> {
    if conversation_id <= 0 {
        return Err(format!(
            "Invalid conversation ID: {}. ID must be positive",
            conversation_id
        ));
    }

    let conn = db.connection()?;
    let messages = repository::list_messages(&conn, conversation_id).map_err(|e| {
        format!(
            "Failed to list messages for conversation {}: {e}",
            conversation_id
        )
    })?;

    let message_count = messages.len();
    let total_tokens = messages.iter().filter_map(|m| m.tokens).sum();
    let total_cost = messages.iter().filter_map(|m| m.cost).sum();

    Ok(ConversationStats {
        message_count,
        total_tokens,
        total_cost,
    })
}

#[tauri::command]
pub async fn chat_send_message(
    _db: State<'_, AppDatabase>,
    _llm_state: State<'_, LLMState>,
    _settings_state: State<'_, crate::sys::commands::settings::SettingsState>,
    #[cfg_attr(not(feature = "billing"), allow(unused_variables))] _billing_state: State<
        '_,
        crate::sys::billing::BillingStateWrapper,
    >,
    mcp_state: State<'_, crate::sys::commands::mcp::McpState>,
    project_context_state: State<'_, crate::sys::commands::project_context::ProjectContextState>,
    app_handle: tauri::AppHandle,
    request: ChatSendMessageRequest,
) -> Result<ChatSendMessageResponse, String> {
    // Log request details including attachments
    // AUDIT-P3-003: Use if-let instead of unwrap() for optional attachments
    if let Some(attachments) = request.attachments.as_ref() {
        if !attachments.is_empty() {
            let attachment_names: Vec<&str> = attachments.iter().map(|a| a.name.as_str()).collect();
            info!(
                "[Chat] Received message with {} attachment(s): {:?}",
                attachments.len(),
                attachment_names
            );
        }
    }
    info!(
        "[Chat] Received message for processing: {}",
        request.content
    );

    #[cfg(feature = "billing")]
    {
        let billing = _billing_state.0.lock().await;
        if !billing.check_cloud_access() {
            return Err(
                "Subscription required. Please upgrade to the Hobby plan to use the AGI agent."
                    .to_string(),
            );
        }
    }

    {
        let conn = _db
            .connection()
            .map_err(|e| format!("Budget check failed: {e}"))?;

        if let Ok(budget_setting) = repository::get_setting(&conn, "billing.monthly_budget") {
            if let Ok(budget_limit) = budget_setting.value.parse::<f64>() {
                if budget_limit > 0.0 {
                    let now = Utc::now();
                    let start_of_month = now
                        .date_naive()
                        .with_day(1)
                        .ok_or_else(|| "Failed to determine start of month".to_string())?
                        .and_hms_opt(0, 0, 0)
                        .ok_or_else(|| "Failed to set time for start of month".to_string())?
                        .and_utc();

                    let current_usage =
                        repository::sum_cost_since(&conn, start_of_month, &request.user_id)
                            .unwrap_or(0.0);

                    if current_usage >= budget_limit {
                        return Err(format!(
                            "Monthly budget exceeded. Usage: ${:.2}, Limit: ${:.2}. Please update settings.",
                            current_usage,
                            budget_limit
                        ));
                    }
                }
            }
        }
    }

    let use_agent = request
        .enable_agent_mode
        .unwrap_or_else(|| detect_agentic_intent(&request.content));

    if use_agent {
        info!("[Chat] Routing to AGI Orchestrator");

        use crate::sys::commands::agi::ORCHESTRATOR;
        let orchestrator_arc = {
            let guard = ORCHESTRATOR.lock();
            guard.as_ref().cloned()
        }
        .ok_or_else(|| "AGI Orchestrator not initialized".to_string())?;

        let orchestrator = orchestrator_arc.lock().await;

        let _ = app_handle.emit(
            "agent:thinking",
            serde_json::json!({
                "status": "Thinking...",
                "instruction": request.content
            }),
        );

        match orchestrator
            .process_instruction(&request.content, request.attachments.clone())
            .await
        {
            Ok(result) => {
                let _ = app_handle.emit(
                    "agent:finished",
                    serde_json::json!({
                        "success": result.success,
                        "summary": result.summary
                    }),
                );

                return Ok(ChatSendMessageResponse {
                    conversation: Conversation::default(),
                    user_message: Message::default(),
                    assistant_message: Message {
                        content: result.summary,
                        ..Message::default()
                    },
                    stats: ConversationStats {
                        message_count: 0,
                        total_tokens: 0,
                        total_cost: 0.0,
                    },
                    last_message: None,
                    credits: None,
                });
            }
            Err(e) => return Err(format!("Orchestration failed: {e}")),
        }
    }

    use crate::core::llm::{
        cost_calculator::CostCalculator,
        llm_router::{RouterContext, RouterPreferences, RoutingStrategy},
        token_counter::TokenCounter,
        ChatMessage, LLMRequest, Provider,
    };
    use futures_util::StreamExt;

    let provider_enum = request
        .provider_override
        .as_deref()
        .or(request.provider.as_deref())
        .and_then(Provider::from_string);

    let model = request
        .model_override
        .or(request.model.clone())
        .unwrap_or_else(|| "gpt-5-nano".to_string());

    // Map auto mode model IDs to routing strategies (2026)
    let routing_strategy = match model.as_str() {
        "auto" => RoutingStrategy::Auto, // Legacy - maps to AutoBalanced
        "auto-economy" => RoutingStrategy::AutoEconomy,
        "auto-balanced" => RoutingStrategy::AutoBalanced,
        "auto-premium" => RoutingStrategy::AutoPremium,
        _ => RoutingStrategy::Auto, // Default to Auto (maps to AutoBalanced)
    };

    let _billing_guard = _billing_state.0.lock().await;
    #[cfg(feature = "billing")]
    let plan_tier = if let Ok(service) = _billing_guard.stripe_service() {
        if let Ok(Some(sub)) = service.get_primary_subscription() {
            sub.plan_name.to_lowercase()
        } else {
            "free".to_string()
        }
    } else {
        "free".to_string()
    };

    #[cfg(not(feature = "billing"))]
    let plan_tier = "free".to_string();

    let router_context = request.task_metadata.as_ref().map(|meta| RouterContext {
        // Legacy fields
        intents: meta.intents.clone(),
        requires_vision: meta.requires_vision,
        token_estimate: meta.token_estimate.unwrap_or(0),
        cost_priority: Default::default(),
        plan_tier,
        // New intelligent routing fields (January 2026)
        intent_type: meta.intent_type.clone(),
        model_category: meta.model_category.clone(),
        selected_model: meta.selected_model.clone(),
        suggested_tool_categories: meta.suggested_tool_categories.clone(),
        auto_execute_tools: meta.auto_execute_tools,
        confidence: meta.confidence,
        routing_reason: meta.routing_reason.clone(),
    });

    let preferences = RouterPreferences {
        provider: provider_enum,
        model: Some(model.clone()),
        strategy: routing_strategy,
        context: router_context,
        prefer_cloud_credits: request.prefer_cloud_credits,
    };

    // Clone the inner Arc before moving _db
    let db_arc = AppDatabase {
        conn: _db.inner().conn.clone(),
    };
    let conversation = {
        let conn = db_arc.connection()?;
        if let Some(conv_id) = request.conversation_id {
            repository::get_conversation(&conn, conv_id, &request.user_id)
                .map_err(|e| format!("Failed to get conversation: {e}"))?
        } else {
            let title = request.content.chars().take(50).collect::<String>();
            let id = repository::create_conversation(&conn, title, request.user_id.clone())
                .map_err(|e| format!("Failed to create conversation: {e}"))?;
            repository::get_conversation(&conn, id, &request.user_id)
                .map_err(|e| format!("Failed to get new conversation: {e}"))?
        }
    };

    let temp_chat_msg = ChatMessage {
        role: "user".to_string(),
        content: request.content.clone(),
        tool_calls: None,
        tool_call_id: None,
        multimodal_content: None,
    };
    let input_tokens = TokenCounter::estimate_prompt_tokens(&[temp_chat_msg]);
    let input_cost = if let Some(p) = provider_enum {
        CostCalculator::new().calculate(p, &model, input_tokens, 0)
    } else {
        0.0
    };

    let user_message = {
        let conn = _db.connection()?;
        let msg = Message {
            id: 0,
            conversation_id: conversation.id,
            user_id: request.user_id.clone(),
            role: MessageRole::User,
            content: request.content.clone(),
            tokens: Some(input_tokens as i32),
            cost: Some(input_cost),
            provider: provider_enum.map(|p| p.as_string().to_string()),
            model: Some(model.clone()),
            created_at: Utc::now(),
        };
        let id = repository::create_message(&conn, &msg)
            .map_err(|e| format!("Failed to save user message: {e}"))?;
        repository::get_message(&conn, id)
            .map_err(|e| format!("Failed to retrieve user message: {e}"))?
    };

    let history = {
        let conn = _db.connection()?;
        repository::list_messages(&conn, conversation.id)
            .map_err(|e| format!("Failed to load message history: {e}"))?
    };

    // Build conversation messages, prepending system prompt
    let mut llm_messages: Vec<ChatMessage> = Vec::new();

    // Default system prompt - tells the LLM what AGI Workforce is and its capabilities
    const DEFAULT_SYSTEM_PROMPT: &str = r#"You are AGI Workforce, a powerful desktop AI assistant that can automate tasks on the user's computer.

## Your Capabilities

You have access to the following tools and abilities:

**File Operations:**
- Read, write, create, and delete files
- List directory contents and navigate the file system
- Download files from URLs to the user's computer

**Document Creation:**
- Create Word documents (.docx) with formatted text, headings, and paragraphs
- Create Excel spreadsheets (.xlsx) with headers and data rows
- Create PDF documents with text content

**Media Generation (Pro/Max plans only):**
- Generate images from text descriptions (AI-powered: DALL-E, Stable Diffusion, Google Imagen)
- Generate videos from text prompts (AI-powered: Runway, Google Veo)
- Note: If a user on Hobby plan asks for media generation, politely explain they need to upgrade to Pro

**Web & Search:**
- Search the web for current information
- Navigate to websites and interact with pages
- Click buttons, fill forms, and extract content from web pages
- Take screenshots of websites or the screen

**Terminal/Shell:**
- Execute shell commands and scripts on the user's LOCAL computer using the `terminal_execute` tool
- Run development tools (npm, git, python, etc.)
- IMPORTANT: Always use the `terminal_execute` tool for ALL shell commands. Do NOT use any built-in code execution - commands must run on the user's actual computer, not a remote sandbox.

**Memory:**
- Remember important information across conversations
- Recall previously stored information when relevant

**MCP Integrations:**
When configured, you can also:
- Gmail - Read, send, and manage emails
- GitHub - Manage repositories, issues, and PRs
- Slack - Send messages to channels
- Google Drive - Access and manage files
- And other user-configured integrations

## How You Work

1. When asked to do something, you autonomously complete the task using your tools
2. You break down complex goals into steps and execute them
3. All actions are reversible - users can undo if something goes wrong
4. You report progress and results in plain, friendly language

## CRITICAL TOOL USAGE RULES

**YOU MUST USE TOOLS - NEVER HALLUCINATE OR FABRICATE OUTPUT**

1. **File Operations**: You MUST call the `file_read`, `file_write`, `file_list`, or `file_delete` tools. NEVER pretend to read files or list directories. NEVER make up file contents or directory listings.

2. **Terminal/Shell Commands**: You MUST call the `terminal_execute` tool. NEVER write bash code blocks and pretend to execute them. NEVER fabricate command output.

3. **Web Search**: You MUST call the `search_web` tool. NEVER pretend to search or make up search results.

4. **Browser Operations**: You MUST call browser tools (`browser_navigate`, `browser_click`, `browser_extract`). NEVER simulate browser interactions.

If a user asks "What files are in my Desktop folder?", you MUST call `file_list` with path="~/Desktop" or use `terminal_execute` with command="ls ~/Desktop". DO NOT make up a list of files.

## Guidelines

- Be proactive and complete tasks fully without asking for approval at each step
- If something fails, explain what happened in plain English (no technical jargon)
- When generating files (images, documents, videos), save them and tell the user where
- When asked about your capabilities, describe them in user-friendly terms
- Remember: users are often non-technical - keep explanations simple and clear
- ALWAYS use the actual tools provided to you - never simulate, pretend, or fabricate results"#;

    // Add the default system prompt
    llm_messages.push(ChatMessage {
        role: "system".to_string(),
        content: DEFAULT_SYSTEM_PROMPT.to_string(),
        tool_calls: None,
        tool_call_id: None,
        multimodal_content: None,
    });
    debug!("[Chat] Added default AGI Workforce system prompt");

    // Add OS/platform context so the LLM knows the user's operating system
    let os_name = std::env::consts::OS;
    let os_arch = std::env::consts::ARCH;
    let os_family = std::env::consts::FAMILY;

    let os_context = match os_name {
        "macos" => format!(
            "## User's System Environment\n\n\
            - **Operating System:** macOS ({})\n\
            - **Architecture:** {}\n\n\
            When running terminal commands, use macOS-compatible commands:\n\
            - Use `ls`, `rm`, `mv`, `cp`, `mkdir` for file operations\n\
            - Use `/` for path separators (e.g., ~/Desktop/file.txt)\n\
            - Use `open` to launch applications or URLs\n\
            - Common shells: zsh (default), bash\n\
            - Home directory: ~/ or $HOME",
            os_family, os_arch
        ),
        "windows" => format!(
            "## User's System Environment\n\n\
            - **Operating System:** Windows ({})\n\
            - **Architecture:** {}\n\n\
            When running terminal commands, use Windows-compatible commands:\n\
            - Use `dir` (or `ls` in PowerShell), `del`/`Remove-Item`, `move`, `copy`, `mkdir` for file operations\n\
            - Use `\\` for path separators (e.g., C:\\Users\\username\\Desktop\\file.txt)\n\
            - Use `start` to launch applications or URLs\n\
            - Prefer PowerShell over cmd.exe for better compatibility\n\
            - Home directory: %USERPROFILE% or $env:USERPROFILE",
            os_family, os_arch
        ),
        "linux" => format!(
            "## User's System Environment\n\n\
            - **Operating System:** Linux ({})\n\
            - **Architecture:** {}\n\n\
            When running terminal commands, use Linux-compatible commands:\n\
            - Use `ls`, `rm`, `mv`, `cp`, `mkdir` for file operations\n\
            - Use `/` for path separators (e.g., ~/Desktop/file.txt)\n\
            - Use `xdg-open` to launch applications or URLs\n\
            - Common shells: bash (default), zsh, fish\n\
            - Home directory: ~/ or $HOME",
            os_family, os_arch
        ),
        _ => format!(
            "## User's System Environment\n\n\
            - **Operating System:** {} ({})\n\
            - **Architecture:** {}\n\n\
            Adapt terminal commands to this platform as appropriate.",
            os_name, os_family, os_arch
        ),
    };

    llm_messages.push(ChatMessage {
        role: "system".to_string(),
        content: os_context,
        tool_calls: None,
        tool_call_id: None,
        multimodal_content: None,
    });
    debug!("[Chat] Added OS context: {} ({})", os_name, os_arch);

    // Add project folder context if one is set
    // Priority: request.project_folder > state context
    let effective_folder = if let Some(ref folder) = request.project_folder {
        // Update the project context state so tools can use it
        project_context_state.set_folder(folder.clone()).await;
        Some(folder.clone())
    } else {
        let ctx = project_context_state.get_context().await;
        if ctx.is_valid {
            ctx.folder.clone()
        } else {
            None
        }
    };

    if let Some(ref folder) = effective_folder {
        // Extract project name from folder path
        let project_name = std::path::Path::new(folder)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Project");

        // Build project context message
        let mut project_context_content = format!(
            "## Active Project Folder\n\n\
            The user is currently working in a project folder:\n\
            - **Project Name:** {}\n\
            - **Path:** {}\n\n\
            **Important Guidelines for this session:**\n\
            - When performing file operations, default to working within this project folder unless the user specifies otherwise\n\
            - Use relative paths from the project root when possible\n\
            - For terminal commands, use this folder as the working directory (cwd)\n\
            - When creating new files, place them in appropriate locations within the project structure\n",
            project_name, folder
        );

        // Try to get a summary of the project structure
        if let Ok(files) =
            crate::sys::commands::project_context::project_context_list_files_internal_sync(
                folder, 1, false,
            )
        {
            if !files.is_empty() {
                project_context_content.push_str("\n**Project Structure (top level):**\n```\n");
                for file in files.iter().take(25) {
                    let prefix = if file.is_directory {
                        "[DIR] "
                    } else {
                        "      "
                    };
                    project_context_content.push_str(&format!("{}{}\n", prefix, file.name));
                }
                if files.len() > 25 {
                    project_context_content
                        .push_str(&format!("... and {} more items\n", files.len() - 25));
                }
                project_context_content.push_str("```\n");
            }
        }

        llm_messages.push(ChatMessage {
            role: "system".to_string(),
            content: project_context_content,
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: None,
        });
        debug!(
            "[Chat] Added project folder context: {} ({})",
            project_name, folder
        );
    }

    // Append custom instructions if provided (they supplement the default prompt)
    if let Some(ref custom_instructions) = request.custom_instructions {
        if !custom_instructions.trim().is_empty() {
            llm_messages.push(ChatMessage {
                role: "system".to_string(),
                content: format!("## Additional User Instructions\n\n{}", custom_instructions),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            });
            debug!(
                "[Chat] Added custom instructions to system prompt ({} chars)",
                custom_instructions.len()
            );
        }
    }

    // Process attachments for multimodal content if present
    let multimodal_parts: Option<Vec<ContentPart>> =
        if let Some(ref attachments) = request.attachments {
            if !attachments.is_empty() {
                // Check if the model supports vision
                if model_likely_supports_vision(&model) {
                    let parts = convert_attachments_to_content_parts(attachments);
                    if parts.is_empty() {
                        debug!("[Chat] No valid image attachments found after conversion");
                        None
                    } else {
                        info!(
                            "[Chat] Including {} image(s) in multimodal message for model '{}'",
                            parts.len(),
                            model
                        );
                        Some(parts)
                    }
                } else {
                    warn!(
                    "[Chat] Model '{}' may not support vision - image attachments will be skipped. \
                    Consider using a vision-capable model like GPT-4, Claude 3+, or Gemini.",
                    model
                );
                    None
                }
            } else {
                None
            }
        } else {
            None
        };

    // Extract text from document attachments (non-image files)
    // This enables full document support like ChatGPT, Claude, and Gemini
    if let Some(ref attachments) = request.attachments {
        let extracted_text = extract_text_from_attachments(attachments);
        if !extracted_text.is_empty() {
            let mut document_context = String::from("## Attached Documents\n\nThe user has attached the following files. Their contents are provided below:\n\n");

            for (filename, content) in &extracted_text {
                document_context.push_str(&format!(
                    "### File: {}\n```\n{}\n```\n\n",
                    filename, content
                ));
            }

            document_context.push_str("Use the content above to help answer the user's question. You can reference specific parts of the files in your response.\n");

            llm_messages.push(ChatMessage {
                role: "system".to_string(),
                content: document_context,
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            });

            info!(
                "[Chat] Added {} document(s) to context ({} total chars)",
                extracted_text.len(),
                extracted_text.iter().map(|(_, c)| c.len()).sum::<usize>()
            );
        }
    }

    // Add conversation history (all messages except the last user message)
    // We'll add the current user message separately with multimodal content
    let history_len = history.len();
    for (idx, m) in history.iter().enumerate() {
        // The last message is the current user message we just created
        // Add multimodal content to it if we have attachments
        let is_current_user_message =
            idx == history_len - 1 && m.role == MessageRole::User && m.id == user_message.id;

        let multimodal = if is_current_user_message {
            multimodal_parts.clone()
        } else {
            None
        };

        llm_messages.push(ChatMessage {
            role: match m.role {
                MessageRole::User => "user".to_string(),
                MessageRole::Assistant => "assistant".to_string(),
                MessageRole::System => "system".to_string(),
            },
            content: m.content.clone(),
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: multimodal,
        });
    }

    // Log debug info about the message being sent
    if let Some(ref parts) = multimodal_parts {
        debug!(
            "[Chat] Sending message with {} text chars and {} image(s) to model '{}'",
            request.content.len(),
            parts.len(),
            model
        );
    }

    // Build tool definitions if tools are enabled
    // This enables Claude Desktop/Code-like tool use in regular chat
    let (chat_tools, tool_choice) = if request.enable_tools.unwrap_or(true) {
        // Default to enabling tools for Claude Desktop-like experience
        // Include MCP tools if available
        let tool_defs = tools::build_chat_tools(None, Some(&mcp_state));
        if !tool_defs.is_empty() {
            info!(
                "[Chat] Enabling {} tools for chat (Claude Desktop-like mode, includes MCP tools)",
                tool_defs.len()
            );
            (Some(tool_defs), Some(ToolChoice::Auto))
        } else {
            debug!("[Chat] No tools available, proceeding without tool support");
            (None, None)
        }
    } else {
        debug!("[Chat] Tools explicitly disabled by request");
        (None, None)
    };

    let llm_request = LLMRequest {
        messages: llm_messages,
        model: model.clone(),
        temperature: Some(0.7),
        max_tokens: Some(4096),
        stream: request.stream.unwrap_or(false),
        tools: chat_tools.clone(),
        tool_choice: tool_choice.clone(),
        thinking_mode: request.thinking_mode,
        ..Default::default()
    };

    let stream_mode = request.stream.unwrap_or(false);

    if stream_mode {
        reset_stop_flag();

        // Use frontend message ID if provided, otherwise use 0 as fallback
        let frontend_message_id = request
            .frontend_message_id
            .clone()
            .unwrap_or_else(|| "0".to_string());

        // Emit stream start event
        let _ = app_handle.emit(
            "chat:stream-start",
            serde_json::json!({
                "conversation_id": conversation.id,
                "message_id": frontend_message_id,
                "created_at": Utc::now().to_rfc3339()
            }),
        );

        // Clone all needed variables for the spawned task
        let app_handle_clone = app_handle.clone();
        let frontend_message_id_clone = frontend_message_id.clone();
        let conversation_id_clone = conversation.id;
        let llm_request_clone = llm_request.clone();
        let preferences_clone = preferences.clone();
        let router_arc = _llm_state.router.clone();
        let db_arc_clone = db_arc.clone();
        let provider_enum_clone = provider_enum;
        let model_clone = model.clone();
        let user_id_clone = request.user_id.clone();

        // Spawn streaming task to avoid blocking the command response
        // Return immediately - events will handle the streaming updates
        tauri::async_runtime::spawn(async move {
            let router = router_arc.read().await;

            match router
                .send_message_streaming(&llm_request_clone, &preferences_clone)
                .await
            {
                Ok(mut stream) => {
                    let mut full_content = String::new();
                    let mut token_count = 0u32;
                    let mut was_stopped = false;
                    let mut final_usage = None;
                    let mut final_credits = None;
                    let mut final_finish_reason: Option<String> = None;

                    // Accumulate tool calls from streaming chunks
                    // Tool calls arrive in multiple chunks and must be merged by index
                    use std::collections::HashMap;
                    let mut accumulated_tool_calls: HashMap<
                        usize,
                        crate::core::llm::sse_parser::StreamingToolCall,
                    > = HashMap::new();

                    let mut pending_notified = false;
                    while let Some(chunk_result) = stream.next().await {
                        if should_stop_generation() {
                            info!("[Chat] Generation stopped by user");
                            was_stopped = true;
                            break;
                        }

                        // Check for pending user messages during streaming
                        if has_pending_messages() && !pending_notified {
                            let pending = peek_pending_messages();
                            info!(
                                "[Chat] {} pending message(s) detected during streaming",
                                pending.len()
                            );
                            let _ = app_handle_clone.emit(
                                "chat:pending-context-available",
                                serde_json::json!({
                                    "pending_messages": pending,
                                    "current_phase": "streaming",
                                    "count": pending.len()
                                }),
                            );
                            pending_notified = true;
                        }

                        match chunk_result {
                            Ok(chunk) => {
                                full_content.push_str(&chunk.content);
                                token_count += 1;

                                // Track finish reason (important for detecting tool_calls)
                                if let Some(ref finish) = chunk.finish_reason {
                                    final_finish_reason = Some(finish.clone());
                                }

                                // Accumulate tool calls from this chunk
                                if let Some(ref tool_calls) = chunk.tool_calls {
                                    for tc in tool_calls {
                                        let entry = accumulated_tool_calls
                                            .entry(tc.index)
                                            .or_insert_with(|| {
                                                crate::core::llm::sse_parser::StreamingToolCall {
                                                    index: tc.index,
                                                    id: String::new(),
                                                    name: String::new(),
                                                    arguments: String::new(),
                                                }
                                            });

                                        // Merge: ID and name only appear in first chunk
                                        if !tc.id.is_empty() {
                                            entry.id = tc.id.clone();
                                        }
                                        if !tc.name.is_empty() {
                                            entry.name = tc.name.clone();
                                        }
                                        // Arguments are streamed across multiple chunks
                                        entry.arguments.push_str(&tc.arguments);
                                    }
                                }

                                if let Some(usage) = chunk.usage {
                                    final_usage = Some(usage);
                                }
                                if let Some(credits) = chunk.credits {
                                    final_credits = Some(credits);
                                }

                                let _ = app_handle_clone.emit(
                                    "chat:stream-chunk",
                                    serde_json::json!({
                                        "conversation_id": conversation_id_clone,
                                        "message_id": frontend_message_id_clone,
                                        "delta": chunk.content,
                                        "content": full_content.clone(),
                                        "has_pending_messages": has_pending_messages()
                                    }),
                                );
                            }
                            Err(e) => {
                                info!("[Chat] Stream error: {e}");
                                let _ = app_handle_clone.emit(
                                    "chat:stream-error",
                                    serde_json::json!({
                                        "conversation_id": conversation_id_clone,
                                        "message_id": frontend_message_id_clone,
                                        "error": e.to_string()
                                    }),
                                );
                                // Emit stream-end after error so frontend can cleanup loading state
                                let _ = app_handle_clone.emit(
                                    "chat:stream-end",
                                    serde_json::json!({
                                        "conversation_id": conversation_id_clone,
                                        "message_id": frontend_message_id_clone,
                                        "content": full_content.clone(),
                                        "error": true,
                                        "has_pending_messages": has_pending_messages()
                                    }),
                                );
                                return;
                            }
                        }
                    }

                    // Check if we have tool calls to execute
                    // finish_reason == "tool_calls" indicates the LLM wants to use tools
                    let has_tool_calls = final_finish_reason.as_deref() == Some("tool_calls")
                        && !accumulated_tool_calls.is_empty();

                    if has_tool_calls && !was_stopped {
                        info!(
                            "[Chat] Streaming completed with {} tool call(s) - executing tools",
                            accumulated_tool_calls.len()
                        );

                        // Convert accumulated tool calls to sorted Vec
                        let mut tool_calls_vec: Vec<_> =
                            accumulated_tool_calls.into_iter().collect();
                        tool_calls_vec.sort_by_key(|(idx, _)| *idx);
                        let tool_calls: Vec<_> =
                            tool_calls_vec.into_iter().map(|(_, tc)| tc).collect();

                        // Emit tool calls event
                        let _ = app_handle_clone.emit(
                            "chat:tool-calls",
                            serde_json::json!({
                                "conversation_id": conversation_id_clone,
                                "tool_calls": tool_calls,
                                "streaming": true
                            }),
                        );

                        // Execute each tool and collect results
                        let mut tool_results = Vec::new();
                        for tc in &tool_calls {
                            info!(
                                "[Chat] Executing streamed tool: {} (id: {})",
                                tc.name, tc.id
                            );

                            // Emit tool executing event
                            let _ = app_handle_clone.emit(
                                "chat:tool-executing",
                                serde_json::json!({
                                    "conversation_id": conversation_id_clone,
                                    "tool_call_id": tc.id,
                                    "tool_name": tc.name,
                                    "arguments": tc.arguments
                                }),
                            );

                            // Execute the tool
                            let result = tools::execute_chat_tool(
                                &tc.name,
                                &tc.arguments,
                                Some(&app_handle_clone),
                            )
                            .await;

                            let (success, result_content) = match result {
                                Ok(content) => {
                                    info!("[Chat] Streamed tool {} succeeded", tc.name);
                                    (true, content)
                                }
                                Err(e) => {
                                    error!("[Chat] Streamed tool {} failed: {}", tc.name, e);
                                    (false, format!("Error: {}", e))
                                }
                            };

                            // Emit tool result event
                            let _ = app_handle_clone.emit(
                                "chat:tool-result",
                                serde_json::json!({
                                    "conversation_id": conversation_id_clone,
                                    "tool_call_id": tc.id,
                                    "tool_name": tc.name,
                                    "success": success,
                                    "result": result_content.chars().take(500).collect::<String>()
                                }),
                            );

                            tool_results.push(tools::ChatToolResult::new(
                                tc.id.clone(),
                                tc.name.clone(),
                                success,
                                result_content,
                            ));
                        }

                        // Build follow-up messages with tool results
                        let mut followup_messages = llm_request_clone.messages.clone();

                        // Add assistant message with tool calls
                        followup_messages.push(crate::core::llm::ChatMessage {
                            role: "assistant".to_string(),
                            content: full_content.clone(),
                            tool_calls: Some(
                                tool_calls
                                    .iter()
                                    .map(|tc| crate::core::llm::ToolCall {
                                        id: tc.id.clone(),
                                        name: tc.name.clone(),
                                        arguments: tc.arguments.clone(),
                                    })
                                    .collect(),
                            ),
                            tool_call_id: None,
                            multimodal_content: None,
                        });

                        // Add tool results as tool role messages
                        for result in &tool_results {
                            followup_messages.push(crate::core::llm::ChatMessage {
                                role: "tool".to_string(),
                                content: result.to_message_content(),
                                tool_calls: None,
                                tool_call_id: Some(result.tool_call_id.clone()),
                                multimodal_content: None,
                            });
                        }

                        // Send follow-up request to LLM (non-streaming for simplicity)
                        let followup_request = crate::core::llm::LLMRequest {
                            messages: followup_messages,
                            model: model_clone.clone(),
                            temperature: Some(0.7),
                            max_tokens: Some(4096),
                            stream: false,
                            tools: llm_request_clone.tools.clone(),
                            tool_choice: llm_request_clone.tool_choice.clone(),
                            thinking_mode: llm_request_clone.thinking_mode,
                            ..Default::default()
                        };

                        // Get candidates for follow-up request
                        let candidates = router.candidates(&followup_request, &preferences_clone);

                        let mut followup_success = false;
                        for candidate in candidates {
                            match router.invoke_candidate(&candidate, &followup_request).await {
                                Ok(outcome) => {
                                    // Append tool results and final response to content
                                    full_content.push_str("\n\n");
                                    full_content.push_str(&outcome.response.content);
                                    token_count += outcome.response.tokens.unwrap_or(0);

                                    // Stream the final content to frontend
                                    let _ = app_handle_clone.emit(
                                        "chat:stream-chunk",
                                        serde_json::json!({
                                            "conversation_id": conversation_id_clone,
                                            "message_id": frontend_message_id_clone,
                                            "delta": outcome.response.content,
                                            "content": full_content.clone(),
                                            "has_pending_messages": has_pending_messages()
                                        }),
                                    );

                                    if let Some(credits) = outcome.response.credits {
                                        // Update final credits from follow-up (already CreditsInfo type)
                                        final_credits = Some(credits);
                                    }
                                    followup_success = true;
                                    break;
                                }
                                Err(e) => {
                                    warn!(
                                        "[Chat] Follow-up candidate {} failed: {}",
                                        candidate.model, e
                                    );
                                    continue;
                                }
                            }
                        }

                        if !followup_success {
                            error!("[Chat] All follow-up candidates failed");
                            full_content.push_str(
                                "\n\n*Tool execution completed but unable to generate final response.*",
                            );
                        }
                    }

                    if was_stopped && !full_content.is_empty() {
                        full_content.push_str("\n\n*[Generation stopped by user]*");
                    }

                    // Save assistant message to database
                    let assistant_message = {
                        let conn = match db_arc_clone.connection() {
                            Ok(conn) => conn,
                            Err(e) => {
                                let _ = app_handle_clone.emit(
                                    "chat:stream-error",
                                    serde_json::json!({
                                        "conversation_id": conversation_id_clone,
                                        "message_id": frontend_message_id_clone,
                                        "error": format!("Database error: {e}")
                                    }),
                                );
                                return;
                            }
                        };

                        let output_cost = if let Some(p) = provider_enum_clone {
                            CostCalculator::new().calculate(p, &model_clone, 0, token_count)
                        } else {
                            0.0
                        };

                        let msg = Message {
                            id: 0,
                            conversation_id: conversation_id_clone,
                            user_id: user_id_clone.clone(),
                            role: MessageRole::Assistant,
                            content: full_content.clone(),
                            tokens: Some(token_count as i32),
                            cost: Some(output_cost),
                            provider: provider_enum_clone.map(|p| p.as_string().to_string()),
                            model: Some(model_clone.clone()),
                            created_at: Utc::now(),
                        };
                        match repository::create_message(&conn, &msg) {
                            Ok(id) => match repository::get_message(&conn, id) {
                                Ok(msg) => msg,
                                Err(e) => {
                                    let _ = app_handle_clone.emit(
                                        "chat:stream-error",
                                        serde_json::json!({
                                            "conversation_id": conversation_id_clone,
                                            "message_id": frontend_message_id_clone,
                                            "error": format!("Failed to retrieve message: {e}")
                                        }),
                                    );
                                    return;
                                }
                            },
                            Err(e) => {
                                let _ = app_handle_clone.emit(
                                    "chat:stream-error",
                                    serde_json::json!({
                                        "conversation_id": conversation_id_clone,
                                        "message_id": frontend_message_id_clone,
                                        "error": format!("Failed to save message: {e}")
                                    }),
                                );
                                return;
                            }
                        }
                    };

                    // Check for pending messages at stream end
                    let pending_at_end = peek_pending_messages();
                    let _ = app_handle_clone.emit(
                        "chat:stream-end",
                        serde_json::json!({
                            "conversation_id": conversation_id_clone,
                            "message_id": frontend_message_id_clone,
                            "backend_message_id": assistant_message.id,
                            "pending_messages_count": pending_at_end.len(),
                            "has_pending_messages": !pending_at_end.is_empty(),
                            "usage": final_usage,
                            "credits": final_credits
                        }),
                    );

                    // If there are pending messages, emit them for processing
                    if !pending_at_end.is_empty() {
                        info!(
                            "[Chat] Stream ended with {} pending message(s) to process",
                            pending_at_end.len()
                        );
                        let _ = app_handle_clone.emit(
                            "chat:pending-messages-ready",
                            serde_json::json!({
                                "conversation_id": conversation_id_clone,
                                "pending_messages": pending_at_end,
                                "count": pending_at_end.len()
                            }),
                        );
                    }
                }
                Err(e) => {
                    let _ = app_handle_clone.emit(
                        "chat:stream-error",
                        serde_json::json!({
                            "conversation_id": conversation_id_clone,
                            "message_id": frontend_message_id_clone,
                            "error": format!("Streaming failed: {e}")
                        }),
                    );
                }
            }
        });

        // Return immediately for streaming mode - events handle the response
        return Ok(ChatSendMessageResponse {
            conversation,
            user_message,
            assistant_message: Message::default(),
            stats: ConversationStats {
                message_count: 0,
                total_tokens: 0,
                total_cost: 0.0,
            },
            last_message: None,
            credits: None,
        });
    }

    // Ensure ManagedCloud provider is initialized if user is authenticated
    // This handles cases where provider wasn't initialized on startup
    {
        use crate::core::llm::providers::managed_cloud_provider::ManagedCloudProvider;
        use crate::sys::account::get_access_token;

        // Check if user has access token (is authenticated) and provider isn't already set
        let has_managed_cloud = {
            let router = _llm_state.router.read().await;
            router.has_provider(Provider::ManagedCloud)
        };

        if !has_managed_cloud {
            match get_access_token() {
                Ok(_) => {
                    // User is authenticated, register ManagedCloud provider
                    match ManagedCloudProvider::new() {
                        Ok(provider) => {
                            let mut router = _llm_state.router.write().await;
                            router.set_managed_cloud(Box::new(provider));
                            info!(
                                "[Chat] Initialized ManagedCloud provider for authenticated user"
                            );
                        }
                        Err(e) => {
                            warn!("[Chat] Failed to create ManagedCloud provider: {}", e);
                        }
                    }
                }
                Err(_) => {
                    // User not authenticated, ManagedCloud won't be available
                    debug!("[Chat] User not authenticated, ManagedCloud provider not available");
                }
            }
        }
    }

    let candidates = {
        let router = _llm_state.router.read().await;
        router.candidates(&llm_request, &preferences)
    };

    if candidates.is_empty() {
        // Fallback logic: If the requested provider (e.g. OpenAI) is not locally configured,
        // but Managed Cloud IS available (authenticated user), redirect to Managed Cloud proxy.
        let router = _llm_state.router.read().await;
        if router.has_provider(Provider::ManagedCloud) {
            let provider_name = request
                .provider_override
                .clone()
                .or(request.provider.clone());
            if let Some(name) = provider_name {
                info!(
                    "[Chat] Redirecting request for unconfigured provider '{}' to Managed Cloud",
                    name
                );

                let fallback_candidate = crate::core::llm::llm_router::RouteCandidate {
                    provider: Provider::ManagedCloud,
                    model: model.clone(), // Use the same model name as a hint for the cloud proxy
                    reason: "fallback-redirect-to-managed-cloud",
                    strategy: None,
                };

                let result = router
                    .invoke_candidate(&fallback_candidate, &llm_request)
                    .await;
                match result {
                    Ok(outcome) => {
                        let assistant_message = {
                            let conn = _db.connection()?;
                            let msg = Message {
                                id: 0,
                                conversation_id: conversation.id,
                                role: MessageRole::Assistant,
                                content: outcome.response.content.clone(),
                                tokens: outcome.response.tokens.map(|t| t as i32),
                                cost: outcome.response.cost,
                                provider: Some(outcome.provider.as_string().to_string()),
                                model: Some(outcome.model.clone()),
                                created_at: Utc::now(),
                                user_id: conversation.user_id.clone(),
                            };
                            let id = repository::create_message(&conn, &msg)
                                .map_err(|e| format!("Failed to save assistant message: {e}"))?;
                            repository::get_message(&conn, id)
                                .map_err(|e| format!("Failed to retrieve assistant message: {e}"))?
                        };

                        let stats = {
                            let conn = _db.connection()?;
                            let messages = repository::list_messages(&conn, conversation.id)
                                .map_err(|e| format!("Failed to compute stats: {e}"))?;
                            ConversationStats {
                                message_count: messages.len(),
                                total_tokens: messages.iter().filter_map(|m| m.tokens).sum(),
                                total_cost: messages.iter().filter_map(|m| m.cost).sum(),
                            }
                        };

                        return Ok(ChatSendMessageResponse {
                            conversation,
                            user_message,
                            assistant_message,
                            stats,
                            last_message: Some(outcome.response.content),
                            credits: outcome.response.credits,
                        });
                    }
                    Err(e) => {
                        info!("[Chat] Managed Cloud fallback failed: {e}");
                    }
                }
            }
        }

        return Err(
            "No LLM providers configured. Please add an API key in Settings > API Keys or sign in to use Managed Cloud."
                .to_string(),
        );
    }

    let mut last_error: Option<String> = None;
    for candidate in candidates {
        let result = {
            let router = _llm_state.router.read().await;
            router.invoke_candidate(&candidate, &llm_request).await
        };

        match result {
            Ok(mut outcome) => {
                // Tool call handling loop - execute tools and send results back to LLM
                // This enables Claude Desktop/Code-like autonomous tool execution
                let max_tool_iterations = 10; // Safety limit to prevent infinite loops
                let mut tool_iteration = 0;
                let mut current_messages = llm_request.messages.clone();
                let mut final_content = outcome.response.content.clone();
                let mut total_tool_tokens: u32 = 0;

                while let Some(ref tool_calls) = outcome.response.tool_calls {
                    if tool_calls.is_empty() {
                        break;
                    }

                    tool_iteration += 1;
                    if tool_iteration > max_tool_iterations {
                        warn!(
                            "[Chat] Tool iteration limit reached ({}), stopping tool execution",
                            max_tool_iterations
                        );
                        break;
                    }

                    info!(
                        "[Chat] LLM requested {} tool call(s) (iteration {})",
                        tool_calls.len(),
                        tool_iteration
                    );

                    // Emit tool calls event for UI feedback
                    let _ = app_handle.emit(
                        "chat:tool-calls",
                        serde_json::json!({
                            "conversation_id": conversation.id,
                            "tool_calls": tool_calls,
                            "iteration": tool_iteration
                        }),
                    );

                    // Add assistant message with tool calls to conversation
                    current_messages.push(crate::core::llm::ChatMessage {
                        role: "assistant".to_string(),
                        content: outcome.response.content.clone(),
                        tool_calls: Some(tool_calls.clone()),
                        tool_call_id: None,
                        multimodal_content: None,
                    });

                    // Execute each tool and collect results
                    let mut tool_results = Vec::new();
                    for tool_call in tool_calls {
                        info!(
                            "[Chat] Executing tool: {} (id: {})",
                            tool_call.name, tool_call.id
                        );

                        // Emit individual tool execution event
                        let _ = app_handle.emit(
                            "chat:tool-executing",
                            serde_json::json!({
                                "conversation_id": conversation.id,
                                "tool_call_id": tool_call.id,
                                "tool_name": tool_call.name,
                                "arguments": tool_call.arguments
                            }),
                        );

                        // Execute the tool using our chat tools executor
                        let result = tools::execute_chat_tool(
                            &tool_call.name,
                            &tool_call.arguments,
                            Some(&app_handle),
                        )
                        .await;

                        let (success, result_content) = match result {
                            Ok(content) => {
                                info!("[Chat] Tool {} succeeded", tool_call.name);
                                (true, content)
                            }
                            Err(e) => {
                                error!("[Chat] Tool {} failed: {}", tool_call.name, e);
                                (false, format!("Error: {}", e))
                            }
                        };

                        // Emit tool result event
                        let _ = app_handle.emit(
                            "chat:tool-result",
                            serde_json::json!({
                                "conversation_id": conversation.id,
                                "tool_call_id": tool_call.id,
                                "tool_name": tool_call.name,
                                "success": success,
                                "result": result_content.chars().take(500).collect::<String>()
                            }),
                        );

                        tool_results.push(tools::ChatToolResult::new(
                            tool_call.id.clone(),
                            tool_call.name.clone(),
                            success,
                            result_content,
                        ));
                    }

                    // Add tool results as messages
                    for result in &tool_results {
                        current_messages.push(crate::core::llm::ChatMessage {
                            role: "tool".to_string(),
                            content: result.to_message_content(),
                            tool_calls: None,
                            tool_call_id: Some(result.tool_call_id.clone()),
                            multimodal_content: None,
                        });
                    }

                    // Send updated conversation back to LLM
                    let followup_request = crate::core::llm::LLMRequest {
                        messages: current_messages.clone(),
                        model: model.clone(),
                        temperature: Some(0.7),
                        max_tokens: Some(4096),
                        stream: false,
                        tools: chat_tools.clone(),
                        tool_choice: tool_choice.clone(),
                        thinking_mode: request.thinking_mode,
                        ..Default::default()
                    };

                    let followup_result = {
                        let router = _llm_state.router.read().await;
                        router.invoke_candidate(&candidate, &followup_request).await
                    };

                    match followup_result {
                        Ok(new_outcome) => {
                            total_tool_tokens += new_outcome.response.tokens.unwrap_or(0);
                            final_content = new_outcome.response.content.clone();
                            outcome = new_outcome;
                        }
                        Err(e) => {
                            error!("[Chat] Follow-up LLM call failed: {}", e);
                            // Use the last successful content
                            break;
                        }
                    }
                }

                if tool_iteration > 0 {
                    info!(
                        "[Chat] Tool execution complete after {} iteration(s), {} additional tokens used",
                        tool_iteration,
                        total_tool_tokens
                    );
                }

                let assistant_message = {
                    let conn = _db.connection()?;
                    let total_tokens = outcome
                        .response
                        .tokens
                        .map(|t| t as i32)
                        .map(|t| t + total_tool_tokens as i32);
                    let msg = Message {
                        id: 0,
                        conversation_id: conversation.id,
                        role: MessageRole::Assistant,
                        content: final_content.clone(),
                        tokens: total_tokens,
                        cost: outcome.response.cost,
                        provider: Some(outcome.provider.as_string().to_string()),
                        model: Some(outcome.model.clone()),
                        created_at: Utc::now(),
                        user_id: conversation.user_id.clone(),
                    };

                    let id = repository::create_message(&conn, &msg)
                        .map_err(|e| format!("Failed to save assistant message: {e}"))?;
                    repository::get_message(&conn, id)
                        .map_err(|e| format!("Failed to retrieve assistant message: {e}"))?
                };

                let stats = {
                    let conn = _db.connection()?;
                    let messages = repository::list_messages(&conn, conversation.id)
                        .map_err(|e| format!("Failed to compute stats: {e}"))?;
                    ConversationStats {
                        message_count: messages.len(),
                        total_tokens: messages.iter().filter_map(|m| m.tokens).sum(),
                        total_cost: messages.iter().filter_map(|m| m.cost).sum(),
                    }
                };

                return Ok(ChatSendMessageResponse {
                    conversation,
                    user_message,
                    assistant_message,
                    stats,
                    last_message: Some(final_content),
                    credits: outcome.response.credits,
                });
            }
            Err(e) => {
                last_error = Some(format!("{}: {e}", candidate.provider.as_string()));
            }
        }
    }

    Err(format!(
        "All providers failed. Last error:{}",
        last_error.unwrap_or_else(|| "Unknown error".to_string())
    ))
}

#[tauri::command]
pub fn chat_get_cost_overview(
    db: State<'_, AppDatabase>,
    user_id: String,
) -> Result<CostOverviewResponse, String> {
    if user_id.is_empty() {
        return Err("User ID cannot be empty".to_string());
    }

    let conn = db.connection()?;

    let now = Utc::now();
    let today_start = Utc
        .with_ymd_and_hms(now.year(), now.month(), now.day(), 0, 0, 0)
        .single()
        .ok_or_else(|| "Failed to compute start-of-day".to_string())?;
    let month_start = Utc
        .with_ymd_and_hms(now.year(), now.month(), 1, 0, 0, 0)
        .single()
        .ok_or_else(|| "Failed to compute start-of-month".to_string())?;

    let today_total = repository::sum_cost_since(&conn, today_start, &user_id)
        .map_err(|e| format!("Failed to compute today's cost: {e}"))?;
    let month_total = repository::sum_cost_since(&conn, month_start, &user_id)
        .map_err(|e| format!("Failed to compute monthly cost: {e}"))?;

    let monthly_budget = repository::get_setting(&conn, "billing.monthly_budget")
        .ok()
        .and_then(|setting| setting.value.parse::<f64>().ok());
    let remaining_budget = monthly_budget.map(|budget| (budget - month_total).max(0.0));

    Ok(CostOverviewResponse {
        today_total,
        month_total,
        monthly_budget,
        remaining_budget,
    })
}

#[tauri::command]
pub fn chat_get_cost_analytics(
    db: State<'_, AppDatabase>,
    user_id: String,
    days: Option<i64>,
    provider: Option<String>,
    model: Option<String>,
) -> Result<CostAnalyticsResponse, String> {
    if user_id.is_empty() {
        return Err("User ID cannot be empty".to_string());
    }
    if let Some(d) = days {
        if d <= 0 {
            return Err(format!("Invalid days value: {}. Days must be positive", d));
        }
        if d > 3650 {
            return Err(format!(
                "Invalid days value: {}. Days cannot exceed 3650 (10 years)",
                d
            ));
        }
    }

    let conn = db.connection()?;
    let window = days.unwrap_or(30).max(1);

    let provider_clean = provider
        .as_ref()
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty());
    let model_clean = model
        .as_ref()
        .map(|m| m.trim().to_string())
        .filter(|m| !m.is_empty());

    let provider_ref = provider_clean.as_deref();
    let model_ref = model_clean.as_deref();

    let end = Utc::now();
    let span = window - 1;
    let start = if span > 0 {
        end - ChronoDuration::days(span)
    } else {
        end
    };

    let timeseries =
        repository::list_cost_timeseries(&conn, window, provider_ref, model_ref, &user_id)
            .map_err(|e| format!("Failed to load cost timeseries: {e}"))?;
    let providers = repository::list_cost_by_provider(
        &conn,
        Some(start),
        Some(end),
        provider_ref,
        model_ref,
        &user_id,
    )
    .map_err(|e| format!("Failed to load provider breakdown: {e}"))?;
    let top_conversations = repository::list_top_conversations_by_cost_filtered(
        &conn,
        10,
        Some(start),
        Some(end),
        provider_ref,
        model_ref,
        &user_id,
    )
    .map_err(|e| format!("Failed to load top conversations: {e}"))?;

    Ok(CostAnalyticsResponse {
        timeseries,
        providers,
        top_conversations,
    })
}

#[tauri::command]
pub fn chat_set_monthly_budget(
    db: State<'_, AppDatabase>,
    amount: Option<f64>,
) -> Result<(), String> {
    if let Some(value) = amount {
        if value < 0.0 {
            return Err(format!(
                "Invalid budget amount: {}. Budget must be non-negative",
                value
            ));
        }
        if value > 1_000_000.0 {
            return Err(format!(
                "Invalid budget amount: {}. Budget cannot exceed $1,000,000",
                value
            ));
        }
    }

    let conn = db.connection()?;

    match amount {
        Some(value) => repository::set_setting(
            &conn,
            "billing.monthly_budget".to_string(),
            format!("{:.2}", value),
            false,
        )
        .map_err(|e| format!("Failed to save monthly budget: {e}"))?,
        None => repository::delete_setting(&conn, "billing.monthly_budget")
            .map_err(|e| format!("Failed to clear monthly budget: {e}"))?,
    }

    Ok(())
}

#[tauri::command]
pub async fn chat_stop_generation() -> Result<(), String> {
    info!("[Chat] Stopping generation - setting stop flag");
    STOP_GENERATION.store(true, Ordering::SeqCst);
    Ok(())
}

pub fn should_stop_generation() -> bool {
    STOP_GENERATION.load(Ordering::SeqCst)
}

pub fn reset_stop_flag() {
    STOP_GENERATION.store(false, Ordering::SeqCst);
}

// ============================================================================
// Pending Messages API - Allows users to queue messages while AI is processing
// ============================================================================

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AddPendingMessageRequest {
    pub content: String,
    pub conversation_id: Option<i64>,
}

#[tauri::command]
pub async fn chat_add_pending_message(
    app_handle: tauri::AppHandle,
    request: AddPendingMessageRequest,
) -> Result<PendingUserMessage, String> {
    let trimmed_content = request.content.trim();
    if trimmed_content.is_empty() {
        return Err("Pending message content cannot be empty".to_string());
    }
    if trimmed_content.len() > 100_000 {
        return Err("Pending message content cannot exceed 100,000 characters".to_string());
    }

    let pending_msg = PendingUserMessage {
        id: uuid::Uuid::new_v4().to_string(),
        content: trimmed_content.to_string(),
        timestamp: Utc::now(),
        conversation_id: request.conversation_id,
    };

    {
        let mut queue = PENDING_MESSAGES
            .lock()
            .map_err(|e| format!("Failed to lock pending messages queue: {e}"))?;
        queue.push(pending_msg.clone());
        info!(
            "[Chat] Added pending message (queue size: {}): {}...",
            queue.len(),
            &trimmed_content.chars().take(50).collect::<String>()
        );
    }

    // Emit event to notify frontend
    let _ = app_handle.emit("chat:pending-message-added", &pending_msg);

    Ok(pending_msg)
}

#[tauri::command]
pub async fn chat_get_pending_messages() -> Result<Vec<PendingUserMessage>, String> {
    let queue = PENDING_MESSAGES
        .lock()
        .map_err(|e| format!("Failed to lock pending messages queue: {e}"))?;
    Ok(queue.clone())
}

#[tauri::command]
pub async fn chat_clear_pending_messages(app_handle: tauri::AppHandle) -> Result<(), String> {
    let mut queue = PENDING_MESSAGES
        .lock()
        .map_err(|e| format!("Failed to lock pending messages queue: {e}"))?;
    let count = queue.len();
    queue.clear();
    info!("[Chat] Cleared {} pending messages", count);

    // Emit event to notify frontend
    let _ = app_handle.emit(
        "chat:pending-messages-cleared",
        serde_json::json!({ "count": count }),
    );

    Ok(())
}

#[tauri::command]
pub async fn chat_pop_pending_message(
    app_handle: tauri::AppHandle,
) -> Result<Option<PendingUserMessage>, String> {
    let mut queue = PENDING_MESSAGES
        .lock()
        .map_err(|e| format!("Failed to lock pending messages queue: {e}"))?;

    if queue.is_empty() {
        return Ok(None);
    }

    let msg = queue.remove(0);
    info!(
        "[Chat] Popped pending message (remaining: {}): {}...",
        queue.len(),
        &msg.content.chars().take(50).collect::<String>()
    );

    // Emit event to notify frontend
    let _ = app_handle.emit(
        "chat:pending-message-consumed",
        serde_json::json!({
            "message": msg,
            "remaining": queue.len()
        }),
    );

    Ok(Some(msg))
}

/// Check if there are pending messages (used by tool executor)
pub fn has_pending_messages() -> bool {
    PENDING_MESSAGES
        .lock()
        .map(|q| !q.is_empty())
        .unwrap_or(false)
}

/// Get pending messages count
pub fn pending_messages_count() -> usize {
    PENDING_MESSAGES.lock().map(|q| q.len()).unwrap_or(0)
}

/// Peek at pending messages without removing them
pub fn peek_pending_messages() -> Vec<PendingUserMessage> {
    PENDING_MESSAGES
        .lock()
        .map(|q| q.clone())
        .unwrap_or_default()
}

// ============================================================================
// Smart Intent Detection API
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

// ============================================================================
// Context Compaction API (CTX-004)
// ============================================================================

/// Response from context compaction
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ContextCompactionResponse {
    /// Number of messages that were compacted
    pub messages_compacted: usize,
    /// Token count before compaction
    pub tokens_before: usize,
    /// Token count after compaction
    pub tokens_after: usize,
    /// Token savings percentage
    pub savings_percent: f32,
    /// Whether a summary was created
    pub summary_created: bool,
    /// Focus area used for compaction (if specified)
    pub focus: Option<String>,
    /// User-friendly message about the result
    pub message: String,
}

/// Compact the context of a conversation to reduce token usage
///
/// # Arguments
/// * `conversation_id` - The conversation to compact
/// * `focus` - Optional focus area to preserve (e.g., "code", "decisions", "errors")
/// * `user_id` - The user ID for authorization
///
/// # Returns
/// Compaction statistics and result message
#[tauri::command]
pub async fn chat_compact_context(
    db: State<'_, AppDatabase>,
    conversation_id: i64,
    focus: Option<String>,
    user_id: String,
) -> Result<ContextCompactionResponse, String> {
    use crate::core::agent::context_compactor::{CompactionConfig, ContextCompactor};

    if conversation_id <= 0 {
        return Err(format!(
            "Invalid conversation ID: {}. ID must be positive",
            conversation_id
        ));
    }
    if user_id.is_empty() {
        return Err("User ID cannot be empty".to_string());
    }

    // Load messages in a block to release the connection before async operations
    let messages = {
        let conn = db.connection()?;

        // Verify conversation ownership
        repository::get_conversation(&conn, conversation_id, &user_id)
            .map_err(|e| format!("Access denied or conversation not found: {e}"))?;

        // Load messages for the conversation
        repository::list_messages(&conn, conversation_id)
            .map_err(|e| format!("Failed to load messages: {e}"))?
    };

    if messages.is_empty() {
        return Ok(ContextCompactionResponse {
            messages_compacted: 0,
            tokens_before: 0,
            tokens_after: 0,
            savings_percent: 0.0,
            summary_created: false,
            focus: focus.clone(),
            message: "No messages to compact in this conversation.".to_string(),
        });
    }

    // Calculate current token count
    let tokens_before: usize = messages
        .iter()
        .map(|m| m.tokens.unwrap_or(0) as usize)
        .sum();

    // Check if compaction is needed
    if messages.len() < 10 {
        return Ok(ContextCompactionResponse {
            messages_compacted: 0,
            tokens_before,
            tokens_after: tokens_before,
            savings_percent: 0.0,
            summary_created: false,
            focus: focus.clone(),
            message: format!(
                "Conversation has only {} messages. Compaction not needed (minimum 10 messages).",
                messages.len()
            ),
        });
    }

    // Create compactor with custom config based on focus
    let config = CompactionConfig {
        max_tokens: 100_000,
        target_tokens: 50_000,
        keep_recent: match focus.as_deref() {
            Some("errors") | Some("debug") => 15, // Keep more recent for debugging
            Some("decisions") | Some("todo") => 5, // Keep fewer, focus on decisions
            _ => 10,                              // Default
        },
        min_messages: 10,
    };

    let compactor = ContextCompactor::new(config);

    // Check if compaction would be beneficial
    if !compactor.should_compact(&messages) {
        return Ok(ContextCompactionResponse {
            messages_compacted: 0,
            tokens_before,
            tokens_after: tokens_before,
            savings_percent: 0.0,
            summary_created: false,
            focus: focus.clone(),
            message: format!(
                "Context is within limits ({} tokens). No compaction needed.",
                tokens_before
            ),
        });
    }

    // Generate summary using heuristic method (LLM integration would require async setup)
    let summary = compactor
        .generate_summary(&messages)
        .await
        .map_err(|e| format!("Failed to generate summary: {e}"))?;

    // Get compacted messages
    let compacted = compactor.get_compacted_messages(&messages, &summary);
    let tokens_after: usize = compacted
        .iter()
        .map(|m| m.tokens.unwrap_or(0) as usize)
        .sum();

    let messages_compacted = messages.len() - compacted.len();
    let savings_percent = if tokens_before > 0 {
        ((tokens_before - tokens_after) as f32 / tokens_before as f32) * 100.0
    } else {
        0.0
    };

    info!(
        "[Chat] Context compaction: {} messages → {} messages, {} → {} tokens ({:.1}% saved)",
        messages.len(),
        compacted.len(),
        tokens_before,
        tokens_after,
        savings_percent
    );

    // Note: We don't actually delete messages from DB - the compaction is for the LLM context
    // The summary could be stored as a system message if needed

    Ok(ContextCompactionResponse {
        messages_compacted,
        tokens_before,
        tokens_after,
        savings_percent,
        summary_created: true,
        focus: focus.clone(),
        message: format!(
            "Compacted {} messages, saving {:.1}% of tokens ({} → {}).",
            messages_compacted, savings_percent, tokens_before, tokens_after
        ),
    })
}

/// Handle stop command - sets stop flag and emits event
#[tauri::command]
pub async fn chat_handle_stop(app_handle: tauri::AppHandle) -> Result<bool, String> {
    info!("[Chat] Handling stop command - setting stop flag and emitting event");
    STOP_GENERATION.store(true, Ordering::SeqCst);

    // Emit stop event to all listeners
    let _ = app_handle.emit(
        "chat:stop-requested",
        serde_json::json!({
            "timestamp": Utc::now().to_rfc3339(),
            "source": "user_command"
        }),
    );

    // Emit AGI cancel event - the orchestrator listens for this
    let _ = app_handle.emit(
        "agi:goal:cancelled",
        serde_json::json!({
            "reason": "user_stop_command",
            "timestamp": Utc::now().to_rfc3339()
        }),
    );
    info!("[Chat] AGI orchestrator cancellation event emitted");

    Ok(true)
}
