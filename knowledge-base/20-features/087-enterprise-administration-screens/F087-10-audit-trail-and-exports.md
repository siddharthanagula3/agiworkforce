---
id: "F087-10"
type: "feature"
title: "Audit trail and exports"
aliases: ["Audit trail", "Audit log viewer", "Audit export", "SIEM streaming", "Export JSONL", "S87.28", "S87.29"]
area: "87 Enterprise administration screens"
available_on: ["web", "desktop"]
implementation: {web: "built", desktop: "built", mobile: "n/a", cli: "missing", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S87.28", "S87.29"]
depends_on: ["surface:web", "surface:desktop", "mode:cloud", "plan:team", "plan:team_premium", "plan:enterprise", "table:enterprise_audit_events", "table:organization_audit_destinations", "api:GET /api/settings/organization/audit", "api:GET /api/settings/organization/audit/export", "api:GET /api/cron/drain-audit-streams", "SYS-observability-and-operations", "SYS-authorization-and-workspaces", "SYS-security-and-privacy", "F087-09"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F087-10 Audit trail and exports

Admins read the workspace audit trail on the Audit page, filter by action, outcome and severity, and download a JSONL export that is recorded before it streams. An optional signed webhook delivers new events to a SIEM every 30 minutes. The screen has no date picker though the API accepts one.

Area: [87. Enterprise administration screens](README.md). Requirement items: [S87.28](../../10-requirements/capabilities/087-enterprise-administration-screens.md#s8728), [S87.29](../../10-requirements/capabilities/087-enterprise-administration-screens.md#s8729).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | not built | not built | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows administrative, policy, identity and access events for the workspace, exports them as newline-delimited JSON, and delivers batches to a customer HTTPS endpoint (WorkspaceAuditSection.tsx:153, audit/export/route.ts:45, WorkspaceAuditStreaming.tsx:239).

**Why it exists.** Security and compliance teams need evidence of who did what, and need it in their own tools.

**Who uses it.** Owners, admins and custom roles with audit.read; automation with an admin API key (audit/route.test.ts:127; compliance-caller.ts:41).

**Problems it solves**

- No record of admin changes.
- Evidence cannot leave the product.
- An export that fails midway leaving no trace.

**Use cases**

- Filter by outcome denied to review refusals.
- Export a range for an audit.
- Point the trail at a SIEM endpoint.
- Pull the export on a schedule with an API key.

## 2. User experience

**Where to find it**

- Web: Workspace console > Records > 'Audit' (/workspace/audit) (WorkspaceConsoleNav.tsx:123; audit/page.tsx:17).
- Desktop: [inferred] same hosted page (doc: AGENTS.md section 5).
- API: GET /api/settings/organization/audit and /audit/export.
- Mobile, CLI, VS Code, Chrome: none found.

**Before you start**

- Owner, admin or a role with audit.read (audit/route.ts:55-61).
- Plan team, team_premium or enterprise (team_admin) via the permission checks; exact plan gate for audit not confirmed.
- Export needs the Policy toggle 'Allow audit export' on (WorkspacePolicySection.tsx:508).

**Screens and controls**

- Header 'Audit trail' with text that entries cannot be edited or removed, and the link 'Export JSONL' (WorkspaceAuditSection.tsx:153).
- Three selects: 'Filter by action', 'Filter by outcome', 'Filter by severity'; 'Clear filters' button (167-215).
- Table columns When, Actor, Action, Resource, Surface, Outcome; note 'Showing the most recent N. Export to get every matching event.' (330).
- 'SIEM streaming' section: endpoint input, 'Pause delivery' / 'Resume delivery', 'Change endpoint', 'Rotate secret', 'Remove' (WorkspaceAuditStreaming.tsx:239-300).

**Journey**

1. Open Workspace > Audit.
2. Choose filters; the table updates.
3. Select 'Export JSONL' to download agi-audit-<workspace>-<date>.jsonl.
4. In SIEM streaming enter an HTTPS endpoint; copy the one-time signing secret.
5. Check 'Last delivered' and status text.

**What the person sees and gets**

- Empty text 'No events recorded yet' or 'No events match these filters' (WorkspaceAuditSection.tsx:220).
- Error 'The audit trail could not be loaded.' with 'Try again' (103).
- Export file is application/x-ndjson, one event per line (audit/export/route.ts:141).
- SIEM status line 'Last delivered … · Secret abcd…' (WorkspaceAuditStreaming.tsx).

**Settings**

- Policy toggle 'Allow audit export' (WorkspacePolicySection.tsx:508).
- Destination endpoint and signing secret.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- List: keyset-paged reads of enterprise_audit_events, default 50 per page, max 200, filters action, outcome, severity, resource type, actor, from, to (audit/route.ts:19-30; enterprise-audit-service.ts:6,117).
- The first page read is itself recorded as data_accessed; paging does not multiply records (audit/route.ts:86-97; audit/route.test.ts:152).
- Export: streams in batches of 500; records data_exported (success) before the stream opens and requires the workspace trail row; a denied export is also recorded; mid-stream failure errors the stream so the download is cut off (audit/export/route.ts:73-132; enterprise-audit-service.ts:10,158).
- API-key callers pass the same route and the IP allow list (compliance-caller.ts:41-68).
- Streaming: HTTPS destination, private addresses refused, secret shown once and stored sealed, batches of 100, signed, queued every 30 minutes, stops after 20 consecutive failures until re-saved (audit-streaming-service.ts:65,87,192,403; drain-audit-streams/route.ts:19-22; vercel.json:146; audit/destination/__tests__/route.test.ts:356-366).

**Incomplete**

- The screen offers no date range control: AuditQuery has from and to but no input sets them (use-settings-queries.ts:2040-2046; WorkspaceAuditSection.tsx:167-215). A range export needs the URL parameters or API key.
- The table shows only the most recent page; no 'load more' (WorkspaceAuditSection.tsx:330).
- If the audit export is switched off, the page still shows the 'Export JSONL' link and the download is refused (audit/export/route.ts:73-90).

**Present but disconnected or switched off**

- Streaming is a no-op for workspaces without a destination (audit-streaming-service.ts:555).

**Not available**

- CLI: no audit commands found.
- Mobile, VS Code, Chrome: no screen.

## 4. Required behaviour

**Established requirements**

- An admin browses the audit trail with filters (action, outcome, severity, time range) from live data. (source: brief S87.28 Should)
- An admin exports a range, can stream it to a SIEM, and the export itself is recorded. (source: brief S87.29 Should)
- The export is recorded before the file streams and a truncated download shows as a failure. (source: audit/export/route.ts:101-106,128-132)
- The audit record cannot be edited from the application. (source: audit/page.tsx:19 description)

**Acceptance criteria**

1. As admin, the Audit page lists events newest first and filtering by outcome denied shows only denied rows.
2. A plain member and a viewer receive a refusal from the audit API.
3. Export writes one JSON event per line and a data_exported row exists before the first byte.
4. With 'Allow audit export' off, export returns 403 and records a denied data_exported row.
5. If the database fails during export the download errors instead of finishing.
6. A saved SIEM destination receives signed batches; the secret is returned once and not readable afterwards.
7. An HTTP or private-address endpoint is refused.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Admins expect to choose a date range on the screen because the brief names it [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add from and to date pickers wired to the existing parameters.
- [proposed] Hide or disable Export JSONL when the export policy is off.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Audit page | `apps/web/app/workspace/audit/page.tsx` | Hosts trail, streaming and API keys |
| component | WorkspaceAuditSection | `apps/web/features/settings/sections/WorkspaceAuditSection.tsx` | Filters, table, export link |
| hook | useWorkspaceAudit | `apps/web/features/settings/hooks/use-settings-queries.ts` | Fetches page, returns null on 403 |
| component | WorkspaceAuditStreaming | `apps/web/features/workspace-console/components/WorkspaceAuditStreaming.tsx` | SIEM destination UI |
| hook | use-audit-destination | `apps/web/features/workspace-console/hooks/use-audit-destination.ts` | Destination API client |
| endpoint | GET /api/settings/organization/audit | `apps/web/app/api/settings/organization/audit/route.ts` | Filtered page, facets |
| endpoint | GET /api/settings/organization/audit/export | `apps/web/app/api/settings/organization/audit/export/route.ts` | JSONL stream with prior record |
| endpoint | /api/settings/organization/audit/destination | `apps/web/app/api/settings/organization/audit/destination/route.ts` | Create, pause, rotate, delete destination |
| service | enterprise-audit-service | `apps/web/lib/services/enterprise-audit-service.ts` | List and export iterator |
| service | audit-streaming-service | `apps/web/lib/services/audit-streaming-service.ts` | Destination store, signing, drain |
| job | drain-audit-streams cron | `apps/web/app/api/cron/drain-audit-streams/route.ts` | Queues a delivery job per destination every 30 minutes |
| service | compliance-caller | `apps/web/lib/server/compliance-caller.ts` | Member or admin API key access, IP check |
| service | recordAuditEvent | `apps/web/lib/security-audit.ts` | Writes audit rows |
| table | enterprise_audit_events | `apps/web/lib/services/enterprise-audit-service.ts` | Read model of the trail |
| table | organization_audit_destinations | `apps/web/lib/crypto/connector-secret-reseal.ts` | SIEM endpoint and sealed secret |
| event | data_exported | `apps/web/app/api/settings/organization/audit/export/route.ts` | Export record |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Admin opens Audit; browser calls the audit API with chosen filters and facets=true. | device and our servers | use-settings-queries.ts:2070-2090 |
| Server checks audit.read, validates range, reads one page, records a data_accessed row. | our servers | audit/route.ts:47-97 |
| Admin selects Export JSONL; server checks the audit_export policy, records data_exported, then streams batches. | our servers | audit/export/route.ts:73-132 |
| Every 30 minutes the cron queues one delivery job per destination; the job signs and POSTs a batch to the customer endpoint. | our servers | drain-audit-streams/route.ts:19-22; audit-streaming-service.ts:403 |
| Customer SIEM receives the signed batch. | outside service | audit-streaming-service.ts:403-500 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Audit events | enterprise audit table, written by a security-definer function | Server only | Append-only; retention rule unknown |
| Exported file | downloaded to the admin's device, not stored by the server | No | In the admin's hands |
| Destination, hash and sealed secret, delivery position | table organization_audit_destinations | Server only | Remove deletes the destination and the delivery position; the trail is kept |

**Models and providers.** No model or provider involved. The SIEM is a customer endpoint.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in workspace member with audit.read, or an admin API key. |
| Permissions | audit.read (audit/route.ts:55); export policy toggle (audit/export/route.ts:73); destination writes admin only (destination route test:306). |
| Subscription | Console needs plan:team, plan:team_premium or plan:enterprise; no audit-specific plan check confirmed. |
| Limits and metering | Page size 50 default, 200 max; export batch 500; streaming batch 100 and failure ceiling 20; cron cap 25 destinations per run. Rate limit 'settings-org'. |
| Feature flags | Redis marker for active destinations; a flag check that falls through to the database (drain-audit-streams/route.test.ts:161). |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Audit covers server-side events only; Local chats on a device create no workspace audit rows (inferred from server-written events). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | 'Loading the audit trail…' | WorkspaceAuditSection.tsx:89 |
| Error | Message and 'Try again'. | WorkspaceAuditSection.tsx:103 |
| Not an admin or personal account | Component renders nothing (null on 403). | WorkspaceAuditSection.tsx:117; use-settings-queries.ts:1715 |
| Empty | Two empty texts depending on filters. | WorkspaceAuditSection.tsx:220 |
| Export denied by policy | 403 with reason 'Audit export is turned off for this workspace.' and a denied record. | organization-policy-evaluator.ts:365-372 |
| Export fails midway | Stream errors; download is cut off. | audit/export/route.ts:128-132 |
| Trail row cannot be written | Stream never opens. | audit/export/route.test.ts:117 |
| SIEM failing | Skipped after 20 consecutive failures until saved again. | audit-streaming-service.ts:87 |
| Plan limit on exports | not handled in the code. | audit/export/route.ts |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/settings/organization/audit/__tests__/route.test.ts`: Refuses members and viewers, custom audit.read role, access recording once per first page, bad range
- `apps/web/app/api/settings/organization/audit/export/__tests__/route.test.ts`: Streams batches, record before stream, no stream when record fails, policy-off refusal, bad range
- `apps/web/lib/services/__tests__/enterprise-audit-service.test.ts`: Keyset paging, filters bound, org pinned
- `apps/web/lib/services/__tests__/audit-streaming-service.test.ts`: Signing, secret handling, private-address refusal
- `apps/web/lib/services/__tests__/audit-streaming-zero-loss.test.ts`: Streaming delivery without loss
- `apps/web/app/api/cron/drain-audit-streams/route.test.ts`: Cron auth, queue per destination
- `apps/web/app/api/settings/organization/audit/destination/__tests__/route.test.ts`: Member refusal, secret once, http refusal, pause, removal

**Test scenarios**

- **Filter**
  1. Open Audit as admin.
  2. Choose outcome denied and severity warning.
  - Expected: Only matching rows; Clear filters restores.
- **Export recorded first**
  1. Click Export JSONL.
  2. Check the trail.
  - Expected: A data_exported row with outcome success exists; file lines parse as JSON.
- **Export disabled**
  1. Turn off 'Allow audit export'.
  2. Click Export JSONL.
  - Expected: 403; a denied data_exported row.
- **Mid-export failure**
  1. Make the database fail after the first batch.
  - Expected: Download errors, not a complete-looking file.
- **SIEM delivery**
  1. Add an HTTPS test endpoint.
  2. Wait one cron run.
  - Expected: Signed batch received; status 'delivered'.
- **Date range**
  1. Call the export with from and to query parameters.
  - Expected: Only events in range; screen has no equivalent control.

**Where to look when it fails**

- Log '[audit-export] stream failed mid-export'.
- Destination columns last_status, consecutive_failures.
- Audit events data_exported, data_accessed.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/087-enterprise-administration-screens.md](../../70-qa/test-plans/web/087-enterprise-administration-screens.md)
- Desktop: [70-qa/test-plans/desktop/087-enterprise-administration-screens.md](../../70-qa/test-plans/desktop/087-enterprise-administration-screens.md)

## 10. Gaps and dependencies

- **No date range control on the Audit screen** Affects: Admins on web and desktop. Evidence: use-settings-queries.ts:2040-2046; WorkspaceAuditSection.tsx:167-215. Work needed: Add date inputs
- **No paging in the table** Affects: Admins reviewing history in the UI. Evidence: WorkspaceAuditSection.tsx:330. Work needed: Add load more using nextCursor
- **Export link shown when export is off** Affects: Admins. Evidence: WorkspaceAuditSection.tsx:141; export route refuses. Work needed: Reflect policy state
- **CLI cannot read or export audit** Affects: CLI admins. Evidence: No CLI audit code. Work needed: Decide if needed
- Not built on: CLI (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- mode:cloud
- plan:team
- plan:team_premium
- plan:enterprise
- table:enterprise_audit_events
- table:organization_audit_destinations
- api:GET /api/settings/organization/audit
- api:GET /api/settings/organization/audit/export
- api:GET /api/cron/drain-audit-streams
- SYS-observability-and-operations
- SYS-authorization-and-workspaces
- SYS-security-and-privacy
- F087-09

## Unknown

- Plan gate specific to audit read.
- Audit retention or deletion period.
- Whether the SIEM delivery proxy has a size or rate ceiling beyond batch 100.
- Desktop loading route.
- Whether an export has a size ceiling.
