//! Config management helpers for `App`.
//!
//! Covers disk-rebuild, in-memory refresh, runtime policy overrides,
//! approvals/sandbox setters, and feature-flag persistence.

use agiworkforce_core::config::Config;
use agiworkforce_core::config::ConfigBuilder;
use agiworkforce_core::config::edit::ConfigEdit;
use agiworkforce_core::config::edit::ConfigEditsBuilder;
use agiworkforce_core::config::types::ApprovalsReviewer;
use agiworkforce_features::Feature;
use agiworkforce_protocol::protocol::AskForApproval;
use agiworkforce_protocol::protocol::Op;
use agiworkforce_protocol::protocol::SandboxPolicy;
use color_eyre::eyre::Result;
use color_eyre::eyre::WrapErr;
use std::path::Path;
use std::path::PathBuf;
use toml::Value as TomlValue;
#[cfg(target_os = "windows")]
use agiworkforce_core::windows_sandbox::WindowsSandboxLevelExt;
#[cfg(target_os = "windows")]
use agiworkforce_protocol::config_types::WindowsSandboxLevel;

use super::thread_event_store::ThreadEventStore;

impl super::App {
    pub(super) async fn rebuild_config_for_cwd(&self, cwd: PathBuf) -> Result<Config> {
        let mut overrides = self.harness_overrides.clone();
        overrides.cwd = Some(cwd.clone());
        let cwd_display = cwd.display().to_string();
        ConfigBuilder::default()
            .agiworkforce_home(self.config.agiworkforce_home.clone())
            .cli_overrides(self.cli_kv_overrides.clone())
            .harness_overrides(overrides)
            .build()
            .await
            .wrap_err_with(|| format!("Failed to rebuild config for cwd {cwd_display}"))
    }

    pub(super) async fn refresh_in_memory_config_from_disk(&mut self) -> Result<()> {
        let mut config = self
            .rebuild_config_for_cwd(self.chat_widget.config_ref().cwd.clone())
            .await?;
        self.apply_runtime_policy_overrides(&mut config);
        self.config = config;
        self.chat_widget.sync_plugin_mentions_config(&self.config);
        Ok(())
    }

    pub(super) async fn refresh_in_memory_config_from_disk_best_effort(&mut self, action: &str) {
        if let Err(err) = self.refresh_in_memory_config_from_disk().await {
            tracing::warn!(
                error = %err,
                action,
                "failed to refresh config before thread transition; continuing with current in-memory config"
            );
        }
    }

    pub(super) async fn rebuild_config_for_resume_or_fallback(
        &mut self,
        current_cwd: &Path,
        resume_cwd: PathBuf,
    ) -> Result<Config> {
        match self.rebuild_config_for_cwd(resume_cwd.clone()).await {
            Ok(config) => Ok(config),
            Err(err) => {
                if crate::cwds_differ(current_cwd, &resume_cwd) {
                    Err(err)
                } else {
                    let resume_cwd_display = resume_cwd.display().to_string();
                    tracing::warn!(
                        error = %err,
                        cwd = %resume_cwd_display,
                        "failed to rebuild config for same-cwd resume; using current in-memory config"
                    );
                    Ok(self.config.clone())
                }
            }
        }
    }

    pub(super) fn apply_runtime_policy_overrides(&mut self, config: &mut Config) {
        if let Some(policy) = self.runtime_approval_policy_override.as_ref()
            && let Err(err) = config.permissions.approval_policy.set(*policy)
        {
            tracing::warn!(%err, "failed to carry forward approval policy override");
            self.chat_widget.add_error_message(format!(
                "Failed to carry forward approval policy override: {err}"
            ));
        }
        if let Some(policy) = self.runtime_sandbox_policy_override.as_ref()
            && let Err(err) = config.permissions.sandbox_policy.set(policy.clone())
        {
            tracing::warn!(%err, "failed to carry forward sandbox policy override");
            self.chat_widget.add_error_message(format!(
                "Failed to carry forward sandbox policy override: {err}"
            ));
        }
    }

    pub(super) fn set_approvals_reviewer_in_app_and_widget(&mut self, reviewer: ApprovalsReviewer) {
        self.config.approvals_reviewer = reviewer;
        self.chat_widget.set_approvals_reviewer(reviewer);
    }

    pub(super) fn try_set_approval_policy_on_config(
        &mut self,
        config: &mut Config,
        policy: AskForApproval,
        user_message_prefix: &str,
        log_message: &str,
    ) -> bool {
        if let Err(err) = config.permissions.approval_policy.set(policy) {
            tracing::warn!(error = %err, "{log_message}");
            self.chat_widget
                .add_error_message(format!("{user_message_prefix}: {err}"));
            return false;
        }

        true
    }

