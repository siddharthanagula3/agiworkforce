---
id: tool-approvals
title: Approvals: what a tool may do without asking
path: /agent-permissions
category: connectors
tags: approval, approvals, permission, always allow, ask every time, auto approve, read only, tool permissions, deny tool, call log, reset permissions
updated: 2026-09-22
scope: public
---

## The account-wide default

Settings carries one **Default approval for tool actions** with three settings:

- **Ask before every action.** Every connector, plugin and tool action waits for
  your approval, including actions that only read data.
- **Run read-only actions without asking.** Actions that only read data, search
  the web, fetch a page, or run code in the AGI sandbox run on their own.
  Anything that writes, deletes, sends, buys, changes credentials, or runs on
  your own machine still asks, and so does every connector tool AGI does not
  know.
- **Skip approvals.** This is the website default for an unconfigured account.
  Eligible reads, searches, sandboxed code, and reversible actions run without
  asking. Destructive or unknown actions still ask. Saved per-tool Ask and Deny
  choices and workspace restrictions still apply.

Your saved choice syncs to your account. If the website cannot read it, tools
ask rather than assuming automatic approval.

## Per-tool permissions

Each connector has a **Tool Permissions** panel that overrides the default for
one tool at a time: **Always run without asking**, **Needs approval each time**,
or **Never run this tool**. **Reset all to default** clears every override for
that connector and applies the account policy.

## Approving in the moment

When a tool requires approval, choosing **Always allow** saves that verdict so
the same tool can run without prompting again. A temporary chat ignores saved
"Always allow" verdicts.

## Checking what ran

**Recent calls** on a connector is its call log: what was called and when. A
connector that has never been called says so rather than showing an empty table
that could be read as a failure.

## Removing a connector clears its approvals

Removing a connector deactivates it and clears its saved "Always allow" tool
permissions at the same time, so a later reconnect starts from a clean approval
state. It also asks the provider to revoke every account you connected through
that connector, not only the one AGI treated as the default, and deletes the
credentials AGI held for them.
