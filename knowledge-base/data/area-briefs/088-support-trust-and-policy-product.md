# Area 88. Support, trust, and policy product

31 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S88.01 Contextual help links.
- Should: Screens that need explaining link straight to the matching help or docs article for that feature.
- Status: web done, desktop done, mobile missing, cli missing, vscode done, chrome done
- Code: apps/web/features/settings/sections/MemorySection.tsx:128; apps/web/features/settings/sections/PrivacySection.tsx:407; apps/web/features/settings/sections/BillingSection.tsx:646; apps/web/features/workspace-console/components/ConsolePage.tsx:27; apps/web/app/workspace/policy/page.tsx:14; apps/web/content/support/configuration.md:2; apps/web/content/support/custom-instructions.md:2; apps/web/lib/support/doc-metadata.ts:149

## S88.02 Searchable help center.
- Should: Users can search a help centre and open matching articles.
- Status: web done, desktop done, cli missing, chrome unverified
- Code: apps/web/app/help/page.tsx:55; apps/web/features/support/components/HelpSearch.tsx:34; apps/web/app/api/help/search/route.ts:47

## S88.03 Contact-support flow.
- Should: A signed-in user can reach support from the product, describe a problem, and follow the replies.
- Status: web done, desktop done, mobile done, cli missing, chrome unverified
- Code: apps/web/features/settings/components/WebSettingsModal.tsx:211; apps/web/features/settings/sections/HelpSection.tsx:77; apps/web/features/support/components/SupportTicketsPanel.tsx:84; apps/web/app/api/support/tickets/route.ts:43; apps/desktop/electron/appMenu.ts:231; apps/mobile/src/features/support/SupportTicketsScreen.tsx:149; apps/mobile/src/features/support/SupportTicketScreen.tsx:58; apps/mobile/src/features/support/service.ts:99

## S88.04 Report-a-bug flow.
- Should: A user can report a bug from the product, with enough context (build, platform) for support to act.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: apps/web/features/settings/sections/HelpSection.tsx:43; apps/web/app/support/page.tsx:65; apps/web/lib/support/diagnostics/collect.ts:51; apps/web/app/api/support/tickets/route.ts:43; apps/mobile/src/features/settings/index.tsx:599; apps/mobile/src/features/feedback/index.tsx:16; apps/mobile/src/features/feedback/index.tsx:50; apps/web/app/api/mobile/feedback/route.ts:43

## S88.05 Product feedback.
- Should: Users can send general product feedback from inside the product and it is stored for the team.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome missing
- Code: apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:22; apps/web/features/chat/components/messages/MessageBubble.tsx:2912; apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:162; apps/mobile/src/features/settings/index.tsx:599; apps/mobile/src/features/feedback/index.tsx:18; apps/mobile/src/features/feedback/index.tsx:50; apps/cli/src/cloud/feedback.rs:53; apps/cli/src/claude_parity.rs:157
- Unfinished: web: ['mount'] | desktop: ['mount']

## S88.06 Feature request.
- Should: Users can submit a feature request from inside the product and it is stored for the team.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome missing
- Code: apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:24; apps/web/features/chat/components/messages/MessageBubble.tsx:2912; apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:162; apps/mobile/src/features/settings/index.tsx:599; apps/mobile/src/features/feedback/index.tsx:17; apps/mobile/src/features/feedback/index.tsx:50; apps/cli/src/cloud/feedback.rs:53; apps/cli/src/claude_parity.rs:157
- Unfinished: web: ['mount'] | desktop: ['mount']

## S88.07 User-reviewable diagnostic bundle.
- Should: A user can produce a diagnostic bundle, see what it contains, and choose to share it with support.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/support/components/SupportTicketsPanel.tsx:188; apps/web/features/support/components/SupportTicketsPanel.tsx:103; apps/web/features/support/components/SupportTicketsPanel.tsx:131; apps/web/features/support/lib/ticket-client.ts:95; apps/mobile/src/features/settings/index.tsx:617; apps/mobile/src/features/settings/diagnostics/shareDiagnostics.ts:27; apps/cli/src/diagnostics_bundle.rs:58; apps/cli/src/lib.rs:5656

