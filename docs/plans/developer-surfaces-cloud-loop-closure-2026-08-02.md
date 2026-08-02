# Developer Surfaces And Desktop Cloud Loop Closure

Status: Active

Owner: Developer surfaces + Desktop

Last updated: 2026-08-02

## Goal

Close the user-visible and trust-boundary loops for the Chrome extension,
VS Code extension, CLI, and Desktop Managed Cloud before calling any of those
surfaces end-to-end complete. This plan distinguishes source-complete behavior
from release-complete behavior: mocks, unit tests, builds, or a rendered shell
cannot substitute for a signed artifact running against the real host and an
authenticated backend.

## Locked Boundaries

- Chrome owns browser-local conversations. They never join normal app-chat sync
  implicitly, and signed-in state is scoped to the exact account and auth
  incarnation that created it.
- VS Code is a presentation adapter over the CLI app server. It does not own a
  second agent loop, transcript store, approval engine, or provider session.
- The CLI owns the local developer session, project trust, tool execution,
  persistence, and protocol. Headless entry points are not trust bypasses.
- Desktop is one application with separate Local, BYOK, and Managed Cloud trust
  boundaries. A Managed run remains bound to the account/session that started
  it, including nested agents and approved computer-use work.
- Cancellation is an authority transition, not a cosmetic UI state. After
  Stop, sign-out, account change, mode change, owner-tab change, or teardown,
  no later model chunk, browser action, OS action, approval result, or cancel
  request may use ambient credentials or mutate the replacement session.

## Definition Of Done

| Level             | Required evidence                                                                                                                                                                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Source-complete   | Production path inspected; runtime inputs validated; owner and cancellation invariants covered by regression tests; smallest checks and full surface checks green; user-visible path exercised in its real local host.                                                                                                   |
| Artifact-complete | Production extension/application/CLI artifact is built, inspected, and installed from the exact bytes under test; no test source, source maps, secrets, or undeclared runtime dependency is shipped.                                                                                                                     |
| Release-complete  | Supervised authenticated runs pass against deployed services and real native/browser hosts, including A-to-B account changes, Stop during an in-flight privileged action, entitlement/quota errors, reconnect, and cleanup. Signing, notarization/store packaging, migrations, and provider credentials are also proven. |

Passing source-complete does not imply artifact-complete or release-complete.

## Audit Findings And Disposition

### Chrome extension

| Finding                                                                                                                                                                                  | Disposition                                                                                                                                                                                                                     | Required proof                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser history, active pointers, and managed streams could outlive sign-out or an A-to-B account transition and use ambient current credentials.                                        | Fixed locally: state is partitioned by `{accountId, authIncarnation}`; the initiating token/owner is captured; auth transition aborts work; stale chunks/results are rejected.                                                  | Local owner-transition regressions, full suite, and unpacked Chromium smoke pass; a live Clerk A-to-B managed turn remains an external gate.  |
| The detached CDP computer-use loop had no durable run owner or AbortSignal, so closing the panel, signing out, changing tab, or pressing Clear could leave page capture/actions running. | Fixed locally: the exact run owns account/incarnation/tab/window/URL, captured credentials, an AbortController, pre-start tombstone, visible Stop, and stale-broadcast suppression.                                             | Local cancellation/race regressions and unpacked Chromium Stop lifecycle pass; live paid-gateway CDP Stop remains an external gate.           |
| Side-panel keepalive rejection and trusted-UI target-tab routing failed in real Chromium.                                                                                                | Fixed in this loop.                                                                                                                                                                                                             | Unpacked Chromium smoke exercises side panel, options, autofill, history, and WebMCP generation.                                              |
| Conversation mutation races, unbounded history/event reads, stale WebMCP discovery, delete-current generation races, and fake Quick execution were reachable.                            | Fixed in this loop with serialized ownership, bounded 4 MiB reads, live generations, metadata clearing, and request-only Quick semantics.                                                                                       | Full unit suite plus unpacked Chromium smoke.                                                                                                 |
| The browser smoke loaded `dist/` instead of the ZIP being released, the verifier accepted ambiguous/special archive entries, and an auth outage could leave Options blank.               | Fixed: one verified ZIP is safely extracted and loaded by Chromium; duplicates, case collisions, special entries, excessive expansion, and corruption fail closed; Options renders browser-local controls before auth resolves. | Exact-package smoke, malicious-archive regressions, and the Options outage regression.                                                        |
| Native-message HMAC and the installed Desktop host have not been exercised together from the packaged extension.                                                                         | Open external release gate.                                                                                                                                                                                                     | Signed/installed native host, real extension ID/manifest, valid and invalid HMAC exchange, disconnect/reconnect, and explicit handoff review. |

### VS Code extension

