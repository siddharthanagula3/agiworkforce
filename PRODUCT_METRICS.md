# AGI Workforce - Product Metrics & KPIs

**Version:** 1.0
**Last Updated:** January 15, 2026
**Purpose:** Define, track, and analyze key product metrics for data-driven decision making.

## Table of Contents

- [Metrics Framework](#metrics-framework)
- [North Star Metric](#north-star-metric)
- [Product Metrics](#product-metrics)
- [Business Metrics](#business-metrics)
- [Growth Metrics](#growth-metrics)
- [Operational Metrics](#operational-metrics)
- [Feature-Specific Metrics](#feature-specific-metrics)
- [Cohort Analysis](#cohort-analysis)
- [Reporting Dashboard](#reporting-dashboard)

---

## Metrics Framework

### Metric Hierarchy

```
North Star Metric (WAAH)
         │
         ├─── Product Metrics (Engagement, Retention, Feature Adoption)
         ├─── Business Metrics (Revenue, Conversion, LTV, Churn)
         ├─── Growth Metrics (Acquisition, Activation, Referral)
         └─── Operational Metrics (Performance, Quality, Support)
```

### HEART Framework

We use Google's HEART framework to structure our metrics:

- **H**appiness - User satisfaction and attitudes
- **E**ngagement - Level of user involvement
- **A**doption - New user conversion and feature usage
- **R**etention - Rate at which users return
- **T**ask Success - Efficiency and effectiveness

---

## North Star Metric

### Weekly Active Automation Hours (WAAH)

**Definition:** Total hours saved by all users through automation in a given week.

**Formula:**

```
WAAH = Σ (Automations Executed × Time Saved per Automation)
```

**Target Trajectory:**

- Q1 2026: 10,000 hours/week
- Q2 2026: 50,000 hours/week
- Q3 2026: 200,000 hours/week
- Q4 2026: 500,000 hours/week
- Q4 2027: 10,000,000 hours/week

**Why This Metric:**

1. **User Value:** Directly measures value delivered to users
2. **Engagement:** Correlates with active usage
3. **Retention:** Users who save time stay longer
4. **Growth:** More time saved → more referrals
5. **Revenue:** Time saved converts to willingness to pay

**Leading Indicators:**

- Daily Active Users (DAU)
- Average Automations per User
- Automation Success Rate
- Feature Adoption Rate

**Lagging Indicators:**

- User Retention
- Revenue Growth
- Net Promoter Score
- Customer Lifetime Value

---

## Product Metrics

### 1. Engagement Metrics

#### Daily Active Users (DAU)

**Definition:** Unique users who perform meaningful action (chat, automation, workflow) in 24 hours.

**Meaningful Actions:**

- Send chat message to AI
- Execute automation workflow
- Run terminal command via AGI
- Edit file through AGI
- Create or modify workflow

**Current:** 500
**Q1 2026 Target:** 5,000
**Q2 2026 Target:** 15,000
**Q3 2026 Target:** 30,000
**Q4 2026 Target:** 50,000

**Segments:**

- Free users: 60%
- Hobby users: 20%
- Pro users: 15%
- Max users: 4%
- Enterprise: 1%

#### Weekly Active Users (WAU)

**Definition:** Unique users who perform meaningful action in 7 days.

**Current:** 1,000
**Q1 2026 Target:** 10,000
**Q2 2026 Target:** 30,000
**Q3 2026 Target:** 60,000
**Q4 2026 Target:** 100,000

**DAU/WAU Ratio:**

- **Target:** 50% (healthy engagement)
- **Current:** 50%
- **Benchmark:** 40-60% for B2B SaaS

#### Monthly Active Users (MAU)

**Definition:** Unique users who perform meaningful action in 30 days.

**Current:** 2,000
**Q1 2026 Target:** 20,000
**Q2 2026 Target:** 60,000
**Q3 2026 Target:** 120,000
**Q4 2026 Target:** 200,000

**WAU/MAU Ratio:**

- **Target:** 50% (healthy engagement)
- **Benchmark:** 40-60% for B2B SaaS

#### Session Metrics

**Sessions per DAU:**

- **Current:** 3 sessions/day
- **Target:** 5 sessions/day
- **Benchmark:** 3-7 for productivity tools

**Session Duration:**

- **Current:** 15 minutes average
- **Target:** 20 minutes average
- **Segments:**
  - Quick tasks: 5 min (40%)
  - Medium tasks: 15 min (40%)
  - Deep work: 45+ min (20%)

**Actions per Session:**

- **Current:** 8 actions
- **Target:** 12 actions
- **High-value actions:** Code gen, automation execution, file operations

### 2. Feature Adoption Metrics

#### Feature Adoption Rate

**Definition:** Percentage of users who have used a feature at least once.

**Core Features (Target: 80%+):**

- Chat with AI: 95%
- File operations: 75%
- Code generation: 70%
- Terminal integration: 60%
- Workflow automation: 50%

**Advanced Features (Target: 40%+):**

- AGI goal execution: 35%
- Multi-agent orchestration: 20%
- MCP integrations: 25%
- Browser automation: 30%
- Database operations: 15%

**Feature Stickiness:**

```
Stickiness = (DAU using feature / MAU using feature) × 100
```

**Sticky Features (>40%):**

- Chat: 65%
- File operations: 55%
- Code generation: 50%
- Terminal: 45%

**Feature Depth:**

```
Depth = Average uses per active user per week
```

**High-depth Features:**

- Chat: 25 uses/week
- File operations: 15 uses/week
- Code generation: 12 uses/week

### 3. Retention Metrics

#### Day 1 Retention

**Definition:** Percentage of new users who return the next day.

**Current:** 40%
**Target:** 60%
**Benchmark:** 40-60% for B2B tools

**Improvement Strategies:**

- Better onboarding (tutorial)
- Quick win demonstration
- Email reminder next day
- Sample workflows

#### Day 7 Retention

**Definition:** Percentage of new users who return in week 1.

**Current:** 30%
**Target:** 50%
**Benchmark:** 30-50% for B2B tools

**Critical Period:** Days 2-7 are make-or-break

**Improvement Strategies:**

- Weekly email with tips
- Feature discovery prompts
- Success stories
- Community engagement

#### Day 30 Retention

**Definition:** Percentage of new users who are active at day 30.

**Current:** 20%
**Target:** 40%
**Benchmark:** 25-40% for B2B tools

**Cohort Analysis:**

- Month 0 (Jan 2026): 20%
- Month 1 (Feb 2026): 25%
- Month 2 (Mar 2026): 30%
- Target (Q2 2026): 40%

#### User Retention by Cohort

**Definition:** Percentage of users from signup cohort still active.

**Retention Curves (Target):**

```
Month 0: 100% (signup)
Month 1: 60%
Month 3: 50%
Month 6: 45%
Month 12: 40%
Month 24: 35%
```

**Paid User Retention (Higher):**

```
Month 0: 100%
Month 1: 85%
Month 3: 80%
Month 6: 75%
Month 12: 70%
Month 24: 65%
```

### 4. Quality Metrics

#### AI Response Quality

**Success Rate:**

- **Current:** 85%
- **Target:** 92%
- **Measured by:** User thumbs up/down

**Response Time (p95):**

- **Current:** 3 seconds
- **Target:** 2 seconds
- **Segments:**
  - Simple queries: <1s
  - Medium queries: <3s
  - Complex queries: <10s

**User Satisfaction:**

- **Current:** 4.2/5.0
- **Target:** 4.5/5.0
- **Measured by:** Post-interaction surveys

#### Automation Success Rate

**Definition:** Percentage of automation workflows that complete successfully.

**Current:** 82%
**Target:** 90%

**Failure Categories:**

- User error (misconfiguration): 40%
- API errors (rate limits, downtime): 30%
- System errors (bugs): 20%
- Environment issues: 10%

**Recovery Strategies:**

- Better error messages
- Automatic retry logic
- Validation before execution
- Clearer documentation

#### Bug Metrics

**Active Bugs:**

- **Current:** 45
- **Target:** <20

**Bug Resolution Time:**

- **Critical (P0):** <24 hours
- **High (P1):** <3 days
- **Medium (P2):** <1 week
- **Low (P3):** <1 month

**Bug Severity Distribution:**

- P0 (Critical): 5%
- P1 (High): 15%
- P2 (Medium): 50%
- P3 (Low): 30%

---

## Business Metrics

### 1. Revenue Metrics

#### Monthly Recurring Revenue (MRR)

**Definition:** Predictable monthly revenue from subscriptions.

**Formula:**

```
MRR = Σ (Active Subscriptions × Monthly Price)
```

**Current:** $0
**Q1 2026:** $50K
**Q2 2026:** $150K
**Q3 2026:** $300K
**Q4 2026:** $500K

**MRR Growth Rate:**

- **Target:** 20-30% month-over-month
- **Benchmark:** 15-25% for early-stage SaaS

**MRR by Tier:**

- Hobby ($10): 40% of MRR
- Pro ($30): 35% of MRR
- Max ($300): 20% of MRR
- Enterprise (custom): 5% of MRR

#### Annual Recurring Revenue (ARR)

**Definition:** MRR × 12 (normalized annual revenue).

**Current:** $0
**Q4 2026:** $6M ARR
**Q4 2027:** $40M ARR

#### Average Revenue Per User (ARPU)

**Definition:** MRR / Total Paying Customers

**Current:** N/A
**Q1 2026:** $15
**Q2 2026:** $17
**Q3 2026:** $20
**Q4 2026:** $22

**ARPU by Tier:**

- Hobby: $10
- Pro: $30
- Max: $300
- Enterprise: $2,000+

### 2. Conversion Metrics

#### Free to Paid Conversion Rate

**Definition:** Percentage of free users who become paying customers.

**Current:** 0%
**Q1 2026:** 8%
**Q2 2026:** 10%
**Q3 2026:** 12%
**Q4 2026:** 15%

**Benchmark:** 5-15% for freemium SaaS

**Conversion Funnel:**

```
Sign Up: 100%
   ↓ (Day 1 activation)
Complete Tutorial: 70%
   ↓ (Day 7 engagement)
Use Core Feature 3+: 50%
   ↓ (Day 30 value)
Hit Free Tier Limit: 30%
   ↓ (Conversion moment)
Upgrade to Paid: 15%
```

**Conversion Time:**

- Day 7: 10%
- Day 14: 20%
- Day 30: 40%
- Day 60: 20%
- Day 90+: 10%

#### Tier Upgrade Rate

**Definition:** Percentage of paid users who upgrade to higher tier per month.

**Current:** N/A
**Target:** 5% monthly

**Upgrade Paths:**

- Hobby → Pro: 8% monthly
- Pro → Max: 3% monthly
- Max → Enterprise: 1% monthly

### 3. Customer Lifetime Metrics

#### Customer Lifetime Value (LTV)

**Definition:** Total revenue expected from customer over lifetime.

**Formula:**

```
LTV = ARPU × Gross Margin × (1 / Churn Rate)
```

**By Tier:**

- Hobby: $120 (12 months × $10)
- Pro: $540 (18 months × $30)
- Max: $3,600 (12 months × $300)
- Enterprise: $60,000 (36 months × $1,667)

**Target LTV (Blended):** $360

#### Customer Acquisition Cost (CAC)

**Definition:** Total cost to acquire one paying customer.

**Formula:**

```
CAC = (Sales + Marketing Expenses) / New Customers
```

**By Channel:**

- Organic (SEO, content): $30
- Referral: $20
- Paid ads: $150
- Partnerships: $100
- **Blended:** $80

**Target:** <$80

#### LTV:CAC Ratio

**Definition:** Ratio of customer lifetime value to acquisition cost.

**Formula:**

```
LTV:CAC = LTV / CAC
```

**Current:** N/A
**Target:** 3:1 minimum, 5:1 goal

**By Tier:**

- Hobby: 1.5:1 (marginal)
- Pro: 6.75:1 (good)
- Max: 45:1 (excellent)
- Enterprise: 750:1 (outstanding)

**Healthy Benchmark:** 3:1 to 5:1

#### Payback Period

**Definition:** Months to recover customer acquisition cost.

**Formula:**

```
Payback = CAC / (ARPU × Gross Margin)
```

**Target:** <12 months
**By Tier:**

- Hobby: 10 months
- Pro: 3 months
- Max: 0.3 months
- Enterprise: <1 month

**Benchmark:** <12 months for SaaS

### 4. Churn Metrics

#### Gross Churn Rate

**Definition:** Percentage of customers who cancel per month.

**Formula:**

```
Gross Churn = (Churned Customers / Starting Customers) × 100
```

**Current:** N/A
**Q1 2026:** 7%
**Q2 2026:** 5%
**Q3 2026:** 3%
**Q4 2026:** 2%

**Benchmark:** 3-7% monthly for B2B SaaS

**Churn by Tenure:**

- Month 1: 15%
- Month 2-3: 10%
- Month 4-6: 5%
- Month 7-12: 3%
- Month 13+: 2%

#### Net Revenue Retention (NRR)

**Definition:** Revenue retained from existing customers including upgrades.

**Formula:**

```
NRR = ((Starting MRR + Expansion - Churn) / Starting MRR) × 100
```

**Current:** N/A
**Q2 2026:** 105%
**Q3 2026:** 115%
**Q4 2026:** 120%

**Target:** 120%+ (indicates healthy expansion)
**Benchmark:** 100-120% for B2B SaaS

#### Churn Reasons

**Primary Reasons (from exit surveys):**

1. Cost (30%) - "Too expensive for value"
2. Complexity (25%) - "Too hard to learn"
3. Competition (20%) - "Switched to alternative"
4. Value (15%) - "Didn't use enough"
5. Other (10%) - Various reasons

**Mitigation Strategies:**

- Cost: Better onboarding to show ROI
- Complexity: Simplified UI, better tutorials
- Competition: Differentiation, unique features
- Value: Engagement campaigns, success coaching

---

## Growth Metrics

### 1. Acquisition Metrics

#### Sign-ups per Month

**Current:** 500
**Q1 2026:** 5,000
**Q2 2026:** 15,000
**Q3 2026:** 30,000
**Q4 2026:** 50,000

**Growth Rate:**

- **Target:** 30% month-over-month
- **Benchmark:** 20-40% for early-stage

**Acquisition Channels:**

- Organic (SEO): 40%
- Direct (brand): 25%
- Referral: 20%
- Paid (ads): 10%
- Social: 5%

#### Cost per Acquisition (CPA)

**Definition:** Cost to acquire one sign-up (not customer).

**Current:** $20
**Target:** <$15

**By Channel:**

- Organic: $5
- Referral: $2
- Paid: $30
- Social: $10

### 2. Activation Metrics

#### Activation Rate

**Definition:** Percentage of sign-ups who reach "aha moment."

**Aha Moment:** User completes first successful automation or generates code.

**Current:** 50%
**Target:** 70%

**Activation Funnel:**

```
Sign Up: 100%
   ↓
Email Verified: 85%
   ↓
App Downloaded: 75%
   ↓
Tutorial Started: 60%
   ↓
First Action: 55%
   ↓
Aha Moment: 50%
```

**Time to Activation:**

- Within 1 hour: 30%
- Within 24 hours: 50%
- Within 1 week: 15%
- Never: 5%

### 3. Viral Metrics

#### Viral Coefficient (K-Factor)

**Definition:** Average number of new users each user invites.

**Formula:**

```
K = (Invites Sent / User) × (Conversion Rate of Invites)
```

**Current:** 0.1
**Q1 2026:** 0.3
**Q2 2026:** 0.5
**Q3 2026:** 0.8
**Q4 2026:** 1.2

**Target:** >1.0 (self-sustaining growth)

**Viral Loops:**

1. Workflow sharing: 40% of virality
2. Team invites: 30% of virality
3. Social sharing: 20% of virality
4. Community content: 10% of virality

#### Referral Rate

**Definition:** Percentage of users who refer others.

**Current:** 15%
**Target:** 30%

**Referrals per User:**

- **Current:** 0.5
- **Target:** 1.5

**Referral Conversion:**

- **Current:** 20%
- **Target:** 40%

---

## Operational Metrics

### 1. Performance Metrics

#### System Uptime

**Current:** 99.5%
**Q1 2026:** 99.9%
**Q2 2026:** 99.95%
**Target:** 99.99%

**Downtime Impact:**

- 99.9% = 43.8 minutes/month
- 99.95% = 21.9 minutes/month
- 99.99% = 4.4 minutes/month

#### API Response Time

**Definition:** Server response time for API calls (p95).

**Current:** 500ms
**Q1 2026:** 300ms
**Q2 2026:** 200ms
**Target:** <200ms

**By Endpoint:**

- Chat: 150ms
- File ops: 100ms
- Workflow execution: varies
- Settings: 50ms

#### Error Rate

**Definition:** Percentage of API requests that return errors.

**Current:** 2%
**Target:** <1%

**Error Categories:**

- 4xx (client errors): 60%
- 5xx (server errors): 40%

### 2. Support Metrics

#### Support Response Time

**Definition:** Average time to first response on support ticket.

**Current:** 24 hours
**Q1 2026:** 8 hours
**Q2 2026:** 4 hours
**Target:** 2 hours

**By Priority:**

- Critical: <2 hours
- High: <8 hours
- Medium: <24 hours
- Low: <48 hours

#### Customer Satisfaction (CSAT)

**Definition:** Percentage of users satisfied with support.

**Formula:**

```
CSAT = (Satisfied + Very Satisfied) / Total Responses × 100
```

**Current:** 70%
**Q1 2026:** 80%
**Q2 2026:** 85%
**Target:** 90%

#### Net Promoter Score (NPS)

**Definition:** Likelihood users will recommend (scale -100 to 100).

**Formula:**

```
NPS = % Promoters (9-10) - % Detractors (0-6)
```

**Current:** 20
**Q1 2026:** 35
**Q2 2026:** 45
**Target:** 60

**Benchmark:**

- Poor: <0
- Good: 30-50
- Excellent: >70

### 3. Quality Metrics

#### Bug Resolution Time

**Definition:** Average time from bug report to fix deployed.

**Current:** 7 days
**Target:** 2 days

**By Severity:**

- P0: 12 hours
- P1: 2 days
- P2: 1 week
- P3: 2 weeks

---

## Feature-Specific Metrics

### Chat Feature

**Usage:**

- Messages per user: 30/week
- Sessions per user: 15/week
- Average session length: 10 minutes

**Quality:**

- Response success rate: 88%
- User satisfaction: 4.3/5
- Retry rate: 8%

**Model Usage:**

- GPT-4: 45%
- Claude: 30%
- Gemini: 15%
- Other: 10%

### Automation Feature

**Usage:**

- Workflows created: 5 per user
- Workflows executed: 20/week per user
- Success rate: 85%

**Popular Workflows:**

1. Code generation (35%)
2. File operations (25%)
3. Data processing (15%)
4. Testing (15%)
5. Deployment (10%)

### AGI Feature

**Usage:**

- Goals submitted: 2/week per user
- Completion rate: 78%
- Average iterations: 15
- Average duration: 12 minutes

**Goal Categories:**

1. Development (45%)
2. Research (25%)
3. Data processing (15%)
4. Testing (10%)
5. Other (5%)

---

## Cohort Analysis

### Monthly Cohort Retention

**January 2026 Cohort (1,000 users):**

```
Month 0: 1,000 (100%)
Month 1: 550 (55%)
Month 2: 450 (45%)
Month 3: 400 (40%)
Month 6: 350 (35%)
Month 12: 300 (30%)
```

### Paid Conversion by Cohort

**Cohort Size:** 1,000 users

```
Week 1: 50 (5%)
Week 2: 80 (8%)
Week 4: 120 (12%)
Week 8: 150 (15%)
Week 12: 170 (17%)
```

### Revenue by Cohort

**January 2026 Cohort:**

```
Month 0: $0
Month 1: $2,000 MRR
Month 2: $3,500 MRR
Month 3: $5,000 MRR
Month 6: $8,000 MRR
Month 12: $12,000 MRR
```

---

## Reporting Dashboard

### Daily Dashboard

**Key Metrics:**

- DAU
- Sign-ups
- Activations
- Revenue (daily)
- Critical errors
- System uptime

### Weekly Dashboard

**Key Metrics:**

- WAU
- WAAH (North Star)
- Conversion rate
- Churn rate
- NPS
- Top features used

### Monthly Dashboard

**Key Metrics:**

- MAU
- MRR
- New customers
- Churn
- LTV:CAC
- Feature adoption
- Cohort analysis

### Quarterly Business Review

**Strategic Metrics:**

- ARR
- Growth rate
- Market share
- Competitive position
- Product-market fit indicators
- Strategic initiatives progress

---

## Metric Tracking Tools

**Analytics:**

- Mixpanel (product analytics)
- Google Analytics (web traffic)
- Amplitude (user behavior)

**Business:**

- Stripe (revenue)
- ChartMogul (MRR, churn)
- ProfitWell (retention)

**Performance:**

- Datadog (infrastructure)
- Sentry (error tracking)
- New Relic (APM)

**Support:**

- Intercom (customer success)
- Zendesk (support tickets)

---

**Last Updated:** January 15, 2026
**Document Owner:** Product Management & Analytics
**Review Cycle:** Weekly (tactical), Monthly (strategic)
**Next Review:** January 22, 2026
