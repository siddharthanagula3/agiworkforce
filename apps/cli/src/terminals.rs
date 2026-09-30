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
    status: watch::Sender<Status>,
    stop_requested: AtomicBool,
    input: Mutex<Option<Box<dyn Write + Send>>>,
    input_transaction: Arc<tokio::sync::Mutex<()>>,
    input_state: Mutex<InputState>,
    output: Mutex<OutputLog>,
    tree: Mutex<Option<DetachedProcessTree>>,
}

struct Spawned {
    child: std::process::Child,
    input: Option<Box<dyn Write + Send>>,
    outputs: Vec<Box<dyn Read + Send>>,
    terminal: bool,
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
    pub(crate) fn state(&self) -> CommandState {
        self.status.borrow().state
    }

    pub(crate) fn recent_output(&self) -> String {
        let output = lock(&self.output);
        let skip = output.kept.len().saturating_sub(RECENT_OUTPUT_BYTES);
        plain_text(&output.kept.iter().skip(skip).copied().collect::<Vec<_>>())
    }

    fn record(&self, bytes: &[u8]) {
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
        let state = if self.stop_requested.load(Ordering::SeqCst) {
            CommandState::Stopped
        } else {
            CommandState::Exited(code)
        };
        self.status.send_modify(|status| status.state = state);
        lock(&self.input).take();
        *lock(&self.input_state) = InputState::default();
        lock(&self.tree).take();
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
    build: impl FnOnce(Option<&Path>) -> Result<std::process::Command>,
) -> Result<Arc<BackgroundCommand>> {
    let spawned = spawn(build)?;
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
        status,
        stop_requested: AtomicBool::new(false),
        input: Mutex::new(spawned.input),
        input_transaction: Arc::new(tokio::sync::Mutex::new(())),
        input_state: Mutex::new(InputState::default()),
        output: Mutex::new(OutputLog::default()),
        tree: Mutex::new(Some(DetachedProcessTree::track(Some(child.id())))),
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
fn spawn(build: impl FnOnce(Option<&Path>) -> Result<std::process::Command>) -> Result<Spawned> {
    use nix::fcntl::{fcntl, FcntlArg, FdFlag};
    use std::process::Stdio;

    let size = nix::pty::Winsize {
        ws_row: TERMINAL_ROWS,
        ws_col: TERMINAL_COLUMNS,
        ws_xpixel: 0,
        ws_ypixel: 0,
    };
    let pty = nix::pty::openpty(&size, None).context("opening a pseudo-terminal")?;
    for end in [&pty.master, &pty.slave] {
        fcntl(end, FcntlArg::F_SETFD(FdFlag::FD_CLOEXEC))
            .context("keeping the pseudo-terminal out of other commands")?;
    }
    let device = nix::unistd::ttyname(&pty.slave).context("naming the pseudo-terminal")?;
    let mut command = build(Some(&device))?;
    command
        .stdin(Stdio::from(pty.slave.try_clone()?))
        .stdout(Stdio::from(pty.slave.try_clone()?))
        .stderr(Stdio::from(pty.slave))
        .env("TERM", "xterm-256color")
        .env("PAGER", "cat")
        .env("GIT_PAGER", "cat");
    attach_terminal(&mut command);
    let child = command.spawn().context("starting the command")?;
    drop(command);
    let master = std::fs::File::from(pty.master);
    let reader = master.try_clone().context("reading the pseudo-terminal")?;
    Ok(Spawned {
        child,
        input: Some(Box::new(master)),
        outputs: vec![Box::new(reader)],
        terminal: true,
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
fn spawn(build: impl FnOnce(Option<&Path>) -> Result<std::process::Command>) -> Result<Spawned> {
    use std::process::Stdio;

    let mut command = build(None)?;
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
            status,
            stop_requested: AtomicBool::new(false),
            input: Mutex::new(Some(writer)),
            input_transaction: Arc::new(tokio::sync::Mutex::new(())),
            input_state: Mutex::new(InputState::default()),
            output: Mutex::new(OutputLog::default()),
            tree: Mutex::new(None),
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
}
