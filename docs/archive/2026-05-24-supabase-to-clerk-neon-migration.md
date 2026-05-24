# Supabase → Clerk + Neon Migration Summary

**Date:** 2026-05-24 to 2026-05-25
**Scope:** `apps/web/` — API routes, service layer, client-side code
**Commits:** 60+
**Status:** Core migration complete. Storage/Realtime/device flow remain on Supabase.

## What Changed

### Auth: Supabase Auth → Clerk
- 59 of 63 API routes migrated to `getClerkAuthUser()` from `@/lib/api-auth`
- Clerk middleware (`proxy.ts`) handles cookie-based browser auth
- Bearer tokens verified via `@clerk/backend` `verifyToken()`
- Compatibility layer in `api-auth.ts` accepts both Clerk and Supabase Bearer tokens during cross-surface transition
- User IDs changed from Supabase UUIDs to Clerk text IDs (`user_*`)
- `user_id_mapping` table bridges old UUIDs to new Clerk IDs

### Database: Supabase Postgres → Neon Postgres
- All queries use `getNeonDb()` from `@/lib/server/neon-db` returning `DatabaseAdapter` from `@agiworkforce/data-layer`
- Parameterized SQL (`db.query<T>('select ... where $1', [param])`) replaces Supabase fluent API
- 20 Neon SQL migration files under `apps/web/db/neon/` (0001-0019 tables + 0020 functions)
- 38 stored procedures ported from Supabase PL/pgSQL (auth.uid() → p_user_id text parameter)
- Row types defined in `@/lib/server/neon-types.ts`
- WHERE-clause user isolation (no RLS via GUC)

### Service Layer
- All 10 service files accept `DatabaseAdapter` instead of `SupabaseClient`
- RPC calls converted to `db.query('select * from fn($1)', [arg])`

### Client-Side
- 13 client services migrated from direct `supabase.from()` to `fetch()` API route calls
- 9 new API routes created (reactions, bookmarks, folders, shortcuts, branch, search, support, log-message, sync)
- Auth token retrieval via `@shared/lib/get-auth-token` (Clerk session tokens)
- `authentication-manager.ts` rewritten to delegate to Clerk

## What Stayed on Supabase
- **Storage** (AD-6): `chat-attachments`, `avatars` buckets — 3 files
- **Realtime** (AD-7): WebSocket subscriptions — 3 files
- **Device flow**: 5 routes (auth/desktop-token, device/approve/link/poll) — cross-surface dependency
- **Auth admin**: `auth.admin.deleteUser()` in user/delete-account — no Neon equivalent
- **Compatibility layer**: `api-auth.ts` Supabase Bearer fallback — removed when all surfaces ship Clerk

## Key Files
- `apps/web/lib/server/neon-db.ts` — Neon singleton
- `apps/web/lib/server/neon-types.ts` — 30+ row types
- `apps/web/lib/server/user-id-resolver.ts` — UUID↔Clerk ID mapping
- `apps/web/lib/api-auth.ts` — `getClerkAuthUser()` with compat layer
- `apps/web/shared/lib/get-auth-token.ts` — Clerk session token utility
- `apps/web/db/neon/` — 20 SQL migration files

## Architecture Decisions
- AD-1: Clerk text IDs in all Neon tables (not UUIDs)
- AD-2: WHERE-clause isolation, not RLS via GUC
- AD-3: RPCs stay as Neon stored procedures (not inlined into TS)
- AD-4: Auth compat layer normalizes Supabase UUIDs → Clerk IDs
- AD-5: FK-chain-aware batched data backfill
- AD-6: Storage stays on Supabase temporarily
- AD-7: Realtime stays on Supabase temporarily
- AD-8: Stripe webhook resolves UUIDs via mapping table
- AD-9: Billing cutover uses dual-write validation window
