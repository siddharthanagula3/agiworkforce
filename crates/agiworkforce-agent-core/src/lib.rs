//! Shared agent turn-loop engine for AGI Workforce Rust surfaces.
//!
//! Extracted from the CLI's `apps/cli/src/agent/chat.rs::Session::send`
//! (Wave 5, stage e1 of `docs/plans/rust-engine-extraction-2026-07-09.md`).
//! Holds the turn-loop MECHANICS only:
//!
//! - iterate first-completion → agentic tool loop until end-turn/limits;
//! - assemble/consume the model's completion (via `agiworkforce-llm`) and drive
//!   its stream events;
//! - partition tool calls and SCHEDULE them: subagent/`task` batch, then a
//!   parallel read-only batch (`futures_util::future::join_all`), then the
//!   sequential remainder — preserving the CLI's fixed ordering;
//! - runaway detection (identical tool-call + content-chant), iteration-limit,
//!   and budget guards;
//! - emit a [`TurnEvent`] at exactly the points the CLI historically mutated
//!   observable state.
//!
//! Everything provider-, policy-, or presentation-specific stays app-local
//! behind [`TurnHost`]: model completion (spec resolution, fallback/demo/retry,
//! privacy-boundary re-validation), per-tool execution + hooks + tool-filters +
//! plan-mode gating, subagent spawning, approval UI, message-history mutation,
//! cost pricing, and the routing of [`TurnEvent`]s onto the host's real
//! stdout/stderr/TUI sinks. The engine never performs I/O, reads credentials,
//! prints, or prompts — it only orchestrates.
//!
//! ## Relationship to the sketched `run_turn(llm, spec, req, host)` API
//!
//! The plan sketched `TurnEngine::run_turn(llm, spec, req, host)`. In the real
//! tree there is no `LlmClient` object and the CLI's streaming facade
//! (`models::stream_completion`) resolves keys/subscription-auth/Ollama probing
//! app-locally and returns an already-assembled outcome whose tool-call and
//! usage accumulation is dialect-specific and NOT reconstructable from the
//! public [`agiworkforce_llm::StreamEvent`] stream. So `llm`/`spec`/`req` fold
//! into [`TurnHost::complete`]: the host drives `agiworkforce-llm` (directly or
//! through its facade), forwards stream events to the engine's sink, and returns
//! the authoritative [`Completion`]. This keeps the trust-boundary and
//! provider-selection code app-local while the engine still owns the loop.

use std::future::Future;
use std::pin::Pin;

use serde::Serialize;

pub mod engine;
pub mod runaway;

pub use engine::{TurnEngine, run_turn};
pub use runaway::{
    CONTENT_CHUNK_SIZE, CONTENT_LOOP_CHUNK_THRESHOLD, CONTENT_LOOP_DISTANCE,
    LOOP_DETECTION_THRESHOLD, MAX_AGENTIC_ITERATIONS, RunawayTracker, detect_content_loop,
    hash_tool_call,
};

// Re-export the shared LLM surface the engine speaks in. (The plan's sketched
// `dispatch() -> &dyn ToolDispatch` is deferred to stage e2 — see the Cargo.toml
// note: the CLI's mutating/approval-gated dispatch cannot flow through
// app-server's read-only `&self` `ToolDispatch`, so the e1 dispatch seam is
// TurnHost's execute methods.)
pub use agiworkforce_llm::{ChatOutcome, StreamEvent, ToolCall, Usage};

/// Which model call within a turn produced a stream event / completion. The CLI
/// routes first-call text through the caller's `StreamCallback` and continuation
/// text through its `continuation_sink()`; the two differ in non-`--json-events`
/// output, so the phase must survive into the host.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TurnPhase {
    /// The first completion of the turn (the one that may fall back / demo).
    First,
    /// A continuation completion after a tool batch.
    Continuation,
}

/// How a tool is being dispatched. Drives the CLI's sequential-vs-parallel
/// asymmetry: the sequential path applies `PostToolUse` output transforms and
/// accrues `additional_context`; the parallel read-only path runs post-hooks for
/// side-effects only and forwards the raw tool output.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DispatchMode {
    Parallel,
    Sequential,
}

/// Scheduling class for a tool call in a batch. Classification is host-side (it
/// depends on app-local state: `skip_permissions`, the concurrency-safe tool
/// set, team/MCP name conventions), but the PARTITION and ORDER are the engine's.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToolClass {
    /// A subagent `task` call — spawned/awaited/collected entirely host-side.
    Task,
    /// Eligible for the parallel read-only batch.
    ConcurrentEligible,
    /// Runs sequentially (mutating tools, MCP, team, `update_plan`, …).
    Other,
}

/// A tool-result content block the model sees on the next turn. Mirrors the
/// CLI's `ContentBlock::ToolResult` shape; the host converts to/from its own
/// message type at the boundary.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ResultBlock {
    pub tool_use_id: String,
    pub content: String,
    pub is_error: bool,
}

