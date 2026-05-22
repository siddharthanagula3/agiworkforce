# Wave 0 — Complete (2026-05-18)

**Status:** All 15 AI-completable Wave 0 tasks **VERIFIED-PASS**. 4 founder-action items pending. Ready for Wave 1.

---

## Snapshot

|                                | Count         | Notes                                                                                                |
| ------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------- |
| Wave 0 tasks total             | 19            |                                                                                                      |
| Verified-PASS (AI-completable) | 15            | full implementer + verifier loop complete                                                            |
| Pending (founder-action only)  | 4             | #12, #19, #20, #24 — physical devices + ASC/Play console                                             |
| Wave 1+ tasks queued           | 5             | #27-#31                                                                                              |
| Unresolved bugs                | 0             | all 7 flagged-and-fixed                                                                              |
| Test suites                    | 51 / 51 green | 874 pass · 10 cloud-gated skips · 0 fails                                                            |
| Typecheck                      | clean         | `@agiworkforce/types`, `@agiworkforce/local-llm`, `@agiworkforce/compliance`, `@agiworkforce/mobile` |

---

## Locked architecture (Path C)

Mixed system-native multimodal + downloaded text model:

| Role                                        | Model                            | License                       | Where it runs                                                    |
| ------------------------------------------- | -------------------------------- | ----------------------------- | ---------------------------------------------------------------- |
| **Default downloaded text brain**           | **Qwen3-4B-Instruct-2507**       | Apache 2.0                    | Universal — Tier 2 via `react-native-executorch` 0.8.4 LLMModule |
| **Apple system multimodal**                 | Apple Foundation Models + Vision | Apple entitlement             | iPhone 15 Pro+, iPad M-series, Mac M-series                      |
| **Android system multimodal**               | AICore + ML Kit GenAI            | Google AICore                 | Supported AICore devices                                         |
| **Premium vision pack (opt-in)**            | Qwen2.5-VL-3B-Instruct           | Verify Apache vs Qwen License | Optional download                                                |
| **Premium multimodal alt**                  | Gemma 4 E4B                      | Apache 2.0 (shifted Apr 2026) | Opt-in                                                           |
| **Lite mode (storage-constrained, opt-in)** | Llama 3.2 1B SpinQuant           | Llama Community               | Never silent default                                             |
| **Internal eval hedge (not shipped)**       | Phi-4-mini-instruct              | MIT                           | strict-JSON / extraction baseline                                |

References:

- `tasks/research/V1-MODEL-SELECTION-REPORT.md` — formal model selection report (Path C)
- `tasks/research/V1-RUNTIME-EVALUATION-REPORT-2026-05-18.md` — runtime evaluation (react-native-executorch recommendation)
- `tasks/research/V1-MODEL-LANDSCAPE-PRELIMINARY-2026-05-18.md` — preliminary landscape from 8 search rounds
- `~/.claude/.../memory/locks/v1-model-selection-final-2026-05-18.md` — canonical pick list
- `~/.claude/.../memory/locks/v1-local-only-cloud-waitlist-2026-05-18.md` — strategy lock

---

## Verified-PASS tasks

