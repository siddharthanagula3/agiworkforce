---
id: "F038-09"
type: "feature"
title: "Spoken explanation and language exercises"
aliases: ["Spoken-explanation feedback (S38.29)", "Language-learning exercises (S38.30)", "Pronunciation practice (S38.31)", "Explain it back", "Language practice"]
area: "38 Learning and study products"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S38.29", "S38.30", "S38.31"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "table:study_sessions", "api:POST /api/study/sessions", "SYS-chat-turn-pipeline", "SYS-voice-and-media", "SYS-model-catalog-and-routing", "SYS-memory-projects-and-context", "F038-07", "F038-12"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F038-09 Spoken explanation and language exercises

In Study mode the model is told to ask the learner to explain an idea back, typed or spoken, and to run language exercises. This is prompt text only. There is no study-specific microphone, speech scoring or pronunciation feedback in any app.

Area: [38. Learning and study products](README.md). Requirement items: [S38.29](../../10-requirements/capabilities/038-learning-and-study-products.md#s3829), [S38.30](../../10-requirements/capabilities/038-learning-and-study-products.md#s3830), [S38.31](../../10-requirements/capabilities/038-learning-and-study-products.md#s3831).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** The study instruction tells the model to now and then ask the learner to explain an idea in their own words and give feedback, and for languages to run translation, fill-in-the-blank, form-choice and reply exercises (apps/web/features/study/lib/study-session.ts:55-56).

**Why it exists.** Explaining back and practising a language are common ways to learn; the brief lists them as S38.29 to S38.31.

**Who uses it.** Learners in an open Study session, including language learners.

**Problems it solves**

- Passive reading does not test understanding.
- Language learners need varied short exercises with corrections.

**Use cases**

- A learner studying German dative case gets translation and fill-in-the-blank prompts.
- A learner explains photosynthesis in their own words and gets feedback on what was missing.
- A learner dictates the explanation with the general chat microphone [inferred: the prompt says spoken with the microphone; the mic belongs to general chat].

## 2. User experience

**Where to find it**

- Web and desktop (hosted web): start a session at /chat/study ('Start studying'); the behaviour appears in the resulting chat (StudyPage.tsx:103-121).
- Mobile: Study screen starts a session on the phone (apps/mobile/src/features/study/StudyScreen.tsx) and a StudyModeBanner shows in the chat (apps/mobile/app/(app)/chat/[id].tsx:2520).
- CLI: output style 'study' gives teaching guidance but has no speech or language steps (crates/agiworkforce-agent-core/assets/output_styles/study.md; apps/cli/src/output_styles.rs:55).
- VS Code, Chrome: nothing found.

**Before you start**

- An open study session on the conversation; for speech, the general chat microphone control, which was not checked here.

**Screens and controls**

- Study page: 'What are you studying?' (example 'German dative case'), 'How' modes, 'Where you are with it', optional 'Course material', 'Start with a personal study plan', 'Start studying' (StudyPage.tsx:187-292). No language or speech control exists.

**Journey**

1. 1. Start a study session on a language topic.
2. 2. The model, following the instruction, offers short exercises.
3. 3. The learner answers by typing (or dictating with the chat microphone).
4. 4. The model corrects and explains the rule in text.

**What the person sees and gets**

- Text replies from the model only; no score, no audio feedback found.

**Settings**

- Study mode and level choose how the model teaches (study-session.ts:28-42). No language, voice or pronunciation setting found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- The instruction text is added to every turn while the session is open: stored session read at request time and placed as a developer-layer instruction (apps/web/features/study/server/study-session-store.ts:86-101; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2122,3802-3830,3926).
- Prompt lines for explain-back and language exercises (study-session.ts:55-56), tested as part of the instruction text (apps/web/features/study/lib/study-session.test.ts; exact assertions not read: unknown).

**Incomplete**

- Whether the model follows the prompt is not checked by code; the exercises are not structured controls.

**Present but disconnected or switched off**

- The microphone is a general chat feature (SYS-voice-and-media), not tied to study; no study code calls it.

**Not available**

- Pronunciation practice and speech feedback on all six apps (no code found by search for 'pronunciation').
- Language-specific exercise widgets (translation, fill-in-the-blank) as interactive controls; only typed answers in chat.
- Study session start on CLI, VS Code and Chrome; the CLI only has a style.

## 4. Required behaviour

**Established requirements**

- The learner explains a concept aloud and gets feedback. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S38.29)
- Language-learning exercises are offered. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S38.30)
- The learner practises pronunciation and gets feedback. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S38.31)

**Acceptance criteria**

