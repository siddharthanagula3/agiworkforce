//! Cancellation-safe subprocess output collection.
//!
//! Agent turns are cancelled by dropping their futures. Tokio's default
//! `Command::output()` behavior leaves the child alive when that happens, and
//! `kill_on_drop(true)` only targets the direct child rather than commands it
//! spawned. This module gives every command its own process group (Unix) or
//! process group/tree boundary (Windows), keeps the child in a supervisor task,
//! and makes dropping the caller a cancellation signal. The supervisor kills
//! the tree and waits for the direct child so normal turn interruption does not
//! leave work running or a zombie behind.

use std::collections::HashMap;
use std::future::{pending, Future};
use std::io;
use std::path::Path;
use std::process::{Output, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex as StdMutex, OnceLock};
use std::time::Duration;

use tokio::io::{AsyncRead, AsyncReadExt, AsyncWriteExt};
use tokio::process::{Child, Command};
use tokio::sync::{oneshot, watch};
use tokio::task::JoinHandle;
use tokio::time::{sleep_until, Instant};

const REAP_TIMEOUT: Duration = Duration::from_secs(5);

tokio::task_local! {
    static PROCESS_TREE_OWNER: ProcessTreeOwner;
}

static NEXT_PROCESS_TREE_OWNER: AtomicU64 = AtomicU64::new(1);
static ACTIVE_PROCESS_TREES: OnceLock<StdMutex<ActiveProcessTrees>> = OnceLock::new();

/// Exact lifecycle owner for subprocesses spawned by one developer turn.
///
/// The app-server stores this beside the turn task. Dropping the turn future
/// starts cancellation, while the owner lets shutdown wait for detached
/// process-tree reapers to finish before acknowledging that the host is quiet.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub(crate) struct ProcessTreeOwner(u64);

impl ProcessTreeOwner {
    pub(crate) fn new() -> Self {
        Self(NEXT_PROCESS_TREE_OWNER.fetch_add(1, Ordering::Relaxed))
    }
}

/// Associate subprocesses created while `future` runs with one turn owner.
pub(crate) async fn scope<T>(owner: ProcessTreeOwner, future: impl Future<Output = T>) -> T {
    PROCESS_TREE_OWNER.scope(owner, future).await
}

pub(crate) fn current_owner() -> Option<ProcessTreeOwner> {
    PROCESS_TREE_OWNER.try_with(|owner| *owner).ok()
}

#[derive(Clone, Copy)]
struct ActiveProcessTree {
    owner: Option<ProcessTreeOwner>,
    process_id: Option<u32>,
}

struct ActiveProcessTrees {
    next_id: u64,
    entries: HashMap<u64, ActiveProcessTree>,
    active_count: watch::Sender<usize>,
}

impl ActiveProcessTrees {
    fn new() -> Self {
        let (active_count, _receiver) = watch::channel(0);
        Self {
            next_id: 1,
            entries: HashMap::new(),
            active_count,
        }
    }
}

struct ActiveProcessTreeGuard {
    id: Option<u64>,
}

impl ActiveProcessTreeGuard {
    fn register(process_id: Option<u32>) -> Self {
        let owner = PROCESS_TREE_OWNER.try_with(|owner| *owner).ok();
        let mut registry = active_process_trees()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let id = registry.next_id;
        registry.next_id = registry.next_id.wrapping_add(1).max(1);
        registry
            .entries
            .insert(id, ActiveProcessTree { owner, process_id });
        let count = registry.entries.len();
        registry.active_count.send_replace(count);
        Self { id: Some(id) }
    }
}

impl Drop for ActiveProcessTreeGuard {
    fn drop(&mut self) {
        let Some(id) = self.id.take() else {
            return;
        };
        let mut registry = active_process_trees()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        registry.entries.remove(&id);
        let count = registry.entries.len();
        registry.active_count.send_replace(count);
    }
}

fn active_process_trees() -> &'static StdMutex<ActiveProcessTrees> {
    ACTIVE_PROCESS_TREES.get_or_init(|| StdMutex::new(ActiveProcessTrees::new()))
}

