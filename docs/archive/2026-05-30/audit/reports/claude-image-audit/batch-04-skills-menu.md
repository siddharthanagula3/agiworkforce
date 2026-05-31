# Batch 04 — Skills Menu and Slash Commands

Audit date: 2026-05-24
Reference surface: Claude Desktop (macOS)
Target surface: AGI Web (`apps/web`)

---

## IMG: 105_claude-max20x_skills-submenu_installed.png

- **Feature**: Skills submenu flyout from the "+" composer menu. Shows installed skills (algorithmic-art, brand-guidelines, canvas-design, doc-coauthoring, humanizer, internal-comms, mcp-builder, ...) with a checkmark on "Web search" and "Manage skills" / "Add skill" at the bottom.
- **Image path**: `/Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/105_claude-max20x_skills-submenu_installed.png`
- **Implementation status**: partial
- **Primary files**:
  - `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` (overflow menu)
  - `apps/web/features/chat/components/SkillsMenu.tsx` (standalone, unused)
  - `apps/web/app/skills/page.tsx` (full-page browse)
  - `apps/web/app/api/skills/route.ts`
- **API endpoints**: `GET /api/skills`, `GET /api/skills/[name]`
- **Data flow**:
  - Claude: user clicks "+" -> "Skills" submenu -> flyout lists installed skills inline -> clicking one injects it into the conversation context.
  - AGI Web: user clicks "+" -> overflow menu -> "Skills" section shows a single "Browse Skills" link -> navigates away to `/skills` page.
  - `SkillsMenu.tsx` exists as a standalone component that fetches `/api/skills` but is **never imported or rendered anywhere** in the composer or overflow menu.
- **Flaws**:
  - **[critical]** SkillsMenu component is dead code — not integrated into the composer overflow menu or anywhere else. The `+` overflow menu (ChatComposerNew.tsx lines 764-778) only renders a link to `/skills`, never a skill picker flyout. Users cannot select a skill from the composer context menu at all. @ `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:764-778`
  - **[major]** No inline skill submenu flyout matching Claude's pattern. Claude shows the skill list as a nested submenu that pops out from the "Skills" row. AGI navigates away to a full-page route instead. @ `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:769`
  - **[major]** No "Manage skills" or "Add skill" options in the overflow menu. Claude has both at the bottom of the skills submenu. @ `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:764-778`
  - **[major]** No per-skill checkmark toggle state. Claude shows checkmarks on active skills (e.g., "Web search" checked). AGI has no concept of toggling individual skills on/off from the menu. @ `apps/web/features/chat/components/SkillsMenu.tsx`
  - **[minor]** `/api/skills` route requires `SKILLS_LAYERS` env var to return any skills. Without it, the API returns an empty array, so even if SkillsMenu were wired up it would show "No skills available" in most deployments. @ `apps/web/app/api/skills/route.ts:38-63`
- **Visual gaps**:
  - Claude shows skill items with simple text labels in a flat list. AGI's SkillsMenu (if it were shown) uses a different layout with expand/collapse body preview, which diverges from the reference.
  - No skill icons in the overflow menu or submenu.
  - No visual separator between installed skills and management actions.

---

## IMG: 004-cowork-skills-submenu-installed-skills.png

- **Feature**: Cowork tab — Skills submenu showing installed skills (algorithmic-art, brand-guidelines, canvas-design, context, doc-coauthoring, humanizer, internal-comms) with "Manage skills" and "Add skill" at the bottom.
- **Image path**: `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/004-cowork-skills-submenu-installed-skills.png`
- **Implementation status**: missing
- **Primary files**:
  - `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
- **API endpoints**: N/A
- **Data flow**:
  - Claude: "Skills" entry in the composer menu -> nested submenu with installed skills. Same pattern as image 1 but in the Cowork tab context.
  - AGI Web: No Cowork tab exists. The web app has Chat / Cowork / Code tabs visible in the sidebar (from the reference) but the Cowork and Code tabs are not implemented with skill menus.
- **Flaws**:
  - **[critical]** No Cowork tab implementation exists. The Skills submenu in a Cowork context is entirely absent. @ `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
  - **[major]** Same skill submenu flyout gap as image 1 — skills are not shown inline in any tab's composer menu.
- **Visual gaps**:
  - Claude's Cowork tab has its own greeting ("Let's knock some...") and task list. AGI web has no equivalent surface.
  - No "Connectors" or "Plugins" companion menu entries alongside Skills.

---

## IMG: 215_claude-desktop_slash-skills-menu.png

