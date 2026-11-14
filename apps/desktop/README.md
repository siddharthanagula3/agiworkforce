# apps/desktop

Status: Current
Owner: Desktop surface maintainers
Last updated: 2026-11-11

Two desktop applications build from this directory, and they show different
renderers. Electron is the public Desktop; Tauri is retained internal code, not
a second public product. The repository-wide map is in `ARCHITECTURE.md`; the rules that govern changing any
of it are in `AGENTS.md`.

## Existing shells and the migration host

| Shell    | Host process       | Renderer it shows     |
| -------- | ------------------ | --------------------- |
| Tauri    | `src-tauri` (Rust) | the Vite app in `src` |
| Electron | `electron` (Node)  | the hosted web app    |

An opt-in native migration host lives in `gpui`. It is a Rust/GPUI application,
not a webview, and uses the shared CLI app-server protocol. Its first workflow
opens a folder with explicit runtime consent, lists its existing coding sessions,
and reads a selected transcript. It does not yet replace either existing host or
provide the rest of the desktop product. Native pixel comparisons, folder consent,
file editing and terminal journeys have local macOS evidence. Full accessibility
acceptance remains open under `DESKTOP-GPUI-ACCESSIBILITY-01` in the known-flaws register. The migration queue is owned by
[`audit/plan/desktop-gpui-migration.md`](../../audit/plan/desktop-gpui-migration.md).

The Electron window shows the deployed web application, which is why a change to
`src` is invisible there, and why a capability written as a Tauri command is not
reachable from it.

## Commands

| Task                      | Command                                                  |
| ------------------------- | -------------------------------------------------------- |
| Tauri dev                 | `pnpm --filter @agiworkforce/desktop dev`                |
| Renderer only             | `pnpm --filter @agiworkforce/desktop dev:vite`           |
| Tauri release build       | `pnpm --filter @agiworkforce/desktop build`              |
| Tauri unsigned build      | `pnpm --filter @agiworkforce/desktop build:local`        |
| Electron dev shell        | `pnpm --filter @agiworkforce/desktop dev:electron`       |
| Electron installer        | `pnpm --filter @agiworkforce/desktop dist:electron`      |
| GPUI development host     | `pnpm --filter @agiworkforce/desktop dev:gpui`           |
| GPUI build                | `pnpm --filter @agiworkforce/desktop build:gpui`         |
| GPUI compile check        | `pnpm --filter @agiworkforce/desktop check:gpui`         |
| GPUI runtime tests        | `pnpm --filter @agiworkforce/desktop test:gpui`          |
| GPUI license notices      | `pnpm --filter @agiworkforce/desktop notices:gpui`       |
| Unit tests                | `pnpm --filter @agiworkforce/desktop test`               |
| Typecheck (renderer)      | `pnpm --filter @agiworkforce/desktop typecheck`          |
| Typecheck (Electron main) | `pnpm --filter @agiworkforce/desktop typecheck:electron` |
| Rust tests                | `cargo test -p agiworkforce-desktop --lib`               |
| WebdriverIO end to end    | `pnpm --filter @agiworkforce/desktop test:e2e`           |

`docs/agent-context/commands.json` is the machine-readable inventory; read it
rather than guessing a filter.

## The seam each shell enforces

**GPUI migration host.** At launch, the native app starts an account-only CLI
connection for account status and device sign-in. That connection has no coding
workspace and rejects Code thread, model-discovery, turn and tool requests. It does not
load project configuration or grant access to a folder.

A separate `gpui/src/runtime.rs` connection starts the bundled CLI (or an explicit
development override) only after a coding folder is chosen and native consent is
accepted. Consent is process-scoped, timestamped, and checked by the CLI before
project configuration loads; sandboxing and tool approvals remain enforced.
Both connections use the shared bounded JSONL client and canonical protocol.
The native conversation controls discover runtime models, create sessions, submit
messages in Ask mode, stop work and review allow-once/deny approvals. The Account
panel shares the CLI's credential owner and confirms sign-out's scope. Account
reconnection and coding-folder reconnection have independent lifetimes.

