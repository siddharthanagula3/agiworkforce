# Competitive Research: Coding-CLI Agent Feature Bar (May 2026)

Scope: Claude Code CLI, OpenAI Codex CLI, Cursor (CLI/agent), Gemini CLI.
Author: Research analyst (AGI Workforce). Date: 2026-05-29.
Framing: AGI Workforce six-surface suite, v1 = Local + BYOK only, multi-provider routing, local-first privacy. CLI surface is Rust.

> Method note: Facts are taken from official changelogs/docs first. WebFetch summaries pass pages through a summarizing model, so I treat exact **model-ID strings** and **per-point-release sub-feature attributions** as soft and attribute them loosely; **version numbers + dates + headline capabilities** are treated as solid. Confidence is marked per tool, not globally.

---

## 1. Summary

As of 2026-05-29, the agentic coding CLI is a mature, fast-moving category with a converged feature set. Four capabilities are now table-stakes across essentially all four tools: (1) **custom + built-in slash commands**, (2) **MCP server integration** (stdio + remote/HTTP, increasingly with OAuth), (3) **tiered approval/permission + sandbox modes**, and (4) **session persistence / resume**. A second tier is shipping broadly but unevenly: **hooks/lifecycle events**, **skills (reusable instruction bundles)**, **subagents/parallel agents**, **plan mode**, and **git-worktree isolation**.