## S88.08 Request/error identifier.
- Should: When a request fails, the user sees a reference id they can quote to support.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/lib/turn-error-notice.ts:152; apps/web/app/api/llm/v1/chat/completions/lib/upstream-error-copy.ts:255; apps/web/lib/hooks/useChatStream.ts:436; apps/mobile/src/features/chat/utils/messageStreamError.ts:172; apps/web/lib/error-handler.ts:335; apps/cli/src/errors.rs:866; apps/cli/src/errors.rs:812; apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:287

## S88.09 Known-issue display.
- Should: The product shows users a list of currently known issues with their status or workaround.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S88.10 Service-status integration.
- Should: Users can see current service status from the product, fed by live health checks.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing, api done
- Code: apps/web/features/settings/sections/HelpSection.tsx:55; apps/web/app/status/page.tsx:203; apps/web/app/status/page.tsx:65; apps/web/features/chat/components/Composer/ComposerFooter.tsx:406; apps/web/app/api/health/route.ts:51

## S88.11 Incident notices.
- Should: During an incident, users see a notice in the product describing the problem and its status.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/lib/server/service-notices.ts:40; apps/web/shared/components/ServiceNotices.tsx:15; apps/web/shared/components/ProductNotices.tsx:12; apps/web/app/AppRuntimeMounts.tsx:28

## S88.12 Maintenance notices.
- Should: Users are told about planned maintenance before and during it, inside the product.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/lib/server/service-notices.ts:23; apps/web/lib/server/service-notices.ts:58; apps/web/shared/components/ServiceNotices.tsx:71; apps/web/app/AppRuntimeMounts.tsx:28

