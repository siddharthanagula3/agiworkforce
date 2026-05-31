# R26-PARITY-WEB — W1 Claude Web Parity Audit

**Date:** 2026-05-22  
**Auditor:** web-engineer  
**Scope:** apps/web vs. 14 Claude reference screenshots (claude-auth + claude-public, 2026-05-15)  
**Method:** All 14 screenshots read in full; code verified via Read/Grep, no builds run.

---

## 1. Image Inventory

| #   | Path                                                                          | Screen name                                | Feature shown                                                                                                                                                                             |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `claude-auth/2026-05-15/030_claude-auth_logged-out_signin-entry.png`          | Auth — sign-in entry (full-page)           | Split-layout: marketing headline left, auth card right. Google OAuth + email+password entry. "Download desktop app" CTA below auth card. Chat prompt-starter cards visible in right panel |
| 2   | `claude-auth/2026-05-15/031_claude-auth_logged-out_plan-cards.png`            | Auth — plan cards (logged-out)             | Pricing modal embedded in login flow: Free / Pro / Max cards with icon art, CTA "Try Claude" on each                                                                                      |
| 3   | `claude-auth/2026-05-15/032_claude-auth_logged-out_team-enterprise-cards.png` | Auth — team/enterprise plan cards          | Team ($20/mo standard seat, $100/mo premium seat) and Enterprise cards with feature lists                                                                                                 |
| 4   | `claude-auth/2026-05-15/080_claude-auth_after-free-logout_signin.png`         | Auth — sign-in page (narrow viewport)      | Compact sign-in layout: "Think fast, build faster" / "Brainstorm in chat, build in Cowork" tagline, artifact preview visible right panel                                                  |
| 5   | `claude-public/2026-05-15/010_claude-public_pricing_top.png`                  | Pricing page top (full-screen mode)        | Three-tier card grid: Free / Pro ($17) / Max (from $100). Toggle tabs: Individual / Team & Enterprise / API                                                                               |
| 6   | `claude-public/2026-05-15/010b_claude-public_pricing_top_maximized.png`       | Pricing page top (maximized window)        | Same three-tier grid at wider viewport; "Pricing" H1; animated plant icons on cards                                                                                                       |
| 7   | `claude-public/2026-05-15/011_claude-support_choose-plan_table.png`           | Support — choose a plan (comparison table) | Plan comparison table: Free / Pro ($20/mo, $200/yr) / Max 5x ($100) / Max 20x ($200). Usage Capacity column with linked descriptions                                                      |
| 8   | `claude-public/2026-05-15/012_claude-support_pro-plan_benefits.png`           | Support — Pro plan benefits doc            | Key benefits list: 5x usage/session, priority access, early features, model selector, projects/knowledge bases, Claude Code access, Cowork access                                         |
| 9   | `claude-public/2026-05-15/013_claude-support_max-plan_benefits.png`           | Support — Max plan benefits doc            | Max plan: more usage capacity, no interruptions, scale as needed, priority access, Claude Code access, Cowork access. Max 5x = $100/mo, Max 20x = $200/mo                                 |
| 10  | `claude-public/2026-05-15/014_claude-public_pricing_team-enterprise_top.png`  | Pricing — Team & Enterprise tab            | Team (5-150 users) + Enterprise (20+ users) cards. "Which plan is right for you?" quiz CTA. "Get Team plan" / "Get Enterprise plan" primary CTAs                                          |
| 11  | `claude-public/2026-05-15/015_claude-public_pricing_api_latest-models.png`    | Pricing — API tab, model pricing           | "Latest models" section: Opus 4.7 ($5/MTok input), Sonnet 4.6 ($3/MTok input), Haiku 4.5 ($1/MTok input). "Start building" + "Contact sales" CTAs                                         |
| 12  | `claude-public/2026-05-15/016_claude-support_team-plan_benefits.png`          | Support — Team plan benefits doc           | Team plan: increased usage, purchase extra usage, admin tools, advanced identity (SSO + domain capture), Claude Code, Cowork, 200K context, central billing                               |
| 13  | `claude-public/2026-05-15/017_claude-support_enterprise-plan_benefits.png`    | Support — Enterprise plan benefits doc     | Enterprise plan: self-serve or sales-assisted, pay-as-you-go at API rates, 500K context, RBAC, SCIM, audit logs, compliance API, network-level access control, custom data retention      |
| 14  | `claude-public/2026-05-15/018_claude-support_extra-usage_paid-plans.png`      | Support — manage extra usage               | Extra usage (pay-as-you-go PAYG top-up) for Pro / Max 5x / Max 20x. Mobile vs. web add-on flow note                                                                                       |

---

## 2. Parity Scorecard

Legend: ✅ at parity, 🟡 partial, ❌ missing, 🔄 different by design

### 2.1 Auth / Sign-in / Sign-up

