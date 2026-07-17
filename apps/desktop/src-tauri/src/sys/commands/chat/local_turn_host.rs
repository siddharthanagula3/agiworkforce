//! Desktop adoption of the shared `agiworkforce-agent-core` turn engine for the
//! non-streaming local-chat tool loop (Wave 5 stage e2 of
//! `docs/plans/rust-engine-extraction-2026-07-09.md`).
//!
//! This is the thin, behavior-preserving facade that replaces the inline
//! `while let Some(tool_calls) = outcome.response.tool_calls` loop that used to
//! live in `run_nonstreaming_chat`. The loop MECHANICS — first completion, then
//! iterate: dispatch the tool batch, feed results back, request a continuation,
//! stop on empty tool calls / iteration limit / user cancellation — now live in
//! `agiworkforce_agent_core::run_turn`, driven through [`LocalChatTurnHost`].
//!
//! Everything provider-, IPC-, or persistence-specific stays desktop-local
//! behind the host: model completion via `LLMRouter::invoke_candidate` (with the
//! same per-followup timeout, `pause_turn` logging, and followup-failure
//! graceful-stop the inline loop had), per-tool execution + Tauri tool events
//! via `execute_tool_calls_batch`, the `chat:agent-progress` / `chat:tool-calls`
//! emits, message-history accrual, and cost/token accounting. The engine never
//! performs I/O, prints, or resolves credentials.
//!
//! ## Scope note (why non-streaming only)
//!
//! Only the non-streaming path (`stream_mode == false`) is adopted here. The
//! streaming path (`spawn_streaming_chat`) carries behavior the engine's
//! `TurnEvent` set cannot express 1:1 (the `agentic:loop-ended` reason taxonomy,
//! per-iteration dynamic max, wall-clock loop timeout, mid-loop pending-message
//! injection, tool-loop compaction, and the `pause_turn`→continue-with-empty-
//! tools branch), so forcing it through the engine would not be behavior-
//! preserving. It stays on its inline loop as a tracked follow-up.

use std::time::Duration;

use agiworkforce_agent_core::{
    run_turn, Completion, DispatchMode, ExecFuture, ExecResult, LoopControl, Prepared,
    PreparedCall, ResultBlock, RunawayTracker, StreamEvent, ToolClass, TurnEvent, TurnHost,
    TurnParams, TurnPhase,
};
use agiworkforce_llm::{ChatOutcome, ToolCall as CoreToolCall, Usage as CoreUsage};

use super::*;
use crate::core::llm::llm_router::{RouteCandidate, RouteOutcome};
use crate::core::llm::sse_parser::StreamingToolCall;
use crate::core::llm::{ChatMessage, LLMRequest, LLMRouter, ToolChoice, ToolDefinition};

/// Matches the inline loop's `let max_tool_iterations = 25;`.
const MAX_TOOL_ITERATIONS: usize = 25;

/// Everything `run_nonstreaming_chat` needs to finish the turn after the engine
/// returns: the final assistant text plus the accounting the persistence + IPC
/// tail reads (which the inline loop tracked in locals).
pub(super) struct LocalChatTurnResult {
    pub final_content: String,
    /// The last successful completion — carries provider/model/cost/tokens/
    /// credits for `save_or_skip_assistant_message` and the final `stream-end`.
    pub last_outcome: RouteOutcome,
    /// Sum of every continuation completion's token count (matches the inline
    /// loop's `total_tool_tokens`, including its historical double-count of the
    /// final continuation).
    pub total_tool_tokens: u32,
    pub final_reasoning_content: Option<String>,
    pub final_reasoning_tokens: Option<u32>,
    /// Number of tool-dispatch iterations that ran (for the completion log line).
    pub tool_iterations: usize,
}

