use agiworkforce_protocol::account_cloud::{
    CloudHistoryConversation, CloudHistoryListResponse, CloudHistoryReadResponse,
};
use agiworkforce_protocol::account_cloud::{
    CloudRunListResponse, CloudRunSummary, CloudTurnIdParams,
};
use agiworkforce_protocol::account_cloud::{CloudTurnSnapshot, CloudTurnStartParams};
use agiworkforce_protocol::task_state::AgentTaskState;
use anyhow::{ensure, Result};
use std::collections::HashSet;

#[derive(Default)]
pub struct CloudHistory {
    pub projects: crate::projects::Projects,
    pub draft: crate::drafts::DraftState,
    pub workspaces: crate::workspaces::Workspaces,
    pub management: crate::conversation_management::ConversationManagement,
    pub archived_only: bool,
    pub model_picker: crate::cloud_models::CloudModelPicker,
    pub visible: bool,
    pub compose_work: bool,
    pub work_visible: bool,
    pub work_loaded: bool,
    pub work_loading: bool,
    pub work_runs: Vec<CloudRunSummary>,
    pub work_next_cursor: Option<String>,
    pub work_selected: Option<CloudRunSummary>,
    pub work_states: Vec<AgentTaskState>,
    pub work_windowed: bool,
    work_cursors: HashSet<String>,
    pub generation: uuid::Uuid,
    pub loading: bool,
    pub loaded: bool,
    pub scope: Option<String>,
    pub conversations: Vec<CloudHistoryConversation>,
    pub detail: Option<CloudHistoryReadResponse>,
    pub has_more: bool,
    pub next_offset: u32,
    pub next_cursor: Option<String>,
    pub query: String,
    pub reset_query: bool,
    pub error: Option<String>,
    pub turn: Option<CloudTurnSnapshot>,
    pub pending_turn: Option<CloudTurnStartParams>,
    pub submitting: bool,
    pub stopping: bool,
    pub resuming: bool,
    pub windowed: bool,
    max_bytes: usize,
}

impl CloudHistory {
    pub fn new(max_bytes: usize) -> Self {
        Self {
            max_bytes,
            ..Default::default()
        }
    }
    pub fn reset(&mut self) {
        self.projects.reset();
        if let Some(job) = self.draft.operation.clone() {
            self.draft.fail(&job, "The draft save was interrupted. Its acceptance is unknown; keep a copy and review this conversation before retrying.".into());
        }
        self.workspaces = Default::default();
        self.management = Default::default();
        self.archived_only = false;
        self.model_picker = Default::default();
        self.generation = uuid::Uuid::new_v4();
        self.work_visible = false;
        self.compose_work = false;
        self.work_loaded = false;
        self.work_loading = false;
        self.work_runs.clear();
        self.work_next_cursor = None;
        self.work_selected = None;
        self.work_states.clear();
        self.work_cursors.clear();
        self.work_windowed = false;
        self.loading = false;
        self.loaded = false;
        self.scope = None;
        self.conversations.clear();
        self.detail = None;
        self.has_more = false;
        self.next_offset = 0;
        self.next_cursor = None;
        self.query.clear();
        self.reset_query = true;
        self.turn = None;
        self.pending_turn = None;
        self.submitting = false;
        self.stopping = false;
        self.resuming = false;
        self.windowed = false;
    }

    pub fn busy(&self) -> bool {
        self.projects.operation.is_some()
            || self.workspaces.operation.is_some()
            || self.management.operation.is_some()
            || self.work_busy()
    }

    pub fn has_unconfirmed_turn(&self) -> bool {
        self.pending_turn.is_some()
            && self
                .turn
                .as_ref()
                .is_none_or(|turn| !turn.accepted && !turn.rejected)
    }

    pub fn navigation_busy(&self) -> bool {
        self.busy() || self.draft.operation.is_some()
    }

    pub fn reset_view(&mut self) {
        let workspaces = std::mem::take(&mut self.workspaces);
        self.reset();
        self.scope = workspaces.scope.clone();
        self.workspaces = workspaces;
    }

    pub fn work_busy(&self) -> bool {
        self.submitting
            || self.resuming
            || self.work_loading
            || self
                .turn
                .as_ref()
                .is_some_and(CloudTurnSnapshot::needs_attention)
    }

