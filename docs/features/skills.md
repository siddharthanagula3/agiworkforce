# Sub-Feature: Skills & AI Employees

> Reusable, markdown-defined instruction sets that the AGI can discover, match, and inject into LLM prompts to specialize its behavior for specific tasks -- from code review to financial advising.

## Where It Lives

| Layer | Path(s) |
|-------|---------|
| Rust engine | `apps/desktop/src-tauri/src/core/skills/` (mod.rs, skill.rs, manager.rs, loader.rs, error.rs) |
| Rust AGI tool | `apps/desktop/src-tauri/src/core/agi/tools/skill_tool.rs` |
| Rust IPC commands | `apps/desktop/src-tauri/src/sys/commands/skills.rs` |
| Rust chat integration | `apps/desktop/src-tauri/src/sys/commands/chat/send_message.rs` (lines 475-567) |
| Rust state init | `apps/desktop/src-tauri/src/lib.rs` (line 540: `app.manage(SkillsState::default())`) |
| Frontend store | `apps/desktop/src/stores/skillMarketplaceStore.ts` |
| Frontend settings store | `apps/desktop/src/stores/chatPreferencesStore.ts` (`autoInjectSkills` field) |
| Marketplace UI | `apps/desktop/src/components/SkillMarketplace/` (4 files) |
| Mention picker | `apps/desktop/src/components/UnifiedAgenticChat/SkillMentionPicker.tsx` |
| Settings panel | `apps/desktop/src/components/Settings/SkillsPluginsSettings.tsx` |
| Settings toggle | `apps/desktop/src/components/Settings/AgentsSettings.tsx` (auto-inject toggle) |

## Architecture Overview

The Skills system has five layers that work together:

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (React/TS)                       │
│                                                             │
│  SkillMarketplace ─── SkillCard + CategoryFilter + Search   │
│  SkillMentionPicker ── @mention in chat input               │
│  SkillsPluginsSettings ── Settings > Tools panel            │
│  AgentsSettings ── auto-inject toggle                       │
│          │                                                  │
│  skillMarketplaceStore ─── invoke('skill_list')             │
│  chatPreferencesStore ──── autoInjectSkills flag             │
└──────────────────────────┬──────────────────────────────────┘
                           │ Tauri IPC
┌──────────────────────────┴──────────────────────────────────┐
│                   RUST COMMANDS (IPC)                        │
│                                                             │
│  skill_list, skill_get, skill_invoke, skill_reload          │
│  skill_match_for_message (auto-matching in commands)        │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────┐
│                   SKILL MANAGER                             │
│                                                             │
│  SkillManager ── owns HashMap<String, Skill>                │
│    ├── Bundled skills (hardcoded, 11 built-in)              │
│    ├── Managed skills (~/.agiworkforce/skills/)             │
│    └── Workspace skills (<workspace>/skills/)               │
│                                                             │
│  SkillLoader ── parses SKILL.md files (YAML frontmatter)    │
│  RequirementChecker ── bins, env vars, OS validation        │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────┐
│                CHAT PIPELINE INTEGRATION                     │
│                                                             │
│  send_message.rs ── auto-injects top 2 matching skills      │
│  as system messages into LLM conversation context           │
│  Emits "chat:skills-injected" event to frontend             │
│                                                             │
│  SkillTool ── LLM function-calling tool definitions         │
│  (use_skill, list_skills) for AGI runtime discovery         │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow: Skill Loading

1. **App startup** -- `lib.rs` creates `SkillsState::default()`, which calls `SkillManager::new()` + `initialize()`.
2. `initialize()` loads **bundled skills** (11 hardcoded in `manager.rs::create_bundled_skills()`), then scans **managed skills** from `~/.agiworkforce/skills/` via `SkillLoader::load_from_directory()`.
3. When a workspace is set via `skill_set_workspace`, the manager additionally loads **workspace skills** from `<workspace>/skills/`.
4. All skills are stored in `Arc<RwLock<HashMap<String, Skill>>>` keyed by name. Workspace skills shadow managed; managed shadow bundled.

