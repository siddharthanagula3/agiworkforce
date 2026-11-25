---
id: "REQ-AREA-019"
type: "requirements"
title: "Requirement items: Streaming and response-presentation states"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 19. Streaming and response-presentation states

29 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S19.01

**Request accepted.** Right after sending, the surface shows that the request was accepted and work has started (before any output).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F019-01 Turn accepted, queued and preparing](../../20-features/019-streaming-and-response-presentation-states/F019-01-turn-accepted-queued-and-preparing.md)
- Competitor trace: CAP-streaming-and-response-states-01

## S19.02

**Waiting in queue.** A request that cannot start yet (queued behind a running turn or a server queue) is shown as waiting/queued.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code done, Chrome done
- Feature: [F019-01 Turn accepted, queued and preparing](../../20-features/019-streaming-and-response-presentation-states/F019-01-turn-accepted-queued-and-preparing.md)
- Competitor trace: CAP-streaming-and-response-states-14, CAP-recovery-and-errors-17

## S19.03

**Preparing context.** Before the model answers, the surface shows it is preparing (reading context/attachments/memory).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F019-01 Turn accepted, queued and preparing](../../20-features/019-streaming-and-response-presentation-states/F019-01-turn-accepted-queued-and-preparing.md)
- Competitor trace: CAP-streaming-and-response-states-01, CAP-context-management-09

## S19.04

**Searching sources.** While the assistant searches sources, the surface shows a searching state (ideally with the query).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F019-02 Live progress: search, code, connected services, media and files](../../20-features/019-streaming-and-response-presentation-states/F019-02-live-progress-search-code-connected-services-media.md)
- Competitor trace: CAP-streaming-and-response-states-16

## S19.05

**Running code.** While code runs, the surface shows a running-code state for that step.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F019-02 Live progress: search, code, connected services, media and files](../../20-features/019-streaming-and-response-presentation-states/F019-02-live-progress-search-code-connected-services-media.md)
- Competitor trace: CAP-streaming-and-response-states-16

## S19.06

**Calling a connected service.** While a connected service (connector/MCP tool) is called, the surface names the service and shows the call in progress.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F019-02 Live progress: search, code, connected services, media and files](../../20-features/019-streaming-and-response-presentation-states/F019-02-live-progress-search-code-connected-services-media.md)
- Competitor trace: CAP-streaming-and-response-states-16

## S19.07

**Waiting for approval.** When a step needs the user's approval, the turn visibly pauses in a waiting-for-approval state with approve/deny controls.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F019-03 Pauses that need you: approval, input and device](../../20-features/019-streaming-and-response-presentation-states/F019-03-pauses-that-need-you-approval-input-and-device.md)
- Competitor trace: CAP-streaming-and-response-states-17

## S19.08

**Waiting for user input.** When the assistant needs information from the user mid-task, it shows a waiting-for-input state with a way to answer.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome done
- Feature: [F019-03 Pauses that need you: approval, input and device](../../20-features/019-streaming-and-response-presentation-states/F019-03-pauses-that-need-you-approval-input-and-device.md)
- Competitor trace: CAP-streaming-and-response-states-17

## S19.09

**Receiving first output.** The moment the first output arrives, the waiting indicator gives way to the answer.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F019-04 Streaming the answer](../../20-features/019-streaming-and-response-presentation-states/F019-04-streaming-the-answer.md)
- Competitor trace: CAP-streaming-and-response-states-01

## S19.10

**Streaming text.** Text appears progressively while the model streams.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F019-04 Streaming the answer](../../20-features/019-streaming-and-response-presentation-states/F019-04-streaming-the-answer.md)
- Competitor trace: CAP-streaming-and-response-states-03

## S19.11

**Streaming structured output.** Structured output (markdown lists, tables, code blocks) renders correctly while it is still streaming.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F019-04 Streaming the answer](../../20-features/019-streaming-and-response-presentation-states/F019-04-streaming-the-answer.md)
- Competitor trace: CAP-streaming-and-response-states-03

## S19.12

**Building an artifact.** While an artifact/file is being produced, the surface shows it is being built.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, Chrome missing
- Feature: [F019-02 Live progress: search, code, connected services, media and files](../../20-features/019-streaming-and-response-presentation-states/F019-02-live-progress-search-code-connected-services-media.md)
- Competitor trace: CAP-streaming-and-response-states-16

## S19.13

**Generating media.** While an image/video is generated, the surface shows generation progress.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome missing
- Feature: [F019-02 Live progress: search, code, connected services, media and files](../../20-features/019-streaming-and-response-presentation-states/F019-02-live-progress-search-code-connected-services-media.md)
- Competitor trace: CAP-streaming-and-response-states-16

## S19.14

**Saving results.** After output completes, the surface shows results being saved/synced and when they are saved.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI missing, VS Code missing, Chrome done
- Feature: [F019-08 Saving and restoring results](../../20-features/019-streaming-and-response-presentation-states/F019-08-saving-and-restoring-results.md)

## S19.15

**Completed.** A finished turn is clearly shown as completed (indicator stops; completion is announced/labelled).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F019-05 How a turn ends: completed, partly done, stopped](../../20-features/019-streaming-and-response-presentation-states/F019-05-how-a-turn-ends-completed-partly-done-stopped.md)
- Competitor trace: CAP-streaming-and-response-states-25

## S19.16

**Partially completed.** A run that finished with some steps failed is shown as partially completed, distinct from success and failure.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F019-05 How a turn ends: completed, partly done, stopped](../../20-features/019-streaming-and-response-presentation-states/F019-05-how-a-turn-ends-completed-partly-done-stopped.md)
- Competitor trace: CAP-streaming-and-response-states-25

