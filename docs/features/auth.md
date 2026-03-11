# Feature: Auth

> Multi-layer authentication system spanning Supabase cloud auth, local master password encryption, OAuth providers, device pairing, and encrypted session bridging between web and desktop apps.

## Where It Lives

| Layer | Path(s) |
|-------|---------|
| Rust security core | `apps/desktop/src-tauri/src/sys/security/auth.rs`, `auth_db.rs`, `oauth.rs`, `master_password.rs`, `encryption.rs`, `machine_key.rs`, `secret_manager.rs`, `rbac.rs` |
| Rust IPC commands | `apps/desktop/src-tauri/src/sys/commands/auth.rs` (session JWT), `apps/desktop/src-tauri/src/sys/commands/master_password.rs` |
| Rust account commands | `apps/desktop/src-tauri/src/sys/account/mod.rs` (device link, token sync, profile fetch, credit balance) |
| Rust diagnostics | `apps/desktop/src-tauri/src/sys/diagnostics/checks/auth_health.rs` |
| Desktop stores | `stores/auth.ts` (unified), `stores/authCoreStore.ts`, `stores/authOrchestrator.ts`, `stores/deviceLinkStore.ts`, `stores/logoutCleanup.ts` |
| Desktop services | `services/supabaseAuth.ts` (~1400 lines), `services/desktopAuthBridge.ts` |
| Desktop hooks | `hooks/useDeepLink.ts` |
| Desktop components | `components/Auth/AuthForm.tsx`, `components/Auth/AuthPage.tsx` |
| Web auth routes | `apps/web/app/login/page.tsx`, `apps/web/app/signup/page.tsx`, `apps/web/app/auth/callback/route.ts`, `apps/web/app/auth/error/page.tsx`, `apps/web/app/auth/update-password/page.tsx` |
| Web API routes | `apps/web/app/api/auth/desktop-token/route.ts`, `apps/web/app/api/auth/sso-check/route.ts`, `apps/web/app/api/device/link/route.ts`, `apps/web/app/api/device/poll/route.ts`, `apps/web/app/api/device/approve/route.ts` |
| Web Supabase setup | `apps/web/services/supabase.ts` (browser client), `apps/web/services/supabase-server.ts` (SSR cookie client), `apps/web/lib/supabase.ts` (client-side with PKCE) |
| Web crypto | `apps/web/lib/device-token-crypto.ts` (AES-256-GCM for device tokens) |
| Mobile auth | `apps/mobile/stores/authStore.ts`, `apps/mobile/lib/secureStorage.ts`, `apps/mobile/components/auth/OAuthButtons.tsx`, `apps/mobile/services/supabase.ts` |
| Shared types | `packages/types/` (DesktopAuthTokenPayload, AuthSession) |

## Data Flow

### 1. Supabase Auth (Primary Identity Provider)

All platforms use Supabase as the central identity provider. Auth flow:

```
User -> Supabase Auth -> JWT (access_token + refresh_token)
                      -> Profile row in `profiles` table
                      -> Subscription row in `subscriptions` table
```

**Supported sign-in methods:**
- Email + password (`signInWithPassword`)
- Magic link / OTP (`signInWithOtp`)
- OAuth: GitHub, Google (`signInWithOAuth`)
- SSO via SAML (`signInWithSSO` - web only, domain-based auto-detection)
- Apple Sign In (mobile only, via `signInWithIdToken`)

**PKCE flow** is used across all platforms (desktop, web, mobile) for enhanced security. The web app uses `@supabase/ssr` for server-side rendering with cookie-based session management.

### 2. Desktop Auth Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                     Desktop App Startup                          │
│                                                                  │
│  1. App.tsx calls initializeAuthOrchestrator()                   │
│  2. Orchestrator subscribes to supabaseAuth.onAuthStateChange()  │
│  3. supabaseAuth checks for cached session in localStorage       │
│  4. If session found: validate with Supabase, fetch profile      │
│  5. Orchestrator processes auth state sequentially:               │
│     a. setUser() on unified auth store                           │
│     b. Determine plan tier (fetched or cached)                   │
│     c. Fetch credits via accountApi                              │
│     d. Update unified store with account/billing data            │
│     e. Sync tokens to Rust backend via invoke():                 │
│        - account_store_api_base_url                              │
│        - account_store_access_token                              │
│        - account_store_refresh_token                             │
│        - llm_ensure_managed_cloud                                │
│  6. On deep link (OAuth callback): useDeepLink dispatches        │
│     'agi-deep-link' event -> AuthPage processes tokens           │
└──────────────────────────────────────────────────────────────────┘
```

### 3. Token Encryption in Rust Backend

The Rust backend stores tokens in-memory (not keyring) to avoid OS permission prompts:

```
Frontend (TypeScript)
  └── invoke('account_store_access_token', { accessToken })
        └── sys/account/mod.rs -> static ACCESS_TOKEN: RwLock<Option<String>>