| Finding                                                                                                                                                                                                                                                                             | Disposition                                                                                                                                                                                                                        | Required proof                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The native `@agi` participant could resume a stored thread without one complete authoritative record for thread ID, model/provider, trust mode, and workspace state.                                                                                                                | Fixed: one response metadata record owns the authority tuple; partial/legacy metadata starts fresh; resume revalidates the CLI-hosted thread and exact tuple.                                                                      | Participant regressions plus real Extension Host activation/command run.                                                                                                                                                             |
| An approval modal could resolve after Stop or New Chat and surface a stale continuation/error into the replacement turn.                                                                                                                                                            | Fixed: cancellation, terminal state, active turn, and thread identity are rechecked after the modal and before error presentation.                                                                                                 | Deferred-modal regressions in native participant and sidebar state manager.                                                                                                                                                          |
| Cancellation during deferred native-participant admission could return before the CLI had created a turn, allowing that late turn to continue without a matching interrupt acknowledgement.                                                                                         | Fixed: admission assigns the exact turn ID, keeps the event subscription open, awaits `interruptTurn`, and surfaces a failed acknowledgement instead of claiming Stop.                                                             | Native participant race regression plus the real Extension Host suite.                                                                                                                                                               |
| `VSCODE-NATIVE-LOCAL-MODEL-AUTHORITY-01`: an unknown configured model could bypass exact local discovery, collapse to `auto`, and start a CLI thread without the discovered local provider as part of its routing authority.                                                        | Fixed: static catalog IDs and `auto` resolve without discovery; every unknown ID must exactly match CLI local-model discovery; the discovered provider is passed to `startThread`; start/resume fail closed on tuple drift.        | 39 focused participant regressions, 840 full unit tests, 63 webview tests, typecheck/lint, and the installed-turn loopback harness. The unlocked installed native-turn run remains open.                                             |
| The production VSIX shipped compiled Extension Host tests under `out/test/`; the verifier did not reject them.                                                                                                                                                                      | Fixed: `.vscodeignore`, package preflight, artifact verifier, and a package-list regression exclude/reject `out/test/`.                                                                                                            | Rebuilt VSIX inspection and hash, full unit/webview suites, real VS Code Extension Host.                                                                                                                                             |
| `VSCODE-PACKAGED-TEST-RUNNER-MAPPING-01`: the actual-install harness loaded a dedicated runner extension but left `extensionTestsPath` in the source tree, outside every Extension Host mapping, so VS Code could not attribute `require('vscode')` and the packaged suite stalled. | Fixed: only the compiled fixture/loader/smoke files are copied into the disposable runner extension; the test entry is now inside that extension root while the production extension still loads only from the installed registry. | Focused runner-copy regression, test TypeScript compile, lint, exact installer/list/byte checks, and an Extension Host launch with no unmapped-`vscode` warning. The macOS lock still blocks completion of the UI/native-turn cases. |
| A clean VSIX still requires a separately installed `agi` binary or an explicit `cliPath`.                                                                                                                                                                                           | The distribution contract is now an explicit prerequisite, not bundling or runtime download. The extension never downloads or silently fetches a CLI.                                                                              | Exact VSIX clean-profile test with stripped `PATH`, missing-CLI remediation, an absolute verified CLI, exact protocol/version, restart/shutdown, removal, upgrade, and uninstall.                                                    |

### CLI and shared developer protocol

