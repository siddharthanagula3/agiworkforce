---
id: "REQ-AREA-059"
type: "requirements"
title: "Requirement items: Approvals and human-in-the-loop UI"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 59. Approvals and human-in-the-loop UI

31 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S59.01

**One-action approval.** When a single tool call needs approval, the user can approve or deny that one call and the run continues accordingly.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F059-01 Approve or deny one action](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-01-approve-or-deny-one-action.md)
- Competitor trace: CAP-approvals-and-permissions-01

## S59.02

**Batch approval.** The user can approve or deny several pending tool calls of a run in one action.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Feature: [F059-02 Approve several calls at once](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-02-approve-several-calls-at-once.md)
- Competitor trace: CAP-approvals-and-permissions-20

## S59.03

**Per-session approval.** The user can allow a tool for the rest of the current session so it stops asking until the session ends.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F059-03 Remember a decision, review saved rules, and see history](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md)
- Competitor trace: CAP-approvals-and-permissions-02

## S59.04

**Per-application permission.** The user can set allow/ask/deny per connected app (and per tool within it), and the runtime enforces it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F059-03 Remember a decision, review saved rules, and see history](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md)
- Competitor trace: CAP-approvals-and-permissions-08, CAP-approvals-and-permissions-09, CAP-approvals-and-permissions-29

## S59.05

**Per-folder permission.** The agent can touch only folders the user granted, and the user grants or revokes each folder.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done, CLI done, VS Code done
- Feature: [F059-04 Folder and website limits](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-04-folder-and-website-limits.md)
- Competitor trace: CAP-approvals-and-permissions-17

## S59.06

**Per-domain permission.** The user can allow or block specific websites/domains the agent may act on or fetch, and it is enforced.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop partial, Mobile missing, CLI done, VS Code done, Chrome done
- Feature: [F059-04 Folder and website limits](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-04-folder-and-website-limits.md)
- Competitor trace: CAP-approvals-and-permissions-13

## S59.07

**Persistent permission settings.** Permission choices (policy and per-tool rules) persist across sessions and devices until changed.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web UI_ONLY
- Feature: [F059-03 Remember a decision, review saved rules, and see history](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md)
- Competitor trace: CAP-approvals-and-permissions-02, CAP-approvals-and-permissions-08

## S59.08

**Permission-mode selector.** The user can pick a permission mode (ask every time / auto for low risk / skip approvals) that governs how every tool runs.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web UI_ONLY
- Feature: [F059-05 Permission modes](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md)
- Competitor trace: CAP-approvals-and-permissions-03, CAP-approvals-and-permissions-06, CAP-approvals-and-permissions-14

## S59.09

**Read-only mode.** The user can switch the agent into a read-only mode in which write, send and execute tools are refused.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web UI_ONLY
- Feature: [F059-05 Permission modes](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md)
- Competitor trace: CAP-approvals-and-permissions-04, CAP-approvals-and-permissions-09

## S59.10

**Ask-before-writing mode.** A mode lets reads run automatically but stops and asks before any write, send or execute action.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web UI_ONLY
- Feature: [F059-05 Permission modes](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md)
- Competitor trace: CAP-approvals-and-permissions-03, CAP-approvals-and-permissions-04

## S59.11

**Automatic low-risk approval mode.** A mode auto-approves low-risk actions (reads, searches) while riskier actions still ask.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web UI_ONLY
- Feature: [F059-05 Permission modes](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md)
- Competitor trace: CAP-approvals-and-permissions-03, CAP-approvals-and-permissions-04

## S59.12

**Approval summary.** An approval request shows a plain summary of what the tool will do and why it needs approval.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F059-06 What the approval shows, and stronger checks for risky actions](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md)
- Competitor trace: CAP-approvals-and-permissions-10

## S59.13

**Exact recipients.** Before a send is approved, the approval names exactly who will receive it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F059-06 What the approval shows, and stronger checks for risky actions](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md)
- Competitor trace: CAP-approvals-and-permissions-10

## S59.14

**Exact destination.** Before an outbound action is approved, the approval shows the exact destination (URL, host or target).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F059-06 What the approval shows, and stronger checks for risky actions](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md)
- Competitor trace: CAP-approvals-and-permissions-10

## S59.15

**Exact amount or purchase.** Before a payment or purchase is approved, the approval shows the exact amount and what is bought.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F059-06 What the approval shows, and stronger checks for risky actions](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md)
- Competitor trace: CAP-approvals-and-permissions-10, CAP-approvals-and-permissions-11

## S59.16

