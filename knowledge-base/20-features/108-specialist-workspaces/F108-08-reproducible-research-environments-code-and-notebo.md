---
id: "F108-08"
type: "feature"
title: "Reproducible research environments (code and notebooks)"
aliases: ["Notebook", "Code Interpreter", "Code session notebook", "Reproducible research environments (S108.22)", "Cloud Code notebook", "run-all"]
area: "108 Specialist workspaces"
available_on: ["web", "desktop"]
implementation: {web: "built", desktop: "built", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S108.22"]
depends_on: ["SYS-agents-tools-and-automation", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "SYS-authorization-and-workspaces", "SYS-data-model-and-migrations", "SYS-files-artifacts-and-storage", "SYS-security-and-privacy", "surface:web", "surface:desktop", "mode:cloud", "table:notebook_runs", "table:cloud_code_sessions", "api:POST /api/code/sessions/[sessionId]/notebook/execute", "api:POST /api/code/sessions/[sessionId]/notebook/run-all", "file:apps/web/lib/e2b/templates.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F108-08 Reproducible research environments (code and notebooks)

A Code session on the web can be created on the Code Interpreter image and shown as a notebook. The person edits code and markdown cells, runs one cell or all cells in a cloud sandbox, uploads and downloads files, and each run is logged with code, network policy and from-the-top flag. Desktop shows the same hosted page. Mobile and Chrome have none.

Area: [108. Specialist workspaces](README.md). Requirement items: [S108.22](../../10-requirements/capabilities/108-specialist-workspaces.md#s10822).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Runs notebook cells (python, javascript, typescript, r, java, bash) in a managed sandbox attached to a Code session, shows ordered outputs, and records each executed cell with a code hash so a result can be traced to code and network policy (apps/web/app/api/code/sessions/[sessionId]/notebook/execute/route.ts:30-90; packages/contracts/types/src/cloud-code.ts:449-455; apps/web/db/neon/0254_notebook_runs.sql:29-46).

**Why it exists.** Brief S108.22 wants a research environment that runs code or notebooks in a pinned environment that can be re-run to reproduce results (doc: knowledge-base/data/area-briefs/108-specialist-workspaces.md). The migration says a result left nothing behind but the browser output (0254_notebook_runs.sql header).

**Who uses it.** Analysts, students and researchers who want to run Python or other code without installing anything.

**Problems it solves**

- No local setup: the sandbox image provides Python, Jupyter, pandas, numpy and plotting (apps/web/lib/e2b/templates.ts:141-148).
- Order dependence: Run all runs every cell from the top and stops at the first failure (run-all/route.ts:216).
- Provenance: who, when, which code, which network policy (0254_notebook_runs.sql header).

**Use cases**

- Load a CSV by upload and plot it.
- Run a data-cleaning notebook top to bottom and see where it fails.
- Run a bash cell to inspect the sandbox, with network access set to none.

## 2. User experience

**Where to find it**

- Web: the Code area (apps/web/features/code/CloudCodePage.tsx); when the selected session's runtime is the Code Interpreter template the page shows a panel labelled 'Notebook' (CloudCodePage.tsx:2090, :2665; NotebookPanel.tsx:135).
- Desktop: hosted web app, same page (doc: AGENTS.md §5 'The public Desktop shows the hosted web app') [inferred for this feature].
- Mobile: not available; mobile 'notebook' code is a project knowledge-sources screen, a different thing (apps/mobile/src/features/notebook/service.ts:1-30).
- Chrome, CLI, VS Code: not available for notebooks (no notebook code found in apps/extension; surface list in brief).

**Before you start**

- Signed in on web.
- Managed Code enabled on the deployment and priceable: AGI_E2B_EXECUTION on, a sandbox provider key set and a compute rate present (apps/web/lib/e2b/gate.ts:20-27).
- Managed compute private beta not switched off (apps/web/lib/managed-compute-gate.ts:40-58; error 'Managed compute is temporarily unavailable. Use Local or BYOK in the meantime, or try again shortly.' execute/route.ts:52-56).
- A Code session created on the notebook template and in state ready (cloud-code-session-service.ts:1781-1800).

**Screens and controls**

- Toolbar buttons 'Add cell', 'Add markdown', 'Run all', 'Upload file' (NotebookPanel.tsx:145-168).
- Per-cell 'Run cell N' button and language/kind selectors (NotebookCellView.tsx:132).
- Status line under the toolbar: 'Cells build on what ran before them. Run all runs every cell from the top.' or 'Ran N cells from the top at <time>, stopped at the first error.' (NotebookPanel.tsx:182-191).
- File list with 'Download <name>' buttons (NotebookPanel.tsx:249).

**Journey**

1. Open the Code page and create a session using the Code Interpreter runtime with a network setting of none, trusted or full (full needs acknowledgement) (cloud-code-session-service.ts:714-717; templates.ts:141).
2. The Notebook panel appears once the session is ready.
3. Edit cells; press Run cell, or Shift+Enter to run and add a new cell (apps/web/e2e/notebook.spec.ts:175).
4. Or press Run all; cells run in order and stop at the first failed cell.
5. Optionally Upload file (limit 10 MB) and download generated files (cloud-code-session-service.ts:92).
6. Read outputs: text, images, tables, or error output.

**What the person sees and gets**

- Ordered cell outputs (text, image, table) and error output (e2e/notebook.spec.ts:144-164).
- Run provenance line with count and 'from the top' or 'in place'.
- Errors: 'Managed Code is not enabled for this deployment', 'Code session is busy; wait and try again', 'Closed Code sessions cannot run cells', 'Failed Code sessions must be closed and recreated', 'Managed Code environment could not be attached' (execute/route.ts:49-51; cloud-code-session-service.ts:1781-1830).
- Unconfirmed result in run-all: 'The execution result could not be confirmed. Code may have run. Check the sandbox state before running it again.' (run-all/route.ts:35-36).

**Settings**

- Session network access none/trusted/full and extra hosts (cloud-code-session-service.ts:714-717, :370).
- Optional requireNetworkAccess in a run request: a run refuses a session wider than it asked for (notebook-runs.ts:10-60).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Execute endpoint: rate limit, CSRF, deployment gate, beta gate, managed-compute access, session ownership, network policy, run, provenance write (execute/route.ts:44-90).
- Run-all endpoint: up to 100 cells, validated up front, stops at first failure, groups rows by run_id (run-all/route.ts:34, :99-100, :144, :216, :225).
- Notebook panel with cells, run, upload and download (NotebookPanel.tsx; notebook-workspace.ts).
- Provenance writer records code, SHA-256 digest, network policy, from_top, ok, error (notebook-runs.ts:70-100).
- Template list names the Code Interpreter image and is also the allowlist for client-named templates (templates.ts header comment, :141).

**Incomplete**

- 'Pinned environment' is not established: the code names a template id but no package or version capture or lock was found, so re-running reproduces the same code, not necessarily the same environment [inferred].
- Single-cell runs record cell_index 0 and from_top false regardless of position (execute/route.ts:81-95).
- Notebook cell contents are kept in an in-memory workspace; no browser-storage or server save of the notebook document was found in notebook-workspace.ts, notebook-api.ts or hooks (grep for localStorage/sessionStorage/persist found none), so cells may be lost on reload [inferred].

**Present but disconnected or switched off**

- Provenance migration 0254 header says 'NOT YET APPLIED : draft only'; whether it is applied is unknown. If not, recordNotebookRun only logs an error and the run still returns (notebook-runs.ts:70-105).
- Whole feature is off unless AGI_E2B_EXECUTION=1 with a key and a compute rate (gate.ts:20-27).

**Not available**

- Mobile and Chrome notebooks.
- Notebook cell history viewer: table exists but no reader route was found [inferred from file listing of notebook routes: execute, run-all, files only].

## 4. Required behaviour

**Established requirements**

- S108.22 Should: a research environment runs code/notebooks in a pinned environment that can be re-run to reproduce results. Brief status: web done, desktop done, mobile missing, Chrome missing. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S108.22)
- Execute checks managed compute access for the code surface and session ownership. (source: apps/web/app/api/code/sessions/[sessionId]/notebook/execute/route.ts:61-75)
- A client may only name a template present in the merged template list. (source: apps/web/lib/e2b/templates.ts header comment)
- A run may refuse a session whose network access is wider than the run requested. (source: apps/web/app/api/code/sessions/[sessionId]/notebook/lib/notebook-runs.ts:44-60)
- Managed compute is a Cloud capability; Local and own-key are the alternatives the error points to. (source: execute/route.ts:52-56)

**Acceptance criteria**

1. Run cell on a ready session returns outputs in order and an ok flag.
2. Run all with a failing second cell stops there and the response says completed false.
3. A run requesting network none against a full-network session is refused with a conflict message.
4. With the beta gate off, execute returns the 'temporarily unavailable' message.
5. A closed or failed session cannot run cells.
6. After a run, a notebook_runs row exists with code, digest and network_access (when migration applied).
7. Cell code over 50,000 characters or containing a null byte is rejected.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Reproducibility needs recorded environment versions, not just code [inferred].
- Notebook documents should survive reload [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Capture package versions per run and show a run history with a 're-run' control.
- [proposed] Persist the notebook document with the session.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST notebook execute | `apps/web/app/api/code/sessions/[sessionId]/notebook/execute/route.ts` | Runs one cell. |
| endpoint | POST notebook run-all | `apps/web/app/api/code/sessions/[sessionId]/notebook/run-all/route.ts` | Runs up to 100 cells in order. |
| endpoint | notebook files | `apps/web/app/api/code/sessions/[sessionId]/notebook/files/route.ts` | Lists, uploads and downloads sandbox files (with [...path] route). |
| service | notebook-runs | `apps/web/app/api/code/sessions/[sessionId]/notebook/lib/notebook-runs.ts` | Network policy gate and provenance insert. |
| table | notebook_runs | `apps/web/db/neon/0254_notebook_runs.sql` | One row per executed cell, row-level security by user. |
| service | cloud-code-session-service | `apps/web/lib/services/cloud-code-session-service.ts` | Session state, validateNotebookCell (:1732), runCloudCodeNotebookCell (:1767), session creation checks (:714). |
| service | E2B gate | `apps/web/lib/e2b/gate.ts` | Decides whether managed Code is provisioned. |
| service | template list | `apps/web/lib/e2b/templates.ts` | Declares the Code Interpreter image and harnesses; allowlist. |
| service | compute metering | `apps/web/lib/e2b/compute-metering.ts` | Prices sandbox time; sandboxComputeIsPriceable (:89). |
| service | managed compute access | `apps/web/lib/services/managed-compute-access.ts` | Subscription, workspace policy and spend-limit check (:177-190). |
| config | managed compute gate | `apps/web/lib/managed-compute-gate.ts` | AGI_MANAGED_COMPUTE_PRIVATE_BETA switch. |
| schema | cloud-code contracts | `packages/contracts/types/src/cloud-code.ts` | Network access values, notebook template id, cell languages. |
| screen | CloudCodePage | `apps/web/features/code/CloudCodePage.tsx` | Mounts the NotebookPanel for notebook sessions (:2090, :2665). |
| component | NotebookPanel | `apps/web/features/notebook/NotebookPanel.tsx` | Toolbar, cells, files, provenance line. |
| component | NotebookCellView | `apps/web/features/notebook/NotebookCellView.tsx` | One cell with Run cell button. |
| store | notebook workspace | `apps/web/features/notebook/services/notebook-workspace.ts` | In-memory cell state per session. |
| service | notebook api client | `apps/web/features/notebook/services/notebook-api.ts` | Calls execute, run-all and files. |
| test | notebook execute route test | `apps/web/app/api/code/sessions/[sessionId]/notebook/execute/route.test.ts` | Route behaviour. |
| test | notebook e2e | `apps/web/e2e/notebook.spec.ts` | Browser flows: run, error, Shift+Enter, upload/download, themes. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person runs a cell or Run all in the browser. | device | NotebookPanel.tsx:164; NotebookCellView.tsx:132 |
| Request reaches the server: rate limit, CSRF, deployment gate, beta gate, entitlement and workspace policy, then session lookup scoped to the owner. | our servers | execute/route.ts:44-75 |
| Server claims the session for the run, attaches the sandbox executor and calls runCode with the cell language and code. | our servers | cloud-code-session-service.ts:1781-1830 |
| The code executes in the cloud sandbox with the session's network policy. | outside service | templates.ts header (E2B templates); no local execution path in these routes |
| Server writes a notebook_runs row (best effort) and returns outputs. | our servers | notebook-runs.ts:70-105 |
| Panel renders outputs and the provenance line. | device | NotebookPanel.tsx:182-191 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Cell code, language, network policy, ok, error, from_top, run_id | table notebook_runs (migration 0254) | Server-side only | Deleted when the session is deleted (on delete cascade, 0254 header) |
| Uploaded and generated files | Sandbox file system, reachable through the files route | No | Tied to sandbox lifetime; reclaim job exists (apps/web/lib/e2b/reclaim-schedule.ts); exact retention unknown |
| Notebook cells and outputs | Browser memory (notebook-workspace.ts) | No | Lost on reload [inferred] |

**Models and providers.** No model is involved in running a cell; the sandbox provider is an outside service (E2B). The Code page can also run coding-agent harnesses in the same sandboxes (templates.ts), which use models, but notebook cells do not.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in web account; routes use a user-scoped database connection (execute/route.ts:44). |
| Permissions | Session must belong to the caller; workspace policy for resource managed_compute and feature 'code' (managed-compute-access.ts:154-175). |
| Subscription | Subscription step lets free or missing subscriptions pass; paid statuses without managed execution are refused with subscription_inactive or billing_read_only (managed-compute-access.ts:69-100). Specific plan tiers beyond that are unknown. |
| Limits and metering | Rate limit bucket 'chat-conversation' per user (execute/route.ts:45); 100 cells per run-all (run-all/route.ts:34); 50,000 characters per cell and 10 MB per upload (cloud-code-session-service.ts:91-92); sandbox time priced and held against plan windows (compute-metering.ts:89-101); spend limit check (managed-compute-access.ts:120-150). |
| Feature flags | AGI_E2B_EXECUTION, a sandbox provider key, AGI_MANAGED_COMPUTE_PRIVATE_BETA (gate.ts:20-27; managed-compute-gate.ts:40-58). |
| Model compatibility | Not applicable to cell execution. |
| Provider restrictions | Sandbox provider is a single outside service in these routes; provider-agnostic alternatives not found. |
| Local mode | No notebook execution on the device was found. The error text points to Local or own-key as alternatives, but those paths for notebooks are not in these routes (execute/route.ts:52-56). Local code sessions exist as a separate web feature (apps/web/features/code/local-code.ts) and whether they support notebooks is unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Deployment not provisioned | capabilityUnavailable 'Managed Code is not enabled for this deployment'. | execute/route.ts:49-51 |
| Beta gate off | capabilityUnavailable with Use Local or BYOK message. | execute/route.ts:52-56 |
| Session provisioning, closed or failed | Conflict errors; cannot run. | cloud-code-session-service.ts:1781-1800 |
| Session busy | 'Code session is busy; wait and try again'. | cloud-code-session-service.ts:1597 |
| Cell fails in Run all | Stops, completed false, later cells not run. | run-all/route.ts:216-225 |
| Result cannot be confirmed mid run | Cell marked failed with the unconfirmed message. | run-all/route.ts:35-36, :53-62, :165-185 |
| Provenance write fails | Result still returned; error logged. | notebook-runs.ts:96-104 |
| Offline, reload, cancel | not handled in the code for cancel or offline; reload loses in-memory cells [inferred] | not handled in the code |
| Accessibility | Panel is a labelled section; run button labelled per cell; status line is aria-live polite. | NotebookPanel.tsx:135, :180; NotebookCellView.tsx:132 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/code/sessions/[sessionId]/notebook/execute/route.test.ts`: Execute route
- `apps/web/app/api/code/sessions/[sessionId]/notebook/run-all/route.test.ts`: Run-all route
- `apps/web/app/api/code/sessions/[sessionId]/notebook/files/route.test.ts`: Files route
- `apps/web/features/notebook/__tests__/NotebookPanel.test.tsx`: Panel rendering and actions
- `apps/web/features/notebook/__tests__/notebook-workspace.test.ts`: Workspace state
- `apps/web/features/notebook/__tests__/notebook-api.test.ts`: API client
- `apps/web/e2e/notebook.spec.ts`: Browser flows (run, failure, Shift+Enter, files, themes)

**Test scenarios**

- **Run a cell**
  1. Create a Code Interpreter session with network none.
  2. Add a cell printing 1+1.
  3. Press Run cell 1.
  - Expected: Output '2' and a notebook_runs row if migration 0254 is applied.
- **Run all stops on error**
  1. Create three cells; make the second raise an error.
  2. Press Run all.
  - Expected: Cells 1 and 2 show results; cell 3 not run; status says stopped at the first error.
- **Network policy gate**
  1. Create a session with full network.
  2. POST execute with requireNetworkAccess 'none'.
  - Expected: Conflict naming both network levels.
- **Gate off**
  1. Set the beta env to off on a test deployment.
  2. Run a cell.
  - Expected: 'Managed compute is temporarily unavailable...' message.
- **Reload**
  1. Add cells, run, reload the page.
  - Expected: Observe whether cells persist (current expectation: not).
- **Mobile and Chrome**
  1. Look for a notebook or Code Interpreter control.
  - Expected: None.

**Where to look when it fails**

- Log line 'Notebook run provenance could not be recorded' (notebook-runs.ts:98).
- Table public.notebook_runs by session_id and run_id.
- Error text 'Managed Code environment could not be attached' (cloud-code-session-service.ts:1664).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/108-specialist-workspaces.md](../../70-qa/test-plans/web/108-specialist-workspaces.md)
- Desktop: [70-qa/test-plans/desktop/108-specialist-workspaces.md](../../70-qa/test-plans/desktop/108-specialist-workspaces.md)

## 10. Gaps and dependencies

- **No environment pinning or version capture.** Affects: Web and desktop users expecting reproducible results.. Evidence: No package-version capture found in notebook-runs.ts or templates.ts. Work needed: Record image version and installed packages per run; allow re-run against the same.
- **Notebook document not persisted.** Affects: Web and desktop.. Evidence: No storage call found in features/notebook services. Work needed: Persist cells and outputs with the session.
- **Migration 0254 and 0247 headers say not applied.** Affects: Provenance in production.. Evidence: 0254_notebook_runs.sql:4. Work needed: Confirm applied state with the migration status command.
- **No run-history reader.** Affects: All apps.. Evidence: Notebook routes list only execute, run-all, files. Work needed: Add a read route and view.
- **Mobile and Chrome absent.** Affects: Mobile, Chrome.. Evidence: Brief; no notebook code in those apps. Work needed: Decide whether they open the web notebook or get their own view.
- Not built on: Mobile, Chrome (from the capability ledger).

**Depends on**

- SYS-agents-tools-and-automation
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- SYS-authorization-and-workspaces
- SYS-data-model-and-migrations
- SYS-files-artifacts-and-storage
- SYS-security-and-privacy
- surface:web
- surface:desktop
- mode:cloud
- table:notebook_runs
- table:cloud_code_sessions
- api:POST /api/code/sessions/[sessionId]/notebook/execute
- api:POST /api/code/sessions/[sessionId]/notebook/run-all
- file:apps/web/lib/e2b/templates.ts

## Unknown

- Whether migration 0254 is applied in production.
- Whether Free accounts can create Code Interpreter sessions end to end (session creation and plan limits not read).
- Which plan windows apply to sandbox time.
- Whether notebooks work in desktop's Electron window beyond the hosted page.
- Whether Local code sessions can run notebooks.
- Retention of sandbox files.
