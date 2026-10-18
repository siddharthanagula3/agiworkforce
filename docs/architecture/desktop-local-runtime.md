# Desktop device runtime

> **Path:** `apps/desktop/electron/runtime/` · **Contract:** `packages/contracts/local-runtime` · **Owner:** founder · **Status:** current Electron device-capability host · **Updated:** 2026-10-18.

## What this is

The privileged half of the Electron desktop app: the services that reach the
local machine, and the typed boundary the renderer talks to them through.

It is not a second product. The renderer is the existing web application, the
chat UI is `@agiworkforce/unified-chat`, authentication is Clerk through the
cloud, and conversations live in the cloud exactly as they do in a browser.
What Desktop adds is a local device-capability runtime the same UI can call.
“Local” in this document means privileged work on the device, not Local model
inference. The public Electron dispatcher rejects every local-inference command,
reports `localModels: false` and `localMcp: false`, and accepts no provider API
key. Conversation inference remains Managed Cloud.

## Why the seam is `command()` and nothing else

`packages/client/client-runtime/src/command.ts` was already the one function
every surface used to reach a capability, and `registry.ts` already classified
each command as `cloud`, `desktop-preferred` or `desktop-only` by prefix:
`file_`, `git_`, `terminal_`, `browser_`, `computer_use_` were all marked
desktop-only before any of this existed.

What was missing was a transport. `command()` had exactly one:

```ts
if (isTauri) return invoke<T>(name, args);
```

So the architecture did not need inventing, it needed a second arm:

```ts
if (desktopRuntimeHandles(name)) return invokeDesktopRuntime<T>(name, args);
```

`apps/web` already depends on `client-runtime`. Adding that branch means the
website, running as the desktop renderer, gains local capability with no fork,
no second chat implementation, and no change to how it behaves in a browser
(where `window.agiHost` is absent and every command keeps its cloud route).

## Layers

```
apps/web (renderer, unchanged)
  └── client-runtime command()
        ├── cloud route            (browser and desktop alike)
        └── invokeDesktopRuntime   (desktop only)
              └── preload window.agiHost.invokeRuntime
                    └── ipcMain DESKTOP_RUNTIME_CHANNEL
                          └── runtime/dispatcher.ts
                                ├── permissionManager   (default deny)
                                ├── workspaceStore      (approved roots)
                                ├── pathGuard           (realpath + containment)
                                ├── filesystemService
                                └── gitService          (execFile, never a shell string)
```

`packages/contracts/local-runtime` holds the types, channel names, error
codes and containment logic. Both sides import it, so the two halves of the IPC
boundary cannot drift. It has no Electron and no Node imports beyond
`process.platform`, which is what lets `apps/web` import it during SSR.

## The security model

**The renderer is not trusted with the disk.** It is the website, and the
website is exposed to whatever the network and its own dependencies bring in.
Every privileged operation is therefore gated in the main process, which is the
side that cannot be lied to about who is calling.

Four gates, in this order:

1. **`isTrustedSender`** accepts the main frame only, and only on the renderer
   origin. The
   window policy deliberately allows top-level navigation to the sign-in hosts
   of Google, Microsoft, Apple, GitHub, Okta, OneLogin and PingOne for OAuth
   and SSO, and the preload runs on those pages too; this is
   what keeps the bridge away from an identity provider's page. Clerk's
   production host is on the app's own domain. A Clerk-hosted development
   tenant is admitted only when it is the one `VITE_CLERK_PUBLISHABLE_KEY`
   names in the shell's environment, never by its shared suffix.
2. **Command classification** happens in `CAPABILITY_BY_COMMAND` in `dispatcher.ts`. A
   command not in that table reaches no service.
3. **Permission** defaults to deny, is scoped to one workspace root, and is checked before
   the service is called. A grant on one folder says nothing about another; a
   `global` grant does not stand in for a scoped one. High-risk capabilities
   (`shell.execute`, `computer.use`, `host.remote`, …) never become a
   standing grant: they are not written to disk, and one found on disk is
   dropped on load, so they expire on quit. One prompt is open per capability
   and scope at a time. Settings lists what was decided and `permission_revoke`
   withdraws it; withdrawing a refusal is confirmed in a native dialog, and
   revoking a folder forgets every decision made about it.
4. **Path containment** runs `realpath` first, then a segment-boundary comparison.

### Why containment is its own module

`candidate.startsWith(root)` is wrong: `/home/u/proj-secrets` starts with
`/home/u/proj` while lying entirely outside it. `path-safety.ts` compares on
segment boundaries, refuses anything not already absolute and resolved, and
treats an unparseable path as outside rather than inside.

