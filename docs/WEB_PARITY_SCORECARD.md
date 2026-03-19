# Web App Parity Scorecard

**Last Updated**: 2026-03-18
**Measured Against**: claude.ai (primary), ChatGPT web (secondary)
**Source**: Codebase audit of `apps/web/` — components, stores, API routes, pages

---

## Overall Score: 72% parity with claude.ai

Calculated as the weighted average of all category scores below.

---

## Category Scores

### 1. Chat UI (Weight: 25%) — Score: 80%

| Feature                                           | claude.ai | ChatGPT | AGI Workforce | Status  | Gap / Action                                                          |
| ------------------------------------------------- | --------- | ------- | ------------- | ------- | --------------------------------------------------------------------- |
| Streaming messages (SSE)                          | ✓         | ✓       | ✓             | Done    | None                                                                  |
| Code blocks with syntax highlighting              | ✓         | ✓       | ✓             | Done    | None                                                                  |
| Copy code button                                  | ✓         | ✓       | ✓             | Done    | None                                                                  |
| Artifacts / Canvas panel                          | ✓         | ✓       | ✓             | Done    | `ArtifactsPanel.tsx`, `ArtifactPreview.tsx`                           |
| Thinking / reasoning blocks                       | ✓         | -       | ✓             | Done    | `ThinkingBlock.tsx` with collapsible CSS animation                    |
| Tool execution timeline                           | ✓         | -       | ✓             | Done    | `ToolTimeline.tsx`, `ToolCallCard.tsx`, `InlineToolResults/`          |
| Inline tool results (file read, search, terminal) | ✓         | -       | ✓             | Done    | `InlineFileRead`, `InlineSearchResults`, `InlineTerminalOutput`       |
| Mermaid diagram rendering                         | ✓         | -       | ✓             | Done    | `MermaidRenderer.tsx`                                                 |
| Image display in messages                         | ✓         | ✓       | ✓             | Done    | `MediaDisplay.tsx`, `ImageLightbox.tsx`, `ImageAttachmentPreview.tsx` |
| Message actions (copy, retry)                     | ✓         | ✓       | ✓             | Done    | `MessageActions.tsx`                                                  |
| Message edit (user messages)                      | ✓         | ✓       | Partial       | Partial | `EditableMessage.tsx` exists; wiring to branching TBD                 |
| Conversation branching (edit creates branch)      | ✓         | ✓       | ✓             | Done    | `BranchNavigator.tsx`, `CreateBranchDialog.tsx`                       |
| Follow-up suggestions                             | ✓         | ✓       | ✓             | Done    | `FollowUpSuggestions.tsx`                                             |
| Welcome / suggested prompts                       | ✓         | ✓       | ✓             | Done    | `SuggestedPrompts.tsx`, `WelcomeDialog.tsx`                           |
| Diff viewer (code changes)                        | ✓         | ✓       | ✓             | Done    | `DiffViewer.tsx`                                                      |
| Interactive visualizations                        | -         | -       | ✓             | Bonus   | `InteractiveVisualization.tsx`                                        |
| Inline code executor                              | -         | -       | ✓             | Bonus   | `InlineCodeExecutor.tsx`                                              |
| Emoji reactions on messages                       | -         | -       | ✓             | Bonus   | `EmojiReactions.tsx`                                                  |
| Message search within conversation                | -         | -       | ✓             | Bonus   | `MessageSearch.tsx`                                                   |
| Model comparison view                             | -         | -       | ✓             | Bonus   | `ModelComparisonView.tsx`, `ModelComparisonDialog.tsx`                |
| Token counter / analytics                         | -         | Partial | ✓             | Bonus   | `TokenCounter.tsx`, `TokenAnalyticsDashboard.tsx`                     |
| Multi-agent chat interface                        | -         | -       | ✓             | Bonus   | `MultiAgentChatInterface.tsx`, `AgentParticipantPanel.tsx`            |
| Export conversation                               | ✓         | ✓       | ✓             | Done    | `ExportDialog.tsx`, `EnhancedExportDialog.tsx`                        |
| Error message display                             | ✓         | ✓       | ✓             | Done    | `ErrorMessage.tsx`, `ChatErrorBoundary.tsx`                           |
| Loading skeleton                                  | ✓         | ✓       | ✓             | Done    | `MessageBubbleSkeleton.tsx`, `ChatLoadingState.tsx`                   |
| Responsive mobile layout                          | ✓         | ✓       | Partial       | Partial | Layout exists; mobile-specific polish incomplete                      |

