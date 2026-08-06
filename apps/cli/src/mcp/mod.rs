//! MCP (Model Context Protocol) client — CLI facade.
//!
//! The transport MECHANICS (JSON-RPC framing/correlation/timeouts, the three
//! transports, and the RFC 9728/8414/7591 OAuth flow) live in the shared
//! `agiworkforce-mcp` crate (Wave 5 stage d1 extraction). This module keeps the
//! CLI-app-local pieces only:
//!   * config loading (`McpServerConfig`/`McpTransport`/`McpOAuthConfig` +
//!     `.mcp.json`/`mcp.json` discovery) — CLI back-compat shapes;
//!   * product-shaping of results — strict `tools/list` validation +
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
    AutoDeclineHandler, ElicitationHandler, ElicitationRequest, ElicitationResponse,
};
use agiworkforce_mcp::{
    BrowserAuthorizer, ClientHooks, ClientInfo, McpClient, McpTimeouts, OAuthConfig, OAuthToken,
    TokenStore, TransportConfig,
};

pub mod connection_pool;
pub mod elicitation;
mod oauth_store;
pub mod registry;
pub mod resources;
pub mod status;
pub mod tui_handler;

#[allow(unused_imports)]
pub use connection_pool::McpConnectionManager;
pub use oauth_store::McpOAuthStore;
#[allow(unused_imports)]
pub use oauth_store::McpOAuthToken;
use oauth_store::{McpServerOAuthStore, McpServerToken};
#[allow(unused_imports)]
pub use resources::{McpResource, McpResourceList};
#[allow(unused_imports)]
pub use status::{McpServerStatus, McpServerStatusSnapshot};

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
/// All fields optional — when absent we run RFC 9728 → RFC 8414 discovery on
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
        })
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

/// MCP tool discovered from a server.
#[derive(Debug, Clone)]
pub struct McpTool {
    /// Namespaced tool name: mcp_{server}_{tool}
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

/// Convert the CLI's manifest config shape into the engine's transport config.
fn to_transport_config(config: &McpServerConfig) -> TransportConfig {
    match config.as_transport() {
        McpTransport::Stdio { command, args, env } => TransportConfig::Stdio { command, args, env },
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
    }
}

fn secure_mcp_token_to_crate(token: McpServerToken) -> OAuthToken {
    OAuthToken {
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        token_type: token.token_type,
        expires_at: token.expires_at,
        scope: token.scope,
        auth_server_metadata_url: token.auth_server_metadata_url,
        token_url: token.token_url,
        client_id: token.client_id,
    }
}

fn crate_token_to_secure_mcp(token: OAuthToken) -> McpServerToken {
    McpServerToken {
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        token_type: token.token_type,
        expires_at: token.expires_at,
        scope: token.scope,
        auth_server_metadata_url: token.auth_server_metadata_url,
        token_url: token.token_url,
        client_id: token.client_id,
    }
}

/// OS-keyring-backed MCP OAuth adapter. The old aggregate JSON map is read
/// only to migrate an individual server credential on first use.
struct KeyringTokenStore;

impl TokenStore for KeyringTokenStore {
    fn get(&self, server_url: &str) -> Option<OAuthToken> {
        let secure_store = McpServerOAuthStore::new().ok()?;
        if let Some(token) = secure_store.load(server_url).ok()? {
            return Some(secure_mcp_token_to_crate(token));
        }

        let mut legacy = McpOAuthStore::load().ok()?;
        let token = legacy.get(server_url)?.clone();
        secure_store
            .save(
                server_url,
                &crate_token_to_secure_mcp(mcp_token_to_crate(&token)),
            )
            .ok()?;
        legacy.remove(server_url);
        legacy.save().ok()?;
        Some(mcp_token_to_crate(&token))
    }

    fn set(&self, server_url: &str, token: OAuthToken) -> anyhow::Result<()> {
        McpServerOAuthStore::new()?.save(server_url, &crate_token_to_secure_mcp(token))
    }
}

/// The interactive browser + TTY gate for the OAuth flow. Preserves the CLI's
/// user-action chokepoint (`open_external_url` only launches for an explicitly
/// user-initiated action) and its TTY interactivity check.
struct CliBrowserAuthorizer;

impl BrowserAuthorizer for CliBrowserAuthorizer {
    fn is_interactive(&self) -> bool {
        use std::io::IsTerminal;
        std::io::stdin().is_terminal() && std::io::stderr().is_terminal()
    }

