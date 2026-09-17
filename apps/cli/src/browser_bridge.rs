//! Talking to the desktop shell's browser bridge. The shell owns the pairing
//! and decides every command; the CLI never speaks to the extension.

use std::path::PathBuf;
use std::time::Duration;

use serde::{Deserialize, Serialize};

/// Mirror of four literals owned by
/// `packages/contracts/types/src/browser-bridge.ts`. They cannot drift:
/// `packages/contracts/types/src/__tests__/browser-bridge-rust-mirror.test.ts`
/// reads this source and fails when one stops matching the contract's.
pub mod contract {
    pub const LOCAL_CLIENT_BRIDGE_FILE: &str = "desktop-bridge.json";
    pub const LOCAL_CLIENT_TOKEN_HEADER: &str = "x-local-client-token";
    pub const CLIENT_STATE_ROUTE: &str = "/client/state";
    pub const CLIENT_COMMAND_ROUTE: &str = "/client/command";
    pub const LOCAL_CLIENT_PROTOCOL_VERSION: u32 = 1;
    pub const LOOPBACK_ADDRESS: &str = "127.0.0.1";
}

const STATE_TIMEOUT: Duration = Duration::from_millis(1_500);
pub(crate) const COMMAND_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Debug, Clone, Deserialize)]
pub struct BridgeFile {
    pub version: u32,
    pub port: u16,
    pub token: String,
    pub pid: u32,
    #[serde(default)]
    #[allow(dead_code)]
    pub started_at_ms: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BridgeFileWire {
    version: u32,
    port: u16,
    token: String,
    pid: u32,
    #[serde(default)]
    started_at_ms: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BrowserAvailability {
    /// No shell is running, or the file it left behind names a dead process.
    ShellNotRunning,
    NotPaired,
    /// Paired with a browser that is closed, asleep, or has forgotten this Mac.
    PairedNotAnswering,
    Paired,
}

#[derive(Debug, Clone)]
pub struct BrowserState {
    pub availability: BrowserAvailability,
    pub extension_id: Option<String>,
    pub app_version: Option<String>,
}

impl BrowserState {
    pub fn is_paired(&self) -> bool {
        self.availability == BrowserAvailability::Paired
    }

    fn unavailable(availability: BrowserAvailability) -> Self {
        Self {
            availability,
            extension_id: None,
            app_version: None,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StateResponse {
    #[serde(default)]
    paired: bool,
    /// A shell predating this field only ever reported a pairing, so its
    /// silence means answering rather than withdrawing the tools.
    #[serde(default = "answering_by_default")]
    answering: bool,
    #[serde(default)]
    extension_id: Option<String>,
    #[serde(default)]
    app_version: Option<String>,
}

fn answering_by_default() -> bool {
    true
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CommandRequest<'a> {
    version: u32,
    command: &'a str,
    args: serde_json::Value,
    client: ClientIdentity,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientIdentity {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
}

impl ClientIdentity {
    pub fn for_cli(cwd: Option<PathBuf>, thread_id: Option<String>) -> Self {
        Self {
            name: "agi".to_string(),
            cwd: cwd.map(|path| path.display().to_string()),
            thread_id,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommandResponse {
    #[serde(default)]
    ok: bool,
    #[serde(default)]
    value: Option<serde_json::Value>,
    #[serde(default)]
    error: Option<String>,
    #[serde(default)]
    code: Option<String>,
}

#[derive(Debug, Clone)]
pub struct CommandFailure {
    pub code: String,
    pub message: String,
}

impl CommandFailure {
    pub fn user_message(&self) -> String {
        match self.code.as_str() {
            "not-paired" => {
                "No browser is paired with AGI Desktop. Open the desktop app, install the AGI \
                 Chrome extension, and confirm the pair code."
                    .to_string()
            }
            "permission-denied" => {
                "AGI Desktop refused permission to use the paired browser for this client."
                    .to_string()
            }
            "cancelled" => "That browser action was not run.".to_string(),
            "timeout" => {
                "The paired browser did not answer. Make sure Chrome is running with a tab open."
                    .to_string()
            }
            "unauthorized" => {
                "AGI Desktop rejected this client's token. Restart the desktop app to refresh it."
                    .to_string()
            }
            _ => self.message.clone(),
        }
    }
}

pub fn bridge_file_path() -> Option<PathBuf> {
    crate::config::CliConfig::config_dir()
        .ok()
        .map(|dir| dir.join(contract::LOCAL_CLIENT_BRIDGE_FILE))
}

fn parse_bridge_file(contents: &str) -> Option<BridgeFile> {
    let wire: BridgeFileWire = serde_json::from_str(contents).ok()?;
    if wire.version != contract::LOCAL_CLIENT_PROTOCOL_VERSION
        || wire.port == 0
        || wire.token.is_empty()
    {
        return None;
    }
    Some(BridgeFile {
        version: wire.version,
        port: wire.port,
        token: wire.token,
        pid: wire.pid,
        started_at_ms: wire.started_at_ms,
    })
}

/// A shell killed with SIGKILL leaves its file behind and the port can be
/// reused, so the file alone is not evidence that a shell is running.
#[cfg(unix)]
fn process_is_alive(pid: u32) -> bool {
    use nix::errno::Errno;
    use nix::sys::signal::kill;
    use nix::unistd::Pid;

    let Ok(pid) = i32::try_from(pid) else {
        return false;
    };
    if pid <= 0 {
        return false;
    }
    // Signal `None` runs the existence and permission checks without
    // delivering anything. A process owned by another user answers EPERM,
    // which still means it exists.
    match kill(Pid::from_raw(pid), None) {
        Ok(()) => true,
        Err(Errno::EPERM) => true,
        Err(_) => false,
    }
}

#[cfg(not(unix))]
fn process_is_alive(pid: u32) -> bool {
    pid != 0
}

pub fn read_bridge_file() -> Option<BridgeFile> {
    let path = bridge_file_path()?;
    let contents = std::fs::read_to_string(path).ok()?;
    let file = parse_bridge_file(&contents)?;
    process_is_alive(file.pid).then_some(file)
}

fn base_url(file: &BridgeFile) -> String {
    format!("http://{}:{}", contract::LOOPBACK_ADDRESS, file.port)
}

pub async fn browser_state() -> BrowserState {
    let Some(file) = read_bridge_file() else {
        return BrowserState::unavailable(BrowserAvailability::ShellNotRunning);
    };
    state_from(&file).await
}

async fn state_from(file: &BridgeFile) -> BrowserState {
    let Ok(client) = reqwest::Client::builder().timeout(STATE_TIMEOUT).build() else {
        return BrowserState::unavailable(BrowserAvailability::ShellNotRunning);
    };
    let response = client
        .post(format!(
            "{}{}",
            base_url(file),
            contract::CLIENT_STATE_ROUTE
        ))
        .header(contract::LOCAL_CLIENT_TOKEN_HEADER, &file.token)
        .json(&serde_json::json!({ "version": contract::LOCAL_CLIENT_PROTOCOL_VERSION }))
        .send()
        .await;
    let Ok(response) = response else {
        return BrowserState::unavailable(BrowserAvailability::ShellNotRunning);
    };
    if !response.status().is_success() {
        // A refused token means a stale file, which to a caller is no shell.
        return BrowserState::unavailable(BrowserAvailability::ShellNotRunning);
    }
    let Ok(state) = response.json::<StateResponse>().await else {
        return BrowserState::unavailable(BrowserAvailability::ShellNotRunning);
    };
    BrowserState {
        availability: match (state.paired, state.answering) {
            (true, true) => BrowserAvailability::Paired,
            (true, false) => BrowserAvailability::PairedNotAnswering,
            (false, _) => BrowserAvailability::NotPaired,
        },
        extension_id: state.extension_id,
        app_version: state.app_version,
    }
}

/// [`browser_state`] for a synchronous caller, which may itself be running
/// inside the Tokio runtime this must not block.
pub fn browser_state_blocking() -> BrowserState {
    if read_bridge_file().is_none() {
        return BrowserState::unavailable(BrowserAvailability::ShellNotRunning);
    }
    std::thread::spawn(|| {
        let Ok(runtime) = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
        else {
            return BrowserState::unavailable(BrowserAvailability::ShellNotRunning);
        };
        runtime.block_on(browser_state())
    })
    .join()
    .unwrap_or_else(|_| BrowserState::unavailable(BrowserAvailability::ShellNotRunning))
}

pub async fn run_command(
    command: &str,
    args: serde_json::Value,
    client_identity: ClientIdentity,
) -> Result<serde_json::Value, CommandFailure> {
    let Some(file) = read_bridge_file() else {
        return Err(CommandFailure {
            code: "not-paired".to_string(),
            message: "AGI Desktop is not running.".to_string(),
        });
    };
    command_on(&file, command, args, client_identity).await
}

async fn command_on(
    file: &BridgeFile,
    command: &str,
    args: serde_json::Value,
    client_identity: ClientIdentity,
) -> Result<serde_json::Value, CommandFailure> {
    let client = reqwest::Client::builder()
        .timeout(COMMAND_TIMEOUT)
        .build()
        .map_err(|error| CommandFailure {
            code: "timeout".to_string(),
            message: error.to_string(),
        })?;
    let response = client
        .post(format!(
            "{}{}",
            base_url(file),
            contract::CLIENT_COMMAND_ROUTE
        ))
        .header(contract::LOCAL_CLIENT_TOKEN_HEADER, &file.token)
        .json(&CommandRequest {
            version: contract::LOCAL_CLIENT_PROTOCOL_VERSION,
            command,
            args,
            client: client_identity,
        })
        .send()
        .await
        .map_err(|error| CommandFailure {
            code: "timeout".to_string(),
            message: error.to_string(),
        })?;

    if response.status().as_u16() == 401 {
        return Err(CommandFailure {
            code: "unauthorized".to_string(),
            message: "The desktop bridge rejected this client's token.".to_string(),
        });
    }

    let parsed = response
        .json::<CommandResponse>()
        .await
        .map_err(|error| CommandFailure {
            code: "timeout".to_string(),
            message: error.to_string(),
        })?;
    if parsed.ok {
        return Ok(parsed.value.unwrap_or(serde_json::Value::Null));
    }
    Err(CommandFailure {
        code: parsed.code.unwrap_or_else(|| "not-paired".to_string()),
        message: parsed
            .error
            .unwrap_or_else(|| "The browser command did not run.".to_string()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex as StdMutex};

    #[test]
    fn a_bridge_file_is_only_accepted_at_the_version_this_build_speaks() {
        let good =
            parse_bridge_file(r#"{"version":1,"port":8787,"token":"t","pid":42,"startedAtMs":1}"#)
                .expect("valid file");
        assert_eq!(good.port, 8787);
        assert_eq!(good.token, "t");
        assert_eq!(good.pid, 42);

        assert!(
            parse_bridge_file(r#"{"version":2,"port":8787,"token":"t","pid":42,"startedAtMs":1}"#)
                .is_none(),
            "a future version must not be read with this build's assumptions"
        );
        assert!(parse_bridge_file(
            r#"{"version":1,"port":0,"token":"t","pid":42,"startedAtMs":1}"#
        )
        .is_none());
        assert!(
            parse_bridge_file(r#"{"version":1,"port":8787,"token":"","pid":42,"startedAtMs":1}"#)
                .is_none(),
            "an empty token would be sent as a header and refused; refuse it here"
        );
        assert!(parse_bridge_file("not json").is_none());
    }

    #[test]
    fn a_file_naming_a_dead_process_is_not_a_live_bridge() {
        assert!(!process_is_alive(0));
        assert!(
            process_is_alive(std::process::id()),
            "this process is alive"
        );
    }

    #[test]
    fn each_failure_code_tells_the_user_a_different_thing_to_do() {
        let mut seen = std::collections::HashSet::new();
        for code in [
            "not-paired",
            "permission-denied",
            "cancelled",
            "timeout",
            "unauthorized",
        ] {
            let failure = CommandFailure {
                code: code.to_string(),
                message: "raw".to_string(),
            };
            let message = failure.user_message();
            assert_ne!(message, "raw", "{code} must have its own message");
            assert!(
                seen.insert(message),
                "{code} repeats another code's message"
            );
        }

        let unknown = CommandFailure {
            code: "something-new".to_string(),
            message: "the shell said this".to_string(),
        };
        assert_eq!(unknown.user_message(), "the shell said this");
    }

    #[test]
    fn the_client_identity_names_the_directory_the_user_would_recognise() {
        let identity =
            ClientIdentity::for_cli(Some(PathBuf::from("/home/me/project")), Some("t1".into()));
        assert_eq!(identity.name, "agi");
        assert_eq!(identity.cwd.as_deref(), Some("/home/me/project"));
        assert_eq!(identity.thread_id.as_deref(), Some("t1"));

        let value = serde_json::to_value(&identity).expect("serialize");
        assert_eq!(value["threadId"], "t1", "the wire is camelCase");

        let bare = ClientIdentity::for_cli(None, None);
        let value = serde_json::to_value(&bare).expect("serialize");
        assert!(value.get("cwd").is_none() && value.get("threadId").is_none());
    }

    struct StubBridge {
        file: BridgeFile,
        seen: Arc<StdMutex<Vec<serde_json::Value>>>,
    }

    async fn start_stub(
        expected_token: &'static str,
        state: serde_json::Value,
        command: serde_json::Value,
        command_status: u16,
    ) -> StubBridge {
        use axum::extract::State;
        use axum::http::{HeaderMap, StatusCode};
        use axum::routing::post;
        use axum::{Json, Router};

        #[derive(Clone)]
        struct Stub {
            token: &'static str,
            state: serde_json::Value,
            command: serde_json::Value,
            command_status: u16,
            seen: Arc<StdMutex<Vec<serde_json::Value>>>,
        }

        fn authorized(headers: &HeaderMap, token: &str) -> bool {
            headers
                .get(contract::LOCAL_CLIENT_TOKEN_HEADER)
                .and_then(|value| value.to_str().ok())
                == Some(token)
        }

        let seen = Arc::new(StdMutex::new(Vec::new()));
        let stub = Stub {
            token: expected_token,
            state,
            command,
            command_status,
            seen: seen.clone(),
        };

        let app = Router::new()
            .route(
                contract::CLIENT_STATE_ROUTE,
                post(|State(stub): State<Stub>, headers: HeaderMap| async move {
                    if !authorized(&headers, stub.token) {
                        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({})));
                    }
                    (StatusCode::OK, Json(stub.state.clone()))
                }),
            )
            .route(
                contract::CLIENT_COMMAND_ROUTE,
                post(
                    |State(stub): State<Stub>,
                     headers: HeaderMap,
                     Json(body): Json<serde_json::Value>| async move {
                        if !authorized(&headers, stub.token) {
                            return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({})));
                        }
                        match stub.seen.lock() {
                            Ok(mut seen) => seen.push(body),
                            Err(poisoned) => poisoned.into_inner().push(body),
                        }
                        (
                            StatusCode::from_u16(stub.command_status).unwrap_or(StatusCode::OK),
                            Json(stub.command.clone()),
                        )
                    },
                ),
            )
            .with_state(stub);

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind loopback");
        let port = listener.local_addr().expect("local addr").port();
        tokio::spawn(async move {
            let _ = axum::serve(listener, app).await;
        });

        StubBridge {
            file: BridgeFile {
                version: contract::LOCAL_CLIENT_PROTOCOL_VERSION,
                port,
                token: expected_token.to_string(),
                pid: std::process::id(),
                started_at_ms: 0,
            },
            seen,
        }
    }

    #[tokio::test]
    async fn a_paired_browser_that_stopped_answering_is_not_usable() {
        let silent = start_stub(
            "token-4",
            serde_json::json!({
                "version": 1,
                "paired": true,
                "answering": false,
                "extensionId": "abcdefghijklmnopabcdefghijklmnop"
            }),
            serde_json::json!({}),
            200,
        )
        .await;
        let state = state_from(&silent.file).await;
        assert_eq!(state.availability, BrowserAvailability::PairedNotAnswering);
        assert!(!state.is_paired(), "no tool may be offered for it");
        assert_eq!(
            state.extension_id.as_deref(),
            Some("abcdefghijklmnopabcdefghijklmnop"),
            "the extension is still named, so the user knows which pairing"
        );

        let older = start_stub(
            "token-5",
            serde_json::json!({ "version": 1, "paired": true }),
            serde_json::json!({}),
            200,
        )
        .await;
        assert_eq!(
            state_from(&older.file).await.availability,
            BrowserAvailability::Paired
        );
    }

    #[tokio::test]
    async fn a_paired_shell_answers_paired_and_an_unpaired_one_does_not() {
        let stub = start_stub(
            "token-1",
            serde_json::json!({
                "version": 1,
                "paired": true,
                "answering": true,
                "extensionId": "abcdefghijklmnopabcdefghijklmnop",
                "appVersion": "1.7.1"
            }),
            serde_json::json!({}),
            200,
        )
        .await;
        let state = state_from(&stub.file).await;
        assert_eq!(state.availability, BrowserAvailability::Paired);
        assert!(state.is_paired());
        assert_eq!(
            state.extension_id.as_deref(),
            Some("abcdefghijklmnopabcdefghijklmnop")
        );
        assert_eq!(state.app_version.as_deref(), Some("1.7.1"));

        let unpaired = start_stub(
            "token-1",
            serde_json::json!({ "version": 1, "paired": false }),
            serde_json::json!({}),
            200,
        )
        .await;
        let state = state_from(&unpaired.file).await;
        assert_eq!(state.availability, BrowserAvailability::NotPaired);
        assert!(!state.is_paired());
    }

    #[tokio::test]
    async fn a_refused_token_reads_as_no_shell_rather_than_as_paired() {
        let stub = start_stub(
            "the-real-token",
            serde_json::json!({ "version": 1, "paired": true }),
            serde_json::json!({}),
            200,
        )
        .await;
        let stale = BridgeFile {
            token: "a-stale-token".to_string(),
            ..stub.file.clone()
        };
        let state = state_from(&stale).await;
        assert_eq!(state.availability, BrowserAvailability::ShellNotRunning);
        assert!(!state.is_paired());
    }

    #[tokio::test]
    async fn a_dead_port_reads_as_no_shell() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind");
        let port = listener.local_addr().expect("addr").port();
        drop(listener);
        let file = BridgeFile {
            version: 1,
            port,
            token: "t".to_string(),
            pid: std::process::id(),
            started_at_ms: 0,
        };
        assert_eq!(
            state_from(&file).await.availability,
            BrowserAvailability::ShellNotRunning
        );
    }

    #[tokio::test]
    async fn a_command_carries_the_token_the_version_and_who_is_asking() {
        let stub = start_stub(
            "token-2",
            serde_json::json!({ "version": 1, "paired": true }),
            serde_json::json!({
                "version": 1,
                "ok": true,
                "value": { "title": "QA project", "url": "https://example.test/" }
            }),
            200,
        )
        .await;

        let value = command_on(
            &stub.file,
            "browser_read_page",
            serde_json::json!({}),
            ClientIdentity::for_cli(Some(PathBuf::from("/home/me/project")), None),
        )
        .await
        .expect("command runs");
        assert_eq!(value["title"], "QA project");

        let seen = stub.seen.lock().expect("seen");
        let request = seen.first().expect("the stub received the command");
        assert_eq!(request["version"], 1);
        assert_eq!(request["command"], "browser_read_page");
        assert_eq!(request["client"]["name"], "agi");
        assert_eq!(request["client"]["cwd"], "/home/me/project");
    }

    #[tokio::test]
    async fn a_refusal_keeps_the_code_the_shell_chose() {
        for code in [
            "not-paired",
            "permission-denied",
            "cancelled",
            "timeout",
            "unauthorized",
        ] {
            let stub = start_stub(
                "token-3",
                serde_json::json!({ "version": 1, "paired": true }),
                serde_json::json!({
                    "version": 1,
                    "ok": false,
                    "error": "the shell said no",
                    "code": code
                }),
                200,
            )
            .await;
            let failure = command_on(
                &stub.file,
                "browser_click",
                serde_json::json!({ "selector": "#buy" }),
                ClientIdentity::for_cli(None, None),
            )
            .await
            .expect_err("a refusal is an error");
            assert_eq!(failure.code, code);
            assert_eq!(failure.message, "the shell said no");
        }
    }

    #[tokio::test]
    async fn a_401_reports_an_unauthorized_client_not_an_unpaired_browser() {
        let stub = start_stub(
            "the-real-token",
            serde_json::json!({ "version": 1, "paired": true }),
            serde_json::json!({}),
            200,
        )
        .await;
        let stale = BridgeFile {
            token: "a-stale-token".to_string(),
            ..stub.file.clone()
        };
        let failure = command_on(
            &stale,
            "browser_read_page",
            serde_json::json!({}),
            ClientIdentity::for_cli(None, None),
        )
        .await
        .expect_err("a refused token is an error");
        assert_eq!(failure.code, "unauthorized");
    }
}