Symlink resolution cannot happen there, because it needs the filesystem. It
happens in `pathGuard.ts`, and the two are deliberately separate: the pure half
is exhaustively testable, the impure half is small enough to read.

A write target does not exist yet, so `realpath` on the full path fails.
`resolveExistingPrefix` resolves the deepest existing ancestor and re-appends
the rest, which is what lets a create call be checked as strictly as a read.
Without it, every write is an unchecked path.

A link whose target does not exist fails `realpath` exactly as a missing name
does, and a write through it lands wherever the link points. So a missing
component that is itself a link is refused, at any depth of the path.

Node cannot open a file relative to a directory it already holds, so the check
and the open each name the path. The write therefore opens with `O_NOFOLLOW`
and without truncating, then looks at what it opened: the directory must still
resolve to the one that was checked, the name must still lead to the opened
file, and that file must be a regular file with no other name. The file is
never emptied. The new contents go into a file of their own beside it and are
synced, the same look is taken again, and only then is the name moved onto
them with a rename, so a full disk or a process that dies part way costs the
file that was there nothing. The permission bits are carried over. A directory
swapped for a link before the open can still cause an empty file to be created
where the link points; nothing is written to it and an existing file there is
left as it was. One swapped inside the rename itself is seen straight after,
and what was written is then emptied through the handle and the write refused:
Node has no rename that takes a held directory, so that window cannot be
closed from here. A file with a second hard link, such as one a package
manager links from its store, is refused under its own reason (`shared-file`),
which says the file is shared with another location rather than that it
moved; the rename would otherwise leave that other name on the old contents.

A read names the path twice in the same way, so it is held to the same look:
the file or folder is opened without following a link in its last component,
and nothing is returned until its folder still resolves to itself and the name
still leads to the very inode that was opened. The bytes then come from the
handle. A folder is listed through the name the system keeps for the folder a
handle holds (its volume and file number on macOS, the handle's own entry on
Linux), so a rename around it changes nothing; where there is no such name the
listing is kept only if the same folder is still there afterwards. Opening a
file with its default application does the look and then has to hand the
system a path, which is the one window left
(`DESKTOP-OPEN-PATH-CHECK-THEN-OPEN-01`). Only inert document types open that
way, by a list of what may open and not of what may not: text, images, PDF,
office documents without macros, audio and video. Anything else is revealed in
the file manager for the user to open.

A folder cannot be approved as a workspace when it is the system's, holds
every user's files, is the home folder or above it by any spelling, or is,
holds or sits inside one of the places credentials are kept
(`isGrantableRoot`). A stored grant that fails the rule is dropped on load.

`isCredentialPath` in the contract refuses credentials by pattern even inside an
approved root: `.env` and `.env.*` (other than a `.example`, `.sample` or
`.template` file), SSH private keys, `*.pem`, `*.key`,
`*.p12`, `*.pfx`, `*.env`, `.envrc`, `.npmrc`, `.netrc`, `.pgpass`, `.pypirc`,
`.yarnrc.yml`, `.git-credentials`, `credentials`, `.docker/config.json`,
`.kube/config`, `.git/config`, and everything under a `.ssh` directory. Read,
read-bytes and write refuse them, and a diff sent to a paired phone names such
a file and withholds its contents. Approving a folder is not approval to hand
over the credentials stored in it. This is a refusal by name in this app's
own file commands, not a read barrier: a command run in the folder reads such
a file like any other, because neither sandbox denies reads inside the
workspace, and a hard link to one under another name is read as an ordinary
file (`DESKTOP-WORKSPACE-CREDENTIAL-READS-01` in the known-flaws register).

`isProtectedWorkspacePath` names what decides what runs on this machine later,
at any depth and without regard to case: `.git`; the project config paths
(`PROJECT_CONFIG_PATHS`: `.agiworkforce`, `.mcp.json`, `mcp.json`,
`.vscode/mcp.json`); and the hook managers' files (`HOOK_MANAGER_PATHS`:
`.husky`, `.githooks`, the lefthook files, `.pre-commit-config.yaml`). The one
definition is `protected_paths.rs` in the sandbox-policy crate, and a parity
test in `shellSandbox.test.ts` reads that file so the two cannot drift.

A file write is refused when the path names one of these as written or as
resolved, or lands in a git directory the repository keeps under another name
(`isProtectedWrite` in `pathGuard.ts`). An agent's approval that would write
one is confirmed in a native dialog, as is one that calls an MCP tool and one
whose command, paths, remote or tool the shell cannot read back from the
request (`approvalReview.ts`). A path in such a request is judged where the
write lands, every link followed before a `..` after it is applied, and again
with its dots taken out as text, a reading that can only add: `lnk/../config`
is `.git/config` when `lnk` is a link into `.git/info`.

