# Sub-Feature: Custom Instructions & Templates

> User-defined system prompt additions at three scopes (global, per-conversation, per-project) plus an agent template marketplace with built-in workflow definitions, all merged and injected into the LLM context on every message send.

## Where It Lives

| Layer | Path(s) |
|-------|---------|
| Rust IPC (custom instructions) | `src-tauri/src/sys/commands/custom_instructions.rs` |
| Rust IPC (templates) | `src-tauri/src/sys/commands/templates.rs` |
| Rust data model (templates) | `src-tauri/src/core/agi/templates/template_manager.rs` |
| Rust built-in templates | `src-tauri/src/core/agi/templates/builtin_templates.rs` |
| Rust chat pipeline injection | `src-tauri/src/sys/commands/chat/send_message.rs` (line ~456) |
| Rust chat request type | `src-tauri/src/sys/commands/chat/types.rs` (`ChatSendMessageRequest.custom_instructions`) |
| Rust project model | `src-tauri/src/features/projects/manager.rs` (`Project.custom_instructions`) |
| Rust background agents | `src-tauri/src/core/agent/background_agent.rs` (`BackgroundAgentContext.custom_instructions`) |
| Rust privacy/export | `src-tauri/src/sys/commands/privacy.rs` (`PrivacyTable::CustomInstructions`) |
| Rust DB migrations | `src-tauri/src/data/db/migrations.rs` (v22: `process_templates`, v23: `agent_templates` + `template_installs` + FTS5) |
| TS store (instructions) | `src/stores/customInstructionsStore.ts` |
| TS store (per-conversation) | `src/stores/chat/chatStore.ts` (`setConversationCustomInstructions` / `getConversationCustomInstructions`) |
| TS store (unified facade) | `src/stores/unifiedChatStore.ts` (delegates to chatStore) |
| TS store (templates) | `src/stores/templateStore.ts` |
| TS store (project) | `src/stores/projectStore.ts` (`Project.customInstructions`) |
| TS service (templates) | `src/services/templateService.ts` |
| TS types (templates) | `src/types/templates.ts` |
| TS types (conversation) | `src/stores/chat/types.ts` (`ConversationSummary.customInstructions`) |
| Component: dialog | `src/components/CustomInstructions/CustomInstructionsDialog.tsx` |
| Component: settings page | `src/components/Settings/CustomInstructionsSettings.tsx` |
| Component: project settings | `src/components/UnifiedAgenticChat/ProjectSettingsDialog.tsx` |
| Component: template marketplace | `src/components/templates/TemplateMarketplace.tsx` |
| Component: template card | `src/components/templates/TemplateCard.tsx` |
| Component: template details | `src/components/templates/TemplateDetails.tsx` |
| Component: template installer | `src/components/templates/TemplateInstaller.tsx` |
| Hook: slash commands | `src/hooks/useSlashCommands.ts` |
| Hook: send message | `src/components/UnifiedAgenticChat/useSendMessage.ts` |
| App layout (dialog host) | `src/components/UnifiedAgenticChat/AppLayout.tsx` |

## Architecture Overview

Custom instructions and templates are two related but independent subsystems:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                             │
│                                                                     │
│  customInstructionsStore ──┐                                        │
│  chatStore (per-convo)  ───┤── getMergedInstructions() ─┐           │
│  projectStore (per-proj) ──┘                            │           │
│                                                         ▼           │
│  useSendMessage.ts ── builds mergedCustomInstructions ──┤           │
│                       + memory context                  │           │
│                       + file context                    │           │
│                       + slash command instructions      │           │
│                                                         ▼           │
│  invoke('chat_send_message', { customInstructions: ... })           │
│                                                                     │
│  templateStore ──► TemplateService ──► invoke('get_all_templates')  │
│                                       invoke('install_template')    │
│                                       invoke('execute_template')    │
└────────────────────────────────────┬────────────────────────────────┘
                                     │ IPC
