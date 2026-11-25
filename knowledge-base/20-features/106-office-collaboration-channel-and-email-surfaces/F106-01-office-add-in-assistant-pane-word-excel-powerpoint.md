---
id: "F106-01"
type: "feature"
title: "Office add-in assistant pane (Word, Excel, PowerPoint, Outlook)"
aliases: ["Assistant inside Word", "Assistant inside Excel", "Assistant inside PowerPoint", "Assistant inside Outlook", "Office add-in", "S106.01", "S106.02", "S106.03", "S106.04"]
area: "106 Office, collaboration-channel, and email surfaces"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S106.01", "S106.02", "S106.03", "S106.04"]
depends_on: ["surface:web", "surface:desktop", "mode:cloud", "SYS-chat-turn-pipeline", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-connectors-plugins-and-skills", "file:apps/web/lib/connectors/microsoft-graph.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F106-01 Office add-in assistant pane (Word, Excel, PowerPoint, Outlook)

Planned side pane inside Word, Excel, PowerPoint and Outlook that would read and change the open file or message through the Office host. Nothing exists in the repository today. No add-in manifest, pane page or Office host code was found in any app. Web and desktop are marked missing in the brief.

Area: [106. Office, collaboration-channel, and email surfaces](README.md). Requirement items: [S106.01](../../10-requirements/capabilities/106-office-collaboration-channel-and-email-surfaces.md#s10601), [S106.02](../../10-requirements/capabilities/106-office-collaboration-channel-and-email-surfaces.md#s10602), [S106.03](../../10-requirements/capabilities/106-office-collaboration-channel-and-email-surfaces.md#s10603), [S106.04](../../10-requirements/capabilities/106-office-collaboration-channel-and-email-surfaces.md#s10604).

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

**What it does.** Would give people an AGI assistant pane inside each Office app, working on the open document or email through the host. Today this does not exist; the only related code is an outbound Microsoft Graph connector that reaches Outlook mail from the AGI app, which is a different thing (apps/web/lib/connectors/microsoft-graph.ts:19).

**Why it exists.** The brief requires an assistant pane in each Office app that can read and change the open file (doc: knowledge-base/data/area-briefs/106-office-collaboration-channel-and-email-surfaces.md, S106.01 to S106.04). The leading assistants offer in-host panes, which makes this a parity item [inferred].

**Who uses it.** Office workers who draft, edit and analyse files and email and do not want to leave the Office app.

**Problems it solves**

- Copying text between Office and the assistant by hand.
- Losing document context when asking for help outside the file.

**Use cases**

- Ask the Word pane to tighten a paragraph in the open document.
- Ask the Excel pane to explain a formula in the open sheet.
- Ask the Outlook pane to draft a reply to the open message.
- Ask the PowerPoint pane to tidy the wording on a slide.

## 2. User experience

**Where to find it**

- No app has it. Web: missing. Desktop: missing (brief S106.01 to S106.04).
- Mobile, CLI, VS Code extension and Chrome extension: not applicable per the brief.

**Before you start**

- Not possible today. Intended prerequisites are unknown; none are recorded in the code or product docs I read.

**Screens and controls**

- None exist. No pane page, ribbon button or manifest was found in apps/web, apps/desktop, apps/extension, apps/cli, apps/extension-vscode or apps/mobile (search for Office.onReady, office-js, OfficeApp and appsscript returned nothing).

**Journey**

1. Intended [proposed]: open the add-in from the ribbon, type a request in the pane, see a reply, accept the change.
2. Today: no journey is possible.

**What the person sees and gets**

- None today.

**Settings**

- None found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nothing for this feature.

**Incomplete**

- None; there is no partial code.

**Present but disconnected or switched off**

- An outbound Microsoft Graph connector exists with connector ids outlook, onedrive, sharepoint and teams (apps/web/lib/connectors/microsoft-graph.ts:19). It lets the AGI web chat call Microsoft services with the person's OAuth grant. It is not an Office add-in and does not run inside Office. Its tools were not read in depth.

**Not available**

- Word, Excel, PowerPoint and Outlook panes on web and desktop (doc: knowledge-base/data/area-briefs/106-office-collaboration-channel-and-email-surfaces.md, S106.01 to S106.04).
- Any add-in manifest or Office host code in every app (search found none).

## 4. Required behaviour

**Established requirements**

- An assistant pane runs inside Word and can read and change the open document through the host. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S106.01)
- The same for Excel. (source: S106.02 (same brief))
- The same for PowerPoint. (source: S106.03 (same brief))
- An assistant pane runs inside Outlook and can read and change the open message through the host. (source: S106.04 (same brief))

**Acceptance criteria**

1. From the Word ribbon a person can open the AGI pane on the open document.
2. The pane can read the open document text and report it back correctly.
3. A requested change is written to the open document through the host.
4. The same checks pass for Excel, PowerPoint and Outlook (message).
5. Signing out or an exhausted plan shows a clear message in the pane, not a blank pane.
6. Usage from the pane is counted against the same AGI subscription as the other apps.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Each pane will need a signed-in AGI account and Cloud mode, because the chat pipeline that exists is managed by our servers [inferred from SYS-chat-turn-pipeline and Slack code using managed routing].
- The pane must use the shared subscription rules, as every capability does (product context).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Build one shared pane page hosted by the web app, with a thin host adapter per Office app, so one chat core serves all four.
- [proposed] Decide first whether local (on-device) inference is reachable from a pane; unknown today.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | Area brief S106.01 to S106.04 | `knowledge-base/data/area-briefs/106-office-collaboration-channel-and-email-surfaces.md` | Only record of the requirement; states web and desktop missing. |
| service | Microsoft Graph connector adapter | `apps/web/lib/connectors/microsoft-graph.ts` | Existing outbound connector for outlook, onedrive, sharepoint, teams. Related base, not an add-in. |
| config | Connector catalog entries outlook and microsoft-365 | `apps/web/lib/connectors/catalog.ts` | Lists the connector entries the web app offers; related, not the feature. |
| config | Chrome extension manifest | `apps/extension/manifest.json` | Shows the Chrome extension is a browser extension; it holds no Office host code. |
| service | Chat turn pipeline | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Shared managed chat path a pane would call [inferred]; imported by the Slack turn code. |
| service | Entitlement resolution | `apps/web/lib/services/entitlement-resolution.ts` | Where plan rules resolve; a pane would reuse it [inferred]. |
| schema | Billing plan capabilities | `packages/contracts/types/src/billing-catalog.ts` | Capability list; has no Office capability today (search found none for Office). |
| table | web_conversations | `apps/web/db/neon/0001_mvp_chat.sql` | Existing conversation table a pane could store into [inferred]. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Nothing runs. No add-in exists, so no step from the person's action to a result exists. | device | Search of apps and packages for Office.onReady, office-js, OfficeApp and appsscript returned no file. |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| None created by this feature. | not applicable | not applicable | not applicable |

**Models and providers.** Not applicable today. An eventual pane would need a route through the model catalog and routing system (SYS-model-catalog-and-routing); how it would work is undecided.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code |
| Permissions | none found in the code |
| Subscription | No capability for Office panes exists in the plan capability table (packages/contracts/types/src/billing-catalog.ts:317-360 lists the capabilities; none is for Office). |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | unknown; not designed |
| Provider restrictions | none found in the code |
| Local mode | Not applicable today. Whether a pane could use on-device inference is unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Any state (loading, empty, error, offline) | not handled in the code; the feature does not exist | No Office host code found. |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- none found

**Test scenarios**

- **Confirm absence**
  1. Search apps and packages for Office.onReady, office-js, OfficeApp, manifest.xml with an OfficeApp root.
  2. Look in apps/extension and apps/desktop for any Office host entry.
  - Expected: No results. If results appear, update this page and the brief.
- **Future Word pane read**
  1. Sideload the add-in in Word.
  2. Open a document with known text.
  3. Ask the pane to quote the first sentence.
  - Expected: The pane quotes the exact sentence.
- **Future write-back**
  1. Ask the pane to change one word.
  2. Check the document.
  - Expected: The change appears in the document.
- **Future signed-out state**
  1. Open the pane while signed out.
  - Expected: A sign-in prompt, not an error.

**Where to look when it fails**

- No log lines or tables exist for this feature.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No Office add-in at all for Word, Excel, PowerPoint or Outlook.** Affects: Web and desktop users who work in Office.. Evidence: Brief S106.01 to S106.04 mark web and desktop missing; code search found nothing.. Work needed: Design, build and publish add-ins and a host bridge; decide hosting, auth and subscription rules.
- Not built on: Web, Desktop (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- mode:cloud
- SYS-chat-turn-pipeline
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-connectors-plugins-and-skills
- file:apps/web/lib/connectors/microsoft-graph.ts

## Unknown

- Which Office add-in technology and hosting would be used; no decision document found.
- Whether any doc under docs/specs covers this; not searched exhaustively.
- Whether the Microsoft Graph connector tools could be reused by a pane.