- **Feature**: Slash command dropdown showing skill entries (add-files, algorithmic-art, brand-guidelines, canvas-design, doc-coauthoring, humanizer, internal-comms, mcp-builder, skill-creator, theme-factory) alongside a table output in the main chat area.
- **Image path**: `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-15/215_claude-desktop_slash-skills-menu.png`
- **Implementation status**: partial
- **Primary files**:
  - `apps/web/features/chat/components/Composer/SlashCommandMenu.tsx`
  - `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` (slash detection logic, lines 373-379)
- **API endpoints**: N/A (slash commands are client-side)
- **Data flow**:
  - Claude: user types "/" -> dropdown shows all slash commands including installed skill names as commands. Skills appear mixed with built-in commands (add-files is a built-in, rest are skills).
  - AGI Web: user types "/" -> SlashCommandMenu shows 5 built-in commands (/search, /think, /image, /doc, /code) plus any custom commands from settingsStore. **Skills are never injected into the slash menu.**
  - SlashCommandMenu.tsx at line 16-22 hardcodes BUILT_IN_COMMANDS. It reads custom commands from `useSettingsStore` but never reads from the skills API or `ChatAIService.getAvailableSkills()`.
- **Flaws**:
  - **[critical]** Skills are not listed in the slash command menu. Claude shows skills as slash-invocable commands (e.g., `/brand-guidelines`). AGI's SlashCommandMenu only shows 5 hardcoded built-ins + user custom commands, never skill entries. @ `apps/web/features/chat/components/Composer/SlashCommandMenu.tsx:16-22`
  - **[major]** Slash command set mismatch. Claude's slash menu includes file-system operations (add-files) and skill-based commands. AGI has only generic tool toggles (/search, /think, /image, /doc, /code). The concepts are fundamentally different — Claude's slash commands invoke skills; AGI's toggle tool flags. @ `apps/web/features/chat/components/Composer/SlashCommandMenu.tsx:16-22`
  - **[major]** Two disconnected slash command systems exist: `useSlashCommands.ts` (hook with browser/terminal/code/database/undo/compact) and `SlashCommandMenu.tsx` (component with search/think/image/doc/code). Neither is aware of the other, and neither surfaces skills. @ `apps/web/hooks/useSlashCommands.ts:15` vs `apps/web/features/chat/components/Composer/SlashCommandMenu.tsx:16`
  - **[minor]** `useSlashCommandAutocomplete.ts` defines yet a third set of commands (/browser, /terminal, /code, /database, /undo) that overlaps partially with the other two but adds its own unique entries. Three divergent command registries. @ `apps/web/hooks/useSlashCommandAutocomplete.ts:21-52`
- **Visual gaps**:
  - Claude's slash menu uses a simple flat list with text labels and no icons for skill entries. AGI's menu has icons for each item.
  - Claude's menu also shows utility commands like "add-files" mixed in. AGI separates file attachment into a dedicated paperclip button.
  - No "Open file picker" equivalent in the slash menu.

---

## IMG: 216_claude-desktop_skill-selected-in-composer.png

- **Feature**: After selecting a skill from the slash menu, the skill name appears in the composer as a styled tag/token (e.g., "skill-creator" shown in teal text at the beginning of the input field). The table of filenames is displayed above in the chat.
- **Image path**: `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-15/216_claude-desktop_skill-selected-in-composer.png`
- **Implementation status**: partial
- **Primary files**:
  - `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` (lines 569-584 — selectedSkill badge)
- **API endpoints**: N/A
- **Data flow**:
  - Claude: selecting a skill from "/" menu inserts the skill name inline in the composer as an interactive token/tag. The user can then type a prompt after it.
  - AGI Web: selecting a skill via @mention sets `selectedSkill` state, which renders a badge above the composer (not inline). The badge shows skill name + category + dismiss button.
  - Slash command selection (handleSlashSelect at line 422) does not set selectedSkill — it only toggles tool flags (search, image, document). There is no path from slash selection to skill activation.
- **Flaws**:
  - **[critical]** No way to activate a skill via slash command. `handleSlashSelect` (line 422-435) maps command IDs to tool toggles, not skills. Only @mention triggers skill selection. Claude uses "/" as the primary skill invocation method. @ `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:422-435`
  - **[major]** Skill tag placement differs from Claude. Claude shows the skill name inline in the text input as a styled token. AGI renders a separate badge component above the composer. This is a cosmetic difference but changes the interaction model — the skill tag in Claude is part of the message flow; in AGI it is a separate UI element. @ `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:569-584`
  - **[minor]** The skill badge in AGI shows a Sparkles icon and category text. Claude's inline tag is plain teal text. The AGI approach is more decorated but less inline. @ `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:571-583`
