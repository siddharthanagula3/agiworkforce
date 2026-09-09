# Desktop local runtime

> **Path:** `apps/desktop/electron/runtime/` · **Contract:** `packages/contracts/local-runtime` · **Owner:** founder · **Status:** Phase 1 complete, Phase 2 filesystem and git landed · **Updated:** 2026-09-08.

## What this is

The privileged half of the Electron desktop app: the services that reach the
local machine, and the typed boundary the renderer talks to them through.

It is not a second product. The renderer is the existing web application, the
chat UI is `@agiworkforce/unified-chat`, authentication is Clerk through the
cloud, and conversations live in the cloud exactly as they do in a browser.
What desktop adds is a local runtime the same UI can call.

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
   window policy deliberately allows top-level navigation to Google, Microsoft,
   Apple and Clerk for OAuth, and the preload runs on those pages too; this is
   what keeps the bridge away from an identity provider's page.
2. **Command classification** happens in `CAPABILITY_BY_COMMAND` in `dispatcher.ts`. A
   command not in that table reaches no service.
3. **Permission** defaults to deny, is scoped to one workspace root, and is checked before
   the service is called. A grant on one folder says nothing about another; a
   `global` grant does not stand in for a scoped one. High-risk capabilities
   (`shell.execute`, `computer.use`, `git.destructive`, …) cannot become a
   standing grant without an explicit acknowledgement, so they expire on quit.
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

Directory walks never follow symlinks. Following one and re-checking would be
defensible; skipping is simpler and has no failure mode.

`ALWAYS_DENIED_BASENAMES` refuses `.env`, `id_rsa`, `.npmrc` and friends even
inside an approved root. Approving a folder is not approval to hand over the
credentials stored in it.

## Renderer origin: the open decision

The spec this was built to prefers packaging the frontend into the desktop
renderer so the app loads a trusted local origin. That is not currently
possible: `apps/web` is a Next.js app with 288 server routes doing database and
Clerk work. A static export cannot exist, and shipping the standalone server
locally would ship backend credentials to every user's machine.

So the renderer loads `agiworkforce.com`. That is a first-party origin, not
arbitrary remote content, but it is still an origin whose XSS surface is larger
than a bundled one. The four gates above are what make that acceptable for
filesystem access; they are **not** sufficient for shell execution or computer
use, and those must not ship against a remote renderer without revisiting this.

`RENDERER_MODE` in `config.ts` is the switch, and `bundled` still works, so the
decision is reversible without an architectural change.

## What is implemented, honestly

| Capability                            | State                                                  |
| ------------------------------------- | ------------------------------------------------------ |
| Secure shell, deep links, tray        | ✅ shipped                                             |
| Quick Ask, global shortcuts           | ✅ shipped                                             |
| Secret storage (`safeStorage`)        | ✅ shipped                                             |
| Native application menu               | ✅ shipped                                             |
| Launch at login (opt-in)              | ✅ shipped                                             |
| Permission manager                    | ✅ filesystem categories enforced; rest declared only  |
| Approved workspace roots              | ✅ persisted, native picker                            |
| Filesystem read / write / search      | ✅ list, stat, read, write, mkdir, glob, grep          |
| Git read state                        | ✅ branch, head, upstream, ahead/behind, status counts |
| Git write and destructive operations  | ❌ capability declared, no implementation              |
| Filesystem watcher                    | ❌ command name reserved, no implementation            |
| PTY terminal, shell execution         | ❌ not started                                         |
| Embedded browser and CDP tools        | ❌ not started                                         |
| Computer use                          | ❌ not started                                         |
| iOS simulator, Android emulator       | ❌ not started                                         |
| Worktree isolation, parallel sessions | ❌ not started                                         |
| Local MCP, scheduled tasks, SSH       | ❌ not started                                         |

Capability names exist in the contract for the unimplemented rows. They are
declarations of where those features will attach, not claims that they work.

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

- `packages/contracts/local-runtime/src/__tests__/path-safety.test.ts`: 25 cases, posix and win32
- `apps/desktop/electron/__tests__/pathGuard.test.ts`: 12 cases against real symlinks in a temp directory
- `apps/desktop/electron/__tests__/filesystemService.test.ts`: 20 cases
- `apps/desktop/electron/__tests__/permissionCore.test.ts`: 15 cases
- `apps/desktop/electron/__tests__/gitService.test.ts`: 11 cases against a real repository
- `packages/client/client-runtime/src/__tests__/electronRuntime.test.ts`: 13 cases

The three symlink-escape cases and the git status case were each confirmed red
against the unfixed code before being kept.

## Running it

```bash
cd apps/desktop
node electron/build-main.mjs
AGI_CLOUD_APP_ORIGIN=http://localhost:3100 pnpm exec electron .
```

`AGI_CLOUD_RENDERER=bundled` loads the old Tauri-shim renderer instead.
