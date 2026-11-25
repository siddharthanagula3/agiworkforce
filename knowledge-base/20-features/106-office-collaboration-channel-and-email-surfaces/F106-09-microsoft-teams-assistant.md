---
id: "F106-09"
type: "feature"
title: "Microsoft Teams assistant"
aliases: ["Teams assistant (S106.15)", "Microsoft Teams bot", "Teams app"]
area: "106 Office, collaboration-channel, and email surfaces"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S106.15"]
depends_on: ["surface:web", "surface:desktop", "mode:cloud", "SYS-connectors-plugins-and-skills", "SYS-authentication-and-identity", "SYS-authorization-and-workspaces", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "F106-07", "F106-08", "F106-10"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F106-09 Microsoft Teams assistant

Intended: talk to AGI inside Microsoft Teams. Today no Teams bot, app manifest or event handler exists on any app. The only Teams code is a Microsoft Graph connector tool that lets AGI read chats from inside a normal AGI conversation, which is a different thing.

Area: [106. Office, collaboration-channel, and email surfaces](README.md). Requirement items: [S106.15](../../10-requirements/capabilities/106-office-collaboration-channel-and-email-surfaces.md#s10615).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Would let a person chat with AGI in Teams and get answers there, like the Slack assistant. Today it does nothing.

**Why it exists.** S106.15 asks for the assistant inside Teams, to match leaders and reach Microsoft 365 users (brief S106.15).

**Who uses it.** Intended: Microsoft 365 workspace users and admins. Today: nobody.

**Problems it solves**

- Intended: people who live in Teams having to switch to AGI
- Intended: parity with the Slack assistant

**Use cases**

- Intended: direct message the AGI bot in Teams
- Intended: mention AGI in a Teams channel
- Intended: approve a step in Teams

## 2. User experience

**Where to find it**

- None. No Teams bot or app code was found in apps/web/app, apps/web/lib, packages or services (search for 'msteams', 'botframework', 'teams bot' only matched connector and categorisation files).
- Related but different: the Microsoft Graph connector has Teams tools ('List the user's recent Teams chats with their members.') used by AGI inside a normal conversation (apps/web/lib/connectors/microsoft-graph.ts:643-680).

**Before you start**

- Not applicable today

**Screens and controls**

- none found in the code

**Journey**

1. Not possible today. [proposed] A future journey would mirror Slack: install app, link account, message the bot, approve steps.

**What the person sees and gets**

- none

**Settings**

- none found in the code

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Teams read tools exist in the Microsoft Graph connector, available through connectors rather than a bot (apps/web/lib/connectors/microsoft-graph.ts:25,643-680).

**Incomplete**

- nothing found

**Present but disconnected or switched off**

- Messaging connectors including Teams were cut and their UI unmounted (doc: docs/decisions/wire-or-cut.md:572).

**Not available**

- Teams bot, message receiver, account linking, per-channel policy and approvals: not available on Web or Desktop; other apps n/a (brief S106.15).

## 4. Required behaviour

**Established requirements**

- Users can talk to the assistant inside Microsoft Teams (bot or app) and get answers there. (source: S106.15)
- Messaging connectors (Slack, Teams...) were cut at one time; Slack was later rebuilt as an inbound app. (source: docs/decisions/wire-or-cut.md:572 and the Slack code in apps/web/lib/slack)

**Acceptance criteria**

1. A Teams user can direct message the AGI bot and receive a reply.
2. A Teams channel mention is answered in the thread.
3. Unlinked users are asked to connect their AGI account.
4. Plan and usage rules match the Slack assistant.
5. Approvals work in Teams like F106-07.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- It would need a signed inbound endpoint, an installation table and an account link, as Slack has [inferred from Slack structure].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Reuse the Slack turn pipeline and put a channel adapter in front.
- [proposed] Decide the product priority before building; no product doc for it was found in docs/product.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| integration | Microsoft Graph connector (Teams tools) | `apps/web/lib/connectors/microsoft-graph.ts` | Related read-only chat tools; not a bot |
| config | Connector scopes | `packages/contracts/cloud-contracts/src/connector-scopes.ts` | Names scopes for the Teams connector |
| config | Connector trust copy | `packages/contracts/cloud-contracts/src/connector-trust-copy.ts` | Describes Teams connector to users |
| other | Directory categorisation | `apps/web/lib/connectors/directory/categorize.ts` | Places Teams in the connector directory |
| service | Slack assistant (reference model) | `apps/web/lib/slack/slack-assistant.ts` | The nearest existing channel assistant to copy from |
| endpoint | POST /api/webhooks/slack | `apps/web/app/api/webhooks/slack/route.ts` | Reference inbound receiver |
| table | slack_installations | `apps/web/db/neon/0330_slack_app.sql` | Reference for an installation table |
| service | slack-links | `apps/web/lib/slack/slack-links.ts` | Reference for linking a channel account to AGI |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Nothing runs today. No Teams inbound path exists. | our servers | No file found; brief S106.15 status missing |
| The connector Teams tools run only when a person is already in an AGI conversation and has connected Microsoft. | outside service | apps/web/lib/connectors/microsoft-graph.ts:643-680 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| None for a Teams assistant | none found in the code | not applicable | not applicable |

**Models and providers.** Not applicable today. A future version would follow the Slack route: server routing on Cloud [proposed].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code |
| Permissions | none found in the code |
| Subscription | none found in the code for a Teams assistant; the Teams connector tools sit under connectors (PAID_TIERS in packages/contracts/types/src/billing-catalog.ts:350) |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Not applicable; nothing exists. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Any state | Not handled in the code; the feature does not exist | No Teams bot code found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- none found

**Test scenarios**

- **Confirm absence**
  1. Search the repository for Teams bot, Bot Framework or msteams handlers
  2. Look for an inbound route for Teams under apps/web/app/api
  - Expected: No bot code or route; only the Graph connector
- **Connector is not the assistant**
  1. Connect Microsoft in AGI
  2. Ask AGI in a normal conversation to list Teams chats
  - Expected: Chats are listed in AGI; nothing appears inside Teams
- **Future: DM the bot**
  1. Install the Teams app
  2. Send a message
  - Expected: [proposed] A reply in Teams

**Where to look when it fails**

- Not applicable until built

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No Teams assistant** Affects: Teams users; Web and Desktop. Evidence: Brief S106.15; no code. Work needed: Bot registration, signed receiver, install and link flow, policy, approvals, tests
- **No product requirement document** Affects: Planning. Evidence: No Teams entry in docs/product found. Work needed: Write requirement and priority
- **Decision record says messaging connectors cut** Affects: Planning. Evidence: docs/decisions/wire-or-cut.md:572. Work needed: Record a new decision before building
- Not built on: Web, Desktop (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- mode:cloud
- SYS-connectors-plugins-and-skills
- SYS-authentication-and-identity
- SYS-authorization-and-workspaces
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- F106-07
- F106-08
- F106-10

## Unknown

- Whether any Teams app manifest exists outside the searched folders
- Product priority and plan placement
- Whether the Graph connector Teams tools are enabled for users today