- **Visual gaps**:
  - Claude's skill token is inline within the textarea at the cursor position. AGI's badge floats above the composer as a separate element.
  - No teal/accent-colored inline token rendering exists in AGI's composer.

---

## IMG: 217_claude-desktop_skill-composer-with-prompt.png

- **Feature**: Skill selected ("skill-creator") shown as teal inline token in the composer, followed by user-typed prompt text ("Explain in one short paragraph what this skill is for. Do not create or edit files."). The combined skill + prompt is ready to send.
- **Image path**: `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-15/217_claude-desktop_skill-composer-with-prompt.png`
- **Implementation status**: partial
- **Primary files**:
  - `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
- **API endpoints**: N/A
- **Data flow**:
  - Claude: skill token sits at the start of the input. User types free-form text after it. Both are sent together — the skill name acts as context/routing, the text is the user prompt.
  - AGI Web: @mention insertion (handleMentionSelect at line 407-419) inserts `@SkillName ` into the message text. The selectedSkill badge appears above. When sent, `skillId` is passed in the onSend callback (line 453). The message text includes the literal "@SkillName" prefix.
  - The skill context is forwarded to the API as `metadata.skillId` in the request body (chat-ai-service.ts line 186-188).
- **Flaws**:
  - **[major]** @mention leaves literal "@SkillName" text in the message sent to the LLM. Claude strips the skill token from the visible message and routes it as metadata. AGI sends the raw "@BackendEngineer prompt..." text to the LLM, polluting the user message. @ `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:413`
  - **[major]** Skill context injection is metadata-only — `metadata.skillId` is set but the actual skill body/instructions are never loaded or prepended to the system prompt. The `/api/skills/[name]` body endpoint exists but is only called by the dead-code SkillsMenu expand feature, never during message send. @ `apps/web/features/chat/services/chat-ai-service.ts:186-188`
  - **[minor]** The @mention approach requires the user to know the skill name and type "@" to trigger it. Claude's "/" approach is more discoverable since it shows all available skills on a single keystroke. @ `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:382-393`
- **Visual gaps**:
  - Claude's composer shows the skill name in teal as a non-editable token, followed by normal-weight text. AGI shows a badge above and plain text with "@SkillName" literally in the textarea.
  - No visual distinction between the skill prefix and the user's prompt text in AGI's textarea.

---

## IMG: 218_claude-desktop_skill-used-response.png

- **Feature**: Claude's response after using a skill — the chat shows a table of captured screenshots/filenames with columns (#, Filename, Implied UI State). The response includes a "Key takeaways" section with bullet analysis and a "filesystem sub-sequence" observation. This demonstrates skill execution output formatting.
- **Image path**: `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-15/218_claude-desktop_skill-used-response.png`
- **Implementation status**: partial
- **Primary files**:
  - `apps/web/features/chat/services/chat-ai-service.ts` (sendMessage, lines 134-200)
  - `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` (handleSubmit, lines 445-481)
- **API endpoints**: `POST /api/llm/v1/chat/completions`
- **Data flow**:
  - Claude: skill invocation enriches the system prompt with the skill's instructions. The model responds with skill-informed output (here, a structured analysis with tables and takeaways).
  - AGI Web: `ChatAIService.sendMessage` passes `skillId` in `metadata` of the request body (line 186-188). The backend route at `/api/llm/v1/chat/completions` receives the skillId but the actual injection of skill context into the prompt is **not verified** — the skill body is not fetched or prepended client-side.
  - Response rendering uses standard markdown/chat bubble rendering. No special skill-response formatting exists.
- **Flaws**:
  - **[major]** Skill body content is never injected into the LLM request. The `sendMessage` method passes `skillId` as metadata but does not prepend the skill's markdown body to the system prompt or user message. The skill effectively has no effect on the LLM's behavior beyond the raw `metadata.skillId` field, which the LLM API likely ignores. @ `apps/web/features/chat/services/chat-ai-service.ts:172-188`
  - **[major]** No skill execution indicator or attribution in the response UI. Claude shows which skill was used. AGI has no visual indicator that a skill was active during generation. @ `apps/web/features/chat/services/chat-ai-service.ts`
  - **[minor]** Table rendering in chat responses is not audited here but the reference shows markdown tables rendering correctly. AGI's markdown renderer should handle this but there is no skill-specific formatting or block type. @ N/A
- **Visual gaps**:
  - No "Used skill: X" attribution header on skill-informed responses.
  - No pagination or frame reference indicators ("4 / 213") like Claude shows at the bottom of the response.
  - No special formatting treatment for skill outputs vs. normal responses.

---

## IMG: 211_claude-desktop_chat-filesystem-readonly-prompt-ready.png

- **Feature**: Chat window with a filesystem-tool prompt ready to send. The composer shows a long multi-line prompt with the send button active (orange arrow). The greeting says "Good evening, Siddhartha Nagula". The sidebar shows conversation history with "Recents" section.
- **Image path**: `/Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-15/211_claude-desktop_chat-filesystem-readonly-prompt-ready.png`
- **Implementation status**: partial
- **Primary files**:
  - `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
  - `apps/web/features/chat/components/Composer/SendButton.tsx`
  - `apps/web/features/chat/components/GreetingBanner/GreetingBanner.tsx`
  - `apps/web/features/chat/components/Sidebar/ChatSidebar.tsx`
