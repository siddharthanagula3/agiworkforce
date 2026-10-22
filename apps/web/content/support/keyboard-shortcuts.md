---
id: keyboard-shortcuts
title: Keyboard shortcuts
path: /chat
category: chat
tags: keyboard, shortcut, shortcuts, hotkey, search shortcut, cmd shift f, ctrl shift f, new chat shortcut, toggle sidebar, escape, regenerate shortcut, disable shortcut, terminal shortcut, code shortcut
updated: 2026-10-22
scope: public
---

## The list

On macOS use Cmd where a table here says Ctrl, except in the Code table.

| Shortcut             | What it does            |
| -------------------- | ----------------------- |
| Shift+Ctrl+F         | Open search             |
| Ctrl+/               | Show keyboard shortcuts |
| Shift+Ctrl+O         | New conversation        |
| Ctrl+B               | Toggle sidebar          |
| Escape               | Focus message composer  |
| Shift+Ctrl+C         | Copy last message       |
| Shift+Ctrl+R         | Regenerate last message |
| Shift+Ctrl+A         | Toggle artifacts panel  |
| Shift+Ctrl+K         | Select model            |
| Shift+Ctrl+Y         | Toggle voice            |
| Shift+Ctrl+H         | Set custom instructions |
| Shift+Ctrl+X         | Copy last code block    |
| Shift+Ctrl+Backspace | Delete chat             |

## In the message composer

These work while you type a message.

| Shortcut         | What it does                                                           |
| ---------------- | ---------------------------------------------------------------------- |
| Enter            | Send message                                                           |
| Shift+Enter      | New line                                                               |
| Shift+Ctrl+Enter | While a reply runs, send this follow-up the other way (steer or queue) |
| Escape           | Stop the response                                                      |
| ↑                | Edit your last message (empty composer)                                |
| Shift+Ctrl+U     | Add photos & files                                                     |
| Shift+Ctrl+S     | Toggle dictation                                                       |

## In a local Code session

This one works in a local AGI Code session and uses the Control key on a Mac too.

| Shortcut | What it does              |
| -------- | ------------------------- |
| Ctrl+`   | Show or hide the terminal |

## Why new chat is Shift and not plain Ctrl+N

Ctrl+N and Cmd+N are reserved by the browser for a new window, so the page never
receives the keypress and nothing can be bound to it. Shift with O is what the
other assistants use for the same reason.

## Turning one off

The shortcuts dialog, opened with Ctrl+/, has a switch per shortcut. A shortcut
you switch off stops firing, it does not merely look disabled, so a binding that
clashes with something else in your setup can be released.
