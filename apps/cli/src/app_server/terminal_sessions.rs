//! Interactive terminals for a person typing into a client: a login shell on a
//! pseudo-terminal, run under the sandbox the host applies to commands in the
//! folder.
//!
//! These are client requests only. Nothing here is registered with the agent
//! (`crate::terminals`' background-command table, the tool catalog), so no
//! agent tool can list, read or type into one.

use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex as StdMutex, MutexGuard};
use std::time::Duration;

use agiworkforce_app_server::{DeveloperSessionHostError, TerminalEvents};
use agiworkforce_protocol::developer_session::{
    method, AppServerNotification, TerminalExitedNotification, TerminalOutputNotification,
    TERMINAL_CHUNK_MAX_BYTES,
};
use tokio::sync::{mpsc, watch};
use tokio::time::Instant;

use crate::process_tree::{await_process_groups_reaped, DetachedProcessTree};
use crate::sandbox::{Invocation, NetworkPolicy, SandboxManager, SandboxPolicy};
use crate::terminals::{resize_pty, spawn_interactive, PreparedCommand};

pub(super) const MAX_OPEN_TERMINALS: usize = 8;

const READ_BYTES: usize = 16 * 1024;
const QUEUED_READS: usize = 8;
const EMIT_INTERVAL: Duration = Duration::from_millis(20);
const WRITE_TIMEOUT: Duration = Duration::from_secs(5);
const REAP_TIMEOUT: Duration = Duration::from_secs(5);
const DRAIN_AFTER_EXIT: Duration = Duration::from_secs(1);
const HANGUP_GRACE: Duration = Duration::from_millis(1500);
const LOGIN_SHELLS: [&str; 2] = ["/bin/zsh", "/bin/sh"];

type ExitCode = Option<i32>;

#[derive(Default)]
pub(super) struct Terminals {
    open: Arc<StdMutex<HashMap<String, Arc<Terminal>>>>,
}

struct Terminal {
    master: Arc<File>,
    write_turn: tokio::sync::Mutex<()>,
    process_id: u32,
    device: PathBuf,
    exit: watch::Receiver<Option<ExitCode>>,
    _registration: DetachedProcessTree,
}

/// Where a terminal starts and what it runs as.
pub(super) struct Launch {
    cwd: PathBuf,
    shell: PathBuf,
    manager: SandboxManager,
}

