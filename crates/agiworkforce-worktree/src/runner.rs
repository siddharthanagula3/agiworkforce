use async_trait::async_trait;
use std::io;
use std::path::PathBuf;
use std::process::{Output, Stdio};
use std::time::Duration;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;

/// Runs one subprocess to completion and collects its output.
///
/// `stdin` is written and closed while output is collected. When `timeout`
/// elapses, or when the returned future is dropped, the subprocess must not
/// outlive the call.
#[async_trait]
pub trait CommandRunner: Send + Sync {
    async fn output(
        &self,
        command: Command,
        stdin: Option<Vec<u8>>,
        timeout: Option<Duration>,
    ) -> io::Result<Output>;

    /// [`Self::output`], keeping `held` until the subprocess has exited. A
    /// runner whose subprocess can outlive a dropped future must move `held`
    /// along with that subprocess, so what it guards, such as a private index,
    /// is not released to the next caller while the subprocess still uses it.
    async fn output_holding(
        &self,
        command: Command,
        stdin: Option<Vec<u8>>,
        timeout: Option<Duration>,
        held: Held,
    ) -> io::Result<Output> {
        let output = self.output(command, stdin, timeout).await;
        drop(held);
        output
    }

    /// Whether the user trusts the folders of the repositories this runner's
    /// git works in, so a code-running setting their recorded baseline holds
    /// may run under host git even from a file in the work tree. A setting
    /// the baseline does not hold refuses either way; see
    /// [`crate::config_guard`]. Untrusted unless a host says so.
    fn trusts_repository_config(&self) -> bool {
        false
    }
}

/// `inner`, for a repository whose folder the user trusts: the host read its
/// own trust record for the folder and found it trusted.
pub struct TrustedConfigRunner<'a>(pub &'a dyn CommandRunner);

#[async_trait]
impl CommandRunner for TrustedConfigRunner<'_> {
    async fn output(
        &self,
        command: Command,
        stdin: Option<Vec<u8>>,
        timeout: Option<Duration>,
    ) -> io::Result<Output> {
        self.0.output(command, stdin, timeout).await
    }

    async fn output_holding(
        &self,
        command: Command,
        stdin: Option<Vec<u8>>,
        timeout: Option<Duration>,
        held: Held,
    ) -> io::Result<Output> {
        self.0.output_holding(command, stdin, timeout, held).await
    }

    fn trusts_repository_config(&self) -> bool {
        true
    }
}

/// Whatever a caller needs kept alive for exactly as long as one subprocess.
pub type Held = Box<dyn std::any::Any + Send>;

/// The runner for a host without its own process-tree supervisor. It kills the
/// direct child on drop or timeout; git spawns no long-lived children of its
/// own for the commands this crate runs.
pub struct TokioCommandRunner;

#[async_trait]
impl CommandRunner for TokioCommandRunner {
    async fn output(
        &self,
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
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        let mut child = command.spawn()?;
        let feed = match (child.stdin.take(), stdin) {
            (Some(mut pipe), Some(bytes)) => Some(tokio::spawn(async move {
                pipe.write_all(&bytes).await?;
                pipe.shutdown().await
            })),
            _ => None,
        };
        let waited = match timeout {
            Some(limit) => tokio::time::timeout(limit, child.wait_with_output())
                .await
                .map_err(|_| {
                    io::Error::new(
                        io::ErrorKind::TimedOut,
                        "the subprocess did not finish in time",
                    )
                })?,
            None => child.wait_with_output().await,
        };
        if let Some(feed) = feed {
            let _ = feed.await;
        }
        waited
    }
}

/// Runs every command with one git directory and work tree named, so git never
/// discovers a repository on its own: a `.git` a sandboxed command plants
/// below the work tree later cannot redirect the host's git to configuration
/// it wrote.
pub(crate) struct PinnedRunner<'a> {
    inner: &'a dyn CommandRunner,
    git_dir: PathBuf,
    work_tree: PathBuf,
    trusted: bool,
}

impl<'a> PinnedRunner<'a> {
    pub(crate) fn new(inner: &'a dyn CommandRunner, git_dir: PathBuf, work_tree: PathBuf) -> Self {
        Self {
            trusted: inner.trusts_repository_config(),
            inner,
            git_dir,
            work_tree,
        }
    }

    /// Trust the repository's configuration as well when `trusted`.
    pub(crate) fn trusting(mut self, trusted: bool) -> Self {
        self.trusted |= trusted;
        self
    }

    fn pin(&self, command: &mut Command) {
        command
            .env("GIT_DIR", &self.git_dir)
            .env("GIT_WORK_TREE", &self.work_tree);
    }
}

#[async_trait]
impl CommandRunner for PinnedRunner<'_> {
    async fn output(
        &self,
        mut command: Command,
        stdin: Option<Vec<u8>>,
        timeout: Option<Duration>,
    ) -> io::Result<Output> {
        self.pin(&mut command);
        self.inner.output(command, stdin, timeout).await
    }

    async fn output_holding(
        &self,
        mut command: Command,
        stdin: Option<Vec<u8>>,
        timeout: Option<Duration>,
        held: Held,
    ) -> io::Result<Output> {
        self.pin(&mut command);
        self.inner
            .output_holding(command, stdin, timeout, held)
            .await
    }

    fn trusts_repository_config(&self) -> bool {
        self.trusted
    }
}