┌────────────────────────────────────▼────────────────────────────────┐
│                        Rust Backend                                 │
│                                                                     │
│  ChatSendMessageRequest.custom_instructions: Option<String>         │
│       │                                                             │
│       ▼                                                             │
│  send_message.rs: appends as system message                         │
│  "## Additional User Instructions\n\n{custom_instructions}"        │
│                                                                     │
│  TemplateManager (SQLite) ──► agent_templates table                 │
│                           ──► template_installs table               │
│                           ──► agent_templates_fts (FTS5)            │
│                                                                     │
│  save_custom_instructions / load_custom_instructions                │
│       └── file: {app_data_dir}/custom_instructions.json             │
└─────────────────────────────────────────────────────────────────────┘
```

### Data flow for custom instructions

1. User edits instructions via `CustomInstructionsDialog` or `CustomInstructionsSettings`.
2. `customInstructionsStore.setGlobalInstructions()` saves to Zustand (localStorage) and calls `saveToBackend()`.
3. `saveToBackend()` invokes Rust `save_custom_instructions`, which writes JSON to `{app_data_dir}/custom_instructions.json`.
4. On app startup, `loadFromBackend()` reads the file back via `load_custom_instructions`.
5. At send time, `useSendMessage` calls `getMergedInstructions(conversationInstructions)` to produce a single merged string.
6. The merged string is passed as `customInstructions` in the IPC payload to `chat_send_message`.
7. Rust `send_message.rs` appends it as a system-role `ChatMessage` with the header `## Additional User Instructions`.

### Data flow for templates

1. On app startup, `TemplateManager::initialize_builtin_templates()` seeds 15 built-in agent templates into SQLite if not already present.
2. Frontend `TemplateMarketplace` calls `get_all_templates` via `TemplateService`.
3. User installs/uninstalls templates (writes to `template_installs` join table).
4. Execution: `execute_template` currently returns a serialized workflow definition (stub implementation -- does not yet orchestrate the workflow engine).

## Custom Instructions

### Three Priority Levels

Instructions merge with the following priority (highest first):

| Priority | Scope | Storage | Toggle |
|----------|-------|---------|--------|
| 1 (highest) | Project instructions | Loaded from `.claude/CLAUDE.md` or project files; stored in `projectStore` | `projectInstructionsEnabled` toggle |
| 2 | Conversation instructions | `chatStore` per-conversation (`ConversationSummary.customInstructions`) | Always active when set |
| 3 (lowest) | Global instructions | `customInstructionsStore` (localStorage + `custom_instructions.json` file) | `globalInstructionsEnabled` toggle |

### Merging Logic (`getMergedInstructions`)

The store's `getMergedInstructions(conversationInstructions?)` method produces a single XML-tagged block:

```xml
<custom-instructions>
The following are custom instructions provided by the user. Follow these instructions while responding:

<project-instructions>
...project-level text...
</project-instructions>

<conversation-instructions>
...per-conversation text...
</conversation-instructions>

<global-instructions>
...global text...
</global-instructions>
</custom-instructions>
```

Each section is only included when its toggle is enabled and the text is non-empty. The merged output is further prepended with:
- Memory context (from `memoryStore`, if `autoInject` is on)
- File context blocks (from attached files)
- Slash command instructions (from project `.claude/commands/` files)

### Rust-Side Injection

In `send_message.rs`, the merged string arrives as `request.custom_instructions: Option<String>`. If non-empty, it is appended as an additional system message:

```rust
llm_messages.push(ChatMessage {
    role: "system",
    content: format!("## Additional User Instructions\n\n{}", custom_instructions),
    ...
});
```

This means custom instructions appear after the main system prompt and any tool definitions, giving them supplementary (not overriding) positioning in the context window.

### Validation

`ChatSendMessageRequest` validates custom instructions via the `Validate` trait:
- Maximum length: `MAX_CUSTOM_INSTRUCTIONS_LENGTH = 50,000` characters (Rust-side enforcement)
- Frontend-side max: `maxInstructionsLength = 10,000` characters (store default)

### Per-Project Instructions (Rust)

The `Project` struct in `features/projects/manager.rs` has a `custom_instructions: Option<String>` field. The `ProjectSettings` struct also carries `custom_instructions: Option<String>`. These are stored in the `projects` SQLite table (`custom_instructions TEXT NOT NULL DEFAULT ''`).

### Background Agents

When a conversation is pushed to background (`background_agent_push`), the `BackgroundAgentContext` captures `custom_instructions: Option<String>` from the active session, preserving instruction context for autonomous execution.

