---
id: "AREA-016"
type: "area"
title: "User-message components"
features: ["F016-01", "F016-02", "F016-03", "F016-04", "F016-05", "F016-06", "F016-07", "F016-08", "F016-09", "F016-10", "F016-11"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 16. User-message components

This area is everything attached to a message the person sent: who sent it, the text, attached files, the context chips, when it was sent, and the actions on it (copy, edit, resend, branch, page between versions). It also covers what happens when a send is queued, fails or is retried, and how an unsent draft is kept. It lets people fix a prompt, redo a turn or fork a conversation without retyping, and it keeps the transcript honest about what was actually sent.

**Who uses it.** Every signed-in user of the chat surfaces. The web code shows no plan gate on the message actions themselves. Branching is a server call that counts against the daily allowance of a free account (assertFreeDailyAllowance in apps/web/lib/services/conversation-branch-service.ts:204), so Free users can be refused when the daily limit is used up. Draft sync to the server is skipped for temporary conversations and for conversations that hold Local-model turns.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F016-01](F016-01-who-sent-it-identity.md) | Who sent it (identity) | built | built | built | built | built | built |
| [F016-02](F016-02-message-text-attachments-and-context-chips.md) | Message text, attachments and context chips | built | built | built | built | built | built |
| [F016-03](F016-03-timestamp-and-edited-marker.md) | Timestamp and edited marker | built | built | partly | no | no | partly |
| [F016-04](F016-04-copy.md) | Copy | built | built | built | no | no | built |
| [F016-05](F016-05-edit-in-place-and-version-paging.md) | Edit in place and version paging | built | built | built | no | no | no |
| [F016-06](F016-06-resend-retry.md) | Resend / Retry | built | built | built | no | built | built |
| [F016-07](F016-07-branch-from-here.md) | Branch from here | built | built | n/a | built | built | no |
| [F016-08](F016-08-long-message-collapse.md) | Long message collapse | built | built | no | no | no | no |
| [F016-09](F016-09-sending-state-queued-pending-draft.md) | Sending state: queued, pending, draft | built | built | built | built | partly | built |
| [F016-10](F016-10-voice-and-imported-attribution.md) | Voice and imported attribution | no | no | no | built | no | no |
| [F016-11](F016-11-group-author-and-message-link-not-built.md) | Group author and message link (not built) | partly | no | no | no | no | no |

Requirement items for this area: [10-requirements/capabilities/016-user-message-components.md](../../10-requirements/capabilities/016-user-message-components.md).

## How this area works in the code

