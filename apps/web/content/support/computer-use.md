---
id: computer-use
title: Computer use in AGI Desktop
path: /download
category: surfaces
tags: computer use, control my computer, mouse, keyboard, screen, allowed apps, refused apps, add app, stop, take over, accessibility, screen recording
platforms: desktop, macos
updated: 2026-10-22
description: What computer use does in AGI Desktop, how to turn it on and how to stop or pause a run.
scope: public
---

## What computer use does

With computer use, AGI can look at your screen and use the mouse and keyboard
in apps on your computer to carry out a task you ask for in a chat.

Controlling the mouse and keyboard is supported on macOS only.

## Turning it on

Computer use is off by default. Turn it on in Settings, under Desktop app,
Computer use, with the **Any app** switch.

macOS must also allow AGI Desktop under Accessibility and Screen Recording in
System Settings. Once computer use is on, the Computer use page shows whether
each one is allowed.

## The questions AGI Desktop asks

The first time AGI reaches for your screen, AGI Desktop asks whether to allow
it. Your answer lasts until you quit the app.

AGI then asks before it controls each app, with **Deny**, **Allow this
session** and **Never allow**. For a terminal, a code editor, Finder or System
Settings, the question also says how much that app can reach.

AGI does not control the AGI Desktop window itself.

## Allowed and refused apps

The Computer use page lists the apps you allowed and the apps you refused.
**Remove** takes an allowed app off the list, so AGI asks about it again next
time.

**Add app** refuses an installed app before AGI ever asks about it.

An app you add stays refused, even after you quit the app, until you choose
**Ask again**, which AGI Desktop confirms before clearing the refusal.

## Stopping or pausing a run

While AGI is using your computer, press Escape or choose **Stop** on the
Computer use page to stop it.

Stopping ends the run and withdraws the permission, so AGI asks again the next
time it needs your screen.

Moving the pointer or typing pauses the run, and **Take over** on the
Computer use page does the same. **Hand back** lets AGI carry on.
