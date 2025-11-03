# Milestone 3 – Chat Interface

## Current State Snapshot
- Chat store persists conversations/messages with streaming updates, edit/delete mutations, and pinning.
- Virtualised message list delivers dividers, unread banner, and scroll-to-bottom controls (see `MessageList.tsx`).
- Title bar + sidebar already integrate conversation management, routing, and settings access.

## Deliverable Checklist
1. **State management (Zustand) ✅**  
   - `chatStore.ts` wired to backend commands (create/update/delete) with local pin & unread scaffolding.  
   - `settingsStore.ts` persists provider defaults, theme, routing, and keyring bridges.
2. **Message list component ✅**  
   - Virtual scrolling via `react-window` w/ dynamic sizing, date dividers, unread separator, and loading row.  
   - Message actions now expose copy/regenerate/edit/delete with inline edit UX (`Message.tsx`).
3. **Input composer ✅**  
   - Auto-expanding textarea, attachments, model selector, routing hints, and disabled states during sends.
4. **Conversation sidebar ✅**  
   - Search, pin, rename, delete, quick create, keyboard shortcut toggles, and settings drawer bridge.  
   - Tray quick actions feed through `useTrayQuickActions` while awaiting unread counts.
5. **Backend commands ✅**  
   - Added `chat_update_message` and `chat_delete_message`, plus repository helpers and store wiring.

## Remaining Nice-to-Haves
- Surface edit/delete via keyboard shortcuts in the message list.
- Persist unread counts per conversation once routing emits markers.
- Add integration tests once node/runtime tooling is available locally.
