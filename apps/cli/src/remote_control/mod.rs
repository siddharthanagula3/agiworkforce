mod envelope;
mod host;

use std::collections::{HashSet, VecDeque};
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use agiworkforce_app_server::DeveloperSessionHost;
use anyhow::{anyhow, bail, Context, Result};
use base64::Engine as _;
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tokio_tungstenite::tungstenite::handshake::derive_accept_key;
use tokio_tungstenite::tungstenite::protocol::Role;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::WebSocketStream;

use envelope::{DispatchSession, VerifyError};
use host::{CodeHost, Outgoing};

const PAIR_PATH: &str = "/api/pair/initiate";
const PAIRING_TIMEOUT: Duration = Duration::from_secs(15);
const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(25);
const RECONNECT_BASE: Duration = Duration::from_secs(1);
const RECONNECT_MAX: Duration = Duration::from_secs(30);
const RECEIPT_LEDGER: usize = 256;
const PAIRING_CODE_LENGTH: usize = 12;
const ENDS_PAIRING: [&str; 3] = ["device_revoked", "pairing_not_found", "pairing_expired"];
const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
const END_PAIRING_TIMEOUT: Duration = Duration::from_secs(3);

pub type Stop = tokio::sync::watch::Receiver<bool>;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RemoteControlStatus {
    Waiting {
        folder: String,
        pairing_line: String,
    },
    Connected {
        phone: String,
    },
    PhoneLeft,
    PhoneNeedsUpdate,
    Reconnecting,
    Off,
}

type StatusSink = Arc<dyn Fn(RemoteControlStatus) + Send + Sync>;

enum Step<T> {
    Stopped,
    Done(T),
}

async fn stopped(mut stop: Stop) {
    while !*stop.borrow_and_update() {
        if stop.changed().await.is_err() {
            std::future::pending::<()>().await;
        }
    }
}

async fn or_stopped<T>(stop: &Stop, work: impl std::future::Future<Output = T>) -> Step<T> {
    tokio::select! {
        biased;
        () = stopped(stop.clone()) => Step::Stopped,
        value = work => Step::Done(value),
    }
}

fn stop_on_ctrl_c() -> Stop {
    let (sender, receiver) = tokio::sync::watch::channel(false);
    tokio::spawn(async move {
        if tokio::signal::ctrl_c().await.is_ok() {
            let _ = sender.send(true);
        }
    });
    receiver
}

fn register_frame(pairing: &Pairing) -> Message {
    Message::Text(
        json!({
            "type": "register",
            "code": pairing.code,
            "role": "desktop",
            "pairToken": pairing.pair_token,
            "metadata": {
                "deviceType": "cli",
                "deviceName": device_name(),
                "app": "agiworkforce-cli",
                "version": env!("CARGO_PKG_VERSION"),
                "capabilities": ["code-sessions", "code-session-start"],
            },
        })
        .to_string()
        .into(),
    )
}

fn end_pairing_frame() -> Message {
    Message::Text(json!({ "type": "end_pairing" }).to_string().into())
}

async fn connect(ws_url: &str, origin: &str) -> Result<Socket> {
    tokio::time::timeout(CONNECT_TIMEOUT, open_socket(ws_url, origin))
        .await
        .map_err(|_| anyhow!("The Remote Control relay did not answer in time"))?
}

async fn end_pairing(pairing: &Pairing, origin: &str) {
    let attempt = async {
        let socket = open_socket(&pairing.ws_url, origin).await?;
        let (mut sink, _) = socket.split();
        sink.send(register_frame(pairing)).await?;
        sink.send(end_pairing_frame()).await?;
        let _ = sink.close().await;
        anyhow::Ok(())
    };
    let _ = tokio::time::timeout(END_PAIRING_TIMEOUT, attempt).await;
}

fn backoff(attempt: u32) -> Duration {
    (RECONNECT_BASE * 2u32.saturating_pow(attempt.min(5))).min(RECONNECT_MAX)
}

type Socket = WebSocketStream<reqwest::Upgraded>;

struct Pairing {
    code: String,
    ws_url: String,
    pair_token: String,
}

