---
id: "PLAN-chrome-032"
type: "test-plan"
title: "Chrome · 32. Design workspace"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "32"
---
# Chrome · 32. Design workspace

6 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S32.06 Direct text editing.

- **Expected:** The user can edit the text of a design element directly on the design.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. The plan's Code line names no file, and the Chrome extension has no design-element editing. I searched apps/extension for contenteditable, inline edit, design canvas, design workspace and design mode and found nothing relevant. The only design hits are design-token imports and colour styling.
- **Needs:** live-web

## S32.26 Prototype navigation.

- **Expected:** A prototype can be clicked through: interactions navigate between screens.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. The plan's Code line names no file, and apps/extension has no prototype feature. I searched for prototype, interaction, navigate-between-screens and screen terms. The only 'prototype' hits are JavaScript prototype accesses in content.ts and jobAutofill.runtime.js.
- **Needs:** live-web

## S32.27 Interactive-state previews.

- **Expected:** The user can preview interactive states (hover, pressed, disabled, empty) of the design.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. The plan's Code line names no file, and apps/extension has no interactive-state preview for a design. The hover, pressed, disabled and empty matches are CSS states on the options page and side panel, and a hover action in content.ts that is a browser automation step, not a design preview.
- **Needs:** live-web

## S32.31 Export to HTML.

- **Expected:** The user can export the design as a standalone HTML file.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. The plan's Code line names no file, and apps/extension has no export-to-HTML feature. I searched for export html, download html and standalone export terms and found none.
- **Needs:** live-web

## S32.33 Export to image or archive.

- **Expected:** The user can export the design as an image file or as a downloadable archive.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. The plan's Code line names no file, and apps/extension has no design export to image or archive. I searched for export, archive, image download and zip terms. The only hits are icon helpers in assets/icons.ts and the package verification script, which is a build step, not a user feature.
- **Needs:** live-web

## S32.34 Version comparison and restoration.

- **Expected:** The user can compare two versions of a design and restore an earlier one.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. The plan's Code line names no file, and apps/extension has no design version comparison or restore feature. I searched for version history, restore version and compare terms. The only 'compare' hit is a chat-intent regex in chat-state.ts, and the only 'version' hits are the extension's own version metadata.
- **Needs:** live-web
