---
id: "PLAN-mobile-110"
type: "test-plan"
title: "Mobile · 110. Cross-product experiences to include in the product map"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "110"
---
# Mobile · 110. Cross-product experiences to include in the product map

8 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S110.02 Document → presentation.

- **Expected:** A document (chat artifact or uploaded file) is turned into a presentation the user can open and keep working on.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/utils/generatedFileArtifacts.ts:81; apps/mobile/src/features/chat/components/GeneratedFileCard.tsx:44; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:654
- **Where to find it:** Chat > open a chat artifact card > Share generated file (the presentation is requested from the + (Add to chat) sheet, where the output format option is; its visible label was not found) (labels found in the code)
- **Needs:** a chat that produced a presentation or a file, or a request for a presentation
- **Steps:**
  1. Open a chat that has a generated file or artifact card.
  2. Tap the artifact card to open the artifact screen.
  3. Look for the file card showing the file name, kind and checksum.
  4. Tap Share generated file (or Download artifact) to keep a copy.
  5. Compare with Expected: a presentation opens or can be shared and kept.

## S110.03 Spreadsheet → chart → report.

- **Expected:** A spreadsheet the user brings is analysed, charted, and turned into a report that contains the chart.
- **Code:** partial. Evidence moved: apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1012 (quoted code not found in the file now); apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** chart artifacts now draw as charts on the phone (shared parser in @agiworkforce/types); the chart-in-report part is the web switch-on: AGI_E2B_EXECUTION=1 with E2B keys
- **Where to find it:** not found in the code. Chart artifacts open on the phone in the artifact screen (testID artifact-fullscreen-chart at apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1886, not visible text). The chart-in-report step is web-side: apps/web/lib/e2b/gate.ts gates on AGI_E2B_EXECUTION=1 and E2B_API_KEY. No mobile control that builds the report with a chart was found, and the spreadsheet upload control was not located.
- **Needs:** a spreadsheet file and a web account with E2B execution enabled

## S110.07 Voice → durable work task.

- **Expected:** A request made in voice mode becomes a durable AGI Work task (runs in background, tracked in Tasks) without the user retyping it.
- **Code:** done. Evidence present: apps/mobile/src/features/voice/services/liveVoiceSession.ts:352; apps/mobile/app/(app)/chat/[id].tsx:1760
- **Where to find it:** Chat screen > Start voice mode (microphone button in the composer) > Start voice > speak the request > Work switch (Work) > AGI Work list in the side menu (labels found in the code)
- **Needs:** a microphone, a signed-in cloud account, and AGI Work available on the account
- **Steps:**
  1. Open a chat and tap the Start voice mode button in the composer.
  2. Tap Start voice (or pick a voice first) and allow the microphone.
  3. Say a task, for example a request that needs several steps and tools.
  4. Watch for the Work mode message the phone sends into the chat, then open the side menu and tap AGI Work.
  5. Compare with Expected: the request appears as a task in AGI Work without retyping it.

## S110.18 Web conversation → mobile continuation.

- **Expected:** A conversation started in the web app appears on the phone with its full history, the user sends a follow-up there, and the reply syncs back to web.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/ChatsListScreen.tsx:527; apps/mobile/services/cloudSyncEngine.ts:440; apps/mobile/stores/chat/chatExecutionStore.ts:1620; apps/mobile/stores/chat/chatExecutionStore.ts:1484
- **Where to find it:** Side menu > chat list (cloud mode) > the conversation title (labels found in the code)
- **Needs:** a web account and the same account signed in on the phone, with network access
- **Steps:**
  1. Sign in with the same account on the web app and start a chat there.
  2. On the phone, open the side menu and check the chat list in cloud mode.
  3. Open the web conversation and confirm the full earlier history is shown.
  4. Send a follow-up message on the phone.
  5. Open the web app again and check the reply appears in the same conversation (compare with Expected).

## S110.21 Mobile request → authorized local-host execution.

- **Expected:** From the phone the user sends a new request that runs on their paired computer under that computer's approvals, and sees the result on the phone.
- **Code:** done. Evidence present: apps/mobile/src/features/companion/components/DispatchTaskComposer.tsx:193
- **Where to find it:** Side menu > AGI Code (or Settings > Remote control > Connections) > the paired computer > Start on Desktop (labels found in the code)
- **Needs:** a paired and connected desktop computer, a signed-in account, and Remote Control on the plan
- **Steps:**
  1. Make sure a computer is paired and connected (Settings > Remote control > Connections).
  2. Open the side menu and tap AGI Code, then open the paired computer.
  3. In the Start on Desktop box, type a request in the field that says What should Desktop work on?.
  4. Tap the send control and wait.
  5. Look under Recent Dispatch tasks for the task and expand its result to check it matches Expected.

## S110.24 Existing notebook → main assistant context.

- **Expected:** From the main chat, the user brings an existing notebook (project) into the conversation so its instructions and sources ground the answers.
- **Code:** done. Evidence moved: apps/mobile/stores/chat/chatExecutionStore.ts:3276; apps/mobile/stores/chat/chatMessageStore.ts:696 (quoted code not found in the file now)
- **Where to find it:** Chat > + (Add to chat) > Project (shows Choose or the project name) (labels found in the code)
- **Needs:** an existing project with sources or instructions
- **Steps:**
  1. Create or open a project under Projects in the side menu and add a source or instruction.
  2. Open a new chat and tap the + (Add to chat) button in the composer.
  3. Tap Project and choose the project; the row shows its name in place of Choose.
  4. Ask a question that the project's sources should answer.
  5. Compare the answer with the project's sources and instructions (Expected).

## S110.26 Usage exhaustion → alternative eligible path.

- **Expected:** When the user runs out of usage, the product offers an eligible alternative (named eligible model, reset wait, or purchase) that the user can take in one step and continue.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx:358; apps/mobile/app/(app)/chat/[id].tsx:2858
- **Where to find it:** Chat > send a message when usage is used up > paywall sheet > Choose a standard model or View upgrade options (labels found in the code)
- **Needs:** a Free account or an account at its usage limit
- **Steps:**
  1. Send a message on an account that has reached its usage limit.
  2. Read the sheet: it names the blocked feature and the reset time if one applies.
  3. If offered, tap Choose a standard model to continue with a standard model in one step.
  4. Otherwise tap View upgrade options (or Choose a plan) and check the plan options shown.
  5. Compare with Expected: an eligible alternative is offered and can be taken in one step.

## S110.28 Published output → versioned update.

- **Expected:** A published output is updated in place: the user changes it, republishes to the same link, and the new version is recorded and reversible.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:539 (quoted code not found in the file now); apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:830; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:329 (quoted code not found in the file now)
- **Where to find it:** Open a chat artifact > More artifact actions > Republish artifact link (or Publish artifact to a public link) > Edit source > Save as a new version > Version N of M > Restore version N (labels found in the code)
- **Needs:** a signed-in cloud account and an artifact that can be published
- **Steps:**
  1. Open a chat artifact and tap More artifact actions, then Publish artifact to a public link and confirm Publish.
  2. Tap Edit source, change the text, and tap Save as a new version.
  3. Tap More artifact actions again and tap Republish artifact link; confirm the same link updates.
  4. Tap Show changes and use the version counter (Previous version / Next version) to compare versions.
  5. Tap Restore version to go back to an earlier version, then check the link and version history (Expected).
