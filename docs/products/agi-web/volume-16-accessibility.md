# AGI Web — Volume 16 — Accessibility

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (repo root), `apps/web/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`. Grounded in real repo paths: `apps/web/app/accessibility/page.tsx`, `apps/web/components/accessibility/SkipLinks.tsx`, `apps/web/components/ui/AccessibleDialog.tsx`, `apps/web/app/layout.tsx`, `apps/web/app/globals.css`, `apps/web/app/i18n/index.ts` (+ `locales/{en,es,hi}`), `apps/web/features/settings/sections/GeneralSection.tsx`, `apps/web/features/settings/components/LanguageSelector.tsx`, `apps/web/components/ThemeProvider.tsx`, `apps/web/components/layout/Header.tsx`, `apps/web/proxy.ts`.

## Overview & stance

This volume defines the accessibility contract for AGI Web — the **cloud-only** surface (Next.js 16 App Router, `proxy.ts`, Clerk, Neon, Stripe on Vercel). Web has **no Local mode and no BYOK**; there is only the signed-out marketing site and the signed-in Managed-Cloud product. So there is no BYOK "provider-label + consent" fork to make accessible here (that lives on Desktop/CLI/VS Code), but every Managed-Cloud affordance — model picker, upgrade/paywall, sync status, artifact viewer — must expose accessible names, roles, and state. Accessibility is not tier-gated: it applies identically across Free / Basic ($8·₹399) / Pro ($20) / Max ($100 & $200) / Enterprise, and to signed-out visitors. The stated target is **WCAG 2.1 AA** across product and marketing (`apps/web/app/accessibility/page.tsx`), with a public barrier-report path treated as P0.

## Screen Readers

**🟡 Partial** — `apps/web/components/accessibility/SkipLinks.tsx` renders a "Skip to main content" link (`sr-only focus-within:not-sr-only`), mounted in `apps/web/app/layout.tsx` (~line 202) ahead of `<div id="main-content" tabIndex={-1}>`; `apps/web/components/layout/Header.tsx` carries `id="main-navigation"` as a nav landmark. `apps/web/components/ui/AccessibleDialog.tsx` provides focus trapping, focus restoration to the trigger, Escape-to-close, and required `title`/`description` wired to `aria-labelledby`/`aria-describedby`.

Requirements: every page exposes one `<main>` landmark and headings in document order (no skipped levels); all icon-only controls carry `aria-label`; async surfaces (send, sync, upload, generation) announce status via a polite `aria-live` region; the model picker and upgrade dialog expose accessible names and selected state. Gap: `apps/web/app/accessibility/page.tsx` records color-only status badges and inconsistent legacy error-summary placement — both must close for full AA. Testable: NVDA/VoiceOver reach and label every interactive element in `/chat`, settings, and pricing.

## Keyboard Navigation

**✅ Built** — global focus styling in `apps/web/app/globals.css`: `*:focus-visible` renders a `2px solid hsl(var(--primary))` outline with `2px` offset (~line 1577), and `*:focus:not(:focus-visible)` suppresses the ring only for pointer/mouse focus — never a bare `outline: none`. The command palette (`apps/web/components/CommandPalette/CommandPalette.tsx`) and `AccessibleDialog` add keyboard-operable navigation and focus containment.

Requirements: every interactive element is reachable and operable by keyboard in a logical tab order; dialogs trap focus while open and restore it on close; Escape closes overlays; no keyboard traps; the skip link is the first focusable element. Composer shortcuts (send, new chat) must not steal focus from assistive tech and must have non-shortcut equivalents. Testable: full keyboard walkthrough of sign-in → chat → settings → billing with a visible focus indicator at every stop and no reliance on a pointer.

## Dynamic Fonts

**🟡 Partial** — `apps/web/features/settings/sections/GeneralSection.tsx` offers a persisted **Chat font** selector (Instrument Serif / System Sans / JetBrains Mono) applied via `--font-chat`; `apps/web/app/globals.css` defines `[data-chat-font='system']` and `[data-chat-font='dyslexic']` tokens, and sets input `font-size: 16px` on small screens to prevent iOS zoom-on-focus.

