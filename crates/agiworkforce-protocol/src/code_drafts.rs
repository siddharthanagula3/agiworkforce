use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use thiserror::Error;
use ts_rs::TS;

#[derive(Debug, Error)]
pub enum ComposerDraftError {
    #[error("{0}")]
    Invalid(String),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Revision(#[from] uuid::Error),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CodeDraftParams {
    pub root_key: String,
    pub thread_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CodeDraftSnapshot {
    pub root_key: String,
    pub thread_id: String,
    pub epoch: String,
    pub revision: Option<String>,
    pub text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(tag = "kind", rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum CodeDraftChange {
    Set { text: String },
    Clear,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CodeDraftWriteParams {
    pub root_key: String,
    pub thread_id: String,
    pub epoch: String,
    pub revision: Option<String>,
    pub change: CodeDraftChange,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CodeDraftWriteResponse {
    pub accepted: bool,
    pub current: CodeDraftSnapshot,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct StoredDraft {
    root_key: String,
    thread_id: String,
    revision: String,
    text: String,
}

/// Private coding-composer drafts. The CLI file store and the native desktop
/// use this journal, so a fresh owner sees the same revision rules.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ComposerDraftStore {
    version: u32,
    epoch: String,
    entries: BTreeMap<String, StoredDraft>,
}

fn identity(root_key: &str, thread_id: &str) -> String {
    format!("{root_key}\u{1}{thread_id}")
}

impl ComposerDraftStore {
    pub fn new() -> Self {
        Self {
            version: 1,
            epoch: uuid::Uuid::new_v4().to_string(),
            entries: BTreeMap::new(),
        }
    }

    pub fn to_bytes(&self) -> Result<Vec<u8>, ComposerDraftError> {
        self.validate()?;
        Ok(serde_json::to_vec(self)?)
    }

    pub fn from_bytes(bytes: &[u8]) -> Result<Self, ComposerDraftError> {
        let store: Self = serde_json::from_slice(bytes)?;
        store.validate()?;
        Ok(store)
    }

    pub fn read(&self, params: &CodeDraftParams) -> Result<CodeDraftSnapshot, ComposerDraftError> {
        if params.root_key.is_empty() || params.thread_id.is_empty() {
            return Err(ComposerDraftError::Invalid(
                "A coding draft needs a folder and a thread".into(),
            ));
        }
        let entry = self
            .entries
            .get(&identity(&params.root_key, &params.thread_id));
        Ok(CodeDraftSnapshot {
            root_key: params.root_key.clone(),
            thread_id: params.thread_id.clone(),
            epoch: self.epoch.clone(),
            revision: entry.map(|entry| entry.revision.clone()),
            text: entry.map(|entry| entry.text.clone()),
        })
    }

    pub fn write(
        &mut self,
        params: CodeDraftWriteParams,
        max_utf16: usize,
    ) -> Result<CodeDraftWriteResponse, ComposerDraftError> {
        uuid::Uuid::parse_str(&params.epoch)?;
        if let Some(revision) = &params.revision {
            uuid::Uuid::parse_str(revision)?;
        }
        let requested = match &params.change {
            CodeDraftChange::Set { text } if !text.is_empty() => {
                if text.encode_utf16().count() > max_utf16 || text.contains('\0') {
                    return Err(ComposerDraftError::Invalid(
                        "The coding draft exceeds the shared draft limit or contains unsupported content"
                            .into(),
                    ));
                }
                Some(text.clone())
            }
            CodeDraftChange::Set { .. } | CodeDraftChange::Clear => None,
        };
        let target = CodeDraftParams {
            root_key: params.root_key.clone(),
            thread_id: params.thread_id.clone(),
        };
        let current = self.read(&target)?;
        let same = current.text == requested;
        if self.epoch != params.epoch || (current.revision != params.revision && !same) {
            return Ok(CodeDraftWriteResponse {
                accepted: false,
                current,
            });
        }
        if same {
            return Ok(CodeDraftWriteResponse {
                accepted: true,
                current,
            });
        }
        let key = identity(&params.root_key, &params.thread_id);
        match requested {
            Some(text) => {
                self.entries.insert(
                    key,
                    StoredDraft {
                        root_key: params.root_key,
                        thread_id: params.thread_id,
                        revision: uuid::Uuid::new_v4().to_string(),
                        text,
                    },
                );
            }
            None => {
                self.entries.remove(&key);
                self.epoch = uuid::Uuid::new_v4().to_string();
            }
        }
        Ok(CodeDraftWriteResponse {
            accepted: true,
            current: self.read(&target)?,
        })
    }

    fn validate(&self) -> Result<(), ComposerDraftError> {
        if self.version != 1 {
            return Err(ComposerDraftError::Invalid(
                "The coding draft format is unsupported".into(),
            ));
        }
        uuid::Uuid::parse_str(&self.epoch)?;
        for (key, entry) in &self.entries {
            if key != &identity(&entry.root_key, &entry.thread_id)
                || entry.root_key.is_empty()
                || entry.thread_id.is_empty()
                || entry.text.is_empty()
                || entry.text.contains('\0')
            {
                return Err(ComposerDraftError::Invalid(
                    "A coding draft record does not match its identity".into(),
                ));
            }
            uuid::Uuid::parse_str(&entry.revision)?;
        }
        Ok(())
    }
}

impl Default for ComposerDraftStore {
    fn default() -> Self {
        Self::new()
    }
}