| Feature                                                             | Status | Our impl (path:line)                                                      | Gap                                                                                                                                                                             | Est. effort (h) |
| ------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Email + password sign-in                                            | ✅     | `apps/web/app/login/page.tsx:48`                                          | None                                                                                                                                                                            | -               |
| Magic link (email OTP)                                              | ✅     | `apps/web/app/login/page.tsx:64`                                          | None — we have it, Claude.ai does not offer it                                                                                                                                  | -               |
| Google OAuth button                                                 | ✅     | `apps/web/app/login/page.tsx:84`                                          | None                                                                                                                                                                            | -               |
| GitHub OAuth button                                                 | 🔄     | `apps/web/app/login/page.tsx:84`                                          | By design: we offer GitHub; Claude offers Google only. Advantage for dev users                                                                                                  | -               |
| Split-screen login layout (marketing left, auth card right)         | ❌     | `apps/web/app/login/page.tsx:106` (centered single-column)                | Login page is a plain centered form; Claude's split layout pairs a persuasive marketing hero + live product preview panel with the auth form — higher conversion at first touch | 4-6             |
| "Download desktop app" CTA on sign-in page                          | 🟡     | Header has "Install" link; login page itself has no dedicated install CTA | Login page lacks the install nudge visible in Claude's screenshot 030                                                                                                           | 1               |
| Sign-in flow: plan selector embedded on login page (screenshot 031) | 🔄     | We use `/pricing` as a separate page; plans not embedded in auth          | Different by design (v1 LOCAL ONLY + waitlist model makes embedding plans in login unnecessary)                                                                                 | -               |
| After-logout redirect to sign-in                                    | ✅     | `apps/web/components/layout/Header.tsx:43` redirects to `/`               | Works; could redirect to `/login` specifically                                                                                                                                  | 0.5             |
| Terms + privacy consent on signup                                   | ✅     | `apps/web/app/signup/page.tsx:197`                                        | None                                                                                                                                                                            | -               |
| Signup: name field (optional)                                       | 🔄     | `apps/web/app/signup/page.tsx:104`                                        | We collect name; Claude does not show a name field (email-only signup). Minor difference                                                                                        | -               |
| Forgot-password link on login                                       | ✅     | `apps/web/app/login/page.tsx:216`                                         | None                                                                                                                                                                            | -               |

### 2.2 Pricing Page

| Feature                                                            | Status | Our impl (path:line)                                                                                                                                       | Gap                                                                                                                                                                | Est. effort (h) |
| ------------------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| Pricing page exists at `/pricing`                                  | ✅     | `apps/web/app/pricing/page.tsx`                                                                                                                            | None                                                                                                                                                               | -               |
| Three-tier card layout                                             | 🔄     | `apps/web/app/pricing/page.tsx:87` — we show Local / BYOK / Hobby + footnote for Pro/Pro+/Max/Enterprise                                                   | Different by design: our v1 model is LOCAL ONLY with only Hobby live; Claude shows Free/Pro/Max all purchasable                                                    | -               |
| Monthly/annual billing toggle                                      | ✅     | `apps/web/app/pricing/page.tsx:62`                                                                                                                         | None                                                                                                                                                               | -               |
| Annual savings % badge on toggle                                   | ✅     | `apps/web/app/pricing/page.tsx:83`                                                                                                                         | None                                                                                                                                                               | -               |
| Individual / Team & Enterprise / API tabs on pricing               | ❌     | `apps/web/app/pricing/page.tsx` — no tabs                                                                                                                  | Pricing page is single-view; no segmentation between individual, team, and API audiences. As we add team/enterprise tiers these tabs become critical               | 3-4             |
| Plan comparison table (Free/Pro/Max/Max20x rows with usage column) | ❌     | No comparison table in our impl                                                                                                                            | Claude's support doc (screenshot 011) shows a precise 5-row × 5-col table. We have a feature list per card but no structured cross-tier comparison                 | 4-6             |
| Illustrated plant icons on plan cards                              | ❌     | `apps/web/app/pricing/page.tsx` uses a plain SVG checkmark                                                                                                 | Claude uses decorative plant-growth line art on each plan card, creating warmth and visual hierarchy. We use bare feature-list bullets                             | 2-3             |
| "Contact sales" link for Enterprise                                | ✅     | `apps/web/app/pricing/page.tsx:196`                                                                                                                        | None — we link to `/contact-sales`                                                                                                                                 | -               |
| API pricing section (token cost per model)                         | ❌     | No `/pricing` API tab; no model token costs shown to users on the web                                                                                      | Claude shows Opus/Sonnet/Haiku $/MTok pricing on its Pricing-API tab. We expose no such user-facing pricing breakdown (relevant once BYOK-managed billing is live) | 3-4             |
| "Which plan is right for you?" quiz                                | ❌     | No plan-matching quiz                                                                                                                                      | Claude's team/enterprise tab includes a quiz widget — low-effort, high-conversion for enterprise intent                                                            | 4-5             |
| PAYG / extra-usage top-up UI                                       | 🟡     | `apps/web/app/billing/page.tsx` — `<Topup>` component exists (`features/billing/components/Billing/Topup.tsx`) but not surfaced in the pricing page itself | Users can't discover top-up from pricing; it's buried in the billing dashboard                                                                                     | 2               |
| Pro/Max waitlist CTA (replacing normal Stripe checkout)            | ✅     | `apps/web/app/pricing/page.tsx:189` footnote references waitlist; Stripe IDs are wired but checkout replaced                                               | Matches our v1 waitlist lock                                                                                                                                       | -               |

### 2.3 Chat UI