### Data Flow: Skill Injection into Chat

1. User sends a message via `send_message` command.
2. If `autoInjectSkills` is true (default), the chat handler tokenizes the user message, computes Jaccard similarity against every skill's `name + description`, boosts by 0.3 if the skill name appears as a substring.
3. Skills scoring above 0.15 are sorted descending; the **top 2** are injected as system messages into the LLM conversation with format: `## Auto-Injected Skill: <name> (relevance: <score>)\n\n<full context string>`.
4. A `chat:skills-injected` event is emitted to the frontend with the conversation ID and injected skill names.

### Data Flow: Slash Command Invocation

1. User types `/explain-code src/main.rs` in the chat input.
2. `skill_parse_slash_command` IPC command parses the input, looks up the skill, substitutes `$ARGUMENTS` with `src/main.rs`, checks requirements, and returns `SkillInvocationResult`.
3. The result includes the full instructions, allowed tools, and context mode (main or fork).

## Skill Definition Format

Skills are defined as `SKILL.md` files with YAML frontmatter:

```markdown
---
name: skill-name
description: What the skill does
allowed-tools:
  - Read
  - Grep
  - Glob
context: fork
metadata:
  agiworkforce:
    requires:
      bins: ["git", "docker"]
      env: ["API_KEY"]
    os: ["darwin", "linux", "windows"]
---

# Skill Instructions

Markdown instructions for the AGI...
Use $ARGUMENTS to reference user-provided arguments.
Use $ARG_NAME for named argument substitution.
```

### Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Unique identifier, used as slash command name |
| `description` | string | Yes | Human-readable description |
| `allowed-tools` | string[] | No | Tools the skill can use (empty = all allowed) |
| `context` | `"main"` or `"fork"` | No | `main` = primary context (default), `fork` = isolated subagent |
| `metadata.agiworkforce.requires.bins` | string[] | No | Required binaries in PATH |
| `metadata.agiworkforce.requires.env` | string[] | No | Required environment variables |
| `metadata.agiworkforce.os` | string[] | No | Supported OSes (empty = all) |

### Rust Struct: `Skill`

```rust
pub struct Skill {
    pub name: String,
    pub description: String,
    pub instructions: String,        // Markdown body after frontmatter
    pub requires_bins: Vec<String>,
    pub requires_env: Vec<String>,
    pub supported_os: Vec<String>,
    pub source: SkillSource,          // Bundled | Managed { path } | Workspace { path }
    pub allowed_tools: Vec<String>,
    pub context_mode: SkillContextMode, // Main | Fork
}
```

### Context Modes

- **Main**: Instructions are injected into the primary AGI conversation context. The LLM processes them alongside the user message.
- **Fork**: Instructions are intended for a subagent with isolated context. The skill runs separately from the main conversation.

### Argument Substitution

- `$ARGUMENTS` -- replaced with the full argument string from slash command invocation.
- `$ARG_NAME` -- named argument substitution via `substitute_named_arguments()`.

## Skill Sources (3 tiers)

| Source | Location | Priority | Loaded When |
|--------|----------|----------|-------------|
| **Bundled** | Hardcoded in `manager.rs::create_bundled_skills()` | Lowest (shadowed by managed/workspace) | App startup |
| **Managed** | `~/.agiworkforce/skills/<skill-name>/SKILL.md` | Medium | App startup |
| **Workspace** | `<workspace>/skills/<skill-name>/SKILL.md` | Highest (shadows all) | `set_workspace()` called |

The loader (`SkillLoader`) uses `walkdir` to recursively find `SKILL.md` files (case-insensitive matching). Invalid files are logged and skipped.

## Bundled Skills (11 built-in)

