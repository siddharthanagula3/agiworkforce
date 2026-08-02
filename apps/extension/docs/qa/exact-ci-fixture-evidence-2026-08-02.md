# Chrome Extension Exact CI-Fixture Evidence — 2026-08-02

Status: Exact deterministic fixture; deliberately non-routable and non-publishable

## Artifact identity

| Item            | Value                                                              |
| --------------- | ------------------------------------------------------------------ |
| Artifact        | `apps/extension/extension.zip`                                     |
| Archive entries | 267                                                                |
| Bytes           | 1,262,049                                                          |
| SHA-256         | `5ffbc4905a4573ed9e38d8a20a0304b72d7c3960d821e41bcaf17eb9382e5494` |

The verifier rejected ambiguous and unsafe archive forms, extracted these exact
bytes, and loaded the extracted directory in Chromium. The fixture disables
real routing, so screenshots cannot expose a real account, bearer, provider,
or paid computer-use action.

Local verification for the audited tree passed 100 files / 1,425 tests,
typecheck, lint, no-cloud-IPC and no-hex guards, package verification, and the
exact-package Chromium smoke.

## Visual evidence

Capture host: macOS 26.5.2 with Google Chrome 150.0.7871.187. Each image was
visually inspected after capture and copied into this durable directory without
changing its bytes.

| Test case       | State                                                                          | Capture                                                                                       | Dimensions | SHA-256                                                            |
| --------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------ |
| `CHROME-EV-001` | Synthetic computer-use run with visible Stop and Ask-before-acting             | `screenshots/exact-ci-fixture-2026-08-02/CHROME-EV-001-computer-use-stop-running.png`         | 400×800    | `671d9bb35aac2fcda95f77f5414dd19b1e58498f31dbb3d91e1730fb6729532b` |
| `CHROME-EV-002` | Local Options remains available while account state is signed out/fails closed | `screenshots/exact-ci-fixture-2026-08-02/CHROME-EV-002-options-local-settings-signed-out.png` | 1280×1466  | `20b3954bf38c4cb64e0c89c8b1bbc9882698e68e19e43b21a53fcea3b473a450` |
| `CHROME-EV-003` | Signed-out local side panel with page-access boundary and Cloud sign-in prompt | `screenshots/exact-ci-fixture-2026-08-02/CHROME-EV-003-side-panel-signed-out-local.png`       | 400×800    | `c48c618db3c422c4bab6fba74ff07d6d73eaea35e3774d22078c612f581a492c` |

## Limits

These captures prove only the exact deterministic fixture states. They do not
prove Chrome Web Store signing/installation, live Clerk A-to-B transitions,
paid-gateway CDP cancellation, permission prompts on real target sites, or the
installed Desktop native host/HMAC/reconnect lifecycle.
