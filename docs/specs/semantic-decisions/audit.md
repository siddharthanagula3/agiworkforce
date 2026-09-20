# Semantic decision audit and Jev evaluation

Status: In progress; foundation, managed host and one shadow consumer implemented; every
decision kind is disabled and no production request evaluates one
Owner: AI platform maintainers
Last updated: 2026-09-20

## Decision

The proposed [product system design](system-design.md) defines shared ownership, parallel
scheduling, action contracts, deployment boundaries and implementation exit gates.

Keep deterministic routing, authorization, billing, capability and trust checks in control.
Add semantic evaluation to the existing shared agent core and a separate TypeSafe adapter
export to provider-runtime. Do not register Jev as a chatbot or install it in six clients.
No production request invokes TypeSafe in this change. The only live caller is the explicit
synthetic evaluation harness. This is not a claim of completed production optimization.

The first two candidates improve classifications on a small development set but add latency
and cost to existing local algorithms. Neither demonstrates a removed LLM call. Activation
would therefore be premature. Native process classification could replace a real LLM call,
but that path currently defaults to Local when session trust is absent. Sending its state to
TypeSafe would violate the existing boundary. Mixed classification/generation paths cannot
be replaced wholesale.

The follow-up [action-control research](../../research/2026-09-20-jev-action-control.md)
identifies a stronger P1 pilot: replace eligible routine browser action-selection turns with
Choice over current, executable DOM candidates. The extension's `agentLoop.ts` currently
calls the cloud model each iteration, while `cdpDriver.ts` already owns indexed targets.
Operation and compatible target questions can share one Jev call. This supplements the
lexical inventory, whose patterns do not recognize the extension's `callCloud` wrapper.
Preserve its approval/ownership controls and add complete actionability, observation binding
and independent outcome checks before activation. This does not replace visual perception,
free-text generation or complex planning, and no browser-controller benchmark has run here.

## Evidence and scope

The audit follows implementation over comments. For example, the header in
`apps/web/lib/services/model-memory-extraction.ts` says the feature is dark, but
`isModelMemoryExtractionEnabled()` defaults to enabled. The comment in
`packages/ai/routing/src/classify.ts` mentions an LLM fallback, but the web request processor
calls the heuristic and conversation-context functions without that model classifier.

[Call-site discovery](call-sites.json) records 99 expressions in 61 files across apps,
packages, crates and services. [The inventory](inventory.csv) assigns purpose, model owner,
output shape, decision category, reasoning/string needs, fallback, frequency/critical-path
context and candidacy to each expression. It includes transport wrappers and one displayed
API example, explicitly distinguished from semantic calls. It is not 99 independent billed
operations: many expressions are layers of the same request or failover alternatives.

The scanner is a reproducible lexical index, not a dynamic reachability proof. Direct HTTP
calls (native summary/embedding, Google streaming, image/audio/video APIs) and injected
runner callbacks require the supplementary review below. Production invocation rates,
input sizes, latency distributions and route-specific spend are unknown outside the new
synthetic measurements. Arithmetic/date requirements are input-dependent for general chat;
no semantic model may take ownership of exact computation. Native feature presence does not
prove that the shipping Electron shell reaches it.

Reproduce discovery with `node tools/evals/semantic-decisions/inventory.mjs` from the root.
The CSV is the reviewed snapshot, not an automatically inferred architectural truth.

## Request lifecycle and shared ownership

