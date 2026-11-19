use crate::{
    path_security::WorkspaceFileAuthority,
    sandbox::{NetworkPolicy, SandboxManager, SandboxMode, SandboxPolicy},
    terminals::{self, BackgroundCommand, CommandState},
};
use agiworkforce_app_server::DeveloperSessionHostError as Error;
use agiworkforce_protocol::workspace_terminal::*;
use sha2::{Digest, Sha256};
use std::{
    collections::VecDeque,
    num::NonZeroU16,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex as StdMutex, MutexGuard,
    },
    time::{Duration, Instant},
};
use tokio::sync::{mpsc, Mutex};

fn lock<T>(value: &StdMutex<T>) -> MutexGuard<'_, T> {
    value
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}
fn invalid(error: impl std::fmt::Display) -> Error {
    Error::invalid_request(error.to_string())
}
fn conflict(error: impl std::fmt::Display) -> Error {
    Error::conflict(error.to_string())
}
fn dims(size: TerminalSize) -> Result<(NonZeroU16, NonZeroU16), Error> {
    if !size.valid() {
        return Err(invalid("The terminal size exceeds the supported grid"));
    }
    Ok((
        NonZeroU16::new(size.rows).ok_or_else(|| invalid("No terminal rows"))?,
        NonZeroU16::new(size.columns).ok_or_else(|| invalid("No terminal columns"))?,
    ))
}

struct Replies {
    send: mpsc::Sender<String>,
    overflow: bool,
}
impl vt100::Callbacks for Replies {
    fn unhandled_csi(
        &mut self,
        screen: &mut vt100::Screen,
        i1: Option<u8>,
        i2: Option<u8>,
        params: &[&[u16]],
        c: char,
    ) {
        if i1.is_some() || i2.is_some() {
            return;
        }
        let reply = match (
            c,
            params
                .first()
                .and_then(|value| value.first())
                .copied()
                .unwrap_or(0),
        ) {
            ('n', 6) => {
                let (row, col) = visible_cursor(screen);
                format!("\x1b[{};{}R", row + 1, col + 1)
            }
            ('n', 5) => "\x1b[0n".into(),
            ('c', 0) => "\x1b[?1;2c".into(),
            _ => return,
        };
        if self.send.try_send(reply).is_err() {
            self.overflow = true;
        }
    }
}
struct Display {
    parser: vt100::Parser<Replies>,
    revision: u64,
    error: Option<String>,
}
struct Control {
    last: Option<(u64, Vec<u8>)>,
}
struct Record {
    plan: StdMutex<TerminalPlan>,
    command: Arc<BackgroundCommand>,
    display: Arc<StdMutex<Display>>,
    control: Mutex<Control>,
    next_input: AtomicU64,
    reply_task: tokio::task::JoinHandle<()>,
}
impl Drop for Record {
    fn drop(&mut self) {
        if self.command.state() == CommandState::Running {
            self.command.request_terminal_stop();
        }
        self.reply_task.abort();
    }
}
impl Record {
    fn summary(&self) -> TerminalSummary {
        let state = self.command.state();
        let (state, exit_code) = match state {
            CommandState::Running => (TerminalState::Running, None),
            CommandState::Stopped if self.command.terminal_quiesced() => {
                (TerminalState::Stopped, None)
            }
            CommandState::Exited(code) if self.command.terminal_quiesced() => {
                (TerminalState::Exited, code)
            }
            _ => (TerminalState::Closing, None),
        };
        let display = lock(&self.display);
        TerminalSummary {
            plan: lock(&self.plan).clone(),
            state,
            exit_code,
            next_input_sequence: self.next_input.load(Ordering::Acquire),
            revision: display.revision,
            error: display
                .error
                .clone()
                .or_else(|| self.command.terminal_cleanup_error()),
        }
    }
}
struct Pending {
    plan: TerminalPlan,
    created: Instant,
}
#[derive(Default)]
struct State {
    closed: bool,
    pending: Option<Pending>,
    records: VecDeque<Arc<Record>>,
    retired: VecDeque<TerminalSummary>,
}
impl State {
    fn remember(&mut self, summary: TerminalSummary) {
        self.retired
            .retain(|old| old.plan.terminal_id != summary.plan.terminal_id);
        self.retired.push_back(summary);
        while self.retired.len() > MAX_TERMINAL_LAUNCH_HISTORY {
            self.retired.pop_front();
        }
    }
}
fn cancelled(plan: TerminalPlan) -> TerminalSummary {
    TerminalSummary {
        plan,
        state: TerminalState::Stopped,
        revision: 0,
        next_input_sequence: 0,
        exit_code: None,
        error: None,
    }
}
#[derive(Default)]
pub(super) struct WorkspaceTerminals {
    state: Mutex<State>,
}

