# Competitive Research — AI IDE-Extension Feature Bar (VS Code surface)

Topic: AI IDE-extension capabilities and the VS Code AI extension API surface, as of **2026-05-29**
Author: Research analyst (AGI Workforce)
Surface in scope: `apps/extension-vscode` (AGI Workforce VS Code extension)
Competitors compared: OpenAI Codex IDE, Claude Code for VS Code, Cursor, GitHub Copilot (VS Code), Continue.dev

> Method note: every external claim below carries an inline source tag like `[S1]` that resolves in the Sources section with title, URL, and publication/observed date. Where a source's cached text appeared stale (e.g. old model IDs), it is flagged inline. Confidence is called out where sources were thin.

---

## 1. Summary

The 2026 baseline for an AI coding extension in VS Code is no longer "a chat box that calls an LLM." The market bar is an **agentic, multi-mode, diff-reviewed, context-aware in-editor agent** that also integrates with the **native VS Code AI extension APIs** so it composes with the rest of the editor's AI ecosystem rather than reinventing it.

Five capabilities now define table stakes:

1. **Mode switching** — ask/chat vs. agent vs. plan, with per-mode permission behavior (Codex, Claude Code, Copilot, Continue, Cursor all ship this). [S2][S4][S9][S10][S13]
2. **Diff-first review with granular approvals** — side-by-side diff, accept/reject/edit-then-accept, per-hunk and per-file controls, and a plan you can edit before execution. [S4][S2][S13]
3. **Rich, automatic context** — open buffers + current selection + diagnostics pulled automatically, plus explicit `@file` / `@folder` / `@file#line-range` mentions, drag-drop attachments, and `@terminal` output. [S2][S4]
4. **Cloud handoff that preserves context** — start a task locally, "Run in the cloud," preview the cloud diff in the IDE, then **apply the remote diff locally** without losing conversation context. Codex and Cursor both ship this as a headline feature; Claude Code resumes web sessions in the IDE. [S2][S3][S4][S8]
5. **Native VS Code AI API integration** — chat participants, the Language Model API, the **Language Model Chat Provider API** (BYOK model registration, since v1.104), Language Model Tools (agent-mode tools), and the inline completions provider. [S1][S5][S6][S7][S11]

**Where AGI stands today:** the AGI VS Code extension (`agi-workforce` v0.3.0, `engines.vscode ^1.110.0`) already implements the hard parts: a chat participant (`agiworkforce.agi`), LM API fallback, inline completions, code lens, a full diff-review/approval command set (accept/reject per-diff, per-file, global, batch), context-files panel with `@`-mention, agent modes (ask/auto/plan/bypass), reasoning effort, MCP flag, and a desktop bridge for cloud-ish handoff. (Verified in `apps/extension-vscode/package.json`.) The principal **gaps vs. the bar** are: (a) not yet registering as a **Language Model Chat Provider** so AGI's BYOK models surface in VS Code's native chat/agent picker; (b) cloud handoff is via a proprietary desktop bridge rather than a true "preview remote diff → apply locally" loop like Codex/Cursor; and (c) `@terminal` output references and a finalized native edit-mode are not evident. These are addressed in §5.

---

## 2. Current bar (what best practice requires as of 2026-05-29)

### 2.1 VS Code native AI extension API surface
VS Code exposes a layered set of AI extension APIs. As of 2026 the documented surfaces are: [S1][S5][S6][S7][S11]

| API | What it lets an extension do | Status |
|---|---|---|
| **Chat Participant API** | Register an `@`-mentioned specialist (e.g. `@agi`) that receives the user's prompt and orchestrates its own response in the Chat view; supports slash sub-commands and disambiguation. Used to "extend ask mode with domain-specific experts." [S1][S12] | Finalized |
| **Language Model API** (`vscode.lm`) | `selectChatModels` (pick by vendor/id/family/version), `sendRequest` with a cancellation token, streaming responses, per-model `maxInputTokens`, user-consent flow for Copilot-provided models. Lets an extension *consume* models the editor already has. [S6] | Finalized |
| **Language Model Chat Provider API** (`vscode.lm.registerLanguageModelChatProvider`, `contributes.languageModelChatProviders`) | Lets an extension *contribute its own models* (one provider → many models) into the chat/agent model picker — i.e. BYOK as an open ecosystem. Optional image input, optional tool-calling, token counting, streamed mixed content (text/tool-call/tool-result). | **Introduced v1.104** [S7][S11] |
| **Language Model Tools API** | Register tools the agent auto-invokes in agent mode; tools run in the extension host and can use all VS Code APIs. The `toolCalling` flag must be set for a model to appear in agent mode. [S1][S11] | Finalized |
| **Inline Completion Provider** | Ghost-text completions in the editor; when an inline completion provider is active, plain typing no longer auto-triggers the suggest control. [S11] | Finalized |
| **MCP support** | VS Code can consume MCP servers (tools run outside VS Code, locally or remote); Copilot/agent features can be extended with MCP tools. [S1][S9] | Finalized |
| **Custom Endpoint provider** | First-party provider in Copilot that connects any compatible endpoint; supports three API families selectable **per model** — Chat Completions, Responses, and Messages. Replaces the deprecated "OpenAI Compatible (customoai)" provider. | **Preview, Insiders-only** [S11] |

