use anyhow::{bail, Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

const RUN_FILE: &str = "run.json";
const LOG_FILE: &str = "output.log";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackgroundRun {
    pub id: String,
    pub prompt: String,
    pub cwd: PathBuf,
    pub session_id: String,
    pub started_at: DateTime<Utc>,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub supervisor_pid: Option<u32>,
    #[serde(default)]
    pub pid: Option<u32>,
    #[serde(default)]
    pub finished_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub exit_code: Option<i32>,
    #[serde(default)]
    pub stopped: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_session: Option<String>,
    #[serde(default)]
    pub gathered: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RunState {
    Running,
    Finished,
    Failed,
    Stopped,
    Lost,
}

impl RunState {
    pub fn label(self) -> &'static str {
        match self {
            RunState::Running => "running",
            RunState::Finished => "finished",
            RunState::Failed => "failed",
            RunState::Stopped => "stopped",
            RunState::Lost => "ended without a result",
        }
    }
}

pub struct StartRequest<'a> {
    pub prompt: &'a str,
    pub resume_session: Option<&'a str>,
    pub model: Option<&'a str>,
    pub permission_mode: Option<&'a str>,
    pub parent_session: Option<&'a str>,
}

fn root() -> Result<PathBuf> {
    Ok(crate::config::CliConfig::config_dir()?.join("background"))
}

fn run_dir(id: &str) -> Result<PathBuf> {
    Ok(root()?.join(id))
}

pub fn log_path(run: &BackgroundRun) -> Result<PathBuf> {
    Ok(run_dir(&run.id)?.join(LOG_FILE))
}

fn create_private_dir(path: &Path) -> Result<()> {
    let mut builder = std::fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    builder
        .create(path)
        .with_context(|| format!("create {}", path.display()))
}

fn save(run: &BackgroundRun) -> Result<()> {
    save_in(&root()?, run)
}

fn load(id: &str) -> Result<BackgroundRun> {
    load_in(&root()?, id)
}

fn save_in(root: &Path, run: &BackgroundRun) -> Result<()> {
    let dir = root.join(&run.id);
    create_private_dir(&dir)?;
    let path = dir.join(RUN_FILE);
    let temp = dir.join(format!("{RUN_FILE}.{}.tmp", std::process::id()));
    std::fs::write(&temp, serde_json::to_vec_pretty(run)?)
        .with_context(|| format!("write {}", temp.display()))?;
    std::fs::rename(&temp, &path).with_context(|| format!("write {}", path.display()))
}

fn load_in(root: &Path, id: &str) -> Result<BackgroundRun> {
    let path = root.join(id).join(RUN_FILE);
    let bytes = std::fs::read(&path).with_context(|| format!("read {}", path.display()))?;
    serde_json::from_slice(&bytes).with_context(|| format!("parse {}", path.display()))
}

fn update_in(
    root: &Path,
    id: &str,
    change: impl FnOnce(&mut BackgroundRun),
) -> Result<BackgroundRun> {
    let mut run = load_in(root, id)?;
    change(&mut run);
    save_in(root, &run)?;
    Ok(run)
}

fn launch_in(
    root: &Path,
    mut run: BackgroundRun,
    launch_supervisor: impl FnOnce(&BackgroundRun) -> Result<u32>,
) -> Result<BackgroundRun> {
    save_in(root, &run)?;
    match launch_supervisor(&run) {
        Ok(supervisor_pid) => {
            run.supervisor_pid = Some(supervisor_pid);
            Ok(run)
        }
        Err(error) => {
            match update_in(root, &run.id, |stored| {
                stored.finished_at = Some(Utc::now());
                stored.exit_code = Some(-1);
            }) {
                Ok(_) => Err(error),
                Err(record_error) => Err(error.context(format!(
                    "the run could not be marked as failed to start: {record_error:#}"
                ))),
            }
        }
    }
}

pub fn list() -> Result<Vec<BackgroundRun>> {
    let root = root()?;
    let entries = match std::fs::read_dir(&root) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error).with_context(|| format!("read {}", root.display())),
    };
    let mut runs: Vec<BackgroundRun> = entries
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| entry.file_name().to_str().map(str::to_string))
        .filter_map(|id| load(&id).ok())
        .collect();
    runs.sort_by(|a, b| b.started_at.cmp(&a.started_at));
    Ok(runs)
}