1. **Render the bubble.** The chat page maps stored messages to MessageBubble. A user row gets role data, a hidden 'You said:' heading and a right-aligned bubble. (`apps/web/app/chat/page.tsx`, `apps/web/features/chat/components/WebChatRoot.tsx`, `apps/web/features/chat/pages/WebChatPage.tsx:7752`, `apps/web/features/chat/components/messages/MessageBubble.tsx:2571`)
2. **Show text, files and chips.** The bubble draws the text, then attachments and MessageContextChips from message metadata. (`apps/web/features/chat/components/messages/MessageBubble.tsx:3132`, `apps/web/features/chat/components/messages/MessageContextChips.tsx:17`)
3. **Collapse long text.** A layout effect measures the text height against 320px and sets an overflow flag; a button toggles expansion. (`apps/web/features/chat/components/messages/MessageBubble.tsx:388`, `apps/web/features/chat/components/messages/MessageBubble.tsx:956-960 region (useLayoutEffect)`, `apps/web/features/chat/components/messages/MessageBubble.tsx:2943`)
4. **Action row.** Hover/focus reveals Retry, Edit, Copy and a '...' menu with the send time and Branch. The row is always visible on touch. (`apps/web/features/chat/components/messages/MessageBubble.tsx:3700-3760`, `apps/web/features/chat/components/messages/MessageBubble.tsx:3961`, `apps/web/features/chat/components/messages/MessageBubble.tsx:4008`)
5. **Edit.** The bubble asks the page via the inline-edit context. The page plans the edit, then resubmits as a sibling (variants on) or replaces after a confirm (variants off). (`apps/web/features/chat/components/messages/MessageBubble.tsx:945-960`, `apps/web/features/chat/pages/WebChatPage.tsx:5617-5675`, `apps/web/features/chat/lib/message-variants-gate.ts:49`)
6. **Page between versions.** VariantPager shows n/m and calls onSelectVariant with the previous or next message id; the page switches the active path. (`apps/web/features/chat/components/messages/VariantPager.tsx:44`, `apps/web/features/chat/pages/WebChatPage.tsx:7755`)
7. **Retry a failed turn.** If the last user message has no good reply, the banner offers Retry, which rolls back that turn and sends it again. (`apps/web/features/chat/lib/retryable-turn.ts:19`, `apps/web/features/chat/pages/WebChatPage.tsx:5686`, `apps/web/features/chat/pages/WebChatPage.tsx:5704`, `apps/web/features/chat/pages/WebChatPage.tsx:7565`)
8. **Branch.** The hook posts to the branches route; the route validates, applies the rate limit and calls forkConversation, which copies the thread in a transaction. (`apps/web/features/chat/hooks/use-conversation-branches.ts:103`, `apps/web/app/api/chat/conversations/[id]/branches/route.ts:52`, `apps/web/lib/services/conversation-branch-service.ts:194`)
9. **Queue and draft.** The composer queues follow-ups in memory; the draft hook saves unsent text to the conversation row with a revision. (`apps/web/features/chat/components/Composer/ChatComposerNew.tsx:910`, `apps/web/features/chat/hooks/use-conversation-draft-sync.ts:84`, `apps/web/app/api/chat/conversations/[id]/route.ts:208`)

## Files to know

| File | Role |
|---|---|
| `apps/web/features/chat/components/messages/MessageBubble.tsx` | The single bubble component for user and assistant turns: text, chips, actions, collapse, edit hookup. |
| `apps/web/features/chat/components/messages/MessageContextChips.tsx` | Chips for the skill and connector prompt and resources sent with a message. |
| `apps/web/features/chat/components/messages/VariantPager.tsx` | The n/m pager for answers and edited versions. |
| `apps/web/features/chat/pages/WebChatPage.tsx` | Owns edit, regenerate/retry, branch and the failure banner; passes handlers to bubbles. |
| `apps/web/features/chat/lib/retryable-turn.ts` | Decides which user message the Retry banner resends. |
| `apps/web/features/chat/lib/message-variants-gate.ts` | Switch for keeping old versions versus replacing them. |
| `apps/web/features/chat/hooks/use-conversation-branches.ts` | Client call that creates a branch and opens it. |
| `apps/web/lib/services/conversation-branch-service.ts` | Server code that copies a thread up to a message into a new conversation. |
| `apps/web/features/chat/hooks/use-conversation-draft-sync.ts` | Saves and reconciles the unsent draft with the server. |
| `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Composer with the queued-follow-up list. |
| `apps/mobile/src/features/chat/components/MessageBubble.tsx` | Mobile bubble, copy, edit modal and pager. |
| `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | VS Code transcript with delivery-state labels. |

## What is stored

