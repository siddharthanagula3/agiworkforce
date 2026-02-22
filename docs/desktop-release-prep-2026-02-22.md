# Desktop Release Prep Notes (2026-02-22)

## Scope

- Build the desktop application (`apps/desktop`) for release packaging
- Record current release configuration and blockers/warnings
- Keep website homepage copy aligned with implemented features only

## Desktop Version

- `apps/desktop/package.json`: `1.1.2`
- `apps/desktop/src-tauri/tauri.conf.json`: `1.1.2`
- `apps/desktop/src-tauri/Cargo.toml`: `1.1.2`

## Build Command

```bash
pnpm --filter @agiworkforce/desktop build
```

## Build Status (local run on 2026-02-22)

- Vite production build completed successfully.
- `tauri build` started and entered Rust compilation (`Compiling agiworkforce-desktop v1.1.2`).
- Observed Vite warnings about dynamic imports also being statically imported (chunking/optimization warnings, not immediate build failures).
- Observed Vite chunk size warnings for very large bundles (Monaco/markdown/vendor chunks).
- Final native artifact completion status should be confirmed after Rust compilation finishes on the build machine.

## Release-Relevant Configuration Verified

- Tauri bundle is enabled (`bundle.active: true`) with `targets: "all"`.
- Updater plugin is configured with website endpoint:
  - `https://www.agiworkforce.com/api/releases/{{target}}/{{current_version}}`
- Updater public key is present in `tauri.conf.json`.
- macOS signing identity and provider short name are configured in `tauri.conf.json`.
- Windows timestamp URL and signing bundle settings are present.
- Website includes desktop release/update routes:
  - `apps/web/app/api/releases/latest/[platform]/route.ts`
  - `apps/web/app/api/releases/[target]/[version]/route.ts`
  - `apps/web/app/api/releases/check/route.ts`

## Release Risks / Follow-up

- Rust compilation time is long due to a large native dependency graph; run release builds on a dedicated CI runner or release machine with warmed Cargo cache.
- Large frontend chunks increase desktop app bundle size and startup/download footprint; follow up on code-splitting (Monaco/diagram/markdown vendors).
- Confirm signing credentials and notarization environment variables/secrets are available on the release machine before publishing macOS builds.
- Confirm platform-specific artifacts (`.dmg`, `.msi`/NSIS, `.AppImage`) and signature files are generated and uploaded before enabling update rollout.

## Website Homepage Changes (this prep)

- Replaced vague/marketing-only claims with implementation-backed statements.
- Removed hard claims that were not verified in code (performance multipliers, 100% guarantees, user counts).
- Kept references to features that are visible in the repo (desktop app, web app, release routes, multi-provider support, undo API, browser automation tooling).

## Suggested Validation Before Release Tag

```bash
pnpm --filter @agiworkforce/desktop typecheck
pnpm --filter @agiworkforce/desktop test
pnpm --filter @agiworkforce/desktop build
pnpm --filter @agiworkforce/web lint
```
