# Competitor Capability And Session Architecture Research

**Status:** Dated research snapshot  
**Owner:** Platform  
**Research cutoff:** 2026-07-15 (America/Chicago)  
**Repository snapshot:** `/Users/siddhartha/Desktop/agiworkforce`, inspected on 2026-07-15  
**Scope:** Current public product behavior and user-visible architecture for ChatGPT/Codex, Claude/Claude Code/Cowork, selected Gemini patterns, and their implications for AGI Workforce

This document is research, not current product truth. Current AGI decisions remain in
`docs/current/`, `docs/decisions/CURRENT_DECISIONS.md`, and `docs/agent-context/`.
Repository findings below describe the inspected source snapshot and must be reproduced
before being treated as an open defect after later code changes.

## 1. Evidence And Claim Policy

### 1.1 Evidence labels

| Label                    | Meaning                                                                                       | May establish product truth?                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **O — Official**         | Current vendor documentation, help center, release notes, or product manual                   | Yes, for the documented public contract and only as of the cutoff date         |
| **R — Repository**       | AGI production source, schema, route, configuration, or mounted UI inspected directly         | Yes, for the inspected source snapshot                                         |
| **UI — Observed UI**     | A dated screenshot or live product observation with build, plan, region, and platform context | Only for that observed rollout; not automatically a stable cross-plan contract |
| **C — Community**        | Reddit, X, GitHub discussion, video, press, or practitioner report                            | No; discovery and UX signal only                                               |
| **I — Inference**        | Architectural conclusion derived from multiple official behaviors or repository paths         | No; label and validate before implementation                                   |
| **? — Unable to verify** | Evidence is missing, conflicting, inaccessible, or insufficiently scoped                      | No                                                                             |

### 1.2 Source hierarchy

For competitor behavior, use this order:

1. current official product documentation;
2. current official release notes or changelog;
3. reproducible UI observation with build, plan, region, and date;
4. official account announcement that links to a durable product source;
5. community reports and practitioner commentary;
6. inference.

For AGI behavior, implementation is primary. Current decision documents constrain intent,
but a document, test fixture, dead component, static mock, feature flag, or build success is
not proof that a user-reachable end-to-end capability works.

### 1.3 Explicit non-claims

- Public competitor documentation does not reveal private repository layout, internal
  services, provider-routing policy, database topology, or shared-package graph.
- Visual similarity does not prove shared storage or a shared runtime.
- A control visible in one rollout does not prove availability on every plan, platform,
  region, or application version.
- The model names, model IDs, pricing, shortcuts, and unreleased features in community
  posts must not be copied into code or the model registry without current official proof.
- This research does not authorize copying proprietary code, protected design assets,
  wording, or branding.

## 2. Executive Conclusions

1. **A unified shell is not a universal conversation database.** Leading products place
   Chat, knowledge work, developer work, remote control, and browser work under one account
   shell while retaining different execution, persistence, permission, and sync domains.
2. **The canonical abstraction is a discriminated session, not a generic conversation.**
   Cloud chat, cloud work, local developer work, cloud developer work, browser tasks,
   device-local chat, and remote projections need explicit types and policies.
3. **Remote control is event and command projection, not chat synchronization.** The host
   remains the execution authority; the remote client renders sequenced events and sends
   idempotent steer, approve, stop, and resume commands.
4. **Managed background work and host-dependent remote control are different guarantees.**
   A managed run can continue with the laptop off. A local remote session pauses or becomes
   unavailable when its host sleeps or disconnects.
5. **Modern agent UI is an activity surface.** It must represent plans, steps, tools,
   subagents, approvals, sources, terminal output, files, diffs, tests, artifacts, usage,
   degraded states, and validation—not only text deltas.
6. **Research is a durable review workflow.** Search, deep research, and browser/computer
   action are distinct policies even when an Auto router chooses among them.
7. **Plugins are workflow packages, not a synonym for tools.** A package can combine
   instructions or skills, connectors/apps, tool servers, templates, UI resources,
   subagents/hooks, and policy metadata, with surface-specific eligibility.
8. **AGI's locked trust boundaries are coherent.** The problem is incomplete encoding and
   enforcement, not the product direction. Sharing must be deliberate by entity and
   surface rather than inferred from a common navigation shell.
9. **Capability honesty is part of the architecture.** A visible but disconnected control,
   fabricated success ID, dead screen, or route without a worker is a production defect,
   not harmless scaffolding.

## 3. Officially Documented Competitor Patterns

The tables in this section use official sources. They describe public contracts, not
competitor internals.

### 3.1 OpenAI application family

