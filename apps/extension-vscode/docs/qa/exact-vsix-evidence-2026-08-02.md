# VS Code Exact VSIX Evidence — 2026-08-02

Status: Exact local VSIX installation proven; native-turn execution still open

## Artifact identity

| Item               | Value                                                              |
| ------------------ | ------------------------------------------------------------------ |
| Artifact           | `apps/extension-vscode/agi-workforce-0.3.0.vsix`                   |
| Extension identity | `agiworkforce.agi-workforce@0.3.0`                                 |
| Archive entries    | 17                                                                 |
| Bytes              | 382,906                                                            |
| SHA-256            | `9a97cee1eded5292f387d2f1aad2cd30b1b15d5a9408a45b0b5038e4d432b054` |

`scripts/verify-vsix.mjs` accepted the artifact and confirmed that only the
declared runtime files are present. No compiled test tree is shipped.

## Installation evidence

VS Code 1.131.0 (commit `e4c7e7b1d6d060162f4aa7f8225271b67ce1df75`,
arm64) installed a private byte-for-byte copy of the VSIX with its public CLI
into disposable user-data and extension-registry directories. The run then:

- confirmed the public `--list-extensions --show-versions` identity;
- found exactly one matching installed registry entry marked as a VSIX source;
- compared every installed regular file with the safely extracted artifact,
  allowing only VS Code's documented installation metadata container;
- loaded `agiworkforce.agi-workforce` from that installed registry root rather
  than from the source tree; and
- supplied the exact extracted CLI by absolute path while the Extension Host
  used an empty executable `PATH`, disposable homes, cleared provider
  credentials, and a disabled OS keyring.

The deterministic native-turn fixture is loopback-only and validates exact
model/provider/local-trust authority, `stream_options.include_usage`, both SSE
deltas, `[DONE]`, and persisted CLI session metadata. During this evidence run,
the first actual-install attempt exposed that the compiled tests were outside
the disposable runner extension's host mapping. The harness now copies only its
compiled fixture/loader/smoke files below the runner root; the unmapped
`require('vscode')` warning is gone. A repeat launch remained blocked after
macOS locked, before the Extension Host reached the selected tests. The fixture
recorded zero model and chat requests, and both attempts were interrupted and
cleaned up. This manifest therefore does not claim a completed native `@agi`
turn.

The production authority regressions pass: 39/39 focused native-participant
tests, 840/840 full extension unit tests, 63/63 webview tests, typecheck, and
full extension lint. Static catalog models and `auto` no longer depend on
discovery; an unknown model must be exactly discovered from the CLI; its
discovered local provider is carried into `startThread`; and resume fails
closed on thread/model/provider/trust authority drift.

## Limits

Still open: an unlocked rerun of the installed native turn, installed approval
and Stop/resume captures, Marketplace distribution, a separately signed public
CLI prerequisite, clean-machine install/update/rollback/uninstall, and live
Local/BYOK/Managed providers. No screenshot is recorded here yet.
