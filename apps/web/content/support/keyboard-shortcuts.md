---
id: keyboard-shortcuts
title: Keyboard shortcuts
path: /chat
category: chat
tags: keyboard, shortcut, shortcuts, hotkey, search shortcut, cmd shift f, ctrl shift f, new chat shortcut, toggle sidebar, escape, regenerate shortcut, disable shortcut
updated: 2026-10-15
scope: public
---

## The list

On macOS use Cmd where this says Ctrl. The last five work in the message composer.

| Shortcut         | What it does                                                           |
| ---------------- | ---------------------------------------------------------------------- |
| Shift+Ctrl+F     | Open search                                                            |
| Ctrl+/           | Show keyboard shortcuts                                                |
| Shift+Ctrl+O     | New conversation                                                       |
| Ctrl+B           | Toggle sidebar                                                         |
| Escape           | Focus message composer                                                 |
| Shift+Ctrl+C     | Copy last message                                                      |
| Shift+Ctrl+R     | Regenerate last message                                                |
| Shift+Ctrl+A     | Toggle artifacts panel                                                 |
| Enter            | Send message                                                           |
| Shift+Enter      | New line                                                               |
| Shift+Ctrl+Enter | While a reply runs, send this follow-up the other way (steer or queue) |
| Escape           | Stop the response                                                      |
| ↑                | Edit your last message (empty composer)                                |

## Why new chat is Shift and not plain Ctrl+N

Ctrl+N and Cmd+N are reserved by the browser for a new window, so the page never
receives the keypress and nothing can be bound to it. Shift with O is what the
other assistants use for the same reason.

## Turning one off

The shortcuts dialog, opened with Ctrl+/, has a switch per shortcut. A shortcut
you switch off stops firing, it does not merely look disabled, so a binding that
clashes with something else in your setup can be released.
