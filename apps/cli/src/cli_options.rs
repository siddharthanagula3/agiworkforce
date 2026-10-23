//! Normalized global CLI option contract.
//!
//! Entrypoint flags are normalized into one options object before launching the
//! implemented print, interactive, or SDK paths.

use clap::ValueEnum;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, ValueEnum, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PermissionMode {
    #[default]
    Default,
    Plan,
    /// Auto: file edits and read-only tools run, shell commands the safety
    /// classifier clears run, and anything it cannot clear asks first.
    #[value(name = "auto", aliases = ["acceptEdits", "accept-edits"])]
    AcceptEdits,
    #[value(name = "bypassPermissions", alias = "bypass-permissions")]
    BypassPermissions,
    /// Headless mode: do not prompt interactively. Only pre-approved safe work runs.
    #[value(name = "dontAsk", alias = "dont-ask")]
    DontAsk,
}

/// Read a permission mode that was persisted in configuration.
///
/// `bypassPermissions` is refused on purpose: a stored setting must not be
/// able to disable every approval on a machine whose owner never chose it.
/// Anything unrecognized returns `None` so configuration never widens
/// permissions by accident.
pub(crate) fn persisted_permission_mode(raw: &str) -> Option<PermissionMode> {
    match raw
        .trim()
        .to_ascii_lowercase()
        .replace(['-', '_'], "")
        .as_str()
    {
        "default" | "ask" | "suggest" => Some(PermissionMode::Default),
        "plan" => Some(PermissionMode::Plan),
        "acceptedits" | "auto" => Some(PermissionMode::AcceptEdits),
        "dontask" => Some(PermissionMode::DontAsk),
        _ => None,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct EffectivePermissions {
    pub(crate) mode: PermissionMode,
    pub(crate) skip_permissions: bool,
    pub(crate) auto_approve_safe: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct CliOptions {
    pub(crate) permission_mode: Option<PermissionMode>,
    pub(crate) allowed_tools: Vec<String>,
    pub(crate) disallowed_tools: Vec<String>,
    pub(crate) mcp_config_paths: Vec<String>,
    pub(crate) strict_mcp_config: bool,
    pub(crate) additional_dirs: Vec<String>,
    pub(crate) agent: Option<String>,
    pub(crate) agent_id: Option<String>,
    pub(crate) session_persistence: bool,
    pub(crate) resume_session_at: Option<String>,
    pub(crate) setting_sources: Vec<String>,
}

impl PermissionMode {
    /// Whether a file edit may run without asking.
    ///
    /// `DontAsk` deliberately answers no: it pre-approves the read-only
    /// allowlist and leaves every mutation at the gate. `AcceptEdits` is the
    /// mode named for this and behaved identically to `DontAsk` until now, so
    /// the flag accepted nothing.
    pub(crate) fn auto_approves_edits(self) -> bool {
        matches!(self, PermissionMode::AcceptEdits)
    }

    fn autonomy(self) -> u8 {
        match self {
            PermissionMode::Plan => 0,
            PermissionMode::DontAsk => 1,
            PermissionMode::Default => 2,
            PermissionMode::AcceptEdits => 3,
            PermissionMode::BypassPermissions => 4,
        }
    }

    pub(crate) fn is_looser_than(self, other: PermissionMode) -> bool {
        self.autonomy() > other.autonomy()
    }

    pub(crate) fn within(self, pinned: Option<PermissionMode>) -> PermissionMode {
        match pinned {
            Some(pinned) if self.autonomy() > pinned.autonomy() => pinned,
            _ => self,
        }
    }

    pub(crate) fn name(self) -> &'static str {
        match self {
            PermissionMode::Default => "default",
            PermissionMode::Plan => "plan",
            PermissionMode::AcceptEdits => "acceptEdits",
            PermissionMode::BypassPermissions => "bypassPermissions",
            PermissionMode::DontAsk => "dontAsk",
        }
    }

    /// The mode a session file may hold for this one. Bypass is never
    /// written: the file keeps the last mode it held that was not bypass, or
    /// the default, so a session opened again cannot start with every
    /// approval off because one earlier turn was allowed to.
    pub(crate) fn storable(self, last_stored: Option<PermissionMode>) -> PermissionMode {
        match self {
            PermissionMode::BypassPermissions => last_stored
                .filter(|mode| *mode != PermissionMode::BypassPermissions)
                .unwrap_or_default(),
            mode => mode,
        }
    }
}

impl EffectivePermissions {
    pub(crate) fn held_to(self, pinned: Option<PermissionMode>) -> Self {
        if pinned.is_none() {
            return self;
        }
        Self {
            mode: self.mode.within(pinned),
            skip_permissions: false,
            auto_approve_safe: self.auto_approve_safe,
        }
    }
}

impl CliOptions {
    pub(crate) fn from_cli(cli: &crate::Cli) -> Self {
        Self {
            permission_mode: cli.permission_mode,
            allowed_tools: cli.allowed_tools.clone(),
            disallowed_tools: cli.disallowed_tools.clone(),
            mcp_config_paths: cli.mcp_config.clone(),
            strict_mcp_config: cli.strict_mcp_config,
            additional_dirs: cli.add_dir.clone(),
            agent: cli.agent.clone(),
            agent_id: cli.agent_id.clone(),
            session_persistence: cli.session_persistence,
            resume_session_at: cli.resume_session_at.clone(),
            setting_sources: cli.settings.clone(),
        }
    }

    pub(crate) fn should_skip_permissions(&self, explicit_skip: bool) -> bool {
        // `DontAsk` is deliberately NOT a blanket skip: it must keep the
        // approval gate so that non-safe tools auto-deny in headless runs (no
        // interactive prompt -> denied), matching the documented contract that
        // only pre-approved safe work runs. Only `BypassPermissions` (and the
        // explicit `--dangerously-skip-permissions` flag) skip all approvals.
        explicit_skip
            || matches!(
                self.permission_mode,
                Some(PermissionMode::BypassPermissions)
            )
    }

    pub(crate) fn should_auto_approve_safe(&self, explicit_yes: bool) -> bool {
        // `DontAsk` auto-approves only the read-only/safe-tool allowlist so that
        // pre-approved safe work runs non-interactively while mutating tools
        // still hit the (non-interactive -> deny) approval gate.
        explicit_yes
            || matches!(
                self.permission_mode,
                Some(PermissionMode::AcceptEdits) | Some(PermissionMode::DontAsk)
            )
    }

    /// The permission settings a run actually starts with.
    ///
    /// Resolved in one place because it is not one flag but five, and the
    /// subcommand arms used to each answer a different subset. `agi exec` read
    /// only `--full-auto`, so `--permission-mode`, `--mode`, `--yes`,
    /// `--dangerously-skip-permissions` and the persisted config default were
    /// all silently dropped on that path while the interactive path honoured
    /// every one of them.
    pub(crate) fn effective_permissions(
        &self,
        mode_flag: Option<PermissionMode>,
        explicit_skip: bool,
        explicit_yes: bool,
        persisted_mode: Option<&str>,
    ) -> EffectivePermissions {
        // `--mode` wins over `--permission-mode` when both are given.
        let mode = mode_flag
            .or(self.permission_mode)
            .or_else(|| persisted_mode.and_then(persisted_permission_mode))
            .unwrap_or(PermissionMode::Default);
        EffectivePermissions {
            skip_permissions: self.should_skip_permissions(explicit_skip)
                || matches!(mode, PermissionMode::BypassPermissions),
            auto_approve_safe: self.should_auto_approve_safe(explicit_yes)
                || matches!(mode, PermissionMode::AcceptEdits | PermissionMode::DontAsk),
            mode,
        }
    }

    pub(crate) fn mcp_config_load_options(&self) -> crate::mcp::McpConfigLoadOptions {
        crate::mcp::McpConfigLoadOptions {
            explicit_paths: self.mcp_config_paths.iter().map(Into::into).collect(),
            strict: self.strict_mcp_config,
        }
    }
}

/// Process-wide session-persistence policy, seeded from `--no-session-persistence`.
///
/// `--no-session-persistence` is a privacy opt-out, so it has to reach every
/// managed-session write site. `agi exec`, `run_oneshot`, the REPL and the TUI
/// each build their own `AgentSession` through helpers that do not share an
/// options struct, and the subcommand dispatch runs before the per-run option
/// resolution, so the policy is published once at entry instead of being
/// threaded through ~20 signatures. Mirrors `sandbox::set_sandbox_disabled`.
///
/// `AgentSession` reads this once at construction into
/// `AgentSession::session_persistence`; per-session overrides never consult it
/// again, so embedders can opt an individual session out (or back in) without
/// disturbing the process policy.
static SESSION_PERSISTENCE_ENABLED: AtomicBool = AtomicBool::new(true);

/// Publish the run's session-persistence policy. Called once from `run_main`
/// before any subcommand dispatches or any session is constructed.
pub(crate) fn set_session_persistence_enabled(enabled: bool) {
    SESSION_PERSISTENCE_ENABLED.store(enabled, Ordering::Relaxed);
}

/// The run's session-persistence policy. `true` unless the user passed
/// `--no-session-persistence`.
pub(crate) fn session_persistence_enabled() -> bool {
    SESSION_PERSISTENCE_ENABLED.load(Ordering::Relaxed)
}

static MEMORY_ENABLED: AtomicBool = AtomicBool::new(true);

pub(crate) fn set_memory_enabled(enabled: bool) {
    MEMORY_ENABLED.store(enabled, Ordering::Relaxed);
}

pub(crate) fn memory_enabled() -> bool {
    MEMORY_ENABLED.load(Ordering::Relaxed)
}

/// Serializes the tests that flip the process-wide policy against the tests
/// that rely on the default. The policy is genuinely global, so the tests that
/// mutate it must not run concurrently with the ones that read it.
#[cfg(test)]
pub(crate) fn session_persistence_policy_lock() -> std::sync::MutexGuard<'static, ()> {
    static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[cfg(test)]
mod tests {

    #[test]
    fn bypass_is_never_the_mode_a_session_file_holds() {
        let bypass = PermissionMode::BypassPermissions;

        assert_eq!(
            bypass.storable(Some(PermissionMode::AcceptEdits)),
            PermissionMode::AcceptEdits
        );
        assert_eq!(bypass.storable(None), PermissionMode::Default);
        assert_eq!(bypass.storable(Some(bypass)), PermissionMode::Default);
        assert_eq!(
            PermissionMode::Plan.storable(Some(PermissionMode::AcceptEdits)),
            PermissionMode::Plan
        );
    }

    #[test]
    fn accept_edits_is_the_only_mode_that_accepts_edits() {
        assert!(PermissionMode::AcceptEdits.auto_approves_edits());
        for mode in [
            PermissionMode::Default,
            PermissionMode::Plan,
            PermissionMode::DontAsk,
            PermissionMode::BypassPermissions,
        ] {
            assert!(
                !mode.auto_approves_edits(),
                "{mode:?} must not auto-approve an edit"
            );
        }
    }
    use super::*;

    fn options_without_flags() -> CliOptions {
        CliOptions {
            permission_mode: None,
            allowed_tools: Vec::new(),
            disallowed_tools: Vec::new(),
            mcp_config_paths: Vec::new(),
            strict_mcp_config: false,
            additional_dirs: Vec::new(),
            agent: None,
            agent_id: None,
            session_persistence: true,
            resume_session_at: None,
            setting_sources: Vec::new(),
        }
    }

    #[test]
    fn auto_names_the_classifier_gated_posture_on_the_flag_and_in_config() {
        for spelling in ["auto", "acceptEdits", "accept-edits"] {
            assert_eq!(
                PermissionMode::from_str(spelling, false),
                Ok(PermissionMode::AcceptEdits),
                "{spelling}"
            );
        }
        assert_eq!(
            PermissionMode::AcceptEdits
                .to_possible_value()
                .map(|value| value.get_name().to_string()),
            Some("auto".to_string())
        );
        for persisted in ["auto", "acceptEdits", "accept_edits"] {
            assert_eq!(
                persisted_permission_mode(persisted),
                Some(PermissionMode::AcceptEdits),
                "{persisted}"
            );
        }
        assert_eq!(persisted_permission_mode("bypassPermissions"), None);
        assert_eq!(persisted_permission_mode("full-auto"), None);

        let auto = options_without_flags().effective_permissions(None, false, false, Some("auto"));
        assert_eq!(auto.mode, PermissionMode::AcceptEdits);
        assert!(auto.auto_approve_safe && auto.mode.auto_approves_edits());
        assert!(!auto.skip_permissions, "auto must keep the approval gate");
    }

    #[test]
    fn a_session_with_nothing_configured_still_starts_in_default() {
        let resolved = options_without_flags().effective_permissions(None, false, false, None);
        assert_eq!(resolved.mode, PermissionMode::Default);
        assert!(!resolved.auto_approve_safe && !resolved.skip_permissions);
        assert_eq!(
            options_without_flags()
                .effective_permissions(None, false, false, Some("not-a-mode"))
                .mode,
            PermissionMode::Default
        );
    }

    mod auto_gate {
        use super::*;
        use crate::agent::ToolCall;
        use crate::features::exec::tools::{
            execute_tool_with_opts, ApprovalCallback, ToolExecOptions,
        };
        use crate::tui::approval_broker::{ApprovalDecision, ApprovalRequest, ApprovalRequestKind};
        use std::collections::HashMap;
        use std::sync::{Arc, Mutex};

        type Seen = Arc<Mutex<Vec<ApprovalRequest>>>;

        fn answering(decision: ApprovalDecision) -> (ApprovalCallback, Seen) {
            let seen: Seen = Arc::new(Mutex::new(Vec::new()));
            let recorder = Arc::clone(&seen);
            let callback: ApprovalCallback = Arc::new(move |request| {
                let recorder = Arc::clone(&recorder);
                Box::pin(async move {
                    recorder.lock().expect("seen lock").push(request);
                    decision
                })
            });
            (callback, seen)
        }

        fn auto_options(
            callback: ApprovalCallback,
            workspace_root: Option<std::path::PathBuf>,
        ) -> ToolExecOptions {
            let resolved =
                options_without_flags().effective_permissions(None, false, false, Some("auto"));
            ToolExecOptions {
                additional_workspace_roots: Vec::new(),
                mcp_tool_definitions: None,
                require_confirmation: !resolved.skip_permissions,
                auto_approve_safe: resolved.auto_approve_safe,
                auto_approve_edits: resolved.mode.auto_approves_edits(),
                quiet: true,
                approval_callback: Some(callback),
                user_input_callback: None,
                privacy_mode: crate::agent::PrivacyMode::Byok,
                workspace_root,
            }
        }

        fn shell(command: &str) -> ToolCall {
            ToolCall {
                name: "run_command".into(),
                args: HashMap::from([("command".into(), command.into())]),
            }
        }

        fn exec_requests(seen: &Seen) -> Vec<ApprovalRequest> {
            seen.lock()
                .expect("seen lock")
                .iter()
                .filter(|request| matches!(request.kind, ApprovalRequestKind::Exec { .. }))
                .cloned()
                .collect()
        }

        #[tokio::test]
        async fn a_command_the_classifier_clears_runs_without_asking() {
            let command = "echo auto-gate-cleared";
            assert_eq!(
                crate::safety::classify_command(command),
                crate::safety::CommandSafety::Safe
            );
            let (callback, seen) = answering(ApprovalDecision::Deny);

            let result = execute_tool_with_opts(&shell(command), &auto_options(callback, None))
                .await
                .expect("tool result");

            assert!(result.success, "{}", result.output);
            assert!(result.output.contains("auto-gate-cleared"));
            assert!(exec_requests(&seen).is_empty(), "a cleared command asked");
        }

        #[tokio::test]
        async fn a_command_the_classifier_cannot_classify_asks_and_does_not_run_unanswered() {
            let workspace = tempfile::tempdir().expect("workspace");
            let marker = workspace.path().join("ran");
            let command = format!(
                "agi-auto-gate-unclassified-probe && touch '{}'",
                marker.display()
            );
            assert_eq!(
                crate::safety::classify_command(&command),
                crate::safety::CommandSafety::Unknown
            );

            for answer in [ApprovalDecision::Deny, ApprovalDecision::Timeout] {
                let (callback, seen) = answering(answer);
                let result =
                    execute_tool_with_opts(&shell(&command), &auto_options(callback, None))
                        .await
                        .expect("tool result");

                assert!(!result.success, "{answer:?}: {}", result.output);
                assert_eq!(exec_requests(&seen).len(), 1, "{answer:?} was not asked");
                assert!(!marker.exists(), "{answer:?} ran the command");
            }
        }

        #[tokio::test]
        async fn a_dangerous_command_asks_with_a_warning_and_is_refused_when_declined() {
            let workspace = tempfile::tempdir().expect("workspace");
            let keep = workspace.path().join("keep");
            std::fs::create_dir_all(&keep).expect("keep dir");
            let command = format!("rm -rf '{}'", keep.display());
            assert_eq!(
                crate::safety::classify_command(&command),
                crate::safety::CommandSafety::Dangerous
            );
            let (callback, seen) = answering(ApprovalDecision::Deny);

            let result = execute_tool_with_opts(&shell(&command), &auto_options(callback, None))
                .await
                .expect("tool result");

            assert!(!result.success, "{}", result.output);
            assert!(keep.is_dir(), "a declined destructive command ran");
            let asked = exec_requests(&seen);
            assert_eq!(asked.len(), 1);
            assert!(
                asked[0].summary.contains("destructive"),
                "{}",
                asked[0].summary
            );
        }

        #[tokio::test]
        async fn turning_git_hooks_off_still_asks() {
            let command = "git commit --no-verify -m auto-gate";
            assert!(crate::safety::bypasses_git_hooks(command));
            let (callback, seen) = answering(ApprovalDecision::Deny);

            let result = execute_tool_with_opts(&shell(command), &auto_options(callback, None))
                .await
                .expect("tool result");

            assert!(!result.success, "{}", result.output);
            let asked = exec_requests(&seen);
            assert_eq!(asked.len(), 1);
            assert!(
                asked[0].summary.contains("git hooks"),
                "{}",
                asked[0].summary
            );
        }

        #[tokio::test]
        async fn an_ordinary_edit_runs_but_a_protected_settings_file_still_asks() {
            let workspace = tempfile::Builder::new()
                .prefix("auto-gate")
                .tempdir_in(std::env::current_dir().expect("cwd"))
                .expect("workspace");
            let write = |path: &std::path::Path| ToolCall {
                name: "write_file".into(),
                args: HashMap::from([
                    ("path".into(), path.display().to_string()),
                    ("content".into(), "{}\n".into()),
                ]),
            };

            let ordinary = workspace.path().join("notes.txt");
            let (callback, seen) = answering(ApprovalDecision::Deny);
            let result = execute_tool_with_opts(
                &write(&ordinary),
                &auto_options(callback, Some(workspace.path().to_path_buf())),
            )
            .await
            .expect("tool result");
            assert!(result.success, "{}", result.output);
            assert!(ordinary.is_file());
            assert!(seen.lock().expect("seen lock").is_empty());

            for protected in [
                ".mcp.json",
                ".pre-commit-config.yaml",
                ".git/hooks/pre-commit",
            ] {
                let path = workspace.path().join(protected);
                let (callback, seen) = answering(ApprovalDecision::Deny);
                let result = execute_tool_with_opts(
                    &write(&path),
                    &auto_options(callback, Some(workspace.path().to_path_buf())),
                )
                .await
                .expect("tool result");
                assert!(!result.success, "{protected}: {}", result.output);
                assert!(!path.exists(), "{protected} was written without approval");
                assert!(
                    !seen.lock().expect("seen lock").is_empty(),
                    "{protected} did not ask"
                );
            }
        }
    }

    #[test]
    fn session_persistence_policy_defaults_to_enabled_and_roundtrips() {
        let _guard = session_persistence_policy_lock();
        let previous = session_persistence_enabled();
        assert!(
            previous,
            "session persistence must default to enabled so a run without the flag still persists"
        );

        set_session_persistence_enabled(false);
        assert!(!session_persistence_enabled());

        set_session_persistence_enabled(previous);
        assert!(session_persistence_enabled());
    }
}