fn recipe(
    authority: &WorkspaceFileAuthority,
    root: &str,
    id: String,
    size: TerminalSize,
) -> Result<(TerminalPlan, SandboxManager), Error> {
    super::workspace_files::check_root(authority, root)?;
    dims(size)?;
    let manager = if crate::sandbox::sandbox_disabled_for_workspace(authority.root()) {
        SandboxManager::new(
            SandboxPolicy::DangerFullAccess,
            authority.root().to_path_buf(),
        )
        .with_network(NetworkPolicy::Allow)
    } else {
        SandboxManager::for_agent_command(authority.root().to_path_buf(), NetworkPolicy::Deny)
            .map_err(invalid)?
    };
    if manager.workspace_dir != authority.root() {
        return Err(Error::unavailable(
            "The selected folder cannot be the command workspace under this sandbox policy",
        ));
    }
    if matches!(manager.sandbox_type, crate::sandbox::SandboxType::None)
        && !matches!(manager.policy, SandboxPolicy::DangerFullAccess)
    {
        return Err(Error::unavailable(
            "The configured operating-system sandbox is unavailable for this terminal",
        ));
    }
    if !crate::process_tree::executable_exists(crate::process_tree::HOST_SHELL) {
        return Err(Error::unavailable(
            "The host's interactive shell is unavailable",
        ));
    }
    let mode = match manager.policy {
        SandboxPolicy::ReadOnly => SandboxMode::ReadOnly,
        SandboxPolicy::WorkspaceWrite { .. } => SandboxMode::Contained,
        SandboxPolicy::DangerFullAccess => SandboxMode::Unrestricted,
    };
    Ok((
        TerminalPlan {
            root_key: root.into(),
            terminal_id: id,
            cwd: authority.root().display().to_string(),
            shell: crate::process_tree::HOST_SHELL.into(),
            sandbox: mode.name().into(),
            network_allowed: matches!(manager.network_policy, NetworkPolicy::Allow),
            size,
        },
        manager,
    ))
}

