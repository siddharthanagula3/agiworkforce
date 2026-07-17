//! Characterization fixtures for the turn-loop engine.
//!
//! The CLI's `json_events_jsonl` gate only exercises the demo-fallback path
//! (first completion → rate-limit → fallback → demo text → empty tool_calls →
//! loop breaks on iteration 0). It never dispatches a tool, so these fixtures
//! are the ONLY guard on the loop MECHANICS: partition/order, the parallel
//! read-only batch, sequential dispatch, tool-error propagation, malformed-args
//! pre-emption, and the runaway / iteration-limit / budget guards. Each case
//! scripts completions × tool results and asserts the emitted `TurnEvent`
//! transcript + the `TurnOutcome`, characterizing exactly what the historical
//! `Session::send` loop did.

use std::collections::{HashMap, VecDeque};

use agiworkforce_agent_core::{
    Completion, DispatchMode, ExecFuture, ExecResult, LoopControl, Prepared, PreparedCall,
    ResultBlock, RunawayTracker, StreamEvent, ToolClass, TurnEngine, TurnEvent, TurnHost,
    TurnParams, TurnPhase, UsageTotals,
};
use agiworkforce_llm::{ChatOutcome, ToolCall, Usage};

// ---------------------------------------------------------------------------
// Scripted host
// ---------------------------------------------------------------------------

#[derive(Clone)]
struct ScriptedCompletion {
    outcome: ChatOutcome,
    via_subscription: bool,
    /// Stream events fed to the engine sink before the completion returns (used
    /// to characterize `TextDelta`/`ReasoningDelta` forwarding).
    stream: Vec<StreamEvent>,
    /// When set, `complete()` returns this error instead of the outcome.
    error: Option<String>,
}

struct ScriptedHost {
    completions: VecDeque<ScriptedCompletion>,
    /// Tool-name → scheduling class (default `Other`).
    classes: HashMap<String, ToolClass>,
    /// Tool-name → execution result (default ok/empty).
    tool_results: HashMap<String, ExecResult>,
    /// Tool-name → pre-emption block (default: proceed with the call's args).
    preempt: HashMap<String, ResultBlock>,
    /// Scripted task-batch result blocks (returned wholesale).
    task_blocks: Vec<ResultBlock>,
    runaway: LoopControl,
    content_loop: LoopControl,
    /// Fixed per-turn cost reported to the budget guard.
    cost: f64,
    /// When `Some(n)`, `is_cancelled()` reports `true` once `n` tool batches have
    /// been committed — used to characterize mid-turn cancellation.
    cancel_after_commits: Option<usize>,

    // ---- recording ----
    events: Vec<TurnEvent>,
    committed: Vec<Vec<ResultBlock>>,
    assistant_texts: Vec<String>,
    runaway_confirmed: usize,
    content_confirmed: usize,
}

impl ScriptedHost {
    fn new(completions: Vec<ScriptedCompletion>) -> Self {
        Self {
            completions: completions.into(),
            classes: HashMap::new(),
            tool_results: HashMap::new(),
            preempt: HashMap::new(),
            task_blocks: Vec::new(),
            runaway: LoopControl::Break,
            content_loop: LoopControl::Break,
            cost: 0.0,
            cancel_after_commits: None,
            events: Vec::new(),
            committed: Vec::new(),
            assistant_texts: Vec::new(),
            runaway_confirmed: 0,
            content_confirmed: 0,
        }
    }

    fn class(mut self, name: &str, class: ToolClass) -> Self {
        self.classes.insert(name.to_string(), class);
        self
    }

    fn result(mut self, name: &str, ok: bool, output: &str) -> Self {
        self.tool_results.insert(
            name.to_string(),
            ExecResult {
                ok,
                output: output.to_string(),
            },
        );
        self
    }

    fn preempt_tool(mut self, name: &str, block: ResultBlock) -> Self {
        self.preempt.insert(name.to_string(), block);
        self
    }

    fn cancel_after(mut self, commits: usize) -> Self {
        self.cancel_after_commits = Some(commits);
        self
    }

