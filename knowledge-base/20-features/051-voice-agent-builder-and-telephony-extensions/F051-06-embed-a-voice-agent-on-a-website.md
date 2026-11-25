---
id: "F051-06"
type: "feature"
title: "Embed a voice agent on a website"
aliases: ["Web voice widget", "Embed a voice agent", "Voice widget snippet", "S51.11"]
area: "51 Voice-agent builder and telephony extensions"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S51.11"]
depends_on: ["F051-01", "F051-05", "SYS-security-and-privacy", "SYS-authentication-and-identity", "SYS-authorization-and-workspaces", "SYS-voice-and-media", "SYS-subscriptions-entitlements-and-usage", "SYS-api-and-contracts", "surface:web", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F051-06 Embed a voice agent on a website

Intended: copy an embed snippet and place a voice widget for a voice agent on an outside website. Not built. The site also blocks being framed and limits the microphone to itself, so a widget would need deliberate header and consent design.

Area: [51. Voice-agent builder and telephony extensions](README.md). Requirement items: [S51.11](../../10-requirements/capabilities/051-voice-agent-builder-and-telephony-extensions.md#s5111).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Intended: a voice agent can be embedded on an external website as a voice widget (S51.11). Nothing exists on Web, Desktop, Mobile or API (audit/ledger/ecosystem-capability-ledger.jsonl: S51.11).

**Why it exists.** Website visitors could talk to the agent without a phone number; competitors ship widgets; the audit lists it as open.

**Who uses it.** Intended: owners (who place the snippet) and website visitors (who speak).

**Problems it solves**

- Reach visitors on the web, not only by phone.
- Reuse one agent across phone and web.

**Use cases**

- A shop adds a 'Talk to us' button.
- A booking site lets visitors ask about availability by voice.
- A docs site offers voice help [proposed].

## 2. User experience

**Where to find it**

- Web, Desktop, Mobile: not available. The nearest sharing UI is the text-agent publish panel with a visibility setting (apps/web/features/agents/components/AgentPublishPanel.tsx:60-73).

**Before you start**

- A published voice agent and a domain for the widget; none exist.

**Screens and controls**

- None.

**Journey**

1. Intended: open the agent, copy the snippet, paste into a page; a visitor presses the widget and speaks.
2. Today: not possible. How the snippet is issued and what the visitor hears about recording are not specified.

**What the person sees and gets**

- None.

**Settings**

- None. Text agents have visibility values private, people and workspace, none public (packages/contracts/cloud-contracts/src/agents.ts:14).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nothing for widgets. Neighbour: the web app sends X-Frame-Options DENY and a frame-ancestors policy of none by default, with a same-origin option, so its own pages cannot be framed by other sites (apps/web/next.config.ts:194; apps/web/proxy.ts:40-64).

**Incomplete**

- none found

**Present but disconnected or switched off**

- none found

**Not available**

- Voice widget and snippet on Web, Desktop, Mobile and API (audit/ledger/ecosystem-capability-ledger.jsonl: S51.11 missing).

## 4. Required behaviour

**Established requirements**

- A voice agent can be embedded on an external website as a voice widget. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S51.11)

**Acceptance criteria**

1. An owner can copy an embed snippet for a published agent.
2. The widget loads on an allowed external domain and not on others.
3. The visitor is told before speaking that audio is processed, and can decline.
4. The microphone prompt works inside the embed.
5. Visitor sessions are metered to the owner, with a visible limit and clean refusal when exceeded.
6. The owner can disable the widget immediately.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The current headers (X-Frame-Options DENY, frame-ancestors none, microphone allowed to self only: apps/web/next.config.ts:194-210) would block a framed widget, so a dedicated embed route with its own headers is needed rather than relaxing the rest of the app (AGENTS.md section 9: do not weaken guards).
- [inferred] A public widget is a different trust boundary from signed-in chat (AGENTS.md section 6), so anonymous visitor limits and abuse controls are needed.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Issue per-agent embed keys with allowed-domain lists.
- [proposed] Show a visible recording and processing notice in the widget.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | Area brief S51.11 | `knowledge-base/data/area-briefs/051-voice-agent-builder-and-telephony-extensions.md` | Should line. |
| other | Capability ledger S51.11 | `audit/ledger/ecosystem-capability-ledger.jsonl` | Records missing on web, desktop, mobile, api. |
| config | Security headers | `apps/web/next.config.ts:185` | Sets X-Frame-Options DENY, Permissions-Policy and cross-origin policies for the app. |
| config | Content security policy builder | `apps/web/proxy.ts:40` | Builds CSP with a frame-ancestors parameter (none or self). |
| config | API security headers | `apps/web/lib/cors.ts:105` | Sets X-Frame-Options DENY on API responses. |
| component | AgentPublishPanel | `apps/web/features/agents/components/AgentPublishPanel.tsx` | Neighbour: publish and visibility UI. |
| endpoint | /api/custom-agents/[id]/share | `apps/web/app/api/custom-agents/[id]/share/route.ts` | Neighbour: visibility and people sharing for text agents. |
| endpoint | POST /api/custom-agents/[id]/publish | `apps/web/app/api/custom-agents/[id]/publish/route.ts` | Neighbour: publish a version. |
| schema | AGENT_VISIBILITIES | `packages/contracts/cloud-contracts/src/agents.ts:14` | Neighbour: private, people, workspace; no public value. |
| endpoint | POST /api/voice/live/sessions | `apps/web/app/api/voice/live/sessions/route.ts:149` | Neighbour: requires a signed-in user, so not usable by anonymous visitors. |
| service | CSRF check | `apps/web/lib/csrf.ts` | Neighbour: live voice start requires a CSRF token, a constraint for cross-site widgets. |
| service | Rate limit | `apps/web/lib/rate-limit.ts` | Neighbour: voice-live-session limiter. |
| service | Usage per agent | `apps/web/app/api/custom-agents/[id]/usage/route.ts` | Neighbour: per-agent usage for text agents. |
| test | Voice privacy disclosure test | `apps/web/app/privacy/__tests__/VoiceAndIncidentDisclosure.test.tsx` | Neighbour copy test on voice disclosures. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No widget flow exists. | device | audit/ledger/ecosystem-capability-ledger.jsonl: S51.11 |
| Neighbour: any browser request to the web app gets frame-blocking headers, so an embed would first be refused. | our servers | apps/web/next.config.ts:194; apps/web/proxy.ts:64 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Embed keys, allowed domains, visitor sessions | Does not exist | not applicable | unknown |

**Models and providers.** Not designed. A widget session would presumably reuse the live voice provider path [inferred]; no code does so for agents.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Owner account needed to issue a snippet [inferred]; visitor account requirement unknown. The neighbour live voice start requires sign-in and CSRF (apps/web/app/api/voice/live/sessions/route.ts, handleCreateLiveSession). |
| Permissions | None found in the code. |
| Subscription | None found in the code. |
| Limits and metering | None found in the code. |
| Feature flags | None found in the code for widgets. |
| Model compatibility | Unknown. |
| Provider restrictions | Unknown. |
| Local mode | Not available. An embedded widget on an outside site needs a hosted service by nature [inferred]; nothing runs on a device. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Feature absent | No snippet or widget exists. | audit/ledger/ecosystem-capability-ledger.jsonl: S51.11 |
| Microphone permission in frames | The app's Permissions-Policy allows the microphone for itself only; a cross-site frame would not inherit it. | apps/web/next.config.ts:206-210 |
| Visitor consent, offline, errors, accessibility | not handled in the code; recording notice not specified in the brief. | knowledge-base/data/area-briefs/051-voice-agent-builder-and-telephony-extensions.md |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/privacy/__tests__/VoiceAndIncidentDisclosure.test.tsx`: Neighbour privacy page voice disclosure.
- `apps/web/features/agents/__tests__/AgentPublishPanel.test.tsx`: Neighbour publish and visibility panel.
- `apps/web/app/api/custom-agents/[id]/publish/route.test.ts`: Neighbour publish route.

**Test scenarios**

- **Confirm absence**
  1. Open a published agent.
  2. Look for an embed or snippet control.
  - Expected: None (today).
- **Frame refusal today**
  1. From a different origin, load a web app page in an iframe.
  - Expected: Browser refuses because of frame-blocking headers (expected from the headers; not run by this page).
- **Allowed domain (future)**
  1. Add the widget on an allowed and on a non-allowed site.
  - Expected: Works on the first only.
- **Visitor notice (future)**
  1. Open the widget as a visitor.
  - Expected: A processing and recording notice appears before the microphone starts.

**Where to look when it fails**

- No widget logs exist. Check response headers on the web app for frame policy (apps/web/next.config.ts, apps/web/proxy.ts).

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No embed snippet or widget** Affects: Web owners and website visitors. Evidence: ledger S51.11 missing. Work needed: Embed route, key issuance, allowed domains, client widget.
- **Public visitors have no auth model; text-agent visibility has no public value** Affects: all. Evidence: packages/contracts/cloud-contracts/src/agents.ts:14; live voice start needs sign-in. Work needed: Design anonymous visitor sessions with limits and abuse control.
- **Snippet issuance and recording notice unspecified** Affects: product and legal. Evidence: brief. Work needed: Write requirement; legal text goes through the compliance owner (docs/compliance).
- Not built on: Web, Desktop, Mobile (from the capability ledger).

**Depends on**

- F051-01
- F051-05
- SYS-security-and-privacy
- SYS-authentication-and-identity
- SYS-authorization-and-workspaces
- SYS-voice-and-media
- SYS-subscriptions-entitlements-and-usage
- SYS-api-and-contracts
- surface:web
- mode:cloud

## Unknown

- How a visitor would authenticate or be limited.
- Whether the widget would be an iframe or a script.
- Who pays for visitor minutes.
- Recording and consent wording required per region.