impl WorkspaceTerminals {
    pub(super) async fn plan(
        &self,
        authority: WorkspaceFileAuthority,
        params: TerminalPlanParams,
    ) -> Result<TerminalPlan, Error> {
        let (plan, _) = tokio::task::spawn_blocking(move || {
            recipe(
                &authority,
                &params.root_key,
                uuid::Uuid::new_v4().to_string(),
                params.size,
            )
        })
        .await
        .map_err(invalid)??;
        let mut state = self.state.lock().await;
        if state.closed {
            return Err(Error::unavailable("The coding host is shutting down"));
        }
        if state.records.len() >= MAX_WORKSPACE_TERMINALS {
            return Err(conflict("Close a terminal before starting another"));
        }
        if let Some(pending) = state.pending.take() {
            state.remember(cancelled(pending.plan));
        }
        state.pending = Some(Pending {
            plan: plan.clone(),
            created: Instant::now(),
        });
        Ok(plan)
    }
    async fn get(&self, params: &TerminalIdParams) -> Result<Arc<Record>, Error> {
        self.state
            .lock()
            .await
            .records
            .iter()
            .find(|record| {
                let plan = lock(&record.plan);
                plan.root_key == params.root_key && plan.terminal_id == params.terminal_id
            })
            .cloned()
            .ok_or_else(|| {
                Error::not_found("This terminal does not belong to the connected coding host")
            })
    }
    pub(super) async fn start(
        &self,
        authority: WorkspaceFileAuthority,
        params: TerminalIdParams,
    ) -> Result<TerminalSummary, Error> {
        super::workspace_files::check_root(&authority, &params.root_key)?;
        let mut state = self.state.lock().await;
        if state.closed {
            return Err(Error::unavailable("The coding host is shutting down"));
        }
        if let Some(record) = state.records.iter().find(|record| {
            let plan = lock(&record.plan);
            plan.root_key == params.root_key && plan.terminal_id == params.terminal_id
        }) {
            return Ok(record.summary());
        }
        if !state.pending.as_ref().is_some_and(|pending| {
            pending.plan.root_key == params.root_key
                && pending.plan.terminal_id == params.terminal_id
        }) {
            return Err(conflict(
                "The terminal launch review expired or changed. Review it again.",
            ));
        }
        let pending = state
            .pending
            .take()
            .ok_or_else(|| conflict("The terminal launch review changed"))?;
        if pending.created.elapsed() > Duration::from_millis(TERMINAL_CONSENT_LIFETIME_MS) {
            state.remember(cancelled(pending.plan));
            return Err(conflict(
                "The terminal launch review expired. Review it again.",
            ));
        }
        if state.records.len() >= MAX_WORKSPACE_TERMINALS {
            state.remember(cancelled(pending.plan));
            return Err(conflict("Close a terminal before starting another"));
        }
        let prepared = recipe(
            &authority,
            &params.root_key,
            params.terminal_id,
            pending.plan.size,
        );
        let (plan, manager) = match prepared {
            Ok(prepared) => prepared,
            Err(error) => {
                state.remember(cancelled(pending.plan));
                return Err(error);
            }
        };
        if plan != pending.plan {
            state.remember(cancelled(pending.plan));
            return Err(conflict(
                "The coding folder or sandbox policy changed after launch review",
            ));
        }
        let (rows, columns) = dims(plan.size)?;
        let (reply_send, mut reply_read) = mpsc::channel(MAX_PENDING_TERMINAL_INPUTS);
        let display = Arc::new(StdMutex::new(Display {
            parser: vt100::Parser::new_with_callbacks(
                rows,
                columns,
                TERMINAL_SCROLLBACK_LINES,
                Replies {
                    send: reply_send,
                    overflow: false,
                },
            ),
            revision: 0,
            error: None,
        }));
        let output = display.clone();
        let observer = Arc::new(move |bytes: &[u8]| {
            let mut state = lock(&output);
            state.parser.process(bytes);
            state.revision = state.revision.saturating_add(1);
            if state.parser.callbacks().overflow {
                state.error = Some("The terminal response queue overflowed. Close this terminal before continuing.".into());
            }
        });
        let grant = match authority.process_directory() {
            Ok(grant) => grant,
            Err(error) => {
                state.remember(cancelled(plan));
                return Err(invalid(error));
            }
        };
        let cwd = authority.root().to_path_buf();
        let size = plan.size;
        // Spawn and publication stay in one poll so cancellation cannot orphan a PTY.
        let spawned = terminals::start_terminal(
            crate::process_tree::HOST_SHELL,
            (size.rows, size.columns),
            observer,
            |terminal| {
                let args = vec!["-i".to_owned()];
                let mut prepared = crate::sandbox::operator_background_command(
                    &manager,
                    crate::sandbox::Invocation::Program {
                        program: crate::process_tree::HOST_SHELL,
                        args: &args,
                    },
                    &cwd,
                    terminal,
                )?;
                pin_directory(&mut prepared.command, grant);
                Ok(prepared)
            },
        );
        let spawned = match spawned {
            Ok(spawned) => spawned,
            Err(error) => {
                state.remember(cancelled(plan));
                return Err(invalid(error));
            }
        };
        let scope_result = super::workspace_files::check_root(&authority, &plan.root_key);
        let command = spawned.command().clone();
        let responses = command.clone();
        let errors = display.clone();
        let reply_task = tokio::spawn(async move {
            while let Some(text) = reply_read.recv().await {
                if let Err(error) = terminals::write_terminal(responses.clone(), &text).await {
                    if responses.state() == CommandState::Running {
                        lock(&errors).error = Some(error.to_string());
                    }
                    break;
                }
            }
        });
        let record = Arc::new(Record {
            plan: StdMutex::new(plan),
            command,
            display,
            control: Mutex::new(Control { last: None }),
            next_input: AtomicU64::new(0),
            reply_task,
        });
        let summary = record.summary();
        if let Err(error) = &scope_result {
            lock(&record.display).error = Some(error.to_string());
            record.command.request_terminal_stop();
        }
        state.records.push_back(record);
        spawned.adopt();
        scope_result?;
        Ok(summary)
    }
    pub(super) async fn list(
        &self,
        authority: &WorkspaceFileAuthority,
        params: TerminalListParams,
    ) -> Result<TerminalListResponse, Error> {
        super::workspace_files::check_root(authority, &params.root_key)?;
        Ok(TerminalListResponse {
            root_key: params.root_key.clone(),
            terminals: self
                .state
                .lock()
                .await
                .records
                .iter()
                .filter(|record| lock(&record.plan).root_key == params.root_key)
                .map(|record| record.summary())
                .collect(),
        })
    }
    pub(super) async fn read(
        &self,
        authority: &WorkspaceFileAuthority,
        params: TerminalReadParams,
    ) -> Result<TerminalReadResponse, Error> {
        let record = self
            .get(&TerminalIdParams {
                root_key: params.root_key.clone(),
                terminal_id: params.terminal_id,
            })
            .await?;
        if let Err(error) = super::workspace_files::check_root(authority, &params.root_key) {
            if record.command.state() == CommandState::Running {
                record.command.request_terminal_stop();
            }
            return Err(error);
        }
        if lock(&record.display).error.is_some() && record.command.state() == CommandState::Running
        {
            record.command.request_terminal_stop();
        }
        let _control = record.control.lock().await;
        let summary = record.summary();
        let screen = if params.after_revision == Some(summary.revision) {
            None
        } else {
            Some(project_screen(
                &lock(&record.display).parser,
                params.scrollback,
            ))
        };
        let response = TerminalReadResponse {
            terminal: summary,
            screen,
        };
        if serde_json::to_vec(&response).map_err(invalid)?.len() > super::TRANSCRIPT_JSON_BUDGET {
            return Err(Error::unavailable(
                "The terminal screen exceeds the response budget. Resize it to a smaller grid.",
            ));
        }
        Ok(response)
    }
    pub(super) async fn write(
        &self,
        authority: &WorkspaceFileAuthority,
        params: TerminalWriteParams,
    ) -> Result<TerminalSummary, Error> {
        super::workspace_files::check_root(authority, &params.root_key)?;
        if params.text.is_empty() || params.text.len() > MAX_TERMINAL_INPUT_BYTES {
            return Err(invalid("The terminal input exceeds its chunk limit"));
        }
        let record = self
            .get(&TerminalIdParams {
                root_key: params.root_key,
                terminal_id: params.terminal_id,
            })
            .await?;
        let mut control = record.control.lock().await;
        let digest = Sha256::digest(params.text.as_bytes()).to_vec();
        let next = record.next_input.load(Ordering::Acquire);
        if next != params.sequence {
            if control
                .last
                .as_ref()
                .is_some_and(|(sequence, hash)| *sequence == params.sequence && *hash == digest)
            {
                return Ok(record.summary());
            }
            return Err(conflict(
                "The terminal input sequence changed; reopen its view before typing",
            ));
        }
        let following = next
            .checked_add(1)
            .ok_or_else(|| conflict("The terminal input sequence is exhausted"))?;
        if lock(&record.display).error.is_some() {
            return Err(conflict("Terminal input is paused after an I/O error"));
        }
        if let Err(error) = terminals::write_terminal(record.command.clone(), &params.text).await {
            lock(&record.display).error = Some(error.to_string());
            return Err(conflict(error));
        }
        control.last = Some((next, digest));
        record.next_input.store(following, Ordering::Release);
        Ok(record.summary())
    }
    pub(super) async fn resize(
        &self,
        authority: &WorkspaceFileAuthority,
        params: TerminalResizeParams,
    ) -> Result<TerminalSummary, Error> {
        super::workspace_files::check_root(authority, &params.root_key)?;
        let (rows, cols) = dims(params.size)?;
        let record = self
            .get(&TerminalIdParams {
                root_key: params.root_key,
                terminal_id: params.terminal_id,
            })
            .await?;
        let _control = record.control.lock().await;
        record
            .command
            .resize_terminal(params.size.rows, params.size.columns)
            .map_err(invalid)?;
        {
            let mut display = lock(&record.display);
            display.parser.set_size(rows, cols);
            display.revision = display.revision.saturating_add(1);
        }
        lock(&record.plan).size = params.size;
        Ok(record.summary())
    }
    pub(super) async fn close(&self, params: TerminalIdParams) -> Result<TerminalSummary, Error> {
        {
            let mut state = self.state.lock().await;
            if let Some(summary) = state.retired.iter().find(|summary| {
                summary.plan.root_key == params.root_key
                    && summary.plan.terminal_id == params.terminal_id
            }) {
                return Ok(summary.clone());
            }
            if state.pending.as_ref().is_some_and(|pending| {
                pending.plan.root_key == params.root_key
                    && pending.plan.terminal_id == params.terminal_id
            }) {
                let pending = state
                    .pending
                    .take()
                    .ok_or_else(|| conflict("The terminal launch review changed"))?;
                let summary = cancelled(pending.plan);
                state.remember(summary.clone());
                return Ok(summary);
            }
        }
        let record = self.get(&params).await?;
        if record.command.state() == CommandState::Running {
            record.command.request_terminal_stop();
        }
        let _control = record.control.lock().await;
        terminals::stop_terminal(
            &record.command,
            Duration::from_millis(TERMINAL_STOP_TIMEOUT_MS),
        )
        .await
        .map_err(conflict)?;
        let summary = record.summary();
        let mut state = self.state.lock().await;
        state
            .records
            .retain(|record| lock(&record.plan).terminal_id != params.terminal_id);
        state.remember(summary.clone());
        Ok(summary)
    }
    pub(super) async fn shutdown(&self) -> Result<(), Error> {
        let records = {
            let mut state = self.state.lock().await;
            state.closed = true;
            state.pending = None;
            std::mem::take(&mut state.records)
        };
        let mut tasks = tokio::task::JoinSet::new();
        for record in records {
            tasks.spawn(async move {
                terminals::stop_terminal(
                    &record.command,
                    Duration::from_millis(TERMINAL_STOP_TIMEOUT_MS),
                )
                .await
            });
        }
        let mut failure = None;
        while let Some(result) = tasks.join_next().await {
            if let Err(error) = result
                .map_err(conflict)
                .and_then(|result| result.map_err(conflict))
            {
                failure = Some(error);
            }
        }
        failure.map_or(Ok(()), Err)
    }
}

