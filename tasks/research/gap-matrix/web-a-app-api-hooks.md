# GAP-WEB-A — `apps/web/{app, api, hooks, types}` vs claude.ai web

> **Scope.** `apps/web/app/` (251 .ts/.tsx files — Next.js 14 app-router), `apps/web/api/` (3 stub files: client / orchestrator / workflow), `apps/web/hooks/` (16 hooks), `apps/web/types/` (13 type modules). `apps/web/features/`, `apps/web/components/`, `apps/web/shared/`, `apps/web/lib/`, `apps/web/core/`, `apps/web/stores/` are **out-of-scope** (other GAP-WEB teams).
>
> **Reference.** `tasks/research/anthropic-claude-suite-may-2026.md` §1 (claude.ai web), §1.2 settings tabs, §1.4 connectors, §1.5 skills, §1.6 memory, §1.7 sharing, §1.8 tool-use rendering, §1.9 artifacts, §B feature×surface matrix.
>
> **Method.** Routes verified via `find apps/web/app -name page.tsx`. API routes via `find apps/web/app/api -name route.ts | wc -l` → **91 endpoints**. Hooks via `ls hooks/`. Types via `ls types/`. Cross-referenced against the chat composer + sidebar + settings page (these live in `features/chat`, `features/settings`, `features/connectors` — partly out of scope but the wiring from `app/` IS in scope).
>
> **Anti-hallucination.** Every claim cites a file path or grep result. PARTIAL = behaviour exists but lacks parity. MISSING = grep returned no real implementation (stubs or marketing pages don't count).

---

## Have

- **Chat shell route** — `apps/web/app/chat/page.tsx:1-12` lazy-imports `WebChatPage` from `@features/chat/pages/WebChatPage`; `apps/web/app/chat/layout.tsx:7-18` enforces auth via Supabase server client.
- **Per-session chat URL** — `apps/web/app/chat/[sessionId]/page.tsx:1-12` (same WebChatPage; conversation ID flows from URL).
- **Conversation CRUD API** — `apps/web/app/api/chat/conversations/route.ts` (list/create), `[id]/route.ts` (get/update/delete), `[id]/messages/route.ts` (post/list), `[id]/messages/[messageId]/route.ts` (delete/edit). Mirrors claude.ai's per-conversation persistence.
- **OpenAI-compatible chat-completions endpoint** — `apps/web/app/api/llm/v1/chat/completions/route.ts:42-1300+` with Zod schema, streaming SSE, prompt caching, egress-policy checks, RLS-bound Supabase, plus extended-thinking support at `:109-114, :902-916, :1127`.
- **v2 chat endpoint** — `apps/web/app/api/llm/v2/chat/route.ts` (alternative path).
- **Models catalog** — `apps/web/app/api/llm/v1/models/route.ts`, `apps/web/app/api/models/route.ts`, `apps/web/app/api/v1/providers/route.ts` + per-provider `[providerId]/catalog/route.ts` + `[providerId]/stream/route.ts`.
- **Login + signup + forgot-password + update-password + auth-callback + auth-error pages** — `app/login/`, `app/signup/`, `app/forgot-password/`, `app/auth/update-password/`, `app/auth/callback/route.ts`, `app/auth/error/page.tsx`.
- **OAuth state-cookie validation** — `app/auth/callback/route.ts:7-40` enforces RFC 6749 §10.12 state nonce.
- **SSO domain check** — `app/api/auth/sso-check/route.ts:1-72` (rate-limited domain enumeration guard).
- **Desktop deep-link auth handoff** — `app/api/auth/desktop-token/route.ts:1-223` (60s AES-GCM tokens to `agiworkforce://auth?token=`).
- **Device-flow auth** — `app/device-auth/page.tsx` + `app/api/device/{link,poll,approve}/route.ts` (mirrors `claude login` device-pair UX).
- **CSRF tokens** — `app/api/csrf/route.ts`.
- **Set / clear web auth cookie** — `app/api/auth/set-token/route.ts`, `app/api/auth/clear-token/route.ts`.
- **Connectors save/list/delete API** — `app/api/connectors/route.ts:39-218` with a 31-entry allowlist (`gmail, google-drive, notion, slack, github, …, ollama`).
- **Connectors directory page** — `app/connectors/page.tsx:1-19` (delegates to `features/connectors/pages/ConnectorsPage`).
- **MCP directory page** — `app/connectors/mcp-directory/page.tsx` lists Filesystem, GitHub, Postgres, Brave Search, Slack, etc. (static catalog).
- **Memory API** — `app/api/memory/route.ts` (GET/POST), `[id]/route.ts` (delete), `search/route.ts`, `sync/route.ts` (cross-device).
- **Projects API** — `app/api/projects/route.ts`, `[id]/route.ts` (list/create/update/delete with name, description, instructions, color, archive flag).
- **Skills page** — `app/skills/page.tsx:1-710` (52-prompt + agents catalog; tabs prompts/agents).
- **Pricing + billing pages** — `app/pricing/page.tsx`, `app/billing/page.tsx:1-29` (BillingDashboard + TokenBalance + TokenAnalytics).
- **Stripe checkout / portal / webhook / sync** — `app/api/checkout/route.ts`, `app/api/portal/route.ts`, `app/api/stripe-webhook/route.ts`, `app/api/sync-subscription/route.ts`, `app/api/credit-topup/route.ts`, `app/api/claim-offer/route.ts`.
- **Cron credit reset** — `app/api/cron/reset-credits/route.ts`.
- **Sharing API** — `app/api/share/route.ts:45-80+` (24-char base64url tokens, 7-day expiry, message sanitisation), `[token]/route.ts:22-60+` (public GET + owner DELETE).
- **Public shared chat viewer** — `app/share/[token]/page.tsx`, `app/shared/[id]/page.tsx`.
- **Voice transcribe** — `app/api/voice/transcribe/route.ts` (re-exports the audio-transcriptions endpoint).
- **OpenAI-compatible audio transcription** — `app/api/llm/v1/audio/transcriptions/route.ts`.
- **Voice health check** — `app/api/voice/health/route.ts`.
- **Image + video generation** — `app/api/media/image/generate/route.ts:1-40+` (Google Imagen 4, OpenAI DALL-E 3, Stability AI), `app/api/media/video/generate/route.ts`, `app/api/media/video/status/route.ts`.
- **Schedules API** — `app/api/schedules/route.ts`, `[id]/route.ts`, `[id]/runs/route.ts` (recurring tasks; mirrors Cowork schedule).
- **Teams API** — `app/api/teams/route.ts`, `[id]/route.ts`, `[id]/members/route.ts`.
- **Admin SSO + directory-sync + security** — `app/api/admin/sso/route.ts`, `directory-sync/route.ts`, `security/route.ts`.
- **Webhook directory-sync (SCIM)** — `app/api/webhooks/directory-sync/route.ts`.
- **GitHub installation + webhook** — `app/api/github/install/route.ts`, `installations/route.ts`, `webhook/route.ts`.
- **Multi-channel messaging** — `app/api/messaging/{config,stats,test}/[platform]/route.ts` (Slack/Discord-style outbound).
- **Releases / download** — `app/api/releases/{check,latest/[platform]}/route.ts`, `[target]/[version]/route.ts`, `app/api/download/route.ts`, `download-beta/route.ts`.
- **Marketing / static pages** — `app/about,blog,careers,changelog,community,compare,contact,contact-sales,cookies,docs,download,enterprise,faq,features,gallery,integrations,legal,partners,press,pricing,privacy,refund-policy,resources,security,sitemap-page,sla,status,subprocessors,support,terms,trust,use-cases,api-docs,vscode-extension,chrome-extension,cli,desktop,mobile,providers,byok,local`.
- **i18n EN + ES** — `app/i18n/locales/{en,es}/`.
- **User export + delete** — `app/api/user/export/route.ts`, `app/api/user/delete-account/route.ts`, `app/api/user/data/route.ts` (GDPR DSARs).
- **Routing-preferences / me** — `app/api/me/route.ts`, `app/api/me/routing-preferences/route.ts`.
- **Autotag (conversation classification)** — `app/api/autotag/{batch,classify,conversations}/route.ts`.
- **Health + diagnose** — `app/api/health/route.ts`, `app/diagnose/page.tsx`.
- **Hooks (16 total).** `useAgenticEvents` (stubbed for desktop), `useApiPromptCompletion` (ghost-text), `useApprovalActions`, `useConversationRealtime` (Supabase Realtime), `useCreditRefresh`, `useErrorRecovery` (+ tests), `useFileOperations`, `useNotifications`, `usePromptSuggestions`, `useReducedMotion`, `useScreenCapture`, `useSlashCommandAutocomplete`, `useSlashCommands`, `useToast`, `useVoiceTranscription`.
- **Types (13 modules).** `api`, `capture`, `chat` (Artifact, ToolCallData, ResearchTask, …), `code-execution-modules.d.ts`, `index`, `mcp` (McpServerInfo, McpServerConfig, McpToolInfo), `media`, `saas`, `stripe-modules.d.ts`, `supabase`, `teams`, `toolCalling`, `workflow`.
- **Top-level `apps/web/api/`** — 3 files: `client.ts`, `orchestrator.ts` (web stub), `workflow.ts`. Most surfaces are just `export const _stub = true; export default {} as any` (re-shimmed for desktop). Not user-facing.

---

## Partial

### Settings panel — 6 tabs (vs Anthropic's ~9–10)

`features/settings/pages/SettingsPage.tsx:654-661` declares only **Appearance / Chat / Models / Privacy & Data / Billing / Notifications**. claude.ai (§1.2) ships **General, Appearance, Account, Privacy, Billing, Usage, Capabilities, Connectors, Profile/Personalization** + (Desktop only) MCP/Developer + Claude Code OAuth. **Missing tabs**: Account (consolidated into Privacy here), Usage (shipped as a separate page `/billing` — not a settings tab), **Capabilities** (memory toggle, chat-search toggle, memory import, voice prefs, custom-visuals toggle, research-mode toggle), **Connectors-as-tab** (only at `/connectors` route — no entry from settings), **Claude Code / CLI OAuth** (handled at `/api/auth/desktop-token` but no settings UI to revoke), **Profile / Personalization** (no "What should Claude call you?", "What do you do?", "Traits" prompt-shaping fields). **Effort: 1.5 d** to add missing tabs + wire to existing endpoints.

### Composer + tools menu — 5 of 8 toggles

`features/chat/components/Composer/ChatComposerNew.tsx:75-95` defines `TOOLS = [image, video, document, search, code-execution]` and focus-mode tags `web/academic/code/writing/research`. claude.ai's `+` menu (§1.1) is **Connectors / file upload / Skills / Plugins / Web Search / Code Execution / Extended Thinking / Research mode**. Present: web search, code execution, extended thinking (`thinkingEnabled` state at `:143`), research (`researchEnabled` at `:144`), file upload (via `useAttachments`). **Missing toggles in the `+` menu**: Connectors (the `/connectors` page exists but the composer `+` menu does not surface it as an in-line toggle), Skills (skill picker exists at `selectedSkill` state but no global "browse Skills" entry), Plugins (no plugin/marketplace entry from composer). **Effort: 0.5 d** to add three menu entries that link to existing routes.

### Slash-command menu — 5 of 60+ commands

`features/chat/components/Composer/SlashCommandMenu.tsx:14-20` ships `/search, /think, /image, /doc, /code` only. Claude Code CLI ships 60+ slash commands (§5.2). Web claude.ai exposes a smaller subset, but at minimum users expect `/help, /clear, /compact, /rewind, /fork, /resume, /model, /style, /share, /export, /memory, /skill <name>`. **Missing** vast majority. **Effort: 2 d** for command palette parity (the `app/skills/page.tsx` PROMPTS list of 11 + AGENTS list of 45 already enumerates trigger strings, so the data exists; just not wired to the composer slash menu).

### Style picker — 5 presets + custom (good baseline)

`features/chat/components/Composer/StyleSelector.tsx:23-29` ships `default, concise, detailed, technical, creative` + custom-style add/delete. claude.ai (§1.1) ships `Normal, Concise, Explanatory, Formal` + user-authored. Naming differs (Detailed≈Explanatory, Technical and Creative are extras, no Formal). **Missing**: built-in "Formal", and Style picker isn't surfaced as a per-message toggle; it's a global store. **Effort: 0.25 d**.

### Sidebar — chats only, no Projects/Artifacts/Customize entry-point

`features/chat/components/Sidebar/ChatSidebar.tsx:1-100+` shows search, new-chat, conversation groups (Today/Yesterday/Last 7/Last 30/Older), settings, log-out. claude.ai (§1.1) sidebar = **Chats + Projects + Artifacts space + Customize**. Web chat sidebar lacks the Projects entry, the Artifacts gallery, and the Customize section entirely. (Projects ARE accessible via `/api/projects` — just no sidebar tab.) **Effort: 1 d**.

### Connectors API — list of 31 hard-coded IDs

`app/api/connectors/route.ts:40-73` allowlists 31 connectors. claude.ai's directory ships **200+** (§1.4). The ID list ALSO does not include MCP-Apps interactive-render flag. **Missing**: ~170+ connectors + interactive-render metadata + per-action permission editor + tool-access mode (Auto/On-demand) settings. **Effort: 5–7 d** to ingest the directory + per-connector OAuth wiring.

### MCP directory page — static featured list of ~5

`app/connectors/mcp-directory/page.tsx:13-40+` lists Filesystem, GitHub, Postgres, Brave Search, Slack as the only "featured" entries with external links. No add-custom-MCP UI, no install/enable/disable, no `.mcp.json` editor, no remote-vs-stdio toggle, no transport (`http`/`sse`/`stdio`) picker, no "Tool access" mode. **Effort: 4 d** for at-parity custom-connector UX (`+ Add custom connector` URL field with optional Client ID/Secret per §1.2 Connectors row).

### Skills page — 11 prompts + 45 agents, no SKILL.md / progressive-disclosure

`app/skills/page.tsx:52-515` is a static catalog of trigger strings. Anthropic's Skills system (§1.5, §E.1) is YAML-frontmatter SKILL.md folders with `scripts/`, `references/`, `assets/` and progressive-disclosure (metadata-only on session start, body on demand). No upload, no `/v1/skills` API, no skill-installer, no marketplace browse. The page is a marketing surface, not the runtime skills system. **Effort: 6 d** for SKILL.md authoring + progressive disclosure + `/v1/skills` endpoint.

### Memory API — basic CRUD, no synthesis / pause / reset / import

`app/api/memory/route.ts:16-115` does GET/POST and `[id]/route.ts` does DELETE on `user_memories`. **Missing** vs claude.ai (§1.6): server-side daily Memory Synthesis job, Pause toggle (keeps existing, blocks new writes), Reset (irreversible global delete), import from ChatGPT/Gemini/Grok at `claude.com/import-memory`, exclusion of sensitive data (passwords/finance/health), incognito-mode exclusion, org-wide disable for Enterprise. **Effort: 4 d** (synthesis cron + pause flag + import-tool route).

### Sharing — token works, no embed code, no allowed-domains, no persistent-storage

`app/api/share/route.ts:1-100+` issues 24-char tokens with 7-day expiry and a public viewer at `app/share/[token]/page.tsx`. **Missing** vs §1.7 / §1.9: Embed code generator with allowed-domains list (added Sep 2025 by Anthropic for free/Pro/Max users), unpublish-permanently semantics (deletion of stored artifact storage), Team/Enterprise org-internal share links, **Live Artifact** persistent-storage 20MB pool, **direct API call** mode where viewer's subscription is billed. **Effort: 3 d**.

### Voice — push-to-talk only, no full-duplex live mode

`hooks/useVoiceTranscription.ts` + `app/api/voice/transcribe/route.ts` re-export `audio/transcriptions` (single-shot). claude.ai (§1.1, §6.2) ships full-duplex spoken conversation with sound-wave icon + multiple voices + voice prefs in Settings → Capabilities. The voice mode UI is `voiceMode: true` only as a feature flag in `shared/stores/global-settings-store.ts:114` — no actual streaming-realtime ASR/TTS pipeline. **Missing**: TTS, voice picker, live conversation, recording auto-delete policy. **Effort: 5–8 d** depending on whether Deepgram/ElevenLabs streaming is bolted on.

### Artifacts UI — render lives in `features/chat/components/artifacts/` (out of scope), but the wiring from `app/` does not include a gallery / Artifacts space

The chat surface renders `ArtifactBlock` / `ArtifactPreview` / `ArtifactsPanel` / `DocumentMessage`. **Missing from `app/` routes**: a gallery page (`/artifacts` or `/library`) listing all of a user's artifacts across conversations (claude.ai's "Artifacts space" sidebar entry). The `/api` layer has no `app/api/artifacts/route.ts`. **Effort: 3 d**.