| Finding                                                                                                                                                                                                           | Disposition                                                                                                                                                                                                                                              | Required proof                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agi app-server` was not classified as project-trust-sensitive, allowing a headless developer host to start in an untrusted repository.                                                                           | Fixed: app-server now passes the same per-project trust gate before project config, persistence, or network access.                                                                                                                                      | Release-binary PTY and direct app-server denial in fresh untrusted repositories plus Rust integration tests.                                                                           |
| First-run decline and an already-configured global profile could still be mistaken for project consent.                                                                                                           | Fixed and verified: first-run decline exits before project state; every developer invocation evaluates repository trust independently.                                                                                                                   | Fresh-home PTY runs for first install, configured-home/new-repo, malformed project config, and headless execution.                                                                     |
| CLI/VS Code protocol state had previously drifted across versions and ownership layers; the v7 handshake incorrectly reported transport crate version `0.1.0` for CLI `1.7.1`.                                    | Fixed at exact protocol v7 with CLI-owned history, queue, steer, cancellation, approvals, caps, thread authority, and owning-executable version reporting.                                                                                               | Full CLI Rust suite, stdio/WebSocket integration, exact release-archive smoke, and exact-VSIX client execution.                                                                        |
| Active-turn subprocesses used mixed spawn/wait patterns, so timeout, interrupt, or future drop could leave descendants running after the CLI claimed cancellation.                                                | Fixed: one process-tree supervisor owns and reaps the child, streams stdio concurrently, and terminates the Unix process group or Windows task tree across bash/sandbox, hooks, search, PowerShell, git/worktree, and LSP paths.                         | Timeout/drop and real app-server interrupt sentinels plus the full CLI suite; Windows runtime proof remains open.                                                                      |
| `CLI-LMSTUDIO-ENDPOINT-AUTHORITY-01`: LM Studio discovery and availability could honor a configured local base URL while streaming silently returned to the compiled `localhost:1234` authority.                  | Fixed: discovery, availability, and chat completions now share one normalized, validated configured base; Ollama reuses the normalized probed base; unsupported local providers fail explicitly.                                                         | Random-port `/v1/models` plus `/v1/chat/completions` regression, URL safety/normalization tests, and the full CLI package suite.                                                       |
| The explicit VS Code prerequisite was not publicly installable: the hosted installer and npm package returned 404, Homebrew had placeholder hashes, and the only GitHub release predated v7 and signed checksums. | Partially fixed locally: npm credentials no longer block the separately signed GitHub archive channel, native release archives smoke after extraction, and the primary plus compatibility alias are checked. Public v1.7.1 publication remains external. | Protected `v-cli-1.7.1` release with `SHA256SUMS` and Sigstore bundle, hosted installer or corrected docs, atomic upgrade/rollback, uninstall, and clean macOS/Linux/Windows installs. |
| A live Local, BYOK, and Managed provider turn with real credentials is outside deterministic CI.                                                                                                                  | Open external release gate.                                                                                                                                                                                                                              | Supervised matrix using catalog IDs only, secret-safe logs, cancellation, reconnect, quota/rate-limit, and provider failure.                                                           |

### Desktop Managed Cloud

| Finding                                                                                                                                                                                                    | Disposition                                                                                                                                                                                                                     | Required proof                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native Managed goals, swarm work, and subagents could read the ambient bearer after an A-to-B account/session transition.                                                                                  | Fixed: native auth exposes account/session generation ownership and exact-bearer reads; ownership propagates through sequential, parallel, auto, swarm, and subagent execution.                                                 | Rust ownership/account/swarm tests plus a supervised A-to-B run.                                                                                                  |
| An approved Cloud voice action could launch a long privileged native computer-use task with no execution ID or cancellation path; boundary reset only hid the dialog.                                      | Fixed locally: one UUID owner crosses renderer/native, one global OPA owner exists, Stop-before-register is remembered, shutdown is acknowledged, malformed results fail closed, and failed Stop retains a focused recovery UI. | Renderer and Rust cancellation suites pass; a native Tauri Stop during a real privileged OS action remains an external gate.                                      |
| Managed chat/session/auth transports could retain stale requests across sign-out or account change, and Local-to-Cloud file grants needed native ownership.                                                | Fixed locally with request contexts, session generations, exact bearer cleanup, owned opaque grants, bounded transfer, rollback, and same-account-incarnation ownership for composer attachments and delayed folder selection.  | Desktop/unit/shared-contract checks and the native Tauri Cloud entry/chat WDIO loop pass; real auth/backend ownership transitions remain an external gate.        |
| Native OPA completion results and renderer Stop acknowledgements were trusted by shape/truthiness, and completed execution IDs could immediately reacquire authority.                                      | Fixed locally: tagged completion reasons and success invariants are validated, only exact boolean `true` releases the renderer owner, and a bounded native replay cache rejects recently completed UUIDs.                       | Malformed-result/acknowledgement regressions and 11 focused native tests; the replay cache is deliberately bounded to 256 IDs.                                    |
| The isolated WDIO bundle still ran the production startup installer for browser-global native-messaging manifests, so a native test could replace Chrome/Edge's registration with a repository debug host. | Fixed: bundle identifiers with a `wdio` component return `SkippedTestHarness` before the manifest installer is called; normal production identifiers retain installation.                                                       | Focused Rust tests plus a guarded 6-test native WDIO rerun that left both manifest SHA-256 values and mtimes unchanged.                                           |
| A live authenticated Managed turn, real microphone/upload, signaling/WebRTC, and privileged OPA run are not proven by mocked auth/cloud tests.                                                             | Open external release gates.                                                                                                                                                                                                    | Supervised packaged-app matrix with deployed backend, real account/entitlement, native permissions, disconnect/reconnect, Stop, sign-out, retention, and cleanup. |

## Verification Ledger

This table records the current local evidence. Counts must be replaced, not
silently carried forward, after any later production-path edit.

| Surface | Current local evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | State                                                                                                                                                                                                                                                                           |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VS Code | 840 unit tests in 69 files; 63 webview tests in 11 files; typecheck and lint green; 6/6 source Extension Host checks. The exact 17-entry, 382,906-byte VSIX (SHA-256 `9a97cee1eded5292f387d2f1aad2cd30b1b15d5a9408a45b0b5038e4d432b054`) was installed by VS Code 1.131 into an isolated registry, publicly listed as `agiworkforce.agi-workforce@0.3.0`, byte-compared with the extracted artifact, and loaded from the installed root with an empty executable `PATH` and the absolute exact CLI. The native loopback-turn run was interrupted after macOS locked and before the fixture received a request. | Source-regression complete for audited authority/cancellation paths, and actual local VSIX installation is proven. A completed installed `@agi` turn/approval/Stop/resume, signed CLI acquisition, Marketplace distribution, and install/update/rollback/uninstall remain open. |
| CLI     | Full package test run green; library 1,795 passed with 1 ignored; stdio 1/1, WebSocket 2/2, hooks 12/12, plugins 8/8, developer-session host 4/4, JSONL 2/2. One extracted two-binary archive passed version/help/doctor/features/v7 initialize and reported CLI version `1.7.1`: archive SHA-256 `c7365dabf23c6a7ab11601219e655ab31ee6a7c05d0f46b1810cb4fc1a2e6b71`; `agi` SHA-256 `6d9e5c3307e3f4ba2bf9a3906cc053e9e365a09cd1d2958c585fdbd773966adb`; alias SHA-256 `66b32e9b6c3b206373d65d6e01a9e196114ba4f262f8b87dd66b63dc2a767a88`.                                                                      | Source-complete for audited no-credential flows and exact local archive execution; the binary is only ad-hoc signed. Signed public release, Windows process-tree, installer lifecycle, and live provider matrix remain open.                                                    |
| Chrome  | 100 files / 1,425 tests, typecheck, lint, no-cloud-IPC and no-hex guards. One verified 267-entry, 1,262,049-byte CI-fixture ZIP (SHA-256 `5ffbc4905a4573ed9e38d8a20a0304b72d7c3960d821e41bcaf17eb9382e5494`) was safely extracted and loaded by Chromium; side panel, local Options during auth failure, owner/history/quick/slash, persistence, Stop, autofill, and WebMCP passed. Symlink and case-collision regressions pass.                                                                                                                                                                               | Source-complete for audited flows and exact CI-fixture ZIP execution; the fixture is deliberately non-routable/non-publishable, so signed store/native-host, Clerk A-to-B, and paid-gateway CDP checks remain open.                                                             |
| Desktop | 245 files / 2,346 passed with 1 skipped; unified-chat 75 files / 857; typecheck and lint green for both; 11/11 focused native cancellation tests; `cargo check`, custom-protocol Tauri build, and 2 native WDIO spec files / 6 tests green. A guarded rerun left Chrome and Edge manifest hash `f121ee60699ca37bb436b2f8885e81de667eac424a266a258c2a331fb0359cda` and mtime epoch `1785669512` unchanged.                                                                                                                                                                                                      | Source-complete for deterministic renderer/native ownership and mocked Cloud entry/chat paths; live authenticated/backend/native-permission and signed-artifact matrix remains open.                                                                                            |

Cross-cutting proof: `pnpm check:llm-operability` passes after refreshing the
generated contract registry to 275 protocol types and removing the now-stale
`webmcpToolsByTab` write-only allowlist entry.

## Reference Images And Provenance

Reference images establish observable layout, labels, hierarchy, and safety
prompts only. They do not authorize copying proprietary source, assets, model
IDs, private APIs, or backend design.

### Live local visual evidence

| Surface        | Existing image                                                                                                                   | SHA-256                                                            | Behavior used as reference                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Chrome         | `/Users/siddhartha/Desktop/chatgpt_reference/149-chatgpt-web-extension-panel-empty-state-new-task.png`                           | `c04ca3da456f5910aeca9ed8a4a91f2f28e98dade36ad932ac499861f8c2fd7b` | Narrow side-panel composition, task scope, composer, permission state, and Stop/send placement.                        |
| Chrome/Desktop | `/Users/siddhartha/Desktop/chatgpt_reference/155-codex-macos-settings-computer-use-chrome-permissions-cdp.png`                   | `03322b443b7296c2a86182b33a7cb368cf9fca36f9ae9aef8c4f20987844f580` | Separate browser-action permission classes, per-site policy, connection state, and explicit elevated-risk CDP control. |
| VS Code        | `/Users/siddhartha/Desktop/chatgpt_reference/004-codex-vscode-ext-onboarding-intro-ask-codex-anything-step1.png`                 | `1b8f6b459a023485f3dd20974989dc3fe4fb5142755d4d96a49d0a29023a2ced` | IDE-native onboarding and compact composer.                                                                            |
| VS Code        | `/Users/siddhartha/Desktop/chatgpt_reference/009-codex-vscode-ext-permission-confirm-modal-turn-on-full-access-warning.png`      | `5cf3f475664999475ba15eebfff6dc3940f535d18aeaea334f6b2dc6a9bc9eb4` | Consequence-specific permission warning and explicit cancel/confirm.                                                   |
| VS Code        | `/Users/siddhartha/Desktop/chatgpt_reference/010-codex-vscode-ext-plugins-menu-add-files-goal-plan-mode-plugins-list.png`        | `589cb29fd62112d607c5711943910eff94510ef4746867a8e893a51fa6bd3c65` | One add menu for files, goal, plan mode, and discoverable capabilities.                                                |
| VS Code        | `/Users/siddhartha/Desktop/claude_reference/133-claude-code-vscode-ext-extension-command-menu-context-model-effort-thinking.png` | `bd90a26e9aea0b62f14b0a30ae04a43f62097a447e43b63d7f297bc35e1712b5` | Context actions, clear/rewind, model/effort, account/usage, and visible active mode.                                   |
| VS Code        | `/Users/siddhartha/Desktop/claude_reference/134-claude-code-vscode-ext-extension-attach-menu-upload-context-browse-web.png`      | `3f42bf9105b980427635f8a3e18d2e19e63c17ca85fe32c34cd1816144f8d542` | Explicit upload/context/web choices and local/web session separation.                                                  |
| Desktop        | `/Users/siddhartha/Desktop/chatgpt_reference/079-codex-macos-chat-empty-state-agiworkforce-quick-actions.png`                    | `16c73a0b9ff20696b883456257ee57e0f85b5bba013ac703b63531a3cfada51e` | Visible project, Local status, branch, permission mode, model, microphone, and quick actions.                          |
| Desktop        | `/Users/siddhartha/Desktop/claude_reference/138-claude-desktop-home-launcher-chat-mode-quick-actions.png`                        | `40f76509b7899dee512678199501c7033109983972613da9aecc7c91b655e865` | App-level sidebar, recent work, mode choice, usage warning, model, voice, and empty-state hierarchy.                   |
| Desktop (AGI)  | `/Users/siddhartha/Desktop/Screenshot 2026-08-01 at 11.33.54 PM.png`                                                             | `7fee7e408e02349a9c754131dead179df42a4cce85c73cada9a8d357e6890816` | Failure-state evidence: Cloud sign-in rejection remains explicit and Local stays available.                            |

`docs/reference/REFERENCE_INDEX.md` still points at an absent
`/Users/siddhartha/Desktop/reference` corpus, so it is not reproducible evidence.
The live `chatgpt_reference` and `claude_reference` directories above are the
current competitor-image corpora. They are not the only requirements inputs.

### Pinned clean-room requirements bundle

`/Users/siddhartha/Desktop/reference-for-apps` is a user-provided clean-room
specification with reference date 2026-07-19. Its provenance classes mean
Published (`P`), Benchmark (`B`), Inferred (`I`), and Non-applicable (`N/A`). It
is a requirements oracle only: generated APIs, schemas, routes, vendor aliases,
model names, and normative mechanisms are never proof of an AGI implementation.

| File                                 | SHA-256                                                            |
| ------------------------------------ | ------------------------------------------------------------------ |
| `README(2).md`                       | `a1ffd8806f56f37cb0e752795e58887403443b5e853f8beffb341db4a939c38a` |
| `00-reference-model.md`              | `ebf224dc9f238abf9a56f8339dfca09bc391674aae1c14994cb11929f680a500` |
| `04-cli.md`                          | `77dec3fc8d7f1bd01825213516548e5e033bc9a505bad638277e1c857d4b1883` |
| `05-vscode-extension.md`             | `a16b1dc1829c30b23bfcc0595241e243ac6537682475cb10355efa11c7fc872e` |
| `06-chrome-extension.md`             | `bfa2b42a0019804f68d7ed1121a93c21fbda9ab4d89e317450c4603c7a877565` |
| `07-shared-backend-runtime.md`       | `bd9f378f7479dc2990fc6d8b4849f7bc390dc7c31ff3835f2bae2648eac109e9` |
| `08-security-operations-metering.md` | `b9e10893ef8d202d942c76c6f907524b9c08de5e633c6322060194c863758295` |
| `09-api-data-contracts.md`           | `1d85bf0ccd89392b06c1ef7caa1ed78d67b6328b9e255671eede99d788aec53c` |
| `10-state-machines.md`               | `9a9fdfe27c4bd8b8f80d7f53f461f0460467357b15851679a778dda7a74d9b3b` |
| `11-qa-test-catalog.md`              | `0a6fe5b07b04fd1c78d11cd49d6544c18d8f9fc45a7f77b03b1b3fb1b056b0d3` |
| `12-parity-nonapplicable-matrix.md`  | `0fa8e5b596d586b2099bd027cf88b42babec1a7fd20eaa0cca115e3978408b78` |
| `13-source-register.md`              | `071611e7b9847d6d2e6c7866400132a458d09076419c21297c421d97e7cb7492` |
| `14-projects-memory-reference.md`    | `94c5668bd46726184d3d3787be935381753c663dcfd2544bcd818909dfe52971` |
| `15-administration-reference.md`     | `512e33c8b613dabef4c1f036e9f1d096cf3c579750613b861a0c592d56c2ea02` |
| `16-chatgpt-claude-differences.md`   | `2df82087adc5c950147434a7c3d1231f84b8684d558b54d21b51999fbe086ce3` |
| `cli-subcommands.csv`                | `44cbf7d54396bc14bbbb9337bb48cbd19fe7fc9dde0d0face745204657402fb7` |
| `cli-slash-commands.csv`             | `96b3f6f05651af31257aa098f5249d8f79896bb0b875847686ddb1e232bb1915` |
| `evaluation-framework-parity.csv`    | `6ef5c4072e0982452c29d1748abf3a84cf8be637bd6f492c2e22e58e44ae1382` |
| `feature-traceability.csv`           | `b6983d1a1a9ddb7379d47774103e5108b71b510f6d59fc2610078e54c6c7028c` |
| `mode-divergence-matrix.csv`         | `1eae421f3ad61b0b1a1525789b348ee97e329298630ec80609a0dc943cf64e2c` |
| `acceptance.feature`                 | `1672e28efb68521c56b75dcb2ae5cac633b3a2866a2f54e85016cd41b009d69a` |
| `openapi.yaml`                       | `46b0c57cf8cc81266f7eb444fc2ac67ad20fd9b6c75f86d9cfafb488a20858db` |
| `COVERAGE_REPORT.md`                 | `a7b502479c55c1e9a0ff0ad27c9a3bdb1b842b4f3b1921fbadd0c6c1147e9179` |
| `MASTER_SPEC.md`                     | `0216ab5cf106e4b55824e46caf5ba647f7d340d57acdf077bc8ccbdeeda36ee7` |

The trace contains 1,544 rows for these surfaces: CLI 540, VS Code 508, and
Chrome 496. Before parity can be claimed, every applicable row needs an AGI
implementation/test owner or an explicit product-lock-backed disposition, and
every `N/A` row needs both UI absence and forged-invocation rejection.

The CLI command benchmark has now been source-traced. `Exact partial` means the
name exists but the benchmark behavior is incomplete; it does not count as
completion.

| Family            | Exact/core                                                                                                                                         | AGI-equivalent                                                     | Intentional exclusion | Open or exact-partial                                                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 20 Clap commands  | `app-server`, `completion`, `doctor`, `login`, `review`, `resume`                                                                                  | `codex` → bare `agi`                                               | `cloud`               | `app`, `apply`, `archive`, `debug`, `delete`, `exec-server`, `mcp`, `mcp-server`, `unarchive`; partial: `exec`, `fork`, `logout`            |
| 34 slash commands | `/clear`, `/compact`, `/diff`, `/model`, `/plan`, `/fork`, `/review`, `/status`, `/init`, `/fast`, `/help`, `/history`, `/new`, `/resume`, `/exit` | `/keymap`, `/agent`, `/personality`; partial: `/vim`, `/reasoning` | `/apps`, `/cloud`     | `/ide`, `/subagents`, `/plugins`, `/hooks`, `/goal`, `/worktree`, `/task`, `/feedback`, `/mcp`, `/approve`, `/raw`; partial: `/permissions` |

Do not add the competitor-branded `codex` name or separate `cloud`, `/cloud`,
or `/apps` surfaces. Fix or remove misleading partial controls first: inert
debug/verbose behavior; safe session archive/unarchive/delete; MCP management
and a real or explicitly removed `mcp-server`; and the registered-but-partial
slash actions. Reuse the existing session store, app-server, approval, plugin,
hook, and worktree owners rather than creating parallel mechanics.

Limitations: the bundle is a flattened export whose documented internal paths
do not resolve; its source-group mappings and benchmark-card counts conflict;
its 53 official URLs have retrieval dates but no archived bodies/checksums; and
it has no `LICENSE`, `NOTICE`, or origin manifest. `MASTER_SPEC.md` and
`COVERAGE_REPORT.md` are derived, not substitutes for the component files and
CSV matrices. Its `.mcp.json` is untrusted data and must not be executed. Current
official docs must be rechecked before adopting fast-moving behavior.

### AGI-owned capture matrix

| Surface | Exact-artifact captures required                                                                                                             | Current state                                                                                                                                                                                                                           |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chrome  | Signed-out/local side panel, local Options under auth failure, permission prompt, active action plus Stop, and CDP/native-bridge risk state. | Three durable exact CI-fixture captures now prove signed-out/local and synthetic Stop states; permission/CDP/native-bridge, signed-store, and authenticated states remain open.                                                         |
| VS Code | CLI-missing remediation, connected protocol/version, untrusted workspace, approval, and active Stop from the installed VSIX.                 | Exact VSIX installation/list/byte identity is proven on VS Code 1.131, but no qualifying installed-`@agi` capture exists. The loopback run ended at the macOS session lock before any fixture request; all listed captures remain open. |
| CLI     | First-run trust, command registry, TUI mode/provider labels, approval/Stop, and structured output from the extracted release archive.        | First-run trust/provider-choice is durably captured from the exact extracted binary; command registry, mode/provider labels, approval/Stop, and structured-output images remain open.                                                   |

Durable captures must record artifact SHA-256, date, OS/host version,
mode/account state, and test-case ID. Competitor images never become product
assets.

The current exact Chrome fixture produced these inspected durable captures:

| Test state                                    | Capture                                                                                                              | Dimensions | SHA-256                                                            |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------ |
| Synthetic computer-use run with visible Stop  | `apps/extension/docs/qa/screenshots/exact-ci-fixture-2026-08-02/CHROME-EV-001-computer-use-stop-running.png`         | 400×800    | `671d9bb35aac2fcda95f77f5414dd19b1e58498f31dbb3d91e1730fb6729532b` |
| Local Options while fixture auth fails closed | `apps/extension/docs/qa/screenshots/exact-ci-fixture-2026-08-02/CHROME-EV-002-options-local-settings-signed-out.png` | 1280×1466  | `20b3954bf38c4cb64e0c89c8b1bbc9882698e68e19e43b21a53fcea3b473a450` |
| Signed-out local side panel                   | `apps/extension/docs/qa/screenshots/exact-ci-fixture-2026-08-02/CHROME-EV-003-side-panel-signed-out-local.png`       | 400×800    | `c48c618db3c422c4bab6fba74ff07d6d73eaea35e3774d22078c612f581a492c` |

These images are exact-byte evidence for the non-routable CI fixture only. See
`apps/extension/docs/qa/exact-ci-fixture-evidence-2026-08-02.md` for the artifact
manifest and limits. They do not prove authenticated Cloud, paid CDP, the
native host, or a signed store installation.

The exact extracted CLI first-run/trust capture is recorded as `CLI-EV-001` at
`apps/cli/docs/qa/screenshots/exact-archive-2026-08-02/CLI-EV-001-first-run-trust.jpeg`
(1291×768, SHA-256
`8eed7f31316fdccfdc2b90600468025d9f43c88595f7c907f43063b00ecf505b`).
Its artifact manifest and signing limits are in
`apps/cli/docs/qa/exact-archive-evidence-2026-08-02.md`. The installed VSIX
identity and interrupted native-turn attempt are recorded separately in
`apps/extension-vscode/docs/qa/exact-vsix-evidence-2026-08-02.md`; no VS Code
image is claimed.

### CLI implementation and benchmark sources

| Source                                                                                                                                                                     | Permitted use                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/cli`, especially `src/lib.rs`, `src/app_server/developer_host.rs`, `src/agent`, `src/repl`, and `src/tui`                                                            | First-party AGI CLI implementation and product behavior.                                                                                               |
| `crates/agiworkforce-protocol`                                                                                                                                             | Shared CLI/VS Code protocol and generated TypeScript bindings.                                                                                         |
| `crates/agiworkforce-model-registry` and `packages/contracts/types/src/models.json`                                                                                        | Canonical generated model/routing projection; model IDs are never copied from screenshots or memory.                                                   |
| `/Users/siddhartha/Desktop/oss-references/codex` at commit `315195492c80fdade38e917c18f9584efd599304`, Apache-2.0                                                          | Read-only open-source implementation reference with license handling; do not copy without provenance and `THIRD_PARTY_LICENSES.md` review.             |
| `https://learn.chatgpt.com/docs/codex/cli`, `https://learn.chatgpt.com/docs/codex/ide`, `https://learn.chatgpt.com/docs/app-server`, and `https://github.com/openai/codex` | Current first-party public behavior and source.                                                                                                        |
| `https://code.claude.com/docs/en/cli-reference`, `https://code.claude.com/docs/en/vs-code`, and related public Claude Code docs                                            | Public observable behavior only. The unlicensed local `/Users/siddhartha/Desktop/claude-code` tree is not an admissible source and must not be copied. |

