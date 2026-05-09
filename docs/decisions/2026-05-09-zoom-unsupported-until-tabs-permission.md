# ADR: `browser-tool` `zoom` action emits `unsupported` step until `tabs` permission lands

## Status

Accepted — 2026-05-09.

## Context

The Anthropic Computer Use action set (`computer_20251124`) includes 16 actions. Fifteen are implementable from a Chrome MV3 content-script context (screenshot, left/right/middle/double/triple click, mouse_move, key, type, scroll, hold_key, wait, left_mouse_down/up, cursor_position). One — `zoom` — requires `chrome.tabs.setZoom`, which is exposed only to the extension's service worker and requires the `tabs` permission in the MV3 manifest.

`tabs` is a sensitive permission (Chrome Web Store listing flagging) that does not align with our current minimal-permission posture. Asking for it solely to support `zoom` would be disproportionate.

Three options:

1. **Refuse to wire `browser-tool` until `tabs` is added.** Blocks all 15 other actions.
2. **Silently skip `zoom`.** Model assumes it succeeded; produces incorrect plans.
3. **Emit a structured `unsupported` step.** Model receives a real response and can re-plan.

## Decision

`zoom` returns an `unsupported` step from `apps/extension/src/browserTool.ts`. The 15 implementable actions translate to live `RunPageAction[]` entries; `zoom` translates to a step with `kind: 'unsupported', reason: 'requires tabs permission'`. The translator at `apps/extension/__tests__/browser-tool.test.ts` asserts this explicitly (one of the 19 tests).

The extension's action loop forwards the `unsupported` response to the model. The model can re-plan with a different action (often a `scroll` or a manual zoom-via-keyboard combo).

## Consequences

**Positive**

- 15 of 16 Computer Use actions ship today. We do not gate the entire feature on a permission we do not yet need.
- Models receive a structured response and can re-plan rather than encountering a silent failure.
- The extension's `permissions` array stays minimal, which keeps the Chrome Web Store review surface small.
- When `tabs` is justified for another feature, implementing `zoom` is a localised change.

**Negative**

- Multi-step plans that depend on `zoom` (e.g. "zoom in to read this small text") will fail until the permission lands. Realistically rare.
- The `unsupported` step type is a new wire shape that downstream consumers must handle. Mitigated: the extension's existing step-handler defaults to "log + skip" for unknown step kinds.
- A future `tabs` permission addition requires CWS reviewer re-approval (we are CWS-READY today).

## References

- `docs/architecture/foundation-2026.md` §7.3.
- `tasks/research/exec/1.8-report.md` §"`@agiworkforce/browser-tool`" item: zoom row in 16-action coverage table.
- `apps/extension/src/browserTool.ts`.
