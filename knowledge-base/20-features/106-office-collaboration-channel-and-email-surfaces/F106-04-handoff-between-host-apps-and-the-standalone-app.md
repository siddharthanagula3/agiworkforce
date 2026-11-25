---
id: "F106-04"
type: "feature"
title: "Handoff between host apps and the standalone app"
aliases: ["Shared conversation context across supported host applications", "Native-host and standalone-app handoff", "S106.12", "S106.25"]
area: "106 Office, collaboration-channel, and email surfaces"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S106.12", "S106.25"]
depends_on: ["F106-01", "F106-02", "surface:web", "surface:desktop", "surface:chrome", "SYS-sync-and-continuity", "SYS-memory-projects-and-context", "SYS-execution-boundaries", "table:web_conversations"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F106-04 Handoff between host apps and the standalone app

Planned continuity: one assistant conversation moves between host apps (for example Word to Excel) and between a host pane and the standalone AGI app, keeping context. No code links any host to a conversation today. Web, desktop and, for S106.25, Chrome are marked missing.

Area: [106. Office, collaboration-channel, and email surfaces](README.md). Requirement items: [S106.12](../../10-requirements/capabilities/106-office-collaboration-channel-and-email-surfaces.md#s10612), [S106.25](../../10-requirements/capabilities/106-office-collaboration-channel-and-email-surfaces.md#s10625).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Would let a person continue one conversation across host apps and in the main AGI app. Today there is no host pane, so nothing exists to hand off.

**Why it exists.** The brief requires shared context across hosts and a handoff between a host add-in session and the standalone app (doc: knowledge-base/data/area-briefs/106-office-collaboration-channel-and-email-surfaces.md, S106.12 and S106.25).

**Who uses it.** People who work across several Office or Google files in one task.

**Problems it solves**

- Re-explaining context when switching apps.
- Losing an in-host session when the person wants a bigger screen.

**Use cases**

- Start in Word, continue the same chat in Excel.
- Open a pane session in the AGI web app to finish it.
- Return from the AGI app to the file.

## 2. User experience

**Where to find it**

- No app has it. Web missing, desktop missing; Chrome missing for S106.25.

**Before you start**

- Host panes (F106-01, F106-02) must exist.

**Screens and controls**

- None exist.

**Journey**

1. Intended [proposed]: pane shows an Open in AGI action; the AGI app opens the same conversation; a return link opens the file.
2. Today: none.

**What the person sees and gets**

- None.

**Settings**

- None found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nothing for host handoff.

**Incomplete**

- nothing found

**Present but disconnected or switched off**

- Standalone conversations are stored in web_conversations (apps/web/db/neon/0001_mvp_chat.sql:3). A Slack task already opens a conversation there and links to it with a Work link (apps/web/lib/slack/slack-tasks.ts:78-91, 209-211). This shows a conversation can be created from an outside surface, but nothing links it to an Office or Google host.

**Not available**

- Cross-host shared context and host-to-app handoff on web, desktop and Chrome (brief S106.12 and S106.25).

## 4. Required behaviour

**Established requirements**

- One assistant conversation carries across the supported host apps with its context. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S106.12)
- A session started in a host add-in can be opened in the standalone app and back with its context. (source: S106.25 (same brief))

**Acceptance criteria**

1. A conversation started in one host appears in a second host with its history.
2. Opening a host session in the AGI app shows the same messages.
3. Returning to the host keeps the context.
4. A different person cannot open another person's session.
5. Deleting the conversation removes it in every host.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The conversation id would be the carrier of context, as it is for Slack tasks [inferred from apps/web/lib/slack/slack-tasks.ts:78-91].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Reuse web_conversations and the product link helper so a host session is a normal conversation with an origin tag.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | Area brief S106.12 and S106.25 | `knowledge-base/data/area-briefs/106-office-collaboration-channel-and-email-surfaces.md` | Only record of the requirement. |
| table | web_conversations | `apps/web/db/neon/0001_mvp_chat.sql` | Conversation table that could carry host sessions. |
| service | Slack task conversation creation | `apps/web/lib/slack/slack-tasks.ts` | Working example of an outside surface creating a conversation and linking back to AGI. |
| service | Persist conversation message | `apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts` | Writes messages into a conversation; used by the Slack task code. |
| service | Product link builder | `packages/contracts/types/src/product-links.ts` | Defines productLinkUrl, which slack-tasks.ts uses to build links into the AGI app. |
| table | Shared conversations migration | `apps/web/db/neon/0021_shared_conversations.sql` | Existing shared conversation migration; related base [inferred]. |
| config | Chrome extension manifest | `apps/extension/manifest.json` | Chrome app marked missing for S106.25. |
| hook | Desktop deep link handler | `apps/desktop/src/hooks/useDeepLink.ts` | Handles links into the desktop app; a handoff target could use it [inferred]. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Nothing runs; no host session exists. | device | No host code in the repository. |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| None for host handoff. | not applicable | not applicable | not applicable |

**Models and providers.** Not applicable today.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code |
| Permissions | none found in the code |
| Subscription | none found in the code |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | unknown |
| Provider restrictions | none found in the code |
| Local mode | Not applicable today; unknown whether a local session could be handed to the cloud app (AGENTS.md section 6 forbids silent Local to cloud moves). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| All states | not handled in the code | Feature does not exist. |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/slack/slack-tasks.thread.test.ts`: A Slack thread continues one conversation. Related pattern only; not a host handoff.

**Test scenarios**

- **Confirm absence**
  1. Search apps for any host session id, add-in origin or handoff link.
  - Expected: None found.
- **Future handoff**
  1. Start a pane session in Word.
  2. Choose Open in AGI.
  - Expected: The AGI app shows the same messages.
- **Future cross-host**
  1. Continue the session in Excel.
  - Expected: History is present.
- **Future privacy**
  1. Open the handoff link as another account.
  - Expected: Access refused.

**Where to look when it fails**

- No logs or tables exist.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No handoff between host apps or between a host and the standalone app.** Affects: Web, desktop and Chrome users.. Evidence: Brief S106.12 and S106.25 mark them missing.. Work needed: Add a host session model, link format, access checks and return path.
- **Local to cloud handoff rules are undefined.** Affects: Desktop and mobile users who run Local.. Evidence: AGENTS.md section 6 requires an explicit consented fork for Local to BYOK or cloud moves; no host design exists.. Work needed: Decide and document consent rules.
- Not built on: Web, Desktop, Chrome (from the capability ledger).

**Depends on**

- F106-01
- F106-02
- surface:web
- surface:desktop
- surface:chrome
- SYS-sync-and-continuity
- SYS-memory-projects-and-context
- SYS-execution-boundaries
- table:web_conversations

## Unknown

- How host sessions would be identified; no design found.
- Whether handoff would use deep links on desktop; only inferred from the deep link hook.
