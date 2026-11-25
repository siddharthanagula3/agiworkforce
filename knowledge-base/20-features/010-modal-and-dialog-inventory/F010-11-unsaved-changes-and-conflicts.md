---
id: "F010-11"
type: "feature"
title: "Unsaved changes and conflicts"
aliases: ["Unsaved-changes warning", "Discard changes", "Edit-conflict resolution", "Draft conflict", "Keep editing", "S10.41", "S10.42"]
area: "10 Modal and dialog inventory"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "built", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S10.41", "S10.42"]
depends_on: ["SYS-sync-and-continuity", "SYS-shared-ui-and-design", "SYS-memory-projects-and-context", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "table:web_conversations", "api:PATCH /api/chat/conversations/[id]", "file:packages/ui/ui/src/primitives/UnsavedChanges.tsx"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F010-11 Unsaved changes and conflicts

Warns before leaving an editor that holds unsaved edits, on web (including the browser's own close warning) and mobile. A separate dialog shows both versions of an unsent chat draft that changed on another device and lets the person pick one. CLI file sync keeps the local file and writes a copy. Chrome has neither.

Area: [10. Modal and dialog inventory](README.md). Requirement items: [S10.41](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1041), [S10.42](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1042).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | not stated on this page | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Stops accidental loss of typed work and stops one device silently overwriting another's draft.

**Why it exists.** People edit the same account on several devices and tabs. Silent overwrite or silent loss of edits is data loss.

**Who uses it.** Anyone editing project settings, memory, schedules, skills or composing a chat on more than one device.

**Problems it solves**

- Closing a tab with an unfinished form
- Overwriting a draft written on another device
- Lost edits on back navigation

**Use cases**

- Edit project notes and click a link: prompt asks keep editing or discard
- Close the tab with an unsaved memory edit: browser warning
- Type a draft on a laptop and phone: dialog shows both
- CLI sync: remote and local config differ

## 2. User experience

**Where to find it**

- Web and Electron Desktop: shared guard on project settings, notes, agent editor, skill editor, workspace controls, memory editor (apps/web/features/projects/components/ProjectSettingsDialog.tsx, packages/ui/unified-chat/src/components/MemoryEditor.tsx)
- Mobile: schedule create, personalization, add memory, message edit, project editor (apps/mobile/app/(app)/schedules/create.tsx, apps/mobile/src/features/settings/components/AddMemorySheet.tsx)
- Web chat composer: 'Choose which draft to keep' dialog (apps/web/features/chat/components/DraftConflictDialog.tsx:56)
- CLI: `.imported` file beside a conflicting local file (apps/cli/src/sync.rs:400)

**Before you start**

- An editor with changed fields
- For draft conflict: signed in with the draft saved to the account on two devices or tabs

**Screens and controls**

- Web prompt: 'Discard unsaved changes?' with 'Discard' and 'Keep editing' (packages/ui/ui/src/primitives/UnsavedChanges.tsx:132)
- Mobile alert 'Discard changes?' 'You have unsaved changes.' with 'Discard' and 'Keep Editing' (apps/mobile/src/shared/hooks/useUnsavedChangesGuard.ts:8)
- Draft dialog panels 'Here' and 'Elsewhere', buttons 'Use the other version' and 'Keep this version' (apps/web/features/chat/components/DraftConflictDialog.tsx:62)

**Journey**

1. Edit a field so the form is dirty
2. Try to leave by link, back or close
3. Prompt appears; choose keep editing or discard
4. Discard releases the guard and continues
5. Draft conflict: the save returns a conflict, the dialog shows both texts, the person picks one

**What the person sees and gets**

- Browser's own leave-page warning when the tab closes with edits (packages/ui/ui/src/primitives/UnsavedChanges.tsx:42)
- Draft dialog text: 'Keeping one replaces the other everywhere.' (apps/web/features/chat/components/DraftConflictDialog.tsx:58)
- CLI report lists conflicting paths (apps/cli/src/sync.rs:95)

**Settings**

- none found

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Shared guard registers a beforeunload listener and intercepts same-origin link clicks while any guard is dirty (packages/ui/ui/src/primitives/UnsavedChanges.tsx:42, :62, :88)
- confirmNavigation waits for the choice; discard marks entries released and calls onDiscard (packages/ui/ui/src/primitives/UnsavedChanges.tsx:26)
- Mobile guard blocks navigation removal with an alert and tracks a discard (apps/mobile/src/shared/hooks/useUnsavedChangesGuard.ts:20)
- Server returns 409 with the current draft when the stored draft differs (apps/web/app/api/chat/conversations/[id]/route.ts:258)
- Web dialog shows both versions and replaces one with the other on choice (apps/web/features/chat/components/DraftConflictDialog.tsx:56)
- Draft sync retries failed saves a bounded number of times (apps/web/features/chat/hooks/use-conversation-draft-sync.ts:222)
- CLI handles a 409 draft conflict and reads the current draft (apps/cli/src/cloud/drafts.rs:117)
- CLI sync keeps the local file and writes a '.imported' copy when copies diverge and no lossless merge exists (apps/cli/src/sync.rs:332, :401)

**Incomplete**

- The conflict dialog covers unsent chat drafts only; conflicts on project settings, memory or schedules were not found (apps/web/features/chat/components/DraftConflictDialog.tsx:62)
- CLI conflict is a file copy and a report, not a chooser (apps/cli/src/sync.rs:401)
- What closing the draft dialog without choosing does: unknown (onClose handler not traced)

**Present but disconnected or switched off**

- none found

**Not available**

- Edit-conflict on mobile, VS Code, Chrome: none found
- Unsaved-changes guard on Chrome: none found; VS Code not applicable per brief

## 4. Required behaviour

**Established requirements**

- Leaving an editor with unsaved edits warns the user and lets them keep editing or discard. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S10.41)
- When the same item was changed elsewhere, the user sees both versions and chooses which to keep (or merges). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S10.42)
- A conflict must not overwrite either version silently. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S10.42)
- Failures are never silent; no silent failures. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. Editing a project setting then clicking a sidebar link shows the prompt and stays on the page when Keep editing is chosen
2. Choosing Discard moves on and the guard no longer fires
3. Closing the tab with unsaved edits triggers the browser warning
4. After a save, no prompt appears on leaving
5. On mobile back with a dirty schedule shows the alert
6. Two devices edit one draft: the later save shows both texts and neither is lost until chosen
7. Cancelling the conflict dialog does not overwrite either version [to verify]
8. CLI sync of diverged config produces a .imported copy and a conflict in the report

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The brief lists project settings, memory and schedule form for the guard; the code uses it in those places [inferred from the file list]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Extend the two-version dialog to project instructions and memory
- [proposed] Add the guard to Chrome options pages

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| hook | useUnsavedChangesGuard (web) | `packages/ui/ui/src/primitives/UnsavedChanges.tsx` | Guard, link interception, beforeunload |
| component | ProjectSettingsDialog | `apps/web/features/projects/components/ProjectSettingsDialog.tsx` | Uses the guard |
| component | MemoryEditor | `packages/ui/unified-chat/src/components/MemoryEditor.tsx` | Uses the guard |
| component | SkillEditorDialog | `apps/web/features/skills/components/SkillEditorDialog.tsx` | Uses the guard |
| hook | useUnsavedChangesGuard (mobile) | `apps/mobile/src/shared/hooks/useUnsavedChangesGuard.ts` | Alert and navigation block |
| screen | Schedule create | `apps/mobile/app/(app)/schedules/create.tsx` | Uses the mobile guard |
| component | AddMemorySheet | `apps/mobile/src/features/settings/components/AddMemorySheet.tsx` | Uses the mobile guard |
| component | DraftConflictDialog | `apps/web/features/chat/components/DraftConflictDialog.tsx` | Two-version chooser |
| hook | use-conversation-draft-sync | `apps/web/features/chat/hooks/use-conversation-draft-sync.ts` | Saves drafts, retries, opens conflicts |
| endpoint | PATCH /api/chat/conversations/[id] | `apps/web/app/api/chat/conversations/[id]/route.ts` | Draft write with 409 conflict reply |
| table | web_conversations | `apps/web/app/api/chat/conversations/[id]/route.ts` | Holds draft and draft_updated_at |
| service | CLI cloud drafts | `apps/cli/src/cloud/drafts.rs` | Saves drafts and decodes conflict |
| service | CLI sync | `apps/cli/src/sync.rs` | Merge or .imported copy |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Editor reports dirty state to the guard | device | packages/ui/ui/src/primitives/UnsavedChanges.tsx:140 |
| Link click or window close is intercepted; a confirm dialog or the browser warning appears | device | packages/ui/ui/src/primitives/UnsavedChanges.tsx:62 |
| Draft change is sent with the revision the client last saw | device and our servers | apps/web/features/chat/hooks/use-conversation-draft-sync.ts:203 |
| Server compares drafts; if different it returns 409 with the current draft and revision | our servers | apps/web/app/api/chat/conversations/[id]/route.ts:258 |
| Client opens the dialog; the chosen version is saved | device and our servers | apps/web/features/chat/components/DraftConflictDialog.tsx:56 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Unsent draft text and revision time | table:web_conversations columns draft and draft_updated_at (apps/web/app/api/chat/conversations/[id]/route.ts:263) | Yes, across web, CLI and others that use the same route | Overwritten by the chosen version; cleared on send [inferred] |
| CLI sync manifest and .imported copies | store:CLI config home (apps/cli/src/sync.rs:140) | Via bundle import | Copy stays until the person removes it |

