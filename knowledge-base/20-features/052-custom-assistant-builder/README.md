---
id: "AREA-052"
type: "area"
title: "Custom-assistant builder"
features: ["F052-01", "F052-02", "F052-03", "F052-04", "F052-05", "F052-06", "F052-07", "F052-08", "F052-09", "F052-10", "F052-11", "F052-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 52. Custom-assistant builder

A custom assistant is a saved setup: a name, instructions, a preferred model, on/off switches for tools, optional reference files and sharing rules. Each time the person chats with it, the same setup applies. The brief lists 41 items and marks most of them missing for web, desktop, mobile, VS Code and Chrome. The code shows that web and desktop already have much of this area, and the CLI has its own version built on markdown files. This guide describes what the code does.

**Who uses it.** Web: the files opened show no plan gate (apps/web/lib/agents/agent-route.ts and apps/web/features/agents/components/AgentsPage.tsx have none). Sharing to a workspace needs an organization: the database check in apps/web/db/neon/0370_user_agents.sql:73 says non-private visibility requires an organization_id. Desktop: the settings screen lists and edits agent files stored on the device. CLI: anyone who runs the CLI; project agents load only when the folder is trusted (apps/cli/src/agents.rs:255-257). No separate admin role was found in the files opened.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F052-01](F052-01-assistant-list-and-manage.md) | Assistant list and manage | built | partly | built | built | no | no |
| [F052-02](F052-02-create-and-edit-an-assistant.md) | Create and edit an assistant | built | partly | built | built | no | no |
| [F052-03](F052-03-guided-builder-live-preview-and-tool-testing.md) | Guided builder, live preview and tool testing | no | no | no | partly | no | no |
| [F052-04](F052-04-identity-name-icon-colour-and-descriptions.md) | Identity: name, icon, colour and descriptions | partly | partly | partly | partly | no | no |
| [F052-05](F052-05-instructions-starters-and-examples.md) | Instructions, starters and examples | partly | partly | partly | partly | no | no |
| [F052-06](F052-06-knowledge-reference-files-and-connected-sources.md) | Knowledge: reference files and connected sources | partly | no | partly | no | no | no |
| [F052-07](F052-07-model-and-tool-switches.md) | Model and tool switches | partly | partly | partly | partly | no | no |
| [F052-08](F052-08-custom-actions-from-an-api-schema.md) | Custom actions from an API schema | no | no | no | no | no | no |
| [F052-09](F052-09-drafts-publishing-and-versions.md) | Drafts, publishing and versions | built | no | built | no | no | no |
| [F052-10](F052-10-who-can-use-it-sharing.md) | Who can use it (sharing) | partly | no | partly | partly | no | no |
| [F052-11](F052-11-creator-identity-and-usage.md) | Creator identity and usage | partly | no | partly | no | no | no |
| [F052-12](F052-12-copy-move-and-retire.md) | Copy, move and retire | partly | partly | partly | partly | no | no |

Requirement items for this area: [10-requirements/capabilities/052-custom-assistant-builder.md](../../10-requirements/capabilities/052-custom-assistant-builder.md).

## How this area works in the code

