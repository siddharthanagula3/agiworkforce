---
id: "COMP-usage-limits"
type: "competitor-trace"
title: "Usage limits"
competitor_evidence_reviewed: "2026-11-22"
basis: "official competitor pages saved 2026-11-22; AGI status from code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Usage limits: competitors to requirements

Usage limits are mostly built for AGI's managed cloud on web, desktop and CLI. Mobile hides purchases by owner decision, and Chrome and VS Code send buying to the web. Gaps: auto-resume after a reset, a "now using credits" notice, per-member and group caps, admin requests for more usage, per-chat cost, and sharing the plan with outside apps. Web Free denial messages and Premium limit-denial paths were seen failing. Local mode behaviour is not documented.

**How the products divide this topic.** Review date for all competitor evidence: 2026-11-22. Claude (chat on web, desktop, mobile) and Claude Code (terminal, IDE, Code tab) share ONE allowance per account on Pro, Max and Ultra: a five-hour window, a weekly window, and a separate weekly cap for the newest top-tier model family. Verified Ultra accounts have no five-hour window. Usage credits (pay as you go at API rates) extend past limits; Max and Ultra monthly API credits are separate and do not cover the apps or interactive Claude Code. Team and seat-based Enterprise use admin-controlled credits and spend limits. ChatGPT chat is described as unlimited text chat under abuse guardrails, with limited uploads, images, voice and research on lower plans. The measured allowances are mostly for Codex and ChatGPT Work (the coding and agent products), which share one pool with Excel, Word and PowerPoint add-ins: five-hour and weekly windows on Plus and Business Standard, a monthly allowance on Go, weekly only on Pro, credits beyond that, and one-time or banked resets. Codex pages describe the separate coding tool, but it signs in with the ChatGPT plan and shares its allowance. Claude Code pages describe the coding tool; it connects to Claude through the same plan allowance. Many items are Pro/Max/Ultra, Plus/Pro, Team/Enterprise or Business/Enterprise only; plans are noted per item. The catalogue does not show ChatGPT per-message chat caps for Plus beyond 'caps vary with demand'. AGI facts come from code reading (comparison CSVs, capability ledger area 82, docs/product) except where a scorecard or defect file says a person saw it. The AGI plan names (Basic, Premium, Max, Ultra) differ from competitor plan names.

Each capability below is traced: competitor evidence, AGI requirement, current implementation, gap, acceptance criteria, verification. Competitor behaviour comes only from the cited pages, reviewed 2026-11-22.