| Surface                  | Entry and execution                                                                                                                                                                             | Consequence for semantic decisions                                                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web / managed cloud      | `apps/web/app/api/llm/v1/chat/completions/route.ts` → `lib/request-processor.ts` → registry-backed Auto resolver → provider adapters; tool/research loops and durable workflows run server-side | Best eventual common host, after authentication, tenant policy, entitlement and data-residency checks. Evaluation must be metered separately from the primary response. |
| Desktop Electron         | `apps/desktop/electron/config.ts` selects hosted web by default; local inference is `electron/runtime/localInferenceService.ts`; dispatcher/permission manager gates privileged operations      | Hosted traffic can reuse a managed host integration. Local inference cannot inherit it.                                                                                 |
| Desktop Tauri            | Renderer → registered commands → `core/llm/llm_router.rs` / shared Rust agent core; `sys/commands/chat/local_turn_host.rs` hosts native turns                                                   | Native semantic calls remain under host-owned Rust egress and session trust. No TypeSafe side channel.                                                                  |
| Mobile                   | `features/chat/utils/cloudDispatchRouting.ts` uses shared local classification; cloud dispatch goes through managed API                                                                         | Never ship the TypeSafe key to the app. Preserve attachment/token/explicit-model constraints.                                                                           |
| Chrome                   | `features/cloud-bridge/managedChatRouting.ts` uses shared routing; managed calls use cloud bridge                                                                                               | Same managed host; connected tab/page data is untrusted and may be private.                                                                                             |
| VS Code                  | `integrations/routingTask.ts`, chat participant and sidebar state manager select routes and stream provider results                                                                             | Shared TypeScript policy; explicit models and BYOK remain authoritative. Skill-offer exclusion in web must remain intact.                                               |
| CLI                      | `agent/chat.rs` hosts shared Rust turn engine; `models/streaming.rs` → `crates/agiworkforce-llm/src/stream.rs`; cloud is an explicit provider                                                   | Local/BYOK isolation applies to classifier, summary and memory calls too.                                                                                               |
| Background/cloud workers | `scheduled-agent-executor.ts`, durable `lib/workflows`, retrieval indexing and notification services                                                                                            | Independent execution budgets and usage reservations; background does not mean privacy exemptions.                                                                      |

Canonical owners: `packages/contracts` defines contracts/trust; `packages/ai/model-registry`
owns routes/models/prices; `packages/ai/routing` owns deterministic resolution;
`packages/ai/provider-runtime` owns runtime transport/tracing; `packages/ai/agent-core`
owns shared orchestration/context/memory; `packages/tools/skills` owns loading/integrity and
lexical relevance; `packages/platform/data-layer/src/search` owns search ranking.

The primary managed turn authenticates/scopes the request, assembles project/memory/skill
context, applies deterministic routing/capabilities, reserves usage, streams a model,
executes permitted tools, persists/settles, then performs post-turn work. Tool selection and
arbitrary arguments are often produced together by the primary model, not by a separate
billable classifier. Removing one enum output does not eliminate that model turn.

## Candidate matrix covering the orchestration layer

A = deterministic; B = bounded semantic judgment; C = reasoning; D = generative.
Priority orders investigation, not automatic activation. Every B candidate needs a measured
confidence/abstention gate; the experimental thresholds are not production defaults.

