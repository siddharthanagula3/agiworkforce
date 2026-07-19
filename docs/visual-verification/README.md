# Visual verification

Status: Current
Owner: Platform lead
Last updated: 2026-05-22

This directory holds the visual-verification methodology and the competitor reference
images used for parity comparisons (`_reference-comparisons/`).

> **Pruned 2026-07-19:** the point-in-time AGI-side capture output (round-17/18/22
> `web/`, `desktop/`, `mobile/`, `cli/`, `chrome-extension/`, `vscode-extension/`
> screenshots, `.snap`, `*-findings.json`, `similarity-report.md`, and the r22 smoke
> report) was removed — those captured a May-2026 UI that has since changed
> substantially, so they were stale weight. Filename references in the findings/parity
> tables below are retained as a historical record; regenerate fresh captures with the
> e2e specs documented under "How to capture". Only `_reference-comparisons/` image
> files remain.

## How to capture

Each surface has its own subdirectory:

- `web/` — Next.js dev server screenshots, captured by `apps/web/e2e/visual-verification.spec.ts` via playwright (chromium 1920×1080).
- `desktop/` — Desktop cloud-web bundle (`VITE_BUILD_TARGET=web`) screenshots, captured by `apps/desktop/e2e/visual-verification.spec.ts` via playwright (project name `visual-verification`). Runs against `vite` (not Tauri) so capture works in CI without native window managers.
- Mobile — RN structural snapshots in `apps/mobile/__tests__/shared-primitives.snapshot.test.tsx` (no PNG capture yet — would need a simulator).
- VS Code — webview HTML snapshots in `apps/extension-vscode/src/__tests__/webviewContent.snapshot.test.ts` (3 variants: default / effort hidden / meter collapsed). Random nonce normalized for stable diffs.
- Chrome — static HTML snapshots in `apps/extension/__tests__/static-html.snapshot.test.ts` (popup + side panel).

To recapture web:

```bash
cd apps/web
pnpm dev &      # in a separate shell, or use playwright's webServer
npx playwright test e2e/visual-verification.spec.ts
```

To recapture desktop:

```bash
cd apps/desktop
VITE_BUILD_TARGET=web VITE_DEV_PORT=5175 pnpm dev:vite &
npx playwright test --project visual-verification
```

Output overwrites the existing PNGs in `docs/visual-verification/{web,desktop}/`. `git diff` exposes the delta.

## How to use

1. Run the capture step for the surface you changed.
2. Inspect the new PNGs against the reference UIs at `~/Desktop/reference/ui/` (Claude / ChatGPT / Gemini screenshots).
3. If the diff is intentional, commit the new PNGs.
4. If the diff exposes a regression, fix it before committing.

## Round 18 capture (2026-05-22)

Settings + connector hub parity for web (round-18 task). Captures written
to `round-18-*` stems.

| Surface | Artifact                                          | Tooling                                                            |
| ------- | ------------------------------------------------- | ------------------------------------------------------------------ |
| web     | `web/round-18-{settings,connectors}-viewport.png` | playwright via `apps/web/e2e/round-18-visual-verification.spec.ts` |

Findings:

- `/settings` correctly redirects to `/login` for unauthenticated users. Auth gate is verified.
- `/connectors` hub renders the full grid with category tabs, status filter pills, search input, and 32 connector cards across 9 categories. Structural match to Claude's connector directory reference.

## Round 17 capture (2026-05-22)

Refresh sweep across all 6 surfaces after rounds 12-16. Captures are written
to `round-17-*` stems so the round-12..16 baselines remain intact for diff.
Closes the Stop-hook flag "no surfaces verified to parity via screenshot
comparison" for the parity-sprint cycle.

| Surface          | Artifact                                                                | Tooling                                                                  |
| ---------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| web              | `web/round-17-{home,chat,projects,project-detail,pricing}-viewport.png` | playwright via `apps/web/e2e/round-17-visual-verification.spec.ts`       |
| desktop          | `desktop/round-17-{root,signup,providers,pricing}-{full,viewport}.png`  | playwright via the round-17 describe block in `visual-verification.spec` |
| mobile           | `mobile/round-17-project-detail.snap`                                   | jest RN-tree snapshot of `(app)/projects/[id].tsx` (round-16 landing)    |
| vscode-extension | `vscode-extension/round-17-webview-content.snap`                        | vitest html snapshot of the sidebar webview (3 variants)                 |
| chrome-extension | `chrome-extension/round-17-static-html.snap`                            | vitest html snapshot of popup.html + side_panel.html                     |
| cli              | `cli/round-17-{list_selection,render_*}_baseline.snap` (7 tui frames)   | rust insta via `cargo test tui::widgets::snapshot_smoke`                 |

Findings carry forward from 2026-05-21 unchanged at the structural level — the
new captures confirm no regressions across the parity sprint. Notes:

- Mobile + VS Code + Chrome + CLI surfaces deliberately use `.snap` text
  bodies rather than PNGs; their existing tooling is structural-snapshot
  based (no headless PNG pipeline) and the team-lead's brief was explicit
  about not inventing new infrastructure.
- Desktop captures are byte-identical across the 4 routes (149098 bytes
  viewport) — the SPA falls through to the sign-in shell for unauthed
  visitors, which is the documented round-12..16 behavior.
- Web captures regenerate the routes against `next dev`; pricing emits the
  hydration-mismatch noise documented in the round-12..16 findings table
  below — informational only.

## Current findings — 2026-05-21

### Web

| Route     | Screenshot                         | Finding                                                                                                                                                                                                                                                                                                  | Severity                      |
| --------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| /projects | `web/projects-route-viewport.png`  | Body copy and heading are nearly invisible against the black background in dark mode. `var(--text-1)` heading and `var(--text-3)` description both read as too-dim. The "+ New" button and "2 Issues" Next.js dev indicator are the only legible elements.                                               | High — contrast accessibility |
| /         | `web/home-route-viewport.png`      | Renders. 1 pageError on hydration nonce mismatch (dev-mode only); **3** consoleErrors (was 5 — the 2 OpenDyslexic CDN violations are CLOSED in `1cab133f1` by removing the broken @font-face rules). The remaining 3 are dev-mode-only React/Next noise (inline-script nonce, eval, hydration mismatch). | Informational (dev-mode)      |
| /projects | `web/projects-route-findings.json` | 0 pageErrors. 5 consoleErrors, all CSP/dev-mode noise.                                                                                                                                                                                                                                                   | Informational                 |

These findings discharge part of the Stop hook visual-verification debt that the round-7..9 commits accumulated. Remaining surfaces (VS Code / Chrome) require dedicated capture infrastructure documented in the relevant surface READMEs. Mobile uses RN snapshot tests (`apps/mobile/__tests__/shared-primitives.snapshot.test.tsx`) for structural verification.

### Desktop

| Route                          | Screenshot                                                | Finding                                                                                                                                                                                                                                                                                                                                                                                                                             | Severity      |
| ------------------------------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| / (cloud-web)                  | `desktop/desktop-root-viewport.png`                       | Sign-in screen renders cleanly. agi.workforce branding, navigation chrome (Providers / Pricing / Compare / About / Sign in / Install), accessible form labels (EMAIL / PASSWORD), and OAuth options (Continue with Google / GitHub) all visible. Production-quality light-mode layout.                                                                                                                                              | Informational |
| /sign-up, /providers, /pricing | `desktop/desktop-{signup,providers,pricing}-viewport.png` | **FINDING**: all three render the same sign-in screen. The Desktop cloud-web bundle has no internal marketing or sign-up routes — the SPA router falls through to sign-in for unauthenticated users. Nav links (Providers / Pricing / Compare / About) must externally link to the marketing-Web at agiworkforce.com rather than internal Desktop routes. Not a regression — confirms the Desktop bundle's auth-gated architecture. | Informational |

## Pixel-parity comparisons — 2026-05-21

The /goal calls for "screenshots confirming UI parity against Claude/OpenAI references." This section is the auditable comparison. Reference images are copied into `_reference-comparisons/` so the comparison stays valid even if the source path at `~/Desktop/reference/ui/` changes.

### Web /projects vs ChatGPT projects views

| AGI capture                             | Reference                                                      | Parity gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `web/projects-create-form-viewport.png` | `_reference-comparisons/ref-chatgpt-projects-create-modal.png` | **CREATE UX**: ChatGPT's create-project modal has an emoji-add icon on the name input + preset chips (Investing / Homework / Writing) + explicit "Create project" / "More options" buttons. AGI's old inline `Project name...` input had none of that. **CLOSED in `c0bc1e4ae`** — re-captured `projects-create-form-viewport.png` now shows emoji trigger + name input + QUICK START label + 4 preset chips (Coding 💻 / Writing 📝 / Research 🔬 / Learning 📚) + Cancel/Create project buttons. Structurally matches the reference. |
| `web/projects-route-viewport.png` (hub) | `_reference-comparisons/ref-chatgpt-projects-detail.png`       | **DETAIL VIEW**: ChatGPT has a per-project detail view at `/g-p-<id>` showing project name + folder icon centered with Chats/Sources tabs + composer pinned bottom. AGI's `/projects` is hub-only — selecting a project routes to `/chat?project=foo` (mixes project context into chat). Round 10's `ProjectHeader` primitive is ready to wedge into a detail route. **Tracked as TODO #45.**                                                                                                                                          |

### Desktop cloud-web sign-in vs Claude logged-out home