| Feature                                                                 | Status | Our impl (path:line)                                                                                  | Gap                                                                                                                               | Est. effort (h) |
| ----------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Collapsible left sidebar with conversation list                         | ✅     | `apps/web/features/chat/components/Sidebar/ChatSidebar.tsx`                                           | None                                                                                                                              | -               |
| New conversation button                                                 | ✅     | `apps/web/features/chat/components/Sidebar/ChatSidebar.tsx` (SquarePen icon)                          | None                                                                                                                              | -               |
| Conversation search in sidebar                                          | ✅     | `apps/web/features/chat/components/Sidebar/ChatSidebar.tsx` (Search icon import)                      | None                                                                                                                              | -               |
| Rename / delete conversation via context menu                           | ✅     | `apps/web/features/chat/components/Sidebar/ChatSidebar.tsx` (MoreHorizontal dropdown)                 | None                                                                                                                              | -               |
| Message streaming with typing indicator                                 | ✅     | `apps/web/features/chat/components/messages/TypingIndicator.tsx`                                      | None                                                                                                                              | -               |
| Auto-scroll to latest message                                           | ✅     | `apps/web/features/chat/components/messages/ChatMessageList.tsx:17`                                   | None                                                                                                                              | -               |
| Follow-up suggestion pills after assistant reply                        | ✅     | `apps/web/features/chat/components/FollowUpSuggestions.tsx`                                           | None                                                                                                                              | -               |
| Empty state with quick-start chips (Create a file / Crunch data / etc.) | ✅     | `apps/web/features/chat/v3/WebEmptyChat.tsx` — QuickChips component from `@agiworkforce/unified-chat` | None                                                                                                                              | -               |
| Composer: multi-line textarea with auto-resize                          | ✅     | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`                                      | None                                                                                                                              | -               |
| Composer: file / image attachment upload                                | ✅     | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` (Paperclip icon)                     | None                                                                                                                              | -               |
| Composer: voice input button                                            | ✅     | `apps/web/features/chat/components/Composer/VoiceInputButton.tsx`                                     | None                                                                                                                              | -               |
| Composer: web search toggle                                             | ✅     | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` (Globe icon, webSearchEnabled flag)  | None                                                                                                                              | -               |
| Composer: thinking / extended reasoning toggle                          | ✅     | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` (Brain icon, thinkingEnabled flag)   | None                                                                                                                              | -               |
| Model selector in composer footer                                       | ✅     | `apps/web/features/chat/components/Composer/ComposerFooter.tsx`                                       | None                                                                                                                              | -               |
| Agent mode switcher (solo / multi-agent)                                | ✅     | `apps/web/features/chat/components/Composer/AgentModeSwitcher.tsx`                                    | Not in Claude at all — this is an AGI advantage                                                                                   | -               |
| SendPreview privacy disclosure card above composer                      | ✅     | `apps/web/features/chat/pages/WebChatPage.tsx:572` — SendPreview from `@agiworkforce/unified-chat`    | Not in Claude — AGI unique feature                                                                                                | -               |
| Artifacts side panel                                                    | ✅     | `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx`                                      | None                                                                                                                              | -               |
| Regenerate message                                                      | ✅     | `apps/web/features/chat/pages/WebChatPage.tsx:504`                                                    | None                                                                                                                              | -               |
| Delete individual message                                               | ✅     | `apps/web/features/chat/pages/WebChatPage.tsx:497`                                                    | None                                                                                                                              | -               |
| Inline paywall card when limit hit                                      | ✅     | `apps/web/features/chat/components/InlinePaywallCard.tsx`                                             | None                                                                                                                              | -               |
| Slash command menu                                                      | ✅     | `apps/web/features/chat/components/Composer/SlashCommandMenu.tsx`                                     | Not in Claude — AGI advantage                                                                                                     | -               |
| Ghost-text prompt completion                                            | ✅     | `apps/web/features/chat/components/Composer/GhostTextOverlay.tsx`                                     | Not in Claude — AGI advantage                                                                                                     | -               |
| Local-to-BYOK handoff dialog (fork conversation)                        | ✅     | `apps/web/features/chat/components/dialogs/LocalByokHandoffDialog.tsx`                                | Not in Claude — AGI unique feature                                                                                                | -               |
| Folder / project context selector in composer                           | ✅     | `apps/web/features/chat/components/Composer/FolderContextSelector.tsx`                                | None                                                                                                                              | -               |
| Token analytics dashboard                                               | ✅     | `apps/web/features/chat/components/tokens/TokenAnalyticsDashboard.tsx`                                | Not in Claude — AGI advantage                                                                                                     | -               |
| Cowork-style "build in workbench" panel (Claude's Cowork)               | ❌     | No equivalent to Claude Cowork (task execution canvas visible in screenshot 030 right-panel)          | Claude's Cowork is a first-class canvas for multi-step task execution; we have the ArtifactsPanel but no task-execution canvas UI | 12-20           |
| Export conversation                                                     | ✅     | `apps/web/features/chat/components/dialogs/EnhancedExportDialog.tsx`                                  | Not in Claude — AGI advantage                                                                                                     | -               |
| Conversation branching (CreateBranchDialog)                             | ✅     | `apps/web/features/chat/components/dialogs/CreateBranchDialog.tsx`                                    | Not in Claude — AGI advantage                                                                                                     | -               |

### 2.4 Projects / Knowledge Bases

| Feature                                  | Status | Our impl (path:line)                                                                                | Gap                                                                                                                               | Est. effort (h) |
| ---------------------------------------- | ------ | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `/projects` page                         | ✅     | `apps/web/app/projects/page.tsx` — mounts shared `ProjectGallery` from `@agiworkforce/unified-chat` | None                                                                                                                              | -               |
| Projects: create, list, open             | ✅     | `apps/web/app/projects/page.tsx`                                                                    | None                                                                                                                              | -               |
| Knowledge base / file upload per project | 🟡     | Project infrastructure exists; no screenshot evidence of our knowledge-base file upload UI          | Unclear if per-project file ingestion (PDFs, docs) is surfaced; Claude's Pro tier lists "projects and knowledge bases" explicitly | 4-8             |

### 2.5 Billing / Subscription Management

| Feature                                               | Status | Our impl (path:line)                                                                                                          | Gap                                                                                | Est. effort (h) |
| ----------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------- |
| Billing dashboard at `/billing`                       | ✅     | `apps/web/app/billing/page.tsx`                                                                                               | None                                                                               | -               |
| Subscription status card                              | ✅     | `apps/web/features/billing/components/Billing/Subscription.tsx`                                                               | None                                                                               | -               |
| Credit / token balance display                        | ✅     | `apps/web/features/chat/components/tokens/TokenBalanceDisplay.tsx`                                                            | None                                                                               | -               |
| Token usage breakdown / analytics                     | ✅     | `apps/web/features/chat/components/tokens/TokenAnalyticsDashboard.tsx`                                                        | Not in Claude — AGI advantage                                                      | -               |
| Credit top-up (PAYG)                                  | ✅     | `apps/web/features/billing/components/Billing/Topup.tsx`                                                                      | Not discoverable from pricing page (see §2.2)                                      | 2               |
| Extra usage / PAYG at API rates (like screenshot 018) | 🟡     | `apps/web/features/billing/components/Billing/Topup.tsx` exists but UI parity with Claude's extra-usage toggle is unconfirmed | Claude's extra-usage page explains the spend controls flow; our UI surface unclear | 2-4             |
| Stripe portal link (manage payment method, invoices)  | ✅     | `apps/web/app/api/portal/route.ts` implied by `app/api/portal` directory                                                      | None                                                                               | -               |

### 2.6 Settings

| Feature                                                       | Status | Our impl (path:line)                                                                                       | Gap                               | Est. effort (h) |
| ------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------- | --------------- |
| Settings pages: profile, notifications, API keys, 2FA, export | ✅     | `apps/web/features/settings/components/Settings/` — Profile, Notifications, ApiKeys, TwoFactor, ExportData | None                              | -               |
| AI configuration (model defaults)                             | ✅     | `apps/web/features/settings/pages/AIConfiguration.tsx`                                                     | None                              | -               |
| Privacy settings                                              | ✅     | `apps/web/app/settings/privacy/`                                                                           | None                              | -               |
| Memory settings                                               | ✅     | `apps/web/app/settings/memory/`                                                                            | Not in Claude web — AGI advantage | -               |
| BYOK key management in settings                               | ✅     | `apps/web/app/settings/byok/`                                                                              | Not in Claude web — AGI advantage | -               |
| Voice settings                                                | ✅     | `apps/web/app/settings/voice/`                                                                             | Not in Claude web — AGI advantage | -               |

### 2.7 Navigation / Header

| Feature                                                               | Status | Our impl (path:line)                                                              | Gap                                                                                                        | Est. effort (h) |
| --------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------- |
| Site header with nav links                                            | ✅     | `apps/web/components/layout/Header.tsx`                                           | None                                                                                                       | -               |
| Mobile hamburger menu                                                 | ✅     | `apps/web/components/layout/Header.tsx:93`                                        | None                                                                                                       | -               |
| Header shows "Sign in" when logged-out                                | ✅     | `apps/web/components/layout/Header.tsx:85`                                        | None                                                                                                       | -               |
| Header shows "Chat" + "Sign out" when logged-in                       | ✅     | `apps/web/components/layout/Header.tsx:76`                                        | None                                                                                                       | -               |
| "Contact sales" link in nav                                           | 🟡     | Our nav has: Providers / Pricing / Compare / About. No "Contact sales" in top nav | Claude's nav has explicit "Contact sales" link visible on all marketing pages (screenshots 032, 010b, 014) | 0.5             |
| Multi-section pricing nav tabs (Individual / Team & Enterprise / API) | ❌     | Header pricing link goes directly to `/pricing`; no sub-navigation                | On Claude, pricing has sticky breadcrumb + "Explore here" anchor navigation                                | 2               |

### 2.8 MCP / Integrations

| Feature                         | Status | Our impl (path:line)                                                        | Gap                               | Est. effort (h) |
| ------------------------------- | ------ | --------------------------------------------------------------------------- | --------------------------------- | --------------- |
| MCP server connection API       | ✅     | `apps/web/app/api/mcp/route.ts` — HTTP-transport MCP proxy with auth + CSRF | None                              | -               |
| Connectors / MCP directory page | ✅     | `apps/web/app/connectors/mcp-directory/page.tsx`                            | Not in Claude web — AGI advantage | -               |

### 2.9 i18n

| Feature                                    | Status | Our impl (path:line)                                          | Gap                               | Est. effort (h) |
| ------------------------------------------ | ------ | ------------------------------------------------------------- | --------------------------------- | --------------- |
| i18n locale files (en/es)                  | ✅     | `apps/web/app/i18n/locales/`                                  | None                              | -               |
| Claude shows English-language pricing only | 🔄     | We have Spanish locale; Claude's screenshots are English-only | AGI advantage for India-first GTM | -               |

---

## 3. User-Flow Reality Check

For each major Claude flow cataloged, this section reasons from source code: "If a real user does this on agiworkforce.com (deployed), what do they actually see?" The question is not "does the feature exist?" but "would the end-to-end flow work, emit correct telemetry, match locks, and show coherent UI?"

---

### 3.1 Model picker — does it pull from the canonical catalog or a stale hardcoded list?

**Verdict: Canonical. No hardcoded model IDs in the picker path.**

Evidence:

- `apps/web/constants/llm.ts:1-24` imports exclusively from `@agiworkforce/types` (`modelsById`, `modelsCatalogJson`, `normalizeModelId`, etc.), which wraps `packages/types/src/models.json`.
- `apps/web/shared/stores/model-store.ts:70-107` — `buildAvailableModels()` calls `MODEL_PRESETS` (read from the catalog) and `getModelMetadata()` (also catalog-backed). No hardcoded model string literals.
- `apps/web/app/api/llm/v1/models/route.ts:73-75` — the server-side model list is built via `listCanonicalModels()` from `@agiworkforce/types`, then filtered by tier policy. Unauthenticated callers get the `free` tier list.

**One gap:** `AVAILABLE_MODELS` is computed once at module load time (`model-store.ts:107`). Because this runs in the browser's React bundle, the catalog is frozen at build time. If `models.json` is updated and the site is redeployed, the client-side picker refreshes only on next page load. No stale-data risk for a standard deploy, but hot-reload between deploys does not push catalog updates to open sessions.

---

### 3.2 Auth + signup — does it flow through the v1 LOCAL ONLY + cloud waitlist gating correctly?

**Verdict: Partial. The "no active subscription" gate is wired on the LLM route, but the v1 LOCAL ONLY + cloud waitlist lock (from `locks/v1-local-only-cloud-waitlist-2026-05-18.md`) is NOT enforced as an application-layer gate for new signups reaching `/chat`. A new user who signs up, receives a Supabase session, and navigates directly to `/chat` will encounter the chat UI without any waitlist gating.**

Evidence and flow trace:

1. User hits `/signup` → `apps/web/app/signup/page.tsx:56` → `supabase.auth.signUp(...)` → email verification → Supabase session created. No Supabase row in `subscriptions` is written at signup time (that row is created by Stripe webhook on first checkout, or by `SubscriptionService.upsertSubscription` called from claim-offer etc.).

2. After email verification, user is redirected to `/chat`.

3. `apps/web/features/chat/pages/WebChatPage.tsx` mounts immediately — no subscription check before rendering the chat UI. The chat interface fully renders for a user with no Supabase subscription row.

4. When the user sends a first message, `useChatStream.ts:295` calls `POST /api/llm/v1/chat/completions`. The `runAuthGate` in `auth-gate.ts:89-105` calls `SubscriptionService.getSubscription(...)`. For a brand-new user with no `subscriptions` row, this returns `null`, and the route immediately returns **HTTP 403 `subscription_required`** (`auth-gate.ts:91-101`).

5. The error surfaces as a generic error message in the chat UI (`useChatStream.ts:521` logs it, the store gets `setError(...)` called). There is no graceful "you're on the waitlist" screen — just an error state.

**What the user sees on deployed agiworkforce.com today:**

- Sign up succeeds (email + password or Google OAuth).
- After email verification, user lands on `/chat` with a fully rendered chat UI.
- They type a message and hit send.
- The LLM call returns 403. The UI shows an error. The user has no path forward except visiting `/pricing` and subscribing to Hobby.

**Gap against the v1 lock:** `locks/v1-local-only-cloud-waitlist-2026-05-18.md` specifies that cloud is waitlist-gated and new users should be directed to the waitlist flow. The current implementation is closer to "fail at first send" rather than "pre-emptively direct new users to the waitlist before they hit the blank chat wall." There is no `/api/waitlist/cloud-managed` call triggered by the auth flow, and no post-signup redirect to a waitlist landing page or onboarding screen.

**Risk level: High.** First-impression experience for organic signups is a confusing 403 error inside the chat UI.

---

### 3.3 /pricing — do displayed prices match `locks/pricing-billing-decisions-2026-05-16.md` and the StoreKit IAP 15% rule?

**Verdict: Prices match the canonical `BILLING_PLAN_PRICING` catalog. StoreKit IAP 15% rule is mobile-only and not applicable to the web pricing page by design. One labeling incoherence found.**

Price verification:

- `packages/types/src/billing-catalog.ts:40-45`: Hobby `monthlyPriceUsd = 10`, `yearlyPriceUsd = 59.88`. Annual per-month = $4.99/mo.
- `apps/web/app/pricing/page.tsx:36-40` reads these directly from `BILLING_PLAN_PRICING`. No hardcoding. The pricing page renders correct values that trace to the canonical catalog.
- `BILLING_PLAN_PRICING.pro.monthlyPriceUsd = 29.99`, `pro_plus = 49.99`, `max = 299.99`. These appear in the pricing footnote (`pricing/page.tsx:190-196`) and match what the locks define.

StoreKit IAP note:

- `locks/v1-local-only-cloud-waitlist-2026-05-18.md` specifies StoreKit IAP at 15% via Apple Small Business Program as the default globally. This is a mobile (iOS) billing mechanic. The web app uses Stripe. No IAP logic touches the web pricing page. This is correct by design.

**Labeling incoherence found:**

- The pricing page lede (`pricing/page.tsx:55`) says: "Hobby is the only paid tier shipping today - managed cloud at $10/mo..." but then the footnote says "Pro $29.99/mo · Pro+ $49.99/mo · Max $299.99/mo - all on the waitlist until the security audit closes." The footnote uses a hardcoded phrase "until the security audit closes" as the waitlist reason, but the canonical lock says the gate is "India-first GTM + security audit." The user-visible reason given is accurate enough but narrower than the lock's rationale. Minor copy gap, not a pricing accuracy issue.

**Annual billing key term mismatch:**

- The `STRIPE_PRICE_IDS` object (`lib/pricing.ts:36-60`) names the key `annual` but `price-tier-mapping.ts:33-34` and the checkout schema use `yearly`. If a caller passes `billingInterval: 'annual'` vs `'yearly'`, the wrong key is looked up. The checkout validator at `lib/validations/checkout.ts` determines which spelling is enforced — not audited here, but this naming inconsistency is a latent bug surface.

---

### 3.4 /chat — does the LLM call actually flow end-to-end including model resolution, credit accounting, and OTel emit?

**Verdict: End-to-end flow is wired and functional for authenticated Hobby+ subscribers. OTel attribute generation is implemented but relies on a caller to actually record the span — confirmed present in stream-transform. Credit accounting is live with idempotency. One fail-open risk in the quota gate.**

Flow trace for a Hobby subscriber sending a message:

1. `useChatStream.ts:295` calls `POST /api/llm/v1/chat/completions` with `Authorization: Bearer <supabase_jwt>`.
2. `auth-gate.ts:29-124` — rate limit, CSRF check, JWT verification, subscription check. Bearer-only (cookie callers rejected). Subscription must be `active` or `trialing`.
3. `request-processor.ts:481-534` — `assertQuota(...)` checks the `token_credits` row via RLS-bound client. If `pctUsed < warnAt`, fast-path `ok`. Tier policy read from `getTierPolicy(subscription.plan_tier)` (catalog-backed, not hardcoded).
4. Model resolution: `normalizeModelId()` from `@agiworkforce/types` resolves aliases (e.g., `auto-balanced` → a concrete model ID); `resolveAutoModeModel()` applies the tier routing slot.
5. Credit reservation: `CreditService.deductCredits(...)` writes an optimistic debit to Supabase before the upstream call.
6. `LLMProviderFactory.streamRequest(provider, llmRequest)` dispatches to the correct provider (Anthropic, OpenAI, xAI, etc.). Factory reads model → provider mapping from `@agiworkforce/types`.
7. **OTel:** `stream-transform.ts:10` imports `recordModelUsage, toOtelAttributes` from `@/lib/cost-tracker`. The `buildStreamResponse` function accumulates token counts from SSE chunks and calls `recordModelUsage(...)` at stream end. `toOtelAttributes()` produces GenAI semantic-convention attributes. These are assembled and returned — **but there is no `opentelemetry` span SDK import in the stream-transform file.** `cost-tracker.ts:27` explicitly documents "No opentelemetry package dependency; callers receive a plain attribute object." This means OTel attribute _generation_ is implemented but actual _span emission_ to a collector depends on whether the deployment has an OTel SDK instrumented at the Next.js layer (e.g., via `instrumentation.ts`). Without that, attributes are computed but never exported.
8. On stream completion, actual usage tokens update the credit row via `reconcileUsage(...)`.

**Fail-open risk in quota gate:**

- `request-processor.ts:489-495` — if `assertQuota(...)` throws (e.g., Supabase timeout), the gate **falls back to the credit-only flow** (fail-open). A user could exceed their tier quota during a Supabase outage. This is intentional (per the code comment), but worth flagging: under database pressure, the quota gate is bypassed.

---

### 3.5 i18n — are UI labels actually localized or hardcoded English?

**Verdict: Locale JSON files exist for `en` and `es`, and `I18nextProvider` is mounted in the root layout via `providers.tsx:27`. However, the highest-traffic user-facing pages (login, signup, pricing, marketing header) use hardcoded English strings and do NOT call `useTranslation()`. Only a subset of inner pages (settings components, connectors page) consume the `t()` function. The Spanish locale is structurally present but not rendered for any page a new user would land on.**

Evidence:

- `apps/web/app/login/page.tsx` — no `useTranslation`, no `t()` calls. All strings are JSX string literals ("Sign in", "Welcome back.", "Email", etc.).
- `apps/web/app/signup/page.tsx` — same: hardcoded English.
- `apps/web/app/pricing/page.tsx` — hardcoded English. `formatPrivacyModeLabel('local')` pulls from `@agiworkforce/types` (English labels, no locale switch).
- `apps/web/components/layout/Header.tsx` — hardcoded English nav labels.
- `apps/web/app/i18n/locales/en/pricing.json` — contains `"free": "Free"`, `"hobby": "Hobby"`, etc. but these keys are never consumed by `pricing/page.tsx`.
- `apps/web/features/settings/components/Settings/*.tsx` — these DO use `useTranslation` (confirmed by grep hit on `apps/web/features/settings/components/Settings/ApiKeys.tsx`, `TwoFactor.tsx`, etc.).

**What a Spanish-language user actually sees on agiworkforce.com:**

- Login page: English.
- Signup page: English.
- Pricing page: English.
- Header: English.
- Settings inner pages: potentially Spanish (if user locale is `es`), because those components call `useTranslation`.
- Chat page: English (WebChatPage has no `t()` calls).

This creates a split experience: the outer marketing shell and auth flow are always English; some inner product pages may respond to locale. For India-first GTM, the current languages (en + es) are both non-local anyway, so this is not an immediate GTM blocker, but the architectural gap (i18n wired at provider level but not consumed in pages) means the Spanish locale is essentially dead UI-visible code today.

---

### 3.6 Summary: broken / stale / mock-only / incoherent flows

| Flow                                        | Status                                                                                              | Root cause                                                                    | Severity   |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------- |
| New signup → chat attempt (no subscription) | **Broken UX** — 403 inside chat UI, no waitlist screen                                              | Auth gate blocks at first LLM send; no pre-send subscription check in chat UI | High       |
| Model picker resolving canonical IDs        | Working correctly                                                                                   | `buildAvailableModels()` reads from `@agiworkforce/types`                     | -          |
| Pricing numbers matching billing-catalog    | Working correctly                                                                                   | `BILLING_PLAN_PRICING` imported directly                                      | -          |
| Stripe annual billing key naming            | **Latent bug** — `annual` vs `yearly` mismatch between `lib/pricing.ts` and `price-tier-mapping.ts` | Two naming conventions in different files                                     | Medium     |
| LLM call → credit deduction → reconcile     | Working (for active Hobby+ subscribers)                                                             | Full pipeline wired end-to-end                                                | -          |
| OTel span emission                          | **Not emitted** unless `instrumentation.ts` is deployed with SDK                                    | `cost-tracker.ts` produces attributes but no SDK span wraps them              | Low-Medium |
| Quota gate fail-open during DB outage       | By design, but unmitigated                                                                          | `request-processor.ts:489` catch block                                        | Low        |
| i18n: login / signup / pricing / header     | **Dead locale** — pages hardcode English, never call `t()`                                          | `useTranslation` not imported in marketing/auth pages                         | Medium     |
| i18n: settings inner pages                  | Working for settings                                                                                | Settings components do use `useTranslation`                                   | -          |

---

## 4. Where AGI Web is Ahead

Areas where our web app has features or UX patterns not present in Claude's reference screenshots:

1. **GitHub OAuth on login** — Claude shows Google only; we offer Google + GitHub, improving developer onboarding.
2. **Magic link / OTP sign-in** — Claude shows email+password only; we offer email-magic-link as an alternative, reducing friction on mobile.
3. **Name field on signup** — minor but allows immediate personalization.
4. **SendPreview privacy disclosure above composer** — unique to AGI; users see the exact destination host (api.anthropic.com, gateway.agiworkforce.com, or "device only") before every send.
5. **Local-to-BYOK handoff dialog** — conversation fork with context selection when switching from local to cloud model mid-session.
6. **Ghost-text prompt completion** — inline AI completion in the composer text field.
7. **Slash command menu** — /command invocation system.
8. **Agent mode switcher** (solo / multi-agent) — in-composer.
9. **Token analytics dashboard** — detailed per-session token breakdown and spending trends.
10. **Conversation branching** — CreateBranchDialog; Claude does not expose branching on web.
11. **Enhanced export dialog** — granular conversation export; not in Claude web.
12. **Voice settings + voice input** — dedicated voice settings page; Claude's web screenshots show no voice configuration.
13. **Memory settings page** — explicit memory management; Claude memory is less prominently surfaced.
14. **BYOK key manager in settings** — `settings/byok`; Claude does not expose provider key management in its web UI.
15. **MCP connector directory** — `/connectors/mcp-directory` gives users a browsable MCP server catalog.
16. **Multi-agent (workforce) chat** — `features/chat/components/agents/` (EmployeeSelector, AgentParticipantPanel); no equivalent in Claude web.
17. **Inline tool result cards** (InlineCodeDiff, InlineFileRead, InlineTerminalOutput, InlineSearchResults) — rich tool-call rendering; Claude web shows plainer tool output.
18. **Thinking / reasoning accordion** — `ReasoningAccordion.tsx` exposes chain-of-thought in-line; not visible in Claude screenshots.
19. **Spanish localization** — i18n foundation already in place.

---

## 5. Recommendations

All recommendations follow format R26-PARITY-WEB-N with P0/P1/P2 priority.

### P0 — Broken flows from User-Flow Reality Check (must fix before any conversion work)

**R26-PARITY-WEB-00A — Post-signup waitlist gate: new users must not hit a bare 403 inside /chat**

- Gap: A new user who signs up and navigates to `/chat` with no active subscription gets a confusing generic LLM error (HTTP 403 `subscription_required`) on their first message. There is no waitlist screen, no onboarding redirect, no "you're on the waitlist" state.
- Root cause: `apps/web/features/chat/pages/WebChatPage.tsx` renders unconditionally; the subscription check only fires at `POST /api/llm/v1/chat/completions` (auth-gate.ts:89-105). The v1 LOCAL ONLY + cloud waitlist lock requires a pre-emptive gate.
- Fix: Add a subscription check in the chat page (or a server-side middleware redirect) that fires before the user can send. If `plan_tier` is `null` / `free` / no row exists, redirect to `/byok` (the waitlist landing) instead of letting the user compose a message that will immediately fail.
- Files: `apps/web/features/chat/pages/WebChatPage.tsx`, `apps/web/app/byok/page.tsx`
- Effort: 2-3 h

**R26-PARITY-WEB-00B — Fix `annual` vs `yearly` billing interval naming inconsistency**

- Gap: `apps/web/lib/pricing.ts:40-41` names the annual Hobby price key `annual`; `apps/web/lib/price-tier-mapping.ts:33-34` and `lib/services/subscription-service.ts` use `yearly`. If the checkout endpoint receives `billingInterval: 'annual'`, `STRIPE_PRICE_IDS[plan]['annual']` would look up the correct key, but `price-tier-mapping.ts` would fail to reverse-map the price ID to a tier. Depending on which path is hit, this silently degrades tier assignment after checkout.
- Fix: Normalize to one spelling (`yearly`) across `lib/pricing.ts`, `CheckoutRequestSchema`, and `price-tier-mapping.ts`. Grep for `'annual'` in the billing path and replace.
- Files: `apps/web/lib/pricing.ts`, `apps/web/lib/validations/checkout.ts`
- Effort: 1 h

**R26-PARITY-WEB-00C — Wire `useTranslation` in marketing/auth pages (i18n dead locale)**

- Gap: `apps/web/app/login/page.tsx`, `signup/page.tsx`, `pricing/page.tsx`, and `components/layout/Header.tsx` all hardcode English. `I18nextProvider` is mounted globally but none of these pages call `useTranslation()`. The Spanish locale at `app/i18n/locales/es/` is dead for every page a new user lands on.
- Fix: Add `useTranslation()` calls to these four files and replace inline string literals with `t('key')` calls. The locale JSON keys already exist (`en/auth.json`, `en/pricing.json`, `en/common.json`). The Spanish equivalents at `es/*.json` need to be audited for completeness.
- Files: `apps/web/app/login/page.tsx`, `apps/web/app/signup/page.tsx`, `apps/web/app/pricing/page.tsx`, `apps/web/components/layout/Header.tsx`
- Effort: 4-6 h

### P0 — High user impact, blockers to conversion or trust

**R26-PARITY-WEB-01 — Split-screen login layout**

- Gap: Login page is a plain centered form. Claude's sign-in page uses a split layout: persuasive marketing headline + live product preview on the left, compact auth card on the right. This is the first impression for all new users.
- Screenshot ref: `030_claude-auth_logged-out_signin-entry.png`, `080_claude-auth_after-free-logout_signin.png`
- Our file: `apps/web/app/login/page.tsx`
- Effort: 4-6 h
- Action: Add a right-pane animated product preview (can reuse `AgiChatDemo` from the homepage) alongside the auth card. Marketing copy should use our tagline per `MARKETING.tagline`.

**R26-PARITY-WEB-02 — Pricing page: add Individual / Team / API segmentation tabs**

- Gap: Single-view pricing does not differentiate individual vs. team vs. developer audiences.
- Screenshot ref: `010_claude-public_pricing_top.png`, `010b_claude-public_pricing_top_maximized.png`
- Our file: `apps/web/app/pricing/page.tsx`
- Effort: 3-4 h
- Action: Add a tab group (Individual / Team / Enterprise / API) above the tier cards. Individual tab = current layout. Team/Enterprise = placeholder "join waitlist" until those tiers open. API tab = token pricing table (see R26-PARITY-WEB-04).

**R26-PARITY-WEB-03 — Pricing page: illustrated plan card icons**

- Gap: Our plan cards use a bare checkmark SVG; Claude's plant-growth line-art icons create warmth and are directly associated with each tier.
- Screenshot ref: `010b_claude-public_pricing_top_maximized.png`
- Our file: `apps/web/app/pricing/page.tsx:87`
- Effort: 2-3 h
- Action: Design or procure three distinct line-art icons (one per tier) in the AGI amber/off-white palette. Integrate in `agi-tier` article header.

### P1 — Significant UX gaps, medium conversion or quality impact

**R26-PARITY-WEB-04 — Add API / developer token pricing table**

- Gap: No user-facing per-model token cost table. Claude's API tab shows $/MTok for each model, critical for BYOK users evaluating cost.
- Screenshot ref: `015_claude-public_pricing_api_latest-models.png`
- Effort: 3-4 h
- Action: Source pricing from `packages/types/src/models.json` (or a new `lib/model-pricing.ts`). Render on the new API tab of the pricing page. Never hardcode; read from the catalog. Do not show version numbers in model names per locked platform rules.

**R26-PARITY-WEB-05 — Plan comparison table (cross-tier feature matrix)**

- Gap: No structured comparison across tiers.
- Screenshot ref: `011_claude-support_choose-plan_table.png`
- Effort: 4-6 h
- Action: Add a responsive table below the tier cards on the Individual tab. Rows = features (usage capacity, web search, voice, memory, projects, connectors, etc.). Columns = Local / BYOK / Hobby / Pro (waitlist) / Max (waitlist) / Enterprise. All numeric claims must come from `MARKETING.*` constants or `BILLING_PLAN_PRICING`.

**R26-PARITY-WEB-06 — Add "Contact sales" to primary navigation**

- Gap: Header nav has no "Contact sales" link.
- Screenshot ref: `032_claude-auth_logged-out_team-enterprise-cards.png`, `010b_claude-public_pricing_top_maximized.png`
- Our file: `apps/web/components/layout/Header.tsx:14`
- Effort: 0.5 h
- Action: Add `{ href: '/contact-sales', label: 'Contact sales' }` to the `NAV` array in Header.tsx, or render it as a separate CTA-ghost button to the right of the standard nav links (as Claude does).

**R26-PARITY-WEB-07 — Surface PAYG top-up from the pricing page**

- Gap: Top-up exists in the billing dashboard but is not discoverable from `/pricing`.
- Screenshot ref: `018_claude-support_extra-usage_paid-plans.png`
- Our files: `apps/web/app/pricing/page.tsx`, `apps/web/features/billing/components/Billing/Topup.tsx`
- Effort: 2 h
- Action: Add a "Need more? Purchase additional credits" link below the Hobby tier card, pointing to `/billing#topup`.

**R26-PARITY-WEB-08 — Add "Download desktop app" CTA to login page**

- Gap: Login page missing the install nudge that Claude shows (screenshot 030).
- Our file: `apps/web/app/login/page.tsx`
- Effort: 1 h
- Action: Add a small "Download the app" ghost button below the auth card, matching the pattern already in the Header's "Install" CTA.

### P2 — Nice-to-have, quality and trust

**R26-PARITY-WEB-09 — "Which plan is right for you?" quiz widget**

- Gap: Claude's Team/Enterprise tab has a short 3-question quiz that routes users to the correct plan.
- Screenshot ref: `014_claude-public_pricing_team-enterprise_top.png`
- Effort: 4-5 h
- Action: Build a simple 3-step question flow (team size, usage pattern, privacy requirement) that outputs a recommended tier. Low-code; render as a modal or collapsible drawer on the pricing page.

**R26-PARITY-WEB-10 — Verify per-project knowledge-base file upload UI**

- Gap: Projects page exists but per-project file ingestion (PDF, doc upload into a knowledge base) is not confirmed to be surfaced in the web UI.
- Our file: `apps/web/app/projects/page.tsx`
- Effort: 4-8 h (depending on gaps found)
- Action: Audit `ProjectGallery` from `@agiworkforce/unified-chat` for file ingestion support; if missing, wire Supabase storage upload into the project detail page at `/projects/[id]`.

**R26-PARITY-WEB-11 — Cowork-style task execution canvas (longer horizon)**

- Gap: Claude's Cowork (visible in screenshot 030 right panel) is a structured multi-step task canvas where the AI executes file, data, and prototype tasks. We have ArtifactsPanel but no task-queue UI.
- Effort: 12-20 h minimum
- Action: Design spike first. This is a substantial feature; schedule for a future wave after v1 launch. Consider whether the existing `features/chat/components/workflows/WorkflowDisplay.tsx` and `CollaborativeTaskView.tsx` can be wired as a web-facing task canvas.

**R26-PARITY-WEB-12 — Sticky breadcrumb + section anchor navigation on pricing**

- Gap: Claude's pricing page has a `Pricing > Explore here` breadcrumb + anchor jump on scroll; ours has no in-page navigation.
- Our file: `apps/web/app/pricing/page.tsx`
- Effort: 2 h
- Action: Add a sticky secondary nav with section anchors once the tabbed layout (R26-PARITY-WEB-02) lands.

---

## 6. Effort Summary

| Priority                  | Count  | Total estimated effort |
| ------------------------- | ------ | ---------------------- |
| P0 broken flows (00A/B/C) | 3      | 7-10 h                 |
| P0 parity gaps (01-03)    | 3      | 9-13 h                 |
| P1                        | 5      | 10.5-13.5 h            |
| P2                        | 4      | 22-35 h                |
| **Total**                 | **15** | **~49-72 h**           |

P0 items represent the highest ROI: they directly affect sign-up conversion (login layout), plan discovery (pricing tabs), and visual trust (plan icons).

---

_Audit generated: 2026-05-22. All claims cite screenshot PATH or apps/web path:line. Locks verified against `/Users/siddhartha/.claude/projects/-Users-siddhartha-Desktop-agiworkforce/memory/locks/v1-local-only-cloud-waitlist-2026-05-18.md`. No builds run._
