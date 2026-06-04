# Desktop UI Computer Use Audit

Status: Current pass, 2026-06-04
App bundle checked: `/Users/siddhartha/.codex/worktrees/4ec1/agiworkforce/target/release/bundle/macos/AGI Workforce.app`
Screenshot directory: `/Users/siddhartha/.codex/worktrees/4ec1/agiworkforce/audit/desktop-ui-computer-use`

## Fixed Issues

### Local Mode Status Pill

- Screenshot path: `audit/desktop-ui-computer-use/settings-recheck-34-rebuilt-home-refocused-20260604.png`
- Screen/flow: Home empty chat
- What looked wrong: Local Mode previously advertised `Cloud Sync` in the center status pill, which made Local Mode look like a lesser cloud tier.
- Reference used: Claude/OpenAI local app framing and AGI Local/BYOK/Cloud trust-boundary requirements.
- File changed: `packages/unified-chat/src/components/EmptyState.tsx`
- Fix made: Removed the default plan action from the shared empty state. The pill now shows `Local Mode` only unless a host explicitly passes an action.
- Recheck screenshot path: `audit/desktop-ui-computer-use/settings-recheck-34-rebuilt-home-refocused-20260604.png`
- Status: fixed

### Settings Entry Duplication

- Screenshot path: `audit/desktop-ui-computer-use/settings-recheck-34-rebuilt-home-refocused-20260604.png`
- Screen/flow: Desktop V3 sidebar
- What looked wrong: Settings appeared as a main sidebar nav item while the footer also had a settings affordance, creating duplicate ownership.
- Reference used: Claude Desktop footer/account settings pattern.
- File changed: `apps/desktop/src/features/v3/Sidebar.tsx`
- Fix made: Removed the main sidebar Settings row and made the bottom-right footer gear the settings entry.
- Recheck screenshot path: `audit/desktop-ui-computer-use/settings-recheck-35-rebuilt-bottom-gear-settings-20260604.png`
- Status: fixed

### Local Signed-Out Footer

- Screenshot path: `audit/desktop-ui-computer-use/settings-recheck-34-rebuilt-home-refocused-20260604.png`
- Screen/flow: Desktop V3 sidebar footer
- What looked wrong: Local Mode could show a fake local account/logout-style state instead of a signed-out cloud sync action.
- Reference used: Claude/OpenAI signed-out account affordance pattern.
- File changed: `apps/desktop/src/features/v3/Sidebar.tsx`
- Fix made: Footer now shows `Sign in` with `Cloud sync` in Local Mode, plus the bottom gear.
- Recheck screenshot path: `audit/desktop-ui-computer-use/settings-recheck-34-rebuilt-home-refocused-20260604.png`
- Status: fixed

### Composer Control Overlap

- Screenshot path: `audit/desktop-ui-computer-use/settings-recheck-34-rebuilt-home-refocused-20260604.png`
- Screen/flow: Home composer
- What looked wrong: `Edit automatically`, `Temp`, shortcut text, model picker, mic, and send controls previously collided or drifted too far apart.
- Reference used: ChatGPT/Claude composer density and stable desktop control grouping.
- File changed: `packages/unified-chat/src/components/ChatInput.tsx`
- Fix made: Stabilized the composer control grid so the left controls, shortcut text, model picker, mic, and send button have separate layout lanes.
- Recheck screenshot path: `audit/desktop-ui-computer-use/settings-recheck-34-rebuilt-home-refocused-20260604.png`
- Status: fixed

### MCP & Skills Settings Crash