## Ordered Release Plan

### 1. Finish and freeze the audited source paths

1. Land the Chrome account/incarnation owner and computer-use cancellation
   changes as one reviewed boundary, resolving any overlapping message unions
   before formatting.
2. Finish the Desktop Cloud voice-action cancellation audit and prove that Stop
   acknowledges actual native executor shutdown; document that a single already
   issued atomic OS input cannot be undone.
3. Run the final read-only gap audit over the resulting tree. Any reproducible
   defect returns to its owning source and receives a regression test; generated
   audit prose is not remediation.
4. Trace all 1,544 applicable/non-applicable feature-trace rows and, separately,
   disposition the 20 CLI subcommands and 34 slash commands. The command tables
   are source-traced above; the 1,544 feature rows remain open. Record
   AGI-equivalent names and product-lock exclusions rather than copying vendor
   commands.
5. Freeze production paths while host/package verification runs. A later edit
   invalidates the corresponding evidence row.

Exit: all focused and full local checks below are green, or a source-backed
blocker is recorded here and in `docs/agent-context/known-flaws.md`.

Checkpoint (2026-08-02): the audited Chrome, VS Code, CLI, and deterministic
Desktop trust-boundary, ownership, and cancellation paths are locally green;
the CLI parity and 1,544 feature-trace gaps above remain open. The repaired
native Desktop WDIO entry/chat loop also passes 2 spec files / 6 tests without
changing the user-global Chrome or Edge native-messaging manifests. Keep these
paths frozen while the artifact/live gates below are closed; any later
production edit invalidates that surface's evidence row.

