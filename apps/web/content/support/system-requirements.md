---
id: system-requirements
title: System requirements and supported browsers
path: /get-started
category: getting-started
tags: system requirements, supported browsers, browser support, minimum requirements, chrome, edge, firefox, safari, javascript, phone browser, mobile browser, tablet, offline, install, operating system, voice, notifications
updated: 2026-10-08
scope: public
---

## What you need

AGI runs in a web browser. You need a current version of Chrome, Edge, Firefox
or Safari, with JavaScript turned on, and an internet connection. The web app
has nothing to install.

## Supported browsers

AGI names four browsers: Chrome, Edge, Firefox and Safari, each in a current
version. We publish no minimum version number, because the page checks features
and not versions. When a page loads, it looks for a small set of modern
JavaScript features. A browser that lacks one shows this notice at the top of
the page: "This browser is too old to run AGI. Open it in a current version of
Chrome, Edge, Firefox or Safari."

A browser with JavaScript turned off shows a notice that asks you to turn it on.

Other browsers built on the same engines may work. We neither name them nor
test them.

## What we test

Our automated browser tests run in Chromium, the engine inside Chrome and Edge.
Firefox and Safari are outside that automated suite, so a fault that shows up
in one of them alone reaches us through your report. The layout checks run at
screen widths from 320 to 1440 pixels, which covers a small phone through a
desktop window.

## Phones and tablets

To use AGI on a phone or tablet, open
[AGI Web](https://agiworkforce.com/chat) in the browser. The
[Mobile page](https://agiworkforce.com/mobile) shows whether an app has been
released.

## Features that ask more of the browser

- **Voice input.** A browser that cannot do it shows "Voice input is not
  supported in this browser. Try Chrome or Edge." on the microphone button.
- **Voice mode.** It needs a microphone and your permission to use it.
- **Notifications.** They need a browser with web push, and your permission.

## Offline

The web app needs a connection to load a page and to send a message. Its
service worker handles notifications and caches nothing, so there is no offline
mode.

## Desktop, CLI and extensions

The [download page](https://agiworkforce.com/download) shows which clients have
a release. A client with no release has no installer, so we publish no operating
system, memory or disk requirements for it. Each client's requirements belong on
its own page once there is something to install.
