# Squad: web

**Surface:** apps/web | **Subagent:** web-engineer

## Baseline (cited from plan)

- `: any` in `apps/web`: 243 occurrences across 197 lines / 26 files
- `describe.skip / it.skip / test.skip` in `apps/web`: 1 instance
- `pnpm typecheck` against `apps/web` is currently GREEN on this checkout
- 231 routes + 86 API endpoints + 392 feature files + 249 components
- 56 web API routes use `SUPABASE_SERVICE_ROLE_KEY` directly per `tasks/todo.md` P1-1 (bypass RLS) — still open

## Checker output (source of truth)

### typecheck

`pnpm --filter web typecheck` — **GREEN** (zero errors, zero warnings). Confirmed clean on this checkout.

### lint

`pnpm --filter web lint` — **FAIL** (exit 1). 15 problems: **5 errors, 10 warnings**.

Errors:

1. `features/chat/components/ArtifactBlock.tsx:150` — `new Blob([...], {type:'text/html'})` XSS via download attribute (`no-restricted-syntax`)
2. `features/chat/components/artifacts/ArtifactPreview.tsx:252` — same (`no-restricted-syntax`)
3. `features/chat/components/artifacts/ArtifactPreview.tsx:280` — same (`no-restricted-syntax`)
4. `features/chat/components/dialogs/EnhancedExportDialog.tsx:150` — same (`no-restricted-syntax`)
5. `src/features/projects/components/ProjectSettingsDialog.tsx:81` — `setState` called synchronously inside `useEffect` body (`react-hooks/set-state-in-effect`)

Warnings (10): stale `eslint-disable` directives (no-control-regex x4, no-console x6) in `GreetingBanner/useGreeting.ts`, `lib/security/secrets-audit.ts`, `shared/lib/logger.ts`, and one other location. All auto-fixable.

### test

`pnpm vitest run` (run from `apps/web`) — **PASS**. 144 test files passed, 3324 tests passed, **1 skipped**. Duration: 110.79s. Deprecation warnings only (Node punycode — cosmetic, not actionable).

## Findings

| #   | Severity | File:line                                                        | Category                                                 | Checker-cited?          | Effort (hrs) | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | -------- | ---------------------------------------------------------------- | -------------------------------------------------------- | ----------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | P1       | `features/chat/components/ArtifactBlock.tsx:150`                 | XSS: `Blob(text/html)` via download attr                 | Yes (lint error)        | 0.5          | 3 occurrences in ArtifactPreview.tsx too; "open in new tab" opens blob URL not download, but lint rule is correct to flag it — a malicious artifact can escape via the download attribute path                                                                                                                                                                                                                                                                                                                                                                       |
| 2   | P1       | `features/chat/components/artifacts/ArtifactPreview.tsx:252,280` | XSS: same `Blob(text/html)`                              | Yes (lint error)        | 0.5          | line 252 is an explicit `html` download case; line 280 is open-in-tab. Both sanitize via `getPreviewHTML()` which calls `sanitizeArtifact`, but lint rule forbids the type regardless                                                                                                                                                                                                                                                                                                                                                                                |
| 3   | P1       | `features/chat/components/dialogs/EnhancedExportDialog.tsx:150`  | XSS: same `Blob(text/html)`                              | Yes (lint error)        | 0.5          | HTML export; `exportService.exportAsHTML` output goes directly to blob — sanitization unknown without deeper trace                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 4   | P2       | `src/features/projects/components/ProjectSettingsDialog.tsx:81`  | React perf: `setState` in effect body                    | Yes (lint error)        | 0.5          | 4 setState calls in effect triggered on every `project.*` change. Should use `useRef` guard or derive from props instead                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 5   | P2       | 75 of 93 `app/api/` route files                                  | Missing `export const runtime` declaration               | No (not a checker rule) | 4            | Includes billing-adjacent routes: `checkout`, `credit-topup`, `sync-subscription`, `portal`, `me`, `usage`, `chat/conversations`, `llm/v1/*`. Without explicit declaration, Next.js defaults to `nodejs` on Vercel but behavior is deployment-config-dependent. Critical routes that use Node-only APIs (crypto, Buffer) are at risk of silent edge-deploy failures                                                                                                                                                                                                  |
| 6   | P2       | `apps/web/supabase/migrations/` vs `supabase/migrations/`        | Schema drift: two migration trees                        | No (awareness)          | 8            | Canonical dir has 45 files (newest: `20260519092127`). Web-local dir has 50 files (newest: `20260505000002`). Canonical has more recent activity (newer timestamps); web-local carries 5 extra older migrations including legacy Stripe-idempotency variants. Trees have diverged and never been reconciled. Stripe/idempotency RPCs exist in canonical (`20260505000007_stripe_webhook_idempotency`) but web-local has its own older version (`20260108000004_fix_stripe_webhook_idempotency`). P2-6 in `tasks/todo.md` correctly describes this. Not yet resolved. |
| 7   | P2       | `lib/llm-providers/openai.ts:78,229`                             | `: any` on LLM tool transform in production routing path | No                      | 1            | Two identical `.map((tool: any) =>` in stream and non-stream branches. A `ToolDefinitionSchema` z.infer type exists in `lib/validations/llm.ts`. Should use `z.infer<typeof ToolDefinitionSchema>` or a shared `LLMTool` interface                                                                                                                                                                                                                                                                                                                                   |
| 8   | P3       | `__tests__/api/chat-messages.test.ts:659`                        | `it.skip` — skipped test                                 | No                      | 1            | See skipped-test section                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 9   | P3       | 10 unused `eslint-disable` directives                            | Stale suppression comments                               | Yes (lint warnings)     | 0.25         | Auto-fixable with `eslint --fix`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## :any top-20 worst offenders

