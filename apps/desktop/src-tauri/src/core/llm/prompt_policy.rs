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

/// Result of scanning request messages in a single pass.
///
/// Combines marker detection and last-system-message lookup so that
/// `apply_no_xml_rule` never needs a second traversal.
struct ScanResult {
    /// `true` if the marker was found anywhere (system field or messages).
    marker_found: bool,
    /// Index of the last message with `role == "system"`, if any.
    last_system_idx: Option<usize>,
}

/// Scan request for the no-XML marker and the last system message in one pass.
///
/// Early-break: as soon as the marker is found in any message, the loop exits
/// immediately. The remaining messages are not inspected because the only
/// information we still need (last_system_idx) is irrelevant when the marker
/// is already present -- `apply_no_xml_rule` will short-circuit.
fn scan_request(request: &LLMRequest) -> ScanResult {
    // Check the dedicated system field first.
    if let Some(system) = &request.system {
        if system.contains(NO_XML_RULE_MARKER) {
            return ScanResult {
                marker_found: true,
                last_system_idx: None,
            };
        }
    }

    let mut last_system_idx: Option<usize> = None;

    for (i, m) in request.messages.iter().enumerate() {
        if m.role == "system" {
            // Early break: marker found -- no need to keep scanning.
            if m.content.contains(NO_XML_RULE_MARKER) {
                return ScanResult {
                    marker_found: true,
                    last_system_idx: None,
                };
            }
            last_system_idx = Some(i);
        }
    }

    ScanResult {
        marker_found: false,
        last_system_idx,
    }
}