| Name | Description | Context Mode | Allowed Tools |
|------|-------------|-------------|---------------|
| `file-operations` | Read, write, and manipulate files | Main | All |
| `shell-commands` | Execute shell commands and scripts | Main | All |
| `web-search` | Search the web for information | Main | All |
| `explain-code` | Explains code with diagrams and analogies | Fork | Read, Grep, Glob |
| `create-document` | Create professional documents (Word, PDF, Excel) | Main | document_create_word, document_create_pdf, document_create_excel, file_write |
| `code-review` | Perform thorough code review | Fork | Read, Grep, Glob |
| `debug-error` | Debug errors with systematic analysis | Fork | Read, Grep, Glob, terminal_execute |
| `git-workflow` | Manage Git repositories | Main | git_status, git_add, git_commit, git_push, git_pull, terminal_execute |
| `research-topic` | Research using web search and documentation | Fork | search_web, browser_navigate, browser_extract |
| `refactor-code` | Refactor code for improved quality | Main | Read, file_write, Grep, Glob |
| `write-tests` | Write comprehensive tests for code | Main | Read, file_write, Grep, Glob |

## Categories (9 + "all")

Categories are **inferred client-side** in `skillMarketplaceStore.ts` using keyword matching against `skill.name + skill.description`. There is no category field in the SKILL.md format.

| Category | Keywords (partial list) | Icon |
|----------|----------------------|------|
| `healthcare` | health, medical, clinical, patient, nurse, doctor, pharma, diagnosis, therapy | Heart |
| `legal` | legal, law, contract, compliance, attorney, regulation, litigation | Scale |
| `finance` | finance, financial, accounting, tax, investment, budget, banking, trading | Briefcase |
| `education` | education, learning, teaching, curriculum, student, academic, training | BookOpen |
| `creative` | creative, writing, design, art, music, video, content, brand, marketing | Palette |
| `trades` | trade, construction, plumbing, electrical, hvac, carpentry, engineering | Wrench |
| `e-commerce` | ecommerce, shop, product, inventory, order, customer, retail, sales | ShoppingBag |
| `technology` | code, software, developer, git, database, api, cloud, devops, security | Code2 |
| `productivity` | productivity, workflow, task, project, management, schedule, report, research | Layers |

**Fallback**: If no category keywords match, the skill is assigned to `productivity`.

The display order in the category filter tabs is: All, Technology, Productivity, Creative, Finance, Healthcare, Education, Legal, E-Commerce, Trades.

## Skill Marketplace UI

### Component Tree

```
SkillMarketplace (root panel)
├── SkillSearchBar (debounced 300ms search input)
├── SkillCategoryFilter (horizontal tab-strip with count badges)
├── LoadingGrid (12 skeleton cards during loading)
├── EmptyState (when no skills match filters)
└── SkillCard[] (one per filtered skill)
    ├── SkillGridCard (3-column responsive grid)
    │   └── SkillDetails (expanded: allowed tools, bins, env, context, OS)
    └── SkillListRow (single-column list layout)
        └── SkillDetails (same expanded view)
```

### Features

- **Grid/List toggle**: Users can switch between 3-column grid and single-column list.
- **Category filter**: Horizontal pill tabs with per-category counts.
- **Search**: Debounced 300ms text search filtering by name and description.
- **Expandable cards**: Click to expand and see allowed tools, required binaries, env vars, context mode, OS support.
- **Active/Inactive toggle**: Per-skill switch with toast notification. Toggling is client-side only (state in `skillMarketplaceStore.skills[].isActive`). The toggle does not currently persist or affect auto-injection behavior.
- **Reload**: Calls `skill_reload` IPC command to re-scan disk, then re-fetches the list.
- **Source badge**: Shows "Built-in", "Managed", or "Workspace" per skill.

### Entry Point

The `SkillMarketplace` panel is **not** rendered in the Settings panel. Instead, the Settings panel renders `SkillsPluginsSettings` under the "Tools" tab, which shows installed Claude plugins and project-level `.claude/skills/` entries.

The `SkillMarketplace` component is a standalone panel intended for a dedicated route or sidebar section.

## @Mention Picker (Chat Input)

The `SkillMentionPicker` component appears in the chat input area when the user types `@` followed by text. It provides a dropdown with keyboard navigation (ArrowUp/Down, Enter, Escape).

