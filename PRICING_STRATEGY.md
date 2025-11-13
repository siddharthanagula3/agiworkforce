# Pricing Strategy: Path to $100M ARR
**Date:** November 13, 2025
**Goal:** Maximize revenue while maintaining competitive position
**Philosophy:** Fair value exchange - charge for outcomes, not inputs

---

## Executive Summary

**The $20/month Anchor:**
The market has spoken: $20/month is the sweet spot for AI productivity tools.

**Evidence:**
- ChatGPT Plus: $20/month → 10M+ paying users
- Claude Pro: $20/month → Fastest-growing AI subscription
- Cursor Pro: $20/month → $100M ARR in 12 months
- GitHub Copilot: $10/month (developer-only tool)

**Our Strategy:**
```
Free Tier (PLG Driver) → Pro $20 (Volume) → Pro+ $60 (Power Users) → Team $40/user (B2B) → Enterprise (Custom)
```

**Expected Mix at $100M ARR:**
- Pro tier: 65% of revenue ($65M)
- Pro+ tier: 15% of revenue ($15M)
- Team tier: 12% of revenue ($12M)
- Enterprise: 8% of revenue ($8M)

---

## Competitive Pricing Analysis

### AI Coding Tools (November 2025)

| Product | Free Tier | Pro Tier | Advanced Tier | Team Tier | Enterprise |
|---------|-----------|----------|---------------|-----------|------------|
| **Cursor** | 2K requests/month | $20/month<br/>Unlimited | $60/month<br/>500 fast requests | - | $200/user/month<br/>2K fast requests |
| **GitHub Copilot** | - | $10/month<br/>(code completion only) | $19/month<br/>(+ chat) | $39/user/month | Custom |
| **Tabnine** | Basic | $12/month | - | $39/user/month | Custom |
| **Codeium** | Unlimited<br/>(limited features) | - | - | $15/user/month | Custom |
| **Replit** | 500 Cycles/month | $20/month<br/>Unlimited AI | - | $20/user/month | Custom |

### AI Automation/No-Code Tools

| Product | Free Tier | Starter | Pro | Team | Enterprise |
|---------|-----------|---------|-----|------|------------|
| **Lovable** | 5 messages/day | $25-30/month | $50/month | $100/month | Custom |
| **Bolt.new** | Limited | $20/month | - | - | - |
| **v0.dev** | 200 credits/month | $20/month<br/>5K credits | - | - | - |
| **n8n** | Free (self-hosted) | $20/month | $50/month | Custom | Custom |
| **Zapier** | 100 tasks/month | $20/month<br/>750 tasks | $49/month<br/>2K tasks | $69/month<br/>50K tasks | Custom |
| **Make** | 1K ops/month | $9/month<br/>10K ops | $16/month<br/>10K ops | $29/month<br/>10K ops | Custom |

### Key Insights

1. **$20 is the Magic Number**
   - Psychological anchor set by ChatGPT Plus
   - Low enough to avoid approval processes
   - High enough to be taken seriously
   - Sweet spot for SaaS LTV ($240/year)

2. **Freemium is Essential**
   - Every fast-growing product has generous free tier
   - 5-10% conversion is industry standard
   - Free tier drives viral growth

3. **Advanced Tier at 3x**
   - $60/month = 3x base price
   - For power users who need "fast" models
   - 10-20% of Pro users upgrade

4. **Team Tier at 2x**
   - $40/user/month = 2x individual
   - Adds collaboration features
   - Higher LTV due to lower churn

5. **Enterprise is 10x+**
   - $200-500/user/month
   - Custom pricing based on usage
   - Includes white-glove support

---

## AGI Workforce Pricing Strategy

### Tier 1: Free (The Hook) 🎣

**Purpose:** Drive viral PLG growth

**Limits:**
```yaml
Daily Limit: 5 tasks/day
Models: Claude Haiku 4.5 only (fast but less capable)
Execution: Sequential (no parallel agents)
Storage: 30 days of history
Workflows: 10 saved workflows
Sharing: Public only
Support: Community (Discord)
```

**Value Proposition:**
- "Try the world's most powerful AI automation tool"
- "No credit card required"
- "5 tasks/day = 150 tasks/month (enough to get hooked)"

