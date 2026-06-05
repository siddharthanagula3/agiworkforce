# Competitive Research — AI Browser-Control Extension Bar (Claude in Chrome + peers)

**Topic:** AI browser-control extensions — permissions model, prompt-injection defenses, page-capture/action approvals, native messaging, side-panel UX, and Chrome MV3 constraints.
**Prepared:** 2026-05-29
**Author:** Research analyst (AGI Workforce)
**Scope:** Frames the external "current bar" against AGI Workforce's Chrome MV3 extension (`apps/extension/`, v1.2.0).
**Confidence:** Medium overall. High on Claude-in-Chrome facts and the two named vulnerabilities (primary sources, dated). Medium on peers (Comet/Atlas) — fewer primary docs. High on Chrome MV3 platform constraints (official Chrome docs).

> Verification note: every external claim below carries an inline source tag mapping to the Sources section, with publication/last-updated dates. Where a figure could only be confirmed from secondary reporting, it is marked. AGI-internal claims are sourced to repo files I read directly.

---

## Summary

As of 2026-05-29, the market for AI browser-control extensions is **in beta, not GA**, and is being actively shaped by a string of public security failures rather than by feature races. Anthropic's **Claude in Chrome** is the reference implementation: paid-only, beta, with a published two-mode permission model ("Ask before acting" / "Act without asking"), site-level allow/deny, high-risk action confirmations, blocked site categories, and quantified prompt-injection robustness metrics [S1][S2][S3]. Peers (Perplexity **Comet**, OpenAI **ChatGPT Atlas**) ship comparable agentic capability but have each been publicly broken by **indirect prompt injection** [S8][S9], and OpenAI has stated on record that prompt injection in AI browsers may never be fully "solved" [S10].

The defining lesson of the last six months is a **trust-boundary** one, not a model-quality one. Two distinct, separately-disclosed vulnerabilities hit Claude's own extension:
- **ShadowPrompt** (Koi.ai) — `*.claude.ai` subdomain over-trust chained with a DOM-XSS in an embedded Arkose CAPTCHA component; vulnerable below v1.0.41, patched Jan–Feb 2026 [S6].
- **ClaudeBleed** (LayerX) — any other extension's Main-world content script could message Claude because the extension trusted the *origin of execution* (claude.ai) rather than the *execution context*; partial fix shipped in **v1.0.70 on 2026-05-06** and was bypassed within hours [S4][S5][S7].

AGI Workforce's extension is **structurally on the right side of the ClaudeBleed class**: it does not declare `externally_connectable`, and its message router gates on `sender.id === chrome.runtime.id` plus an origin allowlist with per-record origin stamping (THREAT_MODEL §3.1, §5; `src/background/policy.ts`). AGI also already ships a per-action "Permission required" consent card (BLOCKER-02) and a categorized cookie/site blocklist. The principal gaps vs. the current bar are (1) **no published prompt-injection robustness metric or untrusted-content classifier**, and (2) the consent card is **permission-scoped**, not a dedicated **high-risk-action-category** confirmation (purchase / publish / send).

---

## Current bar (what the market / best-practice requires as of 2026-05-29)

A credible AI browser-control extension is now expected to ship all of the following. Each line is what at least one shipping competitor does today.

