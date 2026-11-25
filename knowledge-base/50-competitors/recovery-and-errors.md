---
id: "COMP-recovery-and-errors"
type: "competitor-trace"
title: "Recovery behaviour"
competitor_evidence_reviewed: "2026-11-22"
basis: "official competitor pages saved 2026-11-22; AGI status from code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Recovery behaviour: competitors to requirements

Recovery is well documented by ChatGPT (retry in place, regenerate, kept drafts, delete is permanent, Library restore) and by Claude Code (resume, rewind, interrupt). The Claude chat catalogue is thin: error text and limits only. AGI has most of the behaviour in code. A person saw offline drafts, kept stopped answers and reload work on web. They also saw faults: a stale offline banner, a lost answer on reload, and a delete dialog that says "cannot be undone" while a 30-day restore exists. The CLI has gaps.

**How the products divide this topic.** Review date 2026-11-22. Claude (chat, support.claude.com) documents error messages, limits, capacity messages, length limits, and deleting a chat with a 30-day purge; it does not document retry, regenerate, offline behaviour or restore of deleted chats in the catalogue, so those are has: unknown. Claude Code (code.claude.com and its help articles) owns session resume, rewind and checkpoints, interrupts, and auto-continue of cut-off turns; these are a separate coding tool and are not evidence for the Claude chat app. ChatGPT (help.openai.com) documents error fixes, Regenerate, inline retry, draft saving, archive and permanent delete, Library Recently deleted, and iOS retry. Codex (learn.chatgpt.com) documents thread archive/unarchive, revert, steer, interrupt, queue; it is a separate coding tool that connects to ChatGPT through the same plan and shared chats in the desktop app. Plan limits: Claude limit messages vary by plan (five-hour and weekly limits, usage credits on paid plans); ChatGPT context-full notice is Free-plan; Library restore and search-regenerate are plan or workspace scoped. AGI facts come from QA comparison CSVs, the area-19 and area-88 ledgers, and code. Only the Web scorecards (2026-11-24) and the web problems file count as seen by a person; Desktop shows the hosted web app, so web evidence covers it only in part. Competitor columns in the AGI comparison CSVs were not used as evidence.

Each capability below is traced: competitor evidence, AGI requirement, current implementation, gap, acceptance criteria, verification. Competitor behaviour comes only from the cited pages, reviewed 2026-11-22.