/// One model completion, as the loop consumes it: the authoritative assembled
/// [`ChatOutcome`] plus the CLI's subscription flag (which `ChatOutcome` does not
/// carry). Produced by [`TurnHost::complete`].
#[derive(Debug, Clone, Default)]
pub struct Completion {
    pub outcome: ChatOutcome,
    /// True when the completion was served via a subscription (Copilot/ChatGPT).
    pub via_subscription: bool,
}

/// Cumulative token usage across the turn's completions. Fed to
/// [`TurnHost::turn_cost_usd`] for the budget guard and returned in
/// [`TurnOutcome`] for the session's ledger.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
pub struct UsageTotals {
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub cache_read_tokens: u32,
    pub cache_creation_tokens: u32,
    pub reasoning_tokens: u32,
}

impl UsageTotals {
    /// Fold one completion's usage into the running totals.
    pub fn add(&mut self, usage: &Usage) {
        self.input_tokens += usage.input_tokens;
        self.output_tokens += usage.output_tokens;
        self.cache_read_tokens += usage.cache_read_input_tokens;
        self.cache_creation_tokens += usage.cache_creation_input_tokens;
        self.reasoning_tokens += usage.reasoning_output_tokens;
    }
}

/// A tool call that passed pre-dispatch checks and is ready to execute, with the
/// hook-effective arguments.
#[derive(Debug, Clone, PartialEq)]
pub struct PreparedCall {
    pub id: String,
    pub name: String,
    pub args: serde_json::Value,
}

/// Outcome of [`TurnHost::prepare_tool`]: either proceed with hook-effective
/// arguments, or a pre-empted result block (unavailable tool, invalid arguments,
/// blocked/stopped by a hook, tool-filter violation, or plan-mode gate) that the
/// engine records without executing.
#[derive(Debug, Clone, PartialEq)]
pub enum Prepared {
    Proceed { args: serde_json::Value },
    PreEmpted { block: ResultBlock },
}

/// The raw result of executing one tool: success flag + output text (already
/// mapped from any executor error by the host).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ExecResult {
    pub ok: bool,
    pub output: String,
}

/// A boxed, `'static`, `Send` future executing one prepared parallel tool. The
/// host builds it capturing owned data only (never borrowing `&self`), so the
/// engine can drive the whole batch through `join_all`.
pub type ExecFuture = Pin<Box<dyn Future<Output = ExecResult> + Send>>;

/// Whether the engine should keep looping or stop, as decided by a host approval
/// prompt (runaway / content-loop confirmation).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LoopControl {
    Continue,
    Break,
}

/// Observable turn events, emitted by the engine at exactly the CLI's historical
/// mutation points and routed by [`TurnHost::on_event`] onto the host's real
/// sinks (stdout JSONL, stderr status lines, TUI transcript cells).
///
/// `TextDelta`/`ReasoningDelta` are populated only when the host feeds stream
/// events to [`TurnHost::complete`]'s sink; the CLI renders text app-locally
/// inside `complete` (to keep byte-for-byte incremental output) and treats these
/// as no-ops, while fixtures and the desktop host consume them. `FallbackRotated`
/// is likewise host-emitted in the CLI (its `on_fallback` sink fires inside
/// `complete`); the variant exists for the desktop host and fixtures.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum TurnEvent {
    /// A user-visible assistant text delta from the model stream.
    TextDelta { text: String, phase: TurnPhase },
    /// An extended-thinking delta (never merged into the answer).
    ReasoningDelta { text: String },
    /// The fallback chain rotated models. (Desktop/fixtures; the CLI fires its
    /// own `on_fallback` sink inside `complete`.)
    FallbackRotated {
        from: String,
        to: String,
        kind: String,
    },
    /// A new agentic iteration is about to dispatch `tool_count` tools.
    IterationStarted {
        tool_count: usize,
        iteration: usize,
        max: usize,
    },
    /// A parallel read-only batch of the named tools is starting.
    ParallelBatchStarted { names: Vec<String> },
    /// A tool is about to execute (post pre-checks, pre-execution).
    ToolStarted {
        id: String,
        name: String,
        args: serde_json::Value,
        mode: DispatchMode,
    },
    /// A tool finished executing (pre post-hooks/transforms).
    ToolFinished {
        id: String,
        name: String,
        ok: bool,
        output: String,
        duration_ms: u64,
        mode: DispatchMode,
    },
    /// The cumulative spend cap was reached; the loop stops after this.
    BudgetExceeded { cumulative_usd: f64, cap_usd: f64 },
    /// The turn finished. Carries the final assistant text and token totals.
    TurnComplete {
        response: String,
        totals: UsageTotals,
    },
}

/// Per-turn configuration the host computes and hands to the engine.
#[derive(Debug, Clone, Copy)]
pub struct TurnParams {
    /// Maximum agentic iterations for this turn (`max_turns` or
    /// [`MAX_AGENTIC_ITERATIONS`]).
    pub effective_max: usize,
    /// Cumulative-spend cap in USD, if any.
    pub max_budget_usd: Option<f64>,
}

