# Native desktop migration

Status: In progress
Owner: Desktop surface maintainers + Rust platform
Last updated: 2026-11-11

The active goal is a complete GPUI desktop application with the web application's
product workflows and additional permissioned local implementation, using Claude,
ChatGPT and Perplexity as behavioral references. It is not complete when only a
session browser or a compatible shell exists. The founder authorized the migration
on 2026-11-08. The existing Electron public
release and retained Tauri implementation remain available while native workflows
are implemented and verified. This queue closes when the replacement release
passes desktop acceptance and the displaced hosts are retired deliberately.

## First migration slice

`apps/desktop/gpui` is an opt-in Rust host using the published GPUI framework.
Its implemented workflow selects a folder, asks native runtime consent, starts
the existing CLI app-server, and opens folder-local conversations. The native
conversation implementation now includes runtime model discovery, new sessions,
a multi-line composer, turn submission, streamed output/activity, interruption,
and allow-once/deny approval controls. These controls compile and their projection
is tested; real native model inference and agent approval acceptance remain unverified.
Editing existing UTF-8 files, Code checkpoint review, staging and conflict-aware
reverts and the Unix interactive terminal are implemented as described below.
Broader terminal/file/worktree workflows remain under development.

The shared runtime transport is `crates/agiworkforce-app-server/src/client.rs`.
It bounds frames and queued notifications, correlates responses, negotiates the
canonical protocol version, and refuses reuse after cancellation, timeout, or
wire corruption. The native host consumes typed turn and approval contracts after
initialization; it does not turn registry membership into routing permission.
Model selection creates a new conversation without moving existing history across
boundaries. Existing unknown-boundary sessions remain read-only. Turns use the
host's Ask posture and a client idempotency key; uncertain acceptance retains the
draft and asks the user to inspect saved history before resending. Reconnect
snapshots supply delta/activity cursors and pending approvals. The UI refuses gaps
and cross-boundary route changes instead of combining incomplete streams.

The build reads product labels, theme colors, typography, trust labels, frame
limits, and inherited-environment protections from the existing TypeScript owners.
GPUI is a dependency; no Zed application implementation is copied. The bundled
third-party notices are generated using the repository's existing notice tooling.

Current primary references, read 2026-11-08:

- [Pinned GPUI snapshot 0.3.11](https://docs.rs/gpui-pre/0.3.11/gpui/): the compiled API;
  upstream main and website examples can describe a different revision.
- [GPUI framework source](https://github.com/zed-industries/zed/tree/main/crates/gpui):
  framework scope and Apache-2.0 declaration; upstream remains pre-1.0.
- [Zed external agents](https://zed.dev/docs/ai/external-agents): evidence for
  retaining the agent runtime behind a protocol rather than duplicating its engine.

## Complete application acceptance

Read the current implementation and the relevant reference packet before each
workflow. The clean-room desktop track is
`/Users/siddhartha/Desktop/reverse-engineer/docs/topics/build.md`, Track A, with
`docs/model-agnostic-chat/README.md` as its entry. Dated or proposed vendor behavior
does not override current web contracts, security policy, or executed evidence.
Do not copy vendor binaries, pseudocode, credentials or session stores.

| Area                          | Required working journeys                                                                                                                                          | Evidence needed for completion                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Native application shell      | Product navigation, conversation history, projects, search, settings, keyboard commands, multiple windows and both themes                                          | Real native UI runs covering success, failure, empty/loading states, focus and resizing                         |
| Cloud identity and continuity | Sign in/out, account and entitlement state, admitted web conversation/project/settings continuity, correct device ownership                                        | Real authenticated API/UI checks and reload/cross-surface verification through existing Cloud owners            |
| Conversations                 | Model selection from runtime/catalog metadata, new and existing threads, composer/IME, multi-turn send, streaming, stop, retry/reconnect and durable recovery      | End-to-end native sends plus failure, cancellation and persistence tests; no fake production responses          |
| Rich content                  | Markdown/code/math, citations, attachments, generated files and the artifacts supported by the web product                                                         | Actual content rendering and interaction, downloads/exports and permission/error cases                          |
| Work and integrations         | Agent runs, activity, tools, approvals, skills, connectors/MCP, memory, schedules and background recovery                                                          | The real runtime/control-plane journey for every admitted capability, including refusal and revoked permissions |
| Code                          | Trusted folders, files/editor, diffs, terminal, Git/worktrees/checkpoints, developer sessions and recovery                                                         | Real local file/command workflows with native approval and trust-boundary checks                                |
| Local OS implementation       | Admitted local models, explicit trust labeling/forks, approved files/apps/browser context, capture, voice/dictation, shortcuts, tray, notifications and deep links | Native platform tests with real consent, cancellation, denial, revocation and shutdown                          |
| Data lifecycle                | Persistence, sync, recovery, sharing/export and destructive actions with consequence-specific confirmation                                                         | Real reload/restart and boundary tests; no Local/BYOK data silently entering Cloud                              |
| Accessibility and release     | Native semantics/screen-reader use, responsive layout, signing, packaging, updates, failure diagnostics and supported-platform verification                        | UI/device evidence, required checks, actual packaged builds and a tested cutover/recovery procedure             |

Every row remains incomplete until its journeys have current authoritative
evidence. Web reachability inventories and compilation alone do not prove parity.

## Current continuation

The native dependency is now pinned to `gpui-pre`/`gpui-pre-platform` 0.3.11,
the crates.io snapshot identifying Zed revision
`f816e1f9263e3a8ef63c4baaa02e1441ce1c6038`. `gpui-component` 0.9.0 pins the same
GPUI snapshot. These dependencies declare Apache-2.0 and pass the repository's
license/source/banned-package checks. This is framework/toolkit reuse, not reuse
of Zed's GPL application implementation. The toolkit is initialized through its
single Root and native controls/text expose explicit accessibility semantics.

The compiler and existing CI/release pins are aligned at Rust 1.99.1. GPUI's
current macOS code uses `Option::map_or_default`, stabilized in Rust 1.98; the old
workspace 1.94 pin cannot compile this snapshot. The native package declares its
compiler requirement. The compiler update also required equivalent key sorting,
loop/match forms and unsigned cursor clamps in the CLI and its shared crates;
strict CLI Clippy now passes without lint exceptions. Linux system-library additions follow the same upstream
snapshot's `script/linux`; Node is required to consume the canonical contracts.

The off-screen Metal regression passes both appearances: text appears initially,
an updated value changes the image while the static heading remains identical,
and an unchanged redraw preserves the image. This tests real glyph shaping and
GPU rendering, not native-window presentation. The native presentation verification below compares raw captures with renderer output.
Inline image representations are not pixel evidence. Physical IME and complete
screen-reader acceptance remain separate requirements.

The app-server client has an active background reader, bounded request admission,
out-of-order response correlation and a bounded notification channel. Cancellation,
timeouts, framing corruption and event loss disconnect the connection rather than
silently reusing uncertain state. Eight focused tests cover idle notifications,
reversed responses, split UTF-8 frames, cancellation/timeouts, overflow, incomplete
frames and request admission. The native host consumes connection events and
rejects privacy-boundary changes in selected-session model notifications.

Started/output/approval notifications now have canonical Rust protocol types and
generated TypeScript bindings. Approval serialization retains the original flat
wire keys and explicit nulls; tests include structured legacy question payloads.

The workspace build exposed a retained-Tauri configuration mismatch: its config
selects isolation while the Cargo runtime/build dependencies omitted that feature.
The features are now enabled to match the existing security pattern; isolation was
not disabled to make compilation pass. `cargo check --workspace --jobs 4` now passes
with the updated compiler and native dependency set. Remote CI execution and
Windows/Linux native behavior remain unverified.

The app bundle now includes a runtime manifest generated from Cargo's declared
default CLI executable/version. Startup resolves the bundled CLI without requiring
developer flags; path traversal and links escaping the executable directory are
rejected. The actual packaged runtime/version check is an explicit acceptance test,
separate from the filesystem resolver unit tests.

CI change selection includes the GPUI tree and the canonical TypeScript modules
consumed by its build bridge. The selector test reads the bridge's actual imports
so adding a dependency cannot silently skip native validation. Protocol generation
publishes the canonical package and crate mirror from the same validated staging
tree; the parity guard remains enabled.

Verified in this continuation: the complete Rust workspace check, all 72 app-server
tests, the three new notification-wire tests, the CLI approval notification test,
47 CLI Markdown tests, five native library tests, the explicitly invoked packaged
runtime/version test and isolated real-CLI list/shutdown test. The off-screen Metal
redraw test passes both themes. The CI selector suite passes 41 cases. Clippy with
warnings/unsafe code denied, Rust formatting, the types-package typecheck, native
script lint, generated context indexes and CI workflow guards pass. The final
protocol parity/generated checks and packaged signature are checked separately;
these results do not establish native-window, screen-reader, inference or Cloud
workflow acceptance.

## Native conversation implementation

`gpui/src/conversation.rs` projects canonical runtime notifications and snapshots;
`gpui/src/ui/conversations.rs` owns native control handlers. The composer uses the
toolkit's text-editing engine rather than a custom keyboard/IME implementation.
Return submits and Shift+Return inserts a line break. Stop occupies the send slot
and uses `turn/interrupt`, not cancellation of the transport request. Approval
review displays the host's detail, proposed content, risk and reversibility;
allowing once opens a native confirmation and does not save a permission rule.

Fourteen conversation tests cover early completion before acknowledgement,
Unicode/delta cursors, gaps, overlapping sessions/turns, privacy-boundary refusal,
approval snapshot/resolution, interruption, replay races, metadata refresh and a
bounded visible history. The native package tests and strict Clippy pass; the
Cargo workspace compiles. The separate model-ID guard currently fails in the
generated knowledge-graph tools JSONL and `docs/launch/QA_LEDGER.md`, not in the
native source. No guard was weakened.

The off-screen Metal test now mounts the toolkit Root and text area, edits
multi-line Unicode content, and checks retained heading pixels in both themes.
It remains an off-screen rendering test, not proof of native input, IME,
accessibility, or a successful model invocation. The native verification below now covers selected window journeys;
physical IME and complete screen-reader acceptance remain open.

## Native runtime account setup

The native Account panel uses the CLI's `account/status`, device sign-in, and
sign-out contracts. It shows the reported identity, plan and credit balances,
labels cached status, and keeps missing balances unknown. The native view does
not retain account tokens or provider credentials. Sign-out confirms that the
credential is shared with the CLI on this machine; it leaves provider keys and
saved conversations alone. This implements Host Developer account setup, not
Consumer Cloud chat/project continuity. Account bootstrap now starts without a
coding folder; local coding still requires a separate consented runtime.

The background client supports a per-request monotonic deadline. Device sign-in
uses the runtime's stated expiry plus the ordinary request grace; a pending login
does not block normal requests. The new optional `accountLoginCancel` capability
controls whether sign-in is offered. `account/login/cancel` cancels only its named
pending login; dropping an RPC or signing the whole account out is not used as a
substitute. The host serializes credential commit with cancellation/sign-out so a
late authorization cannot restore a removed credential. Cancellation and shutdown
wake the polling wait and cancel a pending HTTP poll.

The browser page is opened only by the native button. The CLI validates the
returned authorization URL through its existing account-host policy, and the
native handoff rejects non-web schemes, credentialed URLs and remote plain HTTP.
The code and link remain visible for a manual handoff. Browser completion,
OS credential-store behavior, cancel/finish races in the rendered UI and actual
account-backed inference remain **NOT_RUN** until the relevant native journeys are exercised. No real
account login or sign-out was performed during isolated acceptance.

The current verification covers 75 shared-server tests, 23 native library and
conversation/account tests, two CLI login-cancellation tests, three authorization
URL tests, 28 CLI privacy regressions and a file-reference regression. All 60
VS Code runtime-client tests, its typecheck/lint, both generated binding checks,
protocol parity, native/server/CLI Clippy, both-theme off-screen rendering, the
workspace build, development bundle and strict bundle signature pass. The real
packaged CLI was checked with a disposable configuration root and no inherited
account JWT: it reports signed out, advertises cancellation, rejects a nonexistent
login with the expected domain error, keeps serving afterward, and shuts down.
This does not verify a successful real account login or native account interaction.

The reference slice is Track A, `desktop-product-parity.md`, Account/Settings.
Official sources refreshed on 2026-11-08: [ChatGPT desktop migration](https://help.openai.com/en/articles/20001276-moving-to-the-new-chatgpt-desktop-app)
describes same-account sign-in and separate developer history; [Claude account
login](https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account)
describes desktop sign-in and directs third-party applications to API
credentials. These are product references, not authority to copy private code or
use another product's consumer session as a backend.

## Account bootstrap without workspace access

The native window now starts an independent `app-server --account-only` connection.
`CliAccountHost` has no workspace authority, local session store or agent engine;
its account operations delegate to the same `AccountService` as the developer
host. The CLI dispatches this mode before configuration, workspace trust,
repository context, hooks, worktrees and device heartbeat initialization. It
accepts only stdio, rejects workspace-consent/repository/worktree arguments, and
cannot enter the workspace initialization path. Capability defaults fail closed.

Code uses its own connection after folder consent. Account and Code have separate
clients, event readers, reconnect generations and shutdown paths. Reopening a
coding folder no longer clears an account challenge. Account-only startup asks
for a fresh owner-authorized account status so an existing device grant can renew;
read-only connections still cannot request that refresh. New coding-model
selection explicitly refreshes host metadata after account changes.

Sixteen account/service/scope tests pass, including cancellation, shutdown of an
admitted operation, and rejection of valid Code requests from an authenticated
owner. CLI argument/trust tests preserve the ordinary developer trust gate.
The packaged-runtime acceptance passes with no workspace consent, rejects a direct
Code RPC, continues serving account status and shuts down. It also passes with a
malformed global CLI configuration, demonstrating the account startup bypass.
These are process/protocol checks; they do not prove native interaction or a real
account login. The account connection now exposes paginated Cloud history reads. Consumer Cloud text submission is now implemented; Work lifecycle controls remain incomplete.

## Native Cloud history

The native Cloud history view now searches and pages account conversations and
reads their message pages through the existing `cloud::CloudClient` and chat REST
adapter. It does not use developer `thread/*` requests, create local managed
sessions, advance sync cursors or copy account history into Code. The account-only
host advertises `cloudHistory`; ordinary developer hosts do not. Both history
methods are owner-only and run as bounded detached requests so account controls
remain responsive while the API answers.

Requests and replies carry an opaque account/session/deployment scope. The host
checks the selected scope before any history HTTP request and checks the captured
credential context again after it. The native view refuses cross-scope pages,
deduplicates message IDs and clears search, content and pending-result generations
on account reset/sign-in/sign-out. Cached history has a display budget. Large
message previews are marked truncated; complete rich-content retrieval remains a
release gate, not a claim that the full transcript was rendered.

The shared Cloud client now has a bounded response reader for these pages, while
its existing callers retain their prior behavior. The transcript JSON budget is
shared with the developer read adapter. Tests cover Unicode truncation, not
advancing over an unread row, declared and chunked HTTP overflow, scope rejection,
reset invalidation, pagination and cache-window recovery. A golden HTTP fixture is
validated by the authoritative TypeScript schemas and parsed by the Rust adapter.

`test:gpui:cloud` runs the real packaged CLI against an isolated loopback fixture
with a disposable config root and a synthetic fixture JWT. It verifies query and
cursor forwarding, actual list/read routes, Unicode content, connection shutdown,
and that a mismatched scope produces no history HTTP request. It does not use a
real account or model, and does not establish authenticated live-service or native
UI acceptance. Build the development bundle before running it. Native Cloud history now shares the text-send path below. Work, run recovery,
approvals, model selection, projects, attachments and full rich content remain required.

## Native Cloud text conversations

The account host now supports conversation creation and queued text turns through
the existing managed gateway. The host reads saved account history before each
send; it does not reuse a local Code transcript. Conversation IDs and both message
IDs are client-chosen UUIDs. The gateway owns model admission, inference, user and
assistant persistence, tools and billing. A duplicate start with the same IDs and
payload returns the same attached turn instead of issuing another model request.

The native Cloud composer retains its draft through local queuing and clears it
only after the gateway accepts the request. Snapshot revisions prevent an older
poll from overwriting a later cancellation. The common stream decoder handles
split UTF-8, text, structured events and progress. Legacy and structured text
projections are accumulated separately and checked for consistency. Account
scope is checked before dispatch, before returning snapshots, and around run API
calls. The account host still cannot execute local tools.

Stop uses the reported upstream run ID. Before a cancellation mutation, the host
reads the run and verifies its conversation identity. Request-scoped streams stop
with their connection; a durable Cloud run can outlive app closure, which the
native close prompt now explains. A paused approval/input run is identified as
needing attention rather than falsely completed. Attached runs now have native
approval and paused-resume controls as described below. Connector input forms,
the complete Work interface and durable draft recovery remain required. Saved
account runs can now be reopened through the Work view described below.

`test:gpui:chat` runs the packaged CLI against a controlled loopback gateway. It
checks creation, an observed partial stream before completion, split emoji bytes,
legacy/structured text deduplication, duplicate-start protection, saved message
IDs, full saved text context on a later turn, partial-response persistence,
upstream Stop and refusal to cancel a mismatched conversation's run. This uses a
synthetic fixture account/model and no actual inference. Real account/gateway
acceptance, native keyboard/IME/Stop interaction and screen-reader use remain
**NOT_RUN** until the relevant native journeys are exercised.

Verified for this slice: 29 native tests, 75 shared-server tests, 18 CLI chat
adapter tests, 16 account/service/scope tests, and 60 VS Code runtime-client
tests pass. Workspace compilation, strict native/CLI Clippy, generated protocol
checks and parity for 501 modules, both-theme off-screen Metal rendering, both
packaged Cloud fixtures, the development bundle's strict signature, Rust
formatting and generated context indexes pass. The unconfirmed-send state also
offers a saved-conversation reload while retaining the draft; it never retries
the model request automatically. These checks do not establish a real
authenticated native journey or completion of the application acceptance table.

The first native send supports text history within the existing transcript
budget. It rejects oversized context and detected unsupported attachment context
instead of silently dropping it. Rich attachments/context reconstruction,
compaction, Cloud model selection, the complete Work interface and connector input
forms remain unfinished. Unsent Cloud drafts are retained while viewing other surfaces;
creating/switching Cloud conversations or changing/reconnecting accounts asks the
user to copy or clear the current draft first. Durable draft recovery is still a
data-lifecycle gate.

## Native rich conversation text

Cloud and Code now share a native Markdown presentation for saved and streaming
assistant replies. The toolkit owns parsing, selection, lists, tables and fenced
code; syntax highlighting uses its opt-in Syntect backend. Code blocks retain
their language and have a copy control. Full-source selection preserves Markdown
and image references rather than replacing the saved message with its rendered
projection. User input remains literal text. Model output never becomes an
executable local command or an embedded browser document.

The visual direction remains the product's existing conversation language,
ENERGY 1 / RHYTHM 1 / MOTION 1. Canonical heading sizes establish hierarchy,
the canonical code surface separates literal code, and the assistant prose stays
unboxed. Extra code-header space keeps copy controls clear of the first line.
Both toolkit theme modes now follow the native appearance; the code/table/link
roles are projected from the existing palette rather than toolkit defaults.

Untrusted document images are labelled text, including reference and data-URL
images. Inline and block HTML are rendered literally. An independent image-source
override denies host I/O even if a later parser extension emits an image node.
Conversation links admit only absolute credential-free HTTP(S) targets; file,
command, custom, relative and control-character targets do not reach the browser.
There is no automatic remote-image request or local-file opening from Markdown.
An admitted attachment renderer remains required for full rich-content parity.

The off-screen fixture exercises the same production view configuration and real
Metal renderer in both themes. It verifies parsed headings/prose/code/tables,
exact full-source selection, the media/HTML text projection, unchanged redraw,
Unicode replacement and the actual copy button's clipboard result. This does
not establish native-window input, browser handoff, IME or screen-reader use.
Math, citation metadata, downloads, generated files and artifact interaction
remain unfinished. The reference slice is Track A's conversation presentation
in `desktop-product-parity.md`; current web rendering remains the authoritative
product owner. The pinned toolkit source and its upstream TextView documentation
were consulted for the APIs; upstream main is not substituted for 0.9.0.

The highlighter's embedded syntax definitions retain their original notices in
`--licenses` and the packaged Resources notice file, alongside the ordinary Cargo
dependency notices. No Zed application source is copied.

Verified for this slice: all 30 native tests pass; the Metal fixture passes at
768px and 320px in both themes, including code-copy clicks. Strict native Clippy,
workspace compilation, the packaged Cloud-chat fixture, development-bundle
signature, dependency license/source/bans checks, script lint, formatting and
generated context indexes pass. The bundled notice file matches the executable's
complete output. The calamine advisory observed in that slice is resolved by the dependency
engine update below; no advisory exception was added. Native
browser handoff and accessibility remain **NOT_RUN** until the relevant native journeys are exercised.

## Attached Cloud run approval and continuation

The account runtime now replays the durable run's paginated event journal after
the request stream ends. A separate text projection reconciles that journal
with already streamed text, so a continuation appends its output without
duplicating the first reply. Identity/schema/sequence gaps, inconsistent cursors,
nonadvancing pages and conflicting text fail visibly. Whole pages commit only
after validation; event/output/review data stays within the existing transcript
budget. Stop can still request cancellation without completing a large journal.

The run's checkpoint summary only contains truncated argument previews. Native
approval therefore requires the complete canonical approval events to match
every pending tool-call ID and name. The UI displays those full inputs and their
reported risk. Allow once opens a native confirmation naming the actions and
their consequences; deny does not save a permission rule. The typed resume RPC
rechecks the account/deployment scope, run identity, checkpoint, current state
and the exact reviewed event payload before submitting the batch. Approval is
once only; session and permanent grants are not offered by these controls.

Paused runs can resume through the existing server-owned continuation route.
Both continuation routes return streams. Approval requests opt into the server's
detached execution; paused resumes inspect the returned transport. Durable
responses can detach, while inline or unknown paused transports retain a bounded
response reader until EOF or Stop. The latter remain attached and cannot be
replaced by a new turn while their response is open. Run polling continues during
that reader so output and decisions still update. It does not issue a new
conversation/model request or execute a local tool.
Stale snapshots cannot stop the native poller after a newer resume was applied.
Failure leaves a visible unconfirmed state and a run-refresh control; there is
no automatic decision resubmission.
Temporarily unavailable or incomplete journal details disable review and allow
refresh; they do not silently cancel already accepted Cloud work.

`test:gpui:work` uses the packaged CLI with a disposable account and controlled
loopback gateway. It verifies full action details beyond the preview limit,
approval/denial, paused continuation, pagination, resumed output and saved replies.
Wrong account scopes, stale checkpoints, changed reviewed arguments and repeated
decisions after completion are refused without a continuation mutation. This
fixture also withholds complete review details until a refresh and keeps an
inline paused-resume stream open long enough to detect premature disconnection.
It performs no real inference, connector write or account operation.
The reference slice is Track A's long-running work/approval journey; current
Cloud contracts, routes and the shared Tasks UI own the behavior. The native
direction remains ENERGY 1 / RHYTHM 1 / MOTION 1, with progress and decisions
inside the assistant turn and existing neutral controls.

Connector input forms, pause/steer controls, durable draft
recovery and full lifecycle handling remain required. Native confirmation,
keyboard, browser/account and screen-reader acceptance are still **NOT_RUN**
until the relevant native journeys are exercised. A successful protocol fixture is not native acceptance
or evidence of a complete application migration.

Verified for this slice: 30 native tests, three CLI journal tests, 75 shared-server
tests and 60 VS Code runtime-client tests pass. Strict native/CLI Clippy, the
workspace build, VS Code typecheck, both generated binding checks and parity for
503 modules, the packaged work/chat fixtures, both-theme Metal regression,
development-bundle signature, formatting, script lint, Rust egress guard and
generated context indexes pass. Native approval-confirmation and keyboard
interaction remain separate acceptance work.

## Work discovery and cold-process recovery

The native Work entry lists account-owned AGI Work runs through the existing
Cloud runs API. The server owns the Work/chat distinction and default active
states; native state filters and opaque pagination cursors are forwarded rather
than recreated in a local routing table. Lists and cursor history are bounded,
rows deduplicate by run ID, and repeated cursors or changed account/deployment
scopes are rejected before replacing visible data.

Opening a saved run reads its current metadata and replays its event journal
without creating a conversation, model request, local session or fake user
message. The runtime separates the immutable original send request from a
recovered run identity. Controls validate scope, request key and run ID, including
when two runs share a request key. A run whose conversation is gone retains a
nullable conversation identity; its owned journal binds one consistent event
session instead of inventing a conversation ID.

The Work detail view uses the same Markdown, approval, pause-resume and Stop
controls as Cloud conversations. Control actions carry the identity rendered on
the button; late replies from a previous selection cannot update the new run.
Switching or leaving a recovered view closes its watch without a cancellation
request. An inline continuation with an owned response stream refuses detachment
until it finishes or the user stops it. Code remains an independent consented
runtime, and the Work view is labelled with the canonical Cloud trust label.

The packaged work fixture now starts a fresh CLI process, lists and pages saved
web-originated runs, filters completed work, and recovers both linked and unlinked
runs. It checks approval after reopening, paused inline continuation, refusal to
detach an attached response, wrong-scope requests, and cross-run control refusal
for identical request keys. Inference-request counters ensure recovery does not
dispatch another model request. Native cache tests cover scope, cursor, reset and
run-identity isolation; the journal test also rejects mixed sessions on an
unlinked run.

A forced socket-disconnect case reproduced an unrequested cancellation from the
old stream-error handler. Accepted durable runs now recover through the journal
and retain their last known state; a display/transport failure does not issue
Stop or invent a failed engine state. Parser aborts use their own signal so they
cannot become a later user's Stop. Request-scoped streams retain their existing
interruption behavior, and explicit Stop still follows the owned run cancellation
path.

The saved-history handoff also releases the completed native send guard once its
owned reply is present in the loaded messages, allowing the next message without
discarding the saved response. A focused state test reproduced and verifies this
handoff. Latest-window loading now brings the finished response into view on
long conversations, as described below. Real-account long-thread and native
interaction acceptance remain required.

This is one attached account run view at a time, with other Cloud runs left in
their account. Connector input forms, project filtering, complete
activity/artifact presentation, pause/steer actions, background notifications,
multiple windows, durable drafts and OS lifecycle acceptance remain required.
The direction stays ENERGY 1 / RHYTHM 1 / MOTION 1: compact filters and metadata,
a single output column, neutral controls and the canonical theme/type contracts.
The reference remains Track A's Work journey; current Tasks UI and Cloud routes
own behavior. No vendor implementation or consumer session data is copied.
Native navigation, confirmation, keyboard and accessibility acceptance remain
**NOT_RUN** until the relevant native journeys are exercised.

Verified for Work discovery/recovery: 33 native tests, four CLI journal tests,
75 shared-server tests and 60 VS Code runtime-client tests pass. The expanded
packaged work fixture passes cold-process recovery, run-ID isolation, linked and
unlinked continuation, and the forced-disconnect regression with unchanged
inference-request counters. The packaged chat fixture, both-theme Metal
regression, workspace build, strict native/CLI Clippy, types/VS Code typechecks,
508-module generated checks/parity, development-bundle signature, formatting,
script lint, Rust egress guard and generated context indexes pass. These checks
do not establish a real authenticated account or native Work interaction.

## Latest conversation windows and older history

The native reader now opens the latest message window through an optional
`cloudHistoryTail` runtime capability. Its `latest` and exclusive `before` modes
map onto the existing Cloud count/offset API without a server endpoint change.
Forward reads retain their existing behavior. Latest loading retries an observed
count change once under the existing total read deadline; missing counts,
repeated changes and incomplete ranges produce visible errors rather than an
invented empty or current history.

The backward projection admits the newest messages first within the existing
UTF-8/JSON budget, then returns them chronologically. Start offsets and older
cursors describe the rows actually projected, so omitted older rows remain
reachable. Native older pages must meet the loaded window and cannot repeat a
cursor, overlap IDs or introduce a gap. Prepending under cache pressure retains
the older window being requested; Latest messages reloads the end.

The native viewport requests bottom positioning during layout, follows a visible
turn only while the reader stays at the bottom, and stops following for explicit
older-page browsing. New sends and Latest messages resume following. The same
viewport owner is exercised by the Metal fixture, including a Markdown parse
that completes after initial layout; the test checks that parsing settled before
asserting the final offset. This is off-screen evidence, not OS scrolling or
accessibility acceptance.

The packaged history fixture now covers 123 messages, latest-to-oldest paging
without duplicates, saved-reply handoff for a follow-up, a concurrent append,
empty history, missing counts, persistent count changes and wrong-scope refusal.
Request counters also ensure the bounded retry and invalid-mode refusal are
actually exercised. The visual direction remains the existing conversation
language, ENERGY 1 / RHYTHM 1 / MOTION 1, using the same type, palette, composer
and neutral navigation controls. Native window, keyboard/trackpad, screen-reader,
message-branch selection and real-account continuity acceptance remain required.

Verified for history windows: 34 native tests, 19 CLI chat-adapter tests,
75 shared-server tests and 60 VS Code runtime-client tests pass. The expanded
packaged history fixture passes all paging/count/error cases; packaged chat and
work fixtures still pass. Both-theme Metal checks include settled asynchronous
Markdown and scrolling behavior. Strict native/CLI Clippy, workspace compilation,
508-module generation/parity checks, types/VS Code typechecks, development-bundle
signature, formatting, script lint, Rust egress guard and generated context
indexes pass. These isolated checks do not establish native UI acceptance; the native verification below records the journeys actually exercised.

## Native Work creation and plan decisions

New Work now creates a Cloud conversation and submits a structured text goal to
the existing Work gateway with plan review explicitly requested. Work mode is a
native compose intent until the gateway persists the conversation's mode. The
mode identifier comes from the shared runtime contract. The server retains model,
entitlement, tool, rate and credit admission; the native host does not keep a
second catalog of those policies.

The stream decoder forwards the canonical planning event. The native view shows
the proposed goal and steps and requires a consequence confirmation before Run
plan or Dismiss review. A failed plan save keeps execution unavailable and offers
an explicit retry. The review seal detects changed or truncated instructions;
the host also compares the exact immutable content and current account scope.
Old or incomplete reviews remain readable without gaining an execution control.
Plan approval does not grant tool permissions.

The existing message PATCH route now accepts a typed review decision. Its atomic
comparison checks the prior saved review and merges only plan metadata. It does
not rewrite message content/model, replace unrelated metadata, reparent messages
or select an earlier conversation branch. A stale decision fails visibly.
The native client verifies the saved review returned by the server. This route
addition and the shared gateway's fail-closed planning change require normal Web
rollout; no deployment has been performed by this migration work.

Running a plan preserves the planning reply and adds a recorded follow-up using
the reviewed goal and ordered steps. This intentionally differs from the Web
client's planning-pair rollback. Stable continuation IDs and history frozen through
the planning reply let the managed gateway reject retries without another model
execution. The actual gateway returns HTTP 409 for a terminal idempotency key;
the fixture now checks that refusal rather than inventing a cached stream replay.
An explicit review request with a goal fails closed when the planner produces no
usable plan. Legacy Work requests without a structured goal retain their behavior.

The visual direction remains ENERGY 1 / RHYTHM 1 / MOTION 1. The review sits beside
its assistant reply, uses canonical theme/type values and existing neutral
controls, and presents the real steps as the decision's focal point. Native
window, keyboard, IME and screen-reader acceptance remain unverified. The current
computer-use attempt to inspect the native app timed out.

Verified for Work creation: 34 native tests, 19 CLI chat-adapter tests, two review
identity tests, 75 shared-server tests and 60 VS Code runtime-client tests pass.
All four packaged fixtures pass: history, chat, durable Work approvals/recovery
and Work creation. The creation fixture includes an entitlement refusal, failed
save/retry, restart recovery, dismissal, changed-instruction refusal, explicit
execution and terminal-key replay refusal without another model execution. The
older Work runner now selects its exact test prefix so it cannot accidentally
run the creation fixture with the wrong environment.

The 50 focused message-route/planner tests and 48 managed-usage tests pass. An
isolated local PostgreSQL run of the exact review SQL preserves content, model,
unrelated metadata and the active leaf, and rejects a stale comparison with zero
rows changed. This is not live account/RLS acceptance. Workspace compilation,
strict native/CLI Clippy, both-theme Metal regressions, 513-module generation and
parity checks, types/VS Code typechecks, development-bundle signature, formatting,
script/Web lint, route-contract ownership, database-write guard, Rust egress
guard and generated context indexes pass. No real account operation or inference
was performed by these checks.

An earlier Web typecheck encountered the concurrent
`caller-wire-owned-pzkseiwk.test.ts` fixture's incomplete `ProcessedRequest` cast.
That unrelated fixture was left unchanged by this work. The current full Web
typecheck, run with the required 8 GiB heap during terminal verification, passes.

## Local Code change review

Code now exposes a Changes view through the existing host checkpoint contracts.
It lists completed per-turn snapshots, names skipped files, opens each changed
file and renders exact unified-diff sections as literal code. A finished snapshot
is historical: staging and reverting change the index or working folder while
the reviewed snapshot remains the same. A running turn is labelled as still
recording, and applying controls wait for local work to finish.

Stage file/section and Revert file/section first use the host's preview mode.
Revert names the working-folder consequence and asks in a native prompt. The
host rechecks each patch against the actual index or file before applying and
reports conflicts without silently replacing later edits. The native view checks
the response phase and exact selected paths, and displays partial/uncertain
outcomes. Session/connection and operation identities discard stale UI callbacks;
changing coding sessions clears the review. These paths add no filesystem access
to the account-only connection and introduce no native filesystem writer.

The direction remains ENERGY 1 / RHYTHM 1 / MOTION 1. The existing single column,
neutral buttons, code surface, typography and syntax renderer keep the actual
changed code as the focal point. Arbitrary diff source is fenced so embedded
Markdown, HTML, images and links remain code. The public reference is Claude
Code's desktop documentation, read 2026-11-09, specifically the file-by-file diff
journey. Its comment-to-agent review, broader editor features, additional terminal features and
multi-pane workspace are still migration work; this slice does not claim those
features. Source: https://code.claude.com/docs/en/desktop#review-changes-with-diff-view.

The isolated packaged Local fixture verifies section staging without modifying
the working file, a separate section revert preserving the index, conflicts
against a later edit, whole-file binary/add/delete reverts, forged traversal and
unknown-session refusal, restart recovery and unavailable checkpoints outside
Git. It starts no model turn. Four additional projection tests verify checkpoint
identity/completeness, repeated files/hunks, exact outcome ownership and literal
diff fencing. Native window, keyboard, prompt and screen-reader acceptance remain
unverified; the computer-use request to inspect the native app again timed out.

Verified for change review: 38 native tests and the packaged Local review fixture
pass. The Metal run includes isolated diff rendering at 320/768 in both themes,
literal source projection, code copying, repaint stability and the existing
Markdown/viewport regressions. The isolated diff screenshots were also inspected.
Workspace compilation, strict native all-target Clippy, development bundle and
signature verification, script lint/formatting, Rust formatting, 41 CI-selector
tests, Rust egress guard and the three generated context-index checks pass.
These checks do not close the native interaction/accessibility flaws or establish
real-account coding/inference, full editor behavior, a terminal or release parity.

## Native file browser and editor

Files now opens the consented coding folder through additive workspace file
contracts. The CLI alone owns directory handles, path/credential policy, text
limits, revision hashes and writes. The native client keeps one editor buffer and
never imports that text into a model conversation. The account-only host exposes
no file capability, and all three file methods refuse there. The shared method
registry classifies reads as owner-only and saves as state changes; the independent
query-token security assertion also names these methods.

The browser pages a bounded, sorted name window and can open a specific relative
path. It labels host-protected entries, reports unsupported names and surfaces
oversize directory scans. The protocol owns the 512 KiB text limit, page limit
and scan limit. Read/save responses must match the selected root and exact path.
Root replacement, traversal, symlinks, hard links, credential/protected paths,
binary/non-UTF-8 content, special files and over-limit text fail visibly.

Save file and Cmd/Ctrl+S recheck the opened revision inside the existing granted
file authority. The guarded path retains the file's inode and permissions/ACLs;
it uses the owner's existing in-place write semantics. It is not an atomic
rename save or a serialization guarantee against an uncooperative external
writer between the final check and write. The host excludes its own coding,
stage and revert operations while saving, verifies the saved text and reports
uncertain outcomes. Replaying an already-applied identical save does not write
again. File I/O failure/crash and external-writer stress acceptance remain needed.

Unsaved text survives panel/session navigation in memory. Reopening/reloading a
file or closing its buffer names the loss and asks before discarding it. Folder
switching requires saving or explicitly closing the dirty file; window closing
names unsaved file edits and waits while a save request is pending. Durable draft
recovery and OS termination paths remain open. File creation, rename/delete,
automatic save, richer language tooling and multiple file buffers remain
migration work.

The actual GPUI editor widget preserves BOM, CRLF and Unicode and renders edits
with line numbers in the Metal fixture. The read-only guard reaches the editing
engine during operations. The direction remains ENERGY 1 / RHYTHM 1 / MOTION 1,
with the existing type/theme, a source-code editor as the focal point and half of
the available window height reserved for it above folder navigation. The explicit
save default and protected-file refusal are intentional differences from Claude
Code's documented auto-save/override workflow; no force-overwrite path was added.
The public reference was refreshed on 2026-11-09:
https://code.claude.com/docs/en/desktop#save-edits-in-the-file-pane.

The packaged fixture covers two directory pages, exact UTF-8 saves, no-op replay,
later-edit conflicts, read-only targets, maximum/oversize files, credentials,
traversal, symlink/hard-link/FIFO refusal and account-only list/read/write refusal.
APFS rejected the invalid UTF-8 filename fixture before application code ran, so
that filename case is Linux-only; invalid UTF-8 content and unsupported portable
names are exercised on macOS. Three new native projection tests check response
ownership, dirty state, save acknowledgements and directory cursor integrity.
Two added file-authority tests inject an external edit after opening and a
substituted link, and verify inode/mode preservation. The native verification below
now covers folder consent, browsing, editor text, Unicode paste and exact Cmd+S
save. Discard prompts, physical IME and full screen-reader acceptance remain open.

Verified for file editing: 41 native tests, 16 file-authority boundary tests,
75 shared-server tests and 60 VS Code runtime-client tests pass. All six packaged
fixtures pass, including the new file workflow and the prior local Changes,
Cloud history/chat/Work/reviewed-creation paths. The account isolation checks
require the unavailable-method error, so a wrong-root or missing-file error
cannot masquerade as an account-boundary refusal. The expanded Metal fixture
passes at 320/768 in both themes and the editor screenshots were inspected.
Workspace compilation, strict native/CLI all-target Clippy, 521-module generated
checks/parity, types/VS Code typechecks, development packaging/notices/signature,
script/VS Code lint, formatting, 41 selector tests, the Rust egress guard and the
three generated context-index checks pass. No real inference turn was started by
these fixtures. The subsequent full Web typecheck is recorded below.

## Unix interactive terminal

Terminal now uses the CLI's existing Unix PTY/process owner through an additive,
owner-only protocol family. The account-only host has no terminal capability.
Launch review binds a fresh expiring identity to the actual folder, shell, size,
sandbox and network policy. A changed/stale review cannot launch a process, and
replaying an accepted start returns the same terminal. The default contained
profile denies network access and the existing environment/sandbox policy remains
in the launch path. Operator launches remove the agent-spawn marker so a person
can use interactive programs; agent command launches keep their marker and pager
settings. There is no automatic agent approval or conversation-context attachment.

Manual terminals are absent from the agent's background-command table. Raw input
uses a bounded serialized path with per-terminal sequence/last-payload checks;
uncertain delivery stops the terminal and is never silently replayed. Input text
is not retained in the agent input-history field. The host's bounded VT parser
projects screen cells, ANSI styles, wide Unicode, cursor/application modes,
alternate screen and scrollback. OSC clipboard/title/link requests cannot act on
the native desktop. Only fixed terminal query responses are returned to the PTY.
The screen/resource limits live in the Rust protocol, and the largest styled
screen is checked against the actual response budget.

The native view now offers reviewed launch, four terminal slots, resize/fit,
scrollback, copy, paste review and confirmed close. Complete multi-line paste text
is visible before the consequence confirmation. UTF-16 composition stays local
until committed to its fixed terminal identity; disabled or stale views cannot
forward it. Cached metadata cannot rewind an input counter or reenable an ended
terminal. An optional screen update is accepted only with a matching requested
revision and cached screen. The row/cell renderer treats terminal output as data,
including its requested ANSI colors; host controls continue to use the existing
theme/type roles. The existing Tauri ANSI colors were moved to the shared design
owner, mirrored in foundation CSS and consumed by both hosts without changing
the retained terminal's palette. The 256-color mapping is also shared.

Interactive jobs use separate process groups. Cleanup now enumerates the owned
terminal session, signals its jobs and verifies their OS disappearance before
reporting Stopped. The enumerator checks both host presence and the host's known
session ID, so an empty/broken probe cannot establish cleanup. This also fixes
the CLI PTY owner's group-only cleanup path. Spawn and actor publication remain
in one poll; cancellation cannot strand an unpublished PTY. Failed/expired/cancelled
launch metadata and confirmed closes use a bounded retirement history, so close
remains idempotent without pretending an arbitrary unknown terminal stopped.
Native window close stops known/unconfirmed terminal scopes before removing the
window; a cleanup error keeps it open and visible.

Verified: 47 native tests, six CLI PTY/input tests, four terminal parser/launch
tests, 75 shared-server tests and 60 VS Code runtime-client tests pass. All seven
packaged fixtures pass, including the new terminal path. It observes a real TTY,
exactly-once input replay, ANSI/Unicode output, actual window-size changes, a
sandbox-denied outside write, foreground/background groups, process absence after
close and shutdown, and the account-only unavailable-method error. It starts no
model turn. The color fixture now waits for a colored output cell rather than
matching echoed command text; shell printf escapes are raw strings. PID probes
use an absolute system executable rather than project-influenced PATH lookup.

The expanded Metal fixture passes the actual native grid at 320/768 in both
themes, wide glyph layout, marked-text/commit routing, a surrogate-pair range,
Ctrl-C event routing and disabled input. Its screenshots were inspected. The
734 shared theme tests pass, including the ANSI mirror and 256-color mapping.
Full Web, desktop, types and VS Code typechecks pass. Strict native/CLI Clippy, workspace compilation,
537-module generated checks/parity, packaging/notices, script lint, selector and
Rust egress checks pass. The license/source/bans policy passes. The calamine and retained SQLite/SQLCipher vulnerabilities observed in this
slice are resolved by the dependency engine update below; no exception was added.

This is still a candidate implementation. Native launch consent and window-close
cleanup now have local macOS evidence below. Terminal paste review, physical
IME, full screen-reader journeys, crash/forced-exit behavior, resource/latency measurements
and Linux acceptance remain unverified. Windows ConPTY is not implemented and the
Windows capability stays false; the terminal fixture refuses a Windows run rather
than passing an empty test filter. Mouse reporting, richer selection/search,
terminal persistence across a host restart and additional shell/environment
controls remain migration work. The visual direction stays ENERGY 1 / RHYTHM 1 /
MOTION 1. The public terminal journey was refreshed from Claude Code's desktop
reference on 2026-11-09: https://code.claude.com/docs/en/desktop#run-commands-in-the-terminal.

The development bundle was opened for native acceptance, but the computer-use
app inspection again timed out. The actual window, dialogs and OS input are not
claimed verified by the headless rendering and packaged runtime results.

## Dependency engine and compiler compatibility

The CLI and retained Tauri now use calamine 0.38.0. The CLI reader suite passes
all 15 cases, including a truncated OLE directory, a cyclic DIFAT chain, valid
spreadsheet values/formula caches and existing extractor resource limits. The
same truncated directory reproduces a bounds panic with 0.37.0 in an isolated
fixture project; the fixed reader returns an error.

Retained Tauri now uses rusqlite 0.41.1 / libsqlite3-sys 0.39.1 while preserving
bundled SQLCipher and vendored OpenSSL. The binding's SQLCipher source pin still
selects an affected engine upstream, so the root Cargo patch supplies the
unmodified SQLCipher 4.20.0 amalgamation with SQLite 3.54.1. The source carrier
verifies file hashes during builds; an independently modified copy fails that
guard. Attribution, license delivery, provenance and the removal condition live
in [the dependency patch owner](../../docs/security/dependency-patches.md#sqlcipher-engine-source)
and `THIRD_PARTY_LICENSES.md`.

Keyed opens reject an older SQLite engine or absent SQLCipher before schema
access. Tests assert actual linked engine versions and preserve encrypted reads,
writes, WAL checkpointing, wrong-key refusal, legacy plaintext migration and
machine-key rekeying. A preserved encrypted fixture was generated with the old
SQLCipher 4.5.7 / SQLite 3.45.3 engine; no user database was opened. The SQLite API
migration also uses checked integer binding and the new column-name iterator.

The vulnerability policy passes without advisory ignores or new license/source
exceptions. The full maintenance scan still fails for 17 unmaintained packages
and warns about yanked async-executor 1.14.0; those remain under
`RUST-DEPENDENCY-ADVISORIES-01`. The retained native compiler's style errors are
resolved with equivalent sorting, iteration and control flow rather than lint
allowances.

Verification passes: 517 retained-desktop regression tests, 47 native tests,
15 CLI document-reader tests and 17 notice-generation tests; workspace
compilation and strict library Clippy; formatting, license/source/bans checks,
generated context indexes, source-integrity negative control and development
bundle signature/notices. The rebuilt development bundle passes all seven
packaged local/Cloud workflows.
These results do not establish native window, operating-system input,
accessibility, real inference, cross-platform release or full product parity.

## Native Cloud model choice

The native Cloud conversation now exposes model choice from the same live
`/api/models/catalogue` owner used by web. The account-only protocol projects
display names, developers, admission, temporary unavailability and minimum-plan
labels; it does not copy routing tables, model IDs, pricing or provider keys.
The catalogue read has bounded bodies/output, identity checks, unique-ID/count
validation and its own capability. The strict account bootstrap allowlist
recognizes that reader while continuing to reject Host Developer capabilities.

The picker searches names/developers in a compact virtualized menu beside the
composer, with an explicit catalogue refresh. It retains drafts and scopes each
choice to one account and conversation.
Late requests cannot overwrite a newer catalogue. Changing models saves the
conversation's model before committing the native picker, preserving its history. The host rechecks
live admission before sending; blocked/degraded or malformed catalogue results
cannot reach inference. Proven preflight rejection permits editing the retained
message. Unknown acceptance still requires history inspection. A reviewed Work
plan's model cannot be overridden, and a replay cannot change the chosen model.

The reference is Track A's model-choice row in `desktop-product-parity.md`.
The [current Claude model settings documentation](https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings),
read 2026-11-09, documents changing models within a conversation for the next
response, with administrator-dependent availability. That page is general app
documentation, not an observed macOS session. The implementation follows the
repository's web catalogue and Cloud boundaries. Effort controls, account-wide
new-chat defaults, on-screen keyboard/IME and accessibility qualification remain
unfinished. The compact popover and row geometry are covered by the Metal
verification below; this is not a complete model-picker parity claim.

The isolated real-CLI chat fixture now exercises catalogue reads, wrong scope,
malformed/duplicate entries, blocked/degraded preflight rejection, exact selected
model dispatch, unchanged multi-turn history and model-sensitive replay conflicts.
The Work fixture also refuses a changed model on a reviewed plan. No paid
inference or real account login was performed by these fixtures.

Verification for this slice: 50 native tests, 75 shared server tests, 60 VS Code
client tests and all seven packaged runtime workflows pass. The 540 generated
protocol modules and their mirror/parity checks, native/CLI strict Clippy,
workspace compilation, desktop/types/VS Code typechecks, script lint, formatting,
token checks, development signature/notices and generated context indexes pass.
The global model-ID guard reports 105 occurrences in the existing knowledge-graph
`files/tools.jsonl` and launch QA ledger; this slice does not claim that broader
check passes; it is tracked by `MODEL-ID-DOCUMENTATION-GUARD-01`. The Rust egress
guard passes with 22 existing transports awaiting migration. The compact picker
now has the off-screen layout and key-path evidence below;
on-screen keyboard/IME and accessibility remain NOT_RUN. The runtime fixtures do
not establish those UI gates.

## Compact model menu and rendering acceptance

Cloud model choice now uses the pinned toolkit's searchable Select with
virtualized rows. The control and Refresh action sit beside the composer; the
full-page picker and manual paging state are removed. A conversation loads its
catalogue once, refresh is explicit, and changing scope or catalogue request
replaces the widget and its subscription. Confirmation still checks the account,
conversation, request generation and active-work guard. Search and dismissal do
not alter the committed model. The server's send-time admission and reviewed
Work model protections remain in force.

The row geometry and text roles come from `agiModelPickerGeometry` in the shared
design-token owner. The production widget and toolbar are used directly by the
Metal fixture, including the existing native action-button primitive now factored
into one owner. The fixture measures a 48px selected row from painted pixels at
768/390/320 in both themes and checks for ink at the viewport edges. It verifies
unchanged redraw, restricted/degraded choices refusing pointer/Enter activation,
normal selection, case-insensitive search of an off-screen option, empty results,
Escape focus restoration, outside dismissal, disabled input, and Refresh through
pointer and keyboard. The screenshots were inspected.

The pixel probe exposed the toolkit's legacy selected-row token retaining its
default colour after the semantic theme was updated. Native theme synchronization
now updates both token views, including popup fill/text and the canonical neutral
highlight. The empty-search message also uses the normal guidance text role
rather than a faded default. The 737 shared theme checks pass.

The toolkit's optional observation feature would resolve an alternate backend
pinned to an older Taffy patch. It is not enabled; Taffy 0.15.1 and the existing
backend remain. Tests use public GPUI keyboard/input simulation, focus, selection
events and Metal pixels. Raw key-down events do not deliver committed text, so
search testing uses GPUI's documented keystroke/IME simulation. These observations
are not OS accessibility-tree or physical IME acceptance. No dependency or guard
exception was added.

Verified for this update: 50 native tests, the existing Metal rendering suite
including the six model-menu cases, 737 theme checks and all seven packaged
runtime workflows pass. Native strict Clippy, Cargo workspace compilation,
web/desktop/design-token typechecks, script lint, formatting, CSS-token checks,
development bundle signature/notices and generated context indexes pass. The
obsolete manual-pagination test was removed with that control; the production
virtualized menu is tested through the renderer instead. Full native-window,
screen-reader and physical IME acceptance remain open.

## Cloud conversation management

The native conversation exposes Rename, Pin/Unpin and Archive/Restore through
`cloud/conversation/update`, an owner-only capability on the account runtime.
The request carries a frozen account/conversation/organization identity, a
specific revision and one typed change. The host uses the existing web PUT owner
with If-Match; it never synthesizes a version or sends a wildcard. Versioned
history preserves the response ETag, and a body field cannot replace it. Missing
revisions leave management read-only while ordinary history remains readable.

The title limit and workspace header/sentinel now have one JSON owner at
`packages/contracts/cloud-contracts/src/conversation-contract.json`, consumed by
the web exports, CLI and native bridge. Title validation uses UTF-16 units, as
the web schema does. Metadata requests explicitly choose the conversation's
organization or personal workspace using the canonical header. Scoped history
reads pin and verify that workspace too. The native detail labels personal versus
workspace conversations. The workspace continuity implementation below extends
this binding to creation, inference transport and recovered Work.

Rename keeps its proposed text on conflicts or uncertain outcomes. Review latest
conversation reloads saved metadata without replacing the transcript; saving
again is an explicit action. A confirmed already-current title closes editing
without another write. Pending saves protect against closing or changing accounts
before their result is known; unsaved title edits participate in close prompts.
Other conversation navigation waits for Save or Cancel.

History has an Archived view, while normal search can include archived results.
The wire supports the web owner's include/only/exclude filters. Pin and archive
updates preserve saved messages; archiving adopts the web owner's unpin behavior.
An archived native conversation is read-only until Restore, including a retained
unsent draft. The native archive action sends only the archived flag; it issues no delete or
run-cancellation request.
Permanent deletion, bulk actions and a full context-menu/sidebar management
journey remain unfinished.

The current [ChatGPT archive documentation](https://help.openai.com/en/articles/8809935-deleting-and-archiving-chats-in-chatgpt),
read 2026-11-09, documents archiving without deletion, searchable archives and
restoration. It is general app documentation, not an observed macOS session.
The implementation uses AGI Workforce's existing API and retention behavior.

The actual production controls are exercised in the Metal fixture at 768/320 in
both themes: frozen versioned rename, Unicode input, keyboard Save, retained
conflict text, read-only editing during a save and Restore. Screenshots were
inspected. The real-CLI chat fixture verifies revision headers, wrong scope and
organization, wildcard refusal, UTF-16 limits, stale-writer rejection,
pin/unpin/archive/restore, archive filters/search, mismatched responses,
missing-version read-only behavior, a single HTTP attempt after a committed write
loses its reply, and explicit personal reads/writes after the active workspace
changes. Its error responder now preserves 403/412 status codes; record counts
alone are not treated as evidence of no replay. No real account, paid inference
or production data was used by these fixtures.

Verified for this update: 53 native tests, 149 CLI Cloud tests (one live test
ignored), 75 shared server tests, 60 VS Code client tests, 15 web route tests,
16 shared conversation-contract tests and all seven packaged workflows pass.
The full Metal suite passes, including the four conversation-control cases.
The 545 protocol modules and mirrors/parity, native/CLI strict Clippy, Cargo
workspace compilation, cloud-contract/types/desktop/VS Code/web typechecks,
script lint/formatting, CSS tokens, egress checks, development signature/notices
and generated context indexes pass. The shared-contract ownership guard now
registers the existing caller-tool-handoff module in its canonical inventory;
its scan remains strict. Broader previously registered repository blockers and
live native/account acceptance are not closed by these checks.

## Native workspace continuity

The account-only runtime now owns typed `cloud/workspaces/list` and
`cloud/workspace/select` methods. They use the existing web GET/PUT
`/api/settings/workspaces` owner, prove the bearer account and active membership,
reject malformed or duplicate identities, and bound both HTTP and protocol
responses. Query-only clients cannot read owner memberships or select a workspace.
The endpoint and personal selector are consumed from shared JSON owners, and
changes to those owners select native CI validation.

The native searchable menu shows organization slugs and roles, including the
selected workspace's guidance after dismissal. It preserves a confirmed local
selection when another client changes the account's active default. A lost switch
reply blocks content operations until an explicit reload proves the result.
Revoked membership clears the selection without falling back to another workspace.
Drafts, active operations and attached Work prevent switching; account changes
and window closing wait for an in-flight switch result. A failed view reload keeps
the confirmed workspace; a full account reset clears it.

Cloud creation, history, streaming, run discovery/attachment, plan metadata,
approvals, cancellation and paused resumes now carry the same explicit workspace.
The CLI freezes it into each active run and recovered run identity, including
credential renewal. The canonical organization header is added only to account
transports and same-origin upload relays, never external storage uploads.
Metadata changes continue to pin the conversation's own organization and revision.
No Local or Host Developer session is imported by selecting a Cloud workspace.

The Track A workspace/context rows in the authorized reverse-engineering reference
are journey references only. The current
[ChatGPT workspace guide](https://help.openai.com/en/articles/8542216-managing-members-seat-types-and-roles-in-chatgpt-business),
read 2026-11-09, documents separate personal/organization content and an explicit
workspace switcher. This is general documentation, not an observed macOS UI.
The native implementation follows AGI Workforce's existing membership and content
authorization owners. Workspace management, invitations, durable draft recovery
and live authentication/native accessibility acceptance remain separate work.

The on-screen startup check exposed a panic from passing `secondary-` shortcuts
to the pinned GPUI static parser. Application bindings now use the OS-aware loader,
and the rendering suite installs the actual bindings. Closing also exposed a
quit-observer lifetime error: GPUI removes observers before polling cleanup, so
the returned future must own the Tokio runtime until both sessions finish. Cleanup
now retains that owner and waits for both results. Its regression uses a real
thread wake/clock; the first headless-clock probe timed out before the real Tokio
task ran and is not acceptance evidence.

The native macOS check reaches Account and workspace-load failure/retry states,
with visible keyboard focus and accessible basic controls. The raw-pixel
verification below corrects the earlier redraw report.
The corrected bundle exits through Cmd+W without startup/shutdown errors or a
remaining CLI child. No real account sign-in or model inference was performed
by the isolated launch.

Verified for this slice: 59 native tests, three workspace-host tests, 150 CLI Cloud
tests (one live test ignored), 75 shared server tests, 60 VS Code client tests,
922 Cloud contract tests and all eight packaged workflows pass. The full Metal
suite passes, including six workspace-picker cases and actual application binding
loading. The 550 generated protocol modules and their mirror/parity checks,
native/CLI strict Clippy, Cargo workspace compilation, cloud-contract/types/web/
desktop/VS Code typechecks, script lint, Rust formatting, CSS/text-role checks,
41 CI selection tests, egress checks, development bundle signature/notices and
generated context indexes pass. The copy guard now treats the generated native notice as verbatim third-party
legal content, matching the existing CLI-notice exclusion; legal text and
guard rules were preserved. The current model-ID guard reports 109 occurrences
in the generated knowledge graph and launch QA ledger, tracked by
`MODEL-ID-DOCUMENTATION-GUARD-01`. Neither global guard is claimed green.

## Native presentation verification

The native redraw finding was an observation error. Inline image representations
omitted unchanged content; the raw capture bytes still contained it. The native
probe saves the actual current renderer scene, and `tests/native_capture.rs`
compares both static text bands with raw CUA capture pixels after state/focus
changes. In dark mode, 3,382 of 3,385 reference heading pixels match; in light
mode, 3,052 of 3,055 match. Both second headings also pass the 90% mask-overlap
requirement. The verifier rejects blank references, blank native frames and shifted
text. It detects encoding from bytes: the CUA sample saved with a `.png` suffix
was actually JPEG. There is no renderer refresh workaround or dependency patch.

The actual Desktop window also retains sidebar text through account completion,
Cloud workspace-load failure, Tab focus, native folder dialogs/consent, file
browsing and editing, and window zoom. Raw sidebar-header ink counts are 1,009
before and after the Cloud failure; the heading changes intentionally to Code
after folder consent and remains at 636 pixels through editing and resize.
Native capture dimensions change from 2,200 by 1,584 to 2,940 by 1,696 on zoom.
The false redraw row and its stale acceptance blocker were removed.

Native terminal launch did expose a real crash while accessibility was active:
every glyph used one source-location-based text ID. The terminal now exposes
stable paragraph rows and paints individual glyphs without separate accessibility
nodes. Accessible row text and Copy screen use the same projection, preserving
combining characters and wide-cell continuations. Repeated Cloud messages,
approvals, work plans/steps, Work rows, unavailable models, terminal status rows,
blocked files and checkpoint notes now have stable scopes or explicit identities.
The existing headless platform does not activate a real accessibility adapter;
its rendering pass was insufficient to expose this crash.

The corrected development bundle opens two real contained, network-denied shell
tabs with accessibility active, accepts an ASCII `printf` command, exposes its
complete output rows, retains output after switching tabs, and stops the terminals
through the Cmd+W consequence confirmation. The native editor accepts committed
Unicode paste and Cmd+S persists the exact 40-byte UTF-8 test file. Native keyboard
event injection dropped non-ASCII characters, so that observation is not physical
IME acceptance. These checks used only a disposable folder, isolated CLI config
and synthetic localhost credential; no real account inference was performed.

Current verification: 60 native core tests, both raw native capture comparisons,
the full off-screen Metal suite, native strict Clippy across all targets/features,
the Cargo workspace check, and packaged file/terminal regressions pass. Native
Cloud multi-message/approval journeys, screen-reader navigation/focus announcements,
physical IME and the remaining product/release parity work are still open.

## Native Cloud interface verification

The macOS native Cloud fixture launches the signed app against a loopback server
with its own synthetic credential and isolated config. Responses use the shared
Cloud wire schemas; content requests must explicitly pin their workspace. The
fixture seeds multi-message histories, same-named organizations and two-action
Work reviews. Its control/inspection traffic is excluded from product request
counts. The server and ledger survive a native process restart, while interrupted
or timed-out native runs produce a nonzero result. It is test tooling only: no
provider inference, hosted account mutation or proposed tool execution occurs.

The real GPUI app loaded six saved messages, selected another admitted model,
accepted a committed Unicode draft and sent it through the packaged CLI. The
ledger proves one accepted gateway request with that selected model, the explicit
personal workspace and preserved previous messages. A cold native process reopened
the saved user message and assistant reply. The restricted model remained
uncommitted after accessibility Pick, Enter and Escape.

That native check exposed two concrete accessibility gaps. Picker custom rows
painted plain strings that were absent from the accessibility tree. Shared choice
rows now expose title and guidance text, and committed model/workspace values
include developer/admission guidance or the organization's slug while their
visual trigger stays compact. Assistant Markdown likewise lacked readable
content. Native documents now own and observe the toolkit's public text state and
expose its committed rendered text on a Document node. The same parser, selection,
code-copy controls, media restrictions and styles remain authoritative. Native
verification exposes headings, prose, code, tables and Unicode replies as readable
document content; it does not establish semantic table/link navigation or complete
screen-reader behavior.

The recovered Work view exposed both complete synthetic actions. Cancelling its
confirmation produced zero approval HTTP requests and preserved both pending
actions. Explicit Allow once and Deny each produced one request and resolved both
actions; paused Resume completed through its attached continuation. The ledger
contains two approval requests, one paused resume and no unexpected fixture
failures. The consumer Work trust label now comes from the canonical suite
privacy display owner and says Cloud, rather than the developer-session label.

The Mac locked before native new-Work, Stop, metadata-conflict and workspace-switch
journeys could be completed. The remaining native pass was interrupted and its
nonzero/SIGTERM result is retained, not treated as a green UI test. Independent
checks pass: five fixture HTTP cases and the packaged runtime's actual plan
sealing, metadata CAS, cold recovery and reviewed continuation. The latter reads
the saved planning record after execution; a finished turn is not required to
repeat an optional plan field in its snapshot. All 60 native core tests, the
production Markdown/model/workspace Metal suite and strict native Clippy pass.
Native screenshot/reader/IME acceptance and the full product/release goal remain
incomplete.

## Native frame and compact navigation

The native frame now separates its fixed header and composer from the scrolling
content. Chat, Work and Code share primary navigation; Cloud recents and workspace
selection live in the sidebar, while Account stays available at its foot. Code
navigation from a recovered Work run detaches only the view through the existing
host contract; it does not cancel that run or automatically start a folder runtime.
Below the shared compact breakpoint, Menu opens a full-width navigation sheet.
The background content is unmounted while it is open, preventing hidden controls
from receiving focus. Escape closes it and restores the menu trigger's focus.
This full-width sheet is an intentional native adaptation.

`agiChatFrameGeometry` in the shared design-token package owns sidebar, header,
composer and content dimensions. The existing unified-chat sidebar reads the same
owner. Native contracts also read the foundation stylesheet's panel corner and
hairline stroke, rather than keeping private copies. Native controls reserve their
focus border so keyboard focus does not change layout. `--window-size WIDTHxHEIGHT`
provides repeatable initial bounds; invalid or zero dimensions fail before startup.

This follows the repository's separate MessageList/composer implementation and the
current desktop navigation direction documented in the
[ChatGPT release notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes),
read 2026-11-09. That source is a documented product reference, not evidence of AGI
feature parity or an observed vendor interface. No vendor implementation is copied.

The Metal suite passes ten actual-frame cases across 1440, 1024, 768, 390 and 320
pixel widths in both themes. A measuring element delegates to the real layout and
records its actual bounds. Assertions cover the 48-pixel header, 52-pixel empty
composer, fixed footer, multiline growth and navigation focus. The scroll assertion
also requires changed transcript pixels, avoiding a pass over a stationary page.
Four further cases open the actual model selector above the fixed footer at 768
and 320 pixels in both themes and check painted popup pixels plus Escape focus.
The earlier Markdown, editor, terminal, diff and selector regressions also pass.

A signed native fixture verified the ordinary frame, saved history, held-stream
Stop and Work-to-Code navigation. Its independent ledger contains the cancelled
turn and unchanged pending Work actions; the native app closed normally. A second
320x640 native process verified Menu, Escape/Return focus restoration, conversation
selection and the footer model choices. Subsequent scroll input repeatedly failed
with the automation tool's `noWindowsAvailable` error while the native process
remained live. That fixture was interrupted and records a nonzero SIGTERM result.
Native drag-resize, remaining narrow scrolling, metadata conflict and workspace
switch acceptance are not claimed. The exact interrupted fixture artifacts remain
in the local test directory; no real account or provider was used.

Final checks for this frame slice pass: native formatting, strict Clippy across
all targets/features, the 60 core cases and startup-size parser case, the Metal
suite, five fixture HTTP cases, shared design-token/unified-chat and desktop/web
typechecks, CI scope cases, CSS-token and workspace-script guards, generated
context-index verification and whitespace checks. The local development bundle
build and ad-hoc signature/notices checks also pass. These are development and
isolated-fixture results, not release or authenticated-service acceptance.

## Saved conversation model choices

Native Cloud selection now follows `WebChatPage`'s confirmed conversation update:
a selected model is saved through the existing versioned metadata owner before it
becomes the committed value. `CloudConversationChange` adds the model field; both
TypeScript binding trees are regenerated from Rust. The account-only host reloads
the live catalogue, checks availability and its captured account context, pins the
conversation's workspace and sends a one-field PUT with the exact revision. A
successful response must confirm the requested model and conversation identity.
The native picker has no private selected-model override; refreshes and reopened
conversations read the saved record.

Saving prevents another model change, send, title edit or workspace operation.
A conflict or uncertain write leaves the confirmed value in place and requires
Review latest conversation before sending or choosing again. The footer exposes
that recovery action. A restricted or unavailable catalogue entry cannot be
chosen, and the host independently rejects it. No cross-boundary routing or
automatic provider substitution is added. Default routing that the service owns
continues through that service; this slice does not add account-wide new-chat
defaults, effort controls or native Auto-profile parity.

The current [Claude model settings documentation](https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings),
read 2026-11-09, documents changing the model within an existing conversation for
the next response, subject to administrator controls. This is documented behavior,
not an observed vendor macOS run. Saved preferences follow the repository's
existing web implementation rather than inferring vendor storage internals.

The packaged CLI chat fixture now validates the chosen model's revisioned save,
restricted/unavailable/unknown/malformed refusal, stale-revision refusal and cold
recovery through a new CLI process. Its server ledger requires exactly one model
write, so rejection cases cannot pass after mutating the record. The existing
metadata lost-response and transcript/multi-turn/cancellation cases still run.
Core cases, strict CLI/native Clippy, generated protocol parity, desktop/types
typechecks, the Metal renderer suite, five HTTP fixture cases and the packaged
Work plan sealing/recovery/continuation check pass. The signed development bundle
and bundled notices also validate.

A fresh isolated native app started with the synthetic account, but input again
failed with the desktop automation tool's `noWindowsAvailable` error. That run was
interrupted and records SIGTERM/nonzero status; native model-save acceptance is
still open. No real authentication, hosted account write or provider inference
was attempted. The earlier native picker interaction evidence does not prove
this new persistence journey.

## Cloud draft continuity

Cloud drafts now use the existing web conversation draft owner, including its
independent revision clock. The shared conversation contract owns the maximum
UTF-16 length and autosave debounce; web, CLI and native consumers read that
owner. The native transport adds an explicitly advertised owner-only draft-save
method. Bounded requests/responses pin account, deployment, conversation and
workspace. Missing draft fields, invalid clocks and non-persistent temporary
conversations cannot be treated as a confirmed saved draft.

The native composer restores saved text and serializes debounced saves. Typing
continues during an in-flight save; its acknowledgement advances only the saved
snapshot and the next request carries the acknowledged clock. A failed response
retains the text and requires explicit retry. A conflicting saved draft is shown
in a bounded, focusable read-only text field with full-source keyboard selection
and copying. Keep my draft and Use saved draft capture
that revision and current local text, then ask about the replacement consequence.
A stale confirmation cannot discard a newer edit. Incoming stale reads cannot
rewind the draft; losing draft support preserves the text and stops persistence.

Conversation/history/workspace navigation now permits a confirmed saved draft.
Unconfirmed drafts retain their owner and block reassignment, while an account
runtime reconnect can recover the same conversation without silently rebinding
its text to a different account. Normal window closing waits for an active save
and attempts to flush a pending supported draft; an unconfirmed failure remains
subject to the existing consequence-specific close confirmation. The draft write
uses no metadata ETag, does not reorder history, and does not enter inference or
move Local/Host Developer data to Cloud. A draft acknowledgement also retries the
saved-history refresh if a completed turn's refresh was waiting for that save.

The current [ChatGPT release notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes),
read 2026-11-09, document saved unsubmitted messages in the March 18, 2025 web
and Windows entry. This is a historical documented feature, not evidence about
the installed macOS app's current storage. The repository's current web draft
implementation and SQL compare-and-set semantics remain the implementation
reference; no vendor private storage is used.

The packaged CLI fixture verifies exact Unicode/newline draft writes, a second
CLI process reopening the draft, another writer's conflict, reviewed replacement,
one lost response without automatic replay, same-text idempotent recovery and
explicit clearing. Its server counts exactly five state-changing draft writes.
Metadata revisions and history ordering must remain unchanged. Six native core
draft cases cover typing during save, stale/mis-scoped replies, unsupported saves,
UTF-16 bounds and conflict resolution. Four Metal cases at 320/768 pixels in both
themes exercise the actual composer/control components, keyboard requests,
unchanged repaint and disabled resolutions; the saved-text review remains bounded
and scrollable, permits full-source keyboard copy and refuses edits. The fixture's own HTTP draft-clock case separately checks that
instrument's conflict and metadata behavior.

Current verification passes: all 66 native core cases, two CLI wire-field cases,
42 app-server integration cases, 42 web draft cases, six fixture HTTP cases, the
packaged CLI chat journey and the complete Metal renderer suite. Strict native/CLI
Clippy, Rust workspace compilation/formatting, Web/Desktop/VS Code/types
TypeScript checks, generated 554-module protocol parity, egress checks and
lint/format checks pass. The signed development bundle rebuilds with current
notices. Rust still reports the existing `block` future-incompatibility warning;
this is not a public release or a complete repository-wide guard claim.

Native OS confirmation, debounce/close behavior, actual account/device continuity,
screen readers and physical IME are not established by those checks. The desktop
input tool's previously observed `noWindowsAvailable` failure remains an open
native acceptance constraint; no new real-account session or paid inference was
performed. Host Code drafts and unsaved editor-buffer recovery remain separate
unfinished work. This does not complete the overall application migration.

## Native Cloud projects

The native sidebar now opens account-owned projects in the explicitly selected
Cloud workspace. It pages through the current projects API, filters out projects
not offered on Desktop, reads current metadata/access, creates projects, edits
name/description/instructions and archives/restores owner-controlled projects.
Read-only grants remain read-only; shared editors cannot archive. Project settings
stay on the hosted record. Names, descriptions and instruction limits now come
from one shared project contract used by web validation, CLI transport and native
forms. The native form preserves exact Unicode/newlines and captures its form
identity for save/cancel actions. Unconfirmed saves retain the proposed fields and
require an explicit saved-project review before retrying. Discard asks about the
local changes it will remove; saving/closing guards wait for mutation acceptance.

The existing project GET now returns its actual server version as an ETag. PUT
accepts an optional If-Match and compares it atomically in the existing scoped
UPDATE, returning HTTP 412 with the permitted current record on a miss. Existing
unconditional callers retain their behavior. Owner/editor and owner-only field
checks remain authoritative. No applied migration changed: migration 0041 already
assigns a new shared sync version on every project INSERT/UPDATE. Native saves
require a matching returned identity/ETag and an advanced revision, with no
automatic replay after a lost reply.

Projects lead to their own conversation history and new Chat/Work conversations.
The new conversation captures the project ID and current admitted default model;
project membership is checked again through the scoped owner before creation.
Conversation create/move validation now includes the workspace predicate in both
web paths. Project-scoped list/read results cannot silently mix projects or show
a moved conversation under its old context. Existing project conversation sends
also recheck project access/surface admission before inference, and cancellation
is checked after that read. The existing Cloud execution owner loads instructions
and knowledge context from the saved conversation/project relationship; native
code does not build a parallel context engine or attach a local coding folder.

A saved draft no longer permits navigation to discard an unconfirmed send. That
request stays bound to its conversation, with Check message status and saved
history recovery available before starting elsewhere. Project lists have bounded
rows and cursor history. A boundary test caught JSON separator accounting that
could evict a row that fit; eviction now subtracts the removed separator exactly.

Current references read 2026-11-09 are [ChatGPT projects](https://help.openai.com/en/articles/10169521-projects-in-chatgpt)
and [Claude projects](https://support.claude.com/en/articles/9517075-what-are-projects).
Both document project-scoped conversations, instructions and files with plan or
workspace-dependent sharing. Claude also documents a staged beta in which a
project coordinates Cloud threads, initially for selected paid Code users. These
are documented references, not observed installed-app acceptance. This work follows
the current AGI project contracts and does not imply that beta workflow is complete.

The packaged CLI project test passes scoped paging, repeated-cursor rejection,
web-only surface refusal, oversized details, revisioned edits, stale conflicts,
archive/restore, revoked editor access, a non-advancing acknowledgement, one lost
update and one lost creation response without replay, scoped project conversations,
model admission, preset refusal and cold recovery. Its independent server ledger
requires exactly seven project mutations and one synthetic gateway request.
A project restricted to web must be rejected before that gateway. Core and Metal
cases also exercise owner-bound edit retention, mixed-scope refusal, moved
conversations, unconfirmed sends, cache bounds, exact field input, frozen keyboard
action IDs, and saving/review/read-only states. The real native window opened the
personal project list, exposed the expected three rows and hid the web-only row.
Further input failed with the desktop tool's `noWindowsAvailable` error while the
process stayed live. The run was interrupted with SIGTERM/nonzero status, preserved
its ledger and removed its isolated credential directory; native creation/edit/
discard and narrow-window acceptance are not claimed from that run.

Verification passes for 72 native core cases, 65 web project/conversation API
cases, seven shared project-client cases, 42 app-server cases, 41 CI scope cases,
the isolated packaged project journey, the existing chat/Work regression runners
and the complete Metal suite. Strict native/CLI Clippy, Rust workspace compilation,
Web/Desktop/VS Code/types/contracts typechecks, 563-module generated protocol
parity, egress, lint/format and generated-context checks pass. The ad-hoc development
bundle and its notices/signature validate. Rust's existing `block` future-
incompatibility warning remains; no live database, real account or provider
inference acceptance is implied.

The project family remains unfinished. Additional knowledge-file management
(downloads and owner reindex/removal), sharing/member controls,
duplication/export/deletion, icons/appearance, memory/account-context settings and
project default-model/tool controls still need native workflows.
New native conversations in shared projects or projects with unsupported saved
tool/special-space settings remain explicitly unavailable under current owners;
existing eligible conversations remain readable. Their complete parity journeys,
real authentication/inference and native accessibility/confirmation acceptance
remain required before a replacement release.

## Native project file browsing and previews

The visual direction remains ENERGY 1 / RHYTHM 1 / MOTION 1: the existing
project column, shared typography and neutral controls keep source review central;
focus rings identify the active keyboard action. No new palette or animation is
introduced.

The native project panel now lists hosted knowledge-file metadata and index state,
and opens supported text/table/Office extraction previews as read-only plain text.
The selected account runtime owns `cloud/project/files/list` and
`cloud/project/file/preview`; both require the loopback owner. The consented Code
host advertises neither method family. Native controls are shown only when the
account host advertises `cloudProjectFiles`.

The API owner exposes an additive `textPreviewKind` field while retaining the
existing `textPreview` boolean semantics. Native code does not infer preview
support from a filename or fetch a returned storage URL. It uses the canonical
project/file path and shared preview text budget. Each read rechecks Desktop
surface admission and project sharing access. A preview re-reads source metadata
after the text request and refuses a changed checksum. The UI checks the requested
file identity and listed checksum before accepting a result; account/workspace,
project, generation and operation fences reject stale completions.

The actual native controls retain Unicode/newlines, show when extraction is
truncated, label table previews as plain text and offer selectable read-only text
and a full displayed-preview copy action. No remote media is loaded. An empty
list and unavailable index status remain explicit. Reviewed uploads are described
below. Download save/overwrite protection, owner reindex/removal, native project
sharing, defaults, export and deletion remain pending.

Verified for this continuation: 76 native core tests, including four file-state
cases re-run after the last source-kind check; all 42 app-server tests; the account
host's scope/capability test; 923 shared Cloud-contract tests; the 101-case Web
knowledge-file suite and 20-case focused list/preview suite, including the three
new preview-kind cases; seven fixture-instrument checks; and the 41-case CI
selector suite. The actual Metal controls pass both themes at 320/768 pixels,
including an attempted edit followed by copying the actual read-only buffer.
The packaged projects runner passes with four preview extractions, no unsupported
source fetch and no mutation replay, using the bundled CLI. Invalid account and
workspace targets, duplicate/foreign file metadata, unsafe JSON byte counts,
oversized text and a source checksum changed during extraction are refused for
the expected reason.

Strict CLI/native Clippy across all targets, Rust formatting, shared Types/
Cloud-contracts/Web/VS Code typechecks, targeted ESLint/Prettier, Rust egress and
569-module protocol parity pass. The rebuilt development bundle's notices and
ad-hoc signature verify. The Darwin debug CLI test link reports a non-fatal large
unwind-section warning; the test exits successfully.

Native-window interaction is still unverified. The isolated `RN5CWh` run renders
the account page, but the AX Projects click leaves it unchanged and coordinate
input returns `noWindowsAvailable`. The native PID remained alive with an empty
log before cleanup. The fixture was stopped with SIGTERM (launcher exit 1), not
claimed as a successful native interaction/shutdown test. Its temporary config
was removed; no fixture failures or project requests were recorded. The receipt
is `project-files-ui-observation.json` under its temporary artifact directory.
Synthetic fixtures and Metal checks do not establish real authentication,
production storage access, physical IME or full screen-reader acceptance.

## Native reviewed project uploads

The next project-file workflow uses the existing checksum-bound resumable upload
service for every admitted size. `cloud/project/upload/prepare` is a loopback-owner
trust grant, distinct from opening a coding folder. The account host advertises
`cloudProjectUploads`; the workspace developer host does not. Prepare reads one
explicitly selected regular file through the descriptor authority, refusing
protected/credential paths, symbolic and hard links, special files, oversized or
unsupported sources, post-selection edits and identity changes while reading.
A single semaphore bounds prepared and active file bytes; no source path, bytes
or service session token appears in the returned review.

The native picker is followed by a consequence-specific upload prompt naming the
original workspace/project, file size/type and checksum, sharing and account
allowance implications. File bytes leave only after that review. Progress and
Stop remain available while browsing other views; requests retain their original
account/deployment and explicit workspace. A known failed transfer checks stored
part sizes and sends only missing parts from the retained snapshot. Completion
recovery reuses the same server session and verifies the returned file's project,
name, MIME type, byte count and checksum. Unknown setup responses are not replayed.

Stop and shutdown cancel active upload I/O and attempt bounded partial-upload cleanup.
Once publication starts, Stop is unavailable; an uncertain completion must be
checked or explicitly closed with its consequence warning. Native close/reconnect
and sign-out describe snapshot loss and possible completed Cloud files. Completed
uploads do not create an unnecessary unsaved-source close warning. Snapshots and
multipart credentials are process-memory only. App restart/reconnect recovery
requires refreshing the destination files and a new file selection; durable
transfer recovery is not claimed.

The visual direction remains ENERGY 1 / RHYTHM 1 / MOTION 1, using the existing
frame, neutral palette, focus controls and compact progress row. Long error
details open a native prompt rather than taking over the project view.

Workers are owned by the host's task set, so dropping an individual cleanup RPC
cannot detach upload cleanup from shutdown. Stop acknowledges a cancelling
state; the native close path waits for terminal cleanup before releasing the
snapshot. A final permission check precedes publication, so a revoked writer
still can stop and clean up its staged parts instead of receiving a false
uncertain-completion state. Panic recovery records an explicit, non-replayable
failure in an unwinding runtime.

Verified in this continuation: the initial 80-case native core run, five final
upload-state cases, four CLI file-authority/supervision cases, the account-host
scope test, all 42 app-server tests, 39 server resumable-upload cases, 20 shared
client cases, two attachment-policy cases, eight fixture-instrument cases and
41 CI selection cases. The actual upload controls pass Metal rendering at
320/768 pixels in both themes. The packaged fixture confirms exact reviewed
bytes after a local edit, a single active review, denied credentials/links/size
or wrong identities, two-part transfers, missing-part resume, lost/invalid
completion recovery, lost-setup non-replay, cancellation, read-only sharing and
revocation both before setup and after the final part. Its independent ledger
records four files, nine setups, ten part writes and four aborts with zero
inference requests. Publication is attempted six times because two lost/invalid
completion responses are recovered against the same committed sessions.

Strict CLI/native Clippy across all targets, the full Rust workspace check,
Rust formatting, Types/Cloud-contracts/Web/VS Code typechecks, targeted
ESLint/Prettier, egress, generated context indexes and 574-module protocol parity
pass. The development bundle's
notices and ad-hoc signature verify. The Darwin debug unit-test link retains its
non-fatal large unwind-section warning.

The isolated native-window attempt `h58Mn6` could not reach the picker: the
computer-use tool explicitly reported a locked Mac. Manual unlock was requested.
The fixture expired and stopped its native process with SIGTERM (launcher exit
1); it recorded zero uploads, no fixture failures and an empty native log, then
removed its isolated configuration. `upload-ui-observation.json` records this
limitation in the temporary artifact directory. Neither the OS picker/consent
journey nor native shutdown is claimed passing from that run.

Download and owner reindex implementation is described below. Source removal,
project sharing/default controls, native OS picker/confirmation, real
storage/account and release acceptance remain open.

## Native reviewed downloads and owner reindexing

Downloads use the account host's `cloud/project/download/*` family, advertised
separately by `cloudProjectDownloads`. Prepare is a loopback-owner trust grant
for one selected file path. The coding host advertises neither that grant nor
its five operation methods. No working-directory hooks or generic workspace
filesystem authority is acquired. The save picker is followed by a native prompt
that names the source, original workspace/project, destination, byte count and
checksum, and explains an existing-file replacement.

The host snapshots the selected destination's identity and revision before any
file bytes are fetched. Reads pin the original account/deployment and workspace,
recheck source access/hash before and after transport, bound headers and chunks
to the reviewed size, and verify the full response checksum. An unverified or
cancelled transfer does not create the selected file. Local publication rechecks
the parent directory, destination inode/content and staging contents. New files
use exclusive publication; replacements keep the existing inode and permissions
and retain an original copy if confirmation fails. Its local path is exposed in
the error. Saving cannot be interrupted after publication starts, and shutdown
waits for the shared host-owned worker set. The task-set owner is shared with
uploads, including cancellation-safe drainage and panic-to-status handling.

Progress remains visible while navigating. Both transfer panels use the existing
frame, typography, palette and focus controls (ENERGY 1 / RHYTHM 1 / MOTION 1),
with compact actions and error details outside the main page. Saved files are
revealed only on request. Account change/reconnect/close handles both transfer
reviews without routing the original source or target into another workspace.
The selected path and source data are not sent to the hosted metadata APIs.

Owner reindexing uses `cloud/project/file/reindex` and the independent
`cloudProjectFileReindex` capability. It rechecks owner/archive/surface and source
hash admission, observes an existing pending/indexing request instead of
redispatching it, and projects the actual index receipt. Lost responses are not
replayed automatically. The UI disables another request until refresh and hides
the control for readers and active index jobs. Native source removal remains
blocked on the canonical `WEB-PROJECT-OBJECT-LIFECYCLE-01` dependency: the existing
shared owner can miss overlapping duplicate references and can restore metadata
after a partially completed object deletion without surviving-byte proof. No new
native destructive control or metadata-only workaround is introduced.

Current verification: 86 native core cases; eight destination filesystem cases;
12 shared transport cases; three upload file-authority/panic cases; the common
worker drainage case; all 42 app-server cases; 27 existing server file/reindex
cases; nine fixture-instrument cases; and the full Metal suite. The actual file
controls verify owner/reader action admission and checksum-bound keyboard
requests. Download controls pass both themes at 320/768 pixels, including two
simultaneous transfer panels and long errors. The packaged download runner
confirms source checksums, reviewed new/replacement destinations, later edits,
appeared files, bad/short/oversized/chunked bodies, retry, cancellation, reader
access/revocation, source changes and owner reindex recovery. Its independent
ledger records 13 binary reads and two reindex writes with zero inference
requests. Existing packaged upload/project journeys remain green.

Strict CLI/native Clippy across all targets, the full Rust workspace check,
Types/Cloud-contracts/Web/VS Code typechecks, Rust formatting, targeted
ESLint/Prettier, egress, generated context indexes and 581-module protocol parity
pass. The rebuilt development bundle's notices and ad-hoc signature verify.
Existing Darwin debug-link unwind-size and `block` future-incompatibility warnings
remain; no guard or validation exception was added.

Native save-picker/overwrite/Finder, real account/storage, all supported platforms
and replacement-release acceptance remain open. Native
interaction still awaits manual Mac unlock; the earlier locked-window run is
not reused as positive evidence.

## Shared object lifecycle prerequisite for native removal

The deletion dependency now has an append-only schema candidate,
`0419_project_knowledge_object_lifecycle.sql`, and a server reconciliation driver.
It is not deployed or wired into destructive callers, and native removal remains
unavailable. `WEB-PROJECT-OBJECT-LIFECYCLE-01` remains open.

The database owns reference counts for live source rows, including inserts from
the existing project-duplication statement, logical removals, key changes and
hard cascades. Acquiring a reference atomically changes the object row, which
serializes against last-reference retirement even under repeatable-read
transactions. A retired key cannot accept a new reference or revive metadata
whose bytes may have been removed. Scope transfer is refused until an explicit
source-copy workflow exists. Existing cross-scope keys and legacy public URL
aliases cause migration preflight to fail; they must be normalized through the
configured storage owner before rollout. No guess about deployed rows is made.

The cleanup state keeps pinned storage target identities, current claim tokens,
expiring leases and individual confirmed-target receipts. New references pin the
writer's destination during registration; cleanup cannot choose an original
namespace from current deployment configuration. A lost acknowledgement
is retried against the same retired key, and confirmed targets are skipped.
Expired workers cannot record success or change the target namespace. Only all
confirmed receipts produce the deleted state; raw key and owning subject/scope
are cleared then, while an unlinked key fingerprint prevents unsafe reuse.
The trigger functions and cleanup methods are not executable by `app_rls`;
only the pure descriptor predicate needed by its file constraint is granted.
Owner reads use subject plus workspace RLS. The service policy is scoped to the
migration owner and is tested with a non-superuser, non-BYPASSRLS role.

`pnpm --filter @agiworkforce/web test:knowledge-lifecycle` creates a fresh private
Unix-socket PostgreSQL cluster. Its `finally` path stops/removes it after normal
completion or handled test failure. It uses the actual
base project migrations, actual subject/workspace helper definitions and actual
product duplication SQL. Parent/file test policies are a minimal fixture, not a
claim to re-run the entire production RLS chain. Both duplicate/delete orderings
are checked using `pg_blocking_pids`, not timing alone. The harness verifies
repeatable-read serialization, rollback of a losing copied project, tenant
isolation, direct privilege denial, scope/URL refusal, stale claims, pinned
targets, partial receipts and non-resurrection. The real server driver is tested
against that database with injected storage maps: partial private/public failure,
lost storage acknowledgement, skipped confirmed work and a lease lost during
remote work. This is not evidence of a real bucket deletion or live DB change.

Primary documentation refreshed 2026-11-09: [PostgreSQL 17 trigger behavior](https://www.postgresql.org/docs/17/trigger-definition.html),
[row security](https://www.postgresql.org/docs/17/ddl-rowsecurity.html) and
[binary digest functions](https://www.postgresql.org/docs/17/functions-binarystring.html).

The final real-PostgreSQL command, Web typecheck, targeted service ESLint,
script syntax check, Prettier, Neon up/down schema validation and generated
context checks pass. Application-role insert/removal, hard cascades and key-change
rollback are exercised; a clean rollback removes only its schema/ledger state and
keeps file data. `check:migration-dependencies` remains red as intended: migration
0419 is unapplied, and the pre-existing account-security reference to unapplied
0394 also remains. No dependency allowlist, applied checksum or guard was changed.
The test script is not covered by Web's TS ESLint file pattern; its syntax and
actual isolated execution are checked instead. No real storage call was made.

Required before migration apply and native removal: canonical legacy-key
normalization and verified legacy namespace/region adoption;
file/project/account/retention callers through durable cleanup; truthful Web and
mobile uncertain-result handling; erasure/retention inventory integration; and
full deletion/duplication/storage and native confirmation acceptance. The new
schema's rollback refuses to discard any already-retired lifecycle record.

The existing project-object storage owner now builds one immutable cleanup plan
for each operation. Remote identities bind the provider, endpoint, region,
addressing mode and bucket without storing credentials or endpoint strings in
the target descriptor. The plan captures the actual object-store client and
bucket names, so later process configuration changes cannot redirect its
requests. Every configured legacy-public bucket is included even when its CDN
URL is unavailable. Local plans pin absolute bytes/metadata roots and reject
unknown labels, changed locations and invalid keys. These plans feed the existing
direct cleanup helper. The background worker now consumes the same port through
lifecycle reconciliation; direct destructive callers still need conversion.

Six loopback HTTP tests observe the actual SDK's signed PUT/DELETE requests,
including recipient host, bucket path and signing region, and verify namespace
changes and pre-request refusals. The private PostgreSQL harness additionally
uses real temporary local files: byte removal succeeds, metadata unlink fails,
the source stays tombstoned with only the confirmed receipt, a changed working
directory is refused as another namespace, and retry completes idempotently
after the obstruction is removed. This proves the local adapter/driver path,
not a production bucket deletion or native confirmation flow. Deployed storage
versioning, backups and erasure coverage remain part of lifecycle acceptance.
Capturing a cleanup plan does not establish where an older object was originally
written. Legacy namespace and original region adoption remain required before
lifecycle cleanup is enabled for all product callers.

This adapter slice passes 93 focused tests across 12 files, the real PostgreSQL
command, Web typecheck, targeted ESLint, Prettier, script syntax, generated
agent-context checks and whitespace validation. The broader 136-test run has one
failure: account-erasure inventory correctly identifies the new lifecycle table
as unclassified until erasure is integrated. The repository mock-export guard
still reports 94 unrelated incomplete factories; all seven missing cleanup-plan
exports introduced by this adapter change were corrected. Neither check was
weakened or allowlisted, and no migration or real storage operation was applied.

Legacy reference normalization now has a bounded operational command,
`pnpm --filter @agiworkforce/web normalize:knowledge-keys report`. It reads all
nonempty references, including tombstoned sources needed for erasure, through
the configured storage owner's URI parser. Reports contain counts and an
inventory digest, without keys, URLs or subject identifiers. Unknown mappings,
oversized references, inventories above 10,000 rows and live keys spanning owning
user/workspace scopes are refused. Larger inventories require a reviewed offline
migration; this command does not claim unbounded migration throughput.

Apply requires `apply --review <digest> --target <target>`. It reuses the canonical
migration target and production-confirmation checks, checks a fresh inventory
under bounded project/source table locks, and refuses a changed review digest or
an already-installed lifecycle fence. Only equivalent storage URI values are
rewritten; source contents, checksums and tombstone state are preserved. The tool
also inherits the shared database environment-isolation policy; declaring a
migration target does not bypass it. Reports use a read-only repeatable-read
transaction. Administrative inventory sets
`row_security = off` so PostgreSQL rejects a filtered inventory rather than
silently omitting another owner's references; this setting does not bypass RLS.
No object-store request is part of normalization.

The real PostgreSQL harness executes report/apply, mismatched storage mapping,
cross-owner and cross-workspace aliases, tombstoned aliases, oversized/inventory
limits, RLS-filtered access, rollback after a missing update receipt, a concurrently
blocked writer, repeat application and lost commit acknowledgement. After a lost
acknowledgement, a fresh report observes canonical state and the old digest is
refused. The harness also exercises the command's review/target/production
argument refusals without opening a real connection. These checks use the private
fixture only; the tool has not inspected or changed deployed references.

The actual CLI is additionally spawned for report/apply/re-report through the
shared PostgreSQL data-layer adapter, with an isolated environment and its parsed
transport checked against the private Unix socket before execution. Its output
contains only the reviewed summary. PostgreSQL 17.11 runs this fixture; the current
lifecycle command, all 20 migration-CLI tests, Web typecheck, targeted service
ESLint, script syntax, formatting and regenerated context-index checks pass.
The MJS scripts are outside the repository's ESLint file pattern; their syntax
and actual execution are checked instead. `check:migration-dependencies` still
rejects the existing unapplied 0394 account-security reference and 0419 lifecycle
service. No allowlist or applied migration state changed. Account-erasure
inventory integration remains incomplete as recorded above.

Primary documentation refreshed 2026-11-09:
[PostgreSQL table-lock conflicts](https://www.postgresql.org/docs/17/explicit-locking.html),
[transaction snapshots](https://www.postgresql.org/docs/17/transaction-iso.html) and
[the administrative RLS inventory guard](https://www.postgresql.org/docs/17/ddl-rowsecurity.html).
Normalization does not settle legacy storage provenance, producer conversion,
erasure or native-removal acceptance; those remain required.

New sealed objects return an immutable write receipt from the actual captured
writer. Fresh remote seals name only the private bucket that received the bytes;
they do not authorize cleanup of a configured legacy-public bucket. Local seals
carry the exact captured bytes/metadata roots. Registration inserts that receipt
in `project_knowledge_files.storage_targets` with the file row. The database pins
it in the canonical object record within the same reference acquisition, rejects
later per-file provenance changes or conflicting cohorts, and fills the existing
duplication statement's omitted provenance from the canonical object. Client file
responses do not expose the internal descriptor.

Cleanup requires an already-pinned, nonempty namespace. An available deployment
may advertise additional buckets, but only originally pinned targets are returned
by the claim and removed. Backfilled or otherwise unverified references remain
held with `unverified` status after retirement; the first cleanup attempt cannot
adopt current configuration or expand the deletion scope. A later registration
also cannot silently promote an existing unknown cohort. Descriptor constraints
bound logical JSON bytes and require nonempty string identities.

The PostgreSQL harness verifies these cases with actual restricted-role inserts,
the existing duplication SQL and the production registration INSERT. It seals
real local fixture bytes, registers their receipt and exercises partial cleanup
and recovery from that same provenance. HTTP checks observe captured SDK write
bytes, destination and signing region across configuration changes. These are
private fixture checks, not evidence of live registration, legacy namespace
adoption, durable dispatch or native confirmation acceptance. The candidate
schema remains unapplied, and the registration service now correctly joins the
existing lifecycle service in the migration-dependency guard's refusal of 0419.

A negative control temporarily restores first-cleanup namespace adoption inside
a private fixture transaction. The real driver then reaches a deliberately
throwing removal callback, proving the instrument would catch that unsafe path
without touching bytes. Rollback restores the actual function and object state;
the same unverified reference is then held without invoking removal.

The provenance slice passes 147 targeted tests across 17 files, the real
PostgreSQL command, fresh Web typecheck, targeted ESLint, Neon up/down schema
checks, formatting and generated-context checks. Two existing upload-test mocks
now retain the real sealed-key helper through partial imports; their 30 direct,
resumable and interrupted-upload cases pass. The repository mock-export guard
remains red for 92 other incomplete factories, with no missing writer export
introduced by this change. Unapplied migration 0419, legacy namespace/region
adoption, durable deletion/erasure callers and native acceptance remain open.

Retired objects now form an outbox for the existing background-job model.
`project-knowledge-cleanup.ts` links each eligible object to one idempotent
`data-deletion.project-knowledge-object` job in the same short database
transaction. Dispatch locks and skips concurrent rows, caps its batch, and does
not perform provider I/O while holding those locks. Jobs carry the object
fingerprint plus the standard trace carrier, with null account/workspace foreign
keys so owner erasure cannot cascade the retry away. The object keeps the job
pointer after job pruning; the dispatcher does not silently restart cancelled or
exhausted work. Repair after a pruned incomplete job remains an operator/release
requirement.

New verified references capture the workspace region at reference acquisition;
copied references inherit the original cohort. `origin_known` distinguishes a
known home-region null from an unverified legacy origin. Dispatch never guesses
the current workspace pin after a move or owner deletion. The existing cron now
dispatches the home-region outbox before draining jobs. The generic drain also
passes an explicit region filter to claiming, defaulting to the canonical home
region. Other regions require an explicitly configured, qualified worker; these
fixtures do not establish deployed regional infrastructure or geography.

The worker checks its platform job, object link, current worker/lease,
cancellation and origin before effects and before each target removal. Persisted
receipts survive partial failure; a restarted job can acknowledge an already
completed object without reopening storage. Canonical legal-hold predicates
exclude held objects from dispatch and recheck organization/member/custodian
holds before each step. Unreadable hold data stops work. A hold added after
dispatch stops the job for operator review; the tests explicitly use the existing
dead-letter retry operation after release. They do not prove protection against
a hold created while an irreversible provider request is already in flight.
Hold/deletion linearization and live acceptance remain release gates.

The private PostgreSQL suite now executes real job migrations, queue admission,
outbox rollback and lost commit acknowledgement, overlapping dispatch, worker
lease recovery, partial-target retry, cancellation, pruning, original-region
filtering and owner cascades. It verifies that a normal owner-bound job cascades
while the cleanup job survives, then cleans real fixture files. Legal-hold cases
exercise narrowed resources, all three subject scopes, late holds and unreadable
tables. As elsewhere in this harness, service RLS policies and unrelated parent
columns are a minimal fixture; it does not claim the full production policy chain.

The existing database CI job now invokes the isolated suite as a blocking step;
the infrastructure test verifies that this step is unconditional. Server tools
are selected from installed server-package files, rather than assuming the
frontend `pg_config` and server share a major version. Local PostgreSQL 17.11
execution is verified; GitHub-hosted execution remains unverified. Runner setup
was checked on 2026-11-10 against the official
[Ubuntu image inventory](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md)
and [PostgreSQL installer](https://github.com/actions/runner-images/blob/main/images/ubuntu/scripts/build/install-postgresql.sh).

File/project producer conversion is described below. Account/retention producers,
unregistered-upload retirement, backup and version handling, legacy adoption,
erasure inventory and native removal are still incomplete. No deployed migration,
cloud object operation or replacement release is claimed.

Verified for this dispatch slice on 2026-11-10: the current private PostgreSQL
command, 106 queue/cancellation/hold/cron tests, 15 CI infrastructure tests, fresh
Web typecheck, targeted ESLint, CI shell syntax and existing CI/SQL-hold guards
pass. The SQL-hold guard enumerates SQL destruction, so its green result does not
replace the worker's direct storage tests. The repository mock-export guard
still reports 92 other incomplete factories, and migration dependencies still
reject unapplied 0394 and the 0419 services. No validation exemption was added.

## Transactional project and source retirement

File DELETE, project DELETE and project-sync tombstones now commit scoped
metadata retirement through the shared lifecycle. They do not remove provider
objects or restore source metadata after a storage failure. Project retirement
releases source references and detaches owner/workspace-scoped conversations in
the same transaction before acknowledging the change. Existing accessible
tombstones are idempotent; a failed transaction does not acknowledge sync work.
The background worker remains the owner of eventual byte removal. A lost HTTP
response still requires client reconciliation; this slice does not qualify the
existing web/mobile optimistic rollback behavior or enable native removal.

Hold admission uses a restricted boolean database function compiled from the
canonical legal-hold predicate. Ordinary project owners cannot read administrative
hold records. The function checks caller scope and hold status in one snapshot,
rejects foreign scopes, revokes public execution, and exposes only the boolean to
the application role. Held requests retain the existing audited refusal. The
refusal no longer promises automatic deletion after a hold is released. The
private PostgreSQL fixture verifies that an ordinary organization member cannot
read hold records, cannot probe another owner's project, can remove unheld owned
content and receives a refusal for held owned content.

New reference admission takes a parent SHARE lock and rejects deleted parents
and new sources in archived projects. Parent retirement locks existing sources
and their objects in a defined order. Its soft-delete transition requires READ
COMMITTED; other transaction isolation levels fail with SQLSTATE 40001 rather
than retiring a parent against an older reference snapshot. The production
connection default has not been qualified. The fixture observes both admission/
retirement blocking orders through PostgreSQL lock state, verifies late admission
is rejected without creating a ledger entry, and verifies repeatable-read parent
retirement fails without deleting the parent.

The migration fixture executes the actual compiled function from unapplied 0419;
it does not overwrite that function before testing it. SQL statement parsing now
optionally preserves literal bodies so the fixture can compare the executable
definition with its canonical compiler while ignoring commented decoys. Existing
normalized parser behavior is retained. A separate compile blocker was corrected
by passing the already-bound organization scope to caller checkpoint persistence.

Verified on 2026-11-10: the isolated PostgreSQL lifecycle command, 139 focused
API/service tests, 47 migration/parser/resource checks, fresh Web typecheck,
targeted ESLint, formatting, script syntax, generated-context indexes, migration
structure and the existing 16-site SQL-hold guard pass. The latter does not
enumerate provider byte-removal callbacks. Migration dependencies still reject
the existing unapplied 0394 reference and the 0419 services; no exemption was
added. The full mock-export guard still reports 92 incomplete factories and
aggregate drift (4,510 dropped exports against a ceiling of 4,324); its findings
include the existing auth mock in the project fields test. No omission of the
new project-deletion or hold exports is reported. The private PostgreSQL harness
remains a minimal service/RLS fixture, not
acceptance of the complete production migration chain. Account erasure,
retention, staging cleanup, legacy provenance adoption, backup/version handling,
in-flight hold linearization, incomplete-job repair, deployed regional workers
and native/live acceptance remain open. Migration 0419 is unapplied and the
lifecycle flaw remains OPEN.

## Project retention through the shared lifecycle

The project domain retention sweeper now retires references through the same
project owner as interactive deletion. A bounded transaction selects expired
workspace projects with `FOR UPDATE SKIP LOCKED`, releases their references and
detaches scoped conversations, then removes project records. It performs no
storage I/O under those locks. Copied projects retain their bytes until the last
reference retires. The ledger and its durable cleanup job survive parent deletion.
The sweep reports actual records removed and zero object removals; only the
background worker can acknowledge byte removal.

Project and project-file holds are checked at selection and final deletion.
File holds preserve source metadata even when its file row was already marked
removed. Such a hold does not suspend retention of an empty project. A hold
arriving after selection aborts the transaction before parent deletion. These
checks do not establish linearization with a hold created while a provider
deletion is already in flight. READ COMMITTED remains the parent-retirement
requirement; deployment isolation defaults remain unqualified.

The PostgreSQL 17
[locking-clause documentation](https://www.postgresql.org/docs/17/sql-select.html#SQL-FOR-UPDATE-SHARE)
was read on 2026-11-10. `SKIP LOCKED` here serves competing bounded sweep workers;
it is not used to claim a complete inventory. Skipped projects remain eligible
for a later run. A failed batch rolls back all its project removals and reference
changes; a lost commit acknowledgement requires a fresh sweep of authoritative
state, without restoring metadata or repeating provider deletion inline.

Verified locally on PostgreSQL 17.11: shared real-file retention across copied
projects, worker cleanup after both parents are gone, rollback after two
project deletes, lost commit acknowledgement, held tombstones and empty-project
admission, a hold inserted after selection, overlapping sweep exclusion, and a
late source admission observed blocked on the selected parent. The late source
fails without a ledger entry after the sweep commits. The complete isolated
lifecycle command passes, as do 158 focused tests across ten API/service files,
fresh Web typecheck, targeted ESLint, the existing SQL-hold guard, script syntax
and generated-context indexes. These remain local fixture results, not deployed
or full production-policy acceptance. The fresh migration-dependency check still
rejects unapplied 0394/0419 dependencies. The full mock-export guard still reports
92 incomplete factories and the same aggregate drift; it reports none in the
project-deletion, retention or hold modules touched here. No guard exception was
added.

Account-erasure and unregistered/staging cleanup callers still bypass this
lifecycle. Backup/version handling, legacy provenance adoption, erasure inventory,
in-flight hold linearization, incomplete-job repair, migration rollout, regional
worker/CI qualification, client uncertain-result handling and native acceptance
remain open. Native removal stays disabled. No schema apply, real bucket deletion
or release cutover was performed.

## Host-owned Code file recovery

The CLI now owns unsaved file buffers through the separately advertised
`workspaceFileRecovery` capability. Recovery reads and writes use the existing
approved-folder connection and file policy; the account-only connection refuses
both methods. The private, bounded store is under the CLI configuration root,
not in workspace files or account Cloud storage. Limits are owned by
`crates/agiworkforce-protocol/src/workspace_files.rs`. Windows does not advertise
this capability until its private-storage implementation is qualified.

Writes use a per-file receipt and a store epoch. Discard removes the retained
buffer and changes the epoch, fencing late requests even after the file's record
is gone. A nonblocking file lock serializes independent hosts. Updates publish
through the existing anchored file authority and synchronize before confirming;
unknown acceptance requires a read of authoritative recovery state. Recovery
failures retain the current editor text for review. The recovery path sends no
text to a provider and neither evicts another unsaved buffer nor silently replaces
corrupt storage.
The nonblocking lock behavior was checked on 2026-11-10 against the official
[Rust File documentation](https://doc.rust-lang.org/std/fs/struct.File.html#method.try_lock)
and compiled with the repository's pinned toolchain.

The native file panel debounces local recovery writes and reports their state
separately from saving the workspace file. Reopening an existing file presents
retained text for review. Restore changes only the editor buffer; changed disk
revisions remain visible and workspace saving still uses file CAS. Restore,
replacement and discard confirm consequences against the captured file, buffer
and receipt. Resolving a review rechecks the receipt even when the chosen text
matches the window's older snapshot, so a change made during the dialog cannot
be silently treated as retained. Copy and reload remain explicit. Close waits for in-flight recovery;
its confirmation distinguishes retained edits from text whose recovery is not
confirmed. The existing Code layout, source editor, theme and focus primitives
are reused; no new visual system or motion is introduced.

The isolated packaged file runner now exercises a new CLI process reading a
retained Unicode buffer, unchanged workspace bytes, externally changed file
preservation, stale-replay refusal after discard and account-only refusal. Eight
store tests cover privacy, folder/config isolation, lock contention, malformed
data, symlinks, quotas, concurrent edits and lost acknowledgement. Nine pure
recovery-state tests plus the existing three editor tests verify receipts,
conflicts, newer typing, saved-file clearing and review gating. The current
95-case native core run passes; its seven isolated runtime cases are excluded
from that ordinary run, and the two file cases pass through their packaged
runner. Eighteen file-authority boundary tests, 42 app-server dispatch/security
tests, strict Clippy, the native build and current notice checks pass. Protocol
generation/parity covers 586 modules, and
the VS Code mirror's 60 client tests and typecheck pass after adding the optional
capability. These are bounded local results, not complete platform acceptance.

The Mac became available for a bounded native check on 2026-11-10. In an isolated
fixture at 1100 by 760, native input retained Unicode edits while an independent
file read confirmed unchanged workspace bytes. The close prompt named retained
recovery, and the first native process exited cleanly. A controlled restart,
fresh folder grant and file reopen showed the original file and recovered edits
separately; scrolling reached the controls, and explicit confirmation restored
the retained text into the editor without writing the file. The fixture recorded
no inference request and no fixture assertion failure. Its final timed cleanup
used SIGTERM and exited nonzero, so that launcher is not reported as a clean
end-to-end suite pass. The inspection tool can relaunch a stopped app; fixture
process state must be checked before rebinding it. No fixture process remains.

Native discard/keep-current/copy and save-to-clear completion, full keyboard and
screen-reader journeys, both-theme narrow layouts, CRLF behavior in the native
widget and physical IME remain unqualified. Recovery discovery progress is
described below. Windows private persistence and
durable Code message drafts remain open. This slice does not resolve
`CLI-TURN-HISTORY-AUTHORITY-01` or establish account binding for developer message
drafts. The CLI wire-limit guard's shared-contract reader is corrected in
[native Code instruction settings](#native-code-instruction-settings); no
exception or duplicate limit was added. Migration and release gates remain open.

## Discovering and copying retained Code edits

The separately advertised `workspaceFileRecoveryBrowser` capability adds a
bounded metadata list and a reviewed new-file copy method. Both are refused on
the account-only connection. Lists match the currently granted recorded root
key, omit content, and count entries unavailable under current file policy
without exposing their text. The underlying store's canonical file-count limit
bounds the whole list; it cannot grow into an unbounded scan or response.

The native Files panel now offers Recovered edits. Its preview is independent
of the open editor, so removed or renamed original files do not prevent reading
retained text. Copying requires a new relative path in an existing folder and a
consequence-specific confirmation. The host checks the reviewed source receipt,
then reuses the anchored save authority's staged, exclusive hard-link publication.
An occupied destination, including one created during staging, is refused. A
copy leaves the retained record intact. Explicit discard confirms separately;
if an editor still holds that text, it remains unsaved in memory and no longer
claims retained recovery. Late writes remain fenced by the store epoch.

Copy errors carry a scoped failure receipt distinguishing a pre-publication
refusal from an unknown publication outcome. Missing or mismatched receipts and
transport failures remain unknown. The browser gives a destination inspection
action and does not replay automatically. Its final error presentation removes
RPC codes and duplicate transport wrappers; pure tests cover that presentation.

Reference checked on 2026-11-10: Zed's official
[settings reference](https://zed.dev/docs/reference/all-settings) exposes
`session.restore_unsaved_buffers`. It supplies a familiar recovery requirement,
not evidence for our file-copy semantics. No Zed application code was copied;
the implementation uses the existing host protocol, file authority and native
design primitives.

Local host tests cover metadata filtering, missing originals/parent directories,
copy retention, stale source receipts, occupied and protected destinations,
post-publication flush failure and inspection, policy-blocked records, and a
fresh grant after renaming a folder. A publication-race test verifies that a
new file appearing during staging is preserved. The packaged runner serializes
its three cases because they intentionally share one isolated configuration
root; otherwise unrelated clears could invalidate each other's epochs. It
exercises the real list/copy methods, exact BOM/CRLF/Unicode bytes, typed refusal
receipts, stale-copy refusal and account-only isolation.

At 1100 by 760 in the isolated native fixture, native input retained Unicode
text and an independent check confirmed unchanged original bytes. After an
external rename of only the synthetic original, the browser listed and previewed
the retained text. Creation cancellation left no file. Enter from the path field
opened confirmation, and confirmed creation wrote the exact retained bytes while
keeping recovery. A second writer then changed the destination; repeated creation
was refused and those bytes remained unchanged. Discard cancellation retained
the copy, confirmed discard emptied recovery storage, and the open editor still
showed its text with an explicit no-retained-copy state. The fixture was stopped
after observations; its signal exit is cleanup, not a clean suite-pass claim.
Verified on 2026-11-10: 103 native core tests pass, with eight isolated runtime
cases excluded from that ordinary run. All three packaged file cases pass
separately. Fourteen host recovery tests, seven destination-publication tests,
42 app-server dispatch/security cases, 60 VS Code client cases and its typecheck
pass. Strict Clippy, the native build and current notice checks pass. Generated
contract checks and parity cover 592 modules, and generated context indexes
match the current tree. The final typed-refusal presentation was added after the
native observations and verified through pure tests and the real packaged RPC
failure receipt; it was not re-inspected on screen. No replacement-release or
complete operability-chain result is claimed.

Recovery after complete folder removal, lifetime/reuse of the recorded
device/inode root identifier, global recovery discovery, Windows private
persistence, full keyboard/screen-reader behavior, both-theme narrow layouts,
physical IME and durable Code message drafts remain open. The tested renamed
folder case does not establish lifetime uniqueness of a filesystem identifier.
The full migration and replacement release remain unqualified.

## Native Code instruction settings

The native Code settings panel uses the separately advertised
`settingsInstructions` capability on the consented workspace connection. New
typed read/write methods bind instruction edits to the current root and either
the CLI profile or current folder. They change one instruction file per request
and return a checked file revision. Configured model, effort and permission
defaults are read-only here; their current host reload and multi-field write
behavior is not promoted into new editable controls.

Instruction paths remain owned by the context engine. The shared settings owner
now uses anchored, no-follow file access and a profile coordination lock. The
older settings writer delegates its instruction fields to that owner rather
than following arbitrary links with an independent file writer. The new private
replacement operation rechecks content after staging before publication. Native
empty saves clear contents without deleting the file; legacy empty writes still
delete as their existing contract requires. No user edit is silently merged,
discarded on conflict or replayed after unknown acceptance.

The panel retains edits across navigation, confirms scope changes that discard
local edits, and names instruction edits in the close prompt. Confirmed writes
wait before folder changes or close. Conflicts show stored and local text;
choosing to keep edits adopts a newly reviewed revision for a later explicit
save. Reload reconciles unknown acceptance against authoritative file contents.
The discovered-source action uses the actual context owner and reports budget
exclusions rather than claiming that every saved instruction will be loaded.

The current official
[Claude Code memory documentation](https://code.claude.com/docs/en/memory), read
on 2026-11-10, distinguishes user/project instructions and describes instruction
files as context rather than enforced configuration. That is a workflow
reference, not a source of paths or permission defaults for this implementation.
The existing product design, editor, focus and native confirmation primitives
are retained with no new palette or motion.

Local checks already cover scope separation, exact Unicode/CRLF writes, actual
context-engine loading, missing-versus-unreadable files, stale revisions,
lost-acknowledgement reconciliation, empty-file semantics, lock contention and
link refusal. A new staging-race check preserves external edits made while a
private replacement is prepared.

Current validation passed: 109 GPUI core tests (nine opt-in runtime cases
excluded), eight instruction host cases, 19 filesystem boundary cases, 42
developer-session dispatcher cases, four packaged file/settings runtime cases,
and 60 VS Code runtime-client cases plus its TypeScript check. The packaged
settings case checks exact profile/folder writes, actual context loading,
external-edit conflicts, unchanged configuration bytes and denial on an
account-only connection. Current CLI/GPUI checks, strict Clippy, Rust formatting,
the ad-hoc app bundle, notices, 597-module protocol regeneration/parity, generated
indexes and scoped Prettier checks also passed.

The first native UI attempt was blocked by the locked Mac. After the user
unlocked it, checks at 1100 by 760 confirmed exact Unicode folder/profile saves,
cancelled Save leaving the instruction directory absent, conflicting external
edits shown separately, Keep my edits leaving stored bytes unchanged until the
later confirmed save, and scope-switch cancellation retaining the editor text.
Confirmed scope switching loaded the separate profile file. The discovered
source list reported both actual paths and byte counts, and an independent hash
confirmed unchanged configuration bytes. A lost-focus defect after Keep my edits
was corrected by restoring the main focus handle; a second rebuilt native run
confirmed Command-S immediately opens Save after that decision. Full reader,
physical IME, narrow/theme and other keyboard paths remain unqualified.

The isolated UI helpers were stopped deliberately with SIGTERM, their synthetic
profiles were removed and their app/runtime processes were confirmed absent.
They recorded no inference request or fixture assertion failure. Their signal
exits are not reported as clean end-to-end suite passes.

The CLI wire-limit check now follows the shared project JSON contract through
the Rust loader, actual truncation calls and TypeScript schema aliases. It no
longer expects deleted private constants. Nine guard tests and all 27 wire/limit
checks pass, including mutations for changed owners, detached bindings,
comment-only bindings, invalid values and a smaller server limit. No exception
or validation bypass was added.

Windows instruction editing, editable configuration defaults, account Cloud
settings, durable unsaved settings recovery and full
keyboard/screen-reader/narrow-theme acceptance remain open. The complete
migration is still active.

## Native Code worktree management

The opt-in Code host has a Worktrees panel using the existing CLI owner and its
`managedWorktrees` capability. From the original repository it lists managed
checkouts, creates from the current local commit or the current folder's saved
committed/uncommitted files, pins/unpins, opens a checkout with a fresh folder
grant, and archives/removes an inactive checkout with a recorded Git ref and
commit receipt. Creation confirmation explains the host's keep count and possible
older-checkout cleanup, include rules and unsaved-editor limits. No setup script
runs automatically. Copied/refused files and cleanup failures remain visible.
Mutation replies are validated against the reviewed checkout and starting point;
unconfirmed results require reconnection before another mutation and are not
automatically replayed. Folder changes and window close wait for pending changes.
The host revalidates the granted folder identity before resolving its managed
worktree owner. A replaced-folder test confirms that the old grant cannot list
or create worktrees or change host records, while a fresh grant works.

The current official
[Claude Code Desktop documentation](https://code.claude.com/docs/en/desktop#run-a-session-in-its-own-worktree),
read on 2026-11-10, documents optional isolated Git worktrees for sessions. This is
a workflow reference; host paths, retention, sandboxing and approvals remain
owned by AGI Workforce. The interface reuses the native shell's typography,
controls and palette, with no new decorative treatment or motion.

Exposing the existing owner found two archive defects. Ignored files were absent
from its Git snapshot but could still be removed with the checkout; removal
errors were ignored before a recursive cleanup fallback. The owner now refuses
archival for ignored files, untracked nested repositories or indexed submodules,
rechecks before removal, and retains the host record when Git removal fails.
Automatic cleanup reports the refusal and keeps those files. Ignored contents
are not copied into Git objects as a workaround. These guards do not establish
atomic safety against arbitrary external filesystem changes during archival.

Native testing also found that a runtime opened inside a managed checkout listed
an empty, unrelated worktree namespace. It now reports only its current checkout
through the checkout's pinned Git runner and host marker. The native panel shows
that scope and offers a fresh grant for the original repository before management.
It does not read the original folder's setup script or list sibling checkouts
under the child folder grant. The packaged test confirms the current checkout is
listed and active before a coding thread claims it.

Current checks pass: 100 worktree owner tests, 115 GPUI core tests (ten opt-in
runtime cases excluded), the two isolated packaged changes/worktree cases,
the host's replaced-folder case,
strict CLI/GPUI/worktree Clippy, the ad-hoc bundle and notices, and the CLI wire
parity guard. Six core cases exercise worktree form identity, malformed lists,
unknown results, creation replies, pin acknowledgements and archive receipts.
The packaged worktree case covers carried Unicode/untracked edits, pinning,
active-session removal refusal, ignored-file retention, archived-byte recovery,
unchanged original files/index and account-only denial.

Native checks at 1100 by 760 confirmed cancellation creates no record or Git
checkout; confirmed creation, persisted pinning, cancelled removal, recorded-ref
recovery of exact Unicode edits, unchanged original files, working-tree creation
with exact carried edits, ignored-file refusal with contents retained, and
opening the checkout through explicit folder consent. A subsequent unlocked run
confirmed the checkout-only list and active-runtime label, cancellation retaining
the child runtime, and a confirmed fresh grant returning to original-repository
management. The isolated fixture helpers recorded no inference calls. Native
unpinning, both-theme/narrow/reader/IME behavior and
reconnect/close races remain unqualified.

Archive recovery through native controls, editable labels/refs/retention and
setup-script content review/run remain open. Full desktop migration and release
gates remain open.

## Reviewed native worktree apply

The separately advertised Unix `worktreeApplyReview` capability adds typed
plan/commit/receipt-read methods for the original repository root. Plans bind the
current folder identity, selected managed worktree and immutable Git snapshot.
The host retains admitted original-file grants and incoming bytes; the client
sends only the captured scope and plan identifiers when committing. The native
panel shows captured original/incoming text, binary sizes/content revisions,
executable flags for this user, and explicit kept/conflicted/blocked states.
Long text previews are shortened visibly. Native confirmation names the original
folder and create/replace/delete counts, and explains possible partial I/O
results. Existing Git staging is preserved.

The shared worktree owner supplies versioned snapshots and Git materialization.
The current official [Git cat-file documentation](https://git-scm.com/docs/git-cat-file),
read on 2026-11-10, documents materialization with path-specific filters; actual
tests verify the original folder's CRLF rules. Candidate source reads also pass
through the canonical scoped file authority and are hashed with the worktree's
Git rules to match the captured version. A reproduced source-hard-link preview
defect was closed by that source validation; aliases and credential/protected
paths are not offered as candidate contents. Git's existing whole-workspace
snapshot/cache behavior is separate from the narrower preview/write admission.

Before writes, the host checks the source version and every applicable
destination. It then uses existing anchored publication, with per-file guarded
replacement, exclusive new-file creation and reviewed removal. Read-only/link/
identity/content/mode conflicts detected before writes are refused. New parent folders
are created only at commit. Current permissions are reopened before reviewed
writes, including a tested macOS ACL revocation. In-place replacements preserve
the existing inode; executable changes affect the user's execute bit. Unconfirmed
publication/removal retains available original copies and reports recovery
paths. Later namespace changes during flush cannot be reported as confirmed
publication. Arbitrary external changes are not a whole-folder atomic transaction.

Commit workers retain owned lifecycle/workspace guards until actual I/O and
receipt recording finish. A cancellation test blocks the worker before writes,
aborts its caller, proves lifecycle admission is still held, and verifies that
shutdown returns after the actual write and receipt. A completed commit's same
scope/plan returns its recorded outcome without rewriting later edits. Results
page by serialized response size, with source/scope/count/cursor/membership checks
on the client. A read-only Check apply receipt action can reconcile a lost reply
without sending the mutation again. It cannot clear an unrelated unknown
worktree operation. The developer frame budget now has one JSON owner consumed
by the TypeScript contract and Rust plan/receipt checks; the native build tracks
that owner explicitly.

Global CLI `[worktree_apply]` policy bounds file count, individual/captured bytes
and text previews. A project config cannot raise those budgets. Invalid limits,
oversized responses and unstable source captures fail explicitly. These plan
budgets do not qualify whole-repository Git object-storage usage or all external
filesystem races. The old unversioned preview/apply RPC remains separate; it is
not used as evidence of the reviewed native flow's acceptance.

Native checks at 1100 by 760 in the dark system theme confirmed side-by-side
Unicode/CRLF text previews, binary size/revision metadata, cancellation preserving
all original files, and a changed destination producing an explicit no-files-
applied refusal. A fresh review followed by confirmation created exact binary
bytes, replaced exact Unicode/CRLF bytes, performed the intended deletion and
left Git staging unchanged. The result rows and Copy receipt action were
observed. The fixture recorded no inference request/assertion failure; its
deliberate SIGTERM cleanup is not a clean suite-exit claim. Its synthetic profile,
repository and owned processes were removed/confirmed absent.

Current validation passed: 122 GPUI core cases (eleven opt-in runtime cases
excluded), 102 shared worktree owner cases, eight focused apply host/config/
cancellation cases, 35 file-authority cases including actual macOS ACL denial,
42 dispatcher cases, and three isolated packaged changes/worktree cases. The
packaged reviewed-apply case covers source/destination staleness, exact
Unicode/binary/nested creations/deletion, preserved staging, live receipt replay
and readback without rewriting later edits, refusal after restart, the child
folder boundary and account-only denial. Contract checks passed 371 local-runtime
cases, 60 VS Code runtime-client cases and both package typechecks. Current
Clippy, bundle/notices, 609-module binding regeneration/parity, the 27 CLI wire
checks, configuration-key guard and existing Rust egress guard also pass; the
egress guard still records 22 pre-existing transports awaiting migration.

Native lost-reply reconciliation, receipt payload pasting, short-preview
cases, failure/recovery presentation, both-theme/narrow/full keyboard/reader/IME
journeys and termination races remain unqualified. Plans and the last receipt
remain runtime-bound: restart never replays an apply. Durable recovery/receipt
discovery, native recovery-copy restoration, per-file apply selection and
incremental apply baselines across later source revisions remain open. This does
not qualify the full desktop migration or a replacement release.

## Native Cloud saved-file continuity

Reference refreshed on 2026-11-10: Claude documents files attached to individual
chats and persistent project Files separately in
[Upload files to Claude](https://support.claude.com/en/articles/8241126-upload-files-to-claude).
[Create and edit files with Claude](https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude)
explicitly documents Web/Desktop/Mobile availability. These are documented workflow
references, not observed competitor UI or authority for our limits, permissions or
routing. This slice follows the repository's existing Web message/file contracts.

Native Cloud could previously browse a conversation with uploads but omitted their
names and refused every continuation containing saved attachment metadata. History
now projects validated durable attachment descriptors, including Unicode names,
types and optional size/MIME metadata. Read-only transcript labels do not pretend
to open or download the files. Invalid or unsupported saved descriptors remain
visible as an incomplete-files warning, and prevent a send from the loaded page.
The runtime independently reads and validates the complete history before sending;
malformed metadata cannot silently become text-only context when it is outside the
currently loaded native page.

The Cloud request uses the existing Web multipart content shape: a text part and
asset-ID file parts for historical user messages. Metadata URLs and inline bytes
are never forwarded or fetched by native history. Missing older display fields
remain optional. The existing gateway hydration owner checks both account and
workspace before reading stored bytes, and retains its historical removed-file,
format and provider-route handling. No Local/Code context is added to Cloud.

History pagination now reuses the scoped reader's conversation/workspace checks;
serialized message bytes, including escaping and file parts, count against the
existing context budget. History-preflight failures explicitly mark the turn
rejected before any gateway dispatch, preserving the draft without an unknown-send
state. Shared chat size/count/type/extension/filename limits now live in
`packages/contracts/cloud-contracts/src/chat-attachment-policy.json`; TypeScript
and Rust consume that owner rather than Rust parsing TypeScript source text.
Rust protocol output includes the new history descriptors in both generated trees.

Verification passed: 26 CLI attachment/history owner tests; 122 GPUI core tests
(11 opt-in cases excluded); 923 shared Cloud contract tests; 39 Web persisted-file
and hydration tests; nine native fixture server cases; the isolated packaged
create/send/continue/stop case; strict CLI/GPUI Clippy; Cloud contract, Web, local
runtime and VS Code typechecks; 611 generated protocol modules and parity checks;
CLI wire parity; scoped ESLint and formatting. The packaged case proves exact
historical file-part IDs survive into the follow-up request, while malformed
references, control-character context escaping past the serialized budget and a
mismatched workspace produce explicit preflight rejection with no extra gateway
request. It also retains the previous model, replay, drafts and metadata checks.

At 1100 by 760 in the dark Mac development window, the saved Unicode PDF filename,
size and MIME label were visible after scrolling, and a typed continuation
completed with a persisted synthetic reply and a cleared composer. The separate
loopback fixture recorded exactly one accepted request and no failures. That
fixture validates the full historical request content against its stored rows;
the packaged fixture separately checks the exact known asset-ID wire shape.
The fixture helper and native process were stopped and their private profile
removed. The launcher exits one for deliberate SIGTERM cleanup, so this is an
observed native interaction and clean fixture ledger, not a clean launcher-suite
exit. No real authentication, private upload, provider inference or Cloud mutation
was performed.

This is existing uploaded-file continuity, not new native chat uploads, inline image/PDF previews,
transcript downloads, generated-file rendering, a durable upload cancellation or
cleanup claim, or a release cutover. Saved lists above the shared attachment-count
limit and invalid legacy descriptors still need Web repair before native sends.
Real authentication, changing account membership, actual provider inference,
reader/IME and full cross-platform acceptance remain open.

## Reviewed native chat uploads

Implementation and packaged runtime verification are in place; native OS
acceptance remains pending. This extends the saved-file continuity slice above using the same official workflow references refreshed on 2026-11-10. It does
not change the public Desktop release route.

The account host now exposes capability-gated `cloud/upload/*` preparation,
start, read, cancel and release methods with Rust-owned, generated target/review/
receipt types. Chat destinations capture the account scope, workspace and existing
conversation; project destinations preserve the old project transport through
adapters. Both use one account upload engine, one retained snapshot slot, and the
same bounded multipart transport, progress validation, cancellation and completion
recovery owner. The coding host keeps the new capability disabled. The native
account connection's strict whitelist recognizes it without admitting coding
workspace capabilities.

Preparing a file checks its Cloud destination and reads a selected-file snapshot
through the anchored authority, with credential/protected-path, link, stability,
size, filename and type checks. Preparation creates no multipart session. The Mac
picker opens a native review showing destination, filename, media type, byte count
and SHA-256 before file bytes leave the device. The reviewed snapshot, rather than
a later read of the path, supplies the upload. API and same-origin relay requests
use one trusted device-surface handshake header, with workspace identity preserved
through credential renewal.

The composer can retain several completed attachment references under the shared
count and total-byte limits. A completed upload is checked against its review,
released locally through an idempotent receipt, then attached without sending a
message. A later explicit Send carries asset-ID parts and durable metadata; the
existing gateway owns file authorization, extraction and provider adaptation.
File-only messages and historical follow-ups use that same path. Acceptance clears
only the attachments actually sent. Upload errors do not fall back to sending
file text or create a second upload automatically. Unknown completion is checked
against the original multipart session, while unknown creation cannot be replayed.

Native progress has status/retry/stop/release controls. Closing a retained review
or reconnecting confirms the discarded selection and explains that an existing
Cloud copy is not deleted. Unsent attachment references are window state, not part
of the saved text draft; the composer says so, and account/workspace/conversation
navigation and window closing retain their guards. Removing a reference from the
message does not delete the uploaded Cloud file. Inline previews, library selection,
batch picking, durable attachment-draft recovery, reader/IME qualification and
real-account/provider acceptance remain open.

Verification passed: 125 GPUI core cases (12 opt-in cases excluded), 42 app-server
transport/dispatch cases, account-host capability and upload-worker checks, the
single-surface-header check, 923 shared Cloud contract cases, nine fixture server
cases, the existing packaged Cloud chat case and both packaged upload cases.
Strict CLI/GPUI/app-server Clippy and Cloud contract, Web, local-runtime and VS Code
typechecks passed. Both generated protocol trees contain 619 modules, with matching
parity and CLI wire guards. The Rust egress guard passes with its 22 pre-existing
transport migrations still open. Bundle and third-party notices checks passed.

The packaged upload runner independently checks the reviewed multipart payload's
SHA-256, stored part counts, completion replay without new parts or files,
unknown-creation non-replay, cancellation, protected/unsupported/oversized inputs,
account/workspace refusal and archival before publication. It sends a new uploaded
reference, retains it in a follow-up, and persists a file-only message carrying two
references. An uncapped dedicated gateway counter and accepted-request IDs verify
that only the three explicit chat sends reached the loopback gateway. The prior
project upload counts and recovery assertions still pass after engine unification.

Native picker, review-dialog, queued-file controls, focus, cancellation and close
acceptance remain pending because the Mac was locked on both observation attempts.
An unlock request remains pending. The two isolated native helpers were stopped
(one before rebuilding, the other at its bounded deadline); both profiles were
removed, with zero fixture failures or accepted gateway requests. Their deliberate
SIGTERM exits are not passing launcher-suite results. No new native interaction,
real account login, private upload, provider inference or production mutation is
claimed for this slice.

## Device recovery of unsent attachment references

Completed chat uploads now retain account-, API-deployment-, auth-deployment-,
workspace- and conversation-bound references in private device storage. The store
contains asset IDs and display metadata, never selected-file bytes, local source
paths or multipart tokens. The stable account key survives native process restarts
without using a login-session ID. Coding tools and selected-file uploads refuse
its reserved namespace, including when it is the granted root. Private anchored
writes, directory flushes, an exclusive lock, format validation, a store epoch and
per-selection revisions protect concurrent readers and writers. Limits come from
`attachment-recovery-contract.json` and the shared attachment policy.

The native recovery browser lists the signed-in account's selections across
workspaces. Each conversation is checked through its current scoped Cloud reader;
unavailable targets expose no cached titles or filenames, but their local
selection can still be explicitly discarded. Restore and discard ask for native
confirmation. A stale restore/discard cannot overwrite a newer selection. Removing
an attached reference updates the retained selection before clearing it locally.
Confirmed retained selections can be left and reopened; unsaved or unconfirmed
ones keep the navigation/close guards. The native text draft and device attachment
recovery remain separate owners and the composer explains that distinction.

The host records a pending send before gateway dispatch. Confirmed acceptance
consumes only the references that were sent, preserving later uploads; known
refusal retains them. Interrupted acceptance stays marked unconfirmed across a
restart and requires explicit history review before restoration. Recovery reads
and restoration never submit a model request. Known Temporary Chats skip retention
and observed Temporary Chat conversions purge the corresponding local selection.
Missing temporary-state support disables retention. Cross-device privacy changes
are observed when that conversation is checked, not while the device is offline.
The private storage implementation is Unix-only; other platforms retain the
explicit nondurable behavior until their storage authority is qualified.

Verification: seven real-filesystem store/identity checks and four native state
checks pass. The packaged recovery case passes across three runtime processes,
including a lost acceptance reply, no automatic replay, stale discard refusal,
current-permission refusal/redacted listing, explicit local discard and Temporary
Chat conversion. The existing packaged chat/project upload suite also passes with
this store in the completion path. All 628 protocol modules were regenerated.

The final unlocked Mac check at 1100 by 760 observed the picker, exact Unicode
filename/34-byte count/SHA-256 review, cancellation without creating an upload,
confirmed upload, the retained-selection browser and an accepted file-only message
with persisted attachment labels and a cleared selection. Independent loopback
checks prove the reviewed bytes were uploaded after the synthetic original was
changed, one upload and one explicit gateway call occurred, recovery was consumed,
and the fixture had no failures. Its deliberate SIGTERM cleanup is not a clean
launcher-suite result. Native restart/restore/discard dialogs, narrow/light,
reader/IME and complete lifecycle acceptance remain open. No real account,
private upload, provider inference, production migration or release cutover was
performed.

In-flight multipart session/byte recovery, offline privacy-change propagation,
shared attachment drafts and full release acceptance remain open. The user ended
the autonomous migration goal and requested this implementation be committed and
pushed; the broader migration is not claimed complete.

## Native Code session search

The Code sidebar searches the open folder's sessions through the CLI's existing
`thread/search` owner. Titles and transcripts match case-insensitively; archived
sessions and other folders are excluded by the host, not the client. Results
replace the folder list until the query is cleared, and a newer search or a folder
change discards a slower response. Account-only connections refuse the request.

`test:gpui:search` runs the packaged CLI with an isolated home and verifies title
matches, folder isolation, empty results, blank-query refusal and account refusal.
Native-window input and screen-reader use of the field are not yet verified.

## Commit boundary validation

The PostgreSQL lifecycle harness uses the data-layer package's server-only
`testing` entry point. Its driver construction stays in the Postgres adapter;
connections are restricted to Unix sockets inside temporary fixture directories,
with no TCP or remote database entry. The maintenance normalizer lives under
`scripts/lib`, reached by the declared maintenance command rather than classified
as a shipping server module. The real PostgreSQL lifecycle suite, data-layer
boundary/runtime checks, typecheck and 243 data-layer cases pass (32 existing
opt-in cases excluded).

The commit-boundary cleanup also updates attachment coverage to read the shared
JSON policy, preserves real exports in 33 affected test mocks, and makes project
ownership predicates explicit in deletion SQL. Lifecycle metadata distinguishes
irreversible retirement from restore, and the unattended-work guard recognizes
only declared, lease-fenced deletion dispatchers. Negative cases retain the
account and membership requirements for automation. The legal-hold ownership
read includes retired projects so holds cannot disappear during cleanup.

Migration 0419 remains unapplied. Its exact consumer exceptions follow the
existing coordinated source-publication policy: production deployment still
unconditionally verifies the migration ledger before building, and rejects
pending migrations. Native removal remains disabled pending lifecycle acceptance.
No production schema change or release cutover is included in this push.

The lifecycle migration was renumbered from 0398 to 0419 when this branch merged
main, whose append-only chain already held 0398 through 0418. Its project hold
function is regenerated from the canonical predicate, which now delegates to
the `legal_hold_preserves` definer function from 0416. Held project and source
removal is refused rather than deferred. Main's deleted-project-files purge
still removes expired rows, but leaves any object the reference ledger tracks to
the lifecycle worker; it deletes bytes itself only for rows retired before the
ledger existed, which the migration's live-row backfill does not register.

## Remaining migration gates

Native release acceptance remains incomplete. Accessibility qualification is
tracked by the GPUI flaw ID below. Pixel checks do not establish screen-reader
or physical IME acceptance. No inference or
account login has been performed by the isolated runtime acceptance tests.

The initial repo-wide operability run stopped at unclassified non-Markdown
artifacts under `audit/flows` and `audit/live-check`; the product-name guard also
reported branding mismatches in existing manifests. These broader checks are not
claimed fixed by native migration. The expanded retained-Tauri trust runner was
stopped under high machine load in the first slice and is not a passing result.
License/source/banned-package policy passes without adding exceptions. The
compatible Markdown parser patch was updated to 0.13.6 through Cargo. The
vulnerability gate now passes after the calamine and actual SQLCipher engine
updates above. The full maintenance scan remains open under
`RUST-DEPENDENCY-ADVISORIES-01` for unmaintained packages and a yanked version.

- Resolve `DESKTOP-GPUI-ACCESSIBILITY-01` and complete the native workflow
  acceptance below before claiming a replacement release.
- Verify the native folder consent, cancellation, nonempty session browsing, missing-runtime,
  runtime-failure, keyboard, and shutdown workflows against a real CLI binary.
- Complete native accessibility and screen-reader support before a public release.
  A compiling framework and keyboard handlers do not establish accessibility.
- Verify the implemented native conversation/composer path end to end: real model
  admission and sends, IME, multi-turn persistence, stop, approval allow/deny/cancel,
  failures, reconnect races, draft conflict/close behavior, and existing-session
  recovery. Cloud draft persistence is implemented above; Host Code message
  drafts remain volatile. File recovery still needs complete-folder removal and
  root-identifier lifecycle handling plus full native lifecycle qualification.
- Complete lifecycle acceptance including Dock/system quit, window closing during
  work, background recovery, and disconnected-runtime shutdown. The native close
  controls confirm consequences and interrupt connected work before closing; this
  does not establish every OS termination path.
- Complete Consumer Cloud conversation/project continuity through current Cloud contracts,
  preserving the Consumer Cloud and Host Developer boundaries. Resolve the registered
  `CLI-TURN-HISTORY-AUTHORITY-01` design before claiming Managed Code account-switch
  or retained-history sync acceptance; account bootstrap does not close that issue.
- Verify native workspace selection and workspace-bound creation, inference,
  approval/resume and recovered Work against real authentication, membership
  changes and the OS interface. Isolated runtime and Metal fixtures do not
  establish those live gates.
- Complete remaining native narrow scrolling and drag-resize acceptance for the
  implemented frame. Complete native acceptance for saved conversation model
  choice and implement account-wide new-chat defaults through their settings owner.
- Migrate settings, provider selection where admitted, file and
  artifact rendering, voice, capture, desktop tools, notifications, deep links,
  tray, credential storage, browser bridges, and remote-control workflows.
- Implement AGI Code editing, diffs, terminal and worktree flows through existing
  owners; review the license of every additional dependency separately.
- Verify Windows and Linux builds and behavior. Only the local macOS build has
  been attempted in the initial slice; no cross-platform result is implied.
- Add native CI, packaging, signing, notarization, updates, crash handling, resource
  measurements, release notices, and a tested rollout/recovery procedure.
- Switch release routing only after parity and trust-boundary acceptance, then
  remove displaced code and update architecture inventories and guards together.
