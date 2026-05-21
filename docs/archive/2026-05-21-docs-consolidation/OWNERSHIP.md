# Ownership Map

This repository has several high-risk boundaries where correctness depends on
matching contracts across surfaces. This file names owner roles, not people.
Use it when assigning review, splitting agent work, or triaging audit findings.

## High-Risk Boundaries

| Boundary                     | Paths                                                                                                                     | Owner role       | Required review focus                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------- |
| Native messaging             | `apps/extension/src/background.ts`, `apps/desktop/src-tauri/src/integrations/native_messaging/`                           | Chrome + Desktop | MAC envelope, downgrade behavior, request/response compatibility              |
| Tool execution and approvals | `apps/cli/src/`, `apps/desktop/src-tauri/src/sys/commands/tool_confirmation.rs`, `packages/mcp/`                          | CLI + Desktop    | command safety, MCP tool identity, explicit approval gates                    |
| Mobile local data            | `apps/mobile/storage/`, `apps/mobile/services/complianceLedger.ts`, `apps/mobile/services/modelDownload.ts`               | Mobile           | SQLCipher keying, corrupt rows, consent persistence, large-file failure modes |
| Billing and Stripe webhooks  | `apps/web/app/api/stripe-webhook/`, `supabase/migrations/`, `packages/types/src/billing-catalog.ts`                       | Web + Data       | idempotency RPCs, grants, canonical migration state, tier policy drift        |
| Provider/model catalog       | `packages/types/src/model-catalog.ts`, `packages/types/src/models.json`, `packages/providers/`, `packages/llm-normalize/` | Providers        | no hardcoded model IDs, cross-provider tool/result continuity                 |
| Browser/file/network tools   | `packages/browser-tool/`, `packages/apply-patch/`, `apps/cli/src/features/exec/tools/`                                    | CLI + Security   | path traversal, URL schemes, untrusted output provenance                      |
| Release and CI               | `.github/workflows/`, `BUILD.md`, surface package scripts                                                                 | Release          | docs match enforced checks, signing secrets documented, audit gates blocking  |

## Review Rules

- A change crossing two boundaries needs both owner roles in review.
- Stubs and placeholders in active code must either fail closed or link to an audit backlog entry.
- Security comments must point to enforcement code or tests. If not, treat them as drift.
- New migrations go in `supabase/migrations/`; legacy web migrations must not be treated as the source of truth.