### Privacy & Data Export

`privacy.rs` treats `custom_instructions` as a `PrivacyTable` variant. Data export queries `SELECT id, name, content, created_at FROM custom_instructions`. Users can delete their custom instructions per user ID.

## Prompt Templates (Agent Templates)

### Template Data Model

Defined in `core/agi/templates/template_manager.rs`:

```
AgentTemplate
├── id: String (primary key)
├── name: String
├── category: TemplateCategory (10 categories)
├── description: String
├── icon: String (emoji)
├── tools: Vec<String> (required tool IDs)
├── workflow: WorkflowDefinition
│   ├── steps: Vec<WorkflowStep>
│   │   ├── id, name, description
│   │   ├── tool_id: String
│   │   ├── parameters: HashMap<String, Value> (supports {{placeholder}} syntax)
│   │   ├── expected_output: String
│   │   ├── retry_on_failure: bool, max_retries: u32
│   │   └── timeout_seconds: u64
│   ├── parallel_execution: bool
│   └── failure_strategy: "stop" | "continue" | "retry"
├── default_prompts: HashMap<String, String> (keyed by role/purpose)
├── success_criteria: Vec<String>
├── estimated_duration_ms: u64
├── difficulty_level: DifficultyLevel (Easy | Medium | Hard)
├── install_count: i64
└── created_at: i64 (unix timestamp)
```

### 10 Template Categories

`Finance`, `CustomerService`, `Development`, `Marketing`, `HR`, `Operations`, `DataEntry`, `Research`, `Content`, `Deployment`

Each category has a display name, description, and emoji icon defined in `types/templates.ts::CATEGORY_INFO`.

### 15 Built-in Templates

Defined in `builtin_templates.rs::get_builtin_templates()`:

1. Accounts Payable Agent (Finance)
2. Customer Support Agent (CustomerService)
3. Data Entry Agent (DataEntry)
4. Email Management Agent (Operations)
5. Social Media Agent (Marketing)
6. Lead Qualification Agent (Marketing)
7. Code Review Agent (Development)
8. Testing Agent (Development)
9. Documentation Agent (Development)
10. Deployment Agent (Deployment)
11. Meeting Scheduler Agent (Operations)
12. Expense Report Agent (Finance)
13. Content Writer Agent (Content)
14. Job Application Agent (HR)
15. Research Agent (Research)

Each template includes a multi-step workflow with tool references, system/extraction/validation prompts, and success criteria.

### SQLite Storage (Migration v23)

```sql
agent_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    icon TEXT NOT NULL DEFAULT '',
    tools TEXT NOT NULL DEFAULT '[]',          -- JSON array
    workflow TEXT NOT NULL DEFAULT '{}',        -- JSON WorkflowDefinition
    default_prompts TEXT NOT NULL DEFAULT '{}', -- JSON map
    success_criteria TEXT NOT NULL DEFAULT '[]',-- JSON array
    estimated_duration_ms INTEGER NOT NULL DEFAULT 60000,
    difficulty_level TEXT NOT NULL DEFAULT 'medium',
    install_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
)

-- Indexes: category, install_count DESC, difficulty_level, name

agent_templates_fts USING fts5(template_id UNINDEXED, name, description)

template_installs (
    user_id TEXT NOT NULL,
    template_id TEXT NOT NULL,
    installed_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, template_id),
    FOREIGN KEY (template_id) REFERENCES agent_templates(id) ON DELETE CASCADE
)
```

### Slash Commands (Project Commands)

`useSlashCommands.ts` provides a separate mechanism for project-scoped prompt templates:

- Reads `.claude/commands/` directory from the active project folder
- Each file (`.md`, `.mdc`, `.txt`, `.yaml`) becomes a slash command named after its filename
- When invoked, the file content is injected as `customSlashInstructions` in the merged instructions
- 27 built-in slash commands (`/browser`, `/terminal`, `/code`, `/vision`, `/swarm`, etc.) are handled separately by dedicated handlers

## Rust Commands (IPC)

### Custom Instructions Commands

| Command | Params | Returns | Description |
|---------|--------|---------|-------------|
| `save_custom_instructions` | `instructions: String` | `()` | Write JSON to `{app_data_dir}/custom_instructions.json` |
| `load_custom_instructions` | (none) | `String` | Read JSON from file; returns empty string if not found |

