---
id: vscode-extension
title: The VS Code extension
path: /vscode-extension
category: surfaces
tags: vs code, vscode, editor, extension, ide, explain selection, refactor, generate tests, fix issue, agent mode, sign in to cloud, local runtime
updated: 2026-09-17
scope: public
---

## Availability

The VS Code extension is not published yet. The VS Code page carries its status
and a notify list; there is no marketplace listing to install from today, and
this page will not pretend otherwise.

## What it is being built to do

The extension puts a chat sidebar and an editor chat panel in VS Code, backed by
the same account as the web app. Its commands cover the editor work you would
otherwise paste into a chat: **Explain Selection**, **Fix Issue**, **Refactor
Code** and **Generate Tests**, plus diagnostics and code actions in the editor
itself.

## Sessions and conversations

Conversations are listed in the sidebar and can be opened, forked, deleted and
refreshed, with a session history view, so a conversation started in the editor
is the same kind of object as one started on the web.

## Trust modes in the editor

VS Code is one of the two surfaces that accept your own provider keys. **Set API
Key** and **Clear API Key** manage BYOK, **Select Model** chooses what answers,
and **Restart Local Runtime** manages a model running on your machine. **Sign in
to AGI Cloud** and **Sign out of AGI Cloud** control managed access separately,
so the two trust boundaries stay distinct here as everywhere else.

## The CLI in the same environment

**Check the CLI in This Environment** reports whether the `agi` command is
present and usable from the editor's environment, which is the first thing to
check when an editor action that shells out fails.

## Until it ships

Use the CLI in the VS Code integrated terminal. It is published, it accepts
provider keys, and `agi review` and `agi apply` cover the diff workflow.