Code's Changes view reads the host's per-turn Git checkpoints. It reviews files
and individual unified-diff sections, stages selected changes and offers
conflict-aware reverts after native consequence confirmation. Each operation
previews through the same host before applying; a later conflicting edit stays
in place. Snapshots include command/tool changes and list files omitted from the
checkpoint. They remain historical after staging or reverting. Files opens a
paged browser and an editor for existing UTF-8 files in the consented folder.
Explicit Save file (Cmd/Ctrl+S) checks the opened revision through the host's
inode-preserving file authority. Conflicts keep the unsaved text, and reload or
close asks before discarding it. The account-only connection has no file access;
opening a file does not attach it to model context. Protected, linked, binary and
oversized files are refused by the host. File creation/rename/delete, automatic
save, durable editor drafts and the complete Git/worktree interface remain in development.

On Unix, Terminal opens up to four reviewed interactive shells through the coding
host. Launch review shows the actual shell, folder, sandbox and network policy.
The default contained profile keeps network access denied. The native view
renders the host's terminal screen, including ANSI styles, wide Unicode,
scrollback and application-cursor/bracketed-paste modes. Native text composition
commits to the selected terminal; multi-line paste has a complete review and
consequence confirmation. Input queues and screen sizes are bounded. Manual
terminal input is separate from agent tool input/history and is not attached to a
conversation. Closing a terminal or the native window confirms the consequence
and waits for session-owned job cleanup. Windows ConPTY, mouse reporting, richer
selection/search, terminal recovery after a host restart and live OS interaction
acceptance remain unfinished.

The Cloud history view searches and pages account conversations and their text
through the shared Cloud API client. Reads are account/session/deployment scoped
and do not import conversations into Code. Native history supports rename,
pin/unpin, archive/restore and archived-history browsing. Conditional updates use
the displayed conversation revision; stale or unconfirmed changes retain the
proposed title for review. Archived conversations stay readable and can be
restored before continuing a draft. The searchable workspace picker loads verified
personal and organization memberships from the web workspace owner. Same-named
teams show their slugs. Creation, history, sends, plan decisions, approvals and
recovered runs pin the chosen workspace, including explicit personal scope;
another client's active selection cannot redirect them. An unconfirmed switch
requires Reload workspaces, and revoked membership never defaults to another
workspace. Switching waits for current work and unsent drafts to be resolved.
Conversations open at the latest
message window; older pages prepend in order, with a Latest messages action to
return to the end. Streaming follows the bottom while the reader stays there,
and older-message browsing does not jump to new output. Native Cloud text conversations can
create/send/stream through the managed gateway and stop upstream runs.
Cloud model choice reads the web catalogue through the account-only runtime,
with a compact searchable menu, virtualized rows, Refresh and plan/unavailability
guidance. A selection applies
to the next message in that conversation; the host rechecks catalogue admission
before sending. Rejected choices retain the draft, and reviewed Work execution
keeps its frozen model. No provider key or Local session is moved into Cloud.
Attached durable runs replay paginated events, present complete pending actions for
approve-once/deny review and resume paused work. The host rechecks the current
account, run and exact reviewed actions before submitting a decision. Work
discovery now includes a scoped native list, status filters, pagination and
reopening saved runs after a process restart. Runs without a linked conversation
remain readable and controllable through their owned run identity. Leaving a
recovered view detaches its watch without cancelling the run; an attached inline
continuation must finish or be stopped first. New Work accepts a text goal and
requests a plan through the existing gateway. Saved plans offer explicit Run plan
and Dismiss review decisions; execution remains subject to tool permissions.
Plan decisions use the message metadata PATCH contract and require the matching
Web server update. Connector input forms, projects, rich context and durable
draft recovery remain in development.
Native browser authorization, OS credential access and inference/permission
acceptance remain unverified. The app opens no network listener. Child-process
environment protections come from `@agiworkforce/local-runtime-contract` for both
Electron and GPUI. An interrupted or desynchronised pipe requires reconnection.

