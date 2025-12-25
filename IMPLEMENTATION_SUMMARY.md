# Implementation Summary: Token Credits & Cloud LLM API

## Overview

This document summarizes the comprehensive implementation of the token credits system and cloud LLM API endpoint for AGI Workforce. The implementation enables Pro and Max tier users to use cloud credits instead of their own API keys.

## Completed Components

### 1. Database Schema & Credit Tracking ✅

**Files Created/Modified:**

- `supabase/schema.sql` - Added token credits tables via migrations

**Database Tables:**

- `token_credits` - Tracks monthly credit allocation and usage per user
- `credit_transactions` - Audit trail for all credit operations

**Database Functions:**

- `get_or_create_credit_account()` - Creates or retrieves credit account for a period
- `check_credits_available()` - Checks if user has enough credits
- `deduct_credits()` - Atomically deducts credits with row locking
- `get_credit_balance()` - Returns current credit balance with usage percentage
- `reset_credits_for_period()` - Resets credits for new billing period

**Credit Allocations:**

- Free: $0/month (0 cents)
- Hobby: $1/month (100 cents)
- Pro: $20/month (2000 cents)
- Max: $250/month (25000 cents)

### 2. LLM API Endpoint ✅

**Files Created:**

- `apps/web/app/api/llm/completion/route.ts` - Main LLM API endpoint
- `apps/web/lib/services/credit-service.ts` - Credit management service
- `apps/web/lib/services/subscription-service.ts` - Subscription management
- `apps/web/lib/services/llm-cost-calculator.ts` - Cost calculation logic
- `apps/web/lib/validations/llm.ts` - Request validation schemas

**LLM Provider Implementations:**

- `apps/web/lib/llm-providers/base.ts` - Base provider interface
- `apps/web/lib/llm-providers/openai.ts` - OpenAI provider
- `apps/web/lib/llm-providers/anthropic.ts` - Anthropic provider
- `apps/web/lib/llm-providers/google.ts` - Google provider
- `apps/web/lib/llm-providers/xai.ts` - XAI provider
- `apps/web/lib/llm-providers/qwen.ts` - Qwen provider
- `apps/web/lib/llm-providers/mistral.ts` - Mistral provider
- `apps/web/lib/llm-providers/moonshot.ts` - Moonshot provider
- `apps/web/lib/llm-providers/deepseek.ts` - DeepSeek provider
- `apps/web/lib/llm-providers/factory.ts` - Provider factory

**Features:**

- Bearer token authentication
- Subscription validation
- Credit checking before request
- Atomic credit deduction
- Cost calculation based on provider/model
- OpenAI-compatible response format
- Error handling (402 for credit limit, 401 for auth)

### 3. Webhook Integration ✅

**Files Modified:**

- `apps/web/app/api/stripe-webhook/route.ts`

**Changes:**

- Added credit allocation on subscription creation
- Added credit reset on new billing period
- Handles subscription updates and period changes
- Logs all credit operations

### 4. Cron Job for Credit Reset ✅

**Files Created:**

- `apps/web/app/api/cron/reset-credits/route.ts`

**Files Modified:**

- `apps/web/vercel.json` - Added cron configuration

**Features:**

- Runs daily at midnight UTC
- Checks for subscriptions at start of new billing period
- Resets credits for eligible users
- Protected with CRON_SECRET

### 5. API Endpoints Updated ✅

**Files Modified:**

- `apps/web/app/api/me/route.ts` - Added credit balance to user profile
- `apps/web/app/api/sync-subscription/route.ts` - Added credit balance to sync response

### 6. Desktop App Integration ✅

**Files Created:**

- `apps/desktop/src-tauri/src/core/router/providers/managed_cloud_provider.rs` - Full LLMProvider implementation

**Files Modified:**

- `apps/desktop/src-tauri/src/core/router/providers/managed_cloud.rs` - Updated to auto-get access token
- `apps/desktop/src-tauri/src/core/router/mod.rs` - Added ManagedCloud to Provider enum
- `apps/desktop/src-tauri/src/core/router/llm_router.rs` - Added ManagedCloud support
- `apps/desktop/src-tauri/src/sys/commands/llm.rs` - Added ManagedCloud configuration

**Features:**

- ManagedCloud provider implements LLMProvider trait
- Automatically retrieves access token from keyring
- Supports all LLM features (streaming, vision, function calling)
- Integrated into router candidate selection

### 7. Documentation ✅

