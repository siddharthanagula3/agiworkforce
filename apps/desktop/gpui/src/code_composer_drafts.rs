pub use agiworkforce_protocol::code_drafts::ComposerDraftStore;
use agiworkforce_protocol::code_drafts::{
    CodeDraftChange, CodeDraftParams, CodeDraftSnapshot, CodeDraftWriteParams,
    CodeDraftWriteResponse,
};
use anyhow::{ensure, Result};

pub fn restored_text(
    snapshot: &CodeDraftSnapshot,
    root_key: &str,
    thread_id: &str,
) -> Option<String> {
    if snapshot.root_key == root_key && snapshot.thread_id == thread_id {
        snapshot.text.clone()
    } else {
        None
    }
}

pub fn read_params(root_key: &str, thread_id: &str) -> Result<CodeDraftParams> {
    ensure!(
        !root_key.is_empty() && !thread_id.is_empty(),
        "Open a coding session before reading its draft"
    );
    Ok(CodeDraftParams {
        root_key: root_key.to_owned(),
        thread_id: thread_id.to_owned(),
    })
}

pub fn set_params(
    snapshot: &CodeDraftSnapshot,
    text: &str,
    max_utf16: usize,
) -> Result<CodeDraftWriteParams> {
    ensure!(
        text.encode_utf16().count() <= max_utf16 && !text.contains('\0'),
        "The coding draft exceeds the shared draft limit or contains unsupported content"
    );
    Ok(CodeDraftWriteParams {
        root_key: snapshot.root_key.clone(),
        thread_id: snapshot.thread_id.clone(),
        epoch: snapshot.epoch.clone(),
        revision: snapshot.revision.clone(),
        change: if text.is_empty() {
            CodeDraftChange::Clear
        } else {
            CodeDraftChange::Set {
                text: text.to_owned(),
            }
        },
    })
}

pub fn clear_params(snapshot: &CodeDraftSnapshot) -> CodeDraftWriteParams {
    CodeDraftWriteParams {
        root_key: snapshot.root_key.clone(),
        thread_id: snapshot.thread_id.clone(),
        epoch: snapshot.epoch.clone(),
        revision: snapshot.revision.clone(),
        change: CodeDraftChange::Clear,
    }
}

