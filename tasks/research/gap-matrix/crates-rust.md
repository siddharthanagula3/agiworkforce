# Crates (Rust) Gap Matrix vs Anthropic primitives — 2026-05-08

> Scope: 12 crates / 67 .rs files / ~40K LOC. Comparison points are the Anthropic
> reference patterns documented in `tasks/research/anthropic-claude-suite-may-2026.md`,
> `tasks/research/deep/net-bridge-remote-server.md`, `tasks/research/deep/t2-bash-powershell.md`,
> `tasks/research/deep/m7-utils-bash.md`, `tasks/research/deep/u4-permissions-swarm-settings-model.md`.
> Anchor reminder: **`upstreamproxy/` in the Anthropic codebase is sandbox-credential
> CONNECT-over-WS injection, NOT an LLM proxy.** Our `agiworkforce-network-proxy` is
> structurally the _opposite_ — a parent process that binds local HTTP+SOCKS5 listeners
> and clamps child processes to them via `apply_to_env`.

## TL;DR

`crates/` is **80% lineage-aligned with the Codex (OpenAI) family of Rust crates**, not
the TypeScript Claude Code / Cowork stack. The bash/PowerShell parser-differential
hardening, the four-tier auth ladder, the trusted-device enrollment, the bridge
worker registration protocol, the Seatbelt/bwrap/Landlock invocation glue, and the
upstream-proxy CONNECT-tunnel-over-WebSocket sandbox-credential injection layer
documented in T2/M7/U4/net-bridge — _none_ of them live in `crates/`. They either
live in `apps/cli/src/` (sandbox.rs, partial), `apps/desktop/src-tauri/` (none),
or are entirely absent. What `crates/` _does_ ship is a high-quality
**rama-based MITM HTTPS proxy with allow/deny domain policy**, a
**Starlark-based execpolicy DSL**, an excellent **path-traversal-armored
`AbsolutePathBuf` + symlink-preserving canonicalizer**, and a giant
**`agiworkforce-protocol` crate (15 modules / ~14K LOC)** that defines
the SQ/EQ wire format. Per-axis: Sandbox-policy 25%, Network-proxy 70%,
Protocol types 65%, Execpolicy 70%, Image handling 90%, Path/string/template 95%,
Async runtime 40%, Rustls TLS 60%, Cache 80%. **Surface percentage: 62%.**
**Effort to close the load-bearing gaps: 21–30 engineer-days.**

---

## Have

### Sandbox primitives — `crates/sandbox-policy/src/lib.rs` (121 LOC)

A single 122-line file. It ships **only the policy enum**:
`SandboxPolicy::{DangerFullAccess, ReadOnly, WorkspaceWrite{writable_roots}, ExternalSandbox}`
(`sandbox-policy/src/lib.rs:6-11`). `from_mode_str` parses `"read-only"`,
`"workspace"`, `"external"`, `"danger-full-access"` and **defaults unknown values
to `WorkspaceWrite`** (a safe default explicitly tested at lines 94-97). Mode
names are stable for the audit log (`mode_name`, `:35-42`). There is **no
seatbelt invocation, no bwrap invocation, no Landlock invocation, no Windows
Job-Object code, and no execve-time enforcement** — the crate is purely a
_declared policy type_. The actual sandbox launch lives in `apps/cli/src/sandbox.rs`
(per memory: macOS Seatbelt + Linux bwrap shipped; Windows + Landlock are stubs at
`sandbox.rs:159` silent fallthrough — P1).

### Network proxy — `crates/agiworkforce-network-proxy/` (15 files, ~7,400 LOC)

This is the load-bearing crate. It implements an **outbound-clamp local HTTP+SOCKS5
proxy** that the parent process binds to loopback ephemeral ports
(`proxy.rs:193-209` `reserve_loopback_ephemeral_listeners` reserves a
`StdTcpListener::bind(SocketAddr::from(([127,0,0,1], 0)))` for HTTP and optionally
SOCKS5) and then injects into child processes via 18 environment variables
(`proxy.rs:340-409` `apply_proxy_env_overrides`): `HTTP_PROXY`, `HTTPS_PROXY`,
`http_proxy`, `https_proxy`, `WS_PROXY`, `WSS_PROXY`, `ALL_PROXY` (SOCKS5h when
enabled), `FTP_PROXY`, `YARN_HTTP_PROXY`, `YARN_HTTPS_PROXY`, `NPM_CONFIG_*`,
`BUNDLE_*`, `PIP_PROXY`, `DOCKER_*_PROXY`, `NO_PROXY` (loopback + RFC1918 +
link-local + `*.local`), `ELECTRON_GET_USE_PROXY=true`, plus a macOS-only
`GIT_SSH_COMMAND='ssh -o ProxyCommand=...nc -X 5...'` SOCKS5 ProxyCommand
fallback at `proxy.rs:402-408`. The `DEFAULT_NO_PROXY_VALUE` at `proxy.rs:311-315`
covers `localhost,127.0.0.1,::1,*.local,.local,169.254.0.0/16,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16` —
this matches Anthropic's `upstreamproxy.ts`'s NO_PROXY profile **shape** but has
half the entries (Anthropic's covers IMDS 169.254.169.254, GitHub apex,
npm/PyPI/Cargo/Go-mod-proxy too).