**Files Modified:**

- `apps/web/VERCEL_ENV_VARS.md` - Added LLM provider API keys and CRON_SECRET

## API Endpoints

### POST `/api/llm/completion`

**Authentication:** Bearer token (Supabase JWT)

**Request Body:**

```json
{
  "model": "gpt-5",
  "messages": [
    {
      "role": "user",
      "content": "Hello!"
    }
  ],
  "temperature": 0.7,
  "max_tokens": 1000
}
```

**Response (200):**

```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you?"
      },
      "finish_reason": "stop"
    }
  ],
  "model": "gpt-5",
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 8,
    "total_tokens": 18
  },
  "credits": {
    "cost_cents": 5,
    "remaining_cents": 2495
  }
}
```

**Error Responses:**

- `401` - Invalid or missing authentication token
- `402` - Credit limit reached
- `403` - No active subscription or subscription not active
- `400` - Invalid request body

### GET `/api/cron/reset-credits`

**Authentication:** Bearer token (CRON_SECRET)

**Response:**

```json
{
  "message": "Credit reset completed",
  "total": 10,
  "reset": 8,
  "errors": 0
}
```

## Environment Variables

### Required for LLM API

- `OPENAI_API_KEY` - OpenAI API key (optional, for cloud credits)
- `ANTHROPIC_API_KEY` - Anthropic API key (optional)
- `GOOGLE_API_KEY` - Google API key (optional)
- `XAI_API_KEY` - XAI API key (optional)
- `QWEN_API_KEY` - Qwen API key (optional)
- `MISTRAL_API_KEY` - Mistral API key (optional)
- `MOONSHOT_API_KEY` - Moonshot API key (optional)
- `DEEPSEEK_API_KEY` - DeepSeek API key (optional)

### Required for Cron

- `CRON_SECRET` - Secret token for cron endpoint protection

## Usage Flow

1. **User subscribes to Pro/Max plan**
   - Webhook receives subscription event
   - Credits allocated based on plan tier
   - Credit account created for billing period

2. **User makes LLM request via desktop app**
   - Desktop app calls `/api/llm/completion` with bearer token
   - API validates subscription and checks credits
   - If credits available, request is routed to appropriate provider
   - Credits deducted after successful request
   - Response includes remaining credits

3. **Monthly credit reset**
   - Cron job runs daily at midnight UTC
   - Checks for subscriptions at start of new period
   - Resets credits for new billing period

## Decision Logic (Future Enhancement)

The current implementation provides the infrastructure for choosing between user API keys and cloud credits. The decision logic can be enhanced with:

1. **User Preference Setting**
   - Add setting: "Use Cloud Credits" vs "Use My API Keys"
   - Default: Use cloud credits if Pro/Max subscription

2. **Smart Routing**
   - Check subscription tier
   - Check available credits
   - Check if user has API key configured
   - Route to ManagedCloud if:
     - User prefers cloud credits AND
     - Subscription is Pro/Max AND
     - Credits available
   - Otherwise route to user's API key provider

3. **Fallback Logic**
   - If cloud credits exhausted, fallback to user API keys
   - If user API keys not configured, show error

## Testing Checklist

- [ ] Test credit allocation on subscription creation
- [ ] Test credit deduction on LLM request
- [ ] Test credit limit reached (402 error)
- [ ] Test monthly credit reset
- [ ] Test all LLM providers work correctly
- [ ] Test authentication failures
- [ ] Test subscription status validation
- [ ] Test cost calculation accuracy
- [ ] Test desktop app ManagedCloud provider
- [ ] Test credit balance display in UI

## Next Steps

1. **UI Updates**
   - Display credit balance in desktop app
   - Show credit usage in analytics
   - Add warning when credits are low
   - Show credit reset date

2. **Decision Logic Implementation**
   - Add user preference for cloud credits vs own keys
   - Implement smart routing in router
   - Add fallback logic

3. **Testing**
   - End-to-end testing of complete flow
   - Load testing for credit deduction
   - Edge case testing

4. **Monitoring**
   - Add metrics for credit usage
   - Alert on credit exhaustion
   - Track cost per user

## Notes

- All credit amounts are stored in cents (integer) to avoid floating point issues
- Credit deduction is atomic using database row locking
- The LLM API endpoint is rate-limited using the existing rate limit infrastructure
- All operations are logged using structured logging (pino)
- Error handling follows the centralized error handler pattern
