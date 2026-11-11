use agiworkforce_protocol::account_cloud::*;
use anyhow::{ensure, Result};

#[derive(Default)]
pub struct Workspaces {
    pub scope: Option<String>,
    pub choices: Vec<CloudWorkspaceSummary>,
    pub selected: Option<CloudWorkspaceSummary>,
    pub operation: Option<uuid::Uuid>,
    pub requested: Option<String>,
    pub uncertain: bool,
    pub initialized: bool,
    pub revision: uuid::Uuid,
    pub error: Option<String>,
    pub pending_load: bool,
    pub pending_new: Option<bool>,
}

impl Workspaces {
    pub fn selector(&self) -> Option<&CloudConversationWorkspace> {
        (!self.uncertain)
            .then_some(self.selected.as_ref())
            .flatten()
            .map(|selected| &selected.selector)
    }

    pub fn accept_list(&mut self, response: CloudWorkspacesListResponse) -> Result<bool> {
        ensure!(
            self.scope
                .as_ref()
                .is_none_or(|scope| *scope == response.scope),
            "The workspace list belongs to another account"
        );
        ensure!(
            response
                .workspaces
                .iter()
                .any(|choice| choice == &response.selected),
            "The active workspace is not a listed membership"
        );
        let mut ids = std::collections::HashSet::new();
        ensure!(
            response
                .workspaces
                .iter()
                .all(|choice| !choice.id.trim().is_empty()
                    && !choice.name.trim().is_empty()
                    && match &choice.selector {
                        CloudConversationWorkspace::Personal => true,
                        CloudConversationWorkspace::Organization { id } =>
                            uuid::Uuid::parse_str(id).is_ok(),
                    }
                    && ids.insert(&choice.id)),
            "The workspace choices are invalid or duplicated"
        );
        let previous = self.selected.clone();
        let selected = if !self.initialized
            || self.uncertain && self.requested.as_ref() == Some(&response.selected.id)
        {
            Some(response.selected.clone())
        } else {
            self.selected
                .as_ref()
                .and_then(|selected| {
                    response.workspaces.iter().find(|choice| {
                        choice.id == selected.id && choice.selector == selected.selector
                    })
                })
                .cloned()
        };
        self.error = selected.is_none().then(|| {
            "This workspace is no longer available. Choose another workspace to continue.".into()
        });
        self.scope = Some(response.scope);
        self.choices = response.workspaces;
        self.selected = selected;
        self.uncertain = false;
        self.requested = None;
        self.initialized = true;
        self.revision = uuid::Uuid::new_v4();
        Ok(previous
            .as_ref()
            .map(|choice| (&choice.id, &choice.selector))
            != self
                .selected
                .as_ref()
                .map(|choice| (&choice.id, &choice.selector)))
    }

    pub fn accept_selection(&mut self, response: CloudWorkspaceSelectResponse) -> Result<()> {
        ensure!(
            self.scope.as_ref() == Some(&response.scope)
                && self.requested.as_ref() == Some(&response.selected.id),
            "The confirmed workspace differs from the requested account or choice"
        );
        ensure!(
            self.choices
                .iter()
                .any(|choice| choice.id == response.selected.id
                    && choice.selector == response.selected.selector),
            "The confirmed workspace was not an available choice"
        );
        if let Some(choice) = self
            .choices
            .iter_mut()
            .find(|choice| choice.id == response.selected.id)
        {
            *choice = response.selected.clone();
        }
        self.revision = uuid::Uuid::new_v4();
        self.selected = Some(response.selected);
        self.requested = None;
        self.uncertain = false;
        self.error = None;
        Ok(())
    }
}

impl Workspaces {
    pub fn is_selecting(&self) -> bool {
        self.operation.is_some() && self.requested.is_some()
    }
}
