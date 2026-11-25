---
id: "F055-11"
type: "feature"
title: "Private-network connectors"
aliases: ["Private-network setup", "Private network connector", "allowLocalNetwork", "LAN MCP server", "S55.32", "validate_urls", "SSRF protection"]
area: "55 Connector setup and account management"
available_on: ["cli"]
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "built", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S55.32"]
depends_on: ["SYS-execution-boundaries", "SYS-security-and-privacy", "SYS-connectors-plugins-and-skills", "SYS-agents-tools-and-automation", "SYS-local-inference", "surface:cli", "surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:local", "mode:cloud", "file:crates/agiworkforce-mcp/src/security.rs"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F055-11 Private-network connectors

Reaching a service on a private network is allowed only on the CLI. Web refuses private or unsafe addresses for custom connectors. The CLI lets remote MCP servers on the LAN connect and lets a local server opt in to reach this computer's services with allowLocalNetwork. The internal Tauri desktop blocks private addresses.

Area: [55. Connector setup and account management](README.md). Requirement items: [S55.32](../../10-requirements/capabilities/055-connector-setup-and-account-management.md#s5532).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | built | built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Decides whether a connector may reach an address on a private network. Our web servers refuse private targets; the CLI on the user's own machine allows them, so a person can use an MCP server on their LAN or on localhost.

**Why it exists.** A hosted service that fetched private addresses would be an attack path (SSRF) into our infrastructure, while a developer on their own machine legitimately needs local servers such as a database or Ollama.

**Who uses it.** Developers using the CLI with local or LAN MCP servers; web users who try to add a custom connector with a private URL and are refused.

**Problems it solves**

- Cloud servers must not reach private networks.
- Local developer tools need to reach services on the same computer or LAN.

**Use cases**

- Add a company LAN MCP server to the CLI.
- Start a local database MCP server with allowLocalNetwork set so it can reach the database.
- Try a private URL as a custom connector on the web and get a clear refusal.

## 2. User experience

**Where to find it**

- CLI: 'agi mcp add <name> --url <url>' for a remote server; 'allowLocalNetwork' in a stdio server entry (apps/cli/src/lib.rs:2128-2160, apps/cli/src/mcp/mod.rs:141-150).
- Web and Desktop (hosted web): Settings, Connectors, 'Add custom connector' refuses private addresses (apps/web/lib/mcp-url-validation.ts:5-26).
- Mobile and Chrome: no private-network control found.
- VS Code: not marked.

**Before you start**

- CLI: nothing beyond a registered server; a project server asks for approval again when allowLocalNetwork is turned on (apps/cli/src/mcp/mod.rs:144-146).
- Web: an https URL that resolves to a public address.

**Screens and controls**

- CLI launch approval shows '(it can reach services on this computer, such as databases and Docker)' when allowLocalNetwork is set (apps/cli/src/mcp/consent.rs:783-785).
- Sandbox start hint names the options: sandbox false, allowLocalNetwork true, or the environment switch (apps/cli/src/mcp/mod.rs:718-727).
- Web error text '<field> targets a private or unsafe network address' (apps/web/lib/mcp-url-validation.ts:19-21).

**Journey**

1. CLI: register a server with agi mcp add (URL or command).
2. If it is a stdio server that needs local services, set allowLocalNetwork true in its entry and approve the launch.
3. Start a session; the server runs and its tools are offered.
4. Web: enter a private URL; the form returns a validation error and nothing is saved.

**What the person sees and gets**

- CLI: server tools listed or a start error with the sandbox hint.
- Web: validation error text above.

**Settings**

- allowLocalNetwork (stdio server entry flag, default off).
- sandbox flag per server and the MCP sandbox environment switch (apps/cli/src/mcp/mod.rs:722-726).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- CLI remote MCP transports do not validate URLs by default: the knob validate_urls defaults to false so LAN servers stay reachable (crates/agiworkforce-mcp/src/config.rs:70-72, 99-100, 192); no CLI code sets it true (grep of apps/cli/src found none).
- Cleartext http is refused for non-loopback hosts when credentials are sent (crates/agiworkforce-mcp/src/transport/http.rs:603-607, crates/agiworkforce-mcp/src/security.rs:80-100).
- The OAuth flow always validates endpoints it fetches, anchored on the configured server URL (crates/agiworkforce-mcp/src/security.rs:1-9).
- A sandboxed stdio server reaches only external addresses by default; allowLocalNetwork lets it reach loopback and Unix sockets (apps/cli/src/mcp/mod.rs:640-651).
- Web custom connector URLs must be https, resolve to a public hostname and carry no embedded credentials (apps/web/lib/mcp-url-validation.ts:5-30); the egress policy also blocks private targets at tool execution (apps/web/lib/user-connector-tools.ts:1560-1570).
- Internal Tauri desktop sets validate_urls true, so private and link-local addresses are blocked there (apps/desktop/src-tauri/src/core/mcp/transport.rs:910; crates/agiworkforce-mcp/src/security.rs:14-70).

**Incomplete**

- There is no supported setup for a private network from the cloud (no tunnel, agent or relay found); CLI works only because it runs on the person's own machine.
- Brief citations apps/cli/src/lib.rs:1337 and apps/cli/src/mcp/registry.rs:261 do not point at private-network code (lib.rs:1337 is a Projects subcommand region; registry.rs:261 is entry description code); the real code is listed above.

**Present but disconnected or switched off**

- Loopback is allowed by validate_server_url even when validation is on (security.rs:33, 53).

**Not available**

- Web, Desktop (Electron), Mobile, Chrome: no private-network connector setup, by design of the egress policy.
- VS Code: not marked.

## 4. Required behaviour

**Established requirements**

- Where offered, a connector can reach services on a private network through a supported setup (S55.32). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S55.32)
- Desktop egress funnels through egressGuard; Rust transports use the host-owned egress policy. (source: doc: AGENTS.md section 6)
- Security behavior fails closed; validate at trust boundaries. (source: doc: AGENTS.md section 6)

**Acceptance criteria**

1. On web, a custom connector URL with a private IP or a name that resolves to one is refused and not saved.
2. On web, an http URL is refused.
3. On the CLI, a remote MCP server at a private LAN address connects.
4. On the CLI, a stdio server without allowLocalNetwork cannot reach loopback services inside the sandbox; with it, it can.
5. Turning on allowLocalNetwork for a project server asks for approval again.
6. The internal Tauri build refuses a private address.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The product treats 'private network' as the user's own machine and LAN reachable only from the CLI; no other supported setup exists [inferred from code search].
- The CLI default of not validating URLs is deliberate for LAN use (comment in security.rs:3-6).

**Proposed improvements** (suggestions, not requirements)

- [proposed] State in the CLI docs and in agi mcp add output that LAN addresses are allowed.
- [proposed] If cloud connectors to private services are wanted, design a device-side bridge with consent rather than loosening the egress policy.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | validate_server_url | `crates/agiworkforce-mcp/src/security.rs` | Blocks private, link-local, mapped and numeric hosts; allows loopback. |
| service | enforce_https_for_remote | `crates/agiworkforce-mcp/src/security.rs` | Cleartext only for loopback. |
| config | McpTimeouts.validate_urls | `crates/agiworkforce-mcp/src/config.rs` | Defaults to false (line 192) so LAN servers stay reachable. |
| service | HTTP transport bring-up | `crates/agiworkforce-mcp/src/transport/http.rs` | Line 80: validates only when the knob is on. |
| service | SSE transport bring-up | `crates/agiworkforce-mcp/src/transport/sse.rs` | Line 45: same knob. |
| config | allowLocalNetwork flag | `apps/cli/src/mcp/mod.rs` | Lines 100-106 and 141-150: stdio server option; network policy chosen at 640-651. |
| service | launch consent | `apps/cli/src/mcp/consent.rs` | Approval text and re-approval when the flag changes (lines 727, 783, 868-896). |
| command | agi mcp add | `apps/cli/src/lib.rs` | Line 5101: registers command or URL servers. |
| service | validateHttpsMcpUrl | `apps/web/lib/mcp-url-validation.ts` | Web https and public hostname check. |
| service | egress policy | `apps/web/lib/egress-policy.ts` | assertResolvedPublicHostname used by validation. |
| service | user-connector egress block | `apps/web/lib/user-connector-tools.ts` | Lines 1560-1570: 'Connector endpoint blocked by security policy.' |
| config | Tauri validate_urls | `apps/desktop/src-tauri/src/core/mcp/transport.rs` | Line 910: validate_urls true. |
| command | mcp_server_refusal | `apps/cli/src/cloud/workspace_policy.rs` | Workspace policy can refuse a server (line 371). |
| test | MCP hardening tests | `crates/agiworkforce-mcp/tests/hardening.rs` | validate_urls blocks private addresses and allows loopback. |
| test | egress policy tests | `apps/web/lib/egress-policy.test.ts` | Web egress policy. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| CLI person registers a remote MCP server URL. | device | apps/cli/src/lib.rs:5101-5140 |
| At session start the CLI connects directly from the device to that URL; no URL validation runs by default. | device | crates/agiworkforce-mcp/src/transport/http.rs:80; config.rs:192 |
| A stdio server starts in the OS sandbox; loopback and Unix sockets are reachable only with allowLocalNetwork. | device | apps/cli/src/mcp/mod.rs:640-651 |
| Web: the add-connector request resolves the hostname and refuses a private result before saving. | our servers | apps/web/lib/mcp-url-validation.ts:5-26 |
| At tool time the server again blocks a connector endpoint that fails the egress policy. | our servers | apps/web/lib/user-connector-tools.ts:1560-1570 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| CLI MCP registry entry (URL or command, flags) | CLI MCP registry file in the config folder | No | Removed by agi mcp remove |
| Custom connector row (public URLs only) | account database custom connector table (name not opened) | Account level | Deleted on disconnect |

**Models and providers.** No model or AI provider takes part. Tool results from a private server reach the model chosen for the CLI session, which depends on the CLI's mode (Local, own key or Cloud); that routing is outside this feature (SYS-execution-boundaries).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | CLI MCP servers need no account. Web custom connectors need sign-in. |
| Permissions | CLI: launch approval for project servers; workspace policy may refuse servers (apps/cli/src/cloud/workspace_policy.rs:371). |
| Subscription | Web custom connectors count toward a plan connector limit (route.ts around line 470-485 uses capacity.connectorLimit). Local CLI MCP: none found in the code. |
| Limits and metering | none found in the code for private reach. |
| Feature flags | MCP sandbox environment switch and per-server sandbox flag (apps/cli/src/mcp/mod.rs:722-727). |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Local CLI mode can use LAN and local MCP servers without any subscription (no subscription check on agi mcp commands in the files read). Whether the model for the session is local is separate. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Private URL on web | Validation error, nothing saved. | apps/web/lib/mcp-url-validation.ts:19-21 |
| http URL with credentials off loopback (CLI) | Refused: 'Remote MCP servers must use HTTPS.' | crates/agiworkforce-mcp/src/security.rs:80-97 |
| Sandbox blocks a local service | Start failure plus a hint naming allowLocalNetwork. | apps/cli/src/mcp/mod.rs:718-727 |
| Numeric hostname | Blocked when validation is on. | security.rs:66-75 |
| Offline, retry, timeout | Connection timeouts exist in the MCP config; behaviour for an unreachable LAN host not read | crates/agiworkforce-mcp/src/config.rs:69-100 |
| Accessibility | not handled in the code for this feature (no UI on the CLI beyond text) | searched |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `crates/agiworkforce-mcp/tests/hardening.rs`: validate_urls blocks private addresses, allows loopback.
- `apps/web/lib/egress-policy.test.ts`: Web egress policy.
- `apps/web/lib/egress-policy.desktop-parity.test.ts`: Parity between web and desktop egress policy.
- `apps/cli/src/mcp/mod.rs`: Rust unit tests around allowLocalNetwork parsing (lines 3488-3590).

**Test scenarios**

- **Web refuses private URL**
  1. Add a custom connector with https://192.168.1.10/mcp.
  - Expected: Validation error about a private or unsafe address.
- **CLI LAN server**
  1. agi mcp add lan --url https://<LAN host>/mcp.
  2. Start a session.
  - Expected: Server connects and tools list.
- **Local service without flag**
  1. Start a sandboxed stdio server that dials localhost without allowLocalNetwork.
  - Expected: Connection fails and the hint mentions allowLocalNetwork.
- **Flag change re-approval**
  1. Turn allowLocalNetwork on in a project server entry.
  - Expected: The launch asks for approval again.
- **Tauri refuses private**
  1. Add a private address in the internal desktop build.
  - Expected: SSRF protection error.

**Where to look when it fails**

- Error text starting 'SSRF protection:' (crates/agiworkforce-mcp/src/security.rs).
- Log 'Connector endpoint blocked by security policy' (user-connector-tools.ts).
- Sandbox start hint text (apps/cli/src/mcp/mod.rs:718).

**Hands-on test plans**

- CLI: [70-qa/test-plans/cli/055-connector-setup-and-account-management.md](../../70-qa/test-plans/cli/055-connector-setup-and-account-management.md)

## 10. Gaps and dependencies

- **No supported private-network bridge for cloud connectors.** Affects: Web, Desktop, Mobile, Chrome. Evidence: apps/web/lib/mcp-url-validation.ts:5-26. Work needed: Decide whether to build a device-side bridge or keep the refusal.
- **CLI does not validate remote MCP URLs by default, so any address, including cloud metadata addresses, is reachable from the device.** Affects: CLI users. Evidence: crates/agiworkforce-mcp/src/config.rs:99-100, 192. Work needed: Confirm this is intended; consider a warning when the host is not public.
- **Brief citations for the CLI do not point at private-network code.** Affects: Documentation. Evidence: apps/cli/src/lib.rs:1337, apps/cli/src/mcp/registry.rs:261. Work needed: Refresh to mod.rs:141-150 and security.rs.
- Not built on: Web, Desktop, Mobile, Chrome (from the capability ledger).

**Depends on**

- SYS-execution-boundaries
- SYS-security-and-privacy
- SYS-connectors-plugins-and-skills
- SYS-agents-tools-and-automation
- SYS-local-inference
- surface:cli
- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:local
- mode:cloud
- file:crates/agiworkforce-mcp/src/security.rs

## Unknown

- Whether the CLI egress boundary check (check:rust-egress-boundary) applies to MCP URL connects.
- Whether the internal Tauri desktop exposes a way to disable validate_urls.
- Whether any documentation tells CLI users that LAN addresses are reachable.
- The custom connector database table name (not opened).