Gaps: (1) the OpenDyslexic face is **disabled** — `apps/web/app/globals.css` (lines ~13–27) documents that its CDN `@font-face` src was blocked by the `font-src` CSP in `apps/web/proxy.ts`, so "Dyslexic Friendly" silently fell back to system-ui; the tracked fix self-hosts OFL binaries under `apps/web/public/fonts/`. (2) There is **no user-facing text-scale / dynamic-type control** — layouts must instead honor browser/OS zoom and `rem`-based sizing without clipping. **🔭 Planned:** a global text-size preference and a re-enabled, same-origin dyslexic font. Testable: 200% browser zoom reflows without horizontal scroll or lost content.

## Contrast

**🟡 Partial** — `apps/web/app/accessibility/page.tsx` asserts body text and primary UI meet AA against the near-black editorial surface, with tertiary copy meeting large-text AA; dark/light theming is driven by `apps/web/components/ThemeProvider.tsx` (next-themes, `.dark` class variant wired in `apps/web/app/globals.css`). Selection and focus colors are defined against theme tokens.

Requirements: text and essential UI meet WCAG AA contrast (4.5:1 body, 3:1 large text and UI boundaries) in **both** light and dark themes; state is never conveyed by color alone (pair every color signal with text or an icon). Gaps: the marketing page's own "known gaps" list color-only status badges; there is **no dedicated high-contrast / `forced-colors` / `prefers-contrast` handling** in `globals.css` today. **🔭 Planned:** a Windows High Contrast / `forced-colors` pass and an audited AA contrast token set. Testable: automated contrast audit (axe/Lighthouse) passes on core routes in both themes with zero color-only findings.

## Reduced Motion

**✅ Built** — `apps/web/app/globals.css` includes a global `@media (prefers-reduced-motion: reduce)` block (~line 1588) that clamps `animation-duration`/`transition-duration` to `0.01ms`, forces `animation-iteration-count: 1`, and sets `scroll-behavior: auto`; a second rule (~line 1563) disables the decorative scanline overlay, and the message-bubble entrance animation is short-circuited (~line 959).

Requirement: all decorative and non-essential motion respects `prefers-reduced-motion: reduce` site-wide; essential motion (loading/progress) degrades to a static indicator. Gap: **🟡** several settings surfaces use `framer-motion` (`apps/web/features/settings/pages/UserSettings.tsx`) whose transitions are not proven to honor the reduce query — wrap them in a `MotionConfig reducedMotion="user"` boundary or gate behind the media query. Testable: with OS "reduce motion" on, no parallax, auto-play, or slide/scale transitions fire.

## Localization

**🟡 Partial** — `apps/web/app/i18n/index.ts` initializes `react-i18next` with `LanguageDetector` for **English, Spanish, and Hindi** (`SUPPORTED_LANGUAGES`), detection order `localStorage` → `navigator` (key `agiworkforce-language`), `fallbackLng: 'en'`; `apps/web/features/settings/components/LanguageSelector.tsx` exposes the switcher. Namespaces live under `apps/web/app/i18n/locales/{en,es,hi}`.

Gap: coverage is uneven — `en`/`es` carry `auth`, `chat`, `pricing`, and `models`, but `hi` ships only `common`, `errors`, and `settings`; untranslated Hindi keys fall back to English. No RTL locale is configured. Currency localization is bound to pricing (INR is fixed only for **Basic ₹399**; Pro/Max INR are **TBD** and must not be invented). **🔭 Planned:** full Hindi namespace parity, `<html lang>` set per active locale for assistive tech, and locale-aware date/number formatting. Testable: switching language persists across reloads, updates `<html lang>`, and shows no raw i18n keys.

## Repository map

