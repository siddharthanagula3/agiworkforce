use anyhow::Result;
use colored::Colorize;
use futures_util::future::join_all;

use crate::compaction;
use crate::config::CliConfig;
use crate::errors::CliError;
use crate::hooks;
use crate::models::{self, ContentBlock, Message, StreamCallback};

use super::executor::{
    detect_content_loop, hash_tool_call, tool_call_to_legacy, value_to_legacy_args,
    LOOP_DETECTION_THRESHOLD, MAX_AGENTIC_ITERATIONS,
};
use super::history::build_assistant_message;
use super::tools::{execute_mcp_tool, execute_team_tool, is_mutating_tool, is_team_tool};
use super::{AgentSession, TurnResult};

impl AgentSession {
    /// Send a user message and run the full agentic loop.
    pub async fn send(
        &mut self,
        config: &CliConfig,
        user_input: &str,
        on_chunk: StreamCallback,
    ) -> Result<TurnResult> {
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
                format!("Warning: {}", compaction::format_context_report(&usage)).yellow()
            );
        }

        // Add user message, prepending plan-mode prefix if applicable.
        let mut prefix = String::new();
        if let Some(feedback) = self.plan_rejection_feedback.take() {
            prefix.push_str(&format!(
                "USER REJECTED THE PREVIOUS PLAN. FEEDBACK: {feedback}\n\n"
            ));
        }
        if matches!(self.permission_mode, crate::cli_options::PermissionMode::Plan)
            && !self.plan_approved
        {
            prefix.push_str(
                "[plan-mode] You must call the `update_plan` tool with a complete, ordered plan \
of steps before any mutating action (run_command, edit_file, write_file, apply_patch, MCP tools, \
task subagents). The user reviews and approves the plan; only then can you execute mutating \
tools. If your plan is rejected, the rejection feedback will be prefixed to the next user \
message -- revise and call `update_plan` again.\n\n"
            );
        }
        let effective_input = if prefix.is_empty() {
            user_input.to_string()
        } else {
            format!("{prefix}{user_input}")
        };
        self.messages.push(Message::text("user", &effective_input));

        self.save_checkpoint();

        if let Err(error) = self.persist_managed_session() {
            eprintln!(
                "{}",
                format!("  warning: failed to persist managed session: {error:#}").yellow()
            );
        }

        let max_tokens = config.default.max_tokens;

        let mcp_tool_definitions = self
            .mcp_manager
            .as_ref()
            .map(|mcp_manager| mcp_manager.tool_definitions());
        let tool_defs = crate::runtime::tool_catalog::effective_tool_definitions(
            self.plan_mode,
            self.team_manager.is_some(),
            self.allowed_tools.as_deref(),
            mcp_tool_definitions.as_deref(),
        );
        let available_tool_names = tool_defs
            .iter()
            .map(|tool_definition| tool_definition.name.as_str())
            .collect::<std::collections::HashSet<_>>();

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

        // First LLM call (with user's streaming callback).
        let first_call_result = if self.demo_force_rate_limit {
            self.demo_force_rate_limit = false;
            eprintln!(
                "  {}",
                "DEMO: synthesizing rate-limit on primary model".dimmed()
            );
            Err(anyhow::Error::new(CliError::RateLimited {
                provider: format!("{:?}", self.provider).to_lowercase(),
                retry_after: Some(0),
            }))
        } else {
            models::stream_completion(
                config,
                &self.provider,
                &self.model,
                &self.messages,
                max_tokens,
                Some(&tool_defs),
                on_chunk,
            )
            .await
        };
        let result = match first_call_result {
            Ok(r) => r,
            Err(e) => {
                let mut last_err = e;
                let mut recovered: Option<_> = None;
                let prefer_fallback = self
                    .fallback_chain
                    .as_ref()
                    .zip(last_err.downcast_ref::<CliError>())
                    .map(|(chain, err)| chain.should_rotate(err))
                    .unwrap_or(false);
                if !prefer_fallback {
                    if let Some(cli_err) = last_err.downcast_ref::<CliError>() {
                        if cli_err.is_retryable() {
                            let delay = cli_err.retry_delay();
                            eprintln!(
                                "  {}",
                                format!("Retrying in {}s: {}", delay.as_secs(), cli_err).yellow()
                            );
                            tokio::time::sleep(delay).await;
                            match models::stream_completion(
                                config,
                                &self.provider,
                                &self.model,
                                &self.messages,
                                max_tokens,
                                Some(&tool_defs),
                                Box::new(|chunk| print!("{}", chunk)),
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
                    if let Some(chain) = self.fallback_chain.clone() {
                        let cli_err_kind = last_err
                            .downcast_ref::<CliError>()
                            .map(|c| (c.kind(), chain.should_rotate(c)));
                        if let Some((kind, true)) = cli_err_kind {
                            for fallback_model in chain.tail() {
                                let prev_model = self.model.clone();
                                self.model = fallback_model.clone();
                                self.provider = crate::models::detect_provider(fallback_model);
                                eprintln!(
                                    "  {}",
                                    format!(
                                        "↘ Falling back: {} → {} ({})",
                                        prev_model, fallback_model, kind
                                    )
                                    .yellow()
                                );
                                if let Some(sink) = self.on_fallback.as_ref() {
                                    (sink.0)(&prev_model, fallback_model, kind);
                                }
                                let fallback_call = if self.demo_mode {
                                    let demo_text = format!(
                                        "[DEMO MODE] Synthesized response from `{}` — no real \
                                         API call was made. The fallback chain is exercised but \
                                         the upstream provider was not contacted.",
                                        fallback_model
                                    );
                                    print!("{}", demo_text);
                                    Ok(crate::models::CompletionResult {
                                        text: demo_text,
                                        tool_calls: vec![],
                                        input_tokens: 0,
                                        output_tokens: 0,
                                        cache_read_input_tokens: 0,
                                        cache_creation_input_tokens: 0,
                                        via_subscription: true,
                                        stop_reason: Some("end_turn".to_string()),
                                    })
                                } else {
                                    models::stream_completion(
                                        config,
                                        &self.provider,
                                        &self.model,
                                        &self.messages,
                                        max_tokens,
                                        Some(&tool_defs),
                                        Box::new(|chunk| print!("{}", chunk)),
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

        let assistant_msg = build_assistant_message(&result.text, &result.tool_calls);
        self.messages.push(assistant_msg);

        let mut total_input = result.input_tokens;
        let mut total_output = result.output_tokens;
        let mut total_cache_read = result.cache_read_input_tokens;
        let mut total_cache_creation = result.cache_creation_input_tokens;
        let via_subscription = result.via_subscription;
        let mut final_response = result.text;
        let mut current_tool_calls = result.tool_calls;

        // Agentic loop
        let effective_max = self.max_turns.unwrap_or(MAX_AGENTIC_ITERATIONS);
        for iteration in 0..effective_max {
            if current_tool_calls.is_empty() {
                break;
            }

            // Doom loop detection
            let call_hashes: Vec<u64> = current_tool_calls
                .iter()
                .map(|tc| hash_tool_call(&tc.name, &tc.arguments))
                .collect();

            self.recent_tool_calls.extend(&call_hashes);

            if self.recent_tool_calls.len() >= LOOP_DETECTION_THRESHOLD {
                let tail = &self.recent_tool_calls
                    [self.recent_tool_calls.len() - LOOP_DETECTION_THRESHOLD..];
                if tail.windows(2).all(|w| w[0] == w[1]) {
                    self.loop_strike_count += 1;

                    if self.loop_strike_count >= 2 {
                        eprintln!(
                            "\n{}",
                            "  Auto-stopping: second loop detected in this session.".red()
                        );
                        break;
                    }

                    eprintln!(
                        "\n{}",
                        format!(
                            "  Warning: Detected {} identical consecutive tool calls ({}). Possible loop. [strike {}/2]",
                            LOOP_DETECTION_THRESHOLD,
                            current_tool_calls
                                .first()
                                .map(|tc| tc.name.as_str())
                                .unwrap_or("unknown"),
                            self.loop_strike_count
                        )
                        .yellow()
                    );

                    let confirmed = dialoguer::Confirm::new()
                        .with_prompt("Continue with these tool calls?")
                        .default(false)
                        .interact()
                        .unwrap_or(false);

                    if !confirmed {
                        eprintln!("{}", "  Agentic loop stopped by user.".dimmed());
                        break;
                    }

                    self.recent_tool_calls.clear();
                }
            }

            eprintln!(
                "\n{}",
                format!(
                    "  Executing {} tool{}... (iteration {}/{})",
                    current_tool_calls.len(),
                    if current_tool_calls.len() == 1 { "" } else { "s" },
                    iteration + 1,
                    effective_max
                )
                .dimmed()
            );

            let hcfg = self.hooks_config.clone();
            let mut result_blocks = Vec::new();

            let concurrency_safe_names: std::collections::HashSet<String> = tool_defs
                .iter()
                .filter(|t| t.is_concurrency_safe)
                .map(|t| t.name.clone())
                .collect();
            let concurrent_eligible = |name: &str| -> bool {
                self.skip_permissions
                    && concurrency_safe_names.contains(name)
                    && !is_team_tool(name)
                    && !name.starts_with("mcp_")
                    && name != "task"
            };

            let task_calls: Vec<_> = current_tool_calls
                .iter()
                .filter(|tc| tc.name == "task")
                .collect();
            let concurrent_calls: Vec<_> = current_tool_calls
                .iter()
                .filter(|tc| tc.name != "task" && concurrent_eligible(&tc.name))
                .collect();
            let other_calls: Vec<_> = current_tool_calls
                .iter()
                .filter(|tc| tc.name != "task" && !concurrent_eligible(&tc.name))
                .collect();

            // Spawn all task tool calls concurrently via subagent manager
            let mut task_spawn_results = Vec::new();
            for tc in &task_calls {
                if !available_tool_names.contains(tc.name.as_str()) {
                    result_blocks.push(ContentBlock::ToolResult {
                        tool_use_id: tc.id.clone(),
                        content: format!("Tool '{}' is not available in this session.", tc.name),
                        is_error: true,
                    });
                    continue;
                }

                if matches!(self.permission_mode, crate::cli_options::PermissionMode::Plan)
                    && !self.plan_approved
                {
                    let payload = serde_json::json!({
                        "ok": false,
                        "error": "plan_mode_unapproved",
                        "message": "Plan mode is active and the current plan has not been approved. Call `update_plan` first; subagent tasks are blocked until the user approves."
                    });
                    result_blocks.push(ContentBlock::ToolResult {
                        tool_use_id: tc.id.clone(),
                        content: payload.to_string(),
                        is_error: true,
                    });
                    continue;
                }

                hooks::run_hooks(
                    &hcfg,
                    hooks::HookEvent::PreToolUse,
                    &hooks::HookInput {
                        event: "PreToolUse".to_string(),
                        session_id: None,
                        model: Some(self.model.clone()),
                        tool_name: Some(tc.name.clone()),
                        tool_args: Some(tc.arguments.clone()),
                        tool_output: None,
                        message: None,
                        tool_execution: None,
                    },
                )
                .await;

                let description = tc
                    .arguments
                    .get("description")
                    .and_then(|v| v.as_str())
                    .unwrap_or("subagent task")
                    .to_string();
                let prompt = tc
                    .arguments
                    .get("prompt")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                if self.subagent_manager.is_none() {
                    self.subagent_manager = Some(crate::subagent::SubagentManager::new(
                        config.clone(),
                        self.model.clone(),
                        crate::context::gather_system_context(),
                        self.skip_permissions,
                    ));
                }

                hooks::run_hooks(
                    &hcfg,
                    hooks::HookEvent::SubagentStart,
                    &hooks::HookInput {
                        event: "SubagentStart".to_string(),
                        session_id: None,
                        model: Some(self.model.clone()),
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
                        model: Some(self.model.clone()),
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

                task_spawn_results.push((
                    tc.id.clone(),
                    tc.name.clone(),
                    tc.arguments.clone(),
                    id_result,
                ));
            }

            if !task_spawn_results.is_empty() {
                if let Some(ref mgr) = self.subagent_manager {
                    mgr.wait_all().await;
                }
            }

            for (tool_use_id, tool_name, tool_args, id_result) in task_spawn_results {
                let tool_result = match id_result {
                    Ok(ref id) => {
                        if let Some(ref mgr) = self.subagent_manager {
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
                                    output: format!(
                                        "Subagent {} finished with status: {}",
                                        id, sa_status
                                    ),
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
                    "success".green().to_string()
                } else {
                    "failed".red().to_string()
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
                        model: Some(self.model.clone()),
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
                        model: Some(self.model.clone()),
                        tool_name: Some(tool_name),
                        tool_args: Some(tool_args),
                        tool_output: Some(tool_result.output.clone()),
                        message: None,
                        tool_execution: None,
                    },
                )
                .await;

                result_blocks.push(ContentBlock::ToolResult {
                    tool_use_id,
                    content: tool_result.output,
                    is_error: !tool_result.success,
                });
            }

            // Execute the concurrent batch via join_all
            if !concurrent_calls.is_empty() {
                if !self.quiet {
                    eprintln!(
                        "  {} ({})",
                        format!("running {} read-only tools in parallel", concurrent_calls.len())
                            .dimmed(),
                        concurrent_calls
                            .iter()
                            .map(|tc| tc.name.as_str())
                            .collect::<Vec<_>>()
                            .join(", ")
                    );
                }

                let mut runnable: Vec<&crate::models::ToolCallResponse> = Vec::new();
                for tc in &concurrent_calls {
                    if !available_tool_names.contains(tc.name.as_str()) {
                        result_blocks.push(ContentBlock::ToolResult {
                            tool_use_id: tc.id.clone(),
                            content: format!(
                                "Tool '{}' is not available in this session.",
                                tc.name
                            ),
                            is_error: true,
                        });
                        continue;
                    }
                    runnable.push(tc);
                }

                for tc in &runnable {
                    hooks::run_hooks(
                        &hcfg,
                        hooks::HookEvent::PreToolUse,
                        &hooks::HookInput {
                            event: "PreToolUse".to_string(),
                            session_id: None,
                            model: Some(self.model.clone()),
                            tool_name: Some(tc.name.clone()),
                            tool_args: Some(tc.arguments.clone()),
                            tool_output: None,
                            message: None,
                            tool_execution: None,
                        },
                    )
                    .await;
                }

                let exec_opts = crate::tools::ToolExecOptions {
                    require_confirmation: !self.skip_permissions,
                    auto_approve_safe: self.auto_approve_safe,
                    quiet: self.quiet,
                };
                let futures = runnable.iter().map(|tc| {
                    let legacy = tool_call_to_legacy(tc);
                    let opts = exec_opts.clone();
                    let id = tc.id.clone();
                    let name = tc.name.clone();
                    let args = tc.arguments.clone();
                    async move {
                        let result = crate::tools::execute_tool_with_opts(&legacy, &opts).await;
                        (id, name, args, result)
                    }
                });
                let outcomes = join_all(futures).await;

                for (tool_use_id, tool_name, tool_args, exec_result) in outcomes {
                    let tool_result = match exec_result {
                        Ok(r) => r,
                        Err(e) => crate::tools::ToolResult {
                            tool_name: tool_name.clone(),
                            success: false,
                            output: format!("tool error: {:#}", e),
                        },
                    };

                    if !self.quiet {
                        let status = if tool_result.success {
                            "success".green().to_string()
                        } else {
                            "failed".red().to_string()
                        };
                        eprintln!(
                            "  {} {} [{}]",
                            "->".dimmed(),
                            tool_name.bold(),
                            status
                        );
                    }

                    hooks::run_hooks(
                        &hcfg,
                        hooks::HookEvent::PostToolUse,
                        &hooks::HookInput {
                            event: "PostToolUse".to_string(),
                            session_id: None,
                            model: Some(self.model.clone()),
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
                            model: Some(self.model.clone()),
                            tool_name: Some(tool_name),
                            tool_args: Some(tool_args),
                            tool_output: Some(tool_result.output.clone()),
                            message: None,
                            tool_execution: None,
                        },
                    )
                    .await;

                    result_blocks.push(ContentBlock::ToolResult {
                        tool_use_id,
                        content: tool_result.output,
                        is_error: !tool_result.success,
                    });
                }
            }

            let mut hook_additional_contexts: Vec<String> = Vec::new();

            // Execute non-task tool calls sequentially
            for tc in &other_calls {
                if !available_tool_names.contains(tc.name.as_str()) {
                    result_blocks.push(ContentBlock::ToolResult {
                        tool_use_id: tc.id.clone(),
                        content: format!("Tool '{}' is not available in this session.", tc.name),
                        is_error: true,
                    });
                    continue;
                }

                if matches!(self.permission_mode, crate::cli_options::PermissionMode::Plan)
                    && !self.plan_approved
                    && is_mutating_tool(&tc.name)
                {
                    let payload = serde_json::json!({
                        "ok": false,
                        "error": "plan_mode_unapproved",
                        "message": "Plan mode is active and the current plan has not been approved. Call `update_plan` with a complete ordered plan, then await user approval. Do NOT call mutating tools yet."
                    });
                    result_blocks.push(ContentBlock::ToolResult {
                        tool_use_id: tc.id.clone(),
                        content: payload.to_string(),
                        is_error: true,
                    });
                    continue;
                }

                let pre_results = hooks::run_hooks(
                    &hcfg,
                    hooks::HookEvent::PreToolUse,
                    &hooks::HookInput {
                        event: "PreToolUse".to_string(),
                        session_id: None,
                        model: Some(self.model.clone()),
                        tool_name: Some(tc.name.clone()),
                        tool_args: Some(tc.arguments.clone()),
                        tool_output: None,
                        message: None,
                        tool_execution: None,
                    },
                )
                .await;
                let pre_t = hooks::aggregate_transformers(&pre_results);
                let effective_args =
                    pre_t.updated_input.clone().unwrap_or_else(|| tc.arguments.clone());

                match hooks::aggregate_results(&pre_results) {
                    hooks::HookAggregateOutcome::Blocked { reasons } => {
                        let reason_text = reasons.join("; ");
                        if !self.quiet {
                            eprintln!(
                                "  {} {} blocked by hook: {}",
                                "->".dimmed(),
                                tc.name.bold(),
                                reason_text.red()
                            );
                        }
                        result_blocks.push(ContentBlock::ToolResult {
                            tool_use_id: tc.id.clone(),
                            content: format!("Tool execution blocked by hook: {reason_text}"),
                            is_error: true,
                        });
                        continue;
                    }
                    hooks::HookAggregateOutcome::Stop => {
                        if !self.quiet {
                            eprintln!(
                                "  {} {} stopped by hook",
                                "->".dimmed(),
                                tc.name.bold()
                            );
                        }
                        result_blocks.push(ContentBlock::ToolResult {
                            tool_use_id: tc.id.clone(),
                            content: "Tool execution stopped by hook.".to_string(),
                            is_error: true,
                        });
                        continue;
                    }
                    hooks::HookAggregateOutcome::Continue => {}
                }

                let legacy = super::executor::ToolCall {
                    name: tc.name.clone(),
                    args: value_to_legacy_args(&effective_args),
                };

                let tool_result = if tc.name == "update_plan" {
                    let payload = self.handle_update_plan(&effective_args);
                    let success = payload.get("ok").and_then(|v| v.as_bool()).unwrap_or(false);
                    let message = payload
                        .get("message")
                        .and_then(|v| v.as_str())
                        .unwrap_or("plan handled")
                        .to_string();
                    if !self.quiet {
                        let path_disp = self
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
                } else if is_team_tool(&tc.name) {
                    execute_team_tool(&self.team_manager, &tc.name, &legacy.args).await?
                } else if tc.name.starts_with("mcp_") {
                    execute_mcp_tool(&mut self.mcp_manager, &tc.name, effective_args.clone())
                        .await?
                } else {
                    let opts = crate::tools::ToolExecOptions {
                        require_confirmation: !self.skip_permissions,
                        auto_approve_safe: self.auto_approve_safe,
                        quiet: self.quiet,
                    };
                    crate::tools::execute_tool_with_opts(&legacy, &opts).await?
                };

                if !self.quiet {
                    let status = if tool_result.success {
                        "success".green().to_string()
                    } else {
                        "failed".red().to_string()
                    };
                    eprintln!("  {} {} [{}]", "->".dimmed(), tc.name.bold(), status);
                }

                let post_results = hooks::run_hooks(
                    &hcfg,
                    hooks::HookEvent::PostToolUse,
                    &hooks::HookInput {
                        event: "PostToolUse".to_string(),
                        session_id: None,
                        model: Some(self.model.clone()),
                        tool_name: Some(tc.name.clone()),
                        tool_args: Some(effective_args.clone()),
                        tool_output: Some(tool_result.output.clone()),
                        message: None,
                        tool_execution: None,
                    },
                )
                .await;

                let post_t = hooks::aggregate_transformers(&post_results);
                let final_output = post_t.updated_mcp_tool_output.unwrap_or(tool_result.output);
                if let Some(ctx) = post_t.additional_context {
                    hook_additional_contexts.push(ctx);
                }

                hooks::run_hooks(
                    &hcfg,
                    hooks::HookEvent::ToolResultPersist,
                    &hooks::HookInput {
                        event: "ToolResultPersist".to_string(),
                        session_id: None,
                        model: Some(self.model.clone()),
                        tool_name: Some(tc.name.clone()),
                        tool_args: Some(effective_args.clone()),
                        tool_output: Some(final_output.clone()),
                        message: None,
                        tool_execution: None,
                    },
                )
                .await;

                result_blocks.push(ContentBlock::ToolResult {
                    tool_use_id: tc.id.clone(),
                    content: final_output,
                    is_error: !tool_result.success,
                });
            }

            self.messages.push(Message::blocks("user", result_blocks));

            if !hook_additional_contexts.is_empty() {
                let merged = hook_additional_contexts.join("\n\n");
                self.messages.push(Message::text("system", merged));
            }

            eprintln!();
            let continuation = match models::stream_completion(
                config,
                &self.provider,
                &self.model,
                &self.messages,
                max_tokens,
                Some(&tool_defs),
                Box::new(|chunk| print!("{}", chunk)),
            )
            .await
            {
                Ok(r) => r,
                Err(e) => {
                    if let Some(cli_err) = e.downcast_ref::<CliError>() {
                        if cli_err.is_retryable() {
                            let delay = cli_err.retry_delay();
                            eprintln!(
                                "  {}",
                                format!("Retrying in {}s: {}", delay.as_secs(), cli_err).yellow()
                            );
                            tokio::time::sleep(delay).await;
                            models::stream_completion(
                                config,
                                &self.provider,
                                &self.model,
                                &self.messages,
                                max_tokens,
                                Some(&tool_defs),
                                Box::new(|chunk| print!("{}", chunk)),
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

            let cont_msg = build_assistant_message(&continuation.text, &continuation.tool_calls);
            self.messages.push(cont_msg);

            total_input += continuation.input_tokens;
            total_output += continuation.output_tokens;
            total_cache_read += continuation.cache_read_input_tokens;
            total_cache_creation += continuation.cache_creation_input_tokens;
            final_response = continuation.text;
            current_tool_calls = continuation.tool_calls;

            if detect_content_loop(&final_response) {
                self.loop_strike_count += 1;

                if self.loop_strike_count >= 2 {
                    eprintln!(
                        "\n{}",
                        "  Auto-stopping: second content loop detected in this session.".red()
                    );
                    break;
                }

                eprintln!(
                    "\n{}",
                    format!(
                        "  Warning: Detected repetitive content in LLM response. Possible content loop. [strike {}/2]",
                        self.loop_strike_count
                    )
                    .yellow()
                );

                let confirmed = dialoguer::Confirm::new()
                    .with_prompt("Continue the agentic loop?")
                    .default(false)
                    .interact()
                    .unwrap_or(false);

                if !confirmed {
                    eprintln!("{}", "  Agentic loop stopped by user.".dimmed());
                    break;
                }
            }
        }

        // Update session counters
        self.total_input_tokens += total_input;
        self.total_output_tokens += total_output;
        self.total_cache_read_tokens += total_cache_read;
        self.total_cache_creation_tokens += total_cache_creation;
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
                tokio::spawn(async move {
                    if let Err(e) = crate::memory_pipeline::MemoryPipeline::consolidate(
                        &home_clone,
                        &config_clone,
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
                format!("  warning: failed to persist managed session: {error:#}").yellow()
            );
        }

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
        )
        .await?;

        Ok(result.text)
    }
}