fn lock<T>(mutex: &StdMutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn signal_group(process_id: u32, signal: nix::sys::signal::Signal) {
    if let Ok(process_id) = i32::try_from(process_id) {
        let _ = nix::sys::signal::killpg(nix::unistd::Pid::from_raw(process_id), signal);
    }
}

/// Signal every process whose controlling terminal is `device`. A job control
/// shell starts each job in a group of its own, and a sandboxed shell may
/// signal nobody but itself, so neither a signal to the shell's group nor the
/// shell can reach a job started with `&`; the terminal is what they share,
/// until its session leader goes.
async fn signal_terminal(device: &Path, signal: nix::sys::signal::Signal) {
    const PS: [&str; 2] = ["/bin/ps", "/usr/bin/ps"];
    let Some(terminal) = device
        .strip_prefix("/dev")
        .ok()
        .and_then(Path::to_str)
        .map(|terminal| terminal.trim_start_matches('/'))
    else {
        return;
    };
    let Some(ps) = PS.into_iter().find(|ps| Path::new(ps).is_file()) else {
        tracing::warn!("jobs a terminal's shell started in the background may outlive it");
        return;
    };
    match tokio::process::Command::new(ps)
        .args(["-t", terminal, "-o", "pid="])
        .stdin(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .output()
        .await
    {
        Ok(listing) => {
            for process_id in String::from_utf8_lossy(&listing.stdout)
                .split_whitespace()
                .filter_map(|pid| pid.parse::<i32>().ok())
                .filter(|pid| *pid > 1)
            {
                let _ = nix::sys::signal::kill(nix::unistd::Pid::from_raw(process_id), signal);
            }
        }
        Err(error) => {
            tracing::warn!(%error, "jobs a terminal's shell started in the background may outlive it");
        }
    }
}

/// The user's login shell, or the first system shell there is.
fn login_shell(configured: Option<&str>) -> Option<PathBuf> {
    use std::os::unix::fs::PermissionsExt;

    configured
        .into_iter()
        .chain(LOGIN_SHELLS)
        .map(Path::new)
        .find(|shell| {
            shell.is_absolute()
                && shell.metadata().is_ok_and(|metadata| {
                    metadata.is_file() && metadata.permissions().mode() & 0o111 != 0
                })
        })
        .map(Path::to_path_buf)
}

impl Launch {
    /// A terminal in `cwd`, a folder already resolved and inside
    /// `workspace_root`, which must be trusted. The sandbox is the one an
    /// agent command in the workspace gets, with the network denied; where
    /// none is available this refuses rather than start an unsandboxed shell.
    pub(super) fn for_workspace(
        workspace_root: &Path,
        cwd: PathBuf,
    ) -> Result<Self, DeveloperSessionHostError> {
        if !cwd.starts_with(workspace_root) {
            return Err(DeveloperSessionHostError::invalid_request(format!(
                "A terminal opens inside {}, not in {}",
                workspace_root.display(),
                cwd.display()
            )));
        }
        if !crate::trust::is_trusted(workspace_root) {
            return Err(DeveloperSessionHostError::conflict(format!(
                "{} is not a trusted folder, so no terminal opens in it",
                workspace_root.display()
            )));
        }
        let manager = if crate::sandbox::sandbox_disabled_for_workspace(workspace_root) {
            SandboxManager::new(
                SandboxPolicy::DangerFullAccess,
                workspace_root.to_path_buf(),
            )
            .with_network(NetworkPolicy::Allow)
        } else {
            SandboxManager::for_agent_command(workspace_root.to_path_buf(), NetworkPolicy::Deny)
                .map_err(|error| DeveloperSessionHostError::unavailable(format!("{error:#}")))?
        };
        let shell = login_shell(std::env::var("SHELL").ok().as_deref()).ok_or_else(|| {
            DeveloperSessionHostError::unavailable("No login shell was found on this machine")
        })?;
        Ok(Self {
            cwd,
            shell,
            manager,
        })
    }

    fn prepare(&self, terminal: Option<&Path>) -> anyhow::Result<PreparedCommand> {
        let shell = self.shell.to_string_lossy();
        crate::sandbox::background_command(
            Some(&self.manager),
            Invocation::Program {
                program: &shell,
                args: &["-l".to_string()],
            },
            &self.cwd,
            terminal,
        )
    }
}

impl Terminals {
    pub(super) fn open(
        &self,
        terminal_id: String,
        rows: u16,
        columns: u16,
        launch: &Launch,
        events: TerminalEvents,
    ) -> Result<(), DeveloperSessionHostError> {
        self.open_with(terminal_id, rows, columns, events, |terminal| {
            launch.prepare(terminal)
        })
    }

    fn open_with(
        &self,
        terminal_id: String,
        rows: u16,
        columns: u16,
        events: TerminalEvents,
        build: impl FnOnce(Option<&Path>) -> anyhow::Result<PreparedCommand>,
    ) -> Result<(), DeveloperSessionHostError> {
        if rows == 0 || columns == 0 {
            return Err(DeveloperSessionHostError::invalid_request(
                "A terminal has at least one row and one column",
            ));
        }
        let mut open = lock(&self.open);
        if open.len() >= MAX_OPEN_TERMINALS {
            return Err(DeveloperSessionHostError::conflict(format!(
                "At most {MAX_OPEN_TERMINALS} terminals can be open at once; close one first"
            )));
        }
        if open.contains_key(&terminal_id) {
            return Err(DeveloperSessionHostError::conflict(format!(
                "Terminal {terminal_id} is already open"
            )));
        }
        let pty = spawn_interactive(rows, columns, build)
            .map_err(|error| DeveloperSessionHostError::unavailable(format!("{error:#}")))?;
        let process_id = pty.child.id();
        let registration = DetachedProcessTree::track(Some(process_id));
        let (exit_sender, exit) = watch::channel(None);
        let (chunks, queued) = mpsc::channel(QUEUED_READS);

        let mut reader = pty.reader;
        std::thread::spawn(move || {
            let mut buffer = vec![0u8; READ_BYTES];
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) => break,
                    Ok(read) => {
                        if chunks.blocking_send(buffer[..read].to_vec()).is_err() {
                            break;
                        }
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::Interrupted => {}
                    Err(_) => break,
                }
            }
        });

        let mut child = pty.child;
        let scratch = pty.scratch;
        std::thread::spawn(move || {
            let code = child.wait().ok().and_then(|status| status.code());
            signal_group(process_id, nix::sys::signal::Signal::SIGKILL);
            drop(scratch);
            exit_sender.send_replace(Some(code));
        });

        let terminal = Arc::new(Terminal {
            master: Arc::new(pty.master),
            write_turn: tokio::sync::Mutex::new(()),
            process_id,
            device: pty.device,
            exit,
            _registration: registration,
        });
        open.insert(terminal_id.clone(), Arc::clone(&terminal));
        drop(open);

        tokio::spawn(pump(
            terminal_id,
            terminal,
            queued,
            events,
            Arc::clone(&self.open),
        ));
        Ok(())
    }

    #[cfg(test)]
    pub(super) fn open_count(&self) -> usize {
        lock(&self.open).len()
    }

    fn get(&self, terminal_id: &str) -> Result<Arc<Terminal>, DeveloperSessionHostError> {
        lock(&self.open).get(terminal_id).cloned().ok_or_else(|| {
            DeveloperSessionHostError::not_found(format!("No terminal {terminal_id} is open"))
        })
    }

    pub(super) async fn write(
        &self,
        terminal_id: &str,
        data: &str,
    ) -> Result<(), DeveloperSessionHostError> {
        if data.len() > TERMINAL_CHUNK_MAX_BYTES {
            return Err(DeveloperSessionHostError::invalid_request(format!(
                "A terminal takes at most {TERMINAL_CHUNK_MAX_BYTES} bytes at a time"
            )));
        }
        let terminal = self.get(terminal_id)?;
        if terminal.exit.borrow().is_some() {
            return Err(DeveloperSessionHostError::conflict(format!(
                "Terminal {terminal_id} has ended"
            )));
        }
        let _turn = terminal.write_turn.lock().await;
        let master = Arc::clone(&terminal.master);
        let bytes = data.as_bytes().to_vec();
        let written = tokio::task::spawn_blocking(move || (&*master).write_all(&bytes));
        match tokio::time::timeout(WRITE_TIMEOUT, written).await {
            Ok(Ok(Ok(()))) => Ok(()),
            Ok(Ok(Err(error))) => Err(DeveloperSessionHostError::unavailable(format!(
                "Terminal {terminal_id} did not take the input: {error}"
            ))),
            Ok(Err(error)) => Err(DeveloperSessionHostError::internal(error.to_string())),
            Err(_) => Err(DeveloperSessionHostError::unavailable(format!(
                "Terminal {terminal_id} is not reading its input"
            ))),
        }
    }

    pub(super) fn resize(
        &self,
        terminal_id: &str,
        rows: u16,
        columns: u16,
    ) -> Result<(), DeveloperSessionHostError> {
        if rows == 0 || columns == 0 {
            return Err(DeveloperSessionHostError::invalid_request(
                "A terminal has at least one row and one column",
            ));
        }
        let terminal = self.get(terminal_id)?;
        resize_pty(&terminal.master, rows, columns)
            .map_err(|error| DeveloperSessionHostError::unavailable(error.to_string()))
    }

    pub(super) async fn close(&self, terminal_id: &str) -> Result<(), DeveloperSessionHostError> {
        let terminal = self.get(terminal_id)?;
        terminal.end().await?;
        lock(&self.open).remove(terminal_id);
        Ok(())
    }

    /// End every terminal and wait until their processes are gone.
    pub(super) async fn shutdown(&self) -> Result<(), DeveloperSessionHostError> {
        let terminals: Vec<Arc<Terminal>> = lock(&self.open).values().cloned().collect();
        for terminal in &terminals {
            terminal.hang_up().await;
        }
        let grace_ends = Instant::now() + HANGUP_GRACE;
        let mut first_error = None;
        for terminal in &terminals {
            if let Err(error) = terminal.end_by(grace_ends).await {
                first_error.get_or_insert(error);
            }
        }
        lock(&self.open).clear();
        first_error.map_or(Ok(()), Err)
    }
}