### 2. Close artifact and host integration

1. Complete the chosen VSIX-to-CLI contract: an explicit, separately installed
   signed CLI prerequisite. Publish the protected CLI release, make the installer
   reachable, provide atomic upgrade/rollback and uninstall, and keep VS Code on
   exact protocol v7 with a declared minimum CLI version. Do not auto-download.
2. Build the Chrome Web Store artifact and Desktop native-message host together;
   verify manifest extension IDs, install paths, HMAC, reconnect, update, and
   uninstall on macOS and Windows.
3. Build signed CLI and Desktop release artifacts through their separate tag
   channels. Verify checksums, updater metadata, signing/notarization, package
   contents, and clean-profile launch.
4. Store AGI-owned screenshots from the exact packaged artifacts under a durable
   evidence location with capture date, build hash, surface, mode, account state,
   and test case. Do not copy competitor images into product assets.

Exit: clean-machine installs work without hidden developer dependencies and the
tested bytes equal the inspected bytes.

### 3. Run the supervised live authority matrix

| Surface       | Mandatory scenarios                                                                                                                                                                                                                                                    |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chrome        | A history is invisible to B; sign-out and A-to-B cancel an active stream; no stale delta/error appears; Stop cancels CDP before the next action; tab/window/URL drift fails closed; invalid HMAC is rejected; site/action approvals remain exact.                      |
| VS Code + CLI | Fresh trusted and untrusted repositories; CLI absent/present/update mismatch; initialize v7; send/stream/queue/steer/Stop/resume; modal approval then New Chat; Local/BYOK/Managed provider labels and secret-safe preview; quota/auth/reconnect failures.             |
| Desktop Cloud | A-to-B during chat, tool, subagent, voice, and computer-use work; Stop during native action; real microphone/file grants; generated file/image; entitlement/usage failure; network loss/reconnect; sign-out cancels before revocation and leaves Local/BYOK untouched. |

