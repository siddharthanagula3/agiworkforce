//! Producing the record a CLI session hands to another surface.

use agiworkforce_protocol::developer_session::{
    DeveloperAgentMode, DeveloperFileChangeKind, DeveloperSessionFileChange,
    DeveloperSessionHandoff, DeveloperSessionSource, DeveloperSessionTrustMode, HandoffDecision,
    HandoffEnvironment, HandoffLastTurn, HandoffLocalResource, HandoffOrigin, HandoffPlanStep,
    HandoffPlanStepState, HandoffPosture, HandoffValidation, HandoffValidationOutcome,
    HandoffWorkspace, PendingApprovalSnapshot, DEVELOPER_SESSION_PROTOCOL_VERSION,
};
use chrono::Utc;
use clap::ValueEnum;

use super::session::{
    ManagedSession, ManagedSessionApproval, ManagedSessionApprovalOutcome,
    ManagedSessionFileChange, ManagedSessionFileChangeKind, ManagedSessionValidation,
    ManagedSessionValidationOutcome,
};
use crate::cli_options::PermissionMode;
use crate::features::plan::plan_mode::StepStatus;

/// What the running host knows that the persisted session does not.
#[derive(Debug, Clone)]
pub struct HandoffContext {
    pub origin: HandoffOrigin,
    pub from: HandoffEnvironment,
    pub to: HandoffEnvironment,
    pub pending_approvals: Vec<PendingApprovalSnapshot>,
    pub last_turn: Option<HandoffLastTurn>,
    /// Local resources this host is running. They do not travel; naming them
    /// is how the receiving surface knows to start its own.
    pub local_resources: Vec<HandoffLocalResource>,
}

impl HandoffContext {
    pub fn to(destination: HandoffEnvironment) -> Self {
        Self {
            origin: HandoffOrigin::DeveloperSession,
            from: match destination {
                HandoffEnvironment::Cloud => HandoffEnvironment::Local,
                HandoffEnvironment::Local => HandoffEnvironment::Cloud,
            },
            to: destination,
            pending_approvals: Vec::new(),
            last_turn: None,
            local_resources: Vec::new(),
        }
    }
}

/// The posture word a mode is named by on every surface, read from the CLI's
/// own value table so a rename cannot leave two spellings behind.
pub fn agent_mode_of(mode: Option<PermissionMode>) -> DeveloperAgentMode {
    mode.unwrap_or_default()
        .to_possible_value()
        .and_then(|value| DeveloperAgentMode::from_client_spelling(value.get_name()))
        .unwrap_or(DeveloperAgentMode::Ask)
}

fn plan_step_state(status: StepStatus) -> HandoffPlanStepState {
    match status {
        StepStatus::Pending | StepStatus::Blocked => HandoffPlanStepState::Pending,
        StepStatus::InProgress => HandoffPlanStepState::InProgress,
        StepStatus::Done => HandoffPlanStepState::Done,
        StepStatus::Skipped | StepStatus::Superseded => HandoffPlanStepState::Abandoned,
    }
}

fn file_change(change: &ManagedSessionFileChange) -> DeveloperSessionFileChange {
    DeveloperSessionFileChange {
        path: change.path.display().to_string(),
        kind: match change.kind {
            ManagedSessionFileChangeKind::Created => DeveloperFileChangeKind::Created,
            ManagedSessionFileChangeKind::Modified => DeveloperFileChangeKind::Modified,
        },
        tool: change.tool.clone(),
        tool_call_id: change.tool_call_id.clone(),
        changed_at: change.changed_at.to_rfc3339(),
    }
}

fn validation(validation: &ManagedSessionValidation) -> HandoffValidation {
    HandoffValidation {
        command: validation.command.clone(),
        outcome: match validation.outcome {
            ManagedSessionValidationOutcome::Passed => HandoffValidationOutcome::Passed,
            ManagedSessionValidationOutcome::Failed => HandoffValidationOutcome::Failed,
            ManagedSessionValidationOutcome::Interrupted => HandoffValidationOutcome::Interrupted,
        },
        ran_at: validation.ran_at.to_rfc3339(),
        commit: validation.commit.clone(),
    }
}

fn decision(approval: &ManagedSessionApproval) -> HandoffDecision {
    HandoffDecision {
        summary: approval.summary.clone(),
        rationale: Some(
            match approval.outcome {
                ManagedSessionApprovalOutcome::AllowOnce => "allowed once",
                ManagedSessionApprovalOutcome::AllowSession => "allowed for the session",
                ManagedSessionApprovalOutcome::AlwaysAllow => "always allowed",
                ManagedSessionApprovalOutcome::Deny => "denied",
                ManagedSessionApprovalOutcome::Cancel => "cancelled",
                ManagedSessionApprovalOutcome::Timeout => "not answered in time",
            }
            .to_string(),
        ),
        decided_at: approval.decided_at.to_rfc3339(),
    }
}

