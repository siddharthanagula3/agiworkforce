# Large chat file uploads: plan

Status: In progress
Owner: Chat attachments maintainers
Last updated: 2026-11-15

How the feature is tested before anything is deployed, the order in which it
is deployed, and what is still unverified. The design is in `spec.md`; the
work packages are in `tasks.md`.

## Testing without a deployment

Nothing in the build needs a deployment, a production migration or a Fly
change to be tested. Every package names its tests in `tasks.md`; the shared
instruments are:

- **Scanner:** the existing `services/upload-scanner/__tests__/fake-clamd.ts`
  plus a fake HTTP source (a local `node:http` server serving fixture bytes
  with an ETag, a redirect and a slow mode), so `/v2/scans` runs end to end in
  vitest. The fetch rules refuse a non-https URL and an IP literal, so the
  test gives `createScannerServer` a `fetchSource` option that answers an
  allowlisted https URL from the local server; the URL rules run before it is
  called, so they are still tested (`P3`).
- **Storage:** the memory adapter from `packages/platform/object-storage`
  (`createMemoryObjectStore`), which supports multipart, conditional copy and
  ranged reads, plus a delaying wrapper for the copy timeout case.
- **Workflow:** `apps/web/lib/server/chat-file-intake/__tests__/inline-executor.ts`
  (new, `P12`; a test instrument, so it lives under `__tests__` and never in a
  product path) runs the same step functions in order, in process, with
  sleeps replaced by a fake clock, so the whole intake runs in a vitest case
  against the memory store and a fake protocol 2 scanner
  (`__tests__/fake-scanner.ts`, `P12`) whose answers are the shapes pinned in
  `services/upload-scanner/__tests__/fixtures/protocol-2.json` (`P3`).
- **Database, two instruments, both required for `P2`:**
  - a live test, `apps/web/db/neon/chat-file-intakes-migration.live.test.ts`,
    on the pattern of
    `apps/web/lib/server/assistant-content-edits.concurrency.live.test.ts`:
    skipped unless `AGI_CHAT_FILE_INTAKE_TEST_DATABASE_URL` names a local
    disposable database (it refuses any other host), run against a Postgres
    where the recipe in `apps/web/db/neon/verify/README.md` has applied the
    chain through 0421. It applies 0422 in a transaction it rolls back, and
    executes the trigger, update, conversation-delete and RLS cases (the RLS
    case as `app_rls`, as the README shows). A local Postgres is therefore
    required to finish `P2`, and its passing output is recorded in the pull
    request;
  - the text test, `chat-file-intakes-migration.test.ts`, which only pins the
    26214400 literal in the SQL to the policy's `maxBytes`, as the existing
    `*-migration.test.ts` files read SQL as text.
- **Schema absent:** the fake in
  `apps/web/lib/server/chat-file-intake/__tests__/schema-absent-db.ts` (`P2`)
  answers the `to_regclass` and `information_schema.columns` probes with
  "absent" and throws on any other SQL naming `chat_file_` or
  `scanned_sha256`.
- **Clients:** the shared upload client against server fixtures with and
  without the new fields; web component tests; mobile Jest in chunks.
- **Browser, client flow only:** a Playwright spec (`P16`) against a local
  server on `localhost:3000` that stubs every server answer the large path
  needs with `page.route`: `/api/me` with an offering handshake
  (`large_files_available: true` and the large limits), the create answer, the
  parts route, the part `PUT` URLs (which the stub answers with an ETag), the
  complete answer (`202`) and the intake status answers (checking, ready,
  rejected), plus cancel and resume after a reload. No storage adapter is
  configured for it: the memory adapter cannot presign without an upload base
  URL (`packages/platform/object-storage/src/adapters/memory.ts`, `uploadUrl`),
  and a local server has no protocol 2 scanner, so it would never offer large
  files. The spec proves the client flow only. A running server cannot be
  given a fake scanner or an inline executor without a test switch in
  production code, which `AGENTS.md` section 9 forbids, so the server pipeline
  is proved by `P12`'s vitest run and, end to end, by deployment step 6 on a
  preview.

