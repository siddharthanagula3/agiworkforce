# Web production-readiness punch-list (audit wc7vkv3sc)

byStatus: {'DEAD': 9, 'MOCK_ONLY': 3, 'PARTIAL': 9, 'COMING_SOON': 1}

## CRITICAL (0)

## HIGH (9)

- [DEAD] Slash-command menu entries /think, /image, /doc, /code, /undo, /compact (Composer 'Type / for commands')
  loc: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:800-805
  intended: Per the canonical registry (apps/web/features/chat/commands/slash-command-registry.ts:58-131), selecting /think should enable extended reasoning, /image should switch the composer into image-generation mode, /doc should
  gap: handleSlashSelect (ChatComposerNew.tsx:800) only branches on `commandId === 'search'` (which just flips webSearchEnabled). Every other command -- /think, /image, /doc, /code, /undo, /compact -- falls through to the shared tail: it clears the composer text and closes the menu with zero other effect.
  backendExists: ?

- [MOCK_ONLY] Response Style selector in the composer footer (presets + 'Create Custom Style' with writing-sample tone matching)
  loc: apps/web/features/chat/components/Composer/StyleSelector.tsx:39-281 (rendered via apps/web/features/chat/components/Composer/ComposerFooter.tsx:700-704)
  intended: Visible next to the model selector for paid users (ComposerFooter showStyleSelector={!isFreeTrial}). Lets the user pick a preset (Default/Concise/Detailed/Technical/Creative) or build and save a custom style (name + writ
  gap: useStyleStore/getStyleInstruction (apps/web/features/chat/stores/style-store.ts) is imported ONLY by StyleSelector.tsx itself -- confirmed by repo-wide grep, no other file reads it. The selection is never read into ChatComposerNew's onSend meta, useChatStream's request options, or any API route; it
  backendExists: ?

- [MOCK_ONLY] Star project (ProjectCard "⋯" menu → Star/Unstar) and "Pin project"/"Unpin project" (project detail page "⋯" menu) — also drives t
  loc: packages/ui/unified-chat/src/stores/projectStore.ts:87-92 (toggleStar mutates memory only); apps/web/features/projects/services/managed-cloud-projects.ts:19-43 (toWebProject never
  intended: Starring/pinning a project should persist so it stays pinned across sessions and the 'Starred first' sort mode reflects real state.
  gap: `starred` exists only as a client-side Zustand field (packages/ui/unified-chat/src/lib/types.ts:203). toggleStar() only flips it in memory; there is no DB column, no field in ManagedCloudProjectUpdateRequestSchema, and mapProjectRow never reads/writes it. Every full page reload calls hydrateManagedC
  backendExists: False

- [PARTIAL] Archive project (ProjectCard "⋯" menu → Archive)
  loc: packages/ui/unified-chat/src/components/ProjectCard.tsx:218-246; apps/web/app/projects/page.tsx:34-52,78-91 (persists isArchived:true correctly); no unarchive UI anywhere
  intended: Archiving should be a reversible soft-hide (Claude/ChatGPT pattern), with a way to view and restore archived projects.
  gap: Archiving does correctly persist `isArchived:true` server-side, but there is no 'Archived' list/section anywhere in the web UI, no unarchive control in ProjectSettingsDialog, and the project-detail '⋯' menu only has 'Project settings' and 'Pin project' — no restore option. GET /api/projects doesn't
  backendExists: True

- [DEAD] Connect (GitHub row) — Settings → Connectors, the only connectors surface authenticated users actually reach
  loc: apps/web/features/settings/components/WebSettingsModal.tsx:111-123 (root cause: canConnect hardcoded false, ignoring GET /api/connectors' real `available` list); apps/web/app/conne
  intended: Let a signed-in user connect GitHub so the assistant can use the already-built GitHub App tools (get PR diff, comment on issue/PR, post PR review — lib/github-app.ts + lib/user-connector-tools.ts).
  gap: POST /api/connectors returns 409 + installStartPath for github, and only ConnectorsPage.tsx/use-connectors.ts follows that redirect to /api/github/install/start. But apps/web/app/connectors/page.tsx redirects every signed-in visitor straight to <SettingsModalRedirect>, whose ConnectorsPanel (WebSett
  backendExists: True

- [PARTIAL] Settings → Capabilities → "Memory" toggle ("Allow AGI to remember details across conversations")
  loc: apps/web/features/settings/sections/CapabilitiesSection.tsx:110-117
  intended: Turning this off should stop AGI from using saved memory facts in conversations, per its own description.
  gap: The toggle persists to the 'capabilities' preference namespace (savePreferenceNamespace, backendExists=true), but the actual chat memory injection path (apps/web/lib/runtime/WebChatRuntime.ts:129, `buildMemorySystemContent(useMemoryStore.getState().facts)`) never checks this preference — it always i
  backendExists: ?

- [DEAD] Settings → Security → "Session Timeout" select (15 min / 30 min / 1 hr / 4 hr / Never)
  loc: apps/web/features/settings/components/Settings/TwoFactor.tsx:92-118
  intended: Auto-sign the user out after the chosen period of inactivity, as implied by the Security section copy.
  gap: Saves via SecuritySection.tsx's `useUpdateSettings` → PATCH /api/settings/preferences (backendExists=true), but the only enforcement logic, `useSessionTimeout` (apps/web/shared/hooks/useSessionTimeout.ts), which reads `settings.session_timeout` and force-logs-out on inactivity, has zero call sites a
  backendExists: ?

- [PARTIAL] Sidebar project row "…" menu → "Share project"
  loc: packages/ui/ui/src/sidebar/Sidebar.tsx:1127-1134 (menu item) wired to apps/web/features/chat/pages/WebChatPage.tsx:1478-1483 (handleProjectShare)
  intended: Generate/manage a shareable link for the project, matching the working conversation-share flow.
  gap: handleProjectShare's own code comment admits 'there is no dedicated project-share API yet' and just does router.push(`/projects/${projectId}`). Verified apps/web/app/projects/[id]/page.tsx and packages/ui/unified-chat/src/components/ProjectHeader.tsx contain no share control at all (only 'Project se
  backendExists: ?

- [PARTIAL] Sidebar row context menu → Star / Archive (secondary shell surfaces: /projects, /projects/[id], /library, /schedules)
  loc: apps/web/shared/components/layout/WebAppShell.tsx:169-181 (handleStarSession, handleArchiveSession)
  intended: Toggle a conversation's starred/archived flag and persist it to the account so it survives reload and shows consistently across devices, same as the adjacent Pin action on the same row.
  gap: handlePinSession (line 162-167) correctly calls the API-backed `updateConversation` from useConversations(), which PUTs to /api/chat/conversations/[id] and updates the store from the server response. handleStarSession/handleArchiveSession instead call `updateConversationInStore` — a pure local Zusta
  backendExists: ?

## MEDIUM (7)

- [PARTIAL] Remove/delete an uploaded project knowledge file (Sources / Files)
  loc: apps/web/features/projects/components/KnowledgeFilesPanel.tsx:268-316 (file list has no delete action); apps/web/features/projects/components/SourcesPanel.tsx:420-473 (same); apps/
  intended: Users should be able to remove a knowledge file/source they uploaded to a project.
  gap: Neither the Files panel inside Project Settings nor the ChatGPT-style Sources tab exposes any delete/remove affordance for an uploaded file, and the FilePreviewModal only offers Download and Close. The soft-delete endpoint already exists (DELETE /api/projects/[id]/knowledge-files/[fileId], apps/web/
  backendExists: True

- [MOCK_ONLY] Tool access mode selector + Connector discovery toggle — Capabilities settings (the redirect target of /connectors/permissions)
  loc: apps/web/features/settings/sections/CapabilitiesSection.tsx:158-180
  intended: Let the user choose how AGI loads connector tools ('Always allow' / 'Load tools when needed' / 'Custom') and whether the assistant proactively suggests relevant connectors during conversations.
  gap: Both values persist correctly via savePreferenceNamespace('capabilities', ...) with real saving/saved/error status text, but no code elsewhere in apps/web reads settings.toolAccessMode or settings.connectorDiscovery (grep-negative across the tool loop, connector-offering code, and chat UI) — the sel
  backendExists: False

- [DEAD] Settings → Capabilities → "Search and reference chats", "Tool access mode", "Connector discovery", "Artifacts" toggles/select
  loc: apps/web/features/settings/sections/CapabilitiesSection.tsx:119-126,158-171,173-180,188-195
  intended: Gate whether AGI can search past chats for context, how it loads connector tools, whether it surfaces connector suggestions, and whether it renders inline artifacts.
  gap: All four persist to the 'capabilities' preference namespace (backendExists=true) but have zero consumers anywhere in apps/web/lib or apps/web/app/api (confirmed via grep) — no chat/tool/artifact code path reads searchChats, toolAccessMode, connectorDiscovery, or artifacts. This is the same dead-cont
  backendExists: ?

- [DEAD] Settings → General → "Voice" selector (Nova / Ember / Vale / Echo)
  loc: apps/web/features/settings/sections/GeneralSection.tsx:400-412
  intended: Choose the voice used when AGI speaks responses aloud.
  gap: Persists to the 'general' preference namespace (backendExists=true) but the only TTS implementation, apps/web/lib/hooks/useTTS.ts, uses the browser's default SpeechSynthesis voice with no parameter for these named voices — there is no consumer anywhere. The dedicated /settings/voice page (apps/web/a
  backendExists: ?

- [DEAD] Settings → General → "Chat font" selector (Instrument Serif / System Sans / JetBrains Mono)
  loc: apps/web/features/settings/sections/GeneralSection.tsx:388-398
  intended: Change the font used to render chat messages.
  gap: Persists to the 'general' preference namespace (backendExists=true) but nothing in apps/web/features/chat reads this value to apply a font. A separate, real `chatFont`/`chatFontSize` mechanism exists in shared/stores/web-settings-store.ts, but its only consumer, AppearanceSettings.tsx, is itself orp
  backendExists: ?

- [PARTIAL] Command palette → "Search Conversations" (Actions group)
  loc: apps/web/shared/components/CommandPalette/CommandPalette.tsx:114-122
  intended: Jump straight into the conversation-search dialog from anywhere in the app (advertised shortcut ⌘F).
  gap: Action does `router.push('/chat?search=true')`. apps/web/features/chat/pages/WebChatPage.tsx only reads `highlightMessage` and `projectId` from searchParams (grep confirms no `search` param handling); it also has a stale `agi:open-search` window-event listener (line 484-489) that nothing in the code
  backendExists: ?

- [PARTIAL] Docs sidebar sub-links under CLI ("Overview", "Sessions", "REPL", "Hooks") and Mobile ("Overview", "App Setup")
  loc: apps/web/app/docs/page.tsx:27-31,48-50
  intended: A docs sidebar with named sub-topics per surface (CLI > Overview / Sessions / REPL / Hooks; Mobile > Overview / Local Mode / App Setup) implies each label routes to distinct reference content for that topic.
  gap: Four CLI sidebar links ("Overview", "Sessions", "REPL", "Hooks") all point to the identical href `/cli` (lines 27-30), and two Mobile links ("Overview", "App Setup") both point to `/mobile` (lines 48, 50). Every one of these labeled nav items lands on the same single marketing page with no anchor/se
  backendExists: True

## LOW (6)

- [PARTIAL] '+' menu 'Add photos & files' entry
  loc: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1314-1325
  intended: Label implies both images and general files can be attached to a chat message.
  gap: The hidden file input backing this button is hard-coded to accept="image/_" (line ~1856), and handleFileDrop/addImageAttachments filter to image/_ with an honest inline notice ('Web chat currently accepts images only. Other file types require Cloud file support.') when a non-image is dropped. The co
  backendExists: ?

- [DEAD] Composer 'Active mode tags' strip (ActiveModeTags row, with per-tag dismiss X button)
  loc: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:298,660,1031 (component: apps/web/features/chat/components/Composer/ActiveModeTags.tsx:26-27)
  intended: Show removable pill tags for active composer modes (e.g. an enabled toggle) above the input, with a working X to dismiss each one.
  gap: `activeTags` state is initialized to `[]` and is only ever cleared (`setActiveTags([])` on send/clear) or filtered on dismiss (`handleTagDismiss`) — no code path anywhere in the file ever pushes an item into it. `ActiveModeTags` returns null when `tags.length === 0` (ActiveModeTags.tsx:27), so the r
  backendExists: ?

- [COMING_SOON] "Memory" dropdown in Project Settings dialog
  loc: apps/web/features/projects/components/ProjectSettingsDialog.tsx:192-211
  intended: Let a project opt in/out of cross-chat memory scoping, as the helper copy underneath implies ("Project can access memories from outside chats, and vice versa").
  gap: The <select> is uncontrolled (defaultValue only), has a single hardcoded 'Default' option, no onChange handler, and is never read from or written to the project record. It renders as an interactive control but nothing can actually be selected or persisted.
  backendExists: False

- [DEAD] DocumentActions component (Copy / Export MD·PDF·DOCX / Share / AI-enhance actions for a generated document artifact)
  loc: apps/web/features/chat/components/artifacts/DocumentActions.tsx (whole component); barrel export apps/web/features/chat/components/artifacts/index.ts:3
  intended: Provide document-specific export/share/enhance actions for a document-type artifact.
  gap: Exported from the artifacts barrel but never imported or rendered by any page/component in the app (grep across apps/web finds zero consumers besides its own file). The real ArtifactPreview/ArtifactsPanel path has its own separate, working download/share implementation, so this is fully orphaned dea
  backendExists: False

- [PARTIAL] OAuth Client ID / Client Secret fields — Add custom connector form (Settings → Connectors → Add)
  loc: packages/ui/ui/src/settings-modal/SettingsModal.tsx:790-811 (fields render and submit); apps/web/features/settings/components/WebSettingsModal.tsx:428-439 (addCustomConnector rejec
  intended: Let a user register a custom remote MCP connector secured by OAuth client credentials instead of a bearer token.
  gap: The Advanced settings panel renders enabled OAuth Client ID/Secret inputs that accept input and submit with the form, but addCustomConnector throws 'OAuth client credentials are not supported yet...' whenever either field is non-empty, so any submission using these fields is guaranteed to fail (surf
  backendExists: False

- [DEAD] Command palette → "Toggle Sidebar" (Preferences group, chat-route-only)
  loc: apps/web/shared/components/CommandPalette/CommandPalette.tsx:80-92 (isChatRoute-gated command) vs apps/web/shared/components/CommandPalette/CommandPaletteProvider.tsx:13-22 (⌘K sup
  intended: Let a keyboard user collapse/expand the chat sidebar via the command palette while on a chat route.
  gap: The command only appears when `isChatRoute` (`pathname` starts with `/chat` or `/chats`), but CommandPaletteProvider's own ⌘K listener explicitly returns early (never opens the palette) on exactly `/chat` and `/chat/[id]` — the only routes where `isChatRoute` is true (there is no other `/chat*` rout
  backendExists: ?
