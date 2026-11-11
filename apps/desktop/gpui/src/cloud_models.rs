use agiworkforce_protocol::account_cloud::{CloudModelListResponse, CloudModelSummary};
use anyhow::{ensure, Result};

#[derive(Default)]
pub struct CloudModelPicker {
    pub loading: bool,
    pub request: uuid::Uuid,
    pub scope: String,
    pub conversation_id: String,
    pub models: Vec<CloudModelSummary>,
    pub plan_label: String,
    pub error: Option<String>,
}

impl CloudModelPicker {
    pub fn begin(&mut self, scope: &str, conversation_id: &str) -> uuid::Uuid {
        if self.scope != scope || self.conversation_id != conversation_id {
            *self = Self::default();
        }
        self.scope = scope.into();
        self.conversation_id = conversation_id.into();
        self.request = uuid::Uuid::new_v4();
        self.loading = true;
        self.error = None;
        self.request
    }

    pub fn accept(&mut self, request: uuid::Uuid, response: CloudModelListResponse) -> Result<()> {
        ensure!(
            request == self.request && response.scope == self.scope,
            "The model picker changed account or request"
        );
        let mut seen = std::collections::HashSet::new();
        ensure!(
            response
                .models
                .iter()
                .all(|model| !model.id.trim().is_empty()
                    && !model.display_name.trim().is_empty()
                    && seen.insert(&model.id)),
            "The model catalogue contains invalid or duplicate entries"
        );
        self.models = response.models;
        self.plan_label = response.plan_label;
        self.loading = false;
        Ok(())
    }

    pub fn validate_choice(
        &self,
        request: uuid::Uuid,
        scope: &str,
        conversation_id: &str,
        id: &str,
    ) -> Result<()> {
        ensure!(
            !self.loading
                && self.error.is_none()
                && request == self.request
                && scope == self.scope
                && conversation_id == self.conversation_id,
            "Reload the model picker before choosing a model"
        );
        ensure!(
            self.models
                .iter()
                .any(|model| model.id == id && model.selectable()),
            "That model is not available for this account"
        );
        Ok(())
    }
}
