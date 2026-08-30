# UI colour tokens and interaction primitives

Applies to `apps/web/**`, `packages/ui/**` and any surface that loads
`packages/ui/design-tokens/src/chat.css`.

## A colour token names a role, not a hue

Every accent and status colour has up to three roles, and one value cannot
serve them all. On 2026-08-30 a single token filled all three in six separate
families; each theme failed whichever role it was not tuned for, and the
measurements were not close — 2.10:1 for destructive text in dark, 1.04:1 for
a "deletion is not recoverable" warning painted with the colour meant to sit
_on_ red.

| role    | token shape      | question it answers                             |
| ------- | ---------------- | ----------------------------------------------- |
| fill    | `--x`            | what colour is the solid background             |
| text    | `--x-text`       | what colour is this word on the page background |
| on-fill | `--x-on-primary` | what colour is the label drawn on that fill     |

Before using a token, ask which background it renders against. **A token's name
is not evidence of that background** — `--chat-accent-primary-contrast` is
white, which passes on the secondary accent at 4.63:1 and fails on the primary
at 3.11:1, so the same token is right in three call sites and wrong in eight.
Check the element's actual background, including inline-style ternaries that a
class-string search will not find.

Do not dilute a text token with an opacity modifier. `--muted-foreground` and
`--chat-accent-primary-text` are already the de-emphasised value; `/70` on
either drops it under 4.5:1. If something needs less weight, change size or
font-weight.

`apps/web/shared/components/__tests__/theme-contrast.test.ts` computes these
ratios from the stylesheet. Add a case there when you add a token.

## Use the primitives that exist

Hand-rolling these produced real defects, so they are not stylistic
preferences:

- `useConfirmAction` — anything a user cannot undo. See AGENTS.md §9.
- `useMenuKeyboard` — any `role="menu"` panel. `role="menu"` promises arrow
  navigation, Escape, and focus returning to the trigger; a panel that only
  closes on outside-click is claiming a contract it does not honour.
- `Spinner` — loading affordances. A bare `animate-spin` div announces nothing
  to a screen reader and ignores `prefers-reduced-motion`.

## Two things a component test cannot see

**A jsdom pass is not a browser pass for anything involving event order.** The
menu keyboard fix passed its unit test while broken in Chrome: the sidebar's
own arrow-key handler consumed the event first, which jsdom has no equivalent
of. Behaviour that competes with other listeners needs a spec under
`apps/web/e2e/`.

**Live sweeps only measure the states the account's data produces.** Empty,
error and loading states are invisible to them — the sidebar's empty-state CTA
was under the 24px target minimum for as long as the QA account had
conversations. Cover those at component level, where the state is
deterministic.
