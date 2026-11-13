use super::*;
use agiworkforce_protocol::account_cloud::CloudTurnSnapshot;

impl Desktop {
    pub(super) fn render_cloud_controls(
        &self,
        turn: &CloudTurnSnapshot,
        palette: Palette,
        cx: &mut Context<Self>,
    ) -> gpui::Div {
        let mut panel = div().w_full().min_w_0().flex().flex_col().gap_2();
        if let Some(error) = &turn.work_plan_error {
            panel = panel.child(
                div()
                    .text_color(rgb(palette.danger))
                    .child(gpui::text!(error.clone())),
            );
        }
        if let Some(plan) = &turn.work_plan {
            panel = panel.child(self.render_work_plan(plan, turn.work_plan_saved, palette, cx));
        }
        if turn.rejected && !turn.accepted && turn.state.is_terminal() {
            let work = self
                .cloud
                .pending_turn
                .as_ref()
                .is_some_and(|pending| pending.work.is_some());
            panel = panel.child(self.button(
                "edit-rejected-message",
                if work { "Edit goal" } else { "Edit message" },
                UiAction::EditRejectedMessage,
                palette,
                cx,
            ));
        }
        if let Some(error) = &turn.error {
            panel = panel.child(
                div()
                    .text_color(rgb(palette.danger))
                    .child(gpui::text!(error.clone())),
            );
        }
        if turn.needs_attention() {
            panel = panel.child(gpui::text!(if turn.catching_up {
                "Loading saved run events…".into()
            } else if turn.state.needs_input() {
                if turn.approvals.is_empty() {
                    "This run needs input. Continue it in your web account, or stop it here.".into()
                } else {
                    "Waiting for your approval".into()
                }
            } else if turn.state == agiworkforce_protocol::task_state::AgentTaskState::Paused {
                "Paused".into()
            } else {
                turn.progress.clone().unwrap_or_else(|| "Working…".into())
            }));
        }
        let controls = self
            .account_capabilities
            .as_ref()
            .is_some_and(|caps| caps.cloud_turn_resume)
            && !self.cloud.resuming
            && !self.cloud.stopping
            && !self.cloud.work_loading
            && !turn.catching_up
            && !turn.stream_attached
            && self.cloud.error.is_none();
        if let Some(checkpoint) = &turn.approval_checkpoint {
            for request in &turn.approvals {
                panel = panel.child(
                            div()
                                .id(SharedString::from(format!("cloud-approval:{}", request.approval_id)))
                                .w_full()
                                .min_w_0()
                                .flex()
                                .flex_col()
                                .gap_2()
                                .child(gpui::text!(request.name.clone()))
                                .child(gpui::text!(request.summary.clone()))
                                .child(gpui::text!(request.input.to_string()))
                                .when_some(request.risk_level, |element, risk| element.child(gpui::text!(match risk {
                                    agiworkforce_protocol::agent_events::AgentEventApprovalRiskLevel::Low => "Low risk",
                                    agiworkforce_protocol::agent_events::AgentEventApprovalRiskLevel::Medium => "Medium risk",
                                    agiworkforce_protocol::agent_events::AgentEventApprovalRiskLevel::High => "High risk",
                                }))),
                        );
            }
            if controls && !turn.approvals.is_empty() {
                for approved in [true, false] {
                    panel = panel.child(self.button(
                        if approved {
                            "allow-cloud-actions"
                        } else {
                            "deny-cloud-actions"
                        },
                        if approved { "Allow once" } else { "Deny" },
                        UiAction::ResumeCloud(
                            agiworkforce_protocol::account_cloud::CloudTurnResumeParams {
                                workspace: turn.workspace.clone(),
                                scope: turn.scope.clone(),
                                request_id: turn.request_id.clone(),
                                run_id: turn.run_id.clone(),
                                action: CloudTurnResumeAction::Approval {
                                    checkpoint: checkpoint.clone(),
                                    approved,
                                    reviewed: turn.approvals.clone(),
                                },
                            },
                        ),
                        palette,
                        cx,
                    ));
                }
            }
        }
        if controls && turn.state == agiworkforce_protocol::task_state::AgentTaskState::Paused {
            panel = panel.child(self.button(
                "resume-cloud-work",
                "Resume",
                UiAction::ResumeCloud(
                    agiworkforce_protocol::account_cloud::CloudTurnResumeParams {
                        workspace: turn.workspace.clone(),
                        scope: turn.scope.clone(),
                        request_id: turn.request_id.clone(),
                        run_id: turn.run_id.clone(),
                        action: CloudTurnResumeAction::Paused,
                    },
                ),
                palette,
                cx,
            ));
        }
        if self.cloud.resuming {
            panel = panel.child(gpui::text!("Decision pending…"));
        }
        if self.cloud.error.is_some() && !self.cloud.resuming {
            panel = panel.child(self.button(
                "refresh-cloud-run",
                "Refresh run",
                UiAction::RefreshCloudTurn,
                palette,
                cx,
            ));
        }
        if turn.state == agiworkforce_protocol::task_state::AgentTaskState::Cancelled {
            panel = panel.child(gpui::text!("Stopped"));
        }
        panel
    }
}