**Conversion Triggers:**
```typescript
// When user hits daily limit
"You've used 5/5 tasks today! ⏰
Upgrade to Pro for unlimited tasks - just $20/month"

// When task needs parallel execution
"This task would be 4x faster with parallel agents 🚀
Upgrade to Pro for 8 parallel agents"

// When user wants better models
"This task requires GPT-5 or Claude Opus 4 🧠
Upgrade to Pro for access to all models"

// After 7 days of hitting limit
"You've hit your daily limit 7 days in a row! 🔥
You're clearly getting value - upgrade to Pro?"
```

**Expected Metrics:**
- Activation rate: 60% (3 out of 5 signups complete first task)
- Daily active: 40% (2 out of 5 return next day)
- Upgrade rate: 10% after 30 days
- Viral coefficient: 0.5 (each user brings 0.5 new users via sharing)

---

### Tier 2: Pro $20/month (The Volume Driver) 💪

**Purpose:** Primary revenue source, maximize volume

**Features:**
```yaml
Daily Limit: Unlimited tasks
Models: All models (GPT-5, Claude Opus 4, Gemini 2.5 Pro)
Fast Requests: 100/month (Claude Haiku 4.5, 4x faster)
Execution: Up to 4 parallel agents
Storage: Unlimited history
Workflows: Unlimited saved workflows
Sharing: Public + private
Browser: Live browser visualization
Desktop: Basic automation
API: 1,000 requests/month
Support: Email (24-hour response)
```

**Positioning:**
- "Everything you need to automate your work"
- "Same price as Cursor, but does 10x more"
- "Unlimited tasks = unlimited value"

**Target Customer:**
- Individual developers
- Solo founders
- Freelancers
- Students
- Small business owners

**Conversion Path:**
```
Free (5 tasks/day)
   → Hit limit repeatedly
   → "Upgrade for $20/month"
   → Pro (unlimited)
```

**Annual Option:**
```yaml
Monthly: $20/month = $240/year
Annual: $200/year = $16.67/month (2 months free)
Savings: $40/year (17% discount)
```