/// Drive the non-streaming local-chat tool loop through the shared engine.
///
/// `first_outcome` is the already-invoked first completion (the caller's
/// candidates loop produced it); the host replays it as the `First` completion
/// and invokes continuations itself. Returns the accounting the caller persists.
#[allow(clippy::too_many_arguments)]
pub(super) async fn run_local_chat_tool_loop(
    router: std::sync::Arc<tokio::sync::RwLock<LLMRouter>>,
    candidate: RouteCandidate,
    app_handle: tauri::AppHandle,
    conversation_id: i64,
    frontend_message_id: Option<String>,
    llm_request: &LLMRequest,
    model: String,
    first_outcome: RouteOutcome,
    project_folder: Option<String>,
    conversation_mode: Option<String>,
    persist_internal_resources: bool,
    thinking_mode: Option<bool>,
    tool_registry: Option<std::sync::Arc<crate::core::agi::tools::ToolRegistry>>,
) -> LocalChatTurnResult {
    let final_content = first_outcome.response.content.clone();
    let mut host = LocalChatTurnHost {
        router,
        candidate,
        app_handle,
        conversation_id,
        frontend_message_id,
        current_messages: llm_request.messages.clone(),
        tools: llm_request.tools.clone(),
        tool_choice: llm_request.tool_choice.clone(),
        model,
        thinking_mode,
        project_folder,
        conversation_mode,
        persist_internal_resources,
        tool_registry,
        first_outcome: Some(first_outcome.clone()),
        next_prefix_index: 1,
        pending_calls: Vec::new(),
        last_outcome: first_outcome,
        total_tool_tokens: 0,
        final_content,
        final_reasoning_content: None,
        final_reasoning_tokens: None,
        batch_has_media: false,
        tool_iterations: 0,
    };

    let params = TurnParams {
        effective_max: MAX_TOOL_ITERATIONS,
        // The non-streaming loop had no spend cap of its own (the router enforces
        // its session safety cap internally), so the engine's budget guard stays
        // disabled — behavior-preserving.
        max_budget_usd: None,
    };
    let mut tracker = RunawayTracker::new();

    // The engine only errors if a completion's `complete()` returns `Err`; the
    // host's `complete()` never does (continuation failures are folded into a
    // graceful stop), so this cannot fail. Guard defensively anyway.
    let response = match run_turn(&mut host, params, &mut tracker).await {
        Ok(outcome) => outcome.response,
        Err(error) => {
            warn!("[Chat] Non-streaming turn engine returned unexpected error: {error}");
            host.final_content.clone()
        }
    };

    LocalChatTurnResult {
        final_content: response,
        last_outcome: host.last_outcome,
        total_tool_tokens: host.total_tool_tokens,
        final_reasoning_content: host.final_reasoning_content,
        final_reasoning_tokens: host.final_reasoning_tokens,
        tool_iterations: host.tool_iterations,
    }
}

/// The app-local `TurnHost` for the non-streaming local-chat loop.
struct LocalChatTurnHost {
    router: std::sync::Arc<tokio::sync::RwLock<LLMRouter>>,
    candidate: RouteCandidate,
    app_handle: tauri::AppHandle,
    conversation_id: i64,
    frontend_message_id: Option<String>,
    current_messages: Vec<ChatMessage>,
    tools: Option<Vec<ToolDefinition>>,
    tool_choice: Option<ToolChoice>,
    model: String,
    thinking_mode: Option<bool>,
    project_folder: Option<String>,
    conversation_mode: Option<String>,
    persist_internal_resources: bool,
    tool_registry: Option<std::sync::Arc<crate::core::agi::tools::ToolRegistry>>,
    /// The pre-invoked first completion, consumed on the `First` phase.
    first_outcome: Option<RouteOutcome>,
    /// 1-based prefix index for `normalize_tool_calls`, mirroring the inline
    /// loop's `tool_iteration` (`tool_call_1`, `tool_call_2`, …).
    next_prefix_index: usize,
    /// This iteration's normalized tool calls — used both for the `chat:tool-calls`
    /// emit and to recover the exact `StreamingToolCall` (arguments string) for
    /// execution, so bytes are never round-tripped through `serde_json::Value`.
    pending_calls: Vec<StreamingToolCall>,
    last_outcome: RouteOutcome,
    total_tool_tokens: u32,
    final_content: String,
    final_reasoning_content: Option<String>,
    final_reasoning_tokens: Option<u32>,
    batch_has_media: bool,
    tool_iterations: usize,
}

impl LocalChatTurnHost {
    fn frontend_message_id_str(&self) -> String {
        self.frontend_message_id.clone().unwrap_or_default()
    }

    /// Convert a router outcome into the engine's `ChatOutcome`, normalizing its
    /// tool calls with the next 1-based prefix, stashing the normalized
    /// `StreamingToolCall`s for the emit + execution paths, and tracking the
    /// "last completion wins" reasoning/content/outcome fields the caller reads.
    fn absorb(&mut self, outcome: &RouteOutcome, phase: TurnPhase) -> ChatOutcome {
        let prefix = format!("tool_call_{}", self.next_prefix_index);
        self.next_prefix_index += 1;

        let (chat, normalized) = chat_outcome_from_route(outcome, &prefix);
        self.pending_calls = normalized;

        // Track the "last completion wins" reasoning fields exactly like the
        // inline loop did (set on the first and every successful continuation).
        self.final_reasoning_content = outcome.response.reasoning_content.clone();
        self.final_reasoning_tokens = outcome
            .response
            .reasoning_tokens
            .or(outcome.response.thinking_tokens);
        self.final_content = outcome.response.content.clone();
        self.last_outcome = outcome.clone();

        let _ = phase;
        chat
    }