1. **Two-tier autonomy with an explicit "act without asking" warning.** Claude exposes "Ask before acting" (drafts a plan, lists target sites, halts on irreversible actions) and "Act without asking" — which Anthropic's own docs label *"high-risk mode"* and warn cannot guarantee Claude will request permission for sensitive transactions [S2]. Atlas is "confirmation-first" (pauses at consequential steps); Comet is "autonomy-first" (review at completion) [S9].
2. **Site-level permissions with allow-once / always-allow-on-this-site UX.** Claude shows a "Permission required" prompt with "Allow this action" (one-time) vs. "Always allow actions on this site" [S2].
3. **In-the-moment confirmation for high-risk action *categories*** — purchasing/financial transactions, publishing/sharing personal data, permanently deleting data, creating accounts, granting authorizations, inputting sensitive info — regardless of autonomy mode [S1][S2].
4. **Hard blocklist of sensitive site categories** the agent will not operate on: financial services / banking, investment & trading, crypto exchanges, adult content, pirated content [S1][S3].
5. **Universally-prohibited actions:** handling credit-card/ID data, executing financial trades, bypassing CAPTCHAs, and — critically — *"completing instructions from emails or web content"* (the indirect-injection guardrail) [S2][S3].
6. **A layered prompt-injection defense with a published robustness number.** Claude combines RL training to refuse malicious instructions, content classifiers over untrusted content, and improved system prompts; it reports **~1% attack success rate** for Opus 4.5 on an internal combined-technique test [S3], and **23.6% → 11.2%** (autonomous mode) and **35.7% → 0%** (browser-specific challenge set) before/after mitigations [S1]. Comet's stated defense is ML classifiers that run on every newly-retrieved content block, plus structured prompts that demarcate page content as untrusted [S8].
7. **Untrusted/trusted input separation as an architectural principle.** Brave's Comet disclosure makes this the headline recommendation: page contents must always be treated as untrusted and kept separate from the user's instructions in the prompt sent to the backend [S9].
8. **Admin governance for org deployments:** enable/disable org-wide, site allowlists/blocklists (Claude Team/Enterprise) [S1][S2].
9. **Sender authentication for any cross-context messaging.** The post-ClaudeBleed best practice from LayerX: validate the *sender's identity*, not just the page origin — extension-to-page auth tokens, signed/non-replayable per-action approval tokens, and restricting `externally_connectable` to specific extension IDs [S4][S5].

---

## Version-specific facts (exact versions + dates)

### Claude in Chrome — availability
- Research preview: 1,000 Max-plan users (Aug 2025 origin per secondary reporting) [S0].
- **Nov 24, 2025** — available to all **Max** subscribers [S1].
- **Dec 18, 2025** — available to **Pro, Team, Enterprise**; adds Claude Code integration + admin org controls [S1].
- Status as of mid-2026: **beta, paid plans only, not GA**; free tier not announced [S0]. Some injection vulnerabilities remain to be closed before GA [S0].

### Claude in Chrome — prompt-injection metrics (keep these distinct; different test sets)
- **~1%** attack success rate — Claude **Opus 4.5**, internal combined-known-techniques test (safety guide, **published 2026-04-27**) [S3].
- **23.6% → 11.2%** — deliberately-targeted attack success, **autonomous mode**, before/after the new mitigations (Anthropic blog) [S1].
- **35.7% → 0%** — browser-specific attack **challenge set**, before/after mitigations (Anthropic blog) [S1].

### Claude in Chrome — documented permission/safety model
- Permissions guide dated **2026-03-16**; defines "Ask before acting" vs. "Act without asking (high-risk mode)," site-level allow-once vs. always-allow, and the per-action confirmation list [S2].
- Safety article dated **2026-04-27**; lists blocked site categories and prohibited actions, and the per-domain rule that *"Claude must ask for your approval before running JavaScript on any website"* [S3].

### Vulnerability 1 — ShadowPrompt (Koi.ai) — DISTINCT from ClaudeBleed
- Root cause: extension trusted **all `*.claude.ai` subdomains**, chained with a **DOM-XSS** in the embedded **Arkose Labs CAPTCHA** at `a-cdn.claude.ai` (accepted `postMessage` without origin validation; rendered user-controlled strings via `dangerouslySetInnerHTML`). Attack delivered a prompt via `chrome.runtime.sendMessage()` with type `'onboarding_task'` [S6].
- Vulnerable: extension **< 1.0.41**. Timeline: reported **2025-12-26**; extension patched (strict `https://claude.ai` origin check) **2026-01-15**; Arkose XSS fixed **2026-02-19**; full remediation confirmed **2026-02-24** [S6].

