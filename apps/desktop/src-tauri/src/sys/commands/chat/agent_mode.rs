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

/// Determine whether agent mode should be used and emit a permission warning
/// if the user explicitly requested it but automation is unavailable.
///
/// Returns `true` if agent mode is available and should be activated.
pub(super) fn detect_agent_mode(
    request_enable_agent_mode: Option<bool>,
    content: &str,
    app_handle: &tauri::AppHandle,
) -> bool {
    if request_enable_agent_mode == Some(false) {
        return false;
    }

    let explicitly_requested_agent = request_enable_agent_mode == Some(true);
    let wants_agent = explicitly_requested_agent
        || crate::sys::commands::chat::intent::detect_agentic_intent(content);

    #[cfg(target_os = "macos")]
    let has_accessibility = accessibility_permission_granted();
    #[cfg(not(target_os = "macos"))]
    let has_accessibility = true;

    let agent_mode = if wants_agent && has_accessibility {
        use crate::automation::AutomationService;
        AutomationService::new().is_ok()
    } else {
        false
    };

    if explicitly_requested_agent && !agent_mode {
        let _ = app_handle.emit(
            "automation:permission_required",
            serde_json::json!({
                "reason": "accessibility",
                "message": "Grant Accessibility permission to use Agent mode: System Settings → Privacy & Security → Accessibility → enable AGI Workforce.",
                "graceful": false
            }),
        );
    }

    if !explicitly_requested_agent && wants_agent && !agent_mode {
        let _ = app_handle.emit(
            "automation:permission_required",
            serde_json::json!({
                "reason": "accessibility",
                "message": "Agent automation needs Accessibility permission. Answering with standard chat instead.",
                "graceful": true
            }),
        );
    }

    agent_mode
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

#[cfg(test)]
mod tests {
    use super::is_explicit_model_selection;

    #[test]
    fn explicit_model_selection_ignores_auto_routes() {
        assert!(!is_explicit_model_selection(None));
        assert!(!is_explicit_model_selection(Some("")));
        assert!(!is_explicit_model_selection(Some("auto")));
        assert!(!is_explicit_model_selection(Some("auto-fast")));
        assert!(is_explicit_model_selection(Some("gpt-5.4")));
    }
}
