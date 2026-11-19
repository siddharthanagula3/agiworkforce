use crate::developer_session::SettingsReadResponse;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub const MAX_INSTRUCTION_EDIT_BYTES: usize = crate::workspace_files::MAX_EDITOR_TEXT_BYTES;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum InstructionSettingsScope {
    User,
    Project,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct InstructionSettingsReadParams {
    pub root_key: String,
    pub scope: InstructionSettingsScope,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct InstructionSettingsSnapshot {
    pub root_key: String,
    pub scope: InstructionSettingsScope,
    pub path: String,
    pub revision: Option<String>,
    pub text: String,
    pub profile: SettingsReadResponse,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct InstructionSettingsWriteParams {
    pub root_key: String,
    pub scope: InstructionSettingsScope,
    pub revision: Option<String>,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct InstructionSettingsWriteResponse {
    pub saved: bool,
    pub current: InstructionSettingsSnapshot,
}