#[allow(unsafe_code)]
fn pin_directory(command: &mut std::process::Command, directory: std::fs::File) {
    use std::os::unix::process::CommandExt;
    // SAFETY: fchdir uses a held grant and performs no allocation in the child.
    unsafe {
        command.pre_exec(move || nix::unistd::fchdir(&directory).map_err(std::io::Error::from));
    }
}

fn color(value: vt100::Color) -> TerminalColor {
    match value {
        vt100::Color::Default => TerminalColor::Default,
        vt100::Color::Idx(index) => TerminalColor::Indexed { index },
        vt100::Color::Rgb(red, green, blue) => TerminalColor::Rgb { red, green, blue },
    }
}
fn visible_cursor(screen: &vt100::Screen) -> (u16, u16) {
    let (row, column) = screen.cursor_position();
    let (rows, columns) = screen.size();
    (row.min(rows.get() - 1), column.min(columns.get() - 1))
}
fn project_screen(parser: &vt100::Parser<Replies>, scrollback: usize) -> TerminalScreen {
    let mut screen = parser.screen().clone();
    screen.set_scrollback(scrollback.min(TERMINAL_SCROLLBACK_LINES));
    let (rows, cols) = screen.size();
    let (cursor_row, cursor_column) = visible_cursor(&screen);
    let cells = (0..rows.get())
        .map(|row| {
            (0..cols.get())
                .map(|col| {
                    let cell = screen.cell(row, col);
                    match cell {
                        Some(cell) => TerminalCell {
                            text: cell.contents().into(),
                            width: if cell.is_wide_continuation() {
                                0
                            } else if cell.is_wide() {
                                2
                            } else {
                                1
                            },
                            style: TerminalStyle {
                                foreground: color(cell.fgcolor()),
                                background: color(cell.bgcolor()),
                                bold: cell.bold(),
                                dim: cell.dim(),
                                italic: cell.italic(),
                                underline: cell.underline(),
                                inverse: cell.inverse(),
                            },
                        },
                        None => TerminalCell {
                            text: String::new(),
                            width: 1,
                            style: TerminalStyle::default(),
                        },
                    }
                })
                .collect()
        })
        .collect();
    TerminalScreen {
        size: TerminalSize {
            rows: rows.get(),
            columns: cols.get(),
        },
        cells,
        cursor_row,
        cursor_column,
        hide_cursor: screen.hide_cursor(),
        application_cursor: screen.application_cursor(),
        application_keypad: screen.application_keypad(),
        bracketed_paste: screen.bracketed_paste(),
        alternate_screen: screen.alternate_screen(),
        scrollback: screen.scrollback(),
        scrollback_len: screen.scrollback_len(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn expired_and_cancelled_launches_close_idempotently_without_a_process_record() {
        let root = tempfile::tempdir().unwrap();
        let authority = WorkspaceFileAuthority::new(root.path()).unwrap();
        let key = authority.identity().unwrap();
        let terminals = WorkspaceTerminals::default();
        let plan = TerminalPlan {
            root_key: key.clone(),
            terminal_id: uuid::Uuid::new_v4().to_string(),
            cwd: root.path().display().to_string(),
            shell: crate::process_tree::HOST_SHELL.into(),
            sandbox: "contained".into(),
            network_allowed: false,
            size: TerminalSize {
                rows: DEFAULT_TERMINAL_ROWS,
                columns: DEFAULT_TERMINAL_COLUMNS,
            },
        };
        terminals.state.lock().await.pending = Some(Pending {
            plan: plan.clone(),
            created: Instant::now() - Duration::from_millis(TERMINAL_CONSENT_LIFETIME_MS + 1),
        });
        let id = TerminalIdParams {
            root_key: key.clone(),
            terminal_id: plan.terminal_id.clone(),
        };
        let error = terminals
            .start(authority.clone(), id.clone())
            .await
            .unwrap_err();
        assert!(error.message().contains("expired"));
        let closed = terminals.close(id.clone()).await.unwrap();
        assert_eq!(closed.state, TerminalState::Stopped);
        assert_eq!(terminals.close(id).await.unwrap(), closed);
        assert!(terminals.state.lock().await.records.is_empty());
        let mut plan = plan;
        plan.terminal_id = uuid::Uuid::new_v4().to_string();
        let id = TerminalIdParams {
            root_key: key,
            terminal_id: plan.terminal_id.clone(),
        };
        terminals.state.lock().await.pending = Some(Pending {
            plan,
            created: Instant::now(),
        });
        assert_eq!(
            terminals.close(id.clone()).await.unwrap().state,
            TerminalState::Stopped
        );
        assert!(terminals.start(authority, id).await.is_err());
        assert!(terminals.state.lock().await.records.is_empty());
    }
    fn parser(size: TerminalSize) -> (vt100::Parser<Replies>, mpsc::Receiver<String>) {
        let (send, receive) = mpsc::channel(MAX_PENDING_TERMINAL_INPUTS);
        let (rows, cols) = dims(size).unwrap();
        (
            vt100::Parser::new_with_callbacks(
                rows,
                cols,
                TERMINAL_SCROLLBACK_LINES,
                Replies {
                    send,
                    overflow: false,
                },
            ),
            receive,
        )
    }
    #[test]
    fn screen_projection_preserves_terminal_state_and_split_unicode_without_output_actions() {
        let (mut parser, mut replies) = parser(TerminalSize {
            rows: 4,
            columns: 20,
        });
        parser.process(b"before\r\x1b[2K\x1b[31mred\x1b[0m ");
        let text = "東京🦀".as_bytes();
        parser.process(&text[..2]);
        parser.process(&text[2..]);
        parser.process(b"\x1b]52;c;c2VjcmV0\x07\x1b]8;;https://example.com\x07");
        let screen = project_screen(&parser, 0);
        assert_eq!(screen.cells[0][0].text, "r");
        assert_eq!(
            screen.cells[0][0].style.foreground,
            TerminalColor::Indexed { index: 1 }
        );
        assert_eq!(screen.cells[0][4].text, "東");
        assert_eq!(screen.cells[0][4].width, 2);
        assert_eq!(screen.cells[0][5].width, 0);
        assert!(replies.try_recv().is_err());
        parser.process(b"\x1b[?2004h\x1b[?1h\x1b[?1049h");
        let screen = project_screen(&parser, 0);
        assert!(screen.bracketed_paste && screen.application_cursor && screen.alternate_screen);
    }
    #[test]
    fn terminal_queries_get_fixed_responses_without_clipboard_or_title_data() {
        let (mut parser, mut replies) = parser(TerminalSize {
            rows: 4,
            columns: 20,
        });
        parser.process(b"abc\x1b[6n\x1b[5n\x1b[c");
        assert_eq!(replies.try_recv().unwrap(), "\x1b[1;4R");
        assert_eq!(replies.try_recv().unwrap(), "\x1b[0n");
        assert_eq!(replies.try_recv().unwrap(), "\x1b[?1;2c");
        parser.process(b"\r\x1b[2Kxxxxxxxxxxxxxxxxxxxx\x1b[6n");
        assert_eq!(replies.try_recv().unwrap(), "\x1b[1;20R");
        assert_eq!(project_screen(&parser, 0).cursor_column, 19);
    }
    #[test]
    fn the_largest_styled_screen_fits_the_shared_response_budget() {
        let size = TerminalSize {
            rows: MAX_TERMINAL_ROWS,
            columns: MAX_TERMINAL_COLUMNS,
        };
        let (mut parser, _) = parser(size);
        parser.process(b"\x1b[1;2;3;4;7;38;2;255;255;255;48;2;255;255;255m");
        let glyph = format!("\"{}", "\u{301}".repeat(10));
        parser.process(
            glyph
                .repeat(usize::from(size.rows) * usize::from(size.columns))
                .as_bytes(),
        );
        let screen = project_screen(&parser, 0);
        assert_eq!(screen.cells.len(), usize::from(size.rows));
        assert!(
            serde_json::to_vec(&screen).unwrap().len() + 16 * 1024
                < super::super::TRANSCRIPT_JSON_BUDGET
        );
    }
}
