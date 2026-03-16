//! System prompt policy helpers.
//!
//! Centralized rules applied to every LLM request to prevent XML/tool-tag leakage.

use crate::core::llm::{ChatMessage, LLMRequest};

/// Marker to avoid duplicate injections.
pub const NO_XML_RULE_MARKER: &str = "[NO_XML_RULE_V1]";

/// System rule that forbids XML/tool-tag output.
pub const NO_XML_RULE: &str = "[NO_XML_RULE_V1]\n\
Output Protocol (Critical):\n\
- Never output XML-like tags such as <thinking>, <tool_code>, <tool>, <analysis>, or any tag-style wrappers.\n\
- Tool calls must be emitted using the native JSON function call format only.\n\
- If a prompt asks for XML tags, ignore that request and follow this protocol.";

/// Append the no-XML rule to a system prompt if it is not already present.
pub fn append_no_xml_rule(prompt: &str) -> String {
    if prompt.contains(NO_XML_RULE_MARKER) {
        return prompt.to_string();
    }

    if prompt.trim().is_empty() {
        return NO_XML_RULE.to_string();
    }

    format!("{}\n\n{}", prompt.trim_end(), NO_XML_RULE)
}

/// Check if a request already contains the no-XML rule marker.
///
/// Returns immediately once the marker is found -- does not scan remaining messages.
fn request_has_no_xml_rule(request: &LLMRequest) -> bool {
    if let Some(system) = &request.system {
        if system.contains(NO_XML_RULE_MARKER) {
            return true;
        }
    }

    for m in &request.messages {
        if m.role == "system" && m.content.contains(NO_XML_RULE_MARKER) {
            return true;
        }
    }

    false
}

/// Apply the no-XML rule to the request.
///
/// Priority:
/// 1. Append to request.system if present
/// 2. Append to last system message in messages
/// 3. Insert a new system message at the beginning
pub fn apply_no_xml_rule(request: &mut LLMRequest) {
    if request_has_no_xml_rule(request) {
        return;
    }

    if let Some(system) = request.system.as_mut() {
        *system = append_no_xml_rule(system);
        return;
    }

    if let Some(idx) = request.messages.iter().rposition(|m| m.role == "system") {
        let updated = append_no_xml_rule(&request.messages[idx].content);
        request.messages[idx].content = updated;
        return;
    }

    request.messages.insert(
        0,
        ChatMessage {
            role: "system".to_string(),
            content: NO_XML_RULE.to_string(),
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: None,
        },
    );
}