### Skill List

The mention picker uses a **static list** of 31 "AI employee" roles hardcoded in `SkillMentionPicker.tsx`. These are distinct from the Rust-backed skills -- they represent persona/role archetypes. Examples:

| ID | Name | Category |
|----|------|----------|
| `senior-software-engineer` | Software Engineer | Technical |
| `frontend-engineer` | Frontend Engineer | Technical |
| `photographer` | Photographer | Creative |
| `expert-tutor` | Expert Tutor | Education |
| `financial-advisor` | Financial Advisor | Finance |
| `health-advisor` | Health Advisor | Healthcare |
| `ai-lawyer` | AI Lawyer | Legal |
| `travel-advisor` | Travel Advisor | Lifestyle |
| `career-counselor` | Career Counselor | Lifestyle |

The picker shows up to 8 results, filtered by query against name, ID, and category.

### Selection Behavior

When a skill is selected, the `@<query>` text in the input is replaced with `@<skill-id> ` (with trailing space). The `@mention` is embedded in the message content sent to the backend.

## Skills & Plugins Settings Panel

`SkillsPluginsSettings` (rendered in Settings > Tools) provides a different view focused on the Claude plugin ecosystem and project-level resources:

- **Plugin Lifecycle**: Install/update/remove plugins via Claude CLI commands.
- **Installed Plugins**: Shows plugins from `~/.claude/plugins/installed_plugins.json` with scope (user/project), version, skills, and agents.
- **Project Resources**: Lists entries from `.claude/commands/`, `.claude/skills/`, and `.claude/agents/` directories.

This is separate from the `SkillMarketplace` component, which shows the Rust-backed skill engine's skills.

## Rust IPC Commands

| Command | Params | Returns | Description |
|---------|--------|---------|-------------|
| `skill_list` | none | `SkillInfo[]` | Lists all skills from all sources |
| `skill_get` | `name: String` | `Option<SkillInfo>` | Gets a single skill by name |
| `skill_get_instructions` | `name: String` | `Option<String>` | Gets raw instructions for a skill |
| `skill_invoke` | `name: String, arguments: String` | `Result<SkillInvocationResult, String>` | Invokes a skill with argument substitution |
| `skill_reload` | none | `()` | Reloads all skills from disk |
| `skill_parse_slash_command` | `input: String` | `Option<Result<SkillInvocationResult>>` | Parses `/skill-name args` format |
| `skill_get_slash_commands` | none | `SlashCommand[]` | Lists available slash commands |
| `skill_check_requirements` | `name: String` | `Option<RequirementCheckResult>` | Checks if a skill's requirements are met |
| `skill_get_context` | none | `String` | Generates full skill context for AGI prompts |
| `skill_set_workspace` | `path: Option<String>` | `()` | Sets workspace path for workspace-local skills |
| `skill_count` | none | `usize` | Returns total number of loaded skills |
| `skill_match_for_message` | `content: String` | `SkillMatchResult[]` | Matches skills against a user message (top 3) |

**Registered in lib.rs** (lines 1584-1587): Only `skill_list`, `skill_get`, `skill_invoke`, and `skill_reload` are registered as Tauri commands. The other functions exist in the `skills.rs` commands file but are not wired into the Tauri invoke handler.

### IPC Response Types

```typescript
// SkillInfo (from skill_list / skill_get)
interface SkillInfo {
  name: string;
  description: string;
  sourceType: string;       // "bundled" | "managed" | "workspace"
  requiresBins: string[];
  requiresEnv: string[];
  supportedOs: string[];
  allowedTools: string[];
  contextMode: string;      // "main" | "fork"
}

// SkillInvocationResult (from skill_invoke / skill_parse_slash_command)
interface SkillInvocationResult {
  skillName: string;
  instructions: string;     // With $ARGUMENTS substituted
  allowedTools: string[];
  contextMode: string;
}

// SlashCommand (from skill_get_slash_commands)
interface SlashCommand {
  name: string;
  description: string;
  hasArguments: boolean;
}

// SkillMatchResult (from skill_match_for_message)
interface SkillMatchResult {
  skillName: string;
  description: string;
  relevanceScore: number;
  matchReason: string;
}
```