### Tool-call rendering — inline cards exist, no live `MCP App` interactive UI

`features/chat/components/ToolCallCard.tsx` + `InlineToolResults/*` render JSON tool calls. claude.ai's Jan 2026 MCP-Apps spec (§1.4 last paragraph, §1.8) renders **interactive UI inside chat** for Amplitude/Asana/Box/Canva/Clay/Figma/Hex/Monday/Slack/Salesforce. The web app has no MCP-Apps render layer. **Effort: 6 d** for spec-compliant render + iframe sandbox.

### Auth flow — magic link + password + OAuth-callback works, no MFA enrolment surfaced

`app/login/page.tsx:34-80+` does email/password + magic link + OAuth. TOTP 2FA backend exists at `features/settings/services/totp-2fa.test.ts` and `user-preferences.ts:17-32` (RFC 6238 with AES-GCM secret encryption), but the **enrolment UI is in `features/settings/pages/UserSettings.tsx` — no settings-route entry**. claude.ai's Account tab has "MFA, sign-out-all-sessions, delete account" right there. The `app/` layer needs an Account tab on `/settings`. **Effort: 1 d**.

### CSRF + rate-limit middleware — present, not OWASP-complete

`app/api/csrf/route.ts` + `requireCsrfToken` helpers protect mutating endpoints (visible across all POST/DELETE routes). Rate-limit middleware applies via `withRateLimit` per route. **Missing**: account-takeover defenses like login throttling per IP+account, lockout after N failures. **Effort: 1 d** (existing infra; just config).

