use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub const MAX_WORKSPACE_TERMINALS: usize = 4;
pub const MAX_TERMINAL_LAUNCH_HISTORY: usize = 32;
pub const MIN_TERMINAL_COLUMNS: u16 = 2;
pub const MAX_TERMINAL_ROWS: u16 = 60;
pub const MAX_TERMINAL_COLUMNS: u16 = 160;
pub const DEFAULT_TERMINAL_ROWS: u16 = 24;
pub const DEFAULT_TERMINAL_COLUMNS: u16 = 80;
pub const TERMINAL_SCROLLBACK_LINES: usize = 512;
pub const MAX_TERMINAL_INPUT_BYTES: usize = 16 * 1024;
pub const MAX_PENDING_TERMINAL_INPUT_BYTES: usize = 128 * 1024;
pub const MAX_PENDING_TERMINAL_INPUTS: usize = 128;
pub const TERMINAL_CONSENT_LIFETIME_MS: u64 = 60_000;
pub const TERMINAL_STOP_TIMEOUT_MS: u64 = 2_000;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct TerminalSize {
    pub rows: u16,
    pub columns: u16,
}
impl TerminalSize {
    pub fn valid(self) -> bool {
        self.rows > 0
            && self.rows <= MAX_TERMINAL_ROWS
            && self.columns >= MIN_TERMINAL_COLUMNS
            && self.columns <= MAX_TERMINAL_COLUMNS
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct TerminalPlanParams {
    pub root_key: String,
    pub size: TerminalSize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct TerminalPlan {
    pub root_key: String,
    pub terminal_id: String,
    pub cwd: String,
    pub shell: String,
    pub sandbox: String,
    pub network_allowed: bool,
    pub size: TerminalSize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct TerminalIdParams {
    pub root_key: String,
    pub terminal_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct TerminalListParams {
    pub root_key: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum TerminalState {
    Running,
    Closing,
    Exited,
    Stopped,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct TerminalSummary {
    pub plan: TerminalPlan,
    pub state: TerminalState,
    pub revision: u64,
    pub next_input_sequence: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub exit_code: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct TerminalListResponse {
    pub root_key: String,
    pub terminals: Vec<TerminalSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct TerminalReadParams {
    pub root_key: String,
    pub terminal_id: String,
    pub scrollback: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub after_revision: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct TerminalWriteParams {
    pub root_key: String,
    pub terminal_id: String,
    pub sequence: u64,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct TerminalResizeParams {
    pub root_key: String,
    pub terminal_id: String,
    pub size: TerminalSize,
}

#[derive(Debug, Default, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(tag = "kind", rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum TerminalColor {
    #[default]
    Default,
    Indexed {
        index: u8,
    },
    Rgb {
        red: u8,
        green: u8,
        blue: u8,
    },
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct TerminalStyle {
    pub foreground: TerminalColor,
    pub background: TerminalColor,
    pub bold: bool,
    pub dim: bool,
    pub italic: bool,
    pub underline: bool,
    pub inverse: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct TerminalCell {
    pub text: String,
    pub width: u8,
    pub style: TerminalStyle,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct TerminalScreen {
    pub size: TerminalSize,
    pub cells: Vec<Vec<TerminalCell>>,
    pub cursor_row: u16,
    pub cursor_column: u16,
    pub hide_cursor: bool,
    pub application_cursor: bool,
    pub application_keypad: bool,
    pub bracketed_paste: bool,
    pub alternate_screen: bool,
    pub scrollback: usize,
    pub scrollback_len: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct TerminalReadResponse {
    pub terminal: TerminalSummary,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub screen: Option<TerminalScreen>,
}
