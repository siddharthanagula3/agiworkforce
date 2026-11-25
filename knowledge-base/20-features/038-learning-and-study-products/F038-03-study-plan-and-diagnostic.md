---
id: "F038-03"
type: "feature"
title: "Study plan and diagnostic"
aliases: ["Start with a personal study plan", "study plan request", "Personalized study plan (S38.07)", "Initial diagnostic quiz (S38.06)"]
area: "38 Learning and study products"
available_on: ["web", "desktop"]
implementation: {web: "partial", desktop: "partial", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S38.06", "S38.07"]
depends_on: ["surface:web", "surface:desktop", "mode:cloud", "SYS-chat-turn-pipeline", "F038-01", "F038-06", "SYS-memory-projects-and-context"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F038-03 Study plan and diagnostic

A checkbox on the web Study page, 'Start with a personal study plan', puts a ready-written plan request into the chat's message box. The person sends it and the model writes the plan. There is no stored plan and no diagnostic quiz; the diagnostic has no code.

Area: [38. Learning and study products](README.md). Requirement items: [S38.06](../../10-requirements/capabilities/038-learning-and-study-products.md#s3806), [S38.07](../../10-requirements/capabilities/038-learning-and-study-products.md#s3807).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** On start, sets the chat draft to a plan request built from the subject and level (StudyPage.tsx:113-120; study-session.ts:115-122). The model's answer is the plan.

**Why it exists.** A learner often wants an ordered plan before the first lesson, shaped by their level and weekly time.

**Who uses it.** Web and Electron learners starting a session. Not on mobile.

**Problems it solves**

- Not knowing what order to study in
- Plan that ignores weekly time

**Use cases**

- Start 'Organic chemistry' with a plan, send the draft, get parts, timings and checks.
- A learner with a syllabus in a project gets a plan that points to where the material covers each part.

## 2. User experience

**Where to find it**

- Web Study page checkbox 'Start with a personal study plan' (StudyPage.tsx:270-280).
- Desktop: same page [inferred].
- Mobile, CLI, VS Code, Chrome: none found.

**Before you start**

- Subject typed.

**Screens and controls**

- Checkbox (unchecked by default), disabled while starting (StudyPage.tsx:83,270-279).

**Journey**

1. Tick the checkbox.
2. Press Start studying.
3. The chat opens with the plan request in the message box.
4. Press send.
5. Read the plan; answer the weekly-time question the plan request tells the model to ask.

**What the person sees and gets**

- A model-written plan in the chat. Nothing is saved apart from the chat.

**Settings**

- None.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Draft set per conversation via setDraftContent (StudyPage.tsx:113-120).
- Request text: topic, level, order of parts, time per part, how understanding is checked, where attached course material covers it, then asks for weekly time (study-session.ts:115-122).

**Incomplete**

- The study plan is only text in a chat; no plan record, progress or reminders.

**Present but disconnected or switched off**

- nothing found

**Not available**

- Diagnostic quiz: no code path found (grep of apps/web/features/study and packages for a diagnostic: none).
- Mobile, CLI, VS Code, Chrome: no plan option.

## 4. Required behaviour

**Established requirements**

- A short diagnostic quiz gauges what the learner already knows (S38.06). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S38.06)
- The product builds a personalised study plan (S38.07). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S38.07)

**Acceptance criteria**

1. Ticking the box and starting leaves the plan request in the message box, unsent.
2. The request names the subject and the level label in lower case.
3. Without the box, the message box is empty.
4. The draft belongs to the new conversation only.
5. After sending, the reply lists parts in order with time and a check each.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A diagnostic would need a quiz generated before the plan [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer a short diagnostic quiz before the plan using the existing quiz viewer.
- [proposed] Save the plan as an artifact with progress.
- [proposed] Add the option on mobile.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | withPlan checkbox | `apps/web/features/study/components/StudyPage.tsx` | Checkbox and draft writing. |
| other | studyPlanRequest | `apps/web/features/study/lib/study-session.ts` | Builds the plan request text. |
| store | useChatStore draft | `apps/web/shared/stores/web-chat-store (imported as @shared/stores/web-chat-store)` (not found) | setDraftContent keeps the unsent text per conversation. |
| other | STUDY_LEVEL_LABELS | `packages/contracts/types/src/study.ts` | Level words used in the request. |
| test | material test | `apps/web/features/study/components/StudyPage.material.test.tsx` | Checks the draft contains the plan request. |
| test | study-session.test | `apps/web/features/study/lib/study-session.test.ts` | Instruction text tests. |
| service | StudyPage handleStart | `apps/web/features/study/components/StudyPage.tsx` | Orders chat, session, draft, navigation. |
| other | Chat composer draft read | `apps/web/features/chat/pages/WebChatPage.tsx` | Shows the draft in the message box (reader not traced). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| After the session is saved, the page writes the plan text into the draft store for the new chat. | device | StudyPage.tsx:113-120 |
| Page opens the chat; the composer shows the draft. | device | StudyPage.tsx:121 |
| Person sends; the model writes the plan under the study instruction. | our servers | request-processor.ts:6562-6569 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Plan request draft | Web chat store in the browser (persistence method not traced) | not found | Until sent or cleared. |
| The model's plan | web_messages as a chat message | With the chat | With the chat. |

**Models and providers.** Any model; plan quality depends on the model. No model named in the study code.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in web account. |
| Permissions | Same as chat. |
| Subscription | none found in the code; the sent plan message is an ordinary chat turn. |
| Limits and metering | none found in the code for the plan itself. |
| Feature flags | none found in the code. |
| Model compatibility | Any model [inferred]. |
| Provider restrictions | none found in the code. |
| Local mode | Not available: Study is not offered in mobile Local mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Checkbox while starting | Disabled. | StudyPage.tsx:275 |
| Session start fails | Draft is not written because it follows api.start. | StudyPage.tsx:112-120 |
| Person edits or deletes the draft | Normal composer behaviour; not handled specially. | not handled in the code |
| Diagnostic | not handled in the code (no feature). | none found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/study/components/StudyPage.material.test.tsx`: Draft contains 'build me a personal study plan for Cell biology'.

**Test scenarios**

- **Plan draft**
  1. Open Study, type 'Cell biology', tick the plan box, Start.
  - Expected: Chat opens; message box holds the plan request; nothing sent.
- **No plan**
  1. Start without ticking.
  - Expected: Empty message box.
- **Send the plan**
  1. Send the draft.
  - Expected: Model asks weekly time and gives ordered parts.
- **Diagnostic**
  1. Look for a diagnostic option.
  - Expected: None exists (confirms gap).

**Where to look when it fails**

- Draft content via useChatStore.getState().getDraftContent(conversationId).
- Check the order in StudyPage.handleStart.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/038-learning-and-study-products.md](../../70-qa/test-plans/web/038-learning-and-study-products.md)
- Desktop: [70-qa/test-plans/desktop/038-learning-and-study-products.md](../../70-qa/test-plans/desktop/038-learning-and-study-products.md)

## 10. Gaps and dependencies

- **No diagnostic quiz.** Affects: All apps. Evidence: no code found. Work needed: Design and build; reuse QuizView.
- **Plan is not stored or tracked.** Affects: All apps. Evidence: no plan table or store. Work needed: Decide on a plan artifact.
- **Plan option missing on mobile, CLI, VS Code, Chrome.** Affects: those apps. Evidence: StudyScreen.tsx. Work needed: Add checkbox on mobile.
- **Brief says S38.07 missing on web but a draft path exists.** Affects: Planners. Evidence: StudyPage.tsx:113-120. Work needed: Update brief to partial.
- Not built on: Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- mode:cloud
- SYS-chat-turn-pipeline
- F038-01
- F038-06
- SYS-memory-projects-and-context

## Unknown

- How the web chat store persists drafts.
- Whether the composer shows the draft on first load every time.
- Whether any diagnostic exists outside the folders searched.
