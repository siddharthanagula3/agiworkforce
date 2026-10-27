# Plan

## Approach

The shell owns the menu; the page owns the behaviour. A menu item the shell
cannot carry out itself becomes a `HostCommand`
(`packages/contracts/local-runtime/src/host-bridge.ts`), which
`apps/web/features/desktop-host/hooks/use-host-commands.ts` turns into an app
command (`apps/web/shared/lib/app-commands.ts`). The surface that owns the
behaviour answers that app command: the chat page, the app shell, or the
conversation's find bar. No second way to do an existing thing is added.

Every chord a menu shows comes from `HOST_MENU_SHORTCUTS` or the page's
shortcut registry, so the shortcut sheet and the menu cannot disagree. A chord
the page already binds is shown with `registerAccelerator: false`.

## Version skew

The hosted page deploys continuously and the shell updates through Squirrel,
so a newer page meets an older shell and, briefly, the reverse. The page's
host-command handler ignores a command it does not know instead of treating it
as another one, and a shell never sends a command no deployed page handles:
the web side of each command merges and deploys before the shell release that
sends it.

## Affected surfaces

Electron Desktop (`apps/desktop/electron`), the hosted web app
(`apps/web/features/desktop-host`, `apps/web/features/chat`,
`apps/web/shared`), the shared contract (`packages/contracts/local-runtime`)
and the shared sidebar (`packages/ui/ui`). Web users gain nothing visible
except where a page-side behaviour is shared; nothing changes for mobile, CLI,
VS Code or Chrome.

## Risks

- A built-in browser pane loads untrusted pages inside the app. It needs its
  own partition, no preload, no access to the account session, a navigation
  and permission policy, and a review before it ships.
- An interactive terminal needs a PTY native module rebuilt for Electron and
  signed in the release; it is host-owned work in the developer-session domain,
  never the cloud transcript.
- Clearing data is irreversible. Every clear names what is lost before it runs
  (`AGENTS.md` §9).