/// Apply the no-XML rule to the request.
///
/// Uses a single-pass scan (`scan_request`) to both detect an existing marker
/// and locate the last system message. This avoids the previous pattern of
/// scanning once for the marker and then again with `rposition`.
///
/// Priority:
/// 1. Append to request.system if present
/// 2. Append to last system message in messages
/// 3. Insert a new system message at the beginning
pub fn apply_no_xml_rule(request: &mut LLMRequest) {
    let scan = scan_request(request);

    // Marker already present -- nothing to do.
    if scan.marker_found {
        return;
    }

    // Prefer the dedicated system field when available.
    if let Some(system) = request.system.as_mut() {
        *system = append_no_xml_rule(system);
        return;
    }

    // Append to the last system message found during the scan.
    if let Some(idx) = scan.last_system_idx {
        let updated = append_no_xml_rule(&request.messages[idx].content);
        request.messages[idx].content = updated;
        return;
    }

    // No system field and no system messages -- insert one at the front.
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::llm::{ChatMessage, LLMRequest};

    fn msg(role: &str, content: &str) -> ChatMessage {
        ChatMessage {
            role: role.to_string(),
            content: content.to_string(),
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: None,
        }
    }

    // ── append_no_xml_rule ──────────────────────────────────────────────

    #[test]
    fn append_no_xml_rule_to_empty_prompt() {
        let result = append_no_xml_rule("");
        assert_eq!(result, NO_XML_RULE);
    }

    #[test]
    fn append_no_xml_rule_to_whitespace_prompt() {
        let result = append_no_xml_rule("   \n  ");
        assert_eq!(result, NO_XML_RULE);
    }

    #[test]
    fn append_no_xml_rule_to_normal_prompt() {
        let result = append_no_xml_rule("You are a helpful assistant.");
        assert!(result.starts_with("You are a helpful assistant."));
        assert!(result.contains(NO_XML_RULE_MARKER));
    }

    #[test]
    fn append_no_xml_rule_idempotent() {
        let first = append_no_xml_rule("Hello");
        let second = append_no_xml_rule(&first);
        assert_eq!(first, second, "appending twice must not duplicate the rule");
    }

    // ── scan_request: early break on system field ───────────────────────

    #[test]
    fn scan_finds_marker_in_system_field() {
        let req = LLMRequest {
            system: Some(format!("prefix {}", NO_XML_RULE_MARKER)),
            messages: vec![msg("user", "hi"), msg("system", "extra")],
            ..Default::default()
        };
        let scan = scan_request(&req);
        assert!(
            scan.marker_found,
            "marker in system field must be detected"
        );
        // last_system_idx is irrelevant when marker_found is true.
    }

    // ── scan_request: early break inside message loop ───────────────────

    #[test]
    fn scan_breaks_early_when_marker_in_first_system_message() {
        let req = LLMRequest {
            system: None,
            messages: vec![
                msg("system", &format!("rules {}", NO_XML_RULE_MARKER)),
                msg("user", "hello"),
                // This second system message should never be reached in a
                // meaningful sense -- the scan should have exited already.
                msg("system", "extra system without marker"),
            ],
            ..Default::default()
        };
        let scan = scan_request(&req);
        assert!(scan.marker_found);
    }

    #[test]
    fn scan_finds_last_system_idx_when_no_marker() {
        let req = LLMRequest {
            system: None,
            messages: vec![
                msg("system", "first system"),
                msg("user", "hello"),
                msg("system", "second system"),
                msg("assistant", "bye"),
            ],
            ..Default::default()
        };
        let scan = scan_request(&req);
        assert!(!scan.marker_found);
        assert_eq!(scan.last_system_idx, Some(2), "must point to last system msg");
    }

    #[test]
    fn scan_returns_none_idx_when_no_system_messages() {
        let req = LLMRequest {
            system: None,
            messages: vec![msg("user", "hello")],
            ..Default::default()
        };
        let scan = scan_request(&req);
        assert!(!scan.marker_found);
        assert_eq!(scan.last_system_idx, None);
    }

    // ── apply_no_xml_rule ───────────────────────────────────────────────

    #[test]
    fn apply_skips_when_system_field_has_marker() {
        let mut req = LLMRequest {
            system: Some(NO_XML_RULE.to_string()),
            messages: vec![msg("user", "hi")],
            ..Default::default()
        };
        apply_no_xml_rule(&mut req);
        // System field already contains the rule; should not be modified further.
        assert_eq!(
            req.system.as_deref().unwrap().matches(NO_XML_RULE_MARKER).count(),
            1,
            "marker must appear exactly once"
        );
    }

    #[test]
    fn apply_appends_to_system_field() {
        let mut req = LLMRequest {
            system: Some("Be concise.".to_string()),
            messages: vec![msg("user", "hi")],
            ..Default::default()
        };
        apply_no_xml_rule(&mut req);
        let sys = req.system.as_deref().unwrap();
        assert!(sys.contains("Be concise."));
        assert!(sys.contains(NO_XML_RULE_MARKER));
    }

    #[test]
    fn apply_appends_to_last_system_message() {
        let mut req = LLMRequest {
            system: None,
            messages: vec![
                msg("system", "early system"),
                msg("user", "hi"),
                msg("system", "late system"),
            ],
            ..Default::default()
        };
        apply_no_xml_rule(&mut req);
        // The last system message (index 2) should receive the rule.
        assert!(req.messages[2].content.contains(NO_XML_RULE_MARKER));
        // The first system message should be untouched.
        assert!(!req.messages[0].content.contains(NO_XML_RULE_MARKER));
    }

    #[test]
    fn apply_inserts_system_message_when_none_exist() {
        let mut req = LLMRequest {
            system: None,
            messages: vec![msg("user", "hi")],
            ..Default::default()
        };
        apply_no_xml_rule(&mut req);
        assert_eq!(req.messages.len(), 2);
        assert_eq!(req.messages[0].role, "system");
        assert!(req.messages[0].content.contains(NO_XML_RULE_MARKER));
    }

    #[test]
    fn apply_is_idempotent() {
        let mut req = LLMRequest {
            system: Some("Be helpful.".to_string()),
            messages: vec![msg("user", "hi")],
            ..Default::default()
        };
        apply_no_xml_rule(&mut req);
        let after_first = req.system.clone();
        apply_no_xml_rule(&mut req);
        assert_eq!(req.system, after_first, "second apply must be a no-op");
    }

    #[test]
    fn apply_skips_when_marker_in_message() {
        let mut req = LLMRequest {
            system: None,
            messages: vec![
                msg("system", &format!("rules {}", NO_XML_RULE_MARKER)),
                msg("user", "hi"),
            ],
            ..Default::default()
        };
        let original_count = req.messages.len();
        apply_no_xml_rule(&mut req);
        assert_eq!(
            req.messages.len(),
            original_count,
            "no new message should be inserted when marker is already present"
        );
    }
}