**Models and providers.** No model or provider involved.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Guards work without an account. Draft conflict needs a signed-in account because drafts are stored on the server. |
| Permissions | Draft route writes only the user's own conversation (apps/web/app/api/chat/conversations/[id]/route.ts:278). |
| Subscription | none found in the code |
| Limits and metering | Draft save retries are capped (MAX_AUTOMATIC_DRAFT_SAVE_ATTEMPTS, apps/web/features/chat/hooks/use-conversation-draft-sync.ts:222). |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Unsaved-changes guards work in Local mode on mobile because they are on-device. Draft sync and conflict use the account, so they apply only in Cloud mode [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Several dirty editors | First entry prompts; discard releases all | packages/ui/ui/src/primitives/UnsavedChanges.tsx:26 |
| Modifier-click, new tab, download, external link | Not intercepted | packages/ui/ui/src/primitives/UnsavedChanges.tsx:51 |
| Draft not on server yet | Result not_saved_yet; retried later | apps/web/features/chat/hooks/use-conversation-draft-sync.ts:216 |
| Save failed | Automatic retry up to a cap | apps/web/features/chat/hooks/use-conversation-draft-sync.ts:222 |
| Empty version | Dialog says 'Empty. You cleared this draft here.' or 'It was sent or cleared elsewhere.' | apps/web/features/chat/components/DraftConflictDialog.tsx:67 |
| Swipe back on mobile | Blocked until alert answered | apps/mobile/src/shared/hooks/useUnsavedChangesGuard.ts:20 |
| Offline | not handled in the code beyond save retries [inferred] | use-conversation-draft-sync.ts handles result 'failed' with retry only; no offline branch seen |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/UnsavedChangesGuard.test.tsx`: Inferred from name: mobile guard
- `apps/web/__tests__/api/chat-conversation-draft.test.ts`: Inferred from name: draft route
- `apps/web/app/api/chat/conversations/[id]/route.metadata-repair.test.ts`: Inferred from name: conversation route metadata

**Test scenarios**

- **Link click with dirty form**
  1. Edit project notes
  2. Click a sidebar link
  3. Choose Keep editing, then repeat and choose Discard
  - Expected: First stays and keeps text; second leaves and drops it
- **Tab close**
  1. Edit memory
  2. Close the tab
  - Expected: Browser leave-page warning
- **Draft conflict**
  1. Type a draft in two tabs of one chat
  2. Save in tab A
  3. Type different text in tab B
  - Expected: Dialog with Here and Elsewhere; choosing either keeps that text in both
- **Mobile back**
  1. Open schedule create
  2. Type a name
  3. Press back
  - Expected: Alert 'Discard changes?'
- **CLI sync conflict**
  1. Edit config locally and in a bundle from another machine
  2. Import
  - Expected: Local file kept; <path>.imported written; conflict listed

**Where to look when it fails**

- Draft route 409 body with conflict true
- CLI sync report conflicts list
- Error 'The draft conflict is invalid' from apps/cli/src/cloud/drafts.rs

**Hands-on test plans**

- Web: [70-qa/test-plans/web/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/web/010-modal-and-dialog-inventory.md)
- Desktop: [70-qa/test-plans/desktop/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/desktop/010-modal-and-dialog-inventory.md)
- Mobile: [70-qa/test-plans/mobile/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/mobile/010-modal-and-dialog-inventory.md)
- CLI: [70-qa/test-plans/cli/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/cli/010-modal-and-dialog-inventory.md)

## 10. Gaps and dependencies

- **Conflict dialog is for chat drafts only** Affects: Web, desktop. Evidence: apps/web/features/chat/components/DraftConflictDialog.tsx:62. Work needed: Extend to other editable items or document the scope
- **Mobile and VS Code and Chrome have no edit-conflict dialog** Affects: Those apps. Evidence: none found. Work needed: Decide scope
- **No unsaved-changes guard on Chrome pages** Affects: Chrome. Evidence: none found in apps/extension. Work needed: Add to options editors
- **CLI sync conflict is not a chooser** Affects: CLI. Evidence: apps/cli/src/sync.rs:401. Work needed: Add an interactive choice or document
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-sync-and-continuity
- SYS-shared-ui-and-design
- SYS-memory-projects-and-context
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- table:web_conversations
- api:PATCH /api/chat/conversations/[id]
- file:packages/ui/ui/src/primitives/UnsavedChanges.tsx

## Unknown

- What happens when the draft dialog is closed without choosing (onClose not traced)
- Whether the desktop Tauri build uses the guard (not in the usage list)
- Whether CLI sync is user-visible as a dialog anywhere
- Draft table column names beyond those named in the route