pub fn find(reference: &str) -> Result<BackgroundRun> {
    let reference = reference.trim();
    if reference.is_empty() {
        bail!("Name a background run. `agi background list` shows them.");
    }
    let matches: Vec<BackgroundRun> = list()?
        .into_iter()
        .filter(|run| run.id.starts_with(reference))
        .collect();
    match matches.len() {
        0 => bail!("No background run '{reference}'. `agi background list` shows them."),
        1 => Ok(matches.into_iter().next().expect("one match")),
        count => bail!("'{reference}' matches {count} background runs; use more of the id."),
    }
}

pub fn state(run: &BackgroundRun) -> RunState {
    if run.finished_at.is_some() {
        return if run.stopped {
            RunState::Stopped
        } else if run.exit_code == Some(0) {
            RunState::Finished
        } else {
            RunState::Failed
        };
    }
    match run.supervisor_pid {
        Some(pid) if process_is_alive(pid) => RunState::Running,
        None => RunState::Running,
        Some(_) => RunState::Lost,
    }
}

pub fn start(request: StartRequest<'_>) -> Result<BackgroundRun> {
    let prompt = request.prompt.trim();
    if prompt.is_empty() {
        bail!("A background run needs a prompt.");
    }
    let cwd = std::env::current_dir().context("read the working directory")?;
    let id = uuid::Uuid::new_v4().simple().to_string()[..12].to_string();
    let mut args = vec!["--print".to_string()];
    let session_id = match request.resume_session {
        Some(session) => {
            args.extend(["--resume".to_string(), session.to_string()]);
            session.to_string()
        }
        None => {
            let session = uuid::Uuid::new_v4().to_string();
            args.extend(["--session-id".to_string(), session.clone()]);
            session
        }
    };
    if let Some(model) = request.model {
        args.extend(["--model".to_string(), model.to_string()]);
    }
    if let Some(mode) = request.permission_mode {
        args.extend(["--permission-mode".to_string(), mode.to_string()]);
    }
    args.extend(["--".to_string(), prompt.to_string()]);

    let run = BackgroundRun {
        id,
        prompt: prompt.to_string(),
        cwd: cwd.clone(),
        session_id,
        started_at: Utc::now(),
        args,
        supervisor_pid: None,
        pid: None,
        finished_at: None,
        exit_code: None,
        stopped: false,
        parent_session: request.parent_session.map(str::to_string),
        gathered: false,
    };
    launch_in(&root()?, run, |run| {
        let exe = std::env::current_exe().context("find the agi executable")?;
        let mut command = std::process::Command::new(exe);
        command
            .args(["background", "supervise", &run.id])
            .current_dir(&cwd)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());
        detach(&mut command);
        let child = command.spawn().context("start the background supervisor")?;
        Ok(child.id())
    })
}

pub fn hand_off(
    session: &mut crate::agent::AgentSession,
    instruction: &str,
) -> std::result::Result<String, String> {
    let instruction = instruction.trim();
    if instruction.is_empty() {
        return Err("/bg <instruction> moves this conversation to a background run that keeps working after the terminal closes, and starts a new conversation here.".to_string());
    }
    session.persist_managed_session().map_err(|error| {
        format!("Could not save this conversation for the background run: {error:#}")
    })?;
    let session_id = session
        .managed_session_id()
        .map(str::to_string)
        .ok_or_else(|| {
            "This conversation is not being saved, so it cannot move to the background.".to_string()
        })?;
    let mode = clap::ValueEnum::to_possible_value(&session.permission_mode)
        .map(|value| value.get_name().to_string());
    let run = start(StartRequest {
        prompt: instruction,
        resume_session: Some(&session_id),
        model: None,
        permission_mode: mode.as_deref(),
        parent_session: None,
    })
    .map_err(|error| format!("Could not start the background run: {error:#}"))?;
    if let Err(error) = session.start_fresh_managed_session() {
        return Ok(format!(
            "Background run {} started, but a new conversation could not be opened here: {error:#}",
            run.id
        ));
    }
    Ok(format!(
        "Moved this conversation to background run {id}; it keeps going after this terminal closes. This is a new conversation.\n  agi background logs {id}    see its output\n  agi background attach {id}  continue it when it is done",
        id = run.id
    ))
}

