# AGI Desktop — Volume 05 — Chat

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (root), `apps/desktop/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), and the AGI Web chat baseline `docs/products/agi-web/volume-04-chat.md`. Grounded in the repo paths in the Repository map below. Response-rendering pipeline detail is owned by Volume 06 (AI Response Rendering).

## Overview & stance

This volume covers chat on AGI Desktop: composing a turn, streaming a response, and the operations around it. Desktop is the **full-trust surface** — Local, BYOK, and Managed Cloud are all selectable with correct visible labels — so unlike Web (cloud-only), the composer and every egress-bearing action (share, sync, telemetry) must be **trust-mode-aware**. The canonical 3-tier boundary is `selectPrivacyMode` in `apps/desktop/src/stores/appModeStore.ts` (`managed`/`local`/`byok`). Chat must never silently route a Local or BYOK conversation to our cloud; Local→BYOK is an explicit fork (context selection, secret scan, payload preview, provider label, consent); model IDs come only from `packages/types/src/models.json`. **P0 note:** desktop Share previously leaked across the trust boundary — now gated fail-closed (see Sharing).

## Conversation Lifecycle

A conversation is created on first send, auto/user-titled, listed, foldered, exported, and deleted; Managed-Cloud rows sync via Neon delta-sync while Local/BYOK rows stay on-device (`ChatPreferences.chatStorageMode` defaults to `"local"`; `settings_load_from_disk` coerces persisted `"cloud"` back to `"local"`). **✅ Built** — `apps/desktop/src/features/chat/Sidebar.tsx`, `apps/desktop/src/features/v3/DesktopShellV3.tsx`. Requirement: no lifecycle event crosses to our cloud when `privacyMode !== 'managed'`.

## Message Composer — UX Lock controls + visible Local/BYOK/Managed label

Auto-growing textarea, Enter-to-send / Shift+Enter-newline, a **“+” (add/tools)** popover, attach, a **model selector** (`ModelPopover`), a **mic** button, and a 3-state **send/stop** button (`ArrowUp` / red `Square`). **✅ Built** — `apps/desktop/src/features/v3/Composer.tsx`, `apps/desktop/src/features/chat/ChatInputArea.tsx`, `apps/desktop/src/features/v3/ModelPopover.tsx`. **UX Lock — visible trust label (🟡):** the V3 sidebar has a Local/Cloud segmented control (`apps/desktop/src/features/v3/LocalCloudToggle.tsx`) and `formatPrivacyModeLabel` (`@agiworkforce/types`) renders Local/BYOK/Managed strings, but an always-visible trust chip **on the composer** distinguishing BYOK from Managed at send is not confirmed — add or verify. Gap: `ChatInputArea.tsx` still references a removed `'hobby'` tier in a plan check — reconcile to the current tiers (🟡).

## Attachments

Files attach via the paperclip or drag/paste, shown as removable preview chips before send, validated by type/size. **✅ Built** — `apps/desktop/src/features/chat/AttachmentPreview.tsx`, `apps/desktop/src/features/chat/hooks/useAttachments.ts`. Requirement: attachments stay local in Local/BYOK modes (Volume 09 owns upload/storage); unsupported files fail inline.

## Streaming

Responses stream token-by-token; the composer shows **stop** while generating, and stopping aborts and preserves partial content. **✅ Built** — `apps/desktop/src/features/chat/useTauriStreamListeners.ts`, `apps/desktop/src/features/chat/ChatStream.tsx` (Rust emits stream events over Tauri IPC; `isStreaming` drives the `Square` state). Requirement: stop cancels the in-flight generation; a dropped stream surfaces retry.

## Markdown

Assistant prose renders as GFM Markdown on the live path. **✅ Built** — `apps/desktop/src/features/chat/MessageBubble/MessageContent.tsx` (`react-markdown` + `remark-gfm`). Volume 06 owns the full pipeline; raw model/tool HTML must be sanitized on every frame.

## Code Blocks

Fenced code renders with a language label, copy, overflow scroll, and highlighting; unknown languages degrade to a plain block. **✅ Built** — `apps/desktop/src/features/chat/MessageBubble/MessageContent.tsx` → `Visualizations/CodeBlock`. Desktop extra: executable languages run in-place via the `execute_code` Tauri command — a Local-compute action that must not leak to our cloud.

## Tables

GFM tables render in a horizontally scrollable, bordered container; overflow scrolls within the table, never breaking message layout. **✅ Built** — `remark-gfm` in `apps/desktop/src/features/chat/MessageBubble/MessageContent.tsx` (Volume 06).

## Math

Math renders via KaTeX (block + inline). **✅ Built** — `apps/desktop/src/features/chat/MessageBubble/MessageContent.tsx` (`remark-math` + `rehype-katex`, `katex/dist/katex.min.css`). Requirement: display math is block-wrapped so KaTeX display nodes never nest in a `<p>`.

## Citations

Web-search/tool sources render as numbered badges with a sources footer and hover context. **✅ Built** — `apps/desktop/src/features/chat/CitationBadge.tsx`, `apps/desktop/src/features/chat/SourcesFooter.tsx`, `apps/desktop/src/features/chat/SourcePillRow.tsx`. Requirement: external links open with `rel="noopener noreferrer"`.

## Editing

User messages are editable inline: auto-resizing pre-filled textarea, Cmd/Ctrl+Enter to save, Escape to cancel, character count. **✅ Built** — `apps/desktop/src/features/chat/EditableMessage.tsx`. Requirement: a re-run preserves the original send options (model/tools/trust mode) and never silently switches provider.

## Continue Generation

When a response stops at a token/length boundary, the user should resume it in place, appending without re-emitting prior tokens. **🔭 Planned** — no continue-generation path exists in `apps/desktop/src/features/chat` today (regeneration replays a fresh turn). Design intent: detect a truncation finish reason and offer an in-place "Continue" action.

## Regeneration

A message can be regenerated from the actions/context menu, replaying the originating turn. **✅ Built** — `apps/desktop/src/features/chat/MessageBubble/MessageActions.tsx`, `apps/desktop/src/features/chat/MessageBubble/MessageContextMenu.tsx`, `apps/desktop/src/features/chat/ChatStream.tsx`. Requirement: regenerate replays under the **same trust mode** as the source turn — a Local turn never regenerates against our cloud.

## Branch Conversations

A conversation can be forked at a message point into alternate paths, with compact `< n/m >` navigation and checkpointing. **✅ Built** — `apps/desktop/src/features/chat/BranchNavigator.tsx`, `apps/desktop/src/features/chat/CheckpointManager.tsx`. Requirement: a branch inherits the parent's trust mode.

## Conversation Search

Global spotlight search (Cmd+K) spans chats, projects, and artifacts with type icons, timestamps, and keyboard navigation. **✅ Built** — `apps/desktop/src/features/chat/SearchModal.tsx` (client-side fuzzy over local stores). In-session find (Cmd+F) is **🟡** — not confirmed as a dedicated desktop control. Requirement: search reads only local/entitled data; it never queries our cloud for Local/BYOK rows.

## Sharing

A conversation is shared via a public read-only link (30-day) from the Rust `conversation_share` command, POSTed to `/api/shared`. **✅ Built (P0 fixed)** — `apps/desktop/src/features/chat/ShareConversationDialog.tsx` routes through `guardedFetch` (`apps/desktop/src/lib/egressGuard.ts`), which **fails closed** when `privacyMode !== 'managed'` (via `apps/desktop/src/stores/privacyBoundary.ts`; wiring re-verified 2026-07-02 — the share POST goes through `guardedFetch`, and both guards carry regression tests: `apps/desktop/src/__tests__/lib/egressGuard.test.ts`, `apps/desktop/src/__tests__/stores/privacyBoundary.test.ts`). Requirement: sharing is Managed-Cloud only; a Local/BYOK attempt is blocked with a clear message to continue in Cloud mode.

## Export

A conversation exports to Markdown (message list + sidebar) and PDF (sidebar). **✅ Built** — `apps/desktop/src/features/chat/ChatMessageList.tsx` (`exportConversation`), `apps/desktop/src/features/chat/Sidebar.tsx` (`onExport` Markdown, `onExportPdf` PDF). Requirement: export writes to the **local** filesystem in any trust mode — a local save, not a cloud publish.

## Drag & Drop Files

Files dropped on the chat surface show an overlay and become attachments. **✅ Built** — `apps/desktop/src/features/chat/DragDropOverlay.tsx`, `apps/desktop/src/features/chat/DragOverlay.tsx`. Requirement: dropped files stay local in Local/BYOK modes; unsupported types are rejected inline.

## Clipboard Integration

Pasting files/images creates attachments (with a "pasted" badge); links and code offer copy. **✅ Built** — `apps/desktop/src/features/chat/ChatInputArea.tsx` (`handlePaste` / `onPaste`), `apps/desktop/src/features/chat/MessageBubble/PastedBadge.tsx`. Requirement: pasted content follows the same trust rules as attachments; clipboard I/O uses guarded async APIs.

## Keyboard Shortcuts

A command palette and a discoverable shortcuts reference cover send, new chat, search, and navigation. **✅ Built** — `apps/desktop/src/features/chat/CommandPalette.tsx`, `apps/desktop/src/features/chat/KeyboardShortcutsDialog.tsx`, `apps/desktop/src/features/chat/KeyboardShortcutsOverlay.tsx`. Requirement: shortcuts are OS-aware (Cmd vs Ctrl), never hijack native text-editing keys, and the reference lists exactly the bound keys.

## Repository map

- `apps/desktop/src/features/v3/` — `{Composer,ModelPopover,PlusMenu,LocalCloudToggle,DesktopShellV3}.tsx` (composer, model/mode controls, shell).
- `apps/desktop/src/features/chat/` — `{ChatInputArea,ChatStream,useTauriStreamListeners,EditableMessage,BranchNavigator,CheckpointManager,SearchModal}.tsx` and `MessageBubble/{MessageContent,MessageActions,MessageContextMenu}.tsx` (input, streaming, edit, regenerate, branch, search, render).
- `apps/desktop/src/features/chat/` — `{ShareConversationDialog,LocalByokHandoffDialog,AttachmentPreview,DragDropOverlay,DragOverlay,CitationBadge,SourcesFooter,SourcePillRow,ChatMessageList,Sidebar,CommandPalette,KeyboardShortcutsDialog,KeyboardShortcutsOverlay}.tsx`, `hooks/useAttachments.ts` (share, fork, attach, drop, citations, export, shortcuts).
- `apps/desktop/src/lib/egressGuard.ts`, `apps/desktop/src/stores/{appModeStore,privacyBoundary}.ts` — trust-boundary chokepoint + `selectPrivacyMode`.
- `apps/desktop/src/features/mobile-companion/MobileCompanionPanel.tsx` — Desktop↔Mobile companion (🟡 — commented out at `apps/desktop/src/features/chat/index.tsx:109`).

## Competitor notes

Claude, ChatGPT, and Codex offer streaming chat, edit, regenerate, branch, share, search, and export in cloud-backed clients. AGI Desktop matches this on a **multi-provider, full-trust** surface: one composer and stream serve whatever Local, BYOK, or Managed-Cloud model produced the tokens. AGI's divergence is **local-first + per-surface trust**: chat, code execution, and export run on-device by default; Share and sync are the _only_ egress paths, fail-closed outside Managed mode; BYOK stays client-direct to the user's own provider. No competitor gates share by an on-device trust boundary the way `egressGuard` does.

## Acceptance / Definition of Done

Production-ready when: composing, streaming, stop, edit, regenerate, branch, search, share, export, drag/paste, and shortcuts work in light/dark; the trust mode is visible on the composer; and every egress-bearing action is gated by `selectPrivacyMode`.

- [ ] Build: send/stop, model selector, streaming, edit, regenerate, branch, search, Markdown/code/table/math/citation render, export (MD+PDF), drag & drop, paste, and shortcuts function; invalid inputs degrade gracefully.
- [ ] Trust: Local/BYOK/Managed is visibly labeled at send; Share/sync fail closed when `privacyMode !== 'managed'`; regenerate/branch inherit the source trust mode; Local→BYOK only via the consented fork.
- [ ] Security: `guardedFetch` wraps every our-cloud call; export/paste/drop stay local; share tokens are Managed-only, revocable; streaming aborts cleanly on stop.

## Anti-patterns

- Adding a Local/BYOK→cloud path that bypasses `egressGuard`, or sharing a Local/BYOK chat (the P0 regression).
- Regenerating or branching a Local turn against our cloud; silently switching provider on edit/regenerate.
- Treating export or code execution as a cloud action.
- Claiming Continue Generation, the composer trust chip, or in-session find are shipped (they are 🔭/🟡); claiming any capability without a repo path.
- Hardcoding or inventing model IDs, routes, or env vars; referencing Supabase; renaming `proxy.ts` to `middleware.ts`.
- Using removed tiers (`hobby`/Plus/`pro_plus`) or credit top-ups — reconcile plan checks to Free / Basic ($8·₹399) / Pro ($20) / Max ($100 & $200) / Enterprise.