```

For persistent secrets (API keys, JWT secrets), the Rust backend uses:

```
Master Password (optional)
  └── Argon2id hash -> password_key
        └── HKDF-SHA256(password_key || machine_id, purpose_salt) -> AES-256-GCM key

Machine-only (fallback)
  └── PBKDF2-HMAC-SHA256(machine_id, salt, 600K iterations) -> AES-256-GCM key
```

### 4. Desktop Auth Token Bridge (Web -> Desktop)

Allows users signed into the web app to transfer their session to the desktop app:

```
Web App Dashboard
  └── POST /api/auth/desktop-token (authenticated)
        ├── Validates session (getUser() for server-side JWT reverification)
        ├── Generates payload: { session, issuedAt, expiresAt (60s), nonce }
        ├── Encrypts with AES-256-GCM (key = SHA-256(TOTP_ENCRYPTION_KEY))
        └── Returns { token, deepLink: "agiworkforce://auth?token=..." }

Desktop App
  └── useDeepLink.ts receives agiworkforce:// URL
        └── Dispatches 'agi-deep-link' custom event (with token in detail)
              └── desktopAuthBridge.ts
                    ├── Listens for 'agi-desktop-auth-token' events (NOTE: this
                    │   event is never dispatched — dead listener; actual flow
                    │   goes through 'agi-deep-link' -> AuthPage)
                    ├── Decrypts token (Web Crypto API, AES-256-GCM)
                    ├── Validates: TTL (60s), nonce uniqueness, session shape
                    ├── Stores session in unified auth store
                    └── Triggers syncWithBackend()
```

### 5. QR Device Pairing (Desktop <-> Mobile)

```
Desktop                    Web API                      Mobile
  │                          │                             │
  ├─ device_link_initiate ──>│                             │
  │  (device_id, fingerprint)│                             │
  │                          ├── Creates pending code      │
  │<── { link_code, QR } ───┤   in device_authorization   │
  │                          │   _codes table              │
  │    [Shows QR code]       │                             │
  │                          │                             │
  │                          │<── POST /api/device/approve │
  │                          │    (user approves on web    │
  │                          │     or mobile)              │
  │                          │                             │
  ├─ device_link_poll ──────>│                             │
  │                          ├── Returns access_token,     │
  │<── { tokens, user } ────┤   refresh_token when        │
  │                          │   approved                  │
  │  [Stores session]        │                             │
```

Device fingerprinting uses SHA-256 of `device_id + hostname + username + salt`.

### 6. Local Auth (Master Password)

Optional master password layer for encrypting local secrets:

```
Setup:     password -> Argon2id(password, random_salt) -> verifier_hash (stored in SQLite)
Unlock:    password -> Argon2id verify -> derive_password_key -> cache in memory
Derive:    cached_key || machine_id -> HKDF-SHA256(purpose_salt) -> 32-byte AES key
Lock:      secure_zeroize(cached_key) with volatile writes + memory barrier
```

Argon2id parameters (OWASP recommended): 19 MiB memory, 2 iterations, parallelism 1.

### 7. Mobile Auth

```
Mobile App (Expo)
  └── Supabase auth (email/password, Apple, Google)
        ├── Session stored via expo-secure-store (OS keychain)
        │   iOS: Keychain, Android: Keystore
        ├── Zustand persist middleware with secureStorage adapter
        └── onAuthStateChange listener for session updates