The 243 raw occurrences cluster into four buckets. Bucket A (stubs/compat shims) accounts for ~200 of them and is intentional (ESLint `no-explicit-any: off` for `utils/`). The 20 highest-impact non-stub occurrences are:

| File:line                                                          | Impact area                                                 | Proposed type                                                                                                                                        | Effort              |
| ------------------------------------------------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `lib/llm-providers/openai.ts:78`                                   | LLM routing — production streaming path                     | `z.infer<typeof ToolDefinitionSchema>` from `@/lib/validations/llm`                                                                                  | 0.5h                |
| `lib/llm-providers/openai.ts:229`                                  | LLM routing — production non-streaming path                 | Same as above                                                                                                                                        | 0.25h (same change) |
| `lib/taskMetadata.ts:3`                                            | Task metadata derivation (`_attachments?: any`)             | `Attachment[]` or define `interface Attachment { name: string; mimeType: string; size?: number }`                                                    | 0.25h               |
| `hooks/useApprovalActions.ts:7`                                    | Approval action hook return type                            | Define `interface ApprovalResolution { decision: 'approve' \| 'reject'; reason?: string }`                                                           | 0.5h                |
| `stores/unified/projectStore.ts:58`                                | Project store hook stub                                     | `(selector?: (state: ProjectState) => unknown): unknown` — use real `ProjectState` from `@agiworkforce/stores`                                       | 1h                  |
| `stores/unified/projectStore.ts:61`                                | `setState` on project stub                                  | `(partial: Partial<ProjectState>) => void`                                                                                                           | 0.25h               |
| `stores/unified/projectStore.ts:67-68`                             | `selectCurrentFolder`, `selectRecentFolders`                | Already returns typed values via `as string \| null` / `as string[]` — remove `state: any`, use `unknown` + type guard                               | 0.25h               |
| `stores/unified/desktop-stubs.ts:13-90`                            | 20 store stubs (entire file)                                | Extract `StubStoreHook` type from `utils/stubs.ts` (already well-typed there) and import it; this file duplicates stubs.ts with weaker types         | 1h                  |
| `stores/unified/mediaGenerationStore.ts:8-66`                      | 20 store stubs (duplicate pattern)                          | Same: consolidate onto `utils/stubs.ts` exports — this file is a verbatim duplication of stubs.ts with no additional logic                           | 1h                  |
| `handlers/slashCommandHandlers.ts:32-48`                           | Slash command handlers (stubs + `executeXxxCommand: any[]`) | Return type `Promise<{ success: boolean; output?: string }>` for all execute-command stubs; stubs can reference `utils/stubs.ts` for component stubs | 0.5h                |
| `api/workflow.ts:37`                                               | Workflow API client stub `ErrorBoundary`                    | `({ children }: { children: React.ReactNode }) => React.ReactElement`                                                                                | 0.25h               |
| `api/orchestrator.ts:38`                                           | Orchestrator API client stub                                | Same as above                                                                                                                                        | 0.25h               |
| `api/client.ts:37`                                                 | Client API stub                                             | Same                                                                                                                                                 | 0.25h               |
| `components/ErrorBoundary.tsx:37,45`                               | `ErrorBoundary`, `ChatErrorBoundary`                        | `({ children }: { children: React.ReactNode }) => React.ReactElement`                                                                                | 0.25h               |
| `components/AGI.tsx:2`                                             | `IterationProgressPanel` stub                               | `(_props?: Record<string, unknown>) => null`                                                                                                         | 0.25h               |
| `utils/tokenCount.ts:5-39`                                         | 20 store/component stubs in token count util                | Consolidate onto `utils/stubs.ts` (most are already exported from there)                                                                             | 0.5h                |
| `utils/security.ts:5-9`                                            | 5 store stubs in security util                              | Consolidate onto `utils/stubs.ts`                                                                                                                    | 0.25h               |
| `utils/subscriptionGate.ts:37`                                     | `ErrorBoundary` stub in subscription gate                   | Import from `utils/stubs.ts`                                                                                                                         | 0.25h               |
| `services/__tests__/state-recovery-service.test.ts:64,73`          | Test fixture `(s: any)`                                     | `(s: Record<string, unknown>)` — test-only, low risk                                                                                                 | 0.25h               |
| `features/chat/components/__tests__/InlinePaywallCard.test.tsx:20` | Test mock `({ href, children, onClick, ...rest }: any)`     | `({ href, children, onClick, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children?: React.ReactNode })`                             | 0.25h               |