**Why $20?**
1. **Market standard** (ChatGPT, Claude, Cursor)
2. **Below approval threshold** (most people don't need boss approval)
3. **Coffee test** ($20/month = $0.67/day = less than a coffee)
4. **Easy math** ($240/year is clean number)
5. **High volume** (can scale to 100K+ users at this price)

**Expected Metrics:**
- 65% of revenue
- Average LTV: $400 (20 months × $20)
- Churn: 5%/month
- Upgrade to Pro+: 15%

---

### Tier 3: Pro+ $60/month (The Power User) ⚡

**Purpose:** Monetize heavy users without alienating casual users

**Features:**
```yaml
Everything in Pro, PLUS:
Fast Requests: 500/month (5x more than Pro)
Parallel Agents: 8 simultaneously (2x more than Pro)
Priority Execution: Jump the queue
Advanced Models: Early access to new models (GPT-6, Claude 5)
API: 10,000 requests/month (10x more)
Storage: Advanced analytics dashboard
Workflows: Marketplace selling (earn passive income)
Support: Priority email (4-hour response) + live chat
```

**Positioning:**
- "For professionals who automate all day"
- "4x faster execution with 500 fast requests"
- "Make money selling workflows in marketplace"

**Target Customer:**
- Professional developers (working on 3+ projects)
- Agencies (serving multiple clients)
- Power users (100+ tasks/week)
- Workflow creators (want to sell on marketplace)

**Conversion Path:**
```
Pro ($20/month)
   → Uses 100+ fast requests/month
   → "You're out of fast requests! Upgrade to Pro+ for 500/month"
   → Pro+ ($60/month)
```

**Why $60?**
1. **3x Pro price** (standard SaaS multiplier)
2. **Below $100 barrier** (still doesn't need approval)
3. **High margin** (most costs are in free tier compute)
4. **Comparable to competitors** (Cursor Pro+ is $60)

**Expected Metrics:**
- 15% of revenue
- Average LTV: $1,200 (20 months × $60)
- Churn: 3%/month (stickier than Pro)
- 15% of Pro users upgrade to Pro+

---

### Tier 4: Team $40/user/month (The B2B Entry) 👥

**Purpose:** Capture teams and small companies

**Features:**
```yaml
Everything in Pro+, PLUS:
Shared Workflows: Team library
Collaboration: Real-time co-editing
Team Analytics: Usage dashboard, cost tracking
Role-Based Access: Admin, member, viewer roles
Centralized Billing: One invoice for whole team
SSO: Google Workspace, Microsoft 365
Priority Support: Dedicated Slack channel
Minimum: 3 users ($120/month)
```

**Positioning:**
- "Automate together, not alone"
- "Shared workflows = 10x team productivity"
- "One bill, many users"

**Target Customer:**
- Startups (5-20 people)
- Small dev teams
- Agencies
- Departments in larger companies

**Conversion Path:**
```
Pro user invites teammate
   → "Upgrade to Team for $40/user (vs $60 each for Pro+)"
   → Team plan
```

**Why $40/user?**
1. **2x Pro price** (standard for team tiers)
2. **Cheaper than 2x Pro+** ($40 vs $60 = better value for teams)
3. **Volume discount** (incentivizes team adoption)
4. **Annual prepay** (reduces churn dramatically)

**Pricing Options:**
```yaml
Monthly: $40/user/month
Annual: $400/user/year ($33.33/month, 2 months free)
Volume Discounts:
  - 10-24 users: 10% off ($36/user/month)
  - 25-49 users: 15% off ($34/user/month)
  - 50-99 users: 20% off ($32/user/month)
  - 100+ users: 25% off ($30/user/month) + custom enterprise features
```

**Expected Metrics:**
- 12% of revenue
- Average team size: 8 users
- Average LTV: $15,360 (8 users × 24 months × $40)
- Churn: 2%/month (teams are sticky)

---

### Tier 5: Enterprise (The Whale) 🐋

**Purpose:** Capture large companies with custom needs

**Features:**
```yaml
Everything in Team, PLUS:
Unlimited Users: No per-seat pricing cap
Custom Models: Fine-tuned models for company
On-Premise: Deploy on company infrastructure
Advanced SSO: Okta, Azure AD, SAML
Advanced Security: SOC 2, HIPAA, GDPR compliance
Audit Logs: Complete activity tracking
SLA: 99.9% uptime guarantee
Dedicated Support: Account manager, Slack Connect
Custom Integrations: Build custom tools/workflows
Training: Onboarding workshops for team
Reporting: Custom dashboards, BI integrations
White-Label: Rebrand for internal use
```

**Positioning:**
- "Enterprise-grade AI automation"
- "We become your automation platform"
- "Tailored to your exact needs"

**Target Customer:**
- Companies with 100+ employees
- Enterprises with compliance needs
- Companies wanting on-premise
- White-label resellers

**Pricing Model:**
```yaml
Base: $10,000/year (25 users minimum)
Per User: $400/year after 25 users
Typical Deal:
  - Small Enterprise (100 users): $40K/year
  - Mid Enterprise (500 users): $200K/year
  - Large Enterprise (2,000 users): $800K/year

Custom Add-Ons:
  - On-premise deployment: +$50K/year
  - Dedicated infrastructure: +$100K/year
  - Custom model training: +$50-200K/year
  - White-label rights: +30% of revenue share
```

**Sales Process:**
```
1. Inbound lead (demo request on website)
2. Discovery call (AE + Solutions Engineer)
3. Pilot program (30 days, 10 users, free)
4. Proof of value (show ROI)
5. Proposal (custom pricing)
6. Security review (legal, IT)
7. Contract signature (annual prepay typical)
8. Onboarding (2-4 weeks)
```

**Expected Metrics:**
- 8% of revenue
- Average deal size: $100K/year
- Sales cycle: 60-90 days
- Churn: <1%/month
- Expansion revenue: 30% year 2 (users grow)

---

## Pricing Psychology & Optimization

### Psychological Principles Used

**1. Anchoring Effect**
```
Show highest price first, then lower prices feel like a deal

❌ Wrong:
Free | Pro $20 | Pro+ $60 | Enterprise Custom

✅ Right:
Enterprise Custom | Pro+ $60 | Pro $20 | Free
```

**2. Decoy Pricing**
```
Make Pro+ look expensive to make Pro look like the best value

Example on pricing page:
┌─────────────┬─────────────┬─────────────┐
│    Pro      │   Pro+ 🔥   │    Team     │
│  $20/month  │  $60/month  │ $40/user    │
│             │             │             │
│ Most Popular│ Power Users │ For Teams   │
└─────────────┴─────────────┴─────────────┘

Pro+ at $60 makes Pro at $20 feel like amazing value
(Even though Pro is where most revenue comes from)
```

**3. Social Proof**
```
"47,239 developers upgraded to Pro this month"
"Teams at Google, Amazon, Microsoft use AGI Workforce"
"Rated 4.9/5 by 12,451 users"
```

**4. Loss Aversion**
```
Free trial messaging:
❌ "Start your free trial"
✅ "Try Pro free for 14 days - no credit card required"

After trial ends:
❌ "Your trial has expired"
✅ "Don't lose access! Upgrade now to keep your workflows"
```

**5. Scarcity**
```
Limited-time offers:
"Launch special: Lock in $20/month forever (price increases to $30 next month)"
"First 10,000 users get Pro+ for $40/month (50% off)"
```

**6. Price-Quality Heuristic**
```
Don't be the cheapest - implies low quality
$20/month positions us as premium (like ChatGPT Plus)
vs $10/month signals "budget option"
```

### A/B Testing Strategy

**Month 1-2: Find Optimal Price Points**

Test 1: Pro Tier Price
```yaml
Variant A: $15/month (25% lower)
Variant B: $20/month (control)
Variant C: $25/month (25% higher)

Hypothesis: $20 is optimal
Metric: Revenue per visitor
Sample size: 10,000 visitors per variant
```

Test 2: Free Tier Daily Limit
```yaml
Variant A: 3 tasks/day (40% lower)
Variant B: 5 tasks/day (control)
Variant C: 10 tasks/day (100% higher)

Hypothesis: 5 is optimal for conversion
Metric: Free-to-paid conversion rate
Sample size: 5,000 free users per variant
```

Test 3: Annual Discount
```yaml
Variant A: 1 month free (8% discount) = $220/year
Variant B: 2 months free (17% discount) = $200/year (control)
Variant C: 3 months free (25% discount) = $180/year

Hypothesis: 2 months is optimal
Metric: % choosing annual vs monthly
Sample size: 5,000 upgrade decisions
```

Test 4: Pro+ Price
```yaml
Variant A: $50/month (2.5x Pro)
Variant B: $60/month (3x Pro) (control)
Variant C: $75/month (3.75x Pro)

Hypothesis: $60 is optimal
Metric: Pro → Pro+ upgrade rate
Sample size: 10,000 Pro users
```

**Month 3-4: Optimize Messaging**

Test 5: Upgrade Prompt Copy
```yaml
Variant A: "Upgrade to Pro for unlimited tasks"
Variant B: "Upgrade to Pro to keep automating" (loss aversion)
Variant C: "Join 50,000 Pro users" (social proof)

Metric: Click-through rate on upgrade
```

Test 6: Pricing Page Layout
```yaml
Variant A: Table layout (current)
Variant B: Card layout (vertical)
Variant C: Comparison layout (feature list)

Metric: Upgrade rate from pricing page
```

### Revenue Optimization Levers

**Lever 1: Increase Conversion (Free → Pro)**
```
Current: 10% conversion
Target: 15% conversion
Impact: +50% revenue

Tactics:
- Improve onboarding (higher activation)
- Better upgrade prompts (right time, right message)
- Add intermediate tier ($10/month for 50 tasks/day)
- Limited-time offers (create urgency)
```

**Lever 2: Reduce Churn**
```
Current: 5% monthly churn
Target: 3% monthly churn
Impact: +40% LTV

Tactics:
- Improve product (fewer errors, faster execution)
- Proactive support (reach out when usage drops)
- Habit formation (daily workflow suggestions)
- Annual plans (lock in for 12 months)
```

**Lever 3: Increase ARPU**
```
Current: $25/month average
Target: $35/month average
Impact: +40% revenue

Tactics:
- Upsell Pro → Pro+ (15% take rate)
- Usage-based pricing (pay for extra fast requests)
- Add-ons (extra storage, API calls, etc.)
- Team conversions (individuals → teams)
```

**Lever 4: Expand Accounts (Team/Enterprise)**
```
Current: 5 users per team average
Target: 10 users per team average
Impact: +100% revenue from teams

Tactics:
- Invite teammates feature (prominent)
- Team value demo (show collaboration features)
- Admin dashboard (show usage, encourage expansion)
- Success stories (how teams of 20+ use it)
```

---

## Usage-Based Pricing Add-Ons

### Fast Request Top-Ups

**Problem:** User runs out of fast requests mid-month

**Solution:** Pay-as-you-go top-ups
```yaml
Pro (100 fast requests/month):
  - 50 extra: $5 (10¢ per request)
  - 100 extra: $8 (8¢ per request)
  - 250 extra: $15 (6¢ per request)

Pro+ (500 fast requests/month):
  - 100 extra: $8
  - 250 extra: $15
  - 500 extra: $25 (5¢ per request)
```

**Expected Revenue:**
- 20% of Pro users buy top-ups (avg $10/month)
- Additional $2/user/month ARPU
- $20 base + $2 top-ups = $22 effective ARPU

### API Call Packages

**Problem:** Developer needs more API calls than plan includes

**Solution:** API call packages
```yaml
Pro (1,000 API calls/month):
  - 5,000 extra: $10 (0.2¢ per call)
  - 25,000 extra: $40 (0.16¢ per call)
  - 100,000 extra: $120 (0.12¢ per call)

Pro+ (10,000 API calls/month):
  - 25,000 extra: $40
  - 100,000 extra: $120
  - 500,000 extra: $500
```

**Expected Revenue:**
- 10% of users need extra API calls (avg $15/month)
- Targets automation-heavy use cases

### Storage Expansion

**Problem:** User has years of workflow history

**Solution:** Storage add-ons
```yaml
Pro (10GB included):
  - 50GB: $5/month
  - 100GB: $8/month
  - 500GB: $20/month

Team (50GB per user):
  - 500GB team storage: $20/month
  - 1TB team storage: $35/month
```

**Expected Revenue:**
- 5% of users need extra storage (avg $8/month)
- Low take-rate but high margin

---

## Discounts & Promotions

### Launch Promotions (Month 1-2)

**Early Bird Special**
```
"Lock in Pro at $20/month forever"
(Price increases to $25/month for new users after Month 2)
Creates urgency + rewards early adopters
```

**Product Hunt Exclusive**
```
Code: PRODUCTHUNT20
Discount: 20% off first 3 months
Value: Save $12
Converts PH traffic to paid
```

**Annual Plan Incentive**
```
Pay annually, get 3 months free (25% off)
$20/month → $180/year ($15/month)
Reduces churn, improves cash flow
```

### Growth Promotions (Month 3-6)

**Refer-a-Friend**
```
Give: Friend gets 1 month Pro free
Get: You get 1 month free (up to 12 months)
Cost: $20/referral
Expected: 15% of users refer 2+ friends = viral growth
```

**Team Migration Offer**
```
"Switching from Cursor? Get 3 months at 50% off"
$40/user/month → $20/user/month for 3 months
Targets competitive displacement
```

**Student Discount**
```
50% off Pro with .edu email
$20/month → $10/month
Captures future professionals
Low revenue now, high LTV later
```

### Retention Promotions (Ongoing)

**Win-Back Campaign**
```
Target: Users who churned <90 days ago
Offer: "Come back - 2 months for $10 ($5/month)"
Expected: 10-15% reactivation rate
```

**Annual Upgrade Incentive**
```
Target: Monthly subscribers after 6 months
Offer: "Switch to annual, get 3 months free + $50 credit"
Expected: 20% conversion to annual
```

---

## Pricing Tiers Comparison Table

| Feature | Free | Pro | Pro+ | Team | Enterprise |
|---------|------|-----|------|------|------------|
| **Price** | $0 | $20/month | $60/month | $40/user/month | Custom |
| **Tasks/day** | 5 | Unlimited | Unlimited | Unlimited | Unlimited |
| **Models** | Haiku 4.5 | All models | All models + early access | All models | Custom models |
| **Fast requests** | 0 | 100/month | 500/month | 500/month | Unlimited |
| **Parallel agents** | 1 | 4 | 8 | 8 | Custom |
| **Workflow storage** | 10 | Unlimited | Unlimited | Unlimited | Unlimited |
| **History** | 30 days | Unlimited | Unlimited | Unlimited | Unlimited |
| **API calls** | 0 | 1K/month | 10K/month | 10K/month | Custom |
| **Browser automation** | Basic | Full | Full | Full | Full |
| **Desktop automation** | No | Basic | Advanced | Advanced | Custom |
| **Sharing** | Public only | Public + private | Public + private + marketplace | Team library | Private + custom |
| **Collaboration** | No | No | No | Yes | Yes |
| **SSO** | No | No | No | Yes | Advanced |
| **Support** | Community | Email (24h) | Priority (4h) + chat | Dedicated Slack | Account manager |
| **SLA** | None | None | None | 99% | 99.9% |
| **Audit logs** | No | Basic | Advanced | Advanced | Custom |

---

## Revenue Projections by Tier

### Month 8 (Target: $100M ARR)

**Assumptions:**
- 2.1M total users
- 10% free-to-paid conversion
- 210,000 paying users

**Breakdown:**

```yaml
Pro ($20/month):
  Users: 140,000 (67% of paying)
  MRR: $2,800,000
  ARR: $33,600,000
  % of revenue: 33%

Pro+ ($60/month):
  Users: 25,000 (12% of paying)
  MRR: $1,500,000
  ARR: $18,000,000
  % of revenue: 18%

Team ($40/user/month):
  Teams: 5,000
  Users: 25,000 (5 users/team avg)
  MRR: $1,000,000
  ARR: $12,000,000
  % of revenue: 12%

Enterprise:
  Customers: 300
  Avg deal: $100K/year
  ARR: $30,000,000
  % of revenue: 30%

Add-Ons (top-ups, API, storage):
  Users: 40,000 using add-ons
  Avg: $15/user/month
  MRR: $600,000
  ARR: $7,200,000
  % of revenue: 7%

Total:
  MRR: $8,900,000
  ARR: $106,800,000 ✅
```

**Why Enterprise is 30% of Revenue:**
- Only 300 customers (0.14% of total users)
- But $100K/year avg = high value
- Typical SaaS mix: 60% SMB, 40% Enterprise
- Our mix skews SMB early, enterprise grows later

---

## Pricing FAQs

### Q: Why not charge per task like Zapier?

**A:** Unpredictable costs frustrate users. "Unlimited tasks" is simpler and more attractive.

**Comparison:**
- Zapier: $20/month for 750 tasks (scary to use - will I run out?)
- AGI Workforce: $20/month for unlimited tasks (use freely)

### Q: Why not charge per token like OpenAI?

**A:** Developers understand tokens, but normal users don't. We want all users, not just developers.

**Simplicity wins:**
- OpenAI: "$0.03/1K tokens" (what does that mean to a marketer?)
- AGI Workforce: "$20/month unlimited" (clear value)

### Q: Won't unlimited tasks at $20/month lose money?

**A:** No, because:
1. Most users don't use unlimited (avg 50 tasks/month)
2. We use fast, cheap models for most tasks (Haiku 4.5 = $0.80 per 1M tokens)
3. Desktop execution means no server costs
4. High-volume users upsell to Pro+ or Enterprise

**Unit Economics:**
```
Average Pro user (50 tasks/month):
- Compute cost: $2/month (Claude Haiku 4.5)
- Infrastructure: $1/month (AWS, CDN, etc.)
- Support: $1/month (amortized)
- Total COGS: $4/month
- Revenue: $20/month
- Gross margin: 80%
```

Heavy Pro user (500 tasks/month):
- Compute cost: $20/month
- Infrastructure: $2/month
- Support: $3/month
- Total COGS: $25/month
- Revenue: $20/month
- Gross margin: -25% (LOSS)

**Solution:** Heavy users hit prompts to upgrade:
- "You've completed 100 tasks this month! 🔥"
- "Upgrade to Pro+ for 4x faster execution"
- 50% of heavy users upgrade → profitable

### Q: What if Cursor lowers prices?

**A:** We follow them down OR add more value at same price.

**Options:**
1. **Price match:** If Cursor goes to $15/month, we match
2. **More value:** Keep $20, but add features (marketplace, desktop automation, etc.)
3. **Differentiate:** "Cursor is $15 for code. We're $20 for EVERYTHING (code + browser + desktop + API)"

**Defense:** Our broader feature set justifies premium vs code-only tools.

### Q: Should we have a lifetime deal?

**A:** No. Lifetime deals are short-term cash at expense of long-term revenue.

**Why not:**
- $500 lifetime = $20 × 25 months (break-even)
- Most users stay 40+ months → we lose money
- Creates low-value customer segment
- Hard to upsell lifetime users

**Alternative:** Deep annual discount
- $180/year (3 months free) achieves similar goal
- Locks in for 1 year
- Can still upsell to higher tiers

---

## Localized Pricing Strategy

### Purchasing Power Parity (PPP)

**Concept:** Adjust prices for country's cost of living

**Implementation:**
```yaml
Tier 1 (Full Price):
  Countries: USA, Canada, UK, Germany, France, Australia, Japan
  Pro: $20/month

Tier 2 (20% Discount):
  Countries: Spain, Italy, South Korea, Singapore
  Pro: $16/month

Tier 3 (40% Discount):
  Countries: Poland, Mexico, Brazil, Turkey
  Pro: $12/month

Tier 4 (60% Discount):
  Countries: India, Philippines, Vietnam, Indonesia
  Pro: $8/month
```

**Why PPP Pricing:**
- Maximizes global revenue (India at $8 > India at $0)
- Fair to users (same % of monthly income)
- Reduces piracy (price is reasonable for local economy)

**Challenges:**
- VPN abuse (users in USA use VPN to India)
- Payment method verification (require local credit card)
- Perceived unfairness ("Why do they pay less?")

**Our Approach:**
- Implement PPP for free tier → Pro conversion
- Don't advertise price differences publicly
- Detect location via IP + payment method
- Allow manual contact for exceptions

---

## Final Pricing Recommendations

### Launch Pricing (Month 1-2)
```yaml
Free: 5 tasks/day
Pro: $20/month
Pro+: $60/month
Team: $40/user/month (min 3 users)
Enterprise: Starting at $10K/year

Promotions:
  - Early bird: Lock in $20/month forever (before price increase)
  - Product Hunt: PRODUCTHUNT20 for 20% off 3 months
  - Annual: Pay $200/year (2 months free)
```

### Growth Pricing (Month 3-6)
```yaml
Free: 5 tasks/day
Pro: $25/month (NEW PRICE)
Pro+: $75/month (keep 3x ratio)
Team: $50/user/month
Enterprise: Starting at $10K/year

Grandfather Clause: Existing users keep $20/month price
Why Increase: Shows value, increases ARPU, justifies early-bird promo
```

### Scale Pricing (Month 7-8)
```yaml
Free: 5 tasks/day
Starter: $15/month (NEW TIER - 50 tasks/day limit)
Pro: $30/month
Pro+: $90/month
Team: $60/user/month
Enterprise: Starting at $10K/year

Why Add Starter: Captures price-sensitive users, increases conversion
```

---

## Conclusion

**The Winning Formula:**
```
Generous Free Tier (PLG)
+ Pro at $20 (Volume)
+ Pro+ at $60 (Power Users)
+ Team at $40/user (B2B)
+ Enterprise at $100K+ (Whales)
= $100M ARR
```

**Key Principles:**
1. **Free tier drives growth** - 5 tasks/day is enough to get hooked
2. **$20 is the anchor** - Market has validated this price point
3. **Unlimited is attractive** - No usage anxiety
4. **3x multiplier for premium** - $60 Pro+ targets power users
5. **Team at 2x** - Incentivizes team adoption
6. **Enterprise custom** - Flexibility for large deals

**Success Metrics:**
- Free-to-paid conversion: >10%
- ARPU: $25-35/month
- LTV: $400-1,200 depending on tier
- CAC: <$50 (mostly organic)
- LTV/CAC: >20x
- Gross margin: >80%

**The Path to $100M ARR:**
- Month 1-2: Prove conversion at $20/month
- Month 3-4: Optimize pricing and tiers
- Month 5-6: Scale team and enterprise
- Month 7-8: Add premium tiers and verticals

**Let's execute. 🚀**
