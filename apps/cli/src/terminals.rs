use std::collections::VecDeque;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};
use std::time::Duration;

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use tokio::sync::watch;

use crate::process_tree::DetachedProcessTree;

const KEPT_OUTPUT_BYTES: usize = 1024 * 1024;
const RECENT_OUTPUT_BYTES: usize = 4 * 1024;
const INPUT_TIMEOUT: Duration = Duration::from_secs(5);
const STOP_TIMEOUT: Duration = Duration::from_secs(5);
const KEPT_FINISHED_COMMANDS: usize = 20;
pub(crate) const FIRST_OUTPUT_WAIT: Duration = Duration::from_secs(2);
pub(crate) const DEFAULT_WAIT: Duration = Duration::from_secs(2);
pub(crate) const MAX_WAIT: Duration = Duration::from_secs(30);
#[cfg(unix)]
const TERMINAL_ROWS: u16 = 40;
#[cfg(unix)]
const TERMINAL_COLUMNS: u16 = 120;
#[cfg(windows)]
const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;

static NEXT_ID: AtomicU64 = AtomicU64::new(1);
static COMMANDS: OnceLock<Mutex<Vec<Arc<BackgroundCommand>>>> = OnceLock::new();

tokio::task_local! {
    static COMMAND_OWNER: String;
}

pub(crate) async fn scope_owner<F: std::future::Future>(owner: String, future: F) -> F::Output {
    COMMAND_OWNER.scope(owner, future).await
}

