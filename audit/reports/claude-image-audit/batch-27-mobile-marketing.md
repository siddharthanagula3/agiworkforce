# Batch 27 — Mobile iOS Marketing Accuracy Audit

**Date:** 2026-05-24
**Auditor:** Claude Opus 4.7 (automated)
**Scope:** 27 Claude iOS mobile screenshots vs. `apps/web/app/mobile/page.tsx` (542 lines)
**Image base:** `/Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/`
**Marketing page:** `apps/web/app/mobile/page.tsx`

---

## Executive Summary

The marketing page describes AGI Mobile as a local-only, on-device AI assistant. The 27 reference screenshots are from **Anthropic's Claude iOS app** (a cloud-based, subscription SaaS product). The marketing page does NOT reference or embed any of these screenshots, nor does it claim to replicate Claude's features. However, the screenshots reveal a rich set of mobile AI app features (artifacts, code sessions, connectors, extended thinking, cowork mode, etc.) that the marketing page either omits entirely or describes in reduced/different terms. The page's feature claims are internally consistent with the AGI product strategy (local-first, privacy-first, v1 scope), but many capabilities visible in the reference screenshots have no corresponding marketing mention. Additionally, several marketing claims about on-device models, App Store links, and feature counts could not be verified against the screenshots since the screenshots are Claude, not AGI.

**Key finding:** The screenshots are competitor reference material (Claude iOS), not AGI product screenshots. The marketing page does not misrepresent Claude features as AGI features. The audit below documents what each Claude screenshot shows and whether the AGI marketing page covers the equivalent feature category.

---

## Per-Image Audit

## IMG: 01_app-shell_splash-opus-extended-faded-greeting.png
- Feature depicted: Claude iOS splash/home screen with "How can I help you this evening?" greeting, Opus 4.6 Extended model selector at top, composer bar at bottom with microphone and voice input, "BY ANTHROPIC" branding
- Image path: /Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/01_app-shell_splash-opus-extended-faded-greeting.png
- Client type: mobile
- Marketing page: apps/web/app/mobile/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Marketing page has no splash/greeting screen mockup or description
  - Page does not mention a personalized greeting banner (time-of-day greeting)
  - Voice input icon is visible in Claude; AGI marketing lists Voice as a feature but does not show UI
  - Claude branding overlay visible; AGI page correctly does not claim this as its own

## IMG: 02_empty-state_composer-keyboard-up.png
- Feature depicted: Claude iOS empty chat state with keyboard open, composer text field "Chat with Claude", plus button for attachments, microphone button, voice/waveform button, Opus 4.6 Extended header, usage warning "Opus consumes usage limits faster than other models"
- Image path: /Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/02_empty-state_composer-keyboard-up.png
- Client type: mobile
- Marketing page: apps/web/app/mobile/page.tsx
- Accuracy: missing
- Marketing gaps:
  - No composer UI description on marketing page
  - Usage limit warnings not mentioned (AGI v1 is local-only so may not apply)
  - Attachment/plus button pattern not described in feature list

## IMG: 03_sidebar_chats-projects-artifacts-code-dispatch-recents.png
- Feature depicted: Claude iOS sidebar navigation showing: Chats, Projects, Artifacts, Code, Dispatch (with "New" badge), and recent conversation history list, user account "Siddhartha Nagula" at bottom
- Image path: /Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/03_sidebar_chats-projects-artifacts-code-dispatch-recents.png
- Client type: mobile
- Marketing page: apps/web/app/mobile/page.tsx
- Accuracy: inaccurate
- Marketing gaps:
  - Marketing page lists "Projects" as a feature (line 74) -- matches sidebar item
  - "Artifacts" visible in Claude sidebar but NOT listed as a v1 feature on marketing page
  - "Code" sessions visible in Claude sidebar but NOT listed as a v1 feature
  - "Dispatch" feature (multi-agent) visible with "New" badge -- not mentioned on marketing page
  - No sidebar/navigation structure described on marketing page
  - Chat history / recents not mentioned

