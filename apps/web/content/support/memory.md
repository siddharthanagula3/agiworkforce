---
id: memory
title: What AGI remembers, and how to change it
path: /features/memory
category: chat
tags: memory, remember, forget, persistent memory, past chats, memory settings, forget everything, import memory, project memory
updated: 2026-09-17
scope: public
---

## The three memory switches

Settings, Memory carries three controls, each doing a different thing:

- **Persistent memory**: "Allow AGI to remember details across conversations."
  With it off, nothing is carried from one conversation to the next.
- **Search past chats**: "Let AGI look up excerpts from your other
  conversations when answering." This reads your history at answer time rather
  than storing facts. It is never used in temporary chats.
- **Allow memory generation from tool-assisted chats**: whether memories may be
  created from chats that used tools, connectors, code or web search.

## Clearing memory

**Forget everything** deletes all remembered facts. It asks first, because the
facts cannot be recovered afterwards.

## Memory inside a project

A project decides for itself whether it draws on account-wide memory. With "Use
memories from outside this project" on, chats there use what has been remembered
account-wide and anything learned there stays in that project. With it off,
chats there use only that project's memories and nothing from your other chats
is included.

## When memory is unavailable in a chat

If the composer says "Turn on Memory in Settings > Capabilities to use it here",
the capability is switched off for this surface rather than the feature being
broken. Turn it on there and reopen the chat.

## Temporary chats

A temporary chat neither reads memory nor writes to it. That is part of what
makes it temporary; see the temporary chats article.