pub fn spawn_thread(
    session: &mut crate::agent::AgentSession,
    instruction: &str,
) -> std::result::Result<String, String> {
    let instruction = instruction.trim();
    if instruction.is_empty() {
        return Err("/thread <instruction> starts a parallel thread with a copy of this conversation. /threads lists them and /gather brings their results back here.".to_string());
    }
    session
        .persist_managed_session()
        .map_err(|error| format!("Could not save this conversation for the thread: {error:#}"))?;
    let parent = session
        .managed_session_id()
        .map(str::to_string)
        .ok_or_else(|| {
            "This conversation is not being saved, so it cannot start threads.".to_string()
        })?;
    let fork = crate::runtime::session_control::fork_managed_session(&parent)
        .map_err(|error| format!("Could not copy this conversation: {error:#}"))?;
    let mode = clap::ValueEnum::to_possible_value(&session.permission_mode)
        .map(|value| value.get_name().to_string());
    let run = start(StartRequest {
        prompt: instruction,
        resume_session: Some(&fork.summary.session_id),
        model: None,
        permission_mode: mode.as_deref(),
        parent_session: Some(&parent),
    })
    .map_err(|error| format!("Could not start the thread: {error:#}"))?;
    Ok(format!(
        "Started thread {} on a copy of this conversation. It runs in parallel; /threads shows progress and /gather brings finished results back here.",
        run.id
    ))
}

fn threads_of(parent: &str) -> Vec<BackgroundRun> {
    let mut runs: Vec<BackgroundRun> = list()
        .unwrap_or_default()
        .into_iter()
        .filter(|run| run.parent_session.as_deref() == Some(parent))
        .collect();
    runs.reverse();
    runs
}

pub fn threads_summary(session: &crate::agent::AgentSession) -> String {
    let Some(parent) = session.managed_session_id() else {
        return "This conversation is not being saved, so it has no threads.".to_string();
    };
    let runs = threads_of(parent);
    if runs.is_empty() {
        return "No threads yet. /thread <instruction> starts one.".to_string();
    }
    let mut lines = vec![format!("Threads from this conversation ({}):", runs.len())];
    for run in &runs {
        let gathered = if run.gathered { ", gathered" } else { "" };
        lines.push(format!(
            "  {}  {}{gathered}  {}",
            run.id,
            state(run).label(),
            crate::terminal_text::sanitize_terminal_text(&run.prompt)
        ));
    }
    lines.push("/gather brings the finished ones back here.".to_string());
    lines.join("\n")
}

pub fn gather_prompt(session: &crate::agent::AgentSession) -> std::result::Result<String, String> {
    let Some(parent) = session.managed_session_id() else {
        return Err("This conversation is not being saved, so it has no threads.".to_string());
    };
    let runs = threads_of(parent);
    let still_running = runs
        .iter()
        .filter(|run| state(run) == RunState::Running)
        .count();
    let mut sections = Vec::new();
    let mut gathered = Vec::new();
    for run in runs.into_iter().filter(|run| !run.gathered) {
        let answer = match state(&run) {
            RunState::Running => continue,
            RunState::Finished => {
                crate::runtime::session_control::load_managed_session(&run.session_id)
                    .ok()
                    .and_then(|managed| {
                        managed
                            .messages
                            .iter()
                            .rev()
                            .find(|message| message.role == "assistant")
                            .map(|message| message.text_content())
                    })
                    .unwrap_or_else(|| "(the thread finished without an answer)".to_string())
            }
            other => format!(
                "(the thread {} without an answer; `agi background logs {}` shows why)",
                other.label(),
                run.id
            ),
        };
        sections.push(format!(
            "### Thread {}: {}\n{}",
            run.id,
            run.prompt,
            answer.trim()
        ));
        gathered.push(run);
    }
    if sections.is_empty() {
        return Err(if still_running > 0 {
            format!(
                "{still_running} thread(s) still running and none finished since the last /gather."
            )
        } else {
            "No finished threads to gather. /thread <instruction> starts one.".to_string()
        });
    }
    for mut run in gathered {
        run.gathered = true;
        let _ = save(&run);
    }
    let pending = if still_running > 0 {
        format!("\n{still_running} more thread(s) are still running; they are not included.")
    } else {
        String::new()
    };
    Ok(format!(
        "These are the results of the parallel threads started from this conversation.{pending}\n\n{}\n\nBring them together: reconcile any conflicts between them, and give one combined answer.",
        sections.join("\n\n")
    ))
}

