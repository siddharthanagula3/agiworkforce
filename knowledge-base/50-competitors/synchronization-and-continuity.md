---
id: "COMP-synchronization-and-continuity"
type: "competitor-trace"
title: "Synchronization and continuity"
competitor_evidence_reviewed: "2026-11-22"
basis: "official competitor pages saved 2026-11-22; AGI status from code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Synchronization and continuity: competitors to requirements

Claude and ChatGPT both keep chats and cloud work on the account across web, desktop and phone. Both let a phone steer work on your own computer, but only in their coding tools (Claude Code, Codex). AGI has account sync built on web, mobile and CLI. Mobile Remote Control and Dispatch are off in v1. Gaps: hand off between hosts, Apple Handoff, send local session to cloud (desktop), admin and trusted-device controls. No person has tested sync across two devices.

**How the products divide this topic.** Division of the topic (evidence reviewed 2026-11-22). Claude (chat product, support.claude.com): account sign-in on web, desktop and phone; conversations carry over (documented for the Education page); log out of all sessions; Cowork cloud sessions follow the account and keep running with the laptop closed; the Chrome side panel saves chats that reopen on other devices. Claude Code (code.claude.com, separate coding tool): Remote Control from phone or browser to a session on your own machine, teleport of a cloud session into the terminal, /desktop hand-off, send a Desktop session to the cloud, Dispatch (phone to Desktop, marked deprecated and not available to new users). Claude Code connects to the Claude chat product through the same account, the Claude phone app Code tab and claude.ai/code. ChatGPT (chat product, help.openai.com and chatgpt.com): chat history syncs across devices; one subscription on all devices; log out of one or all sessions; Cloud Work chats sync across web, mobile and desktop; local Work stays on the computer; Apple Handoff between iPhone and Mac (macOS release notes). Codex (separate coding tool, learn.chatgpt.com and some help.openai.com pages): remote connections from the ChatGPT phone app or another desktop to a host computer, QR pairing, hand off a chat between hosts, SSH hosts. Codex connects to ChatGPT through the ChatGPT desktop and mobile apps (Codex tab or Remote tab) and the same account. Plan limits: Claude Code Remote Control lists Pro, Max, Ultra, Team, Enterprise. Claude Cowork cloud lists Pro, Max, Ultra, Team, Enterprise. ChatGPT Work local sync lists Enterprise and Business (one page) and Paid plans (another). Several ChatGPT remote features are marked rolling out or preview. The catalogue is the only competitor source; any behaviour it does not show is marked unknown. AGI's own rules: two continuity domains (Account Cloud, and Host developer), nothing crosses without an explicit provenance-preserving handoff, Local chats are never synced silently, and Remote Control comes with paid plans only (owner decision 2026-10-22).

Each capability below is traced: competitor evidence, AGI requirement, current implementation, gap, acceptance criteria, verification. Competitor behaviour comes only from the cited pages, reviewed 2026-11-22.

