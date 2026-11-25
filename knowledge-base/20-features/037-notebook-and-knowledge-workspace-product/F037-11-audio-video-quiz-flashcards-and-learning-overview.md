---
id: "F037-11"
type: "feature"
title: "Audio, video, quiz, flashcards and learning overview"
aliases: ["Quiz", "Flashcards", "Learning overview", "Infographic", "Audio overview", "Video overview", "Interactive learning overview", "S37.21", "S37.22", "S37.29", "S37.31", "S37.32", "S37.33"]
area: "37 Notebook and knowledge-workspace product"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S37.21", "S37.22", "S37.29", "S37.31", "S37.32", "S37.33"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "SYS-chat-turn-pipeline", "SYS-files-artifacts-and-storage", "SYS-voice-and-media", "SYS-shared-ui-and-design", "F037-10", "F037-08"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F037-11 Audio, video, quiz, flashcards and learning overview

The notebook Studio row also has Quiz, Flashcards, Learning overview and Infographic buttons. Each asks the model for a quiz or flashcard block, or one HTML page, which the chat can show as an interactive document. Audio and video overviews do not exist. Web, Desktop and Mobile have the buttons; the brief calls them missing.

Area: [37. Notebook and knowledge-workspace product](README.md). Requirement items: [S37.21](../../10-requirements/capabilities/037-notebook-and-knowledge-workspace-product.md#s3721), [S37.22](../../10-requirements/capabilities/037-notebook-and-knowledge-workspace-product.md#s3722), [S37.29](../../10-requirements/capabilities/037-notebook-and-knowledge-workspace-product.md#s3729), [S37.31](../../10-requirements/capabilities/037-notebook-and-knowledge-workspace-product.md#s3731), [S37.32](../../10-requirements/capabilities/037-notebook-and-knowledge-workspace-product.md#s3732), [S37.33](../../10-requirements/capabilities/037-notebook-and-knowledge-workspace-product.md#s3733).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Starts a notebook chat that asks for a ten-question quiz, a twenty-card flashcard set, a learning overview with a built-in five-question check, or a one-page infographic built from the sources.

**Why it exists.** The brief lists these as NotebookLM-style outputs (S37.21, S37.22, S37.29, S37.31-S37.33). Quiz, flashcards, learning overview and infographic were built; audio and video overviews were not.

**Who uses it.** Students and professionals who want to test themselves on their documents or get a visual summary.

**Problems it solves**

- Turning documents into practice material by hand.
- Reading long files to learn the key concepts.

**Use cases**

- Click Quiz on lecture notes and answer with hints.
- Click Flashcards to review key terms and flip cards.
- Click Infographic for a one-page summary.

## 2. User experience

**Where to find it**

- Web and Desktop: notebook page, Sources tab, 'Create from your sources' row: Quiz, Flashcards, Learning overview, Infographic (ProjectStudio.tsx:80-107).
- Mobile: Cloud mode, Project notebook screen, same four tiles (project-studio.ts:81-107).
- Audio overview, Video overview: no control anywhere found.
- CLI, VS Code, Chrome: not available.

**Before you start**

- Signed in, notebook with sources; Cloud mode on Mobile.

**Screens and controls**

- Buttons Quiz, Flashcards, Learning overview, Infographic.
- In the reply: a document that opens as an artifact because the prompt asks for a first line '<!-- @artifact -->' (ProjectStudio.tsx:34-35).
- Web study views: quiz one question at a time with hints, feedback and explanations; flashcards that flip and narrow to cards still being learned (StudyDocument.test.tsx:76-140).

**Journey**

1. Click Quiz (or another button).
2. A new notebook chat opens and the model writes a document with a quiz block of JSON.
3. The chat shows it as a playable quiz.
4. Answer a question; use hints; see the explanation that names the source.
5. For Flashcards flip each card and mark known or not.
6. For Infographic open the HTML artifact.

**What the person sees and gets**

- Playable quiz, flashcard deck, learning overview with a final check, or an HTML infographic with a source footer.
- Mobile shows study views through its own viewers (apps/mobile/src/features/chat/components/artifact-viewers/study/).

**Settings**

- The selected chat model applies; no quiz-specific setting found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web/Desktop: the four buttons exist and send fixed prompts (ProjectStudio.tsx:80-107; Notebook.test.tsx:218-236).
- Web/Desktop: quiz and flashcard blocks are parsed and rendered as playable views (apps/web/features/chat/components/artifacts/study/QuizView.tsx, FlashcardsView.tsx, StudyDocument.tsx; packages/ui/unified-chat/src/lib/study-set.ts).
- Mobile: the same four outputs from the shared list and viewers for quiz and flashcards (project-studio.ts:81-107; apps/mobile/src/features/chat/components/artifact-viewers/study/StudyFlashcardsView.tsx).
- Infographic is requested as one self-contained HTML page with no external images, fonts or scripts (ProjectStudio.tsx:105).

**Incomplete**

- Quality depends on the model writing valid JSON blocks; the code has a lossless check for editing (study-set.ts:170) but how a malformed reply degrades was not traced.
- The brief says missing for all; out of date.

**Present but disconnected or switched off**

- none found.

**Not available**

- Audio overview and video overview: no code found in Web or Mobile; the founder doc says video is generated in chat and kept in the Library and names ChatGPT's video studio as a separate app (docs/decisions/2026-09-27-founder-decisions.md:132-133).
- CLI, VS Code, Chrome: nothing.

## 4. Required behaviour

**Established requirements**

- One click generates a spoken audio overview of the sources. (source: brief S37.21)
- One click generates a narrated video overview. (source: brief S37.22)
- One click turns the sources into an infographic. (source: brief S37.29)
- One click generates a quiz the user can answer. (source: brief S37.31)
- One click generates a flashcard set. (source: brief S37.32)
- One click generates an interactive learning overview. (source: brief S37.33)
- Video is generated in chat and kept in the Library; no separate video studio. (source: doc: docs/decisions/2026-09-27-founder-decisions.md:132-133)

**Acceptance criteria**

1. Quiz click yields a playable quiz of about ten questions with explanations naming a source.
2. Flashcards click yields a deck of about twenty cards that can be flipped.
3. Learning overview yields sections plus a five-question check.
4. Infographic yields one HTML artifact with no external resources.
5. No audio or video button is shown until it works.
6. Mobile shows the same four outputs and can play a quiz and flashcards.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Audio overview would need speech output; the voice area is SYS-voice-and-media. No notebook link to it exists.
- [inferred] Infographic isolation from external resources depends on the model obeying the prompt and on the artifact sandbox.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide whether audio and video overviews are in scope; if so build them on the voice and media systems.
- [proposed] Validate quiz JSON on receipt and offer a repair action.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ProjectStudio | `apps/web/features/projects/components/ProjectStudio.tsx` | Quiz, Flashcards, Learning overview, Infographic prompts (lines 80-107) |
| config | PROJECT_STUDIO_OUTPUTS | `packages/contracts/cloud-contracts/src/project-studio.ts` | Shared list used by Mobile |
| service | study-set | `packages/ui/unified-chat/src/lib/study-set.ts` | Parses and writes quiz and flashcard blocks |
| component | StudyDocument | `apps/web/features/chat/components/artifacts/study/StudyDocument.tsx` | Renders a document with quiz and flashcard blocks |
| component | QuizView | `apps/web/features/chat/components/artifacts/study/QuizView.tsx` | Play a quiz |
| component | FlashcardsView | `apps/web/features/chat/components/artifacts/study/FlashcardsView.tsx` | Flip and review cards |
| component | StudySetEditors | `apps/web/features/chat/components/artifacts/study/StudySetEditors.tsx` | Edit a quiz or deck and save it back |
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Opens marked documents and HTML artifacts |
| component | StudyFlashcardsView (mobile) | `apps/mobile/src/features/chat/components/artifact-viewers/study/StudyFlashcardsView.tsx` | Mobile flashcards |
| component | StudyDocumentView (mobile) | `apps/mobile/src/features/chat/components/artifact-viewers/study/StudyDocumentView.tsx` | Mobile study document |
| screen | ProjectNotebookScreen | `apps/mobile/src/features/notebook/ProjectNotebookScreen.tsx` | Mobile tiles |
| service | mobile notebook service | `apps/mobile/src/features/notebook/service.ts` | Starts a study output chat |
| screen | Project page | `apps/web/app/chat/projects/[id]/page.tsx` | Mounts Studio |
| test | StudyDocument.test.tsx | `apps/web/features/chat/components/artifacts/study/StudyDocument.test.tsx` | Quiz and flashcard behaviour |
| test | study-set.test.ts | `packages/ui/unified-chat/src/lib/study-set.test.ts` | Block parsing |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Click: same handoff as other Studio outputs (project chat with the fixed prompt). | device | page.tsx:1321-1329 |
| Server grounds the turn in the sources and calls the model. | our servers | request-processor.ts:3854-3882 |
| The model returns a markdown document that starts with the artifact marker and holds a quiz or flashcards block of JSON, or an HTML page. | outside service | ProjectStudio.tsx:34-35,84,91,105 |
| The chat opens it as an artifact; the study views parse the block and run the quiz or the deck locally. | device | StudyDocument.tsx; study-set.ts; StudyDocument.test.tsx:52-143 |
| Quiz progress: where kept (local or saved): unknown | device | study-session.ts exists under features/study; link not traced |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Reply document and its artifact | conversation messages and artifact storage | As chats and artifacts | unknown |
| Quiz answers and card marks | unknown | unknown | unknown |

**Models and providers.** Any chat model that can produce the JSON blocks and HTML. No provider restriction found. Audio or video would require speech or video generation routes that are not wired to notebooks.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in. |
| Permissions | Same as Studio (F037-10). |
| Subscription | One chat turn per click; no output-specific entitlement found. |
| Limits and metering | Chat limits apply; no per-notebook allowance in the code (see F037-12). |
| Feature flags | none found. |
| Model compatibility | Needs models that follow a JSON format; not checked in code. |
| Provider restrictions | none found in the code. |
| Local mode | Not available for notebooks: sources are server-held, and Mobile needs Cloud mode. Study views themselves run on the device once a reply exists. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Malformed quiz block | not handled in the code I read; study-set.ts returns null from parseQuiz when invalid (line 172-175 suggests a null check) | study-set.ts:170-180 |
| No sources | Mobile blocks; Web does not | see F037-10: ProjectNotebookScreen.tsx hasSources check; ProjectStudio.tsx has none |
| Reply streaming | Follows chat streaming | no study-specific streaming code found; chat pipeline |
| Short-answer grading | Forgiving but not loose matching | StudyDocument.test.tsx:68 |
| Mixed counters | One position counter is shown even if the model numbered titles | StudyDocument.test.tsx:109 |
| Offline | not handled in the code beyond send errors | no offline branch in ProjectStudio.tsx or study-set.ts |
| Accessibility | Not traced for the study views | QuizView.tsx and FlashcardsView.tsx not opened for accessibility |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/projects/components/__tests__/Notebook.test.tsx`: Quiz, flashcards, learning overview and infographic prompts
- `apps/web/features/chat/components/artifacts/study/StudyDocument.test.tsx`: Reading blocks, grading, one-at-a-time quiz with hints, flashcard flip and review, editing and saving
- `packages/ui/unified-chat/src/lib/study-set.test.ts`: Study set parsing
- `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/StudyDocumentView.test.tsx`: Mobile study document
- `apps/mobile/src/features/notebook/__tests__/ProjectNotebook.test.tsx`: Quiz starts a chat on Mobile

**Test scenarios**

- **Play a quiz**
  1. Click Quiz on a notebook with a text source.
  2. Answer questions, ask for a hint, finish.
  - Expected: Ten questions, hints, explanations naming sources, a result.
- **Flashcards**
  1. Click Flashcards.
  2. Flip cards and mark some as not known.
  - Expected: Review narrows to unknown cards.
- **Learning overview**
  1. Click Learning overview.
  - Expected: Outline, sections with examples, and a five-question check.
- **Infographic**
  1. Click Infographic.
  - Expected: One HTML artifact; no network requests for images, fonts or scripts.
- **Audio and video absence**
  1. Look for audio or video overview controls on Web and Mobile.
  - Expected: None present, matching the gap.
- **Malformed output**
  1. Force a reply with broken JSON (test fixture).
  - Expected: Document still opens; behaviour to be recorded.

**Where to look when it fails**

- Check the raw reply for the ~~~quiz fence.
- Browser network panel for external requests in an infographic.
- Chat route error codes.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/web/037-notebook-and-knowledge-workspace-product.md)
- Desktop: [70-qa/test-plans/desktop/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/desktop/037-notebook-and-knowledge-workspace-product.md)
- Mobile: [70-qa/test-plans/mobile/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/mobile/037-notebook-and-knowledge-workspace-product.md)

## 10. Gaps and dependencies

- **No audio overview** Affects: All apps. Evidence: no code in notebook or studio files. Work needed: Decide scope; speech output route and usage rules.
- **No video overview** Affects: All apps. Evidence: no code; docs/decisions/2026-09-27-founder-decisions.md:132-133. Work needed: Decide scope with the Library video path.
- **Brief status for quiz, flashcards, learning overview, infographic out of date** Affects: Docs. Evidence: ProjectStudio.tsx:80-107. Work needed: Update the brief.
- **Malformed output handling unknown** Affects: Web, Desktop, Mobile. Evidence: not traced. Work needed: Test and handle.
- **Where quiz progress is kept is unknown** Affects: All. Evidence: not traced. Work needed: Trace and document.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- SYS-chat-turn-pipeline
- SYS-files-artifacts-and-storage
- SYS-voice-and-media
- SYS-shared-ui-and-design
- F037-10
- F037-08

## Unknown

- Quiz progress and flashcard marks storage.
- Behaviour on malformed blocks.
- Mobile quiz view completeness (only flashcards viewer file name confirmed; quiz view not opened).
- Whether Infographic HTML is sandboxed without network access.
- Accessibility of study views.