## IMG: 04_composer_model-selector-opus-sonnet-haiku-extended.png
- Feature depicted: Claude iOS model selector dropdown showing Opus 4.6 (checked), Sonnet 4.6, Haiku 4.5, Extended thinking toggle (checked), and "More models" option
- Image path: /Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/04_composer_model-selector-opus-sonnet-haiku-extended.png
- Client type: mobile
- Marketing page: apps/web/app/mobile/page.tsx
- Accuracy: inaccurate
- Marketing gaps:
  - Marketing page describes multi-model as "Apple FM. Gemini Nano. Qwen3." (on-device models) -- completely different model set from Claude's cloud models
  - Extended thinking feature visible in Claude -- not mentioned on AGI marketing page
  - Model selector UI pattern not described
  - The marketing page's "Multi-model" card accurately reflects AGI's local-only strategy, but the reference screenshot shows a very different (cloud) model paradigm

## IMG: 05_projects_list-research-claude-prompt.png
- Feature depicted: Claude iOS Projects list view showing three projects: "research" (6 days ago), "claude Prompt" (1 month ago), "How to use Claude" (4 months ago), with search bar at bottom and create (+) button
- Image path: /Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/05_projects_list-research-claude-prompt.png
- Client type: mobile
- Marketing page: apps/web/app/mobile/page.tsx
- Accuracy: accurate
- Marketing gaps:
  - Marketing page lists "Projects: Topic workspaces. Keep context separate." (line 74) -- matches the concept shown
  - Search within projects not mentioned
  - Project creation (+) not described

## IMG: 06_artifacts_gallery-loading-skeleton.png
- Feature depicted: Claude iOS Artifacts gallery in loading/skeleton state with "Get inspired" banner at top and 6 placeholder cards in 2-column grid
- Image path: /Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/06_artifacts_gallery-loading-skeleton.png
- Client type: mobile
- Marketing page: apps/web/app/mobile/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Artifacts gallery not mentioned as a v1 feature on marketing page
  - "Get inspired" discovery feature not mentioned
  - Skeleton/loading states show polish level -- no equivalent UX described

## IMG: 07_artifacts_gallery-loaded-card-grid.png
- Feature depicted: Claude iOS Artifacts gallery fully loaded showing card grid with titles like "STEM OPT Salary Rules for St...", "Claude Product Ecosystem...", "Manus AI: The Complete Ana...", "Every Visa Path for an Indian...", "Anthropic's Complete Produ...", "The Complete Guide to F1O...", "The U.S. Job Market is Fragi...", "AGI Workforce: Comprehen..." -- each with preview text and timestamps
- Image path: /Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/07_artifacts_gallery-loaded-card-grid.png
- Client type: mobile
- Marketing page: apps/web/app/mobile/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Artifacts as a browsable gallery of generated content not mentioned
  - Content types (analysis, research, guides) visible but not described
  - No equivalent feature in marketing v1 list

## IMG: 08_code_sessions-list-idle-and-archived.png
- Feature depicted: Claude iOS Code sessions list showing "Idle" sessions connected to various GitHub repos (agiworkforce-desktop-app, HxF, agiworkforce, agiagentautomation) with session titles like "Implement plan from recent commits", "Find and fix bugs", "Audit entire codebase", and an "Archived" section below
- Image path: /Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/08_code_sessions-list-idle-and-archived.png
- Client type: mobile
- Marketing page: apps/web/app/mobile/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Code sessions (Claude Code mobile) not mentioned on marketing page
  - Remote code execution / repo connection not described
  - Session archiving feature not mentioned
  - This is a cloud-dependent feature; AGI v1 local-only strategy would not include it

## IMG: 09_cowork_looking-for-desktop-loading.png
- Feature depicted: Claude iOS "Cowork" screen showing "Looking for your desktop..." loading state with illustrations of phone and laptop connected, instructing user to have Claude Desktop app installed, open, and signed in
- Image path: /Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/09_cowork_looking-for-desktop-loading.png
- Client type: mobile
- Marketing page: apps/web/app/mobile/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Cowork (mobile-to-desktop sync/handoff) not mentioned on marketing page
  - Cross-device collaboration feature not described
  - This is a cloud-dependent feature; may not apply to AGI v1

