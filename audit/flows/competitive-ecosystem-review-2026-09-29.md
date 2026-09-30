# Current ecosystem review, 2026-09-29

Status: In progress. Owner: Founder + product/platform reviewers.

**The entire codebase has not been read.** This pass records semantic reading
of 194 distinct file versions,
including 62 complete-file reads; the rest are selected scopes.
These counts include tests and audit instruments and cannot be divided by the
production inventory to claim product coverage. Earlier exploratory valuation
reading is not retroactively counted. Earlier cost/sale estimates remain
preliminary; this is not a certified valuation or release sign-off.

The source baseline is `work/billing-e2e` at `49d0c30f38ca53570dd4eade84548c9cf43705ae`, with current
satellite and uncommitted variants kept separate. Main `615a7858bd46f5772a3db1c3c7e333441acd3dae` is not the source baseline.
The inventory refreshed 41 registered worktrees, 93 local branches and
16 cached remote refs. Its primary manifest contains 8,798 versions across
8,723 paths: 8,716 integration files, 38 current satellite variants,
35 uncommitted production variants and nine cached dependency proposals.
Another 103 historical alternatives are quarantined; old deleted layouts are
not counted as current missing functionality. No branch merge or source fix
was performed.

The checklist starts from 3,439 criteria in the current integration ledger and
adds 16 dated ecosystem criteria. It excludes personal finance and Health
specialist flows and the ChatGPT custom GPT product. Common persistent
assistant/agent controls remain in scope. Existing criteria are an inventory,
not a requirement to ship every optional product. Prior `done` labels are
preserved as historical inputs, never accepted as current implementation proof.

The current review found reproducible recovery/stop/transcript failures in
Web, two asynchronous pairing failures in Mobile, a CLI restore escape,
source-confirmed developer handoff/cancellation/resource issues and defects in
audit evidence checks. These issues need resolution before claiming the
affected journeys complete. They do not establish that every other journey
works, nor that an observed source defect is deployed.

| Severity | Current issue | Source and verification limits |
| --- | --- | --- |
| Medium | Recovered-run polling stops after the first running verdict | [evidence](../live-check/2026-09-29-ecosystem-review/web-cloud-review.json) |
| Medium | Stop on a recovered cloud turn never requests server cancellation | [evidence](../live-check/2026-09-29-ecosystem-review/web-cloud-review.json) |
| Medium | Reopening a cached chat discards newer persisted messages | [evidence](../live-check/2026-09-29-ecosystem-review/web-cloud-review.json) |
| Medium | Managed-compute enforcement test accepts denials from different gates | [evidence](../live-check/2026-09-29-ecosystem-review/web-cloud-review.json) |
| High | Checkpoint rewind follows swapped parent symlinks outside the approved workspace | [evidence](../live-check/2026-09-29-ecosystem-review/rust-developer-review.json) |
| Medium | Continue CLI Session accepts the chosen thread but never opens it in VS Code | [evidence](../live-check/2026-09-29-ecosystem-review/rust-developer-review.json) |
| Medium | Interrupt releases turn ownership before cleanup finishes | [evidence](../live-check/2026-09-29-ecosystem-review/rust-developer-review.json) |
| Medium | Modern MCP read cache retains unlimited responses and expired distinct keys | [evidence](../live-check/2026-09-29-ecosystem-review/rust-developer-review.json) |
| Medium | Background command pool caps finished history but leaves running commands unbounded | [evidence](../live-check/2026-09-29-ecosystem-review/rust-developer-review.json) |
| Medium | Crash recovery loses terminal turn status | [evidence](../live-check/2026-09-29-ecosystem-review/rust-developer-review.json) |
| Medium | Capability worklist can be green with missing or impossible completion evidence | [evidence](../live-check/2026-09-29-ecosystem-review/inventory-instrument-review.json) |
| Medium | Older reachability inventory accepts fabricated implementation evidence | [evidence](../live-check/2026-09-29-ecosystem-review/inventory-instrument-review.json) |
| Medium | Declined connector capability is counted as implemented | [evidence](../live-check/2026-09-29-ecosystem-review/inventory-instrument-review.json) |
| Medium | Per-file ledger regeneration loses review evidence and does not bind dirty source | [evidence](../live-check/2026-09-29-ecosystem-review/inventory-instrument-review.json) |
| Medium | Concurrent copies of one signed companion frame both pass nonce replay checks | [evidence](../live-check/2026-09-29-ecosystem-review/mobile-control-review.json) |
| Medium | A previously received companion frame mutates state after disconnect | [evidence](../live-check/2026-09-29-ecosystem-review/mobile-control-review.json) |
| Medium | Policy-refused schedules reported as completed | [evidence](../live-check/2026-09-29-ecosystem-review/continuous-assistant-review.json) |
| Medium | Handshake/protocol rejection discards the registry handle without stopping the subprocess | [evidence](../live-check/2026-09-29-ecosystem-review/electron-protocol-review.json) |
| Medium | Notifications from a closed runtime remain eligible to mutate the current session | [evidence](../live-check/2026-09-29-ecosystem-review/electron-protocol-review.json) |
| Medium | Explicit stop allows a replacement runtime before the prior runtime has exited | [evidence](../live-check/2026-09-29-ecosystem-review/electron-protocol-review.json) |
| Medium | Trusted side-panel WebMCP calls bypass target-site automation authorization | [evidence](../live-check/2026-09-29-ecosystem-review/chrome-review.json) |
| Medium | Stop reports cancellation success after the cloud cancellation API refuses it | [evidence](../live-check/2026-09-29-ecosystem-review/chrome-review.json) |
| Medium | Approved WebMCP form checkbox arguments are submitted with the wrong state | [evidence](../live-check/2026-09-29-ecosystem-review/chrome-review.json) |
| Medium | A new login session for the same account hides retained Chrome history | [evidence](../live-check/2026-09-29-ecosystem-review/chrome-review.json) |

