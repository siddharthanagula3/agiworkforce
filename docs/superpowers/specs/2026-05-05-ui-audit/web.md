# Web UI/UX Gap Audit — 2026-05-05

## Surface

- App path: `apps/web/`
- Refs studied: 22 screenshots from gemini-chat/ (7), perplexity/ (8), claude/claude-chat-artifacts-and-tools/ (5), claude/claude-connectors-directory/ (1), claude/claude-desktop/ (4 — empty state, sidebar, profile popover, pricing)
- Engineer: web-engineer

## A. Current state inventory

1. **Composer** — `features/chat/components/Composer/ChatComposerNew.tsx:98` — Full-featured: textarea, voice, attachments, slash commands, @mentions, agent mode, focus modes, ghost-text completion, plus-menu with tool toggles (image/video/doc/search/code). Model selector in `ComposerFooter.tsx:62` (provider-colored dot + name + chevron).
2. **Model selector** — `features/chat/components/Composer/ComposerFooter.tsx:62` — Popover with grouped-by-provider searchable list; reads from `shared/stores/model-store.ts` which sources from `packages/types` models.json. Minimal UI (dot + name), no provider logo icons, no capability badges.
3. **Message rendering** — `features/chat/components/messages/MessageBubble.tsx:402` — ThinkingBlock wired, react-markdown + remark-gfm + remark-math + rehype-highlight, streaming cursor. ToolCallCard and ToolTimeline exist. No inline artifact thumbnail in the message thread; artifacts go to a side panel.
4. **Artifact panel** — `features/chat/components/artifacts/ArtifactsPanel.tsx:169` — Slide-out right panel with artifact viewer and toggle button. Exists; no tabbed multi-artifact viewer or "Download all" affordance.
5. **Sidebar** — `features/chat/components/Sidebar/ChatSidebar.tsx` — Chat history list, folder management. No "Starred / Projects" grouping; no keyboard-accessible collapsed icon-rail.
6. **Connectors gallery** — `features/connectors/pages/ConnectorsPage.tsx:767` — Searchable grid with category tabs, "X connected / N total" badges. Phase-1 only; no "All / Connected / Available" filter tabs matching Perplexity pattern; no custom connector CTA.
7. **Skills / shortcuts** — `features/chat/components/shortcuts/PromptShortcuts.tsx` — Categorized prompt shortcuts with user-saved custom shortcuts. No branded skills library page with search, "My skills" vs "Example skills" tabs, or per-skill detail view.
8. **Settings** — `features/settings/pages/SettingsPage.tsx:5` — 6-tab settings: Appearance, Chat, Models, Security, Activity, Data. No billing/subscription tab, no personalization/memory tab, no notifications/scheduled-search tab.
9. **Empty state / home** — `features/chat/components/GreetingBanner/useGreeting.ts` — Greeting banner + category pills. No "Free plan + Upgrade" plan badge chip visible in the empty state header matching Claude's pattern.
10. **Marketing / pricing** — `app/pricing/page.tsx` — Editorial broadsheet style with honest copy, tier cards. No interactive monthly/yearly toggle with live price swap (Claude's 17% save badge).

## B. Pattern audit

### 1. Composer plus-menu

- Reference: `perplexity/02_browser_composer-plus-menu-files-cloud-connectors-deep-research.png` — Hierarchical plus menu: Upload files, Add files from cloud (sub-menu), Connectors and sources (sub-menu), Computer, Deep research, Model council (Max-gated)
- Ours: `features/chat/components/Composer/ChatComposerNew.tsx:75` — Flat list: image, video, doc, search, code-execution; no sub-menus, no cloud-source connectors entry point
- Gap: No cloud storage (Drive/Dropbox) or connectors entry point in the plus menu; no hierarchical sub-menus
- Verdict: ADJUST
- Impact: 4
- Effort: M
- Priority: P1

### 2. Model selector — capability labels and provider icons

- Reference: `perplexity/03_browser_composer-model-selector-best-sonar-gpt-gemini-claude.png` — Model picker shows "Best" as default auto-select option, provider logo icons, "Thinking" toggle inline
- Ours: `features/chat/components/Composer/ComposerFooter.tsx:66` — Provider-colored dot, text name, searchable popover; no provider logo icons, no "Thinking" toggle inline, no "Best (auto)" first option surfaced prominently
- Gap: No provider logos; "auto-balanced" not visually distinguished from manual models; no inline thinking toggle
- Verdict: ADJUST
- Impact: 3
- Effort: M
- Priority: P1

### 3. Inline tool-use status messages (stacked / compact)

- Reference: `claude/claude-chat-artifacts-and-tools/08_stacked-tool-status-messages_compact.png` — Collapsed one-liner summaries ("Ran 5 commands, created a file, read a file >") with expand chevron; very compact
- Ours: `features/chat/components/messages/ToolTimeline.tsx` + `ToolCallCard.tsx` — Card-per-step timeline; no collapsed "N commands" summary line
- Gap: High message-density tasks bloat the thread; no compact summary / progressive disclosure for multi-step tool runs
- Verdict: ADJUST
- Impact: 4
- Effort: M
- Priority: P1

### 4. Inline web search results with favicons

- Reference: `claude/claude-chat-artifacts-and-tools/06_inline-web-search-results_with-favicons.png` — Collapsible search block with favicon + domain per result, "Show more" expand, integrated inline
- Ours: `features/chat/components/InlineToolResults/InlineSearchResults.tsx:1` — Favicon support via Google's service, expand/collapse, domain display — this is largely in parity
- Gap: Minor: no "N results" count badge in collapsed header; domain shown but no publication date/freshness signal
- Verdict: KEEP
- Impact: 2
- Effort: S
- Priority: P2

### 5. Artifact viewer — multi-artifact cards + Download all

- Reference: `claude/claude-chat-artifacts-and-tools/17_chat-response_multiple-artifact-cards-download-all.png` — Multiple artifact document cards inline in message thread with "Open in [app]" and "Download all" button
- Ours: `features/chat/components/artifacts/ArtifactsPanel.tsx:169` — Artifacts go to slide-out panel; no inline artifact cards in message bubble; no "Download all"
- Gap: Inline artifact thumbnail cards in the message stream are missing; users must know to open the panel
- Verdict: ADD
- Impact: 4
- Effort: L
- Priority: P1

### 6. Artifact viewer sidebar — tabbed content, toolbar

- Reference: `claude/claude-chat-artifacts-and-tools/13_artifact-viewer_toolbar-copy-refresh-close.png` — Toolbar with Copy / Refresh / Close; `24_artifact-viewer_tabbed-content-with-print-button.png` — tabs for preview vs source with Print button
- Ours: `features/chat/components/artifacts/ArtifactsPanel.tsx` — Basic viewer; no source/preview tab toggle; no Print button; toolbar minimally documented
- Gap: No code-source vs rendered-preview tab toggle; no Print action
- Verdict: ADJUST
- Impact: 3
- Effort: M
- Priority: P2

### 7. Thinking / reasoning block UX

- Reference: `gemini-chat/08_chat_flights-show-thinking-expanded-reasoning-stages.png` — "Show thinking" toggle with named stage headers ("Defining the Search", "Refining the Destination"); `claude/claude-chat-artifacts-and-tools/11_inline-reasoning-steps_thinking-blocks-clock-icons.png` — clock icon per step, collapsible accordion
- Ours: `features/chat/components/ThinkingBlock.tsx` + `messages/MessageBubble.tsx:402` — ThinkingBlock is wired; has `defaultExpanded` and streaming support via `ReasoningAccordion.tsx`
- Gap: Need to verify named stage headers render (not just raw text dump); clock icon per step not confirmed
- Verdict: KEEP (verify stage parsing)
- Impact: 2
- Effort: S
- Priority: P2

### 8. Scroll-to-bottom floating button

- Reference: `claude/claude-chat-artifacts-and-tools/04_chat-layout_scroll-to-bottom-floating-button.png` — Floating circular button with down-arrow appears when scrolled up mid-conversation
- Ours: `features/chat/components/messages/ChatMessageList.tsx:86` — ScrollToBottomButton component exists and is wired
- Gap: None confirmed; component exists
- Verdict: KEEP
- Impact: 1
- Effort: S
- Priority: P2

### 9. Connectors gallery — filter tabs + custom connector CTA

- Reference: `perplexity/08_connectors_grid-gmail-drive-notion-github-slack-jira.png` — "All / Connected / Available" filter tabs + "Custom connector" button; `claude/claude-connectors-directory/01_directory_modal-page-01-*.png` — modal with Sort / Type / Categories filters, 2-col grid with per-item "+" to add
- Ours: `features/connectors/pages/ConnectorsPage.tsx:801` — Category tabs + search; no "All / Connected / Available" tri-state filter; no "Add custom connector" CTA; no Sort or Type dropdowns
- Gap: Missing "Connected" filter tab so users can see what they've already authorized; no custom connector entry point
- Verdict: ADJUST
- Impact: 4
- Effort: M
- Priority: P1

### 10. Skills library — browsable with search and My/Example tabs

- Reference: `perplexity/09_skills_library-marketing-data-legal-sales-cx.png` — "All / My skills / Example skills" tabs, search, "+ Create skill" CTA; 2-col grid with skill description, trigger keywords
- Ours: `features/chat/components/shortcuts/PromptShortcuts.tsx` — categorized prompt shortcuts with custom shortcuts; no dedicated full-page skills library; no search; no "Example skills" discovery tab
- Gap: No skills discovery page; skills are only accessible via the shortcuts panel in composer context; no way to browse all available skills
- Verdict: ADD
- Impact: 3
- Effort: L
- Priority: P1

### 11. Scheduled searches

- Reference: `perplexity/18_settings_notifications-scheduled-search-presets-price-alerts.png` — "Create a Scheduled Search" with composer + preset cards (News Digest, Market Forecast, Tech Insights, etc.); "Price Alerts" section
- Ours: `app/api/schedules/[id]/route.ts` — API exists (CRUD + toggle active); no visible UI surface for creating/managing scheduled searches
- Gap: Schedules API exists but the UI to create/view them is not wired in settings or anywhere user-accessible
- Verdict: ADD
- Impact: 3
- Effort: L
- Priority: P1

### 12. Settings IA — missing billing and notifications tabs

- Reference: `claude/claude-desktop/11_settings-billing-tab.png` + `perplexity/19_settings_notifications-email-web-push-toggles.png` — Billing tab with plan + usage; Notifications tab with email / web push toggles
- Ours: `features/settings/pages/SettingsPage.tsx:5` — 6 tabs: Appearance, Chat, Models, Security, Activity, Data; no Billing/Subscription tab; no Notifications tab
- Gap: Users have no in-app billing management or notification controls; must use external Stripe portal or email
- Verdict: ADD
- Impact: 4
- Effort: M
- Priority: P0

### 13. Profile popover — plan badge + upgrade CTA

- Reference: `claude/claude-desktop/20_profile-popover-menu.png` — Email, Settings, Language, Get help, Upgrade plan, Get apps and extensions, Gift Claude, Log out
- Ours: `components/layout/Header.tsx` — Marketing nav header; chat header in `features/chat/components/Main/ChatHeader.tsx:50` — no user profile popover with plan status and upgrade CTA wired in chat surface
- Gap: No persistent user avatar / profile popover in the chat surface; plan status and upgrade path not surfaced to authenticated users mid-chat
- Verdict: ADD
- Impact: 4
- Effort: M
- Priority: P0

### 14. Pricing page — monthly/yearly toggle with live price swap

- Reference: `claude/claude-desktop/35_plans-pricing_individual-plans.png` — Monthly/Yearly toggle with "Save 17%" badge; prices update live
- Ours: `app/pricing/page.tsx:29` — Static editorial page; no billing-cycle toggle; "~$5/mo" is hardcoded text
- Gap: No interactive billing-period toggle; no savings-badge; tier cards are static copy
- Verdict: ADJUST
- Impact: 3
- Effort: M
- Priority: P2

### 15. Empty state — plan badge chip in header

- Reference: `claude/claude-desktop/01_empty-state_new-chat-collapsed-sidebar.png` — "Free plan · Upgrade" chip visible in the chat center above the composer
- Ours: `features/chat/components/GreetingBanner/useGreeting.ts` — Greeting + pills; no plan-status chip; upgrade prompt is absent from the chat empty state
- Gap: Hobby / BYOK / Local users get no persistent plan reminder or upgrade nudge in-context
- Verdict: ADD
- Impact: 3
- Effort: S
- Priority: P1

## C. Top 10 priority gaps (ranked)

1. **Settings: add Billing + Notifications tabs** — Ref: `claude/claude-desktop/11_settings-billing-tab.png` — Ours: `features/settings/pages/SettingsPage.tsx:5` — Add Billing tab (Stripe portal link + plan summary) and Notifications tab (email/push toggles) — P0 (Impact 4, Effort M)
2. **Profile popover with plan badge + upgrade CTA in chat** — Ref: `claude/claude-desktop/20_profile-popover-menu.png` — Ours: `features/chat/components/Main/ChatHeader.tsx:50` — Add user avatar popover to chat chrome surfacing email, plan, settings, upgrade, logout — P0 (Impact 4, Effort M)
3. **Connectors gallery: "Connected" filter tab + custom connector CTA** — Ref: `perplexity/08_connectors_grid-gmail-drive-notion-github-slack-jira.png` — Ours: `features/connectors/pages/ConnectorsPage.tsx:801` — Add All/Connected/Available tri-state tabs and "Add custom connector" button — P1 (Impact 4, Effort M)
4. **Inline artifact thumbnail cards in message thread** — Ref: `claude/claude-chat-artifacts-and-tools/05_chat-response_thumbnail-artifact-preview.png` — Ours: `features/chat/components/artifacts/ArtifactsPanel.tsx:169` — Render small inline artifact card in MessageBubble for each artifact so users see output without opening the panel — P1 (Impact 4, Effort L)
5. **Compact stacked tool-use summary ("Ran N commands, created a file >")** — Ref: `claude/claude-chat-artifacts-and-tools/08_stacked-tool-status-messages_compact.png` — Ours: `features/chat/components/messages/ToolTimeline.tsx` — Collapse multi-step tool runs into a single expandable summary line — P1 (Impact 4, Effort M)
6. **Composer plus-menu: cloud sources + connectors sub-menu** — Ref: `perplexity/02_browser_composer-plus-menu-files-cloud-connectors-deep-research.png` — Ours: `features/chat/components/Composer/ChatComposerNew.tsx:75` — Add "Add files from cloud" and "Connectors" hierarchical sub-menus — P1 (Impact 4, Effort M)
7. **Scheduled searches UI surface** — Ref: `perplexity/18_settings_notifications-scheduled-search-presets-price-alerts.png` — Ours: API at `app/api/schedules/[id]/route.ts` (no UI) — Wire create/manage scheduled searches in settings notifications tab — P1 (Impact 3, Effort L)
8. **Skills library browsable page** — Ref: `perplexity/09_skills_library-marketing-data-legal-sales-cx.png` — Ours: `features/chat/components/shortcuts/PromptShortcuts.tsx` — Add a full-page skills library with search, My/Example tabs, and Create skill CTA — P1 (Impact 3, Effort L)
9. **Empty state plan badge chip** — Ref: `claude/claude-desktop/01_empty-state_new-chat-collapsed-sidebar.png` — Ours: `features/chat/components/GreetingBanner/useGreeting.ts` — Add "Hobby plan · Upgrade" chip above composer in empty state — P1 (Impact 3, Effort S)
10. **Model selector: provider logos + "Best (auto)" prominence** — Ref: `perplexity/03_browser_composer-model-selector-best-sonar-gpt-gemini-claude.png` — Ours: `features/chat/components/Composer/ComposerFooter.tsx:66` — Add provider favicon/logo icons and make the auto-select option visually distinct at top — P1 (Impact 3, Effort M)

## D. Anti-patterns from refs we should NOT copy

1. **Perplexity Finance/Shopping/Travel verticals** (`perplexity/22_settings_shopping-empty-state-instant-buy.png`) — Perplexity embeds shopping and travel booking as first-class settings sections. These are deeply tied to Perplexity's search-engine identity. For AGI Workforce the differentiator is multi-provider agent work, not vertical commerce. Adding these dilutes focus.
2. **Claude's walled-garden connector permissions model** (`claude/claude-desktop/24_connector-detail_gmail-tool-permissions.png`) — Claude shows a single-vendor connector with granular per-tool permission toggles that are Anthropic-reviewed. Our connectors use MCP (user-controlled), so replicating that "Anthropic reviewed" trust badge would be misleading and incompatible with the BYOK/open stance.
3. **Gemini's rich vertical content embeds** (`gemini-chat/10_chat_maps-embed-san-francisco-places-listings.png`, `12_chat_youtube-embed-watch-entire-video-prompt.png`) — Inline Google Maps and YouTube embeds rely on Google's own data pipelines. Cloning this requires deep API agreements. Our equivalent should be MCP-sourced structured card data, not iframe embeds.
4. **Perplexity "Pro Perks" partner discounts** (`perplexity/21_settings_pro-perks-partner-discounts-headspace-oura-viator.png`) — Partner benefit bundles (Headspace, Oura) are a consumer-loyalty play. AGI Workforce targets power users and developers; this adds non-core surface area and partner negotiations that aren't worth the complexity at launch.
5. **Claude's "Gift Claude" in profile popover** (`claude/claude-desktop/20_profile-popover-menu.png`) — Anthropic uses gifting as a virality loop for consumer plans. Our revenue model is BYOK + Hobby + waitlisted Pro/Max; a gifting flow adds payment complexity for negligible benefit pre-Pro GA.

## E. Open product questions (need user decision)

1. **Billing tab destination**: Should the Settings > Billing tab open the Stripe customer portal in a new tab, or embed a subscription summary card inline? Inline requires polling Stripe; portal is simpler but breaks context.
2. **Skills library scope**: Is the skills library for prompt-shortcuts only, or does it also expose AI Skills (the 150+ specialist agents from `/features/ai-skills`)? These are currently separate surfaces — should they merge?
3. **Scheduled searches — access tier**: Should scheduled searches be Hobby+ only (gating on auth + paid tier) or available to BYOK users who supply their own model keys?
4. **Connector "custom connector" CTA**: What does clicking "Add custom connector" do today — link to MCP docs, open a config form, or nothing? Need to decide before surfacing the button.
5. **Artifact inline cards vs side panel**: Is the artifact panel the authoritative UX (click to open), or do we want both inline thumbnails AND the panel? Keeping both adds z-index/focus complexity.
