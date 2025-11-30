# Account Integration Guide

## Overview

This document describes the local account state model for the AGI Workforce desktop app and defines integration points for future connection to the web backend.

## Current State

The desktop app currently uses **local-only account state** with configurable defaults. No network calls to the website backend are made yet.

## DesktopAccount Model

### Type Definition

**Location**: `apps/desktop/src/stores/accountStore.ts`

```typescript
export type PlanTier = 'free' | 'pro' | 'enterprise';

export interface DesktopAccount {
  // Identity
  id: string | null;
  email: string | null;
  displayName: string | null;
  avatar?: string | null;

  // Subscription
  plan: PlanTier;
  planDisplayName: string;
  subscriptionStatus: 'active' | 'trialing' | 'past_due' | 'canceled' | 'none';
  currentPeriodEnd: number | null; // Unix timestamp

  // Feature Access
  featureFlags: Record<string, boolean>;

  // Authentication (placeholders for future use)
  accessToken?: string | null;
  refreshToken?: string | null;
  deviceLinkId?: string | null;
  deviceLinkCode?: string | null;

  // Timestamps
  createdAt: number;
  lastSyncedAt: number | null;
}
```

### Default Values

For local development and testing, the account store initializes with:

```typescript
{
  id: null,
  email: null,
  displayName: 'Local User',
  avatar: null,
  plan: 'free',
  planDisplayName: 'Free',
  subscriptionStatus: 'none',
  currentPeriodEnd: null,
  featureFlags: {},
  createdAt: Date.now(),
  lastSyncedAt: null,
}
```

### Dev Mode Overrides

Developers can override defaults via environment variables:

```env
# .env.local
VITE_DEV_ACCOUNT_PLAN=pro
VITE_DEV_ACCOUNT_NAME=Test User
VITE_DEV_ACCOUNT_EMAIL=test@example.com
```

## UI Components Using Account State

### 1. UserProfile Component

**Location**: `apps/desktop/src/components/Layout/UserProfile.tsx`

**Reads**:

- `displayName` → User's name
- `email` → User's email
- `avatar` → Profile picture URL

**Before** (hardcoded):

```typescript
name = 'Siddhartha Nagula';
email = 'siddhartha@agiworkforce.com';
```

**After** (from store):

```typescript
const { displayName, email, avatar } = useAccountStore();
```

### 2. Sidebar Component

**Location**: `apps/desktop/src/components/Layout/Sidebar.tsx`

**Reads**: Same as UserProfile

**Before**: Hardcoded values at line 227-228

**After**: Reads from `useAccountStore()`

### 3. Settings / Account Page

**Location**: TBD (future implementation)

**Will Display**:

- Current plan tier
- Subscription status
- Feature access list
- Usage statistics
- Billing information

### 4. Feature Gates

**Location**: `apps/desktop/src/utils/featureGates.ts`

**Reads**:

- `plan` → To determine feature access
- `featureFlags` → For experimental features

**Example Usage**:

```typescript
const account = useAccountStore.getState();
const canUseFeature = checkFeatureAccess('advanced_ui_automation', {
  plan_name: account.plan,
  status: account.subscriptionStatus,
});
```

## Integration Points for Future Web Connection

### 1. Authentication Flow

#### Device Linking (Recommended)

**Desktop Initiates**:

```
Desktop                        Web Backend
   |                               |
   |---GET /api/device/link------->|
   |<--{link_code, device_id}------|
   |                               |
   | Display code to user          |
   | User visits website           |
   | User enters code              |
   |                               |
   |---POST /api/device/poll------>|
   |   {device_id}                 |
   |<--{access_token, user}--------|
   |                               |
```

**Tauri Command** (to be implemented):

```rust
#[tauri::command]
async fn device_link_initiate() -> Result<DeviceLinkResponse, String> {
  // POST https://api.agiworkforce.com/api/device/link
  // Returns: { link_code, device_id, expires_at }
}

#[tauri::command]
async fn device_link_poll(device_id: String) -> Result<Option<AuthResponse>, String> {
  // POST https://api.agiworkforce.com/api/device/poll
  // Returns: { access_token, refresh_token, user } or null
}
```

