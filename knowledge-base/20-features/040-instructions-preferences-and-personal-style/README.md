---
id: "AREA-040"
type: "area"
title: "Instructions, preferences, and personal style"
features: ["F040-01", "F040-02", "F040-03", "F040-04", "F040-05", "F040-06", "F040-07", "F040-08", "F040-09", "F040-10", "F040-11"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 40. Instructions, preferences, and personal style

This area lets a person tell the assistant who they are, how they want replies to sound and be shaped, and what standing rules should apply. It covers a name and background, a response style preset, fine sliders for tone and length, custom instructions for every chat, per-project and per-conversation overrides, and custom output styles. It matters because the same question gets a different answer for a student, a manager or a developer, and the user should not have to repeat these preferences in every chat.

**Who uses it.** Every signed-in user on the Web, Mobile, CLI, Desktop and extension surfaces, per the brief's Status lines. The web server code that builds the preference text is in the Cloud chat path (apps/web/app/api/llm/v1/chat/completions). I did not establish any plan gate for these settings in the code I read. Workspace admins appear only through the project-sharing check in apps/web/lib/server/user-identity.ts:213-229, which reads organization shared projects. Developers use the CLI output-style code and its custom style files.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F040-01](F040-01-about-you-name-background-role.md) | About you (name, background, role) | built | built | built | built | built | no |
| [F040-02](F040-02-response-style-presets-per-chat.md) | Response style presets (per chat) | built | built | partly | built | partly | no |
| [F040-03](F040-03-fine-tune-replies-warmth-enthusiasm-formality-leng.md) | Fine-tune replies (warmth, enthusiasm, formality, length, headings, emoji, technical depth) | built | built | built | partly | partly | no |
| [F040-04](F040-04-language-preference.md) | Language preference | partly | partly | partly | partly | partly | no |
| [F040-05](F040-05-standing-custom-instructions-and-project-instructi.md) | Standing custom instructions and project instructions | built | built | partly | partly | partly | no |
| [F040-06](F040-06-agent-instructions-cli.md) | Agent instructions (CLI) | no | no | no | built | no | no |
| [F040-07](F040-07-per-conversation-override.md) | Per-conversation override | built | built | built | built | no | no |
| [F040-08](F040-08-learn-style-from-writing-samples.md) | Learn style from writing samples | partly | partly | no | no | no | no |
| [F040-09](F040-09-custom-output-styles.md) | Custom output styles | built | built | no | built | partly | no |
| [F040-10](F040-10-goals-and-interests.md) | Goals and interests | no | no | no | no | no | no |
| [F040-11](F040-11-see-and-import-effective-instructions.md) | See and import effective instructions | no | no | no | built | partly | no |

Requirement items for this area: [10-requirements/capabilities/040-instructions-preferences-and-personal-style.md](../../10-requirements/capabilities/040-instructions-preferences-and-personal-style.md).

## How this area works in the code

1. **Person sets preferences in a settings screen.** Web General settings, Mobile Personalization screen, or CLI/VS Code settings. The save path from these screens to the server was not opened in this read. (`apps/web/features/settings/sections/GeneralSection.tsx:559`, `apps/mobile/src/features/settings/personalization/index.tsx:351`)
2. **Person picks a style in the composer, per conversation.** The style menu lists five presets. Each choice is stored under the conversation key; a custom style can be created with a name, instruction and sample. (`apps/web/features/chat/components/Composer/StyleSelector.tsx:30-36`, `apps/web/features/chat/stores/style-store.ts:151-198`)
3. **Style store syncs changes to the server.** Custom style create, update and delete call a hold step and then a sync. How the sync is stored was not confirmed. (`apps/web/features/chat/stores/style-store.ts:184-223`)
4. **Chat request reads the last user message.** The server finds the last user message text. This is used for memory learning, not for the preference block. (`apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4462-4470`)
5. **Project scope decides whether account preferences apply.** For a message in a project, the server reads that project's flags for account instructions and account style, and checks the user owns it or it is shared with them. No project means full account scope. (`apps/web/lib/server/user-identity.ts:213-229`)
6. **Preference text is built.** Name, work, about-you, response style and instructions are trimmed and capped, then wrapped in tags and labelled as user preference, not authority. (`apps/web/lib/server/user-identity.ts:150-201`)
7. **Mobile builds its own context blocks.** Mobile turns its personalization into a system block, plus a memory block, and adds both to the request. (`apps/mobile/src/features/memory/services/personalContext.ts:36-46`)
8. **CLI uses built-in and custom style prompts.** Each built-in style has a description and a system prompt. A custom style file adds a style section to the prompt. (`apps/cli/src/output_styles.rs:33-89`, `apps/cli/src/output_styles.rs:135`)

## Files to know

| File | Role |
|---|---|
| `apps/web/lib/server/user-identity.ts` | Builds the preference text sent with a Cloud chat (formatPersonalizationBlock, lines 150-201) and reads project scope flags (213-229). |
| `apps/web/features/chat/stores/style-store.ts` | Web store for the chosen style, length, per-conversation selections, and custom styles, with sync to server. |
| `apps/web/features/chat/components/Composer/StyleSelector.tsx` | Composer menu: five presets (lines 30-36) and the custom-style create form. |
| `apps/web/features/settings/sections/GeneralSection.tsx` | Web settings form for name, background, tone dials, language and custom instructions. Lines 455-480 are the thinking-effort row, not these fields. |
| `apps/mobile/src/features/memory/services/personalContext.ts` | Mobile builder for the personalization and memory system blocks. |
| `apps/cli/src/output_styles.rs` | CLI built-in styles (default, concise, study, proactive, explanatory, learning) and custom style files. |
| `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Cloud chat request processing. Only lines 4462-4470 were read as personalization-adjacent; the call that adds the block was not found in the read. |
| `apps/extension-vscode/src/features/personalization/personalization.ts` | VS Code personalization and style presets (line 143). |

## What is stored

- Name, work description, about-you text, custom instructions (account): Storage not read in this pass. The form is in apps/web/features/settings/sections/GeneralSection.tsx; the server reads it through apps/web/lib/server/user-identity.ts (table not confirmed).
- Per-project flags uses_account_instructions and uses_account_style: Database table public.user_projects, read in apps/web/lib/server/user-identity.ts:219-222.
- Custom styles (name, instruction, sample, created time) and per-conversation style choices: Web in-memory store apps/web/features/chat/stores/style-store.ts, synced to the server through syncToServer (line 196). The server-side table was not confirmed.
- CLI custom output style files: Read by apps/cli/src/output_styles.rs (file path logic at lines 135-206, not fully read).

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **MAX_ABOUT_YOU_LENGTH (1500)**: Caps the about-you text sent to the model. (apps/web/lib/server/user-identity.ts:150)
- **Name and work length limits (60 and 120)**: Cap the preferred name and work description in the preference block. (apps/web/lib/server/user-identity.ts:161-162)
- **Project flags uses_account_instructions and uses_account_style**: Decide per project whether account instructions and style apply. Null project gives full account scope. (apps/web/lib/server/user-identity.ts:213-222)
- **Response-length options (RESPONSE_LENGTH_OPTIONS, default length)**: The list and default for the reply length choice. (apps/web/features/chat/stores/style-store.ts (exported constants, imported in StyleSelector.tsx:21-28))

## Shared between apps

Web and mobile each have their own preference-text code: web in apps/web/lib/server/user-identity.ts, mobile in apps/mobile/src/features/memory/services/personalContext.ts (with its own personalization service). They are separate implementations, not one shared function, as far as I read. The CLI uses its own Rust module (apps/cli/src/output_styles.rs) and a shared agent-core prompt crate (agiworkforce_agent_core::output_styles, referenced at output_styles.rs:50). Style state (style-store.ts) is web-only. The brief places the mobile and VS Code code under their own app folders, so they are per app.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief item S40.30 (project sharing) cites request-processor.ts:2823, but that line is resolveTurnPromptCache, a prompt-cache function. The real project-scope read is user-identity.ts:213-229. (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2822-2834)
- Brief item S40.23 (style reset) cites GeneralSection.tsx:463, but that line is the thinking-effort row (ReasoningEffortRow). The reset is not confirmed at that line. (apps/web/features/settings/sections/GeneralSection.tsx:460-480)
- Brief item S40.25 (learning style) cites request-processor.ts:2627, 2710, 1201 and 1214. Line 2627 is part of web-search and URL-fetch tool setup, not style. The other lines were not checked. (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2615-2628)
- Brief item S40.01 cites request-processor.ts:4460, but that area handles the image URL checks and last user message lookup. The preference block call was not found there. (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4440-4470)
- Naming mismatch: web and mobile call the learning preset Learning; the CLI calls the same kind of style study. The brief groups them as the same item. (apps/web/features/chat/components/Composer/StyleSelector.tsx:34; apps/cli/src/output_styles.rs:55-58)
- The web preset list has no Learning-only check on mobile, and the brief marks mobile learning as missing (S40.25). (apps/mobile/src/features/chat/components/StyleSelector.tsx:26)

## Not established

- Which plans, feature flags or environment values gate these settings. I did not find a plan check in the read code.
- How the Local and own-key paths get the preference text. I only read the Cloud request processor, and only partly.
- The save path from each settings screen to storage, and the table names for name, background and instructions.
- The exact effect of each tone dial on the model reply. I saw the generic block only.
- Whether empty, waiting and failure states exist for each feature. Not verified in the code read.
- Status for Desktop, VS Code and Chrome: the brief says done, but I did not open their code.
- Whether the length control on mobile is the same store as web. I saw the brief's pointers only.
- Contents of apps/cli/src/output_styles.rs lines 90-205 (custom style file format and delete) and the file locations used there.