| Area                   | Current owner / approach                                                                                                      | Category and primitive                                           | Potential benefit                                                                   | Risk / required gate                                                                                                 | Fallback / priority                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Intent                 | shared `routing/src/classify.ts`; native `core/intent/detector.rs` pattern then model                                         | A now; B Choice for ambiguity                                    | Better paraphrase/language coverage; replace native classifier only where permitted | False specialist routing; attachment and explicit-mode constraints dominate                                          | Existing classifier; P1 eval only                     |
| Complexity             | local heuristics/task-family signals; native intent JSON                                                                      | B Score plus atomic reasoning/code/current-info Nouls            | Inform escalation without choosing a model                                          | Score is an ordinal expectation, not exact difficulty or a permission to downgrade                                   | Existing tier; P1 shadow                              |
| Model routing          | `routing/src/auto.ts`, `free-auto.ts`, policy, health/rate stores                                                             | A orchestration; optional B features                             | Better task signals                                                                 | Jev must not select trust mode, price, quota, residency, provider availability, user plan or override selected model | Existing resolver; P1 shadow                          |
| Tools                  | primary model tool calls; managed tool definitions and tool loop                                                              | C/D execution planning; B family Choice/Nouls                    | Reduce offered irrelevant schemas where recall stays high                           | Missing a required tool causes retries or failure; retain discovery escape hatch                                     | Existing tool set; P1 experiment                      |
| Skills                 | shared `skills/src/relevance.ts`; `applyImplicitManagedSkillOffer` loads matched descriptions; explicit selection is separate | A current; B Choice + absolute-fit Nouls                         | Improved selection; possible smaller context                                        | Current code already limits to three, so no claim that all skills enter every prompt; preserve explicit names        | Existing matches; P1 benchmarked                      |
| Connectors/plugins/MCP | catalog/directory discovery, MCP tool schemas, deterministic availability and execution grants                                | A availability; B relevance per eligible candidate               | Smaller shortlist                                                                   | Candidate descriptions are untrusted; never expose disconnected or forbidden service; IDs stay local                 | Existing discovery; P1 experiment                     |
| Subagents              | native swarm decomposer, CLI agents/teams, model plans                                                                        | C/D decomposition; B specialist relevance                        | Avoid irrelevant specialist context                                                 | A selection is not a parallelization plan; do not discard difficult subproblems                                      | Existing planner; P2                                  |
| Agent loop             | native `autonomous.rs` consultation returns PLAN_OK or new steps; web/CLI primary turn loops                                  | B gate + C/D replanning                                          | Skip some feedback calls                                                            | Completion depends on evidence and pending obligations; wrong stopping decision harms quality                        | Existing consultation; P2 shadow only                 |
| Tool results           | tool-loop serialization, harness context assembly                                                                             | B relevance/redundancy/injection Nouls                           | Fewer downstream tokens                                                             | Retain errors, constraints, provenance and conflicting evidence                                                      | Unfiltered bounded result; P2                         |
| RAG                    | `retrieval-search-service.ts`; `search/rank.ts` lexical/vector RRF + deterministic coverage/title ranking                     | A current ranking; B relevance/answerability/contradiction Nouls | Better evidence ordering, possibly fewer passages                                   | Not an existing expensive reranker replacement; private index has residency constraints                              | Current rank; P1 eval specification                   |
| Context                | agent-core context budgeting, web compaction, CLI context summarizer                                                          | A budgets, D summaries, B relevance                              | Avoid irrelevant request context                                                    | Canonical history and active constraints must survive; require retrieval recall/answer-quality checks                | Existing compaction; P2                               |
| Memory                 | shared `memory.ts`, web model extraction, native summary extraction, CLI `memory_pipeline.rs`                                 | A exact/dedup rules; D fact text; B worth-saving/relevance       | Avoid empty extractions or irrelevant memory context                                | False negatives lose useful memory; no deletion based on Jev; keep exclusions, consent, project scope                | Existing pattern/model extraction; P1 gate experiment |
| Permission UX          | tool-loop metadata, web tool-permission gate, Electron grants, Rust exec/sandbox policy                                       | A authoritative; B optional risk signal                          | Better explanations/escalation                                                      | Never permit an action, suppress required approval, or downgrade an irreversible operation                           | Hard policy; P3 defense in depth                      |
| Guardrails             | web moderation text rules/hash denylist; generated-image vision classifier                                                    | A hard checks; B text-only supplementary screen                  | Detect semantic cases regex misses                                                  | No security replacement without adversarial recall study; image bytes unsupported                                    | Existing checks; P3                                   |
| Injection              | untrusted source/tool envelopes, tool policy and egress controls                                                              | B Noul signal only                                               | Flag suspicious retrieved instructions                                              | Jev also sees adversarial input; not a privilege boundary                                                            | Preserve isolation regardless of verdict; P3          |
| Function arguments     | model-generated JSON/tools + schema validation                                                                                | B closed enums/bools only; D arbitrary values                    | Batch known branch parameters                                                       | No invented URLs, paths, IDs, numbers or credentials; schema validation remains code                                 | Existing tool caller; P2                              |
| Extraction             | memory, scanned-document OCR, structured outputs                                                                              | D for strings; B candidate Choice after parsing                  | Select verified existing spans                                                      | Candidate recall; exact values copied and normalized in code; vision remains specialist                              | Existing extractor; P4                                |
| Response verification  | review pipeline/reflection/eval graders                                                                                       | A syntax/checks; C reasoning; B grounded per-condition Nouls     | Selective escalation                                                                | A general “is it correct?” score cannot replace testing or reasoning                                                 | Existing checks/reasoner; P3                          |
| Citations              | eval citation checks, research citations/provenance                                                                           | A quote/source lookup + B support/contradiction Choice           | Catch unsupported claims                                                            | Matching URL or quote does not prove entailment; distinguish paraphrase from fabricated quotation                    | Flag/reasoner; P3                                     |
| Search continuation    | `core/research/orchestrator.rs`, web `research-loop.ts`                                                                       | C synthesis/planning; B evidence gaps                            | Avoid some redundant lookups                                                        | Requires source-specific evidence; no blanket sufficient-evidence heuristic                                          | Research planner; P2                                  |
| Workflow branches      | cloud operation executor, parsed AGI Work plans; native workflow engine                                                       | A fixed state transitions; B only genuine fuzzy branches         | Replace semantic condition calls if observed                                        | Most branches are already deterministic; preserve durable idempotency                                                | Existing branch logic; P4                             |
| Workers                | index/retrieval workflows, scheduled-agent executor                                                                           | A scheduling/quotas, embeddings and D task work                  | Optional ingestion labels                                                           | Jev cannot replace embedding vectors or arbitrary background output                                                  | Current workers; P4                                   |
| Notifications          | notification/schedule/account-activity services                                                                               | A event/template delivery                                        | No model-call saving found                                                          | Do not add AI to delivery/importance policy without a product case                                                   | Keep deterministic; reject current replacement        |
| Dedup/entities         | memory normalization/conflict topics; CLI generative consolidation                                                            | A exact matching, D summaries; B known pair alignment            | More accurate duplicate suggestions                                                 | No irreversible merges or deletion from one score                                                                    | Separate/review; P4                                   |
| Artifacts/files        | managed office/image/video intent, artifact creation tools                                                                    | A capability/format gates; B intent; D content                   | Better artifact routing                                                             | Keep explicit output kind and tool availability; Jev cannot generate the artifact                                    | Existing routing/tools; P1 signals only               |

