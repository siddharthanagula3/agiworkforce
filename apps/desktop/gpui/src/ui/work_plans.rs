use super::*;
use agiworkforce_protocol::account_cloud::{
    CloudHistoryReadParams, CloudHistoryReadResponse, CloudTurnStartParams, CloudWorkPlanReview,
    CloudWorkPlanUpdateParams, CloudWorkRequest,
};

impl Desktop {
    fn has_work_plan(&self, plan: &CloudWorkPlanReview) -> bool {
        if let Some(run) = &self.cloud.work_selected {
            return run.id == plan.run_id
                && self
                    .cloud
                    .turn
                    .as_ref()
                    .and_then(|turn| turn.work_plan.as_ref())
                    .is_some_and(|current| current.same_content(plan));
        }
        self.cloud.detail.as_ref().is_some_and(|detail| {
            detail.conversation.id == plan.conversation_id
                && self.cloud.scope.as_ref() == Some(&detail.scope)
                && (detail
                    .messages
                    .iter()
                    .filter_map(|message| message.work_plan.as_ref())
                    .any(|current| current.same_content(plan))
                    || self
                        .cloud
                        .turn
                        .as_ref()
                        .and_then(|turn| turn.work_plan.as_ref())
                        .is_some_and(|current| current.same_content(plan)))
        })
    }

