---
id: "F050-06"
type: "feature"
title: "Interrupt an overview"
aliases: ["Interrupt an overview", "Interactive interruption", "Ask a question during an overview", "S50.14"]
area: "50 Audio overviews, speech generation, and music"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S50.14"]
depends_on: ["F050-04", "surface:web", "surface:mobile", "SYS-voice-and-media", "SYS-chat-turn-pipeline", "SYS-memory-projects-and-context", "SYS-security-and-privacy", "SYS-subscriptions-entitlements-and-usage"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F050-06 Interrupt an overview

A planned way to stop an audio overview while the hosts talk and ask a question, where the product offers it. It is not built on any app. It depends on audio overviews (F050-04), and live voice conversation is a separate existing area.

Area: [50. Audio overviews, speech generation, and music](README.md). Requirement items: [S50.14](../../10-requirements/capabilities/050-audio-overviews-speech-generation-and-music.md#s5014).

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

**What it does.** Would let a person interrupt the overview hosts and ask a spoken or typed question, then hear an answer drawn from the sources. (S50.14 Should, brief: 'where offered')

**Why it exists.** Some leaders let listeners join the conversation. The brief marks it as optional ('where offered').

**Who uses it.** People listening to an overview who want a clarification [inferred].

**Problems it solves**

- Cannot ask about something the hosts just said.

**Use cases**

- Pause the overview and ask 'what did that study measure?'
- Ask for a simpler explanation of the last point.

## 2. User experience

**Where to find it**

- Not built on any app. No interrupt control exists.

**Before you start**

- An audio overview (F050-04), not built.

**Screens and controls**

- none exist.

**Journey**

1. Not applicable today. [proposed] Press Ask during playback, speak or type, hear the answer, resume.

**What the person sees and gets**

- none exist.

**Settings**

- none exist.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nothing for this feature. Adjacent: Tauri desktop has barge-in, where speaking stops the voice reply (apps/desktop/src-tauri/src/features/speech/barge_in.rs; apps/desktop/src-tauri/src/features/speech/tts.rs:1-5, 829-833) and Web has a live voice session limit (apps/web/lib/rate-limit.ts:409-413). Neither interrupts an overview.

**Incomplete**

- nothing found

**Present but disconnected or switched off**

- nothing found

**Not available**

- Interrupt and ask on Web, Desktop, Mobile, CLI, VS Code, Chrome (ledger row S50.14 missing: audit/ledger/ecosystem-capability-ledger.jsonl:1642).

## 4. Required behaviour

**Established requirements**

- Where offered, the user can interrupt the overview hosts and ask a question. (source: S50.14 Should (brief))
- Voice features must distinguish read aloud, live conversation and agent delegation, and handle interruption with a recoverable state. (source: doc: docs/product/competitive-guidance.md:401; doc: docs/product/experience-contract.md:786)

**Acceptance criteria**

1. During overview playback an Ask or Interrupt control stops the audio within one second.
2. A question typed or spoken is answered from the overview's sources.
3. After the answer the person can resume or end the overview.
4. Denied microphone permission leaves typed questions working.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Needs F050-04 first; if the product does not offer live interaction, this item stays 'where offered' and needs no build [inferred from the brief wording].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Reuse the live voice session and the barge-in idea; keep the overview paused, not discarded.
- [proposed] Decide before building whether the feature is offered at all.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | area brief 050 | `knowledge-base/data/area-briefs/050-audio-overviews-speech-generation-and-music.md` | S50.14 missing on every app. |
| other | ecosystem ledger | `audit/ledger/ecosystem-capability-ledger.jsonl` | Row 1642 marks every cell missing. |
| service | desktop barge-in (adjacent) | `apps/desktop/src-tauri/src/features/speech/barge_in.rs` | Stops speech when the person talks; not tied to overviews. |
| service | desktop TTS player (adjacent) | `apps/desktop/src-tauri/src/features/speech/tts.rs` | Playback with barge-in stop (700-834). |
| config | voice-live-session rate limit (adjacent) | `apps/web/lib/rate-limit.ts` | Limit for live voice sessions (409-413). |
| hook | web useTTS stop (adjacent) | `apps/web/lib/hooks/useTTS.ts` | Stop and retire logic (193-198, 288-327). |
| service | mobile voiceOutput stop (adjacent) | `apps/mobile/src/features/voice/services/voiceOutput.ts` | Stop handle for playback (89-100). |
| other | experience contract voice rows | `docs/product/experience-contract.md` | Voice recovery expectations (line 786). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No flow exists. | device | no interrupt code found |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| No data is created. | not applicable | not applicable | not applicable |

**Models and providers.** None wired. Answering a question would need a chat model with the overview sources as context [inferred].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code. |
| Permissions | A microphone permission would be needed for spoken questions [inferred]; none found in the code for this feature. |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | Not built. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| All states | not handled in the code; the feature does not exist. | no interrupt code found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- none found

**Test scenarios**

- **Confirm absence**
  1. Play any spoken reply and look for an interrupt-and-ask control.
  - Expected: Only Stop exists.
- **Ledger check**
  1. Read ledger row S50.14.
  - Expected: All cells missing.
- **Future interrupt**
  1. Play an overview, press Ask, ask a question.
  - Expected: Audio stops, an answer is given from sources, playback can resume.

**Where to look when it fails**

- Not applicable.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Interrupt and ask missing.** Affects: All apps. Evidence: audit/ledger/ecosystem-capability-ledger.jsonl:1642. Work needed: Decide if offered; if so build after F050-04 on the live voice foundation.
- **Brief says 'where offered' but no decision names where.** Affects: Planning. Evidence: search of docs/decisions found no S50.14 entry. Work needed: Record the decision.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- F050-04
- surface:web
- surface:mobile
- SYS-voice-and-media
- SYS-chat-turn-pipeline
- SYS-memory-projects-and-context
- SYS-security-and-privacy
- SYS-subscriptions-entitlements-and-usage

## Unknown

- Whether the product will offer interruption at all.
- Which surfaces could host it.
- Whether live voice sessions could carry overview context.