The MITM piece is real: `mitm.rs:117-181` `mitm_tunnel(upgraded)` terminates the
upgraded CONNECT stream with a **per-host leaf cert minted from a managed CA**
(`certs.rs:33-93` `ManagedMitmCa::tls_acceptor_data_for_host` issues
ECDSA-P256 leaves, ALPN h2+http/1.1, signed by a long-lived CA stored at
`{AGIWORKFORCE_HOME}/proxy/ca.{pem,key}` with the key written
`O_CREAT|O_EXCL` mode 0600 atomically at `certs.rs:138-160`). MITM enforces
method allowlists (`config.rs:82-89` `NetworkMode::Limited` allows only
GET/HEAD/OPTIONS), rejects `CONNECT` inside the inner HTTPS stream
(`mitm.rs:249-254`), defends DNS-rebinding-after-CONNECT
(`mitm.rs:279-306` re-checks `host_blocked` post-CONNECT for `NotAllowedLocal`),
and emits a tracing audit event `codex.network_proxy.policy_decision`
(`network_policy.rs:228-255`) with 14 fields: scope, decision, source, reason,
protocol, server.address, server.port, http.request.method, client.address,
policy.override, conversation.id, app.version, auth_mode, model.

The policy decider (`network_policy.rs:267-287`) is `async-trait` based and
accepts both `Arc<dyn NetworkPolicyDecider>` and `Fn(NetworkPolicyRequest) ->
Future<NetworkDecision>`. SOCKS5 implementation is real
(`socks5.rs:75-130`), uses `rama_socks5::Socks5Acceptor`, supports UDP relay
inspection via `DefaultUdpRelay::with_async_inspector`. The crate also implements
an `allow_unix_sockets`/`dangerously_allow_all_unix_sockets` escape hatch
(`config.rs:189-211`) — and **explicitly clamps to loopback** when unix sockets
are enabled, even with `dangerously_allow_non_loopback_proxy=true`, with a
warning log: "unix socket proxying is enabled; ignoring
dangerously_allow_non_loopback_proxy and clamping HTTP proxy to loopback"
(`config.rs:198-201`). The `policy.rs:32-98` `is_non_public_ip` predicate covers
8 IPv4 RFC ranges (private, CGNAT, link-local, broadcast, multicast, IETF
Protocol Assignments, TEST-NET-1/2/3, benchmarking, reserved) plus IPv6 unique-local,
link-local, loopback, multicast, unspecified — closer to defense-in-depth than the
JS upstream-proxy NO_PROXY string.

### Execpolicy — `crates/agiworkforce-execpolicy/` (10 files, ~1,800 LOC)

`policy.rs:34-335` is a `MultiMap<String, RuleRef>` of program-keyed prefix rules
plus a `Vec<NetworkRule>` plus `HashMap<String, Arc<[AbsolutePathBuf]>>` of
host-executable lookups. Decisions are `Allow|Prompt|Forbidden`
(`decision.rs:7-16`). Rules are **prefix-pattern with alternation**:
`PrefixPattern { first: Arc<str>, rest: Arc<[PatternToken]> }` where
`PatternToken::{Single, Alts}` (`rule.rs:16-43`). `PrefixPattern::matches_prefix`
(`rule.rs:45-60`) does length-then-token-then-token matching; `Rule::matches`
(`rule.rs:228-243`) returns a `RuleMatch::PrefixRuleMatch{matched_prefix, decision,
resolved_program, justification}`. `Policy::matches_for_command_with_options`
(`policy.rs:268-295`) gives heuristics-fallback when no rule matches (so the CLI
can emit `HeuristicsRuleMatch` for unknown commands rather than an empty Vec) and
optionally resolves host executables (`MatchOptions::resolve_host_executables`).

Network rules are integrated: `NetworkRule` with `protocol:
NetworkRuleProtocol::{Http, Https, Socks5Tcp, Socks5Udp}` and
`normalize_network_rule_host` at `rule.rs:156-212` rejects schemes, paths,
fragments, wildcards, whitespace, multi-`:` IPv6 without brackets, and lowercases
hostnames. `compiled_network_domains` (`policy.rs:167-186`) compiles the rule list
into a `(Vec<allowed>, Vec<denied>)` pair the network proxy can ingest.
`add_prefix_rule` and `add_network_rule` mutate the policy in-place, and
`merge_overlay` (`policy.rs:141-165`) lets a managed-by-admin layer compose with
a project layer. The DSL itself is **Starlark-based**: `parser.rs:48-93`
`PolicyParser::parse` runs a Starlark `AstModule` against a `policy_builtins`
globals builder, with `enable_f_strings = true` and example/not-example
validation at `parser.rs:84-87` (parse-time checking that examples actually
match the rules). `amend.rs` is the file-mutation layer: it locks the policy file
with `OpenOptions::create(true).read(true).write(true)`, seeks, reads, parses,
appends a new `prefix_rule(...)` or `network_rule(...)`, and writes
atomically — see error variants `MissingParent`, `LockPolicyFile`,
`SeekPolicyFile`, `ReadPolicyFile`, `WritePolicyFile` at `amend.rs:21-57`.

