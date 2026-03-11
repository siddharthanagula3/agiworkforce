# Sub-Feature: Deep Linking

> Custom `agiworkforce://` URL scheme that enables cross-platform session transfer, OAuth callback handling, and mobile device pairing by routing incoming URLs through a secure, event-driven pipeline in the Tauri desktop app.

## Where It Lives

| Layer | Path(s) |
|-------|---------|
| Tauri config (scheme registration) | `apps/desktop/src-tauri/tauri.conf.json` (plugins.deep-link.desktop.schemes) |
| macOS scheme registration | `apps/desktop/src-tauri/Info.plist` (CFBundleURLSchemes) |
| Rust plugin init | `apps/desktop/src-tauri/src/lib.rs` (`tauri_plugin_deep_link::init()`) |
| Desktop hook (URL parser + event dispatcher) | `apps/desktop/src/hooks/useDeepLink.ts` |
| Desktop auth bridge (token decryption) | `apps/desktop/src/services/desktopAuthBridge.ts` |
| Desktop auth consumer | `apps/desktop/src/components/Auth/AuthPage.tsx` |
| Desktop MCP OAuth consumer | `apps/desktop/src/components/MCP/MCPCredentialManager.tsx` |
| Desktop Connectors OAuth consumer | `apps/desktop/src/components/Connectors/ConnectorsGallery.tsx` |
| Desktop app root (hook mount) | `apps/desktop/src/App.tsx` |
| Web no-op stub | `apps/web/hooks/useDeepLink.ts` |
| Web token generation API | `apps/web/app/api/auth/desktop-token/route.ts` |
| Web sign-in-to-desktop UI | `apps/web/components/Auth/SignInToDesktop.tsx` |
| Mobile deep link handler | `apps/mobile/app/_layout.tsx` |
| Mobile pairing UI | `apps/desktop/src/components/Mobile/QRPairingCard.tsx` |
| Rust MCP OAuth commands | `apps/desktop/src-tauri/src/sys/commands/mcp_oauth.rs` |
| Shared types | `packages/types/src/auth.ts` (`AuthSession`, `DesktopAuthTokenPayload`) |
| E2E tests | `apps/desktop/src/__tests__/e2e/windows.spec.ts` |

## Architecture Overview

The deep linking system uses the `agiworkforce://` custom URL scheme to route external URLs into the desktop application. The architecture has four layers:

### 1. OS-Level Scheme Registration

The `agiworkforce://` scheme is registered at the OS level:

- **macOS**: `Info.plist` declares `CFBundleURLSchemes` with value `agiworkforce`. The OS associates this scheme with the app bundle.
- **Windows**: Registered via Windows Registry during NSIS installation (configured in `tauri.conf.json` bundle settings).
- **Linux**: `.desktop` file registration via XDG (handled by Tauri's bundler).

The Tauri plugin configuration in `tauri.conf.json`:
```json
"plugins": {
  "deep-link": {
    "mobile": [],
    "desktop": {
      "schemes": ["agiworkforce"]
    }
  }
}
```

### 2. Rust Plugin Initialization

In `lib.rs`, the deep link plugin is registered as the first plugin in the builder chain:

```rust
let mut builder = tauri::Builder::default()
    .plugin(tauri_plugin_deep_link::init())
    // ... other plugins
```

When the OS opens a `agiworkforce://` URL, Tauri's deep-link plugin receives it and emits an event that the frontend can subscribe to via `onOpenUrl()`.

### 3. Frontend URL Parser (`useDeepLink.ts`)

The `useDeepLink()` hook is mounted once in the root `App` component. It:

1. Subscribes to `onOpenUrl` from `@tauri-apps/plugin-deep-link`
2. Parses incoming URLs using the `URL` constructor
3. Extracts parameters from both query string and hash fragment (Supabase implicit flow puts tokens in `#`)
4. Routes to the appropriate handler based on URL path pattern:

```
Incoming URL
    |
    v
Parse URL (query + hash params)
    |
    +-- pathname matches /oauth/mcp/{provider}?
    |       |
    |       +-- Has error? --> dispatch 'mcp-oauth-error' CustomEvent
    |       +-- Has code+state? --> dispatch 'mcp-oauth-callback' CustomEvent
    |
    +-- Has access_token / code / type / refresh_token?
            |
            v
        dispatch 'agi-deep-link' CustomEvent
```

### 4. Event Consumers

The `useDeepLink` hook dispatches browser `CustomEvent`s that are consumed by different components:

| CustomEvent Name | Consumer(s) | Purpose |
|------------------|-------------|---------|
| `agi-deep-link` | `AuthPage.tsx`, `MCPCredentialManager.tsx` | Auth token processing (AuthPage) and MCP OAuth URL re-parsing (MCPCredentialManager parses the URL for `oauth/mcp/{provider}` paths) |
| `agi-desktop-auth-token` | `desktopAuthBridge.ts` | Encrypted web-to-desktop session transfer |
| `mcp-oauth-callback` | `ConnectorsGallery.tsx`, `useDeepLink.ts` (internal) | MCP server OAuth code exchange (GitHub, Google Drive, Slack) |
| `mcp-oauth-error` | `ConnectorsGallery.tsx` | MCP OAuth error handling |

## Supported Deep Link Actions

| Pattern | Parameters | Action | Implemented |
|---------|-----------|--------|-------------|
| `agiworkforce://auth/callback` | `access_token`, `refresh_token`, `type`, `code` | Supabase OAuth/magic-link/signup callback | Yes |
| `agiworkforce://auth` | `token` (encrypted) | Web-to-desktop encrypted session transfer | Yes |
| `agiworkforce://oauth/mcp/{provider}` | `code`, `state` | MCP OAuth callback (GitHub, Google Drive, Slack) | Yes |
| `agiworkforce://oauth/mcp/{provider}` | `error`, `error_description` | MCP OAuth error callback | Yes |
| `agiworkforce://pair/{code}` | (code in path) | Mobile device pairing via QR code | Yes (mobile) |
| `agiworkforce://pair` | `code`, `deviceId` | Mobile device pairing (query param variant) | Yes (mobile) |
| `agiworkforce://chat` | `conversationId` | Open conversation in chat view | PRD-specified, not yet implemented |
| `agiworkforce://chat/new` | `model`, `message` | Create new conversation | PRD-specified, not yet implemented |
| `agiworkforce://settings` | `tab` | Open specific settings panel | PRD-specified, not yet implemented |
| `agiworkforce://update` | `version` | Trigger update check | PRD-specified, not yet implemented |
| `agiworkforce://mcp/connect` | `url` | Connect to MCP server | PRD-specified, not yet implemented |

## Security

### Parameter Allowlist

The `ALLOWED_DEEP_LINK_PARAMS` allowlist (referenced in CLAUDE.md, PRD, and testing docs) constrains which URL parameters are accepted. The current implementation uses an implicit allowlist approach -- `useDeepLink.ts` only extracts and forwards specific known parameters (`access_token`, `refresh_token`, `type`, `code`, `state`, `error`, `error_description`). Unknown parameters are passed through in `allParams` but only consumed if one of the known trigger params is present.

### Scheme Validation

- Only `agiworkforce://` scheme URLs are processed (enforced by Tauri's deep-link plugin which only subscribes to registered schemes)
- The `URL` constructor validates URL syntax; malformed URLs are caught and logged
- E2E tests confirm that unrecognized schemes are ignored gracefully

### Token Redaction

- Auth tokens are never logged in full. Debug logs show `[DeepLink] Dispatched agi-deep-link event` without echoing the token values.
- The `desktopAuthBridge.ts` only logs the user email on success, never the raw token.

### Encrypted Token Security (Web-to-Desktop)

The web-to-desktop auth transfer uses a multi-layered security model:

1. **AES-256-GCM encryption**: Token payload is encrypted server-side with a key derived from SHA-256 of `TOTP_ENCRYPTION_KEY`
2. **60-second TTL**: Tokens expire 60 seconds after generation
3. **One-time nonce**: Each token contains a random nonce tracked in a `Set` to prevent replay
4. **Rate limiting**: The `/api/auth/desktop-token` endpoint is rate-limited to 5 requests per minute per IP
5. **Server-side JWT validation**: Uses `supabase.auth.getUser()` (network call) instead of `getSession()` (local cookie read) to verify the token is actually valid with Supabase's auth server

### MCP OAuth CSRF Protection

- A random `state` parameter is generated per OAuth flow and stored in `sessionStorage`
- On callback, the received `state` is verified against the stored value
- Mismatches are rejected with an error displayed to the user

## Web-to-Desktop Bridge

The web-to-desktop auth session transfer follows this flow:

```
User logged in on web (agiworkforce.com)
    |
    v
Clicks "Sign in to Desktop" (SignInToDesktop.tsx)
    |
    v
POST /api/auth/desktop-token (desktop-token/route.ts)
    |-- Authenticates user via Bearer token or cookies
    |-- Extracts session (access_token, refresh_token, user info)
    |-- Generates random nonce
    |-- Creates payload: { session, issuedAt, expiresAt, nonce }
    |-- Encrypts with AES-256-GCM (key = SHA-256 of TOTP_ENCRYPTION_KEY)
    |-- Returns { token, expiresAt, deepLink }
    |
    v
Browser opens: agiworkforce://auth?token={encrypted_token}
    |
    v
OS routes to desktop app
    |
    v
Tauri deep-link plugin fires onOpenUrl
    |
    v
useDeepLink.ts parses URL, detects auth params
    --> dispatches 'agi-deep-link' CustomEvent
    |
    v
desktopAuthBridge.ts (initialized at app startup)
    |-- Receives 'agi-desktop-auth-token' event
    |-- Reads encryption key from VITE_DESKTOP_TOKEN_SECRET or VITE_TOTP_ENCRYPTION_KEY
    |-- Decrypts token using Web Crypto API (AES-256-GCM)
    |-- Validates: TTL check, future-date check (5s tolerance), nonce replay check, session shape
    |-- Marks nonce as used
    |-- Stores session in useUnifiedAuthStore (setUser + login)
    |-- Triggers backend sync (store.syncWithBackend)
    |-- Shows toast: "Signed in as {email}"
```

**Type contracts** (from `packages/types/src/auth.ts`):

- `DesktopAuthTokenPayload`: `{ session: AuthSession, issuedAt: number, expiresAt: number, nonce: string }`
- `AuthSession`: `{ accessToken: string, refreshToken: string, user: AuthUser, expiresAt?: number }`

## Mobile Deep Linking

The mobile app (`apps/mobile/app/_layout.tsx`) handles deep links for device pairing:

- Listens for URL changes via Expo's `useURL()` hook
- Parses `agiworkforce://pair/{code}` and `agiworkforce://pair?code={code}` formats
- Navigates to the companion pairing screen with the extracted code
- Only processes deep links when the user is authenticated and the app is initialized

The desktop side (`QRPairingCard.tsx`) generates QR codes containing `agiworkforce://pair/{pairingCode}` URLs for the mobile app to scan.

## Key Patterns

### Event-Driven Decoupling
The `useDeepLink` hook does not directly call auth stores or MCP commands. Instead, it dispatches `CustomEvent`s on `window`, allowing multiple independent consumers to react without coupling. This follows the publish-subscribe pattern and enables components to opt-in to deep link handling.

### Graceful Web Degradation
`apps/web/hooks/useDeepLink.ts` is a no-op stub -- deep links are a desktop-only feature. This allows shared code paths to import the hook without conditional logic.

### Hash Fragment Parsing
Supabase's implicit OAuth flow places tokens in the URL hash fragment (`#access_token=...`) rather than query parameters. The hook handles both by merging query and hash params into a single `allParams` object, with hash params taking precedence if duplicated.

### Mounted-Guard Pattern
The hook tracks `isMounted` to prevent state updates after the component unmounts. If the async `onOpenUrl` setup completes after unmount, the returned `unlisten` function is called immediately.

## Known Issues / Tech Debt

1. **Event name mismatch**: `desktopAuthBridge.ts` listens for `agi-desktop-auth-token` but `useDeepLink.ts` dispatches `agi-deep-link`. The bridge is initialized via `initDesktopAuthBridge()` but there is no code path in `useDeepLink.ts` that dispatches `agi-desktop-auth-token`. The encrypted token flow from the web app appears to be wired for the `agi-deep-link` event (which `AuthPage.tsx` consumes), not the dedicated bridge. The bridge may be intended for a future direct-token flow or may need to be connected.

2. **PRD-specified actions not implemented**: Several deep link patterns defined in the macOS PRD (Section G.1) are not yet implemented in `useDeepLink.ts`:
   - `agiworkforce://chat` (open conversation)
   - `agiworkforce://chat/new` (new conversation with model/message)
   - `agiworkforce://settings/{section}` (open settings tab)
   - `agiworkforce://update` (trigger update check)
   - `agiworkforce://mcp/connect` (connect to MCP server)

3. **No explicit ALLOWED_DEEP_LINK_PARAMS allowlist constant**: The CLAUDE.md and PRD documents reference `ALLOWED_DEEP_LINK_PARAMS` as a security control, but no such named constant exists in the codebase. The allowlist is implicit -- `useDeepLink.ts` only acts on URLs containing recognized auth/OAuth parameters. Consider adding an explicit allowlist constant for auditability.

4. **Token redaction is partial**: While `useDeepLink.ts` does not log token values in its dispatch log line, two debug calls log URLs with sensitive data: `console.debug('[DeepLink] Received URLs:', urls)` at line 17 logs the full raw URL array, and `console.debug('[DeepLink] Parsing URL:', parsed.href)` at line 52 logs the parsed URL including any tokens in query parameters or hash fragments. Both should redact sensitive parameters.

5. **Mobile deep linking scheme not registered in Tauri config**: The `tauri.conf.json` shows `"mobile": []` for the deep-link plugin (empty array), while mobile pairing deep links (`agiworkforce://pair/...`) are handled by the Expo/React Native app separately via `expo-linking`. This is correct architecture but could cause confusion -- the mobile app registers its own URL scheme handler independently of Tauri.

6. **No deep link queueing**: If the app receives a deep link before the auth store or MCP stores are initialized, the event may be dispatched before any consumer is ready to handle it. There is no queue/replay mechanism for deep links received during app startup.
