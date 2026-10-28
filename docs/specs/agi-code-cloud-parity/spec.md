# AGI Code cloud sessions at Claude's level

Status: In progress
Owner: Code surface maintainers
Last updated: 2026-10-27

## What and why

AGI Code's cloud sessions (the website's Code page, run in E2B sandboxes) must do at
least what Claude Code's cloud sessions do, work end to end with GitHub, and let a person
pick any coding agent the account's sandboxes carry, not only AGI's own.

Evidence, read 2026-10-27: Claude's cloud environment and cloud session docs
(`code.claude.com/docs/en/cloud-environments.md`, `claude-code-on-the-web.md`), ChatGPT's
Codex cloud docs (`learn.chatgpt.com/docs/cloud.md`,
`learn.chatgpt.com/docs/environments/cloud-environments.md`), Cursor's cloud agent docs
(`cursor.com/docs/cloud-agent.md`), and Claude's Code screens observed the same day.

## Requirements

Already in place, verified in code: a repository and branch picker with search, a branch
of its own per session, separate least-privilege clone and push credentials, pull
request creation, pin, rename, copy link, share, archive and delete, slash commands, the
context window, pausing between turns, a per-session network policy with extra hosts, and
a choice of agent: AGI's own and seven CLIs.

Missing or below Claude:

1. Saved environments: a name, a network level (none, trusted, full, custom allowlist),
   environment variables, and network secrets the proxy adds outside the sandbox.
2. A setup script per environment, run after the clone as a real step, with its result
   cached as a sandbox snapshot so later sessions start with dependencies installed.
3. Permission modes for cloud sessions: Auto, Accept edits and Plan.
4. Real progress steps from the session (container, clone, setup, agent), and grouped
   tool activity ("ran 7 commands, read 2 files").
5. Turns with no practical time limit: the agent runs in the background in the sandbox
   and the page follows it, instead of a web request held open (today about 12 minutes).
6. Shared sandbox capacity: a ceiling under the provider's 100 concurrent sandboxes, a
   queue instead of an error, and paid plans first.
7. Our own pinned agent templates sized to the plan (8 vCPU, 8 GB, 20 GB), not the
   provider's public ones, which change under us.
8. Mark as unread, sections, more than one repository per session, and a repository
   access check.
9. Agents that need the person's own key ask for it (done, `4cead01f91`).
10. Generous limits like Claude, ChatGPT and Cursor (done, `b2f398d44d`): 24-hour runs on
    paid plans and 2 to 20 parallel sandboxes per person.

## Acceptance

A person signs in on the website, connects GitHub, picks a repository and branch and an
agent, starts a task that runs longer than 15 minutes, sees real steps, gets a branch and a
pull request, and can resume the session later. Each item has tests that fail without it.

## Non-goals

Claude's own models, Claude Tag channels, Dispatch from a phone and the iOS Simulator.