## Store Schema

### `skillMarketplaceStore`

```typescript
interface SkillMarketplaceState {
  skills: MarketplaceSkill[];       // All skills with derived category + isActive
  isLoading: boolean;
  error: string | null;
  selectedCategory: SkillCategory;  // 'all' | 'healthcare' | ... | 'productivity'
  searchQuery: string;
  viewMode: ViewMode;               // 'grid' | 'list'
  expandedSkillName: string | null; // Currently expanded skill card

  // Actions
  fetchSkills: () => Promise<void>;     // invoke('skill_list') -> infer categories
  reloadSkills: () => Promise<void>;    // invoke('skill_reload') + re-fetch
  setCategory: (category) => void;
  setSearchQuery: (query) => void;
  setViewMode: (mode) => void;
  setExpandedSkill: (name | null) => void;
  toggleSkillActive: (name) => void;    // Client-side only toggle
}

// MarketplaceSkill extends SkillInfo with:
interface MarketplaceSkill extends SkillInfo {
  category: SkillCategory;  // Inferred from name + description keywords
  isActive: boolean;         // Client-side toggle (default false)
}
```

### Selectors

- `selectFilteredSkills(state)` -- returns skills filtered by `selectedCategory` and `searchQuery`.
- `selectCategoryCounts(state)` -- returns `Record<SkillCategory, number>` for category tab badges.

### `chatPreferencesStore`

```typescript
interface ChatPreferences {
  autoInjectSkills?: boolean;  // Default: true
  // ... other chat preferences
}
```

The `autoInjectSkills` preference is passed via `useSendMessage.ts` as `autoInjectSkills` in the chat request payload.

## SkillTool (AGI Runtime)

The `SkillTool` in `core/agi/tools/skill_tool.rs` provides LLM function-calling tool definitions so the AGI can dynamically discover and use skills at runtime:

- **`use_skill`** tool: Takes `skill_name` and optional `context`, returns skill instructions if requirements are met.
- **`list_skills`** tool: Lists all available skills with their descriptions.

These are JSON schema tool definitions compatible with OpenAI/Anthropic function calling interfaces. They are exported from `core/agi/tools/mod.rs` as `create_skill_use_tool()` and `create_list_skills_tool()`.

## Skill Matching Algorithm

Used in both `skill_match_for_message` (IPC command) and `send_message` (auto-injection):

1. **Tokenize** the user message: lowercase, split on whitespace/punctuation, filter stopwords (72 common English words), remove tokens with length <= 1. **Note:** The `send_message.rs` auto-injection code does NOT filter stopwords -- it only filters by token length > 1. This means the two matchers (`skill_match_for_message` in `skills.rs` vs the inline matcher in `send_message.rs`) produce different token sets for the same input.
2. **For each skill**: tokenize `name + description` the same way.
3. **Jaccard similarity**: `|intersection| / |union|` between message tokens and skill tokens.
4. **Boost**: Add 0.3 if the skill name appears as a substring in the message.
5. **Threshold**: Filter out scores <= 0.15.
6. **Ranking**: Sort descending by score.
7. **Limits**: Auto-injection truncates to top 2; the IPC command truncates to top 3.

## Key Patterns

### Skill Selection

Three mechanisms for selecting skills:

1. **Auto-injection** (default on): Jaccard similarity matching at message send time. Up to 2 skills injected as system messages. Controlled by `autoInjectSkills` preference.
2. **Slash commands**: User types `/skill-name [args]` in chat input. Parsed by `skill_parse_slash_command`.
3. **@mention**: User types `@persona-name` to reference AI employee roles from the static picker list.

### Prompt Injection

Skills are injected into the LLM context as system messages with this format:

```
## Auto-Injected Skill: <name> (relevance: <score>)

## Skill: <name>

**Description:** <description>

**Required binaries:** <if any>

**Required environment variables:** <if any>

**Allowed tools:** <if any>

**Execution mode:** Fork (runs in isolated subagent) <if fork>

### Instructions

<full markdown instructions>
```

### Custom Skill Creation

Users can create custom skills by placing `SKILL.md` files in:

- **User-wide**: `~/.agiworkforce/skills/<skill-name>/SKILL.md`
- **Per-project**: `<workspace>/skills/<skill-name>/SKILL.md`

The loader detects files named `SKILL.md` (case-insensitive) in any subdirectory. Skills are picked up on `skill_reload` or app restart.

### Requirement Checking

Before a skill is considered "available", the `SkillLoader::check_requirements()` validates:

1. **OS support**: Current OS matches `supported_os` list (empty = all).
2. **Binary availability**: Each entry in `requires_bins` is found via `which()`.
3. **Environment variables**: Each entry in `requires_env` is set.

Results are cached in `SkillManager::requirement_cache` and invalidated on skill reload or workspace change.

## Tauri Events (Rust to Frontend)

| Event | Payload | Description |
|-------|---------|-------------|
| `chat:skills-injected` | `{ conversation_id: string, skills: string[] }` | Emitted when skills are auto-injected into a chat message |

Note: The frontend does not currently listen for this event. The event emission exists in `send_message.rs` but no listener was found in the frontend code.

## Known Issues / Tech Debt

1. **`.agi/employees/` directory location mismatch**: CLAUDE.md references "140 AI skills in `.agi/employees/`" at the repo root, but the directory actually lives at `apps/web/.agi/employees/` (140 .md files). These are web-side persona definitions, not connected to the Rust-backed `SkillManager` which loads skills from `~/.agiworkforce/skills/` and `<workspace>/skills/` at runtime. The desktop app's bundled skills (11 in `manager.rs`) are separate from these 140 web-side employee files.

2. **Unregistered IPC commands**: Only 4 of 11 skill IPC commands are registered in `lib.rs` (`skill_list`, `skill_get`, `skill_invoke`, `skill_reload`). The following are defined in `skills.rs` but not wired: `skill_match_for_message`, `skill_check_requirements`, `skill_get_context`, `skill_set_workspace`, `skill_count`, `skill_get_instructions`, `skill_parse_slash_command`, `skill_get_slash_commands`.

3. **Active toggle is ephemeral**: The `isActive` toggle on skill cards in the marketplace is client-side only (stored in Zustand, not persisted). Toggling a skill active/inactive does not affect auto-injection or any backend behavior.

4. **Two separate skill systems**: The `SkillMentionPicker` uses a hardcoded static list of 31 "AI employee" roles that is entirely disconnected from the Rust-backed `SkillManager`. These two systems should be unified.

5. **No frontend listener for `chat:skills-injected`**: The backend emits this event but no frontend component subscribes to it, so users have no visibility into which skills were auto-injected.

6. **Category inference is fragile**: Categories are inferred client-side via keyword matching rather than being a first-class field in the skill definition format. This can miscategorize skills.

7. **`SkillsPluginsSettings` vs `SkillMarketplace`**: Two separate UI components exist for skill discovery. `SkillsPluginsSettings` focuses on Claude CLI plugins and `.claude/` project resources; `SkillMarketplace` focuses on the Rust skill engine. These could be consolidated.

8. **Duplicate matching algorithm**: The Jaccard similarity matching code is duplicated between `skills.rs::skill_match_for_message` and `send_message.rs` auto-injection, and the two copies are not equivalent -- `skills.rs` filters 72 stopwords while `send_message.rs` does not filter any. Should be extracted into a shared function.

9. **No skill persistence**: There is no database table for user skill preferences (enabled/disabled, custom ordering, favorites). Everything is either hardcoded or ephemeral.

10. **Workspace skill loading not triggered automatically**: `skill_set_workspace` must be called explicitly. There is no automatic detection of workspace changes to reload workspace skills.