enum SessionEnd {
    Stopped,
    Ended(String),
    Dropped,
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn web_base() -> Result<String> {
    let raw = std::env::var("AGIWORKFORCE_API_BASE")
        .unwrap_or_else(|_| crate::tier_cache::default_api_base().to_string());
    crate::tier_cache::resolve_agi_api_base(&raw)
        .ok_or_else(|| anyhow!("The AGI Workforce address is not valid: {raw}"))
}

async fn request_pairing(base: &str, jwt: &str) -> Result<Pairing> {
    let client = reqwest::Client::builder()
        .timeout(PAIRING_TIMEOUT)
        .build()?;
    let response = crate::cloud::handshake::apply(client.post(format!("{base}{PAIR_PATH}")))
        .header("Authorization", format!("Bearer {jwt}"))
        .header("X-Requested-With", "XMLHttpRequest")
        .json(&json!({ "initiator": "desktop" }))
        .send()
        .await
        .context("AGI Workforce could not be reached to start Remote Control")?;
    let status = response.status();
    let body: Value = response.json().await.unwrap_or(Value::Null);
    if !status.is_success() {
        let reason = body
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("Remote Control could not start");
        bail!("{reason} ({status})");
    }
    let code = body["code"].as_str().unwrap_or_default().to_string();
    let ws_url = body["signaling"]["wsUrl"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    let pair_token = body["pairTokens"]["desktop"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    let valid_code = code.len() == PAIRING_CODE_LENGTH
        && code
            .chars()
            .all(|character| character.is_ascii_uppercase() || character.is_ascii_digit());
    if !valid_code
        || !(ws_url.starts_with("wss://") || ws_url.starts_with("ws://"))
        || pair_token.is_empty()
    {
        bail!("AGI Workforce answered the pairing request with something this build cannot read");
    }
    Ok(Pairing {
        code,
        ws_url,
        pair_token,
    })
}

async fn open_socket(ws_url: &str, origin: &str) -> Result<Socket> {
    let http_url = if let Some(rest) = ws_url.strip_prefix("wss://") {
        format!("https://{rest}")
    } else if let Some(rest) = ws_url.strip_prefix("ws://") {
        format!("http://{rest}")
    } else {
        bail!("Remote Control needs a ws:// or wss:// relay address");
    };
    let key = {
        use rand::Rng;
        let mut bytes = [0u8; 16];
        rand::rng().fill_bytes(&mut bytes);
        base64::engine::general_purpose::STANDARD.encode(bytes)
    };
    let client = reqwest::Client::builder().http1_only().build()?;
    let response = client
        .get(http_url)
        .header("Connection", "Upgrade")
        .header("Upgrade", "websocket")
        .header("Sec-WebSocket-Version", "13")
        .header("Sec-WebSocket-Key", &key)
        .header("Origin", origin)
        .send()
        .await
        .context("The Remote Control relay could not be reached")?;
    if response.status() != reqwest::StatusCode::SWITCHING_PROTOCOLS {
        bail!(
            "The Remote Control relay refused the connection ({})",
            response.status()
        );
    }
    let accepted = response
        .headers()
        .get("sec-websocket-accept")
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    if accepted.as_deref() != Some(derive_accept_key(key.as_bytes()).as_str()) {
        bail!("The Remote Control relay answered with an invalid handshake");
    }
    let upgraded = response.upgrade().await?;
    Ok(WebSocketStream::from_raw_socket(upgraded, Role::Client, None).await)
}

fn root_id(workspace: &Path) -> String {
    let digest = Sha256::digest(workspace.to_string_lossy().as_bytes());
    crate::hex::encode(&digest)[..32].to_string()
}

fn device_name() -> String {
    std::env::var("HOSTNAME")
        .ok()
        .or_else(|| {
            std::process::Command::new("hostname")
                .output()
                .ok()
                .and_then(|out| String::from_utf8(out.stdout).ok())
        })
        .map(|name| name.trim().trim_end_matches(".local").to_string())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "This terminal".to_string())
}

struct Relay<H: DeveloperSessionHost> {
    code_host: CodeHost<H>,
    pairing: Pairing,
    secret: String,
    dispatch: Option<DispatchSession>,
    receipts: VecDeque<String>,
    receipt_keys: HashSet<String>,
    phone: Option<String>,
    status: StatusSink,
}

impl<H: DeveloperSessionHost> Relay<H> {
    fn signal(&self, action: &str, payload: Value) -> Option<Message> {
        let session = self.dispatch.as_ref()?;
        let mut inner = payload;
        inner["action"] = json!(action);
        let envelope = session.sign(action, inner, now_ms());
        let frame = json!({
            "type": "signal",
            "kind": "control",
            "payload": { "action": action, "data": envelope },
        });
        Some(Message::Text(frame.to_string().into()))
    }

    fn signals(&self, outgoing: Vec<Outgoing>) -> Vec<Message> {
        outgoing
            .into_iter()
            .filter_map(|(action, payload)| self.signal(&action, payload))
            .collect()
    }

    fn receipt(&mut self, action: &str, request_id: &str) -> (bool, Option<Message>) {
        let key = format!("{action} {request_id}");
        let duplicate = self.receipt_keys.contains(&key);
        if !duplicate {
            self.receipt_keys.insert(key.clone());
            self.receipts.push_back(key);
            while self.receipts.len() > RECEIPT_LEDGER {
                if let Some(evicted) = self.receipts.pop_front() {
                    self.receipt_keys.remove(&evicted);
                }
            }
        }
        let payload = json!({
            "version": 1,
            "requestId": request_id,
            "controlAction": action,
            "outcome": if duplicate { "duplicate" } else { "accepted" },
            "receivedAt": now_iso(),
        });
        (duplicate, self.signal("control.receipt", payload))
    }

    async fn on_control(&mut self, payload: &Value) -> Vec<Message> {
        let Some(session) = self.dispatch.as_mut() else {
            return Vec::new();
        };
        let candidate = match payload.get("data") {
            Some(data) if data.get("hmac").is_some_and(Value::is_string) => data,
            _ => payload,
        };
        let (kind, inner) = match session.verify(candidate, now_ms()) {
            Ok(verified) => verified,
            Err(VerifyError::UpdateRequired) => {
                (self.status)(RemoteControlStatus::PhoneNeedsUpdate);
                return Vec::new();
            }
            Err(_) => return Vec::new(),
        };
        let action = inner
            .get("action")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or(kind);
        if action == "heartbeat" {
            let timestamp = inner.get("timestamp").cloned().unwrap_or(json!(now_ms()));
            return self
                .signal(
                    "heartbeat_ack",
                    json!({ "timestamp": timestamp, "receivedAt": now_ms() }),
                )
                .into_iter()
                .collect();
        }
        let mut out = Vec::new();
        if let Some(request_id) = inner
            .get("requestId")
            .and_then(Value::as_str)
            .filter(|id| !id.is_empty() && id.len() <= 128)
            .map(str::to_string)
        {
            let (duplicate, receipt) = self.receipt(&action, &request_id);
            out.extend(receipt);
            if duplicate {
                return out;
            }
        }
        let replies = self.code_host.handle_control(&action, &inner).await;
        out.extend(self.signals(replies));
        out
    }

    async fn on_frame(&mut self, text: &str) -> Result<(Vec<Message>, Option<SessionEnd>)> {
        let frame: Value = serde_json::from_str(text).unwrap_or(Value::Null);
        let kind = frame
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or_default();
        match kind {
            "registered" => {
                let Some(token) = frame["pairToken"].as_str().filter(|token| {
                    token.len() == <Sha256 as Digest>::output_size() * 2
                        && token
                            .bytes()
                            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
                }) else {
                    return Ok((
                        Vec::new(),
                        Some(SessionEnd::Ended(
                            "The relay returned an invalid pairing credential".to_string(),
                        )),
                    ));
                };
                self.pairing.pair_token = token.to_string();
                Ok((Vec::new(), None))
            }
            "peer_ready" => {
                let metadata = frame.get("metadata").cloned().unwrap_or(Value::Null);
                let Some(salt) = metadata.get("dispatchSalt").and_then(Value::as_str) else {
                    (self.status)(RemoteControlStatus::PhoneNeedsUpdate);
                    return Ok((Vec::new(), None));
                };
                let Some(key) = envelope::derive_key(&self.pairing.code, salt, &self.secret) else {
                    return Ok((Vec::new(), None));
                };
                self.dispatch = Some(DispatchSession::new(key));
                let phone = metadata
                    .get("deviceName")
                    .and_then(Value::as_str)
                    .unwrap_or("your phone")
                    .to_string();
                (self.status)(RemoteControlStatus::Connected {
                    phone: phone.clone(),
                });
                self.phone = Some(phone);
                let sessions = self.code_host.sessions().await;
                Ok((self.signals(sessions), None))
            }
            "peer_left" => {
                if self.phone.take().is_some() {
                    (self.status)(RemoteControlStatus::PhoneLeft);
                }
                self.dispatch = None;
                self.code_host.reset();
                Ok((Vec::new(), None))
            }
            "signal" => {
                if frame.get("kind").and_then(Value::as_str) != Some("control") {
                    return Ok((Vec::new(), None));
                }
                let payload = frame.get("payload").cloned().unwrap_or(Value::Null);
                Ok((self.on_control(&payload).await, None))
            }
            "sync_request" => {
                let sessions = self.code_host.sessions().await;
                Ok((self.signals(sessions), None))
            }
            "session_expired" | "terminated" => Ok((
                Vec::new(),
                Some(SessionEnd::Ended("The pairing ended.".to_string())),
            )),
            "device_revoked" | "error" => {
                let error = frame
                    .get("error")
                    .and_then(Value::as_str)
                    .unwrap_or(kind)
                    .to_string();
                if kind == "device_revoked" || ENDS_PAIRING.contains(&error.as_str()) {
                    return Ok((Vec::new(), Some(SessionEnd::Ended(error))));
                }
                Ok((Vec::new(), None))
            }
            _ => Ok((Vec::new(), None)),
        }
    }

    async fn serve(
        &mut self,
        stop: &Stop,
        socket: Socket,
        notifications: &mut tokio::sync::broadcast::Receiver<
            agiworkforce_protocol::developer_session::AppServerNotification,
        >,
    ) -> SessionEnd {
        let (mut sink, mut stream) = socket.split();
        if sink.send(register_frame(&self.pairing)).await.is_err() {
            return SessionEnd::Dropped;
        }
        let mut heartbeat = tokio::time::interval(HEARTBEAT_INTERVAL);
        loop {
            let outgoing = tokio::select! {
                biased;
                () = stopped(stop.clone()) => {
                    let _ = tokio::time::timeout(END_PAIRING_TIMEOUT, async {
                        let _ = sink.send(end_pairing_frame()).await;
                        let _ = sink.close().await;
                    })
                    .await;
                    return SessionEnd::Stopped;
                }
                _ = heartbeat.tick() => vec![Message::Text(json!({ "type": "heartbeat" }).to_string().into())],
                frame = stream.next() => match frame {
                    Some(Ok(Message::Text(text))) => match self.on_frame(&text).await {
                        Ok((messages, None)) => messages,
                        Ok((_, Some(end))) => return end,
                        Err(_) => Vec::new(),
                    },
                    Some(Ok(Message::Close(_))) | None | Some(Err(_)) => return SessionEnd::Dropped,
                    Some(Ok(_)) => Vec::new(),
                },
                notification = notifications.recv() => match notification {
                    Ok(notification) if self.dispatch.is_some() => {
                        let replies = self.code_host.handle_notification(&notification).await;
                        self.signals(replies)
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                        return SessionEnd::Ended("The session runtime stopped.".to_string());
                    }
                    _ => Vec::new(),
                },
            };
            for message in outgoing {
                match or_stopped(stop, sink.send(message)).await {
                    Step::Done(Ok(())) => {}
                    Step::Done(Err(_)) => return SessionEnd::Dropped,
                    Step::Stopped => break,
                }
            }
        }
    }
}

fn print_status(status: RemoteControlStatus) {
    match status {
        RemoteControlStatus::Waiting {
            folder,
            pairing_line,
        } => {
            println!("Remote Control is on for {folder}.");
            println!("On your phone, open AGI Workforce, go to Remote, tap Scan, choose to enter the code, and paste:");
            println!();
            println!("  {pairing_line}");
            println!();
            println!("Anyone with this line can control sessions in this folder until you stop. Press Ctrl+C to stop.");
        }
        RemoteControlStatus::Connected { phone } => {
            println!("Remote Control: connected to {phone}.")
        }
        RemoteControlStatus::PhoneLeft => {
            println!("Remote Control: the phone disconnected. Waiting for it to come back.")
        }
        RemoteControlStatus::PhoneNeedsUpdate => {
            eprintln!(
                "The phone runs an older AGI Workforce build. Update the app, then pair again."
            )
        }
        RemoteControlStatus::Reconnecting => {
            println!("Remote Control: the relay connection dropped. Reconnecting.")
        }
        RemoteControlStatus::Off => println!("Remote Control is off."),
    }
}

pub async fn run<H: DeveloperSessionHost + 'static>(host: Arc<H>, workspace: &Path) -> Result<()> {
    run_with(host, workspace, stop_on_ctrl_c(), print_status).await
}

pub async fn run_with<H: DeveloperSessionHost + 'static>(
    host: Arc<H>,
    workspace: &Path,
    stop: Stop,
    status: impl Fn(RemoteControlStatus) + Send + Sync + 'static,
) -> Result<()> {
    let status: StatusSink = Arc::new(status);
    let jwt = crate::tier_cache::load_jwt()
        .ok_or_else(|| anyhow!("Sign in with `agi login` before starting Remote Control"))?;
    let base = web_base()?;
    let Step::Done(pairing) = or_stopped(&stop, request_pairing(&base, &jwt)).await else {
        return Ok(());
    };
    let pairing = pairing?;
    let secret = crate::features::a2a::security::generate_random_token(32);
    let folder = workspace
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| workspace.to_string_lossy().to_string());
    let mut notifications = host.subscribe();
    let mut relay = Relay {
        code_host: CodeHost::new(
            host,
            root_id(workspace),
            folder.clone(),
            workspace.to_string_lossy().to_string(),
        ),
        pairing,
        secret,
        dispatch: None,
        receipts: VecDeque::new(),
        receipt_keys: HashSet::new(),
        phone: None,
        status: Arc::clone(&status),
    };
    let payload = format!("agiw3:{}:{}", relay.pairing.code, relay.secret);
    status(RemoteControlStatus::Waiting {
        folder: folder.clone(),
        pairing_line: payload,
    });

    crate::device_registry::set_remote_control(true);
    let heartbeat = crate::device_registry::spawn_heartbeat_loop();
    let mut attempt: u32 = 0;
    let mut paired_end_sent = false;
    let result = loop {
        let socket = match or_stopped(&stop, connect(&relay.pairing.ws_url, &base)).await {
            Step::Stopped => break Ok(()),
            Step::Done(Ok(socket)) => socket,
            Step::Done(Err(error)) if attempt == 0 => break Err(error),
            Step::Done(Err(_)) => {
                attempt += 1;
                if let Step::Stopped = or_stopped(&stop, tokio::time::sleep(backoff(attempt))).await
                {
                    break Ok(());
                }
                continue;
            }
        };
        match relay.serve(&stop, socket, &mut notifications).await {
            SessionEnd::Stopped => {
                paired_end_sent = true;
                break Ok(());
            }
            SessionEnd::Ended(reason) => break Err(anyhow!("Remote Control stopped: {reason}")),
            SessionEnd::Dropped => {
                attempt += 1;
                relay.dispatch = None;
                relay.code_host.reset();
                status(RemoteControlStatus::Reconnecting);
                if let Step::Stopped = or_stopped(&stop, tokio::time::sleep(backoff(attempt))).await
                {
                    break Ok(());
                }
            }
        }
    };
    heartbeat.abort();
    crate::device_registry::set_remote_control(false);
    if result.is_ok() && !paired_end_sent {
        end_pairing(&relay.pairing, &base).await;
    }
    let _ = tokio::time::timeout(
        END_PAIRING_TIMEOUT,
        crate::device_registry::send_heartbeat(),
    )
    .await;
    status(RemoteControlStatus::Off);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    const PROMPT: Duration = Duration::from_millis(500);

    fn test_relay(
        workspace: &Path,
        store: &Path,
    ) -> Relay<crate::app_server::CliDeveloperSessionHost> {
        let host = crate::app_server::CliDeveloperSessionHost::new_with_store(
            crate::config::CliConfig::default(),
            workspace.to_path_buf(),
            crate::runtime::session_control::ManagedSessionStore::new(store.to_path_buf()),
            false,
        )
        .expect("host");
        Relay {
            code_host: CodeHost::new(
                Arc::new(host),
                "root".to_string(),
                "folder".to_string(),
                workspace.to_string_lossy().to_string(),
            ),
            pairing: Pairing {
                code: "ABCDEF123456".to_string(),
                ws_url: "ws://127.0.0.1".to_string(),
                pair_token: "a".repeat(64),
            },
            secret: "c".repeat(64),
            dispatch: None,
            receipts: VecDeque::new(),
            receipt_keys: HashSet::new(),
            phone: None,
            status: Arc::new(|_| {}),
        }
    }

    #[tokio::test]
    async fn serve_stops_before_peer_frames_after_invalid_registration() {
        let workspace = tempfile::tempdir().expect("workspace");
        let store = tempfile::tempdir().expect("store");
        let mut relay = test_relay(workspace.path(), store.path());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("listener");
        let address = listener.local_addr().expect("address");
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.expect("accept");
            let mut socket = tokio_tungstenite::accept_async(stream)
                .await
                .expect("handshake");
            while let Some(Ok(message)) = socket.next().await {
                let Message::Text(text) = message else {
                    continue;
                };
                if serde_json::from_str::<Value>(&text).expect("json")["type"] == "register" {
                    break;
                }
            }
            socket
                .send(Message::Text(
                    json!({ "type": "registered" }).to_string().into(),
                ))
                .await
                .expect("reply");
            socket
                .send(Message::Text(
                    json!({ "type": "peer_ready", "metadata": { "dispatchSalt": "valid-salt" } })
                        .to_string()
                        .into(),
                ))
                .await
                .expect("peer frame");
            tokio::time::sleep(Duration::from_millis(150)).await;
        });
        let socket = connect(&format!("ws://{address}/ws"), "http://127.0.0.1")
            .await
            .expect("connect");
        let (_stop_sender, stop) = tokio::sync::watch::channel(false);
        let (_notification_sender, mut notifications) = tokio::sync::broadcast::channel(1);
        let end = tokio::time::timeout(PROMPT, relay.serve(&stop, socket, &mut notifications))
            .await
            .expect("prompt termination");
        assert!(matches!(end, SessionEnd::Ended(_)));
        assert!(relay.dispatch.is_none());
        assert_eq!(relay.pairing.pair_token, "a".repeat(64));
        server.await.expect("server");
    }

    #[tokio::test]
    async fn registration_replaces_the_credential_used_by_reconnect() {
        let workspace = tempfile::tempdir().expect("workspace");
        let store = tempfile::tempdir().expect("store");
        let mut relay = test_relay(workspace.path(), store.path());
        let token = "b".repeat(64);
        let (_, end) = relay
            .on_frame(&json!({ "type": "registered", "pairToken": token }).to_string())
            .await
            .expect("frame");
        assert!(end.is_none());
        let Message::Text(frame) = register_frame(&relay.pairing) else {
            panic!("registration")
        };
        assert_eq!(
            serde_json::from_str::<Value>(&frame).expect("json")["pairToken"],
            token
        );
    }

    #[tokio::test]
    async fn invalid_registration_replacement_ends_the_session() {
        let workspace = tempfile::tempdir().expect("workspace");
        let store = tempfile::tempdir().expect("store");
        for token in [Value::Null, json!("short"), json!("A".repeat(64))] {
            let mut relay = test_relay(workspace.path(), store.path());
            let (_, end) = relay
                .on_frame(&json!({ "type": "registered", "pairToken": token }).to_string())
                .await
                .expect("frame");
            assert!(matches!(end, Some(SessionEnd::Ended(_))));
            assert_eq!(relay.pairing.pair_token, "a".repeat(64));
        }
    }

    fn cancel_soon() -> Stop {
        let (sender, receiver) = tokio::sync::watch::channel(false);
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(20)).await;
            let _ = sender.send(true);
        });
        receiver
    }

    #[tokio::test]
    async fn cancelling_during_the_reconnect_backoff_exits_at_once() {
        let stop = cancel_soon();
        let started = std::time::Instant::now();
        let step = or_stopped(&stop, tokio::time::sleep(RECONNECT_MAX)).await;
        assert!(matches!(step, Step::Stopped));
        assert!(started.elapsed() < PROMPT);
    }

    #[tokio::test]
    async fn cancelling_while_the_relay_never_answers_exits_at_once() {
        let stop = cancel_soon();
        let started = std::time::Instant::now();
        let step = or_stopped(&stop, std::future::pending::<Result<Socket>>()).await;
        assert!(matches!(step, Step::Stopped));
        assert!(started.elapsed() < PROMPT);
    }

    #[tokio::test]
    async fn a_stop_that_came_before_the_wait_is_not_lost() {
        let (sender, stop) = tokio::sync::watch::channel(false);
        sender.send(true).expect("receiver alive");
        let step = or_stopped(&stop, tokio::time::sleep(RECONNECT_MAX)).await;
        assert!(matches!(step, Step::Stopped));
    }

    #[tokio::test]
    async fn work_that_finishes_first_is_returned() {
        let (_sender, stop) = tokio::sync::watch::channel(false);
        let step = or_stopped(&stop, async { 7 }).await;
        assert!(matches!(step, Step::Done(7)));
    }
}
