//! The human-approval gate every model-planned tool call clears before it
//! runs, attended or not.

use crate::sys::commands::tool_confirmation::{
    enforce_agent_mode_gate, is_tool_remember_eligible, request_tool_confirmation,
    ToolConfirmationState,
};
use crate::sys::security::ToolExecutionGuard;
use anyhow::{anyhow, Result};

const AGI_TOOL_CONFIRMATION_TIMEOUT_SECS: u64 = 120;

/// Ask the user before a planned tool call runs.
///
/// A call planned from model output that untrusted content can steer, such as
/// a computer-use step or an MCP server request, must clear the same
/// human-in-the-loop gate the chat tool path clears in
/// `core::llm::tool_executor::check_safety_tier_and_confirm`:
/// the app-managed [`ToolConfirmationState`], its agent-mode gate, its stored
/// choices, and its confirmation dialog. Fails closed when that state is not
/// managed, an unanswerable prompt is a refusal, not a pass.
///
/// Generic over the runtime so `tauri::test::mock_app()` can drive the gate.
pub(crate) async fn require_tool_approval<R: tauri::Runtime>(
    app_handle: &tauri::AppHandle<R>,
    tool_name: &str,
    parameters: &serde_json::Value,
    description: Option<&str>,
) -> Result<()> {
    use tauri::Manager;

    let Some(confirmation_state) = app_handle.try_state::<ToolConfirmationState>() else {
        tracing::error!(
            "[Executor] ToolConfirmationState unavailable, refusing '{}'",
            tool_name
        );
        return Err(anyhow!(
            "Cannot execute '{}': the approval service is unavailable.",
            tool_name
        ));
    };

    enforce_agent_mode_gate(app_handle, &confirmation_state, tool_name).map_err(|e| anyhow!(e))?;

    // `get_remembered_choice` returns `None` for everything on
    // `NEVER_REMEMBERABLE`, so a tool that is only as safe as the parameter
    // the planner wrote this time (terminal_execute, browser_execute_async_js)
    // reaches the dialog even if an older build persisted an "always allow".
    if let Some(approved) = confirmation_state.get_remembered_choice(tool_name) {
        return if approved {
            Ok(())
        } else {
            Err(anyhow!(
                "Tool '{}' is blocked by a stored denial policy. Change it in tool approval settings.",
                tool_name
            ))
        };
    }

    let tool_guard = confirmation_state.tool_guard();
    if !tool_guard.get_safety_tier(tool_name).requires_user_action() {
        return Ok(());
    }

    let request = tool_guard.create_confirmation_request(tool_name, parameters, description);

    tracing::info!(
        "[Executor] Requesting user confirmation for planned tool '{}'",
        tool_name
    );

    match request_tool_confirmation(
        app_handle,
        &confirmation_state,
        request,
        AGI_TOOL_CONFIRMATION_TIMEOUT_SECS,
    )
    .await
    {
        Ok(true) => Ok(()),
        Ok(false) => Err(anyhow!("You declined to run '{}'.", tool_name)),
        Err(e) => Err(anyhow!(
            "Couldn't get your confirmation for '{}': {}",
            tool_name,
            e
        )),
    }
}

/// Opens every refusal of a tool that an unattended run had nobody to ask
/// about. Whoever started the run collects the refusals by this prefix.
pub const UNATTENDED_DENIAL_PREFIX: &str = "Not run unattended:";

