---
id: "COMP-notifications"
type: "competitor-trace"
title: "Notifications"
competitor_evidence_reviewed: "2026-11-22"
basis: "official competitor pages saved 2026-11-22; AGI status from code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Notifications: competitors to requirements

Both leaders tell users when work finishes or needs them through OS alerts, phone push, email, an in-app bell, terminal bells and hooks. AGI has web, desktop, mobile and Chrome alerts, a bell, quiet hours and break reminders. CLI and VS Code have little. Missing: SMS, per-project mute, event-type filters, agent-sent pushes, inline reply. A person saw the web bell fail twice (wrong or false entries). Delivery on other apps is code-read only.

**How the products divide this topic.** Reviewed 2026-11-22 from the catalogue. Claude (support.claude.com, claude.com) covers: Cowork phone notification when a task finishes or needs input (Pro, Max, Ultra, Team, Enterprise), usage credit alerts, break reminders and quiet hours (beta), Chrome extension notifications, Duet morning brief (preview), and Slack tag-back (Team, Enterprise, beta). Claude Code (code.claude.com) is a separate tool and carries most of the detail: terminal channels, Notification hooks, Remote Control phone pushes (needs Remote Control and Anthropic infrastructure; unavailable on third-party providers), the PushNotification tool, desktop OS alerts for Code sessions, and per-project notification choices. Claude Code connects to Claude through Remote Control, Dispatch and Cowork pushes to the Claude phone app. ChatGPT (help.openai.com) covers scheduled-task push and email, the Mac app background-reply alert, safety notices to parents and trusted contacts, and meeting reminders (Pro, Business, beta). Pages on learn.chatgpt.com (desktop settings, activity bell, pet, dots, webhooks) describe the desktop app and the Codex tool without always separating them; Codex pages (TUI notifications, notify program, app-server) are the coding tool. Dots are rolling out, some Pro (U.S.) beta. Several rows are rolling out or preview. Whether a limit-reset notification exists at either leader is not in the catalogue.

Each capability below is traced: competitor evidence, AGI requirement, current implementation, gap, acceptance criteria, verification. Competitor behaviour comes only from the cited pages, reviewed 2026-11-22.

