# Working method

Status: Current
Owner: Repository maintainers
Last updated: 2026-11-24

How to work in this repository, whatever the task. `AGENTS.md` wins where it is
more specific.

- **Read before you write.** Read the files you will change, how the same thing
  is done elsewhere, the imports and the tests. Follow the pattern that exists.
  If there is none, say so and name the one you will follow.
- **Say what you assume.** Before a change with more than one reasonable shape,
  state the assumption, the trade-off and the plan. A choice that is hard to
  reverse (schema, API shape, sign-in, billing, stored data) is a decision to
  flag, not a detail. If the request is unclear, ask; do not fill the gap with
  plausible code.
- **Smallest change that solves this problem.** No abstraction for one caller,
  no handling for what cannot happen, no option nobody asked for. This never
  licenses hardcoding what the repository already models (`AGENTS.md` section 4).
- **Surgical diffs.** Change only what the task needs and match the file's
  style. Remove what your change made unused; leave other code, comments and
  formatting alone. If a fix starts to cascade across files, stop and say so.
- **One thing at a time.** Finish and verify one change before starting the
  next. Do not stack fixes ahead of verification.
- **Reproduce before fixing.** Read the whole error. Reproduce it, change one
  thing, check again. Find the cause: a null check over an unexplained null is
  not a fix. After two failed attempts, say what you tried and what you see.
- **Verification is a person-style run.** A change in behaviour counts as
  working only when it has been done in the running app the way a user would
  (click, type, tap, drag), on localhost with local test accounts, one app at a
  time, and seen on screen. Tests, type checks and code reading are never
  offered as proof. Add a regression test where the change touches money,
  sign-in, permissions or stored data, or where it cheaply guards the root
  cause. Name the failures that were there before your change.
- **Dependencies are a decision.** Use what the workspace already has, then the
  platform. Say why a new package is needed; change the manifest and let the
  package manager write the lockfile (`AGENTS.md` section 12).
- **Report plainly.** Say what changed and why, what you verified and how, what
  you did not verify, and any concern with the approach. Nothing is "done"
  without the run that shows it.

## With a tool that can drive the apps

- Verify a change in behaviour by driving the running app on localhost: a
  browser tool for web, screen control for the desktop window and the
  simulators, a shell for the CLI. Look at the screen before reporting; a green
  test run is not the report.
- One fix at a time: fix, rebuild, check it in the app, then the next. Do not
  queue fixes, designs or commits ahead of that check.
- Ask the owner only for the owner's decisions. Decide what is reversible, say
  what you chose, and carry on.