Saved and streaming assistant text in Cloud and Code uses the same native
Markdown renderer: headings, lists, tables, inline/fenced code, selection and
code-copy controls. Heading sizes and code surfaces come from the canonical
design tokens. Document images remain labelled text pending an admitted
attachment source; raw HTML is shown literally. Only absolute credential-free
HTTP(S) links can open the browser. Math, citation metadata, attachments and
artifact rendering still need native implementation.

Building requires Node 24 (for the canonical TypeScript contract bridge), the
workspace's pinned Rust toolchain (currently 1.99.1),
and the platform GPUI dependencies. On macOS, Xcode must include the Metal
toolchain (`xcodebuild -downloadComponent MetalToolchain`). Product labels and
theme values are generated into Cargo's output directory from existing contract
and design-token owners; no generated copy is committed. The binary's `--licenses`
option prints its bundled third-party notices. Regenerate and check those notices
when dependencies change; notices are not a substitute for `cargo deny`.
The syntax highlighter also emits its embedded syntax definitions' original
acknowledgements through `--licenses`; the development bundle includes that
complete output in `Resources/THIRD_PARTY_NOTICES.txt`.
On macOS, `dev:gpui` creates an ad-hoc-signed development bundle containing both
the GPUI executable and the CLI runtime. Close the native app before rebuilding.
This development signature is not release signing or notarization.
Use `dev:gpui -- --window-size 320x640` for a repeatable narrow window.
The native argument accepts positive 16-bit pixel dimensions; GPUI clamps the
initial bounds to the visible display.
The signed bundle includes `Resources/native-runtime.json`, generated from Cargo's
default CLI executable and version. Normal app launch discovers that executable
inside the bundle without a `--runtime` argument; invalid paths and escaping
symlinks fail closed.
The native frame reads `agiChatFrameGeometry` from the shared design-token owner.
The transcript scrolls separately from the header and composer. Below the shared
compact breakpoint, Menu opens full-width navigation and removes the background
content from keyboard focus until navigation closes.
The GPUI snapshot and toolkit are pinned together in `gpui/Cargo.toml`.
`test:gpui:render` runs an off-screen GPU regression in both themes, including
state changes, unchanged redraws, multi-line Unicode text-area updates, Markdown
source selection, code copying and the document media policy. It does not establish native-window or
screen-reader acceptance. The UI lives in `gpui/src/ui`; `gpui/src/main.rs` is
the executable argument/notice entry point.

`dev:gpui:render-probe` opens a small native window with two static headings,
a counter, focusable controls and a local appearance toggle. Save renderer image
captures the current scene without changing its content. It has no account or
runtime connection. Use raw CUA capture bytes for native pixel acceptance:
`getScreenshot({ emit: false })` returns the complete encoded image. Inline image
representations can omit unchanged regions and must not be treated as blank
application pixels. Check the bytes; do not infer the format from the filename.

`test:gpui:capture` checks the pixel-verifier rejection cases. The real capture case
is opt-in. Set `AGI_GPUI_NATIVE_CAPTURE` to the raw native image and
`AGI_GPUI_RENDERER_CAPTURE` to the matching probe renderer image, then run
`cargo test -p agiworkforce-desktop-gpui --features native-test --test native_capture -- --include-ignored --nocapture`
from the repository root. It locates both static text bands in the renderer
reference and requires at least 90% matching ink in the native capture, allowing
JPEG edge variation and native title-bar height. Blank references, blank captures
and shifted text are explicitly rejected. This is a presentation check, not a
screen-reader or physical IME test.

The real-CLI acceptance test is opt-in because it starts an executable and needs
an isolated configuration directory. Set `AGI_GPUI_TEST_RUNTIME` to the absolute
CLI executable path and `AGIWORKFORCE_HOME` to a disposable config directory,
then run `cargo test -p agiworkforce-desktop-gpui --no-default-features --test runtime -- --ignored`
from the repository root. It starts no inference and checks folder-local listing
and shutdown against the actual CLI.