pub fn supervise(id: &str) -> Result<()> {
    let root = root()?;
    supervise_in(&root, id, |run| {
        let log = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(root.join(&run.id).join(LOG_FILE))
            .context("open the background log")?;
        let exe = std::env::current_exe().context("find the agi executable")?;
        let mut command = std::process::Command::new(exe);
        command
            .args(&run.args)
            .current_dir(&run.cwd)
            .env("AGI_BACKGROUND_RUN", &run.id)
            .stdin(std::process::Stdio::null())
            .stdout(log.try_clone().context("share the background log")?)
            .stderr(log);
        command.spawn().context("start the background run")
    })
}

fn supervise_in(
    root: &Path,
    id: &str,
    start_child: impl FnOnce(&BackgroundRun) -> Result<std::process::Child>,
) -> Result<()> {
    let run = update_in(root, id, |run| {
        run.supervisor_pid = Some(std::process::id());
    })?;
    let mut child = match start_child(&run) {
        Ok(child) => child,
        Err(error) => {
            update_in(root, id, |run| {
                run.finished_at = Some(Utc::now());
                run.exit_code = Some(-1);
            })?;
            return Err(error);
        }
    };
    let child_pid = child.id();
    let recorded = update_in(root, id, |run| run.pid = Some(child_pid));
    let status = child.wait().context("wait for the background run")?;
    update_in(root, id, |run| {
        run.finished_at = Some(Utc::now());
        run.exit_code = Some(status.code().unwrap_or(-1));
    })?;
    recorded.map(|_| ())
}

pub fn stop(reference: &str) -> Result<BackgroundRun> {
    let run = find(reference)?;
    if state(&run) != RunState::Running {
        bail!(
            "Background run {} is not running ({}).",
            run.id,
            state(&run).label()
        );
    }
    let run = update_in(&root()?, &run.id, |run| run.stopped = true)?;
    if let Some(pid) = run.pid {
        terminate(pid)?;
    } else if let Some(pid) = run.supervisor_pid {
        terminate(pid)?;
    }
    Ok(run)
}

pub fn remove(reference: &str) -> Result<BackgroundRun> {
    let run = find(reference)?;
    if state(&run) == RunState::Running {
        bail!(
            "Background run {} is still running. Stop it first with `agi background stop {}`.",
            run.id,
            run.id
        );
    }
    let dir = run_dir(&run.id)?;
    std::fs::remove_dir_all(&dir).with_context(|| format!("remove {}", dir.display()))?;
    Ok(run)
}

pub fn read_log(run: &BackgroundRun) -> Result<String> {
    match std::fs::read(log_path(run)?) {
        Ok(bytes) => Ok(String::from_utf8_lossy(&bytes).into_owned()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(error) => Err(error).context("read the background log"),
    }
}

pub fn describe(run: &BackgroundRun) -> String {
    let prompt: String = run.prompt.chars().take(60).collect();
    let prompt = if run.prompt.chars().count() > 60 {
        format!("{prompt}…")
    } else {
        prompt
    };
    format!(
        "{}  {:<22}  {}  {}  {}",
        run.id,
        state(run).label(),
        run.started_at.format("%Y-%m-%d %H:%M"),
        crate::terminal_text::sanitize_terminal_text(&run.cwd.display().to_string()),
        crate::terminal_text::sanitize_terminal_text(&prompt)
    )
}

#[cfg(unix)]
#[allow(unsafe_code)]
fn detach(command: &mut std::process::Command) {
    use std::os::unix::process::CommandExt;

    unsafe {
        command.pre_exec(|| {
            nix::unistd::setsid()?;
            Ok(())
        });
    }
}

#[cfg(windows)]
fn detach(command: &mut std::process::Command) {
    use std::os::windows::process::CommandExt;

    const DETACHED_PROCESS: u32 = 0x0000_0008;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
    command.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP);
}

