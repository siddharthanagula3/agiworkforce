# Claude and ChatGPT desktop help pages, re-read

Status: Current research snapshot
Owner: Product research
Verified: 2026-11-19
Coverage: the public help pages that describe the Claude and ChatGPT desktop apps, compared with a summary of the same pages written on 2026-10-26

This is the dated re-read that `docs/product/competitive-guidance.md` requires before desktop
parity work. It records what the pages say today and what moved since 2026-10-26. It is a lead
for one slice at a time, not a specification: open the page again before building from a row.

## Evidence labels

- **Fetched summary:** the Claude support pages were read through an automated fetch that
  returns a summary, so wording here is second-hand. Confirm the exact label on the page before
  it becomes copy or a setting name.
- **Read:** the OpenAI pages were opened in a browser and read as page text.
- **Not stated:** the pages read did not say.

Support pages show relative dates only ("today", "this week"). Calendar dates below come from
dated changelog entries.

## Pages

| Page                                                                                         | Read on 2026-11-19  | Date the page shows     |
| -------------------------------------------------------------------------------------------- | ------------------- | ----------------------- |
| `support.claude.com/en/articles/10065433-install-claude-desktop`                             | Fetched summary     | "yesterday"             |
| `support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one-claude`              | Fetched summary     | "today"                 |
| `support.claude.com/en/articles/14128542-let-claude-use-your-computer-in-cowork`             | Fetched summary     | "today"                 |
| `support.claude.com/en/articles/16607400-use-the-built-in-browser-in-claude-cowork`          | Fetched summary     | "this week"             |
| `support.claude.com/en/articles/14116274-organize-your-tasks-with-projects-in-claude-cowork` | Fetched summary     | "this week"             |
| `support.claude.com/en/articles/13947068-assign-tasks-from-anywhere-in-claude-cowork`        | Fetched summary     | "this week"             |
| `support.claude.com/en/articles/12626668-use-quick-entry-with-claude-desktop-on-mac`         | Fetched summary     | "over 2 weeks ago"      |
| `help.openai.com/en/articles/20001276-moving-to-the-new-chatgpt-desktop-app`                 | Read                | "21 days ago"           |
| `help.openai.com/articles/9703738-chatgpt-macos-app-release-notes`                           | Read                | newest entry 2026-07-09 |
| `learn.chatgpt.com/docs/whats-new`                                                           | Read, first part    | newest entry 2026-11-17 |
| `learn.chatgpt.com/docs/changelog`                                                           | Read, to 2026-10-13 | newest entry 2026-11-18 |

No page asked for a sign-in. No linked page beyond this list was read.

## Claude desktop today

| Setting or behaviour            | Where the page puts it                                                  | What it changes                                                                                                                              |
| ------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Computer use                    | Settings > Capabilities; older layout Settings > System > This computer | On or off. macOS and Windows. Paid individual plans only. The computer must stay awake with the app open.                                    |
| How the allowed apps are used   | Same section                                                            | Full control takes over the screen. Working in background windows is the default on macOS 15 and later. No other named option on the page.   |
| Preferred browser               | Settings > Cowork                                                       | Built-in browser or the Chrome extension. If the chosen one is unavailable the app says so and uses the other. Owners can turn browsers off. |
| Quick access shortcut           | Settings > Desktop app; older layout Settings > System > This computer  | Double-tap Option by default, or Option+Space, or a custom combination. Quick entry attaches a dragged screenshot or a clicked window.       |
| Voice shortcut                  | Same place                                                              | Off by default. Caps Lock or a custom key. macOS only.                                                                                       |
| Release channel                 | Settings > Desktop app                                                  | Stable by default, or a near-daily channel. Hidden on managed computers.                                                                     |
| Extensions                      | Settings > Desktop app; older builds Settings > Extensions              | Manages installed extensions.                                                                                                                |
| Instructions                    | Settings > Your Claude; older layout Settings > Account                 | Standing instructions for every conversation.                                                                                                |
| Storage folder, trusted folders | Settings                                                                | Where work is saved and which folders need no further prompt.                                                                                |
| Usage                           | Settings > Usage                                                        | Shows plan usage.                                                                                                                            |
| Connectors                      | Customize > Connectors                                                  | Apps the assistant may call.                                                                                                                 |
| Permission mode                 | The message box                                                         | Auto or Manual. The default differs by plan.                                                                                                 |
| Projects                        | Left navigation                                                         | Start from scratch, import from a project, or use an existing folder. Instructions, scheduled tasks, context and project memory.             |
| Phone to desktop                | Not a setting                                                           | Needs a paid individual plan and the desktop awake with the app open.                                                                        |