    /// Build the continuation request from the accrued history, mirroring the
    /// inline loop's `followup_request` exactly.
    fn continuation_request(&self) -> LLMRequest {
        continuation_request(
            &self.current_messages,
            &self.model,
            &self.tools,
            &self.tool_choice,
            self.thinking_mode,
        )
    }
}

#[async_trait::async_trait]
impl TurnHost for LocalChatTurnHost {
    async fn complete(
        &mut self,
        phase: TurnPhase,
        _sink: &mut (dyn FnMut(StreamEvent) + Send),
    ) -> anyhow::Result<Completion> {
        // Non-streaming: no incremental stream events are fed to the sink; the
        // whole assembled outcome is returned.
        match phase {
            TurnPhase::First => {
                let first = self
                    .first_outcome
                    .take()
                    .expect("First completion is pre-invoked exactly once");
                let outcome = self.absorb(&first, phase);
                Ok(Completion {
                    outcome,
                    via_subscription: false,
                })
            }
            TurnPhase::Continuation => {
                let request = self.continuation_request();
                let batch_has_media = self.batch_has_media;
                let timeout_secs = resolve_followup_invoke_timeout_secs(false, batch_has_media);

                let followup = {
                    let router = self.router.read().await;
                    tokio::time::timeout(
                        Duration::from_secs(timeout_secs),
                        router.invoke_candidate(&self.candidate, &request),
                    )
                    .await
                };

                match followup {
                    Ok(Ok(new_outcome)) => {
                        self.total_tool_tokens += new_outcome.response.tokens.unwrap_or(0);
                        if new_outcome.response.finish_reason.as_deref() == Some("pause_turn") {
                            info!("[Chat] Received pause_turn, continuing conversation");
                        }
                        let outcome = self.absorb(&new_outcome, phase);
                        Ok(Completion {
                            outcome,
                            via_subscription: false,
                        })
                    }
                    Ok(Err(error)) => {
                        error!("[Chat] Follow-up LLM call failed: {}", error);
                        Ok(self.graceful_stop())
                    }
                    Err(_) => {
                        error!(
                            "[Chat] Follow-up LLM call timed out after {}s",
                            timeout_secs
                        );
                        Ok(self.graceful_stop())
                    }
                }
            }
        }
    }

    fn record_assistant(&mut self, completion: &Completion) {
        // Only push an assistant turn that requested tools; the terminal
        // completion (no tool calls) is returned to the caller, never re-sent,
        // so pushing it would be dead history. The inline loop pushed the
        // assistant message with its tool calls at the top of each iteration.
        if self.pending_calls.is_empty() {
            return;
        }
        self.current_messages.push(assistant_tool_message(
            &completion.outcome.text,
            &self.pending_calls,
        ));
    }

    fn classify(&self, _call: &CoreToolCall) -> ToolClass {
        // `execute_tool_calls_batch` runs tools sequentially, so every call is a
        // sequential ("Other") dispatch. The task/parallel batches are never used
        // by the non-streaming local path.
        ToolClass::Other
    }

    async fn run_task_batch(&mut self, _calls: &[CoreToolCall]) -> Vec<ResultBlock> {
        // No calls are ever classified `Task`.
        Vec::new()
    }

    async fn prepare_tool(&mut self, call: &CoreToolCall, _mode: DispatchMode) -> Prepared {
        // The non-streaming loop had no per-tool pre-checks (availability, hooks,
        // plan-mode) — normalization already happened in `absorb`. Proceed with
        // the call's arguments verbatim.
        Prepared::Proceed {
            args: call.arguments.clone(),
        }
    }

    fn parallel_future(&self, _prepared: PreparedCall) -> ExecFuture {
        // Unreachable: `classify` never returns `ConcurrentEligible`.
        unreachable!("non-streaming local chat classifies every tool as sequential")
    }

    async fn finish_parallel_tool(
        &mut self,
        _prepared: PreparedCall,
        _result: ExecResult,
    ) -> ResultBlock {
        unreachable!("non-streaming local chat classifies every tool as sequential")
    }

