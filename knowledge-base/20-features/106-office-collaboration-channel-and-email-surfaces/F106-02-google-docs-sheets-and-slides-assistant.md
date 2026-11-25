---
id: "F106-02"
type: "feature"
title: "Google Docs, Sheets and Slides assistant"
aliases: ["Assistant inside Google Docs", "Assistant inside Google Sheets", "Assistant inside Google Slides", "Google Workspace add-on", "S106.05", "S106.06", "S106.07"]
area: "106 Office, collaboration-channel, and email surfaces"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S106.05", "S106.06", "S106.07"]
depends_on: ["surface:web", "surface:desktop", "mode:cloud", "SYS-chat-turn-pipeline", "SYS-subscriptions-entitlements-and-usage", "SYS-connectors-plugins-and-skills", "SYS-security-and-privacy", "file:apps/web/lib/connectors/google-user-data-runs.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F106-02 Google Docs, Sheets and Slides assistant

Planned assistant pane inside Google Docs, Sheets and Slides that would work on the open file. Nothing exists. The Google Docs code in the repository is about previewing and saving AGI artifacts to Google Docs, which is a different feature. Web and desktop are marked missing in the brief.

Area: [106. Office, collaboration-channel, and email surfaces](README.md). Requirement items: [S106.05](../../10-requirements/capabilities/106-office-collaboration-channel-and-email-surfaces.md#s10605), [S106.06](../../10-requirements/capabilities/106-office-collaboration-channel-and-email-surfaces.md#s10606), [S106.07](../../10-requirements/capabilities/106-office-collaboration-channel-and-email-surfaces.md#s10607).

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

**What it does.** Would put an AGI assistant inside Google Docs, Sheets and Slides. Today it does not exist.

**Why it exists.** The brief requires a pane in each Google editor that reads and changes the open file (doc: knowledge-base/data/area-briefs/106-office-collaboration-channel-and-email-surfaces.md, S106.05 to S106.07).

**Who uses it.** People and teams who work in Google Workspace.

**Problems it solves**

- Copy and paste between Google files and the assistant.
- No file context when asking for help.

**Use cases**

- Ask the Docs pane to summarise the open document.
- Ask the Sheets pane to write a formula.
- Ask the Slides pane to shorten a slide's text.

## 2. User experience

**Where to find it**

- No app has it. Web: missing. Desktop: missing (brief S106.05 to S106.07).

**Before you start**

- Not possible today.

**Screens and controls**

- None. The related Google Docs artifact preview lives in apps/web/features/chat/components/artifacts (test: ArtifactPreview.googleDocs.test.tsx). It saves AGI artifacts to Google Docs from the AGI app; it is not a pane inside Google.

**Journey**

1. Intended [proposed]: open the add-on in a Google file, type a request, get a reply or an edit.
2. Today: no journey.

**What the person sees and gets**

- None today.

**Settings**

- None found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nothing for this feature.

**Incomplete**

- nothing found

**Present but disconnected or switched off**

- Google Docs artifact preview and save exists in the web chat (apps/web/features/chat/components/artifacts/ArtifactPreview.googleDocs.test.tsx covers it). It is a different feature.

**Not available**

- Docs, Sheets and Slides panes on web and desktop (brief S106.05 to S106.07).
- Any Google Workspace add-on or Apps Script code in any app (search for appsscript and CardService returned nothing).

## 4. Required behaviour

**Established requirements**

- An assistant pane runs inside Google Docs and can read and change the open document through the host. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S106.05)
- The same for Google Sheets. (source: S106.06 (same brief))
- The same for Google Slides. (source: S106.07 (same brief))

**Acceptance criteria**

1. The pane opens inside a Google Doc, Sheet and Slide.
2. The pane reads the open file correctly.
3. A requested change is written to the file.
4. Signed-out and no-plan states show clear messages.
5. Usage counts against the AGI subscription.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Google data reaching models is subject to Google API rules; the Slack code already withholds Google tools for that reason, so a pane would need an explicit policy (apps/web/lib/slack/slack-assistant-turn.ts:494-497) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Share the host-adapter design with F106-01 so both families use one chat core.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | Area brief S106.05 to S106.07 | `knowledge-base/data/area-briefs/106-office-collaboration-channel-and-email-surfaces.md` | Only record of the requirement. |
| test | Google Docs artifact preview test | `apps/web/features/chat/components/artifacts/ArtifactPreview.googleDocs.test.tsx` | Covers the different artifact-to-Google-Docs feature. |
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Artifact preview that hosts the Google Docs save action [inferred from the test import]. |
| service | Google user data run guard | `apps/web/lib/connectors/google-user-data-runs.ts` | Existing rules for Google data in unattended runs; related policy. |
| service | Entitlement resolution | `apps/web/lib/services/entitlement-resolution.ts` | Plan rules a pane would reuse [inferred]. |
| schema | Billing plan capabilities | `packages/contracts/types/src/billing-catalog.ts` | No Google editor capability exists in the list. |
| other | Connector OAuth app runbook | `docs/runbooks/connector-oauth-apps.md` | Covers Google OAuth setup for connectors, not an add-on. |
| table | web_conversations | `apps/web/db/neon/0001_mvp_chat.sql` | Conversation table a pane could store into [inferred]. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Nothing runs; no add-on exists. | device | Search for appsscript and CardService in apps and packages returned no file. |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| None. | not applicable | not applicable | not applicable |

**Models and providers.** Not applicable today.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code |
| Permissions | none found in the code |
| Subscription | No capability for Google editor panes in the capability table (packages/contracts/types/src/billing-catalog.ts:343-362). |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | unknown; not designed |
| Provider restrictions | Google data handling limits exist for Slack runs; none are defined for a pane (unknown). |
| Local mode | Not applicable today; unknown whether a pane could use local inference. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| All states | not handled in the code; the feature does not exist | No add-on code found. |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/ArtifactPreview.googleDocs.test.tsx`: A different feature: artifact preview and save to Google Docs. It does not test an in-Google pane.

**Test scenarios**

- **Confirm absence**
  1. Search apps and packages for appsscript, CardService, a Workspace add-on manifest.
  - Expected: No results.
- **Future Docs read**
  1. Install the add-on in a test Google Doc.
  2. Ask the pane to quote the title.
  - Expected: Correct title.
- **Future write-back**
  1. Ask the pane to change a sentence.
  - Expected: The doc changes.

**Where to look when it fails**

- No logs or tables exist.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No Google Docs, Sheets or Slides assistant.** Affects: Web and desktop users in Google Workspace.. Evidence: Brief S106.05 to S106.07 mark web and desktop missing.. Work needed: Design and build the add-on, OAuth and data-use policy, and subscription wiring.
- Not built on: Web, Desktop (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- mode:cloud
- SYS-chat-turn-pipeline
- SYS-subscriptions-entitlements-and-usage
- SYS-connectors-plugins-and-skills
- SYS-security-and-privacy
- file:apps/web/lib/connectors/google-user-data-runs.ts

## Unknown

- Whether Google would require app verification for the needed scopes; not researched here.
- No product decision on the add-on technology was found.