/// Terminate and await every process tree owned by the supplied turns.
///
/// This is deliberately owner-scoped rather than process-global: a WebSocket
/// host or parallel test may have unrelated CLI work in the same process.
pub(crate) async fn terminate_owners_and_wait(
    owners: &[ProcessTreeOwner],
    timeout: Duration,
) -> io::Result<()> {
    if owners.is_empty() {
        return Ok(());
    }
    let owner_set = owners
        .iter()
        .copied()
        .collect::<std::collections::HashSet<_>>();
    let deadline = Instant::now() + timeout;
    let mut signalled = std::collections::HashSet::<u32>::new();

    loop {
        // The registry guard is `std::sync::MutexGuard`, which is not `Send`.
        // It must be dropped before any `.await`, or this whole future stops
        // being `Send` and cannot be spawned.
        let drained_or_next = {
            let registry = active_process_trees()
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            let process_ids = registry
                .entries
                .values()
                .filter(|entry| entry.owner.is_some_and(|owner| owner_set.contains(&owner)))
                .filter_map(|entry| entry.process_id)
                .collect::<Vec<_>>();
            if process_ids.is_empty()
                && !registry
                    .entries
                    .values()
                    .any(|entry| entry.owner.is_some_and(|owner| owner_set.contains(&owner)))
            {
                None
            } else {
                Some((process_ids, registry.active_count.subscribe()))
            }
        };

        let Some((process_ids, mut count_receiver)) = drained_or_next else {
            // Registry is clear. That is necessary but NOT sufficient, so
            // confirm against the OS before acknowledging.
            return await_process_groups_reaped(&signalled, deadline).await;
        };

        for process_id in process_ids {
            signalled.insert(process_id);
            if tokio::time::timeout_at(deadline, signal_process_tree(Some(process_id)))
                .await
                .is_err()
            {
                return Err(process_tree_shutdown_timeout());
            }
        }

        let changed = count_receiver.changed();
        if tokio::time::timeout_at(deadline, changed).await.is_err() {
            return Err(process_tree_shutdown_timeout());
        }
    }
}

#[cfg(unix)]
async fn await_process_groups_reaped(
    groups: &std::collections::HashSet<u32>,
    deadline: Instant,
) -> io::Result<()> {
    use nix::errno::Errno;
    use nix::sys::signal::killpg;
    use nix::unistd::Pid;

    if groups.is_empty() {
        return Ok(());
    }
    loop {
        let still_alive = groups
            .iter()
            .copied()
            .filter_map(|id| i32::try_from(id).ok())
            .any(|id| !matches!(killpg(Pid::from_raw(id), None), Err(Errno::ESRCH)));
        if !still_alive {
            return Ok(());
        }
        if Instant::now() >= deadline {
            return Err(process_tree_shutdown_timeout());
        }
        tokio::time::sleep(Duration::from_millis(5)).await;
    }
}

/// Windows tears the tree down synchronously via `taskkill /T /F`, which has
/// already returned by the time the registry drains, so there is no equivalent
/// window to wait out.
#[cfg(not(unix))]
async fn await_process_groups_reaped(
    _groups: &std::collections::HashSet<u32>,
    _deadline: Instant,
) -> io::Result<()> {
    Ok(())
}

fn process_tree_shutdown_timeout() -> io::Error {
    io::Error::new(
        io::ErrorKind::TimedOut,
        "subprocess trees did not quiesce before shutdown",
    )
}

/// Owned interactive subprocess with the same cancellation guarantees as
/// [`output`]. Useful for protocols such as LSP that keep stdin/stdout open.
pub(crate) struct ProcessTreeChild {
    child: Option<Child>,
    process_id: Option<u32>,
    active_guard: Option<ActiveProcessTreeGuard>,
}

impl ProcessTreeChild {
    pub(crate) fn spawn(mut command: Command) -> io::Result<Self> {
        configure_lifecycle(&mut command);
        let child = command.spawn()?;
        let process_id = child.id();
        Ok(Self {
            child: Some(child),
            process_id,
            active_guard: Some(ActiveProcessTreeGuard::register(process_id)),
        })
    }

    pub(crate) fn child_mut(&mut self) -> &mut Child {
        self.child
            .as_mut()
            .expect("process-tree child is present until termination")
    }

    pub(crate) async fn terminate(&mut self) {
        if let Some(mut child) = self.child.take() {
            terminate_and_reap(&mut child, self.process_id).await;
        }
        self.active_guard.take();
    }
}

