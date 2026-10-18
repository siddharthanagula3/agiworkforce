//! MCP (Model Context Protocol) client, CLI facade.
//!
//! The transport MECHANICS (JSON-RPC framing/correlation/timeouts, the three
//! transports, and the RFC 9728/8414/7591 OAuth flow) live in the shared
//! `agiworkforce-mcp` crate (Wave 5 stage d1 extraction). This module keeps the
//! CLI-app-local pieces only:
//!   * config loading (`McpServerConfig`/`McpTransport`/`McpOAuthConfig` +
//!     `.mcp.json`/`mcp.json` discovery), CLI back-compat shapes;
//!   * product-shaping of results, strict `tools/list` validation +
//!     `mcp_{server}_{tool}` namespacing, prompt slash-command parsing, and
//!     tool-result text extraction;
//!   * the host capability adapters wired into the crate via `ClientHooks`:
//!     [`KeyringTokenStore`] (OAuth persistence), [`HookFiringElicitationHandler`]
//!     (fires the CLI hooks around elicitation), and [`CliBrowserAuthorizer`]
//!     (the user-action browser chokepoint);
//!   * the elicitation UI (`tui_handler`) and the connection pool.
//!
//! `McpConnection` is now a thin adapter over `agiworkforce_mcp::McpClient`.

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use agiworkforce_mcp::elicitation::{
    AutoDeclineHandler, ElicitationHandler, ElicitationMode, ElicitationRequest,
    ElicitationResponse,
};
use agiworkforce_mcp::{
    BrowserAuthorizer, ClientHooks, ClientInfo, ClientRegistration, McpClient, McpTimeouts,
    OAuthConfig, OAuthToken, TokenStore, TransportConfig,
};

pub mod consent;
pub mod elicitation;
mod oauth_store;
pub mod registry;
pub mod tui_handler;

pub use oauth_store::McpOAuthStore;
use oauth_store::McpServerOAuthStore;

// ---------------------------------------------------------------------------
// Config types (CLI-local: serde back-compat + manifest shapes)
// ---------------------------------------------------------------------------

/// MCP server configuration. Backward-compatible: a config without
/// `transport` defaults to `Stdio` and uses `command`/`args`/`env` directly.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum McpServerConfig {
    /// New explicit-transport shape (`transport = "stdio" | "sse" | "http"`).
    Tagged(McpTransport),
    /// Legacy shape: `{command, args, env}` at top level → `Stdio`.
    Legacy(LegacyStdioConfig),
}

/// OAuth configuration for an MCP HTTP transport.
///
/// All fields optional, when absent we run RFC 9728 → RFC 8414 discovery on
/// first 401. When `client_id` is also absent we attempt RFC 7591 dynamic
/// client registration against the discovered AS.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct McpOAuthConfig {
    /// Override RFC 9728/8414 discovery for the authorize endpoint.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub authorize_url: Option<String>,
    /// Override the discovered token endpoint.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token_url: Option<String>,
    /// Space-separated scopes requested.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
    /// Pre-registered client id. If unset, attempt RFC 7591 dynamic registration.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_id: Option<String>,
    /// Pre-registered client secret (confidential clients only).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_secret: Option<String>,
    /// Override redirect URI; defaults to `http://127.0.0.1:<random>/callback`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub redirect_uri: Option<String>,
}

/// Discriminated transport union. The `Http` variant carries an optional typed
/// `McpOAuthConfig`; when present, the HTTP layer transparently runs the PKCE
/// flow on first 401 and persists tokens to the OS credential store.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "transport", rename_all = "lowercase")]
pub enum McpTransport {
    Stdio {
        command: String,
        #[serde(default)]
        args: Vec<String>,
        #[serde(default)]
        env: HashMap<String, String>,
        /// See [`LegacyStdioConfig::allow_local_network`].
        #[serde(
            default,
            rename = "allowLocalNetwork",
            skip_serializing_if = "std::ops::Not::not"
        )]
        allow_local_network: bool,
        /// See [`LegacyStdioConfig::sandbox`].
        #[serde(default, skip_serializing_if = "Option::is_none")]
        sandbox: Option<bool>,
        /// See [`LegacyStdioConfig::cwd`].
        #[serde(default, skip_serializing_if = "Option::is_none")]
        cwd: Option<String>,
        /// See [`LegacyStdioConfig::origin`].
        #[serde(skip)]
        origin: McpServerOrigin,
    },
    Sse {
        url: String,
        #[serde(default)]
        headers: HashMap<String, String>,
    },
    Http {
        url: String,
        #[serde(default)]
        headers: HashMap<String, String>,
        /// OAuth (PKCE) configuration.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        auth: Option<McpOAuthConfig>,
    },
}

/// Legacy {command, args, env} shape with no `transport` field. Collapses into
/// `McpTransport::Stdio` via `into_transport()`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LegacyStdioConfig {
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
    /// The sandboxed server may reach services on this computer: loopback
    /// addresses and Unix-domain sockets, such as a local database, Ollama, a
    /// browser's debugging port or Docker. Off unless the server's entry
    /// says so; a project server asks again when it is turned on.
    #[serde(
        default,
        rename = "allowLocalNetwork",
        skip_serializing_if = "std::ops::Not::not"
    )]
    pub allow_local_network: bool,
    /// `false` starts the server outside the OS sandbox, in the CLI's config
    /// folder rather than the project, so it reads nothing a sandboxed
    /// command could have rewritten by a relative path, unless the project's
    /// own MCP file names it or [`Self::cwd`] says otherwise; `true` starts
    /// it inside. Unset, it follows where the server was configured: a
    /// project's MCP file or plugin runs it sandboxed, since the project is
    /// what a sandboxed command can rewrite, and the user's own config or a
    /// plugin the user installed runs it outside. A project server asks
    /// again when it is turned off, and a managed policy that requires the
    /// sandbox overrides it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sandbox: Option<bool>,
    /// `"project"` starts a server from the user's own config or a plugin
    /// in the project folder when it runs outside the sandbox, rather than
    /// in the CLI's config folder. A project's own server starts there
    /// anyway. No other value is accepted.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
    /// Which configuration named the server, set by the loader that read it.
    #[serde(skip)]
    pub origin: McpServerOrigin,
}

impl McpServerConfig {
    /// Normalize to `McpTransport`. The Legacy variant collapses into Stdio.
    pub fn into_transport(self) -> McpTransport {
        match self {
            McpServerConfig::Tagged(t) => t,
            McpServerConfig::Legacy(l) => McpTransport::Stdio {
                command: l.command,
                args: l.args,
                env: l.env,
                allow_local_network: l.allow_local_network,
                sandbox: l.sandbox,
                cwd: l.cwd,
                origin: l.origin,
            },
        }
    }

    /// View as `McpTransport` without consuming.
    pub fn as_transport(&self) -> McpTransport {
        self.clone().into_transport()
    }

    /// Convenience constructor for stdio configs (matches the pre-B1 shape).
    pub fn stdio(
        command: impl Into<String>,
        args: Vec<String>,
        env: HashMap<String, String>,
    ) -> Self {
        McpServerConfig::Legacy(LegacyStdioConfig {
            command: command.into(),
            args,
            env,
            allow_local_network: false,
            sandbox: None,
            cwd: None,
            origin: McpServerOrigin::default(),
        })
    }

    /// The same server with `sandboxed` as its sandbox setting when its entry
    /// leaves that unset: the default for the scope it was configured in.
    pub(crate) fn with_scope_default(self, sandboxed: bool) -> Self {
        match self {
            McpServerConfig::Legacy(mut legacy) => {
                legacy.sandbox = legacy.sandbox.or(Some(sandboxed));
                McpServerConfig::Legacy(legacy)
            }
            McpServerConfig::Tagged(McpTransport::Stdio {
                command,
                args,
                env,
                allow_local_network,
                sandbox,
                cwd,
                origin,
            }) => McpServerConfig::Tagged(McpTransport::Stdio {
                command,
                args,
                env,
                allow_local_network,
                sandbox: sandbox.or(Some(sandboxed)),
                cwd,
                origin,
            }),
            remote => remote,
        }
    }

    /// The same server, recorded as named by `origin`.
    pub(crate) fn with_origin(self, origin: McpServerOrigin) -> Self {
        match self {
            McpServerConfig::Legacy(mut legacy) => {
                legacy.origin = origin;
                McpServerConfig::Legacy(legacy)
            }
            McpServerConfig::Tagged(McpTransport::Stdio {
                command,
                args,
                env,
                allow_local_network,
                sandbox,
                cwd,
                ..
            }) => McpServerConfig::Tagged(McpTransport::Stdio {
                command,
                args,
                env,
                allow_local_network,
                sandbox,
                cwd,
                origin,
            }),
            remote => remote,
        }
    }

    /// Convenience constructor for SSE configs.
    pub fn sse(url: impl Into<String>, headers: HashMap<String, String>) -> Self {
        McpServerConfig::Tagged(McpTransport::Sse {
            url: url.into(),
            headers,
        })
    }

    /// Convenience constructor for Streamable HTTP configs (no OAuth). Plugins
    /// construct the OAuth-enabled variant directly via `McpTransport::Http`.
    #[allow(dead_code)]
    pub fn http(url: impl Into<String>, headers: HashMap<String, String>) -> Self {
        McpServerConfig::Tagged(McpTransport::Http {
            url: url.into(),
            headers,
            auth: None,
        })
    }

    /// Short string for logging.
    #[allow(dead_code)]
    pub fn transport_kind(&self) -> &'static str {
        match self.as_transport() {
            McpTransport::Stdio { .. } => "stdio",
            McpTransport::Sse { .. } => "sse",
            McpTransport::Http { .. } => "http",
        }
    }
}

pub fn policy_refusal(name: &str, config: &McpServerConfig) -> Option<String> {
    crate::cloud::workspace_policy::cached_mcp_server_refusal(
        name,
        remote_config_url(config).as_deref(),
    )
}

/// Whether a configured MCP transport may be opened inside the active trust
/// boundary. Stdio is the only Local transport: SSE and Streamable HTTP are
/// network egress even when their tool schemas look read-only.
fn mcp_transport_allowed(
    config: &McpServerConfig,
    privacy_mode: crate::agent::PrivacyMode,
) -> bool {
    privacy_mode != crate::agent::PrivacyMode::Local
        || matches!(config.as_transport(), McpTransport::Stdio { .. })
}

