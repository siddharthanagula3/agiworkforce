# Part 1 — Environment, Build, Installation, Launch & First-Run UX (Phases 1–5)

Status: Active · Part 1 of the AGI Mobile XcodeBuildMCP QA Playbook
Scope: `apps/mobile` on iOS Simulator · Phases 1–5
Read first: `./README.md` (the spine — 44-tool map, global conventions, the 20-point per-screen verification template, and bug classification). This part assumes you have it open.
Parity bar: ChatGPT iOS + Claude iOS — **parity is behavior, workflow, layout convention, and a11y quality only. Never copy proprietary assets, marketing text, icons, or branding.**

> **How to read this part.** Each phase has a fixed shape: **Goal → Exact tool sequence → Expected UI/output → Acceptance criteria → Parity notes → Bug-classification examples → Recovery if it fails → checklist.** Phases 1–4 are bring-up (you cannot test UI until the app builds, installs, and launches without crashing). Phase 5 is the first real UX surface and applies the full 20-point template to every screen the user sees before they reach chat. Do not skip ahead: a green build that crashes on launch, or a launch that silently lands past the age-gate, are both reportable defects that only this ordering catches.

---

## Ground truth for this run (verify before citing — do not hardcode from memory)

These values are read from the repo as of this writing. **Confirm each at runtime with the discovery tools in Phase 1** rather than trusting this table — config drifts.

| Fact                               | Value (verify)                                                                                                                                                        | Source                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| App display name                   | `AGI Workforce`                                                                                                                                                       | `apps/mobile/app.config.js` → `name`                   |
| Expo slug                          | `agi-workforce`                                                                                                                                                       | `app.config.js` → `slug`                               |
| App version                        | `1.2.0`                                                                                                                                                               | `app.config.js` → `version`                            |
| iOS bundle identifier              | `com.agiworkforce.app`                                                                                                                                                | `app.config.js` → `ios.bundleIdentifier`               |
| URL scheme                         | `agiworkforce`                                                                                                                                                        | `app.config.js` → `scheme`                             |
| iOS build number                   | `1`                                                                                                                                                                   | `app.config.js` → `ios.buildNumber`                    |
| Expo SDK / arch                    | SDK 55, **New Architecture is the default** (no `newArchEnabled` flag)                                                                                                | `app.config.js` header comment                         |
| Router                             | `expo-router`, typed routes enabled                                                                                                                                   | `app.config.js` → `experiments.typedRoutes`, `plugins` |
| `userInterfaceStyle`               | `automatic` (follows OS light/dark)                                                                                                                                   | `app.config.js`                                        |
| Orientation                        | `portrait` (phone)                                                                                                                                                    | `app.config.js` → `orientation`                        |
| EAS dev profile                    | `development`: `ios.simulator: true`, `ios.buildConfiguration: Debug`, `developmentClient: true`                                                                      | `apps/mobile/eas.json`                                 |
| EAS sim-release profile            | `preview-simulator`: `ios.simulator: true`, `ios.buildConfiguration: Release`                                                                                         | `eas.json`                                             |
| Apple team id                      | `D2PR62RLT4`                                                                                                                                                          | `eas.json` → `submit.*.ios.appleTeamId`                |
| Splash background                  | `#0f0f0f` (dark)                                                                                                                                                      | `app.config.js` → `splash.backgroundColor`             |
| Native deps requiring a real build | Clerk (`@clerk/expo`), `expo-sqlite` with **SQLCipher**, `llama.rn`, `expo-speech-recognition`, `expo-camera`, custom Swift modules via `withAGINativeModulesIOS.cjs` | `app.config.js` → `plugins`                            |

> **Why "native build" matters for QA.** The app links SQLCipher, llama.rn, Clerk native, and bespoke Swift modules (`AGIFoundationModels`, `AGITranslate`, `AGIVisionOCR`, `AGIAppIntents`). **Expo Go cannot run this app.** Every phase below assumes a _dev client_ or compiled `.app` produced by `xcodebuild`, never Expo Go. If a teammate hands you an "it runs in Expo Go" report, that is a false signal — treat it as a documentation bug and ignore it.

### Trust boundary reminder (carry this through every phase)

Local, BYOK, and Managed Cloud are separate trust boundaries. In Part 1 the only surface that should ever touch the network is the **onboarding model download** (HuggingFace / catalog URL for the on-device model) and **Clerk** _if and only if_ the user explicitly chooses Cloud sign-in. **The age-gate, onboarding hero, device-tier screen, and Local chat must produce zero account/inference network egress.** Any Local-mode egress observed during launch or first-run is an automatic **Critical** (see README → Bug classification). You will instrument this directly in Part 4; in Part 1 you watch for obvious tells (unexpected spinners labeled "signing in", network errors in logs on a screen that should be offline).

---

# Phase 1 — Environment setup & session configuration

### Goal

Discover the Xcode project/workspace, enumerate schemes and build settings, pick a canonical simulator (**iPhone 16 Pro on the latest installed iOS**), boot and reveal it, and persist a session default profile so every later phase (build, install, launch, automate) targets the identical workspace + scheme + simulator without repeating arguments. A wrong or drifting target here silently invalidates every downstream result.

### Pre-flight (host, before any tool)

- The native iOS project must exist. This is an Expo _prebuild_ project: if `apps/mobile/ios/*.xcworkspace` is absent, it has not been generated. Generate it on the host (`pnpm --filter @agiworkforce/mobile prebuild` / `expo prebuild -p ios`, per `docs/agent-context/commands.json`) **before** running discovery. XcodeBuildMCP discovers what is on disk; it does not prebuild.
- A CocoaPods install must have run (the EAS cache lists `ios/Pods`). If `ios/Pods` is missing, `build_sim` will fail at the pod/module resolution stage — pre-empt by confirming Pods exist.

### Exact tool sequence

1. `discover_projs` — scan `apps/mobile` (and repo root if scoped) for `.xcworkspace` / `.xcodeproj`.
2. `list_schemes` — list schemes for the discovered workspace.
3. `show_build_settings` — dump build settings for the chosen scheme (Debug).
4. `list_sims` — enumerate installed simulators + runtimes; choose **iPhone 16 Pro / latest iOS**.
5. `boot_sim` — boot the chosen simulator UDID.
6. `open_sim` — open the Simulator.app window so screenshots/videos render.
7. `session_set_defaults` — persist `{ workspace, scheme, simulator }`.
8. `session_show_defaults` — read back and confirm what was stored.
9. `session_use_defaults_profile` — (if a named profile is supported in your toolset) save/select a reusable named profile so a regression re-run restores the same target in one call.

### Expected UI/output

- **`discover_projs`**: returns at least one workspace. Expect a path ending `apps/mobile/ios/<name>.xcworkspace` (the CocoaPods workspace) and an inner `.xcodeproj`. The project name is derived from the Expo `name`/`slug` at prebuild; **do not assume it — read it from the tool output.** If only a bare `.xcodeproj` (no `.xcworkspace`) is returned, pods were not installed → fix before continuing.
- **`list_schemes`**: returns the app scheme (typically the project name). There may be additional pod/expo schemes — pick the **app target scheme**, not a Pods aggregate. Record the exact string.
- **`show_build_settings`**: a large key/value dump. Confirm the load-bearing keys:
  - `PRODUCT_BUNDLE_IDENTIFIER` = `com.agiworkforce.app` (matches `app.config.js`; a mismatch means stale prebuild → regenerate).
  - `SDKROOT` references an iphonesimulator SDK when you ask for the simulator destination.
  - `MARKETING_VERSION` ≈ `1.2.0` and `CURRENT_PROJECT_VERSION` ≈ `1`.
  - Swift/ObjC bridging is present (the custom native modules compile into the target).