- Messages and the conversation's active branch: public.web_messages and public.web_conversations (read in conversation-branch-service.ts:228-265; active_leaf_message_id selected in conversations/[id]/route.ts:110)
- Unsent draft text and its revision time: web_conversations columns draft and draft_updated_at (conversations/[id]/route.ts:110, 220-239)
- Branch request id for repeat-safe creation: stored by forkConversation (conversation-branch-service.ts:307); read by findIdempotentBranch
- Local copy of unsent drafts: browser storage via composer-draft-storage (imported in use-conversation-draft-sync.ts:14-17)
- Message-variants override: browser localStorage key agi.message-variants (message-variants-gate.ts:2)
- Mobile composer drafts and their attachments: on-device MMKV storage, keys prefixed composer-draft: (apps/mobile/src/features/chat/draftStore.ts:1-5)
- Imported-from origin for a CLI session: session metadata file (apps/cli/src/sessions.rs:136)

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **NEXT_PUBLIC_MESSAGE_VARIANTS (on/off)**: On by default: edit and regenerate keep old versions as siblings. Off: they replace and delete the old reply. (apps/web/features/chat/lib/message-variants-gate.ts:44-47)
- **?variants=on|off query and agi.message-variants storage**: Per-browser override of the setting above. (apps/web/features/chat/lib/message-variants-gate.ts:20-39, 49)
- **Free daily allowance**: Branch creation is refused when the free account's daily limit is spent. (apps/web/lib/services/conversation-branch-service.ts:204)
- **Trial exhausted**: Retry opens the upgrade dialog instead of sending. (apps/web/features/chat/pages/WebChatPage.tsx:5736)
- **Temporary conversation / Local-model turns**: No server draft is saved. (apps/web/features/chat/hooks/use-conversation-draft-sync.ts:75-84)
- **Voice mode**: Hides Retry, Edit-adjacent actions and Branch on assistant rows while voice mode is active. (apps/web/features/chat/components/messages/MessageBubble.tsx:3716, 3922)

## Shared between apps

The web bubble, pager and chips in apps/web/features/chat are the one implementation for the web app, which the public Desktop shows. Mobile has its own components in apps/mobile/src/features/chat/components. The CLI (Rust terminal UI), VS Code (webview HTML in a string) and Chrome (side panel) are separate code. Connector labels come from the shared contracts package (@agiworkforce/cloud-contracts, imported in MessageContextChips.tsx and use-conversation-draft-sync.ts).

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- The brief's line numbers are stale in many places: for example MessageBubble.tsx:1977 and 2082 are not identity or text, and the CLI voice entry S16.19 points at tui_app.rs:3275, which is the attachment chip line. The real voice label is tui_app.rs:4469 and 7569. (apps/cli/src/tui/tui_app.rs:3275)
- Brief says edited-marker and version paging are missing on mobile, but mobile has a pager labelled 'Edited message, version n of m'. (apps/mobile/src/features/chat/components/MessageBubble.tsx:549-580)
- S16.06 'edited' is only the version pager; a user message edited with the variants switch off shows no mark at all. (apps/web/features/chat/components/messages/VariantPager.tsx:19-23; message-variants-gate.ts:44)
- The web failed-send state is a banner above the chat, not a marker on the failed message. (apps/web/features/chat/pages/WebChatPage.tsx:7560-7576)
- Copy on web depends on hasReadableTurn, which is true for any user message, so fine; but the brief's useChatStream.ts lines for failed/retry point at continue-generation code, not the user-send failure path. (apps/web/lib/hooks/useChatStream.ts:4966-5043)
- The brief's Should for chips lists quoted text, page, editor selection and @mentions; the web chips file handles only skill, connector prompt and resources. (apps/web/features/chat/components/messages/MessageContextChips.tsx:17-40)
- Brief marks the version pager UI as unfinished ('ui') on web and desktop, but I found no TODO in the pager. (apps/web/features/chat/components/messages/VariantPager.tsx)

## Not established

- Desktop: the brief lists it as done, but the code reads the public Desktop as the hosted web app, so I treated it as the same web code; the Tauri desktop source was not opened.
- I did not open the Chrome extension, most of the CLI, or the VS Code code beyond a few lines, so their 'done' statuses are taken from the brief.
- Where the user-send failure state is set on web (the message-level error flag) was not traced.
- Where the edited-version revisions are stored in the database (parent links or sibling grouping) was not traced.
- The meaning of queued/pending state for the Chrome and CLI apps is unknown.
- S16.22 on web and desktop: the brief gives no status and I did not search for a message deep link.
- I did not confirm whether quoted-text or @mention chips exist in web outside MessageContextChips.tsx.