/// Provider APIs constrain a tool name to `^[a-zA-Z0-9_-]+$`, and reject the
/// whole request when one tool breaks it: OpenAI-compatible routes (DeepSeek
/// among them) answer `Invalid 'tools[n].function.name': string does not match
/// pattern`, Google and Anthropic refuse it the same way. MCP server and tool
/// names are free-form, so a dot, colon or slash in either half has to go
/// before the name reaches any request builder.
fn provider_safe_name_part(part: &str) -> String {
    part.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

/// The model-visible name of an MCP tool, in the `mcp__<server>__<tool>`
/// convention the rest of the product already reads.
pub fn mcp_tool_name(server_name: &str, tool_name: &str) -> String {
    format!(
        "mcp__{}__{}",
        provider_safe_name_part(server_name),
        provider_safe_name_part(tool_name)
    )
}

/// MCP tool discovered from a server.
#[derive(Debug, Clone)]
pub struct McpTool {
    /// Model-visible tool name: `mcp__{server}__{tool}`, provider-safe and
    /// unique across every connected server.
    pub namespaced_name: String,
    /// Original tool name from server
    pub original_name: String,
    /// Server this tool belongs to
    pub server_name: String,
    /// Tool description
    pub description: String,
    /// JSON Schema for input parameters
    pub input_schema: serde_json::Value,
}

/// MCP prompt discovered from a server.
#[derive(Debug, Clone)]
pub struct McpPrompt {
    /// Slash command name without the leading slash: `mcp:<server>:<prompt>`.
    pub command_name: String,
    /// Original prompt name from server.
    pub original_name: String,
    /// Server this prompt belongs to.
    pub server_name: String,
    /// Prompt description.
    pub description: String,
    /// Argument metadata returned by `prompts/list`.
    pub arguments: Vec<McpPromptArgument>,
}

#[derive(Debug, Clone)]
pub struct McpPromptArgument {
    pub name: String,
    pub description: String,
    pub required: bool,
}

// ---------------------------------------------------------------------------
// Host capability adapters wired into agiworkforce_mcp::ClientHooks
// ---------------------------------------------------------------------------

/// Convert the CLI's manifest config shape into the engine's transport
/// config. A stdio server runs under the full-read sandbox unless its entry,
/// its scope's default, the user's environment or `--no-sandbox` turns that
/// off; then it starts outside every writable root, in the folder
/// [`starts_in_project`] chooses.
///
/// `project` is the folder the server's launch was approved for. A local
/// server is sandboxed to it and started in it, never in whatever directory
/// this process happens to be in: the files an approval pinned are that
/// folder's, and a server started elsewhere would run other ones.
fn sandboxed_transport_config(
    config: &McpServerConfig,
    project: Option<&std::path::Path>,
) -> Result<SandboxedTransport> {
    let transport = to_transport_config(config);
    if !matches!(transport, TransportConfig::Stdio { .. }) {
        return Ok(SandboxedTransport::unsandboxed(transport));
    }
    let project =
        project.context("a local MCP server starts in a project folder, and none was given")?;
    let transport = on_host_path(transport)?;
    let in_project = starts_in_project(config)?;
    if !mcp_server_sandboxed(
        config,
        crate::sandbox::sandbox_settings(),
        crate::sandbox::sandbox_disabled(),
    ) {
        return outside_writable_roots(transport, in_project.then_some(project));
    }
    let (workspace, held) = server_workspace(project)?;
    let mut sandboxed = sandbox_stdio_transport(
        crate::sandbox::SandboxType::detect(),
        &workspace,
        project,
        mcp_server_network(config),
        transport,
        in_project,
    )?;
    sandboxed.workspace = held;
    Ok(sandboxed)
}

/// The folder a sandboxed server may write: its project, or, when the
/// project is a folder no sandbox is given, such as the home folder, a
/// private one made for this server and removed with it. The server still
/// starts in the project either way.
fn server_workspace(
    project: &std::path::Path,
) -> Result<(std::path::PathBuf, Option<tempfile::TempDir>)> {
    let root = project
        .canonicalize()
        .unwrap_or_else(|_| project.to_path_buf());
    if agiworkforce_sandbox_policy::is_safe_write_root(&root) {
        return Ok((root, None));
    }
    let held = tempfile::Builder::new()
        .prefix("agi-mcp-workspace-")
        .tempdir()
        .context("could not make a private workspace for a sandboxed MCP server")?;
    let workspace = held
        .path()
        .canonicalize()
        .unwrap_or_else(|_| held.path().to_path_buf());
    Ok((workspace, Some(held)))
}

/// A stdio launch with its bare command resolved once, to the absolute path
/// of the first program by that name on the host `PATH`, which leaves out
/// every folder a sandbox can write, and with that `PATH` unless its entry
/// sets one. Sandboxed or not, an `npx`, `uvx` or `node` left in a project's
/// `.venv/bin` or `node_modules/.bin` is never the one that runs.
#[cfg(unix)]
fn on_host_path(transport: TransportConfig) -> Result<TransportConfig> {
    match transport {
        TransportConfig::Stdio {
            command,
            args,
            mut env,
            cwd,
        } => {
            let host_path = agiworkforce_sandbox_policy::host_path::host_path();
            let command = host_program(&command, &host_path)?;
            env.entry("PATH".to_string())
                .or_insert_with(|| host_path.to_string_lossy().into_owned());
            Ok(TransportConfig::Stdio {
                command,
                args,
                env,
                cwd,
            })
        }
        remote => Ok(remote),
    }
}

/// Windows has no sandbox and no folder a sandboxed command wrote, so the
/// command is found as the system finds it.
#[cfg(not(unix))]
fn on_host_path(transport: TransportConfig) -> Result<TransportConfig> {
    Ok(transport)
}

/// The absolute program an approval of `command` covers: where a bare name
/// resolves on the host `PATH` now. A consent pins it, so the same name
/// resolving to another program asks again.
pub(crate) fn resolved_program(command: &str) -> Option<String> {
    #[cfg(unix)]
    {
        host_program(
            command,
            &agiworkforce_sandbox_policy::host_path::host_path(),
        )
        .ok()
        .filter(|program| program != command)
    }
    #[cfg(not(unix))]
    {
        let _ = command;
        None
    }
}

/// A transport ready to open, and the private scratch directory of the
/// sandboxed server it starts. The directory, with the caches the server
/// filled, is removed when this is dropped, so the connection keeps it for
/// as long as the server runs.
struct SandboxedTransport {
    transport: TransportConfig,
    sandboxed: bool,
    scratch: Option<tempfile::TempDir>,
    /// The private workspace of a sandboxed server whose project no sandbox
    /// may write, removed with the server like its scratch directory.
    workspace: Option<tempfile::TempDir>,
    /// The config folder an unsandboxed stdio server was started in.
    started_in: Option<std::path::PathBuf>,
}

impl SandboxedTransport {
    fn unsandboxed(transport: TransportConfig) -> Self {
        Self {
            transport,
            sandboxed: false,
            scratch: None,
            workspace: None,
            started_in: None,
        }
    }
}

/// Whether a stdio server that runs outside the sandbox starts in the
/// project: one the project's own MCP file names, whose launch there the
/// user approved, or one whose entry sets `"cwd": "project"`. Every other
/// starts in the CLI's config folder, which no sandbox writes, so a
/// relative program or module path cannot reach a file a sandboxed command
/// left in the project.
fn starts_in_project(config: &McpServerConfig) -> Result<bool> {
    let McpTransport::Stdio { cwd, origin, .. } = config.as_transport() else {
        return Ok(false);
    };
    match cwd.as_deref() {
        None => Ok(origin == McpServerOrigin::Project),
        Some(MCP_CWD_PROJECT) => Ok(true),
        Some(other) => {
            bail!("\"cwd\": {other:?} is not supported; the only value is \"{MCP_CWD_PROJECT}\"")
        }
    }
}

/// The one value a server's `"cwd"` accepts.
const MCP_CWD_PROJECT: &str = "project";

/// A server whose entry leaves `sandbox` unset is sandboxed here; the
/// loaders of user-scoped servers fill in their unsandboxed default first.
fn mcp_server_sandboxed(
    config: &McpServerConfig,
    settings: crate::sandbox::SandboxSettings,
    sandbox_disabled: bool,
) -> bool {
    let configured = match config.as_transport() {
        McpTransport::Stdio { sandbox, .. } => sandbox.unwrap_or(true),
        McpTransport::Sse { .. } | McpTransport::Http { .. } => return false,
    };
    !sandbox_disabled && settings.mcp_servers.applies(configured)
}

/// What a sandboxed MCP server may reach. By default the internet, and on
/// macOS not loopback or a local Unix-domain socket, such as tmux's or
/// Docker's, through which it could drive a program outside the sandbox. On
/// Linux bubblewrap has no address filter, so a long-lived server that keeps
/// the network reaches loopback and Unix sockets there too. A server whose
/// entry sets `allowLocalNetwork` reaches them on every platform.
fn mcp_server_network(config: &McpServerConfig) -> crate::sandbox::NetworkPolicy {
    match config.as_transport() {
        McpTransport::Stdio {
            allow_local_network: true,
            ..
        } => crate::sandbox::NetworkPolicy::Allow,
        _ => crate::sandbox::NetworkPolicy::AllowExternal,
    }
}

/// A filesystem server's chosen roots are writable in its sandbox, as on the
/// desktop; every other directory argument stays read-only. The workspace is
/// named first, so a root that is a link inside it is refused on the first
/// launch too. The launch starts in `project`, which the sandbox wrapper
/// hands on to the server it runs.
fn sandbox_stdio_transport(
    sandbox_type: crate::sandbox::SandboxType,
    workspace: &std::path::Path,
    project: &std::path::Path,
    network: crate::sandbox::NetworkPolicy,
    transport: TransportConfig,
    in_project: bool,
) -> Result<SandboxedTransport> {
    match transport {
        TransportConfig::Stdio {
            command,
            args,
            env,
            cwd,
        } => {
            if agiworkforce_sandbox_policy::is_safe_write_root(workspace) {
                agiworkforce_worktree::register_workspace_root(workspace.to_path_buf());
            }
            match crate::sandbox::full_read_program_guarding(
                sandbox_type,
                workspace,
                &crate::sandbox::filesystem_server_roots(&args),
                network,
                &crate::sandbox::credential_locations(),
                |name| env.get(name).cloned(),
                &command,
                &args,
            )? {
                Some(launch) => Ok(SandboxedTransport {
                    transport: TransportConfig::Stdio {
                        command: launch.program,
                        args: launch.args,
                        env,
                        cwd: Some(project.to_path_buf()),
                    },
                    sandboxed: true,
                    scratch: launch.scratch,
                    workspace: None,
                    started_in: None,
                }),
                None => outside_writable_roots(
                    TransportConfig::Stdio {
                        command,
                        args,
                        env,
                        cwd,
                    },
                    in_project.then_some(project),
                ),
            }
        }
        remote => Ok(SandboxedTransport::unsandboxed(remote)),
    }
}

/// What is added to a sandboxed server's failure to start: the sandbox is
/// the likeliest cause of a server that worked before, so the line says it
/// ran there and names each way out.
fn sandboxed_start_hint() -> String {
    format!(
        "it ran in the OS sandbox, which lets it write only the workspace and a private \
         scratch folder. If it needs more, set \"sandbox\": false in its entry to run it \
         outside, \"allowLocalNetwork\": true to let it reach services on this computer, or \
         {}=0 to run every MCP server outside",
        crate::sandbox::SANDBOX_MCP_ENV
    )
}

/// A stdio server that runs unsandboxed starts in `project` when it is to
/// start in the project, else in the CLI's config folder. Its command and
/// `PATH` are the host's ([`on_host_path`]), wherever it starts.
#[cfg(unix)]
fn outside_writable_roots(
    transport: TransportConfig,
    project: Option<&std::path::Path>,
) -> Result<SandboxedTransport> {
    let TransportConfig::Stdio {
        command, args, env, ..
    } = on_host_path(transport)?
    else {
        bail!("only a local MCP server is started in a folder");
    };
    let dir = match project {
        Some(project) => project.to_path_buf(),
        None => crate::config::CliConfig::config_dir()
            .context("an unsandboxed MCP server starts in the CLI's config folder")?,
    };
    let started_in = project.is_none().then(|| dir.clone());
    Ok(SandboxedTransport {
        started_in,
        ..SandboxedTransport::unsandboxed(TransportConfig::Stdio {
            command,
            args,
            env,
            cwd: Some(dir),
        })
    })
}

/// What is added to an unsandboxed server's failure to start in the
/// config folder: a relative path in its entry was read from there.
fn unsandboxed_start_hint(started_in: &std::path::Path) -> String {
    format!(
        "started in {}; give absolute paths or set \"cwd\": \"{MCP_CWD_PROJECT}\"",
        started_in.display()
    )
}

/// `command` as the absolute path of the first program by that name on
/// `path` outside every folder a sandbox can write. A command with a `/` in
/// it names its own path and is kept.
#[cfg(unix)]
fn host_program(command: &str, path: &std::ffi::OsStr) -> Result<String> {
    if command.contains('/') {
        return Ok(command.to_string());
    }
    agiworkforce_sandbox_policy::host_path::find_program(
        path,
        command,
        &agiworkforce_sandbox_policy::host_path::untrusted_roots(&[]),
    )
    .map(|program| program.to_string_lossy().into_owned())
    .ok_or_else(|| {
        anyhow::anyhow!(
            "`{command}` was not found on PATH outside the folders a sandboxed command can \
             write; give its absolute path as the server's command"
        )
    })
}

/// Windows has no sandbox, so nothing a sandboxed command wrote is in the
/// project to load. A server that is to start in the project starts there,
/// and every other starts where the CLI runs.
#[cfg(not(unix))]
fn outside_writable_roots(
    transport: TransportConfig,
    project: Option<&std::path::Path>,
) -> Result<SandboxedTransport> {
    Ok(SandboxedTransport::unsandboxed(match transport {
        TransportConfig::Stdio {
            command, args, env, ..
        } => TransportConfig::Stdio {
            command,
            args,
            env,
            cwd: project.map(std::path::Path::to_path_buf),
        },
        remote => remote,
    }))
}

fn to_transport_config(config: &McpServerConfig) -> TransportConfig {
    match config.as_transport() {
        McpTransport::Stdio {
            command, args, env, ..
        } => TransportConfig::Stdio {
            command,
            args,
            env,
            cwd: None,
        },
        McpTransport::Sse { url, headers } => TransportConfig::Sse { url, headers },
        McpTransport::Http { url, headers, auth } => TransportConfig::Http {
            url,
            headers,
            oauth: auth.map(to_oauth_config),
        },
    }
}

fn to_oauth_config(c: McpOAuthConfig) -> OAuthConfig {
    OAuthConfig {
        authorize_url: c.authorize_url,
        token_url: c.token_url,
        scope: c.scope,
        client_id: c.client_id,
        client_secret: c.client_secret,
        redirect_uri: c.redirect_uri,
    }
}

fn mcp_token_to_crate(t: &McpOAuthToken) -> OAuthToken {
    OAuthToken {
        access_token: t.access_token.clone(),
        refresh_token: t.refresh_token.clone(),
        token_type: t.token_type.clone(),
        expires_at: t.expires_at,
        scope: t.scope.clone(),
        auth_server_metadata_url: t.auth_server_metadata_url.clone(),
        token_url: t.token_url.clone(),
        client_id: t.client_id.clone(),
        issuer: None,
        resource: None,
    }
}

/// OS-keyring-backed MCP OAuth adapter. The old aggregate JSON map is read
/// only to migrate an individual server credential on first use.
struct KeyringTokenStore;

impl TokenStore for KeyringTokenStore {
    fn get(&self, server_url: &str) -> Option<OAuthToken> {
        let secure_store = McpServerOAuthStore::new().ok()?;
        if let Some(token) = secure_store.load(server_url).ok()? {
            return Some(token);
        }

        let mut legacy = McpOAuthStore::load().ok()?;
        let token = mcp_token_to_crate(legacy.get(server_url)?);
        secure_store.save(server_url, &token).ok()?;
        legacy.remove(server_url);
        legacy.save().ok()?;
        Some(token)
    }

    fn set(&self, server_url: &str, token: OAuthToken) -> anyhow::Result<()> {
        McpServerOAuthStore::new()?.save(server_url, &token)
    }

    fn client(&self, issuer: &str) -> Option<ClientRegistration> {
        McpServerOAuthStore::new().ok()?.load_client(issuer).ok()?
    }

    fn set_client(&self, issuer: &str, client: ClientRegistration) -> anyhow::Result<()> {
        McpServerOAuthStore::new()?.save_client(issuer, &client)
    }
}

/// The interactive browser + TTY gate for the OAuth flow. Preserves the CLI's
/// user-action chokepoint (`open_external_url` only launches for an explicitly
/// user-initiated action) and its TTY interactivity check.
struct CliBrowserAuthorizer;

impl BrowserAuthorizer for CliBrowserAuthorizer {
    fn is_interactive(&self) -> bool {
        crate::interactive::can_prompt()
    }

    fn open_url(&self, url: &str) -> bool {
        crate::oauth::open_external_url(url, crate::oauth::UserActionContext::user_initiated())
    }
}

/// Wraps an inner elicitation handler and fires the CLI `Elicitation` /
/// `ElicitationResult` hooks around it, preserving the human-in-the-loop
/// audit/approval boundary the transport previously implemented inline.
struct HookFiringElicitationHandler {
    inner: Arc<dyn ElicitationHandler>,
}

impl HookFiringElicitationHandler {
    fn new(inner: Arc<dyn ElicitationHandler>) -> Self {
        Self { inner }
    }
}

impl ElicitationHandler for HookFiringElicitationHandler {
    fn modes(&self) -> &'static [ElicitationMode] {
        self.inner.modes()
    }

    fn handle<'a>(
        &'a self,
        server_name: &'a str,
        request: ElicitationRequest,
    ) -> Pin<Box<dyn Future<Output = ElicitationResponse> + Send + 'a>> {
        Box::pin(async move {
            // Load hooks per invocation (matches the original firing inside the
            // read loop, not at construction).
            let hcfg = crate::hooks::load_hooks_or_default();
            crate::hooks::run_hooks(
                &hcfg,
                crate::hooks::HookEvent::Elicitation,
                &crate::hooks::HookInput {
                    event: "Elicitation".to_string(),
                    session_id: None,
                    model: None,
                    tool_name: None,
                    tool_args: None,
                    tool_output: None,
                    message: Some(server_name.to_string()),
                    tool_execution: None,
                },
            )
            .await;
            let response = self.inner.handle(server_name, request).await;
            crate::hooks::run_hooks(
                &hcfg,
                crate::hooks::HookEvent::ElicitationResult,
                &crate::hooks::HookInput {
                    event: "ElicitationResult".to_string(),
                    session_id: None,
                    model: None,
                    tool_name: None,
                    tool_args: None,
                    tool_output: None,
                    message: Some(server_name.to_string()),
                    tool_execution: None,
                },
            )
            .await;
            response
        })
    }
}

/// Where an MCP server was configured.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum McpServerOrigin {
    Project,
    #[default]
    User,
    Plugin,
}

/// Credential posture of a configured server, decided without connecting.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum McpCredentialState {
    /// Runs locally, or carries its own credential header.
    Configured,
    /// Remote, with an OAuth token already in the store.
    Authorized,
    /// Remote, with neither a stored token nor a credential header.
    NeedsAuth,
}

/// A configured MCP server plus the scope and credential state a settings
/// surface needs. Discovery order matches the engine's: project files win over
/// the user's, and plugin-declared servers fill in the rest.
#[derive(Debug, Clone)]
pub struct DiscoveredMcpServer {
    pub name: String,
    pub config: McpServerConfig,
    pub origin: McpServerOrigin,
    pub credential: McpCredentialState,
    pub url: Option<String>,
}

fn mcp_server_url(config: &McpServerConfig) -> Option<String> {
    match config.as_transport() {
        McpTransport::Stdio { .. } => None,
        McpTransport::Sse { url, .. } | McpTransport::Http { url, .. } => Some(url),
    }
}

fn has_credential_header(headers: &HashMap<String, String>) -> bool {
    headers.keys().any(|key| {
        key.eq_ignore_ascii_case("authorization") || key.eq_ignore_ascii_case("x-api-key")
    })
}

fn credential_state(config: &McpServerConfig) -> McpCredentialState {
    match config.as_transport() {
        McpTransport::Stdio { .. } => McpCredentialState::Configured,
        McpTransport::Sse { url, headers } => remote_credential_state(&url, &headers),
        McpTransport::Http { url, headers, .. } => remote_credential_state(&url, &headers),
    }
}