    async fn execute_sequential_tool(
        &mut self,
        call: &CoreToolCall,
        _args: serde_json::Value,
    ) -> ExecResult {
        // Recover the exact normalized StreamingToolCall (its arguments string is
        // byte-preserved) and run it through the real per-tool executor, which
        // emits the desktop tool events (`ToolEvent::Started/Completed`,
        // `chat:tool-executing`, `chat:tool-result`) identically to the batch.
        let Some(stc) = self
            .pending_calls
            .iter()
            .find(|stc| stc.id == call.id)
            .cloned()
        else {
            return ExecResult {
                ok: false,
                output: String::new(),
            };
        };

        if is_media_generation_tool(&stc.name) {
            self.batch_has_media = true;
        }

        let (results, _failures) = execute_tool_calls_batch(
            std::slice::from_ref(&stc),
            &self.app_handle,
            self.conversation_id,
            &self.frontend_message_id_str(),
            self.project_folder.clone(),
            self.conversation_mode.clone(),
            self.persist_internal_resources,
            0,
            self.tool_registry.clone(),
        )
        .await;

        // A provider-side `__server__` tool is skipped by the batch (no result
        // row); it yields an empty output here. Local models do not emit such
        // tools, so this is an inert edge in this path.
        match results.into_iter().next() {
            Some(result) => ExecResult {
                ok: result.success,
                output: result.to_message_content(),
            },
            None => ExecResult {
                ok: true,
                output: String::new(),
            },
        }
    }

    async fn finish_sequential_tool(
        &mut self,
        call: &CoreToolCall,
        _args: serde_json::Value,
        result: ExecResult,
    ) -> ResultBlock {
        ResultBlock {
            tool_use_id: call.id.clone(),
            content: result.output,
            is_error: !result.ok,
        }
    }

    async fn commit_tool_results(&mut self, blocks: Vec<ResultBlock>, _iteration: usize) {
        // Push each result as a `tool`-role message, exactly like the inline loop.
        for block in blocks {
            self.current_messages.push(tool_result_message(block));
        }
        self.tool_iterations += 1;
    }

    async fn confirm_tool_runaway(
        &mut self,
        _tracker: &mut RunawayTracker,
        _calls: &[CoreToolCall],
    ) -> LoopControl {
        // The non-streaming loop had no identical-tool-call runaway guard; only
        // the iteration limit. Never break here — preserve that behavior.
        LoopControl::Continue
    }

    async fn confirm_content_loop(
        &mut self,
        _tracker: &mut RunawayTracker,
        _text: &str,
    ) -> LoopControl {
        // No content-chant guard in the inline loop either.
        LoopControl::Continue
    }

    fn turn_cost_usd(&self, _totals: &agiworkforce_agent_core::UsageTotals) -> f64 {
        // Budget guard disabled (max_budget_usd = None), so this is never
        // consulted; report zero.
        0.0
    }

    fn on_event(&mut self, event: &TurnEvent) {
        // Reproduce the inline loop's per-iteration IPC emits. Every other event
        // (ToolStarted/ToolFinished — the desktop tool events come from
        // `execute_tool_calls_batch`; TurnComplete — the caller saves after the
        // loop; parallel/budget — never fire here) is intentionally a no-op.
        if let TurnEvent::IterationStarted {
            tool_count,
            iteration,
            max,
        } = event
        {
            // Fresh iteration: reset the media flag the next continuation reads.
            self.batch_has_media = false;
            let display_iteration = iteration + 1; // 1-based, matches `tool_iteration`.

            let _ = self.app_handle.emit(
                "chat:agent-progress",
                agent_progress_payload(self.conversation_id, display_iteration, *max, *tool_count),
            );
            let _ = self.app_handle.emit(
                "chat:tool-calls",
                tool_calls_payload(
                    self.conversation_id,
                    &self.frontend_message_id,
                    &self.pending_calls,
                    display_iteration,
                ),
            );
        }
    }

    fn is_cancelled(&self) -> bool {
        // Mirror the desktop stop control: a user "stop generation" for this
        // conversation halts the loop before the next completion.
        should_stop_for_conversation(self.conversation_id)
    }
}

impl LocalChatTurnHost {
    /// A continuation failure/timeout is not fatal: keep the last good content
    /// and end the loop (empty tool calls) so the caller persists the partial —
    /// exactly the inline loop's `break` on a failed follow-up.
    fn graceful_stop(&mut self) -> Completion {
        self.pending_calls.clear();
        Completion {
            outcome: ChatOutcome {
                text: self.final_content.clone(),
                tool_calls: Vec::new(),
                usage: CoreUsage::default(),
                stop_reason: None,
            },
            via_subscription: false,
        }
    }
}

