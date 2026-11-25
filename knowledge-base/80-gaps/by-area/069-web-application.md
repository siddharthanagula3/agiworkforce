---
id: "GAPS-AREA-069"
type: "gap-list"
title: "Gaps: Web application"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 69. Web application

44 open gaps that touch this area. Area page: [20-features/069-web-application](../../20-features/069-web-application/README.md).

## GAP-AREA069-LW05

**Copy of a message has no failure handling. If the clipboard write is refused, the promise rejects and the person sees no message. The share fallback in the same file does handle failure.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-069
- Detail: Area 69. Web application
- Evidence: apps/web/features/chat/components/messages/MessageBubble.tsx:2273-2282 (compare the share fallback at 2284-2304)

## GAP-AREA069-LW06

**An expired shared conversation returns the global not-found page. The published-artifact page avoids the global not-found page for the same reason, because it misdescribes the cause to the recipient.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-069
- Detail: Area 69. Web application
- Evidence: apps/web/app/share/[token]/page.tsx:107-111 versus apps/web/app/shared-artifact/[token]/page.tsx:64-70 (comment and UnavailableArtifact)

## GAP-CAP-apps-and-install-14

**Web app access and installable web app: Ledger and code disagree on installability; no decision on offering a PWA.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F069-08](../../20-features/069-web-application/F069-08-browser-notifications.md), [F069-09](../../20-features/069-web-application/F069-09-install-and-offline.md), [F069-11](../../20-features/069-web-application/F069-11-browser-checks-and-support-message.md)
- Requirement items: S69.13, S69.14, S69.15, S69.19
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-F069-01-01

**No visible reason when Work is hidden.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F069-01](../../20-features/069-web-application/F069-01-chat-page-and-work-mode.md)
- Detail: Affects: Free, Basic and trial users on web. Work needed: Decide whether to show a locked toggle with an upgrade hint.
- Evidence: ChatComposerNew.tsx:6171 renders the toggle only when canUseAgiWork

## GAP-F069-01-02

**Failure paths of a failed send were not traced.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F069-01](../../20-features/069-web-application/F069-01-chat-page-and-work-mode.md)
- Detail: Affects: All web users. Work needed: Trace each error to its notice and write scenarios.
- Evidence: WebChatPage.tsx:6857-6862

## GAP-F069-01-03

**Status of Work on desktop, mobile, CLI, VS Code and Chrome is not in the brief.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F069-01](../../20-features/069-web-application/F069-01-chat-page-and-work-mode.md)
- Detail: Affects: Cross-app subscription parity. Work needed: Check each app against the shared Premium rule.
- Evidence: area brief S69.01 lists web only

## GAP-F069-02-01

**Two separate drawer implementations (shell and chat page) with different close and scroll behaviour.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F069-02](../../20-features/069-web-application/F069-02-responsive-layout.md)
- Detail: Affects: Web users on phones and tablets. Work needed: Share the drawer, or add the same scroll memory and close rule to the chat page.
- Evidence: WebAppShell.tsx:206-229 versus WebChatPage.tsx:7109-7131

## GAP-F069-02-02

**The draft named WebAppShell as the chat shell; the chat page does not use it.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F069-02](../../20-features/069-web-application/F069-02-responsive-layout.md)
- Detail: Affects: Anyone reading the old description. Work needed: Keep the corrected description.
- Evidence: WebChatPage.tsx:1153

## GAP-F069-03-01

**No live cross-tab message sync; the brief calls multi-tab not applicable but the code refreshes on focus.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F069-03](../../20-features/069-web-application/F069-03-links-history-refresh-and-other-tabs.md)
- Detail: Affects: Users with several tabs. Work needed: Choose and record the rule; add tests for the focus refresh.
- Evidence: WebChatPage.tsx:2329-2345

## GAP-F069-03-02

**The draft is per tab owner, so a fresh tab does not see the draft typed in another tab.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F069-03](../../20-features/069-web-application/F069-03-links-history-refresh-and-other-tabs.md)
- Detail: Affects: Users who open a link in a new tab. Work needed: Decide if that is wanted.
- Evidence: composer-draft-storage.ts:146-200 [inferred]

## GAP-F069-03-03

**Offline queue code exists with unclear link to chat sends.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F069-03](../../20-features/069-web-application/F069-03-links-history-refresh-and-other-tabs.md)
- Detail: Affects: Offline users. Work needed: Trace and either connect or remove.
- Evidence: apps/web/lib/offline/offlineSync.ts imported only by OfflineIndicator.tsx

## GAP-F069-04-01

**Copy has no failure handling.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F069-04](../../20-features/069-web-application/F069-04-drag-drop-paste-and-copy.md)
- Detail: Affects: Web users when the browser refuses clipboard write. Work needed: Add try and catch with an error toast and a test.
- Evidence: MessageBubble.tsx:2273-2276

## GAP-F069-04-02