    pub(super) fn try_set_sandbox_policy_on_config(
        &mut self,
        config: &mut Config,
        policy: SandboxPolicy,
        user_message_prefix: &str,
        log_message: &str,
    ) -> bool {
        if let Err(err) = config.permissions.sandbox_policy.set(policy) {
            tracing::warn!(error = %err, "{log_message}");
            self.chat_widget
                .add_error_message(format!("{user_message_prefix}: {err}"));
            return false;
        }

        true
    }

    pub(super) async fn update_feature_flags(&mut self, updates: Vec<(Feature, bool)>) {
        if updates.is_empty() {
            return;
        }

        let guardian_approvals_preset = super::guardian_approvals_mode();
        let mut next_config = self.config.clone();
        let active_profile = self.active_profile.clone();
        let scoped_segments = |key: &str| {
            if let Some(profile) = active_profile.as_deref() {
                vec!["profiles".to_string(), profile.to_string(), key.to_string()]
            } else {
                vec![key.to_string()]
            }
        };
        let windows_sandbox_changed = updates.iter().any(|(feature, _)| {
            matches!(
                feature,
                Feature::WindowsSandbox | Feature::WindowsSandboxElevated
            )
        });
        let mut approval_policy_override = None;
        let mut approvals_reviewer_override = None;
        let mut sandbox_policy_override = None;
        let mut feature_updates_to_apply = Vec::with_capacity(updates.len());
        // Guardian Approvals owns `approvals_reviewer`, but disabling the
        // feature from inside a profile should not silently clear a value
        // configured at the root scope.
        let (root_approvals_reviewer_blocks_profile_disable, profile_approvals_reviewer_configured) = {
            let effective_config = next_config.config_layer_stack.effective_config();
            let root_blocks_disable = effective_config
                .as_table()
                .and_then(|table| table.get("approvals_reviewer"))
                .is_some_and(|value| value != &TomlValue::String("user".to_string()));
            let profile_configured = active_profile.as_deref().is_some_and(|profile| {
                effective_config
                    .as_table()
                    .and_then(|table| table.get("profiles"))
                    .and_then(TomlValue::as_table)
                    .and_then(|profiles| profiles.get(profile))
                    .and_then(TomlValue::as_table)
                    .is_some_and(|profile_config| profile_config.contains_key("approvals_reviewer"))
            });
            (root_blocks_disable, profile_configured)
        };
        let mut permissions_history_label: Option<&'static str> = None;
        let mut builder = ConfigEditsBuilder::new(&self.config.agiworkforce_home)
            .with_profile(self.active_profile.as_deref());

        for (feature, enabled) in updates {
            let feature_key = feature.key();
            let mut feature_edits = Vec::new();
            if feature == Feature::GuardianApproval
                && !enabled
                && self.active_profile.is_some()
                && root_approvals_reviewer_blocks_profile_disable
            {
                self.chat_widget.add_error_message(
                        "Cannot disable Guardian Approvals in this profile because `approvals_reviewer` is configured outside the active profile.".to_string(),
                    );
                continue;
            }
            let mut feature_config = next_config.clone();
            if let Err(err) = feature_config.features.set_enabled(feature, enabled) {
                tracing::error!(
                    error = %err,
                    feature = feature_key,
                    "failed to update constrained feature flags"
                );
                self.chat_widget.add_error_message(format!(
                    "Failed to update experimental feature `{feature_key}`: {err}"
                ));
                continue;
            }
            let effective_enabled = feature_config.features.enabled(feature);
            if feature == Feature::GuardianApproval {
                let previous_approvals_reviewer = feature_config.approvals_reviewer;
                if effective_enabled {
                    // Persist the reviewer setting so future sessions keep the
                    // experiment's matching `/approvals` mode until the user
                    // changes it explicitly.
                    feature_config.approvals_reviewer =
                        guardian_approvals_preset.approvals_reviewer;
                    feature_edits.push(ConfigEdit::SetPath {
                        segments: scoped_segments("approvals_reviewer"),
                        value: guardian_approvals_preset
                            .approvals_reviewer
                            .to_string()
                            .into(),
                    });
                    if previous_approvals_reviewer != guardian_approvals_preset.approvals_reviewer {
                        permissions_history_label = Some("Guardian Approvals");
                    }
                } else if !effective_enabled {
                    if profile_approvals_reviewer_configured || self.active_profile.is_none() {
                        feature_edits.push(ConfigEdit::ClearPath {
                            segments: scoped_segments("approvals_reviewer"),
                        });
                    }
                    feature_config.approvals_reviewer = ApprovalsReviewer::User;
                    if previous_approvals_reviewer != ApprovalsReviewer::User {
                        permissions_history_label = Some("Default");
                    }
                }
                approvals_reviewer_override = Some(feature_config.approvals_reviewer);
            }
            if feature == Feature::GuardianApproval && effective_enabled {
                // The feature flag alone is not enough for the live session.
                // We also align approval policy + sandbox to the Guardian
                // Approvals preset so enabling the experiment immediately
                // makes guardian review observable in the current thread.
                if !self.try_set_approval_policy_on_config(
                    &mut feature_config,
                    guardian_approvals_preset.approval_policy,
                    "Failed to enable Guardian Approvals",
                    "failed to set guardian approvals approval policy on staged config",
                ) {
                    continue;
                }
                if !self.try_set_sandbox_policy_on_config(
                    &mut feature_config,
                    guardian_approvals_preset.sandbox_policy.clone(),
                    "Failed to enable Guardian Approvals",
                    "failed to set guardian approvals sandbox policy on staged config",
                ) {
                    continue;
                }
                feature_edits.extend([
                    ConfigEdit::SetPath {
                        segments: scoped_segments("approval_policy"),
                        value: "on-request".into(),
                    },
                    ConfigEdit::SetPath {
                        segments: scoped_segments("sandbox_mode"),
                        value: "workspace-write".into(),
                    },
                ]);
                approval_policy_override = Some(guardian_approvals_preset.approval_policy);
                sandbox_policy_override = Some(guardian_approvals_preset.sandbox_policy.clone());
            }
            next_config = feature_config;
            feature_updates_to_apply.push((feature, effective_enabled));
            builder = builder
                .with_edits(feature_edits)
                .set_feature_enabled(feature_key, effective_enabled);
        }

        // Persist first so the live session does not diverge from disk if the
        // config edit fails. Runtime/UI state is patched below only after the
        // durable config update succeeds.
        if let Err(err) = builder.apply().await {
            tracing::error!(error = %err, "failed to persist feature flags");
            self.chat_widget
                .add_error_message(format!("Failed to update experimental features: {err}"));
            return;
        }

        self.config = next_config;
        for (feature, effective_enabled) in feature_updates_to_apply {
            self.chat_widget
                .set_feature_enabled(feature, effective_enabled);
        }
        if approvals_reviewer_override.is_some() {
            self.set_approvals_reviewer_in_app_and_widget(self.config.approvals_reviewer);
        }
        if approval_policy_override.is_some() {
            self.chat_widget
                .set_approval_policy(self.config.permissions.approval_policy.value());
        }
        if sandbox_policy_override.is_some()
            && let Err(err) = self
                .chat_widget
                .set_sandbox_policy(self.config.permissions.sandbox_policy.get().clone())
        {
            tracing::error!(
                error = %err,
                "failed to set guardian approvals sandbox policy on chat config"
            );
            self.chat_widget
                .add_error_message(format!("Failed to enable Guardian Approvals: {err}"));
        }

        if approval_policy_override.is_some()
            || approvals_reviewer_override.is_some()
            || sandbox_policy_override.is_some()
        {
            // This uses `OverrideTurnContext` intentionally: toggling the
            // experiment should update the active thread's effective approval
            // settings immediately, just like a `/approvals` selection. Without
            // this runtime patch, the config edit would only affect future
            // sessions or turns recreated from disk.
            let op = Op::OverrideTurnContext {
                cwd: None,
                approval_policy: approval_policy_override,
                approvals_reviewer: approvals_reviewer_override,
                sandbox_policy: sandbox_policy_override,
                windows_sandbox_level: None,
                model: None,
                effort: None,
                summary: None,
                service_tier: None,
                collaboration_mode: None,
                personality: None,
            };
            let replay_state_op =
                ThreadEventStore::op_can_change_pending_replay_state(&op).then(|| op.clone());
            let submitted = self.chat_widget.submit_op(op);
            if submitted && let Some(op) = replay_state_op.as_ref() {
                self.note_active_thread_outbound_op(op).await;
                self.refresh_pending_thread_approvals().await;
            }
        }

        if windows_sandbox_changed {
            #[cfg(target_os = "windows")]
            {
                let windows_sandbox_level = WindowsSandboxLevel::from_config(&self.config);
                self.app_event_tx
                    .send(super::AppEvent::AgiWorkforceOp(Op::OverrideTurnContext {
                        cwd: None,
                        approval_policy: None,
                        approvals_reviewer: None,
                        sandbox_policy: None,
                        windows_sandbox_level: Some(windows_sandbox_level),
                        model: None,
                        effort: None,
                        summary: None,
                        service_tier: None,
                        collaboration_mode: None,
                        personality: None,
                    }));
            }
        }

        if let Some(label) = permissions_history_label {
            self.chat_widget.add_info_message(
                format!("Permissions updated to {label}"),
                /*hint*/ None,
            );
        }
    }
}