/// Pure conversion of a desktop `RouteOutcome` into the engine's `ChatOutcome`
/// plus the normalized `StreamingToolCall`s (ids filled with `prefix`). Shared by
/// the host's `absorb` and its tests; holds no `self` state so it is directly
/// unit-testable without a router or Tauri handle.
fn chat_outcome_from_route(
    outcome: &RouteOutcome,
    prefix: &str,
) -> (ChatOutcome, Vec<StreamingToolCall>) {
    let normalized = outcome
        .response
        .tool_calls
        .as_deref()
        .map(|calls| normalize_tool_calls(calls, prefix))
        .unwrap_or_default();

    let core_calls = normalized
        .iter()
        .map(|stc| CoreToolCall {
            id: stc.id.clone(),
            name: stc.name.clone(),
            // Used by the engine only for its (desktop no-op) ToolStarted event
            // and the runaway hash; execution recovers the exact args string from
            // the normalized StreamingToolCall instead.
            arguments: parse_args(&stc.arguments),
        })
        .collect();

    let chat = ChatOutcome {
        text: outcome.response.content.clone(),
        tool_calls: core_calls,
        usage: CoreUsage {
            input_tokens: outcome.response.prompt_tokens.unwrap_or(0),
            output_tokens: outcome.response.completion_tokens.unwrap_or(0),
            cache_read_input_tokens: outcome.response.cache_read_input_tokens.unwrap_or(0),
            cache_creation_input_tokens: outcome.response.cache_creation_input_tokens.unwrap_or(0),
            reasoning_output_tokens: outcome
                .response
                .reasoning_tokens
                .or(outcome.response.thinking_tokens)
                .unwrap_or(0),
        },
        stop_reason: outcome.response.finish_reason.clone(),
    };
    (chat, normalized)
}

/// The `chat:agent-progress` payload emitted at the top of each tool iteration.
/// Byte-for-byte the inline loop's non-streaming shape (`iteration` is 1-based).
fn agent_progress_payload(
    conversation_id: i64,
    iteration: usize,
    max_iterations: usize,
    tool_count: usize,
) -> serde_json::Value {
    serde_json::json!({
        "conversation_id": conversation_id,
        "iteration": iteration,
        "max_iterations": max_iterations,
        "status": "executing_tools",
        "tool_count": tool_count,
    })
}

/// The `chat:tool-calls` payload emitted before dispatching a tool batch.
/// `message_id` serializes to `null` when absent, matching the inline loop's
/// `request.frontend_message_id.clone()`.
fn tool_calls_payload(
    conversation_id: i64,
    message_id: &Option<String>,
    calls: &[StreamingToolCall],
    iteration: usize,
) -> serde_json::Value {
    serde_json::json!({
        "conversation_id": conversation_id,
        "message_id": message_id,
        "tool_calls": calls,
        "iteration": iteration,
    })
}

/// The `assistant`-role message pushed before a tool batch (content + the
/// batch's tool calls), mirroring the inline loop's assistant push exactly.
fn assistant_tool_message(content: &str, calls: &[StreamingToolCall]) -> ChatMessage {
    let tool_calls = calls
        .iter()
        .map(|stc| crate::core::llm::ToolCall {
            id: stc.id.clone(),
            name: stc.name.clone(),
            arguments: stc.arguments.clone(),
        })
        .collect();
    ChatMessage {
        role: "assistant".to_string(),
        content: content.to_string(),
        tool_calls: Some(tool_calls),
        tool_call_id: None,
        multimodal_content: None,
    }
}

/// The `tool`-role message for one tool result, mirroring the inline loop's push.
fn tool_result_message(block: ResultBlock) -> ChatMessage {
    ChatMessage {
        role: "tool".to_string(),
        content: block.content,
        tool_calls: None,
        tool_call_id: Some(block.tool_use_id),
        multimodal_content: None,
    }
}

/// The continuation (`followup`) request built from accrued history, mirroring
/// the inline non-streaming loop's `followup_request` exactly.
fn continuation_request(
    messages: &[ChatMessage],
    model: &str,
    tools: &Option<Vec<ToolDefinition>>,
    tool_choice: &Option<ToolChoice>,
    thinking_mode: Option<bool>,
) -> LLMRequest {
    LLMRequest {
        messages: messages.to_vec(),
        model: model.to_string(),
        temperature: Some(DEFAULT_TEMPERATURE),
        max_tokens: Some(DEFAULT_MAX_TOKENS),
        stream: false,
        tools: tools.clone(),
        tool_choice: tool_choice.clone(),
        thinking_mode,
        ..Default::default()
    }
}

/// Parse a tool-call arguments string into JSON for the engine's internal use
/// (runaway hashing / no-op ToolStarted event). Falls back to a string value so
/// malformed args still hash deterministically without panicking.
fn parse_args(raw: &str) -> serde_json::Value {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return serde_json::Value::Object(serde_json::Map::new());
    }
    serde_json::from_str(trimmed).unwrap_or_else(|_| serde_json::Value::String(raw.to_string()))
}