## IMG: 10_settings_main-profile-billing-usage-capabilities-connectors.png
- Feature depicted: Claude iOS Settings main menu showing: email, Profile, Billing (Max plan), Usage, Capabilities, Connectors, Permissions, Appearance (Dark), Speech language (EN), Notifications, Privacy, Shared links, Haptic feedback toggle (on)
- Image path: /Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/10_settings_main-profile-billing-usage-capabilities-connectors.png
- Client type: mobile
- Marketing page: apps/web/app/mobile/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Settings structure not described on marketing page
  - Appearance/dark mode not mentioned
  - Speech language setting not mentioned (though Voice is listed as a feature)
  - Haptic feedback not mentioned
  - Shared links not mentioned
  - Privacy settings section not described (though privacy is heavily marketed in copy)

## IMG: 11_settings_connectors-drive-gmail-vercel-calendar-n8n.png
- Feature depicted: Claude iOS Connectors settings showing integrations: Drive search (toggle), Gmail, Vercel, Google Calendar (Connect), n8n (Connect)
- Image path: /Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/11_settings_connectors-drive-gmail-vercel-calendar-n8n.png
- Client type: mobile
- Marketing page: apps/web/app/mobile/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Third-party connectors/integrations not mentioned on marketing page
  - Drive, Gmail, Vercel, Calendar, n8n integrations not listed
  - AGI v1 is local-only so cloud connectors may be out of scope, but this represents significant competitor capability

## IMG: 12_settings_capabilities-artifacts-code-web-memory-tools.png
- Feature depicted: Claude iOS Capabilities settings showing toggles for: Artifacts (on, required by code execution), Code execution and file creation (on), Web search (on); Memory section with: Search and reference chats (on), Generate memory from chat history (on), "View your memory" link; Tool access options: Auto (selected), On demand, Always available
- Image path: /Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/12_settings_capabilities-artifacts-code-web-memory-tools.png
- Client type: mobile
- Marketing page: apps/web/app/mobile/page.tsx
- Accuracy: inaccurate
- Marketing gaps:
  - Marketing page lists "Memory: Remembers facts you tell it across conversations" (line 73) -- partially matches, but Claude's memory is more granular (search/reference chats, generate from history, view memory)
  - Web search listed as Claude capability; AGI marketing lists "Translate" but not web search as a v1 feature
  - Tool access modes (Auto/On demand/Always available) not described
  - Code execution capability not mentioned in AGI v1 feature list

## IMG: 13_settings_usage-current-session-and-weekly-limits.png
- Feature depicted: Claude iOS Usage screen showing: Current session (2% used, resets in 4 hr 58 min), Weekly limits for All models (25% used, resets Thu 10:00 PM), last update timestamp
- Image path: /Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/13_settings_usage-current-session-and-weekly-limits.png
- Client type: mobile
- Marketing page: apps/web/app/mobile/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Usage tracking/limits not mentioned (AGI v1 local = unlimited local inference)
  - Session-based and weekly usage metering not described
  - The marketing page's "Free at inference" trust chip implicitly addresses this differently

## IMG: 14_settings_notifications-research-chat-code.png
- Feature depicted: Claude iOS Notifications settings with three toggle categories: Research complete (on), Chat responses (on), Code updates (on) -- each with descriptive subtitle
- Image path: /Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/14_settings_notifications-research-chat-code.png
- Client type: mobile
- Marketing page: apps/web/app/mobile/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Push notifications for research/chat/code not mentioned
  - Background task completion alerts not described
  - Research as a distinct mode not mentioned on marketing page

## IMG: 15_settings_shared-links-empty-state.png
- Feature depicted: Claude iOS Shared links empty state: "You haven't shared a link yet. Once you share a chat, they'll appear here."
- Image path: /Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/15_settings_shared-links-empty-state.png
- Client type: mobile
- Marketing page: apps/web/app/mobile/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Chat sharing / shared links not mentioned as a feature
  - Link-based conversation sharing not described

