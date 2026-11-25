---
id: 'DOC-70-qa-start-here-where-things-stand'
type: 'qa-method'
title: 'Where things stand'
last_reviewed: '2026-11-24'
revision: 'f51d16e747'
---

# Where things stand (2026-11-24, evening)

Every line says which build it refers to.

| Name used below | What it is                                                                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Main**        | `~/Desktop/agiworkforce`, branch `main` at commit `f51d16e747`, the same as GitHub. Clean. This is the current code and what a tester should build          |
| **Old base**    | Commit `22649ece43`, where main was on the morning of 2026-11-24, before another agent's large change landed                                                |
| **Fix branch**  | `claude/web-lane`: the old base plus six fix commits, in `~/.cache/agi-audit/worktrees/web-lane`. Not pushed. It must be moved onto main before it can land |

Production is older than all of these. Nothing below has been deployed.

## What a person has seen

**Web basics.** 19 basic capabilities, each as a Free and as a Subscribed user: 1 pass, 30 partial, 2 fail, 5 blocked.

- First run (26 checks): old base. Rerun of 12 Free checks: fix branch.
- **None of these runs was on main.** Main has changed since (about 660 files). The results are a guide to what to look at, not the state of main.
- Not tested: the public sign-up form, voice with a real microphone, connecting an outside app, a cloud coding pull request.
- Scorecard: `../results/basics/scorecards/web.csv`. Every problem seen: `../defects/web-problems-seen-in-browser.csv` (237 lines).

**Other apps' basics.** Desktop 0 of 14, Mobile 0 of 56, VS Code 0 of 24, Chrome 0 of 14, CLI 9 of 108 (6 partial, 3 fail).

**The full plans.** 7,200 items the code audit calls built across six apps; 149 have a passing result from a real run recorded in the project's ledger (Web 141, others 8).

## Six fixes on the fix branch

None is on main. A test of main will not show them.

| Fix                                                            | Seen in a browser on the fix branch?                                                                                                                                                         |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A workspace member can chat in a project shared with them      | Yes, works. The move-to-project action needed a second try; the message to a member whose access was removed is wrong                                                                        |
| A deleted or un-shared schedule's public link stops working    | Yes, works. The delete dialog does not say the link will stop                                                                                                                                |
| Scheduled runs no longer stop at 40 seconds                    | **No.** A long run passed 40 seconds and failed at 53 with "The model took too long to respond": one model step sent nothing for 25 seconds and the run stopped without trying another model |
| Idle sign-out is off unless the person picks a limit           | Yes, works. No warning before sign-out, and it lands on the home page, not a sign-in page that says why                                                                                      |
| Slack link page names the Slack account and needs a ticked box | Not seen. The local server had no Slack settings                                                                                                                                             |
| Checking image progress no longer uses up the image limit      | Not seen. Only the phone app polls for image progress                                                                                                                                        |

Checks on the fix branch: type check, lint and the tests of the changed files pass; 19 of the 20 guards run pass (one cannot run in that folder). The full test suite and full guard chain have not completed on it.

## What the code reading says

- Each feature page ([20-features](../../20-features/README.md)) gives the state of the code per app, read on 2026-11-24 at main, beside the older ledger status.
- Root causes of 15 major Web problems, each with a fix design: `../defects/root-causes/`. Not fixed.
- All gaps: [80-gaps](../../80-gaps/README.md).

## Waiting on the owner

- Three decisions: [rules.md](rules.md), last section.
- Open product choices: [10-requirements/open-product-choices.md](../../10-requirements/open-product-choices.md).
- Merging the branch `claude/agent-contract` (updated `AGENTS.md` and `CLAUDE.md`, and 26 corrections to 23 project documents), and committing this knowledge base.