### Vulnerability 2 — ClaudeBleed (LayerX) — DISTINCT from ShadowPrompt
- Root cause: the extension trusted the **origin of execution** (claude.ai) rather than the **execution context** — so any JS running inside claude.ai, including a **zero-permission extension's Main-world content script**, could issue privileged commands; the `externally_connectable` handler accepted and forwarded arbitrary prompts [S4][S5].
- Timeline: discovered & disclosed **2026-04-27**; Anthropic responded **2026-04-28**; partial fix shipped in **v1.0.70 on 2026-05-06** [S4][S7].
- **Patch is incomplete:** the `externally_connectable` handler was *not* removed; Anthropic added approval flows for "standard" mode only. Switching to **"Act without asking" / privileged mode** (no user notification/approval of the switch) or abusing alternative **side-panel execution flows** bypasses the fix. LayerX bypassed it within hours [S4][S5][S7].
- LayerX-recommended fixes: extension-to-page **auth tokens / cryptographically-signed requests**, restrict `externally_connectable` to specific extension IDs, bind approvals to **one-time non-replayable** per-action tokens [S4][S5].

### Peer vulnerabilities
- **Perplexity Comet** — indirect prompt injection via hidden page text / HTML comments / Reddit spoiler tags; Comet fed page content to the LLM "without distinguishing between the user's instructions and untrusted content." Reported **2025-07-25**, initial fix **2025-07-27** found incomplete **2025-07-28**, public disclosure **2025-08-20** with note it still wasn't fully mitigated (Brave) [S9]. Separately, a Comet hole was exploitable via a **calendar invite** (The Register, 2026-03-03) [S11].
- **OpenAI / ChatGPT Atlas** — OpenAI stated prompt injections against AI browsers may never be fully "solved" (Fortune, 2025-12-23) [S10].

### Chrome MV3 platform constraints (official Chrome for Developers)
- **Service worker idle timeout: 30 s of inactivity** terminates the worker; a **single request/event/API call > 5 min** terminates it; a **`fetch()` response taking > 30 s** terminates it [S12].
- Timer resets on: receiving an event, calling an extension API, WebSocket messages (Chrome 116+), offscreen-document messages (Chrome 109+), **long-lived messaging port connections (Chrome 114+)** [S12]. Global variables are lost on shutdown — persist to `chrome.storage` / IndexedDB / CacheStorage [S12].
- **`chrome.sidePanel.open()` requires a user gesture** and was added in **Chrome 116**; it loses the gesture context if called after `await`/inside a promise chain [S13]. Context menus are a reliable gesture trigger [S13].
- **Remote-hosted code is banned** in MV3; all executable code must ship in the package. CSP must allow any host you connect to; `fetch()` is preferred [S14].
- **Manifest V2 is effectively dead:** MV2 extensions disabled by default on all channels; the enterprise `ExtensionManifestV2Availability` policy is being removed (reported with Chrome 139), removing the last escape hatch [S15]. (AGI is already MV3, so this is context, not a blocker.)

### AGI Workforce extension — current state (repo, read directly)
- **MV3 v1.2.0**, `minimum_chrome_version: 132`; permissions include `activeTab, tabs, storage, nativeMessaging, alarms, contextMenus, sidePanel, scripting, cookies, notifications, tabGroups`; host permissions restricted to `http://localhost/*` + `http://127.0.0.1/*`; no `externally_connectable` declared (`apps/extension/manifest.json`).
- Hardened CSP for extension pages: `default-src 'self'; script-src 'self'; ... style-src 'self'` (M-08 resolved 2026-05-19 — dropped `'unsafe-inline'` via `<link>` + Constructable Stylesheets) (`manifest.json`).
- **Trust planes & message-router gates:** origin allowlist + `sender.id` check; extension-page-only state-mutating types; same-tab DOM-mutation restriction; per-record `createdByOrigin` provenance re-checked at fire/replay time (THREAT_MODEL §1, §3.1–3.2).
- **Per-action consent UI:** BLOCKER-02 "Permission required" card with **Allow / Deny / Always** decisions (`src/side_panel.ts:2350`), plus a blocked-site overlay that disables the composer (`src/side_panel.ts:2588`).
- **Categorized blocklist:** `BLOCKED_COOKIE_DOMAINS` covers financial/crypto/gov/healthcare via exact/suffix/substring modes — bank, paypal, venmo, chase, coinbase, binance, kraken, stripe.com, plaid.com, etc. (`src/background.ts:1726`).
- **Untrusted-page handling:** `sanitizePageText` strips invisible Unicode + runs `redactSecrets`, caps to 100 KB; page-supplied JSON size-capped; LLM markdown rendered via DOMPurify with `img` forbidden (closing the EchoLeak/CVE-2025-32711 image-exfil vector) (THREAT_MODEL §3.3–3.4, §3.12).