**Summary:** The real production risk is `lib/llm-providers/openai.ts` (2 lines in hot LLM path). All other occurrences are stubs, test mocks, or intentionally broad shim patterns. The stub duplication across `utils/tokenCount.ts`, `utils/security.ts`, `stores/unified/desktop-stubs.ts`, `stores/unified/mediaGenerationStore.ts`, and `handlers/slashCommandHandlers.ts` is a maintenance hazard (divergence risk if `utils/stubs.ts` is updated) but not a runtime risk.

## RSC / Server-Action boundary audit

**No `"use server"` files found** — `rg '"use server"'` returns zero results across all `.ts`/`.tsx` files in `apps/web` (excluding `public/chat`). This is consistent with an App Router app that uses Route Handlers (API routes) for all mutation logic rather than Server Actions.

**`"use client"` inventory:** 0 occurrences found via simple `rg '"use client"'`. Files do use `'use client'` (single-quotes, first line), confirmed via direct grep — ~40+ page and error boundary files. No component in `'use client'` scope was found importing `server-only` or using server-only hooks.

**Clean.** No RSC/Server-Action boundary violations found.

## Runtime config inventory

| Routes count              | edge | nodejs | unspecified |
| ------------------------- | ---- | ------ | ----------- |
| 93 total `route.ts` files | 0    | 18     | 75          |

The 75 unspecified routes rely on Next.js default (nodejs on Vercel). No edge runtime is declared anywhere in the API layer. Notable unspecified routes that use Node-only features or need explicit guarantees:

- `app/api/checkout/route.ts` — Stripe SDK (Node)
- `app/api/credit-topup/route.ts` — Stripe SDK (Node)
- `app/api/portal/route.ts` — Stripe billing portal (Node)
- `app/api/sync-subscription/route.ts` — Supabase service client (Node)
- `app/api/cron/reset-credits/route.ts` — service-role Supabase + cron secret (Node)
- `app/api/github/webhook/route.ts` — HMAC signature verification (Node crypto, already imported)
- `app/api/llm/v1/chat/completions/route.ts` — LLM provider streaming (Node)
- `app/api/device/approve|link|poll/route.ts` — service-role Supabase (Node)
- `app/api/auth/set-token|clear-token/route.ts` — cookie manipulation (Node)