**Frontend Hook** (to be implemented):

```typescript
// apps/desktop/src/hooks/useDeviceLink.ts
export function useDeviceLink() {
  const initiateLink = async () => {
    const { link_code, device_id } = await invoke('device_link_initiate');
    // Display link_code to user (QR code + text)
    // Poll for completion
  };
}
```

#### OAuth2 Alternative

**Desktop Initiates**:

```
Desktop                        Web Backend
   |                               |
   |---Open browser-------->       |
   | https://app.agiworkforce.com/auth?
   |   client_id=desktop&
   |   redirect_uri=tauri://localhost
   |                               |
   | User logs in                  |
   | Browser redirects to Tauri    |
   |                               |
   |<--tauri://localhost?code=xxx--|
   |                               |
   |---POST /oauth/token---------->|
   |   {code, client_id}           |
   |<--{access_token, user}--------|
   |                               |
```

**Tauri Command** (to be implemented):

```rust
#[tauri::command]
async fn oauth_login(window: tauri::Window) -> Result<AuthResponse, String> {
  // Open browser to auth URL
  // Listen for redirect
  // Exchange code for token
}
```

### 2. User Profile Sync

**Endpoint**: `GET /api/me`

**Response**:

```json
{
  "id": "user_123",
  "email": "user@example.com",
  "name": "John Doe",
  "avatar_url": "https://cdn.agiworkforce.com/avatars/123.jpg",
  "plan": {
    "tier": "pro",
    "display_name": "Pro",
    "status": "active",
    "current_period_end": 1735689600
  },
  "feature_flags": {
    "beta_features": true,
    "advanced_automation": true
  }
}
```

**Tauri Command** (to be implemented):

```rust
#[tauri::command]
async fn fetch_user_profile(access_token: String) -> Result<UserProfile, String> {
  // GET https://api.agiworkforce.com/api/me
  // Headers: Authorization: Bearer {access_token}
}
```

**Frontend Integration**:

```typescript
// apps/desktop/src/stores/accountStore.ts
export const useAccountStore = create<AccountState>((set, get) => ({
  // ...

  syncWithBackend: async () => {
    const { accessToken } = get();
    if (!accessToken) return;

    try {
      const profile = await invoke<UserProfile>('fetch_user_profile', {
        accessToken,
      });

      set({
        id: profile.id,
        email: profile.email,
        displayName: profile.name,
        avatar: profile.avatar_url,
        plan: profile.plan.tier,
        planDisplayName: profile.plan.display_name,
        subscriptionStatus: profile.plan.status,
        currentPeriodEnd: profile.plan.current_period_end,
        featureFlags: profile.feature_flags,
        lastSyncedAt: Date.now(),
      });
    } catch (error) {
      console.error('Failed to sync account:', error);
    }
  },
}));
```

### 3. Plan/Subscription Management

**Endpoints**:

- `GET /api/plans` → List available plans
- `POST /api/subscriptions` → Create subscription
- `PATCH /api/subscriptions/:id` → Update subscription
- `DELETE /api/subscriptions/:id` → Cancel subscription

**Tauri Commands** (to be implemented):

```rust
#[tauri::command]
async fn get_available_plans() -> Result<Vec<PricingPlan>, String> {
  // GET https://api.agiworkforce.com/api/plans
}

#[tauri::command]
async fn create_subscription(
  plan_id: String,
  payment_method_id: String
) -> Result<Subscription, String> {
  // POST https://api.agiworkforce.com/api/subscriptions
}
```

**Note**: The existing `pricingStore.ts` already defines the structure for these operations, but currently calls non-existent local Tauri commands. Once backend is ready:

1. Implement Rust HTTP client for AGI Workforce API
2. Wire up commands to real endpoints
3. Update `pricingStore` to use real commands