**'Attach clipboard' is desktop-host only; no plain-browser equivalent.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F069-04](../../20-features/069-web-application/F069-04-drag-drop-paste-and-copy.md)
- Detail: Affects: Web users outside the desktop app. Work needed: Decide if a browser clipboard-read button is wanted.
- Evidence: ChatComposerNew.tsx:6018; runtime-client.ts:365

## GAP-F069-04-03

**Upload and storage path of dropped files not traced here.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F069-04](../../20-features/069-web-application/F069-04-drag-drop-paste-and-copy.md)
- Detail: Affects: Documentation. Work needed: Trace and add to the file storage page.
- Evidence: WebChatPage.tsx:7686-7688

## GAP-F069-05-01

**Camera sharing in voice mode is built but never rendered on the chat page.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F069-05](../../20-features/069-web-application/F069-05-microphone-camera-and-screen-access.md)
- Detail: Affects: Web users. Work needed: Pass a real frame sink or remove the control; add a test on the chat page.
- Evidence: VoiceModeSurface.tsx:155,524 versus WebChatPage.tsx:6841-6853

## GAP-F069-05-02

**Brief says screen sharing is not applicable, yet the feedback dialog captures the screen.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F069-05](../../20-features/069-web-application/F069-05-microphone-camera-and-screen-access.md)
- Detail: Affects: Documentation and product rules. Work needed: Record that only feedback capture exists.
- Evidence: ComposerFeedbackDialog.tsx:52-69

## GAP-F069-05-03

**Captured screen frame has no size check before submit.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F069-05](../../20-features/069-web-application/F069-05-microphone-camera-and-screen-access.md)
- Detail: Affects: Feedback senders on large screens. Work needed: Check size or scale the image first.
- Evidence: ComposerFeedbackDialog.tsx:52-69, 120-126; feedback/route.ts:33

## GAP-F069-05-04

**No on-device speech path on web; Local mode users depend on servers.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F069-05](../../20-features/069-web-application/F069-05-microphone-camera-and-screen-access.md)
- Detail: Affects: Local-mode expectations. Work needed: Decide whether the web needs a local speech path.
- Evidence: voice-input-store.ts:16 posts to our server

## GAP-F069-06-01

**No notice at /code time when the account switch is off.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F069-06](../../20-features/069-web-application/F069-06-cloud-code-execution.md)
- Detail: Affects: Web users who turned execution off. Work needed: Read the capability in the composer and say so before sending.
- Evidence: Only the model reply and routes explain it (tool-loop.ts:2829-2833)

## GAP-F069-06-02

**Sandbox network limits were read as a host list only, not tested.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F069-06](../../20-features/069-web-application/F069-06-cloud-code-execution.md)
- Detail: Affects: Security claims in Settings copy. Work needed: Run a live test from inside a sandbox.
- Evidence: runtime.ts:104-114

## GAP-F069-06-03

**No Local mode path for code execution on web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F069-06](../../20-features/069-web-application/F069-06-cloud-code-execution.md)
- Detail: Affects: Local and BYOK users. Work needed: Decide whether Local execution exists on Desktop and say so; not a web item.
- Evidence: runtime.ts:121-124

## GAP-F069-06-04

**Status on other apps not in the brief.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F069-06](../../20-features/069-web-application/F069-06-cloud-code-execution.md)
- Detail: Affects: Subscription parity. Work needed: Check each app against the same setting.
- Evidence: S69.10 lists web only

## GAP-F069-07-01

**No cloud browser feature.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F069-07](../../20-features/069-web-application/F069-07-cloud-browser-and-desktop-control.md)
- Detail: Affects: Web users; S69.11. Work needed: Decide scope, write spec, build a hosted browser with an execution boundary and plan gate.
- Evidence: No code found in apps/web; brief says missing

## GAP-F069-07-02

**Browser cannot show the computer's screen or approve steps.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F069-07](../../20-features/069-web-application/F069-07-cloud-browser-and-desktop-control.md)
- Detail: Affects: Web users; S69.12. Work needed: Add screen stream and approval controls, or narrow the requirement.
- Evidence: RemoteComputerPage.tsx has prompt, status, result only

## GAP-F069-07-03

**Brief says web missing and the matrix lists web via the Desktop settings section; both differ from the code, which has a task-dispatch page.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F069-07](../../20-features/069-web-application/F069-07-cloud-browser-and-desktop-control.md)
- Detail: Affects: Anyone planning from the docs. Work needed: Update the brief and matrix to say partial.
- Evidence: brief S69.12; docs/product/surface-feature-matrix.md:562-565

## GAP-F069-07-04

**Link component has no importer; entry is only the Code rail.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F069-07](../../20-features/069-web-application/F069-07-cloud-browser-and-desktop-control.md)
- Detail: Affects: Web users outside Code. Work needed: Mount it or delete it.
- Evidence: search for RemoteComputerLink

## GAP-F069-08-01

**Click does not open the run itself.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F069-08](../../20-features/069-web-application/F069-08-browser-notifications.md)
- Detail: Affects: Web users with agent run notices. Work needed: Teach /tasks to read the run parameter or carry a conversation id.
- Evidence: public/sw.js:31-44,45-62