    fn exec_result_for(&self, name: &str) -> ExecResult {
        self.tool_results.get(name).cloned().unwrap_or(ExecResult {
            ok: true,
            output: format!("{name}:ok"),
        })
    }
}

#[async_trait::async_trait]
impl TurnHost for ScriptedHost {
    async fn complete(
        &mut self,
        phase: TurnPhase,
        sink: &mut (dyn FnMut(StreamEvent) + Send),
    ) -> anyhow::Result<Completion> {
        let sc = self
            .completions
            .pop_front()
            .expect("engine requested more completions than were scripted");
        for ev in &sc.stream {
            sink(ev.clone());
        }
        let _ = phase;
        if let Some(msg) = sc.error {
            return Err(anyhow::anyhow!(msg));
        }
        Ok(Completion {
            outcome: sc.outcome,
            via_subscription: sc.via_subscription,
        })
    }

    fn record_assistant(&mut self, completion: &Completion) {
        self.assistant_texts.push(completion.outcome.text.clone());
    }

    fn classify(&self, call: &ToolCall) -> ToolClass {
        self.classes
            .get(&call.name)
            .copied()
            .unwrap_or(ToolClass::Other)
    }

    async fn run_task_batch(&mut self, _calls: &[ToolCall]) -> Vec<ResultBlock> {
        self.task_blocks.clone()
    }

    async fn prepare_tool(&mut self, call: &ToolCall, _mode: DispatchMode) -> Prepared {
        if let Some(block) = self.preempt.get(&call.name) {
            Prepared::PreEmpted {
                block: block.clone(),
            }
        } else {
            Prepared::Proceed {
                args: call.arguments.clone(),
            }
        }
    }

    fn parallel_future(&self, prepared: PreparedCall) -> ExecFuture {
        let result = self.exec_result_for(&prepared.name);
        Box::pin(async move { result })
    }

    async fn finish_parallel_tool(
        &mut self,
        prepared: PreparedCall,
        result: ExecResult,
    ) -> ResultBlock {
        // Parallel path forwards the RAW output (no transforms).
        ResultBlock {
            tool_use_id: prepared.id,
            content: result.output,
            is_error: !result.ok,
        }
    }

    async fn execute_sequential_tool(
        &mut self,
        call: &ToolCall,
        _args: serde_json::Value,
    ) -> ExecResult {
        self.exec_result_for(&call.name)
    }

    async fn finish_sequential_tool(
        &mut self,
        call: &ToolCall,
        _args: serde_json::Value,
        result: ExecResult,
    ) -> ResultBlock {
        // Sequential path may transform; here we forward, tagging to prove the
        // sequential finisher (not the parallel one) produced the block.
        ResultBlock {
            tool_use_id: call.id.clone(),
            content: format!("seq:{}", result.output),
            is_error: !result.ok,
        }
    }

    async fn commit_tool_results(&mut self, blocks: Vec<ResultBlock>, _iteration: usize) {
        self.committed.push(blocks);
    }

    async fn confirm_tool_runaway(
        &mut self,
        tracker: &mut RunawayTracker,
        _calls: &[ToolCall],
    ) -> LoopControl {
        self.runaway_confirmed += 1;
        // Mirror the CLI: on continue, the rolling window is cleared.
        if self.runaway == LoopControl::Continue {
            tracker.clear_recent();
        }
        self.runaway
    }

    async fn confirm_content_loop(
        &mut self,
        _tracker: &mut RunawayTracker,
        _text: &str,
    ) -> LoopControl {
        self.content_confirmed += 1;
        self.content_loop
    }

    fn turn_cost_usd(&self, _totals: &UsageTotals) -> f64 {
        self.cost
    }

    fn on_event(&mut self, event: &TurnEvent) {
        self.events.push(event.clone());
    }

