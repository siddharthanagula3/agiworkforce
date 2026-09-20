# Active issues and execution plan

Status: Current
Owner: Founder + platform lead
Last updated: 2026-09-19

The single human-readable register of unresolved defects, risks and required
corrections, with the execution plan to clear them. Start here before opening
any older audit.

## WEB-MARKDOWN-TABLE-ALIGN-2026-09-19

Browser TB02 copied valid Markdown with a right-aligned numeric column, but the rendered
numbers were left-aligned. `MarkdownTableCell` accepts only children; the header renderer
also accepts only children and forces text-left. Alignment metadata is lost in this shared
renderer. Preserve supported alignment props for headers and cells without changing escaping
or citation handling. Verify left/center/right alignment, numeric values and local overflow
with a focused renderer regression and the affected browser case.
Evidence: `docs/specs/website-launch/evidence/qwen-free-quota.json#qaPackBrowserBatch`.
No repair attempted in this QA batch.

## WEB-INERT-CODE-ARTIFACT-2026-09-19

Browser SA01 requested an inert fenced HTML example, never a preview. The model returned
the requested fence, but the app extracted an HTML artifact and opened a blank preview instead
of preserving the visible code block. Source view retained the code. A script-disabled warning
appeared and no alert was observed; this is a presentation defect, not proof of a sandbox escape.
The candidate ownership path is MessageBubble code-block extraction/artifact promotion; exact
opt-in gating remains to be traced. Keep instructional code examples as source while retaining
explicitly requested artifact previews. Test both paths without weakening iframe restrictions.
Evidence: `docs/specs/website-launch/evidence/qwen-free-quota.json#qaPackBrowserBatch`.
No repair attempted in this QA batch.

## WEB-FREE-MEDIA-LIBRARY-2026-09-19

Browser IG04 produced a real1024×1024 HELLO QA poster and reload retained it. Library > Images
then settled to Your library is empty. The Free completion path emits a provider image URL in
Markdown and records the probe result; that is not equivalent to registering an owned Library
asset. Trace the canonical generated-media ingestion/indexing owner and connect this experimental
route without copying ownership logic or exposing private provider links across accounts.
Acceptance: the same authorized image appears in chat and Library, remains accessible after
reload and respects the existing asset/privacy boundaries. Do not regenerate images to repair
an indexing issue.
Evidence: `docs/specs/website-launch/evidence/qwen-free-quota.json#qaPackBrowserBatch`.
No repair attempted in this QA batch.

## WEB-FREE-PROVENANCE-RELOAD-2026-09-19

Free quota assistant replies display “via free pool” during the live browser session,
but that suffix disappears after a full reload. The model name and composer FREE badge
persist. Confirmed on three synthetic replies; no evidence of paid routing or lost message
content. Root cause is not yet traced. Compare streamed message metadata with persisted
message serialization and rendering; preserve the canonical route provenance on rehydrate.
Acceptance: the same source label before and after reload without inventing provenance for
older messages. Evidence: `docs/specs/website-launch/evidence/qwen-free-quota.json#browserCapabilityExperiments`.

## WEB-CHAT-ANGLE-TEXT-2026-09-19

A user message containing `FINAL=<number>` renders as `FINAL=`. Opening Edit message
shows the full original placeholder; Cancel returns to the truncated rendering. This
confirms display loss, not storage loss. Root cause remains untraced. Investigate user-message
Markdown/HTML handling; preserve literal text without enabling unsafe HTML. Acceptance:
angle-bracket placeholders remain visible and editable, with hostile HTML still inert.
Evidence: `docs/specs/website-launch/evidence/qwen-free-quota.json#browserCapabilityExperiments`.

## WEB-MERMAID-ERROR-DOM-LEAK-2026-09-19

An invalid Mermaid fixture receives the intended source-preserving fallback, but
Mermaid also leaves body-level error-render containers outside the chat tree.
Two remained after navigating to an empty New Chat and exposed “Syntax error in
text” and the library version in the accessibility tree, without `aria-hidden`.
This is stale diagnostic/accessibility noise, not evidence of a private-data leak.
`MermaidDiagram.tsx` calls `mermaid.render` without a scoped container and its cleanup
only sets the cancellation flag. Review supported error-render suppression and
owned-container cleanup, preserving the visible source fallback. Verify invalid
render, rerender and navigation leave no orphan nodes. Evidence:
`docs/work/checklist-reaudit/current-evidence/browser-render.json`. No repair attempted.

## QA-ERASURE-HARNESS-BOUNDARY-2026-09-19

`pnpm check:boundaries` fails because the pre-existing untracked
`apps/web/lib/server/__tests__/scheduled-account-erasure.live.test.ts` imports
`pg` directly outside `@agiworkforce/data-layer`. The test provided useful local
execution evidence, but it does not meet the repository's adapter ownership rule.
Adapt the harness through the canonical entrypoint and rerun the boundary check
in the repair phase. Do not weaken the guard or treat this as a production data
leak. Evidence: `docs/work/checklist-reaudit/current-evidence/boundaries.json`.

## WEB-DRAFT-CLEAR-RESTORE-2026-09-19

In local Browser, type an unsent new-chat draft, reload, wait for restoration,
then select all and delete. The draft immediately returns with “Couldn't send.
Restored here so you can try again.” No send was attempted. This was reproduced
twice; a second clear empties the input. The mount/restoration path and deferred
handback effect in `ChatComposerNew.tsx` are the investigation boundary, not a
proven root cause. Distinguish navigation/reload parking from a failed-send
handback, then verify deliberate clearing stays empty without a false failure
notice. Evidence: `docs/work/checklist-reaudit/current-evidence/browser-composer.json`.
No application repair was made in this QA pass.

## WEB-DRAFT-NAVIGATION-LOSS-2026-09-19

Local Browser QA reproduced unsent new-chat draft loss twice: type into the
composer at `/`, open Projects, then use Browser Back. The route returns but the
composer is empty. The second reproduction used normal typing to rule out a
programmatic-value-only artifact. No message was submitted. This is a current
Next development-session failure, not a claim about every browser or production.

Evidence: `docs/work/checklist-reaudit/current-evidence/browser-draft-search.json`.
The composer lifecycle and the one-use history restoration gate in
`apps/web/features/chat/lib/pending-composer-draft.ts` are investigation pointers;
a root cause has not been established. In the repair phase, trace mount/cleanup
and history restoration, add a component-level regression for the demonstrated
path, then verify Back and Forward preserve the draft without leaking it into a
new conversation. No application repair was made in this QA pass.

## RELEASE-MAIN-PROTECTION-2026-09-19

The 2026-09-19 read-only GitHub verification reports `main.protected=false`,
required status-check enforcement `off`, an empty repository/inherited ruleset list,
and no effective branch rules. The legacy protection endpoint returns the explicit
`Branch not protected` response. Running CI on pushes is not equivalent to enforcing
it before merge. This finding does not establish that production deployment bypasses
its separate promotion workflow.

Evidence is retained in `docs/work/checklist-reaudit/current-evidence/github-main.json`,
`github-main-protection.json`, `github-rulesets.json` and `github-main-rules.json`, with
the corresponding hashed response logs. Configure an owner-reviewed main-branch rule
requiring pull requests and the intended successful checks, with bounded and audited
bypass rules; then verify the effective API state and a harmless rejected change.
Configuration was inspected only; no GitHub settings were changed during verification.

**Canonical status.** This file carries the explanation and the plan. Three
machine-readable registers stay authoritative for their own row identity
because code, tests and CI cite their IDs directly:

| Register                            | Holds                                     | Enforced by                  |
| ----------------------------------- | ----------------------------------------- | ---------------------------- |
| `docs/agent-context/known-flaws.md` | one row per open defect, cited by ID      | PR template, `ci.yml`, tests |
| `audit/capability-gaps.csv`         | `CAP-*` product capability backlog        | `check:capability-gaps`      |
| `audit/ui-gaps.csv`                 | `GAP-*` UI parity rows, monotonic ratchet | `check:ui-gaps`              |
| `PRODUCT_GAPS.md`                   | `PG-*` product completeness findings      | `check:doc-registry`         |

Those registers hold rows. This file holds root causes. One root cause here may
retire several rows there. Do not copy long narrative into a register, and do
not open a second active-issues document.

Capability backlog (`CAP-*`) is product scope, not defect work, and is out of
scope for this file.

The website's public-release audit lives in `WEB_PUBLIC_RELEASE_AUDIT.md`
(2026-09-14, founder-requested, one canonical file). It carries the `WEB-*`
findings for the web UI, what the pass fixed, and the order for the rest; this
file points to it rather than restating its rows. Its open P2 items that need a
decision rather than code are the composer rest-height contract (`WEB-052`), an
early byte before the provider's first token (`WEB-053`), and whether the
built-but-dark support widget ships (`WEB-031`).

**A closed issue is deleted, not archived.** Git history is the record of what
was fixed and why; a resolved section left here is a second, staler copy of a
commit message that also makes the open count unreadable. What each removed
issue turned out to be is in the commit that closed it.

## 1. Current repository state

- Audit date 2026-09-08. Scope: repository and test evidence, a live
  authenticated session driven against the dev server on `:3100`, and a browser
  QA pass over the shipped chat, project, settings and marketing surfaces.
  No load run and no production capacity test.
- Reconciles the 2026-09-08 Codex audit, the browser QA pass (consolidated here
  and removed), the local security-scan directories (reconciled and removed,
  one surviving finding carried in as `AGI-22`), `known-flaws.md`,
  `capability-gaps.csv` and `ui-gaps.csv`.
- As of the 2026-09-13 reconciliation: 18 open `AGI-*` root causes (10 P2, 8
  P3) plus the P1 security entry, which is largely mitigated and names what is
  still blocked, and a handful of "Needs live validation" notes that are not
  confirmed defects. `AGI-10` and `AGI-28` closed this pass; see "Closed in
  this pass" below. Several of the rest, including `AGI-3`, `AGI-16`, `AGI-20`,
  `AGI-23`, `AGI-27`, `AGI-30`, `AGI-31` and `AGI-32`, are code-fixed and only
  waiting on a live confirmation their own section names.
- Pass of 2026-09-12, code and tests only, no browser and no deployment. Fixed:
  the two unblocked rows of the P1 security entry (F31, F39), `AGI-23`,
  `AGI-27`, `AGI-28` in the main, `AGI-30`, `AGI-31`, `AGI-32`, and the
  entitlement contradictions that told a plan it had what its gate would refuse.
  Each says what remains and why. Every one of them still wants the live
  confirmation its own section names, and none of those confirmations can be
  made from a checkout: they need a deployment, a real sandbox, a live voice
  session, or a running server. Nothing unblocked remains in the P1 entry.
