---
id: "F072-10"
type: "feature"
title: "Sign-in, settings, folders and environment"
aliases: ["agi login", "agi logout", "agi auth-status", "/login", "/logout", "/auth", "-C", "--repo", "--add-dir", "/add-dir", "/config", "config.toml", "AGIWORKFORCE_HOME", "S72.10", "S72.22", "S72.33", "S72.34"]
area: "72 CLI and terminal application"
available_on: ["cli"]
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "built", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S72.10", "S72.22", "S72.33", "S72.34"]
depends_on: ["surface:cli", "mode:local", "mode:own-key", "mode:cloud", "api:POST /api/auth/device/code", "api:POST /api/auth/device/token", "api:POST /api/auth/device/refresh", "api:GET /api/me", "file:apps/cli/src/auth.rs", "file:apps/cli/src/config.rs", "file:apps/cli/src/secure_store.rs", "store:config.toml", "SYS-authentication-and-identity", "SYS-security-and-privacy"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F072-10 Sign-in, settings, folders and environment

The CLI (surface:cli only) signs the user in and out, shows which credentials exist, runs against a chosen folder, and reads settings from a global file, a trusted project file and environment variables. Account sign-in uses a browser device code. Provider API keys go to the OS keychain or owner-only files.

Area: [72. CLI and terminal application](README.md). Requirement items: [S72.10](../../10-requirements/capabilities/072-cli-and-terminal-application.md#s7210), [S72.22](../../10-requirements/capabilities/072-cli-and-terminal-application.md#s7222), [S72.33](../../10-requirements/capabilities/072-cli-and-terminal-application.md#s7233), [S72.34](../../10-requirements/capabilities/072-cli-and-terminal-application.md#s7234).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** `agi login` runs a device-code sign-in to the AGI account (apps/cli/src/auth.rs:1044-1051); `agi login <provider>` stores that provider's API key (apps/cli/src/auth.rs:1267-1288); `agi logout` signs out of the account and `--all` also removes keys (apps/cli/src/lib.rs:7275-7294); `agi auth-status` lists credentials (apps/cli/src/lib.rs:7449-7470). `-C/--repo` moves into another folder and `--add-dir` adds extra roots (apps/cli/src/lib.rs:408-422, 5971-5972, 6080-6083). Config merges layers (apps/cli/src/config.rs:709-728).

**Why it exists.** Cloud needs an account, own-key needs a stored key, and developers need per-project and per-machine settings without editing code (doc: knowledge-base/data/area-briefs/072-cli-and-terminal-application.md S72.10, S72.22, S72.33, S72.34).

**Who uses it.** Every CLI user, and CI authors who set environment variables or an absolute home folder.

**Problems it solves**

- Getting a credential onto a headless machine without pasting a password.
- Keeping keys out of plain files on macOS and Windows.
- Running the CLI on a repo other than the current folder.
- Overriding a model or provider for one run.

**Use cases**

- `agi login` then approve in a browser, to use Cloud.
- `agi login anthropic` to store an own-key credential.
- `agi -C ~/work/api exec "run the tests"` to work in another repo.
- `AGIWORKFORCE_MODEL=<id> agi exec ...` to pick a model in CI.

## 2. User experience

**Where to find it**

- surface:cli commands `agi login [provider]`, `agi logout [--all] [--yes]`, `agi auth-status`; in the full-screen or line session `/login [provider]`, `/logout`, `/auth`, `/config`, `/add-dir` (apps/cli/src/tui/tui_app.rs:5887-5890, 5981-5983; apps/cli/src/repl/slash_commands.rs:527, 599-606, 636; apps/cli/src/claude_parity.rs:221, 332-370). Flags `-C/--repo`, `--add-dir`, `--config`. Not on other apps.

**Before you start**

- A browser (or the printed link) for account sign-in.
- For own-key: a provider API key.
- For project config: a trusted folder and managed policy that allows it (apps/cli/src/config.rs:826-844).

**Screens and controls**

- Account sign-in prints a link and a code and says `Waiting for authorization...` (apps/cli/src/oauth.rs:489-503).
- API-key prompt `Enter <Provider> API key (<ENV>)` hidden input (apps/cli/src/auth.rs:1241-1250 region, interactive_api_key_login_for_provider).
- `auth-status` table: Provider, Type, Status, Expires, Last used (apps/cli/src/lib.rs:7449-7470).
- `logout --all` asks a destructive confirmation naming the consequence (apps/cli/src/lib.rs:7279-7289).

**Journey**

1. 1. Run `agi login`.
2. 2. Open the printed link, check the code matches, approve; the CLI polls until approved (apps/cli/src/oauth.rs:489-540).
3. 3. If updated terms are required the CLI prints the link to accept them (apps/cli/src/oauth.rs:522-535).
4. 4. The credential is saved and a device heartbeat is sent (apps/cli/src/auth.rs:1044-1050).
5. 5. Run `agi auth-status` to confirm.
6. 6. Run `agi logout` to sign out; `--all` also removes saved keys.

**What the person sees and gets**

- Logged out message: `Logged out from N provider(s).` or `No active sessions to log out from.`, with a note when AGI Cloud did not confirm the sign-out (apps/cli/src/app_server/account.rs:670-684).
- `/logout` appends `Saved provider API keys stay; agi logout --all removes them.` (apps/cli/src/lib.rs:4994-5002).
- `/login` result line `Login complete. Credentials saved.` (apps/cli/src/tui/tui_app.rs:7494-7510).

**Settings**

- ~/.agiworkforce/config.toml or $AGIWORKFORCE_HOME/config.toml (absolute path required) (apps/cli/src/config.rs:476-492, 1695-1713).
- Project file .agiworkforce/config.toml (apps/cli/src/config.rs:531-542).
- AGIWORKFORCE_MODEL, AGIWORKFORCE_PROVIDER, AGIWORKFORCE_MAX_TOKENS override; AGIWORKFORCE_API_BASE, AGI_PLAIN, AGI_SCREEN_READER are recorded (apps/cli/src/config.rs:1634-1670).
- AGIWORKFORCE_JWT supplies a Cloud token from the environment (apps/cli/src/app_server/account.rs:122), AGI_AUTH_BASE moves the sign-in host if it resolves to a trusted host (apps/cli/src/app_server/account.rs:287-293), AGIWORKFORCE_NO_KEYRING forces files (apps/cli/src/secure_store.rs:14-17).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Device-code sign-in to the web origin (apps/cli/src/oauth.rs:75, 133, 229; apps/cli/src/auth.rs:1015-1019).
- API-key login for a fixed provider list; unknown names are refused (apps/cli/src/auth.rs:1060-1290).
- Sign-out revokes the device grant and clears the local credential; if revocation is unconfirmed the message says so (apps/cli/src/app_server/account.rs:651-683).
- `auth-status` merges stored credentials with credentials found in environment variables (apps/cli/src/auth.rs:881-940).
- Secrets go to the OS keychain on macOS and Windows and owner-only files on Linux or when AGIWORKFORCE_NO_KEYRING is set (apps/cli/src/secure_store.rs:1-21).
- `-C/--repo` resolves `~`, canonicalises, requires a directory and runs before config and trust (apps/cli/src/lib.rs:5871-5897, 5968-5972).
- `--add-dir` registers extra roots, refuses network roots and missing folders (apps/cli/src/lib.rs:6080-6083; apps/cli/src/path_security.rs:52-100).
- Config order: user file, then project file (narrow-only), then environment, then managed policy (apps/cli/src/config.rs:709-728).
- A project provider with a non-loopback URL needs consent (apps/cli/src/config.rs:622-690).
- A repository config cannot loosen permission mode or change privacy mode (apps/cli/src/config.rs:731-780).

**Incomplete**

- Headless runs in an untrusted folder stop with an error instead of falling back to global config only (apps/cli/src/lib.rs:6160-6167).
- errors.rs describes `agi login <provider>` for openai and anthropic as opening a vendor subscription sign-in (apps/cli/src/errors.rs:495-499), but the code prompts for an API key for them (apps/cli/src/auth.rs:1276-1279); the copy helper is not about current behaviour [inferred].
- Copilot sign-in refuses with a message (apps/cli/src/auth.rs:1273-1275, 1135 const).

**Present but disconnected or switched off**

- Legacy `~/.agiworkforce/auth.toml` is mentioned as a fallback source in tier_cache docs (apps/cli/src/tier_cache.rs:19-24); whether it is still read is unknown.

**Not available**

- No browser-less password sign-in. Other apps use their own sign-in (SYS-authentication-and-identity).

## 4. Required behaviour

**Established requirements**

- The CLI can sign in, sign out and show authentication status (`agi login|logout|auth-status`, `/login`, `/logout`). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S72.10)
- The user can point a run at another repository or add extra working folders (`-C/--repo`, `--add-dir`, `/add-dir`). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S72.22)
- Settings are read from a global config file with per-project overrides and can be displayed. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S72.33)
- Environment variables override configuration (model, provider, max tokens, API base, plain mode) and the override is shown. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S72.34)
- Security behaviour fails closed; a repository config must not silently route prompts to a third-party server. (source: AGENTS.md section 6; apps/cli/src/config.rs:684-700)