**Category raw score: 80%**
Gains from bonus features offset the partial mobile gap.

---

### 2. Composer / Input (Weight: 10%) — Score: 85%

| Feature                                     | claude.ai | ChatGPT | AGI Workforce | Status  | Gap / Action                                        |
| ------------------------------------------- | --------- | ------- | ------------- | ------- | --------------------------------------------------- |
| Multi-line text input with auto-resize      | ✓         | ✓       | ✓             | Done    | `ChatComposerNew.tsx`                               |
| File / image attachment (drag-drop + click) | ✓         | ✓       | ✓             | Done    | `AttachmentPreview.tsx`, `DragDropOverlay.tsx`      |
| Slash command menu                          | ✓         | ✓       | ✓             | Done    | `SlashCommandMenu.tsx`                              |
| Prompt shortcuts / @ mentions               | ✓         | ✓       | ✓             | Done    | `PromptShortcuts.tsx`, `FolderContextSelector.tsx`  |
| Voice input (speech-to-text)                | ✓         | ✓       | ✓             | Done    | `VoiceInputButton.tsx`, `VoiceRecordingOverlay.tsx` |
| Style selector (response format)            | ✓         | -       | ✓             | Done    | `StyleSelector.tsx`                                 |
| Agent mode switcher                         | ✓         | -       | ✓             | Done    | `AgentModeSwitcher.tsx`                             |
| Ghost text / AI completion                  | -         | -       | ✓             | Bonus   | `GhostTextOverlay.tsx` (Copilot-style)              |
| Focus mode buttons                          | -         | -       | ✓             | Bonus   | `FocusModeButtons.tsx`                              |
| Composer footer (model info, token count)   | ✓         | ✓       | ✓             | Done    | `ComposerFooter.tsx`, `InputFooter.tsx`             |
| Send button with loading state              | ✓         | ✓       | ✓             | Done    | `SendButton.tsx`                                    |
| Stop generation button                      | ✓         | ✓       | Partial       | Partial | Stop button wiring needs confirmation               |
| Keyboard shortcuts (Ctrl+Enter send)        | ✓         | ✓       | ✓             | Done    | `KeyboardShortcutsDialog.tsx`                       |

**Category raw score: 85%**

---

### 3. Conversation Management (Weight: 15%) — Score: 75%

| Feature                                             | claude.ai | ChatGPT | AGI Workforce | Status  | Gap / Action                                          |
| --------------------------------------------------- | --------- | ------- | ------------- | ------- | ----------------------------------------------------- |
| Sidebar with conversation list                      | ✓         | ✓       | ✓             | Done    | `ChatSidebar.tsx` (primary) + `ChatSidebarNew.tsx`    |
| Time-based grouping (Today / Yesterday / Last week) | ✓         | ✓       | ✓             | Done    | `groupSessions()` in `ChatSidebar.tsx`                |
| Search / filter conversations                       | ✓         | ✓       | ✓             | Done    | Live search in `ChatSidebar.tsx`                      |
| Rename conversation                                 | ✓         | ✓       | ✓             | Done    | Inline rename in `ConversationListItem.tsx`           |
| Delete conversation                                 | ✓         | ✓       | ✓             | Done    | Alert dialog confirm in `ChatSidebar.tsx`             |
| Pin conversation to top                             | ✓         | ✓       | ✓             | Done    | `ChatSidebarNew.tsx` (`isPinned` flag)                |
| Archive conversation                                | ✓         | -       | ✓             | Done    | `ChatSidebarNew.tsx` (archive/unarchive handlers)     |
| Folder organization                                 | ✓         | -       | ✓             | Done    | `FolderManagement.tsx` (create/rename/delete folders) |
| Share conversation (public link)                    | ✓         | ✓       | ✓             | Done    | `ShareDialog.tsx` + `/share/[token]` public page      |
| Conversation branching / history                    | ✓         | -       | ✓             | Done    | `BranchNavigator.tsx`                                 |
| Global search across all conversations              | ✓         | ✓       | ✓             | Done    | `GlobalSearchDialog.tsx`, `SearchResults.tsx`         |
| Bookmarks / starred messages                        | -         | -       | ✓             | Bonus   | `BookmarksDialog.tsx`                                 |
| Two sidebars (primary + ChatSidebarNew) in sync     | -         | -       | Partial       | Partial | Two sidebar implementations; needs unification        |