    fn open_url(&self, url: &str) -> bool {
        crate::oauth::open_external_url(url, crate::oauth::UserActionContext::user_initiated())
    }
}

/// Wraps an inner elicitation handler and fires the CLI `Elicitation` /
/// `ElicitationResult` hooks around it — preserving the human-in-the-loop
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
    fn handle<'a>(
        &'a self,
        server_name: &'a str,
        request: ElicitationRequest,
    ) -> Pin<Box<dyn Future<Output = ElicitationResponse> + Send + 'a>> {
        Box::pin(async move {
            // Load hooks per invocation (matches the original firing inside the
            // read loop, not at construction).
            let hcfg = crate::hooks::load_hooks().unwrap_or_default();
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

/// Build the host capability bundle handed to `McpClient::connect`.
///
/// The caller chooses the elicitation surface: headless flows inject
/// [`AutoDeclineHandler`], while the full-screen TUI injects its interactive
/// queue. The wrapper keeps the CLI hook lifecycle identical in both cases.
fn build_client_hooks(elicitation: Arc<dyn ElicitationHandler>) -> ClientHooks {
    ClientHooks {
        token_store: Arc::new(KeyringTokenStore),
        elicitation: Arc::new(HookFiringElicitationHandler::new(elicitation)),
        browser: Arc::new(CliBrowserAuthorizer),
        client_info: ClientInfo {
            name: "agiworkforce-cli".to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
        },
        on_log: agiworkforce_mcp::hooks::noop_log(),
    }
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
}

impl McpConnection {
    /// Start an MCP server and initialize the connection.
    pub async fn connect(name: &str, config: &McpServerConfig) -> Result<Self> {
        Self::connect_with_elicitation(name, config, Arc::new(AutoDeclineHandler)).await
    }

    /// Start an MCP server with an explicitly owned elicitation surface.
    /// Interactive callers must keep the handler alive and drain it while a
    /// request is in flight; headless callers should use [`Self::connect`].
    pub async fn connect_with_elicitation(
        name: &str,
        config: &McpServerConfig,
        elicitation: Arc<dyn ElicitationHandler>,
    ) -> Result<Self> {
        let transport = to_transport_config(config);
        let timeouts = McpTimeouts::default();
        let hooks = build_client_hooks(elicitation);
        let client = McpClient::connect(name, transport, timeouts.clone(), hooks).await?;
        Ok(Self {
            server_name: name.to_string(),
            client,
            timeouts,
        })
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
                namespaced_name: format!("mcp_{}_{}", self.server_name, name),
                original_name: name.to_string(),
                server_name: self.server_name.clone(),
                description: description.to_string(),
                input_schema,
            });
        }

        Ok(tools)
    }

    /// Discover prompts from the MCP server.
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
        let result = self.client.call_tool_value(tool_name, arguments).await?;
        let result = result.unwrap_or(serde_json::Value::Null);

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