fn remote_credential_state(url: &str, headers: &HashMap<String, String>) -> McpCredentialState {
    if KeyringTokenStore.get(url).is_some() {
        McpCredentialState::Authorized
    } else if has_credential_header(headers) {
        McpCredentialState::Configured
    } else {
        McpCredentialState::NeedsAuth
    }
}

/// Discover every configured MCP server with the scope it came from.
///
/// `project_dir` is the workspace whose `.mcp.json` / `mcp.json` counts as
/// project scope; passing it explicitly keeps this usable from a host that
/// must not depend on the process working directory.
pub fn discover_servers(project_dir: &std::path::Path) -> Vec<DiscoveredMcpServer> {
    #[cfg(test)]
    if let Some(configs) = TEST_CONFIGS.with(|cell| cell.borrow().clone()) {
        let mut entries: Vec<_> = configs.into_iter().collect();
        entries.sort_by(|left, right| left.0.cmp(&right.0));
        return entries
            .into_iter()
            .map(|(name, config)| DiscoveredMcpServer {
                url: mcp_server_url(&config),
                credential: credential_state(&config),
                name,
                config,
                origin: McpServerOrigin::User,
            })
            .collect();
    }
    let mut servers: Vec<DiscoveredMcpServer> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    let push_all = |configs: HashMap<String, McpServerConfig>,
                    origin: McpServerOrigin,
                    seen: &mut HashSet<String>,
                    servers: &mut Vec<DiscoveredMcpServer>| {
        let mut entries: Vec<(String, McpServerConfig)> = configs.into_iter().collect();
        entries.sort_by(|left, right| left.0.cmp(&right.0));
        for (name, config) in entries {
            if !seen.insert(name.clone()) {
                continue;
            }
            servers.push(DiscoveredMcpServer {
                url: mcp_server_url(&config),
                credential: credential_state(&config),
                name,
                config,
                origin,
            });
        }
    };

    let mut project = HashMap::new();
    for filename in [".mcp.json", "mcp.json"] {
        load_mcp_config_file_into(&project_dir.join(filename), &mut project, true);
    }
    push_all(project, McpServerOrigin::Project, &mut seen, &mut servers);

    push_all(
        user_servers(),
        McpServerOrigin::User,
        &mut seen,
        &mut servers,
    );

    let mut plugins = crate::plugins::PluginsManager::new();
    if plugins.load_all(Some(project_dir)).is_ok() {
        push_all(
            plugins.mcp_configs(),
            McpServerOrigin::Plugin,
            &mut seen,
            &mut servers,
        );
    }

    servers
}

/// Browser authorizer for a client that has its own window.
///
/// The terminal check `CliBrowserAuthorizer` makes is about the CLI printing
/// instructions to a TTY. An editor client drives the same flow from a button
/// the user pressed, so the open is still user-initiated and still goes
/// through the same chokepoint.
pub struct ClientBrowserAuthorizer;

impl BrowserAuthorizer for ClientBrowserAuthorizer {
    fn is_interactive(&self) -> bool {
        true
    }

    fn open_url(&self, url: &str) -> bool {
        crate::oauth::open_external_url(url, crate::oauth::UserActionContext::user_initiated())
    }
}

/// Authorize a remote MCP server on behalf of a client that opens its own
/// browser window, and report the resulting credential state.
pub async fn login_to_remote_server_for_client(
    name: &str,
    config: &McpServerConfig,
) -> Result<McpCredentialState> {
    sign_in(name, config, Arc::new(ClientBrowserAuthorizer)).await?;
    Ok(credential_state(config))
}

fn remote_config_url(config: &McpServerConfig) -> Option<String> {
    match config.as_transport() {
        McpTransport::Stdio { .. } => None,
        McpTransport::Sse { url, .. } | McpTransport::Http { url, .. } => Some(url),
    }
}

pub fn is_remote_server(config: &McpServerConfig) -> bool {
    !matches!(config.as_transport(), McpTransport::Stdio { .. })
}

/// Authorize a registered remote MCP server and leave its token in the store
/// every later connection reads.
pub async fn login_to_remote_server(name: &str, config: &McpServerConfig) -> Result<()> {
    if !crate::interactive::can_prompt() {
        bail!("`agi mcp login` needs an interactive terminal to open the browser");
    }
    sign_in(name, config, Arc::new(CliBrowserAuthorizer)).await
}

async fn sign_in(
    name: &str,
    config: &McpServerConfig,
    browser: Arc<dyn BrowserAuthorizer>,
) -> Result<()> {
    if matches!(config.as_transport(), McpTransport::Stdio { .. }) {
        bail!("MCP server '{name}' runs locally over stdio and has nothing to sign in to");
    }
    if let Some(refusal) = crate::cloud::workspace_policy::mcp_server_refusal(
        name,
        remote_config_url(config).as_deref(),
    )
    .await
    {
        bail!(refusal);
    }
    let hooks = build_client_hooks_with_browser(Arc::new(AutoDeclineHandler), browser);
    if let TransportConfig::Http {
        url,
        oauth: Some(oauth),
        ..
    } = to_transport_config(config)
    {
        complete_step_up(&url, &oauth, &hooks)
            .await
            .with_context(|| {
                format!("could not finish the extra sign-in MCP server '{name}' asked for")
            })?;
    }
    let mut client = McpClient::connect(
        name,
        to_transport_config(config),
        McpTimeouts::default(),
        hooks,
    )
    .await
    .with_context(|| format!("could not authorize MCP server '{name}'"))?;
    let _ = client.shutdown().await;
    Ok(())
}

