---
id: "DOC-70-qa-results-basics-scripts-mobile"
type: "results"
title: "Mobile baseline"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Mobile baseline

Follow the shared capture and scoring rules in [Run protocol](../README.md). Use the scorecard to see which tasks apply to each platform and mode. Each row below is a separate recorded run.

| Task | User action | Expected and recovery checks |
|---|---|---|
| **M-1** Sign in, age step, and reach a working chat in under a minute | Start at the cold app launch, choose Cloud where applicable, sign in using the actual browser handoff and complete eligible age and consent prompts. Also try cancel/back. | Time to a usable composer; verify under 60 seconds, correct route, and cancel retaining a safe screen. In Local prove the basic chat entry works without Cloud sign-in. |
| **M-2** Ask a question and get a fast, streamed answer that the server keeps (the pilot) | Send a uniquely tagged “What is 17 × 19? Show your work.” Observe tokens, background once on a second prompt and return after completion. | Verify 323, first-paint and last-token timings, correct route label and exactly one saved turn after restart. For Cloud inspect matching account Web history and usage before and after; Local history stays on-device. |
| **M-3** The same chat appears on Web, and a Web chat appears on the phone | On the phone create a Cloud chat carrying one unique code; in Web create another. Reopen both views and follow up from the other device. | Both transcripts show each turn once with context intact. For Local, verify its synthetic code stays absent from signed-in Web unless the tester explicitly consents to a fork. |
| **M-4** Attach a photo from the camera and from the library, and a file | Photograph the synthetic tiles using the camera, select the PNG in the gallery and pick the route PDF via Files. Cancel one pick, then send the others. | Answer identifies three shapes and Cedar Bay; actual attachments persist. Deny camera permission once and verify recovery through UI. |
| **M-5** Voice conversation, and dictation into the message box | Speak “eleven plus seven” in voice chat, interrupt and stop; separately dictate “violet parcel” into the message box and edit before sending. | Voice answer is eighteen, dictation can be corrected pre-send, and microphone state matches the visible controls. Denial is actionable. |
| **M-6** Generate an image | Request a blue circle above a yellow square on a white background, open the received image and revisit the conversation after backgrounding. | Inspect the actual picture and persistence. Unsupported/locked modes disclose the appropriate route or entitlement and do not transfer the prompt silently. |
| **M-7** Local: chat with the on-device model with the network off | On each real iPhone and Android phone download a compatible local model while online. Select Local, disable Wi-Fi and cellular, cold-open and ask 17 × 19 with explanation. | Real device returns 323 and the local turn survives reopening offline. Record device, model, offline indicators and both local labels. A simulator run can check the UI only. |
| **M-8** Switch between Local and Cloud with a clear consent step and label | Create a Local chat with a unique private marker, switch to Cloud, decline first, then explicitly allow sharing only synthetic content using the offered path. | Correct visible provider/mode, separate conversations unless an explicit fork was chosen, and cancel leaves private material local. |
| **M-9** A notification when a long answer or task finishes | Allow notifications for a QA profile and start a long task, then background without closing it. Repeat once with notifications declined. | Observe exactly one completion notification opening the right chat; declined notifications leave an accessible in-app result. Record actual OS delivery on devices that support it. |
| **M-10** Find, rename and delete past chats; share an answer to another app | Find and rename a disposable chat. Share only a synthetic answer through the native share sheet, preview and cancel or save locally; reopen after restart. | Rename persists, share output contains the chosen answer only. Test delete/recover solely on the named test chat with founder approval. |
