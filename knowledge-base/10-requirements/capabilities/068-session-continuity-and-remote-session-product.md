---
id: "REQ-AREA-068"
type: "requirements"
title: "Requirement items: Session continuity and remote-session product"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 68. Session continuity and remote-session product

30 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S68.01

**Shared session identifier across supported clients.** One session identifier names the same coding session on every supported client.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F068-01 One session on every client](../../20-features/068-session-continuity-and-remote-session-product/F068-01-one-session-on-every-client.md)
- Competitor trace: CAP-synchronization-and-continuity-20

## S68.02

**Same conversation history.** Opening the session on any client shows the same conversation history.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F068-01 One session on every client](../../20-features/068-session-continuity-and-remote-session-product/F068-01-one-session-on-every-client.md)
- Competitor trace: CAP-synchronization-and-continuity-20

## S68.03

**Same active branch.** Every client shows and works on the same active git branch for the session.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F068-01 One session on every client](../../20-features/068-session-continuity-and-remote-session-product/F068-01-one-session-on-every-client.md)
- Competitor trace: CAP-synchronization-and-continuity-20

## S68.04

**Same repository association.** Every client associates the session with the same repository.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F068-01 One session on every client](../../20-features/068-session-continuity-and-remote-session-product/F068-01-one-session-on-every-client.md)
- Competitor trace: CAP-synchronization-and-continuity-20

## S68.05

**Same worktree association.** Every client associates the session with the same git worktree.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code done
- Feature: [F068-01 One session on every client](../../20-features/068-session-continuity-and-remote-session-product/F068-01-one-session-on-every-client.md)
- Competitor trace: CAP-synchronization-and-continuity-19

## S68.06

**Same model and instruction configuration.** Every client runs the session with the same model and the same instruction files.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile done, CLI done, VS Code done
- Feature: [F068-01 One session on every client](../../20-features/068-session-continuity-and-remote-session-product/F068-01-one-session-on-every-client.md)
- Competitor trace: CAP-synchronization-and-continuity-11

## S68.07

**Same task plan and checkpoints.** Every client shows the same task plan and the same checkpoints for the session.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code done
- Feature: [F068-01 One session on every client](../../20-features/068-session-continuity-and-remote-session-product/F068-01-one-session-on-every-client.md)

## S68.08

**Same pending approvals.** An approval pending in the session shows on every attached client and can be answered from any of them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Mobile done, CLI done, VS Code done
- Feature: [F068-03 Answer approvals and drive a session from another client](../../20-features/068-session-continuity-and-remote-session-product/F068-03-answer-approvals-and-drive-a-session-from-another.md)
- Competitor trace: CAP-synchronization-and-continuity-21

## S68.09

**Same tool activity.** Tool activity of a running turn streams to every attached client.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Mobile done, CLI done, VS Code done
- Feature: [F068-02 Live view of a running turn](../../20-features/068-session-continuity-and-remote-session-product/F068-02-live-view-of-a-running-turn.md)
- Competitor trace: CAP-synchronization-and-continuity-21

## S68.10

**Read-only session attachment.** A client can attach to a running session read-only, watching without being able to act.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F068-02 Live view of a running turn](../../20-features/068-session-continuity-and-remote-session-product/F068-02-live-view-of-a-running-turn.md)

## S68.11

**Active-control attachment.** A client attaches to a running session with full control: send turns, stop, approve.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Mobile done
- Feature: [F068-03 Answer approvals and drive a session from another client](../../20-features/068-session-continuity-and-remote-session-product/F068-03-answer-approvals-and-drive-a-session-from-another.md)
- Competitor trace: CAP-synchronization-and-continuity-21

## S68.12

**Execution-owner indicator.** Every client shows which client currently owns execution of the session.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code missing
- Feature: [F068-04 Who owns execution and handing control](../../20-features/068-session-continuity-and-remote-session-product/F068-04-who-owns-execution-and-handing-control.md)

## S68.13

**Transfer control between clients.** The user hands control of a session from one client to another explicitly.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done, VS Code done
- Feature: [F068-04 Who owns execution and handing control](../../20-features/068-session-continuity-and-remote-session-product/F068-04-who-owns-execution-and-handing-control.md)
- Competitor trace: CAP-synchronization-and-continuity-12, CAP-synchronization-and-continuity-19

## S68.14

**Continue local execution from mobile.** From the phone, the user continues a coding session that runs on their local machine.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done, Mobile done, VS Code done
- Feature: [F068-07 Continue local work from the phone and start a task in an allowed folder](../../20-features/068-session-continuity-and-remote-session-product/F068-07-continue-local-work-from-the-phone-and-start-a-tas.md)
- Competitor trace: CAP-synchronization-and-continuity-13

## S68.15

**Continue cloud execution from desktop.** From the desktop app, the user continues a coding session that runs in the cloud.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial
- Feature: [F068-06 Bring cloud results back and continue cloud work from desktop](../../20-features/068-session-continuity-and-remote-session-product/F068-06-bring-cloud-results-back-and-continue-cloud-work-f.md)
- Competitor trace: CAP-synchronization-and-continuity-11, CAP-synchronization-and-continuity-12

