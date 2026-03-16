# AGI Workforce — Customer Process & Policy Research

**Date:** March 16, 2026
**Researcher:** Claude (Customer Research Skill)
**Scope:** Refund/cancellation policies, escalation procedures, SLA/response time commitments

---

## Executive Summary

This research assessed the current state of customer-facing policies and internal processes across the AGI Workforce codebase. The key finding is that **the technical infrastructure is well-built** (Stripe webhooks, credit revocation, ticketing), but **customer-facing policy documentation is largely missing or informal**. There are significant gaps that should be addressed before scaling support operations.

---

## 1. Refund & Cancellation Policy

### Direct Answer

There is no published refund policy. The backend fully supports refunds, but customers have no documented terms to reference.

**Confidence:** High (code evidence is clear; absence of policy docs is confirmed)

### What Exists (Backend)

The codebase has comprehensive refund processing infrastructure:

- **Stripe webhook handler** (`apps/web/app/api/stripe-webhook/route.ts`) processes `charge.refunded` events for both full and partial refunds
- **Database function** `handle_refund()` (defined in multiple migrations) revokes credits proportional to refund amount
- **Subscription cancellation** is handled via `customer.subscription.deleted` webhook, revoking remaining credits
- **Downgrade handling** adjusts credits proportionally when customers change plan tiers
- **Test coverage** is strong: dedicated test suites for refund scenarios (`stripe-refund.test.ts`, 524+ lines), cancellation (`stripe-cancel.test.ts`, 890 lines), and downgrade (`stripe-downgrade.test.ts`, 1111 lines)

### What Exists (Customer-Facing)

- **FAQ page** (`apps/web/app/faq/page.tsx`) states: _"You can cancel your subscription at any time from your account settings. You will continue to have access to your plan features until the end of your current billing period."_
- **Terms of Service** (`apps/web/app/terms/page.tsx`) contains a general "Termination" section but no explicit refund terms
- **Stripe Billing Portal** is available at `/api/portal` for self-service subscription management

### Gaps Identified

- No published refund eligibility criteria (e.g., "30-day money-back guarantee" or "pro-rated refunds")
- No documented refund processing timeframe
- No chargeback/dispute procedure documented
- No policy on whether used credits are refundable
- No distinction between voluntary cancellation refunds vs. service failure refunds

### Recommendation

Draft and publish a formal refund policy covering eligibility, timelines, credit handling, and dispute resolution. This is a compliance risk and creates inconsistency in how support staff handle refund requests.

---

## 2. Escalation Procedures

### Direct Answer

There are no formal escalation procedures documented. The support system has priority fields but no automated escalation logic or documented workflows.

**Confidence:** High (thorough search of codebase confirms absence)

### What Exists

**Support Ticket System** (`apps/web/features/support/services/support-service.ts`):

- **Priority levels:** low, normal, high, urgent
- **Status workflow:** open → in_progress → resolved → closed
- **Reply system:** distinguishes staff vs. user replies
- **Email notifications:** ticket_created, ticket_status_update, ticket_reply
- **Contact categories:** Bug Report, Feature Request, Billing, General

**Support channels** (from dashboard support page):

- Email: support@agiworkforce.com
- Status page: https://status.agiworkforce.com
- GitHub Discussions
- Stated response time: "We typically respond within 24 hours"

### Gaps Identified

- No automated priority escalation (e.g., tickets unanswered for 24h auto-escalate to "high")
- No SLA breach detection or alerting
- No documented escalation paths (when to involve engineering, product, leadership)
- No on-call rotation or incident management integration (PagerDuty, etc.)
- No ticket routing or skill-based assignment logic
- No triage automation or categorization rules
- No admin/staff dashboard for managing the support queue
- No performance metrics tracking (response time, resolution time, MTTR)
- No customer tier-based routing (enterprise vs. free tier)

### Recommendation

Create a formal escalation matrix that maps priority levels to response time expectations, defines escalation triggers, and documents the path from support → engineering → product → leadership. Implement SLA monitoring before taking on enterprise customers.

---

## 3. SLA & Response Time Commitments

### Direct Answer

SLAs are mentioned only for the Enterprise tier. Internal performance targets exist in PRD documents but are not published as customer-facing commitments.

**Confidence:** High (multiple PRD documents and pricing pages reviewed)

### Support Tiers by Plan