fn current_owner() -> Option<String> {
    COMMAND_OWNER.try_with(Clone::clone).ok()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum CommandState {
    Running,
    Exited(Option<i32>),
    Stopped,
}

impl CommandState {
    pub(crate) fn label(self) -> String {
        match self {
            CommandState::Running => "running".to_string(),
            CommandState::Exited(Some(code)) => format!("exited {code}"),
            CommandState::Exited(None) => "killed by a signal".to_string(),
            CommandState::Stopped => "stopped".to_string(),
        }
    }
}

impl std::fmt::Display for CommandState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CommandState::Running => f.write_str("is running"),
            CommandState::Exited(Some(code)) => write!(f, "exited with code {code}"),
            CommandState::Exited(None) => f.write_str("was ended by a signal"),
            CommandState::Stopped => f.write_str("was stopped"),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Status {
    state: CommandState,
    open_outputs: usize,
}

#[derive(Default)]
struct OutputLog {
    kept: VecDeque<u8>,
    total: u64,
    read_through: u64,
}

pub(crate) struct NewOutput {
    pub(crate) text: String,
    pub(crate) dropped: u64,
    pub(crate) state: CommandState,
}

#[derive(Default)]
struct InputState {
    history: String,
    uncertain: bool,
}

pub(crate) struct InputTransaction {
    command: Arc<BackgroundCommand>,
    _guard: tokio::sync::OwnedMutexGuard<()>,
    text: String,
    cumulative: String,
}

impl InputTransaction {
    pub(crate) fn cumulative_input(&self) -> &str {
        &self.cumulative
    }

    pub(crate) async fn send(self) -> Result<()> {
        {
            let mut state = lock(&self.command.input_state);
            if self.command.state() != CommandState::Running {
                anyhow::bail!("{} is no longer taking input", self.command.id);
            }
            state.history.clone_from(&self.cumulative);
            state.uncertain = true;
        }
        let result = deliver_input(&self.command, &self.text).await;
        if result.is_ok() {
            lock(&self.command.input_state).uncertain = false;
        } else {
            self.command.kill();
        }
        result
    }
}

impl Drop for InputTransaction {
    fn drop(&mut self) {
        if lock(&self.command.input_state).uncertain {
            self.command.kill();
        }
    }
}

pub(crate) async fn prepare_input(
    command: Arc<BackgroundCommand>,
    text: &str,
) -> Result<InputTransaction> {
    if text
        .chars()
        .any(|character| character.is_control() && character != '\n')
    {
        anyhow::bail!(
            "Send plain text with LF line endings; terminal editing controls are not supported"
        );
    }
    let guard = command.input_transaction.clone().lock_owned().await;
    let cumulative = {
        let state = lock(&command.input_state);
        if state.uncertain {
            anyhow::bail!(
                "Input delivery is uncertain; stop this command before sending more input"
            );
        }
        if command.state() != CommandState::Running {
            anyhow::bail!("{} is no longer taking input", command.id);
        }
        if state.history.len().saturating_add(text.len()) > KEPT_OUTPUT_BYTES {
            anyhow::bail!("The command input history limit was reached; start a new command");
        }
        format!("{}{text}", state.history)
    };
    Ok(InputTransaction {
        command,
        _guard: guard,
        text: text.into(),
        cumulative,
    })
}

pub(crate) struct BackgroundCommand {
    pub(crate) id: String,
    pub(crate) command: String,
    pub(crate) started_at: DateTime<Utc>,
    pub(crate) terminal: bool,
    owner: Option<String>,
    status: watch::Sender<Status>,
    stop_requested: AtomicBool,
    input: Mutex<Option<Box<dyn Write + Send>>>,
    input_transaction: Arc<tokio::sync::Mutex<()>>,
    input_state: Mutex<InputState>,
    output: Mutex<OutputLog>,
    tree: Mutex<Option<DetachedProcessTree>>,
    scratch: Mutex<Option<tempfile::TempDir>>,
    #[cfg(unix)]
    control: Option<Arc<std::fs::File>>,
    #[cfg(unix)]
    process_id: u32,
    observer: Option<OutputObserver>,
    #[cfg(unix)]
    session_quiesced: AtomicBool,
    #[cfg(unix)]
    session_error: Mutex<Option<String>>,
}

pub(crate) struct PreparedCommand {
    pub(crate) command: std::process::Command,
    pub(crate) scratch: Option<tempfile::TempDir>,
}

struct Spawned {
    child: std::process::Child,
    input: Option<Box<dyn Write + Send>>,
    outputs: Vec<Box<dyn Read + Send>>,
    terminal: bool,
    scratch: Option<tempfile::TempDir>,
    #[cfg(unix)]
    control: Option<Arc<std::fs::File>>,
}
type OutputObserver = Arc<dyn Fn(&[u8]) + Send + Sync>;
#[cfg(unix)]
pub(crate) struct OwnedTerminal {
    command: Arc<BackgroundCommand>,
    adopted: bool,
}
#[cfg(unix)]
impl OwnedTerminal {
    pub(crate) fn command(&self) -> &Arc<BackgroundCommand> {
        &self.command
    }
    pub(crate) fn adopt(mut self) {
        self.adopted = true;
    }
}
#[cfg(unix)]
impl Drop for OwnedTerminal {
    fn drop(&mut self) {
        if !self.adopted {
            self.command.kill();
        }
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn commands() -> MutexGuard<'static, Vec<Arc<BackgroundCommand>>> {
    lock(COMMANDS.get_or_init(|| Mutex::new(Vec::new())))
}

impl BackgroundCommand {
    #[cfg(unix)]
    pub(crate) fn terminal_cleanup_error(&self) -> Option<String> {
        lock(&self.session_error).clone()
    }
    #[cfg(unix)]
    pub(crate) fn terminal_quiesced(&self) -> bool {
        self.session_quiesced.load(Ordering::SeqCst)
    }
    #[cfg(unix)]
    pub(crate) fn request_terminal_stop(&self) {
        self.kill();
    }

    #[cfg(unix)]
    #[allow(unsafe_code)]
    pub(crate) fn resize_terminal(&self, rows: u16, cols: u16) -> Result<()> {
        use std::os::fd::AsRawFd;
        anyhow::ensure!(
            self.state() == CommandState::Running,
            "The terminal is no longer running"
        );
        let master = self
            .control
            .as_ref()
            .context("The command has no terminal control handle")?;
        let size = nix::pty::Winsize {
            ws_row: rows,
            ws_col: cols,
            ws_xpixel: 0,
            ws_ypixel: 0,
        };
        // SAFETY: this held PTY master and Winsize remain live for the ioctl.
        if unsafe { nix::libc::ioctl(master.as_raw_fd(), nix::libc::TIOCSWINSZ as _, &size) } == -1
        {
            return Err(std::io::Error::last_os_error().into());
        }
        Ok(())
    }
    pub(crate) fn state(&self) -> CommandState {
        self.status.borrow().state
    }

    pub(crate) fn recent_output(&self) -> String {
        let output = lock(&self.output);
        let skip = output.kept.len().saturating_sub(RECENT_OUTPUT_BYTES);
        plain_text(&output.kept.iter().skip(skip).copied().collect::<Vec<_>>())
    }

    fn record(&self, bytes: &[u8]) {
        if let Some(observer) = &self.observer {
            observer(bytes);
        }
        let mut output = lock(&self.output);
        output.total += bytes.len() as u64;
        output.kept.extend(bytes);
        let excess = output.kept.len().saturating_sub(KEPT_OUTPUT_BYTES);
        output.kept.drain(..excess);
    }

    fn take_new_output(&self) -> (Vec<u8>, u64) {
        let mut output = lock(&self.output);
        let kept_from = output.total - output.kept.len() as u64;
        let start = output.read_through.max(kept_from);
        let dropped = start - output.read_through;
        let bytes = output
            .kept
            .iter()
            .skip((start - kept_from) as usize)
            .copied()
            .collect();
        output.read_through = output.total;
        (bytes, dropped)
    }

    fn finish(&self, code: Option<i32>) {
        let tree = lock(&self.tree).take();
        #[cfg(unix)]
        if self.terminal {
            let result = tree.map_or(Ok(()), |tree| tree.finish_terminal(STOP_TIMEOUT));
            self.session_quiesced
                .store(result.is_ok(), Ordering::SeqCst);
            *lock(&self.session_error) = result.err().map(|error| error.to_string());
        }
        #[cfg(not(unix))]
        drop(tree);
        let state = if self.stop_requested.load(Ordering::SeqCst) {
            CommandState::Stopped
        } else {
            CommandState::Exited(code)
        };
        lock(&self.input).take();
        *lock(&self.input_state) = InputState::default();
        lock(&self.scratch).take();
        self.status.send_modify(|status| status.state = state);
    }

    fn kill(&self) {
        self.stop_requested.store(true, Ordering::SeqCst);
        if let Some(tree) = lock(&self.tree).as_ref() {
            tree.kill();
        }
    }

    async fn settle(&self, wait: Duration) {
        let mut status = self.status.subscribe();
        let _ = tokio::time::timeout(
            wait,
            status.wait_for(|status| {
                status.state != CommandState::Running && status.open_outputs == 0
            }),
        )
        .await;
    }
}

pub(crate) fn start(
    command_line: &str,
    build: impl FnOnce(Option<&Path>) -> Result<PreparedCommand>,
) -> Result<Arc<BackgroundCommand>> {
    start_owned(command_line, build, None, None, true)
}

#[cfg(unix)]
pub(crate) fn start_terminal(
    command_line: &str,
    size: (u16, u16),
    observer: OutputObserver,
    build: impl FnOnce(Option<&Path>) -> Result<PreparedCommand>,
) -> Result<OwnedTerminal> {
    start_owned(command_line, build, Some(size), Some(observer), false).map(|command| {
        OwnedTerminal {
            command,
            adopted: false,
        }
    })
}

fn start_owned(
    command_line: &str,
    build: impl FnOnce(Option<&Path>) -> Result<PreparedCommand>,
    size: Option<(u16, u16)>,
    observer: Option<OutputObserver>,
    register: bool,
) -> Result<Arc<BackgroundCommand>> {
    let spawned = spawn(build, size, register)?;
    let mut child = spawned.child;
    let (status, _) = watch::channel(Status {
        state: CommandState::Running,
        open_outputs: spawned.outputs.len(),
    });
    let command = Arc::new(BackgroundCommand {
        id: format!("shell_{}", NEXT_ID.fetch_add(1, Ordering::Relaxed)),
        command: command_line.to_string(),
        started_at: Utc::now(),
        terminal: spawned.terminal,
        owner: current_owner(),
        status,
        stop_requested: AtomicBool::new(false),
        input: Mutex::new(spawned.input),
        input_transaction: Arc::new(tokio::sync::Mutex::new(())),
        input_state: Mutex::new(InputState::default()),
        output: Mutex::new(OutputLog::default()),
        tree: Mutex::new(Some({
            #[cfg(unix)]
            {
                if spawned.terminal {
                    DetachedProcessTree::track_terminal(child.id())
                } else {
                    DetachedProcessTree::track(Some(child.id()))
                }
            }
            #[cfg(not(unix))]
            {
                DetachedProcessTree::track(Some(child.id()))
            }
        })),
        scratch: Mutex::new(spawned.scratch),
        #[cfg(unix)]
        control: spawned.control,
        #[cfg(unix)]
        process_id: child.id(),
        observer,
        #[cfg(unix)]
        session_quiesced: AtomicBool::new(false),
        #[cfg(unix)]
        session_error: Mutex::new(None),
    });
    for mut source in spawned.outputs {
        let owner = Arc::clone(&command);
        std::thread::spawn(move || {
            let mut buffer = [0u8; 8192];
            loop {
                match source.read(&mut buffer) {
                    Ok(0) => break,
                    Ok(read) => owner.record(&buffer[..read]),
                    Err(error) if error.kind() == std::io::ErrorKind::Interrupted => {}
                    Err(_) => break,
                }
            }
            owner
                .status
                .send_modify(|status| status.open_outputs = status.open_outputs.saturating_sub(1));
        });
    }
    let owner = Arc::clone(&command);
    std::thread::spawn(move || {
        let code = child.wait().ok().and_then(|status| status.code());
        owner.finish(code);
    });
    if !register {
        return Ok(command);
    }
    let mut commands = commands();
    let finished = commands
        .iter()
        .filter(|command| command.state() != CommandState::Running)
        .count();
    if finished >= KEPT_FINISHED_COMMANDS {
        if let Some(oldest) = commands
            .iter()
            .position(|command| command.state() != CommandState::Running)
        {
            commands.remove(oldest);
        }
    }
    commands.push(Arc::clone(&command));
    Ok(command)
}

#[cfg(unix)]
fn spawn(
    build: impl FnOnce(Option<&Path>) -> Result<PreparedCommand>,
    size: Option<(u16, u16)>,
    agent_command: bool,
) -> Result<Spawned> {
    use nix::fcntl::{fcntl, FcntlArg, FdFlag};
    use std::process::Stdio;

    let size = nix::pty::Winsize {
        ws_row: size.map_or(TERMINAL_ROWS, |size| size.0),
        ws_col: size.map_or(TERMINAL_COLUMNS, |size| size.1),
        ws_xpixel: 0,
        ws_ypixel: 0,
    };
    let pty = nix::pty::openpty(&size, None).context("opening a pseudo-terminal")?;
    for end in [&pty.master, &pty.slave] {
        fcntl(end, FcntlArg::F_SETFD(FdFlag::FD_CLOEXEC))
            .context("keeping the pseudo-terminal out of other commands")?;
    }
    let device = nix::unistd::ttyname(&pty.slave).context("naming the pseudo-terminal")?;
    let PreparedCommand {
        mut command,
        scratch,
    } = build(Some(&device))?;
    command
        .stdin(Stdio::from(pty.slave.try_clone()?))
        .stdout(Stdio::from(pty.slave.try_clone()?))
        .stderr(Stdio::from(pty.slave))
        .env("TERM", "xterm-256color");
    if agent_command {
        command.env("PAGER", "cat").env("GIT_PAGER", "cat");
    }
    attach_terminal(&mut command);
    let master = std::fs::File::from(pty.master);
    let reader = master.try_clone().context("reading the pseudo-terminal")?;
    let writer = master.try_clone().context("writing the pseudo-terminal")?;
    let child = command.spawn().context("starting the command")?;
    drop(command);
    Ok(Spawned {
        child,
        input: Some(Box::new(writer)),
        control: Some(Arc::new(master)),
        outputs: vec![Box::new(reader)],
        terminal: true,
        scratch,
    })
}

#[cfg(unix)]
#[allow(unsafe_code)]
fn attach_terminal(command: &mut std::process::Command) {
    use std::os::unix::process::CommandExt;

    unsafe {
        command.pre_exec(|| {
            nix::unistd::setsid()?;
            if nix::libc::ioctl(0, nix::libc::TIOCSCTTY as _, 0) == -1 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        });
    }
}

#[cfg(not(unix))]
fn spawn(
    build: impl FnOnce(Option<&Path>) -> Result<PreparedCommand>,
    _size: Option<(u16, u16)>,
    _agent_command: bool,
) -> Result<Spawned> {
    use std::process::Stdio;

    let PreparedCommand {
        mut command,
        scratch,
    } = build(None)?;
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NEW_PROCESS_GROUP);
    }
    let mut child = command.spawn().context("starting the command")?;
    let input = child
        .stdin
        .take()
        .map(|stdin| Box::new(stdin) as Box<dyn Write + Send>);
    let mut outputs: Vec<Box<dyn Read + Send>> = Vec::new();
    if let Some(stdout) = child.stdout.take() {
        outputs.push(Box::new(stdout));
    }
    if let Some(stderr) = child.stderr.take() {
        outputs.push(Box::new(stderr));
    }
    Ok(Spawned {
        child,
        input,
        outputs,
        terminal: false,
        scratch,
    })
}