```

### 8. JWT Structural Validation (Rust)

The `auth_store_session` Tauri command performs structural JWT validation before storing:
- Verifies 3 dot-separated base64url segments
- Decodes payload, checks for valid JSON
- Validates `exp` claim exists and is not expired
- Does NOT verify cryptographic signature (Supabase's responsibility)

## Rust Commands (IPC)

### Session Management (`sys/commands/auth.rs`)

> **Note:** These commands are defined in source but are NOT registered in `lib.rs` and thus cannot be invoked from the frontend. The desktop app uses Supabase client-side auth instead.

| Command | Description | Registered |
|---------|-------------|------------|
| `auth_store_session` | Store JWT session token (validates structure + expiry) | No |
| `auth_retrieve_session` | Retrieve stored session JWT | No |
| `auth_remove_session` | Clear stored session | No |

### Master Password (`sys/commands/master_password.rs`)
| Command | Description |
|---------|-------------|
| `master_password_is_configured` | Check if master password has been set up |
| `master_password_is_unlocked` | Check if app is currently unlocked |
| `master_password_get_status` | Get full status (configured, unlocked, needs_migration) |
| `master_password_setup` | First-time master password setup (min 8 chars) |
| `master_password_verify` | Verify password without unlocking |
| `master_password_unlock` | Unlock app with master password |
| `master_password_lock` | Lock app (securely clear cached key) |
| `master_password_change` | Change master password (requires current password) |
| `master_password_needs_migration` | Check if old machine-only secrets need re-encryption |
| `master_password_start_migration` | Begin migration process |
| `master_password_complete_migration` | Mark migration complete |

### Account & Token Sync (`sys/account/mod.rs`)
| Command | Description |
|---------|-------------|
| `account_store_api_base_url` | Set API base URL from frontend |
| `account_store_access_token` | Store Supabase access token in Rust memory |
| `account_store_refresh_token` | Store Supabase refresh token in Rust memory |
| `account_clear_tokens` | Clear all stored tokens (logout) |
| `device_link_initiate` | Start device pairing flow |
| `device_link_poll` | Poll for device link approval |
| `fetch_user_profile` | Fetch user profile from backend API |
| `oauth_refresh` | Refresh OAuth tokens via backend |
| `fetch_credit_balance` | Fetch credit balance from API |
| `report_llm_usage` | Report LLM usage for credit deduction |

## Store Schema

### UnifiedAuthStore (`stores/auth.ts`) — Desktop

```typescript
interface AuthState {
  // Identity
  user: User | null;               // { id, email, name?, avatar?, role? }
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  _hasHydrated: boolean;
  sessionValidated: boolean;

  // Subscription & Plan
  plan: PlanTier | null;            // 'free' | 'hobby' | 'pro' | 'max' | 'enterprise'
  planDisplayName: string;
  subscriptionStatus: SubscriptionStatus;
  subscriptionFetchStatus: SubscriptionFetchStatus;
  currentPeriodEnd: number | null;
  isPro: boolean;
  isEnterprise: boolean;
  featureFlags: Record<string, boolean>;

  // Stripe
  stripeCustomerId: string | null;
  stripeCustomer: CustomerInfo | null;
  stripeSubscription: SubscriptionInfo | null;
  stripeInitialized: boolean;

  // Credits
  credits: CreditBalance | null;
  creditBalance_cents: number | null;
  dailyUsage_cents: number | null;
  dailyLimit_cents: number | null;
  dailyResetAt: string | null;

  // Tokens
  accessToken: string | null;
  refreshToken: string | null;

  // Device Link
  deviceLinkId: string | null;
  deviceLinkCode: string | null;