Local files, the built-in browser and computer use work only while the desktop app is open.
Cloud and scheduled tasks keep running when it is closed. Linux has no self-update, computer
use or dictation.

## ChatGPT desktop today

| Setting or behaviour     | Where the page puts it          | What it changes                                                                                            |
| ------------------------ | ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Places                   | A menu, then a toggle           | The chat product (Chat and Work behind one toggle) or the coding product. macOS and Windows.               |
| History                  | Recents                         | Chat and Work share Recents (sort, filter, pin) and Projects. The coding product keeps a separate history. |
| Start view and app icon  | Settings                        | A person who used the coding app can keep it as the view at launch and choose its icon.                    |
| Companion and quick chat | Settings > Pets                 | Pick a companion or a small window. Option+Space on macOS opens the quick chat.                            |
| Screen capture target    | Settings, "Appshot destination" | Where a captured window is sent. Automatic by default.                                                     |
| Worktrees                | Settings > Worktrees            | "Ask before deleting worktrees."                                                                           |
| Computer history         | Not stated                      | macOS only, paid plans, off by default, and an administrator must enable it for business plans.            |
| Older app                | Not a setting                   | Kept side by side as a "Classic" app, still supported, no migration required.                              |

Cloud Work chats sync across web, mobile and desktop. The coding product is not selectable on
web or mobile; its desktop chats are reachable from a Remote tab in the mobile app.

## What moved since 2026-10-26

- The Claude merge of chat and task work is now described with a rollout by plan, an Auto or
  Manual permission mode, and a "Your Claude" settings location.
- New on the Claude pages: release channels, the Extensions manager, Linux limits, the voice
  shortcut options, Option+Space for quick entry, the built-in browser on Linux, cookie import.
- Claude computer use: the limitations section excludes team and enterprise plans, and the
  page disagrees with itself on that point.
- Claude phone-to-desktop now lists Linux, and the merged-experience page says it is
  unavailable to new users there.
- ChatGPT changelog after 2026-10-26: computer use reaches Work and the coding product,
  interrupted local chats resume on reopen, and the in-app browser can hold keys.
- The ChatGPT page on moving to the new app: no change found.

## Earlier claims the pages no longer support

- "Run new tasks in the cloud" as a setting under Settings > Cowork: not on any page read.
- Background and Full control as two named options: the page names Full control only and
  describes background windows as the default.
- The ChatGPT release-notes list (parallel chats, worktrees, skills, memories, pull-request
  review, dictation): the help release-notes page covers only the Classic app. Parts may sit
  in the changelog beyond the range read, so this is unverified, not refuted.

## What this changes for AGI Workforce

- Settings parity is a moving target on both products: each page gives an older and a newer
  location for the same control. Match the job a person is looking for and keep one location.
- The desktop-specific settings the pages describe are launch and shortcut settings, computer
  use, browser choice, storage and, on Claude only, a release channel. The public desktop
  mounts a pane for each of the first four in `WebSettingsModal.tsx`; whether it offers a
  release channel was not checked for this note.
- Implementation state is in `audit/ledger/ecosystem-capability-ledger.jsonl`, sections 5, 15,
  63 to 65, 68, 70 and 84 to 86. Fourteen desktop cells that said missing or unverified were
  corrected against today's code on 2026-11-19.
