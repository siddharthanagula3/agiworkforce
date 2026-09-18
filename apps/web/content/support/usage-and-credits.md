---
id: usage-and-credits
title: Usage limits, credits and top-ups
path: /pricing
category: billing
tags: usage, limit, quota, capacity, allowance, reset, credits, top up, buy credits, overage, ran out, rate limit, out of capacity
updated: 2026-09-17
scope: public
---

## How usage is measured

Managed cloud usage is metered. Each plan carries a capacity allowance, and the
usage view in Settings shows how much of the current allowance you have used and
when it resets, as a percentage and a reset time.

## When the allowance runs out

Managed cloud requests stop until the allowance resets. Local mode and BYOK are
unaffected, because they do not run on AGI-operated provider access: neither one
draws on a managed allowance.

## Credits

Credits are a prepaid balance you can buy and spend on managed usage, separate
from the plan allowance. **Top-up purchase** takes a custom amount in whole
dollars. The **Credit history** list shows every purchase, bonus and spend
against the balance.

## Keeping going past a limit

Settings, Billing carries **Keep going after a usage limit**: "Spend your
credits when a usage limit stops you." With no balance it says "Buy credits
above to use this", because the switch has nothing to spend. Turning it on means
managed usage continues out of credits once the plan allowance is exhausted
rather than stopping.

## Concurrency, not just volume

Plans also differ in how many responses can be generating at once. Hitting that
ceiling is not the same as exhausting your allowance: it clears as soon as an
in-flight response finishes.

## Free routing

The free lane is offered as **Auto (free) · community models, capacity varies**.
Its capacity is not guaranteed, which is what "capacity varies" means, so a free
request can be refused when a paid one would not be.