  // Metadata
  createdAt: number;
  lastSyncedAt: number | null;
}
```

Persisted to `localStorage` key `unified-auth-storage` (version 1). Partializes: user (id, email, name, avatar only), isAuthenticated, lastSyncedAt, creditBalance_cents. Plan/subscription data is intentionally NOT persisted — always fetched fresh from the backend.

### AuthCoreStore (`stores/authCoreStore.ts`) — Desktop

Lightweight store for components that only need identity:

```typescript
interface AuthCoreState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  _hasHydrated: boolean;
  sessionValidated: boolean;
}
```

Persisted to `localStorage` key `auth-core-storage` (version 1). Partializes: user, isAuthenticated.

### DeviceLinkStore (`stores/deviceLinkStore.ts`) — Desktop

```typescript
interface DeviceLinkState {
  accessToken: string | null;       // OAuth token from device link flow
  refreshToken: string | null;
  deviceLinkId: string | null;
  deviceLinkCode: string | null;
}
```

Persisted to `localStorage` key `device-link-storage` (version 1).

### Mobile AuthStore (`apps/mobile/stores/authStore.ts`)

```typescript
interface AuthState {
  session: Session | null;          // Full Supabase Session object
  user: User | null;                // Supabase User object
  isLoading: boolean;
  isInitialized: boolean;
}
```

Persisted to OS keychain via `expo-secure-store` (key `auth-store`). Partializes: session, user.

### Rust AuthManager (in-memory, `sys/security/auth.rs`)

```rust
pub struct AuthManager {
    users: Arc<RwLock<HashMap<String, User>>>,
    sessions: Arc<RwLock<HashMap<String, Session>>>,
    secret_manager: Arc<SecretManager>,
    validation_attempts: Arc<RwLock<HashMap<String, ValidationAttempt>>>,
}
```

Constants: access token duration 60 min, refresh token duration 30 days, max 5 failed attempts, 30 min lockout, 15 min inactivity timeout, 100 validation attempts/minute rate limit.

### Rust SessionState (in-memory, `sys/commands/auth.rs`)

```rust
pub struct SessionState(pub RwLock<Option<String>>);  // JWT string
```

### Rust MasterPasswordManager (`sys/security/master_password.rs`)

```rust
pub struct MasterPasswordManager {
    db_conn: Arc<Mutex<Connection>>,         // SQLite
    cached_key: Arc<Mutex<Option<Vec<u8>>>>, // Derived key, cleared on lock
}
```

SQLite tables: `master_password` (verifier_hash, verifier_salt, argon2_params), `master_password_migration` (status tracking).

## Component Tree

```
App.tsx
├── useDeepLink()                          # Listens for agiworkforce:// deep links
├── initializeAuthOrchestrator()           # Single auth state listener
├── initDesktopAuthBridge()                # Listens for encrypted auth tokens
│
├── [unauthenticated]
│   └── AuthPage
│       ├── AuthForm
│       │   ├── Sign In (email/password)
│       │   ├── Sign Up (email/password/name)
│       │   ├── Magic Link
│       │   ├── Reset Password
│       │   ├── Set New Password (recovery flow)
│       │   ├── Email Verification Sent
│       │   ├── Magic Link Sent
│       │   └── Reset Link Sent
│       └── OAuth buttons (GitHub, Google)
│
├── [authenticated]
│   ├── Settings/AccountSettings           # Profile, plan display
│   ├── Layout/UserProfile                 # Avatar, name in header
│   └── Subscription/SubscriptionGate      # Feature gating by plan
│
└── Web App (apps/web/)
    ├── /login                             # Email/password + magic link + OAuth + SSO
    ├── /signup                            # Registration
    ├── /auth/callback                     # OAuth/magic link redirect handler
    ├── /auth/error                        # Auth error display
    ├── /auth/update-password              # Password reset completion
    └── /forgot-password                   # Password reset initiation