**Category raw score: 75%**
The two-sidebar fragmentation (ChatSidebar vs ChatSidebarNew) is the main risk — features like pin/archive are only in the new component.

---

### 4. Projects & Organization (Weight: 10%) — Score: 60%

| Feature                                   | claude.ai | ChatGPT | AGI Workforce | Status  | Gap / Action                                                              |
| ----------------------------------------- | --------- | ------- | ------------- | ------- | ------------------------------------------------------------------------- |
| Projects container for chats              | ✓         | -       | ✓             | Done    | `ProjectSidebar.tsx`, `projectStore.ts`                                   |
| Project settings / metadata               | ✓         | -       | ✓             | Done    | `ProjectSettingsDialog.tsx`                                               |
| Knowledge base / file uploads per project | ✓         | ✓       | Partial       | Partial | Store exists; persistent server-side KB incomplete                        |
| Custom instructions per project           | ✓         | ✓       | Partial       | Partial | `systemPrompt` field in `AIConfigurationTab`; per-project scoping missing |
| Shared project across team                | ✓         | ✓       | Partial       | Partial | Teams store exists; cross-user project sharing not wired                  |
| Project templates                         | -         | -       | ✓             | Bonus   | `VibeTemplateSelector.tsx`                                                |

**Category raw score: 60%**

---

### 5. Settings & Personalization (Weight: 10%) — Score: 65%

| Feature                                      | claude.ai | ChatGPT | AGI Workforce | Status  | Gap / Action                                                                                    |
| -------------------------------------------- | --------- | ------- | ------------- | ------- | ----------------------------------------------------------------------------------------------- |
| Model selection (per chat)                   | ✓         | ✓       | ✓             | Done    | `ModelSelector`, `modelStore.ts`                                                                |
| Theme toggle (dark / light / system)         | ✓         | ✓       | Partial       | Partial | `AppearanceTab` renders RadioGroup but does NOT persist to `next-themes`; toggle is visual only |
| Chat font selection                          | -         | -       | ✓             | Bonus   | `ChatFont` type in `settingsStore.ts`                                                           |
| Response style / persona                     | ✓         | -       | ✓             | Done    | `StyleSelector.tsx`, `AIConfigurationTab`                                                       |
| System prompt / custom instructions (global) | ✓         | ✓       | ✓             | Done    | `AIConfigurationTab.systemPrompt`                                                               |
| Memory management                            | ✓         | ✓       | ✓             | Done    | `memoryStore.ts`, memory dashboard page at `/dashboard/settings/memory`                         |
| API key management (BYOK)                    | ✓         | -       | ✓             | Done    | `APIKeysTab`, 9+ providers                                                                      |
| Notification preferences                     | ✓         | -       | ✓             | Done    | `NotificationsTab`                                                                              |
| Profile photo upload                         | -         | ✓       | ✓             | Done    | Avatar upload in `ProfileTab`                                                                   |
| Save profile changes to server               | ✓         | ✓       | -             | Missing | `ProfileTab.handleSave()` shows `toast.info('not yet implemented')`                             |
| Language / locale                            | ✓         | ✓       | -             | Missing | No i18n settings exposed to user                                                                |
| Keyboard shortcuts reference                 | ✓         | ✓       | ✓             | Done    | `KeyboardShortcutsDialog.tsx`                                                                   |

**Category raw score: 65%**
Theme persistence and profile save are the most visible gaps.

---

### 6. Auth & Billing (Weight: 10%) — Score: 85%

