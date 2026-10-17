use anyhow::{Context, Result};
#[cfg(unix)]
use std::collections::HashMap;
use std::future::Future;
use std::path::PathBuf;
#[cfg(unix)]
use std::sync::Arc;
#[cfg(unix)]
use std::time::Duration;

#[cfg(unix)]
use crate::path_security::WorkspaceFileAuthority;
#[cfg(unix)]
use crate::platform::policy::{PolicyDecision, PolicyEngine};
#[cfg(unix)]
use crate::tools::ApprovalCallback;
#[cfg(unix)]
use crate::tui::approval_broker::{ApprovalRequest, ApprovalRequestKind};

pub(crate) const HELPER_COMMAND: &str = "--internal-browser-open";
const SOCKET_ENV: &str = "AGI_SESSION_BROWSER_SOCKET";
#[cfg(unix)]
const MAX_FRAME: u64 = 16 * 1024;
#[cfg(unix)]
const DEADLINE: Duration = Duration::from_secs(120);

#[derive(Clone)]
pub(crate) struct BrowserEnvironment {
    pub directory: PathBuf,
    pub executable: PathBuf,
    pub socket: PathBuf,
}

tokio::task_local! {
    static ENVIRONMENT: Option<BrowserEnvironment>;
}

pub(crate) async fn scope<F: Future>(
    environment: Option<BrowserEnvironment>,
    future: F,
) -> F::Output {
    ENVIRONMENT.scope(environment, future).await
}

pub(crate) fn apply_environment(command: &mut tokio::process::Command) {
    if let Ok(environment) = ENVIRONMENT.try_with(Clone::clone) {
        command.env_remove("BROWSER").env_remove(SOCKET_ENV);
        if let Some(environment) = environment {
            command.env("BROWSER", environment.directory.join("open"));
            command.env(SOCKET_ENV, environment.socket);
        }
    }
}

pub(crate) fn restrict_launch(args: &mut Vec<String>, seatbelt: bool) -> Result<()> {
    let Some(environment) = ENVIRONMENT.try_with(Clone::clone).ok().flatten() else {
        return Ok(());
    };
    let relay = agiworkforce_sandbox_policy::relay::LocalRelay::new(
        &environment.directory,
        &environment.socket,
        &environment.executable,
    )
    .map_err(anyhow::Error::msg)?;
    if seatbelt {
        anyhow::ensure!(
            args.first().is_some_and(|arg| arg == "-p") && args.len() > 1,
            "sandbox profile argument is missing"
        );
        args[1].push_str(&relay.seatbelt_rules().map_err(anyhow::Error::msg)?);
    } else {
        let at = args
            .iter()
            .position(|arg| arg == "--")
            .context("sandbox argument boundary is missing")?;
        args.splice(
            at..at,
            relay.bubblewrap_bindings().map_err(anyhow::Error::msg)?,
        );
    }
    Ok(())
}

pub(crate) fn extend_profile(profile: &mut String) -> Result<()> {
    let Some(environment) = ENVIRONMENT.try_with(Clone::clone).ok().flatten() else {
        return Ok(());
    };
    let relay = agiworkforce_sandbox_policy::relay::LocalRelay::new(
        &environment.directory,
        &environment.socket,
        &environment.executable,
    )
    .map_err(anyhow::Error::msg)?;
    profile.push_str(&relay.seatbelt_rules().map_err(anyhow::Error::msg)?);
    Ok(())
}

#[cfg(unix)]
pub(crate) struct BrowserAuthority {
    pub workspace: WorkspaceFileAuthority,
    pub session_id: String,
    pub allowed_tools: Option<Vec<String>>,
    pub disallowed_tools: Vec<String>,
    pub approval: ApprovalCallback,
    pub active: Arc<std::sync::atomic::AtomicBool>,
}

