# apps/mobile/src/features/billing

Status: Current
Owner role: Mobile lead
Last updated: 2026-05-21
Purpose: Mobile billing prompts, paywall entry points, upsell cards, and plan presentation.

## Rules

- Import billing UI through `@/src/features/billing`.
- Payment and subscription network calls must stay behind approved API/service boundaries.
- Do not put managed-credit ledger logic in Mobile UI components.
