# AGI CLI → 10/10 Master Roadmap

> 14-agent path-to-10 workflow (13 per-dimension plans + synthesis), 2026-06-13. Companion to `cli-three-way-parity-2026-06-13.md` (baseline) + `cli-production-remediation-2026-06-13.md` (HIGH audit fixes landed).

## Amendments (post-roadmap founder steering, 2026-06-13)

The body below was synthesized under the **old** assumptions (cloud locked, UI = 1/13). Two founder decisions override it:

**1. Cloud is UNLOCKED.** §6's recommendation ("accept the cap, ship local-only") is reversed. The final ~0.5 point on **providers / multiagent / headless** is now in-scope → a literal **10/10 on all 13 is achievable**. BUT "unlock" ≠ flip a flag: the lock's rationale (ledgering, abuse, fraud, refunds, chargebacks, provider terms, retention/deletion) must be _built_. That adds a **managed-compute backend + billing/abuse workstream** (~6–10 eng-wk, mostly `services/` + `apps/web`, NOT `apps/cli`) that gates those 3 cloud points. CLI-side cloud-client wiring is small once the backend exists — sequence it after. Boundary crossings stay explicit + consented.

**2. UI (TUI chat-feel) is the #1 priority.** The body files TUI in Phase 1 at a "match Claude/Codex" bar. Override: **pull the TUI track to the front (alongside Phase 0)** and **raise the bar to "feels like chatting with an agent, not a CLI"** — distinctive visual language, message rhythm, motion/typography in ratatui, not just feature-parity. Decide first: terminal-max vs leaning on the **desktop (Tauri GUI)** surface for the true "doesn't feel like a CLI" experience — the terminal has a ceiling. Deserves a dedicated frontend-design pass.

---

# AGI CLI → 10/10 Master Roadmap (original synthesis)

**Synthesis of 13 per-dimension engineering plans • Platform lead • 2026-06-13**

Current avg: **6.4/10** (Claude Code 8.8 / Codex 8.7). Target: 10/10 on all 13 dimensions.

---

## 1. Reality check

**Is literal 10/10-everywhere achievable for a small team? Honestly: not on a launch timeline, and not all at once.**

