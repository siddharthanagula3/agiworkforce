---
id: "DOC-70-qa-setup-accounts"
type: "setup"
title: "Test accounts (local only)"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Test accounts (local only)

The project's own page on this is `../../../docs/development/local-test-accounts.md`. It is the source of truth; this page adds what was learned while testing on 2026-11-24.

## Signing in

1. Open `http://localhost:3000/login`.
2. Dismiss the cookie banner with "Necessary only".
3. Type the email and press Continue. If a password screen appears, press "Email me a code".
4. Enter the code `424242`. It is the test code of the development sign-in service; no mail is sent.

## Accounts that exist in the local database

Checked on 2026-11-24. All emails end in `+clerk_test@example.com`.

| Email starts with                                                                                                          | Plan                                          | Notes                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `agi-dev-free`                                                                                                             | Free                                          |                                                                                                      |
| `agi-dev-basic`                                                                                                            | Basic                                         |                                                                                                      |
| `agi-dev-premium`                                                                                                          | Premium                                       | Its five-hour allowance was used up on 2026-11-24                                                    |
| `agi-dev-ultra`                                                                                                            | Ultra                                         |                                                                                                      |
| `agi-dev-team`                                                                                                             | Team, owner of "Test workspace (team)"        |                                                                                                      |
| `agi-dev-team-member`                                                                                                      | Member of that workspace                      |                                                                                                      |
| `agi-dev-window-nearly-full`                                                                                               | Premium with its five-hour window almost used | For testing the limit message                                                                        |
| `agi-dev-lane-chrome`, `agi-dev-lane-cli`, `agi-dev-lane-desktop`, `agi-dev-lane-mobile`, `agi-dev-lane-vscode`, `agi-dev-lane-credits` | Paid                                          | One per app, for the agent working on that app. Their plan period ended 2026-11-19; reset before use |
| `agi-web-fra-20261124c`, `frb`, `frc`                                                                                      | Free                                          | First-time accounts made for the Free reruns; they have now completed the age and terms steps        |

## A paid test account stops working after a month

The plan on a test account is granted by hand with a one-month period. After that date every chat fails with "Your plan's billing period ended", while Billing still says Active. This is a known product defect (`defects/root-causes/MANUAL-PLAN-PERIOD.md`). Until it is fixed, reset the account:

```bash
cd ~/.cache/agi-audit/worktrees/web-lane
scripts/dev/light-job.sh pnpm dev:accounts reset basic      # or premium, ultra, team, team-member, window-nearly-full
```

A reset also clears that account's chats and usage.

## A first-time account without the sign-up form

The sign-up form cannot be completed by an automated browser. This makes a new account that has never signed in, in the development sign-in service only:

```bash
bash ~/.cache/agi-audit/web-lane/make-free-user.sh "agi-web-<any-name>+clerk_test@example.com"
```

Then sign in as above. The age step and the terms step appear as they would for a new person. Answer as an adult. Do not try an age under 18 on an account you still need; it may lock the account.

## Rules

- Tag everything you create (chats, projects, schedules, files) with a short name of your own so you can find it again.
- Never open, rename or delete something you did not create.
- One running answer at a time on a Free account. Use a different Free account for a second tester.