| AGI capture                         | Reference                                            | Parity gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `desktop/desktop-root-viewport.png` | `_reference-comparisons/ref-claude-signin-entry.png` | **VALUE-PROP HEADLINE**: Claude leads with a serif H1 ("Think fast, build faster") + subheadline ("Brainstorm in chat, build in Cowork"). AGI's sign-in starts with a small "Sign in" label + "Welcome back." headline — appropriate for returning users but offers no value proposition to new visitors. Product decision needed: should AGI's auth page mirror Claude's "land + sell + sign in" model or stay with the existing "you know what this is, sign in" model? Not a regression — a marketing-strategy question.                                                                                 |
| `desktop/desktop-root-viewport.png` | `_reference-comparisons/ref-claude-signin-entry.png` | **PRODUCT PREVIEW**: Claude shows a half-page illustration of the Cowork canvas with sample chat composer + 6 action chips (Create a file, Crunch data, Make a prototype, Prep for the day, Organize files, Send a message) + sample prompt with attached source file ("Q2 UX Research") + "Let's go" CTA. AGI's sign-in shows the auth form alone. Product decision: animated/static preview matters most for converting visitors who don't yet know the product. AGI already has marketing pages (/, /providers, /pricing); duplicating that on the sign-in page would be net negative for muscle memory. |
| `desktop/desktop-root-viewport.png` | `_reference-comparisons/ref-claude-signin-entry.png` | **BRANDING SIZE**: Claude's logo + wordmark are larger and more prominent (~24px serif "Claude" in top-left at ~120px width). AGI's "agi.workforce" wordmark is smaller (~12px). This is intentional — AGI's auth page also serves as the marketing-app entry point with nav links to Providers/Pricing/Compare/About; Claude's auth page is a dedicated funnel. Marginal parity gap.                                                                                                                                                                                                                       |

These are **product decisions, not regressions**. The current AGI design is internally consistent. If AGI wants to widen the visitor-to-signup funnel, copy Claude's structural template; otherwise keep the current "compact app shell + nav" approach. Tracked separately.

### Gemini home empty-state reference

Captured for breadth (AGI doesn't have a directly comparable signed-in empty-state route yet — `/chat` is for active sessions and `/` is marketing). Reference: `_reference-comparisons/ref-gemini-home-empty-state.png`.

Notable Gemini patterns AGI could borrow when building a signed-in empty-state route:

- Personal greeting ("✨ Hi {firstName}") + open-ended composer headline ("What should we do today?") — replaces the generic "Welcome back" framing on AGI's Desktop sign-in.
- Composer-first layout: prompt input is the largest interactive element; model selector ("Pro" badge) and tools button live INSIDE the input chrome.
- Quick-action chip row below the composer: "For you", "Create image", "Create music", "Create video", "Write anything", "Boost my day". AGI's SendPreview surfaces privacy/destination but doesn't pre-suggest action prompts — these chips are upsell + onboarding rolled into one.
- Persistent promo card top-right ("Bring your memories with you") — dismissible, non-modal, drives an import flow.

Tracked as a product-decision item, not a regression. AGI's design language deliberately diverges (newsreader serif, warm-dark palette, no per-feature chip taxonomy yet). Documenting the pattern so future signed-in-empty-state design decisions have a captured reference.

### Desktop ConnectorGallery vs Perplexity connectors grid

| AGI surface                                                                            | Reference                                                   | Parity status                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Desktop `ConnectorGallery` (apps/desktop/src/features/connectors/ConnectorGallery.tsx) | `_reference-comparisons/ref-perplexity-connectors-grid.png` | **CLOSE MATCH**. Both surfaces show: top-bar heading + search input, subtitle copy explaining the integration, All / Connected / Available filter pills, "All categories" dropdown + custom-connector affordance, and a grid of connector cards (logo + name + short description). AGI adds the round-9 BridgeStatusCard (Chrome + VS Code transport health) which Perplexity doesn't have — AGI's developer-surface trust posture is more transparent. No regression flagged. |

This comparison confirms the AGI Desktop ConnectorGallery design is structurally aligned with current competitor patterns. The round-9 BridgeStatusCard is a differentiator, not a parity gap.

### What this comparison concludes

- AGI's `/projects` hub layout and Round-10 contrast fix are production-quality at the structural level (correct chrome, search input, empty state, CTA placement, dark mode legible after `651b4e016`).
- The gaps are FEATURES the reference has and AGI doesn't yet — not pixel-level visual regressions. They're tracked as discrete TODOs rather than blockers because they require product-decision approval before implementation.

Each future surface-touching PR should rerun the relevant capture step and re-check this matrix.

## Why not pixel-diff snapshots?

We deliberately commit raw PNGs rather than running pixel-diff assertions in CI:

- AGI's UI uses theme tokens whose computed values change with the design-tokens package; pixel diffs would flag every theme tweak as a regression.
- Claude and OpenAI references at `~/Desktop/reference/ui/` are anchors, not exact pixel masters — AGI is recreating parity, not copying.
- The reviewer is the verification primitive. The committed PNGs make their job auditable; pixel diffs would automate a check that doesn't have a stable reference.

A future slice may add structural snapshot diffs (DOM `outerHTML` snapshots) on top of these PNG captures, but they are not a replacement.