#[cfg(unix)]
impl BrowserAuthority {
    fn validate(&self, url: &str) -> Result<()> {
        anyhow::ensure!(
            self.active.load(std::sync::atomic::Ordering::Acquire),
            "browser session owner has ended"
        );
        validate_url(url)?;
        self.workspace.identity()?;
        crate::tool_filters::ensure_tool_call_allowed(
            "browser_navigate",
            &HashMap::from([("url".into(), url.into())]),
            self.allowed_tools.as_deref(),
            &self.disallowed_tools,
        )
        .map_err(|error| anyhow::anyhow!(error.reason))?;
        let policy = PolicyEngine::load_workspace(self.workspace.root())?;
        anyhow::ensure!(
            policy.evaluate("browser_navigate", url) != PolicyDecision::Deny,
            "workspace policy refuses browser opening"
        );
        if let Some(reason) = crate::permissions::url_blocked_by_domain_rule(url) {
            anyhow::bail!(reason);
        }
        Ok(())
    }

    async fn open(&self, url: &str) -> Result<serde_json::Value> {
        self.validate(url)?;
        if let Some(reason) = crate::tools::browser_site_refusal(url).await {
            anyhow::bail!(reason);
        }
        let request = ApprovalRequest::new(ApprovalRequestKind::Network {
            tool_name: "browser_navigate".into(), destination: url.into(),
        }, "Open a new browser tab using your browser profile and cookies?", vec![format!("Address: {url}"),
            "If the paired browser is unavailable, Desktop asks before opening the default browser. Opening does not prove page load or login completion.".into()])
            .with_tool_subject("browser_navigate", serde_json::json!({"url": url, "newTab": true}));
        let decision = crate::tools::request_approval(Some(&self.approval), request).await;
        anyhow::ensure!(
            decision.is_some_and(crate::tools::approval_allows),
            "browser opening was not approved"
        );
        self.validate(url)?;
        if let Some(reason) = crate::tools::browser_site_refusal(url).await {
            anyhow::bail!(reason);
        }
        let operation = crate::browser_bridge::run_command(
            "browser_open_tab",
            serde_json::json!({"url": url}),
            crate::browser_bridge::ClientIdentity {
                name: format!("agi session {}", self.session_id),
                cwd: Some(self.workspace.root().display().to_string()),
                thread_id: Some(self.session_id.clone()),
            },
        );
        tokio::pin!(operation);
        let mut guard = tokio::time::interval(Duration::from_secs(1));
        loop {
            tokio::select! {
                result = &mut operation => return result.map_err(|error| anyhow::anyhow!(error.user_message())),
                _ = guard.tick() => {
                    self.validate(url)?;
                    if let Some(reason) = crate::tools::browser_site_refusal(url).await { anyhow::bail!(reason); }
                },
            }
        }
    }
}

#[cfg(any(unix, test))]
fn validate_url(url: &str) -> Result<()> {
    anyhow::ensure!(
        url.len() <= 8192 && !url.chars().any(char::is_control),
        "browser address exceeds its input bounds"
    );
    let parsed = reqwest::Url::parse(url)?;
    anyhow::ensure!(
        matches!(parsed.scheme(), "http" | "https")
            && parsed.host_str().is_some()
            && parsed.username().is_empty()
            && parsed.password().is_none(),
        "only HTTP addresses without credentials may be opened"
    );
    Ok(())
}

#[cfg(unix)]
pub(crate) struct BrowserScope {
    pub environment: BrowserEnvironment,
    worker: tokio::task::JoinHandle<()>,
    active: Arc<std::sync::atomic::AtomicBool>,
    _directory: tempfile::TempDir,
}