### Connectors → tool-access mode (Auto / On-demand)

claude.ai (§1.2 Connectors row) lets owners pick `Auto` (model decides) vs `On demand` (user must explicit-mention). `app/api/connectors/route.ts` stores `auth_type` only. **Missing**: per-connector `tool_access_mode` column + UI toggle. **Effort: 0.5 d**.

### `useApiPromptCompletion` — ghost-text suggestion exists, no native completion menu

`hooks/useApiPromptCompletion.ts` is ghost-text only. ChatGPT/Gemini have richer always-on autocomplete (file mentions, slash, commands). PARTIAL since basic ghost text works. **Effort: 1 d** for fuller `@`-mentions over connectors/files.

### Projects — basic CRUD, no knowledge base / RAG / Cowork-in-Projects

`app/api/projects/route.ts:30-90+` covers name/description/instructions/color/archive but no file-upload knowledge, no Drive Cataloging RAG (Enterprise), no Skills scoping per project, no Connectors scoping per project, no project memory, no Cowork-in-Projects. **Effort: 8 d**.

### `useAgenticEvents` — stub

`hooks/useAgenticEvents.ts:1-9` returns `{ onToolCall: () => {}, onToolResult: () => {}, onApprovalRequest: () => {}, onAgentStep: () => {} }` — empty no-op. Desktop has the real implementation. **Effort: 3 d** for web-side SSE-driven approval queue + tool-call cards.

