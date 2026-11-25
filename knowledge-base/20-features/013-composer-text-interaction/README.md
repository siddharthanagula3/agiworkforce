---
id: "AREA-013"
type: "area"
title: "Composer text interaction"
features: ["F013-01", "F013-02", "F013-03", "F013-04", "F013-05", "F013-06", "F013-07", "F013-08", "F013-09", "F013-10", "F013-11", "F013-12", "F013-13"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 13. Composer text interaction

The composer is the box where a person types, pastes, dictates and sends a message. It also holds the "+" menu, the "/" command menu, the "@" mention menu, the chips for what is attached, the queue of follow-up messages, and the unsent draft. If it works well, a person never loses text, never sends by accident, and can add context quickly. It is the first thing every user touches in every app.

**Who uses it.** Every signed-in user of every app. Some parts depend on plan or setup. Dictation can be switched off by a billing flag and a setting. Folder mentions on the web code only show when a desktop host exists. Draft saving to the server only applies to Cloud chats that are not temporary and not on a local model. Free-plan users get a handover to Auto when they pick tools a free model cannot use. A "usage block" or exhausted trial disables the whole composer.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F013-01](F013-01-typing-new-lines-and-height.md) | Typing, new lines and height | built | built | built | built | built | built |
| [F013-02](F013-02-send-and-stop-buttons.md) | Send and Stop buttons | built | built | built | built | built | built |
| [F013-03](F013-03-enter-key-choice-and-shortcuts.md) | Enter key choice and shortcuts | partly | partly | partly | partly | partly | partly |
| [F013-04](F013-04-manual-expand-and-full-screen-editing.md) | Manual expand and full-screen editing | built | built | built | partly | no | no |
| [F013-05](F013-05-paste-handling.md) | Paste handling | built | built | partly | partly | partly | partly |
| [F013-06](F013-06-length-counter-and-context-warning.md) | Length counter and context warning | built | built | built | built | built | no |
| [F013-07](F013-07-drafts-autosave-recovery-isolation.md) | Drafts: autosave, recovery, isolation | built | built | built | partly | partly | partly |
| [F013-08](F013-08-prompt-history-and-prompt-suggestions.md) | Prompt history and prompt suggestions | partly | partly | partly | partly | built | no |
| [F013-09](F013-09-slash-commands-templates-and-skills.md) | Slash commands, templates and skills | built | built | partly | built | built | partly |
| [F013-10](F013-10-mentions-of-projects-files-folders-apps-tabs-and-a.md) | @ mentions of projects, files, folders, apps, tabs and agents | partly | partly | partly | partly | partly | partly |
| [F013-11](F013-11-context-chips-selected-sources-and-tools.md) | Context chips, selected sources and tools | built | built | built | partly | built | partly |
| [F013-12](F013-12-menu-output-format-dictation-and-voice.md) | + menu, output format, dictation and voice | built | built | built | built | partly | partly |
| [F013-13](F013-13-queued-and-steering-messages-side-questions.md) | Queued and steering messages, side questions | partly | partly | partly | partly | partly | partly |

Requirement items for this area: [10-requirements/capabilities/013-composer-text-interaction.md](../../10-requirements/capabilities/013-composer-text-interaction.md).

## How this area works in the code