#[cfg(unix)]
impl BrowserScope {
    pub fn start(authority: BrowserAuthority) -> Result<Self> {
        use std::os::unix::fs::PermissionsExt;
        let directory = tempfile::Builder::new()
            .prefix("agi-browser-")
            .tempdir_in("/tmp")?;
        let path = directory.path().canonicalize()?;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700))?;
        let executable = std::env::current_exe()?.canonicalize()?;
        let helper = path.join("open");
        std::fs::write(
            &helper,
            format!(
                "#!/bin/sh\nexec {} {} \"$@\"\n",
                crate::sandbox::shell_quote(&executable.to_string_lossy()),
                HELPER_COMMAND
            ),
        )?;
        std::fs::set_permissions(helper, std::fs::Permissions::from_mode(0o500))?;
        let socket = path.join("socket");
        let listener = tokio::net::UnixListener::bind(&socket)?;
        std::fs::set_permissions(&socket, std::fs::Permissions::from_mode(0o600))?;
        let active = authority.active.clone();
        let authority = Arc::new(authority);
        let process_owner = crate::process_tree::current_owner();
        let worker = tokio::spawn(async move {
            let mut requests = tokio::task::JoinSet::new();
            loop {
                tokio::select! {
                    accepted = listener.accept() => {
                        let Ok((stream, _)) = accepted else { break };
                        if requests.len() >= 4 { drop(stream); continue; }
                        let authority = authority.clone();
                        requests.spawn(async move {
                            let request = async move {
                                let _ = tokio::time::timeout(DEADLINE, serve(stream, authority)).await;
                            };
                            match process_owner {
                                Some(owner) => crate::process_tree::scope(owner, request).await,
                                None => request.await,
                            }
                        });
                    }
                    _ = requests.join_next(), if !requests.is_empty() => {}
                }
            }
        });
        Ok(Self {
            environment: BrowserEnvironment {
                directory: path,
                executable,
                socket,
            },
            worker,
            active,
            _directory: directory,
        })
    }
}

#[cfg(unix)]
impl Drop for BrowserScope {
    fn drop(&mut self) {
        self.active
            .store(false, std::sync::atomic::Ordering::Release);
        self.worker.abort();
    }
}

#[cfg(unix)]
async fn serve(stream: tokio::net::UnixStream, authority: Arc<BrowserAuthority>) -> Result<()> {
    use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
    let (read, mut write) = stream.into_split();
    let mut reader = BufReader::new(read.take(MAX_FRAME));
    let mut line = Vec::new();
    reader.read_until(b'\n', &mut line).await?;
    anyhow::ensure!(
        line.len() < MAX_FRAME as usize && line.last() == Some(&b'\n'),
        "invalid browser request frame"
    );
    let url: String = serde_json::from_slice(&line)?;
    let mut retired = [0u8; 1];
    let result = tokio::select! {
        _ = reader.read(&mut retired) => return Ok(()),
        result = authority.open(&url) => result,
    };
    let receipt = match result {
        Ok(value) => serde_json::json!({"ok": true, "value": value}),
        Err(error) => serde_json::json!({"ok": false, "error": error.to_string()}),
    };
    write.write_all(format!("{receipt}\n").as_bytes()).await?;
    Ok(())
}

