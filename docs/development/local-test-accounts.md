# Local test accounts

Status: Current
Owner: Platform lead
Last updated: 2026-10-19

`pnpm dev:accounts` makes a named set of accounts on the local stack, one per
plan and one per lane, so a feature can be tried on any plan without touching
production or another person's account.

## Commands

| Command                          | What it does                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------- |
| `pnpm dev:accounts seed`         | Makes every account that does not exist yet. An account that is already seeded is left as it is.  |
| `pnpm dev:accounts seed <name>`  | The same for one account.                                                                         |
| `pnpm dev:accounts reset <name>` | Puts one account back to its seed: plan, usage, credits and settings. `all` resets every account. |
| `pnpm dev:accounts list`         | Prints each account, its seed, its live state as the meters read it, and how to sign in as it.    |

Run them from the repository root. They read `apps/web/.env.local`, the same
file the local web server reads. Conversations, projects and files survive a
reset; only what an account has used, bought and chosen goes back.

## The accounts

`list` is the source of truth; the set is defined in
`apps/web/scripts/dev-accounts/catalog.ts` from the plan catalog, so a plan
added there gets an account.

- One per plan: `free`, `basic`, `pro`, `max-5x`, `max-20x`, and `team`, which
  owns a two-seat workspace, with `team-member` holding the second seat.
- `extra-usage`: Pro, extra usage on, the smallest top-up of usage credits as
  its cap, auto-reload off.
- `window-nearly-full`: Pro with the five-hour window at the critical warning
  threshold, so the next turns reach the limit.
- `stripe-pro`: Pro billed by a real Stripe test-mode subscription.
- `lane-chrome`, `lane-vscode`, `lane-desktop`, `lane-cli`, `lane-mobile`: the
  top individual plan, one per lane. `lane-credits` is Pro billed in Stripe
  test mode, so upgrades, top-ups and the billing portal run end to end.

Each account is a Clerk development-instance user with a `+clerk_test` address
and the matching local rows. The rows are written by the functions the product
uses itself: terms acceptance, the Stripe webhook's subscription and top-up
handlers, credit allocation and credit settlement. The meters read a test
account exactly as they read a real one.

## Signing in

In a Playwright spec, `signInAsDevAccount(page, '<name>')` from
`apps/web/e2e/qa-capability-harness.ts` signs in with a Clerk sign-in ticket
and returns the user id. Use one account per spec or lane, and reset it when
you are done, instead of sharing the QA account.

By hand, open `http://localhost:3000/login`, enter the account's address from
`list` (`agi-dev-<name>+clerk_test@example.com`) and the code `424242`. Clerk's
development instance accepts that fixed code for `+clerk_test` addresses and
sends no mail.

## What it refuses

The commands check the environment before they load anything that can write,
and stop when any of these is true. There is no override.

- A Postgres URL anywhere in the environment names a host other than
  `127.0.0.1`, `localhost`, `::1`, a `*.localhost` name or a `*.test` name.
- The database, once connected, answers from an address that is not loopback.
- `AGI_DATABASE_WS_PROXY` points off this machine.
- The runtime declares itself `preview` or `production`.
- The Clerk key is missing or belongs to a production instance.
- The Stripe key is missing or is a live-mode key.

`apps/web/scripts/__tests__/dev-accounts.test.ts` covers each refusal.