### Image handling — `crates/agiworkforce-utils-image/` (2 files, 387 LOC)

`lib.rs:1-180` `load_for_prompt_bytes` resizes images with `image::imageops::Triangle`
filter (linear interpolation), bounds at `MAX_WIDTH=2048` and `MAX_HEIGHT=768`
(`:20-22`), preserves source bytes when format is PNG/JPEG/WebP and dimensions
are within bounds (`:84-101`), falls back to PNG re-encoding otherwise
(`:103-115`). 32-entry SHA1-keyed `BlockingLruCache` (`:53-54`). Animated GIFs
explicitly bypass byte-preservation (`:121-128`). Output mime types via
`format_to_mime`. `EncodedImage::into_data_url` (`:35-39`) emits `data:{mime};base64,{enc}`.
This is **directly comparable** to the JS image-normalization in `inboundMessages.ts`
(which only repairs `mediaType`→`media_type` casing) — ours is more capable on
the encoding side.

### Path/string/template utils

- `agiworkforce-utils-absolute-path/` (2 files / 871 LOC) — `AbsolutePathBuf` is
  the load-bearing path-traversal-armored type. `from_absolute_path` calls
  `absolutize::absolutize` which normalizes `..`/`.` segments without touching the
  filesystem (`absolutize.rs`). `canonicalize_preserving_symlinks` at
  `lib.rs:189-197` keeps the _logical_ path when canonicalize would rewrite
  through a nested symlink — only top-level system aliases like macOS
  `/var → /private/var` get canonicalized. The Windows verbatim-prefix stripper
  at `lib.rs:153-179` handles `\\?\D:\...`, `\\.\D:\...`, `\\?\UNC\...`,
  `\\.\UNC\...` correctly. `~` and `~/` expansion via `home_dir()` (`:27-43`).
  Thread-local `AbsolutePathBufGuard` for deserialization base-paths (`:326-369`).
- `agiworkforce-utils-string/` (2 files / 371 LOC) — `to_ascii_json_string`
  for HTTP-header-safe JSON, `sanitize_metric_tag_value` (256-char limit, only
  `[A-Za-z0-9._/-]` allowed, replace-with-underscore otherwise), `find_uuids`
  (regex `/[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-...{12}/`),
  `truncate_middle_with_token_budget`, `take_bytes_at_char_boundary`,
  `take_last_bytes_at_char_boundary`, and a markdown-hash-location-suffix
  normalizer that rewrites `#L74C3-L76C9` → `:74:3-76:9`.
- `agiworkforce-utils-template/` (1 file / 442 LOC) — strict `{{ name }}`
  templating with `{{{{` / `}}}}` escapes; rejects empty placeholders, nested
  placeholders, unmatched `}}`, unterminated `{{`, duplicate values, missing
  values, and extra values (parse + render error enums at `:13-71`).
- `agiworkforce-utils-home-dir/` (1 file / 135 LOC) — `find_agiworkforce_home`
  honors `AGIWORKFORCE_HOME` env, defaults to `~/.agiworkforce`, validates the
  path is a directory, canonicalizes when set explicitly. **Direct port of
  `dotfile-architectures` blueprint.**

### Async runtime — `crates/agiworkforce-async-utils/src/lib.rs` (86 LOC)

A single trait `OrCancelExt` with method `or_cancel(token: &CancellationToken)`
that races a future against `token.cancelled()` via `tokio::select!`. Three tests
cover happy path, mid-future cancel, and pre-cancel. **That's it.** No timer
abstractions, no debounce, no jitter, no JWT-refresh scheduler, no
generation-counter cancellation, no flush gates.

### Rustls provider — `crates/agiworkforce-utils-rustls-provider/src/lib.rs` (12 LOC)

`ensure_rustls_crypto_provider()` installs `rustls::crypto::ring::default_provider`
exactly once via `std::sync::Once`. Used by `http_proxy.rs:116` to handle the
ring-vs-aws-lc-rs ambiguity when both features are in the dep graph.

### Cache — `crates/agiworkforce-utils-cache/src/lib.rs` (193 LOC)

`BlockingLruCache<K,V>` wraps `lru::LruCache` in a `tokio::sync::Mutex` with
`get_or_insert_with`, `get_or_try_insert_with`, `get`, `insert`, `remove`,
`clear`, `with_mut`. Outside a Tokio runtime all ops are no-ops (verified by the
`disabled_without_runtime` test at `:172-191`). `sha1_digest(bytes) -> [u8;20]` for
content-addressed keys (`:130-142`). Used by `agiworkforce-utils-image`'s
`IMAGE_CACHE` static.

### Protocol types — `crates/agiworkforce-protocol/` (30 files, ~14K LOC)

