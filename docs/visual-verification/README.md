# Visual verification

Status: Current
Owner: Platform lead
Last updated: 2026-05-21

This directory holds the visual-verification deliverables for the AGI Workforce suite. The /goal completion criterion requires "screenshots confirming UI parity against Claude/OpenAI references" — these PNGs are the AGI-side capture step.

## How to capture

Each surface has its own subdirectory:

- `web/` — Next.js dev server screenshots, captured by `apps/web/e2e/visual-verification.spec.ts` via playwright (chromium 1920×1080).
- `desktop/` — Tauri dev screenshots, future slice.
- `mobile/` — RN simulator screenshots, future slice.

To recapture web:

```bash
cd apps/web
pnpm dev &      # in a separate shell, or use playwright's webServer
npx playwright test e2e/visual-verification.spec.ts
```

Output overwrites the existing PNGs in `docs/visual-verification/web/`. `git diff` exposes the delta.

## How to use

1. Run the capture step for the surface you changed.
2. Inspect the new PNGs against the reference UIs at `~/Desktop/reference/ui/` (Claude / ChatGPT / Gemini screenshots).
3. If the diff is intentional, commit the new PNGs.
4. If the diff exposes a regression, fix it before committing.

## Current findings — 2026-05-21

### Web

| Route     | Screenshot                         | Finding                                                                                                                                                                                                                                                    | Severity                      |
| --------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| /projects | `web/projects-route-viewport.png`  | Body copy and heading are nearly invisible against the black background in dark mode. `var(--text-1)` heading and `var(--text-3)` description both read as too-dim. The "+ New" button and "2 Issues" Next.js dev indicator are the only legible elements. | High — contrast accessibility |
| /         | `web/home-route-viewport.png`      | Renders. 1 pageError on hydration nonce mismatch (dev-mode only); 5 consoleErrors including CSP violations on inline scripts + open-dyslexic font CDN. CSP violations need real fixes — they would block accessibility-font users in production.           | Medium — CSP scope            |
| /projects | `web/projects-route-findings.json` | 0 pageErrors. 5 consoleErrors, all CSP/dev-mode noise.                                                                                                                                                                                                     | Informational                 |

These findings discharge part of the Stop hook visual-verification debt that the round-7..9 commits accumulated. Remaining surfaces (Desktop / Mobile / VS Code / Chrome) require dedicated capture infrastructure documented in the relevant surface READMEs.

## Why not pixel-diff snapshots?

We deliberately commit raw PNGs rather than running pixel-diff assertions in CI:

- AGI's UI uses theme tokens whose computed values change with the design-tokens package; pixel diffs would flag every theme tweak as a regression.
- Claude and OpenAI references at `~/Desktop/reference/ui/` are anchors, not exact pixel masters — AGI is recreating parity, not copying.
- The reviewer is the verification primitive. The committed PNGs make their job auditable; pixel diffs would automate a check that doesn't have a stable reference.

A future slice may add structural snapshot diffs (DOM `outerHTML` snapshots) on top of these PNG captures, but they are not a replacement.
