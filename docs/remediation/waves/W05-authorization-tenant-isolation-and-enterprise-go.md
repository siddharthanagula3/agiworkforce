# W5 — Authorization, tenant isolation and enterprise governance controls

[← all waves](../WAVES.md) · [register index](../README.md)

**Why now.** The previous waves stop outsiders; this one stops the wrong insider. Every item is stored policy that has no enforcement point: connector per-tool permissions and granted scopes (SEC-06 and CONN-06 are the same defect), incomplete RLS with no CI guard forcing an isolation decision on new tables, four hardcoded roles duplicated across TypeScript and raw SQL with no single evaluator, SSO/SCIM group→role mapping that is never persisted, and legacy objects still at permanent unauthenticated URLs (SEC-08/DPDP-28 filed twice). These all resolve into one policy evaluator plus one isolation guard, so they must be planned together or the same predicate gets rewritten five more times. Admin console, audit export/SIEM, moderation review state and procurement evidence sit here because they are the read and review side of the same authorization model, and the enterprise governance deferrals (DPDP-34, SEC-55) need an explicit recorded decision rather than silent absence.

**Size.** 31 items (2 critical, 13 high, 12 medium, 4 low); 26 open.

**Done when.** One policy evaluator answers every owner/admin and per-tool authorization question; no hand-written role predicate remains in TypeScript or raw SQL, proven by a grep guard. Connector per-tool permission level, granted scopes, risk class and org browse-domain policy are checked server-side before execution, with a denial test per level. RLS is enabled on every tenant/user-owned table and a CI guard fails when a new table lands without an explicit isolation decision. Legacy uploaded/generated objects and avatars are behind authorized access or migrated per a recorded founder decision, with an orphan-presign lifecycle job running. SSO group→role mapping persists and is applied at sign-in against a live instance; domain verification fails closed; connections are tenant-scoped. Audit events are exportable and deliverable to a SIEM with trace correlation, and the org audit route has at least one real client. Moderation has per-org thresholds, an appeal/review state machine, audit events, and mobile/web reports route to a named human queue. Published security-control claims are generated from control state, and deferred enterprise controls are recorded as dated decisions with owners.

