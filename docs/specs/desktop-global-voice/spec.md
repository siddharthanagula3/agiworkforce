# Desktop global voice

Status: Current
Owner: Desktop dictation
Last updated: 2026-09-05

An OS-global dictation shortcut for the desktop product, and the ledger that
says why system-wide dictation is still refused in the native shell. Replaces
the deleted `docs/plans/desktop-system-dictation.md`, whose phase list survives
only in git; the gates it defined are reproduced below with their measured
state so no one has to recover a deleted file to know where the feature stands.
Flaw: `DESKTOP-SYSTEM-DICTATION-UNWIRED-01`.

## Two shells, two different jobs

The Electron shell is the shipped desktop product. It owns the global
accelerator, the surfacing rules, and the settings entry. The Tauri shell is
the Rust capability layer; its OS-level input hook is real but its coordinator
still refuses every global-source session, so the hook only ever emits honest
`refused` events.

## Settings

Shell settings live in `settings.json` under Electron's `userData` directory
and are edited from the tray's Shortcuts submenu.

| Key                  | Default                    | What it does                                     |
| -------------------- | -------------------------- | ------------------------------------------------ |
| `quickAskShortcut`   | `Alt+Shift+Space`          | Raises the Quick Ask surface                     |
| `screenshotShortcut` | `CommandOrControl+Shift+2` | Captures a screen into the composer              |
| `voiceShortcut`      | `Alt+Shift+V`              | Starts or stops dictation with the app unfocused |

`apps/desktop/src/lib/globalVoiceShortcut.ts` owns the dictation default and
its preset list. Both shells read that module, so the chord does not drift
between them.

The tray submenu reports a chord that could not be claimed, distinguishing a
duplicate of another AGI Cloud shortcut from one another application already
holds. Two chords that differ only in modifier spelling or order are one chord;
registration order decides which entry keeps it.

## What a press does

| Shell state                     | Behaviour                                                                   |
| ------------------------------- | --------------------------------------------------------------------------- |
| Main window focused or visible  | Focuses it, focuses the composer, toggles capture                           |
| Main window hidden or minimised | Raises the surface Quick Ask raises, focuses the composer, toggles capture  |
| Quick Ask panel already open    | Targets the panel without closing it, focuses its composer, toggles capture |
| No window at all                | Notifies that AGI Cloud must be opened from the tray first                  |

A press toggles: the first starts capture, the second stops it. There is no
key-up from a registered accelerator, so hold-to-talk is not available on this
path. Stopping runs the existing capture, transcription, cleanup and
classification pipeline unchanged, so a dictation transcript lands in the
composer draft and an action transcript still goes through computer-use
consent.

Only the renderer AGI Cloud ships receives the press. With
`AGI_CLOUD_RENDERER=remote` the shell loads the cloud app top-level with no
preload and therefore no IPC receiver, so the press is logged and reported once
as unavailable rather than silently dropped.

## Language

The transcription request carries the user's language setting reduced to its
primary subtag, because the transcription slot rejects a region-qualified tag.
An unset or unrecognised value omits the field entirely, which leaves detection
to the provider. `apps/desktop/src/lib/voiceLanguage.ts` owns that rule and
draws its language list from `@agiworkforce/i18n`, the canonical owner.

## Release gates for system-wide dictation

`system_dictation_available()` is a compile-time `false` on every OS. These are
the gates that decide when it may change, and their state as measured from the
code on 2026-09-05.

| Gate                                                                                                    | State                                                             |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Listener start, stop and restart leak no threads or duplicate events                                    | Met, single-spawn hook with lifecycle tests                       |
| Holding and releasing the chord produces exactly one session                                            | Met, edge detector with key-repeat suppression and tests          |
| A focus change cannot inject into the wrong application or field                                        | **Not met**, injection has no target pinning or revalidation      |
| Secure fields receive no context read, transcript, clipboard or input                                   | **Not met**, no secure-field refusal exists                       |
| Local mode passes an offline network-denial test                                                        | Unverified                                                        |
| BYOK and managed modes show the target and never cross boundaries                                       | Partially met, no target is shown on the global path              |
| Device loss, sleep, crash, network loss, timeout and relaunch recover the transcript                    | **Not met**, no global capture pipeline exists; a release cancels |
| Unicode, emoji, RTL, CJK, code, Markdown and long text insert with undo                                 | **Not met**, injection is an untested synthetic typing call       |
| Dictionary and snippet precedence is deterministic                                                      | **Not met**, neither exists                                       |
| Overlay works on multiple monitors, full screen and reduced motion                                      | Unverified                                                        |
| No raw audio, transcript or surrounding text reaches logs                                               | Unverified                                                        |
| Notarised macOS, signed Windows, packaged Linux, updater and rollback pass on the feature-enabled build | **Not met**, needs a signed build                                 |

macOS is the intended first OS and still fails six gates, four of them because
the safe-target and injection work is not written and one because it needs a
signed, notarised build. Windows and Linux stay disabled behind the same
gates, plus Linux's UI Automation service, which is a permanent stub that
errors on every call.

Nothing here may flip the capability flag from settings or UI code.
