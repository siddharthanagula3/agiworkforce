# E2B universal execution layer — design (P3)

Status: Phase A (env-gating) SHIPPED + cross-surface verified. E2B binding SCAFFOLDED + live round-trip VERIFIED (2026-06-21). **The E2B cut-over is BLOCKED — NOT a flag flip.** Adversarial review found the server-side execution loop that would run platform-executed E2B tools is UNREACHABLE in production (see §1.1). So `resolveCodeExecutionTools()` is intentionally native-always / fail-closed and ignores E2B config: setting `E2B_API_KEY` activates the dormant binding + verifier but changes ZERO request traffic → zero regression. The cut-over needs a reachable, approval-gated execution loop first (founder decision — §1.1, §6).
Owner: this session
Last updated: 2026-06-21

Grounded by the `understand-p3-envgating-e2b` workflow synthesis and direct code
verification. Implements the founder's **unified execution architecture** directive.

## 0. Architecture (locked by founder)

- **Every model** — GPT, Claude, Gemini, DeepSeek, Kimi, GLM, MiniMax — is an
  **intelligence engine that emits JSON tool calls**. None has a native cloud
  execution environment via its standard API. We do not assume otherwise anywhere.
- **E2B is the universal, centralized secure execution layer.** Every code execution,
  folder/file creation, or side-effecting tool call routes through the **same** E2B
  sandbox, regardless of which model produced the tool call. E2B is **not** a fallback
  for "weaker" models.

## 1. The discovered regression risk (READ FIRST — founder decision needed)

**`code_execution` is a LIVE, ungated feature today, and it uses PROVIDER-NATIVE
execution** — the exact thing the directive bans. Verified at
`apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1066-1077`:

```ts
if (chatRequest.code_execution && (resolvedModelCaps?.codeExecution ?? true)) {
  if (providerLower === 'anthropic') {
    resolvedTools = [
      ...(resolvedTools ?? []),
      { type: 'code_execution_20260120', name: 'code_execution', allowed_callers: ['direct'] },
    ];
  } else if (providerLower === 'google') {
    resolvedTools = [...(resolvedTools ?? []), { code_execution: {} }];
  } else if (providerLower === 'openai') {
    resolvedTools = [...(resolvedTools ?? []), { type: 'code_interpreter' }];
  }
}
```

It is reachable from the client (`useChatStream` → `webChatPort` → `WebChatRuntime`
all thread `code_execution`) and has no managed-compute gate at this seam.

**Consequence:** simply replacing these lines with a gated E2B path would TURN OFF
code execution for every current user until E2B is keyed + the beta flag is set —
a user-facing regression. **The cut-over (provider-native → E2B) is a product
decision and is the founder's call.** This design keeps the live path intact and
adds E2B in parallel; the live path is unchanged.

## 1.1 The cut-over is BLOCKED on a pre-existing architectural gap (adversarial review)

A find→verify adversarial review of the "flip E2B_API_KEY to cut over" plan found it is
**not** a one-line flip — it would have shipped a broken feature. Two confirmed defects:

1. **E2B tools are platform-executed, but the platform loop is UNREACHABLE in prod.**
   An E2B tool only works if OUR agentic loop runs it (`runMcpTool` → `routeExecutionTool`).
   That loop is entered only on the streaming `hasMcpTools` path under a **hardcoded
   `approvalMode = 'manual'`** gate (`route.ts:85-176`) with **no resume endpoint**, and
   only when the MCP catalog is non-empty. The default streaming and non-streaming paths
   never run tools. So a model could emit an `execute_code` call and nothing would ever
   execute it — the turn would stall on a tool result that never arrives.