Run scoped tests and lint through `scripts/dev/light-job.sh` and anything
heavy (type checks, builds, cargo, browsers) one at a time through
`scripts/dev/heavy-job.sh`, as `CLAUDE.md` requires.

## Deployment steps, in order

Each step needs the owner's go-ahead, in his own words, in the message that
asks for it. None is implied by an earlier one, and none is part of building.
The order follows `docs/runbooks/release-rollback.md` ("Deploying by hand:
migrations first"): `deploy-production.yml` runs `pnpm db:migrate -- verify`,
which fails on a pending migration, so 0422 is applied before the first web
deploy that contains it.

0. **Gate G0, not a deployment** (`tasks.md`). No other workstream is writing
   any path in `tasks.md`, and the tree passes the mobile, shared-package and
   web typechecks and their test suites, as recorded by the person running the
   build. Nothing is committed for the gate; the packages build on the working
   tree as it is.
1. **Merge** the packages with `CHAT_LARGE_FILES_ENABLED` unset, when the owner
   asks for commits and merges. `vercel.json` sets `git.deploymentEnabled:
false` (checked on 2026-11-14), so a merge does not deploy.
2. **Local and preview-free verification** of every package's tests, the guard
   chain and `pnpm typecheck:all`, run by the engineers. Four runs are owed
   on the final tree, each one at a time through
   `scripts/dev/heavy-job.sh`:
   - the stated-maximum preparation test,
     `apps/web/lib/server/chat-file-preparation/__tests__/stated-maximum.test.ts`,
     which is skipped unless `CHAT_FILE_PREPARATION_MAX_SIZE_CHECK=1` and
     prepares each kind at its stated maximum, the 500 MiB text and CSV cases
     included;
   - a re-run of `apps/web/lib/server/chat-file-intake/__tests__/store.live.test.ts`
     and `apps/web/db/neon/chat-file-intakes-migration.live.test.ts` with
     `AGI_CHAT_FILE_INTAKE_TEST_DATABASE_URL` naming a local disposable
     database whose name ends in `_test`. Both passed on 2026-11-15 against a
     local throwaway Postgres (the migration test 9 cases, the store test 14)
     before the last edits to `store.ts`, its live test and the migration
     live test, which now holds 10 cases;
   - two overlapping `chat-large-file` creates for one person against that
     throwaway database, holding that the per-user advisory lock admits
     exactly the plan's `maxConcurrentChatFileIntakes`. The route test holds
     only that the lock statement is issued, against a fake database; no test
     takes the real lock;
   - the Playwright spec (`P16`) against a local server on `localhost:3000`.
3. **Migration 0422**, before any web deploy.
   - 0422 does not wait for the other packages. Once `P2` is merged to main,
     every production deploy through `deploy-production.yml` runs
     `pnpm db:migrate -- verify`, which fails on a pending migration, so 0422
     must be applied (with the owner's go-ahead) before the next production
     deploy of any kind, and may be applied as soon as `P2` is merged. Until
     it is applied, no production deploy is made from a main that holds `P2`.
     (Read from `docs/runbooks/release-rollback.md`; the workflow was not run.)
   - 0422 is the highest migration in `apps/web/db/neon` and 0421 the highest
     applied (`appliedThrough` 421, rechecked on 2026-11-15); recheck the
     number before applying and renumber if another migration landed.
   - Required before applying: `P2`'s live test has passed against a local
     Postgres with the full chain and its output is in the pull request, and
     the build of the tree holding `P2` is green.
   - Take the Neon backup branch the runbook asks for, then
     `pnpm db:migrate -- status` and
     `pnpm db:migrate -- apply --target production --confirm-production`.
   - In the same commit after applying: set `appliedThrough` to 422 in
     `scripts/config/production-migrations-applied.json`, record the checksum
     of `0422_chat_file_intakes.sql` in
     `scripts/config/applied-migration-checksums.json`, and delete every
     migration 422 entry from `scripts/config/migration-dependency-allowlist.json`
     (the guard calls them stale once 422 is applied).
   - Additive: two tables, one nullable column on `media_assets`, one
     insert-only trigger, RLS. The
     current production web is unaffected (`spec.md`, degradation row 20).
4. **Scanner measurement on a test app, then the production scanner.** No
   load, corpus or timing run ever targets `agiworkforce-upload-scanner`,
   which is the one machine serving every live chat upload, fail closed
   (`docs/security/upload-scanning.md`; `fly.toml` runs one machine on 2
   shared vCPUs).
   - **The test app** (owner go-ahead; a few cents): a second Fly app with
     the same image and the same `[[vm]]` block as `services/upload-scanner/fly.toml`,
     its own scanner token, `UPLOAD_SCAN_SOURCE_HOSTS` set to the staging
     bucket's S3 endpoint host, and no traffic but this step's. It is
     destroyed when step 6 ends (`fly apps destroy`), and its token is
     revoked with it. For the corpus and CPU-per-byte items only, its
     `SCAN_SOURCE_BYTES_PER_HOUR` is set high enough to admit the corpus,
     since it carries no live upload; the confirmation run uses the computed
     budget.
   - **Corpus**, through `/v2/scans` on the test app, recording time, resident
     memory, temp-disk use and `df -h /var/tmp`:
     - a 3,000-page PDF, a scanned 480 MB PDF, a 50 MiB XLSX, a 100 MiB PPTX,
       a 100 MiB DOCX, a 500 MiB CSV, and a 500 MiB text file with EICAR at
       the end;
     - whether exceeding `MaxFiles` is alerted, and which of the corpus come
       back `limits_exceeded`. Set `MaxFiles` and `MaxScanSize` from the
       result, and list in known flaws any document kind that is refused.
   - **A small legacy scan under the raised limits.** The clamd settings are
     global, so they also bind legacy `POST /scan` (`spec.md`, clamd
     settings). On the test app, with the built clamd settings, send to
     `POST /scan` a 25 MiB OOXML or archive that inflates to about 1 GiB.
     Record its CPU-seconds (the `fly_instance_cpu` delta) and whether it
     answers inside 14 s.
     - Pass: it answers inside 14 s and spends at most 7.5 CPU-seconds, one
       sixtieth of the 450 CPU-second hourly baseline, so even one such file
       a minute cannot spend the whole baseline.
     - Fail: lower `MaxScanSize`, or keep `MaxScanTime` at 120000, and
       repeat; record the chosen value and the result here. The corpus items
       above are re-checked at the lowered `MaxScanSize`.
   - **CPU per byte.** Fly's page (`https://docs.fly.io/machines/cpu-performance`,
     read on 2026-11-15) gives `shared-cpu-2x` 10 ms per 80 ms in total
     (12.5% of one core, 450 CPU-seconds an hour), a 500 s burst cap and a
     5 s balance on a new Machine.
     1. Wait until the test app's CPU balance (Fly's metrics, the balance
        panel) is full, 500 s. At idle a shared-cpu-2x Machine accrues about
        0.125 s of balance per second, so this takes about 67 minutes from
        empty.
     2. Scan each corpus file once, one at a time, and record the process
        CPU-seconds each scan used (the `fly_instance_cpu` delta over the
        scan). The largest CPU-seconds per byte across the corpus is `c`.
     3. Read, without changing anything, the production scanner's CPU use in
        its busiest hour of the last 7 days from its `fly_instance_cpu`
        metric: `L` CPU-seconds an hour.
     4. Set `SCAN_SOURCE_BYTES_PER_HOUR` to at most
        `0.5 x (450 - L) / c` bytes, and never above 2 GiB without a second
        confirmation run at the higher value. The factor of one half covers
        the at most twice the budget that an hour spanning a restart can
        admit (`spec.md`, Hourly source budget).
   - **Confirmation run**, on the test app, starting after its uptime has
     passed 60 minutes (so the restart ramp is over) and its balance is full:
     60 minutes with the budget from item 4 enforced, never raised; 500 MiB
     files submitted as fast as the budget admits (each `429` honoured); one
     legacy 25 MiB scan every 60 s.
     - Pass: every legacy scan finishes in under 10 s (the deadline is 14 s),
       `/health` answers 200 throughout, the watchdog does not restart the
       process, `fly_instance_cpu_throttle` stays at zero, and the CPU balance
       at the end is not lower than at the start.
     - Fail: halve `SCAN_SOURCE_BYTES_PER_HOUR` and repeat the confirmation
       run. Stop when the budget would fall below 524288000 bytes (one
       500 MiB file an hour): moving to `performance` CPUs or a larger VM is
       the owner's cost decision (`spec.md`, Owner decisions, H).
   - **Copy timing.** A 500 MiB CopyObject with `x-amz-copy-source-if-match`
     on the staging bucket, from a workstation with staging credentials, timed
     five times.
     - Threshold: every copy finishes inside the seal's built deadline for
       500 MiB (30 s plus 1 s per 10 MiB, 80 s).
     - If a copy is slower: set the deadline constants in
       `object-storage-timeouts.ts` to the slowest measured time plus half.
       Stop if that passes 240 s: three copies and their HEADs must fit inside
       one step function's 800 s and inside the 15-minute sealing lease
       (`spec.md`, Intake states, Leases); the fallback is a lower
       `largeFiles.maxBytes`, an owner decision (B).
   - **A deadline close.** On the test app, submit a 500 MiB scan with a
     deadline shorter than its scan time, then a small scan at once. Record
     how long clamd takes to answer the next queued scan after the scanner
     closes the abandoned stream, and whether clamd keeps scanning that
     stream until `MaxScanTime`. If it does, the next scan's wait adds to
     legacy latency; record it here and lower `MaxScanTime` if a legacy scan
     would pass 14 s.
   - **Download content type.** On the staging bucket, put a `text/html`
     object, presign a GET for it with
     `response-content-type=application/octet-stream`, and record the
     `Content-Type` the GET returns. Pass: `application/octet-stream`. Fail:
     record it in known flaws; step 7 waits for the owner's decision, since a
     browser could then render a stored HTML file from the storage host
     (`spec.md`, Downloads).
   - Set `SCAN_BASE_MS` and `SCAN_MIN_BYTES_PER_SEC` from the corpus times.
     The web reads the resulting deadline from `deadlineMs` in the scanner's
     answers, so no web value changes with them.
     Keep the test app, with the measured values, for step 6, and destroy it
     when step 6 ends.
   - **Production scanner.** Set `UPLOAD_SCAN_SOURCE_HOSTS` (the production
     storage S3 endpoint host), `MAX_SOURCE_SCAN_BYTES`,
     `SCAN_SOURCE_CONCURRENCY`, `SCAN_QUEUE_MAX`, the measured
     `SCAN_SOURCE_BYTES_PER_HOUR`, `SCAN_BASE_MS` and `SCAN_MIN_BYTES_PER_SEC`,
     then `fly deploy`. The deploy stays bluegreen, with no volume. The
     current web never calls `/v2` (row 6), and the new Machine admits no
     source bytes in its first minutes (the restart ramp). Verify only:
     authorized `/v2/capability` reports protocol 2; `/health` and
     `/health/signatures` are 200; legacy EICAR is still detected. No load is
     run.
   - Until the confirmation run and the copy timing pass, step 7 is not taken:
     large files stay off in production. The code's correctness does not
     depend on these numbers (a copy that outlives its deadline is decided by
     the HEAD of the sealed key, at most 3 copies; admission never passes the
     configured budget), but whether the budget is low enough for legacy scans
     is exactly what the confirmation run proves, so nothing large is admitted
     in production before it passes.