## Additional model invocation inventory

These are intentionally retained, including cases not visible to the lexical scanner:

- Native `conversation_summarizer.rs` calls local Ollama/OpenAI HTTP for summaries/facts and
  embeddings. The first two generate arbitrary strings; embeddings return vectors, which
  are outside the decision primitives. CLI extraction/consolidation similarly generates
  prose and has raw-summary/line-dedup fallbacks.
- Google provider streaming uses `fetchFn` rather than an SDK `generateContent` call. The
  provider adapters for OpenAI, Anthropic, Google, xAI, DeepSeek, OpenRouter, Groq, Qwen,
  Moonshot, MiniMax, Zhipu, Perplexity, Vercel Gateway and local routes are transports, not
  semantic decision points. Rust dialect transports and endpoint adapters serve the same
  general purposes. Switching a transport wholesale to Jev would break chat.
- Web conversation title/follow-ups, support answers, code review, scanned-document OCR,
  context compaction, code-agent turns and scheduled agents require generation/reasoning.
  The utility route is dynamically resolved; no fixed current model or cost is asserted.
- Native code generator, code editing/completion/design, terminal assistant, git executor,
  swarm decomposition, planner and council synthesis generate arbitrary text/code/plans.
  Native vision/computer-use needs multimodal perception and arbitrary action arguments.
- Image/video/audio generation and speech transcription return media or arbitrary text;
  neither API polling nor media output is a Jev decision. `video-provider-output-service.ts`
  and its workflow use deterministic state/polling transitions.
- `tools/evals/src/grader.ts` has deterministic graders (format, code execution, citation
  checks). A grader-shaped name does not establish a paid judge call. Keep those checks.
- `services/signaling-server` transports signaling; no semantic inference replacement was
  found. Frontend model helpers and cloud bridges dispatch requests; classify the host
  operation they reach rather than counting UI calls as additional inference.

## Foundation implemented

`packages/ai/agent-core/src/semantic-decisions.ts` defines provider-neutral typed questions,
answers and a runner. `candidate-decisions.ts` batches relative Choice ranking with absolute
fit Nouls and a none option. It keeps internal candidate IDs outside provider payloads.
The TypeSafe SDK exists only in `provider-runtime/src/typesafe-decisions.ts`, exported via
`@agiworkforce/provider-runtime/decisions`. The default provider-runtime export does not
load the SDK, so browser consumers do not automatically import server credentials.

SDK inspection found version 0.6.0 installed and recorded in `node_modules/.pnpm/lock.yaml`
but not the checked-in dependency manifest/lock. This change declares that exact version in
the adapter's package and regenerates the lock with pnpm; it does not upgrade the SDK.

Configuration is injected by the host, not guessed inside features. The host supplies a
version pin, deadline, byte/question/concurrency limits, rollout fraction and a current-policy
reader. No production model ID, endpoint, price, threshold or rollout default is introduced.
`disabled`, `shadow`, `enabled`, fraction zero, and typed fallback outcomes are supported.
A host can connect the reader to the existing web flag store/kill switches; this change does
not pretend that connection has already been implemented. The host must use one long-lived
runner per budget scope; concurrency is per instance, not a cross-process rate limiter.

