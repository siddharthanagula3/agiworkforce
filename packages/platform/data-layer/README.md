# @agiworkforce/data-layer

Status: Current
Owner role: Backend/data owner
Last updated: 2026-05-28
Kind: ts-package
Criticality: high

## Purpose

This package is the hosted persistence/auth boundary for AGI Workforce:

- Database: Neon Postgres.
- Auth verification: Clerk.
- Storage and realtime: explicit providers only; no default is wired yet.

Feature code should depend on these interfaces instead of importing provider SDKs directly.

## Usage

```ts
import { createAuthClient, createDatabaseClient } from '@agiworkforce/data-layer';

const auth = createAuthClient(); // Clerk by default
const verified = await auth.verifyJwt(sessionToken);
if (!verified) throw new Error('Unauthenticated');

const db = createDatabaseClient(); // Neon by default
const rows = await db
  .withUser(sessionToken)
  .query<{ id: string }>('select id from web_conversations where user_id = $1', [verified.userId]);
```

## Configuration

```bash
AGI_DATABASE_PROVIDER=neon
AGI_DATABASE_URL=postgresql://...neon.tech/neondb?sslmode=require

AGI_AUTH_PROVIDER=clerk
CLERK_JWT_KEY=...
CLERK_SECRET_KEY=...
CLERK_AUTHORIZED_PARTIES=https://agiworkforce.com,http://localhost:3000
```

`AGI_STORAGE_PROVIDER` and `AGI_REALTIME_PROVIDER` are intentionally explicit-only and currently fail closed until their production providers are implemented.

## Adding Data-Layer Behavior

1. Add the method to `src/types.ts`.
2. Implement hosted database behavior in `src/adapters/neon.ts`.
3. Implement hosted auth behavior in `src/adapters/clerk.ts`.
4. Stub future provider adapters with `NotImplementedError`.
5. Add unit tests in `src/__tests__/`.

Do not add legacy platform database adapters or env paths back into this package.
