---
id: "COMP-conversations-and-history"
type: "competitor-trace"
title: "Conversations and history"
competitor_evidence_reviewed: "2026-11-22"
basis: "official competitor pages saved 2026-11-22; AGI status from code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Conversations and history: competitors to requirements

Both leaders cover the core of chat history: a chat list, search, rename, delete and a not-saved chat mode. ChatGPT also documents pin, archive, locked chats and saving a temporary chat. For Claude, the catalogue shows no chat pin, chat archive or single-chat export. AGI has most of this on web, desktop and mobile. The web run saw search, rename, pin, archive and restore work. The main gaps are no Recently deleted for chats, no locked chats, and thin support in VS Code, Chrome and the CLI.

**How the products divide this topic.** Claude means the chat product on support.claude.com. Claude Code means code.claude.com and the Claude Code help pages; its sessions (resume, rename, export, archive) are a separate tool. Claude Code on the web and desktop connects to claude.ai sessions, but I treat it as separate. ChatGPT means help.openai.com and chatgpt.com pages. Pages on learn.chatgpt.com describe the new ChatGPT desktop app, which now holds Chat, Work and Codex together, and the Codex CLI and IDE extension. I label each row. Codex rows (resume, fork, thread archive) are the coding tool, not ChatGPT chat. Plan limits seen: Claude chat-search tool is paid plans only; Claude bulk and rename pages list Free to Ultra; Claude retention controls are Enterprise; ChatGPT export is not available in Business or Enterprise workspaces and can take up to 7 days; ChatGPT saved chat history has no cap on any individual plan. All competitor evidence was reviewed 2026-11-22 from the catalogue lines. I did not open the saved pages. AGI web is the only app with person-seen results (W-13 scorecard, 2026-11-24). Everything else is code reading.

Each capability below is traced: competitor evidence, AGI requirement, current implementation, gap, acceptance criteria, verification. Competitor behaviour comes only from the cited pages, reviewed 2026-11-22.

