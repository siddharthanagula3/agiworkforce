---
id: "F094-09"
type: "feature"
title: "Personal recap and scheduled-run context"
aliases: ["Reflect", "recap", "Personal recap", "Building your recap...", "Daily briefing", "Daily brief", "What Each Run Can Use", "ScheduleAccessFields", "schedule sources", "recent chats source"]
area: "94 Memory and personalization components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S94.21", "S94.22"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "table:web_conversations", "table:web_messages", "table:user_settings", "table:user_memories", "api:GET /api/reflect", "api:POST /api/schedules", "api:GET /api/schedules", "SYS-memory-projects-and-context", "SYS-agents-tools-and-automation", "SYS-subscriptions-entitlements-and-usage", "SYS-model-catalog-and-routing", "SYS-authorization-and-workspaces", "F094-07"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F094-09 Personal recap and scheduled-run context

Reflect is a recap of a person's chat activity over 30 days, 3 months, 6 months or a year: totals, active days, topics, four pattern notes and ongoing work, built without a model. Separately, a schedule lets a person choose which sources each run may read: project, saved memories, the web, and chats from the last 24 hours.

Area: [94. Memory and personalization components](README.md). Requirement items: [S94.21](../../10-requirements/capabilities/094-memory-and-personalization-components.md#s9421), [S94.22](../../10-requirements/capabilities/094-memory-and-personalization-components.md#s9422).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Reflect: builds counts, topics and plain observations from the person's saved chats and describes patterns without scoring (apps/web/lib/services/reflect-service.ts:127-275). Scheduled-run context: before an unattended run, the server builds only the context the schedule allows (project, memory, recent chats) (apps/web/lib/services/scheduled-agent-executor.ts:409-520).

**Why it exists.** To give people a look back at how they use the product, and to let routines such as a morning brief draw on what they worked on, with the person in control of the sources.

**Who uses it.** Signed-in people with memory on (Reflect) and people with a paid schedule allowance (scheduled runs).

**Problems it solves**

- People forget what they worked on across many chats.
- A morning brief needs recent work and memory but must not read what the person did not allow.
- An unattended run must not use sources the person left unticked.

**Use cases**

- Open Reflect and pick 'Past 3 months' to see topics and ongoing work.
- Create the 'Daily briefing' schedule that reads recent chats, memories and the web.
- Untick 'The web' on a schedule so it cannot search.
- Turn off 'Search past chats' so the recent-chats source gives a notice instead of text.

## 2. User experience

**Where to find it**

- Web: Settings > Reflect; heading 'Reflect', range selector aria-label 'Reflect range', 'Refresh' button (apps/web/features/settings/sections/ReflectSection.tsx:76-120; apps/web/features/settings/components/WebSettingsModal.tsx:298).
- Desktop: Cloud account settings > Reflect (apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx:1241; apps/desktop/src/features/settings/cloud/CloudReflectSection.tsx:86).
- Mobile: Settings > Reflect, Cloud mode and signed in (apps/mobile/src/features/settings/index.tsx:838-844; apps/mobile/app/(app)/settings/reflect.tsx:136).
- Schedules (web): the schedule form has a block 'What Each Run Can Use' with a 'Sources' group (apps/web/features/schedules/components/ScheduleAccessFields.tsx:97-104; ScheduleForm.tsx:731).
- Schedules (desktop): a similar block with project, saved memories and the web only (apps/desktop/src/features/schedules/DesktopScheduleAccessFields.tsx:29-38).
- Mobile: Settings > Notifications daily brief creates a 'Daily brief' schedule from the 'daily-briefing' template with recent chats on (apps/mobile/src/features/settings/notifications/dailyBrief.ts:27-28,78-84; packages/contracts/cloud-contracts/src/schedules.ts:843-855).
- CLI, VS Code and Chrome: no Reflect screen found.

**Before you start**

- Reflect: signed-in account; Memory on and 'Save memories from chats' not off (apps/web/lib/services/reflect-service.ts:65-72).
- Mobile Reflect: Cloud mode and signed in (apps/mobile/app/(app)/settings/reflect.tsx:99-105).
- Schedules: a plan that allows scheduled tasks (apps/web/app/api/schedules/route.ts:101-107).

**Screens and controls**

- Reflect: range choices 'Past 30 days', 'Past 3 months', 'Past 6 months', 'Past year' (web, desktop); '30 days', '3 months', '6 months', '1 year' (mobile) (ReflectSection.tsx:12-17; apps/mobile/src/features/reflect/service.ts:16-21).
- Reflect shows a headline, stats (total chats, active days, most active day, peak hour), a daily activity chart, topics with percentages, four notes and 'ongoing work' (reflect-service.ts:127-275).
- Schedule sources checkboxes: 'Project instructions and files' (only when the schedule has a project), 'Saved memories' (helper 'Read only while memory is on in Settings.'), 'The web', 'Recent chats' (helper 'Your chats from the last 24 hours. Read only while Search past chats is on in Settings.') (ScheduleAccessFields.tsx:30-60).

**Journey**

1. Reflect: open Settings > Reflect; the page builds the recap when opened (copy: 'Built only when you open this page.') (ReflectSection.tsx:88-90).
2. Choose a range or press 'Refresh'.
3. Read the summary, stats, topics and notes; open an ongoing chat from the list.
4. Schedules: open the schedule form, tick sources, save.
5. At run time the server loads only the ticked sources and runs the task; the result is shown in the schedule's run history.

**What the person sees and gets**

- Loading: 'Building your recap...' (ReflectSection.tsx:127-130).
- Memory off: 'Memory is off. Turn on Memory and Save memories from chats to create a recap.' (ReflectSection.tsx:138-142).
- Empty: 'No conversation activity yet' / 'There are no eligible conversations in your <range>.' (reflect-service.ts:196-205).
- Summary body ends 'This recap describes patterns without scoring them.' (reflect-service.ts:250).
- Mobile error: 'Reflect could not load. Check your connection and try again.' (apps/mobile/app/(app)/settings/reflect.tsx:104).
- Scheduled run notices given to the model: 'The user had no chats in the last 24 hours...' or 'The user’s recent chats were not available to this run...' (apps/web/lib/services/past-chat-context-service.ts:51-55).

**Settings**

- capabilities.memory and capabilities.generateFromHistory (Reflect gate).
- capabilities.searchPastChats (recent-chats gate) and capabilities.memory (memory source gate) (managed-memory-context-service.ts:255-281).
- Schedule sources {project, memory, web, recentChats} with defaults project, memory, web true and recentChats false (packages/contracts/cloud-contracts/src/schedules.ts:96-101).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- GET /api/reflect validates range (default 30d) and timezone, is rate limited under 'settings-activity', and returns 409 'memory_required' when memory is off (apps/web/app/api/reflect/route.ts:15-41).
- The recap reads up to 1,000 of the person's non-deleted, non-temporary conversations created in the range, in the person's workspace, skipping chats that carry a cloud agent run (reflect-service.ts:296-345). It uses the first five user messages per chat as a sample, classifies a topic, and builds four notes named delegation, description, discernment and diligence (reflect-service.ts:144-180,215-247). No model is called.
- 'sampled' is true and the count is given when there are more chats than the sample (reflect-service.ts:273-274).
- Ongoing work lists chats that span more than one day or have at least 3 user messages (reflect-service.ts:102-120).
- The Reflect screen exists on web, desktop and mobile with loading, memory-off and error states (apps/web/features/settings/sections/ReflectSection.tsx; apps/desktop/src/features/settings/cloud/CloudReflectSection.tsx:114-119; apps/mobile/app/(app)/settings/reflect.tsx:40-45).
- Schedule creation takes sources and stores them; missing sources fall back to defaults (apps/web/lib/services/schedule-service.ts:632-670,766; scheduled-agent-executor.ts:926).
- A scheduled run builds context only from ticked sources: project (needs the project), memory (policy-checked, project-scoped), recent chats (24 hours, up to 6 chats, 2 messages each, 3,000 characters, excluding temporary and deleted chats) (scheduled-agent-executor.ts:409-520, 1003-1004; past-chat-context-service.ts:38-43,523-527).
- Recent chats are read only when 'Search past chats' is on; otherwise the run gets the 'not available' notice (scheduled-agent-executor.ts:438-440,492-495).
- An empty result gives the fixed empty notice; an unreadable result gives the fixed unavailable notice (past-chat-context-service.ts:51-55; scheduled-agent-executor.ts:486-495).
- Memory in a scheduled run is skipped entirely when memory is off, because the memory policy is handed to the loader (managed-memory-context-service.ts:1138-1146).

**Incomplete**

- Scheduled runs do not apply suppressed memory sources and do not rank memories by relevance (no query is passed) (scheduled-agent-executor.ts:431-436). See F094-07.
- The Slack assistant uses the same memory loader without suppression (apps/web/lib/slack/slack-assistant-turn.ts:189).
- Reflect topics come from a fixed classifier; observations are templates, not model text (reflect-service.ts:215-247).
- Desktop schedule form lacks the 'Recent chats' source (DesktopScheduleAccessFields.tsx:30-38); mobile has no source picker (only the daily brief template sets sources).

**Present but disconnected or switched off**

- Mobile daily brief is available only when the schedules flag is on and the plan allows scheduled tasks (dailyBrief.ts:56-58).
- Connectors in schedules show 'coming soon' when connectors are not released (ScheduleAccessFields.tsx:106-120).

**Not available**

- Reflect: no CLI, VS Code or Chrome screen found.
- Recap by day or week: not offered; only 30d, 90d, 180d, 365d (packages/contracts/cloud-contracts/src/conversations.ts:104).

## 4. Required behaviour

**Established requirements**

- A recap is produced only when the memory-enabled setting is on; otherwise 'memory-disabled'. Temporary chats are excluded. Insights describe patterns without scoring; long lists are sampled and the recap says so. (source: S94.21 (brief); apps/web/lib/services/reflect-service.ts:291,327,250,273)
- A scheduled run's context is built only from the sources the schedule selected; 'Recent chats' is read only while Search past chats is on. (source: S94.22 (brief); scheduled-agent-executor.ts:438-440,1003)
- Empty recent chats gives a fixed notice saying there were no chats in the last 24 hours; an unavailable read gives a fixed unavailable notice. (source: S94.22 (brief); past-chat-context-service.ts:51-55)

**Acceptance criteria**

1. With memory off, GET /api/reflect returns 409 memory_required and the screen shows 'Memory is off'.
2. With memory on and 3 chats in range, the recap totals match and a temporary chat is not counted.
3. With more than 1,000 chats the recap says it is sampled.
4. A schedule with only 'The web' ticked gets no memory, project or recent-chats text in its system prompt.
5. A schedule with 'Recent chats' ticked and 'Search past chats' off gets the unavailable notice, not chat text.
6. A schedule with 'Recent chats' ticked and no chats in 24 hours gets the empty notice.
7. A deleted or temporary chat never appears in the recent-chats text.
8. Changing the range reloads the recap.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Reflect should honour suppressed sources only if it used memories; it uses chats, so the question does not arise. [inferred]
- The recap should drop messages the person deleted; the query filters deleted messages (reflect-service.ts:307-313) and a test covers withdrawn turns (apps/web/lib/services/__tests__/reflect-withdrawal.test.ts). [inferred from test titles]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer day and week ranges, as the brief's wording suggests.
- [proposed] Pass suppressed sources and the run's goal as a query to the scheduled-run memory loader.
- [proposed] Add 'Recent chats' to the desktop form and a source picker on mobile.
- [proposed] Make Reflect available on CLI or state why not.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | reflect-service | `apps/web/lib/services/reflect-service.ts` | loadManagedReflectRecap and buildManagedReflectRecap |
| endpoint | GET /api/reflect | `apps/web/app/api/reflect/route.ts` | Validates query, enforces memory gate, returns recap |
| schema | ManagedCloudReflectRecapSchema | `packages/contracts/cloud-contracts/src/conversations.ts` | Range enum and recap shape (lines 104,306-377) |
| service | conversation-classification-service | `apps/web/lib/services/conversation-classification-service.ts` | Topic classifier used by the recap |
| screen | ReflectSection | `apps/web/features/settings/sections/ReflectSection.tsx` | Web Reflect page |
| hook | useReflectRecap | `apps/web/features/settings/hooks/use-reflect-recap.ts` | Fetch, loading and memory-required state |
| screen | CloudReflectSection | `apps/desktop/src/features/settings/cloud/CloudReflectSection.tsx` | Desktop Reflect page |
| service | fetchCloudReflect | `apps/desktop/src/api/cloudAccountSettings.ts` | Desktop recap fetch; maps 409 memory_required (line 582) |
| screen | ReflectScreen | `apps/mobile/app/(app)/settings/reflect.tsx` | Mobile Reflect page |
| service | fetchReflectRecap | `apps/mobile/src/features/reflect/service.ts` | Mobile recap fetch |
| component | ScheduleAccessFields | `apps/web/features/schedules/components/ScheduleAccessFields.tsx` | Web source checkboxes for a schedule |
| component | DesktopScheduleAccessFields | `apps/desktop/src/features/schedules/DesktopScheduleAccessFields.tsx` | Desktop source checkboxes (no recent chats) |
| config | schedules contract | `packages/contracts/cloud-contracts/src/schedules.ts` | Sources schema and defaults (96-101) and the 'daily-briefing' template (843-855) |
| service | schedule-service | `apps/web/lib/services/schedule-service.ts` | Validates and stores schedule sources |
| endpoint | POST /api/schedules | `apps/web/app/api/schedules/route.ts` | Creates a schedule; plan and quota checks |
| service | scheduled-agent-executor | `apps/web/lib/services/scheduled-agent-executor.ts` | resolveScheduledContext builds the run's context from selected sources |
| service | past-chat-context-service | `apps/web/lib/services/past-chat-context-service.ts` | recentChatsContextLoader and notices |
| service | managed-memory-context-service | `apps/web/lib/services/managed-memory-context-service.ts` | Memory policy and loader used by runs |
| config | context-source | `packages/contracts/context/src/context-source.ts` | Declares the past_chat source class and its producers (recentChatsContextLoader) |
| service | dailyBrief | `apps/mobile/src/features/settings/notifications/dailyBrief.ts` | Mobile daily brief schedule from the template |
| table | web_conversations / web_messages | `apps/web/lib/services/reflect-service.ts` | Source rows for the recap (lines 296-345) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Reflect: the app calls GET /api/reflect with range and the device time zone. | device | apps/mobile/src/features/reflect/service.ts:42-55; apps/web/features/settings/hooks/use-reflect-recap.ts |
| Server reads user settings to check memory and generateFromHistory; if off returns 409. | our servers | reflect-service.ts:286-291; apps/web/app/api/reflect/route.ts:31-41 |
| Server queries chats and user message samples, builds the recap with plain code and returns it with Cache-Control private, no-store. | our servers | reflect-service.ts:293-360; route.ts:43-45 |
| Schedules: the form saves sources with the schedule. | device and our servers | ScheduleAccessFields.tsx:97-104; schedule-service.ts:766,861 |
| At run time the server loads the memory policy, project memory scope and the organisation context policy, then resolves only the ticked loaders and records a manifest. | our servers | scheduled-agent-executor.ts:409-470 |
| The text blocks are placed in the system prompt and the task runs through a model route the server chose for the schedule. | our servers | scheduled-agent-executor.ts:1010-1030; model route chosen at 928-946 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Recap (not stored) | Not stored; computed per request | No | Response is private and not cached (route.ts:43-45) |
| Schedule sources | Schedule record (task sources or metadata) via schedule-service | Server held; all apps read it | Until the schedule is edited or deleted |
| Context manifest of a run | Postgres context manifest store | Server only | Retention not read; unknown |

**Models and providers.** Reflect uses no model. A scheduled run uses a model route chosen for the schedule and the person's plan (scheduled-agent-executor.ts:928-946); the recent chats and memory text are sent to that provider as part of the prompt. Routes that may train on inputs are refused when Google user data is involved (scheduled-agent-executor.ts:931-937).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account for both; Reflect is read with the user-scoped database (apps/web/app/api/reflect/route.ts:25). |
| Permissions | Reflect reads only the person's chats in the active workspace (reflect-service.ts:322-326). A project source needs a project the person owns; the run fails if the project cannot be read (scheduled-agent-executor.ts:990-999). Workspace context policy can withdraw past-chat context (scheduled-agent-executor.ts:466). |
| Subscription | Reflect: none found in the code. Schedules: creation checks the plan's scheduled-task allowance and quota (apps/web/app/api/schedules/route.ts:101-123; packages/contracts/types/src/billing-catalog.ts:816); which plans allow it is unknown from the files read. |
| Limits and metering | Reflect: 1,000 chats sample, rate limit 'settings-activity', ranges 30/90/180/365 days (reflect-service.ts:17-22; route.ts:22). Recent chats: 24 hours, 6 chats, 2 messages each, 400 characters each, 3,000 total (past-chat-context-service.ts:38-43). Memory: 30 items, 8,000 characters (managed-memory-context-service.ts:67-71). Scheduled runs are metered as managed usage by the executor [inferred from cost estimate code at scheduled-agent-executor.ts:1040]. |
| Feature flags | Mobile daily brief needs FEATURES.schedules (dailyBrief.ts:56); schedule connectors need connectorsReleased() (ScheduleAccessFields.tsx:106). |
| Model compatibility | Reflect: none. Schedule runs: tools are withheld for models that run tools inside the provider's turn (scheduled-agent-executor.ts:373-395); context sources are unaffected. |
| Provider restrictions | Schedule runs refuse routes that do not keep inputs out of training when Google user data is present (scheduled-agent-executor.ts:931-937). Reflect: none. |
| Local mode | Reflect is a Cloud feature: mobile requires Cloud mode (reflect.tsx:99-105) and desktop shows it in Cloud account settings. Scheduled runs run on our servers, not on the device. Neither works in Local mode; the app asks for a Cloud account (apps/mobile/app/(app)/settings/reflect.tsx:21-22). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Reflect loading | 'Building your recap...' with a spinner; Refresh disabled. | ReflectSection.tsx:105-130 |
| Memory off | 409 memory_required; web, desktop and mobile show a 'Memory is off' state. | route.ts:31-41; CloudReflectSection.tsx:119; reflect.tsx:40-45 |
| Reflect empty | Headline 'No conversation activity yet'. | reflect-service.ts:196-205 |
| Reflect error | Mobile shows a fixed error with retry by pull-to-refresh; web shows an error from the hook. | reflect.tsx:104; use-reflect-recap.ts |
| Reflect request aborted or superseded | Latest request wins; earlier ones are aborted (mobile). | apps/mobile/app/(app)/settings/reflect.tsx:75-123 |
| Invalid range or timezone | Validation error before any chat is read. | route.ts:15-33; route.test.ts |
| Recent chats empty / unavailable / source off | Empty notice; unavailable notice; unavailable notice when Search past chats is off. | scheduled-agent-executor.ts:486-495 |
| Project cannot be read | The run fails with a project-unavailable error. | scheduled-agent-executor.ts:990-999 |
| Source failed to load | Logged and the run continues without that source. | scheduled-agent-executor.ts:466-471 |
| Accessibility | Web range select has aria-label 'Reflect range'; schedule checkboxes have labels and described-by helper text; desktop chart bars have aria-labels. | ReflectSection.tsx:97; ScheduleAccessFields.tsx:80-92; CloudReflectSection.tsx:160-166 |
| Offline | not handled in the code beyond a generic load error. | reflect.tsx:104 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/reflect-service.test.ts`: Recap building
- `apps/web/lib/services/__tests__/reflect-withdrawal.test.ts`: Withdrawn turns and conversations left out of the recap
- `apps/web/app/api/reflect/route.test.ts`: Owner scoping, validation, memory-required, 401
- `apps/web/features/settings/sections/ReflectSection.test.tsx`: Web Reflect page
- `apps/web/features/settings/hooks/__tests__/useReflectRecap.test.tsx`: Recap hook
- `apps/mobile/__tests__/ReflectScreen.test.tsx`: Mobile Reflect screen
- `apps/mobile/__tests__/ReflectScreenPrivacyCopy.test.tsx`: Mobile Reflect privacy copy
- `apps/desktop/src/features/settings/__tests__/CloudAccountSections.test.tsx`: Desktop cloud sections, including Reflect
- `apps/web/app/api/chat/conversations/__tests__/temporary-conversation-read-paths.test.ts`: Temporary chats excluded from the recap
- `apps/web/lib/services/__tests__/scheduled-agent-context.test.ts`: Per-source loaders, run manifests and project ownership for scheduled runs
- `apps/web/lib/services/__tests__/scheduled-agent-project-context.test.ts`: Project context for scheduled runs
- `apps/web/lib/services/__tests__/past-chat-context-service.test.ts`: Past-chat queries
- `apps/mobile/src/features/schedules/__tests__/ScheduleAccess.test.tsx`: Mobile schedule access
- `apps/web/lib/services/scheduled-agent-executor.test.ts`: Scheduled executor

**Test scenarios**

- **Memory-off Reflect**
  1. Turn off 'Save memories from chats'.
  2. Open Settings > Reflect.
  - Expected: 'Memory is off' state; GET /api/reflect returns 409 memory_required.
- **Range change**
  1. With memory on, open Reflect.
  2. Choose 'Past year'.
  - Expected: The recap reloads with the year label; counts change.
- **Temporary chat excluded**
  1. Create one normal and one temporary chat today.
  2. Open Reflect.
  - Expected: Only the normal chat is counted.
- **Only the web source**
  1. Create a schedule with only 'The web' ticked and run it.
  - Expected: System prompt has no memory, project or recent-chat blocks (check the run manifest).
- **Recent chats with search off**
  1. Turn off 'Search past chats'.
  2. Run a schedule with 'Recent chats' ticked.
  - Expected: The run carries the 'not available' notice and no chat text.
- **Recent chats empty**
  1. Use an account with no chats in 24 hours; run the schedule.
  - Expected: The run carries the 'no chats in the last 24 hours' notice.

**Where to look when it fails**

- Log 'Scheduled run context source failed to load' (scheduled-agent-executor.ts:466).
- Error codes memory_required (409), schedules_not_in_plan (apps/web/app/api/schedules/route.ts:41).
- Context manifest rows for turnId 'schedule-run-<runId>' (scheduled-agent-executor.ts:451).
- Tables web_conversations, web_messages, user_settings.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **The brief's 'day, week' ranges do not exist; ranges start at 30 days** Affects: Web, desktop, mobile Reflect users. Evidence: packages/contracts/cloud-contracts/src/conversations.ts:104. Work needed: Update the brief or add shorter ranges.
- **Suppressed sources and relevance ranking are not applied to scheduled-run memory** Affects: Schedule users on any app. Evidence: scheduled-agent-executor.ts:431-436. Work needed: Pass suppressed sources and a query.
- **Desktop schedule form has no 'Recent chats'; mobile has no source picker** Affects: Desktop and mobile schedule creators. Evidence: DesktopScheduleAccessFields.tsx:30-38; no 'sources' in apps/mobile/src/features/schedules components. Work needed: Add the control or document web-only.
- **Reflect is not on CLI, VS Code or Chrome** Affects: Those users. Evidence: no code found. Work needed: Decide whether needed.
- **Reflect gate uses the memory switch although the recap reads chats, not memories** Affects: People who want a recap without memory. Evidence: reflect-service.ts:65-72. Work needed: Confirm this is a product decision; the copy already tells the person.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- table:web_conversations
- table:web_messages
- table:user_settings
- table:user_memories
- api:GET /api/reflect
- api:POST /api/schedules
- api:GET /api/schedules
- SYS-memory-projects-and-context
- SYS-agents-tools-and-automation
- SYS-subscriptions-entitlements-and-usage
- SYS-model-catalog-and-routing
- SYS-authorization-and-workspaces
- F094-07

## Unknown

- Which plans allow scheduled tasks and how many; billing-catalog was only located (packages/contracts/types/src/billing-catalog.ts:816), not read.
- How long context manifests are kept.
- Whether the mobile app has a source picker in any schedule screen outside the folder searched.
- Whether the CLI can create schedules with sources.
- The exact conversation-classification topics list (file not read).