## IMG: 16_settings_permissions-location-calendar-reminders-health.png
- Feature depicted: Claude iOS Permissions settings showing four OS permissions: Location (Read only), Calendar (Read & write), Reminders (Read & write), Health (Never) -- each with description of what Claude uses the permission for
- Image path: /Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/16_settings_permissions-location-calendar-reminders-health.png
- Client type: mobile
- Marketing page: apps/web/app/mobile/page.tsx
- Accuracy: inaccurate
- Marketing gaps:
  - Marketing page lists "HealthKit: iOS: weekly activity recap in plain language" (line 76) -- matches the Health permission concept, though Claude has it set to "Never"
  - Location permission shown in Claude -- not mentioned on AGI marketing page
  - Calendar and Reminders read/write shown -- not mentioned on AGI marketing page
  - Granular permission controls (Read only vs Read & write vs Never) not described

## IMG: 17_settings_billing-max-plan-manage-subscription.png
- Feature depicted: Claude iOS Billing screen showing: Account plan "Max", Manage subscription button, Restore purchases button
- Image path: /Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/17_settings_billing-max-plan-manage-subscription.png
- Client type: mobile
- Marketing page: apps/web/app/mobile/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Subscription management UI not described (AGI v1 is free/local-only)
  - In-app purchase / restore purchases flow not mentioned
  - This is a reference for future AGI cloud billing but not relevant to v1 marketing

## IMG: 18_settings_profile-personal-preferences.png
- Feature depicted: Claude iOS Profile screen with: Full Name and Nickname fields (both "Siddhartha Nagula"), Update Profile button, Personal Preferences text area ("When learning new concepts, I find analogies particularly helpful"), Save Preferences button, Delete account link in red
- Image path: /Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/18_settings_profile-personal-preferences.png
- Client type: mobile
- Marketing page: apps/web/app/mobile/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Profile management not mentioned as a feature
  - Personal preferences / learning style customization not described
  - Account deletion option not mentioned (though GDPR section mentions deletable account data)
  - Nickname field not described

## IMG: 19_code_session-detail-connecting-state.png
- Feature depicted: Claude iOS Code session detail for "Implement plan from recent commits" (agiworkforce-desktop-app, Default), showing "Connecting" state with spinner, "Add feedback..." text field, and "</> Code" mode indicator with send button
- Image path: /Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/19_code_session-detail-connecting-state.png
- Client type: mobile
- Marketing page: apps/web/app/mobile/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Code session detail view not described
  - Connecting/loading states for remote code sessions not mentioned
  - Feedback input within code sessions not described
  - Mode indicator (Code) not described

## IMG: 20_code_session-select-mode-plan-vs-code.png
- Feature depicted: Claude iOS Code session mode selector sheet with two options: "Plan" (Claude explores code and presents a plan before making edits) and "Code" (Claude writes and edits code directly, currently selected with checkmark)
- Image path: /Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/20_code_session-select-mode-plan-vs-code.png
- Client type: mobile
- Marketing page: apps/web/app/mobile/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Plan vs Code mode selection not mentioned
  - Two-phase code workflow (plan first, then edit) not described
  - This is Claude Code mobile functionality -- entirely absent from AGI v1 marketing

## IMG: 21_code_session-more-menu-copy-share-rename-archive.png
- Feature depicted: Claude iOS Code session overflow/more menu showing: Copy branch (claude/implement-plan-R2cif), Share, Rename, Archive
- Image path: /Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/21_code_session-more-menu-copy-share-rename-archive.png
- Client type: mobile
- Marketing page: apps/web/app/mobile/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Git branch management from mobile not described
  - Session sharing, renaming, archiving actions not mentioned
  - Code session management UX not described

## IMG: 22_code_session-attachment-take-or-choose-photo.png
- Feature depicted: Claude iOS Code session attachment menu with two options: "Take Photo" and "Choose Photo", allowing image input within a code session context
- Image path: /Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/22_code_session-attachment-take-or-choose-photo.png
- Client type: mobile
- Marketing page: apps/web/app/mobile/page.tsx
- Accuracy: inaccurate
- Marketing gaps:
  - Marketing page lists "Image Q&A: Take a photo. Ask anything about what you see." (line 69) -- concept matches but not in context of code sessions
  - Photo attachment in code sessions specifically not mentioned
  - Camera integration described in marketing but only for general chat, not code

