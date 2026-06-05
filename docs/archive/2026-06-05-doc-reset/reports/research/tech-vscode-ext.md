# VS Code Extension API for AI Agents (2026) — Best Practices & Pitfalls

Research date: 2026-05-29
Author: Research analyst (AGI Workforce)
Scope: Current VS Code extension API surface for AI features — Language Model API (`vscode.lm`), Chat Participant API, Language Model Tools, Language Model Chat Provider (BYOK), inline completions, code actions, webviews, tree views, secret storage, telemetry. Framed against AGI Workforce's VS Code extension surface (`apps/extension-vscode`), v1 = Local + BYOK, multi-provider routing, local-first privacy.

> Confidence: **medium-high**. The version timeline, the `@types/vscode` version, and the stable-vs-proposed status of the two AGI-critical APIs (Language Model Chat Provider; chat context provider) were verified from primary sources — the official release-notes archive, the npm registry, and the official `vscode-extension-samples` `package.json` files (high confidence). The narrative API descriptions (method signatures, contribution fields) come from official-docs page summaries fetched live; these are very likely correct but are doc-summary-derived rather than independently compiled from the `.d.ts` (medium-high). Doc pages carry a uniform "5/28/2026" footer that is a **site build date, not a per-page publication date** — they are cited below as "accessed 2026-05-29." Where a claim is thinner it is flagged inline.

---

## Summary