- `apps/web/app/accessibility/page.tsx` — public accessibility statement (WCAG 2.1 AA target, known gaps, barrier-report contact).
- `apps/web/components/accessibility/SkipLinks.tsx` (+ `SkipLinks.test.tsx`) — skip-navigation.
- `apps/web/components/ui/AccessibleDialog.tsx` — focus-trapping, ARIA-wired dialog primitive.
- `apps/web/app/layout.tsx` — mounts `SkipLinks` and `#main-content` focus target.
- `apps/web/components/layout/Header.tsx` — `#main-navigation` landmark.
- `apps/web/app/globals.css` — focus-visible, reduced-motion, selection, chat-font/dyslexic tokens, CSP note.
- `apps/web/components/ThemeProvider.tsx` — light/dark theming.
- `apps/web/features/settings/sections/GeneralSection.tsx` — chat-font, theme, language controls.
- `apps/web/app/i18n/index.ts` + `locales/{en,es,hi}` — localization; `features/settings/components/LanguageSelector.tsx` — switcher.
- `apps/web/proxy.ts` — CSP `font-src` boundary for webfonts.

## Competitor notes

Claude, ChatGPT, and Codex ship broadly keyboard- and screen-reader-usable web apps with reduced-motion support and per-locale UI, but they are single-vendor, cloud-only assistants publishing limited formal conformance detail. AGI's deliberate divergence: (1) a **public, versioned accessibility statement** with named gaps and a P0 barrier-report path (`apps/web/app/accessibility/page.tsx`) rather than a static blurb; (2) accessibility applied uniformly across **per-surface trust modes** — Web being cloud-only, its a11y surface excludes the BYOK/Local affordances Desktop/CLI/VS Code must additionally make accessible (e.g., provider-fork consent), so shared primitives (`AccessibleDialog`, skip links) are reused, not re-implemented, per the shared-packages mandate; (3) accessibility is **not tier-gated** and reaches signed-out visitors, aligning with the local-first, no-lock-in stance. Competitor products are parity references only; AGI copies no branding or code.

## Acceptance / Definition of Done

Production-ready gate: core signed-out (marketing, pricing, sign-in) and signed-in (`/chat`, settings, billing) routes pass an automated axe/Lighthouse a11y audit with zero serious/critical violations in both themes; a manual NVDA + VoiceOver pass reaches and labels every control; keyboard-only sign-in → chat → settings works with a visible focus ring; `prefers-reduced-motion` and language-switch behaviors verified; OpenDyslexic and color-only-badge gaps fixed or tracked with owners.

- [ ] **Build**: `pnpm --filter @agiworkforce/web typecheck` and `pnpm --filter @agiworkforce/web test` pass, including `SkipLinks.test.tsx`.
- [ ] **Review**: axe/Lighthouse a11y run on core routes (light + dark) with no serious/critical findings; 200% zoom reflow verified.
- [ ] **Trust/scope**: no Local/BYOK affordance appears on Web; Managed-Cloud dialogs (model picker, paywall, sync) expose accessible names and state; `<html lang>` matches the active locale.

## Anti-patterns

- Do **not** add a Local or BYOK affordance to Web accessibility settings — Web is cloud-only; those modes live on Desktop/CLI/VS Code.
- Do **not** claim WCAG conformance or "shipped" a11y without a cited repo path; unbuilt items stay **🔭**.
- Do **not** use `outline: none` without a visible focus indicator, or convey state by color alone.
- Do **not** re-enable a webfont via a third-party CDN that the `font-src` CSP in `apps/web/proxy.ts` blocks — self-host under `apps/web/public/fonts/`.
- Do **not** invent locales, INR prices for Pro/Max, model IDs, routes, or env vars; model IDs come only from `packages/contracts/types/src/models.json`.
- Do **not** reference removed tiers ("Plus", `pro_plus`, "Hobby"), credit top-ups, `middleware.ts`, or Supabase.
- Do **not** re-implement dialog/skip-link primitives per page — reuse the shared components.