async fn complete_step_up(url: &str, oauth: &OAuthConfig, hooks: &ClientHooks) -> Result<()> {
    let store = McpServerOAuthStore::new()?;
    let Some(scope) = store.load_step_up_scope(url)? else {
        return Ok(());
    };
    let challenge = format!("Bearer error=\"insufficient_scope\", scope=\"{scope}\"");
    let token =
        agiworkforce_mcp::oauth::perform_full_oauth(url, oauth, Some(&challenge), hooks).await?;
    hooks.token_store.set(url, token)?;
    store.delete_step_up_scope(url)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct McpSignInRequired {
    pub tool: String,
    pub server: String,
    pub scope: Option<String>,
}

tokio::task_local! {
    static SIGN_IN_REQUIRED: std::cell::RefCell<Vec<McpSignInRequired>>;
}

pub async fn collect_sign_in_required<F: Future>(future: F) -> F::Output {
    SIGN_IN_REQUIRED
        .scope(std::cell::RefCell::new(Vec::new()), future)
        .await
}

pub fn take_sign_in_required(tool: &str) -> Option<McpSignInRequired> {
    SIGN_IN_REQUIRED
        .try_with(|required| {
            let mut required = required.borrow_mut();
            let position = required.iter().position(|entry| entry.tool == tool)?;
            Some(required.remove(position))
        })
        .ok()
        .flatten()
}

fn needs_sign_in(error: &anyhow::Error) -> bool {
    error.chain().any(|cause| {
        cause
            .downcast_ref::<agiworkforce_mcp::McpError>()
            .is_some_and(agiworkforce_mcp::McpError::is_authorization_required)
    })
}

fn remember_step_up(error: &anyhow::Error) -> Option<String> {
    let (url, scope) = error.chain().find_map(|cause| {
        cause
            .downcast_ref::<agiworkforce_mcp::McpError>()
            .and_then(agiworkforce_mcp::McpError::step_up_scope)
    })?;
    if let Err(store_error) =
        McpServerOAuthStore::new().and_then(|store| store.save_step_up_scope(url, scope))
    {
        eprintln!("  could not record the scope {url} asked for: {store_error:#}");
    }
    Some(scope.to_string())
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum McpRevocation {
    Revoked,
    NotOffered,
    Failed(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct McpLogout {
    pub had_token: bool,
    pub revocation: Option<McpRevocation>,
}

pub async fn logout_from_remote_server(
    server_url: &str,
    config: Option<&McpServerConfig>,
) -> Result<McpLogout> {
    let token = KeyringTokenStore.get(server_url);
    let revocation = match &token {
        Some(token) => Some(revoke_at_provider(server_url, config, token).await),
        None => None,
    };
    McpServerOAuthStore::new()?.delete(server_url)?;
    let mut legacy = McpOAuthStore::load()?;
    legacy.remove(server_url);
    legacy.save()?;
    Ok(McpLogout {
        had_token: token.is_some(),
        revocation,
    })
}

fn revocation_oauth_config(config: Option<&McpServerConfig>) -> OAuthConfig {
    match config.map(to_transport_config) {
        Some(TransportConfig::Http {
            oauth: Some(oauth), ..
        }) => oauth,
        _ => OAuthConfig::default(),
    }
}

async fn revoke_at_provider(
    server_url: &str,
    config: Option<&McpServerConfig>,
    token: &OAuthToken,
) -> McpRevocation {
    let oauth = revocation_oauth_config(config);
    let attempt = agiworkforce_mcp::oauth::revoke_token(token, &oauth, server_url);
    match tokio::time::timeout(std::time::Duration::from_secs(30), attempt).await {
        Ok(Ok(true)) => McpRevocation::Revoked,
        Ok(Ok(false)) => McpRevocation::NotOffered,
        Ok(Err(error)) => McpRevocation::Failed(format!("{error:#}")),
        Err(_) => McpRevocation::Failed(
            "the authorization server did not answer in 30 seconds".to_string(),
        ),
    }
}

/// Build the host capability bundle handed to `McpClient::connect`.
///
/// The caller chooses the elicitation surface: headless flows inject
/// [`AutoDeclineHandler`], while the full-screen TUI injects its interactive
/// queue. The wrapper keeps the CLI hook lifecycle identical in both cases.
fn build_client_hooks(elicitation: Arc<dyn ElicitationHandler>) -> ClientHooks {
    build_client_hooks_with_browser(
        elicitation,
        Arc::new(agiworkforce_mcp::hooks::DenyBrowserAuthorizer),
    )
}

/// Same bundle with an explicit browser surface, for a client that owns a
/// window instead of a terminal.
fn build_client_hooks_with_browser(
    elicitation: Arc<dyn ElicitationHandler>,
    browser: Arc<dyn BrowserAuthorizer>,
) -> ClientHooks {
    ClientHooks {
        token_store: Arc::new(KeyringTokenStore),
        elicitation: Arc::new(HookFiringElicitationHandler::new(elicitation)),
        browser,
        client_info: ClientInfo {
            name: "agiworkforce-cli".to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
        },
        client_metadata_url: client_metadata_document_url(),
        on_log: agiworkforce_mcp::hooks::noop_log(),
        before_respawn: None,
    }
}

fn client_metadata_document_url() -> Option<String> {
    let raw = std::env::var("AGIWORKFORCE_API_BASE")
        .unwrap_or_else(|_| crate::tier_cache::default_api_base().to_string());
    let base = crate::tier_cache::resolve_agi_api_base(&raw)?;
    agiworkforce_mcp::oauth::client_metadata_document_url(&base, "cli")
}

/// What the engine asks before it restarts a local server that stopped: for
/// one a project declares, whether the launch is still the one the user
/// approved. The engine restarts from the launch it saved, and the files
/// that launch runs can have been edited since, so the approval is checked
/// again there and not only when the session loaded its servers.
fn respawn_check(
    name: &str,
    config: &McpServerConfig,
    project: Option<&std::path::Path>,
) -> Option<agiworkforce_mcp::RespawnCheck> {
    let McpTransport::Stdio { origin, .. } = config.as_transport() else {
        return None;
    };
    if origin == McpServerOrigin::User {
        return None;
    }
    let project = project?.to_path_buf();
    let (name, config) = (name.to_string(), config.clone());
    Some(Arc::new(move || {
        consent::respawn_allowed(&project, origin, &name, &config)
    }))
}

// ---------------------------------------------------------------------------
// MCP connection (thin adapter over agiworkforce_mcp::McpClient)
// ---------------------------------------------------------------------------

/// A running MCP server connection. Wraps the shared engine client and layers
/// the CLI's result-shaping (strict tool validation + namespacing, prompt slash
/// commands, tool-result text extraction) on top.
pub struct McpConnection {
    server_name: String,
    client: McpClient,
    timeouts: McpTimeouts,
    notifications: Option<tokio::sync::mpsc::Receiver<agiworkforce_mcp::McpNotification>>,
    recent_logs: std::sync::Mutex<std::collections::VecDeque<String>>,
    /// The sandboxed server's scratch directory, removed when the
    /// connection is dropped.
    _scratch: Option<tempfile::TempDir>,
    /// Its private workspace, when its project is not one a sandbox writes.
    _workspace: Option<tempfile::TempDir>,
}

const RECENT_LOG_LINES: usize = 200;

#[derive(Default)]
struct ListChanges {
    tools: bool,
    prompts: bool,
}

impl McpConnection {
    /// Start an MCP server and initialize the connection. `project` is the
    /// folder a local server starts in and is sandboxed to; a remote server
    /// needs none.
    pub async fn connect(
        name: &str,
        config: &McpServerConfig,
        project: Option<&std::path::Path>,
    ) -> Result<Self> {
        Self::connect_with_elicitation(name, config, project, Arc::new(AutoDeclineHandler)).await
    }

    /// Start an MCP server with an explicitly owned elicitation surface.
    /// Interactive callers must keep the handler alive and drain it while a
    /// request is in flight; headless callers should use [`Self::connect`].
    pub async fn connect_with_elicitation(
        name: &str,
        config: &McpServerConfig,
        project: Option<&std::path::Path>,
        elicitation: Arc<dyn ElicitationHandler>,
    ) -> Result<Self> {
        if let Some(refusal) = crate::cloud::workspace_policy::mcp_server_refusal(
            name,
            remote_config_url(config).as_deref(),
        )
        .await
        {
            bail!(refusal);
        }
        let SandboxedTransport {
            transport,
            sandboxed,
            scratch,
            workspace,
            started_in,
        } = sandboxed_transport_config(config, project)
            .with_context(|| format!("MCP server '{name}' could not be prepared to start"))?;
        let timeouts = McpTimeouts::default();
        let hooks = ClientHooks {
            before_respawn: respawn_check(name, config, project),
            ..build_client_hooks(elicitation)
        };
        let mut client = match McpClient::connect(name, transport, timeouts.clone(), hooks).await {
            Ok(client) => client,
            Err(error) if sandboxed => {
                return Err(anyhow::anyhow!("{error}; {}", sandboxed_start_hint()))
            }
            Err(error) => match started_in {
                Some(dir) => {
                    return Err(anyhow::anyhow!("{error}; {}", unsandboxed_start_hint(&dir)))
                }
                None => return Err(error.into()),
            },
        };
        let notifications = client.notifications();
        Ok(Self {
            server_name: name.to_string(),
            client,
            timeouts,
            notifications,
            recent_logs: std::sync::Mutex::new(std::collections::VecDeque::new()),
            _scratch: scratch,
            _workspace: workspace,
        })
    }

    pub fn negotiated(&self) -> &agiworkforce_mcp::NegotiatedServer {
        self.client.server()
    }

    pub fn recent_logs(&self) -> Vec<String> {
        let mut kept = self
            .recent_logs
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        kept.extend(self.client.drain_stderr());
        let excess = kept.len().saturating_sub(RECENT_LOG_LINES);
        kept.drain(..excess);
        kept.iter().cloned().collect()
    }

    pub async fn responding(&mut self) -> bool {
        self.client.is_alive().await
    }

    fn take_list_changes(&mut self) -> ListChanges {
        let mut changes = ListChanges::default();
        if let Some(notifications) = self.notifications.as_mut() {
            while let Ok(notification) = notifications.try_recv() {
                match notification.method.as_str() {
                    "notifications/tools/list_changed" => changes.tools = true,
                    "notifications/prompts/list_changed" => changes.prompts = true,
                    _ => {}
                }
            }
        }
        changes
    }

    /// Discover tools from the MCP server, validated and namespaced.
    pub async fn list_tools(&mut self) -> Result<Vec<McpTool>> {
        let response = self
            .client
            .request("tools/list", None, self.timeouts.list_tools)
            .await?;

        let tools_json = response
            .and_then(|r| r.get("tools").cloned())
            .and_then(|t| t.as_array().cloned())
            .unwrap_or_default();

        let mut tools = Vec::new();
        for tool in tools_json {
            let name = tool
                .get("name")
                .and_then(|n| n.as_str())
                .filter(|name| !name.trim().is_empty())
                .with_context(|| {
                    format!("[{}] MCP tool missing non-empty name", self.server_name)
                })?;
            let description = tool
                .get("description")
                .and_then(|d| d.as_str())
                .unwrap_or_default();
            let input_schema = tool.get("inputSchema").cloned().with_context(|| {
                format!(
                    "[{}] MCP tool '{}' missing inputSchema",
                    self.server_name, name
                )
            })?;
            let schema_object = input_schema.as_object().with_context(|| {
                format!(
                    "[{}] MCP tool '{}' inputSchema must be a JSON object",
                    self.server_name, name
                )
            })?;
            if schema_object.get("type").and_then(|v| v.as_str()) != Some("object") {
                bail!(
                    "[{}] MCP tool '{}' inputSchema.type must be \"object\"",
                    self.server_name,
                    name
                );
            }

            tools.push(McpTool {
                namespaced_name: mcp_tool_name(&self.server_name, name),
                original_name: name.to_string(),
                server_name: self.server_name.clone(),
                description: description.to_string(),
                input_schema,
            });
        }

        Ok(tools)
    }

    /// Discover prompts from the MCP server.
    pub fn serves_resources(&self) -> bool {
        self.client.server().capabilities.get("resources").is_some()
    }

    pub async fn list_resources(&mut self) -> Result<Vec<agiworkforce_mcp::McpResource>> {
        Ok(self.client.list_resources().await?)
    }

    pub async fn read_resource(
        &mut self,
        uri: &str,
    ) -> Result<Vec<agiworkforce_mcp::McpResourceContents>> {
        Ok(self.client.read_resource(uri).await?)
    }

    pub async fn list_prompts(&mut self) -> Result<Vec<McpPrompt>> {
        let response = self
            .client
            .request("prompts/list", None, self.timeouts.list_tools)
            .await?;
        Ok(parse_prompts_response(&self.server_name, response.as_ref()))
    }

    pub async fn get_prompt(
        &mut self,
        prompt_name: &str,
        arguments: serde_json::Map<String, serde_json::Value>,
    ) -> Result<String> {
        let response = self
            .client
            .request(
                "prompts/get",
                Some(serde_json::json!({
                    "name": prompt_name,
                    "arguments": arguments,
                })),
                self.timeouts.call_tool,
            )
            .await?;
        extract_prompt_text(response.as_ref())
    }

    /// Execute a tool on the MCP server. The engine re-establishes the
    /// connection and retries once on a connection error.
    pub async fn call_tool(
        &mut self,
        tool_name: &str,
        arguments: serde_json::Value,
    ) -> Result<String> {
        let result = self.client.call_tool_value(tool_name, arguments).await;
        self.recent_logs();
        let result = result?.unwrap_or(serde_json::Value::Null);

        // Extract text content from the response.
        if let Some(content) = result.get("content").and_then(|c| c.as_array()) {
            let texts: Vec<&str> = content
                .iter()
                .filter_map(|c| {
                    if c.get("type").and_then(|t| t.as_str()) == Some("text") {
                        c.get("text").and_then(|t| t.as_str())
                    } else {
                        None
                    }
                })
                .collect();
            Ok(texts.join("\n"))
        } else {
            Ok(result.to_string())
        }
    }

    /// Shut down the MCP server gracefully.
    pub async fn shutdown(&mut self) -> Result<()> {
        self.client.shutdown().await?;
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// MCP Manager
// ---------------------------------------------------------------------------

/// MCP tool schemas carried in the initial tool list before deferral starts.
///
/// One small server publishes fewer tools than this, so a single-server setup
/// sends exactly what it sent before. Past it the schemas are the largest thing
/// a turn carries, and `tool_search` loads them by name on demand.
pub const MCP_ALWAYS_LOADED_TOOL_BUDGET: usize = 16;

/// Manages multiple MCP server connections.
pub struct McpManager {
    connections: HashMap<String, McpConnection>,
    tools: Vec<McpTool>,
    prompts: Vec<McpPrompt>,
    remote_servers: HashSet<String>,
    /// The folder local servers start in and are sandboxed to: the one their
    /// configs were loaded and approved for.
    project_root: Option<std::path::PathBuf>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct McpConfigLoadOptions {
    pub explicit_paths: Vec<std::path::PathBuf>,
    pub strict: bool,
}

impl McpConfigLoadOptions {
    pub fn has_explicit_sources(&self) -> bool {
        self.strict || !self.explicit_paths.is_empty()
    }
}

impl std::fmt::Debug for McpManager {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("McpManager")
            .field("connections", &self.connections.keys().collect::<Vec<_>>())
            .field("tools_count", &self.tools.len())
            .finish()
    }
}

impl Default for McpManager {
    fn default() -> Self {
        Self::new()
    }
}

fn load_mcp_config_file_into(
    path: &std::path::Path,
    configs: &mut HashMap<String, McpServerConfig>,
    overwrite_existing: bool,
) {
    let _ = load_mcp_config_file_into_result(path, configs, overwrite_existing, false);
}

fn load_mcp_config_file_into_result(
    path: &std::path::Path,
    configs: &mut HashMap<String, McpServerConfig>,
    overwrite_existing: bool,
    required: bool,
) -> Result<()> {
    let contents = match std::fs::read_to_string(path) {
        Ok(contents) => contents,
        Err(err) if required => {
            return Err(err)
                .with_context(|| format!("Failed to read explicit MCP config {}", path.display()));
        }
        Err(_) => return Ok(()),
    };

    let loaded = parse_mcp_config_contents(&contents, path, required)?;
    if required && loaded.is_empty() {
        bail!(
            "Explicit MCP config {} did not define any servers",
            path.display()
        );
    }
    for (name, config) in loaded {
        if overwrite_existing {
            configs.insert(name, config);
        } else {
            configs.entry(name).or_insert(config);
        }
    }

    Ok(())
}

/// Normalize an MCP server entry written in the nested-transport shape.
///
/// `McpTransport` is internally tagged on a **string** `transport` field
/// (`"stdio" | "sse" | "http"`) with the transport's own fields alongside it.
/// Some entries on disk instead carry an *object* under `transport`, tagged on
/// `type`, next to a vestigial `command: ""`:
///
/// ```json
/// { "command": "", "args": [], "transport": { "type": "http", "url": "..." } }
/// ```
///
/// Because `McpServerConfig` is `#[serde(untagged)]`, that shape fails the
/// Tagged variant (no string `transport`) and falls through to Legacy, which
/// matches on `command`, so a working HTTP server was loaded as a stdio server
/// with an empty command. Every such entry then failed `agi doctor` with
/// "stdio command is empty", and would never have connected.
///
/// Rewrites the entry into the canonical shape. Anything unrecognised is
/// returned untouched so normal configs take no new code path.
fn normalize_nested_transport(value: &serde_json::Value) -> Option<serde_json::Value> {
    let object = value.as_object()?;
    let transport = object.get("transport")?.as_object()?;
    let kind = transport.get("type")?.as_str()?;

    let mut normalized = serde_json::Map::new();
    normalized.insert(
        "transport".to_string(),
        serde_json::Value::String(kind.to_string()),
    );
    for (key, entry) in transport {
        if key == "type" {
            continue;
        }
        // Nulls are absent-optional in the nested shape; carrying them over
        // would fail the typed fields they map onto.
        if entry.is_null() {
            continue;
        }
        normalized.insert(key.clone(), entry.clone());
    }

    Some(serde_json::Value::Object(normalized))
}

fn parse_mcp_config_contents(
    contents: &str,
    path: &std::path::Path,
    strict: bool,
) -> Result<HashMap<String, McpServerConfig>> {
    let mut configs = HashMap::new();

    let parsed = match serde_json::from_str::<serde_json::Value>(contents) {
        Ok(value) => value,
        Err(err) if strict => {
            return Err(err)
                .with_context(|| format!("Invalid MCP config JSON in {}", path.display()));
        }
        Err(_) => return Ok(configs),
    };

    let Some(root) = parsed.as_object() else {
        if strict {
            bail!(
                "Explicit MCP config {} must be a JSON object",
                path.display()
            );
        }
        return Ok(configs);
    };

    if let Some(servers_value) = root.get("mcpServers") {
        if strict && root.keys().any(|key| key != "mcpServers") {
            bail!(
                "Explicit MCP config {} mixes mcpServers with flat server entries",
                path.display()
            );
        }
        let Some(servers) = servers_value.as_object() else {
            if strict {
                bail!("mcpServers in {} must be an object", path.display());
            }
            return Ok(configs);
        };
        for (name, config) in servers {
            if let Err(error) = registry::ensure_no_rule_separator(name) {
                if strict {
                    return Err(error).with_context(|| {
                        format!("Invalid MCP server in explicit config {}", path.display())
                    });
                }
                eprintln!("MCP: skipped a server in {}: {error}", path.display());
                continue;
            }
            let config = normalize_nested_transport(config).unwrap_or_else(|| config.clone());
            match serde_json::from_value::<McpServerConfig>(config) {
                Ok(server_config) => {
                    configs.insert(name.clone(), server_config);
                }
                Err(err) if strict => {
                    return Err(err).with_context(|| {
                        format!(
                            "Invalid MCP server '{}' in explicit config {}",
                            name,
                            path.display()
                        )
                    });
                }
                Err(_) => {}
            }
        }
    } else {
        // Flat `{ "name": {...} }` map. Normalize each entry for the same
        // reason the mcpServers branch does.
        let normalized = match parsed {
            serde_json::Value::Object(entries) => serde_json::Value::Object(
                entries
                    .into_iter()
                    .map(|(name, entry)| {
                        let entry = normalize_nested_transport(&entry).unwrap_or(entry);
                        (name, entry)
                    })
                    .collect(),
            ),
            other => other,
        };
        match serde_json::from_value::<HashMap<String, McpServerConfig>>(normalized) {
            Ok(parsed_configs) => {
                for (name, config) in parsed_configs {
                    if let Err(error) = registry::ensure_no_rule_separator(&name) {
                        if strict {
                            return Err(error).with_context(|| {
                                format!("Invalid MCP server in explicit config {}", path.display())
                            });
                        }
                        eprintln!("MCP: skipped a server in {}: {error}", path.display());
                        continue;
                    }
                    configs.insert(name, config);
                }
            }
            Err(err) if strict => {
                return Err(err).with_context(|| {
                    format!(
                        "Explicit MCP config {} must be a flat server map or contain mcpServers",
                        path.display()
                    )
                });
            }
            Err(_) => {}
        }
    }

    Ok(configs)
}

fn load_default_mcp_configs(
    configs: &mut HashMap<String, McpServerConfig>,
    project: Option<&std::path::Path>,
) {
    // Project configs win over globals. Support both the historical `.mcp.json`
    // name and the visible `mcp.json` that `agi init` creates. A project server
    // starts only with the user's consent to its exact launch, which no
    // context without a terminal can give, so there it stays off. Only the
    // interactive startup review tells the user; every other load just logs.
    let project = project
        .map(std::path::Path::to_path_buf)
        .or_else(|| std::env::current_dir().ok());
    if let Some(project) = project {
        let mut project_servers = consent::project_servers(&project);
        let withheld = consent::retain_consented(&project, &mut project_servers);
        if !withheld.is_empty() {
            tracing::warn!(project = %project.display(), servers = ?withheld, "project MCP servers withheld until approved");
        }
        configs.extend(project_servers);
    }

    for (name, config) in user_servers() {
        configs.entry(name).or_insert(config);
    }
}

/// The servers the user's own `.mcp.json` and `mcp.json` in the CLI config
/// folder name. They run outside the sandbox unless an entry says
/// `"sandbox": true`: no sandboxed command can rewrite that folder.
fn user_servers() -> HashMap<String, McpServerConfig> {
    let mut servers = HashMap::new();
    if let Ok(config_dir) = crate::config::CliConfig::config_dir() {
        for filename in [".mcp.json", "mcp.json"] {
            load_mcp_config_file_into(&config_dir.join(filename), &mut servers, false);
        }
    }
    servers
        .into_iter()
        .map(|(name, config)| (name, config.with_scope_default(false)))
        .collect()
}

fn load_explicit_mcp_configs(
    configs: &mut HashMap<String, McpServerConfig>,
    explicit_paths: &[std::path::PathBuf],
) -> Result<()> {
    for path in explicit_paths {
        load_mcp_config_file_into_result(path, configs, true, true)?;
    }
    Ok(())
}

/// An untrusted workspace does not get servers started for it: `.mcp.json` is
/// repository-controlled, so auto-start would run a binary the user has not
/// vouched for. Returns the line to print when start is suppressed.
pub(crate) fn untrusted_autostart_notice(
    server_count: usize,
    autostart_allowed: bool,
) -> Option<String> {
    if server_count == 0 || autostart_allowed {
        return None;
    }
    Some(format!(
        "MCP: {server_count} server(s) not started; this workspace is not trusted. Run /trust grant to start them."
    ))
}

impl McpManager {
    pub fn new() -> Self {
        Self {
            connections: HashMap::new(),
            tools: Vec::new(),
            prompts: Vec::new(),
            remote_servers: HashSet::new(),
            project_root: None,
        }
    }

    /// Name the folder this manager's local servers start in. Whoever loaded
    /// the configs names the same folder here, so a server runs where its
    /// launch was approved; without one no local server starts.
    pub fn start_servers_in(&mut self, project: Option<std::path::PathBuf>) {
        self.project_root = project;
    }

    #[cfg(test)]
    pub(crate) fn with_discovered_stdio_tools_for_test(server_name: &str, count: usize) -> Self {
        let mut manager = Self::new();
        for index in 0..count {
            let tool_name = format!("tool_{index}");
            manager.tools.push(McpTool {
                namespaced_name: mcp_tool_name(server_name, &tool_name),
                original_name: tool_name,
                server_name: server_name.to_string(),
                description: format!("Test MCP tool {index}"),
                input_schema: serde_json::json!({"type": "object"}),
            });
        }
        manager
    }

    #[cfg(test)]
    pub(crate) fn with_discovered_stdio_tool_for_test(server_name: &str, tool_name: &str) -> Self {
        let mut manager = Self::new();
        manager.tools.push(McpTool {
            namespaced_name: mcp_tool_name(server_name, tool_name),
            original_name: tool_name.to_string(),
            server_name: server_name.to_string(),
            description: "Test MCP tool".to_string(),
            input_schema: serde_json::json!({"type": "object"}),
        });
        manager
    }

    /// Load MCP server configurations from project/global MCP JSON files.
    pub fn load_configs() -> Result<HashMap<String, McpServerConfig>> {
        #[cfg(test)]
        if let Some(configs) = TEST_CONFIGS.with(|cell| cell.borrow().clone()) {
            return Ok(configs);
        }
        Self::load_configs_with_options(&McpConfigLoadOptions::default())
    }

    /// Load MCP server configurations with explicit CLI file handling.
    ///
    /// Default project/global configs are optional and best-effort. Explicit
    /// `--mcp-config` files are required and validated so misspelled paths do
    /// not silently remove tools from a headless run. When `strict` is set,
    /// only explicit files are loaded.
    pub fn load_configs_with_options(
        options: &McpConfigLoadOptions,
    ) -> Result<HashMap<String, McpServerConfig>> {
        Self::load_configs_in(options, None)
    }

    /// [`Self::load_configs_with_options`] for the project at `project`, or
    /// with `None` the current directory. A host that serves a folder names
    /// it, so the servers it loads are that folder's whatever directory the
    /// process happens to be in.
    pub fn load_configs_in(
        options: &McpConfigLoadOptions,
        project: Option<&std::path::Path>,
    ) -> Result<HashMap<String, McpServerConfig>> {
        let mut configs = HashMap::new();

        if !options.strict {
            load_default_mcp_configs(&mut configs, project);
        }

        load_explicit_mcp_configs(&mut configs, &options.explicit_paths)?;

        Ok(configs)
    }

    /// Connect to all configured MCP servers and discover tools.
    pub async fn connect_all(
        &mut self,
        configs: &HashMap<String, McpServerConfig>,
        privacy_mode: crate::agent::PrivacyMode,
    ) -> Result<()> {
        self.connect_all_with_elicitation(configs, privacy_mode, Arc::new(AutoDeclineHandler))
            .await
    }

    /// Connect all configured servers with a caller-owned elicitation surface.
    pub async fn connect_all_with_elicitation(
        &mut self,
        configs: &HashMap<String, McpServerConfig>,
        privacy_mode: crate::agent::PrivacyMode,
        elicitation: Arc<dyn ElicitationHandler>,
    ) -> Result<()> {
        // Suppress raw stderr progress while the full-screen TUI owns the
        // terminal, otherwise these lines bleed into and corrupt the display.
        // In exec / non-TUI mode the flag is false and they render normally.
        let quiet = crate::tui::tui_active();
        if let Some(notice) =
            untrusted_autostart_notice(configs.len(), crate::trust::restrictions().mcp_autostart)
        {
            if !quiet {
                eprintln!("  {notice}");
            }
            return Ok(());
        }
        // Sorted, so a name a collision forced apart is the same name on the
        // next run: the model's allowlists and transcripts stay valid.
        let mut ordered: Vec<(&String, &McpServerConfig)> = configs.iter().collect();
        ordered.sort_by(|left, right| left.0.cmp(right.0));
        for (name, config) in ordered {
            let is_remote = !matches!(config.as_transport(), McpTransport::Stdio { .. });
            if is_remote {
                self.remote_servers.insert(name.clone());
            }
            if !mcp_transport_allowed(config, privacy_mode) {
                if !quiet {
                    eprintln!(
                        "  MCP server '{}': blocked in Local privacy mode; use an explicit BYOK or Managed continuation before connecting a remote MCP server",
                        name
                    );
                }
                continue;
            }
            match McpConnection::connect_with_elicitation(
                name,
                config,
                self.project_root.as_deref(),
                Arc::clone(&elicitation),
            )
            .await
            {
                Ok(mut conn) => match conn.list_tools().await {
                    Ok(tools) => {
                        let count = tools.len();
                        self.register_discovered_tools(tools);
                        match conn.list_prompts().await {
                            Ok(prompts) => {
                                if !prompts.is_empty() && !quiet {
                                    eprintln!(
                                        "  MCP server '{}': {} prompts discovered",
                                        name,
                                        prompts.len()
                                    );
                                }
                                self.prompts.extend(prompts);
                            }
                            Err(e) => {
                                if !quiet {
                                    eprintln!(
                                        "  MCP server '{}': prompts unavailable: {}",
                                        name, e
                                    );
                                }
                            }
                        }
                        if !quiet {
                            eprintln!(
                                "  MCP server '{}': {} tools discovered",
                                crate::terminal_text::sanitize_terminal_text(name),
                                count
                            );
                        }
                        self.connections.insert(name.clone(), conn);
                    }
                    Err(e) => {
                        if !quiet {
                            eprintln!(
                                "  MCP server '{}': failed to list tools: {}",
                                crate::terminal_text::sanitize_terminal_text(name),
                                crate::terminal_text::sanitize_terminal_text(&e.to_string())
                            );
                        }
                        let _ = conn.shutdown().await;
                    }
                },
                Err(e) => {
                    if !quiet {
                        let name = crate::terminal_text::sanitize_terminal_text(name);
                        if needs_sign_in(&e) {
                            eprintln!(
                                "  MCP server '{name}': needs sign-in, run `agi mcp login {name}`"
                            );
                        } else {
                            eprintln!(
                                "  MCP server '{}': failed to connect: {}",
                                name,
                                crate::terminal_text::sanitize_terminal_text(&format!("{e:#}"))
                            );
                        }
                    }
                }
            }
        }

        Ok(())
    }

    /// Get all discovered MCP tools.
    #[allow(dead_code)]
    pub fn tools(&self) -> &[McpTool] {
        &self.tools
    }

    pub fn prompts(&self) -> &[McpPrompt] {
        &self.prompts
    }

    pub fn connection_mut(&mut self, server_name: &str) -> Option<&mut McpConnection> {
        self.connections.get_mut(server_name)
    }

    fn server_allowed(&self, server_name: &str, privacy_mode: crate::agent::PrivacyMode) -> bool {
        privacy_mode != crate::agent::PrivacyMode::Local
            || !self.remote_servers.contains(server_name)
    }

    /// Drop every already-connected remote server when a session enters Local
    /// mode. This is intentionally synchronous: dropping the client closes the
    /// transport immediately, while a graceful network shutdown would itself
    /// violate the newly selected no-egress boundary.
    pub fn enforce_privacy_mode(&mut self, privacy_mode: crate::agent::PrivacyMode) {
        if privacy_mode != crate::agent::PrivacyMode::Local {
            return;
        }
        let remote_servers = &self.remote_servers;
        self.connections
            .retain(|server_name, _| !remote_servers.contains(server_name));
        self.tools
            .retain(|tool| !remote_servers.contains(&tool.server_name));
        self.prompts
            .retain(|prompt| !remote_servers.contains(&prompt.server_name));
    }

    /// Register discovered tools under names no other connected server has
    /// already taken. Two servers can publish names that sanitize to the same
    /// string, and a duplicate would make the reverse lookup in
    /// [`Self::tool_identity`] resolve every call to whichever tool was
    /// discovered first.
    fn register_discovered_tools(&mut self, discovered: Vec<McpTool>) {
        for mut tool in discovered {
            let base = tool.namespaced_name.clone();
            let mut suffix = 2usize;
            while self
                .tools
                .iter()
                .any(|existing| existing.namespaced_name == tool.namespaced_name)
            {
                tool.namespaced_name = format!("{base}_{suffix}");
                suffix += 1;
            }
            self.tools.push(tool);
        }
    }

    /// Convert MCP tools to ToolDefinitions for the LLM.
    ///
    /// Concurrency flags default to false (safe, sequential) for MCP tools.
    /// the MCP protocol exposes `annotations.readOnlyHint` and similar but we
    /// don't plumb those through yet.
    ///
    /// Tools past [`MCP_ALWAYS_LOADED_TOOL_BUDGET`] are marked deferred: their
    /// schemas leave the initial list and `tool_search` hands them over on
    /// demand, exactly as for the CLI's own niche built-ins. Deferral never
    /// touches executability, `tool_identity` resolves against the full
    /// registered set, so a deferred tool the model calls still runs.
    pub fn tool_definitions(
        &self,
        privacy_mode: crate::agent::PrivacyMode,
    ) -> Vec<crate::models::ToolDefinition> {
        self.tools
            .iter()
            .filter(|tool| self.server_allowed(&tool.server_name, privacy_mode))
            .enumerate()
            .map(|(position, t)| crate::models::ToolDefinition {
                name: t.namespaced_name.clone(),
                description: format!("[MCP:{}] {}", t.server_name, t.description),
                input_schema: t.input_schema.clone(),
                is_read_only: false,
                is_concurrency_safe: false,
                max_result_size_chars: None,
                should_defer: position >= MCP_ALWAYS_LOADED_TOOL_BUDGET,
                aliases: Vec::new(),
                owner: format!("mcp:{}", t.server_name),
                permission_class: "external".to_string(),
                diagnostic_tags: vec!["mcp".to_string(), t.server_name.clone()],
                stable_id: crate::runtime::tool_catalog::mcp_tool_stable_id(
                    &t.server_name,
                    &t.original_name,
                ),
                contract_version: agiworkforce_protocol::tool_primitive::TOOL_CONTRACT_VERSION,
                capability: crate::runtime::tool_catalog::capability_label(
                    agiworkforce_protocol::agent_events::AgentEventToolCategory::Mcp,
                ),
                timeout_ms: Some(McpTimeouts::default().call_tool.as_millis() as u64),
                result_schema: Some(
                    agiworkforce_protocol::tool_primitive::tool_result_json_schema(),
                ),
                error_schema: Some(agiworkforce_protocol::tool_primitive::tool_error_json_schema()),
            })
            .collect()
    }

    /// Execute a namespaced MCP tool call.
    pub fn tool_identity(
        &self,
        namespaced_name: &str,
        privacy_mode: crate::agent::PrivacyMode,
    ) -> Result<(String, String)> {
        let tool = self
            .tools
            .iter()
            .find(|tool| tool.namespaced_name == namespaced_name)
            .context(format!("MCP tool '{}' not found", namespaced_name))?;
        if !self.server_allowed(&tool.server_name, privacy_mode) {
            bail!(
                "MCP tool '{}' is remote and unavailable in Local privacy mode; create an explicit BYOK or Managed continuation before sending context to server '{}'",
                namespaced_name,
                tool.server_name
            );
        }
        Ok((tool.server_name.clone(), tool.original_name.clone()))
    }

    /// Every resource the connected servers allowed in `privacy_mode` list,
    /// paired with the server that owns it.
    pub fn has_server(&self, server_name: &str) -> bool {
        self.connections.contains_key(server_name)
    }

    pub async fn list_resources(
        &mut self,
        privacy_mode: crate::agent::PrivacyMode,
    ) -> Result<Vec<(String, agiworkforce_mcp::McpResource)>> {
        let mut listed = Vec::new();
        let names: Vec<String> = self
            .connections
            .keys()
            .filter(|name| self.server_allowed(name, privacy_mode))
            .cloned()
            .collect();
        for name in names {
            let Some(conn) = self
                .connections
                .get_mut(&name)
                .filter(|conn| conn.serves_resources())
            else {
                continue;
            };
            let resources = conn
                .list_resources()
                .await
                .with_context(|| format!("[{name}] could not list MCP resources"))?;
            listed.extend(
                resources
                    .into_iter()
                    .map(|resource| (name.clone(), resource)),
            );
        }
        Ok(listed)
    }

    pub async fn read_resource(
        &mut self,
        server_name: &str,
        uri: &str,
        privacy_mode: crate::agent::PrivacyMode,
    ) -> Result<Vec<agiworkforce_mcp::McpResourceContents>> {
        if !self.server_allowed(server_name, privacy_mode) {
            bail!(
                "MCP server '{server_name}' is remote and unavailable in Local privacy mode; create an explicit BYOK or Managed continuation before reading its resources"
            );
        }
        self.connections
            .get_mut(server_name)
            .context(format!("[{server_name}] MCP server not connected"))?
            .read_resource(uri)
            .await
    }

    /// Execute a namespaced MCP tool call.
    pub async fn execute_tool(
        &mut self,
        namespaced_name: &str,
        arguments: serde_json::Value,
        privacy_mode: crate::agent::PrivacyMode,
    ) -> Result<String> {
        self.tool_identity(namespaced_name, privacy_mode)?;
        let tool = self
            .tools
            .iter()
            .find(|t| t.namespaced_name == namespaced_name)
            .context(format!("MCP tool '{}' not found", namespaced_name))?
            .clone();

        let conn = self
            .connections
            .get_mut(&tool.server_name)
            .context(format!("[{}] MCP server not connected", tool.server_name))?;

        let result = conn
            .call_tool(&tool.original_name, arguments)
            .await
            .map_err(|error| {
                if needs_sign_in(&error) {
                    let scope = remember_step_up(&error);
                    let _ = SIGN_IN_REQUIRED.try_with(|required| {
                        required.borrow_mut().push(McpSignInRequired {
                            tool: namespaced_name.to_string(),
                            server: tool.server_name.clone(),
                            scope: scope.clone(),
                        })
                    });
                    match scope {
                        Some(scope) => anyhow::anyhow!(
                            "{error:#}. MCP server '{0}' needs the additional permission '{scope}'. Run `agi mcp login {0}` to grant it.",
                            tool.server_name
                        ),
                        None => anyhow::anyhow!(
                            "{error:#}. Run `agi mcp login {}` to sign in again.",
                            tool.server_name
                        ),
                    }
                } else {
                    error
                }
            });
        self.refresh_changed_servers().await;
        result
    }

    pub(crate) async fn refresh_changed_servers(&mut self) {
        let mut refreshed_tools = Vec::new();
        let mut refreshed_prompts = Vec::new();
        for (name, conn) in self.connections.iter_mut() {
            let changes = conn.take_list_changes();
            if changes.tools {
                if let Ok(tools) = conn.list_tools().await {
                    refreshed_tools.push((name.clone(), tools));
                }
            }
            if changes.prompts {
                if let Ok(prompts) = conn.list_prompts().await {
                    refreshed_prompts.push((name.clone(), prompts));
                }
            }
        }
        for (name, tools) in refreshed_tools {
            self.tools.retain(|tool| tool.server_name != name);
            self.register_discovered_tools(tools);
        }
        for (name, prompts) in refreshed_prompts {
            self.prompts.retain(|prompt| prompt.server_name != name);
            self.prompts.extend(prompts);
        }
    }

    pub async fn expand_prompt_invocation(
        &mut self,
        input: &str,
        privacy_mode: crate::agent::PrivacyMode,
    ) -> Result<Option<String>> {
        let Some((command_name, arg_text)) = parse_mcp_prompt_invocation(input) else {
            return Ok(None);
        };
        let prompt = match self
            .prompts
            .iter()
            .find(|prompt| prompt.command_name.eq_ignore_ascii_case(command_name))
        {
            Some(prompt) => prompt.clone(),
            None => return Ok(None),
        };
        if !self.server_allowed(&prompt.server_name, privacy_mode) {
            bail!(
                "MCP prompt '{}' is remote and unavailable in Local privacy mode; create an explicit BYOK or Managed continuation before sending context to server '{}'",
                command_name,
                prompt.server_name
            );
        }
        let args = mcp_prompt_arguments_from_text(&prompt, arg_text)?;
        let conn = self
            .connections
            .get_mut(&prompt.server_name)
            .context(format!("[{}] MCP server not connected", prompt.server_name))?;
        conn.get_prompt(&prompt.original_name, args).await.map(Some)
    }

    /// Shut down all MCP server connections.
    pub async fn shutdown_all(&mut self) {
        for (name, mut conn) in self.connections.drain() {
            if let Err(e) = conn.shutdown().await {
                eprintln!(
                    "Warning: failed to shut down MCP server '{}': {}",
                    crate::terminal_text::sanitize_terminal_text(&name),
                    crate::terminal_text::sanitize_terminal_text(&e.to_string())
                );
            }
        }
    }
}

fn parse_prompts_response(
    server_name: &str,
    response: Option<&serde_json::Value>,
) -> Vec<McpPrompt> {
    let prompts_json = response
        .and_then(|r| r.get("prompts"))
        .and_then(|p| p.as_array())
        .cloned()
        .unwrap_or_default();

    prompts_json
        .into_iter()
        .filter_map(|prompt| {
            let name = prompt.get("name").and_then(|n| n.as_str())?;
            let description = prompt
                .get("description")
                .and_then(|d| d.as_str())
                .unwrap_or("MCP prompt");
            let arguments = prompt
                .get("arguments")
                .and_then(|args| args.as_array())
                .map(|args| {
                    args.iter()
                        .filter_map(|arg| {
                            let name = arg.get("name").and_then(|n| n.as_str())?;
                            Some(McpPromptArgument {
                                name: name.to_string(),
                                description: arg
                                    .get("description")
                                    .and_then(|d| d.as_str())
                                    .unwrap_or_default()
                                    .to_string(),
                                required: arg
                                    .get("required")
                                    .and_then(|required| required.as_bool())
                                    .unwrap_or(false),
                            })
                        })
                        .collect()
                })
                .unwrap_or_default();

            Some(McpPrompt {
                command_name: format!(
                    "mcp:{}:{}",
                    normalize_mcp_prompt_part(server_name),
                    normalize_mcp_prompt_part(name)
                ),
                original_name: name.to_string(),
                server_name: server_name.to_string(),
                description: description.to_string(),
                arguments,
            })
        })
        .collect()
}

fn parse_mcp_prompt_invocation(input: &str) -> Option<(&str, &str)> {
    let trimmed = input.trim();
    let without_slash = trimmed.strip_prefix('/')?;
    let (command, args) = without_slash
        .split_once(char::is_whitespace)
        .unwrap_or((without_slash, ""));
    command
        .starts_with("mcp:")
        .then_some((command, args.trim()))
}

fn mcp_prompt_arguments_from_text(
    _prompt: &McpPrompt,
    arg_text: &str,
) -> Result<serde_json::Map<String, serde_json::Value>> {
    let trimmed = arg_text.trim();
    if trimmed.is_empty() {
        return Ok(serde_json::Map::new());
    }

    let value: serde_json::Value =
        serde_json::from_str(trimmed).context("MCP prompt arguments must be a JSON object")?;
    let object = value
        .as_object()
        .cloned()
        .context("MCP prompt arguments must be a JSON object")?;
    Ok(object)
}

fn extract_prompt_text(response: Option<&serde_json::Value>) -> Result<String> {
    let Some(response) = response else {
        return Ok(String::new());
    };
    let Some(messages) = response.get("messages").and_then(|m| m.as_array()) else {
        return Ok(response
            .get("description")
            .and_then(|d| d.as_str())
            .unwrap_or_default()
            .to_string());
    };

    let mut parts = Vec::new();
    for message in messages {
        if let Some(text) = prompt_content_text(message.get("content")) {
            if !text.trim().is_empty() {
                parts.push(text);
            }
        }
    }
    Ok(parts.join("\n\n"))
}

fn prompt_content_text(content: Option<&serde_json::Value>) -> Option<String> {
    let content = content?;
    if let Some(text) = content.get("text").and_then(|t| t.as_str()) {
        return Some(text.to_string());
    }
    if let Some(text) = content.as_str() {
        return Some(text.to_string());
    }
    if let Some(items) = content.as_array() {
        let parts: Vec<String> = items
            .iter()
            .filter_map(|item| item.get("text").and_then(|t| t.as_str()))
            .map(str::to_string)
            .collect();
        if !parts.is_empty() {
            return Some(parts.join("\n"));
        }
    }
    None
}

fn normalize_mcp_prompt_part(value: &str) -> String {
    let mut out = String::new();
    let mut last_dash = false;
    for ch in value.trim().chars() {
        if ch.is_ascii_alphanumeric() || ch == '.' {
            out.push(ch.to_ascii_lowercase());
            last_dash = false;
        } else if matches!(ch, '-' | '_' | ' ' | '/' | ':') && !last_dash && !out.is_empty() {
            out.push('-');
            last_dash = true;
        }
    }
    while out.ends_with('-') {
        out.pop();
    }
    if out.is_empty() {
        "prompt".to_string()
    } else {
        out
    }
}

// ---------------------------------------------------------------------------
// Tests (config loading + result shaping, the CLI-app-local behavior)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    #[test]
    fn logout_revocation_needs_no_parsable_registry_entry() {
        let fallback = super::revocation_oauth_config(None);
        assert!(fallback.client_id.is_none() && fallback.token_url.is_none());
        let config: super::McpServerConfig = serde_json::from_value(serde_json::json!({
            "transport": "http",
            "url": "https://mcp.example.com/mcp",
            "auth": { "client_id": "cli-client" }
        }))
        .expect("http config");
        assert_eq!(
            super::revocation_oauth_config(Some(&config))
                .client_id
                .as_deref(),
            Some("cli-client")
        );
    }

    use super::*;

    #[test]
    fn an_untrusted_workspace_starts_no_configured_mcp_server() {
        assert!(untrusted_autostart_notice(0, false).is_none());
        assert!(untrusted_autostart_notice(3, true).is_none());
        let notice = untrusted_autostart_notice(3, false).expect("suppressed");
        assert!(notice.contains("3 server(s) not started"));
        assert!(notice.contains("/trust grant"));
    }

    struct AcceptingElicitationHandler {
        called: Arc<std::sync::atomic::AtomicBool>,
    }

    impl ElicitationHandler for AcceptingElicitationHandler {
        fn handle<'a>(
            &'a self,
            _server_name: &'a str,
            _request: ElicitationRequest,
        ) -> Pin<Box<dyn Future<Output = ElicitationResponse> + Send + 'a>> {
            self.called.store(true, std::sync::atomic::Ordering::SeqCst);
            Box::pin(async { ElicitationResponse::accept_without_content() })
        }
    }

    #[test]
    fn only_a_server_a_project_declares_is_checked_again_before_it_restarts() {
        let project = tempfile::tempdir().unwrap();
        let mine = McpServerConfig::stdio("node", vec!["server.js".to_string()], HashMap::new());
        assert!(
            respawn_check("mine", &mine, Some(project.path())).is_none(),
            "the user's own server has no approval to check"
        );
        let remote = McpServerConfig::http("https://mcp.example.invalid/rpc", HashMap::new());
        assert!(respawn_check("remote", &remote, Some(project.path())).is_none());

        let theirs = mine.with_origin(McpServerOrigin::Project);
        let still_allowed = respawn_check("theirs", &theirs, Some(project.path()))
            .expect("a project server is checked");
        let refused = still_allowed().expect_err("a launch nobody approved was restarted");
        assert!(
            refused.contains("no longer the one you approved"),
            "{refused}"
        );
    }

    #[tokio::test]
    async fn client_hooks_use_the_injected_interactive_elicitation_handler() {
        let called = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let hooks = build_client_hooks(Arc::new(AcceptingElicitationHandler {
            called: Arc::clone(&called),
        }));

        let response = hooks
            .elicitation
            .handle(
                "interactive-server",
                ElicitationRequest {
                    message: "Choose a repository".to_string(),
                    requested_schema: serde_json::json!({"type": "object"}),
                    mode: agiworkforce_mcp::ElicitationMode::Form,
                    url: None,
                    elicitation_id: Some("request-1".to_string()),
                },
            )
            .await;

        assert!(called.load(std::sync::atomic::Ordering::SeqCst));
        assert_eq!(response.action, agiworkforce_mcp::ElicitationAction::Accept);
    }

    #[test]
    fn local_privacy_allows_stdio_mcp_but_rejects_remote_transports() {
        let stdio = McpServerConfig::stdio("node", vec!["server.js".to_string()], HashMap::new());
        let sse = McpServerConfig::sse("https://mcp.example/sse", HashMap::new());
        let http = McpServerConfig::http("https://mcp.example/rpc", HashMap::new());

        assert!(mcp_transport_allowed(
            &stdio,
            crate::agent::PrivacyMode::Local
        ));
        assert!(!mcp_transport_allowed(
            &sse,
            crate::agent::PrivacyMode::Local
        ));
        assert!(!mcp_transport_allowed(
            &http,
            crate::agent::PrivacyMode::Local
        ));
        assert!(mcp_transport_allowed(&sse, crate::agent::PrivacyMode::Byok));
        assert!(mcp_transport_allowed(
            &http,
            crate::agent::PrivacyMode::Managed
        ));
    }

    #[test]
    fn test_mcp_tool_namespacing() {
        assert_eq!(
            mcp_tool_name("myserver", "read_file"),
            "mcp__myserver__read_file"
        );
        // Free-form MCP names: everything outside `[A-Za-z0-9_-]` becomes `_`,
        // and the hyphen a provider does accept is kept.
        assert_eq!(
            mcp_tool_name("brave-search", "search.web"),
            "mcp__brave-search__search_web"
        );
        assert_eq!(
            mcp_tool_name("io.github/acme", "files:read"),
            "mcp__io_github_acme__files_read"
        );
    }

    #[cfg(target_os = "macos")]
    fn seatbelt_wrapped(
        network: crate::sandbox::NetworkPolicy,
        transport: TransportConfig,
    ) -> TransportConfig {
        sandbox_stdio_transport(
            crate::sandbox::SandboxType::MacosSeatbelt,
            &std::env::temp_dir().canonicalize().unwrap(),
            &std::env::temp_dir().canonicalize().unwrap(),
            network,
            transport,
            false,
        )
        .unwrap()
        .transport
    }

    #[cfg(target_os = "macos")]
    fn seatbelt_wrapped_in(
        workspace: &std::path::Path,
        network: crate::sandbox::NetworkPolicy,
        transport: TransportConfig,
    ) -> TransportConfig {
        sandbox_stdio_transport(
            crate::sandbox::SandboxType::MacosSeatbelt,
            workspace,
            workspace,
            network,
            transport,
            false,
        )
        .unwrap()
        .transport
    }

    #[cfg(target_os = "macos")]
    fn seatbelt_profile_of(transport: TransportConfig) -> String {
        let TransportConfig::Stdio { args, .. } = transport else {
            panic!("stdio stays stdio");
        };
        args[args.iter().position(|arg| arg == "-p").unwrap() + 1].clone()
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn a_sandboxed_stdio_server_launches_through_the_backend_and_keeps_its_env() {
        let env = HashMap::from([("TOKEN".to_string(), "server-scoped".to_string())]);
        let wrapped = seatbelt_wrapped(
            crate::sandbox::NetworkPolicy::AllowExternal,
            TransportConfig::Stdio {
                command: "uvx".to_string(),
                args: vec!["mcp-server-git".to_string()],
                env: env.clone(),
                cwd: None,
            },
        );
        let TransportConfig::Stdio {
            command,
            args,
            env: wrapped_env,
            ..
        } = wrapped
        else {
            panic!("stdio stays stdio");
        };
        assert_eq!(
            Some(std::path::PathBuf::from(&command)),
            agiworkforce_sandbox_policy::sandbox_launcher(
                agiworkforce_sandbox_policy::SandboxBackend::MacosSeatbelt
            )
        );
        assert_eq!(&args[args.len() - 2..], &["uvx", "mcp-server-git"]);
        assert_eq!(wrapped_env, env);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn a_sandboxed_stdio_server_reads_anywhere_and_writes_only_its_workspace() {
        let profile = seatbelt_profile_of(seatbelt_wrapped(
            crate::sandbox::NetworkPolicy::AllowExternal,
            to_transport_config(&McpServerConfig::stdio(
                "node",
                vec!["./server.js".to_string()],
                HashMap::new(),
            )),
        ));
        assert!(profile.contains("(allow file-read*)"), "{profile}");
        let workspace = std::env::temp_dir().canonicalize().unwrap();
        assert!(
            profile.contains(&format!(
                "(allow file-write* (subpath \"{}\"))",
                workspace.display()
            )),
            "{profile}"
        );
        if let Some(home) = dirs::home_dir() {
            assert!(
                !profile.contains(&format!(
                    "(allow file-write* (subpath \"{}\"))",
                    home.display()
                )),
                "{profile}"
            );
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn a_sandboxed_stdio_server_reaches_the_internet_but_no_local_socket() {
        let profile = seatbelt_profile_of(seatbelt_wrapped(
            mcp_server_network(&McpServerConfig::stdio("uvx", Vec::new(), HashMap::new())),
            TransportConfig::Stdio {
                command: "uvx".to_string(),
                args: vec!["mcp-server-fetch".to_string()],
                env: HashMap::new(),
                cwd: None,
            },
        ));
        assert!(profile.contains("(allow network-outbound)"), "{profile}");
        assert!(
            profile.contains("(deny network-outbound (subpath \"/\"))"),
            "{profile}"
        );
        assert!(
            profile.contains("(deny network-outbound (remote ip \"localhost:*\"))"),
            "{profile}"
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn only_a_server_whose_entry_opts_in_reaches_services_on_this_computer() {
        let plain: McpServerConfig =
            serde_json::from_str(r#"{"command": "npx", "args": ["-y", "postgres-mcp"]}"#).unwrap();
        assert_eq!(
            mcp_server_network(&plain),
            crate::sandbox::NetworkPolicy::AllowExternal
        );
        for opted_in in [
            r#"{"command": "npx", "allowLocalNetwork": true}"#,
            r#"{"transport": "stdio", "command": "ollama-mcp", "allowLocalNetwork": true}"#,
        ] {
            let config: McpServerConfig = serde_json::from_str(opted_in).unwrap();
            assert_eq!(
                mcp_server_network(&config),
                crate::sandbox::NetworkPolicy::Allow,
                "{opted_in}"
            );
            assert!(serde_json::to_string(&config)
                .unwrap()
                .contains("\"allowLocalNetwork\":true"));
        }
        assert!(
            !serde_json::to_string(&plain)
                .unwrap()
                .contains("allowLocalNetwork"),
            "an entry that never opted in is written back as it was"
        );

        let profile = seatbelt_profile_of(seatbelt_wrapped(
            crate::sandbox::NetworkPolicy::Allow,
            to_transport_config(&plain),
        ));
        assert!(
            !profile.contains("(deny network-outbound (remote ip \"localhost:*\"))"),
            "{profile}"
        );
    }

    #[test]
    fn a_stdio_server_is_sandboxed_unless_its_entry_or_the_user_opts_out() {
        use crate::sandbox::{SandboxDefault, SandboxSettings};
        let plain: McpServerConfig =
            serde_json::from_str(r#"{"command": "node", "args": ["./server.js"]}"#).unwrap();
        let opted_out: McpServerConfig = serde_json::from_str(
            r#"{"transport": "stdio", "command": "node", "args": ["./server.js"], "sandbox": false}"#,
        )
        .unwrap();
        let default = SandboxSettings::default();
        let env_off = SandboxSettings {
            mcp_servers: SandboxDefault::Off,
            ..default
        };
        let required = SandboxSettings {
            mcp_servers: SandboxDefault::Required,
            ..default
        };
        assert!(mcp_server_sandboxed(&plain, default, false));
        assert!(!mcp_server_sandboxed(&opted_out, default, false));
        assert!(!mcp_server_sandboxed(&plain, env_off, false));
        assert!(mcp_server_sandboxed(&opted_out, required, false));
        assert!(!mcp_server_sandboxed(&plain, default, true));
        assert!(!mcp_server_sandboxed(
            &McpServerConfig::http("https://mcp.example.invalid/rpc", HashMap::new()),
            required,
            false
        ));

        assert!(!serde_json::to_string(&plain).unwrap().contains("sandbox"));
        assert!(serde_json::to_string(&opted_out)
            .unwrap()
            .contains("\"sandbox\":false"));
    }

    #[test]
    fn a_user_scoped_server_runs_outside_the_sandbox_unless_it_opts_in() {
        use crate::sandbox::{SandboxDefault, SandboxSettings};
        let user: McpServerConfig =
            serde_json::from_str(r#"{"command": "node", "args": ["server.js"]}"#).unwrap();
        let user = user.with_scope_default(false);
        let opted_in: McpServerConfig = serde_json::from_str(
            r#"{"transport": "stdio", "command": "node", "args": ["server.js"], "sandbox": true}"#,
        )
        .unwrap();
        let opted_in = opted_in.with_scope_default(false);
        let default = SandboxSettings::default();
        let required = SandboxSettings {
            mcp_servers: SandboxDefault::Required,
            ..default
        };
        assert!(!mcp_server_sandboxed(&user, default, false));
        assert!(mcp_server_sandboxed(&opted_in, default, false));
        assert!(mcp_server_sandboxed(&user, required, false));

        let project = McpServerConfig::stdio("node", vec!["server.js".to_string()], HashMap::new());
        assert!(
            mcp_server_sandboxed(&project, default, false),
            "a project server with no setting stays sandboxed"
        );
        assert!(mcp_server_sandboxed(
            &project.with_scope_default(true),
            default,
            false
        ));
    }

    #[test]
    fn a_sandboxed_start_failure_names_the_sandbox_and_every_opt_out() {
        let hint = sandboxed_start_hint();
        assert!(hint.contains("OS sandbox"), "{hint}");
        assert!(hint.contains("\"sandbox\": false"), "{hint}");
        assert!(hint.contains("\"allowLocalNetwork\": true"), "{hint}");
        assert!(hint.contains("AGIWORKFORCE_SANDBOX_MCP=0"), "{hint}");
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn a_filesystem_servers_chosen_roots_are_writable_in_its_sandbox() {
        let workspace = tempfile::tempdir().unwrap();
        let workspace = workspace.path().canonicalize().unwrap();
        let root = tempfile::tempdir().unwrap();
        let root = root.path().canonicalize().unwrap();
        let elsewhere = tempfile::tempdir().unwrap();
        let elsewhere = elsewhere.path().canonicalize().unwrap();
        let writes = |profile: &str, dir: &std::path::Path| {
            profile.contains(&format!(
                "(allow file-write* (subpath \"{}\"))",
                dir.display()
            ))
        };
        let profile = seatbelt_profile_of(seatbelt_wrapped_in(
            &workspace,
            crate::sandbox::NetworkPolicy::AllowExternal,
            TransportConfig::Stdio {
                command: "npx".to_string(),
                args: vec![
                    "-y".to_string(),
                    "@modelcontextprotocol/server-filesystem".to_string(),
                    root.to_string_lossy().into_owned(),
                ],
                env: HashMap::new(),
                cwd: None,
            },
        ));
        assert!(writes(&profile, &root), "{profile}");

        let profile = seatbelt_profile_of(seatbelt_wrapped_in(
            &workspace,
            crate::sandbox::NetworkPolicy::AllowExternal,
            TransportConfig::Stdio {
                command: "npx".to_string(),
                args: vec![
                    "-y".to_string(),
                    "some-other-server".to_string(),
                    elsewhere.to_string_lossy().into_owned(),
                ],
                env: HashMap::new(),
                cwd: None,
            },
        ));
        assert!(!writes(&profile, &elsewhere), "{profile}");
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn a_sandboxed_server_starts_in_its_project_not_where_the_cli_runs() {
        let workspace = tempfile::tempdir().unwrap();
        let workspace = workspace.path().canonicalize().unwrap();
        let project = tempfile::tempdir().unwrap();
        let sandboxed = sandbox_stdio_transport(
            crate::sandbox::SandboxType::MacosSeatbelt,
            &workspace,
            project.path(),
            crate::sandbox::NetworkPolicy::AllowExternal,
            TransportConfig::Stdio {
                command: "/usr/bin/node".to_string(),
                args: vec!["./server.js".to_string()],
                env: HashMap::new(),
                cwd: None,
            },
            true,
        )
        .unwrap();
        let TransportConfig::Stdio { args, cwd, .. } = sandboxed.transport else {
            panic!("stdio stays stdio");
        };
        assert_eq!(
            cwd.as_deref(),
            Some(project.path()),
            "the spawn names the project, so the sandbox wrapper and the server start there"
        );
        assert_eq!(&args[args.len() - 2..], &["/usr/bin/node", "./server.js"]);
        assert_ne!(project.path(), std::env::current_dir().unwrap());
    }

    #[cfg(unix)]
    #[test]
    fn a_local_server_with_no_project_to_start_in_is_refused_and_a_remote_one_is_not() {
        let local = McpServerConfig::stdio("sh", Vec::new(), HashMap::new());
        let error = sandboxed_transport_config(&local, None)
            .err()
            .expect("a local server needs a folder")
            .to_string();
        assert!(error.contains("none was given"), "{error}");

        let remote = McpServerConfig::http("https://mcp.example.invalid/rpc", HashMap::new());
        assert!(sandboxed_transport_config(&remote, None).is_ok());
    }

    #[cfg(unix)]
    #[test]
    fn a_bare_command_is_resolved_on_the_host_path_before_any_launch() {
        let resolved = on_host_path(TransportConfig::Stdio {
            command: "sh".to_string(),
            args: Vec::new(),
            env: HashMap::new(),
            cwd: None,
        })
        .unwrap();
        let TransportConfig::Stdio { command, env, .. } = resolved else {
            panic!("stdio stays stdio");
        };
        assert!(std::path::Path::new(&command).is_absolute(), "{command}");
        assert_eq!(resolved_program("sh").as_deref(), Some(command.as_str()));
        assert_eq!(resolved_program(&command), None, "a path names itself");
        assert_eq!(
            env.get("PATH").map(String::as_str),
            Some(
                agiworkforce_sandbox_policy::host_path::host_path()
                    .to_string_lossy()
                    .as_ref()
            )
        );
    }

    #[test]
    fn a_project_no_sandbox_may_write_gets_a_private_workspace_and_a_safe_one_is_its_own() {
        let project = tempfile::tempdir().unwrap();
        let (workspace, held) = server_workspace(project.path()).unwrap();
        assert_eq!(workspace, project.path().canonicalize().unwrap());
        assert!(held.is_none());

        if let Some(home) = dirs::home_dir() {
            let (workspace, held) = server_workspace(&home).unwrap();
            assert_ne!(workspace, home.canonicalize().unwrap());
            assert!(held.is_some_and(|held| held.path().is_dir()));
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn a_sandboxed_servers_scratch_directory_goes_when_its_transport_does() {
        let sandboxed = sandbox_stdio_transport(
            crate::sandbox::SandboxType::MacosSeatbelt,
            &std::env::temp_dir().canonicalize().unwrap(),
            &std::env::temp_dir().canonicalize().unwrap(),
            crate::sandbox::NetworkPolicy::AllowExternal,
            TransportConfig::Stdio {
                command: "uvx".to_string(),
                args: vec!["mcp-server-git".to_string()],
                env: HashMap::new(),
                cwd: None,
            },
            false,
        )
        .unwrap();
        assert!(sandboxed.sandboxed);
        let scratch = sandboxed
            .scratch
            .as_ref()
            .expect("seatbelt gives the server a scratch directory")
            .path()
            .to_path_buf();
        assert!(scratch.is_dir());
        drop(sandboxed);
        assert!(
            !scratch.exists(),
            "the scratch directory outlived the server"
        );
    }

    #[cfg(unix)]
    #[test]
    fn an_unsandboxed_server_starts_in_the_config_folder_on_the_host_path() {
        let started = outside_writable_roots(
            to_transport_config(&McpServerConfig::stdio(
                "sh",
                vec!["./server.js".to_string()],
                HashMap::new(),
            )),
            None,
        )
        .unwrap();
        let config_dir = crate::config::CliConfig::config_dir().unwrap();
        assert_eq!(started.started_in.as_deref(), Some(config_dir.as_path()));
        let TransportConfig::Stdio {
            command,
            args,
            env,
            cwd,
        } = started.transport
        else {
            panic!("stdio stays stdio");
        };
        assert_eq!(cwd.as_deref(), Some(config_dir.as_path()));
        assert!(
            std::path::Path::new(&command).is_absolute() && command.ends_with("/sh"),
            "the bare command is resolved on the host PATH: {command}"
        );
        assert_eq!(args, ["./server.js"]);
        assert_eq!(
            env.get("PATH").map(String::as_str),
            Some(
                agiworkforce_sandbox_policy::host_path::host_path()
                    .to_string_lossy()
                    .as_ref()
            )
        );
    }

    #[cfg(unix)]
    #[test]
    fn an_unsandboxed_project_server_starts_in_the_project_with_the_host_path() {
        let project = tempfile::tempdir().unwrap();
        let started = outside_writable_roots(
            to_transport_config(&McpServerConfig::stdio(
                "sh",
                vec!["./server.js".to_string()],
                HashMap::new(),
            )),
            Some(project.path()),
        )
        .unwrap();
        assert_eq!(started.started_in, None);
        let TransportConfig::Stdio { env, cwd, .. } = started.transport else {
            panic!("stdio stays stdio");
        };
        assert_eq!(
            cwd.as_deref(),
            Some(project.path()),
            "a project server starts in the project it was approved for, wherever the CLI runs"
        );
        assert_eq!(
            env.get("PATH").map(String::as_str),
            Some(
                agiworkforce_sandbox_policy::host_path::host_path()
                    .to_string_lossy()
                    .as_ref()
            )
        );
    }

    #[test]
    fn only_a_project_server_or_an_opted_in_entry_starts_in_the_project() {
        let entry = |json: &str| serde_json::from_str::<McpServerConfig>(json).unwrap();
        let plain = r#"{"command": "node", "args": ["server.js"], "sandbox": false}"#;
        assert!(!starts_in_project(&entry(plain)).unwrap());
        assert!(!starts_in_project(&entry(plain).with_origin(McpServerOrigin::Plugin)).unwrap());
        assert!(starts_in_project(&entry(plain).with_origin(McpServerOrigin::Project)).unwrap());

        let opted_in = r#"{"transport": "stdio", "command": "node", "cwd": "project"}"#;
        assert!(starts_in_project(&entry(opted_in)).unwrap());
        assert!(starts_in_project(&entry(opted_in).with_origin(McpServerOrigin::Plugin)).unwrap());
        assert!(serde_json::to_string(&entry(opted_in))
            .unwrap()
            .contains("\"cwd\":\"project\""));

        let error = starts_in_project(&entry(r#"{"command": "node", "cwd": "/srv"}"#))
            .unwrap_err()
            .to_string();
        assert!(error.contains("\"project\""), "{error}");
    }

    #[test]
    fn an_unsandboxed_start_failure_names_the_folder_and_the_way_out() {
        let hint = unsandboxed_start_hint(std::path::Path::new("/home/u/.agiworkforce"));
        assert!(hint.contains("started in /home/u/.agiworkforce"), "{hint}");
        assert!(hint.contains("absolute paths"), "{hint}");
        assert!(hint.contains("\"cwd\": \"project\""), "{hint}");
    }

    #[cfg(unix)]
    #[test]
    fn a_program_planted_where_a_sandbox_writes_is_never_resolved() {
        use std::os::unix::fs::PermissionsExt;
        let planted = tempfile::tempdir().unwrap();
        let program = planted.path().join("npx");
        std::fs::write(&program, "#!/bin/sh\nexit 0\n").unwrap();
        std::fs::set_permissions(&program, std::fs::Permissions::from_mode(0o755)).unwrap();
        let only_planted = std::env::join_paths([planted.path()]).unwrap();
        let error = host_program("npx", &only_planted).unwrap_err().to_string();
        assert!(error.contains("absolute path"), "{error}");

        let planted_first =
            std::env::join_paths([planted.path(), std::path::Path::new("/bin")]).unwrap();
        assert_eq!(host_program("sh", &planted_first).unwrap(), "/bin/sh");
        assert_eq!(
            host_program("/opt/tools/server", &only_planted).unwrap(),
            "/opt/tools/server"
        );
    }

    #[test]
    fn remote_transports_do_not_require_a_local_sandbox() {
        for config in [
            McpServerConfig::http("https://mcp.example.invalid/rpc", HashMap::new()),
            McpServerConfig::sse("https://mcp.example.invalid/sse", HashMap::new()),
        ] {
            let remote = sandbox_stdio_transport(
                crate::sandbox::SandboxType::None,
                &std::env::temp_dir(),
                &std::env::temp_dir(),
                mcp_server_network(&config),
                to_transport_config(&config),
                false,
            )
            .unwrap();
            assert!(!remote.sandboxed);
            assert!(matches!(
                remote.transport,
                TransportConfig::Http { .. } | TransportConfig::Sse { .. }
            ));
        }
    }

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    #[test]
    fn stdio_transport_refuses_an_unavailable_sandbox() {
        let workspace = tempfile::tempdir().unwrap();
        let config = McpServerConfig::stdio("uvx", vec![], HashMap::new());
        assert!(sandbox_stdio_transport(
            crate::sandbox::SandboxType::None,
            workspace.path(),
            workspace.path(),
            mcp_server_network(&config),
            to_transport_config(&config),
            false,
        )
        .is_err());
    }

    /// The VS Code extension over `agi app-server` loaded 11 MCP servers and
    /// DeepSeek refused the turn:
    /// `Invalid 'tools[12].function.name': string does not match pattern`.
    /// One free-form MCP name fails the whole request, on every route, so the
    /// name the manager hands the builders must already be legal, and the call
    /// that comes back under it must still reach the server's own name.
    #[test]
    fn an_mcp_tool_name_is_provider_safe_in_every_builder_and_still_dispatches() {
        use agiworkforce_llm::serialize::{
            anthropic_tools_json, gemini_function_declarations_json, openai_function_tools_json,
            openai_responses_function_tools_json,
        };

        let manager = McpManager::with_discovered_stdio_tool_for_test("brave-search", "search.web");
        let definitions = manager.tool_definitions(crate::agent::PrivacyMode::Byok);
        assert_eq!(definitions.len(), 1);
        assert_eq!(definitions[0].name, "mcp__brave-search__search_web");
        assert_eq!(
            definitions[0].stable_id,
            "agiworkforce.mcp.brave-search.search.web"
        );
        assert_eq!(definitions[0].capability, "mcp");
        assert!(definitions[0].timeout_ms.is_some());
        assert!(definitions[0].error_schema.is_some());

        let openai = openai_function_tools_json(&definitions);
        let responses = openai_responses_function_tools_json(&definitions);
        let gemini = gemini_function_declarations_json(&definitions);
        let anthropic = anthropic_tools_json(&definitions);
        // DeepSeek speaks the OpenAI-compatible dialect, so `openai` is the
        // payload that produced the reported 400.
        for name in [
            &openai[0]["function"]["name"],
            &responses[0]["name"],
            &gemini[0]["name"],
            &anthropic[0]["name"],
        ] {
            assert_eq!(name, "mcp__brave-search__search_web");
        }

        let (server_name, original_name) = manager
            .tool_identity(
                "mcp__brave-search__search_web",
                crate::agent::PrivacyMode::Byok,
            )
            .expect("the safe name must resolve back to the server's own name");
        assert_eq!(server_name, "brave-search");
        assert_eq!(original_name, "search.web");
    }

    /// Two servers can publish names that sanitize to the same string. Without
    /// disambiguation the reverse lookup resolves every call to whichever tool
    /// was discovered first, silently routing to the wrong server.
    #[test]
    fn sanitized_name_collisions_are_broken_apart_and_stay_resolvable() {
        let mut manager = McpManager::new();
        manager.register_discovered_tools(vec![
            McpTool {
                namespaced_name: mcp_tool_name("docs", "search.web"),
                original_name: "search.web".to_string(),
                server_name: "docs".to_string(),
                description: "Dotted".to_string(),
                input_schema: serde_json::json!({"type": "object"}),
            },
            McpTool {
                namespaced_name: mcp_tool_name("docs", "search:web"),
                original_name: "search:web".to_string(),
                server_name: "docs".to_string(),
                description: "Colonned".to_string(),
                input_schema: serde_json::json!({"type": "object"}),
            },
        ]);

        let names: Vec<&str> = manager
            .tools()
            .iter()
            .map(|tool| tool.namespaced_name.as_str())
            .collect();
        assert_eq!(
            names,
            vec!["mcp__docs__search_web", "mcp__docs__search_web_2"]
        );

        for (namespaced, original) in [
            ("mcp__docs__search_web", "search.web"),
            ("mcp__docs__search_web_2", "search:web"),
        ] {
            let (_, resolved) = manager
                .tool_identity(namespaced, crate::agent::PrivacyMode::Byok)
                .expect("every registered name resolves");
            assert_eq!(resolved, original);
        }
    }

    #[test]
    fn test_load_configs_no_crash() {
        // Should not crash even if no config files exist.
        let configs = McpManager::load_configs().unwrap();
        let _ = configs;
    }

    #[test]
    fn project_config_server_names_with_the_rule_separator_are_refused() {
        let path = std::path::Path::new(".mcp.json");
        let contents =
            r#"{"mcpServers":{"github__x":{"command":"node"},"docs":{"command":"node"}}}"#;
        let loaded = parse_mcp_config_contents(contents, path, false).expect("lenient load");
        assert!(loaded.contains_key("docs"));
        assert!(!loaded.contains_key("github__x"));
        let flat = parse_mcp_config_contents(r#"{"a__b":{"command":"node"}}"#, path, false)
            .expect("lenient flat load");
        assert!(flat.is_empty());
        let error = parse_mcp_config_contents(contents, path, true).expect_err("strict load");
        assert!(format!("{error:#}").contains("must not contain '__'"));
    }

    #[test]
    fn load_mcp_config_file_supports_visible_and_nested_configs() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let path = tmp.path().join("mcp.json");
        std::fs::write(
            &path,
            r#"{"mcpServers":{"docs":{"command":"node","args":["server.js"]},"remote":{"transport":"sse","url":"http://localhost:3000/sse"}}}"#,
        )
        .expect("write mcp config");

        let mut configs = HashMap::new();
        load_mcp_config_file_into(&path, &mut configs, true);

        assert!(configs.contains_key("docs"));
        assert!(configs.contains_key("remote"));
        assert_eq!(configs["docs"].transport_kind(), "stdio");
        assert_eq!(configs["remote"].transport_kind(), "sse");
    }

    #[test]
    fn nested_transport_entries_resolve_to_their_real_transport() {
        // Shape found in real ~/.agiworkforce/mcp.json entries written by the
        // ecosystem import: an object under `transport` tagged on `type`, with
        // a vestigial empty `command` beside it. Untagged deserialization used
        // to fall through to Legacy and load these as stdio servers with an
        // empty command, so `agi doctor` reported overall Fail and the servers
        // could never have connected.
        let configs = parse_mcp_config_contents(
            r#"{"mcpServers":{"claude:stripe":{"args":[],"command":"","enabled":true,"env":{},"transport":{"api_key":null,"bearer_token":null,"headers":{},"timeout_secs":30,"type":"http","url":"https://mcp.stripe.com/","verify_ssl":true}}}}"#,
            std::path::Path::new("test.json"),
            false,
        )
        .expect("config parses");

        match configs
            .get("claude:stripe")
            .expect("server present")
            .as_transport()
        {
            McpTransport::Http { url, .. } => assert_eq!(url, "https://mcp.stripe.com/"),
            other => panic!("expected Http transport, got {other:?}"),
        }
    }

    #[test]
    fn canonical_entries_are_untouched_by_normalization() {
        // The normalizer must be inert for configs that were already correct.
        let configs = parse_mcp_config_contents(
            r#"{"mcpServers":{"docs":{"command":"node","args":["server.js"]},"remote":{"transport":"sse","url":"https://example.com/sse"}}}"#,
            std::path::Path::new("test.json"),
            false,
        )
        .expect("config parses");

        assert!(matches!(
            configs.get("docs").expect("stdio server").as_transport(),
            McpTransport::Stdio { .. }
        ));
        assert!(matches!(
            configs.get("remote").expect("sse server").as_transport(),
            McpTransport::Sse { .. }
        ));
    }

    #[test]
    fn strict_load_configs_uses_only_explicit_files() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let path = tmp.path().join("explicit.mcp.json");
        std::fs::write(
            &path,
            r#"{"mcpServers":{"explicit":{"command":"node","args":["server.js"]}}}"#,
        )
        .expect("write mcp config");

        let configs = McpManager::load_configs_with_options(&McpConfigLoadOptions {
            explicit_paths: vec![path],
            strict: true,
        })
        .expect("load explicit config");

        assert_eq!(configs.len(), 1);
        assert!(configs.contains_key("explicit"));
    }

    #[test]
    fn repeated_explicit_mcp_configs_override_in_order() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let first = tmp.path().join("first.json");
        let second = tmp.path().join("second.json");
        std::fs::write(&first, r#"{"dup":{"command":"node","args":["first.js"]}}"#)
            .expect("write first config");
        std::fs::write(
            &second,
            r#"{"dup":{"command":"node","args":["second.js"]}}"#,
        )
        .expect("write second config");

        let configs = McpManager::load_configs_with_options(&McpConfigLoadOptions {
            explicit_paths: vec![first, second],
            strict: true,
        })
        .expect("load explicit configs");

        match configs["dup"].as_transport() {
            McpTransport::Stdio { args, .. } => assert_eq!(args, vec!["second.js"]),
            other => panic!("expected stdio config, got {other:?}"),
        }
    }

    #[test]
    fn missing_explicit_mcp_config_errors() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let missing = tmp.path().join("missing.json");

        let err = McpManager::load_configs_with_options(&McpConfigLoadOptions {
            explicit_paths: vec![missing],
            strict: true,
        })
        .expect_err("missing explicit config should error");

        assert!(err
            .to_string()
            .contains("Failed to read explicit MCP config"));
    }

    #[test]
    fn test_mcp_manager_new() {
        let manager = McpManager::new();
        assert!(manager.tools().is_empty());
        assert!(manager.prompts().is_empty());
        assert!(manager
            .tool_definitions(crate::agent::PrivacyMode::Local)
            .is_empty());
    }

    #[tokio::test]
    async fn local_privacy_hides_and_rejects_a_previously_discovered_remote_tool() {
        let mut manager = McpManager::new();
        manager.remote_servers.insert("remote".to_string());
        manager.tools.push(McpTool {
            namespaced_name: "mcp__remote__search".to_string(),
            original_name: "search".to_string(),
            server_name: "remote".to_string(),
            description: "Search remotely".to_string(),
            input_schema: serde_json::json!({"type": "object"}),
        });

        assert!(manager
            .tool_definitions(crate::agent::PrivacyMode::Local)
            .is_empty());
        assert_eq!(
            manager
                .tool_definitions(crate::agent::PrivacyMode::Byok)
                .len(),
            1
        );

        let error = manager
            .execute_tool(
                "mcp__remote__search",
                serde_json::json!({"query": "private context"}),
                crate::agent::PrivacyMode::Local,
            )
            .await
            .expect_err("Local mode must reject remote MCP execution");
        assert!(error
            .to_string()
            .contains("unavailable in Local privacy mode"));
    }

    #[test]
    fn entering_local_privacy_drops_remote_mcp_metadata() {
        let mut manager = McpManager::new();
        manager.remote_servers.insert("remote".to_string());
        manager.tools.push(McpTool {
            namespaced_name: "mcp__remote__search".to_string(),
            original_name: "search".to_string(),
            server_name: "remote".to_string(),
            description: "Search remotely".to_string(),
            input_schema: serde_json::json!({"type": "object"}),
        });
        manager.prompts.push(McpPrompt {
            command_name: "mcp:remote:research".to_string(),
            original_name: "research".to_string(),
            server_name: "remote".to_string(),
            description: "Research remotely".to_string(),
            arguments: Vec::new(),
        });

        manager.enforce_privacy_mode(crate::agent::PrivacyMode::Local);

        assert!(manager.tools().is_empty());
        assert!(manager.prompts().is_empty());
    }

    #[test]
    fn test_parse_prompts_response_builds_slash_names() {
        let response = serde_json::json!({
            "prompts": [
                {
                    "name": "Review PR",
                    "description": "Review a pull request",
                    "arguments": [
                        {"name": "base", "description": "Base branch", "required": true}
                    ]
                }
            ]
        });

        let prompts = parse_prompts_response("GitHub Server", Some(&response));

        assert_eq!(prompts.len(), 1);
        assert_eq!(prompts[0].command_name, "mcp:github-server:review-pr");
        assert_eq!(prompts[0].original_name, "Review PR");
        assert_eq!(prompts[0].arguments[0].name, "base");
        assert!(prompts[0].arguments[0].required);
    }

    #[test]
    fn test_mcp_prompt_arguments_parse_key_values_or_single_required_arg() {
        let prompt = McpPrompt {
            command_name: "mcp:github:review".to_string(),
            original_name: "review".to_string(),
            server_name: "github".to_string(),
            description: "Review".to_string(),
            arguments: vec![McpPromptArgument {
                name: "base".to_string(),
                description: String::new(),
                required: true,
            }],
        };

        let keyed = mcp_prompt_arguments_from_text(&prompt, r#"{"base":"main","depth":"high"}"#)
            .expect("valid JSON object args");
        assert_eq!(keyed.get("base").and_then(|v| v.as_str()), Some("main"));
        assert_eq!(keyed.get("depth").and_then(|v| v.as_str()), Some("high"));

        let positional = mcp_prompt_arguments_from_text(&prompt, "release branch");
        assert!(positional.is_err());
    }

    #[test]
    fn test_extract_prompt_text_from_messages() {
        let response = serde_json::json!({
            "messages": [
                {"role": "user", "content": {"type": "text", "text": "First"}},
                {"role": "assistant", "content": [{"type": "text", "text": "Second"}]}
            ]
        });

        assert_eq!(
            extract_prompt_text(Some(&response)).unwrap(),
            "First\n\nSecond"
        );
    }

    /// Facade transport-shaping proof: `McpConnection` (thin adapter over the
    /// engine) must still namespace tools `mcp__{server}__{tool}` and text-extract
    /// tool results. Uses a python stdio MCP server (skips when python3 absent).
    #[tokio::test]
    async fn facade_namespaces_tools_and_extracts_call_text() {
        let python_available = std::process::Command::new("python3")
            .arg("--version")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false);
        if !python_available {
            return;
        }

        let script = r#"
import json
import sys

def read_frame():
    line = sys.stdin.readline()
    if not line:
        sys.exit(2)
    return json.loads(line)

def write_frame(frame):
    print(json.dumps(frame), flush=True)

init = read_frame()
while init.get("method") == "server/discover":
    write_frame({"jsonrpc": "2.0", "id": init["id"], "error": {"code": -32601, "message": "Method not found"}})
    init = read_frame()
write_frame({"jsonrpc": "2.0", "id": init["id"], "result": {"protocolVersion": "2025-11-25", "serverInfo": {"name": "t", "version": "0"}}})
read_frame()  # notifications/initialized
while True:
    req = read_frame()
    method = req.get("method")
    if method == "tools/list":
        write_frame({"jsonrpc": "2.0", "id": req["id"], "result": {"tools": [
            {"name": "echo", "description": "e", "inputSchema": {"type": "object"}}
        ]}})
    elif method == "tools/call":
        text = req.get("params", {}).get("arguments", {}).get("text", "")
        write_frame({"jsonrpc": "2.0", "id": req["id"], "result": {"content": [
            {"type": "text", "text": text}
        ]}})
    elif req.get("id") is not None:
        write_frame({"jsonrpc": "2.0", "id": req["id"], "result": {}})
"#;

        let config = McpServerConfig::Tagged(McpTransport::Stdio {
            command: "python3".to_string(),
            args: vec!["-u".to_string(), "-c".to_string(), script.to_string()],
            env: HashMap::new(),
            allow_local_network: false,
            sandbox: Some(false),
            cwd: None,
            origin: McpServerOrigin::User,
        });

        let project = tempfile::tempdir().expect("project");
        let mut conn = McpConnection::connect("myserver", &config, Some(project.path()))
            .await
            .expect("connect");

        let tools = conn.list_tools().await.expect("list_tools");
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0].namespaced_name, "mcp__myserver__echo");
        assert_eq!(tools[0].original_name, "echo");

        let out = conn
            .call_tool("echo", serde_json::json!({ "text": "hello facade" }))
            .await
            .expect("call_tool");
        assert_eq!(out, "hello facade");

        let _ = conn.shutdown().await;
    }

    /// A single small server publishes fewer tools than the budget, so nothing
    /// about its turn changes. This is the case the budget exists to protect.
    #[test]
    fn one_small_server_keeps_every_schema_in_the_initial_list() {
        let manager = McpManager::with_discovered_stdio_tools_for_test(
            "files",
            MCP_ALWAYS_LOADED_TOOL_BUDGET,
        );
        let definitions = manager.tool_definitions(crate::agent::PrivacyMode::Byok);

        assert_eq!(definitions.len(), MCP_ALWAYS_LOADED_TOOL_BUDGET);
        assert!(definitions
            .iter()
            .all(|definition| !definition.should_defer));
    }

    #[test]
    fn tools_past_the_budget_defer_and_stay_callable() {
        let manager = McpManager::with_discovered_stdio_tools_for_test(
            "files",
            MCP_ALWAYS_LOADED_TOOL_BUDGET + 9,
        );
        let definitions = manager.tool_definitions(crate::agent::PrivacyMode::Byok);

        let deferred: Vec<&crate::models::ToolDefinition> = definitions
            .iter()
            .filter(|definition| definition.should_defer)
            .collect();
        assert_eq!(deferred.len(), 9);
        assert!(definitions[..MCP_ALWAYS_LOADED_TOOL_BUDGET]
            .iter()
            .all(|definition| !definition.should_defer));

        // Deferral decides what the schema list carries, never what can run.
        let (server_name, tool_name) = manager
            .tool_identity(&deferred[0].name, crate::agent::PrivacyMode::Byok)
            .expect("a deferred MCP tool still resolves to its server");
        assert_eq!(server_name, "files");
        assert_eq!(tool_name, "tool_16");
    }
}

#[cfg(test)]
thread_local! {
    static TEST_CONFIGS: std::cell::RefCell<Option<HashMap<String, McpServerConfig>>> =
        const { std::cell::RefCell::new(None) };
}

#[cfg(test)]
pub(crate) fn with_test_configs<T>(
    configs: HashMap<String, McpServerConfig>,
    run: impl FnOnce() -> T,
) -> T {
    struct Restore(Option<HashMap<String, McpServerConfig>>);
    impl Drop for Restore {
        fn drop(&mut self) {
            TEST_CONFIGS.with(|cell| cell.replace(self.0.take()));
        }
    }
    let previous = TEST_CONFIGS.with(|cell| cell.replace(Some(configs)));
    let _restore = Restore(previous);
    run()
}
