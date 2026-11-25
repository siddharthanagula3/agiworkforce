---
id: "F016-10"
type: "feature"
title: "Voice and imported attribution"
aliases: ["(spoken)", "voice transcript marker", "The messages below came from <origin>", "imported_from", "S16.19", "S16.20", "/voice", "/v"]
area: "16 User-message components"
available_on: ["cli"]
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "built", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S16.19", "S16.20"]
depends_on: ["surface:cli", "mode:local", "mode:own-key", "mode:cloud", "SYS-voice-and-media", "SYS-execution-boundaries", "SYS-sync-and-continuity", "SYS-security-and-privacy", "SYS-inference-providers", "SYS-local-inference", "file:apps/cli/src/voice.rs", "file:apps/cli/src/sessions.rs"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F016-10 Voice and imported attribution

In the CLI, your messages from a /voice session start with '(spoken)' in the transcript. When you resume a session that was pulled from your AGI account or a cloud code session, the CLI puts a system line first: 'The messages below came from <origin>.' Other apps have neither.

Area: [16. User-message components](README.md). Requirement items: [S16.19](../../10-requirements/capabilities/016-user-message-components.md#s1619), [S16.20](../../10-requirements/capabilities/016-user-message-components.md#s1620).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Marks the source of messages in the CLI terminal screen: spoken text and imported history (apps/cli/src/tui/tui_app.rs:4469,7566-7571,691-698).

**Why it exists.** Speech-to-text can make mistakes, and an imported conversation did not start on this computer. A marker tells the reader how much to trust the wording and where the text came from. [inferred]

**Who uses it.** CLI users who dictate or who continue conversations from their AGI account or cloud Code sessions.

**Problems it solves**

- Reader cannot tell typed text from a spoken transcript.
- A resumed session looks like it began here, though it came from the account or the cloud.

**Use cases**

- Run /voice, speak a request, and read '(spoken) <transcript>' in the transcript.
- Run the resume command for an account conversation and see 'The messages below came from your AGI account.'
- Teleport a cloud Code session and see 'The messages below came from the cloud Code session.'

## 2. User experience

**Where to find it**

- CLI terminal UI only: slash command /voice (alias /v) with an optional language code (tui_app.rs:6352-6368).
- Imported note: appears at the top of the transcript when a resumed managed session has an imported_from value (tui_app.rs:665-698).
- Web, desktop, mobile, VS Code, Chrome: none (brief S16.19, S16.20).

**Before you start**

- Voice: a transcription backend, one of: managed transcription with an AGI sign-in in Managed mode, an OpenAI key in the environment, or a local whisper program on PATH; Local mode blocks cloud transcription unless AGIWORKFORCE_VOICE_ALLOW_CLOUD is 1 (apps/cli/src/voice.rs:427-439,493-507,75-108).
- Imported note: a session created by the account or cloud-code import commands (lib.rs:2519-2530,2642-2650; sessions.rs:662,771).

**Screens and controls**

- The voice session leaves the full-screen UI, runs in the plain terminal, then returns (tui_app.rs:7549-7563).
- Transcript rows: user rows with '(spoken) ' prefix; a system row 'Voice session ended.' or 'Voice mode failed: <error>' (tui_app.rs:7572-7578).

**Journey**

1. Type /voice or /v es.
2. The terminal drops the full-screen view and the voice mode prints which backend it uses.
3. Speak; the transcripts are sent as user messages.
4. On return the screen shows the new user messages prefixed '(spoken)', then 'Voice session ended.'.
5. Import: run the resume command for an account or cloud Code session; open the TUI; the first line says where the messages came from.

**What the person sees and gets**

- '(spoken) <text>' prefix on user rows from the voice session.
- System row 'The messages below came from <origin>.'; origin text 'your AGI account' or 'the cloud Code session' (sessions.rs:771, lib.rs:2650).
- Unsupported language message listing supported languages (tui_app.rs:6363-6368).

**Settings**

- Language argument of /voice, default from voice_languages.
- Environment variable AGIWORKFORCE_VOICE_ALLOW_CLOUD set to 1 permits cloud transcription in Local mode (voice.rs:85-87).
- Environment variable OPENAI_API_KEY presence selects the OpenAI backend (voice.rs:434).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- '(spoken)' is prefixed on user rows appended during a /voice run (tui_app.rs:7549-7571).
- Imported origin is stored in session metadata (imported_from) at import and shown as the first system line on resume (sessions.rs:615-670,135-140; tui_app.rs:665-698).
- Fork copies the imported_from value, so a branch of an imported session keeps its origin (sessions.rs:970).
- Privacy gate keeps Local mode from silently using cloud transcription (voice.rs:493-507).

**Incomplete**

- The '(spoken)' prefix is added to the on-screen rows only; it is not stored in the session messages, so after resume the marker is gone (the prefix is applied to app.chat_messages text, tui_app.rs:7566-7571; session messages unchanged) [inferred from code reading].
- The imported note shows only in the TUI; no other CLI display path was found to read imported_from (grep showed only tui_app.rs and sessions.rs).
- Only two origin strings were found: 'your AGI account' and 'the cloud Code session'; no other import origins (another product, shared link) exist in code searched.

**Present but disconnected or switched off**

- Cloud transcription is disabled in Local mode unless the opt-in variable is set (voice.rs:493-507).

**Not available**

- Web, desktop, mobile, VS Code, Chrome: no voice-transcript or imported marker (brief S16.19, S16.20; web voice input exists elsewhere but its message marking was not found).

## 4. Required behaviour

**Established requirements**

- A user message that came from speech is marked as a voice transcript (for example a mic badge or 'Transcribed'). (source: brief S16.19)
- Messages brought in from elsewhere (another product, a shared link, another device) are marked with where they came from. (source: brief S16.20)
- CLI prefixes spoken text with '(spoken)'. (source: tui_app.rs:4469,7569)
- CLI inserts a system line 'The messages below came from <origin>.' at the top of an imported session. (source: tui_app.rs:691-698, sessions.rs:136)
- Never silently route Local audio or chats to cloud without an explicit gate. (source: apps/cli/src/voice.rs:69-74 and doc: AGENTS.md section 6)

**Acceptance criteria**

1. After /voice, each user message from the session starts with '(spoken) '.
2. Typed messages are not prefixed.
3. A session imported from the account shows 'The messages below came from your AGI account.' as the first line on resume.
4. A session with no imported_from shows no such line.
5. An empty imported transcript shows no note.
6. In Local mode with no opt-in and no local whisper program, /voice refuses and does not send audio to a cloud service.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The brief's 'another device' and 'shared link' sources have no matching origin string in the CLI.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Store a voice flag in message metadata so the marker survives resume and shows on other apps.
- [proposed] Add a mic marker on web and mobile where speech input exists.
- [proposed] Show the imported note on VS Code, which reads the same sessions through the app server.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | VOICE_TRANSCRIPT_LABEL | `apps/cli/src/tui/tui_app.rs` | Constant '(spoken)' (line 4469). |
| command | SlashResult::RunVoice handler | `apps/cli/src/tui/tui_app.rs` | Runs voice mode and prefixes new user rows (lines 7549-7578). |
| command | /voice and /v slash handler | `apps/cli/src/tui/tui_app.rs` | Validates language and returns RunVoice (lines 6352-6368). |
| service | run_voice_mode | `apps/cli/src/voice.rs` | Records, transcribes and sends turns; privacy gate. |
| service | detect_backend and gate_backend | `apps/cli/src/voice.rs` | Pick managed, OpenAI or local whisper and apply the Local gate (lines 427-507). |
| config | voice_languages | `apps/cli/src/voice_languages.rs` | Supported language codes (file referenced by voice.rs; not opened). |
| schema | SessionMetadata.imported_from | `apps/cli/src/sessions.rs` | Stores where the session came from (line 115). |
| service | import_hosted_session | `apps/cli/src/sessions.rs` | Writes a pulled conversation and sets imported_from (lines 615-670). |
| service | adopt_hosted_conversation | `apps/cli/src/sessions.rs` | Sets imported_from 'your AGI account' on first adoption (line 771). |
| service | imported_from reader | `apps/cli/src/sessions.rs` | Returns the stored origin (lines 135-140). |
| service | teleport_code_session | `apps/cli/src/lib.rs` | Imports a cloud Code session with origin 'the cloud Code session' (lines 2519,2642-2650). |
| component | TuiApp::new transcript seeding | `apps/cli/src/tui/tui_app.rs` | Inserts the 'came from' system line (lines 665-698). |
| service | fork_session copying imported_from | `apps/cli/src/sessions.rs` | Branch keeps the origin (line 970). |
| test | voice gate unit tests | `apps/cli/src/voice.rs` | gate_backend tests (lines 1448-1465). |
| test | voice slash dispatch test | `apps/cli/src/tui/tui_app.rs` | voice_slash_dispatches_instead_of_redirecting_to_the_repl (line 10288). |
| test | adopt hosted conversation tests | `apps/cli/src/sessions.rs` | Assert imported_from 'your AGI account' (line 1335). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person types /voice; the TUI leaves the alternate screen and calls run_voice_mode. | device | tui_app.rs:7549-7563 |
| Voice mode picks a transcription backend: managed (our servers, needs sign-in), OpenAI API (outside service, needs a key), or a local whisper program (device). | device and our servers | apps/cli/src/voice.rs:427-439 |
| In Local mode without opt-in the cloud backends are replaced by the local program or voice is refused. | device | voice.rs:493-507 |
| New session messages are appended to the screen and user rows get the '(spoken)' prefix. | device | tui_app.rs:7564-7571 |
| On resume, the TUI reads imported_from from the session metadata file and inserts the system line. | device | tui_app.rs:665-698; sessions.rs:135-140 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| imported_from text | session metadata file in the CLI session store | No | Kept with the session; copied to forks. |
| '(spoken)' prefix | in-memory transcript only | No | Lost when the TUI closes [inferred]. |

**Models and providers.** Voice may call a transcription provider (AGI managed service, OpenAI Whisper API) or a local whisper program; then the transcript goes to the chat model as a normal user message. Which chat model answers is the session's current model; the marker does not depend on it.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Managed transcription needs the AGI sign-in token (voice.rs:428-431). OpenAI backend needs OPENAI_API_KEY. Local whisper needs neither. Import commands need an account connection (lib.rs:2530,2625-2640). |
| Permissions | Microphone access on the computer (details not opened). |
| Subscription | none found in the code for the markers. Whether managed transcription is metered or plan-gated: unknown. |
| Limits and metering | none found in the code for the markers; transcription limits unknown. |
| Feature flags | Environment variable AGIWORKFORCE_VOICE_ALLOW_CLOUD (voice.rs:85-87). |
| Model compatibility | none; the marker is independent of the chat model. |
| Provider restrictions | Cloud transcription providers are blocked in Local mode without the opt-in (voice.rs:493-507). |
| Local mode | Works with a local whisper program on the computer and no cloud call. Without one, voice refuses in Local mode unless the person sets the opt-in variable (voice.rs:69-74,493-507). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Voice fails | System row 'Voice mode failed: <error>' (tui_app.rs:7574-7577). | tui_app.rs:7572-7578 |
| Unsupported language | System message listing supported codes. | tui_app.rs:6363-6368; voice.rs:89-99 |
| No backend in Local mode | Voice exits with guidance; no silent cloud use. | voice.rs:69-74 |
| Empty imported transcript | The 'came from' line is not added. | tui_app.rs:691 |
| Resume after voice | The '(spoken)' prefix does not reappear because it is not stored [inferred]. | tui_app.rs:7566-7571 versus chat_message_from_session |
| Non-TUI paths | not handled in the code searched; imported_from is read only in tui_app.rs. | grep of imported_from in apps/cli/src |
| Accessibility | Plain text prefix works in screen readers; no icon. | tui_app.rs:4469 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/cli/src/voice.rs`: Unit tests for the Local privacy gate (gate_backend) and backend detection.
- `apps/cli/src/tui/tui_app.rs`: Unit test that /voice and /v dispatch RunVoice with default or given language.
- `apps/cli/src/sessions.rs`: Adopting a hosted conversation sets imported_from to 'your AGI account'.

**Test scenarios**

- **Spoken marker**
  1. Open the CLI TUI with a working transcription backend.
  2. Type /voice, speak one sentence, end the voice session.
  - Expected: The transcript row starts with '(spoken) ' and 'Voice session ended.' follows; typed rows have no prefix.
- **Imported note**
  1. Adopt an account conversation with the CLI resume command.
  2. Open the session in the TUI.
  - Expected: First line: 'The messages below came from your AGI account.'
- **No note for local sessions**
  1. Start a new local session and resume it.
  - Expected: No 'came from' line.
- **Local gate**
  1. Set Local mode, unset the OpenAI key and the opt-in variable, remove whisper from PATH.
  2. Run /voice.
  - Expected: A refusal with guidance, no audio leaves the device.
- **Marker not persisted**
  1. Do a /voice turn, quit, resume the session.
  - Expected: Check whether '(spoken)' remains; the code suggests it does not.

**Where to look when it fails**

- Message 'Voice mode failed: <error>' in the transcript.
- Messages starting 'voice:' printed to stderr naming the backend (voice.rs:111-130).
- Session metadata file imported_from field in the session store.

**Hands-on test plans**

- CLI: [70-qa/test-plans/cli/016-user-message-components.md](../../70-qa/test-plans/cli/016-user-message-components.md)

## 10. Gaps and dependencies

- **The spoken marker is not saved with the message, so it vanishes after resume and never reaches other apps.** Affects: CLI users; any app that syncs the session. Evidence: tui_app.rs:7566-7571. Work needed: Save a voice flag in message metadata.
- **No voice or imported marker in web, desktop, mobile, VS Code or Chrome.** Affects: All apps except CLI. Evidence: brief S16.19, S16.20. Work needed: Design a shared marker; contract in SYS-voice-and-media.
- **Imported origins other than the account and cloud Code sessions (another product, a shared link) are not implemented.** Affects: All apps. Evidence: only two origin strings found (sessions.rs:771, lib.rs:2650). Work needed: Add origins when import features exist.
- **No test asserts the '(spoken)' prefix or the 'came from' line on screen.** Affects: Testers. Evidence: tests found cover dispatch, gate and metadata only. Work needed: Add TUI rendering tests.
- Not built on: Web, Desktop, Mobile, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:cli
- mode:local
- mode:own-key
- mode:cloud
- SYS-voice-and-media
- SYS-execution-boundaries
- SYS-sync-and-continuity
- SYS-security-and-privacy
- SYS-inference-providers
- SYS-local-inference
- file:apps/cli/src/voice.rs
- file:apps/cli/src/sessions.rs

## Unknown

- Whether the spoken marker is stored anywhere after the screen redraws.
- Whether managed transcription is plan-gated or metered.
- Whether any web, desktop or mobile voice input marks the message; none found in files searched.
- How the app server or VS Code display imported sessions.
- Contents of voice_languages.rs and microphone permission handling (not opened).
- Where brief line tui_app.rs:3275 points (that line is not voice code).