Claude Code is the clear pace-setter: it ships roughly daily, and in May 2026 alone added dynamic multi-agent workflows (tens-to-hundreds of background subagents), a unified background "agents view," Claude-managed worktrees, plugin marketplaces with dependency graphs, and MCP-tool-invoking hooks. ([Claude Code Changelog](https://code.claude.com/docs/en/changelog)) Codex CLI matured its permission-profile system, MCP OAuth, hooks, and goals across v0.133–v0.135 (May 2026). ([Codex CLI Releases](https://github.com/openai/codex/releases)) Gemini CLI shipped voice mode, native OS sandboxing, subagents, and skills — but Google announced it will **stop serving free/Pro/Ultra individual users on 2026-06-18**, migrating them to **Antigravity CLI**. ([Gemini CLI Changelog](https://geminicli.com/docs/changelogs/)) Cursor's CLI gained plan/ask modes, cloud handoff, rules/MCP/model slash commands, and lifecycle hooks — but its dated CLI-specific changelog entries are from **January 2026** (the May 2026 changelog entries are IDE/Composer, not CLI), so Cursor CLI's current-state coverage here is lower confidence. ([Cursor CLI Jan 16, 2026](https://cursor.com/changelog/cli-jan-16-2026))

For AGI Workforce, the bar to clear on day one is the converged table-stakes four (slash commands, MCP, tiered permissions+sandbox, resume), with hooks, plan mode, and worktrees close behind. The differentiator that maps cleanly onto AGI's thesis is **local-first + BYOK multi-provider routing** — none of the four leaders treat local/BYOK as the default trust boundary, and Gemini's free-tier shutdown actively pushes users toward a paid cloud.

---

## 2. Current bar — what a new agentic CLI must hit (as of 2026-05-29)

Derived from the cross-tool matrix in §3. A capability is "table-stakes" when 3-of-4 tools ship it.

**Tier 1 — table-stakes (must ship for credibility):**

- **Built-in + custom slash commands.** All four. Codex documents 40+ built-ins plus custom/team prompts; Claude Code, Gemini, and Cursor all support user-defined commands. ([Codex Slash Commands](https://developers.openai.com/codex/cli/slash-commands))
- **MCP integration — stdio + remote/HTTP, with OAuth.** All four. The 2026 refinements are OAuth for streamable-HTTP servers, per-server env targeting, and concurrent read-only tools (Codex v0.134, May 26 2026); MCP-resource discovery and 4-tier memory (Gemini v0.40, Apr 28 2026); pending-approval state and reserved server names (Claude Code). ([Codex CLI Releases](https://github.com/openai/codex/releases), [Gemini CLI Changelog](https://geminicli.com/docs/changelogs/), [Claude Code Changelog](https://code.claude.com/docs/en/changelog))
- **Tiered approval / permission modes + OS sandbox.** All four converge on ~3 levels: read-only → auto (workspace-scoped, approvals outside) → full access (incl. network). Codex made `--profile` the primary selector with named profiles + inheritance (v0.133–v0.135). Gemini added native macOS Seatbelt + Windows sandboxing. Claude Code has an auto-mode classifier with `hard_deny` rules and sandbox allowlists. ([Codex CLI Features](https://developers.openai.com/codex/cli/features), [Gemini CLI Changelog](https://geminicli.com/docs/changelogs/), [Claude Code Changelog](https://code.claude.com/docs/en/changelog))
- **Session persistence + resume.** All four. Local transcripts, `resume`/`/resume`, fork/branch a conversation. Codex resumes local threads; Claude Code resumes foreground + background sessions and can find a session by the PR URL it created. ([Codex CLI Features](https://developers.openai.com/codex/cli/features), [Claude Code Changelog](https://code.claude.com/docs/en/changelog))
- **Non-interactive / headless mode for CI.** Codex `exec`, Claude Code `--print` / `claude ultrareview` / `--bg --exec`, Cursor headless (stable on macOS/Linux/Windows). ([Codex CLI](https://developers.openai.com/codex/cli), [Claude Code Changelog](https://code.claude.com/docs/en/changelog), [Cursor CLI Jan 8, 2026](https://cursor.com/changelog/cli-jan-08-2026))

**Tier 2 — strongly expected (shipping broadly, AGI should plan for these):**

- **Plan mode.** Codex `/plan`, Cursor `/plan` / `--mode=plan` (+ `/ask` read-only), Gemini plan inspection. Claude Code's analogue is `/goal` + dynamic `/workflow`. ([Codex Slash Commands](https://developers.openai.com/codex/cli/slash-commands), [Cursor CLI Jan 16, 2026](https://cursor.com/changelog/cli-jan-16-2026), [Gemini CLI Changelog](https://geminicli.com/docs/changelogs/))
- **Hooks / lifecycle events.** Claude Code has the deepest set (SessionStart, PostToolUse, Stop/SubagentStop, MessageDisplay, EnterWorktree, hooks that invoke MCP tools directly). Cursor: session start/end, prompt, stop (made 10–20× faster, Jan 2026). Codex: subagent start/stop, tool execution, turn metadata, async approval observers (v0.133). Gemini has lifecycle confirmations. ([Claude Code Changelog](https://code.claude.com/docs/en/changelog), [Cursor CLI Jan 16, 2026](https://cursor.com/changelog/cli-jan-16-2026), [Codex CLI Releases](https://github.com/openai/codex/releases))
- **Skills (reusable instruction bundles).** Codex (`$skill-name`, Dec 2025), Gemini (`/skills install/uninstall/reload`, `agent-tui`/`tui-tester`), Claude Code (SKILL.md, `/reload-skills`, `skillOverrides`, plugin-bundled). Cursor references skills/`/loop`. ([Codex Changelog](https://developers.openai.com/codex/changelog), [Gemini CLI Changelog](https://geminicli.com/docs/changelogs/), [Claude Code Changelog](https://code.claude.com/docs/en/changelog))
- **Subagents / parallel agents.** All four. Claude Code dynamic workflows orchestrate tens-to-hundreds of background subagents in one session (v2.1.154, May 28 2026); Codex spawns subagents on explicit request; Gemini has subagents with JIT context injection + A2A discovery; Cursor has a classifier subagent for auto-review. ([Claude Code Changelog](https://code.claude.com/docs/en/changelog), [Codex CLI Features](https://developers.openai.com/codex/cli/features), [Gemini CLI Changelog](https://geminicli.com/docs/changelogs/), [Cursor 3.6](https://cursor.com/changelog))
- **Git-worktree isolation.** Claude Code is the leader: Claude-managed worktrees, `worktree.baseRef` (`fresh`|`head`), `worktree.bgIsolation`, `EnterWorktree` hook/tool, retention sweeps. Others rely on the user's own worktrees or cloud agents for isolation. ([Claude Code Changelog](https://code.claude.com/docs/en/changelog))

**Tier 3 — differentiators (not yet table-stakes; ship to lead):**

- **Plugin marketplace + dependency graph** (Claude Code: `/plugin` Discover/Browse, `defaultEnabled`, dependency enforcement, projected context cost). ([Claude Code Changelog](https://code.claude.com/docs/en/changelog))
- **Background / async agents view + cloud handoff** (Claude Code `claude agents`, pinned background sessions; Cursor `&`-prefix cloud handoff to web/mobile). ([Claude Code agent-view](https://code.claude.com/docs/en/agent-view), [Cursor CLI Jan 16, 2026](https://cursor.com/changelog/cli-jan-16-2026))
- **Goals / autonomous completion conditions** (Claude Code `/goal`, Codex `/goal` enabled by default v0.133). ([Claude Code Changelog](https://code.claude.com/docs/en/changelog), [Codex CLI Releases](https://github.com/openai/codex/releases))
- **Voice mode** (Gemini CLI v0.41, May 5 2026 — cloud + local backends). ([Gemini CLI Changelog](https://geminicli.com/docs/changelogs/))
- **OTEL/observability** (Claude Code: per-category usage breakdown, `agent_id`/`parent_agent_id` spans, tool-detail logging). ([Claude Code Changelog](https://code.claude.com/docs/en/changelog))
- **True local-model + BYOK multi-provider as the default trust boundary** — NOT a strength of any leader (Gemini local Gemma is the closest; Claude Code gateway model discovery is opt-in). This is AGI's opening (see §5).

---

## 3. Cross-tool capability matrix

Legend: Y = shipped/native; Y* = shipped, notable/leading; ~ = partial/indirect/equivalent feature; ? = not confirmed in official docs reviewed; n/a = not applicable.

| Capability | Claude Code | Codex CLI | Gemini CLI | Cursor CLI |
|---|---|---|---|---|
| Built-in slash commands | Y* (large set) | Y* (40+) | Y | Y |
| Custom/user slash commands | Y (commands/, plugins) | Y (custom/team prompts) | Y | Y (`/rules`, commands) |
| Hooks / lifecycle events | Y* (deepest; MCP-tool hooks) | Y (subagent/tool/turn/approval, v0.133) | Y (lifecycle confirmations) | Y (start/end/prompt/stop; 10–20× faster) |
| Skills (instruction bundles) | Y* (SKILL.md, overrides, plugin) | Y (`$skill`, Dec 2025) | Y (`/skills` install/reload) | ~ (skills / `/loop`) |
| MCP — stdio | Y | Y | Y | Y |
| MCP — remote/HTTP + OAuth | Y | Y* (OAuth + per-server env, v0.134) | Y (resources, 4-tier memory) | Y (one-click auth) |
| Plugins / marketplace | Y* (marketplace + deps) | ~ (extensions) | Y (extensions registry) | ~ (extensions) |
| Subagents / parallel agents | Y* (100s, dynamic workflows) | Y (explicit) | Y (JIT ctx, A2A) | ~ (classifier subagent) |
| Sessions / resume | Y* (fg + bg, PR-URL search) | Y (local threads, fork) | Y (export/import, v0.43) | Y (`/resume`, fork) |
| Checkpoints / rewind | Y (Rewind menu, summarize-up-to) | ~ (fork/side threads) | Y (checkpointing, rewind) | ~ (cloud handoff) |
| Plan mode | ~ (`/goal`, `/workflow`) | Y (`/plan`) | Y (plan inspection) | Y (`/plan`, `--mode=plan`, `/ask`) |
| Tiered permissions / approval | Y* (auto classifier, hard_deny) | Y* (named profiles + inheritance) | Y (always-allow, allowlist) | Y (auto-review, run mode) |
| OS sandbox | Y (bwrap/seatbelt allowlists) | Y (read-dir grants, Windows) | Y* (Seatbelt + Windows native) | Y (sandboxed tool calls) |
| Git worktrees | Y* (managed, baseRef, isolation) | ~ (user-managed) | ~ (user-managed) | ~ (cloud agents) |
| Headless / CI mode | Y (`--print`, `ultrareview`, `--bg`) | Y (`exec`) | Y (headless, trust enforced) | Y (stable mac/linux/win) |
| Background / cloud agents | Y* (agents view, pinned bg) | ~ (remote-control daemon) | ~ (remote agents) | Y (`&` cloud handoff) |
| Multi-provider / BYOK | ~ (Bedrock/Vertex/Foundry, gateway) | ~ (API key, OpenAI-centric) | ~ (Gemini + local Gemma) | ~ (Cursor-managed + some BYOK) |
| Local models | ~ (gateway discovery opt-in) | ? | Y (`gemini gemma`, Gemma 4) | ? |
| Voice mode | ? | ? | Y (v0.41, cloud+local) | ? |

---

## 4. Version-specific facts (exact versions + dates)

### Claude Code (confidence: HIGH — granular official changelog, ships ~daily)
Source: [Claude Code Changelog](https://code.claude.com/docs/en/changelog)

- **v2.1.157 (2026-05-29):** Plugins in `.claude/skills/` auto-load without a marketplace; `claude plugin init`; `EnterWorktree` switches between Claude-managed worktrees mid-session; stdio MCP servers get `CLAUDE_CODE_SESSION_ID`/`CLAUDECODE=1`; `claude mcp list/get` show "⏸ Pending approval"; `--resume` reports running background subagents.
- **v2.1.154 (2026-05-28):** **Opus 4.8** default with extended thinking + `/effort xhigh`; **Dynamic Workflows** (`/workflow` keyword; orchestrate tens-to-hundreds of background agents; `/workflows` to view); **Fast mode** on Opus 4.8 (2× cost, 2.5× speed); `claude --bg --exec` background shell sessions; `plugin.json defaultEnabled: false`.
- **v2.1.152 (2026-05-27):** `/code-review --fix`; skills/commands can set `disallowed-tools` frontmatter; `/reload-skills`; `SessionStart` hooks can return `reloadSkills` and set session title; new `MessageDisplay` hook event.
- **v2.1.147 (2026-05-21):** Pinned background sessions (`Ctrl+T`); `claude agents --json` for scripting; `/code-review` (renamed from `/simplify`) reports bugs at effort level, `--comment` posts inline PR comments.
- **v2.1.143 (2026-05-15):** Plugin dependency enforcement (disable/enable chains); `worktree.bgIsolation: "none"`.
- **v2.1.139 (2026-05-11):** **Agent View** research preview (`claude agents`); `/goal` (autonomous completion condition); hooks `args: string[]` exec form, `continueOnBlock` PostToolUse.
- **v2.1.135 (2026-05-07):** `worktree.baseRef` (`fresh`|`head`), default `fresh`; hooks receive `effort.level` + `$CLAUDE_EFFORT`.
- **v2.1.129 (2026-05-06):** `--plugin-url` for `.zip` plugins; gateway model discovery opt-in (`CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1`).
- **v2.1.126 (2026-05-01):** `claude project purge`; `--dangerously-skip-permissions` now bypasses `.claude/`, `.git/`, `.vscode/`.
- **v2.1.121 (2026-04-28):** MCP `alwaysLoad`; `claude plugin prune`; PostToolUse hooks can replace tool output.
- **v2.1.118 (2026-04-23):** Vim visual modes; `/cost`+`/stats` merged into `/usage`; plugins can ship themes; hooks can invoke MCP tools directly (`type: "mcp_tool"`).
- **Note — model IDs:** Opus 4.8 is named in v2.1.154 (read other model IDs from `packages/types/src/models.json`, never hardcode).

### OpenAI Codex CLI (confidence: MEDIUM — version+dates solid; per-feature point-release attribution soft; model IDs noisy)
Sources: [Codex CLI Releases (GitHub)](https://github.com/openai/codex/releases), [Codex CLI Features](https://developers.openai.com/codex/cli/features), [Codex Changelog](https://developers.openai.com/codex/changelog)

- **v0.135.0 (2026-05-28):** `/permissions` understands named permission profiles + shows custom profiles; `codex doctor` richer env/Git/terminal/thread diagnostics; Vim text-object editing; non-interactive cached threads honor cwd overrides.
- **v0.134.0 (2026-05-26):** Full-text search across local history; **MCP per-server env targeting + OAuth for HTTP servers**; permission profile migration legacy→v2; `--profile` as primary selector.
- **v0.133.0 (2026-05-21):** **Goals enabled by default** (dedicated storage); `codex remote-control` reimplemented as foreground daemon (explicit start/stop); permission **inheritance** + managed `requirements.toml` + Windows sandbox; marketplace-aware plugin/skill discovery; **hooks: subagent start/stop, tool execution, turn metadata, async approval observers.**
- **Approval modes (3, current docs):** read-only (explicit approvals) → auto (full workspace access, approvals outside) → full access (read anywhere + network). ([Codex CLI Features](https://developers.openai.com/codex/cli/features))
- **Skills:** invocable via `$skill-name` (since Dec 2025) or auto-selected. ([Codex Changelog](https://developers.openai.com/codex/changelog))
- **Slash commands:** 40+ built-ins incl. `/plan`, `/goal`, `/fork`, `/side`, `/review`, `/permissions`, `/approve`, `/diff`, `/status`, `/resume`. ([Codex Slash Commands](https://developers.openai.com/codex/cli/slash-commands))
- **Models — LOW confidence / do not quote as fact:** doc pages reference GPT-5.x-Codex variants (e.g., "GPT-5.4 / GPT-5.3-Codex" on one page; "gpt-5.5" on another; "GPT-5.1-Codex-Max" historically Nov 2025). Exact current default unconfirmed; switch via `/model`. ([Codex CLI](https://developers.openai.com/codex/cli))

### Gemini CLI (confidence: MEDIUM — official changelog; STRATEGIC: free-tier shutdown)
Source: [Gemini CLI Changelog](https://geminicli.com/docs/changelogs/), [Gemini CLI docs](https://geminicli.com/docs/)

- **TRANSITION (announced ~2026-05-19):** Gemini CLI will **stop serving requests for free individual users and Google AI Pro/Ultra users on 2026-06-18**, migrating them to **Antigravity CLI**. ([Gemini CLI Changelog](https://geminicli.com/docs/changelogs/); corroborated by [Gemini CLI updates – Releasebot](https://releasebot.io/updates/google/gemini-cli))
- **v0.44.0 (2026-05-27):** Auto modes merged into a single unified mode; Sublime Text + Emacs Client editor support; `agent-tui`/`tui-tester` skills.
- **v0.43.0 (2026-05-22):** Session export/import flags (portability); adaptive token estimator; surgical-edit steering.
- **v0.42.0 (2026-05-12):** Auto Memory inbox (canonical-patch contract); **Gemma 4** default via Gemini API; voice mode wave animations + privacy warnings.
- **v0.41.0 (2026-05-05):** **Voice mode** (cloud + local backends); workspace-trust enforcement + secured `.env` loading in headless; shell command validation/allowlist.
- **v0.40.0 (2026-04-28):** Bundled ripgrep for offline search; **MCP resource tools + 4-tier memory**; local Gemma setup via `gemini gemma`; colorblind themes.
- **Cross-release features:** checkpointing + rewind; subagents (JIT context injection, A2A card discovery, resilient tool rejection); native macOS Seatbelt + Windows sandboxing; `/skills`, `/agents refresh`. ([Gemini CLI docs](https://geminicli.com/docs/))
- **Models — attribute loosely:** Gemini 3.1 Pro Preview referenced; Gemma 4 default for local. ([Gemini CLI Changelog](https://geminicli.com/docs/changelogs/))

### Cursor CLI / agent (confidence: LOW for CLI specifics — newest *dated CLI* changelog is Jan 2026; May entries are IDE/Composer)
Sources: [Cursor CLI Jan 16, 2026](https://cursor.com/changelog/cli-jan-16-2026), [Cursor CLI Jan 8, 2026](https://cursor.com/changelog/cli-jan-08-2026), [Cursor Changelog](https://cursor.com/changelog), [Cursor Docs](https://cursor.com/docs)

- **CLI Jan 16, 2026:** **Plan mode** (`/plan`, `--mode=plan`, clarifying questions) + **Ask mode** (`/ask`, `--mode=ask`, read-only); **cloud handoff** (`&`-prefix pushes local conversation to a Cloud Agent → continue on web/mobile); `/mcp list` interactive menu; `/usage`, `/about`, `/resume` (replaces `/list`), `/model` (replaces `/models`); **hooks for session start/end, prompt, stop**; word-level inline diffs; one-click MCP auth.
- **CLI Jan 8, 2026:** `/rules` (create/edit rules from CLI); `/mcp enable`/`/mcp disable`; `/models` listing + switching; **hooks 10–20× faster** (parallel exec, merged responses); headless workspace-trust fix (`--force` implies trust); Windows-stable headless.
- **IDE/Composer (May 2026, NOT CLI-scoped — context only):** **Cursor 3.6 (2026-05-29)** auto-review Run Mode (Shell/MCP/Fetch tool calls; allowlisted run immediately, sandboxable run in sandbox; classifier subagent decides allow/retry/ask); **Cursor 3.5 (2026-05-20)** Shared Canvases + `/loop` skill + automations; **Composer 2.5 (2026-05-18)** model. ([Cursor Changelog](https://cursor.com/changelog))
- **Models — attribute loosely:** Composer 2.5 (Cursor's own model, 2026-05-18) referenced; Cursor brokers multiple frontier providers; BYOK exists in settings but not confirmed CLI-default in docs reviewed.

---

## 5. Known pitfalls & gotchas

- **Cursor CLI staleness in public docs.** Cursor's dated *CLI-specific* changelog entries are Jan 8 / Jan 16 2026; the May 2026 changelog headlines (3.5, 3.6, Composer 2.5) are IDE/Composer surfaces. Do not assume the May Cursor IDE features are present in the CLI without re-verifying against `cursor.com/docs` (Agent/Rules/MCP/Skills/CLI). Treat Cursor CLI capability claims here as a lower-confidence snapshot.
- **Model-ID drift / hallucination risk.** Codex doc pages disagree on the current model name (GPT-5.4 vs 5.5 vs 5.3-Codex). WebFetch summarization is a known fabrication vector for proper-noun strings. Never hardcode any competitor model ID; for AGI, read from `packages/types/src/models.json` per repo lock.
- **Gemini free-tier cliff (2026-06-18).** Any competitive/positioning work referencing "Gemini CLI is free" is about to be wrong for individuals. Free/Pro/Ultra users get pushed to Antigravity CLI. This changes the "free terminal agent" landscape and is decision-relevant for AGI's GTM.
- **"Skills" is overloaded.** Codex `$skill`, Gemini `/skills`, Claude Code `SKILL.md`/plugins, and Cursor "skills/`/loop`" are conceptually similar but differ in invocation syntax, discovery, and packaging. A naive "we support skills" claim is ambiguous; spec the contract (file format, invocation, override behavior).
- **Permission models are 3-tier but NOT identical.** Codex (read-only/auto/full + named profiles + inheritance), Claude Code (auto classifier + `hard_deny` + sandbox allowlists), Gemini (always-allow + allowlist + OS sandbox), Cursor (run mode + auto-review classifier). Porting a mental model 1:1 will produce subtle trust-boundary bugs — exactly the class AGI's CLAUDE.md warns about (never silently cross Local→BYOK→Cloud).
- **Worktree isolation is mostly Claude-Code-specific.** Only Claude Code ships managed worktrees with baseRef/isolation/retention semantics. The others lean on user-managed worktrees or cloud agents. Building this well is a genuine differentiator but also a genuine cost.
- **Hooks security surface.** Hooks that can invoke MCP tools directly (Claude Code) or run shell on lifecycle events (Cursor) are powerful and a real attack surface. Claude Code has shipped multiple permission-bypass fixes in May 2026 (PowerShell `cd..`, bare variable assignments, shell expansions). Expect to spend security budget here.
- **Background/parallel agents change the cost & observability model.** Dynamic workflows spinning up hundreds of subagents (Claude Code) make per-category token accounting and OTEL spans essential, not optional — Claude Code added `/usage` per-category breakdown and `agent_id`/`parent_agent_id` spans precisely because of this.
- **Changelog summaries ≠ shipped behavior.** Several facts here come from a summarizing layer over docs. For load-bearing implementation decisions, re-verify against the primary changelog entry and, where possible, the tool's own `--help`/`/status`.

---

## 6. Implications / gaps for AGI Workforce

AGI Workforce CLI is Rust, v1 = Local + BYOK only, multi-provider routing, local-first privacy. Mapping the 2026 bar onto that:

**Must-match to be credible (Tier 1):**
1. **Slash commands** — built-in + user-defined (file-based, like `commands/` or Codex prompts). Cheap, expected.
2. **MCP** — stdio + remote/HTTP with OAuth. This is now baseline; per-server env and read-only concurrency are the 2026 refinements to plan for.
3. **Tiered permissions + OS sandbox** — implement the read-only / workspace-auto / full-access ladder. CRITICAL: AGI's locked rule (never silently route Local→BYOK→Cloud) is *stronger* than any competitor's permission model and should be enforced at this layer as an explicit trust-boundary gate, not just an approval prompt. This is both a compliance requirement and a marketable differentiator.
4. **Sessions + resume** — local transcripts, resume, fork. Aligns naturally with local-first.
5. **Headless/CI mode** — `exec`-style non-interactive run for pipelines.

**Strongly expected (Tier 2 — sequence after Tier 1):**
6. **Plan mode** — `/plan` + read-only `/ask` are now standard; relatively low cost, high perceived value.
7. **Hooks** — at minimum session start/stop/prompt + a tool-use gate. Budget for the security surface; do NOT ship MCP-tool-invoking hooks until the trust boundary is enforced.
8. **Skills** — pick ONE clear contract (file format + invocation + override) rather than a vague claim.
9. **Subagents / parallel agents** — at least basic explicit subagent spawn; dynamic 100-agent workflows are a Claude-Code-only frontier AGI can defer.
10. **Git worktrees** — Claude-Code-class managed worktrees are a differentiator but costly; a v1 can rely on user-managed worktrees and revisit.

**AGI's structural advantages (lean into these):**
- **Local-first + BYOK multi-provider as the DEFAULT trust boundary.** No leader does this — Codex is OpenAI-centric, Gemini is Gemini/Gemma-centric (and shutting its free tier), Cursor is broker-managed. AGI's six-surface + Local/BYOK story is genuinely differentiated, and the Gemini free-tier cliff (2026-06-18) creates a migration moment.
- **Local models on by default** (only Gemini's local Gemma is comparable; Claude Code gateway discovery is opt-in). Combined with telemetry-off-by-default, this is a privacy-first wedge.
- **Multi-surface continuity** (web/desktop/mobile/CLI/extensions) — Cursor's `&` cloud-handoff hints the market wants cross-surface session continuity; AGI's six surfaces are positioned for this, gated by the same trust-boundary rules.

**Gaps / risks specific to AGI:**
- **Pace.** Claude Code ships ~daily; matching the *bar* (not the pace) is the realistic goal. Prioritize Tier 1 + plan mode + basic hooks for v1.
- **Provider routing UX.** Multi-provider routing must surface the active provider label and never silently cross boundaries — this is a UX + security requirement competitors don't have to solve, so there's little prior art to copy.
- **Skills/hooks ecosystem.** Competitors have marketplaces and bundled skills; AGI starts cold. A minimal, well-specified contract beats a broad-but-vague one.
- **Sandbox parity.** Gemini/Codex/Claude Code all have OS-level sandboxing (Seatbelt/bwrap/Windows). A Rust CLI should target the same primitives early; this is table-stakes for "full access" mode safety.

---

## 7. Sources

All accessed 2026-05-29. Trust order: official docs/changelogs first; community/aggregators only for corroboration.

Official — Claude Code:
- Claude Code — Changelog — https://code.claude.com/docs/en/changelog — accessed 2026-05-29 (entries dated through v2.1.157, 2026-05-29)
- Claude Code — Agent View docs — https://code.claude.com/docs/en/agent-view — accessed 2026-05-29

Official — OpenAI Codex CLI:
- Codex CLI — Releases (GitHub) — https://github.com/openai/codex/releases — accessed 2026-05-29 (v0.133.0–v0.135.0, May 2026)
- Codex — CLI Features — https://developers.openai.com/codex/cli/features — accessed 2026-05-29
- Codex — CLI overview — https://developers.openai.com/codex/cli — accessed 2026-05-29
- Codex — Slash commands — https://developers.openai.com/codex/cli/slash-commands — accessed 2026-05-29
- Codex — Changelog — https://developers.openai.com/codex/changelog — accessed 2026-05-29
- Codex — MCP — https://developers.openai.com/codex/mcp — referenced 2026-05-29
- Codex — Config reference — https://developers.openai.com/codex/config-reference — referenced 2026-05-29

Official — Gemini CLI:
- Gemini CLI — Release notes/changelog — https://geminicli.com/docs/changelogs/ — accessed 2026-05-29 (v0.40.0–v0.44.0, Apr–May 2026; Antigravity transition note)
- Gemini CLI — Documentation — https://geminicli.com/docs/ — accessed 2026-05-29
- Gemini CLI — GitHub repo — https://github.com/google-gemini/gemini-cli — referenced 2026-05-29

Official — Cursor:
- Cursor — CLI (Jan 16, 2026): Agent Modes and Cloud Handoff — https://cursor.com/changelog/cli-jan-16-2026 — accessed 2026-05-29
- Cursor — CLI (Jan 8, 2026): New CLI Features and Performance — https://cursor.com/changelog/cli-jan-08-2026 — accessed 2026-05-29
- Cursor — Changelog (index; 3.5/3.6/Composer 2.5, May 2026) — https://cursor.com/changelog — accessed 2026-05-29
- Cursor — Docs (Agent, Rules, MCP, Skills & CLI) — https://cursor.com/docs — referenced 2026-05-29

Corroboration (aggregators — secondary):
- Releasebot — Gemini CLI updates (Google) — https://releasebot.io/updates/google/gemini-cli — accessed 2026-05-29 (corroborates Antigravity transition)
- Releasebot — Anthropic / Claude Code updates — https://releasebot.io/updates/anthropic/claude-code — referenced 2026-05-29