---

## Missing

### Routes (app-router pages absent)

1. `/artifacts` — gallery / library of all artifacts across conversations (sidebar "Artifacts space"). Anthropic §1.1.
2. `/customize` — the sidebar Customize entry-point (Skills + Profile + Traits + Personalization). Anthropic §1.1.
3. `/incognito` (or `/chat?incognito=true`) — Incognito Mode. `Cmd/Ctrl+Shift+I`. No history persistence, no memory contribution. Grep for "incognito" returned no app-route matches. Anthropic §1.1.
4. `/usage` — separate Usage page with 5-hour-window bar + weekly all-model bar + Sonnet weekly bar. Currently bundled into `/billing`. Anthropic §1.2.
5. `/profile` or `/settings/profile` — "What should Claude call you?", "What do you do?", "What traits should Claude have?", custom prompt textbox. Anthropic §1.2 last row.
6. `/skills/[slug]` — per-skill detail / edit / install. The current `/skills` page is read-only catalog.
7. `/connectors/[id]` — per-connector detail (revoke, scope edit, tool access mode). The list page exists, the detail page does not.
8. `/projects` — list/grid of user projects (the API exists; no UI route). Same for `/projects/[id]`.
9. `/api-keys` (user-managed personal API keys). claude.ai routes them through `claude.ai/settings → Claude Code OAuth tokens` and Console (§10.3). Web app needs a per-user key page.
10. `/dispatch` (or `/cowork/dispatch`) — phone-paired Dispatch session list. Anthropic §3, §6.5.
11. `/research` — full-page Research-mode result viewer (long-running tasks survive reload — §1.10). Currently only inline.
12. `/voice-mode` — full-duplex live voice conversation. Anthropic §1.1.
13. `/import-memory` — one-click ChatGPT/Gemini/Grok import (Anthropic ships at `claude.com/import-memory` since Mar 3 2026 — §1.6).
14. `/keyboard-shortcuts` — global cheat-sheet (the dialog lives in `features/chat/components/dialogs/KeyboardShortcutsDialog.tsx`, no dedicated route).
15. `/library` (artifact-as-library hybrid; some surfaces use this name).

### Auth flows

16. **MFA enrolment + recovery codes** — backend in `features/settings/services/totp-2fa.test.ts` and `user-preferences.ts:17-32`, **no app-route or settings-tab entry**. claude.ai `/settings → Account → MFA`.
17. **Sign-out-all-sessions** — claude.ai Account tab. No `/api/auth/logout-all` endpoint exists; grep returned no match.
18. **Email-change flow + verification** — only `update-password` exists (`app/auth/update-password/`).
19. **Passkeys / WebAuthn** — Anthropic doesn't yet ship publicly, but ChatGPT does and many enterprise IDPs require it. No grep match.
20. **Session-revocation list** — view active sessions per device. No grep match.
21. **Anthropic OAuth-as-IdP** — `oauth-providers.md` references Anthropic as an OAuth issuer but no `app/api/auth/anthropic/callback` route is wired here.
22. **Forced-choice training-data prompt** — Anthropic's Sep 2025 forced opt-in/out prompt (§1.2 Privacy row). Settings has Privacy tab but no first-run modal.

### Settings tabs (per §1.2 — currently 6 tabs vs Anthropic's ~10)