    pub fn accept_turn(&mut self, snapshot: CloudTurnSnapshot) -> Result<bool> {
        ensure!(
            snapshot.workspace.as_ref()
                == self.workspaces.selector().or_else(|| self
                    .pending_turn
                    .as_ref()
                    .and_then(|pending| pending.workspace.as_ref())),
            "The Cloud turn changed workspace"
        );
        if let Some(pending) = self.pending_turn.as_ref() {
            ensure!(
                snapshot.workspace == pending.workspace
                    && snapshot.scope == pending.scope
                    && snapshot.request_id == pending.request_id
                    && snapshot.conversation_id.as_deref()
                        == Some(pending.conversation_id.as_str()),
                "The Cloud turn changed identity or account scope"
            );
        } else {
            let run = self
                .work_selected
                .as_ref()
                .ok_or_else(|| anyhow::anyhow!("No Cloud run is selected"))?;
            ensure!(
                self.scope.as_ref() == Some(&snapshot.scope)
                    && snapshot.request_id == run.request_id
                    && snapshot.run_id.as_deref() == Some(run.id.as_str())
                    && snapshot.conversation_id == run.conversation_id,
                "The selected Work run changed identity or account scope"
            );
        }
        if self
            .turn
            .as_ref()
            .is_some_and(|previous| snapshot.revision < previous.revision)
        {
            return Ok(false);
        }
        let clear = self.pending_turn.is_some()
            && snapshot.accepted
            && self.turn.as_ref().is_none_or(|previous| !previous.accepted);
        self.turn = Some(snapshot);
        Ok(clear)
    }

    pub fn turn_id(&self) -> Option<CloudTurnIdParams> {
        if let Some(pending) = &self.pending_turn {
            return Some(CloudTurnIdParams {
                workspace: pending.workspace.clone(),
                scope: pending.scope.clone(),
                request_id: pending.request_id.clone(),
                run_id: self
                    .turn
                    .as_ref()
                    .filter(|turn| turn.request_id == pending.request_id)
                    .and_then(|turn| turn.run_id.clone()),
            });
        }
        self.turn.as_ref().map(|turn| CloudTurnIdParams {
            workspace: turn.workspace.clone(),
            scope: turn.scope.clone(),
            request_id: turn.request_id.clone(),
            run_id: turn.run_id.clone(),
        })
    }

    pub fn matches_turn(&self, expected: &CloudTurnIdParams) -> bool {
        (self.pending_turn.is_some() || expected.run_id.is_some())
            && self.turn_id().is_some_and(|current| {
                current.workspace == expected.workspace
                    && current.scope == expected.scope
                    && current.request_id == expected.request_id
                    && expected
                        .run_id
                        .as_ref()
                        .is_none_or(|id| current.run_id.as_ref() == Some(id))
            })
    }

    pub fn clear_turn(&mut self) {
        self.turn = None;
        self.pending_turn = None;
        self.submitting = false;
        self.stopping = false;
        self.resuming = false;
    }

    pub fn accept_runs(&mut self, page: CloudRunListResponse, more: bool) -> Result<()> {
        ensure!(
            page.workspace.as_ref() == self.workspaces.selector(),
            "The Cloud list changed workspace"
        );
        ensure!(
            self.scope.as_ref().is_none_or(|scope| *scope == page.scope),
            "The account scope changed. Reload Work."
        );
        let mut cursors = if more {
            self.work_cursors.clone()
        } else {
            HashSet::new()
        };
        if let Some(cursor) = &page.next_cursor {
            ensure!(
                cursors.insert(cursor.clone()),
                "The Work cursor repeated. Refresh the list."
            );
            ensure!(
                cursors.iter().map(String::len).sum::<usize>() <= self.max_bytes,
                "The Work cursor cache reached its limit. Refresh the list."
            );
        }
        let mut runs = if more {
            self.work_runs.clone()
        } else {
            Vec::new()
        };
        for run in page.runs {
            if let Some(previous) = runs.iter_mut().find(|previous| previous.id == run.id) {
                *previous = run;
            } else {
                runs.push(run);
            }
        }
        let mut bytes = serde_json::to_vec(&runs)?.len();
        let mut removed = 0;
        while bytes > self.max_bytes && removed < runs.len() {
            bytes = bytes.saturating_sub(serde_json::to_vec(&runs[removed])?.len());
            removed += 1;
        }
        runs.drain(..removed);
        self.scope = Some(page.scope);
        self.work_runs = runs;
        self.work_next_cursor = page.next_cursor;
        self.work_cursors = cursors;
        self.work_loaded = true;
        self.work_windowed = if more {
            self.work_windowed || removed > 0
        } else {
            removed > 0
        };
        Ok(())
    }

    pub fn accept_list(&mut self, page: CloudHistoryListResponse, more: bool) -> Result<()> {
        ensure!(
            page.workspace.as_ref() == self.workspaces.selector(),
            "The Cloud list changed workspace"
        );
        ensure!(
            self.scope.as_ref().is_none_or(|scope| *scope == page.scope),
            "The account scope changed. Reload Cloud history."
        );
        if !more {
            self.windowed = false;
            self.conversations.clear();
            self.detail = None;
        }
        for row in page.conversations {
            if let Some(existing) = self
                .conversations
                .iter_mut()
                .find(|existing| existing.id == row.id)
            {
                *existing = row;
            } else {
                self.conversations.push(row);
            }
        }
        self.scope = Some(page.scope);
        self.loaded = true;
        self.has_more = page.has_more;
        self.next_offset = page.next_offset;
        self.next_cursor = page.next_cursor;
        let mut bytes = self
            .conversations
            .iter()
            .map(|row| serde_json::to_vec(row).map_or(usize::MAX, |bytes| bytes.len()))
            .fold(0usize, usize::saturating_add);
        let mut remove = 0;
        while bytes > self.max_bytes && remove + 1 < self.conversations.len() {
            bytes = bytes.saturating_sub(serde_json::to_vec(&self.conversations[remove])?.len());
            remove += 1;
        }
        if remove > 0 {
            self.conversations.drain(..remove);
            self.windowed = true;
        }
        Ok(())
    }