    pub(super) fn run_work_plan(
        &mut self,
        plan: CloudWorkPlanReview,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.cloud.resuming
            || self.cloud.submitting
            || self.cloud.work_loading
            || !plan.awaiting_approval
            || plan.declined
            || !self.has_work_plan(&plan)
        {
            return;
        }
        if !self.cloud_composer.read(cx).value().is_empty() {
            self.cloud.error =
                Some("Copy or clear the unsent draft before starting this plan.".into());
            cx.notify();
            return;
        }
        let Some(scope) = self.cloud.scope.clone() else {
            return;
        };
        let client = match self.account_client() {
            Ok(client) => client,
            Err(error) => {
                self.cloud.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let generation = self.cloud.generation;
        self.cloud.resuming = true;
        cx.spawn_in(window, async move |view, cx| {
            let result: Result<()> = async {
                let steps = plan.steps.iter().enumerate().map(|(index, step)| format!("{}. {}", index + 1, step.description)).collect::<Vec<_>>().join("\n");
                let detail = format!("This starts a recorded follow-up for this goal using your Cloud credits. Tool permissions still apply.\n\n{}\n\n{steps}", plan.goal.goal);
                let prompt = cx.update(|window, cx| window.prompt(PromptLevel::Warning, "Run this reviewed plan?", Some(&detail), &["Keep reviewing", "Run plan"], cx))?;
                if prompt.await? != 1 { return Ok(()); }
                let read_client = client.clone();
                let params = CloudHistoryReadParams { workspace: view.read_with(cx, |view, _| view.cloud.workspaces.selector().cloned())?, conversation_id: plan.conversation_id.clone(), scope: scope.clone(), limit: view.read_with(cx, |view, _| view.settings.session_page_size)?, offset: 0, latest: true, before: None };
                let task = view.update(cx, |view, _| view.executor.spawn(async move { read_client.request::<CloudHistoryReadResponse>(method::CLOUD_HISTORY_READ, params).await }))?;
                let page = task.await.context("Loading the reviewed conversation stopped")??;
                view.update_in(cx, |view, window, cx| {
                    anyhow::ensure!(view.cloud.generation == generation && view.has_work_plan(&plan) && page.scope == scope && page.conversation.id == plan.conversation_id, "The account or selected plan changed before execution");
                    let id = uuid::Uuid::parse_str(&plan.review_id)?;
                    let params = CloudTurnStartParams { attachments: Vec::new(), workspace: view.cloud.workspaces.selector().cloned(), model: None, scope: scope.clone(), conversation_id: plan.conversation_id.clone(), request_id: id.to_string(), user_message_id: uuid::Uuid::new_v5(&id, b"user-message").to_string(), text: plan.goal.goal.clone(), page_size: view.settings.session_page_size, work: Some(CloudWorkRequest { mode: plan.mode.clone(), goal: plan.goal.clone(), plan: Some(plan.clone()) }) };
                    view.cloud.accept_detail(page, false)?;
                    view.cloud.clear_turn();
                    view.cloud.work_selected = None;
                    view.cloud.work_visible = false;
                    view.cloud.compose_work = true;
                    view.dispatch_cloud_turn(params, client, window, cx);
                    Ok::<_, anyhow::Error>(())
                })??;
                Ok(())
            }.await;
            let _ = view.update(cx, |view, cx| {
                if view.cloud.generation != generation { return; }
                view.cloud.resuming = false;
                if let Err(error) = result { view.cloud.error = Some(format!("The reviewed plan was not started: {error:#}")); }
                cx.notify();
            });
        }).detach();
        cx.notify();
    }

    pub(super) fn update_work_plan(
        &mut self,
        plan: CloudWorkPlanReview,
        decline: bool,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.cloud.resuming
            || self.cloud.submitting
            || self.cloud.work_loading
            || !self.has_work_plan(&plan)
        {
            return;
        }
        let Some(scope) = self.cloud.scope.clone() else {
            return;
        };
        let client = match self.account_client() {
            Ok(client) => client,
            Err(error) => {
                self.cloud.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let generation = self.cloud.generation;
        self.cloud.resuming = true;
        let expected = plan.clone();
        cx.spawn_in(window, async move |view, cx| {
            let result: Result<Option<CloudWorkPlanReview>> = async {
                if decline {
                    let prompt = cx.update(|window, cx| window.prompt(PromptLevel::Warning, "Dismiss this plan review?", Some("This closes the review and keeps its planning record. Any work already running must be stopped separately in Work."), &["Keep reviewing", "Dismiss review"], cx))?;
                    if prompt.await? != 1 { return Ok(None); }
                }
                let params = CloudWorkPlanUpdateParams { workspace: view.read_with(cx, |view, _| view.cloud.workspaces.selector().cloned())?, scope, reviewed: plan, decline };
                let task = view.update(cx, |view, _| view.executor.spawn(async move { client.request::<CloudWorkPlanReview>(method::CLOUD_WORK_PLAN_UPDATE, params).await }))?;
                Ok(Some(task.await.context("Saving the plan decision stopped")??))
            }.await;
            let _ = view.update_in(cx, |view, window, cx| {
                if view.cloud.generation != generation { return; }
                view.cloud.resuming = false;
                if !view.has_work_plan(&expected) { return; }
                match result {
                    Ok(Some(plan)) => {
                        if let Some(turn) = view.cloud.turn.as_mut().filter(|turn| turn.work_plan.as_ref().is_some_and(|current| current.same_content(&expected))) { turn.work_plan = Some(plan.clone()); turn.work_plan_saved = true; turn.work_plan_error = None; }
                        if let Some(detail) = &mut view.cloud.detail { for message in &mut detail.messages { if message.work_plan.as_ref().is_some_and(|current| current.same_content(&expected)) { message.work_plan = Some(plan.clone()); } } }
                        view.cloud.error = None;
                        if decline { view.poll_cloud(window, cx); }
                    },
                    Ok(None) => {},
                    Err(error) => view.cloud.error = Some(format!("The plan decision could not be saved: {error:#}")),
                }
                cx.notify();
            });
        }).detach();
        cx.notify();
    }

    pub(super) fn render_work_plan(
        &self,
        plan: &CloudWorkPlanReview,
        saved: bool,
        palette: Palette,
        cx: &mut Context<Self>,
    ) -> impl IntoElement {
        let mut panel = div()
            .id(SharedString::from(format!("work-plan:{}", plan.review_id)))
            .w_full()
            .min_w_0()
            .flex()
            .flex_col()
            .gap_2()
            .child(gpui::text!("Plan"))
            .child(gpui::text!(plan.goal.goal.clone()));
        if let Some(constraints) = &plan.goal.constraints {
            panel = panel.child(gpui::text!(constraints.clone()));
        }
        if let Some(deliverable) = &plan.goal.deliverable {
            panel = panel.child(gpui::text!(deliverable.clone()));
        }
        for (index, step) in plan.steps.iter().enumerate() {
            panel = panel.child(gpui::text!(
                id = ("work-plan-step", index),
                format!("{}. {}", index + 1, step.description)
            ));
        }
        let ready = self
            .account_capabilities
            .as_ref()
            .is_some_and(|caps| caps.cloud_work_start)
            && !self.cloud.submitting
            && !self.cloud.resuming
            && !self.cloud.stopping
            && !self.cloud.work_loading
            && self.cloud.turn.as_ref().is_none_or(|turn| {
                !turn.needs_attention()
                    || turn.state.needs_review()
                        && !turn.catching_up
                        && !turn.stream_attached
                        && turn
                            .work_plan
                            .as_ref()
                            .is_some_and(|current| current.same_content(plan))
            });
        if plan.declined {
            panel = panel.child(gpui::text!("This plan review is dismissed."));
        } else if plan.awaiting_approval {
            if ready {
                if saved {
                    panel = panel.child(self.button(
                        SharedString::from(format!("run-plan:{}", plan.review_id)),
                        "Run plan",
                        UiAction::RunWorkPlan(plan.clone()),
                        palette,
                        cx,
                    ));
                } else {
                    panel = panel.child(self.button(
                        SharedString::from(format!("save-plan:{}", plan.review_id)),
                        "Save plan review",
                        UiAction::UpdateWorkPlan(plan.clone(), false),
                        palette,
                        cx,
                    ));
                }
                panel = panel.child(self.button(
                    SharedString::from(format!("dismiss-plan:{}", plan.review_id)),
                    "Dismiss review",
                    UiAction::UpdateWorkPlan(plan.clone(), true),
                    palette,
                    cx,
                ));
            } else {
                panel = panel.child(gpui::text!("Preparing plan review…"));
            }
        }
        panel
    }
}
