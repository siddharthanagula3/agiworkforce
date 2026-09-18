---
id: chrome-extension
title: The Chrome extension
path: /chrome-extension
category: surfaces
tags: chrome, browser extension, browser companion, side panel, capture page, screenshot, tabs, browser automation, computer use
platforms: chrome
updated: 2026-09-17
scope: public
---

## Availability

The Chrome extension, AGI Browser Companion, is not published yet. The Chrome
page carries its status and a notify list; there is no Web Store listing to
install from today.

## What it is being built to do

It opens AGI in a browser side panel next to the page you are reading, with a
keyboard command to open the panel and another to capture the current page into
the conversation. Its host permissions are limited to agiworkforce.com, the AGI
API and localhost, so it talks to AGI and to nothing else by default.

## Browser automation

The composer's `/browser` command exists only on surfaces whose capabilities
allow browser automation, which is what the extension provides. Anything that
drives a page is a write action under the approval rules: on the default
setting it asks before every action, and even on the read-only-auto setting it
still asks, because driving a browser is not a read.

## Managed cloud from the extension

Managed cloud access from the Chrome extension is part of the higher paid tiers.
The extension does not accept provider keys: web, mobile, desktop and Chrome all
run on your AGI account, while BYOK is a CLI and VS Code capability.

## Until it ships

The web app runs in the same browser and covers everything except the
page-capture and side-panel workflow.