/// The result of one full turn: final assistant text, token totals, and the
/// subscription flag from the first completion. The host records these into its
/// session counters / ledger / post-turn pipeline.
#[derive(Debug, Clone, Default)]
pub struct TurnOutcome {
    pub response: String,
    pub totals: UsageTotals,
    pub via_subscription: bool,
}

/// The app-local surface the engine drives. The CLI's `AgentSession` implements
/// this; each method holds the CLI-local work moved out of `Session::send`.
///
/// Method ordering the engine guarantees per iteration: `run_task_batch`
/// (subagents) → for each parallel-eligible call `prepare_tool(Parallel)` +
/// `parallel_future` (then `join_all`, then `finish_parallel_tool`) → for each
/// other call `prepare_tool(Sequential)` + `execute_sequential_tool` +
/// `finish_sequential_tool` → `commit_tool_results`. Result blocks accumulate in
/// that exact order into one user message, matching the CLI verbatim.
#[async_trait::async_trait]
pub trait TurnHost: Send {
    /// Drive one model completion for the current history. `sink` receives the
    /// provider's [`StreamEvent`]s (text/reasoning deltas) as they decode; the
    /// return value is the authoritative assembled outcome. All app-local
    /// completion concerns live here: spec/key resolution, subscription auth,
    /// first-call fallback/demo/retry, continuation retry, and privacy-boundary
    /// re-validation. Errors propagate out of `run_turn` unchanged.
    async fn complete(
        &mut self,
        phase: TurnPhase,
        sink: &mut (dyn FnMut(StreamEvent) + Send),
    ) -> anyhow::Result<Completion>;

    /// Append the assistant message for a completion to the history.
    fn record_assistant(&mut self, completion: &Completion);

    /// Classify a tool call for scheduling. Host-side: depends on app-local
    /// permission/tool-catalog state.
    fn classify(&self, call: &ToolCall) -> ToolClass;

    /// Run the entire subagent `task` batch (spawn-all → wait-all → collect),
    /// returning result blocks in the host's historical order. Runs its own
    /// pre-checks and hooks; the engine does not bracket task calls with tool
    /// events (they were never TUI/JSONL tool cells).
    async fn run_task_batch(&mut self, calls: &[ToolCall]) -> Vec<ResultBlock>;

    /// Pre-dispatch checks for one non-task tool: availability, invalid-args,
    /// plan-mode gate (sequential only), `PreToolUse` hooks, and tool-filters.
    /// Returns either the hook-effective args to proceed with, or a pre-empted
    /// result block.
    async fn prepare_tool(&mut self, call: &ToolCall, mode: DispatchMode) -> Prepared;

    /// Build the `'static` execution future for a prepared parallel read-only
    /// tool. Must capture owned data only.
    fn parallel_future(&self, prepared: PreparedCall) -> ExecFuture;

    /// Finish a parallel tool: post-hooks for side-effects only (NO output
    /// transforms), returning the raw-output result block.
    async fn finish_parallel_tool(&mut self, prepared: PreparedCall, result: ExecResult)
    -> ResultBlock;

    /// Execute a prepared sequential tool (update_plan / team / MCP / regular
    /// dispatch branch). May mutate session state.
    async fn execute_sequential_tool(
        &mut self,
        call: &ToolCall,
        args: serde_json::Value,
    ) -> ExecResult;

    /// Finish a sequential tool: `PostToolUse` hooks WITH output transforms and
    /// `additional_context` accrual, then `ToolResultPersist`, returning the
    /// (possibly transformed) result block.
    async fn finish_sequential_tool(
        &mut self,
        call: &ToolCall,
        args: serde_json::Value,
        result: ExecResult,
    ) -> ResultBlock;

    /// Commit the turn's accumulated result blocks: push them as one user
    /// message, run the `PostToolBatch` hook, and flush any accrued
    /// `additional_context` as a system message.
    async fn commit_tool_results(&mut self, blocks: Vec<ResultBlock>, iteration: usize);

    /// Handle a detected identical-tool-call runaway: strike accounting, warning
    /// + hook fan-out, and the interactive confirmation. Returns whether the loop
    /// continues. Mutates `tracker` (strike count / rolling window).
    async fn confirm_tool_runaway(
        &mut self,
        tracker: &mut RunawayTracker,
        calls: &[ToolCall],
    ) -> LoopControl;

    /// Handle a detected content-chant runaway: strike accounting + confirmation.
    async fn confirm_content_loop(
        &mut self,
        tracker: &mut RunawayTracker,
        text: &str,
    ) -> LoopControl;

    /// Cumulative USD cost of the turn so far, for the budget guard. App-local
    /// pricing.
    fn turn_cost_usd(&self, totals: &UsageTotals) -> f64;

    /// Route a turn event to the host's real sinks (stdout JSONL, stderr status
    /// lines, TUI transcript). Must be side-effect-only and non-reentrant w.r.t.
    /// the other trait methods.
    fn on_event(&mut self, event: &TurnEvent);
}