| ID | Capability | Claude | ChatGPT | AGI today | Verified |
|---|---|---|---|---|---|
| [CAP-usage-limits-01](#cap-usage-limits-01) | Rolling session window (five hours) | yes | partly | built | seen working by a person |
| [CAP-usage-limits-02](#cap-usage-limits-02) | Weekly all-model window | yes | partly | built | seen working by a person |
| [CAP-usage-limits-03](#cap-usage-limits-03) | Separate weekly cap for the top model family | yes | partly | partly built | code inspected only |
| [CAP-usage-limits-04](#cap-usage-limits-04) | Top tier without a session cap | yes | partly | built | code inspected only |
| [CAP-usage-limits-05](#cap-usage-limits-05) | Monthly billing-period allowance | unknown | partly | built | seen failing by a person |
| [CAP-usage-limits-06](#cap-usage-limits-06) | Fixed reset time and countdown | yes | yes | built | seen working by a person |
| [CAP-usage-limits-07](#cap-usage-limits-07) | One allowance shared across apps | yes | yes | built | code inspected only |
| [CAP-usage-limits-08](#cap-usage-limits-08) | Explaining what drains usage | yes | yes | built | code inspected only |
| [CAP-usage-limits-09](#cap-usage-limits-09) | Faster mode costs more allowance | yes | yes | partly built | code inspected only |
| [CAP-usage-limits-10](#cap-usage-limits-10) | Warning before a limit | yes | unknown | partly built | not verified |
| [CAP-usage-limits-11](#cap-usage-limits-11) | Limit reached message with reset and options | yes | yes | partly built | seen failing by a person |
| [CAP-usage-limits-12](#cap-usage-limits-12) | Current turn finishes at the limit | yes | yes | built | code inspected only |
| [CAP-usage-limits-13](#cap-usage-limits-13) | Wait and auto-continue after reset | partly | unknown | partly built | code inspected only |
| [CAP-usage-limits-14](#cap-usage-limits-14) | Usage credits to continue past limits | yes | yes | built | code inspected only |
| [CAP-usage-limits-15](#cap-usage-limits-15) | Buy extra usage credits | yes | yes | partly built | code inspected only |
| [CAP-usage-limits-16](#cap-usage-limits-16) | Automatic credit reload | yes | yes | built | code inspected only |
| [CAP-usage-limits-17](#cap-usage-limits-17) | Monthly spend limit on credits | yes | yes | built | code inspected only |
| [CAP-usage-limits-18](#cap-usage-limits-18) | Credit expiry, refund and transfer rules | yes | yes | partly built | code inspected only |
| [CAP-usage-limits-19](#cap-usage-limits-19) | Notice that a turn now runs on credits | yes | unknown | not built | not verified |
| [CAP-usage-limits-20](#cap-usage-limits-20) | Usage dashboard with history | yes | yes | built | seen working by a person |
| [CAP-usage-limits-21](#cap-usage-limits-21) | Per-chat and per-task cost | yes | yes | partly built | code inspected only |
| [CAP-usage-limits-22](#cap-usage-limits-22) | Usage in the terminal and editor | yes | yes | partly built | code inspected only |
| [CAP-usage-limits-23](#cap-usage-limits-23) | What drains the plan, with recommendations | yes | unknown | partly built | not verified |
| [CAP-usage-limits-24](#cap-usage-limits-24) | Limit resets | yes | yes | partly built | code inspected only |
| [CAP-usage-limits-25](#cap-usage-limits-25) | Alternative model or reserve at a limit | unknown | yes | built | code inspected only |
| [CAP-usage-limits-26](#cap-usage-limits-26) | Free plan allowance and display | yes | yes | off by decision | seen failing by a person |
| [CAP-usage-limits-27](#cap-usage-limits-27) | Org, seat and per-user spend limits | yes | yes | partly built | code inspected only |
| [CAP-usage-limits-28](#cap-usage-limits-28) | Request more usage and see who is blocked | yes | yes | not built | not verified |
| [CAP-usage-limits-29](#cap-usage-limits-29) | Spend alerts at thresholds | yes | yes | partly built | code inspected only |
| [CAP-usage-limits-30](#cap-usage-limits-30) | Let connected apps spend plan usage | unknown | yes | not built | not verified |
| [CAP-usage-limits-31](#cap-usage-limits-31) | Usage report download and billing discrepancy report | unknown | partly | built | code inspected only |
| [CAP-usage-limits-32](#cap-usage-limits-32) | Local and BYOK use outside managed windows | no | partly | unknown | not verified |

## CAP-usage-limits-01 Rolling session window (five hours)

A short allowance that starts at the first message and resets five hours later, shown as a bar with a reset time.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude and Claude Code (shared pool): yes**
  - [https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work](https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work): Paid plans have a session limit starting at the first message and resetting five hours later; progress shows in Settings > Usage [2026-11-22] Plans: Paid plans. Apps: web, desktop, ios, android, cli.
- **ChatGPT Codex and Work (coding and agent products), not plain chat: partly**
  - [https://help.openai.com/en/articles/20001498-how-resets-work-in-codex](https://help.openai.com/en/articles/20001498-how-resets-work-in-codex): Plus and Business Standard have five-hour and weekly allowances; Go has a monthly allowance; Pro tiers have a weekly allowance [2026-11-22] Plans: Go, Plus, Business, Pro. Apps: desktop, cli.
  - [https://learn.chatgpt.com/docs/pricing.md](https://learn.chatgpt.com/docs/pricing.md): Included usage estimates per five-hour window for Plus and Standard Business; Pro has no five-hour limit [2026-11-22] Plans: Plus, Business, Pro. Apps: desktop, cli.

**AGI requirement** (stated requirement; source: docs/product/definition.md (usage windows paragraph, line 393) and docs/product/commercial.md). Managed cloud usage is enforced as overlapping rolling windows including a five-hour window, shown as a percentage bar with reset time on every surface that has a usage view.

**With different models, providers and the one subscription.** One window meter is read from the one AGI Subscription for every managed model and provider; the window is spend based, so a cheap model drains it slower. Local on-device models and BYOK turns are not counted in managed windows (BYOK is billed by the provider).

**Current implementation, as this trace read it on 2026-11-24: built.** Web, desktop, mobile, CLI, VS Code and Chrome read the same server windows; Free shows Upgrade only by decision. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S82.03, S82.17
- Comparison list ids: none matched; rows without an id: comparison-web: Usage page: current session limit bar; comparison-cli: Usage limits on the plan: rolling five-hour window plus weekly limit; comparison-mobile: Meter of current usage with reset time
- Code: `packages/contracts/types/src/managed-usage-limits.ts:63`; `apps/web/lib/server/rolling-usage.ts:40`; `apps/web/features/settings/sections/UsageSection.tsx:542`; `apps/cli/src/usage_summary.rs:232`

**Gap.** Mobile Free and Free on other apps show text only by decision. No known gap in windows themselves; see limit-reached and Local-mode items.

**Acceptance criteria**

1. On a paid account, send one message; the session bar rises and shows a reset time within five hours of the first message.
2. The same percentage appears in web Usage, the CLI /usage and the mobile Usage page.
3. On the top tier, no session bar is shown and the weekly bar is.

**Verification: seen working by a person.** 5-results/basics/scorecards/web.csv W-19 subscribed: Basic account Usage showed 10 per 5 hours, bars moved 0.2 to 0.4 credits after one request, sidebar meter followed. Other apps: code inspected only.

## CAP-usage-limits-02 Weekly all-model window

A longer allowance across all models that resets at a fixed account-specific time.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude and Claude Code: yes**
  - [https://support.claude.com/en/articles/8325606-what-is-the-pro-plan](https://support.claude.com/en/articles/8325606-what-is-the-pro-plan): Five-hour session limit plus a weekly all-model limit that resets at an account-fixed time (see Settings Usage) [2026-11-22] Plans: Pro. Apps: web, desktop, ios, android.
- **ChatGPT Codex and Work: partly**
  - [https://help.openai.com/en/articles/20001498-how-resets-work-in-codex](https://help.openai.com/en/articles/20001498-how-resets-work-in-codex): Plus, Business Standard and Pro tiers have weekly allowances [2026-11-22] Plans: Plus, Business, Pro. Apps: desktop, cli.

**AGI requirement** (stated requirement; source: docs/product/definition.md line 393). A rolling weekly spend window is enforced and displayed with reset time on every surface.

**With different models, providers and the one subscription.** Window is provider-neutral spend; applies only to managed cloud turns. Local and BYOK are outside it.

**Current implementation, as this trace read it on 2026-11-24: built.** Built on all apps that show usage; Chrome shows a percentage in the account menu. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S82.03, S82.17
- Comparison list ids: none matched; rows without an id: comparison-web: Usage page: weekly limit bar; comparison-mobile: Weekly usage limit with reset date
- Code: `apps/web/lib/server/rolling-usage.ts:40`; `apps/web/features/settings/sections/UsageSection.tsx:121`; `apps/mobile/src/features/settings/cloud-usage/index.tsx:300`

**Gap.** none known

**Acceptance criteria**

1. Usage shows a weekly bar with a reset time.
2. Usage ages out from its original timestamp, not a fixed daily bucket.

**Verification: seen working by a person.** Web scorecard W-19 subscribed: week bar present and correct on Basic. Other apps code inspected only.

## CAP-usage-limits-03 Separate weekly cap for the top model family

A sub-limit so heavy use of the strongest models cannot drain the whole weekly allowance.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude and Claude Code: yes**
  - [https://support.claude.com/en/articles/11049741-what-is-the-max-plan](https://support.claude.com/en/articles/11049741-what-is-the-max-plan): Max has a five-hour limit, a weekly all-model limit and a separate weekly limit for the newest top-tier model family, resetting at a fixed account-specific time [2026-11-22] Plans: Max, Ultra. Apps: web, desktop, ios, android.
  - [https://claude.com/pricing](https://claude.com/pricing): Top-tier model included up to half the weekly limit on Max and Ultra; Pro gets it only through usage credits [2026-11-22] Plans: Pro, Max, Ultra. Apps: web.
- **ChatGPT (chat) Pro: partly**
  - [https://help.openai.com/en/articles/9793128-about-chatgpt-pro-tiers](https://help.openai.com/en/articles/9793128-about-chatgpt-pro-tiers): Chat has weekly Pro-model message limits separate from Work and Codex allowance [2026-11-22] Plans: Pro.

**AGI requirement** (stated requirement; source: docs/product/definition.md line 393 (flagship rolling-week window, 30% of weekly)). A flagship sub-limit exists inside the weekly window and is shown as its own bar.

**With different models, providers and the one subscription.** Which models count as flagship comes from the model catalog family slots, not call sites; works across providers. Local models never count.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Enforced server side; web shows one extra bar, not one row per model. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S82.04
- Comparison list ids: WP32
- Code: `apps/web/features/settings/sections/UsageSection.tsx:370`; `apps/web/lib/server/rolling-usage.ts:40`; `packages/contracts/types/src/managed-usage-limits.ts:250`

**Gap.** No per-model rows; the model picker does not say which models fall under the sub-limit (not verified).

**Acceptance criteria**

1. Use a flagship model until the flagship bar fills; the all-model bar still has room and a non-flagship model still answers.
2. The blocked message names the flagship limit and offers an eligible alternative model.

**Verification: code inspected only.** Not seen by a person; the window-nearly-full test account was not in the intended state (6-defects W-19).

## CAP-usage-limits-04 Top tier without a session cap

The highest individual plan has no five-hour window, only weekly limits.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude and Claude Code: yes**
  - [https://support.claude.com/en/articles/17728952-what-is-the-ultra-plan](https://support.claude.com/en/articles/17728952-what-is-the-ultra-plan): Verified Ultra accounts have no five-hour limit (a temporary one applies until verification); weekly all-model limit plus separate top-tier weekly limit [2026-11-22] Plans: Ultra. Apps: web, desktop, ios, android.
- **ChatGPT Codex/Work: partly**
  - [https://learn.chatgpt.com/docs/pricing.md](https://learn.chatgpt.com/docs/pricing.md): Pro has no five-hour limit; weekly limits may apply [2026-11-22] Plans: Pro. Apps: desktop, cli.

**AGI requirement** (stated requirement; source: docs/product/commercial.md 'Plan Presentation And Usage Windows'). The top tier has no session cap; clients omit the session meter and say that missing is not unlimited.

**With different models, providers and the one subscription.** Same entitlement for every app; weekly and monthly caps still bind.

**Current implementation, as this trace read it on 2026-11-24: built.** Contract returns a null session cap; clients hide the bar. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S82.03
- Comparison list ids: none matched
- Code: `packages/contracts/types/src/managed-usage-limits.ts:63`; `docs/product/commercial.md:109`

**Gap.** Claude verifies the account before lifting the cap; AGI has no such verification step (not found).

**Acceptance criteria**

1. On the top tier the Usage page shows no session bar.
2. Pricing copy never says unlimited.

**Verification: code inspected only.** No person run found.

## CAP-usage-limits-05 Monthly billing-period allowance

An allowance bounded by the billing period in addition to rolling windows.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT Codex (Go) and Enterprise per-user limits: partly**
  - [https://help.openai.com/en/articles/20001498-how-resets-work-in-codex](https://help.openai.com/en/articles/20001498-how-resets-work-in-codex): Go has a monthly allowance [2026-11-22] Plans: Go. Apps: desktop, cli.
  - [https://help.openai.com/en/articles/20001001-manage-usage-limits-and-overages-in-chatgpt-enterprise-and-edu](https://help.openai.com/en/articles/20001001-manage-usage-limits-and-overages-in-chatgpt-enterprise-and-edu): Monthly per-user limits with usage period monthly UTC or billing-cycle aligned [2026-11-22] Plans: Enterprise, Edu. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/commercial.md 'Allowance And Purchased Balance Are Distinct Entitlements'). A billing-period allowance with a hard edge is enforced and shown; a turn whose estimate exceeds what remains goes to credits or is refused.

**With different models, providers and the one subscription.** Spend-based so any provider counts the same; Local and BYOK excluded.

**Current implementation, as this trace read it on 2026-11-24: built.** Billing-period meter on web, mobile, CLI. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S82.02, S82.03
- Comparison list ids: none matched; rows without an id: comparison-cli: Usage limits on the plan
- Code: `apps/web/lib/services/managed-usage-summary-service.ts:123`; `apps/web/features/settings/sections/UsageSection.tsx:575`

**Gap.** Web scorecard saw a Premium test account denied with 'billing period ended ... no credits' while Billing said Active with no renewal date (6-defects W-12, W-14, W-19).

**Acceptance criteria**

1. Usage shows used, left and the period end.
2. A lapsed period shows a clear renewal message with an action, not 'Error:' text.

**Verification: seen failing by a person.** 6-defects/web-problems-seen-in-browser.csv W-19 subscribed: raw 'Error: Your plan's billing period ended on Nov 19, 2026' with Billing showing Active.

## CAP-usage-limits-06 Fixed reset time and countdown

Each window shows when it resets, at an account-fixed time.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12466728-troubleshoot-claude-error-messages](https://support.claude.com/en/articles/12466728-troubleshoot-claude-error-messages): Without credits, a limit message states when the five-hour or weekly limit resets [2026-11-22]
- **ChatGPT and Codex: yes**
  - [https://help.openai.com/en/articles/9793128-about-chatgpt-pro-tiers](https://help.openai.com/en/articles/9793128-about-chatgpt-pro-tiers): At a model limit it is unavailable until reset time (shown when known) [2026-11-22] Plans: Pro.

**AGI requirement** (inferred; source: competitor parity; docs/product/competitive-guidance.md item 46). Every window shows a reset time or countdown.

**With different models, providers and the one subscription.** Times come from the account's windows, not the model.

**Current implementation, as this trace read it on 2026-11-24: built.** Web, mobile, CLI, VS Code, Chrome. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S82.17
- Comparison list ids: none matched; rows without an id: comparison-chrome: Usage limit message with reset time and a way to get more
- Code: `apps/web/features/settings/sections/UsageSection.tsx:121`; `apps/cli/src/usage_summary.rs:338`

**Gap.** Web Usage 'Last updated' lags the data (6-defects W-19).

**Acceptance criteria**

1. Each bar shows a reset time.
2. After a new request the Last updated stamp changes.

**Verification: seen working by a person.** Web scorecard W-19: reset times shown; minor stale 'Last updated' defect seen.

## CAP-usage-limits-07 One allowance shared across apps

All surfaces draw from the same pool.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude and Claude Code: yes**
  - [https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work](https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work): claude.ai, Claude Code and Desktop draw from one allowance affected by length, features, model and effort level [2026-11-22] Apps: web, desktop, ios, android, cli.
- **ChatGPT Codex, Work and add-ins: yes**
  - [https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan): Codex, Work, ChatGPT for Excel and Workspace Agents share one allowance/credit pool [2026-11-22] Plans: All plans. Apps: cli, desktop.

**AGI requirement** (stated requirement; source: docs/product/commercial.md 'Subscription Ownership Across The Suite'). One AGI Subscription allowance serves every app; no app keeps its own copy.

**With different models, providers and the one subscription.** The pool counts managed turns for any model or provider; Local and BYOK do not draw on it.

**Current implementation, as this trace read it on 2026-11-24: built.** Same account balance on all six apps. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S82.01
- Comparison list ids: none matched; rows without an id: comparison-web: One usage pool across web, desktop, mobile and code; comparison-cli: CLI usage counts against the same allowance; comparison-vscode: One usage pool shared by the editor and the apps
- Code: `apps/web/app/api/me/route.ts:139`; `apps/cli/src/usage_summary.rs:232`

**Gap.** Chrome definition says no usage dashboard; comparison says an account-menu meter exists (docs conflict).

**Acceptance criteria**

1. Send from web and CLI; both Usage views show the combined total.
2. Browser tasks in Chrome appear in the same total.

**Verification: code inspected only.** No cross-app person run found.

## CAP-usage-limits-08 Explaining what drains usage

Help text and per-turn cost that show how model, length, tools and effort change use.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work](https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work): Thinking toggle and effort level reduce usage; disable unneeded connectors or web search [2026-11-22] Apps: web, desktop, ios, android.
- **ChatGPT Pro tiers; Codex: yes**
  - [https://help.openai.com/en/articles/9793128-about-chatgpt-pro-tiers](https://help.openai.com/en/articles/9793128-about-chatgpt-pro-tiers): Allowance use depends on model, context size, reasoning, tool use, retrieval, caching and speed mode [2026-11-22] Plans: Pro.
  - [https://learn.chatgpt.com/docs/pricing.md](https://learn.chatgpt.com/docs/pricing.md): Tips to stretch usage: shrink prompts, limit sources, disable unused MCP servers [2026-11-22]

**AGI requirement** (inferred; source: competitor parity; competitive-guidance.md item 46). Users can see what costs more and each settled turn's credits.

**With different models, providers and the one subscription.** Because routing picks the model, the picker shows an estimate per model; Local shows no cost.

**Current implementation, as this trace read it on 2026-11-24: built.** Per-turn credits and picker estimates; mobile explainer sheet. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S82.22, S82.23
- Comparison list ids: none matched; rows without an id: comparison-web: What drains usage limits is explained and shown per turn; comparison-mobile: Explain what the usage limits mean
- Code: `apps/web/app/api/usage/estimate/route.ts:111`; `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4936`

**Gap.** Deep Research estimate says none on Auto (code-audit-defects web-C).

**Acceptance criteria**

1. Model picker shows estimated credits per message.
2. A settled turn shows its credits.

**Verification: code inspected only.** No person run of estimates found.

## CAP-usage-limits-09 Faster mode costs more allowance

A speed option draws allowance at a higher rate.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/fast-mode.md](https://code.claude.com/docs/en/fast-mode.md): On hitting the fast rate limit it falls back to standard speed and re-enables after cooldown; running out of credits retries at standard speed [2026-11-22] Apps: cli.
- **ChatGPT Codex/Work: yes**
  - [https://learn.chatgpt.com/docs/pricing.md](https://learn.chatgpt.com/docs/pricing.md): Fast costs about 2x to 2.5x included usage; Ultrafast uses 6x to 8x [2026-11-22] Plans: Pro, Enterprise, Edu (Ultrafast).

**AGI requirement** (inferred; source: competitor parity). A speed option, if offered, states its extra cost and is checked against allowance.

**With different models, providers and the one subscription.** Multipliers live in the model catalog per provider route; not offered for Local.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web Fast toggle checked against allowance; CLI /fast with credit note, no higher tier. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: CP12; rows without an id: comparison-web: Fast mode costs more allowance than Standard
- Code: `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4936`

**Gap.** No tier-gated higher speed level (CP12).

**Acceptance criteria**

1. Turning Fast on shows its cost note.
2. Fast is refused with a clear reason when allowance is short.

**Verification: code inspected only.** No person run found.

## CAP-usage-limits-10 Warning before a limit

A banner or notice as usage nears a window cap.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude and Claude Code: yes**
  - [https://support.claude.com/en/articles/12466728-troubleshoot-claude-error-messages](https://support.claude.com/en/articles/12466728-troubleshoot-claude-error-messages): Approaching session or weekly limit warnings appear, showing percent used when available [2026-11-22]
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (stated requirement; source: docs/product/definition.md line 393 (warn at 80%)). Users are warned before a window cap, on every app.

**With different models, providers and the one subscription.** Warning depends on the managed meter; in Local mode no warning is needed.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, mobile, VS Code, Chrome warn; CLI warns for windows but not for spend caps. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S82.24
- Comparison list ids: C24, WP31; rows without an id: comparison-web: Limit warnings before the cap
- Code: `apps/web/features/chat/pages/WebChatPage.tsx:1396`; `apps/mobile/src/features/chat/components/UsageLimitBanner.tsx:20`; `apps/cli/src/models/streaming.rs:111`; `apps/extension/src/side_panel.ts:549`

**Gap.** Threshold differs between docs (80% in definition, 75% in the Chrome row); no separate credit-alert notification (WP31); CLI spend cap warnings missing (C24).

**Acceptance criteria**

1. At the warning threshold a banner appears with percent used.
2. Banner clears after the window resets.

**Verification: not verified.** The nearly-full test account was not in state (6-defects W-19).

## CAP-usage-limits-11 Limit reached message with reset and options

A blocked state that names the limit, the reset time and what to do.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12466728-troubleshoot-claude-error-messages](https://support.claude.com/en/articles/12466728-troubleshoot-claude-error-messages): Without credits, a message states when the five-hour or weekly limit resets; with credits on, wording says it continues with usage credits [2026-11-22] Plans: Pro, Max, Ultra.
- **ChatGPT Pro and Codex: yes**
  - [https://help.openai.com/en/articles/9793128-about-chatgpt-pro-tiers](https://help.openai.com/en/articles/9793128-about-chatgpt-pro-tiers): At a model limit it is unavailable until reset time; limits cannot be raised or bypassed in settings; support cannot reset them [2026-11-22] Plans: Pro.
  - [https://learn.chatgpt.com/docs/pricing.md](https://learn.chatgpt.com/docs/pricing.md): At the limit a turn in progress may continue; Plus and Pro can buy credits; API key allowed for extra local chats [2026-11-22]

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 16.5 and AGENTS.md section 6 (no silent move from Local to cloud)). At a limit the user sees which limit stopped them, when it resets, and the choices: wait, buy credits where allowed, upgrade, or switch to an eligible model. A Local model is offered when installed.

**With different models, providers and the one subscription.** The message comes from the shared server policy so every provider route gives the same text. Moving a Local chat to a managed model or BYOK is an explicit fork with consent.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Built on all apps per ledger; web shows failures in the browser. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S82.25, S82.26, S82.27
- Comparison list ids: none matched; rows without an id: comparison-web: Out-of-usage banner with add credits and upgrade; comparison-cli: Limit-reached message names when it resets; comparison-mobile: Limit-reached message with the reset time in chat
- Code: `apps/web/features/chat/components/InlinePaywallCard.tsx:386`; `apps/web/lib/services/managed-usage-request-service.ts:392`; `apps/cli/src/errors.rs:373`

**Gap.** Seen failing on web: raw 'Error:' text with no Upgrade path (W-19); Free banner shown after Stop although the limit was not reached (W-19); image send at the limit fails silently (W-7); banner stale until reload (W-7).

**Acceptance criteria**

1. Exhaust a window; the message names it and the reset time and offers actions.
2. Stopping an answer never shows a limit banner.
3. An image or media send at a limit shows the same message, not an empty reply.

**Verification: seen failing by a person.** 6-defects/web-problems-seen-in-browser.csv W-19 (free and subscribed) and W-7 (subscribed).

## CAP-usage-limits-12 Current turn finishes at the limit

A turn already running is allowed to finish instead of being cut off.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code (on the shared plan): yes**
  - [https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-max-or-ultra-plan](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-max-or-ultra-plan): When the five-hour limit hits mid-response Claude Code may finish the step in progress; Pro once per week, Max each time; rolling out gradually [2026-11-22] Plans: Pro, Max, Ultra. Apps: cli.
- **ChatGPT Codex: yes**
  - [https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan): On allowance or credit plans the current turn can finish under fair use [2026-11-22]

**AGI requirement** (stated requirement; source: docs/decisions/2026-09-27-founder-decisions.md D-2026-10-25-01). The turn that crosses a window finishes on the plan; later turns go to credits or stop.

**With different models, providers and the one subscription.** Server admission rule, provider neutral; the monthly edge stays hard.

**Current implementation, as this trace read it on 2026-11-24: built.** Server rule applies to all managed turns. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: C13
- Code: `docs/product/commercial.md:243`; `docs/decisions/2026-09-27-founder-decisions.md:475`

**Gap.** CLI comparison row C13 says no grace allowance found; code and decision rank higher, so the row may be stale (not checked in the CLI).

**Acceptance criteria**

1. With one percent left, one long turn completes; the next is refused or goes to credits.

**Verification: code inspected only.** Decision and comparison disagree; no person run.

## CAP-usage-limits-13 Wait and auto-continue after reset

Blocked work resumes by itself when the limit resets, or the user is notified.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code only: partly**
  - [https://code.claude.com/docs/en/workflows.md](https://code.claude.com/docs/en/workflows.md): On a claude.ai subscription an interactive terminal or Code-tab run waits for the limit to reset (within 24 h, max two waits) and continues; needs autoContinueAtUsageLimit [2026-11-22] Plans: All paid plans, API. Apps: cli.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (inferred; source: competitor parity (one competitor, coding tool only)). A user can choose to be notified, or have blocked work resume, after reset.

**With different models, providers and the one subscription.** Resume must not switch model or provider silently.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Notify me when it resets on web and mobile; no auto-resume anywhere. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S82.28
- Comparison list ids: C16, C27, WP25
- Code: `apps/web/app/api/usage/reset-reminder/route.ts:1`; `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`

**Gap.** No resume-after-reset preference on any app.

**Acceptance criteria**

1. At a limit, Notify me sends a notice at reset time.
2. If auto-resume is on, the stopped task continues after reset with the same model.

**Verification: code inspected only.** No person run.

## CAP-usage-limits-14 Usage credits to continue past limits

An opt-in setting that keeps work going at a pay-as-you-go rate after a window is used up.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude and Claude Code: yes**
  - [https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans](https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans): Paid plans can switch to consumption pricing at standard API rates once a limit is used up instead of being blocked; toggle in Settings > Usage; credits cover Claude Code, Research and project content [2026-11-22] Plans: Pro, Max, Ultra. Apps: web, cli.
- **ChatGPT (Codex, Work, Office add-ins): yes**
  - [https://help.openai.com/en/articles/12642688-using-credits-for-flexible-usage-in-chatgpt-personal-plans](https://help.openai.com/en/articles/12642688-using-credits-for-flexible-usage-in-chatgpt-personal-plans): Credits cover Codex, ChatGPT Work and Office add-ins after included usage is spent; credits do not unlock unavailable models [2026-11-22] Plans: Free, Go, Plus, Pro (Free and Go limited group). Apps: web.

**AGI requirement** (stated requirement; source: docs/product/commercial.md 'Allowance And Purchased Balance'; decision D-2026-10-25-02). Credits are used only when the user has turned usage credits on; purchased credits are never spent while off.

**With different models, providers and the one subscription.** One credit ledger for all managed models and providers. Local is free and never uses credits; BYOK pays the provider.

**Current implementation, as this trace read it on 2026-11-24: built.** Web and desktop built; CLI, VS Code, Chrome point to web; mobile off by decision (no native purchases). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S82.29
- Comparison list ids: none matched; rows without an id: comparison-web: Usage credits to continue past a limit; comparison-mobile: Usage credits switch
- Code: `apps/web/app/api/billing/top-up/route.ts:164`; `apps/web/features/chat/lib/quotaPaywallSlot.ts:61`

**Gap.** Sales are closed before 2027-01-01 by owner decision, but the gate is a runtime flag plus access codes (code-audit-defects web-A).

**Acceptance criteria**

1. With credits off, a limit blocks and purchased balance is untouched.
2. With credits on, the next turn runs on credits and is tagged as overage.

**Verification: code inspected only.** No person run of credit spend found.

## CAP-usage-limits-15 Buy extra usage credits

Buy credits in chosen amounts, with price and expiry shown.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans](https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans): Choose an amount in Buy usage credits; expiration date shown before confirming; mobile apps can buy where in-app purchase is available [2026-11-22] Plans: Pro, Max, Ultra. Apps: web, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/12642688-using-credits-for-flexible-usage-in-chatgpt-personal-plans](https://help.openai.com/en/articles/12642688-using-credits-for-flexible-usage-in-chatgpt-personal-plans): Bought in Settings > Usage or Codex Usage & Billing with a custom amount option [2026-11-22] Plans: Free, Go, Plus, Pro. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/definition.md (top-up rules) and docs/product/requirements.md (mobile v1 has no purchase or top-up control)). Eligible paid accounts buy credits where they hit the limit; mobile v1 sells nothing.

**With different models, providers and the one subscription.** Credits pay for managed use only; they never buy Local or BYOK use.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and desktop built; CLI, VS Code, Chrome open web billing; mobile off by decision. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S82.29
- Comparison list ids: none matched; rows without an id: comparison-web: Buy credits in preset amounts; comparison-mobile: Buy extra usage credits; comparison-cli: Buy extra usage credits when a limit is hit
- Code: `apps/web/app/api/billing/top-up/route.ts:164`; `packages/contracts/types/src/billing-topups.ts:1`; `apps/web/features/settings/sections/BillingSection.tsx:942`

**Gap.** No in-extension or in-CLI purchase; first-time buyers hit the waitlist gate.

**Acceptance criteria**

1. A paid Stripe account buys credits from the limit card.
2. A store-billed or Free account sees no Buy control.
3. The limit message on mobile names the reset and does not show a buy action.

**Verification: code inspected only.** No person run.

## CAP-usage-limits-16 Automatic credit reload

Credits are bought automatically when the balance falls below a chosen level.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans](https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans): Automatically buys credits when balance falls below a chosen threshold; web only [2026-11-22] Plans: Pro, Max, Ultra. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/12642688-using-credits-for-flexible-usage-in-chatgpt-personal-plans](https://help.openai.com/en/articles/12642688-using-credits-for-flexible-usage-in-chatgpt-personal-plans): Set a minimum and target balance and optional maximum monthly spend; may fire immediately if already below minimum [2026-11-22] Plans: Plus, Pro. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 16.5 (Auto reload)). Auto-reload is opt-in with a threshold, consent text and a cap.

**With different models, providers and the one subscription.** Managed credits only.

**Current implementation, as this trace read it on 2026-11-24: built.** Web and desktop. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S82.30
- Comparison list ids: none matched; rows without an id: comparison-web: Automatic credit reload; comparison-desktop: Auto top-up of credits below a minimum
- Code: `apps/web/features/billing/components/AutoReloadPanel.tsx:184`; `apps/web/app/api/billing/auto-reload/route.ts:116`; `apps/web/lib/services/auto-reload-service.ts:1142`

**Gap.** none known

**Acceptance criteria**

1. Enable reload with a threshold; drop the balance below it; one purchase occurs.
2. Turning it off stops purchases.

**Verification: code inspected only.** No person run.

## CAP-usage-limits-17 Monthly spend limit on credits

A cap on how much a person lets credits spend each month.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans](https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans): Set a monthly cap with Adjust limit or choose Set to unlimited [2026-11-22] Plans: Pro, Max, Ultra.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/12642688-using-credits-for-flexible-usage-in-chatgpt-personal-plans](https://help.openai.com/en/articles/12642688-using-credits-for-flexible-usage-in-chatgpt-personal-plans): Optional maximum monthly spend on automatic reload [2026-11-22] Plans: Plus, Pro. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 16.5; docs/product/commercial.md). A personal monthly spend limit exists; a turn that would pass it is refused with the limit named.

**With different models, providers and the one subscription.** One limit across managed providers.

**Current implementation, as this trace read it on 2026-11-24: built.** Web card to save or remove a limit; the spend limit applies server side. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S82.31
- Comparison list ids: none matched; rows without an id: comparison-web: Monthly spend limit for credits
- Code: `apps/web/lib/services/spend-limit-service.ts:175`; `apps/web/lib/services/managed-usage-request-service.ts:347`

**Gap.** none known

**Acceptance criteria**

1. Set a limit; spend to it; the next credit turn is refused with the reason.

**Verification: code inspected only.** No person run.

## CAP-usage-limits-18 Credit expiry, refund and transfer rules

Stated lifetime and refund rules for purchased and bonus credits.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans](https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans): Credits bought on or after 7 Dec 2026 expire after 12 months; non-refundable with listed exceptions; balance usable only with an active paid plan [2026-11-22] Plans: Pro, Max, Ultra.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/12642688-using-credits-for-flexible-usage-in-chatgpt-personal-plans](https://help.openai.com/en/articles/12642688-using-credits-for-flexible-usage-in-chatgpt-personal-plans): Credits expire 12 months after purchase, do not roll over, are mostly non-refundable and not transferable [2026-11-22] Apps: web.

**AGI requirement** (stated requirement; source: docs/product/commercial.md (purchased balance table)). Expiry and non-transferability are enforced and shown per credit kind.

**With different models, providers and the one subscription.** Same ledger for all managed providers.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, desktop, mobile show expiry; purchased credits show 'No expiry date recorded' when none is set. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S82.15, S82.16
- Comparison list ids: WP19
- Code: `apps/web/features/settings/sections/UsageSection.tsx:398`; `apps/web/lib/services/managed-usage-summary-service.ts:155`

**Gap.** Expiry display gap for purchased credits.

**Acceptance criteria**

1. Each credit kind shows its expiry.
2. Purchased credit older than 12 months is excluded at the next carry.

**Verification: code inspected only.** No person run.

## CAP-usage-limits-19 Notice that a turn now runs on credits

A visible message that the next request is paid from credits.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans](https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans): The approaching-limit banner changes to 'Now using credits' once the next request runs on credits [2026-11-22] Plans: Pro, Max, Ultra.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (inferred; source: competitor parity). The user is told when a turn runs on credits.

**With different models, providers and the one subscription.** Applies to managed credit turns only.

**Current implementation, as this trace read it on 2026-11-24: not built.** No message found. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W46
- Code: none cited

**Gap.** Whole feature.

**Acceptance criteria**

1. After a window is spent with credits on, the composer shows that credits are in use.

**Verification: not verified.** Comparison row W46 only.

## CAP-usage-limits-20 Usage dashboard with history

A page with plan usage, credit balance, spend and history by period.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans](https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans): Settings > Usage shows real-time consumption, month-to-date credit spend and usage history [2026-11-22] Plans: Pro, Max, Ultra.
- **ChatGPT Work and Codex (Enterprise/Edu desktop): yes**
  - [https://help.openai.com/en/articles/20001478-reviewing-work-and-codex-usage-and-using-personal-analytics-in-chatgpt-desktop](https://help.openai.com/en/articles/20001478-reviewing-work-and-codex-usage-and-using-personal-analytics-in-chatgpt-desktop): Usage history charts (7D/30D) by surface, model, reasoning, speed; meter of used and remaining [2026-11-22] Plans: Enterprise, Edu. Apps: desktop.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 16.5 and owner decision on Free usage screens (memory: free-usage-upgrade-only; docs/product/definition.md line 123)). A Usage page shows plan, windows, credits, history and storage on every app that signs in; Free shows Upgrade only.

**With different models, providers and the one subscription.** History groups by model and provider from one ledger. Local use is not in the ledger; whether to show it is unresolved.

**Current implementation, as this trace read it on 2026-11-24: built.** Web, desktop, mobile fuller; CLI and VS Code show windows and history by workload; Chrome menu percent. Better than leaders on history and CSV. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S82.01, S82.03, S82.04, S82.05, S82.13, S82.14, S82.18, S82.19
- Comparison list ids: DP7; rows without an id: comparison-web: Usage history charts by model or product; comparison-mobile: History of where usage went
- Code: `apps/web/features/settings/sections/UsageSection.tsx:89`; `apps/web/lib/services/account-usage-history-service.ts:95`; `apps/mobile/src/features/settings/cloud-usage/index.tsx:418`

**Gap.** Mobile has no per-project usage; no split by surface (S82.21); no per-surface/speed (DP7). Voice row says 'No voice left' when nothing is used (W-19).

**Acceptance criteria**

1. Usage lists plan windows, credit balances and history by day, week and month.
2. Free sees only Upgrade.
3. Purchased and included credits are shown apart.

**Verification: seen working by a person.** Web scorecard W-19 subscribed (Basic) and free; minor defects: stale Last updated, wrong Voice row text.

## CAP-usage-limits-21 Per-chat and per-task cost

Cost of one chat or task, and a ranking of the heaviest.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/costs.md](https://code.claude.com/docs/en/costs.md): /usage shows session token use and a locally computed dollar cost, per-model usage and durations; resets on /clear [2026-11-22] Apps: cli.
- **ChatGPT Work and Codex (Enterprise/Edu desktop): yes**
  - [https://help.openai.com/en/articles/20001478-reviewing-work-and-codex-usage-and-using-personal-analytics-in-chatgpt-desktop](https://help.openai.com/en/articles/20001478-reviewing-work-and-codex-usage-and-using-personal-analytics-in-chatgpt-desktop): Top consuming chats ranked by lifetime credits; per-chat usage indicator in the chat header [2026-11-22] Plans: Enterprise, Edu. Apps: desktop.

**AGI requirement** (inferred; source: competitor parity; competitive-guidance.md item 46). Users can see what a task or chat cost, before where possible and after it finishes.

**With different models, providers and the one subscription.** Costs come from the ledger by model and provider route; Local shows no cost.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Task cost on most apps; no per-chat ranking on desktop. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S82.20, S82.22, S82.23
- Comparison list ids: D3
- Code: `packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:281`; `apps/cli/src/usage_summary.rs:347`

**Gap.** No per-chat cost or heavy-chat list (D3).

**Acceptance criteria**

1. A finished task shows its credits.
2. Usage lists the heaviest chats.

**Verification: code inspected only.** No person run.

## CAP-usage-limits-22 Usage in the terminal and editor

Slash commands and status bars showing plan windows, cost and context.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/statusline.md](https://code.claude.com/docs/en/statusline.md): Pro, Max and Ultra get used percentage and reset time for the 5-hour and weekly windows in the status line [2026-11-22] Plans: Pro, Max, Ultra. Apps: cli.
  - [https://code.claude.com/docs/en/commands.md](https://code.claude.com/docs/en/commands.md): /usage shows session cost, plan limits and activity stats; /usage-credits configures credits [2026-11-22] Plans: Pro, Max, Ultra, Team. Apps: cli.
- **ChatGPT Codex: yes**
  - [https://learn.chatgpt.com/docs/pricing.md](https://learn.chatgpt.com/docs/pricing.md): /status shows remaining limits in a CLI session [2026-11-22] Apps: cli.

**AGI requirement** (stated requirement; source: docs/product/definition.md line 123). CLI and VS Code show plan windows, reset times and session cost.

**With different models, providers and the one subscription.** The same managed meter appears for any provider; Local or BYOK sessions show tokens only.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI /usage and /status; VS Code pick list and token counter; status line has no plan window field. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S82.03, S82.10
- Comparison list ids: C17, C25, CP11, VP3
- Code: `apps/cli/src/usage_summary.rs:232`; `apps/extension-vscode/src/data/usagePresentation.ts:123`

**Gap.** No plan window in CLI status line (C25); no last-known usage when the service is down (C17); no usage bars in the VS Code chat panel (VP3); CLI shows meters to Free, breaking the Free rule (code-audit cli-B).

**Acceptance criteria**

1. CLI /usage prints windows and reset times.
2. A Free CLI account sees Upgrade only.
3. If the usage lookup fails, last known figures show with a note.

**Verification: code inspected only.** No person run of CLI or VS Code.

## CAP-usage-limits-23 What drains the plan, with recommendations

Breakdown of usage by skill, subagent, plugin or MCP server, with suggestions.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/costs.md](https://code.claude.com/docs/en/costs.md): On paid plans /usage attributes recent usage to skills, subagents, plugins and MCP servers with recommendations; press f to apply [2026-11-22] Plans: Pro, Max, Ultra, Team. Apps: cli.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: competitor parity (one competitor)). Heavy users can see which features drain the allowance.

**With different models, providers and the one subscription.** Applies to any managed model; Local runs not counted.

**Current implementation, as this trace read it on 2026-11-24: partly built.** By workload and model only. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S82.05, S82.10
- Comparison list ids: C20, C26, CP13, VP4
- Code: `apps/cli/src/usage_summary.rs:727`

**Gap.** No skill, subagent, plugin or MCP split; no /insights report.

**Acceptance criteria**

1. Usage breaks down by skill and MCP server for a coding session.

**Verification: not verified.** Comparison rows only.

## CAP-usage-limits-24 Limit resets

A reset that refills a window, one-time, saved for later, or bought.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11049741-what-is-the-max-plan](https://support.claude.com/en/articles/11049741-what-is-the-max-plan): A limit reset can restore the five-hour or weekly allowance to full [2026-11-22] Plans: Max, Ultra. Apps: web, desktop, ios, android.
- **ChatGPT Codex: yes**
  - [https://help.openai.com/en/articles/20001498-how-resets-work-in-codex](https://help.openai.com/en/articles/20001498-how-resets-work-in-codex): Banked resets redeemed from Usage settings, /usage in CLI; paid instant reset on Plus and Pro; 30-day history of resets; assistant may redeem when allowance is at 10% or less [2026-11-22] Plans: Go, Plus, Business, Pro. Apps: desktop, web, cli.

**AGI requirement** (inferred; source: competitor parity). If the account holds resets, they are listed with expiry and can be used with confirmation.

**With different models, providers and the one subscription.** Resets refill managed windows only.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, desktop, mobile list resets with a Use reset button; no history and no assistant-applied reset. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: D2, DP6; rows without an id: comparison-web: Reset for free / use a limit reset; comparison-mobile: Spare limit resets the user can spend
- Code: `apps/web/app/api/usage/limit-resets/route.ts:1`

**Gap.** No reset history (DP6); assistant cannot apply a reset (D2); no paid instant reset.

**Acceptance criteria**

1. Use reset asks for confirmation and refills the window.
2. Used and received resets are listed.

**Verification: code inspected only.** No person run.

## CAP-usage-limits-25 Alternative model or reserve at a limit

When a model limit hits, the user is offered another eligible model, or a reserve.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT and Codex: yes**
  - [https://help.openai.com/en/articles/20001499-luna-reserve-in-codex-and-chatgpt](https://help.openai.com/en/articles/20001499-luna-reserve-in-codex-and-chatgpt) (this address is not in the saved catalogue; treat as unverified): After regular Codex/Work limits run out, selected accounts can keep working with a smaller model on a separate capped reserve [2026-11-22] Plans: Plus, Pro.
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): A mini model is the unlisted fallback once Instant or Auto limits are hit [2026-11-22]

**AGI requirement** (stated requirement; source: AGENTS.md sections 6 and 7; docs/product/competitive-guidance.md). When a limit or plan blocks the chosen model, offer an eligible alternative, including an installed Local model; never switch silently.

**With different models, providers and the one subscription.** Alternatives come from the catalog and routing; a switch from Local to managed is an explicit fork with consent.

**Current implementation, as this trace read it on 2026-11-24: built.** All apps show alternative suggestion per ledger. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S82.26
- Comparison list ids: none matched
- Code: `apps/web/features/chat/components/messages/ChatMessageList.tsx:664`; `apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx:287`; `apps/cli/src/errors.rs:602`

**Gap.** Whether the suggestion lists an on-device model is not verified. No capped reserve.

**Acceptance criteria**

1. At a flagship limit the card offers a non-flagship model.
2. Choosing it keeps the chat history and shows the provider label.

**Verification: code inspected only.** No person run.

## CAP-usage-limits-26 Free plan allowance and display

What a signed-out or Free account gets and sees about limits.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://claude.com/pricing](https://claude.com/pricing): Free has limited usage per five hours and per week [2026-11-22] Plans: Free. Apps: web, desktop, mobile.
- **ChatGPT: yes**
  - [https://chatgpt.com/pricing](https://chatgpt.com/pricing): Free: unlimited text chats on the base model with abuse guardrails, plus limited uploads, images, voice, deep research, memory and Codex [2026-11-22] Plans: Free. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/definition.md (Free row, line 295) and owner decision Free usage = Upgrade only (code wins; UsageSection test)). Free managed use has a small daily allowance; Free usage screens show only Upgrade, never meters; free local inference needs no payment.

**With different models, providers and the one subscription.** Local on-device chat is free and uncapped by managed windows; sign-in may still be required.

**Current implementation, as this trace read it on 2026-11-24: off by decision.** Free sees Upgrade only on web, mobile, VS Code, Chrome; CLI shows meters (defect). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S82.03
- Comparison list ids: W55; rows without an id: comparison-web: Usage shown on Free plan; comparison-mobile: Usage figures for Free accounts
- Code: `apps/cli/src/usage_summary.rs:564`

**Gap.** No unlimited base-model chat (W55). A false Free-limit banner after Stop (W-19). CLI shows Free meters.

**Acceptance criteria**

1. Free Usage shows Upgrade only.
2. The Free limit message names its reset.
3. A stopped answer shows no limit banner.

**Verification: seen failing by a person.** Web scorecard W-19 free: Usage matched the decision; false banner after Stop.

## CAP-usage-limits-27 Org, seat and per-user spend limits

Admin caps on credit spend per organization, seat tier, group or person.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Team and Enterprise: yes**
  - [https://support.claude.com/en/articles/12005970-manage-usage-credits-for-team-and-seat-based-enterprise-plans](https://support.claude.com/en/articles/12005970-manage-usage-credits-for-team-and-seat-based-enterprise-plans): Owners set monthly credit spend limits for the org, per seat tier or group and per user; a user at limit pauses until month end [2026-11-22] Plans: Team, Enterprise. Apps: web.
  - [https://support.claude.com/en/articles/13799932-manage-groups-and-group-spend-limits-on-enterprise-plans](https://support.claude.com/en/articles/13799932-manage-groups-and-group-spend-limits-on-enterprise-plans): Per-user monthly limit for a group, optional pooled budget; individual limits override group limits [2026-11-22] Plans: Enterprise. Apps: web.
- **ChatGPT Business, Enterprise and Edu: yes**
  - [https://help.openai.com/en/articles/20001001-manage-usage-limits-and-overages-in-chatgpt-enterprise-and-edu](https://help.openai.com/en/articles/20001001-manage-usage-limits-and-overages-in-chatgpt-enterprise-and-edu): Workspace default, group default and user override, order override then highest group then workspace default [2026-11-22] Plans: Enterprise, Edu. Apps: web.
  - [https://help.openai.com/en/articles/20001155-managing-credits-and-spend-controls-in-chatgpt-business](https://help.openai.com/en/articles/20001155-managing-credits-and-spend-controls-in-chatgpt-business): Limits per seat type and per-user overrides; only owners buy credits [2026-11-22] Plans: Business. Apps: web.

**AGI requirement** (inferred; source: competitor parity (both leaders)). Workspace owners set caps per member and group with overrides.

**With different models, providers and the one subscription.** Caps count managed spend on the workspace's one subscription; BYOK and Local excluded.

**Current implementation, as this trace read it on 2026-11-24: partly built.** One workspace cap plus one personal cap. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S82.31
- Comparison list ids: DP5, W23, W49; rows without an id: comparison-web: Plan limits for Team: shared usage and workspace spend limit
- Code: `apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx:165`; `apps/web/lib/services/spend-limit-service.ts:175`

**Gap.** No group, role or member limits and no override order.

**Acceptance criteria**

1. Set a member cap; that member is blocked at it while others continue.
2. An individual override beats a group limit.

**Verification: code inspected only.** No person run.

## CAP-usage-limits-28 Request more usage and see who is blocked

Members ask an admin for more; admins see who is blocked or near a cap.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Team and Enterprise: yes**
  - [https://support.claude.com/en/articles/12005970-manage-usage-credits-for-team-and-seat-based-enterprise-plans](https://support.claude.com/en/articles/12005970-manage-usage-credits-for-team-and-seat-based-enterprise-plans): Seat-based Enterprise members see Request usage credits; admins review in Usage and get a daily email [2026-11-22] Plans: Enterprise. Apps: web.
  - [https://support.claude.com/en/articles/13799932-manage-groups-and-group-spend-limits-on-enterprise-plans](https://support.claude.com/en/articles/13799932-manage-groups-and-group-spend-limits-on-enterprise-plans): Blocked by a spend limit section shows who is blocked or near limits [2026-11-22] Plans: Enterprise. Apps: web.
- **ChatGPT Enterprise and Edu: yes**
  - [https://help.openai.com/en/articles/20001001-manage-usage-limits-and-overages-in-chatgpt-enterprise-and-edu](https://help.openai.com/en/articles/20001001-manage-usage-limits-and-overages-in-chatgpt-enterprise-and-edu): Members request more; admins approve or deny, route to a URL, or disable; overrides may be temporary [2026-11-22] Plans: Enterprise, Edu. Apps: web.

**AGI requirement** (inferred; source: competitor parity). A blocked member can ask an admin; admins see who is blocked.

**With different models, providers and the one subscription.** Concerns managed workspace spend only.

**Current implementation, as this trace read it on 2026-11-24: not built.** No request flow on any app. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: D4, V2, W25, W27, W45
- Code: none cited

**Gap.** Whole feature.

**Acceptance criteria**

1. A capped member presses Request more and the admin sees it.
2. The admin Usage page lists blocked members.

**Verification: not verified.** Comparison rows only.

## CAP-usage-limits-29 Spend alerts at thresholds

Notifications as credits or a cap are approached.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans](https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans): Notifications arrive when approaching usage credit limits [2026-11-22] Plans: Pro, Max, Ultra.
- **ChatGPT Enterprise: yes**
  - [https://help.openai.com/en/articles/20001001-manage-usage-limits-and-overages-in-chatgpt-enterprise-and-edu](https://help.openai.com/en/articles/20001001-manage-usage-limits-and-overages-in-chatgpt-enterprise-and-edu): Usage alerts notify at thresholds but never block [2026-11-22] Plans: Enterprise, Edu. Apps: web.

**AGI requirement** (inferred; source: competitor parity). Alerts at chosen thresholds reach chosen people.

**With different models, providers and the one subscription.** Managed spend only.

**Current implementation, as this trace read it on 2026-11-24: partly built.** One alert percentage on the workspace cap; in-chat banner. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S82.24
- Comparison list ids: WP30, WP31
- Code: `apps/web/lib/services/spend-limit-service.ts:175`

**Gap.** No several thresholds or recipient list; no credit alert notification.

**Acceptance criteria**

1. Set thresholds; crossing each sends one alert to the chosen recipients.

**Verification: code inspected only.** No person run.

## CAP-usage-limits-30 Let connected apps spend plan usage

Sign in with the plan so partner tools draw on the allowance, with a per-app cap.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://learn.chatgpt.com/docs/sign-in-with-chatgpt.md](https://learn.chatgpt.com/docs/sign-in-with-chatgpt.md): Settings > Usage shows connected-app usage and lets you cap each app at a percentage of weekly plan usage [2026-11-22]
  - [https://help.openai.com/en/articles/6950777-what-is-chatgpt-plus](https://help.openai.com/en/articles/6950777-what-is-chatgpt-plus): Eligible Plus subscribers can let third-party tools draw on their allowance after separate approval; not API billing [2026-11-22] Plans: Plus. Apps: other.

**AGI requirement** (proposed; source: competitor parity (one competitor)). Not established.

**With different models, providers and the one subscription.** Would cross a trust boundary; needs explicit consent and a visible label.

**Current implementation, as this trace read it on 2026-11-24: not built.** No sharing of the plan with outside apps. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W43, W56
- Code: none cited

**Gap.** Whole feature; product choice open.

**Acceptance criteria**

1. If built: an app can use plan usage only after separate consent and a per-app weekly cap.

**Verification: not verified.** Comparison rows only.

## CAP-usage-limits-31 Usage report download and billing discrepancy report

Export usage as a file, and report a wrong charge or count.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT Enterprise and Edu: partly**
  - [https://help.openai.com/en/articles/20001001-manage-usage-limits-and-overages-in-chatgpt-enterprise-and-edu](https://help.openai.com/en/articles/20001001-manage-usage-limits-and-overages-in-chatgpt-enterprise-and-edu): Admin Console Billing shows usage report download and invoices [2026-11-22] Plans: Enterprise, Edu. Apps: web.

**AGI requirement** (proposed; source: AGI has it; competitors partly). Users can download usage and report a discrepancy.

**With different models, providers and the one subscription.** Ledger covers managed use only.

**Current implementation, as this trace read it on 2026-11-24: built.** Web and desktop. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S82.32, S82.33
- Comparison list ids: none matched; rows without an id: comparison-web: Report a billing problem from Usage
- Code: `apps/web/app/api/usage/export/route.ts:91`; `apps/web/app/api/usage/discrepancy/route.ts:201`

**Gap.** none known

**Acceptance criteria**

1. Download a CSV matching the history view.
2. A filed report appears in Help.

**Verification: code inspected only.** No person run.

## CAP-usage-limits-32 Local and BYOK use outside managed windows

Showing clearly that on-device or own-key use is not counted in managed limits.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code (API-key sign-in is separate pay as you go): no**
  - [https://support.claude.com/en/articles/14552983-models-usage-and-limits-in-claude-code](https://support.claude.com/en/articles/14552983-models-usage-and-limits-in-claude-code): API-key sign-in is pay as you go with no hard stop and /cost shows session spend [2026-11-22] Apps: cli.
- **Codex: partly**
  - [https://learn.chatgpt.com/docs/pricing.md](https://learn.chatgpt.com/docs/pricing.md): API-key sign-in uses API billing; cloud features are not available [2026-11-22] Plans: API key. Apps: cli.

**AGI requirement** (stated requirement; source: docs/product/commercial.md (Local free; BYOK user pays provider) and competitive-guidance.md item 46 (distinguish subscription, API, local, BYOK)). Usage views state which turns are managed, Local or BYOK; Local is free and not metered; BYOK is billed by the provider.

**With different models, providers and the one subscription.** This is the model and provider agnostic rule: limits apply by route, not by model.

**Current implementation, as this trace read it on 2026-11-24: unknown.** Windows apply to managed turns; nothing found that labels Local or BYOK in Usage. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: `docs/product/commercial.md:9`

**Gap.** Not checked whether any app labels Local or BYOK turns in Usage.

**Acceptance criteria**

1. A Local chat does not move any managed bar.
2. A BYOK turn shows the provider label and no AGI credits.

**Verification: not verified.** No source reviewed.

## Unresolved product choices

Decisions this topic needs from the owner. Nothing here has been decided.

- Whether to match ChatGPT's per-app weekly cap and 'Sign in with plan' sharing, which only one competitor documents.
- Whether to add a verified-account rule before lifting the top tier's session cap, as Claude does.
- Whether to add a capped reserve model after limits, as one ChatGPT feature does.
- Whether to add paid instant resets, banked promotional resets or an assistant that redeems resets.
- Whether blocked work should auto-resume after reset (Claude Code only) or only notify.
- Whether to bundle monthly developer API credits with top plans, as both leaders do.
- Whether Free should have unlimited base chat, as ChatGPT advertises (comparison W55).
- What the Free usage rule means for CLI, which currently shows meters.
- Which warning threshold is the public one (80% in definition, 75% on Chrome).
- Whether Local use and BYOK use should be shown in Usage as unmetered lines.
- Whether per-device and per-card paid-account limits (one competitor) are wanted.

## Could not establish

- How the Claude and ChatGPT chat products behave at a plain-chat cap beyond the pages cited; ChatGPT chat numbers are not given, only 'unlimited under guardrails' and 'caps vary with demand'.
- Whether Claude has a monthly plan allowance or an alternative-model prompt at limits; the catalogue does not show it.
- Whether ChatGPT warns before a limit; not shown.
- Real numbers per plan allowance in AGI beyond the Basic account seen (400 per month, 100 per week, 10 per 5 hours).
- Whether the CLI row C13 or the server decision D-2026-10-25-01 is right about finishing the crossing turn on the CLI.
- Whether any AGI app shows Local or BYOK turns in Usage.
- Whether the Chrome extension has a usage meter (docs conflict).
- No person has seen the limit-denial path on non-web apps, nor credit purchase, auto-reload, resets or spend limits working on any app.
- I did not open saved pages beyond the catalogue lines, so numbers outside the lines quoted were not independently re-read.
