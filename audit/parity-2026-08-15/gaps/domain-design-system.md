# Domain Audit — Design System + Accessibility

Commit `e15df56e3`, working tree clean. Domain scope per brief: component-level design
system (`packages/ui/design-tokens`, `packages/ui/ui`), the hex-color/a11y guard
scripts, and CSS custom properties actually shipped to production markup, across all
six app surfaces (web, desktop, mobile, extension, extension-vscode, cli).

**Method note:** every finding below was verified by opening the cited file(s) and,
where a script or guard is claimed to pass/fail, by actually running it on the clean
tree. Numbers are exact grep/script output, not estimates, except where explicitly
flagged as a heuristic.

## Summary

The design-token layer itself (`packages/ui/design-tokens`) and the 56-component
shared primitive library (`packages/ui/ui`) are genuinely strong — better-documented
and more accessibility-conscious than most production design systems this size,
with a real, dated history of WCAG AA contrast remediation (AUDIT-FIX GOV-34) and
platform-level accessibility support (forced-colors, prefers-contrast, safe-area
insets) that goes beyond what either ChatGPT or Claude's web apps are known to ship.
The problem is not that the system is weak — it's that its own guardrails are
inconsistently enforced and its own components are inconsistently adopted. Three
separate "AP-02 no-hardcoded-color" guards exist across the repo (web, mobile,
extension-vscode) built to the same pattern as the Chrome extension's, which
correctly gates CI — but the web and mobile copies are dead weight (never invoked
in CI), and the extension-vscode one is currently _failing_ on the audited commit
because of a regex bug that flags a correctly-tokenized `color-mix()` call. Two
of the shared library's own primitives (`EmptyState`, `Spinner`) are barely used
in the surface that ships the most code (web), and a dedicated `accessibility/`
component directory (650 LOC, including a fabricated "95%, all checks passed"
mock audit panel) is entirely dead code — so dead that the app currently ships
with no working skip-to-content link despite having built one. Both automated
a11y CI gates (web, desktop) only ever see the signed-out marketing shell, never
the authenticated product where the actual components live. Mobile has no
automated a11y testing at all and covers roughly half its touch targets with
accessibility labels. None of this is a P0 — nothing here breaks a primary
workflow — but it adds up to a design system that is stronger on paper than it
is in the product a user actually opens.

## Strengths (verified, not hand-waved)

| Area                                    | Evidence                                                                                                                                                                                                                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Documented WCAG AA contrast remediation | `packages/ui/design-tokens/src/chat.css` carries dated `AUDIT-FIX GOV-34` comments with _measured_ contrast ratios (e.g. dark-mode `--chat-text-muted` "was #5c5955, 2.53:1 ... now #8f8982, 5.08:1") across all 4 theme×palette combinations (warm/cool × light/dark) |
| Windows High Contrast Mode support      | `apps/web/app/globals.css:1757-1789` — `@media (forced-colors: active)` strips shadows/gradients, forces `ButtonBorder`/`LinkText`/`Highlight` system colors, even neutralizes `bg-gradient`/`text-transparent` utility classes specifically                           |
| `prefers-contrast: more` support        | `apps/web/app/globals.css:1730-1755` — strengthens muted-foreground/border tokens and widens the focus ring to 3px                                                                                                                                                     |
| iOS safe-area handling                  | `apps/web/app/globals.css:1793-1824` (`AUDIT-FIX GOV-39`) — documented fix for the composer send button rendering under the home indicator                                                                                                                             |
| Base keyboard focus ring                | `apps/desktop/src/styles/globals.css:338-360` — documented fix for a real prior bug ("under ordinary settings NOTHING in the desktop app showed a focus ring")                                                                                                         |
| Single canonical settings nav           | `packages/ui/ui/src/settings-nav.ts` is the one shared source of truth for both desktop and web settings, explicitly built to prevent the two from drifting                                                                                                            |
| Icon-library discipline                 | 100% `lucide-react` across web (141 imports) and desktop (254 imports) — zero mixed icon sets found                                                                                                                                                                    |
| No non-semantic clickable `<div>`s      | `<div onClick>` count: web 0, extensions 0, desktop 2 (both are `stopPropagation` wrappers, not real controls)                                                                                                                                                         |
| `Button` primitive a11y engineering     | `packages/ui/ui/src/primitives/Button.tsx` sets `aria-busy` for loading state, injects a visually-hidden fallback label for icon-only buttons with no `aria-label`, and documents a deliberate drift-resolution decision in its own comment                            |
| Design tokens reach every real surface  | `@agiworkforce/design-tokens` is imported by web, desktop, mobile, extension, _and_ extension-vscode (5 of 6 app surfaces) — see Quantified Adoption table below                                                                                                       |
| `useSystemHighContrast` hook            | `apps/mobile/src/ui/theme/useSystemHighContrast.ts` — live-subscribes to iOS `isDarkerSystemColorsEnabled`/Android `isHighTextContrastEnabled`, correctly wired into `useTheme.ts:43`                                                                                  |
| jsx-a11y active on web                  | `eslint-config-next/core-web-vitals` ships jsx-a11y by default; web's `disabledReactRules` override only turns off `react/*` rules, not `jsx-a11y/*`; `lint` runs with `--max-warnings=0`. No missing `alt=` found in real (non-test, non-fixture) component code      |