#[cfg(test)]
mod tests {
    //! Smoke of the adopted turn path from the desktop crate. Because the real
    //! `LocalChatTurnHost` executes tools through `execute_tool_calls_batch`,
    //! which is typed to the concrete Wry `tauri::AppHandle` (tauri's mock
    //! runtime is a different, incompatible `AppHandle<MockRuntime>`), the full
    //! production host cannot be driven in a unit test without a real Tauri
    //! window — that path is covered by the live app / WDIO. What IS unit-
    //! testable here, and is what this smoke asserts:
    //!
    //! - the REAL production conversion (`chat_outcome_from_route`) that turns a
    //!   desktop `RouteOutcome` into the engine's `ChatOutcome` + normalized tool
    //!   calls;
    //! - that the shared `agiworkforce_agent_core::run_turn` engine, driven from
    //!   the desktop crate with those converted outcomes and desktop-shaped tool
    //!   results, produces the expected transcript: user turn → assistant text →
    //!   tool call dispatched → tool result → final text;
    //! - that `TurnHost::is_cancelled` halts the loop mid-turn.

    use std::collections::VecDeque;

    use agiworkforce_agent_core::{
        Completion, DispatchMode, ExecFuture, ExecResult, LoopControl, Prepared, PreparedCall,
        ResultBlock, RunawayTracker, StreamEvent, ToolClass, TurnEngine, TurnEvent, TurnHost,
        TurnParams, TurnPhase, UsageTotals,
    };
    use agiworkforce_llm::ToolCall as CoreToolCall;

    use super::chat_outcome_from_route;
    use crate::core::llm::llm_router::RouteOutcome;
    use crate::core::llm::{LLMResponse, Provider, ToolCall};

    fn route_outcome(
        content: &str,
        tool_calls: Option<Vec<ToolCall>>,
        tokens: u32,
    ) -> RouteOutcome {
        RouteOutcome {
            provider: Provider::Ollama,
            model: "scripted".to_string(),
            response: LLMResponse {
                content: content.to_string(),
                tool_calls,
                model: "scripted".to_string(),
                tokens: Some(tokens),
                prompt_tokens: Some(tokens / 2),
                completion_tokens: Some(tokens / 2),
                ..Default::default()
            },
            prompt_tokens: tokens / 2,
            completion_tokens: tokens / 2,
            cost: 0.0,
        }
    }

    /// A desktop-side scripted `TurnHost` that mirrors the local-chat mapping
    /// WITHOUT the Wry-typed tool executor: completions come from real
    /// `RouteOutcome` conversions, tool execution returns a scripted result, and
    /// cancellation is a controllable flag.
    struct ScriptedDesktopHost {
        completions: VecDeque<RouteOutcome>,
        next_prefix_index: usize,
        tool_output: String,
        cancel_after_commits: Option<usize>,
        events: Vec<TurnEvent>,
        committed: Vec<Vec<ResultBlock>>,
        assistant_texts: Vec<String>,
    }

    #[async_trait::async_trait]
    impl TurnHost for ScriptedDesktopHost {
        async fn complete(
            &mut self,
            _phase: TurnPhase,
            _sink: &mut (dyn FnMut(StreamEvent) + Send),
        ) -> anyhow::Result<Completion> {
            let outcome = self
                .completions
                .pop_front()
                .expect("engine requested more completions than scripted");
            let prefix = format!("tool_call_{}", self.next_prefix_index);
            self.next_prefix_index += 1;
            // Exercise the REAL production conversion.
            let (chat, _normalized) = chat_outcome_from_route(&outcome, &prefix);
            Ok(Completion {
                outcome: chat,
                via_subscription: false,
            })
        }

        fn record_assistant(&mut self, completion: &Completion) {
            self.assistant_texts.push(completion.outcome.text.clone());
        }

        fn classify(&self, _call: &CoreToolCall) -> ToolClass {
            ToolClass::Other
        }

        async fn run_task_batch(&mut self, _calls: &[CoreToolCall]) -> Vec<ResultBlock> {
            Vec::new()
        }

        async fn prepare_tool(&mut self, call: &CoreToolCall, _mode: DispatchMode) -> Prepared {
            Prepared::Proceed {
                args: call.arguments.clone(),
            }
        }

        fn parallel_future(&self, _prepared: PreparedCall) -> ExecFuture {
            unreachable!("sequential only")
        }

        async fn finish_parallel_tool(
            &mut self,
            _prepared: PreparedCall,
            _result: ExecResult,
        ) -> ResultBlock {
            unreachable!("sequential only")
        }

        async fn execute_sequential_tool(
            &mut self,
            _call: &CoreToolCall,
            _args: serde_json::Value,
        ) -> ExecResult {
            // Stand-in for `execute_tool_calls_batch` (Wry-typed in production).
            ExecResult {
                ok: true,
                output: self.tool_output.clone(),
            }
        }