Massive crate. `protocol.rs` (5,355 LOC) defines the SQ (Submission Queue) /
EQ (Event Queue) wire format with `Submission { id, op: Op, trace:
Option<W3cTraceContext> }` (`:124-144`), 21 string-tag constants
(`USER_INSTRUCTIONS_OPEN_TAG`, `ENVIRONMENT_CONTEXT_*`, `APPS_INSTRUCTIONS_*`,
`SKILLS_INSTRUCTIONS_*`, `PLUGINS_INSTRUCTIONS_*`, `COLLABORATION_MODE_*`,
`REALTIME_CONVERSATION_*` at `:91-105`), and the `EventMsg`/`Op` discriminated
unions. `permissions.rs` (2,974 LOC) defines `FileSystemSandboxPolicy` /
`FileSystemSandboxKind::{Restricted, Unrestricted, ExternalSandbox}` /
`FileSystemSpecialPath::{Root, Minimal, ProjectRoots{subpath?}, Tmpdir,
SlashTmp, Unknown{path, subpath?}}` plus `PROTECTED_METADATA_PATH_NAMES =
[".git", ".agents", ".codex"]` (`:23-32`) and `forbidden_agent_metadata_write`
guard at `:48-77`. `models.rs` (2,980 LOC) defines `SandboxPermissions::{UseDefault,
RequireEscalated, WithAdditionalPermissions}`, `FileSystemPermissions`,
`PermissionProfile`, and `ResponseInputItem`/`ResponseItem`/`ContentItem`/`MessagePhase`/
`WebSearchAction`. `mcp.rs` (360 LOC) ships TS-friendly MCP types `Tool`,
`Resource`, `ResourceContent`, `RequestId`, `CallToolResult`. `approvals.rs`
ships `GuardianAssessmentEvent` with 5 sub-statuses (`InProgress`, `Approved`,
`Denied`, `TimedOut`, `Aborted`), `GuardianRiskLevel::{Low, Medium, High,
Critical}`, `GuardianAssessmentAction::{Command, Execve, ApplyPatch,
NetworkAccess, McpToolCall, RequestPermissions}`, `NetworkApprovalProtocol::{Http,
Https, Socks5Tcp, Socks5Udp}`, `ExecPolicyAmendment` (newtype around
`Vec<String>`). `dynamic_tools.rs` ships `DynamicToolSpec`,
`DynamicToolCallRequest`, `DynamicToolResponse`, `DynamicToolCallOutputContentItem::{InputText,
InputImage}`. `auth.rs` ships `KnownPlan` enum (Free, Go, Plus, Pro, ProLite,
Team, Business, Enterprise, Edu) with `is_workspace_account()` predicate. `parse_command.rs`
(31 LOC) ships `ParsedCommand::{Read, ListFiles, Search, Unknown}`. `shell_environment.rs`
(250 LOC) implements env-var inheritance with `*KEY*`, `*SECRET*`, `*TOKEN*`
default-excludes (`:80-86`), 11-entry `UNIX_CORE_ENV_VARS` and 23-entry
`WINDOWS_CORE_ENV_VARS` core-inherit allowlists (`:112-149`). `exec_output.rs`
ships chardetng-based UTF-8 detection with a Windows-1252-vs-CP866 collision
disambiguation allowlist at `:86-95` (canonical case where smart-quote bytes
0x91-0x99 collide with Cyrillic). `network_policy.rs` is just a 22-LOC payload
type re-exporting types from `agiworkforce-network-proxy`. `config_types.rs`
ships `WindowsSandboxLevel::{Disabled, RestrictedToken, Elevated}` (`:187-197`),
`Personality::{None, Friendly, Pragmatic}` (`:216-220`), `WebSearchMode::{Disabled,
Cached, Live}`, `WebSearchContextSize::{Low, Medium, High}`. `plan_tool.rs` ships
`UpdatePlanArgs`. `request_permissions.rs` and `request_user_input.rs` ship the
elicitation-and-permission RPC shapes. `agent_path.rs`, `thread_id.rs`, and
`tool_name.rs` ship newtype wrappers.

---

## Partial

### Network proxy — missing CONNECT-over-WS sandbox-credential injection (Anthropic upstreamproxy.ts equivalent)

We ship a _parent-side_ outbound HTTP+SOCKS5 proxy that clamps child processes via
env vars. The Anthropic `upstreamproxy/` design is the **inverse**: a _child-side_
relay running inside a CCR sandbox that reads
`/run/ccr/session_token`, `prctl(PR_SET_DUMPABLE,0)` to block ptrace heap-scrape
(`upstreamproxy.ts:225-252`), downloads a CA cert from
`${baseUrl}/v1/code/upstreamproxy/ca-cert`, concatenates with the system bundle,
and tunnels CONNECT-encoded protobuf chunks
(`UpstreamProxyChunk { bytes data = 1; }`, hand-rolled wire, varint length
prefix, tag `0x0a`, 512 KiB max chunk to fit Envoy buffer cap) over a single
WebSocket frame stream to `${baseUrl}/v1/code/upstreamproxy/ws` with
`Authorization: Bearer {token}` on the WS upgrade and an in-tunnel
`Proxy-Authorization: Basic base64(sessionId:token)` header. Two distinct auth
scopes: gateway-proto authn vs MITM-tunnel auth. **None of this exists in our
crates.** Our MITM CA is _parent-managed_ (`certs.rs:99-107`
`{AGIWORKFORCE_HOME}/proxy/ca.pem`), not _gateway-issued_. Our auth model is
_allow/deny domain glob + decider trait_, not _bearer-token + session-bound
proxy-auth_. Score: **70% of the parent-side primitives, 0% of the child-side
primitives.**