```

## Key Patterns

### AuthOrchestrator Single-Listener Pattern

**Problem solved:** Previously, `App.tsx` called three separate `initialize*` functions, each subscribing to `supabaseAuth.onAuthStateChange()`. When auth state changed, all 3 listeners fired simultaneously causing race conditions in credit fetching, token syncing, and state updates.

**Solution:** `authOrchestrator.ts` is the SINGLE listener. It uses a processing lock (`isProcessingAuthChange`) with a pending state queue to serialize auth state updates. Steps execute sequentially: user identity -> plan tier (with 24h cache fallback) -> credits (with 30s cache + 60s 401 cooldown) -> unified store update -> Rust backend sync.

Singleton guard (`orchestratorInitialized`) prevents double-initialization.

### AES-256-GCM Token Encryption

Two encryption systems:

1. **Rust-side** (`sys/security/encryption.rs`): Uses `aes-gcm` crate with 12-byte random nonces. Key derived from machine identifiers via PBKDF2 (600K iterations) or master password via Argon2id + HKDF.

2. **Web-to-Desktop bridge** (`lib/device-token-crypto.ts` + `desktopAuthBridge.ts`): Uses Node.js `crypto` module server-side and Web Crypto API client-side. Key derived from `SHA-256(TOTP_ENCRYPTION_KEY)`. Token format: `base64url(IV[12] + authTag[16] + ciphertext)`.

### Argon2id Local Auth

Master password system uses Argon2id (v0x13) with OWASP-recommended parameters:
- Memory: 19 MiB (19,456 KiB)
- Iterations: 2
- Parallelism: 1
- Output: 32 bytes

Key derivation chain: `Argon2id(password, salt) -> password_key || machine_id -> HKDF-SHA256(purpose_salt) -> 32-byte key`. Eight key purposes: JwtSecret, DatabaseEncryption, McpCredentials, ApiKeys, MasterEncryption, EmailCredentials, CalendarCredentials, CloudEncryption.

Secure zeroization on lock uses volatile writes + compiler fence to prevent optimization.

### QR Pairing Protocol

1. Desktop calls `device_link_initiate` (requires authenticated session since CodeRabbit C4 fix)
2. Backend generates 64-bit entropy code (8 random bytes = 16 hex chars), stores in `device_authorization_codes` table with 15-minute TTL
3. QR code generated server-side via `qrcode` library (avoids leaking URLs to external services)
4. User scans QR or enters code on mobile/web
5. Desktop polls `device_link_poll` with device fingerprint until status changes from `pending`
6. On approval, tokens returned to desktop; CSRF protection and rate limiting on all endpoints

### JWT Structural Validation

The Rust `auth_store_session` command validates JWTs structurally before storing:
- Three base64url segments separated by dots
- Payload decodes to valid JSON
- Contains numeric `exp` claim
- `exp` is in the future

This is a defense-in-depth measure; cryptographic signature verification is Supabase's responsibility. The `get_session_user_id()` helper extracts the `sub` claim, returning `"default"` for single-user desktop fallback.

### Session Refresh

- **Supabase client:** `autoRefreshToken: true` handles token refresh automatically
- **Desktop orchestrator:** Caches credits for 30s to avoid redundant API calls; 60s cooldown on 401 errors
- **Mobile:** `refreshSession()` action in auth store; session listener auto-updates on token refresh
- **Rust backend:** `oauth_refresh` command for manual refresh via backend API

### Logout Cleanup

`logoutCleanup.ts` provides centralized cleanup across 12+ stores:
1. Stores with active resources first (browser listeners, terminal sessions, automation)
2. Data stores (chat, MCP, database, execution)
3. Billing/usage state
4. Unified auth store
5. Stores that preserve preferences (code, model, settings)

`clearPersistedUserData()` removes 7 localStorage keys while preserving app-level preferences.

### RBAC (Role-Based Access Control)

Rust-side RBAC system with three roles: `Viewer`, `Editor`, `Admin`. `RBACManager` maintains a cached permission map loaded from SQLite (`role_permissions` + `permissions` tables). Supports per-user permission overrides via `user_permissions` table.

### Rate Limiting

- **Rust AuthManager:** Token validation rate limited to 100 attempts per minute per token prefix (first 8 chars)
- **Login lockout:** 5 failed attempts triggers 30-minute lockout (SECSYS-006)
- **OAuth verifiers:** 10-minute TTL, max 100 pending verifiers (SECSYS-007)
- **Web API:** Rate limiting via Upstash Redis on all auth endpoints

### Cold Start Mitigation

Desktop `supabaseAuth.ts` implements database warm-up for Supabase free tier (database pauses after inactivity). Sends a lightweight query before auth queries with 30s timeout. Auth data is cached in localStorage (30-minute TTL) for resilience against cold starts.

## Known Issues / Tech Debt

1. **Dual auth store pattern:** Both `useUnifiedAuthStore` (auth.ts, ~1490 lines) and `useAuthCoreStore` (authCoreStore.ts) exist. The latter was extracted from the former but both remain active. Components import from either, creating potential sync drift.

2. **In-memory token storage in Rust:** `ACCESS_TOKEN` and `REFRESH_TOKEN` in `sys/account/mod.rs` use `static RwLock<Option<String>>`. These are lost on app restart. The frontend must re-sync tokens on every startup.

3. **AuthManager not connected to database:** The Rust `AuthManager` (in `security/auth.rs`) stores users and sessions in in-memory `HashMap`s. `AuthDatabaseManager` (in `auth_db.rs`) exists for SQLite persistence but is not wired together. The in-memory AuthManager appears to be unused in production (Supabase handles all real auth).

4. **auth_db.rs column name typo:** `get_session_by_access_token` and `get_session_by_refresh_token` reference `last_activity_a` (truncated) instead of `last_activity_at` in their SQL queries.

5. **Master password migration incomplete:** `needs_migration()` detects old machine-only secrets, and migration tracking tables exist, but the actual re-encryption logic (iterating secrets and re-encrypting with password-derived keys) is not implemented.

6. **OAuth providers not fully integrated:** The Rust `OAuthManager` supports Google, GitHub, and Microsoft with PKCE + token exchange, but the desktop app's actual OAuth flow goes through Supabase (not the Rust OAuthManager directly).

7. **Desktop auth bridge key agreement:** The `desktopAuthBridge.ts` requires `VITE_DESKTOP_TOKEN_SECRET` or `VITE_TOTP_ENCRYPTION_KEY` to match the server's `TOTP_ENCRYPTION_KEY`. No automated key exchange mechanism exists; misconfiguration silently fails.

8. **No middleware on web app:** The Next.js web app does not have a `middleware.ts` file for auth route protection. Auth checks happen at the component/page level.

9. **`useAuthStore` alias:** `auth.ts` exports `useAuthStore` as an alias for `useUnifiedAuthStore` for backwards compatibility. Some components (e.g., `AuthForm.tsx`) import from this alias, others import `useUnifiedAuthStore` directly, creating inconsistent import patterns.

10. **Subscription cache resilience:** The 24-hour subscription cache in `authOrchestrator.ts` can mask subscription changes (e.g., plan upgrades/downgrades) if the API fetch keeps failing.
