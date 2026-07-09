use std::collections::HashSet;

use agiworkforce_agent_core::{
    Completion, DispatchMode, ExecFuture, ExecResult, LoopControl, MAX_AGENTIC_ITERATIONS,
    Prepared, PreparedCall, ResultBlock, RunawayTracker, StreamEvent, ToolClass, TurnEvent,
    TurnHost, TurnParams, TurnPhase, run_turn,
};
use anyhow::Result;
use async_trait::async_trait;
use colored::Colorize;

use crate::compaction;
use crate::config::CliConfig;
use crate::errors::CliError;
use crate::hooks;
use crate::models::{self, ContentBlock, Message, StreamCallback, ToolCallResponse};
use crate::terminal_style as ts;

use super::executor::value_to_legacy_args;
use super::history::build_assistant_message;
use super::tools::{execute_mcp_tool, execute_team_tool, is_team_tool};
use super::{AgentSession, TurnResult};

/// Build a short, single-line summary of a tool call for the TUI tool cell
/// (e.g. the command for `run_command`, the path for file tools). Carries no
/// full output — capped to one line of <=80 chars.
fn tool_event_summary(name: &str, args: &serde_json::Value) -> String {
    let pick = |k: &str| args.get(k).and_then(|v| v.as_str()).map(str::to_string);
    let raw = match name {
        "run_command" | "powershell" => pick("command"),
        "read_file" | "write_file" | "edit_file" | "multiedit" | "list_directory"
        | "notebook_edit" => pick("path"),
        "search_files" | "grep_files" | "glob" => pick("pattern").or_else(|| pick("query")),
        "web_search" => pick("query"),
        "web_fetch" => pick("url"),
        _ => None,
    }
    .unwrap_or_default();
    let one_line = raw.replace('\n', " ");
    if one_line.chars().count() > 80 {
        format!("{}…", one_line.chars().take(79).collect::<String>())
    } else {
        one_line
    }
}

/// Fire a tool lifecycle event to the TUI sink, if one is installed. A no-op on
/// non-TUI surfaces (the `eprintln!` status lines remain the channel there), so
/// exec/REPL/app-server/a2a output is unchanged.
fn emit_tool_event(sink: Option<&super::ToolEventSink>, ev: crate::tui::app_event::TuiAppEvent) {
    if let Some(sink) = sink {
        (sink.0)(ev);
    }
}

fn invalid_tool_arguments_block(tool_call: &ToolCallResponse) -> Option<ContentBlock> {
    let is_invalid = tool_call
        .arguments
        .get(models::INVALID_TOOL_ARGS_MARKER)
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    if !is_invalid {
        return None;
    }

    let error = tool_call
        .arguments
        .get("error")
        .and_then(|value| value.as_str())
        .unwrap_or("malformed JSON arguments");
    let raw = tool_call
        .arguments
        .get("raw")
        .and_then(|value| value.as_str())
        .unwrap_or("");

    Some(ContentBlock::ToolResult {
        tool_use_id: tool_call.id.clone(),
        content: serde_json::json!({
            "ok": false,
            "error": "invalid_tool_arguments",
            "tool": tool_call.name.as_str(),
            "message": format!(
                "Model produced invalid JSON arguments for tool `{}`: {}",
                tool_call.name, error
            ),
            "raw": raw,
        })
        .to_string(),
        is_error: true,
    })
}

#[derive(Debug, Clone, PartialEq)]
enum PreToolUseOutcome {
    Proceed(serde_json::Value),
    Blocked(String),
    Stopped,
}

async fn run_pre_tool_use_hooks(
    hooks_config: &hooks::HooksConfig,
    model: &str,
    tool_call: &ToolCallResponse,
) -> PreToolUseOutcome {
    let pre_results = hooks::run_hooks(
        hooks_config,
        hooks::HookEvent::PreToolUse,
        &hooks::HookInput {
            event: "PreToolUse".to_string(),
            session_id: None,
            model: Some(model.to_string()),
            tool_name: Some(tool_call.name.clone()),
            tool_args: Some(tool_call.arguments.clone()),
            tool_output: None,
            message: None,
            tool_execution: None,
        },
    )
    .await;
    let pre_t = hooks::aggregate_transformers(&pre_results);
    let effective_args = pre_t
        .updated_input
        .clone()
        .unwrap_or_else(|| tool_call.arguments.clone());

    match hooks::aggregate_results(&pre_results) {
        hooks::HookAggregateOutcome::Blocked { reasons } => {
            PreToolUseOutcome::Blocked(reasons.join("; "))
        }
        hooks::HookAggregateOutcome::Stop => PreToolUseOutcome::Stopped,
        hooks::HookAggregateOutcome::Continue => PreToolUseOutcome::Proceed(effective_args),
    }
}

/// Map the CLI's `CompletionResult` onto the engine's `Completion` (the
/// authoritative assembled outcome + the subscription flag the shared
/// `ChatOutcome` does not carry).
fn completion_from_result(result: models::CompletionResult) -> Completion {
    Completion {
        outcome: agiworkforce_llm::ChatOutcome {
            text: result.text,
            tool_calls: result.tool_calls,
            usage: agiworkforce_llm::Usage {
                input_tokens: result.input_tokens,
                output_tokens: result.output_tokens,
                cache_read_input_tokens: result.cache_read_input_tokens,
                cache_creation_input_tokens: result.cache_creation_input_tokens,
                reasoning_output_tokens: result.reasoning_output_tokens,
            },
            stop_reason: result.stop_reason,
        },
        via_subscription: result.via_subscription,
    }
}

/// Convert a CLI `ContentBlock::ToolResult` into the engine's `ResultBlock`.
fn content_block_to_result(block: ContentBlock) -> ResultBlock {
    match block {
        ContentBlock::ToolResult {
            tool_use_id,
            content,
            is_error,
        } => ResultBlock {
            tool_use_id,
            content,
            is_error,
        },
        // `invalid_tool_arguments_block` only ever produces a ToolResult; other
        // variants are unreachable, but map defensively rather than panic.
        other => ResultBlock {
            tool_use_id: String::new(),
            content: format!("{other:?}"),
            is_error: true,
        },
    }
}

impl AgentSession {
    /// Build a streaming chunk callback that is json-events-aware.
    ///
    /// When `self.json_events` is `true` the callback emits every chunk as a
    /// `MessageDelta` JSONL event to stdout (matching the first-turn sink wired
    /// by `lib.rs`).  Otherwise it falls back to a raw `print!` so human-mode
    /// output is unaffected.
    pub(crate) fn continuation_sink(&self) -> StreamCallback {
        if self.json_events {
            let sid = self.json_session_id.clone();
            Box::new(move |chunk: &str| {
                crate::agent_events::AgentEvent::MessageDelta {
                    session_id: sid.clone(),
                    text: chunk.to_string(),
                }
                .emit_stdout();
            })
        } else {
            Box::new(|chunk: &str| print!("{}", chunk))
        }
    }

    /// Reconcile history after a turn was cancelled mid-stream.
    ///
    /// `send()` pushes the user message before streaming begins, but a cancelled
    /// turn never appends an assistant reply. Left as-is, the next `send()` would
    /// push a second consecutive user message and corrupt the alternation. Append
    /// the partial assistant text (or a `[stopped]` marker) so history stays a
    /// valid user→assistant sequence for the next turn.
    pub fn finalize_cancelled_turn(&mut self, partial: &str) {
        if self.messages.last().map(|m| m.role.as_str()) == Some("user") {
            let text = if partial.trim().is_empty() {
                "[stopped]".to_string()
            } else {
                partial.to_string()
            };
            self.messages.push(Message::text("assistant", text));
        }
    }