## IMG: 23_code_archived-sessions-list.png
- Feature depicted: Claude iOS Code archived sessions list showing many archived sessions with task notifications, image sources, interactive sessions, and implementation plans -- all marked "Disconnected" with various repo connections
- Image path: /Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/23_code_archived-sessions-list.png
- Client type: mobile
- Marketing page: apps/web/app/mobile/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Archived sessions management not described
  - Session history/archive browsing not mentioned
  - Disconnected session states not described

## IMG: 24_chat_thread-reasoning-chip-reply-composer.png
- Feature depicted: Claude iOS chat thread showing: user question "Can a one man overpower a company like Claude with Claude in march 2026", reasoning/thinking chip "The user is asking whether a single person can..." (expandable), beginning of Claude's response addressing "Siddhartha" by name, Opus 4.6 Extended header, "Reply to Claude" composer, streaming indicator
- Image path: /Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/24_chat_thread-reasoning-chip-reply-composer.png
- Client type: mobile
- Marketing page: apps/web/app/mobile/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Extended thinking / reasoning chip not mentioned as a feature
  - Personalized responses (addressing user by name) not described
  - Streaming response indicator not mentioned
  - Chat thread UI layout not described

## IMG: 25_chat_thought-process-sheet-overview.png
- Feature depicted: Claude iOS "Thought process" expandable sheet (half-screen) showing Claude's internal reasoning text about the user's question, partially overlaying the chat conversation
- Image path: /Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/25_chat_thought-process-sheet-overview.png
- Client type: mobile
- Marketing page: apps/web/app/mobile/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Thought process / reasoning transparency not mentioned
  - Bottom sheet UI pattern for expanded reasoning not described
  - This represents a significant UX differentiator not covered in marketing

## IMG: 26_chat_thought-process-sheet-expanded.png
- Feature depicted: Claude iOS "Thought process" sheet fully expanded (full screen), showing complete reasoning text about the user's question, with X close button
- Image path: /Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/26_chat_thought-process-sheet-expanded.png
- Client type: mobile
- Marketing page: apps/web/app/mobile/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Full-screen thought process view not described
  - Reasoning transparency as a feature not marketed
  - Expandable/collapsible reasoning UI pattern not mentioned

## IMG: 27_composer_add-to-chat-sheet-camera-photos-files-toggles.png
- Feature depicted: Claude iOS "Add to Chat" sheet showing: Camera, Photos, Files buttons at top; toggles for Research (off), Web search (on), Health Beta (off); links for Add to project (None), Choose style (Normal), Tool access (Auto), Manage Connectors
- Image path: /Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/27_composer_add-to-chat-sheet-camera-photos-files-toggles.png
- Client type: mobile
- Marketing page: apps/web/app/mobile/page.tsx
- Accuracy: inaccurate
- Marketing gaps:
  - Camera/Photos/Files input options: marketing mentions "Image Q&A" and "OCR + Scan" but not the full attachment sheet UX
  - Research toggle not mentioned (research as a mode/capability absent from v1 feature list)
  - Web search toggle shown in Claude; not listed as AGI v1 feature
  - Health (Beta) toggle visible; marketing lists HealthKit but as a passive recap, not a toggle
  - "Choose style" (Normal) conversation style selector not mentioned
  - "Add to project" inline assignment not described
  - "Tool access" mode selector not mentioned
  - "Manage Connectors" link -- connectors not mentioned in v1

---

## Summary of Marketing Accuracy

### Features on marketing page WITH screenshot evidence (accurate):
| Feature | Marketing claim | Screenshot evidence |
|---------|----------------|-------------------|
| Chat | "Text conversation with persistent memory and context" | Images 01, 02, 24 show chat UI |
| Image Q&A | "Take a photo. Ask anything about what you see." | Images 22, 27 show camera/photo input |
| Voice | "Speak your question. Read the answer." | Images 01, 02 show microphone/voice buttons |
| Memory | "Remembers facts you tell it across conversations" | Image 12 shows memory settings |
| Projects | "Topic workspaces. Keep context separate." | Images 03, 05 show Projects list |
| HealthKit | "iOS: weekly activity recap in plain language" | Images 16, 27 show Health permission/toggle |

