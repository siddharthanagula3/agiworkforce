---
id: "F088-11"
type: "feature"
title: "Support assistant (answers, email and WhatsApp, languages, analytics)"
aliases: ["Support assistant", "Support widget", "Open product support", "Support agent", "Fin-style assistant", "Abstention card", "Send this to a person", "Support assistant channels (S88.28)", "Multilingual support answers (S88.29)", "Support analytics (S88.30)", "Support content gaps (S88.31)"]
area: "88 Support, trust, and policy product"
available_on: ["web"]
implementation: {web: "partial", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S88.28", "S88.29", "S88.30", "S88.31"]
depends_on: ["SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "SYS-observability-and-operations", "SYS-api-and-contracts", "SYS-execution-boundaries", "SYS-authentication-and-identity", "surface:web", "mode:cloud", "F088-10"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F088-11 Support assistant (answers, email and WhatsApp, languages, analytics)

An assistant in a web widget answers help questions from the help articles, with citations, and declines when it has no source, handing over to a person. The widget shows only on help and support pages. Email and WhatsApp answers, other languages, resolution analytics and content-gap reports are not built.

Area: [88. Support, trust, and policy product](README.md). Requirement items: [S88.28](../../10-requirements/capabilities/088-support-trust-and-policy-product.md#s8828), [S88.29](../../10-requirements/capabilities/088-support-trust-and-policy-product.md#s8829), [S88.30](../../10-requirements/capabilities/088-support-trust-and-policy-product.md#s8830), [S88.31](../../10-requirements/capabilities/088-support-trust-and-policy-product.md#s8831).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Retrieves help article passages, asks a model to answer only from them, checks the citations, and returns an answer card or an abstention card with a handoff offer. (apps/web/lib/support/agent/index.ts:1-20; apps/web/lib/support/agent/answer/synthesize.ts:108-250)

**Why it exists.** Customers get fast, grounded help and billing, deletion, security and legal questions go to a person instead of a guess. The brief asks for email and WhatsApp channels, other languages, analytics and gap reports on top. (apps/web/lib/support/agent/types.ts:9; doc: knowledge-base/data/area-briefs/088-support-trust-and-policy-product.md)

**Who uses it.** Anyone on the help center or support page, signed in or not; support staff receive the handoffs. (apps/web/features/support/lib/route-visibility.ts:1; apps/web/app/api/support/ask/route.ts:93-140)

**Problems it solves**

- Repeated how-to questions.
- Confident wrong answers on money, data and legal topics.
- Uncited answers.

**Use cases**

- Ask "how do I connect a connector" and read a cited answer.
- Ask about a refund; see "Billing, a person handles this" with links. (apps/web/features/support/lib/normalize-answer.ts:129-134)
- Ask something with no article; see "I don't have a source for this" and send it to a person.
- Signed-in user asks about their account; account facts are given to the model. (apps/web/app/api/support/ask/route.ts:42-57)

## 2. User experience

**Where to find it**

- Web: launcher button with accessible name "Open product support" ("Close product support" when open) on /help and /support pages only. (apps/web/features/support/components/SupportLauncher.tsx:19; apps/web/features/support/lib/route-visibility.ts:1-8)
- Web: panel heading "Support". (apps/web/features/support/components/SupportPanel.tsx:113)
- Embedded pages: the widget does not render. (apps/web/features/support/components/SupportWidgetMount.tsx:36)
- Desktop, mobile, CLI, VS Code, Chrome: not part of the brief; none found. (doc: knowledge-base/data/area-briefs/088-support-trust-and-policy-product.md)

**Before you start**

- None; the asker may be signed out, though a human check (bot challenge) applies. (apps/web/app/api/support/ask/route.ts:107-113)

**Screens and controls**

- Composer, answer card with citation list, abstention card with heading, "Where to look" links and button "Send this to a person", handoff panel and thread. (apps/web/features/support/components/SupportAbstentionCard.tsx:12-34; apps/web/features/support/components/SupportHandoffPanel.tsx)

**Journey**

1. Open a help page; click Open product support.
2. Type a question; the browser posts it to /api/support/ask. (apps/web/features/support/lib/support-client.ts:102)
3. Read an answer with citations, or an abstention.
4. On an abstention that offers handoff, click Send this to a person; the handoff goes to a live agent if available, otherwise email. (packages/contracts/cloud-contracts/src/support.ts:165-191)

**What the person sees and gets**

- Abstention headings per reason, for example "I don't have a source for this", "Not something I can help with here", "I can't answer this right now", "Assistant unavailable". (apps/web/features/support/lib/normalize-answer.ts:129-144)
- Handoff states waiting, connected, emailed, undeliverable, closed, timed out. (packages/contracts/cloud-contracts/src/support.ts:165-199)

**Settings**

- Server switch SUPPORT_AGENT_ENABLED (default on; 0, false, off or no turns answers off). (apps/web/lib/support/agent/answer/model-route.ts:72-76; apps/web/lib/validate-env.ts:1512)
- Public switch NEXT_PUBLIC_SUPPORT_WIDGET_ENABLED (default on; same off values). (apps/web/features/support/lib/widget-flag.ts:1-6; apps/web/lib/validate-env.ts:1495)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Widget mounts on /help and /support paths when not embedded and not switched off. (apps/web/features/support/components/SupportWidgetMount.tsx:36; apps/web/features/support/lib/route-visibility.ts:1)
- POST /api/support/ask: kill switch returns 501 SUPPORT_AGENT_DISABLED, CSRF, rate limit, human check, schema check, account facts, answer. (apps/web/app/api/support/ask/route.ts:93-140)
- Hard-abstain rules for billing, data deletion, security and legal send those questions to a person with authoritative links. (apps/web/lib/support/agent/types.ts:9; apps/web/lib/support/agent/answer/synthesize.ts:148-153)
- Retrieval floor, citation verification, groundedness and out-of-scope checks; each failure maps to a named abstention reason. (apps/web/lib/support/agent/answer/synthesize.ts:155-250; apps/web/lib/support/agent/types.ts:11-24)
- Model call is admitted by daily ceilings per signed-in user, per anonymous asker and for the whole deployment. (apps/web/app/api/support/ask/route.ts:63-92)
- Model route uses the managed cloud admission on the lowest paid self-serve tier, requires structured output, caps output at 400 tokens, samples at zero and may reuse a cached answer. (apps/web/lib/support/agent/answer/model-route.ts:32-60; apps/web/lib/support/agent/answer/model-route.ts:105-115)
- Corpus is a generated file built from the help articles and static product data. (apps/web/lib/support/agent/corpus/index.ts:24; apps/web/content/support)
- Handoff to a person with presence check, email fallback and reference id. (apps/web/lib/support/handoff/handoff-service.ts:1-60)

**Incomplete**

- Surface constant is fixed to marketing in the widget. (apps/web/features/support/components/SupportWidgetMount.tsx:13)

**Present but disconnected or switched off**

- Agent can be turned off by SUPPORT_AGENT_ENABLED; the widget by NEXT_PUBLIC_SUPPORT_WIDGET_ENABLED. (apps/web/lib/validate-env.ts:1495-1520)

**Not available**

- Email and WhatsApp answering: no inbound channel code found. A search for WhatsApp matched only the connector catalogue and desktop code, not support. (apps/web/lib/connectors/catalog.ts; apps/web/lib/support/handoff/resend-client.ts)
- Multilingual answers: no language handling found in the agent folder (matches were code-language patterns). (apps/web/lib/support/agent/policy/out-of-scope.ts:23)
- Resolution and satisfaction analytics and content-gap suggestions: no code found in lib/support, features/support or admin routes. (doc: knowledge-base/data/area-briefs/088-support-trust-and-policy-product.md)
- The assistant in desktop, mobile, CLI, VS Code and Chrome. (apps/web/features/support/components/SupportWidgetMount.tsx:36)

## 4. Required behaviour

**Established requirements**

- The support assistant answers customers by email and WhatsApp as well as in the web widget. (source: S88.28 brief Should line)
- It answers in the customer's language from the same help corpus. (source: S88.29 brief Should line)
- Operators see how many conversations were resolved, handed off or failed, with satisfaction ratings. (source: S88.30 brief Should line)
- It reports questions it could not answer so the owner can write missing articles. (source: S88.31 brief Should line)
- Web support is the help centre, the support assistant, signed-in tickets and handoff. (source: doc: docs/decisions/README.md:173)
- Support is a company function, not a plan entitlement. (source: apps/web/lib/support/agent/answer/model-route.ts:34-39)

**Acceptance criteria**

1. With SUPPORT_AGENT_ENABLED off, the ask route returns 501 and the widget answers show the disabled reason.
2. A refund question returns an abstention with reason hard_abstain_billing and handoff offered.
3. An answer's every citation resolves to a corpus path or the answer becomes unverifiable_citation.
4. A question with no matching article returns no_relevant_source.
5. With the widget flag off, no launcher renders on /help.
6. Reaching the daily ceiling returns an abstention rather than an error page.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Each future channel must reuse the same abstain rules and corpus. [inferred]
- Language support needs the corpus or the model to cover those languages. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Log resolved, handed off and failed outcomes to a table for operators.
- [proposed] Record no_relevant_source questions as content gaps.
- [proposed] Add a rating control to the answer card.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | SupportWidgetEntry | `apps/web/features/support/components/SupportWidgetEntry.tsx` | Flag check and lazy load. |
| component | SupportWidgetMount | `apps/web/features/support/components/SupportWidgetMount.tsx` | Route and embedded checks, open state. |
| config | route-visibility | `apps/web/features/support/lib/route-visibility.ts` | Widget only on /help and /support. |
| config | widget-flag | `apps/web/features/support/lib/widget-flag.ts` | NEXT_PUBLIC_SUPPORT_WIDGET_ENABLED. |
| component | SupportLauncher and SupportPanel | `apps/web/features/support/components/SupportPanel.tsx` | Button and panel. |
| component | SupportAbstentionCard | `apps/web/features/support/components/SupportAbstentionCard.tsx` | Abstention card and escalate button. |
| service | support-client | `apps/web/features/support/lib/support-client.ts` | Calls the ask path. |
| endpoint | POST /api/support/ask | `apps/web/app/api/support/ask/route.ts` | Ask route with gates. |
| service | answerSupportQuestion | `apps/web/lib/support/agent/answer/synthesize.ts` | Pipeline from question to answer or abstention. |
| service | model-route | `apps/web/lib/support/agent/answer/model-route.ts` | Kill switch, route admission, cache, cost. |
| service | hard-abstain rules | `apps/web/lib/support/agent/policy/hard-abstain.ts` | Billing, deletion, security, legal patterns. |
| service | retrieval | `apps/web/lib/support/agent/retrieval/retrieve.ts` | Keyword retrieval and relevance floor. |
| config | corpus | `apps/web/lib/support/agent/corpus.generated.json` | Generated help corpus. |
| config | help articles | `apps/web/content/support` | Source articles. |
| service | handoff service | `apps/web/lib/support/handoff/handoff-service.ts` | Create and claim handoff sessions. |
| endpoint | handoff routes | `apps/web/app/api/support/handoff` | Create, availability, agent queue. |
| config | support contracts | `packages/contracts/cloud-contracts/src/support.ts` | Request and response schemas. |
| config | env registry | `apps/web/lib/validate-env.ts` | Declares both switches. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Browser sends the question and history to the ask route. | device | apps/web/features/support/lib/support-client.ts:102 |
| Server checks switch, CSRF, rate limit, human check and schema, then loads account facts for a signed-in user. | our servers | apps/web/app/api/support/ask/route.ts:93-135 |
| Pipeline classifies hard-abstain topics, retrieves passages and applies a relevance floor. | our servers | apps/web/lib/support/agent/answer/synthesize.ts:148-165 |
| The daily ceilings are checked, then the managed Cloud route is admitted and the model is called with only the retrieved excerpts. | our servers | apps/web/app/api/support/ask/route.ts:63-92; apps/web/lib/support/agent/answer/model-route.ts:105-130 |
| The model is served by whatever provider the managed route selects. | outside service | apps/web/lib/support/agent/answer/model-route.ts:105-118 |
| Citations, groundedness and category checks run; the answer or an abstention is returned. | our servers | apps/web/lib/support/agent/answer/synthesize.ts:200-250 |
| A handoff creates a session, checks human availability and emails if none. | our servers | apps/web/lib/support/handoff/handoff-service.ts:34-60 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Question text and recent history | Not persisted by the ask route; cached answers may be stored by the semantic response cache keyed by tenant and input (apps/web/lib/support/agent/answer/model-route.ts:92-103) | Server | Cache retention unknown |
| Provider cost for each call | Cost ledger (apps/web/lib/support/agent/answer/model-route.ts:17) | Server | unknown |
| Handoff session with transcript summary and citations | Handoff store, table name not read (apps/web/lib/support/handoff/store.ts) | Server | Old sessions are purged by a job (apps/web/lib/support/handoff/handoff-service.ts:21) |

**Models and providers.** The answer is written by a model chosen through the shared managed-route admission using a fast-model family slot from the model catalog; the provider is whichever route is admitted. (apps/web/lib/support/agent/answer/model-route.ts:41-45; apps/web/lib/support/agent/answer/model-route.ts:105-125) No other model or provider takes part; retrieval is keyword based. (apps/web/lib/support/agent/retrieval/bm25.ts)

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Not required; anonymous askers get per-IP limits. (apps/web/app/api/support/ask/route.ts:63-72) |
| Permissions | Signed-in askers get model-safe account facts and a list of available actions; the agent only echoes an action id and runs nothing. (apps/web/app/api/support/ask/route.ts:42-57; apps/web/lib/support/agent/index.ts:15-18) |
| Subscription | No plan entitlement: every asker is routed on the lowest paid self-serve tier. (apps/web/lib/support/agent/answer/model-route.ts:34-39) |
| Limits and metering | Rate limit buckets support-agent-user, support-agent-anon, and daily ceilings support-agent-user-day, support-agent-anon-day, support-agent-global-day; values are configuration not read here. Output capped at 400 tokens. (apps/web/app/api/support/ask/route.ts:63-92; apps/web/lib/support/agent/answer/model-route.ts:32) |
| Feature flags | SUPPORT_AGENT_ENABLED and NEXT_PUBLIC_SUPPORT_WIDGET_ENABLED. (apps/web/lib/validate-env.ts:1495-1520) |
| Model compatibility | Needs a managed route that supports structured output for the family slot; none admitted gives no_route and a "can't answer right now" abstention. (apps/web/lib/support/agent/answer/model-route.ts:105-124) |
| Provider restrictions | Only a route the managed-route admission accepts for the platform; own-key routes are not used. (apps/web/lib/support/agent/answer/model-route.ts:105-112) |
| Local mode | Not applicable on web. The assistant always uses our managed route and has no Local or own-key path. (apps/web/lib/support/agent/answer/model-route.ts:105-112) |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Agent disabled | Ask route returns 501 SUPPORT_AGENT_DISABLED "Automated answers are turned off." | apps/web/app/api/support/ask/route.ts:94-100 |
| Corpus unavailable | Abstention corpus_unavailable. | apps/web/lib/support/agent/answer/synthesize.ts:157-160 |
| No relevant source | Abstention no_relevant_source with handoff offered. | apps/web/lib/support/agent/answer/synthesize.ts:162-165 |
| Daily ceiling reached | Model unavailable abstention. | apps/web/lib/support/agent/answer/synthesize.ts:184-190 |
| Model gate error | The call is refused and logged. | apps/web/lib/support/agent/answer/model-route.ts:79-88 |
| Unverifiable citation or malformed output | Abstention rather than a guess. | apps/web/lib/support/agent/answer/synthesize.ts:200-227 |
| Out of scope | No handoff offered for out_of_scope. | apps/web/features/support/lib/normalize-answer.ts:146 |
| Network failure in browser | Heading "I couldn't reach the assistant". | apps/web/features/support/lib/normalize-answer.ts:142 |
| Account context unavailable | Answers without account facts and logs a warning. | apps/web/app/api/support/ask/route.ts:36-48 |
| Keyboard and focus | Closing returns focus to the launcher. | apps/web/features/support/components/SupportWidgetMount.tsx:26-30 |
| Reduced motion | The mount reads the preference. | apps/web/features/support/components/SupportWidgetMount.tsx:22 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/support/ask/route.test.ts`: The ask route.
- `apps/web/lib/support/agent/__tests__/model-route.test.ts`: SUPPORT_AGENT_ENABLED kill switch values.
- `apps/web/lib/support/agent/__tests__/abstain-unknown.test.ts`: Abstaining when no source exists and when disabled.
- `apps/web/lib/support/agent/__tests__/hard-abstain.test.ts`: Hard-abstain categories.
- `apps/web/lib/support/agent/__tests__/citation-invariant.test.ts`: Citations always resolve.
- `apps/web/lib/support/agent/__tests__/groundedness.test.ts`: Groundedness checks.
- `apps/web/lib/support/agent/__tests__/injection.test.ts`: Prompt injection handling.
- `apps/web/lib/support/agent/__tests__/daily-ceilings.test.ts`: Daily ceilings.
- `apps/web/lib/support/agent/__tests__/model-route.tier.test.ts`: Routing tier.
- `apps/web/lib/support/agent/__tests__/out-of-scope.test.ts`: Out-of-scope questions.
- `apps/web/lib/support/agent/__tests__/retrieval.test.ts`: Retrieval.
- `apps/web/features/support/__tests__/SupportWidgetMount.test.tsx`: Widget on and off with the flag.
- `apps/web/e2e/support-only.spec.ts`: Browser flow that waits for /api/support/ask.

**Test scenarios**

- **Cited answer**
  1. Open /help
  2. Open product support
  3. Ask a question the articles cover
  - Expected: Answer with citation links to help paths.
- **Billing hand-over**
  1. Ask why you were charged twice
  - Expected: Heading "Billing, a person handles this" and Send this to a person.
- **No source**
  1. Ask something no article covers
  - Expected: "I don't have a source for this".
- **Kill switches**
  1. Set SUPPORT_AGENT_ENABLED to 0
  2. Ask
  3. Set NEXT_PUBLIC_SUPPORT_WIDGET_ENABLED to 0
  4. Reload /help
  - Expected: 501 on ask; then no launcher.
- **Route visibility**
  1. Open /chat and /help
  - Expected: No launcher on chat, launcher on help.
- **Ceiling**
  1. Exceed the asker's daily ceiling in a test
  - Expected: Abstention model_unavailable.

**Where to look when it fails**

- Logs: "[support-agent] asker reached the daily ceiling", "[support-agent] deployment reached the daily model-call ceiling", "[support-agent] corpus unavailable", "[support-agent] account context unavailable". (apps/web/app/api/support/ask/route.ts:48; apps/web/app/api/support/ask/route.ts:73-86; apps/web/lib/support/agent/answer/synthesize.ts:158)
- Error code SUPPORT_AGENT_DISABLED.
- Abstention reason in data attribute data-support-abstention-reason. (apps/web/features/support/components/SupportAbstentionCard.tsx:25)

**Hands-on test plans**

- Web: [70-qa/test-plans/web/088-support-trust-and-policy-product.md](../../70-qa/test-plans/web/088-support-trust-and-policy-product.md)

## 10. Gaps and dependencies

- **No email or WhatsApp channel.** Affects: Customers away from the web widget. Evidence: No inbound support channel code found (search of apps, packages and services). Work needed: Inbound webhook, identity match, reuse of the answer pipeline, per-channel limits.
- **No multilingual answers; behaviour for other languages is unverified.** Affects: Non-English customers. Evidence: No language handling in apps/web/lib/support/agent; prompt text not read. Work needed: Decide language scope, test the corpus and model.
- **No resolution, handoff or satisfaction analytics.** Affects: Operators. Evidence: No code in lib/support, features/support or admin routes. Work needed: Outcome events, a table, a rating control, an operator view.
- **No content-gap report.** Affects: Content owner. Evidence: No code found. Work needed: Store no_relevant_source questions and review them.
- **The widget is limited to help and support pages; the chat app has no entry.** Affects: Signed-in web users in chat. Evidence: apps/web/features/support/lib/route-visibility.ts:1. Work needed: Product decision.
- **The brief status says web missing while the assistant itself works for the in-scope parts.** Affects: Knowledge base accuracy. Evidence: apps/web/app/api/support/ask/route.ts:93. Work needed: Split the brief into built assistant and missing extras.

**Depends on**

- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- SYS-observability-and-operations
- SYS-api-and-contracts
- SYS-execution-boundaries
- SYS-authentication-and-identity
- surface:web
- mode:cloud
- F088-10

## Unknown

- Whether the system prompt tells the model to answer in the asker's language (prompt text not read).
- Values of the daily ceilings and rate limits.
- Which provider serves the answers in production.
- Retention of cached answers and handoff sessions.
- Whether anything records handoff outcomes for later analytics.
- Why the widget surface is fixed to marketing.
