---
id: keyboard-shortcuts
title: Keyboard shortcuts
path: /chat
category: chat
tags: keyboard, shortcut, shortcuts, hotkey, cmd k, ctrl k, new chat shortcut, toggle sidebar, escape, regenerate shortcut, disable shortcut
updated: 2026-09-17
scope: public
---

## The list

On macOS use Cmd where this says Ctrl.

| Shortcut     | What it does            |
| ------------ | ----------------------- |
| Ctrl+K       | Open search             |
| Ctrl+/       | Show keyboard shortcuts |
| Shift+Ctrl+O | New conversation        |
| Ctrl+B       | Toggle sidebar          |
| Escape       | Focus message composer  |
| Shift+Ctrl+C | Copy last message       |
| Shift+Ctrl+R | Regenerate last message |
| Shift+Ctrl+A | Toggle artifacts panel  |

## Why new chat is Shift and not plain Ctrl+N

Ctrl+N and Cmd+N are reserved by the browser for a new window, so the page never
receives the keypress and nothing can be bound to it. Shift with O is what the
other assistants use for the same reason.

## Turning one off

The shortcuts dialog, opened with Ctrl+/, has a switch per shortcut. A shortcut
you switch off stops firing, it does not merely look disabled, so a binding that
clashes with something else in your setup can be released.