- Screenshot path: `audit/desktop-ui-computer-use/settings-recheck-36-rebuilt-mcp-skills-20260604.png`
- Screen/flow: Settings > MCP & Skills
- What looked wrong: Clicking MCP & Skills could trigger a Settings Panel Error due to unstable marketplace selectors and repeated loading.
- Reference used: Desktop settings modal should keep a stable left nav and scrollable right panel.
- File changed: `apps/desktop/src/features/skill-marketplace/SkillCategoryFilter.tsx`, `apps/desktop/src/features/skill-marketplace/SkillMarketplace.tsx`, `apps/desktop/src/stores/skillMarketplaceStore.ts`, `apps/desktop/src/lib/tauri-mock.ts`
- Fix made: Added shallow Zustand selectors, added a `hasLoaded` guard, and mocked skill IPC responses for render tests.
- Recheck screenshot path: `audit/desktop-ui-computer-use/settings-recheck-36-rebuilt-mcp-skills-20260604.png`
- Status: fixed

### MCP & Skills Top Cards

- Screenshot path: `audit/desktop-ui-computer-use/settings-recheck-36-rebuilt-mcp-skills-20260604.png`
- Screen/flow: Settings > MCP & Skills
- What looked wrong: Top cards could read like dead summary blocks.
- Reference used: Settings summary cards should act as navigation or clear actions.
- File changed: `apps/desktop/src/features/settings/tabs/McpSkills/index.tsx`
- Fix made: Made Skills & Plugins, MCP Tools, Research Defaults, and Integrations cards navigate to their sections or Apps & Integrations.
- Recheck screenshot path: `audit/desktop-ui-computer-use/settings-recheck-36-rebuilt-mcp-skills-20260604.png`
- Status: fixed

### Skill Marketplace Search

- Screenshot path: `audit/desktop-ui-computer-use/settings-recheck-31-skill-marketplace-search-web-20260604.png`
- Screen/flow: Settings > MCP & Skills > Skill Marketplace
- What looked wrong: Typing `web` filtered results, but the input visually reverted to the placeholder, making the search look broken.
- Reference used: Standard settings search fields should keep typed text visible while filtering.
- File changed: `apps/desktop/src/features/skill-marketplace/SkillSearchBar.tsx`
- Fix made: Preserved pending local input during debounce, synchronized with store query only after commit, and added a focused regression test.
- Recheck screenshot path: `audit/desktop-ui-computer-use/settings-recheck-37-rebuilt-skill-search-web-fixed-20260604.png`
- Status: fixed

### Local Account And Privacy Settings

- Screenshot path: `audit/desktop-ui-computer-use/settings-recheck-14-account-20260604.png`
- Screen/flow: Settings > Account and Settings > Privacy
- What looked wrong: Local Mode could expose cloud account deletion, subscription/logout language, or unclear privacy affordances.
- Reference used: Local Mode privacy boundary must not imply a cloud account exists.
- File changed: `apps/desktop/src/features/settings/tabs/Account/index.tsx`, `apps/desktop/src/features/settings/tabs/Privacy/index.tsx`, `apps/desktop/src/features/settings/Privacy/DataSection.tsx`
- Fix made: Local Mode account surfaces show sign-in/cloud sync actions only; Privacy hides cloud account deletion unless a real cloud account exists.
- Recheck screenshot path: `audit/desktop-ui-computer-use/settings-recheck-16-privacy-20260604.png`
- Status: fixed

### Settings Directory Ownership

- Screenshot path: `/Users/siddhartha/Desktop/claude modal free account/Screenshot 2026-06-03 at 9.12.09 PM.png`
- Screen/flow: Settings > Directory
- What looked wrong: Skills, connectors, and plugins were split across Settings/MCP/Customize-style surfaces instead of one familiar directory surface.
- Reference used: Claude free-account Directory modal with left rail sections for Skills, Connectors, and Plugins.
- File changed: `apps/desktop/src/features/settings/CustomizationDirectoryPanel.tsx`, `apps/desktop/src/features/settings/tabs/Connectors/index.tsx`, `apps/desktop/src/features/settings/SettingsPanel.tsx`, `apps/desktop/src/features/settings/tabs/McpSkills/index.tsx`
- Fix made: Added an inline Settings Directory panel with separate Skills, Connectors, and Plugins sections; renamed the Settings nav item to `Directory`; removed the `Customize` Settings group label; moved marketplace browsing out of MCP configuration to avoid duplicated surfaces.
- Recheck screenshot path: pending rebuilt app screenshot
- Status: fixed in code, pending manual recheck