        async fn finish_sequential_tool(
            &mut self,
            call: &CoreToolCall,
            _args: serde_json::Value,
            result: ExecResult,
        ) -> ResultBlock {
            ResultBlock {
                tool_use_id: call.id.clone(),
                content: result.output,
                is_error: !result.ok,
            }
        }

        async fn commit_tool_results(&mut self, blocks: Vec<ResultBlock>, _iteration: usize) {
            self.committed.push(blocks);
        }

        async fn confirm_tool_runaway(
            &mut self,
            _tracker: &mut RunawayTracker,
            _calls: &[CoreToolCall],
        ) -> LoopControl {
            LoopControl::Continue
        }

        async fn confirm_content_loop(
            &mut self,
            _tracker: &mut RunawayTracker,
            _text: &str,
        ) -> LoopControl {
            LoopControl::Continue
        }

        fn turn_cost_usd(&self, _totals: &UsageTotals) -> f64 {
            0.0
        }

        fn on_event(&mut self, event: &TurnEvent) {
            self.events.push(event.clone());
        }

        fn is_cancelled(&self) -> bool {
            self.cancel_after_commits
                .is_some_and(|n| self.committed.len() >= n)
        }
    }

    fn host(completions: Vec<RouteOutcome>) -> ScriptedDesktopHost {
        ScriptedDesktopHost {
            completions: completions.into(),
            next_prefix_index: 1,
            tool_output: "tool-ran".to_string(),
            cancel_after_commits: None,
            events: Vec::new(),
            committed: Vec::new(),
            assistant_texts: Vec::new(),
        }
    }

    // user turn → assistant text → tool call dispatched → tool result → final text
    #[tokio::test]
    async fn desktop_turn_dispatches_tool_then_finalizes() {
        let first = route_outcome(
            "let me check that",
            Some(vec![ToolCall {
                id: String::new(), // empty → normalize fills it
                name: "read_file".to_string(),
                arguments: "{\"path\":\"a.txt\"}".to_string(),
            }]),
            14,
        );
        let final_turn = route_outcome("final answer", None, 26);
        let mut h = host(vec![first, final_turn]);

        let outcome = {
            let mut tracker = RunawayTracker::new();
            TurnEngine::run_turn(
                &mut h,
                TurnParams {
                    effective_max: 25,
                    max_budget_usd: None,
                },
                &mut tracker,
            )
            .await
            .unwrap()
        };

        // The turn produced the assistant text, dispatched the tool, recorded its
        // result, and finalized with the continuation text.
        assert_eq!(h.assistant_texts, vec!["let me check that", "final answer"]);
        assert_eq!(h.committed.len(), 1, "one tool batch committed");
        assert_eq!(h.committed[0].len(), 1);
        assert_eq!(h.committed[0][0].content, "tool-ran");
        assert!(!h.committed[0][0].is_error);
        // Normalization filled the empty id (prefix `tool_call_1`, index 0).
        assert_eq!(h.committed[0][0].tool_use_id, "tool_call_1_0");
        assert_eq!(outcome.response, "final answer");
        // The engine bracketed the dispatch with iteration + tool events.
        assert!(h
            .events
            .iter()
            .any(|e| matches!(e, TurnEvent::IterationStarted { .. })),);
        assert!(h
            .events
            .iter()
            .any(|e| matches!(e, TurnEvent::ToolStarted { .. })),);
    }

    // Mid-turn cancellation halts before the next completion is requested.
    #[tokio::test]
    async fn desktop_turn_honors_cancellation() {
        // Two tool-requesting completions are scripted, but the user stops after
        // the first batch commits.
        let first = route_outcome(
            "step one",
            Some(vec![ToolCall {
                id: "c1".to_string(),
                name: "read_file".to_string(),
                arguments: "{}".to_string(),
            }]),
            10,
        );
        let second = route_outcome(
            "step two",
            Some(vec![ToolCall {
                id: "c2".to_string(),
                name: "grep_files".to_string(),
                arguments: "{}".to_string(),
            }]),
            10,
        );
        let mut h = host(vec![first, second]);
        h.cancel_after_commits = Some(1);

        let outcome = {
            let mut tracker = RunawayTracker::new();
            TurnEngine::run_turn(
                &mut h,
                TurnParams {
                    effective_max: 25,
                    max_budget_usd: None,
                },
                &mut tracker,
            )
            .await
            .unwrap()
        };

        // Only the first completion was consumed and one batch committed; the
        // second completion was never requested.
        assert_eq!(h.committed.len(), 1);
        assert_eq!(h.assistant_texts, vec!["step one"]);
        assert_eq!(outcome.response, "step one");
    }

