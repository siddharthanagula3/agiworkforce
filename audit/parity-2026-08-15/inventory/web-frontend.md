# apps/web Frontend — Deep Wiring Audit

Scope: `apps/web` — the entire Next.js 16 frontend (screens, shell, navigation,
components). Read-only, source-level audit. Every claim below is backed by a
`path:line` reference; nothing is inferred from naming alone. Where another
inventory doc in this audit round (`web-route-sweep-findings.md`) reaches a
different conclusion from a live-HTTP sweep, the discrepancy is called out —
this document takes the source-level (`redirect()` calls, actual imports) as
ground truth since it explains the _mechanism_, not just the response code.

Read `apps/web/AGENTS.md` first (done — see Lane Contract: `web-ui` owns
`app/**`, `components/**`, `features/**`, `hooks/**`, `lib/**` except
API/admin).

---

## 1. Page inventory — all 156 `page.tsx` files

`find apps/web/app -name page.tsx | wc -l` → **156**. Classified below. "Live"
means the file renders real content; "Redirect/alias" means it only calls
`redirect()`.

### 1.1 Auth cluster (the "duplicate auth routes" question)

This is the one area the task brief specifically flagged as needing
investigation. Verified by reading every file, not by HTTP status:

| Route                                                                                                                                            | Kind                                                                                                                                           | Evidence                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/login`                                                                                                                                         | **LIVE** — real Clerk `<SignIn>` card, wrapped in `AuthShell` + `TermsGate`                                                                    | `app/login/page.tsx:1-56`                                                                                                                                                   |
| `/signup`                                                                                                                                        | **LIVE** — real Clerk `<SignUp>` card, same wrapper                                                                                            | `app/signup/page.tsx:1-60`                                                                                                                                                  |
| `/sign-in`                                                                                                                                       | **ALIAS → `/login`**, `redirect()`, preserves query string                                                                                     | `app/sign-in/page.tsx:12-25` — comment: "desktop app's cloud-auth handoff opens `/sign-in?...`; Clerk's default convention is `/sign-in`, web Clerk page lives at `/login`" |
| `/sign-up`                                                                                                                                       | **ALIAS → `/signup`**, `redirect()`, preserves query string                                                                                    | `app/sign-up/page.tsx:7-20`                                                                                                                                                 |
| `/register`                                                                                                                                      | **ALIAS → `/signup`**, unconditional `redirect()`                                                                                              | `app/register/page.tsx:1-5`                                                                                                                                                 |
| `/auth/login`                                                                                                                                    | **ALIAS → `/login`**, unconditional `redirect()`                                                                                               | `app/auth/login/page.tsx:1-5`                                                                                                                                               |
| `/login/complete`                                                                                                                                | **LIVE** — post-Clerk-auth terms-acceptance checkpoint, not a duplicate of `/login`                                                            | `app/login/complete/page.tsx:1-54`                                                                                                                                          |
| `/signup/complete`                                                                                                                               | **LIVE** — same pattern for new accounts, writes the durable terms-acceptance record                                                           | referenced from `app/signup/page.tsx:36`                                                                                                                                    |
| `/device-auth`                                                                                                                                   | **ALIAS → `/auth/device`**                                                                                                                     | `app/device-auth/page.tsx:1-6`: "The actual device-auth flow lives at /auth/device. This route forwards."                                                                   |
| `/auth/device`                                                                                                                                   | **LIVE** — full OAuth-device-code UI (`user_code`, scopes, expiry, approve/deny)                                                               | `app/auth/device/page.tsx:1-408`                                                                                                                                            |
| `/user`                                                                                                                                          | **ALIAS → `/settings`**                                                                                                                        | `app/user/page.tsx:1-12`: desktop app's update-password flow opens `/user`, previously 404'd                                                                                |
| `/forgot-password`, `/auth/reset-password`, `/auth/update-password`, `/auth/error`, `/auth/chrome-extension`, `/verify`, `/connect/[deviceType]` | **LIVE** — each a distinct, non-overlapping step in password-recovery / device-pairing / email-verification, not duplicates of sign-in/sign-up | inspected directly                                                                                                                                                          |

**Verdict: NOT a case of unresolved duplication.** Every non-canonical URL is a
documented, intentional alias with a code comment explaining which external
caller (desktop app, Clerk's own default routing convention, old bookmarks)
needs it to keep working. There are exactly two canonical, live auth screens
(`/login`, `/signup`); everything else in the cluster is either a thin
redirect or a distinct step in a multi-step flow (device pairing, terms
acceptance, password reset).

**Conflicts with the sibling `web-route-sweep-findings.md` doc**, which
states under "Finding 1": _"All return 200 independently — none redirects to
a single canonical implementation."_ That is incorrect at the source level —
`app/sign-in/page.tsx`, `app/sign-up/page.tsx`, `app/register/page.tsx`, and
`app/auth/login/page.tsx` all call Next's `redirect()` (a 307), which a
`curl -L`-style sweep would silently follow and report as 200 on the final
URL, masking the redirect. The mechanism (redirect vs. duplicate live page)
matters for the audit's purpose — these are not four independent
implementations of sign-in that could drift out of sync; they are one
implementation with three URL aliases pointed at it.

### 1.2 Settings cluster — 25 `/settings/*` pages, single modal

Every `/settings/<section>` route (`account`, `billing`, `capabilities`,
`connections`, `security`, `safety`, `privacy`, `memory`, `notifications`,
`reflect`, `time-focus`, `usage`, `team`, `general`, `archived`,
`deleted-chats`, `shared-links`) is a **one-line client component** that
renders `<SettingsModalRedirect section="...">`
(`features/settings/components/SettingsModalRedirect.tsx:25-58`), which calls
`openSettings(section)` then `router.replace('/chat')`. The real, wired
content lives in `features/settings/sections/*.tsx`, mounted by
`WebSettingsModal.tsx:786-815`. This is a deliberate, well-documented pattern
(deep-linkable URLs, modal-first UX) — **not** 25 separate half-built pages.
Confirmed real content behind every section (`GeneralSection`,
`AccountSection`, `TeamSection`, `SecuritySection`, `SafetySection`,
`PrivacySection`, `ArchivedChatsSection`, `DeletedChatsSection`,
`SharedLinksSection`, `BillingSection` (1085 lines), `UsageSection` (303
lines), `CapabilitiesSection`, `MemorySection`, `NotificationsSection`,
`ReflectSection`, `TimeFocusSection`, `HelpSection`).

Three exceptions render real page content directly (not modal stubs), because
they need a full page, not a modal panel:

- `/settings/byok` — server component listing deployment-managed provider-key
  presence, fetched via `/api/byok/env-key-status`
  (`app/settings/byok/page.tsx:1-95`). Explicitly labeled: hosted Web does
  **not** accept per-account BYOK keys — only Desktop/CLI/VS Code do.
- `/settings/voice` — explicitly states "Managed voice is not available" and
  that composer dictation ("push-to-talk", not live conversation) is the only
  voice feature Web has (`app/settings/voice/page.tsx:38-62`). Honest
  UI_ONLY-by-design, not a broken promise.
- `/settings/sync` — live cross-device settings/chat-history sync status for
  signed-in Cloud accounts (`app/settings/sync/page.tsx:1-13`).

Two are legacy redirects: `/settings/profile → /settings/general`
(`app/settings/profile/page.tsx`), `/settings/skills` and
`/settings/skills/new → /skills` (both call `redirect('/skills')`).

### 1.3 Product-surface deep-link pattern (`/connectors`, `/skills`, `/apps`)

Same modal-redirect architecture as Settings, gated on Clerk auth state:

- `/connectors` — signed-out sees the public `ConnectorsPage` marketing
  directory; signed-in gets `<SettingsModalRedirect section="connectors">`
  (`app/connectors/page.tsx:14-37`).
- `/skills` — signed-out is bounced to `/login?redirectTo=%2Fskills`;
  signed-in opens the modal's Skills section (`app/skills/page.tsx:14-27`).
- `/apps` — same pattern for the Plugins section; comment explicitly notes a
  prior dead-loop bug (signed-out → `/integrations` → back to `/apps` →
  `null`) that was fixed by sending to `/login` instead
  (`app/apps/page.tsx:22-31`).
- `/connectors/new` and `/connectors/permissions` are thin redirects to
  `/connectors` and `/settings/capabilities` respectively.

### 1.4 Marketing / legal / informational pages (majority of the 156)

Not deep-audited individually (out of the "product surface" brief), but
spot-checked for the failure modes the task calls out (fake availability
badges, stale gating copy, dead CTAs):

- `/waitlist` — copy correctly reflects the 2026-06-27 founder decision
  (`AGENTS.md`): _"AGI managed cloud is in public alpha and open by default —
  sign in and start, no waitlist. ... Join the list for contract-scoped
  Enterprise SSO, custom retention, and governance requirements."_
  (`app/waitlist/page.tsx:10`). No stale "request access" gating language
  found elsewhere (`grep -rn "private beta" app/pricing app/enterprise
app/business` → no hits outside a test file).
- `/providers` pulls provider/model data from the shared catalog
  (`modelsCatalogJson` from `@agiworkforce/types`,
  `app/providers/page.tsx:3`) rather than hardcoding model IDs — compliant
  with the repo's model-ID sourcing rule.
- Full list of marketing/legal/content pages (informational only, Header +
  MarketingFooter shell, no state-changing controls beyond CTAs that link to
  `/login`, `/signup`, `/pricing`, or `mailto:`): `about`, `acceptable-use`,
  `accessibility`, `agent-permissions`, `agi-code`, `agi-work`, `blog`,
  `blog/[slug]`, `buildathon`, `business`, `byok`, `careers`, `changelog`,
  `chrome-extension`, `cli`, `community`, `contact`, `contact-sales`,
  `cookies`, `copyright`, `customers`, `data-use`, `desktop`, `docs`,
  `docs/byok-env`, `download`, `dpa`, `enterprise`, `faq`, `features` (+8
  sub-pages), `get-started`, `help`, `integrations`, `legal` (+
  `eu-representative`), `local`, `mobile` (+ `legal`), `model-licenses`,
  `partners`, `press`, `privacy` (+ `india`, `requests`), `refund-policy`,
  `resources`, `security`, `sitemap-page`, `sla`, `solutions`, `status`,
  `subprocessors`, `support`, `teams`, `terms`, `trust`, `use-cases` (+6
  sub-pages), `vscode-extension`, `api-docs`.
- Redirect-only marketing aliases: `/documentation → /docs`,
  `/downloads → /download`, `/marketplace → /apps`,
  `/api-reference → /api-docs`, `/ai-skills → /skills?tab=agents`,
  `/features/ai-skills → /skills`, `/use-cases/consulting-businesses →
/use-cases/consulting`, `/use-cases/it-service-providers →
/use-cases/it-providers`.

### 1.5 Dev-only / QA-only surfaces — confirmed production-killed

- `/qa-artifacts` — manual-QA harness that seeds a **fabricated** assistant
  message (hand-written reasoning, tool timeline, "web search sources") into
  the real chat store to exercise `ChatMessageList` + `ArtifactsPanel`
  without a live LLM turn (`app/qa-artifacts/page.tsx:1-50`). Killed in
  production by `app/qa-artifacts/layout.tsx:20-23` (`notFound()` when
  `NODE_ENV === 'production'`), and listed in `robots.ts` `DISALLOW_APP`.
- `/dev/inline-toolcall-demo` — same pattern, same kill-switch via
  `app/dev/layout.tsx:24-27`.
- Both are correctly classified **DEV_ONLY**, not dead code — they render
  through the _real_ production components, which is the point, but cannot
  be reached in prod.

### 1.6 Admin

- `/admin` → `AdminConsolePage` (`features/admin/pages/AdminConsolePage.tsx`,
  336 lines) — a static **readiness dashboard**: policy constants
  (`DEFAULT_ENTERPRISE_ADMIN_POLICY`, `MANAGED_COMPUTE_MARGIN_POLICY`) and a
  live-computed managed-compute open/closed status
  (`isManagedComputePrivateBetaEnabled()`,
  `features/admin/pages/AdminConsolePage.tsx:15-27`) rendered into a table.
  This part is COMPLETE but essentially a compliance/config summary, not an
  operational console.
- The operational half of the same page, `SecurityOperationsPanel`
  (`features/admin/components/SecurityOperationsPanel.tsx`), is genuinely
  live: fetches `GET /api/admin/security` and
  `GET /api/admin/security?action=events&limit=25`, and posts mutations to
  `POST /api/admin/security?action=<action>`
  (`features/admin/services/admin-security-client.ts:59-90`). **COMPLETE.**
- `/admin/directory-sync` → `DirectorySyncAdminPage`, SCIM 2.0 provisioning
  config. Page comment correctly notes authorization is enforced twice (Clerk
  admin/owner role at the layout, `enterprise_controls` entitlement at each
  API route) — `app/admin/directory-sync/page.tsx:9-16`.

---

## 2. App shell

### 2.1 Two parallel shells — by design, not duplication

- **`WebAppShell`** (`shared/components/layout/WebAppShell.tsx`, 522 lines) —
  a lighter navigation-focused shell used by `/chat/projects`,
  `/chat/projects/[id]`, `/chat/library`, `/chat/schedules`, `/tasks`. Its own
  header comment explains why: those routes previously rendered bare `<main>`
  with no sidebar, dropping users out of the product shell
  (`WebAppShell.tsx:4-16`). It mounts the same shared `@agiworkforce/ui`
  `<Sidebar>` the live chat page uses, wired to real data (`useConversations`,
  `useManagedCloudProjects`) — not a stub.
- **`WebChatPage`** (`features/chat/pages/WebChatPage.tsx`, 4407 lines) — owns
  its own richer `<Sidebar>` wiring (streaming state, multiple dialogs) and is
  intentionally _not_ refactored onto `WebAppShell`
  (`WebAppShell.tsx:14-16`).
- Both are reachable and both are real. This is deliberate architectural
  duplication with a documented reason, not an abandoned rewrite.

### 2.2 A THIRD, genuinely dead shell — `features/chat/v3/*`

`features/chat/v3/` contains a full alternate chat-shell implementation:
`WebShellV3.tsx` (178 lines), `WebSidebar.tsx` (643 lines),
`WebSearchModalCmdK.tsx` (31 lines), `WebEmptyChat.tsx` (22 lines) — 963
lines total, each with its own test file.

- `WebShellV3` is consumed by exactly one production component:
  `features/chat/pages/UnifiedChatPage.tsx:7,63`. `UnifiedChatPage`'s own doc
  comment: _"Full v3 web chat surface. Kept as an internal component while
  the Web chat implementation converges. Do not expose a second public chat
  route or query-param switch; `/chat` is the single public Web chat URL."_
  (`UnifiedChatPage.tsx:49-55`).
- `grep -rln "UnifiedChatPage"` across the whole app finds exactly 3 hits:
  its own file, its own test (`features/chat/pages/__tests__/chat-route.test.tsx`,
  which explicitly mocks and asserts it is _not_ what `/chat` renders), and
  `shared/stores/web-chat-store.ts`. **No route (`app/**/page.tsx`) imports
`UnifiedChatPage`or`WebShellV3` anywhere.\*\*
- `app/chat/page.tsx` and `app/chat/[sessionId]/page.tsx` both mount
  `WebChatRoot` → `WebChatPage` (`features/chat/components/WebChatRoot.tsx:20`),
  never `UnifiedChatPage`.
- **Classification: DEAD (in the "not routed, unreachable by any user"
  sense) / HIDDEN (in the "exists, tested, intentionally parked" sense).**
  Not a bug to fix — it's explicitly marked as in-progress convergence work —
  but an auditor following "if a route exists, grep whether anything links to
  it" will correctly find that `/chat`'s actual UI is 100% `WebChatPage`, and
  none of `WebShellV3`'s design is what real users see.
- **Partial reuse exception:** `/chat/code` (`features/code/CloudCodePage.tsx`)
  imports `WebSidebar` and `resolveWebViewRoute` directly from
  `features/chat/v3/WebSidebar` and `features/chat/v3/WebShellV3`
  (`features/code/CloudCodePage.tsx:29-30`) — so the v3 sidebar component
  itself _is_ live in production, just not via `WebShellV3`/`UnifiedChatPage`
  as a whole page.

### 2.3 Profile menu / account footer

Wired with real data end-to-end: display name/initial resolved from
`useAuthStore` via `resolveAccountDisplayName`
(`WebAppShell.tsx:311-312`), plan tier label from
`getBillingPlanPricing(currentTier).label` (`WebAppShell.tsx:318`, sourced
from `useBillingStore`), dropdown items open the real settings modal
(`openSettings('team')`, `openSettings('general')`,
`WebAppShell.tsx:379-384`) and route to real legal pages via
`CANONICAL_POLICY_ROUTES`. Log out calls both the app's own
`logout()` and Clerk's `signOut` (`WebAppShell.tsx:320-323`). **COMPLETE.**

### 2.4 Workspace/team switcher

`WorkspaceMenuItems` (`features/workspaces/components/WorkspaceMenuItems.tsx`,
77 lines) is driven by `useOrganizationOverview()` (real Clerk org data,
`WorkspaceMenuItems.tsx:6,16`) and triggers `overview.refetch()` on selection
(`:34`). Mounted inside the account-footer dropdown in both `WebAppShell`
(`:379`) and (per its own module) the main chat sidebar. **COMPLETE.**

### 2.5 Command palette / global search

`GlobalSearchDialog` and `KeyboardShortcutsDialog` are imported and mounted
directly in `WebChatPage.tsx:110-111,3961-3962` (not through the
`components/dialogs/index.ts` barrel — see §5). `GlobalSearchDialog` posts to
a real `/api/search` route (`app/api/search/route.ts` exists and is
referenced from `features/chat/v3/WebSearchModalCmdK.tsx`). Separately,
`shared/components/CommandPalette/{CommandPalette,CommandPaletteProvider}.tsx`
is wired into `app/providers.tsx` and `shared/stores/web-chat-store.ts` — a
second, app-shell-level Cmd-K surface distinct from the chat-page search
dialog. Both are live; they serve different scopes (global palette vs.
in-chat message search).

### 2.6 Notifications

There is **no persistent in-app notification center** (bell icon +
dropdown of past notifications) anywhere in the shell —
`grep -rln "NotificationCenter\|NotificationBell"` across `features`,
`shared`, `app` returns zero hits. What exists instead:
`NotificationsSection` inside Settings (browser/email/mobile-push
_preference toggles_, not a notification feed) and an inline,
transient in-chat banner asking for browser-notification permission during
long generations (`features/chat/pages/WebChatPage.tsx:4180-4189`, "Get
notified when the response is ready"). This is a real gap versus a
ChatGPT/Claude-class product, not a broken feature — just an absent one.
Worth flagging as a scope gap rather than a defect.

### 2.7 Mobile nav

Both shells implement the same pattern independently: a `matchMedia
'(max-width: 768px)'` listener flips to a compact header + slide-in drawer
with focus trap (focus moves into drawer on open, back to trigger on close),
Escape-to-close, and backdrop click-to-close. `WebAppShell.tsx:93-121,
464-521`; `WebChatPage.tsx:599-660, 3971-4012` (near-identical
implementation, independently maintained — a minor duplication risk if one
gets an accessibility fix the other doesn't).

### 2.8 Help / feedback

`HelpSection` inside the settings modal — explicitly built because "Settings
had no Help entry at all, so `/help`, `/status`, and `/changelog` shipped but
were unreachable from inside the product" (`features/settings/sections/HelpSection.tsx:5-11`).
Links only to routes confirmed to exist. There is a `ComposerFeedbackDialog.tsx`
in the Composer directory — confirmed imported/used within
`ChatComposerNew.tsx` (feedback capture on the composer itself, not a
separate feedback surface).

---

## 3. Chat experience

### 3.1 Conversation header (`ConversationTitleMenu` +

surrounding header in `WebChatPage.tsx`)

`ConversationTitleMenu` (`features/chat/components/ConversationTitleMenu.tsx`)
exposes: **Rename** (inline input, Enter commits / Escape cancels, no-op on
empty/unchanged — `:70-74`), **Move to project** (submenu, only rendered when
`projects.length > 0` — `:118-132`), **Print** (calls a dedicated
`printConversation()` because the transcript is virtualized and a bare
`Ctrl+P` would only print DOM-visible rows — `WebChatPage.tsx:4113-4116`),
**Duplicate as branch** (conversation-level fork via `createBranch`, distinct
from the existing per-message branch action — `WebChatPage.tsx:4117-4128`),
**Delete**. All five are prop-driven with real handlers, not stubs.

Outside that menu, wired directly in `WebChatPage.tsx`'s header row:
**Share** (`Share2` icon button → `setShareDialogOpen(true)` →
`ShareConversationDialog`, `:4085-4096, 4361`), **Temporary chat**
(`handleSetTemporaryChat`, persists `isTemporary` via `updateConversation`,
`:3114-3120`, comment notes it "Completes the previously-stubbed" state —
i.e., a prior audit finding already fixed), **Pin/Archive/Star** (all persist
via `updateConversation`, `:3364,3382`), message-level **Pin**
(`handlePinMessage`, persists `messages.metadata.isPinned`, syncs
cross-device, `:3645-3673`, comment: "Completes the previously-stubbed
onPin"). Model & mode indicators render via `ApprovalInbox`,
`WorkSessionToggleButton`, `ResearchToggleButton`, `ArtifactsToggleButton`
(`:4132-4145`), each gated on real state (`hasMessages`, `showWorkSession`,
`researchSourceCount`).

**No dedicated "Export conversation" action** exists in the header beyond
Print — see §5 (`EnhancedExportDialog` is built but orphaned).

### 3.2 Composer (`ChatComposerNew.tsx`, 3621 lines + `ComposerFooter.tsx`,

1019 lines)

Every control named in the brief was traced to a real handler:

| Control                     | Evidence                                                                                                                                                                                                                                                                                                             |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ---------------------------------------------------------------------- |
| Attachments (file picker)   | `addChatAttachments`, gated on `disabled`/`trialExhausted` (`:1092-1108`)                                                                                                                                                                                                                                            |
| Drag-and-drop               | `<DragDropOverlay onDrop={handleFileDrop} />` mounted at `:1986`; `handleFileDrop` defined `:1020`                                                                                                                                                                                                                   |
| Screenshot capture          | **Desktop-only, render-gated** on `canTakeScreenshotCap = useCapability('canTakeScreenshot')` (`:567`) so it is _absent_, not disabled, on web/mobile — `:2606-2631`. Comment cites a prior audit fix ("AUDIT-FIX CMP-10: this rendered an icon and a label with NO onClick") already resolved.                      |
| Camera / "Take a photo"     | Not desktop-gated (uses browser `getUserMedia`); opens a dedicated camera dialog (`setCameraOpen(true)`, `:2634-2648`)                                                                                                                                                                                               |
| Folder / project picker     | Desktop-only `canPickFolder` gate for the legacy row; unified picker present for web (`:2664-2695`)                                                                                                                                                                                                                  |
| Dictation (voice input)     | `VoiceInputButton` component, imported and mounted (`:34`)                                                                                                                                                                                                                                                           |
| @-mentions                  | `mentionQuery` state, filters skills list, `handleMentionSelect` (`:425,1296-1301`)                                                                                                                                                                                                                                  |
| Model selector              | `ComposerFooter.tsx` — shows a Catalog-driven list; unprovisioned models render `kind: 'coming_soon'` / "Coming soon" (`ComposerFooter.tsx:190-193,399,465`) — honest, not fake-available                                                                                                                            |
| Reasoning effort            | Referenced against `docs/research/reasoning-effort-capability-matrix-2026-07-10.md` (`ComposerFooter.tsx:79`)                                                                                                                                                                                                        |
| Research mode               | `modelSupportsResearch` gate, disabled when unsupported or on free trial (`:2814`)                                                                                                                                                                                                                                   |
| Agent / AGI Work mode       | `handleWorkModeChange`, `workMode` toggle state (`:2391-2392,2908-2909`), consumed elsewhere by `features/tasks` "rerun" flow (`TasksPage.tsx:33`, sets `workMode: 'agiwork'`)                                                                                                                                       |
| Code execution              | `modelSupportsCodeExecution`, mirrors server-side logic in `packages/ui/unified-chat/.../codeExecutionAvailability.ts` (comment cross-reference, `:743-763`)                                                                                                                                                         |
| Image generation mode       | `imageMode`/`imageModelId`, gated on `canUseImageGeneration`, `availableImageModels` (`:801,817-818`)                                                                                                                                                                                                                |
| Video generation mode       | `videoMode`/`videoModelId`, same gating pattern (`:809,820-821`); backed by a real server pipeline — `app/api/media/video/generate/route.ts` ("Proxies video generation requests to a live catalog-backed provider") and `app/api/media/video/status/route.ts` (polls Runway/Google Veo). **COMPLETE**, not UI-only. |
| Send / Stop / Retry / Queue | `sendButtonMode === 'stop' ? handleStop : handleSubmit` (`:3304`); `cancelQueuedMessage` (`:2014`)                                                                                                                                                                                                                   |
| Disabled/offline states     | `composerDisabled = disabled                                                                                                                                                                                                                                                                                         |     | trialExhausted` (`:1933`), consistently threaded through every control |

Composer is the single most thoroughly wired surface audited. Several inline
comments (`AUDIT-FIX CMP-3`, `CMP-10`, `Finding 1`) show this file has already
been through at least one prior "does the button actually do anything" audit
pass and the findings were fixed in place, not just documented.

### 3.3 Message rendering (`MessageBubble.tsx`, 2254 lines)

Confirmed real, imported renderers for: reasoning/thinking (`ThinkingBlock`),
tool-call timeline with approve/reject/resend and an **expiry guard**
(`approvalTurnExpired`, `:485` — prevents a stale in-memory-only approval
registry from rendering live-looking-but-dead Approve/Reject buttons after a
reload; comment explicitly names this "Finding 1" from a prior pass, already
fixed), citations/sources (`InlineSourceTags`, `InlineSourcesList`,
`ResearchActivity`), artifacts (`InlineArtifactCards`,
`extractArtifacts`/`removeArtifactBlocks`, streaming-artifact sync via
`useStreamingArtifactSync`), code blocks + **math** (KaTeX: `remark-math` +
`rehype-katex` wired in `lib/markdown-config.ts:2-3`), comparison responses
(`ComparisonResponse`), interactive cards (`InteractiveCardBlock`), image
generation cards + lightbox (`ImageGenerationCard`, `ImageLightbox`), code
execution results (`CodeExecutionBlock`), structured "rich cards" —
Calculation, Comparison, Recipe, Steps (`features/chat/components/cards/*`,
routed through `detectCardType`).

**Gap, not a bug:** no dedicated chart/graph (bar/line/pie) rendering type —
`grep -rln "recharts|Chart\b" features/chat/components` returns nothing.
"Rich cards" cover calculation/comparison/recipe/steps, not data
visualization. Not claimed anywhere in the UI as supported, so this is a
scope note, not a broken promise.

### 3.4 Response actions

Copy (`handleCopy`, `:930`), thumbs up/down reaction persisted to
`message.metadata.reaction` (`:1845-1909`), Regenerate (`onRegenerate`,
`:1919-1928`), Edit for user messages (`onEdit`, `:1951-1952`). All
prop-driven from `WebChatPage.tsx` with real backing handlers, not inline
no-ops.

---

## 4. Product surfaces

| Surface             | Route                                                          | Status                                                                                                                                                                                                                                                | Evidence                                                                                                                                                      |
| ------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chat                | `/chat`, `/chat/[sessionId]`                                   | **COMPLETE**                                                                                                                                                                                                                                          | §3                                                                                                                                                            |
| Code                | `/chat/code`                                                   | **COMPLETE**                                                                                                                                                                                                                                          | `features/code/CloudCodePage.tsx`, real `cloudCodeApi` service, wired to `WebSidebar`/`resolveWebViewRoute` from v3                                           |
| Projects (hub)      | `/chat/projects`                                               | **COMPLETE**                                                                                                                                                                                                                                          | `app/chat/projects/page.tsx` (461 lines), zero TODO/mock hits                                                                                                 |
| Projects (detail)   | `/chat/projects/[id]`                                          | **COMPLETE**                                                                                                                                                                                                                                          | 794 lines, real delete/instructions/file handlers                                                                                                             |
| Library             | `/chat/library`                                                | **COMPLETE**                                                                                                                                                                                                                                          | `LibraryView.tsx` fetches `/api/library`, `/api/media` (`:33-58`)                                                                                             |
| Schedules           | `/chat/schedules`                                              | **COMPLETE**                                                                                                                                                                                                                                          | `features/schedules/services/schedule-api.ts`, backed by `app/api/schedules/route.ts` + `[id]`                                                                |
| Tasks               | `/tasks`                                                       | **COMPLETE**                                                                                                                                                                                                                                          | Thin web adapter (`cloud-tasks-client.ts`) around the shared `@agiworkforce/unified-chat` `TasksPage` — desktop parity by design, not a second implementation |
| Customize           | `/chat/customize`                                              | **ALIAS** → `/settings/general`; comment: "standalone /customize surface duplicated Settings" (`app/chat/customize/page.tsx:3-7`)                                                                                                                     |
| Connectors          | `/connectors`, `/connectors/mcp-directory`                     | **HIDDEN/BACKEND_ONLY for most connectors** — see §4.1                                                                                                                                                                                                |
| Skills              | `/skills`, `/skills/[name]`                                    | **COMPLETE** (directory + detail) but see §4.1 note on install/download gating                                                                                                                                                                        |
| Plugins             | `/plugins`, `/plugins/[id]`, "Apps" (`/apps`)                  | **COMPLETE** — real `/api/plugins`, `/api/plugins/installations` CRUD wired in `WebSettingsModal.tsx:550-700`                                                                                                                                         |
| Settings            | `/settings/*` (25 routes)                                      | **COMPLETE** — see §1.2                                                                                                                                                                                                                               |
| Billing/Pricing     | `/pricing`, `/billing`, `/settings/billing`, `/settings/usage` | **COMPLETE** — see §4.2                                                                                                                                                                                                                               |
| Admin               | `/admin`, `/admin/directory-sync`                              | **COMPLETE** (readiness table + live security ops panel) — see §1.6                                                                                                                                                                                   |
| Gallery             | `/gallery`                                                     | **LIVE** — `GalleryClient` (not deep-audited beyond confirming it renders, not a stub)                                                                                                                                                                |
| Invite              | `/invite`                                                      | **LIVE** — `TeamInvitationAcceptance` component                                                                                                                                                                                                       |
| Sharing             | `/share/[token]`, `/shared-artifact/[token]`                   | **COMPLETE** (live path); `/shared/[id]` is **DEAD/legacy** — see §4.3                                                                                                                                                                                |
| BYOK (marketing)    | `/byok`                                                        | Marketing page describing Desktop/CLI/VS Code BYOK; the Web-specific reality lives at `/settings/byok` (env-key status only, no user BYOK on Web)                                                                                                     |
| Local (marketing)   | `/local`                                                       | Marketing page                                                                                                                                                                                                                                        |
| Pair                | `/pair`, `/pair/[code]`                                        | Thin marketing-shell stub that exists only to satisfy the AASA/Android-intent-filter claimed URL pattern; `[code]` segment is deliberately **not read** (`app/pair/[code]/page.tsx:8-11`) — "Nothing in the product mints a code-bearing pairing URL" |
| AGI Work / AGI Code | `/agi-work`, `/agi-code`                                       | Marketing pages describing modes that live inside the chat composer, not separate product surfaces                                                                                                                                                    |
| QA harnesses        | `/qa-artifacts`, `/dev/inline-toolcall-demo`                   | **DEV_ONLY**, production-killed — §1.5                                                                                                                                                                                                                |

### 4.1 Connectors / Skills — the most important "looks-live-but-isn't" finding

`WebSettingsModal.tsx:191-203` builds the connector catalog with
`canConnect: false` for every entry by default and a `statusLabel` of either
`'Coming soon'` (phase > 1) or **`'Not yet available on web'`** (phase 1).
The surrounding comment is explicit about why: _"POST /api/connectors
deliberately 501s (no per-provider authorization flow is implemented on web
yet), so NO connector renders a Connect button here ... the table shows a
truthful status label instead of a button that is known to fail"_
(`:180-189`). `canConnect` only flips `true` for connectors present in the
server-reported `available` list (`:346,391`) — in practice **GitHub** (App
install flow, redirects to `installStartPath` on a 409,
`WebSettingsModal.tsx:432-439`) and the user's own **custom remote-MCP
connectors** (bearer-token auth, `POST /api/connectors/custom`,
`:719-739`). Every other cataloged connector (Slack, Notion, Google Drive,
etc.) is genuinely **HIDDEN/BACKEND_ONLY** on Web — visible in the table,
honestly labeled, but not actionable. This is intentional and honestly
surfaced, not a bug — but it means the large majority of the connector
catalog is not actually usable from the web product today, only from
whichever surface (Desktop/CLI) has the real per-provider OAuth flow.

`Skills` catalog entries in draft lifecycle render `statusLabel: 'Coming
later'` (`WebSettingsModal.tsx:526`) — same honest-gating pattern.

### 4.2 Billing / Pricing — confirmed real, matches recent commit history

`/pricing` (1282 lines) wires real Stripe checkout: `handleUpgrade`
(`app/pricing/page.tsx:443`) posts to a checkout endpoint, is gated on a
server-reported `checkoutReady` flag per plan/cadence
(`:71,296,329`), surfaces `"{plan} checkout is unavailable in your
region"` rather than a fake-success path (`:457`), and opens the real Stripe
Customer Portal for existing subscribers (`openPortalFromPricing`, `:398`).

`BillingSection.tsx` (1085 lines) has the overage/credit-headroom feature
from the recent commit history (`feat(billing): finish overage — headroom,
opt-in toggle, and honest paywall copy`) fully wired: `POST
/api/billing/overage` toggle with optimistic-then-corrected state
(`:222-247`), initial fetch on mount (`:362-367`), and an
off-by-default opt-in toggle with the exact "Spend your credits when a usage
limit stops you" copy the commit message describes (`:927-928`).

### 4.3 Sharing — a genuinely duplicated, half-dead pair of implementations

Two independent "share a conversation publicly" backends exist:

1. **Live path**: `ShareConversationDialog` →
   `use-share-conversation.ts:98` → `POST /api/share` → writes to the
   `shared_sessions` table → serves at `/share/[token]`
   (`app/share/[token]/page.tsx`, queries `shared_sessions` directly via
   `getNeonDb()`). This is what the UI's Share button actually calls.
2. **Orphaned path**: `POST /api/shared` / `GET /api/shared?token=` →
   `shared_conversations` table → serves at `/shared/[id]`
   (`app/shared/[id]/page.tsx`, fetches via `/api/shared?token=`). **No
   component anywhere in `apps/web` calls `/api/shared`** —
   `grep -rn "'/api/shared'|fetch(\`/api/shared"`across the tree returns
zero hits outside the route file itself. The only other reference is a
*test* for the live path that explicitly asserts the opposite:`it('posts
   to /api/share (not the legacy /api/shared route) and stores the returned
   token'` (`features/chat/hooks/use-share-conversation.test.ts:34`) — the
codebase's own test suite names `/api/shared` "legacy."

**Classification: DUPLICATED / DEAD.** `/shared/[id]` and `app/api/shared/route.ts`
are a complete, functioning, but entirely unreachable-from-the-UI parallel
implementation of the same feature `/share/[token]` provides. They likely
exist only to keep previously-issued `/shared/<id>` links resolvable (an
honest reason, matching the pattern used by `/billing`'s own
post-checkout-splash-that-Stripe-still-points-at survival logic) but nothing
in the file marks this intent explicitly the way `/billing/page.tsx` does —
worth a one-line comment addition for the next person who finds it and
wonders whether to delete it.

---

## 5. Orphaned components (nothing imports them)

Swept every top-level component file under `shared/components/*.tsx` and
`features/*/components/*.tsx` for zero non-self, non-test references anywhere
in the tree:

| File                                          | Confirmed orphaned                                                                                                                                             |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/components/ScrollToTop.tsx`           | Route-change scroll-reset component; zero imports anywhere                                                                                                     |
| `shared/components/ErrorCard.tsx`             | Generic error-state-with-retry card; zero imports                                                                                                              |
| `shared/components/AnimatedAvatar.tsx`        | Avatar-with-fallback component; zero imports (call sites use `@agiworkforce/ui`'s `Avatar` directly instead)                                                   |
| `shared/components/LazyLoadWrapper.tsx`       | `lazyWithRetry()` HOC utility; zero imports                                                                                                                    |
| `features/chat/components/AgentStatusBar.tsx` | "Working on: [action]" status bar with collapsible `ActionTrail`; zero imports (the app uses `ActionTrail` directly elsewhere instead of through this wrapper) |
| `features/chat/components/MediaDisplay.tsx`   | Inline generated-image display + lightbox; zero imports (superseded by `ImageGenerationCard`/`ImageLightbox` used directly in `MessageBubble.tsx`)             |

Also confirmed **dead barrel export**, not a dead component:
`features/chat/components/dialogs/EnhancedExportDialog.tsx` — a full
multi-format (markdown/PDF/DOCX) chat-export dialog, exported from
`features/chat/components/dialogs/index.ts:1`, but the barrel itself has zero
importers (`grep -rn "from '.*components/dialogs'"` → nothing), and the
component's only other reference anywhere in the tree is a **code comment**
in `ResearchReportView.tsx:14-15` describing what it _used to_ reuse — that
file actually calls `documentExportService` directly instead. Its sibling
barrel exports (`KeyboardShortcutsDialog`, `GlobalSearchDialog`) **are** live,
but imported directly from their own files in `WebChatPage.tsx`, not through
the barrel — so the barrel itself is fully unused even though 2/3 of its
contents are live elsewhere. Net effect: **the conversation has no
reachable "Export" UI at all** beyond the header's Print action (§3.1) — a
fully-built export dialog sits unreachable.

`useExportConversation` hook (`features/chat/hooks/use-export-conversation.ts`,
re-exported `features/chat/hooks/index.ts:5`) has the same fate — zero
importers outside its own definition and the barrel re-export.

---

## 6. Summary classification table

| Item                                                                                                   | Classification                             | Key evidence                                                                                     |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `/login`, `/signup` (Clerk)                                                                            | COMPLETE                                   | `app/login/page.tsx`, `app/signup/page.tsx`                                                      |
| `/sign-in`, `/sign-up`, `/register`, `/auth/login`, `/device-auth`, `/user`, and 8 marketing redirects | COMPLETE (as aliases)                      | all confirmed intentional `redirect()` with documented callers                                   |
| Settings modal (25 routes, ~19 sections)                                                               | COMPLETE                                   | `WebSettingsModal.tsx`                                                                           |
| Chat composer (every control in the brief)                                                             | COMPLETE                                   | `ChatComposerNew.tsx`, `ComposerFooter.tsx`                                                      |
| Message rendering (all types except charts)                                                            | COMPLETE                                   | `MessageBubble.tsx`                                                                              |
| Video generation                                                                                       | COMPLETE (real Runway/Veo backend)         | `app/api/media/video/{generate,status}/route.ts`                                                 |
| Chart/graph message rendering                                                                          | **NOT BUILT** (scope gap, not advertised)  | no `recharts`/chart component found                                                              |
| In-app notification center                                                                             | **NOT BUILT** (scope gap)                  | zero hits for NotificationCenter/Bell                                                            |
| `features/chat/v3/*` (WebShellV3, v3 WebSidebar as a full page, cmd-K modal, empty state)              | **DEAD/HIDDEN** (parked convergence work)  | only consumed by unrouted `UnifiedChatPage`                                                      |
| Web connector "Connect" buttons (all but GitHub + custom MCP)                                          | **HIDDEN/BACKEND_ONLY** (honestly labeled) | `WebSettingsModal.tsx:180-203`                                                                   |
| `/shared/[id]` + `POST/GET /api/shared`                                                                | **DUPLICATED/DEAD**                        | superseded by `/share/[token]` + `/api/share`; zero UI callers; own test suite calls it "legacy" |
| `EnhancedExportDialog`, `useExportConversation`                                                        | **DEAD** (built, unreachable)              | zero non-barrel, non-self importers                                                              |
| 6 orphaned shared/feature components (§5)                                                              | **DEAD**                                   | zero references anywhere                                                                         |
| Billing overage/headroom toggle                                                                        | COMPLETE, matches recent commits           | `BillingSection.tsx:211-247,901-945`                                                             |
| Pricing/checkout                                                                                       | COMPLETE                                   | `app/pricing/page.tsx`                                                                           |
| Admin readiness dashboard                                                                              | COMPLETE (static/config-driven)            | `AdminConsolePage.tsx`                                                                           |
| Admin security ops panel                                                                               | COMPLETE (live API)                        | `admin-security-client.ts`                                                                       |
| Dev/QA harnesses                                                                                       | DEV_ONLY, correctly production-gated       | `app/qa-artifacts/layout.tsx`, `app/dev/layout.tsx`                                              |
| Prior-audit fixes still visible in code                                                                | Confirmed fixed, not re-broken             | `AUDIT-FIX CMP-3`/`CMP-10`, "Finding 1" comments in `MessageBubble.tsx`/`ChatComposerNew.tsx`    |

## 7. Notes on codebase health

- Only **5** TODO/FIXME comments in all of `apps/web` outside tests, none
  blocking a user-facing path (`app/api/portal/route.ts:199`,
  `features/settings/services/user-preferences.ts:136`, two in
  `lib/services/capability-handshake-service.ts`, one regex pattern in
  `lib/security/secrets-audit.ts:159`).
- The codebase shows clear evidence of at least one prior "does this button
  actually work" audit pass (comments tagged `AUDIT-FIX`, `Finding 1`,
  `CRIT-008`, `GOV-*`, `WEB-APPSHELL-MOBILE-SIDEBAR-01`, `SIX-24`) whose
  fixes are present and intact in the current tree — this pass did not find
  any of those specific previously-flagged issues regressed.
- The genuinely new findings from this pass (v3 shell dead code, `/shared`
  legacy duplication, orphaned export dialog, 6 orphaned components) are all
  low-severity in the sense that none of them mislead a user in the running
  product — they are either unrouted, or honestly labeled as unavailable.
  The one item worth prioritizing is the **orphaned export dialog**: a
  materially complete feature (multi-format conversation export) sits fully
  built and totally unreachable, which is the kind of gap most likely to
  surprise a PM who assumed it shipped.