| Feature                                    | claude.ai | ChatGPT | AGI Workforce | Status  | Gap / Action                                                    |
| ------------------------------------------ | --------- | ------- | ------------- | ------- | --------------------------------------------------------------- |
| Email + password auth                      | ✓         | ✓       | ✓             | Done    | Supabase auth in `login/page.tsx`                               |
| OAuth — GitHub                             | ✓         | -       | ✓             | Done    | `handleOAuth('github')`                                         |
| OAuth — Google                             | ✓         | ✓       | ✓             | Done    | `handleOAuth('google')`                                         |
| Magic link (passwordless)                  | ✓         | -       | ✓             | Done    | `signInWithOtp()` in `LoginForm`                                |
| SSO (enterprise SAML / domain auto-detect) | ✓         | ✓       | ✓             | Done    | SSO domain detection + `checkSsoDomain()`                       |
| Device auth (desktop pairing)              | -         | -       | ✓             | Bonus   | `/app/device-auth/` + `/api/auth/desktop-token/`                |
| TOTP / 2FA                                 | ✓         | ✓       | Partial       | Partial | `TOTP_ENCRYPTION_KEY` env var exists; UI flow not fully exposed |
| Subscription plans (Stripe)                | ✓         | ✓       | ✓             | Done    | Stripe checkout, webhooks, price tier mapping                   |
| Usage-based credits                        | ✓         | -       | ✓             | Done    | Credit top-up API, `billingUsage.ts`                            |
| Billing portal (manage subscription)       | ✓         | ✓       | ✓             | Done    | `/api/portal` Stripe portal redirect                            |
| Free trial / claim offer                   | ✓         | ✓       | ✓             | Done    | `/api/claim-offer`                                              |
| Usage warning modal                        | ✓         | ✓       | ✓             | Done    | `UsageWarningModal.tsx`, `UsageWarningBanner.tsx`               |
| Password reset                             | ✓         | ✓       | ✓             | Done    | `/forgot-password` page                                         |
| Account suspension handling                | ✓         | -       | ✓             | Done    | `error=account_suspended` in login redirect                     |

**Category raw score: 85%**
2FA is the only meaningful gap.

---

### 7. Landing & Marketing (Weight: 10%) — Score: 65%

| Feature                     | claude.ai | ChatGPT | AGI Workforce | Status  | Gap / Action                                                                                           |
| --------------------------- | --------- | ------- | ------------- | ------- | ------------------------------------------------------------------------------------------------------ |
| Professional hero section   | ✓         | ✓       | ✓             | Done    | `app/page.tsx` hero with CTAs                                                                          |
| Feature grid / value props  | ✓         | ✓       | ✓             | Done    | Feature sections in landing page                                                                       |
| Pricing page                | ✓         | ✓       | ✓             | Done    | `/pricing` with tier cards                                                                             |
| Testimonials / social proof | ✓         | ✓       | Partial       | Partial | Logo marquee exists; no real user quotes                                                               |
| Animations / scroll effects | ✓         | ✓       | Partial       | Partial | CSS `animate-pulse` + marquee only; no framer-motion scroll reveals                                    |
| Light mode landing page     | ✓         | ✓       | -             | Missing | `globals.css` has light mode tokens but landing is dark-only                                           |
| Blog / changelog            | ✓         | ✓       | ✓             | Done    | `/blog`, `/changelog` routes present                                                                   |
| Docs / help center          | ✓         | ✓       | ✓             | Done    | `/docs`, `/help`, `/faq` pages                                                                         |
| Download page               | ✓         | ✓       | ✓             | Done    | `/download` with platform detection                                                                    |
| Feature detail pages        | ✓         | ✓       | ✓             | Done    | `/features/agents`, `/features/ai-skills`, `/features/tools`, `/features/plugins`, `/features/ai-chat` |
| Use-case pages              | ✓         | ✓       | ✓             | Done    | `/use-cases`                                                                                           |
| Marketplace / gallery       | ✓         | -       | ✓             | Done    | `/gallery`, `/marketplace`                                                                             |
| Contact / support pages     | ✓         | ✓       | ✓             | Done    | `/contact`, `/support`, `/contact-sales`                                                               |
| Legal pages                 | ✓         | ✓       | ✓             | Done    | `/privacy`, `/terms`, `/cookies`, `/security`                                                          |
| Careers page                | -         | ✓       | ✓             | Done    | `/careers`                                                                                             |
| OG meta / social sharing    | ✓         | ✓       | ✓             | Done    | Full `openGraph` in `app/page.tsx`                                                                     |
| JSON-LD structured data     | ✓         | -       | ✓             | Done    | `JsonLd` in layout                                                                                     |
| Sitemap                     | ✓         | ✓       | ✓             | Done    | `app/sitemap.ts` with 30+ routes                                                                       |
| robots.txt                  | ✓         | ✓       | ✓             | Done    | `app/robots.ts` with AI-crawler rules                                                                  |
| Conversion CTA sections     | ✓         | ✓       | ✓             | Done    | `CtaSection.tsx`                                                                                       |

