//! Pure text transformation helpers extracted from `chat_composer`.
//!
//! All functions here are stateless (no `self`): they operate only on their
//! arguments and return values.  This makes them easy to unit-test in isolation
//! and keeps the main composer file focused on state-machine logic.
use std::collections::HashMap;
use std::collections::VecDeque;

use agiworkforce_protocol::custom_prompts::CustomPrompt;
use agiworkforce_protocol::custom_prompts::PROMPTS_CMD_PREFIX;
use agiworkforce_protocol::user_input::ByteRange;
use agiworkforce_protocol::user_input::MAX_USER_INPUT_TEXT_CHARS;
use agiworkforce_protocol::user_input::TextElement;

use crate::bottom_pane::prompt_args::expand_if_numeric_with_positional_args;
use crate::bottom_pane::prompt_args::prompt_argument_names;
use crate::bottom_pane::prompt_args::prompt_command_with_arg_placeholders;
use crate::bottom_pane::prompt_args::prompt_has_numeric_placeholders;

pub(super) const LARGE_PASTE_CHAR_THRESHOLD: usize = 1000;

pub(super) fn user_input_too_large_message(actual_chars: usize) -> String {
    format!(
        "Message exceeds the maximum length of {MAX_USER_INPUT_TEXT_CHARS} characters ({actual_chars} provided)."
    )
}

/// Clamp `pos` to a valid UTF-8 char boundary in `text`.
#[inline]
pub(super) fn clamp_to_char_boundary(text: &str, pos: usize) -> usize {
    let mut p = pos.min(text.len());
    if p < text.len() && !text.is_char_boundary(p) {
        p = text
            .char_indices()
            .map(|(i, _)| i)
            .take_while(|&i| i <= p)
            .last()
            .unwrap_or(0);
    }
    p
}

pub(super) fn is_image_path(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    lower.ends_with(".png")
        || lower.ends_with(".jpg")
        || lower.ends_with(".jpeg")
        || lower.ends_with(".gif")
        || lower.ends_with(".webp")
}

/// Rebase `elements` byte-ranges after leading/trailing whitespace is trimmed from `original`
/// to produce `trimmed`.
pub(super) fn trim_text_elements(
    original: &str,
    trimmed: &str,
    elements: Vec<TextElement>,
) -> Vec<TextElement> {
    if trimmed.is_empty() || elements.is_empty() {
        return Vec::new();
    }
    let trimmed_start = original.len().saturating_sub(original.trim_start().len());
    let trimmed_end = trimmed_start.saturating_add(trimmed.len());

    elements
        .into_iter()
        .filter_map(|elem| {
            let start = elem.byte_range.start;
            let end = elem.byte_range.end;
            if end <= trimmed_start || start >= trimmed_end {
                return None;
            }
            let new_start = start.saturating_sub(trimmed_start);
            let new_end = end.saturating_sub(trimmed_start).min(trimmed.len());
            if new_start >= new_end {
                return None;
            }
            let placeholder = trimmed.get(new_start..new_end).map(str::to_string);
            Some(TextElement::new(
                ByteRange {
                    start: new_start,
                    end: new_end,
                },
                placeholder,
            ))
        })
        .collect()
}