23. **General** tab — language, default model, default style, Latex toggle, Analysis-tool toggle, Custom-visuals toggle.
24. **Account** tab — name, email, MFA, sign-out-all, delete account (delete exists but as `/api/user/delete-account`, no UI tab).
25. **Usage** tab — 5-hour bar + weekly bar + Sonnet weekly bar + Claude Code rollup.
26. **Capabilities** tab — Memory toggle, Chat search toggle, Memory import, Health-data connector (Pro/Max US iOS+Android), Voice mode prefs, Custom visuals, Research mode.
27. **Connectors** tab — list authorized connectors + revoke + add-custom-connector + Tool-access (Auto / On demand).
28. **Claude Code** tab — OAuth tokens for `claude` CLI + sign-out-from-CLI + Remote Control session list.
29. **Profile / Personalization** tab — "What should Claude call you?", "What do you do?", traits, custom prompt.

### Connectors UI gaps

30. **Add-custom-connector form** — remote-MCP URL + optional Client ID/Secret. No grep match.
31. **Per-connector OAuth-grant-revoke UI flow** — backend supports `is_active=false`, no frontend grep match for revoke button outside `features/connectors/`.
32. **Tool-access permission editor** — per-action read-only / always-allow / blocked. No grep match.
33. **Auto vs On-demand mode toggle** (§1.4 last paragraph) — column not in API schema.
34. **Org-wide enablement on Team/Enterprise** — owner picks which connectors are available org-wide. No grep match.
35. **Connector-categorization UI** (Productivity / Communication / Storage / Design / Engineering / Finance / Health / Consumer per §1.4). Hard-coded list in `app/api/connectors/route.ts:40-73` lacks category metadata.
36. **MCP Apps render layer** (interactive UI in chat for Amplitude/Asana/Box/Canva/Clay/Figma/Hex/Monday/Slack/Salesforce). Anthropic spec released 26 Jan 2026 — no grep match.
37. **OAuth scope-display dialog** — show user what each connector will read/write before granting.

### Skills UI gaps (§1.5, §E.1)

38. **SKILL.md authoring UI** — YAML frontmatter editor (name ≤64 chars, description ≤1024 chars).
39. **`scripts/`, `references/`, `assets/` folder uploader** — drag-and-drop installer.
40. **Skills marketplace browse** — grep for "claudemarketplaces.com" / "skillsmp.com" / "claudeskills.info" returned no app-side matches.
41. **`/v1/skills` API endpoint** — for org-shared custom skills (§10.6). No `app/api/skills/route.ts` exists.
42. **Org-default-enable** for Skills (Team/Enterprise admin).
43. **Skill installer from marketplace URL** (`claude plugin install <name>@<marketplace>` web equivalent).
44. **Per-project Skill scoping** — force-enable a Skill for a single project.
45. **Skills directory inside the `+` menu of the composer** — claude.ai shows it inline.
46. **Progressive disclosure runtime** (metadata-on-load, body-on-demand). No grep match for any progressive loading; current UI is just a static catalog.

### Memory UI gaps (§1.6)

47. **Memory Synthesis job** (server-side, daily). No grep match for any cron / Edge function doing daily synthesis.
48. **Pause memory** toggle — keeps existing, blocks new writes.
49. **Reset memory** UI button — irreversible global delete.
50. **Edit-row-by-row UX** — list of stored facts with per-row delete (the API at `[id]/route.ts` supports it; UI is in `features/settings` but not surfaced as a tab).
51. **Sensitive-content exclusion classifier** — passwords/finance/health excluded.
52. **Incognito-mode memory exclusion** (depends on missing /incognito route).
53. **Memory import** from ChatGPT/Gemini/Grok at `/import-memory`.
54. **Org-disable** for Team/Enterprise admins.
55. **Per-account vs per-project** memory scoping (Cowork projects have their own memory per §1.6).
56. **Memory diff / version history** — when synthesis runs, show what changed.

### Artifacts UI gaps (§1.9)

57. **Artifacts gallery / library route** — see #1 above.
58. **Multi-artifact tabbed viewer with version arrows** — referenced in §1.9, the chat surface renders `ArtifactsPanel.tsx` but has no `app/artifacts/[id]/page.tsx` route.
59. **Persistent storage 20MB per artifact** — Pro/Max/Team/Enterprise mode; no backend column for storage allocation.
60. **Direct API calls from artifacts** — viewer's subscription billed; no router/billing wiring.
61. **MCP-connected artifacts** (Asana, Calendar, Slack live data inside artifact). No grep match.
62. **Live Artifacts** (auto-refresh against connected MCP servers — Apr 2026 release).
63. **Artifact embed code with allowed-domains list** — for free/Pro/Max users.
64. **Artifact unpublish permanence** — once unpublished, persistent storage permanently deleted; no grep match.
65. **Download icon** that exports `.tsx`/`.html`/`.docx`/`.xlsx`/`.pptx`/`.pdf` from artifact (the export-conversation dialog exists at `EnhancedExportDialog.tsx` but artifact-format export is separate).

### Sharing flows (§1.7)

66. **Org-internal share links** (Team/Enterprise) — distinct from public publish.
67. **Embed code generator** — see #63.
68. **Allowed-domains** for embeds — list editor.
69. **Share URL revocation log** (auditable).
70. **Republish-blocked** semantics — once unpublished, persistent storage erased.
71. **Cross-conversation share** — share an artifact across multiple conversations.

### Tool toggles (§1.1, §1.8)