| ID | Capability | Claude | ChatGPT | AGI today | Verified |
|---|---|---|---|---|---|
| [CAP-recovery-and-errors-01](#cap-recovery-and-errors-01) | Retry a failed answer in place | unknown | yes | partly built | seen failing by a person |
| [CAP-recovery-and-errors-02](#cap-recovery-and-errors-02) | Regenerate with the same or another model | unknown | yes | built | seen working by a person |
| [CAP-recovery-and-errors-03](#cap-recovery-and-errors-03) | Regenerate with web search | unknown | partly | partly built | code inspected only |
| [CAP-recovery-and-errors-04](#cap-recovery-and-errors-04) | Stop an answer and keep what arrived | yes | yes | partly built | seen failing by a person |
| [CAP-recovery-and-errors-05](#cap-recovery-and-errors-05) | Continue a cut-off answer | partly | unknown | built | seen working by a person |
| [CAP-recovery-and-errors-06](#cap-recovery-and-errors-06) | Reconnect and resume a dropped stream | unknown | partly | partly built | code inspected only |
| [CAP-recovery-and-errors-07](#cap-recovery-and-errors-07) | Reload during an answer | unknown | partly | partly built | seen failing by a person |
| [CAP-recovery-and-errors-08](#cap-recovery-and-errors-08) | Offline: keep the draft and send on reconnect | unknown | partly | partly built | seen failing by a person |
| [CAP-recovery-and-errors-09](#cap-recovery-and-errors-09) | Unsent draft restored | unknown | yes | built | seen working by a person |
| [CAP-recovery-and-errors-10](#cap-recovery-and-errors-10) | Plain error messages with a next step | yes | yes | partly built | seen failing by a person |
| [CAP-recovery-and-errors-11](#cap-recovery-and-errors-11) | Usage limit reached: what happens next | yes | unknown | partly built | seen failing by a person |
| [CAP-recovery-and-errors-12](#cap-recovery-and-errors-12) | Long chat full: recover without losing the chat | yes | yes | unknown | not verified |
| [CAP-recovery-and-errors-13](#cap-recovery-and-errors-13) | Error reference ID for support | unknown | yes | built | code inspected only |
| [CAP-recovery-and-errors-14](#cap-recovery-and-errors-14) | Status page and incident notices | yes | partly | partly built | code inspected only |
| [CAP-recovery-and-errors-15](#cap-recovery-and-errors-15) | Provider unavailable: try another model | partly | partly | built | seen failing by a person |
| [CAP-recovery-and-errors-16](#cap-recovery-and-errors-16) | Failed upload or attachment keeps the draft | unknown | unknown | partly built | seen failing by a person |
| [CAP-recovery-and-errors-17](#cap-recovery-and-errors-17) | Queue, steer or interrupt a running turn | yes | yes | partly built | code inspected only |
| [CAP-recovery-and-errors-18](#cap-recovery-and-errors-18) | Restore a deleted chat (Recently deleted) | unknown | no | partly built | seen failing by a person |
| [CAP-recovery-and-errors-19](#cap-recovery-and-errors-19) | Archive, unarchive and undo | unknown | yes | partly built | seen working by a person |
| [CAP-recovery-and-errors-20](#cap-recovery-and-errors-20) | Restore a deleted file (Library) | unknown | yes | built | code inspected only |
| [CAP-recovery-and-errors-21](#cap-recovery-and-errors-21) | Resume a saved coding session | yes | yes | partly built | code inspected only |
| [CAP-recovery-and-errors-22](#cap-recovery-and-errors-22) | Checkpoints and rewind | yes | yes | partly built | code inspected only |
| [CAP-recovery-and-errors-23](#cap-recovery-and-errors-23) | Auto-continue an interrupted turn | yes | unknown | not built | not verified |
| [CAP-recovery-and-errors-24](#cap-recovery-and-errors-24) | Reconnect an expired connector and retry | yes | partly | built | not verified |
| [CAP-recovery-and-errors-25](#cap-recovery-and-errors-25) | Work continues after the app closes | unknown | yes | partly built | seen failing by a person |
| [CAP-recovery-and-errors-26](#cap-recovery-and-errors-26) | Retry after a connection error on voice and dictation | unknown | yes | partly built | seen failing by a person |
| [CAP-recovery-and-errors-27](#cap-recovery-and-errors-27) | Local model failure and offline recovery | unknown | unknown | unknown | not verified |
| [CAP-recovery-and-errors-28](#cap-recovery-and-errors-28) | Restart a stalled project conversation | yes | unknown | unknown | not verified |

## CAP-recovery-and-errors-01 Retry a failed answer in place

After a failed or errored turn, the person presses one control on that message to try again without retyping.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - [https://support.claude.com/en/articles/12466728-troubleshoot-claude-error-messages](https://support.claude.com/en/articles/12466728-troubleshoot-claude-error-messages): Capacity message says 'Please try again soon'; no in-place retry control is described.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Mar 18, 2025: retry failed messages in place; unsent text in the prompt is saved. Apps: web, desktop.
  - [https://help.openai.com/en/articles/7996703-troubleshooting-chatgpt-error-messages](https://help.openai.com/en/articles/7996703-troubleshooting-chatgpt-error-messages): Response generation errors show a Regenerate button. Apps: web, desktop.

**AGI requirement** (stated requirement; source: docs/product/requirements.md (Retry/regenerate; M-CHAT-005 message actions include copy and retry); docs/product/experience-contract.md principle 8). Every failed turn shows a Retry on that turn that re-runs the same turn, not an earlier one, on every app.

**With different models, providers and the one subscription.** Retry keeps the model choice or offers another eligible model; it must not double-charge a turn that did not complete; in Local mode retry runs on the local model with no server call.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, Mobile built; Desktop shows web; CLI and others use /continue and resume; web retry re-ran the wrong turn once. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S19.25, S19.26, S19.27
- Comparison list ids: WP61
- Code: `apps/web/features/chat/components/messages/MessageBubble.tsx:3913`; `apps/mobile/src/features/chat/components/MessageBubble.tsx:3181`; `apps/web/features/chat/components/messages/MessageBubble.tsx:3717`

**Gap.** Seen on web: Retry after a reload regenerated the first message of the chat and hid later turns; a stopped answer shows two retry controls.

**Acceptance criteria**

1. Fail turn 3 of a 3-turn chat, press Retry: turn 3 is re-answered and turns 1 and 2 stay.
2. Retry on web, mobile and desktop gives the same result after a reload.
3. A stopped answer shows one retry path.
4. Retry on a turn denied for limits does not use credit.

**Verification: seen failing by a person.** 6-defects/web-problems-seen-in-browser.csv rows 34 (retry regenerates first message) and 162 (two retry controls); scorecards W-3 free says retry after mid-stream reload completes.

## CAP-recovery-and-errors-02 Regenerate with the same or another model

Re-answer a message, optionally with a different model.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Mar 17, 2026: the three-dot retry menu regenerates with Thinking or Pro. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md W02 and W03 (route failures and fallback identify the executed model)). Regenerate offers the same model or any eligible model for the person's plan, and shows which model answered.

**With different models, providers and the one subscription.** The list comes from the model catalogue and the person's AGI Subscription entitlements; any provider can be chosen; Local mode lists only installed local models.

**Current implementation, as this trace read it on 2026-11-24: built.** Web and Mobile built; Desktop shows the web build. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: `apps/web/features/chat/components/messages/MessageBubble.tsx:3878-3910`; `apps/web/features/chat/pages/WebChatPage.tsx:7763-7764`

**Gap.** none known

**Acceptance criteria**

1. Regenerate lists only models the account may use.
2. The new answer is labelled with the model that produced it.
3. Both versions stay reachable after a reload.

**Verification: seen working by a person.** scorecards W-3 and W-7 (both versions persist after reload, original reachable via Previous version).

## CAP-recovery-and-errors-03 Regenerate with web search

Retry an answer so it uses web results.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/10093903-chatgpt-search-for-enterprise-and-edu](https://help.openai.com/en/articles/10093903-chatgpt-search-for-enterprise-and-edu): Where available, the refresh icon then Try again retries the answer with web results. Plans: Enterprise, Edu. Apps: web.

**AGI requirement** (inferred; source: competitor parity). If web search is on offer for the route, the regenerate menu may offer a search retry; otherwise the person can force search on a new message.

**With different models, providers and the one subscription.** Search depends on a provider route or an AGI harness, not on the model; the option appears only when a search route is entitled.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web: no search option in the regenerate menu; /search on a new message works. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: WP61
- Code: `apps/web/features/chat/components/messages/MessageBubble.tsx:3878-3910`

**Gap.** No search retry in the regenerate menu.

**Acceptance criteria**

1. Where search is entitled, regenerate offers search.
2. Where it is not, the option is absent, not disabled without reason.

**Verification: code inspected only.** comparison-web.csv row WP61.

## CAP-recovery-and-errors-04 Stop an answer and keep what arrived

Stopping a running answer ends it cleanly, keeps the partial text and lets the person continue.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/how-claude-code-works.md](https://code.claude.com/docs/en/how-claude-code-works.md): Esc cancels the running tool call; typing and Enter queues a steering message. Apps: cli.
  - [https://code.claude.com/docs/en/best-practices.md](https://code.claude.com/docs/en/best-practices.md): Esc stops the current action while keeping work done so far. Apps: cli.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/7996703-troubleshooting-chatgpt-error-messages](https://help.openai.com/en/articles/7996703-troubleshooting-chatgpt-error-messages): For stuck Thinking states, click Stop generating, then Regenerate. Apps: web, desktop.

**AGI requirement** (stated requirement; source: docs/product/requirements.md M-CHAT-004 (interrupted state recorded, UI recovers); S19.17, S19.18). Stop works on every app, records an interrupted state, keeps the partial answer after reload, and the UI is usable again at once.

**With different models, providers and the one subscription.** Stop must also cancel the upstream provider call or local inference and bill only what ran; works the same in Local mode.

**Current implementation, as this trace read it on 2026-11-24: partly built.** All six apps build it per ledger; web shows false limit banner and stale rows after Stop. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S19.17, S19.18
- Comparison list ids: none matched
- Code: `apps/web/lib/hooks/useChatStream.ts:4679-4683`; `apps/web/features/chat/components/messages/StreamPhaseNotice.tsx:14`; `apps/mobile/src/features/chat/components/MessageBubble.tsx:1528`

**Gap.** Web shows a false 'reached the Free limit' banner and a stale 'Writing response' row after Stop; a stopped answer can come back longer or cut mid-sentence after reload; Stop later raises an 'Agent run failed' bell.

**Acceptance criteria**

1. Press Stop mid-answer: partial text stays, composer works, no limit banner.
2. Reload: the stopped state and the same text come back.
3. No failure notification follows a Stop.

**Verification: seen failing by a person.** web problems rows 19, 52, 57, 61, 74, 146; scorecards W-2, W-5 show partial text kept after reload.

## CAP-recovery-and-errors-05 Continue a cut-off answer

A control extends an answer that stopped short.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: partly**
  - [https://code.claude.com/docs/en/env-vars.md](https://code.claude.com/docs/en/env-vars.md): Env vars auto-continue a session that ended mid-turn, with an age bound and a custom continue prompt. Apps: cli.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: AGI-only capability; the ledger lists it as built). A cut-off answer offers Continue that extends it in place.

**With different models, providers and the one subscription.** Works on any provider whose output limit cut the answer; counts against the same usage.

**Current implementation, as this trace read it on 2026-11-24: built.** Web has Continue generating; CLI has /continue. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: `apps/web/features/chat/pages/WebChatPage.tsx:6433,7739`; `apps/cli/src/claude_parity.rs:185`

**Gap.** none known

**Acceptance criteria**

1. Cut an answer with Stop; Continue extends it without repeating text.
2. Continue is absent on a finished answer.

**Verification: seen working by a person.** scorecards W-8 subscribed: 'Continue generating ... does finish'.

## CAP-recovery-and-errors-06 Reconnect and resume a dropped stream

When the connection drops mid-answer, the app reconnects and finishes the same answer without duplicates.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Aug 7, 2026: completed answers show immediately when returning to a chat (iOS). Apps: ios.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md W02 (double submission or reconnect does not create duplicate turns); S19.19, S19.20). A mid-turn drop shows 'reconnecting' and resumes the same turn; a reconnect never creates a duplicate turn.

**With different models, providers and the one subscription.** Resume reads a stored turn log, so it works for every provider; a Local-mode turn cannot be replayed from a server and must fail with a clear message or restart locally.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, Desktop, Mobile, Chrome built; CLI and VS Code reconnect missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S19.19, S19.20
- Comparison list ids: none matched
- Code: `apps/web/lib/hooks/useChatStream.ts:1672-1676 (3 resume attempts)`; `apps/web/features/chat/stores/stream-phase-store.ts:3`

**Gap.** CLI and VS Code have no reconnecting state.

**Acceptance criteria**

1. Cut the network for 3 seconds mid-answer: the answer finishes with no repeated text.
2. A permanent drop ends with a clear failed state and Retry.
3. One send makes one turn.

**Verification: code inspected only.** Ledger S19.19; no scorecard exercised a mid-stream network cut.

## CAP-recovery-and-errors-07 Reload during an answer

Reloading or reopening the page while an answer is being written returns the chat with the answer finished or still running.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/9047779-why-is-my-chatgpt-taking-so-long-to-respond](https://help.openai.com/en/articles/9047779-why-is-my-chatgpt-taking-so-long-to-respond): Advice for slow or stuck replies includes a hard refresh; no resume is promised.

**AGI requirement** (stated requirement; source: docs/product/definition.md (reload/resume proof); S19.20, S19.28). Reload mid-answer shows the running or finished answer, or a clear failed state with Retry; never an empty turn.

**With different models, providers and the one subscription.** Server-run turns can resume for any provider; a local on-device turn that dies with the app must be marked interrupted with Retry.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web builds resume; reload sometimes loses the answer. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S19.20, S19.28
- Comparison list ids: none matched
- Code: `apps/web/lib/hooks/useChatStream.ts:2235,2335`; `apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts:160`

**Gap.** Reload mid-answer lost the answer, left no progress indicator, and later showed a misleading 'no response' banner.

**Acceptance criteria**

1. Reload 3 seconds into an answer: the answer appears complete or shows a Retry, within 30 seconds.
2. No error banner shows over a partial answer that is still running.
3. No duplicate user message appears.

**Verification: seen failing by a person.** web problems rows 20, 69, 96; scorecards W-3 and W-9 subscribed.

## CAP-recovery-and-errors-08 Offline: keep the draft and send on reconnect

With no connection the person is told, the unsent message is kept, and it can be sent once online.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Aug 21, 2026: the iOS app tells you when it is waiting for internet. Mar 18, 2025: unsent text in the prompt is saved. Apps: ios, web, desktop.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md principle 8 (offline and retry states tested); docs/product/requirements.md offline mode fails gracefully). Offline shows one clear notice, keeps the draft, clears the notice when the connection returns, and sends on the person's action.

**With different models, providers and the one subscription.** Server-routed models need the network; Local mode on desktop and mobile must keep answering offline and say so; nothing silently moves a Local chat to a server.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web builds banner and draft; mobile and others not checked by a person. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`; `apps/web/e2e/composer-offline.spec.ts`

**Gap.** Banner stays after reconnect (seen in more than 12 runs); offline Archive and Run again give no feedback; offline navigation shows the browser error page.

**Acceptance criteria**

1. Go offline, type, press Enter: notice shows and draft stays.
2. Go online: notice clears within 3 seconds with no reload.
3. Offline Archive shows an error or pending state.
4. In Local mode on mobile and desktop, a local model answers offline.

**Verification: seen failing by a person.** Draft kept and sent: scorecards W-1 to W-19 (pass). Stale banner: web problems rows 62, 66, 70, 80, 97, 113, 120, 154, 170. No Local-mode offline run was seen.

## CAP-recovery-and-errors-09 Unsent draft restored

Text typed but not sent comes back after leaving or reloading.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/9703738-chatgpt-macos-app-release-notes](https://help.openai.com/en/articles/9703738-chatgpt-macos-app-release-notes): Unsent drafts are restored. Apps: desktop.
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Unsent text in the prompt is saved. Apps: web, desktop.

**AGI requirement** (stated requirement; source: docs/product/definition.md (unknown availability preserves the draft); experience-contract.md W04). A draft is stored per chat and restored, with a conflict choice when two tabs differ; failed uploads and unknown availability keep the draft.

**With different models, providers and the one subscription.** Draft storage is on the device and independent of model or plan; account switch must clear it.

**Current implementation, as this trace read it on 2026-11-24: built.** Web and Desktop built; Mobile, CLI, VS Code, Chrome not compared. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: `apps/web/features/chat/components/Composer/composer-draft-storage.ts`

**Gap.** A staged but unsent attachment did not survive a reload (not confirmed).

**Acceptance criteria**

1. Type, reload: text returns.
2. Two tabs with different drafts show a conflict choice.
3. Sign out and in as another account: no old draft appears.

**Verification: seen working by a person.** scorecards W-1 to W-6 (draft kept offline); W-4 notes unsent file lost.

## CAP-recovery-and-errors-10 Plain error messages with a next step

Each failure names its cause (limit, capacity, length, provider, sign-in) and says what to do.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12466728-troubleshoot-claude-error-messages](https://support.claude.com/en/articles/12466728-troubleshoot-claude-error-messages): Documents usage-limit messages with a reset time, a length-limit error, login errors, and a capacity message 'try again soon' that is not an outage. Plans: limit messages vary by plan.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/7996703-troubleshooting-chatgpt-error-messages](https://help.openai.com/en/articles/7996703-troubleshooting-chatgpt-error-messages): Covers 'Something went wrong', network and websocket errors, suspicious-activity warnings, preparing your chat, and slow or stuck Thinking. Apps: web, desktop.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md principle 8; ledger S19.21-S19.26). Every failure maps to a cause-specific message with the fix or retry, never a raw 'Error:' string.

**With different models, providers and the one subscription.** Provider errors are translated centrally so no provider wording leaks; limit messages come from the AGI Subscription state; Local mode errors name the local runtime.

**Current implementation, as this trace read it on 2026-11-24: partly built.** All apps build the mapping; web shows raw 'Error:' on limit and billing denials. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S19.21, S19.22, S19.23, S19.24, S19.25, S19.26
- Comparison list ids: none matched
- Code: `apps/web/features/chat/lib/turn-error-notice.ts:72-125`; `apps/mobile/src/features/chat/utils/messageStreamError.ts:30`; `apps/cli/src/errors.rs:322-461`; `apps/web/features/chat/components/ChatFailureNotice.tsx:130`

**Gap.** Raw failed response with 'Error:' on limit denial; billing-period error on an Active account; no Upgrade path on repeated denial; mic-denied voice gives a generic error.

**Acceptance criteria**

1. Trigger a limit, a long message, an expired sign-in and a provider outage: each shows its own message and action.
2. No message contains a provider name or raw status text.
3. Repeated denial offers Upgrade or waitlist.

**Verification: seen failing by a person.** web problems rows 40, 41, 48, 112, 35; scorecards W-19 subscribed.

## CAP-recovery-and-errors-11 Usage limit reached: what happens next

When a plan limit is hit, the person is told when it resets, or work continues on paid credits.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude and Claude Code: yes**
  - [https://support.claude.com/en/articles/12466728-troubleshoot-claude-error-messages](https://support.claude.com/en/articles/12466728-troubleshoot-claude-error-messages): Limit message shows reset time; with usage credits on, requests continue on pay-as-you-go. Plans: credits on paid plans.
  - [https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-max-or-ultra-plan](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-max-or-ultra-plan): Claude Code may finish the step in progress when the five-hour limit hits mid-response. Plans: Pro, Max, Ultra. Apps: cli.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (stated requirement; source: docs/product/commercial.md and memory-recorded owner decision (Free usage shows only Upgrade); definition.md line 347). A limit hit ends the turn cleanly, says when it resets or what to do, and keeps the draft; on Free it shows Upgrade only, never meters.

**With different models, providers and the one subscription.** All limits come from the one AGI Subscription system; Local mode inference is free and never limited.

**Current implementation, as this trace read it on 2026-11-24: partly built.** All apps show the notice; Web copy defects. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S19.21, S19.22
- Comparison list ids: none matched
- Code: `apps/web/features/chat/lib/turn-error-notice.ts:95,125`

**Gap.** Web Usage page and Billing disagree; denial shows no Upgrade link; false limit banner after Stop.

**Acceptance criteria**

1. Exhaust the allowance: the message says what to do and the draft stays.
2. The sidebar meter and banner agree after image generation.

**Verification: seen failing by a person.** web problems rows 52, 59, 87, 48.

## CAP-recovery-and-errors-12 Long chat full: recover without losing the chat

When the context fills, the app summarizes or offers a new chat with a summary.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12466728-troubleshoot-claude-error-messages](https://support.claude.com/en/articles/12466728-troubleshoot-claude-error-messages): Paid plans with code execution auto-summarize earlier messages; full history is preserved; a length-limit error asks to shorten or start a new chat. Plans: Paid plans.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001639-why-does-chatgpt-say-context-window-full-or-chat-memory-full](https://help.openai.com/en/articles/20001639-why-does-chatgpt-say-context-window-full-or-chat-memory-full): On Free, a notice offers a new chat with an optional summary that may omit details, or upgrading to continue. Plans: Free. Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity). A full context never loses history; the app compacts or offers a new chat with a summary and says what may be omitted.

**With different models, providers and the one subscription.** Context size comes from the chosen model's catalogue entry; switching to a larger-context model is an option; Local models with small context must say so.

**Current implementation, as this trace read it on 2026-11-24: unknown.** Not compared in the files read. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: none cited

**Gap.** Not established.

**Acceptance criteria**

1. Fill a chat past the model limit: the person gets a clear choice.
2. History stays readable afterwards.

**Verification: not verified.** No ledger or scorecard row read.

## CAP-recovery-and-errors-13 Error reference ID for support

The failure screen shows an ID the person can quote.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/7426629-why-cant-i-log-in-to-chatgpt](https://help.openai.com/en/articles/7426629-why-cant-i-log-in-to-chatgpt): Error reports should include the full request ID shown; support may request a HAR file. Apps: web.

**AGI requirement** (stated requirement; source: audit area 88 item S88.08 (request/error identifier)). Every failure screen shows a copyable ID that support can trace.

**With different models, providers and the one subscription.** The ID ties to the AGI request, not the provider's; it never contains secrets.

**Current implementation, as this trace read it on 2026-11-24: built.** All six apps and API per ledger. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S88.07, S88.08
- Comparison list ids: none matched
- Code: `apps/web/features/chat/components/ChatFailureNotice.tsx:130`

**Gap.** none known

**Acceptance criteria**

1. Force a failure: an ID is shown and can be copied.
2. Support can find the request from the ID.

**Verification: code inspected only.** Ledger S88.08 done on all apps.

## CAP-recovery-and-errors-14 Status page and incident notices

A public status page and in-app notices for incidents and maintenance.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12466728-troubleshoot-claude-error-messages](https://support.claude.com/en/articles/12466728-troubleshoot-claude-error-messages): status.claude.com lists confirmed outages; capacity messages do not appear there.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/9047779-why-is-my-chatgpt-taking-so-long-to-respond](https://help.openai.com/en/articles/9047779-why-is-my-chatgpt-taking-so-long-to-respond): Advice includes checking the status page.

**AGI requirement** (inferred; source: competitor parity; audit area 88 S88.10-S88.12). Failures link to a status page; incidents and maintenance appear in the app.

**With different models, providers and the one subscription.** Status must separate AGI outages from a single provider outage so a person can pick another model.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and Desktop built; Mobile, CLI, VS Code, Chrome missing; known-issue display missing everywhere. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S88.09, S88.10, S88.11, S88.12
- Comparison list ids: none matched
- Code: `apps/web/features/settings/sections/HelpSection.tsx:55-60`

**Gap.** No incident or maintenance notice on Mobile, CLI, VS Code, Chrome; no known-issue display on any app.

**Acceptance criteria**

1. Failure screen links to status.
2. A posted incident shows a banner on Web and Desktop (and later others).

**Verification: code inspected only.** Area 88 ledger.

## CAP-recovery-and-errors-15 Provider unavailable: try another model

When the model provider is down, the turn says so and offers retry or another model.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: partly**
  - [https://code.claude.com/docs/en/sessions.md](https://code.claude.com/docs/en/sessions.md): A fallback model flag is not restored on resume and must be passed again. Apps: cli.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/7996703-troubleshooting-chatgpt-error-messages](https://help.openai.com/en/articles/7996703-troubleshooting-chatgpt-error-messages): Suggests regenerating or switching network or device; model switching appears in the slow-response guidance. Apps: web, desktop.

**AGI requirement** (stated requirement; source: experience-contract.md W03; ledger S19.25). A provider failure names the problem, offers Retry and another eligible model, and identifies the model that actually answered.

**With different models, providers and the one subscription.** This is the core model- and provider-agnostic recovery; fallback must stay inside the person's trust boundary (Local never falls back to BYOK or managed cloud without explicit consent).

**Current implementation, as this trace read it on 2026-11-24: built.** All apps per ledger. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S19.25
- Comparison list ids: none matched
- Code: `apps/web/features/chat/lib/turn-error-notice.ts:76,104`; `apps/cli/src/errors.rs:344`; `apps/mobile/src/features/chat/components/MessageBubble.tsx:1045`

**Gap.** A scheduled task stopped without trying another model; a stop produced a misleading 'model failed' line while on Auto.

**Acceptance criteria**

1. Simulate provider failure: message names it and offers another model.
2. The answering model is shown.
3. A Local chat never falls back to a cloud model without a consent step.

**Verification: seen failing by a person.** 6-defects/README.md new items (scheduled task); web problems row 138.

## CAP-recovery-and-errors-16 Failed upload or attachment keeps the draft

When an upload fails, the draft stays and the person can retry.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md W04). A failed upload shows a cause, keeps the draft, offers Retry and never sends a partial attachment set without a decision.

**With different models, providers and the one subscription.** Applies to any model; size gates come from the subscription tier.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web: upload errors show inline with Dismiss; no retry. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S19.26
- Comparison list ids: none matched
- Code: `apps/web/features/chat/services/chat-attachment-upload.ts`

**Gap.** Project file upload fails with a generic server error shown twice, with no retry.

**Acceptance criteria**

1. Fail an upload: the draft stays and Retry works.
2. The message names the cause.

**Verification: seen failing by a person.** web problems rows 10, 11; scorecards W-11.

## CAP-recovery-and-errors-17 Queue, steer or interrupt a running turn

While an answer runs, the person adds a message, steers, or cancels without losing work.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/how-claude-code-works.md](https://code.claude.com/docs/en/how-claude-code-works.md): Esc cancels; typing and Enter queues a steering message read after current tool calls. Apps: cli.
- **ChatGPT and Codex: yes**
  - [https://learn.chatgpt.com/docs/prompting.md](https://learn.chatgpt.com/docs/prompting.md): Queued follow-ups show above the composer with edit, reorder, send and delete controls. Apps: desktop.
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Nov 5, 2025: for deep research or Pro runs, send new info without restarting. Apps: web.
  - [https://learn.chatgpt.com/docs/app-server.md](https://learn.chatgpt.com/docs/app-server.md): Append input to the running turn or cancel it. Apps: cli, desktop, ide.

**AGI requirement** (inferred; source: competitor parity). A running turn can be queued behind, steered or stopped; queued messages can be edited or removed.

**With different models, providers and the one subscription.** Steering needs a provider or local runtime that accepts mid-turn input, otherwise it queues.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, Desktop, Mobile built; CLI queues but cannot steer; queued items cannot be reordered. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S19.02
- Comparison list ids: CP27, DP18
- Code: `apps/web/features/settings/sections/GeneralSection.tsx:651`; `apps/cli/src/tui/tui_app.rs:8423,8686`

**Gap.** No reorder; CLI cannot steer; CLI shows no waiting state.

**Acceptance criteria**

1. Send during a run: it queues, can be edited and sends after.
2. Steer sends into the run where supported.

**Verification: code inspected only.** comparison-web, desktop, cli rows.

## CAP-recovery-and-errors-18 Restore a deleted chat (Recently deleted)

A deleted chat can be brought back for a limited time.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - [https://support.claude.com/en/articles/8230524-delete-or-rename-a-conversation](https://support.claude.com/en/articles/8230524-delete-or-rename-a-conversation): Deleted chat leaves history immediately and is purged from the back end within 30 days; no restore is described. Plans: Free, Pro, Max, Ultra. Apps: web.
- **ChatGPT: no**
  - [https://help.openai.com/en/articles/8809935-deleting-and-archiving-chats-in-chatgpt](https://help.openai.com/en/articles/8809935-deleting-and-archiving-chats-in-chatgpt): Deleted chat is removed at once, purged within 30 days and not restorable even by Support. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: AGENTS.md section 9 (chats archived or moved to Recently deleted; permanent removal only from an explicit action naming what is lost)). A deleted chat goes to Recently deleted for 30 days and can be restored; the delete dialog names what is lost and where it can be recovered.

**With different models, providers and the one subscription.** Applies to every chat regardless of model; Local chats stored on the device go to a local Recently deleted, never uploaded.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web has a 30-day soft delete, restore route and Recently deleted page; mobile Library and CLI text mention it; web dialog says it cannot be undone. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: `apps/web/app/api/chat/conversations/[id]/restore/route.ts:36`; `apps/web/features/settings/sections/DeletedChatsSection.tsx:57`; `apps/mobile/src/features/conversation-actions/useConversationActions.ts:299`

**Gap.** Chat delete dialog says 'cannot be undone' and no undo toast, contradicting the 30-day restore; the Chrome extension dialog says it cannot be recovered.

**Acceptance criteria**

1. Delete a chat: dialog names Recently deleted and 30 days.
2. Restore from Settings: chat returns with all messages.
3. After 30 days it is gone.

**Verification: seen failing by a person.** web problems rows 111, 114 (dialog copy); restore after archive seen working W-13.

## CAP-recovery-and-errors-19 Archive, unarchive and undo

Archive hides a chat without deleting; it can be restored, with an Undo right after.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT and Codex: yes**
  - [https://help.openai.com/en/articles/8809935-deleting-and-archiving-chats-in-chatgpt](https://help.openai.com/en/articles/8809935-deleting-and-archiving-chats-in-chatgpt): Archive removes from sidebar without confirmation, stays searchable; manage under Archived chats with Unarchive or Delete. Apps: web, ios, android.
  - [https://learn.chatgpt.com/docs/app-server.md](https://learn.chatgpt.com/docs/app-server.md): Codex threads can be archived, restored or permanently deleted. Apps: cli, desktop, ide.

**AGI requirement** (inferred; source: competitor parity). Archive and restore work on every app, search covers archived chats, and Undo follows an archive.

**With different models, providers and the one subscription.** Independent of model; archived Local chats stay on the device.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, Desktop, Mobile, Chrome, CLI built; VS Code cannot rename or auto-archive; mobile search of archived chats partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: MP22, V14
- Code: `apps/web/shared/components/layout/sidebar-session-actions.ts:48-63`; `apps/web/features/settings/sections/ArchivedChatsSection.tsx:30,90`

**Gap.** Offline archive gives no feedback; archiving drops the pin; mobile multi-select missing.

**Acceptance criteria**

1. Archive, tap Undo: chat returns with its pin.
2. Archive offline shows an error.
3. Archived chats appear in search.

**Verification: seen working by a person.** scorecards W-13 (archive, restore, Undo toast persisted after reload); defects rows 110, 113.

## CAP-recovery-and-errors-20 Restore a deleted file (Library)

Deleted files go to Recently deleted and can be restored.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001052-using-library-to-manage-files-in-chatgpt](https://help.openai.com/en/articles/20001052-using-library-to-manage-files-in-chatgpt): Deleting a file removes it from Library; Recently deleted restore, permanent within 30 days. Apps: web.

**AGI requirement** (stated requirement; source: AGENTS.md section 9). A deleted file stays restorable for 30 days from Library on every app that has one.

**With different models, providers and the one subscription.** Storage quota follows the AGI Subscription; deleted files count until erased.

**Current implementation, as this trace read it on 2026-11-24: built.** Web and Mobile have Recently deleted for files. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: `apps/mobile/src/features/library/index.tsx:284,879`; `apps/web/features/chat/services/chat-attachment-upload.ts:43`

**Gap.** Not seen by a person.

**Acceptance criteria**

1. Delete a file: it appears in Recently deleted.
2. Restore: it returns with its type and size.

**Verification: code inspected only.** Code path only.

## CAP-recovery-and-errors-21 Resume a saved coding session

Reopen a past terminal or editor session with history, mode and checkpoints.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/sessions.md](https://code.claude.com/docs/en/sessions.md): Resume restores history, model, permission mode and scheduled tasks; interrupted tools are not rerun; resuming the same session in two terminals may lose messages. Apps: cli.
  - [https://code.claude.com/docs/en/vs-code.md](https://code.claude.com/docs/en/vs-code.md): Session history search and resume; Web tab downloads cloud sessions. Apps: ide.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/app-server.md](https://learn.chatgpt.com/docs/app-server.md): Fork, resume, archive and delete stored threads. Apps: cli, desktop, ide.

**AGI requirement** (stated requirement; source: docs/product/definition.md (one developer continuity domain, session IDs and transcripts)). CLI, Desktop Code and VS Code share one session store; resume restores history and mode, never reruns interrupted tools, and never resumes with approvals off.

**With different models, providers and the one subscription.** A session resumes on any provider; the model can be switched on resume; Local sessions resume without a server.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI and VS Code built; CLI lacks --from-pr and auto-continue; VS Code does not restore plan mode. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S19.28
- Comparison list ids: C47, V17
- Code: `apps/cli/src/lib.rs:2492`; `apps/cli/src/cli_options.rs:112-124`; `apps/extension-vscode/src/core/commandSetup.ts:1473`

**Gap.** No --from-pr; plan mode not saved per session in VS Code.

**Acceptance criteria**

1. Quit the CLI mid-session, run resume: history and mode return.
2. A bypass mode is never restored.
3. Interrupted tools are not rerun.

**Verification: code inspected only.** comparison-cli.csv and comparison-vscode.csv rows.

## CAP-recovery-and-errors-22 Checkpoints and rewind

Roll the conversation, the code, or both back to an earlier prompt.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://support.claude.com/en/articles/14554922-claude-code-user-faq](https://support.claude.com/en/articles/14554922-claude-code-user-faq): A checkpoint is taken at every prompt; /rewind rolls back; committed work needs git revert. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: cli.
  - [https://code.claude.com/docs/en/interactive-mode.md](https://code.claude.com/docs/en/interactive-mode.md): Double Esc on empty input opens the rewind menu. Apps: cli.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/app-server.md](https://learn.chatgpt.com/docs/app-server.md): Revert thread history to before a turn without undoing local file changes.

**AGI requirement** (stated requirement; source: AGENTS.md section 9 (code gets a checkpoint)). Every coding surface keeps a checkpoint per prompt and lets the person restore code, conversation, or both.

**With different models, providers and the one subscription.** Checkpoints are local files and independent of the model.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI and VS Code built; CLI lacks the summarize option and /checkpoint alias. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: C48, C49
- Code: `apps/cli/src/tui/widgets/checkpoint_picker.rs:46-58`; `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3139-3190`

**Gap.** No summarize-from-here; no /checkpoint alias.

**Acceptance criteria**

1. Rewind to prompt 2: files and chat match that point.
2. Conversation-only rewind leaves files unchanged.

**Verification: code inspected only.** comparison rows.

## CAP-recovery-and-errors-23 Auto-continue an interrupted turn

A session that ended mid-turn continues on its own when reopened.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/env-vars.md](https://code.claude.com/docs/en/env-vars.md): Env vars auto-continue a session that ended mid-turn, with age bound and custom prompt. Apps: cli.
- **Codex: unknown**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: competitor parity (Claude Code only)). Offer to continue a cut-off coding turn on resume, with an age bound.

**With different models, providers and the one subscription.** Any provider; counts toward usage.

**Current implementation, as this trace read it on 2026-11-24: not built.** CLI missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: C42
- Code: `apps/cli/src: searched auto_resume, AUTO_CONTINUE` (not found)

**Gap.** Interrupted turns are not resumed automatically.

**Acceptance criteria**

1. Kill the CLI mid-turn, reopen: it offers or runs a continue.

**Verification: not verified.** comparison-cli.csv C42.

## CAP-recovery-and-errors-24 Reconnect an expired connector and retry

When a connected app's sign-in expires mid-answer, the chat shows Reconnect and the person resends.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/10166901-use-google-workspace-connectors](https://support.claude.com/en/articles/10166901-use-google-workspace-connectors): Disconnect then re-authenticate on next use fixes reconnect errors. Apps: web, desktop.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/20001497-troubleshooting-plugins-and-apps-in-chatgpt](https://help.openai.com/en/articles/20001497-troubleshooting-plugins-and-apps-in-chatgpt): Troubleshooting covers reconnecting apps and Microsoft guest accounts.

**AGI requirement** (stated requirement; source: docs/decisions/2026-09-27-founder-decisions.md D-2026-09-28-24). An expired connector shows Reconnect and Retry in the chat and Connect in Settings; it does not resume the cut turn by itself.

**With different models, providers and the one subscription.** Connector auth is separate from the model; works on any provider.

**Current implementation, as this trace read it on 2026-11-24: built.** Web and Desktop per decision record. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: `docs/decisions/2026-09-27-founder-decisions.md:353`

**Gap.** Not checked on other apps.

**Acceptance criteria**

1. Expire a connection mid-answer: card offers Reconnect and Retry.
2. After reconnecting, nothing resumes without the person's action.

**Verification: not verified.** Decision record only.

## CAP-recovery-and-errors-25 Work continues after the app closes

A long task keeps running when the window is closed and the result is there on return.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001548-agent-security-and-local-work-sync-in-chatgpt](https://help.openai.com/en/articles/20001548-agent-security-and-local-work-sync-in-chatgpt): Work tasks started on desktop can continue from web or mobile, but steps needing local files or tools still need the computer. Apps: desktop, web, ios, android.

**AGI requirement** (stated requirement; source: S19.24 and S19.29; definition.md (explicit execution boundaries)). Cloud tasks keep running and show their result on return; tasks that need a device say they are waiting for it.

**With different models, providers and the one subscription.** Cloud tasks run on AGI servers under the subscription; on-device tasks stop when the device is offline and say so.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, Desktop, CLI, Chrome built; Mobile and VS Code unverified. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S19.24, S19.29
- Comparison list ids: none matched
- Code: `apps/web/app/api/llm/v1/chat/completions/route.ts:860`; `apps/cli/src/background.rs:153`

**Gap.** Mobile and VS Code unverified; after reload a progress panel showed duplicates and stale Start buttons.

**Acceptance criteria**

1. Close the tab mid-task, reopen: result or resumed progress shows.
2. A task needing an offline device says it is waiting.

**Verification: seen failing by a person.** web problems rows 44, 45, 122; scorecards W-15 subscribed.

## CAP-recovery-and-errors-26 Retry after a connection error on voice and dictation

A dictation or voice request retries once after a network problem.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Aug 7, 2026: failed dictation retries once after a connection issue. Apps: ios.

**AGI requirement** (inferred; source: competitor parity; experience-contract.md W13). A dropped voice or dictation request retries once, then offers a clear retry; a denied microphone shows how to fix it.

**With different models, providers and the one subscription.** On-device dictation needs no network; server voice states that it needs one.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web voice resumes via Continue that session; mic-denied path shows no recovery. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: none cited

**Gap.** Mic denied gives no message or recovery; reload leaves the live session open on the server.

**Acceptance criteria**

1. Drop the network during dictation: it retries once.
2. Deny the microphone: a message says how to allow it.

**Verification: seen failing by a person.** web problems rows 35, 100; scorecards W-10 (Continue that session worked).

## CAP-recovery-and-errors-27 Local model failure and offline recovery

When an on-device model is missing, busy or stops, the app says which and offers a next step without sending anything to a server.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (stated requirement; source: docs/product/requirements.md M-MODEL-002; AGENTS.md section 6). Installed, downloadable, unavailable and runtime-offline local model states are distinct; Local failures never route to BYOK or cloud without explicit consent.

**With different models, providers and the one subscription.** Local inference is free and needs no sign-in for payment; any retry stays on the device.

**Current implementation, as this trace read it on 2026-11-24: unknown.** Not examined in the files read. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: none cited

**Gap.** Not established.

**Acceptance criteria**

1. Remove a local model: the chat says it is missing and offers download.
2. Local failure never sends the chat off the device.

**Verification: not verified.** No scorecard covers Local mode recovery.

## CAP-recovery-and-errors-28 Restart a stalled project conversation

A banner restarts the project coordinator when replies stop arriving.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code and Claude (project conversations): yes**
  - [https://code.claude.com/docs/en/claude-projects.md](https://code.claude.com/docs/en/claude-projects.md): A banner or Project settings row restarts the coordinator when replies stop; an in-progress reply is lost but threads are unaffected. Plans: Pro, Max, Ultra. Apps: web, desktop.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: competitor parity (Claude only, beta)). A stalled long-running conversation can be restarted without losing threads.

**With different models, providers and the one subscription.** Not tied to a model.

**Current implementation, as this trace read it on 2026-11-24: unknown.** No matching row found. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: none cited

**Gap.** Not established.

**Acceptance criteria**

1. A stalled run shows a restart control that keeps other threads.

**Verification: not verified.** No row read.

## Unresolved product choices

Decisions this topic needs from the owner. Nothing here has been decided.

- Whether the web chat Delete dialog should say 'can be restored for 30 days' (matches code) or deletion should be permanent as ChatGPT states; the AGI rule wording and the dialog disagree.
- Whether to match auto-continue of interrupted turns (only Claude Code documents it).
- Whether to offer a search retry in the regenerate menu (ChatGPT, Enterprise and Edu only).
- Whether to add a restart control for stalled project conversations (Claude beta only).
- What Local mode does when a local model fails and the person has not agreed to cloud: stay local only, or offer an explicit fork with consent.
- Whether to show known-issue and incident notices on Mobile, CLI, VS Code and Chrome.

## Could not establish

- Claude chat retry, regenerate, offline, draft and deleted-chat restore are not in the catalogue; has: unknown, not no.
- Whether Claude chat can restore a deleted chat; its page only says purged within 30 days.
- Mobile, Desktop-native, CLI, VS Code and Chrome recovery was not driven by a person; only the Web scorecards and web problem file were read.
- Local mode recovery on mobile and desktop was not found in any ledger row or scorecard.
- fix-checks-2026-11-24.json was not read, so some web defects cited may already be fixed on the fix branch.
- Context-full handling in AGI was not compared in the files read.
- Many comparison rows have no list_id, so those capabilities have no comparison id.
- Sync of a recovered state to a second device was not checked on web.
