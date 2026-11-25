---
id: "COMP-projects"
type: "competitor-trace"
title: "Projects"
competitor_evidence_reviewed: "2026-11-22"
basis: "official competitor pages saved 2026-11-22; AGI status from code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Projects: competitors to requirements

Both leaders ship Projects: shared instructions, files and sources, project chats, project-scoped memory, and sharing with roles. AGI has most of this on web and desktop, with partial mobile and little in CLI, VS Code and Chrome. A person saw project create, instructions and project chats work on web, and saw file upload fail (likely an unmigrated local database). Main gaps are sources, retrieval, link sharing, import, spend tags and coordinated threads.

**How the products divide this topic.** Claude (support.claude.com): Projects are workspaces with instructions and knowledge. Free has up to five projects, and paid plans have no cap. Team and Enterprise add sharing with Can view or Can edit. Each project has its own memory with a Use account memory switch. Large knowledge switches to retrieval on paid plans. Claude Cowork (desktop) has a separate kind of project, tied to local folders, with scheduled tasks and memory. Claude Code (code.claude.com) has a beta Projects feature for paid individual plans (Pro, Max, Ultra), not Team or Enterprise. It is one coordinating conversation with parallel cloud threads, one user, no sharing, and a 16,000-character instruction field. It connects to the chat product only through the Claude desktop and web apps; Claude Code CLAUDE.md files are a separate thing. ChatGPT (help.openai.com): Projects are on every plan. Files per project are 5 on Free, 25 on Go and Plus, and 40 on Pro, Business, Enterprise and Edu. Sharing exists on all plans, with collaborator caps. Memory can be set to project-only. Codex (learn.chatgpt.com docs): the desktop app's Projects view mixes ChatGPT projects with local folder projects (several folders, one primary). The CLI and IDE treat the open folder as the project and have no Projects view. All catalogue lines were reviewed 2026-11-22. Several Claude and ChatGPT pages describe rollouts, so availability is plan- and account-dependent.

Each capability below is traced: competitor evidence, AGI requirement, current implementation, gap, acceptance criteria, verification. Competitor behaviour comes only from the cited pages, reviewed 2026-11-22.