- **API endpoints**: N/A
- **Data flow**:
  - Claude: empty chat state with greeting, sidebar with recent conversations, composer with a multi-line prompt, model selector showing "Opus 4.7 Adaptive", orange send button.
  - AGI Web: has all these elements in some form — greeting banner, sidebar, composer with auto-resize, model selector, send button.
  - This image is more about the overall chat chrome than skills specifically. It shows the context in which skills/slash commands operate.
- **Flaws**:
  - **[minor]** Model selector label format differs. Claude shows "Opus 4.7 · Adaptive" with a gear icon. AGI's ComposerFooter shows a model selector but the exact format depends on the ModelSelector component implementation. @ `apps/web/features/chat/components/Composer/ComposerFooter.tsx`
  - **[minor]** Claude's send button is a filled orange/terra-cotta circle with an arrow. AGI's SendButton uses similar coloring but the exact shape and icon may differ. @ `apps/web/features/chat/components/Composer/SendButton.tsx`
  - **[cosmetic]** Claude's sidebar shows "Recents" as a section label. AGI's ChatSidebar may use different section naming. @ `apps/web/features/chat/components/Sidebar/ChatSidebar.tsx`
- **Visual gaps**:
  - Claude's composer auto-expands to show the full multi-line prompt. AGI caps at 240px max height (line 302-304 of ChatComposerNew.tsx).
  - The greeting format ("Good evening, Siddhartha Nagula") should match time-of-day logic. AGI has `useGreeting.ts` which implements this.
  - No "Chat / Cowork / Code" tab bar visible in this image but Claude has them.

---

## Cross-Cutting Findings

### Architecture Issues

1. **Three divergent slash command registries**: `SlashCommandMenu.tsx` (search/think/image/doc/code), `useSlashCommands.ts` (browser/terminal/code/database/undo/compact), and `useSlashCommandAutocomplete.ts` (browser/terminal/code/database/undo). These should be unified into a single command registry.

2. **Two disconnected skill systems**: The `@agiworkforce/skills` package with its API routes (`/api/skills`) and `SkillsMenu.tsx` component is a file-system-based skill loader. The `ChatAIService.getAvailableSkills()` with `SkillInfo` and `intelligent-agent-router.ts` is a hardcoded role-based skill list. Neither system is connected to the slash command menu.

3. **Dead code**: `SkillsMenu.tsx` is exported but never imported by any other component. The `@agiworkforce/skills` API routes exist and function but have no consumer in the UI flow since SkillsMenu is unused.

4. **Skills page is static**: `/skills` page (apps/web/app/skills/page.tsx) contains 11 hardcoded PROMPTS and 44 hardcoded AGENTS with triggers like `/review`, `/debug`, etc. None of these triggers are wired into the actual slash command handling. The page is a static catalog with no interaction.

### Priority Remediation

| Priority | Issue | Effort |
|----------|-------|--------|
| P0 | Wire SkillsMenu into composer overflow menu as inline submenu | M |
| P0 | Add skills to slash command dropdown (merge with SlashCommandMenu) | M |
| P0 | Inject skill body into LLM system prompt on send | S |
| P1 | Unify three slash command registries into one | M |
| P1 | Add "Manage skills" and "Add skill" to overflow menu | S |
| P1 | Strip @SkillName from message text, pass as metadata only | S |
| P2 | Add inline skill token rendering in composer textarea | L |
| P2 | Add skill attribution to responses | S |
| P2 | Connect /skills page triggers to actual slash command handling | M |
| P3 | Add per-skill toggle checkmarks in menu | S |

### Summary Counts

- Images audited: 7
- Features present: 0
- Features partial: 6
- Features missing: 1
- Critical flaws: 4
- Major flaws: 10
- Minor flaws: 6
- Cosmetic flaws: 1
