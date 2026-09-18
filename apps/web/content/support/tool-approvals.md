---
id: tool-approvals
title: Approvals: what a tool may do without asking
path: /agent-permissions
category: connectors
tags: approval, approvals, permission, always allow, ask every time, auto approve, read only, tool permissions, deny tool, call log, reset permissions
updated: 2026-09-17
scope: public
---

## The account-wide default

Settings carries one **Default approval for tool actions** with two settings:

- **Ask before every action.** Every connector, plugin and tool action waits for
  your approval, including actions that only read data. This is the default.
- **Run read-only actions without asking.** Actions that only read data, search
  the web, fetch a page, or run code in the AGI sandbox run on their own.
  Anything that writes, deletes, sends, buys, changes credentials, or runs on
  your own machine still asks, and so does every connector tool AGI does not
  know.

The setting syncs to your account, so it holds wherever you are signed in.

## Per-tool permissions

Each connector has a **Tool Permissions** panel that overrides the default for
one tool at a time: **Always run without asking**, **Needs approval each time**,
or **Never run this tool**. **Reset all to default** clears every override for
that connector and asks first.

## Approving in the moment

When a tool runs for the first time, AGI asks. Choosing **Always allow** saves
that verdict so the same tool can run without prompting again. A temporary chat
ignores saved "Always allow" verdicts and asks every time.

## Checking what ran

**Recent calls** on a connector is its call log: what was called and when. A
connector that has never been called says so rather than showing an empty table
that could be read as a failure.

## Removing a connector clears its approvals

Removing a connector deactivates it and clears its saved "Always allow" tool
permissions at the same time, so a later reconnect starts from a clean approval
state.