| Capability or surface      | Officially documented behavior relevant to AGI                                                                                                                                                                                                                                                                                                            | Evidence                                                                                                                                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chat                       | Managed conversation history, projects, files, memory, search, voice, and normal cloud continuity                                                                                                                                                                                                                                                         | **O** — [ChatGPT release notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes), [Projects](https://help.openai.com/en/articles/10169521-projects-in-chatgpt)                            |
| Search                     | Fast current-information retrieval with visible citations/sources                                                                                                                                                                                                                                                                                         | **O** — [ChatGPT Search](https://help.openai.com/en/articles/9237897)                                                                                                                                       |
| Deep research              | Source selection, proposed plan, progress/activity, user steering, structured cited report, sources view, and export                                                                                                                                                                                                                                      | **O** — [Deep research](https://help.openai.com/en/articles/10500283-deep-research)                                                                                                                         |
| Agent/Work-style execution | Browser interaction, code/data analysis, files, connected apps, confirmation pauses, and workspace policy                                                                                                                                                                                                                                                 | **O** — [ChatGPT agent](https://help.openai.com/en/articles/11752874-chatgpt-agent/), [ChatGPT Work and Codex](https://help.openai.com/en/articles/20001275/)                                               |
| Projects and Library       | Project chats/files/instructions/memory plus a separate file catalog and search/filter lifecycle                                                                                                                                                                                                                                                          | **O** — [Projects](https://help.openai.com/en/articles/10169521-projects-in-chatgpt), [Library](https://help.openai.com/en/articles/20001052/library)                                                       |
| Scheduled tasks            | Create, edit, pause, resume, delete, and inspect scheduled task history on supported cloud surfaces                                                                                                                                                                                                                                                       | **O** — [Tasks in ChatGPT](https://help.openai.com/en/articles/10291617-tasks-in-chatgpt)                                                                                                                   |
| Apps/plugins               | External data and actions, OAuth/scopes, search/research/sync/write patterns, installation and administrator policy                                                                                                                                                                                                                                       | **O** — [Apps in ChatGPT](https://help.openai.com/en/articles/11487775-apps-in-chatgpt), [Plugins in Codex](https://help.openai.com/en/articles/20001256)                                                   |
| Current model family       | GPT-5.6 Sol, Terra, and Luna are official API models; all three accept text and image input and expose Responses-API tools. Sol is the flagship, Terra balances intelligence and cost, and Luna targets high-volume cost-sensitive work. Availability in documentation is not proof that a particular account, endpoint, or AGI harness path is admitted. | **O** — [OpenAI models](https://developers.openai.com/api/docs/models), [GPT-5.6 launch](https://openai.com/index/gpt-5-6/)                                                                                 |
| Unified desktop shell      | The July 2026 desktop app combines Chat, Work, and Codex. Chat conversations sync with supported ChatGPT cloud surfaces, while Codex and Work retain distinct execution and persistence limitations. The former desktop app remains separately available as ChatGPT Classic during migration.                                                             | **O** — [ChatGPT release notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes), [desktop migration](https://help.openai.com/en/articles/20001276-moving-to-the-new-chatgpt-desktop-app) |
| Work and global search     | Work is a durable agentic knowledge-work surface with progress, steering, approvals, generated deliverables, Sites, and scheduled tasks. Search spans chats, projects, images, and documents with content-type filters on supported web/mobile rollouts.                                                                                                  | **O** — [ChatGPT release notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes), [ChatGPT Work and Codex](https://help.openai.com/en/articles/20001275/)                                 |
| Codex local developer work | Repository context, file changes, commands/tests, diffs, approvals, sandboxing, MCP, skills/plugins, and resumable tasks                                                                                                                                                                                                                                  | **O** — [Codex documentation](https://learn.chatgpt.com/docs/)                                                                                                                                              |
| Codex IDE                  | IDE-native context, task interaction, diffs, approvals, local/cloud task concepts, and shared developer semantics                                                                                                                                                                                                                                         | **O** — [Codex documentation](https://learn.chatgpt.com/docs/)                                                                                                                                              |
| Codex remote projection    | Mobile can start or continue work on a paired macOS/Windows host, inspect progress, and approve actions. Host/device pairing is authenticated and one-to-one; this is a remote projection, not cloud migration of the local runtime.                                                                                                                      | **O** — [ChatGPT release notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes), [Codex documentation](https://learn.chatgpt.com/docs/)                                                  |

Architectural interpretation (**I**): OpenAI's shared product shell should be copied only as
an information architecture pattern. It is not evidence that Chat, Work, Codex, local files,
cloud tasks, and remote tasks share one store or one execution engine.

### 3.2 Anthropic application family

| Capability or surface        | Officially documented behavior relevant to AGI                                                                                                                                                                                                                                                                                                                   | Evidence                                                                                                                                                                                                                                                                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Chat                  | Managed chats/projects, web search, Research, files/images, artifacts, memory, previous-chat search, and voice on supported surfaces                                                                                                                                                                                                                             | **O** — [Claude release notes](https://support.claude.com/en/articles/12138966-release-notes), [Research](https://support.claude.com/en/articles/11088861-use-research-on-claude), [chat search and memory](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context) |
| Memory                       | Standalone/project scopes, a reviewable summary, pause/reset, import/export, and incognito behavior                                                                                                                                                                                                                                                              | **O** — [chat search and memory](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context), [memory import/export](https://support.claude.com/en/articles/12123587-import-and-export-your-memory-from-claude)                                                         |
| Cowork remote sessions       | Account-saved background sessions and files in a managed per-session environment across supported web/desktop/mobile surfaces                                                                                                                                                                                                                                    | **O** — [Cowork across surfaces](https://support.claude.com/en/articles/15520349-use-claude-cowork-on-web-desktop-and-mobile), [Cowork architecture](https://support.claude.com/en/articles/14479288-claude-cowork-architecture-overview)                                                                                     |
| Cowork device access         | Authenticated desktop bridge/local isolation, scoped local folder permissions, server-side connector handling, and controlled egress                                                                                                                                                                                                                             | **O** — [Cowork architecture](https://support.claude.com/en/articles/14479288-claude-cowork-architecture-overview), [computer use](https://support.claude.com/en/articles/14128542-let-claude-use-your-computer-in-cowork)                                                                                                    |
| Cowork files/artifacts       | Generated files, previews, continued editing, live-artifact versions/restore, sharing policy, and viewer-specific connector authorization                                                                                                                                                                                                                        | **O** — [Live artifacts](https://support.claude.com/en/articles/14729249-use-live-artifacts-in-claude-cowork)                                                                                                                                                                                                                 |
| Cowork schedules             | Cadence, model/folder/resources, run history, notifications, manual run, pause/resume/delete, and explicit host dependency for local resources                                                                                                                                                                                                                   | **O** — [Cowork schedules](https://support.claude.com/en/articles/13854387-schedule-recurring-tasks-in-claude-cowork)                                                                                                                                                                                                         |
| Claude Code local            | Local repository agent loop, plans, changes, commands/tests, permissions, MCP, skills/plugins/hooks/subagents, resume/fork, model/effort, and remote control                                                                                                                                                                                                     | **O** — [features overview](https://code.claude.com/docs/en/features-overview), [platforms](https://code.claude.com/docs/en/platforms)                                                                                                                                                                                        |
| Claude Code desktop          | Parallel sessions and project/environment-aware workbench concepts with chat, plan, diff, terminal, browser, file, task, and subagent views where supported                                                                                                                                                                                                      | **O** — [Desktop Code](https://code.claude.com/docs/en/desktop)                                                                                                                                                                                                                                                               |
| Claude Code IDE              | Sessions, selected context, file/line mentions, diffs, permission mode, plan review, context/usage, history, and local/remote task distinction                                                                                                                                                                                                                   | **O** — [IDE integrations](https://code.claude.com/docs/en/ide-integrations)                                                                                                                                                                                                                                                  |
| Claude Code cloud            | Managed isolated execution that can continue after the local client closes                                                                                                                                                                                                                                                                                       | **O** — [Claude Code on the web](https://code.claude.com/docs/en/claude-code-on-the-web)                                                                                                                                                                                                                                      |
| Claude Code Remote Control   | Outbound authenticated host connection, short-lived credentials, same-session transcript/activity/questions/approvals, host liveness and reconnect, no cloud migration                                                                                                                                                                                           | **O** — [Remote Control](https://code.claude.com/docs/en/remote-control)                                                                                                                                                                                                                                                      |
| Claude Code fullscreen TUI   | `/tui fullscreen` is an official opt-in research-preview renderer with alternate-screen virtual rendering, mouse support, transcript review/search, reduced flicker, and stable memory use in long conversations. It requires v2.1.89 or later; the command was documented in the v2.1.110 changelog, not first established by the user-supplied v2.1.207 claim. | **O** — [Fullscreen rendering](https://code.claude.com/docs/en/fullscreen), [Claude Code changelog](https://code.claude.com/docs/en/changelog)                                                                                                                                                                                |
| Claude model/effort controls | Effort is model-specific policy, not a generic token slider. Supported levels and defaults vary by model and can be changed through `/effort`, `/model`, CLI flags, environment, settings, or skill/subagent metadata.                                                                                                                                           | **O** — [Model configuration](https://code.claude.com/docs/en/model-config)                                                                                                                                                                                                                                                   |
| Current Claude API roster    | Current official families include Fable 5, Opus 4.8, Sonnet 5, and Haiku 4.5 with distinct IDs, pricing, context, reasoning behavior, and API compatibility. New-family availability must remain separate from AGI harness admission.                                                                                                                            | **O** — [Claude model selection](https://platform.claude.com/docs/en/about-claude/models/choosing-a-model), [model IDs and versioning](https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions)                                                                                                        |
| Claude in Chrome             | Side-panel context/action workflows, tab groups, screenshots/selection, DOM/console/network context, permissions, background work, and admin controls                                                                                                                                                                                                            | **O** — [Claude in Chrome](https://support.claude.com/en/articles/12012173-get-started-with-claude-in-chrome), [permissions](https://support.claude.com/en/articles/12902446-claude-in-chrome-permissions-guide), [admin controls](https://support.claude.com/en/articles/13065128-claude-in-chrome-admin-controls)           |
| Customize/plugins            | Directory concepts for skills, connectors, plugins, installation/auth/status, compatibility, and organization policy                                                                                                                                                                                                                                             | **O** — [Customize directory](https://support.claude.com/en/articles/14328846-browse-skills-connectors-and-plugins-in-one-directory), [plugins](https://support.claude.com/en/articles/13837440-use-plugins-in-claude)                                                                                                        |
| Interactive connectors       | Inline or full-screen interactive output with user controls and action-specific confirmation                                                                                                                                                                                                                                                                     | **O** — [Interactive connectors](https://support.claude.com/en/articles/13454812-use-interactive-connectors-in-claude)                                                                                                                                                                                                        |

### 3.3 Additional Gemini pattern

Gemini/Spark is useful as a third data point, not as the primary parity target. Official
sources document a named task-agent experience with connected apps, remote execution,
schedules, skills, and local-device access where supported. The durable lesson is that
notifications should be derived from run state, user presence, and required action rather
than emitted for every event.

- **O:** [Gemini updates](https://support.google.com/gemini/answer/17171264)
- **O:** [Spark tasks](https://support.google.com/gemini/answer/17094507)
- **O:** [Connected apps](https://support.google.com/gemini/answer/13695044)

## 4. Canonical Session And Execution Model

### 4.1 Competitor-visible state domains

| Experience                        | Execution authority                                  | Persistence class                                                | Host needed after start?               | Remote/sync interpretation                                     |
| --------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------- |
| Managed consumer chat             | Vendor cloud                                         | Account conversation/project                                     | No                                     | Normal supported cloud sync                                    |
| Managed knowledge-work run        | Vendor cloud sandbox/worker                          | Durable cloud run, files, artifacts                              | No                                     | Cloud continuation across supported clients                    |
| Desktop work with local resources | User device plus app services                        | Device/session scoped                                            | Yes for device resources               | Device access, not generic cloud sync                          |
| Local developer session           | User host                                            | Local repository/session journal                                 | Yes                                    | Local CLI/IDE/desktop clients may share one engine             |
| Managed developer task            | Cloud isolated environment                           | Cloud developer task                                             | No                                     | Monitor/steer from supported cloud clients                     |
| Remote local developer projection | User host plus relay/control plane                   | Local authoritative run plus permitted projected metadata/events | Yes                                    | Event projection and commands, not repository/chat replication |
| Browser task                      | Browser profile/extension plus allowed cloud service | Browser/task scoped                                              | Browser required for signed-in context | Separate origin/tab/permission domain                          |
| Device-local consumer chat        | User device                                          | Device-local store                                               | Yes for continued local inference      | No implicit account-cloud synchronization                      |

### 4.2 Required AGI session discriminants

The canonical contract should include at least:

- `cloud_chat`
- `cloud_work`
- `managed_sandbox`
- `desktop_local_chat`
- `mobile_local_chat`
- `desktop_byok_chat`
- `developer_local`
- `developer_cloud`
- `browser_task`
- `remote_projection`
- `handoff_snapshot`

Every session must carry:

- execution location and authority;
- data/storage scope and sync policy;
- trust boundary;
- origin/client surface;
- account, organization, workspace, and project scope where applicable;
- host requirement, host identity, and liveness where applicable;
- capability and permission-policy snapshot/version;
- retention/deletion policy;
- handoff eligibility and provenance.

### 4.3 Cloud work and remote local control must stay separate

```text
Managed run
  account client -> durable cloud run -> managed executor/sandbox
  continues without a user host

Remote local run
  CLI/Desktop host -> versioned event journal -> relay/control plane -> Mobile/Web view
  Mobile/Web command -> idempotent receipt -> authoritative local host
  pauses or becomes unavailable when the host is offline
```

Do not silently migrate a disconnected local task to Managed Cloud. Do not represent a
remote developer task as a consumer chat. Do not synchronize the repository, local database,
or raw filesystem merely to render a remote timeline.

## 5. Locked AGI Cross-Surface Architecture

This is the target boundary derived from current AGI decisions, not a competitor claim.

| Surface and mode         | Session/data domain                              | Allowed sharing                                                                                                               | Prohibited implicit behavior                             |
| ------------------------ | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Web                      | Managed cloud only                               | Cloud chats, projects, cloud memory, account settings, artifacts, managed Work/Research with Mobile Cloud and Desktop Managed | BYOK or local execution                                  |
| Desktop Managed          | Managed cloud                                    | Same supported cloud entities as Web/Mobile Cloud                                                                             | Reading Desktop Local/BYOK data without reviewed handoff |
| Desktop Local            | Device-local chat/work and local tools           | Local runtime adapters and explicit export/fork                                                                               | Automatic cloud or BYOK egress                           |
| Desktop BYOK             | Explicit user-provider boundary                  | Reviewed fork from Local; visible provider and cost/retention disclosure                                                      | Hidden Local-to-provider mode flip                       |
| Mobile Cloud             | Managed cloud                                    | Same supported cloud entities as Web/Desktop Managed                                                                          | BYOK                                                     |
| Mobile Local             | Device-local chat/memory/files                   | Explicit reviewed transfer only                                                                                               | Automatic consumer-cloud sync                            |
| CLI                      | Local developer session host/client              | Shared engine, configuration, tools, and local sessions with VS Code; possible Desktop host/view                              | Consumer chat sync                                       |
| VS Code                  | Thin client over local developer engine          | Same local developer session as CLI in the trusted workspace                                                                  | Separate provider loop or consumer chat sync             |
| Chrome                   | Browser-local conversations plus Managed actions | Explicit selected/redacted context handoff                                                                                    | Joining consumer chat history or CLI/VS Code sessions    |
| Managed artifact sandbox | Per-tenant/per-session cloud execution           | Authorized Web/Desktop/Mobile clients and artifact lifecycle                                                                  | General shared filesystem or leaked connector secrets    |

### 5.1 Desktop deployment decision

Keep one Tauri desktop application. Isolate Local, BYOK, and Managed through runtime
adapters, stores, credential domains, privileged processes, and visible execution labels.
Separate binaries would duplicate signing, notarization, update channels, accessibility,
diagnostics, shell UI, and release operations without creating the required trust boundary.

Recommended process responsibilities:

- unprivileged shared UI shell;
- managed-cloud API adapter;
- local runtime daemon/sidecar;
- BYOK provider adapter isolated from managed credentials;
- privileged tool/sandbox broker;
- secure credential store;
- explicit handoff service producing a reviewed payload rather than store replication.

## 6. Repository Gap Map At The Audit Snapshot

### 6.1 Direct verdict

**R:** AGI did not yet present one coherent Chat/Work/Code harness in the inspected snapshot.
It contained substantial individual implementations, parallel event and contract dialects,
dead alternate UIs, disconnected backend skeletons, and visible capability facades. The
strongest shared seam was CLI to VS Code through the CLI app-server. The weakest
parity-defining seams were Remote, durable Managed Work/Research, schedules, a shared agent
event protocol, and server-authoritative tool/plugin policy.

The correct response is not to share everything. Share contracts, engines, and visual
primitives where semantics match. Preserve intentionally different stores, credentials,
permission authorities, and execution adapters.

### 6.2 Immediate defects found in source

These entries are evidence from the inspected snapshot. Reproduce them against current
source before remediation because parallel work may have changed the cited paths.

| Severity    | Finding                                                                                                                                                 | Repository evidence at snapshot                                                                                                                                         | Required outcome                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| P0 security | E2B sandbox resumption was keyed by client-supplied conversation identity without a tenant/user-qualified session key                                   | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts`; `apps/web/lib/e2b/session-store.ts`; `apps/web/lib/e2b/runtime.ts`                                 | Prove conversation ownership; key and verify sandbox metadata by tenant, user, and conversation              |
| P0 security | Custom MCP authenticated-handle cache used `short_id`, which is only unique per user                                                                    | `apps/web/db/neon/0052_user_custom_connectors.sql`; `apps/web/lib/user-connector-tools.ts`                                                                              | Key cache by immutable connector row plus tenant/user; test forced cross-user collisions                     |
| P0 honesty  | Active Web AGI Work selector did not enter submit metadata or attach the selected project                                                               | `apps/web/features/chat/pages/WebChatPage.tsx`; `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`                                                        | Hide/label preview or implement a real `cloud_work` run path                                                 |
| P0 honesty  | CLI Remote commands instructed users to run a nonexistent bridge command                                                                                | `apps/cli/src/claude_parity.rs`; `crates/agiworkforce-command-registry/src/lib.rs`                                                                                      | Remove the command or show an explicit unavailable state until a real outbound host adapter exists           |
| P0 honesty  | Mobile exposed AGI Code with an empty session data source and no send path                                                                              | `apps/mobile/src/features/settings/capabilities/index.tsx`; `apps/mobile/src/features/code-sessions/data.ts`; `apps/mobile/app/(app)/code/[id].tsx`                     | Hide until Remote exists or render an honest disconnected/unavailable beta state                             |
| P0 data     | Web schedule run routes referenced a different table and column vocabulary from the canonical migration and had no executor                             | `apps/web/db/neon/0009_scheduling.sql`; `apps/web/app/api/schedules/[id]/runs/route.ts`                                                                                 | One schema, authenticated durable runner, run journal, cancellation, and reconciliation                      |
| P0 data     | Desktop schedules were native in-memory state and could be replaced from frontend fallback state                                                        | `apps/desktop/src-tauri/src/sys/commands/scheduler.rs`; `apps/desktop/src-tauri/src/lib.rs`; `apps/desktop/src/stores/schedulerStore.ts`                                | Persist canonical local schedules in SQLite and hydrate before execution                                     |
| P0 data     | Mounted worker-control routes depended on tables with no repository migration and had no producer or worker client                                      | `services/api-gateway/src/worker/registration.ts`; `services/api-gateway/src/worker/assignment.ts`; `services/api-gateway/src/index.ts`                                 | Feature-gate/unmount or complete schema, producer, worker adapter, journal, cancellation, and reconciliation |
| P0 honesty  | Web artifact share caught a failed/incompatible publish call and returned a generated local success ID                                                  | `apps/web/features/chat/stores/artifacts-store.ts`; `apps/web/app/api/artifacts/publish/route.ts`; `apps/web/lib/artifact-publisher.ts`                                 | Disable share or implement one typed publication contract; never fabricate success                           |
| P0 honesty  | Shipping Desktop Research toggle was local component state; richer Research implementations were unmounted and source capability claims were incomplete | `packages/unified-chat/src/components/ChatInput.tsx`; `packages/unified-chat/src/hooks/useChat.ts`; `apps/desktop/src/features/research`; Desktop Rust research modules | Remove the control until a typed request is forwarded; converge on one `ResearchRun` implementation          |

### 6.3 Foundation capability status

| Foundation                 | Snapshot status                | Specific architectural gap                                                                                                                       |
| -------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Session taxonomy           | Partial and semantically wrong | `DeveloperSessionSurface` grouped CLI, VS Code, and Chrome even though Chrome does not share the developer engine or store                       |
| Execution-location UX      | Partial                        | No one model represented Managed, Local, BYOK provider, connected host, browser scope, and offline/degraded state across all relevant views      |
| Agent event protocol       | Multiple dialects              | Rich Rust protocol, smaller CLI JSONL, Web SSE, Tauri events, extension messaging, signaling, and mobile view models did not converge            |
| Capability registry        | Partial                        | Flat surface flags did not encode plan, host, execution location, model/tool support, action risk, policy, or degraded reason                    |
| Remote host protocol       | Absent end to end              | No CLI host registration, durable replay, command receipt, capability negotiation, revocation, reconnect cursor, or Mobile/Web session inventory |
| Local/cloud isolation      | Correct rule, uneven contracts | Generic cross-device language blurred cloud sync and Remote projection                                                                           |
| Explicit handoff           | Useful partial foundation      | Context selection/redaction/preview existed in places, but no canonical journaled cross-surface handoff service                                  |
| Tool manifest and approval | Fragmented                     | No single authoritative schema for execution location, auth, scopes, cost, retry/cancel/idempotency, progress, audit, and renderer               |
| Managed sandbox            | Partial with security gap      | E2B adapter was not a tenant-bound `ComputeSession` or durable `WorkRun` lifecycle                                                               |
| Provenance/citations       | Partial                        | Message-specific source cards did not form one provenance model for web, apps, files, screenshots, tool results, and artifacts                   |
| Shared developer engine    | Partial; strongest seam        | Main VS Code chat used CLI app-server, but several IDE commands/completions still used direct provider clients                                   |
| Durability/idempotency     | Missing system-wide            | No durable Work/Research/Remote journal; schedules and worker skeletons did not provide a complete lifecycle                                     |

### 6.4 Domain-specific gaps

#### Remote

The inspected path was:

1. VS Code spawned `agi app-server` over stdio.
2. The app-server supported local thread and turn operations.
3. Its live event dialect was smaller than the generated Rust protocol.
4. A separate Desktop companion/signaling path handled pairing and limited control data.
5. No production adapter connected developer-session events to a durable remote control
   plane, and Mobile Code had no live session source.

Required design:

```text
CLI or Desktop developer host
  -> canonical versioned Rust agent event envelope
  -> outbound authenticated Remote adapter
  -> durable command receipts/event journal plus live relay
  -> Mobile/Web projection client
  <- idempotent steer/approve/stop command and acknowledgement
```

Minimum fields include protocol version, account/device/host/session/run/event identity,
sequence and replay cursor, connection generation, execution/trust scope, runtime-validated
payload, idempotency key, command acknowledgement/result, liveness, host capability/version,
short-lived scoped credentials, revocation, redaction policy, and expiry.

#### Managed Work and sandbox

The Web Work mode was UI state rather than a durable domain. E2B code/file tools were useful
mechanics but did not provide a Work run, durable workspace, plan, journal, checkpoint,
resource/cost policy, scoped credentials, retention/deletion, or background continuation.

Required separation:

- `ManagedRun`: queue-backed, tenant-isolated, durable, checkpointed, metered,
  cancellable, and host-independent;
- `LocalHostRun`: host-required, locally journaled, remotely projectable with consent;
- `ComputeSession`: sandbox allocation, resource/egress policy, scoped credentials,
  lifecycle, and deletion—not the Work domain itself.

#### Research

- Web had a real bounded retrieval loop but no durable `ResearchRun`, approved source policy,
  plan revisions, resume, report library, export/version/share, or interruption lifecycle.
- Desktop's shipping toggle did not forward Research, and alternate Research UIs were dead.
- Mobile Research chips were unmounted; their dormant Cloud request did not forward a
  Research mode.

A canonical `ResearchRun` needs source allow/deny/prioritize policy, uploaded/app sources,
plan revisions and approval, query/subtask graph, parallel retrieval state, source snapshots,
provenance and citation spans, activity events, report sections, interruption/resume, export,
cost, retention, and deletion.

#### Tools, skills, plugins, and MCP

- Web had meaningful MCP/tool-loop and approval-resume mechanics, but client-authored skill
  injection and static plugin data were not an authoritative install/policy system.
- Desktop exposed skill/plugin controls that did not consistently govern what the runtime
  loaded; multiple catalogs scanned incompatible paths, and part of the UI invoked another
  product's CLI rather than an AGI-owned plugin runtime.
- CLI was the strongest local MCP/tool/skill host, but transport and app-server capability
  seams remained incomplete.
- Chrome could discover WebMCP tools and show a picker, while the managed chat path reduced
  structured tool/search/generated-file events to text.

Clients may request capabilities; Web servers and privileged native runtimes must authorize
them. Installation does not imply that every bundled feature can run on every surface.

#### Memory and personalization

The snapshot contained multiple real memory stores and settings UIs, but several settings
did not feed the runtime that generated responses. Define a `PersonalContext` interface with
explicit scopes:

- `account_cloud`
- `project_cloud`
- `device_local`
- `developer_workspace`
- `browser_local`
- `session_override`

Every runtime should have one documented context-building seam, and each settings surface
must read/write the adapter consumed by that seam.

#### Artifacts

Model logical artifact, immutable version, source/generated files, renderer policy,
executable runtime, preview, publication/share, export, provenance, retention, and deletion
as separate lifecycle concepts. Web iframe, Tauri webview, and React Native preview remain
platform adapters. The renderer must fail closed when its isolated origin is unavailable.

#### Schedules

Share a definition and run contract; do not force a single executor across Managed Cloud,
local host, and browser. Every schedule needs execution location, required host/resources,
cadence/time zone or trigger, project/workspace, model/runtime, tool/skill grants, permission
policy, cost ceiling, timeout/retry/idempotency, notification policy, run history, and a
visible blocked/degraded reason.

#### Model and effort selection

Use model-level registry metadata rather than provider-name conditionals. One canonical
effort vocabulary must code-generate to TypeScript and Rust, with adapters mapping only
supported values to provider parameters. A control without a working callback or runtime
mapping must not render as enabled.

## 7. Target Shared Ownership

Avoid dozens of shallow packages. Deepen existing owners and generate cross-language wire
types where the boundary requires it.

```text
packages/types/src/
  sessions/
    taxonomy.ts
    execution-location.ts
    handoff.ts
    remote-projection.ts
  capabilities/
    registry.ts
    evaluator.ts
  agents/
    event-envelope.ts
  tools/
    manifest.ts
    approvals.ts
  research/
    run.ts
    provenance.ts
  work/
    run.ts
    compute-session.ts
  artifacts/
    artifact.ts
    version.ts
    publication.ts
  schedules/
    definition.ts
    run.ts
```

Recommended ownership:

- `packages/cloud-contracts`: runtime-validated cloud wire schemas and clients;
- `crates/agiworkforce-protocol`: canonical local agent protocol plus generated TS
  bindings;
- `crates/agiworkforce-agent-core`: one local developer execution engine;
- `crates/agiworkforce-app-server`: transports/session API adapters, not a second engine;
- `packages/mcp` and `crates/agiworkforce-mcp`: TS and Rust mechanics generated from one
  manifest/policy schema where possible;
- API gateway Remote module: account-authenticated host/device registry, scoped session
  credentials, command receipts, revocation, and durable journal API;
- signaling server: relay/presence only, not durable product-state authority;
- managed-run service/module: introduced only with real schema, queue, executor, metering,
  cancellation, recovery, and operations;
- artifact domain service: lifecycle owner; platform-specific renderers remain adapters.

## 8. UI, Layout, And Component Baseline

This inventory is a planning baseline derived from officially documented workflows. It is
not an instruction to copy competitor visual design.

### 8.1 Global shell

- account/workspace switcher;
- mode/session-kind switcher with one-line purpose and execution promise;
- primary sidebar and collapsed rail;
- recents, pins, projects, and local projects;
- typed global search with destination/scope filters;
- Library/files/artifacts;
- schedules and action-required inbox badge;
- plugin/skill/connector directory;
- Remote devices/sessions;
- usage/credits;
- profile, settings, help, and status.

### 8.2 Composer

- multiline prompt;
- attachment, camera, photo, file, and permitted folder entry;
- source/site selector;
- model and supported effort controls;
- runtime/execution-location control;
- tool, skill, plugin, and connector mentions;
- permission mode;
- voice;
- send, queue, steer, and stop;
- context/token/usage indicator;
- visible Local, BYOK provider, Managed, browser, or host label;
- secret scan and payload preview before handoff.

### 8.3 Run timeline

- user and assistant messages;
- reasoning/status summary;
- editable plan and task/checklist rows;
- subagent rows;
- tool discovery/start/progress/result/error cards;
- permission and approval cards;
- source/citation/provenance cards;
- browser screenshots and origin labels;
- terminal/command stream;
- file, diff, test, and artifact cards;
- progress and elapsed time;
- retry, recover, offline, and degraded states;
- usage/cost/context budget;
- validation result and follow-up actions.

### 8.4 Workbench panes

- chat/transcript;
- plan document;
- file explorer and editor;
- diff viewer;
- terminal;
- isolated or signed-in browser with visible distinction;
- screenshot/computer view;
- artifact/file preview;
- tasks/subagents;
- sources/activity;
- pull-request/review;
- usage/context.

### 8.5 Project, memory, schedules, and plugin surfaces

- project list/detail, knowledge, instructions, roles, sharing, and move-session flow;
- explicit standalone/project/device/workspace/browser memory labels;
- memory summary, pause/reset/import/export, and temporary/incognito entry;
- schedule list, next/last run, unread result, cadence/trigger, runtime/host/folder,
  resources, permission/cost policy, history, Run now, pause/resume/delete, and blocked state;
- directory search/tabs, install/update/remove, auth/reconnect, scopes, supported surfaces,
  risk badges, approval behavior, administrator status, interactive renderer, and audit.

## 9. Priority Sequence

### P0 — correctness, trust, and honest foundations

1. Reproduce and close tenant-isolation defects in sandbox and connector caches.
2. Remove or explicitly disable disconnected Work, Research, Code Remote, schedule, worker,
   and artifact-share facades.
3. Split session/surface domains; Chrome must not be a developer-session surface.
4. Select one canonical versioned event protocol with sequence, replay, cancellation,
   terminal state, and typed degraded outcomes.
5. Converge all VS Code agentic actions on the CLI developer engine unless an action is
   explicitly classified as stateless and non-agentic.
6. Make tool manifests and approval decisions server/native authoritative.
7. Define tenant-bound `ComputeSession`, handoff, provenance, and artifact lifecycle
   contracts.
8. Connect settings and memory controls to the exact runtime consumers they claim to
   configure.

### P1 — parity-defining systems

1. Durable managed `WorkRun` and isolated sandbox workspace.
2. Durable `ResearchRun` with plan/source/activity/report/export lifecycle.
3. Remote control plane, outbound host adapter, and Mobile/Web projection UI.
4. Canonical schedule contract with managed, local-host, and browser adapters.
5. Canonical artifact version/sync/share/publish lifecycle.
6. Real plugin/skill/connector directory and organization policy.
7. Typed global search across supported cloud entities while preserving local indexes.
8. Scoped `PersonalContext` and namespaced settings registry.
9. Complete activity timeline and exact model/effort controls.

### P2 — expansion after foundations

- record-and-replay generated skills;
- safe interactive connector cards and full-screen views;
- Sites/dashboard publication;
- browser/file/artifact annotations and evidence recordings;
- state-aware notification suppression;
- usage recaps and focus controls;
- organization plugin distribution sources;
- response-selection to document/artifact flows;
- voice and multimodal refinement without crossing trust boundaries.

## 10. Acceptance-Evidence Rules

No feature may move to `implemented` or be advertised from the existence of a component,
route, schema, or test alone.

### 10.1 Required evidence for every user-facing capability

1. **Reachability:** identify the mounted route/navigation/control and the production feature
   gate.
2. **State:** show the authoritative store/schema and its scope, ownership, retention, and
   migration path.
3. **Request:** runtime-validate user input at the first privileged boundary.
4. **Authorization:** prove server/native authentication, object ownership, tenant isolation,
   plan/policy evaluation, and tool/action authorization.
5. **Execution:** identify the real runtime, worker, provider adapter, sandbox, or host that
   performs the action.
6. **Events:** prove typed progress, approval, cancellation, timeout, retry/backoff,
   idempotency, and terminal-state behavior where applicable.
7. **Persistence:** prove success is durably readable after reload/restart/reconnect; prove
   deletion and retention behavior.
8. **Rendering:** verify loading, empty, disabled, success, partial, offline, degraded, and
   error states on every supported surface.
9. **Trust:** show execution location, data destination, active provider/tool/source, and
   permission scope before sensitive egress or action.
10. **Regression:** include a test that would fail on the prior defect and execute the
    smallest relevant typecheck/lint/test/build plus a human-like product check.
11. **Operations:** for background/cloud work, prove queue/executor deployment, metering,
    cancellation, reconciliation, alerts, and recovery—not only API row creation.
12. **Documentation:** generate availability from registries where possible; link evidence
    and state explicit plan, platform, region, and rollout limitations.

### 10.2 Status vocabulary

Use only:

- `implemented`: the end-to-end acceptance evidence passes;
- `partial`: a real path works but documented acceptance cases remain open;
- `experimental`: reachable behind an explicit experimental gate and labeled accordingly;
- `stub`: structure exists but no complete execution path;
- `dead`: not production-reachable;
- `broken`: reachable but fails its stated contract;
- `unknown`: evidence is insufficient;
- `unavailable`: intentionally not offered on that surface/mode.

Never use `implemented` for static data, a mock screen, a no-op toggle, a generated success
identifier, an unmounted component, a route with no executor, or a provider capability that
has not passed runtime admission and a live probe.

## 11. Unverified Discovery Backlog From User-Supplied X/UI Inventories

Everything in this section is **C/UI? — unverified** unless it also appears independently in
the official-source sections above. These notes are preserved so useful leads are not lost,
but they must not change architecture, model metadata, public copy, or parity status without
the acceptance process in section 10.

### 11.0 Verification refresh — 2026-07-15

The current official documentation now verifies several leads that were unverified in the
first pass:

- GPT-5.6 Sol, Terra, and Luna, their exact API IDs, documented pricing, context/output
  limits, image input, effort levels, and Responses-API tool surface;
- the new ChatGPT desktop shell combining Chat, Work, and Codex, plus the separate
  ChatGPT Classic migration path;
- ChatGPT Work on web/mobile, generated documents/spreadsheets/presentations/reports/Sites,
  scheduled work, progress, steering, and important-action approvals;
- global ChatGPT search across chats, projects, images, and documents;
- Codex Remote on paired macOS/Windows hosts from the ChatGPT mobile app;
- Claude Cowork on web/mobile, account-persisted remote runs, cross-surface continuation,
  generated-file previews, projects, schedules, and the desktop bridge required for local
  files/browser/computer use;
- Claude Code Remote Control, including `claude remote-control`, `claude --remote-control`
  or `--rc`, and in-session `/remote-control` or `/rc`;
- Claude Code `/tui fullscreen`, mouse/scroll/search behavior, and its alternate-screen
  renderer; and
- the current Claude model families Fable 5, Opus 4.8, Sonnet 5, and Haiku 4.5.

Two important corrections follow from those sources:

1. **A local Remote Control session does not keep running after its host process stops.**
   It reconnects after temporary sleep/network interruption, but the local process and host
   remain authoritative. Cowork remote sessions and Claude Code cloud sessions are the
   experiences that continue independently of the laptop.
2. **Live Cowork artifacts are desktop-only at this cutoff.** Web/mobile can preview files,
   but the official cross-surface feature table leaves Live artifacts unavailable there.

The repository's model registry still requires its own live-admission and harness checks.
Official GA proves a public vendor contract; it does not prove that an AGI credential has
rollout access, that the selected endpoint accepts the model, or that AGI has wired every
documented tool.

### 11.1 OpenAI leads to validate

- Exact unified desktop navigation and placement of Chat, Work, and Codex, including claims
  that Chat appears as a draggable/minimizable pop-up and that a “Classic” fallback exists.
- Exact mobile bottom navigation labels such as Chat, Work, Discover, Voice, and More.
- Exact Work dashboard panels for progress, scheduled tasks, approvals, finance, shopping,
  Sites, and built-in browser tabs.
- Exact Codex desktop browser-annotation UI, task-history search, multi-repository layout,
  inline PR-review placement, and computer-use permission overlays.
- Claims that Mobile can manage scheduled tasks in addition to steering/approving Remote
  developer sessions.
- Exact Chrome extension controls for summarize, selected-text Q&A, page-aware agents,
  privacy modes, and persistent side-panel behavior.
- Exact VS Code session tabs, PR panel, browser/computer-use approval UI, and feature parity
  with the desktop Codex workbench.
- Exact CLI commands such as `/goal`, browser controls, scheduled/background tasks, and any
  “SDK” surface not established by the current official manual.
- Exact Slack task-card behavior and routing semantics.
- Claims of “90+” integrations, reaction emoji UI, one-click PDF/Markdown export, high
  contrast/font controls, and credit purchase behavior.
- Claims about group-chat retirement, Canvas behavior, Atlas migration, pronunciation
  guidance, finance dashboards, and regional/plan availability.

User-supplied community links retained for discovery only:

- <https://x.com/jacult/status/2077371096882610679>
- <https://x.com/Cycario/status/2077370987004256305>
- <https://x.com/sethrosen/status/2077371664371786072>

### 11.2 Anthropic leads to validate

- A `Cmd+Shift+B` built-in sandboxed browser shortcut and its exact desktop/Code scope.
- Claims that interactive Artifacts are authored from Claude Code, plus exact sharing and
  multiplayer plan behavior.
- Exact web navigation for Projects, Artifacts, Cowork, Code, Customize, and History, and
  exact placement/visual treatment of model and effort controls.
- Exact “Research,” “Design,” and “Science” mode names, feature boundaries, and platform
  availability.
- Claims of Adaptive Reasoning trace visibility and specific glow/animation behavior.
- Exact mobile Cowork/Code steering views, device/session cards, voice UI, health/fitness
  integration, and effort controls.
- Exact Slack/Claude Tag artifact-card behavior.
- “Brain Files,” “Dreaming,” “Routines,” `/ultrareview`, “J-Space,” task budgets, and other
  named agent/memory concepts not established by current official product sources.
- Record-and-replay browser teaching, visual debugging, CI auto-fix, and background browser
  workflow details beyond the officially documented Chrome/Cowork permissions.
- Exact claim that bare `claude rc` is a valid shell command. Official docs establish
  `claude remote-control`, `claude --rc`, and `/rc`, but not the bare two-token alias.

User-supplied community links retained for discovery only:

- <https://x.com/MinLiBuilds/status/2077371152662708337>
- <https://x.com/maksdizzy/status/2077370570677563793>
- <https://x.com/testingcatalog/status/2074207934280761499>
- <https://x.com/_and_a_/status/2077370085002653994>

### 11.3 UI-description leads to validate visually

The user inventories describe exact colors, spacing, glow effects, pane locations, recent
thread limits, card shapes, pop-ups, navigation bars, full-screen modes, and animations.
Treat these as screenshot-study prompts only. A visual-parity study must record:

- product build/version, operating system, device, plan, workspace policy, region, and date;
- full window and responsive dimensions;
- signed-in/signed-out and empty/populated states;
- every visible primary and secondary control;
- keyboard, mouse, touch, screen-reader, reduced-motion, and high-contrast behavior;
- console/network errors and failed controls;
- which observations are stable across at least two accounts/builds.

AGI should extract interaction principles and information hierarchy, not copy another
company's visual identity.

## 12. Community UX Signals, Not Product Truth

Community discussions are useful for failure modes:

- visually unified modes create false expectations of shared history and usage accounting;
- remote users need explicit host, project/folder, reconnect, and compaction state;
- overlapping Cowork/Code/Dispatch/Remote entry points confuse users without one-line
  execution promises;
- power users value portable output in normal files and repositories;
- non-technical users value managed sandboxes, files, schedules, and reduced setup;
- users need visible project selection and action-required notifications on mobile.

Representative discussion links:

- <https://www.reddit.com/r/ChatGPT/comments/1usa7o5/chatgpt_desktopcodex_desktop_app_merger_is_a_big/>
- <https://www.reddit.com/r/ChatGPT/comments/1uvg0bx/updated_chatgpt_app_cant_use_normal_chat_mode/>
- <https://www.reddit.com/r/codex/comments/1us0zor/new_codex_update_i_dont_understand_the_new/>
- <https://www.reddit.com/r/ClaudeAI/comments/1uq109i/whats_the_point_of_cowork_when_you_have_claude/>
- <https://www.reddit.com/r/ClaudeAI/comments/1upzpdq/cowork_expands_to_mobile_web/>
- <https://www.reddit.com/r/ClaudeCode/comments/1ucrmvh/anthropic_is_bringing_cowork_support_to_claude/>
- <https://www.reddit.com/r/ClaudeCowork/comments/1uq110z/whats_the_point_of_cowork_when_you_have_claude/>
- <https://x.com/seti_park/status/2026452354401493085>

## 13. Official Source Index

### OpenAI / ChatGPT / Codex

- [ChatGPT release notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes)
- [ChatGPT Work and Codex](https://help.openai.com/en/articles/20001275/)
- [ChatGPT agent](https://help.openai.com/en/articles/11752874-chatgpt-agent/)
- [Deep research](https://help.openai.com/en/articles/10500283-deep-research)
- [Apps in ChatGPT](https://help.openai.com/en/articles/11487775-apps-in-chatgpt)
- [Plugins in Codex](https://help.openai.com/en/articles/20001256)
- [Tasks in ChatGPT](https://help.openai.com/en/articles/10291617-tasks-in-chatgpt)
- [Library](https://help.openai.com/en/articles/20001052-library)
- [ChatGPT Search](https://help.openai.com/en/articles/9237897)
- [Projects](https://help.openai.com/en/articles/10169521-projects-in-chatgpt)
- [Voice](https://help.openai.com/en/articles/20001274)
- [OpenAI model catalog](https://developers.openai.com/api/docs/models)
- [GPT-5.6 launch](https://openai.com/index/gpt-5-6/)
- [New ChatGPT desktop migration](https://help.openai.com/en/articles/20001276-moving-to-the-new-chatgpt-desktop-app)
- [Google app data and action controls](https://help.openai.com/en/articles/10408842-google-connector-for-chatgpt-data-controls-faq)
- [Codex documentation](https://learn.chatgpt.com/docs/)

### Anthropic / Claude / Claude Code

- [Claude release notes](https://support.claude.com/en/articles/12138966-release-notes)
- [Cowork getting started](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork)
- [Cowork across web, desktop, and mobile](https://support.claude.com/en/articles/15520349-use-claude-cowork-on-web-desktop-and-mobile)
- [Cowork architecture](https://support.claude.com/en/articles/14479288-claude-cowork-architecture-overview)
- [Live artifacts](https://support.claude.com/en/articles/14729249-use-live-artifacts-in-claude-cowork)
- [Dispatch](https://support.claude.com/en/articles/13947068-assign-tasks-from-anywhere-in-claude-cowork)
- [Computer use in Cowork](https://support.claude.com/en/articles/14128542-let-claude-use-your-computer-in-cowork)
- [Cowork schedules](https://support.claude.com/en/articles/13854387-schedule-recurring-tasks-in-claude-cowork)
- [Customize directory](https://support.claude.com/en/articles/14328846-browse-skills-connectors-and-plugins-in-one-directory)
- [Plugins](https://support.claude.com/en/articles/13837440-use-plugins-in-claude)
- [Web search, extended thinking, and Research](https://support.claude.com/en/articles/11095361-when-should-i-use-web-search-extended-thinking-and-research)
- [Research](https://support.claude.com/en/articles/11088861-use-research-on-claude)
- [Chat search and memory](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context)
- [Memory import and export](https://support.claude.com/en/articles/12123587-import-and-export-your-memory-from-claude)
- [Claude in Chrome](https://support.claude.com/en/articles/12012173-get-started-with-claude-in-chrome)
- [Chrome permissions](https://support.claude.com/en/articles/12902446-claude-in-chrome-permissions-guide)
- [Chrome admin controls](https://support.claude.com/en/articles/13065128-claude-in-chrome-admin-controls)
- [Reflect](https://support.claude.com/en/articles/15672559-see-your-monthly-recap)
- [Time and focus](https://support.claude.com/en/articles/15672868-set-break-reminders-and-quiet-hours)
- [Interactive connectors](https://support.claude.com/en/articles/13454812-use-interactive-connectors-in-claude)
- [Voice](https://support.claude.com/en/articles/11101966-use-voice-mode)
- [Projects](https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects)
- [Claude Code Remote Control](https://code.claude.com/docs/en/remote-control)
- [Claude Code on the web](https://code.claude.com/docs/en/claude-code-on-the-web)
- [Claude Code platforms](https://code.claude.com/docs/en/platforms)
- [Claude Code IDE integrations](https://code.claude.com/docs/en/ide-integrations)
- [Claude Code desktop](https://code.claude.com/docs/en/desktop)
- [Claude Code sessions](https://code.claude.com/docs/en/sessions)
- [Claude Code what's new](https://code.claude.com/docs/en/whats-new)
- [Claude Code Chrome integration](https://code.claude.com/docs/en/chrome)
- [Claude Code features](https://code.claude.com/docs/en/features-overview)
- [Claude Code model and effort configuration](https://code.claude.com/docs/en/model-config)
- [Claude Code fullscreen rendering](https://code.claude.com/docs/en/fullscreen)
- [Claude Code changelog](https://code.claude.com/docs/en/changelog)
- [Claude model selection](https://platform.claude.com/docs/en/about-claude/models/choosing-a-model)
- [Claude model IDs and versioning](https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions)

### Google / Gemini

- [Gemini updates](https://support.google.com/gemini/answer/17171264)
- [Spark tasks](https://support.google.com/gemini/answer/17094507)
- [Connected apps](https://support.google.com/gemini/answer/13695044)
- [Spark update](https://blog.google/innovation-and-ai/products/gemini-app/gemini-spark-updates-june-2026/)
- [Gemini application evolution](https://blog.google/innovation-and-ai/products/gemini-app/next-evolution-gemini-app/)

## 14. Product Standard

At all times, every AGI user must be able to answer:

1. Where is this running?
2. Where is my data stored, and exactly what syncs?
3. Which model, tools, sources, skills, and permissions are active?
4. What is the agent doing, what changed, and what requires my approval?
5. Will this continue if I close the app, lose the network, or turn off the device?

Encoding those answers in shared, runtime-validated contracts—and rendering them honestly
on every applicable surface—is the prerequisite for safely adding new models, tools,
sandboxes, research modes, plugins, applications, and remote workflows.