**Acceptance criteria**

1. `agi login` prints a link and code and, once approved, `agi auth-status` lists an agiworkforce entry.
2. `agi login <provider>` stores a key; `agi auth-status` shows it with type and status.
3. `agi logout` removes the account sign-in but keeps provider keys; `agi logout --all` asks first and removes keys.
4. `agi -C <dir> exec ...` runs with <dir> as working folder; a non-directory fails with `--repo ...: not a directory`.
5. A relative AGIWORKFORCE_HOME is refused with a clear error.
6. A project config with a remote provider URL is dropped or asked about before use.
7. `/config` lists env overrides such as AGIWORKFORCE_MODEL.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Local mode should need no sign-in (policy: doc: docs/product/definition.md says sign-in is a separate question from payment) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make a headless run in an untrusted folder fall back to global config and say so, or return a configuration exit code.
- [proposed] Reconcile the vendor-subscription copy helper with the API-key login.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| command | Command::Login / Logout / AuthStatus | `apps/cli/src/lib.rs` | Subcommand definitions (985-1006) and handlers (7269-7294, 7449-7470). |
| service | login_agiworkforce / interactive_login_for_provider | `apps/cli/src/auth.rs` | Account and API-key login (1044-1051, 1267-1288). |
| store | AuthStore and credential index | `apps/cli/src/auth.rs` | Credential storage and auth.json index (85-130). |
| service | auth_status | `apps/cli/src/auth.rs` | Status table plus environment credentials (881-940). |
| service | device_code_login | `apps/cli/src/oauth.rs` | Device-code flow with polling, slow-down and terms (489-540). |
| service | sign_out_of_account / save_device_grant | `apps/cli/src/app_server/account.rs` | Sign-out with revocation, device grant install (287-309, 651-684). |
| service | secure_store | `apps/cli/src/secure_store.rs` | Keychain or owner-only file secrets (1-100). |
| service | CliConfig load and layers | `apps/cli/src/config.rs` | Home resolution, project config, layers, env overrides (476-542, 622-780, 826-844, 1634-1713). |
| service | resolve_repo_directory / enter_repo_directory | `apps/cli/src/lib.rs` | -C handling (5871-5897). |
| service | register_additional_workspace_root | `apps/cli/src/path_security.rs` | --add-dir validation (52-110). |
| command | /add-dir handler | `apps/cli/src/claude_parity.rs` | In-session add-dir (332-370). |
| command | slash commands /login /logout /config | `apps/cli/src/tui/tui_app.rs` | Full-screen handlers (5887, 5981-5983, 7494-7520, 7789-7798). |
| command | slash commands in line REPL | `apps/cli/src/repl/slash_commands.rs` | /config, /login, /logout, /auth (527, 599-640). |
| endpoint | api:POST /api/auth/device/code, /token, /refresh | `apps/web/app/api/auth/device` | Server side of the device grant the CLI calls. |
| service | tier_cache | `apps/cli/src/tier_cache.rs` | Reads plan from /api/me with the token (1-40). |
| test | auth and config tests | `apps/cli/src/auth.rs` | Sign-in, sign-out, status tests (2058-2575). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| `agi login` requests a device code from the web origin. | our servers | apps/cli/src/oauth.rs:75; apps/web/app/api/auth/device/code |
| User approves in a browser on the AGI site. | our servers | apps/cli/src/oauth.rs:111 verification URL |
| CLI polls the token endpoint, then stores the grant locally. | device and our servers | apps/cli/src/oauth.rs:133; apps/cli/src/app_server/account.rs:300-309 |
| For own-key, a hidden prompt reads the key and saves it to the keychain or an owner-only file. | device | apps/cli/src/auth.rs:1241-1262; apps/cli/src/secure_store.rs:1-21 |
| On sign-out the device grant is revoked on the server and cleared locally. | device and our servers | apps/cli/src/app_server/account.rs:651-668 |
| At each launch config is loaded, merged and env overrides applied. | device | apps/cli/src/lib.rs:6185-6189; apps/cli/src/config.rs:709-728 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Account device grant and refresh credential | OS keychain (macOS, Windows) or owner-only file under the config folder (Linux or no-keyring) | No; the server holds the grant it issued | Removed on logout; server revoke attempted |
| Provider API keys | Same secure store; auth.json holds provider names only | No | Removed by `logout --all` after confirmation |
| config.toml and project .agiworkforce/config.toml | Plain files on disk | A separate `agi sync` command exists; not part of this feature | Kept until edited |