| ID | Capability | Claude | ChatGPT | AGI today | Verified |
|---|---|---|---|---|---|
| [CAP-synchronization-and-continuity-01](#cap-synchronization-and-continuity-01) | Chat history follows the account | partly | yes | built | code inspected only |
| [CAP-synchronization-and-continuity-02](#cap-synchronization-and-continuity-02) | Settings and personalization follow the account | unknown | partly | partly built | code inspected only |
| [CAP-synchronization-and-continuity-03](#cap-synchronization-and-continuity-03) | Memory follows the account | partly | unknown | built | code inspected only |
| [CAP-synchronization-and-continuity-04](#cap-synchronization-and-continuity-04) | Projects, files and artifacts follow the account | partly | unknown | built | seen working by a person |
| [CAP-synchronization-and-continuity-05](#cap-synchronization-and-continuity-05) | Pinned chats sync | unknown | yes | built | seen working by a person |
| [CAP-synchronization-and-continuity-06](#cap-synchronization-and-continuity-06) | Draft message follows the user | unknown | unknown | built | seen working by a person |
| [CAP-synchronization-and-continuity-07](#cap-synchronization-and-continuity-07) | Safe sync: conflicts, offline queue, deletions | unknown | unknown | built | code inspected only |
| [CAP-synchronization-and-continuity-08](#cap-synchronization-and-continuity-08) | Sign in on another device | yes | yes | built | seen working by a person |
| [CAP-synchronization-and-continuity-09](#cap-synchronization-and-continuity-09) | Log out of all devices and sessions | yes | yes | partly built | code inspected only |
| [CAP-synchronization-and-continuity-10](#cap-synchronization-and-continuity-10) | One subscription across devices | unknown | yes | partly built | seen failing by a person |
| [CAP-synchronization-and-continuity-11](#cap-synchronization-and-continuity-11) | Cloud work continues when the device is off | yes | yes | partly built | seen failing by a person |
| [CAP-synchronization-and-continuity-12](#cap-synchronization-and-continuity-12) | Choose cloud or local for continuing work | unknown | yes | partly built | not verified |
| [CAP-synchronization-and-continuity-13](#cap-synchronization-and-continuity-13) | Remote Control: drive a session on your own computer from a phone or browser | yes | yes | off by decision | not verified |
| [CAP-synchronization-and-continuity-14](#cap-synchronization-and-continuity-14) | Pair a device by QR code or code, and revoke | yes | yes | partly built | not verified |
| [CAP-synchronization-and-continuity-15](#cap-synchronization-and-continuity-15) | Device list, host cards and offline explanation | yes | yes | built | code inspected only |
| [CAP-synchronization-and-continuity-16](#cap-synchronization-and-continuity-16) | Dispatch a task from the phone to the desktop | partly | partly | off by decision | not verified |
| [CAP-synchronization-and-continuity-17](#cap-synchronization-and-continuity-17) | Pull a cloud session into the terminal or desktop | yes | partly | partly built | not verified |
| [CAP-synchronization-and-continuity-18](#cap-synchronization-and-continuity-18) | Send a local session to the cloud | yes | no | partly built | not verified |
| [CAP-synchronization-and-continuity-19](#cap-synchronization-and-continuity-19) | Hand off a chat between hosts | unknown | yes | not built | not verified |
| [CAP-synchronization-and-continuity-20](#cap-synchronization-and-continuity-20) | Move a terminal session to the desktop app and between CLI, desktop and IDE | yes | yes | built | not verified |
| [CAP-synchronization-and-continuity-21](#cap-synchronization-and-continuity-21) | Approve and follow a running session from another device | yes | yes | partly built | code inspected only |
| [CAP-synchronization-and-continuity-22](#cap-synchronization-and-continuity-22) | Resume after a dropped connection and resume past sessions | yes | yes | built | seen working by a person |
| [CAP-synchronization-and-continuity-23](#cap-synchronization-and-continuity-23) | Apple Handoff between iPhone and Mac | unknown | yes | not built | not verified |
| [CAP-synchronization-and-continuity-24](#cap-synchronization-and-continuity-24) | Cross-surface: browser extension chats appear in the app | yes | unknown | built | not verified |
| [CAP-synchronization-and-continuity-25](#cap-synchronization-and-continuity-25) | Account skills and plugins sync into the coding tool | yes | partly | partly built | not verified |
| [CAP-synchronization-and-continuity-26](#cap-synchronization-and-continuity-26) | Admin controls for Remote Control and trusted devices | yes | yes | partly built | not verified |
| [CAP-synchronization-and-continuity-27](#cap-synchronization-and-continuity-27) | Move or import conversations between accounts | yes | partly | partly built | code inspected only |

## CAP-synchronization-and-continuity-01 Chat history follows the account

Chats started on one device appear, with full history, on the same account on other devices, and a follow-up on one shows on the others.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (chat); the catalogue shows it only for the Education page and the Chrome panel: partly**
  - [https://support.claude.com/en/articles/11139144-use-claude-for-education-at-your-university](https://support.claude.com/en/articles/11139144-use-claude-for-education-at-your-university): Sign in on web, desktop, iOS or Android and conversations carry over. Plans: Education. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001723-using-the-new-experience-in-the-chatgpt-mobile-app](https://help.openai.com/en/articles/20001723-using-the-new-experience-in-the-chatgpt-mobile-app): Sidebar lists recent chats newest first and syncs across devices. Apps: ios, android.
  - [https://help.openai.com/en/articles/8142208-using-the-chatgpt-mobile-app-classic-experience](https://help.openai.com/en/articles/8142208-using-the-chatgpt-mobile-app-classic-experience): History syncs across devices. Apps: ios, android.

**AGI requirement** (stated requirement; source: docs/product/definition.md, Continuity And Reuse Lock; docs/product/requirements.md section 4.1). Chats, messages and their versions in the signed-in Cloud domain converge across Web, Mobile Cloud and Desktop Cloud. Surface caches are replicas of the account copy.

**With different models, providers and the one subscription.** The stored message keeps its model and provider label, so a chat started with one model can be continued on another device with a different model. Sync needs a signed-in account under the one subscription. In Local mode chats stay on the device and are not synced (requirements.md 21.1 and 21.3).

**Current implementation, as this trace read it on 2026-11-24: built.** Web, Mobile and CLI have cursor-based sync; Desktop shows the same account chats through the hosted web app; VS Code has no Cloud chat sync by design. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S110.18, S90.01, S90.02, S90.17
- Comparison list ids: none matched; rows without an id: no list_id: comparison-web.csv 'Chat history follows the account across web, desktop and phone' (Same); no list_id: comparison-mobile.csv 'Conversations sync across web, desktop and mobile' (Same); no list_id: comparison-desktop.csv 'Chats follow the account across web, desktop and phone' (Same)
- Code: `apps/web/app/api/chat/sync/route.ts:92`; `apps/mobile/services/cloudSyncEngine.ts:405`; `apps/cli/src/cloud/chat.rs:348`; `apps/desktop/electron/main.ts:342`; `packages/contracts/types/src/suite-contracts.ts:164`

**Gap.** No two-device check has been run by a person. Web testers wrote 'Sync to other devices not tested'.

**Acceptance criteria**

1. Sign in on Web and Mobile with one account. Send a message on Web. It appears on Mobile within one pull and the reply streamed on Mobile shows on Web.
2. Delete a chat on Web. It disappears on Mobile and is not recreated by a later push.
3. Turn the phone offline, send a message, go online. The message reaches Web once, without a duplicate.
4. In Local mode on Mobile, the chat does not appear on Web.

**Verification: code inspected only.** Ledger S90.17, S110.18 and the comparison rows are from code reading. In 5-results/basics/scorecards/web.csv, W-3 and W-12 say cross-device sync was not checked; W-13 saw a second tab of one browser show the same chat list, which is not a second device.

## CAP-synchronization-and-continuity-02 Settings and personalization follow the account

Profile, instructions, theme and similar settings saved on the account apply on every device.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/20001274-chatgpt-voice](https://help.openai.com/en/articles/20001274-chatgpt-voice): The audio and video sharing choice applies across devices. This shows one setting that follows the account; no page lists all settings. Plans: Free, Plus, Pro. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/definition.md, Continuity And Reuse Lock (settings, profile instructions and personalization)). Settings and personalization in the account Cloud domain converge across Web, Mobile Cloud and Desktop Cloud. Device-only settings (permissions, local folders, local model downloads) stay on the device.

**With different models, providers and the one subscription.** A saved default model or provider choice is stored by catalogue slot, not by a model ID, so it survives model changes. Entitlement state comes from the one subscription. Local-mode choices stay on the device.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web has a settings sync component; Mobile and Desktop reach it through the hosted app or their own stores. Not checked per setting. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S90.12
- Comparison list ids: none matched; rows without an id: no list_id: comparison-web.csv 'Settings and personalization follow the account' (Better)
- Code: `apps/web/features/settings/components/CloudSettingsSync.tsx:60`

**Gap.** There is no list of which settings sync and which stay on the device. Only Web was compared.

**Acceptance criteria**

1. Change the instructions text on Web. It shows on Mobile after sync.
2. Change a device-only setting (a local folder permission) on Desktop. It does not appear on Web.
3. Sign out and in again. Synced settings return.

**Verification: code inspected only.** Comparison row from code reading. Web scorecard W-1 saw the theme persist across sign-out in one browser only.

## CAP-synchronization-and-continuity-03 Memory follows the account

Saved memories are available on every device, with controls to view and delete them.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/12138966-release-notes](https://support.claude.com/en/articles/12138966-release-notes): Memory from chat history became available to all plans including Free in March 2026. The page does not say it follows the account across devices. Plans: All plans. Apps: web, desktop, ios, android.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (stated requirement; source: docs/product/definition.md, Continuity And Reuse Lock; docs/product/requirements.md line 1524). Cloud memory is part of the account Cloud domain and converges on the Cloud surfaces. Local-only sensitive data is never absorbed into synced memory.

**With different models, providers and the one subscription.** Memory is a store outside any model, so any model can read it. Memory use is metered under the one subscription. Local mode does not write to Cloud memory.

**Current implementation, as this trace read it on 2026-11-24: built.** Web has a memory sync API; the memory page loads it. Desktop and Mobile use the same cloud memory. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched; rows without an id: no list_id: comparison-web.csv 'Memory follows the account' (Same); no list_id: comparison-desktop.csv 'Config, memory and MCP shared across surfaces' (Same)
- Code: `apps/web/app/api/memory/sync/route.ts:364`; `apps/web/features/settings/sections/MemorySection.tsx:240`; `apps/web/features/memory/use-cloud-memory.ts`

**Gap.** Cross-device behaviour not checked by a person.

**Acceptance criteria**

1. Save a memory on Web. It is listed on Mobile.
2. Delete it on Mobile. It is gone on Web.
3. A Local-mode chat adds nothing to Cloud memory.

**Verification: code inspected only.** Web scorecard W-12 saw memory persist and sync from the cloud API in one browser; cross-device was not checked.

## CAP-synchronization-and-continuity-04 Projects, files and artifacts follow the account

Projects and generated artifacts open on any signed-in device and outside the chat that made them.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (Cowork projects): partly**
  - [https://support.claude.com/en/articles/14116274-organize-your-tasks-with-projects-in-claude-cowork](https://support.claude.com/en/articles/14116274-organize-your-tasks-with-projects-in-claude-cowork): Cowork projects are saved to the Claude account so they follow across devices. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: desktop.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (stated requirement; source: docs/product/definition.md, Continuity And Reuse Lock). Projects, Cloud files and artifacts converge across the Cloud surfaces.

**With different models, providers and the one subscription.** Artifacts record which model made them but do not depend on it. Storage counts against the one subscription's quota. Local files are not uploaded unless the user moves them.

**Current implementation, as this trace read it on 2026-11-24: built.** Web has project and artifact sync; other Cloud surfaces use it. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S90.17
- Comparison list ids: none matched; rows without an id: no list_id: comparison-web.csv 'Projects follow the account' (Same); no list_id: comparison-web.csv 'Artifacts follow the account and open outside their chat' (Same)
- Code: `apps/web/app/api/projects/sync/route.ts:286`; `apps/web/features/chat/stores/artifacts-store.ts:18`

**Gap.** Not checked across two devices.

**Acceptance criteria**

1. Create a project on Web. It is listed on Mobile.
2. Make an artifact on Mobile. Open it on Web outside the chat.
3. Reload on Web after the artifact is made. The panel shows Synced.

**Verification: seen working by a person.** Web scorecard W-8 (free): after reload the chat, artifact card and both versions returned and the artifacts panel showed 'Synced'. Same browser only.

## CAP-synchronization-and-continuity-05 Pinned chats sync

Pins set on one device show on the others.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **Codex and ChatGPT desktop/iOS: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Aug 20, 2026: pins stay in sync across ChatGPT desktop and iOS on the same Codex account; Android not included. Apps: desktop, ios.
  - [https://learn.chatgpt.com/docs/whats-new.md](https://learn.chatgpt.com/docs/whats-new.md): Pinned chats sync across the desktop app and iOS (rolling out). Apps: desktop, ios.

**AGI requirement** (inferred; source: competitor parity). Pins, stars and archive state are part of conversation metadata and converge across Cloud surfaces.

**With different models, providers and the one subscription.** Metadata is model independent. Needs sign-in; not synced in Local mode.

**Current implementation, as this trace read it on 2026-11-24: built.** Web, Mobile and Desktop (through the web store). Pinned coding chats on Mobile are not synced. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S90.08, S90.12
- Comparison list ids: M99; rows without an id: no list_id: comparison-desktop.csv 'Pinned chats stay in sync between desktop and phone' (Same); no list_id: comparison-mobile.csv 'Pinned chats stay in sync across devices' (Same)
- Code: `apps/web/app/api/chat/conversations/[id]/route.ts:304`; `apps/web/shared/stores/web-chat-store.ts:631`; `apps/mobile/stores/chat/chatMessageStore.ts:977`

**Gap.** Pinned coding chats do not sync to the phone (M99 Missing). Archived chats lose their pin on Web (W-13 defect).

**Acceptance criteria**

1. Pin a chat on Web. It is pinned on Mobile.
2. Unpin on Mobile. It is unpinned on Web.
3. Archive a pinned chat. The pin state matches on both.

**Verification: seen working by a person.** Web scorecard W-13 (free): rename, pin, archive, restore and delete persisted after reload and a second tab showed the same list. After archive the pin is dropped. Not across devices.

## CAP-synchronization-and-continuity-06 Draft message follows the user

A half-written message is saved per chat and restored, including on another device.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: AGI ledger S90.07 (no competitor page in the catalogue)). A half-written composer message survives reload and offline, and in the Cloud domain follows the user to other devices.

**With different models, providers and the one subscription.** Draft is text only and is independent of model. Not synced in Local mode.

**Current implementation, as this trace read it on 2026-11-24: built.** Web platform done (local and server draft store). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S90.07
- Comparison list ids: none matched
- Code: `apps/web/features/chat/services/conversation-draft.ts:36`; `apps/web/app/api/chat/conversations/[id]/route.ts:225`; `apps/web/db/neon/0219_conversation_drafts.sql:29`

**Gap.** Only Web is listed in the ledger. Mobile and Desktop draft sync is not shown.

**Acceptance criteria**

1. Type a draft on Web, do not send, reload. The draft returns.
2. Go offline, type, send after reconnect. The message sends.
3. Open the same chat on Mobile. The unsent draft shows.

**Verification: seen working by a person.** Web scorecard W-1 and W-3: offline kept the draft and sending after reconnect worked (one browser). Cross-device not seen.

## CAP-synchronization-and-continuity-07 Safe sync: conflicts, offline queue, deletions

Changes made offline are queued and merged without losing or duplicating data. Deletions reach other devices and are not recreated.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: AGI ledger S90.16, S90.19, S90.21, S90.23). Sync pushes carry a base version, conflicts are reconciled, offline changes are queued, and deletions propagate as tombstones. Old clients get an update-required answer, not a parse failure.

**With different models, providers and the one subscription.** Independent of model and provider. Runs only when signed in; none in Local mode.

**Current implementation, as this trace read it on 2026-11-24: built.** Platform and Mobile done; CLI has a handshake. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S90.16, S90.19, S90.21, S90.23
- Comparison list ids: none matched
- Code: `apps/web/app/api/chat/sync/route.ts:197`; `apps/mobile/services/cloudSyncEngine.ts:485`; `apps/mobile/stores/chat/cloudSyncStateStore.ts:41`; `packages/client/sync/src/conversations.ts:49`; `apps/cli/src/cloud/handshake.rs:35`

**Gap.** None known in code. Not run on real devices.

**Acceptance criteria**

1. Edit the same chat title on two devices offline, reconnect. One value wins and both show it.
2. Delete on one device while another is offline, then reconnect the other. The chat stays deleted.
3. An old build opens the app. It shows an update-required message.

**Verification: code inspected only.** Ledger rows read from code; unit tests exist for tombstones (packages/client/sync/src/__tests__/tombstone-coverage.test.ts). No person ran it.

## CAP-synchronization-and-continuity-08 Sign in on another device

A person can reach the same account on a new device, for example by an emailed link or code.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account](https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account): Continue with email sends a login link; opening it on another device shows a verification code to enter on the original device. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10471989-openai-account-sharing-policy](https://help.openai.com/en/articles/10471989-openai-account-sharing-policy): An account is for one individual; using it on multiple devices is fine, usage limits may apply.

**AGI requirement** (stated requirement; source: docs/product/definition.md, Continuity And Reuse Lock (one account, one entitlement)). One account signs in on every surface and device. Sign-in needs no payment. Free local inference works without a paid plan; any sign-in requirement for it is a separate decision.

**With different models, providers and the one subscription.** The account carries the one subscription entitlement to every device. Provider keys (BYOK) and local credentials are not copied between devices.

**Current implementation, as this trace read it on 2026-11-24: built.** Web login offers an emailed code. Other apps use the same account service. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched; rows without an id: no list_id: comparison-web.csv 'Sign in with an emailed code (no password)' (Same)
- Code: `apps/web/features/auth/IdentityAuthAdapter.tsx:40`

**Gap.** Open: whether Local inference needs sign-in (listed under unresolved choices).

**Acceptance criteria**

1. Sign in with an emailed code on a second browser. The same plan and recent chat show.
2. A wrong code shows a clear recovery message.

**Verification: seen working by a person.** Web scorecard W-1 (subscribed): signing back in with the emailed code returned the same identity, plan and recent chat; a wrong code showed a clear red message. Same machine.

## CAP-synchronization-and-continuity-09 Log out of all devices and sessions

One control ends the account's sign-in on every browser, phone, desktop app and coding tool.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/10310342-how-do-i-log-out-of-all-active-sessions](https://support.claude.com/en/articles/10310342-how-do-i-log-out-of-all-active-sessions): Settings > Account > Log Out signs the account out on every browser, mobile device, desktop app, Claude Code and tools like Chrome and Slack; API keys are unaffected. Apps: web, desktop, ios, android, cli, chrome, slack.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001257-managing-active-sessions-in-chatgpt](https://help.openai.com/en/articles/20001257-managing-active-sessions-in-chatgpt): Log out ends a chosen session; Log out of all sessions also ends the current one and can take up to 30 minutes. Plans: All plans. Apps: web, ios, android.
  - [https://help.openai.com/en/articles/9243857-how-do-i-log-out-of-all-of-my-devices](https://help.openai.com/en/articles/9243857-how-do-i-log-out-of-all-of-my-devices): Settings, Security, Log out all ends the current session now and others within 30 minutes. Apps: web.

**AGI requirement** (inferred; source: competitor parity; docs/product/definition.md says parity is measured by revocation). A person can see active sessions and end one or all, and the end reaches every surface including CLI, VS Code and Chrome. The account revokes at once and pairings stop working.

**With different models, providers and the one subscription.** Revoking sign-in does not delete local models or local chats. Provider keys held in the device credential store are not touched.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web has Log out of all devices. CLI and Chrome rows are Missing; CLI can sign out one sign-in from the device list (Partial). Desktop menu has no Log Out item. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: C10, CP8, D103, X1; rows without an id: no list_id: comparison-web.csv 'Log out of all devices' (Same)
- Code: `apps/web/features/settings/sections/SecuritySection.tsx:120`

**Gap.** Chrome and CLI do not offer it; Desktop has no Log Out menu item; no live check that other surfaces are signed out.

**Acceptance criteria**

1. Sign in on Web and CLI. Press Log out of all devices on Web. The CLI is signed out on its next request.
2. Desktop has a Log Out item in the app menu.
3. The device list shows each active sign-in with a name.

**Verification: code inspected only.** Comparison rows from code reading; no scorecard covers it.

## CAP-synchronization-and-continuity-10 One subscription across devices

A plan bought once works on every device and surface of that account.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8142208-using-the-chatgpt-mobile-app-classic-experience](https://help.openai.com/en/articles/8142208-using-the-chatgpt-mobile-app-classic-experience): One account and subscription work on all devices. Apps: ios, android.
  - [https://help.openai.com/en/articles/20001043-how-do-i-avoid-being-charged-twice-if-i-subscribe-to-chatgpt-on-ios-android-and-the-web](https://help.openai.com/en/articles/20001043-how-do-i-avoid-being-charged-twice-if-i-subscribe-to-chatgpt-on-ios-android-and-the-web): Apple, Google Play and web subscriptions are billed and canceled separately; sign in with the same account to reuse a plan. Plans: Go, Plus, Pro. Apps: ios, android, web.

**AGI requirement** (stated requirement; source: docs/product/definition.md, Continuity And Reuse Lock; docs/product/commercial.md). One AGI Subscription system gives entitlements, usage and limits on every app. No separate subscription per surface.

**With different models, providers and the one subscription.** Usage from any model, provider or device is counted against the same quota. No subscription sales on any surface before 2027-01-01 (owner decision 2026-11-15).

**Current implementation, as this trace read it on 2026-11-24: partly built.** Entitlement is one contract. A 'device limit warning' feature is off by decision. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched; rows without an id: no list_id: comparison-mobile.csv 'Device limit warning on paid accounts' (Off by decision)
- Code: `packages/contracts/types/src/billing-catalog.ts`

**Gap.** No live check that a plan bought on one surface shows on another. Web scorecard W-12 hit a lapsed billing period on a test account that still said Active.

**Acceptance criteria**

1. A Premium account on Web shows Premium on Mobile and Desktop.
2. A quota used on Mobile reduces the remaining quota on Web.
3. A lapsed plan shows the same state on every surface.

**Verification: seen failing by a person.** Web scorecard W-12 (subscribed): every chat answer failed with 'billing period ended on Nov 19, 2026' while Billing still said Active. Sign-in on a second surface was not tested.

## CAP-synchronization-and-continuity-11 Cloud work continues when the device is off

Long tasks run on the provider's servers, follow the account across devices and keep going when the laptop closes.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (Cowork): yes**
  - [https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork): Cowork sessions run on Anthropic servers, follow the account across devices and keep working while away; local files, browser and computer need the desktop app open. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web, desktop, ios, android.
  - [https://support.claude.com/en/articles/15520349-use-claude-cowork-on-web-desktop-and-mobile](https://support.claude.com/en/articles/15520349-use-claude-cowork-on-web-desktop-and-mobile): Work runs on servers so it continues when the laptop closes; same sessions and files across devices. Plans: Pro, Max, Ultra. Apps: web, desktop, ios, android.
- **ChatGPT (Work Cloud): yes**
  - [https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex](https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex): Cloud Work chats sync across web, mobile and desktop; local Work runs on the computer. Plans: Paid plans. Apps: web, ios, android, desktop.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 20 (Cloud routine, Dispatch); docs/product/definition.md). Cloud tasks run server-side, show on every device, and continue after the device closes. The task says clearly what runs in the cloud and what needs a device.

**With different models, providers and the one subscription.** Cloud runs bill the one subscription and use the managed routes, so the user sees the model and provider label. Local mode never starts a cloud run silently.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and Mobile list cloud tasks. Cloud execution needs a production switch that the ledger says is not turned on (AGI_E2B_EXECUTION). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S68.06, S68.15
- Comparison list ids: none matched; rows without an id: no list_id: comparison-web.csv 'Cloud work sessions follow the account; device-local work stays on the device' (Same); no list_id: comparison-mobile.csv 'Cloud Work and Code tasks continue across devices' (Same)
- Code: `apps/web/app/tasks/page.tsx:9`; `apps/mobile/src/features/tasks/CloudTasksScreen.tsx`; `apps/web/lib/e2b/gate.ts:16`

**Gap.** Cloud session creation depends on a production switch that is not on per the ledger; web scorecard W-18 could not run a task (GitHub not configured).

**Acceptance criteria**

1. Start a cloud task on Web, close the browser. Mobile shows it progressing and finished.
2. A device-local task is labelled as needing the device and says so when the device is offline.
3. The task cost shows against the one subscription.

**Verification: seen failing by a person.** Web scorecard W-18 (subscribed): blocked, 'GitHub is not configured' so the cloud pull request could not start. W-15 Work mode finished a task in one browser.

## CAP-synchronization-and-continuity-12 Choose cloud or local for continuing work

The user picks whether new work is cloud-coordinated (continuable elsewhere) or stays on the computer. An offline computer can fall back to a cloud container.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT (Work), with Codex pages: yes**
  - [https://learn.chatgpt.com/docs/get-started-with-work.md](https://learn.chatgpt.com/docs/get-started-with-work.md): With Work Cloud and local computer access, a Cloud task started on desktop continues on mobile or web; the laptop must stay online for steps needing its files. Plans: Enterprise, Edu. Apps: desktop, web, ios, android.
  - [https://learn.chatgpt.com/docs/reference/troubleshooting.md](https://learn.chatgpt.com/docs/reference/troubleshooting.md): If the computer is offline, a synced turn may run in a cloud container without local files; turning off local access lets new turns use Work Cloud only. Apps: desktop.
  - [https://help.openai.com/en/articles/20001548-agent-security-and-local-work-sync-in-chatgpt](https://help.openai.com/en/articles/20001548-agent-security-and-local-work-sync-in-chatgpt): New Work tasks started on desktop can continue on web or mobile; steps needing local files still need the computer online; existing tasks are not migrated. Plans: Enterprise, Business. Apps: desktop, web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/definition.md, Continuity And Reuse Lock (explicit provenance-preserving handoff)). Where a task runs (device, our servers, outside service) is shown before it starts and when it continues elsewhere. Moving from local to cloud is an explicit handoff with a preview. A fall-back to cloud never happens silently from Local mode.

**With different models, providers and the one subscription.** The cloud side uses managed models and bills the subscription; the local side can use a local model. Local-to-cloud shows a visible provider label and asks consent.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web has a local-session panel and transfer controls in Code. Desktop 'Move a local session to the cloud' is Missing (D92). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S110.22, S68.13, S68.15, S68.16
- Comparison list ids: D92
- Code: `apps/web/features/code/components/LocalSessionPanel.tsx:221`; `apps/web/features/code/code-surface.ts:319`; `apps/cli/src/cloud/code_handoff.rs:410`

**Gap.** Web, Desktop and Mobile have no explicit local-to-cloud handoff with a preview (S68.16, S68.18 missing).

**Acceptance criteria**

1. Before a move, a screen lists what goes to the cloud (files, context, environment) and needs consent.
2. Move a session. The destination record names the source and the trust boundary.
3. With the computer offline, the app says what cannot run.

**Verification: not verified.** Ledger rows from code reading only.

## CAP-synchronization-and-continuity-13 Remote Control: drive a session on your own computer from a phone or browser

A phone or another browser follows and steers a coding session that keeps running on the person's own computer, with files and tools staying local.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code (reached through claude.ai/code and the Claude phone app): yes**
  - [https://code.claude.com/docs/en/remote-control.md](https://code.claude.com/docs/en/remote-control.md): Connects claude.ai/code or the Claude iOS/Android app to a session on your machine; execution and files stay local; reconnects after sleep or network drops. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: cli, web, ios, android, ide, desktop.
  - [https://code.claude.com/docs/en/mobile.md](https://code.claude.com/docs/en/mobile.md): The computer must stay on with Claude Code or Desktop running; a sleeping machine reconnects when back online. Cloud sessions keep running with the laptop closed. Apps: ios, android.
- **Codex (inside the ChatGPT apps): yes**
  - [https://learn.chatgpt.com/docs/remote-connections.md](https://learn.chatgpt.com/docs/remote-connections.md): The Codex tab or Remote tab in the ChatGPT mobile app, or another desktop app, drives chats on a connected host using that host's projects, files, plugins, Computer Use and sandbox. Apps: ios, android, desktop.
  - [https://learn.chatgpt.com/docs/mobile.md](https://learn.chatgpt.com/docs/mobile.md): Start tasks on Cloud or a connected Mac or Windows PC, follow progress, send instructions, approve commands and review changed files. Apps: ios, android.

**AGI requirement** (stated requirement; source: docs/product/definition.md line 303 (owner decision 2026-10-22); docs/product/requirements.md section 20 (Dispatch)). A paired phone or browser can follow and steer sessions on the person's own computer. Execution, files and approvals stay on that computer. Remote Control comes with paid plans only.

**With different models, providers and the one subscription.** The session uses whatever model and provider the host has configured, including a local model on the host; the phone only relays. The remote link is metered and entitled under the one subscription (paid plans). A Local session is controllable only after an explicit pairing.

**Current implementation, as this trace read it on 2026-11-24: off by decision.** Built on Desktop, Web, VS Code and CLI host side; Mobile screens are hidden in v1 by flags (companion false, dispatch false). Mobile v1 hides Remote Control per the owner decision of 2026-11-14. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S110.21, S68.14, S68.24
- Comparison list ids: VP29, VP58; rows without an id: no list_id: comparison-mobile.csv 'Remote Control: drive a session on your own computer from the phone' (Off by decision); no list_id: comparison-desktop.csv 'Remote Control: follow and steer desktop sessions from the phone' (Off by decision)
- Code: `apps/mobile/lib/v1FeatureFlags.ts:16`; `apps/web/features/desktop-host/components/RemoteControlSection.tsx:50`; `apps/desktop/electron/remote/remoteControlService.ts:29`; `apps/extension-vscode/src/features/remote-control/remoteControlService.ts:312`

**Gap.** Phone side hidden in v1. S68.24 (start a session in an allowed remote folder) is Missing on web and mobile and Partial on desktop; the sending screen is not verified. CLI is Missing for S110.21.

**Acceptance criteria**

1. On a paid account, pair a phone and see a desktop session. A message sent from the phone appears on the desktop.
2. On a Free account, the control explains it needs a paid plan.
3. With the computer asleep, the phone says the computer is offline and what that means.
4. Revoke the pairing on the computer. The phone loses access at once.

**Verification: not verified.** Ledger S68.22 live check is listed as unfinished ('claim returns 200, not 503'). No scorecard or defect row covers it.

## CAP-synchronization-and-continuity-14 Pair a device by QR code or code, and revoke

A phone or other client is paired with a computer by scanning a QR code or entering a code, per device pair, and the pairing can be removed from either side.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/remote-control.md](https://code.claude.com/docs/en/remote-control.md): Open the URL, scan the QR code, or find the session in the app's Code tab marked by a computer icon with a green dot. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web, ios, android, cli.
- **Codex (in ChatGPT): yes**
  - [https://learn.chatgpt.com/docs/remote-connections.md](https://learn.chatgpt.com/docs/remote-connections.md): On the host, Settings > Connections > Control this Mac or PC > Set up shows a QR code; pair each phone with each host; connections unused since June 8 2026 need re-pairing. Apps: desktop, ios, android.

**AGI requirement** (inferred; source: competitor parity; AGI ledger S68.22, S68.23). Pairing is explicit, per device, shows the device name, and is revocable from either side with immediate effect. Signing out turns off Remote Control but keeps pairings.

**With different models, providers and the one subscription.** Pairing carries no model or provider keys. It is gated by the paid plan.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Pair API and revoke built; web and desktop pairing marked Partial pending a live check; Mobile hidden in v1. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S68.22, S68.23
- Comparison list ids: DP4; rows without an id: no list_id: comparison-mobile.csv 'Scan a QR code to pair a computer' (Off by decision); no list_id: comparison-chrome.csv 'Pair with the desktop app' (Same)
- Code: `apps/web/app/api/pair/claim/route.ts:70`; `apps/web/app/api/pair/initiate/route.ts:95`; `services/signaling-server/src/index.ts:787`; `apps/mobile/app/(app)/companion/index.tsx:257`

**Gap.** Live pairing check not done; CLI cannot pair (Missing).

**Acceptance criteria**

1. Scan the QR on the phone. The computer appears as a card with name, platform and status.
2. Revoke on the computer. The phone card shows disconnected.
3. A used or expired code is refused with a clear message.

**Verification: not verified.** Ledger Unfinished note on S68.22 asks for a live check.

## CAP-synchronization-and-continuity-15 Device list, host cards and offline explanation

The person sees which of their computers are available, with name, platform, status and what each can host, and is told what offline means.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/remote-control.md](https://code.claude.com/docs/en/remote-control.md): Failures show reasons like taken over, archived elsewhere or deleted, with reconnect via /remote-control. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: cli.
- **Codex (in ChatGPT): yes**
  - [https://learn.chatgpt.com/docs/mobile.md](https://learn.chatgpt.com/docs/mobile.md): The mobile task list shows active tasks in Cloud and on connected computers and when input is needed. Apps: ios.
  - [https://learn.chatgpt.com/docs/remote-connections.md](https://learn.chatgpt.com/docs/remote-connections.md): Keep-awake setting; Mac laptop needs lid open with power or external display; Sleep stops access. Apps: desktop.

**AGI requirement** (inferred; source: competitor parity; AGI ledger S68.19, S68.20, S68.21, S68.25). Each paired machine shows as a card with name, platform, status and what it can host (local models, browser, MCP, computer use, code sessions). Offline states explain the consequence.

**With different models, providers and the one subscription.** Host cards show whether a local model is available, so the user can choose local or cloud. Host state is not billed.

**Current implementation, as this trace read it on 2026-11-24: built.** Web, Desktop and Mobile done; CLI and VS Code Missing. Keep-awake setting exists on Desktop. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S68.19, S68.20, S68.21, S68.25
- Comparison list ids: MP71; rows without an id: no list_id: comparison-desktop.csv 'Keep the host awake setting' (Same)
- Code: `apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx:75`; `apps/web/features/settings/components/LinkedDevicesPanel.tsx:50`; `apps/mobile/src/features/companion/components/AccountComputersCard.tsx:53`; `apps/desktop/electron/main.ts:17`

**Gap.** Mobile list across cloud and connected computers is Partial (MP71). Mobile screens are hidden in v1.

**Acceptance criteria**

1. Two computers show two cards with correct names and online state.
2. Quit the app on one computer. Its card changes to offline with a plain explanation.
3. The card lists whether it can run a local model.

**Verification: code inspected only.** Ledger rows from code reading.

## CAP-synchronization-and-continuity-16 Dispatch a task from the phone to the desktop

The person sends a task from the phone, and it starts as a session on the paired desktop.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: partly**
  - [https://code.claude.com/docs/en/remote-control.md](https://code.claude.com/docs/en/remote-control.md): Dispatch: pair the Claude mobile app with Desktop to hand off a task that spawns a Desktop session. Status listed as deprecated; table says not available to new users. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: ios, android, desktop.
  - [https://code.claude.com/docs/en/overview.md](https://code.claude.com/docs/en/overview.md): Message a task from the phone and open the Desktop session it creates. Apps: ios, android, desktop.
- **Codex (in ChatGPT): partly**
  - [https://learn.chatgpt.com/docs/remote-connections.md](https://learn.chatgpt.com/docs/remote-connections.md): Start or continue chats, steer, answer questions, approve commands, review outputs and switch hosts (rolling out). The page does not use the word Dispatch. Apps: ios, android, desktop.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 20 (Dispatch from mobile/web to Desktop; Mobile v1 only needs readiness)). A task sent from mobile or web runs on the paired desktop under that desktop's approvals; the result returns to the phone.

**With different models, providers and the one subscription.** The desktop picks the model, which can be local. Approvals are asked on the computer. Entitlement and usage on the one subscription.

**Current implementation, as this trace read it on 2026-11-24: off by decision.** Desktop host and Web code exist. Mobile dispatch flag is false in v1. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S110.21
- Comparison list ids: DP35, M139, M85
- Code: `apps/mobile/lib/v1FeatureFlags.ts:12`; `apps/mobile/src/features/companion/components/DispatchTaskComposer.tsx:181`; `apps/web/features/desktop-host/hooks/use-dispatch-task-runner.ts`

**Gap.** Hidden on Mobile in v1; the sending screen is not verified.

**Acceptance criteria**

1. From a paired phone, send 'list files in my project'. The desktop shows a session and asks for approval.
2. The result shows on the phone.
3. With the desktop off, the phone says so before sending.

**Verification: not verified.** No person run; owner decision keeps the mobile side hidden in v1.

## CAP-synchronization-and-continuity-17 Pull a cloud session into the terminal or desktop

A session that ran in the cloud is brought to a local terminal or desktop so work continues there.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/claude-code-on-the-web.md](https://code.claude.com/docs/en/claude-code-on-the-web.md): claude --teleport, /teleport or Open in > Terminal pulls a cloud session and its branch local; needs clean git state, same repo, pushed branch and same account. Apps: cli, web, desktop.
  - [https://code.claude.com/docs/en/overview.md](https://code.claude.com/docs/en/overview.md): claude --teleport pulls a web or mobile session into the terminal; needs a claude.ai subscription. Plans: claude.ai subscription. Apps: cli, web.
- **Codex: partly**
  - [https://learn.chatgpt.com/docs/remote-connections.md](https://learn.chatgpt.com/docs/remote-connections.md): Hand off a chat between hosts: cloud handoff unsupported. Apps: desktop.

**AGI requirement** (inferred; source: competitor parity; AGI ledger S68.17, S110.23). A cloud coding session can be opened in CLI, Desktop and VS Code, with the branch brought in after review.

**With different models, providers and the one subscription.** The local side continues with the model the user chooses. The local checkout needs a clean state. Uses the same account entitlement.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, Desktop and VS Code done; CLI results back Missing for S68.17; CLI has teleport (Partial CP175). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S110.23, S68.17
- Comparison list ids: CP175; rows without an id: no list_id: comparison-cli.csv 'Pull a cloud session into the terminal' (Same); no list_id: comparison-desktop.csv 'Open a cloud Code session on the desktop' (Same)
- Code: `apps/web/features/desktop-host/components/ContinueOnDesktop.tsx:19`; `apps/web/features/code/components/CodeChangesPanel.tsx:142`; `apps/extension-vscode/src/features/cloud-tasks/cloudCodeSessions.ts:266`

**Gap.** Web S110.23 is Partial because cloud execution is off; CLI cannot apply results.

**Acceptance criteria**

1. From a cloud session, choose Open on Desktop. The same transcript and branch show.
2. Review shows the diff before the branch is brought in.
3. A dirty local tree gives a clear refusal.

**Verification: not verified.** Ledger Unfinished notes say a live check is pending.

## CAP-synchronization-and-continuity-18 Send a local session to the cloud

The person hands a local coding session to a cloud runner, seeing what moves, and it continues there.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/desktop.md](https://code.claude.com/docs/en/desktop.md): Open in Cloud continues the session as a cloud session with the conversation carried as a summary; not possible for SSH or WSL sessions. Apps: desktop.
  - [https://code.claude.com/docs/en/glossary.md](https://code.claude.com/docs/en/glossary.md): --cloud sends a local task to the cloud. Apps: cli.
- **Codex: no**
  - [https://learn.chatgpt.com/docs/remote-connections.md](https://learn.chatgpt.com/docs/remote-connections.md): Hand off a chat between hosts; cloud handoff unsupported. Apps: desktop.

**AGI requirement** (stated requirement; source: docs/product/definition.md, Continuity And Reuse Lock (payload preview, secret scanning, consent)). A local session is handed to cloud execution only after a review of files, context and environment, with consent, and creates a new destination record. Never silent.

**With different models, providers and the one subscription.** The cloud copy uses a managed model and bills the subscription; the user sees the provider label. Local inference sessions that stay local are never uploaded without consent.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI done; VS Code Partial; Web, Desktop and Mobile Missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S110.22, S68.16, S68.18
- Comparison list ids: C113, CP152, D92; rows without an id: no list_id: comparison-cli.csv 'Send a local session to the cloud or another device' (Better)
- Code: `apps/cli/src/lib.rs:2143`; `apps/cli/src/cloud/code_handoff.rs:410`; `apps/extension-vscode/src/features/cloud-tasks/continueInCloud.ts:79`

**Gap.** No explicit handoff screen on Web, Desktop or Mobile; cloud session creation depends on a production switch.

**Acceptance criteria**

1. Run the handoff in CLI. It lists files, context and environment and waits for consent.
2. The cloud session shows the source session as provenance.
3. A secret in the tree is flagged before upload.

**Verification: not verified.** Ledger says VS Code needs AGI_E2B_EXECUTION=1.

## CAP-synchronization-and-continuity-19 Hand off a chat between hosts

The person moves a running chat and its Git state to another connected computer from the chat footer.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **Codex (in ChatGPT): yes**
  - [https://learn.chatgpt.com/docs/remote-connections.md](https://learn.chatgpt.com/docs/remote-connections.md): From the chat footer choose a destination host and Hand off; Git state moves via a worktree; needs a matching saved project; interrupts a running response; cloud handoff unsupported. Apps: desktop.
  - [https://learn.chatgpt.com/docs/whats-new.md](https://learn.chatgpt.com/docs/whats-new.md): Moves a chat and its Git state between your computer and a connected remote host, creating or reusing a worktree on the destination. Apps: desktop, ios.

**AGI requirement** (inferred; source: competitor parity (one competitor only); AGI ledger S68.13). A developer session can be moved between hosts with the same session ID, worktree and branch, as an explicit action.

**With different models, providers and the one subscription.** The model setting travels with the session; the destination host must have access to that provider or a local equivalent.

**Current implementation, as this trace read it on 2026-11-24: not built.** Desktop D91 Missing. Control transfer exists in Web, Desktop, CLI and VS Code for sessions (S68.13) but not a host-to-host chat move. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S68.05, S68.13
- Comparison list ids: D91, DP95
- Code: `apps/web/features/code/components/LocalSessionPanel.tsx:221`

**Gap.** No hand-off between two computers. Worktree association is Missing on Web, Desktop and Mobile.

**Acceptance criteria**

1. From a chat on Computer A, choose Computer B and Hand off. The chat and branch open on B.
2. A running response is stopped first with a notice.
3. A host without the project shows a refusal naming the reason.

**Verification: not verified.** Comparison D91 from code search.

## CAP-synchronization-and-continuity-20 Move a terminal session to the desktop app and between CLI, desktop and IDE

Local coding sessions are shared between the terminal, the desktop app and the editor for the same folder.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/overview.md](https://code.claude.com/docs/en/overview.md): /desktop continues the current session in the Desktop app for visual diff review; macOS and x64 Windows, claude.ai subscription. Plans: claude.ai subscription. Apps: cli, desktop.
  - [https://code.claude.com/docs/en/platforms.md](https://code.claude.com/docs/en/platforms.md): Configuration, project memory and MCP servers are shared among the CLI, Desktop and IDE surfaces on the same project. Apps: cli, desktop, ide.
  - [https://code.claude.com/docs/en/sessions.md](https://code.claude.com/docs/en/sessions.md): Desktop app, claude.ai/code and VS Code each keep their own list; desktop can resume CLI sessions. Apps: desktop, web, ide, cli.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/developer-settings.md](https://learn.chatgpt.com/docs/developer-settings.md): Desktop app and IDE extension in the same project share active chats and editor context; chats can continue across both. Apps: desktop, ide.

**AGI requirement** (stated requirement; source: docs/product/definition.md, Continuity And Reuse Lock (host developer domain)). Desktop Code, CLI and VS Code share session IDs, transcripts, tools, permission decisions and repositories through one host runtime. Resuming appends to the same session ID; forking makes a new one.

**With different models, providers and the one subscription.** Any provider configured on the host works; credentials stay in the OS store and are never copied into cloud sync.

**Current implementation, as this trace read it on 2026-11-24: built.** CLI, Desktop and VS Code done for S110.19 and S110.20. Comparison D90 (Desktop and IDE share chats) says Missing; ledger says done. The ledger is from code reading, the comparison row is a code search that found nothing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S110.19, S110.20, S68.01, S68.02, S68.03, S68.04
- Comparison list ids: C364, CP175, D90; rows without an id: no list_id: comparison-cli.csv 'Move a CLI session to the desktop app' (Same)
- Code: `apps/desktop/electron/runtime/developerSessionService.ts:984`; `apps/cli/src/app_server/developer_host.rs:3659`; `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:939`; `apps/cli/src/lib.rs:2060`

**Gap.** Ledger and comparison disagree on Desktop-IDE sharing; needs a person to check. Task plan and checkpoints are not shared on Web, Desktop or Mobile (S68.07). The --desktop flag is Missing (C364).

**Acceptance criteria**

1. Start a session in the CLI. The Desktop local sessions list for that folder shows it and a message continues it.
2. Open the same session in VS Code. The transcript is the same.
3. Fork it. The fork has a new ID.

**Verification: not verified.** Ledger and comparison disagree; no person run.

## CAP-synchronization-and-continuity-21 Approve and follow a running session from another device

A pending approval, tool activity and turn status show on every attached client, can be answered from any, and notify the user on other devices.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/remote-control.md](https://code.claude.com/docs/en/remote-control.md): Messages, subagent and workflow progress sync across terminal, browser and phone; stopping a task from the device stops it locally. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web, ios, android, cli.
- **Codex (in ChatGPT): yes**
  - [https://learn.chatgpt.com/docs/remote-connections.md](https://learn.chatgpt.com/docs/remote-connections.md): Start or continue chats, steer, answer questions, approve commands, review outputs, diffs and screenshots, get notified. Apps: ios, android, desktop.

**AGI requirement** (inferred; source: competitor parity; AGI ledger S68.08, S68.09, S68.30, S90.18). Approvals, tool activity and finish or failure events reach every attached client and notify the user. The user can stop a run from any client.

**With different models, providers and the one subscription.** Events use one versioned envelope for every model and provider. Notifications go only to devices of the signed-in account.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Mobile, CLI and VS Code done; Web Partial (cloud off); Desktop done for notifications; CLI notifications Missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S68.08, S68.09, S68.11, S68.30, S90.18
- Comparison list ids: CP73; rows without an id: no list_id: comparison-cli.csv 'Approve a tool request from another device' (Same)
- Code: `apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:224`; `apps/cli/src/tui/remote_host.rs:211`; `apps/desktop/electron/runtime/codeSessionActivity.ts:52` (not found); `apps/web/lib/services/agent-notification-service.ts:146`

**Gap.** Read-only attachment (S68.10) and execution-owner indicator (S68.12) are not built on most apps.

**Acceptance criteria**

1. A running session asks for approval. It shows on Mobile and Desktop and answering on one clears the other.
2. A finished turn sends a notification to the other device.
3. Stop from Mobile stops the run.

**Verification: code inspected only.** Ledger rows.

## CAP-synchronization-and-continuity-22 Resume after a dropped connection and resume past sessions

After a network drop or restart, clients reconnect and show the same state; sessions can be resumed or forked.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/remote-control.md](https://code.claude.com/docs/en/remote-control.md): Server mode gives up after about 10 minutes offline; 403 retries up to three minutes; reconnects after sleep or network drops. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: cli.
  - [https://code.claude.com/docs/en/glossary.md](https://code.claude.com/docs/en/glossary.md): Sessions can be resumed with claude -c, forked with --fork-session; /clear starts new while old stays in /resume. Apps: cli.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/whats-new.md](https://learn.chatgpt.com/docs/whats-new.md): iOS release: reliable task reconnect after returning or Face ID unlock. Apps: ios.

**AGI requirement** (inferred; source: competitor parity; AGI ledger S68.26, S90.15). A dropped stream resumes from a sequence cursor without duplicates; local sessions resume under the same session ID.

**With different models, providers and the one subscription.** The cursor is on the event envelope so it works for any model. A resumed session keeps its saved model.

**Current implementation, as this trace read it on 2026-11-24: built.** Desktop, Mobile, CLI, VS Code done; Web has the stream resume route. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S68.26, S90.13, S90.15
- Comparison list ids: VP57; rows without an id: no list_id: comparison-cli.csv 'Resume the latest or a chosen session (--continue, --resume)' (Same)
- Code: `apps/web/lib/services/cloud-agent-run-service.ts:788`; `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/resume/stream/route.ts:74`; `apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:137`

**Gap.** VS Code chat return after reload is Partial (VP57).

**Acceptance criteria**

1. Kill the network mid-answer, restore it. The answer completes without repeated text.
2. Reload Web mid-stream. The partial answer remains.
3. Resume a CLI session by name. It opens with the saved model.

**Verification: seen working by a person.** Web scorecard W-1 and W-3: reload mid-conversation kept the chat and partial answer; Retry after a mid-stream reload completed the answer. One browser.

## CAP-synchronization-and-continuity-23 Apple Handoff between iPhone and Mac

The operating system offers to continue the open chat on the other Apple device.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/9703738-chatgpt-macos-app-release-notes](https://help.openai.com/en/articles/9703738-chatgpt-macos-app-release-notes): Continue a ChatGPT conversation between iPhone and Mac through Handoff. Apps: desktop, ios.

**AGI requirement** (inferred; source: competitor parity (one competitor only)). Where the platform provides a continuity feature, a signed-in Cloud chat can be continued on the other device from it.

**With different models, providers and the one subscription.** Hands off a link to the account chat; only Cloud chats, never Local chats.

**Current implementation, as this trace read it on 2026-11-24: not built.** Missing on Mobile and Desktop. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: D97, M138
- Code: `searched NSUserActivity, handoff in apps/mobile/native and apps/desktop (no match, per comparison)` (not found)

**Gap.** Not built.

**Acceptance criteria**

1. With the same Apple ID, the Mac Dock shows the open phone chat.
2. Opening it shows the same chat from the account.
3. A Local chat is not offered.

**Verification: not verified.** Comparison rows D97 and M138 from code search.

## CAP-synchronization-and-continuity-24 Cross-surface: browser extension chats appear in the app

Chats started in the browser extension side panel show in the main app history and open on other devices.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (Cowork side panel in Chrome): yes**
  - [https://support.claude.com/en/articles/12902405-claude-in-chrome-troubleshooting](https://support.claude.com/en/articles/12902405-claude-in-chrome-troubleshooting): Conversations save to history and reopen on other devices. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: chrome.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (stated requirement; source: docs/product/definition.md, Continuity And Reuse Lock (provenance-eligible Chrome Managed Cloud; browser-task state)). Chrome Managed Cloud chats join the account Cloud domain; browser-task state stays browser-scoped unless the user moves it.

**With different models, providers and the one subscription.** Model-independent. Page content is untrusted and is not synced automatically (requirements.md line 1213).

**Current implementation, as this trace read it on 2026-11-24: built.** Chrome Same for chats in the panel; panel session as a full cloud work session is Partial (XP7). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: XP7; rows without an id: no list_id: comparison-chrome.csv 'Chats started in the panel appear in the app' (Same); no list_id: comparison-chrome.csv 'Sessions saved and synced across web, desktop and mobile' (Same)
- Code: `code path not read for this page` (not found)

**Gap.** Code evidence path not confirmed here.

**Acceptance criteria**

1. Start a chat in the panel. It appears in the web app list.
2. Page content is not saved unless the user chooses.
3. Pairing to the desktop app reconnects after a drop.

**Verification: not verified.** Comparison rows only.

## CAP-synchronization-and-continuity-25 Account skills and plugins sync into the coding tool

Skills and plugins saved on the account load into the terminal tool signed in with the same account.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude to Claude Code: yes**
  - [https://support.claude.com/en/articles/12512180-use-skills-in-claude](https://support.claude.com/en/articles/12512180-use-skills-in-claude): Claude Code signed in with the same account lists synced skills; one-way, checks about every 10 minutes. Plans: Free, Pro, Max, Ultra, Team, Enterprise. Apps: cli.
  - [https://support.claude.com/en/articles/13837440-use-plugins-in-claude](https://support.claude.com/en/articles/13837440-use-plugins-in-claude): Installed and org-distributed plugins sync to Claude Code at each start for Claude-account sign-ins. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: cli, web, desktop.
- **ChatGPT to Codex (comparison note only): partly**
  - no page found in the saved documentation

**AGI requirement** (inferred; source: competitor parity). Skills and plugins installed on the account are available in CLI and VS Code through the same account, subject to workspace policy.

**With different models, providers and the one subscription.** Skills are model independent. Needs sign-in; no account sync with a bare provider key.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI skills synced (Same); plugins and account skills Partial (CP194, CP199). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: CP194, CP199; rows without an id: no list_id: comparison-cli.csv 'Skills synced from the account into the CLI' (Same)
- Code: `apps/cli/src/claude_parity.rs:181`

**Gap.** Plugin sync is partial.

**Acceptance criteria**

1. Install a skill on Web. The CLI lists it after sync.
2. Remove it. It disappears from the CLI.
3. A key-only CLI sign-in does not sync.

**Verification: not verified.** Comparison rows.

## CAP-synchronization-and-continuity-26 Admin controls for Remote Control and trusted devices

Admins can turn Remote Control off for the organization or require verified devices.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/desktop.md](https://code.claude.com/docs/en/desktop.md): Settings > Code toggle makes new sessions connect automatically unless managed remoteControlAtStartup is false. Apps: desktop.
- **Codex (enterprise): yes**
  - [https://learn.chatgpt.com/docs/enterprise/managed-configuration.md](https://learn.chatgpt.com/docs/enterprise/managed-configuration.md): Users can pick up work from another device by remote control; admins can disable it with allow_remote_control=false, which does not disable SSH remote connections. Plans: Enterprise. Apps: desktop.

**AGI requirement** (inferred; source: competitor parity). Organization admins can disable Remote Control and require verified devices. The switch is enforced server-side.

**With different models, providers and the one subscription.** Applies to every model and provider. Local sessions on a managed device obey the same policy.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Admin switch built on Desktop and web console; trusted-device requirement Partial on Web (WP15), Partial on Desktop (DP132), off by decision on Mobile; CLI admin switch Missing (C629, C709). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: C629, C709, DP132, WP15
- Code: `apps/web/features/workspace-console/components/WorkspaceFeatureControls.tsx:45`; `apps/web/features/settings/sections/AccountSection.tsx:629`

**Gap.** No trusted-device enforcement; CLI ignores the admin switch.

**Acceptance criteria**

1. Admin turns Remote Control off. Pairing is refused on every surface including CLI.
2. A device that is not trusted cannot start Remote Control.
3. A user sees why it is unavailable.

**Verification: not verified.** Comparison rows only.

## CAP-synchronization-and-continuity-27 Move or import conversations between accounts

Export from one account and bring into another, or migrate a personal account into an organization.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/9267400-move-your-personal-claude-account-to-a-team-or-enterprise-organization](https://support.claude.com/en/articles/9267400-move-your-personal-claude-account-to-a-team-or-enterprise-organization): Bring what you can moves chats, artifacts, projects, files and memory into the organization account; same email required. Plans: Team, Enterprise. Apps: web, desktop.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/9106926-transfer-exported-conversations-between-chatgpt-accounts](https://help.openai.com/en/articles/9106926-transfer-exported-conversations-between-chatgpt-accounts): Accounts cannot be merged; export and upload conversations.json into a new chat as reference only, not as sidebar history. Plans: Free, Plus, Pro, Edu. Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity; AGI ledger S90.10, S90.22). A person can export and import history, including from other products, and a personal account can move into an organization with a preview of what moves.

**With different models, providers and the one subscription.** Imported chats keep a source label and no model. Subscription is not transferred.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Export and import exist on web; Mobile move by export is Partial (MP72). No personal-to-organization move was found in the sources read. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S90.10, S90.22
- Comparison list ids: MP72
- Code: `apps/web/features/chat/services/conversation-export.ts:31`; `apps/web/app/api/memory/import/route.ts:13`; `apps/mobile/services/cloudDataExport.ts`

**Gap.** Import adapter evidence shown is the memory import route; account-to-organization move not confirmed.

**Acceptance criteria**

1. Export a chat as JSON and import it into a second account. It shows with an imported label.
2. A move to an organization lists what moves before it starts.

**Verification: code inspected only.** Ledger rows.

## Unresolved product choices

Decisions this topic needs from the owner. Nothing here has been decided.

- Whether to match Apple Handoff and a Hand off chat between hosts action, each documented by only one competitor.
- Whether Mobile Remote Control and Dispatch return after v1, and when (owner hid them in v1 on 2026-11-14).
- Whether Local inference on mobile and desktop needs sign-in; the project documents leave sign-in separate from payment.
- Which settings follow the account and which stay on the device; no list exists.
- Whether Read-only session attachment and an execution-owner indicator are wanted (ledger S68.10 and S68.12).
- Whether to build summary-only transfer and transcript branch as separate options when moving a session (S68.28 and S68.29 are marked not applicable).
- Whether Free accounts get any continuity beyond chat sync, given Remote Control is paid-only.
- Whether to build trusted-device verification for Remote Control.

## Could not establish

- No person has run any cross-device test. Web scorecards say sync to a second device was not tested; only one browser, or a second tab, was seen.
- The catalogue does not show whether Claude chat sync works for all plans; the one explicit page is the Education page.
- The catalogue shows nothing about Claude settings sync, ChatGPT memory sync across devices, or ChatGPT projects sync.
- I did not open the saved pages; every competitor statement comes from catalogue lines, not the full page text.
- Claude Code Dispatch status conflicts across catalogue lines (deprecated on one page, usable on another).
- ChatGPT Work local sync plan limits differ by page (Enterprise and Business on one, Paid plans on another, Enterprise and Edu on a third).
- Ledger and comparison disagree on Desktop and IDE session sharing (S110.20 done, D90 Missing).
- Chrome extension code paths for chat sync were not read.
- Mobile and Desktop code was not run, and cloud execution is not on in production according to the ledger, so cloud handoff behaviour could not be tested.
