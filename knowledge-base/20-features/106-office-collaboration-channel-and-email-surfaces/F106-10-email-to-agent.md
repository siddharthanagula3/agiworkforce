---
id: "F106-10"
type: "feature"
title: "Email-to-agent"
aliases: ["Email-to-task address (S106.17)", "Forward-email-to-agent (S106.18)", "Task replies within an email thread (S106.19)", "Email-to-agent"]
area: "106 Office, collaboration-channel, and email surfaces"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S106.17", "S106.18", "S106.19"]
depends_on: ["surface:web", "surface:desktop", "mode:cloud", "SYS-authentication-and-identity", "SYS-security-and-privacy", "SYS-agents-tools-and-automation", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "SYS-api-and-contracts", "F106-07", "F106-11"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F106-10 Email-to-agent

Intended: each user or workspace gets an AGI email address; mail or forwarded mail becomes a task and progress returns in the same thread. Today no inbound mail handler, address allocation or threaded reply exists on any app. A separate Gmail watch trigger exists but it watches a connected mailbox, not an agent address.

Area: [106. Office, collaboration-channel, and email surfaces](README.md). Requirement items: [S106.17](../../10-requirements/capabilities/106-office-collaboration-channel-and-email-surfaces.md#s10617), [S106.18](../../10-requirements/capabilities/106-office-collaboration-channel-and-email-surfaces.md#s10618), [S106.19](../../10-requirements/capabilities/106-office-collaboration-channel-and-email-surfaces.md#s10619).

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

**What it does.** Would let a person email or forward a message to AGI and have it act, replying in the thread. Today it does nothing.

**Why it exists.** S106.17 to S106.19: email is where much work arrives, and leaders let people hand work over by forwarding.

**Who uses it.** Intended: any AGI user or workspace member. Today: nobody.

**Problems it solves**

- Intended: copying email text into a chat
- Intended: getting results back where the work started

**Use cases**

- Intended: forward a client email and ask AGI to draft a reply
- Intended: cc the agent address on a thread to get a summary
- Intended: read progress as replies in the same thread

## 2. User experience

**Where to find it**

- None. No inbound mail endpoint, address setting or email approval was found in apps/web/app or apps/web/lib.
- Related but different: Gmail event trigger lets a connected Gmail mailbox start a trigger (apps/web/app/api/webhooks/gmail/route.ts:1-30; apps/web/lib/triggers/gmail-watch.ts).

**Before you start**

- Not applicable today

**Screens and controls**

- none found in the code

**Journey**

1. Not possible today. [proposed] Show an address in Settings, accept mail, reply in thread.

**What the person sees and gets**

- none

**Settings**

- none found in the code

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Gmail Pub/Sub push receiver and watch exist, feeding the trigger system for a connected Gmail account (apps/web/app/api/webhooks/gmail/route.ts; apps/web/lib/triggers/gmail-watch.ts:1-30). This is a mailbox trigger, not an agent address.

**Incomplete**

- nothing found

**Present but disconnected or switched off**

- Gmail watch is gated by connector release state (gmail-watch.ts:4 imports connectorsReleased and the coming-soon message); exact current state: unknown.

**Not available**

- Agent email address, inbound mail receiver, forwarded mail parsing, threaded replies, email approvals: not available on Web or Desktop (brief S106.17, S106.18, S106.19).

## 4. Required behaviour

**Established requirements**

- Each user or workspace gets an email address; mail sent to it creates a task for the agent. (source: S106.17)
- A user forwards an email to the agent and the agent acts on it. (source: S106.18)
- When a task came from email, the agent posts progress or results as replies in the same email thread. (source: S106.19)

**Acceptance criteria**

1. A user can see their agent address.
2. Mail to the address creates a task owned by that user and appears as a conversation.
3. Mail from an unknown sender is refused or held.
4. A forwarded message is read with its original content.
5. Replies stay in the same thread.
6. Plan, usage and approval rules match Slack tasks.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Sender authentication and spoofing checks will be needed, since mail from the internet is untrusted [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Reuse the task creation of the Slack path (slack-tasks.ts) behind an email adapter.
- [proposed] Limit accepted senders to linked addresses by default.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/webhooks/gmail | `apps/web/app/api/webhooks/gmail/route.ts` | Related: Gmail push notices for triggers |
| service | gmail-watch | `apps/web/lib/triggers/gmail-watch.ts` | Related: starts and reads Gmail watches |
| service | trigger-ingest | `apps/web/lib/triggers/trigger-ingest.ts` | Related: turns external events into trigger runs |
| service | trigger-types | `apps/web/lib/triggers/trigger-types.ts` | Related: Gmail trigger event types |
| service | slack-tasks | `apps/web/lib/slack/slack-tasks.ts` | Reference for turning a channel message into a task |
| service | slack-assistant | `apps/web/lib/slack/slack-assistant.ts` | Reference for replying in the same thread |
| service | notification-service | `apps/web/lib/services/notification-service.ts` | Reference for in-app notices |
| config | connector scopes | `packages/contracts/cloud-contracts/src/connector-scopes.ts` | Gmail scope names for the related trigger |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Nothing runs for an agent address. | our servers | No inbound mail code found; brief S106.17-S106.19 missing |
| Related: Google sends a Pub/Sub push to the Gmail receiver, which verifies the sender identity and ingests a trigger event. | outside service | apps/web/app/api/webhooks/gmail/route.ts:1-30 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| None for email-to-agent | none found in the code | not applicable | not applicable |

**Models and providers.** Not applicable today. [proposed] Server routing on Cloud as for Slack.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code |
| Permissions | none found in the code |
| Subscription | none found in the code for email-to-agent |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Not applicable; nothing exists. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Any state | Not handled in the code; the feature does not exist | No inbound mail code found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/webhooks/gmail/route.test.ts`: Gmail push receiver (related trigger, not email-to-agent)

**Test scenarios**

- **Confirm absence**
  1. Look in Settings for an agent email address
  2. Search routes for an inbound mail receiver
  - Expected: None found
- **Gmail trigger is not the address**
  1. Connect Gmail and create a Gmail trigger
  2. Email the connected mailbox
  - Expected: The trigger may fire; no reply appears in the email thread
- **Future forward**
  1. Forward a message to the agent address
  - Expected: [proposed] A task appears and a reply arrives in the thread

**Where to look when it fails**

- Not applicable until built; for the related trigger check the Gmail route logs

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No agent email address** Affects: All users; Web and Desktop. Evidence: Brief S106.17. Work needed: Address allocation and inbound receiver
- **No forwarded-mail handling** Affects: All users. Evidence: Brief S106.18. Work needed: Parse forwarded content, sender checks
- **No threaded replies** Affects: All users. Evidence: Brief S106.19. Work needed: Outbound mail with thread headers
- **No product doc** Affects: Planning. Evidence: No email-to-agent entry found in docs/product. Work needed: Write requirement
- Not built on: Web, Desktop (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- mode:cloud
- SYS-authentication-and-identity
- SYS-security-and-privacy
- SYS-agents-tools-and-automation
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- SYS-api-and-contracts
- F106-07
- F106-11

## Unknown

- Whether an inbound mail provider is planned or chosen
- Whether the Gmail trigger is switched on in production
- Product priority