**Tauri.** `src` reaches `src-tauri` only through registered Tauri commands.
`check-wiring.sh` fails both directions of drift: a command the Rust side
registers and nothing calls, and a call with no registration. `wiring-allowlist.json`
records the reviewed exceptions. `pnpm check:tauri-wiring` runs it, and it is
part of the guard chain.

**Electron.** `electron/preload.ts` exposes exactly one object on the window,
`agiHost`, whose contract is `src/lib/tauri-electron/bridgeContract.ts`.
Privileged work is dispatched by `electron/runtime/dispatcher.ts`, which refuses
any call whose capability has not been granted in
`electron/runtime/permissionManager.ts`, and every filesystem path is contained
by `electron/runtime/pathGuard.ts`. Local coding sessions are served by
`electron/runtime/developerSessionService.ts`, remote control by
`electron/remote`, and computer use by `electron/runtime/computerUseService.ts`.

Egress from the renderer funnels through `src/lib/egressGuard.ts`, and Rust
transports use the host-owned egress policy. `pnpm check:rust-egress-boundary`
enforces the second half.

## Two operational facts that cost time

`electron/dist/main.cjs` is one build artifact shared by the whole working tree,
not one per running shell. A running shell keeps the code it loaded, so a rebuild
looks harmless until the next restart of somebody else's shell runs it. When two
people work on the desktop at once, only the one driving rebuilds.

A capability grant the Electron shell has not been given does not fail loudly: a
dispatcher call waits on the native consent sheet instead. When a local coding
session never starts, check the grant store before suspecting the code.

## Release

`docs/runbooks/desktop-electron-macos-release.md`
is the signing and notarisation procedure for the public Electron app, including a
release built on a Mac, and `docs/runbooks/desktop-macos-release.md` is the one for
the retained Tauri app. The release workflows themselves are
`.github/workflows/release-desktop.yml`,
`.github/workflows/release-desktop-cloud.yml` and
`.github/workflows/build-windows-release.yml`.

The isolated Cloud history transport check uses a built development bundle and a
loopback HTTP fixture: `pnpm --filter @agiworkforce/desktop test:gpui:cloud`.
It uses no real account or inference and asserts that a wrong scope is rejected
before the history API is called. The fixture also checks a 123-message history,
older-page ordering, a concurrent append, missing/unstable counts and an empty
conversation. Live authentication and native interaction
remain separate acceptance checks.

`pnpm --filter @agiworkforce/desktop test:gpui:changes` runs the packaged CLI
against a disposable Git repository and isolated Local configuration. It checks
file/section review, preview-only behavior, separate index/working-folder changes,
later-edit conflicts, binary and added/deleted files, traversal/unknown-session
refusal, restart recovery and unavailable checkpoints outside Git. The fixture
starts no model turn. Native button, confirmation and accessibility acceptance
remain separate checks.

`pnpm --filter @agiworkforce/desktop test:gpui:files` exercises file paging,
exact BOM/CRLF/Unicode read/write, no-op save replay, stale edits, file-size limits,
protected files, symlink/hard-link/FIFO and traversal refusal, read-only files and
the account-only host's refusal of every file method. It uses a disposable folder
and isolated Local configuration and starts no model turn. The Metal fixture
checks the actual editor widget in both themes, including exact text preservation
and its loading/saving read-only state. Native save/discard prompts, keyboard/IME,
ACL/platform behavior and crash/recovery acceptance still require live checks.

`pnpm --filter @agiworkforce/desktop test:gpui:terminal` checks a real Unix PTY,
launch/input replay protection, Unicode/ANSI projection, resizing, actual sandbox
refusal of an outside write, foreground/background job cleanup, runtime shutdown
and account-only refusal. It starts no model turn. The Metal fixture also checks
the native grid, scoped composition/commit, Ctrl-C and disabled input at 320/768
in both themes. Local macOS launch consent, real input/output, two-tab switching
and window-close cleanup have native evidence. Physical IME, the terminal paste
review dialog, full screen-reader journeys and forced-exit recovery remain
separate gates. Terminal dependencies retain their MIT or Apache
notices in the bundled CLI's generated notices.