pub(crate) fn list() -> Vec<Arc<BackgroundCommand>> {
    commands().clone()
}

pub(crate) fn find(id: &str) -> Option<Arc<BackgroundCommand>> {
    commands()
        .iter()
        .find(|command| command.id == id.trim())
        .cloned()
}

pub(crate) fn list_owned() -> Vec<Arc<BackgroundCommand>> {
    let owner = current_owner();
    commands()
        .iter()
        .filter(|command| command.owner == owner)
        .cloned()
        .collect()
}

pub(crate) fn find_owned(id: &str) -> Option<Arc<BackgroundCommand>> {
    let owner = current_owner();
    find(id).filter(|command| command.owner == owner)
}

pub(crate) async fn read_new(command: &BackgroundCommand, wait: Duration) -> NewOutput {
    if !wait.is_zero() {
        command.settle(wait).await;
    }
    let (bytes, dropped) = command.take_new_output();
    NewOutput {
        text: plain_text(&bytes),
        dropped,
        state: command.state(),
    }
}

async fn deliver_input(command: &Arc<BackgroundCommand>, text: &str) -> Result<()> {
    let Some(mut writer) = lock(&command.input).take() else {
        anyhow::bail!("{} is not taking input", command.id);
    };
    let bytes = text.as_bytes().to_vec();
    let owner = Arc::clone(command);
    let write = tokio::task::spawn_blocking(move || {
        let written = writer.write_all(&bytes).and_then(|()| writer.flush());
        if owner.state() == CommandState::Running {
            *lock(&owner.input) = Some(writer);
        }
        written
    });
    match tokio::time::timeout(INPUT_TIMEOUT, write).await {
        Ok(Ok(written)) => written.with_context(|| format!("typing into {}", command.id)),
        Ok(Err(error)) => Err(anyhow::anyhow!("typing into {}: {error}", command.id)),
        Err(_) => anyhow::bail!(
            "{} is not reading its input, so the text is still waiting to be delivered",
            command.id
        ),
    }
}