---

## Known pitfalls & gotchas

1. **"Trust the origin, not the sender" is the recurring root cause.** Both ShadowPrompt and ClaudeBleed reduce to authenticating a *page origin* while failing to authenticate the *actor* (a sibling extension's content script, or an XSS-injected script) [S4][S5][S6]. Any cross-context message handler must validate sender identity.
2. **A UI approval layer is not a fix for a messaging-trust bug.** ClaudeBleed's v1.0.70 added approval flows but left the `externally_connectable` handler; "Act without asking" mode bypassed it. LayerX broke it in hours [S4][S7]. Don't ship a permission *UI* as the answer to a *trust-boundary* hole.
3. **"Act without asking" / autonomous mode is where every defense degrades.** It is explicitly Anthropic's "high-risk mode" with no guarantee of permission requests [S2], and it was the ClaudeBleed bypass [S4]. If AGI ever ships an autonomous mode, the security model must hold *in that mode*, not just in confirm-first mode.
4. **Indirect prompt injection is unsolved industry-wide.** OpenAI says it may never be fully solved [S10]; Comet's fixes were repeatedly found incomplete [S9]; Claude's own best number is ~1% but non-zero [S3]. Treat *all* page content — including JSON-LD, WebMCP tool descriptions, "summarize this page" input — as hostile.
5. **Embedded third-party components widen your attack surface.** ShadowPrompt's XSS was in an Arkose CAPTCHA the extension embedded, not in Anthropic's own code [S6]. Audit subdomain trust and any embedded vendor iframes/CDNs.
6. **Markdown-image exfiltration (EchoLeak class, CVE-2025-32711).** A rendered Markdown image whose URL encodes exfiltrated data is a known LLM-output exfil vector. AGI forbids `img` in DOMPurify (THREAT_MODEL §3.3) — this should be a non-negotiable for any LLM-output renderer.
7. **MV3 service-worker death mid-task.** A 30 s-idle / 5 min-request / 30 s-fetch kill [S12] will silently abort a long agentic run. Persist state, use a long-lived port to keep alive, and design for resumption.
8. **`sidePanel.open()` gesture loss after `await`.** Open the panel synchronously in the gesture handler before any async work, or use a context menu trigger [S13].
9. **`*.subdomain` wildcards in any allowlist are dangerous.** ShadowPrompt = `*.claude.ai` over-trust [S6]. AGI already learned this internally (M-02: `validateGatewayUrl` is exact-match, rejecting `*.agiworkforce.com`) — keep exact-match discipline everywhere.

---

## Implications / gaps for AGI Workforce

**Where AGI already meets or exceeds the bar:**
- **Immune to the ClaudeBleed class by construction.** No `externally_connectable`; router requires `sender.id === chrome.runtime.id` and origin allowlisting; per-record origin stamping re-checked at fire time (THREAT_MODEL §3.1–3.2, §5). This is the exact failure that broke Claude — AGI's design forecloses it. Keep the residual-risk note (THREAT_MODEL §5) live: *if* `externally_connectable` is ever added, the sender-id gate must be extended.
- **Per-action consent UI exists** (BLOCKER-02 Allow/Deny/Always) mirroring Claude's allow-once / always-allow-on-this-site UX [S2] vs. `src/side_panel.ts`.
- **Categorized sensitive-site blocklist exists** (financial/crypto/gov/healthcare) — conceptually parallel to Claude's blocked categories [S1][S3], though AGI's is implemented as a *cookie-domain* blocklist + site overlay rather than a published policy.
- **Strong untrusted-content hygiene:** invisible-Unicode stripping, secret redaction, size caps, DOMPurify with `img` forbidden, selector-only recorder defaults (THREAT_MODEL §3.3–3.5, §3.12).

**Genuine gaps vs. the current bar (prioritized):**
1. **No published prompt-injection robustness metric or untrusted-content classifier.** Claude reports ~1% / 11.2% / 0% across named test sets [S1][S3]; Comet runs ML classifiers on retrieved content [S8]. AGI sanitizes and redacts but does not *classify-and-refuse* injected instructions, and publishes no robustness number. **Recommendation:** add an injection-classification step (even a lightweight refusal-trained system prompt + structured untrusted-content demarcation per Brave's recommendation [S9]) and a small internal browser-attack challenge set to produce a number. This is the single biggest credibility gap for a "local-first privacy" product whose differentiation is trust.
2. **Consent card is permission-scoped, not high-risk-action-category-scoped.** Claude confirms *categories* (purchase, publish, delete, share-personal-data, create-account) regardless of mode [S1][S2]. AGI's card confirms a domain/action grant. **Recommendation:** classify outgoing agent actions into high-risk categories and force confirmation on those even on an allowlisted site.
3. **No explicit "never complete instructions found in emails/web content" guardrail surfaced.** This is Claude's named indirect-injection rule [S2]. AGI treats page text as untrusted data but does not appear to have an explicit policy that *instructions embedded in page/email content are never executed.* **Recommendation:** make this an explicit, testable invariant.
4. **If AGI adds an autonomous ("act without asking") mode, the bar rises sharply.** Every competitor's defenses degrade there [S2][S4]. AGI should keep confirm-first as default and treat autonomous mode as a separate, separately-hardened trust tier — consistent with the locked rule that Local/BYOK/Managed-Cloud are distinct trust boundaries.
5. **Sender-authentication tokens are the post-ClaudeBleed gold standard.** AGI's native-messaging/local-bridge boundary already uses a pairing token (THREAT_MODEL §1 plane C, §3.11). Apply the same *signed, non-replayable* discipline [S4] to any future page-to-extension or extension-to-extension channel before it ships.
6. **MV3 lifecycle resilience for long agent runs.** Confirm long agentic tasks survive the 30 s/5 min/30 s service-worker kills [S12] via a keep-alive port and resumable state — not yet evidenced in the threat model.

**Net:** AGI's *security architecture* is ahead of Claude on the specific class that has publicly embarrassed Anthropic twice. AGI's *visible safety product* (a published injection metric, category-level high-risk confirmation, an explicit "don't execute page instructions" rule) is the area to invest in to match the marketed bar.

---

## Sources

- [S0] "Anthropic Claude for Chrome — availability" (search synthesis of Anthropic + Engadget + support docs) — https://www.engadget.com/ai/claudes-chrome-plugin-is-now-available-to-all-paid-users-221024295.html — accessed 2026-05-29 (availability/beta status; secondary).
- [S1] "Piloting Claude in Chrome / Claude for Chrome" — Anthropic (claude.com) — https://claude.com/blog/claude-for-chrome — Nov 24 2025 / Dec 18 2025 update; accessed 2026-05-29 (availability dates; 23.6%→11.2%, 35.7%→0% metrics; blocked categories; admin controls).
- [S2] "Claude in Chrome Permissions Guide" — Claude Help Center — https://support.claude.com/en/articles/12902446-claude-in-chrome-permissions-guide — dated 2026-03-16 (autonomy modes, site-level allow-once/always, per-action confirmation list, prohibited actions).
- [S3] "Using Claude in Chrome safely" — Claude Help Center — https://support.claude.com/en/articles/12902428-using-claude-in-chrome-safely — dated 2026-04-27 (RL refusal training, classifiers, ~1% Opus 4.5 ASR, blocked site categories, JS-approval rule).
- [S4] "ClaudeBleed: A Flaw In Claude's Browser Extension Allows Any Extension to Hijack It" — LayerX — https://layerxsecurity.com/blog/a-flaw-in-claudes-browser-extension-allows-any-extension-to-hijack-it/ — May 2026 (discovery 2026-04-27, fix v1.0.70 2026-05-06, externally_connectable root cause, incomplete patch, recommended token fixes).
- [S5] "Vulnerability in Claude Extension for Chrome Exposes AI Agent to Takeover" — SecurityWeek — https://www.securityweek.com/vulnerability-in-claude-extension-for-chrome-exposes-ai-agent-to-takeover/ — May 2026 (origin-of-execution vs context, Main-world content script, privileged-mode bypass).
- [S6] "ShadowPrompt: How Any Website Could Have Hijacked Claude's Chrome Extension" — Koi.ai — https://www.koi.ai/blog/shadowprompt-how-any-website-could-have-hijacked-anthropic-claude-chrome-extension — early 2026 (vulnerable <1.0.41; *.claude.ai over-trust + Arkose DOM-XSS; reported 2025-12-26, patched 2026-01-15, XSS fixed 2026-02-19, remediated 2026-02-24).
- [S7] "Claude's Chrome extension vulnerable to exploitation despite a fix: Report" — Business Standard — https://www.business-standard.com/technology/tech-news/claude-in-chrome-extension-vulnerable-exploitation-despite-update-126051100441_1.html — 2026-05-11 (confirms v1.0.70 partial fix, hours-to-bypass).
- [S8] "Mitigating Prompt Injection in Comet" — Perplexity (via search synthesis; primary page returned 403) — https://www.perplexity.ai/hub/blog/mitigating-prompt-injection-in-comet — 2026 (ML classifiers on retrieved content, structured untrusted-content demarcation; secondary-confirmed).
- [S9] "Agentic Browser Security: Indirect Prompt Injection in Perplexity Comet" — Brave — https://brave.com/blog/comet-prompt-injection/ — disclosed 2025-08-20 (page content fed to LLM without trusted/untrusted separation; reported 2025-07-25; recommendation to separate user instructions from page contents; Atlas confirmation-first vs Comet autonomy-first context).
- [S10] "OpenAI says prompt injections that can trick AI browsers may never be fully 'solved'" — Fortune — https://fortune.com/2025/12/23/openai-ai-browser-prompt-injections-cybersecurity-hackers/ — 2025-12-23 (Atlas/OpenAI position on unsolvability).
- [S11] "Perplexity Comet browser hole was exploitable via cal invite" — The Register — https://www.theregister.com/2026/03/03/perplexity_comet_browser_hole_cal_invite/ — 2026-03-03 (calendar-invite injection vector).
- [S12] "The extension service worker lifecycle" — Chrome for Developers — https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle — (30 s idle / 5 min request / 30 s fetch termination; keep-alive triggers incl. ports Chrome 114+).
- [S13] "chrome.sidePanel API" + "Design a superior UX with the new Side Panel API" — Chrome for Developers — https://developer.chrome.com/docs/extensions/reference/api/sidePanel — (Chrome 116 sidePanel.open(); user-gesture requirement; gesture loss after await).
- [S14] "Network requests / remote hosted code" — Chrome for Developers — https://developer.chrome.com/docs/extensions/develop/concepts/network-requests — (remote-code ban; host_permissions; CSP for connect hosts; prefer fetch()).
- [S15] "Manifest V2 support timeline" — Chrome for Developers — https://developer.chrome.com/docs/extensions/develop/migrate/mv2-deprecation-timeline — (MV2 disabled by default; ExtensionManifestV2Availability enterprise policy removal, reported Chrome 139; secondary-synthesized date).
- [INT] AGI repo (read directly 2026-05-29): `apps/extension/manifest.json`, `apps/extension/THREAT_MODEL.md`, `apps/extension/src/background/policy.ts`, `apps/extension/src/background.ts` (BLOCKED_COOKIE_DOMAINS ~L1726), `apps/extension/src/side_panel.ts` (permission card ~L2350, blocked-site overlay ~L2588).

---

### Confidence & caveats
- **High:** Claude-in-Chrome permission/safety model and dates (primary Anthropic docs); ClaudeBleed and ShadowPrompt technical details and dates (primary LayerX + Koi.ai, corroborated by SecurityWeek/Business Standard); Chrome MV3 service-worker and side-panel constraints (official Chrome docs); AGI's current state (read directly).
- **Medium:** Comet/Atlas defense specifics — Perplexity's own blog (S8) returned 403, so its claims are secondary-confirmed via Brave (S9) and search synthesis; Atlas internals are sparse in primary form.
- **Lower:** Exact Chrome-version pin for MV2 enterprise-policy removal (S15) is from search synthesis, not a fresh fetch of the official timeline page — treat "Chrome 139" as approximate. Claude's Aug-2025 research-preview origin date (S0) is secondary.
