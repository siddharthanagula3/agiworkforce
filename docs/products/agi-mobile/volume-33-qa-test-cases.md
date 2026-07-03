# AGI Mobile — Volume 33 — QA Test Cases

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-06-30

Authority: `AGENTS.md`, `apps/mobile/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, and the real harnesses under `apps/mobile/` — `detox.config.js`, `scripts/screenshots/specs/`, `.maestro/cloud-chat-smoke.yaml`, `scripts/wave0-smoke/`, `__tests__/` (incl. `__tests__/priority-level-1/security/`), `jest.config.js`, `package.json`, plus `services/remoteChatGate.ts`, `lib/egressGuard.ts`, `services/performanceMonitor.ts`, `lib/v1FeatureFlags.ts`, and `packages/types/src/models.json`.

## Overview & stance

This volume defines the QA test-case catalogue for AGI Mobile: what we assert, how, and at which gate. Mobile's two trust boundaries — **Local** (on-device LLM, free) and **Managed Cloud** (public alpha, real auth gate) — shape every layer. There is **no BYOK on mobile**; QA must therefore include negative assertions that no API-key affordance ever appears and that Local chats never silently egress to Cloud (`lib/egressGuard.ts`, `services/remoteChatGate.ts`). The governing principle, per the volume guidance: **launch-critical flows need screenshot/e2e proof on a real simulator, not just `typecheck`.** Typecheck and unit tests catch contract drift; only a booted simulator proves the app cold-launches, onboards, and sends. Simulator verification runs through **XcodeBuildMCP** (`build_run_sim`, `boot_sim`, `screenshot`, `snapshot_ui`, `tap`/`type_text`) for interactive checks and **Detox** (`detox.config.js`) for scripted device e2e; **Maestro** (`.maestro/`) provides testID-driven smoke that is immune to dev-overlay coordinate fights.

## Functional Testing

Cover every launch-critical flow end-to-end on a booted simulator: cold launch → onboarding → Local model download/inference → first message; sign-in (Clerk) → Cloud mode → send → streamed reply; mode toggle Local↔Cloud; image generation (cloud-backed); voice record-and-send; projects and search. Each flow has unit/integration coverage in `__tests__/` and an e2e or screenshot spec.

- 🟡 Built — Maestro cloud-send smoke asserts type→send→render (`.maestro/cloud-chat-smoke.yaml`); Detox specs `01`–`06` under `scripts/screenshots/specs/` script onboarding, first message, image-with-question, and voice. Gap: Detox is **not** in `devDependencies` (`detox.config.js` header), so these do not run in CI without a one-time `pnpm add -D detox@20` on a simulator host.
- ✅ Built — Jest functional suites across `apps/mobile/__tests__/` (e.g. `cloud-gate-public-alpha.test.ts`, `chatStore.test.ts`, `add-to-chat.test.tsx`) run via `pnpm --filter @agiworkforce/mobile test`.
- 🔭 Planned — a CI-gated simulator e2e lane (XcodeBuildMCP `build_run_sim` + screenshot diff) that blocks merge on launch-flow regressions.

## UI Testing

Assert layout, theming, the deliberately **simple new-chat home** (no suggestion/starter cards — product rule), composer behavior, tool-call/inline rendering, and that overlays never trap the composer. Use snapshot tests for structure and simulator screenshots for pixels.

- ✅ Built — Jest snapshot suites (`__tests__/__snapshots__/`, e.g. `chat-tab-greeting.snapshot.test.tsx`, `chat-list-artifact-fullscreen.snapshot.test.tsx`) and the Detox screenshot pipeline (`scripts/screenshots/pipeline.ts`, `pnpm screenshots:ios|android`).
- 🟡 Built — the screenshot harness is explicitly local visual QA, **not** App Store evidence (`scripts/screenshots/README.md`); store captures still need the real device matrix + founder approval.
- 🔭 Planned — automated visual-regression diffing (golden images per device class) wired to the screenshot pipeline.

## Performance Testing

Budget two regimes: device-bound Local inference and network-bound Cloud streaming. Assert cold/warm start, transcript scroll under stream, time-to-first-token, and tokens/sec.

- ✅ Built — runtime capture of tok/s, TTFT, peak memory, and thermal state with a benchmark runner (`services/performanceMonitor.ts`); incremental SSE rendering with a TTFT timeout guard cancelled on first token (`services/streaming.ts`); recycling transcript (`src/features/chat/components/MessageList.tsx`).
- 🔭 Planned — asserted CI budgets (60 fps no-frame-drop during stream+scroll; cold-start span thresholds; real `peakMemoryMB`, never `0`). No frame-drop or start-time assertion runs in CI today.

## Security Testing

Mobile's trust boundaries are the highest-value test target. Assert: no Local→Cloud leakage, fail-closed egress, TLS pinning, on-device encryption at rest, and the **absence** of any BYOK key entry.

- ✅ Built — dedicated security suites in `__tests__/priority-level-1/security/` (`auth-and-authz.test.ts`, `data-isolation.test.ts`, `privacy-boundary.test.ts`, `provider-routing.test.ts`); `remoteChatGate` fails closed when `cloudChat` is off (`services/remoteChatGate.ts`); fail-closed egress chokepoint (`lib/egressGuard.ts`) over TLS-pinned transport (`services/secureFetch.ts`, verified by `pnpm check:tls-pins` → `scripts/check-tls-pins.mjs`).
- ✅ Built — encrypted storage paths (SQLCipher/MMKV via `lib/mmkv.ts`, `lib/secureStorage.ts`) and biometric gating (`__tests__/biometric-gate.test.tsx`).
- 🔭 Planned — a contract test asserting `FEATURES.byokKeys` stays `false` and no key-entry component ships, plus an egress-allowlist fuzz against `lib/egressGuard.ts`.

## Accessibility Testing

Every interactive element must expose an `accessibilityLabel`/`testID`, support Dynamic Type, meet contrast, and be reachable with VoiceOver/TalkBack. The Maestro smoke already drives the composer by label (`Send message`) and testID (`chat.composer.input`), which doubles as proof those affordances are labeled.

- 🟡 Built — label/testID coverage is enforced indirectly by Maestro/Detox selectors that fail when labels go missing; no standalone a11y assertion suite exists.
- 🔭 Planned — automated a11y audits (Dynamic Type scaling at largest sizes, contrast checks, VoiceOver focus order) via XcodeBuildMCP `snapshot_ui` accessibility-tree inspection and a TalkBack pass on Android.

## Cross-platform Testing — iOS + Android

Both platforms ship from one Expo/RN codebase; QA must run the matrix on both. Detox defines `ios.sim` (iPhone 17 Pro) and `android.emu` (`pixel_8_api_34`) targets (`detox.config.js`); the founder device runbook covers real-hardware cold launch + Local inference on iPhone and Pixel (`scripts/wave0-smoke/ios-smoke.sh`, `android-smoke.sh`).

- 🟡 Built — Detox configurations and Wave-0 smoke scripts exist for both platforms; execution is manual/host-gated, not CI-automated.
- 🔭 Planned — parity matrix asserted per platform (keyboard/IME, safe-area, back-gesture, notification permission, model-download Wi-Fi gating) in an automated dual-target lane.

## Regression Testing

Guard against re-breaking shipped fixes (login-loop, forced sign-in wall, LogBox-over-composer, cloud→sign-in routing). Snapshot suites lock UI structure; the security suite locks trust boundaries; flow specs lock launch paths.

- ✅ Built — Jest snapshot + behavior suites in `__tests__/` plus the inline tool-call UI rubric fixtures (recent commit `f56a56868`); run on every change via `pnpm --filter @agiworkforce/mobile test`.
- 🔭 Planned — a tagged regression pack (one case per fixed launch-critical bug) that runs on simulator before each release tag.

## Repository map

- `apps/mobile/detox.config.js` — Detox e2e targets (iOS sim + Android emu); binary host-gated.
- `apps/mobile/scripts/screenshots/` — Detox screenshot pipeline + specs `01`–`06`.
- `apps/mobile/.maestro/cloud-chat-smoke.yaml` — testID/label-driven cloud-send smoke.
- `apps/mobile/scripts/wave0-smoke/` — real-device founder smoke runbooks (iOS + Android).
- `apps/mobile/__tests__/` — Jest unit/integration/snapshot suites; `__tests__/priority-level-1/security/` — trust-boundary suites.
- `apps/mobile/jest.config.js`, `jest.setup.js`, `package.json` — test/typecheck/screenshot scripts.
- `apps/mobile/services/remoteChatGate.ts`, `lib/egressGuard.ts`, `services/secureFetch.ts`, `scripts/check-tls-pins.mjs` — gate + egress + pinning under test.
- `apps/mobile/services/performanceMonitor.ts`, `services/streaming.ts`, `src/features/chat/components/MessageList.tsx` — performance capture + render under test.
- `apps/mobile/lib/v1FeatureFlags.ts` — feature gates QA reads (`byokKeys: false`, `cloudChat: true`).
- `packages/types/src/models.json` — model metadata SSOT; tests must read IDs here, never hardcode.

## Competitor notes

ChatGPT and Claude mobile are thin cloud clients, so their QA is one regime: network, streaming smoothness, and app start. AGI's deliberate divergence forces a broader matrix: a real **on-device Local** tier to test for thermal/RAM behavior and offline inference, **multi-provider** Cloud streaming sourced from `models.json`, **per-surface trust** with fail-closed egress, and **no BYOK on mobile** — which adds negative test cases (no key entry, no Local→Cloud leak) those products never need. The cost is a two-regime, dual-platform matrix; the payoff is provable privacy and a Local path competitors do not ship.

## Acceptance / Definition of Done

Production-ready means launch-critical flows are proven on a booted simulator with screenshot/e2e evidence, trust boundaries have passing negative tests, and no claim rests on build success alone.

- [ ] Build: `pnpm --filter @agiworkforce/mobile typecheck` and `test` pass; the cold-launch → onboarding → first-message flow is verified on a simulator via XcodeBuildMCP `build_run_sim` + `screenshot` (or Detox spec), with the artifact attached.
- [ ] Trust: security suites under `__tests__/priority-level-1/security/` pass; no BYOK affordance appears on any screen; Local never auto-routes to Cloud; `remoteChatGate` fails closed when `cloudChat` is off.
- [ ] Security: TLS pinning holds (`pnpm check:tls-pins`); `lib/egressGuard.ts` refuses non-allowlisted egress; encrypted-at-rest storage and biometric gate pass on both iOS and Android targets.

## Anti-patterns

- Marking a launch flow "tested" from `typecheck`/unit pass alone with no simulator screenshot or e2e run.
- Adding a BYOK / API-key field to satisfy a test fixture — Mobile has no BYOK, ever.
- Faking a green e2e by stubbing the network so a dead Cloud backend still "passes," or asserting a "streaming"/"connected" state that no longer reflects reality.
- Routing Local chats/files to Cloud to make a test simpler, or making the phone the first heavy local PDF/PPTX/DOCX/image-gen surface (image gen is cloud-backed).
- Hardcoding or inventing model IDs in tests instead of reading `packages/types/src/models.json`.
- Referencing Supabase (removed — Clerk + Neon + Stripe only) or reintroducing "Plus"/`pro_plus`/"Hobby"; inventing INR prices for Pro/Max.
- Treating the local screenshot harness as App Store submission evidence (`scripts/screenshots/README.md`) — store release still needs the real device matrix + founder approval.
