---
id: "F093-03"
type: "feature"
title: "Long-chat summaries"
aliases: ["Context compaction", "Conversation summary", "Summary versioning", "compaction_summary", "S93.05", "S93.06"]
area: "93 Search, retrieval, and context components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S93.05", "S93.06"]
depends_on: ["SYS-chat-turn-pipeline", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-data-model-and-migrations", "SYS-execution-boundaries", "surface:web", "mode:cloud", "table:web_conversations", "table:web_messages", "file:apps/web/app/api/llm/v1/chat/completions/lib/context-compaction.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F093-03 Long-chat summaries

When a chat is too long for the model's window, the server drops the oldest turns and, for saved non-temporary chats, replaces them with a short model-written summary kept on the conversation. The summary is reused only while a digest of the covered messages still matches. On any failure it falls back to a plain trim.

Area: [93. Search, retrieval, and context components](README.md). Requirement items: [S93.05](../../10-requirements/capabilities/093-search-retrieval-and-context-components.md#s9305), [S93.06](../../10-requirements/capabilities/093-search-retrieval-and-context-components.md#s9306).

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

**What it does.** Plans which old messages to drop, asks a managed model to summarize them (up to 24,000 characters in, 2,000 out), saves the summary with a coverage digest on web_conversations, and substitutes it for the dropped span as a fenced note (apps/web/app/api/llm/v1/chat/completions/lib/context-compaction.ts:40-42,152-275,411-476).

**Why it exists.** So long conversations keep going instead of failing, while keeping facts from early turns, and so an edited or deleted message cannot live on in a stale summary (migration 0282 header, apps/web/db/neon/0282_compaction_summary_coverage.sql:3-12).

**Who uses it.** Anyone with a long Cloud chat thread; no control is shown.

**Problems it solves**

- Prompt exceeds the model window.
- Withdrawn words coming back through a cached summary (0282:5-12).
- Paying for a summary that will not help because the newest message cannot fit (context-compaction.ts:438).
- Instructions hidden in dropped content being laundered into plain text (context-compaction.ts:68-85).

**Use cases**

- A long research chat that outgrows the window keeps its early decisions.
- A user deletes a message inside the summarized span; the next turn rebuilds the summary.
- A temporary chat gets a plain trim only.
- A later turn extends the stored summary with only the newly dropped messages.

## 2. User experience

**Where to find it**

- Web Cloud chat: no control; a fenced note in the prompt marks dropped history. Visible only to the model.
- Mobile and Desktop in Cloud mode use the same endpoint (apps/mobile/stores/chat/chatExecutionStore.ts:2800) [inferred for desktop from AGENTS.md section 5].
- CLI, VS Code, Chrome extension: not established. unknown.

**Before you start**

- A saved (not temporary) conversation with an id.
- Server kill switch not set to off (AGI_CONTEXT_COMPACTION_ENABLED).
- A managed route available for the summary call.

**Screens and controls**

- None. The 'switch' in the draft is a server setting, not a user control (context-compaction.ts:38,59-62).

**Journey**

1. The person keeps chatting in a long thread.
2. The server estimates the prompt against the model window and plans a trim (context-compaction.ts:414).
3. If messages would be dropped and the chat qualifies, the server looks for a stored summary that still matches (lines 335-353).
4. If none, it calls a managed model to summarize the dropped span, billed as background usage (lines 212-253).
5. It stores the summary and substitutes it for the span (lines 368-377, 459-468).
6. The model answers with the summary in place of the old turns.

**What the person sees and gets**

- The model sees a fenced block 'Earlier messages summarized to fit the model context window.' or, on plain trim, the dropped-history marker (context-compaction.ts:74-85; context-window.ts:16-17).
- If the newest message cannot fit, the turn is refused with a 'message too long' response (request-processor.ts:6730-6755).

**Settings**

- Server env AGI_CONTEXT_COMPACTION_ENABLED: off, false or 0 disables summaries (context-compaction.ts:59-62).
- No per-user setting found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Plan, summarize, store, reuse and extend (context-compaction.ts:277-380).
- Digest covers message ids, row versions and dropped-text fingerprints, so edits, deletes and branch switches invalidate it (lines 126-150,343-348).
- Fallback to plain trim for temporary chat, no conversation id, kill switch, newest-message overflow, or any error (lines 433-441,469-475).
- Secrets redacted before the summary call (lines 170-181).
- Summary of untrusted tool content uses a separate fence tag (lines 68-85).
- Reservation released when the provider fails (lines 258-273).

**Incomplete**

- Whether own-key turns reach this path is not established; the summary call always uses a managed route (context-compaction.ts:164-168). unknown.

**Present but disconnected or switched off**

- Migration 0164 and 0282 headers: 0282 is titled 'Migration 0280' inside the file; apply state unknown (0282:2).

**Not available**

- No user-visible control or indicator for compaction on any app searched.
- No local-model summary path: the summary always calls a managed route (lines 164-168).

## 4. Required behaviour

**Established requirements**

- When a conversation outgrows the window, older turns are compacted into a summary and the turn continues. (source: S93.05 (brief))
- Stored summaries are versioned against the messages they cover; an edit or delete invalidates them. (source: S93.06 (brief); 0282 migration header)
- Summarizing is an enhancement over the trim, never a dependency. (source: context-compaction.ts:401-410)
- Local content must not silently go to managed cloud. (source: doc: AGENTS.md section 6)

**Acceptance criteria**

1. A conversation over the window gets a summary stored in compaction_summary with a 64-character hex digest.
2. The next turn with an unchanged span reuses the stored summary without a new model call.
3. Editing or deleting a message in the covered span causes a rebuild on the next turn.
4. A temporary chat is trimmed with the dropped-history marker and no summary call.
5. If the summary call fails, the turn still goes ahead with the plain trim and the failure is logged.
6. If the newest user message alone cannot fit, no summary is billed and the turn is refused as too long.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The summary should not be written when the conversation row is withdrawn; the code throws in that case (lines 320-325) [inferred intent].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Tell the person when earlier turns were summarized.
- [proposed] Allow a Local model to write the summary when the chat is Local.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | compactContextWindow | `apps/web/app/api/llm/v1/chat/completions/lib/context-compaction.ts` | Decides between summary and plain trim (line 411). |
| service | resolveCompactionSummary | `apps/web/app/api/llm/v1/chat/completions/lib/context-compaction.ts` | Reads stored summary, validates digest, extends or rebuilds (line 277). |
| service | generateCompactionSummary | `apps/web/app/api/llm/v1/chat/completions/lib/context-compaction.ts` | Metered managed model call (line 152). |
| service | Context window trim planner | `apps/web/app/api/llm/v1/chat/completions/lib/context-window.ts` | planContextTrim, DROPPED_HISTORY_MARKER and sizing. |
| service | Summarized-history fences | `apps/web/app/api/llm/v1/chat/completions/lib/summarized-history.ts` | Tags for summarized and summarized-untrusted history. |
| service | Chat request processor call site | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Calls compactContextWindow at line 6703 and refuses overflow at 6730-6755. |
| service | reserveBackgroundUsage | `apps/web/lib/services/background-usage-lease.ts` | Reserves and settles usage for the summary call. |
| table | web_conversations compaction columns | `apps/web/db/neon/0164_memory_policy_and_context_compaction.sql` | compaction_summary and compaction_summary_through_message_id (lines 33-40). |
| schema | compaction_summary_digest | `apps/web/db/neon/0282_compaction_summary_coverage.sql` | Digest column with hex check; clears old summaries. |
| table | web_messages | `apps/web/app/api/llm/v1/chat/completions/lib/context-compaction.ts` | Read for ids and server_version of the covered span (lines 308-317). |
| config | AGI_CONTEXT_COMPACTION_ENABLED | `apps/web/app/api/llm/v1/chat/completions/lib/context-compaction.ts` | Server kill switch (lines 38,59-62). |
| test | Compaction tests | `apps/web/app/api/llm/v1/chat/completions/lib/context-compaction.test.ts` | Enable switch, reuse, extend, branch switch and untrusted fence tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Server plans a trim against the model window. | our servers | context-compaction.ts:414; request-processor.ts:6703 |
| Server reads the conversation's stored summary and the visible messages of the span. | our servers | context-compaction.ts:298-318 |
| If the digest matches, the stored summary is reused or extended. | our servers | context-compaction.ts:343-353 |
| Otherwise the span is redacted and sent to a managed model for a summary with a usage reservation. | outside service | context-compaction.ts:174-253 |
| The summary is stored on web_conversations and substituted for the dropped span. | our servers | context-compaction.ts:368-377,459-468 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Summary text (max 2,000 chars), boundary message id, coverage digest | web_conversations columns compaction_summary, compaction_summary_through_message_id, compaction_summary_digest | Server only; clients get messages, not the summary [inferred; no client read found]. | Reused while valid; 0282 clears pre-digest summaries; deletion of the conversation row removes it. Other deletion paths unknown. |
| Usage record type context_compaction | managed usage ledger via lease.completed | Server only | Per usage ledger; unknown. |

**Models and providers.** Uses an 'economy' utility route chosen by admitManagedCloudRoute for kind 'utility', then the provider adapter for that route (request-processor.ts:6715-6724; context-compaction.ts:164-201,230-236). The specific model depends on the catalog and is not named here.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; the conversation row must belong to the user and not be deleted (context-compaction.ts:299-306). |
| Permissions | Conversation ownership by user_id (lines 299-306,368-377). |
| Subscription | The plan tier is passed to the usage reservation (lines 212-218); how each plan treats it is not read. unknown. |
| Limits and metering | Summary call metered as background usage with a 60-second lease and 500 output tokens (lines 196,212-225). A refused reservation falls back to the trim (ManagedUsageRequestError is logged as warn, lines 470-473). |
| Feature flags | AGI_CONTEXT_COMPACTION_ENABLED (context-compaction.ts:38). |
| Model compatibility | Window size comes from the selected model's metadata via context-window.ts; details not read. |
| Provider restrictions | Requires an admitted managed utility route; otherwise throws and falls back (lines 164-167). |
| Local mode | Not shown for Local mode. This code runs on our servers and calls a managed model, so a Local-model chat does not use it; what Local mode does when the window overflows is unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Temporary chat or no conversation id | Plain trim, no summary. | context-compaction.ts:433-441 |
| Kill switch off | Plain trim. | context-compaction.ts:59-62,437 |
| Summary call fails or is refused | Logs '[context-compaction] summarization failed; falling back to the mechanical trim'; plain trim. | context-compaction.ts:469-475 |
| Empty summary | Throws, then falls back. | context-compaction.ts:256 |
| Message edited or deleted inside span | Digest mismatch; summary rebuilt from the span. | context-compaction.ts:343-355 |
| Branch switched | Digest includes dropped-text fingerprints, so another branch's summary is not reused. | context-compaction.ts:126-134; context-compaction.test.ts:380 |
| Conversation withdrawn | Error and plain trim. | context-compaction.ts:320-325 |
| Newest message cannot fit | Plain trim flagged; turn refused as too long. | context-compaction.ts:438; request-processor.ts:6730-6755 |
| Dropped span held a fetched page | Summary or trim keeps the untrusted-content flag for the tool gate. | context-compaction.ts:68-92 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/chat/completions/lib/context-compaction.test.ts`: Kill switch, no-op, fences, untrusted flag, cache reuse, branch switch, extension, boundary anchoring, stored system rows.
- `apps/web/app/api/llm/v1/chat/completions/lib/context-window.test.ts`: Trim planning (name only; contents not read).

**Test scenarios**

- **Long thread summary**
  1. Build a saved chat that exceeds the model window.
  2. Send a new message.
  3. Read web_conversations.compaction_summary for the chat.
  - Expected: A summary up to 2,000 characters and a 64-hex digest are stored.
- **Reuse**
  1. Send another message without changing history.
  - Expected: No new summary call; same summary used.
- **Edit invalidates**
  1. Delete a message inside the summarized span.
  2. Send a message.
  - Expected: Digest mismatch; new summary built from visible messages.
- **Temporary chat**
  1. Use a temporary chat past the window.
  - Expected: Dropped-history marker only; no summary row.
- **Summary failure**
  1. Make the managed route unavailable.
  2. Send a message in a long chat.
  - Expected: Turn continues with plain trim; error log line present.

**Where to look when it fails**

- Log '[context-compaction] summarization failed; falling back to the mechanical trim'.
- Log '[context-compaction] reservation release failed'.
- Log 'Turn refused before the provider: the latest user message does not fit the selected model'.
- Columns compaction_summary_digest on web_conversations.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **The brief says the user switch controls summaries; the code has only a server kill switch.** Affects: All users.. Evidence: context-compaction.ts:38,59-62; no user setting found.. Work needed: Decide if a user switch is required and, if so, add it.
- **Summary always uses a managed route, even if the chat is Local or own-key.** Affects: Local and own-key users on any app that reaches this path.. Evidence: context-compaction.ts:164-168.. Work needed: Confirm which modes reach the path; add consent or a local route per AGENTS.md section 6.
- **No indicator tells the person that earlier turns were summarized.** Affects: Web, desktop, mobile Cloud chats.. Evidence: No UI string found; only a prompt note.. Work needed: Add a subtle notice if product wants it.
- **Apply state of 0164 and 0282 not established.** Affects: All compaction.. Evidence: 0282 header names itself 'Migration 0280' at line 2.. Work needed: Check migration tracking.
- **Compaction on CLI, VS Code and Chrome extension not established.** Affects: Those apps.. Evidence: No match found in their folders.. Work needed: Check each app's own trimming.

**Depends on**

- SYS-chat-turn-pipeline
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-data-model-and-migrations
- SYS-execution-boundaries
- surface:web
- mode:cloud
- table:web_conversations
- table:web_messages
- file:apps/web/app/api/llm/v1/chat/completions/lib/context-compaction.ts

## Unknown

- Whether own-key turns reach compaction.
- Whether any non-web app summarizes long chats.
- Which model the economy route resolves to in production.
- Apply state of migrations 0164 and 0282.
- How the usage ledger bills or limits the summary call for each plan.
