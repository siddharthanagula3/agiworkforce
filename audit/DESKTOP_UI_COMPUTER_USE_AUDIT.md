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
- Reference used: Local-first privacy mode must not imply a cloud account exists.
- File changed: `apps/desktop/src/features/settings/tabs/Account/index.tsx`, `apps/desktop/src/features/settings/tabs/Privacy/index.tsx`, `apps/desktop/src/features/settings/Privacy/DataSection.tsx`
- Fix made: Local Mode account surfaces show sign-in/cloud sync actions only; Privacy hides cloud account deletion unless a real cloud account exists.
- Recheck screenshot path: `audit/desktop-ui-computer-use/settings-recheck-16-privacy-20260604.png`
- Status: fixed

## Verification

- Focused desktop tests: passed
- Unified chat shell tests: passed
- Desktop typecheck: passed
- Desktop Vite build: passed
- Tauri build/sign/notarize/package: passed
- Manual rebuilt app screenshots: `settings-recheck-34` through `settings-recheck-37`