## S68.16

**Move work to cloud through an explicit handoff.** The user explicitly hands a local session over to cloud execution, seeing what moves.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code partial
- Feature: [F068-05 Hand a local session to the cloud](../../20-features/068-session-continuity-and-remote-session-product/F068-05-hand-a-local-session-to-the-cloud.md)
- Competitor trace: CAP-synchronization-and-continuity-12, CAP-synchronization-and-continuity-18

## S68.17

**Bring cloud results back to local workspace.** Results of cloud work come back into the user's local workspace.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing, VS Code done
- Feature: [F068-06 Bring cloud results back and continue cloud work from desktop](../../20-features/068-session-continuity-and-remote-session-product/F068-06-bring-cloud-results-back-and-continue-cloud-work-f.md)
- Competitor trace: CAP-synchronization-and-continuity-17

## S68.18

**File/environment transfer review.** Before a transfer, the user reviews which files, context and environment will move.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code done
- Feature: [F068-05 Hand a local session to the cloud](../../20-features/068-session-continuity-and-remote-session-product/F068-05-hand-a-local-session-to-the-cloud.md)
- Competitor trace: CAP-synchronization-and-continuity-18

## S68.19

**Remote-machine discovery.** The user sees which of their machines are available to run sessions.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing
- Feature: [F068-08 Your machines](../../20-features/068-session-continuity-and-remote-session-product/F068-08-your-machines.md)
- Competitor trace: CAP-synchronization-and-continuity-15

## S68.20

**Remote-machine card.** Each remote machine appears as a card with its name, platform and status.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing
- Feature: [F068-08 Your machines](../../20-features/068-session-continuity-and-remote-session-product/F068-08-your-machines.md)
- Competitor trace: CAP-synchronization-and-continuity-15

## S68.21

**Host capabilities.** Each machine advertises what it can host (local models, browser, MCP, computer use, code sessions).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done
- Feature: [F068-08 Your machines](../../20-features/068-session-continuity-and-remote-session-product/F068-08-your-machines.md)
- Competitor trace: CAP-synchronization-and-continuity-15

## S68.22

**Device pairing.** The user pairs a phone or another client with a machine so it can reach that machine's sessions.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile done, CLI missing, VS Code done
- Feature: [F068-09 Pair and revoke a device](../../20-features/068-session-continuity-and-remote-session-product/F068-09-pair-and-revoke-a-device.md)
- Competitor trace: CAP-synchronization-and-continuity-14

## S68.23

**Pairing revocation.** The user revokes a pairing from either side and it stops working at once.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code done
- Feature: [F068-09 Pair and revoke a device](../../20-features/068-session-continuity-and-remote-session-product/F068-09-pair-and-revoke-a-device.md)
- Competitor trace: CAP-synchronization-and-continuity-14

## S68.24

**Start a session in an allowed remote folder.** From another client, the user starts a new session on a remote machine inside a folder that machine allows.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop partial, Mobile missing, CLI missing, VS Code missing
- Feature: [F068-07 Continue local work from the phone and start a task in an allowed folder](../../20-features/068-session-continuity-and-remote-session-product/F068-07-continue-local-work-from-the-phone-and-start-a-tas.md)
- Competitor trace: CAP-synchronization-and-continuity-13

## S68.25

**Device-offline explanation.** When the remote machine is offline, the client says so and explains what that means.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing
- Feature: [F068-08 Your machines](../../20-features/068-session-continuity-and-remote-session-product/F068-08-your-machines.md)
- Competitor trace: CAP-synchronization-and-continuity-15

## S68.26

**Resume after reconnect.** After a dropped connection, the client reconnects and resumes the same session state.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F068-02 Live view of a running turn](../../20-features/068-session-continuity-and-remote-session-product/F068-02-live-view-of-a-running-turn.md)
- Competitor trace: CAP-synchronization-and-continuity-22

## S68.27

**Session export.** The user exports a coding session (transcript and context) to a file from any client.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code missing
- Feature: [F068-11 Export a session](../../20-features/068-session-continuity-and-remote-session-product/F068-11-export-a-session.md)

## S68.28

**Summary-only transfer as a separate option.** When moving a session, the user may choose to carry only a summary instead of the full transcript.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F068-05 Hand a local session to the cloud](../../20-features/068-session-continuity-and-remote-session-product/F068-05-hand-a-local-session-to-the-cloud.md)

## S68.29

**Transcript branch as a separate option.** When moving a session, the user may instead branch the transcript into a new session.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F068-05 Hand a local session to the cloud](../../20-features/068-session-continuity-and-remote-session-product/F068-05-hand-a-local-session-to-the-cloud.md)

## S68.30

**Cross-client activity notifications.** Activity in a session (approval needed, turn done, failure) notifies the user on their other clients.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done, Mobile done, CLI missing, VS Code done
- Feature: [F068-10 Activity alerts on other clients](../../20-features/068-session-continuity-and-remote-session-product/F068-10-activity-alerts-on-other-clients.md)
- Competitor trace: CAP-synchronization-and-continuity-21