    #[test]
    fn agent_progress_payload_matches_inline_shape() {
        // Exact shape of the inline non-streaming loop's `chat:agent-progress`
        // emit (send_message_execution.rs:1651-1660), 1-based iteration.
        let payload = super::agent_progress_payload(42, 3, 25, 2);
        assert_eq!(
            payload,
            serde_json::json!({
                "conversation_id": 42,
                "iteration": 3,
                "max_iterations": 25,
                "status": "executing_tools",
                "tool_count": 2,
            })
        );
    }

    #[test]
    fn tool_calls_payload_matches_inline_shape() {
        use super::StreamingToolCall;
        let calls = vec![StreamingToolCall {
            index: 0,
            id: "tool_call_1_0".to_string(),
            name: "read_file".to_string(),
            arguments: "{\"path\":\"a\"}".to_string(),
        }];
        // With a message id present.
        let payload = super::tool_calls_payload(42, &Some("fmid".to_string()), &calls, 1);
        assert_eq!(
            payload,
            serde_json::json!({
                "conversation_id": 42,
                "message_id": "fmid",
                "tool_calls": [{
                    "index": 0,
                    "id": "tool_call_1_0",
                    "name": "read_file",
                    "arguments": "{\"path\":\"a\"}",
                }],
                "iteration": 1,
            })
        );
        // Absent message id serializes to null, as `request.frontend_message_id` did.
        let payload_none = super::tool_calls_payload(42, &None, &calls, 1);
        assert_eq!(payload_none["message_id"], serde_json::Value::Null);
    }

    #[test]
    fn message_builders_match_inline_shapes() {
        use super::StreamingToolCall;
        let calls = vec![StreamingToolCall {
            index: 0,
            id: "id_1".to_string(),
            name: "read_file".to_string(),
            arguments: "{}".to_string(),
        }];
        let assistant = super::assistant_tool_message("thinking", &calls);
        assert_eq!(assistant.role, "assistant");
        assert_eq!(assistant.content, "thinking");
        assert!(assistant.tool_call_id.is_none());
        let at = assistant.tool_calls.expect("assistant carries tool calls");
        assert_eq!(at.len(), 1);
        assert_eq!(at[0].id, "id_1");
        assert_eq!(at[0].name, "read_file");
        assert_eq!(at[0].arguments, "{}");

        let tool_msg = super::tool_result_message(ResultBlock {
            tool_use_id: "id_1".to_string(),
            content: "output".to_string(),
            is_error: false,
        });
        assert_eq!(tool_msg.role, "tool");
        assert_eq!(tool_msg.content, "output");
        assert_eq!(tool_msg.tool_call_id.as_deref(), Some("id_1"));
        assert!(tool_msg.tool_calls.is_none());
    }

    #[test]
    fn continuation_request_matches_inline_shape() {
        use crate::sys::commands::chat::state::{DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE};
        let messages = vec![crate::core::llm::ChatMessage {
            role: "user".to_string(),
            content: "hi".to_string(),
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: None,
        }];
        let req = super::continuation_request(&messages, "m", &None, &None, Some(false));
        assert_eq!(req.model, "m");
        assert!(!req.stream);
        assert_eq!(req.temperature, Some(DEFAULT_TEMPERATURE));
        assert_eq!(req.max_tokens, Some(DEFAULT_MAX_TOKENS));
        assert_eq!(req.thinking_mode, Some(false));
        assert_eq!(req.messages.len(), 1);
        assert!(req.tools.is_none());
    }

    #[test]
    fn route_outcome_conversion_normalizes_and_parses() {
        let outcome = route_outcome(
            "thinking",
            Some(vec![
                ToolCall {
                    id: String::new(),
                    name: "read_file".to_string(),
                    arguments: "{\"path\":\"x\"}".to_string(),
                },
                ToolCall {
                    id: "explicit".to_string(),
                    name: String::new(), // empty → "unknown_tool"
                    arguments: "not json".to_string(),
                },
            ]),
            8,
        );

        let (chat, normalized) = chat_outcome_from_route(&outcome, "tool_call_3");

        assert_eq!(chat.text, "thinking");
        assert_eq!(chat.tool_calls.len(), 2);
        // Empty id filled with prefix+index; explicit id kept.
        assert_eq!(normalized[0].id, "tool_call_3_0");
        assert_eq!(normalized[1].id, "explicit");
        assert_eq!(normalized[1].name, "unknown_tool");
        // Valid JSON args parse to an object; invalid ones fall back to a string.
        assert_eq!(
            chat.tool_calls[0].arguments,
            serde_json::json!({"path": "x"})
        );
        assert_eq!(
            chat.tool_calls[1].arguments,
            serde_json::Value::String("not json".to_string())
        );
        // Usage carried through.
        assert_eq!(chat.usage.input_tokens, 4);
        assert_eq!(chat.usage.output_tokens, 4);
    }
}
