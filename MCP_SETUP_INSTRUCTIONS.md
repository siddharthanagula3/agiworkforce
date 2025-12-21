# Complete MCP-Based Setup Instructions

## Current Status (Verified via MCP Tools)

### ✅ Verified via Supabase MCP:

- Hobby tier exists in `pricing_plans` table
- Price set to 1000 cents ($10/month)
- Interval set to 'month'
- **ISSUE**: `stripe_price_id` still points to old $0 one-time price: `price_1RxhcU0atLU7AWGTkVn2j7DS`

### ✅ Verified via Stripe MCP:

- Product `prod_StUbhCc9Y4aVwP` exists but still named "FREE" (needs update to "Hobby")
- Current price `price_1RxhcU0atLU7AWGTkVn2j7DS` is one-time $0 (WRONG - needs new recurring $10/month price)

### ✅ Verified via Vercel MCP:

- Project: `prj_ZbUvWLIJ5O5Fei5sP39pQ5AaKj0R` (agiworkforce)
- Latest deployment: `dpl_5aYEG2R7FjrtnTvGgLwHLzMqRwgt` (READY)
- **MISSING**: `STRIPE_PRICE_HOBBY_MONTHLY` environment variable

## Complete Setup Steps

### Step 1: Create Stripe Price & Update Product

Since Stripe MCP tools are read-only, you need to run the script:

```bash
cd /Users/siddhartha/Desktop/agiworkforce

# Option A: Run the complete script (updates Stripe + Supabase)
STRIPE_SECRET_KEY=your_stripe_secret_key \
SUPABASE_URL=your_supabase_url \
SUPABASE_SERVICE_KEY=your_service_role_key \
node scripts/update-stripe-hobby-complete.js

# Option B: Run just Stripe update (then manually update Supabase)
STRIPE_SECRET_KEY=your_stripe_secret_key \
node scripts/create-hobby-price.js
```

The script will:

1. ✅ Update product `prod_StUbhCc9Y4aVwP` name from "FREE" to "Hobby"
2. ✅ Create new recurring price: $10/month (1000 cents)
3. ✅ Update Supabase `pricing_plans` table with new price ID
4. ✅ Output the price ID for Vercel

### Step 2: Add Vercel Environment Variable

**Note**: Vercel MCP doesn't support adding environment variables directly. You need to:

1. Go to: https://vercel.com/siddharthanagula4/agiworkforce/settings/environment-variables
2. Add new variable:
   - **Key**: `STRIPE_PRICE_HOBBY_MONTHLY`
   - **Value**: `[Price ID from Step 1]`
   - **Environment**: Production, Preview, Development (select all)
3. Redeploy the project

### Step 3: Verify End-to-End

After completing steps 1-2, verify:

```bash
# Check Supabase (via MCP or SQL)
# Should show new price_id in pricing_plans table

# Check Stripe (via Dashboard or MCP)
# Product should be named "Hobby"
# New recurring $10/month price should exist

# Test checkout flow
# Visit /pricing page and click "Start Free Trial" on Hobby plan
# Should redirect to Stripe with 90-day trial
```

## MCP Tool Limitations

- **Stripe MCP**: Read-only (can list/fetch, cannot create/update)
- **Supabase MCP**: Can execute SQL and apply migrations ✅
- **Vercel MCP**: Can read project/deployment info, cannot manage env vars

## Automated Script

I've created `scripts/update-stripe-hobby-complete.js` which:

- Updates Stripe product name
- Creates new recurring price
- Updates Supabase automatically
- Outputs the price ID for Vercel

Run it with your credentials to complete the setup in one command!