### Settings Mock Routing Data

- Screenshot path: `/var/folders/9_/_g0m61810s75b_9vrd6hg_6r0000gn/T/TemporaryItems/NSIRD_screencaptureui_iQ3pU8/Screenshot 2026-06-04 at 10.13.32 AM.png`
- Screen/flow: Settings > Models & Keys
- What looked wrong: Models & Keys showed placeholder task-routing rows and a favorite-model placeholder that looked like real routing configuration.
- Reference used: Local/BYOK/Cloud trust-boundary requirements; model routing must not be presented without real backend state.
- File changed: `apps/desktop/src/features/settings/tabs/ModelsKeys/index.tsx`, deleted `apps/desktop/src/features/settings/FavoriteModelsSelector.tsx`, deleted `apps/desktop/src/features/settings/TaskRoutingSettings.tsx`
- Fix made: Removed dormant favorite-model and task-routing placeholders from Settings. Models & Keys now shows BYOK key storage/testing, Ollama detection, custom models, settings export, and behavior toggles only.
- Recheck screenshot path: pending rebuilt app screenshot
- Status: fixed in code, pending manual recheck

### Connector Directory Mock Catalog

- Screenshot path: `/Users/siddhartha/Desktop/claude modal free account/Screenshot 2026-06-03 at 9.10.48 PM.png`
- Screen/flow: Settings > Directory > Connectors
- What looked wrong: The connector grid mixed supported connectors with coming-soon roadmap entries and Claude-specific copy, making mock catalog items look live.
- Reference used: Claude Directory connector browse/detail pattern; live cards should represent available actions only.
- File changed: `apps/desktop/src/features/connectors/connectorDefinitions.ts`, `apps/desktop/src/features/connectors/ConnectorGallery.tsx`, `apps/desktop/src/features/connectors/__tests__/connectorDefinitions.test.ts`
- Fix made: Added `CONNECTOR_DIRECTORY` for supported entries only, made Featured derive from it, filtered categories from visible entries, removed Claude-branded descriptions from visible connectors, and added regression tests.
- Recheck screenshot path: pending rebuilt app screenshot
- Status: fixed in code, pending manual recheck

### Connector Detail Fake Tool Stubs

- Screenshot path: `/Users/siddhartha/Desktop/claude modal free account/Screenshot 2026-06-03 at 9.09.44 PM.png`
- Screen/flow: Connector detail / permissions
- What looked wrong: Connector detail generated fake read/search/create/update/delete tool rows when no live MCP schema existed.
- Reference used: Claude connector detail only shows actual tools and permissions.
- File changed: `apps/desktop/src/features/connectors/ConnectorDetailView.tsx`
- Fix made: Removed synthetic default tools. Missing schemas now show a clear unavailable state and direct users to refresh MCP Tools.
- Recheck screenshot path: pending rebuilt app screenshot
- Status: fixed in code, pending manual recheck

### Connector Connected State Honesty

- Screenshot path: code audit
- Screen/flow: OAuth connector completion
- What looked wrong: OAuth completion could mark a connector connected even when the MCP provider was not active.
- Reference used: Demo rule against fake saved/connected states and swallowed errors.
- File changed: `apps/desktop/src/stores/connectorsStore.ts`, `apps/desktop/src/stores/settings/connectors.ts`, `apps/desktop/src/stores/__tests__/connectorsStore.test.ts`
- Fix made: OAuth completion now requires the provider to appear in the connected-provider list; otherwise it records an explicit connector error instead of a fake connected state.
- Recheck screenshot path: pending rebuilt app screenshot
- Status: fixed in code, pending manual recheck

