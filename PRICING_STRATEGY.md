# AGI Workforce Subscription & Pricing Strategy

## Financial Model & Profitability Analysis

### 1. STRIPE FEES & NET REVENUE CALCULATION

**Stripe Fee Structure:** 2.9% + $0.30 per transaction

#### Net Revenue After Stripe Fees

```
Gross Revenue: $X
Stripe Fee: ($X × 0.029) + $0.30
Net Revenue: $X - (($X × 0.029) + $0.30)
Net Revenue: $X × 0.971 - $0.30
```

**Example:**

- Monthly Plan: $29.99
- Stripe Fee: ($29.99 × 0.029) + $0.30 = $0.87 + $0.30 = $1.17
- Net Revenue: $29.99 - $1.17 = **$28.82**

- Annual Plan: $299.88
- Stripe Fee: ($299.88 × 0.029) + $0.30 = $8.70 + $0.30 = $9.00
- Net Revenue: $299.88 - $9.00 = **$290.88**

---

### 2. CURRENT PLAN BREAKDOWN & PROFITABILITY

| Plan  | Monthly | Annual    | Monthly Net | Annual Net | Annual Per Month |
| ----- | ------- | --------- | ----------- | ---------- | ---------------- |
| Hobby | $10     | $59.88    | $9.71       | $50.88     | $4.24            |
| Pro   | $29.99  | $299.88   | $28.82      | $290.88    | $24.24           |
| Max   | $299.99 | $2,999.88 | $291.02     | $2,990.88  | $249.24          |

**Key Insight:** Annual payments give you better margins ($9 vs $4.24 per month for Hobby).

---

### 3. COST STRUCTURE FOR LLM TOKENS & API CALLS

You need to estimate your **Cost of Goods Sold (COGS)** per plan:

#### Token Costs (Approximate Cost to You)

| Model             | Cost per 1M Input Tokens | Cost per 1M Output Tokens |
| ----------------- | ------------------------ | ------------------------- |
| Claude Haiku 4.5  | $0.80                    | $4.00                     |
| Claude Sonnet 4.5 | $3.00                    | $15.00                    |
| Claude Opus 4.5   | $15.00                   | $75.00                    |
| GPT-4o Mini       | $0.15                    | $0.60                     |
| GPT-5.2           | $12.00                   | $48.00                    |
| Gemini 3 Pro      | $1.25                    | $5.00                     |

**Assumptions:**

- Average conversation: 2,000 input tokens + 1,000 output tokens
- Cost per conversation: ~$0.01-$0.05 depending on model

#### API Call Costs

| API Type           | Typical Cost              |
| ------------------ | ------------------------- |
| Search API         | $0.001 - $0.005 per call  |
| Browser Automation | $0.01 - $0.05 per action  |
| Vision/OCR         | $0.10 - $0.50 per image   |
| Video Generation   | $2.00 - $10.00 per minute |

---

### 4. RECOMMENDED CLOUD CREDIT ALLOCATION

**Strategy:** Credits should be 30-40% of monthly plan price to maintain profitability

#### Current vs Recommended Allocation

| Plan             | Monthly Revenue | 30% Credits | 35% Credits | 40% Credits |
| ---------------- | --------------- | ----------- | ----------- | ----------- |
| Hobby ($10/mo)   | $28.82/year     | $3          | $3.50       | $4          |
| Pro ($29.99/mo)  | $28.82/mo       | $9          | $10.50      | $12         |
| Max ($299.99/mo) | $291.02/mo      | $90         | $105        | $120        |

**Recommended Allocation (35% Rule):**

- **Hobby**: $3.50/month tokens ($42/year)
- **Pro**: $10.50/month tokens (was $20 - **reduce to improve margins**)
- **Max**: $105/month tokens (was $250 - **reduce to improve margins**)
- **Enterprise**: 25-30% of their contract value

**Why This Works:**

- Costs you $0.35 in actual API calls per $1 in credits (assuming 35% redemption)
- Leaves you with solid margin
- Users feel valued but you remain profitable

---

### 5. API PRICING FOR OVERAGE & PAY-AS-YOU-GO

**Pricing Tiers Based on User Adoption:**

#### Tier 1: Pay Per API Call (For Free/Hobby Users)

```
Web Requests: $0.001 per call
Vision Analysis: $0.10 per image
OCR Processing: $0.05 per page
Email: $0.01 per email processed
Database Queries: $0.001 per 1000 queries
```

#### Tier 2: Token-Based Credits (Recommended for Pro/Max)