| ID | Capability | Claude | ChatGPT | AGI today | Verified |
|---|---|---|---|---|---|
| [CAP-projects-01](#cap-projects-01) | Create and manage a project | yes | yes | built | seen working by a person |
| [CAP-projects-02](#cap-projects-02) | Project instructions | yes | yes | built | seen working by a person |
| [CAP-projects-03](#cap-projects-03) | Project files (knowledge) with limits | yes | yes | partly built | seen failing by a person |
| [CAP-projects-04](#cap-projects-04) | Retrieval over large project knowledge | yes | unknown | partly built | code inspected only |
| [CAP-projects-05](#cap-projects-05) | Connected sources in a project | yes | yes | partly built | not verified |
| [CAP-projects-06](#cap-projects-06) | Save an answer to project sources | unknown | yes | partly built | code inspected only |
| [CAP-projects-07](#cap-projects-07) | Project chats and moving chats in and out | yes | yes | built | seen working by a person |
| [CAP-projects-08](#cap-projects-08) | Project memory and the account-memory switch | yes | yes | partly built | not verified |
| [CAP-projects-09](#cap-projects-09) | Chats without a project and temporary chats | yes | yes | built | seen working by a person |
| [CAP-projects-10](#cap-projects-10) | Share a project with people (view or edit) | yes | yes | partly built | not verified |
| [CAP-projects-11](#cap-projects-11) | Project sharing by link and public visibility | yes | yes | partly built | not verified |
| [CAP-projects-12](#cap-projects-12) | Admin controls for project sharing | yes | yes | partly built | not verified |
| [CAP-projects-13](#cap-projects-13) | Leave a shared project, branch a member's chat, share one chat | unknown | yes | partly built | not verified |
| [CAP-projects-14](#cap-projects-14) | Archive, star, pin and delete a project | yes | yes | partly built | not verified |
| [CAP-projects-15](#cap-projects-15) | Find projects: list tabs, filters and unified search | yes | yes | partly built | not verified |
| [CAP-projects-16](#cap-projects-16) | Tools and modes inside projects | yes | yes | partly built | seen failing by a person |
| [CAP-projects-17](#cap-projects-17) | Voice inside a project | unknown | yes | partly built | not verified |
| [CAP-projects-18](#cap-projects-18) | Project default model and chat defaults | partly | unknown | built | not verified |
| [CAP-projects-19](#cap-projects-19) | Duplicate, export and project templates | no | unknown | built | not verified |
| [CAP-projects-20](#cap-projects-20) | Import projects from another assistant | unknown | yes | partly built | not verified |
| [CAP-projects-21](#cap-projects-21) | Coordinated project with parallel threads | yes | no | partly built | not verified |
| [CAP-projects-22](#cap-projects-22) | Local-folder projects and project instruction files | yes | yes | partly built | code inspected only |
| [CAP-projects-23](#cap-projects-23) | Project work tasks, scheduled routines and artifacts | partly | partly | partly built | seen failing by a person |
| [CAP-projects-24](#cap-projects-24) | Plan limits for projects | yes | yes | partly built | seen failing by a person |
| [CAP-projects-25](#cap-projects-25) | Project spend tags and usage analytics | yes | partly | not built | not verified |
| [CAP-projects-26](#cap-projects-26) | Project data retention, deletion and compliance | yes | yes | unknown | not verified |

## CAP-projects-01 Create and manage a project

A named workspace with description, icon and colour that appears in a project list and has its own page.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects](https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects): New Project from the Projects page with name and description; Team and Enterprise choose private or whole-org visibility. [reviewed 2026-11-22] Plans: Free, Pro, Max, Ultra, Team, Enterprise. Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10169521-projects-in-chatgpt](https://help.openai.com/en/articles/10169521-projects-in-chatgpt): Create a project with name, icon and colour; unlimited projects. [reviewed 2026-11-22] Plans: All plans. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/definition.md line 171 (Projects group chats, files, instructions, app links, tools and scoped memory)). A signed-in user can create, rename, colour, list and open projects on every app that shows projects. The project follows the account.

**With different models, providers and the one subscription.** A project records a default provider mode and privacy mode, not a model lock. The project count comes from the plan limit in the one subscription catalogue. In Local mode a project lives on the device and needs no sign-in.

**Current implementation, as this trace read it on 2026-11-24: built.** Web, desktop and mobile built; CLI and VS Code create via commands; Chrome unverified. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S23.01, S23.02, S23.03, S23.05
- Comparison list ids: none matched; rows without an id: web row: Projects hub with create, list and project home; web row: Project icon, colour and pinning; mobile row: Create a new project
- Code: `apps/web/app/chat/projects/page.tsx:397`; `apps/web/features/chat/components/dialogs/CreateProjectDialog.tsx:70`; `apps/web/app/api/projects/route.ts:133`; `apps/mobile/app/(app)/(tabs)/projects.tsx:443`; `packages/contracts/cloud-contracts/src/projects.ts:30`

**Gap.** Chrome status unverified. Project cover treatment is n/a in the ledger.

**Acceptance criteria**

1. Create a project with a name and colour; it appears in the list and survives reload and sign-in on another app.
2. Rename it and change colour; both show in the sidebar and the project page.
3. On a Free account, creating projects past the plan limit shows the Upgrade path, not a raw error.

**Verification: seen working by a person.** 5-results/basics/scorecards/web.csv W-11 free and subscribed: project created and reopened. Other apps not seen.

## CAP-projects-02 Project instructions

Standing instructions saved on a project and applied to every chat inside it.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/10185728-understanding-claude-s-personalization-features](https://support.claude.com/en/articles/10185728-understanding-claude-s-personalization-features): Instructions are scoped to chats inside one project; the page also says project instructions are paid-only while another passage says Free has projects. The page contradicts itself. [reviewed 2026-11-22] Plans: Free (max 5 projects), paid. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10169521-projects-in-chatgpt](https://help.openai.com/en/articles/10169521-projects-in-chatgpt): Project instructions apply only in the project and take precedence over global custom instructions. [reviewed 2026-11-22] Plans: All plans. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/definition.md line 171). Project instructions apply to every chat in the project, in a documented order against account instructions, for every model and provider. A length limit is shown before the user hits it.

**With different models, providers and the one subscription.** Instructions are added to the prompt by AGI, so they work with any model. They are never dropped silently when context is tight; the visible limit comes from configuration. Local mode applies them on device.

**Current implementation, as this trace read it on 2026-11-24: built.** Web, desktop, mobile, CLI and VS Code built; Chrome unverified. Web comparison row 'Project instructions apply with account instructions' is Partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S23.09
- Comparison list ids: WP245
- Code: `apps/web/features/projects/components/ProjectSettingsDialog.tsx:229`; `apps/web/lib/services/project-context-service.ts:566`; `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2550`; `packages/contracts/cloud-contracts/src/projects.ts:88`

**Gap.** Layering order against account instructions is only Partial in the comparison; the exact rule is not documented for the user.

**Acceptance criteria**

1. Save 'finish answers with a code word'; every new chat in the project ends with it; a chat outside the project does not.
2. Edit the instruction; an existing chat uses the new text on its next message.
3. Same result with at least two different providers and in Local mode.

**Verification: seen working by a person.** scorecards/web.csv W-11 free and subscribed: instruction END-42 persisted on reopen and applied; an unrelated chat did not leak it.

## CAP-projects-03 Project files (knowledge) with limits

Upload documents to a project so every project chat can use them; per-plan limits apply.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/8241126-upload-files-to-claude](https://support.claude.com/en/articles/8241126-upload-files-to-claude): Files can go to a project Files section; 30 MB per file, unlimited count, but total content must fit the context window. [reviewed 2026-11-22] Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10169521-projects-in-chatgpt](https://help.openai.com/en/articles/10169521-projects-in-chatgpt): Upload PDFs, spreadsheets, docs, images or pasted text; 5 files Free, 25 Go and Plus, 40 Pro, Business, Enterprise and Edu; 10 uploads at once; preview, download, delete. [reviewed 2026-11-22] Plans: Free to Edu. Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity; docs/product/competitive-guidance.md section 5.7 item 50). Users can add, list, preview, download and remove project files. Limits per plan come from the subscription catalogue and are shown before upload.

**With different models, providers and the one subscription.** File text is extracted by AGI and sent as context, so any model works; a model that cannot read a file type gets a visible notice. Storage and count limits are one subscription setting for all apps. Local mode keeps files on the device and uses only device-side extraction; types that need our servers must say so.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, desktop and mobile built; CLI and Chrome missing. Mobile 'Project file limits by plan' is Missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S23.07
- Comparison list ids: M182, WP244
- Code: `apps/web/app/api/projects/[id]/knowledge-files/route.ts:227`; `packages/contracts/types/src/suite-contracts.ts:502`; `packages/contracts/types/src/billing-catalog.ts:618`; `apps/mobile/src/features/projects/components/ProjectSourcesTab.tsx:717`

**Gap.** Upload failed in the web test (a 500 from a missing database column); no per-plan file-count limit is shown on mobile; CLI and Chrome cannot manage project files.

**Acceptance criteria**

1. Upload a PDF to a project, see it listed, preview it, ask a question answered from it, then delete it.
2. Upload past the plan limit; a message names the limit and the Upgrade path.
3. Attach the same file on web and mobile; both list it.

**Verification: seen failing by a person.** scorecards/web.csv W-11 and 6-defects/web-problems-seen-in-browser.csv: upload and Add text failed twice on Free and subscribed with 'Something went wrong on our side'; server log said column storage_targets missing; migration 0419 adds it, so the local database may be behind. Marked blocked, not proven a code bug.

## CAP-projects-04 Retrieval over large project knowledge

When project files exceed the context window, the product searches them instead of loading all of them.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11473015-retrieval-augmented-generation-rag-for-projects](https://support.claude.com/en/articles/11473015-retrieval-augmented-generation-rag-for-projects): Near the context limit Claude switches to retrieval, up to 10x capacity, with a visible indicator and a project knowledge search tool call; it reverts when knowledge shrinks; users cannot toggle it. [reviewed 2026-11-22] Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web, desktop, ios, android.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (inferred; source: competitor parity (Claude only); docs/product/competitive-guidance.md section 5.7 item 67). A project larger than the model's context still answers from all its files, shows when it is searching, and cites the files used.

**With different models, providers and the one subscription.** Retrieval runs in AGI, so it is the same for every model; the model sees only the chosen passages. Context size differs by model, so the switch point must come from the chosen model. Local mode needs on-device search; if the device cannot do it, say so rather than fall back to our servers.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web has passage retrieval and citations; the web comparison row is Partial. Other apps unknown. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: WP244
- Code: apps/web/lib/server/project-knowledge-retrieval.ts (not found) (not found); apps/web/lib/server/project-knowledge-passages.ts (not found) (not found); `packages/contracts/types/src/project-file-citations.ts:29`; `apps/web/features/projects/components/KnowledgeIndexStatus.tsx:7`

**Gap.** I did not read how retrieval ranks or when it switches on. Local-mode retrieval and a visible searching indicator are unverified.

**Acceptance criteria**

1. Add files totalling more than the model context; a question about a late file is answered with a citation.
2. The chat shows that project search ran.
3. Remove a file; its text no longer appears in answers.

**Verification: code inspected only.** File names only; behaviour not run.

## CAP-projects-05 Connected sources in a project

Add content from Drive, GitHub or chat apps as live reference for project chats.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/10166901-use-google-workspace-connectors](https://support.claude.com/en/articles/10166901-use-google-workspace-connectors): In a project Files section, + then Drive adds docs as synced knowledge; unavailable for shared projects. [reviewed 2026-11-22] Apps: web, desktop.
  - [https://support.claude.com/en/articles/10167454-use-the-github-integration](https://support.claude.com/en/articles/10167454-use-the-github-integration): Add a repo by search or URL, choose files and folders, Sync to refresh. [reviewed 2026-11-22] Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10169521-projects-in-chatgpt](https://help.openai.com/en/articles/10169521-projects-in-chatgpt): Paste Drive file or folder or Slack channel links via Add sources in private projects; separate limit from uploads; Drive does not pre-sync. [reviewed 2026-11-22] Apps: web.

**AGI requirement** (inferred; source: competitor parity; docs/product/competitive-guidance.md section 5.7 item 50). A project can take sources from connected services, with the source and its freshness shown, only in projects where the source's owner has not been exposed to other members.

**With different models, providers and the one subscription.** Source text is fetched by AGI and given to any model. Each source says which service holds it. This is an outside-service feature, so it is unavailable in Local mode and the project says so.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and desktop: files and text work; Drive Picker waits on owner keys; GitHub sync missing. Mobile: files and text work, Drive waits on keys. CLI, Chrome missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S23.08
- Comparison list ids: W258, WP243
- Code: `apps/web/features/projects/components/AddSourcesModal.tsx:308`; `apps/web/app/api/connectors/google-drive/picker/route.ts:17`; `apps/mobile/src/features/projects/components/ProjectSourcesTab.tsx:264`

**Gap.** Drive needs the owner to set picker keys and live-check it; GitHub repo sync into a project is missing; no Slack source seen.

**Acceptance criteria**

1. Add a Drive file to a private project; a project chat quotes it.
2. Open a shared project; the Drive option explains why it is off.
3. Disconnect the service; the source shows as unavailable instead of silently empty.

**Verification: not verified.** Ledger says live check of the Picker is pending; the web test could not add any source because of the upload failure.

## CAP-projects-06 Save an answer to project sources

One action on an assistant message that stores it as project knowledge for later chats.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10169521-projects-in-chatgpt](https://help.openai.com/en/articles/10169521-projects-in-chatgpt): Message menu action 'Add to project sources' stores a response for reuse in later project chats. [reviewed 2026-11-22] Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity (ChatGPT only)). From a project chat the user can save a message into project sources in one action and see it in the sources list.

**With different models, providers and the one subscription.** Works on any model's output. The saved item counts toward the same project limits.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web built (helper exists); mobile Missing. The ledger lists this as n/a (S23.27) and conflicts with the web comparison row 'Same'. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S23.27
- Comparison list ids: M183
- Code: `apps/web/features/projects/components/project-answer-save.ts:6`; `apps/mobile/src/features/chat/components/MessageBubble.tsx:1702`

**Gap.** Mobile has no action; ledger and comparison disagree on web.

**Acceptance criteria**

1. Save a reply; it appears in Sources and a new project chat can use it.
2. Delete it from Sources; new chats cannot use it.

**Verification: code inspected only.** Not seen by a person.

## CAP-projects-07 Project chats and moving chats in and out

Chats started in a project use its context; existing chats can be moved in or out.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects](https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects): Chat menu Add to project opens a Move chat modal; chats can be removed or moved between projects. [reviewed 2026-11-22] Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10169521-projects-in-chatgpt](https://help.openai.com/en/articles/10169521-projects-in-chatgpt): Drag a chat or use Move to project; GPT chats and temporary chats cannot move; moved chats inherit instructions and files. [reviewed 2026-11-22] Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/competitive-guidance.md section 5.7 item 51). A chat can start inside a project, be moved in or out, and shows which project it belongs to. Context never leaks to chats outside the project.

**With different models, providers and the one subscription.** Project context is added per turn, so a model switch mid-chat keeps it. A Local chat may move into a Local project only; moving it into a Cloud project is an explicit consented fork (AGENTS.md section 6).

**Current implementation, as this trace read it on 2026-11-24: built.** Web, desktop, mobile built; chat row and plus-menu move exist. Web drag onto a project and mobile 'start project from chat' are Partial or Missing. A web chat started in a project opens as a Work session (founder decision D-2026-09-10-03). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S23.06, S23.26
- Comparison list ids: M188, WP246, WP54
- Code: `packages/ui/ui/src/sidebar/SessionItem.tsx:403`; `apps/web/features/chat/components/ConversationTitleMenu.tsx:167`; `apps/mobile/src/features/conversation-actions/useConversationActions.ts:279`; `apps/mobile/src/features/projects/components/ProjectChatsTab.tsx:110`

**Gap.** Drag a chat onto a project is Partial; ledger S23.26 says n/a while comparison rows say Same, so the ledger is stale or wrong. Project chats open in Work where the leaders open an ordinary chat.

**Acceptance criteria**

1. Start a chat from the project page; it is listed under the project and uses its instructions.
2. Move an old chat in, then out; instructions apply only while it is in.
3. A Local chat cannot be moved into a Cloud project without a consent step.

**Verification: seen working by a person.** scorecards/web.csv W-11: in-project chat worked and instruction isolation held. A defect row notes project chats opened as Work sessions with 'Search limit reached' rows, and the composer project chip is lost after reload.

## CAP-projects-08 Project memory and the account-memory switch

Each project keeps its own memory; the user chooses whether it also draws on account memory.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects](https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects): Each project has its own memory used with account memory but not other projects; Use account memory off isolates it. [reviewed 2026-11-22] Plans: Free, Pro, Max, Ultra, Team, Enterprise. Apps: web, desktop, ios.
  - [https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context): Reset deletes all memories including project memory; incognito is absent in projects, so turn Memory off for one chat. [reviewed 2026-11-22] Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10169521-projects-in-chatgpt](https://help.openai.com/en/articles/10169521-projects-in-chatgpt): Per-project default or project-only; project-only blocks personal memories and cross-project chat reference; changes take hours; shared projects stay project-only. [reviewed 2026-11-22] Plans: All; Enterprise/Edu contained. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/requirements.md (memory must distinguish project memory; project memory boundary) and docs/product/competitive-guidance.md section 5.7 item 52). A project keeps its own memory. The user can switch to project-only so nothing flows in or out, and can see and edit what the project remembers.

**With different models, providers and the one subscription.** Memory is AGI-owned text added to any model's prompt, so it carries across providers. Free usage is not blocked by it. In Local mode project memory stays on the device and is never uploaded.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and desktop built, CLI built; mobile ledger says Missing for memory but comparison rows say Same for choosing account memory and viewing project memory (conflict); VS Code and Chrome missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S23.11, S23.33
- Comparison list ids: none matched; rows without an id: mobile row: Project memory: default or project-only; mobile row: View what a project remembers; desktop row: Project memory kept apart from account memory
- Code: `packages/contracts/cloud-contracts/src/projects.ts:45`; `apps/web/features/projects/components/ProjectSettingsDialog.tsx:384`; `apps/mobile/src/features/projects/components/ProjectSettingsScreen.tsx:32`; `apps/cli/src/cloud/memory.rs:175`; `apps/web/app/api/projects/[id]/memory/edit`

**Gap.** Ledger and comparison disagree for mobile; VS Code and Chrome have no project memory.

**Acceptance criteria**

1. Tell a project chat a fact; a second chat in the project knows it; a chat outside does not.
2. Turn the account-memory switch off; account facts stop appearing in the project.
3. Open the project's memory, edit one item; the next answer follows the edit.

**Verification: not verified.** No scorecard or defect row covers project memory.

## CAP-projects-09 Chats without a project and temporary chats

Users can chat outside any project; temporary or incognito chats are treated specially in projects.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12260368-use-incognito-chats](https://support.claude.com/en/articles/12260368-use-incognito-chats): The ghost icon is absent in projects; use the Memory switch off in the plus menu instead. [reviewed 2026-11-22] Plans: All plans. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10169521-projects-in-chatgpt](https://help.openai.com/en/articles/10169521-projects-in-chatgpt): Temporary chats cannot be moved into a project. [reviewed 2026-11-22] Apps: web, ios, android.
  - [https://learn.chatgpt.com/docs/projects.md](https://learn.chatgpt.com/docs/projects.md): Start a chat without a project when the work is self-contained (Codex desktop app docs). [reviewed 2026-11-22] Apps: desktop.

**AGI requirement** (stated requirement; source: docs/product/definition.md line 171-172 (temporary chats neither read nor write memory)). A chat can exist with no project, and no project context reaches it. Temporary chats neither read nor write project memory.

**With different models, providers and the one subscription.** Applies the same way for every provider and in Local mode.

**Current implementation, as this trace read it on 2026-11-24: built.** Web and desktop built; incognito unavailable in projects matches Claude. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched; rows without an id: web row: Incognito unavailable inside projects; desktop row: Chats without a project
- Code: `apps/web/lib/temporary-chat-policy.ts:50`

**Gap.** none known

**Acceptance criteria**

1. A new plain chat does not use any project instruction.
2. The temporary chat control is absent or explained inside a project.
3. A temporary chat never writes to project memory.

**Verification: seen working by a person.** scorecards/web.csv W-11: an unrelated plain chat did not show the project instruction. Incognito inside projects not seen.

## CAP-projects-10 Share a project with people (view or edit)

The owner invites people and gives them view or edit rights to the project's instructions, files and chats.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/9517075-what-are-projects](https://support.claude.com/en/articles/9517075-what-are-projects): Share with Can view or Can edit by email list or the whole org; Shared with me tab and email notices; owners can disable sharing. [reviewed 2026-11-22] Plans: Team, Enterprise. Apps: web.
  - [https://code.claude.com/docs/en/claude-projects.md](https://code.claude.com/docs/en/claude-projects.md): The Claude Code Projects beta has no sharing; a project belongs to one user. [reviewed 2026-11-22] Plans: Pro, Max, Ultra. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10169521-projects-in-chatgpt](https://help.openai.com/en/articles/10169521-projects-in-chatgpt): Invite individuals (Business and up also groups) with chat or edit access, or share links; higher of group and individual access applies. [reviewed 2026-11-22] Plans: Free to Edu. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/requirements.md line 850 (full project collaboration is a later suite requirement)). An owner can share a project with named people at view or edit level, and members see it under Shared with me. Roles are enforced on the server. The share dialog says what is shared and what stays personal.

**With different models, providers and the one subscription.** Members use whichever model their own plan allows; usage counts against the member, not the owner. Shared project chats never run on the owner's provider key. Local projects cannot be shared; the control must say so.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and desktop built (org-based sharing with roles); mobile Partial; CLI, VS Code, Chrome missing. Invite and remove members built on web. Access requests missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S23.21, S23.22, S23.23, S23.25, S23.34
- Comparison list ids: MP103, WP249, WP265
- Code: `apps/web/features/projects/components/ProjectShareDialog.tsx:87`; `apps/web/app/api/settings/organization/shared/projects/[projectId]/route.ts:141`; `apps/web/lib/services/org-sharing-service.ts:238`; `apps/web/db/neon/0315_private_shared_projects.sql:41`; `apps/mobile/src/features/projects/projectSharing.ts:12`

**Gap.** Sharing is shown as Partial in comparison; the leaders allow it on every individual plan while AGI's path is organisation-based. Mobile has no members screen. No access requests.

**Acceptance criteria**

1. Owner shares with a second account as Can view; that account sees the project and cannot edit it.
2. Change to Can edit; the account can edit instructions.
3. Remove the member; the project disappears from their list.

**Verification: not verified.** No scorecard covers sharing.

## CAP-projects-11 Project sharing by link and public visibility

Share a project to anyone with a link, or make it visible to the whole organisation.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/9519189-manage-project-visibility-and-sharing](https://support.claude.com/en/articles/9519189-manage-project-visibility-and-sharing): General access switches between Everyone at org and Only people invited; chats inside a public project stay private unless shared. [reviewed 2026-11-22] Plans: Team, Enterprise. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10169521-projects-in-chatgpt](https://help.openai.com/en/articles/10169521-projects-in-chatgpt): Pick Only those invited or Anyone with a link (logged-in users); caps: Pro 100 collaborators, Plus and Go 10, Free 5. [reviewed 2026-11-22] Plans: Free to Edu. Apps: web, ios, android.

**AGI requirement** (proposed; source: competitor parity; the owner has not decided link sharing for individual plans). The owner picks invited-only or link access; the link opens the project only for signed-in people and the owner can revoke it. Collaborator caps come from the plan catalogue.

**With different models, providers and the one subscription.** Link joiners must sign in so entitlement and usage accounting apply to them. Not available for Local projects.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and desktop have share links to invited people; sharing to anyone with a link outside a workspace is Missing; mobile Missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S23.24
- Comparison list ids: M203, W351
- Code: `apps/web/features/projects/components/ProjectShareDialog.tsx:60`; `apps/web/features/projects/components/ProjectShareDialog.tsx:161`

**Gap.** No anyone-with-link mode outside a workspace; no collaborator caps by plan; no mobile link.

**Acceptance criteria**

1. Generate a link; a signed-out visitor is sent to sign in, then lands in the project.
2. Revoke the link; it stops working.
3. Exceed the plan's collaborator cap; the message names the cap.

**Verification: not verified.** Not seen.

## CAP-projects-12 Admin controls for project sharing

Organisation owners and roles control who may create, share or publish projects, and can revoke group access.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/9927533-control-project-sharing-for-your-organization](https://support.claude.com/en/articles/9927533-control-project-sharing-for-your-organization): Owners switch Share projects and Public projects (both default on); turning sharing off keeps existing shares but makes public projects private; Enterprise sets it per role. [reviewed 2026-11-22] Plans: Team, Enterprise. Apps: web.
  - [https://support.claude.com/en/articles/13799932-manage-groups-and-group-spend-limits-on-enterprise-plans](https://support.claude.com/en/articles/13799932-manage-groups-and-group-spend-limits-on-enterprise-plans): Turning off group sharing only blocks new shares; a separate option removes existing project access. [reviewed 2026-11-22] Plans: Enterprise. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10169521-projects-in-chatgpt](https://help.openai.com/en/articles/10169521-projects-in-chatgpt): Workspace roles control who can create or share projects. [reviewed 2026-11-22] Plans: Business, Enterprise, Edu. Apps: web.

**AGI requirement** (inferred; source: competitor parity; docs/product/competitive-guidance.md section 5.7 item 49 to 56). Organisation admins can turn project sharing and public projects on or off and set it per role; the effect on existing shares is stated.

**With different models, providers and the one subscription.** Admin policy applies identically on every app and does not depend on the model.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web has toggles and role permissions (Partial); group sharing Missing; revoke group access Partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S23.22
- Comparison list ids: W341, WP239, WP292, WP340
- Code: `apps/web/features/settings/sections/WorkspacePolicySection.tsx:457`; `packages/contracts/types/src/enterprise/permissions.ts:27`

**Gap.** Group sharing and clean revoke of group access are not complete.

**Acceptance criteria**

1. Turn sharing off; the Share control says so and existing shares stay.
2. A role without the share permission cannot open the share dialog.
3. Revoke a group; its members lose access within the stated time.

**Verification: not verified.** Not seen.

## CAP-projects-13 Leave a shared project, branch a member's chat, share one chat

Member-side actions in shared projects: leave with a copy, branch another member's chat, share a single chat by link.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10169521-projects-in-chatgpt](https://help.openai.com/en/articles/10169521-projects-in-chatgpt): Leaving offers a copy of your chats into a new project; members branch another's chat without altering it; sharing one chat shows only that chat. [reviewed 2026-11-22] Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity (ChatGPT only)). A member can leave a shared project and keep a copy of their own chats; a shared project chat can be shared alone without exposing project files.

**With different models, providers and the one subscription.** No model dependence. A kept copy is a new project owned by the member.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Share one chat by link: mobile built. Leave with copy: Missing on web and mobile. Branch a teammate's chat: Missing on web. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: M199, MP99, W342, W346
- Code: `apps/mobile/src/features/shared-links/shareConversation.ts:12`

**Gap.** Leave-and-copy and branch are missing.

**Acceptance criteria**

1. A member leaves and finds a copy of their chats in a new project.
2. Sharing one chat gives a link that does not show other chats or files.

**Verification: not verified.** Not seen.

## CAP-projects-14 Archive, star, pin and delete a project

Lifecycle actions: hide a finished project, keep favourites near the top, remove it with a warning.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects](https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects): Star, archive and unarchive; archived projects cannot be deleted until unarchived; delete asks to confirm. [reviewed 2026-11-22] Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10169521-projects-in-chatgpt](https://help.openai.com/en/articles/10169521-projects-in-chatgpt): Deleting a project is permanent: removes chats, instructions and project-only files; members lose access; cannot be undone. [reviewed 2026-11-22] Apps: web, ios, android.
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Jun 18, 2026: pinned section holds chats and projects. [reviewed 2026-11-22] Apps: web.

**AGI requirement** (stated requirement; source: AGENTS.md section 9 (irreversible actions ask first; chats archived or moved to Recently deleted)). Archive and restore work with contents intact. Delete names exactly what is lost and goes to a recoverable place first, as AGENTS.md section 9 requires.

**With different models, providers and the one subscription.** No model dependence. A shared project's delete says who loses access.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, desktop built; mobile delete built with warning; archive Missing on mobile; CLI archive and delete built. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S23.30, S23.32
- Comparison list ids: none matched; rows without an id: web row: Archive, unarchive and delete projects; mobile row: Delete a project with a clear warning of what is lost
- Code: `apps/web/app/api/projects/[id]/route.ts:246`; `apps/web/app/api/projects/[id]/route.ts:326`; `apps/web/lib/server/project-deletion.ts:23`; `apps/mobile/src/features/projects/useProjectActions.ts:145`

**Gap.** Whether delete is recoverable (Recently deleted) was not checked; archive missing on mobile, VS Code, Chrome. Ledger says chats are kept unfiled on delete; ChatGPT removes them.

**Acceptance criteria**

1. Archive a project; it leaves the list and returns with all content on restore.
2. Delete shows what will be lost and requires confirmation.
3. After delete, the stated recovery path works.

**Verification: not verified.** Not seen.

## CAP-projects-15 Find projects: list tabs, filters and unified search

Browse and search projects by name, ownership or type.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects](https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects): Projects page tabs: Your projects, Organization, Shared with you. [reviewed 2026-11-22] Plans: Team, Enterprise. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10056348-finding-your-chats-projects-and-files-in-chatgpt](https://help.openai.com/en/articles/10056348-finding-your-chats-projects-and-files-in-chatgpt): Sidebar search finds chats, projects, images and documents, with filters All, Chats, Images, Documents, Projects. [reviewed 2026-11-22] Plans: All plans. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/definition.md line 168-170 (account history searchable across chats, projects, images, documents)). Users can search the project list and filter by yours, shared and organisation; account search covers projects.

**With different models, providers and the one subscription.** Search is not model-dependent. Local projects are searched on device.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and mobile search built; web tabs and unified search Partial; mobile type filters Partial; CLI, VS Code missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S23.20
- Comparison list ids: MP23, MP29, WP248, WP81
- Code: `packages/ui/unified-chat/src/components/ProjectGallery.tsx:120`; `apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:70`; `apps/mobile/src/features/chat/ChatsListScreen.tsx:112`

**Gap.** Partial tabs and search filters.

**Acceptance criteria**

1. Type part of a project name; the list narrows.
2. Search finds a project from the global search with a Projects filter.
3. A shared project appears under a shared tab.

**Verification: not verified.** Not seen.

## CAP-projects-16 Tools and modes inside projects

Which chat tools (search, canvas, voice, agent, research, study) work in project chats.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11473015-retrieval-augmented-generation-rag-for-projects](https://support.claude.com/en/articles/11473015-retrieval-augmented-generation-rag-for-projects): Retrieval projects stay compatible with web search, extended thinking and research. [reviewed 2026-11-22] Plans: Paid plans. Apps: web, desktop, ios, android.
  - [https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude](https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude): Project files are available to Claude's computing environment while staying in context. [reviewed 2026-11-22] Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10169521-projects-in-chatgpt](https://help.openai.com/en/articles/10169521-projects-in-chatgpt): Canvas, image generation, voice, web search, apps, and on paid plans agent and deep research work in projects; study mode does not. [reviewed 2026-11-22] Plans: Paid for agent and deep research. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/definition.md line 44 (one chat surface that works with project context, tools, connectors)). Project chats can use the same tools as other chats, each gated by plan and model; unavailable ones say why.

**With different models, providers and the one subscription.** If the chosen model cannot use a tool, AGI answers that one message with the Auto model and says so (docs/product/definition.md around line 364). Local mode offers only on-device tools.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web: connectors, plugins and skills in project chats Partial; per-project default tools set in code (code execution, research, skill). Project chats open in Work by founder decision D-2026-09-10-03. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S23.17
- Comparison list ids: WP175
- Code: `apps/web/features/projects/lib/project-chat-defaults.ts:4`; `packages/contracts/cloud-contracts/src/projects.ts:20`

**Gap.** Ledger says default tools are missing on web, desktop and mobile while the contract has chatDefaults; this needs reconciling. Not all tools confirmed in projects.

**Acceptance criteria**

1. In a project chat, ask for a web search and a file task; each works or says why not.
2. Set a project default (such as research on); a new chat starts with it.
3. A model that cannot use the tool gets the stated Auto fallback.

**Verification: seen failing by a person.** 6-defects: project chats opened as Work sessions with red 'Search limit reached' rows on a plain question (marked unclear, not a confirmed bug).

## CAP-projects-17 Voice inside a project

Talk to the assistant using a project's instructions, files and recent chats.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Aug 7, 2026: upload files during a voice conversation and use voice inside Projects with recent chats, sources and instructions (rolling out). [reviewed 2026-11-22] Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity (ChatGPT only); docs/product/competitive-guidance.md section 5.7 and voice item 125). A voice session started in a project uses the project's instructions and sources.

**With different models, providers and the one subscription.** Only when the voice backend accepts the context; otherwise say so. Local voice uses only local project data.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and desktop built; mobile Missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: M229
- Code: `apps/web/app/api/voice/live/sessions/lib/live-voice-context.ts:28`

**Gap.** Mobile voice in a project missing.

**Acceptance criteria**

1. Start voice from a project; ask about a project file; the answer uses it.
2. Outside a project, voice does not know the project.

**Verification: not verified.** Not seen.

## CAP-projects-18 Project default model and chat defaults

A project sets the model or chat defaults new chats in it start with.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: partly**
  - [https://code.claude.com/docs/en/claude-projects.md](https://code.claude.com/docs/en/claude-projects.md): Project coordinator and thread model and effort can be set (beta). [reviewed 2026-11-22] Plans: Pro, Max, Ultra. Apps: web, desktop.
  - [https://support.claude.com/en/articles/15330088-set-a-default-model-for-your-organization](https://support.claude.com/en/articles/15330088-set-a-default-model-for-your-organization): New projects start on the organisation default; existing chat projects keep the model last picked there. [reviewed 2026-11-22] Plans: Enterprise. Apps: web.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: AGI has it; competitors only partly document it). A project can set a default model or the Auto choice for new chats; the user can override per chat.

**With different models, providers and the one subscription.** The default is a family slot from the model catalogue, never a literal ID in the project. If the model is not on the user's plan, the chat falls back to Auto with a notice.

**Current implementation, as this trace read it on 2026-11-24: built.** Web, desktop and VS Code built. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S23.16
- Comparison list ids: none matched; rows without an id: web row: Default model and chat defaults per project
- Code: `apps/web/features/projects/components/ProjectDefaultModelField.tsx:53`; `apps/extension-vscode/src/features/projects/projectActions.ts:156`; `packages/contracts/cloud-contracts/src/projects.ts:55`

**Gap.** Mobile, CLI and Chrome have no default.

**Acceptance criteria**

1. Set a default; a new chat starts on it.
2. Remove the model from the catalogue or plan; a new chat starts on Auto with a notice.

**Verification: not verified.** Not seen.

## CAP-projects-19 Duplicate, export and project templates

Copy a project, download it, or start from a template.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: no**
  - [https://support.claude.com/en/articles/17440474-move-from-standalone-claude-design-to-artifacts](https://support.claude.com/en/articles/17440474-move-from-standalone-claude-design-to-artifacts) (this address is not in the saved catalogue; treat as unverified): Only the standalone design tool's projects can be downloaded as a zip; no chat-project export appears in the catalogue. [reviewed 2026-11-22]
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (stated requirement; source: docs/product/competitive-guidance.md section 5.7 item 56 (project portability)). An owner can duplicate or export a project. Exports state what is included and leave other copies unchanged.

**With different models, providers and the one subscription.** Exports hold text and files, not model state. Local projects export on device.

**Current implementation, as this trace read it on 2026-11-24: built.** Web and desktop built (duplicate, export route, templates); mobile missing. Ledger S23.31 says export is n/a, which conflicts with the existing export route. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S23.29, S23.31
- Comparison list ids: none matched; rows without an id: web row: Duplicate or export a project; web row: Project templates when creating a project
- Code: `apps/web/app/api/projects/[id]/duplicate/route.ts:71`; `apps/web/app/api/projects/[id]/export/route.ts`; `apps/web/features/projects/data/project-templates.ts:1`

**Gap.** Ledger and code disagree; mobile has neither.

**Acceptance criteria**

1. Duplicate a project; the copy has the same instructions and files and separate chats.
2. Export a project; the file lists settings, instructions and files.

**Verification: not verified.** Not seen.

## CAP-projects-20 Import projects from another assistant

Bring another tool's projects and instructions into this one.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/import.md](https://learn.chatgpt.com/docs/import.md): Settings then Import brings instructions, settings, skills, plugins, projects and recent chats from Claude Code, Claude Cowork or Cursor, leaving the original unchanged. [reviewed 2026-11-22] Apps: desktop.

**AGI requirement** (inferred; source: competitor parity (Codex desktop app only); docs/product/competitive-guidance.md section 5.7 item 56). A user can import supported projects from other tools without changing the source.

**With different models, providers and the one subscription.** Imported text is stored as ordinary project data. Import is a local file read unless a service is named.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Desktop import dialog is Partial; no project import on other apps. Ledger S23.28 says missing on all. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S23.28
- Comparison list ids: DP2
- Code: `apps/web/features/settings/components/ImportMemoryDialog.tsx:333`

**Gap.** Dialog imports memory, not clearly projects.

**Acceptance criteria**

1. Import a supported project export; name, instructions and files arrive.
2. The source file is unchanged.

**Verification: not verified.** Not seen.

## CAP-projects-21 Coordinated project with parallel threads

One coordinating conversation that starts parallel worker threads and brings results together.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/claude-projects.md](https://code.claude.com/docs/en/claude-projects.md): A project is one coordinator conversation with parallel cloud threads, overview by thread state, suggested threads, auto mode and approvals; beta, gradual rollout and waitlist; one user, no sharing. [reviewed 2026-11-22] Plans: Pro, Max, Ultra (not Team or Enterprise). Apps: web, desktop, ios, android.
  - [https://support.claude.com/en/articles/9517075-what-are-projects](https://support.claude.com/en/articles/9517075-what-are-projects): The same beta described in the Claude help centre; existing projects migrate with an email notice. [reviewed 2026-11-22] Plans: Pro, Max, Ultra. Apps: web, desktop, cli.
- **Codex: no**
  - [https://learn.chatgpt.com/docs/app.md](https://learn.chatgpt.com/docs/app.md): Codex runs projects and long chats in parallel in one workspace, without a coordinator. [reviewed 2026-11-22] Apps: desktop.

**AGI requirement** (proposed; source: docs/product/competitive-guidance.md section 5.7 item 53 (evaluate before adding complexity)). Not yet required. Where offered later, one coordinator starts worker threads, shows blocked work and lets the user steer one thread.

**With different models, providers and the one subscription.** Each thread has its own model and cost under the one subscription; threads must not silently use another provider or leave Local mode.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI has background and coordinator code; web, desktop, mobile Missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S23.13, S23.36, S23.37, S23.38
- Comparison list ids: D77, M184, W160, W195, W311, W64
- Code: `apps/cli/src/background.rs:251`; `apps/cli/src/claude_parity.rs:140`; `apps/cli/src/lib.rs:1893`

**Gap.** No coordinator or thread overview on the chat apps.

**Acceptance criteria**

1. Ask for a multi-part job; the coordinator starts separate threads.
2. Open the overview; blocked threads show why.
3. Stop one thread; the others continue.

**Verification: not verified.** Not seen.

## CAP-projects-22 Local-folder projects and project instruction files

A project tied to a folder on the computer, using files such as AGENTS.md or CLAUDE.md as instructions.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://support.claude.com/en/articles/14116274-organize-your-tasks-with-projects-in-claude-cowork](https://support.claude.com/en/articles/14116274-organize-your-tasks-with-projects-in-claude-cowork): Cowork projects (Claude Cowork desktop) have their own instructions, scheduled tasks, context and memory, from a local folder or chat project. [reviewed 2026-11-22] Plans: Pro, Max, Ultra, Team, Enterprise. Apps: desktop.
  - [https://support.claude.com/en/articles/14553240-give-claude-context-with-claude-md](https://support.claude.com/en/articles/14553240-give-claude-context-with-claude-md) (this address is not in the saved catalogue; treat as unverified): CLAUDE.md is read from the home folder, repo root and subfolders at session start (Claude Code). [reviewed 2026-11-22] Apps: cli.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/projects.md](https://learn.chatgpt.com/docs/projects.md): The desktop Projects view includes local projects on folders; several folders with one primary that drives Git and AGENTS.md discovery; the CLI treats the start directory as the project. [reviewed 2026-11-22] Apps: desktop, cli.

**AGI requirement** (stated requirement; source: docs/product/definition.md lines 118-122 (host developer continuity and folder-aware discovery; Desktop must not merge Cloud and developer domains implicitly)). A project can be tied to a local folder on desktop, CLI and VS Code, with folder instruction files layered nearest-first. Folder content stays on the device.

**With different models, providers and the one subscription.** Folder content goes to a provider only after the usual approval; Local mode keeps it on device. Moving folder context into a Cloud chat is an explicit handoff with preview and consent.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI and VS Code built for folder association and AGENTS.md or CLAUDE.md; web and desktop chat projects have no local folder link; desktop multi-folder and primary folder Partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S23.18, S23.19
- Comparison list ids: CP91, DP81, DP82; rows without an id: web 'Start directory is the project' row
- Code: `apps/cli/src/project_registry.rs:218`; `apps/cli/src/compaction.rs:286`; `apps/extension-vscode/src/features/projects/activeProject.ts:30`; `packages/contracts/types/src/project-instructions.ts:1`

**Gap.** No folder-tied project in the desktop chat app; no multi-folder primary setting.

**Acceptance criteria**

1. Open a folder in the CLI; its AGENTS.md applies, nearest file winning.
2. Connect the same folder in VS Code; both show the same project.
3. No folder content reaches Cloud without the handoff consent.

**Verification: code inspected only.** Not seen by a person.

## CAP-projects-23 Project work tasks, scheduled routines and artifacts

Project pages that list autonomous tasks, scheduled runs and produced artifacts.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/14116274-organize-your-tasks-with-projects-in-claude-cowork](https://support.claude.com/en/articles/14116274-organize-your-tasks-with-projects-in-claude-cowork): Cowork projects have their own scheduled tasks. [reviewed 2026-11-22] Plans: Pro to Enterprise. Apps: desktop.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt](https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt): Tasks created in a project cannot access project files. [reviewed 2026-11-22] Apps: web.

**AGI requirement** (proposed; source: AGI has it; leaders only partly). A project lists its work tasks, schedules and artifacts, each opening from there.

**With different models, providers and the one subscription.** Scheduled runs count against the same subscription limits and name the model used.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, desktop built; mobile has work tab but no artifacts or routines; CLI, VS Code, Chrome missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S23.12, S23.14, S23.15
- Comparison list ids: none matched; rows without an id: mobile row: Project tabs beyond chats and files
- Code: `apps/web/features/projects/components/ProjectWorkPanel.tsx:55`; `apps/web/features/projects/components/ProjectArtifactsPanel.tsx:28`; `apps/web/features/schedules/components/SchedulesPage.tsx:326`

**Gap.** Phone-width tab row is clipped; mobile lacks artifacts and routines.

**Acceptance criteria**

1. Run a work task in a project; it is listed with its state.
2. An artifact made in a project chat opens from the project.
3. A scheduled routine is listed on the project.

**Verification: seen failing by a person.** 6-defects: Free-plan Work tab says to switch a chat to Work but nothing can be switched, and the project tab row clips the last tab at 390 px.

## CAP-projects-24 Plan limits for projects

How many projects and files each plan allows.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://claude.com/pricing](https://claude.com/pricing): Projects are capped at five on Free and unlimited when paid. [reviewed 2026-11-22] Plans: Free, Pro, Max, Ultra. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8555545-uploading-files-and-audio-to-chatgpt](https://help.openai.com/en/articles/8555545-uploading-files-and-audio-to-chatgpt): Files per project: Free 5, Go and Plus 25, Edu, Pro, Business, Enterprise 40. [reviewed 2026-11-22]

**AGI requirement** (stated requirement; source: docs/product/definition.md (one entitlement on every surface; plan table lists Projects per plan)). Project count and file limits come from one subscription catalogue, are identical on every app, and are shown to the user.

**With different models, providers and the one subscription.** Limits are about plan, not model or provider. In Local mode the project count has no server limit unless the owner decides otherwise.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web enforces from the catalogue; mobile file limit missing. The doc table says Free 1, Basic 5, Premium 25, but the catalogue says Free 5 and the rest unlimited. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: M182; rows without an id: web row: Free plan project limit; web row: Projects capped on Free, unlimited when paid
- Code: `packages/contracts/types/src/billing-catalog.ts:618`; `packages/contracts/types/src/suite-contracts.ts:502`; `apps/web/app/pricing/page.tsx:834`

**Gap.** Doc and code disagree; code wins by rank but the owner should confirm the numbers.

**Acceptance criteria**

1. On Free, the sixth project shows the Upgrade message.
2. The pricing page, upgrade card and in-app limit show the same count.
3. Web and mobile enforce the same limit.

**Verification: seen failing by a person.** 6-defects: the Basic card lists only 'Projects with no set limit' and omits other changes. Enforcement of the count was not seen.

## CAP-projects-25 Project spend tags and usage analytics

Enterprise admins tag projects with cost codes and report spend by tag or project.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/18251257-track-spend-by-cost-code-with-project-tags](https://support.claude.com/en/articles/18251257-track-spend-by-cost-code-with-project-tags): Owners define tags; editors set a value per project; spend can be grouped by tag with CSV export and an Admin API. [reviewed 2026-11-22] Plans: Enterprise (beta). Apps: web.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/10875114-workspace-analytics-for-chatgpt-enterprise-and-edu](https://help.openai.com/en/articles/10875114-workspace-analytics-for-chatgpt-enterprise-and-edu): Analytics has a Projects tab with per-project usage and CSV export. [reviewed 2026-11-22] Plans: Enterprise, Edu. Apps: web.

**AGI requirement** (proposed; source: competitor parity for business plans). Not required now. If offered, project usage is counted in the one usage ledger and shown to admins.

**With different models, providers and the one subscription.** Spend is by plan units, not by named provider.

**Current implementation, as this trace read it on 2026-11-24: not built.** Missing on web, CLI; no other apps. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: C15, W405, W459, W50, W54
- Code: none cited

**Gap.** No project tags or per-project spend report.

**Acceptance criteria**

1. Admin tags a project and sees its spend grouped by tag.
2. Export matches the on-screen totals.

**Verification: not verified.** Not built, so nothing to test.

## CAP-projects-26 Project data retention, deletion and compliance

Org-level controls for how long project data lives and what happens when a member leaves.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/10440198-configure-custom-data-retention-controls-for-enterprise-plans](https://support.claude.com/en/articles/10440198-configure-custom-data-retention-controls-for-enterprise-plans): Project retention overrides chat retention; opening or editing a project restarts the clock; expired data is permanently deleted. [reviewed 2026-11-22] Plans: Enterprise. Apps: web.
  - [https://support.claude.com/en/articles/12053672-what-happens-to-a-user-s-data-when-they-are-removed-from-a-team-or-enterprise-organization](https://support.claude.com/en/articles/12053672-what-happens-to-a-user-s-data-when-they-are-removed-from-a-team-or-enterprise-organization): Removed member's private projects become inaccessible. [reviewed 2026-11-22] Plans: Team, Enterprise. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10169521-projects-in-chatgpt](https://help.openai.com/en/articles/10169521-projects-in-chatgpt): Compliance API supports Isolate project and List Project Shared Users; personal shared projects train only if all contributors opt in. [reviewed 2026-11-22] Plans: Personal; Enterprise. Apps: web.

**AGI requirement** (inferred; source: competitor parity; AGENTS.md section 9). Project data follows the retention and deletion rules in docs/security and docs/compliance, with a stated effect when a member leaves.

**With different models, providers and the one subscription.** No model dependence; training on shared project content is off unless every member agrees.

**Current implementation, as this trace read it on 2026-11-24: unknown.** Not examined in code for this page. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: `apps/web/lib/server/project-deletion.ts:23`

**Gap.** Not assessed.

**Acceptance criteria**

1. Remove a member; their private projects follow the stated rule.
2. Project retention setting is visible to the admin.

**Verification: not verified.** Not examined.

## Unresolved product choices

Decisions this topic needs from the owner. Nothing here has been decided.

- Free plan project count: docs/product/definition.md says 1 on Free, 5 on Basic, 25 on Premium; the billing catalogue says 5 on Free and unlimited on every paid plan. Which is intended?
- Should a chat started inside a project open as an ordinary chat (as both leaders do) or keep landing in AGI Work (decision D-2026-09-10-03, revisit trigger is the owner's answer; a web tester flagged it again)?
- Match Claude Code Projects (one coordinator with parallel threads, beta, selected paid users only), or wait? Only one competitor documents it.
- Allow share-by-link to anyone signed in, outside a workspace, on individual plans (ChatGPT does; Claude does not).
- Allow sharing on Free, or keep sharing to workspaces only.
- Should deleting a project keep its chats (ledger) or remove them (ChatGPT) and should it go to Recently deleted first.
- Match Claude's Cowork-style folder-tied projects and ChatGPT's multi-folder primary folder in the desktop chat app, or keep folder projects to Desktop Code, CLI and VS Code.
- Project spend tags and cost-code reports: Claude Enterprise only and in beta; build or skip.
- Whether Local-mode projects may ever be shared or synced, and whether free Local projects have a count limit.
- Project import from other tools: only Codex documents it; decide scope.

## Could not establish

- Whether AGI's Local-mode projects (device-only) work on desktop; desktop shows the hosted web app, and I found a local project store only on mobile.
- How project retrieval ranks and when it switches on; I read file names, not the code.
- Whether file upload works once the local database has migration 0419; the only person-run test hit the missing column.
- Anything about mobile, desktop, CLI, VS Code and Chrome projects as seen by a person; only web scorecard W-11 and the web defect list were found for projects.
- Conflicts between the ledger (area 23) and comparison CSVs: S23.26, S23.27 and S23.31 say n/a while web rows say Same or Better; mobile project memory is Missing in the ledger and Same in comparison rows; default tools S23.17 says missing while the contract has chat defaults.
- Whether Claude documents save-answer-to-project, leave-with-copy, voice in projects or project export for chat projects; the catalogue shows none.
- ChatGPT project default model, retrieval for large project knowledge, and per-plan collaborator caps beyond the lines cited.
- The catalogue lines for Claude individual-plan project sharing: Claude's pages show sharing only for Team and Enterprise.
- Claude help page 10185728 says both that Free has projects and that project instructions are paid-only; I could not resolve which is current.
- The learn.chatgpt.com docs are the Codex documentation; where they describe ChatGPT web projects I labelled ChatGPT and where they describe folders or CLI I labelled Codex, but the page mixes both.
