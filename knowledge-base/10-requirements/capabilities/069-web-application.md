---
id: "REQ-AREA-069"
type: "requirements"
title: "Requirement items: Web application"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 69. Web application

20 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S69.01

**Browser-based chat and work.** Signed-in user opens the web app in a browser, chats, and switches the composer to AGI Work for multi-step tool runs.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done
- Feature: [F069-01 Chat page and Work mode](../../20-features/069-web-application/F069-01-chat-page-and-work-mode.md)

## S69.02

**Responsive desktop/tablet/mobile layouts.** The web shell adapts to phone, tablet and desktop widths: drawer navigation below 768px, icon rail on portrait tablets, persistent sidebar on wide windows.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done
- Seen in a real run: Web PARTIAL
- Feature: [F069-02 Responsive layout](../../20-features/069-web-application/F069-02-responsive-layout.md)

## S69.03

**URL-addressable conversations and resources.** Each conversation has its own URL (/chat/<id>), a new chat gets that URL after the first send, and opening the URL loads that conversation.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done
- Feature: [F069-03 Links, history, refresh and other tabs](../../20-features/069-web-application/F069-03-links-history-refresh-and-other-tabs.md)

## S69.04

**Browser history integration.** Opening conversations pushes browser history, and Back/Forward reloads the conversation the URL names.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done
- Feature: [F069-03 Links, history, refresh and other tabs](../../20-features/069-web-application/F069-03-links-history-refresh-and-other-tabs.md)

## S69.05

**Browser refresh restoration.** Reloading the page restores the open conversation from its URL and the unsent composer draft.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done
- Seen in a real run: Web PASS
- Feature: [F069-03 Links, history, refresh and other tabs](../../20-features/069-web-application/F069-03-links-history-refresh-and-other-tabs.md)

## S69.06

**Drag-and-drop uploads.** Dragging files onto the chat page shows a drop overlay and attaches the dropped files to the composer.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done
- Feature: [F069-04 Drag, drop, paste and copy](../../20-features/069-web-application/F069-04-drag-drop-paste-and-copy.md)

## S69.07

**Clipboard integration.** Pasting text, code or files into the composer is handled, and a message can be copied to the system clipboard.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done
- Seen in a real run: Web PASS
- Feature: [F069-04 Drag, drop, paste and copy](../../20-features/069-web-application/F069-04-drag-drop-paste-and-copy.md)

## S69.08

**Camera and microphone permissions.** The web app asks the browser for microphone and camera access when a feature needs them, explains a refusal, and recovers once access is granted.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done
- Feature: [F069-05 Microphone, camera and screen access](../../20-features/069-web-application/F069-05-microphone-camera-and-screen-access.md)

## S69.09

**Screen/tab sharing.** A user can share a screen, window or tab with the assistant from the browser (capture a screenshot or stream it into chat or voice).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F069-05 Microphone, camera and screen access](../../20-features/069-web-application/F069-05-microphone-camera-and-screen-access.md)

## S69.10

**Cloud code execution.** From the browser a user turns on cloud code execution (/code or a skill) and the server runs code in a provider sandbox or E2B, with a Settings switch to refuse it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done
- Feature: [F069-06 Cloud code execution](../../20-features/069-web-application/F069-06-cloud-code-execution.md)

## S69.11

**Cloud browser execution.** The assistant can drive a browser that runs in the cloud (navigate, click, read pages) for a web user, without a local desktop or extension.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing
- Feature: [F069-07 Cloud browser and desktop control](../../20-features/069-web-application/F069-07-cloud-browser-and-desktop-control.md)

## S69.12

**Remote desktop-host control.** From a normal browser tab a user can control their own paired desktop host (send it work, approve steps, see its screen).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing
- Feature: [F069-07 Cloud browser and desktop control](../../20-features/069-web-application/F069-07-cloud-browser-and-desktop-control.md)

## S69.13

**Web notifications where supported.** A user turns on browser notifications in Settings and gets a system notification when an agent run or long task finishes, even with the tab closed.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done
- Feature: [F069-08 Browser notifications](../../20-features/069-web-application/F069-08-browser-notifications.md)
- Competitor trace: CAP-apps-and-install-14

## S69.14

**Installable web application where offered.** The site can be installed as a standalone web app whose launch opens the working product.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F069-09 Install and offline](../../20-features/069-web-application/F069-09-install-and-offline.md)
- Competitor trace: CAP-apps-and-install-14

## S69.15

**Offline/read-only fallback.** When the connection drops the app says so and previously loaded content stays readable, with an offline page for navigations.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F069-09 Install and offline](../../20-features/069-web-application/F069-09-install-and-offline.md)
- Competitor trace: CAP-apps-and-install-14

## S69.16

**Multi-tab coordination.** Several open tabs stay consistent: a chat created, renamed or answered in one tab appears in the others, and shared state does not clobber across tabs.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F069-03 Links, history, refresh and other tabs](../../20-features/069-web-application/F069-03-links-history-refresh-and-other-tabs.md)

## S69.17

**Downloads and export.** A user exports a conversation from the chat header and the browser downloads it as Markdown, PDF, DOCX, HTML or JSON; files and artifacts download too.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done
- Seen in a real run: Web PASS
- Feature: [F069-10 Export and download](../../20-features/069-web-application/F069-10-export-and-download.md)

## S69.18

**Browser capability detection.** Before using a browser API the app checks the browser supports it and disables or explains the feature instead of failing.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done
- Feature: [F069-11 Browser checks and support message](../../20-features/069-web-application/F069-11-browser-checks-and-support-message.md)

## S69.19

**Unsupported-browser explanation.** A browser that cannot run the app gets a clear explanation (unsupported browser page or banner) with what to use instead.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done
- Feature: [F069-11 Browser checks and support message](../../20-features/069-web-application/F069-11-browser-checks-and-support-message.md)
- Competitor trace: CAP-apps-and-install-14

## S69.20

**Public share and preview experiences.** A shared conversation or published artifact opens at a public URL for signed-out visitors, with a link preview title, expiry handling and a report link.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done
- Feature: [F069-12 Public share and preview pages](../../20-features/069-web-application/F069-12-public-share-and-preview-pages.md)