| #   | Task                                               | Commit                    | Verifier verdict                                                 |
| --- | -------------------------------------------------- | ------------------------- | ---------------------------------------------------------------- |
| #11 | Port wireframe primitives → production RN          | (early session)           | passed earlier                                                   |
| #13 | Wire ModeToggle + PerformanceChip into chat header | `22a77b307`               | PASS (re-verified after centering + color fixes)                 |
| #14 | Supabase cloud_waitlist migration + service        | `c589f8309`               | PASS (rank-display +1 fix in #33)                                |
| #15 | Cloud-mode feature-gate sweep (47 files)           | `7b7302a39`               | PASS (zero hook-rules violations)                                |
| #16 | Onboarding v1 rewrite (privacy-first)              | `9bb4b90d4` → `a6ce81c91` | PASS (re-verified after copy fix + color tokenization)           |
| #17 | 14-day global model selection research             | n/a (doc)                 | shipped early on 2026-05-18                                      |
| #18 | On-device model catalog scaffold                   | `59c9baa2f`               | PASS (re-verified after onboarding regression closed)            |
| #21 | Compliance MMKV + LLM gate wire                    | (per session)             | PASS (re-verified after `console.warn` removal)                  |
| #22 | Storage scaffolding + DSAR export                  | (per session)             | PASS-with-concerns → all concerns resolved (SHA-256 fix shipped) |
| #23 | Doc Q&A parser + sqlite-vec                        | `4cb8ec59f`               | PASS                                                             |
| #25 | Skills + Projects local-only scaffold              | (per session)             | PASS with 2 nits (legacy hydrate + RAG TODO)                     |
| #26 | Test suite cleanup                                 | `dd1a8dad1`               | PASS — 874 tests green / 10 cloud-gated skips                    |
| #32 | RN inference runtime evaluation                    | `3a91b323f`               | PASS (with bonus tier2 fix shipped by runtime-engineer)          |
| #33 | Fix rank-display +1 bug in CloudWaitlistSheet      | `56ac314272f`             | PASS (tests cover both rank=0 and rank=1246 cases)               |
| #34 | Tier 2 LLMController upgrade + tools API           | `4ad2e53be`               | PASS — 26/26 tests passing                                       |

---

## Bugs surfaced + fixed by the verifier loop

The implementer→verifier pattern caught and resolved **7 distinct bugs** across the session:

| Bug                                                                                                                  | Source              | Severity                       | Resolution                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ETLLMModule` silently null at module-load (Tier 2 inference completely broken)                                      | runtime-verifier    | **Wave 0 BLOCKER**             | runtime-engineer replaced with real `LLMModule` from react-native-executorch 0.8.4 (commit `3a91b323f`); tier2-integration-engineer added 14 tests + tools API (commit `4ad2e53be`) |
| SHA-256 of base64 string instead of raw bytes (would fail every catalog checksum)                                    | storage-verifier    | **Wave 1 BLOCKER**             | storage-engineer replaced with `@noble/hashes/sha256` streaming hasher (already transitive dep); peak heap bounded to ~4MB regardless of model size                                 |
| `console.warn` in `streaming.ts:356` (no-console convention)                                                         | compliance-verifier | Convention violation           | Removed by compliance-engineer; re-verified                                                                                                                                         |
| ModeToggle not actually centered (asymmetric left/right children) + hardcoded shield-badge color                     | chat-ui-verifier    | Visual regression + convention | Wrapped in `flex: 1` View + replaced hex with `${colors.teal}1F` (commit `22a77b307`)                                                                                               |
| `#0 in line` for first waitlist signup (rank +1 transform missing)                                                   | waitlist-verifier   | UX bug                         | rank-display-fix-engineer wrapped rank display with `+ 1` + locale formatting + 2 unit tests (commit `56ac314272f`)                                                                 |
| `getModelsByTier` removed from `@agiworkforce/local-llm` without updating consumers (broke onboarding.tsx typecheck) | catalog-verifier    | Build regression               | onboarding-engineer's rewrite naturally consumed the new role-based API (`getDefaultModel`, `getShippableModels`); catalog-verifier-r2 re-PASSED                                    |
| Trust chip copy "DPDP Act 2023" missing "compliant" + hardcoded `#1a1915` / `#fff` / `#000`                          | onboarding-verifier | Convention + copy              | onboarding-engineer fixed both in commit `a6ce81c91`                                                                                                                                |

---

## Engineering conventions enforced

- ✅ No hardcoded model IDs (all read from `packages/local-llm/src/catalog.ts`)
- ✅ No hardcoded colors (all via `useThemeColors()` — shadow `#000` only allowed exception)
- ✅ No hardcoded user-facing strings (or single-issue tracked exceptions)
- ✅ TypeScript strict, no `any`
- ✅ No `console.log` in shipped code
- ✅ No new package.json deps without TL approval (one retroactive approval: `expo-sqlite ~15.2.12` for SQLCipher foundation)
- ✅ Conventional commits (lowercase, ≤100 chars, Co-Authored-By footer)
- ✅ React hooks-rules clean (audit confirmed on account.tsx, agents/[id].tsx, agents/index.tsx — the 3 previously-flagged screens)