1. With an open study session, the instruction sent to the model contains the explain-back and language-exercise lines.
2. Ending study mode removes the instruction from later turns.
3. For a language topic the first replies include an exercise and a correction of the learner's answer (model-dependent; judged by a tester).
4. A spoken explanation can be dictated and sent in a study chat on each app that has a microphone.
5. Pronunciation feedback, when built, scores audio and states what was heard.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Pronunciation feedback needs speech input and a speech model route, which fall under SYS-voice-and-media [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] A language option on the Study page that sets target language and exercise types.
- [proposed] Interactive fill-in-the-blank and translation cards using the same block format as quizzes.
- [proposed] Pronunciation scoring with a clear note on which provider or local model hears the audio.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | TEACHING_PRACTICES | `apps/web/features/study/lib/study-session.ts` | Prompt lines 55 and 56 for explain-back and language exercises |
| service | readActiveStudyInstruction | `apps/web/features/study/server/study-session-store.ts` | Builds the instruction for the open session of a conversation |
| service | request-processor study layer | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Reads the instruction (line 3802-3830) and adds it as a developer layer (line 2122) |
| endpoint | /api/study/sessions | `apps/web/app/api/study/sessions/route.ts` | Starts and ends the session that switches the instruction on |
| table | study_sessions | `apps/web/db/neon/0247_study_sessions.sql` | Holds topic, mode, level, ended_at |
| screen | StudyPage | `apps/web/features/study/components/StudyPage.tsx` | Start form |
| component | StudyModeIndicator | `apps/web/features/study/components/StudyModeIndicator.tsx` | Shows that study mode is on in a chat |
| hook | useConversationStudySession | `apps/web/features/study/hooks/use-conversation-study-session.ts` | Reads the session for the open conversation |
| screen | StudyScreen (mobile) | `apps/mobile/src/features/study/StudyScreen.tsx` | Starts a session on mobile |
| component | StudyModeBanner | `apps/mobile/src/features/study/StudyModeBanner.tsx` | Mobile chat banner for study mode |
| config | CLI study output style | `apps/cli/src/output_styles.rs` | A named 'study' style (line 55) |
| config | study output style text | `crates/agiworkforce-agent-core/assets/output_styles/study.md` | CLI teaching guidance, no language or speech lines |
| test | study-session.test | `apps/web/features/study/lib/study-session.test.ts` | Instruction composing |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Learner starts a session; page creates a conversation and records the session. | device and our servers | StudyPage.tsx:103-121; route.ts:61-93 |
| Each chat turn: server reads the open session and builds the study instruction. | our servers | request-processor.ts:3802-3830; study-session-store.ts:86-101 |
| The instruction is merged with account instructions and the current request by the shared precedence resolver. | our servers | study-session.ts:89-113; request-processor.ts:2111-2125 (merge point; exact use not fully read) |
| The model writes exercises and feedback. | outside service | [inferred] model provider chosen by SYS-chat-turn-pipeline |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Study session row | table study_sessions | Server held, read by apps | Until deleted; 'Leave study mode' sets ended_at |
| The learner's explanation and answers | Normal chat messages | With chat history | As chat history |

**Models and providers.** The instruction is model neutral text. Whether it reaches the model depends on the chat route in use; study instructions are added in the web chat completions pipeline (request-processor.ts). Whether the mobile Local mode or own-key routes add it is unknown.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in (study sessions API is user scoped, route.ts:55-61). |
| Permissions | Owner of the conversation only (study-session-store.ts:86-101 filters by user). |
| Subscription | none found in the code for study mode itself; model use follows the chat turn rules. |
| Limits and metering | Topic 200 characters; the turn is metered like any chat turn [inferred]. |
| Feature flags | none found in the code |
| Model compatibility | Any chat model [inferred]; no restriction found. |
| Provider restrictions | none found in the code |
| Local mode | Unknown. The instruction is added by the server pipeline; a purely on-device chat does not pass through it [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Study mode left | Instruction not added (query needs ended_at is null) | study-session-store.ts:91-95 |
| Instruction conflicts with account instruction | Resolved by shared precedence | study-session.ts:83-113 |
| Microphone permission denied or speech error | not handled in the study code | no study code uses the mic |
| Pronunciation feedback | not available | no code found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/study/lib/study-session.test.ts`: Study instruction and prompt composing (specific assertions not read)
- `apps/web/features/study/server/study-session-store.test.ts`: Store behaviour including the active instruction
- `apps/web/features/study/components/StudyModeIndicator.test.tsx`: Indicator for study mode

**Test scenarios**

- **Language session**
  1. Start a session on 'German dative case'
  2. Answer the first exercise wrongly
  - Expected: The reply corrects the answer and names the rule.
- **Explain back**
  1. Study a topic for several turns
  - Expected: At some point the model asks you to explain an idea in your words (model dependent).
- **Leave study mode**
  1. Tap 'Leave study mode'
  2. Send a message
  - Expected: Replies stop following the study rules.
- **No pronunciation**
  1. Look for a pronunciation control on each app
  - Expected: None exists.

**Where to look when it fails**

- Check an active row in study_sessions (ended_at null)
- Inspect the developer-layer text on a request
- Study indicator absent means the session lookup failed

**Hands-on test plans**

- Web: [70-qa/test-plans/web/038-learning-and-study-products.md](../../70-qa/test-plans/web/038-learning-and-study-products.md)
- Desktop: [70-qa/test-plans/desktop/038-learning-and-study-products.md](../../70-qa/test-plans/desktop/038-learning-and-study-products.md)
- CLI: [70-qa/test-plans/cli/038-learning-and-study-products.md](../../70-qa/test-plans/cli/038-learning-and-study-products.md)
- No hands-on plan yet for Mobile: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **No speech input or feedback in study** Affects: All apps. Evidence: No code found; study-session.ts:55 is prompt text. Work needed: Connect study chat to the voice path and define feedback
- **Language exercises are not structured** Affects: Language learners. Evidence: study-session.ts:56. Work needed: Interactive exercise block types
- **No pronunciation practice** Affects: All learners. Evidence: search found none. Work needed: Speech scoring route and UI
- **Instruction only reaches the model through the web pipeline** Affects: Mobile Local mode and CLI. Evidence: request-processor.ts:3802-3830 is in the web API; mobile local path not checked. Work needed: Verify and, if needed, add the instruction on those paths
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- table:study_sessions
- api:POST /api/study/sessions
- SYS-chat-turn-pipeline
- SYS-voice-and-media
- SYS-model-catalog-and-routing
- SYS-memory-projects-and-context
- F038-07
- F038-12

## Unknown

- Whether the mobile and CLI chat paths add the study instruction.
- Exact assertions in study-session.test.ts.
- How the chat microphone behaves in a study chat.
- Whether the instruction reaches own-key and Local routes.