/// Expand large-paste placeholders using element ranges and rebuild other element spans.
///
/// `pending_pastes` is a list of `(placeholder, actual_text)` pairs.  Each placeholder
/// element whose label matches a pending paste is replaced inline with its full payload;
/// all other elements have their byte-ranges adjusted to account for the insertions.
pub(crate) fn expand_pending_pastes(
    text: &str,
    mut elements: Vec<TextElement>,
    pending_pastes: &[(String, String)],
) -> (String, Vec<TextElement>) {
    if pending_pastes.is_empty() || elements.is_empty() {
        return (text.to_string(), elements);
    }

    // Stage 1: index pending paste payloads by placeholder for deterministic replacements.
    let mut pending_by_placeholder: HashMap<&str, VecDeque<&str>> = HashMap::new();
    for (placeholder, actual) in pending_pastes {
        pending_by_placeholder
            .entry(placeholder.as_str())
            .or_default()
            .push_back(actual.as_str());
    }

    // Stage 2: walk elements in order and rebuild text/spans in a single pass.
    elements.sort_by_key(|elem| elem.byte_range.start);

    let mut rebuilt = String::with_capacity(text.len());
    let mut rebuilt_elements = Vec::with_capacity(elements.len());
    let mut cursor = 0usize;

    for elem in elements {
        let start = elem.byte_range.start.min(text.len());
        let end = elem.byte_range.end.min(text.len());
        if start > end {
            continue;
        }
        if start > cursor {
            rebuilt.push_str(&text[cursor..start]);
        }
        let elem_text = &text[start..end];
        let placeholder = elem.placeholder(text).map(str::to_string);
        let replacement = placeholder
            .as_deref()
            .and_then(|ph| pending_by_placeholder.get_mut(ph))
            .and_then(VecDeque::pop_front);
        if let Some(actual) = replacement {
            // Stage 3: inline actual paste payloads and drop their placeholder elements.
            rebuilt.push_str(actual);
        } else {
            // Stage 4: keep non-paste elements, updating their byte ranges for the new text.
            let new_start = rebuilt.len();
            rebuilt.push_str(elem_text);
            let new_end = rebuilt.len();
            let placeholder = placeholder.or_else(|| Some(elem_text.to_string()));
            rebuilt_elements.push(TextElement::new(
                ByteRange {
                    start: new_start,
                    end: new_end,
                },
                placeholder,
            ));
        }
        cursor = end;
    }

    // Stage 5: append any trailing text that followed the last element.
    if cursor < text.len() {
        rebuilt.push_str(&text[cursor..]);
    }

    (rebuilt, rebuilt_elements)
}

// ---------------------------------------------------------------------------
// Prompt-selection helpers (used by the slash-command popup key handler)
// ---------------------------------------------------------------------------

pub(super) enum PromptSelectionMode {
    Completion,
    Submit,
}

pub(super) enum PromptSelectionAction {
    Insert {
        text: String,
        cursor: Option<usize>,
    },
    Submit {
        text: String,
        text_elements: Vec<TextElement>,
    },
}

pub(super) fn prompt_selection_action(
    prompt: &CustomPrompt,
    first_line: &str,
    mode: PromptSelectionMode,
    text_elements: &[TextElement],
) -> PromptSelectionAction {
    let named_args = prompt_argument_names(&prompt.content);
    let has_numeric = prompt_has_numeric_placeholders(&prompt.content);

    match mode {
        PromptSelectionMode::Completion => {
            if !named_args.is_empty() {
                let (text, cursor) =
                    prompt_command_with_arg_placeholders(&prompt.name, &named_args);
                return PromptSelectionAction::Insert {
                    text,
                    cursor: Some(cursor),
                };
            }
            if has_numeric {
                let text = format!("/{PROMPTS_CMD_PREFIX}:{} ", prompt.name);
                return PromptSelectionAction::Insert { text, cursor: None };
            }
            let text = format!("/{PROMPTS_CMD_PREFIX}:{}", prompt.name);
            PromptSelectionAction::Insert { text, cursor: None }
        }
        PromptSelectionMode::Submit => {
            if !named_args.is_empty() {
                let (text, cursor) =
                    prompt_command_with_arg_placeholders(&prompt.name, &named_args);
                return PromptSelectionAction::Insert {
                    text,
                    cursor: Some(cursor),
                };
            }
            if has_numeric {
                if let Some(expanded) =
                    expand_if_numeric_with_positional_args(prompt, first_line, text_elements)
                {
                    return PromptSelectionAction::Submit {
                        text: expanded.text,
                        text_elements: expanded.text_elements,
                    };
                }
                let text = format!("/{PROMPTS_CMD_PREFIX}:{} ", prompt.name);
                return PromptSelectionAction::Insert { text, cursor: None };
            }
            PromptSelectionAction::Submit {
                text: prompt.content.clone(),
                // By now we know this custom prompt has no args, so no text elements to preserve.
                text_elements: Vec::new(),
            }
        }
    }
}
