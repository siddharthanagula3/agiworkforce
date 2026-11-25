---
id: "F053-11"
type: "feature"
title: "Recorded skills (demonstration and voice teaching)"
aliases: ["Recorded skills (demonstration and voice teaching)", "Record a skill", "Recorded-demonstration creation (S53.27)", "Screen-and-voice teaching flow (S53.28)", "Replay configuration (S53.29)", "Example-based template creation (S53.30)", "Draft a skill", "Save as skill", "Learned skills (CLI)"]
area: "53 Skill creation and management"
available_on: ["web", "desktop", "cli"]
implementation: {web: "partial", desktop: "partial", mobile: "missing", cli: "partial", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S53.27", "S53.28", "S53.29", "S53.30"]
depends_on: ["SYS-voice-and-media", "SYS-files-artifacts-and-storage", "SYS-chat-turn-pipeline", "SYS-security-and-privacy", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "F053-07", "surface:desktop", "surface:web", "surface:cli"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F053-11 Recorded skills (demonstration and voice teaching)

Partly built. On the desktop app, 'Record a skill' takes a screenshot every few seconds (macOS and Windows), then attaches chosen screenshots to a chat so the model drafts a skill. No voice, no replay settings. Save-as-skill turns finished chat work into a skill draft. The CLI auto-writes skills from repeated tool use.

Area: [53. Skill creation and management](README.md). Requirement items: [S53.27](../../10-requirements/capabilities/053-skill-creation-and-management.md#s5327), [S53.28](../../10-requirements/capabilities/053-skill-creation-and-management.md#s5328), [S53.29](../../10-requirements/capabilities/053-skill-creation-and-management.md#s5329), [S53.30](../../10-requirements/capabilities/053-skill-creation-and-management.md#s5330).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lets a person teach a skill by showing the screen: the desktop records screenshots with consent, the person picks frames, and the chat drafts a skill from them. A separate 'turn this chat into a skill' prompt and a CLI pattern learner also create skills without hand-writing.

**Why it exists.** Brief items S53.27 to S53.30 ask for creation by demonstration, screen and voice teaching, replay configuration and generation from examples.

**Who uses it.** Desktop users with a skill-capable account; any chat user for save-as-skill; CLI users after repeated sessions.

**Problems it solves**

- Writing a skill from scratch is slow; screenshots give the model the steps.
- Finished work in a chat can become a reusable skill (apps/web/features/skills/components/save-as-skill.ts:8-15).

**Use cases**

- On the desktop app: record a task in another app, stop, choose screenshots, 'Draft a skill', describe the goal, send.
- Web chat: ask 'Turn the work we just finished in this chat into a reusable skill' and save the draft card.
- CLI: after the same tool pattern appears in 3 or more sessions a skill file is written to ~/.agiworkforce/skills/learned/.

## 2. User experience

**Where to find it**

- Desktop app (Electron, hosted web composer): the composer plus menu row 'Record a skill', under the attach row (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:149-155, 774-790; apps/web/features/skill-recorder/components/SkillRecorder.tsx:54).
- Web browser: the row is absent (apps/web/features/chat/components/Composer/ComposerPlusMenu.recordSkill.test.tsx:221-226).
- Chat on web: the 'Save as skill' request text is sent as a prompt (apps/web/features/skills/components/save-as-skill.ts:12-15).
- CLI: a line 'Learned skill: <name> (confidence: N%)' after a session (apps/cli/src/agent/chat.rs:1575-1590).
- Mobile, VS Code, Chrome: nothing.

**Before you start**

- Desktop app host that reports it can record; macOS or Windows (apps/desktop/electron/runtime/skillCapture.ts:31, 58-65).
- Account allowed to author skills (the row hides otherwise) (apps/web/features/skill-recorder/hooks/use-skill-recorder-entry.ts:20-34).
- macOS Screen Recording permission; the dialog offers 'Open System Settings' (apps/web/features/skill-recorder/components/SkillRecorder.tsx:60, 300).

**Screens and controls**

- Consent dialog text: '<desktop product> takes a screenshot every few seconds until you stop. Clicks, typing and audio are not recorded. Screenshots stay on this device until you save or discard the recording.' with 'Start recording' and 'Cancel' (apps/web/features/skill-recorder/components/SkillRecorder.tsx:55-59).
- Capture bar 'Skill recording' with 'Done', 'Review', 'Discard' (SkillRecorder.tsx:63-72).
- Summary 'Your recording' and review 'Choose screenshots', then 'Draft a skill' (SkillRecorder.tsx:68-72).
- Discard confirm 'Discard this recording?' naming the screenshots deleted and that it cannot be undone (SkillRecorder.tsx:73-74, 95-97).

**Journey**

1. 1. Open the plus menu and press 'Record a skill'.
2. 2. Read consent and press 'Start recording' (the desktop host then asks the person itself).
3. 3. Do the task; screenshots are taken about every 3 seconds, skipping while a password field is active.
4. 4. Press 'Done' (or the limit of 10 minutes or 200 screenshots stops it).
5. 5. Review and choose screenshots (limited by the plan's attachment allowance).
6. 6. 'Draft a skill': screenshots are attached to the chat and the skill-creator skill is selected if it is installed.
7. 7. Say what the skill should do and send; the model drafts a skill.

**What the person sees and gets**

- Toast 'Screenshots attached. Say what the skill should do, then send.' or partial and none variants (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:149-155).
- Notes: 'N screenshots skipped while a password field was active.'; 'If you do not save it, it is deleted at <time>.' (SkillRecorder.tsx:84-92).
- Stop reasons 'It reached the recording limit.' and 'It stopped when the screen locked or the computer slept.' (SkillRecorder.tsx:76-79).

**Settings**

- macOS Screen Recording permission via System Settings.
- Limits are fixed constants, not settings (packages/contracts/local-runtime/src/skill-capture.ts:38-45).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Desktop host commands skill_capture_status, start, stop, discard, save exist and are wired in the runtime dispatcher (apps/desktop/electron/runtime/dispatcher.ts:2623-2632).
- Start is refused unless the page names the current consent revision, and the host asks the user itself (packages/contracts/local-runtime/src/skill-capture.ts:30-36; apps/web/features/skill-recorder/lib/skill-capture-client.ts:34-39).
- Limits: frame every 3000 ms, 10 minutes, 200 frames, width 1280, a stopped recording kept 15 minutes (packages/contracts/local-runtime/src/skill-capture.ts:38-45).
- Supported platforms macOS and Windows; other platforms get 'Recording a skill is supported on macOS and Windows' (apps/desktop/electron/runtime/skillCapture.ts:31, 58-65).
- Recorder UI with consent, bar, summary, review and discard confirm (apps/web/features/skill-recorder/components/SkillRecorder.tsx).
- Draft handoff attaches screenshots as chat files and selects skill-creator when present (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:720-745).
- Save-as-skill prompt and the draft_plugin tool path exist (apps/web/features/skills/components/save-as-skill.ts:8-15).
- CLI pattern learner writes skill files after 3 or more matching successful sessions (apps/cli/src/skill_learner.rs:1-60, 60-120; apps/cli/src/agent/chat.rs:1557-1590).

**Incomplete**

- The recording is screenshots only: channels list is ['screen'] and the consent says audio is not recorded (packages/contracts/local-runtime/src/skill-capture.ts:17-19; SkillRecorder.tsx:55).
- The model sees screenshots as chat attachments; the skill it drafts is the model's reading of images, not a replayable script [inferred].
- CLI learner passes was_successful as a constant true, so failures are not filtered (apps/cli/src/agent/chat.rs:1575-1580).

**Present but disconnected or switched off**

- The row is hidden in a browser, on hosts that predate skill capture, and for accounts that cannot author skills (apps/web/features/chat/components/Composer/ComposerPlusMenu.recordSkill.test.tsx:221-250).
- The retained Tauri desktop code has an automation recorder; it was not checked and is not the public desktop: unknown.

**Not available**

- Voice narration capture and a screen-and-voice flow on all apps (brief S53.28; contract channels only 'screen').
- Replay configuration on all apps (brief S53.29).
- Template-based generation with a dedicated UI on all apps (brief S53.30); only save-as-skill and the skill-creator skill exist.
- Mobile, VS Code, Chrome: nothing for any of the four items; brief shows web/desktop 'missing' for S53.27 although a recorder exists (brief S53.27 vs code above).

## 4. Required behaviour

**Established requirements**

- A user can create a skill by recording a demonstration of the task. (source: brief S53.27)
- A user can teach a skill by showing the screen and narrating with voice. (source: brief S53.28)
- A recorded skill has configurable replay settings. (source: brief S53.29)
- A user can create a skill from examples or a template, with the product generating the skill. (source: brief S53.30)
- Recording needs explicit consent; clicks, typing and audio are not recorded; screenshots stay on the device until saved or discarded. (source: apps/web/features/skill-recorder/components/SkillRecorder.tsx:55)

**Acceptance criteria**

1. In the desktop app, 'Record a skill' shows the consent text before anything is captured; Cancel or Escape captures nothing.
2. Recording stops by itself after 10 minutes or 200 screenshots and says why.
3. Frames taken while a password field is active are skipped and counted.
4. Discarding asks first and names the screenshot count.
5. 'Draft a skill' attaches no more screenshots than the plan allows and selects skill-creator.
6. In a browser, and for an account that cannot author skills, the row is absent.
7. A stopped recording not saved or discarded is dropped after 15 minutes.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Replay (S53.29) implies stored steps, which the screenshot-only recording does not produce [inferred].
- Voice teaching needs microphone consent and the voice system [inferred from SYS-voice-and-media].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add narration as a second channel with its own consent.
- [proposed] Offer the recorder on Windows and macOS CLI-free surfaces only after the brief is corrected.
- [proposed] Make the CLI learner use real success.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | SkillRecorder | `apps/web/features/skill-recorder/components/SkillRecorder.tsx` | Consent dialog, capture bar, summary, review and discard UI. |
| store | Recorder store | `apps/web/features/skill-recorder/lib/recorder-store.ts` | Holds recorder state, presenter id, view and held recording. |
| service | Skill capture client | `apps/web/features/skill-recorder/lib/skill-capture-client.ts` | Sends skill_capture_* commands to the Electron host; refuses outside Electron. |
| service | Recording files | `apps/web/features/skill-recorder/lib/recording-files.ts` | Chooses frames and turns them into JPEG files for chat. |
| hook | useSkillRecorderEntry | `apps/web/features/skill-recorder/hooks/use-skill-recorder-entry.ts` | Decides whether the row is shown (hosted, supported, can author). |
| component | ComposerPlusMenu record row and draft handoff | `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | Shows 'Record a skill', attaches screenshots, selects skill-creator. |
| config | Skill capture contract | `packages/contracts/local-runtime/src/skill-capture.ts` | Commands, phases, limits, consent revision, status and recording shapes. |
| service | Electron skill capture runtime | `apps/desktop/electron/runtime/skillCapture.ts` | Platform check, consent, capture loop, secure-input skip, retention. |
| command | Runtime dispatcher cases | `apps/desktop/electron/runtime/dispatcher.ts` | Routes skill_capture_status, start, stop, discard, save. |
| service | Save as skill | `apps/web/features/skills/components/save-as-skill.ts` | Prompt and capability hook for turning chat work into a skill draft. |
| service | Skill authoring capability | `apps/web/features/skills/services/skills-catalog.ts` | skillAuthoringCapability read from the catalog (canAuthorSkills). |
| service | CLI skill learner | `apps/cli/src/skill_learner.rs` | Detects repeated tool patterns and writes learned skills. |
| hook | CLI post-turn learning | `apps/cli/src/agent/chat.rs` | Calls the learner after a turn and prints 'Learned skill'. |
| endpoint | api:POST /api/skills | `apps/web/app/api/skills/route.ts` | Stores the saved draft as a personal skill. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Page asks the Electron host to start capture with the consent revision; the host shows its own prompt. | device | apps/web/features/skill-recorder/lib/skill-capture-client.ts:34-39; apps/desktop/electron/runtime/skillCapture.ts:247-311 |
| The host takes JPEG screenshots every 3 seconds, skips while secure input is active, and keeps them in memory until saved or discarded. | device | packages/contracts/local-runtime/src/skill-capture.ts:38-45; apps/desktop/electron/runtime/skillCapture.ts |
| Person chooses frames; the page turns them into files and attaches them to the chat composer. | device | apps/web/features/skill-recorder/lib/recording-files.ts; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:720-745 |
| On send, attachments go to the cloud chat; the model (with the skill-creator skill) drafts a skill; the person saves it. | our servers | apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:731-733; apps/web/features/skills/components/save-as-skill.ts:8-15 |
| CLI: after a successful turn, tool counts are compared with recent sessions and a SKILL.md is written under the config folder. | device | apps/cli/src/agent/chat.rs:1557-1590; apps/cli/src/skill_learner.rs:60-120 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Screenshots of the screen | Desktop app memory until saved or discarded | Not synced until the person attaches chosen ones to a chat; attached files are saved to the Library until deleted (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:95-96) | An unsaved stopped recording is deleted after 15 minutes; discard deletes immediately (packages/contracts/local-runtime/src/skill-capture.ts:44; SkillRecorder.tsx:95-97). |
| Drafted skill | table:user_skills | server-side | Until deleted by the person. |
| CLI learned skill | store:~/.agiworkforce/skills/learned | no | At most 50 kept (apps/cli/src/skill_learner.rs:25-26). |

**Models and providers.** The skill is drafted by whichever model the cloud chat route serves for that turn; the draft needs a model that accepts images and calls the draft tool. Which models qualify: unknown. The CLI learner uses no model call (apps/cli/src/skill_learner.rs:5-6).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | The recorder row needs a signed-in account that can author skills (apps/web/features/skill-recorder/hooks/use-skill-recorder-entry.ts:20-34). The CLI learner needs none. |
| Permissions | macOS Screen Recording permission; the host consent prompt; the recorder never records clicks, typing or audio (SkillRecorder.tsx:55). Egress and attachment rules for the chat apply on send. |
| Subscription | Screenshots chosen are limited by the plan's attachment allowance per message (apps/web/features/skill-recorder/components/SkillRecorder.tsx:25-28, getPlanMaxAttachmentsPerMessage). Plan names and numbers: read from the types package, not restated here. Skill authoring capability comes from the catalog (canAuthorSkills). |
| Limits and metering | 10 minutes, 200 screenshots, 1280 px width, 15 minutes retention (packages/contracts/local-runtime/src/skill-capture.ts:38-45); the drafting chat turn is metered like any chat turn. |
| Feature flags | AGI_USER_SKILL_AUTHORING (authoring on/off); host feature detection for 'skill_capture_*' commands, which an older host answers with unknown-command (apps/web/features/skill-recorder/lib/skill-capture-client.ts:57-59). |
| Model compatibility | Image input and tool calling needed for the draft turn; specific models: unknown. |
| Provider restrictions | The free-trial route refuses image input when trial capabilities exclude vision (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4383-4390). |
| Local mode | Recording itself is on-device and needs no payment. Drafting the skill sends screenshots to the cloud chat; a Local (on-device model) draft path was not found, so Local-only recording-to-skill is not available [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Browser or old host | Row absent; client throws 'Recording a skill is only available in the desktop app.' | apps/web/features/skill-recorder/lib/skill-capture-client.ts:14-27 |
| Unsupported platform | Host refuses with the macOS and Windows message. | apps/desktop/electron/runtime/skillCapture.ts:58-65, 261 |
| Screen Recording permission off | Host refusal shown with 'Open System Settings' on macOS. | apps/web/features/chat/components/Composer/ComposerPlusMenu.recordSkill.test.tsx:318 |
| Native prompt declined | Dialog closes quietly. | apps/web/features/chat/components/Composer/ComposerPlusMenu.recordSkill.test.tsx:344 |
| Screen locked, display lost, limit reached | Recording stops with a stated reason. | packages/contracts/local-runtime/src/skill-capture.ts:17-25; SkillRecorder.tsx:76-79 |
| Nothing captured | 'Nothing was captured, so there is nothing to keep.' | SkillRecorder.tsx:72 |
| Attachments unavailable or none attached | Toast 'No screenshots were attached. They are still in your recording.' | apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:149-155 |
| Host does not answer | 'The desktop app did not respond.' | SkillRecorder.tsx:62 |
| Offline, timeout, retry | not handled in the code for the recorder; the later chat send follows the chat rules. | SkillRecorder.tsx |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/skill-recorder/__tests__/recording-files.test.ts`: Frame selection, plan limit of zero attachments, JPEG files, clock format.
- `apps/web/features/chat/components/Composer/ComposerPlusMenu.recordSkill.test.tsx`: Row hidden in browser and for non-authoring accounts, position, consent first, start with revision, refusal and decline.
- `apps/desktop/electron/__tests__/dispatcher.test.ts`: Mentions skill_capture commands; depth of coverage not checked.
- `apps/web/features/skills/components/save-as-skill.test.ts`: The save-as-skill prompt triggers the plugin draft request.
- `apps/cli/src/skills.rs`: A learned skill written by the learner is discovered (inline test around line 1720).

**Test scenarios**

- **Consent first**
  1. Desktop app, plus menu, 'Record a skill'; press Cancel.
  - Expected: Nothing is captured; status stays idle.
- **Record, review, draft**
  1. Start recording; do a task for 30 seconds; Done; Review; choose frames; Draft a skill; send a goal.
  - Expected: Frames attach, skill-creator is selected, the model returns a skill draft.
- **Password field**
  1. During recording open a password field and wait over 3 seconds.
  - Expected: A skipped count appears in the summary.
- **Limit and retention**
  1. Record until the limit or leave a stopped recording for 15 minutes.
  - Expected: Stops with a reason; unsaved recording is gone afterwards.
- **Browser**
  1. Open the web app in a browser; open the plus menu.
  - Expected: No 'Record a skill' row.
- **CLI learner**
  1. Run three sessions with the same tool pattern of 5 or more calls.
  - Expected: A learned skill file appears under skills/learned and 'Learned skill' prints.

**Where to look when it fails**

- Host error codes unsupported-platform, permission-denied, conflict, invalid-arguments (apps/desktop/electron/runtime/skillCapture.ts:21).
- DesktopRuntimeError code unknown-command means an older host (skill-capture-client.ts:57).
- CLI line '[skill_learner] failed to save learned skill'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/053-skill-creation-and-management.md](../../70-qa/test-plans/web/053-skill-creation-and-management.md)
- Desktop: [70-qa/test-plans/desktop/053-skill-creation-and-management.md](../../70-qa/test-plans/desktop/053-skill-creation-and-management.md)
- CLI: [70-qa/test-plans/cli/053-skill-creation-and-management.md](../../70-qa/test-plans/cli/053-skill-creation-and-management.md)

## 10. Gaps and dependencies

- **No voice or narration capture.** Affects: All apps. Evidence: brief S53.28; packages/contracts/local-runtime/src/skill-capture.ts:17. Work needed: Add an audio channel, consent and drafting use.
- **No replay settings; recording is not a replayable script.** Affects: All apps. Evidence: brief S53.29. Work needed: Define what a recorded skill stores and how it replays.
- **No example or template generation UI beyond save-as-skill and skill-creator.** Affects: All apps. Evidence: brief S53.30. Work needed: Add a guided creation flow.
- **Brief says web and desktop are missing for S53.27 but the desktop recorder exists; brief and the earlier draft that said macOS only are out of date (Windows is supported).** Affects: Documentation. Evidence: apps/desktop/electron/runtime/skillCapture.ts:31. Work needed: Update the brief.
- **Recorder available only in the Electron desktop host; not on mobile, CLI, VS Code, Chrome.** Affects: Those apps. Evidence: apps/web/features/skill-recorder/lib/skill-capture-client.ts:19. Work needed: Decide parity target.
- **CLI learner treats every session as successful.** Affects: CLI. Evidence: apps/cli/src/agent/chat.rs:1575-1580. Work needed: Pass a real outcome.
- Not built on: Mobile, VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-voice-and-media
- SYS-files-artifacts-and-storage
- SYS-chat-turn-pipeline
- SYS-security-and-privacy
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- F053-07
- surface:desktop
- surface:web
- surface:cli

## Unknown

- Whether the retained Tauri desktop automation recorder has any skill-creation path (not read).
- Which models can draft a skill from screenshots.
- How deep apps/desktop/electron/__tests__/dispatcher.test.ts covers skill capture.
- Whether mobile or Chrome plan any recorder.
- Whether the draft_plugin tool has a plan or entitlement gate.