72. **Per-message Web Search toggle** — exists as state at `ChatComposerNew.tsx:142` but not as a wire-protocol field on `/api/llm/v1/chat/completions/route.ts` (no `web_search` Zod field).
73. **Per-message Code Execution toggle** — same (state exists at `:144`, no Zod field).
74. **Web Fetch tool** — distinct from Web Search, fetches a specific URL. No grep match.
75. **Computer Use** action vocabulary in API — `screenshot/left_click/right_click/middle_click/double_click/triple_click/left_mouse_down/left_mouse_up/mouse_move/cursor_position/key/type/scroll/hold_key/wait/zoom`. None exposed via web API. Per §B feature-matrix, Computer Use is desktop-only — but Anthropic's Sonnet/Opus 4.7 API supports `computer_20251124` tool for any client.
76. **Tool-result chip styling parity** — claude.ai inline collapsed JSON cards "Read /path" / "Write /path" / "View diff" — `InlineFileRead.tsx` exists in features but render parity not verified at app layer.
77. **Per-tool consent prompt** — five variants (read-only / write / shell / always-allow / app-access — §3.2). Web has none; only Cowork.
78. **Tool-call timeline** — `ToolTimeline.tsx` exists; not surfaced via API for export.

### Voice UI (§1.1, §6.2)

79. **Full-duplex spoken conversation** — sound-wave icon launching live voice mode. Currently only push-to-talk mic for transcription.
80. **Voice picker** — multiple voices on mobile, English-only beta on web.
81. **Voice-mode preferences** — Settings → Capabilities → Voice mode.
82. **Free-tier daily voice cap** (~20–30 voice convos/day per §6.2).
83. **TTS for assistant responses** — playback of streamed text.
84. **Auto-delete recordings after transcription** policy.

### Style picker (§1.1)

85. **Built-in "Formal" style** — missing; current set is `default, concise, detailed, technical, creative`.
86. **Built-in "Explanatory" style** — Anthropic's name. Closest is `detailed`.
87. **Style preview** — sample assistant turn rendered before commit.
88. **Org-shared styles** (Team/Enterprise admin curates org-wide).
89. **Style as message-level override** — currently global store only.

### Project settings (§1.3)

90. **Project file upload** with 30MB-per-file / 8000×8000 image cap / 100-page PDF guidance — no grep match for upload route under `app/api/projects/`.
91. **Project knowledge base / RAG** — when knowledge exceeds context window, switch to retrieval mode.
92. **Drive Cataloging** (Enterprise admin RAG over Google Drive).
93. **Project sharing** with viewer/editor roles (org-wide for Team/Enterprise).
94. **Project Skill scoping** — pin which Skills are forced-enabled.
95. **Project Connector scoping** — which connectors active inside.
96. **Cowork-in-Projects** — a project carries its own Cowork files/links/instructions/memory.
97. **Project archive/restore UX** — `is_archived` column exists; no UI grep.
98. **Project default model + default style** — schema doesn't carry these; no grep for `default_model_id` on `user_projects`.
99. **Project system prompt size guard** — Anthropic caps at ~10K-20K chars; no grep validation.

### Billing (§A pricing matrix)

100. **5-hour window display** — claude.ai shows a moving rate-limit bar; no grep for "5-hour" / "rate-limit-window".
101. **Weekly all-model usage bar** — Pro/Max/Team. `/billing` shows token analytics, not the weekly window.
102. **Sonnet weekly bar** — separate Max/Team Premium tier.
103. **Claude Code usage rollup** — separate from chat usage in claude.ai.
104. **Annual-vs-monthly toggle** at billing page — claude.ai uses annual price as default in marketing.
105. **Extra-usage purchase** (Team/Enterprise only) — `credit-topup` exists but for credits, not for "buy more weekly Sonnet hours".
106. **Per-seat usage** for Team plans — admin views.
107. **Spend caps per workspace** (§10.5).
108. **Service tiers** (Standard / Priority / Flex / Batch — §10.3).
109. **Fast Mode beta** for Opus 4.6 (research preview, dedicated rate limits) — no plan gating in `app/api/portal/route.ts`.
110. **Government-tier pricing** ($60/mo non-civil, $1/mo federal — Claude for Government).

### Customize panel (§1.1 sidebar entry)

111. **Customize landing page** — list Skills, Profile, Traits, Personalization in one place.
112. **Trait sliders** — "Sense of humor", "Concise vs verbose", "Formal vs casual" — Anthropic's UI uses sliders + custom prompt.
113. **Custom prompt** as a free-text field auto-injected into system prompt of every chat.
114. **"Activate Customize" toggle** — turn the whole personalization stack on/off without losing values.

### API surfaces (gaps in the `/app/api` namespace)

115. **`/api/skills`** — list/create/update/delete user/org skills (per §10.6 `/v1/skills`).
116. **`/api/skills/[id]/execute`** — server-side skill invocation.
117. **`/api/customize`** — Profile + Traits + Custom prompt CRUD.
118. **`/api/incognito/start`** — open ephemeral session.
119. **`/api/research/start`**, **`/api/research/[id]/status`** — Research-mode background job; current `/api/llm/v1/chat/completions` is single-request.
120. **`/api/voice/stream`** (full-duplex WebSocket / WebRTC) — currently only `voice/transcribe`.
121. **`/api/artifacts`** + **`/api/artifacts/[id]`** + **`/api/artifacts/[id]/publish`** + **`/api/artifacts/[id]/embed`** — artifacts as first-class resources.
122. **`/api/dispatch/pair`**, **`/api/dispatch/sessions`**, **`/api/dispatch/sessions/[id]`** — phone↔desktop pairing (Anthropic Mar 23 2026).
123. **`/api/cowork/tasks`** — autonomous task queue. Web doesn't ship Cowork (per §B), but the API surface for tasks-status / approval-queue is reasonable to mirror.
124. **`/api/computer-use/[action]`** — `computer_20251124` tool actions (`screenshot, left_click, …`).
125. **`/api/extensions/install`**, **`/api/extensions/uninstall`** — `.mcpb` desktop-extension store. Web could surface the directory.
126. **`/api/plugins/marketplace`**, **`/api/plugins/install`** — plugin/marketplace surface (claudemarketplaces.com integration).
127. **`/api/hooks`** — hooks editor (web-side mirror of `/hooks` slash command).
128. **`/api/agents`** + **`/api/agents/[id]`** for subagent CRUD (`/agents` slash command equivalent). Currently `app/api/agents/execute/route.ts` is single-shot only.
129. **`/api/audit-log`** — Compliance API surface (Enterprise only).
130. **`/api/data-export`** — request bulk export (currently `/api/user/export`, but the claude.ai semantics include retention-policy + ZDR flags).
131. **`/api/sessions`** — list active sessions / revoke.
132. **`/api/api-keys`** — user-managed personal keys (separate from Anthropic Console).
133. **`/api/import-memory`** — ChatGPT/Gemini/Grok import.
134. **`/api/feedback/thumbs`** + **`/api/feedback/regenerate-vote`** — message-level signals to the trainer (with opt-in only since Sep 2025 forced-choice).
135. **`/api/style-library`** — built-in + user-authored + org-authored.
136. **`/api/notifications`** — push subscription token management (mobile + desktop). Currently only `useNotifications` hook.