| ID | Capability | Claude | ChatGPT | AGI today | Verified |
|---|---|---|---|---|---|
| [CAP-notifications-01](#cap-notifications-01) | Alert when a reply finishes while you are away | partly | yes | built | code inspected only |
| [CAP-notifications-02](#cap-notifications-02) | Choose when completion alerts appear | unknown | yes | partly built | not verified |
| [CAP-notifications-03](#cap-notifications-03) | Separate alerts for permission requests and questions | yes | yes | partly built | code inspected only |
| [CAP-notifications-04](#cap-notifications-04) | Activity list (bell) of unread and waiting work | unknown | yes | partly built | seen failing by a person |
| [CAP-notifications-05](#cap-notifications-05) | Bell entries match what really happened | unknown | unknown | partly built | seen failing by a person |
| [CAP-notifications-06](#cap-notifications-06) | Floating status pet | unknown | yes | not built | not verified |
| [CAP-notifications-07](#cap-notifications-07) | Per-category channel picker (push, email, SMS) | unknown | yes | partly built | code inspected only |
| [CAP-notifications-08](#cap-notifications-08) | Scheduled task result by push or email | partly | yes | built | seen working by a person |
| [CAP-notifications-09](#cap-notifications-09) | Monitoring tasks that notify only on change | unknown | yes | partly built | not verified |
| [CAP-notifications-10](#cap-notifications-10) | Phone push for long tasks and decisions | yes | partly | off by decision | not verified |
| [CAP-notifications-11](#cap-notifications-11) | Agent decides to send a push | yes | unknown | not built | not verified |
| [CAP-notifications-12](#cap-notifications-12) | Reply to a notification inline | unknown | yes | partly built | not verified |
| [CAP-notifications-13](#cap-notifications-13) | Agent chooses where to reach you | partly | yes | partly built | not verified |
| [CAP-notifications-14](#cap-notifications-14) | Terminal alert channel | yes | yes | partly built | code inspected only |
| [CAP-notifications-15](#cap-notifications-15) | Alert only when unfocused, filtered by event | partly | yes | not built | code inspected only |
| [CAP-notifications-16](#cap-notifications-16) | Run a command or hook on finish or need | yes | yes | partly built | code inspected only |
| [CAP-notifications-17](#cap-notifications-17) | Background session alerts | yes | unknown | partly built | not verified |
| [CAP-notifications-18](#cap-notifications-18) | Editor alerts in VS Code | partly | partly | partly built | code inspected only |
| [CAP-notifications-19](#cap-notifications-19) | Chrome extension task alerts | yes | unknown | built | code inspected only |
| [CAP-notifications-20](#cap-notifications-20) | Per-project notification setting | yes | unknown | not built | not verified |
| [CAP-notifications-21](#cap-notifications-21) | Quiet hours | yes | unknown | partly built | code inspected only |
| [CAP-notifications-22](#cap-notifications-22) | Break reminders | yes | unknown | built | code inspected only |
| [CAP-notifications-23](#cap-notifications-23) | Usage limit and credit alerts | yes | unknown | partly built | seen failing by a person |
| [CAP-notifications-24](#cap-notifications-24) | Admin spend alerts at thresholds | yes | yes | partly built | code inspected only |
| [CAP-notifications-25](#cap-notifications-25) | Morning brief and proactive digest | yes | unknown | partly built | code inspected only |
| [CAP-notifications-26](#cap-notifications-26) | Account security alerts | unknown | unknown | partly built | seen failing by a person |
| [CAP-notifications-27](#cap-notifications-27) | Safety notifications to a trusted contact or parent | unknown | yes | off by decision | not verified |
| [CAP-notifications-28](#cap-notifications-28) | Plugin and extension notifications and toasts | yes | unknown | not built | not verified |
| [CAP-notifications-29](#cap-notifications-29) | Workspace webhook notifications | unknown | yes | unknown | not verified |
| [CAP-notifications-30](#cap-notifications-30) | Mobile notification settings and OS permission | partly | partly | built | code inspected only |

## CAP-notifications-01 Alert when a reply finishes while you are away

The app tells you a reply or task is done when you are not looking at the window.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code (desktop app): partly**
  - [https://code.claude.com/docs/en/desktop.md](https://code.claude.com/docs/en/desktop.md): Desktop sends an OS notification when a session completes a task while you are not viewing it. Apps: desktop.
- **ChatGPT (Mac app): yes**
  - [https://help.openai.com/en/articles/9703738-chatgpt-macos-app-release-notes](https://help.openai.com/en/articles/9703738-chatgpt-macos-app-release-notes): Mac app notifies when the assistant finishes replying while backgrounded, useful for reasoning models. Apps: desktop.

**AGI requirement** (inferred; source: competitor parity; docs/product/competitive-guidance.md item 158). On web and desktop, a finished reply or task raises a browser or OS notification when the window or tab is hidden, only if the user allowed it, and never while the user is looking.

**With different models, providers and the one subscription.** Same alert for any model or provider. It is a local OS alert, so it works in Local mode with no server.

**Current implementation, as this trace read it on 2026-11-24: built.** Web: browser alert when tab hidden. Desktop: native alert when window hidden. Mobile: Chat replies switch. CLI: bell only. VS Code: none found. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S42.17
- Comparison list ids: WP60
- Code: `apps/web/shared/lib/reply-ready-notification.ts:3`; `apps/web/features/desktop-host/lib/notify.ts:20`; `apps/mobile/src/features/settings/notifications/categories.ts:16`

**Gap.** No banner offering to turn it on (W289). VS Code has no finish alert.

**Acceptance criteria**

1. Hide the tab, finish a reply: one alert appears; clicking it opens that chat.
2. Keep the tab in front: no alert.
3. Permission denied: setting shows it is blocked and no alert fires.

**Verification: code inspected only.** Comparison rows read from code; no person run on file.

## CAP-notifications-02 Choose when completion alerts appear

A setting for never, only in background, or always for turn-completion alerts, with an OS permission prompt.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT desktop or Codex (learn.chatgpt.com): yes**
  - [https://learn.chatgpt.com/docs/notifications.md](https://learn.chatgpt.com/docs/notifications.md): Settings choose whether turn-completion alerts appear never, only when ChatGPT is in the background, or always; OS notification permission may be requested. Apps: desktop.

**AGI requirement** (inferred; source: competitor parity). Desktop and web let the user pick never, background only, or always for completion alerts.

**With different models, providers and the one subscription.** Local preference stored on the device; no entitlement; unchanged in Local mode.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web has an on/off reply-ready setting; no three-way choice found. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S42.17
- Comparison list ids: none matched
- Code: `apps/web/features/settings/sections/NotificationsSection.tsx:47`

**Gap.** No never/background/always choice found; not checked on desktop beyond the web section.

**Acceptance criteria**

1. Each of the three choices changes alert behaviour as described.
2. Choice survives restart.

**Verification: not verified.** Not tested.

## CAP-notifications-03 Separate alerts for permission requests and questions

Toggles for being told that the agent waits for an approval or has a question.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/hooks.md](https://code.claude.com/docs/en/hooks.md): permission_prompt notification fires after about 6 seconds idle; hosts time prompts differently. Apps: cli, ide, desktop.
  - [https://support.claude.com/en/articles/12012173-get-started-with-claude-in-chrome](https://support.claude.com/en/articles/12012173-get-started-with-claude-in-chrome): Chrome tasks notify on completion or when permission is needed. Apps: chrome.
- **ChatGPT desktop or Codex: yes**
  - [https://learn.chatgpt.com/docs/notifications.md](https://learn.chatgpt.com/docs/notifications.md): Separate desktop controls turn permission requests and question prompts on or off. Apps: desktop.

**AGI requirement** (inferred; source: competitor parity; docs/product/competitive-guidance.md item 158 (approval notifications)). Approval-needed and question alerts are separate from completion alerts and can be switched on or off per app.

**With different models, providers and the one subscription.** Approval is raised by AGI's own harness, so it is the same for every model. Local approvals alert on the device.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web: agent approval requests in browser settings. Mobile: approval category with Review action. Chrome: needs-input alert. CLI/VS Code: hook only. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S42.17
- Comparison list ids: CP269, WP214
- Code: `apps/web/features/settings/sections/NotificationsSection.tsx:78`; `apps/mobile/services/notificationEventTypes.ts:4`; `apps/extension/src/background/task-notifications.ts:21`

**Gap.** No separate question toggle; CLI hook fires only for loop detection, not approval prompts.

**Acceptance criteria**

1. Trigger an approval with the toggle on: alert; off: none.
2. Alert names the app and links to the approval.

**Verification: code inspected only.** Code read only.

## CAP-notifications-04 Activity list (bell) of unread and waiting work

A sidebar bell lists chats that are unread, running or waiting on you, with filters and mark all read.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT desktop or Codex: yes**
  - [https://learn.chatgpt.com/docs/notifications.md](https://learn.chatgpt.com/docs/notifications.md): Sidebar bell lists unread, running or awaiting-response chats, filterable by Work, Chat, Pinned and Scheduled, with Mark all as read and a shortcut. Apps: desktop.

**AGI requirement** (inferred; source: competitor parity). A bell shows unread, running and waiting items with filters, mark all read and a keyboard shortcut, and every entry is true to what happened.

**With different models, providers and the one subscription.** List is built from AGI session state, not from model output; same for all models; local sessions listed on device only.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and desktop have a bell with mark all read; no running or waiting view, no filters, no shortcut. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: D10, DP106
- Code: `apps/web/features/notifications/components/NotificationBell.tsx`

**Gap.** No running/waiting view, filters or shortcut. A person saw false entries (see the wrong-bell-entries row).

**Acceptance criteria**

1. Bell badge count equals unread entries.
2. Filters narrow the list.
3. Shortcut opens the list.

**Verification: seen failing by a person.** 6-defects W-1 and W-19: bell showed entries that did not match what happened.

## CAP-notifications-05 Bell entries match what really happened

Notifications must describe real events; no false failure, finish or sign-in entries.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: AGI defects seen in browser; docs/product/experience-contract.md W17 (opted-in notifications arrive once with the correct link)). Each notification is created only by a real event of that type and carries correct text.

**With different models, providers and the one subscription.** Event type comes from AGI harness state, not model output; same for every model and plan.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web bell shows wrong entries; other apps not checked. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: `6-defects/web-problems-seen-in-browser.csv rows W-1, W-19` (not found)

**Gap.** Stopped chat later made an Agent run failed entry; plain chat turns made Agent run finished entries; first sign-in already shows a new-sign-in entry.

**Acceptance criteria**

1. Stop a streaming answer: no failure entry is created.
2. Plain chat turn on an account with no agent run: no Agent run entry.
3. First sign-in: no unread security entry.

**Verification: seen failing by a person.** 6-defects W-1 (major), W-19 and W-1 (cosmetic) on the Free account.

## CAP-notifications-06 Floating status pet

A small floating indicator shows chat status (running, needs input, ready, blocked) while you use other apps.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT desktop or Codex: yes**
  - [https://learn.chatgpt.com/docs/pets.md](https://learn.chatgpt.com/docs/pets.md): Bell icon lists threads with status; priority is needs input, blocked, ready, then running; separate from system notifications. Apps: desktop.

**AGI requirement** (proposed; source: competitor parity (ChatGPT only)). Not required; one competitor only.

**With different models, providers and the one subscription.** Would read local session state; no server needed.

**Current implementation, as this trace read it on 2026-11-24: not built.** No pet; tray exists on desktop. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: `docs/decisions/wire-or-cut.md:62 (unread dock badge cut)`

**Gap.** Whole feature; owner has not decided.

**Acceptance criteria**

1. If adopted: status shows within a second of a state change.

**Verification: not verified.** Nothing to test.

## CAP-notifications-07 Per-category channel picker (push, email, SMS)

Settings pick which kinds of events notify and through which channels.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://learn.chatgpt.com/docs/notifications.md](https://learn.chatgpt.com/docs/notifications.md): Web Settings > Notifications with push, email, SMS channels; categories and channels depend on account. Apps: web.
  - [https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt](https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt): Settings > Notifications selects Push, Email or both. Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity; docs/decisions/2026-09-27-founder-decisions.md (per-category notifications)). Each notification category has its own channel choice; channels that need our servers say so.

**With different models, providers and the one subscription.** Push, email and SMS run on our servers, so Local mode offers device alerts only and labels the others as needing sign-in. Counts under the one subscription system where delivery has cost.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web: push and email per category (few categories). Mobile: push switches; email read-only line. No SMS. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S42.17
- Comparison list ids: MP87, W290, W291, W293, WP215
- Code: `apps/web/features/settings/sections/NotificationsSection.tsx:47`; `apps/mobile/src/features/settings/notifications/NotificationCategoryDetailScreen.tsx:126`

**Gap.** No SMS, no tips or marketing category, no dispatch category on web; mobile cannot set email.

**Acceptance criteria**

1. Change a category channel: next event uses only that channel.
2. Opted-out channel stays silent.
3. Settings are the same on every signed-in app.

**Verification: code inspected only.** Code read only.

## CAP-notifications-08 Scheduled task result by push or email

A scheduled run tells you when it finishes, fails or needs approval.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code (desktop): partly**
  - [https://code.claude.com/docs/en/desktop-scheduled-tasks.md](https://code.claude.com/docs/en/desktop-scheduled-tasks.md): On launch or wake, one catch-up run starts for the most recent missed time within seven days, with a notification. Apps: desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt](https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt): Push, Email or both; web needs browser permission and mobile push needs a task created in the mobile app. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md W17). Each schedule has switches for completed, failed or timed out, approval needed, push and email; opted-out channels stay silent; one run gives one notification.

**With different models, providers and the one subscription.** Scheduled runs are cloud work under the subscription; delivery needs our servers and is not offered in Local mode. Same for any model.

**Current implementation, as this trace read it on 2026-11-24: built.** Web, mobile, Chrome and CLI have completion alerts; VS Code none. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S42.17
- Comparison list ids: MP52, WP136
- Code: `apps/web/features/schedules/components/ScheduleForm.tsx:705`; `apps/web/lib/services/schedule-notification-service.ts:56`

**Gap.** No unread marker on the Schedules list. VS Code has none.

**Acceptance criteria**

1. Run with all channels off: run completes, no notice.
2. Run with push on: one push linking to the result.
3. Failed run: failure notice.

**Verification: seen working by a person.** 5-results W-16: one-time schedule ran once with email and push off; delivery with channels on not seen. Labelled Paused after completion (6-defects W-16).

## CAP-notifications-09 Monitoring tasks that notify only on change

A recurring watch that tells you only when something changed and stops at an end condition.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt](https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt): One-time, recurring and monitoring tasks that notify on changes, use prior runs and stop at an end condition. Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity (ChatGPT only)). A monitor task can notify only on change and can stop at an end condition.

**With different models, providers and the one subscription.** Cloud scheduled work; uses credits per run; not in Local mode.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Mobile has a Monitor template; no notify-on-change rule or end condition. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: MP50
- Code: `apps/mobile/src/features/schedules/templates.ts:24`

**Gap.** Change rule and end condition.

**Acceptance criteria**

1. No change: no notice; change: one notice.
2. Run stops at the end date.

**Verification: not verified.** Not tested.

## CAP-notifications-10 Phone push for long tasks and decisions

Your phone gets a push when a long task finishes or needs a decision.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code via Remote Control; Claude (Cowork): yes**
  - [https://code.claude.com/docs/en/remote-control.md](https://code.claude.com/docs/en/remote-control.md): With Remote Control active, pushes arrive when a long task finishes or a decision is needed; skipped while typing in the terminal. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: cli, ios, android.
  - [https://support.claude.com/en/articles/15520349-use-claude-cowork-on-web-desktop-and-mobile](https://support.claude.com/en/articles/15520349-use-claude-cowork-on-web-desktop-and-mobile): Phone notification arrives on completion or a question. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: desktop, web, ios, android.
- **ChatGPT (dots): partly**
  - [https://learn.chatgpt.com/docs/dots.md](https://learn.chatgpt.com/docs/dots.md): Tell the dot which updates stay in ChatGPT and which go elsewhere; it can message with progress or questions. Apps: ios, android.

**AGI requirement** (inferred; source: competitor parity; docs/product/competitive-guidance.md item 158). Work started on one AGI app can push to the user's phone when it finishes or needs a decision, and is held while the user is active on the origin device.

**With different models, providers and the one subscription.** Push goes through our servers, so Local mode work cannot push to the phone unless the user opts into a visible, consented route (AGENTS.md section 6). Delivery is not model-dependent.

**Current implementation, as this trace read it on 2026-11-24: off by decision.** Mobile approval and completion pushes exist; the Remote Control pushes are hidden in mobile v1. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S42.17
- Comparison list ids: MP89
- Code: `apps/mobile/services/notificationEventTypes.ts:4`; `apps/mobile/lib/v1FeatureFlags.ts (dispatch false)`

**Gap.** CLI-to-phone push off by owner decision (Remote Control hidden in v1, 2026-11-14).

**Acceptance criteria**

1. Start work on web, close it: phone gets one push.
2. No push while the user is active on the origin device.

**Verification: not verified.** No person-run result.

## CAP-notifications-11 Agent decides to send a push

The agent has a tool to notify you when it judges something worth sending.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/tools-reference.md](https://code.claude.com/docs/en/tools-reference.md): PushNotification tool sends a desktop notification locally and a phone push with Remote Control or cloud sessions; unavailable on third-party providers. Apps: cli, ide.
  - [https://code.claude.com/docs/en/settings-reference.md](https://code.claude.com/docs/en/settings-reference.md): Push when Claude decides lets Claude push to your phone while Remote Control is connected. Apps: cli, ios, android.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: competitor parity (Claude Code only)). Not required yet; one competitor only.

**With different models, providers and the one subscription.** A tool the AGI harness gives every model, so it would work with any provider. Phone leg needs our servers.

**Current implementation, as this trace read it on 2026-11-24: not built.** CLI and VS Code have no notify tool. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: C417, V70
- Code: `searched PushNotification in apps/cli/src` (not found)

**Gap.** Whole feature; owner choice open.

**Acceptance criteria**

1. If adopted: ask the agent to notify when tests finish; one alert arrives.

**Verification: not verified.** Nothing to test.

## CAP-notifications-12 Reply to a notification inline

Answer the agent from the notification without opening the app.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT (dots, iOS): yes**
  - [https://learn.chatgpt.com/docs/dots/channels.md](https://learn.chatgpt.com/docs/dots/channels.md): Touch and hold the notification, type a reply and tap Send. Apps: ios.

**AGI requirement** (proposed; source: competitor parity (ChatGPT only)). Approval notifications offer allow and deny actions; typed reply is open.

**With different models, providers and the one subscription.** Reply goes to our servers; not offered in Local mode.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Mobile approval category with a Review action; no typed reply. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: M172
- Code: `docs/decisions/wire-or-cut.md:68`

**Gap.** Typed reply from the lock screen.

**Acceptance criteria**

1. Tap Review on an approval push: the approval opens in the app.

**Verification: not verified.** Not tested.

## CAP-notifications-13 Agent chooses where to reach you

A persistent agent picks text, chat or Slack by how urgent the update is.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (Duet preview, Slack tag): partly**
  - [https://claude.com/product/tag](https://claude.com/product/tag): Surfaces stalled threads, deploy completion and decisions needing you. Plans: Team, Enterprise. Apps: slack.
  - [https://code.claude.com/docs/en/slack.md](https://code.claude.com/docs/en/slack.md): Claude edits its message with the final response and sends the user a direct message linking to it. Apps: slack.
- **ChatGPT (dots): yes**
  - [https://learn.chatgpt.com/docs/whats-new/dots-october-28-2026.md](https://learn.chatgpt.com/docs/whats-new/dots-october-28-2026.md): The dot decides or follows your request where to reach you and sends a link to approve requests in ChatGPT. Plans: Pro (U.S.). Apps: ios, android.

**AGI requirement** (proposed; source: competitor parity). Not decided.

**With different models, providers and the one subscription.** Outside channels leave the device, so each needs consent and a visible label.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Push and email only; no iMessage, RCS or Slack outbound. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W145, W292
- Code: `searched iMessage, RCS, stalled in apps/web` (not found)

**Gap.** Outside channels and proactive nudges.

**Acceptance criteria**

1. If adopted: user picks the channel per update type.

**Verification: not verified.** Nothing to test.

## CAP-notifications-14 Terminal alert channel

The terminal rings the bell or raises a desktop alert when a turn finishes or a prompt waits.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/terminal-config.md](https://code.claude.com/docs/en/terminal-config.md): preferredNotifChannel chooses auto, terminal_bell, iterm2, kitty or ghostty; works over SSH on supported terminals. Apps: cli.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/config-file/config-advanced.md](https://learn.chatgpt.com/docs/config-file/config-advanced.md): Choose terminal notification mechanism (auto, osc9, bel). Apps: cli, ide, desktop.

**AGI requirement** (inferred; source: competitor parity). The CLI picks a channel (bell, terminal alert or none) for finish and approval events.

**With different models, providers and the one subscription.** Local terminal output; works offline and in Local mode; same for any model.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI has a bell on or off (bell_on_finish) and a screen-reader bell. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S42.17
- Comparison list ids: C411, CP301, CP53, CP73
- Code: `apps/cli/src/config.rs:158`; `apps/cli/src/tui/tui_app.rs:8613`

**Gap.** No channel choice and no desktop alert.

**Acceptance criteria**

1. Each channel setting triggers only that mechanism.
2. Setting none stays silent.

**Verification: code inspected only.** Code read only.

## CAP-notifications-15 Alert only when unfocused, filtered by event

Limit terminal alerts to when the terminal is out of focus and to chosen events such as approvals.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: partly**
  - [https://code.claude.com/docs/en/env-vars.md](https://code.claude.com/docs/en/env-vars.md): A variable sends desktop notifications even when the terminal is focused, implying focus is checked by default. Apps: cli.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/config-file/config-sample.md](https://learn.chatgpt.com/docs/config-file/config-sample.md): tui.notifications accepts true/false or a list of event types (agent-turn-complete, approval-requested). Apps: cli.
  - [https://learn.chatgpt.com/docs/config-file/config-advanced.md](https://learn.chatgpt.com/docs/config-file/config-advanced.md): Condition unfocused or always. Apps: cli, ide, desktop.

**AGI requirement** (inferred; source: competitor parity). CLI alerts honour focus and an event list.

**With different models, providers and the one subscription.** Local; no server.

**Current implementation, as this trace read it on 2026-11-24: not built.** Bell rings after any long turn, ignores focus. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: C412
- Code: `apps/cli/src/tui/tui_app.rs:8613`

**Gap.** Focus condition and event filter.

**Acceptance criteria**

1. Focused terminal: no alert; unfocused: alert.
2. Only listed events alert.

**Verification: code inspected only.** Code read only.

## CAP-notifications-16 Run a command or hook on finish or need

A user script runs when a turn ends or input is needed (sound, toast, webhook).

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/hooks-guide.md](https://code.claude.com/docs/en/hooks-guide.md): Notification hook with osascript, notify-send or PowerShell alerts when Claude awaits input; types include permission_prompt, idle_prompt, agent_completed. Apps: cli.
  - [https://code.claude.com/docs/en/hooks.md](https://code.claude.com/docs/en/hooks.md): Hooks can emit allowlisted OSC and BEL sequences for notifications. Apps: cli.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/config-file/config-advanced.md](https://learn.chatgpt.com/docs/config-file/config-advanced.md): Run a script when a turn completes for toasts, webhooks or CI updates. Apps: cli, ide, desktop.

**AGI requirement** (inferred; source: competitor parity). Hooks fire for finish, permission and idle events with typed matchers.

**With different models, providers and the one subscription.** Runs on the device under the user's control; model independent; works in Local mode.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI has Notification and Stop hooks; Notification fires only for loop detection; Stop only on quit. VS Code Hooks view exists. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S42.17
- Comparison list ids: C413, CP267, CP268, CP269
- Code: `apps/cli/src/features/hooks/hooks.rs:357`; `apps/cli/src/agent/chat.rs:3444`

**Gap.** Approval and idle types, per-turn finish hook, terminal sequences.

**Acceptance criteria**

1. Hook fires on approval prompt and on turn finish.
2. Matcher limits by type.

**Verification: code inspected only.** Code read only.

## CAP-notifications-17 Background session alerts

Background sessions tell you when they need input or finish.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/agent-view.md](https://code.claude.com/docs/en/agent-view.md): Sends terminal notification and fires hooks agent_needs_input and agent_completed. Apps: cli.
- **Codex: unknown**
  - no page found in the saved documentation

**AGI requirement** (inferred; source: competitor parity). Background CLI runs alert when they finish or need input.

**With different models, providers and the one subscription.** Local alert; any model.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI background runs: hook only. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: CP73
- Code: `apps/cli/src/agent/chat.rs:3444`

**Gap.** No built-in alert.

**Acceptance criteria**

1. Background run finishing raises one alert naming the run.

**Verification: not verified.** Not tested.

## CAP-notifications-18 Editor alerts in VS Code

The editor shows that a hidden chat finished or needs approval.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code (VS Code): partly**
  - [https://code.claude.com/docs/en/env-vars.md](https://code.claude.com/docs/en/env-vars.md): In Desktop and VS Code, Notification hooks fire for unanswered permission requests. Apps: ide, desktop.
- **Codex (IDE): partly**
  - [https://learn.chatgpt.com/docs/notifications.md](https://learn.chatgpt.com/docs/notifications.md): The IDE has no separate controls but can use notify on the host. Apps: ide.

**AGI requirement** (inferred; source: competitor parity; ledger S42.17 lists VS Code as missing). The VS Code extension flags a hidden chat that needs approval or has finished.

**With different models, providers and the one subscription.** Editor-local UI; same for all models and in Local mode.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Attention badge on the sidebar view exists per comparison; ledger says completion notices missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S42.17
- Comparison list ids: none matched
- Code: `apps/extension-vscode/src/features/sidebar-webview/attentionBadge.ts`

**Gap.** Ledger and comparison disagree; no finish alert confirmed.

**Acceptance criteria**

1. Hide the chat view, trigger approval: badge shows.
2. Finish: a distinct badge or message.

**Verification: code inspected only.** Code read only; disagreement noted.

## CAP-notifications-19 Chrome extension task alerts

Chrome shows a notification when a browser task finishes, fails or needs approval.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (Chrome extension): yes**
  - [https://support.claude.com/en/articles/12012173-get-started-with-claude-in-chrome](https://support.claude.com/en/articles/12012173-get-started-with-claude-in-chrome): Tasks keep running while tabs change, with notifications on completion or when permission is needed. Apps: chrome.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (inferred; source: competitor parity). Chrome alerts for finished, failed and needs-input, with a setting to turn off.

**With different models, providers and the one subscription.** Chrome notification API on the device; same for all models.

**Current implementation, as this trace read it on 2026-11-24: built.** Chrome fires alerts when the panel is not in focus; options toggle. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S42.17
- Comparison list ids: none matched
- Code: `apps/extension/src/background/task-notifications.ts:21`; `apps/extension/src/features/options/notifications-row.ts:18`

**Gap.** none known

**Acceptance criteria**

1. Failed task alerts; toggle off silences it.
2. Panel in focus: no alert.

**Verification: code inspected only.** Code read only.

## CAP-notifications-20 Per-project notification setting

A project menu sets per-turn alerts or turns them off.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code (desktop app): yes**
  - [https://code.claude.com/docs/en/claude-projects.md](https://code.claude.com/docs/en/claude-projects.md): Per-project Notifications menu adds per-turn notifications or turns them off. Plans: Pro, Max, Ultra. Apps: desktop.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: docs/decisions/2026-09-27-founder-decisions.md (S63.30)). Not decided. Owner earlier kept notifications account-wide for routines.

**With different models, providers and the one subscription.** Preference only.

**Current implementation, as this trace read it on 2026-11-24: not built.** No project switch. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: D121
- Code: `searched notification, mute in apps/web/features/projects` (not found)

**Gap.** Whole feature.

**Acceptance criteria**

1. If adopted: mute one project; others still alert.

**Verification: not verified.** Nothing to test.

## CAP-notifications-21 Quiet hours

The product holds nudges and alerts during chosen hours.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/15672868-set-break-reminders-and-quiet-hours](https://support.claude.com/en/articles/15672868-set-break-reminders-and-quiet-hours): Optional nudge after a chosen daily time, and quiet hours by weekday with start and end time. Apps: web, desktop, ios, android.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (inferred; source: competitor parity; ledger S42.16). Quiet hours hold proactive notifications, with security alerts still allowed.

**With different models, providers and the one subscription.** Server-held for push; device-held for local alerts.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, desktop and mobile have it. CLI, VS Code, Chrome do not. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S42.16, S42.23
- Comparison list ids: none matched
- Code: `apps/web/lib/services/quiet-hours-service.ts:35`; `apps/mobile/src/features/settings/notifications/TimeFocusScreen.tsx:207`

**Gap.** CLI, VS Code, Chrome.

**Acceptance criteria**

1. Event in quiet hours: held; security alert still shown.
2. After end time: held items follow.

**Verification: code inspected only.** Code read only.

## CAP-notifications-22 Break reminders

A nudge after a chosen daily time with the product.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/15672868-set-break-reminders-and-quiet-hours](https://support.claude.com/en/articles/15672868-set-break-reminders-and-quiet-hours): Optional beta nudge after a chosen daily time with Claude (stop, snooze or dismiss). Apps: web, desktop, ios, android.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (inferred; source: competitor parity; ledger S42.22). Optional break reminder with stop, snooze, dismiss.

**With different models, providers and the one subscription.** Local timer; works in Local mode.

**Current implementation, as this trace read it on 2026-11-24: built.** Web, desktop, mobile built; others missing by ledger. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S42.22
- Comparison list ids: none matched
- Code: `apps/web/features/time-focus/TimeFocusReminder.tsx:182`; `apps/mobile/src/features/settings/notifications/TimeFocusReminder.tsx:59`

**Gap.** CLI, VS Code, Chrome missing.

**Acceptance criteria**

1. Reminder appears after the chosen time; snooze delays it.

**Verification: code inspected only.** Code read only.

## CAP-notifications-23 Usage limit and credit alerts

The app warns near a usage limit and can tell you when it resets.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans](https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans): Notifications arrive when approaching usage credit limits.
  - [https://support.claude.com/en/articles/8114491-get-started-with-claude](https://support.claude.com/en/articles/8114491-get-started-with-claude): Claude notifies you when you hit a limit. Plans: Free. Apps: web, desktop, ios, android.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (stated requirement; source: owner decision (memory: free usage is Upgrade only); docs/product/commercial.md). Limit state is shown through the one subscription system; free usage screens show only Upgrade, no meters.

**With different models, providers and the one subscription.** Counts come from AGI usage accounting, not provider data, so any model or provider reads the same. Local inference is not metered.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and mobile chat banner with Notify me when it resets. No separate credit alert. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: WP30, WP31
- Code: `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5104`; `packages/ui/unified-chat/src/components/UsageWarningBanner.tsx:17`

**Gap.** No credit alert notification; one threshold only for workspace cap. A person saw a usage meter on a Free screen (6-defects W-16).

**Acceptance criteria**

1. Near limit: banner; at limit: Upgrade and reset notice.
2. Reset: one notification only if requested.

**Verification: seen failing by a person.** 5-results W-16 free: usage meter shown on /upgrade.

## CAP-notifications-24 Admin spend alerts at thresholds

Admins are alerted as an org or pool budget is approached.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/17005973-manage-pooled-group-budgets-on-enterprise-plans](https://support.claude.com/en/articles/17005973-manage-pooled-group-budgets-on-enterprise-plans): Email and in-app notice at 50%, 75%, 95%, 100% of the pool. Plans: Enterprise. Apps: web.
- **ChatGPT: yes**
  - [https://learn.chatgpt.com/docs/enterprise/chatgpt-work-usage-and-cost.md](https://learn.chatgpt.com/docs/enterprise/chatgpt-work-usage-and-cost.md): Alerts notify at configured thresholds to chosen recipients but do not stop spending. Apps: web.

**AGI requirement** (inferred; source: competitor parity). Workspace admins set several thresholds and recipients.

**With different models, providers and the one subscription.** Driven by AGI usage accounting; same across providers.

**Current implementation, as this trace read it on 2026-11-24: partly built.** One alert percentage and notify or block mode. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: DP5, WP30
- Code: `apps/web/app/api/settings/organization/spend-limit/route.ts:37`

**Gap.** Several thresholds and recipient list.

**Acceptance criteria**

1. Crossing each threshold emails each recipient once.

**Verification: code inspected only.** Code read only.

## CAP-notifications-25 Morning brief and proactive digest

A scheduled summary of what needs attention.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (Duet, preview): yes**
  - [https://claude.com/product/claude-duet](https://claude.com/product/claude-duet): Each morning it summarizes what needs attention, with drafts ready. Plans: Pro, Max, Ultra. Apps: ios, android.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: competitor parity (Claude preview only); ledger S42.01). Not decided beyond the daily brief that exists.

**With different models, providers and the one subscription.** Cloud schedule; paid plans; not Local.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Mobile daily brief at a chosen time; briefing home, topics and sources missing in ledger. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S42.01, S42.05, S42.18
- Comparison list ids: none matched
- Code: `apps/mobile/src/features/settings/notifications/dailyBrief.ts:56`

**Gap.** Topics, sources, briefing home, important-change alerts.

**Acceptance criteria**

1. Brief arrives at the chosen time and timezone.

**Verification: code inspected only.** Code read only.

## CAP-notifications-26 Account security alerts

Alerts for sign-in, password, email and device changes.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: AGI only). Security alerts are sent even in quiet hours and only for real events.

**With different models, providers and the one subscription.** Account event, not model related; server delivered.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web email alerts exist; first sign-in shows an unread alert. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: `apps/web/features/settings/sections/NotificationsSection.tsx:67`

**Gap.** False first sign-in entry.

**Acceptance criteria**

1. New device sign-in: one alert; first sign-in: none.

**Verification: seen failing by a person.** 6-defects W-1 cosmetic.

## CAP-notifications-27 Safety notifications to a trusted contact or parent

Limited alerts about serious safety concerns, without chat content.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001195-being-someones-trusted-contact](https://help.openai.com/en/articles/20001195-being-someones-trusted-contact): Contact gets a brief notification to check in, without conversation content. Plans: Personal accounts. Apps: web.
  - [https://help.openai.com/en/articles/12315553-managing-parental-controls-in-chatgpt](https://help.openai.com/en/articles/12315553-managing-parental-controls-in-chatgpt): Limited alerts to parents without transcripts. Plans: All plans.

**AGI requirement** (stated requirement; source: owner decision 2026-11-20 (18 and over)). Parent flow off: every surface is 18 and over. Trusted contact not decided.

**With different models, providers and the one subscription.** Would need our servers and review; no Local equivalent.

**Current implementation, as this trace read it on 2026-11-24: off by decision.** Parent alerts off; trusted contact missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W294, W339
- Code: `apps/web/features/settings/sections/SecuritySection.tsx:319`

**Gap.** Trusted contact undecided.

**Acceptance criteria**

1. No parent flow appears.

**Verification: not verified.** Not tested.

## CAP-notifications-28 Plugin and extension notifications and toasts

Plugins can post a toast, status line or terminal notification.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/plugins/mods/api.md](https://code.claude.com/docs/en/plugins/mods/api.md): Mods show a status line, a toast, a log line, or a terminal notification honoring the user's channel. Apps: cli.
- **Codex: unknown**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: competitor parity (Claude Code only)). Not decided.

**With different models, providers and the one subscription.** Local plugin UI.

**Current implementation, as this trace read it on 2026-11-24: not built.** Plugins cannot post notices. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: C415, V52
- Code: `apps/cli/src/features/plugins/plugins.rs:187`

**Gap.** Whole feature.

**Acceptance criteria**

1. If adopted: plugin toast obeys user mute.

**Verification: not verified.** Nothing to test.

## CAP-notifications-29 Workspace webhook notifications

Admin endpoint receives signed events when a security scan finishes.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT (security scan, preview): yes**
  - [https://learn.chatgpt.com/docs/security/notifications.md](https://learn.chatgpt.com/docs/security/notifications.md): Settings > Notifications > Add takes a public HTTPS endpoint and sends scan.finished or scan.updated events. Apps: web.

**AGI requirement** (proposed; source: competitor parity (ChatGPT preview only)). Not decided.

**With different models, providers and the one subscription.** Server egress; needs egress policy.

**Current implementation, as this trace read it on 2026-11-24: unknown.** No matching row found. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: none cited

**Gap.** Unknown; not searched in code.

**Acceptance criteria**

1. If adopted: test event is signed and arrives.

**Verification: not verified.** Not tested.

## CAP-notifications-30 Mobile notification settings and OS permission

A settings page with a switch per category, plus asking for OS permission.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: partly**
  - [https://code.claude.com/docs/en/settings-reference.md](https://code.claude.com/docs/en/settings-reference.md): Push when actions required and Push when Claude decides toggles in /config. Apps: cli, ios, android.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt](https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt): Mobile push needs a task created in the mobile app. Apps: ios, android.

**AGI requirement** (inferred; source: competitor parity). Mobile has per-category switches and an OS permission row that opens system Settings when blocked.

**With different models, providers and the one subscription.** Local permission; push delivery needs our servers.

**Current implementation, as this trace read it on 2026-11-24: built.** Mobile has categories, daily brief and a Permissions row. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S42.17
- Comparison list ids: MP88, MP89
- Code: `apps/mobile/src/features/settings/notifications/categories.ts:16`; `apps/mobile/src/features/settings/permissions/registry.ts:201`

**Gap.** Code and research switches appear only when the server announces them.

**Acceptance criteria**

1. Deny permission: row offers system Settings.
2. Switch off: no push for that category.

**Verification: code inspected only.** Code read only.

## Unresolved product choices

Decisions this topic needs from the owner. Nothing here has been decided.

- Match ChatGPT's floating status pet (one competitor only)?
- Add SMS as a channel (ChatGPT only)? It needs a phone number and server cost.
- Let the agent send its own pushes (Claude Code PushNotification only)?
- Add a per-project mute (Claude Code desktop only)? An earlier decision kept routine notifications account-wide.
- Allow typed reply from a notification (ChatGPT dots only)?
- Offer outside channels such as iMessage, RCS or Slack for agent updates?
- Trusted contact for adults: build it or not?
- Send mobile pushes from CLI work when Remote Control stays hidden in v1?
- Build workspace webhooks for scan events (ChatGPT preview)?
- Plugin toasts and notifications in the CLI: build or not?

## Could not establish

- Whether Claude or ChatGPT chat apps document a notify me when my limit resets feature; the catalogue has no such row (AGI's comparison files say yes, citing a comparison file, not a saved page).
- Whether the learn.chatgpt.com desktop notification pages describe the ChatGPT desktop app or only Codex; the pages do not separate them.
- Whether Claude chat (not Claude Code) has a desktop or web completion alert; only Claude Code and Cowork rows exist.
- Whether notifications work in AGI Local mode on desktop and mobile; not checked in code.
- How the web notification text copy on CLI, VS Code and Chrome behaves live; no person-run result exists for those apps.
- The conflict between ledger S42.17 (VS Code missing) and the comparison row naming an attention badge.
- Delivery of real push and email on any app; the only person-run scorecard covered a schedule with channels off.
- Whether AGI has workspace webhook notifications; not searched.
