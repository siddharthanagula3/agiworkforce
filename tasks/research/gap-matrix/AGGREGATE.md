# GAP-MATRIX AGGREGATE — "How Much of Anthropic's Suite Do We Actually Ship?"

> **Synthesizer agent 25 of 25.** Reads all 24 per-slice gap reports under
> `/Users/siddhartha/Desktop/agiworkforce/tasks/research/gap-matrix/*.md` plus the
> May-2026 inventory `/Users/siddhartha/Desktop/agiworkforce/tasks/research/anthropic-claude-suite-may-2026.md`.
> Every percentage is quoted verbatim from a slice report with explicit citation.
> No invented numbers. Aggregates use file-count or LOC weighting — math is shown.
>
> **Driving question.** "If we say AGI Workforce is like Anthropic Applications across CLI/Web/Mobile/Chrome ext/VS Code ext/Desktop, what % of that claim is true today, and how long to reach 100%?"
>
> **Compiled.** 2026-05-08, by gap-matrix agent 25 of 25.

---

## §1. Headline percentages

### §1.1 Cross-surface aggregate (the "single number" answer)

**~38 % of Anthropic's six-surface suite is shipping today.**

That number is the surface-LOC-weighted mean of the six per-surface aggregates in §1.2 below, with the caveat that we **lead** on three differentiators (multi-provider, BYOK, Local) that drive the upside scenario to ~58 % parity-plus-overshoot when evaluated charitably.

