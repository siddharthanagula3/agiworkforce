# AGI Mobile — XcodeBuildMCP QA Playbook (master index)

Status: Active · regression-grade QA manual for `apps/mobile` on iOS Simulator
Owner: Mobile lead · Parity bar: ChatGPT iOS + Claude iOS (parity = behavior/workflow, never copied assets, text, or branding)
Condensed quick-start: `../MOBILE-XCODE-TEST-PLAN.md`. This folder is the full manual.

You are an autonomous QA + automation + accessibility + regression engineer driving the AGI Mobile app with XcodeBuildMCP (44 tools). Execute every part top-to-bottom, exercise every tool, and verify the app behaves like a production-quality mobile AI app comparable to ChatGPT/Claude. Produce an end-of-run report with screenshots, videos, a classified issue list, and coverage. Re-run as a regression suite.

## Parts (≈18–25 phases total)

- `part-1-environment-build-launch.md` — Phases 1–5: environment, build verification, installation, launch validation, first-run UX.
- `part-2-chat-composer-tools-streaming.md` — Phases 6–14: navigation, chat UX, composer, keyboard, streaming, tool-calling UI, long conversations, attachments, search, model switching.
- `part-3-navigation-settings-a11y-gestures.md` — Phases 15–20: settings, backgrounding, rotation, accessibility, dark/light, gestures/animations/scroll/haptics/safe-area.
- `part-4-debug-coverage-regression-recovery.md` — Phases 21–25: debugging/LLDB, coverage, regression, batch automation, performance/memory, error states, failure recovery, end-of-run report.

## Real app map (grounded — verify before citing)

- Router: expo-router. Public: `age-gate`, `onboarding`. Auth: `login`, `reset-password`. App: `(tabs)/_layout` + `index` (chat), `models`, `translate`, `compare`, `image`, `camera`, `scan`, `voice`, `account`, `usage`, `feedback`, `about`, `widget-setup`, `share-preview`. Legal screens.
- Key testIDs: `chat.composer.input` / `.mic` / `.send`; `chat.mode-toggle` / `.local` / `.cloud`; `add-to-chat-sheet` / `-close`; `bottom-sheet`; `artifact-copy` / `-share` / `-preview-content` / `-preview-close`; `artifacts-grid` / `-open-drawer` / `-empty-state` / `-skeleton-grid`; `age-gate-*`; `cloud-waitlist-*`; `cloud-tease-rank`.
- Key components: `Composer/Composer.tsx`, `MessageList.tsx`, `MessageBubble.tsx`, `MessageContentRenderer.tsx`, `InlineToolCall.tsx`, `ToolTimeline.tsx`, `toolIconRN.ts`, `toolCallAccumulator.ts`, `ModelSelectorButton.tsx`, `ModelPickerSheet.tsx`, `TemporaryChatToggle.tsx`, `ChatEmptyState.tsx`, `AddToChatSheet.tsx`, `MessageEditModal.tsx`, edge-cases (`MessageErrorScreen.tsx`, `ImageTooLargeModal.tsx`, `FileTooLargeModal.tsx`).

## Global conventions (every step)

1. **Locate before acting:** `snapshot_ui` → find target by `testID` (preferred) > `accessibilityLabel` > visible text → act at its frame center. Never tap blind coordinates.
2. **Wait, don't sleep:** `wait_for_ui` for the expected element before asserting.
3. **Evidence:** `screenshot` BEFORE and AFTER every interaction; `record_sim_video` around every multi-step workflow. Name files `<phase>-<screen>-<state>`.
4. **Assert expected vs actual** against the per-screen template; any mismatch → log an issue (see classification).
5. **Batch** same-screen taps with `batch`. Use `button`/`key_press`/`key_sequence` for hardware (Home, lock, rotate, Return).
6. **Two appearances:** run visual checks in BOTH light and dark mode, and at default + larger Dynamic Type.
7. **Trust boundary is sacred:** any Local-mode network egress = Critical, stop and report.

## The 44 tools → when to use

| Group            | Tools                                                                                                                                                                | Used in                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Discovery/config | discover_projs, list_schemes, show_build_settings, session_show/set/clear_defaults, session_use_defaults_profile                                                     | Part 1                   |
| Build/run/test   | build_sim, build_run_sim, clean, test_sim, get_app_bundle_id, get_sim_app_path                                                                                       | Parts 1, 4               |
| Coverage         | get_coverage_report, get_file_coverage                                                                                                                               | Part 4                   |
| Sim mgmt         | list_sims, boot_sim, open_sim, install_app_sim, launch_app_sim, stop_app_sim                                                                                         | Parts 1, 3 (relaunch), 4 |
| UI automation    | screenshot, snapshot_ui, tap, touch, long_press, double-tap (batch), swipe, drag, gesture, type_text, button, key_press, key_sequence, wait_for_ui, record_sim_video | Parts 2, 3               |
| LLDB             | debug_attach_sim, debug_detach, debug_breakpoint_add/remove, debug_continue, debug_stack, debug_variables, debug_lldb_command                                        | Part 4 (+ any crash)     |
| Batch            | batch                                                                                                                                                                | All                      |

Every tool must be exercised at least once across the run; Part 4 explicitly closes any tool not yet used.

## Per-screen verification template (apply to EVERY screen/phase)

For each screen, the agent must verify and log each item:

1. Every visible element present + correct (enumerate from `snapshot_ui`).
2. Spacing/layout/alignment sane; no clipping/overlap.
3. Parity vs ChatGPT iOS (behavior/layout conventions).
4. Parity vs Claude iOS (behavior/layout conventions).
5. Animations/transitions smooth, correct direction, no jank.
6. Safe-area handling (notch/home indicator) correct.
7. Dynamic Type: layout holds at larger text sizes.
8. Dark + light mode both correct (contrast, no invisible text).
9. Scroll physics: momentum, bounce, no stutter; long lists virtualize.
10. Haptics fire on the right actions (verify via code/observed behavior).
11. Loading states present (skeletons/spinners) — never blank.
12. Disabled states correct (e.g., send disabled when input empty).
13. Empty states present and helpful.
14. Error states present, clear, with recovery.
15. Accessibility labels on every interactive element (VoiceOver-usable).
16. `screenshot` before + after the interaction.
17. `record_sim_video` for the workflow (if multi-step).
18. `snapshot_ui` runtime hierarchy captured.
19. Auto-report any deviation as a classified issue.
20. Continue until every element on the screen has been inspected and exercised.

## Bug classification

- **Critical:** crash, data loss, trust-boundary violation (Local egress), security, app unusable, or overclaim shipped to users.
- **High:** core flow broken (send/stream/tool-call/model-switch/auth), missing/incorrect tool-call UI, blocked navigation.
- **Medium:** degraded UX, missing loading/empty/error/disabled state, parity behavior wrong, key control missing a11y label.
- **Low:** minor inconsistency, spacing/copy nits that don't block.
- **Cosmetic:** pixel/animation polish.
  Two automatic Criticals to watch: (a) any Local-mode egress; (b) any "available/public" claim for a feature whose runtime doesn't serve.

## End-of-run report (Part 4 produces this)

A single report: per-phase PASS/FAIL table; issues table `{id, severity, phase, screen, testID, expected, actual, screenshot, video, repro, suggested fix}`; coverage summary (`get_coverage_report` + weak files); tool-usage matrix (all 44 ticked); parity gaps vs ChatGPT/Claude (tool-calling + trust weighted highest); prioritized fix list. Persist artifacts under a dated run folder.