pub(crate) async fn stop(command: &BackgroundCommand) -> CommandState {
    if command.state() == CommandState::Running {
        command.kill();
        command.settle(STOP_TIMEOUT).await;
    }
    command.state()
}

#[cfg(unix)]
pub(crate) async fn write_terminal(command: Arc<BackgroundCommand>, text: &str) -> Result<()> {
    let _transaction = command.input_transaction.clone().lock_owned().await;
    anyhow::ensure!(
        command.terminal && command.state() == CommandState::Running,
        "The terminal is no longer taking input"
    );
    {
        let mut input = lock(&command.input_state);
        anyhow::ensure!(
            !input.uncertain,
            "Terminal input delivery is uncertain; close this terminal before typing again"
        );
        input.uncertain = true;
    }
    struct Delivery {
        command: Arc<BackgroundCommand>,
        confirmed: bool,
    }
    impl Drop for Delivery {
        fn drop(&mut self) {
            if !self.confirmed {
                self.command.kill();
            }
        }
    }
    let mut delivery = Delivery {
        command: command.clone(),
        confirmed: false,
    };
    deliver_input(&command, text).await?;
    lock(&command.input_state).uncertain = false;
    delivery.confirmed = true;
    Ok(())
}

#[cfg(unix)]
pub(crate) async fn stop_terminal(command: &BackgroundCommand, timeout: Duration) -> Result<()> {
    if command.state() != CommandState::Running {
        anyhow::ensure!(
            command.session_quiesced.load(Ordering::SeqCst),
            "{}",
            lock(&command.session_error)
                .as_deref()
                .unwrap_or("The terminal process session could not be confirmed stopped")
        );
        return Ok(());
    }
    let deadline = tokio::time::Instant::now() + timeout;
    command.kill();
    crate::process_tree::wait_session_stopped(command.process_id, timeout).await?;
    command
        .settle(deadline.saturating_duration_since(tokio::time::Instant::now()))
        .await;
    anyhow::ensure!(
        command.state() != CommandState::Running,
        "The terminal shell has not exited"
    );
    anyhow::ensure!(
        command.session_quiesced.load(Ordering::SeqCst),
        "The terminal process session could not be confirmed stopped"
    );
    Ok(())
}