/// Every tool a run nobody is watching may use with no stored allow. Each one
/// only reads this computer or a page the browser already has open: it writes
/// nothing, moves no input, and contacts no host. `code_analyze` sends text to
/// the model the run already uses and to nowhere else. A tool that fetches,
/// searches, downloads, uploads, navigates or writes is absent on purpose,
/// because unattended it is an exfiltration or tampering channel; it runs only
/// on the user's stored "Always allow".
pub(crate) const UNATTENDED_READ_ONLY_TOOLS: &[&str] = &[
    "file_read",
    "file_read_binary",
    "file_list",
    "document_read",
    "document_search",
    "grep_search",
    "glob_search",
    "code_search",
    "git_status",
    "git_diff",
    "git_log",
    "git_list_branches",
    "worktree_list",
    "undo_get_summary",
    "undo_get_changes",
    "coding_checkpoint_list",
    "memory_recall",
    "memory_search",
    "list_scheduled_tasks",
    "background_agent_get",
    "ui_screenshot",
    "ui_read_value",
    "image_ocr",
    "browser_get_text",
    "browser_get_attribute",
    "browser_get_element_state",
    "browser_get_url",
    "browser_get_title",
    "browser_wait_for_selector",
    "browser_wait_for_interactive",
    "browser_wait_for_navigation",
    "browser_extract",
    "browser_query_all",
    "browser_get_dom_snapshot",
    "browser_screenshot",
    "code_analyze",
];

/// Being on the list is necessary, not sufficient: a tool the guard later
/// raises to an approval tier stops running unattended without a list edit.
pub(crate) fn runs_unattended_without_an_allow(
    guard: &ToolExecutionGuard,
    tool_name: &str,
) -> bool {
    UNATTENDED_READ_ONLY_TOOLS.contains(&tool_name)
        && !guard.get_safety_tier(tool_name).requires_user_action()
}

