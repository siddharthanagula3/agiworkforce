# Enterprise Control Plane

Status: Current
Owner: Platform lead
Last updated: 2026-05-21
Purpose: document the first shared enterprise implementation wave across contracts, database, API gateway, and Web admin.

## Implemented Foundation

| Layer              | Path                                                                         | Role                                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Shared contracts   | `packages/types/src/enterprise/index.ts`                                     | Organization, policy, identity, audit, support, feedback, usage-ledger, and managed-credit types.                      |
| Canonical database | `supabase/migrations/20260521100000_enterprise_control_plane_foundation.sql` | Root migration for organization, SSO, SCIM, policy, audit, usage-ledger, support, feedback, and managed-credit tables. |
| API gateway        | `services/api-gateway/src/routes/enterprise.ts`                              | Authenticated organization list, policy, audit-event, usage-ledger, and support-case endpoints.                        |
| Web admin          | `apps/web/app/admin` and `apps/web/features/admin`                           | First operational admin readiness surface.                                                                             |
| Ownership          | `.github/CODEOWNERS`                                                         | Provisional path ownership until GitHub teams exist.                                                                   |

## Privacy Defaults

Default enterprise policy is deliberately conservative:

- `defaultPrivacyMode = byok`
- `allowedPrivacyModes = local, byok`
- `allowManagedCompute = false`
- `requireLocalToByokPreview = true`
- `chatSyncSurfaces = web, desktop, mobile`
- CLI, VS Code, and Chrome cloud sync disabled by default

## Agent Work Splitting

Future enterprise implementation should split into these lanes:

| Lane            | Owns                                                                                   |
| --------------- | -------------------------------------------------------------------------------------- |
| Contracts       | `packages/types/src/enterprise/**` and tests.                                          |
| Database        | New root Supabase migrations and RLS tests.                                            |
| API             | `services/api-gateway/src/routes/enterprise.ts` and route tests.                       |
| Web Admin       | `apps/web/app/admin/**`, `apps/web/features/admin/**`, and admin UI tests.             |
| Security Review | RLS, service-role usage, audit export, support privacy labels, and retention behavior. |
| Billing Risk    | Managed-credit ledger, cost snapshots, caps, reserves, and launch gates.               |

## Next Implementation Targets

- Add Web API proxy or direct API client for the admin console.
- Add organization creation and member management UI.
- Add policy editor with Local/BYOK/Managed previews and audit events.
- Add RLS regression tests for every enterprise table.
- Add provider-cost snapshot ingestion and managed-credit cap checks before any managed provider request.