The current VS Code stable release is **1.122** (May 2026); the docs site already documents **1.123** (June 2026) ([Release Notes Archive](https://code.visualstudio.com/updates/archive), accessed 2026-05-29). VS Code ships on a strict **monthly** cadence — 1.106 = Oct 2025 through 1.122 = May 2026, one minor per month ([archive](https://code.visualstudio.com/updates/archive)). The matching type-definitions package is **`@types/vscode` 1.120.0**, `latest` dist-tag, last modified 2026-05-13 (verified via the npm registry `dist-tags.latest`).

The AI extensibility surface has consolidated around **agent mode** as the first-class workflow. There are now five distinct, officially-blessed paths for AI extension authors, and choosing the right one is the single most important design decision ([AI extensibility overview](https://code.visualstudio.com/api/extension-guides/ai/ai-extensibility-overview), accessed 2026-05-29):

1. **Language Model API** (`vscode.lm.selectChatModels` + `model.sendRequest`) — consume models from your own UI, outside the chat panel. **Stable.**
2. **Chat Participant API** (`vscode.chat.createChatParticipant`, `@`-mention) — own the full interaction flow in *ask* mode. **Stable.** Note: participants are **not** auto-invoked by agent mode.
3. **Language Model Tool API** (`vscode.lm.registerTool` + `languageModelTools` contribution) — expose capabilities the model auto-invokes during an **agentic** session. **Stable.**
4. **Language Model Chat Provider API** (`vscode.lm.registerLanguageModelChatProvider` + `languageModelChatProviders` contribution) — register *your own models/providers (BYOK)* into VS Code's native chat & agent picker. **Stable and Marketplace-publishable** (verified below).
5. **MCP server** — provider-agnostic tools, no VS Code API dependency, reusable across clients.

**The single most important finding for AGI:** the **Language Model Chat Provider API is finalized (stable), not proposed.** The official `chat-model-provider-sample` ships with **no `enabledApiProposals`** and `engines.vscode: ^1.104` (verified from its `package.json`, raw GitHub, 2026-05-29). That means AGI **can register its multi-provider BYOK routing into VS Code's native chat/agent UI *and* publish that extension to the Marketplace** without the proposed-API restriction. This is the strategic fork: AGI does **not** have to ship its own webview chat UI to be a first-class model provider in VS Code. (Contrast: the `chatContextProvider` API is still proposed and Marketplace-blocked — see Pitfalls.)

VS Code 1.122 also moved **air-gapped / offline BYOK** to stable — users can use their own models (e.g., Ollama) without GitHub authentication, and the new **Custom Endpoint provider** (Chat Completions / Responses / Messages-compatible) reached stable, replacing the deprecated `customoai` "OpenAI Compatible" provider ([v1.122 release notes](https://code.visualstudio.com/updates/v1_122), accessed 2026-05-29). This directly validates AGI's local-first + BYOK posture inside the editor.

---

## Current bar (what best practice requires as of 2026-05-29)

These are the practices a modern VS Code AI extension is expected to meet.

1. **Pick the right extensibility primitive — agent-first.** Use **Language Model Tools or MCP** for capabilities the model should invoke autonomously in an agentic session; use a **Chat Participant** only for user-invoked (`@`-mention) ask-mode flows; use the **Language Model Chat Provider** to register your own models; use the **Language Model API** for non-chat UI. Chat participants do **not** participate in agent-mode orchestration ([AI extensibility overview](https://code.visualstudio.com/api/extension-guides/ai/ai-extensibility-overview); [Chat Participant API](https://code.visualstudio.com/api/extension-guides/ai/chat), accessed 2026-05-29).

2. **Gate model access behind explicit user-initiated actions.** Copilot's language models require user consent; `selectChatModels` triggers an auth dialog and must be called from a user gesture (a command), never on activation ([Language Model API](https://code.visualstudio.com/api/extension-guides/ai/language-model), accessed 2026-05-29). For AGI this maps cleanly to the "never silently route" trust-boundary rule.

3. **Handle `LanguageModelError` for the three real failure modes:** model nonexistent, missing user consent, exceeded quota/rate limit. Be rate-limit aware; do not poll models in tests ([Language Model API](https://code.visualstudio.com/api/extension-guides/ai/language-model)).

4. **Stream everything.** `sendRequest` responses and `ChatResponseStream` are streaming-first (`markdown()`, `progress()`, `button()`, `filetree()`, `reference()`, `anchor()`); progressive delivery is the expected UX ([Chat Participant API](https://code.visualstudio.com/api/extension-guides/ai/chat)).

5. **Write tool descriptions for the model, not the user.** `languageModelTools` requires both `modelDescription` (detailed, for the LLM) and `userDescription`; name tools `{verb}_{noun}` (e.g. `get_weather`); supply a strict JSON `inputSchema`; set `canBeReferencedInPrompt` + `toolReferenceName` for `#`-references ([Language Model Tool API](https://code.visualstudio.com/api/extension-guides/ai/tools), accessed 2026-05-29).

6. **Confirm side-effecting tool calls.** Implement `prepareInvocation()` to render a confirmation dialog before destructive actions; `invoke()` returns a `LanguageModelToolResult` ([Language Model Tool API](https://code.visualstudio.com/api/extension-guides/ai/tools)).

7. **Use the official utils library for participants with tools.** `@vscode/chat-extension-utils` exposes `sendChatParticipantRequest(request, chatContext, { prompt, responseStreamOptions, tools }, token)`, which wires tool-calling loops for you instead of hand-rolling the orchestration ([vscode-chat-extension-utils](https://github.com/microsoft/vscode-chat-extension-utils); [Chat Participant API](https://code.visualstudio.com/api/extension-guides/ai/chat)).

8. **Provider authors: implement the three provider methods and respect `silent`.** `provideLanguageModelChatInformation` (list models; honor the `silent` param to avoid credential prompts), `provideLanguageModelChatResponse` (stream `LanguageModelTextPart` / `LanguageModelToolCallPart` / `LanguageModelToolResultPart`), `provideTokenCount`. Declare `vendor` + `displayName` (+ optional `managementCommand`) under `languageModelChatProviders` ([Language Model Chat Provider API](https://code.visualstudio.com/api/extension-guides/ai/language-model-chat-provider), accessed 2026-05-29).

9. **Secrets go in `SecretStorage`, never settings or globalState.** Use `context.secrets.store/get/delete`; secrets are encrypted at rest via the OS keychain and not stored in plaintext ([SecretStorage / remote extensions](https://code.visualstudio.com/api/advanced-topics/remote-extensions), accessed 2026-05-29).

10. **Webviews: least-privilege.** Set `localResourceRoots` to the minimum directories, use `webview.asWebviewUri()` for all local resources (required for browser/Codespaces), add a strict CSP `<meta>` with a per-load nonce for scripts, and only enable `retainContextWhenHidden` when state preservation is worth the high memory cost ([Webview API guide](https://code.visualstudio.com/api/extension-guides/webview), accessed 2026-05-29).

11. **Telemetry through `TelemetryLogger` only.** Create via `vscode.env.createTelemetryLogger`; it auto-respects the user's `telemetry.telemetryLevel` setting and strips potentially sensitive data ([VS Code API reference — TelemetryLogger](https://code.visualstudio.com/api/references/vscode-api), accessed 2026-05-29). Aligns with AGI's "telemetry off by default" lock.

12. **Emit agent telemetry in the new shape if you build local agents.** As of 1.122, local agent sessions emit **OpenTelemetry** signals under `github.copilot.*` attribute namespaces (matching GitHub Copilot CLI conventions), with structured tool params and hook outcomes ([v1.122 release notes](https://code.visualstudio.com/updates/v1_122)).

---

## Version-specific facts (exact versions + dates)

| Fact | Value | Source |
|---|---|---|
| Current stable VS Code | **1.122** (May 2026) | [archive](https://code.visualstudio.com/updates/archive); [v1.122](https://code.visualstudio.com/updates/v1_122) |
| Newest version documented | 1.123 (June 2026) | [archive](https://code.visualstudio.com/updates/archive) |
| Release cadence | **Monthly**, one minor each (1.106 Oct 2025 → 1.122 May 2026) | [archive](https://code.visualstudio.com/updates/archive) |
| `@types/vscode` latest | **1.120.0** (`dist-tags.latest`), modified 2026-05-13 | npm registry `registry.npmjs.org/@types/vscode` |
| Prior release | 1.121, May 20 2026 (remote agents over SSH/tunnels; AHP; built-in Mermaid) | [v1.121](https://code.visualstudio.com/updates/v1_121); [Visual Studio Magazine](https://visualstudiomagazine.com/articles/2026/05/20/vs-code-1-121-adds-remote-agents-built-in-html-and-mermaid-previews.aspx) |

**Stable vs proposed — verified from official sample `package.json` files (raw GitHub, 2026-05-29):**

| API | Status | Evidence |
|---|---|---|
| Chat Participant (`chatParticipants`) | **Stable** | `chat-sample/package.json`: no `enabledApiProposals`, `engines.vscode ^1.100` |
| Language Model Tools (`languageModelTools`) | **Stable** | same sample, same package.json |
| Language Model API (`selectChatModels`/`sendRequest`) | **Stable** | consumed in stable samples; finalized pre-cutoff |
| **Language Model Chat Provider (`languageModelChatProviders`)** | **Stable + Marketplace-publishable** | `chat-model-provider-sample/package.json`: **no `enabledApiProposals`**, `engines.vscode ^1.104` |
| Chat **Context** Provider (`chatContextProvider`) | **Proposed (Marketplace-blocked)** | `chat-context-sample/package.json`: `enabledApiProposals: ["chatContextProvider"]`, `engines.vscode ^1.109` |
| `chatParticipantPrivate`, `chatDebug`, `chat.agent.onPermissionRequest` | **Proposed/private** | live VS Code issues #300399, #302362 |

**1.122 BYOK / local facts (most relevant to AGI):**
- **Air-gapped BYOK** is stable — own models usable offline without GitHub auth (e.g., Ollama local models) ([v1.122](https://code.visualstudio.com/updates/v1_122)).
- **Custom Endpoint provider** is stable; supports Chat Completions, Responses, or Messages-compatible endpoints; **replaces the deprecated `customoai` ("OpenAI Compatible") provider** ([v1.122](https://code.visualstudio.com/updates/v1_122); [v1.121](https://code.visualstudio.com/updates/v1_121)).
- New settings `chat.utilityModel` and `chat.utilitySmallModel` let authors override the models used for titles, summaries, commit messages, rename suggestions, prompt categorization, intent detection ([v1.121](https://code.visualstudio.com/updates/v1_121); [v1.122](https://code.visualstudio.com/updates/v1_122)).
- `Chat: Manage Language Models` is runnable from the Agents window for local + BYOK models ([v1.121](https://code.visualstudio.com/updates/v1_121)).
- Granular BYOK provider-group actions: Update API Key / Add Model / Rename Group / Delete ([v1.122](https://code.visualstudio.com/updates/v1_122)).

**API shape notes (doc-summary-derived, medium-high confidence):**
- `selectChatModels(selector)` filters by `vendor`, `id`, `family`, `version`; returns matching model objects each exposing `maxInputTokens`; `model.sendRequest(messages, options, token)` streams ([Language Model API](https://code.visualstudio.com/api/extension-guides/ai/language-model)).
- `InlineCompletionItemProvider.provideInlineCompletionItems(document, position, context, token)` returns `InlineCompletionList | InlineCompletionItem[]`; **multiple providers run in parallel and merge**, and one failing provider does not fail the whole operation ([VS Code API reference](https://code.visualstudio.com/api/references/vscode-api), accessed 2026-05-29).

> Caution on model IDs: VS Code docs example models (e.g. `gpt-4o`, `o1`, `claude-3.5-sonnet`) are illustrative and partly date-lagged in the doc summaries — do **not** treat them as the current Copilot catalog. AGI must read its own model IDs from `packages/types/src/models.json` (repo lock), and provider-side model lists come from `provideLanguageModelChatInformation` at runtime, not hardcoded.

---

## Known pitfalls & gotchas

1. **`@types/vscode` version must be ≤ `engines.vscode`, and the npm sort lies.** Your `engines.vscode` floor (e.g. `^1.122`) sets the **minimum** VS Code your extension runs on; `@types/vscode` must not exceed it or you'll compile against APIs older runtimes lack. Note the npm registry's *string*-sorted version list shows `1.99.x` as "last" — the authoritative current version is the **`dist-tags.latest` = 1.120.0** field, not the lexicographic tail. Pin `@types/vscode` to the floor you actually support, not "latest" ([npm @types/vscode](https://www.npmjs.com/package/@types/vscode); [Extension Manifest](https://code.visualstudio.com/api/references/extension-manifest)).

2. **Proposed APIs cannot ship to the Marketplace.** Any API requiring `enabledApiProposals` (e.g. `chatContextProvider`, `chatParticipantPrivate`, `chatDebug`) only runs in **VS Code Insiders with `--enable-proposed-api`** and will be **rejected by `vsce publish`**. Proposed APIs also change without notice between minors — issue #300399 documents an extension breaking because a proposal version became incompatible with the current VS Code. Verify status from the sample's `package.json` before depending on an API ([microsoft/vscode#300399](https://github.com/microsoft/vscode/issues/300399); [Chat Context Provider proposal](https://github.com/microsoft/vscode/issues/251580)).

3. **Chat participants are *not* in agent mode.** A common 2026 mistake is building an `@`-participant expecting it to be auto-invoked during an agentic session. Participants serve user-invoked **ask** mode only; to be reachable by the agent's orchestration loop you must expose a **Language Model Tool** (or MCP server) ([AI extensibility overview](https://code.visualstudio.com/api/extension-guides/ai/ai-extensibility-overview); web search corroboration, [DevOps.com](https://devops.com/vs-code-pushes-hard-on-ai-agents-while-quietly-killing-free-code-completion/), 2026).

4. **Consuming Copilot models ties you to consent + quota you don't control.** The `vscode.lm` consumer API routes through Copilot's models, requires user consent dialogs, and is rate/quota limited by the user's Copilot plan — fine for incidental use, wrong for a high-volume product loop. To control routing, cost, and offline behavior, **be a provider** (`registerLanguageModelChatProvider`) rather than only a consumer ([Language Model API](https://code.visualstudio.com/api/extension-guides/ai/language-model)).

5. **Don't call `selectChatModels` on activation.** It can pop a consent dialog; calling it at startup is a known anti-pattern. Defer to a user command ([Language Model API](https://code.visualstudio.com/api/extension-guides/ai/language-model)).

6. **`retainContextWhenHidden` is a memory footgun.** It keeps the entire webview DOM/JS alive when hidden; the docs explicitly call it "high memory overhead." Prefer serializing state and restoring on reveal for anything but small, stateful panels ([Webview API guide](https://code.visualstudio.com/api/extension-guides/webview)).

7. **Webview resources break without `asWebviewUri` + `localResourceRoots`.** Hardcoded `file:` or relative paths fail entirely in the browser/Codespaces editor and silently in some configs; you must convert every local URI and whitelist its root ([remote extensions](https://code.visualstudio.com/api/advanced-topics/remote-extensions); [Webview API guide](https://code.visualstudio.com/api/extension-guides/webview)).

8. **Free built-in code completion is being deprioritized.** 2026 commentary reports VS Code is pushing agents while pulling back free inline completion ([DevOps.com](https://devops.com/vs-code-pushes-hard-on-ai-agents-while-quietly-killing-free-code-completion/), 2026 — *secondary source; the article body returned HTTP 403 on fetch, so treat the specific mechanics as unverified*). The portable takeaway is verified: a third party can still register its **own** `InlineCompletionItemProvider`, and multiple providers merge in parallel, so AGI's completion path does not depend on Copilot's free tier ([VS Code API reference](https://code.visualstudio.com/api/references/vscode-api)).

9. **`customoai` ("OpenAI Compatible") BYOK provider is deprecated.** New work must target the **Custom Endpoint provider**; don't build against the old `customoai` ID ([v1.121](https://code.visualstudio.com/updates/v1_121); [v1.122](https://code.visualstudio.com/updates/v1_122)).

10. **Doc "5/28/2026" stamps are build dates, not publication dates.** Every `code.visualstudio.com/api/*` page shows the same footer date; do not infer when content actually changed from it. Cross-check material claims against versioned release notes.

---

## Implications / gaps for AGI Workforce

1. **Go provider, not just consumer — and it's Marketplace-legal.** AGI's whole thesis is multi-provider BYOK routing with local-first privacy. The **Language Model Chat Provider API is stable** (`chat-model-provider-sample`: no proposed flags, `^1.104`), so AGI can surface its routed models *inside VS Code's native chat and agent picker* and **publish to the Marketplace**. This removes the need to ship a custom webview chat UI just to be present in the editor — a major scope reduction versus the assumption that BYOK requires a bespoke panel. *(Gap to confirm in repo: does `apps/extension-vscode` currently register a `languageModelChatProvider`, or only a webview/participant?)*

2. **VS Code 1.122 validates AGI's exact posture.** Air-gapped BYOK without GitHub auth + the stable Custom Endpoint provider (Chat Completions/Responses/Messages) means VS Code now *natively* supports the local + BYOK + offline model AGI built its v1 around. AGI should make sure its provider implementation honors the `silent` parameter of `provideLanguageModelChatInformation` so it never prompts for credentials unexpectedly — this is the editor-native expression of AGI's "never silently route, explicit consent" trust-boundary lock.

3. **Tools, not participants, for the agent loop.** To match the current bar (agent mode is first-class), AGI's editor capabilities should be **Language Model Tools** (auto-invoked) and/or an MCP server, not solely an `@`-participant. AGI already has an MCP/agent-harness rollout in `docs/engineering/agent-harness-rollout.md`; the VS Code surface should expose its capabilities as tools so the editor's agent can orchestrate them.

4. **Telemetry must use `TelemetryLogger` + respect `telemetry.telemetryLevel`.** AGI's lock is "telemetry off by default"; VS Code's `createTelemetryLogger` already enforces the user setting and scrubs sensitive data. If AGI ships local agent sessions, the 1.122 OpenTelemetry `github.copilot.*` convention is the emerging standard to match — but only when telemetry is explicitly enabled.

5. **Secrets: `context.secrets` is the only acceptable store** for BYOK API keys in the extension — never settings JSON, never `globalState`. This mirrors AGI's desktop OS-keychain posture and the trust-boundary separation between Local/BYOK/Managed.

6. **Pin `@types/vscode` to the supported floor (currently 1.120.0 is `latest`).** Decide AGI's `engines.vscode` minimum deliberately; supporting offline-BYOK requires `^1.122`, but a lower floor widens the install base at the cost of newer APIs. Keep `@types/vscode` ≤ that floor.

7. **Open gaps to verify against the repo (not researchable externally):**
   - Whether `apps/extension-vscode` registers a `languageModelChatProvider` vs. a webview/participant.
   - Its current `engines.vscode` and `@types/vscode` pins.
   - Whether it exposes capabilities as `languageModelTools` for agent-mode reachability.
   - Whether any code path depends on a **proposed** API (would block Marketplace publish).

---

## Sources

- Release Notes Archive (version→month mapping, current stable) — https://code.visualstudio.com/updates/archive — accessed 2026-05-29
- VS Code 1.122 release notes (air-gapped BYOK, Custom Endpoint stable, OTel agent telemetry, granular BYOK actions) — https://code.visualstudio.com/updates/v1_122 — accessed 2026-05-29 (release May 2026)
- VS Code 1.121 release notes (remote agents, AHP, Custom Endpoint provider in Insiders, utility model settings) — https://code.visualstudio.com/updates/v1_121 — release May 20 2026
- Language Model API (vscode.lm) guide — https://code.visualstudio.com/api/extension-guides/ai/language-model — accessed 2026-05-29
- Chat Participant API guide — https://code.visualstudio.com/api/extension-guides/ai/chat — accessed 2026-05-29
- Language Model Tool API guide — https://code.visualstudio.com/api/extension-guides/ai/tools — accessed 2026-05-29
- Language Model Chat Provider API guide — https://code.visualstudio.com/api/extension-guides/ai/language-model-chat-provider — accessed 2026-05-29
- AI extensibility overview (decision framework) — https://code.visualstudio.com/api/extension-guides/ai/ai-extensibility-overview — accessed 2026-05-29
- VS Code API reference (InlineCompletionItemProvider, TelemetryLogger) — https://code.visualstudio.com/api/references/vscode-api — accessed 2026-05-29
- Webview API guide (localResourceRoots, asWebviewUri, retainContextWhenHidden, CSP) — https://code.visualstudio.com/api/extension-guides/webview — accessed 2026-05-29
- SecretStorage / remote extensions advanced topics — https://code.visualstudio.com/api/advanced-topics/remote-extensions — accessed 2026-05-29
- Extension Manifest reference (engines.vscode) — https://code.visualstudio.com/api/references/extension-manifest — accessed 2026-05-29
- npm registry — @types/vscode (`dist-tags.latest` = 1.120.0, modified 2026-05-13) — https://www.npmjs.com/package/@types/vscode — accessed 2026-05-29
- microsoft/vscode-extension-samples — `chat-sample`, `chat-model-provider-sample`, `chat-context-sample` package.json (stable vs proposed verification) — https://github.com/microsoft/vscode-extension-samples — accessed 2026-05-29
- microsoft/vscode-chat-extension-utils (`sendChatParticipantRequest`) — https://github.com/microsoft/vscode-chat-extension-utils — accessed 2026-05-29
- microsoft/vscode issue #300399 (proposed-API incompatibility breaks extension) — https://github.com/microsoft/vscode/issues/300399 — accessed 2026-05-29
- microsoft/vscode issue #251580 (Custom Chat Modes / context provider proposal) — https://github.com/microsoft/vscode/issues/251580 — accessed 2026-05-29
- Visual Studio Magazine — "VS Code 1.121 Adds Remote Agents…" — https://visualstudiomagazine.com/articles/2026/05/20/vs-code-1-121-adds-remote-agents-built-in-html-and-mermaid-previews.aspx — 2026-05-20
- DevOps.com — "VS Code Pushes Hard on AI Agents While Quietly Killing Free Code Completion" (secondary; article body 403 on fetch) — https://devops.com/vs-code-pushes-hard-on-ai-agents-while-quietly-killing-free-code-completion/ — 2026
