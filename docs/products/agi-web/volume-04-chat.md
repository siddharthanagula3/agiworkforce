# AGI Web — Volume 04 — Chat

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (root), `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), `apps/web/AGENTS.md`. Grounded in the real repo paths enumerated in the Repository map below (`apps/web/features/chat/**`, `apps/web/app/api/{chat,search,shared}/**`, `apps/web/proxy.ts`). Rendering detail lives in Volume 05.

## Overview & stance

This volume covers the AGI Web chat surface: composing a turn, streaming a response, and the per-message and per-conversation operations around it. AGI Web is **cloud-only**: no Local mode, no BYOK. Every chat is a **Managed Cloud** session, subscription-backed via Clerk identity + Neon account state; there is no free env-key chat. Because Web carries only one trust mode, the composer must **never** render a Local or BYOK affordance, a "fork to BYOK" control, or a provider-key input — those belong to Desktop/CLI/VS Code only. Cross-device continuity uses the Neon delta-sync APIs Web hosts (only Managed-Cloud rows sync). Models come only from `packages/types/src/models.json`; this volume introduces no model IDs.

## Conversation Lifecycle

A conversation is created on first send, titled (auto or user-set), listed, renamed, pinned/foldered, and soft-deleted with a `deleted_at` tombstone. Persistence and cross-device continuity flow through the delta-sync store (cursor + tombstones + idempotent upsert by `id`=`cloud_id`; `user_id` set server-side from the verified session; RLS `WITH CHECK` backstop). **✅ Built** — `apps/web/app/api/chat/{sessions,conversations,sync}/route.ts`. Requirement: every route is Clerk-authenticated (gated in `apps/web/proxy.ts`) and user-scoped; no signed-out writes. Messages are append-only in sync (only a tombstone mutates an existing message).

## Message Composer — input, plus/add, attach, model selector, mic, send/stop, visible trust label (UX Lock)

Auto-growing textarea with placeholder, Enter-to-send / Shift+Enter-newline, a live token guard (~5k soft cap), a leading **+ (plus/add)** tools popover (image, video, document, web search), a **Paperclip** attach control, a **model selector**, a **mic** dictation button, and a 3-state **send/stop** button. **✅ Built** — `ChatComposer.tsx` / `ChatComposerNew.tsx`; `SendButton.tsx` renders `ArrowUp` (send) and a red `Square` (stop, aborts the SSE stream); the `ComposerFooter.tsx` selector reads `AVAILABLE_MODELS` from the model-store (providerKey from `models.json`) and gates by plan via `isModelAllowedForTier`; mic via `VoiceInputButton.tsx` (Volume 06). **UX Lock (🟡):** the composer surfaces the active provider/model (`ComposerFooter` maps `managed_cloud`→`agi-cloud` with a logo) and mode chips (`ActiveModeTags.tsx`), but a persistent, always-visible "Managed Cloud" trust label as a distinct element is not confirmed — verify or add. The hard invariant holds by construction: Web has no Local/BYOK code path.

## Attachments

Files attach via the Paperclip control or drag-and-drop, showing removable preview chips before send. **✅ Built** — `AttachmentPreview.tsx`, `DragDropOverlay.tsx`, `use-attachments.ts`, `attachment-handler.ts`. Requirement: attachments are validated (type/size) client-side and uploaded to Managed-Cloud storage; unsupported files fail with an inline error, never a silent drop. Upload/storage/security detail is owned by Volume 07.

## Streaming

Responses stream token-by-token over SSE; the composer switches to **stop** while generating, and stopping aborts the stream and preserves partial content. **✅ Built** — `chat-ai-service.ts` (SSE consumption), `SendButton.tsx` stop state (`Square`, aborts). Requirement: an `AbortController` cancels the request on stop; a dropped connection surfaces a retry affordance, not a hang; partial Markdown never throws mid-stream.

## Markdown

Assistant prose renders as sanitized CommonMark + GFM on the live streaming path; raw HTML in model/tool output is sanitized on **every** frame, not just the final one. **✅ Built** — `apps/web/features/chat/components/messages/MarkdownContent.tsx` (Volume 05 owns the full pipeline and the mandatory `rehype-sanitize`-after-`rehype-raw` boundary).

## Code Blocks

Fenced code renders with a language label, hover **Copy** (async Clipboard + fallback), overflow scroll, and `github-dark` highlighting; inline code is a mono chip; unknown languages degrade to a plain block, never an error. **✅ Built** — `MarkdownContent.tsx` / `EnhancedMarkdownRenderer.tsx` (Volume 05).

## Tables

GFM tables render in a horizontally scrollable, bordered container that never breaks message layout — overflow scrolls within the table, not the page. **✅ Built** — table components in `EnhancedMarkdownRenderer.tsx` (Volume 05).

## LaTeX

Math renders via KaTeX after a delimiter-normalization pass (`\[…\]`→`$$`, `\(…\)`→`$`) that protects code spans. **✅ Built** — `apps/web/features/chat/components/messages/preprocessMath.ts` + `remark-math`/`rehype-katex` (Volume 05). Requirement: display math is block-wrapped to avoid the `katex-display`-in-`<p>` hydration bug.

## Citations

Web-search/tool sources render as numbered pills with a hover preview (title, snippet, hostname) and inline source tags. **✅ Built** — `apps/web/features/chat/components/messages/InlineCitation.tsx` (Volume 05). Requirement: citation links open in a new tab with `rel="noopener noreferrer"`; 🟡 gap: automatic `[n]`-marker parsing into chips is not yet fully wired end-to-end.

## Editing

User messages are editable inline: an auto-resizing pre-filled textarea, Cmd/Ctrl+Enter to save, Escape to cancel; saving updates the message and replays the turn. **✅ Built** — `EditableMessage.tsx`, `pendingEdit.ts`, entry via `MessageActions.tsx`. Requirement: an edit that re-runs generation must preserve the original send options (tools/search/style) via replay metadata.

## Regeneration

A message can be regenerated from the actions menu (`RotateCw`), replaying the originating turn. **✅ Built** — `MessageActions.tsx` + `apps/web/features/chat/lib/regenerateReplay.ts`. Requirement: regenerate is **blocked with an explicit message** for skill-guided or legacy tool-assisted turns whose options cannot be safely replayed (already encoded in `regenerateReplay.ts`) — never silently produce a lossy retry.

## Continue Generation

When a response stops at a length/token boundary, the user should be able to continue it in place, appending to the same message. **🔭 Planned** — no dedicated continue-generation path exists in `apps/web/features/chat` today (regenerate replays a fresh turn; it does not resume). Design intent: detect a truncation finish reason and offer a "Continue" action that appends without re-emitting prior tokens.

## Sharing

A conversation can be shared via a public read-only link backed by a client-generated UUID capability token; the share view is unauthenticated. **✅ Built** — `use-share-conversation.ts` posts to `apps/web/app/api/shared/route.ts` (`shared_conversations` table) and returns an absolute URL to the public `/shared/[id]` view. Requirement: sharing is opt-in per conversation; the token is the only capability; revocation must be possible. Only Managed-Cloud content is shareable.

## Branch Conversations

A conversation can be forked at any message point into a named alternate path, tracking parent-child relationships and navigable history. **✅ Built** — `apps/web/app/api/chat/branch/route.ts`, `conversation-branching.ts`, `use-conversation-branches.ts`, `BranchNavigator.tsx`, `CreateBranchDialog.tsx`. Requirement: the branch route is auth + CSRF-guarded and validates `sessionId`/`branchPointMessageId` as UUIDs; a branch is a new user-scoped conversation, not a mutation of the parent.

## Conversation Search

Two scopes: in-session find (Cmd+F, match count, prev/next, Escape-to-close) and cross-session global search over sessions and messages with history. **✅ Built** — `MessageSearch.tsx`; `global-search-service.ts` → `apps/web/app/api/search/route.ts`; `use-search-history.ts`. Requirement: global search is user-scoped server-side (RLS), returns typed `session`/`message` results, and never leaks another user's rows.

## Repository map

- `apps/web/features/chat/components/Composer/*` — composer, model selector, send/stop, attach, mode tags.
- `apps/web/features/chat/components/messages/{EditableMessage,MessageActions,MessageSearch}.tsx` — edit, actions, in-session search.
- `apps/web/features/chat/services/{chat-ai-service,conversation-branching,global-search-service}.ts` — streaming, branching, search.
- `apps/web/features/chat/lib/{regenerateReplay,pendingEdit}.ts` — regenerate/edit replay.
- `apps/web/features/chat/hooks/{use-share-conversation,use-conversation-branches,use-attachments,use-search-history}.ts`.
- `apps/web/app/api/chat/{sync,sessions,conversations,branch}/route.ts`, `apps/web/app/api/{search,shared}/route.ts` — chat + sync APIs.
- `apps/web/proxy.ts` — Clerk auth gating (never `middleware.ts`).

## Competitor notes

Claude, ChatGPT, and Codex all offer streaming chat, edit, regenerate, share links, and search; ChatGPT and Claude also branch and continue. AGI Web matches this on a **multi-provider, cloud-only** surface: one composer and stream serve whatever Managed-Cloud model produced the tokens, with no provider lock-in. AGI's deliberate divergence is **per-surface trust**: Local-first and BYOK chat live on Desktop/CLI/VS Code, and Web renders **no** Local/BYOK affordance. Regenerate refuses lossy replays rather than degrading silently, and sync is user-scoped Neon delta-sync (RLS), not an opaque cloud store.

## Acceptance / Definition of Done

Production-ready when: composing, streaming, stop, edit, regenerate, share, branch, and both search scopes work in light/dark; every route is Clerk-authenticated and user-scoped; and no Local/BYOK affordance exists in the composer.

- [ ] Build: send/stop, attach, model selector, streaming, edit, regenerate, share link, branch, in-session + global search all function; invalid inputs degrade gracefully.
- [ ] Trust: chat is confined to Managed-Cloud sessions; only rows with a `cloud_id` sync; no Local/BYOK control or provider-key input appears; the Managed-Cloud UX lock is visible.
- [ ] Security: all chat/sync/branch/search routes enforce Clerk auth, CSRF where mutating, and RLS user-scoping; share tokens are revocable per-conversation capabilities; streaming aborts cleanly on stop.

## Anti-patterns

- Adding any Local, BYOK, "fork to BYOK", or provider-key affordance to the Web composer — Web is cloud-only.
- Silently routing or syncing Local/BYOK rows; syncing rows without a `cloud_id`; trusting `user_id` from the request body instead of the verified session.
- Claiming Continue Generation is shipped (it is 🔭); claiming any capability shipped without a repo path.
- Producing a lossy regenerate for skill/legacy-tool turns instead of blocking.
- Sanitizing only the final stream frame; rendering raw model HTML without `rehype-sanitize`.
- Hardcoding or inventing model IDs, routes, or env vars; referencing Supabase; renaming `proxy.ts` to `middleware.ts`; using removed tiers (Plus/Hobby/`pro_plus`) or credit top-ups.