impl Terminal {
    fn signal(&self, signal: nix::sys::signal::Signal) {
        if self.exit.borrow().is_none() {
            signal_group(self.process_id, signal);
        }
    }

    fn is_running(&self) -> bool {
        self.exit.borrow().is_none()
    }

    /// What closing a terminal window does: everything on the terminal is
    /// hung up on.
    async fn hang_up(&self) {
        if self.is_running() {
            signal_terminal(&self.device, nix::sys::signal::Signal::SIGHUP).await;
            self.signal(nix::sys::signal::Signal::SIGHUP);
        }
    }

    async fn end(&self) -> Result<(), DeveloperSessionHostError> {
        self.hang_up().await;
        self.end_by(Instant::now() + HANGUP_GRACE).await
    }

    /// Wait for the shell to leave until `grace_ends`, kill it and what is
    /// still on its terminal if it has not, and wait until its group is gone.
    async fn end_by(&self, grace_ends: Instant) -> Result<(), DeveloperSessionHostError> {
        let mut exit = self.exit.clone();
        if tokio::time::timeout_at(grace_ends, exit.wait_for(Option::is_some))
            .await
            .is_err()
        {
            signal_terminal(&self.device, nix::sys::signal::Signal::SIGKILL).await;
            self.signal(nix::sys::signal::Signal::SIGKILL);
        }
        self.reaped().await
    }

