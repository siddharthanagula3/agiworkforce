# Corrections to applied migrations

A migration that has run against production is immutable. Its checksum is in
the deployment ledger, and `pnpm db:migrate -- verify` refuses to promote a
build when a file no longer matches what was applied — which is the gate that
stands between a deploy and a schema nobody has verified.

That makes even a comment edit expensive. Corrections to the prose inside an
applied migration belong here instead.

## 0087_enterprise_audit_event_writes.sql

Its header says the Enterprise audit trail had a read endpoint at
`services/api-gateway/src/routes/enterprise.ts`. That service was removed in the
2026-07 restructure; `services/` now holds only `signaling-server`.

Writes land through `recordAuditEvent` (`apps/web/lib/security-audit.ts`)
whenever an event carries an organizationId. The read and export path shipped on
2026-08-23 as `/api/settings/organization/audit` and `/audit/export`, gated on
the `audit_export` policy resource.

This correction was originally made by editing the migration itself (#418,
`cad8f65e4`). That edit changed no SQL — comments only — but it changed the
file's checksum, and production had already applied the original. The result was
a drift the deploy gate refused to promote past, discovered on 2026-08-24 with
nine migrations queued behind it. The file has been restored to the bytes that
ran; do not edit it again.