    /// Send a user message and run the full agentic loop.
    ///
    /// This is the thin orchestrator (Wave 5e1): consent + privacy boundary,
    /// context compaction, plan-mode prefixing, the user-message push, and the
    /// pre-/post-turn hooks stay here (CLI-local, trust-boundary and
    /// presentation concerns). The turn-loop MECHANICS — model-stream driving,
    /// tool scheduling, runaway/iteration/budget guards, and event cadence —
    /// live in `agiworkforce_agent_core::run_turn`, driven through the
    /// `TurnHostAdapter` below. The public signature and the emitted event
    /// cadence are byte-for-byte unchanged.
    pub async fn send(
        &mut self,
        config: &CliConfig,
        user_input: &str,
        on_chunk: StreamCallback,
    ) -> Result<TurnResult> {
        // Complete a pending `/continue-with-byok` handoff only when this message
        // carries the reviewed draft's BYOK preamble. This is the consent moment —
        // an unrelated Local message does NOT flip the boundary, so it still blocks
        // below. (Drafting alone must never leave Local mode.)
        self.consume_byok_handoff(user_input);
        self.validate_privacy_boundary()?;

        // Context compaction: if above 90%, shrink to 70%
        let usage = compaction::context_usage(&self.messages, &self.model);
        if usage.fraction > 0.90 {
            let target = usage.limit_tokens * 70 / 100;
            let pre_hcfg = self.hooks_config.clone();
            hooks::run_hooks(
                &pre_hcfg,
                hooks::HookEvent::PreCompact,
                &hooks::HookInput {
                    event: "PreCompact".to_string(),
                    session_id: None,
                    model: Some(self.model.clone()),
                    tool_name: None,
                    tool_args: None,
                    tool_output: None,
                    message: Some(format!(
                        "context_usage_before_compact: {}/{} tokens ({}%)",
                        usage.used_tokens,
                        usage.limit_tokens,
                        (usage.fraction * 100.0) as u32
                    )),
                    tool_execution: None,
                },
            )
            .await;

            self.messages = compaction::compact_messages(&self.messages, target);
            let new_usage = compaction::context_usage(&self.messages, &self.model);
            eprintln!(
                "  {}",
                format!(
                    "Context compacted: {}",
                    compaction::format_context_report(&new_usage)
                )
                .dimmed()
            );

            hooks::run_hooks(
                &pre_hcfg,
                hooks::HookEvent::PostCompact,
                &hooks::HookInput {
                    event: "PostCompact".to_string(),
                    session_id: None,
                    model: Some(self.model.clone()),
                    tool_name: None,
                    tool_args: None,
                    tool_output: None,
                    message: Some(format!(
                        "context_usage_after_compact: {}/{} tokens ({}%)",
                        new_usage.used_tokens,
                        new_usage.limit_tokens,
                        (new_usage.fraction * 100.0) as u32
                    )),
                    tool_execution: None,
                },
            )
            .await;
        } else if usage.near_limit {
            eprintln!(
                "  {}",
                ts::warning(format!(
                    "Warning: {}",
                    compaction::format_context_report(&usage)
                ))
            );
        }

        // Add user message, prepending plan-mode prefix if applicable.
        let mut prefix = String::new();
        if let Some(feedback) = self.plan_rejection_feedback.take() {
            prefix.push_str(&format!(
                "USER REJECTED THE PREVIOUS PLAN. FEEDBACK: {feedback}\n\n"
            ));
        }
        if matches!(
            self.permission_mode,
            crate::cli_options::PermissionMode::Plan
        ) && !self.plan_approved
        {
            prefix.push_str(
                "[plan-mode] You must call the `update_plan` tool with a complete, ordered plan \
of steps before any mutating action (run_command, edit_file, write_file, apply_patch, MCP tools, \
task subagents). The user reviews and approves the plan; only then can you execute mutating \
tools. If your plan is rejected, the rejection feedback will be prefixed to the next user \
message -- revise and call `update_plan` again.\n\n",
            );
        }
        let effective_input = if prefix.is_empty() {
            user_input.to_string()
        } else {
            let expanded = format!("{prefix}{user_input}");
            hooks::run_hooks(
                &self.hooks_config,
                hooks::HookEvent::UserPromptExpansion,
                &hooks::HookInput {
                    event: "UserPromptExpansion".to_string(),
                    session_id: None,
                    model: Some(self.model.clone()),
                    tool_name: None,
                    tool_args: None,
                    tool_output: None,
                    message: Some(expanded.clone()),
                    tool_execution: None,
                },
            )
            .await;
            expanded
        };

        // If there are pending image blocks (from `--file` image attachments),
        // build a multipart user message that includes them alongside the text.
        if !self.pending_image_blocks.is_empty() {
            let mut blocks: Vec<ContentBlock> = std::mem::take(&mut self.pending_image_blocks);
            if !effective_input.is_empty() {
                blocks.push(ContentBlock::Text {
                    text: effective_input.clone(),
                });
            }
            self.messages.push(Message::blocks("user", blocks));
        } else {
            self.messages.push(Message::text("user", &effective_input));
        }

        self.save_checkpoint();

        if let Err(error) = self.persist_managed_session() {
            eprintln!(
                "{}",
                ts::warning(format!(
                    "  warning: failed to persist managed session: {error:#}"
                ))
            );
        }

        let max_tokens = config.default.max_tokens;

        let tool_defs = self.effective_tool_definitions();
        let available_tool_names = tool_defs
            .iter()
            .map(|tool_definition| tool_definition.name.clone())
            .collect::<HashSet<_>>();
        let concurrency_safe_names: HashSet<String> = tool_defs
            .iter()
            .filter(|t| t.is_concurrency_safe)
            .map(|t| t.name.clone())
            .collect();
        let plan_mode_mutating_names: HashSet<String> = tool_defs
            .iter()
            .filter(|tool_definition| {
                crate::runtime::tool_catalog::is_plan_mode_mutating_tool_definition(tool_definition)
            })
            .map(|tool_definition| tool_definition.name.clone())
            .collect();

        let pre_call_hcfg = self.hooks_config.clone();
        hooks::run_hooks(
            &pre_call_hcfg,
            hooks::HookEvent::BeforePromptBuild,
            &hooks::HookInput {
                event: "BeforePromptBuild".to_string(),
                session_id: None,
                model: Some(self.model.clone()),
                tool_name: None,
                tool_args: None,
                tool_output: None,
                message: Some(format!(
                    "messages_count={} tools_count={}",
                    self.messages.len(),
                    tool_defs.len()
                )),
                tool_execution: None,
            },
        )
        .await;
        hooks::run_hooks(
            &pre_call_hcfg,
            hooks::HookEvent::BeforeModelResolve,
            &hooks::HookInput {
                event: "BeforeModelResolve".to_string(),
                session_id: None,
                model: Some(self.model.clone()),
                tool_name: None,
                tool_args: None,
                tool_output: None,
                message: None,
                tool_execution: None,
            },
        )
        .await;

        // Lift the persistent runaway state out of the session for the turn; the
        // engine owns the detection algorithm while the state stays session-owned
        // (a second strike auto-stops across turns). Restored below.
        let mut tracker = RunawayTracker {
            recent_tool_calls: std::mem::take(&mut self.recent_tool_calls),
            loop_strike_count: self.loop_strike_count,
        };
        let params = TurnParams {
            effective_max: self.max_turns.unwrap_or(MAX_AGENTIC_ITERATIONS),
            max_budget_usd: self.max_budget_usd,
        };

        let run_result = {
            let mut adapter = TurnHostAdapter {
                session: &mut *self,
                config,
                tool_defs,
                available_tool_names,
                concurrency_safe_names,
                plan_mode_mutating_names,
                max_tokens,
                first_on_chunk: Some(on_chunk),
                hook_additional_contexts: Vec::new(),
            };
            run_turn(&mut adapter, params, &mut tracker).await
        };

        // Restore runaway state regardless of turn outcome.
        self.recent_tool_calls = tracker.recent_tool_calls;
        self.loop_strike_count = tracker.loop_strike_count;

        let outcome = run_result?;

        let total_input = outcome.totals.input_tokens;
        let total_output = outcome.totals.output_tokens;
        let total_cache_read = outcome.totals.cache_read_tokens;
        let total_cache_creation = outcome.totals.cache_creation_tokens;
        let result_reasoning = outcome.totals.reasoning_tokens;
        let via_subscription = outcome.via_subscription;
        let final_response = outcome.response;

        // Update session counters
        self.total_input_tokens += total_input;
        self.total_output_tokens += total_output;
        self.total_cache_read_tokens += total_cache_read;
        self.total_cache_creation_tokens += total_cache_creation;
        self.total_reasoning_tokens += result_reasoning;
        self.turn_count += 1;
        self.cost_ledger.record_turn(
            &self.model,
            total_input,
            total_output,
            total_cache_read,
            total_cache_creation,
        );

        // Post-turn: memory extraction + skill learning
        if let Ok(home) = crate::config::CliConfig::config_dir() {
            let tool_counts: Vec<(String, u32)> = {
                let mut counts: std::collections::HashMap<String, u32> =
                    std::collections::HashMap::new();
                for msg in &self.messages {
                    if let crate::models::MessageContent::Blocks(blocks) = &msg.content {
                        for block in blocks {
                            if let ContentBlock::ToolUse { name, .. } = block {
                                *counts.entry(name.clone()).or_insert(0) += 1;
                            }
                        }
                    }
                }
                counts.into_iter().collect()
            };
            if !tool_counts.is_empty() {
                let session_id = self.session_name.as_deref().unwrap_or("anonymous");
                if let Some(skill) = crate::skill_learner::SkillLearner::analyze_session(
                    &home,
                    session_id,
                    &tool_counts,
                    true,
                ) {
                    if let Err(e) = crate::skill_learner::SkillLearner::save_skill(&home, &skill) {
                        eprintln!("[skill_learner] failed to save learned skill: {}", e);
                    } else if !self.quiet {
                        eprintln!(
                            "  {} Learned skill: {} (confidence: {:.0}%)",
                            "auto".dimmed(),
                            skill.name,
                            skill.confidence * 100.0,
                        );
                    }
                }
            }

            if crate::memory_pipeline::MemoryPipeline::needs_consolidation(&home) {
                let home_clone = home.clone();
                let config_clone = config.clone();
                // Local sessions must consolidate on-device only (no cloud egress).
                let local_only = self.privacy_mode == super::PrivacyMode::Local;
                tokio::spawn(async move {
                    if let Err(e) = crate::memory_pipeline::MemoryPipeline::consolidate(
                        &home_clone,
                        &config_clone,
                        local_only,
                    )
                    .await
                    {
                        eprintln!("[memory_pipeline] consolidation error: {}", e);
                    }
                });
            }
        }

        if let Err(error) = self.persist_managed_session() {
            eprintln!(
                "{}",
                ts::warning(format!(
                    "  warning: failed to persist managed session: {error:#}"
                ))
            );
        }

        hooks::run_hooks(
            &self.hooks_config,
            hooks::HookEvent::AfterMessage,
            &hooks::HookInput {
                event: "AfterMessage".to_string(),
                session_id: None,
                model: Some(self.model.clone()),
                tool_name: None,
                tool_args: None,
                tool_output: None,
                message: Some(final_response.clone()),
                tool_execution: None,
            },
        )
        .await;

        Ok(TurnResult {
            response: final_response,
            input_tokens: total_input,
            output_tokens: total_output,
            cache_read_tokens: total_cache_read,
            cache_creation_tokens: total_cache_creation,
            via_subscription,
        })
    }