The runner checks Managed Cloud plus explicit provider allowance before transport, rejects
oversized/empty requests, samples by host-supplied cohort, aborts on cancellation/deadline,
holds capacity until the transport actually settles, validates returned model/answer keys/
bounded values/distributions, and discards results when policy changes in flight. Failures
return to the caller's existing path. Shadow results cannot pass the candidate action gate.
Confidence thresholds are required by the candidate consumer; no cookbook threshold is a
production default. The host supplies the SDK retry budget; this evaluation configures zero
retries. The caller owns fallback and the outer deadline bounds the complete evaluation.

The adapter reuses provider-runtime tracing with operation/model/question count and trace
headers. SDK logging is explicitly off; an environment debug setting cannot expose state.
The observer includes latency/status/reason/model/token counts, not state, candidate names,
raw answers or provider error bodies. A failed telemetry callback cannot break the turn.
For a future production host, bounded semantic labels/confidence bins can be recorded in
its existing routing trace, while arbitrary personal candidate values must stay out of logs.
No cross-user cache has been added. Any future cache must include tenant, trust, policy,
question version, candidate version and input identity; cost alone does not justify it.

## Managed host implemented

`apps/web/lib/services/semantic-decisions/` is the one service a managed request asks
through. `kinds.ts` is the closed registry of decision kinds, each with an owner, a question
version and a failure policy; `turn_signals` is the only member. `config.ts` turns four
environment keys into typed configuration and reports the transport unconfigured when any is
missing, when the base URL names a host outside the decision-transport allowlist in
`provider-runtime/base-url.ts`, or when the price is unusable. It never throws.
`eligibility.ts` is the three-part AND. `policy.ts` maps the flag to a `DecisionPolicy` and a
cohort. `host.ts` holds one provider and one evaluator per kind per process, reading the
in-flight policy from request-scoped storage so two subjects do not share one. `trace-service.ts`
persists the comparison and sweeps it. `questions.ts` is the versioned question module.

Rollout is a new reserved, server-only flag namespace. `decision.<kind>` serves `off`,
`shadow` or `enabled` and defaults to `off`; `decision.kill` forces every kind to disabled.
Both are held back from `clientVisibleFlags`. The cohort is seeded exactly as the flag
evaluator seeds its own bucket, so the evaluator's sample gate selects the population the
flag already selected rather than squaring the rollout percentage.

Eligibility is computed by the host from facts the turn already read: the session's canonical
`PrivacyMode` is `managed`; a `zeroDataRetentionOnly` workspace is excluded because the new
`typesafe` governance record says zero retention is available on request rather than by
default, which is an agreement this deployment does not hold; a workspace whose supplier
allow-list does not name the transport is excluded, and it cannot name it, because the
transport is deliberately not a registered `Provider`; a workspace pinned away from the
processing region is excluded, because the record publishes no processing region.

Metering is the `decision` COGS capability added in migration 0274, with `billedCents` zero
and no customer figure attached, so a decision moves margin and never a balance. The same
migration creates `semantic_decision_traces`: bounded labels and bins only, no state and no
candidate text, RLS on and forced.

The trace carries no subject or tenant column of its own, and it is not anonymous. Two of its
columns join out to rows that do carry one, and both joins are deliberate, because a
disagreement that cannot be priced against the route actually served is not worth recording.
`request_id` joins `routing_decision_traces.request_id`, which carries `user_id` and
`organization_id`; both tables are swept on the same retention window by the model-rollout
cron, so that join closes when the two rows retire together, and account erasure deletes a
subject's routing traces outright, so it closes with the account as well. `decision_id` is the
`source_ref` of the same evaluation's `provider_cost_events` row, which also carries `user_id`
and `organization_id`; that ledger row has no maximum age and is anonymised rather than
deleted on account erasure, so this join outlives the trace's own window while naming nobody
once the subject is erased. The trace is therefore linkable to a subject for exactly as long
as a row naming that subject survives, and not afterwards. It is deliberately absent from
`USER_SCOPED_TABLES` and from both erasure cascades: it has no column for them to act on, and
each table it joins to is erased or anonymised in its own right.