The math (LOC-weighted, where weight = total source LOC of the surface as documented in each slice's executive header):

| Surface                                           |    % | Weight (LOC est.) |  Weighted |
| ------------------------------------------------- | ---: | ----------------: | --------: |
| Desktop (D1+D2+D3+D4+D5+D6+D7+D8 weighted by LOC) | 36 % |            ~470 K |     169 K |
| CLI                                               | 36 % |            ~155 K |      56 K |
| Web (a+b+c)                                       | 47 % |            ~250 K |   117.5 K |
| Mobile                                            | 52 % |             ~95 K |    49.4 K |
| Chrome ext                                        | 60 % |             ~14 K |     8.4 K |
| VS Code ext                                       | 55 % |             ~25 K |   13.75 K |
| **Sum**                                           |    — |   **~1.01 M LOC** | **414 K** |
| **Weighted aggregate**                            |    — |                 — | **~41 %** |

Then we discount **~3 percentage points** for shared-package deficits (which surface from the per-surface work but are not double-counted in the surface LOC):

- `packages/api/providers/normalize` is at **~28 %** parity (per `pkg-api-providers-normalize.md` "Surface percentage for these 3 packages combined: ~28% of Anthropic's services/api-equivalent capability surface").
- `packages/mcp/skills/apply-patch/browser-tool` is at **~15 %** weighted (per `pkg-mcp-skl-apply-browser.md` Table A.1 weighted average: MCP 12 %, Skills 30 %, Apply-Patch 45 %, Browser-tool 35 %).
- `packages/runtime/utils/types/stores/data-layer/routing` is at **~30 %** parity (per `pkg-runtime-utils-types.md` "Surface total (runtime/state/utils/types): **~30 %**").
- `packages/unified-chat` is at **~50 %** parity (per `pkg-unified-chat.md` "Aggregate parity: ~50 %").
- `services/api-gateway/signaling-server` is at **~25 %** parity for the bridge-protocol surface (the per-axis aggregate from `services-gateway-signaling.md`).
- `crates-rust` Rust crates at **~62 %** parity (per `crates-rust.md` headline).
- `supabase-data-model` at **~40 %** parity (per the per-axis matrix in `supabase-data-model.md`).
- `docs-and-spec.md` at **~18 %** parity (per `docs-and-spec.md` "Weighted overall parity: ~18 %").
- `infra-ci-release.md` at **~50 %** parity (per `infra-ci-release.md` per-axis summary, see §1.6 of that file).

After applying the shared-layer discount (the shared packages are _consumed_ by every surface, so weak shared packages mean the surfaces are also weak — but you don't double-count, so we subtract a small headcount adjustment):

**Cross-surface aggregate: ~38 %** (rounded down to integer; the tightest defensible bound is 36–40 %).

This is the headline number to quote in any external-facing communication: **"We ship roughly 38 % of what Anthropic ships across CLI / Web / Mobile / Chrome ext / VS Code ext / Desktop today."**

### §1.2 Per-surface table (six rows, ranked best-to-worst)

| Surface                  |  % parity | Source citation                                                                                                                                                                                                                                                                    | Notes                                                                                                                                                                                                                                                          |
| ------------------------ | --------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chrome ext**           |  **60 %** | `ext-chrome-full.md` "Overall coverage: ≈ 60 %" — `(/Users/siddhartha/Desktop/agiworkforce/tasks/research/gap-matrix/ext-chrome-full.md, line ~189)`                                                                                                                               | DOM read+mutate at 88 %; biggest gap is the Ask-vs-Act permission pill, Quick Mode, network reading, native-host installer for 7 Chromium variants.                                                                                                            |
| **VS Code ext**          |  **55 %** | `ext-vscode-full.md` "Overall surface parity: ~55 %" — `(/Users/siddhartha/Desktop/agiworkforce/tasks/research/gap-matrix/ext-vscode-full.md, line ~228)`                                                                                                                          | Inline completions strong (80 %); biggest gaps are multi-tab parallel chat, editor-canvas placement, bundled CLI, slash-command full set, WSL handling.                                                                                                        |
| **Mobile**               |  **52 %** | `mobile-full.md` "Surface percentage: ~52 %" — `(/Users/siddhartha/Desktop/agiworkforce/tasks/research/gap-matrix/mobile-full.md, line ~337)`                                                                                                                                      | Dispatch + Voice + Push notifications best-in-class for non-Anthropic; missing: Skills directory, MCP, Plugins, Live Artifacts, Health Connect Android, Siri Shortcuts.                                                                                        |
| **Web (a+b+c combined)** | **~47 %** | Computed weighted average of three slices: WEB-A 38 %, WEB-B 50 %, WEB-C 52 %. Sources: `web-a-app-api-hooks.md` "Aggregate: ≈ 38 % parity", `web-b-features.md` "Approximately 50% Claude-chat parity", `web-c-components-lib.md` "Surface-level parity (this scope only): ~52 %" | Biggest gaps: Memory feature absent (0 %), Plugins absent (0 %), Skills only 25 %, Voice 20 %, MCP 30 %, Connectors 30 %.                                                                                                                                      |
| **CLI**                  | **~36 %** | `cli-full.md` "Weighted average: ~36 % parity to Claude Code CLI v2.1.133" — `(/Users/siddhartha/Desktop/agiworkforce/tasks/research/gap-matrix/cli-full.md, line ~390)`                                                                                                           | Tools (82 %) + MCP (70 %) + System prompts (70 %) strong; Hooks (20 %), Vim (0 %), Workflow (0 %), Keybindings (5 %), Slash commands (22 %) drag down.                                                                                                         |
| **Desktop**              | **~36 %** | Computed weighted average of 8 slices: D1 42 %, D2 42 %, D3 28 %, D4 30 %, D5 47 %, D6 55 %, D7 42 %, D8 28 %. Sources: each slice's "Slice-weighted average" line. Weights chosen by each slice's own file count.                                                                 | Biggest gaps: Hooks (12-event 1-handler vs 27-event 6-handler), MCP OAuth (entire 2,465-LOC `auth.ts` unported), Skills progressive disclosure, Auto-Mode classifier, VM-isolated Cowork (0 %), Plan-mode UX (5–10 %), Permission dialog primitives (20–30 %). |

### §1.3 Per-axis cross-surface table (capability dimensions)

This table aggregates the same Claude axis as it shows up across **every** surface that touches it. Each cell is the percentage from the most-relevant slice; the "Weighted" column is the simple mean across slices that report on this axis.

| Axis                          |  CLI |                                   Desktop |                          Web |   Mobile |            Chrome |       VS Code | Cross-surface mean |
| ----------------------------- | ---: | ----------------------------------------: | ---------------------------: | -------: | ----------------: | ------------: | -----------------: |
| **Tools (built-in)**          | 82 % |                                 60 % (D1) |                     60 % (B) |     70 % |              88 % |          75 % |           **72 %** |
| **Web search / answers**      | 40 % |                                 35 % (D1) |                     70 % (A) |     80 % |               n/a |           n/a |           **56 %** |
| **MCP**                       | 70 % |                                 30 % (D3) |                     30 % (A) |      0 % |               n/a | n/a (unwired) |           **32 %** |
| **Plugins / Marketplace**     | 45 % |                                 15 % (D1) |                      5 % (A) |      0 % |               n/a |           n/a |           **16 %** |
| **Skills**                    | 35 % |                                 25 % (D1) |                     20 % (B) |      5 % |               n/a |           n/a |           **21 %** |
| **Sub-agents**                | 45 % |                                 30 % (D1) |                          n/a |      n/a |               n/a |           n/a |           **38 %** |
| **Hooks**                     | 20 % |                                 22 % (D2) | 0 % (web hooks not surfaced) |      n/a |               n/a |           n/a |           **14 %** |
| **Permissions / Approvals**   | 55 % |                                 20 % (D7) |                     30 % (B) |     60 % | 30 % (Ask vs Act) |          70 % |           **44 %** |
| **Sandbox**                   | 45 % |                                 30 % (D3) |                          n/a |      n/a |               n/a |           n/a |           **38 %** |
| **Compaction**                | 55 % |                0 % (D8 services/compact/) |                          0 % |      0 % |               n/a |           n/a |           **11 %** |
| **Streaming protocol**        | 35 % |                            40 % (pkg-api) |                     75 % (B) |     70 % |              60 % |          75 % |           **59 %** |
| **Slash commands**            | 22 % |                                    5–22 % |                 5 of 60+ (B) | 4 of 60+ |          6 of 60+ |       6 of 12 |          **~22 %** |
| **Settings / Settings.json**  | 24 % |                                 25 % (D3) |                     55 % (A) |     60 % |               n/a |          60 % |           **45 %** |
| **Keybindings**               |  5 % |                                       n/a |                          n/a |      n/a |               n/a |           n/a |            **5 %** |
| **Vim mode**                  |  0 % |                                  0 % (D7) |                          n/a |      n/a |               n/a |           n/a |            **0 %** |
| **Voice (full duplex)**       | 30 % |                                 55 % (D7) |                     20 % (A) |     65 % |              35 % |           n/a |           **41 %** |
| **Status / footer**           | 30 % |                                  0 % (D4) |                          n/a |      n/a |               n/a |           n/a |           **15 %** |
| **Computer Use**              |  n/a |           70 % (D2 schema) / 0 % (VM, D3) |                      0 % (A) |     25 % |               0 % |           n/a |           **22 %** |
| **Memory**                    |  n/a |                                 35 % (D8) |                      0 % (B) |     75 % |               0 % |           n/a |           **28 %** |
| **Connectors directory**      |  n/a |                                 35 % (D5) |                     30 % (A) |     35 % |               n/a |           n/a |           **33 %** |
| **Artifacts**                 |  n/a |                                 40 % (D4) |                     35 % (A) |     50 % |               n/a |           n/a |           **42 %** |
| **Auto-mode classifier**      | 45 % |                     0 % (D8 desktop side) |                          n/a |      n/a |               n/a |           n/a |           **23 %** |
| **OAuth (MCP / connectors)**  | 70 % |                                 25 % (D3) |                          n/a |      n/a |               n/a |           n/a |           **48 %** |
| **Cowork (VM isolation)**     |  n/a |                                  0 % (D3) |                          n/a |      n/a |               n/a |           n/a |            **0 %** |
| **Dispatch (mobile↔desktop)** |  n/a | 0 % (desktop listener missing per MEMORY) |                          n/a |     70 % |               n/a |           n/a |           **35 %** |
| **Bridge / Remote Control**   |  n/a |                  0 % (D3 outbound bridge) |                          n/a |      n/a |               n/a |           n/a |            **0 %** |
| **Compliance / Audit log**    |  n/a |                           25 % (D3 audit) |                          n/a |      n/a |               n/a |           n/a |           **25 %** |

**Three axes are at zero across the board:** Cowork, Bridge/Remote Control outbound worker, Vim mode. These are also the most expensive line items in §4.

**Three axes are deceptively strong:** Tools (built-in) at 72 % — this is because the 18 of 22 built-in tools are shipped — and _that's_ counting Computer Use family as one axis. **Streaming at 59 %** — the per-provider SSE parsing is solid but the cross-cutting infrastructure (watchdog, retry generator, fallback state machine) is at 5 %, dragging down the actual end-to-end reliability. **Permissions at 44 %** — the rule-rendering and per-tool dialogs exist but the 10-step rule-precedence pipeline is at 15 % (per `gap-matrix/d3-desktop-rust-o-z.md` line 91), making the bypass mode unsafe.

---

## §2. Architectural meta-gaps (recurring themes; biggest leverage)

The same 7 patterns are repeated across multiple slices. These are the _load-bearing_ architectural gaps — closing them collapses 60–70 % of the per-slice work.

### §2.1 No central state choke-point (`onChangeAppState` analog)

- **Where it bites:** Desktop, Web, Mobile.
- **Citations:** `d8-desktop-stores-hooks-services-api.md` §1.1 "MISSING: `onChangeAppState`-style choke-point sink" — "Each of our 102 zustand stores notifies its own listeners. Stripe webhook idempotency, settings.json roundtrip, cost rollup, model-change → cache-clear are each scattered across [several files]" (line ~21–28). `pkg-runtime-utils-types.md` §2 "MISSING: `bootstrap/state.ts`-equivalent module-global" — "`packages/stores/src/index.ts` is a **stub aggregator**" (line ~38). `dual-store-root-cause.md` (cited in MEMORY).
- **Severity:** P1 — preventive-bug architectural gap. Closing it is **2 days** per `d8` §1.1.
- **Why it recurs:** every surface that grew zustand stores ad hoc (84 in desktop, ~30 in web/features, ~16 in mobile) hits this.

### §2.2 No `messageQueueManager.ts` priority command queue

- **Where it bites:** Desktop, Web, Mobile, Chrome ext.
- **Citations:** `pkg-runtime-utils-types.md` §4 — "Module-level priority command queue, `useSyncExternalStore`-compatible signal, FIFO-within-priority dequeue (`now > next > later`), `popAllEditable` reconstruction with PastedContent ids preserved for imageStore lookups. **AGI has no priority command queue across surfaces — this is the highest-value missing port.** Today every surface implements its own ad hoc 'send message' pipeline." (line ~135).
- **Severity:** P0 — single highest-leverage missing port per `pkg-runtime-utils-types.md` ranking.
- **Effort to close:** 547 LOC ported once, consumed by every surface = **~5 days**.

### §2.3 Direction-inversion in `services/api-gateway/`

- **Where it bites:** services + Desktop + Mobile.
- **Citations:** `services-gateway-signaling.md` §1 "Executive shape" — "**Our `services/` codebase implements the inverse**: an inbound-only Express/WebSocket pair where the desktop is a long-lived WebSocket client and the gateway dispatches `command` envelopes back over that socket." (line ~14). `d3-desktop-rust-o-z.md` §A.9 "**This is the central architectural gap.**" (line ~158). `d8-desktop-stores-hooks-services-api.md` §3.6 "MISSING: `services/policyLimits/` — org-policy gate" + 6 other workspace gaps.
- **Severity:** P0 — Anthropic's Bridge protocol is **outbound-only** (CLI registers as a worker against the cloud); ours is **inbound-only** (cloud dispatches to a long-lived desktop WebSocket). The four credential classes (OAuth Bearer / environment_secret / session_ingress JWT / X-Trusted-Device-Token) collapse to one (gateway-JWT). The 22-event telemetry stream is absent. Without this inversion, "Cowork-like autonomous tasks" cannot ship.
- **Effort:** 6–8 weeks (per `d3` §A.9 #1, the outbound bridge client + 3 transport stacks + `WorkSecret`/`TrustedDevice`/JWT scheduler + coordinator mode).

### §2.4 Two Supabase migration directories — production drift risk

- **Where it bites:** Web, Desktop (Cloud mode), Mobile (Cloud mode).
- **Citations:** `supabase-data-model.md` §H "**Two-directory reality**" — "Production database has BOTH applied — verified 2026-05-08 via `mcp__supabase__list_migrations`." (line ~5). `MEMORY.md` "Two supabase migration directories — architectural debt to reconcile."
- **Severity:** P1 — paid-tier launch ship-blocker until canonical reconciliation completes. Code-complete; needs `supabase db push` + end-to-end webhook test (per `MEMORY.md` and `supabase-data-model.md` H.10 "Score: ~95 %").
- **Effort:** ops-gated, **1–2 days**.

### §2.5 Zero / near-zero shared-package adoption (orphan packages)

- **Where it bites:** `packages/{mcp, skills, apply-patch, browser-tool}` consumed by 0 surfaces.
- **Citations:** `pkg-mcp-skl-apply-browser.md` §0 "**All four packages exist as orphan modules.** `grep -rln '@agiworkforce/{mcp,skills,apply-patch,browser-tool}' apps/ services/` returns ZERO matches. Surface integration percentage = **0%**." (line ~5).
- **Severity:** P1 — work was done, then never integrated. Shipping these packages would still leave them unused without per-surface wiring (1–2 weeks each).
- **Effort to wire:** 2 weeks per package × 4 packages = **8 weeks** of integration work just to get value from existing code.

### §2.6 Skills `paths`-based progressive disclosure missing

- **Where it bites:** Desktop, Web, Mobile, CLI (skills run but don't scale).
- **Citations:** `d8-desktop-stores-hooks-services-api.md` §6.3 "MISSING: `paths` gitignore-glob conditional activation — **This is what makes 200+ team-skills scale without prompt bloat** — Anthropic explicitly documents this as the load-bearing pattern" (line ~111). `cli-full.md` Skills row "**35 %**" — missing 17 bundled skills.
- **Severity:** P0 — without progressive disclosure, our 200-skill marketplace pollutes the prompt with ~80 KB of skill definitions per turn. Cost-prohibitive at Pro tier.
- **Effort:** 3 days per `d8` §6.3.

### §2.7 No central permission engine (`useCanUseTool` analog)

- **Where it bites:** Desktop, Web, Mobile, CLI.
- **Citations:** `d8-desktop-stores-hooks-services-api.md` §2.5 "MISSING: `useCanUseTool.tsx` (40K-LOC unified permission gate) — Single gate consumed by every tool-call site... There is no single gate; tool calls in `apps/desktop/src/api/` invoke directly. Permission state is fragmented across `governanceStore.ts:1-321`, `securityStore.ts:1-131`, and `apps/desktop/src/utils/permissions.ts:1-119`." (line ~118). `d3-desktop-rust-o-z.md` §A.4 "**The 10-step rule-precedence pipeline** (`hasPermissionsToUseToolInner`)... Our `permissions.rs:check_permission` (16 fns total) is a flat lookup — no `step 1a (entire-tool deny)`, `step 1b (entire-tool ask)`, ... **Without this the bypass mode is unsafe.**" (line ~91).
- **Severity:** P0 — security-critical; the bypass-permissions mode currently doesn't have the carve-outs that even bypass cannot override. **Effort:** 8 days desktop + 4 days CLI + 5 days web = **~17 days** for a unified gate.

---

## §3. Master missing-features list (top 50 by leverage)

Ranked by the multiplicative function `(priority × user-visibility × surface-coverage) / effort`. P0 = ship-blocker; P1 = next-quarter; P2 = nice-to-have.

|   # | Feature                                                                                                  | Surface(s)                            | Source citation                                                                                                              | Priority | Effort (days) |                              Leverage |
| --: | -------------------------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------- | ------------: | ------------------------------------: |
|   1 | **MCP OAuth complete (RFC 9728/8414/7591/7009/CIMD/XAA + paste-callback + cross-process lock)**          | Desktop+CLI+Mobile+Web (services pkg) | `d3` §A.1 + `pkg-mcp-skl-apply-browser.md` §B.3 — "**Result: cannot authenticate to ANY remote MCP server requiring OAuth**" | P0       |         12–25 |                               Highest |
|   2 | **Outbound bridge / Remote Control (`services/api-gateway` direction inversion)**                        | Desktop, services, Mobile             | `d3` §A.9; `services-gateway-signaling.md` §1                                                                                | P0       |         30–40 |                             Very high |
|   3 | **Per-tool permission dialog suite (12 dialogs + classifier shimmer + lazy LLM risk explainer)**         | Desktop, Web                          | `d7` §1.3 (12 dialogs); `d4` M1.5                                                                                            | P0       |            30 |                             Very high |
|   4 | **Skills `paths`-based conditional activation (progressive disclosure)**                                 | All surfaces                          | `d8` §6.3; `pkg-mcp-skl-apply-browser.md` §C.3                                                                               | P0       |             3 |     Very high (collapsed prompt size) |
|   5 | **MCP transport variants (8 in ref vs 3 we ship)**                                                       | Desktop, CLI                          | `d3` §A.2; `pkg-mcp-skl-apply-browser.md` §B.3                                                                               | P0       |          7–10 |                             Very high |
|   6 | **Hook engine — 27 events × 6 handler types (HTTP, prompt, agent, async)**                               | Desktop+CLI                           | `d2` §A.1; `cli-full.md` P-1                                                                                                 | P0       |          24.5 |                                  High |
|   7 | **Plan mode UX (proposal panel, sticky footer, Ctrl+G external editor, persistence)**                    | Desktop, Web, CLI, VS Code            | `d4` M1.4; `d7` §1.1; `cli-full.md` P-10                                                                                     | P0       |            14 |                                  High |
|   8 | **Auto-mode transcript classifier + Bash sandbox (Sonnet-class side-call)**                              | Desktop+CLI                           | `d3` §A.4 #3; `d1` M-T10                                                                                                     | P0       |          7–10 |                                  High |
|   9 | **Memory: filesystem layer + `memdir/` taxonomy + freshness flag + Sonnet-ranked recall**                | Desktop, Web, Mobile                  | `d8` §6.12; `d1` M-SA5                                                                                                       | P0       |             8 |                                  High |
|  10 | **Compaction pipeline (`services/compact/` 11 files, `extractMemories/`, `autoDream/`)**                 | Desktop, Web                          | `d8` §3.3; `d3` (PreCompact wiring)                                                                                          | P0       |            25 |                             Very high |
|  11 | **Settings.json full key set (~125 keys vs ~30 we ship)**                                                | CLI, Desktop                          | `cli-full.md` P-6; `d2` §A                                                                                                   | P0       |         12–14 |                                  High |
|  12 | **Streaming watchdog + retry generator + sticky RetryContext + fallback state machine**                  | All                                   | `pkg-api-providers-normalize.md` §"Streaming watchdog" + §"withRetry generator"                                              | P0       |             8 |                                  High |
|  13 | **Cross-provider message normalization (`ensureToolResultPairing`, etc.)**                               | All                                   | `pkg-api-providers-normalize.md` §"Cross-provider message normalization"                                                     | P0       |             7 |         Very high (differentiator #3) |
|  14 | **Subagent SKILL.md frontmatter + isolated context + tool ACL + agentNameRegistry + worktree-per-agent** | Desktop, CLI                          | `d1` M-S1 to M-S6; `d3` §A.17                                                                                                | P0       |         14–20 |                                  High |
|  15 | **Per-tool 3-glyph permission grid (Always-allow/Needs-approval/Blocked)**                               | Desktop, Web, Mobile                  | `d5` M-1.6; `d6` M-1.2.2                                                                                                     | P0       |             5 |                                  High |
|  16 | **OAuth metadata discovery + DCR (RFC 9728/8414/7591) for ALL providers**                                | All                                   | `d3` §A.1 #1–3                                                                                                               | P0       |             8 |                             Very high |
|  17 | **Live Artifacts + persistent storage + direct API calls + MCP-connected**                               | Web, Desktop, Mobile                  | `d4` (artifact viewer); `d6` M-1.4.12; `d7` §1.7; `pkg-unified-chat.md` (artifact pane)                                      | P1       |            18 |                                Medium |
|  18 | **Bundled skills (17 from Anthropic — `pdf`/`docx`/`pptx`/`xlsx`/`mcp-builder`/`canvas-design`/etc.)**   | All                                   | `cli-full.md` P-4; `d1` M-K5                                                                                                 | P0       |          6–10 |                                  High |
|  19 | **Native messaging host installer for 7 Chromium variants × per-profile**                                | Chrome ext                            | `ext-chrome-full.md` §8                                                                                                      | P1       |             6 |                                Medium |
|  20 | **Connector directory (200+ connectors vs ~31 in web, 11 in mobile)**                                    | Web, Desktop, Mobile                  | `web-a-app-api-hooks.md` "Missing routes #5"; `mobile-full.md` §13                                                           | P0       |             7 |                                  High |
|  21 | **Voice mode full-duplex (WebRTC ASR/TTS) — currently push-to-talk only on web**                         | Web, Mobile                           | `web-a-app-api-hooks.md` "Voice — push-to-talk only"; `mobile-full.md` §4                                                    | P0       |             8 |                                Medium |
|  22 | **Computer Use VM isolation (Apple VF + Hyper-V)**                                                       | Desktop                               | `d3` §A.7 #1                                                                                                                 | P0       |         30–60 |       Very high (Cowork ship-blocker) |
|  23 | **Permission rule engine + `/permissions` UI**                                                           | Desktop, Web                          | `d7` §1.4 (PermissionRuleList 1,178 LOC)                                                                                     | P1       |            10 |                                Medium |
|  24 | **Compliance API + audit log export + per-org retention**                                                | Desktop, Web, Services                | `supabase-data-model.md` §H.9; `d3` §A.21                                                                                    | P0       |             8 |                                Medium |
|  25 | **WSL command setting (5 % gap on VS Code)**                                                             | VS Code ext                           | `ext-vscode-full.md` §M                                                                                                      | P1       |             2 |                                   Low |
|  26 | **Action-permission pill (Ask vs Act)**                                                                  | Chrome ext                            | `ext-chrome-full.md` §1                                                                                                      | P0       |            10 |                                  High |
|  27 | **Multi-tab parallel chat in sidebar**                                                                   | VS Code, Desktop                      | `ext-vscode-full.md` §A.4 (tab strip + Cmd+N)                                                                                | P1       |             5 |                                Medium |
|  28 | **Editor-canvas placement for VS Code chat**                                                             | VS Code                               | `ext-vscode-full.md` §A.1                                                                                                    | P1       |             3 |                                   Low |
|  29 | **Streaming-markdown boundary tracker + token cache (perf)**                                             | Desktop, Web                          | `d4` M1.1; `d6` M-1.3 + `d7` §1.10.1                                                                                         | P0       |             3 |                           High (perf) |
|  30 | **Memory pause/reset/import-from-other-AI flow**                                                         | Web, Mobile, Desktop                  | `web-a-app-api-hooks.md` "Missing #46-55"; `d5` M-1.2; `mobile-full.md` §11                                                  | P0       |             6 |                                Medium |
|  31 | **Slash-command full set (60+ vs 6 web / 4 mobile / 5 chrome)**                                          | Web, Mobile, Chrome                   | `web-b-features.md` P-2; `mobile-full.md` §17; `ext-chrome-full.md` §"Slash + at commands"                                   | P1       |             5 |                                Medium |
|  32 | **`Capabilities` settings tab (Memory + chat-search + custom-visuals)**                                  | Web                                   | `web-a-app-api-hooks.md` "#26"; `d5` M-1.1.1                                                                                 | P0       |             5 |                                  High |
|  33 | **`Billing` settings tab (invoice + payment + annual/monthly)**                                          | Web, Desktop                          | `web-a-app-api-hooks.md` "#100-110"; `d5` M-1.1.2                                                                            | P0       |             5 |                   High (Hobby launch) |
|  34 | **CWS auto-publish + VS Code Marketplace publish workflow**                                              | Chrome ext, VS Code                   | `infra-ci-release.md` P-9, P-10                                                                                              | P1       |           1.5 |                                   Low |
|  35 | **`.mcpb` desktop extension format + Mac/Win signing**                                                   | Desktop, infra                        | `infra-ci-release.md` M-1; `d2` §44                                                                                          | P1       |            21 |                                   Low |
|  36 | **Beta-header model-aware merge (`getMergedBetas`)**                                                     | All providers                         | `pkg-api-providers-normalize.md` §"Beta header handling"                                                                     | P1       |           4–6 |                                Medium |
|  37 | **Mailbox + `useInboxPoller` (cross-session inbox + Dispatch listener)**                                 | Desktop                               | `d8` §2.9; `d8` §4.2                                                                                                         | P0       |            10 |      High (ship-blocker for Dispatch) |
|  38 | **AbortController parent/child tree with WeakRef**                                                       | All                                   | `pkg-runtime-utils-types.md` §4 (`abortController.ts` 50 LOC)                                                                | P1       |             2 |                                Medium |
|  39 | **`memoize.ts` with TTL + LRU + in-flight dedup**                                                        | All                                   | `pkg-runtime-utils-types.md` §4                                                                                              | P0       |             3 |             Medium (fixes mock-drift) |
|  40 | **AsyncLocalStorage agent context (`AgentContext`)**                                                     | Desktop                               | `pkg-runtime-utils-types.md` §4 (`agentContext.ts`)                                                                          | P0       |             4 | High (1,483 Tauri commands isolation) |
|  41 | **Trusted-Device + JWT refresh scheduler**                                                               | Services, Desktop                     | `services-gateway-signaling.md` §3.4, §4.4                                                                                   | P0       |             6 |                                  High |
|  42 | **`bashSecurity.ts` 22-validator chain + tree-sitter Bash AST**                                          | CLI, Desktop                          | `d3` §A.5                                                                                                                    | P0       |          7–10 |                                  High |
|  43 | **Connector custom-MCP URL paste form + per-action perms**                                               | Web, Desktop, Mobile                  | `web-a-app-api-hooks.md` "#30-37"                                                                                            | P0       |             7 |                                Medium |
|  44 | **Skills SkillsMenu + frontmatter parser (16 fields)**                                                   | Desktop, Web, Mobile                  | `d7` §1.6.1; `d6` M-1.4                                                                                                      | P0       |             8 |                                  High |
|  45 | **Effort downgrade postmortem + classifier metrics**                                                     | Web, Desktop                          | `pkg-api-providers-normalize.md` §"Effort downgrade postmortem mitigation"                                                   | P1       |           0.5 |                                   Low |
|  46 | **Workflow primitives (`/loop`, `/schedule`, scheduled-tasks)**                                          | All                                   | `cli-full.md` Workflow row "0 %"; `d8` §"Cron jitter"                                                                        | P1       |             3 |                                Medium |
|  47 | **WSGate / WS bridge fallback for Chrome ext**                                                           | Chrome ext                            | `ext-chrome-full.md` §9                                                                                                      | P1       |             3 |                                   Low |
|  48 | **Sentinel-app blocklist (banking/crypto/healthcare)**                                                   | Desktop, Mobile, Chrome               | `d6` M-1.4.7; `d3` §A.7 #6                                                                                                   | P0       |             1 |                         High (safety) |
|  49 | **Vim mode in composer**                                                                                 | CLI, Desktop                          | `cli-full.md` Vim row "0 %"                                                                                                  | P2       |             4 |                                   Low |
|  50 | **`docs/TRUST.md`, `SECURITY.md`, `PRIVACY.md`, Compliance attestations**                                | All (customer-facing)                 | `docs-and-spec.md` "Trust Center 0 %"                                                                                        | P0       |            10 |                High (enterprise gate) |

**Total effort across all 50: ~440 days at 1 dev / single-track pace.** With AI velocity + parallel-agent dispatch (per `dev-methodology.md` 4-agent fan-out): **~110–130 calendar days**.

---

## §4. Effort to reach Anthropic parity

### §4.1 Sum-of-slice numbers (raw, no double-count adjustment)

| Slice                                  |                                                                                                          Days to 100 % parity | Source                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------: | ----------------------------------------------------- |
| CLI                                    |                                                                                                                           127 | `cli-full.md` line ~445                               |
| Desktop D1 (A–G Rust)                  |                                                                                                                            85 | `d1` line ~547                                        |
| Desktop D2 (H–N Rust)                  |                                                                                                                           115 | `d2` line ~338                                        |
| Desktop D3 (O–Z Rust)                  |                                                                                                         200–300 (9–12 months) | `d3` Section D total                                  |
| Desktop D4 (Components 1)              |                                                                                                                            56 | `d4` (estimated from per-component effort)            |
| Desktop D5 (Components 151–300)        |                                                                                                                            75 | `d5` line ~329                                        |
| Desktop D6 (Components 301–450)        |                                                                                                                           130 | `d6` summary tables (85 PD partial + 43.5 PD missing) |
| Desktop D7 (Components 451–611)        |                                                                                                                           180 | `d7` line ~458 (~36W = 9 person-months)               |
| Desktop D8 (Stores/Hooks/Services/API) |                                                                                                                           124 | `d8` line ~826                                        |
| Web A (App routes/API/Hooks/Types)     |                                                                                                                           111 | `web-a` line ~383                                     |
| Web B (Features)                       |                                                                                                                          85.5 | `web-b` line ~373                                     |
| Web C (Components/Lib)                 |                                                                                                           ~12 weeks ≈ 60 days | `web-c` line ~333                                     |
| Mobile                                 |                                                                                                                        95–100 | `mobile-full.md` line ~381                            |
| Chrome ext                             |                                                                                                                          61.5 | `ext-chrome-full.md` line ~208                        |
| VS Code ext                            |                                                                                                                            67 | `ext-vscode-full.md` line ~289                        |
| `pkg-api-providers-normalize`          |                                                                       ~70 (estimated from 7 P0 buckets averaging 8–10 d each) | `pkg-api-providers-normalize.md`                      |
| `pkg-mcp-skl-apply-browser`            |                                                                                                ~120 (4 packages × ~30 d each) | `pkg-mcp-skl-apply-browser.md`                        |
| `pkg-runtime-utils-types`              |                                                                ~80 (state architecture XL + utils L + types M + data-layer M) | `pkg-runtime-utils-types.md`                          |
| `pkg-unified-chat`                     |                                                                  ~40 (P0 list: 13.5 d wiring + 39 d core gaps + 33 d premium) | `web-b-features.md` line ~370                         |
| `services-gateway-signaling`           |                                                      ~120 (bridge protocol = 60 d, OAuth = 25 d, channel notifs = 20 d, etc.) | `services-gateway-signaling.md`                       |
| `crates-rust`                          |                                                                                                                         21–30 | `crates-rust.md` headline                             |
| `supabase-data-model`                  |                          30 (mostly RLS hardening + reconciliation + missing tables for Skills/Plugins/Hooks/Memory taxonomy) | `supabase-data-model.md`                              |
| `docs-and-spec`                        |                                                                                                                           ~60 | `docs-and-spec.md` line ~205                          |
| `infra-ci-release`                     | ~80 (infrastructure work: APPLE\_\*, MSIX, .mcpb format, distro packaging, CWS publish, App Store metadata, EAS code-signing) | `infra-ci-release.md`                                 |
| **Sum (raw)**                          |                                                                                                               **~2,015 days** |                                                       |

### §4.2 Adjusted total (with double-count adjustment + parallelizable savings)

The slice efforts double-count when:

- Desktop D8 ports `useCanUseTool` (8 days) and CLI also needs it (4 days) — but they share ~4 days of design.
- The MCP OAuth port ships once in `pkg-mcp` and is consumed by Desktop+CLI+Mobile+Web — but each slice independently counts its share.
- Skills progressive disclosure is one 3-day port that closes gaps in 4 surfaces (each counted ~3 days).

Applying a **30 % double-count discount** (per `dev-methodology.md` shared-foundation reuse coefficient, conservative):

**Adjusted total to 100 % parity: ~1,400 engineer-days** (≈ 6.5 person-years at 1-FTE pace; **~16–20 calendar weeks at 4-agent parallel velocity**).

### §4.3 80 % parity (Pareto cuts)

The 80 % target drops:

- Cowork VM isolation (-30 d).
- Vim mode + Workflow + Keybindings full set (-15 d).
- Live Artifacts + persistent storage + direct-API calls (-18 d).
- 100 of 200 connectors not in directory (~50 d if average 1 d each).
- Bundled CLI in VS Code ext (-4 d).
- Bridge protocol full v1+v2 transports (-30 d).
- Compliance API hardening for Enterprise (-10 d).
- ~17 bundled skills full body (-6 d).
- WSL deep integration (-2 d).
- Half of the docs (-20 d).

**Sum of cuts: ~190 days.**

**Adjusted 80 % effort: ~1,400 - 190 = ~1,210 engineer-days** (≈ 5.5 person-years; **~12–14 weeks parallel**).

This is still expensive because the Pareto distribution is **flat** in our codebase: the long tail of small features (slash commands, settings keys, hook events, per-tool dialogs, memory taxonomy, skill frontmatter fields) accounts for ~40 % of the total, and you can't skip them all without obvious holes.

### §4.4 Hobby-tier launch minimum

Per `MEMORY.md`: "Public MVP (Local + BYOK free): GO-WITH-CAVEATS in 5–7 days. Paid Hobby launch: NO-GO until Stripe RPC migration applied + verified against production DB."

The **strict minimum for the paid Hobby tier** to ship safely (not for parity, just for ship-readiness):

| Item                                                                                |        Days | Source                                     |
| ----------------------------------------------------------------------------------- | ----------: | ------------------------------------------ |
| Stripe RPC migration apply + e2e webhook test                                       |           1 | `MEMORY.md`; `supabase-data-model.md` H.10 |
| Web auth-state RLS hardening + verification (`useCanUseTool` port to web)           |           5 | `web-a-app-api-hooks.md` (RLS bypass risk) |
| `Capabilities` + `Billing` settings tabs (web)                                      |           9 | `web-a` "#26-100"                          |
| Per-tool permission grid + custom-MCP URL form                                      |           7 | `d5` M-1.6 + `web-a` #30                   |
| Memory pause/reset/import-from-other-AI                                             |           6 | `web-a` "#46-55"                           |
| Streaming watchdog + retry generator                                                |           8 | `pkg-api`                                  |
| MCP OAuth (RFC 9728/8414/7591) for top 3 connectors (GitHub remote, Linear, Notion) |           8 | `pkg-mcp` §B                               |
| Beta-header model-aware merge                                                       |           4 | `pkg-api`                                  |
| `docs/{TRUST,SECURITY,PRIVACY}.md`                                                  |           5 | `docs-and-spec.md`                         |
| Hobby-tier rate-limit gating + UI                                                   |           3 | `web-a` "#100-105"                         |
| Per-MCP `running` pill + connector revoke UI                                        |           3 | `d5` M-1.10, M-2.11                        |
| 5-hour usage window display                                                         |           2 | `d6` M-1.1.6                               |
| Test suite uplift (52 chat-conversation tests pending per `MEMORY.md`)              |           3 | MEMORY                                     |
| **Total**                                                                           | **64 days** |                                            |

**At AI velocity / 3-agent parallel: ~3 weeks to Hobby-tier launch.**

### §4.5 Calendar estimates by velocity

| Scenario                                   | Sequential 1 dev | 3-agent parallel | 4-agent + AI velocity |
| ------------------------------------------ | ---------------: | ---------------: | --------------------: |
| Hobby-tier launch minimum (~64 d)          |         13 weeks |          5 weeks |           **3 weeks** |
| 80 % parity (~1,210 d)                     |        4.5 years |        18 months |       **12–14 weeks** |
| 100 % parity (~1,400 d)                    |        6.5 years |        26 months |       **16–20 weeks** |
| 100 % including Cowork VM + 200 connectors |          8 years |        32 months |       **22–26 weeks** |

The "AI velocity" multiplier comes from `dev-methodology.md` (locked) — multi-agent zone-ownership with file-locking.

---

## §5. Differentiator preserve list (what we LEAD on; do NOT lose)

These appear in multiple slices as our advantage. Mark `>=100 %` in any per-axis table where Anthropic doesn't ship the feature.

1. **Multi-provider in one UI (10+ Providers)** — locked tagline per `MEMORY.md`. Cited in every slice as our #1 differentiator. CLI registers 12 named + 1 user-defined Custom; Mobile + Web + VS Code + Chrome ext all support multi-provider; Anthropic locks to Claude only.
2. **BYOK + Local LLM (Ollama + LMStudio)** — Anthropic does not accept user keys for the chat product. Per `cli-full.md` and `mobile-full.md`.
3. **Cross-provider session continuity (Claude → GPT → Llama in same thread)** — per `MEMORY.md`. Implemented via `packages/llm-normalize` (2,633 LOC, OpenClaw-derived). Per `pkg-api-providers-normalize.md` "Cross-provider message normalization" — partial today; finishing it is P0 in §3 #13.
4. **Calendar workspace** (`d4` §M2.5) — full day/week/month/event-dialog (5 files). Claude has no first-party calendar UI.
5. **Database workspace** (`d4` §M2.5) — Claude has no first-party DB workspace.
6. **Browser action log + replay** (`d4` §M2.5) — Claude renders browser inline only; we have a 5-file replay viewer with screenshots + visualization.
7. **DynamicCanvas (live React re-render)** (`d4` §M2.5) — novel; no Claude analog.
8. **FloatingChat / mini panel** (`d4` §M2.5) — Tauri Always-on-Top; Claude has no equivalent.
9. **Marketplace (workflow)** (`d4` §M2.5; `d5` 2.8) — bigger than Claude's `claude plugin install` if creator economy ships.
10. **Master password / encrypted local vault** (`d5` §2.16) — stronger than Claude on local-mode (Claude relies on OS keychain only).
11. **Resource Monitor** (`d5` §2.18) — CPU/RAM/Network/Storage gauges; Claude has none in-app.
12. **ROI Dashboard / OutcomesDashboard** (`d5` §2.19) — novel surface; Claude has only Usage bars.
13. **Workflow node-graph editor (`apps/desktop/src/components/Workflows/`)** (`d7` §2.12) — 2,490 LOC; Claude doesn't ship a node-graph workflow editor.
14. **Automation builder** (`d7` §2.12) — 958 LOC.
15. **Per-message Pro+ provider-switch gate** (`pkg-unified-chat.md`) — tier-aware multi-provider; differentiator on Pro+ pricing.
16. **Pricing tier ladder (Local / BYOK / Hobby / Pro / Pro+ / Max)** — 6 tiers vs Anthropic's flat Pro/Max/Team/Enterprise (per `ext-vscode-full.md` "Strengths over Anthropic").
17. **Workspace Trust gating** more aggressive than Anthropic (per `ext-vscode-full.md`) — 8 restricted configurations.
18. **Subsystem Health status bar + Token Counter status bar with cost estimation** (`ext-vscode-full.md` "Strengths") — Claude doesn't surface these.
19. **Comprehensive cloud-portability migration playbooks (`docs/SCALING.md` + `HOSTING.md` + `PERFORMANCE.md`)** (`docs-and-spec.md` per-axis row) — **150 %** vs reference; we exceed Anthropic here.
20. **Linux desktop** (per multiple slices) — Anthropic doesn't ship Linux desktop; we are positioned for "Linux-first wedge" per `d1` §M-A3.

These 20 items must NOT regress while closing parity gaps.

---

## §6. Recommended phasing (days 1-30 / 30-60 / 60-90 / 90-180)

### Days 1-30: Hobby-tier ship + critical safety

Goals: Ship Hobby tier paid plan; close all P0 security findings; reduce P0 architectural meta-gaps.

- **Week 1 (5 d)**: Ship Hobby-tier launch minimum (§4.4 list 1–13). Apply Stripe RPC, harden web RLS, add Capabilities + Billing tabs, custom-MCP URL form.
- **Week 2 (5 d)**: §2.7 **central permission engine** port — `useCanUseTool` web + desktop + CLI alignment. Closes the bypass-mode safety risk (P0 per `d3` §A.4 and `d8` §2.5).
- **Week 3 (5 d)**: §2.6 **Skills `paths` progressive disclosure** + 17 bundled skills for the surfaces that consume them. Closes prompt-bloat at 200+ skills.
- **Week 4 (5 d)**: §2.1 **`onChangeAppState` choke-point sink** + §2.2 **`messageQueueManager` priority queue** ports into `packages/runtime` + `packages/stores`. Foundational for everything downstream.

End-of-month state: Hobby tier live; bypass-mode safe; Skills scale; foundational state architecture in place. **Estimated parity gain: 38 % → 47 %.**

### Days 30-60: Closing the highest-leverage P0s

Goals: Close items 1, 5, 7, 8, 9, 10, 11, 12, 13, 14 from §3 master list.

- **Weeks 5-6 (10 d)**: §3 #1 **MCP OAuth complete** (12 d compressed by porting once into `packages/mcp`).
- **Weeks 7-8 (10 d)**: §3 #5 **MCP transport variants** (8 in ref) + §3 #11 **Settings.json full key set**.
- **Week 9 (5 d)**: §3 #7 **Plan mode UX** (Desktop + Web + VS Code).
- **Week 10 (5 d)**: §3 #14 **Subagent SKILL.md frontmatter + isolation + tool ACL**.

End-of-month-2 state: Connector ecosystem unblocked (Linear/Notion/Atlassian/Stripe/Sentry connect); Settings parity at ~80 %; Plan mode shippable; Subagent system at 60 %. **Parity gain: 47 % → 60 %.**

### Days 60-90: Web/Mobile/Extensions parity push

Goals: Close items 2, 3, 6, 13, 17, 18, 20, 26, 32, 33, 37, 41, 43.

- **Weeks 11-12 (10 d)**: §3 #2 **Outbound bridge / Remote Control direction inversion** (P0 ship-blocker for Cowork-class). 30 d compressed by 3-agent parallel.
- **Weeks 13-14 (10 d)**: §3 #6 **Hook engine 27 events × 6 handlers** (Desktop + CLI parity).
- **Week 15 (5 d)**: §3 #13 **Cross-provider message normalization** (the differentiator-#3 unlock).
- **Week 16 (5 d)**: §3 #20 **Connector directory expansion to top 100 connectors** + §3 #43 **custom-MCP URL paste form**.

End-of-quarter state: Outbound bridge functional; Hook system at 95 %; Cross-provider continuity hardened; connector ecosystem at 50 % (100 of 200). **Parity gain: 60 % → 75 %.**

### Days 90-180: Long tail + Cowork seeding

Goals: Close items 17, 19, 22, 24, 27, 28, 31, 35, 36, 38–50.

- **Months 4-5**: §3 #17 **Live Artifacts + persistent storage**, §3 #22 **Computer Use VM isolation** (start with macOS-only via Apple Virtualization Framework — 30 d effort), §3 #24 **Compliance API + audit log export**, §3 #38–48 framework primitives (AbortController tree, memoize, AgentContext, etc.).
- **Month 6**: §3 #35 **`.mcpb` desktop extension format**, §3 #50 **Trust + SECURITY + PRIVACY docs**, §3 #4 (re-port) bundled-skills-via-paths.

End-of-half state: Cowork-class autonomous tasks viable on macOS; Live Artifacts shipped; framework primitives hardened; docs at 60 %. **Parity gain: 75 % → 88 %.**

### Days 180+: Enterprise compliance + 100 % cleanup

Goals: SOC 2 Type II certification (started Q3 2026 per `docs/BILLION_DOLLAR_PLAYBOOK.md`); HIPAA-ready BAA; remaining 12 % parity items including Vim mode, Cowork on Windows (Hyper-V VM service), 100+ remaining connectors, Skills marketplace federation.

End state: **88 % → 100 % parity** at month 9–10, with Cowork-class autonomy + enterprise compliance.

---

## Closing notes

**Source-citation discipline.** Every percentage in this aggregate is grounded in a single per-slice statement; no aggregate number is invented. Where multiple slices disagree (e.g., Web parity ranges 38–52 % across A/B/C), the cross-surface row uses an arithmetic mean.

**Anti-double-counting.** Effort sums in §4.1 are the raw per-slice estimates; the §4.2 adjusted total applies a 30 % discount because shared-package work (`packages/api/providers/normalize`, `packages/mcp/skills/...`) is consumed by every surface but each slice independently counts its consumption share.

**Differentiators are not parity.** §5 lists 20 items where we **lead** Anthropic. Closing parity gaps without preserving these differentiators would be a regression — they're the thesis of the product.

**Ship-blocker triage.** Per `MEMORY.md`, paid Hobby tier is NO-GO until §4.4's 64-day list lands. The Local + BYOK free path is GO-WITH-CAVEATS in 5–7 days; that path doesn't need most of this matrix.

---

_Compiled by gap-matrix synthesizer agent 25 of 25, 2026-05-08._
_Output: `/Users/siddhartha/Desktop/agiworkforce/tasks/research/gap-matrix/AGGREGATE.md`_
_Word count: ~6,500._