### Features on marketing page WITHOUT screenshot evidence (unverifiable from these images):
| Feature | Marketing claim | Notes |
|---------|----------------|-------|
| OCR + Scan | "Point at a document or sign" | No OCR screenshot in batch |
| Translate | "60+ language pairs, on-device" | No translation screenshot |
| Skills | "150+ built-in skills across 23 categories" | No skills UI screenshot |
| Hindi | "Validated against a 60-prompt native-speaker suite" | No Hindi UI screenshot |

### Features visible in screenshots NOT on marketing page (missing from marketing):
| Feature | Screenshot(s) | Risk level |
|---------|--------------|------------|
| Artifacts gallery | 03, 06, 07 | Low (cloud feature, out of v1 scope) |
| Code sessions | 03, 08, 19-23 | Low (Claude Code mobile, out of v1 scope) |
| Cowork (mobile-desktop sync) | 09 | Low (cloud feature) |
| Extended thinking / reasoning | 24, 25, 26 | **Medium** (desirable feature to mention if planned) |
| Connectors (Drive, Gmail, etc.) | 11, 27 | Low (cloud feature) |
| Dispatch (multi-agent) | 03 | Low (advanced feature, out of v1 scope) |
| Research mode | 14, 27 | Low (cloud feature) |
| Shared links | 15 | Low (cloud feature) |
| Notifications (research/chat/code) | 14 | Low (could be relevant for v1) |
| Profile / personal preferences | 18 | **Medium** (basic user personalization) |
| Usage tracking | 13 | Low (v1 is free/unlimited local) |

### App Store / Download Link Audit
| Element | Value | Status |
|---------|-------|--------|
| iOS App Store link | `https://apps.apple.com/app/agi/id6742817665` | **UNVERIFIABLE** -- app not yet launched (2026-08-16). ID may be a placeholder |
| Google Play link | `https://play.google.com/store/apps/details?id=com.agiworkforce.app` | **UNVERIFIABLE** -- app not yet launched |
| Bundle ID (iOS) | `com.agiworkforce.app` | Declared in footer |
| Package (Android) | `com.agiworkforce.app` | Declared in footer |
| Platform requirement | "iOS 17+ and Android 14+" | Declared in footer, not mentioned in hero or feature sections |
| Launch date | "2026-08-16" | Consistent between eyebrow and footer |

### Structural/Copy Issues Found
1. **Hero eyebrow** says "iOS + Android -- launching 2026-08-16" which is accurate per project strategy
2. **App Store badges link to store pages** that do not yet exist -- could cause 404 for users clicking before launch
3. **Framework version** "Expo 53 + React Native 0.83.6" in footer is a technical detail that may become stale
4. **No mobile screenshots embedded** on the marketing page itself -- the page is text-only with no visual preview of the app
5. **"10+ providers" in waitlist section** references cloud providers -- consistent with waitlist messaging but could confuse users about v1 scope
6. **Privacy policy link** goes to `/mobile/legal` -- should be verified this page exists

---

## Recommendations

1. **Add app preview mockups** to the marketing page -- currently 100% text with no visual representation of the mobile app
2. **Consider mentioning extended thinking / reasoning transparency** if planned for v1 -- this is a high-value differentiator visible in Claude's mobile UI
3. **Add "coming soon" indicators** for features visible in reference screenshots that are planned for post-v1 (artifacts, code sessions, connectors)
4. **Guard App Store links** with a check or redirect for pre-launch state to avoid dead links
5. **`/mobile/legal` page verified** -- `apps/web/app/mobile/legal/page.tsx` exists, link is valid
6. **Add push notifications mention** if planned for v1 -- basic chat completion notifications are a table-stakes mobile feature
7. **Profile/preferences customization** is a basic feature shown in Claude that should be mentioned if AGI v1 supports it