    async fn reaped(&self) -> Result<(), DeveloperSessionHostError> {
        let deadline = Instant::now() + REAP_TIMEOUT;
        let mut exit = self.exit.clone();
        let unreaped = |what: &str| {
            DeveloperSessionHostError::internal(format!(
                "A terminal's {what} did not end within {} seconds",
                REAP_TIMEOUT.as_secs()
            ))
        };
        match tokio::time::timeout_at(deadline, exit.wait_for(Option::is_some)).await {
            Ok(Ok(_)) => {}
            _ => return Err(unreaped("shell")),
        }
        await_process_groups_reaped(&HashSet::from([self.process_id]), deadline)
            .await
            .map_err(|_| unreaped("processes"))
    }
}

async fn pump(
    terminal_id: String,
    terminal: Arc<Terminal>,
    mut queued: mpsc::Receiver<Vec<u8>>,
    events: TerminalEvents,
    open: Arc<StdMutex<HashMap<String, Arc<Terminal>>>>,
) {
    let mut exit = terminal.exit.clone();
    let mut text = Utf8Stream::default();
    let mut pending = Vec::new();
    let mut drain_until: Option<Instant> = None;
    let mut connected = true;
    let output = |data: String| TerminalOutputNotification {
        terminal_id: terminal_id.clone(),
        data,
    };
    while connected {
        let drain_deadline = drain_until;
        let drained = async move {
            match drain_deadline {
                Some(until) => tokio::time::sleep_until(until).await,
                None => std::future::pending().await,
            }
        };
        let exited = async { exit.wait_for(|code| code.is_some()).await.is_ok() };
        tokio::select! {
            read = queued.recv() => {
                let Some(first) = read else { break };
                pending.extend(first);
                while pending.len() < TERMINAL_CHUNK_MAX_BYTES {
                    match queued.try_recv() {
                        Ok(more) => pending.extend(more),
                        Err(_) => break,
                    }
                }
                for chunk in text.decode(&std::mem::take(&mut pending)) {
                    connected &= send(&events, method::TERMINAL_OUTPUT, &output(chunk)).await;
                }
                tokio::time::sleep(EMIT_INTERVAL).await;
            }
            true = exited, if drain_until.is_none() => {
                drain_until = Some(Instant::now() + DRAIN_AFTER_EXIT);
            }
            () = drained => break,
        }
    }
    if connected {
        for chunk in text.finish() {
            connected &= send(&events, method::TERMINAL_OUTPUT, &output(chunk)).await;
        }
    }
    if !connected {
        let _ = terminal.end().await;
    }
    let code = match exit.wait_for(|code| code.is_some()).await {
        Ok(code) => (*code).flatten(),
        Err(_) => None,
    };
    lock(&open).remove(&terminal_id);
    if connected {
        send(
            &events,
            method::TERMINAL_EXITED,
            &TerminalExitedNotification {
                terminal_id: terminal_id.clone(),
                code,
            },
        )
        .await;
    }
}