- Web parity pass 2026-09-10 (live QA against the dev server on `:3100`,
  every fix exercised in the browser before commit): closed and deleted from
  this file rather than archived: settings saves answering 412 on every
  versioned write (933f5b8af), the durable workflow bundle crashing on a pino
  import (496cd42da), signed-in visitors shown the sign-in form (049c0bd3d),
  empty conversations in history (2c681788b), branching failing on row
  security (070ada117, d107dea4d), pinned-model route failover (1cd019d50),
  memory and past-chat recall (a7ba7e903, 013a2f3af), temporary chats saved
  and listed (637411f26, dbacf8196), gateway adapters in the shared server
  path (97e76f63d), the AGI Work approval notice and the premature no-results
  fallback (9e4505417), artifacts stored interrupted with a missing last line
  and code fences read as a request to run code (e2ef2e196), oversized mermaid
  figures (676564cf7, 0461fd9b9), generated images as thumbnails (1c540c875),
  favourites fetched on every composer mount (1652052a2), the durable
  transport never rotating routes (2f042794f, validation `LIVE-7`), deep
  research without search on harnesses lacking native search (c00dc8cb8), and
  the routing conformance fixture that had drifted since 972328011
  (1a3f2b568), and the approval flow that collapsed after the first inline
  decision while labelling the wait as running (cd01fe255). What each was
  is in its commit. New root causes opened below: `AGI-27` to `AGI-33`.
- Production runtime pass 2026-09-10, from Vercel's own data. The billed
  876.6 GB-hours of provisioned memory against a few minutes of active CPU
  were idle functions: the runtime-error clusters show 1,785 "Task timed out
  after 800 seconds" events between 2026-08-11 and 2026-09-10 05:14 UTC on
  the chat completions route and the workflow flow route, roughly 397 hours of
  function time at 1.7 GB, most of the bill. Cause, on the deployment of
  8b2923fa7: the durable workflow bundle died at load (fixed on main in
  496cd42da), the chat function then sat under its own SSE heartbeat with no
  bound after the first durable event, and the reaper marked stranded rows
  terminal without cancelling the workflow run behind them, so six runs
  created 2026-09-08 06:04 to 2026-09-09 05:14 UTC were redelivered every
  15 minutes. The six runs were cancelled through the workflow API at
  15:33 UTC; no run is pending or running in either environment and the
  timeout curve has been flat at zero since 05:15 UTC. The class is closed on
  main by a1c1b6a1e: every durable entry point bounds silence and detaches
  before the function limit, provider deadlines stay armed for the whole
  stream on the streaming, non-streaming and research paths, a Stop reaches
  the provider call inside a durable step, the reaper cancels world runs, and
  the Google adapter bounds only its wait for headers. Exercised on `:3100`:
  "hi" on the free router route answers in 2.1 s over the durable transport
  with one request, Stop settles in under 300 ms, two rapid sends produce one
  request each. Deployed verification is `LIVE-8`, where the first signed-in
  turn on the deployed build stalled the way the six runs had and the cause
  found is recorded. The same pass found no
  other function alive past its budget: crons are batch- and time-bounded,
  only the current deployment receives invocations, and the remaining
  daily 500 is the credit reconciliation cron meeting Stripe subscription ids
  the live account does not know (founder file, Billing entry).