## S88.13 Release-update education.
- Should: After an update, users learn what changed (what's new, release notes) from inside the product.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/web/shared/components/ReleaseNotice.tsx:39; apps/web/shared/components/ReleaseNotice.tsx:53; apps/web/shared/components/ProductNotices.tsx:13; apps/cli/src/update_check.rs:82; apps/cli/src/tui/tui_app.rs:4935

## S88.14 Model-retirement notice.
- Should: Users are warned before a model they use is retired and told what replaces it when it is.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:406; apps/web/features/chat/components/UnavailableModelNotice.tsx:28; apps/web/shared/stores/model-store.ts:307; apps/web/features/models/lib/model-presentation.ts:41; apps/cli/src/provider.rs:296; apps/cli/src/tui/widgets/model_picker.rs:423

## S88.15 Feature-migration assistant.
- Should: An assistant helps users move their data and settings from another product or a replaced feature, with a preview before changes.
- Status: web done, desktop done, cli done, vscode missing, chrome missing
- Code: apps/web/features/settings/components/ImportMemoryDialog.tsx:60; apps/cli/src/lib.rs:867; apps/cli/src/lib.rs:3849; apps/cli/src/ecosystem.rs:541

## S88.16 Privacy-rights request portal.
- Should: A user can submit access, correction or erasure requests and see their status in a privacy portal.
- Status: web done, desktop done, mobile done, cli missing
- Code: apps/web/app/privacy/requests/page.tsx:133; apps/web/app/privacy/requests/YourRightsRequests.tsx:50; apps/web/app/privacy/requests/YourRightsRequests.tsx:91; apps/mobile/src/features/settings/cloud-privacy/index.tsx:170

## S88.17 Cookie preference center.
- Should: Users can review and change cookie categories at any time from a preference centre, and the choice is honoured.
- Status: web done, desktop done
- Code: apps/web/app/cookies/CookiePreferencesButton.tsx:7; apps/web/app/layout.tsx:184; apps/web/shared/components/CookieConsent.tsx:75; apps/web/shared/lib/cookie-consent.ts:78

## S88.18 Content-reporting flow.
- Should: A user can report a harmful or problematic response from where it appears, and the report reaches moderation.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:937; apps/web/app/api/content-report/route.ts:21; apps/web/app/api/mobile/content-report/route.ts:55; apps/mobile/src/features/chat/components/MessageBubble.tsx:1128; apps/mobile/src/features/chat/components/ReportFlagButton.tsx:136; apps/mobile/services/contentReport.ts:141

## S88.19 Copyright/impersonation reporting.
- Should: Anyone can report copyright infringement or impersonation in hosted content and get a reference.
- Status: web done, desktop done
- Code: apps/web/app/copyright/report/CopyrightNoticeForm.tsx:246; apps/web/app/copyright/report/CopyrightNoticeForm.tsx:62; apps/web/app/api/copyright-notice/route.ts:40; apps/web/db/neon/0312_content_notice_type.sql:19; apps/web/app/copyright/report/page.tsx:79

## S88.20 Safety-warning appeal.
- Should: When a response is refused for safety reasons, the user can appeal or report the refusal from that notice.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/messages/ChatMessageList.tsx:1775; apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:162; apps/web/app/api/feedback/route.ts:175; apps/mobile/src/features/chat/components/MessageBubble.tsx:1631; apps/web/app/api/mobile/feedback/route.ts:13

## S88.21 Account-suspension appeal.
- Should: A suspended user is told why and can appeal from where they are blocked, with a way to follow the appeal.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/auth/AccountAccessNotice.tsx:31; apps/web/features/auth/SuspensionAppeal.tsx:145; apps/web/app/api/support/appeal/route.ts:81; apps/web/lib/support/tickets/appeals.ts:66; apps/web/features/auth/AuthNoticeStep.tsx:60; apps/web/app/appeal/page.tsx:27; apps/web/lib/support/tickets/service.ts:395

## S88.22 Security vulnerability reporting.
- Should: Security researchers find a published way to report vulnerabilities (policy page and security.txt).
- Status: web done, desktop done
- Code: apps/web/app/security/page.tsx:609; apps/web/app/.well-known/security.txt/route.ts:8

## S88.23 Accessibility feedback.
- Should: Users can report accessibility barriers through a dedicated, accessible channel from the product.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/support/components/SupportTicketsPanel.tsx:537; apps/web/features/support/components/SupportTicketsPanel.tsx:71; apps/web/app/accessibility/page.tsx:115

## S88.24 Policy-version history.
- Should: Users can see earlier versions of the terms and policies and what changed between them.
- Status: web done, desktop done
- Code: apps/web/app/terms/page.tsx:264; apps/web/app/legal/archive/[policy]/page.tsx:76; apps/web/app/legal/archive/[policy]/[date]/page.tsx:66; apps/web/app/legal/archive/[policy]/[date]/page.tsx:90; scripts/archive-policy-versions.mjs:88; scripts/check-policy-versions.mjs:192

## S88.25 Subprocessor information.
- Should: A current list of subprocessors, with a change log, is published.
- Status: web done, desktop done
- Code: apps/web/app/subprocessors/page.tsx:280; apps/web/app/subprocessors/page.tsx:251

## S88.26 Security/compliance evidence portal.
- Should: Customers can review security and compliance evidence (reports, certifications, questionnaires) in a trust portal.
- Status: web partial, desktop partial
- Code: apps/web/app/trust/page.tsx:79; apps/web/app/trust/page.tsx:42; apps/web/content/support/enterprise-security.md:21
- Unfinished: web: owner: commission SOC 2, ISO 27001 and a third-party penetration test and publish the reports on the trust page | desktop: owner: commission SOC 2, ISO 27001 and a third-party penetration test and publish the reports on the trust page

## S88.27 Jurisdiction-specific notices where applicable.
- Should: Where required, users in a jurisdiction see the notices that apply to them (e.g. India DPDP, EU representative, region blocks).
- Status: web done, desktop done
- Code: apps/web/app/privacy/india/page.tsx:244; apps/web/app/legal/eu-representative/page.tsx:23; apps/web/app/legal/page.tsx:103; apps/web/app/privacy/india/page.tsx:243

## S88.28 Support assistant email and WhatsApp channels.
- Should: The support assistant answers customers by email and WhatsApp as well as in the web widget, as Intercom Fin does.
- Status: web missing

## S88.29 Multilingual support answers.
- Should: The support assistant answers in the customer's language from the same help corpus.
- Status: web missing

## S88.30 Support resolution and satisfaction analytics.
- Should: Operators see how many conversations the assistant resolved, handed off or failed, with customer satisfaction ratings.
- Status: web missing

## S88.31 Support content-gap suggestions.
- Should: The assistant reports questions it could not answer from the help corpus so the owner can write the missing articles.
- Status: web missing