/// Hand one notification to the connection, waiting while it is full.
/// `false` once the connection is gone.
async fn send(events: &TerminalEvents, name: &str, params: &impl serde::Serialize) -> bool {
    match AppServerNotification::new(name, params) {
        Ok(notification) => events.send(notification).await.is_ok(),
        Err(_) => true,
    }
}

/// Bytes from a terminal as UTF-8 text in chunks of at most
/// [`TERMINAL_CHUNK_MAX_BYTES`], holding back the start of a character a read
/// ended inside. Undecodable bytes become U+FFFD.
#[derive(Default)]
struct Utf8Stream {
    unfinished: Vec<u8>,
}

impl Utf8Stream {
    fn decode(&mut self, bytes: &[u8]) -> Vec<String> {
        self.unfinished.extend_from_slice(bytes);
        let whole = self.unfinished.len() - unfinished_tail(&self.unfinished);
        let tail = self.unfinished.split_off(whole);
        let text = String::from_utf8_lossy(&self.unfinished).into_owned();
        self.unfinished = tail;
        split_text(text)
    }

    fn finish(&mut self) -> Vec<String> {
        let text = String::from_utf8_lossy(&std::mem::take(&mut self.unfinished)).into_owned();
        split_text(text)
    }
}

/// How many bytes at the end of `bytes` begin a UTF-8 character the bytes
/// do not complete.
fn unfinished_tail(bytes: &[u8]) -> usize {
    for back in 1..=bytes.len().min(3) {
        let byte = bytes[bytes.len() - back];
        if byte & 0xC0 == 0x80 {
            continue;
        }
        let length = match byte {
            0xF0.. => 4,
            0xE0.. => 3,
            0xC0.. => 2,
            _ => 1,
        };
        return if length > back { back } else { 0 };
    }
    0
}