    pub fn accept_detail(&mut self, page: CloudHistoryReadResponse, more: bool) -> Result<()> {
        ensure!(self.projects.active_id.as_ref().is_none_or(|id| page.conversation.project_id.as_ref() == Some(id)), "This conversation moved to another project. Reload project conversations before continuing.");

        ensure!(self.workspaces.selector().is_none_or(|workspace| *workspace == agiworkforce_protocol::account_cloud::CloudConversationWorkspace::from_organization(page.conversation.organization_id.as_deref())), "The conversation belongs to a different workspace");
        ensure!(
            self.scope.as_ref() == Some(&page.scope),
            "The account scope changed. Reload Cloud history."
        );
        let prepend = more
            && self
                .detail
                .as_ref()
                .is_some_and(|existing| existing.previous_before.is_some());
        if more {
            let existing = self
                .detail
                .as_mut()
                .ok_or_else(|| anyhow::anyhow!("The conversation is no longer selected"))?;
            ensure!(
                existing.conversation.id == page.conversation.id,
                "The selected Cloud conversation changed"
            );
            if prepend {
                ensure!(
                    page.start_offset < existing.start_offset,
                    "The older message cursor did not advance"
                );
                ensure!(
                    page.next_offset == existing.start_offset,
                    "The older message window does not meet the loaded history"
                );
                ensure!(
                    !page.messages.is_empty(),
                    "The older message cursor did not advance"
                );
                ensure!(!page.messages.iter().any(|row| existing.messages.iter().any(|old| old.id == row.id)), "The conversation changed while older messages were loading. Reload the latest messages.");
                let mut messages = page.messages;
                messages.append(&mut existing.messages);
                existing.messages = messages;
                existing.start_offset = page.start_offset;
                existing.previous_before = page.previous_before;
            } else {
                ensure!(
                    page.next_offset > existing.next_offset || !page.has_more,
                    "The message cursor did not advance"
                );
                for row in page.messages {
                    if let Some(previous) = existing
                        .messages
                        .iter_mut()
                        .find(|previous| previous.id == row.id)
                    {
                        *previous = row;
                    } else {
                        existing.messages.push(row);
                    }
                }
                existing.has_more = page.has_more;
                existing.next_offset = page.next_offset;
            }
            existing.conversation = page.conversation;
        } else {
            self.windowed = false;
            self.detail = Some(page);
        }
        if let Some(detail) = &mut self.detail {
            let mut bytes = detail
                .messages
                .iter()
                .map(|row| serde_json::to_vec(row).map_or(usize::MAX, |bytes| bytes.len()))
                .fold(0usize, usize::saturating_add);
            let mut remove = 0;
            while bytes > self.max_bytes && remove + 1 < detail.messages.len() {
                let index = if prepend {
                    detail.messages.len() - remove - 1
                } else {
                    remove
                };
                bytes = bytes.saturating_sub(serde_json::to_vec(&detail.messages[index])?.len());
                remove += 1;
            }
            if remove > 0 {
                if prepend {
                    detail.messages.truncate(detail.messages.len() - remove);
                    detail.next_offset = detail.next_offset.saturating_sub(remove as u32);
                } else {
                    detail.messages.drain(..remove);
                    detail.start_offset = detail.start_offset.saturating_add(remove as u32);
                    if detail.previous_before.is_some() {
                        detail.previous_before = Some(detail.start_offset);
                    }
                }
                self.windowed = true;
            }
        }
        let saved_turn = self
            .pending_turn
            .as_ref()
            .zip(self.turn.as_ref())
            .is_some_and(|(pending, turn)| {
                turn.accepted
                    && !turn.needs_attention()
                    && self.detail.as_ref().is_some_and(|detail| {
                        detail.scope == pending.scope
                            && detail.conversation.id == pending.conversation_id
                            && detail.messages.iter().any(|message| {
                                message.id == pending.request_id && message.role == "assistant"
                                    || turn.state.is_terminal()
                                        && turn.output.is_empty()
                                        && message.id == pending.user_message_id
                                        && message.role == "user"
                            })
                    })
            });
        if saved_turn {
            self.clear_turn();
        }
        Ok(())
    }
}
