---
id: troubleshooting
title: Troubleshooting: when something does not work
path: /support
category: troubleshooting
tags: troubleshooting, not working, error, failed, broken, stuck, cannot send, no response, offline, retry, upgrade required, unavailable, contact support
updated: 2026-09-17
scope: public
---

## Start here

Most failures name themselves on screen. Read the message before changing
anything: AGI distinguishes "this is switched off", "your plan does not include
this", "this model cannot do this" and "this is broken", and the fix is
different for each.

Check the status page before investigating your own account.

## A chat will not load

"Chat could not be displayed" with **Try again** is a render failure; your
messages are already saved, so retrying or opening another conversation loses
nothing. "You are offline" means the browser lost its connection: reconnect and
try again.

## A message will not send

- "Your previous message was still starting, so this one is back here. Send it
  again." Send it once more; nothing was lost.
- "Your queued message was not sent: you switched chats before the reply
  finished." It was saved as a draft in the original chat. Its attachments were
  not kept, so re-attach them.
- A plan-limited refusal names the plan, not a fault. Check the usage view in
  Settings for the current allowance and reset time.

## A file was not attached

The composer refuses a file instead of sending your message without it, and says
why: too large, an unreadable type, too many files in one message, or the
conversation's attachment limit. Convert, split, or paste the contents as text.

## A tool or connector did nothing

On the default approval setting every tool action waits for you, so a session
that looks stalled may be waiting on an approval. Check the approval prompt, the
connector's **Recent calls** log, and its per-tool permissions: a tool set to
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

## Still stuck

Email contact@agiworkforce.com. A real person reads it. Include your **User ID**
from Settings, Account, and the **Organization ID** too if the problem is
workspace-wide.