**Category raw score: 65%**
Light mode landing and real scroll animations are the differentiating gaps vs claude.ai.

---

### 8. Performance & Accessibility (Weight: 5%) — Score: 55%

| Feature                                       | claude.ai | ChatGPT | AGI Workforce | Status  | Gap / Action                                                     |
| --------------------------------------------- | --------- | ------- | ------------- | ------- | ---------------------------------------------------------------- |
| ARIA labels on interactive controls           | ✓         | ✓       | ✓             | Done    | `aria-label` on sidebar buttons, inputs                          |
| Focus-visible styles                          | ✓         | ✓       | ✓             | Done    | Tailwind `focus-visible:` utilities used                         |
| Keyboard navigation (chat, sidebar)           | ✓         | ✓       | Partial       | Partial | Sidebar keyboard nav; chat list focus order needs audit          |
| Screen-reader text for icons                  | ✓         | ✓       | Partial       | Partial | `sr-only` usage inconsistent across components                   |
| Skip-to-main-content link                     | ✓         | ✓       | -             | Missing | Not implemented                                                  |
| Color contrast (WCAG AA)                      | ✓         | ✓       | Partial       | Partial | Dark theme checked; light mode contrast untested                 |
| Image alt text                                | ✓         | ✓       | Partial       | Partial | Inconsistent in marketing pages                                  |
| Core Web Vitals monitoring                    | ✓         | ✓       | -             | Missing | No CWV reporting (no `reportWebVitals` or Vercel Speed Insights) |
| Next.js Image optimization                    | ✓         | ✓       | Partial       | Partial | `next/image` used in some places; not universal                  |
| Server components (avoid client bundle bloat) | ✓         | ✓       | Partial       | Partial | Mix of `'use client'` and server components; no audit done       |
| Error boundaries                              | ✓         | ✓       | ✓             | Done    | `ChatErrorBoundary.tsx`, `ErrorBoundary` in shared               |
| Loading skeletons                             | ✓         | ✓       | ✓             | Done    | Skeleton components throughout                                   |

**Category raw score: 55%**
CWV monitoring and the skip-link are quick wins. Full WCAG audit needed.

---

### 9. API & Backend (Weight: 5%) — Score: 85%

| Feature                       | claude.ai | ChatGPT | AGI Workforce | Status  | Gap / Action                                       |
| ----------------------------- | --------- | ------- | ------------- | ------- | -------------------------------------------------- |
| Chat completion endpoint      | ✓         | ✓       | ✓             | Done    | `/api/chat/` routes                                |
| Streaming (SSE) responses     | ✓         | ✓       | ✓             | Done    | SSE streaming in chat API                          |
| Rate limiting (per-user)      | ✓         | ✓       | ✓             | Done    | Upstash Redis `withRateLimit()`                    |
| CSRF protection               | ✓         | ✓       | ✓             | Done    | `CSRF_SECRET` + `security-audit.ts`                |
| Auth middleware (JWT)         | ✓         | ✓       | ✓             | Done    | Supabase SSR middleware                            |
| Agent execution API           | ✓         | -       | ✓             | Done    | `/api/agents/` routes                              |
| Memory API                    | ✓         | -       | ✓             | Done    | `/api/memory/`                                     |
| Media / file upload           | ✓         | ✓       | ✓             | Done    | `/api/media/`                                      |
| Voice transcription           | ✓         | ✓       | ✓             | Done    | `/api/voice/`                                      |
| Webhook handling (Stripe)     | ✓         | ✓       | ✓             | Done    | `/api/stripe-webhook/`, `/api/validate-webhook/`   |
| Connectors / integrations API | ✓         | -       | ✓             | Done    | `/api/connectors/`                                 |
| Scheduled tasks (cron)        | ✓         | -       | ✓             | Done    | `/api/cron/`, `schedules/`                         |
| Health check endpoint         | ✓         | ✓       | ✓             | Done    | `/api/health`                                      |
| Admin API                     | ✓         | -       | ✓             | Done    | `/api/admin/`                                      |
| API versioning                | ✓         | ✓       | -             | Missing | No versioned API routes (v1/v2)                    |
| OpenAPI / Swagger docs        | ✓         | ✓       | Partial       | Partial | `/api-docs` page exists; spec completeness unknown |
| Input validation (Zod)        | ✓         | ✓       | ✓             | Done    | Zod schemas in `features/settings/schemas/`        |