## S19.17

**Cancel requested.** After the user presses stop, the surface shows the stop is in progress until it takes effect.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F019-05 How a turn ends: completed, partly done, stopped](../../20-features/019-streaming-and-response-presentation-states/F019-05-how-a-turn-ends-completed-partly-done-stopped.md)
- Competitor trace: CAP-editing-regeneration-and-branching-11, CAP-streaming-and-response-states-09, CAP-recovery-and-errors-04

## S19.18

**Cancelled.** A stopped turn ends in a clear cancelled/stopped state that keeps what arrived.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F019-05 How a turn ends: completed, partly done, stopped](../../20-features/019-streaming-and-response-presentation-states/F019-05-how-a-turn-ends-completed-partly-done-stopped.md)
- Competitor trace: CAP-editing-regeneration-and-branching-11, CAP-editing-regeneration-and-branching-12, CAP-streaming-and-response-states-11, CAP-recovery-and-errors-04

## S19.19

**Reconnecting.** When the connection drops mid-turn, the surface shows it is reconnecting and resumes when possible.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome done
- Feature: [F019-07 Reconnect, resume and background work](../../20-features/019-streaming-and-response-presentation-states/F019-07-reconnect-resume-and-background-work.md)
- Competitor trace: CAP-streaming-and-response-states-23, CAP-recovery-and-errors-06

## S19.20

**Resuming existing work.** Work that was already running is picked up again (after reconnect/reopen) and shown as resuming rather than restarting.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F019-07 Reconnect, resume and background work](../../20-features/019-streaming-and-response-presentation-states/F019-07-reconnect-resume-and-background-work.md)
- Competitor trace: CAP-streaming-and-response-states-23, CAP-recovery-and-errors-06, CAP-recovery-and-errors-07

## S19.21

**Rate-limited.** A rate-limited turn says so, with when to retry if known.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F019-06 Failure notices with a next step](../../20-features/019-streaming-and-response-presentation-states/F019-06-failure-notices-with-a-next-step.md)
- Competitor trace: CAP-streaming-and-response-states-18, CAP-streaming-and-response-states-19, CAP-recovery-and-errors-10, CAP-recovery-and-errors-11

## S19.22

**Budget exhausted.** A turn blocked by an exhausted budget/plan limit says so and points to the fix (upgrade/usage).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F019-06 Failure notices with a next step](../../20-features/019-streaming-and-response-presentation-states/F019-06-failure-notices-with-a-next-step.md)
- Competitor trace: CAP-streaming-and-response-states-18, CAP-streaming-and-response-states-19, CAP-recovery-and-errors-10, CAP-recovery-and-errors-11

## S19.23

**Authentication expired.** A turn that fails because sign-in expired says so and offers to sign in again.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F019-06 Failure notices with a next step](../../20-features/019-streaming-and-response-presentation-states/F019-06-failure-notices-with-a-next-step.md)
- Competitor trace: CAP-streaming-and-response-states-18, CAP-recovery-and-errors-10

## S19.24

**Required device unavailable.** When a step needs a device that is offline (e.g. the user's desktop or local runtime), the turn shows it is waiting for / cannot reach that device.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code done, Chrome done
- Feature: [F019-03 Pauses that need you: approval, input and device](../../20-features/019-streaming-and-response-presentation-states/F019-03-pauses-that-need-you-approval-input-and-device.md)
- Competitor trace: CAP-streaming-and-response-states-18, CAP-recovery-and-errors-10, CAP-recovery-and-errors-25

## S19.25

**Provider unavailable.** When the model provider is down/unavailable, the turn says so and offers retry or another model.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F019-06 Failure notices with a next step](../../20-features/019-streaming-and-response-presentation-states/F019-06-failure-notices-with-a-next-step.md)
- Competitor trace: CAP-streaming-and-response-states-18, CAP-recovery-and-errors-01, CAP-recovery-and-errors-10, CAP-recovery-and-errors-15

## S19.26

**Failed with recoverable input.** A turn that fails because of the user's input (too long, bad attachment) explains what to change so the user can fix and resend.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F019-06 Failure notices with a next step](../../20-features/019-streaming-and-response-presentation-states/F019-06-failure-notices-with-a-next-step.md)
- Competitor trace: CAP-streaming-and-response-states-18, CAP-streaming-and-response-states-20, CAP-recovery-and-errors-01, CAP-recovery-and-errors-10, CAP-recovery-and-errors-16

## S19.27

**Failed after useful partial output.** A turn that fails after producing useful output keeps that output and marks the failure.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F019-06 Failure notices with a next step](../../20-features/019-streaming-and-response-presentation-states/F019-06-failure-notices-with-a-next-step.md)
- Competitor trace: CAP-streaming-and-response-states-18, CAP-streaming-and-response-states-25, CAP-recovery-and-errors-01

## S19.28

**Session restored after app restart.** After the app restarts, the conversation and each turn's final state (done/failed/stopped) come back as they were.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F019-08 Saving and restoring results](../../20-features/019-streaming-and-response-presentation-states/F019-08-saving-and-restoring-results.md)
- Competitor trace: CAP-streaming-and-response-states-11, CAP-recovery-and-errors-07, CAP-recovery-and-errors-21

## S19.29

**Background work continuing after UI closure.** Work keeps running after the UI is closed and its result is there (or resumes) when the user returns.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile unverified, CLI done, VS Code unverified, Chrome done
- Feature: [F019-07 Reconnect, resume and background work](../../20-features/019-streaming-and-response-presentation-states/F019-07-reconnect-resume-and-background-work.md)
- Competitor trace: CAP-streaming-and-response-states-23, CAP-recovery-and-errors-25