1. **Page mounts the composer.** The chat page renders the composer in two places (new chat and open chat) and hands it the send, stop, steer and voice callbacks. (`apps/web/app/chat/page.tsx:13`, `apps/web/features/chat/components/WebChatRoot.tsx:22`, `apps/web/features/chat/pages/WebChatPage.tsx:7670`, `apps/web/features/chat/pages/WebChatPage.tsx:7674`, `apps/web/features/chat/pages/WebChatPage.tsx:7675`)
2. **Pick the input type.** A gate chooses the plain textarea (default) or the rich editor, from a build setting, then a stored override, then a URL parameter. The rich editor adds undo, mentions, a length limit and Enter handling. (`apps/web/features/chat/lib/composer-editor-gate.ts:46`, `apps/web/features/chat/components/Composer/ComposerInput.tsx:253`, `packages/ui/unified-chat/src/composer-editor/extensions/index.ts:25`, `packages/ui/unified-chat/src/composer-editor/extensions/submit-keymap.ts:36`)
3. **Typing, keys and growth.** The key handler first gives keys to the slash menu and mention menu, then handles Arrow Up to edit the last message, shortcuts, the Enter rule and Escape. An effect resizes the box up to a ceiling. (`apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4577`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4654`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4649`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2457`)
4. **Paste decision.** One shared function decides: files become attachments, text of 10,000 characters or more becomes a text file, code gets fenced, otherwise the paste lands as text. (`packages/platform/utils/src/composerPaste.ts:14`, `packages/platform/utils/src/composerPaste.ts:131`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2372`)
5. **Menus and chips.** The / menu uses built-in plus custom commands from the settings store. The @ menu merges skills, projects, connectors, desktop folders and library files. The + menu holds attach, tools and Output rows. (`apps/web/features/chat/components/Composer/SlashCommandMenu.tsx:160`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2932`, `apps/web/features/chat/hooks/use-mention-folders.ts:21`, `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:958`)
6. **Submit or queue.** handleSubmit builds the send arguments (text, files, skill, tool options, output format). If a reply is running it creates a queued item; otherwise it calls onSend. Unsent text is cleared only after a send is accepted. (`apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3945`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3964`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3980`)
7. **Queue flush and steering.** When the running reply ends, the first queued item for this chat is sent; items for another chat are turned into drafts. Steer sends text to the running cloud task instead. (`apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4348`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4456`, `packages/contracts/cloud-contracts/src/managed-cloud-agent-runs-client.ts:447`)
8. **Draft saved on the device.** As the text changes it is written to browser storage under a key made from the owner id and chat id, and cleared for temporary chats. (`apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4110`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4124`, `apps/web/features/chat/components/Composer/composer-draft-storage.ts:10`)
9. **Draft saved to the server.** After a delay a hook sends a PUT with the draft to the conversation, with the last revision so a clash from another device returns 409 and opens a keep-mine or keep-theirs choice. The server stores it on the conversation row. (`apps/web/features/chat/hooks/use-conversation-draft-sync.ts:167`, `apps/web/features/chat/services/conversation-draft.ts:120`, `apps/web/db/neon/0219_conversation_drafts.sql:29`)
10. **Other apps.** Mobile, CLI and the two extensions each have their own composer code that uses the same ideas (shared paste thresholds on mobile and Chrome). (`apps/mobile/src/features/chat/components/ChatInput.tsx:1236`, `apps/mobile/src/features/chat/draftStore.ts:1`, `apps/cli/src/tui/tui_app.rs:4073`, `apps/cli/src/tui/prompt_history.rs:43`, `apps/extension/src/side_panel.ts:10104`, `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5944`)

## Files to know

| File | Role |
|---|---|
| `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | The whole web composer (7,383 lines): keys, paste, menus, chips, queue, drafts, send. |
| `apps/web/features/chat/components/Composer/ComposerInput.tsx` | Renders the plain textarea or the rich editor and sets their heights. |
| `apps/web/features/chat/lib/composer-editor-gate.ts` | Chooses textarea or rich editor. |
| `packages/ui/unified-chat/src/composer-editor/extensions/submit-keymap.ts` | Enter, Shift+Enter and Cmd/Ctrl+Enter rules in the rich editor. |
| `packages/platform/utils/src/composerPaste.ts` | Shared rules for large paste, files, code detection. |
| `apps/web/features/chat/components/Composer/composer-draft-storage.ts` | Per-owner, per-chat draft in browser storage. |
| `apps/web/features/chat/hooks/use-conversation-draft-sync.ts` | Saves drafts to the server and handles conflicts. |
| `apps/web/features/chat/components/Composer/SlashCommandMenu.tsx` | The / command list. |
| `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | The + menu including Output format rows. |
| `apps/mobile/src/features/chat/components/ChatInput.tsx` | Mobile composer: paste chips, queue, dictation, drafts. |
| `apps/cli/src/tui/tui_app.rs` | Terminal composer key handling, queue hint, /btw. |
| `apps/cli/src/tui/composer_edits.rs` | CLI undo, redo, external editor and paste collapse. |

## What is stored

- Unsent draft text per owner and chat (key prefix agi-composer-draft, version 2); plus an owner marker: Browser localStorage and sessionStorage (apps/web/features/chat/components/Composer/composer-draft-storage.ts:1)
- Unsent draft per Cloud conversation (draft and draft_updated_at columns): Database table web_conversations (apps/web/db/neon/0219_conversation_drafts.sql:29), written by PUT on the conversation path
- Send with Enter, follow-up behaviour, dictation setting, custom commands: Web settings store (apps/web/shared/stores/web-settings-store.ts:78), synced with the account by CloudSettingsSync.tsx
- Composer editor override: Browser localStorage key agi.composer-editor (composer-editor-gate.ts:2)
- Mobile drafts with attachments and where they came from (local or cloud): Device storage through MMKV, prefix composer-draft: (apps/mobile/src/features/chat/draftStore.ts:5)
- Chrome draft text: chrome.storage.session keyed by account, login and chat (apps/extension/src/side_panel.ts:10104)
- VS Code drafts per thread: In memory in the webview (composerDrafts map, webviewContent.ts:5958); not persisted as far as seen
- CLI prompt history: history.txt in the CLI config folder (apps/cli/src/tui/prompt_history.rs:21)
- Pasted-text files on mobile before send: App cache folder, files named with the pasted prefix (ChatInput.tsx:208)

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **NEXT_PUBLIC_COMPOSER_EDITOR (editor or textarea)**: Build default for the web input type; textarea when unset. (apps/web/features/chat/lib/composer-editor-gate.ts:44)
- **composer URL parameter and agi.composer-editor storage key**: Override the input type per browser. (apps/web/features/chat/lib/composer-editor-gate.ts:1)
- **sendWithEnter (default true)**: Off means Enter adds a line and Cmd/Ctrl+Enter sends. (apps/web/shared/stores/web-settings-store.ts:133; read at ChatComposerNew.tsx:1792)
- **dictationEnabled and billing disabledFeatures**: Turn the microphone off with a stated reason. (ChatComposerNew.tsx:1790 and :1793)
- **FOLLOW_UP_SUGGESTIONS_ENABLED_DEFAULT (false)**: Follow-up suggestions are off until set true. (apps/web/features/chat/components/messages/ChatMessageList.tsx:1104)
- **followUpBehavior (queue or steer)**: Default for messages sent during a running reply. (ChatComposerNew.tsx:1791; VS Code setting agiWorkforce.composer.followUpBehavior at apps/extension-vscode/package.json:1238)
- **agiWorkforce.composer.enterBehavior (VS Code)**: enter, modifierIfMultiline or modifier. (apps/extension-vscode/package.json:1251)
- **newChatsTemporary and temporary chat**: No draft saved, saved draft cleared. (ChatComposerNew.tsx:4118)
- **Desktop host present**: Enables folder mentions. (ChatComposerNew.tsx:2932)
- **VISUAL or EDITOR (CLI)**: Which editor opens on Ctrl+E. (apps/cli/src/tui/composer_edits.rs:140)
- **Plan, capability and free-model rules**: Slash commands marked unavailable; free models hand over to Auto when tools they cannot use are chosen. (SlashCommandMenu.tsx:36 (filterSlashCommandsByCapability) and ChatComposerNew.tsx:3678)

## Shared between apps

Shared: packages/platform/utils/src/composerPaste.ts (web, shared chat input, Chrome, mobile threshold), packages/ui/unified-chat (the rich editor, slash command list and capability filtering), packages/contracts/cloud-contracts (message length limit, draft limit and debounce, output formats, steering client). Desktop shows the hosted web composer, so it is the same code as web. Separate per app: mobile ChatInput.tsx and ComposerFullScreenEditor.tsx, CLI tui_app.rs, composer_edits.rs, prompt_history.rs and mentions.rs, Chrome side_panel.ts, VS Code webviewContent.ts and chatParticipant.ts.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- The brief says Enter-to-send preference is missing on web, desktop and VS Code, but it is built: a Send with Enter switch exists on the web, and the key handler reads it. (apps/web/features/settings/sections/GeneralSection.tsx:607; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4654; apps/extension-vscode/package.json:1251)
- The brief says web has no folder mention, but code for it exists, enabled only when a desktop host is present. So it works on desktop and likely not in a normal browser. (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2932)
- The brief says VS Code has no queue-vs-send choice listed as missing for some items, yet VS Code supports queue and steer; also its code-paste, long-paste, expand and dictation items are marked missing with no matching code seen. (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5944)
- The brief describes output formats like table or slides, but the web only offers Word, PowerPoint and Excel files. (packages/contracts/cloud-contracts/src/skills.ts:20)
- Many line numbers in the brief point at the wrong lines because the files grew (for example the follow-up default is at line 1104, not 1048; ChatComposerNew send button is near 6958, not 5186). (apps/web/features/chat/components/messages/ChatMessageList.tsx:1104)
- Chrome Enter handling sends on any Enter without Shift; there is no way to choose a different send key, and long text and code paste are not handled. (apps/extension/src/side_panel.ts:14574)
- Follow-up suggestions are built but disabled by a hardcoded false default, so no user sees them. (apps/web/features/chat/components/messages/ChatMessageList.tsx:1104)
- Queued messages with attachments cannot be steered, and queued attachments are dropped when you switch chat, so those messages can be lost in part (the user is told). (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4483 and :4407)

## Not established

- How Desktop (Electron) differs in practice from the web composer. The code says it shows the hosted web app, so I treated it as the same.
- Whether mobile has any send-with-Enter setting. I saw only returnKeyType default and blurOnSubmit false (ChatInput.tsx:2125), meaning Return adds a line.
- Exact behaviour of the rich editor's code-paste and mention parts (I read only the extension index and submit keymap).
- What the mobile slash palette contains beyond opening when text starts with / (ChatInput.tsx:1553).
- The Chrome extension's slash, project mention, tab mention and skill handling, and whether any Chrome queue exists. I only read its draft and Enter code.
- VS Code: whether the composer has context chips for pasted text, and how drafts persist across reload.
- The server route that receives the draft PUT (I confirmed the client call and the database column, not the route code).
- How the CLI renders context chips, token indicator, and which slash commands exist.
- Which exact mobile files wire queue editing to the UI (I saw the handlers, not the rendered row).
- Whether web undo in the textarea arm is only the browser's own undo.