**Exact command.** Before a command runs, the approval shows the exact command line (and where it will run).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F059-06 What the approval shows, and stronger checks for risky actions](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md)
- Competitor trace: CAP-approvals-and-permissions-10

## S59.17

**Exact files or records affected.** Before a write, the approval shows exactly which files or records will change.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F059-06 What the approval shows, and stronger checks for risky actions](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md)
- Competitor trace: CAP-approvals-and-permissions-10

## S59.18

**Proposed-diff preview.** Before a file edit is approved, the user sees the proposed diff.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F059-06 What the approval shows, and stronger checks for risky actions](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md)
- Competitor trace: CAP-approvals-and-permissions-10

## S59.19

**Allow action.** The user can allow a pending action and it then runs.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F059-01 Approve or deny one action](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-01-approve-or-deny-one-action.md)
- Competitor trace: CAP-approvals-and-permissions-01

## S59.20

**Deny action.** The user can deny a pending action; it does not run and the model is told it was denied.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F059-01 Approve or deny one action](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-01-approve-or-deny-one-action.md)
- Competitor trace: CAP-approvals-and-permissions-01

## S59.21

**Edit proposed action.** Before approving, the user can edit the proposed action (e.g. change the command, recipient or text) and run the edited version.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F059-07 Edit or redirect a pending action](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-07-edit-or-redirect-a-pending-action.md)
- Competitor trace: CAP-approvals-and-permissions-23

## S59.22

**Ask for an alternative.** Instead of just denying, the user can tell the agent what to do instead, and the agent continues with that guidance.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F059-07 Edit or redirect a pending action](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-07-edit-or-redirect-a-pending-action.md)
- Competitor trace: CAP-approvals-and-permissions-22

## S59.23

**Approval expiration.** A pending approval expires after a set time, the UI shows it expired, and the action cannot run from it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F059-08 Approval timing and resuming a run](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-08-approval-timing-and-resuming-a-run.md)
- Competitor trace: CAP-approvals-and-permissions-19, CAP-approvals-and-permissions-21

## S59.24

**Approval history.** The user can review a history of past approval requests and their decisions.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F059-03 Remember a decision, review saved rules, and see history](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md)
- Competitor trace: CAP-approvals-and-permissions-21

## S59.25

**Revoke saved permission.** The user can revoke a saved "always allow" (or folder/site grant) so the action asks again.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, Chrome done
- Feature: [F059-03 Remember a decision, review saved rules, and see history](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md)
- Competitor trace: CAP-approvals-and-permissions-02, CAP-approvals-and-permissions-15, CAP-approvals-and-permissions-17

## S59.26

**Approval from another device.** An approval raised on one device can be answered from another signed-in device, and the first device sees the result.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Feature: [F059-09 Approve from another device or from a notification](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-09-approve-from-another-device-or-from-a-notification.md)
- Competitor trace: CAP-approvals-and-permissions-19, CAP-approvals-and-permissions-20

## S59.27

**Approval via notification.** When an approval is needed the user is notified and can approve or deny directly from the notification.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): VS Code done
- Feature: [F059-09 Approve from another device or from a notification](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-09-approve-from-another-device-or-from-a-notification.md)
- Competitor trace: CAP-approvals-and-permissions-20

## S59.28

**Stronger confirmation for sensitive operations.** Sensitive or irreversible actions get a stronger confirmation than routine ones (warning, no permanent allow, re-ask).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F059-06 What the approval shows, and stronger checks for risky actions](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md)
- Competitor trace: CAP-approvals-and-permissions-06, CAP-approvals-and-permissions-10, CAP-approvals-and-permissions-11, CAP-approvals-and-permissions-12

## S59.29

**User takeover.** While the agent controls a screen or browser, the user can take over control and later hand it back.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done, Chrome done
- Feature: [F059-10 Take over the agent's screen or browser](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-10-take-over-the-agent-s-screen-or-browser.md)
- Competitor trace: CAP-approvals-and-permissions-15, CAP-approvals-and-permissions-16

## S59.30

**Resume after user intervention.** After the user intervenes (approves, answers a question, or hands control back), the same run resumes where it stopped.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F059-08 Approval timing and resuming a run](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-08-approval-timing-and-resuming-a-run.md)
- Competitor trace: CAP-approvals-and-permissions-01

## S59.31

**Action receipt and outcome display.** After an approval decision the transcript shows what was decided and what happened (ran, result, or denied).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F059-08 Approval timing and resuming a run](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-08-approval-timing-and-resuming-a-run.md)
- Competitor trace: CAP-approvals-and-permissions-21
