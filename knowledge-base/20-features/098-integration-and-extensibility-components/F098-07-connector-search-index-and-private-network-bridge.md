---
id: "F098-07"
type: "feature"
title: "Connector search index and private network bridge (not built)"
aliases: ["Connector search/index worker (S98.08)", "Private-network bridge (S98.15)", "connector content index", "private network bridge"]
area: "98 Integration and extensibility components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S98.08", "S98.15"]
depends_on: ["SYS-connectors-plugins-and-skills", "SYS-security-and-privacy", "SYS-execution-boundaries", "SYS-sync-and-continuity", "SYS-subscriptions-entitlements-and-usage", "SYS-data-model-and-migrations"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F098-07 Connector search index and private network bridge (not built)

Two planned platform pieces that do not exist yet. One would sync connector content in the background and index it for search. The other would let cloud connectors reach services on a customer's private network. The code read has neither. The brief and audit ledger both mark them missing. No app can use them.

Area: [98. Integration and extensibility components](README.md). Requirement items: [S98.08](../../10-requirements/capabilities/098-integration-and-extensibility-components.md#s9808), [S98.15](../../10-requirements/capabilities/098-integration-and-extensibility-components.md#s9815).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Nothing today. The brief says a background worker should sync and index connector content so it can be searched (S98.08), and a bridge should let cloud connectors reach services on a customer's private network (S98.15). Both are marked missing on the platform (doc: knowledge-base/data/area-briefs/098-integration-and-extensibility-components.md).

**Why it exists.** Planned so connected apps (mail, files, chat) could be searched without a live call each time, and so company-internal servers could be used by cloud connectors. No product document read explains the reason further, so the reason is unknown beyond the brief's 'Should' lines.

**Who uses it.** Nobody yet. Intended users would be people with connected accounts and organizations with internal services [inferred].

**Problems it solves**

- None today.
- Intended: searching connector content without a live call each time [inferred from S98.08].
- Intended: reaching private services from cloud connectors [inferred from S98.15].

**Use cases**

- Intended: search across a connected mail or file account from chat.
- Intended: a cloud connector reaching an internal tool server behind a company firewall.
- Today, in place of these: connectors are called live, and cloud connector endpoints that point at private or internal addresses are refused (apps/web/lib/user-connector-tools.ts:643-652).

## 2. User experience

**Where to find it**

- Not available on web, desktop, mobile, CLI, VS Code extension or Chrome extension. No screen, command or setting exists for either piece in the code read.

**Before you start**

- Not applicable. Nothing to use.

**Screens and controls**

- None found in the code. A search for connector indexing terms in apps/web/lib, apps/web/app and the database migrations found only the public connector directory refresh, which lists available servers and does not index a user's content (apps/web/lib/connectors/directory/ingest.ts:1-25).

**Journey**

1. No journey exists. A person who connects an account gets live connector calls only; the brief lists no sync step.

**What the person sees and gets**

- None. No 'last synced' time is shown: a founder decision lists 'no sync time' among connector extras that are not built (doc: docs/decisions/2026-09-27-founder-decisions.md).

**Settings**

- None found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Cloud connector endpoints are checked against an SSRF policy (a block on private and internal addresses) before the catalog is read and again at execution (apps/web/lib/user-connector-tools.ts:643-652). This is the opposite of a private-network bridge and is not part of the missing feature.

**Incomplete**

- nothing found

**Present but disconnected or switched off**

- nothing found

**Not available**

- Connector search/index worker: missing on every app (doc: knowledge-base/data/area-briefs/098-integration-and-extensibility-components.md S98.08; doc: audit/missing/098-integration-and-extensibility-components.md).
- Private-network bridge: missing on every app (same brief S98.15; same audit file; the ledger row has rollup 'missing', audit/ledger/ecosystem-capability-ledger.jsonl:3052).
- No connector content table found: no migration with an index or embedding table for connector content was found by searching apps/web/db/neon for index, embedding, ingest and crawl terms next to 'connector'.

## 4. Required behaviour

**Established requirements**

- A background worker syncs and indexes connector content so it can be searched (S98.08). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S98.08)
- A bridge lets cloud connectors reach services on a customer's private network (S98.15). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S98.15)
- Both items are planned for build wave 5, on the platform. (source: doc: audit/missing/098-integration-and-extensibility-components.md)

**Acceptance criteria**

1. When built, connector content for a connected account is indexed in the background and a search returns results without a live provider call.
2. When built, an index entry is only visible to the account that owns it.
3. When built, disconnecting a connector removes its indexed content.
4. When built, a cloud connector can reach a registered private service only through the bridge, and the existing block on private addresses stays on for every other path.
5. Until built, no app shows a control that claims either capability.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Indexed content is personal data and must follow the trust boundaries in AGENTS.md section 6: Local content never goes to a managed index without an explicit, labelled fork [inferred].
- A private-network bridge needs customer-side software or an outbound tunnel, because the cloud cannot dial into a private network [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide first whether the index is per user or per workspace, and write it as a decision record under docs/decisions before building.
- [proposed] Treat private reach as an organization admin feature with its own policy switch and audit events, like the existing plugin and connector policy gates.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | Audit worklist for missing items | `audit/missing/098-integration-and-extensibility-components.md` | Lists S98.08 and S98.15 as open, wave 5, build on platform. Does not implement them. |
| other | Capability ledger rows | `audit/ledger/ecosystem-capability-ledger.jsonl` | Rows S98.08 (line 3045) and S98.15 (line 3052) with rollup 'missing'. Does not implement them. |
| other | Area brief | `knowledge-base/data/area-briefs/098-integration-and-extensibility-components.md` | States the 'Should' lines and the 'platform missing' status. |
| service | SSRF guard on cloud connector endpoints | `apps/web/lib/user-connector-tools.ts` | Refuses connector endpoints that resolve to non-public hosts (lines 643-652, 840, 1089, 1172, 1412, 1574, 1751). Does not implement a bridge; it is the rule a bridge would have to work with. |
| job | Connector directory refresh cron | `apps/web/app/api/cron/refresh-connector-directory/route.ts` | Daily refresh of the public connector directory (schedule in vercel.json:161-163). Does not index user content. |
| service | Connector directory ingest | `apps/web/lib/connectors/directory/ingest.ts` | Builds the directory of available connector servers. Does not index user content. |
| job | Background job drain cron | `vercel.json` | Runs /api/cron/drain-background-jobs every 5 minutes (lines 149-151). A candidate host for a future sync worker; today it has no connector sync job known to this page [unknown: job list not read]. |
| service | Connector health monitor | `apps/web/lib/connectors/health.ts` | Named by the brief (S98.10, line 303) as tracking connection state. Not opened. Does not index content. |
| endpoint | Connector MCP gateway | `apps/web/app/api/connectors/[connectorId]/mcp/route.ts` | Named by the brief (S98.14, line 69). Not opened. Live proxy of connector calls, which is the path used instead of an index. |
| config | CLI private-address refusal for site rules | `apps/cli/src/permissions.rs` | Refuses ahead-of-time allow rules for private network hosts (lines 160-176). Unrelated to the bridge; shows the product treats private addresses as untrusted. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Nothing runs for these two items. A connector call today goes live: the request reaches our server, which checks the endpoint is a public host and then calls the connector provider. | our servers | apps/web/lib/user-connector-tools.ts:643-652 |
| The provider answers and the result goes back into the chat turn. No copy is kept for search. | outside service | unknown: no index store found; absence established by search of apps/web/lib, apps/web/app and apps/web/db/neon |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Indexed connector content | Does not exist | Not applicable | Not applicable |

**Models and providers.** No model or provider takes part, because the feature does not exist. A future index could use embeddings from a provider; no decision on that was found.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code (not built). |
| Permissions | none found in the code (not built). |
| Subscription | none found in the code (not built). No entitlement for indexing or private reach was found in the capability list read (packages/contracts/types/src/capabilities.ts). |
| Limits and metering | none found in the code (not built). |
| Feature flags | none found in the code (not built). |
| Model compatibility | none found in the code (not built). |
| Provider restrictions | none found in the code (not built). |
| Local mode | Not applicable. In Local mode the product has no index and no bridge. The CLI and desktop have no such feature either. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Person looks for a connector search or private network control | Not handled in the code: no control exists, so nothing is shown. | search of apps and packages found no such control |
| Cloud connector pointed at a private address | The catalog read or execution is blocked by the SSRF policy and a warning is logged. | apps/web/lib/user-connector-tools.ts:643-652 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- none found

**Test scenarios**

- **No index claim in the product**
  1. Search the web, desktop, mobile, CLI, VS Code and Chrome UI text for 'index', 'sync' and 'private network' next to connectors.
  2. Open the connectors screens on each app.
  - Expected: No control or copy promises indexing or private network reach.
- **Private endpoint is refused**
  1. Add a custom connector whose URL resolves to a private address.
  2. Open its tool list.
  - Expected: The connector shows no tools and the server logs 'remote connector endpoint blocked by SSRF policy'.
- **Worklist stays honest**
  1. Open audit/missing/098-integration-and-extensibility-components.md.
  2. After any build, check the ledger rows move from 'missing'.
  - Expected: S98.08 and S98.15 leave the missing list only with evidence recorded in the ledger.

**Where to look when it fails**

- Log line: '[user-connector] remote connector endpoint blocked by SSRF policy' (user-connector-tools.ts:648).
- No tables or error names exist for this feature.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No background sync and search index for connector content** Affects: All users of connectors on web, desktop, mobile, VS Code. Evidence: doc: knowledge-base/data/area-briefs/098-integration-and-extensibility-components.md S98.08 'platform missing'. Work needed: Decide scope and storage, build the worker as a scheduled job, add per-user isolation, deletion on disconnect, and a search entry point; add tests.
- **No private-network bridge** Affects: Organizations whose tool servers are not on the public internet. Evidence: doc: knowledge-base/data/area-briefs/098-integration-and-extensibility-components.md S98.15 'platform missing'; SSRF block at apps/web/lib/user-connector-tools.ts:643. Work needed: Design an outbound tunnel or customer-side relay, an admin policy, audit events, and keep the public-host rule for all other connectors.
- **No product document explains who needs these or whether the leaders ship them** Affects: Product planning. Evidence: search of docs/product and docs/decisions found no S98.08 or S98.15 text. Work needed: Check the leaders' current documentation (AGENTS.md section 10) and record a decision.

**Depends on**

- SYS-connectors-plugins-and-skills
- SYS-security-and-privacy
- SYS-execution-boundaries
- SYS-sync-and-continuity
- SYS-subscriptions-entitlements-and-usage
- SYS-data-model-and-migrations

## Unknown

- Whether a queue or job runner other than the cron drain is planned for the worker.
- Whether any product document outside docs/product and docs/decisions describes the intended index.
- What jobs drain-background-jobs runs (not opened).
- How apps/web/lib/connectors/health.ts and the MCP gateway route behave (named in the brief, not opened).
