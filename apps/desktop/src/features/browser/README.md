# Desktop Browser Feature

Status: Current
Owner: Desktop surface lead
Purpose: Own Desktop browser visualization, replay, action log, viewer, and debug tabs for browser automation workflows.

## Boundaries

- Keep browser-specific display and diagnostics UI in this folder.
- Keep shared browser state in `apps/desktop/src/stores` until the browser runtime contract is promoted.
- Import shared UI primitives from `@/components/ui/*`.

## Browser-control runtime

`BrowserViewer` owns the only user-facing start/stop control for the
browser-control runtime: `launchBrowser` -> `browser_launch` ->
`PlaywrightBridge::launch_browser` -> platform executable discovery. Do not
remove it without giving the runtime another reachable entry point — with no
caller, discovery is unreachable and the panel is a dead viewer on any machine
where no browser has been started by hand.

Launch failures must render the backend message verbatim: it lists every
install location that was probed and the `AGIWORKFORCE_BROWSER_EXECUTABLE`
override, which is the only actionable information a user gets when no
supported browser is installed. Covered by
`__tests__/BrowserViewer.runtime.test.tsx`.
