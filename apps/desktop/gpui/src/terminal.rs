use agiworkforce_protocol::{developer_session::DeveloperWorkspaceIdentity, workspace_terminal::*};
use anyhow::{ensure, Context, Result};
use std::collections::{HashSet, VecDeque};

pub struct InputPacket {
    pub terminal: TerminalIdParams,
    pub text: String,
}

pub fn row_text(row: &[TerminalCell]) -> String {
    row.iter()
        .filter(|cell| cell.width != 0)
        .map(|cell| {
            if cell.text.is_empty() {
                " "
            } else {
                cell.text.as_str()
            }
        })
        .collect::<String>()
        .trim_end()
        .to_owned()
}
#[derive(Default)]
pub struct TerminalPanel {
    pub resizing: bool,
    pub read_failed: bool,
    pub visible: bool,
    pub root: Option<DeveloperWorkspaceIdentity>,
    pub terminals: Vec<TerminalSummary>,
    pub selected: Option<String>,
    pub frame: Option<TerminalReadResponse>,
    pub operation: Option<uuid::Uuid>,
    pub pending_start: Option<TerminalPlan>,
    pub epoch: uuid::Uuid,
    pub sending: bool,
    pub input_queue: VecDeque<InputPacket>,
    pub input_bytes: usize,
    pub paused: HashSet<String>,
    pub error: Option<String>,
    pub scrollback: usize,
}
fn rank(state: TerminalState) -> u8 {
    match state {
        TerminalState::Running => 0,
        TerminalState::Closing => 1,
        TerminalState::Exited | TerminalState::Stopped => 2,
    }
}
fn valid_summary(root: &str, summary: &TerminalSummary) -> Result<()> {
    ensure!(
        summary.plan.root_key == root
            && uuid::Uuid::parse_str(&summary.plan.terminal_id).is_ok()
            && summary.plan.size.valid(),
        "The terminal summary has a different scope or invalid size"
    );
    Ok(())
}
impl TerminalPanel {
    pub fn ids_for_close(&self) -> Vec<TerminalIdParams> {
        let mut ids = self
            .terminals
            .iter()
            .map(|terminal| TerminalIdParams {
                root_key: terminal.plan.root_key.clone(),
                terminal_id: terminal.plan.terminal_id.clone(),
            })
            .collect::<Vec<_>>();
        if let Some(plan) = &self.pending_start {
            if !ids.iter().any(|id| id.terminal_id == plan.terminal_id) {
                ids.push(TerminalIdParams {
                    root_key: plan.root_key.clone(),
                    terminal_id: plan.terminal_id.clone(),
                });
            }
        }
        ids
    }
    pub fn begin(&mut self) -> uuid::Uuid {
        self.resizing = false;
        let id = uuid::Uuid::new_v4();
        self.operation = Some(id);
        self.error = None;
        id
    }
    pub fn owned_id(&self) -> Result<TerminalIdParams> {
        let root = self
            .root
            .as_ref()
            .context("Open a coding folder before using a terminal")?;
        let terminal_id = self.selected.clone().context("Choose a terminal")?;
        Ok(TerminalIdParams {
            root_key: root.root_key.clone(),
            terminal_id,
        })
    }
    pub fn current(&self) -> Option<&TerminalSummary> {
        self.terminals
            .iter()
            .find(|terminal| Some(&terminal.plan.terminal_id) == self.selected.as_ref())
    }
    pub fn needs_close_confirmation(&self) -> bool {
        self.pending_start.is_some()
            || self.terminals.iter().any(|terminal| {
                matches!(
                    terminal.state,
                    TerminalState::Running | TerminalState::Closing
                )
            })
    }
    pub fn merge_summary(&mut self, mut summary: TerminalSummary) -> Result<()> {
        let root = &self
            .root
            .as_ref()
            .context("The terminal folder is unavailable")?
            .root_key;
        valid_summary(root, &summary)?;
        if let Some(old) = self
            .terminals
            .iter_mut()
            .find(|old| old.plan.terminal_id == summary.plan.terminal_id)
        {
            ensure!(
                old.plan.root_key == summary.plan.root_key
                    && old.plan.cwd == summary.plan.cwd
                    && old.plan.shell == summary.plan.shell
                    && old.plan.sandbox == summary.plan.sandbox
                    && old.plan.network_allowed == summary.plan.network_allowed,
                "The terminal launch authority changed"
            );
            summary.next_input_sequence = summary.next_input_sequence.max(old.next_input_sequence);
            if summary.revision < old.revision {
                summary.revision = old.revision;
                summary.plan.size = old.plan.size;
            }
            if rank(summary.state) < rank(old.state) {
                summary.state = old.state;
                summary.exit_code = old.exit_code;
            }
            if summary.error.is_none() {
                summary.error = old.error.clone();
            }
            *old = summary;
        } else {
            ensure!(
                self.terminals.len() < MAX_WORKSPACE_TERMINALS,
                "The terminal list exceeds its host limit"
            );
            self.terminals.push(summary);
        }
        Ok(())
    }
    pub fn accept_list(&mut self, list: TerminalListResponse) -> Result<()> {
        ensure!(
            self.root
                .as_ref()
                .is_some_and(|root| root.root_key == list.root_key)
                && list.terminals.len() <= MAX_WORKSPACE_TERMINALS,
            "The terminal list belongs to a different coding folder"
        );
        let mut ids = HashSet::new();
        for terminal in &list.terminals {
            valid_summary(&list.root_key, terminal)?;
            ensure!(
                ids.insert(terminal.plan.terminal_id.clone()),
                "The host repeated a terminal identity"
            );
        }
        for terminal in list.terminals {
            self.merge_summary(terminal)?;
        }
        if self
            .pending_start
            .as_ref()
            .is_some_and(|plan| ids.contains(&plan.terminal_id))
        {
            self.pending_start = None;
        }
        self.terminals
            .retain(|terminal| ids.contains(&terminal.plan.terminal_id));
        if self.selected.as_ref().is_some_and(|id| !ids.contains(id)) {
            self.selected = None;
            self.frame = None;
        }
        Ok(())
    }
    pub fn accept_frame(
        &mut self,
        params: &TerminalReadParams,
        frame: TerminalReadResponse,
    ) -> Result<()> {
        ensure!(
            frame.terminal.plan.root_key == params.root_key
                && frame.terminal.plan.terminal_id == params.terminal_id
                && self.selected.as_deref() == Some(params.terminal_id.as_str()),
            "The terminal screen belongs to a different view"
        );
        valid_summary(&params.root_key, &frame.terminal)?;
        if let Some(screen) = &frame.screen {
            validate_screen(screen)?;
            ensure!(
                screen.size == frame.terminal.plan.size,
                "The terminal screen has a different size from its host"
            );
        } else {
            ensure!(
                params.after_revision == Some(frame.terminal.revision)
                    && self
                        .frame
                        .as_ref()
                        .is_some_and(|previous| previous.terminal.revision
                            == frame.terminal.revision
                            && previous.screen.is_some()),
                "The terminal screen update is missing"
            );
        }
        self.merge_summary(frame.terminal.clone())?;
        if self
            .frame
            .as_ref()
            .is_some_and(|old| old.terminal.revision > frame.terminal.revision)
        {
            return Ok(());
        }
        let mut frame = frame;
        if frame.screen.is_none() {
            frame.screen = self.frame.take().and_then(|frame| frame.screen);
        }
        self.frame = Some(frame);
        Ok(())
    }
    pub fn enqueue(&mut self, terminal: TerminalIdParams, text: String) -> Result<()> {
        ensure!(
            self.visible
                && self
                    .root
                    .as_ref()
                    .is_some_and(|root| root.root_key == terminal.root_key)
                && self.selected.as_ref() == Some(&terminal.terminal_id),
            "The terminal input view changed"
        );
        ensure!(
            self.current().is_some_and(
                |summary| summary.state == TerminalState::Running && summary.error.is_none()
            ) && !self.paused.contains(&terminal.terminal_id),
            "This terminal is no longer accepting input"
        );
        ensure!(
            !text.is_empty() && text.len() <= MAX_TERMINAL_INPUT_BYTES,
            "This terminal input exceeds the chunk limit"
        );
        if self.input_queue.len() >= MAX_PENDING_TERMINAL_INPUTS
            || self.input_bytes.saturating_add(text.len()) > MAX_PENDING_TERMINAL_INPUT_BYTES
        {
            self.pause(&terminal.terminal_id);
            anyhow::bail!("Terminal typing paused because its input queue filled. Close it before continuing.");
        }
        self.input_bytes += text.len();
        self.input_queue.push_back(InputPacket { terminal, text });
        Ok(())
    }
    pub fn pause(&mut self, id: &str) {
        self.paused.insert(id.into());
        self.input_queue
            .retain(|packet| packet.terminal.terminal_id != id);
        self.input_bytes = self
            .input_queue
            .iter()
            .map(|packet| packet.text.len())
            .sum();
    }
    pub fn next_input(&mut self) -> Option<TerminalWriteParams> {
        while let Some(packet) = self.input_queue.pop_front() {
            self.input_bytes = self.input_bytes.saturating_sub(packet.text.len());
            if self.paused.contains(&packet.terminal.terminal_id) {
                continue;
            }
            let Some(summary) = self.terminals.iter().find(|summary| {
                summary.plan.terminal_id == packet.terminal.terminal_id
                    && summary.state == TerminalState::Running
            }) else {
                continue;
            };
            return Some(TerminalWriteParams {
                root_key: packet.terminal.root_key,
                terminal_id: packet.terminal.terminal_id,
                sequence: summary.next_input_sequence,
                text: packet.text,
            });
        }
        None
    }
}