    fn is_cancelled(&self) -> bool {
        self.cancel_after_commits
            .is_some_and(|n| self.committed.len() >= n)
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn tc(id: &str, name: &str) -> ToolCall {
    ToolCall {
        id: id.to_string(),
        name: name.to_string(),
        arguments: serde_json::json!({}),
    }
}

fn completion(text: &str, tool_calls: Vec<ToolCall>) -> ScriptedCompletion {
    ScriptedCompletion {
        outcome: ChatOutcome {
            text: text.to_string(),
            tool_calls,
            usage: Usage::default(),
            stop_reason: Some("end_turn".to_string()),
        },
        via_subscription: false,
        stream: Vec::new(),
        error: None,
    }
}

fn completion_usage(text: &str, tool_calls: Vec<ToolCall>, usage: Usage) -> ScriptedCompletion {
    let mut c = completion(text, tool_calls);
    c.outcome.usage = usage;
    c
}

/// Normalize non-deterministic `duration_ms` on `ToolFinished` so the transcript
/// can be compared exactly.
fn norm(events: &[TurnEvent]) -> Vec<TurnEvent> {
    events
        .iter()
        .map(|e| match e {
            TurnEvent::ToolFinished {
                id,
                name,
                ok,
                output,
                mode,
                ..
            } => TurnEvent::ToolFinished {
                id: id.clone(),
                name: name.clone(),
                ok: *ok,
                output: output.clone(),
                duration_ms: 0,
                mode: *mode,
            },
            other => other.clone(),
        })
        .collect()
}

fn params(effective_max: usize, max_budget_usd: Option<f64>) -> TurnParams {
    TurnParams {
        effective_max,
        max_budget_usd,
    }
}

async fn drive(host: &mut ScriptedHost, params: TurnParams) -> anyhow::Result<()> {
    let mut tracker = RunawayTracker::new();
    TurnEngine::run_turn(host, params, &mut tracker).await?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

#[tokio::test]
async fn single_sequential_tool_call() {
    // First completion asks for one (sequential) tool; the continuation ends.
    let mut host = ScriptedHost::new(vec![
        completion("thinking", vec![tc("t1", "read_file")]),
        completion("done", vec![]),
    ])
    .result("read_file", true, "file-body");

    let outcome = {
        let mut tracker = RunawayTracker::new();
        TurnEngine::run_turn(&mut host, params(25, None), &mut tracker)
            .await
            .unwrap()
    };

    assert_eq!(outcome.response, "done");
    assert_eq!(host.assistant_texts, vec!["thinking", "done"]);
    // One committed batch with the sequential-tagged, non-error block.
    assert_eq!(host.committed.len(), 1);
    assert_eq!(host.committed[0].len(), 1);
    assert_eq!(host.committed[0][0].content, "seq:file-body");
    assert!(!host.committed[0][0].is_error);

    assert_eq!(
        norm(&host.events),
        vec![
            TurnEvent::IterationStarted {
                tool_count: 1,
                iteration: 0,
                max: 25,
            },
            TurnEvent::ToolStarted {
                id: "t1".into(),
                name: "read_file".into(),
                args: serde_json::json!({}),
                mode: DispatchMode::Sequential,
            },
            TurnEvent::ToolFinished {
                id: "t1".into(),
                name: "read_file".into(),
                ok: true,
                output: "file-body".into(),
                duration_ms: 0,
                mode: DispatchMode::Sequential,
            },
            TurnEvent::TurnComplete {
                response: "done".into(),
                totals: UsageTotals::default(),
            },
        ]
    );
}

#[tokio::test]
async fn parallel_read_only_batch_starts_all_then_finishes_all() {
    // Two concurrent-eligible read-only tools run as a batch: both ToolStarted
    // are emitted (during prepare) before either ToolFinished (post join_all).
    let mut host = ScriptedHost::new(vec![
        completion("plan", vec![tc("a", "grep_files"), tc("b", "read_file")]),
        completion("summary", vec![]),
    ])
    .class("grep_files", ToolClass::ConcurrentEligible)
    .class("read_file", ToolClass::ConcurrentEligible)
    .result("grep_files", true, "hits")
    .result("read_file", true, "body");

    drive(&mut host, params(25, None)).await.unwrap();

    let events = norm(&host.events);
    assert_eq!(
        events[0],
        TurnEvent::IterationStarted {
            tool_count: 2,
            iteration: 0,
            max: 25
        }
    );
    assert_eq!(
        events[1],
        TurnEvent::ParallelBatchStarted {
            names: vec!["grep_files".into(), "read_file".into()],
        }
    );
    // Both starts precede both finishes (join_all semantics).
    assert!(matches!(events[2], TurnEvent::ToolStarted { .. }));
    assert!(matches!(events[3], TurnEvent::ToolStarted { .. }));
    assert!(matches!(events[4], TurnEvent::ToolFinished { .. }));
    assert!(matches!(events[5], TurnEvent::ToolFinished { .. }));
    assert!(matches!(events[6], TurnEvent::TurnComplete { .. }));

    // Parallel path forwards RAW output (no `seq:` transform prefix).
    assert_eq!(host.committed[0].len(), 2);
    assert_eq!(host.committed[0][0].content, "hits");
    assert_eq!(host.committed[0][1].content, "body");
}

#[tokio::test]
async fn task_batch_then_parallel_then_sequential_order() {
    // A turn mixing all three classes accumulates result blocks in the fixed
    // order: task → parallel → sequential.
    let mut host = ScriptedHost::new(vec![
        completion(
            "mixed",
            vec![
                tc("s1", "write_file"), // sequential (Other)
                tc("p1", "read_file"),  // parallel
                tc("k1", "task"),       // task
            ],
        ),
        completion("end", vec![]),
    ])
    .class("task", ToolClass::Task)
    .class("read_file", ToolClass::ConcurrentEligible)
    .result("read_file", true, "P")
    .result("write_file", true, "S");
    host.task_blocks = vec![ResultBlock {
        tool_use_id: "k1".into(),
        content: "K".into(),
        is_error: false,
    }];

    drive(&mut host, params(25, None)).await.unwrap();

    let contents: Vec<&str> = host.committed[0]
        .iter()
        .map(|b| b.content.as_str())
        .collect();
    // task ("K") first, then parallel raw ("P"), then sequential ("seq:S").
    assert_eq!(contents, vec!["K", "P", "seq:S"]);
}

#[tokio::test]
async fn tool_error_propagates_into_result_block() {
    let mut host = ScriptedHost::new(vec![
        completion("try", vec![tc("t1", "run_command")]),
        completion("recovered", vec![]),
    ])
    .result("run_command", false, "boom");

    drive(&mut host, params(25, None)).await.unwrap();

    // ToolFinished carries ok=false; the committed block is an error block.
    let finished = host
        .events
        .iter()
        .find_map(|e| match e {
            TurnEvent::ToolFinished { ok, .. } => Some(*ok),
            _ => None,
        })
        .unwrap();
    assert!(!finished);
    assert!(host.committed[0][0].is_error);
    assert_eq!(host.committed[0][0].content, "seq:boom");
}

#[tokio::test]
async fn malformed_args_preempt_before_tool_starts() {
    // A malformed-args tool is pre-empted in prepare_tool: no ToolStarted/
    // ToolFinished is emitted, and an error block is committed.
    let preempt = ResultBlock {
        tool_use_id: "t1".into(),
        content: "{\"error\":\"invalid_tool_arguments\"}".into(),
        is_error: true,
    };
    let mut host = ScriptedHost::new(vec![
        completion("bad", vec![tc("t1", "edit_file")]),
        completion("ok", vec![]),
    ])
    .preempt_tool("edit_file", preempt);

    drive(&mut host, params(25, None)).await.unwrap();

    assert!(
        !host
            .events
            .iter()
            .any(|e| matches!(e, TurnEvent::ToolStarted { .. })),
        "pre-empted tool must not emit ToolStarted"
    );
    assert!(
        !host
            .events
            .iter()
            .any(|e| matches!(e, TurnEvent::ToolFinished { .. })),
        "pre-empted tool must not emit ToolFinished"
    );
    assert_eq!(host.committed[0].len(), 1);
    assert!(host.committed[0][0].is_error);
}

#[tokio::test]
async fn runaway_identical_calls_trips_and_breaks() {
    // Five iterations of the SAME tool call fill the rolling window; the sixth
    // top-of-loop check sees an identical tail and the host confirms a break.
    let repeat = || completion("loop", vec![tc("x", "read_file")]);
    let mut host = ScriptedHost::new(vec![
        repeat(),
        repeat(),
        repeat(),
        repeat(),
        repeat(),
        repeat(),
    ])
    .result("read_file", true, "same");
    host.runaway = LoopControl::Break;

    drive(&mut host, params(25, None)).await.unwrap();

    assert_eq!(
        host.runaway_confirmed, 1,
        "runaway confirmation should fire exactly once"
    );
    // Broke at iteration index 4 (the 5th), so only 4 dispatch batches ran.
    assert_eq!(host.committed.len(), 4);
}

#[tokio::test]
async fn iteration_limit_trips() {
    // Distinct tool calls each turn (so runaway never trips); max=2 stops after
    // exactly two dispatch iterations even though the model keeps calling tools.
    let mut host = ScriptedHost::new(vec![
        completion("i0", vec![tc("a", "read_file")]),
        completion("i1", vec![tc("b", "grep_files")]),
        completion("i2", vec![tc("c", "list_directory")]),
    ])
    .result("read_file", true, "0")
    .result("grep_files", true, "1")
    .result("list_directory", true, "2");

    drive(&mut host, params(2, None)).await.unwrap();

    // Two IterationStarted events, two committed batches, then stop.
    let iterations = host
        .events
        .iter()
        .filter(|e| matches!(e, TurnEvent::IterationStarted { .. }))
        .count();
    assert_eq!(iterations, 2);
    assert_eq!(host.committed.len(), 2);
    assert_eq!(host.runaway_confirmed, 0);
}

#[tokio::test]
async fn budget_cap_trips_and_emits_event() {
    let mut host = ScriptedHost::new(vec![
        completion("spend", vec![tc("t1", "run_command")]),
        completion("more", vec![tc("t2", "run_command")]),
    ])
    .result("run_command", true, "ok");
    host.cost = 5.0; // exceeds the $1 cap after the first continuation

    drive(&mut host, params(25, Some(1.0))).await.unwrap();

    let budget = host.events.iter().find_map(|e| match e {
        TurnEvent::BudgetExceeded {
            cumulative_usd,
            cap_usd,
        } => Some((*cumulative_usd, *cap_usd)),
        _ => None,
    });
    assert_eq!(budget, Some((5.0, 1.0)));
    // Loop broke after the budget check, so only one dispatch iteration ran.
    assert_eq!(host.committed.len(), 1);
}

#[tokio::test]
async fn mid_turn_stream_error_propagates() {
    // The continuation completion errors; run_turn surfaces it (the CLI caller
    // then applies finalize_cancelled_turn semantics — app-local, not the
    // engine's concern).
    let mut err_continuation = completion("", vec![]);
    err_continuation.error = Some("stream disconnected".to_string());
    let mut host = ScriptedHost::new(vec![
        completion("start", vec![tc("t1", "read_file")]),
        err_continuation,
    ])
    .result("read_file", true, "body");

    let mut tracker = RunawayTracker::new();
    let result = TurnEngine::run_turn(&mut host, params(25, None), &mut tracker).await;

    assert!(result.is_err());
    assert!(
        result
            .unwrap_err()
            .to_string()
            .contains("stream disconnected"),
        "the underlying error text must propagate unchanged"
    );
    // The first dispatch completed and committed before the continuation failed.
    assert_eq!(host.committed.len(), 1);
    // No TurnComplete was emitted on the error path.
    assert!(!host
        .events
        .iter()
        .any(|e| matches!(e, TurnEvent::TurnComplete { .. })));
}

#[tokio::test]
async fn text_deltas_forward_as_turn_events() {
    // A completion that streams text deltas surfaces them as TurnEvents (the
    // desktop host + fixtures consume these; the CLI renders app-locally).
    let mut first = completion("hi there", vec![]);
    first.stream = vec![
        StreamEvent::TextDelta { text: "hi ".into() },
        StreamEvent::ReasoningDelta {
            text: "(pondering)".into(),
        },
        StreamEvent::TextDelta {
            text: "there".into(),
        },
    ];
    let mut host = ScriptedHost::new(vec![first]);

    drive(&mut host, params(25, None)).await.unwrap();

    assert_eq!(
        norm(&host.events),
        vec![
            TurnEvent::TextDelta {
                text: "hi ".into(),
                phase: TurnPhase::First,
            },
            TurnEvent::ReasoningDelta {
                text: "(pondering)".into(),
            },
            TurnEvent::TextDelta {
                text: "there".into(),
                phase: TurnPhase::First,
            },
            TurnEvent::TurnComplete {
                response: "hi there".into(),
                totals: UsageTotals::default(),
            },
        ]
    );
}

#[tokio::test]
async fn usage_totals_accumulate_across_iterations() {
    let usage = |i: u32, o: u32| Usage {
        input_tokens: i,
        output_tokens: o,
        ..Usage::default()
    };
    let mut host = ScriptedHost::new(vec![
        completion_usage("a", vec![tc("t1", "read_file")], usage(10, 5)),
        completion_usage("b", vec![], usage(3, 7)),
    ])
    .result("read_file", true, "x");

    let outcome = {
        let mut tracker = RunawayTracker::new();
        TurnEngine::run_turn(&mut host, params(25, None), &mut tracker)
            .await
            .unwrap()
    };

    assert_eq!(outcome.totals.input_tokens, 13);
    assert_eq!(outcome.totals.output_tokens, 12);
    assert_eq!(outcome.last_input_tokens, 3);
    assert_eq!(outcome.response, "b");
}

#[tokio::test]
async fn cancellation_mid_turn_stops_after_committed_batch() {
    // The model keeps requesting distinct tools, but the user stops mid-turn:
    // after the FIRST tool batch commits, `is_cancelled()` flips true and the
    // post-dispatch guard breaks the loop BEFORE the next model completion is
    // spent. The response is whatever had been produced so far.
    let mut host = ScriptedHost::new(vec![
        completion("i0", vec![tc("a", "read_file")]),
        completion("i1", vec![tc("b", "grep_files")]),
        completion("i2", vec![tc("c", "list_directory")]),
    ])
    .result("read_file", true, "0")
    .cancel_after(1);

    let outcome = {
        let mut tracker = RunawayTracker::new();
        TurnEngine::run_turn(&mut host, params(25, None), &mut tracker)
            .await
            .unwrap()
    };

    // Exactly one dispatch batch ran before the stop was observed.
    assert_eq!(host.committed.len(), 1);
    // Only the first completion was consumed — no continuation round-trip.
    assert_eq!(host.assistant_texts, vec!["i0"]);
    // The turn still finalizes cleanly (TurnComplete emitted, partial response).
    assert_eq!(outcome.response, "i0");
    assert!(
        host.events
            .iter()
            .any(|e| matches!(e, TurnEvent::TurnComplete { .. })),
        "a cancelled turn still emits TurnComplete with the partial response"
    );
}

#[tokio::test]
async fn cancellation_before_first_dispatch_runs_no_tools() {
    // A stop already latched when the turn begins: the loop-top guard breaks at
    // iteration 0 before any tool is dispatched. The first completion's text is
    // the final response and no tool batch is committed.
    let mut host = ScriptedHost::new(vec![completion("only", vec![tc("t1", "read_file")])])
        .result("read_file", true, "x")
        .cancel_after(0);

    let outcome = {
        let mut tracker = RunawayTracker::new();
        TurnEngine::run_turn(&mut host, params(25, None), &mut tracker)
            .await
            .unwrap()
    };

    assert!(host.committed.is_empty(), "no tool batch should run");
    assert!(
        !host
            .events
            .iter()
            .any(|e| matches!(e, TurnEvent::IterationStarted { .. })),
        "no iteration should start once cancellation is already latched"
    );
    assert_eq!(outcome.response, "only");
}
