use std::collections::{BTreeSet, HashSet, VecDeque};
use std::io;
use std::process::{Child, ChildStdin, Command, Stdio};

use agiworkforce_protocol::agent_events::AgentEventApprovalRiskLevel;
use agiworkforce_protocol::developer_session::{
    method, AppServerNotification, ApprovalRequestedNotification, TurnEndedNotification,
    TurnFailureCode, TurnStartedNotification, TurnStatus, UserInputRequestedParams,
};
use agiworkforce_protocol::task_state::AgentTaskState;
use serde::de::DeserializeOwned;

use crate::preferences::Preferences;

const MAX_REMEMBERED: usize = 500;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Policy {
    pub notify_finished: bool,
    pub notify_approval: bool,
    pub window_active: bool,
}

impl Policy {
    pub fn new(preferences: &Preferences, window_active: bool) -> Self {
        Self {
            notify_finished: preferences.notify_when_work_finishes,
            notify_approval: preferences.notify_when_approval_needed,
            window_active,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Finished,
    Failed,
    Approval,
    Question,
}

impl Kind {
    fn enabled(self, policy: Policy) -> bool {
        match self {
            Self::Finished | Self::Failed => policy.notify_finished,
            Self::Approval | Self::Question => policy.notify_approval,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Notice {
    pub kind: Kind,
    pub title: String,
    pub body: String,
}

#[derive(Default)]
pub struct Tracker {
    turns: BTreeSet<(String, String)>,
    cloud: Option<CloudRun>,
    seen: HashSet<String>,
    order: VecDeque<String>,
}

struct CloudRun {
    request_id: String,
    state: AgentTaskState,
    transitions: u32,
}

impl Tracker {
    pub fn working(&self) -> bool {
        !self.turns.is_empty()
    }

    pub fn reset_local(&mut self) {
        self.turns.clear();
    }

    pub fn forget_cloud(&mut self) {
        self.cloud = None;
    }

    pub fn observe(
        &mut self,
        notification: &AppServerNotification,
        product: &str,
        policy: Policy,
    ) -> Option<Notice> {
        match notification.method.as_str() {
            method::TURN_STARTED => {
                let started: TurnStartedNotification = parse(notification)?;
                self.turns.insert((started.thread_id, started.turn_id));
                None
            }
            method::TURN_INTERRUPTED => {
                let stopped: TurnStartedNotification = parse(notification)?;
                self.turns.remove(&(stopped.thread_id, stopped.turn_id));
                None
            }
            method::APPROVAL_REQUESTED => {
                let request: ApprovalRequestedNotification = parse(notification)?;
                self.turns
                    .insert((request.thread_id.clone(), request.turn_id.clone()));
                let key = format!("approval\0{}\0{}", request.thread_id, request.request_id);
                self.present(key, Kind::Approval, policy, || Notice {
                    kind: Kind::Approval,
                    title: "Approval needed".into(),
                    body: approval_body(request.risk_level, request.reversible, product),
                })
            }
            method::USER_INPUT_REQUESTED => {
                let request: UserInputRequestedParams = parse(notification)?;
                self.turns
                    .insert((request.thread_id.clone(), request.turn_id.clone()));
                let key = format!("question\0{}\0{}", request.thread_id, request.request_id);
                self.present(key, Kind::Question, policy, || Notice {
                    kind: Kind::Question,
                    title: "The agent has a question".into(),
                    body: format!("Open {product} to answer it."),
                })
            }
            method::TURN_COMPLETED | method::TURN_FAILED => {
                let ended: TurnEndedNotification = parse(notification)?;
                self.turns
                    .remove(&(ended.thread_id.clone(), ended.turn_id.clone()));
                let key = format!("finished\0{}\0{}", ended.thread_id, ended.turn_id);
                match ended.status {
                    TurnStatus::Completed => {
                        self.present(key, Kind::Finished, policy, || finished_notice(product))
                    }
                    TurnStatus::Failed => {
                        let code = ended.failure.map(|failure| failure.code);
                        if code == Some(TurnFailureCode::Interrupted) {
                            return None;
                        }
                        self.present(key, Kind::Failed, policy, || failed_notice(code, product))
                    }
                    TurnStatus::Running | TurnStatus::Interrupted => None,
                }
            }
            _ => None,
        }
    }

    pub fn observe_cloud(
        &mut self,
        request_id: &str,
        state: AgentTaskState,
        product: &str,
        policy: Policy,
    ) -> Option<Notice> {
        let transitions = match self.cloud.as_mut() {
            Some(run) if run.request_id == request_id => {
                if run.state == state {
                    return None;
                }
                run.state = state;
                run.transitions = run.transitions.saturating_add(1);
                run.transitions
            }
            _ => {
                self.cloud = Some(CloudRun {
                    request_id: request_id.to_owned(),
                    state,
                    transitions: 0,
                });
                return None;
            }
        };
        let key = format!("cloud\0{request_id}\0{transitions}");
        match state {
            AgentTaskState::Completed => {
                self.present(key, Kind::Finished, policy, || finished_notice(product))
            }
            AgentTaskState::ReadyForReview => {
                self.present(key, Kind::Finished, policy, || Notice {
                    kind: Kind::Finished,
                    title: "Agent finished".into(),
                    body: format!("Open {product} to review the result."),
                })
            }
            AgentTaskState::Failed | AgentTaskState::TimedOut | AgentTaskState::Partial => {
                self.present(key, Kind::Failed, policy, || failed_notice(None, product))
            }
            AgentTaskState::AwaitingApproval => {
                self.present(key, Kind::Approval, policy, || Notice {
                    kind: Kind::Approval,
                    title: "Approval needed".into(),
                    body: format!("Open {product} to review it."),
                })
            }
            AgentTaskState::AwaitingInput => self.present(key, Kind::Question, policy, || Notice {
                kind: Kind::Question,
                title: "The agent has a question".into(),
                body: format!("Open {product} to answer it."),
            }),
            AgentTaskState::Queued
            | AgentTaskState::Running
            | AgentTaskState::Cancelled
            | AgentTaskState::Paused
            | AgentTaskState::Archived
            | AgentTaskState::Planning
            | AgentTaskState::Resuming => None,
        }
    }

    fn present(
        &mut self,
        key: String,
        kind: Kind,
        policy: Policy,
        notice: impl FnOnce() -> Notice,
    ) -> Option<Notice> {
        if !self.remember(key) || policy.window_active || !kind.enabled(policy) {
            return None;
        }
        Some(notice())
    }

    fn remember(&mut self, key: String) -> bool {
        if !self.seen.insert(key.clone()) {
            return false;
        }
        self.order.push_back(key);
        if self.order.len() > MAX_REMEMBERED {
            if let Some(oldest) = self.order.pop_front() {
                self.seen.remove(&oldest);
            }
        }
        true
    }
}

fn parse<T: DeserializeOwned>(notification: &AppServerNotification) -> Option<T> {
    serde_json::from_value(notification.params.clone()).ok()
}

fn finished_notice(product: &str) -> Notice {
    Notice {
        kind: Kind::Finished,
        title: "Agent finished".into(),
        body: format!("Open {product} to read the result."),
    }
}

fn failed_notice(code: Option<TurnFailureCode>, product: &str) -> Notice {
    Notice {
        kind: Kind::Failed,
        title: "Agent stopped with an error".into(),
        body: format!(
            "{} Open {product} to see what happened.",
            failure_phrase(code)
        ),
    }
}

fn approval_body(
    risk: Option<AgentEventApprovalRiskLevel>,
    reversible: Option<bool>,
    product: &str,
) -> String {
    let risk = risk.map(|level| match level {
        AgentEventApprovalRiskLevel::Low => "Low risk",
        AgentEventApprovalRiskLevel::Medium => "Medium risk",
        AgentEventApprovalRiskLevel::High => "High risk",
    });
    let undo = (reversible == Some(false)).then_some("Cannot be undone");
    let facts = [risk, undo].into_iter().flatten().collect::<Vec<_>>();
    let review = format!("Open {product} to review it.");
    if facts.is_empty() {
        review
    } else {
        format!("{}\n{review}", facts.join(", "))
    }
}

fn failure_phrase(code: Option<TurnFailureCode>) -> &'static str {
    match code {
        Some(TurnFailureCode::ProviderAuthMissing) => {
            "No sign-in is set up for the model provider."
        }
        Some(TurnFailureCode::AccountSignedOut) => "You are signed out.",
        Some(TurnFailureCode::PlanExcludesModel) => "Your plan does not include this model.",
        Some(TurnFailureCode::UsageLimitReached) => "A usage limit was reached.",
        Some(TurnFailureCode::ProviderAuthInvalid) => "The provider rejected the saved sign-in.",
        Some(TurnFailureCode::ProviderRateLimited) => "The provider is limiting requests.",
        Some(TurnFailureCode::FreeAllowanceExhausted) => "The free allowance is used up.",
        Some(TurnFailureCode::ProviderUnavailable) => "The provider did not answer.",
        Some(TurnFailureCode::StreamInterrupted) => "The connection ended before the answer did.",
        Some(TurnFailureCode::ContextWindowExceeded) => {
            "The conversation is too long for the model."
        }
        Some(TurnFailureCode::OutputLimitReached) => "The answer reached the model's length limit.",
        Some(TurnFailureCode::RefusedBySafety) => "The provider declined the request.",
        Some(TurnFailureCode::Network) => "The request never reached the provider.",
        Some(TurnFailureCode::ToolDenied) => "A tool call was refused.",
        Some(TurnFailureCode::Interrupted) => "The turn was stopped.",
        Some(TurnFailureCode::Timeout) => "The turn timed out.",
        Some(TurnFailureCode::InvalidRequest) => "The request was rejected before it ran.",
        Some(TurnFailureCode::Unknown) | None => "The turn did not finish.",
    }
}

pub fn deliver(product: &str, notice: &Notice) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let bundle = notify_rust::get_bundle_identifier_or_default(product);
        let _ = notify_rust::set_application(&bundle);
    }
    notify_rust::Notification::new()
        .appname(product)
        .summary(&notice.title)
        .body(&notice.body)
        .show()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Platform {
    MacOs,
    Windows,
    Linux,
    Other,
}

impl Platform {
    pub fn current() -> Self {
        if cfg!(target_os = "macos") {
            Self::MacOs
        } else if cfg!(target_os = "windows") {
            Self::Windows
        } else if cfg!(target_os = "linux") {
            Self::Linux
        } else {
            Self::Other
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HoldPlan {
    pub program: String,
    pub args: Vec<String>,
    pub holds_stdin: bool,
}

const WINDOWS_HOLD_SCRIPT: &str = "Add-Type -Namespace Native -Name Power -MemberDefinition '[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint flags);'; [void][Native.Power]::SetThreadExecutionState(2147483713); [void][Console]::In.ReadToEnd()";

pub fn hold_plan(platform: Platform, pid: u32, product: &str) -> Option<HoldPlan> {
    match platform {
        Platform::MacOs => Some(HoldPlan {
            program: "caffeinate".into(),
            args: vec!["-s".into(), "-w".into(), pid.to_string()],
            holds_stdin: false,
        }),
        Platform::Windows => Some(HoldPlan {
            program: "powershell.exe".into(),
            args: vec![
                "-NoProfile".into(),
                "-NonInteractive".into(),
                "-WindowStyle".into(),
                "Hidden".into(),
                "-Command".into(),
                WINDOWS_HOLD_SCRIPT.into(),
            ],
            holds_stdin: true,
        }),
        Platform::Linux => Some(HoldPlan {
            program: "systemd-inhibit".into(),
            args: vec![
                "--what=sleep".into(),
                format!("--who={product}"),
                "--why=An agent is working".into(),
                "--mode=block".into(),
                "cat".into(),
            ],
            holds_stdin: true,
        }),
        Platform::Other => None,
    }
}

pub struct KeepAwake {
    child: Child,
    stdin: Option<ChildStdin>,
}

impl KeepAwake {
    pub fn start(plan: &HoldPlan) -> io::Result<Self> {
        let mut command = Command::new(&plan.program);
        command
            .args(&plan.args)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .stdin(if plan.holds_stdin {
                Stdio::piped()
            } else {
                Stdio::null()
            });
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x0800_0000);
        }
        let mut child = command.spawn()?;
        let stdin = child.stdin.take();
        Ok(Self { child, stdin })
    }

    pub fn id(&self) -> u32 {
        self.child.id()
    }

    pub fn alive(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }
}

impl Drop for KeepAwake {
    fn drop(&mut self) {
        drop(self.stdin.take());
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
