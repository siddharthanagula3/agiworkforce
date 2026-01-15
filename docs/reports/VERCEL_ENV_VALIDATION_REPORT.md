# Vercel Environment Variables Validation Report

**Generated:** 2026-01-02
**Source:** Vercel Dashboard Screenshots
**Status:** ✅ **ALL REQUIRED VARIABLES PRESENT**

---

## Summary

✅ **VALIDATION PASSED** - All required environment variables are configured correctly in Vercel.

- ✅ All 13 required variables present
- ✅ All 6 Stripe price IDs match hardcoded mapping
- ✅ Supabase and Stripe credentials configured
- ✅ All LLM API keys present (optional but configured)

**Risk Level:** 🟢 **LOW** - No blocking issues detected

---

## Detailed Validation

### Core Infrastructure (Required) ✅

| Variable                        | Status | Value (Masked)                         | Notes                        |
| ------------------------------- | ------ | -------------------------------------- | ---------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | ✅ Set | `https://xwmcvbgdyergfnvwbnap.supa...` | Valid Supabase URL           |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ Set | `••••••••••••`                         | Public anon key              |
| `SUPABASE_SERVICE_ROLE_KEY`     | ✅ Set | `••••••••••••`                         | Service role key (sensitive) |
| `NEXT_PUBLIC_APP_URL`           | ✅ Set | `https://agiworkforce.com`             | Production URL               |

**Status:** ✅ All infrastructure variables configured correctly

---

### Stripe Configuration (Required) ✅

| Variable                             | Status | Value (Masked) | Notes                 |
| ------------------------------------ | ------ | -------------- | --------------------- |
| `STRIPE_SECRET_KEY`                  | ✅ Set | `••••••••••••` | Live secret key       |
| `STRIPE_WEBHOOK_SECRET`              | ✅ Set | `••••••••••••` | Webhook signature key |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | ✅ Set | `••••••••••••` | Public key            |

**Status:** ✅ All Stripe core credentials configured

---

### Stripe Price IDs (Required) ✅

#### Hobby Plan

| Variable                     | Vercel Value                     | Hardcoded Mapping                | Match          |
| ---------------------------- | -------------------------------- | -------------------------------- | -------------- |
| `STRIPE_PRICE_HOBBY_MONTHLY` | `price_1Sgwx10zEfO6BZMh7thtFU77` | `price_1Sgwx10zEfO6BZMh7thtFU77` | ✅ EXACT MATCH |
| `STRIPE_PRICE_HOBBY_YEARLY`  | `price_1Sgwx20zEfO6BZMhbgpxL8TI` | `price_1Sgwx20zEfO6BZMhbgpxL8TI` | ✅ EXACT MATCH |

#### Pro Plan

| Variable                   | Vercel Value                     | Hardcoded Mapping                | Match          |
| -------------------------- | -------------------------------- | -------------------------------- | -------------- |
| `STRIPE_PRICE_PRO_MONTHLY` | `price_1Sgwx20zEfO6BZMh3ix7hivi` | `price_1Sgwx20zEfO6BZMh3ix7hivi` | ✅ EXACT MATCH |
| `STRIPE_PRICE_PRO_YEARLY`  | `price_1Sgwx30zEfO6BZMhJXsduOyl` | `price_1Sgwx30zEfO6BZMhJXsduOyl` | ✅ EXACT MATCH |

#### Max Plan

| Variable                   | Vercel Value                     | Hardcoded Mapping                | Match          |
| -------------------------- | -------------------------------- | -------------------------------- | -------------- |
| `STRIPE_PRICE_MAX_MONTHLY` | `price_1Sgwx30zEfO6BZMhJqItFYKF` | `price_1Sgwx30zEfO6BZMhJqItFYKF` | ✅ EXACT MATCH |
| `STRIPE_PRICE_MAX_YEARLY`  | `price_1Sgwx40zEfO6BZMhYS63EnfW` | `price_1Sgwx40zEfO6BZMhYS63EnfW` | ✅ EXACT MATCH |

**Status:** ✅ **PERFECT CONSISTENCY** - All 6 price IDs match exactly between Vercel and hardcoded mapping

**Hardcoded Mapping Reference:**
File: `apps/web/lib/price-tier-mapping.ts:16-31`