| ID                    | Sev      | Item                                                                                                                                                                                                                                   | Effort |
| --------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| [DPDP-28](#dpdp-28)   | CRITICAL | Legacy uploads, avatars and pre-change generated media remain at permanent unauthenticated URLs with no orphan-upload lifecycle                                                                                                        | L      |
| [SEC-89](#sec-89)     | CRITICAL | delete_user_data(text) is SECURITY DEFINER with EXECUTE still open to public, so any grantee can purge any user's audit rows by passing their id                                                                                       | S      |
| [AI-42](#ai-42)       | HIGH     | Workspace/organization model-access policy is defined in two separate contract layers and enforced nowhere                                                                                                                             | L      |
| [CONN-06](#conn-06)   | HIGH     | Per-tool connector permission levels are never enforced server-side; scopes and risk class are display-only                                                                                                                            | L      |
| [CONN-28](#conn-28)   | HIGH     | Connector browse/connect/add/disconnect is implemented twice, has already drifted three ways, and a security hardening fix was not propagated to the second copy                                                                       | L      |
| [DPDP-30](#dpdp-30)   | HIGH     | Zero-data-retention is not proven as an enforceable capability and secret scanning runs only at support handoff                                                                                                                        | L      |
| [DPDP-32](#dpdp-32)   | HIGH     | Enterprise SSO is marketed as supporting SAML/OIDC but has never been verified against a live instance, and connections are instance-level rather than tenant-scoped                                                                   | XL     |
| [DPDP-34](#dpdp-34)   | HIGH     | Enterprise data-governance controls — legal hold, retention, residency, DLP, eDiscovery, CMEK, IP allowlist, compliance export, org analytics and tenancy — are entirely absent and deliberately deferred                              | XL     |
| [INFRA-35](#infra-35) | HIGH     | No tenant isolation strategy, no database capacity testing, and no storage or transfer quotas                                                                                                                                          | XL     |
| [SEC-06](#sec-06)     | HIGH     | Stored security policy is display-only — connector per-tool permissions, granted scopes, risk class, org browse-domain policy and tenant restrictions have no enforcement point                                                        | XL     |
| [SEC-07](#sec-07)     | HIGH     | Row-level security coverage is incomplete across tenant/user-owned tables and no CI guard forces an isolation decision on new ones                                                                                                     | L      |
| [SEC-08](#sec-08)     | HIGH     | Legacy uploaded and generated files remain at permanent unauthenticated URLs; avatar/public-media policy and orphan-presign lifecycle are undecided                                                                                    | L      |
| [SEC-51](#sec-51)     | HIGH     | SSO/SCIM identity lifecycle is incomplete: group→role mapping is never persisted, directory sync has no storage, domain verification fails open to disabled                                                                            | XL     |
| [SEC-71](#sec-71)     | HIGH     | Workspace/org model-access policy and the whole enterprise local-policy runtime (MDM, managed overrides, model restrictions, defaults push) are defined in contract layers with no loader, precedence resolver or enforcement consumer | L      |
| [SEC-88](#sec-88)     | HIGH     | A blanket GRANT on all public-schema tables can silently re-grant UPDATE/DELETE on security_audit_logs to app_rls, undoing audit-log immutability with no failing test                                                                 | M      |
| [CONN-20](#conn-20)   | MEDIUM   | No enforced org/tenant governance policy for skills or plugins                                                                                                                                                                         | L      |
| [DPDP-31](#dpdp-31)   | MEDIUM   | Mobile content reports have an intake endpoint but nothing routes them to a human reviewer                                                                                                                                             | M      |
| [DPDP-39](#dpdp-39)   | MEDIUM   | Enterprise/SSO/SCIM/Compliance-API depth was never audited: no domain-enterprise pass exists and nobody traced what writes or reads enterprise*audit_events or directory_sync*\*                                                       | L      |
| [MOB-27](#mob-27)     | MEDIUM   | Mobile content reports have an intake endpoint but no moderation workflow or reviewer UI                                                                                                                                               | M      |
| [SEC-52](#sec-52)     | MEDIUM   | Authorization is four hardcoded roles in SQL and TypeScript with no extensible RBAC/ABAC, groups, delegated admin, service accounts or break-glass                                                                                     | XL     |
| [SEC-53](#sec-53)     | MEDIUM   | Admin console is a readiness dashboard, not an authoritative control plane                                                                                                                                                             | L      |
| [SEC-54](#sec-54)     | MEDIUM   | Audit export, SIEM delivery and trace correlation are effectively absent; the org audit route has zero clients                                                                                                                         | L      |
| [SEC-55](#sec-55)     | MEDIUM   | Enterprise encryption and network controls are absent: CMEK/BYOK, key rotation, private endpoint/VPC, IP allowlist                                                                                                                     | XL     |
| [SEC-56](#sec-56)     | MEDIUM   | Procurement security evidence is essentially missing and published security-control claims are not derived from actual control state                                                                                                   | L      |
| [SEC-57](#sec-57)     | MEDIUM   | owner/admin authorization predicate is hand-written across TypeScript and raw SQL rather than one policy evaluator                                                                                                                     | M      |
| [SEC-65](#sec-65)     | MEDIUM   | Moderation has a scored platform classifier but no per-organization thresholds, appeal/review state, audit events or evaluation sets                                                                                                   | L      |
| [SEC-75](#sec-75)     | MEDIUM   | No enforced organization/tenant governance policy for skills or plugins — policy labels are duplicated and nothing scopes install or execution to a tenant                                                                             | L      |
| [INFRA-53](#infra-53) | LOW      | Enterprise-Local licensing verification is fully built twice (TypeScript + Rust), wired into nothing, with no fixture-replay parity test between the two                                                                               | M      |
| [SEC-77](#sec-77)     | LOW      | No account-wide default-approval policy for installed plugin/tool actions                                                                                                                                                              | M      |
| [SEC-85](#sec-85)     | LOW      | No scoped, per-session authorization tokens — only developer API keys carry scopes                                                                                                                                                     | L      |
| [SEC-96](#sec-96)     | LOW      | Chrome extension site allowlist has no default-permission policy, only a static list                                                                                                                                                   | S      |

---

### DPDP-28 — Legacy uploads, avatars and pre-change generated media remain at permanent unauthenticated URLs with no orphan-upload lifecycle

`CRITICAL` · compliance/dpdp · effort L · **in-progress**

**What.** Partially remediated in source on 2026-08-13: chat attachments and project knowledge now presign into the private R2 bucket with opaque keys, are scanned before registration, and gate read and delete by owner; new generated media writes owner-hashed private keys behind /api/files/{id}. Still open: legacy public rows keep an explicit fallback, avatars still upload directly to the public bucket with a permanent URL, legacy generated objects created before the change retain public locations, and no pending-upload cleanup lifecycle is approved — so an abandoned presign can create an untracked object that account erasure cannot find. The privacy policy itself still states anyone with the link can open a legacy file without signing in.

**Done when.** Founder picks an avatar policy (private-by-default recommended), approves a bounded pending-upload cleanup lifecycle and a legacy migration window; then migrate legacy public objects, remove the public fallback, and update the privacy policy statement.

**Where.** `apps/web/app/api/files/[id]/route.ts`, `apps/web/app/api/uploads/presign/route.ts`

**Blocked by.** Founder decision on avatar policy and the legacy migration/retention window

**From.** ExecutionPlan.md #89; FoundersAssistance.md #20

**Folded in.** Uploaded and generated files live at permanent unauthenticated URLs; Ratify the remaining public-media and orphan-upload policy

### SEC-89 — delete_user_data(text) is SECURITY DEFINER with EXECUTE still open to public, so any grantee can purge any user's audit rows by passing their id

`CRITICAL` · security/auth · effort S

**What.** AUDIT-IMMUT-01 residue (2), recorded in docs/agent-context/risk-map.json under enterprise-control-plane: 'delete_user_data(text) is now SECURITY DEFINER with EXECUTE still open to public, so any grantee can purge any user's audit rows by p_user_id until EXECUTE is narrowed to the GDPR job role.' The SECURITY DEFINER conversion was made deliberately so 90-day retention and GDPR erasure still purge after the immutability REVOKE, but the EXECUTE grant was never narrowed — the immutability control and the erasure path now cancel each other out.

**Done when.** Narrow EXECUTE on delete_user_data(text) from public to the dedicated GDPR job role only, and add a test asserting a non-privileged role cannot call it.

**Where.** `apps/web/db/neon/0020_functions.sql`, `apps/web/db/neon/0043_audit_log_immutability.sql`

**From.** docs/agent-context/risk-map.json (enterprise-control-plane, AUDIT-IMMUT-01 residue 2)

### AI-42 — Workspace/organization model-access policy is defined in two separate contract layers and enforced nowhere

`HIGH` · ai-routing · effort L

**What.** MODELS-002. ProviderPolicy { allowedModels; blockedModels } (packages/contracts/types/src/enterprise/index.ts:61-70,286) has zero consumers repo-wide. packages/contracts/licensing/src/org-policy.ts:1-22's own file header states it 'is not wired into any surface's enforcement path'. The only enterprise admin console (AdminConsolePage.tsx, 336 lines) has zero mentions of 'model'. An org admin cannot restrict which models members select. Distinct from SEC-06, which covers connector/tool/browse-domain policy.

**Done when.** Pick ProviderPolicy as authoritative, add an admin-console route to read/write it, enforce it in request-processor.ts's existing tier-gate call site, and reflect a blocked model as a locked row in ComposerFooter.tsx.

**Where.** `packages/contracts/types/src/enterprise/index.ts:61-70,286`, `packages/contracts/licensing/src/org-policy.ts:1-22`, `apps/web/features/admin/pages/AdminConsolePage.tsx:1-336`

**From.** audit/parity-2026-08-15/gaps/domain-models.json MODELS-002

### CONN-06 — Per-tool connector permission levels are never enforced server-side; scopes and risk class are display-only

`HIGH` · integrations · effort L

**What.** Per-tool allow/ask/block permission levels are never read at tool-execution time — server gating is a single coarse binary (manual vs auto) — and the connector_tool_permissions table has no live reader or writer. Independently confirmed: grantedScopes flows registry→API→UI but no call site consults it before executing a connector tool, and riskClass is only ever rendered as prose. The connector permission panel is unmounted with mismatched keys, there is no audit or provenance strip for connector reads and writes, and no revocation, schema-change or tool-poisoning tests exist. Related: CAP-019's organization browse-domain policy exists only as a settings-API schema field with no enforcing consumer.

Also recorded by a later audit (Per-tool connector permissions — only GitHub is wired, the general case is deferred (wire-or-cut, Wave 2 late web items)): Adds the honest-copy defect and the blocking reason. Disconnect copy told users their saved per-tool permissions were deleted while no UI existed to save any. Only GitHub is mounted; every other connector's tool list is capability prose with no backing tool, and a static config cannot mirror runtime-discovered tools — so the general case stays deferred behind a live per-connector tool-catalog endpoint that does not exist. That endpoint is the real prerequisite for CONN-06's server-side enforcement.

**Done when.** Read connector_tool_permissions, grantedScopes and riskClass in one policy decision at tool-execution time, mount the permission panel against the same keys, and add revocation/schema-change/tool-poisoning tests.

**Where.** `packages/ui/unified-chat/src/lib/connectorPermissionStore.ts`, `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts`, `apps/web/features/connectors/pages/ConnectorsPage.tsx:503,712`, `apps/web/app/api/settings/organization/route.ts:66`

**From.** docs/agent-context/known-flaws.md (CONNECTOR-PERMISSIONS-CLIENT-ONLY-01); docs/agent-context/phase4-capability-audit.md (PP-16); AuditRemediationLedger.md (PP-16); audit/capability-gaps.csv (CAP-019); audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** Connector grantedScopes and riskClass are display-only; CAP-019: Organization browse-domain policy persisted but never enforced; PP-16: connector permission panel unmounted with mismatched keys

### CONN-28 — Connector browse/connect/add/disconnect is implemented twice, has already drifted three ways, and a security hardening fix was not propagated to the second copy

`HIGH` · integrations · effort L

**What.** duplication/extension-surfaces.md §2.1. The modal's ConnectorsPanel (SettingsModal.tsx:1028-1239) is what >99% of real usage hits; ConnectorsPage.tsx only renders for signed-out visitors and the Clerk-loading window. Proven drift: (1) disconnect confirmation exists only in ConnectorsPage's copy — the modal's handleDisconnect fires with zero confirmation; (2) the new raw-JSON MCP import parity feature (agentic-modes-gap-14, marked shipped) was added exclusively to ConnectorsPage.tsx, the copy signed-in users never see; (3) the CONNECTOR-FORM-PASSWORD-AUTOFILL-01 hardening (autoComplete='new-password' plus data-1p-ignore/lpignore/bwignore on the bearer-token input, which prevents a password manager autofilling the user's real account password into 'Bearer token' and transmitting it to an arbitrary third-party MCP server) exists only on the modal's AddCustomConnectorForm; ConnectorsPage.tsx's InspectMcpServerDialog auth-token field (lines 328,335-341) has none of it and is unreachable only by routing accident.

**Done when.** Port the autoComplete/data-\* hardening onto ConnectorsPage.tsx's auth-token field immediately, independent of consolidation. Then make the modal's ConnectorsPanel/AddCustomConnectorForm canonical: render it from ConnectorsPage.tsx in a logged-out-safe mode or strip that page to non-interactive marketing content, and move the JSON-import feature into the modal.

**Where.** `apps/web/features/connectors/pages/ConnectorsPage.tsx:328,335-341,767-795,1190-1203`, `packages/ui/ui/src/settings-modal/SettingsModal.tsx:1028-1239,392-395,1339`

**From.** audit/competitive-gap-2026-08-15/duplication/extension-surfaces.md §2.1; audit/competitive-gap-2026-08-15/duplication/all-axes.json#extension-surfaces[0]

**Folded in.** extension-surfaces[0]; CONNECTOR-FORM-PASSWORD-AUTOFILL-01

### DPDP-30 — Zero-data-retention is not proven as an enforceable capability and secret scanning runs only at support handoff

`HIGH` · compliance/dpdp · effort L

**What.** PP-26: zero-data-retention is not proven as an enforceable provider or plan capability; secret scanning runs only at support handoff rather than before ordinary chat and tool sends; and there are no user-visible new-device, session or anomaly alerts. Related: the desktop support-bundle redaction default (no conversation content) is unverified — 32 desktop modules reference the diagnostics machinery but nothing proves the generated bundle excludes message text.

Also recorded by a later audit (Pre-send secret warning — pasted API keys produced no signal): wire-or-cut.md#2026-08-06 partially closes the register's 'secret scanning runs only at support handoff' clause: secret-patterns was wired only into the support-handoff transcript, and ChatComposerNew.handleSubmit now runs containsSecrets on outgoing text and surfaces a non-blocking warning. The zero-data-retention half of DPDP-30 (not proven as an enforceable capability) is untouched, and coverage on non-web composers was not established.

**Done when.** Establish whether ZDR is contractually available per provider and plan and enforce it in routing; move secret scanning ahead of ordinary sends; add user-visible device and session alerts; and add one test asserting the support bundle contains no message text.

**From.** AuditRemediationLedger.md PP-26; AuditRemediationLedger.md REL-010; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** Privacy/security UX: ZDR enforceability, secret scanning coverage, anomaly alerts; Support-bundle redaction default (no conversation content) is unverified

### DPDP-32 — Enterprise SSO is marketed as supporting SAML/OIDC but has never been verified against a live instance, and connections are instance-level rather than tenant-scoped

`HIGH` · compliance/dpdp · effort XL

**What.** Clerk enterprise connections require a paid plan with the Enhanced Authentication add-on; the SDK surface exists but no connection has ever been created against the real instance and this deployment's entitlement is unconfirmed. The code degrades honestly (503 not_entitled) but the marketing claim naming Okta, Azure AD and Google Workspace must not be described as verified. Separately, this deployment does not use Clerk Organizations, so enterprise SSO connections route every sign-in on a matching email domain instance-wide, making DNS TXT domain verification a hard security precondition rather than a formality. SCIM group-to-role mapping is permanently null (mapped_role is read but never written), no tenant-wide RLS, invitation delivery, seat enforcement or multi-org tenancy exists. The underlying SSO/SCIM migrations and identity modules do exist, so this is unproven rather than absent; the schema and RBAC halves have their primary home in the security slice.

**Done when.** Founder confirms or upgrades the Clerk plan; create one real connection end to end; adopt Clerk Organizations so connections scope by organizationId; write mapped_role on the SCIM provisioning path; and keep the marketing claim qualified until a live connection exists.

**Where.** `apps/web/lib/server/scim/scim-provisioning-service.ts:416-425`, `apps/web/db/neon/0083_sso_connections_clerk_link.sql`

**Blocked by.** Founder must confirm or upgrade the Clerk plan with the Enhanced Authentication add-on

**From.** docs/agent-context/known-flaws.md 2026-08-04 enterprise identity narrative; docs/agent-context/phase4-capability-audit.md PP-27; audit/capability-gaps.csv CAP-028; AuditRemediationLedger.md CRIT-010

**Folded in.** Enterprise SSO unverified against a live Clerk instance; Enterprise SSO connections are instance-level, not tenant-scoped; Enterprise identity/tenancy: no SCIM, no tenant-wide RLS, no invitation delivery, no licensed-seat enforcement; SCIM group→role mapping is permanently null; First-party SAML and SCIM (SAMLSSO)

### DPDP-34 — Enterprise data-governance controls — legal hold, retention, residency, DLP, eDiscovery, CMEK, IP allowlist, compliance export, org analytics and tenancy — are entirely absent and deliberately deferred

`HIGH` · compliance/dpdp · effort XL

**What.** ENT-005 (triaged 2026-08-09): zero migrations mention legal hold; retention, residency, DLP and eDiscovery are likewise absent. ENT-006: zero migrations mention CMEK/BYOK encryption or IP allowlists. The capability ledger records the same set as deferred rows — CAP-001 customer-managed encryption keys, CAP-004 organization IP allowlist, CAP-012 regional residency and EU inference, CAP-014 organization usage analytics, CAP-017 compliance export API, CAP-025 organization feature enablement, CAP-030 enforced tenant restrictions (stored policies are not consumed on sync, compute, provider or connector paths) and CAP-034 workspace/organization switcher. gap-audit §6 groups them as one enterprise-procurement program, explicitly not public-alpha blockers. PP-27 records the same list plus org-wide audit, billing, IP allowlist, legal hold and SIEM as not committed or built. The encryption and RBAC portions overlap the security slice.

Also recorded by a later audit (Enterprise (org policy, audit, SSO/SCIM, connector policy, managed-credit ledger, support workflow) — Partial/Gated): docs/current/parity-implementation-matrix.md#Billing, Usage, Waitlist — Enterprise row confirms the register's 'entirely absent and deliberately deferred' status from a second independent document, and links it to the still-unenforced SSO/SCIM (SEC-51) and MDM local-policy (SEC-71) gaps.

Also recorded by a later audit (Build the FULL compliance set (legal hold, retention, residency, DLP, eDiscovery, CMEK/BYOK encryption, IP allowlists) — currently zero migrations back any of it): docs/agent-context/HANDOFF.md §3 founder decision #3 upgrades DPDP-34 from 'deliberately deferred' to a founder-approved build with a hard evidence statement: 'Currently **zero migrations** back any of it.' Each capability should be tracked as its own gap until a migration exists. Also overlaps SEC-55 (CMEK/BYOK, key rotation, private endpoint/VPC, IP allowlist).

**Done when.** Treat as one scoped enterprise-compliance program with a committed customer requirement behind it, rather than piecemeal capability rows; sequence residency and retention first since they are the ones current legal copy comes closest to implying.

**Blocked by.** Product decision — deferred until enterprise launch requirements demand them

**From.** AuditRemediationLedger.md ENT-005; AuditRemediationLedger.md ENT-006; AuditRemediationLedger.md PP-27; audit/capability-gaps.csv CAP-001; audit/capability-gaps.csv CAP-004; audit/capability-gaps.csv CAP-012; audit/capability-gaps.csv CAP-014; audit/capability-gaps.csv CAP-017; audit/capability-gaps.csv CAP-025; audit/capability-gaps.csv CAP-030; audit/capability-gaps.csv CAP-034; gap-audit-2026-08-08.md §6; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** Data controls (legal hold, retention, residency, DLP, eDiscovery) are entirely absent; Encryption/networking controls (CMEK/BYOK, key rotation, private endpoint/VPC/IP allowlist) are absent; Customer-managed encryption keys (CMEK); Organization IP allowlist (IPAllowlist); Regional residency and EU inference; Organization usage analytics (AGIworkAnalytics); Compliance export API (ComplianceAPI); Organization feature enablement; Enforced tenant restrictions (TenantRestrictions); Workspace and organization switcher; Enterprise sale blockers remain intentionally deferred

### INFRA-35 — No tenant isolation strategy, no database capacity testing, and no storage or transfer quotas

`HIGH` · infra/ci · effort XL

**What.** SCALE-GROW-005: no routing, noisy-neighbour limits, backup/restore or tenant-move strategy is defined. SCALE-GROW-006: Neon/Postgres is the stateful bottleneck but connection limits, transaction contention, hot rows, RLS overhead, indexes and failover are untested at capacity — and INFRA-27 records that the RLS adapter cost 6 round trips per user-scoped read, so RLS overhead is a live concern rather than a theoretical one. SCALE-GROW-007: no storage or transfer quotas exist per user, project or org, and there is no deterministic cleanup or user-visible quota state. GAP-P1-010's sibling finding and known-flaws' account-storage row confirm the user-facing half: the product states plainly that the account publishes no file-storage byte quota.

**Done when.** Tenant isolation, capacity limits and per-tenant storage and transfer quotas are defined and load-tested, with a documented backup, restore and tenant-move path.

**From.** AuditRemediationLedger.md; ui-gaps.md

**Folded in.** SCALE-GROW-005 No tenant/cell isolation strategy; SCALE-GROW-006 Neon/Postgres not capacity-tested; SCALE-GROW-007 No storage/transfer quotas; GAP-043 account storage quota totals absent

### SEC-06 — Stored security policy is display-only — connector per-tool permissions, granted scopes, risk class, org browse-domain policy and tenant restrictions have no enforcement point

`HIGH` · security · effort XL

**What.** known-flaws CONNECTOR-PERMISSIONS-CLIENT-ONLY-01: per-tool allow/ask/block levels are never read at tool-execution time; server gating is a single coarse binary (manual vs auto) and `connector_tool_permissions` has no live reader or writer. phase4 PP-16 (verified): `grantedScopes` flows registry→API→UI but no call site consults it before executing a connector tool, and `riskClass` is only ever rendered as prose. CAP-019 (verified still present): `allowedDomains` exists only as a settings-API schema field and a desktop settings-store passthrough; no browse/fetch tool path consumes it. CAP-030: stored tenant restrictions are not consumed on sync/compute/provider/connector paths. phase4 PP-27: the org policy tables (AdminPolicy/ProviderPolicy/ConnectorPolicy/RetentionPolicy) exist with RLS in migration 0076 but a grep across apps/web, services, packages/platform and apps/desktop/src returns zero consumers. gap-audit GAP-P0-010 names this as one defect class: there is no canonical policy decision interface enforced at every data-plane boundary (routing, web fetch/search, connector actions, MCP tools, extension/cloud sync, trust-mode transitions, artifacts, scheduled execution).

**Done when.** A single policy-decision interface is called at every data-plane boundary before the side effect, reading the persisted per-tool permission, granted scopes, risk class, browse-domain allowlist and tenant restriction rows; a control that cannot be enforced is removed from the UI rather than shipped as decoration; contract tests assert each stored policy value changes real execution outcome.

**Where.** `packages/ui/unified-chat/src/lib/connectorPermissionStore.ts`, `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts`, `apps/web/app/api/settings/organization/route.ts:66`, `apps/web/db/neon/0076_enterprise_control_plane_tables.sql`

**From.** known-flaws.md (CONNECTOR-PERMISSIONS-CLIENT-ONLY-01); phase4-capability-audit.md (PP-16, PP-27); capability-gaps.csv (CAP-019, CAP-030); gap-audit-2026-08-08.md (GAP-P0-010)

**Folded in.** CAP-019 Organization browse-domain policy; CAP-030 Enforced tenant restrictions; Connector scope/reauth/expiry/risk metadata unused in real policy decisions (PP-16); Org policy engine tables have zero consumers (PP-27); GAP-P0-010 Stored policy is not consistently enforced at execution boundaries

### SEC-07 — Row-level security coverage is incomplete across tenant/user-owned tables and no CI guard forces an isolation decision on new ones

`HIGH` · security · effort L

**What.** CRIT-015: there is no full inventory of tenant/user-owned tables, views, functions, indexes, caches and search indexes with deny-by-default RLS, and no CI guard that forces an isolation decision when a new tenant-scoped table is added. known-flaws SVC-GATEWAY-RLS-NOOP-01 shows the failure mode concretely — the gateway treated a user-id filter as RLS; migration 0054 enabled/forced RLS for 8 canonical gateway-owned tables in code, but the live Neon probe proving it remains external and unrun. known-flaws records the same class landing repeatedly (CAP-015 artifact ownership violations surface as RLS WITH CHECK 500s rather than pre-checked 403s). Enterprise tenancy notes record 'no tenant-wide RLS' as an outstanding design item.

**Done when.** Every tenant- or user-owned table, view and function is inventoried with an explicit deny-by-default RLS decision recorded; the gateway's RLS posture is proven by a live probe against a real Neon branch rather than asserted from migration text; a CI guard fails any migration adding a tenant-scoped table without an accompanying isolation decision.

**Where.** `apps/web/db/neon/0054*.sql`, `packages/platform/data-layer/src/adapters/neon.ts`

**From.** AuditRemediationLedger.md (CRIT-015); known-flaws.md (SVC-GATEWAY-RLS-NOOP-01); gap-audit-2026-08-08.md (enterprise tenancy)

**Folded in.** SVC-GATEWAY-RLS-NOOP-01: gateway treated a user-id filter as RLS

### SEC-08 — Legacy uploaded and generated files remain at permanent unauthenticated URLs; avatar/public-media policy and orphan-presign lifecycle are undecided

`HIGH` · security · effort L · **in-progress**

**What.** ExecutionPlan #89 (PARTIALLY REMEDIATED IN SOURCE 2026-08-13): chat attachments and project knowledge now presign into the private R2 bucket with opaque keys, scan before registration, and gate read/delete by owner, and new generated media writes owner-hashed private keys through /api/files/{id}. Still open: legacy public rows keep an explicit public fallback, avatars still upload directly to the public bucket with a permanent URL, legacy public generated objects retain public locations, and abandoned presigns can create untracked objects that account erasure cannot find. The published privacy policy states in the company's own words that anyone with the link can open a legacy file without signing in. FoundersAssistance #20 records the same two open decisions (avatar policy private-by-default vs public-with-inspection; bounded pending-upload cleanup lifecycle and legacy migration window) as awaiting a founder ruling.

**Done when.** An avatar/public-media policy is ratified and applied (private-by-default recommended), legacy public objects are migrated behind /api/files/{id} within a stated window, a bounded pending-upload lifecycle rule or durable pending-row cron reaps abandoned presigns so no untracked object survives account erasure, and the privacy policy's legacy-link disclosure is retired once the migration completes.

**Where.** `apps/web/app/api/files/[id]/route.ts`, `apps/web/app/api/uploads/presign/route.ts`, `apps/web/lib/server/object-storage.ts`

**Blocked by.** Founder decision on avatar storage policy and the legacy-object migration/retention window (FoundersAssistance #20)

**From.** ExecutionPlan.md (#89); FoundersAssistance.md (#20)

**Folded in.** Ratify the remaining public-media and orphan-upload policy (FoundersAssistance #20)

### SEC-51 — SSO/SCIM identity lifecycle is incomplete: group→role mapping is never persisted, directory sync has no storage, domain verification fails open to disabled

`HIGH` · security/auth · effort XL

**What.** Merged from five sources that describe one identity program at different dates. CRIT-010 (appears fixed): the sso_connections table now exists (migrations 0076, 0083, 0092) with migration/coverage tests, so the original 'no creating migration' finding is stale, but the checklist — schema tests plus SAML/OIDC integration tests for bad issuer, replay, domain mismatch — remains unchecked. CRIT-011: missing-table and config errors are swallowed as ssoEnabled:false instead of a typed operational failure with telemetry, so a backend fault silently presents as 'SSO is off', and DNS-challenge lifecycle tests do not exist. CRIT-012: directory sync has no connection schema, secret storage, cursor/state, webhook or polling reconciliation, group mapping, deprovisioning or audit — it is wired to storage that was never built. CRIT-013 claimed SCIM was types-only; phase4 PP-27 supersedes that with a sharper finding — the provisioning service exists and POST /Groups returns 201, but `mapped_role` is READ at scim-provisioning-service.ts:416-425 and never appears in any INSERT or UPDATE, so provisioned IdP groups grant zero privileges, with no error and no way for an admin to notice. ENT-001: 7 modules reference JIT provisioning so identity is further along than 'absent', but group mapping, deprovisioning and recovery are the proven-missing edges. known-flaws adds that enterprise SSO has never been created against a live Clerk instance (blocked on a paid plan with the Enhanced Authentication add-on) and that connections are instance-level rather than tenant-scoped because Clerk Organizations is not adopted — which makes DNS TXT domain verification a hard security precondition rather than a formality, and therefore makes CRIT-011's fail-open behaviour materially worse.

Also recorded by a later audit (First-party SSO sign-in and SCIM provisioning runtime — not implemented): wire-or-cut.md#2026-07-30 Enterprise and Gateway Database Boundaries sharpens the register entry: configuration storage is real (migration 0076_enterprise_control_plane_tables.sql owns SSO/directory configuration, org policy, audit, usage-ledger and support-case relations with RLS), but authentication and provisioning ENFORCEMENT is a deferred Phase 3 enterprise product decision, and no externally addressable provisioning endpoint exists at all. The unconsumed directory-sync webhook that returned HTTP 501 was removed rather than left as a fake surface.

**Done when.** mapped_role is persisted and enforced so an IdP group grants its mapped privileges (or group provisioning is refused with a clear error until it is), domain-verification and SSO-config faults surface as typed operational failures with telemetry rather than ssoEnabled:false, directory sync either gets its storage/cursor/reconciliation/deprovisioning/audit or is removed from the surface, SAML/OIDC integration tests cover bad issuer, replay and domain mismatch, and connections are scoped to a tenant (Clerk Organizations) rather than the instance.

**Where.** `apps/web/lib/server/scim/scim-provisioning-service.ts:416-425`, `apps/web/db/neon/0076_enterprise_control_plane_tables.sql`, `apps/web/db/neon/0083_sso_connections_clerk_link.sql`, `apps/web/db/neon/0092_sso_domain_uniqueness_on_verified_only.sql`

**Blocked by.** Live-Clerk verification requires a paid Clerk plan with the Enhanced Authentication add-on (founder)

**From.** AuditRemediationLedger.md (CRIT-010, CRIT-011, CRIT-012, CRIT-013, ENT-001); phase4-capability-audit.md (PP-27); known-flaws.md (Enterprise SSO unverified against live Clerk; connections instance-level); audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** CRIT-010 SSO routes and UI query a table that may not exist in migrations; CRIT-011 Domain verification silently falls back to disabled on backend errors; CRIT-012 Directory sync is wired to missing storage; CRIT-013 SCIM is types-only, no production endpoint; ENT-001 Identity lifecycle edges unproven; PP-27 SCIM group→role mapping is permanently null

### SEC-71 — Workspace/org model-access policy and the whole enterprise local-policy runtime (MDM, managed overrides, model restrictions, defaults push) are defined in contract layers with no loader, precedence resolver or enforcement consumer

`HIGH` · security/auth · effort L

**What.** MODELS-002 (audit/parity-2026-08-15) plus wire-or-cut.md 'Enterprise Local Policy Runtime Boundary'. ProviderPolicy { allowedModels; blockedModels } has zero consumers repo-wide; packages/contracts/licensing/src/org-policy.ts's own header states it 'is not wired into any surface's enforcement path'; AdminConsolePage.tsx (336 lines) has zero mentions of 'model', so an org admin cannot restrict which models members select. wire-or-cut records the same for MDM/managed overrides/model restrictions/defaults push: none has a loader, distribution/subscription path, precedence resolver, or runtime enforcement consumer, and the RLS-backed gateway policy route is read-only; the Rust/TS signed-policy code survives only as cross-language contract fixtures. Distinct from SEC-06 (connector per-tool permissions/scopes/browse-domain policy) — different policy object and different enforcement call site.

**Done when.** Pick ProviderPolicy as authoritative, add an admin-console route to read/write it, enforce it at request-processor.ts's existing tier-gate call site, and reflect a blocked model as a locked row in ComposerFooter.tsx; then build the loader/precedence resolver the local policy runtime needs before claiming MDM support.

**Where.** `packages/contracts/types/src/enterprise/index.ts:61-70,286`, `packages/contracts/licensing/src/org-policy.ts:1-22`, `apps/web/features/admin/pages/AdminConsolePage.tsx:1-336`

**From.** audit/parity-2026-08-15/gaps/domain-models (MODELS-002); docs/adr/wire-or-cut.md#2026-07-30 Enterprise Local Policy Runtime Boundary

**Folded in.** MODELS-002; wire-or-cut Enterprise Local Policy Runtime Boundary

### SEC-88 — A blanket GRANT on all public-schema tables can silently re-grant UPDATE/DELETE on security_audit_logs to app_rls, undoing audit-log immutability with no failing test

`HIGH` · security · effort M

**What.** AUDIT-IMMUT-01 residue (1), recorded in docs/agent-context/risk-map.json under enterprise-control-plane. The immutability fix (0043_audit_log_immutability.sql) revokes UPDATE,DELETE on public.security_audit_logs from app_rls, but the blanket 'GRANT ... ON ALL TABLES IN SCHEMA public TO app_rls' at 0037_rls_user_isolation.sql:81 would silently re-grant them, and nothing fails if it does. The risk-map names the deferred BEFORE UPDATE OR DELETE trigger as the durable fix.

**Done when.** Land the deferred BEFORE UPDATE OR DELETE trigger as the durable, test-covered fix instead of relying on nobody re-adding a blanket GRANT, and add a migration-lint check rejecting new 'GRANT ... ON ALL TABLES IN SCHEMA public' statements.

**Where.** `apps/web/db/neon/0037_rls_user_isolation.sql:81`, `apps/web/db/neon/0043_audit_log_immutability.sql`

**From.** docs/agent-context/risk-map.json (enterprise-control-plane, AUDIT-IMMUT-01 residue 1)

### CONN-20 — No enforced org/tenant governance policy for skills or plugins

`MEDIUM` · integrations · effort L

**What.** EXTENSIBILITY-008 (prior CAP-009/CAP-010). CAP-009 (Organization plugin governance) is Open, describing duplicate policy labels needing unification; CAP-010 (Organization skill policies) is Deferred, requiring tenant policy ownership and request-path enforcement that does not exist. Direct grep of plugin-installation-service.ts and plugin-registry-service.ts for org/tenant/team scoping returns only an unrelated future-admin-path comment.

**Done when.** Prioritize CAP-009 (unify duplicate plugin policy labels into one enforced contract) before CAP-010, since plugins already have a real registry to attach a policy to.

**Where.** `audit/capability-gaps.csv:9-10`, `apps/web/lib/services/plugin-installation-service.ts`, `apps/web/lib/services/plugin-registry-service.ts`

**From.** audit/parity-2026-08-15/gaps/domain-extensibility.json EXTENSIBILITY-008

**Folded in.** EXTENSIBILITY-008; CAP-009; CAP-010

### DPDP-31 — Mobile content reports have an intake endpoint but nothing routes them to a human reviewer

`MEDIUM` · compliance/dpdp · effort M

**What.** The intake endpoint and table exist (route only); nothing routes submitted mobile content reports to a human reviewer or moderation workflow. PP-30 and the platform-moderation finding record the broader absence of an illegal-content reporting pipeline, though a scored text classifier with BLOCK/FLAG thresholds and logged enforcement does now exist (CAP-024 appears substantially built at the platform level, contradicting its Open status in the ledger).

**Done when.** Route submitted reports to a reviewer queue with SLA and disposition states, and connect it to the operator takedown control from DPDP-29.

**Where.** `apps/web/app/api/mobile/content-report/route.ts`, `apps/web/lib/moderation/text-classifier.ts`

**From.** docs/agent-context/known-flaws.md MOBILE-CONTENT-REPORT-NO-INTAKE-ENDPOINT-01; audit/capability-gaps.csv CAP-024

**Folded in.** MOBILE-CONTENT-REPORT-NO-INTAKE-ENDPOINT-01: no moderation/triage workflow or reviewer UI

### DPDP-39 — Enterprise/SSO/SCIM/Compliance-API depth was never audited: no domain-enterprise pass exists and nobody traced what writes or reads enterprise*audit_events or directory_sync*\*

`MEDIUM` · compliance/dpdp · effort L · **unclear**

**What.** AuditCompleteness.md §3.5 (audit/parity-2026-08-15). web-backend.md:616,699 states plainly: 'Enterprise (SSO/SCIM/directory-sync/support-handoff) — NEEDS*VALIDATION (out of deep-read budget).' No domain-enterprise.md/.json exists among the 16 domain gap files. CapabilityMatrix.md §21 (lines 263-274) has no row for Compliance-API-equivalent audit export, EKM/data residency, or cross-app knowledge RAG, despite all three being documented competitor capabilities in the same research corpus. enterprise_audit_events and directory_sync*\* are confirmed present in the schema but their write and read paths were never traced. This is a coverage gap that could be hiding defects behind SEC-54 and DPDP-34 rather than a restatement of them.

**Done when.** Commission a dedicated enterprise/admin domain pass tracing enterprise*audit_events and directory_sync*\* from write to read to any export surface, and add the missing Compliance-API/EKM/data-residency rows to the capability matrix.

**Where.** `audit/parity-2026-08-15/inventory/web-backend.md:616,699`, `audit/parity-2026-08-15/CapabilityMatrix.md:263-274`

**From.** audit/parity-2026-08-15/AuditCompleteness.md §3.5

### MOB-27 — Mobile content reports have an intake endpoint but no moderation workflow or reviewer UI

`MEDIUM` · mobile · effort M

**What.** The intake endpoint and table exist (route only); nothing routes submitted mobile content reports to a human reviewer or a moderation workflow, so a report is accepted and then goes nowhere.

**Done when.** Build a triage queue and reviewer surface for submitted content reports, or state honestly that reports are collected but not yet reviewed.

**Where.** `apps/web/app/api/mobile/content-report/route.ts`

**From.** docs/agent-context/known-flaws.md (MOBILE-CONTENT-REPORT-NO-INTAKE-ENDPOINT-01)

### SEC-52 — Authorization is four hardcoded roles in SQL and TypeScript with no extensible RBAC/ABAC, groups, delegated admin, service accounts or break-glass

`MEDIUM` · security/auth · effort XL

**What.** ENT-002 (triaged 2026-08-09): zero role literals exist in the contracts package — roles are fixed in SQL and TypeScript rather than modeled as data — so custom roles, groups, policy inheritance, delegated admin, service accounts and break-glass are all absent. PP-27 records the same as 'four hardcoded roles instead of extensible RBAC/ABAC (or an explicit product-limit statement)'. This is the structural reason SEC-51's group→role mapping has nowhere to write to, and the reason SEC-57's owner/admin predicate keeps being hand-typed.

**Done when.** Roles and their permissions are modeled as data in one canonical policy source consumed by both TS and SQL, with groups, inheritance and delegated admin expressible; or the four-role limit is stated explicitly as a product boundary in customer-facing material and the extensible claims are withdrawn.

**From.** AuditRemediationLedger.md (ENT-002); phase4-capability-audit.md (PP-27)

### SEC-53 — Admin console is a readiness dashboard, not an authoritative control plane

`MEDIUM` · security · effort L

**What.** CRIT-014: the admin console renders static and fake status cards with zero-fetch controls; admin controls lack authorization checks, optimistic-concurrency checks, and audit events for each real action. phase4 PP-27 adds that /admin has no inbound navigation link anywhere in the app shell (grep for '/admin' returns only route-blocklist arrays), so it is reachable only by typing the URL. The absence of a working control plane is also what leaves SEC-51's identity faults and the moderation queue (SEC-65) without an operator surface, and what makes the takedown gap in the compliance slice unactionable.

**Done when.** Each admin control performs a real authenticated mutation with an authorization check, optimistic-concurrency guard and an emitted audit event; status cards read live state or are removed; and the console has a discoverable, role-gated entry point.

**Where.** `apps/web/features/admin/pages/AdminConsolePage.tsx`, `apps/web/app/api/admin/security/route.ts`

**From.** AuditRemediationLedger.md (CRIT-014); phase4-capability-audit.md (PP-27)

### SEC-54 — Audit export, SIEM delivery and trace correlation are effectively absent; the org audit route has zero clients

`MEDIUM` · security · effort L

**What.** ENT-004 (triaged 2026-08-09): audit tables exist across 5 migrations but only one module under apps/web/app/api matches SIEM or audit-export, and correlation is blocked on SCALE-VER-006 because almost no traces are emitted to correlate against. phase4 PP-27 pins the delivery gap concretely: org-wide audit export is implemented only as a separate api-gateway route (/api/v1/enterprise mounted at services/api-gateway/src/app.ts:154) with zero callers anywhere in the repo — a service that is deployed nowhere and called by nothing. AuditRemediationLedger DOC-017 separately flags that SECURITY.md's audit-log immutability status may be inaccurate (the underlying immutability fix, AUDIT-IMMUT-01, did land via migration 0043).

**Done when.** Audit events are exportable by an org admin through a reachable first-party surface with a documented retention window and a streaming/SIEM delivery option, the orphaned gateway enterprise route is either wired or deleted, and SECURITY.md's audit-log claims are regenerated from the actual migration state.

**Where.** `services/api-gateway/src/routes/enterprise.ts`, `services/api-gateway/src/app.ts:154`

**From.** AuditRemediationLedger.md (ENT-004, DOC-017); phase4-capability-audit.md (PP-27)

**Folded in.** DOC-017 SECURITY.md audit-log immutability status may be inaccurate

### SEC-55 — Enterprise encryption and network controls are absent: CMEK/BYOK, key rotation, private endpoint/VPC, IP allowlist

`MEDIUM` · security/crypto · effort XL

**What.** ENT-006 (triaged 2026-08-09): zero migrations mention CMEK/BYOK encryption or IP allowlists; procurement-driven, and no customer-facing surface currently claims them. capability-gaps CAP-001 tracks customer-managed encryption keys as an unclear/deferred capability (two audit labels deduplicated into one), and CAP-004 tracks the organization IP allowlist as requiring tenant administration and a break-glass path. gap-audit §6 groups these with the other intentionally deferred enterprise blockers — not public-alpha blockers, but hard blockers for enterprise procurement. Depends on SEC-40 (no root-key management exists to build CMEK on) and SEC-52 (no tenant-admin role model to gate an IP allowlist with).

**Done when.** Either the CMEK/BYOK, key-rotation, private-endpoint and IP-allowlist program is scoped and built against a committed enterprise scope on top of a real KMS root (SEC-40) and tenant admin model (SEC-52), or their absence is stated explicitly in procurement material so no claim outruns the implementation.

**Blocked by.** Deferred until enterprise launch requirements demand it (product decision, gap-audit §6)

**From.** AuditRemediationLedger.md (ENT-006); capability-gaps.csv (CAP-001, CAP-004); gap-audit-2026-08-08.md (§6)

**Folded in.** CAP-001 Customer-managed encryption keys; CAP-004 Organization IP allowlist

### SEC-56 — Procurement security evidence is essentially missing and published security-control claims are not derived from actual control state

`MEDIUM` · security · effort L

**What.** ENT-008 (triaged 2026-08-09): docs/security/ holds exactly one document (key-rotation.md) — no security architecture, threat model, pen-test status, subprocessor list or certification status. DOC-024: enterprise-ready and security-control claims are published without working identity/governance or an external audit and are not confirmed downgraded to match the ENT-001..008 reality. DOC-011: the AdminConsole's SSO/SCIM 'schema ready' language may overstate readiness. phase4 PP-27 records the inverse error at the same time — the public /enterprise page tells prospects SSO/SCIM status is unknown ('ask us') while the internal admin console correctly says they are 'Implemented — entitlement-gated' — so the claims are wrong in both directions, which is the signature of copy that is hand-maintained rather than generated. DPDP_PROGRESS's second and third passes fixed several concrete instances of this class (a false 'CI blocks on Semgrep' claim, a false CodeQL claim, an overstated Actions SHA-pinning claim, a wrong frame-src CSP claim), proving the pattern is systemic rather than incidental.

**Done when.** Public and internal security-capability statements are generated from one machine-readable control registry so they cannot disagree with each other or with the code, and the procurement set (security architecture, threat model, pen-test status, subprocessor list, honest certification status) exists as maintained documents.

**Where.** `docs/security/key-rotation.md`, `apps/web/app/enterprise/page.tsx:86-99`, `apps/web/features/admin/pages/AdminConsolePage.tsx:68-78`

**From.** AuditRemediationLedger.md (ENT-008, DOC-011, DOC-024); phase4-capability-audit.md (PP-27); DPDP_PROGRESS.md (§7.2, §7.3)

**Folded in.** DOC-011 AdminConsole SSO/SCIM 'schema ready' claims may overstate readiness; DOC-024 Enterprise-ready/security-control claims without working identity/governance

### SEC-57 — owner/admin authorization predicate is hand-written across TypeScript and raw SQL rather than one policy evaluator

`MEDIUM` · security/auth · effort M · **unclear**

**What.** Sources disagree. AuditRemediationLedger MATCH-003 reports the owner/admin pair appearing in many production TS and migration SQL locations while a canonical helper is barely used, with no single role taxonomy or policy evaluator, no SQL parity tests, and no guard against new raw role-pair comparisons — and marks it open. ExecutionPlan #39 reports the same finding (12 TS files, 32 SQL sites, canonical isOrganizationAdminRole() with exactly one caller, RLS helper app_row_is_readable inlining the pair) as fixed on 2026-08-09 in commit 4f1e0c35b. Neither was re-verified against current source in this pass, so the count of remaining hand-written comparisons and the presence of a guard are both unknown. Held open because a duplicated authorization predicate is exactly the shape that drifts silently.

**Done when.** A single role/policy evaluator is the only place the owner/admin decision is expressed, SQL parity tests assert the RLS helper matches it, and a guard rejects new raw role-pair comparisons outside that module — verified by counting remaining occurrences, not by trusting the commit.

**Where.** `apps/web/lib/server/scim/scim-auth.ts:116`

**From.** AuditRemediationLedger.md (MATCH-003); ExecutionPlan.md (#39)

### SEC-65 — Moderation has a scored platform classifier but no per-organization thresholds, appeal/review state, audit events or evaluation sets

`MEDIUM` · security · effort L · **in-progress**

**What.** CAP-024 was recorded as an open 'toggle-only regex' gap, but code verification contradicts that: text-classifier.ts implements weighted rules with BLOCK_THRESHOLD/FLAG_THRESHOLD scoring and reporting.ts logs every block/flag with a stable [moderation] prefix — the capability is substantially built at the platform level. ExecutionPlan #93 corroborates, recording the original 'seven opt-in regexes with no server-side classifier' finding as fixed 2026-08-09 (7aa633875). What remains is exactly what gap-audit GAP-P1-011 specifies and CAP-024 says was never delivered: versioned category scores, tenant/user thresholds, deterministic hard blocks, appeal/review state, audit events, and offline/online evaluation sets. Compounded by SEC-53 (no working admin control plane) — even flagged content has no operator queue, which is also why the mobile content-report intake endpoint has no reviewer workflow.

**Done when.** Moderation categories are versioned and scored, thresholds are settable per tenant, hard blocks are deterministic, every block/flag emits an audit event and enters an operator review/appeal queue in the admin console, and offline plus online evaluation sets measure the classifier rather than assuming it.

**Where.** `apps/web/lib/moderation/text-classifier.ts`, `apps/web/lib/moderation/reporting.ts`, `apps/web/lib/moderation/hash-denylist.ts`

**From.** capability-gaps.csv (CAP-024); gap-audit-2026-08-08.md (GAP-P1-011); ExecutionPlan.md (#93); AuditRemediationLedger.md (PP-26)

**Folded in.** CAP-024 Scored moderation thresholds; GAP-P1-011 Moderation remains below a scored, auditable policy system

### SEC-75 — No enforced organization/tenant governance policy for skills or plugins — policy labels are duplicated and nothing scopes install or execution to a tenant

`MEDIUM` · security/auth · effort L

**What.** EXTENSIBILITY-008, prior art CAP-009 (Organization plugin governance, Open — duplicate policy labels needing unification) and CAP-010 (Organization skill policies, Deferred — requires tenant policy ownership and request-path enforcement that does not exist). Direct grep of plugin-installation-service.ts and plugin-registry-service.ts for org/tenant/team scoping returns only an unrelated future-admin-path comment. Distinct from SEC-06 (connector per-tool permissions/scopes/risk class) and BILL-54 (plugin plan entitlements have no lifecycle to attach to).

**Done when.** Prioritize CAP-009 (unify the duplicate plugin policy labels into one enforced contract) before CAP-010, since plugins already have a real registry a policy can attach to; then add request-path enforcement for skills.

**Where.** `audit/capability-gaps.csv:9-10`, `apps/web/lib/services/plugin-installation-service.ts`, `apps/web/lib/services/plugin-registry-service.ts`

**From.** audit/parity-2026-08-15/gaps/domain-extensibility (EXTENSIBILITY-008; prior CAP-009/CAP-010)

### INFRA-53 — Enterprise-Local licensing verification is fully built twice (TypeScript + Rust), wired into nothing, with no fixture-replay parity test between the two

`LOW` · infra/ci · effort M

**What.** BACKEND-RUNTIME-007 / CROSS-SURFACE-009 / DEAD-CODE-019. A complete offline license/org-policy verification system exists in packages/contracts/licensing (index.ts:9-11 self-documents 'NOT wired into any app runtime') and a byte-for-byte Rust reimplementation in crates/agiworkforce-licensing (lib.rs:19-21 says the same). Zero non-test callers anywhere. Unlike packages/client/sync, which keeps its TS/Rust implementations honest via a golden-fixture replay suite (**fixtures**/cursor-compare.json), no such test exists between the two independent implementations of the same signed-container verification logic.

**Done when.** Confirm with the founder decision in docs/decisions/2026-07-30-enterprise-local-verifier-retention.md whether this is intentionally pre-built-ahead-of-need and record that explicitly; before wiring either implementation into a real enforcement path, add a shared fixture set and replay test on both TS and Rust sides mirroring packages/client/sync's pattern.

**Where.** `crates/agiworkforce-licensing/src/lib.rs:6,19-21`, `packages/contracts/licensing/src/index.ts:9-11`, `packages/contracts/licensing/src/verify.ts:57`, `packages/client/sync/src/__fixtures__/cursor-compare.json`, `crates/agiworkforce-licensing/src/lib.rs:19-21`, `packages/contracts/licensing/src/container.ts:69`

**From.** audit/parity-2026-08-15/gaps/domain-backend-runtime.json BACKEND-RUNTIME-007; audit/parity-2026-08-15/gaps/domain-cross-surface.json CROSS-SURFACE-009; audit/parity-2026-08-15/gaps/domain-dead-code.json DEAD-CODE-019; audit/parity-2026-08-15 BACKEND-RUNTIME-007; audit/parity-2026-08-15 CROSS-SURFACE-009; audit/parity-2026-08-15 gaps/domain-dead-code DEAD-CODE-019

**Folded in.** BACKEND-RUNTIME-007; CROSS-SURFACE-009; DEAD-CODE-019 (licensing half); Enterprise-Local licensing verification is fully built twice (TypeScript package and Rust crate), wired into nothing, with no fixture-replay parity test between them

### SEC-77 — No account-wide default-approval policy for installed plugin/tool actions

`LOW` · security · effort M

**What.** settings-20-gap (competitive-gap-2026-08-15). Grepping apps/web/features/settings for 'low-risk' / 'Allow low-risk' / plugin-permission language returns zero hits in any settings section — there is no single setting that states the default approval posture for plugin or tool actions.

**Done when.** Add one account-wide default-approval setting if per-plugin approval friction becomes a real complaint; keep it fail-closed by default.

**Where.** `apps/web/features/settings/sections`

**From.** audit/competitive-gap-2026-08-15/domains/settings (settings-20-gap)

### SEC-85 — No scoped, per-session authorization tokens — only developer API keys carry scopes

`LOW` · security/auth · effort L

**What.** settings-04-gap (competitive-gap-2026-08-15). AccountSection.tsx:564's active-sessions table has columns Device/Location/Created/Last active and no Scopes column; scoped access exists only for developer API keys (ApiKeys.tsx:145-147,229), a different authorization surface. Distinct from SEC-44 (a minted 'Run inference' scope being rejected by RLS) and SEC-52 (hardcoded four-role RBAC).

**Done when.** Extend the sessions model with a scopes dimension and surface it in the sessions table if session-level scope differentiation becomes meaningful.

**Where.** `apps/web/features/settings/sections/AccountSection.tsx:564`, `apps/web/features/settings/components/Settings/ApiKeys.tsx:145-147,229`

**From.** audit/competitive-gap-2026-08-15/domains/settings (settings-04-gap)

### SEC-96 — Chrome extension site allowlist has no default-permission policy, only a static list

`LOW` · security · effort S

**What.** settings-06-gap: apps/extension/src/options.ts renders an 'Approved sites' allowlist with an 'Add' control, but no default-policy setting governs behaviour for a site that is not on the list, so the allowlist is an unqualified list rather than an override on a stated default.

**Done when.** Add an explicit default-permission setting (Always ask / Always allow) so the allowlist becomes an override on a stated default.

**Where.** `apps/extension/src/options.ts:1056-1087,1163`

**From.** audit/competitive-gap-2026-08-15 settings-06-gap
