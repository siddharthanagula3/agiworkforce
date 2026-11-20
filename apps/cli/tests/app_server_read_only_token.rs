use std::io::Read;
use std::process::{Child, Command, Output, Stdio};
use std::time::{Duration, Instant};
use tempfile::tempdir;

const RUN_LIMIT: Duration = Duration::from_secs(60);

/// A child that is killed and waited for when the guard drops, so a test
/// that panics while the child still runs leaves no process behind.
struct Reaped(Child);

impl Reaped {
    fn spawn(command: &mut Command) -> Self {
        Self(command.spawn().expect("spawn agi"))
    }
}

impl Drop for Reaped {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

fn read_all(mut pipe: impl Read + Send + 'static) -> std::thread::JoinHandle<Vec<u8>> {
    std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let _ = pipe.read_to_end(&mut bytes);
        bytes
    })
}

fn run_to_exit(command: &mut Command, limit: Duration) -> Output {
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = Reaped::spawn(command);
    let stdout = read_all(child.0.stdout.take().expect("stdout"));
    let stderr = read_all(child.0.stderr.take().expect("stderr"));
    let deadline = Instant::now() + limit;
    let status = loop {
        if let Some(status) = child.0.try_wait().expect("poll agi") {
            break status;
        }
        assert!(
            Instant::now() < deadline,
            "still running after {limit:?}: a misconfigured app-server exits instead of serving"
        );
        std::thread::sleep(Duration::from_millis(50));
    };
    Output {
        status,
        stdout: stdout.join().expect("stdout"),
        stderr: stderr.join().expect("stderr"),
    }
}

fn trust_workspace(workspace: &std::path::Path, home: &std::path::Path) {
    let output = run_to_exit(
        Command::new(env!("CARGO_BIN_EXE_agi"))
            .arg("init")
            .current_dir(workspace)
            .env("HOME", home)
            .env("AGIWORKFORCE_HOME", home.join(".agiworkforce"))
            .env("AGIWORKFORCE_NO_KEYRING", "1"),
        RUN_LIMIT,
    );
    assert!(
        output.status.success(),
        "agi init failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

fn available_loopback_port() -> u16 {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind temporary port");
    listener.local_addr().expect("temporary address").port()
}

fn start_with_query_tokens(read_only_token: Option<&str>) -> Output {
    let workspace = tempdir().expect("workspace");
    let home = tempdir().expect("home");
    trust_workspace(workspace.path(), home.path());
    let mut command = Command::new(env!("CARGO_BIN_EXE_agi"));
    command
        .arg("app-server")
        .arg("--listen")
        .arg(format!("127.0.0.1:{}", available_loopback_port()))
        .arg("--allow-query-token")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .env("AGIWORKFORCE_HOME", home.path().join(".agiworkforce"))
        .env("AGIWORKFORCE_NO_KEYRING", "1")
        .env("AGI_APP_SERVER_TOKEN", "owner-secret");
    match read_only_token {
        Some(token) => command.env("AGI_APP_SERVER_READ_ONLY_TOKEN", token),
        None => command.env_remove("AGI_APP_SERVER_READ_ONLY_TOKEN"),
    };
    run_to_exit(&mut command, RUN_LIMIT)
}

#[cfg(unix)]
#[test]
fn a_child_still_running_when_its_test_fails_is_killed_and_reaped() {
    let mut command = Command::new("sleep");
    command.arg("600");
    let started = Instant::now();
    let failed = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        run_to_exit(&mut command, Duration::from_millis(200))
    }));
    assert!(failed.is_err(), "the run outlived its limit");
    assert!(started.elapsed() < Duration::from_secs(30));
    let child = Reaped::spawn(Command::new("sleep").arg("600"));
    let pid = child.0.id().to_string();
    drop(child);
    let probe = Command::new("kill")
        .args(["-0", &pid])
        .stderr(Stdio::null())
        .status()
        .expect("probe pid");
    assert!(!probe.success(), "sleep {pid} outlived its guard");
}

#[test]
fn query_tokens_need_a_read_only_credential_of_their_own() {
    let output = start_with_query_tokens(None);
    assert!(!output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.contains("requires AGI_APP_SERVER_READ_ONLY_TOKEN"),
        "{stderr}"
    );
    assert!(!stderr.contains("owner-secret"), "{stderr}");
}

#[test]
fn the_owner_token_cannot_double_as_the_read_only_credential() {
    let output = start_with_query_tokens(Some("owner-secret"));
    assert!(!output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("must differ"), "{stderr}");
    assert!(!stderr.contains("owner-secret"), "{stderr}");
}