The 18 routes that do declare `runtime = 'nodejs'` are consistent and correct. The gap between 18 and 93 is purely cosmetic on Vercel today, but represents a deployment portability risk if the hosting target ever includes edge workers, or if `next.config.js` ever sets a global default to `edge`.

## Stripe webhook posture (v1 LOCAL ONLY — flagged for paid-tier launch, not v1)

**Posture: SOLID for paid-tier launch (when that ships).**

- `app/api/stripe-webhook/route.ts` imports `server-only`, declares `runtime = 'nodejs'` and `dynamic = 'force-dynamic'`.
- Signature verification: `stripe.webhooks.constructEvent(body, signature, webhookSecret, 60)` — 60-second replay window (tightened from SDK default of 300s per WEB-SEV-HIGH-5 audit comment).
- Missing-signature early return: 400 with no body detail.
- Rate limiting: `checkRateLimit(request, 'stripe-webhook')` wraps the entry point.
- Idempotency: `checkIdempotency` + `markEventSucceeded`/`markEventFailed` pattern.
- Error body sanitization: generic `"Internal server error"` — no stack/SQL leakage (WEB-7 fix).
- `STRIPE_WEBHOOK_SECRET` null-guard at startup + at request time.
- **One open gap (P3-1 from todo.md):** `portal/route.ts:160` and webhook handlers fall back to email lookup when customer ID is missing — no hard deadline set for fixing. Not a security issue, just a reliability gap.
- Idempotency RPC migration drift: the canonical migration `supabase/migrations/20260505000007_stripe_webhook_idempotency.sql` exists in the canonical dir but the web-local dir has an older version (`20260108000004_fix_stripe_webhook_idempotency.sql`). The webhook handler calls the RPC via `checkIdempotency` — if the web-local dir is what is actually applied to the prod database, the RPC may be an older schema version. This is part of P2-6.

## Out-of-scope observations

- `app/api/cron/reset-credits/route.ts` has no `export const runtime` but correctly uses `server-only` and `getServiceClient()`. The cron secret logic had a prior bug (dev-bypass with only `NODE_ENV=development`) that was fixed per the inline comment (now requires `CRON_DEV_BYPASS=1` co-flag). Solid.
- `app/api/github/webhook/route.ts` has no `export const runtime` but calls `verifyGitHubWebhookSignature` using HMAC. Comment at line 444 references "Vercel edge runtime" `waitUntil` — suggests the file was partly written for edge. Without `runtime = 'nodejs'`, if this route were accidentally deployed as edge, HMAC via Node `crypto` would fail. Low risk today, worth pinning.
- SUPABASE_SERVICE_ROLE_KEY: 35 direct usages found across `app/api/`. Confirmed this is the P1-1 bypass-RLS concern from `tasks/todo.md`. Admin routes (`admin/directory-sync`, `admin/sso`, `admin/security`) and device-flow routes legitimately need service role. The broader concern is routes that use it without explicit RLS justification. Not this squad's task to enumerate further.
- `proxy.ts` at web root declares `export const runtime` — this is Next.js middleware, not an API route.

## False-positive watchlist

- `app/api/health/route.ts:125` — `anyUnhealthy` is a variable name, not a `: any` type annotation. The grep baseline count of 243 likely includes this.
- `utils/stubs.ts` `: any` usages — intentionally broad per file comment; ESLint `no-explicit-any: off` applies to `utils/`. Not a bug.
- `stores/unified/desktop-stubs.ts` and `stores/unified/mediaGenerationStore.ts` top sections — these are web-side stubs for desktop-only Zustand stores. The `any` is structural, not incidental. The concern is duplication with `utils/stubs.ts`, not safety.
- `test/setup.ts` framer-motion mocks — test scaffold only, no production impact.