**Models and providers.** Own-key login accepts these provider ids, matching folder names under packages/ai/providers where they exist: anthropic, openai, google, xai, deepseek, minimax, perplexity, qwen, moonshot, zhipu, openrouter, nvidia, plus ollama-cloud, brave and tavily (apps/cli/src/auth.rs:1060-1135). Whether the Rust CLI reads the TypeScript provider packages is not shown; it uses its own models module [inferred].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Sign-in is needed only for Cloud; Local and own-key runs need none [inferred from apps/cli/src/models/provider_dispatch.rs:395-440]. |
| Permissions | Project config needs folder trust and managed policy allowance (apps/cli/src/config.rs:826-844); managed policy overrides everything (apps/cli/src/config.rs:709-728). |
| Subscription | Sign-in itself needs no plan; the plan decides which Cloud models and surfaces work (doc: docs/product/definition.md:294-301). |
| Limits and metering | Device-code polling honours the server's interval and expiry (apps/cli/src/oauth.rs:511-520). Rate limits on the web endpoints: unknown. |
| Feature flags | AGI_AUTH_BASE only resolves if it names a trusted AGI host (apps/cli/src/app_server/account.rs:287-293). |
| Model compatibility | none found in the code. |
| Provider restrictions | Copilot sign-in is unavailable (apps/cli/src/auth.rs:1273-1275). Unknown provider names are refused (apps/cli/src/auth.rs:1280-1283). |
| Local mode | Local models need no login. A Local privacy setting also stops Cloud calls such as the update check and remote features (apps/cli/src/update_check.rs:122-134; apps/cli/src/cloud/client.rs:368-373). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Waiting for approval | Polls until expiry; slow-down adds 5 seconds. | apps/cli/src/oauth.rs:511-521 |
| Terms update required | Prints a link to accept terms. | apps/cli/src/oauth.rs:522-535 |
| Credential store denies access | Surfaces as an error rather than writing plaintext (doc comment). | apps/cli/src/auth.rs:123-130 |
| Sign-out not confirmed by the server | Message says the device session ends on expiry or can be unlinked in Settings. | apps/cli/src/app_server/account.rs:676-681 |
| Relative or empty AGIWORKFORCE_HOME | Error: must be a non-empty absolute path. | apps/cli/src/config.rs:1695-1713 |
| Invalid config file | Some commands continue with defaults and a warning; others fail. | apps/cli/src/lib.rs:6190-6200 |
| Untrusted folder, headless | Error naming `agi init` as the trust action. | apps/cli/src/lib.rs:6160-6167 |
| Offline sign-in | The code request fails with a network error (class 69/75); no offline path. | apps/cli/src/lib.rs:8829-8845 [inferred] |
| Accessibility | Prompts use dialoguer; screen-reader mode switches menus to numbers. | apps/cli/src/output.rs:346-395 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/cli/src/auth.rs`: Re-sign-in keeps or replaces credentials, sign-out forgets unreadable managed credentials, Copilot refusal, unknown provider, env credentials reported with their variable, last-used (tests at 2058-2575).
- `apps/cli/src/config.rs`: Env overrides, project config loading, consent gate for remote providers, repository layer can only narrow privacy and permissions, home resolution, a test build never resolves the real home (tests at 1911-3170).
- `apps/cli/src/secure_store.rs`: Owner-only file written whole; non-default roots own their keychain service (tests at 130-148).
- `apps/cli/src/lib.rs`: Logout flags parse; --repo parses and resolves canonically (tests at 9943-9973, 10006-10040).
- `apps/cli/src/claude_parity.rs`: add-dir registers a directory (test at 3305).

**Test scenarios**

- **Account sign-in**
  1. Run `agi login`.
  2. Open the link, approve.
  3. Run `agi auth-status`.
  - Expected: A row for agiworkforce with status active.
- **Own key**
  1. Run `agi login anthropic`, paste a key.
  2. Run `agi auth-status`.
  - Expected: Row for anthropic; the key is not printed anywhere.
- **Logout scope**
  1. Run `agi logout`; `agi auth-status`.
  2. Run `agi logout --all`, decline, then accept.
  - Expected: Keys survive plain logout; the --all prompt names the loss; after accepting they are gone.
- **Other folder**
  1. Run `agi -C /path/to/other exec "pwd"`.
  - Expected: The agent works in /path/to/other; a missing path errors.
- **Env override**
  1. Run `AGIWORKFORCE_MODEL=x agi --config`.
  - Expected: Output lists AGIWORKFORCE_MODEL as an override.
- **Project config consent**
  1. Add a remote base_url provider to .agiworkforce/config.toml in a trusted repo; run `agi exec` headless.
  - Expected: The untrusted remote provider is dropped without consent.

**Where to look when it fails**

- `agi auth-status`, `agi doctor` auth checks (apps/cli/src/doctor.rs:289-356).
- Message `Current project is not trusted...` (apps/cli/src/lib.rs:6167).
- Credential storage label via banner (apps/cli/src/auth.rs:110-118).

**Hands-on test plans**

- CLI: [70-qa/test-plans/cli/072-cli-and-terminal-application.md](../../70-qa/test-plans/cli/072-cli-and-terminal-application.md)

## 10. Gaps and dependencies

- **Headless runs in an untrusted folder fail instead of using global-only config.** Affects: surface:cli CI. Evidence: apps/cli/src/lib.rs:6160-6167. Work needed: Decide the fallback and exit class.
- **Copy in errors.rs describes a vendor sign-in for openai and anthropic that the code does not offer.** Affects: surface:cli users. Evidence: apps/cli/src/errors.rs:495-499 vs apps/cli/src/auth.rs:1276-1279. Work needed: Align copy or implement.
- **The brief and draft cite /config as showing effective settings; `/config` is documented but the exact display of managed overrides was not traced.** Affects: surface:cli. Evidence: apps/cli/src/config.rs:1291 display; not read in full. Work needed: Trace and test.
- **No browser-less alternative to device sign-in other than AGIWORKFORCE_JWT.** Affects: surface:cli headless machines. Evidence: apps/cli/src/app_server/account.rs:122. Work needed: Document the token route.

**Depends on**

- surface:cli
- mode:local
- mode:own-key
- mode:cloud
- api:POST /api/auth/device/code
- api:POST /api/auth/device/token
- api:POST /api/auth/device/refresh
- api:GET /api/me
- file:apps/cli/src/auth.rs
- file:apps/cli/src/config.rs
- file:apps/cli/src/secure_store.rs
- store:config.toml
- SYS-authentication-and-identity
- SYS-security-and-privacy

## Unknown

- Rate limits and error bodies of the device endpoints (web code not read).
- Whether the legacy auth.toml fallback is still read.
- How `/config` renders managed-policy overrides.
- Whether the `ui` settings are written back by `/config set` in all cases.