The web reproduction ran three real-hook/store cases; all three expected
behavior assertions failed. That is defect evidence, not a green test suite.
Identity/fetch and repository test infrastructure were mocked; no live
database/provider/workflow ran. The mobile harness uses actual source modules
and cryptographic positive/negative controls with native adapters stubbed.
The CLI symlink probe exercises the exact guard and restore filesystem
primitives in disposable directories; full CLI/app-server execution remains
unverified. Instrument fixtures demonstrate that invalid evidence can still
yield a successful check.

`AGI-34` is reused for the remaining recovery defect; the original first-stalled
test does not cover a first-running verdict followed by completion. The existing
`CLI-THREAD-STATUS-NOT-PERSISTED-01` remains one identity. Blanket connector
channel refusal is a source-confirmed policy question in the Web lane and is
not registered as a permission bypass.

The continuous-assistant lane traced real server-side schedules, connector
events, approvals, task inbox/notifications and durable cloud workflows.
Eight focused files / 96 tests passed with mocked infrastructure; an isolated
unchanged-finalizer reproduction also proves policy-refused schedules become
successful runs and completed notices. Source paths do not certify deployed
cron, workflow survival, production migrations or push delivery.

Scheduled/event work uses roughly 40–45-second bounded attempts, while
interactive AGI Work has continuing durable execution. The reviewed owners
provide account/project memory and conversation/code-session sandboxes;
independent persistent bot memory and an account-wide shared cloud GUI computer
were not established. These are scoped findings, not an exhaustive assertion
that no other implementation exists. [Workflow evidence and limits](../live-check/2026-09-29-ecosystem-review/continuous-assistant-review.json).
Public Electron, retained internal Tauri, CLI local/BYOK/managed domains and
browser/cloud surfaces are distinct. Code inside Tauri cannot establish a
shipping Electron feature. Unique `fix/web-small` assets and pending native
fixes are recorded in lane evidence rather than reported as absent work.

Chrome probes reproduce false cancellation success, hidden retained history
after a new session for the same account, and the existing `C-01`/`C-07`
origin/form defects. Those two IDs retain the newer integration's open-work
owner rather than creating new defect identities. Existing targeted tests
passed 83/83; five audit expectations failed as expected. The panel-close test
proves an explicit durable-run cancellation request, but its expected policy
remains an open contract question, not a missing-resume implementation claim.
No real website form, cloud provider or browser account was modified.

## Evidence and checklist

- [Fresh review metadata](../ledger/competitive-review-2026-09-29.meta.json)
- [Source snapshot and worktree metadata](../ledger/source-snapshot-2026-09-29.meta.json)
- [Current manifest, compressed JSONL](../ledger/2026-09-29-source-manifest.jsonl.gz)
- [Historical alternatives, separate](../ledger/2026-09-29-source-manifest-historical-alternatives.jsonl.gz)
- [Exclusion reasons](../ledger/2026-09-29-source-manifest-exclusions.jsonl.gz)
- [Actual semantic reading scopes](../ledger/semantic-review-coverage-2026-09-29.jsonl)
- [Full criterion checklist and review status](../ledger/competitive-review-checklist-2026-09-29.jsonl)
- [Dated primary competitor evidence](../../docs/research/competitor-ecosystem-delta-2026-09-29.json)
- [Canonical open flaw identities](../registers/known-flaws.md)
- [Root causes and acceptance](../prior-audits/active-issues-register.md)

## Remaining review

Most source variants and checklist cells remain unreviewed. The scoped Chrome
and Electron lanes are now saved. Public Electron lifecycle source findings: failed connection disposal, stale callbacks and replacement
ordering have open source findings. Actual subprocess and UI timing remain
unverified. Next, incorporate their completed evidence, independently verify
decisive paths, and trace shared rendering, models/routing, search/files,
artifacts/media, settings/account/enterprise and package contracts through
their mounted clients, authorization, storage and failure states. Each
workflow needs success, error, cancellation, permission and reload/reconnect
coverage; source presence alone never closes it.

Production migrations, providers, releases, installed native clients, store
publication and running cross-device journeys were not verified here.
Ignored generated/dependency/build trees, secrets and abandoned reflog-only
states are outside the current manifest; it is not a backup or licensing audit.
Concurrent work was not frozen, so each finding binds to content hashes and
its captured source snapshot. Keep the goal active until the requested
coverage and acceptance evidence are complete.