### Sandbox primitives — missing Seatbelt/bwrap/Landlock invocation glue, Windows Job-Object

`sandbox-policy/src/lib.rs` only declares the _policy enum_. The actual Seatbelt
profile generator, bubblewrap argv builder, Linux Landlock ruleset compiler, and
Windows Job-Object/AppContainer spawner are missing from `crates/`. Per memory,
`apps/cli/src/sandbox.rs` ships **macOS Seatbelt + Linux bwrap** with a silent
fallthrough at `sandbox.rs:159` for Windows + Landlock — that is a per-app
implementation, not a shared crate. Anthropic's reference `BashTool.tsx:498-503`
calls `wrapWithSandbox` from `utils/sandbox/sandbox-adapter.js` which takes the
`SandboxManager` config from `settings.json` (`sandbox.bwrapPath`,
`sandbox.socatPath`, `sandbox.excludedCommands`, `sandbox.fs.read.{denyOnly,
allowWithinDeny}`, `sandbox.fs.write.{allowOnly, denyWithinAllow}`,
`sandbox.network.{allowedHosts, deniedHosts, allowUnixSockets}`). We have **no
shared abstraction for this** — every surface re-implements its own sandbox
shell-out. Score: **25% (declared types only).**

### Protocol types — missing four-tier auth ladder envelope, control_request shape

`auth.rs` ships `KnownPlan` and `RefreshTokenFailedError`/`RefreshTokenFailedReason`
but **no `WorkSecret` envelope type**, no `BridgeApiClient` HTTP wrapper, no
`X-Trusted-Device-Token` enrollment wrapper, no `session_ingress_token` JWT
wrapper, no four-tier (`OAuth Bearer | environment_secret | session_ingress_token
| trusted_device_token`) auth header builder. Anthropic's `bridgeApi.ts:76-89`
shows the layered header pipeline that combines OAuth + Trusted-Device on every
poll, JWT-only on every ack, JWT + Trusted-Device on every heartbeat. Our
`approvals.rs` ships `GuardianAssessmentAction` with subtypes Command/Execve/
ApplyPatch/NetworkAccess/McpToolCall/RequestPermissions — that's structurally
similar to Anthropic's `control_request:can_use_tool` shape, but we **don't ship
the request_id/response_id correlation envelope or the `control_cancel_request`
withdrawal pathway** (`bridgeMessaging.ts:243-391` + `RemoteSessionManager.ts:159-216`).
Score: **65% (the data envelopes exist; the bridge protocol envelopes don't).**

### Execpolicy — missing tree-sitter integration, no auto-mode classifier hook

The crate ships a Starlark DSL + prefix-pattern matcher + heuristics fallback.
What it doesn't ship is integration with a bash-AST parser (M7 `bashParser.ts`
4,436-LOC pure-TS port of tree-sitter-bash, with quote-aware heredoc extraction,
process-substitution rejection, etc.). Anthropic's `bashPermissions.ts:1670-1806`
calls `parseCommandRaw` to AST-parse a command, walks the AST via
`parseForSecurityFromAst` to extract argv per simple command, and _then_ runs
permission rules against the canonical argv. Our execpolicy operates on
`&[String]` directly — it never sees a parser-vs-tokenizer mismatch attack like
`tr\<NL>aceroute` or `~[name]` (zsh directory-name hook) or `=cmd` (zsh equals
expansion). It also doesn't ship the `validate_xxx` 22-validator chain
(`bashSecurity.ts:2348-2378`) or the `ZSH_DANGEROUS_BUILTINS` blocklist or the
HackerOne-class control-character/unicode-whitespace pre-checks
(`ast.ts:254-314` `CONTROL_CHAR_RE`, `UNICODE_WHITESPACE_RE`,
`BACKSLASH_WHITESPACE_RE`, `ZSH_TILDE_BRACKET_RE`, `ZSH_EQUALS_EXPANSION_RE`,
`BRACE_WITH_QUOTE_RE`). And no auto-mode classifier integration: the
`Decision::Prompt` variant exists, but there's no Haiku-class side-call to
override `Prompt → Allow|Deny`. Score: **70% (rule engine yes, parser-armor
no, classifier no).**

### Image handling — missing animated GIF passthrough rejection, missing format-list parity with Anthropic's `inboundMessages.ts`

`utils-image` resizes/reencodes well, but Anthropic's spec is broader:
`mediaType→media_type` repair for iOS clients (`inboundMessages.ts:45-73`),
HEIC/HEIF support for iOS uploads, AVIF support, base64-data-URL parsing on
ingress, and `file_uuid` reference resolution to local download
(`inboundAttachments.ts:97-133`, `~/.claude/uploads/{sessionId}/{uuidPrefix}-{safeName}`
landing zone with 8-char filename sanitization). We do none of these. Score:
**90% (resize/encode complete; ingress-side normalization missing).**

### Path/string/template utils — missing UNC block, glob-write-only restriction, dangerous-removal predicate