    /// Send a side query (/btw) — runs in a temporary fork, doesn't affect main history.
    #[allow(dead_code)]
    pub async fn send_btw(
        &self,
        config: &crate::config::CliConfig,
        question: &str,
        on_chunk: StreamCallback,
    ) -> Result<String> {
        // Trust boundary: a /btw side-query must honor the same Local→cloud guard
        // as send() — a Local session must never silently egress to cloud here.
        self.validate_privacy_boundary()?;

        let mut fork_messages = Vec::new();
        if let Some(sys) = self.messages.first() {
            fork_messages.push(sys.clone());
        }
        fork_messages.push(Message::text("user", question));

        let max_tokens = config.default.max_tokens;

        let result = models::stream_completion(
            config,
            &self.provider,
            &self.model,
            &fork_messages,
            max_tokens,
            None,
            on_chunk,
            None, // send_btw never uses extended thinking
        )
        .await?;

        Ok(result.text)
    }
}

/// Turn-scoped adapter binding the CLI session to the shared turn engine.
///
/// Holds the mutable session plus the turn context the engine's `TurnHost`
/// callbacks need (config, tool definitions, scheduling name-sets, the caller's
/// first-turn stream callback, and the sequential-path `additional_context`
/// accrual). Each trait method holds the CLI-local work moved verbatim out of
/// the old `Session::send` loop — hooks, plan-mode gating, tool-filters, MCP/
/// team/subagent dispatch, approval prompts, and the json/TUI/stderr routing —
/// so the emitted cadence is byte-for-byte preserved.
struct TurnHostAdapter<'a> {
    session: &'a mut AgentSession,
    config: &'a CliConfig,
    tool_defs: Vec<models::ToolDefinition>,
    available_tool_names: HashSet<String>,
    concurrency_safe_names: HashSet<String>,
    plan_mode_mutating_names: HashSet<String>,
    max_tokens: u32,
    /// The caller's stream callback, used for the first completion only (the
    /// continuation turns use `continuation_sink()`), matching the historical
    /// first-vs-continuation text routing.
    first_on_chunk: Option<StreamCallback>,
    /// `PostToolUse` additional-context fragments accrued during the sequential
    /// dispatch, flushed as a system message in `commit_tool_results`.
    hook_additional_contexts: Vec<String>,
}