- Reconciliation pass 2026-09-13, ledgers only: every commit on `origin/main`
  since 2026-09-13 00:00 (about 123) plus the unpushed commits this checkout
  carries on top of it (22, tip `24c5c9feb`) checked against this file and
  `known-flaws.md`. `origin/main` is green at `9ab4a616b`. The production
  deploy is not blocked on code: it is waiting on a founder approval, and on
  migrations `0183` to `0189` being applied in production first, because the
  deploy job refuses to promote while a draft migration is unapplied. Both are
  tracked as founder-assistance items in `docs/work/founder-assistance.md`
  ("[Database] Apply migrations 0183 to 0189 in production before the next
  deploy", "[QA] Somewhere to exercise this work before it ships"). `AGI-10`
  closed on 2026-09-13 for both artifacts and conversations (0184-0186 are its
  migrations); the citation and research-reload half of `AGI-28` closed the
  same day. `AGI-3`'s remainder was narrowed: code-execution results and
  generated files closed 2026-09-12 in `e3d8bbebe` and had been left in this
  file's remainder list by mistake, corrected in this pass, and a 2026-09-13
  fix (`ad013685f`) bounds oversized turn metadata so a save no longer fails
  validation outright. Fixed the format of four rows (`AGI-20`, `AGI-27`,
  `AGI-30`, `AGI-31`) carrying two contradictory `Status:` lines each from the
  2026-09-12 pass. No row in this file's P1-P3 sections closed outright from a
  2026-09-13 commit beyond what is named above; the rest are unchanged because
  no commit in the range touches their evidence.
- Five are blocked on a decision rather than on code, and each says whose and
  what it costs: `AGI-5` (CI budget), `AGI-11` (default expiry), `AGI-14` (a
  second speech-to-text vendor), `AGI-17` (conform to CommonMark or forgive it),
  `AGI-22` (the disclosure, and whether existing users are grandfathered).

### Closed in this pass

These issues were fixed and verified, and their sections are gone from this
file. Named here only so a reader coming from an older copy knows where they
went, and so nobody re-files them:

| Was      | What it was                                                                                  | Verified by                                                                                                                                                       |
| -------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGI-15` | Local development ran against the shared database                                            | dev server on `:3100` now writes `agiworkforce_dev`                                                                                                               |
| `AGI-1`  | Managed usage leases clamped to one hour, never renewed                                      | `pnpm db:lease-probe` against real Postgres                                                                                                                       |
| `AGI-2`  | Stranded reservations waited up to a day for recovery                                        | cron scope test, `/api/cron/recover-reservations`                                                                                                                 |
| browser  | Non-image chat attachments failed on every route                                             | `apps/web/e2e/chat-document-attachment.spec.ts`                                                                                                                   |
| browser  | Starting a conversation inside a project failed every time                                   | `apps/web/e2e/project-first-conversation.spec.ts`                                                                                                                 |
| browser  | Tool Approvals did not gate web search in either mode                                        | `apps/web/e2e/tool-approval-web-search.spec.ts`                                                                                                                   |
| latent   | Approval checkpoints 500'd on a jsonb parameter                                              | found by the first turn to reach that path                                                                                                                        |
| `AGI-13` | Unimplemented native commands answered with mock success                                     | the guard was unreachable; rule extracted and tested                                                                                                              |
| `AGI-19` | Marketing nav panels stayed open while the page scrolled                                     | `NavGroup.scroll.test.tsx`                                                                                                                                        |
| `AGI-21` | A cancelled settings query logged at error level                                             | `use-settings-queries.abort.test.tsx`                                                                                                                             |
| `AGI-8`  | The US-only preference never reached the web resolver                                        | `request-processor.us-only.test.ts`                                                                                                                               |
| `AGI-18` | Not reproducible: the sidebar row is a correctly labelled expander                           | driven in a browser on `:3100`                                                                                                                                    |
| `AGI-9`  | A forbidden connector could be connected and its credential stored                           | `connector-policy-gate.test.ts`                                                                                                                                   |
| `AGI-24` | Any function tool blocked cross-provider failover for a whole turn                           | `managed-failover.test.ts`, red on the old predicate                                                                                                              |
| `AGI-25` | A turn holding an approval said it had finished with no response                             | live on `:3100`; the line is gone, the row remains                                                                                                                |
| `AGI-6`  | Web voice could not speak until the whole reply was written                                  | live session on `:3100`, audio about a second after the user stops, interruptions native                                                                          |
| `AGI-10` | Artifacts and conversations could only be shared publicly, never with an organization        | `3503cc009`, `6ff12dc2c`, `efff70c8a`; two live runs against the local stack 2026-09-13, both surfaces, share/withdraw/re-check                                   |
| `AGI-28` | Citations were prose with no markers, and a research reload lost sources and kept "thinking" | `55345a421` (citation markers), `0b732672c` (reload rebuilds from the stored report); live on `:3100` 2026-09-13, reloaded run reads 5 sources, 0 thinking blocks |

## 2. P0, critical

None. No verified security breach, privilege escalation, secret exposure, data
corruption, double charge or trust-boundary failure was found. Reservation
settlement is idempotent and concurrency-safe.

## 3. P1, high

### `AGI-SEC-API-2026-09-09` What the api security scan found, and what is left

**Severity:** P1
**Status:** 56 of 57 findings fixed; 1 registered in
`docs/agent-context/known-flaws.md` as `WEB-SEC-SCAN-2026-09-09-F88`. F21, F23,
F35, F38, F91, F93 and F94 closed on 2026-09-13 and their rows were deleted; what
is left is F88. F31 and F39 closed on 2026-09-12: compaction now routes
under the turn's own admission, and a scheduled run declares the project context
it carries. Closing F39 also found that the gate's attachment leg could never
fire, because `buildLlmRequest` moves array content into `multimodal_content`
and the check read `content`.
**Area:** `apps/web/app/api` and the code it reaches

**What the scan was.** A panel-verified read of the 744 files under
`apps/web/app/api`, run 2026-09-09 against commit `e2a9e898b`. The report is in
`CLAUDE-SECURITY-20260909-050816/`. 57 findings survived a three-voter panel: 3
HIGH, 40 MEDIUM, 14 LOW.

**The root causes, not the finding list.** The 57 were six causes and a tail:

1. A caller-supplied header decided which scope a security gate evaluated, while
   the handler acted on a different, server-resolved one. `x-agi-organization-id:
personal` switched off require-MFA, the IP allow list, zero-data-retention,
   the workspace secret-handling mode and the spend cap. Fixed by resolving
   account-level controls from membership and taking the strictest answer across
   every organization the caller belongs to. `check:policy-gate-scope` keeps it
   fixed.
2. Device pairing let the caller choose the pairing identity, so one victim click
   on a crafted `/connect` link minted a 7-day account token for the attacker.
   Fixed by minting the identity server side and removing the flow that took it
   from a URL.
3. Secret redaction round-tripped through an in-band delimiter and fell back to
   the caller's unredacted text when the split did not realign, while reporting
   the turn redacted. Fixed by redacting per span and proving the result.
4. Three secret patterns had two open-ended runs either side of a required
   literal. A megabyte of `eyJ` took 402 seconds in a measured run, from routes
   as cheap as an unauthenticated support handoff.
5. Untrusted external content bypassed the fence helper that already existed,
   including a compaction summary re-injected as a bare system message and
   persisted on the conversation row.
6. Four controls existed on one handler and not on its siblings.

**What is left and why.** One row. F88 is a founder decision, not an
engineering one, and the founder file states the three options and how to verify
whichever is chosen.

**Next step.** None on this scan beyond the founder's F88 decision.

**Closed 2026-09-13, second pass.** F93 and F94 were one problem: `user_memories.id`
was a global primary key the client chose, and the import derived it from an
unkeyed sha256 of the owner's user id, the source slug and the normalised memory
text. Knowing a victim's user id and guessing their wording was therefore enough
to occupy the row they were about to write, which silently dropped their import
and answered whether that id already existed. Migration `0189` makes the key
`(user_id, id)`, so the same id under two accounts is two rows, and moves import
dedupe onto a new `import_key` column unique per `(user_id, source)`, which lets
imported rows take a random uuid and needs no deployment secret. The sync push
and the auto-memory insert now name `(user_id, id)` as their conflict target.
Reproduced against the development database before the migration, where the
victim's insert returned zero rows, and after it, where both rows exist.

**Closed 2026-09-13, third pass.** F91 in full, by promote-on-inspect, the same
shape chat attachments already use. After extraction passes, the register step
copies the inspected object to a sealed key under the project, `.../<projectId>/sealed/<name>`, and the copy
carries the entity tag the inspection read. A source rewritten inside the
presigned url's remaining lifetime therefore fails the precondition, the
registration is refused with the same wording chat attachments use, and the
writable key is deleted either way. The sealed shape has one more path segment
than any presign, upload authorization or upload cleanup can name, so nothing
that can write may ever name what is stored, and `storage_uri` holds the sealed
key, which is what extraction, download, deletion and erasure all read.
Verified against the real bucket, not a fake: a copy pinned to the inspected
entity tag succeeded, the same copy after a rewrite was refused `412
PreconditionFailed`, and a source uploaded through a project's Sources panel
left exactly one object, the sealed one, downloaded its own bytes back, and lost
that object when the source was deleted.

The same probes corrected an assumption this register carried: the bucket does
enforce a declared SHA-256 on a write, refusing a mismatch with `400 BadDigest`.
Bucket-enforced checksums were therefore also available, and would need the
presign to sign a checksum header the client already computes. Promoting the
inspected bytes was still the better answer, because it is what the chat path
does and because it moves what is served out of every key an upload can name,
rather than only constraining what may be written there.

The second pass closed the half of F91 that was reachable from any environment.
`/api/uploads/knowledge-file/put` took its destination from a query parameter,
so a caller who knew a registered object's key could overwrite it with anything
and the row kept describing bytes the platform no longer held. The presign now
mints a signed authorization that binds the owner, the key, the content type,
the byte count and the sha256 of the exact bytes; the route takes the key from
that authorization and refuses a body that hashes to anything else, including a
rewrite of the same length and type. The presign request gained
`checksumSha256`, which every client already computed for registration, and a
request without it is refused with `UPLOAD_PROTOCOL_UPGRADE_REQUIRED` rather
than served an unbound url. The signing key is derived from the object-storage
credential, so no new deployment secret appears.

**Closed 2026-09-13.** F21: removing a member from one workspace revoked every
device credential and API key on that account, because neither revocation had a
workspace to filter on. Migration `0187` adds `organization_id` to
`device_refresh_tokens` (`api_keys` has carried it since `0073` and the query
ignored it), device pairing and rotation bind it, and the provider sessions are
revoked only when the member's recorded active workspace is the one being left.
F23: a team add resolved any email to a `profiles` row over the privileged
connection and inserted the membership, so knowing an address was enough to bind
that account into a tenant and then reach the removal path against it; a direct
add now requires a domain the organization has verified, the same evidence SCIM
provisioning demands, and everything else goes through the invitation the
invitee redeems. F38: installation ownership was proved by reaching any one
repository while the row it wrote granted a full-installation credential;
migration `0188` stores the repository set the linking account itself proved,
and the listing, clone and push all filter to it. F35: the token handed into the
sandbox carried every permission on every repository the installation covers;
it is now minted per operation, narrowed to the one repository and to `contents`
read for a clone, `contents` write for a push, and never cached. Narrowing the
clone token also found that the pull-request path reuses the same credential
server side, which is why that one is scoped to `pull_requests` write instead.

F8 closed 2026-09-12, and it was worse than its one-line summary. The router
decided retry, failover and user-facing copy by re-parsing a free-text message
that contains a user-chosen filename, because the adapter classified the failure
correctly and then dropped the answer at the stream-chunk boundary. So an
attachment named timeout.pdf turned a permanent refusal into a retry loop
against a route that could never serve it, and one named content_filter.pdf
classified as a safety refusal, which never rotates, so the turn ended and the
reader was told a safety system had blocked their own document. The
classification now rides the chunk and is validated before it is trusted.

### `AGI-35` Founder decisions of 2026-09-15: execution queue

**Severity:** P1
**Status:** Open; the decisions are in `docs/decisions/2026-09-15-founder-decisions.md`
and the founder file keeps only the external actions.
**Area:** every client and the gateway

Engineering unlocked by the decisions, in dependency order. Each item closes
by a live check on the running product, not by its tests.

1. Localization (D-03): expose only English and Spanish until a language is
   reviewed; every client follows the account language with English fallback.
2. Auto-memory (D-02): model-assisted extraction on by default on the
   cheapest utility route, exclusions and metering unchanged.
3. Tool approvals (D-01): in the read-only mode, sandboxed code execution,
   web search, page fetch and other non-mutating tools run without asking.
4. CLI sign-in (D-05): remove the ChatGPT-subscription OAuth flow; provider
   logins enter API keys only.
5. Desktop (D-04): `/desktop`, downloads, docs and the release APIs describe
   Electron; Tauri claims and the Tauri Linux AppImage leave the public flows.
6. QA account (D-21): a native-compatible sign-in, a workspace and a paid test
   entitlement for a dedicated QA user; credentials gitignored.
7. Plan-tier gate (D-09): read the surface from a Clerk custom session claim
   (dashboard step with the founder) and stop trusting the header.
8. Migrations (D-23): rehearse 0183 to 0192 on a Neon branch, then apply in
   order before deploying dependent code. (The withdrawn duplicate that an
   earlier queue entry called 0183 was the reconciliation copy renumbered to
   0181; it no longer exists, and the current 0183 and 0184 are real.)
9. Durability (D-22/23): deploy the world transport fix once CI is green on the
   same commit and end the two stranded production runs.
10. Dispatch pairing (D-10), TLS pins (D-11), minimum age (D-12), crash
    reporting (D-14, needs the DSN), India checkout rule (D-18), policy dates
    (D-25), MiniMax off and Groq gating (D-08), DeepSeek and Moonshot through
    the managed harness (D-07), connector availability states (D-20), signed
    release docs (D-24), event guardrails (D-26), local Desktop Tasks model
    benchmark (D-15).

Progress, 2026-09-15: item 1 landed in 50925e177, item 2 in 27cb8a08a, item 3
in b288fffd0 (each still owes a live check on the running product), item 4 in
2ceb62b4e (checked on the rebuilt binary). Item 6: the QA user now has a
password sign-in for the native SDKs (web sign-in stays the Clerk ticket
flow); its workspace and the credential handling are still open. Item 5
landed in 4806cbb16 (reviewed on the dev server at two widths); two follow-ups
came out of it: the callerless Tauri latest-manifest route under
`apps/web/app/api/releases/latest/` leaves with the Tauri build, and the
Electron package still carries the name of the hosted trust mode, so the rename
to the surface name (D-04, derived) waits for a packaged-build check.
Item 8 done: 0183 to 0192 rehearsed on two Neon branches (apply clean, RLS
probe 33 tables, lease probe green) and applied to production, 192 applied, 0
pending, 0 drift, recorded against 890dad614. Because production still runs
107ded474, whose memory inserts name `(id)` as their conflict target, 0189 keeps
a transitional unique index on `id` and 0193 drops it; 0193 is applied only
once the deployment built on 0189 is live (37e1ad16c).
Item 7 landed in 78fd99ec0: the gate binds a Clerk token to the surface its signed
claims prove and ignores the header for anything else; proved live against the
dev server. The mobile JWT template is the one remaining founder dashboard step.
From item 10: policy dates (D-25) in 5ecc126f1, event guardrails (D-26) in
2a1f7bc77, MiniMax out of managed traffic (D-08) in ce7fea373; the TLS
pinning contract (D-11) now reads the decision entry (58fb784c6) while the pins
themselves stay placeholders until the report-only rollout.
TLS pins (D-11) are now provisioned: the issuing intermediates and roots of
the four AGI-controlled hosts sit in the mobile pin table, OpenAI and
Anthropic are not pinned, and the rollout stays report-only until a shipped
build has reported clean; the enforcement flip is its own change.

## 4. P2, important

### `AGI-3` Tool timeline and reasoning are still client-owned

**Severity:** P2
**Status:** Narrowed again 2026-09-12. Code-execution results and the generated
file list are now collected server side beside sources and citations, so a
client save that exhausts its retries no longer loses them. The tool timeline
and reasoning blocks are deliberately still client-owned: both are built by
merging frames, back-filling earlier entries and tracking per-tool status, and
reasoning also splits thinking spans out of the content stream with its own
timestamps. Collecting those on the server is a second implementation of a
rendering derivation, which is the trap this entry names. Unverified: the reload
assertion the validation line asks for needs a running server.
**Area:** Web chat persistence
**What was fixed:** The server now collects the pages a turn cited from the
`x_search_results` frames it already emits and writes them into the same
snapshot that carries the text, so citations survive a failed client save. A
client metadata save that fails after its retries now stamps the turn and the
transcript says what will not survive a reload, instead of a `console.error`
nobody reads.
**What remains:** the tool-call timeline and reasoning blocks are still written
only by the client's `saveMessageToDb`. A non-retryable failure still loses
them; the difference is that the reader is now told. Code-execution results and
the generated-file list closed 2026-09-12 in `e3d8bbebe`, collected server side
in `assistant-turn-sources.ts` beside sources and citations; they are no longer
in this remainder.
**Root cause of the remainder:** the timeline and reasoning are derived by the
client from the stream, with merging and per-tool status the server does not
reproduce. Reproducing that derivation server-side is the work, and it must not
become a second implementation of it.
**2026-09-13, a related but distinct fix:** `ad013685f` bounds the size of
whatever metadata the client does send (`message-metadata-projection.ts` caps
sources, citations, tool entries and thinking length before the save request is
validated), so an oversized payload from a long tool-using turn no longer fails
Zod validation and loses the entire save. That closes one failure mode of the
remainder (size-triggered validation refusal) without changing which side owns
the timeline and reasoning derivation.
**Evidence:** `apps/web/lib/hooks/useChatStream.ts` `persistAssistant`, which
builds the metadata object; `assistant-turn-sources.ts`, which shows the shape
the rest would follow; `packages/contracts/cloud-contracts/src/message-metadata-projection.ts`.
**User impact:** Bounded. Sources, the part a reader needs to trust an answer,
now survive. Losing the tool timeline degrades the record of how the answer was
reached.
**Dependencies:** None.
**Implementation direction:** Extend `AssistantTurnSnapshot` the way `sources`
extended it, one metadata class at a time, each collected from the canonical
wire rather than from any provider's shape. Do not move the client's rendering
derivation to the server; collect the evidence and let the client project it.
**Acceptance criteria:** A forced non-retryable save failure loses nothing that
the transcript rendered.
**Validation:** Extend `assistant-turn-sources.test.ts` per class, plus the
existing reload assertion in `apps/web/e2e/citation-persistence.spec.ts`.

### `AGI-5` Native code merges without compilation or test validation

**Severity:** P2
**Status:** Open, and blocked on a spend decision rather than on code.
**Area:** CI
**Root cause:** Four lanes carry `github.ref == 'refs/heads/main'`:
`rust-desktop-cli` (`.github/workflows/ci.yml:550`), `clippy-all-features`
(`:1188`), `macos-smoke` (`:1274`) and `windows-smoke` (`:1321`). So `cargo
test` at any scope, every crate under `crates/*`, and macOS and Windows
compilation all happen after a merge rather than at review.
**Current behavior:** More runs pre-merge than first recorded. `codeql.yml`
triggers on `pull_request` for `**/*.rs`, `**/Cargo.toml` and `**/Cargo.lock`
and runs the same clippy command for the two shipped crates, which type-checks
them. `auto-route-conformance` runs on pull requests but replays one fixture
against a single crate. `windows-smoke`'s own `cargo test` carries
`continue-on-error: true` even on its main-only run.
**What was fixed in this pass:** the guardrail layer pinned the
`native_changed` half of that condition and not the `github.ref` half, so the
trade-off could be widened or narrowed with nothing failing either way, and a
reader of `check-ci-guardrails.mjs` would have concluded native code was gated
on pull requests. The four lanes are now asserted to move together, with the
cost stated where the assertion lives.
**Why the rest is not being changed here:** the gating is a deliberate,
commented decision, and reversing it buys one full native build per pull request
that touches Rust. A native build is the slowest thing in this CI by an order of
magnitude, the change cannot be verified from a working copy (only a real pull
request exercises it), and recurring CI spend is the founder's call. Nothing
about it is a code defect.
**Severity note:** production is not directly exposed. `deploy-production.yml`
only promotes after a `CI` run concludes success on a push to main and checks
out that exact SHA, so a post-merge native failure blocks promotion. The cost is
main-branch health and developer velocity.
**User impact:** A native regression in `crates/*` or a platform-specific break
is caught at merge, not at review.
**Dependencies:** A founder decision on the CI budget.
**Implementation direction, once decided:** a bounded PR lane, not the full
matrix: `cargo test` for the two shipped crates plus a `crates/*` compile check,
leaving the sidecar build, `cargo deny`, the GUI suites and the platform smokes
in the main-only lane. Update `NATIVE_MAIN_ONLY_JOBS` in the same commit.
**Acceptance criteria:** A deliberately broken `crates/*` change fails a
required check on a pull request.
**Validation:** A draft pull request carrying a known break.

### `AGI-7` Desktop global voice does not meet its own release gates

**Severity:** P2
**Status:** Open on the gates; the second acceptance branch is already met.
Checked 2026-09-12: the acceptance line reads "every gate is met, OR the entry
point is removed from shipped builds", and the surface is already off in a way
that is honest rather than hidden. The capability probe is a compile-time false,
the settings control reads that probe and says "Not available in this build"
while pointing at the in-window hotkey that does work, the button is disabled,
and the Rust coordinator refuses a global-source session independently, so the
one caller and the authority both fail closed. What is left is the first branch:
six OS-level gates and a signed build, which is neither a decision nor a
checkout-sized change.
**Area:** Voice, desktop
**Root cause:** Tracked in the feature's own spec. The OS-level input hook is
real, but the coordinator refuses every global-source session, so the hook only
emits `refused` events, and `system_dictation_available()` is a compile-time
`false` on every OS.
**Current behavior:** The spec's release-gate ledger records 6 of 12 gates
unmet: focus-target pinning, secure-field refusal, capture-pipeline recovery,
text injection, dictionary and snippet precedence, and a signed build.
**Required behavior:** Either the unmet gates are met, or the surface stays off
in shipped builds.
**Evidence:** `docs/specs/desktop-global-voice/spec.md:16-20, :59-61, :78, :82-95`.
**User impact:** Global dictation cannot be relied on.
**Dependencies:** None.
**Implementation direction:** Work the spec's own gate ledger in order. Keep
the ledger as the acceptance record.
**Acceptance criteria:** Every gate in the ledger is met, or the entry point is
removed from shipped builds.
**Validation:** The spec's gate ledger, exercised on a signed build.

### `AGI-14` There is no second speech-to-text vendor to fail over to

**Severity:** P2
**Status:** Open, and blocked on a catalog decision rather than on code.
**Area:** Provider neutrality, voice
**Corrected root cause:** Recorded as a coupling in the route, which is where it
shows: `apps/web/app/api/llm/v1/audio/transcriptions/route.ts:377` refuses a
resolved model whose provider is not `openai`, `:521` calls
`providerApiUrl('openai', 'audio/transcriptions')` directly, and the key is read
as `OPENAI_API_KEY`. Checked on 2026-09-08, the catalog is the same shape: the
authored catalog contains exactly two STT models, a balanced one and a fast one,
both OpenAI, both under the `openai` family, and the `voice_transcription` slot
resolves to one of them. They are not named here: `check:model-id-literals`
exists because a document quoting concrete ids goes stale, and
`models.curation.json` is where they live. The route is not hiding a
choice; there is no second choice to make.
**Why the route is not being generalised first:** an abstraction with one
implementation and no second vendor to test it against is speculative
generality. The provider-neutral shape is worth building at the moment a second
vendor exists, and against it, so the seams land where that vendor actually
differs rather than where OpenAI happens to.
**What the decision is:** which second STT vendor, on what terms and at what
price. That is spend and contract, so it is the founder's.
**What follows the decision, in order:** add the model to
`models.curation.json` under its own family; give the route a provider-keyed
dispatch table for endpoint, auth header and form fields, replacing the four
literals above; extend the routing slot to a fallback chain; then a route test
per provider.
**User impact:** voice input has one point of failure and one vendor's pricing,
on a product whose stated differentiator is model and provider neutrality.
**Dependencies:** the vendor decision, before any of it.
**Acceptance criteria:** transcription succeeds through at least two providers
and fails over. No provider literal remains at the call site.
**Validation:** route tests per provider, plus registry contract tests.

### `AGI-16` A citation's href is still the routing provider's redirect

**Severity:** P2
**Status:** Fixed 2026-09-12 on every writing path, not observed live. The
research path resolves the router's redirect to the publisher during ingestion,
and a plain grounded turn resolves after its stream has closed and patches the
stored row, because a network call inside the streaming translation path is
ruled out. The patch substitutes leaf URLs inside whatever shape is stored
rather than overwriting the key, so the client's richer copy survives and no
numbered marker moves. The managed agent path persists its own sources and now
patches them the same way, after its terminal event. The client's save merges
into the same row and normally lands first, but a slow or retried one can land
last, so the message write path resolves before it inserts and whichever write
lands last stores publisher URLs.
**Area:** Research, citations, provider neutrality
**What was fixed:** A grounded result does not arrive with the publisher's URL.
Google hands back
`https://vertexaisearch.cloud.google.com/grounding-api-redirect/...`, with the
publisher's domain in the chunk's title instead, and every consumer derived the
displayed host and the favicon from the URL. So a research answer named
`anthropic.com`, `claude.com` and `youtube.com` on its cards while showing
Google as the host of each and drawing Google's favicon for all of them.
`citationPublisherDomain` now answers that question once, for the citation chip,
the research panel and the sources control: the URL's host wherever it is a
publisher, the title where the URL belongs to a router, and only when the title
is shaped like a domain, because printing prose in a host slot is a different
wrong answer.
**What remains:** nothing on the writing paths. Not covered, and pre-existing:
the bulk import behind a share link copies whatever hrefs the shared rows hold,
so a conversation saved before this fix still carries the redirects it was
saved with.
**Evidence:** live session 2026-09-08, sources panel and the `Sources` chip;
`packages/ai/providers/google/src/stream.ts` `citationFromGroundingChunk`, which
carries `web.uri` (the redirect) and `web.title` (the publisher).
**User impact:** a citation no longer advertises the routing vendor, favicons
match publishers, and a stored href outlives the router's redirect.
**Dependencies:** None.
**Acceptance criteria:** a citation still resolves after the provider's redirect
has expired.
**Validation:** resolve-on-ingest unit tests, plus a grounded research turn
asserting no provider host appears in any citation href.

### `AGI-22` There is no server-side record of provider-jurisdiction consent

**Severity:** P2
**Status:** Open, and larger than first recorded.
**Area:** Compliance, routing
**Corrected root cause:** The 2026-08-26 scan and the first draft of this entry
both said the gate exists and nothing calls it, and that the fix is one call in
the routing request builder. Checked on 2026-09-08, that is wrong in a way that
matters. `isProviderRoutingAllowed` takes a `ConsentLedger`, and the only
implementation of one is `apps/mobile/services/complianceLedger.ts`, which reads
device storage. There is no table, no column, no API and no web or desktop
surface that records this consent. The server has nothing to consult, so the
call cannot be added: what is missing is the record, not the read.
**Current behavior:** Auto routing can place a conversation on DeepSeek,
Moonshot, Qwen or Zhipu with no consent recorded anywhere the server can see.
Mobile's consent is real but local to one device and invisible to the backend
that does the routing.
**What now partially covers it:** the `usOnly` overlay is threaded as of this
pass, and the providers it excludes are `deepseek`, `qwen`, `moonshot`, `zhipu`
and `minimax`, which is the Chinese-HQ list plus one. A `max` or `enterprise`
user who sets the preference is now genuinely excluded from all four. That is a
user preference, not a compliance gate, and it does not apply below those tiers.
**What the real fix needs, in order:** a durable per-user consent record with
its disclosure version; an API to write it; a surface on web and desktop to
collect it; then the read in `buildWebCloudAutoRoutingRequest` beside `usOnly`
and `zeroDataRetentionOnly`. Whether existing users are grandfathered or
blocked on their next turn is a disclosure decision, not an engineering one.
**Evidence:** `packages/contracts/compliance/src/provider-jurisdiction.ts:40`,
called only from `llm-gate.ts:53,65`; zero imports of `@agiworkforce/compliance`
anywhere in `apps/web`; no `provider_consent` table or column in any migration.
**User impact:** a consent the product presents on mobile is not enforced by the
service that routes.
**Dependencies:** Founder decision on the disclosure and on existing users,
before any of it.
**Acceptance criteria:** without a recorded consent, no Chinese-HQ provider is
selected for any tier, on any surface.
**Validation:** auto-route conformance fixtures on the web path, plus a
migration test over the consent record.
**Already tracked as:** `COMPLIANCE-LLM-GATE-SURFACE-COVERAGE-01` in
`known-flaws.md`. That row's summary said only "compliance llm gate surface
coverage", which is why a second sweep on 2026-09-08 reported this as a new
finding; the row now names the jurisdiction angle and points here.

### `AGI-23` A route the account's own data policy refuses is still offered

**Severity:** P2
**Status:** Fixed 2026-09-12, not yet confirmed live. The refusal is now its own
route outcome class, so one observation withdraws the route for the window
instead of it taking a failure streak to park. Serving again clears it.
`min_discount_unavailable` is deliberately left on the old path because discount
availability genuinely fluctuates. Remaining: confirm on a deployment that the
model stops being selected first.
**Area:** Routing, catalog
**What was fixed:** An OpenRouter 404 saying `0 endpoints out of 1 requested are
available matching your guardrail restrictions and data policy ... ZDR violation
(account settings)` classified as a plain `client_error`, so it was neither
retried nor rotated and the user was told the request had been rejected. It now
classifies as `capacity_off_switch`, the same class as
`min_discount_unavailable`, which is failover-eligible: the route has no supply
on terms we accept, the provider is not down, and the request moves on.
**What remains:** the model is still in the picker, and Auto still selects it
first. Every turn that picks it spends a round trip discovering the same
permanent refusal before rotating. The catalog should reconcile against the
account's endpoint policy rather than assuming every listed endpoint is
reachable, or a first refusal should take the route out of service for a window
the way route health does for other classes.
**Evidence:** dev server log 2026-09-08 22:20:07 and 22:54:35 UTC, provider
`openrouter`, three occurrences within the minute. The model is named in the
log, not here: a concrete id in this file would go stale and would defeat
`check:model-id-literals`.
**Not an environment failure:** the setting is ours, on our own account, and so
is the catalog entry. No user can resolve it.
**User impact:** a model in the picker that never answers on the first attempt.
**Dependencies:** None. `AGI-24` used to prevent the rotation from completing
on any turn carrying tools; that pin is now narrowed to the steps it protects,
so the refusal this entry describes does reach another route.
**Acceptance criteria:** the route is not offered, or one refusal withdraws it
for the window.
**Validation:** the classification test in `provider-runtime`, plus a route
health assertion.

### `AGI-27` Attachments are not in the sandbox the model runs code in

**Severity:** P2
**Status:** Fixed 2026-09-12, not yet confirmed live. The turn's attachments are
staged into the sandbox workspace before the baseline snapshot and only when an
execution tool was actually called, so no sandbox is provisioned for a turn that
runs no code. Remaining: the acceptance criterion's live CSV total, which needs
a real sandbox.
**Area:** Code execution, files
**What is wrong:** a file attached to the turn is never staged into the
execution sandbox, so the model's first action is `write_file` with the whole
attachment as its content, which needs an approval, before it can run anything.
ChatGPT mounts uploads under `/mnt/data` and Claude's analysis tool reads the
attachment directly.
**Evidence:** live 2026-09-10, conversation a36a8054 on `:3100`;
`apps/web/lib/e2b/runtime.ts` `getE2BExecutor`, tool-loop.ts around the
executor acquisition.
**User impact:** medium. One extra approval and a copied file on every analysis.
**Dependencies:** None.
**Acceptance criteria:** a CSV attached to a code-execution turn is present in
the sandbox before the first `execute_code`, the model is told where, and no
`write_file` copy is needed.
**Validation:** tool-loop code-execution tests, a live CSV total on a
non-gateway model.

### `AGI-32` A live voice session's backend responses model and web search are never metered

**Severity:** P2
**Status:** Fixed 2026-09-12, not yet confirmed live. The close route accepts a
backend usage report and writes it as its own cost event, keyed on the session
so a retried close cannot double count, and carrying no customer charge because
the per-minute rate is the whole charge. The web_search calls are counted but
not priced: that tool is the provider's own and the rate card publishes a price
only for the Perplexity fallback and for Google grounding. Remaining: a live
session to confirm the second row appears, and a published rate for the
provider's own search.
**Area:** Voice, COGS
**What is wrong:** a live voice session delegates to a backend responses model
with web search (`apps/web/app/api/voice/live/sessions/route.ts`), which the
provider bills separately from the per-minute session rate, and no usage
report reaches the close route, so those tokens are never metered.
**Evidence:** `apps/web/app/api/voice/live/sessions/route.ts` (the session
create path, the `responses` tool config with `tools: [{ type: 'web_search' }]`);
`apps/web/app/api/voice/live/sessions/[sessionId]/close/route.ts` (the
settlement path, which records only the per-minute session usage report).
**User impact:** none directly; this is a company-cost visibility gap in the
COGS ledger, not a user-facing defect.
**Dependencies:** None. Not the same as the two OpenAI/Anthropic admin
credentials under "[Billing] Provider cost reconciliation credentials" in
`docs/work/founder-assistance.md`, which stay there because minting them is a
founder action.
**Acceptance criteria:** the close route accepts and records the backend
responses model's token usage, and any `web_search` calls it made, as their
own `provider_cost_events` row for the session, so `cogs_summary()` no longer
omits this spend.
**Validation:** a live voice session that triggers a backend web search closes
with a second `provider_cost_events` row for the backend model, covered by a
test on the close route.

### `AGI-34` A stalled durable run row pins the conversation on Generating response

**Severity:** P2
**Status:** Fixed on main, awaiting deploy.
**Area:** Web chat client, runs API
**What happens:** the chat page resumes a conversation from its run row. When
the world never progresses and the function behind the row dies, the row stays
running with no event, and every visit shows Generating response with a Stop
button until the reaper ends the row, which is at best the next quarter hour
and, while the reaper itself hung, never. Seen on 2026-09-10 on two
conversations of the QA account after the turns behind
wrun_01M26TYEAKNQA7GWWAS8W9Q86D and wrun_01M26VT1VK8TM4JB52HN1HEBMT stalled.
**Root cause:** the client trusted the row's state and had no liveness bound of
its own; the row's updated_at and last_event_sequence never move, but nothing
read their age.
**Fix:** `CloudAgentRunSchema` now carries `staleForMs`, computed by the server
that read the row, so the client never compares clocks it does not share.
`askWhetherTurnIsRunning` returns `running | stalled | idle` instead of a
boolean, counting a row quieter than the durable silence deadline as stalled,
and never counting a deliberate pause as one. `useChatStream` drops the loading
state on `stalled` and sets the error the existing retry banner already offers
to resend. Verified on `:3100`: the conversation shows "This turn stopped
running on the server and will not finish. Send it again to retry." with a
Retry button, and no "Generating response".

## 5. P3, lower priority

### `AGI-11` Published artifacts never expire

**Severity:** P3
**Status:** Open
**Area:** Artifacts, data lifecycle
**Root cause:** No TTL column or sweep. The comparable conversation share
(`shared_sessions`) carries a 7 day `expires_at`; artifacts deliberately
omitted it.
**Current behavior:** A published artifact URL is live until the owner deletes
it.
**Required behavior:** A default expiry, or an explicit, visible "no expiry"
choice at publish time.
**Evidence:** `apps/web/db/neon/0095_published_artifacts.sql`;
`apps/web/db/neon/0051_shared_sessions.sql`; the service module notes this as a
founder-pending gap.
**User impact:** Content stays reachable longer than the author expects.
**Dependencies:** Product decision on the default.
**Implementation direction:** Follow the `shared_sessions` pattern and add a
purge cron beside the existing purge jobs.
**Acceptance criteria:** An expired token stops resolving and the page reports
expiry rather than not-found.
**Validation:** Service tests plus a cron scope test.

### `AGI-12` Desktop stores were never migrated to the shared runtime state

**Severity:** P3
**Status:** Reframed 2026-09-12, and the real part is done. The count of 41 was
misleading: the shared runtime models six domains, and 38 of the 41 markers name
domains it does not model at all, so migrating them means inventing 38 new
shared domains. That is a product decision about what the shared runtime owns,
not a cleanup, and it should be asked as one question rather than filed as 38
migrations. What was genuinely duplication is fixed: a stale unreferenced copy of
the live chat-preferences store is deleted, and two shared settings fields that
nothing on desktop ever wrote now have a publisher, so a reader of the canonical
state is no longer told agent mode is off and no prompt override exists whatever
the user chose.
**Area:** Desktop, shared packages
**Root cause:** An unfinished consolidation. 41 files carry the identical
marker `TODO(task-1.3): migrate to packages/client/client-runtime/state`.
**Current behavior:** Desktop keeps its own store layer beside the shared one.
**Required behavior:** One owner for the state these stores duplicate, per
AGENTS.md section 3.
**Evidence:** 41 occurrences across `apps/desktop/src/stores/*.ts`.
**User impact:** None directly. Drift risk between desktop and other surfaces.
**Dependencies:** None.
**Implementation direction:** Migrate per domain, deleting each marker with its
store. One canonical issue, not 41.
**Acceptance criteria:** No `task-1.3` markers remain and desktop reads the
shared state.
**Validation:** `check:boundaries`, desktop tests.

### `AGI-17` A leading `>` becomes a blockquote, which is the standard

**Severity:** P3
**Status:** Not a defect as reported. A product decision remains.
**Area:** Markdown rendering
**What was actually found:** The behaviour reproduces, and it is CommonMark. A
block quote marker is `>` optionally followed by one space, so `>= 3 items`
renders as a blockquote containing `= 3 items`, and a lone `> ` renders as an
empty blockquote with nothing visible in it. Confirmed by driving
`MarkdownContent` directly: `"> "` produces `<blockquote>` with no content,
`">= 3 items"` produces a blockquote of `= 3 items`, `"> quoted words"` produces
a correct blockquote, and `"cmd > out.txt"` is untouched because a mid-line `>`
is not a marker.
**Why it is not being changed:** the renderer follows the standard every other
markdown tool follows, and the leaders this product is measured against render
CommonMark too. Special-casing `>=` or a bare `>` would deviate from the
standard, and would have to be built so it never swallows a real blockquote.
That is a deliberate product choice about conforming versus being forgiving, not
a bug fix, and it is the founder's to make.
**If it is taken:** the narrowest defensible rule is to treat `>` as a marker
only when followed by a space or end of line, which keeps every real blockquote
and returns `>=`, `>>`, `->` and similar to plain text. It would need cases for
`> `, `> quoted`, `>= 3`, `cmd > out`, `>>> ` and a nested blockquote.
**User impact:** low and cosmetic in an assistant answer. Real, if minor, when a
user's own message uses `>` for comparison or redirection at the start of a
line.
**Evidence:** browser QA 2026-09-08; reproduced against the renderer directly
2026-09-08.

### `AGI-20` Retry can move the viewport to an unrelated message

**Severity:** P3
**Status:** Fixed 2026-09-12, not observed in a browser. The transcript caches
row heights by index, and the guard asked whether ANY index on the visible path
now held a different message. A retry makes that true by construction, so one
changed index threw every row in the thread back to the default estimate and the
layout moved under the reader with no scroll call at all. Short threads fit in
the viewport, which is why it was only ever seen in long ones. Only the rewritten
suffix is forgotten now. The fix is about real layout and jsdom has none, so the
tests assert which rows are invalidated, not the resulting pixel position.
**Area:** Chat transcript
**Root cause:** Not diagnosed. Retry replaces a message in a virtualised list;
the scroll anchor appears to be resolved against the pre-retry layout.
**Current behavior:** In a long thread, Retry sometimes scrolls to an earlier,
unrelated position instead of following the retried message. Manual scrolling
recovers it.
**Required behavior:** Retry keeps the retried message in view.
**Evidence:** browser QA 2026-09-08, long threads only.
**User impact:** Recoverable annoyance; no data is affected.
**Dependencies:** None. Related to the overscan behaviour the streaming spec
already exercises.
**Implementation direction:** Anchor the scroll to the retried message's own
id after the list settles, rather than to an index.
**Acceptance criteria:** Retry in a long thread leaves the retried message
visible.
**Validation:** An e2e case in a thread longer than the overscan window.

### `AGI-29` Memory facts come from a regular-expression extractor

**Severity:** P3
**Status:** Open, waiting on a founder cost decision, not on engineering.
**Area:** Memory
**What is wrong:** auto-memory candidates are the sentences that match a fixed
list of patterns ("my name is", "I prefer", "remember that"); the leaders
extract with a model and keep facts the patterns never see.
**Evidence:** `packages/ai/agent-core/src/memory.ts` `extractCandidateMemoryFacts`.
The model-backed replacement is already built and wired into the post-turn
recorder, on the cheapest managed utility route, falling back to the patterns on
every failure; it is dark because the flag that enables it is unset. Read
`apps/web/lib/services/model-memory-extraction.ts` and
`apps/web/lib/services/managed-auto-memory-service.ts` before writing any more
extraction code.
**User impact:** low. Memory works for the phrasings it knows. Verified live on
2026-09-13 against the running web app: a fact stated in one conversation was
stored and answered correctly in a second, separate conversation.
**Dependencies:** the founder decision to spend one utility completion per
eligible turn, tracked in `docs/work/founder-assistance.md`.
**Acceptance criteria:** a fact stated without a trigger phrase is remembered.
**Validation:** memory service tests, a live two-chat recall.

### `AGI-30` The conversation list is fetched ten times during one turn

**Severity:** P3
**Status:** Partly fixed 2026-09-12, and still open for the residual. It was
not a render storm: within one mount the effect fires once. It was mount
count, because the first send routes /chat to /chat/[sessionId], a different
route segment, so the page remounts mid-turn and asks again, and on shell
routes a second copy of the hook races the page's in the same tick. Concurrent
mounts now coalesce onto one request and a remount inside a short freshness
window reuses what is loaded. The four /api/usage calls per turn are the same
defect class in `useManagedUsageSummary` and are still open.
**Area:** Chat performance
**What is wrong:** one send produces about ten `GET /api/chat/conversations`
and four `GET /api/usage`; the list hook refetches on every message update.
**Evidence:** network log 2026-09-10, conversation 87a3bec7 on `:3100`;
`apps/web/lib/hooks/useConversations.ts` mount effect and its dependencies.
**User impact:** low. Wasted requests and rate-limit pressure on the QA account.
**Dependencies:** None.
**Acceptance criteria:** one list refetch per completed turn.
**Validation:** hook test with a request counter, one live turn.

### `AGI-31` A chat turn logs a MaxListenersExceededWarning

**Severity:** P3
**Status:** Fixed 2026-09-12, no live proof yet. The leak was in the database
layer, not in a model adapter, which is why it was never found where the warning
appeared: each per-request scoped adapter kept its own record of which pooled
clients it had guarded, attached an error listener to a warm client, and never
removed it. The same bookkeeping made one socket failure log once per leaked
listener. The guard now belongs to the checkout and is removed on release.
Remaining: a fresh stack from a running server to confirm the warning is gone
across many turns.
**Area:** Server hygiene
**What is wrong:** "Possible EventEmitter memory leak detected. 11 error
listeners added" appears during a chat turn; the registration site was not
found in the adapter, factory, runtime or error-handler modules.
**Evidence:** dev log 2026-09-10; the warning's full stack is needed from a
fresh occurrence.
**User impact:** none visible; a leak would surface as memory growth.
**Dependencies:** None.
**Acceptance criteria:** no warning across a hundred turns.
**Validation:** the stack, then a targeted test.

### `AGI-33` The failure classification does not cross the AgentEvent envelope

**Severity:** P3
**Status:** Open, scheduled, and pinned by tests.
**Area:** Protocol, routing
**What is wrong:** the structured classification that now rides the stream chunk
is dropped crossing the AgentEvent envelope, so a consumer on the far side falls
back to re-reading prose. Three gates drop it, not one: the generated
`AgentEventError` has no field, the hand-written Zod mirror in cloud-contracts
strips unknown keys before the frame is emitted, and serde discards it for the
desktop and extension consumers.
**Why it is P3 and not P1:** the envelope is not on the chat router's
classification path, and the converter has no production caller today. It is
also fail-safe rather than fail-open: a classification smuggled onto an error
frame is stripped, so the gap loses information and cannot inject a category.
Both facts are now tests.
**Do not partially fix it:** `code` and `retryable` already cross, so a
classification could be synthesised from them. That is worse than the gap,
because the runtime trusts a carried classification ahead of all text and only
runs its matcher when the field is absent, so a guessed `fallbackable` would
permanently silence the matcher for every error from this envelope. There is a
test refusing exactly that.
**What closing it takes, in order:** add an optional classification struct to
`AgentEventError` in the protocol crate with `category` kept as a string, since
the taxonomy owner is `ErrorCategory` in provider-runtime and a second copy in
Rust would drift; fix the one struct literal that breaks and add a round-trip
case; leave the schema version alone, because an optional additive field is
backward compatible by that constant's own rule; regenerate with
`pnpm generate:protocol-types`, which CI verifies, so the generated tree must
never be hand-edited; extend the Zod mirror with the same validate-before-trust
discipline the runtime uses; and only then the converter, both directions.
**Noted while tracing it:** `crates/agiworkforce-protocol/bindings/` is a second
committed copy of the same bindings, written when the cargo export test is run
directly, and no guard compares it to the published tree. The two are identical
today, checked 2026-09-12, so there is nothing to repair; it is recorded because
nothing would say so if they diverged.
**Acceptance criteria:** a classification survives a round trip through the
envelope, and a malformed one is refused rather than trusted.
**Validation:** the two pinning tests flip from asserting the loss to asserting
preservation.

## 6. Needs live validation

None of these is a confirmed defect.

### Every published release predates its own verification, 2026-09-12

**The download-verification instructions cannot be followed today, and failing
them looks exactly like a tampered download.** Both published releases were cut
before the machinery that signs them existed:

| release           | published  | carries                                   | signing landed |
| ----------------- | ---------- | ----------------------------------------- | -------------- |
| `v-cli-1.0.0`     | 2026-05-03 | five archives, no `SHA256SUMS`, no bundle | 2026-07-16     |
| `v-desktop-1.2.0` | 2026-05-04 | `.AppImage`, `.deb`, `.rpm`, no `.sig`    | 2026-07-31     |

So a reader who follows "verify a download on your own machine" gets a
missing-file error from `minisign` or `cosign` rather than a verification
failure, and the two are indistinguishable to someone who is checking precisely
because they do not trust the file.

The release workflows themselves are correct and were verified line by line:
`release-cli.yml` produces Sigstore-signed checksums with a pinned certificate
identity, and `release-desktop.yml` signs, notarizes and staples, then re-checks
each artifact against the committed updater public key and gates publication on
a clean-container install, upgrade and rollback. **None of that has ever run
into a published release.**

The pages are honest about the consequence, because the download controls are
gated on the live release API rather than on the workflow, so nothing offers a
file that is not there. The gap is the release cut itself.

**What closing it takes:** cut a CLI release and a desktop release from current
`main` so the published assets come from the signing workflows, then re-run the
verification transcript on each platform exactly as the page states it. Until
then, treat every verification instruction on `/download` as documentation of
intent. This is a founder action: it publishes artifacts under the project's
signing identity.

**Also worth a decision:** the Windows row on `/download` is hardcoded to "not
published" while macOS and Linux are live-checked, even though
`build-windows-release.yml` uploads a Trusted-Signing-verified installer on
manual dispatch. It is accurate today and goes stale silently the first time
anyone dispatches that workflow.

### Public pages claimed things the code does not do, 2026-09-12

The flagship rewrite `d42d3cb15` moved about 38 public pages onto a new system.
Rewriting copy detached it from the behaviour it describes, and **14 false
claims were found across the 18 pages audited**, so the defect is systemic
rather than a one-off.

The one that matters most was a privacy claim. `/chrome-extension` said chat
crossed a localhost native-messaging bridge and that "models and tools run on
Desktop". Every extension turn posts to
`https://agiworkforce.com/api/llm/v1/chat/completions` with
`trustMode: 'managed_cloud'`; the bridge only ever carried selections, page
captures and queued messages. The same page said chats "don't sync anywhere by
default" while cloud mirroring reads `stored !== false` against a `true`
default. Both were wrong in the direction that understates where user data
goes, which is the direction that matters.

The rest, by kind:

- **Availability understated or overstated.** `/desktop` said macOS installers
  were not published while the release workflow builds, signs and notarizes a
  universal dmg, and the download component on that same page already checked
  for it. `/cli` described an `agi cloud` command that does not exist and that a
  CLI test actively fails the build for exposing.
- **Numbers that drifted.** `/enterprise` promised audit batches "every ten
  minutes" against a thirty-minute cron. `/status` said a Postgres query runs on
  every check, when a success inside the hour is reused without querying.
- **Entitlement understated.** `/business` called identity, audit and retention
  controls contract-scoped, when all four ship self-serve and `/enterprise`
  already said so.
- **Capability overstated.** The landing page credited Chrome with executing
  work on Desktop and Desktop with AGI Work, which is web-composer only. AGI
  Work's page described steps moving through in progress individually, when
  `advanceAgiWorkPlan` marks only the first and settles the rest at the end.
  Several keyboard and slash-command claims named bindings that do not exist,
  including a `/memory` command whose registration nothing calls.

Each correction is pinned by a regression test that was verified to fire
against the pre-fix copy, in `surface-page-claims.test.ts`,
`feature-page-claims.test.ts` and the extended `chrome-boundary-claims.test.ts`.

**Three claims were left for the founder rather than decided by an agent.**
Each is arguable rather than wrong, and each is about how the product presents
itself:

- `/about` says the desktop app is "native to its platform rather than a wrapped
  web view". The shipped app is Tauri with a Rust core, which renders in the
  operating system's webview, and a separate managed-only Electron shell also
  ships. Defensible, and also the softest claim on those pages.
- `/docs` gives the Desktop card a plain call to action and no status label
  while Mobile, Chrome and VS Code all carry the coming-soon label, yet Windows
  installers are unpublished. The platform sentence is true; the card reads as
  more available than Desktop is.
  This list previously carried a third item, that `SURFACE_STATUS.desktop` in
  `apps/web/lib/marketing-constants.ts` understates the shipped macOS build by
  reading "Linux assets". **That was wrong and is withdrawn.** The constant is
  accurate: the published desktop release carries an AppImage, a deb and an rpm
  and nothing else. The flag came from the same mistake as the desktop page copy,
  reading the release workflow instead of the release.

**What the audit found on `/customers`, `/partners` and `/press` is worth
recording as a positive**, because it is the risk that was looked for and it is
absent. None of the three names a customer, logo, testimonial, metric or press
mention that is not real. They state what does not exist instead: `/customers`
labels its scenarios "None of these is a customer", `/partners` says there is no
program yet and lists what it does not offer, and `/press` carries a section
naming the certifications, customers and uptime record it cannot back up. Every
mechanic in the scenarios traces to real CLI code. Nothing needed replacing.

**About twenty of the rewritten pages have not been audited**, including
`/about`, `/api-docs`, `/docs`, `/faq`, `/help`, `/security`, `/pricing`,
`/download`, `/get-started` and the remaining feature pages. Given a 14-claim
yield from the first 18, the rest should be read the same way before launch:
extract each checkable claim, find the code that decides it, and cite it.

### Migration numbering reconciled with origin/main, closed 2026-09-13

**Resolved.** This entry described a real divergence, measured 2026-09-12:
this branch's local `0183`/`0184`/`0185` carried the same content as
`origin/main`'s already-applied `0180`/`0181`/`0182`, byte-different only in
the migration number inside each file's own header comment, which
`planMigrations` in `scripts/lib/neon-migrations.mjs` checksums. The
remediation this entry specified, taking `origin/main`'s three files verbatim
and dropping the local drafts, landed in `c64694f1a`, and the migrations that
actually needed the `0183` to `0185` numbers (video completion notice,
organization-shared artifacts and its policy fix) were renumbered `0183` to
`0185` on top of the correct `0182`, with `0186` added for organization-shared
conversations (`AGI-10`). `pnpm check:neon-migrations` passes on the current
tree: 186 migrations, contiguous from `0001`, ending at
`0186_organization_shared_sessions.sql`. What is still outstanding is not the
file reconciliation but applying `0183` to `0186` to the production database,
tracked in `docs/work/founder-assistance.md`.

### Retracted: the origin/main comparison, 2026-09-12

**Every number previously recorded here as an `origin/main` measurement was
void, and the conclusions drawn from them were wrong.** They are retracted
rather than edited, because the instrument, not the arithmetic, was broken.

A scratch worktree checks out the branch's own sources but resolves
`@agiworkforce/*` back into the shared checkout, so it measures foreign package
state. Three separate defects produced that, each hidden behind the previous
one:

1. Symlinking the `@agiworkforce` scope directory wholesale. The entries inside
   it are relative to the shared checkout's `node_modules`, so every one of them
   still resolved there.
2. Repointing only the root `node_modules`. pnpm links workspace dependencies
   into **each package's** `node_modules`; 185 links per worktree were never
   touched, including `apps/web`'s, which is what the web suite resolves through.
3. `packages/ai/routing/node_modules/@agiworkforce/model-registry` is a
   _relative_ symlink. It resolves through its own real path into the shared
   tree even when the scope directory above it is correct.

What the bad instrument actually measured was origin/main's **tests** against
the branch's **catalogue**, a pairing that exists nowhere. The thirteen routing
failures were entirely an artifact of it: a version matrix run in an isolated
harness gives 789/0 for origin/main against its own registry, 798/0 for the
branch against its own, and reproduces the reported 776/13 only in the mixed
pairing. Both self-consistent pairings are green.

Verified in the restored shared checkout, which is the real environment:

| package                    | result                 |
| -------------------------- | ---------------------- |
| `packages/ai/routing`      | 799 passed, 0 failed   |
| `packages/ui/unified-chat` | 1,866 passed, 0 failed |

**A clean origin/main comparison is not available, and is not worth buying.**
Only a worktree with its own real install would give one. The question it was
meant to answer, whether this pass introduced failures, is better answered per
failure from the code and the history than by a whole-suite delta.

**The rule this leaves:** a suite count from a scratch worktree is not evidence
unless the instrument was verified first, by asserting a fact that differs
between the two trees. The relink script that repairs a worktree must also never
write _through_ a `node_modules` directory that is itself a symlink; doing so
repointed 185 links in the shared checkout at the scratch tree, which was caught
and restored the same session.

### Failing `apps/web` tests found by running the whole suite, 2026-09-12

The whole `apps/web` suite had not been run this pass, only the files each change
touched. Running it in full is what surfaced these, and CI would not have: it
runs `pnpm test:affected`, which can skip the package entirely.

**The "reproduces on origin/main" claim attached to these has been withdrawn**
for the instrument reason above; treat each as a failure on this branch whose
origin is established from the code, not from a comparison run. Where that was
done the answer is recorded per item below.

They are not cosmetic, and two matter for what ships next:

- Three in the free-lane plan. The lane decides which models a FREE account is
  served, so a substitution there is a product-behaviour question, and free
  traffic is exactly what the event multiplies. Now fixed: they were stale
  assertions, and the product fact behind them is recorded below.
- One in workspace model policy. **The reading first recorded here, that a
  governed workspace can rotate onto a model its own policy forbids, was wrong
  and is withdrawn.** Instrumenting `processRequest` shows the surviving entry
  is the primary model itself reached on a second transport, not a second model,
  and policy is enforced per route at admission. The test asserted an empty
  failover plan where the correct assertion is that every entry carries the
  admitted model's own canonical key. No governance leak exists.
- One in model continuity, and one each in capability-health preview and
  aggregator routing, both failing with a type error, which usually means a
  shape changed underneath a caller.

The eleventh failure was introduced by this pass and is fixed: making the usage
summary one shared reading rather than one per component meant it outlived a
test case, so the settings pane rendered the previous case's numbers.

Three of the five were repaired on 2026-09-12 and were stale assertions rather
than broken code, with one exception worth reading: the aggregator file died at
import on origin/main, so all 27 of its tests were dead and reported as one
failure, and the in-progress repair sitting in the tree had turned two of them
into conditional runs whose conditions are false today, which left the security
assertion "never admits an experimental-only route to managed traffic" running
as skipped.

The three free-lane failures were stale assertions too, and what made them stale
is a product fact worth keeping: the lane's slot preference is derived from
`apps/web/config/free-pools.json`, and since the founder retired the two Groq
`gpt-oss` models on 2026-09-11 no pool record claims either free slot. The
OpenRouter free router that took their place in both slots may not enter the
company lane, because the terms workbook excludes it on
`promptsExcludedFromTraining` and `check-free-pools.mjs` calls its absence from
the pool file the deliberate state. So a free-plan request carrying the
preference is now headed by an unverified Model Studio promo slot rather than by
a free workhorse. No traffic moves either way, since not one pool entry is
verified and the lane mode defaults to off, but the company free lane holds no
free-workhorse capacity at all until a terms review admits a route for one. That
is a founder decision, not a code change.

The model-continuity failure does not reproduce on this tree: the file passes
alone, with the whole `chat/completions/lib` directory, and inside single-worker
runs of all 148 `app/api/llm` files and of 1,150 files across the other
directories. It cannot be reached from the committed code either, because the
route list the test marks unhealthy and the resolver's own route table are built
from the same registry records, and route health is honoured whatever the
routing flags say. The run that recorded it was reading uncommitted package
state in the shared checkout. The test now asserts that its unhealthy set really
covers the routes the resolver picked, so the next occurrence names the fixture
instead of reading as a refusal to move up the ladder.

**Retracted: the thirteen `packages/ai/routing` failures never existed.** They
were the mixed-tree artifact described above, and the package is 799/799 in the
shared checkout. What each cluster turned out to be, once measured against a
self-consistent tree:

- The conformance fixture is generated. Regenerating it with the documented
  `AGI_UPDATE_ROUTING_CONFORMANCE=1` generator reproduces the committed file
  byte for byte, and the Rust mirror passes, so nothing had drifted.
- The `auto.test.ts` and `slot-preference.test.ts` assertions were stale worked
  examples on the old catalogue, already replaced with registry-derived ones.
- The two `fallback-plan.test.ts` assertions were stale for a reason worth
  keeping: the workhorse model now has five provider routes, so parking one
  provider is absorbed _within_ the slot. The decision stays `preferred_slot`
  and continuity stays `continuity` while moving to a live route of the same
  model, which is better behaviour than the old tests demanded.

**The explicit-model contract was never broken**, on either side. It was swept
directly rather than inferred from the one test: 401 registry models by 4 tiers
by 4 tasks, zero primary swaps and zero fallback swaps on both trees. The
current encoding is the stronger one, asserting that every fallback carries the
same canonical `modelKey`, which is the actual promise that only another route
of the same model may substitute.

**One real gap fell out of it.** Loosening the reason assertion to
`['health_fallback', 'preferred_slot']` left `health_fallback` with no coverage
anywhere. The arm is still reachable, by parking every provider serving the
preferred model rather than only the primary's, and now has a registry-derived
test.

### Production catalogue measurement, 2026-09-12 10:25 UTC

Read-only, anonymous, against the live site. `/api/health` reports database,
Stripe and environment healthy. `/api/models/catalogue` shows the two defects
this pass fixes are live right now, on the deployment customers are using.

**Two models are offered to every anonymous visitor with zero routes.** They are
admitted, carry no minimum-plan label, and have an empty route list, so choosing
either cannot produce an answer under any circumstances. Six more are admitted
than should be: the free roster is three models, and the response lists eight,
which is the price-derived floor admitting models nobody named free.

**Every supplier name is served to the customer.** Eight of them appear in the
route labels the picker reads, including the two resellers.

**The public models endpoint tells a free caller that everything needs Basic.**
It returns three models and reports the minimum plan as `basic` for all three,
including the ones that account can run right now. That is the published floor
disagreeing with the gate that actually admits the turn.

All three are fixed on `fix/provider-outage-health-2026-09-12` and none of the
fixes is deployed, so the gap between this measurement and the branch is a
deployment, not engineering. Re-run the same three requests after it ships: the admitted count should fall to
the named free roster, no admitted entry should carry an empty route list, no
supplier label should appear anywhere in the response, and the models endpoint
should report `free` for the models a free account can run.

### Model usability sweep, 2026-09-12

Every selectable managed chat route was called for real, one minimal turn each,
at a 300-token budget because a smaller budget is consumed by reasoning before
any text is emitted and reads as a false empty.

**25 of 29 canonical chat models answered**, across OpenAI, Google, DeepSeek,
xAI, Moonshot, Qwen and Perplexity, plus the free router, and three models
reached through their marketplace routes rather than their own providers.

**The four Claude models are the only chat models that do not answer**, and the
cause is not code: HTTP 400, "Your credit balance is too low to access the
Anthropic API". See the founder-assistance entry.

Three probe artifacts are recorded so the next sweep does not re-raise them: the
OpenAI models refuse `max_tokens` and require `max_completion_tokens`; the
transcription, speech, image, video and embedding models are not chat models and
must not be called on a chat endpoint; and one research model returns nothing
within a single short turn by design.

Two providers hold no credential anywhere: MiniMax, which is nonetheless
reachable through its marketplace route, and Groq, whose three models therefore
cannot be served by anyone. The catalogue's executability rule already withholds
a model with no credentialed route, so neither is offered.

The tool half of the probe had never been run. Run now, 18 routes call a tool
they are handed, two of Perplexity's research models answer without calling one,
and the base model of that family refuses outright. One disagreement with the
catalogue came out of it and is left alone deliberately: one model in that family
declares it cannot call functions and called one on two separate observations, so
the flag is wrong, but the family is being retired from selection and correcting
a capability on the way out is churn. Recorded so the next reader does not have
to measure it again.

| id       | Question                                                             | Why it is still open                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LIVE-3` | Does a connector survive discover, authorize, expire, revoke?        | Completing it means granting a third party access to the founder's real accounts. That is the founder's decision to make, not an audit step, so it was deliberately not performed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `LIVE-4` | Does web to desktop continuity complete a round trip?                | Needs two signed-in devices at once. Runtimes are distinct and boundary tests pass, but the round trip was not exercised.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `LIVE-7` | Does the durable transport rotate routes after 2f042794f?            | The generated durable step route under the web app's .well-known/workflow directory is written when the dev server starts, so the running server on `:3100` still executes the old step code. Tests cover the rotation; a live pinned-model turn on a gateway route must be re-run after the next restart.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `LIVE-6` | Do scheduled tasks actually fire?                                    | Settings shows `Runs: 0` and a past-due next run for an active weekly schedule. Local development has no cron runner attached, so this is the expected local reading. Re-check on a deployed environment before treating it as a defect.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `LIVE-8` | Do functions stop outliving their budget once a1c1b6a1e is deployed? | Deployed at 23:34 UTC as 107ded474. The 800 s cluster has not recurred, but the first signed-in turn on the new build stalled exactly as the six runs had: the workflow run recorded run_created and run_started and never a step, the chat function never reached its first-byte fallback and died at the 300 s limit, the reaper cron died at 300 s inside a cancel, and the flow function logged a 240 s replay timeout. The workflow REST API lists no completed or failed run at all, so no durable turn has ever finished in production. Cause: the Vercel world client hands its own undici 7 dispatcher to the Node 24 fetch, the mismatch the container runbook already names for the local world, and every world call after start() hangs. `WORKFLOW_NODE_HTTP=1` was set on the production and preview environments at 23:50 UTC and did nothing, which is why the flow route kept answering 504 afterwards: the root pnpm override pinned `@workflow/world-vercel` to 4.6.1, whose `@workflow/world` (4.3.1) predates the flag entirely, so the deployed world parsed no such variable and kept handing its own undici 7 dispatcher to the Node 24 fetch. Only `@workflow/world-local`, which local dev uses, honoured it, which is why `:3100` worked and production never did. Proven 2026-09-13 with one command against the production world on Node 24.18.0: unset, `workflow inspect runs` hangs on an unsettled top-level await; set, with the override raised to 4.7.4, it returns the run list. The override is now 4.7.4, `WORKFLOW_NODE_HTTP` is a required key in the web env contract rather than a dashboard-only variable, and `apps/web/lib/workflows/durable-world-transport.test.ts` fails if either the pin or an installed copy stops reading the flag. Every call into the world is bounded by `WORKFLOW_WORLD_CALL_DEADLINE_MS` in `apps/web/lib/deadline-policy.ts` so a broken transport degrades to the inline turn. To close: a signed-in turn on that deployment must create steps and complete, the run must list as completed, the reaper cron must finish under its limit, and the 300 s cluster must not recur. The two stalled runs were cancelled through the REST API at 23:50 and 23:55 UTC; two more, `wrun_01M29D4FY1WTT3T8FYR2T726JP` and `wrun_01M27B9P5V0K81W755HBD4HVH7`, are still `running` on the retired deployment and were redelivered every fifteen minutes through 2026-09-12 23:20 UTC at 800 s a time. Cancelling them is a founder action, recorded in `docs/work/founder-assistance.md`. Across the newest 20 production runs not one has ever reached `completed`. Separately, `/login`, `/`, `/pricing` and `/contact-sales` are rendered by a function on every hit and receive bursts of a dozen requests every ten minutes from an unidentified external monitor or crawler; cheap today, and the public-pages pass should make those routes static. |

## 7. Execution order

Dependency-aware, not severity-ordered.

1. `AGI-27`, sandbox staging. `AGI-28` closed on 2026-09-13 and it was the
   other holder of the tool loop's terminal path, so this one now runs alone.
2. `AGI-3`, the rest of the assistant metadata. Its silent half is closed, so
   what is left is bounded and visible.
3. `AGI-5`, native CI. Needs a budget decision before an implementer; the
   trade-off is now pinned so it cannot drift while that is pending.
4. `AGI-23`. `AGI-24`, the failover pin that stopped its rotation from
   completing, is closed, so the remaining half is the catalog offering a route
   the account's own data policy refuses. Do not run it concurrently with
   `AGI-3`, both touch the chat request processor. `AGI-22` is not in this
   sequence: it is blocked on a disclosure decision, not on the threading
   `AGI-8` established.
5. `AGI-16`, citation canonicalisation. Independent, and the visible half of
   the same provenance story project retrieval closed.
6. `AGI-7`, desktop voice. Web voice is now a live session; the desktop
   gates are its own ledger.
7. `AGI-14` needs a vendor decision before it needs an implementer. `AGI-10`
   is closed, artifacts and conversations both carry the two-part audience
   model, so nothing sequences behind it.
8. `AGI-32` and `AGI-34` need only the live confirmation their own sections
   name; both are code-complete on main. `AGI-11`, `AGI-20`, `AGI-29`,
   `AGI-30`, `AGI-31`, `AGI-33`. Background and polish. `AGI-17` needs a
   decision before it needs an implementer.

`AGI-12` belongs to whoever is next in `apps/desktop`.

## 8. Acceptance matrix

| Issue    | Automated                                            | Manual or live                           | Gate                                      |
| -------- | ---------------------------------------------------- | ---------------------------------------- | ----------------------------------------- |
| `AGI-3`  | per-class snapshot tests, e2e reload                 | reload after a tool-using answer         | nothing the transcript rendered is lost   |
| `AGI-5`  | the four native lanes are pinned together            | a PR with a deliberate native break      | required check fails on the PR            |
| `AGI-7`  | spec gate ledger                                     | signed build                             | 12 of 12 gates, or surface removed        |
| `AGI-11` | service and cron tests                               | none                                     | expired token stops resolving             |
| `AGI-12` | `check:boundaries`, desktop tests                    | none                                     | zero `task-1.3` markers                   |
| `AGI-14` | per-provider route tests, registry contract          | none                                     | a second STT vendor exists and fails over |
| `AGI-16` | resolve-on-ingest tests, no provider host in a href  | a grounded research turn                 | a citation survives redirect expiry       |
| `AGI-17` | none until the decision is taken                     | none                                     | founder decides conform or forgive        |
| `AGI-20` | e2e case invalidating only the retried row           | none, real layout needs a browser        | retried message stays in view             |
| `AGI-22` | conformance fixtures, consent record migration       | none                                     | no Chinese-HQ route without consent       |
| `AGI-23` | classification test over the observed 404            | none                                     | excluded route is not offered             |
| `AGI-27` | tool-loop staging cases                              | a CSV total on a non-gateway model       | no write_file copy before execute_code    |
| `AGI-29` | memory service tests                                 | a live two-chat recall                   | a fact without a trigger phrase is kept   |
| `AGI-30` | hook test with a request counter                     | one live turn                            | one list refetch per completed turn       |
| `AGI-31` | targeted test once the stack is captured             | a hundred turns with no warning          | no MaxListenersExceededWarning            |
| `AGI-32` | test on the close route                              | a live session with a backend web search | second `provider_cost_events` row lands   |
| `AGI-33` | the two pinning tests flip to asserting preservation | none                                     | classification survives the envelope      |
| `AGI-34` | run-age contract, stalled-state unit tests           | a stalled run on the deployed build      | Retry banner, not Generating response     |

Every web change closes with `apps/web` typecheck run on its own.

## 9. Dependencies and parallel work

```
AGI-3                      web persistence, independent, narrowed
AGI-5                      CI, independent, do early
AGI-23                     routing, independent now that the pin is narrowed
AGI-22                     blocked on a disclosure decision, not on code
AGI-16                     provenance, independent
LIVE-5 ──> AGI-7          desktop voice, measure before building
AGI-14                     blocked on a second STT vendor, not on code
AGI-32, AGI-34             code-complete, waiting on a live confirmation
AGI-11, AGI-12, AGI-33     background
AGI-17, AGI-20, AGI-29,
AGI-30, AGI-31             polish, independent of everything
```

Two tracks can run at once without touching the same files: web chat
(`AGI-3`) and CI (`AGI-5`).
