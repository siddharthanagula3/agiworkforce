---
id: "F032-01"
type: "feature"
title: "Start a design from a brief"
aliases: ["Design from a brief", "Design brief", "DesignBriefDialog", "S32.01", "Create design", "Update design"]
area: "32 Design workspace"
available_on: ["web", "desktop"]
implementation: {web: "built", desktop: "built", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S32.01"]
depends_on: ["surface:web", "surface:desktop", "mode:local", "mode:own-key", "mode:cloud", "SYS-chat-turn-pipeline", "SYS-files-artifacts-and-storage", "SYS-shared-ui-and-design", "file:apps/web/features/chat/components/artifacts/design/design-brief.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F032-01 Start a design from a brief

On the web app, a person fills a short form (format, goal, audience, style, content, layout) and the app asks the model for one self-contained HTML design. The brief is stored inside the design as a comment, so it can be reopened and revised. No other app has this in the code opened.

Area: [32. Design workspace](README.md). Requirement items: [S32.01](../../10-requirements/capabilities/032-design-workspace.md#s3201).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Collects a structured brief in a dialog, turns it into a chat request for a single HTML design, and asks the model to keep the brief as an HTML comment in every later version. A later 'Design brief' menu item reads it back and sends a revision request (apps/web/features/chat/components/artifacts/design/design-brief.ts:84-106).

**Why it exists.** So the first draft matches what the person wants and the intent stays with the design instead of being lost in chat. Item S32.01 requires a brief the workspace keeps with the design (doc: knowledge-base/data/area-briefs/032-design-workspace.md).

**Who uses it.** Web chat users who want a landing page, app screen, dashboard, poster, email or one-pager (design-brief.ts:1-9).

**Problems it solves**

- Vague one-line prompts that give a design nobody wanted.
- Losing the original intent after many chat edits.
- Retyping the same requirements for each revision.

**Use cases**

- Create a landing page for small-business owners in a minimal style.
- Reopen the brief on an existing design, change the audience, send 'Update design'.
- Create a dashboard and list the sections it must include.

## 2. User experience

**Where to find it**

- Web: 'New from template' menu, group 'Designs', item 'Design from a brief' (templates/NewArtifactMenu.tsx:14,87-91); shown only when the page passes an onRequestEdits handler (NewArtifactMenu.tsx:82-93).
- Web: artifact panel 'more' menu item 'Design brief', for an HTML artifact in the panel with a stored brief, on the latest version, when onRequestEdits exists (ArtifactPreview.tsx:2214-2216,2429-2436).
- Desktop: the public Desktop shows the hosted web app, so it gets this by that route (doc: AGENTS.md section 5) [inferred]. The Tauri build in apps/desktop/src: no brief code found.
- Mobile, CLI, VS Code, Chrome: no brief code found by search of apps/mobile/src, apps/extension/src, apps/extension-vscode, apps/cli/src.

**Before you start**

- A web chat where onRequestEdits sends a message to the model. Which page supplies it: unknown.
- For revisions: the design must be HTML and carry a brief comment (ArtifactPreview.tsx:2214-2216).

**Screens and controls**

- Dialog 'Design from a brief' (data-testid design-brief-dialog) with fields: 'What you are designing' select (Landing page, App screen, Dashboard, Poster or flyer, Email, One-pager, Other), 'Goal' (required text), 'Audience', 'Style' chips (Minimal, Bold, Playful, Corporate, Editorial, Technical) plus 'Style notes', 'Content to include', 'Layout', buttons 'Cancel' and the submit button (DesignBriefDialog.tsx:63-174).
- Submit label is 'Create design' when starting and 'Update design' when revising (NewArtifactMenu.tsx:115; ArtifactPreview.tsx:3375).

**Journey**

1. Open 'New from template' and choose 'Design from a brief'.
2. Pick a format and write the goal; optionally set audience, style, content, layout.
3. Press 'Create design'; the submit button stays disabled until goal and format are filled (DesignBriefDialog.tsx:169; design-brief.ts:46-48).
4. The dialog sends the request; if it was sent the dialog closes (DesignBriefDialog.tsx:48-52).
5. The model replies with an HTML block; the brief rides along as a comment.
6. Later, open 'Design brief' in the panel menu, edit, and press 'Update design' to send a revision request.

**What the person sees and gets**

- Error toast 'The design request was not sent. Try again.' when sending fails (NewArtifactMenu.tsx:118).
- Error toast 'The change request was not sent. Try again.' on a failed revision (ArtifactPreview.tsx:3380).
- Output is the model's HTML design, shown in the artifact preview.

**Settings**

- none found in the code for the brief itself.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Dialog, brief type, request builders and brief reader exist and are wired to the New menu and the panel (design-brief.ts; DesignBriefDialog.tsx; NewArtifactMenu.tsx:111-122; ArtifactPreview.tsx:3369-3384).
- Fields are trimmed and cut to 1000 characters on read (design-brief.ts:38,42-44).
- '--' inside the brief is rewritten so it cannot close the HTML comment (design-brief.ts:80-82).
- readDesignBrief returns null when the comment is missing, the JSON is bad, or both goal and format are empty (design-brief.ts:50-66).

**Incomplete**

- The brief is kept only if the model obeys the instruction to repeat the comment; the app does not insert it itself (design-brief.ts:84-95) [inferred].
- The brief status in the area brief says 'missing' for web; the code contradicts that.

**Present but disconnected or switched off**

- Both entry points are hidden when onRequestEdits is not passed (NewArtifactMenu.tsx:82; ArtifactPreview.tsx:3369).

**Not available**

- Mobile, CLI, VS Code, Chrome: no brief code found.
- Tauri desktop source: no brief code found.
- The brief form does not ask for audience-based reference images or files.

## 4. Required behaviour

**Established requirements**

- The user starts a design from a structured brief that the workspace keeps with the design. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S32.01)
- Visual design workspace must be AGI-owned in look and wording, not copied from another product. (source: docs/product/requirements.md:1495-1497)

**Acceptance criteria**

1. 'Design from a brief' appears under 'Designs' in the New menu on web when edits can be sent.
2. The submit button is disabled while goal is empty.
3. Submit sends one request containing every filled field and the format.
4. The generated HTML begins with the artifact marker and a brief comment.
5. 'Design brief' in the panel menu opens with the stored values and sends a revision on 'Update design'.
6. A design without a brief comment shows no 'Design brief' item.
7. A failed send shows the error toast and keeps the dialog open.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The brief should survive version restore, which only holds if the old version text includes the comment [inferred].

**Proposed improvements** (suggestions, not requirements)

- Insert the brief comment in the app instead of relying on the model.
- Add the brief on mobile and Chrome through the shared unified-chat package [proposed].

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | design-brief.ts | `apps/web/features/chat/components/artifacts/design/design-brief.ts` | Brief type, formats, styles, ready check, reader and request builders. |
| component | DesignBriefDialog | `apps/web/features/chat/components/artifacts/design/DesignBriefDialog.tsx` | The form dialog. |
| component | NewArtifactMenu | `apps/web/features/chat/components/artifacts/templates/NewArtifactMenu.tsx` | Entry 'Design from a brief' and create-request sender. |
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Reads the stored brief, adds 'Design brief' menu item, sends revision. |
| test | DesignBrief.test.tsx | `apps/web/features/chat/components/artifacts/design/DesignBrief.test.tsx` | Tests for builder, New menu and panel revision. |
| component | Dialog primitives | `packages/ui` | Dialog and Button from @agiworkforce/ui used by the form (DesignBriefDialog.tsx:4-11). |
| service | onRequestEdits handler | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Prop that sends the request into chat; its page-level supplier was not traced. |
| other | area brief | `knowledge-base/data/area-briefs/032-design-workspace.md` | Source of item S32.01 and its status. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person fills the dialog; state is held in React on the device. | device | DesignBriefDialog.tsx:30-53 |
| buildDesignFromBriefRequest makes a text prompt; onRequestEdits submits it as a chat message. | device | design-brief.ts:84-95; NewArtifactMenu.tsx:117 |
| The chat turn goes to the selected model route (Local, own key or Cloud depending on the user's chat settings). | outside service | unknown: route not traced; see SYS-chat-turn-pipeline |
| The HTML reply is stored as an artifact; the brief comment is part of its text and read back with readDesignBrief. | device | ArtifactPreview.tsx:2214-2216 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Brief JSON inside an HTML comment in the artifact source | the artifact content in the web artifacts store | unknown: sync of artifacts not traced | follows the artifact; no separate deletion |

**Models and providers.** The brief is plain text sent to whichever model answers the chat. No model name or provider is referenced in the brief code (design-brief.ts). The design quality depends on the model obeying the format request.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the brief code; chat itself may need sign-in (see SYS-authentication-and-identity). |
| Permissions | none found in the code. |
| Subscription | none found in the code for the brief; the chat turn it triggers is metered by the chat pipeline [inferred]. |
| Limits and metering | Each field is cut to 1000 characters on read (design-brief.ts:38). No other limit found. |
| Feature flags | none found in the code. |
| Model compatibility | Any model that returns an html fenced block; none is named in the code. |
| Provider restrictions | none found in the code. |
| Local mode | The brief code makes no network call itself; with a Local model the turn would run on the device [inferred]. Not verified. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| required goal empty | Submit disabled and the textarea is marked required. | DesignBriefDialog.tsx:96,169 |
| send fails | Toast and dialog stays open. | NewArtifactMenu.tsx:117-120 |
| stored source has no brief | readDesignBrief returns null, no menu item. | design-brief.ts:50-53 |
| corrupt brief JSON | Treated as no brief. | design-brief.ts:63-65 |
| older version shown | 'Design brief' item hidden unless latest version. | ArtifactPreview.tsx:2429 |
| offline, timeout, cancel | Cancel closes the dialog; offline and timeout not handled in the brief code. | DesignBriefDialog.tsx:164-166 |
| accessibility | Labels, aria-pressed on style chips and a 44px minimum touch height on small screens are set. | DesignBriefDialog.tsx:108-135 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/design/DesignBrief.test.tsx`: Request carries and reads back the brief; New menu starts a design; panel opens the kept brief and sends a revision.

**Test scenarios**

- **Create from brief**
  1. Open web chat
  2. New from template > Design from a brief
  3. Enter a goal, press Create design
  - Expected: A chat request with the brief lines is sent and the dialog closes.
- **Goal required**
  1. Open the dialog
  2. Leave goal empty
  - Expected: Submit is disabled.
- **Revise**
  1. Open a generated design
  2. More > Design brief
  3. Change style, Update design
  - Expected: Revision request starts with 'Revise the design'.
- **No brief**
  1. Open a design without a brief comment
  2. Open More menu
  - Expected: No 'Design brief' item.
- **Send failure**
  1. Make onRequestEdits return false
  - Expected: Error toast and dialog stays open.

**Where to look when it fails**

- Toast texts 'The design request was not sent. Try again.' and 'The change request was not sent. Try again.'
- Inspect the artifact source for a brief comment.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/032-design-workspace.md](../../70-qa/test-plans/web/032-design-workspace.md)
- Desktop: [70-qa/test-plans/desktop/032-design-workspace.md](../../70-qa/test-plans/desktop/032-design-workspace.md)

## 10. Gaps and dependencies

- **Area brief says S32.01 is missing, but web code exists** Affects: Brief accuracy for web. Evidence: design-brief.ts; NewArtifactMenu.tsx:87. Work needed: Update the status in the area brief.
- **No brief on mobile, Chrome, VS Code, CLI** Affects: Those apps. Evidence: no matches in app source searches. Work needed: Decide scope, then reuse the shared builder.
- **Brief persistence depends on model compliance** Affects: All web users. Evidence: design-brief.ts:84-95. Work needed: Add the comment in the app.
- Not built on: Mobile, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- mode:local
- mode:own-key
- mode:cloud
- SYS-chat-turn-pipeline
- SYS-files-artifacts-and-storage
- SYS-shared-ui-and-design
- file:apps/web/features/chat/components/artifacts/design/design-brief.ts

## Unknown

- Which web page passes onRequestEdits and whether it is on every web chat route.
- Whether artifacts sync across devices.
- Whether the Tauri desktop or Chrome side panel has an equivalent.