- **`list_sims`**: a device list with names, runtimes, UDIDs, and boot state. Choose **iPhone 16 Pro** on the highest available iOS runtime. Record the **UDID** (names are ambiguous across runtimes; UDID is not).
- **`boot_sim`**: state transitions `Shutdown → Booting → Booted`. Re-running on an already-booted device is a no-op (acceptable).
- **`open_sim`**: the Simulator window appears, showing the iOS home screen / lock screen for that device.
- **`session_set_defaults`** then **`session_show_defaults`**: the readback echoes exactly the workspace path, scheme string, and simulator UDID you set. **The confirmation is the readback, not the set call's return.**

### Acceptance criteria

- [ ] A `.xcworkspace` is discovered (not just a `.xcodeproj`).
- [ ] The chosen scheme is the app target scheme, recorded verbatim.
- [ ] `PRODUCT_BUNDLE_IDENTIFIER` from build settings equals `com.agiworkforce.app`.
- [ ] Selected simulator is iPhone 16 Pro on the latest installed iOS; UDID recorded.
- [ ] Simulator reaches `Booted` and the window is visible.
- [ ] `session_show_defaults` echoes the exact `{workspace, scheme, simulator}` you set.
- [ ] Trust boundary: nothing here required a login or network; if any tool prompted for credentials, stop and investigate.

### Parity notes (ChatGPT / Claude first-run — environment context only)

There is no user-facing parity at the environment layer. The relevant parity stance set _here_ is operational: ChatGPT iOS and Claude iOS are both single-target, portrait-first iPhone apps with a dark default. Confirm our target matches that posture — portrait orientation, dark splash (`#0f0f0f`), automatic appearance — so later visual parity checks are apples-to-apples. If discovery reveals an unexpected landscape/iPad-only target or a light splash, that is a Medium parity-of-posture issue worth noting now.

### Bug-classification examples

- **Critical:** `discover_projs` finds a workspace whose `PRODUCT_BUNDLE_IDENTIFIER` differs from `com.agiworkforce.app` and points at a different app → you would be QA-ing the wrong binary; halt.
- **High:** No `.xcworkspace` (pods never installed) → build will fail; blocks the entire run until fixed.
- **Medium:** `list_schemes` returns multiple plausible app schemes with no obvious canonical one → ambiguous target; pick by build settings and document the choice.
- **Low:** `MARKETING_VERSION` reads `1.1.x` while `app.config.js` says `1.2.0` → stale prebuild; regenerate, note the drift.

### Recovery if it fails

- **No projects found:** the native project was never generated. Run the prebuild on the host, then re-run `discover_projs`. XcodeBuildMCP does not prebuild for you.
- **Workspace but pods missing / module-not-found surfaced later:** run `pod install` in `ios/` on the host (or re-run prebuild), then re-discover.
- **Simulator not in `list_sims`:** the runtime/device isn't installed. Install the iOS runtime via Xcode, or fall back to the newest available iPhone Pro device and **record the deviation** (model/runtime affect safe-area and Dynamic Type checks in Phase 5 and Part 3).
- **`boot_sim` hangs in `Booting`:** shut the device down and re-boot; if it persists, erase the simulator content and re-boot (note: erasing wipes installed apps — you reinstall in Phase 3 anyway).
- **`session_show_defaults` doesn't match what you set:** re-issue `session_set_defaults` with explicit absolute workspace path + UDID, then re-read. Never proceed on an unconfirmed default.

### Checklist

- [ ] `discover_projs` run; workspace path recorded.
- [ ] `list_schemes` run; app scheme recorded.
- [ ] `show_build_settings` run; bundle id, SDK, version keys verified.
- [ ] `list_sims` run; iPhone 16 Pro / latest iOS UDID recorded.
- [ ] `boot_sim` → `Booted`.
- [ ] `open_sim` → window visible.
- [ ] `session_set_defaults` set `{workspace, scheme, simulator}`.
- [ ] `session_show_defaults` confirms the stored defaults.
- [ ] `session_use_defaults_profile` saved/selected a reusable profile (if supported).
- [ ] No login/network was triggered during discovery.

---

# Phase 2 — Build verification

### Goal

Produce a clean Debug build of the app for the booted simulator, correctly interpret success vs. failure, prove the build is reproducible via clean + rebuild, recognize the common Expo / React-Native-on-iOS failure signatures and what each means, and capture the app bundle identifier the rest of the run keys off. A build that "succeeds with warnings" still needs its warnings triaged — silent warning suppression is a known anti-pattern (see README).

### Exact tool sequence

1. `build_sim` — build the configured scheme for the booted simulator in **Debug** (uses the session defaults from Phase 1; pass an explicit destination/UDID if your toolset requires it).
2. On **success** → `get_app_bundle_id` — read the built product's bundle id (feeds Phases 3–4 install/launch/stop).
3. To prove reproducibility → `clean`, then `build_sim` again — confirm a from-scratch build is green and deterministic.
4. On **failure** → capture the full error block, classify with the table below, and jump to **Part 4 (LLDB / log triage)** for any failure that isn't an obvious config fix.

> Use `build_sim` (build only) here, not `build_run_sim`. Phases 3 and 4 deliberately exercise **install** and **launch** as _separate, independently-verifiable_ steps so a failure is localized to compile vs. install vs. launch. Collapsing them hides where a regression actually lives.

### Expected UI/output

