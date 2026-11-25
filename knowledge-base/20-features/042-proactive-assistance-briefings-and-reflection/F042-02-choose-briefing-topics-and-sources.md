---
id: "F042-02"
type: "feature"
title: "Choose briefing topics and sources"
aliases: ["Briefing topics", "Selected connected sources", "Dismiss topic", "Add topic", "What Each Run Can Use", "S42.02", "S42.03", "S42.13", "S42.14"]
area: "42 Proactive assistance, briefings, and reflection"
available_on: ["web", "desktop"]
implementation: {web: "partial", desktop: "partial", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S42.02", "S42.03", "S42.13", "S42.14"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:cloud", "F042-01", "SYS-connectors-plugins-and-skills", "SYS-memory-projects-and-context", "SYS-agents-tools-and-automation", "SYS-security-and-privacy", "table:scheduled_tasks", "api:POST /api/schedules"]
basis: "code inspection"
second_reader: "10 of 13 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F042-02 Choose briefing topics and sources

Topic choice, adding a topic and dismissing a topic are not built on any app. Picking sources is partly built: web and desktop schedule forms have source checkboxes (project, memory, web; recent chats on web only) and a connector list, which is 'coming soon'. The brief lists S42.03 as missing, so code and brief disagree.

Area: [42. Proactive assistance, briefings, and reflection](README.md). Requirement items: [S42.02](../../10-requirements/capabilities/042-proactive-assistance-briefings-and-reflection.md#s4202), [S42.03](../../10-requirements/capabilities/042-proactive-assistance-briefings-and-reflection.md#s4203), [S42.13](../../10-requirements/capabilities/042-proactive-assistance-briefings-and-reflection.md#s4213), [S42.14](../../10-requirements/capabilities/042-proactive-assistance-briefings-and-reflection.md#s4214).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Target: the person chooses what the briefing covers (topics) and which connected sources it reads, and can add or dismiss topics later. Today only per-schedule source switches exist on web and desktop, and the free-text prompt.

**Why it exists.** Items S42.02, S42.03, S42.13 and S42.14 in the area brief (doc: knowledge-base/data/area-briefs/042-proactive-assistance-briefings-and-reflection.md). A briefing is more useful if it can be tuned without rewriting a prompt.

**Who uses it.** People with a Daily briefing schedule who want a different focus.

**Problems it solves**

- Editing a long fixed prompt is hard for non-technical users.
- Reading sources the person does not want is a privacy concern.
- A topic that no longer matters keeps appearing.

**Use cases**

- Turn off 'The web' for a private brief.
- Exclude one connected mailbox from the brief.
- Dismiss 'sports' after it appears.
- Add 'competitor X' to the weekly brief.

## 2. User experience

**Where to find it**

- Web: schedule create or edit form, section 'What Each Run Can Use' with 'Sources' and 'Connectors' (apps/web/features/schedules/components/ScheduleAccessFields.tsx:93).
- Desktop (Tauri build): the same section from DesktopScheduleAccessFields (apps/desktop/src/features/schedules/DesktopScheduleAccessFields.tsx).
- Mobile, CLI, VS Code: no source or topic control found (no 'sources' in apps/mobile/src/features/schedules).
- Chrome: no checkbox control; the form sends the template's sources unchanged (schedulesSection.ts:672,773).
- Topics, add topic, dismiss topic: not available anywhere.

**Before you start**

- A schedule being created or edited (web, desktop).
- Connectors being released for the connector list to appear; it is 'coming soon' now (connector-release.ts:14).

**Screens and controls**

- Web checkboxes: 'Project instructions and files' (only with a project), 'Saved memories' (read only while memory is on), 'The web', 'Recent chats' (your chats from the last 24 hours, read only while Search past chats is on) (ScheduleAccessFields.tsx:29-52).
- Web connectors: one checkbox per connected connector; unchecked list limits the run; 'Includes every connector, even ones you connect later. Uncheck to choose.' (ScheduleAccessFields.tsx:211).
- Desktop: three source checkboxes (project, memory, web) with no Recent chats (DesktopScheduleAccessFields.tsx:33-38).

**Journey**

1. Open a schedule form on web or desktop.
2. Tick or untick sources.
3. Save; the choice is stored on the schedule.
4. At run time the executor honours the flags.
5. Topic add or dismiss: no journey exists.

**What the person sees and gets**

- Helper text under each checkbox.
- While connectors load: 'Reading your connectors…'; on error a message and 'Try again'; with none connected 'No connectors are connected.' and a 'Connect one' link.

**Settings**

- Settings > memory and 'Search past chats' decide whether those sources read anything (ScheduleAccessFields.tsx:41-52).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Sources object saved with the schedule and enforced at run time: project, memory, web, recentChats (scheduled-agent-executor.ts:926-1004).
- Web source checkboxes and connector list (ScheduleAccessFields.tsx:93-215).
- Desktop source checkboxes (DesktopScheduleAccessFields.tsx:33-38).

**Incomplete**

- Desktop omits 'Recent chats' although the Daily briefing template sets it on (DesktopScheduleAccessFields.tsx:33-38; schedules.ts:854).
- Mobile and Chrome cannot change sources (no control found).
- A schedule made from the Daily briefing template on mobile (and any update without sources) loses recentChats:true, because the mobile template drops sources and the default is recentChats:false; the Daily briefing prompt asks for recent chats, so the mobile briefing silently lacks that input [packages/contracts/cloud-contracts/src/schedules.ts:101-106 (MANAGED_CLOUD_SCHEDULE_DEFAULT_SOURCES); apps/mobile/src/features/schedules/templates.ts:26-42; schedules.ts:~850].
- Monitor a topic template holds a placeholder the person must edit by hand: 'Track [replace this with the topic you want followed]...' (schedules.ts:858).

**Present but disconnected or switched off**

- Connector choices are replaced by 'Connectors for scheduled runs are coming soon.' (ScheduleAccessFields.tsx:136).

**Not available**

- Topic picker, add topic, dismiss topic on web, desktop, mobile, CLI, VS Code and Chrome (brief S42.02, S42.13, S42.14 missing; no code found).
- Mail and calendar source toggles by name; only generic connectors exist.

## 4. Required behaviour

**Established requirements**

- The user chooses the topics the briefing covers (S42.02). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S42.02)
- The user picks which connected sources (mail, calendar, apps) the briefing reads (S42.03). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S42.03)
- The user can dismiss a topic (S42.13) and add a topic (S42.14). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S42.13, S42.14)