---

## Founder-action items remaining

These cannot be agent-completed without physical hardware or developer-portal credentials:

### #12 — Tier 1 smoke test on real iPhone + Pixel

1. Run `pnpm --filter @agiworkforce/mobile ios` on your iPhone 13 Pro Max (or any iOS 15.1+ device)
2. Verify chat sends "hello" → Qwen3-4B-Instruct-2507 streams a response
3. PerformanceChip displays real `tok/s` + `ttft`
4. Mode toggle's Cloud chip opens CloudWaitlistSheet
5. Submit email → see real `#N in line` confirmation
6. Capture device on Pixel/Galaxy if available; check Tier 1 AICore path

### #19 — EAS init + App Store Connect + Play Console

1. `cd apps/mobile && eas init` to replace `projectId: "agi-workforce"` placeholder with a real UUID
2. Apple Developer portal: create app record for `com.agiworkforce.app` (Team ID `D2PR62RLT4`)
3. Google Play Console: create app record for `com.agiworkforce.app`
4. Generate App Store Connect API key (.p8) and Google Play service account JSON
5. Drop both into `apps/mobile/secrets/` (gitignored)
6. Confirm Apple Developer Program PLA acceptance at developer.apple.com/account

### #20 — Android AICore gradle + MainApplication wiring

1. Add `implementation 'com.google.android.gms:play-services-aicore:<latest>'` to `android/app/build.gradle`
2. Register `AGIAICorePackage()` in `MainApplication.kt` packages list
3. Test compilation
4. Smoke-test on Pixel 9/10 or Galaxy S24+/S26 (AICore-supported device)

### #24 — HealthKit permission flow validation

1. Run on real iOS device (iPhone 13+ recommended)
2. Confirm HealthKit permission prompts work
3. Confirm `query_health` tool returns sample workout/sleep data

---

## Wave 1+ queue (ready to pull)

| #   | Task                                            | Why now                                                                                 |
| --- | ----------------------------------------------- | --------------------------------------------------------------------------------------- |
| #27 | App Intents layer (every core verb)             | Apple's primary AI integration contract; ship pre-WWDC reaction                         |
| #28 | Age-gate + minor-safe mode + in-app report/flag | Play Store GenAI policy + DPDP Act + EU AI Act compliance                               |
| #29 | Store-review defense pack                       | App Store + Play submission risk mitigation                                             |
| #30 | 4K context budgeting strategy                   | Apple FM is 4K-context; chunking + memory compactor needed                              |
| #31 | Hindi QA matrix                                 | Don't depend on Apple Translate / Apple Intelligence Live Translation for Hindi quality |

---

## Test inventory (skipped in v1, auto-re-enable in v1.1)

These tests are gated by `FEATURES.*` flags and skip in v1 config:

| Test                                        | Flag                     | Re-enables when                     |
| ------------------------------------------- | ------------------------ | ----------------------------------- |
| auth-storage: secure session writes         | `FEATURES.auth`          | Cloud waitlist opens + signup ships |
| tier-store refreshTier (5 tests)            | `FEATURES.billing`       | Paid tier wires up                  |
| tier-store concurrent dedup                 | `FEATURES.billing`       | Same                                |
| dispatch-defense heartbeat                  | `FEATURES.companion`     | Desktop companion ships             |
| scripts/screenshots/specs/01-multi-provider | `jest.config.js exclude` | Detox infrastructure wired          |

All "must-pass" tests verified green: chatStore, model-store, chat-input, safe-open-url, onboarding (rewritten), storage-encryption, offline-queue, mmkv-encryption-key, theme-prefs, biometric-gate, pinning, waitlist.

---

## Team protocol observations (for the next session)

The implementer→verifier pattern with file-scoped briefs worked. Specifically:

1. **SendMessage coordination** between teammates (compliance ↔ onboarding, compliance ↔ storage, model-catalog ↔ tier2, storage ↔ onboarding, cloud-mode-gate ↔ skills-projects) self-organized **without orchestrator intervention** beyond the initial briefs.
2. **Verifier FAIL routing back to implementer** worked cleanly. Multiple iterations on tasks #21, #16, #18 closed without deadlock.
3. **Scope redirect** (tier2-integration-engineer → verifier of runtime-engineer's bonus implementation) saved a re-spawn and added 14 tests we wouldn't have otherwise had.
4. **Hard architecture bugs surfaced by rigor**: ETLLMModule and SHA-256 were both verifier-discovered. Without the paired-verifier pattern, both would have landed silently into Wave 1.
5. **Convention enforcement** caught real defects: hardcoded `#1a1915`, missing "compliant" copy, console.warn, rank `#0`. Cheap to fix when caught; expensive to ship broken.

For Wave 1, same pattern recommended. The team config (`agi-thorough-exploration`) can persist or be re-created.

---

## Known issues (non-blocking, tracked)

1. **Persistent `test-engineer` agent** from prior exploration sessions remains in idle/stuck state in the team. Won't acknowledge `shutdown_request`. Blocks `TeamDelete` but doesn't affect new work. Can ignore until a clean session is desired.
2. **Qwen2.5-VL-3B-Instruct license uncertainty** — model card may be under Qwen License (commercial OK but not Apache 2.0). Catalog flags this for Wave 0 verification before App Store distribution. Qwen3-VL-4B-Instruct is the clean-license fallback.
3. **Radial progress on onboarding screen 3** — uses `Animated` border-opacity + rotation as conic-arc proxy. Not true progress fill. TODO documented for pre-TestFlight; needs `react-native-svg` Arc.
4. **"Pick a different model" CTA on onboarding screen 2** — onPress is `() => { /* TODO: navigate to model picker screen */ }`. No-op until model picker screen lands.
5. **Storage usage bar** missing DB file size. Minor display accuracy gap; tracked for v1.0.x.

---

## Files of interest for cold-resume next session

- `tasks/research/V1-MODEL-SELECTION-REPORT.md` — model picks SSOT
- `tasks/research/V1-RUNTIME-EVALUATION-REPORT-2026-05-18.md` — runtime SSOT
- `~/.claude/.../memory/locks/v1-model-selection-final-2026-05-18.md` — pick lock
- `~/.claude/.../memory/locks/v1-local-only-cloud-waitlist-2026-05-18.md` — strategy lock
- `~/.claude/.../memory/locks/research-corrected-platform-facts-2026-05-18.md` — Apple FM 4K context / iOS 26 / Gemma Apache 2.0 facts
- `docs/design/mobile-claude-design-prompt-r2-2026-05-18.md` — Round 2 design prompt for hero flow
- `docs/design/mobile-wireframes-2026-05-18/` — Round 1 wireframe bundle
- `~/.claude/plans/here-is-the-approved-ancient-clover.md` — approved orchestration plan

---

## What's ready vs what's not

✅ **Ready to ship on Aug 16** (pending 4 founder items + Wave 1 polish):

- Local-only chat with on-device Qwen3-4B inference
- Mode toggle + cloud waitlist
- Compliance gates (Article 50 + DPDP)
- Storage + DSAR export
- Document Q&A scaffold (text files; image vision deferred to Wave 1+)
- Skills + Projects local-only
- Test suite green

🟡 **Wave 1 must polish**:

- App Intents layer
- Age-gate + minor-safe mode + in-app report
- 4K context budgeting strategy
- Hindi QA matrix
- Store-review defense pack
- Radial progress SVG fix
- Storage usage bar DB size
- Project hydration backward-compat migrate function

🔴 **Wave 1+ founder-coordinated**:

- Real device smoke tests
- EAS + App Store Connect + Play Console one-time setup
- HealthKit on iOS device
- Android AICore on real Android device

---

Wave 0 closed at 2026-05-18 19:21 UTC. Resume here for Wave 1.
