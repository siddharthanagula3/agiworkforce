# Mobile Production Plan (Surface 2 of 3)

Status: Planned (execute after Website ships)
Owner: Founder + mobile lead
Last updated: 2026-06-28
Sequence: Website → **Mobile (this doc)** → Desktop
Companion: `11-execution-playbook.md`, `12-website-production-plan.md`, `03-code-reality-and-tech-debt.md`

Detailed plan to take **`apps/mobile` (Expo / React Native) to public-alpha → production**, tested with Xcode MCP tools per your note. Follows the loop protocol + IP rules in `11`.

---

## 0. How we test mobile

The repo already has the infra: **Expo + EAS** (`eas.json`, `app.config.js`), **Detox** e2e (`detox.config.js`), **Jest** unit (`jest.config.js`), a **screenshots pipeline** (`screenshots:ios`/`screenshots:android`), an **EAS signing runbook**, full **release scripts** (`release:ios:beta:submit`, `release:android:prod:submit`, …), and an **iOS Xcode workspace** (prebuild-generated at `apps/mobile/ios/AGIWorkforce.xcworkspace`; the former tracked root `ios/` was deleted 2026-07-16).

**Toolchain:**

- **Xcode MCP tools** (your preference) — build + boot the iOS simulator, install the app, drive flows, capture screenshots, read logs. Primary interactive verification for iOS.
- **Detox** — automated e2e on simulator/device for each launch-critical flow.
- **Jest** + existing `__tests__` — unit/behavior.
- **Existing mobile guardrails** — `check:mobile-hygiene`, `check:no-hex-mobile`, `check:tls-pins`.
- **Per-increment gate:** `pnpm --filter @agiworkforce/mobile typecheck` + targeted Jest + a Detox flow + an Xcode-MCP screenshot of the flow + relevant `check:*`.

---

## 1. Current state (audit-grounded)

~80% real; the **on-device LLM is genuinely strong** — a tier-1→2→3 native runtime ladder (system models → ExecuTorch → llama.rn) with real token streaming, fallback, thermal checks, and SHA-256-verified resumable model downloads. This is the hard part, done well.

**Blockers / gaps:**

- **R2 (launch blocker):** TLS pins are placeholders, `PINNING_ENFORCED=false` (`apps/mobile/lib/pinning.ts`).
- **R5:** vision is OCR-only (`src/features/image/services/vision.ts`); no on-device VL model; `NativeModules.AGIVisionOCR` source unconfirmed.
- **R6:** "60+ language translation" is en↔hi only (`services/translateService.ts`).
- **R7:** iOS Apple Foundation Models path is a stub (`ios/.../AGIFoundationModels.swift`, `isAvailable=false`).
- Mobile Settings "Skills"/"Plugins" dead-end; cloud features gated off by design (`lib/v1FeatureFlags.ts`); web mobile marketing page overclaims vs shipped scope.

**v1 scope (from source-of-truth):** small on-device Local LLM + public-alpha Cloud (open by default). **No BYOK on mobile v1.** Don't make heavy local PDF/PPTX/DOCX generation the first battle.

**Production-ready (mobile):** on-device chat works; cloud gated correctly; TLS pins enforced; copy matches shipped scope; crash-free > 99.5%; Detox suite green; store assets + privacy labels complete; App Store + Play review passed.

---

## 2. Increment backlog (run in order after website ships)

| ID         | Goal                                                                                                                                   | Source/learn                                             | Acceptance & test                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **MOB-0**  | Readiness baseline: Jest + Detox run; Xcode-MCP build+run on iOS sim; walk on-device chat / settings / cloud-gate; green/red inventory | —                                                        | inventory produced; existing suites run                                                 |
| **MOB-1**  | **Launch blocker:** provision real SPKI TLS pins + enable enforcement                                                                  | `03` R2                                                  | `check:tls-pins` green; pinned host connects, bad cert fails closed (Detox + Xcode-MCP) |
| **MOB-2**  | Align app + web copy to shipped scope (vision=OCR, translation=en↔hi, Foundation Models stub) — relabel or hide                        | `03` R5/R6/R7                                            | claims-vs-parity check passes; no overclaim in UI                                       |
| **MOB-3**  | On-device LLM UX: model picker + "fits this device" + download/resume + first-token + thermal                                          | learn: `llama.rn`, odysseus cookbook (`llmfit`)          | first-token e2e on sim + device; download resumes                                       |
| **MOB-4**  | Cloud public-alpha path (open by default): sign-in, entitlement gate, cloud-chat sync only; Local stays fail-closed                    | `remoteChatGate.ts`; source-of-truth                     | entitled cloud send works; Local never auto-sends (Jest + Detox)                        |
| **MOB-5**  | Core chat completeness: attachments, streaming states, message actions, temporary chat (mobile-appropriate)                            | parity w/ web                                            | each flow Detox-covered                                                                 |
| **MOB-6**  | Mobile settings: real sections; implement or remove Skills/Plugins dead-ends                                                           | `03`                                                     | settings navigable; no dead-ends                                                        |
| **MOB-7**  | (Optional v1) vision beyond OCR                                                                                                        | learn: `supervision` + permissive VLM (not Ultralytics)  | image Q&A beyond OCR, or explicitly scoped to OCR for v1                                |
| **MOB-8**  | Production hardening: crash reporting, offline behavior, deep links, push notifications, accessibility                                 | —                                                        | crash-free instrumentation live; a11y audit                                             |
| **MOB-9**  | Store readiness: screenshots pipeline, privacy/data-safety labels, review notes (emphasize on-device privacy), age rating              | `screenshots:ios/android`                                | store listings complete; assets generated                                               |
| **MOB-10** | Beta: TestFlight + Play internal                                                                                                       | `release:ios:beta:submit`, `release:android:beta:submit` | builds submitted; review feedback resolved                                              |
| **MOB-11** | Public alpha release                                                                                                                   | `release:ios:prod:submit`, `release:android:prod:submit` | live on stores; smoke pass on real devices                                              |

---

## 3. Sequencing & exit criteria

Run MOB-0 → MOB-11. **Mobile is "done" when:** TLS pins enforced, on-device chat + cloud public-alpha work, copy matches shipped scope, Detox suite green, crash-free > 99.5% in beta, and both stores approve the public-alpha build. Then start **Desktop** (`14-desktop-production-plan.md`).

iOS leads (Xcode MCP testing is strongest there); Android follows each increment via `expo run:android` + Detox. TLS pins (MOB-1) and copy alignment (MOB-2) are non-negotiable pre-store gates.

Operating model is identical to `12` §4: I implement + verify in the working tree; you commit (sandbox can't land commits).