`pnpm --filter @agiworkforce/desktop test:gpui:chat` checks create/send/stream,
saved multi-turn context and upstream cancellation against a synthetic loopback
gateway using the real packaged CLI. It also saves a conversation model with the
HTTP revision, rejects restricted/unavailable/unknown choices before writing,
refuses a stale revision, and reopens the saved model through a new CLI process.
Native model choice reads the confirmed conversation record, using the same
versioned update owner as Rename/Pin/Archive. An uncertain update requires Review
latest conversation before another send; it never silently retries the write.
Account-wide new-chat defaults and effort controls remain in development.
The fixture performs no real account inference.

Cloud conversation drafts use the shared draft limit and autosave debounce.
The native app saves them with the draft's own revision clock, restores them when
opening a conversation, and keeps typing enabled while a save is in flight.
Saving does not change the conversation's metadata revision or history order.
Conflicts expose the saved text and its exact revision in a read-only native text
field with keyboard selection/copy; Keep my draft and Use
saved draft ask before replacing either version. Failed or oversized drafts stay
in the composer, with explicit retry and copy/clear recovery. Temporary or older
responses without an explicit draft snapshot cannot claim persistence.

`test:gpui:chat` also checks cold draft recovery through a second CLI process,
conflicts, same-text recovery after a lost response, explicit clearing and unchanged
metadata/history order. The Metal suite exercises the actual draft controls and
editable composer during saving in both themes at 320/768 pixels. Native debounce,
OS confirmation and screen-reader acceptance remain open. Host Code drafts and
unsaved editor buffers still require durable recovery work.

Projects opens the selected Cloud workspace's hosted projects, including paged
browsing, details, name/description/instruction editing and owner archive/restore.
The form retains unconfirmed edits and asks before discarding them. Project reads
and conditional writes use actual server revisions; a stale edit requires Review
latest project, and a lost response is not automatically replayed. Project
conversations keep their project scope, and eligible new Chat/Work conversations
inherit the saved default model through the current Cloud owner. Project content
and approved local coding folders remain separate.

`pnpm --filter @agiworkforce/desktop test:gpui:projects` checks these transports
against a fresh isolated fixture using the packaged CLI, including surface/access
refusal, revision conflicts, lost replies, default-model admission, scoped history,
a synthetic send and cold recovery. The Metal suite checks the actual form in
both themes at 320/768 pixels. Native list navigation has evidence; native form/
discard/close acceptance remains open. Knowledge-file management, sharing,
project defaults/presets, appearance, export and deletion are still in development.

The project files panel reads the shared knowledge-file API through the account
runtime. It shows source metadata and indexing state, and opens supported text,
table and Office extraction previews as read-only plain text. Preview and copy
retain the exact displayed text and its truncation flag. Reads pin the account,
workspace, project and file; source changes during a preview require a refresh.
PDF/image previews and source removal still need native flows.
No local folder authority or file-upload permission is granted by this panel.

Add file opens a native picker and prepares one bounded, read-only snapshot.
A second native prompt names the file, workspace and Cloud project before upload.
Later edits to the source do not change the reviewed bytes. Upload progress stays
visible while browsing. Interrupted transfers resume their known multipart
session; an unconfirmed completion is checked with that same session. An unknown
setup response is never replayed automatically. Stop cleans up partial uploads
where the service can confirm it; it does not remove a completed project file.
The snapshot lasts only for this account-runtime process. Closing the app,
reconnecting or signing out discards it and stops its transfer; refresh project
files after an uncertain completion before selecting the source again.

`pnpm --filter @agiworkforce/desktop test:gpui:uploads` exercises the packaged
runtime against an isolated fixture, including exact reviewed bytes, multipart
recovery and cancellation. Native picker/confirmation acceptance remains open.