### 4. Token Storage

**Current Approach**: Tokens stored in Zustand persist middleware (localStorage)

**Recommended for Production**: Use secure storage

```rust
use tauri_plugin_store::StoreExt;
use keyring::Entry;

#[tauri::command]
async fn store_tokens(
  access_token: String,
  refresh_token: String
) -> Result<(), String> {
  // Option 1: Windows Credential Manager (via keyring crate)
  let entry = Entry::new("AGI Workforce", "access_token")?;
  entry.set_password(&access_token)?;

  // Option 2: Encrypted local store (tauri-plugin-store)
  // Option 3: Tauri's built-in store with encryption

  Ok(())
}
```

**Security Considerations**:

1. **Never store tokens in plaintext**
2. **Use Windows Credential Manager** for production
3. **Encrypt refresh tokens** even in secure storage
4. **Implement token rotation** on every request
5. **Clear tokens on logout**

### 5. Offline-First Sync

**Strategy**: Cache user profile locally, sync periodically

```typescript
// Sync every 15 minutes while app is open
useEffect(() => {
  const interval = setInterval(
    () => {
      accountStore.getState().syncWithBackend();
    },
    15 * 60 * 1000,
  );

  return () => clearInterval(interval);
}, []);

// Sync on app start
useEffect(() => {
  accountStore.getState().syncWithBackend();
}, []);
```

**Handle Offline**:

```typescript
syncWithBackend: async () => {
  try {
    // ... sync logic
  } catch (error) {
    if (isNetworkError(error)) {
      // Continue using cached account data
      console.warn('Offline - using cached account state');
    } else {
      // Token expired or auth error
      set({ isAuthenticated: false });
    }
  }
};
```

## Implementation Checklist

### Phase 1: Local State (DONE)

- [x] Create `DesktopAccount` type
- [x] Implement `accountStore.ts` with defaults
- [x] Update UserProfile component
- [x] Update Sidebar component
- [x] Support dev mode overrides

### Phase 2: Backend Stubs (TODO)

- [ ] Define API client interfaces (`src/api/client.ts`)
- [ ] Create placeholder Tauri commands
- [ ] Implement device link flow (UI only, mock backend)
- [ ] Add "Sign In" button to trigger device link
- [ ] Design device link code display UI

### Phase 3: Real Integration (TODO - requires web backend)

- [ ] Implement Rust HTTP client for AGI Workforce API
- [ ] Add token storage with Windows Credential Manager
- [ ] Implement `device_link_initiate` command
- [ ] Implement `device_link_poll` command
- [ ] Implement `fetch_user_profile` command
- [ ] Implement `refresh_access_token` command
- [ ] Add automatic token refresh logic
- [ ] Add logout functionality
- [ ] Handle auth errors and expired sessions

### Phase 4: Subscription Management (TODO)

- [ ] Implement `get_available_plans` command
- [ ] Implement `create_subscription` command
- [ ] Implement `update_subscription` command
- [ ] Implement `cancel_subscription` command
- [ ] Add Stripe checkout integration (if needed)
- [ ] Add billing history view
- [ ] Add usage tracking

## Security Notes

1. **HTTPS Only**: All backend requests must use HTTPS in production
2. **Certificate Pinning**: Consider pinning AGI Workforce API certificate
3. **Token Expiry**: Implement automatic token refresh before expiry
4. **Revocation**: Support immediate token revocation from web backend
5. **Device Tracking**: Backend should track device_id for audit logs

## Related Files

- `apps/desktop/src/stores/accountStore.ts` - Main account state
- `apps/desktop/src/stores/authStore.ts` - Legacy auth (to be merged)
- `apps/desktop/src/stores/pricingStore.ts` - Subscription/billing state
- `apps/desktop/src/utils/featureGates.ts` - Feature access control
- `apps/desktop/src/components/Layout/UserProfile.tsx` - User UI
- `apps/desktop/src/components/Layout/Sidebar.tsx` - Sidebar UI