### Settings Tools Reality Cleanup

- Screenshot path: `audit/desktop-ui-computer-use/settings-tools-reality-20260604-settled.png`
- Screen/flow: Settings modal nav and Tools section
- What looked wrong: Settings still exposed unproven `Capabilities`, a combined `MCP & Skills` surface, and agent controls that read like mock feature toggles rather than real end-to-end behavior.
- Reference used: `/Users/siddhartha/Desktop/claude modal free account/Screenshot 2026-06-03 at 9.12.09 PM.png`, `/Users/siddhartha/Desktop/claude_reference/src`
- File changed: `apps/desktop/src/features/settings/SettingsPanel.tsx`, `apps/desktop/src/features/settings/AgentsSettings.tsx`, `apps/desktop/src/features/settings/tabs/Agents/index.tsx`, `apps/desktop/src/stores/settings/dialog.ts`
- Fix made: Removed visible `Capabilities`, `MCP & Skills`, and Directory-style combined tools from the active Settings path. Settings now shows separate `Skills`, `Connectors`, `Plugins`, `Agents`, and `Memory` entries.
- Recheck screenshot path: `audit/desktop-ui-computer-use/settings-tools-skills-20260604.png`, `audit/desktop-ui-computer-use/settings-tools-connectors-20260604.png`, `audit/desktop-ui-computer-use/settings-tools-plugins-20260604.png`, `audit/desktop-ui-computer-use/settings-tools-agents-20260604.png`, `audit/desktop-ui-computer-use/settings-tools-memory-20260604.png`
- Status: fixed

### Agents Capability Honesty

- Screenshot path: `audit/desktop-ui-computer-use/settings-tools-agents-20260604.png`
- Screen/flow: Settings > Agents
- What looked wrong: Agents exposed unproven Sub-agents, Agent Teams, and auto-injected-skill controls without a proven runtime enforcement path.
- Reference used: Demo rule that Settings should only show surfaces backed by real local storage, Tauri commands, or proven app behavior.
- File changed: `apps/desktop/src/features/settings/AgentsSettings.tsx`, `apps/desktop/src/features/settings/__tests__/AgentsSettings.test.tsx`, `apps/desktop/src/stores/__tests__/customAgentsStore.test.ts`
- Fix made: Removed the unproven team/sub-agent toggles, kept approval mode and execution preferences, and mounted real custom-agent CRUD backed by `list_custom_agents`, `save_custom_agent`, and `delete_custom_agent`.
- Recheck screenshot path: `audit/desktop-ui-computer-use/settings-tools-agents-20260604.png`; AX tree confirmed `Custom Agents` and `Create Agent` were present below the fold.
- Status: fixed

### Local Memory Surface

- Screenshot path: `audit/desktop-ui-computer-use/settings-tools-memory-20260604.png`
- Screen/flow: Settings > Memory
- What looked wrong: Memory needed to remain visible only if it was real local state, not another generic capability placeholder.
- Reference used: Local Mode privacy boundary and Settings honesty requirements.
- File changed: `packages/unified-chat/src/stores/__tests__/memoryStore.test.ts`, `apps/desktop/src/features/settings/__tests__/SettingsPanel.render.test.tsx`
- Fix made: Kept Memory as a local editor, added store tests for add/update/remove/clear persistence, and verified the rebuilt app shows on-device-only copy. Real-app text entry through AppleScript was not reliable in the WebView, so persistence was verified by store test and visible editor rendering.
- Recheck screenshot path: `audit/desktop-ui-computer-use/settings-tools-memory-20260604.png`
- Status: fixed

## Verification

- Focused desktop tests: passed
- Unified chat shell tests: passed
- Desktop typecheck: passed
- Desktop Vite build: passed
- Tauri build/sign/notarize/package: passed
- Manual rebuilt app screenshots: `settings-recheck-34` through `settings-recheck-37`
