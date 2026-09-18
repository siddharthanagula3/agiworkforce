---
id: agi-work
title: Run a task with AGI Work
path: /agi-work
category: work
tags: agi work, work, agent, task, autonomous, session dock, outputs, progress, sources, approvals, work history, deliverables
updated: 2026-09-17
scope: public
---

## What AGI Work is

AGI Work is the mode for a task rather than a question: you describe a
multi-step job and what it should deliver, and the session plans, works and
produces files. The composer switches between **Chat**, for quick questions and
conversation, and **AGI Work**, where the placeholder asks you to describe a
multi-step task and what it should deliver.

## Watching a session

A running session opens a dock beside the conversation with four sections:

- **Progress**: the steps the session planned. Before it plans, the section says
  steps appear once the session plans its work.
- **Sources**: the pages the session reads as it searches.
- **Outputs**: the files the session produced, each with **Open** and
  **Download**.
- **Context**: the connectors the session used, empty until one is called.

A plain chat gets the same dock titled **Chat details**, listing the files
created in that chat, and does not claim to be a Work session.

## Approvals during a session

What a session may do on its own follows your tool-approval default. On the
default, **Ask before every action**, every connector, plugin and tool action
waits for you, reads included. If you switched to **Run read-only actions
without asking**, the session shows a notice saying so: read-only actions run
without asking, and anything that writes, runs code, searches the web, or
reaches outside AGI, including your connectors, pauses for your approval.

## Finding past sessions

**Work history** at the tasks page lists previous sessions. Opening one and
choosing to run it again loads that session's goal into a new AGI Work chat for
you to review and send, rather than re-running it unattended.

## Availability

AGI Work is one of the features a workspace administrator can turn off for a
managed workspace, and higher-capacity work is a paid-plan feature. The pricing
page carries the current details.