#[cfg(not(any(unix, windows)))]
fn detach(_command: &mut std::process::Command) {}

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
    match kill(Pid::from_raw(pid), None) {
        Ok(()) => true,
        Err(Errno::EPERM) => true,
        Err(_) => false,
    }
}

#[cfg(windows)]
fn process_is_alive(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }
    let filter = format!("PID eq {pid}");
    std::process::Command::new("tasklist")
        .args(["/FI", filter.as_str(), "/FO", "CSV", "/NH"])
        .stdin(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .output()
        .map(|output| String::from_utf8_lossy(&output.stdout).contains(&format!(",\"{pid}\",")))
        .unwrap_or(true)
}

#[cfg(not(any(unix, windows)))]
fn process_is_alive(pid: u32) -> bool {
    pid != 0
}

#[cfg(unix)]
fn terminate(pid: u32) -> Result<()> {
    use nix::sys::signal::{kill, Signal};
    use nix::unistd::Pid;

    let pid = i32::try_from(pid).context("process id out of range")?;
    match kill(Pid::from_raw(pid), Signal::SIGTERM) {
        Ok(()) | Err(nix::errno::Errno::ESRCH) => Ok(()),
        Err(error) => Err(error).context("stop the background run"),
    }
}

#[cfg(not(unix))]
fn terminate(pid: u32) -> Result<()> {
    let status = std::process::Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .context("run taskkill")?;
    if !status.success() {
        bail!("taskkill could not stop process {pid}");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(id: &str) -> BackgroundRun {
        BackgroundRun {
            id: id.to_string(),
            prompt: "fixture".to_string(),
            cwd: std::env::temp_dir(),
            session_id: "fixture-session".to_string(),
            started_at: Utc::now(),
            args: Vec::new(),
            supervisor_pid: None,
            pid: None,
            finished_at: None,
            exit_code: None,
            stopped: false,
            parent_session: None,
            gathered: false,
        }
    }

    #[test]
    fn a_starter_that_returns_late_keeps_the_supervisors_pid_and_result() {
        let root = tempfile::tempdir().expect("root");
        let started = launch_in(root.path(), fixture("lateack"), |run| {
            update_in(root.path(), &run.id, |stored| {
                stored.supervisor_pid = Some(4_000_001);
                stored.pid = Some(4_000_002);
            })?;
            update_in(root.path(), &run.id, |stored| {
                stored.finished_at = Some(Utc::now());
                stored.exit_code = Some(0);
            })?;
            Ok(4_000_001)
        })
        .expect("launch");
        assert_eq!(started.supervisor_pid, Some(4_000_001));
        let stored = load_in(root.path(), "lateack").expect("stored run");
        assert_eq!(stored.pid, Some(4_000_002));
        assert_eq!(stored.exit_code, Some(0));
        assert_eq!(state(&stored), RunState::Finished);
    }

    #[test]
    fn a_supervisor_that_cannot_launch_leaves_a_failed_record() {
        let root = tempfile::tempdir().expect("root");
        let error = launch_in(root.path(), fixture("nolaunch"), |_| {
            anyhow::bail!("supervisor fixture refused")
        })
        .expect_err("launch failure");
        assert!(error.to_string().contains("supervisor fixture refused"));
        let stored = load_in(root.path(), "nolaunch").expect("stored run");
        assert_eq!(state(&stored), RunState::Failed);
    }

    #[cfg(unix)]
    #[test]
    fn the_supervisor_owns_its_pid_and_keeps_a_stop_recorded_while_it_ran() {
        let root = tempfile::tempdir().expect("root");
        save_in(root.path(), &fixture("owned")).expect("initial record");
        supervise_in(root.path(), "owned", |run| {
            assert_eq!(run.supervisor_pid, Some(std::process::id()));
            update_in(root.path(), &run.id, |stored| stored.stopped = true)?;
            Ok(std::process::Command::new("/bin/sh")
                .args(["-c", "exit 3"])
                .spawn()?)
        })
        .expect("supervise");
        let stored = load_in(root.path(), "owned").expect("stored run");
        assert_eq!(stored.supervisor_pid, Some(std::process::id()));
        assert!(stored.pid.is_some());
        assert_eq!(stored.exit_code, Some(3));
        assert_eq!(state(&stored), RunState::Stopped);
    }
}