The first consumer is `turn_signals`, shadow only. At the point the managed chat turn has
already classified and recorded its task family, it schedules one batch under Next `after()`
carrying the user's own words and at most the previous user message: the dominant task family
as a Choice over `TASK_FAMILIES` imported from the router, three independent Nouls for current
information, external tools and code understanding, and a Score for semantic complexity. It
records the classifier's family against the candidate's, and the others as bins. It changes no
route, no latency and nothing a user sees, and it skips a turn the deterministic guards own
outright, recording a bounded reason: an attachment, an explicitly named model, or no text.

Every default is off. With no flag written, the host returns before the transport is built and
records no metric, no ledger row and no trace.

The response validator accounts for independent two-decimal provider rounding. A live score
returned 1.99 with probabilities [0.01, 0.08, 0.84, 0.07], whose rounded weighted sum is 1.97.
The permitted error is derived from per-value rounding, not an arbitrary large epsilon.
The regression fixture checks that this is accepted while a materially inconsistent score
is rejected. Full distributions are preserved rather than silently renormalized.

## Evaluation and product economics

Run `pnpm exec tsx tools/evals/semantic-decisions/run.mts` for the local baseline. Add
`--live` only for a billable TypeSafe run. Configuration and thresholds are in
`tools/evals/semantic-decisions/policy.json`. Set `TYPESAFE_API_KEY`,
`TYPESAFE_DEFAULT_MODEL` (a version pin), `TYPESAFE_BASE_URL`, and
`JEV_EVAL_INPUT_USD_PER_MILLION`. Optional `JEV_EVAL_ENV_FILE` loads an explicitly selected
local environment file without printing it. `JEV_EVAL_OUTPUT` selects the report path.

Fixtures are synthetic, including multilingual requests, negation, unsupported service,
no-match and injection-like text. Five skill cases derive from existing relevance tests.
The six-skill catalog is a development subset, not the full production catalog. Intent
questions omit attachment-only categories: this experiment must never override multimodal,
computer-use or long-context guards. Complexity/current-information/external-action outputs
are collected together but do not yet have independently labeled quality evaluation.

[Live measurements](../../../tools/evals/semantic-decisions/live-results.json) retain raw
non-sensitive answer distributions, usage and elapsed runner time; no API key or customer
state is stored. [Offline measurements](../../../tools/evals/semantic-decisions/offline-results.json)
contain no simulated model-quality claims. Reports identify fixtures/configuration and
explicitly leave end-to-end latency, downstream cost and context savings null.

The initial run rejected independently rounded responses. That instrument defect was fixed
and the whole experiment rerun, rather than interpreting validation failures as model errors.
Thresholds were chosen conservatively for this experiment before live calls and were not
optimized against the labels. Two repeats are 20 unique cases per area, not 40 independent
examples. Author-written labels and matching question vocabulary make this an optimistic
development test. A 100% score here is not a production accuracy claim.

Current classifier cost is zero API calls. The evaluated alternative is one Jev call carrying
seven questions for skills or four for intent. It avoids zero measured model calls. Before/
after downstream generation remains unchanged and unmeasured. The report scales measured
input usage to 1,000 and 1M requests at the operator-supplied current price; those values are
**added classifier cost**, not savings. Production traffic mix is unknown, so no fabricated
“typical request” or projected total bill is reported.

Latest development run (20 unique author-labeled cases per area, each repeated twice):

| Decision            | Existing accuracy | Jev + fallback accuracy | Fallback | Added p50 / p95 / p99 latency | Added cost per 1,000 / 1M |
| ------------------- | ----------------- | ----------------------- | -------- | ----------------------------- | ------------------------- |
| Skill top candidate | 65%               | 90%                     | 25%      | 164 / 282 / 375 ms            | $0.03854 / $38.54         |
| Intent              | 75%               | 100%                    | 0%       | 185 / 316 / 356 ms            | $0.02638 / $26.38         |

Both runs had zero provider/validation failures and zero baseline-correct cases made wrong
by the fallback policy. These are development observations, not error-rate guarantees.
No final model-selection changes, context-token savings or end-to-end improvements were
measured. The raw ungated candidate scored 100% on both sets; the skill fit gate retained
two baseline mistakes, illustrating why confidence and relevance probabilities need separate
calibration. The three additional intent questions were exercised but not quality-scored.