- **`build_sim` success:** a terminating `** BUILD SUCCEEDED **` (or the tool's structured success), a path to the `.app` product in `DerivedData/.../Build/Products/Debug-iphonesimulator/`, and a warning count. **Record the warning count** — a sudden jump vs. the last regression run is itself a finding.
- **`get_app_bundle_id`:** returns `com.agiworkforce.app`. If it differs from Phase 1 build settings, the wrong product was built — stop.
- **`clean` + rebuild:** second build is also green; product path is stable. First clean build is slower (no incremental cache) — expected, not a defect.
- **`build_sim` failure:** a non-zero result with a compiler/linker/codegen error region. The _last_ error in the log is usually the real cause; earlier lines are often cascades.

### Acceptance criteria

- [ ] Debug `build_sim` ends in BUILD SUCCEEDED with a `.app` product path.
- [ ] `get_app_bundle_id` returns `com.agiworkforce.app`.
- [ ] `clean` + rebuild is also green (reproducible).
- [ ] Warning count recorded; no _new_ error-adjacent warnings vs. baseline (e.g., no "will be removed", no duplicate-symbol warnings) — or each is triaged.
- [ ] Build produced a **simulator** product (`*-iphonesimulator`), not a device archive.

### Common Expo/RN + iOS build failures — signature → meaning → action

| Signature in log                                                          | Likely meaning                                                   | First action                                                                                                         |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `No such module 'ExpoModulesCore'` / `'<PodName>'`                        | Pods not installed or out of sync with the lockfile              | `pod install` in `ios/` (or re-prebuild), rebuild                                                                    |
| `Sandbox: ... deny file-read-data ... .xcconfig` / "rsync"/sandbox errors | Xcode user-script sandboxing vs. RN/Expo build scripts           | Disable `ENABLE_USER_SCRIPT_SANDBOXING` for the target, or apply the project's documented workaround; rebuild        |
| `Multiple commands produce ...`                                           | Duplicate resource/output (often a re-prebuild left stale files) | Clean, delete stale `ios/` if generated, re-prebuild, rebuild                                                        |
| `Undefined symbols for architecture arm64` / `ld: symbol(s) not found`    | A native module (Swift bridge, llama.rn, SQLCipher) didn't link  | Confirm the config plugin ran (`withAGINativeModulesIOS.cjs`), pods include the dep, rebuild; if persistent → Part 4 |
| `Command PhaseScriptExecution failed` (Hermes/`react-native-xcode.sh`)    | JS bundling / Hermes compile failed                              | Read the inner script output; usually a Metro/JS error — fix JS, rebuild                                             |
| `module map file '...modulemap' not found` (Google/Clerk pods)            | Static-linked pods need modular headers                          | Confirm `withClerkModularHeaders.cjs` applied; re-prebuild + `pod install`                                           |
| `SQLCipher`/`sqlite3` symbol or header errors                             | `expo-sqlite` not linked against the SQLCipher variant           | Confirm `['expo-sqlite', { useSQLCipher: true }]` in config and that a **native rebuild** (not JS-only) was done     |
| `CompileSwift ... AGIFoundationModels/AGITranslate/...` errors            | Bespoke Swift module source failed to compile                    | Open the cited Swift file; fix; rebuild. Crash-class issues → Part 4                                                 |
| Code-signing errors while targeting **simulator**                         | A device build slipped in                                        | Re-target the simulator destination; simulator builds don't sign                                                     |

> **Escalation pointer.** Any build failure that is not one of the config-class rows above (i.e., a genuine compile/link/codegen crash you can't resolve by re-syncing pods/plugins) is triaged in **Part 4 → Phase 21 (debugging / LLDB / log triage)**. Capture the full failing log verbatim and carry it there.

### Parity notes (ChatGPT / Claude first-run — build/runtime posture)

No user-facing parity at build time. The parity-relevant fact to _confirm_ is runtime posture: ChatGPT/Claude ship Hermes-class JS engines with fast cold starts. Our Debug build is intentionally slower (dev bundling, no Hermes optimization in some configs) — **do not measure launch performance against a Debug build.** Note that performance/jank parity (Part 3, Part 4) is judged on a **Release** simulator build (`preview-simulator`), built the same way via `build_sim` with the Release config.

### Bug-classification examples

- **Critical:** Build succeeds but `get_app_bundle_id` ≠ `com.agiworkforce.app` → wrong product; everything after is invalid.
- **High:** Build fails on a native link error (llama.rn / SQLCipher / Swift bridge) → blocks the run; triage in Part 4.
- **Medium:** Build succeeds but emits new deprecation/duplicate-symbol warnings vs. baseline → tech-debt signal; record.
- **Low:** First clean build is slow → expected; not a defect.

### Recovery if it fails

- **Config-class failure (table above):** apply the row's first action, then `clean` + `build_sim`.
- **Non-deterministic (passes, then clean build fails):** a generated file or cache is masking a real break — fix the root cause; a build that only works incrementally is a reportable High.
- **Unresolvable native error:** stop feature testing, hand the full log to **Part 4 Phase 21**, and record a build-blocked entry in the end-of-run report (do not mark downstream phases PASS — they were never reached).

### Checklist

- [ ] `build_sim` (Debug) run; result captured.
- [ ] Result interpreted (success path or classified failure).
- [ ] `get_app_bundle_id` = `com.agiworkforce.app`.
- [ ] `clean` then `build_sim` re-run; reproducible green.
- [ ] Warning count recorded vs. baseline.
- [ ] Any failure mapped to the signature table; non-config failures routed to Part 4.

---

# Phase 3 — Installation

### Goal

Install the freshly-built `.app` onto the booted simulator, locate the installed container, verify the install actually took, and establish a repeatable **clean-state reinstall** procedure so first-run flows (Phase 5) can be tested deterministically — the age-gate and onboarding only appear when MMKV has no prior `onboarding-done` / `age-gate:v1` state.

### Exact tool sequence

1. `install_app_sim` — install the Debug `.app` (path from Phase 2) onto the booted simulator UDID.
2. `get_sim_app_path` — resolve the installed app's on-simulator path / container for `com.agiworkforce.app`.
3. Verify install: `launch_app_sim` is Phase 4, so here confirm presence via `get_sim_app_path` returning a valid path, and (optionally) `screenshot` the home screen to see the app icon.
4. **Clean-state reinstall procedure** (run when you need a pristine first-run):
   a. `stop_app_sim` (if running).
   b. Uninstall the app from the simulator (so its data container — MMKV, SQLCipher DB, SecureStore — is discarded), **or** erase the simulator if a full factory state is required.
   c. `install_app_sim` again.
   d. Re-run `get_sim_app_path` to confirm a fresh container.

### Expected UI/output

- **`install_app_sim`:** success result; no error. The app icon appears on the simulator home screen ("AGI Workforce", icon from `./assets/icon.png`).
- **`get_sim_app_path`:** returns an absolute path under the simulator's `data/Containers/Bundle/Application/<UUID>/<App>.app` (bundle) and/or the data container. A valid path = installed.
- **Clean reinstall:** after uninstall, `get_sim_app_path` should fail/empty _before_ reinstall (proving the old install is gone), then return a path after reinstall.

### Acceptance criteria

- [ ] `install_app_sim` succeeds without error.
- [ ] App icon "AGI Workforce" is visible on the simulator home screen.
- [ ] `get_sim_app_path` returns a valid bundle path for `com.agiworkforce.app`.
- [ ] The documented clean-state reinstall produces a fresh container (no carryover MMKV/onboarding state) — confirmed by the next launch starting at the **age-gate** (Phase 4/5), not chat.
- [ ] No login/network needed to install.

### Parity notes (ChatGPT / Claude first-run)

Install is OS-mediated; no app-specific parity. The parity-relevant downstream fact to set up here: ChatGPT and Claude both present a _guided_ first run on a clean install (no silent drop into a logged-in chat). By guaranteeing a clean container, you ensure Phase 5 actually exercises our guided first run (age-gate → onboarding → local chat) rather than a returning-user fast path — which is exactly the comparison surface.

### Bug-classification examples

- **High:** `install_app_sim` fails with an architecture/`CFBundleIdentifier` mismatch → wrong/corrupt product; rebuild (Phase 2).
- **Medium:** Install succeeds but `get_sim_app_path` errors → the bundle id passed doesn't match the installed app; re-confirm bundle id.
- **Low:** App icon renders as a default/placeholder glyph → asset pipeline issue (icon not bundled); cosmetic-to-low, record.

### Recovery if it fails

- **Install rejected (incompatible binary):** confirm Phase 2 produced an `*-iphonesimulator` product (not device), rebuild, reinstall.
- **Stale state defeats first-run testing:** the app launches straight into chat on what should be a clean install → the uninstall didn't clear the data container; **erase the simulator**, reinstall, and re-verify the age-gate appears.
- **`get_sim_app_path` empty after a "successful" install:** simulator/runtime hiccup — re-boot the simulator (Phase 1), reinstall.

### Checklist

- [ ] `install_app_sim` run; success.
- [ ] App icon visible (home-screen `screenshot` optional).
- [ ] `get_sim_app_path` returns a valid path.
- [ ] Clean-state reinstall procedure executed and verified (fresh container).
- [ ] First launch after clean reinstall lands on the **age-gate** (proves no carryover state).

---

# Phase 4 — Launch validation

### Goal

Cold-launch the app, wait deterministically for the first real screen, capture a baseline screenshot, validate a warm-launch (relaunch) path, detect crash-on-launch and recover, and record a short video of the very first launch. This phase proves the app _starts_; it does not yet judge screen UX (that is Phase 5). The first screen on a clean install must be the **age-gate** — landing anywhere else (especially chat, or a Cloud sign-in) is a defect.

### What "first screen" must be (grounded in `app/_layout.tsx`)

`RootLayout` shows a splash/`ActivityIndicator` while MMKV encryption init, auth init, and the biometric-flag hydration complete, then runs an auth/onboarding guard. On a clean install with no `onboarding-done` flag:

- It routes to `/(public)/age-gate` **first** (age-gate precedes onboarding by policy), regardless of Clerk sign-in state.
- **Local Mode never forces sign-in** — the guard explicitly routes local-first; Cloud (Clerk) sign-in is optional and reached on demand. So a cold launch must **not** land on a login wall.

So: **clean cold launch → brief splash/spinner → `age-gate-root`.** Anything else is reportable.

### Exact tool sequence (cold launch)

1. `record_sim_video` — start recording around the first launch (name `p4-launch-cold`).
2. `launch_app_sim` — cold-launch `com.agiworkforce.app` on the booted simulator.
3. `wait_for_ui` — wait for the first screen's anchor element: `age-gate-root` (clean install) — **wait, never sleep**.
4. `screenshot` — capture the launch baseline (`p4-age-gate-baseline`).
5. `snapshot_ui` — capture the runtime hierarchy for the first screen (feeds Phase 5).
6. Stop `record_sim_video`; save `p4-launch-cold`.

### Exact tool sequence (warm launch / relaunch)

7. `stop_app_sim` — terminate the running app.
8. `launch_app_sim` — relaunch.
9. `wait_for_ui` — wait for the expected post-restart anchor:
   - If first-run was **not** completed, expect `age-gate-root` again (state persists only after completion).
   - If first-run **was** completed earlier in the run, expect the app/chat surface (returning-user fast path).
10. `screenshot` — `p4-warm-launch`.

### Crash-on-launch detection + recovery

- **Detect:** after `launch_app_sim`, `wait_for_ui` for `age-gate-root` **times out**, and a `screenshot` shows the home screen (app exited) or a black frame. That is a crash-on-launch.
- **Confirm & diagnose:** attach the debugger and re-launch to capture the crash: `debug_attach_sim` → `launch_app_sim` → on crash `debug_stack` + `debug_variables` (full procedure in **Part 4 Phase 21**). Also pull the simulator crash log.
- **Common first-launch crash causes here:** MMKV encryption init failure, SQLCipher key ceremony failure (if `useSQLCipher` wasn't actually linked — see Phase 2), or a native module that built but fails to initialize. A crash-on-launch is an automatic **Critical**.

### Expected UI/output

- **Cold launch:** dark splash (`#0f0f0f`) → teal `ActivityIndicator` (brief) → `age-gate-root` visible.
- **`wait_for_ui`:** resolves on `age-gate-root` within a sane timeout (low single-digit seconds for a Debug build; do not assert hard perf numbers on Debug).
- **Baseline `screenshot`:** the age-gate screen (shield icon, "Your age" title, age input, disabled "Continue").
- **Warm launch:** same first screen (uncompleted first-run) or the returning-user surface; no crash, no double-splash fl/icker loop.
- **`record_sim_video`:** a playable clip of splash → first screen.

### Acceptance criteria

- [ ] Cold launch reaches `age-gate-root` (clean install) — **not** chat, **not** a forced login.
- [ ] `wait_for_ui` resolved deterministically (no fixed sleeps used).
- [ ] Baseline screenshot + `snapshot_ui` captured for the first screen.
- [ ] Warm launch (`stop_app_sim` → `launch_app_sim`) reaches the correct anchor without crashing.
- [ ] No crash-on-launch; if one occurred, it was captured (stack/log) and filed Critical.
- [ ] First-launch video recorded and saved.
- [ ] Trust boundary: no "signing in"/network activity on the cold path to the age-gate.

### Parity notes (ChatGPT / Claude first-run)

- **Cold-start ritual:** ChatGPT and Claude both show a brief branded splash, then a guided first screen — _not_ a blank white flash and _not_ an immediate chat with no context. Our splash→spinner→age-gate matches that convention. A long white/blank flash before first paint is a Medium parity defect.
- **No forced account wall:** Claude and ChatGPT gate _cloud_ features behind sign-in but our locked product rule is stronger — **Local is fully usable with no account.** A launch that lands on a sign-in wall is not just a parity miss, it violates the locked rule → escalate.
- **Relaunch:** both competitors restore prior state quickly on warm launch. Our returning-user fast path (post-first-run) should skip the carousel and land in the app — verify once first-run is completed later in the run.

### Bug-classification examples

- **Critical:** crash-on-launch (any cause); or cold launch lands on a Cloud/Clerk sign-in wall (trust-boundary + locked-rule violation).
- **High:** cold launch lands in chat on a _clean_ install (age-gate skipped) → compliance gate bypassed.
- **Medium:** long blank/white pre-paint flash, or a visible double-splash/relaunch flicker.
- **Low:** spinner color isn't the brand teal (cosmetic-to-low).

### Recovery if it fails

- **Times out / no first screen:** treat as crash-on-launch — run the `debug_attach_sim` capture path and route to **Part 4 Phase 21**.
- **Lands in chat on a clean install:** the clean-state reinstall didn't clear MMKV → redo Phase 3 clean reinstall (erase simulator), relaunch.
- **Lands on a sign-in wall:** capture screenshot + `snapshot_ui`, file **Critical** (locked rule: Local must never force sign-in), and check `_layout` guard / `FEATURES.auth` state before continuing.
- **Warm launch double-splash loop:** likely a re-init race; record video, capture logs, file Medium/High by severity, continue.

### Checklist

- [ ] `record_sim_video` started for cold launch.
- [ ] `launch_app_sim` cold launch executed.
- [ ] `wait_for_ui` on `age-gate-root` resolved.
- [ ] `screenshot` baseline + `snapshot_ui` captured.
- [ ] `stop_app_sim` → `launch_app_sim` warm relaunch verified.
- [ ] Crash-on-launch checked; captured + filed Critical if present.
- [ ] First-launch video saved.
- [ ] No forced sign-in / no Local egress on the launch path.

---

# Phase 5 — First-run UX

### Goal

Apply the full **20-point per-screen verification template** (README) to every screen the user sees before reaching chat, in this order:

1. **Age-gate** (adult branch) — `age-gate-root` + children.
2. **Age-gate minor branch** — `age-gate-minor-notice` + `age-gate-minor-continue-btn`.
3. **Onboarding hero** — `onboarding-hero-screen`.
4. **Onboarding device-tier** — `onboarding-device-tier-screen`.
5. **Onboarding download** — `onboarding-download-screen`.
6. **First-run disclosure modal** (fires between hero and device-tier).
7. **System permission prompts** (camera / mic / notifications) — handled via the **button on the iOS system dialog**, not an in-app element.
8. **Local chat reachable WITHOUT login** — the locked-rule confirmation.

Every screen is run in **light + dark**, at **default and larger Dynamic Type**, with **safe-area** correctness, and with **screenshot before/after + `snapshot_ui` + `record_sim_video`** per the template. Targets use **testIDs**; fall back to `accessibilityLabel` then visible text.

> **Grounded testID inventory** (verified in source — confirm at runtime with `snapshot_ui`):
>
> - Age-gate: `age-gate-root`, `age-gate-title`, `age-gate-subtitle`, `age-gate-input`, `age-gate-error`, `age-gate-continue-btn`, `age-gate-policy-note`, `age-gate-minor-notice`, `age-gate-minor-continue-btn`.
> - Onboarding hero: `onboarding-root`, `onboarding-hero-screen`, `hero-brand-mark`, `hero-wordmark`, `hero-tagline`, `hero-start-chatting-btn`, `hero-footer`.
> - Device-tier: `onboarding-device-tier-screen`, `device-tier-headline`, `device-tier-cellular-toggle`, `device-tier-download-btn`, `device-tier-pick-model-btn`.
> - Download: `onboarding-download-screen`, `download-radial-progress`, `download-percent`, `download-reassurance`, `download-error`, `download-skip-btn`.
> - Chat (entry confirmation): `chat.mode-toggle`, `chat.mode-toggle.local`, `chat.mode-toggle.cloud`, `chat.composer.input`, `chat.composer.mic`, `chat.composer.send`.

> **Region note that changes expected copy.** The age threshold is region-derived from the device timezone (`ageGate.ts`): India/Brazil = **18**, EU member states = **16**, UK/US/default = **13**. The age-gate subtitle and minor-notice text interpolate this threshold ("designed for users {threshold} and older", "under {threshold} years old"). For deterministic screenshots, **fix the simulator timezone** (e.g., set it to a US zone for the 13+ baseline, and a `Asia/Kolkata`/`Europe/Berlin` zone to exercise the 18/16 branches) and **record which timezone each screenshot used.** Do not assert a literal number without knowing the simulator's region.

---

## Screen 5.1 — Age-gate (adult branch)

### Goal

Verify the age-gate renders correctly, gates correctly, validates input, and the adult path advances to onboarding.

### Exact tool sequence (snapshot → act → wait → screenshot)

1. `snapshot_ui` — enumerate the screen; confirm every element below is present.
2. `screenshot` — `p5-agegate-empty-light`.
3. Validation-empty check: confirm `age-gate-continue-btn` is **disabled** while `age-gate-input` is empty (template item 12).
4. Invalid-input branch: `tap` `age-gate-input` → `type_text` an invalid value (e.g., `0` or `999`) → `tap`/`key_press` Return / `age-gate-continue-btn` → `wait_for_ui` `age-gate-error` → `screenshot` `p5-agegate-error`.
5. Clear + adult value: clear the field → `type_text` an adult age (e.g., `30`) → confirm `age-gate-continue-btn` enabled (background turns teal) → `screenshot` `p5-agegate-filled`.
6. `record_sim_video` start → `tap` `age-gate-continue-btn` → `wait_for_ui` `onboarding-hero-screen` (adult path advances to onboarding) → `screenshot` `p5-agegate-to-hero` → stop video.
7. Repeat the visual pass in **dark mode** and at **larger Dynamic Type** (re-`screenshot` each: `*-dark`, `*-xl`).

### Expected UI/output (enumerate from source)

- Shield icon in a rounded accent surface; `age-gate-title` = "Your age" (header role); `age-gate-subtitle` referencing the region threshold; `age-gate-input` (numeric, number-pad, centered, max 3 digits, placeholder "Enter your age"); `age-gate-continue-btn` ("Continue"); `age-gate-policy-note` (DPDP/EU AI Act/Play, "stored only on this device and never shared").
- Disabled Continue uses the muted surface/text; enabled uses teal with light/dark-appropriate label color.
- Invalid age (`<1`, `>120`, or NaN) → `age-gate-error` "Please enter a valid age." with `accessibilityRole="alert"`.
- Keyboard avoidance: on focus, the input/CTA are not hidden behind the keyboard (`KeyboardAvoidingView`, padding behavior on iOS).

### Acceptance criteria (20-point template applied)

1. [ ] All elements present (shield, title, subtitle, input, continue, policy note) per `snapshot_ui`.
2. [ ] Spacing/alignment sane; centered column; no clipping at the safe-area top.
3. [ ] Parity vs ChatGPT iOS: a single-purpose gating screen with one primary CTA (convention only).
4. [ ] Parity vs Claude iOS: clear consent/compliance framing, no dark patterns.
5. [ ] Advance animation (age-gate → hero) smooth (fade), correct direction.
6. [ ] Safe-area: title/icon clear the notch; CTA clears the home indicator.
7. [ ] Dynamic Type: at larger text the subtitle/policy note wrap, input stays usable, CTA label not truncated.
8. [ ] Dark + light both legible (input border, placeholder, policy note contrast).
9. [ ] Scroll: content scrolls within `ScrollView` if it overflows at large text (no clipped CTA).
10. [ ] Haptics: not required on this screen; note none expected.
11. [ ] Loading states: n/a (synchronous) — confirm no spurious spinner.
12. [ ] Disabled state: `age-gate-continue-btn` disabled while input empty — **verified**.
13. [ ] Empty state: empty input shows placeholder, not an error pre-submit.
14. [ ] Error state: invalid age → `age-gate-error` clear + recoverable (re-type) — **verified**.
15. [ ] A11y labels: input ("Enter your age in years"), continue ("Continue", disabled state announced), back (if `returnTo`).
16. [ ] `screenshot` before + after each interaction captured.
17. [ ] `record_sim_video` of the gate→hero workflow captured.
18. [ ] `snapshot_ui` hierarchy captured.
19. [ ] Any deviation filed as a classified issue.
20. [ ] Every interactive element exercised (input, invalid submit, valid submit).

### Bug-classification examples

- **Critical:** age-gate can be bypassed (Continue advances with empty/invalid input) → compliance gate broken.
- **High:** valid adult age does not advance to onboarding (dead CTA).
- **Medium:** `age-gate-error` missing role=alert (VoiceOver won't announce it), or policy note invisible in one theme.
- **Low/Cosmetic:** input letter-spacing/centering nit; CTA pill radius off.

### Recovery if it fails

- CTA dead on valid input → capture `snapshot_ui` + video, file High, inspect `handleContinue` / `confirmAgeGate`; continue testing other screens.
- Bypass possible → file Critical immediately, stop relying on first-run state for later phases until confirmed.

### Checklist

- [ ] Adult-path screenshots (light/dark/xl) captured.
- [ ] Disabled→enabled CTA transition verified.
- [ ] Invalid-age error verified + recovered.
- [ ] Advance to `onboarding-hero-screen` verified.

---

## Screen 5.2 — Age-gate (minor branch)

### Goal

Verify the minor-safe path: entering an age below the region threshold shows the minor notice instead of advancing, then the minor "Continue" proceeds to onboarding (no parental-consent flow in v1 — content-filter only).

### Exact tool sequence

1. From a clean age-gate (clean reinstall, Phase 3), set a known timezone whose threshold makes your test age a minor (e.g., timezone `Asia/Kolkata` → threshold 18, enter `15`; or US zone → threshold 13, enter `10`).
2. `snapshot_ui` → `screenshot` `p5-agegate-minor-pre`.
3. `tap` `age-gate-input` → `type_text` the minor age → `tap` `age-gate-continue-btn` → `wait_for_ui` `age-gate-minor-notice`.
4. `snapshot_ui` + `screenshot` `p5-agegate-minor-notice` (light + dark + xl).
5. `record_sim_video` → `tap` `age-gate-minor-continue-btn` → `wait_for_ui` `onboarding-hero-screen` → stop video, `screenshot` `p5-agegate-minor-to-hero`.

### Expected UI/output

- `age-gate-minor-notice` container with shield icon, header "Minor-safe mode enabled", body referencing "under {threshold} years old in your region" and "age-appropriate content filtering", a pointer to "Settings > Parental Controls", and `age-gate-minor-continue-btn` ("Continue").
- The minor notice **replaces** the input screen (it does not advance straight to onboarding) — the gate is honored.

### Acceptance criteria (20-point template — deltas vs 5.1)

- [ ] Minor age routes to `age-gate-minor-notice`, **not** straight to hero (item 1, 14).
- [ ] Notice copy is clear, non-alarming, age-appropriate framing (parity item 4 — Claude/ChatGPT both use calm, non-punitive minor messaging).
- [ ] Safe-area + Dynamic Type hold for the longer notice body (items 6,7).
- [ ] Dark + light legible; teal "Settings > Parental Controls" emphasis visible in both (item 8).
- [ ] `age-gate-minor-continue-btn` advances to `onboarding-hero-screen` (item 20).
- [ ] `screenshot`/`snapshot_ui`/video captured (items 16–18).

### Bug-classification examples

- **Critical:** minor age still advances to onboarding without the notice (minor protection bypassed).
- **Medium:** notice references the wrong threshold for the simulator's region (copy/region mismatch).
- **Low:** wording or spacing nit in the notice.

### Recovery if it fails

- Minor branch not triggered → confirm the simulator timezone vs. the entered age (region table), re-test; if still wrong, file by severity and inspect `confirmAgeGate`/`detectRegionRule`.

### Checklist

- [ ] Timezone set + recorded for the minor case.
- [ ] Minor notice rendered (not bypassed).
- [ ] Minor continue → hero verified.
- [ ] Light/dark/xl screenshots captured.

---

## Screen 5.3 — Onboarding hero

### Goal

Verify the hero (Screen 1 of the 3-screen onboarding) renders the brand lockup + CTA and that the CTA opens the first-run disclosure gate (Screen 5.6) before advancing.

### Exact tool sequence

1. `snapshot_ui` → `screenshot` `p5-hero-light`.
2. Inspect elements: `hero-brand-mark` (SVG spoke mark), `hero-wordmark` ("AGI"), `hero-tagline`, sub-copy, `hero-start-chatting-btn`, `hero-footer` ("Made by AGI Automation LLC, USA").
3. `record_sim_video` → `tap` `hero-start-chatting-btn` → `wait_for_ui` the first-run disclosure modal (Screen 5.6) → `screenshot` `p5-hero-to-disclosure`.
4. Repeat visual pass dark + xl.

### Expected UI/output

- Centered brand lockup (mark + "AGI" wordmark), tagline "Your AI workspace for everyday work.", sub-copy line, a full-width teal pill CTA "Start chatting", and a footer attribution pinned near the bottom.
- Entering animation: the onboarding root cross-fades between screens (`FadeIn`/`FadeOut`, ~280/160ms).
- Tapping the CTA does **not** jump straight to device-tier; it surfaces the **first-run disclosure** first (unless already satisfied).

### Acceptance criteria (20-point template — key items)

- [ ] All hero elements present (item 1); lockup centered, footer not overlapping the home indicator (items 2,6).
- [ ] Parity (items 3,4): a clean hero with a single primary CTA and brand mark — matches ChatGPT/Claude welcome convention (our own assets only).
- [ ] Cross-fade smooth, correct direction (item 5).
- [ ] Dynamic Type: large wordmark (94pt) + tagline don't collide; sub-copy wraps within `maxWidth` (item 7).
- [ ] Dark + light legible (item 8).
- [ ] CTA a11y: role button, label "Start chatting" (item 15).
- [ ] `screenshot`/video/`snapshot_ui` captured (items 16–18).
- [ ] CTA exercised → disclosure appears (item 20).

### Bug-classification examples

- **High:** "Start chatting" is dead, or advances to device-tier **skipping** the disclosure (compliance step skipped).
- **Medium:** footer attribution clipped by the home indicator at larger Dynamic Type.
- **Cosmetic:** wordmark baseline/letter-spacing nit.

### Recovery if it fails

- Disclosure skipped → confirm `isDisclosureSatisfied` state (a prior accept persists); on a clean install it should appear. File by severity; inspect `handleHeroCTA`.

### Checklist

- [ ] Hero elements enumerated + screenshotted (light/dark/xl).
- [ ] CTA opens the disclosure (not a direct skip).
- [ ] Cross-fade observed.

---

## Screen 5.4 — Onboarding device-tier

### Goal

Verify the device-tier screen (Screen 2) detects the device, recommends a local model, exposes the cellular toggle + model picker, and that its primary CTA starts the download (or continues if the model is already on-device).

### Exact tool sequence

1. Reach it via Screen 5.6 (accept disclosure) → `wait_for_ui` `onboarding-device-tier-screen`.
2. `snapshot_ui` → `screenshot` `p5-devicetier-light`.
3. Inspect: `device-tier-headline` ("Set up local chat on {device}."), subhead, recommended model card (name + "Recommended" badge + size/"Already on your device"), `device-tier-cellular-toggle` (only when a download is needed), `device-tier-download-btn`, `device-tier-pick-model-btn`.
4. Exercise the cellular toggle: `tap` `device-tier-cellular-toggle` → confirm switch state flips (a11y `checked`) → `screenshot`.
5. Exercise the model picker: `tap` `device-tier-pick-model-btn` → `wait_for_ui` the model picker sheet (`bottom-sheet`/`ModelPickerSheet`) → `screenshot` `p5-devicetier-picker` → dismiss.
6. `record_sim_video` → `tap` `device-tier-download-btn` → `wait_for_ui` `onboarding-download-screen` (download path) **or** the app/chat surface (if the recommended model needs no download) → stop video.
7. Repeat visual pass dark + xl. The screen is a `ScrollView` — verify it scrolls at large text.

### Expected UI/output

- Headline interpolates the detected device name (falls back to "Your device"); subhead reflects whether a download is needed.
- Model card shows the recommended model's display name and either "{size} download · Wi-Fi recommended" or "Already on your device · Zero download".
- Cellular toggle defaults **off** (downloads prefer Wi-Fi). Download CTA label is "Download {model}" or "Continue" depending on `needsDownload`.
- "Pick a different model" opens the local-scope model picker sheet.

### Acceptance criteria (20-point template — key items)

- [ ] All elements present per `snapshot_ui`; card layout aligned, badge not clipping the model name (items 1,2).
- [ ] Parity (3,4): device-aware model recommendation is an AGI-specific _local-first_ flow; judge UX clarity (clear size, clear Wi-Fi guidance), not a copied screen.
- [ ] Scroll physics fine; content scrolls at xl Dynamic Type without clipping the CTA (items 7,9).
- [ ] Toggle a11y: role switch, `checked` state announced; label "Download over cellular too" (items 10,15).
- [ ] Dark + light legible; card border/badge contrast OK (item 8).
- [ ] Picker opens + dismisses cleanly (item 20); empty/skeleton states inside the picker checked in Part 2.
- [ ] `screenshot`/video/`snapshot_ui` captured (16–18).

### Bug-classification examples

- **High:** download CTA dead, or "Pick a different model" doesn't open the sheet.
- **Medium:** cellular toggle has no a11y `checked` state, or defaults **on** (would burn cellular data — also a UX/trust nit).
- **Low:** device name shows "Your device" on a simulator where a model string was expected (acceptable on Sim; note it).

### Recovery if it fails

- Download CTA dead → inspect `handleStartDownload`; confirm the catalog provides a download path (executorchPreset or downloadUrl+checksum+format) — if neither, the screen shows a "cannot be downloaded yet" error by design; verify that error renders instead of a silent dead button.

### Checklist

- [ ] Device-tier elements enumerated + screenshotted (light/dark/xl).
- [ ] Cellular toggle flips with correct a11y state.
- [ ] Model picker opens + dismisses.
- [ ] Download CTA advances to download screen (or continues if no download).

---

## Screen 5.5 — Onboarding download

### Goal

Verify the download screen (Screen 3) shows real progress, the privacy reassurance, the background-download hint, error handling, and a **skip-to-chat** that is correctly disabled while an ExecuTorch model is loading (so the user can't enter chat model-less).

### Exact tool sequence

1. Reach it via Screen 5.4 download CTA → `wait_for_ui` `onboarding-download-screen`.
2. `snapshot_ui` → `screenshot` `p5-download-progress` (capture at a mid-progress frame).
3. Inspect: `download-radial-progress` ring, `download-percent` ("NN%"), model name, meta line (size · MB/s · ETA), `download-reassurance` ("Stays on your device."), background hint, `download-skip-btn` ("Continue to chat"), and `download-error` (only on failure).
4. Skip-disabled check: while an ExecuTorch load is in flight, confirm `download-skip-btn` is **disabled** (opacity ~0.4, a11y disabled) — template item 12. Then once the model finishes loading (or for a non-ExecuTorch GGUF download), confirm skip is enabled.
5. Error-path check (optional, environment-permitting): induce a failure (e.g., a model with no valid download path) → `wait_for_ui` `download-error` → `screenshot` `p5-download-error`.
6. `record_sim_video` around the progress → completion (or skip) → `wait_for_ui` the chat surface (`chat.composer.input`) → stop video.
7. Repeat visual pass dark + xl.

### Expected UI/output

- A terracotta radial ring with a centered tabular-nums percentage; model name + meta; "Stays on your device." reassurance; "You can leave this screen. The download continues in the background." hint.
- On success the flow finishes onboarding and lands in the app/chat. On error, `download-error` (role alert) shows a specific message (Wi-Fi required / corrupted / storage full / generic) and the skip remains available as the escape hatch.
- `download-skip-btn` disabled (dimmed) while ExecuTorch is loading; enabled otherwise.

### Acceptance criteria (20-point template — key items)

- [ ] Elements present (ring, percent, reassurance, hint, skip) per `snapshot_ui` (item 1).
- [ ] **Loading state is the whole screen** — never blank; ring + percent always visible (item 11).
- [ ] Disabled skip during ExecuTorch load verified (item 12) — prevents model-less chat.
- [ ] Error state renders with a specific, recoverable message + role alert (item 14).
- [ ] Reassurance copy reinforces the **trust boundary** ("Stays on your device.") — and **no network egress beyond the model fetch** (Local trust boundary, README convention 7).
- [ ] Safe-area + Dynamic Type hold; dark + light legible (items 6,7,8).
- [ ] `screenshot`/video/`snapshot_ui` captured (16–18).
- [ ] Percent a11y label present ("NN percent downloaded") (item 15).

### Bug-classification examples

- **Critical:** download screen makes network calls to a non-model endpoint, or the "Stays on your device" claim is contradicted by observed egress (overclaim + trust violation).
- **High:** skip is enabled during ExecuTorch load and lands the user in chat with no model (broken core flow).
- **Medium:** error path shows a generic message for a specific failure (e.g., "failed" instead of "Wi-Fi required").
- **Cosmetic:** ring stroke/jitter polish.

### Recovery if it fails

- Skip lands model-less → file High; inspect `handleSkipToChat`/`tier2Loading` gating.
- Egress beyond model fetch → file Critical, stop, escalate per trust-boundary rule.

### Checklist

- [ ] Download screen elements enumerated + screenshotted (light/dark/xl).
- [ ] Skip-disabled-while-loading verified.
- [ ] Error path observed (if inducible).
- [ ] Completion (or skip) lands in chat.

---

## Screen 5.6 — First-run disclosure modal

### Goal

Verify the compliance disclosure that fires after the hero CTA and before device-tier: it presents accept/decline, accepting advances to device-tier, declining keeps the user on the hero (app remains usable on re-tap), and on mobile it surfaces **no public cloud provider routing** (Local-first first run).

### Exact tool sequence

1. From the hero (Screen 5.3), `tap` `hero-start-chatting-btn` → `wait_for_ui` the disclosure modal (`FirstRunDisclosureModal`).
2. `snapshot_ui` → `screenshot` `p5-disclosure-light`.
3. Decline path: tap Decline → `wait_for_ui` `onboarding-hero-screen` (stays on hero) → `screenshot` `p5-disclosure-declined`.
4. Re-open (tap hero CTA again) and Accept → `wait_for_ui` `onboarding-device-tier-screen` → `screenshot` `p5-disclosure-accepted`.
5. Repeat visual pass dark + xl.

### Expected UI/output

- A disclosure sheet/modal composed from `composeFirstRunDisclosure({ surface: 'mobile', offersManagedCloud: false, thirdPartyAiProviders: [] })` — i.e., **no third-party/cloud provider names** in the mobile first run (locked: mobile first-run has no public cloud routing).
- Accept → records acceptance (compliance ledger) → device-tier. Decline → dismiss, remain on hero, fully usable on re-tap (no lockout/dead-end).

### Acceptance criteria (20-point template — key items)

- [ ] Modal present, scrollable if long, both buttons reachable (items 1,9).
- [ ] **No cloud/provider names** shown in the mobile first-run disclosure (trust boundary + locked rule; auto-Critical if a fake "available" provider is implied).
- [ ] Decline is non-destructive (re-tap works) — no dead-end (item 14).
- [ ] Accept advances to device-tier and persists (returning users not re-prompted).
- [ ] A11y: buttons labeled; modal announced (item 15).
- [ ] Dark + light legible; safe-area respected for a bottom sheet (items 6,8).
- [ ] `screenshot`/`snapshot_ui` captured (16,18).

### Bug-classification examples

- **Critical:** disclosure names a cloud provider as "available" in the Local-first mobile first run (overclaim / trust-boundary implication).
- **High:** Decline dead-ends the app (cannot proceed or re-open).
- **Medium:** Accept doesn't persist (modal re-appears every launch).

### Recovery if it fails

- Re-prompt loop → inspect `recordDisclosureAcceptance`/`mmkvDisclosureLedger`; file Medium/High.

### Checklist

- [ ] Disclosure appears after hero CTA.
- [ ] Decline keeps the user on hero (re-tappable).
- [ ] Accept advances to device-tier + persists.
- [ ] No cloud provider names present.

---

## Screen 5.7 — System permission prompts (camera / mic / notifications)

### Goal

Verify OS permission prompts appear with the app's declared usage strings and that **granting / denying via the system dialog button** is handled gracefully (no crash, sensible fallback). These are **iOS system dialogs**, so you tap the **button on the system dialog**, not an in-app testID.

### Where each prompt fires (so you trigger them deliberately)

- **Microphone / Speech:** first use of voice input (`chat.composer.mic` → VoiceInputButton) or voice mode. Usage strings: `NSMicrophoneUsageDescription`, `NSSpeechRecognitionUsageDescription`.
- **Camera:** first use of camera/scan (camera or QR-pairing screen). Usage string: `NSCameraUsageDescription`.
- **Notifications:** registered only for signed-in cloud users (`registerForPushNotifications` is gated on `FEATURES.auth && FEATURES.cloudChat && isClerkSignedIn`). On a Local-only first run **no notification prompt should appear** — confirming its _absence_ is itself a trust-boundary check.

> Full exercise of camera/mic _features_ belongs to Part 2. In Phase 5 you only validate the **permission prompt** behavior the first time each is triggered, plus the deliberate **absence** of the notifications prompt in Local-only first run.

### Exact tool sequence (per prompt)

1. Navigate to the trigger (e.g., reach chat, then `tap` `chat.composer.mic`).
2. `wait_for_ui` for the system alert (match by its text/buttons — "Allow"/"Don't Allow"/"OK").
3. `screenshot` `p5-perm-<type>-prompt` (light + dark).
4. **Allow path:** `tap` the "Allow" button on the **system dialog** (locate the dialog button via `snapshot_ui` / its label) → `wait_for_ui` the post-grant state (recording UI / camera preview) → `screenshot`.
5. **Deny path** (use a clean reinstall to reset permission, or reset the simulator's privacy settings): trigger again → `tap` "Don't Allow" → confirm a graceful fallback (a clear "permission needed" message or a no-op, **never a crash**) → `screenshot` `p5-perm-<type>-denied`.

### Expected UI/output

- The system alert body shows the app's usage string verbatim (e.g., the camera string mentions QR scanning + image analysis; the mic string mentions voice input/real-time voice).
- Allow → the feature proceeds. Deny → a graceful, recoverable state (e.g., guidance to enable in Settings), not a crash or a stuck spinner.
- Notifications: **no prompt** on Local-only first run.

### Acceptance criteria (20-point template — key items)

- [ ] Each prompt fires on first use of its feature, with the correct usage string (item 14 framing).
- [ ] Allow → feature works; Deny → graceful, recoverable fallback, **no crash** (items 12,14).
- [ ] Notifications prompt **absent** in Local-only first run (trust boundary — item 4 + README convention 7).
- [ ] Parity (3,4): ChatGPT/Claude request mic/camera **in context** at first use (not a permission wall at launch) — confirm we do the same (just-in-time).
- [ ] Screenshots of prompt + allow + deny captured (item 16).

### Bug-classification examples

- **Critical:** a notification (cloud-account) prompt appears for a Local-only, signed-out user (trust boundary — account feature firing without sign-in).
- **High:** denying a permission crashes the app or leaves a stuck spinner.
- **Medium:** usage string is generic/placeholder (App Store rejection risk) or mismatched to the feature.
- **Low:** prompt fires slightly early (pre-emptively) rather than exactly at first use.

### Recovery if it fails

- Can't reset a permission to re-test deny → clean reinstall (Phase 3) or reset the simulator's privacy/location settings, then re-trigger.
- Crash on deny → capture via `debug_attach_sim` (Part 4), file High/Critical.

### Checklist

- [ ] Mic/speech prompt validated (allow + deny).
- [ ] Camera prompt validated (allow + deny).
- [ ] Notifications prompt confirmed **absent** in Local-only first run.
- [ ] Usage strings match declared `infoPlist` values.

---

## Screen 5.8 — Local chat reachable WITHOUT login (locked-rule confirmation)

### Goal

Prove the locked product rule on-device: **Local Mode is fully usable with no account and no sign-in.** After first-run, the user must land in a working chat with the mode toggle on **Local**, the composer interactive, and **zero forced sign-in / zero Local egress** — and Cloud sign-in must be reachable only _on demand_ (and dismissible back to Local).

### Exact tool sequence

1. Complete first-run (age-gate adult → hero → disclosure accept → device-tier → download/skip) → `wait_for_ui` `chat.composer.input`.
2. `snapshot_ui` → `screenshot` `p5-localchat-landing` (light + dark).
3. Confirm `chat.mode-toggle` shows **Local** selected (`chat.mode-toggle.local` selected state).
4. Confirm composer is interactive: `tap` `chat.composer.input` → `type_text` a short prompt → confirm `chat.composer.send` enables (template item 12). **Do not** require sign-in to type.
5. On-demand Cloud check (do **not** complete sign-in): `tap` `chat.mode-toggle.cloud` → confirm it surfaces a sign-in affordance (Clerk `AuthView`) that is **dismissible** → dismiss → `wait_for_ui` back on the app/Local surface → `screenshot` `p5-cloud-dismiss-back-to-local`.
6. `record_sim_video` of: land in Local chat → type → (optionally send a Local-model turn if a model is ready) → open Cloud prompt → dismiss → back to Local.
7. Repeat visual pass dark + xl + safe-area on the chat surface.

### Expected UI/output

- After first run, the app surface is chat with `chat.mode-toggle` defaulting to **Local**, `chat.composer.input` editable, `chat.composer.mic` + `chat.composer.send` present. The send button enables once there's content.
- Tapping the **Cloud** segment routes to the optional Clerk sign-in (`AuthView`, `mode="signInOrUp"`, `isDismissible`); dismissing returns to `/(app)` (Local). Per `login.tsx`, when cloud auth is disabled the route redirects straight to `/(app)` — i.e., Local is never blocked.
- No "you must sign in" wall anywhere on the Local path.

### Acceptance criteria (20-point template — key items)

- [ ] Chat reachable with **no account** after first run (item 20; locked rule).
- [ ] `chat.mode-toggle` defaults to Local; composer interactive; send disabled-until-content verified (items 1,12).
- [ ] Cloud is reachable **on demand** and the sign-in is **dismissible** back to Local (item 14 — escape hatch).
- [ ] **Trust boundary:** no Local egress while typing/staying in Local; no auto-redirect to sign-in (README convention 7).
- [ ] Parity (3,4): like ChatGPT/Claude, cloud/account features are gated by sign-in — but our Local path is _stronger_ (works with no account at all). Confirm we don't regress to a forced-login posture.
- [ ] Safe-area: composer clears the home indicator; keyboard avoidance correct (item 6).
- [ ] `screenshot`/video/`snapshot_ui` captured (16–18).

### Bug-classification examples

- **Critical:** the only way to reach chat is to sign in (forced account wall) → violates the locked Local-first rule; or any Local-mode network egress while idle/typing.
- **High:** Cloud sign-in is **not** dismissible (traps the user away from Local).
- **Medium:** mode toggle defaults to Cloud, or Local label/selected state is wrong.
- **Low:** composer send-disabled styling unclear.

### Recovery if it fails

- Forced sign-in to reach chat → file **Critical**, inspect `_layout.tsx` auth guard + `FEATURES.auth`; this blocks the core value prop, escalate.
- Cloud sign-in not dismissible → file High, inspect `login.tsx` `onDismiss`.

### Checklist

- [ ] Landed in Local chat with no account.
- [ ] Mode toggle defaults Local; composer interactive; send disabled-until-content.
- [ ] Cloud sign-in reachable on demand **and** dismissible back to Local.
- [ ] No forced sign-in; no Local egress observed.
- [ ] Light/dark/xl + safe-area screenshots captured.

---

## Phase 5 exit criteria (all screens)

- [ ] Every first-run screen (5.1–5.8) ran the full 20-point template in **light + dark** and at **default + larger Dynamic Type**.
- [ ] Safe-area correct on every screen (notch + home indicator).
- [ ] Every interactive element exercised; every deviation filed as a classified issue with `{severity, screen, testID, expected, actual, screenshot, video, repro}`.
- [ ] The compliance order is honored: **age-gate → (minor branch correct) → hero → disclosure → device-tier → download → Local chat**.
- [ ] The locked rule is verified on-device: **Local chat is reachable without login; Cloud is on-demand and dismissible; no Local egress.**
- [ ] All artifacts named `<phase>-<screen>-<state>` and saved under the run folder.

---

## Hand-off to Part 2

With the environment configured (Phase 1), a reproducible Debug build (Phase 2), a clean install procedure (Phase 3), validated launch + crash-recovery (Phase 4), and the full first-run UX verified (Phase 5), proceed to **`part-2-chat-composer-tools-streaming.md` (Phases 6–14)** — navigation, chat UX, composer, keyboard, streaming, tool-calling UI, long conversations, attachments, search, and model switching. Carry forward: the recorded simulator UDID, the app scheme, `com.agiworkforce.app`, the timezone(s) used for age-gate screenshots, and any open Critical/High issues that gate later phases.