## Quantified adoption — the numbers behind "measure, don't hand-wave"

**@agiworkforce/ui (56 shared component primitives) — files importing it per surface:**

| Surface            | Files importing `@agiworkforce/ui` | Notes                                                         |
| ------------------ | ---------------------------------: | ------------------------------------------------------------- |
| web                |                                113 | primary consumer                                              |
| desktop            |                                 54 | second consumer                                               |
| mobile             |                                  0 | expected — React Native, not DOM                              |
| extension (Chrome) |                                  0 | not React at all: 87 `.ts`, 2 `.html`, 2 `.css`, **0 `.tsx`** |
| extension-vscode   |                                  0 | webview built from an HTML template string, not React         |
| cli                |                                  0 | terminal UI, out of scope                                     |

**@agiworkforce/design-tokens — files importing it per surface:**

| Surface          | Consumes design-tokens?                                                         |
| ---------------- | ------------------------------------------------------------------------------- |
| web              | Yes — `app/globals.css` imports `@agiworkforce/design-tokens/chat.css` directly |
| desktop          | Yes — `src/styles/globals.css`                                                  |
| mobile           | Yes — chat components, stores                                                   |
| extension        | Yes — `src/tokens.ts`                                                           |
| extension-vscode | Yes — `webviewContent.ts`                                                       |

So the _token_ layer (colors/radii/fonts as CSS custom properties or JS constants) is
universally adopted; the _component_ layer (actual button/modal/menu markup + behavior)
reaches only 2 of 6 surfaces. This is the structural root of DESIGN-SYSTEM-002.

**Raw hex-color literals found per surface** (`grep -rEo '#[0-9a-fA-F]{3,8}\b'`, source dirs only):

| Surface            |                                                                     Raw hex hits | Guard exists?                                             | Guard wired into CI?                                       | Guard currently passes?                            |
| ------------------ | -------------------------------------------------------------------------------: | --------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------- |
| web                |   410 (mostly comments/exempt files; **4 real violations** per the actual guard) | Yes (`check-no-hex-colors.mjs`)                           | **No**                                                     | **No — 4 failures**                                |
| mobile             |                                              593 (640 grandfathered in baseline) | Yes (`check-no-hex-colors-mobile.mjs` + ratchet baseline) | **No**                                                     | Yes (0 new)                                        |
| desktop            | 322 (mostly legit: xterm theme colors, syntax-highlight presets, chart palettes) | **No equivalent guard exists**                            | n/a                                                        | n/a                                                |
| extension (Chrome) |                                                                               21 | Yes (`check-no-hex-colors.mjs`)                           | **Yes** (`ci.yml:146`, `release-chrome-extension.yml:114`) | Yes                                                |
| extension-vscode   |                                                                               12 | Yes (`check-vscode-theme-tokens.mjs`)                     | **Yes** (`release-vscode-extension.yml:98`)                | **No — 1 false-positive failure on `color-mix()`** |

Inline `style={{...}}`/`style="..."` counts (raw, not filtered for legitimacy —
dynamic values like computed widths are expected and fine): web 1,638, desktop 206,
extension 2, extension-vscode 13. The web number is large but mostly load-bearing
dynamic styling (progress bars, computed positions), not a hex-literal proxy — flagged
here for completeness, not filed as a gap on its own.

## The gaps

| ID                | Sev | Surface          | Gap                                                                           | Verified by                                              |
| ----------------- | --- | ---------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------- |
| DESIGN-SYSTEM-001 | P1  | extension-vscode | CI-wired color-token guard is currently red on a `color-mix()` false positive | Ran the script, read the regex, confirmed the CI wiring  |
| DESIGN-SYSTEM-002 | P1  | cross-surface    | Shared component library reaches only 2 of 6 UI surfaces                      | package.json deps + import greps                         |
| DESIGN-SYSTEM-003 | P1  | cross-surface    | Both a11y CI gates cover only unauthenticated/pre-product screens             | Read both harnesses in full                              |
| DESIGN-SYSTEM-004 | P2  | web              | web's own hex guard unwired from CI, currently failing (4 violations)         | Ran the script                                           |
| DESIGN-SYSTEM-005 | P2  | mobile           | mobile's hex guard + 640-entry baseline unwired from CI                       | Ran the script, grepped workflows                        |
| DESIGN-SYSTEM-006 | P2  | web              | 4 chat-format cards inject un-tokenized rainbow gradients                     | Read all 4 components, confirmed live wiring             |
| DESIGN-SYSTEM-007 | P2  | web              | Chat top bar uses off-palette purple/blue gradient + raw grays                | Read component directly                                  |
| DESIGN-SYSTEM-008 | P2  | web              | Shared `EmptyState` barely adopted; duplicates regress its own contrast fix   | Grep + read both duplicate definitions                   |
| DESIGN-SYSTEM-009 | P2  | web              | `accessibility/` component directory 100% dead code incl. mocked audit panel  | Grep every filename, read AccessibilityAudit.tsx         |
| DESIGN-SYSTEM-010 | P2  | mobile           | No automated a11y testing; ~49% of touch targets labeled                      | Counted Pressable/TouchableOpacity vs accessibilityLabel |
| DESIGN-SYSTEM-011 | P2  | mobile           | Reduce-motion respected in 2/23 animation files                               | Grepped animation APIs vs reduce-motion checks           |
| DESIGN-SYSTEM-012 | P3  | web              | Shared `Spinner` unused; 60+ ad-hoc loading implementations                   | Grep + read the duplicate                                |

