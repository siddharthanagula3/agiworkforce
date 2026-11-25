---
id: "F049-11"
type: "feature"
title: "Spoken rewrite of selected text"
aliases: ["Spoken rewrite", "Voice rewrite of selected text", "Speak an instruction to rewrite selected text", "S49.29"]
area: "49 Dictation, transcription, and recording"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S49.29"]
depends_on: ["SYS-voice-and-media", "SYS-chat-turn-pipeline", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-local-inference", "F049-09", "api:POST /api/voice/transcribe", "surface:web"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F049-11 Spoken rewrite of selected text

Would let a person select text, then speak an instruction such as 'make this shorter' to rewrite it. It is not built in any app. Nearby pieces exist but are different: dictation cleanup of spoken text, voice-command detection, and a typed rewrite of selected page text in the Chrome extension.

Area: [49. Dictation, transcription, and recording](README.md). Requirement items: [S49.29](../../10-requirements/capabilities/049-dictation-transcription-and-recording.md#s4929).

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

**What it does.** Would take selected text plus a spoken instruction and replace the selection with a rewritten version.

**Why it exists.** S49.29 lists it as required so voice can edit text, not only create it.

**Who uses it.** People editing drafts who prefer speaking to typing. [proposed]

**Problems it solves**

- Editing a draft without typing the instruction [proposed]

**Use cases**

- Select a paragraph in the composer and say 'make this friendlier' [proposed]
- Select an email draft in the desktop and say 'shorten it' [proposed]

## 2. User experience

**Where to find it**

- Not available in any app. (area brief S49.29)
- Not to be confused with: the Chrome extension's typed rewrite of selected page text (apps/extension/src/features/side-panel/editableRewrite.ts), which has no voice code in the lines searched.

**Before you start**

- None; not built.

**Screens and controls**

- None.

**Journey**

1. Not applicable.

**What the person sees and gets**

- None.

**Settings**

- None.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nothing for this feature.
- Adjacent: desktop dictation cleanup removes fillers and fixes punctuation after speech, using a model slot named voice_rewrite, with a basic non-model mode and a skip in Local mode when no local model exists (apps/desktop/src/stores/settings/voice.ts:224-256, 470-500). This rewrites the spoken text, not selected text.
- Adjacent: detectVoiceCommand marks a transcript as a command (apps/desktop/src/stores/settings/voice.ts:25, 480); it is not an edit-selection command.

**Incomplete**

- None.

**Present but disconnected or switched off**

- Cleanup lives in the retained Tauri desktop store; the public desktop shows the hosted web app, so whether this path runs in the public app is unknown. (doc: AGENTS.md section 5)

**Not available**

- Spoken rewrite of selected text on web, desktop, phone, CLI, VS Code and Chrome. (area brief S49.29; searches for rewrite across web chat, phone, CLI and extension source found no spoken-edit code)

## 4. Required behaviour

**Established requirements**

- The user can select text and speak an instruction to rewrite it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S49.29)

**Acceptance criteria**

1. A person can select text in the composer, use a voice control and speak an instruction.
2. The selection is replaced by a rewritten version and the person can undo it.
3. The original text is recoverable after the rewrite.
4. The spoken instruction is transcribed with the same notice and consent rules as dictation.
5. A failed transcription or rewrite leaves the selection unchanged and shows an error.
6. The feature follows quota and mode rules (Local, own key, Cloud).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Needs two steps: transcribe the instruction, then run a rewrite turn with the selected text. [inferred]
- Undo must follow the normal edit undo; S49.30 (undo inserted text) is marked unverified in the brief. [inferred]

**Proposed improvements** (suggestions, not requirements)

- Reuse the Chrome extension's apply and undo selection flow for the replace step. [proposed]
- Add a voice control to the composer selection toolbar. [proposed]

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| hook | useDictation | `apps/web/features/chat/hooks/use-dictation.ts` | Would build on: records and transcribes speech on web. Does not implement rewrite. |
| store | voice-input-store | `apps/web/features/chat/stores/voice-input-store.ts` | Would build on: upload to /api/voice/transcribe. Does not implement rewrite. |
| endpoint | POST /api/voice/transcribe | `apps/web/app/api/voice/transcribe/route.ts` | Would build on: gives the spoken instruction as text. |
| service | desktop voice store cleanup | `apps/desktop/src/stores/settings/voice.ts` | Adjacent: model-based cleanup of dictation text and command detection; not selection rewrite. |
| service | voice helpers | `packages/platform/utils/src/voice.ts` | Adjacent: detectVoiceCommand and cleanupVoiceDictation helpers (lines 45, 50). |
| component | editableRewrite | `apps/extension/src/features/side-panel/editableRewrite.ts` | Adjacent: Chrome typed rewrite of a selected editable field with apply and undo; no voice. |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Would host a voice rewrite control for the selection in the composer. |
| service | mobile voiceInput | `apps/mobile/src/features/voice/services/voiceInput.ts` | Would build on: on-device capture on phone. |
| config | voice_rewrite routing slot | `packages/contracts/types/src/model-catalog.ts` | Adjacent: a catalog slot named voice_rewrite is referenced by dictation cleanup (apps/desktop/src/stores/settings/voice.ts:240). |
| other | area brief | `knowledge-base/data/area-briefs/049-dictation-transcription-and-recording.md` | Source of S49.29. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No spoken-rewrite flow exists. The adjacent dictation flow records, transcribes on the server, and inserts text into the composer. | device and our servers | apps/web/features/chat/stores/voice-input-store.ts:16, 231 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| No data for this feature. | nowhere | not applicable | not applicable |

**Models and providers.** Not applicable. The adjacent desktop cleanup uses a catalog slot named voice_rewrite and refuses hosted models in Local mode (apps/desktop/src/stores/__tests__/dictationCleanupRoute.test.ts:36-46).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Not applicable. |
| Permissions | Not applicable. A future version would need microphone permission. [inferred] |
| Subscription | None found in the code for this feature. |
| Limits and metering | None found in the code for this feature. |
| Feature flags | None found in the code for this feature. |
| Model compatibility | Not applicable. |
| Provider restrictions | None found in the code for this feature. |
| Local mode | Not applicable. For the adjacent cleanup, Local mode skips hosted models and inserts the dictation as spoken (apps/desktop/src/stores/settings/voice.ts:224-225). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Person looks for the feature | Not present in any app; not handled in the code. | S49.29 (area brief) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/desktop/src/stores/__tests__/dictationCleanupRoute.test.ts`: Adjacent: dictation cleanup stays inside the trust boundary in Local mode.
- `apps/extension/__tests__/voice-input.test.ts`: Adjacent: Chrome dictation input.

**Test scenarios**

- **Absence on web**
  1. Type text in the composer
  2. Select it
  3. Look for a microphone or rewrite option in the selection toolbar
  - Expected: No spoken rewrite option exists.
- **Dictate an instruction**
  1. Select text
  2. Dictate 'make this shorter' with the normal microphone
  - Expected: The words are inserted as text; the selection is not rewritten.
- **Chrome typed rewrite**
  1. Select text in an editable page field
  2. Use the side panel rewrite
  - Expected: A typed rewrite flow works; no voice step exists.
- **Code search**
  1. Search for 'rewrite' near voice code in apps
  - Expected: Only the cleanup slot and the typed Chrome rewrite are found.

**Where to look when it fails**

- Nothing to check; feature is absent.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No spoken rewrite of selected text** Affects: All six apps. Evidence: S49.29 missing in every app (area brief). Work needed: Design selection capture, voice instruction, rewrite turn, replace and undo.
- **Brief has no code reference for adjacent typed rewrite in Chrome** Affects: Planning. Evidence: apps/extension/src/features/side-panel/editableRewrite.ts exists. Work needed: Decide whether to reuse it.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-voice-and-media
- SYS-chat-turn-pipeline
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-local-inference
- F049-09
- api:POST /api/voice/transcribe
- surface:web

## Unknown

- Whether any design or spec for spoken rewrite exists in docs or audit; not searched in depth.
- Whether the retained Tauri dictation cleanup runs in the public desktop.
- Whether the Chrome typed rewrite has any voice entry I missed; only the first lines of the file were read.