For an eventual gate before an existing model call, savings/request are:
`p_skip * measured_existing_call_cost - measured_jev_cost - extra_retry_cost`.
Latency is `jev_time + p_fallback * fallback_time` only for a serial gate; overlap, cache loss,
changed downstream routes and tails require end-to-end traces. For skill/RAG context savings,
measure final serialized prompt tokens and provider cache usage, not the count of shortlist
items. The present selector already shortlists skills, so the sign of savings is unknown.

## Rollout and remaining work

1. P0: done. The shared runner, adapter and eval tools are retained and all customer traffic
   is disabled. TypeSafe was NOT added to the model catalog: it carries a governance record
   and nothing else, so it appears in no picker, no `tierAllowedModels`, no `taskRouting`, no
   `defaultModel`, no `modelPresets` and no routing policy, and it is not a registered
   `Provider`. The pinned version is host configuration read through the env contract, never
   an alias.
2. P1: build independently reviewed held-out sets for full-catalog skill selection, routing
   including multi-turn/attachments, and private-index retrieval. Include uncertainty,
   adversarial descriptions, multilingual inputs and missing candidates. Compare baseline,
   ungated candidate and fallback policy with false-positive/negative counts and calibration.
3. Done for the web host: tenant/provider/region/retention eligibility, metered internal
   spend, the `decision.` flag namespace and the `decision.kill` switch all exist and are
   tested. Scope allowance comes from host policy alone. Local and BYOK are excluded, and a
   contract test in `apps/web/__tests__/trust-boundary.test.ts` proves a non-managed session
   never reaches the provider. Still outstanding: a fleet-level rate budget. The evaluator's
   concurrency bound is per instance, so a fleet of instances multiplies it; a shared budget
   is required before a kind is switched past shadow for a real cohort. Native eligibility
   still needs explicit session trust and host-owned egress.
4. Partly done. `turn_signals` shadows the task-family classification and records bounded
   disagreement and confidence bins under Next `after()`, which holds the invocation open
   past the response flush; no unawaited promise is left in a serverless invocation. The
   trace does not yet carry the final route, usage, context size or user-visible latency of
   the turn it shadowed, so a disagreement cannot yet be joined to what that turn cost.
5. Choose thresholds from training/calibration cases, evaluate once on held-out cases, then
   use a small stable tenant cohort only if quality, p95 latency and total cost satisfy the
   baseline. Explicit selections, hard gates and security controls remain authoritative.
   Kill switch and fallback tests must pass before expansion.
6. P2: benchmark native process enum and plan-review gates only after trust reachability is
   implemented; keep generative branches. P3: citation and injection signals require separate
   adversarial tests and grounded labels. P4: extraction candidates, entity alignment and
   ingestion labels need workload evidence before implementation.

Evaluation specifications for deferred candidates: retrieval uses recall@k/nDCG plus downstream
answer correctness and contradiction retention; memory uses valuable-fact false-negative rate
and post-turn cost; continuation uses premature-stop rate and task completion, not agreement
alone; citation uses supported/contradicted/unsupported ground truth; injection uses attack
success after the whole permission/egress stack. Every harness must count provider errors,
retries, skipped cases and fallback outcomes, and separate author labels from independent ones.

No security rule was replaced, no model downgrade enabled, no memory/history deleted and no
production latency/cost improvement established. Remaining production instrumentation and
held-out validation are requirements for completion, not silently waived acceptance criteria.

## Validation

The affected agent-core and provider-runtime suites, package typechecks and package lint
pass (67 agent-core tests and 206 provider-runtime tests). The full `check:trust-boundaries`
command passes across all configured surfaces, including native routing and cloud sync.
The eval harness has a separate TypeScript check; offline and real-network runs were
executed. Boundary and model-ID guards pass. `check:hardcoded-endpoints` fails on the existing
Google endpoint in `apps/web/app/api/media/image/lib/image-generation-provider.ts` and a stale
budget for the previous image route; neither file is modified here. No full repository build
or production load test was performed.

`check:reference-integrity` reports three existing unresolved references: two CLI comments
to `packages/alpha/package.json` and the break-glass runbook's old migration path. Repository
organization, provider-adapter boundary, doc status and non-Markdown artifact checks pass.
Spec-artifact and lock-drift checks skip because their optional input directories are absent.