1. **1. Load the list (web).** The Agents page calls the agents client, which calls the list route. The route checks rate limits and gets a user-scoped database handle, then reads the rows and returns them with a no-store header. (`apps/web/features/agents/components/AgentsPage.tsx:96`, `apps/web/features/agents/services/agents-client.ts:110`, `apps/web/app/api/custom-agents/route.ts:21`, `apps/web/lib/agents/agent-route.ts:32-38`, `apps/web/lib/services/custom-agent-service.ts:281`)
2. **2. Build and check the form (web).** The editor starts from a blank draft or the saved assistant. The form checks the draft locally before saving. The server schema applies the same limits. (`apps/web/features/agents/components/AgentEditorPage.tsx:129`, `apps/web/features/agents/lib/agent-draft.ts:7`, `apps/web/features/agents/lib/agent-draft.ts:38`, `packages/contracts/cloud-contracts/src/agents.ts:89-117`)
3. **3. Save a new assistant (web).** A write checks the CSRF token, then the server validates the body and inserts a row in user_agents. Defaults fill in any field left out. (`apps/web/app/api/custom-agents/route.ts:32`, `apps/web/lib/agents/agent-route.ts:40-46`, `apps/web/lib/services/custom-agent-service.ts:339-352`, `apps/web/lib/services/custom-agent-service.ts:34-45`, `apps/web/db/neon/0370_user_agents.sql:44`)
4. **4. Publish and restore (web).** Publish copies the current config into user_agent_versions with the next version number. Restore copies an old version back into the draft. (`apps/web/app/api/custom-agents/[id]/publish/route.ts:32`, `apps/web/lib/services/custom-agent-service.ts:449-491`, `apps/web/lib/services/custom-agent-service.ts:533-551`, `apps/web/db/neon/0370_user_agents.sql:95`)
5. **5. Start a chat with the assistant (web).** The conversations route checks the assistant can be read, then inserts a web chat row that stores the agent id. (`apps/web/app/api/custom-agents/[id]/conversations/route.ts:21`, `apps/web/lib/services/custom-agent-service.ts:721-735`)
6. **6. Apply the assistant on each turn (web).** When a chat has an agent id, the chat request loads the assistant config. It stops if the assistant is paused, retired or over its daily turn limit, and returns a message. (`apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3897-3898`, `apps/web/lib/agents/agent-turn-config.ts:57-87`)
7. **7. Attach reference files (web).** An upload goes to the files route, which checks the owner and the file count, hashes the text and stores it in user_agent_files. (`apps/web/app/api/custom-agents/[id]/files/route.ts:69`, `apps/web/lib/services/custom-agent-service.ts:767-797`, `packages/contracts/cloud-contracts/src/agents.ts:25-26`)
8. **8. Desktop path (device files).** The desktop settings list reads agent markdown files from the Claude agents folders in the home and project directories. Writes go to the same folders. (`apps/desktop/src/features/settings/CustomAgentsList.tsx:162`, `apps/desktop/src/stores/customAgentsStore.ts:30`, `apps/desktop/src-tauri/src/sys/commands/custom_agents.rs:120-130`, `apps/desktop/src-tauri/src/sys/commands/custom_agents.rs:179-198`)
9. **9. CLI path (device files).** The /agents command parses the subcommand. Create from words asks the session model for a draft and writes a file. Discovery reads markdown files from the home and project agent folders, with project folders only when trusted. When a session starts with an agent, its fields are applied to the session. (`apps/cli/src/agents.rs:580-600`, `apps/cli/src/agents.rs:686-700`, `apps/cli/src/agents.rs:777-800`, `apps/cli/src/agents.rs:258-275`, `apps/cli/src/agents.rs:98-145`)

## Files to know

| File | Role |
|---|---|
| `apps/web/app/api/custom-agents/route.ts` | List and create endpoints for assistants on the web. |
| `apps/web/lib/services/custom-agent-service.ts` | All assistant rules on the server: create, publish, restore, share, files, usage, and the default settings. |
| `packages/contracts/cloud-contracts/src/agents.ts` | Shared schema and limits for assistants, used by web routes and screens. |
| `apps/web/db/neon/0370_user_agents.sql` | Database tables for assistants, versions, access and files, with checks. |
| `apps/web/lib/agents/agent-turn-config.ts` | Loads an assistant's settings for a chat turn and blocks paused, retired or over-limit assistants. |
| `apps/web/features/agents/components/AgentConfigForm.tsx` | The web form where a person edits an assistant. |
| `apps/cli/src/agents.rs` | CLI agent files: parsing, discovery, /agents commands, model drafting and applying an agent to a session. |
| `apps/desktop/src-tauri/src/sys/commands/custom_agents.rs` | Desktop commands that read and write agent markdown files in the Claude agents folders. |
| `apps/desktop/src/features/settings/CustomAgentsList.tsx` | Desktop settings list of agents with open editor. |

## What is stored

- Assistant rows: name, description, icon, colour, instructions, output examples, starters, model, effort, switches, connector and skill lists, web domain rules, daily and monthly limits, status, visibility: Postgres table public.user_agents (apps/web/db/neon/0370_user_agents.sql:44), with later columns from migrations 0374, 0388, 0389
- Published versions with config snapshot and note: Postgres table public.user_agent_versions (0370_user_agents.sql:95)
- Who can access an assistant: Postgres table public.user_agent_access (0370_user_agents.sql:106)
- Reference files as text with SHA-256 hash and byte size: Postgres table public.user_agent_files (0370_user_agents.sql:117)
- Chat row linked to an assistant (agent_id): Postgres table public.web_conversations (apps/web/lib/services/custom-agent-service.ts:721-735)
- CLI assistant as a markdown file with frontmatter (project and global): Project folder .agiworkforce/agents and home folder agents folder under the CLI config directory (apps/cli/src/agents.rs:1110-1127 and 1288-1290)
- Desktop assistant as a markdown file: Home folder .claude/agents and project folder .claude/agents (apps/desktop/src-tauri/src/sys/commands/custom_agents.rs:120-130)

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Visibility: private, people, workspace**: Who can read and use an assistant. Non-private needs an organization. (packages/contracts/cloud-contracts/src/agents.ts:12; apps/web/db/neon/0370_user_agents.sql:64, 73)
- **Status: active, paused, retired**: Paused or retired assistants refuse new chat turns with a message. (apps/web/lib/agents/agent-turn-config.ts:33, 73-80)
- **Daily turn limit**: Stops an assistant after its daily message count; resets at midnight UTC per the message. (apps/web/lib/agents/agent-turn-config.ts:81-87; packages/contracts/cloud-contracts/src/agents.ts:22)
- **Monthly credit limit**: Caps spend per assistant per month. (packages/contracts/cloud-contracts/src/agents.ts:23; apps/web/lib/services/custom-agent-service.ts:690)
- **Web search, code execution, image generation defaults**: Turned on for new assistants by default. (apps/web/lib/services/custom-agent-service.ts:40-42)
- **Rate limit and CSRF on agent routes**: Reads use the chat conversation rate limit; writes need a CSRF token. (apps/web/lib/agents/agent-route.ts:35, 44)
- **CLI --agent and --agent-id flags**: Start a session with a named agent. (apps/cli/src/cli_options.rs:63-64, 179-180)
- **Trusted workspace**: Project agents load only when the folder is trusted. (apps/cli/src/agents.rs:255-257, 270)
- **CLI permission mode narrowing**: An agent file can only make the session stricter, never looser. (apps/cli/src/agents.rs:150-187)
- **Plan gates and feature flags**: Not found in the files opened. (Not established)