impl Drop for ProcessTreeChild {
    fn drop(&mut self) {
        let Some(mut child) = self.child.take() else {
            return;
        };
        let active_guard = self.active_guard.take();
        signal_process_tree_on_drop(self.process_id);
        let _ = child.start_kill();
        let process_id = self.process_id;
        if let Ok(runtime) = tokio::runtime::Handle::try_current() {
            runtime.spawn(async move {
                let _active_guard = active_guard;
                let mut kill_guard = TreeKillGuard::new(process_id);
                terminate_and_reap(&mut child, process_id).await;
                kill_guard.disarm();
            });
        }
        // Without a live Tokio runtime, dropping a kill-on-drop child still
        // invokes Tokio's best-effort reaper after the synchronous tree signal.
    }
}

/// Check PATH without spawning `which`/`where` as an unowned subprocess.
pub(crate) fn executable_exists(binary: &str) -> bool {
    let binary_path = Path::new(binary);
    if binary_path.components().count() > 1 {
        return is_executable_file(binary_path);
    }

    let Some(search_path) = std::env::var_os("PATH") else {
        return false;
    };
    std::env::split_paths(&search_path).any(|directory| {
        let direct = directory.join(binary);
        if is_executable_file(&direct) {
            return true;
        }

        #[cfg(windows)]
        {
            if direct.extension().is_none() {
                let path_ext =
                    std::env::var("PATHEXT").unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".to_string());
                return path_ext
                    .split(';')
                    .filter(|ext| !ext.is_empty())
                    .any(|ext| is_executable_file(&directory.join(format!("{binary}{ext}"))));
            }
        }
        false
    })
}