/// Manages multiple MCP server connections.
pub struct McpManager {
    connections: HashMap<String, McpConnection>,
    tools: Vec<McpTool>,
    prompts: Vec<McpPrompt>,
    remote_servers: HashSet<String>,
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
/// matches on `command` — so a working HTTP server was loaded as a stdio server
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
            Ok(parsed_configs) => configs.extend(parsed_configs),
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

fn load_default_mcp_configs(configs: &mut HashMap<String, McpServerConfig>) {
    // Project configs win over globals. Support both the historical `.mcp.json`
    // name and the visible `mcp.json` that `agi init` creates.
    for path in [
        std::path::Path::new(".mcp.json"),
        std::path::Path::new("mcp.json"),
    ] {
        load_mcp_config_file_into(path, configs, true);
    }

    // Load from ~/.agiworkforce/.mcp.json and ~/.agiworkforce/mcp.json.
    if let Ok(config_dir) = crate::config::CliConfig::config_dir() {
        for filename in [".mcp.json", "mcp.json"] {
            load_mcp_config_file_into(&config_dir.join(filename), configs, false);
        }
    }
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

impl McpManager {
    pub fn new() -> Self {
        Self {
            connections: HashMap::new(),
            tools: Vec::new(),
            prompts: Vec::new(),
            remote_servers: HashSet::new(),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_discovered_stdio_tool_for_test(server_name: &str, tool_name: &str) -> Self {
        let mut manager = Self::new();
        manager.tools.push(McpTool {
            namespaced_name: format!("mcp_{server_name}_{tool_name}"),
            original_name: tool_name.to_string(),
            server_name: server_name.to_string(),
            description: "Test MCP tool".to_string(),
            input_schema: serde_json::json!({"type": "object"}),
        });
        manager
    }

    /// Load MCP server configurations from project/global MCP JSON files.
    pub fn load_configs() -> Result<HashMap<String, McpServerConfig>> {
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
        let mut configs = HashMap::new();

        if !options.strict {
            load_default_mcp_configs(&mut configs);
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
        // terminal — otherwise these lines bleed into and corrupt the display.
        // In exec / non-TUI mode the flag is false and they render normally.
        let quiet = crate::tui::tui_active();
        for (name, config) in configs {
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
            match McpConnection::connect_with_elicitation(name, config, Arc::clone(&elicitation))
                .await
            {
                Ok(mut conn) => match conn.list_tools().await {
                    Ok(tools) => {
                        let count = tools.len();
                        self.tools.extend(tools);
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
                            eprintln!("  MCP server '{}': {} tools discovered", name, count);
                        }
                        self.connections.insert(name.clone(), conn);
                    }
                    Err(e) => {
                        if !quiet {
                            eprintln!("  MCP server '{}': failed to list tools: {}", name, e);
                        }
                        let _ = conn.shutdown().await;
                    }
                },
                Err(e) => {
                    if !quiet {
                        eprintln!("  MCP server '{}': failed to connect: {}", name, e);
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

    pub fn tools_for_privacy(&self, privacy_mode: crate::agent::PrivacyMode) -> Vec<McpTool> {
        self.tools
            .iter()
            .filter(|tool| self.server_allowed(&tool.server_name, privacy_mode))
            .cloned()
            .collect()
    }

    pub fn prompts_for_privacy(&self, privacy_mode: crate::agent::PrivacyMode) -> Vec<McpPrompt> {
        self.prompts
            .iter()
            .filter(|prompt| self.server_allowed(&prompt.server_name, privacy_mode))
            .cloned()
            .collect()
    }

    /// Convert MCP tools to ToolDefinitions for the LLM.
    ///
    /// Concurrency flags default to false (safe, sequential) for MCP tools —
    /// the MCP protocol exposes `annotations.readOnlyHint` and similar but we
    /// don't plumb those through yet.
    pub fn tool_definitions(
        &self,
        privacy_mode: crate::agent::PrivacyMode,
    ) -> Vec<crate::models::ToolDefinition> {
        self.tools
            .iter()
            .filter(|tool| self.server_allowed(&tool.server_name, privacy_mode))
            .map(|t| crate::models::ToolDefinition {
                name: t.namespaced_name.clone(),
                description: format!("[MCP:{}] {}", t.server_name, t.description),
                input_schema: t.input_schema.clone(),
                is_read_only: false,
                is_concurrency_safe: false,
                max_result_size_chars: None,
                // MCP tools are never deferred — they come from external servers
                // and are only registered when the server is connected.
                should_defer: false,
                aliases: Vec::new(),
                owner: format!("mcp:{}", t.server_name),
                permission_class: "external".to_string(),
                diagnostic_tags: vec!["mcp".to_string(), t.server_name.clone()],
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

        conn.call_tool(&tool.original_name, arguments).await
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
                eprintln!("Warning: failed to shut down MCP server '{}': {}", name, e);
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
// Tests (config loading + result shaping — the CLI-app-local behavior)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

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
        let tool = McpTool {
            namespaced_name: "mcp_myserver_read_file".to_string(),
            original_name: "read_file".to_string(),
            server_name: "myserver".to_string(),
            description: "Read a file".to_string(),
            input_schema: serde_json::json!({"type": "object"}),
        };
        assert_eq!(tool.namespaced_name, "mcp_myserver_read_file");
    }

    #[test]
    fn test_load_configs_no_crash() {
        // Should not crash even if no config files exist.
        let configs = McpManager::load_configs().unwrap();
        let _ = configs;
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
            namespaced_name: "mcp_remote_search".to_string(),
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
                "mcp_remote_search",
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
            namespaced_name: "mcp_remote_search".to_string(),
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
    /// engine) must still namespace tools `mcp_{server}_{tool}` and text-extract
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
write_frame({"jsonrpc": "2.0", "id": init["id"], "result": {"serverInfo": {"name": "t"}}})
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
        });

        let mut conn = McpConnection::connect("myserver", &config)
            .await
            .expect("connect");

        let tools = conn.list_tools().await.expect("list_tools");
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0].namespaced_name, "mcp_myserver_echo");
        assert_eq!(tools[0].original_name, "echo");

        let out = conn
            .call_tool("echo", serde_json::json!({ "text": "hello facade" }))
            .await
            .expect("call_tool");
        assert_eq!(out, "hello facade");

        let _ = conn.shutdown().await;
    }
}