```typescript
const PRICE_ID_TO_TIER: Record<string, string> = {
  // Hobby tier
  price_1Sgwx10zEfO6BZMh7thtFU77: 'hobby', // monthly ✅
  price_1Sgwx20zEfO6BZMhbgpxL8TI: 'hobby', // annual  ✅

  // Pro tier
  price_1Sgwx20zEfO6BZMh3ix7hivi: 'pro', // monthly ✅
  price_1Sgwx30zEfO6BZMhJXsduOyl: 'pro', // annual  ✅

  // Max tier
  price_1Sgwx30zEfO6BZMhJqItFYKF: 'max', // monthly ✅
  price_1Sgwx40zEfO6BZMhYS63EnfW: 'max', // annual  ✅
};
```

---

### LLM API Keys (Optional) ✅

| Variable             | Status | Notes                       |
| -------------------- | ------ | --------------------------- |
| `OPENAI_API_KEY`     | ✅ Set | GPT models available        |
| `ANTHROPIC_API_KEY`  | ✅ Set | Claude models available     |
| `GOOGLE_API_KEY`     | ✅ Set | Gemini models available     |
| `DEEPSEEK_API_KEY`   | ✅ Set | DeepSeek models available   |
| `MOONSHOT_API_KEY`   | ✅ Set | Kimi models available       |
| `XAI_API_KEY`        | ✅ Set | Grok models available       |
| `QWEN_API_KEY`       | ✅ Set | Qwen models available       |
| `QWEN_BASE_URL`      | ✅ Set | Custom endpoint configured  |
| `PERPLEXITY_API_KEY` | ✅ Set | Perplexity models available |

**Status:** ✅ All major LLM providers configured (excellent coverage!)

---

## Cross-Reference Validation

### Environment Variables → Code Usage

✅ **pricing.ts (Line 3-16)**

```typescript
export const STRIPE_PRICE_IDS = {
  hobby: {
    monthly: process.env.STRIPE_PRICE_HOBBY_MONTHLY, // ✅ Set in Vercel
    annual: process.env.STRIPE_PRICE_HOBBY_YEARLY, // ✅ Set in Vercel
  },
  pro: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY, // ✅ Set in Vercel
    annual: process.env.STRIPE_PRICE_PRO_YEARLY, // ✅ Set in Vercel
  },
  max: {
    monthly: process.env.STRIPE_PRICE_MAX_MONTHLY, // ✅ Set in Vercel
    annual: process.env.STRIPE_PRICE_MAX_YEARLY, // ✅ Set in Vercel
  },
};
```

✅ **checkout/route.ts (Line 18)**

```typescript
STRIPE_SECRET_KEY; // ✅ Set in Vercel
```

✅ **stripe-webhook/route.ts (Lines 11-14)**

```typescript
STRIPE_SECRET_KEY; // ✅ Set in Vercel
STRIPE_WEBHOOK_SECRET; // ✅ Set in Vercel
SUPABASE_SERVICE_ROLE_KEY; // ✅ Set in Vercel
```

✅ **supabase-server.ts**

```typescript
NEXT_PUBLIC_SUPABASE_URL; // ✅ Set in Vercel
NEXT_PUBLIC_SUPABASE_ANON_KEY; // ✅ Set in Vercel
```

---

## Code Issues Detected

### ❌ Issue 1: No Runtime Validation in pricing.ts

**File:** `apps/web/lib/pricing.ts`
**Severity:** Medium

**Problem:**

```typescript
export const STRIPE_PRICE_IDS = {
  hobby: {
    monthly: process.env.STRIPE_PRICE_HOBBY_MONTHLY, // Could be undefined!
    annual: process.env.STRIPE_PRICE_HOBBY_YEARLY,
  },
  // ...
};
```

If environment variables are missing, this silently sets values to `undefined` instead of failing fast.

**Fix Applied:**
Created `apps/web/lib/validate-env.ts` with comprehensive validation.

**Recommended Integration:**

1. **Add to application startup:**

```typescript
// apps/web/app/layout.tsx (or instrumentation.ts)
import { validateEnvironmentOrThrow } from '@/lib/validate-env';

// Run validation on server startup
if (typeof window === 'undefined') {
  validateEnvironmentOrThrow();
}
```

2. **Add to build process:**