Registered in `lib.rs` at lines 1247-1248.

### Template Commands

| Command | Params | Returns | Description |
|---------|--------|---------|-------------|
| `get_all_templates` | (none) | `Vec<AgentTemplate>` | All templates sorted by install_count DESC |
| `get_template_by_id` | `id: String` | `Option<AgentTemplate>` | Single template lookup |
| `get_templates_by_category` | `category: String` | `Vec<AgentTemplate>` | Filter by category string |
| `install_template` | `template_id: String` | `()` | Insert into `template_installs`, increment install_count |
| `uninstall_template` | `template_id: String` | `()` | Remove from `template_installs` |
| `get_installed_templates` | (none) | `Vec<AgentTemplate>` | User's installed templates (hardcoded `default_user`) |
| `search_templates` | `query: String` | `Vec<AgentTemplate>` | LIKE search on name and description |
| `execute_template` | `template_id: String, params: HashMap` | `String` | Stub: returns serialized workflow JSON |
| `get_template_categories` | (none) | `Vec<String>` | Returns 10 category strings |

Registered in `lib.rs` at lines 1745-1753. All template commands use `State<'_, TemplateManagerState>` which wraps `Arc<Mutex<TemplateManager>>`.

## Store Schemas

### customInstructionsStore

```typescript
interface CustomInstructionsState {
  globalInstructions: string;          // persisted (localStorage + file)
  projectInstructions: string;         // NOT persisted (loaded from project files)
  globalInstructionsEnabled: boolean;  // persisted
  projectInstructionsEnabled: boolean; // NOT persisted
  maxInstructionsLength: number;       // default 10,000

  // Actions
  setGlobalInstructions(instructions: string): void;   // trims to maxLength, auto-saves
  setProjectInstructions(instructions: string): void;
  setGlobalInstructionsEnabled(enabled: boolean): void; // auto-saves
  setProjectInstructionsEnabled(enabled: boolean): void;
  clearAllInstructions(): void;
  saveToBackend(): Promise<void>;      // invoke('save_custom_instructions')
  loadFromBackend(): Promise<void>;    // invoke('load_custom_instructions')
  getMergedInstructions(conversationInstructions?: string): string;
  getInstructionsCharCount(): { global: number; project: number; total: number };
}
```

Persist config:
- Storage name: `agiworkforce-custom-instructions`
- Version: 1
- Partialized: only `globalInstructions` and `globalInstructionsEnabled`
- Middleware stack: `devtools(persist(subscribeWithSelector(...)))`

### chatStore (per-conversation instructions)

```typescript
// On ConversationSummary:
customInstructions?: string;

// Actions:
setConversationCustomInstructions(id: string, instructions: string): void;
getConversationCustomInstructions(id?: string): string | undefined;
```

These are stored inline on the conversation object in Zustand and persisted via the chatStore's own persist middleware.

### templateStore

```typescript
interface TemplateStore {
  templates: AgentTemplate[];
  installedTemplates: AgentTemplate[];
  selectedTemplate: AgentTemplate | null;
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  selectedCategory: TemplateCategory | null;

  // Actions
  fetchTemplates(): Promise<void>;
  fetchInstalledTemplates(): Promise<void>;
  installTemplate(templateId: string): Promise<void>;
  uninstallTemplate(templateId: string): Promise<void>;
  searchTemplates(query: string): Promise<void>;
  filterByCategory(category: TemplateCategory | null): void;
  selectTemplate(template: AgentTemplate | null): void;
  executeTemplate(templateId: string, params: Record<string, string>): Promise<string>;
  clearError(): void;
}
```

Not persisted (no `persist` middleware). Uses `devtools(subscribeWithSelector(...))`.

### projectStore (project instructions)

```typescript
interface Project {
  id: string;
  name: string;
  description: string;
  customInstructions: string;  // stored in SQLite projects table
  files: ProjectFile[];
  conversationIds: string[];
  // ...
}
```

## Key Patterns

### Dual Persistence for Custom Instructions
Global instructions are stored in both localStorage (Zustand persist) and a Rust-side JSON file (`custom_instructions.json` in app data dir). The file-based storage ensures instructions survive localStorage clears and can be shared across app instances. On load, the backend file is authoritative.

