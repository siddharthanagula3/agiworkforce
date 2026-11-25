---
id: "F042-09"
type: "feature"
title: "Reflection and annual recap"
aliases: ["Reflect", "Personal usage reflection (S42.19)", "Annual recap (S42.21)", "Periodic recap (S42.20, not applicable)", "Reflect recap", "Past year recap"]
area: "42 Proactive assistance, briefings, and reflection"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S42.19", "S42.20", "S42.21"]
depends_on: ["surface:web", "surface:mobile", "surface:desktop", "mode:cloud", "api:GET /api/reflect", "table:web_conversations", "table:web_messages", "table:user_settings", "table:user_projects", "SYS-memory-projects-and-context", "SYS-api-and-contracts", "SYS-authentication-and-identity", "SYS-data-model-and-migrations"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F042-09 Reflection and annual recap

Reflect shows a signed-in person patterns in their own chats over 30 days, 3 months, 6 months or a year: topics, active days, peak start time, daily activity and ongoing work. It needs Memory on, is computed by the server on request with no model, and is not stored. No weekly or monthly recap is delivered.

Area: [42. Proactive assistance, briefings, and reflection](README.md). Requirement items: [S42.19](../../10-requirements/capabilities/042-proactive-assistance-briefings-and-reflection.md#s4219), [S42.20](../../10-requirements/capabilities/042-proactive-assistance-briefings-and-reflection.md#s4220), [S42.21](../../10-requirements/capabilities/042-proactive-assistance-briefings-and-reflection.md#s4221).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Builds an on-demand recap from the person's cloud conversations: total conversations, active days, most active day, peak start hour, topic shares, daily activity, four short observations and ongoing work (apps/web/lib/services/reflect-service.ts:127-274).

**Why it exists.** The brief wants a reflection on how the user uses the product (S42.19) and a recap of their past year (S42.21). Periodic recap (S42.20) is not built because neither ChatGPT nor Claude delivers one (doc: docs/decisions/2026-09-27-founder-decisions.md:134-135).

**Who uses it.** A signed-in person who has Memory and 'generate from history' on, on web, desktop (cloud settings) and mobile.

**Problems it solves**

- Shows what the person actually uses the product for.
- Gives a year view without exporting data.
- Points to features that fit the pattern (observations link to projects, skills, Time and focus) (reflect-service.ts:217-248).

**Use cases**

- Open Reflect and pick 'Past 30 days' to see top topics.
- Pick 'Past year' for the annual view.
- Find which long-running chats are 'ongoing work'.
- Turn Memory on when Reflect says it is off.

## 2. User experience

**Where to find it**

- Web: Settings, Reflect pane, heading 'Reflect' (apps/web/features/settings/sections/ReflectSection.tsx:89; apps/web/features/settings/components/WebSettingsModal.tsx:298).
- Mobile: Settings, row 'Reflect', screen titled 'Reflect' (apps/mobile/src/features/settings/index.tsx:839; apps/mobile/app/(app)/settings/reflect.tsx:136).
- Desktop internal Tauri build: cloud Settings, reflect section (apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx:141,1239); the public Desktop shows the hosted web app (doc: AGENTS.md section 5) so the web pane applies there [inferred].
- CLI, VS Code, Chrome: not available.

**Before you start**

- Signed-in cloud account.
- Memory on and 'generate from history' not off (apps/web/lib/services/reflect-service.ts:65-72).
- Mobile: Cloud mode (apps/mobile/app/(app)/settings/reflect.tsx:104-107).

**Screens and controls**

- Web: 'Reflect range' select with 'Past 30 days', 'Past 3 months', 'Past 6 months', 'Past year'; 'Refresh' button (ReflectSection.tsx:10-15,94-118).
- Mobile: four range chips '30 days', '3 months', '6 months', '1 year'; pull to refresh (apps/mobile/src/features/reflect/service.ts:13-18; reflect.tsx:171-205).
- Web stat labels: 'Conversations', 'Active days', 'Most active day', 'Peak start time' (ReflectSection.tsx:201-217).
- Daily bars show the last 60 days (ReflectSection.tsx:79).

**Journey**

1. 1. Open Settings and choose Reflect.
2. 2. The page asks the server for the default 30 day recap using the device time zone.
3. 3. 'Building your recap...' shows while loading.
4. 4. Read the summary, stats, topics, daily activity, observations and ongoing work.
5. 5. Change the range or press Refresh to rebuild.
6. 6. If Memory is off, follow the link to turn it on.

**What the person sees and gets**

- Headline like '<Topic> led your past 30 days' and a body that says patterns are described without scoring (reflect-service.ts:258-261).
- Empty recap: 'No conversation activity yet' (reflect-service.ts:196-199).
- Memory off: web 'Memory is off' with 'Open Personalization settings'; mobile 'Turn on memory to see your patterns here.' and 'Open memory settings' (ReflectSection.tsx:137-146; reflect.tsx:262-272).
- Error: web 'Reflect could not load' with 'Try again'; mobile 'Reflect could not load. Check your connection and try again.' with Retry (ReflectSection.tsx:152-158; reflect.tsx:94).

**Settings**

- Memory and Save memories from chats (Personalization on web; Memory screen on mobile).
- Range selection is per visit; none saved [inferred: state is local to the component].

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- GET /api/reflect validates range and IANA time zone, rate limits under 'settings-activity', and returns the recap with 'private, no-store' (apps/web/app/api/reflect/route.ts:16-47).
- Memory off returns 409 with code memory_required (route.ts:33-42); web, desktop and mobile each map it to a Memory-off state (apps/mobile/src/features/reflect/service.ts:35-37,52; apps/desktop/src/api/cloudAccountSettings.ts:561-585).
- The server reads up to 1,000 conversations in the range, excluding deleted, temporary and cloud agent-run chats, for the active workspace (reflect-service.ts:17,321-336).
- Topic labels come from keyword rules, not a model (apps/web/lib/services/conversation-classification-service.ts:162-187).
- The 'Past year' range is a rolling 365 days (reflect-service.ts:22-27,74-79).
- Nothing is cached or stored; the recap is rebuilt per request (route.ts:45-47).

**Incomplete**

- Annual recap is the same rolling-year view, not a calendar-year 'year in review' and not shareable [inferred from reflect-service.ts:74-79].
- Mobile render of topics, observations and ongoing work was not read in full (only stats at reflect.tsx:345-348).

**Present but disconnected or switched off**

- Nothing found switched off.

**Not available**

- Periodic recap (S42.20): none found; not applicable by founder decision (docs/decisions/2026-09-27-founder-decisions.md:134).
- CLI, VS Code and Chrome: not built (brief S42.19, S42.21).

## 4. Required behaviour

**Established requirements**

- The user can see a reflection on how they use the product. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S42.19)
- The product produces a recap for a recurring period and delivers it; marked not applicable anywhere. (source: S42.20 (same brief); doc: docs/decisions/2026-09-27-founder-decisions.md:134)
- The user can see a recap of their past year. (source: S42.21 (same brief))

**Acceptance criteria**

1. With Memory on and chats in range, each of the four ranges returns a recap whose period label matches the choice.
2. With no chats in range the page shows 'No conversation activity yet' and no topics.
3. With Memory off the server answers 409 memory_required and the page offers the link to turn Memory on.
4. An invalid time zone or range returns a validation error and reads no chat data.
5. Temporary chats and cloud agent-run chats do not count.
6. The response contains no chat text and is marked no-store.
7. On mobile in Local mode the screen shows the sync-blocked banner and does not request a recap.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Topic shares sum to about 100 percent of the sampled conversations [inferred from reflect-service.ts:172-185].
- Recaps for a workspace count only that workspace's chats [inferred from reflect-service.ts:325].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer a calendar-year recap if the founder wants a year in review.
- [proposed] Let Local-mode mobile chats count, computed on the device.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET /api/reflect | `apps/web/app/api/reflect/route.ts` | Validates query, loads recap, 409 when Memory is off. |
| service | reflect-service | `apps/web/lib/services/reflect-service.ts` | SQL read, recap builder, memory check. |
| service | conversation-classification-service | `apps/web/lib/services/conversation-classification-service.ts` | Keyword topic classifier and topic labels. |
| schema | ManagedCloudReflectRecapSchema | `packages/contracts/cloud-contracts/src/conversations.ts` | Range enum and recap shape (lines 104-105,306-377). |
| component | ReflectSection | `apps/web/features/settings/sections/ReflectSection.tsx` | Web UI. |
| hook | useReflectRecap | `apps/web/features/settings/hooks/use-reflect-recap.ts` | Loads and refreshes with workspace and session binding. |
| component | WebSettingsModal reflect pane | `apps/web/features/settings/components/WebSettingsModal.tsx` | Mounts ReflectSection (line 298). |
| screen | Mobile ReflectScreen | `apps/mobile/app/(app)/settings/reflect.tsx` | Range chips, states, refresh. |
| service | mobile reflect service | `apps/mobile/src/features/reflect/service.ts` | fetchReflectRecap and memory-required error. |
| component | CloudReflectSection | `apps/desktop/src/features/settings/cloud/CloudReflectSection.tsx` | Internal desktop UI. |
| service | fetchCloudReflectRecap | `apps/desktop/src/api/cloudAccountSettings.ts` | Desktop API call (lines 561-585). |
| table | web_conversations | `apps/web/lib/services/reflect-service.ts` | Read for the period (lines 321-336). |
| table | web_messages | `apps/web/lib/services/reflect-service.ts` | First user messages sampled, up to 5 per chat, 2,000 characters each (lines 299-318). |
| table | user_settings | `apps/web/lib/services/reflect-service.ts` | capabilities.memory and generateFromHistory (lines 287-291). |
| table | user_projects | `apps/web/lib/services/reflect-service.ts` | Project name for ongoing work (line 322). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The page picks range and time zone and calls GET /api/reflect. | device | apps/mobile/src/features/reflect/service.ts:39-47; apps/web/features/settings/hooks/use-reflect-recap.ts |
| The server checks auth, rate limit and the query. | our servers | apps/web/app/api/reflect/route.ts:21-31 |
| It reads user_settings and stops with memory-disabled if Memory is off. | our servers | reflect-service.ts:287-291 |
| It reads conversations and message samples for the range from the database. | our servers | reflect-service.ts:293-346 |
| It counts days and hours in the person's time zone, classifies topics by keywords, builds observations and ongoing work, and validates against the schema. | our servers | reflect-service.ts:127-274 |
| The client validates the response with the same schema and renders it. | device | apps/mobile/src/features/reflect/service.ts:45-50 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Recap (counts, topics, observations) | Not stored; built per request, Cache-Control private, no-store | No | Gone when the response is dropped |
| Source conversations and messages | table:web_conversations and table:web_messages | Cloud chats only | By the chat retention rules, not by Reflect; withdrawal of history consent is tested (apps/web/lib/services/__tests__/reflect-withdrawal.test.ts) |

**Models and providers.** No model or provider is called. Topics come from keyword rules (conversation-classification-service.ts:162-187). The route is therefore model agnostic and provider agnostic.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in cloud account (mobile shows 'CloudAccountRequired' otherwise: reflect.tsx:140-153). |
| Permissions | Reads only the signed-in user's chats in the active workspace (route.ts:25; reflect-service.ts:324-325). Requires Memory capability on. |
| Subscription | No plan gate found in the route or service. |
| Limits and metering | Rate limit bucket 'settings-activity' (route.ts:22); at most 1,000 conversations read (reflect-service.ts:17). No credits metering found. |
| Feature flags | none found in the code |
| Model compatibility | Not applicable: no model. |
| Provider restrictions | none found in the code |
| Local mode | Does not work in Local mode. Mobile only requests a recap in Cloud mode and shows a banner to switch (reflect.tsx:104-107,176-182; test: apps/mobile/__tests__/ReflectScreen.test.tsx). Local chats on the phone are not read. Signing in is required; no payment gate found. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Web 'Building your recap...'; mobile 'Building your recap…'. | ReflectSection.tsx:127-132; reflect.tsx |
| Empty | Honest empty recap, no topics. | reflect-service.ts:187-212 |
| Memory off | 409 and a link to Memory settings. | route.ts:33-42 |
| Error and retry | Message plus 'Try again' (web) or 'Retry loading Reflect' (mobile). | ReflectSection.tsx:152-158; reflect.tsx:305 |
| Superseded request | Mobile aborts earlier requests when range changes or screen unmounts and ignores late results. | reflect.tsx:76-118; test: apps/mobile/__tests__/ReflectScreen.test.tsx:103-135 |
| Sampling | If more than 1,000 chats, the recap says it is sampled and gives the sampled count. | reflect-service.ts:272-273 |
| Offline | Shown as the generic error; no cached recap. | reflect.tsx:94 |
| Signed out | Mobile shows a sign-in prompt; server returns 401 (test: route.test.ts:90). | reflect.tsx:140-153 |
| Accessibility | Mobile range chips carry accessibilityState selected and labels 'Show the past ...'; web select has an aria-label. | reflect.tsx:176-192; ReflectSection.tsx:97 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/reflect/route.test.ts`: Owner-only load, invalid query, memory-required 409, 401.
- `apps/web/lib/services/reflect-service.test.ts`: Recap maths, empty recap, memory gate, owner binding and exclusion of temporary and agent chats in the query.
- `apps/web/lib/services/__tests__/reflect-withdrawal.test.ts`: Loader SQL statements under a statement-scanning fake [inferred from imports].
- `apps/web/features/settings/sections/ReflectSection.test.tsx`: Web section.
- `apps/web/features/settings/hooks/__tests__/useReflectRecap.test.tsx`: Hook loading and scope binding.
- `apps/mobile/__tests__/ReflectScreen.test.tsx`: Header, abort handling, superseded refresh.
- `apps/mobile/__tests__/ReflectScreenPrivacyCopy.test.tsx`: Privacy copy on the mobile screen.
- `apps/desktop/src/api/__tests__/cloudAccountSettings.test.ts`: Desktop fetch and memory-required error.

**Test scenarios**

- **Four ranges**
  1. Seed chats across 12 months.
  2. Open Reflect on web and select each range.
  - Expected: Period label and counts change; 'Past year' covers 365 days.
- **Memory off**
  1. Turn Memory off.
  2. Open Reflect on web and mobile.
  - Expected: No recap; message and link to turn Memory on.
- **Exclusions**
  1. Create a temporary chat and a cloud agent run.
  2. Open Reflect.
  - Expected: Neither counts in Conversations.
- **Mobile Local mode**
  1. Switch the phone app to Local mode.
  2. Open Settings, Reflect.
  - Expected: Banner to switch to Cloud; no network call.
- **Time zone**
  1. Change device time zone.
  2. Reopen Reflect.
  - Expected: Most active day and peak hour shift to the new zone.

**Where to look when it fails**

- HTTP 409 with error.code memory_required; HTTP 400 validation for 'Invalid Reflect query'.
- Rate limit responses from bucket settings-activity.
- Mobile console 'Reflect could not load' state.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/042-proactive-assistance-briefings-and-reflection.md](../../70-qa/test-plans/web/042-proactive-assistance-briefings-and-reflection.md)
- Desktop: [70-qa/test-plans/desktop/042-proactive-assistance-briefings-and-reflection.md](../../70-qa/test-plans/desktop/042-proactive-assistance-briefings-and-reflection.md)
- Mobile: [70-qa/test-plans/mobile/042-proactive-assistance-briefings-and-reflection.md](../../70-qa/test-plans/mobile/042-proactive-assistance-briefings-and-reflection.md)

## 10. Gaps and dependencies

- **No periodic (week or month) delivered recap.** Affects: All apps. Evidence: Brief S42.20; docs/decisions/2026-09-27-founder-decisions.md:134. Work needed: None while the founder decision holds.
- **Annual recap is a rolling 365-day view, no calendar year or share.** Affects: Web, desktop, mobile. Evidence: reflect-service.ts:22-27. Work needed: Product decision, then a year-in-review view.
- **Not on CLI, VS Code, Chrome.** Affects: Those apps. Evidence: audit/partial/042-proactive-assistance-briefings-and-reflection.md S42.19, S42.21. Work needed: Decide scope per surface.
- **Local chats are not included.** Affects: Mobile Local-mode users. Evidence: reflect.tsx:104-107; reflect-service.ts reads cloud tables. Work needed: On-device recap or a clear statement.
- **Ongoing work and topics rely on keyword rules, so topic accuracy is limited.** Affects: All users. Evidence: conversation-classification-service.ts:162-187. Work needed: Evaluate accuracy; consider a better classifier.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:desktop
- mode:cloud
- api:GET /api/reflect
- table:web_conversations
- table:web_messages
- table:user_settings
- table:user_projects
- SYS-memory-projects-and-context
- SYS-api-and-contracts
- SYS-authentication-and-identity
- SYS-data-model-and-migrations

## Unknown

- How mobile renders topics, observations and ongoing work (only stats lines were read).
- Whether the public Electron Desktop shows the web Reflect pane unchanged.
- Retention of source chats.
- What reflect-withdrawal.test.ts asserts beyond its imports.
- The exact mobile Settings location label group of the 'Reflect' row.