/// The approval gate for a run nobody is watching.
///
/// It runs the same mode gate and honours the same stored per-tool choices as
/// [`require_tool_approval`], but never opens the dialog: a tool outside
/// [`UNATTENDED_READ_ONLY_TOOLS`] is refused at once and by name. A session
/// approval or the auto-approve switch does not stand in, because both were
/// given to a person who was there to see what ran.
pub(crate) fn unattended_tool_approval<R: tauri::Runtime>(
    app_handle: &tauri::AppHandle<R>,
    tool_name: &str,
) -> Result<()> {
    use tauri::Manager;

    // A capability switched off holds wherever the assistant acts, before any
    // stored allow is consulted: "Terminal: off" outranks "always allow".
    if let Some(off) =
        crate::sys::commands::capabilities::capability_refusal_now(app_handle, tool_name)
    {
        return Err(anyhow!("{UNATTENDED_DENIAL_PREFIX} {off}"));
    }

    let Some(confirmation_state) = app_handle.try_state::<ToolConfirmationState>() else {
        return Err(anyhow!(
            "{UNATTENDED_DENIAL_PREFIX} '{tool_name}' was refused because the approval service is unavailable."
        ));
    };

    enforce_agent_mode_gate(app_handle, &confirmation_state, tool_name)
        .map_err(|blocked| anyhow!("{UNATTENDED_DENIAL_PREFIX} {blocked}"))?;

    match confirmation_state.get_remembered_choice(tool_name) {
        Some(true) => return Ok(()),
        Some(false) => {
            return Err(anyhow!(
                "{UNATTENDED_DENIAL_PREFIX} '{tool_name}' is blocked by a stored denial policy. Change it in tool approval settings."
            ))
        }
        None => {}
    }

    if runs_unattended_without_an_allow(confirmation_state.tool_guard(), tool_name) {
        return Ok(());
    }

    let remedy = if is_tool_remember_eligible(tool_name) {
        "Run it from chat, or save an 'Always allow' for this tool in Settings."
    } else {
        "This tool is asked about every time, so run it from chat."
    };
    Err(anyhow!(
        "{UNATTENDED_DENIAL_PREFIX} '{tool_name}' needs your approval, and nobody was here to give it. {remedy}"
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sys::commands::tool_confirmation::AgentMode;
    use serde_json::json;
    use std::collections::HashMap;

    fn managed_app(mode: AgentMode) -> tauri::App<tauri::test::MockRuntime> {
        use tauri::Manager;

        let app = tauri::test::mock_app();
        let state = ToolConfirmationState::new();
        state.set_agent_mode(mode);
        app.handle().manage(state);
        app
    }

    fn remember(app: &tauri::App<tauri::test::MockRuntime>, tool_name: &str, approved: bool) {
        use tauri::Manager;

        app.handle()
            .state::<ToolConfirmationState>()
            .remember_choice(tool_name, approved);
    }

    fn switch_off(app: &tauri::App<tauri::test::MockRuntime>, capability: &str) {
        use crate::sys::commands::capabilities::{CapabilityState, SavedSwitches};
        use tauri::Manager;

        app.handle()
            .manage(CapabilityState::from_saved(SavedSwitches::Saved(
                HashMap::from([(capability.to_string(), false)]),
            )));
    }

    #[tokio::test]
    async fn gate_fails_closed_when_the_confirmation_service_is_unmanaged() {
        let app = tauri::test::mock_app();

        let error = require_tool_approval(app.handle(), "terminal_execute", &json!({}), None)
            .await
            .expect_err("no confirmation service means no approval")
            .to_string();

        assert!(error.contains("approval service is unavailable"), "{error}");
    }

    #[tokio::test]
    async fn gate_refuses_write_tools_in_safe_mode() {
        let app = managed_app(AgentMode::Safe);

        for tool_name in ["terminal_execute", "file_delete", "email_send"] {
            let error = require_tool_approval(app.handle(), tool_name, &json!({}), None)
                .await
                .unwrap_err()
                .to_string();
            assert!(
                error.contains("not permitted in safe mode"),
                "{tool_name} was refused for the wrong reason: {error}"
            );
        }
    }

    #[test]
    fn an_unattended_goal_is_refused_a_tool_that_would_prompt_and_told_which() {
        let app = managed_app(AgentMode::Build);

        let error = unattended_tool_approval(app.handle(), "browser_navigate")
            .expect_err("nobody is there to approve it")
            .to_string();

        assert!(error.starts_with(UNATTENDED_DENIAL_PREFIX), "{error}");
        assert!(error.contains("'browser_navigate'"), "{error}");
        assert!(error.contains("nobody was here"), "{error}");
    }

    #[test]
    fn an_unattended_goal_runs_read_only_tools_and_tools_the_user_always_allows() {
        let app = managed_app(AgentMode::Build);
        remember(&app, "browser_navigate", true);

        unattended_tool_approval(app.handle(), "file_read")
            .expect("a read-only tool never prompts");
        unattended_tool_approval(app.handle(), "browser_navigate")
            .expect("a stored approval is the user's standing answer");
    }

    #[test]
    fn an_unattended_goal_cannot_reach_the_network_or_write_without_a_stored_allow() {
        let app = managed_app(AgentMode::Build);

        for tool_name in [
            "api_download",
            "cloud_download",
            "search_web",
            "physical_scrape",
            "api_call",
            "api_upload",
            "browser_navigate",
            "email_send",
            "mcp__remote__fetch",
            "memory_remember",
            "create_artifact",
            "schedule_reminder",
            "ui_scroll",
            "browser_hover",
            "a_tool_with_no_policy",
        ] {
            let refusal = unattended_tool_approval(app.handle(), tool_name)
                .err()
                .map(|error| error.to_string());
            assert!(
                refusal
                    .as_deref()
                    .is_some_and(|error| error.starts_with(UNATTENDED_DENIAL_PREFIX)),
                "'{tool_name}' sends data out or changes something: {refusal:?}"
            );
        }

        remember(&app, "api_download", true);
        unattended_tool_approval(app.handle(), "api_download")
            .expect("a stored allow is the user's standing answer");
    }

    #[test]
    fn a_capability_that_is_off_refuses_an_unattended_step_whatever_was_allowed() {
        let app = managed_app(AgentMode::Build);
        switch_off(&app, "fileOperations");

        let refusal = unattended_tool_approval(app.handle(), "file_read")
            .expect_err("Files is off, so even a read-only file tool does not run")
            .to_string();
        assert!(refusal.starts_with(UNATTENDED_DENIAL_PREFIX), "{refusal}");
        assert!(refusal.contains("Files is turned off"), "{refusal}");

        remember(&app, "api_download", true);
        unattended_tool_approval(app.handle(), "api_download")
            .expect("another capability's tool keeps its stored allow");
        unattended_tool_approval(app.handle(), "git_status")
            .expect("a read-only tool under a capability that is on still runs");
    }

    #[test]
    fn a_stored_allow_does_not_outrank_a_capability_that_is_off() {
        let app = managed_app(AgentMode::Build);
        switch_off(&app, "webSearch");
        remember(&app, "api_download", true);

        let refusal = unattended_tool_approval(app.handle(), "api_download")
            .expect_err("Web search and web requests is off")
            .to_string();
        assert!(
            refusal.contains("Web search and web requests is turned off"),
            "{refusal}"
        );
    }

    #[tokio::test]
    async fn an_attended_goal_run_asks_the_same_capability_question() {
        use crate::sys::commands::capabilities::capability_refusal;

        let app = managed_app(AgentMode::Build);
        switch_off(&app, "terminalAccess");

        let refusal = capability_refusal(app.handle(), "terminal_execute")
            .await
            .expect("Terminal is off");
        assert!(refusal.starts_with("Terminal is turned off"), "{refusal}");
        assert!(capability_refusal(app.handle(), "test_run").await.is_some());
        assert_eq!(capability_refusal(app.handle(), "file_read").await, None);
        assert_eq!(capability_refusal(app.handle(), "todo_write").await, None);
    }

    #[test]
    fn every_tool_that_runs_unattended_is_one_the_guard_never_asks_about() {
        let guard = ToolExecutionGuard::new();

        for tool_name in UNATTENDED_READ_ONLY_TOOLS {
            assert!(
                runs_unattended_without_an_allow(&guard, tool_name),
                "'{tool_name}' is listed as read-only but the guard asks about it"
            );
        }
    }

    #[test]
    fn downloads_ask_before_they_run() {
        let guard = ToolExecutionGuard::new();

        for tool_name in ["api_download", "cloud_download"] {
            assert!(
                guard.get_safety_tier(tool_name).requires_user_action(),
                "'{tool_name}' fetches a remote body and writes it to disk"
            );
        }
    }

    #[test]
    fn auto_approve_and_session_approvals_do_not_answer_for_an_unattended_goal() {
        use tauri::Manager;

        let app = managed_app(AgentMode::Autopilot);
        let state = app.handle().state::<ToolConfirmationState>();
        state.set_auto_approve_all(true);
        state.approve_for_session("browser_navigate");

        assert!(unattended_tool_approval(app.handle(), "browser_navigate").is_err());
    }

    #[test]
    fn a_tool_that_can_never_be_remembered_is_always_refused_unattended() {
        let app = managed_app(AgentMode::Build);
        remember(&app, "terminal_execute", true);

        let error = unattended_tool_approval(app.handle(), "terminal_execute")
            .expect_err("a shell command is only as safe as this run's argument")
            .to_string();

        assert!(error.contains("'terminal_execute'"), "{error}");
        assert!(error.contains("run it from chat"), "{error}");
        assert!(!error.contains("Always allow"), "{error}");
    }

    #[test]
    fn the_refusal_offers_always_allow_only_where_settings_can_store_one() {
        let app = managed_app(AgentMode::Build);

        let error = unattended_tool_approval(app.handle(), "browser_navigate")
            .expect_err("nobody is there to approve it")
            .to_string();

        assert!(
            error.ends_with(
                "Run it from chat, or save an 'Always allow' for this tool in Settings."
            ),
            "{error}"
        );
    }

    #[tokio::test]
    async fn gate_honors_a_stored_denial() {
        let app = managed_app(AgentMode::Build);
        remember(&app, "browser_navigate", false);

        let error = require_tool_approval(app.handle(), "browser_navigate", &json!({}), None)
            .await
            .expect_err("a stored denial must stop the step")
            .to_string();

        assert!(error.contains("stored denial policy"), "{error}");
    }

    #[tokio::test]
    async fn gate_lets_an_approved_tool_and_read_only_tools_through() {
        let app = managed_app(AgentMode::Build);
        remember(&app, "browser_navigate", true);

        require_tool_approval(app.handle(), "browser_navigate", &json!({}), None)
            .await
            .expect("a remembered approval must let the step run");

        require_tool_approval(app.handle(), "file_read", &json!({}), None)
            .await
            .expect("read-only tools must not prompt");
    }

    #[tokio::test]
    async fn a_remembered_approval_cannot_stand_in_for_a_page_script() {
        let app = managed_app(AgentMode::Build);
        remember(&app, "browser_execute_async_js", true);

        let settled = tokio::time::timeout(
            std::time::Duration::from_millis(250),
            require_tool_approval(
                app.handle(),
                "browser_execute_async_js",
                &json!({ "script": "return document.title" }),
                None,
            ),
        )
        .await;

        assert!(
            settled.is_err(),
            "one 'approve and remember' must not hand every later script a standing grant"
        );
    }

    /// The gate had one door left open: `request_tool_confirmation`
    /// returned `Ok(true)` on `auto_approve_all` before it ever looked at
    /// `NEVER_REMEMBERABLE`, and selecting Autopilot in Settings turns
    /// `auto_approve_all` on for everything. In that one shipped
    /// configuration the whole approval gate was a pass-through for the
    /// three tools whose behaviour is entirely the argument the planner
    /// just wrote.
    #[tokio::test]
    async fn autopilot_auto_approve_cannot_answer_for_the_high_blast_tools() {
        use tauri::Manager;

        let app = managed_app(AgentMode::Autopilot);
        app.handle()
            .state::<ToolConfirmationState>()
            .set_auto_approve_all(true);

        for (tool_name, parameters) in [
            (
                "browser_execute_async_js",
                json!({ "script": "return document.title" }),
            ),
            ("terminal_execute", json!({ "command": "ls" })),
        ] {
            let settled = tokio::time::timeout(
                std::time::Duration::from_millis(250),
                require_tool_approval(app.handle(), tool_name, &parameters, None),
            )
            .await;

            assert!(
                settled.is_err(),
                "'{tool_name}' must still reach the dialog in Autopilot: auto-approve-all is \
                 the widest standing grant, not an exemption from the one list that says a \
                 tool has to be asked about every time"
            );
        }
    }

    #[tokio::test]
    async fn autopilot_auto_approve_still_skips_the_dialog_for_ordinary_tools() {
        use tauri::Manager;

        let app = managed_app(AgentMode::Autopilot);
        app.handle()
            .state::<ToolConfirmationState>()
            .set_auto_approve_all(true);

        tokio::time::timeout(
            std::time::Duration::from_millis(250),
            require_tool_approval(
                app.handle(),
                "file_delete",
                &json!({ "path": "/tmp/x" }),
                None,
            ),
        )
        .await
        .expect("Autopilot must not start prompting for every tool")
        .expect("an ordinary high-risk tool stays covered by auto-approve-all");
    }

    #[tokio::test]
    async fn a_remembered_approval_cannot_stand_in_for_terminal_execute() {
        let app = managed_app(AgentMode::Build);
        remember(&app, "terminal_execute", true);

        let settled = tokio::time::timeout(
            std::time::Duration::from_millis(250),
            require_tool_approval(app.handle(), "terminal_execute", &json!({}), None),
        )
        .await;

        assert!(
            settled.is_err(),
            "terminal_execute must wait for a fresh decision instead of inheriting a \
             remembered approval"
        );
    }
}
