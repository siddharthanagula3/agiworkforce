# Enforce Desktop Code Egress at Process Launch

Status: Accepted

Date: 2026-07-31

Owners: Desktop, agent runtime, and security/privacy

## Context

Desktop had three reachable code-execution paths: the user-initiated
`execute_code` command, the AGI `CodeExecutor`, and chat's `code_execute` tool.
The first two reached `core/agi/sandbox.rs`, but its network-disabled mode set
only cooperative environment variables. Direct sockets could bypass those
hints. The chat tool bypassed that manager entirely and wrote model-authored
code into an interactive terminal session with normal host networking.

An additional `sys/security/sandbox.rs` module contained typed Seatbelt,
Bubblewrap, and Windows AppContainer placeholders, but no production caller
constructed or enforced them. Keeping that module would preserve a second,
stub-only sandbox authority without improving the reachable boundary.

## Decision

All model-owned code execution uses `core/agi/SandboxManager` with network
access fixed to false.

When network access is false, the process launch is enforced as follows:

1. macOS runs the language process under `/usr/bin/sandbox-exec` with a
   Seatbelt profile that denies all network operations for the process tree.
2. Linux runs it under Bubblewrap with `--unshare-net`, a read-only host root,
   and only the temporary execution workspace rebound writable.
3. If the required executable is absent, or the operating system has no
   supported primitive, execution fails closed instead of falling back to
   proxy variables or a direct process.

The direct, user-initiated `execute_code` command may still request network
access. Its full arguments, including `allow_network`, pass through the
existing high-risk confirmation flow; a network-enabled launch then invokes
the language runner directly. The model-facing registries expose no network
parameter, and both agent executor implementations force the value to false.

Transparent terminal commands remain a separate boundary: the full command is
subject to the existing high-risk approval flow, and users may additionally
enable the real `srt` filesystem/domain allowlist. AGI does not claim or attempt
to seize the host's global firewall. Product egress controls cover app-owned
HTTP boundaries, sandboxed model-authored code, and explicitly approved
terminal/network operations.

The uncalled `sys/security/sandbox.rs` placeholder module is deleted. A future
Windows code sandbox or additional backend must arrive as an invoked,
fail-closed runtime with tests, not as profile metadata or feature-gate stubs.

## Consequences

- Default Desktop code execution can no longer open direct sockets on macOS or
  Linux, including through child processes.
- Linux installations need Bubblewrap for network-disabled code execution.
- Windows and unsupported platforms refuse default network-disabled execution
  until a real isolation backend ships; users are never told advisory proxy
  variables are a sandbox.
- Chat, AGI planning, and direct command execution share one result and cleanup
  lifecycle instead of the chat route creating an unrelated terminal session.
- Tests pin the process arguments and exercise a denied socket connection on
  macOS; repository audit evidence may count the egress-control capability as
  built without claiming a machine-wide firewall.
