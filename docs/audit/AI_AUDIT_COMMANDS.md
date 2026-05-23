# AI Audit — Commands Run

## Phase 0: Guardrails

| Command                         | Exit | Result                      |
| ------------------------------- | ---- | --------------------------- |
| `git status --short`            | 0    | Clean working tree          |
| `git rev-parse --show-toplevel` | 0    | /home/user/agiworkforce     |
| `git branch --show-current`     | 0    | claude/jolly-goldberg-JXa65 |

## Phase 2: Baseline Checks

| Command                             | Exit | Result                                          |
| ----------------------------------- | ---- | ----------------------------------------------- |
| `pnpm typecheck:all`                | 0    | PASS — 0 errors                                 |
| `pnpm lint`                         | 0    | PASS — 0 errors, 0 warnings                     |
| `pnpm check:llm-operability`        | 0    | PASS — 17/17 sub-checks                         |
| `pnpm install --no-frozen-lockfile` | 0    | Updated lockfile for ioredis + rate-limit-redis |

## Phase 2: Pattern Counts

| Pattern                                   | Count | Notes                         |
| ----------------------------------------- | ----- | ----------------------------- |
| `git ls-files \| wc -l`                   | 6753  | Total tracked files           |
| TODO/FIXME/HACK/XXX                       | 146   | Across apps/packages/services |
| `as any`                                  | 147   | TypeScript escape hatches     |
| `@ts-ignore` / `@ts-expect-error`         | 22    | TypeScript suppressions       |
| `unsafe` (Rust, non-test)                 | 148   | Rust unsafe blocks            |
| `.unwrap()` (non-test)                    | 2452  | Rust unwrap calls             |
| `panic!`/`todo!`/`unimplemented!`         | 119   | Rust panics                   |
| `eval(`/`new Function(`/`document.write(` | 7     | JS eval-like                  |
| `localStorage`/`sessionStorage`           | 204   | Browser storage usage         |
| `NEXT_PUBLIC_` in process.env             | 120   | Next.js public env refs       |
| Supabase migrations                       | 52    | SQL migration files           |
| Test files                                | 645   | Test files found              |

## Blocked Checks

| Command        | Reason                                |
| -------------- | ------------------------------------- |
| `cargo clippy` | Missing system GTK/GDK/ALSA libraries |
| `cargo test`   | Missing system libraries              |
| `cargo audit`  | Missing system libraries for build    |
| E2E tests      | Requires browser + database           |

## Wave D: Billing/Checkout Audit (Read-Only Inspection)

| File Inspected                                       | Result                                                                                          |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `apps/web/app/api/checkout/route.ts`                 | Auth + CSRF + rate-limit + Zod. Duplicate subscription → billing portal. Stripe customer dedup. |
| `apps/web/app/api/stripe-webhook/route.ts`           | Signature verification (60s window). Idempotency. Service-role client. Generic error messages.  |
| `apps/web/app/api/stripe-webhook/lib/verify.ts`      | HMAC verification, 60s replay window, invalid signature logging                                 |
| `apps/web/app/api/stripe-webhook/lib/idempotency.ts` | RPC-based idempotent event processing                                                           |
| `apps/web/app/api/stripe-webhook/lib/handlers.ts`    | Full lifecycle: checkout/payment/subscription/refund/cancellation                               |
| `apps/web/app/api/stripe-webhook/lib/db.ts`          | PaymentIntent amount verification, credit allocation via RPC, subscription upsert               |
| `apps/web/app/api/credit-topup/route.ts`             | Auth + CSRF + rate-limit. Amount bounds ($10-$1000).                                            |
| `apps/web/lib/services/credit-service.ts`            | Atomic deduction via RPC, idempotency key support                                               |

**Result: No issues found. Billing flow is well-secured.**