The blunt math: the 13 plans sum to roughly **45–55 engineer-weeks of net effort** (see §8). The biggest single dimensions — `headless` (~5–6 wk), `agent_loop` (~4–5 wk), `sandbox` (~4–5 wk), `multiagent` (~4–5 wk), `tui` (~4–5 wk), `providers` (~4–5 wk) — are each near-month efforts on their own. For a 2–3 engineer team that is **~5–6 calendar months of full-time work**, and that assumes zero scope creep and that Claude/Codex stop shipping (they won't — §9).

**But two things make it far more tractable than the raw number suggests:**

1. **Most of the gap is wiring, not greenfield.** The plans repeatedly find that AGI already _built_ the hard part and left it dead-wired. The agent*loop `Effort` enum is fully implemented with `anthropic_budget_tokens`/`gemini_thinking_budget` but `#[allow(dead_code)]` and never threaded (agent_loop T2 notes). The multiagent executors (`subagent.rs`, A2A `server.rs:355`) \_run real parallel agents* — the registry just doesn't call them (multiagent notes: "almost entirely a WIRING gap"). The headless `sdk_io/protocol.rs` mirrors Claude's control protocol field-for-field but is `pub(crate)`/unconsumed (headless notes: "80% of the plumbing typed and tested"). The hooks `ApprovalBroker` + unused `ApprovalRequestKind::Hook` variant already exist (hooks T2). The MCP `CliToolDispatch` is tested but `run_mcp_server` returns `{"tools":[]}` (mcp T1). This is the **same anti-pattern** in 8 of 13 dimensions: _scaffolded-but-dead_. Wiring is cheap and high-credibility.

2. **The 10/10 bars are mostly LOCAL.** Only **3 dimensions have a true cloud/product blocker** for their final point (§6): `providers` T8, `multiagent` cloud-tasks, `headless` cloud-method surface. Every other dimension reaches 10 entirely under the v1 local-only lock.

**The smart way to sequence it:** front-load the _honesty_ fixes (cheapest, biggest credibility), then daily-use UX, then the agentic depth, then the platform surface, then the long-tail polish. Do NOT chase 10/10 on every dimension before launch — chase **≥8 everywhere** (Track A), ship, then grind the long tail. The dead-wiring fixes alone move the average from 6.4 toward ~7.5 in the first ~2 weeks.

---

## 2. Two tracks

### Track A — "Credible peer" (every dimension ≥8 = launch / Product-Hunt bar)

This is the bar that matters for a release. Per the locked `feedback_claude_quality_floor` rule, below-Claude items block Product Hunt launch — so Track A = "no dimension visibly worse than Claude/Codex, no dead controls."

| Dimension     | Now | A-target | What Track A requires (headline subset)                                                                          |
| ------------- | --- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| architecture  | 7   | 9–10     | Cut the real release; version-sync gate; checksums (T1–T8 — already a 10 in ~2 wk)                               |
| agent_loop    | 6.5 | 8        | Real tokenizer + provider-usage truth (T1); thread Effort + Anthropic thinking (T2–T3); mid-loop compaction (T5) |
| tools         | 7   | 8–9      | apply_patch freshness bug (T1); grep parity (T3); web_search keyless (T4); view_image (T5)                       |
| tui           | 5.5 | 8        | Multiline composer (T1–T2); history+Ctrl+R (T3); @-completion (T4); real diff hunks (T6)                         |
| providers     | 8.5 | 9–10     | Anthropic OAuth→inference (T1); kill silent precedence (T2); kill AGIWORKFORCE dead login (T7)                   |
| mcp           | 6.5 | 8–9      | Non-stub server (T1); resources RPC + tools (T2–T4); list_changed (T6)                                           |
| sandbox       | 5.5 | 8        | Kill misleading toggle (T1); policy-driven profile (T2); protected subpaths (T3); wire dead PolicyEngine (T4)    |
| commands      | 8   | 9–10     | Named args (T1–T2); @file (T3); inline bash (T4); per-command scoping (T5)                                       |
| hooks         | 8   | 9–10     | Strict decision parser (T1); allow/ask/deny into broker (T2–T3); exit-code-2 (T5)                                |
| sessions      | 6   | 8        | Fix cosmetic fork bug (T1–T2); TUI resume/fork picker (T3–T4)                                                    |
| multiagent    | 6   | 8        | Wire `--agent` (T1); local_shell exec (T2); local_agent → SubagentManager (T3)                                   |
| headless      | 4.5 | 8        | Emit defined events + real cost (T1); real stream-json (T3); bidirectional stdin (T4)                            |
| extensibility | 6   | 8        | Skill scoring + budgeted listing (T1); skill-as-tool (T2); git/URL marketplace (T4)                              |

**Track A effort: ~22–28 engineer-weeks** (roughly the first ~60% of each plan — the wiring + honesty + daily-UX tasks, before the depth long-poles). With 2–3 engineers in parallel zones, **~10–12 calendar weeks to a launchable "credible peer."**

### Track B — "Category-leading 10/10" (the full ask)

Track B = Track A + the depth long-poles + polish-to-10:

- agent_loop T6 (LLM compaction L) + T7–T10
- tools T6 (streaming/background shell L) + T7 PDF
- tui T7–T8 (image staging + inline graphics) + T10–T11
- providers T3–T6 (Bedrock SigV4, Vertex ADC, Azure, routing) — **3 enterprise-auth long-poles**
- mcp T7 (sampling L) + T8 (capabilities/roots)
- sandbox T5–T9 (sandbox-driven approval, **Linux seccomp T7 L**, network policy)
- sessions T5–T6 (**file-state rewind via git-tree snapshots, 2× L**)
- multiagent T4–T7 (teammate runtime, worktrees, progress, **A2A batch fan-out L**)
- headless T5–T8 (**app-server lifecycle L, SDK package L, CI golden gate**)
- extensibility T3 (forked skill exec L) + T6–T7

**Track B effort: ~45–55 engineer-weeks total.** With a 2–3 person team, **~5–6 calendar months** beyond Phase 0.

**Recommendation: ship Track A, then convert to Track B per-dimension based on competitive pressure — do not block launch on Track B.**

---

## 3. Phased master roadmap

Phases respect dependencies (§4) and front-load credibility. Wall-clock assumes **2–3 engineers** working parallel surface zones.

### Phase 0 — Truth & honesty (cheapest, highest-credibility wins)

**Theme:** make the binary tell the truth, kill dead/misleading controls, fix the real bugs, cut the real release. This directly serves the locked rule _"no dead/duplicate controls, no fake availability badges."_

| Dimension    | Entry→Exit | Headline tasks                                                                                                                                         |
| ------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| architecture | 7→8.5      | T1 feature-gate voice; T2 version-sync checker + bump; T3 fix stale Homebrew formula (PLACEHOLDER_SHA, "25 providers"→15)                              |
| sessions     | 6→7        | **T1 fix the cosmetic `fork --at-turn/--as` bug** (truncate + rename + persist); T2 replace full-clone `forked_from`                                   |
| sandbox      | 5.5→6.5    | **T1 delete the misleading `/sandbox` toggle UX** + dead second renderer                                                                               |
| providers    | 8.5→9.3    | **T1 Anthropic OAuth→inference** (dead captured token); **T2 kill silent subscription-precedes-BYOK**; **T7 remove AGIWORKFORCE_OAUTH dead-end login** |
| headless     | 4.5→6      | **T1 emit defined-but-unemitted RunningTool/ToolResult events + real `cumulative_dollars`** (was 0.0)                                                  |
| hooks        | 8→8.5      | T1 strict schema-validated decision parser (fail-closed on malformed `{"decison":...}`)                                                                |
| tools        | 7→7.5      | **T1 apply_patch read-before-edit freshness gate** (real bug — write a patch against unread file currently succeeds)                                   |
| multiagent   | 6→7        | **T1 wire `--agent` flag** (`apply_to_session()` exists, never called); T2 local_shell real process spawn                                              |
| mcp          | 6.5→7      | **T1 wire `agi mcp-server` to advertise + execute its real catalog** (was `{"tools":[]}`)                                                              |

**Cross-cutting Phase 0:** README/parity-doc claims corrected everywhere (every dimension's final "honesty" task), `v-cli-X.Y.Z` tag cut (architecture T4–T8 — fail-closed tag-check, SHA256SUMS, Homebrew tap automation).
**Provisioning needed:** `HOMEBREW_TAP_TOKEN` + the `homebrew-tap` repo (ops, not cloud — architecture product_blockers).
**Wall-clock: ~2.5–3 weeks.** Avg moves ~6.4 → ~7.3. This is the release.

### Phase 1 — Daily-use UX (what a power user feels every session)

| Dimension     | Entry→Exit | Headline tasks                                                                                                                                                                                                                                 |
| ------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| tui           | 5.5→8      | **T1 multiline Composer** (the L refactor that unblocks the track); T2 Shift+Enter/growing box; **T3 history + Ctrl+R**; **T4 @-file completion** (nucleo); T5 $EDITOR; **T6 real colored diff hunks** (fixes the `vec![],0,0` empty-hunk bug) |
| tools         | 7.5→9      | T3 grep parity (output_mode/context/type/multiline); **T4 web_search keyless fallback** + structured results; **T5 view_image** (model SEES pixels — pipeline already exists)                                                                  |
| commands      | 8→9.5      | T1–T2 named args + shell-quote positional; T3 @file injection; **T4 inline `!`bash`` permission-gated**; T5 per-command tool/model scoping                                                                                                     |
| sessions      | 7→8.5      | **T3 in-TUI resume/fork picker overlay**; T4 wire Resume/Fork/Delete host actions                                                                                                                                                              |
| extensibility | 6→7.5      | **T1 skill scoring + budgeted listing** (kill wholesale injection); **T2 skill-as-tool** (progressive disclosure via existing deferred-tool infra)                                                                                             |

**Wall-clock: ~3.5–4 weeks** (tui T1 is the critical path; tools/commands parallelize). Avg → ~8.2.

### Phase 2 — Depth / agentic core (the long-session quality the leaders win on)

| Dimension  | Entry→Exit           | Headline tasks                                                                                                                                                                                                                                                                                                                                                                             |
| ---------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| agent_loop | 6.5→10               | **T1 real tokenizer + provider-usage ground truth** (replaces 4-bytes/token); T2–T4 thread Effort → Anthropic `thinking`/OpenAI `reasoning_effort`/Gemini `thinkingConfig`; **T5 per-iteration microcompact**; **T6 LLM compaction** (summarize-then-replace); T7 context-overflow trim+retry; T8 mid-turn steering; T9 parallel tools in permissioned flow; T10 reasoning tokens → ledger |
| sandbox    | 6.5→10 (macOS+Linux) | T2 SandboxPolicy drives Seatbelt/bwrap; T3 WritableRoot protects .git/.env; **T4 wire the dead PolicyEngine** into every tool call; T5 sandbox-driven approval (fail-closed when unenforceable); T6 real `--sandbox`/env/`/sandbox` controls; **T7 Linux seccomp net filter (L)**; T8 network policy; T9 truthful /doctor + CI matrix                                                      |
| mcp        | 7→10                 | T2–T5 resources RPC + model-callable tools + `/mcp` surface; T6 list_changed live refresh; **T7 sampling via local provider** (LOCAL-ONLY guard); T8 honest capabilities + roots/list                                                                                                                                                                                                      |
| multiagent | 7→8 (local core)     | **T3 local_agent → SubagentManager** (real AgentSession per task); privacy-boundary inheritance                                                                                                                                                                                                                                                                                            |
| sessions   | 8.5→10               | **T5 file-state checkpoints (git-tree snapshot per turn)**; **T6 file-restoring `/rewind`** with preview                                                                                                                                                                                                                                                                                   |

**Wall-clock: ~5–6 weeks.** This phase has the most L-effort and the most safety-sensitive code (sandbox T5/T7 invariant: _never auto-approve when no sandbox is enforceable_). Avg → ~9.0.

### Phase 3 — Platform (programmatic surface + enterprise auth + marketplace)

| Dimension     | Entry→Exit          | Headline tasks                                                                                                                                                                                                                                                                                                                  |
| ------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| headless      | 6→10 (local subset) | **T2 schema export + drift CI gate**; T3 real stream-json one-shot; **T4 bidirectional stdin control channel** (can_use_tool allow AND deny); **T5 app-server lifecycle methods** (thread/turn/model/permission); T6 mcp-server exec tool; **T7 publish `@agiworkforce/agent-sdk`** (TS, schema-generated); T8 golden NDJSON CI |
| providers     | 9.3→10              | **T3 Bedrock (env-bearer + SigV4 + EventStream)**; **T4 Vertex (ADC/SA-JWT)**; T5 Azure; **T6 wire CompositeRouter** (kill PHASE2 dead code) + `/route`                                                                                                                                                                         |
| multiagent    | 8→10 (local)        | T4 persistent teammate runtime; T5 WorktreeManager isolation; T6 live TUI progress; **T7 A2A batch/CSV fan-out** (exceeds Codex on local multi-agent)                                                                                                                                                                           |
| extensibility | 7.5→10              | **T3 skill frontmatter (allowed-tools/model/forked exec)**; **T4 git/URL marketplace** (`marketplace.json`); T5 wire `lsp_diagnostics` to publishDiagnostics; T6 usage ranking + `/skills`/`/plugins`/`/marketplace` TUI                                                                                                        |
| hooks         | 8.5→10              | T2–T3 allow/ask/deny into ApprovalBroker + PermissionRequest; **T4 project `.agiworkforce/hooks.json` layer** (trust-gated, deny/ask-only); T5 exit-code-2; T6 schema export                                                                                                                                                    |

**Cross-dimension synergy to coordinate:** headless T4's `CancellationToken` on `send()` is the _same_ token agent_loop T8 (mid-turn steering) needs — **build once** (headless notes flag this explicitly).
**Wall-clock: ~5–6 weeks.** Avg → ~9.7. **Note: providers/multiagent/headless each cap below 10 on their cloud-blocked sub-feature — see §6.**

### Phase 4 — Polish-to-10 (long-tail finish)

Remaining tasks: tui T7–T8 (image staging + kitty/iTerm2/sixel inline graphics), T9 mouse, T10 dead-code sweep, T11 footer hints; tools T6 (streaming/background shell `run_in_background`+BashOutput+KillShell), T7 PDF; agent_loop polish; commands T6–T7; sessions T7–T8; every dimension's final docs/honesty sweep + dead-control guard tests.

**Wall-clock: ~3–4 weeks.** Avg → **10/10 on the 10 fully-local dimensions; ~9.5 on the 3 cloud-gated ones** (capped by §6).

---

## 4. Dependency graph

**Hard ordering (must precede):**

```
architecture T2 (version-sync) ──► T3 (formula) ──► T5 (tag-check) ──► T6 (tap) ──► T8 (cut release)
              T1 (voice gate) ──► T7 (CI matrix) ──► T8
              T4 (SHA256SUMS) ──► T6, T8

agent_loop T1 (real tokenizer + provider truth)
   └─► T5 (mid-loop microcompact) ──► T6 (LLM compaction) ──► T7 (overflow trim+retry)
   └─► [all compaction decisions — building T5/T6 on the 4-bytes heuristic compacts at the WRONG moments]
agent_loop T2 (thread Effort) ──► T3/T4 (provider thinking) ──► T10 (reasoning→ledger)

tui T1 (Composer refactor) ──► T2,T3,T4,T5,T7 (entire composer track)
    T6 (diff) and T9 (mouse) are independent of T1 → parallelize early

tools T1 (apply_patch freshness) ──► T2 (fuzzy seek, freshness-aware)
      T5 (view_image) ──► T7 (PDF page-image)
      ALL feature tasks ──► T8 (consistency sweep / no-dead-control guard)

providers T1 (Anthropic OAuth) ──► T2 (precedence) ──► T6 (routing, never cross Local boundary)
          T3 (Bedrock) ──► T4 (Vertex) ──► T5 (Azure)   [shared auth scaffolding]
          T7 (kill dead login) ──► T8 (cloud backend — BLOCKED §6)

mcp T1 (server-mode) standalone | T2 (resources RPC) ──► T3 (aggregate) ──► T4 (tools) ──► T5 (UI)
    T2,T3 ──► T6 (list_changed) ; T7 (sampling) ──► T8 (advertise capabilities only AFTER honored)

sandbox T1 (kill toggle) standalone | T2 (policy→profile) is the spine
   ──► T3 (protected roots), T5 (sandbox-driven approval), T6 (real flags), T8 (network)
   T2 + T5 ──► T7 (Linux seccomp) ; T6 + T7 ──► T9 (doctor + CI matrix)
   T4 (wire PolicyEngine) independent — parallelize

sessions T1 (real fork) ──► T2,T7 ; T3 (picker) ──► T4 (host actions) ──► T8 (guard)
         T5 (file checkpoints) ──► T6 (file-restoring rewind)

multiagent T1 (--agent) ──► T3 (local_agent exec) ──► T4 (teammates) ──► T5 (worktrees), T6 (progress)
           T3 ──► T7 (A2A batch)

headless T1 (emit events) + T2 (schema) ──► T3 (stream-json) ──► T4 (stdin channel) ──► T7 (SDK)
         T1,T3 ──► T5 (app-server) ; T1 ──► T6 (mcp exec) ; all ──► T8 (golden CI) ──► T9 (docs)
         **app-server (T5) before SDK (T7); event emission (T1) before stream-json (T3) before SDK**

extensibility T1 (scoring/listing) ──► T2 (skill-as-tool) ──► T3 (frontmatter/forked)
              T4 (marketplace) independent ; T2 + T4 ──► T6 (usage + TUI)

hooks T1 (strict parser) ──► everything ; T2 ──► T3 ──► T4 (escalating trust) ; all ──► T6 (schema/docs)
```

**Cross-dimension:**

- **Real tokenizer (agent_loop T1) before accurate compaction (T5/T6)** — load-bearing.
- **Event emission (headless T1) before stream-json (T3) before SDK (T7).** App-server (T5) before SDK can wrap it.
- **`CancellationToken` on `send()`** shared by headless T4 (interrupt) + agent_loop T8 (steering) — build once.
- **sandbox T2 (policy→profile) before T5 (sandbox-driven approval)** so "sandbox enforceable" is a true signal.
- **models.json catalog** is the single source feeding agent_loop thinking-gating (T3/T4), providers model-list (T6), headless model/list (T5), extensibility skill model-override (T3), commands model-pin (T5), multiagent inherited model — **never hardcode** (locked rule).

---

## 5. Definition-of-10 gates

| Dimension         | The concrete condition that earns the 10                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **architecture**  | A buyer installs the _identical_ current version via `brew`/`npm`/`curl\|bash`/`cargo install --git`; all four resolve to byte-verified identical binaries; one `v-cli-X.Y.Z` push fails-closed if tag≠Cargo.toml≠npm≠formula, publishes SHA256SUMS, the curl installer verifies the checksum _before_ placing the binary, and the tap PR carries real shas. Voice behind a default-off `voice` feature. (post-release cross-channel version+checksum equality test)                                                            |
| **agent_loop**    | Token counts within ~5% of provider `input_tokens` (provider usage fed back as authoritative); LLM compaction summarize-then-replace with heuristic fallback; **per-iteration** microcompact so a 25-tool-storm never blows the window; Effort drives real `thinking`/`reasoning_effort`/`thinkingConfig` gated on `supports_reasoning`; mid-stream `ContextWindowExceeded` recovered by trim+retry; `message_queue` drained for steering; parallel safe tools under permissions; reasoning tokens in the ledger.               |
| **tools**         | Shell supports timeout + `run_in_background`(shell_id)+BashOutput+KillShell + head/tail streaming; `view_image` injects a real vision block gated on capability; web_search works with no key (keyless fallback) + structured results; grep at full Claude schema (output_mode/context/type/glob/multiline/head_limit); apply_patch has the freshness gate + fuzzy seek-sequence matching. All tested, no dead params.                                                                                                          |
| **tui**           | Multiline composer (Shift+Enter, growing box, full cursor mechanics); persisted history + Ctrl+R reverse-search; @-file fuzzy popup wired to the turn; $EDITOR escape; real colored line-numbered syntect-highlighted diff hunks with correct +N/−M; image paste/staging + inline kitty/iTerm2/sixel preview; mouse wheel-scroll with copy-safe toggle; **zero `#![allow(dead_code)]` on live widgets, no advertised key that does nothing**.                                                                                   |
| **providers**     | Anthropic subscription OAuth drives `/v1/messages` (Bearer + `oauth-2025-04-20`, auto-refresh); enterprise BYO-cloud auth for Bedrock (SigV4)+Vertex (ADC)+Azure; auth precedence announced + overridable via `--auth`; CompositeRouter auto/cost live with `/route`; no dead login (AGIWORKFORCE waitlist-gated honestly). _(10 reachable under local lock via BYO-enterprise-cloud; T8 managed-cloud excluded.)_                                                                                                              |
| **mcp**           | Full client: resources/list+read as model-callable tools + `/mcp` surface; sampling via the session's local provider (LOCAL guard); roots/list; list_changed live refresh on stdio+SSE; `initialize` advertises only honored caps. Server: `agi mcp-server` advertises + executes its real read-only catalog via CliToolDispatch.                                                                                                                                                                                               |
| **sandbox**       | One typed SandboxPolicy drives the live Seatbelt SBPL + bwrap+seccomp on macOS+Linux; WritableRoot keeps .git/.env read-only inside writable roots; sandbox-policy-driven approval auto-runs provably-constrained writes and **fails closed (AskUser) when no sandbox is enforceable**; project policy.toml consulted every call; every flag/env/mode maps to real enforcement; /doctor reports ground-truth `enforced: yes/no/degraded`. _(Windows kernel enforcement product-gated — §6 — must report honest degradation.)_   |
| **commands**      | A `.md` author gets named args (`$pr` from `argument-hint`) with shell-quote positional parsing; inline `!`bash``permission-gated through the bash safety path;`@file`injection; per-command`allowed-tools`+`model` enforced for that turn only and restored; all surfaced in REPL+TUI completion; meta dead-control test proves every frontmatter key has an end-to-end effect.                                                                                                                                                |
| **hooks**         | PreToolUse/PermissionRequest hooks return structured `allow`/`ask`/`deny` wired into the ApprovalBroker (allow suppresses overlay, ask raises it, deny blocks with reason); strict `deny_unknown_fields` schema validation fails-closed on malformed JSON; project `.agiworkforce/hooks.json` layer with documented precedence + trust gate (project can only tighten); exit-code-2 blocking convention; schema export + CI.                                                                                                    |
| **sessions**      | `fork --at-turn N --as <name>` truncates at the nth boundary, names the session `<name>`, records lineage; in-TUI resume/fork/delete picker; `/rewind` restores **file state + messages** via per-turn git-tree snapshots (never touching the user's stash list) with a reverted-file preview; list shows fork lineage + cwd + first-prompt.                                                                                                                                                                                    |
| **multiagent**    | `task_create` kinds actually dispatch (local*shell→real process, local_agent→real AgentSession via SubagentManager); `spawn_teammate` launches persistent mailbox-draining agents in optional isolated worktrees; `--agent` applies the definition; live TUI progress; A2A batch/CSV fan-out with concurrency cap + crash recovery; every control executes, no metadata-only registries. *(Cloud-backed tasks excluded — §6.)\_                                                                                                 |
| **headless**      | A programmatic embedder drives a full agent session via (A) bidirectional app-server (thread/turn/model/permission lifecycle, streaming events, approvals as server→client requests) and (B) bidirectional stream-json stdio (consumes SdkInputMessage, emits full event stream incl. CanUseTool **allow AND deny**); every defined event emitted incl. real cumulative cost; published `@agiworkforce/agent-sdk` generated from a schema with a drift CI gate; golden NDJSON CI smoke. _(Cloud-method surface excluded — §6.)_ |
| **extensibility** | Skills progressively disclosed (name+budgeted description listing, bodies loaded only via the model-invoked `skill` tool — wholesale injection gone, scoring live); skills support allowed-tools/model/forked exec; git/URL `marketplace.json` with add/search/install/update/remove, an official default source, integrity-checked, offline-after-add; `lsp_diagnostics` subscribes to publishDiagnostics; `/skills`/`/plugins`/`/marketplace` TUI with every action wired.                                                    |

---

## 6. Product-strategy decisions required FIRST

These are **blocked on a founder product decision** because they conflict with the locked v1-local-only/waitlist strategy. **Decide these before Phase 3 starts** (they gate the _final point_ of 3 dimensions; everything else proceeds without them).

**A. Managed-cloud inference — the hard cloud blocker (BLOCKS the literal 10 on 3 dimensions).**

- **providers T8** — `AGIWORKFORCE_OAUTH` managed-cloud inference backend. Captured device token, no backend consumes it. The locked rule: managed compute stays waitlist/private-beta until ledgering, abuse, fraud, refunds, chargebacks, provider terms, retention, and deletion controls are proven. **In v1, ship the honest waitlist placeholder (T7), not the backend.**
- **multiagent** — cloud-backed agent tasks + `kind=remote_agent` to a managed fleet (`cloud.rs` correctly fails closed today). Codex's distinguishing 9-point feature.
- **headless** — cloud-task/remote-control/realtime app-server methods + a managed-compute headless CI runner.

> **Founder decision required:** _Do we unblock managed-cloud inference for v1, or accept that `providers`/`multiagent`/`headless` cap at ~9.5 (their local 10 minus the cloud point) until the ledgering/abuse/fraud/refund/retention controls are built and waitlist graduates?_ My recommendation: **accept the cap, ship local-only.** The local 10 on all three is reachable without it, and the lock exists for good legal/financial reasons.

**B. BYO-enterprise-cloud auth scope (likely in-scope — needs a one-line confirmation).**

- **providers T3–T5** (Bedrock/Vertex/Azure) ship under v1 as **BYO-enterprise-cloud** — the user supplies their _own_ AWS/GCP/Azure credentials and pays their _own_ cloud bill. That's a BYOK trust boundary, identical to a raw API key, **not AGI-managed compute.** This is what carries the auth-depth weight to 10.
  > **Founder decision required:** _Confirm BYO-enterprise-cloud auth is in-scope for v1 (it should be — same trust model as an API key)._ If product rules it cloud-gated, providers caps at ~9 until unblocked.

**C. Go-to-market / ops gates (not cloud, but need a yes/no).**

- **architecture T8** — cutting a _real public versioned release_ wants founder sign-off on timing/marketing (and that main is release-worthy). Needs `HOMEBREW_TAP_TOKEN` + the `homebrew-tap` repo provisioned (ops credential, not cloud).
- **headless T7 / extensibility T4+T7** — _publishing_ `@agiworkforce/agent-sdk` to public npm (vs build-from-source tarball) and standing up the official `agi-plugins-official` marketplace repo are release/org decisions (who owns it, plugin review policy). Engineering is shippable; the publish/host step is a GTM gate.

**Dimensions that literally cannot hit 10 without unblocking cloud:** providers, multiagent, headless (their final ~0.5 point each). **All 10 other dimensions hit a clean 10 under the local-only lock.**

---

## 7. Quick wins this week vs heavy lifts (quarters)

### Quick wins this week (S/M effort, high credibility — mostly wiring dead code)

- **providers T1** — Anthropic OAuth→inference (M). Dead captured token → live. (~2–3 d)
- **providers T2** — kill silent subscription-precedes-BYOK with announce+override (M).
- **providers T7** — remove AGIWORKFORCE dead-end login → waitlist message (S, ~0.5 d).
- **sessions T1** — fix cosmetic `fork --at-turn/--as` (M) — a real bug the report flags.
- **sandbox T1** — delete misleading `/sandbox` toggle (S) — P0 dead control.
- **tools T1** — apply_patch read-before-edit freshness gate (S) — real bug.
- **mcp T1** — wire `agi mcp-server` to its real catalog (S, <1 day) — `{"tools":[]}` → 7 real tools.
- **multiagent T1** — wire `--agent` flag (S) — `apply_to_session()` exists, never called.
- **headless T1** — emit RunningTool/ToolResult + real `cumulative_dollars` (M).
- **architecture T2** — version-sync checker + bump script (S).
- **hooks T1** — strict fail-closed decision parser (M).

> These ~11 tasks (mostly S/M, mostly parallelizable) move the average from ~6.4 toward ~7.3 in roughly **the first two weeks** and eliminate the dead-control credibility liability that the locked quality-floor rule treats as launch-blocking.

### Heavy lifts (quarters — the L-effort depth)

- **agent_loop T6** — LLM-based compaction summarize-then-replace (L) + the T1→T5→T6→T7 critical path (~2.5–3 wk).
- **tools T6** — streaming + background shell (`run_in_background`/BashOutput/KillShell) (L).
- **tui T1** — multiline Composer refactor (L) — touches ~40 sites in a 142K-LOC file; gates the whole composer track.
- **providers T3–T4** — Bedrock SigV4+EventStream (L) + Vertex ADC/SA-JWT (L) — fiddly AWS binary framing, pure-Rust token minting.
- **mcp T7** — server-initiated sampling via local provider (L) — re-entrancy + LOCAL-ONLY guard.
- **sandbox T7** — Linux seccomp-BPF net filter + landlock, default-on (L) — most error-prone area; needs x86_64+aarch64 hardware.
- **sessions T5+T6** — file-state git-tree checkpoints + file-restoring rewind (2× L).
- **multiagent T4+T7** — persistent teammate runtime (L) + A2A batch fan-out (L).
- **headless T4+T5+T7** — bidirectional stdin channel (L) + app-server lifecycle (L) + the SDK package (L).
- **extensibility T3** — forked sub-agent skill execution (L).

---

## 8. Total effort & milestone calendar

### Net effort per dimension (from the plans)

| Dimension              | Net effort                                     |
| ---------------------- | ---------------------------------------------- |
| architecture           | ~1.5–2 wk                                      |
| agent_loop             | ~4–5 wk (1 eng) / ~2.5–3 wk crit-path w/ 2 eng |
| tools                  | ~3–4 wk (1) / ~1.5 wk (2–3)                    |
| tui                    | ~4–5 wk (1) / ~3 wk (2)                        |
| providers              | ~4–5 wk (T8 excluded)                          |
| mcp                    | ~3–3.5 wk                                      |
| sandbox                | ~4–5 wk (macOS+Linux; Windows extra)           |
| commands               | ~2 wk                                          |
| hooks                  | ~2.5–3 wk                                      |
| sessions               | ~3–3.5 wk                                      |
| multiagent             | ~4–5 wk                                        |
| headless               | ~5–6 wk (1) / ~4 wk (2)                        |
| extensibility          | ~3.5–4.5 wk                                    |
| **Sum (1-eng-serial)** | **~45–55 engineer-weeks**                      |

### Calendar (small team — assume **2–3 engineers**, parallel surface zones)

| Milestone                                      | Target                        | Avg score                                       | What's true                                                                                                                                                                                                   |
| ---------------------------------------------- | ----------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M0 — Truth release (Phase 0)**               | **End of Week 3**             | ~7.3                                            | Real `v-cli` release cut; all dead/misleading controls killed; fork bug, freshness bug, dead OAuth, dead events, dead mcp-server, dead `--agent` all fixed. _This is the Product-Hunt-able honesty baseline._ |
| **M1 — All dimensions ≥8 (Track A, +Phase 1)** | **~Week 10–12**               | ~8.2                                            | Every dimension a credible peer of Claude/Codex. Daily-use UX (composer/history/@-completion/diff/view_image), commands, sessions picker, skill-as-tool. **Launch bar met.**                                  |
| **M2 — Agentic depth (Phase 2)**               | **~Week 17–18**               | ~9.0                                            | agent_loop=10, sandbox=10 (macOS+Linux), mcp=10, sessions=10. Real compaction, real thinking, real enforcement, file-state rewind.                                                                            |
| **M3 — Platform (Phase 3)**                    | **~Week 23–24**               | ~9.7                                            | headless app-server+SDK, enterprise BYO-cloud auth, A2A fan-out, marketplace, hooks decision model. _(providers/multiagent/headless at their local 10; cloud point pending §6.)_                              |
| **M4 — All 10 (Phase 4 polish)**               | **~Week 27–28 (~6–7 months)** | **10/10** on 10 dims; ~9.5 on the 3 cloud-gated | Long-tail finish. The 3 cloud-gated dimensions reach a literal 10 only if/when the founder unblocks managed cloud (§6).                                                                                       |

**Blunt bottom line:** ≥8 everywhere (the bar that matters) in **~3 months**; a credible literal-10 on the 10 local dimensions in **~6–7 months**; the last 3 points are a _product decision_, not an engineering schedule.

---

## 9. Risk register

| #   | Risk                                                                                                                                                                                                                                                                  | Severity    | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **Moving target** — Claude Code & Codex keep shipping across ~960K LOC + a mature ecosystem; "10/10 = out-finish two of the best-funded teams" is a treadmill.                                                                                                        | High        | Anchor 10/10 to the _defined bars_ in §5, not to "whatever the rivals shipped last week." Re-score quarterly against fresh `reference/` snapshots. Win on the **3 unique assets** (A2A, ecosystem-import, learned-skills) rather than chasing parity on everything. Accept that some dimensions oscillate 9↔10 as rivals ship.                                                                                                              |
| R2  | **The dead-wiring anti-pattern recurs** — the root cause of the 6.4 score is scaffolded-but-dead code (8/13 dimensions). New work could re-introduce it.                                                                                                              | High        | Every plan ends with a **no-dead-control guard test** (commands T7 meta-test, tui T10 grep guard, headless T8 golden-CI, tools T8 catalog dispatch test, hooks T6 schema). Enforce: no PR merges a flag/event/tool without a test proving the _allow/happy path actually runs_ (the locked `callback-plus-fallback-guard` lesson — the allow path is where fall-through hides).                                                             |
| R3  | **Scope: literal-10-everywhere is unbounded for a small team.**                                                                                                                                                                                                       | High        | Ship **Track A (≥8)** and stop blocking launch. Treat Track B as per-dimension opt-in driven by competitive pressure. Phase 0 alone retires the launch-blocking credibility risk.                                                                                                                                                                                                                                                           |
| R4  | **Security regressions in the safety-sensitive tasks** — sandbox T5/T7 (auto-approve when no sandbox enforceable), hooks T2/T3 (a hook `allow` silencing prompts), commands T4 (inline bash bypass), MCP/sampling (Local→cloud egress).                               | High        | Hard invariants with dedicated tests: _never auto-approve unsandboxed_ (downgrade to AskUser); auto-`allow` honored **only** from trusted user/global-plugin layers (project layer deny/ask-only, trust-gated); inline bash **must** flow through the existing safety/approval path; every spawned agent/skill/sampling call inherits `privacy_mode` and runs `validate_privacy_boundary` before egress. Security-review each before merge. |
| R5  | **tui T1 Composer refactor (142K-LOC file, ~40 call sites)** breaks rendering broadly; it gates the entire composer track.                                                                                                                                            | Medium-High | Delegating accessors during migration + `cargo check` between each batch (the plan's stated approach). Land tui T6 (diff) and T9 (mouse) first — they're independent of T1 and de-risk the phase.                                                                                                                                                                                                                                           |
| R6  | **Platform-specific long-poles** — Linux seccomp (sandbox T7) needs x86_64+aarch64 hardware and can break legit subproc tools (e.g. `recvfrom` for cargo clippy); AWS EventStream/SigV4 (providers T3); ADC token minting (providers T4); terminal graphics (tui T8). | Medium      | Stage incrementally (Bedrock env-bearer before SigV4; SA-JWT before gcloud-fallback); CI matrix gating (sandbox T9); fail-closed/degrade-honestly rather than pretend (Windows enforcement, Linux network-allowlist). Windows kernel sandbox stays a tracked product decision, not a launch blocker.                                                                                                                                        |
| R7  | **Cloud lock blocks the literal 10 on 3 dimensions** and could tempt silently building the remote path.                                                                                                                                                               | Medium      | Decide §6 explicitly _before Phase 3_. Do **not** silently build managed-cloud (the lock's whole point). Leave documented gaps (remote compaction, cloud tasks, cloud methods) — never claim them.                                                                                                                                                                                                                                          |
| R8  | **New dependencies** — tiktoken-rs, nucleo-matcher, ratatui-image, arboard, shell-words, aws-sigv4/aws-config, landlock/seccompiler, schemars, pdf-extract. Binary size + license + offline-build concerns.                                                           | Low-Medium  | Vet each against `THIRD_PARTY_LICENSES`; feature-gate the heavy AWS/voice deps; pin offline-embeddable tiktoken so a Local build never hits the network; justify each in PR (the plans already flag this per-dep).                                                                                                                                                                                                                          |
| R9  | **Effort estimates are optimistic** — first-ever end-to-end runs (architecture T8 release pipeline; headless app-server) expect "one or two CI fixups."                                                                                                               | Low-Medium  | Build buffer into M0/M3. The release pipeline and app-server are the two "never run at this version" paths — schedule a fixup day each.                                                                                                                                                                                                                                                                                                     |

---

**One-paragraph executive summary for the founder:** AGI CLI's 6.4 average is not a quality ceiling — it's mostly _dead wiring on top of code we already wrote_ (the Effort enum, the subagent executors, the sdk_io protocol, the PolicyEngine, the MCP dispatch, the message_queue are all built and tested but uncalled). Phase 0 — ~3 weeks of honesty fixes and cutting a real release — retires the launch-blocking credibility risk and moves the average to ~7.3. Track A (every dimension ≥8, the Product-Hunt bar) is ~3 months with 2–3 engineers. A literal 10 on the 10 fully-local dimensions is ~6–7 months. The final point on `providers`, `multiagent`, and `headless` is **not an engineering problem — it's a product decision** about unblocking managed-cloud inference, which the locked v1-local-only strategy keeps waitlist-gated for good legal/financial reasons; recommend accepting that ~9.5 cap and shipping local-only. Plans cited: every task id above maps to a real file:line in the JSON (e.g. `compaction.rs:213` heuristic comment, `scripts/homebrew/agiworkforce.rb` PLACEHOLDER_SHA, `routing/strategy.rs:1` PHASE2 dead code, `app_server.rs:267` `{"tools":[]}` stub, `lib.rs:1132-1172` cosmetic fork).