pub(crate) fn stop_all() {
    for command in commands().iter() {
        if command.state() == CommandState::Running {
            command.kill();
        }
    }
}

pub(crate) fn report(command: &BackgroundCommand, output: &NewOutput) -> String {
    let mut lines = vec![format!(
        "{} {}: {}",
        command.id, output.state, command.command
    )];
    if output.dropped > 0 {
        lines.push(format!(
            "[{} earlier bytes of output were not kept]",
            output.dropped
        ));
    }
    lines.push(if output.text.trim().is_empty() {
        "(no new output)".to_string()
    } else {
        output.text.clone()
    });
    lines.join("\n")
}

pub(crate) fn summary(commands: &[Arc<BackgroundCommand>]) -> String {
    if commands.is_empty() {
        return "No background commands in this session.".to_string();
    }
    let mut lines = vec![format!("Background commands ({})", commands.len())];
    for command in commands {
        lines.push(format!(
            "  {:<10} [{}] started {}  {}",
            command.id,
            command.state().label(),
            command
                .started_at
                .with_timezone(&chrono::Local)
                .format("%H:%M:%S"),
            command.command
        ));
    }
    lines.join("\n")
}

fn plain_text(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes)
        .split('\n')
        .map(|line| {
            let line = line.strip_suffix('\r').unwrap_or(line);
            let line = line.rsplit('\r').next().unwrap_or(line);
            crate::terminal_text::sanitize_terminal_text(line).into_owned()
        })
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod input_tests {
    use super::*;

    #[cfg(unix)]
    #[tokio::test]
    async fn background_scratch_lives_until_the_owned_child_finishes() {
        let _children = crate::process_tree::CHILD_SPAWNING_TESTS.lock().await;
        let scratch = tempfile::tempdir().expect("owned scratch");
        let path = scratch.path().to_path_buf();
        let command = start("scratch lifetime fixture", |_| {
            let mut command = std::process::Command::new("/bin/sh");
            command
                .env_clear()
                .env("OWNED_SCRATCH", &path)
                .args(["-c", "read answer; test -d \"$OWNED_SCRATCH\""]);
            Ok(PreparedCommand {
                command,
                scratch: Some(scratch),
            })
        })
        .expect("owned fixture child");
        let existed_while_running = path.is_dir();
        let observed = tokio::time::timeout(Duration::from_secs(5), async {
            prepare_input(command.clone(), "finish\n")
                .await?
                .send()
                .await?;
            let mut status = command.status.subscribe();
            while status.borrow().state == CommandState::Running {
                status.changed().await?;
            }
            let state = status.borrow().state;
            Ok::<_, anyhow::Error>(state)
        })
        .await;
        if command.state() == CommandState::Running {
            command.kill();
        }
        let mut stopped = command.status.subscribe();
        let cleanup = tokio::time::timeout(Duration::from_secs(5), async {
            while stopped.borrow().state == CommandState::Running {
                stopped.changed().await?;
            }
            Ok::<_, anyhow::Error>(())
        })
        .await;
        cleanup
            .expect("bounded child cleanup")
            .expect("child cleanup");
        assert!(existed_while_running);
        assert_eq!(
            observed
                .expect("bounded fixture")
                .expect("fixture exchange"),
            CommandState::Exited(Some(0))
        );
        assert!(
            !path.exists(),
            "completed child retained its private scratch"
        );
    }

    #[test]
    fn a_failed_background_spawn_releases_its_owned_scratch() {
        let scratch = tempfile::tempdir().expect("owned scratch");
        let path = scratch.path().to_path_buf();
        let outcome = spawn(
            |_| {
                Ok(PreparedCommand {
                    command: std::process::Command::new(path.join("missing-fixture-program")),
                    scratch: Some(scratch),
                })
            },
            None,
            true,
        );
        let error = match outcome {
            Err(error) => error,
            Ok(mut unexpected) => {
                let _ = unexpected.child.kill();
                let _ = unexpected.child.wait();
                panic!("missing fixture program unexpectedly started");
            }
        };
        assert!(error.to_string().contains("starting the command"));
        assert!(!path.exists(), "failed launch retained its private scratch");
    }

    fn command(writer: Box<dyn Write + Send>) -> Arc<BackgroundCommand> {
        let (status, _) = watch::channel(Status {
            state: CommandState::Running,
            open_outputs: 0,
        });
        Arc::new(BackgroundCommand {
            id: "input-test".into(),
            command: "controlled interactive input".into(),
            started_at: Utc::now(),
            terminal: true,
            owner: None,
            status,
            stop_requested: AtomicBool::new(false),
            input: Mutex::new(Some(writer)),
            input_transaction: Arc::new(tokio::sync::Mutex::new(())),
            input_state: Mutex::new(InputState::default()),
            output: Mutex::new(OutputLog::default()),
            tree: Mutex::new(None),
            scratch: Mutex::new(None),
            #[cfg(unix)]
            control: None,
            #[cfg(unix)]
            process_id: 0,
            observer: None,
            #[cfg(unix)]
            session_quiesced: AtomicBool::new(false),
            #[cfg(unix)]
            session_error: Mutex::new(None),
        })
    }

    #[tokio::test]
    async fn input_transactions_serialize_history_and_clear_it_on_exit() {
        let command = command(Box::new(std::io::sink()));
        let first = prepare_input(command.clone(), "pri").await.unwrap();
        let (started, attempted) = tokio::sync::oneshot::channel();
        let next = command.clone();
        let second = tokio::spawn(async move {
            started.send(()).unwrap();
            prepare_input(next, "ntf controlled\n").await.unwrap()
        });
        attempted.await.unwrap();
        assert!(
            !second.is_finished(),
            "second input skipped the transaction lock"
        );
        first.send().await.unwrap();
        let second = second.await.unwrap();
        assert_eq!(second.cumulative_input(), "printf controlled\n");
        second.send().await.unwrap();
        command.finish(Some(0));
        assert!(lock(&command.input_state).history.is_empty());
    }

    #[tokio::test]
    async fn input_controls_and_history_overflow_fail_before_transmission() {
        let command = command(Box::new(std::io::sink()));
        for text in ["text\t", "text\r", "text\u{7f}", "text\u{8}", "text\u{1b}"] {
            assert!(prepare_input(command.clone(), text).await.is_err());
        }
        lock(&command.input_state).history = "x".repeat(KEPT_OUTPUT_BYTES);
        assert!(prepare_input(command.clone(), "overflow").await.is_err());
        assert_eq!(lock(&command.input_state).history.len(), KEPT_OUTPUT_BYTES);
    }

    struct HeldWriter {
        entered: Option<tokio::sync::oneshot::Sender<()>>,
        released: Arc<(Mutex<bool>, std::sync::Condvar)>,
    }

    impl Write for HeldWriter {
        fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
            if let Some(entered) = self.entered.take() {
                let _ = entered.send(());
            }
            let (released, signal) = &*self.released;
            let mut ready = lock(released);
            while !*ready {
                ready = signal.wait(ready).unwrap();
            }
            Ok(bytes.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    #[tokio::test]
    async fn canceled_or_timed_out_input_never_assumes_delivery_was_undone() {
        for cancel in [false, true] {
            let (entered, started) = tokio::sync::oneshot::channel();
            let released = Arc::new((Mutex::new(false), std::sync::Condvar::new()));
            let command = command(Box::new(HeldWriter {
                entered: Some(entered),
                released: released.clone(),
            }));
            let transaction = prepare_input(command.clone(), "controlled line\n")
                .await
                .unwrap();
            let sending = tokio::spawn(async move { transaction.send().await });
            started.await.unwrap();
            if cancel {
                sending.abort();
            }
            let result = sending.await;
            *lock(&released.0) = true;
            released.1.notify_all();
            assert!(result.is_err() || result.unwrap().is_err());
            assert!(command.stop_requested.load(Ordering::SeqCst));
            assert!(prepare_input(command.clone(), "retry\n").await.is_err());
            assert!(lock(&command.input_state).uncertain);
        }
    }

    fn registered(id: &str, owner: Option<&str>) -> Arc<BackgroundCommand> {
        let (status, _) = watch::channel(Status {
            state: CommandState::Running,
            open_outputs: 0,
        });
        let command = Arc::new(BackgroundCommand {
            id: id.into(),
            command: format!("owned by {owner:?}"),
            started_at: Utc::now(),
            terminal: false,
            owner: owner.map(str::to_string),
            status,
            stop_requested: AtomicBool::new(false),
            input: Mutex::new(None),
            input_transaction: Arc::new(tokio::sync::Mutex::new(())),
            input_state: Mutex::new(InputState::default()),
            output: Mutex::new(OutputLog::default()),
            tree: Mutex::new(None),
            scratch: Mutex::new(None),
            #[cfg(unix)]
            control: None,
            #[cfg(unix)]
            process_id: 0,
            observer: None,
            #[cfg(unix)]
            session_quiesced: AtomicBool::new(false),
            #[cfg(unix)]
            session_error: Mutex::new(None),
        });
        commands().push(Arc::clone(&command));
        command
    }

    #[tokio::test]
    async fn a_session_lists_reads_and_stops_only_the_commands_it_started() {
        let first = registered("owner-test-a", Some("owner-test-thread-a"));
        let second = registered("owner-test-b", Some("owner-test-thread-b"));
        first.record(b"unread output of thread a\n");

        let seen_by_b = scope_owner("owner-test-thread-b".into(), async {
            (
                list_owned()
                    .iter()
                    .map(|command| command.id.clone())
                    .collect::<Vec<_>>(),
                find_owned("owner-test-a").is_some(),
                find_owned("owner-test-b").is_some(),
            )
        })
        .await;
        assert_eq!(seen_by_b.0, vec!["owner-test-b".to_string()]);
        assert!(!seen_by_b.1, "thread b resolved thread a's command");
        assert!(seen_by_b.2);
        assert!(find_owned("owner-test-a").is_none());

        let read_by_a = scope_owner("owner-test-thread-a".into(), async {
            let command = find_owned("owner-test-a").expect("thread a owns its command");
            read_new(&command, Duration::ZERO).await
        })
        .await;
        assert_eq!(read_by_a.text, "unread output of thread a\n");

        commands()
            .retain(|command| !Arc::ptr_eq(command, &first) && !Arc::ptr_eq(command, &second));
    }
}

#[cfg(all(test, unix))]
mod native_terminal_tests {
    use super::*;
    #[tokio::test]
    async fn scoped_pty_resizes_accepts_controls_hides_manual_input_and_stops_every_job_group() {
        let _children = crate::process_tree::CHILD_SPAWNING_TESTS.lock().await;
        let root = tempfile::tempdir().unwrap();
        let owned = start_terminal("operator test", (24, 80), Arc::new(|_| {}), |_| {
            let mut command = std::process::Command::new(crate::process_tree::HOST_SHELL);
            command
                .env_clear()
                .env("PATH", "/usr/bin:/bin")
                .args(["-i"])
                .current_dir(root.path());
            Ok(PreparedCommand {
                command,
                scratch: None,
            })
        })
        .unwrap();
        let command = owned.command().clone();
        owned.adopt();
        assert!(find(&command.id).is_none());
        command.resize_terminal(38, 109).unwrap();
        write_terminal(
            command.clone(),
            "stty size > dimensions; sleep 60 & echo $! > background; sleep 60\r",
        )
        .await
        .unwrap();
        let deadline = tokio::time::Instant::now() + Duration::from_secs(3);
        while !root.path().join("background").exists() {
            assert!(tokio::time::Instant::now() < deadline);
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        assert_eq!(
            std::fs::read_to_string(root.path().join("dimensions"))
                .unwrap()
                .trim(),
            "38 109"
        );
        let background: i32 = std::fs::read_to_string(root.path().join("background"))
            .unwrap()
            .trim()
            .parse()
            .unwrap();
        assert_eq!(
            nix::unistd::getsid(Some(nix::unistd::Pid::from_raw(background)))
                .unwrap()
                .as_raw(),
            command.process_id as i32
        );
        assert_ne!(
            nix::unistd::getpgid(Some(nix::unistd::Pid::from_raw(background)))
                .unwrap()
                .as_raw(),
            command.process_id as i32
        );
        assert!(lock(&command.input_state).history.is_empty());
        write_terminal(command.clone(), "\x03").await.unwrap();
        write_terminal(command.clone(), "printf alive > interrupted\r")
            .await
            .unwrap();
        while !root.path().join("interrupted").exists() {
            assert!(tokio::time::Instant::now() < deadline);
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        write_terminal(
            command.clone(),
            "sh -c 'echo $$ > foreground2; exec sleep 60'\r",
        )
        .await
        .unwrap();
        let foreground_deadline = tokio::time::Instant::now() + Duration::from_secs(3);
        while !root.path().join("foreground2").exists() {
            assert!(tokio::time::Instant::now() < foreground_deadline);
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        let foreground: i32 = std::fs::read_to_string(root.path().join("foreground2"))
            .unwrap()
            .trim()
            .parse()
            .unwrap();
        let foreground_group =
            nix::unistd::getpgid(Some(nix::unistd::Pid::from_raw(foreground))).unwrap();
        assert_ne!(foreground_group.as_raw(), command.process_id as i32);
        assert_ne!(
            foreground_group,
            nix::unistd::getpgid(Some(nix::unistd::Pid::from_raw(background))).unwrap()
        );
        assert_eq!(
            nix::unistd::getsid(Some(nix::unistd::Pid::from_raw(background)))
                .unwrap()
                .as_raw(),
            command.process_id as i32
        );
        stop_terminal(&command, Duration::from_secs(3))
            .await
            .unwrap();
        assert!(command.terminal_quiesced());
        assert!(matches!(
            nix::unistd::getsid(Some(nix::unistd::Pid::from_raw(foreground))),
            Err(nix::errno::Errno::ESRCH)
        ));
        assert!(matches!(
            nix::unistd::getsid(Some(nix::unistd::Pid::from_raw(background))),
            Err(nix::errno::Errno::ESRCH)
        ));
        assert!(lock(&command.input_state).history.is_empty());
    }
}
