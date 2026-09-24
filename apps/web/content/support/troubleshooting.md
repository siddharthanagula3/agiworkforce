---
id: troubleshooting
title: Troubleshooting: when something does not work
path: /support
category: troubleshooting
tags: troubleshooting, not working, error, failed, broken, stuck, cannot send, no response, offline, retry, upgrade required, unavailable, contact support, search failed, search unavailable, cli login, agi login, device code, extension
updated: 2026-09-22
scope: public
---

## Start here

Most failures name themselves on screen. Read the message before changing
anything: AGI distinguishes "this is switched off", "your plan does not include
this", "this model cannot do this" and "this is broken", and the fix is
different for each.

Check the status page before investigating your own account.

## A chat will not load

"Chat could not be displayed" with **Try again** means the conversation failed
to render, or, when it adds "Could not reach the server.", that the request
failed on the way. Either way your messages are already saved, so retrying or
opening another conversation loses nothing. "You are offline" means the browser
lost its connection: reconnect and try again.

## A message will not send

- "Your previous message was still starting, so this one is back here. Send it
  again." Send it once more; nothing was lost.
- "Your queued message was not sent: you switched chats before the reply
  finished." It was saved as a draft in the original chat. Its attachments were
  not kept, so re-attach them.
- A plan-limited refusal names the plan, not a fault. Check the usage view in
  Settings for the current allowance and reset time.

## A file was not attached

The composer refuses a file instead of sending your message without it, and names
the file and the reason, such as too large, a type it cannot read, or too many
files. Convert, split, or paste the contents as text.

## A tool or connector did nothing

Under the website's Skip approvals default, eligible tools run automatically.
A session may still wait for a destructive or unknown action, a saved Ask choice,
or a workspace restriction. Check the approval prompt, the connector's
**Recent calls** log, and its per-tool permissions: a tool set to
**Never run this tool** is refused by your own setting.

## A model is missing from the picker

The badge says which case it is: **Upgrade** (your plan), **Coming soon, not yet
available** (not live yet), or **Unavailable right now** (live but not
answering). A workspace model policy can also remove models entirely, in which
case they do not appear at all.

## A retired model

A conversation saved with a model that no longer exists says so in place and
continues on a named replacement. Nothing is lost, and you can pick a different
model.

## Voice will not start

The message names the cause: microphone denied, no microphone available, the
browser cannot open a voice connection, or the connection failed or dropped.
Grant the microphone permission in site settings, or try again on a network that
allows the connection.

## Search did not run

A web search that could not run shows as a failed search step in the reply, and
the answer is written without live results. The model is told the search did
not run and why, and is instructed to say which parts it could not confirm, so
check the step before relying on anything time-sensitive. If the composer shows
search as off for the model you picked, that model has no search path here, so
pick one that has.

Searching your own conversations with Cmd/Ctrl+K reports a failed request as
"Search failed. Please try again." If the search window itself cannot open, it
shows "Search unavailable" instead; close it and open it again.

The help centre's search tells an index that could not be loaded apart from a
query that matched nothing, so "nothing matched" really means nothing matched.

## The CLI will not sign in

`agi login` with no provider signs in to your AGI account. It shows a link and
a code, opens the link in your browser, and waits while you approve the code
there, signed in to the same account. If the wait stops with "Device code
expired. Please run /login again." or "Authorization timed out", the code was
not approved in time: run `agi login` again for a fresh one.

`agi auth-status` lists every credential the CLI holds and how each one
authenticates; "No authentication configured." means nothing is stored yet.
`agi doctor` runs the local preflight checks. The CLI keeps credentials in the
operating system's credential store, and a credentials file that other accounts
on the machine can read is refused, with the command that fixes it.

## An extension will not connect

Neither the Chrome extension nor the VS Code extension is published yet, so
there is no public build to connect. In Chrome, use the web app; in VS Code, use
the CLI in the integrated terminal.

## Still stuck

Email contact@agiworkforce.com. Include your **User ID** from Settings, Account,
and the **Organization ID** too if the problem is workspace-wide. The support
page lists the available channels and response commitments.