impl TurnHostAdapter<'_> {
    /// First completion: primary stream (or the `--demo` synthesized rate-limit)
    /// with the retry-then-fallback recovery ladder. Byte-for-byte the historical
    /// first-call block, including the privacy-boundary re-validation after each
    /// provider mutation and the demo-mode synthesis.
    async fn complete_first(&mut self) -> Result<Completion> {
        let on_chunk = self
            .first_on_chunk
            .take()
            .expect("complete_first is called exactly once per turn");

        let first_call_result = if self.session.demo_force_rate_limit {
            self.session.demo_force_rate_limit = false;
            eprintln!(
                "  {}",
                "DEMO: synthesizing rate-limit on primary model".dimmed()
            );
            Err(anyhow::Error::new(CliError::RateLimited {
                provider: format!("{:?}", self.session.provider).to_lowercase(),
                retry_after: Some(0),
            }))
        } else {
            models::stream_completion(
                self.config,
                &self.session.provider,
                &self.session.model,
                &self.session.messages,
                self.max_tokens,
                Some(&self.tool_defs),
                on_chunk,
                self.session.thinking_budget_tokens,
            )
            .await
        };

        let result = match first_call_result {
            Ok(r) => r,
            Err(e) => {
                let mut last_err = e;
                let mut recovered: Option<_> = None;
                let prefer_fallback = self
                    .session
                    .fallback_chain
                    .as_ref()
                    .zip(last_err.downcast_ref::<CliError>())
                    .map(|(chain, err)| chain.should_rotate(err))
                    .unwrap_or(false);
                if !prefer_fallback {
                    if let Some(cli_err) = last_err.downcast_ref::<CliError>() {
                        if cli_err.is_retryable() {
                            let delay = cli_err.retry_delay();
                            // Suppress the raw stderr notice while the full-screen
                            // TUI owns the terminal (it would bleed into the live
                            // spinner frame); exec/REPL still surface it.
                            if !crate::tui::tui_active() {
                                eprintln!(
                                    "  {}",
                                    ts::warning(format!(
                                        "Retrying in {}s: {}",
                                        delay.as_secs(),
                                        cli_err
                                    ))
                                );
                            }
                            tokio::time::sleep(delay).await;
                            match models::stream_completion(
                                self.config,
                                &self.session.provider,
                                &self.session.model,
                                &self.session.messages,
                                self.max_tokens,
                                Some(&self.tool_defs),
                                self.session.continuation_sink(),
                                self.session.thinking_budget_tokens,
                            )
                            .await
                            {
                                Ok(r) => recovered = Some(r),
                                Err(retry_err) => last_err = retry_err,
                            }
                        }
                    }
                }
                if recovered.is_none() {
                    if let Some(chain) = self.session.fallback_chain.clone() {
                        let cli_err_kind = last_err
                            .downcast_ref::<CliError>()
                            .map(|c| (c.kind(), chain.should_rotate(c)));
                        if let Some((kind, true)) = cli_err_kind {
                            for fallback_model in chain.tail() {
                                let prev_model = self.session.model.clone();
                                let prev_provider = self.session.provider.clone();
                                // Privacy-boundary guard: mutate provider/model and then
                                // validate the boundary BEFORE calling stream_completion.
                                // If the session is Local and the fallback is a cloud provider,
                                // restore state and break fail-closed — never egress Local
                                // session history to the network silently.
                                let Some(fallback_provider) =
                                    crate::models::try_detect_provider(fallback_model)
                                else {
                                    last_err = anyhow::anyhow!(
                                        "Fallback model '{}' is not recognized; refusing silent provider routing.",
                                        fallback_model
                                    );
                                    continue;
                                };
                                self.session.model = fallback_model.clone();
                                self.session.provider = fallback_provider;
                                if let Err(boundary_err) = self.session.validate_privacy_boundary() {
                                    // Restore state so the session remains coherent.
                                    self.session.model = prev_model;
                                    self.session.provider = prev_provider;
                                    last_err = boundary_err;
                                    break;
                                }
                                eprintln!(
                                    "  {}",
                                    ts::warning(format!(
                                        "↘ Falling back: {} → {} ({})",
                                        prev_model, fallback_model, kind
                                    ))
                                );
                                if let Some(sink) = self.session.on_fallback.as_ref() {
                                    (sink.0)(&prev_model, fallback_model, kind);
                                }
                                let fallback_call = if self.session.demo_mode {
                                    let demo_text = format!(
                                        "[DEMO MODE] Synthesized response from `{}` — no real \
                                         API call was made. The fallback chain is exercised but \
                                         the upstream provider was not contacted.",
                                        fallback_model
                                    );
                                    // In json-events mode emit as a MessageDelta;
                                    // in human mode use the raw print! path.
                                    if self.session.json_events {
                                        crate::agent_events::AgentEvent::MessageDelta {
                                            session_id: self.session.json_session_id.clone(),
                                            text: demo_text.clone(),
                                        }
                                        .emit_stdout();
                                    } else {
                                        print!("{}", demo_text);
                                    }
                                    Ok(crate::models::CompletionResult {
                                        text: demo_text,
                                        tool_calls: vec![],
                                        input_tokens: 0,
                                        output_tokens: 0,
                                        cache_read_input_tokens: 0,
                                        cache_creation_input_tokens: 0,
                                        via_subscription: true,
                                        stop_reason: Some("end_turn".to_string()),
                                        reasoning_output_tokens: 0,
                                    })
                                } else {
                                    models::stream_completion(
                                        self.config,
                                        &self.session.provider,
                                        &self.session.model,
                                        &self.session.messages,
                                        self.max_tokens,
                                        Some(&self.tool_defs),
                                        self.session.continuation_sink(),
                                        self.session.thinking_budget_tokens,
                                    )
                                    .await
                                };
                                match fallback_call {
                                    Ok(r) => {
                                        recovered = Some(r);
                                        break;
                                    }
                                    Err(rotate_err) => last_err = rotate_err,
                                }
                            }
                        }
                    }
                }
                match recovered {
                    Some(r) => r,
                    None => return Err(last_err),
                }
            }
        };

        Ok(completion_from_result(result))
    }

    /// Continuation completion after a tool batch: retry-only recovery (no
    /// fallback rotation) with the privacy-boundary re-validated first — the
    /// provider may have been mutated by the first call's fallback loop, and a
    /// Local session must never stream its history to a cloud provider.
    async fn complete_continuation(&mut self) -> Result<Completion> {
        self.session.validate_privacy_boundary()?;
        let continuation = match models::stream_completion(
            self.config,
            &self.session.provider,
            &self.session.model,
            &self.session.messages,
            self.max_tokens,
            Some(&self.tool_defs),
            self.session.continuation_sink(),
            self.session.thinking_budget_tokens,
        )
        .await
        {
            Ok(r) => r,
            Err(e) => {
                if let Some(cli_err) = e.downcast_ref::<CliError>() {
                    if cli_err.is_retryable() {
                        let delay = cli_err.retry_delay();
                        // Suppress the raw stderr notice under the TUI (would
                        // corrupt the live spinner frame); exec/REPL print it.
                        if !crate::tui::tui_active() {
                            eprintln!(
                                "  {}",
                                ts::warning(format!(
                                    "Retrying in {}s: {}",
                                    delay.as_secs(),
                                    cli_err
                                ))
                            );
                        }
                        tokio::time::sleep(delay).await;
                        models::stream_completion(
                            self.config,
                            &self.session.provider,
                            &self.session.model,
                            &self.session.messages,
                            self.max_tokens,
                            Some(&self.tool_defs),
                            self.session.continuation_sink(),
                            self.session.thinking_budget_tokens,
                        )
                        .await?
                    } else {
                        return Err(e);
                    }
                } else {
                    return Err(e);
                }
            }
        };
        Ok(completion_from_result(continuation))
    }

    /// Shared per-tool pre-dispatch check (availability, invalid args, plan-mode
    /// gate on the sequential path, `PreToolUse` hooks, and tool-filters).
    async fn prepare_tool_inner(&mut self, call: &ToolCallResponse, mode: DispatchMode) -> Prepared {
        if !self.available_tool_names.contains(call.name.as_str()) {
            return Prepared::PreEmpted {
                block: ResultBlock {
                    tool_use_id: call.id.clone(),
                    content: format!("Tool '{}' is not available in this session.", call.name),
                    is_error: true,
                },
            };
        }
        if let Some(block) = invalid_tool_arguments_block(call) {
            return Prepared::PreEmpted {
                block: content_block_to_result(block),
            };
        }

        // Plan-mode mutating-tool gate applies to the sequential path (the
        // concurrent read-only batch never contains mutating tools).
        if mode == DispatchMode::Sequential
            && matches!(
                self.session.permission_mode,
                crate::cli_options::PermissionMode::Plan
            )
            && !self.session.plan_approved
            && self.plan_mode_mutating_names.contains(call.name.as_str())
        {
            let payload = serde_json::json!({
                "ok": false,
                "error": "plan_mode_unapproved",
                "message": "Plan mode is active and the current plan has not been approved. Call `update_plan` with a complete ordered plan, then await user approval. Do NOT call mutating tools yet."
            });
            return Prepared::PreEmpted {
                block: ResultBlock {
                    tool_use_id: call.id.clone(),
                    content: payload.to_string(),
                    is_error: true,
                },
            };
        }

        let hcfg = self.session.hooks_config.clone();
        let effective_args = match run_pre_tool_use_hooks(&hcfg, &self.session.model, call).await {
            PreToolUseOutcome::Proceed(args) => args,
            PreToolUseOutcome::Blocked(reason_text) => {
                if !self.session.quiet {
                    eprintln!(
                        "  {} {} blocked by hook: {}",
                        "->".dimmed(),
                        call.name.bold(),
                        ts::danger(&reason_text)
                    );
                }
                return Prepared::PreEmpted {
                    block: ResultBlock {
                        tool_use_id: call.id.clone(),
                        content: format!("Tool execution blocked by hook: {reason_text}"),
                        is_error: true,
                    },
                };
            }
            PreToolUseOutcome::Stopped => {
                if !self.session.quiet {
                    eprintln!("  {} {} stopped by hook", "->".dimmed(), call.name.bold());
                }
                return Prepared::PreEmpted {
                    block: ResultBlock {
                        tool_use_id: call.id.clone(),
                        content: "Tool execution stopped by hook.".to_string(),
                        is_error: true,
                    },
                };
            }
        };

        let legacy_args = value_to_legacy_args(&effective_args);
        if let Err(violation) = crate::tool_filters::ensure_tool_call_allowed(
            &call.name,
            &legacy_args,
            self.session.allowed_tools.as_deref(),
            &self.session.disallowed_tools,
        ) {
            return Prepared::PreEmpted {
                block: ResultBlock {
                    tool_use_id: call.id.clone(),
                    content: serde_json::json!({
                        "ok": false,
                        "error": "tool_filter_violation",
                        "rule": violation.rule,
                        "message": violation.reason,
                    })
                    .to_string(),
                    is_error: true,
                },
            };
        }

        Prepared::Proceed {
            args: effective_args,
        }
    }
}

