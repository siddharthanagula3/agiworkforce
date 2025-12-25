# Smart Routing Implementation Summary

## Overview

The smart routing system has been fully implemented to allow Pro/Max users to choose between using cloud credits or their own API keys for LLM requests.

## Implementation Details

### 1. Router Preferences Enhancement ✅

**File:** `apps/desktop/src-tauri/src/core/router/llm_router.rs`

- Added `prefer_cloud_credits: bool` field to `RouterPreferences` struct
- Updated `candidates()` method to prioritize `ManagedCloud` provider when:
  - `prefer_cloud_credits` is `true`
  - `ManagedCloud` provider is configured and available
- ManagedCloud is added as the first candidate with reason "cloud-credits-preference"

### 2. Request Structures Updated ✅

**Files:**

- `apps/desktop/src-tauri/src/sys/commands/llm.rs` - `LLMSendMessageRequest`
- `apps/desktop/src-tauri/src/sys/commands/chat.rs` - `ChatSendMessageRequest`

- Added `prefer_cloud_credits: bool` field to both request structures
- Default value is `false` (using `#[serde(default)]`)
- Field is passed through to `RouterPreferences` when creating routing preferences

### 3. TypeScript Integration ✅

**File:** `apps/desktop/src/components/UnifiedAgenticChat/index.tsx`

- Added import for `useAccountStore` to access user's plan
- Reads `llmConfig.useCloudCredits` preference from settings store
- Reads user's `plan` from account store
- Calculates `preferCloudCredits` as:
  ```typescript
  const preferCloudCredits =
    (plan === 'pro' || plan === 'max') && (llmConfig?.useCloudCredits ?? true);
  ```
- Passes `preferCloudCredits` to `chat_send_message` Tauri command

### 4. Settings Store ✅

**File:** `apps/desktop/src/stores/settingsStore.ts`

- Added `useCloudCredits: boolean` to `LLMConfig` interface
- Default value is `true` (prefer cloud credits)
- Added `setUseCloudCredits()` setter function
- When testing API keys, explicitly sets `preferCloudCredits: false` to test actual API keys

### 5. Settings UI ✅

**File:** `apps/desktop/src/components/Settings/SettingsPanel.tsx`

- Added toggle switch in API Keys tab for Pro/Max users
- Switch controls `useCloudCredits` preference
- Only visible for Pro/Max tier users
- Includes helpful description text

## Routing Logic Flow

1. **User sends message** → `UnifiedAgenticChat` component
2. **Check preferences**:
   - User plan (Pro/Max?)
   - `useCloudCredits` setting
   - Calculate `preferCloudCredits`
3. **Pass to backend** → `chat_send_message` Tauri command
4. **Create RouterPreferences** → Include `prefer_cloud_credits` flag
5. **Router candidates()** → If `prefer_cloud_credits` is true:
   - Add `ManagedCloud` as first candidate
   - Reason: "cloud-credits-preference"
6. **Try candidates in order**:
   - First: ManagedCloud (if preferred and available)
   - Then: Context-based suggestions
   - Then: Strategy-based candidates
   - Finally: Fallback providers

## Fallback Behavior

- If ManagedCloud fails (e.g., credits exhausted, auth error), router automatically tries next candidate
- If user's API keys are configured, they will be used as fallback
- Error messages are clear about which provider failed

## User Experience

### Pro/Max Users

- **Default**: Cloud credits are used (unless preference is disabled)
- **Toggle**: Can switch to use own API keys via Settings
- **Credit Display**: See remaining credits in UserProfile popover and Analytics dashboard
- **Automatic Fallback**: If credits exhausted, falls back to own API keys (if configured)

### Free/Hobby Users

- Cloud credits preference is not available
- Must use own API keys
- No toggle shown in Settings

## Testing Considerations

- API key testing explicitly disables cloud credits to test actual keys
- Credit balance is fetched and displayed in real-time
- Router logs show which provider was selected and why

## Future Enhancements

1. **Credit Check Before Routing**: Could check credit balance before prioritizing ManagedCloud
2. **Smart Fallback**: Automatically switch to own API keys when credits are low
3. **Usage Analytics**: Track which routing method was used
4. **Cost Comparison**: Show cost difference between cloud credits and own API keys

## Notes

- The preference is stored in localStorage via Zustand persist middleware
- ManagedCloud provider must be configured (has access token) to be used
- Router respects explicit provider selection (user override takes precedence)