Full detail (files, exact evidence, recommendation) for each is in
`domain-design-system.json`.

### DESIGN-SYSTEM-001 — the most concrete finding in this audit

This isn't a judgment call — it's a currently-failing command on the exact commit
being audited:

```
$ cd apps/extension-vscode && node scripts/check-vscode-theme-tokens.mjs
check:vscode-theme-tokens — FAIL: 1 new hardcoded color literal(s) found.
  apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:290  [named-color-prop]  "background: color"
```

Line 290 reads `background: color-mix(in srgb, var(--warning) 10%, var(--bg-elevated));`
— fully tokenized, correct CSS. The guard's regex excludes `var(`, `transparent`,
`inherit`, `initial`, `currentColor`, `none` from its "looks like a literal" check but
not `color-mix(` (or any function call at all), so the word "color" at the start of
`color-mix(` trips it. This exact guard is invoked unconditionally in
`release-vscode-extension.yml:98`, which runs on every `v-vscode-*` tag and
`workflow_dispatch` — i.e. it will block the next real release unless someone either
fixes the regex or adds a baseline entry under time pressure at release time.

## What NOT to copy from the benchmark

- **Don't let settings sprawl reach ChatGPT desktop's documented complexity.** The
  cross-cutting research notes ChatGPT's rebuilt desktop settings was called out by a
  reviewer as "rivaling Microsoft and Facebook in complexity." This repo's
  `settings-nav.ts` already sits at 38 top-level keys — not excessive today because it
  is a single canonical, deduplicated source of truth for both web and desktop (a
  structural advantage neither benchmark product demonstrably has), but it's worth
  keeping flat/grouped rather than letting per-surface variants reappear.
- **Don't chase excessive badge/pill decoration.** Claude Web's own screenshots
  (`shots-claude-web.md`) use badges purposefully (`Beta`, `Recommended`, `running`,
  `#2 popular`) rather than decoratively — this repo's badge usage (35 instances
  across 21 files) is already at a comparable, disciplined density. No action needed;
  noted so a future pass doesn't over-correct by adding more.
- **Don't copy either product's habit of shipping a feature behind a settings flag
  no one finds** (`cross-cutting-and-complaints.md` §7-8, Claude's Settings > Features
  > Experimental file-creation toggle). This repo's own dead `accessibility/`
  > directory (DESIGN-SYSTEM-009) is the same failure mode in a different shape: not a
  > gated feature, but a _built_ feature nobody wired up. The fix in both cases is the
  > same discipline — mount it or delete it, don't let it sit half-alive.

## What to build (priority order)

1. Fix the `color-mix()` regex false positive in `check-vscode-theme-tokens.mjs`
   before the next VS Code extension tag (DESIGN-SYSTEM-001) — this is the one item
   in this report that is an active, reproducible CI break today.
2. Wire `check:no-hex-web` and `check:no-hex-mobile` into CI the same way the two
   extension guards already are, and fix web's 4 pre-existing violations
   (DESIGN-SYSTEM-004, DESIGN-SYSTEM-005).
3. Extend the web and desktop a11y CI gates to cover one authenticated-state pass
   each — Settings modal + a populated chat thread is enough to start
   (DESIGN-SYSTEM-003).
4. Mount `SkipLink` in `apps/web/app/layout.tsx` (it already exists, fully built —
   this is a one-line wire-up) and decide fix-or-delete for the rest of the dead
   `accessibility/` directory (DESIGN-SYSTEM-009).
5. De-duplicate `EmptyState` and `Spinner` call sites onto the shared primitives,
   starting with `ArtifactsPanel.tsx`/`ResearchPanel.tsx` since those two currently
   regress the primitive's own documented contrast fix (DESIGN-SYSTEM-008).
6. Re-token the four chat format cards and the chat top bar's Dashboard button onto
   `--chat-*` custom properties instead of raw Tailwind palette colors
   (DESIGN-SYSTEM-006, DESIGN-SYSTEM-007) — pure class-rename work, no new components.
7. Add a mobile reduce-motion hook mirroring the existing `useSystemHighContrast`
   pattern, and an eslint rule for unlabeled icon-only touch targets
   (DESIGN-SYSTEM-010, DESIGN-SYSTEM-011).