## Shared between apps

Shared: packages/contracts/cloud-contracts holds the schema and limits used by web routes and screens. The web chat request and the scheduled-task code both call loadAgentTurnConfig (apps/web/lib/services/schedule-service.ts:924; apps/web/lib/services/scheduled-agent-executor.ts:919). The CLI and desktop read the same markdown file format, and the desktop comment says so (apps/desktop/src-tauri/src/sys/commands/custom_agents.rs:17-19). Separate per app: web uses the database and its own screens; the CLI has its own parser and command set in apps/cli/src/agents.rs; the desktop has its own Rust parser and React screens. Mobile, VS Code and Chrome have no assistant code found.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief says web and desktop are missing for most items, but web has the list, create, edit, publish, versions, sharing, files, usage, export, import, transfer and status routes, and desktop has a list and editor. (apps/web/app/api/custom-agents/route.ts:21, 32; apps/desktop/src/features/settings/CustomAgentsList.tsx:162; apps/desktop/src/features/settings/CustomAgentEditor.tsx)
- Many brief Code pointers do not match what the code does at those lines. Examples: apps/cli/src/claude_parity.rs:188 is the /continue command; apps/cli/src/tui/tui_app.rs:3663 is status-bar layout code; apps/cli/src/agent/mod.rs:905 is a session field initializer; apps/cli/src/agent/chat.rs:2114 is fallback model handling; apps/cli/src/agents.rs:228 and 255 are subagent and discovery code, not workspace access; apps/cli/src/agents.rs:167 is a permission message; apps/cli/src/agents.rs:376 is a directory loader. (apps/cli/src/claude_parity.rs:188; apps/cli/src/tui/tui_app.rs:3663; apps/cli/src/agent/mod.rs:905; apps/cli/src/agent/chat.rs:2114; apps/cli/src/agents.rs:167, 228, 255, 376)
- Three separate stores for assistants: web in the database, desktop in Claude-folder files, CLI in its own folder plus Claude folder for reading. Nothing syncs them, and desktop writes to the Claude folder while the CLI creates files in its own folder. (apps/cli/src/agents.rs:1110-1127 and 253; apps/desktop/src-tauri/src/sys/commands/custom_agents.rs:120-130)
- Web defaults turn on web search, code execution and image generation for every new assistant. (apps/web/lib/services/custom-agent-service.ts:40-42)
- Long description is not separate: only the 300-character short description exists in the database and schema. (apps/web/db/neon/0370_user_agents.sql:49; packages/contracts/cloud-contracts/src/agents.ts:91)
- Reference file size limit is defined but the file-size check was not seen in addAgentFile, which checks only the count. (packages/contracts/cloud-contracts/src/agents.ts:26; apps/web/lib/services/custom-agent-service.ts:767-783)
- Brief says avatar is missing, but icon and accent colour exist in the schema and the form. (packages/contracts/cloud-contracts/src/agents.ts:92-93; apps/web/features/agents/components/AgentAvatar.tsx)

## Not established

- Plan gates for web assistants: none found in the files opened. The brief does not mention plan limits for this area.
- Whether the chat request applies instructions, tools and switches exactly as the schema says: only the load step (request-processor.ts:3897-3898 and agent-turn-config.ts) was read.
- Whether database row access rules enforce the visibility settings: the SQL policy was not read.
- Whether export, import, transfer, usage, activity and status routes behave as their names suggest: only their existence was checked.
- Public listing, creator profile, verified publisher, duplicate or fork, deprecation text, replacement link, connected sources and refresh, custom actions and their sign-in, tool testing, live preview, guided chat builder, sample prompts and suggested use cases: no code found in the search, which was keyword based.
- Whether the CLI model override respects the local, own-key and cloud boundary: only switch_model is called (agents.rs:101); the switch logic was not read.
- Mobile, VS Code and Chrome: searches for custom-agent terms found no assistant code. This was a keyword search, not a full read.
- Nothing was run: no builds, tests, installs or servers, and no localhost testing, because the task was read-only. The relayed request to test on localhost one surface at a time was not applied, since no testing was done.