fn split_text(mut text: String) -> Vec<String> {
    let mut chunks = Vec::new();
    while text.len() > TERMINAL_CHUNK_MAX_BYTES {
        let mut at = TERMINAL_CHUNK_MAX_BYTES;
        while !text.is_char_boundary(at) {
            at -= 1;
        }
        let rest = text.split_off(at);
        chunks.push(std::mem::replace(&mut text, rest));
    }
    if !text.is_empty() {
        chunks.push(text);
    }
    chunks
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chunks_of(bytes: &[u8]) -> Vec<String> {
        Utf8Stream::default().decode(bytes)
    }

    #[test]
    fn a_character_split_across_reads_is_not_replaced() {
        let snowman = "\u{2603}".as_bytes();
        let mut stream = Utf8Stream::default();
        let mut text = String::new();
        for part in [
            &b"a"[..],
            &snowman[..1],
            &snowman[1..2],
            &snowman[2..],
            b"b",
        ] {
            text.extend(stream.decode(part));
        }
        text.extend(stream.finish());
        assert_eq!(text, "a\u{2603}b");
    }

    #[test]
    fn undecodable_bytes_are_replaced_and_a_cut_off_character_is_flushed_at_the_end() {
        assert_eq!(chunks_of(b"x\xFFy"), ["x\u{FFFD}y"]);
        let mut stream = Utf8Stream::default();
        assert!(stream.decode(&"\u{2603}".as_bytes()[..2]).is_empty());
        assert_eq!(stream.finish(), ["\u{FFFD}"]);
    }

    #[test]
    fn a_chunk_never_exceeds_the_limit_or_splits_a_character() {
        let text = "\u{2603}".repeat(TERMINAL_CHUNK_MAX_BYTES);
        let chunks = chunks_of(text.as_bytes());
        assert!(chunks.len() > 1);
        assert!(chunks
            .iter()
            .all(|chunk| chunk.len() <= TERMINAL_CHUNK_MAX_BYTES));
        assert_eq!(chunks.concat(), text);
    }

    #[test]
    fn the_login_shell_is_the_configured_absolute_executable_or_a_system_shell() {
        assert_eq!(login_shell(Some("/bin/sh")), Some(PathBuf::from("/bin/sh")));
        assert_eq!(login_shell(Some("sh")), login_shell(None));
        assert_eq!(login_shell(Some("/no/such/shell")), login_shell(None));
        assert!(login_shell(None).is_some());
    }

    fn unsandboxed(terminal: Option<&Path>) -> anyhow::Result<PreparedCommand> {
        let _ = terminal;
        let mut command = std::process::Command::new("/bin/sh");
        command.env_clear().env("PATH", "/usr/bin:/bin");
        Ok(PreparedCommand {
            command,
            scratch: None,
        })
    }

    fn unsandboxed_script(
        script: impl Into<String>,
    ) -> impl FnOnce(Option<&Path>) -> anyhow::Result<PreparedCommand> {
        let script = script.into();
        move |_| {
            let mut command = std::process::Command::new("/bin/sh");
            command
                .env_clear()
                .env("PATH", "/usr/bin:/bin")
                .args(["-c", script.as_str()]);
            Ok(PreparedCommand {
                command,
                scratch: None,
            })
        }
    }

    struct Session {
        terminals: Terminals,
        sink: TerminalEvents,
        events: mpsc::Receiver<AppServerNotification>,
        seen: String,
    }

    impl Session {
        fn new() -> Self {
            let (sink, events) = mpsc::channel(16);
            Self {
                terminals: Terminals::default(),
                sink,
                events,
                seen: String::new(),
            }
        }

        fn open(
            &self,
            id: &str,
            build: impl FnOnce(Option<&Path>) -> anyhow::Result<PreparedCommand>,
        ) -> Result<(), DeveloperSessionHostError> {
            self.terminals
                .open_with(id.into(), 24, 80, self.sink.clone(), build)
        }

        async fn until_output_contains(&mut self, needle: &str) {
            tokio::time::timeout(Duration::from_secs(10), async {
                while !self.seen.contains(needle) {
                    let event = self.events.recv().await.expect("notification");
                    if event.method == method::TERMINAL_OUTPUT {
                        self.seen
                            .push_str(event.params["data"].as_str().expect("data"));
                    }
                }
            })
            .await
            .unwrap_or_else(|_| panic!("no {needle:?} in {:?}", self.seen));
        }

        async fn exit(&mut self) -> serde_json::Value {
            tokio::time::timeout(Duration::from_secs(10), async {
                loop {
                    let event = self.events.recv().await.expect("notification");
                    if event.method == method::TERMINAL_OUTPUT {
                        self.seen
                            .push_str(event.params["data"].as_str().expect("data"));
                    } else if event.method == method::TERMINAL_EXITED {
                        return event.params;
                    }
                }
            })
            .await
            .expect("an exited notification")
        }
    }

    #[tokio::test]
    async fn typed_input_is_run_and_its_output_arrives_then_close_ends_the_shell() {
        let _children = crate::process_tree::CHILD_SPAWNING_TESTS.lock().await;
        let mut session = Session::new();
        session.open("t1", unsandboxed).expect("open");
        session
            .terminals
            .write("t1", "echo hello-$((40+2))\n")
            .await
            .expect("write");
        session.until_output_contains("hello-42").await;

        session.terminals.resize("t1", 50, 132).expect("resize");
        session
            .terminals
            .write("t1", "stty size\n")
            .await
            .expect("write");
        session.until_output_contains("50 132").await;

        session.terminals.close("t1").await.expect("close");
        let exited = session.exit().await;
        assert_eq!(exited["terminalId"], "t1");
        assert!(lock(&session.terminals.open).is_empty());
        assert!(session.terminals.write("t1", "x").await.is_err());
    }

    #[tokio::test]
    async fn a_shell_that_exits_reports_its_code_after_its_last_output() {
        let _children = crate::process_tree::CHILD_SPAWNING_TESTS.lock().await;
        let mut session = Session::new();
        session
            .open("t2", unsandboxed_script("printf last-words; exit 7"))
            .expect("open");
        let exited = session.exit().await;
        assert_eq!(exited["code"], 7);
        assert!(session.seen.contains("last-words"), "{:?}", session.seen);
        assert!(lock(&session.terminals.open).is_empty());
    }

    #[tokio::test]
    async fn a_background_process_does_not_outlive_its_shell() {
        let _children = crate::process_tree::CHILD_SPAWNING_TESTS.lock().await;
        let marker = tempfile::tempdir().expect("marker");
        let pid_file = marker.path().join("pid");
        let script = format!("sleep 300 & echo $! > '{}'; exit 0", pid_file.display());
        let mut session = Session::new();
        session
            .open("t3", unsandboxed_script(script))
            .expect("open");
        session.exit().await;
        let background: i32 = std::fs::read_to_string(&pid_file)
            .expect("pid file")
            .trim()
            .parse()
            .expect("pid");
        tokio::time::timeout(Duration::from_secs(10), async {
            while nix::sys::signal::kill(nix::unistd::Pid::from_raw(background), None).is_ok() {
                tokio::time::sleep(Duration::from_millis(20)).await;
            }
        })
        .await
        .expect("the shell's background job was ended with it");
    }

    #[tokio::test]
    async fn a_job_the_shell_put_in_the_background_ends_with_the_terminal() {
        let _children = crate::process_tree::CHILD_SPAWNING_TESTS.lock().await;
        let mut session = Session::new();
        session.open("t5", unsandboxed).expect("open");
        session
            .terminals
            .write("t5", "sleep 300 &\necho bg-pid-$!\n")
            .await
            .expect("write");
        let background = tokio::time::timeout(Duration::from_secs(10), async {
            loop {
                let digits: String = session
                    .seen
                    .rsplit("bg-pid-")
                    .next()
                    .unwrap_or_default()
                    .chars()
                    .take_while(char::is_ascii_digit)
                    .collect();
                if let Ok(pid) = digits.parse::<i32>() {
                    return pid;
                }
                let event = session.events.recv().await.expect("notification");
                if event.method == method::TERMINAL_OUTPUT {
                    session
                        .seen
                        .push_str(event.params["data"].as_str().expect("data"));
                }
            }
        })
        .await
        .expect("the shell reports its job");
        let alive =
            |pid: i32| nix::sys::signal::kill(nix::unistd::Pid::from_raw(pid), None).is_ok();
        assert!(alive(background));

        session.terminals.close("t5").await.expect("close");
        tokio::time::timeout(Duration::from_secs(10), async {
            while alive(background) {
                tokio::time::sleep(Duration::from_millis(20)).await;
            }
        })
        .await
        .expect("a job in a group of its own was ended with the terminal");
    }

    #[tokio::test]
    async fn no_more_than_the_limit_are_open_and_a_closed_one_frees_its_place() {
        let _children = crate::process_tree::CHILD_SPAWNING_TESTS.lock().await;
        let session = Session::new();
        for index in 0..MAX_OPEN_TERMINALS {
            session
                .open(&format!("t{index}"), unsandboxed)
                .expect("under the limit");
        }
        let refused = session
            .open("extra", unsandboxed)
            .expect_err("over the limit");
        assert!(
            refused.message().contains("At most 8"),
            "{}",
            refused.message()
        );

        session.terminals.close("t0").await.expect("close");
        session
            .open("extra", unsandboxed)
            .expect("a place was freed");
        session
            .terminals
            .shutdown()
            .await
            .expect("shutdown reaps every shell");
        assert!(lock(&session.terminals.open).is_empty());
    }

    #[tokio::test]
    async fn a_flood_of_output_is_delivered_in_bounded_chunks_without_loss() {
        let _children = crate::process_tree::CHILD_SPAWNING_TESTS.lock().await;
        let mut session = Session::new();
        session
            .open(
                "t4",
                unsandboxed_script(
                    "i=0; while [ $i -lt 3000 ]; do printf '%0100d\\n' $i; i=$((i+1)); done; printf done-marker",
                ),
            )
            .expect("open");
        let mut largest = 0;
        let mut total = 0;
        tokio::time::timeout(Duration::from_secs(20), async {
            loop {
                let event = session.events.recv().await.expect("notification");
                if event.method == method::TERMINAL_OUTPUT {
                    let data = event.params["data"].as_str().expect("data");
                    largest = largest.max(data.len());
                    total += data.len();
                } else if event.method == method::TERMINAL_EXITED {
                    break;
                }
            }
        })
        .await
        .expect("the flood ends");
        assert!(largest <= TERMINAL_CHUNK_MAX_BYTES, "{largest}");
        assert!(total >= 3000 * 101, "{total}");
    }
}