A project names its own MCP servers, and the CLI starts none of them in a
folder until the user has approved that exact launch there. The Code view is
told only which servers wait. The launch is the CLI's own account of it
(`mcp/approval/read`), shown by main in a native dialog
(`mcpApprovalReview.ts`): its parts first, then the CLI's question as written.
A variable the entry sets and the CLI does not pass to the server is listed
apart and without a value. A launch the CLI could not pin, through a shell or
a file it could not read, is said to be asked about at every start only when
the CLI says so in `askedAtEveryStart`; the text of a file entry, which a
project chooses, is never read for it.
A yes carries back the fingerprint of the launch that dialog showed. The CLI
refuses one for an entry edited while it was open and says what the entry is
now, which is what the user is asked about next; any other refusal ends the
review with the CLI's reason.

A local command runs under a Seatbelt profile whose write rules follow the
CLI's (`seatbelt_profile` in the sandbox-policy crate), rule for rule and in
its order: the write allows; the protected entries by name, in any case
(denied at any depth, allowed again inside a dependency or build tree, denied
at the folder's own top whatever lies below); a pin on each writable folder;
then the git metadata, the user's git configuration, the project's config
files and the host's own, each named where a write lands and, when it is a
link, as the link too. Creating or removing `.vscode` is denied with them.
`shellSandbox.test.ts` reads the crate's lists, rule templates and pinned
rules, so a change there fails here. A path that holds a quote, a parenthesis or a
backslash is written into the profile escaped, as the CLI writes it; one with a
control character or a line separator is refused. The profile differs from the
CLI's in two places, on purpose: `/tmp` stays writable beside the private
scratch folder; and the toolchain folders on the PATH are readable, so the
credential locations the CLI hides from a program that reads everywhere
(`HOME_CREDENTIAL_PATHS`) are hidden here as well, with this app's own data
folder and the CLI's. A toolchain folder is the PATH entry itself. For an
entry named `bin` or `sbin` outside the home folder it is the parent; inside
the home folder the parent is never opened, only the entry's sibling `lib`
and `libexec`, so `~/.local/bin` does not make `~/.local/share` readable. The
home folder, its `Library`, `Documents`, `Desktop` and `Downloads`, and
anything above them are never opened that way. The developer directory that
`DEVELOPER_DIR` or the system default names is readable, because `git` under
`/usr/bin` is a shim into it. A folder that holds a nested checkout, and each
folder above it below the writable root, cannot be renamed or replaced, so the
protected `.git` entry cannot be carried off with the folder around it. A run
the user opened the network for reaches hosts elsewhere only: local ports and
Unix sockets stay closed, as in the CLI's own commands.

## Renderer origin: the open decision

The spec this was built to prefers packaging the frontend into the desktop
renderer so the app loads a trusted local origin. That is not currently
possible: `apps/web` is a Next.js app whose server routes do database and
Clerk work. A static export cannot exist, and shipping the standalone server
locally would ship backend credentials to every user's machine.

So the renderer loads `agiworkforce.com`. That is a first-party origin, not
arbitrary remote content, but it is still an origin whose XSS surface is larger
than a bundled one. The four gates above are what make that acceptable for
filesystem access. They are **not** sufficient for shell execution or computer
use, which ship against the remote renderer only with a further gate each, in
a native dialog the page cannot draw or answer:

- **A local command** is asked about in main for every command, unless its
  program is on the allowed list and a sandbox runs it, and even then when
  the step is marked for review because the turn could carry a file off this
  computer. A long-running command is asked about the same way, as is a line
  typed into it that the shell policy does not already allow. Adding a
  program to that list is asked in main too, and only where local commands
  are already allowed in some folder. Where this computer has no sandbox,
  every command is asked.
- **Computer use** takes the session grant and then a yes for each run. A run
  is the screen steps of one task a user turn started, named by the id the
  page sends with every step; a step that names none is refused. The yes ends
  when the run is stopped, when the grant is withdrawn, or after five minutes
  without a step (`computerUseRuns.ts`). Computer use stays off until the
  user switches it on in settings, each app a step would control is asked
  about the first time, and a step aimed at this app's own window is refused.
  A script on the origin can still ask; it cannot answer.
- **An agent's approval** is confirmed in main for every command, whatever
  it does and however it is rated, for a command's network lift, for a push,
  for anything rated high risk or not rated, for a write outside the approved
  folder, and for a write to git metadata, project configuration or a hook
  manager's file (`approvalReview.ts`). What the page or a paired phone
  answers alone is an agent's edit to a file inside the approved folder on a
  path that is none of those, at low or medium risk, and the three kinds that
  move nothing outside the conversation. The CLI calls no write reversible,
  so that flag is not what decides an edit: the write guard on protected
  paths and the session's checkpoints cover it, and accept-edits mode makes
  the same edits with no approval at all
  (`DESKTOP-AGENT-EDIT-APPROVAL-WINDOW-ANSWERABLE-01`). The notification
  banner is drawn by the system at this computer, so its Approve still
  answers a command, and only one the CLI says changes nothing and the banner
  shows whole.

A page can raise these questions as often as it likes, so each names its
subject: one is open per subject, no more than three wait at once, and for the
ones a page can repeat with nobody clicking, a Cancel is remembered for a
minute and three Cancels quiet the rest of that kind (`nativeQuestions.ts`).

## What is implemented, honestly

| Capability                            | State                                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Secure shell, deep links, tray        | ✅ shipped                                                                                     |
| Quick Ask, global shortcuts           | ✅ shipped                                                                                     |
| Secret storage (`safeStorage`)        | ✅ shipped                                                                                     |
| Native application menu               | ✅ shipped                                                                                     |
| Launch at login (opt-in)              | ✅ shipped                                                                                     |
| Permission manager                    | ✅ enforced for every command the dispatcher serves                                            |
| Approved workspace roots              | ✅ persisted, native picker                                                                    |
| Filesystem read / write               | ✅ list, read, read bytes, write, edit in place, glob and grep                                 |
| Git read state                        | ✅ branch, head, upstream, ahead/behind, status counts                                         |
| Git write and destructive operations  | ⚠️ switch and push a session's branch, discard its changes, stage and revert agent checkpoints |
| Filesystem watcher                    | ❌ not started                                                                                 |
| Shell execution                       | ✅ one-shot and long-running commands, sandboxed, asked in main                                |
| PTY terminal                          | ⚠️ a long-running command gets a pseudo-terminal on macOS, pipes elsewhere                     |
| Embedded browser and CDP tools        | ❌ not started; a paired Chrome extension is used                                              |
| Computer use                          | ✅ opt-in; session grant, a native yes per run, asked per app                                  |
| iOS simulator, Android emulator       | ❌ not started                                                                                 |
| Worktree isolation, parallel sessions | ✅ worktrees the CLI makes, admitted per run                                                   |
| Local MCP                             | ✅ project servers, each launch approved in main                                               |
| Scheduled tasks                       | ✅ local routines: a scheduled prompt in an approved folder, run as a developer session        |
| SSH                                   | ⚠️ developer sessions on an SSH host; no PTY, file editor, worktrees or jump hosts             |

The contract carries a capability name only once a command is gated on it. A
name for an unimplemented row is added with the first command that checks it.

## Two bugs this design already caught

**`C:` is not an absolute path.** It is drive-relative on Windows, and treating
it as absolute would have let a containment check pass on a path that resolves
somewhere else entirely. Found by a unit test on `isAbsolutePath`.

**`stdout.trim()` inverted every git status count.** Porcelain encodes the index
in column one and the worktree in column two, so an unstaged edit arrives as
`" M README.md"`. Trimming both ends shifted every line left by one and reported
worktree changes as staged. Found by running the app and comparing against
`git status --porcelain`, not by any test that existed at the time; the
regression test in `gitService.test.ts` was written afterwards and fails
against the old behaviour.

## Tests

- `packages/contracts/local-runtime/src/__tests__/path-safety.test.ts`: posix and win32
- `apps/desktop/electron/__tests__/pathGuard.test.ts`: real symlinks in a temp directory
- `apps/desktop/electron/__tests__/filesystemService.test.ts`
- `apps/desktop/electron/__tests__/permissionCore.test.ts`
- `apps/desktop/electron/__tests__/gitService.test.ts`: a real repository
- `packages/client/client-runtime/src/__tests__/electronRuntime.test.ts`

The three symlink-escape cases and the git status case were each confirmed red
against the unfixed code before being kept.

## Running it

```bash
cd apps/desktop
node electron/build-main.mjs
AGI_CLOUD_APP_ORIGIN=http://localhost:3100 pnpm exec electron .
```

Signing in through a development Clerk instance needs
`VITE_CLERK_PUBLISHABLE_KEY` in the shell's environment; without it the window
sends that tenant's sign-in host to the browser.
