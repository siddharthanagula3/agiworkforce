# CLI Exact Local Archive Evidence — 2026-08-02

Status: Local release-style fixture; not signed-release evidence

## Artifact identity

The artifact was built from the audited working tree with:

```bash
cargo build --release --target aarch64-apple-darwin -p agiworkforce-cli
```

The two-binary archive was assembled outside the repository and then extracted
before execution. Its identity is:

| Item                                         |      Bytes | SHA-256                                                            |
| -------------------------------------------- | ---------: | ------------------------------------------------------------------ |
| `agiworkforce-darwin-arm64.tar.gz`           | 10,558,220 | `c7365dabf23c6a7ab11601219e655ab31ee6a7c05d0f46b1810cb4fc1a2e6b71` |
| Extracted `agi`                              |  9,321,584 | `6d9e5c3307e3f4ba2bf9a3906cc053e9e365a09cd1d2958c585fdbd773966adb` |
| Extracted `agiworkforce` compatibility alias |  9,321,600 | `66b32e9b6c3b206373d65d6e01a9e196114ba4f262f8b87dd66b63dc2a767a88` |

Both extracted binaries are Mach-O arm64 executables and report `agi 1.7.1`.
The local binaries are ad-hoc/linker signed, have no Team Identifier, and are
rejected by Gatekeeper assessment. They are not notarized public artifacts.

## Behavioral evidence

The exact extracted primary binary passed the isolated no-credential smoke:

```bash
AGI_CLI_SMOKE_BINARY=/tmp/agi-cli-final.XsFs7v/extracted/agi \
  AGI_CLI_SMOKE_REQUIRE_ALIAS=1 \
  node apps/cli/scripts/cli-smoke.mjs
```

The smoke isolates the OS home, AGI configuration, and keyring; removes ambient
provider tokens and API keys; and exercises version/help, doctor, feature
listing, and the protocol-v7 initialize handshake. The handshake reported
server version `1.7.1`.

The final non-TTY CLI package run also passed: library 1,795 passed with 1
ignored; app-server stdio 1/1; WebSocket 2/2; hooks 12/12; plugins 8/8;
developer-session host 4/4; and JSONL 2/2. A prior TTY invocation was stopped
because the project-consent test correctly waited for interactive input and is
not counted as evidence.

## Visual evidence

Capture host: macOS 26.5.2, arm64, VS Code 1.131 terminal. The command wrapper
denied network access and used disposable home/config/keyring state. The VS
Code window is only the terminal host; it is not evidence for the VS Code
extension.

| Test case    | State                                                             | Capture                                                                | Dimensions | SHA-256                                                            |
| ------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------ |
| `CLI-EV-001` | Fresh first run, explicit project trust, provider-choice boundary | `screenshots/exact-archive-2026-08-02/CLI-EV-001-first-run-trust.jpeg` | 1291×768   | `8eed7f31316fdccfdc2b90600468025d9f43c88595f7c907f43063b00ecf505b` |

## Limits

This evidence proves exact local archive execution on one macOS arm64 host. It
does not prove a protected release, checksums/Sigstore publication, Apple
notarization, clean-machine installation, upgrade/rollback/uninstall, Windows
process-tree behavior, or real Local/BYOK/Managed provider credentials.