Use test accounts and reversible targets. Capture request/run/conversation IDs,
account/session generations, timestamps, artifact hashes, and screenshots without
tokens, file contents, or private allowance units.

Exit: every scenario has an expected result, actual result, build hash, and
reviewer; no account/session can observe or mutate another owner's work.

### 4. Release and observe

1. Deploy required database migrations and managed services before clients.
2. Roll out to internal, then limited public-alpha cohorts with server kill
   switches and rollback artifacts ready.
3. Monitor auth-transition cancellations, stale-event drops, native-host
   disconnects, computer-use stop latency, quota errors, and crash-free starts.
4. Re-run the unusual-behavior loop on every visited route/surface and stop on
   the first reproducible user-facing defect.
5. Promote this plan to Complete only when external gates are evidenced; move
   remaining product-parity work to its owning current plan rather than deleting
   the evidence.

## Required Commands

Use the closest command from `docs/agent-context/commands.json`; the minimum
closure set for this plan is:

```bash
pnpm --filter @agiworkforce/extension test
pnpm --filter @agiworkforce/extension typecheck
pnpm --filter @agiworkforce/extension lint
pnpm --filter @agiworkforce/extension package
pnpm --filter @agiworkforce/extension test:e2e:package

pnpm --filter agi-workforce test
pnpm --filter agi-workforce test:webview
pnpm --filter agi-workforce typecheck
pnpm --filter agi-workforce lint
pnpm --filter agi-workforce package
pnpm --dir apps/extension-vscode verify:package
AGI_VSCODE_E2E_CLI=/absolute/path/to/agi \
  pnpm --filter agi-workforce test:integration:package

cargo test -p agiworkforce-cli
cargo build --release -p agiworkforce-cli
AGI_CLI_SMOKE_BINARY=/path/to/extracted/agi \
  AGI_CLI_SMOKE_REQUIRE_ALIAS=1 \
  node apps/cli/scripts/cli-smoke.mjs

pnpm --filter @agiworkforce/desktop test
pnpm --filter @agiworkforce/desktop typecheck
pnpm --filter @agiworkforce/desktop lint
cargo check -p agiworkforce-desktop
pnpm --filter @agiworkforce/desktop run test:e2e:build
pnpm --dir apps/desktop exec wdio run wdio.conf.ts \
  --spec ./wdio/specs/cloud-mode-entry.spec.ts \
  --spec ./wdio/specs/cloud-chat-turn.spec.ts
```