`AbsolutePathBuf` _has_ the Windows verbatim-prefix stripper but **no UNC
rejection guard** (`pathValidation.ts:382-392` `containsVulnerableUncPath` rejects
`\\server\share`, `//server/share`, `\\.\…`, `\\?\…`). We don't reject `~user`,
`~+`, `~-`, `~N` tilde variants (`pathValidation.ts:401-411` does — TOCTOU armor
because we'd validate `/cwd/~root/...` but bash reads `/var/root/...`). We don't
reject `$VAR`, `${VAR}`, `$(cmd)`, `%TEMP%`, zsh `=cmd` shell-expansion tokens
(`pathValidation.ts:423-436`). We don't gate glob characters `*?[]{}` for write
ops (`pathValidation.ts:443-454`). And we don't ship an `isDangerousRemovalPath`
predicate that blocks `rm /`, `rm /*`, `rm ~`, `rm /usr`, drive-roots like `C:\`
(`pathValidation.ts:331-367`). The U4 deep-dive notes these as load-bearing
defenses; we have AbsolutePathBuf normalization but not the full TOCTOU armor.
Score: **95% (excellent normalization; missing 6 explicit deny-class checks).**

### Async runtime — missing JWT refresh scheduler, missing flush gate, missing capacity-wake merger

`agiworkforce-async-utils` ships only `or_cancel`. Anthropic's `jwtUtils.ts:88-253`
ships `createTokenRefreshScheduler` with **generation-counter pattern to invalidate
orphan timers**, 5-min buffer before expiry, 30-min fallback when expiry is
opaque, 3-strike retry on missing OAuth token, and discriminator field
`cause: 'initial' | 'proactive_refresh' | 'auth_401_recovery'`. Anthropic's
`flushGate.ts` (71 LOC) and `capacityWake.ts` (56 LOC) are tiny but
load-bearing primitives for ordering live writes during an initial-history POST
and waking at-capacity sleeps when sessions end. We ship none of these. Score:
**40% (cancel-or-future yes; everything else no).**

### Rustls TLS — missing aws-lc-rs alternative provider, missing client cert support

`agiworkforce-utils-rustls-provider` installs `rustls::crypto::ring`, but doesn't
expose a way to switch to `aws-lc-rs` (regulated environments often require FIPS
140-3 modules). And it doesn't ship a client-cert/mutual-TLS helper for the
`X-Trusted-Device-Token` enrollment path — we'd need rcgen + per-device-keypair
enrollment to match `trustedDevice.ts:142-200`. Score: **60%.**

---

## Missing

### CONNECT-over-WS sandbox-credential injection (Anthropic upstreamproxy)

Already detailed under _Partial_. To match parity:

1. Add a child-side relay crate `crates/agiworkforce-sandbox-relay/` that reads
   a single-use session token from `/run/agiworkforce/session_token`, calls
   `prctl(PR_SET_DUMPABLE,0)` (libc FFI on Linux),
   downloads `${baseUrl}/v1/sandbox/ca-cert`, sets `HTTPS_PROXY=http://127.0.0.1:N`
   in its own env, and tunnels CONNECT bytes as protobuf-framed
   `UpstreamProxyChunk` over a single WebSocket connection.
2. Encode wire as varint-prefix tag `0x0a` 512 KiB max chunks to fit Envoy
   per-request buffer caps.
3. Two-scope auth: gateway WS upgrade `Authorization: Bearer`; in-tunnel
   `Proxy-Authorization: Basic base64(sessionId:token)`.
4. Add NO_PROXY entries for IMDS (`169.254.169.254`), GitHub apex (`*.`, `.`,
   no-prefix forms to cover Bun/curl/Go vs Python urllib vs apex), npm,
   PyPI, Cargo, Go module proxy.
5. Atomic unlink-token-after-listening so a supervisor restart can retry.

**Effort:** 5–7 days (relay + proto + WS + libc FFI + NO_PROXY
expansion + tests). **Priority:** P2 — only relevant if we ship a managed cloud
sandbox, which the `Pro` tier waitlist implies.

### Trusted-Device enrollment crate

No equivalent of `trustedDevice.ts:33-87` (`getTrustedDeviceToken` with memoized
keychain read) or `bridgeApi.ts:76-89` four-tier auth header builder.
**Effort:** 3 days. **Priority:** P1 if we ship Cowork/Dispatch parity.

### JWT-refresh scheduler

Pure TS port (~250 LOC). **Effort:** 1 day. **Priority:** P0 the moment we ship
any cloud-mode worker registration.

### Bash-AST integration with execpolicy

The execpolicy crate operates on `&[String]`. To match permission armor parity, it
would need to take a tree-sitter-bash AST and walk it for permission rule matching.
Two paths: (a) port `bashParser.ts` 4,436-LOC pure-TS to Rust (huge — multi-week);
(b) shell out to `tree-sitter-bash` WASM via `wasmtime` (smaller but adds 600 KB
binary cost and 100-200 ms first-call eval). **Effort:** 14 days for option (a).
**Priority:** P2 — most of the bash-parser-differential class is closed by our
existing `apps/cli/src/parse_command.rs` simpler argv extractor + the
`Decision::Prompt` fallback.

### Windows Sandbox / Job-Object / AppContainer crate

`config_types.rs:187-197` declares `WindowsSandboxLevel::{Disabled, RestrictedToken,
Elevated}`, but there's no implementation crate. `apps/cli/src/sandbox.rs` per
memory has the macOS+Linux paths but Windows is a stub. The `PowerShellTool.tsx:219-222`
`WINDOWS_SANDBOX_POLICY_REFUSAL` (refuse execution outright on Windows-native if
sandboxing requested) is a workaround; a real Job-Object spawner is the proper fix.
**Effort:** 7 days. **Priority:** P1 if we want Windows Pro tier.

### Bridge worker registration / control_request envelopes

No bridge-pointer file recovery, no spawn-mode toggling (worktree vs same-dir
vs single-session), no echo dedup `BoundedUUIDSet`, no SSE/WS hybrid transport,
no `tryReconnectInPlace`, no `tengu_*` telemetry events. Per the
_net-bridge-remote-server_ deep-dive, the priority order for porting is:
(1) `createTokenRefreshScheduler` (`jwtUtils.ts:72-253`),
(2) four-tier auth header + Trusted-Device (`bridgeApi.ts:76-89`,
`trustedDevice.ts:33-87`),
(3) `WorkSecret` envelope + `validateBridgeId` regex,
(4) `control_request`/`control_response` shape with cancel.
~1,500 LOC of TS to port — call it ~2,500 LOC of Rust. **Effort:** 14–21 days.
**Priority:** P1 — load-bearing for cross-surface integration.

### `additionalDirectories` resolver

`permissions.rs` ships the policy types but not a runtime resolver matching
`filesystem.ts:683-707` `pathInAllowedWorkingPath` (load `originalCwd` + all
`additionalWorkingDirectories.keys()`, resolve via `getResolvedWorkingDirPaths`
with symlink targets, accept if path falls under any). **Effort:** 2 days.
**Priority:** P2.

### Settings-source merge layer (lodash-mergeWith equivalent)

No equivalent of `settings.ts:645-796` `loadSettingsFromDisk` (5-source merge
`pluginSettingsBase → userSettings → projectSettings → localSettings → flagSettings →
policySettings` with array-union, "first source wins" inside `policySettings`,
managed-settings drop-ins under `managed-settings.d/*.json` sorted alphabetically,
internal-write echo-suppression). **Effort:** 4 days. **Priority:** P2.

### Path-validation TOCTOU armor

Already detailed under _Partial_. **Effort:** 2 days. **Priority:** P0.

---

## Per-axis percentages

| Axis                                                            | %    | Notes                                                                                                                                                                                                         |
| --------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sandbox primitives (Seatbelt + bwrap + Landlock invocation)     | 25%  | Policy types only; invocation lives in `apps/cli/src/sandbox.rs` per memory; Windows missing.                                                                                                                 |
| Network proxy (parent-side outbound clamp + MITM)               | 70%  | rama-based MITM, allow/deny globsets, audit telemetry, SOCKS5 with UDP. Missing: child-side credential-injection relay.                                                                                       |
| Network proxy (child-side CONNECT-over-WS credential injection) | 0%   | Not even a stub.                                                                                                                                                                                              |
| Protocol types — wire format / SQ-EQ / events                   | 80%  | Full Submission/EventMsg/Op enum tree; W3cTraceContext; 21 instruction-tag constants.                                                                                                                         |
| Protocol types — bridge / four-tier auth / WorkSecret envelope  | 5%   | Only `KnownPlan` and refresh-failure error.                                                                                                                                                                   |
| Execpolicy DSL + matcher                                        | 70%  | Starlark DSL, prefix patterns with alternation, network rules, host-executable resolution. Missing: tree-sitter AST integration, classifier hook.                                                             |
| Image handling                                                  | 90%  | Full resize/reencode/cache; missing HEIC/AVIF + ingress-side `mediaType` repair.                                                                                                                              |
| Path utils                                                      | 95%  | AbsolutePathBuf + symlink-preserving canonicalize + Windows verbatim-prefix strip. Missing: UNC reject, tilde-variant block, shell-expansion guard, glob-write-only restriction, dangerous-removal predicate. |
| String utils                                                    | 95%  | ASCII-only JSON, metric-tag sanitizer, UUID finder, char-boundary truncation, markdown hash-location normalizer. Missing: nothing critical.                                                                   |
| Template engine                                                 | 100% | Strict templating with all error classes. Above what Anthropic ships in `claude.ai/code` (uses MDX).                                                                                                          |
| Async runtime                                                   | 40%  | Only `or_cancel`. Missing JWT scheduler, flush gate, capacity wake.                                                                                                                                           |
| Rustls TLS                                                      | 60%  | Single-provider install via `Once`. Missing aws-lc-rs alternative + client-cert helpers.                                                                                                                      |
| Cache                                                           | 80%  | Tokio-aware LRU + SHA1 keys. Missing: TTL-based eviction + content-addressed binary cache.                                                                                                                    |
| Home-dir resolution                                             | 100% | `AGIWORKFORCE_HOME` + `~/.agiworkforce` default + canonicalize-on-set.                                                                                                                                        |
| Trusted-Device enrollment                                       | 0%   | Not present.                                                                                                                                                                                                  |
| Bridge worker registration                                      | 0%   | Not present.                                                                                                                                                                                                  |
| Settings hierarchy (5-source merge + drop-ins + MDM)            | 0%   | Not present.                                                                                                                                                                                                  |
| `additionalDirectories` resolver                                | 30%  | Schema present in `permissions.rs`; resolver missing.                                                                                                                                                         |

## Surface percentage

**62%.** Three load-bearing axes drag the average down: Sandbox-primitives (25%),
Bridge worker registration (0%), and Trusted-Device enrollment (0%). Strip those
and the remaining 14 axes average **78%** — `crates/` is a high-quality core
shared-utility ring around the OpenAI Codex Rust lineage, but it's missing the
Anthropic Cowork/Dispatch protocol envelope set entirely.

## Effort

| Tier | Items                                                                                                                                                                                                                                          | Days              |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| P0   | Path-validation TOCTOU armor; JWT-refresh scheduler; CLI sandbox.rs Windows+Landlock close-out                                                                                                                                                 | 1+1+5 = 7         |
| P1   | Trusted-Device enrollment + 4-tier auth headers; `WorkSecret` envelope + `validateBridgeId`; control_request/control_response with cancel + `BoundedUUIDSet`                                                                                   | 3+3+5 = 11        |
| P2   | Settings 5-source merge; bash-AST integration with execpolicy; Windows Sandbox/Job-Object crate; child-side CONNECT-over-WS sandbox relay; `additionalDirectories` resolver; ingress-side image normalization (HEIC/AVIF + `mediaType` repair) | 4+14+7+7+2+2 = 36 |
| P3   | aws-lc-rs alt provider; flushGate + capacityWake                                                                                                                                                                                               | 2+1 = 3           |

**Critical-path closure (P0+P1): 18 days.** **Full closure (P0+P1+P2): 54 days.**
**Surface percentage post-P0+P1: 78%. Post-P0+P1+P2: 96%.**

---

## Cross-axis observations

1. **Lineage.** `crates/` is a fork of the OpenAI Codex Rust crates
   (note `Args` derive `clap::Parser` with `#[command(name = "codex-network-proxy")]`
   at `proxy.rs:19-21`, `AGIWORKFORCE_NETWORK_POLICY_VIOLATION` prefix at
   `runtime.rs:39`, `agiworkforce_otel.network_proxy` audit target at
   `network_policy.rs:12`). The bridge/control-request/trusted-device patterns
   are **TS-only**, **Anthropic-only**, and **not in the Codex Rust lineage**.
   Closing those gaps means writing new Rust, not porting from existing Rust.
2. **MITM CA storage.** `{AGIWORKFORCE_HOME}/proxy/ca.{pem,key}` is created
   `O_CREAT|O_EXCL` mode 0600. macOS Keychain integration would need a separate
   crate; current model is filesystem-only. For Trusted-Device enrollment we'd
   want Keychain (memoized read, ~40 ms `security` subprocess on first call as
   `trustedDevice.ts:39-52` notes).
3. **Audit telemetry quality.** `network_policy.rs:228-255` emits structured
   tracing events with 14 fields — _better_ than anything in our `apps/web/`
   stack. The pattern (target = `agiworkforce_otel.network_proxy`, event.name =
   well-known string, fields covered both in network-decision and metadata-decision
   contexts) is the right blueprint for cross-surface telemetry.
4. **Decoupling.** `agiworkforce-protocol` is large (14K LOC) but cleanly split
   per-domain — auth, mcp, items, models, permissions, parse_command,
   shell_environment etc. Adding a `bridge` module here would not require
   touching the existing modules.
5. **Cargo `audit.toml`.** `.cargo/audit.toml` per-entry justification list is
   clean — we're not lying about transitive deps. Adding `rama` adds a few new
   transitive advisories (rama-tcp uses `tokio` and `hyper-rustls` — both
   audited), but no net-new ignored advisories.

---

## File scope read

- `crates/agiworkforce-async-utils/src/lib.rs` (86 LOC)
- `crates/agiworkforce-execpolicy/src/{lib,policy,decision,rule,parser,amend}.rs` (~1,500 LOC sampled)
- `crates/agiworkforce-network-proxy/src/{lib,proxy,mitm,certs,upstream,network_policy,config,state,policy,runtime,http_proxy,socks5}.rs` (~7,400 LOC sampled)
- `crates/agiworkforce-protocol/src/{lib,protocol,permissions,models,mcp,auth,approvals,parse_command,shell_environment,exec_output,dynamic_tools,network_policy,config_types,items}.rs` (~14,000 LOC sampled)
- `crates/agiworkforce-utils-{absolute-path,cache,home-dir,image,rustls-provider,string,template}/src/*.rs` (~2,500 LOC)
- `crates/sandbox-policy/src/lib.rs` (121 LOC)

Total: **67 .rs files / ~40K LOC** read in full or sampled
proportionally to the surface they expose.
