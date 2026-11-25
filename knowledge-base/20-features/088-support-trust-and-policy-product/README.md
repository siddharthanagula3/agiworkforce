---
id: "AREA-088"
type: "area"
title: "Support, trust, and policy product"
features: ["F088-01", "F088-02", "F088-03", "F088-04", "F088-05", "F088-06", "F088-07", "F088-08", "F088-09", "F088-10", "F088-11"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 88. Support, trust, and policy product

This area gives a person a way to get help and to be heard. It covers the help centre, contacting support, sending bug reports and feedback, and getting a reference id when something fails. It also shows service status and notices, and it lets people report content or appeal a block. Public pages such as privacy, cookies, security, subprocessors and the trust page make the company's promises easy to check.

**Who uses it.** Every visitor uses the public pages: help, status, privacy, cookies, security, subprocessors, terms archive and copyright form. Signed-in users use tickets, feedback, diagnostics and content reports. A suspended user uses the appeal form, signed in or signed out. Support staff read and answer tickets through staff routes in apps/web/lib/support/tickets/service.ts. Paid plans change only the support priority, read from the organisation's billing contract (apps/web/lib/support/handoff/priority.ts:72). The code I read has no other plan gate on these features.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F088-01](F088-01-help-centre-and-help-links.md) | Help centre and help links | built | built | partly | no | built | partly |
| [F088-02](F088-02-contact-support-and-support-tickets.md) | Contact support and support tickets | built | built | built | no | n/a | no |
| [F088-03](F088-03-bug-reports-and-diagnostic-bundle.md) | Bug reports and diagnostic bundle | built | built | built | built | built | partly |
| [F088-04](F088-04-product-feedback-and-feature-requests.md) | Product feedback and feature requests | built | built | built | built | built | no |
| [F088-05](F088-05-reference-ids-for-failed-requests.md) | Reference ids for failed requests | built | built | built | built | built | built |
| [F088-06](F088-06-service-status-incidents-and-maintenance-notices.md) | Service status, incidents and maintenance notices | partly | partly | partly | no | partly | no |
| [F088-07](F088-07-release-and-model-retirement-notices-and-migration.md) | Release and model-retirement notices, and migration help | built | built | partly | built | no | no |
| [F088-08](F088-08-privacy-requests-cookie-choices-and-jurisdiction-n.md) | Privacy requests, cookie choices and jurisdiction notices | built | built | built | no | n/a | n/a |
| [F088-09](F088-09-reports-and-appeals-content-copyright-safety-refus.md) | Reports and appeals (content, copyright, safety refusal, suspension) | built | built | partly | no | no | no |
| [F088-10](F088-10-security-accessibility-and-policy-pages.md) | Security, accessibility and policy pages | partly | partly | no | no | no | no |
| [F088-11](F088-11-support-assistant-answers-email-and-whatsapp-langu.md) | Support assistant (answers, email and WhatsApp, languages, analytics) | partly | n/a | n/a | n/a | n/a | n/a |

Requirement items for this area: [10-requirements/capabilities/088-support-trust-and-policy-product.md](../../10-requirements/capabilities/088-support-trust-and-policy-product.md).

## How this area works in the code

1. **The person opens a support or help screen.** The help page renders the search box. The Help section in settings shows the support tickets panel, the status link and the release notes link. (`apps/web/app/help/page.tsx:55`, `apps/web/features/support/components/HelpSearch.tsx:27`, `apps/web/features/settings/sections/HelpSection.tsx:77`)
2. **Search for help.** The search box calls the help search API. The API is rate limited and returns matching articles and whether the index is available. (`apps/web/features/support/components/HelpSearch.tsx:34`, `apps/web/app/api/help/search/route.ts:47`)
3. **Review and build diagnostics.** The panel asks the server to prepare a diagnostic bundle. The browser collects platform, locale, time zone and release details, and the server checks and redacts them. (`apps/web/features/support/lib/ticket-client.ts:102`, `apps/web/lib/support/diagnostics/collect.ts:51`)
4. **Open a ticket.** The ticket route checks the user, the anti-forgery token and the rate limit, then validates the body. It asks for a reply email and re-checks the diagnostics before saving. (`apps/web/app/api/support/tickets/route.ts:45`, `apps/web/app/api/support/tickets/route.ts:71`)
5. **Save the ticket and notify the team.** The service looks up the support tier from the organisation contract, clamps the subject and message length, inserts the row and tells the team. (`apps/web/lib/support/tickets/service.ts:158`, `apps/web/lib/support/handoff/priority.ts:72`, `apps/web/lib/support/tickets/store.ts:89`)
6. **Send feedback from a chat message.** The feedback dialog sends the type, text and context. The feedback route checks the fields for each type (rating, task, safety refusal) and inserts a row. (`apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:73`, `apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:183`, `apps/web/app/api/feedback/route.ts:37`)
7. **Show service notices.** The app mounts the product notice stack. The notice component fetches the notice list every 5 minutes and filters out dismissed notices. (`apps/web/app/AppRuntimeMounts.tsx:15`, `apps/web/shared/components/ProductNotices.tsx:8`, `apps/web/shared/components/ServiceNotices.tsx:95`, `apps/web/app/api/status/notices/route.ts`)
8. **Decide which notices apply on the server.** The server reads a health check with a 3 second limit. It turns blocked services into incident notices, and it reads the maintenance window from configuration. (`apps/web/lib/server/service-notices.ts:181`, `apps/web/lib/server/service-notices.ts:157`, `apps/web/lib/server/service-notices.ts:212`, `apps/web/lib/server/service-notices.ts:234`)
9. **Show a reference id on failure.** The server error handler carries a request id with each error. The chat turn notice shows it as 'Reference' only when the turn failed. (`apps/web/lib/error-handler.ts:91`, `apps/web/features/chat/lib/turn-error-notice.ts:170`)
10. **Report content, copyright or appeal a block.** Content reports are saved to the content report table. Copyright notices are saved and do not remove content. Appeals are saved as support tickets; signed-out appeals need a human check first. (`apps/web/app/api/mobile/content-report/route.ts:95`, `apps/web/lib/server/copyright-notices.ts:85`, `apps/web/lib/support/tickets/appeals.ts:69`, `apps/web/lib/support/tickets/appeals.ts:78`)

## Files to know

| File | Role |
|---|---|
| `apps/web/features/support/components/SupportTicketsPanel.tsx` | The support tickets panel: diagnostics review and download, ticket list, and the form to open a ticket. |
| `apps/web/app/api/support/tickets/route.ts` | Server route to list tickets and open a ticket, with rate limits, a reply-email check and diagnostics re-checking. |
| `apps/web/lib/support/tickets/service.ts` | Ticket rules: priority from the organisation contract, clamping, insert, team notice, staff replies. |
| `apps/web/lib/server/service-notices.ts` | Decides which incident and maintenance notices apply, with the 3 second health read and the maintenance window. |
| `apps/web/shared/components/ServiceNotices.tsx` | Client component that polls the notice list every 5 minutes and shows dismissible banners. |
| `apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx` | Feedback, feature request and safety-refusal dialog used from chat messages. |
| `apps/web/app/api/feedback/route.ts` | Stores feedback and reports in the feedback table with per-type field checks. |
| `apps/web/lib/support/agent/index.ts` | The support assistant module: answers, citations and abstentions, used by the ask route. |
| `apps/web/lib/support/diagnostics/collect.ts` | Collects browser-side diagnostic facts for a bug report. |
| `apps/mobile/src/features/support/service.ts` | Mobile client calls for support tickets (the brief's cited file; read for the ticket flow only). |
| `apps/cli/src/diagnostics_bundle.rs` | CLI export of the diagnostic bundle to the cloud diagnostics route. |
| `packages/contracts/cloud-contracts/src/service-notices.ts` | Shared schema and path for the service notice list (SERVICE_NOTICES_PATH, ServiceNoticeListSchema). |

## What is stored

- Support tickets, replies and escalations: Postgres tables public.support_tickets, public.support_ticket_replies and public.support_ticket_escalations (apps/web/lib/support/tickets/store.ts:89, 216, 287)
- Feedback, feature requests, safety refusal reports and task feedback: Postgres table public.feedback (apps/web/app/api/feedback/route.ts:37)
- Content reports: Postgres table public.content_reports (apps/web/app/api/mobile/content-report/route.ts:95)
- Copyright and impersonation notices: Postgres table public.copyright_notices (apps/web/lib/server/copyright-notices.ts:85)
- Diagnostic bundle sent with a ticket: Stored with the ticket row as diagnostics (apps/web/lib/support/tickets/service.ts:158 onward)
- Cookie consent choice: Browser localStorage key 'cookie-consent' (apps/web/shared/lib/cookie-consent.ts:9)
- Dismissed service notices: Browser sessionStorage key 'agi-dismissed-service-notices' (apps/web/shared/components/ServiceNotices.tsx:13); cleared when the browser session ends
- Incident recovery tracking: Key prefix 'agi-service-notice:last-failing' in service-notices.ts:2 (storage backend not traced)

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **NEXT_PUBLIC_SUPPORT_WIDGET_ENABLED**: Kill switch for the support widget. Any value of 0, false, off or no turns it off; unset means on. (apps/web/features/support/lib/widget-flag.ts:4)
- **SUPPORT_AGENT_ENABLED**: Turns the support assistant answers on or off (on when unset). (apps/web/lib/support/agent/answer/model-route.ts:73)
- **AGI_MAINTENANCE_WINDOW**: Sets the planned maintenance window that shows as a product notice before and during the window. (apps/web/lib/server/service-notices.ts:212)
- **organization_billing_contracts.support_tier**: Sets the support priority for tickets from members of that organisation. (apps/web/lib/support/handoff/priority.ts:72)
- **ANALYTICS_REQUIRES_CONSENT**: When true, analytics runs only after cookie consent. (apps/web/shared/lib/cookie-consent.ts:7)
- **Rate limit keys support-tickets-read, support-tickets-write, help-search**: Limit how often each route can be called per user or per request. (apps/web/app/api/support/tickets/route.ts:28, 51; apps/web/app/api/help/search/route.ts:47)
- **DEPRECATION_WARNING_WINDOW_DAYS**: Starts the model retirement warning 30 days before the scheduled date. (apps/web/features/chat/components/Composer/ComposerFooter.tsx:320)
- **HEALTH_READ_TIMEOUT_MS**: A health read slower than 3 seconds counts as no answer, so no incident notice shows. (apps/web/lib/server/service-notices.ts:18)

## Shared between apps

Shared: the server routes and rules under apps/web/lib/support (tickets, diagnostics, agent, appeals), the shared notice schema in packages/contracts/cloud-contracts/src/service-notices.ts, and the shared support contract '@agiworkforce/cloud-contracts/support'. Mobile and the CLI call the same server endpoints for tickets, feedback and diagnostics. Web and mobile both have a content report route (the web one is an alias of the mobile one). Separate per app: web React components (features/support, shared/components), desktop Electron menu (apps/desktop/electron/appMenu.ts), mobile Expo screens (apps/mobile/src/features/support, feedback, settings), the CLI Rust code (apps/cli/src/cloud/feedback.rs, diagnostics_bundle.rs, errors.rs), and the VS Code error presentation (apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts).

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- The feedback dialog is opened only from chat message components. No product-wide place was found, which matches the brief's 'mount' unfinished flag for web and desktop. (apps/web/features/chat/components/messages/ChatMessageList.tsx:1973; apps/web/features/chat/components/messages/MessageBubble.tsx:3826)
- Known-issue display (S88.09) has no code in any app. A search for 'known issue' across web, desktop, mobile, CLI, VS Code and Chrome found nothing. (apps/web (no file found))
- Incident notices use one fixed sentence per scope. They do not describe the specific problem or its current status, as the brief's Should requires. (apps/web/lib/server/service-notices.ts:92)
- The brief marks the support assistant's email, WhatsApp, language, analytics and content-gap items (S88.28-31) as missing. The assistant itself exists on web. No inbound email or WhatsApp route was found, and no analytics or content-gap logging was found in the support code. (apps/web/app/api/support/ask/route.ts; apps/web/lib/support/agent/index.ts)
- A notice response that fails the schema check is ignored with no log or message, so the notices quietly disappear. (apps/web/shared/components/ServiceNotices.tsx (readServiceNotices, the 'if (!parsed.success) return []' branch))
- Several 'Code' line numbers in the brief point to the wrong lines now. Example: ServiceNotices.tsx:15 is now the component at line 95; mobile shareDiagnostics.ts:27 is now line 34; turn-error-notice.ts:152 is now line 170. (Brief at ~/Desktop/agiworkforce-QA/tools/area-briefs/088-support-trust-and-policy-product.md)

## Not established

- Nothing was built, run or tested. This was a read-only trace, so no localhost test was done.
- How each feature behaves in Local, own key and Cloud modes was not traced. The support, feedback and appeal routes are signed-in or public web routes that call the cloud server; I did not check what Local or own-key users see.
- Empty, loading and error states for the ticket list, help search and the feedback dialog were not traced in full.
- Whether the diagnostic bundle is sent only after the user has reviewed it on the ticket form was not fully confirmed.
- The storage used by incident recovery tracking (trackRecoveries in apps/web/lib/server/service-notices.ts:129) was not traced.
- The accessibility feedback channel (apps/web/features/support/components/SupportTicketsPanel.tsx:537) and the mobile and CLI files behind the brief's cited lines were only partly opened.
- The import assistant's preview step (S88.15) was not traced.
- The trust portal (S88.26) is partial by owner task; I did not verify whether any reports have been published since the review date on the page.
- Chrome extension status for S88.02 and S88.03 is unverified in the brief and was not checked in code.