pub fn accept(response: CodeDraftWriteResponse) -> CodeDraftSnapshot {
    response.current
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CodeDraftAction {
    Wait,
    Pause,
    Show(String),
    Clear,
    Commit,
}

pub fn composer_after_show(action: &CodeDraftAction, composer: &str) -> String {
    match action {
        CodeDraftAction::Show(text) => text.clone(),
        _ => composer.to_owned(),
    }
}

#[derive(Debug, Default)]
pub struct CodeDraftQueue {
    snapshot: Option<CodeDraftSnapshot>,
    incoming: Option<CodeDraftSnapshot>,
    operation: Option<uuid::Uuid>,
    pending_text: Option<String>,
    pending_thread: Option<String>,
    pending_clear: Option<String>,
    deferred_load: Option<String>,
    clear_retries: u8,
}

impl CodeDraftQueue {
    pub fn edit(&mut self, thread_id: &str, text: &str) {
        if self.pending_clear.is_some() {
            return;
        }
        if self
            .snapshot
            .as_ref()
            .is_some_and(|snapshot| snapshot.thread_id != thread_id)
        {
            return;
        }
        if self.snapshot.is_none()
            && self
                .pending_thread
                .as_ref()
                .is_some_and(|pending| pending != thread_id)
            && self
                .pending_text
                .as_ref()
                .is_some_and(|pending| !pending.is_empty())
        {
            return;
        }
        self.pending_text = Some(text.to_owned());
        self.pending_thread = Some(thread_id.to_owned());
    }

    pub fn request_clear(&mut self, thread_id: &str) {
        self.pending_clear = Some(thread_id.to_owned());
        self.pending_text = None;
        self.pending_thread = None;
    }

    pub fn clear_requested(&self) -> bool {
        self.pending_clear.is_some()
    }

    pub fn waiting_for_pause(&self) -> bool {
        if self.pending_clear.is_some() {
            return false;
        }
        let Some(text) = &self.pending_text else {
            return false;
        };
        match &self.snapshot {
            Some(snapshot) => snapshot.text.as_deref().unwrap_or("") != text.as_str(),
            None => !text.is_empty(),
        }
    }

    pub fn needs_load(&self) -> bool {
        self.snapshot.is_none() && self.operation.is_none()
    }

    pub fn current_thread(&self) -> Option<&str> {
        self.snapshot
            .as_ref()
            .map(|snapshot| snapshot.thread_id.as_str())
    }

    pub fn defer_load(&mut self, thread_id: &str) {
        self.deferred_load = Some(thread_id.to_owned());
    }

    pub fn take_deferred_load(&mut self) -> Option<String> {
        self.deferred_load.take()
    }

    pub fn commit_before_switch(
        &mut self,
        next_thread: &str,
        max_utf16: usize,
    ) -> Result<Option<CodeDraftWriteParams>> {
        let Some(current) = self.snapshot.as_ref() else {
            if self.operation.is_some()
                || self
                    .pending_text
                    .as_ref()
                    .is_some_and(|text| !text.is_empty())
            {
                self.defer_load(next_thread);
            }
            return Ok(None);
        };
        if current.thread_id == next_thread {
            return Ok(None);
        }
        if self.operation.is_some() {
            self.defer_load(next_thread);
            return Ok(None);
        }
        let pending = self.next_write(max_utf16)?;
        if pending.is_some() {
            self.defer_load(next_thread);
        }
        Ok(pending)
    }

    pub fn invalidate(&mut self) {
        self.snapshot = None;
    }

    pub fn allow_clear_reload(&mut self) -> bool {
        if self.clear_retries >= 1 {
            return false;
        }
        self.clear_retries += 1;
        true
    }

    pub fn begin_load(&mut self, operation: uuid::Uuid) -> bool {
        if self.operation.is_some() {
            return false;
        }
        self.operation = Some(operation);
        true
    }

    pub fn begin(&mut self, operation: uuid::Uuid, request: &CodeDraftWriteParams) -> bool {
        if self.operation.is_some() {
            return false;
        }
        self.operation = Some(operation);
        if matches!(request.change, CodeDraftChange::Clear)
            && self.pending_clear.as_ref() == Some(&request.thread_id)
        {
            self.pending_clear = None;
        }
        true
    }

    pub fn cancel(&mut self, operation: uuid::Uuid) -> bool {
        if self.operation != Some(operation) {
            return false;
        }
        self.operation = None;
        true
    }

    pub fn next_write(&mut self, max_utf16: usize) -> Result<Option<CodeDraftWriteParams>> {
        if self.operation.is_some() {
            return Ok(None);
        }
        let Some(snapshot) = self.snapshot.clone() else {
            return Ok(None);
        };
        if self.pending_clear.as_ref() == Some(&snapshot.thread_id) {
            return Ok(Some(clear_params(&snapshot)));
        }
        let Some(text) = self.pending_text.clone() else {
            return Ok(None);
        };
        if snapshot.text.as_deref().unwrap_or("") == text {
            self.pending_text = None;
            self.pending_thread = None;
            return Ok(None);
        }
        Ok(Some(set_params(&snapshot, &text, max_utf16)?))
    }

    fn adopt(&mut self, snapshot: CodeDraftSnapshot, composer: Option<&str>) -> CodeDraftAction {
        self.snapshot = Some(snapshot.clone());
        if self.pending_clear.as_ref() == Some(&snapshot.thread_id) {
            return CodeDraftAction::Clear;
        }
        if let Some(composer) = composer {
            if !composer.is_empty() && composer != snapshot.text.as_deref().unwrap_or("") {
                self.pending_thread = Some(snapshot.thread_id);
                self.pending_text = Some(composer.to_owned());
                return CodeDraftAction::Pause;
            }
        }
        self.pending_text = None;
        self.pending_thread = None;
        match restored_text(&snapshot, &snapshot.root_key, &snapshot.thread_id) {
            Some(text) => CodeDraftAction::Show(text),
            None => CodeDraftAction::Wait,
        }
    }

    pub fn complete_load(
        &mut self,
        operation: uuid::Uuid,
        snapshot: CodeDraftSnapshot,
        open_thread: &str,
    ) -> Option<CodeDraftAction> {
        if self.operation != Some(operation) {
            return None;
        }
        self.operation = None;
        if open_thread != snapshot.thread_id {
            self.defer_load(open_thread);
        }
        if self.pending_clear.as_ref() == Some(&snapshot.thread_id) {
            self.incoming = None;
            self.snapshot = Some(snapshot);
            return Some(CodeDraftAction::Clear);
        }
        let pending_for_snapshot = self.pending_thread.as_deref()
            == Some(snapshot.thread_id.as_str())
            && self.pending_text.as_ref().is_some_and(|text| {
                !text.is_empty() && text.as_str() != snapshot.text.as_deref().unwrap_or("")
            });
        if pending_for_snapshot && open_thread != snapshot.thread_id {
            self.snapshot = Some(snapshot);
            return Some(CodeDraftAction::Commit);
        }
        let unsent_for_current = self.snapshot.as_ref().is_some_and(|current| {
            current.thread_id != snapshot.thread_id
                && self.pending_thread.as_deref() == Some(current.thread_id.as_str())
                && self.pending_text.as_ref().is_some_and(|text| {
                    !text.is_empty() && text.as_str() != current.text.as_deref().unwrap_or("")
                })
        });
        if unsent_for_current {
            self.incoming = Some(snapshot);
            return Some(CodeDraftAction::Commit);
        }
        if pending_for_snapshot {
            self.snapshot = Some(snapshot);
            return Some(CodeDraftAction::Pause);
        }
        let show = open_thread == snapshot.thread_id;
        if self.pending_thread.as_deref() == Some(snapshot.thread_id.as_str()) {
            self.pending_text = None;
            self.pending_thread = None;
        }
        self.snapshot = Some(snapshot.clone());
        if !show {
            return Some(CodeDraftAction::Wait);
        }
        Some(
            match restored_text(&snapshot, &snapshot.root_key, &snapshot.thread_id) {
                Some(text) => CodeDraftAction::Show(text),
                None => CodeDraftAction::Wait,
            },
        )
    }

    pub fn loaded(
        &mut self,
        operation: uuid::Uuid,
        snapshot: CodeDraftSnapshot,
        composer: Option<&str>,
    ) -> Option<CodeDraftAction> {
        if self.operation != Some(operation) {
            return None;
        }
        if let Some(composer) = composer.filter(|composer| !composer.is_empty()) {
            self.edit(&snapshot.thread_id, composer);
        }
        let open = snapshot.thread_id.clone();
        self.complete_load(operation, snapshot, &open)
    }

    pub fn finished(
        &mut self,
        operation: uuid::Uuid,
        response: CodeDraftWriteResponse,
        composer: Option<&str>,
    ) -> Option<CodeDraftAction> {
        if self.operation != Some(operation) {
            return None;
        }
        self.operation = None;
        let accepted = response.accepted;
        let snapshot = accept(response);
        if accepted && snapshot.text.is_none() {
            self.clear_retries = 0;
        }
        let stored = snapshot.text.clone().unwrap_or_default();
        let clear_this = self.pending_clear.as_ref() == Some(&snapshot.thread_id);
        self.snapshot = Some(snapshot.clone());
        if clear_this {
            return Some(CodeDraftAction::Clear);
        }
        if let Some(incoming) = self.incoming.take() {
            self.pending_text = None;
            self.pending_thread = None;
            return Some(self.adopt(incoming, None));
        }
        if !accepted {
            self.pending_text = None;
            self.pending_thread = None;
            return Some(match snapshot.text {
                Some(text) => CodeDraftAction::Show(text),
                None => CodeDraftAction::Wait,
            });
        }
        if let Some(composer) = composer {
            if composer != stored {
                self.pending_thread = self.current_thread().map(str::to_owned);
                self.pending_text = Some(composer.to_owned());
                return Some(CodeDraftAction::Pause);
            }
        } else if self
            .pending_text
            .as_deref()
            .is_some_and(|text| text != stored)
        {
            return Some(CodeDraftAction::Pause);
        }
        self.pending_text = None;
        self.pending_thread = None;
        Some(CodeDraftAction::Wait)
    }
}
