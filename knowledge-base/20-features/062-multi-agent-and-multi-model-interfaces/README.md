---
id: "AREA-062"
type: "area"
title: "Multi-agent and multi-model interfaces"
features: ["F062-01", "F062-02", "F062-03", "F062-04", "F062-05", "F062-06", "F062-07", "F062-08", "F062-09", "F062-10", "F062-11"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 62. Multi-agent and multi-model interfaces

This area lets a person run more than one AI at once in three ways. A main task can start child agents that work on parts of a job, and the user can see each child's role, status and result. A user can watch many running cloud tasks in one overview and answer the ones waiting for them. A user can also send one prompt to two or three models and read the answers side by side, to pick the better one.

**Who uses it.** Every signed-in user can open the model comparison on web and mobile. The code gates it by the plan's model list and by cloud access, not by a workspace role. The command-line child-agent tools run in any session where the model may call the task tool; the code refuses nested children beyond a depth limit. The cloud task overview lists runs produced by the AGI Work mode. No workspace-admin-only path was seen in the code read.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F062-01](F062-01-parent-task-and-child-agent-list.md) | Parent task and child agent list | partly | no | no | built | partly | no |
| [F062-02](F062-02-per-agent-status-model-and-result.md) | Per-agent status, model and result | partly | partly | built | built | no | no |
| [F062-03](F062-03-per-agent-transcript-and-drill-down.md) | Per-agent transcript and drill-down | partly | partly | built | partly | built | no |
| [F062-04](F062-04-concurrent-task-overview-with-needs-input-first.md) | Concurrent task overview with needs-input first | built | built | built | partly | built | partly |
| [F062-05](F062-05-workspace-sharing-indicator.md) | Workspace sharing indicator | no | no | no | no | no | no |
| [F062-06](F062-06-agent-handoff-with-summary.md) | Agent handoff with summary | no | no | no | no | partly | no |
| [F062-07](F062-07-background-fork-and-conversation-branch.md) | Background fork and conversation branch | partly | partly | partly | built | partly | no |
| [F062-08](F062-08-advisor-consultation.md) | Advisor consultation | no | no | no | built | no | no |
| [F062-09](F062-09-side-by-side-model-comparison.md) | Side-by-side model comparison | built | no | built | no | no | no |
| [F062-10](F062-10-synthesis-agreement-and-unique-findings.md) | Synthesis, agreement and unique findings | no | no | no | no | no | no |
| [F062-11](F062-11-comparison-sources-cost-rerun-and-save.md) | Comparison sources, cost, rerun and save | no | no | no | no | no | no |

Requirement items for this area: [10-requirements/capabilities/062-multi-agent-and-multi-model-interfaces.md](../../10-requirements/capabilities/062-multi-agent-and-multi-model-interfaces.md).

## How this area works in the code

1. **1. Command-line child spawn.** The model calls the task tool, or the user runs a task. The manager checks the depth limit, the session spend cap and the concurrent-child limit, then gives the child an id and a role (general-purpose or a named agent). The child runs on its own thread. The parent keeps an entry with status, result and usage. (`apps/cli/src/subagent.rs:602-621`, `apps/cli/src/subagent.rs:645-664`, `apps/cli/src/subagent.rs:677-679`, `apps/cli/src/subagent.rs:717-820`, `apps/cli/src/subagent.rs:822-833`)
2. **2. Child route stays inside the parent boundary.** A child is built on the parent route (model, provider, privacy mode). If the route would leave the parent's trust boundary, the spawn is refused. (`apps/cli/src/subagent.rs:22-27`, `apps/cli/src/subagent.rs:47-70`)
3. **3. Status and result update.** The child's status changes to completed, failed or cancelled as the run ends. Usage and the transcript are saved on the entry, and an audit record is written. (`apps/cli/src/subagent.rs:748-808`, `apps/cli/src/subagent.rs:731-743`)
4. **4. User lists and reads children.** The /task or /tasks command calls the manager, prints the list (id, role, status, description), and prints a detail or transcript for one id. (`apps/cli/src/repl/slash_commands.rs:267-271`, `apps/cli/src/repl/registry.rs:510-570`, `apps/cli/src/subagent.rs:101-117`, `apps/cli/src/subagent.rs:119-150`)
5. **5. Advisor side query.** The /advisor command returns a request. The REPL or full-screen view runs the advisor tool, which returns JSON with the answer and the model used. The output is shown with the model label and is not added to the conversation. (`apps/cli/src/repl/slash_commands.rs:360-368`, `apps/cli/src/repl/mod.rs:1004-1031`, `apps/cli/src/repl/mod.rs:1033-1043`, `apps/cli/src/tui/tui_app.rs:6671-6677`, `apps/cli/src/tui/tui_app.rs:7831-7856`)
6. **6. Web comparison start.** The user sends a prompt. The page uses up to three models, starts workers limited by the plan concurrency number, and each worker streams one answer into its own panel. (`apps/web/features/models/components/CompareAnswersPage.tsx:111-186`, `apps/web/features/models/lib/use-compare-answers.ts:87-152`, `apps/web/features/models/lib/compare-answer-stream.ts:140`)
7. **7. Mobile comparison start.** Two streaming requests run from the compare screen. If the plan allows one answer at a time, the second waits for the first. Local mode is refused before any request is sent. (`apps/mobile/src/features/compare/index.tsx:200-337`, `apps/mobile/src/features/compare/index.tsx:215-224`, `apps/mobile/src/features/compare/index.tsx:256-259`)
8. **8. Cloud task list and needs-you grouping.** The cloud runs endpoint lists runs for the AGI Work mode. The shared overview groups runs into filters, and runs in awaiting-input, awaiting-approval or paused states count as needing the user. (`apps/web/app/api/llm/v1/chat/completions/runs/route.ts:110-130`, `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:59-80`, `apps/mobile/src/features/tasks/runPresentation.ts:17-24`, `apps/extension-vscode/src/features/cloud-tasks/cloudTasksTree.ts:27`)
9. **9. Inline reply to a waiting run.** The run detail sends a steer answer through the cloud transport. The page replaces the run with the server copy. The resume route releases and checks the pause lease before continuing. (`packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:390-400`, `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/resume/route.ts:112-130`)
10. **10. Conversation branch on web.** A branch request posts to the managed conversation branches route for one message. The hook blocks a second branch while one is being made. (`apps/web/features/chat/hooks/use-conversation-branches.ts:100-112`)

## Files to know

| File | Role |
|---|---|
| `apps/cli/src/subagent.rs` | Child agent manager: spawn limits, child threads, status, usage, list and detail formatting. |
| `apps/cli/src/repl/registry.rs` | /tasks command handling (list, show, transcript, stop) and /fork branch logic. |
| `apps/cli/src/repl/mod.rs` | Runs the /advisor side question and formats the advisor answer with its model label. |
| `apps/web/features/models/components/CompareAnswersPage.tsx` | Web comparison page: model slots, prompt box, answer panels, copy and chat-with actions. |
| `apps/web/features/models/lib/use-compare-answers.ts` | Web comparison state: runs answers in parallel up to the plan limit; stop and per-answer failure. |
| `apps/web/features/models/lib/compare-answers.ts` | Limits (two to three models), default model choice, and the comparison link format. |
| `apps/mobile/src/features/compare/index.tsx` | Mobile comparison screen: two model slots, streaming per panel, Faster badge, Local-mode refusal. |
| `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx` | Shared cloud task overview: filters, needs-you grouping, run cards, inline reply. |
| `apps/web/app/api/llm/v1/chat/completions/runs/route.ts` | Server route that lists cloud agent runs for the AGI Work mode. |
| `apps/extension-vscode/src/features/cloud-tasks/cloudTasksTree.ts` | VS Code cloud task tree and its stage mapping (needs-you, working, review, done, stopped). |

## What is stored

- Child agent entries: id, role, description, status, result, usage, transcript. Held in memory by the manager; gone when the session ends.: apps/cli/src/subagent.rs:822-833
- Subagent audit record (id, role, description, depth, prompt size, status, usage, files modified): apps/cli/src/subagent.rs:731-743, written through the subagent audit module (destination not opened)
- Branched session file created by /fork: apps/cli/src/repl/registry.rs:1387-1399 (managed session store)
- Comparison answers on web and mobile: prompt, answers, timings, errors. Not saved.: React state only: apps/web/features/models/lib/use-compare-answers.ts and apps/mobile/src/features/compare/index.tsx; the web page says answers are not saved at apps/web/features/models/components/CompareAnswersPage.tsx:327
- Recently used and favourite models that set default comparison picks: Web chat model store and favourites hook, read at apps/web/features/models/components/CompareAnswersPage.tsx:114-116
- Cloud agent run records shown in the Tasks overview: Server side, read by apps/web/app/api/llm/v1/chat/completions/runs/route.ts (storage table not opened)

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Maximum subagent nesting depth**: Refuses a child beyond the depth limit (apps/cli/src/subagent.rs:612)
- **Maximum concurrent subagents**: Refuses a new child while the running count is at the limit (apps/cli/src/subagent.rs:645)
- **Session spend cap for children**: Caps each child's spend; refuses new children when the session cap is used up (apps/cli/src/subagent.rs:620-630)
- **Plan concurrent answer limit**: Sets how many comparison answers run at once; one means the second waits (apps/web/features/models/components/CompareAnswersPage.tsx:142-143; apps/mobile/src/features/compare/index.tsx:95-97 and 256)
- **Plan model list for comparison**: Sets which models can be picked; fewer than two disables comparison (apps/mobile/src/features/compare/index.tsx:109-119; apps/web/features/models/lib/compare-answers.ts:19; apps/web/features/models/lib/model-presentation.ts:63)
- **Comparison size limits**: Two minimum and three maximum models on web (apps/web/features/models/lib/compare-answers.ts:6-7)
- **Mobile Local mode gate**: Refuses comparison sends and shows a banner when chat is in Local mode (apps/mobile/src/features/compare/index.tsx:215-224 and 424-434)
- **Mobile cloud unlock**: Sends the user to the cloud sign-up step, or switches to cloud mode (apps/mobile/src/features/compare/index.tsx:127 and 192-197)
- **/advisor command**: Enables the advisor side question in the command-line app (apps/cli/src/repl/slash_commands.rs:360-368)

## Shared between apps

Shared: packages/ui/unified-chat (the cloud task overview and Markdown renderer), used by the web and desktop task pages. Shared server contract: the cloud runs endpoint under apps/web/app/api/llm/v1/chat/completions/runs. Separate per app: the command-line subagent manager and /tasks commands (apps/cli), the web comparison page and hook (apps/web/features/models), the mobile comparison screen (apps/mobile/src/features/compare), and the VS Code task tree (apps/extension-vscode). Chrome: no code read.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief line references for the command-line task list are wrong. tui_app.rs:5143 is the model-cycling function, not a task view. registry.rs:419 is the conversation delete branch. (apps/cli/src/tui/tui_app.rs:5111-5143; apps/cli/src/repl/registry.rs:419)
- Brief line reference for the subagent model label is wrong. subagent.rs:80 is a doc comment on the Completed status. (apps/cli/src/subagent.rs:74-84)
- The brief marks web comparison (items 19, 20, 26) as missing, but a web comparison page exists and implements parallel answers and model selection. (apps/web/app/models/compare/page.tsx:1-24; apps/web/features/models/components/CompareAnswersPage.tsx:111-365)
- The brief marks command-line background fork as done and points to tui_app.rs:5113, which is the next-model cycle function. The only fork found is /fork, which copies the session and does not run a background task. (apps/cli/src/tui/tui_app.rs:5111-5126; apps/cli/src/repl/registry.rs:1353-1399)
- The brief marks command-line per-agent transcript as missing, but /tasks transcript with an id exists and prints the transcript. (apps/cli/src/repl/registry.rs:528-540)
- A comment says child tasks run as a bounded foreground lifecycle, but the spawn path starts a thread and returns the id straight away. (apps/cli/src/subagent.rs:579-589 and apps/cli/src/subagent.rs:717-720)
- The command-line task list does not sort or group children by whether they need input, so needs-you priority is missing there. (apps/cli/src/subagent.rs:101-117)
- The web comparison has no cost estimate, rerun control or synthesis, and the comparison is lost on reload. (apps/web/features/models/components/CompareAnswersPage.tsx:327; apps/web/features/models/lib/use-compare-answers.ts:45-159)
- Mobile timing and token figures are estimates from text length, not billed usage, and the screen does not say so. (apps/mobile/src/features/compare/index.tsx:286-299; apps/mobile/src/features/compare/index.tsx:675-697)

## Not established

- Whether the command-line child manager runs children in the foreground or background (the code and its comment disagree; see the list above).
- The storage table for cloud run records and the destination of the subagent audit record (not opened).
- The VS Code handoff code in apps/extension-vscode/src/features/cloud-tasks/cloudCodeSessions.ts (brief line 213 was not opened in full), and the VS Code branch command (brief lines 1210 and 1219 in apps/extension-vscode/src/core/commandSetup.ts are code review and sign-in code, not branching).
- Whether the desktop app has its own comparison page or task overview. Desktop uses the shared packages/ui task page; no desktop comparison route was found.
- The approval overlay in apps/cli/src/tui/widgets/approval_overlay.rs (not opened), which the brief cites for inline unblock on the command-line app.
- The Chrome extension: no code was read for this area.
- The exact empty and loading states of the shared TasksPage (only parts of the file were read).
- Whether the web Models page links to the comparison (the page imports the link helper, but the rendered link was not traced).
- Server rules for cloud task runs: who can see a run, and the plan limits on runs.