```
Cost to You: $0.005 per LLM token (average)
Charge Users: $0.01-$0.015 per 1000 tokens

Example:
- Hobby user: Pay $0.005 per 1000 tokens
- Pro user: Pay $0.008 per 1000 tokens
- Max user: Pay $0.0075 per 1000 tokens (slight discount for volume)
```

**Better Alternative: Bundled Credits System**

```
$1 Credit Bundle = $1.25 charge (20% markup)
Users prepay, you reduce payment processing

$1 in credits to you = $0.35 in actual LLM costs
```

#### Tier 3: Volume-Based Discounts

```
Free/Hobby: Base price
Pro: 10% discount on top-ups
Max: 15% discount on top-ups
Enterprise: 20-25% discount based on volume commitment
```

---

### 6. PROFITABILITY MATRIX

**Scenario: Break-even Analysis**

Assume:

- 30% monthly churn rate (acceptable SaaS)
- 5% monthly refund/chargeback rate
- $500/month platform maintenance costs

#### Hobby Plan ($10/month)

```
100 Hobby users @ $10/month = $1,000
After Stripe (2.9% + $0.30): $1,000 × 0.971 - (100 × $0.30) = $941
After 5% chargebacks: $941 × 0.95 = $893.45

Monthly Costs:
- Cloud Credits ($3.50): 100 × $3.50 × $0.35 (cost ratio) = $122.50
- Platform Maintenance: $500 / 1000 users = $0.50 per user × 100 = $50
- Support / Operations: $50/month per 100 users = $50
- Total Cost: $222.50

Gross Profit: $893.45 - $222.50 = $670.95/month per 100 users
Profit Margin: 75%
```

#### Pro Plan ($29.99/month)

```
100 Pro users @ $29.99/month = $2,999
After Stripe: $2,999 × 0.971 - (100 × $0.30) = $2,880.73
After 5% chargebacks: $2,880.73 × 0.95 = $2,736.69

Monthly Costs:
- Cloud Credits ($10.50): 100 × $10.50 × $0.35 = $367.50
- Platform Maintenance: $100 × $0.50 = $50
- Support: $100/month per 100 Pro users = $100
- Total Cost: $517.50

Gross Profit: $2,736.69 - $517.50 = $2,219.19/month
Profit Margin: 81%
```

#### Max Plan ($299.99/month)

```
10 Max users @ $299.99/month = $2,999.90
After Stripe: $2,999.90 × 0.971 - (10 × $0.30) = $2,907.09
After 5% chargebacks: $2,907.09 × 0.95 = $2,761.73

Monthly Costs:
- Cloud Credits ($105): 10 × $105 × $0.35 = $367.50
- Platform Maintenance: 10 × $0.50 = $5
- Support (dedicated): $200/month for 10 Max users = $200
- Total Cost: $572.50

Gross Profit: $2,761.73 - $572.50 = $2,189.23/month
Profit Margin: 79%
```

---

### 7. HANDLING REFUNDS & CHARGEBACKS

**Stripe Fee Not Refundable:** You eat the 2.9% + $0.30

```
User refunds $29.99 Pro plan:
- You refund user: $29.99
- Stripe fee lost: $1.17 (non-refundable)
- Your actual cost: $29.99 + $1.17 = $31.16
- Plus credit usage cost: $3.50 (if already used)
- Total loss: ~$34.66
```

**Mitigation Strategies:**

1. **30-Day Money-Back Guarantee (NOT 7 days)**
   - Reduces impulsive refunds
   - Covers you if they use the service and still request refund

2. **No Refunds for Used Credits**
   - "Credits are non-refundable once used"
   - Refunds only for unused balance

3. **Pro-Rated Refunds for Early Cancellation**

   ```
   Days Used: 5/30
   Plan: $29.99
   Refund: $29.99 × (25/30) = $24.99
   Stripe fee: Still eat $1.17
   ```

4. **Chargeback Protection**
   - Require email verification before purchase
   - Clear billing communication
   - Keep records of credit usage
   - Stripe will support you if you have evidence of usage

---

### 8. RECOMMENDED PRICING STRUCTURE

#### Option A: Current Plan (Adjust Credits)