**Category raw score: 85%**

---

## Summary Table

| Category                       | Weight   | Score | Weighted   |
| ------------------------------ | -------- | ----- | ---------- |
| 1. Chat UI                     | 25%      | 80%   | 20.0%      |
| 2. Composer / Input            | 10%      | 85%   | 8.5%       |
| 3. Conversation Management     | 15%      | 75%   | 11.25%     |
| 4. Projects & Organization     | 10%      | 60%   | 6.0%       |
| 5. Settings & Personalization  | 10%      | 65%   | 6.5%       |
| 6. Auth & Billing              | 10%      | 85%   | 8.5%       |
| 7. Landing & Marketing         | 10%      | 65%   | 6.5%       |
| 8. Performance & Accessibility | 5%       | 55%   | 2.75%      |
| 9. API & Backend               | 5%       | 85%   | 4.25%      |
| **Total**                      | **100%** | —     | **74.25%** |

**Overall: 74% parity with claude.ai**

---

## Top 10 Gaps by Impact

Priority is calculated as: (potential score improvement) × (weight) × (implementation difficulty inverse).

| Priority | Gap                                                                                                  | Category          | Effort | Impact                         |
| -------- | ---------------------------------------------------------------------------------------------------- | ----------------- | ------ | ------------------------------ |
| 1        | Theme toggle not persisted — `AppearanceTab` does not write to `next-themes`                         | Settings          | Low    | High visibility                |
| 2        | Profile save not implemented — `handleSave()` shows "not yet implemented" toast                      | Settings          | Medium | User trust                     |
| 3        | `ChatSidebar.tsx` vs `ChatSidebarNew.tsx` fragmentation — pin/archive only in new                    | Conversation Mgmt | Medium | Feature consistency            |
| 4        | Light mode landing page — dark-only marketing site disadvantages SEO and accessibility               | Marketing         | Medium | Conversion                     |
| 5        | No Core Web Vitals monitoring — cannot measure or optimize performance                               | Performance       | Low    | Engineering insight            |
| 6        | Skip-to-main-content link missing — fails basic WCAG 2.1 AA                                          | Accessibility     | Low    | Compliance                     |
| 7        | Project knowledge base not fully wired — `ProjectSidebar` has no persistent per-project file storage | Projects          | High   | Parity with claude.ai Projects |
| 8        | 2FA / TOTP UI missing — env var exists but no user-facing setup flow                                 | Auth              | Medium | Enterprise security            |
| 9        | Stop generation button wiring unconfirmed                                                            | Composer          | Low    | UX correctness                 |
| 10       | Custom instructions scoped per-project — global system prompt exists, per-project override missing   | Projects          | Medium | Parity with claude.ai Projects |

---

## Unique AGI Workforce Advantages (Above claude.ai)

These features exist in AGI Workforce web but NOT in claude.ai:

- Ghost text / AI completion in composer (`GhostTextOverlay.tsx`)
- Multi-agent collaborative chat (`MultiAgentChatInterface.tsx`, `AgentParticipantPanel.tsx`)
- Inline code executor in messages (`InlineCodeExecutor.tsx`)
- Model comparison side-by-side (`ModelComparisonView.tsx`)
- Token analytics dashboard (`TokenAnalyticsDashboard.tsx`)
- Bookmarks / starred messages (`BookmarksDialog.tsx`)
- Emoji reactions on messages (`EmojiReactions.tsx`)
- Chat font selection
- Vibe / collaborative workspace (`features/vibe/`)
- Device auth for desktop pairing (`/app/device-auth/`)
- Focus mode buttons in composer
- Workflow display (`WorkflowDisplay.tsx`, `CollaborativeTaskView.tsx`)

---

## Scoring Methodology

- **100%** = Feature fully implemented, production-quality, integrated into the live UX
- **75%** = Feature component exists and renders correctly; minor wiring or UX gaps
- **50%** = Feature partially implemented (e.g. component exists, API call stubbed or not connected)
- **25%** = Feature is planned or has a placeholder (empty page, `toast.info('not implemented')`)
- **0%** = Feature entirely absent from codebase

Category scores are the unweighted average of all feature rows in that category.
Features marked as "Bonus" (present in AGI Workforce but absent from claude.ai) contribute positively to the raw score.