pub fn validate_screen(screen: &TerminalScreen) -> Result<()> {
    ensure!(
        screen.size.valid()
            && screen.cells.len() == usize::from(screen.size.rows)
            && screen.cursor_row < screen.size.rows
            && screen.cursor_column < screen.size.columns,
        "The terminal screen grid is invalid"
    );
    ensure!(
        screen.scrollback <= screen.scrollback_len
            && screen.scrollback_len <= TERMINAL_SCROLLBACK_LINES,
        "The terminal scrollback exceeds its limit"
    );
    for row in &screen.cells {
        ensure!(
            row.len() == usize::from(screen.size.columns),
            "The terminal screen omitted columns"
        );
        for (column, cell) in row.iter().enumerate() {
            ensure!(
                cell.width <= 2 && !cell.text.chars().any(char::is_control),
                "The terminal cell contains unsupported control text"
            );
            if cell.width == 0 {
                ensure!(
                    column > 0 && row[column - 1].width == 2 && cell.text.is_empty(),
                    "The terminal wide-cell continuation is invalid"
                );
            }
            if cell.width == 2 {
                ensure!(
                    column + 1 < row.len() && row[column + 1].width == 0,
                    "The terminal wide character is incomplete"
                );
            }
        }
    }
    Ok(())
}

pub fn encode_key(
    key: &str,
    control: bool,
    shift: bool,
    alt: bool,
    application_cursor: bool,
) -> Option<String> {
    let key = key.to_ascii_lowercase();
    if control {
        let byte = match key.as_str() {
            "space" => Some(0),
            "[" => Some(27),
            "\\" => Some(28),
            "]" => Some(29),
            "^" => Some(30),
            "_" => Some(31),
            value if value.len() == 1 && value.as_bytes()[0].is_ascii_lowercase() => {
                Some(value.as_bytes()[0] - b'a' + 1)
            }
            _ => None,
        };
        if let Some(byte) = byte {
            return Some(if alt {
                format!("\x1b{}", char::from(byte))
            } else {
                char::from(byte).to_string()
            });
        }
    }
    match key.as_str() {
        "enter" => return Some("\r".into()),
        "backspace" => return Some("\x7f".into()),
        "tab" => return Some(if shift { "\x1b[Z" } else { "\t" }.into()),
        "escape" => return Some("\x1b".into()),
        _ => {}
    }
    let modifier = 1 + u8::from(shift) + 2 * u8::from(alt) + 4 * u8::from(control);
    let cursor = match key.as_str() {
        "up" => Some('A'),
        "down" => Some('B'),
        "right" => Some('C'),
        "left" => Some('D'),
        "home" => Some('H'),
        "end" => Some('F'),
        _ => None,
    };
    if let Some(end) = cursor {
        return Some(if modifier == 1 {
            format!("\x1b{}{end}", if application_cursor { "O" } else { "[" })
        } else {
            format!("\x1b[1;{modifier}{end}")
        });
    }
    let number = match key.as_str() {
        "insert" => 2,
        "delete" => 3,
        "pageup" => 5,
        "pagedown" => 6,
        "f5" => 15,
        "f6" => 17,
        "f7" => 18,
        "f8" => 19,
        "f9" => 20,
        "f10" => 21,
        "f11" => 23,
        "f12" => 24,
        _ => 0,
    };
    if number > 0 {
        return Some(if modifier == 1 {
            format!("\x1b[{number}~")
        } else {
            format!("\x1b[{number};{modifier}~")
        });
    }
    let end = match key.as_str() {
        "f1" => 'P',
        "f2" => 'Q',
        "f3" => 'R',
        "f4" => 'S',
        _ => return None,
    };
    Some(if modifier == 1 {
        format!("\x1bO{end}")
    } else {
        format!("\x1b[1;{modifier}{end}")
    })
}

pub fn encode_paste(text: &str, bracketed: bool) -> Result<String> {
    ensure!(
        !text.is_empty()
            && !text
                .chars()
                .any(|value| value.is_control() && !matches!(value, '\r' | '\n' | '\t')),
        "Paste plain text without terminal control codes"
    );
    let text = text.replace("\r\n", "\n").replace('\r', "\n");
    let encoded = if bracketed {
        format!("\x1b[200~{text}\x1b[201~")
    } else {
        text.replace('\n', "\r")
    };
    ensure!(
        encoded.len() <= MAX_TERMINAL_INPUT_BYTES,
        "The pasted text exceeds the terminal chunk limit"
    );
    Ok(encoded)
}