**Acceptance criteria**

1. Web form shows four source checkboxes when the schedule has a project (three otherwise, since the project checkbox is hidden without a project), and each saved value changes what the run reads.
2. With 'The web' unchecked, the run has no web search tool.
3. Desktop form offers the same four sources as web.
4. Mobile offers a way to see and change sources, or the brief documents it does not.
5. A topic added is included in the next brief; a dismissed topic is not.
6. Connector list lets the person exclude a connector from the run.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Topics could be stored as structured data rather than prompt text [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Store topics on the schedule and build the prompt from them.
- [proposed] Add the Recent chats checkbox to desktop and a sources screen to mobile.
- [proposed] Replace the Monitor a topic placeholder with a required topic field.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ScheduleAccessFields | `apps/web/features/schedules/components/ScheduleAccessFields.tsx` | Web source checkboxes and connector list. |
| component | DesktopScheduleAccessFields | `apps/desktop/src/features/schedules/DesktopScheduleAccessFields.tsx` | Desktop source checkboxes and connectors. |
| schema | ManagedCloudScheduleSourcesSchema | `packages/contracts/cloud-contracts/src/schedules.ts` | Source flags and defaults (lines 93-106). |
| schema | ManagedCloudScheduleConnectorsSchema | `packages/contracts/cloud-contracts/src/schedules.ts` | Connector id list, null means all. |
| config | monitor-topic template | `packages/contracts/cloud-contracts/src/schedules.ts` | Prompt with a placeholder topic (line 858). |
| service | scheduled-agent-executor | `apps/web/lib/services/scheduled-agent-executor.ts` | Resolves context under the memory, past-chat and organization policies (resolveScheduledContext, about lines 405-500) and applies sources and connectors at run time (lines 746-760, 926-1004). |
| service | past-chat-context-service | `apps/web/lib/services/past-chat-context-service.ts` | Loads last 24 hours of chats for the Recent chats source. |
| config | connector-release | `packages/contracts/types/src/connector-release.ts` | Release state gating the connector list (line 14). |
| component | ScheduleForm | `apps/web/features/schedules/components/ScheduleForm.tsx` | Hosts the access fields (line 731). |
| component | DesktopCloudSchedules | `apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx` | Desktop form state including sources (lines 86, 167, 407, 1828). |
| component | schedulesSection | `apps/extension/src/features/side-panel/schedulesSection.ts` | Chrome form passes template sources only (lines 672, 773). |
| service | mobile schedule templates | `apps/mobile/src/features/schedules/templates.ts` | Drops sources from templates. |
| endpoint | POST /api/schedules | `apps/web/app/api/schedules/route.ts` | Creates a schedule and stores sources and connectors; route.ts exports only GET and POST. |
| endpoint | PUT /api/schedules/{id} | `apps/web/app/api/schedules/[id]/route.ts` | Updates a schedule, including sources and connectors. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person changes source checkboxes in the schedule form. | device | apps/web/features/schedules/components/ScheduleAccessFields.tsx:104-121 |
| Save sends the sources and connectors with the schedule to the schedules API: POST /api/schedules (route.ts) creates; updates go through apps/web/app/api/schedules/[id]/route.ts. The create handler also applies rate limit, CSRF, plan quota and workspace feature gate. | our servers | apps/web/app/api/schedules/route.ts:96-139; apps/web/app/api/schedules/[id]/route.ts |
| At run time the executor passes sources.memory and sources.recentChats into resolveScheduledContext (lines ~405-500), which applies the memory policy and the Search past chats setting (recent chats are gated by memoryPolicy.searchPastChats; memory goes through managedMemoryContextLoader with the policy); web is enabled only when sources.web is true (line 984). The context is resolved through the shared context engine with organization context policy (loadOrganizationContextPolicy) and per-source budgets, so workspace admin policy can also block memory or project sources, not only the user's settings [apps/web/lib/services/scheduled-agent-executor.ts:405-432]. Web search and tools are also limited by an attached agent's config (webSearch, allowed/blocked domains), so unchecking is not the only control [scheduled-agent-executor.ts:984-1000]. The 926-1004 range only passes the flags. | our servers | apps/web/lib/services/scheduled-agent-executor.ts:432-439, 988-996 |
| If the run could reach Google data, the executor requires a route that keeps inputs out of training. | our servers | apps/web/lib/services/scheduled-agent-executor.ts:738-800 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| sources flags and connectors list per schedule | table:scheduled_tasks | Yes, read back by all apps | Deleted with the schedule. |

**Models and providers.** No topic logic uses a model. Source flags change the context and tools given to the scheduled model call; the route is chosen by admitManagedCloudRoute (scheduled-agent-executor.ts:738-800).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account; schedules are cloud features. |
| Permissions | Memory and recent chats read only when the account's memory and past-chat settings allow (ScheduleAccessFields.tsx:41-52; scheduled-agent-executor.ts:437-439); workspace organization context policy can also block memory or project sources (scheduled-agent-executor.ts:405-432). |
| Subscription | Same scheduled-task limit as F042-01; no separate gate for sources found. |
| Limits and metering | none found in the code for sources. |
| Feature flags | CONNECTOR_RELEASE_STATE 'coming_soon' hides the connector list; selectively released ids exist (connector-release.ts:14-28). |
| Model compatibility | Google data in scope requires a no-training route (scheduled-agent-executor.ts:738-800). |
| Provider restrictions | none found in the code. |
| Local mode | Not available; scheduled runs are server-side. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Connectors loading, error, empty | Spinner text, error with 'Try again', or 'No connectors are connected.' | ScheduleAccessFields.tsx:155-190 |
| Project source without a project | The project checkbox is hidden, so the web form shows three source checkboxes instead of four. | ScheduleAccessFields.tsx:73-74 |
| Recent chats with past-chat search off | Run gets an 'unavailable' notice instead of chats. | scheduled-agent-executor.ts:488-495 |
| Connector added later | Included when the list is null; not added when the list is explicit. | ScheduleAccessFields.tsx:209-218 |
| Topics | not handled in the code | No topic code found in the files searched. |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/schedules/components/ScheduleConnectorGates.test.tsx`: Connector gating in the schedule form; file matched by name, cases not read.
- `apps/web/features/schedules/lib/schedule-form.test.ts`: Form draft logic including sources; matched by search for recentChats, cases not read.
- `apps/web/features/schedules/components/ScheduleForm.test.tsx`: Schedule form; matched by search for recentChats, cases not read.

**Test scenarios**

- **Turn off web**
  1. Edit a schedule on web.
  2. Untick 'The web'; Save.
  3. Run it now.
  - Expected: The run's tool list has no web search; output does not cite web pages.
- **Recent chats without permission**
  1. Turn off Search past chats in Settings.
  2. Tick 'Recent chats' on a schedule and run it.
  - Expected: The prompt carries the unavailable notice, not chat excerpts.
- **Connector list gate**
  1. Open the form with connectors not released.
  - Expected: Text 'Connectors for scheduled runs are coming soon.'
- **Desktop parity**
  1. Open the desktop (Tauri) schedule form.
  - Expected: Three sources only; record the missing Recent chats.

**Where to look when it fails**

- Executor log lines for context resolution in scheduled-agent-executor.ts.
- Column sources and connectors in scheduled_tasks.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/042-proactive-assistance-briefings-and-reflection.md](../../70-qa/test-plans/web/042-proactive-assistance-briefings-and-reflection.md)
- Desktop: [70-qa/test-plans/desktop/042-proactive-assistance-briefings-and-reflection.md](../../70-qa/test-plans/desktop/042-proactive-assistance-briefings-and-reflection.md)

## 10. Gaps and dependencies

- **No topic model, add topic or dismiss topic.** Affects: All six apps.. Evidence: Brief S42.02, S42.13, S42.14 missing; no code found.. Work needed: Design a topic list on the schedule and UI on each app.
- **Brief says S42.03 is missing but web and desktop have source switches.** Affects: Documentation; web and desktop.. Evidence: ScheduleAccessFields.tsx:93; DesktopScheduleAccessFields.tsx:33-38. Work needed: Mark S42.03 partial on web and desktop.
- **Desktop lacks Recent chats; mobile and Chrome lack source controls.** Affects: Desktop, mobile, Chrome.. Evidence: DesktopScheduleAccessFields.tsx:33-38; no sources in apps/mobile/src/features/schedules. Work needed: Add the control on each app.
- **Mail and calendar cannot be selected by name while connectors are 'coming soon'.** Affects: All apps.. Evidence: connector-release.ts:14. Work needed: Release connectors and name them in the form.
- **Monitor a topic template needs a manual edit of a placeholder.** Affects: Web, desktop, mobile, Chrome templates.. Evidence: schedules.ts:858. Work needed: Required topic field.
- Not built on: Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:cloud
- F042-01
- SYS-connectors-plugins-and-skills
- SYS-memory-projects-and-context
- SYS-agents-tools-and-automation
- SYS-security-and-privacy
- table:scheduled_tasks
- api:POST /api/schedules

## Unknown

- Whether any test asserts the desktop source list.
- Whether mobile ever sends sources on a Daily brief update.
- Product intent for the topic model (no spec found).

## Second reader's check

A second reader checked 13 statements of this page against the code: 10 correct, 3 wrong or partly wrong, 0 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 6):** "Executor loads memory and recent chats only when allowed by account policy (scheduled-agent-executor.ts:926-1004)" The code shows: The policy gating is in resolveScheduledContext (about lines 405-500), not 926-1004. Recent chats are gated by memoryPolicy.searchPastChats; memory goes through managedMemoryContextLoader with the policy. The 926-1004 range only passes the flags. (scheduled-agent-executor.ts:432-439, 988-996). **Corrected:** At run time the executor passes sources.memory and sources.recentChats into resolveScheduledContext (lines ~405-500), which applies the memory policy and the Search past chats setting; web is enabled only when sources.web is true (line 984).
- **Partly wrong (section 6):** "Save sends sources and connectors to the schedules API (apps/web/app/api/schedules/route.ts:96-139)" The code shows: POST create handler is there (lines 96-136) and passes the body to createSchedule, but route.ts exports only GET and POST. PUT/update lives under [id]/. Section 5 'POST and PUT /api/schedules ... route.ts' is wrong for PUT. The handler also applies rate limit, CSRF, plan quota, workspace feature gate. (apps/web/app/api/schedules/route.ts:96-139; apps/web/app/api/schedules/[id]/route.ts). **Corrected:** POST /api/schedules (route.ts) creates; updates go through apps/web/app/api/schedules/[id]/route.ts.
- **Partly wrong (section 3/10):** "Web form shows four source checkboxes each saved value changes what the run reads (acceptance 1) and defaults" The code shows: Project checkbox is hidden without a project, so often three show; default recentChats is false. (ScheduleAccessFields.tsx:73-74; cloud-contracts schedules.ts:101-106). **Corrected:** Web shows four checkboxes only when the schedule has a project; otherwise three.

**Facts the page missed**

- A schedule made from the Daily briefing template on mobile (and any update without sources) loses recentChats:true, because the mobile template drops sources and the default is recentChats:false: MANAGED_CLOUD_SCHEDULE_DEFAULT_SOURCES at packages/contracts/cloud-contracts/src/schedules.ts:101-106; apps/mobile/src/features/schedules/templates.ts:26-42. The Daily briefing prompt (schedules.ts:~850) asks for recent chats, so the mobile briefing silently lacks that input.
- The executor resolves context through the shared context engine with organization context policy (loadOrganizationContextPolicy) and per-source budgets, so workspace admin policy can also block memory or project sources, not only the user's settings: apps/web/lib/services/scheduled-agent-executor.ts:405-432.
- Web-search and tools are also limited by an attached agent's config (webSearch, allowed/blocked domains), so unchecking is not the only control: scheduled-agent-executor.ts:984-1000.
