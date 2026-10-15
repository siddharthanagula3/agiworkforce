---
id: memory
title: What AGI remembers, and how to change it
path: /features/memory
category: chat
tags: memory, remember, forget, persistent memory, past chats, memory settings, forget everything, import memory, project memory
updated: 2026-10-15
scope: public
---

## Memory switches

Settings, Memory includes these controls, each doing a different thing:

- **Persistent memory**: "Allow AGI to remember details across conversations."
  With it off, persistent remembered facts are not included in chat context.
  Search past chats has a separate switch.
- **Search past chats**: "Let AGI look up excerpts from your other
  conversations when answering." This reads your history at answer time rather
  than storing facts. It is never used in temporary chats.
- **Include sensitive topics in memory**: off by default. While it is off, AGI
  is designed to keep your health, race or ethnicity, religious beliefs,
  politics, sexual orientation, gender identity or union membership only when
  you say "Remember that" in a chat on the web, desktop, mobile or Chrome, or
  add them yourself in Settings, Memory. In the CLI, add one with
  `agi memory add`. Memories saved earlier stay until you delete them.
- **Allow memory generation from tool-assisted chats**: whether memories may be
  created from chats that used tools, connectors, code or web search.

## What memory is designed not to keep

AGI is designed not to save some details, even if you ask, and refuses them
when it recognises them: passwords, keys and tokens, payment card and bank
account details, government ID numbers, biometric identifiers, street addresses
and map coordinates, criminal history and immigration status.

## Clearing memory

In Settings, Memory, choose **Clear all memories**, then confirm
**Forget everything**. This acts on remembered facts in the current personal
or workspace scope.

## Memory inside a project

For a project you own, the memory switch controls which remembered facts are
eligible. With "Use memories from outside this project" on, account-wide facts and this
project's facts can be included when memory is enabled for the chat. With it
off, only this project's remembered facts are eligible. Search past chats has
its own setting and follows the project's memory scope. Account instructions
and style have separate project switches. Not every saved fact or passage is
included in every reply.

## When memory is unavailable in a chat

If Memory is unavailable in the composer, open Settings, Memory and check
**Persistent memory**. The composer can also show the unavailable state while
settings are loading or after a settings-load error. Retry loading settings
if a load error appears.

## Temporary chats

A temporary chat neither reads memory nor writes to it. That is part of what
makes it temporary; see the temporary chats article.