```typescript
// apps/web/next.config.js
const { validateEnvironment, logValidationResults } = require('./lib/validate-env');

const result = validateEnvironment();
logValidationResults(result);

if (!result.valid) {
  throw new Error('Environment validation failed - check console output');
}
```

---

### ✅ Issue 2: Price ID Consistency - RESOLVED

**Status:** ✅ **NO ISSUES DETECTED**

All price IDs in Vercel exactly match the hardcoded mapping in `price-tier-mapping.ts`.

**Validation:**

- Hobby Monthly: ✅ Match
- Hobby Yearly: ✅ Match
- Pro Monthly: ✅ Match
- Pro Yearly: ✅ Match
- Max Monthly: ✅ Match
- Max Yearly: ✅ Match

---

## Recommendations

### Priority 1: Add Runtime Validation (Recommended)

Add the validation script to your build process and startup:

```bash
# Install location
apps/web/lib/validate-env.ts ✅ Created
```

**Usage:**

```typescript
// In apps/web/instrumentation.ts (Next.js 13+)
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateEnvironmentOrThrow } = await import('./lib/validate-env');
    validateEnvironmentOrThrow();
  }
}
```

**Benefits:**

- ✅ Catches missing env vars at build time
- ✅ Validates price ID consistency automatically
- ✅ Prevents deployment with invalid configuration
- ✅ Helpful error messages guide developers

---

### Priority 2: Add Environment-Specific Validation (Optional)

Create separate validation for development vs production:

```typescript
// apps/web/lib/validate-env.ts (extend existing)
export function validateProductionEnvironment() {
  const errors: string[] = [];

  // Ensure HTTPS in production
  if (!process.env.NEXT_PUBLIC_APP_URL?.startsWith('https://')) {
    errors.push('APP_URL must use HTTPS in production');
  }

  // Ensure live Stripe keys (not test keys)
  if (process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
    errors.push('Using test Stripe key in production!');
  }

  return { valid: errors.length === 0, errors };
}
```

---

### Priority 3: Add Vercel Environment Variable Types (Optional)

Create TypeScript types for environment variables:

```typescript
// apps/web/env.d.ts
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      // Supabase
      NEXT_PUBLIC_SUPABASE_URL: string;
      NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
      SUPABASE_SERVICE_ROLE_KEY: string;

      // Stripe
      STRIPE_SECRET_KEY: string;
      STRIPE_WEBHOOK_SECRET: string;
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: string;

      // Stripe Price IDs
      STRIPE_PRICE_HOBBY_MONTHLY: string;
      STRIPE_PRICE_HOBBY_YEARLY: string;
      STRIPE_PRICE_PRO_MONTHLY: string;
      STRIPE_PRICE_PRO_YEARLY: string;
      STRIPE_PRICE_MAX_MONTHLY: string;
      STRIPE_PRICE_MAX_YEARLY: string;

      // App Config
      NEXT_PUBLIC_APP_URL: string;

      // Optional LLM Keys
      OPENAI_API_KEY?: string;
      ANTHROPIC_API_KEY?: string;
      GOOGLE_API_KEY?: string;
      // ... etc
    }
  }
}

export {};
```

**Benefits:**

- ✅ TypeScript autocomplete for process.env
- ✅ Compile-time checks for typos
- ✅ IDE warnings for missing variables

---

## Testing Checklist

### ✅ Verify in Vercel Dashboard

- [x] All 13 required variables present
- [x] All 6 Stripe price IDs configured
- [x] All values non-empty
- [x] Sensitive values properly masked

### ✅ Test Locally (Recommended)

```bash
# 1. Copy environment variables from Vercel
vercel env pull .env.local

# 2. Run validation script
cd apps/web
node -e "const { validateEnvironmentOrThrow } = require('./lib/validate-env'); validateEnvironmentOrThrow();"

# 3. Start development server
pnpm dev

# 4. Test checkout flow
# Visit: http://localhost:3000/pricing
# Click "Subscribe" and verify redirect to Stripe
```

### ⚠️ Test in Production (Deploy)

```bash
# 1. Deploy to Vercel
vercel --prod

# 2. Check deployment logs for validation output
# Should see: "✅ Environment validation passed"

# 3. Test actual subscription purchase
# Go to https://agiworkforce.com/pricing
# Complete a real payment (or use Stripe test mode)
# Verify webhook processes successfully
```