#[async_trait]
impl TurnHost for TurnHostAdapter<'_> {
    async fn complete(
        &mut self,
        phase: TurnPhase,
        _sink: &mut (dyn FnMut(StreamEvent) + Send),
    ) -> Result<Completion> {
        // The CLI renders assistant text app-locally inside these calls (the
        // caller's `on_chunk` for the first completion, `continuation_sink()`
        // thereafter) to preserve byte-for-byte incremental output, so the
        // engine's stream sink is intentionally unused here.
        match phase {
            TurnPhase::First => self.complete_first().await,
            TurnPhase::Continuation => self.complete_continuation().await,
        }
    }

    fn record_assistant(&mut self, completion: &Completion) {
        let msg = build_assistant_message(&completion.outcome.text, &completion.outcome.tool_calls);
        self.session.messages.push(msg);
    }

    fn classify(&self, call: &ToolCallResponse) -> ToolClass {
        if call.name == "task" {
            return ToolClass::Task;
        }
        let concurrent_eligible = self.session.skip_permissions
            && self.concurrency_safe_names.contains(&call.name)
            && !is_team_tool(&call.name)
            && !call.name.starts_with("mcp_")
            && call.name != "task";
        if concurrent_eligible {
            ToolClass::ConcurrentEligible
        } else {
            ToolClass::Other
        }
    }

    async fn run_task_batch(&mut self, calls: &[ToolCallResponse]) -> Vec<ResultBlock> {
        let hcfg = self.session.hooks_config.clone();
        let mut result_blocks: Vec<ResultBlock> = Vec::new();

        // Spawn all task tool calls concurrently via subagent manager
        let mut task_spawn_results = Vec::new();
        for tc in calls {
            if !self.available_tool_names.contains(tc.name.as_str()) {
                result_blocks.push(ResultBlock {
                    tool_use_id: tc.id.clone(),
                    content: format!("Tool '{}' is not available in this session.", tc.name),
                    is_error: true,
                });
                continue;
            }
            if let Some(block) = invalid_tool_arguments_block(tc) {
                result_blocks.push(content_block_to_result(block));
                continue;
            }

            if matches!(
                self.session.permission_mode,
                crate::cli_options::PermissionMode::Plan
            ) && !self.session.plan_approved
            {
                let payload = serde_json::json!({
                    "ok": false,
                    "error": "plan_mode_unapproved",
                    "message": "Plan mode is active and the current plan has not been approved. Call `update_plan` first; subagent tasks are blocked until the user approves."
                });
                result_blocks.push(ResultBlock {
                    tool_use_id: tc.id.clone(),
                    content: payload.to_string(),
                    is_error: true,
                });
                continue;
            }

            let effective_args = match run_pre_tool_use_hooks(&hcfg, &self.session.model, tc).await {
                PreToolUseOutcome::Proceed(args) => args,
                PreToolUseOutcome::Blocked(reason_text) => {
                    if !self.session.quiet {
                        eprintln!(
                            "  {} {} blocked by hook: {}",
                            "->".dimmed(),
                            tc.name.bold(),
                            ts::danger(&reason_text)
                        );
                    }
                    result_blocks.push(ResultBlock {
                        tool_use_id: tc.id.clone(),
                        content: format!("Tool execution blocked by hook: {reason_text}"),
                        is_error: true,
                    });
                    continue;
                }
                PreToolUseOutcome::Stopped => {
                    if !self.session.quiet {
                        eprintln!("  {} {} stopped by hook", "->".dimmed(), tc.name.bold());
                    }
                    result_blocks.push(ResultBlock {
                        tool_use_id: tc.id.clone(),
                        content: "Tool execution stopped by hook.".to_string(),
                        is_error: true,
                    });
                    continue;
                }
            };

            let legacy_args = value_to_legacy_args(&effective_args);
            if let Err(violation) = crate::tool_filters::ensure_tool_call_allowed(
                &tc.name,
                &legacy_args,
                self.session.allowed_tools.as_deref(),
                &self.session.disallowed_tools,
            ) {
                result_blocks.push(ResultBlock {
                    tool_use_id: tc.id.clone(),
                    content: serde_json::json!({
                        "ok": false,
                        "error": "tool_filter_violation",
                        "rule": violation.rule,
                        "message": violation.reason,
                    })
                    .to_string(),
                    is_error: true,
                });
                continue;
            }

            let description = effective_args
                .get("description")
                .and_then(|v| v.as_str())
                .unwrap_or("subagent task")
                .to_string();
            let prompt = effective_args
                .get("prompt")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            if self.session.subagent_manager.is_none() {
                self.session.subagent_manager = Some(crate::subagent::SubagentManager::new(
                    self.config.clone(),
                    self.session.model.clone(),
                    crate::context::gather_system_context(),
                    self.session.skip_permissions,
                ));
            }

            hooks::run_hooks(
                &hcfg,
                hooks::HookEvent::SubagentStart,
                &hooks::HookInput {
                    event: "SubagentStart".to_string(),
                    session_id: None,
                    model: Some(self.session.model.clone()),
                    tool_name: Some(tc.name.clone()),
                    tool_args: Some(tc.arguments.clone()),
                    tool_output: None,
                    message: Some(format!(
                        "subagent_spawn description={:?} prompt_len={}",
                        description,
                        prompt.len()
                    )),
                    tool_execution: None,
                },
            )
            .await;

            let mgr = self
                .session
                .subagent_manager
                .as_ref()
                .expect("subagent_manager was just initialized above");
            let id_result = mgr.spawn(&description, &prompt).await;

            hooks::run_hooks(
                &hcfg,
                hooks::HookEvent::SubagentStop,
                &hooks::HookInput {
                    event: "SubagentStop".to_string(),
                    session_id: None,
                    model: Some(self.session.model.clone()),
                    tool_name: Some(tc.name.clone()),
                    tool_args: Some(tc.arguments.clone()),
                    tool_output: id_result
                        .as_ref()
                        .ok()
                        .map(|id| format!("subagent_id={}", id)),
                    message: id_result
                        .as_ref()
                        .err()
                        .map(|err| format!("spawn_error: {:#}", err)),
                    tool_execution: None,
                },
            )
            .await;

            task_spawn_results.push((tc.id.clone(), tc.name.clone(), effective_args, id_result));
        }

        if !task_spawn_results.is_empty() {
            if let Some(ref mgr) = self.session.subagent_manager {
                mgr.wait_all().await;
            }
        }

        for (tool_use_id, tool_name, tool_args, id_result) in task_spawn_results {
            let tool_result = match id_result {
                Ok(ref id) => {
                    if let Some(ref mgr) = self.session.subagent_manager {
                        if let Some(sa_result) = mgr.get_result(id).await {
                            let mut output = sa_result.output;
                            if !sa_result.files_modified.is_empty() {
                                output.push_str("\n\nFiles modified:\n");
                                for f in &sa_result.files_modified {
                                    output.push_str(&format!("  - {}\n", f));
                                }
                            }
                            crate::tools::ToolResult {
                                tool_name: "task".to_string(),
                                success: true,
                                output,
                            }
                        } else if let Some(sa_status) = mgr.get_status(id).await {
                            crate::tools::ToolResult {
                                tool_name: "task".to_string(),
                                success: false,
                                output: format!("Subagent {} finished with status: {}", id, sa_status),
                            }
                        } else {
                            crate::tools::ToolResult {
                                tool_name: "task".to_string(),
                                success: false,
                                output: format!("Subagent {} not found.", id),
                            }
                        }
                    } else {
                        crate::tools::ToolResult {
                            tool_name: "task".to_string(),
                            success: false,
                            output: "Subagent manager not initialized.".to_string(),
                        }
                    }
                }
                Err(e) => crate::tools::ToolResult {
                    tool_name: "task".to_string(),
                    success: false,
                    output: format!("Failed to spawn subagent: {:#}", e),
                },
            };

            let sa_display_status = if tool_result.success {
                ts::success("success").to_string()
            } else {
                ts::danger("failed").to_string()
            };
            eprintln!(
                "  {} {} [{}]",
                "->".dimmed(),
                tool_name.bold(),
                sa_display_status
            );

            hooks::run_hooks(
                &hcfg,
                hooks::HookEvent::PostToolUse,
                &hooks::HookInput {
                    event: "PostToolUse".to_string(),
                    session_id: None,
                    model: Some(self.session.model.clone()),
                    tool_name: Some(tool_name.clone()),
                    tool_args: Some(tool_args.clone()),
                    tool_output: Some(tool_result.output.clone()),
                    message: None,
                    tool_execution: None,
                },
            )
            .await;

            hooks::run_hooks(
                &hcfg,
                hooks::HookEvent::ToolResultPersist,
                &hooks::HookInput {
                    event: "ToolResultPersist".to_string(),
                    session_id: None,
                    model: Some(self.session.model.clone()),
                    tool_name: Some(tool_name),
                    tool_args: Some(tool_args),
                    tool_output: Some(tool_result.output.clone()),
                    message: None,
                    tool_execution: None,
                },
            )
            .await;

            result_blocks.push(ResultBlock {
                tool_use_id,
                content: tool_result.output,
                is_error: !tool_result.success,
            });
        }

        result_blocks
    }

    async fn prepare_tool(&mut self, call: &ToolCallResponse, mode: DispatchMode) -> Prepared {
        self.prepare_tool_inner(call, mode).await
    }

    fn parallel_future(&self, prepared: PreparedCall) -> ExecFuture {
        let opts = crate::tools::ToolExecOptions {
            require_confirmation: !self.session.skip_permissions,
            auto_approve_safe: self.session.auto_approve_safe,
            quiet: self.session.quiet,
            approval_callback: self
                .session
                .on_tool_approval
                .as_ref()
                .map(|sink| sink.0.clone()),
        };
        let legacy = super::executor::ToolCall {
            name: prepared.name.clone(),
            args: value_to_legacy_args(&prepared.args),
        };
        Box::pin(async move {
            match crate::tools::execute_tool_with_opts(&legacy, &opts).await {
                Ok(r) => ExecResult {
                    ok: r.success,
                    output: r.output,
                },
                Err(e) => ExecResult {
                    ok: false,
                    output: format!("tool error: {:#}", e),
                },
            }
        })
    }

    async fn finish_parallel_tool(
        &mut self,
        prepared: PreparedCall,
        result: ExecResult,
    ) -> ResultBlock {
        let hcfg = self.session.hooks_config.clone();
        hooks::run_hooks(
            &hcfg,
            hooks::HookEvent::PostToolUse,
            &hooks::HookInput {
                event: "PostToolUse".to_string(),
                session_id: None,
                model: Some(self.session.model.clone()),
                tool_name: Some(prepared.name.clone()),
                tool_args: Some(prepared.args.clone()),
                tool_output: Some(result.output.clone()),
                message: None,
                tool_execution: None,
            },
        )
        .await;

        hooks::run_hooks(
            &hcfg,
            hooks::HookEvent::ToolResultPersist,
            &hooks::HookInput {
                event: "ToolResultPersist".to_string(),
                session_id: None,
                model: Some(self.session.model.clone()),
                tool_name: Some(prepared.name),
                tool_args: Some(prepared.args),
                tool_output: Some(result.output.clone()),
                message: None,
                tool_execution: None,
            },
        )
        .await;

        ResultBlock {
            tool_use_id: prepared.id,
            content: result.output,
            is_error: !result.ok,
        }
    }

    async fn execute_sequential_tool(
        &mut self,
        call: &ToolCallResponse,
        args: serde_json::Value,
    ) -> ExecResult {
        let legacy = super::executor::ToolCall {
            name: call.name.clone(),
            args: value_to_legacy_args(&args),
        };

        let tool_result = if call.name == "update_plan" {
            let payload = self.session.handle_update_plan(&args);
            let success = payload.get("ok").and_then(|v| v.as_bool()).unwrap_or(false);
            let message = payload
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or("plan handled")
                .to_string();
            if !self.session.quiet {
                let path_disp = self
                    .session
                    .current_plan_path
                    .as_ref()
                    .map(|p| p.display().to_string())
                    .unwrap_or_default();
                eprintln!(
                    "  {} {} ({}{})",
                    "->".dimmed(),
                    "update_plan".bold(),
                    message,
                    if path_disp.is_empty() {
                        String::new()
                    } else {
                        format!(" -> {path_disp}")
                    }
                );
            }
            crate::tools::ToolResult {
                tool_name: "update_plan".to_string(),
                success,
                output: payload.to_string(),
            }
        } else if is_team_tool(&call.name) {
            // `None`: this orchestrator session has no per-teammate identity yet.
            // Pass the executing teammate's name here once teammate-scoped
            // sessions exist to enforce the message sender.
            match execute_team_tool(&self.session.team_manager, &call.name, &legacy.args, None).await
            {
                Ok(r) => r,
                Err(e) => crate::tools::ToolResult {
                    tool_name: call.name.clone(),
                    success: false,
                    output: format!("tool error: {:#}", e),
                },
            }
        } else if call.name.starts_with("mcp_") {
            match execute_mcp_tool(&mut self.session.mcp_manager, &call.name, args.clone()).await {
                Ok(r) => r,
                Err(e) => crate::tools::ToolResult {
                    tool_name: call.name.clone(),
                    success: false,
                    output: format!("tool error: {:#}", e),
                },
            }
        } else {
            let opts = crate::tools::ToolExecOptions {
                require_confirmation: !self.session.skip_permissions,
                auto_approve_safe: self.session.auto_approve_safe,
                quiet: self.session.quiet,
                approval_callback: self
                    .session
                    .on_tool_approval
                    .as_ref()
                    .map(|sink| sink.0.clone()),
            };
            match crate::tools::execute_tool_with_opts(&legacy, &opts).await {
                Ok(r) => r,
                Err(e) => crate::tools::ToolResult {
                    tool_name: call.name.clone(),
                    success: false,
                    output: format!("tool error: {:#}", e),
                },
            }
        };

        ExecResult {
            ok: tool_result.success,
            output: tool_result.output,
        }
    }

    async fn finish_sequential_tool(
        &mut self,
        call: &ToolCallResponse,
        args: serde_json::Value,
        result: ExecResult,
    ) -> ResultBlock {
        let hcfg = self.session.hooks_config.clone();
        let post_results = hooks::run_hooks(
            &hcfg,
            hooks::HookEvent::PostToolUse,
            &hooks::HookInput {
                event: "PostToolUse".to_string(),
                session_id: None,
                model: Some(self.session.model.clone()),
                tool_name: Some(call.name.clone()),
                tool_args: Some(args.clone()),
                tool_output: Some(result.output.clone()),
                message: None,
                tool_execution: None,
            },
        )
        .await;

        let post_t = hooks::aggregate_transformers(&post_results);
        let final_output = post_t.updated_mcp_tool_output.unwrap_or(result.output);
        if let Some(ctx) = post_t.additional_context {
            self.hook_additional_contexts.push(ctx);
        }

        hooks::run_hooks(
            &hcfg,
            hooks::HookEvent::ToolResultPersist,
            &hooks::HookInput {
                event: "ToolResultPersist".to_string(),
                session_id: None,
                model: Some(self.session.model.clone()),
                tool_name: Some(call.name.clone()),
                tool_args: Some(args.clone()),
                tool_output: Some(final_output.clone()),
                message: None,
                tool_execution: None,
            },
        )
        .await;

        ResultBlock {
            tool_use_id: call.id.clone(),
            content: final_output,
            is_error: !result.ok,
        }
    }

    async fn commit_tool_results(&mut self, blocks: Vec<ResultBlock>, iteration: usize) {
        let content_blocks: Vec<ContentBlock> = blocks
            .into_iter()
            .map(|b| ContentBlock::ToolResult {
                tool_use_id: b.tool_use_id,
                content: b.content,
                is_error: b.is_error,
            })
            .collect();
        self.session
            .messages
            .push(Message::blocks("user", content_blocks));

        hooks::run_hooks(
            &self.session.hooks_config,
            hooks::HookEvent::PostToolBatch,
            &hooks::HookInput {
                event: "PostToolBatch".to_string(),
                session_id: None,
                model: Some(self.session.model.clone()),
                tool_name: None,
                tool_args: None,
                tool_output: None,
                message: Some(format!("iteration={iteration}")),
                tool_execution: None,
            },
        )
        .await;

        if !self.hook_additional_contexts.is_empty() {
            let merged = std::mem::take(&mut self.hook_additional_contexts).join("\n\n");
            self.session.messages.push(Message::text("system", merged));
        }

        eprintln!();
    }

    async fn confirm_tool_runaway(
        &mut self,
        tracker: &mut RunawayTracker,
        calls: &[ToolCallResponse],
    ) -> LoopControl {
        let strike = tracker.bump_strike();

        if strike >= 2 {
            eprintln!(
                "\n{}",
                ts::danger("  Auto-stopping: second loop detected in this session.")
            );
            hooks::run_hooks(
                &self.session.hooks_config,
                hooks::HookEvent::StopFailure,
                &hooks::HookInput {
                    event: "StopFailure".to_string(),
                    session_id: None,
                    model: Some(self.session.model.clone()),
                    tool_name: None,
                    tool_args: None,
                    tool_output: None,
                    message: Some("loop-detection auto-stop".to_string()),
                    tool_execution: None,
                },
            )
            .await;
            return LoopControl::Break;
        }

        let loop_msg = format!(
            "  Warning: Detected {} identical consecutive tool calls ({}). Possible loop. [strike {}/2]",
            agiworkforce_agent_core::LOOP_DETECTION_THRESHOLD,
            calls.first().map(|tc| tc.name.as_str()).unwrap_or("unknown"),
            strike
        );
        eprintln!("\n{}", ts::warning(&loop_msg));
        hooks::run_hooks(
            &self.session.hooks_config,
            hooks::HookEvent::Notification,
            &hooks::HookInput {
                event: "Notification".to_string(),
                session_id: None,
                model: Some(self.session.model.clone()),
                tool_name: None,
                tool_args: None,
                tool_output: None,
                message: Some(loop_msg),
                tool_execution: None,
            },
        )
        .await;

        hooks::run_hooks(
            &self.session.hooks_config,
            hooks::HookEvent::PermissionRequest,
            &hooks::HookInput {
                event: "PermissionRequest".to_string(),
                session_id: None,
                model: Some(self.session.model.clone()),
                tool_name: calls.first().map(|tc| tc.name.clone()),
                tool_args: calls.first().map(|tc| tc.arguments.clone()),
                tool_output: None,
                message: Some("loop-detection confirmation".to_string()),
                tool_execution: None,
            },
        )
        .await;

        let confirmed = dialoguer::Confirm::new()
            .with_prompt("Continue with these tool calls?")
            .default(false)
            .interact()
            .unwrap_or(false);

        if !confirmed {
            eprintln!("{}", "  Agentic loop stopped by user.".dimmed());
            hooks::run_hooks(
                &self.session.hooks_config,
                hooks::HookEvent::PermissionDenied,
                &hooks::HookInput {
                    event: "PermissionDenied".to_string(),
                    session_id: None,
                    model: Some(self.session.model.clone()),
                    tool_name: calls.first().map(|tc| tc.name.clone()),
                    tool_args: calls.first().map(|tc| tc.arguments.clone()),
                    tool_output: None,
                    message: Some("user rejected loop-detection confirmation".to_string()),
                    tool_execution: None,
                },
            )
            .await;
            return LoopControl::Break;
        }

        tracker.clear_recent();
        LoopControl::Continue
    }

    async fn confirm_content_loop(
        &mut self,
        tracker: &mut RunawayTracker,
        _text: &str,
    ) -> LoopControl {
        let strike = tracker.bump_strike();

        if strike >= 2 {
            eprintln!(
                "\n{}",
                ts::danger("  Auto-stopping: second content loop detected in this session.")
            );
            return LoopControl::Break;
        }

        eprintln!(
            "\n{}",
            ts::warning(format!(
                "  Warning: Detected repetitive content in LLM response. Possible content loop. [strike {}/2]",
                strike
            ))
        );

        let confirmed = dialoguer::Confirm::new()
            .with_prompt("Continue the agentic loop?")
            .default(false)
            .interact()
            .unwrap_or(false);

        if !confirmed {
            eprintln!("{}", "  Agentic loop stopped by user.".dimmed());
            return LoopControl::Break;
        }

        LoopControl::Continue
    }

    fn turn_cost_usd(&self, totals: &agiworkforce_agent_core::UsageTotals) -> f64 {
        crate::cost_ledger::dollars_for(
            &self.session.model,
            totals.input_tokens,
            totals.output_tokens,
            totals.cache_read_tokens,
            totals.cache_creation_tokens,
        )
    }

    fn on_event(&mut self, event: &TurnEvent) {
        match event {
            TurnEvent::IterationStarted {
                tool_count,
                iteration,
                max,
            } => {
                eprintln!(
                    "\n{}",
                    format!(
                        "  Executing {} tool{}... (iteration {}/{})",
                        tool_count,
                        if *tool_count == 1 { "" } else { "s" },
                        iteration + 1,
                        max
                    )
                    .dimmed()
                );
            }
            TurnEvent::ParallelBatchStarted { names } => {
                if !self.session.quiet {
                    eprintln!(
                        "  {} ({})",
                        format!("running {} read-only tools in parallel", names.len()).dimmed(),
                        names.join(", ")
                    );
                }
            }
            TurnEvent::ToolStarted { id, name, args, .. } => {
                emit_tool_event(
                    self.session.on_tool_event.as_ref(),
                    crate::tui::app_event::TuiAppEvent::ToolStarted {
                        call_id: id.clone(),
                        name: name.clone(),
                        summary: tool_event_summary(name, args),
                    },
                );
                if self.session.json_events {
                    crate::agent_events::AgentEvent::RunningTool {
                        session_id: self.session.json_session_id.clone(),
                        name: name.clone(),
                        args_redacted: crate::agent_events::redact_args(&args.to_string()),
                    }
                    .emit_stdout();
                }
            }
            TurnEvent::ToolFinished {
                id,
                name,
                ok,
                output,
                duration_ms,
                ..
            } => {
                if !self.session.quiet {
                    let status = if *ok {
                        ts::success("success").to_string()
                    } else {
                        ts::danger("failed").to_string()
                    };
                    eprintln!("  {} {} [{}]", "->".dimmed(), name.bold(), status);
                }
                if self.session.json_events {
                    crate::agent_events::AgentEvent::ToolResult {
                        session_id: self.session.json_session_id.clone(),
                        name: name.clone(),
                        duration_ms: *duration_ms,
                        ok: *ok,
                    }
                    .emit_stdout();
                }
                emit_tool_event(
                    self.session.on_tool_event.as_ref(),
                    crate::tui::app_event::TuiAppEvent::ToolCompleted {
                        call_id: id.clone(),
                        status: if *ok {
                            crate::tui::app_event::ToolStatus::Succeeded
                        } else {
                            crate::tui::app_event::ToolStatus::Failed
                        },
                        output: output.chars().take(200).collect::<String>(),
                    },
                );
            }
            TurnEvent::BudgetExceeded {
                cumulative_usd,
                cap_usd,
            } => {
                eprintln!(
                    "\n{}",
                    ts::warning(format!(
                        "  Budget cap reached: ${:.4} >= ${:.4}. Stopping agent loop.",
                        cumulative_usd, cap_usd
                    ))
                );
                // Emit the machine-readable event via the injected callback.
                // lib.rs wires this only when --json-events is active so that
                // stdout is never polluted in text/json-pretty output modes.
                if let Some(ref sink) = self.session.on_budget_exhausted {
                    (sink.0)(*cumulative_usd, *cap_usd);
                }
            }
            // Text/reasoning deltas are rendered app-locally inside `complete`;
            // the fallback rotation fires the session's own `on_fallback` sink
            // there; `TurnComplete` is observed post-loop by the orchestrator.
            TurnEvent::TextDelta { .. }
            | TurnEvent::ReasoningDelta { .. }
            | TurnEvent::FallbackRotated { .. }
            | TurnEvent::TurnComplete { .. } => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn pre_tool_hook_config(command: &str) -> hooks::HooksConfig {
        let mut hooks_by_event = HashMap::new();
        hooks_by_event.insert(
            "PreToolUse".to_string(),
            vec![hooks::Hook {
                command: command.to_string(),
                args: Vec::new(),
                timeout: 5,
                blocking: true,
                matcher: None,
                if_condition: None,
            }],
        );
        hooks::HooksConfig {
            hooks: hooks_by_event,
        }
    }

    fn tool_call(name: &str, arguments: serde_json::Value) -> ToolCallResponse {
        ToolCallResponse {
            id: "toolu-test".to_string(),
            name: name.to_string(),
            arguments,
        }
    }

    // -----------------------------------------------------------------------
    // Privacy-boundary invariant tests (no-silent-egress)
    //
    // These verify the LOCKED rule: a Local session must never reach
    // stream_completion on a cloud provider, even if the fallback loop mutates
    // self.provider to cloud mid-flight.
    //
    // Before the fix, the fallback loop mutated self.provider and called
    // stream_completion without re-running validate_privacy_boundary.  The
    // guards in the fallback loop and before every continuation call are what
    // these tests exercise as regression verifiers.
    // -----------------------------------------------------------------------

    fn make_local_session() -> AgentSession {
        let ctx = crate::context::SystemContext {
            cwd: "/tmp".to_string(),
            git_branch: None,
            git_status_summary: None,
            git_remote_url: None,
            project_type: None,
            project_language: None,
            ci_providers: vec![],
            monorepo_type: None,
            package_manager: None,
            containerization: vec![],
            editor_configs: vec![],
            os: "test".to_string(),
            shell: "test".to_string(),
        };
        // "llama3" routes to Ollama(Local) -> PrivacyMode::Local
        AgentSession::new("llama3", &ctx, None)
    }

    /// Simulates the pre-fix fallback-loop provider mutation (setting self.provider
    /// to Anthropic on a Local session) and asserts that validate_privacy_boundary
    /// returns an error — proving the guard prevents stream_completion from being
    /// reached with cloud credentials on a Local session.
    #[test]
    fn local_session_cloud_fallback_blocked_by_privacy_boundary() {
        let mut session = make_local_session();

        // Confirm the session starts as Local.
        assert_eq!(session.privacy_mode, crate::agent::PrivacyMode::Local);
        assert!(session.validate_privacy_boundary().is_ok());

        // Simulate the pre-fix fallback loop mutation: set provider to cloud.
        let cloud_provider = crate::models::detect_provider("claude-sonnet-4-6");
        session.model = "claude-sonnet-4-6".to_string();
        session.provider = cloud_provider;

        // The guard must catch this — stream_completion must never be reached.
        let boundary_result = session.validate_privacy_boundary();
        assert!(
            boundary_result.is_err(),
            "privacy boundary must block a Local session whose provider was mutated to cloud; \
             this is the no-silent-egress regression test"
        );

        let err_msg = format!("{}", boundary_result.unwrap_err());
        assert!(
            err_msg.contains("Privacy boundary blocked"),
            "error must identify the boundary violation; got: {err_msg}"
        );
        assert!(
            err_msg.contains("claude-sonnet-4-6"),
            "error must name the offending model; got: {err_msg}"
        );
    }

    /// Inverse: a Local session whose provider is mutated to another local Ollama
    /// model must NOT be blocked — local-to-local fallback is always allowed.
    #[test]
    fn local_session_local_fallback_not_blocked() {
        let mut session = make_local_session();
        assert_eq!(session.privacy_mode, crate::agent::PrivacyMode::Local);

        // "llama3.1:8b" -> Ollama(Local), confirmed in provider_dispatch tests.
        session.model = "llama3.1:8b".to_string();
        session.provider = crate::models::detect_provider("llama3.1:8b");

        assert!(
            session.validate_privacy_boundary().is_ok(),
            "Local session falling back to a local Ollama model must NOT be blocked"
        );
    }

    #[tokio::test]
    async fn pre_tool_use_outcome_blocks_when_hook_blocks() {
        let config =
            pre_tool_hook_config("printf '%s' '{\"decision\":\"block\",\"reason\":\"policy\"}'");
        let outcome = run_pre_tool_use_hooks(
            &config,
            "claude-sonnet-4-6",
            &tool_call("read_file", serde_json::json!({"path":"README.md"})),
        )
        .await;

        assert_eq!(outcome, PreToolUseOutcome::Blocked("policy".to_string()));
    }

    #[tokio::test]
    async fn pre_tool_use_outcome_stops_when_hook_stops() {
        let config = pre_tool_hook_config("printf '%s' '{\"continue\":false}'");
        let outcome = run_pre_tool_use_hooks(
            &config,
            "claude-sonnet-4-6",
            &tool_call("read_file", serde_json::json!({"path":"README.md"})),
        )
        .await;

        assert_eq!(outcome, PreToolUseOutcome::Stopped);
    }

    #[tokio::test]
    async fn pre_tool_use_outcome_applies_updated_input() {
        let config =
            pre_tool_hook_config("printf '%s' '{\"updated_input\":{\"path\":\"TODO.md\"}}'");
        let outcome = run_pre_tool_use_hooks(
            &config,
            "claude-sonnet-4-6",
            &tool_call("read_file", serde_json::json!({"path":"README.md"})),
        )
        .await;

        assert_eq!(
            outcome,
            PreToolUseOutcome::Proceed(serde_json::json!({"path":"TODO.md"}))
        );
    }
}