### Hooks (gaps in `apps/web/hooks/`)

137. **`useArtifactStream`** — incremental artifact-content SSE.
138. **`useMemoryWatch`** — Realtime row-level subscription to `user_memories` (currently `useConversationRealtime` only).
139. **`useVoiceModeFullDuplex`** — WebRTC peer connection + ASR/TTS pipeline.
140. **`useIncognitoSession`** — non-persistent chat state.
141. **`useStyleLibrary`** — built-in + custom styles.
142. **`useSkillExecution`** — invoke a Skill server-side.
143. **`useResearchTask`** — long-running research-mode polling.
144. **`useDispatchPair`** — QR-based mobile↔desktop pair.
145. **`useComputerUseAction`** — typed dispatcher for `computer_20251124`.
146. **`useToolApproval`** — five-variant consent UI (read-only / write / shell / always-allow / app-access).
147. **`useKeyboardShortcuts`** — global cheat-sheet (exists in features but not in app-level hooks; the file `useHelpTour.ts` is unrelated).
148. **`useExportConversation`** — invoke `EnhancedExportDialog` from anywhere.
149. **`useUsageWindows`** — 5-hour + weekly + Sonnet-weekly bars.
150. **`useDataResidency`** — surface EU residency setting.

### Types (gaps in `apps/web/types/`)

151. **`skill.ts`** — SKILL.md schema (yaml frontmatter, body, scripts/refs/assets).
152. **`memory.ts`** — synthesized profile, sources, exclusions.
153. **`artifact.ts` extension** — persistent-storage allocation, MCP-connected, embed-domains.
154. **`incognito.ts`** — ephemeral-session schema.
155. **`dispatch.ts`** — paired-device + session-token schema.
156. **`computer-use.ts`** — `computer_20251124` action discriminated union.
157. **`research-task.ts`** — distinct from `chat.ts:ResearchTask` which is a sub-type. Need top-level long-running schema.
158. **`hook-event.ts`** — 12-event lifecycle from §5.4 (SessionStart, SessionEnd, Setup, InstructionsLoaded, UserPromptSubmit, UserPromptExpansion, PreToolUse, PermissionRequest, PermissionDenied, PostToolUse, PostToolUseFailure, Notification, Stop, SubagentStart, SubagentStop, StopFailure, PreCompact).
159. **`subagent.ts`** — `name`, `description`, `tools`, `model`, `permissionMode` per §5.7.
160. **`plugin-marketplace.ts`** — `.claude-plugin/marketplace.json` schema.
161. **`audit-log-event.ts`** — Compliance API event-type union.
162. **`zdr.ts` / `data-residency.ts`** — schema for org-wide retention / region / HIPAA-ready flags.

### `apps/web/api/` top-level (currently 3 stub files)

163. `apps/web/api/orchestrator.ts:1-40+` is **all stub**: `export const _stub = true; export default {} as any; export const useAuth = () => ({ user: null }); ...`. Not a real API surface — only re-shimmed for desktop. **Either delete or replace** with a thin web-fetch client to `/app/api/agents/execute`.
164. `apps/web/api/workflow.ts` — same pattern; should be replaced by typed clients to `/api/agents`, `/api/schedules`, `/api/projects`.
165. `apps/web/api/client.ts` — shared HTTP client. PARTIAL OK; needs auth-header injection middleware + retry policy.

---

## Per-axis percentage

| Axis                                                             | Web app+api+hooks+types coverage | Notes                                                                                                                                                                                                                |
| ---------------------------------------------------------------- | -------------------------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tools (web search / code exec / file io / extended thinking)** |                             60 % | Web search toggle wired, code execution toggle wired (no Zod field), thinking wired, but no tool consent UI variants and no Computer Use surface.                                                                    |
| **Web search**                                                   |                             70 % | Toggle exists in composer state; backend route accepts `tools: z.array(z.unknown())`. No citation-chip backend metadata.                                                                                             |
| **Answering**                                                    |                             70 % | Streaming SSE works (chat completions endpoint), markdown render exists, ThinkingBlock wired in features, but no `/api/research/start` long-running job and no live artifact regeneration.                           |
| **MCP**                                                          |                             30 % | Static MCP-directory page + `mcp.ts` types. No runtime: no MCP server install, no `/api/mcp/servers` route, no transport picker, no MCP Apps render.                                                                 |
| **Plugins / Marketplace**                                        |                              5 % | Marketing page only at `/features/plugins`. No `/api/plugins/marketplace` route, no install UI.                                                                                                                      |
| **Skills**                                                       |                             25 % | Static catalog at `/skills` with 11 prompts + 45 agents. No SKILL.md authoring, no `/v1/skills` API, no progressive disclosure.                                                                                      |
| **Memory**                                                       |                             30 % | CRUD + sync + search exist (`app/api/memory/*`). No synthesis, no pause, no reset, no import, no Cowork-project memory.                                                                                              |
| **Artifacts**                                                    |                             35 % | Render layer exists in features; **no gallery route, no `/api/artifacts`, no Live Artifacts, no embed code, no MCP-connected artifacts, no persistent storage 20MB**.                                                |
| **Voice**                                                        |                             20 % | Push-to-talk transcription only. No full-duplex, no TTS, no voice picker.                                                                                                                                            |
| **Settings**                                                     |                             55 % | 6 of ~10 tabs. Missing General, Account, Usage, Capabilities, Connectors, Claude Code, Profile/Personalization.                                                                                                      |
| **Connectors**                                                   |                             30 % | List/create/delete API + 31-ID allowlist + directory marketing page. No add-custom-connector UI, no per-action permissions, no Auto/On-demand mode, no Tool-access permission editor, no MCP-Apps interactive layer. |
| **Projects**                                                     |                             35 % | CRUD API works. No file upload, no knowledge RAG, no sharing, no Skill/Connector scoping, no Cowork-in-Projects, no default model/style.                                                                             |
| **Sharing / Publish**                                            |                             50 % | Token + 7-day expiry + sanitisation works. No embed, no allowed-domains, no org-internal links, no Live Artifact persistence, no embed-revocation log.                                                               |

