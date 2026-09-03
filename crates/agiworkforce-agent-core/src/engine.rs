
use futures_util::future::join_all;

use crate::{
    Completion, DispatchMode, LoopControl, Prepared, PreparedCall, ResultBlock, RunawayTracker,
    StreamEvent, ToolClass, TurnEvent, TurnHost, TurnOutcome, TurnParams, TurnPhase, UsageTotals,
    hash_tool_call,
};

/// Zero-sized entry point matching the plan's `TurnEngine::run_turn(...)` sketch.
/// See [`run_turn`] for the parameters; there is no per-instance state.
pub struct TurnEngine;

impl TurnEngine {
    /// Run one full turn. Equivalent to the free [`run_turn`] function.
    pub async fn run_turn(
        host: &mut dyn TurnHost,
        params: TurnParams,
        tracker: &mut RunawayTracker,
    ) -> anyhow::Result<TurnOutcome> {
        run_turn(host, params, tracker).await
    }
}

/// Drive one full agentic turn against `host`.
///
/// `tracker` carries the cross-turn runaway state (rolling tool-call window +
/// strike count); the host owns and persists it across turns.
pub async fn run_turn(
    host: &mut dyn TurnHost,
    params: TurnParams,
    tracker: &mut RunawayTracker,
) -> anyhow::Result<TurnOutcome> {
    // First completion (the one that may fall back / demo, app-local in `complete`).
    let first = complete_and_emit(host, TurnPhase::First).await?;
    host.record_assistant(&first);

    let mut totals = UsageTotals::default();
    totals.add(&first.outcome.usage);
    let mut last_input_tokens = first.outcome.usage.input_tokens;
    let via_subscription = first.via_subscription;
    let mut final_response = first.outcome.text.clone();
    let mut current_tool_calls = first.outcome.tool_calls.clone();

    // The first completion is already paid for and must be included in the
    // ledger, but an exhausted turn budget must stop before any tool side
    // effects or another provider request. Previously the guard ran only after
    // a continuation, allowing a no-tool first response to bypass it entirely.
    if let Some(cap) = params.max_budget_usd {
        let cumulative = host.turn_cost_usd(&totals);
        if cumulative >= cap {
            host.on_event(&TurnEvent::BudgetExceeded {
                cumulative_usd: cumulative,
                cap_usd: cap,
            });
            current_tool_calls.clear();
        }
    }

    for iteration in 0..params.effective_max {
        // --- Cancellation guard (loop-top) -------------------------------------
        // A user stop that arrived while the previous completion was streaming
        // halts the loop before dispatching another tool batch, keeping the
        // response accumulated so far. No-op for hosts that never cancel.
        if host.is_cancelled() {
            break;
        }

        if current_tool_calls.is_empty() {
            break;
        }

        // --- Runaway (identical tool-call) guard -------------------------------
        let call_hashes: Vec<u64> = current_tool_calls
            .iter()
            .map(|tc| hash_tool_call(&tc.name, &tc.arguments))
            .collect();
        tracker.extend(&call_hashes);
        if tracker.has_identical_tail()
            && host
                .confirm_tool_runaway(tracker, &current_tool_calls)
                .await
                == LoopControl::Break
        {
            break;
        }

        host.on_event(&TurnEvent::IterationStarted {
            tool_count: current_tool_calls.len(),
            iteration,
            max: params.effective_max,
        });

        // --- Partition (order: task → parallel read-only → sequential) --------
        let mut task_calls = Vec::new();
        let mut concurrent_calls = Vec::new();
        let mut other_calls = Vec::new();
        for call in &current_tool_calls {
            match host.classify(call) {
                ToolClass::Task => task_calls.push(call.clone()),
                ToolClass::ConcurrentEligible => concurrent_calls.push(call.clone()),
                ToolClass::Other => other_calls.push(call.clone()),
            }
        }

        let mut result_blocks: Vec<ResultBlock> = Vec::new();

        if !task_calls.is_empty() {
            result_blocks.extend(host.run_task_batch(&task_calls).await);
        }

        // Parallel read-only batch via join_all.
        if !concurrent_calls.is_empty() {
            host.on_event(&TurnEvent::ParallelBatchStarted {
                names: concurrent_calls.iter().map(|c| c.name.clone()).collect(),
            });

            let mut runnable: Vec<PreparedCall> = Vec::new();
            for call in &concurrent_calls {
                match host.prepare_tool(call, DispatchMode::Parallel).await {
                    Prepared::Proceed { args } => {
                        host.on_event(&TurnEvent::ToolStarted {
                            id: call.id.clone(),
                            name: call.name.clone(),
                            args: args.clone(),
                            mode: DispatchMode::Parallel,
                        });
                        runnable.push(PreparedCall {
                            id: call.id.clone(),
                            name: call.name.clone(),
                            args,
                        });
                    }
                    Prepared::PreEmpted { block } => result_blocks.push(block),
                }
            }

            let futures = runnable
                .iter()
                .map(|p| host.parallel_future(p.clone()))
                .collect::<Vec<_>>();
            let outcomes = join_all(futures).await;

            for (prepared, result) in runnable.into_iter().zip(outcomes) {
                host.on_event(&TurnEvent::ToolFinished {
                    id: prepared.id.clone(),
                    name: prepared.name.clone(),
                    ok: result.ok,
                    output: result.output.clone(),
                    // Parallel durations were measured post-join in the CLI and
                    // are effectively zero; timing is non-deterministic and not
                    // part of the transcript contract.
                    duration_ms: 0,
                    mode: DispatchMode::Parallel,
                });
                let block = host.finish_parallel_tool(prepared, result).await;
                result_blocks.push(block);
            }
        }

        // Sequential remainder (mutating / MCP / team / update_plan).
        for call in &other_calls {
            match host.prepare_tool(call, DispatchMode::Sequential).await {
                Prepared::Proceed { args } => {
                    host.on_event(&TurnEvent::ToolStarted {
                        id: call.id.clone(),
                        name: call.name.clone(),
                        args: args.clone(),
                        mode: DispatchMode::Sequential,
                    });
                    let started = std::time::Instant::now();
                    let result = host.execute_sequential_tool(call, args.clone()).await;
                    let duration_ms = started.elapsed().as_millis() as u64;
                    host.on_event(&TurnEvent::ToolFinished {
                        id: call.id.clone(),
                        name: call.name.clone(),
                        ok: result.ok,
                        output: result.output.clone(),
                        duration_ms,
                        mode: DispatchMode::Sequential,
                    });
                    let block = host.finish_sequential_tool(call, args, result).await;
                    result_blocks.push(block);
                }
                Prepared::PreEmpted { block } => result_blocks.push(block),
            }
        }

        host.commit_tool_results(result_blocks, iteration).await;

        // --- Cancellation guard (post-dispatch) --------------------------------
        // A stop that arrived during this iteration's tool execution halts the
        // loop before spending another model completion, matching desktop's
        // was-stopped semantics (keep the partial, don't round-trip again).
        if host.is_cancelled() {
            break;
        }

        // Continuation completion (retry-only + privacy re-validate, app-local).
        let continuation = complete_and_emit(host, TurnPhase::Continuation).await?;
        host.record_assistant(&continuation);
        totals.add(&continuation.outcome.usage);
        last_input_tokens = continuation.outcome.usage.input_tokens;
        final_response = continuation.outcome.text.clone();
        current_tool_calls = continuation.outcome.tool_calls.clone();

        // --- Budget guard ------------------------------------------------------
        if let Some(cap) = params.max_budget_usd {
            let cumulative = host.turn_cost_usd(&totals);
            if cumulative >= cap {
                host.on_event(&TurnEvent::BudgetExceeded {
                    cumulative_usd: cumulative,
                    cap_usd: cap,
                });
                break;
            }
        }

        // --- Content-chant guard ----------------------------------------------
        if crate::detect_content_loop(&final_response)
            && host.confirm_content_loop(tracker, &final_response).await == LoopControl::Break
        {
            break;
        }
    }

    host.on_event(&TurnEvent::TurnComplete {
        response: final_response.clone(),
        totals,
    });

    Ok(TurnOutcome {
        response: final_response,
        totals,
        last_input_tokens,
        via_subscription,
    })
}