## GAP-F069-08-02

**Migration 0151 says not applied; real state unknown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F069-08](../../20-features/069-web-application/F069-08-browser-notifications.md)
- Detail: Affects: Operations. Work needed: Check migration status and correct the header.
- Evidence: apps/web/db/neon/0151_web_push_subscriptions.sql:3

## GAP-F069-08-03

**Standalone WebPushToggle component is not mounted anywhere.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F069-08](../../20-features/069-web-application/F069-08-browser-notifications.md)
- Detail: Affects: Code hygiene. Work needed: Remove it or mount it.
- Evidence: search for WebPushToggle importers

## GAP-F069-08-04

**Chat reply and schedule results do not push to browsers.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F069-08](../../20-features/069-web-application/F069-08-browser-notifications.md)
- Detail: Affects: Web users. Work needed: Product decision.
- Evidence: chat-reply-notification-service.ts:42; schedule-notification-service.ts:184

## GAP-F069-09-01

**No offline read of loaded content.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F069-09](../../20-features/069-web-application/F069-09-install-and-offline.md)
- Detail: Affects: All web users. Work needed: Decide a cache design that does not break streaming, or change S69.15.
- Evidence: apps/web/public/sw.js:1-8

## GAP-F069-09-02

**/offline page unreachable.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F069-09](../../20-features/069-web-application/F069-09-install-and-offline.md)
- Detail: Affects: All web users. Work needed: Wire or remove.
- Evidence: no link or fallback; only an e2e spec lists it

## GAP-F069-09-03

**Offline queue has no producer.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F069-09](../../20-features/069-web-application/F069-09-install-and-offline.md)
- Detail: Affects: Chat users. Work needed: Connect chat or delete.
- Evidence: search for queueMessage importers

## GAP-F069-09-04

**Brief status n/a disagrees with the code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F069-09](../../20-features/069-web-application/F069-09-install-and-offline.md)
- Detail: Affects: Planning. Work needed: Update brief.
- Evidence: manifest.ts and OfflineIndicator exist

## GAP-F069-09-05

**No in-app install prompt.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F069-09](../../20-features/069-web-application/F069-09-install-and-offline.md)
- Detail: Affects: Users unaware of install. Work needed: Product decision.
- Evidence: no beforeinstallprompt hit

## GAP-F069-10-01

**Attachment files are not exported, only names.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F069-10](../../20-features/069-web-application/F069-10-export-and-download.md)
- Detail: Affects: Web users. Work needed: Decide scope; document it in the dialog.
- Evidence: conversation-export.ts:100-107

## GAP-F069-10-02

**Generic failure message.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F069-10](../../20-features/069-web-application/F069-10-export-and-download.md)
- Detail: Affects: Web users. Work needed: Show the cause.
- Evidence: dialog line 165

## GAP-F069-10-03

**Empty conversation export not handled.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F069-10](../../20-features/069-web-application/F069-10-export-and-download.md)
- Detail: Affects: Web users. Work needed: Disable or warn.
- Evidence: dialog lines 101-169

## GAP-F069-11-01

**No test found that runs the check script.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F069-11](../../20-features/069-web-application/F069-11-browser-checks-and-support-message.md)
- Detail: Affects: Old-browser users. Work needed: Add a unit test for the script.
- Evidence: search of tests for the notice id: only published-safety-claims imports the text

## GAP-F069-11-02

**Hint timeout not cleaned up.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F069-11](../../20-features/069-web-application/F069-11-browser-checks-and-support-message.md)
- Detail: Affects: Voice users. Work needed: Clear on unmount.
- Evidence: VoiceInputButton.tsx:51-52

## GAP-F069-11-03

**Microphone permission recovery text is part of S69.08, not covered here.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F069-11](../../20-features/069-web-application/F069-11-browser-checks-and-support-message.md)
- Detail: Affects: Voice users. Work needed: Covered by another feature page.
- Evidence: brief S69.08

## GAP-F069-12-01

**Workspace share link previews use a generic title.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F069-12](../../20-features/069-web-application/F069-12-public-share-and-preview-pages.md)
- Detail: Affects: Workspace recipients. Work needed: Decide if admitted previews need a title.
- Evidence: share/[token]/page.tsx:88-97

## GAP-F069-12-02

**No artifact expiry found on the page.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F069-12](../../20-features/069-web-application/F069-12-public-share-and-preview-pages.md)
- Detail: Affects: Publishers expecting expiry. Work needed: Confirm in the service whether an expiry exists.
- Evidence: shared-artifact/[token]/page.tsx reads only visibility

## GAP-F069-12-03

**Report flow was not traced end to end.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F069-12](../../20-features/069-web-application/F069-12-public-share-and-preview-pages.md)
- Detail: Affects: Moderation. Work needed: Document the report route.
- Evidence: ReportContentLink.tsx only builds a link
