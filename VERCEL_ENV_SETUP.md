# Vercel Environment Variable Setup

## Required Environment Variable

**Variable Name**: `STRIPE_PRICE_HOBBY_MONTHLY`  
**Variable Value**: `price_1SgdA40atLU7AWGT24iSkHPh`

## Setup Instructions

1. Go to Vercel Dashboard: https://vercel.com/siddharthanagula4/agiworkforce/settings/environment-variables

2. Click **Add New** or **Add Environment Variable**

3. Enter:
   - **Key**: `STRIPE_PRICE_HOBBY_MONTHLY`
   - **Value**: `price_1SgdA40atLU7AWGT24iSkHPh`
   - **Environment**: Select all (Production, Preview, Development)

4. Click **Save**

5. Redeploy the project (or wait for next automatic deployment)

## Verification

After adding the variable, the checkout API will be able to:

- Create checkout sessions for Hobby plan
- Apply 90-day trial period automatically
- Charge $10/month after trial ends

## Current Status

- ✅ Stripe price created: `price_1SgdA40atLU7AWGT24iSkHPh` ($10/month recurring)
- ✅ Supabase updated with new price ID
- ⚠️ Vercel environment variable: **NEEDS TO BE ADDED MANUALLY** (Vercel MCP cannot add env vars)