### XML-Tagged Merging
The merged instruction output uses XML tags (`<custom-instructions>`, `<project-instructions>`, etc.) to provide clear scope boundaries to the LLM. This prevents instruction bleed-through and helps the model understand which instructions come from where.

### Layered Context Injection
The `useSendMessage` hook builds the final `customInstructions` payload by layering multiple context sources:
1. Slash command instructions (from project `.claude/commands/`)
2. File context blocks (attached files)
3. Memory context (from `memoryStore` if auto-inject is enabled)
4. Merged custom instructions (project + conversation + global)

Each layer is prepended to the previous, so slash command instructions appear first in the final context.

### Template Marketplace Pattern
Templates use a marketplace install/uninstall pattern with user-scoped installs (`template_installs` table) and global install counts. The `TemplateInstaller` component extracts `{{placeholder}}` parameters from workflow step definitions and presents them as a form for the user to fill before execution.

### Hardcoded User ID
Template install/uninstall commands use a hardcoded `"default_user"` string instead of the actual authenticated user ID. This means template installs are not multi-user aware.

### Template Execution Is a Stub
`execute_template` does not actually run the workflow steps. It returns a serialized JSON representation of the workflow definition. The real workflow engine integration is not yet wired.

## Known Issues / Tech Debt

1. **Template execution is not wired** -- `execute_template` returns a serialized workflow JSON string instead of actually orchestrating the steps. The `WorkflowDefinition` with its `WorkflowStep` items (tool_id, parameters, retry logic, timeouts) is defined but never executed through the workflow/orchestration engine in `core/orchestration/`.

2. **Hardcoded `default_user` in template commands** -- `install_template`, `get_installed_templates`, and `uninstall_template` all use `"default_user"` instead of the authenticated user's ID. Multi-user template installs will not work.

3. **Frontend/backend max length mismatch** -- The frontend `maxInstructionsLength` defaults to 10,000 characters while the Rust-side `MAX_CUSTOM_INSTRUCTIONS_LENGTH` allows up to 50,000. The frontend textarea enforces the lower limit via `maxLength`, but direct IPC calls could send up to 50,000.

4. **TemplateService IPC param casing bug** -- `installTemplate` and `uninstallTemplate` in `templateService.ts` pass `template_id` (snake_case) instead of `templateId` (camelCase). Per the Tauri IPC rule, this should use camelCase. However, the Rust command parameter is also named `template_id` with no alias, so this happens to work because Tauri's auto-conversion maps `template_id` -> `template_id` directly for simple names. Still a latent risk if the Rust side adds aliases.

5. **No FTS5 usage for template search** -- Despite creating an `agent_templates_fts` virtual table in migration v23, `search_templates` in `TemplateManager` uses a simple `LIKE` query on the main table instead of leveraging the FTS5 index. This means full-text search features (ranking, stemming, phrase matching) are unused.

6. **Project instructions source unclear** -- The `customInstructionsStore` documentation says project instructions come from `.claude/CLAUDE.md` or project files, but `projectInstructions` is never auto-loaded from disk. It is only set manually via `setProjectInstructions()`. The project-level instructions on the `Project` model (SQLite) are separate from the `customInstructionsStore.projectInstructions` field.

7. **No conversation instruction persistence to backend** -- Per-conversation custom instructions live only in the Zustand chatStore (localStorage). They are not synced to the Rust backend or SQLite. If localStorage is cleared, conversation-specific instructions are lost.

8. **Sidebar indicator only** -- The conversation sidebar in `Sidebar.tsx` shows an amber-colored indicator when `conv.customInstructions` is set, but there is no inline way to edit per-conversation instructions from the sidebar; the user must open the dialog.

9. **Privacy export schema mismatch** -- `privacy.rs` queries `SELECT id, name, content, created_at FROM custom_instructions` but the file-based custom instructions (`custom_instructions.json`) use a different schema (`globalInstructions`, `globalInstructionsEnabled`). The SQLite `custom_instructions` table (referenced by `PrivacyTable::CustomInstructions`) appears to be a separate legacy table from the file-based approach, suggesting a migration was started but not completed.