#[cfg(unix)]
fn is_executable_file(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;

    path.metadata()
        .map(|metadata| metadata.is_file() && metadata.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable_file(path: &Path) -> bool {
    path.is_file()
}

/// Run a subprocess to completion while capturing stdout/stderr.
///
/// `stdin` is written and closed concurrently with output collection. When
/// `timeout` elapses, or when the returned future is dropped, the entire
/// process tree is terminated. Explicit timeouts wait for the direct child to
/// be reaped before returning `TimedOut`; cancellation caused by caller drop is
/// completed by the detached supervisor.
pub(crate) async fn output(
    mut command: Command,
    stdin: Option<Vec<u8>>,
    timeout: Option<Duration>,
) -> io::Result<Output> {
    command
        .stdin(if stdin.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    configure_lifecycle(&mut command);

    let mut child = command.spawn()?;
    let process_id = child.id();
    let active_guard = ActiveProcessTreeGuard::register(process_id);
    let child_stdin = child.stdin.take();
    let child_stdout = child
        .stdout
        .take()
        .ok_or_else(|| io::Error::other("subprocess stdout pipe was not created"))?;
    let child_stderr = child
        .stderr
        .take()
        .ok_or_else(|| io::Error::other("subprocess stderr pipe was not created"))?;

    let stdin_task = stdin.zip(child_stdin).map(|(bytes, mut pipe)| {
        tokio::spawn(async move {
            // Match the previous hook behavior: a child that closes stdin early
            // must not turn an otherwise valid command into an execution error.
            let _ = pipe.write_all(&bytes).await;
        })
    });
    let stdout_task = tokio::spawn(read_pipe(child_stdout));
    let stderr_task = tokio::spawn(read_pipe(child_stderr));

    let (cancel_sender, cancel_receiver) = oneshot::channel();
    let (result_sender, result_receiver) = oneshot::channel();
    let deadline = timeout.map(|duration| Instant::now() + duration);

    tokio::spawn(async move {
        let _active_guard = active_guard;
        let result = supervise(
            child,
            process_id,
            cancel_receiver,
            deadline,
            stdin_task,
            stdout_task,
            stderr_task,
        )
        .await;
        let _ = result_sender.send(result);
    });

    let mut cancel_on_drop = CancelOnDrop::new(cancel_sender, process_id);
    let result = result_receiver.await.map_err(|_| {
        io::Error::other("subprocess supervisor ended before returning an execution result")
    })?;
    cancel_on_drop.disarm();
    result
}

fn configure_lifecycle(command: &mut Command) {
    command.kill_on_drop(true);

    // A new group lets cancellation reach `sh -c` descendants, not just the
    // shell itself. Tokio exposes this without a pre-exec unsafe block.
    #[cfg(unix)]
    command.process_group(0);

    // CREATE_NEW_PROCESS_GROUP. `taskkill /T` below is the Windows tree-kill
    // primitive; the creation flag also prevents the child from sharing the
    // CLI's console process group.
    #[cfg(windows)]
    command.creation_flags(0x0000_0200);
}

async fn supervise(
    mut child: Child,
    process_id: Option<u32>,
    cancel_receiver: oneshot::Receiver<()>,
    deadline: Option<Instant>,
    mut stdin_task: Option<JoinHandle<()>>,
    stdout_task: JoinHandle<io::Result<Vec<u8>>>,
    stderr_task: JoinHandle<io::Result<Vec<u8>>>,
) -> io::Result<Output> {
    let mut kill_guard = TreeKillGuard::new(process_id);
    let mut cancel_receiver = cancel_receiver;
    let mut stdout_task = Some(stdout_task);
    let mut stderr_task = Some(stderr_task);
    let status = tokio::select! {
        biased;
        _ = &mut cancel_receiver => {
            terminate_and_reap(&mut child, process_id).await;
            stop_io_tasks(&mut stdin_task, &mut stdout_task, &mut stderr_task).await;
            kill_guard.disarm();
            return Err(io::Error::new(io::ErrorKind::Interrupted, "subprocess cancelled"));
        }
        _ = wait_for_deadline(deadline) => {
            terminate_and_reap(&mut child, process_id).await;
            stop_io_tasks(&mut stdin_task, &mut stdout_task, &mut stderr_task).await;
            kill_guard.disarm();
            return Err(io::Error::new(io::ErrorKind::TimedOut, "subprocess timed out"));
        }
        status = child.wait() => status?,
    };

    let stdout_event = tokio::select! {
        biased;
        _ = &mut cancel_receiver => PipeEvent::Cancelled,
        _ = wait_for_deadline(deadline) => PipeEvent::TimedOut,
        output = stdout_task.as_mut().expect("stdout task is present") => PipeEvent::Ready(output),
    };
    let stdout = match stdout_event {
        PipeEvent::Cancelled => {
            terminate_and_reap(&mut child, process_id).await;
            stop_io_tasks(&mut stdin_task, &mut stdout_task, &mut stderr_task).await;
            kill_guard.disarm();
            return Err(io::Error::new(
                io::ErrorKind::Interrupted,
                "subprocess cancelled",
            ));
        }
        PipeEvent::TimedOut => {
            terminate_and_reap(&mut child, process_id).await;
            stop_io_tasks(&mut stdin_task, &mut stdout_task, &mut stderr_task).await;
            kill_guard.disarm();
            return Err(io::Error::new(
                io::ErrorKind::TimedOut,
                "subprocess timed out",
            ));
        }
        PipeEvent::Ready(output) => {
            stdout_task.take();
            join_pipe(output)?
        }
    };

    let stderr_event = tokio::select! {
        biased;
        _ = &mut cancel_receiver => PipeEvent::Cancelled,
        _ = wait_for_deadline(deadline) => PipeEvent::TimedOut,
        output = stderr_task.as_mut().expect("stderr task is present") => PipeEvent::Ready(output),
    };
    let stderr = match stderr_event {
        PipeEvent::Cancelled => {
            terminate_and_reap(&mut child, process_id).await;
            stop_io_tasks(&mut stdin_task, &mut stdout_task, &mut stderr_task).await;
            kill_guard.disarm();
            return Err(io::Error::new(
                io::ErrorKind::Interrupted,
                "subprocess cancelled",
            ));
        }
        PipeEvent::TimedOut => {
            // The direct child can exit while a descendant still owns one of
            // its pipes. Kill the group before aborting the readers.
            terminate_and_reap(&mut child, process_id).await;
            stop_io_tasks(&mut stdin_task, &mut stdout_task, &mut stderr_task).await;
            kill_guard.disarm();
            return Err(io::Error::new(
                io::ErrorKind::TimedOut,
                "subprocess timed out",
            ));
        }
        PipeEvent::Ready(output) => {
            stderr_task.take();
            join_pipe(output)?
        }
    };

    if let Some(task) = stdin_task.take() {
        let _ = task.await;
    }
    kill_guard.disarm();
    Ok(Output {
        status,
        stdout,
        stderr,
    })
}

async fn read_pipe(mut pipe: impl AsyncRead + Unpin) -> io::Result<Vec<u8>> {
    let mut bytes = Vec::new();
    pipe.read_to_end(&mut bytes).await?;
    Ok(bytes)
}

fn join_pipe(result: Result<io::Result<Vec<u8>>, tokio::task::JoinError>) -> io::Result<Vec<u8>> {
    result.map_err(|error| io::Error::other(format!("output reader task failed: {error}")))?
}

async fn wait_for_deadline(deadline: Option<Instant>) {
    match deadline {
        Some(deadline) => sleep_until(deadline).await,
        None => pending::<()>().await,
    }
}

async fn stop_io_tasks(
    stdin_task: &mut Option<JoinHandle<()>>,
    stdout_task: &mut Option<JoinHandle<io::Result<Vec<u8>>>>,
    stderr_task: &mut Option<JoinHandle<io::Result<Vec<u8>>>>,
) {
    if let Some(task) = stdin_task.take() {
        task.abort();
        let _ = task.await;
    }
    if let Some(task) = stdout_task.take() {
        task.abort();
        let _ = task.await;
    }
    if let Some(task) = stderr_task.take() {
        task.abort();
        let _ = task.await;
    }
}

enum PipeEvent {
    Cancelled,
    TimedOut,
    Ready(Result<io::Result<Vec<u8>>, tokio::task::JoinError>),
}

async fn terminate_and_reap(child: &mut Child, process_id: Option<u32>) {
    signal_process_tree(process_id).await;
    let _ = child.start_kill();
    // SIGKILL/taskkill should make this quick. Keep a finite backstop so a
    // kernel-level uninterruptible child cannot wedge cancellation forever.
    let _ = tokio::time::timeout(REAP_TIMEOUT, child.wait()).await;
}

#[cfg(unix)]
async fn signal_process_tree(process_id: Option<u32>) {
    use nix::errno::Errno;
    use nix::sys::signal::{killpg, Signal};
    use nix::unistd::Pid;

    let Some(process_id) = process_id.and_then(|id| i32::try_from(id).ok()) else {
        return;
    };
    if let Err(error) = killpg(Pid::from_raw(process_id), Signal::SIGKILL) {
        if error != Errno::ESRCH {
            tracing::warn!(process_id, %error, "failed to signal subprocess process group");
        }
    }
}

#[cfg(windows)]
async fn signal_process_tree(process_id: Option<u32>) {
    let Some(process_id) = process_id else {
        return;
    };
    let mut taskkill = Command::new("taskkill");
    taskkill
        .args(["/PID", &process_id.to_string(), "/T", "/F"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    if let Ok(mut child) = taskkill.spawn() {
        let _ = tokio::time::timeout(REAP_TIMEOUT, child.wait()).await;
    }
}

#[cfg(not(any(unix, windows)))]
async fn signal_process_tree(_process_id: Option<u32>) {}

struct CancelOnDrop {
    sender: Option<oneshot::Sender<()>>,
    process_id: Option<u32>,
}

impl CancelOnDrop {
    fn new(sender: oneshot::Sender<()>, process_id: Option<u32>) -> Self {
        Self {
            sender: Some(sender),
            process_id,
        }
    }

    fn disarm(&mut self) {
        self.sender = None;
    }
}

impl Drop for CancelOnDrop {
    fn drop(&mut self) {
        if let Some(sender) = self.sender.take() {
            // Signal synchronously so descendants cannot keep acting while the
            // supervisor waits to be scheduled. It still owns and reaps the
            // direct child asynchronously.
            signal_process_tree_on_drop(self.process_id);
            let _ = sender.send(());
        }
    }
}

/// Last-resort synchronous tree signal if the supervisor itself is aborted
/// during runtime teardown. Normal cancellation is handled asynchronously by
/// `terminate_and_reap` and therefore also reaps the direct child.
struct TreeKillGuard {
    process_id: Option<u32>,
    armed: bool,
}

impl TreeKillGuard {
    fn new(process_id: Option<u32>) -> Self {
        Self {
            process_id,
            armed: true,
        }
    }

    fn disarm(&mut self) {
        self.armed = false;
    }
}

impl Drop for TreeKillGuard {
    fn drop(&mut self) {
        if !self.armed {
            return;
        }
        signal_process_tree_on_drop(self.process_id);
    }
}

#[cfg(unix)]
fn signal_process_tree_on_drop(process_id: Option<u32>) {
    if let Some(process_id) = process_id.and_then(|id| i32::try_from(id).ok()) {
        let _ = nix::sys::signal::killpg(
            nix::unistd::Pid::from_raw(process_id),
            nix::sys::signal::Signal::SIGKILL,
        );
    }
}

#[cfg(windows)]
fn signal_process_tree_on_drop(process_id: Option<u32>) {
    if let Some(process_id) = process_id {
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &process_id.to_string(), "/T", "/F"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
}

#[cfg(not(any(unix, windows)))]
fn signal_process_tree_on_drop(_process_id: Option<u32>) {}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use nix::errno::Errno;
    use nix::sys::signal::kill;
    use nix::unistd::Pid;
    use std::path::Path;

    #[test]
    fn executable_check_accepts_an_absolute_executable_without_spawning_a_lookup_process() {
        assert!(executable_exists("/bin/sh"));
    }

    #[tokio::test]
    async fn timeout_kills_tree_reaps_child_and_prevents_delayed_side_effect() {
        let temp = tempfile::tempdir().expect("temp directory");
        let sentinel = temp.path().join("sentinel");
        let pid_file = temp.path().join("pids");
        let script = delayed_sentinel_script(&sentinel, &pid_file);
        let mut command = Command::new("sh");
        command.arg("-c").arg(script);

        let error = output(command, None, Some(Duration::from_millis(100)))
            .await
            .expect_err("command must time out");
        assert_eq!(error.kind(), io::ErrorKind::TimedOut);

        let process_ids = read_process_ids(&pid_file).await;
        wait_for_processes_to_exit(&process_ids).await;
        tokio::time::sleep(Duration::from_millis(900)).await;
        assert!(
            !sentinel.exists(),
            "timed-out descendant wrote its delayed sentinel"
        );
        assert_processes_absent(&process_ids);
    }

    #[tokio::test]
    async fn dropping_an_interactive_child_kills_and_reaps_its_tree() {
        let temp = tempfile::tempdir().expect("temp directory");
        let sentinel = temp.path().join("interactive-sentinel");
        let pid_file = temp.path().join("interactive-pids");
        let mut command = Command::new("sh");
        command
            .arg("-c")
            .arg(delayed_sentinel_script(&sentinel, &pid_file));
        let child = ProcessTreeChild::spawn(command).expect("spawn interactive child");

        let process_ids = read_process_ids(&pid_file).await;
        drop(child);
        wait_for_processes_to_exit(&process_ids).await;
        tokio::time::sleep(Duration::from_millis(900)).await;
        assert!(
            !sentinel.exists(),
            "dropped interactive child wrote its delayed sentinel"
        );
        assert_processes_absent(&process_ids);
    }

    pub(super) fn delayed_sentinel_script(sentinel: &Path, pid_file: &Path) -> String {
        format!(
            "sh -c 'sleep 0.7; printf leaked > {}' & worker=$!; printf '%s\\n%s\\n' \"$$\" \"$worker\" > {}; wait \"$worker\"",
            crate::sandbox::shell_quote(&sentinel.to_string_lossy()),
            crate::sandbox::shell_quote(&pid_file.to_string_lossy()),
        )
    }

    pub(super) async fn read_process_ids(pid_file: &Path) -> Vec<i32> {
        let deadline = Instant::now() + Duration::from_secs(2);
        loop {
            if let Ok(contents) = tokio::fs::read_to_string(pid_file).await {
                let process_ids = contents
                    .lines()
                    .filter_map(|line| line.parse::<i32>().ok())
                    .collect::<Vec<_>>();
                if process_ids.len() == 2 {
                    return process_ids;
                }
            }
            assert!(Instant::now() < deadline, "subprocess did not publish PIDs");
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    }

    pub(super) async fn wait_for_processes_to_exit(process_ids: &[i32]) {
        let deadline = Instant::now() + Duration::from_secs(2);
        while process_ids.iter().copied().any(process_exists) {
            assert!(
                Instant::now() < deadline,
                "subprocess tree remained alive after cancellation: {process_ids:?}"
            );
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    }

    pub(super) fn assert_processes_absent(process_ids: &[i32]) {
        assert!(
            process_ids.iter().copied().all(|pid| !process_exists(pid)),
            "subprocess tree still exists: {process_ids:?}"
        );
    }

    fn process_exists(process_id: i32) -> bool {
        match kill(Pid::from_raw(process_id), None) {
            Ok(()) | Err(Errno::EPERM) => true,
            Err(Errno::ESRCH) => false,
            Err(_) => true,
        }
    }
}