| ID | Capability | Claude | ChatGPT | AGI today | Verified |
|---|---|---|---|---|---|
| [CAP-conversations-and-history-01](#cap-conversations-and-history-01) | Start a new chat | yes | yes | built | seen working by a person |
| [CAP-conversations-and-history-02](#cap-conversations-and-history-02) | Chat list (Recents) with groups, sort and filter | yes | yes | partly built | seen working by a person |
| [CAP-conversations-and-history-03](#cap-conversations-and-history-03) | Search past chats | partly | yes | built | seen working by a person |
| [CAP-conversations-and-history-04](#cap-conversations-and-history-04) | Search scope rules (archived in, deleted and temporary out) | partly | yes | partly built | code inspected only |
| [CAP-conversations-and-history-05](#cap-conversations-and-history-05) | Ask the assistant to search earlier chats | yes | yes | unknown | not verified |
| [CAP-conversations-and-history-06](#cap-conversations-and-history-06) | Rename a chat and automatic titles | yes | yes | partly built | seen working by a person |
| [CAP-conversations-and-history-07](#cap-conversations-and-history-07) | Pin chats | unknown | yes | partly built | seen working by a person |
| [CAP-conversations-and-history-08](#cap-conversations-and-history-08) | Archive and unarchive chats | partly | yes | partly built | seen working by a person |
| [CAP-conversations-and-history-09](#cap-conversations-and-history-09) | Archived chats list (restore or delete from it) | unknown | yes | built | seen working by a person |
| [CAP-conversations-and-history-10](#cap-conversations-and-history-10) | Delete a chat | yes | yes | built | seen working by a person |
| [CAP-conversations-and-history-11](#cap-conversations-and-history-11) | Recover a deleted chat (Recently deleted) | unknown | no | partly built | seen failing by a person |
| [CAP-conversations-and-history-12](#cap-conversations-and-history-12) | Select many chats, archive all, delete all | yes | yes | built | code inspected only |
| [CAP-conversations-and-history-13](#cap-conversations-and-history-13) | Temporary chat (not saved) | yes | yes | partly built | code inspected only |
| [CAP-conversations-and-history-14](#cap-conversations-and-history-14) | What a temporary chat leaves out, and how it is explained | yes | yes | built | code inspected only |
| [CAP-conversations-and-history-15](#cap-conversations-and-history-15) | Choose personalised or plain at the start of a temporary chat | unknown | yes | built | code inspected only |
| [CAP-conversations-and-history-16](#cap-conversations-and-history-16) | Save a temporary chat | no | yes | partly built | code inspected only |
| [CAP-conversations-and-history-17](#cap-conversations-and-history-17) | Export one chat | partly | unknown | partly built | code inspected only |
| [CAP-conversations-and-history-18](#cap-conversations-and-history-18) | Export all my data | yes | yes | partly built | code inspected only |
| [CAP-conversations-and-history-19](#cap-conversations-and-history-19) | Resume past sessions in coding tools | partly | partly | partly built | code inspected only |
| [CAP-conversations-and-history-20](#cap-conversations-and-history-20) | History follows the account across devices | partly | yes | built | seen failing by a person |
| [CAP-conversations-and-history-21](#cap-conversations-and-history-21) | Local-mode chats stay on the device | unknown | unknown | partly built | code inspected only |
| [CAP-conversations-and-history-22](#cap-conversations-and-history-22) | Chat without an account | unknown | yes | partly built | not verified |
| [CAP-conversations-and-history-23](#cap-conversations-and-history-23) | Shortcuts and unread marks for chat actions | unknown | yes | partly built | code inspected only |
| [CAP-conversations-and-history-24](#cap-conversations-and-history-24) | Move a chat into or out of a project | yes | yes | partly built | code inspected only |
| [CAP-conversations-and-history-25](#cap-conversations-and-history-25) | Locked chats behind a PIN | unknown | yes | not built | not verified |

## CAP-conversations-and-history-01 Start a new chat

A visible way to open an empty chat with a ready composer, from the app, a shortcut or a widget.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (Claude Code /clear starts a fresh session, separate tool): yes**
  - [https://support.claude.com/en/articles/10263469-use-claude-app-intents-shortcuts-and-widgets-on-ios](https://support.claude.com/en/articles/10263469-use-claude-app-intents-shortcuts-and-widgets-on-ios): iOS widget has a button to start a new chat; usage counts toward limits. Reviewed 2026-11-22. Apps: ios.
  - [https://support.claude.com/en/articles/10534883-use-the-claude-widget-on-android](https://support.claude.com/en/articles/10534883-use-the-claude-widget-on-android): Android widget has a new chat button. Reviewed 2026-11-22. Apps: android.
  - [https://code.claude.com/docs/en/commands.md](https://code.claude.com/docs/en/commands.md): Claude Code /clear starts a new empty conversation. Reviewed 2026-11-22. Apps: cli.
- **ChatGPT (desktop app docs also cover Codex): yes**
  - [https://help.openai.com/en/articles/20001723-using-the-new-experience-in-the-chatgpt-mobile-app](https://help.openai.com/en/articles/20001723-using-the-new-experience-in-the-chatgpt-mobile-app): Mobile Home tab is where you start chats and open sidebar history. Plans: Pro, Plus. Apps: ios,android.
  - [https://learn.chatgpt.com/docs/reference/commands.md](https://learn.chatgpt.com/docs/reference/commands.md): Desktop shortcut New chat is Cmd+N or Cmd+Shift+O. Apps: desktop.
  - [https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes](https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes): Web sidebar redesign put the new chat button left of the model picker. Plans: All plans. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md section 6.1 (Home/new chat); docs/decisions/2026-11-10-founder-decisions.md D-2026-11-10-01 (empty mobile new chat)). Every app opens an empty new chat with a ready composer. A new chat starts in the mode, model slot and project the user chose, and never silently in another trust boundary.

**With different models, providers and the one subscription.** Opening a chat costs no model call and no quota. The model shown comes from the catalogue slot (Auto by default). In Local mode a new chat stays on the device with no silent cloud fallback.

**Current implementation, as this trace read it on 2026-11-24: built.** All six apps done per ledger. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S12.01, S12.20, S12.23, S4.01
- Comparison list ids: none matched
- Code: `apps/web/app/chat/page.tsx:13`; `apps/web/features/chat/components/WebChatRoot.tsx:22`; `apps/mobile/app/(app)/(tabs)/chat.tsx:816`; `apps/cli/src/tui/tui_app.rs:3545`

**Gap.** Unsent draft is not restored in the CLI or Chrome (S12.23). No shortcut check was made on every app.

**Acceptance criteria**

1. On each app, open a new chat: no prior messages, composer ready.
2. Type a draft, reload or navigate away, return: draft is back (web, desktop, mobile, VS Code).
3. Open a new chat while in Local mode: the label still says Local and no cloud call is made.

**Verification: seen working by a person.** Web only: scorecard web.csv W-2 free and subscribed, new chat answered. Other apps: code inspected only.

## CAP-conversations-and-history-02 Chat list (Recents) with groups, sort and filter

A list of past chats, newest first, with pinned chats grouped on top, and options to group or filter.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one-claude](https://support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one-claude): Single Recents list: quick questions and longer tasks share one conversation list. Reviewed 2026-11-22. Apps: web,desktop,ios,android.
  - [https://support.claude.com/en/articles/8230524-delete-or-rename-a-conversation](https://support.claude.com/en/articles/8230524-delete-or-rename-a-conversation): Chats are reached from the sidebar or a Chats and tasks page. Plans: Free, Pro, Max, Ultra. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Jun 18, 2026: pinned section holds chats and projects; Recents can be one list or grouped by project. Apps: web.
  - [https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes](https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes): Desktop has one Recents list combining chat and Work, with sort, filter and pin. Plans: All plans. Apps: desktop.
  - [https://help.openai.com/en/articles/20001723-using-the-new-experience-in-the-chatgpt-mobile-app](https://help.openai.com/en/articles/20001723-using-the-new-experience-in-the-chatgpt-mobile-app): Mobile sidebar lists recent chats newest first and syncs across devices. Apps: ios,android.
  - [https://chatgpt.com/pricing](https://chatgpt.com/pricing): Saved chat history has no cap on any individual plan. Plans: Free, Go, Plus, Pro. Apps: web,ios,android.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md section 6.1 (Chats and tasks/history)). One chat list per account, newest first, with a pinned section and an archived view. History is not capped by plan.

**With different models, providers and the one subscription.** The list shows chats from any model or provider and labels the provider where it is not AGI Managed. Reading the list costs no quota. Local and BYOK chats appear only where they are stored (device).

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, desktop, mobile built. Chrome, CLI and VS Code have their own session lists. Web filter and group is partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S4.02, S4.05
- Comparison list ids: WP247
- Code: `packages/ui/ui/src/sidebar/Sidebar.tsx:727`; `packages/ui/ui/src/sidebar/Sidebar.tsx:770`; `apps/web/features/chat/components/ChatsAndTasksList.tsx:45`; `apps/mobile/src/features/chat/ChatsListScreen.tsx:75`

**Gap.** Filter and group by type, status and last activity is partial (WP247). The archived view still reads Recents (cosmetic, seen). The phone sidebar account row is clipped at 390 wide (seen).

**Acceptance criteria**

1. Create three chats, pin one: it shows in a Pinned group above Recents.
2. Open the list at 390 wide: every row and the account row are fully visible.
3. Open the archived view: the heading says Archived, not Recents.
4. Turn off the network: list still shows cached chats and no stale offline banner remains after reconnect.

**Verification: seen working by a person.** Web W-13 free and subscribed (Pinned group, Archived view). Defects seen: heading stays Recents in archived view, account row clipped at 390 wide (web-problems-seen-in-browser.csv W-13).

## CAP-conversations-and-history-03 Search past chats

Find an earlier chat by title or message text from a search box or shortcut and open it.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one-claude](https://support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one-claude): Unified experience limit: search excludes old Cowork tasks, so a search of chats exists but its screens are not described. Reviewed 2026-11-22. Apps: web,desktop,ios,android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10056348-finding-your-chats-projects-and-files-in-chatgpt](https://help.openai.com/en/articles/10056348-finding-your-chats-projects-and-files-in-chatgpt): Sidebar search finds chats, projects, images and documents; Ctrl+K or Cmd+K opens it on web; filters All, Chats, Images, Documents, Projects. Plans: All plans. Apps: web,ios,android.
  - [https://help.openai.com/en/articles/9703738-chatgpt-macos-app-release-notes](https://help.openai.com/en/articles/9703738-chatgpt-macos-app-release-notes): Search past conversations by keyword from the search bar. Apps: desktop.
  - [https://learn.chatgpt.com/docs/reference/commands.md](https://learn.chatgpt.com/docs/reference/commands.md): Desktop Search chats can match chat content and Git branch names; no default shortcut. Apps: desktop.

**AGI requirement** (stated requirement; source: docs/product/definition.md (Competitive Ecosystem Synthesis Lock: account history searchable); docs/product/experience-contract.md (permission-aware unified search)). A user can search their own chats by title and message text, from every app that keeps history, and open a result. Only chats the user can see are returned.

**With different models, providers and the one subscription.** Search is a database lookup, not a model call, so it uses no model and no quota. It works whatever model wrote the chat. Local-mode chats are searched only on the device that holds them.

**Current implementation, as this trace read it on 2026-11-24: built.** Done on all six apps in the ledger. Mobile search of archived chats is partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S34.02, S4.03
- Comparison list ids: MP22
- Code: `apps/web/app/api/search/route.ts:256`; `apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:378`; `apps/mobile/stores/chat/chatViewStore.ts:180`; `apps/cli/src/lib.rs:4126`

**Gap.** Web shows three result rows for one chat and the dialog jumps as results change (seen, cosmetic). Mobile search of archived chats is partial (MP22).

**Acceptance criteria**

1. Search a word that appears in one chat's title: that chat opens from the result.
2. Search a word that appears only in a message: the chat is found.
3. Delete a chat, search its title: no result.
4. Search a word from a temporary chat: no result.

**Verification: seen working by a person.** Web W-13 free: search found the chat by title and message text and survived reload; delete removed it from search. Other apps: code inspected only.

## CAP-conversations-and-history-04 Search scope rules (archived in, deleted and temporary out)

Which chats a history search returns: archived included, deleted and temporary chats left out.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context): Incognito chats are excluded from past-chat search. Reviewed 2026-11-22. Plans: All plans. Apps: web,desktop,ios,android.
  - [https://support.claude.com/en/articles/17631495-get-started-with-claude-duet](https://support.claude.com/en/articles/17631495-get-started-with-claude-duet): Duet search of past chats: deleted chats leave search. Plans: Pro, Max, Ultra. Apps: ios,android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10056348-finding-your-chats-projects-and-files-in-chatgpt](https://help.openai.com/en/articles/10056348-finding-your-chats-projects-and-files-in-chatgpt): Search matches titles and message text, includes archived chats, and excludes deleted chats. Plans: All plans. Apps: web,ios,android.
  - [https://help.openai.com/en/articles/7730893-data-controls-in-chatgpt](https://help.openai.com/en/articles/7730893-data-controls-in-chatgpt): Locked chats are hidden from sidebar, search, recents and notifications. Apps: web,ios,android.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md (Permission-aware unified search)). Search honours deletion, revocation, workspace membership, account switching and temporary-chat exclusion. Archived chats are found.

**With different models, providers and the one subscription.** Rules apply to the stored chat, not to the model. On a Local device the same rules apply to local storage.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web search excludes deleted and temporary rows; archived chats appear only when an Include archived switch is on (off by default). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S34.02
- Comparison list ids: MP22
- Code: `apps/web/app/api/search/route.ts:307`; `apps/web/app/api/search/route.ts:323-326`; `apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:132`

**Gap.** Archived chats are excluded by default on web, unlike the documented ChatGPT behaviour. Needs an owner choice (see unresolved).

**Acceptance criteria**

1. Archive a chat, search its title with default settings: result shown, or the include-archived switch is clearly offered.
2. Delete a chat: not found in search on any app.
3. Switch accounts: results never show the other account's chats.

**Verification: code inspected only.** W-13 saw delete leave search; archived search and account switching not recorded.

## CAP-conversations-and-history-05 Ask the assistant to search earlier chats

The assistant itself looks up past conversations on request, or uses them as context, and shows which chats it used.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context): Claude can search earlier conversations on request, shows citations to source chats with a delete option, and a switch turns it off. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web,desktop,ios,android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Jan 15, 2026: when enabled, retrieves specifics from past chats and shows the chats used as sources. Plans: Plus, Pro. Apps: web,ios,android.

**AGI requirement** (stated requirement; source: docs/product/definition.md (referenced chat history is a separate control; temporary chats neither read nor write memory)). Referencing past chats is a separate, switchable control from saved memory. It shows which chats were used and never reads temporary chats.

**With different models, providers and the one subscription.** Retrieval is done by AGI, so it must work with any model the user picks. It adds input tokens, so it counts against the one subscription. In Local mode it uses only on-device history.

**Current implementation, as this trace read it on 2026-11-24: unknown.** Not examined here; belongs to the memory page. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: `apps/web/lib/temporary-chat-policy.ts:15-17 states temporary chats are left out of the retrieval index`

**Gap.** Not assessed for this topic.

**Acceptance criteria**

1. Turn the reference switch off: the assistant does not cite earlier chats.
2. Turn it on and ask about a past chat: the answer lists the chat it used.
3. Ask about a temporary chat's content in a new chat: not found.

**Verification: not verified.** Web W-12 subscribed: recall check could not run because answers failed with a billing error.

## CAP-conversations-and-history-06 Rename a chat and automatic titles

Chats get a title automatically and the user can rename them; the new name persists.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (Claude Code /rename is the separate coding tool): yes**
  - [https://support.claude.com/en/articles/8230524-delete-or-rename-a-conversation](https://support.claude.com/en/articles/8230524-delete-or-rename-a-conversation): Rename from the three-dot menu on a chat; iOS by long-press; Android from the open chat menu. Plans: Free, Pro, Max, Ultra. Apps: web,ios,android.
  - [https://code.claude.com/docs/en/commands.md](https://code.claude.com/docs/en/commands.md): Claude Code /rename renames the session or auto-generates a name. Apps: cli.
- **ChatGPT desktop app (docs also cover Codex): yes**
  - [https://learn.chatgpt.com/docs/projects.md](https://learn.chatgpt.com/docs/projects.md): Rename chats: give a chat a short outcome title. Apps: web,desktop.
  - [https://learn.chatgpt.com/docs/reference/commands.md](https://learn.chatgpt.com/docs/reference/commands.md): Desktop shortcut Rename chat is Cmd+Alt+R. Apps: desktop.

**AGI requirement** (inferred; source: competitor parity). A new chat gets a meaningful title automatically. The user can rename it on every app that lists chats, and the name persists.

**With different models, providers and the one subscription.** Auto-title uses a small model call; it must pick a cheap route and must not bill a user's quota visibly more than a reply. In Local mode the title is made on device or left as the first words.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, desktop, mobile, CLI done. VS Code and Chrome missing per ledger. CLI /rename is partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S18.01, S18.02
- Comparison list ids: CP30, V14
- Code: `apps/web/features/chat/components/ConversationTitleMenu.tsx:142`; `packages/ui/ui/src/sidebar/SessionItem.tsx:322`; `apps/mobile/src/features/conversation-actions/useConversationActions.ts:116`; `apps/cli/src/tui/tui_app.rs:3574`

**Gap.** No rename in VS Code (V14); CLI /rename partial (CP30). Web title stays old after an edit of the first message (seen). Title ignores attachments (seen).

**Acceptance criteria**

1. Rename a chat, reload: new name stays.
2. Start a chat by attaching a file: title reflects the content, not a placeholder.
3. Edit the first message: title updates or stays by a stated rule.

**Verification: seen working by a person.** Web W-13 free pass for rename. Defects seen: title stays after first-message edit (W-3), title does not reflect attachments (W-4).

## CAP-conversations-and-history-07 Pin chats

Keep chosen chats at the top of the list.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (the catalogue shows starring for projects and pinning for Claude Code sessions, not for chats): unknown**
  - [https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects](https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects): Star projects for sidebar access. This is projects, not chats. Reviewed 2026-11-22. Apps: web,desktop.
  - [https://code.claude.com/docs/en/agent-view.md](https://code.claude.com/docs/en/agent-view.md): Claude Code agent view: Ctrl+T pins a session (keeps its process alive). Apps: cli.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Dec 18, 2025: pin chats to the top; web ... menu then Pin chat; mobile long-press. Apps: web,ios,android.
  - [https://learn.chatgpt.com/docs/reference/commands.md](https://learn.chatgpt.com/docs/reference/commands.md): Desktop shortcut Pin or unpin chat is Cmd+Alt+P. Apps: desktop.

**AGI requirement** (inferred; source: competitor parity). A chat can be pinned and unpinned; pinned chats show together at the top and stay in sync across devices.

**With different models, providers and the one subscription.** Pin is account metadata, free of model cost. It must not move a Local chat to the account.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, desktop, mobile done. CLI, VS Code missing. Chrome missing in ledger but comparison says star exists. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S18.03, S4.05
- Comparison list ids: WP44
- Code: `apps/web/app/api/chat/conversations/[id]/route.ts:381`; `packages/ui/ui/src/sidebar/Sidebar.tsx:852`; `apps/mobile/src/features/conversation-actions/useConversationActions.ts:124`; `apps/extension/src/side_panel.ts:12234`

**Gap.** No pin in CLI or VS Code. The ledger and the comparison disagree for Chrome.

**Acceptance criteria**

1. Pin a chat, reload: it stays pinned in a Pinned group.
2. Unpin it: it returns to its dated place.
3. Pin on web: it shows pinned on mobile after sync.

**Verification: seen working by a person.** Web W-13 free and subscribed: Pinned group, survived reload.

## CAP-conversations-and-history-08 Archive and unarchive chats

Hide a finished chat from the list without deleting it, and bring it back later.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code sessions only; not documented for Claude chat: partly**
  - [https://code.claude.com/docs/en/claude-code-on-the-web.md](https://code.claude.com/docs/en/claude-code-on-the-web.md): Archive a cloud coding session from its menu; find it on the Archived tab and unarchive. Archived sessions cannot take new messages. Apps: web.
  - [https://code.claude.com/docs/en/desktop.md](https://code.claude.com/docs/en/desktop.md): Archive a Desktop session; unarchive from the Archived tab. Apps: desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8809935-deleting-and-archiving-chats-in-chatgpt](https://help.openai.com/en/articles/8809935-deleting-and-archiving-chats-in-chatgpt): Archive removes a chat from the sidebar without confirmation; it stays searchable; manage under Settings, Data controls, Archived chats with Unarchive or Delete. Apps: web,ios,android.
  - [https://learn.chatgpt.com/docs/projects.md](https://learn.chatgpt.com/docs/projects.md): Archive finished chats, or archive all chats in a project; restore from Archived chats in settings. Apps: web,desktop.

**AGI requirement** (inferred; source: competitor parity). A chat can be archived and restored. Archiving never deletes. Archive keeps the chat's provider and Local or Cloud label.

**With different models, providers and the one subscription.** Free of model cost. Local chats archive on the device.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, desktop, mobile, CLI, VS Code done. Chrome missing in ledger, comparison says menu Archive exists. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S18.04, S4.04
- Comparison list ids: W310
- Code: `packages/ui/ui/src/sidebar/SessionItem.tsx:352`; `apps/web/features/chat/components/ConversationTitleMenu.tsx:194`; `apps/cli/src/lib.rs:1255`; `apps/extension-vscode/src/features/trees/sessionPickers.ts:126`

**Gap.** No archive-all for a project (W310). Archiving the open chat leaves it open (seen). Archiving offline gives no feedback (seen).

**Acceptance criteria**

1. Archive a chat: it leaves the list and the open view returns to a new chat or says it is archived.
2. Archive while offline: a clear message, no silent failure.
3. Restore it: back in the list with its old title and pin state.

**Verification: seen working by a person.** Web W-13 free and subscribed: archive, Archived list, restore, survived reload. Defects: offline archive silent, archived chat stays open.

## CAP-conversations-and-history-09 Archived chats list (restore or delete from it)

One place that lists archived chats with open, restore and delete actions.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://learn.chatgpt.com/docs/reference/settings.md](https://learn.chatgpt.com/docs/reference/settings.md): Archived chats section lists archived chats with dates and project context and restores them. Apps: desktop.
  - [https://help.openai.com/en/articles/8809935-deleting-and-archiving-chats-in-chatgpt](https://help.openai.com/en/articles/8809935-deleting-and-archiving-chats-in-chatgpt): Settings, Data controls, Archived chats with Unarchive or Delete. Apps: web,ios,android.

**AGI requirement** (inferred; source: competitor parity). Settings holds an Archived chats list where each chat can be opened, restored or deleted.

**With different models, providers and the one subscription.** No model cost. Lists only chats the account or device holds.

**Current implementation, as this trace read it on 2026-11-24: built.** Web, desktop, mobile, CLI, VS Code done; Chrome missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S4.04
- Comparison list ids: none matched
- Code: `apps/web/app/settings/archived/page.tsx:5`; `apps/web/features/settings/sections/ArchivedChatsSection.tsx:59`; `apps/cli/src/lib.rs:5609`

**Gap.** Chrome has no archived list.

**Acceptance criteria**

1. Archive two chats, open the list: both appear with dates.
2. Restore one: it leaves the list and returns to Recents.
3. Delete one from the list after a confirm that names what is lost.

**Verification: seen working by a person.** Web W-13: Archived (1) view and Restore worked.

## CAP-conversations-and-history-10 Delete a chat

Remove a chat with a confirmation that says what is lost.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/8230524-delete-or-rename-a-conversation](https://support.claude.com/en/articles/8230524-delete-or-rename-a-conversation): Delete from the three-dot menu with confirmation; the conversation leaves history immediately and is purged from the back end within 30 days. Plans: Free, Pro, Max, Ultra. Apps: web,ios,android.
  - [https://support.claude.com/en/articles/9796617-can-you-delete-data-that-i-sent-via-team-and-enterprise-plans](https://support.claude.com/en/articles/9796617-can-you-delete-data-that-i-sent-via-team-and-enterprise-plans): On Team and Enterprise, deleting removes chats from visible history while backend retention rules still apply. Plans: Team, Enterprise. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8809935-deleting-and-archiving-chats-in-chatgpt](https://help.openai.com/en/articles/8809935-deleting-and-archiving-chats-in-chatgpt): Delete from the sidebar menu or press-and-hold on mobile; removed from view at once and purged within 30 days. Apps: web,ios,android.
  - [https://help.openai.com/en/articles/7039943-how-openai-handles-data-in-consumer-services](https://help.openai.com/en/articles/7039943-how-openai-handles-data-in-consumer-services): Clear chat history one by one or all at once; deleted from systems within 30 days. Apps: web,ios,android.

**AGI requirement** (stated requirement; source: AGENTS.md section 9 (an action a user cannot undo asks first and names the consequence)). Deleting a chat asks first, names the consequence, and removes it from the list and search on every device.

**With different models, providers and the one subscription.** Delete must also remove stored content sent to any provider where AGI controls it, and say where a provider keeps its own copy. Local chats are deleted from the device.

**Current implementation, as this trace read it on 2026-11-24: built.** All six apps done per ledger. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S18.05
- Comparison list ids: none matched
- Code: `apps/web/app/api/chat/conversations/[id]/route.ts:468`; `apps/mobile/src/features/conversation-actions/useConversationActions.ts:160`; `apps/cli/src/lib.rs:1259`

**Gap.** See the recovery row: the web dialog says it cannot be undone.

**Acceptance criteria**

1. Delete a chat: a dialog names the chat and what is lost.
2. Confirm: chat is gone from list and search on all signed-in devices.
3. Cancel the dialog: chat is kept.

**Verification: seen working by a person.** Web W-13 free: confirm dialog, then gone from list and search. Subscribed run stopped at the dialog.

## CAP-conversations-and-history-11 Recover a deleted chat (Recently deleted)

A deleted chat waits in a recovery area for a period before it is erased for good.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - [https://support.claude.com/en/articles/8230524-delete-or-rename-a-conversation](https://support.claude.com/en/articles/8230524-delete-or-rename-a-conversation): Page only says the chat leaves history at once and is purged within 30 days; it names no user restore. Reviewed 2026-11-22. Plans: Free, Pro, Max, Ultra. Apps: web.
- **ChatGPT: no**
  - [https://help.openai.com/en/articles/8809935-deleting-and-archiving-chats-in-chatgpt](https://help.openai.com/en/articles/8809935-deleting-and-archiving-chats-in-chatgpt): Deleted chats are not restorable, even by Support. Reviewed 2026-11-22. Apps: web,ios,android.

**AGI requirement** (stated requirement; source: AGENTS.md section 9 (a chat or session is archived or moved to Recently deleted)). A chat a user deletes goes to Recently deleted first, can be restored for a stated period, and is then erased. Permanent removal happens only from an explicit action that names what is lost.

**With different models, providers and the one subscription.** Applies to every chat AGI stores, whatever model wrote it. Local chats go to a device recovery area.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Server soft-deletes and has a restore route. Support text, CLI privacy text and mobile copy say Recently deleted exists. The web browser run saw no chat recovery area. The Library has Recently deleted for files only. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S18.05
- Comparison list ids: none matched
- Code: `apps/web/app/api/chat/conversations/[id]/route.ts:40`; `apps/web/app/api/chat/conversations/[id]/restore/route.ts:26`; `apps/web/content/support/chat-basics.md:55-60`; `apps/cli/src/claude_parity.rs:465`; `apps/mobile/src/features/conversation-actions/useConversationActions.ts:299`

**Gap.** No screen to see or restore a deleted chat. Docs and copy promise one. The ledger marks delete done without checking recovery.

**Acceptance criteria**

1. Delete a chat: the dialog says it can be restored for a named number of days.
2. Open Recently deleted: the chat is listed with days left; Restore returns it to Recents.
3. After the period, the chat is gone and Search finds nothing.
4. Delete all chats: the same recovery rule applies, or the dialog says it does not.

**Verification: seen failing by a person.** Web W-13 free and subscribed: dialog says 'This cannot be undone'; no Recently deleted area for chats (web-problems-seen-in-browser.csv W-13, minor).

## CAP-conversations-and-history-12 Select many chats, archive all, delete all

Act on several chats at once, or on the whole history.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/8230524-delete-or-rename-a-conversation](https://support.claude.com/en/articles/8230524-delete-or-rename-a-conversation): Web: Select or Select all then Delete. Android: checklist icon enables multi-select with a trash icon. Plans: Free, Pro, Max, Ultra. Apps: web,android.
- **ChatGPT (project archive-all is from the desktop app docs): yes**
  - [https://help.openai.com/en/articles/7039943-how-openai-handles-data-in-consumer-services](https://help.openai.com/en/articles/7039943-how-openai-handles-data-in-consumer-services): Clear chat history one by one or all at once. Apps: web,ios,android.
  - [https://learn.chatgpt.com/docs/projects.md](https://learn.chatgpt.com/docs/projects.md): A project menu archives all chats in a project together. Apps: web,desktop.

**AGI requirement** (stated requirement; source: docs/decisions/2026-11-13-founder-decisions.md D-2026-11-13-01 (deleting all chats in Local mode on mobile); AGENTS.md section 9). Users can select several chats, and can archive or delete the whole history, each with a confirm that names the consequence. Mobile also deletes all chats in Local mode.

**With different models, providers and the one subscription.** Acts on stored chats of any provider. Local mode deletes on device only and says so.

**Current implementation, as this trace read it on 2026-11-24: built.** Web (bulk, archive all, delete all) and mobile (data controls) built. Project-level archive-all missing on web. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W310
- Code: `apps/web/app/api/chat/conversations/bulk/route.ts:62`; `apps/web/features/settings/components/BulkConversationControls.tsx:95`; `apps/mobile/src/features/settings/data-controls/index.tsx:320`; `apps/mobile/src/features/settings/data-controls/index.tsx:524`

**Gap.** Archive every chat in a project is missing (W310).

**Acceptance criteria**

1. Select three chats and delete: one confirm names the count.
2. Archive all: all chats move to Archived and none are deleted.
3. Delete all in Local mode on mobile: only device chats are removed, and the dialog says so.

**Verification: code inspected only.** Not covered by scorecards or the defect list.

## CAP-conversations-and-history-13 Temporary chat (not saved)

A chat that stays out of history, started from the composer, a menu or a shortcut.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (called incognito): yes**
  - [https://support.claude.com/en/articles/12260368-use-incognito-chats](https://support.claude.com/en/articles/12260368-use-incognito-chats): Ghost icon on a new non-project chat starts an incognito chat with a black border; closed with x; not saved to history, memory, training or recap. Unavailable inside projects. Plans: All plans. Apps: web,desktop,ios,android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/12677804-what-is-chatgpt-faq](https://help.openai.com/en/articles/12677804-what-is-chatgpt-faq): Temporary Chat started from the model menu; not saved in history, uses and creates no memories, not used for training. Apps: web.
  - [https://learn.chatgpt.com/docs/reference/commands.md](https://learn.chatgpt.com/docs/reference/commands.md): Desktop shortcut New temporary chat is Cmd+Shift+N. Apps: desktop.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md section 7.2 (Cloud Chat composer variants) and section 8 (temporary/incognito notice)). Cloud Chat offers temporary or incognito chat with a visible notice for as long as it is open.

**With different models, providers and the one subscription.** Works with any model on the AGI Managed route. A temporary chat on a BYOK or Local route must say where the content goes. Local-model chats on web and desktop are temporary by decision. Counts against quota like any chat.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, desktop, mobile done. CLI conflicting in ledger. VS Code and Chrome missing in ledger; Chrome comparison says it exists. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S12.17, S18.10, S41.01, S41.02
- Comparison list ids: none matched
- Code: `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:359`; `apps/web/features/chat/pages/WebChatPage.tsx:5435`; `apps/mobile/src/features/chat/components/TemporaryChatToggle.tsx:28`; `apps/extension/src/side_panel.ts:14341`

**Gap.** No temporary-chat shortcut on web (comparison row without id). VS Code none. CLI and Chrome unclear.

**Acceptance criteria**

1. Start a temporary chat: a banner says so until it is closed.
2. Send a message, leave, open the list: the chat is not there.
3. Search a word from it: no result.
4. Try to share it: a refusal says to turn off temporary chat first.

**Verification: code inspected only.** Not in the web scorecard or defect list.

## CAP-conversations-and-history-14 What a temporary chat leaves out, and how it is explained

The stated rules for history, search, memory, training, files and connectors in a temporary chat, shown on screen.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12260368-use-incognito-chats](https://support.claude.com/en/articles/12260368-use-incognito-chats): Incognito chats are kept 30 days by default (or the Enterprise period), appear in Team and Enterprise exports and the Compliance API, and cannot create files or run code in the new experience. Plans: All plans. Apps: web,desktop,ios,android.
  - [https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context): Incognito is excluded from search and memory. Plans: All plans. Apps: web,desktop,ios,android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/7039943-how-openai-handles-data-in-consumer-services](https://help.openai.com/en/articles/7039943-how-openai-handles-data-in-consumer-services): Temporary chats skip history, create no memories and are not used for training while temporary; a safety copy may be kept up to 30 days. Apps: web,ios,android.
  - [https://help.openai.com/en/articles/20001052-using-library-to-manage-files-in-chatgpt](https://help.openai.com/en/articles/20001052-using-library-to-manage-files-in-chatgpt): Temporary Chat uploads are not saved to Library. Apps: web.

**AGI requirement** (stated requirement; source: docs/decisions/2026-09-27-founder-decisions.md D-2026-09-28-05 (no safety copy); docs/product/definition.md (temporary chats neither read nor write memory)). A temporary chat stays out of history, search, memory and the Library, keeps no safety copy, and the screen says what a connector or provider may still keep.

**With different models, providers and the one subscription.** AGI cannot erase a copy a BYOK provider or connector keeps; the notice must say so. Local-model temporary chats never leave the device.

**Current implementation, as this trace read it on 2026-11-24: built.** Web, desktop done; mobile done except plugin note and kept-output choice. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S41.03, S41.04, S41.05, S41.06, S41.07, S41.08, S41.09
- Comparison list ids: none matched
- Code: `apps/web/lib/temporary-chat-policy.ts:22-29`; `apps/web/app/api/cron/purge-temporary-chats/route.ts:49`; `apps/mobile/src/features/chat/components/TemporaryChatBanner.tsx:40`

**Gap.** Mobile lacks the plugin note and generated-output saving choice (S41.07, S41.09). A purge job deletes temporary rows after 30 days; whether that conflicts with 'no safety copy' is not checked.

**Acceptance criteria**

1. Open the explanation line: it names history, search, memory and Library.
2. Attach a file in a temporary chat: it is not in Library afterwards.
3. Use a connector: it asks each time and the screen says the service keeps its own record.
4. After 30 days no temporary row or attachment remains.

**Verification: code inspected only.** Not covered by any person-run result.

## CAP-conversations-and-history-15 Choose personalised or plain at the start of a temporary chat

Before starting, pick whether a temporary chat may use memory, instructions and plugins; it cannot change mid-chat.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Aug 27, 2026: personalised temporary chats use memory, custom instructions and plugins but add no memories; non-personalised is default; fixed after the chat starts. Apps: web,ios,android.

**AGI requirement** (inferred; source: competitor parity). Where offered, the choice is made before the first message and is honoured; nothing is written to memory either way.

**With different models, providers and the one subscription.** Memory read adds input tokens on any model and counts against quota.

**Current implementation, as this trace read it on 2026-11-24: built.** Web, desktop, mobile done. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S41.04, S41.05, S41.06
- Comparison list ids: none matched
- Code: `apps/web/features/chat/pages/WebChatPage.tsx:7366-7374`; `apps/mobile/src/features/chat/components/TemporaryChatBanner.tsx:18-98`

**Gap.** The product definition says temporary chats neither read nor write memory; the code allows reading. Owner to align (see unresolved).

**Acceptance criteria**

1. Start plain: the reply cannot cite saved memory.
2. Start personalised: it can, and no new memory is written.
3. The choice cannot be switched after the first message.

**Verification: code inspected only.** No person-run result.

## CAP-conversations-and-history-16 Save a temporary chat

Turn a temporary chat into a normal saved chat.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: no**
  - [https://support.claude.com/en/articles/12260368-use-incognito-chats](https://support.claude.com/en/articles/12260368-use-incognito-chats): An incognito chat cannot be converted or reopened. Plans: All plans. Apps: web,desktop,ios,android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8914046-temporary-chat-in-chatgpt](https://help.openai.com/en/articles/8914046-temporary-chat-in-chatgpt): Saving turns it into a regular chat that follows personalization and model-improvement settings. Apps: web,ios,android.

**AGI requirement** (inferred; source: competitor parity (ChatGPT only)). The user can save a temporary chat explicitly, sees what will be kept, and confirms.

**With different models, providers and the one subscription.** Saving writes the chat to the account only if the route is AGI Managed; on Local or BYOK it needs the explicit fork with consent.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, desktop done. Mobile missing the review step and save is partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S41.10, S41.11
- Comparison list ids: MP21
- Code: `apps/web/features/chat/pages/WebChatPage.tsx:4969-4991`; `apps/mobile/app/(app)/chat/[id].tsx:2051-2066`

**Gap.** Mobile has no review before conversion (S41.11, MP21).

**Acceptance criteria**

1. Save a temporary chat: a dialog lists what will be kept.
2. After confirming, it appears in the list and in search.
3. Cancel: it stays temporary.

**Verification: code inspected only.** No person-run result.

## CAP-conversations-and-history-17 Export one chat

Save a single conversation to a file or the clipboard.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code only (/export); not documented for Claude chat: partly**
  - [https://code.claude.com/docs/en/commands.md](https://code.claude.com/docs/en/commands.md): /export exports the conversation as plain text to a file or clipboard. Apps: cli.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md section 8 (export/download where allowed)). A user can export or download a conversation where allowed.

**With different models, providers and the one subscription.** The export is built by AGI from stored messages, so it works for any model. It must not include other providers' hidden data.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web (Markdown, JSON, HTML, PDF, DOCX, print), mobile, CLI /export done. VS Code: ledger says missing, comparison says exists. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S18.18
- Comparison list ids: none matched
- Code: `apps/web/features/chat/components/dialogs/EnhancedExportDialog.tsx:35`; `apps/web/features/chat/components/ConversationTitleMenu.tsx:178`; `apps/cli/src/tui/tui_app.rs:3581`; `apps/extension-vscode/src/core/commandSetup.ts:1369`

**Gap.** Chrome has none. VS Code status conflicts.

**Acceptance criteria**

1. Export a chat as Markdown: the file has every message in order.
2. Export as PDF: opens and matches the chat.
3. Export a chat with attachments: the file says how they are included.

**Verification: code inspected only.** No person-run result.

## CAP-conversations-and-history-18 Export all my data

Request an archive of chats and account data in settings.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/9450526-export-your-claude-data](https://support.claude.com/en/articles/9450526-export-your-claude-data): Free to Ultra export chats and account data; emailed link valid 24 hours. Plans: Free, Pro, Max, Ultra. Apps: web,desktop.
  - [https://support.claude.com/en/articles/13346720-export-your-organization-s-data](https://support.claude.com/en/articles/13346720-export-your-organization-s-data): Primary Owners export conversation data. Plans: Team, Enterprise. Apps: web,desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/7260999-exporting-your-chatgpt-history-and-data](https://help.openai.com/en/articles/7260999-exporting-your-chatgpt-history-and-data): Request an export in Data controls on web, iOS or Android; not for Business or Enterprise. Plans: Free, Go, Plus, Pro, Edu. Apps: web,ios,android.
  - [https://help.openai.com/en/articles/10479654-onboarding-employees-with-existing-chatgpt-accounts](https://help.openai.com/en/articles/10479654-onboarding-employees-with-existing-chatgpt-accounts): Exports can take up to 7 days; links expire after 24 hours. Plans: Personal. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/definition.md (Privacy settings include data export); docs/product/experience-contract.md section 5). Privacy settings include data export covering chats.

**With different models, providers and the one subscription.** Export covers chats AGI holds. Local chats stay on device and are exported there. One account, one export, whatever the plan.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and mobile built. Member self-export and org export are partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: WP225, WP238
- Code: `apps/web/features/settings/components/DataExportRow.tsx:71`; `apps/web/app/api/user/export/route.ts:133`; `apps/mobile/src/features/settings/cloud-account/index.tsx:916`

**Gap.** Admin member self-export switch and owner org export are partial.

**Acceptance criteria**

1. Request an export: a link arrives and expires as stated.
2. The file lists every non-temporary chat, no deleted chat.
3. Local chats are not in a cloud export.

**Verification: code inspected only.** No person-run result.

## CAP-conversations-and-history-19 Resume past sessions in coding tools

Reopen a past coding session by list, name or ID in the terminal or editor.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code (separate tool): partly**
  - [https://code.claude.com/docs/en/common-workflows.md](https://code.claude.com/docs/en/common-workflows.md): --continue resumes the latest session; --resume or /resume opens a picker; sessions are saved locally. Apps: cli.
  - [https://code.claude.com/docs/en/desktop.md](https://code.claude.com/docs/en/desktop.md): In Desktop, /resume lists CLI sessions, searchable by title, folder or branch. Apps: desktop.
- **Codex (separate tool): partly**
  - [https://learn.chatgpt.com/docs/projects.md](https://learn.chatgpt.com/docs/projects.md): Codex CLI /resume or codex resume continues a saved chat; IDE Recent chats resumes chats. Apps: cli,ide.
  - [https://learn.chatgpt.com/docs/app-server.md](https://learn.chatgpt.com/docs/app-server.md): Thread fork, resume, archive, unarchive, delete, rename. Apps: cli,desktop,ide.

**AGI requirement** (stated requirement; source: docs/product/definition.md line 119 (developer continuity domain); docs/decisions/2026-09-27-founder-decisions.md D-2026-09-28-25 and D-2026-09-28-29). Desktop Code, CLI and VS Code share session IDs and transcripts; a session can be resumed, found by search, renamed and archived.

**With different models, providers and the one subscription.** Sessions stay local to the host. A resumed session keeps its model and provider choice and never moves to the cloud silently.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI and VS Code resume, search and archive. Rename, picker details and history switches are partial or missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S34.02, S4.02
- Comparison list ids: CP29, CP294, V14, VP72
- Code: `apps/cli/src/sessions.rs:723`; `apps/cli/src/lib.rs:1931`; `apps/extension-vscode/src/core/commandSetup.ts:1473`

**Gap.** No rename or auto-archive in VS Code (V14). Session picker preview and PR search partial (CP29). Turning off history saving partial (CP294, VP72).

**Acceptance criteria**

1. Start a session, quit, resume by name: transcript is intact.
2. Search sessions by word: match found.
3. Resume in VS Code a session begun in the CLI.

**Verification: code inspected only.** No person-run result.

## CAP-conversations-and-history-20 History follows the account across devices

A chat started on one device appears and continues on another.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one-claude](https://support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one-claude): One Recents list for chats and tasks on web, desktop, iOS and Android. Reviewed 2026-11-22. Apps: web,desktop,ios,android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001723-using-the-new-experience-in-the-chatgpt-mobile-app](https://help.openai.com/en/articles/20001723-using-the-new-experience-in-the-chatgpt-mobile-app): Sidebar chat list syncs across devices. Apps: ios,android.
  - [https://help.openai.com/en/articles/11391654-chatgpt-business-release-notes](https://help.openai.com/en/articles/11391654-chatgpt-business-release-notes): Cloud Work syncs across web, mobile and desktop. Plans: All plans. Apps: web,ios,android,desktop.

**AGI requirement** (stated requirement; source: docs/product/definition.md (ChatGPT baseline: one account across devices); docs/product/commercial.md (Chrome mirrors Managed Cloud chats only); AGENTS.md section 6). One signed-in account spans devices. Managed Cloud chats sync; Local and BYOK chats stay on their device unless the user forks with consent.

**With different models, providers and the one subscription.** Sync follows the one subscription's account, not the model. A Local chat never uploads.

**Current implementation, as this trace read it on 2026-11-24: built.** All six apps done per ledger; Chrome mirrors Managed Cloud turns only. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S18.28
- Comparison list ids: none matched
- Code: `apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts:160`; `apps/mobile/src/features/chat/ChatsListScreen.tsx:330`; `apps/cli/src/cloud/mod.rs:178`

**Gap.** Reload mid-answer can leave a chat with no answer (seen, W-3).

**Acceptance criteria**

1. Send on web, open the same account on mobile: chat and answer present.
2. Local chat on mobile does not appear on web.
3. Reload mid-answer: the chat shows the answer or a clear retry.

**Verification: seen failing by a person.** Web W-3 subscribed: reload mid-answer left no answer until a second reload (major defect).

## CAP-conversations-and-history-21 Local-mode chats stay on the device

Chats made with on-device models are kept only on that device.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (stated requirement; source: AGENTS.md section 6; docs/decisions/2026-09-27-founder-decisions.md D-2026-09-28-20). Local chats are never uploaded or routed to BYOK or cloud without an explicit consented fork. Web and desktop treat local-model chats as temporary.

**With different models, providers and the one subscription.** Free on mobile and desktop where possible. Search, rename, delete and export work on device with no subscription call.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Mobile, CLI, VS Code, Chrome keep local chats on the device. Web and desktop temporary by decision. One-step clear of all local data exists only on mobile. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S41.14, S41.17
- Comparison list ids: none matched
- Code: `apps/web/lib/temporary-chat-policy.ts:50`; `apps/mobile/src/features/settings/data-controls/index.tsx:20`; `apps/cli/src/claude_parity.rs:459`

**Gap.** No clear-local-data action on web, desktop, CLI, VS Code or Chrome (S41.17).

**Acceptance criteria**

1. Chat in Local mode, turn off network: the chat is still listed and searchable.
2. Inspect network on a Local chat: no content leaves the device.
3. Clear local data: all local chats are gone.

**Verification: code inspected only.** No person-run result.

## CAP-conversations-and-history-22 Chat without an account

A signed-out visitor can chat within limits and is nudged to sign in.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/9125172-the-chatgpt-home-page](https://help.openai.com/en/articles/9125172-the-chatgpt-home-page): Signed-out users chat free in supported countries, one conversation at a time, history kept only in that browser session; sign-up unlocks history and export. Plans: Free (signed out). Apps: web.

**AGI requirement** (stated requirement; source: docs/decisions/2026-09-27-founder-decisions.md D-2026-09-28-09). Signed-out web and desktop chat: text only, default free model, no saved history, with limits from configuration.

**With different models, providers and the one subscription.** Uses the free model slot and a separate cap, outside any plan quota.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and desktop partial; mobile and CLI done. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S12.24
- Comparison list ids: none matched
- Code: none cited

**Gap.** Web and desktop are partial per ledger; the kill switch stays off until final checks (per decision).

**Acceptance criteria**

1. Signed out, send one message: reply arrives, nothing saved after reload.
2. Hit the cap: a sign-in prompt shows.
3. Sign in: the guest chat is not kept.

**Verification: not verified.** Sign-in could not complete in the browser run (W-1 setup blocker).

## CAP-conversations-and-history-23 Shortcuts and unread marks for chat actions

Keyboard shortcuts for new, temporary, pin, rename, archive and search, and a way to mark a chat unread.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT desktop app (docs also cover Codex): yes**
  - [https://learn.chatgpt.com/docs/reference/commands.md](https://learn.chatgpt.com/docs/reference/commands.md): Shortcuts exist for new chat, temporary chat, archive, mark unread, pin, rename and search chats. Apps: desktop.

**AGI requirement** (inferred; source: competitor parity). The desktop and web apps offer shortcuts for the common chat-list actions.

**With different models, providers and the one subscription.** No model or quota effect.

**Current implementation, as this trace read it on 2026-11-24: partly built.** New chat shortcut built. Pin, rename, archive, unread shortcuts partial. Temporary chat shortcut missing. Mark unread exists in the menu. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: DP14, WP44
- Code: `packages/ui/unified-chat/src/lib/shortcutRegistry.ts:71`; `packages/ui/ui/src/sidebar/SessionItem.tsx:365`

**Gap.** Missing temporary-chat shortcut; other shortcuts have no ids.

**Acceptance criteria**

1. Press the temporary-chat shortcut: a temporary chat opens.
2. Press each of pin, rename, archive: the action runs on the open chat.
3. Shortcuts are listed in a shortcut help view.

**Verification: code inspected only.** No person-run result.

## CAP-conversations-and-history-24 Move a chat into or out of a project

File a chat in a project, move it, or keep it standalone.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects](https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects): Chat dropdown Add to project opens a Move chat modal; chats can be moved between projects or removed. Apps: web,desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10169521-projects-in-chatgpt](https://help.openai.com/en/articles/10169521-projects-in-chatgpt): Drag a chat or use Move to project; Remove from project reverses it; temporary chats cannot move. Apps: web,ios,android.

**AGI requirement** (inferred; source: competitor parity). A chat can move into, out of and between projects, and the user can pick a project before sending.

**With different models, providers and the one subscription.** The chat keeps its model and provider choice. Local chats are not moved into a cloud project without consent.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, desktop, mobile done; CLI, VS Code, Chrome missing for move; project pick before sending is done on all six. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S12.20, S18.07
- Comparison list ids: none matched
- Code: `packages/ui/ui/src/sidebar/SessionItem.tsx:386`; `apps/mobile/src/features/conversation-actions/useConversationActions.ts:263`

**Gap.** No move from CLI, VS Code, Chrome. Details sit on the projects page.

**Acceptance criteria**

1. Move a chat into a project: it shows in the project's chats and uses its instructions.
2. Remove it: it returns to standalone.
3. A temporary chat cannot be moved and says why.

**Verification: code inspected only.** Web W-11 saw project chat isolation work; moving an existing chat was not tested.

## CAP-conversations-and-history-25 Locked chats behind a PIN

Chats saved but hidden from list and search until unlocked.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/7730893-data-controls-in-chatgpt](https://help.openai.com/en/articles/7730893-data-controls-in-chatgpt): Locked chats stay saved but are hidden from the sidebar, search, recents, notifications and previews. Apps: web,ios,android.
  - [https://help.openai.com/en/articles/8809935-deleting-and-archiving-chats-in-chatgpt](https://help.openai.com/en/articles/8809935-deleting-and-archiving-chats-in-chatgpt): Open locked chats under Projects then Locked chats with account PIN or device authentication. Apps: web,ios,android.

**AGI requirement** (proposed; source: competitor parity (ChatGPT only); D-2026-09-27-02 says features neither leader offers are not built). Not decided.

**With different models, providers and the one subscription.** Metadata only; no model effect. A lock on a Local chat would use device authentication.

**Current implementation, as this trace read it on 2026-11-24: not built.** Missing on web and mobile. Mobile has an app-wide biometric lock only. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: M179, M31, W300, W305, W75
- Code: `apps/mobile/src/features/settings/safety-security/index.tsx:25`

**Gap.** Whole feature absent.

**Acceptance criteria**

1. Lock a chat: it disappears from list and search.
2. Unlock needs PIN or device check.
3. A locked chat can still be deleted.

**Verification: not verified.** Code search found nothing.

## Unresolved product choices

Decisions this topic needs from the owner. Nothing here has been decided.

- Locked chats: only ChatGPT documents them; match or not.
- Search default: ChatGPT includes archived chats; AGI web leaves them out unless a switch is on.
- Personalised temporary chat: definition.md says temporary chats neither read nor write memory; AGI code lets a user pick to read memory.
- Recently deleted for chats: AGENTS.md requires it; the owner must confirm the period and whether Delete all skips it.
- Temporary chat purge at 30 days versus the decision to keep no safety copy.
- Single-chat export formats and whether to match: neither leader's chat export is in the catalogue.
- Pin, rename and archive in CLI, VS Code and Chrome: decisions keep VS Code and Chrome at Claude's scope; the ledger and comparison disagree for Chrome.
- Whether Claude's lack of Save a temporary chat is a reason to drop it (ChatGPT only).

## Could not establish

- The catalogue shows no Claude chat pin, chat archive, archived list, shortcuts, or single-chat export. Marked unknown.
- I read catalogue lines only and did not open the saved pages.
- Whether ChatGPT chat has single-chat export: not shown.
- Ledger and comparison disagree: Chrome rename, archive and temporary chat; VS Code export; CLI temporary chat (S41.01 missing, S12.17 and S18.10 done). Not resolved by code reading.
- No person-run result exists for temporary chat, export, bulk actions, mobile, desktop, CLI, VS Code or Chrome. The subscribed web delete stopped at the confirm dialog.
- The purge job's full effect on temporary chats and attachments was not traced.
- The ledger holds no live-result lines for these areas.
- Plan limits on history length or retention for Claude chat are not in the catalogue.