5. **Web deploy, flag unset: the rollback floor.** First confirm the memory and
   maxDuration the Workflow step functions get. The deployed build contains
   `P1`; the database has 0422 and the scanner speaks protocol 2, but the flag
   is unset, so readiness stops at its first check and behaviour is identical
   to today. The `sweep-chat-file-intakes` cron takes effect and finds no rows.
   - Record the deployment id here under Rollback floor, and write it with
     its creation time to `scripts/config/rollback-floor.json` (`P20`), a
     file changed at deployment like the 0422 bookkeeping. From then on
     `scripts/release/rollback.mjs` refuses any older target.
   - From step 6 on, no web rollback may target an older deployment.
6. **Preview with the flag on.**
   - Storage: a CORS rule on the staging bucket allowing PUT from the preview
     origin (parts), and `UPLOAD_STORAGE_CORS_ORIGINS` set to that origin on
     the preview environment only. Without both, the preview relays and is
     never offered large files (`spec.md`, row 19). No GET rule is needed:
     only a browser navigation is redirected to storage, never a fetch
     (`spec.md`, Downloads).
   - The preview's database needs 0422 too.
   - Scanner: the preview environment's scanner URL and token point at the
     step 4 test app, never at the production scanner, so no preview corpus
     reaches the machine that serves live uploads, and the test app's
     `UPLOAD_SCAN_SOURCE_HOSTS` already names the staging bucket host.
   - Checks: upload, cancel, resume after a reload, EICAR rejection, the step 4
     corpus, a 1,240-page PDF in a turn, a 300 MB CSV staged in the sandbox
     (record the sandbox template's envd version, memory and disk, and the
     staging time against the route's 300 s), a download redirect for a
     navigation in Chrome and Safari, the Library's download button saving the
     same file through an anchor download (a `302` to storage) in Chrome,
     Firefox, Safari and the Electron window, adding it from the Library page (Use in chat, remix, Add to project) showing
     the too-large message while the composer's Files menu shows the generic
     could-not-be-added copy, and the
     Playwright spec against the preview.
   - **PDF range loading in the function runtime.** Prepare the 480 MB PDF and
     the 3,000-page PDF from the step 4 corpus with `kinds.pdf.rangeLoading`
     on. Record the bytes fetched for the first 100 pages and the step's peak
     memory.
     - Threshold: the first step fetches less than a quarter of the file and
       its peak memory stays under half the step function's memory.
     - If either fails: set `kinds.pdf.rangeLoading` to false (PDFs above
       `bufferedMaxBytes`, 200 MiB, are then not read as text and stay usable
       in the sandbox), record it in known flaws, and repeat the check with the
       200 MiB buffered path.
     - Until measured, large files stay off in production; the code is safe
       either way because both paths exist behind the switch.
   - From here on large files exist, so the rollback floor applies.
7. **Production flag on**, only after the step 4 confirmation run and copy timing
   and the step 6 range-loading check have passed. No GET CORS rule is added
   to the production bucket: a fetch never receives the redirect, and the
   installed mobile app never sends the token on a file request, so it gets
   today's `413` (`spec.md`, Downloads). Watch intake states, scan time, the
   429 rate,
   `fly_instance_cpu_throttle`, preparation failures and ledger cut-offs for a
   week.
8. **Mobile build** with `FEATURES.largeChatFiles` true: an EAS build, the
   device check (a 500 MiB upload on a real iPhone, backgrounded mid-part, on
   cellular and Wi-Fi, with cancel and a network drop; the SHA-256 time under
   Hermes; opening a 500 MiB file from a conversation and from the Library
   shows the too-large copy, holds no blob in memory, and sends no capability
   header on the file request), then store submission.
9. **Optional.** An R2 lifecycle rule aborting incomplete multipart uploads
   under `chat-attachments/` after 1 day, as a backstop to the sweeper.

Later and independent: desktop Tauri, the CLI and the extension adopt the
shared client and the token, each at its own release.

## Rollback

- Turning the flag off stops new large creates; sealed files keep the
  prepared path (`spec.md`, rule 3).
- The intake sweeper keeps running with the flag off: it is gated on the
  schema only, so intakes already in flight still finish, idle uploads are
  still cancelled and refunded, and stalled rows still end (`spec.md`,
  Lifecycle).
- A web rollback after step 5 targets the floor or later; `scripts/release/rollback.mjs`
  refuses an older target once `scripts/config/rollback-floor.json` holds the
  floor (`P20`).
- The scanner rolls back with Fly's previous release; an older scanner has no
  `/v2/capability`, so the web stops offering large files within 60 s.
- 0422 is not rolled back; it is additive and inert for older builds.

### Rollback floor

Deployment id: recorded at step 5.

## Unverified facts

- ClamAV time, memory and temp-disk use for the corpus on the current VM;
  whether INSTREAM spools to `TemporaryDirectory`; the Fly rootfs size;
  whether `MaxFiles` is alerted (step 4).
- How much CPU a 500 MiB scan uses, and so the safe hourly source budget on
  2 shared vCPUs (step 4, measured on the test app, then the confirmation run).
- Whether a Fly request can be pinned to the machine holding a scan job
  (`fly-force-instance-id`). Until it is verified the scanner runs one
  machine.
- Whether R2 honours `If-Match` sent outside the presigned signature. The
  verdict's ETag makes the design correct either way.
- How long a 500 MiB CopyObject takes on R2 (step 4, copy timing).
- Whether R2 honours `response-content-type` on a presigned GET, so a stored
  `text/html` file downloads as `application/octet-stream` (step 4, download
  content type).
- Whether clamd keeps scanning an abandoned stream after the scanner closes
  it at a deadline, and what that costs the next scan (step 4, a deadline
  close).
- Whether the per-user advisory lock admits exactly the plan's cap on a real
  Postgres: only a fake database has run it (step 2).
- Whether the in-flight cap counts one person's intakes across workspaces or
  per workspace scope. Read from the code, the count runs under row-level
  security and so is per scope; no test has run it on Postgres.
- Whether pdfjs range loading works in the function runtime, and its memory on
  pathological PDFs (step 6).
- The memory and maxDuration of this app's Workflow step functions, whether
  the project is on Pro, and the latency of Workflow runs in `iad1` to the
  database region.
- `@noble/hashes` SHA-256 throughput on web for 500 MiB, and the existing
  mobile hash under Hermes.
- Whether iOS background upload tasks keep working with 900-second part URLs.
  (Whether a native download can follow the storage redirect is not needed
  in the first version: no native client is sent it, `spec.md`, Downloads.)
- The sandbox template's envd version, memory and disk; staging throughput
  through the chat function.
- Neon storage price for keyword index rows; E2B pricing; Vercel inbound
  transfer; Fly bandwidth.
- Answer quality of card, excerpt and keyword passages against native reading
  on long documents. An evaluation set of long documents should set the
  `turnBudget` values before step 7.
- The second leader's help article (403 on 2026-11-14).

## Risks

- The keyword-only index ranks worse than hybrid search for paraphrased
  questions; the card and `open_file` remain.
- A cents cap of 10 binds hard on expensive routes: on a route priced at $15
  per million input tokens, T is about 6,700 tokens per turn.
- Office documents whose text parts exceed the archive budget, and spreadsheets
  beyond the first sheets that fit it, are read only partly.
- The hourly source budget (2 GiB until measured) admits about four 500 MiB
  files an hour across all users, and one account can take all of it (a
  per-person share is an owner decision, `spec.md` Owner decisions, P).
  Beyond it files wait in `checking`: time spent on `429 source_budget` does
  not count toward `scanGiveUpMs` up to `intake.budgetWaitMaxMs` (2 h), so a
  file ends `failed: scan_unavailable` only after more than 2 h of budget
  waits plus 30 minutes of other waiting, with the daily bytes refunded for
  at most three such failures per person a day.
- One large scan at a time means a queue at busy hours; files wait in
  `checking` (a `429` or `queued` uses no attempt) and fail only when
  `scanGiveUpMs` has passed since the first submit, with the daily bytes
  refunded within the same cap.
- After every scanner restart the hourly allowance starts at zero and returns
  over an hour, so a deploy or a watchdog restart delays a 500 MiB file by
  60 x 500 MiB / budget minutes of uptime: 14.6 minutes at 2 GiB, 29.3 at
  1 GiB, an hour at the lowest budget step 4 allows. Those files wait in
  `checking`, because the wait is a `source_budget` wait that does not count
  toward `scanGiveUpMs` up to 2 h; they end `scan_unavailable` only when the
  ramp and other files' use together hold them past that. The readiness
  answer does not reflect the wait. Small files are unaffected.
- A small history file that no longer fits the inline budget keeps today's
  `over_budget` note; it is not excerpted in the first version.
- A research turn charges the ledger once per provider call, so the planning
  call, which returns only queries, gets the largest share of file text
  (about T/2), the gathering calls T/4, T/8 and so on, and the report call
  little or none once reading closes. The report then says it rests on part
  of the files. Saving the largest share for the report call is an owner
  decision.
- A durable research run that holds a checkpoint with `toolCallIds` cannot be
  resumed by a build older than the field, because the checkpoint schema is
  strict; a web rollback across that change ends those runs.