/// The record this session hands to another surface.
pub fn developer_session_handoff(
    session: &ManagedSession,
    context: HandoffContext,
) -> DeveloperSessionHandoff {
    let code = session.code.as_ref();
    let git = code.and_then(|code| code.git.as_ref());
    DeveloperSessionHandoff {
        protocol_version: DEVELOPER_SESSION_PROTOCOL_VERSION,
        thread_id: session.session_id.clone(),
        origin: context.origin,
        issued_by: DeveloperSessionSource::Cli,
        issued_at: Utc::now().to_rfc3339(),
        from_environment: context.from,
        to_environment: context.to,
        workspace: HandoffWorkspace {
            cwd: session
                .workspace_root
                .as_ref()
                .map(|root| root.display().to_string())
                .unwrap_or_default(),
            worktree_root: session
                .worktree_root
                .as_ref()
                .map(|root| root.display().to_string()),
            repository: session.repository.clone(),
            branch: session
                .git_branch
                .clone()
                .or_else(|| git.and_then(|git| git.branch.clone())),
            head_commit: git.and_then(|git| git.head_commit.clone()),
            uncommitted_changes: git.is_some_and(|git| !git.changes.is_empty()),
        },
        posture: HandoffPosture {
            agent_mode: agent_mode_of(session.permission_mode),
            trust_mode: code
                .map(|code| code.trust_mode)
                .unwrap_or(DeveloperSessionTrustMode::Unknown),
            permission_profile_id: code
                .map(|code| code.permission_profile_id.to_string())
                .unwrap_or_default(),
        },
        objective: session.working_state().objective.map(str::to_string),
        decisions: session.approvals.iter().map(decision).collect(),
        plan: session
            .current_plan
            .iter()
            .flat_map(|plan| plan.steps.iter())
            .map(|step| HandoffPlanStep {
                description: step.description.clone(),
                state: plan_step_state(step.status),
            })
            .collect(),
        modified_files: session.file_changes.iter().map(file_change).collect(),
        validations: session.validations.iter().map(validation).collect(),
        pending_approvals: context.pending_approvals,
        last_turn: context.last_turn,
        local_resources: context.local_resources,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::plan::plan_mode::{Plan, PlanStep};
    use crate::models::Message;
    use agiworkforce_protocol::code_domain::{
        ChangeKind, CodeSession, RepositoryChange, RepositorySnapshot,
    };
    use agiworkforce_protocol::developer_session::{HandoffStart, HandoffTurnState};

    fn session_with_work() -> ManagedSession {
        let now = Utc::now();
        let mut session = ManagedSession::new("thread-1", now);
        session.workspace_root = Some(std::path::PathBuf::from("/work/repo"));
        session.worktree_root = Some(std::path::PathBuf::from("/work/repo"));
        session.repository = Some("https://example.invalid/team/repo.git".to_string());
        session.git_branch = Some("feature".to_string());
        session.permission_mode = Some(PermissionMode::AcceptEdits);
        session.push_message(Message::text(
            "user",
            "make the importer resume after a failed batch",
        ));
        session.current_plan = Some(Plan {
            steps: vec![
                PlanStep {
                    description: "record the last completed batch".to_string(),
                    status: StepStatus::Done,
                    notes: None,
                },
                PlanStep {
                    description: "resume from it on restart".to_string(),
                    status: StepStatus::InProgress,
                    notes: None,
                },
            ],
        });
        session.approvals.push(ManagedSessionApproval {
            request_id: "req-1".to_string(),
            kind: "exec".to_string(),
            summary: "run the migration".to_string(),
            outcome: ManagedSessionApprovalOutcome::AllowOnce,
            requested_at: now,
            decided_at: now,
        });
        session.file_changes.push(ManagedSessionFileChange {
            path: std::path::PathBuf::from("src/importer.rs"),
            kind: ManagedSessionFileChangeKind::Modified,
            tool: "edit_file".to_string(),
            tool_call_id: "call-1".to_string(),
            changed_at: now,
        });
        session.validations.push(ManagedSessionValidation {
            command: "cargo test -p importer".to_string(),
            kind: crate::platform::runtime::validation_run::ValidationKind::Test,
            outcome: ManagedSessionValidationOutcome::Failed,
            ran_at: now,
            commit: Some("abc123".to_string()),
        });
        let mut code = CodeSession::new(
            "thread-1",
            DeveloperSessionSource::Cli,
            DeveloperSessionTrustMode::Byok,
            now,
        );
        code.git = Some(
            RepositorySnapshot::new("repo", now)
                .on_branch("feature")
                .at_commit("abc123")
                .with_change(RepositoryChange::new(
                    "src/importer.rs",
                    ChangeKind::Modified,
                    false,
                )),
        );
        session.code = Some(Box::new(code));
        session
    }

    #[test]
    fn a_handoff_carries_what_the_session_did_rather_than_a_summary_of_it() {
        let session = session_with_work();
        let handoff =
            developer_session_handoff(&session, HandoffContext::to(HandoffEnvironment::Cloud));

        assert_eq!(handoff.thread_id, "thread-1");
        assert_eq!(
            handoff.objective.as_deref(),
            Some("make the importer resume after a failed batch")
        );
        assert_eq!(handoff.plan.len(), 2);
        assert_eq!(handoff.plan[0].state, HandoffPlanStepState::Done);
        assert_eq!(handoff.plan[1].state, HandoffPlanStepState::InProgress);
        assert_eq!(handoff.decisions.len(), 1);
        assert_eq!(handoff.decisions[0].summary, "run the migration");
        assert_eq!(handoff.modified_files.len(), 1);
        assert_eq!(handoff.modified_files[0].path, "src/importer.rs");
        assert_eq!(handoff.validations.len(), 1);
        assert_eq!(
            handoff.validations[0].outcome,
            HandoffValidationOutcome::Failed
        );
        assert_eq!(handoff.workspace.branch.as_deref(), Some("feature"));
        assert_eq!(handoff.workspace.head_commit.as_deref(), Some("abc123"));
        assert!(handoff.workspace.uncommitted_changes);
        assert_eq!(handoff.posture.agent_mode, DeveloperAgentMode::Auto);
        assert_eq!(handoff.posture.trust_mode, DeveloperSessionTrustMode::Byok);

        let admitted = handoff
            .accept(HandoffEnvironment::Cloud)
            .expect("the destination takes it");
        assert_eq!(
            admitted.start,
            HandoffStart::Resume {
                thread_id: "thread-1".to_string()
            }
        );
    }

    #[test]
    fn a_session_produced_for_the_cloud_comes_home_the_same_way() {
        let session = session_with_work();
        let outbound =
            developer_session_handoff(&session, HandoffContext::to(HandoffEnvironment::Cloud));
        assert_eq!(outbound.from_environment, HandoffEnvironment::Local);
        assert!(outbound.accept(HandoffEnvironment::Local).is_err());

        let inbound =
            developer_session_handoff(&session, HandoffContext::to(HandoffEnvironment::Local));
        assert_eq!(inbound.from_environment, HandoffEnvironment::Cloud);
        assert!(inbound.accept(HandoffEnvironment::Local).is_ok());
    }

    #[test]
    fn every_permission_mode_hands_over_a_posture_the_receiving_surface_knows() {
        for mode in PermissionMode::value_variants() {
            let mut session = session_with_work();
            session.permission_mode = Some(*mode);
            let handoff =
                developer_session_handoff(&session, HandoffContext::to(HandoffEnvironment::Cloud));
            assert!(
                !handoff.posture.agent_mode.wire_name().is_empty(),
                "{mode:?} has no posture on the wire"
            );
        }
        assert_eq!(
            agent_mode_of(Some(PermissionMode::Plan)),
            DeveloperAgentMode::Plan
        );
        assert_eq!(
            agent_mode_of(Some(PermissionMode::BypassPermissions)),
            DeveloperAgentMode::Bypass
        );
        assert_eq!(agent_mode_of(None), DeveloperAgentMode::Ask);
    }

    #[test]
    fn a_running_host_names_what_it_leaves_behind() {
        let session = session_with_work();
        let mut context = HandoffContext::to(HandoffEnvironment::Cloud);
        context.local_resources = vec![
            HandoffLocalResource::DevServer,
            HandoffLocalResource::McpServer,
        ];
        context.last_turn = Some(HandoffLastTurn {
            turn_id: "turn-9".to_string(),
            state: HandoffTurnState::Interrupted,
            model: None,
            ended_at: Utc::now().to_rfc3339(),
        });
        context.pending_approvals = vec![PendingApprovalSnapshot {
            request_id: "req-2".to_string(),
            kind: "exec".to_string(),
            summary: "run the deploy".to_string(),
            detail: "./deploy.sh".to_string(),
        }];

        let admitted = developer_session_handoff(&session, context)
            .accept(HandoffEnvironment::Cloud)
            .expect("accepted");
        assert_eq!(
            admitted.restart,
            vec![
                HandoffLocalResource::DevServer,
                HandoffLocalResource::McpServer
            ]
        );
        assert_eq!(admitted.interrupted_turn.as_deref(), Some("turn-9"));
        assert_eq!(admitted.reask.len(), 1);
    }

    #[test]
    fn compacting_the_transcript_away_does_not_take_the_work_with_it() {
        let mut session = session_with_work();
        let before =
            developer_session_handoff(&session, HandoffContext::to(HandoffEnvironment::Cloud));

        session.messages.clear();

        let after =
            developer_session_handoff(&session, HandoffContext::to(HandoffEnvironment::Cloud));
        assert_eq!(after.objective, before.objective);
        assert_eq!(after.decisions, before.decisions);
        assert_eq!(after.plan, before.plan);
        assert_eq!(after.modified_files, before.modified_files);
        assert_eq!(after.validations, before.validations);
        assert_eq!(after.workspace.branch, before.workspace.branch);
        assert_eq!(
            after.workspace.worktree_root,
            before.workspace.worktree_root
        );

        let state = session.working_state();
        assert_eq!(
            state.objective,
            Some("make the importer resume after a failed batch")
        );
        assert_eq!(state.modified_files.len(), 1);
        assert_eq!(state.validations.len(), 1);
        assert_eq!(state.branch, Some("feature"));
        assert!(state.worktree_root.is_some());
        assert!(state.plan.is_some());
    }
}