/// Drive one completion and flush its buffered stream deltas as [`TurnEvent`]s.
///
/// The host feeds provider [`StreamEvent`]s to the sink as they decode; we buffer
/// them (rather than re-enter `host.on_event` mid-`complete`, which would alias
/// the `&mut host` borrow) and replay text/reasoning deltas as turn events after
/// the completion returns. Deltas of one completion always precede that
/// completion's tool dispatch, so replay order matches the live cadence. The CLI
/// host renders text app-locally inside `complete` and no-ops these events; the
/// desktop host and fixtures consume them.
async fn complete_and_emit(
    host: &mut dyn TurnHost,
    phase: TurnPhase,
) -> anyhow::Result<Completion> {
    let mut buffered: Vec<StreamEvent> = Vec::new();
    let completion = {
        let mut sink = |event: StreamEvent| buffered.push(event);
        host.complete(phase, &mut sink).await?
    };
    for event in buffered {
        match event {
            StreamEvent::TextDelta { text } => host.on_event(&TurnEvent::TextDelta { text, phase }),
            StreamEvent::ReasoningDelta { text } => {
                host.on_event(&TurnEvent::ReasoningDelta { text })
            }
            // Tool-call / usage / keepalive / vendor / end events are folded into
            // the authoritative Completion by the host; they are not turn-level
            // observable in e1.
            _ => {}
        }
    }
    Ok(completion)
}
