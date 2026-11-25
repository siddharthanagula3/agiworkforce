---
id: "REQ-AREA-074"
type: "requirements"
title: "Requirement items: Browser extension"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 74. Browser extension

28 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S74.01

**Toolbar action.** Clicking the extension's toolbar button (or its shortcut) opens the assistant.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Chrome done
- Feature: [F074-01 Open the assistant](../../20-features/074-browser-extension/F074-01-open-the-assistant.md)

## S74.02

**Popup interface.** A small popup opens from the toolbar button for quick actions.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Chrome missing
- Feature: [F074-01 Open the assistant](../../20-features/074-browser-extension/F074-01-open-the-assistant.md)

## S74.03

**Side panel.** A side panel hosts the assistant beside the page.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Chrome done
- Feature: [F074-01 Open the assistant](../../20-features/074-browser-extension/F074-01-open-the-assistant.md)

## S74.04

**Selection context menu.** Right-clicking selected text offers assistant actions.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Chrome done
- Feature: [F074-02 Ask about selected text and right-click actions](../../20-features/074-browser-extension/F074-02-ask-about-selected-text-and-right-click-actions.md)

## S74.05

**Ask about selected text.** The user asks about the text they selected and gets an answer in the extension.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Chrome done
- Feature: [F074-02 Ask about selected text and right-click actions](../../20-features/074-browser-extension/F074-02-ask-about-selected-text-and-right-click-actions.md)

## S74.06

**Ask about current page.** The user asks a question about the current page from the extension.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Chrome done
- Feature: [F074-03 Ask about the page, summaries and videos](../../20-features/074-browser-extension/F074-03-ask-about-the-page-summaries-and-videos.md)

## S74.07

**Summarize current page.** One action summarizes the current page.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Chrome done
- Feature: [F074-03 Ask about the page, summaries and videos](../../20-features/074-browser-extension/F074-03-ask-about-the-page-summaries-and-videos.md)

## S74.08

**Ask about a video.** The user asks about a video on the page and the answer uses its content.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Chrome done
- Feature: [F074-03 Ask about the page, summaries and videos](../../20-features/074-browser-extension/F074-03-ask-about-the-page-summaries-and-videos.md)

## S74.09

**Tab context picker.** The user picks which open tabs to add as context.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Chrome missing
- Feature: [F074-04 Attach tabs and page chips](../../20-features/074-browser-extension/F074-04-attach-tabs-and-page-chips.md)

## S74.10

**Multi-tab comparison.** The extension compares content across several tabs.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Chrome missing
- Feature: [F074-04 Attach tabs and page chips](../../20-features/074-browser-extension/F074-04-attach-tabs-and-page-chips.md)

## S74.11

**Multiple side conversations.** The user keeps several separate conversations in the extension and switches between them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Chrome done
- Feature: [F074-05 Conversations](../../20-features/074-browser-extension/F074-05-conversations.md)

## S74.12

**Page-context chips.** Attached page context shows as a visible chip the user can see and remove.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Chrome done
- Feature: [F074-04 Attach tabs and page chips](../../20-features/074-browser-extension/F074-04-attach-tabs-and-page-chips.md)

## S74.13

**Explicit site-access request.** Before reading a site, the extension asks Chrome for that site's access explicitly.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Chrome done
- Feature: [F074-06 Site access and site permissions](../../20-features/074-browser-extension/F074-06-site-access-and-site-permissions.md)

## S74.14

**Per-site permission settings.** The user reviews and changes which sites the extension may use and how.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Chrome done
- Feature: [F074-06 Site access and site permissions](../../20-features/074-browser-extension/F074-06-site-access-and-site-permissions.md)

## S74.15

**Agent action indicator.** While the agent acts, the extension clearly shows it is acting.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Chrome done
- Feature: [F074-07 Browser control (the assistant acts on a page)](../../20-features/074-browser-extension/F074-07-browser-control-the-assistant-acts-on-a-page.md)

## S74.16

**Browser-control mode.** The user switches the extension into a mode where it controls the browser for a goal they give.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Chrome done
- Feature: [F074-07 Browser control (the assistant acts on a page)](../../20-features/074-browser-extension/F074-07-browser-control-the-assistant-acts-on-a-page.md)

## S74.17

**Stop/takeover control.** A visible control stops the agent or lets the user take over.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Chrome done
- Feature: [F074-07 Browser control (the assistant acts on a page)](../../20-features/074-browser-extension/F074-07-browser-control-the-assistant-acts-on-a-page.md)

## S74.18

**Desktop-app pairing.** The extension pairs with the desktop app.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done, Chrome done
- Feature: [F074-08 Desktop app pairing and connection status](../../20-features/074-browser-extension/F074-08-desktop-app-pairing-and-connection-status.md)

## S74.19

**Native-host connection status.** The extension shows whether its desktop native host is connected and lets the user reconnect.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done, CLI done, Chrome done
- Feature: [F074-08 Desktop app pairing and connection status](../../20-features/074-browser-extension/F074-08-desktop-app-pairing-and-connection-status.md)

## S74.20

**Account/workspace switching.** The user switches account or workspace inside the extension.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F074-11 Limits, recovery, updates and accounts](../../20-features/074-browser-extension/F074-11-limits-recovery-updates-and-accounts.md)

## S74.21

**Voice entry where supported.** The user dictates a message by voice where the browser supports it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Chrome done
- Feature: [F074-09 Voice dictation](../../20-features/074-browser-extension/F074-09-voice-dictation.md)

## S74.22

**Page-to-Project saving.** The user saves the current page into a Project.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Chrome missing
- Feature: [F074-10 Save a page to a Project or Library](../../20-features/074-browser-extension/F074-10-save-a-page-to-a-project-or-library.md)

## S74.23

**Page-to-Library saving.** The user saves the current page into their Library.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Chrome missing
- Feature: [F074-10 Save a page to a Project or Library](../../20-features/074-browser-extension/F074-10-save-a-page-to-a-project-or-library.md)

## S74.24

**Extension update notice.** After an update the extension tells the user what changed.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Chrome missing
- Feature: [F074-11 Limits, recovery, updates and accounts](../../20-features/074-browser-extension/F074-11-limits-recovery-updates-and-accounts.md)
- Competitor trace: CAP-apps-and-install-13

## S74.25

**Unsupported-page explanation.** On pages the extension cannot use it says why.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Chrome done
- Feature: [F074-11 Limits, recovery, updates and accounts](../../20-features/074-browser-extension/F074-11-limits-recovery-updates-and-accounts.md)

## S74.26

**Private/incognito controls.** The extension has clear controls or messaging for private/incognito windows.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Chrome missing
- Feature: [F074-11 Limits, recovery, updates and accounts](../../20-features/074-browser-extension/F074-11-limits-recovery-updates-and-accounts.md)
- An owner decision is open on this item.

## S74.27

**Browser-specific feature differences.** The extension explains which features differ between supported browsers.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Chrome missing
- Feature: [F074-11 Limits, recovery, updates and accounts](../../20-features/074-browser-extension/F074-11-limits-recovery-updates-and-accounts.md)
- Competitor trace: CAP-apps-and-install-13

## S74.28

**Recovery after background-worker suspension.** After Chrome suspends the background worker, chats and agent runs recover or report clearly.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Chrome done
- Feature: [F074-11 Limits, recovery, updates and accounts](../../20-features/074-browser-extension/F074-11-limits-recovery-updates-and-accounts.md)
