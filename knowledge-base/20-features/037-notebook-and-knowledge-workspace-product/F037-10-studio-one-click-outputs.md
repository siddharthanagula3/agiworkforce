---
id: "F037-10"
type: "feature"
title: "Studio one-click outputs"
aliases: ["Studio", "Create from your sources", "Studio outputs", "Briefing doc", "Study guide", "FAQ", "Timeline", "Mind map", "Data table", "Slide deck", "S37.20", "S37.23", "S37.24", "S37.25", "S37.26", "S37.27", "S37.28", "S37.30"]
area: "37 Notebook and knowledge-workspace product"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S37.20", "S37.23", "S37.24", "S37.25", "S37.26", "S37.27", "S37.28", "S37.30"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "SYS-chat-turn-pipeline", "SYS-memory-projects-and-context", "SYS-files-artifacts-and-storage", "SYS-subscriptions-entitlements-and-usage", "F037-08", "F037-11"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F037-10 Studio one-click outputs

A button row 'Create from your sources' on a notebook turns its sources into a briefing doc, study guide, FAQ, timeline, mind map, data table or slide deck. Each button opens a new notebook chat with a fixed prompt; there is no output list. Web, Desktop (hosted web) and Mobile (Cloud mode) have it.

Area: [37. Notebook and knowledge-workspace product](README.md). Requirement items: [S37.20](../../10-requirements/capabilities/037-notebook-and-knowledge-workspace-product.md#s3720), [S37.23](../../10-requirements/capabilities/037-notebook-and-knowledge-workspace-product.md#s3723), [S37.24](../../10-requirements/capabilities/037-notebook-and-knowledge-workspace-product.md#s3724), [S37.25](../../10-requirements/capabilities/037-notebook-and-knowledge-workspace-product.md#s3725), [S37.26](../../10-requirements/capabilities/037-notebook-and-knowledge-workspace-product.md#s3726), [S37.27](../../10-requirements/capabilities/037-notebook-and-knowledge-workspace-product.md#s3727), [S37.28](../../10-requirements/capabilities/037-notebook-and-knowledge-workspace-product.md#s3728), [S37.30](../../10-requirements/capabilities/037-notebook-and-knowledge-workspace-product.md#s3730).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Offers one-click fixed requests. Each starts a new chat in the notebook and asks the model to produce one kind of document from the notebook's sources, citing them.

**Why it exists.** The brief asks for a Studio panel that lists one-click outputs from the sources (S37.20-S37.30). The code builds the button row using ordinary chat instead of a separate output store.

**Who uses it.** A person who has added sources and wants a standard deliverable without writing a prompt.

**Problems it solves**

- Writing the same prompt again for each deliverable.
- Getting output that ignores or invents beyond the sources: every prompt says to use only the sources and say what they do not cover.

**Use cases**

- Click Briefing doc after uploading board papers.
- Click Timeline to get a Mermaid timeline plus a dated list.
- Click Slide deck to get a PowerPoint file.

## 2. User experience

**Where to find it**

- Web and Desktop: notebook page, Sources tab, top section titled 'Create from your sources' with the line 'Each opens a new chat in this project, grounded in its sources.' (ProjectStudio.tsx:124-137; page.tsx:1321-1329).
- Mobile: Cloud mode, project detail header icon 'Project notebook' opens the notebook screen with a section of the same title (apps/mobile/app/(app)/projects/[id].tsx:427-440; ProjectNotebookScreen.tsx:~170-200).
- CLI, VS Code, Chrome: not available.

**Before you start**

- Signed in; notebook open; on Mobile Cloud mode and at least one source (buttons disabled without sources: ProjectNotebookScreen.tsx disabled={starting !== null || !hasSources}).
- Web has no source check on the buttons; sending with no sources is not blocked in ProjectStudio.tsx [inferred].

**Screens and controls**

- Pill buttons with icon and label: Briefing doc, Study guide, FAQ, Timeline, Mind map, Data table, Slide deck (plus Quiz, Flashcards, Learning overview, Infographic, see F037-11).
- Mobile tile with accessibility label 'Create <name in lower case>' and a hint describing the output (ProjectNotebookScreen.tsx:41-60).

**Journey**

1. Open the notebook Sources tab (Web) or the Project notebook screen (Mobile).
2. Click a button, for example Briefing doc.
3. A new chat opens in the notebook, the prompt is sent as the first message, and the answer streams in.
4. Read the answer; use Save to project or the chat's own artifact tools to keep it.

**What the person sees and gets**

- A chat reply: markdown text, a Mermaid diagram (Timeline, Mind map), a markdown table (Data table), or a PowerPoint file (Slide deck).
- On Mobile, errors show in a banner: 'Could not start the <name>.' (ProjectNotebookScreen.tsx:~125-130).

**Settings**

- The chosen model in the chat picker applies (Mobile reads the selected model, service.ts:65).
- Slide deck sets office file creation for that turn (ProjectStudio.tsx:112-113; page.tsx:1326).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web/Desktop: all outputs as buttons; each calls handleProjectSend with workMode 'chat', the project id and, for the deck, officeCreationEnabled (page.tsx:1321-1329; ProjectStudio.tsx:139-144).
- Mobile: same set from the shared list in cloud-contracts, starting a conversation and sending the prompt (project-studio.ts:30-108; service.ts:57-77; mobile test 'asks for a PowerPoint for the slide deck and clears it if the send fails').
- Prompts require source-only content and citations (ProjectStudio.tsx:31-32).

**Incomplete**

- No list or panel of past outputs; each lives as a chat and, if the model marks it, an artifact (ProjectStudio.tsx has no store).
- Web keeps its own copy of the prompts; the shared list in cloud-contracts is used by Mobile only (grep of PROJECT_STUDIO_OUTPUTS found only Mobile files). Two copies can drift.

**Present but disconnected or switched off**

- none found.

**Not available**

- CLI, VS Code, Chrome: no Studio.
- The brief marks Mobile missing and the Slide deck missing on Mobile; the code and its test show Mobile has it. Brief out of date.

## 4. Required behaviour

**Established requirements**

- A Studio/output panel lists one-click outputs generated from the sources. (source: brief S37.20)
- One click turns the sources into a briefing document, study guide, FAQ, timeline, mind map, data table, slide deck. (source: brief S37.23-S37.28, S37.30)
- Each Studio output is a chat reply; no separate output list is stored; timeline and mind map are Mermaid; the deck sets office creation. (source: first-draft notes checked against ProjectStudio.tsx:37-115)
- Never describe a model feature as intrinsic when it depends on a route or harness. (source: doc: AGENTS.md section 4)

**Acceptance criteria**

1. Each of the seven buttons exists with the exact label.
2. A click opens a new chat in the same notebook with the matching prompt.
3. The reply cites sources and says where sources do not cover something.
4. Slide deck produces a PowerPoint file or a clear error if the plan or route cannot.
5. Timeline and Mind map render as diagrams.
6. On Mobile the buttons are disabled when the notebook has no sources.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Output waiting, cancel and failure follow the chat turn pipeline since each output is a normal turn.
- [inferred] Whether the Slide deck needs a paid AGI Work or office entitlement is not shown here; the project page comment says the composer downgrades workMode for a plan without AGI Work (page.tsx:241-243).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Use the shared prompt list on Web as well so the two cannot drift.
- [proposed] An outputs panel listing past generated files per notebook.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ProjectStudio | `apps/web/features/projects/components/ProjectStudio.tsx` | Button row and fixed prompts |
| screen | Project page | `apps/web/app/chat/projects/[id]/page.tsx` | Mounts ProjectStudio and sends the prompt as a project chat (1321-1329) |
| service | project-chat-handoff | `apps/web/features/projects/lib/project-chat-handoff.ts` | Hands the prompt to the new chat page |
| config | PROJECT_STUDIO_OUTPUTS | `packages/contracts/cloud-contracts/src/project-studio.ts` | Shared output list with label, description, prompt, office format |
| screen | ProjectNotebookScreen | `apps/mobile/src/features/notebook/ProjectNotebookScreen.tsx` | Mobile Studio tiles and sources |
| service | mobile notebook service | `apps/mobile/src/features/notebook/service.ts` | startStudioOutput: new conversation then send prompt with selected model |
| screen | mobile notebook route | `apps/mobile/app/(app)/projects/notebook/[id].tsx` | Route for the notebook screen |
| screen | mobile project detail | `apps/mobile/app/(app)/projects/[id].tsx` | Header button 'Project notebook' (Cloud mode only) |
| store | outputFormatStore | `apps/mobile/src/features/chat/store/outputFormatStore.ts` | Sets the office format before the deck prompt |
| endpoint | chat completions | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Runs the Studio prompt with project context |
| service | project-context-service | `apps/web/lib/services/project-context-service.ts` | Supplies the sources |
| component | ArtifactPreview and study views | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Shows document artifacts that the model marks |
| test | Notebook.test.tsx | `apps/web/features/projects/components/__tests__/Notebook.test.tsx` | Covers Studio prompts (quiz group) |
| test | ProjectNotebook.test.tsx | `apps/mobile/src/features/notebook/__tests__/ProjectNotebook.test.tsx` | Mobile Studio tests |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Click: the page saves a handoff with the prompt, project id and work mode, then navigates to the new project chat. | device | page.tsx:235-262,1321-1329 |
| The new chat sends the prompt to the chat completions route in the project. | our servers | request-processor.ts:3854-3882 |
| The server adds the sources, and the model is called. | outside service | F037-08 flow; provider selection unknown here |
| The reply streams back and is stored as an ordinary message. | our servers | chat pipeline (SYS-chat-turn-pipeline) |
| For the deck the turn carries officeCreationEnabled so the harness may create a PowerPoint file. | our servers | page.tsx:1326; ProjectStudio.tsx:112-113; where the file is built: unknown |
| Mobile: create conversation in the project, then send the prompt with the selected model. | device and our servers | service.ts:57-77 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Conversation and reply | conversation tables, same as any chat | Yes, as chats | Per chat deletion rules; unknown details |
| Office file for the deck | unknown | unknown | unknown |

**Models and providers.** The person's selected model answers; the prompt is provider neutral text. Capability to make a PowerPoint depends on the route or harness, not the model alone (AGENTS.md section 4); the exact gate was not traced.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in. |
| Permissions | Studio buttons are shown to any viewer of the Sources tab on Web (page.tsx:1321 has no canEdit gate); sending a chat as a read-only member may still work since chat is separate [inferred]. |
| Subscription | Each click is one chat turn under the plan's rules; slide deck may need an office-creation entitlement: unknown. |
| Limits and metering | Same as chat turns. Studio-specific allowance: none found in the code. |
| Feature flags | none found for Studio itself. |
| Model compatibility | Any chat model; quality of Mermaid or tables depends on the model [inferred]. |
| Provider restrictions | none found in the code. |
| Local mode | Not available: Mobile requires Cloud mode and says 'Notebooks run in AGI Cloud; switching won't upload your local chats.' (ProjectNotebookScreen.tsx CloudFeatureGate). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Starting | Mobile tile shows busy and all tiles disable; Web navigates at once | ProjectNotebookScreen.tsx:~113-135 |
| No sources | Mobile shows 'Add a source to this project first.' and disables tiles; Web does not block | ProjectNotebookScreen.tsx:~165-190 |
| Handoff save fails (Web) | Toast 'Could not open the project chat. Your draft is still here.' | page.tsx:256-262 |
| Send fails (Mobile) | Error banner; deck format setting is cleared | service.ts:68-76 |
| Waiting, cancel, timeout | Follow the chat turn behaviour, not studio specific | no studio code for these in ProjectStudio.tsx or service.ts |
| Offline | not handled in the code beyond send errors | service.ts:68-76 only rethrows the send error |
| Accessibility | Web section labelled by its heading; buttons minimum height 36; Mobile tiles have role and hint | ProjectStudio.tsx:119-150; ProjectNotebookScreen.tsx:55-60 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/projects/components/__tests__/Notebook.test.tsx`: Prompts of quiz, flashcards, learning overview and infographic; source-only grounding text on all
- `apps/mobile/src/features/notebook/__tests__/ProjectNotebook.test.tsx`: Every output offered; quiz starts a new chat; deck asks for PowerPoint and resets on failure; outputs held until a source exists

**Test scenarios**

- **Briefing doc**
  1. Open a notebook with two sources.
  2. Click Briefing doc.
  - Expected: New chat; reply has summary, themes, facts, open questions and cites sources.
- **Timeline diagram**
  1. Click Timeline.
  - Expected: A rendered timeline diagram and a dated list.
- **Data table**
  1. Click Data table.
  - Expected: A markdown table, one row per item.
- **Slide deck**
  1. Click Slide deck.
  - Expected: A PowerPoint file is offered or a clear error.
- **Mobile no sources**
  1. On Mobile open a notebook with no sources.
  - Expected: Tiles disabled with the hint to add a source.
- **Out-of-source honesty**
  1. Click FAQ on a notebook of one short file.
  - Expected: Reply says where sources do not cover something.

**Where to look when it fails**

- Chat route error codes project_context_load_failed and project_context_unavailable.
- Toast text from handoff failure.
- Mobile banner text from cloudActionError.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/web/037-notebook-and-knowledge-workspace-product.md)
- Desktop: [70-qa/test-plans/desktop/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/desktop/037-notebook-and-knowledge-workspace-product.md)
- Mobile: [70-qa/test-plans/mobile/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/mobile/037-notebook-and-knowledge-workspace-product.md)

## 10. Gaps and dependencies

- **No outputs list or panel** Affects: All apps. Evidence: ProjectStudio.tsx has only buttons. Work needed: List chats or artifacts created by Studio per notebook.
- **Two prompt copies (Web and shared contract)** Affects: Web, Mobile. Evidence: ProjectStudio.tsx:37-115 vs project-studio.ts:30-108. Work needed: Web imports the shared list.
- **No Studio on CLI, VS Code, Chrome** Affects: those apps. Evidence: no code. Work needed: Decide scope.
- **Brief out of date for Mobile** Affects: Docs. Evidence: mobile test file. Work needed: Update status.
- **Web buttons do not wait for sources** Affects: Web. Evidence: ProjectStudio.tsx has no disabled state. Work needed: Disable or message when empty.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- SYS-chat-turn-pipeline
- SYS-memory-projects-and-context
- SYS-files-artifacts-and-storage
- SYS-subscriptions-entitlements-and-usage
- F037-08
- F037-11

## Unknown

- Where the PowerPoint file is built and whether a plan gates it.
- Whether read-only members can use Studio on Web.
- How Mermaid replies render on Mobile.
- Whether cancel and retry of a Studio turn behave like normal chat turns on both apps (assumed).