Key takeaway: BYOK in VS Code shifted from a centralized list to an **open, extensible ecosystem** — "any provider can offer their models with a simple extension install." [S7] This is directly aligned with AGI's multi-provider/BYOK thesis.

### 2.2 Feature bar by capability (cross-competitor)

- **Modes.** Codex: Chat (planning) vs. Agent (auto reads/edits/runs), with model + reasoning-effort (low/medium/high) switch. [S2] Claude Code: normal / Plan / auto-accept permission modes, plan opens as an editable markdown doc with inline comments before execution. [S4] Copilot: ask vs. agent mode; "custom agents" (formerly "custom chat modes") bundle instructions + tools. [S9][S13] Continue: Autocomplete / Edit / Chat / Agent, agent asks permission per tool with configurable tool policies. [S10] Cursor: Tab, Cmd+K targeted edits, Agent mode, Composer multi-file. [S8]
- **Diff review & approvals.** Claude Code: side-by-side diff, accept/reject/redirect, and **edit-the-diff-before-accepting** (Claude is told you modified it). [S4] Cursor: color-coded diff, accept/reject/**partially apply**, multi-file preview before applying. [S8] Codex: inline edits with preview + diff review before approval. [S2] Continue: per-tool allow/cancel with tool policies. [S10]
- **Context.** Automatic open-buffers + diagnostics (Codex, Claude Code). [S2][S4] `@file` / `@folder` / `@file#line-range` mentions, fuzzy matching, drag-drop image/file attachments, and `@terminal:name` output references (Claude Code). [S4] Claude Code runs a local **`ide` MCP server** exposing `mcp__ide__getDiagnostics` (Problems panel errors/warnings) and `mcp__ide__executeCode` (Jupyter, always confirm-first) to the model. [S4]
- **Cloud handoff / apply remote diffs.** Codex: start cloud task from local convo (from `main` or from local changes), context preserved across handoff, preview cloud diff in IDE, ask follow-ups, **apply diffs locally**; integrated web search on by default for local tasks. [S2][S3] Cursor 3.5: **Cloud Agents** in isolated cloud VMs (terminal/browser/desktop access, multi-repo parallel), report back to the IDE asynchronously. [S8] Claude Code: resume **remote (claude.ai web) sessions** in VS Code via a Remote tab (GitHub-repo sessions only; changes not synced back). [S4]
- **Sessions & history.** Multiple conversations in tabs/windows, searchable session history, AI-generated titles, checkpoints/rewind (fork-from-here, rewind-code-to-here) — Claude Code. [S4]
- **Inline completions / Tab.** Cursor's Tab is a dedicated low-latency next-action model; Codex/Cursor ship inline completions; Continue ships Autocomplete. [S8][S2][S10]

---

## 3. Version-specific facts (exact versions + dates)

- **VS Code Language Model Chat Provider API** introduced in **v1.104**. BYOK first shipped **March 2025**; the provider-extension model generalized it into an open ecosystem. [S7][S11] *(The v1.104 calendar date was not stated in the sources fetched — confidence medium on the exact day; high on the version.)*
- **Custom Endpoint provider** (Chat Completions / Responses / Messages per model) is **preview, VS Code Insiders only** as of the May 2026 update notes; it deprecates the legacy `customoai` "OpenAI Compatible" provider. [S11]
- **Claude Code for VS Code**: requires **VS Code 1.98.0+**; native graphical panel is the recommended interface; the native in-IDE extension was described as **beta** in 2026 coverage; changelog cites **v2.1.76 (2026-03-14)** and **MCP elicitation / lazy tool-loading** in the March 2026 release. [S4][S14] Registers URI handler `vscode://anthropic.claude-code/open`. [S4]
- **OpenAI Codex IDE extension**: ships for VS Code, Cursor, Windsurf and JetBrains (Rider/IntelliJ/PyCharm/WebStorm); macOS, Windows (native or WSL2), Linux. JetBrains integration launched **Jan 2026 (build 2025.3)**; VS Code multi-agent support **Feb 2026**; "goal mode" left experimental **2026-05-21**. Codex CLI (shares config with the extension) recent releases: **v0.135.0 (2026-05-28)**, **v0.134.0 (2026-05-26)**, **v0.133.0 / v0.132.0 (2026-05-19)**, **v0.131.0 (2026-05-18)**. [S2][S3][S15] *(Codex IDE extension itself does not publish a clearly-versioned changelog in the sources fetched — confidence medium on extension version; CLI dates high.)*
- **Cursor 3.5** launched **2026-05-20** (headline: Cloud Agents in isolated cloud VMs). **Cursor 3.3 (2026-05-07)**: Build-in-Parallel subagents, pinned-skill pills, **Composer 2.5** (multi-file refactor at file-tree scale), native Jira integration. [S8]
- **GitHub Copilot (VS Code)**: "custom chat modes" renamed to **"custom agents"** in 2026 docs; agent mode model-agnostic via the model dropdown; extensible via MCP and Marketplace tools. [S9][S13] *(No single Copilot version pinned in sources — confidence medium.)*
- **Continue.dev**: VS Code Marketplace ~**2.5M installs**, GitHub ~**32.4k stars**; four modes (Autocomplete/Edit/Chat/Agent); multi-provider (OpenAI, Anthropic, Gemini, Ollama, Bedrock, Azure, xAI), local/offline/self-host, MCP. [S10]
- **AGI Workforce extension (in-repo, observed)**: `agi-workforce` **v0.3.0**, `engines.vscode ^1.110.0`, `@types/vscode ^1.110.0`. Chat participant `agiworkforce.agi` with `explain/fix/refactor/tests/docs/model` sub-commands; `fallbackToVscodeLm` default true; inline completions enabled by default; code lens default true; agent modes `ask|auto|plan|bypass`; effort `low|medium|high|max`; MCP flag (default off); desktop bridge default on (port 8787); provider-stream path present but **web auth not yet wired** ("not wired in the VS Code extension yet"). (Source: `apps/extension-vscode/package.json`.)

---

## 4. Known pitfalls & gotchas

1. **`toolCalling` flag gates agent mode.** A model that appears in standard chat will *not* appear in agent mode if its `toolCalling` flag is missing/false. If AGI registers a chat provider, every tool-capable model must declare this. [S11]
2. **Inline-completion / suggest-widget interaction.** When an inline completion provider is active, plain typing stops auto-triggering VS Code's suggest control — can surprise users who expect IntelliSense. Coordinate UX so AGI completions don't suppress useful native suggestions. [S11]
3. **Custom Endpoint provider is Insiders-only / preview.** Do not assume the per-model Chat-Completions/Responses/Messages selection is in stable VS Code; the legacy `customoai` path is deprecated, so plan a migration window. [S11]
4. **LM API model-family list churns.** VS Code docs and cached snapshots still cite older example IDs (gpt-4o, o1, claude-3.5-sonnet) [S6]; treat any hardcoded family as illustrative only. (Mirrors AGI's locked rule: never hardcode model IDs — read from `packages/types/src/models.json`.) Confidence on the *current* exact family list is **low** because the fetched doc text appeared stale.
5. **Workspace trust / Restricted Mode.** AI extensions that write files or run terminals must respect Restricted Mode; Claude Code explicitly recommends Restricted Mode + manual approval for untrusted code and notes auto-edit can modify `settings.json`/`tasks.json` that VS Code may auto-execute. [S4] AGI already restricts config + disables agent writes until trusted (`capabilities.untrustedWorkspaces` in package.json) — keep that.
6. **Diagnostics/selection exfiltration.** Claude Code's `ide` MCP server sends current selection + active file path on each prompt; a single sensitive file (`.env`) leaks unless a deny rule exists. Any AGI auto-context must give users a way to exclude paths and a visible "selected N lines from X" indicator. [S4]
7. **Cloud handoff = a trust-boundary crossing.** Codex/Cursor cloud agents run in remote VMs with network access. For AGI (v1 = Local + BYOK only, local-first privacy), any cloud handoff must be an explicit, consented fork with a payload preview and visible provider label — not a silent route. (Aligns with the repo's locked Local→BYOK consent rules.)
8. **Jupyter / code execution must confirm-first.** `mcp__ide__executeCode` never runs silently — a native Quick Pick gates every cell. Any AGI execute-code path should match this confirm-on-every-run pattern. [S4]
9. **macOS Tahoe `Cmd+Esc` clash.** System Game Overlay intercepts `Cmd+Esc`; Claude Code documents the rebind. Pick keybindings defensively (AGI currently uses `cmd+shift+a`, which conflicts with its own accept-diff binding gated by the `agi-workforce.hasDiff` context key — verify that `when`-clause split is robust). [S4]

---

## 5. Implications / gaps for AGI Workforce

AGI's VS Code extension is already at or near parity on the *editor-native* feature bar. The gaps that matter are about (a) composing with VS Code's native AI ecosystem and (b) a genuine cloud-handoff loop — both constrained by AGI's locked Local + BYOK-only, never-silent-routing rules.

**Already at bar (verified in package.json):** chat participant + slash commands + disambiguation; LM API fallback (`fallbackToVscodeLm`); inline completions (debounce/maxLength configurable); code lens (Ask AI / Tests / Docs); full diff-review/approval surface (accept/reject per-diff, per-file, global, batch; show expected-vs-actual; patch logs); context-files tree + `@`-mention + add/remove/clear; agent modes ask/auto/plan/bypass + cycle (Shift+Tab); reasoning effort + extended thinking toggle; checkpoints (create/restore/list/rewind); memory panel; MCP flag; workspace-trust restrictions.

**Gap 1 — Register as a Language Model Chat Provider (highest leverage).** AGI's entire pitch is multi-provider + BYOK. VS Code now lets any extension contribute its models into the native chat/agent picker via `registerLanguageModelChatProvider` (v1.104). [S7][S11] Surfacing AGI's 10+ providers there would (a) let users drive AGI models from VS Code's own chat/agent UI, and (b) let Copilot/agent-mode use AGI models. Must respect: `toolCalling` flag per model [S11], read model IDs from `models.json` (never hardcode), and keep Local vs BYOK trust boundaries explicit. Today the extension only *consumes* the LM API as a fallback — it does not *provide*. **Recommend: evaluate provider registration as a v1.1 item.**

**Gap 2 — True "preview remote diff → apply locally" cloud loop.** Codex and Cursor 3.5 set the bar: start in the IDE, run in the cloud, preview the cloud diff inline, apply locally with context preserved. [S2][S3][S8] AGI has a *desktop bridge* (send code / sync context / trigger action / reconnect) but not the canonical apply-remote-diff UX. Under v1 Local-only + cloud-waitlist rules this stays gated, but the **UX scaffold** (preview diff from a remote/desktop source, explicit consent, provider label, then local apply) is worth building now so it's ready when cloud graduates. The existing batch/global diff-apply commands are the right primitives to reuse.

**Gap 3 — `@terminal` output and editor-native edit mode.** Claude Code references `@terminal:name` output and Codex pulls diagnostics automatically. [S2][S4] AGI has terminal commands (run/explain/suggest) and an explain-error path, but an `@terminal`-style *context reference* (inject terminal output into a prompt) and automatic diagnostics-as-context aren't evident in package.json. Both are cheap parity wins and align with "rich automatic context."

**Gap 4 — Provider-stream auth not wired.** `useProviderStream` exists but the config note says web auth is "not wired in the VS Code extension yet." Until wired, the BYOK/provider-stream path can't fully exercise the multi-provider story in-IDE. This blocks Gap 1's value. **Recommend: prioritize the auth wiring.**

**Trust-boundary guardrails to keep (do not regress):**
- Never silently route Local chats to BYOK/cloud; any handoff is an explicit consented fork with payload preview + provider label. (Repo lock.)
- Keep `untrustedWorkspaces` restricted config + agent-write-gating. (Already present.)
- Provide path-exclusion for auto-context (selection/diagnostics) and a visible "selected N lines" indicator — match Claude Code's deny-rule + indicator pattern. [S4]
- Code execution / Jupyter must confirm on every run. [S4]

**Net:** AGI is competitive on in-editor mechanics. The differentiated, on-strategy move is to lean into VS Code's open BYOK ecosystem (Gap 1 + Gap 4) — that is exactly where the platform is heading and exactly where AGI's multi-provider thesis is strongest — while keeping cloud handoff (Gap 2) gated behind the locked consent rules.

---

## 6. Sources

- **[S1]** AI extensibility in VS Code — Visual Studio Code Extension API — https://code.visualstudio.com/api/extension-guides/ai/ai-extensibility-overview — observed 2026-05-29 (docs labeled current 2026)
- **[S2]** Features – Codex IDE — OpenAI Developers — https://developers.openai.com/codex/ide/features — observed 2026-05-29
- **[S3]** IDE extension – Codex — OpenAI Developers — https://developers.openai.com/codex/ide — observed 2026-05-29
- **[S4]** Use Claude Code in VS Code — Claude Code Docs — https://code.claude.com/docs/en/vs-code — observed 2026-05-29
- **[S5]** Chat Participant API — Visual Studio Code Extension API — https://code.visualstudio.com/api/extension-guides/ai/chat — observed 2026-05-29
- **[S6]** Language Model API — Visual Studio Code Extension API — https://code.visualstudio.com/api/extension-guides/ai/language-model — observed 2026-05-29 (note: page text cited older example model IDs gpt-4o/o1/claude-3.5-sonnet; treat as illustrative/possibly stale)
- **[S7]** Expanding Model Choice in VS Code with Bring Your Own Key — VS Code blog (2025-10-22) — https://code.visualstudio.com/blogs/2025/10/22/bring-your-own-key — published 2025-10-22, observed 2026-05-29
- **[S8]** Cursor 3.5 IDE Guide: Cloud Agents, Composer 2.5, Pricing (2026) — Codersera — https://codersera.com/blog/cursor-ide-complete-guide-2026/ — Cursor 3.5 dated 2026-05-20, 3.3 dated 2026-05-07; observed 2026-05-29 (community source)
- **[S9]** GitHub Copilot in VS Code — https://code.visualstudio.com/docs/copilot/overview — observed 2026-05-29
- **[S10]** Agent / How to use it — Continue Docs — https://docs.continue.dev/agent/how-to-use-it (and Continue Marketplace listing) — observed 2026-05-29
- **[S11]** Visual Studio Code Updates by Microsoft — May 2026 — Releasebot — https://releasebot.io/updates/microsoft/visual-studio-code — observed 2026-05-29 (aggregator of VS Code release notes; Custom Endpoint provider preview, toolCalling flag, inline-completion suggest behavior)
- **[S12]** Language Model Chat Provider API — Visual Studio Code Extension API — https://code.visualstudio.com/api/extension-guides/ai/language-model-chat-provider — observed 2026-05-29 (registerLanguageModelChatProvider, contributes.languageModelChatProviders)
- **[S13]** Custom agents in VS Code — https://code.visualstudio.com/docs/copilot/customization/custom-agents — observed 2026-05-29 ("custom chat modes" → "custom agents")
- **[S14]** Claude Code Updates 2026 — Get AI Perks — https://www.getaiperks.com/en/articles/claude-code-updates — cites v2.1.76 (2026-03-14), MCP elicitation/lazy tool-loading; observed 2026-05-29 (community source)
- **[S15]** Codex Updates by OpenAI — May 2026 — Releasebot — https://releasebot.io/updates/openai/codex — CLI v0.131.0–v0.135.0 dates 2026-05-18 → 2026-05-28; "goal mode" GA 2026-05-21; observed 2026-05-29
- **[S16]** The Codex IDE Extension: VS Code, JetBrains, and the Hybrid Cloud-Local Workflow — Codex Blog (Daniel Vaughan) — https://codex.danielvaughan.com/2026/04/01/codex-ide-extension-vs-code-jetbrains/ — published 2026-04-01 (updated through 2026-05-29); JetBrains 2025.3 Jan 2026, VS Code multi-agent Feb 2026; community source
- **[S17]** AGI Workforce VS Code extension manifest — `apps/extension-vscode/package.json` (in-repo) — observed 2026-05-29 (v0.3.0, engines.vscode ^1.110.0)

---

*Confidence: medium-high overall. High on VS Code native API surface and Claude Code/Codex feature lists (primary docs). Medium on exact Codex IDE extension and Copilot version numbers (changelogs not cleanly versioned in fetched sources). Low on the current exact LM-API model-family list (fetched doc text appeared stale). Cursor/Copilot/Continue specifics lean partly on reputable community sources where first-party changelogs were not directly fetched.*