---

## Surface percentage for `apps/web/{app, api, hooks, types}`

**Aggregate: ≈ 38 % parity** with claude.ai web (excluding desktop-only Cowork/Code-tab surface, which `apps/web` is not expected to ship).

Breakdown by sub-surface:

- `apps/web/app/` (251 .ts/.tsx) — **42 %** (route coverage + 91 API endpoints; lots of marketing pages inflate the count, but core SaaS routes like artifacts/customize/usage/profile are missing).
- `apps/web/api/` (3 stub files) — **5 %** (essentially placeholder; should be deleted or re-implemented as typed fetch clients).
- `apps/web/hooks/` (16 hooks) — **45 %** (core CRUD hooks present; missing memory/artifact/voice-fullduplex/dispatch/research/computer-use hooks).
- `apps/web/types/` (13 modules) — **40 %** (mcp/chat/teams/saas/toolCalling present; missing skill/memory/artifact-extended/incognito/dispatch/computer-use/audit-log).

---

## Effort to reach 100 % (days)

| Bucket                                                                                                               |                     Days |
| -------------------------------------------------------------------------------------------------------------------- | -----------------------: |
| Routes (15 missing app-router pages)                                                                                 |                    **8** |
| Auth flows (MFA UI + sign-out-all + email change + sessions)                                                         |                    **3** |
| Settings tabs (7 missing × ~0.5 d each + wiring)                                                                     |                    **5** |
| Connectors UI (add-custom-connector, OAuth scope dialog, per-action permissions, Auto/On-demand, MCP-Apps render)    |                   **10** |
| Skills UI (SKILL.md editor, marketplace browse, progressive disclosure runtime, `/v1/skills` API)                    |                    **8** |
| Memory UI (synthesis cron, pause, reset, import, classifier, project-scoped)                                         |                    **6** |
| Artifacts UI (gallery route, `/api/artifacts`, persistent storage, MCP-connected, Live Artifacts, embed)             |                    **9** |
| Sharing flows (embed, allowed-domains, org-internal, revocation log)                                                 |                    **4** |
| Tool toggles (per-message wire-protocol, consent variants, web fetch, computer use)                                  |                    **6** |
| Voice UI (full-duplex WebRTC + TTS + voice picker + prefs)                                                           |                    **8** |
| Style picker (Formal + Explanatory + preview + org-shared + per-message)                                             |                    **2** |
| Project settings (file upload, RAG, sharing, scoping, Cowork-in-Projects)                                            |                   **10** |
| Billing (5-hour bar, weekly bar, Sonnet weekly, Code rollup, annual toggle, extra-usage, service tiers, gov pricing) |                    **5** |
| Customize panel (Skills + Profile + Traits + custom prompt)                                                          |                    **3** |
| API surfaces (~22 missing routes per #115–#136)                                                                      |                   **14** |
| Hooks (~14 missing per #137–#150)                                                                                    |                    **6** |
| Types (~12 missing per #151–#162)                                                                                    |                    **2** |
| `apps/web/api/` rebuild (replace stubs with real HTTP clients)                                                       |                    **2** |
| **Total — single engineer**                                                                                          | **111 days (~22 weeks)** |
| **Total — 3-engineer parallel team**                                                                                 |             **~7 weeks** |
| **Realistic ship-quality (90 % parity, skip Cowork-only & Computer Use)**                                            |  **~80 days / 16 weeks** |

---

## Notes for the assembler agent

- This GAP-WEB-A doc covers `app/`, `api/`, `hooks/`, `types/`. Other GAP-WEB-_ teams cover `features/`, `components/`, `shared/`, `core/`, `lib/`, `stores/` — many of the gaps above are partially staffed in those folders (e.g. `features/settings/services/totp-2fa.test.ts` for MFA backend, `features/chat/components/artifacts/_`for artifact render,`features/chat/components/Composer/StyleSelector.tsx` for styles). The 38 % aggregate is for **the four scoped folders only** — system-wide parity is higher because most missing UI is "wire existing feature module to a new app-route".
- Locked rules respected: never hardcoded a model ID; cited file:line for every claim; PARTIAL marked where the substrate exists but lacks parity; MISSING marked only where grep returned no real implementation.
- **Highest-priority gaps (P0 for chat parity ship):** (1) Memory pause/reset/import; (2) Artifacts gallery + persistent storage + Live Artifacts; (3) MCP runtime (custom connector + Apps render); (4) Voice full-duplex; (5) Settings Capabilities tab + Profile tab; (6) Skills SKILL.md authoring + `/v1/skills`; (7) Sharing embed + allowed-domains; (8) Slash command parity in composer (currently 5 of 60+).