The Desktop native Cloud entry/chat specs and any release-artifact installer
commands must be run from their owning runbook/config because they require the
Tauri bundle and platform host, not a browser-only Vite shell.

## Remaining Risks

- Provider credentials, deployed gateway behavior, billing/quota policy, and
  external OAuth cannot be proven by local mocks.
- A successfully issued atomic browser/OS input cannot be recalled; cancellation
  must prevent every subsequent planned action and wait for executor shutdown.
- Chrome MV3 service-worker suspension and native-host lifecycle need long-running
  packaged checks beyond a short deterministic smoke.
- Unix child processes that deliberately escape with `setsid` are outside the
  CLI process group; Windows `taskkill /T /F` still needs native runtime proof,
  and interrupting git/worktree operations cannot guarantee filesystem rollback.
- The Desktop WDIO run uses an isolated debug bundle, a mocked Cloud session,
  and deterministic local responses. It proves the native renderer/IPC/host
  entry and chat loop, but not deployed authentication, entitlement, signaling,
  microphone/file permissions, provider behavior, or privileged OS execution.
- A pre-guard WDIO run changed both user-global browser native-messaging
  manifests. Their earlier bytes were not recoverable, so the current files were
  preserved instead of guessing a restore target; the new bundle-identity guard
  is covered by Rust tests and an unchanged-hash/mtime native rerun.
- Exact local VSIX installation/list/byte identity is proven, but the VSIX/CLI
  distribution contract remains a release blocker: no current public signed v7
  CLI prerequisite is installable, the final installed VSIX has not completed a
  native turn, and upgrade/rollback/uninstall are not proven.
- Reference-image indexing is not reproducible until the absent legacy corpus is
  reconciled with the live corpora. The dated clean-room bundle also has broken
  flattened paths, inconsistent source-group/count mappings, no archived source
  bodies, and no license/origin manifest.
- The repo has no `THIRD_PARTY_LICENSES.md`; no OSS-derived code may be copied
  until compatible reuse and attribution are recorded. The unlicensed local
  Claude tree remains inadmissible.