2. **Keying E2B would REGRESS OpenAI.** The earlier `resolveCodeExecutionTools(provider,
e2bEnabled)` returned the E2B tool defs for `openai` when `e2bEnabled` — stripping
   OpenAI's working provider-native `code_interpreter` and replacing it with a tool that
   (per #1) nothing runs. Setting `E2B_API_KEY` would thus break OpenAI code execution.

**Resolution applied this turn (safe-inert):** `resolveCodeExecutionTools(provider)` is now
single-arg, native-always (anthropic/google/openai → their native interpreter) /
fail-closed (no-native → no tool), and **ignores E2B config entirely**. This is
byte-for-byte the pre-P3 behavior regardless of `E2B_API_KEY`. The `lib/e2b/*` binding,
tools, runtime, and `runMcpTool` interception remain as the **verified, dormant
foundation** for the future loop. Tests assert the no-E2B-tool-from-this-seam invariant.

**To actually cut over (future work, founder-gated):** build a reachable, approval-gated
execution loop — an auto-or-explicitly-approved tool path with a resume endpoint that runs
platform-executed tools on the default chat path — THEN switch `resolveCodeExecutionTools`
to emit E2B tool defs for the E2B-tier providers. Until that loop exists, flipping any
flag must NOT change `resolveCodeExecutionTools` output.

## 2. Why platform-executed, not provider-executed (the model)

- Provider-native code tools are **provider-executed**: the provider runs the code
  inline and returns the result in one turn; our loop never sees the execution.
- An E2B-backed tool is **platform-executed**: the model emits a `tool_call`, OUR
  agentic loop runs it (in E2B), feeds the result back, and re-invokes the model.
- `runToolLoop()` / `runMcpTool()` (`tool-loop.ts:321-349, 365-511`) ALREADY implement
  this platform-executed machinery for MCP tools. So the E2B executor is a backend
  **parallel to `executeWebMcpTool`**, routed at the same chokepoint.

## 3. Components (additive, gated, fail-closed)

```
apps/web/lib/e2b/
  types.ts            — E2BExecutor interface + result types (the seam everything mocks)
  execution-tools.ts  — universal tool schemas (execute_code, write_file, create_folder)
                        + isExecutionTool() + routeExecutionTool(executor, name, args)
  runtime.ts          — getE2BExecutor(): gated factory. Returns null unless
                        managed-compute beta is on AND E2B is configured (E2B_API_KEY).
                        The @e2b SDK binding lives here (the ONE part that needs a live
                        key; until then it fails closed with an explicit error).
  gate.ts             — e2bExecutionEnabled(): the cut-over flag (off by default).
```

### 3a. Gating (two independent gates, fail-closed)

1. **Managed-compute gate** — E2B is managed cloud, so it inherits
   `buildManagedComputeGateResponse()` semantics (`AGI_MANAGED_COMPUTE_PRIVATE_BETA`):
   no E2B unless the private-beta flag is on. (Locked rule: managed compute stays
   gated until abuse/fraud/limits/retention/deletion are proven.)
2. **Cut-over flag** — `AGI_E2B_EXECUTION` (off by default). Only when ON does
   `request-processor` offer the universal E2B execution tools INSTEAD of the
   provider-native code tools. Off → today's provider-native behavior, unchanged.
3. **Key presence** — `getE2BExecutor()` returns null without `E2B_API_KEY`.
   All three must hold to route execution to E2B. Any miss → fail-closed.

### 3b. Trust boundary (never silently route Local/BYOK to E2B)

E2B is managed-cloud-only. Execution tools are offered only on the managed-cloud
path; never from Local or BYOK sessions. A `requiresEnvironment: 'e2b'` model is
hard-gated (managed-compute gate) AND grayed out in pickers (Phase A) until live.

### 3c. Fail-closed semantics (CRITICAL)

- E2B unavailable / errored / unconfigured → the execution tool returns an **explicit
  error result to the model** ("execution environment unavailable"), so the model can
  react. NEVER a silent no-op, and **NEVER a silent fallback to the provider-native
  tool** (that would re-introduce the banned provider-execution invisibly).
- Resource boundaries are enforced at the E2B session: per-session CPU/mem/wall-clock
  - network policy + a max-output-size cap on tool results (today MCP output is
    unbounded — a memory-exhaustion risk noted in the review).

### 3d. Interception point

`runMcpTool()` (`tool-loop.ts:321`): before `executeWebMcpTool(...)`, if the call is a
universal execution tool (`isExecutionTool(name)`) AND an executor is available, run it
via `routeExecutionTool(executor, name, args)`; otherwise fall through to MCP. Additive:
when the cut-over flag is off, execution tools are never offered, so this branch is dead.

## 4. Pre-existing security gaps E2B sits on top of (surface, don't silently inherit)

From the review (to be verified before any live cut-over):

1. Desktop computer-use `require_confirmation` defaults `false` (`observe_plan_act.rs`) —
   the fail-closed confirmation gate may never fire. **MUST verify** whether this is the
   same OPA gate already hardened this session (gate #24) or a separate one.
2. Web in-process tool execution has zero OS isolation today (E2B fixes this for E2B
   tools, but other MCP tools remain in-process).
3. MCP tool output is unbounded (memory exhaustion). Add a max-output cap.
4. Route-coverage: any execution-capable route that does NOT call the managed-compute
   gate would leak managed compute publicly — audit all such routes before cut-over.

## 5. Phased plan

- **Phase A (env-gating) — DONE this turn:** schema + evaluator + cross-surface picker
  gray-out. Additive, no current model gated.
- **Phase B-scaffold (this turn):** the `apps/web/lib/e2b/` modules above + the gated
  request-processor branch + the runMcpTool routing, all OFF by default, with logic
  tests (gating, routing, fail-closed) against a mocked executor. The @e2b SDK binding
  is stubbed fail-closed (no key in this environment to verify live).
- **Phase B-cutover (founder + key required):** confirm E2B as backend (done — founder
  named it), provision `E2B_API_KEY`, verify a real sandbox round-trip, address the §4
  gaps, then flip `AGI_E2B_EXECUTION` on. At that point provider-native code tools are
  removed and `code_execution` routes universally through E2B.

## 6. Open decision for the founder

- **Cut-over timing**: `code_execution` is live via provider-native execution today.
  Flipping to E2B is a user-facing change requiring a key + verification. Confirm when
  to cut over (and whether to keep provider-native as a temporary fallback — NOT
  recommended: it re-introduces provider-execution, which the directive bans).

## 7. Phase A cross-surface gating-leak audit (close in Phase B with SERVER enforcement)

Every surface's PICKER now grays out env-gated models, but each engineer honestly
flagged programmatic/direct-selection paths that bypass the picker gate. ALL are safe
today (no model sets `requiresEnvironment`); they must be closed before the first
env-gated model ships. The durable fix is SERVER-SIDE: enforce `requiresEnvironment`

- the managed-compute gate at the API (a client gate is UX, the server gate is
  enforcement — same lesson as P1/P2 RLS).

* **Web**: `model-store.ts` selection setters (`applyModelSelection`/`selectModel`),
  `GET /app/api/models` (returns all models unflagged), and `/app/api/chat/*` (no
  server-side `requiresEnvironment` validation — the real backstop).
* **Mobile**: `isSelectableModelIdForCloudAccess()` is fail-open; static `MODEL_LIST`/
  `LOCKED_CLOUD_MODELS` built at module load; local-runtime gating needs `OnDeviceModel`
  to carry the field.
* **Desktop**: `modelStore.selectModel` (palette/shortcuts) tier-only; cloud-mode
  `ManagedCloudModel` mapping drops the field; `ModelComparison`/quick-query render paths.
* **CLI**: `--model <id>` flag, `/model <arg>`, `default_model()` and routing dispatch
  bypass the picker filter.
* **VS Code**: flat `MODEL_PICKER_OPTIONS` (sidebar), `normalizeConfiguredModelId()`
  (settings.json), and `auto-*` resolved ids are not re-gated at send time.

## 8. Cost-optimized routing target (2026 billing, founder spec) — the INTENDED cut-over

This is the DESTINATION once the §1.1 execution loop is built, **not** today's behavior.
The intended cut-over is NOT a blunt "universal E2B for everything." Per the founder's
2026 billing analysis, the post-cut-over router routes by provider:

- **Free native tier** — Anthropic + Gemini ALWAYS use their own native code-execution
  sandboxes (free compute), regardless of E2B.
- **E2B credit tier** — OpenAI (to avoid its per-session interpreter fees) + DeepSeek /
  Kimi / GLM / MiniMax (no native sandbox) route to E2B.

The billing figures (Anthropic free-tier hours, OpenAI session fees) are the founder's and
are a one-line change if the billing reality shifts. (These 2026 provider-billing specifics
are beyond verification from the repo / model knowledge cutoff.)

**TODAY (shipped), `resolveCodeExecutionTools(provider)` is single-arg and native-always /
fail-closed** — it does NOT implement the E2B-credit tier above, because (per §1.1) there
is no reachable loop to run E2B tools yet. anthropic/google/openai → native interpreter;
everything else → no tool. Wiring in the E2B-credit tier is gated on the §1.1 loop landing.