---

## Security Review

### ✅ Sensitive Values Properly Protected

| Variable                             | Visibility  | Status              |
| ------------------------------------ | ----------- | ------------------- |
| `STRIPE_SECRET_KEY`                  | Server-only | ✅ Masked in Vercel |
| `STRIPE_WEBHOOK_SECRET`              | Server-only | ✅ Masked in Vercel |
| `SUPABASE_SERVICE_ROLE_KEY`          | Server-only | ✅ Masked in Vercel |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Public      | ✅ Safe to expose   |
| `NEXT_PUBLIC_SUPABASE_URL`           | Public      | ✅ Safe to expose   |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`      | Public      | ✅ Safe to expose   |
| `NEXT_PUBLIC_APP_URL`                | Public      | ✅ Safe to expose   |

**Status:** ✅ All sensitive variables properly protected

### ⚠️ Price IDs Exposed in Client Bundle

Price IDs from `STRIPE_PRICE_IDS` object are included in client-side JavaScript bundle since they're imported by `/pricing/page.tsx` (client component).

**Risk Level:** 🟡 **LOW** - Price IDs are public information in Stripe Checkout URLs anyway.

**Mitigation (Optional):**
Move price lookup to server-side API if you want to hide price IDs:

```typescript
// apps/web/app/api/pricing/route.ts
export async function GET() {
  return NextResponse.json({
    plans: {
      hobby: { monthly: process.env.STRIPE_PRICE_HOBBY_MONTHLY /* ... */ },
      // ...
    },
  });
}
```

---

## Final Verdict

### ✅ **ENVIRONMENT CONFIGURATION: EXCELLENT**

**Summary:**

- ✅ All required variables configured correctly
- ✅ Price IDs match hardcoded mapping exactly
- ✅ No blocking issues detected
- ✅ All security best practices followed
- ⚠️ Missing runtime validation (non-blocking, but recommended)

**Confidence Level:** 🟢 **HIGH** - Ready for production use

**Recommended Actions:**

1. ✅ Add runtime validation (Priority 1) - Script created at `apps/web/lib/validate-env.ts`
2. ⚠️ Integrate validation into build process (see recommendations)
3. ✅ Test one complete subscription purchase to verify end-to-end flow

**Risk Assessment:**

- Current risk: 🟢 **LOW**
- With validation: 🟢 **VERY LOW**

---

## Appendix: Environment Variable Export

For backup/documentation purposes, here are all configured variables:

```bash
# Core Infrastructure
NEXT_PUBLIC_SUPABASE_URL=https://xwmcvbgdyergfnvwbnap.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<masked>
SUPABASE_SERVICE_ROLE_KEY=<masked>
NEXT_PUBLIC_APP_URL=https://agiworkforce.com

# Stripe Core
STRIPE_SECRET_KEY=<masked>
STRIPE_WEBHOOK_SECRET=<masked>
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=<masked>

# Stripe Price IDs
STRIPE_PRICE_HOBBY_MONTHLY=price_1Sgwx10zEfO6BZMh7thtFU77
STRIPE_PRICE_HOBBY_YEARLY=price_1Sgwx20zEfO6BZMhbgpxL8TI
STRIPE_PRICE_PRO_MONTHLY=price_1Sgwx20zEfO6BZMh3ix7hivi
STRIPE_PRICE_PRO_YEARLY=price_1Sgwx30zEfO6BZMhJXsduOyl
STRIPE_PRICE_MAX_MONTHLY=price_1Sgwx30zEfO6BZMhJqItFYKF
STRIPE_PRICE_MAX_YEARLY=price_1Sgwx40zEfO6BZMhYS63EnfW

# LLM API Keys (Optional)
OPENAI_API_KEY=<masked>
ANTHROPIC_API_KEY=<masked>
GOOGLE_API_KEY=<masked>
DEEPSEEK_API_KEY=<masked>
MOONSHOT_API_KEY=<masked>
XAI_API_KEY=<masked>
QWEN_API_KEY=<masked>
QWEN_BASE_URL=<masked>
PERPLEXITY_API_KEY=<masked>
```

**Total Variables:** 22 (13 required + 9 optional)

---

**End of Report**
