use agiworkforce_protocol::account_cloud::{
    CloudConversationDraft, CloudConversationWorkspace, CloudDraftSaveOutcome,
    CloudDraftSaveParams, CloudDraftSaveResponse,
};
use anyhow::{ensure, Context as _, Result};

#[derive(Clone, PartialEq, Eq)]
pub struct DraftTarget {
    pub scope: String,
    pub workspace: CloudConversationWorkspace,
    pub conversation_id: String,
}

#[derive(Clone)]
pub struct DraftJob {
    pub id: uuid::Uuid,
    pub request: CloudDraftSaveParams,
}

#[derive(Default)]
pub struct DraftState {
    pub target: Option<DraftTarget>,
    pub saved: Option<CloudConversationDraft>,
    observed: Option<CloudConversationDraft>,
    pub text: String,
    pub operation: Option<DraftJob>,
    pub conflict: Option<CloudConversationDraft>,
    pub error: Option<String>,
}

fn clock(
    draft: Option<&CloudConversationDraft>,
) -> Result<Option<chrono::DateTime<chrono::FixedOffset>>> {
    draft
        .and_then(|draft| draft.revision.as_deref())
        .map(chrono::DateTime::parse_from_rfc3339)
        .transpose()
        .context("The saved draft revision is invalid")
}

impl DraftState {
    pub fn dirty(&self) -> bool {
        self.saved
            .as_ref()
            .map_or(!self.text.is_empty(), |saved| saved.text != self.text)
            || self.operation.is_some()
            || self.conflict.is_some()
    }

    pub fn observe(
        &mut self,
        target: DraftTarget,
        incoming: Option<CloudConversationDraft>,
    ) -> Result<Option<String>> {
        let incoming_clock = clock(incoming.as_ref())?;
        if self.target.as_ref() != Some(&target) {
            ensure!(
                !self.dirty(),
                "Save or resolve the current draft before opening another conversation"
            );
            *self = Self {
                target: Some(target),
                text: incoming
                    .as_ref()
                    .map(|draft| draft.text.clone())
                    .unwrap_or_default(),
                saved: incoming.clone(),
                observed: incoming,
                ..Default::default()
            };
            return Ok(Some(self.text.clone()));
        }
        if self.observed == incoming {
            return Ok(None);
        }
        self.observed = incoming.clone();
        if incoming.is_none() {
            self.saved = None;
            self.error = Some("Draft saving is unavailable for this conversation. Your text is retained; keep a copy before leaving.".into());
            return Ok(None);
        }
        if clock(self.saved.as_ref())?
            .is_some_and(|saved| incoming_clock.is_none_or(|incoming| incoming < saved))
        {
            return Ok(None);
        }
        if self.saved == incoming {
            return Ok(None);
        }
        if self.dirty() {
            if self.operation.is_none()
                && incoming
                    .as_ref()
                    .is_some_and(|draft| draft.text == self.text)
            {
                self.saved = incoming;
                self.conflict = None;
                self.error = None;
                return Ok(None);
            }
            self.conflict = incoming;
            return Ok(None);
        }
        self.text = incoming
            .as_ref()
            .map(|draft| draft.text.clone())
            .unwrap_or_default();
        self.saved = incoming;
        self.error = None;
        Ok(Some(self.text.clone()))
    }

    pub fn edit(&mut self, text: String) {
        if self.text != text {
            self.text = text;
            self.error = None;
        }
    }

    pub fn begin(&mut self, max_length: usize) -> Result<Option<DraftJob>> {
        if self.operation.is_some() || self.conflict.is_some() || !self.dirty() {
            return Ok(None);
        }
        let target = self
            .target
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("Reload the conversation before saving its draft"))?;
        let saved = self.saved.as_ref().ok_or_else(|| {
            anyhow::anyhow!(
                "Draft saving is unavailable for this conversation. Keep a copy before leaving."
            )
        })?;
        ensure!(
            self.text.encode_utf16().count() <= max_length,
            "This draft exceeds the account draft limit. Copy it before shortening it."
        );
        let job = DraftJob {
            id: uuid::Uuid::new_v4(),
            request: CloudDraftSaveParams {
                scope: target.scope.clone(),
                workspace: target.workspace.clone(),
                conversation_id: target.conversation_id.clone(),
                draft: CloudConversationDraft {
                    text: self.text.clone(),
                    revision: saved.revision.clone(),
                },
            },
        };
        self.operation = Some(job.clone());
        self.error = None;
        Ok(Some(job))
    }

    pub fn finish(&mut self, job: &DraftJob, response: CloudDraftSaveResponse) -> Result<()> {
        ensure!(
            self.operation
                .as_ref()
                .is_some_and(|current| current.id == job.id),
            "The draft save operation changed"
        );
        ensure!(
            response.scope == job.request.scope
                && response.workspace == job.request.workspace
                && response.conversation_id == job.request.conversation_id,
            "The saved draft belongs to a different conversation or workspace"
        );
        self.operation = None;
        match response.outcome {
            CloudDraftSaveOutcome::Saved { revision } => {
                self.saved = Some(CloudConversationDraft {
                    text: job.request.draft.text.clone(),
                    revision,
                });
                self.conflict = None;
                self.error = None;
            }
            CloudDraftSaveOutcome::Conflict { current } => {
                self.conflict = Some(current);
            }
        }
        Ok(())
    }

    pub fn fail(&mut self, job: &DraftJob, message: String) {
        if self
            .operation
            .as_ref()
            .is_some_and(|current| current.id == job.id)
        {
            self.operation = None;
            self.error = Some(message);
        }
    }

    pub fn resolve(
        &mut self,
        reviewed: &CloudConversationDraft,
        keep_mine: bool,
    ) -> Result<String> {
        ensure!(
            self.operation.is_none() && self.conflict.as_ref() == Some(reviewed),
            "The draft changed while it was being reviewed. Review it again."
        );
        if !keep_mine {
            self.text = reviewed.text.clone();
        }
        self.saved = Some(reviewed.clone());
        self.conflict = None;
        self.error = None;
        Ok(self.text.clone())
    }
}