```
FREE
- Local models only
- No API credits
- Limited to 5 tasks/day

HOBBY: $10/month
- All cloud models
- $3.50/month in credits
- 50 API calls/month
- Community support
- Good for: Students, hobbyists

PRO: $29.99/month (Most Popular)
- Unlimited automations
- $10.50/month in credits
- 5,000 API calls/month
- Email support
- 10GB storage
- Good for: Developers, SMBs

MAX: $99.99/month (Better Margin)
- All Pro features
- $35/month in credits (was $250)
- Unlimited API calls
- Priority support
- 50GB storage
- Webhooks & custom integrations
- Good for: Teams, power users

ENTERPRISE: Custom
- Custom credit allocation (negotiated)
- Unlimited everything
- Dedicated support
- On-premise option
- SSO & custom integrations
```

**Why this works:**

- Free plan funnels to paid
- Hobby targets side projects
- Pro is sweet spot (best margins)
- Max is for power users (still profitable)
- Enterprise is high-margin

---

### 9. MONTHLY RECURRING REVENUE (MRR) PROJECTIONS

**Scenario: 100 Users distributed by plan**

```
User Mix:
- 5% on Free = 5 users × $0 = $0
- 50% on Hobby = 50 × $10 × 0.971 - $15 = $470
- 35% on Pro = 35 × $29.99 × 0.971 - $10.50 = $1,000
- 10% on Max = 10 × $99.99 × 0.971 - $3 = $970
- 0% on Enterprise = $0

Total MRR: $2,440/month
After 5% chargebacks: $2,318/month
After 30% churn: $1,622/month

Annual costs for 100 users:
- Platform/Infra: $500/month = $6,000/year
- Support: $2,000/year
- Content/Marketing: $2,000/year
- Total: $10,000/year

You need $833/month to break even = 34 users on Pro
You need $2,440/month to make 50% net margin = requires full customer base
```

---

### 10. ACTION PLAN & NEXT STEPS

1. **Audit Your Actual Costs**
   - Calculate exact COGS per user per plan
   - Track support costs by plan tier
   - Monitor chargeback rates

2. **Adjust Credit Allocation**
   - Reduce Pro from $20 to $10.50
   - Reduce Max from $250 to $35-$105
   - Explain "we optimized for sustainability"

3. **Implement Tiered API Pricing**
   - Pay-as-you-go for overages
   - Token-based billing (easier to understand)
   - Prepaid credit bundles (better for you)

4. **Add Payment Methods**
   - Accept annual plans (better cash flow)
   - Offer quarterly option (10% discount vs monthly)
   - Offer yearly option (20% discount vs monthly)

5. **Optimize Chargeback Prevention**
   - Clear terms and conditions
   - 30-day money-back guarantee (not 7)
   - Email confirmation of usage
   - Automatic billing receipt

6. **Monitor Key Metrics**
   - Monthly Recurring Revenue (MRR)
   - Churn rate
   - Customer Acquisition Cost (CAC)
   - Lifetime Value (LTV)
   - Payback period

---

## QUICK REFERENCE: CREDIT ALLOCATION FORMULA

```
Safe Credit Allocation = (Monthly_Revenue_After_Stripe × 0.35) / 12

Hobby ($10):
- Revenue after Stripe: $28.82/year = $2.40/month
- Credit allocation: $2.40 × 0.35 = $0.84/month = $3.50/month suggested

Pro ($29.99):
- Revenue after Stripe: $28.82/month
- Credit allocation: $28.82 × 0.35 = $10.09/month

Max ($299.99):
- Revenue after Stripe: $291.02/month
- Credit allocation: $291.02 × 0.35 = $101.86/month = ~$100/month suggested
```

---

## STRIPE FEE IMPACT CALCULATOR

```
Monthly Plan Revenue × 0.971 - (Number of Users × $0.30)

Example: 1,000 users on Pro plan
= ($29.99 × 1000) × 0.971 - (1000 × $0.30)
= $29,090.29 - $300
= $28,790.29 net revenue
= Lost to Stripe: $1,209.71 (4% of revenue)
```

---

## KEY TAKEAWAYS

✅ **Cloud credits should be 30-40% of plan value** to maintain profitability
✅ **Annual billing is 2-3x better margin** than monthly (fewer Stripe fees per transaction)
✅ **Stripe fees eat 4-5% of revenue**, plan accordingly
✅ **$0.30 fixed fee per transaction** makes monthly plans less profitable than annual
✅ **Refunds cost you 2-3x the Stripe fee loss** (non-refundable + lost credits)
✅ **Reduce Max plan credits** from $250 to $100-$120 to improve profitability
✅ **Reduce Pro plan credits** from $20 to $10-$12 while maintaining perceived value
✅ **Implement prepaid credit bundles** to reduce Stripe fee impact
✅ **30-day money-back guarantee** reduces impulsive refunds
✅ **Annual payment options** improve retention and margins significantly
