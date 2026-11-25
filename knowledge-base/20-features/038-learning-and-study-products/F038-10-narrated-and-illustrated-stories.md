---
id: "F038-10"
type: "feature"
title: "Narrated and illustrated stories"
aliases: ["Narrated storybooks (S38.32)", "Illustrated stories (S38.33)", "Stories with narration and pictures"]
area: "38 Learning and study products"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S38.32", "S38.33"]
depends_on: ["SYS-voice-and-media", "SYS-files-artifacts-and-storage", "SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-subscriptions-entitlements-and-usage", "SYS-local-inference", "SYS-execution-boundaries", "F038-07"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F038-10 Narrated and illustrated stories

Narrated and illustrated stories are not built. No story code, route, screen or prompt exists in any app. The area brief marks every app missing and a search of the code found nothing in the study area.

Area: [38. Learning and study products](README.md). Requirement items: [S38.32](../../10-requirements/capabilities/038-learning-and-study-products.md#s3832), [S38.33](../../10-requirements/capabilities/038-learning-and-study-products.md#s3833).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Intended: create stories with spoken narration and pictures (S38.32, S38.33). Nothing exists today.

**Why it exists.** Stories are a learning and reading format for younger or casual learners; the brief lists them as Should items.

**Who uses it.** Intended for learners, parents and children [inferred; the brief does not name a user].

**Problems it solves**

- A text-only answer is a poor fit for story-based learning.

**Use cases**

- A parent asks for a short illustrated bedtime story about space [proposed].
- A language learner listens to a narrated story at their level [proposed].

## 2. User experience

**Where to find it**

- Not found on any of the six apps.

**Before you start**

- not applicable

**Screens and controls**

- none

**Journey**

1. Not available. A learner can ask the model for a story in plain text; no narration or image step is tied to study.

**What the person sees and gets**

- none

**Settings**

- none found in the code

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nothing story-specific. General chat voice and image generation exist as separate features (SYS-voice-and-media) and were not checked here.

**Incomplete**

- none

**Present but disconnected or switched off**

- none found

**Not available**

- Narrated storybooks on web, desktop, mobile, CLI, VS Code, Chrome.
- Illustrated stories on all six apps.
- A search of apps, packages and crates for storybook, narrated, illustrated story and bedtime found only unrelated Storybook developer tool test strings (apps/web/features/code/components/LocalRunningCommands.test.tsx:76).

## 4. Required behaviour

**Established requirements**

- The product creates narrated storybooks. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S38.32)
- The product creates illustrated stories. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S38.33)

**Acceptance criteria**

1. Not applicable until built; when built: a story request returns text, images and an audio track.
2. Narration plays with play and pause.
3. Images and audio generation follow the subscription and provider rules.
4. The story can be saved as an artifact.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Needs text-to-speech and image generation routes, both described as provider or harness features, not model features (doc: AGENTS.md section 4).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Build as a document artifact block like quiz and flashcards so it works across apps.
- [proposed] Decide first whether Local mode may narrate with on-device speech.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | No story code | `apps/web/features/study` | Searched; no story code present |
| config | Study prompt practices | `apps/web/features/study/lib/study-session.ts` | Lists teaching practices; no story entry (lines 47-57) |
| component | StudyDocument | `apps/web/features/chat/components/artifacts/study/StudyDocument.tsx` | Handles only quiz and flashcards blocks, a model for a future story block |
| service | study-set parser | `packages/ui/unified-chat/src/lib/study-set.ts` | QUIZ_BLOCK and FLASHCARDS_BLOCK are the only block names (lines 3-4) |
| service | artifact derivation | `packages/platform/artifacts/src/artifact-derivation.ts` | STUDY_SETS lists quiz and flashcards only (line 361-364) |
| other | Voice and media system | `apps/web/features/chat` | Where speech and image features live; not read for this page (SYS-voice-and-media) |
| test | area brief | `knowledge-base/data/area-briefs/038-learning-and-study-products.md` | States status missing for S38.32 and S38.33 |
| other | audit worklist | `audit/missing/038-learning-and-study-products.md` | Lists missing items for the area |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No flow exists. | device | No code found by search across apps, packages, crates |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| none | none | No | not applicable |

**Models and providers.** none today. A future version would need a text model, a speech route and an image route [inferred].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code |
| Permissions | none found in the code |
| Subscription | none found in the code |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Nothing exists; no Local behaviour to describe. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Any state of the feature | not handled in the code | no code found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- none found

**Test scenarios**

- **Absence check**
  1. Search each app for a story or storybook control
  - Expected: None found.
- **Plain-text request**
  1. Ask the model in a study chat for a story
  - Expected: Text only, no narration or pictures.
- **Future narration**
  1. Once built: request a story, press play
  - Expected: Audio matches the text; images appear in order (to be defined).

**Where to look when it fails**

- Re-run the code search for story terms after any new feature lands

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Feature absent** Affects: All apps. Evidence: Search of apps, packages and crates found no story code. Work needed: Product decision, then design, speech and image routes, artifact block, viewer on each app
- **No spec** Affects: Planning. Evidence: No document under docs/specs found for it in this pass; not searched exhaustively. Work needed: Write a spec before building
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-voice-and-media
- SYS-files-artifacts-and-storage
- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-subscriptions-entitlements-and-usage
- SYS-local-inference
- SYS-execution-boundaries
- F038-07

## Unknown

- Whether a story spec exists under docs/specs or docs/product (not searched beyond the code search).
- Whether general chat media features could be reused unchanged.
