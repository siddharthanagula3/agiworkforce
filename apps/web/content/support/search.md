---
id: search
title: Search: the web, your chats and the help centre
path: /chat
category: search
tags: search, web search, find a conversation, search messages, search history, search past chats, deep research, sources, citations, help search
updated: 2026-09-17
scope: public
---

## Searching the web from a chat

There is no search switch to find. Managed web search is ambient: it stays on
whenever the selected model and deployment have a real search path, and turns
off only when no such path exists. The composer states whether search is on for
the model you picked. `/search` in the composer states the intent explicitly for
a single message.

Managed cloud search follows the chat and usage policy for your plan. In Local
and BYOK the behaviour depends on the runtime and provider you selected.

## Deep Research

**Deep Research** is a separate composer mode for multi-step investigation
rather than a single answer. It is not available on every model: choosing one
that cannot do it says "Deep Research isn't available for this model. Choose
Auto or a model that supports Deep Research." Availability also depends on your
plan, and an ineligible plan shows "Upgrade to use Deep Research".

## Finding your own conversations

Cmd/Ctrl+K opens search across your messages and conversations. It searches
message text as well as titles, filters by date, and marks results that came
from a code session or a project source. Your recent searches are kept; clearing
them warns that it cannot be undone.

## Letting AGI search your past chats

Settings, Memory holds **Search past chats**: "Let AGI look up excerpts from
your other conversations when answering." It is never used in temporary chats.

## Searching the help centre

The help page carries a search box over everything published here. It is plain
keyword retrieval over the published pages, with no model call, so it keeps
working even when the support assistant is off. If nothing matches, it says so
rather than guessing, and points at contact@agiworkforce.com.
