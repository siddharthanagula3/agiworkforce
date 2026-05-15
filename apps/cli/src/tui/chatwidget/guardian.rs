//! Guardian review lifecycle and approval-request event handlers for `ChatWidget`.
//!
//! Covers `on_guardian_assessment` (approved / denied / in-progress states),
//! `on_exec_approval_request`, and `on_apply_patch_approval_request`. Extracted
//! from the main chatwidget body to keep the god-file manageable.

use super::*;

impl ChatWidget {
    pub(super) fn on_exec_approval_request(&mut self, _id: String, ev: ExecApprovalRequestEvent) {
        let ev2 = ev.clone();
        self.defer_or_handle(
            |q| q.push_exec_approval(ev),
            |s| s.handle_exec_approval_now(ev2),
        );
    }

    pub(super) fn on_apply_patch_approval_request(
        &mut self,
        _id: String,
        ev: ApplyPatchApprovalRequestEvent,
    ) {
        let ev2 = ev.clone();
        self.defer_or_handle(
            |q| q.push_apply_patch_approval(ev),
            |s| s.handle_apply_patch_approval_now(ev2),
        );
    }

    /// Handle guardian review lifecycle events for the current thread.
    ///
    /// In-progress assessments temporarily own the live status footer so the
    /// user can see what is being reviewed, including parallel review
    /// aggregation. Terminal assessments clear or update that footer state and
    /// render the final approved/denied history cell when guardian returns a
    /// decision.
    pub(super) fn on_guardian_assessment(&mut self, ev: GuardianAssessmentEvent) {
        // Guardian emits a compact JSON action payload; map the stable fields we
        // care about into a short footer/history summary without depending on
        // the full raw JSON shape in the rest of the widget.
        let guardian_action_summary = |action: &serde_json::Value| {
            let tool = action.get("tool").and_then(serde_json::Value::as_str)?;
            match tool {
                "shell" | "exec_command" => match action.get("command") {
                    Some(serde_json::Value::String(command)) => Some(command.clone()),
                    Some(serde_json::Value::Array(command)) => {
                        let args = command
                            .iter()
                            .map(serde_json::Value::as_str)
                            .collect::<Option<Vec<_>>>()?;
                        shlex::try_join(args.iter().copied())
                            .ok()
                            .or_else(|| Some(args.join(" ")))
                    }
                    _ => None,
                },
                "apply_patch" => {
                    let files = action
                        .get("files")
                        .and_then(serde_json::Value::as_array)
                        .map(|files| {
                            files
                                .iter()
                                .filter_map(serde_json::Value::as_str)
                                .collect::<Vec<_>>()
                        })
                        .unwrap_or_default();
                    let change_count = action
                        .get("change_count")
                        .and_then(serde_json::Value::as_u64)
                        .unwrap_or(files.len() as u64);
                    Some(if files.len() == 1 {
                        format!("apply_patch touching {}", files[0])
                    } else {
                        format!(
                            "apply_patch touching {change_count} changes across {} files",
                            files.len()
                        )
                    })
                }
                "network_access" => action
                    .get("target")
                    .and_then(serde_json::Value::as_str)
                    .map(|target| format!("network access to {target}")),
                "mcp_tool_call" => {
                    let tool_name = action
                        .get("tool_name")
                        .and_then(serde_json::Value::as_str)?;
                    let label = action
                        .get("connector_name")
                        .and_then(serde_json::Value::as_str)
                        .or_else(|| action.get("server").and_then(serde_json::Value::as_str))
                        .unwrap_or("unknown server");
                    Some(format!("MCP {tool_name} on {label}"))
                }
                _ => None,
            }
        };
        let guardian_command = |action: &serde_json::Value| match action.get("command") {
            Some(serde_json::Value::Array(command)) => Some(
                command
                    .iter()
                    .filter_map(serde_json::Value::as_str)
                    .map(ToOwned::to_owned)
                    .collect::<Vec<_>>(),
            )
            .filter(|command| !command.is_empty()),
            Some(serde_json::Value::String(command)) => shlex::split(command)
                .filter(|command| !command.is_empty())
                .or_else(|| Some(vec![command.clone()])),
            _ => None,
        };

        if ev.status == GuardianAssessmentStatus::InProgress
            && let Some(action) = ev.action.as_ref()
            && let Some(detail) = guardian_action_summary(action)
        {
            // In-progress assessments own the live footer state while the
            // review is pending. Parallel reviews are aggregated into one
            // footer summary by `PendingGuardianReviewStatus`.
            self.bottom_pane.ensure_status_indicator();
            self.bottom_pane
                .set_interrupt_hint_visible(/*visible*/ true);
            self.pending_guardian_review_status
                .start_or_update(ev.id.clone(), detail);
            if let Some(status) = self.pending_guardian_review_status.status_indicator_state() {
                self.set_status(
                    status.header,
                    status.details,
                    StatusDetailsCapitalization::Preserve,
                    status.details_max_lines,
                );
            }
            self.request_redraw();
            return;
        }

        // Terminal assessments remove the matching pending footer entry first,
        // then render the final approved/denied history cell below.
        if self.pending_guardian_review_status.finish(&ev.id) {
            if let Some(status) = self.pending_guardian_review_status.status_indicator_state() {
                self.set_status(
                    status.header,
                    status.details,
                    StatusDetailsCapitalization::Preserve,
                    status.details_max_lines,
                );
            } else if self.current_status.is_guardian_review() {
                self.set_status_header(String::from("Working"));
            }
        } else if self.pending_guardian_review_status.is_empty()
            && self.current_status.is_guardian_review()
        {
            self.set_status_header(String::from("Working"));
        }

        if ev.status == GuardianAssessmentStatus::Approved {
            let Some(action) = ev.action else {
                return;
            };

            let cell = if let Some(command) = guardian_command(&action) {
                history_cell::new_approval_decision_cell(
                    command,
                    agiworkforce_protocol::protocol::ReviewDecision::Approved,
                    history_cell::ApprovalDecisionActor::Guardian,
                )
            } else if let Some(summary) = guardian_action_summary(&action) {
                history_cell::new_guardian_approved_action_request(summary)
            } else {
                let summary = serde_json::to_string(&action)
                    .unwrap_or_else(|_| "<unrenderable guardian action>".to_string());
                history_cell::new_guardian_approved_action_request(summary)
            };

            self.add_boxed_history(cell);
            self.request_redraw();
            return;
        }

        if ev.status != GuardianAssessmentStatus::Denied {
            return;
        }
        let Some(action) = ev.action else {
            return;
        };

        let tool = action.get("tool").and_then(serde_json::Value::as_str);
        let cell = if let Some(command) = guardian_command(&action) {
            history_cell::new_approval_decision_cell(
                command,
                agiworkforce_protocol::protocol::ReviewDecision::Denied,
                history_cell::ApprovalDecisionActor::Guardian,
            )
        } else {
            match tool {
                Some("apply_patch") => {
                    let files = action
                        .get("files")
                        .and_then(serde_json::Value::as_array)
                        .map(|files| {
                            files
                                .iter()
                                .filter_map(serde_json::Value::as_str)
                                .map(ToOwned::to_owned)
                                .collect::<Vec<_>>()
                        })
                        .unwrap_or_default();
                    let change_count = action
                        .get("change_count")
                        .and_then(serde_json::Value::as_u64)
                        .and_then(|count| usize::try_from(count).ok())
                        .unwrap_or(files.len());
                    history_cell::new_guardian_denied_patch_request(files, change_count)
                }
                Some("mcp_tool_call") => {
                    let server = action
                        .get("server")
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or("unknown server");
                    let tool_name = action
                        .get("tool_name")
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or("unknown tool");
                    history_cell::new_guardian_denied_action_request(format!(
                        "agiworkforce to call MCP tool {server}.{tool_name}"
                    ))
                }
                Some("network_access") => {
                    let target = action
                        .get("target")
                        .and_then(serde_json::Value::as_str)
                        .or_else(|| action.get("host").and_then(serde_json::Value::as_str))
                        .unwrap_or("network target");
                    history_cell::new_guardian_denied_action_request(format!(
                        "agiworkforce to access {target}"
                    ))
                }
                _ => {
                    let summary = serde_json::to_string(&action)
                        .unwrap_or_else(|_| "<unrenderable guardian action>".to_string());
                    history_cell::new_guardian_denied_action_request(summary)
                }
            }
        };

        self.add_boxed_history(cell);
        self.request_redraw();
    }
}
