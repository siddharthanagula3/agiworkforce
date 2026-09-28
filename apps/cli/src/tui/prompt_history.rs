use std::path::PathBuf;

use rustyline::history::{FileHistory, History, SearchDirection};

use crate::config::CliConfig;

pub(crate) struct PromptHistory {
    entries: FileHistory,
    path: Option<PathBuf>,
    position: Option<usize>,
    draft: String,
}

impl PromptHistory {
    pub(crate) fn load() -> Self {
        let path = CliConfig::config_dir()
            .ok()
            .map(|dir| dir.join("history.txt"));
        let mut entries = FileHistory::new();
        if let Some(path) = path.as_deref().filter(|path| path.exists()) {
            if let Err(error) = entries.load(path) {
                tracing::warn!(
                    "prompt history at {} could not be read: {error}",
                    path.display()
                );
            }
        }
        Self {
            entries,
            path,
            position: None,
            draft: String::new(),
        }
    }

    pub(crate) fn record(&mut self, prompt: &str) {
        self.position = None;
        self.draft.clear();
        if !matches!(self.entries.add(prompt), Ok(true)) {
            return;
        }
        if let Some(path) = &self.path {
            if let Err(error) = self.entries.append(path) {
                tracing::warn!(
                    "prompt history at {} could not be saved: {error}",
                    path.display()
                );
            }
        }
    }

    pub(crate) fn older(&mut self, current: &str) -> Option<String> {
        let index = match self.position {
            None if self.entries.is_empty() => return None,
            None => {
                self.draft = current.to_string();
                self.entries.len() - 1
            }
            Some(0) => return None,
            Some(index) => index - 1,
        };
        self.position = Some(index);
        self.entry(index)
    }

    pub(crate) fn newer(&mut self) -> Option<String> {
        let index = self.position?;
        if index + 1 < self.entries.len() {
            self.position = Some(index + 1);
            return self.entry(index + 1);
        }
        self.position = None;
        Some(std::mem::take(&mut self.draft))
    }

    fn entry(&self, index: usize) -> Option<String> {
        self.entries
            .get(index, SearchDirection::Forward)
            .ok()
            .flatten()
            .map(|found| found.entry.into_owned())
    }
}