Download opens a native save picker and reviews the exact source checksum and
selected destination before fetching file bytes. New files are published only
when the chosen name is still unused. Reviewed replacements retain the existing
inode and permissions; destination edits and identity changes cause a conflict.
An original copy is retained locally if replacement confirmation fails, and the
error includes its path. Corrupt, oversized or truncated responses never reach
the selected file. Stop cancels before local saving begins; an in-progress save
finishes before the account runtime closes. Saved files are revealed explicitly.

The active project's owner can request reindexing. Already queued/running
requests are observed without another dispatch; an unconfirmed response requires
refresh before another UI request. Source removal is gated by
`WEB-PROJECT-OBJECT-LIFECYCLE-01`, the shared deletion/duplication recovery issue.
`pnpm --filter @agiworkforce/desktop test:gpui:downloads` verifies these transports
and destination guards with the packaged CLI and an isolated fixture. Native
save-picker, overwrite-confirmation and Finder acceptance remain open.

`test:gpui:native-cloud` launches the signed development bundle with an isolated
configuration and a loopback Cloud fixture. It imports the shared response schemas,
requires explicit workspace headers for content, and seeds multiple messages and
two-action Work reviews. The account, models, replies and actions are synthetic;
it never invokes a provider or executes the proposed tools. Normal native sends,
metadata changes, plan reviews and run controls use the packaged CLI and actual
GPUI handlers. The fixture prints an artifact/state-file path, not credentials.
The state file contains its synthetic credential and the loopback origin.
For a narrow fixture, run `test:gpui:native-cloud 1800000 320x640`: the first
argument is its maximum duration in milliseconds, and the second is the initial
window size.

The server stays alive after the native window closes so a cold process can
recover the same saved history. `SIGUSR1` sent to the recorded fixture PID requests
a relaunch only after the previous native process has exited. Close the native
window normally, then stop the fixture with Ctrl+C. An interrupted or timed-out
native process is reported with a nonzero exit, not UI acceptance. The launcher is
currently macOS-only; it preserves its request ledger and log while removing the
isolated credential/config directory.

`test:gpui:native-cloud-fixture` verifies the fixture's auth/scope rejection, HTTP
conflicts, independent draft clocks, history/model/idempotency behavior, two-action denial and held-stream
cancellation. `test:gpui:native-cloud-runtime` starts a separate fixture and checks
real CLI plan sealing, metadata CAS, cold recovery and reviewed continuation.
It can take an existing fixture state-file path; keep that UI idle during the
runtime check so another send cannot contaminate its request-count assertion.
These checks do not establish real authentication, paid inference or Web service
acceptance.

`pnpm --filter @agiworkforce/desktop test:gpui:workspaces` checks membership,
explicit selection, same-named organizations, a lost selection reply without
replay, workspace-bound creation/history/streaming/run journals, cold attachment,
wrong-workspace refusal and membership revocation against the packaged CLI.
The Work and Work creation fixtures also require the selected workspace on every
request, including approval, resume and plan metadata writes. These are isolated
loopback fixtures, not real authentication or inference acceptance. The Metal
suite exercises the production workspace picker in both themes at 768/390/320,
including slug search, pointer/keyboard selection, dismissal and disabled input.

`pnpm --filter @agiworkforce/desktop test:gpui:work` checks exact-action approval,
denial, paused continuation, paginated durable output and saved replies through
the packaged CLI. Stale checkpoints, changed reviewed inputs, another account's
scope and repeated decisions are refused before continuation. The same fixture
restarts the CLI, pages existing Work, reopens linked and unlinked runs and checks
that duplicate request keys cannot target another run. It uses only a synthetic
account and loopback gateway.

`pnpm --filter @agiworkforce/desktop test:gpui:work-start` checks text-goal
creation, entitlement refusal, a failed plan-save retry, recovery after restart,
dismissal and execution of reviewed steps through the packaged CLI. Stable
execution IDs and frozen planning context preserve the gateway's idempotency
check. A repeated execution after restart receives the gateway's HTTP 409 replay
refusal; it does not replay an answer or start new inference. This fixture uses a
synthetic account and loopback gateway. Native controls and real-account use
remain separate acceptance checks.