pub(crate) fn run_helper(args: &[String]) -> std::process::ExitCode {
    #[cfg(unix)]
    let result = (|| -> Result<()> {
        use std::io::{BufRead, Read, Write};
        anyhow::ensure!(args.len() == 1, "browser opening needs exactly one address");
        validate_url(&args[0])?;
        let socket = std::env::var_os(SOCKET_ENV)
            .context("this browser request has no active session owner")?;
        let mut stream = std::os::unix::net::UnixStream::connect(socket)?;
        stream.set_read_timeout(Some(DEADLINE))?;
        stream.set_write_timeout(Some(Duration::from_secs(5)))?;
        writeln!(stream, "{}", serde_json::to_string(&args[0])?)?;
        let mut line = Vec::new();
        std::io::BufReader::new(stream.take(MAX_FRAME)).read_until(b'\n', &mut line)?;
        anyhow::ensure!(
            line.len() < MAX_FRAME as usize && line.last() == Some(&b'\n'),
            "browser owner did not provide a bounded receipt"
        );
        let receipt: serde_json::Value = serde_json::from_slice(&line)?;
        anyhow::ensure!(
            receipt["ok"] == true,
            "{}",
            receipt["error"]
                .as_str()
                .unwrap_or("browser request failed")
        );
        println!("{}", receipt["value"]);
        Ok(())
    })();
    #[cfg(not(unix))]
    let result: Result<()> = {
        let _ = args;
        Err(anyhow::anyhow!(
            "session browser relay is unavailable on this platform"
        ))
    };
    match result {
        Ok(()) => std::process::ExitCode::SUCCESS,
        Err(error) => {
            eprintln!(
                "{}",
                crate::terminal_text::sanitize_terminal_text(&error.to_string())
            );
            std::process::ExitCode::FAILURE
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn addresses_are_bounded_and_cannot_select_an_os_handler_or_credentials() {
        assert!(validate_url("https://example.test/path?q=ok").is_ok());
        for url in [
            "file:///etc/passwd",
            "vscode://task/run",
            "https://u:p@example.test",
            "https://example.test/\n",
        ] {
            assert!(validate_url(url).is_err(), "{url}");
        }
        assert!(validate_url(&format!("https://example.test/{}", "a".repeat(8192))).is_err());
    }

    #[cfg(unix)]
    fn owned_browser(root: &std::path::Path) -> BrowserScope {
        BrowserScope::start(BrowserAuthority {
            workspace: WorkspaceFileAuthority::new(root).expect("workspace authority"),
            session_id: "owned-test".into(),
            allowed_tools: None,
            disallowed_tools: vec![],
            approval: Arc::new(|_| {
                Box::pin(async { crate::tui::approval_broker::ApprovalDecision::Deny })
            }),
            active: Arc::new(std::sync::atomic::AtomicBool::new(true)),
        })
        .expect("browser scope")
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn two_scopes_have_distinct_endpoints_and_retired_owners_cannot_be_replayed() {
        use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
        let root = tempfile::tempdir().unwrap();
        let first = owned_browser(root.path());
        let second = owned_browser(root.path());
        assert_ne!(first.environment.socket, second.environment.socket);
        let first_path = first.environment.socket.clone();
        let first_active = first.active.clone();
        drop(first);
        assert!(!first_active.load(std::sync::atomic::Ordering::Acquire));
        assert!(tokio::net::UnixStream::connect(first_path).await.is_err());
        let mut stream = tokio::net::UnixStream::connect(&second.environment.socket)
            .await
            .unwrap();
        stream.write_all(b"\"file:///denied\"\n").await.unwrap();
        let mut answer = String::new();
        BufReader::new(stream).read_line(&mut answer).await.unwrap();
        let answer: serde_json::Value = serde_json::from_str(&answer).unwrap();
        assert_eq!(answer["ok"], false);
        assert!(answer["error"].as_str().unwrap().contains("HTTP addresses"));
    }

    #[cfg(target_os = "macos")]
    #[tokio::test]
    async fn denied_network_sandbox_can_only_reach_its_exact_browser_socket() {
        let root = tempfile::tempdir().unwrap();
        let browser = owned_browser(root.path());
        let other = owned_browser(root.path());
        let manager = crate::sandbox::SandboxManager::new(
            agiworkforce_sandbox_policy::SandboxPolicy::ReadOnly,
            root.path().to_path_buf(),
        )
        .with_network(agiworkforce_sandbox_policy::NetworkPolicy::Deny);
        let program = "/usr/bin/perl";
        let script = r#"use IO::Socket::UNIX; my $s=IO::Socket::UNIX->new(Type=>SOCK_STREAM,Peer=>$ARGV[0]) or die $!; $s->autoflush(1); print $s qq(\"file:///denied\"\n); print scalar <$s>;"#;
        scope(Some(browser.environment.clone()), async {
            for (socket, allowed) in [(&browser.environment.socket, true), (&other.environment.socket, false)] {
                let args = vec!["-e".into(), script.into(), socket.display().to_string()];
                let launch = crate::sandbox::sandboxed_program(&manager, program, &args).unwrap();
                let output = tokio::process::Command::new(&launch.program).args(&launch.args).output().await.unwrap();
                assert_eq!(output.status.success(), allowed, "{}", String::from_utf8_lossy(&output.stderr));
                if allowed { assert!(String::from_utf8_lossy(&output.stdout).contains("HTTP addresses")); }
            }
            let args = vec!["-MIO::Socket::INET".into(), "-e".into(),
                "IO::Socket::INET->new(PeerAddr=>'127.0.0.1',PeerPort=>$ARGV[0],Timeout=>1) or die $!".into()];
            let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            let mut args = args;
            args.push(listener.local_addr().unwrap().port().to_string());
            let launch = crate::sandbox::sandboxed_program(&manager, program, &args).unwrap();
            let output = tokio::process::Command::new(&launch.program).args(&launch.args).output().await.unwrap();
            assert!(!output.status.success(), "browser relay widened TCP access");
        }).await;
    }
}