| Plan                     | Audit Log | Support Channel     | SLA             |
| ------------------------ | --------- | ------------------- | --------------- |
| Hobby ($10/mo)           | 7 days    | —                   | None            |
| Pro ($29.99/mo)          | 30 days   | Email               | None            |
| Team                     | 90 days   | Email + Chat        | None            |
| Enterprise ($99/seat/mo) | 90 days   | Email + Chat + Call | None            |
| Enterprise (Full/Custom) | 1 year    | Dedicated           | Yes (undefined) |

### Internal Performance Targets (from PRDs — not customer-facing)

**Platform uptime:**

- Web app (Vercel): 99.9% (v1.2.0) → 99.99% (v2.0.0)
- LLM provider routing: ≥99.5% (v1.2.0) → ≥99.9% (v2.0.0)
- Crash-free session rate: ≥99.5% across platforms

**Response times (technical, not support):**

- API p95 latency: <500ms (v1.2.0) → <200ms (v2.0.0)
- Chat page TTI: <3s (v1.2.0) → <2s (v2.0.0)
- Cold start: <3s (v1.2.0) → <2s (v2.0.0)

**Customer-facing promise (informal):**

- Dashboard support page states: "We typically respond within 24 hours"

### Plan Tier Details

| Tier       | Monthly | Cloud Credits | Automations | API Calls | Storage | Team   |
| ---------- | ------- | ------------- | ----------- | --------- | ------- | ------ |
| Hobby      | $10     | $3.50         | 10/day      | 100       | 1 GB    | 1      |
| Pro        | $29.99  | $12.00        | Unlimited   | 10,000    | 10 GB   | 1      |
| Max        | $299.99 | $150.00       | Unlimited   | 100,000   | 100 GB  | 5      |
| Enterprise | Custom  | $1,000.00     | Unlimited   | Custom    | Custom  | Custom |

### Gaps Identified

- Enterprise SLA is referenced but never defined (no response time targets, no uptime guarantees, no remedies for breach)
- No published SLA document for any tier
- No credit/refund mechanism for SLA breaches
- "24 hour" response time is informal — not a binding commitment
- No differentiated response times by plan tier or ticket priority
- No health/status monitoring integrated with customer-facing SLA reporting

### Recommendation

Define and publish SLA terms for at least the Enterprise tier before actively selling to enterprise customers. Consider tiered response time commitments (e.g., Free: best effort, Pro: 24h, Enterprise: 4h for urgent). Implement monitoring to track compliance.

---

## Key Sources

| Source                 | Path                                                    | Relevance                      |
| ---------------------- | ------------------------------------------------------- | ------------------------------ |
| Stripe webhook handler | `apps/web/app/api/stripe-webhook/route.ts`              | Refund/cancel processing       |
| Support service        | `apps/web/features/support/services/support-service.ts` | Ticket system                  |
| Dashboard support page | `apps/web/app/dashboard/support/page.tsx`               | Customer-facing support        |
| FAQ page               | `apps/web/app/faq/page.tsx`                             | Cancellation policy (informal) |
| Terms of Service       | `apps/web/app/terms/page.tsx`                           | Legal terms                    |
| Billing docs           | `docs/features/billing.md`                              | Plan tiers, credits            |
| PRD (main)             | `docs/PRD.md`                                           | Enterprise SLA mention         |
| PRD (macOS)            | `docs/prd/PRD-MACOS.md`                                 | Support tiers, uptime targets  |
| PRD (web)              | `docs/prd/PRD-WEB.md`                                   | Performance targets            |
| Refund DB function     | `supabase/migrations/20260106000000_*.sql`              | Credit revocation logic        |
| Refund tests           | `apps/web/__tests__/api/stripe-refund.test.ts`          | Refund behavior validation     |
| Cancel tests           | `apps/web/__tests__/api/stripe-cancel.test.ts`          | Cancellation behavior          |
| Downgrade tests        | `apps/web/__tests__/api/stripe-downgrade.test.ts`       | Plan change behavior           |

---

## Overall Assessment

The AGI Workforce platform has **strong technical foundations** for billing, refunds, and basic support ticketing. However, there is a clear gap between what the system can do and what is documented for customers and support staff. The three highest-priority actions are:

1. **Publish a formal refund policy** — reduces support ambiguity and legal risk
2. **Define enterprise SLA terms** — required before enterprise sales
3. **Create an internal escalation playbook** — ensures consistent support quality as the team scales
